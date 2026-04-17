import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { loadTenantEnv } from '../gateway/services/tenant-env-loader.js';
import { TenantRepository } from '../gateway/services/tenant-repository.js';
import { TenantSecretRepository } from '../gateway/services/tenant-secret-repository.js';
import { PrismaClient } from '@prisma/client';
import { callLLM } from '../lib/call-llm.js';
import { createSlackClient } from '../lib/slack-client.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('feedback-responder');

export function createFeedbackResponderFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    { id: 'employee/feedback-responder', triggers: [{ event: 'employee/feedback.stored' }] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ event, step }: { event: any; step: any }) => {
      const { taskId, feedbackText, userId, threadTs, channelId } = event.data as {
        taskId: string;
        feedbackText: string;
        userId: string;
        threadTs: string;
        channelId: string;
      };

      await step.run('generate-and-post-acknowledgment', async () => {
        const supabaseUrl = process.env.SUPABASE_URL ?? '';
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

        let tenantId = '00000000-0000-0000-0000-000000000001';
        let roleDescription = 'AI Employee';

        if (supabaseUrl && supabaseKey) {
          try {
            const taskRes = await fetch(
              `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=tenant_id,archetype_id&limit=1`,
              {
                headers: {
                  apikey: supabaseKey,
                  Authorization: `Bearer ${supabaseKey}`,
                },
              },
            );
            const tasks = (await taskRes.json()) as Array<{
              tenant_id: string;
              archetype_id: string | null;
            }>;
            if (tasks[0]) {
              tenantId = tasks[0].tenant_id;
              if (tasks[0].archetype_id) {
                const archRes = await fetch(
                  `${supabaseUrl}/rest/v1/archetypes?id=eq.${tasks[0].archetype_id}&select=role_name&limit=1`,
                  {
                    headers: {
                      apikey: supabaseKey,
                      Authorization: `Bearer ${supabaseKey}`,
                    },
                  },
                );
                const archetypes = (await archRes.json()) as Array<{ role_name: string | null }>;
                roleDescription = archetypes[0]?.role_name ?? roleDescription;
              }
            }
          } catch (err) {
            log.warn({ taskId, err }, 'Failed to load task/archetype for feedback response');
          }
        }

        const prisma = new PrismaClient();
        const tenantRepo = new TenantRepository(prisma);
        const secretRepo = new TenantSecretRepository(prisma);
        const tenantEnv = await loadTenantEnv(tenantId, { tenantRepo, secretRepo });
        await prisma.$disconnect();

        const llmResult = await callLLM({
          model: 'anthropic/claude-haiku-4-5',
          taskType: 'review',
          taskId,
          messages: [
            {
              role: 'system',
              content: `You are ${roleDescription}. A human has given you feedback on your work. Respond naturally in character. If the feedback is clear, acknowledge it warmly. If it's unclear, ask ONE specific clarifying question. Keep your response under 2 sentences. Respond in the same language as the feedback.`,
            },
            {
              role: 'user',
              content: `Human feedback: ${feedbackText}`,
            },
          ],
          maxTokens: 150,
          temperature: 0.3,
        });

        const botToken = tenantEnv.SLACK_BOT_TOKEN ?? process.env.SLACK_BOT_TOKEN ?? '';
        if (!botToken) {
          log.warn({ taskId }, 'No Slack bot token available — skipping feedback acknowledgment');
          return;
        }

        const slackClient = createSlackClient({ botToken, defaultChannel: channelId });
        await slackClient.postMessage({
          channel: channelId,
          text: llmResult.content,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: llmResult.content },
            },
          ],
        });

        log.info({ taskId, userId }, 'Feedback acknowledgment posted to thread');
      });
    },
  );
}
