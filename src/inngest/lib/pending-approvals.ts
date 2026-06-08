import { randomUUID } from 'node:crypto';
import { makePostgrestHeaders } from './postgrest-headers.js';

export interface PendingApproval {
  id: string;
  tenantId: string;
  threadUid: string;
  taskId: string;
  slackTs: string;
  channelId: string;
  createdAt: string;
  recipientName?: string;
  contextLabel?: string;
  urgency?: boolean;
}

export interface PendingApprovalData {
  tenantId: string;
  threadUid: string;
  taskId: string;
  slackTs: string;
  channelId: string;
  recipientName?: string;
  contextLabel?: string;
  urgency?: boolean;
}

export async function getPendingApproval(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId: string,
  threadUid: string,
): Promise<PendingApproval | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/pending_approvals?tenant_id=eq.${tenantId}&thread_uid=eq.${threadUid}&limit=1`,
    { headers: makePostgrestHeaders(supabaseKey) },
  );
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    threadUid: row['thread_uid'] as string,
    taskId: row['task_id'] as string,
    slackTs: row['slack_ts'] as string,
    channelId: row['channel_id'] as string,
    createdAt: row['created_at'] as string,
    recipientName: row['recipient_name'] as string | undefined,
    contextLabel: row['context_label'] as string | undefined,
    urgency: row['urgency'] as boolean | undefined,
  };
}

export async function trackPendingApproval(
  supabaseUrl: string,
  supabaseKey: string,
  data: PendingApprovalData,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/pending_approvals`, {
    method: 'POST',
    headers: {
      ...makePostgrestHeaders(supabaseKey),
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: randomUUID(),
      tenant_id: data.tenantId,
      thread_uid: data.threadUid,
      task_id: data.taskId,
      slack_ts: data.slackTs,
      channel_id: data.channelId,
      recipient_name: data.recipientName ?? null,
      context_label: data.contextLabel ?? null,
      urgency: data.urgency ?? false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`trackPendingApproval: PostgREST returned ${res.status}: ${body}`);
  }
}

export async function clearPendingApproval(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId: string,
  threadUid: string,
): Promise<void> {
  await fetch(
    `${supabaseUrl}/rest/v1/pending_approvals?tenant_id=eq.${tenantId}&thread_uid=eq.${threadUid}`,
    {
      method: 'DELETE',
      headers: makePostgrestHeaders(supabaseKey),
    },
  );
}

export async function clearPendingApprovalByTaskId(
  supabaseUrl: string,
  supabaseKey: string,
  taskId: string,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/pending_approvals?task_id=eq.${taskId}`, {
    method: 'DELETE',
    headers: makePostgrestHeaders(supabaseKey),
  });
}

export async function getStaleApprovals(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId: string,
  thresholdMinutes: number,
): Promise<PendingApproval[]> {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/pending_approvals?tenant_id=eq.${tenantId}&reminder_sent_at=is.null&created_at=lt.${cutoff}&order=created_at.asc`,
    { headers: makePostgrestHeaders(supabaseKey) },
  );
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    threadUid: row['thread_uid'] as string,
    taskId: row['task_id'] as string,
    slackTs: row['slack_ts'] as string,
    channelId: row['channel_id'] as string,
    createdAt: row['created_at'] as string,
    recipientName: row['recipient_name'] as string | undefined,
    contextLabel: row['context_label'] as string | undefined,
    urgency: row['urgency'] as boolean | undefined,
  }));
}

export async function markReminderSent(
  supabaseUrl: string,
  supabaseKey: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await fetch(`${supabaseUrl}/rest/v1/pending_approvals?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers: makePostgrestHeaders(supabaseKey),
    body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
  });
}
