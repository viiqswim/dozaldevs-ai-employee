import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import type { SlackClient } from '../lib/slack-client.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('redispatch');

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
      const elapsedHours = elapsedMs / (1000 * 60 * 60);

      if (elapsedHours > 6) {
        logger.warn(
          { taskId, elapsedHours, dispatch_attempts: task.dispatch_attempts },
          '6-hour budget exceeded',
        );
        await step.run('handle-budget-exceeded', async () => {
          await prisma.task.update({
            where: { id: taskId },
            data: {
              status: 'AwaitingInput',
              failure_reason: `Total timeout budget (6h) exceeded after ${task.dispatch_attempts} dispatch attempts`,
              updated_at: new Date(),
            },
          });
          await slackClient.postMessage({
            text: `Task ${taskId} has exceeded the 6-hour total budget after ${task.dispatch_attempts} dispatch attempts. Manual intervention required.`,
          });
        });
        return;
      }

      logger.info({ taskId, attempt, elapsedHours }, 'Re-dispatching task');
      await step.sendEvent('restart-lifecycle', {
        name: 'engineering/task.received',
        data: { taskId, attempt, repoUrl, repoBranch },
      });
    },
  );
}
