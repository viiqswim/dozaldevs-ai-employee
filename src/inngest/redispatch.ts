import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import type { SlackClient } from '../lib/slack-client.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('redispatch');

const TOTAL_BUDGET_MS = 8 * 60 * 60 * 1000;

export function createRedispatchFunction(
  inngest: Inngest,
  prisma: PrismaClient,
  slackClient: SlackClient,
): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'engineering/task-redispatch',
      triggers: [{ event: 'engineering/task.redispatch' }],
    },
    async ({ event, step }) => {
      const taskId = event.data.taskId as string;
      const attempt = event.data.attempt as number;
      const repoUrl = event.data.repoUrl as string | undefined;
      const repoBranch = event.data.repoBranch as string | undefined;

      const task = await step.run('fetch-task', async () => {
        return prisma.task.findUnique({
          where: { id: taskId },
          select: { created_at: true, dispatch_attempts: true, status: true },
        });
      });

      if (!task) {
        logger.warn({ taskId }, 'Task not found during redispatch, skipping');
        return;
      }

      if (task.dispatch_attempts >= 3) {
        logger.warn(
          { taskId, dispatch_attempts: task.dispatch_attempts },
          'Max dispatch attempts exceeded',
        );
        await step.run('handle-max-attempts', async () => {
          await prisma.task.update({
            where: { id: taskId },
            data: {
              status: 'AwaitingInput',
              failure_reason: 'Max dispatch attempts (3) exceeded',
              updated_at: new Date(),
            },
          });
          await slackClient.postMessage({
            text: `Task ${taskId} has exceeded the maximum dispatch attempts (3). Manual intervention required.`,
          });
        });
        return;
      }

      const elapsedMs = Date.now() - new Date(task.created_at).getTime();

      if (elapsedMs > TOTAL_BUDGET_MS) {
        const elapsedHours = (elapsedMs / (1000 * 60 * 60)).toFixed(1);
        logger.warn(
          { taskId, elapsedHours, dispatch_attempts: task.dispatch_attempts },
          '8-hour budget exceeded',
        );
        await step.run('handle-budget-exceeded', async () => {
          await prisma.task.update({
            where: { id: taskId },
            data: {
              status: 'AwaitingInput',
              failure_reason: `Total timeout budget (8h) exceeded after ${task.dispatch_attempts} dispatch attempts`,
              updated_at: new Date(),
            },
          });
          await slackClient.postMessage({
            text: `Task ${taskId} has exceeded the 8-hour total budget after ${task.dispatch_attempts} dispatch attempts. Manual intervention required.`,
          });
        });
        return;
      }

      const resumeFromWave = await step.run('fetch-wave-number', async () => {
        const exec = await prisma.execution.findFirst({
          where: { task_id: taskId },
          select: { waveNumber: true },
          orderBy: { created_at: 'desc' },
        });
        return exec?.waveNumber ?? null;
      });

      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      logger.info({ taskId, attempt, elapsedHours, resumeFromWave }, 'Re-dispatching task');
      await step.sendEvent('restart-lifecycle', {
        name: 'engineering/task.received',
        data: { taskId, attempt, repoUrl, repoBranch, resumeFromWave },
      });
    },
  );
}
