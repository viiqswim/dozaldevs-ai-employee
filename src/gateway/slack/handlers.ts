import type { App } from '@slack/bolt';
import type { InngestLike } from '../types.js';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { resolveArchetypeFromChannel } from '../services/interaction-classifier.js';
import { getPlatformSetting } from '../../lib/platform-settings.js';
import { SLACK_ACTION_ID } from '../../lib/slack-action-ids.js';
import { extractInputsFromText } from '../../lib/extract-inputs.js';
import { callLLM } from '../../lib/call-llm.js';
import {
  loadingMessage,
  successMessage,
  failureMessage,
  missingInfoMessage,
  ruleProposedMessage,
} from '../../lib/slack-copy.js';
import { randomUUID } from 'node:crypto';

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
    // First: check deliverables by approval_message_ts (approval card ts)
    const res = await fetch(
      `${url}/rest/v1/deliverables?metadata->>approval_message_ts=eq.${threadTs}&select=external_ref&limit=1`,
      { headers: supabaseHeaders() },
    );
    const rows = (await res.json()) as Array<{ external_ref: string }>;
    if (rows[0]?.external_ref) return rows[0].external_ref;

    // Fallback: check tasks by notify_slack_ts (parent "Task received" message ts)
    const taskRes = await fetch(
      `${url}/rest/v1/tasks?metadata->>notify_slack_ts=eq.${threadTs}&select=id&limit=1`,
      { headers: supabaseHeaders() },
    );
    const taskRows = (await taskRes.json()) as Array<{ id: string }>;
    return taskRows[0]?.id ?? null;
  } catch (err) {
    log.warn({ threadTs, err }, 'Failed to look up task by thread_ts');
    return null;
  }
}

interface ActionBody {
  actions: Array<{ value: string }>;
  user: { id: string; name: string };
  channel?: { id: string };
  message?: { ts: string };
}

const TRANSIENT_PRE_REVIEWING = new Set(['Submitting', 'Validating', 'Executing']);
const TERMINAL_STATUSES = new Set(['Done', 'Cancelled', 'Failed', 'Delivering']);

// ─── Pending input collection (in-memory, per process) ────────────────────────
interface PendingInputCollection {
  archetypeId: string;
  tenantId: string;
  userId: string;
  channelId: string;
  text: string;
  roleName: string;
  requiredInputs: Array<{
    key: string;
    label: string;
    description?: string;
    type?: string;
    options?: string[];
  }>;
  extractedInputs?: Record<string, string>;
}
const pendingInputCollections = new Map<string, PendingInputCollection>();

export function _clearPendingInputCollections(): void {
  pendingInputCollections.clear();
}

/** Deduplicates app_mention events — Slack Socket Mode delivers at-least-once.
 *  Key: `${ts}:${channel}`, Value: timestamp (ms).
 *  Single-process scoped — acceptable for current single-instance deployment. */
const recentMentions = new Map<string, number>();
const MENTION_DEDUP_TTL_MS = 30_000;

export function _clearRecentMentions(): void {
  recentMentions.clear();
}

async function isTaskAwaitingApproval(
  taskId: string,
  { maxRetries = 0, retryDelayMs = 2000 }: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) {
    log.warn('SUPABASE_URL or SUPABASE_SECRET_KEY not set — skipping idempotency check');
    return true;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
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
      const status = rows[0].status;
      if (status === 'Reviewing') return true;
      if (TERMINAL_STATUSES.has(status)) return false;
      if (TRANSIENT_PRE_REVIEWING.has(status) && attempt < maxRetries) {
        log.info({ taskId, status, attempt }, 'Task in transient state — waiting for Reviewing');
        continue;
      }
      return false;
    } catch (err) {
      log.error({ taskId, err }, 'Failed to check task status — proceeding optimistically');
      return true;
    }
  }
  return false;
}

async function isTaskAwaitingOverride(taskId: string): Promise<boolean> {
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
      log.warn({ taskId }, 'Task not found during override idempotency check');
      return false;
    }
    const terminalStates = ['Done', 'Failed', 'Cancelled'];
    return !terminalStates.includes(rows[0].status);
  } catch (err) {
    log.error(
      { taskId, err },
      'Failed to check task status for override — proceeding optimistically',
    );
    return true;
  }
}

async function getTaskStatusMessage(taskId: string): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return 'Looks like this one has already been handled.';
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });
    const rows = (await res.json()) as Array<{ status: string }>;
    const status = rows[0]?.status;
    if (status === 'Done') return '✅ Already approved and delivered — nothing left to do here.';
    if (status === 'Cancelled')
      return '⏭️ This task is no longer active — it may have been superseded by a newer message.';
    if (status === 'Failed')
      return '❌ This one ran into a problem — it has already been marked as failed.';
    return 'Looks like this one has already been handled.';
  } catch {
    return 'Looks like this one has already been handled.';
  }
}

const GUEST_BUTTON_BLOCKS = (taskId: string) => [
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve & Send', emoji: true },
        action_id: SLACK_ACTION_ID.GUEST_APPROVE,
        value: taskId,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Edit & Send', emoji: true },
        action_id: SLACK_ACTION_ID.GUEST_EDIT,
        value: taskId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Reject', emoji: true },
        action_id: SLACK_ACTION_ID.GUEST_REJECT,
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
        action_id: SLACK_ACTION_ID.APPROVE,
        value: taskId,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Reject', emoji: true },
        action_id: SLACK_ACTION_ID.REJECT,
        value: taskId,
        style: 'danger',
      },
    ],
  },
];

export function registerSlackHandlers(boltApp: App, inngest: InngestLike): void {
  boltApp.use(async ({ body, next }) => {
    const eventType = (body as { event?: { type?: string } }).event?.type ?? body.type ?? 'unknown';
    log.debug({ eventType, bodyType: body.type }, 'Bolt middleware: raw payload received');
    await next();
  });

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

    const pending = pendingInputCollections.get(msg.thread_ts);
    if (pending) {
      pendingInputCollections.delete(msg.thread_ts);
      try {
        await inngest.send({
          name: 'employee/trigger.input-received',
          data: {
            threadTs: msg.thread_ts,
            text: msg.text,
            tenantId: pending.tenantId,
            pending,
          },
        });
        log.info(
          { threadTs: msg.thread_ts, tenantId: pending.tenantId, userId: msg.user },
          'Input-received event sent for pending input collection',
        );
      } catch (err) {
        log.error({ threadTs: msg.thread_ts, err }, 'Failed to send trigger.input-received event');
      }
      return;
    }

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

  boltApp.event('app_mention', async ({ event, client }) => {
    const mention = event as {
      text: string;
      user: string;
      channel: string;
      thread_ts?: string;
      ts: string;
      team?: string;
      bot_id?: string;
    };

    log.info(
      { channel: mention.channel, user: mention.user, hasBotId: !!mention.bot_id },
      'app_mention event received',
    );

    if (mention.bot_id) return;

    if (mention.channel.startsWith('D')) return;

    // Dedup: skip duplicate app_mention events (Slack Socket Mode at-least-once delivery)
    const dedupKey = `${mention.ts}:${mention.channel}`;
    const now = Date.now();
    if (
      recentMentions.has(dedupKey) &&
      now - recentMentions.get(dedupKey)! < MENTION_DEDUP_TTL_MS
    ) {
      log.info(
        { ts: mention.ts, channel: mention.channel },
        'Duplicate app_mention suppressed — skipping',
      );
      return;
    }
    recentMentions.set(dedupKey, now);
    // Lazy cleanup: evict expired entries to prevent unbounded growth
    for (const [key, timestamp] of recentMentions) {
      if (now - timestamp > MENTION_DEDUP_TTL_MS) recentMentions.delete(key);
    }

    const text = mention.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    if (mention.thread_ts && mention.thread_ts !== mention.ts) {
      const pending = pendingInputCollections.get(mention.thread_ts);
      if (pending) {
        pendingInputCollections.delete(mention.thread_ts);
        try {
          await inngest.send({
            name: 'employee/trigger.input-received',
            data: {
              threadTs: mention.thread_ts,
              text,
              tenantId: pending.tenantId,
              pending,
            },
          });
          log.info(
            { threadTs: mention.thread_ts, tenantId: pending.tenantId, userId: mention.user },
            'Input-received event sent from app_mention (thread reply with @mention)',
          );
        } catch (err) {
          log.error(
            { threadTs: mention.thread_ts, err },
            'Failed to send trigger.input-received from app_mention',
          );
        }
        return;
      }
    }

    let ackTs: string | undefined;
    try {
      const ackResult = await client.chat.postMessage({
        channel: mention.channel,
        thread_ts: mention.thread_ts ?? mention.ts,
        text: 'On it — one moment…',
      });
      ackTs = typeof ackResult.ts === 'string' ? ackResult.ts : undefined;
    } catch (ackErr) {
      log.warn({ err: ackErr }, 'Failed to post app_mention ack — continuing without ack');
    }

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

    const taskId = mention.thread_ts ? await findTaskIdByThreadTs(mention.thread_ts) : null;

    if (tenantId) {
      try {
        const resolution = await resolveArchetypeFromChannel(mention.channel, tenantId);
        if (!resolution.archetype) {
          const declineText =
            "I don't have any employees assigned to this channel. An admin can assign one in the dashboard.";
          if (ackTs) {
            try {
              await client.chat.update({
                channel: mention.channel,
                ts: ackTs,
                text: declineText,
              });
            } catch (updateErr) {
              log.warn(
                { err: updateErr },
                'Failed to update ack with decline — posting separately',
              );
              try {
                await client.chat.postMessage({
                  channel: mention.channel,
                  thread_ts: mention.thread_ts ?? mention.ts,
                  text: declineText,
                });
              } catch (postErr) {
                log.warn({ err: postErr }, 'Failed to post decline fallback');
              }
            }
          } else {
            try {
              await client.chat.postMessage({
                channel: mention.channel,
                thread_ts: mention.thread_ts ?? mention.ts,
                text: declineText,
              });
            } catch (postErr) {
              log.warn({ err: postErr }, 'Failed to post decline message');
            }
          }
          log.info(
            { channel: mention.channel, tenantId },
            'No archetype for channel — declined at gateway',
          );
          return;
        }
      } catch (resolveErr) {
        log.warn({ err: resolveErr }, 'Failed to check channel assignment — forwarding to Inngest');
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
          messageTs: mention.ts,
          taskId: taskId ?? undefined,
          tenantId,
          team: mention.team,
        },
      });
      log.info({ userId: mention.user, tenantId }, 'Interaction event sent from mention');
    } catch (err) {
      log.error({ err }, 'Failed to send mention event');
    }
  });

  boltApp.action(SLACK_ACTION_ID.APPROVE, async ({ ack, body, respond }) => {
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
      text: '⏳ Got it — sending this for approval…',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '⏳ Got it — sending this for approval…' },
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, channelId, messageTs, userId: user.id },
      'approve action received — processing state sent inline with ack',
    );

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId, {
        maxRetries: 10,
        retryDelayMs: 2000,
      });
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate approve');
        try {
          const statusMsg = await getTaskStatusMessage(taskId);
          await respond({
            replace_original: true,
            text: statusMsg,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: statusMsg } },
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
          text: 'Hmm, something went wrong on my end — mind trying that again?',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Hmm, something went wrong on my end — mind trying that again?',
              },
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

  boltApp.action(SLACK_ACTION_ID.REJECT, async ({ ack, body, respond }) => {
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
      text: '⏳ Got it — noting your rejection…',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '⏳ Got it — noting your rejection…' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, channelId, messageTs, userId: user.id },
      'reject action received — processing state sent inline with ack',
    );

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId, {
        maxRetries: 10,
        retryDelayMs: 2000,
      });
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate reject');
        try {
          const statusMsg = await getTaskStatusMessage(taskId);
          await respond({
            replace_original: true,
            text: statusMsg,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: statusMsg } },
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
          text: 'Hmm, something went wrong on my end — mind trying that again?',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Hmm, something went wrong on my end — mind trying that again?',
              },
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

  boltApp.action(SLACK_ACTION_ID.GUEST_APPROVE, async ({ ack, body, respond }) => {
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
      text: '⏳ Got it — sending this for approval…',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '⏳ Got it — sending this for approval…' },
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, channelId, messageTs, userId: user.id },
      'guest_approve action received — processing state sent inline with ack',
    );

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId, {
        maxRetries: 10,
        retryDelayMs: 2000,
      });
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate guest_approve');
        try {
          const statusMsg = await getTaskStatusMessage(taskId);
          await respond({
            replace_original: true,
            text: statusMsg,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: statusMsg } },
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
          text: 'Hmm, something went wrong on my end — mind trying that again?',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Hmm, something went wrong on my end — mind trying that again?',
              },
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

  boltApp.action(SLACK_ACTION_ID.GUEST_EDIT, async ({ ack, body, client }) => {
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

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: 'On it — one moment…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — one moment…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { taskId, updateErr },
          'Failed to remove buttons before guest_edit modal (non-fatal)',
        );
      }
    }

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
                action_id: SLACK_ACTION_ID.EDITED_DRAFT,
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

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: '⏳ Got it — working on your edit…',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '⏳ Got it — working on your edit…' },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { taskId, updateErr },
          'Failed to remove buttons before guest_edit_modal poll (non-fatal)',
        );
      }
    }

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId, {
        maxRetries: 10,
        retryDelayMs: 2000,
      });
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate edit submit');
        if (channelId && messageTs) {
          const statusMsg = await getTaskStatusMessage(taskId);
          try {
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              text: statusMsg,
              blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: statusMsg } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
              ],
            });
          } catch (updateErr) {
            log.warn(
              { taskId, updateErr },
              'Failed to update already-processed message after edit submit (non-fatal)',
            );
          }
        }
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
            text: '⏳ Got it — sending your edited version…',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⏳ Got it — sending your edited version…' },
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

  boltApp.action(SLACK_ACTION_ID.GUEST_REJECT, async ({ ack, body, client }) => {
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

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: 'On it — one moment…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — one moment…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { taskId, updateErr },
          'Failed to remove buttons before guest_reject modal (non-fatal)',
        );
      }
    }

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

  boltApp.action(SLACK_ACTION_ID.OVERRIDE_TAKE_ACTION, async ({ ack, body, client }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value ?? '';

    if (!taskId) {
      await ack();
      log.warn('override_take_action received without task_id');
      return;
    }

    await ack();

    const channelId = actionBody.channel?.id ?? '';
    const messageTs = actionBody.message?.ts ?? '';

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: 'On it — one moment…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — one moment…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { taskId, updateErr },
          'Failed to remove buttons before override_take_action modal (non-fatal)',
        );
      }
    }

    try {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'override_take_action_modal',
          private_metadata: JSON.stringify({ taskId, channelId, messageTs }),
          title: { type: 'plain_text', text: 'Provide Direction' },
          submit: { type: 'plain_text', text: 'Submit' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'input',
              block_id: 'direction_input',
              label: { type: 'plain_text', text: 'What should the AI do?' },
              element: {
                type: 'plain_text_input',
                action_id: 'direction_text',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Describe the action you want the AI to take...',
                },
              },
            },
          ],
        },
      });
      log.info({ taskId }, 'override_take_action modal opened');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to open override_take_action modal');
    }
  });

  boltApp.action(SLACK_ACTION_ID.OVERRIDE_DISMISS, async ({ ack, body }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value ?? '';
    const user = actionBody.user;

    if (!taskId) {
      await ack();
      log.warn('override_dismiss received without task_id');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      text: `✅ Dismissed by <@${user.id}>`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `✅ Dismissed by <@${user.id}>` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    try {
      await inngest.send({
        name: 'employee/override.requested',
        data: { taskId, direction: null, userId: user.id, userName: user.name },
        id: `employee-override-dismiss-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Override dismiss event sent');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to send override dismiss event');
    }
  });

  boltApp.view('override_take_action_modal', async ({ ack, view, body, client }) => {
    const direction = view.state.values?.direction_input?.direction_text?.value ?? '';

    if (!direction || !direction.trim()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ack as any)({
        response_action: 'errors',
        errors: { direction_input: 'Direction cannot be empty.' },
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
      log.error('Failed to parse override_take_action_modal private_metadata');
      return;
    }

    if (!taskId) {
      log.error('override_take_action_modal submitted without taskId in private_metadata');
      return;
    }

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: '⏳ On it — working on your direction…',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '⏳ On it — working on your direction…' },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { taskId, updateErr },
          'Failed to remove buttons before override_take_action_modal work (non-fatal)',
        );
      }
    }

    const stillAwaiting = await isTaskAwaitingOverride(taskId);
    if (!stillAwaiting) {
      log.warn({ taskId }, 'Task already resolved — ignoring duplicate override submission');
      return;
    }

    const user = body.user;

    try {
      await inngest.send({
        name: 'employee/override.requested',
        data: { taskId, direction: direction.trim(), userId: user.id, userName: user.name },
        id: `employee-override-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Override take-action event sent');

      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: '⏳ On it — working on your direction…',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⏳ On it — working on your direction…' },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (updateErr) {
          log.warn(
            { taskId, updateErr },
            'Failed to update message after override submit (non-fatal)',
          );
        }
      }
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process override_take_action_modal submission');
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

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: '⏳ Got it — noting your rejection…',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '⏳ Got it — noting your rejection…' },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn({ taskId, updateErr }, 'Failed to show processing state (non-fatal)');
      }
    }

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId, {
        maxRetries: 10,
        retryDelayMs: 2000,
      });
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate reject submit');
        if (channelId && messageTs) {
          const statusMsg = await getTaskStatusMessage(taskId);
          try {
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              text: statusMsg,
              blocks: [
                {
                  type: 'section',
                  text: { type: 'mrkdwn', text: statusMsg },
                },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
              ],
            });
          } catch (updateErr) {
            log.warn(
              { taskId, updateErr },
              'Failed to update already-processed message (non-fatal)',
            );
          }
        }
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
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process guest_reject_modal submission');
      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: 'Hmm, something went wrong on my end — mind trying that again?',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: 'Hmm, something went wrong on my end — mind trying that again?',
                },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
              ...GUEST_BUTTON_BLOCKS(taskId),
            ],
          });
        } catch (updateErr) {
          log.warn(
            { taskId, updateErr },
            'Failed to restore buttons after rejection error (non-fatal)',
          );
        }
      }
    }
  });

  boltApp.action(SLACK_ACTION_ID.RULE_CONFIRM, async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channel = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;
    if (!ruleId) return;

    if (channel && messageTs) {
      try {
        await client.chat.update({
          channel,
          ts: messageTs,
          text: 'On it — one moment…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — one moment…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { ruleId, updateErr },
          'Failed to remove buttons before rule_confirm work (non-fatal)',
        );
      }
    }

    try {
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();
      const authHeaders = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };

      const patchRes = await fetch(`${supabaseUrl}/rest/v1/employee_rules?id=eq.${ruleId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: 'confirmed', confirmed_at: new Date().toISOString() }),
      });
      const patchedRows = (await patchRes.json()) as Array<{
        id: string;
        tenant_id: string;
        archetype_id: string;
        source: string;
        parent_rule_ids: string[];
        rule_text: string;
      }>;
      const patchedRule = patchedRows[0];

      if (channel && messageTs) {
        const ruleText = patchedRule?.rule_text ?? '';
        const displayText = ruleText
          ? `✅ Rule confirmed by <@${user.id}>\n\n> ${ruleText}`
          : `✅ Rule confirmed by <@${user.id}>`;
        await client.chat.update({
          channel,
          ts: messageTs,
          text: displayText,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: displayText } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      }

      if (!patchedRule) {
        log.warn({ ruleId }, 'rule_confirm: no rule returned after PATCH');
        return;
      }

      const {
        tenant_id: tenantId,
        archetype_id: archetypeId,
        source,
        parent_rule_ids: parentRuleIds,
      } = patchedRule;
      log.info({ ruleId, userId: user.id }, 'Rule confirmed');

      await inngest.send({
        name: 'employee/rule.confirmed',
        data: { ruleId, tenantId, archetypeId, confirmedBy: user.id },
      });

      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/employee_rules?status=eq.confirmed&archetype_id=eq.${archetypeId}&select=id`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
      );
      const confirmedRules = (await countRes.json()) as Array<{ id: string }>;
      const confirmedCount = confirmedRules.length;

      if (
        confirmedCount > 0 &&
        confirmedCount % parseInt(await getPlatformSetting('synthesis_threshold'), 10) === 0
      ) {
        await inngest.send({
          name: 'employee/rule.synthesize-requested',
          data: { tenantId, archetypeId, triggerRuleId: ruleId },
          id: `synthesis-${archetypeId}-${confirmedCount}`,
        });
        log.info({ archetypeId, confirmedCount }, 'Synthesis triggered after rule confirmation');
      }

      if (source === 'synthesis' && parentRuleIds.length > 0) {
        const idList = parentRuleIds.join(',');
        await fetch(`${supabaseUrl}/rest/v1/employee_rules?id=in.(${idList})`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ status: 'archived' }),
        });
        log.info({ ruleId, parentRuleIds }, 'Parent rules archived after synthesis confirmation');
      }
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to process rule_confirm');
      if (channel && messageTs) {
        try {
          await client.chat.update({
            channel,
            ts: messageTs,
            text: `✅ Rule confirmed by <@${user.id}>`,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `✅ Rule confirmed by <@${user.id}>` },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
            ],
          });
        } catch (updateErr) {
          log.warn(
            { ruleId, updateErr },
            'Failed to update Slack message after rule_confirm error (non-fatal)',
          );
        }
      }
    }
  });

  boltApp.action(SLACK_ACTION_ID.RULE_REJECT, async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channel = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;
    if (!ruleId) return;

    if (channel && messageTs) {
      try {
        await client.chat.update({
          channel,
          ts: messageTs,
          text: 'On it — one moment…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — one moment…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { ruleId, updateErr },
          'Failed to remove buttons before rule_reject work (non-fatal)',
        );
      }
    }

    try {
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();
      const patchRes = await fetch(`${supabaseUrl}/rest/v1/employee_rules?id=eq.${ruleId}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ status: 'rejected' }),
      });
      const patchedRows = (await patchRes.json()) as Array<{ rule_text: string }>;
      const ruleText = patchedRows[0]?.rule_text ?? '';
      log.info({ ruleId, userId: user.id }, 'Rule rejected');

      if (channel && messageTs) {
        const displayText = ruleText
          ? `❌ Rule rejected by <@${user.id}>\n\n> ${ruleText}`
          : `❌ Rule rejected by <@${user.id}>`;
        await client.chat.update({
          channel,
          ts: messageTs,
          text: displayText,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: displayText } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      }
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to PATCH employee_rules on reject');
      if (channel && messageTs) {
        try {
          await client.chat.update({
            channel,
            ts: messageTs,
            text: `❌ Rule rejected by <@${user.id}>`,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `❌ Rule rejected by <@${user.id}>` },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
            ],
          });
        } catch (updateErr) {
          log.warn(
            { ruleId, updateErr },
            'Failed to update Slack message after rule_reject error (non-fatal)',
          );
        }
      }
    }
  });

  boltApp.action(SLACK_ACTION_ID.RULE_REPHRASE, async ({ ack, body, client }) => {
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    if (!ruleId) {
      await ack();
      log.warn('rule_rephrase action received without ruleId');
      return;
    }
    await ack();

    const channel = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (channel && messageTs) {
      try {
        await client.chat.update({
          channel,
          ts: messageTs,
          text: 'On it — one moment…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — one moment…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { ruleId, updateErr },
          'Failed to remove buttons before rule_rephrase work (non-fatal)',
        );
      }
    }

    let currentRuleText = '';
    try {
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();
      const res = await fetch(
        `${supabaseUrl}/rest/v1/employee_rules?id=eq.${ruleId}&select=rule_text`,
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
          private_metadata: JSON.stringify({
            ruleId,
            channelId: channel ?? '',
            messageTs: messageTs ?? '',
          }),
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
    let rephraseChannelId = '';
    let rephraseMessageTs = '';
    try {
      const meta = JSON.parse(view.private_metadata ?? '{}') as {
        ruleId?: string;
        channelId?: string;
        messageTs?: string;
      };
      ruleId = meta.ruleId ?? '';
      rephraseChannelId = meta.channelId ?? '';
      rephraseMessageTs = meta.messageTs ?? '';
    } catch {
      log.error('Failed to parse rule_rephrase_modal private_metadata');
      return;
    }

    if (!ruleId) {
      log.error('rule_rephrase_modal submitted without ruleId in private_metadata');
      return;
    }

    if (rephraseChannelId && rephraseMessageTs) {
      try {
        await client.chat.update({
          channel: rephraseChannelId,
          ts: rephraseMessageTs,
          text: 'On it — saving your rephrase…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — saving your rephrase…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { ruleId, updateErr },
          'Failed to remove buttons before rule_rephrase_modal work (non-fatal)',
        );
      }
    }

    try {
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();

      await fetch(`${supabaseUrl}/rest/v1/employee_rules?id=eq.${ruleId}`, {
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
        `${supabaseUrl}/rest/v1/employee_rules?id=eq.${ruleId}&select=slack_ts,slack_channel`,
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
          text: ruleProposedMessage(newText.trim()),
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ruleProposedMessage(newText.trim()),
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
                  action_id: SLACK_ACTION_ID.RULE_CONFIRM,
                  value: ruleId,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '❌ Reject' },
                  style: 'danger',
                  action_id: SLACK_ACTION_ID.RULE_REJECT,
                  value: ruleId,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✏️ Rephrase' },
                  action_id: SLACK_ACTION_ID.RULE_REPHRASE,
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

  boltApp.action(SLACK_ACTION_ID.TRIGGER_CONFIRM, async ({ ack, body, respond, client }) => {
    const actionBody = body as ActionBody;
    const valueStr = actionBody.actions[0]?.value;
    const user = actionBody.user;

    if (!valueStr) {
      await ack();
      log.warn('trigger_confirm action received without value');
      return;
    }

    let ctx: {
      archetypeId: string;
      tenantId: string;
      userId: string;
      channelId: string;
      threadTs: string;
      text: string;
      extractedInputs?: Record<string, string>;
    };
    try {
      ctx = JSON.parse(valueStr) as typeof ctx;
    } catch {
      await ack();
      log.warn({ valueStr }, 'trigger_confirm: failed to parse button value as JSON');
      return;
    }

    await ack();
    await new Promise<void>((resolve) => setImmediate(resolve));

    log.info(
      { archetypeId: ctx.archetypeId, tenantId: ctx.tenantId, userId: user.id },
      'trigger_confirm action received — dispatching task',
    );

    const loadingText = loadingMessage('your request');
    try {
      await respond({
        replace_original: true,
        text: loadingText,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: loadingText } }],
      });
    } catch (err) {
      log.warn(
        { archetypeId: ctx.archetypeId, err },
        'Failed to show pending feedback on trigger_confirm',
      );
    }

    let dispatched = false;

    try {
      const supabaseUrl = SUPABASE_URL();
      const headers = supabaseHeaders();

      const archetypeRes = await fetch(
        `${supabaseUrl}/rest/v1/archetypes?id=eq.${ctx.archetypeId}&tenant_id=eq.${ctx.tenantId}&status=eq.active&deleted_at=is.null&select=id,role_name,input_schema`,
        { headers },
      );
      const archetypes = (await archetypeRes.json()) as Array<{
        id: string;
        role_name: string;
        input_schema: unknown;
      }>;
      if (!archetypes.length) {
        throw new Error(`Archetype not found or inactive: ${ctx.archetypeId}`);
      }
      const archetype = archetypes[0];

      const externalId = `slack-trigger-${ctx.threadTs}-${ctx.archetypeId}`;

      const requiredInputs = Array.isArray(archetype.input_schema)
        ? (
            archetype.input_schema as Array<{
              key: string;
              label: string;
              description?: string;
              required?: boolean;
              frequency?: string;
              type?: string;
              options?: string[];
            }>
          )
            .filter(
              (item) =>
                item.required === true &&
                (item.frequency === 'every_run' || item.frequency === undefined),
            )
            .map((item) => ({
              key: item.key,
              label: item.label,
              description: item.description,
              type: item.type,
              options: item.options,
            }))
        : [];

      const preExtracted = ctx.extractedInputs;
      const extractedInputs =
        requiredInputs.length > 0
          ? preExtracted && Object.keys(preExtracted).length > 0
            ? preExtracted
            : await extractInputsFromText(ctx.text, requiredInputs, callLLM)
          : {};

      const missingInputs = requiredInputs.filter((inp) => !(inp.key in extractedInputs));
      const allFound = requiredInputs.length > 0 && missingInputs.length === 0;
      const someFound = Object.keys(extractedInputs).length > 0 && missingInputs.length > 0;

      if (allFound) {
        const confirmText = loadingMessage(archetype.role_name);

        await client.chat.postMessage({
          channel: ctx.channelId,
          ...(ctx.threadTs ? { thread_ts: ctx.threadTs } : {}),
          text: confirmText,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: confirmText } }],
        });

        const createRes = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: randomUUID(),
            archetype_id: archetype.id,
            external_id: externalId,
            source_system: 'slack',
            status: 'Ready',
            tenant_id: ctx.tenantId,
            updated_at: new Date().toISOString(),
            raw_event: { inputs: { prompt: ctx.text, ...extractedInputs } },
          }),
        });
        const tasks = (await createRes.json()) as Array<{ id: string }>;
        let taskId: string;
        if (!tasks.length) {
          // PostgREST returns [] on duplicate unique constraint — check if task already exists
          const existingRes = await fetch(
            `${supabaseUrl}/rest/v1/tasks?external_id=eq.${encodeURIComponent(externalId)}&select=id`,
            { headers },
          );
          const existing = (await existingRes.json()) as Array<{ id: string }>;
          if (!existing.length) throw new Error('Task creation returned empty response');
          taskId = existing[0].id;
          log.info(
            { taskId, externalId, tenantId: ctx.tenantId },
            'Reusing existing task for duplicate trigger_confirm (idempotent)',
          );
        } else {
          taskId = tasks[0].id;
        }

        await inngest.send({
          name: 'employee/task.dispatched',
          data: { taskId, archetypeId: archetype.id },
          id: `employee-dispatch-${externalId}`,
        });
        dispatched = true;

        log.info(
          { taskId, archetypeId: archetype.id, tenantId: ctx.tenantId, extractedInputs },
          'Task dispatched from trigger_confirm with extracted inputs',
        );

        const successText = successMessage(archetype.role_name, user.id);
        try {
          await respond({
            replace_original: true,
            text: successText,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: successText },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
              },
            ],
          });
        } catch (err) {
          log.warn(
            { archetypeId: ctx.archetypeId, err },
            'Failed to show pending feedback on trigger_confirm',
          );
        }
        return;
      } else if (someFound || requiredInputs.length > 0) {
        const inputsToAsk = someFound ? missingInputs : requiredInputs;
        const inputList = inputsToAsk
          .map(
            (item, i) =>
              `${i + 1}. *${item.label}*${item.description ? ` — ${item.description}` : ''}`,
          )
          .join('\n');

        const pendingData: PendingInputCollection = {
          archetypeId: archetype.id,
          tenantId: ctx.tenantId,
          userId: user.id,
          channelId: ctx.channelId,
          text: ctx.text,
          roleName: archetype.role_name,
          requiredInputs,
          extractedInputs: someFound ? extractedInputs : undefined,
        };

        if (ctx.threadTs) {
          pendingInputCollections.set(ctx.threadTs, pendingData);
        }

        const missingInfoText = missingInfoMessage(archetype.role_name, inputList);
        const inputMsgResult = await client.chat.postMessage({
          channel: ctx.channelId,
          ...(ctx.threadTs ? { thread_ts: ctx.threadTs } : {}),
          text: missingInfoText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: missingInfoText },
            },
          ],
        });

        const pendingKey = ctx.threadTs ?? (inputMsgResult.ts as string | undefined);

        if (!ctx.threadTs) {
          pendingInputCollections.set(pendingKey, pendingData);
        }

        const waitingText = loadingMessage(archetype.role_name);
        await respond({
          replace_original: true,
          text: waitingText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: waitingText },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `Archetype \`${ctx.archetypeId}\`` }],
            },
          ],
        });

        log.info(
          {
            archetypeId: archetype.id,
            tenantId: ctx.tenantId,
            pendingKey,
            someFound,
            extractedCount: Object.keys(extractedInputs).length,
          },
          'Waiting for inputs in thread before dispatching task',
        );
        return;
      }

      const createRes = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: randomUUID(),
          archetype_id: archetype.id,
          external_id: externalId,
          source_system: 'slack',
          status: 'Ready',
          tenant_id: ctx.tenantId,
          updated_at: new Date().toISOString(),
          raw_event: { inputs: { prompt: ctx.text } },
        }),
      });
      const tasks = (await createRes.json()) as Array<{ id: string }>;
      if (!tasks.length) {
        throw new Error('Task creation returned empty response');
      }
      const taskId = tasks[0].id;

      await inngest.send({
        name: 'employee/task.dispatched',
        data: { taskId, archetypeId: archetype.id },
        id: `employee-dispatch-${externalId}`,
      });
      dispatched = true;

      log.info(
        { taskId, archetypeId: archetype.id, tenantId: ctx.tenantId, userId: user.id },
        'Task dispatched from Slack trigger confirmation',
      );

      const successText = successMessage(archetype.role_name, user.id);
      try {
        await respond({
          replace_original: true,
          text: successText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: successText },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
            },
          ],
        });
      } catch (err) {
        log.warn(
          { archetypeId: ctx.archetypeId, err },
          'Failed to show pending feedback on trigger_confirm',
        );
      }
    } catch (err) {
      log.error(
        { archetypeId: ctx.archetypeId, err },
        'Failed to dispatch task from trigger_confirm',
      );
      if (!dispatched) {
        const failText = failureMessage();
        try {
          await respond({
            replace_original: true,
            text: failText,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: failText },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Archetype \`${ctx.archetypeId}\`` }],
              },
            ],
          });
        } catch (respondErr) {
          log.warn({ err: respondErr }, 'Failed to update message after trigger_confirm failure');
        }
      } else {
        log.warn(
          { archetypeId: ctx.archetypeId, err },
          'trigger_confirm: post-dispatch error after successful dispatch (suppressed false-failure message)',
        );
      }
    }
  });

  boltApp.action(SLACK_ACTION_ID.TRIGGER_CANCEL, async ({ ack, body, respond }) => {
    await ack();

    const actionBody = body as ActionBody;
    const valueStr = actionBody.actions[0]?.value;
    const user = actionBody.user;

    let archetypeId = '';
    if (valueStr) {
      try {
        const ctx = JSON.parse(valueStr) as { archetypeId?: string };
        archetypeId = ctx.archetypeId ?? '';
      } catch {
        archetypeId = '';
      }
    }

    log.info({ userId: user.id, archetypeId }, 'trigger_cancel action received');

    try {
      await respond({
        replace_original: true,
        text: `🚫 Cancelled by <@${user.id}>`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `🚫 Cancelled by <@${user.id}>` },
          },
          ...(archetypeId
            ? [
                {
                  type: 'context' as const,
                  elements: [{ type: 'mrkdwn' as const, text: `Archetype \`${archetypeId}\`` }],
                },
              ]
            : []),
        ],
      });
    } catch (err) {
      log.warn(
        { userId: user.id, archetypeId, err },
        'Failed to update message after trigger_cancel',
      );
    }
  });
}
