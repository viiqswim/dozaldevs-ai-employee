import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger.js';
import type { SlackClient } from '../lib/slack-client.js';
import type { FlyMachine } from '../lib/fly-client.js';

const log = createLogger('watchdog');

const TERMINAL_STATES = ['Done', 'Cancelled', 'Stale'] as const;

export interface FlyClient {
  getMachine(appName: string, machineId: string): Promise<FlyMachine | null>;
  destroyMachine(appName: string, machineId: string): Promise<void>;
  createMachine(appName: string, config: unknown): Promise<FlyMachine>;
}

export interface WatchdogResult {
  staleMachinesDetected: number;
  submittingRecovered: number;
  escalated: number;
}

export async function runWatchdog(
  prisma: PrismaClient,
  flyClient: FlyClient,
  inngest: Pick<Inngest, 'send'>,
  slackClient: SlackClient,
): Promise<WatchdogResult> {
  const results: WatchdogResult = {
    staleMachinesDetected: 0,
    submittingRecovered: 0,
    escalated: 0,
  };
  const flyWorkerApp = process.env.FLY_WORKER_APP ?? '';

  // 20min threshold: accommodates wave transition pauses (install re-run, session creation).
  // Do NOT exceed 20min — real hangs need detection.
  const staleThreshold = new Date(Date.now() - 20 * 60 * 1000);

  const staleExecutions = await prisma.execution.findMany({
    where: {
      heartbeat_at: { lt: staleThreshold },
      task: { status: 'Executing' },
    },
    include: {
      task: {
        select: { id: true, dispatch_attempts: true, status: true },
      },
    },
  });

  for (const exec of staleExecutions) {
    const task = exec.task;

    if (!task || (TERMINAL_STATES as readonly string[]).includes(task.status)) continue;

    const machineId = exec.runtime_id;
    if (!machineId || !flyWorkerApp) continue;

    let machine: FlyMachine | null = null;
    try {
      machine = await flyClient.getMachine(flyWorkerApp, machineId);
    } catch {
      // Non-404 error — treat machine as alive and skip to avoid false recovery
      log.warn({ taskId: task.id, machineId }, 'Watchdog: getMachine threw unexpectedly, skipping');
      continue;
    }

    if (machine !== null && machine.state === 'started') {
      continue;
    }

    results.staleMachinesDetected++;
    const attempts = task.dispatch_attempts ?? 0;

    if (attempts >= 3) {
      await prisma.task.updateMany({
        where: { id: task.id },
        data: {
          status: 'AwaitingInput',
          failure_reason: 'Max dispatch attempts (3) exceeded',
          updated_at: new Date(),
        },
      });
      await prisma.taskStatusLog.create({
        data: {
          task_id: task.id,
          from_status: 'Executing',
          to_status: 'AwaitingInput',
          actor: 'watchdog',
        },
      });
      await slackClient
        .postMessage({
          text: `Task ${task.id} escalated: max dispatch attempts (3) exceeded. Manual intervention required.`,
        })
        .catch((err) => {
          log.warn({ taskId: task.id, error: err }, 'Watchdog: Slack postMessage failed');
        });
      results.escalated++;
      log.warn({ taskId: task.id, attempts }, 'Watchdog escalated task to AwaitingInput');
    } else {
      await prisma.task.updateMany({
        where: { id: task.id },
        data: {
          status: 'Ready',
          dispatch_attempts: attempts + 1,
          updated_at: new Date(),
        },
      });
      await prisma.taskStatusLog.create({
        data: {
          task_id: task.id,
          from_status: 'Executing',
          to_status: 'Ready',
          actor: 'watchdog',
        },
      });
      log.info({ taskId: task.id, attempt: attempts + 1 }, 'Watchdog re-queued stale task');
    }
  }

  // Machine cleanup threshold is 9h. MUST be greater than total orchestrate budget (8h).
  // Changing this can silently kill long-running tasks.
  // See Metis review in .sisyphus/plans/long-running-session-overhaul.md
  const nineHoursAgo = new Date(Date.now() - 9 * 60 * 60 * 1000);

  const longRunningExecutions = await prisma.execution.findMany({
    where: {
      created_at: { lt: nineHoursAgo },
      runtime_id: { not: null },
    },
  });

  for (const exec of longRunningExecutions) {
    if (exec.runtime_id && flyWorkerApp) {
      // 404 on destroyMachine is already handled as success inside destroyMachine()
      await flyClient.destroyMachine(flyWorkerApp, exec.runtime_id).catch((err) => {
        log.warn(
          { executionId: exec.id, machineId: exec.runtime_id, error: err },
          'Watchdog: destroyMachine failed',
        );
      });
      log.info(
        { executionId: exec.id, machineId: exec.runtime_id },
        'Watchdog destroyed 9h+ machine',
      );
    }
  }

  const submittingThreshold = new Date(Date.now() - 15 * 60 * 1000);

  const stuckSubmitting = await prisma.task.findMany({
    where: {
      status: 'Submitting',
      updated_at: { lt: submittingThreshold },
    },
    include: {
      executions: {
        orderBy: { created_at: 'desc' },
        take: 1,
      },
    },
  });

  for (const task of stuckSubmitting) {
    const exec = task.executions[0];
    if (!exec) continue;

    // Emit completion event using the same deterministic ID pattern as the worker
    const eventId = `task-${task.id}-completion-${exec.id}`;
    try {
      await inngest.send({
        id: eventId,
        name: 'engineering/task.completed',
        data: { taskId: task.id, executionId: exec.id, prUrl: null },
      });
      results.submittingRecovered++;
      log.info(
        { taskId: task.id, executionId: exec.id, eventId },
        'Watchdog emitted completion for stuck Submitting task',
      );
    } catch (err) {
      log.warn(
        { taskId: task.id, executionId: exec.id, error: err },
        'Watchdog failed to emit completion event',
      );
    }
  }

  return results;
}

export function createWatchdogFunction(
  inngest: Inngest,
  prisma: PrismaClient,
  flyClient: FlyClient,
  slackClient: SlackClient,
): InngestFunction.Any {
  return inngest.createFunction(
    { id: 'engineering/watchdog-cron', triggers: [{ cron: '*/10 * * * *' }] },
    async () => {
      const results = await runWatchdog(prisma, flyClient, inngest, slackClient);
      log.info(results, 'Watchdog run complete');
      return results;
    },
  );
}
