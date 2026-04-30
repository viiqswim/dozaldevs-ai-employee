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

async function isTaskPendingReplyAnyway(taskId: string): Promise<boolean> {
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
      log.warn({ taskId }, 'Task not found during reply-anyway idempotency check');
      return false;
    }
    const terminalStates = ['Done', 'Failed', 'Cancelled'];
    return !terminalStates.includes(rows[0].status);
  } catch (err) {
    log.error(
      { taskId, err },
      'Failed to check task status for reply-anyway — proceeding optimistically',
    );
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

const NO_ACTION_BUTTON_BLOCKS = (taskId: string) => [
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '💬 Reply Anyway', emoji: true },
        action_id: 'guest_reply_anyway',
        value: taskId,
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

  boltApp.action('guest_edit', async ({ ack, body, client }) => {
    const actionBody = body as ActionBody;
    const rawValue = actionBody.actions[0]?.value ?? '{}';
    let taskId = '';
    let draftResponse = '';
    try {
      const parsed = JSON.parse(rawValue) as { taskId?: string; draftResponse?: string };
      taskId = parsed.taskId ?? '';
      draftResponse = parsed.draftResponse ?? '';
    } catch {
      taskId = rawValue;
    }

    if (!taskId) {
      await ack();
      log.warn('guest_edit action received without task_id');
      return;
    }

    await ack();

    const channelId = actionBody.channel?.id ?? '';
    const messageTs = actionBody.message?.ts ?? '';

    try {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'guest_edit_modal',
          private_metadata: JSON.stringify({ taskId, channelId, messageTs }),
          title: { type: 'plain_text', text: 'Edit Response' },
          submit: { type: 'plain_text', text: 'Send Edited Response' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'input',
              block_id: 'draft_input',
              label: { type: 'plain_text', text: 'Draft Response' },
              element: {
                type: 'plain_text_input',
                action_id: 'edited_draft',
                multiline: true,
                initial_value: draftResponse,
              },
            },
          ],
        },
      });
      log.info({ taskId }, 'guest_edit modal opened');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to open guest_edit modal');
    }
  });

  boltApp.view('guest_edit_modal', async ({ ack, view, body, client }) => {
    const editedText = view.state.values?.draft_input?.edited_draft?.value ?? '';

    if (!editedText || !editedText.trim()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ack as any)({
        response_action: 'errors',
        errors: { draft_input: 'Response cannot be empty.' },
      });
      return;
    }

    await ack();

    let taskId = '';
    let channelId = '';
    let messageTs = '';
    try {
      const meta = JSON.parse(view.private_metadata ?? '{}') as {
        taskId?: string;
        channelId?: string;
        messageTs?: string;
      };
      taskId = meta.taskId ?? '';
      channelId = meta.channelId ?? '';
      messageTs = meta.messageTs ?? '';
    } catch {
      log.error('Failed to parse guest_edit_modal private_metadata');
      return;
    }

    if (!taskId) {
      log.error('guest_edit_modal submitted without taskId in private_metadata');
      return;
    }

    const user = body.user;

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId);
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate edit submit');
        return;
      }

      await inngest.send({
        name: 'employee/approval.received',
        data: {
          taskId,
          action: 'approve',
          userId: user.id,
          userName: user.name,
          editedContent: editedText.trim(),
        },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Edit approval event sent');

      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: '⏳ Processing edited response...',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⏳ Processing edited response...' },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (updateErr) {
          log.warn({ taskId, updateErr }, 'Failed to update message after edit submit (non-fatal)');
        }
      }
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process guest_edit_modal submission');
    }
  });

  boltApp.action('guest_reject', async ({ ack, body, client }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value ?? '';

    if (!taskId) {
      await ack();
      log.warn('guest_reject action received without task_id');
      return;
    }

    await ack();

    const channelId = actionBody.channel?.id ?? '';
    const messageTs = actionBody.message?.ts ?? '';

    try {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'guest_reject_modal',
          private_metadata: JSON.stringify({ taskId, channelId, messageTs }),
          title: { type: 'plain_text', text: 'Reject Response' },
          submit: { type: 'plain_text', text: 'Reject' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Are you sure you want to reject this draft response?',
              },
            },
            {
              type: 'input',
              block_id: 'reason_input',
              optional: true,
              label: { type: 'plain_text', text: 'Rejection Reason (optional)' },
              element: {
                type: 'plain_text_input',
                action_id: 'rejection_reason',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Help improve future responses...',
                },
              },
            },
          ],
        },
      });
      log.info({ taskId }, 'guest_reject modal opened');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to open guest_reject modal');
    }
  });

  boltApp.action('guest_reply_anyway', async ({ ack, body, respond }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value;
    const user = actionBody.user;

    if (!taskId) {
      await ack();
      log.warn('guest_reply_anyway action received without task_id');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      text: '⏳ Processing Reply Anyway...',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '⏳ Processing Reply Anyway...' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, userId: user.id },
      'guest_reply_anyway action received — processing state sent inline with ack',
    );

    try {
      const stillPending = await isTaskPendingReplyAnyway(taskId);
      if (!stillPending) {
        log.warn({ taskId }, 'Task already resolved — ignoring duplicate guest_reply_anyway');
        try {
          await respond({
            replace_original: true,
            text: '⚠️ This notification has already been resolved.',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⚠️ This notification has already been resolved.' },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (respondErr) {
          log.warn({ taskId, respondErr }, 'Failed to update already-resolved message');
        }
        return;
      }

      await inngest.send({
        name: 'employee/reply-anyway.requested',
        data: { taskId, userId: user.id, userName: user.name },
        id: `employee-reply-anyway-${taskId}`,
      });
      log.info(
        { taskId, userId: user.id },
        'Reply Anyway event sent — lifecycle will spawn re-draft machine',
      );
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process guest_reply_anyway action');
      try {
        await respond({
          replace_original: true,
          text: '⚠️ Failed to process Reply Anyway. Please try again.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '⚠️ Failed to process Reply Anyway. Please try again.',
              },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ...NO_ACTION_BUTTON_BLOCKS(taskId),
          ],
        });
      } catch (restoreErr) {
        log.warn(
          { taskId, err: restoreErr },
          'Failed to restore buttons after guest_reply_anyway failure',
        );
      }
    }
  });

  boltApp.view('guest_reject_modal', async ({ ack, view, body, client }) => {
    await ack();

    const reason = view.state.values?.reason_input?.rejection_reason?.value ?? undefined;

    let taskId = '';
    let channelId = '';
    let messageTs = '';
    try {
      const meta = JSON.parse(view.private_metadata ?? '{}') as {
        taskId?: string;
        channelId?: string;
        messageTs?: string;
      };
      taskId = meta.taskId ?? '';
      channelId = meta.channelId ?? '';
      messageTs = meta.messageTs ?? '';
    } catch {
      log.error('Failed to parse guest_reject_modal private_metadata');
      return;
    }

    if (!taskId) {
      log.error('guest_reject_modal submitted without taskId in private_metadata');
      return;
    }

    const user = body.user;

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId);
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate reject submit');
        return;
      }

      await inngest.send({
        name: 'employee/approval.received',
        data: {
          taskId,
          action: 'reject',
          userId: user.id,
          userName: user.name,
          ...(reason ? { rejectionReason: reason } : {}),
        },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id, hasReason: !!reason }, 'Rejection event sent');

      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: '⏳ Processing rejection...',
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: '⏳ Processing rejection...' } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (updateErr) {
          log.warn(
            { taskId, updateErr },
            'Failed to update message after reject submit (non-fatal)',
          );
        }
      }
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process guest_reject_modal submission');
    }
  });

  boltApp.action('rule_confirm', async ({ ack, body }) => {
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    if (!ruleId) {
      await ack();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `✅ Rule confirmed by <@${user.id}>` },
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
      ],
    });
    try {
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();
      await fetch(`${supabaseUrl}/rest/v1/learned_rules?id=eq.${ruleId}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status: 'confirmed', confirmed_at: new Date().toISOString() }),
      });
      log.info({ ruleId, userId: user.id }, 'Rule confirmed');
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to PATCH learned_rules on confirm');
    }
  });

  boltApp.action('rule_reject', async ({ ack, body }) => {
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    if (!ruleId) {
      await ack();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `❌ Rule rejected by <@${user.id}>` },
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
      ],
    });
    try {
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();
      await fetch(`${supabaseUrl}/rest/v1/learned_rules?id=eq.${ruleId}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status: 'rejected' }),
      });
      log.info({ ruleId, userId: user.id }, 'Rule rejected');
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to PATCH learned_rules on reject');
    }
  });

  boltApp.action('rule_rephrase', async ({ ack, body, client }) => {
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    if (!ruleId) {
      await ack();
      log.warn('rule_rephrase action received without ruleId');
      return;
    }
    await ack();

    let currentRuleText = '';
    try {
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();
      const res = await fetch(
        `${supabaseUrl}/rest/v1/learned_rules?id=eq.${ruleId}&select=rule_text`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        },
      );
      const rows = (await res.json()) as Array<{ rule_text: string }>;
      currentRuleText = rows[0]?.rule_text ?? '';
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to fetch rule_text for rephrase modal');
    }

    try {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'rule_rephrase_modal',
          private_metadata: JSON.stringify({ ruleId }),
          title: { type: 'plain_text', text: 'Rephrase Rule' },
          submit: { type: 'plain_text', text: 'Save' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'input',
              block_id: 'rule_input',
              label: { type: 'plain_text', text: 'Rule Text' },
              element: {
                type: 'plain_text_input',
                action_id: 'rule_text',
                multiline: true,
                initial_value: currentRuleText,
              },
            },
          ],
        },
      });
      log.info({ ruleId }, 'rule_rephrase modal opened');
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to open rule_rephrase modal');
    }
  });

  boltApp.view('rule_rephrase_modal', async ({ ack, view, client }) => {
    const newText = view.state.values?.rule_input?.rule_text?.value ?? '';

    if (!newText || !newText.trim()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ack as any)({
        response_action: 'errors',
        errors: { rule_input: 'Rule text cannot be empty.' },
      });
      return;
    }

    await ack();

    let ruleId = '';
    try {
      const meta = JSON.parse(view.private_metadata ?? '{}') as { ruleId?: string };
      ruleId = meta.ruleId ?? '';
    } catch {
      log.error('Failed to parse rule_rephrase_modal private_metadata');
      return;
    }

    if (!ruleId) {
      log.error('rule_rephrase_modal submitted without ruleId in private_metadata');
      return;
    }

    try {
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();

      await fetch(`${supabaseUrl}/rest/v1/learned_rules?id=eq.${ruleId}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ rule_text: newText.trim() }),
      });
      log.info({ ruleId }, 'rule_text updated via rephrase');

      const metaRes = await fetch(
        `${supabaseUrl}/rest/v1/learned_rules?id=eq.${ruleId}&select=slack_ts,slack_channel`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        },
      );
      const metaRows = (await metaRes.json()) as Array<{
        slack_ts: string | null;
        slack_channel: string | null;
      }>;
      const slack_ts = metaRows[0]?.slack_ts;
      const slack_channel = metaRows[0]?.slack_channel;

      if (slack_ts && slack_channel) {
        await client.chat.update({
          channel: slack_channel,
          ts: slack_ts,
          text: `🧠 *New behavioral rule proposed:*\n\n> ${newText.trim()}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🧠 *New behavioral rule proposed:*\n\n> ${newText.trim()}`,
              },
            },
            { type: 'divider' },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ Confirm' },
                  style: 'primary',
                  action_id: 'rule_confirm',
                  value: ruleId,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '❌ Reject' },
                  style: 'danger',
                  action_id: 'rule_reject',
                  value: ruleId,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✏️ Rephrase' },
                  action_id: 'rule_rephrase',
                  value: ruleId,
                },
              ],
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }],
            },
          ],
        });
        log.info({ ruleId, slack_ts, slack_channel }, 'Slack message updated after rephrase');
      }
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to process rule_rephrase_modal submission');
    }
  });
}
