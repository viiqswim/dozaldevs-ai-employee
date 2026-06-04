import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { resolveArchetypeFromChannel } from '../gateway/services/interaction-classifier.js';
import { loadTenantEnv } from '../gateway/services/tenant-env-loader.js';
import { TenantRepository } from '../gateway/services/tenant-repository.js';
import { TenantSecretRepository } from '../gateway/services/tenant-secret-repository.js';
import { SLACK_ACTION_ID } from '../lib/slack-action-ids.js';
import { createLogger } from '../lib/logger.js';

interface PendingInputContext {
  archetypeId: string;
  tenantId: string;
  userId: string;
  channelId: string;
  text: string;
  roleName: string;
  requiredInputs: Array<{ key: string; label: string; description?: string }>;
}

const log = createLogger('slack-trigger-handler');

export function prettifyRoleName(roleName: string): string {
  return roleName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function createSlackTriggerHandlerFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'employee/slack-trigger-handler',
      triggers: [{ event: 'employee/task.requested' }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ event, step }: { event: any; step: any }) => {
      const { tenantId, text, userId, channelId, archetypeId, threadTs } = event.data as {
        tenantId: string | null;
        text: string;
        userId: string;
        channelId: string;
        archetypeId: string | null;
        threadTs?: string;
      };

      const context = await step.run('validate-context', async () => {
        if (!tenantId) {
          log.warn({ userId, channelId }, 'task.requested missing tenantId — skipping');
          return null;
        }
        return { tenantId, text, userId, channelId, archetypeId, threadTs };
      });

      if (!context) return;

      const resolution = await step.run('resolve-employee', async () => {
        return resolveArchetypeFromChannel(channelId, tenantId!);
      });

      const botToken = await step.run('load-tenant-env', async () => {
        const prisma = new PrismaClient();
        const tenantRepo = new TenantRepository(prisma);
        const secretRepo = new TenantSecretRepository(prisma);
        try {
          const tenantEnv = await loadTenantEnv(tenantId!, { tenantRepo, secretRepo });
          return tenantEnv.SLACK_BOT_TOKEN ?? null;
        } finally {
          await prisma.$disconnect();
        }
      });

      if (!botToken) {
        log.warn({ tenantId }, 'No SLACK_BOT_TOKEN for tenant — skipping trigger confirmation');
        return;
      }

      const replyTs = threadTs ?? (event.data.ts as string | undefined);

      if (!resolution.archetype) {
        await step.run('post-decline', async () => {
          log.info({ channelId, tenantId }, 'No archetype for channel — posting decline');
          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              channel: channelId,
              ...(replyTs ? { thread_ts: replyTs } : {}),
              text: "I don't have any employees assigned to this channel. An admin can assign one in the dashboard.",
            }),
          });
        });
        return;
      }

      await step.run('send-confirmation', async () => {
        const archetype = resolution.archetype!;
        const employeeName = prettifyRoleName(archetype.role_name);
        const truncatedText = text.length > 200 ? text.slice(0, 197) + '...' : text;
        const contextValue = JSON.stringify({
          archetypeId: archetype.id,
          tenantId,
          userId,
          channelId,
          threadTs: replyTs,
          text,
        });

        const blocks = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `Trigger *${employeeName}*?` },
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `Requested by <@${userId}>: ${truncatedText}` }],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '✅ Confirm', emoji: true },
                action_id: SLACK_ACTION_ID.TRIGGER_CONFIRM,
                value: contextValue,
                style: 'primary',
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: '❌ Cancel', emoji: true },
                action_id: SLACK_ACTION_ID.TRIGGER_CANCEL,
                value: contextValue,
                style: 'danger',
              },
            ],
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: 'Task `pending-confirmation`' }],
          },
        ];

        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: channelId,
            ...(replyTs ? { thread_ts: replyTs } : {}),
            text: `Trigger ${employeeName}?`,
            blocks,
          }),
        });

        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) {
          log.warn(
            { channelId, archetypeId: archetype.id, error: data.error },
            'Failed to post trigger confirmation card',
          );
        } else {
          log.info(
            { channelId, archetypeId: archetype.id, employeeName },
            'Trigger confirmation card posted',
          );
        }
      });
    },
  );
}

export function createSlackInputCollectorFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'employee/slack-input-collector',
      triggers: [{ event: 'employee/trigger.input-received' }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ event, step }: { event: any; step: any }) => {
      const {
        threadTs,
        text,
        tenantId,
        pending,
      }: {
        threadTs: string;
        text: string;
        tenantId: string;
        pending: PendingInputContext;
      } = event.data as {
        threadTs: string;
        text: string;
        tenantId: string;
        pending: PendingInputContext;
      };

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

      const supabaseUrl = process.env.SUPABASE_URL ?? '';
      const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';
      const supabaseHeaders = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };

      const externalId = `slack-trigger-${threadTs}-${pending.archetypeId}`;

      const dupRes = await step.run('check-duplicate', async () => {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/tasks?external_id=eq.${externalId}&status=not.in.(Done,Failed,Cancelled)&tenant_id=eq.${tenantId}&select=id`,
          { headers: supabaseHeaders },
        );
        return (await res.json()) as Array<{ id: string }>;
      });

      if (dupRes.length > 0) {
        log.warn(
          { externalId, existingTaskId: dupRes[0].id },
          'slack-input-collector: duplicate task detected — skipping',
        );
        return;
      }

      const collectedInputs: Record<string, string> = {};
      for (const input of pending.requiredInputs) {
        collectedInputs[input.key] = text;
      }

      const taskId = await step.run('create-task', async () => {
        const createRes = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
          method: 'POST',
          headers: supabaseHeaders,
          body: JSON.stringify({
            archetype_id: pending.archetypeId,
            external_id: externalId,
            source_system: 'slack',
            status: 'Ready',
            tenant_id: tenantId,
            raw_event: { inputs: { prompt: pending.text, ...collectedInputs } },
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
            text: `✅ *${employeeName}* has been triggered by <@${pending.userId}>`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `✅ *${employeeName}* has been triggered by <@${pending.userId}>`,
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
