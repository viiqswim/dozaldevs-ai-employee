export interface PendingApproval {
  id: string;
  tenantId: string;
  threadUid: string;
  taskId: string;
  slackTs: string;
  channelId: string;
  createdAt: string;
}

export interface PendingApprovalData {
  tenantId: string;
  threadUid: string;
  taskId: string;
  slackTs: string;
  channelId: string;
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
