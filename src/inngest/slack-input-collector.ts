import { randomUUID } from 'node:crypto';
import { Inngest } from 'inngest';
import type { EventPayload, InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { loadTenantEnv } from '../repositories/tenant-env-loader.js';
import { TenantRepository } from '../repositories/tenant-repository.js';
import { TenantSecretRepository } from '../repositories/tenant-secret-repository.js';
import { createLogger } from '../lib/logger.js';
import { callLLM } from '../lib/call-llm.js';
import { extractInputsFromText } from '../lib/extract-inputs.js';
import type { InngestStep, TriggerInputReceivedData } from './events.js';
import { requireEnv } from '../lib/config.js';
import { prettifyRoleName } from './slack-trigger-handler.js';

const log = createLogger('slack-input-collector');

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseKey = requireEnv('SUPABASE_SECRET_KEY');

export function createSlackInputCollectorFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'employee/slack-input-collector',
      triggers: [{ event: 'employee/trigger.input-received' }],
    },
    async ({
      event,
      step,
    }: {
      event: EventPayload<TriggerInputReceivedData>;
      step: InngestStep;
    }) => {
      const { threadTs, text, tenantId, pending } = event.data!;

      const botToken = await step.run('load-tenant-env', async () => {
        const prisma = new PrismaClient();
        const tenantRepo = new TenantRepository(prisma);
        const secretRepo = new TenantSecretRepository(prisma);
        try {
          const tenantEnv = await loadTenantEnv(tenantId, { tenantRepo, secretRepo });
          return tenantEnv.SLACK_BOT_TOKEN ?? null;
        } finally {
          await prisma.$disconnect();
        }
      });

      if (!botToken) {
        log.warn(
          { tenantId },
          'No SLACK_BOT_TOKEN for tenant — skipping input collection dispatch',
        );
        return;
      }

      const supabaseHeaders = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };

      const externalId = `slack-trigger-${threadTs}-${pending.archetypeId}`;

      let collectedInputs: Record<string, string> = {};

      if (pending.requiredInputs.length === 1) {
        const input = pending.requiredInputs[0];
        const extracted = await extractInputsFromText(text, [input], callLLM);
        if (extracted[input.key]) {
          collectedInputs[input.key] = extracted[input.key];
        } else {
          // LLM extraction failed — fall back to raw text with warning
          log.warn(
            { key: input.key, type: input.type, text },
            'LLM extraction returned empty for single input — falling back to raw text',
          );
          collectedInputs[input.key] = text;
        }
      } else if (pending.requiredInputs.length > 1) {
        // Multi-input — use per-field LLM extraction
        const extracted = await extractInputsFromText(text, pending.requiredInputs, callLLM);
        if (Object.keys(extracted).length >= pending.requiredInputs.length) {
          // Full extraction succeeded
          collectedInputs = extracted;
        } else if (Object.keys(extracted).length > 0) {
          // Partial extraction — merge extracted with text fallback for missing
          for (const input of pending.requiredInputs) {
            collectedInputs[input.key] = extracted[input.key] ?? text;
          }
        } else {
          // Extraction failed — fall back to assigning text to all keys (safety net)
          for (const input of pending.requiredInputs) {
            collectedInputs[input.key] = text;
          }
        }
      }

      // Merge pre-extracted inputs from the handler (user reply overrides pre-extracted)
      const finalInputs: Record<string, string> = {
        ...(pending.extractedInputs ?? {}),
        ...collectedInputs,
      };

      const taskId = await step.run('create-task', async () => {
        const createRes = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
          method: 'POST',
          headers: supabaseHeaders,
          body: JSON.stringify({
            id: randomUUID(),
            archetype_id: pending.archetypeId,
            external_id: externalId,
            source_system: 'slack',
            status: 'Ready',
            tenant_id: tenantId,
            raw_event: { inputs: { prompt: pending.text, ...finalInputs } },
            updated_at: new Date().toISOString(),
          }),
        });
        const tasks = (await createRes.json()) as Array<{ id: string }>;
        return tasks[0]?.id ?? null;
      });

      if (!taskId) {
        log.error({ externalId }, 'slack-input-collector: task creation returned empty response');
        return;
      }

      await step.sendEvent('dispatch-task', {
        name: 'employee/task.dispatched',
        data: { taskId, archetypeId: pending.archetypeId },
      });

      await step.run('post-success', async () => {
        const employeeName = prettifyRoleName(pending.roleName);
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: pending.channelId,
            thread_ts: threadTs,
            text: `✅ Done — *${employeeName}* is on it, kicked off by <@${pending.userId}>`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `✅ Done — *${employeeName}* is on it, kicked off by <@${pending.userId}>`,
                },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
              },
            ],
          }),
        });
        log.info(
          { taskId, archetypeId: pending.archetypeId, tenantId, threadTs },
          'Task dispatched after input collection',
        );
      });
    },
  );
}
