import { createLogger } from '../../../lib/logger.js';
import { SLACK_ACTION_ID } from '../../../lib/slack-action-ids.js';
import {
  TERMINAL_STATUSES,
  APPROVAL_IDEMPOTENCY_TERMINAL_STATUSES,
} from '../../../lib/task-status.js';

const log = createLogger('slack-handlers');

// ─── Supabase REST helpers ────────────────────────────────────────────────────
export const SUPABASE_URL = () => process.env.SUPABASE_URL ?? '';
export const SUPABASE_KEY = () => process.env.SUPABASE_SECRET_KEY ?? '';
const supabaseHeaders = () => ({
  apikey: SUPABASE_KEY(),
  Authorization: `Bearer ${SUPABASE_KEY()}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
});

// ─── Shared types ─────────────────────────────────────────────────────────────
export interface ActionBody {
  actions: Array<{ value: string }>;
  user: { id: string; name: string };
  channel?: { id: string };
  message?: { ts: string };
}

// Bolt types block-action `ack` as AckFn<void> and does not model the legacy
// message-replacement body, so handlers cast through LegacyMessageAck instead of `any`.
interface LegacyMessageAckBody {
  replace_original?: boolean;
  text?: string;
  blocks?: unknown[];
}

export type LegacyMessageAck = (body: LegacyMessageAckBody) => Promise<void>;

const TRANSIENT_PRE_REVIEWING = new Set(['Submitting', 'Validating', 'Executing']);

// ─── Button block builders ────────────────────────────────────────────────────
export const BUTTON_BLOCKS = (taskId: string) => [
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve', emoji: true },
        action_id: SLACK_ACTION_ID.APPROVE,
        value: taskId,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Edit & Send', emoji: true },
        action_id: SLACK_ACTION_ID.EDIT_AND_SEND,
        value: taskId,
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

// ─── Pending input collection (in-memory, per process) ────────────────────────
export interface PendingInputCollection {
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

export const pendingInputCollections = new Map<string, PendingInputCollection>();

export function _clearPendingInputCollections(): void {
  pendingInputCollections.clear();
}

// ─── Mention deduplication (in-memory, per process) ───────────────────────────
/** Deduplicates app_mention events — Slack Socket Mode delivers at-least-once.
 *  Key: `${ts}:${channel}`, Value: timestamp (ms).
 *  Single-process scoped — acceptable for current single-instance deployment. */
export const recentMentions = new Map<string, number>();
export const MENTION_DEDUP_TTL_MS = 30_000;

export function _clearRecentMentions(): void {
  recentMentions.clear();
}

// ─── Supabase query helpers ───────────────────────────────────────────────────
export async function findTaskIdByThreadTs(threadTs: string): Promise<string | null> {
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

export async function isTaskAwaitingApproval(
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
      if (APPROVAL_IDEMPOTENCY_TERMINAL_STATUSES.has(status)) return false;
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

export async function isTaskAwaitingOverride(taskId: string): Promise<boolean> {
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
    return !TERMINAL_STATUSES.has(rows[0].status);
  } catch (err) {
    log.error(
      { taskId, err },
      'Failed to check task status for override — proceeding optimistically',
    );
    return true;
  }
}

export async function getTaskStatusMessage(taskId: string): Promise<string> {
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
