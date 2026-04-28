import type { App } from '@slack/bolt';
import type { InngestLike } from '../types.js';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';

const log = createLogger('slack-handlers');

const SUPABASE_URL = () => process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = () => process.env.SUPABASE_SECRET_KEY ?? '';
const supabaseHeaders = () => ({
  apikey: SUPABASE_KEY(),
  Authorization: `Bearer ${SUPABASE_KEY()}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
});

async function findTaskIdByThreadTs(threadTs: string): Promise<string | null> {
  const url = SUPABASE_URL();
  const key = SUPABASE_KEY();
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/deliverables?metadata->>approval_message_ts=eq.${threadTs}&select=external_ref&limit=1`,
      { headers: supabaseHeaders() },
    );
    const rows = (await res.json()) as Array<{ external_ref: string }>;
    return rows[0]?.external_ref ?? null;
  } catch (err) {
    log.warn({ threadTs, err }, 'Failed to look up deliverable by thread_ts');
    return null;
  }
}

interface ActionBody {
  actions: Array<{ value: string }>;
  user: { id: string; name: string };
  channel?: { id: string };
  message?: { ts: string };
}

async function isTaskAwaitingApproval(taskId: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) {
    log.warn('SUPABASE_URL or SUPABASE_SECRET_KEY not set — skipping idempotency check');
    return true;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    const rows = (await res.json()) as Array<{ status: string }>;
    if (!rows.length) {
      log.warn({ taskId }, 'Task not found during idempotency check');
      return false;
    }
    return rows[0].status === 'Reviewing';
  } catch (err) {
    log.error({ taskId, err }, 'Failed to check task status — proceeding optimistically');
    return true;
  }
}

const GUEST_BUTTON_BLOCKS = (taskId: string) => [
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve & Send', emoji: true },
        action_id: 'guest_approve',
        value: taskId,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Edit & Send', emoji: true },
        action_id: 'guest_edit',
        value: taskId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Reject', emoji: true },
        action_id: 'guest_reject',
        value: taskId,
        style: 'danger',
      },
    ],
  },
];

const BUTTON_BLOCKS = (taskId: string) => [
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve & Post', emoji: true },
        action_id: 'approve',
        value: taskId,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Reject', emoji: true },
        action_id: 'reject',
        value: taskId,
        style: 'danger',
      },
    ],
  },
];

export function registerSlackHandlers(boltApp: App, inngest: InngestLike): void {
  boltApp.event('message', async ({ event }) => {
    const msg = event as {
      subtype?: string;
      bot_id?: string;
      thread_ts?: string;
      ts: string;
      text?: string;
      user?: string;
      channel: string;
      team?: string;
    };

    if (!msg.thread_ts || msg.thread_ts === msg.ts) return;
    if (msg.subtype === 'bot_message' || msg.bot_id) return;
    if (!msg.user || !msg.text) return;

    const taskId = await findTaskIdByThreadTs(msg.thread_ts);
    if (!taskId) return;

    try {
      await inngest.send({
        name: 'employee/interaction.received',
        data: {
          source: 'thread_reply' as const,
          text: msg.text,
          userId: msg.user,
          channelId: msg.channel,
          threadTs: msg.thread_ts,
          taskId,
          tenantId: undefined,
          team: undefined,
        },
      });
      log.info({ taskId, userId: msg.user }, 'Interaction event sent from thread reply');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to send feedback event');
    }
  });

  boltApp.event('app_mention', async ({ event }) => {
    const mention = event as {
      text: string;
      user: string;
      channel: string;
      thread_ts?: string;
      ts: string;
      team?: string;
    };

    const text = mention.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    let tenantId: string | null = null;
    if (mention.team) {
      try {
        const prisma = new PrismaClient();
        const integrationRepo = new TenantIntegrationRepository(prisma);
        const integration = await integrationRepo.findByExternalId('slack', mention.team);
        tenantId = integration?.tenant_id ?? null;
        await prisma.$disconnect();
      } catch (err) {
        log.warn({ team: mention.team, err }, 'Failed to resolve tenant from Slack team ID');
      }
    }

    try {
      await inngest.send({
        name: 'employee/interaction.received',
        data: {
          source: 'mention' as const,
          text,
          userId: mention.user,
          channelId: mention.channel,
          threadTs: mention.thread_ts,
          taskId: undefined,
          tenantId,
          team: mention.team,
        },
      });
      log.info({ userId: mention.user, tenantId }, 'Interaction event sent from mention');
    } catch (err) {
      log.error({ err }, 'Failed to send mention event');
    }
  });

  boltApp.action('approve', async ({ ack, body, respond }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channelId = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (!taskId) {
      await ack();
      log.warn('approve action received without task_id');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      text: '⏳ Processing approval...',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '⏳ Processing approval...' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, channelId, messageTs, userId: user.id },
      'approve action received — processing state sent inline with ack',
    );

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId);
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate approve');
        try {
          await respond({
            replace_original: true,
            text: '⚠️ This summary has already been processed.',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⚠️ This summary has already been processed.' },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (respondErr) {
          log.warn({ taskId, respondErr }, 'Failed to update already-processed message');
        }
        return;
      }

      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'approve', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Approval event sent — lifecycle will update message');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process approve action');
      try {
        await respond({
          replace_original: true,
          text: '⚠️ Failed to process approval. Please try again.',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '⚠️ Failed to process approval. Please try again.' },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ...BUTTON_BLOCKS(taskId),
          ],
        });
      } catch (restoreErr) {
        log.warn({ taskId, err: restoreErr }, 'Failed to restore buttons after approve failure');
      }
    }
  });

  boltApp.action('reject', async ({ ack, body, respond }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channelId = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (!taskId) {
      await ack();
      log.warn('reject action received without task_id');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      text: '⏳ Processing rejection...',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '⏳ Processing rejection...' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, channelId, messageTs, userId: user.id },
      'reject action received — processing state sent inline with ack',
    );

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId);
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate reject');
        try {
          await respond({
            replace_original: true,
            text: '⚠️ This summary has already been processed.',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⚠️ This summary has already been processed.' },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (respondErr) {
          log.warn({ taskId, respondErr }, 'Failed to update already-processed message');
        }
        return;
      }

      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'reject', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Rejection event sent — lifecycle will update message');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process reject action');
      try {
        await respond({
          replace_original: true,
          text: '⚠️ Failed to process rejection. Please try again.',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '⚠️ Failed to process rejection. Please try again.' },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ...BUTTON_BLOCKS(taskId),
          ],
        });
      } catch (restoreErr) {
        log.warn({ taskId, err: restoreErr }, 'Failed to restore buttons after reject failure');
      }
    }
  });

  boltApp.action('guest_approve', async ({ ack, body, respond }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channelId = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (!taskId) {
      await ack();
      log.warn('guest_approve action received without task_id');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      text: '⏳ Processing approval...',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '⏳ Processing approval...' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, channelId, messageTs, userId: user.id },
      'guest_approve action received — processing state sent inline with ack',
    );

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId);
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate guest_approve');
        try {
          await respond({
            replace_original: true,
            text: '⚠️ This summary has already been processed.',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⚠️ This summary has already been processed.' },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (respondErr) {
          log.warn({ taskId, respondErr }, 'Failed to update already-processed message');
        }
        return;
      }

      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'approve', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`,
      });
      log.info(
        { taskId, userId: user.id },
        'Guest approval event sent — lifecycle will update message',
      );
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process guest_approve action');
      try {
        await respond({
          replace_original: true,
          text: '⚠️ Failed to process approval. Please try again.',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '⚠️ Failed to process approval. Please try again.' },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ...GUEST_BUTTON_BLOCKS(taskId),
          ],
        });
      } catch (restoreErr) {
        log.warn(
          { taskId, err: restoreErr },
          'Failed to restore buttons after guest_approve failure',
        );
      }
    }
  });
}
