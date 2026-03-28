import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';

export function createRedispatchFunction(
  inngest: Inngest,
  prisma: PrismaClient,
): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'engineering/task-redispatch',
      triggers: [{ event: 'engineering/task.redispatch' }],
    },
    async ({ event, step }) => {
      const taskId = event.data.taskId as string;
      const attempt = event.data.attempt as number;

      // TODO Phase 5: Implement elapsed time check using task.created_at (6-hour total budget)
      void prisma; // will be used in Phase 5 for elapsed time check

      await step.sendEvent('restart-lifecycle', {
        name: 'engineering/task.received',
        data: { taskId, attempt },
      });
    },
  );
}
