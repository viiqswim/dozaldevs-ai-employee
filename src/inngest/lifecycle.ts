import { Inngest, NonRetriableError } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';

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

      const machine = await step.run('dispatch-fly-machine', async () => {
        // TODO Phase 5: Replace with real Fly.io machine dispatch via flyApi.createMachine()
        return { id: 'placeholder-machine-id' };
      });

      const result = await step.waitForEvent('wait-for-completion', {
        event: 'engineering/task.completed',
        timeout: '4h10m',
        if: `async.data.taskId == '${taskId}'`,
      });

      await step.run('finalize', async () => {
        if (result === null) {
          // TODO Phase 5: await flyApi.destroyMachine(machine.id).catch(() => {})
          void machine; // suppress unused variable warning until Phase 5

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
          // TODO Phase 6: Machine sends task.completed event with status and PR URL
          // TODO Phase 5: await flyApi.destroyMachine(machine.id).catch(() => {})
          const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: { status: true },
          });
          if (task?.status !== 'Done') {
            await prisma.task.updateMany({
              where: { id: taskId },
              data: { status: 'Done', updated_at: new Date() },
            });
          }
        }
      });
    },
  );
}
