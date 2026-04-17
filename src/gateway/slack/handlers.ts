import type { App } from '@slack/bolt';
import type { InngestLike } from '../types.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('slack-handlers');

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
    return rows[0].status === 'AwaitingApproval';
  } catch (err) {
    log.error({ taskId, err }, 'Failed to check task status — proceeding optimistically');
    return true;
  }
}

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
  boltApp.action('approve', async ({ ack, body, client }) => {
    await ack();

    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channelId = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (!taskId) {
      log.warn('approve action received without task_id');
      return;
    }

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: `⏳ Processing approval from <@${user.id}>...`,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `⏳ Processing approval from <@${user.id}>...` },
            },
          ],
        });
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to update message after approve click — continuing');
      }
    }

    const stillAwaiting = await isTaskAwaitingApproval(taskId);
    if (!stillAwaiting) {
      log.warn({ taskId }, 'Task no longer AwaitingApproval — ignoring duplicate approve');
      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: '⚠️ This summary has already been processed.',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⚠️ This summary has already been processed.' },
              },
            ],
          });
        } catch (updateErr) {
          log.warn({ taskId, err: updateErr }, 'Failed to update duplicate-click message');
        }
      }
      return;
    }

    try {
      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'approve', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Approval event sent');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to send approval event');
      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: '⚠️ Failed to process approval. Please try again.',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⚠️ Failed to process approval. Please try again.' },
              },
              ...BUTTON_BLOCKS(taskId),
            ],
          });
        } catch (restoreErr) {
          log.warn({ taskId, err: restoreErr }, 'Failed to restore buttons after send failure');
        }
      }
    }
  });

  boltApp.action('reject', async ({ ack, body, client }) => {
    await ack();

    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channelId = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (!taskId) {
      log.warn('reject action received without task_id');
      return;
    }

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: `⏳ Processing rejection from <@${user.id}>...`,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `⏳ Processing rejection from <@${user.id}>...` },
            },
          ],
        });
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to update message after reject click — continuing');
      }
    }

    const stillAwaiting = await isTaskAwaitingApproval(taskId);
    if (!stillAwaiting) {
      log.warn({ taskId }, 'Task no longer AwaitingApproval — ignoring duplicate reject');
      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: '⚠️ This summary has already been processed.',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⚠️ This summary has already been processed.' },
              },
            ],
          });
        } catch (updateErr) {
          log.warn({ taskId, err: updateErr }, 'Failed to update duplicate-click message');
        }
      }
      return;
    }

    try {
      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'reject', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Rejection event sent');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to send rejection event');
      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: '⚠️ Failed to process rejection. Please try again.',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⚠️ Failed to process rejection. Please try again.' },
              },
              ...BUTTON_BLOCKS(taskId),
            ],
          });
        } catch (restoreErr) {
          log.warn({ taskId, err: restoreErr }, 'Failed to restore buttons after send failure');
        }
      }
    }
  });
}
