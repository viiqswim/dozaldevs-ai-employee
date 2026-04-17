import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { MentionHandler } from '../gateway/services/mention-handler.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('mention-handler-fn');

export function createMentionHandlerFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    { id: 'employee/mention-handler', triggers: [{ event: 'employee/mention.received' }] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ event, step }: { event: any; step: any }) => {
      const { text, userId, channelId, threadTs, tenantId } = event.data as {
        text: string;
        userId: string;
        channelId: string;
        threadTs?: string;
        tenantId: string | null;
      };

      const result = await step.run('classify-and-handle-mention', async () => {
        const prisma = new PrismaClient();
        const handler = new MentionHandler(prisma);
        const outcome = await handler.handle({ text, userId, channelId, threadTs, tenantId });
        await prisma.$disconnect();
        return outcome;
      });

      log.info({ userId, intent: result.intent, stored: result.stored }, 'Mention handled');
    },
  );
}
