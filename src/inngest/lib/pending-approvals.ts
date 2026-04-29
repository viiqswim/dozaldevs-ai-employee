export interface PendingApproval {
  id: string;
  tenantId: string;
  threadUid: string;
  taskId: string;
  slackTs: string;
  channelId: string;
  createdAt: string;
  guestName?: string;
  propertyName?: string;
  urgency?: boolean;
}

export interface PendingApprovalData {
  tenantId: string;
  threadUid: string;
  taskId: string;
  slackTs: string;
  channelId: string;
  guestName?: string;
  propertyName?: string;
  urgency?: boolean;
}

function makeHeaders(supabaseKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };
}

export async function getPendingApproval(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId: string,
  threadUid: string,
): Promise<PendingApproval | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/pending_approvals?tenant_id=eq.${tenantId}&thread_uid=eq.${threadUid}&limit=1`,
    { headers: makeHeaders(supabaseKey) },
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
    guestName: row['guest_name'] as string | undefined,
    propertyName: row['property_name'] as string | undefined,
    urgency: row['urgency'] as boolean | undefined,
  };
}

export async function trackPendingApproval(
  supabaseUrl: string,
  supabaseKey: string,
  data: PendingApprovalData,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/pending_approvals`, {
    method: 'POST',
    headers: {
      ...makeHeaders(supabaseKey),
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      tenant_id: data.tenantId,
      thread_uid: data.threadUid,
      task_id: data.taskId,
      slack_ts: data.slackTs,
      channel_id: data.channelId,
      guest_name: data.guestName ?? null,
      property_name: data.propertyName ?? null,
      urgency: data.urgency ?? false,
    }),
  });
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
      headers: makeHeaders(supabaseKey),
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
    headers: makeHeaders(supabaseKey),
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
    { headers: makeHeaders(supabaseKey) },
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
    guestName: row['guest_name'] as string | undefined,
    propertyName: row['property_name'] as string | undefined,
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
    headers: makeHeaders(supabaseKey),
    body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
  });
}
