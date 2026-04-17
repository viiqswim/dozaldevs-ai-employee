import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { FeedbackService } from '../gateway/services/feedback-service.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('feedback-handler');

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export function createFeedbackHandlerFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    { id: 'employee/feedback-handler', triggers: [{ event: 'employee/feedback.received' }] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ event, step }: { event: any; step: any }) => {
      const { taskId, feedbackText, userId, threadTs, channelId } = event.data as {
        taskId: string;
        feedbackText: string;
        userId: string;
        threadTs: string;
        channelId: string;
      };

      await step.run('ingest-feedback', async () => {
        const prisma = new PrismaClient();
        const feedbackService = new FeedbackService(prisma);

        const supabaseUrl = process.env.SUPABASE_URL ?? '';
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

        let tenantId = SYSTEM_TENANT_ID;
        if (supabaseUrl && supabaseKey) {
          try {
            const res = await fetch(
              `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=tenant_id&limit=1`,
              {
                headers: {
                  apikey: supabaseKey,
                  Authorization: `Bearer ${supabaseKey}`,
                },
              },
            );
            const rows = (await res.json()) as Array<{ tenant_id: string }>;
            if (rows[0]?.tenant_id) tenantId = rows[0].tenant_id;
          } catch (err) {
            log.warn({ taskId, err }, 'Failed to resolve tenant_id for feedback — using default');
          }
        }

        await feedbackService.ingestThreadReply({
          taskId,
          feedbackText,
          userId,
          threadTs,
          channelId,
          tenantId,
        });

        await prisma.$disconnect();
      });

      await step.sendEvent('emit-feedback-stored', {
        name: 'employee/feedback.stored',
        data: { taskId, feedbackText, userId, threadTs, channelId },
      });

      log.info({ taskId }, 'Feedback ingested and stored event emitted');
    },
  );
}
