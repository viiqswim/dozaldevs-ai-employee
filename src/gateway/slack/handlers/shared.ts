import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../../lib/logger.js';
import { SLACK_ACTION_ID } from '../../../lib/slack-action-ids.js';
import {
  TERMINAL_STATUSES,
  APPROVAL_IDEMPOTENCY_TERMINAL_STATUSES,
} from '../../../lib/task-status.js';
import { SUPABASE_URL, SUPABASE_SECRET_KEY as SUPABASE_KEY } from '../../../lib/config.js';
import { TaskRepository } from '../../../repositories/task-repository.js';

const log = createLogger('slack-handlers');

export { SUPABASE_URL, SUPABASE_KEY };

const prisma = new PrismaClient();
const taskRepository = new TaskRepository(prisma);

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

export async function findTaskIdByThreadTs(threadTs: string): Promise<string | null> {
  try {
    return await taskRepository.findIdByThreadTs(threadTs);
  } catch (err) {
    log.warn({ threadTs, err }, 'Failed to look up task by thread_ts');
    return null;
  }
}

export async function isTaskAwaitingApproval(
  taskId: string,
  { maxRetries = 0, retryDelayMs = 2000 }: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }
    try {
      const task = await taskRepository.findById(taskId);
      if (!task) {
        log.warn({ taskId }, 'Task not found during idempotency check');
        return false;
      }
      const { status } = task;
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
  try {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      log.warn({ taskId }, 'Task not found during override idempotency check');
      return false;
    }
    return !TERMINAL_STATUSES.has(task.status);
  } catch (err) {
    log.error(
      { taskId, err },
      'Failed to check task status for override — proceeding optimistically',
    );
    return true;
  }
}

export async function getTaskStatusMessage(taskId: string): Promise<string> {
  try {
    return await taskRepository.getStatusMessage(taskId);
  } catch {
    return 'Looks like this one has already been handled.';
  }
}

export async function handleAlreadyProcessed(
  taskId: string,
  updateFn: (statusMsg: string) => Promise<unknown>,
): Promise<void> {
  try {
    const statusMsg = await getTaskStatusMessage(taskId);
    await updateFn(statusMsg);
  } catch (err) {
    log.warn({ taskId, err }, 'Failed to update already-processed message');
  }
}
