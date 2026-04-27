import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import {
  InteractionClassifier,
  resolveArchetypeFromTask,
  resolveArchetypeFromChannel,
} from '../gateway/services/interaction-classifier.js';
import { callLLM } from '../lib/call-llm.js';
import { loadTenantEnv } from '../gateway/services/tenant-env-loader.js';
import { TenantRepository } from '../gateway/services/tenant-repository.js';
import { TenantSecretRepository } from '../gateway/services/tenant-secret-repository.js';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger.js';

const log = createLogger('interaction-handler');

export function createInteractionHandlerFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    { id: 'employee/interaction-handler', triggers: [{ event: 'employee/interaction.received' }] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ event, step }: { event: any; step: any }) => {
      const { source, text, userId, channelId, threadTs, taskId, tenantId } = event.data as {
        source: 'thread_reply' | 'mention';
        text: string;
        userId: string;
        channelId: string;
        threadTs?: string;
        taskId?: string;
        tenantId?: string;
        team?: string;
      };

      const context = await step.run('resolve-context', async () => {
        if (source === 'thread_reply') {
          if (!taskId) {
            log.warn({ userId }, 'Thread reply missing taskId — skipping');
            return null;
          }
          const archetype = await resolveArchetypeFromTask(taskId);
          if (!archetype) {
            log.warn({ taskId }, 'No archetype found for task — skipping');
            return null;
          }
          return {
            tenantId: archetype.tenantId,
            archetypeId: archetype.id,
            roleName: archetype.role_name,
          };
        } else {
          if (!tenantId) {
            log.warn({ userId }, 'Mention missing tenantId — skipping');
            return null;
          }
          const archetype = await resolveArchetypeFromChannel(channelId, tenantId);
          return {
            tenantId,
            archetypeId: archetype?.id ?? null,
            roleName: archetype?.role_name ?? null,
          };
        }
      });

      if (!context) return;

      const intent = await step.run('classify-intent', async () => {
        const classifier = new InteractionClassifier(callLLM);
        const archetypeContext = context.roleName ? { role_name: context.roleName } : undefined;
        return classifier.classifyIntent(text, archetypeContext);
      });

      const routeResult = await step.run('route-and-store', async () => {
        const supabaseUrl = process.env.SUPABASE_URL ?? '';
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';
        const headers = {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        };

        if (intent === 'feedback' || intent === 'teaching') {
          const feedbackType =
            intent === 'teaching'
              ? 'teaching'
              : source === 'thread_reply'
                ? 'thread_reply'
                : 'mention_feedback';
          const res = await fetch(`${supabaseUrl}/rest/v1/feedback`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              task_id: taskId ?? null,
              feedback_type: feedbackType,
              correction_reason: text,
              created_by: userId,
              tenant_id: context.tenantId,
              original_decision: null,
              corrected_decision: null,
            }),
          });
          const rows = (await res.json()) as Array<{ id: string }>;
          return { feedbackId: rows[0]?.id ?? null, answer: null as string | null };
        }

        if (intent === 'question') {
          const kbRes = await fetch(
            `${supabaseUrl}/rest/v1/knowledge_base_entries?tenant_id=eq.${context.tenantId}&select=content&limit=5`,
            { headers },
          );
          const kbEntries = (await kbRes.json()) as Array<{ content: string }>;
          const kbContent =
            kbEntries.map((e) => e.content).join('\n\n') || 'No knowledge base entries found.';
          const roleName = context.roleName ?? 'AI Employee';
          const llmResult = await callLLM({
            model: 'anthropic/claude-haiku-4-5',
            taskType: 'review',
            messages: [
              {
                role: 'system',
                content: `You are ${roleName}. Answer this question based on the following knowledge:\n${kbContent}\n\nIf you don't have enough information, say so honestly.`,
              },
              { role: 'user', content: text },
            ],
            maxTokens: 300,
            temperature: 0.3,
          });
          return { feedbackId: null, answer: llmResult.content };
        }

        log.info({ userId, channelId }, 'Task intent received — stubbed, not implemented');
        return { feedbackId: null, answer: null as string | null };
      });

      await step.run('send-acknowledgment', async () => {
        const prisma = new PrismaClient();
        const tenantRepo = new TenantRepository(prisma);
        const secretRepo = new TenantSecretRepository(prisma);
        const tenantEnv = await loadTenantEnv(context.tenantId, { tenantRepo, secretRepo });
        await prisma.$disconnect();

        const botToken = tenantEnv.SLACK_BOT_TOKEN ?? '';
        if (!botToken) {
          log.warn({ tenantId: context.tenantId }, 'No Slack bot token — skipping acknowledgment');
          return;
        }

        let ackText: string;

        if (intent === 'feedback' || intent === 'teaching') {
          const roleName = context.roleName ?? 'AI Employee';
          const llmResult = await callLLM({
            model: 'anthropic/claude-haiku-4-5',
            taskType: 'review',
            messages: [
              {
                role: 'system',
                content: `You are ${roleName}. A human has given you feedback on your work. Acknowledge it warmly and briefly in character. Max 2 sentences.`,
              },
              { role: 'user', content: text },
            ],
            maxTokens: 150,
            temperature: 0.3,
          });
          ackText = llmResult.content;
        } else if (intent === 'question') {
          ackText = routeResult.answer ?? 'I was unable to find an answer.';
        } else {
          ackText = "Got it! I'll work on that.";
        }

        const contextId = taskId ?? context.archetypeId ?? 'unknown';
        const ackBlocks = [
          { type: 'section', text: { type: 'mrkdwn', text: ackText } },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `Task \`${contextId}\`` }],
          },
        ];

        // Post directly to Slack API to support thread_ts (createSlackClient doesn't support thread_ts)
        const body: Record<string, unknown> = {
          channel: channelId,
          text: ackText,
          blocks: ackBlocks,
        };
        if (threadTs) {
          body.thread_ts = threadTs;
        }

        const response = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { ok: boolean; error?: string };
        if (!data.ok) {
          log.warn({ channelId, error: data.error }, 'Failed to post acknowledgment to Slack');
        }
        log.info({ userId, intent, channelId }, 'Acknowledgment posted');
      });

      if (intent === 'feedback' || intent === 'teaching') {
        await step.sendEvent('emit-rule-extract', {
          name: 'employee/rule.extract-requested',
          data: {
            tenantId: context.tenantId,
            feedbackId: routeResult.feedbackId,
            feedbackType: intent,
            source,
          },
        });
      }
      if (intent === 'task') {
        await step.sendEvent('emit-task-requested', {
          name: 'employee/task.requested',
          data: {
            tenantId: context.tenantId,
            text,
            userId,
            channelId,
            archetypeId: context.archetypeId,
          },
        });
      }

      log.info({ userId, intent, source }, 'Interaction handled');
    },
  );
}
