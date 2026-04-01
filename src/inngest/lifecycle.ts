import { Inngest, NonRetriableError } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { createMachine, destroyMachine } from '../lib/fly-client.js';

export function createLifecycleFunction(
  inngest: Inngest,
  prisma: PrismaClient,
): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'engineering/task-lifecycle',
      triggers: [{ event: 'engineering/task.received' }],
      concurrency: [{ limit: 3, key: 'event.data.projectId', scope: 'fn' }],
    },
    async ({ event, step }) => {
      const taskId = event.data.taskId as string;
      // projectId is available as event.data.projectId for concurrency key — no need to extract explicitly

      await step.run('update-status-executing', async () => {
        const result = await prisma.task.updateMany({
          where: { id: taskId, status: 'Ready' },
          data: { status: 'Executing', updated_at: new Date() },
        });
        if (result.count === 0) {
          throw new NonRetriableError(
            `Task ${taskId} optimistic lock failed: expected status Ready, task may have been modified by concurrent writer or does not exist`,
          );
        }
        await prisma.taskStatusLog.create({
          data: {
            task_id: taskId,
            from_status: 'Ready',
            to_status: 'Executing',
            actor: 'lifecycle_fn',
          },
        });
      });

      const isCancelled = await step.run('check-cancellation', async () => {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { status: true },
        });
        return task?.status === 'Cancelled';
      });
      if (isCancelled) return;

      const costCheckPassed = await step.run('check-cost-gate', async () => {
        const limitUsd = parseFloat(process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY ?? '') || 50;
        const rows = await prisma.$queryRaw<Array<{ total: number | string | null }>>`
          SELECT COALESCE(SUM(estimated_cost_usd), 0) as total
          FROM executions
          WHERE created_at > NOW() - INTERVAL '1 day'
        `;
        const currentSpend = parseFloat(String(rows[0]?.total ?? 0));

        if (currentSpend > limitUsd) {
          await prisma.task.updateMany({
            where: { id: taskId },
            data: {
              status: 'AwaitingInput',
              failure_reason: `Daily cost limit ($${limitUsd.toFixed(2)}) exceeded. Current spend: $${currentSpend.toFixed(2)}. Task paused until cost window resets or limit is increased.`,
              updated_at: new Date(),
            },
          });
          await prisma.taskStatusLog.create({
            data: {
              task_id: taskId,
              from_status: 'Executing',
              to_status: 'AwaitingInput',
              actor: 'lifecycle_fn',
            },
          });
          return false;
        }
        return true;
      });
      if (!costCheckPassed) return;

      const machine = await step.run('dispatch-fly-machine', async () => {
        const flyApiToken = process.env.FLY_API_TOKEN;
        const flyWorkerApp = process.env.FLY_WORKER_APP;
        const flyWorkerImage =
          process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';

        if (!flyApiToken || !flyWorkerApp) {
          await prisma.task.updateMany({
            where: { id: taskId },
            data: {
              status: 'AwaitingInput',
              failure_reason:
                'Fly.io dispatch misconfigured: FLY_API_TOKEN and FLY_WORKER_APP must be set',
              updated_at: new Date(),
            },
          });
          await prisma.taskStatusLog.create({
            data: {
              task_id: taskId,
              from_status: 'Executing',
              to_status: 'AwaitingInput',
              actor: 'lifecycle_fn',
            },
          });
          throw new NonRetriableError('FLY_API_TOKEN and FLY_WORKER_APP not configured');
        }

        const { repoUrl, repoBranch } = event.data as {
          repoUrl: string;
          repoBranch: string;
          projectId: string;
        };

        const flyMachine = await createMachine(flyWorkerApp, {
          image: flyWorkerImage,
          vm_size: 'performance-2x',
          auto_destroy: true,
          env: {
            TASK_ID: taskId,
            REPO_URL: repoUrl ?? '',
            REPO_BRANCH: repoBranch ?? 'main',
            SUPABASE_URL: process.env.SUPABASE_URL ?? '',
            SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? '',
            GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '',
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
          },
        });

        await prisma.execution.updateMany({
          where: { task_id: taskId },
          data: {
            runtime_id: flyMachine.id,
          },
        });

        return flyMachine;
      });

      // Pre-check Supabase before waitForEvent to mitigate Inngest #1433 race condition.
      // If the machine completed and wrote its status to Supabase BEFORE this step starts
      // listening for the event, the event may have already been sent and missed.
      // NOTE: This is a best-effort mitigation — a TOCTOU race window still exists between
      // this read and the waitForEvent setup. Inngest's upcoming "event lookback" feature
      // is the proper long-term fix.
      const preCheckStatus = await step.run('pre-check-completion', async () => {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { status: true, triage_result: true },
        });
        return task?.status ?? null;
      });

      if (preCheckStatus === 'Done' || preCheckStatus === 'Cancelled') {
        return;
      }

      type CompletionResult = { data: Record<string, unknown> } | null;
      let result: CompletionResult;

      if (preCheckStatus === 'Submitting') {
        // Machine completed and wrote Submitting status before we started listening.
        // Synthesize the completion result to proceed to finalize.
        const execution = await step.run('get-execution-for-completion', async () => {
          const exec = await prisma.execution.findFirst({
            where: { task_id: taskId },
            select: { id: true },
            orderBy: { created_at: 'desc' },
          });
          return exec;
        });
        result = { data: { taskId, executionId: execution?.id, prUrl: null } };
      } else {
        result = await step.waitForEvent('wait-for-completion', {
          event: 'engineering/task.completed',
          timeout: '4h10m',
          if: `async.data.taskId == '${taskId}'`,
        });
      }

      await step.run('finalize', async () => {
        if (result === null) {
          // Cleanup attempt (machine may have already self-destructed — handle 404 as success)
          const flyWorkerApp = process.env.FLY_WORKER_APP ?? '';
          if (flyWorkerApp) {
            await destroyMachine(flyWorkerApp, machine.id).catch(() => {});
          }

          const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { dispatch_attempts: true },
          });
          const attempts = task?.dispatch_attempts ?? 0;

          if (attempts < 3) {
            await prisma.task.updateMany({
              where: { id: taskId },
              data: {
                dispatch_attempts: attempts + 1,
                status: 'Ready',
                updated_at: new Date(),
              },
            });
            await prisma.taskStatusLog.create({
              data: {
                task_id: taskId,
                from_status: 'Executing',
                to_status: 'Ready',
                actor: 'lifecycle_fn',
              },
            });
            await inngest.send({
              name: 'engineering/task.redispatch',
              data: { taskId, attempt: attempts + 1, reason: 'timeout' },
            });
          } else {
            await prisma.task.updateMany({
              where: { id: taskId },
              data: {
                status: 'AwaitingInput',
                failure_reason: `Exhausted ${attempts} re-dispatch attempts`,
                updated_at: new Date(),
              },
            });
            await prisma.taskStatusLog.create({
              data: {
                task_id: taskId,
                from_status: 'Executing',
                to_status: 'AwaitingInput',
                actor: 'lifecycle_fn',
              },
            });
            // TODO Phase 7: Replace with real Slack client
            console.warn(
              `[SLACK STUB] Task ${taskId} failed after ${attempts} attempts. Manual intervention required.`,
            );
          }
        } else {
          const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { status: true },
          });

          if (task?.status === 'Done' || task?.status === 'Cancelled') return;

          const completionExecutionId = result.data.executionId as string | undefined;
          const prUrl = result.data.prUrl as string | null | undefined;

          if (completionExecutionId) {
            await prisma.deliverable
              .create({
                data: {
                  execution_id: completionExecutionId,
                  delivery_type: prUrl ? 'pull_request' : 'no_changes',
                  external_ref: prUrl ?? null,
                  status: 'submitted',
                },
              })
              .catch(() => {
                /* Non-fatal — deliverable may already exist on re-delivery */
              });
          }

          const updated = await prisma.task.updateMany({
            where: { id: taskId, status: 'Submitting' },
            data: { status: 'Done', updated_at: new Date() },
          });

          if (updated.count === 0 && task?.status !== 'Done') {
            await prisma.task.updateMany({
              where: { id: taskId },
              data: { status: 'Done', updated_at: new Date() },
            });
          }

          await prisma.taskStatusLog.create({
            data: {
              task_id: taskId,
              from_status: task?.status ?? 'Executing',
              to_status: 'Done',
              actor: 'lifecycle_fn',
            },
          });

          // Cleanup attempt (machine may have already self-destructed — handle 404 as success)
          const flyWorkerApp = process.env.FLY_WORKER_APP ?? '';
          if (flyWorkerApp) {
            await destroyMachine(flyWorkerApp, machine.id).catch(() => {});
          }
        }
      });
    },
  );
}
