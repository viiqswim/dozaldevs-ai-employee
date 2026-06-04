import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { resolveArchetypeFromChannel } from '../gateway/services/interaction-classifier.js';
import { loadTenantEnv } from '../gateway/services/tenant-env-loader.js';
import { TenantRepository } from '../gateway/services/tenant-repository.js';
import { TenantSecretRepository } from '../gateway/services/tenant-secret-repository.js';
import { SLACK_ACTION_ID } from '../lib/slack-action-ids.js';
import { createLogger } from '../lib/logger.js';

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
