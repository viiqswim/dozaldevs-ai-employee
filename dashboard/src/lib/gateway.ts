import { GATEWAY_URL, INNGEST_URL } from './constants';
import type { Archetype, Task, TenantSecret, ToolMetadata, BrainPreviewResponse } from './types';

export function getAdminApiKey(): string | null {
  return localStorage.getItem('admin_api_key');
}

export function setAdminApiKey(key: string): void {
  localStorage.setItem('admin_api_key', key);
}

export function isAdminKeySet(): boolean {
  return !!localStorage.getItem('admin_api_key');
}

export async function gatewayFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const key = getAdminApiKey();
  if (!key) {
    throw new Error('Admin API key not set. Please configure it in the dashboard.');
  }

  const url = `${GATEWAY_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': key,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway error ${response.status} on ${path}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function triggerEmployee(
  tenantId: string,
  slug: string,
  dryRun?: boolean,
): Promise<{ task_id: string; status_url: string }> {
  const body = dryRun ? { dry_run: true } : {};
  const query = dryRun ? '?dry_run=true' : '';
  return gatewayFetch<{ task_id: string; status_url: string }>(
    `/admin/tenants/${tenantId}/employees/${slug}/trigger${query}`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function getTaskStatus(tenantId: string, taskId: string): Promise<Task> {
  return gatewayFetch<Task>(`/admin/tenants/${tenantId}/tasks/${taskId}`);
}

export async function listSecrets(tenantId: string): Promise<TenantSecret[]> {
  const data = await gatewayFetch<{ secrets: TenantSecret[] }>(
    `/admin/tenants/${tenantId}/secrets`,
  );
  return data.secrets ?? [];
}

export async function setSecret(tenantId: string, key: string, value: string): Promise<void> {
  await gatewayFetch<unknown>(`/admin/tenants/${tenantId}/secrets/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export async function patchArchetype(
  tenantId: string,
  archetypeId: string,
  data: Partial<
    Pick<
      Archetype,
      | 'role_name'
      | 'model'
      | 'runtime'
      | 'instructions'
      | 'system_prompt'
      | 'notification_channel'
      | 'vm_size'
      | 'deliverable_type'
      | 'concurrency_limit'
    > & { risk_model?: Record<string, unknown> }
  >,
): Promise<Archetype> {
  return gatewayFetch<Archetype>(`/admin/tenants/${tenantId}/archetypes/${archetypeId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function fireApprovalEvent(
  taskId: string,
  action: 'approve' | 'reject',
  userId?: string,
  userName?: string,
): Promise<void> {
  const response = await fetch(`${INNGEST_URL}/e/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'employee/approval.received',
      data: {
        taskId,
        action,
        userId: userId ?? 'dashboard-user',
        userName: userName ?? 'Dashboard',
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Inngest approval event error ${response.status}: ${text}`);
  }
}

export async function fetchTools(): Promise<{ tools: ToolMetadata[] }> {
  return gatewayFetch<{ tools: ToolMetadata[] }>('/admin/tools');
}

export async function fetchTool(service: string, toolName: string): Promise<ToolMetadata> {
  return gatewayFetch<ToolMetadata>(`/admin/tools/${service}/${toolName}`);
}

export async function fetchBrainPreview(
  tenantId: string,
  archetypeId: string,
): Promise<BrainPreviewResponse | null> {
  try {
    return await gatewayFetch<BrainPreviewResponse>(
      `/admin/tenants/${tenantId}/archetypes/${archetypeId}/brain-preview`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) {
      return null;
    }
    throw err;
  }
}
