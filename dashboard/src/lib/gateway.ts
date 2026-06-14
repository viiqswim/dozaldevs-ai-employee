import { GATEWAY_URL, INNGEST_URL, WEBHOOK_FIXTURES } from './constants';
import type {
  Archetype,
  Task,
  TenantSecret,
  ToolMetadata,
  BrainPreviewResponse,
  GenerateArchetypeResponse,
  CreateArchetypePayload,
  SlackChannel,
  EmployeeRule,
  ModelRecommendationEntry,
  ModelCatalogEntry,
  PlatformSetting,
  GitHubRepo,
  GitHubInstallation,
  AdminTenant,
  ComposioConnection,
  ComposioToolkitsPage,
  ProposalResponse,
  ConverseMessage,
  ConverseResponse,
  RecordEditHistoryPayload,
  EditHistoryRow,
} from './types';

export type MeResponse = {
  id: string | null;
  email: string | null;
  name: string | null;
  globalRole: string;
  status: string;
};

export type MemberInfo = {
  userId: string;
  email: string;
  name: string | null;
  tenantRole: string;
  joinedAt: string;
};

export type InvitationInfo = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
};

export type InvitationLookupResult = {
  email: string;
  organizationName: string;
  role: string;
  status: string;
  expiresAt: string;
  isExistingUser: boolean;
};

export type ModelRecommendation = {
  recommended: ModelRecommendationEntry | null;
  cheaperAlternative: ModelRecommendationEntry | null;
  premiumAlternative: ModelRecommendationEntry | null;
};

export type ModelQuestionAnswers = {
  audience: string;
  frequency: string;
  speedPreference: string;
};

export function getAccessToken(): string | null {
  return localStorage.getItem('supabase_access_token');
}

export async function gatewayFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();

  const url = `${GATEWAY_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway error ${response.status} on ${path}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function getMe(): Promise<MeResponse> {
  return gatewayFetch<MeResponse>('/me');
}

export async function triggerEmployee(
  tenantId: string,
  slug: string,
  dryRun?: boolean,
  inputs?: Record<string, string>,
  prompt?: string,
): Promise<{ task_id: string; status_url: string }> {
  const body: Record<string, unknown> = dryRun ? { dry_run: true } : {};
  if (inputs !== undefined) {
    body.inputs = inputs;
  }
  if (prompt !== undefined && prompt.trim()) {
    body.prompt = prompt.trim();
  }
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

export async function deleteSecret(tenantId: string, key: string): Promise<void> {
  await gatewayFetch<unknown>(`/admin/tenants/${tenantId}/secrets/${key}`, {
    method: 'DELETE',
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
      | 'delivery_instructions'
      | 'notification_channel'
      | 'vm_size'
      | 'deliverable_type'
      | 'concurrency_limit'
      | 'status'
      | 'parent_draft_id'
      | 'overview'
      | 'input_schema'
      | 'worker_env'
      | 'identity'
      | 'execution_steps'
      | 'delivery_steps'
      | 'temperature'
      | 'tool_registry'
      | 'trigger_sources'
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

export async function compilePreview(
  tenantId: string,
  fields: { identity: string; execution_steps: string; delivery_steps: string | null },
): Promise<{ compiled_agents_md: string }> {
  return gatewayFetch<{ compiled_agents_md: string }>(
    `/admin/tenants/${tenantId}/archetypes/compile-preview`,
    {
      method: 'POST',
      body: JSON.stringify(fields),
    },
  );
}

export async function generateArchetype(
  tenantId: string,
  description: string,
): Promise<GenerateArchetypeResponse> {
  return gatewayFetch<GenerateArchetypeResponse>(`/admin/tenants/${tenantId}/archetypes/generate`, {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
}

export async function refineArchetype(
  tenantId: string,
  description: string,
  previousConfig: GenerateArchetypeResponse,
  refinementInstruction: string,
): Promise<GenerateArchetypeResponse> {
  return gatewayFetch<GenerateArchetypeResponse>(`/admin/tenants/${tenantId}/archetypes/generate`, {
    method: 'POST',
    body: JSON.stringify({
      description,
      previous_config: previousConfig,
      refinement_instruction: refinementInstruction,
    }),
  });
}

export async function createArchetype(
  tenantId: string,
  config: CreateArchetypePayload,
): Promise<Archetype> {
  return gatewayFetch<Archetype>(`/admin/tenants/${tenantId}/archetypes`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function deleteArchetype(
  tenantId: string,
  archetypeId: string,
): Promise<{ id: string; deleted_at: string }> {
  return gatewayFetch(`/admin/tenants/${tenantId}/archetypes/${archetypeId}`, {
    method: 'DELETE',
  });
}

export async function restoreArchetype(tenantId: string, archetypeId: string): Promise<Archetype> {
  return gatewayFetch(`/admin/tenants/${tenantId}/archetypes/${archetypeId}/restore`, {
    method: 'POST',
  });
}

export async function createRule(
  tenantId: string,
  archetypeId: string,
  ruleText: string,
): Promise<EmployeeRule> {
  return gatewayFetch<EmployeeRule>(`/admin/tenants/${tenantId}/employees/${archetypeId}/rules`, {
    method: 'POST',
    body: JSON.stringify({ rule_text: ruleText }),
  });
}

export async function updateRule(
  tenantId: string,
  archetypeId: string,
  ruleId: string,
  data: { status?: 'confirmed' | 'rejected'; rule_text?: string },
): Promise<EmployeeRule> {
  return gatewayFetch<EmployeeRule>(
    `/admin/tenants/${tenantId}/employees/${archetypeId}/rules/${ruleId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteRule(
  tenantId: string,
  archetypeId: string,
  ruleId: string,
): Promise<void> {
  await gatewayFetch<unknown>(
    `/admin/tenants/${tenantId}/employees/${archetypeId}/rules/${ruleId}`,
    { method: 'DELETE' },
  );
}

export async function recommendModel(
  tenantId: string,
  archetype: Pick<GenerateArchetypeResponse, 'instructions' | 'deliverable_type'>,
  answers: ModelQuestionAnswers,
): Promise<ModelRecommendation> {
  return gatewayFetch<ModelRecommendation>(
    `/admin/tenants/${tenantId}/archetypes/recommend-model`,
    {
      method: 'POST',
      body: JSON.stringify({
        archetype: {
          identity: '',
          instructions: archetype.instructions,
          deliverable_type: archetype.deliverable_type,
        },
        userAnswers: answers,
      }),
    },
  );
}

export async function fetchSlackChannels(
  tenantId: string,
): Promise<{ channels: SlackChannel[]; error?: string }> {
  const token = getAccessToken();
  const url = `${GATEWAY_URL}/admin/tenants/${tenantId}/slack/channels`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { channels: [], error: (body as { error?: string }).error ?? 'SLACK_ERROR' };
  }
  return body as { channels: SlackChannel[]; error?: string };
}

export async function listModelCatalog(): Promise<ModelCatalogEntry[]> {
  const data = await gatewayFetch<{ models: ModelCatalogEntry[] } | ModelCatalogEntry[]>(
    `/admin/model-catalog`,
  );
  return Array.isArray(data) ? data : ((data as { models: ModelCatalogEntry[] }).models ?? []);
}

export async function createModelCatalogEntry(
  payload: Omit<ModelCatalogEntry, 'id' | 'created_at' | 'updated_at' | 'supported_gateways'>,
): Promise<ModelCatalogEntry> {
  return gatewayFetch<ModelCatalogEntry>(`/admin/model-catalog`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateModelCatalogEntry(
  id: string,
  payload: Partial<
    Omit<ModelCatalogEntry, 'id' | 'created_at' | 'updated_at' | 'supported_gateways'>
  >,
): Promise<ModelCatalogEntry> {
  return gatewayFetch<ModelCatalogEntry>(`/admin/model-catalog/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteModelCatalogEntry(id: string): Promise<void> {
  await gatewayFetch<unknown>(`/admin/model-catalog/${id}`, {
    method: 'DELETE',
  });
}

export async function listPlatformSettings(): Promise<PlatformSetting[]> {
  return gatewayFetch<PlatformSetting[]>('/admin/platform-settings');
}

export async function updatePlatformSetting(key: string, value: string): Promise<PlatformSetting> {
  return gatewayFetch<PlatformSetting>(`/admin/platform-settings/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}

export async function invalidateComposioCache(): Promise<void> {
  await gatewayFetch<unknown>('/admin/composio/cache/invalidate', { method: 'POST' });
}

export async function fetchGitHubRepos(tenantId: string): Promise<{ repos: GitHubRepo[] }> {
  return gatewayFetch<{ repos: GitHubRepo[] }>(`/admin/tenants/${tenantId}/github/repos`);
}

export async function fetchAvailableInstallations(
  tenantId: string,
): Promise<{ installations: GitHubInstallation[] }> {
  return gatewayFetch<{ installations: GitHubInstallation[] }>(
    `/admin/tenants/${tenantId}/github/available-installations`,
  );
}

export async function linkGitHubInstallation(
  tenantId: string,
  installationId: string,
): Promise<{ linked: boolean; installation_id: string }> {
  return gatewayFetch<{ linked: boolean; installation_id: string }>(
    `/admin/tenants/${tenantId}/github/link-installation`,
    {
      method: 'POST',
      body: JSON.stringify({ installation_id: installationId }),
    },
  );
}

export async function disconnectGitHub(tenantId: string): Promise<{ disconnected: boolean }> {
  return gatewayFetch<{ disconnected: boolean }>(`/admin/tenants/${tenantId}/integrations/github`, {
    method: 'DELETE',
  });
}

export async function disconnectGoogle(tenantId: string): Promise<{ disconnected: boolean }> {
  return gatewayFetch<{ disconnected: boolean }>(`/admin/tenants/${tenantId}/integrations/google`, {
    method: 'DELETE',
  });
}

export async function disconnectSlack(tenantId: string): Promise<{ disconnected: boolean }> {
  return gatewayFetch<{ disconnected: boolean }>(`/admin/tenants/${tenantId}/integrations/slack`, {
    method: 'DELETE',
  });
}

export async function disconnectJira(tenantId: string): Promise<{ disconnected: boolean }> {
  return gatewayFetch<{ disconnected: boolean }>(`/admin/tenants/${tenantId}/integrations/jira`, {
    method: 'DELETE',
  });
}

export async function disconnectNotion(tenantId: string): Promise<{ disconnected: boolean }> {
  return gatewayFetch<{ disconnected: boolean }>(`/admin/tenants/${tenantId}/integrations/notion`, {
    method: 'DELETE',
  });
}

export async function listMembers(tenantId: string): Promise<MemberInfo[]> {
  return gatewayFetch<MemberInfo[]>(`/admin/tenants/${tenantId}/members`);
}

export async function changeMemberRole(
  tenantId: string,
  userId: string,
  role: string,
): Promise<void> {
  await gatewayFetch<unknown>(`/admin/tenants/${tenantId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(tenantId: string, userId: string): Promise<void> {
  const token = getAccessToken();
  const url = `${GATEWAY_URL}/admin/tenants/${tenantId}/members/${userId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway error ${response.status}: ${text}`);
  }
}

export async function inviteMember(
  tenantId: string,
  email: string,
  role: string,
): Promise<InvitationInfo> {
  return gatewayFetch<InvitationInfo>(`/admin/tenants/${tenantId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function listInvitations(tenantId: string): Promise<InvitationInfo[]> {
  return gatewayFetch<InvitationInfo[]>(`/admin/tenants/${tenantId}/invitations`);
}

export async function revokeInvitation(tenantId: string, invitationId: string): Promise<void> {
  await gatewayFetch<unknown>(`/admin/tenants/${tenantId}/invitations/${invitationId}/revoke`, {
    method: 'POST',
  });
}

export async function getInvitationByToken(token: string): Promise<InvitationLookupResult> {
  return gatewayFetch<InvitationLookupResult>(`/invitations/${token}`);
}

export async function setInvitationPassword(token: string, password: string): Promise<void> {
  await gatewayFetch<void>('/invitations/set-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function acceptInvitation(token: string): Promise<void> {
  await gatewayFetch<void>('/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function declineInvitation(token: string): Promise<void> {
  await gatewayFetch<void>('/invitations/decline', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function fireHostfullyWebhook(messageUid: string): Promise<void> {
  const response = await fetch(`${GATEWAY_URL}/webhooks/hostfully`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...WEBHOOK_FIXTURES,
      event_type: 'NEW_INBOX_MESSAGE',
      message_uid: messageUid,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook error ${response.status}: ${text}`);
  }
}

export async function listAllTenants(includeDeleted?: boolean): Promise<AdminTenant[]> {
  const query = includeDeleted ? '?include_deleted=true' : '';
  const data = await gatewayFetch<{ tenants: AdminTenant[] }>(`/admin/tenants${query}`);
  return data.tenants ?? [];
}

export async function createTenant(payload: {
  name: string;
  slug: string;
  config?: Record<string, unknown>;
}): Promise<AdminTenant & { install_link: string }> {
  return gatewayFetch<AdminTenant & { install_link: string }>('/admin/tenants', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listComposioConnections(tenantId: string): Promise<ComposioConnection[]> {
  return gatewayFetch<ComposioConnection[]>(`/admin/tenants/${tenantId}/composio/connections`);
}

export async function getComposioConnectUrl(
  tenantId: string,
  toolkit: string,
): Promise<{ url: string }> {
  return gatewayFetch<{ url: string }>(
    `/admin/tenants/${tenantId}/composio/connect?toolkit=${toolkit}`,
  );
}

export async function disconnectComposioApp(tenantId: string, toolkit: string): Promise<void> {
  const token = getAccessToken();
  const url = `${GATEWAY_URL}/admin/tenants/${tenantId}/composio/connections/${toolkit}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gateway error ${response.status}: ${text}`);
  }
}

export async function listComposioToolkits(
  tenantId: string,
  opts?: {
    cursor?: string;
    search?: string;
    category?: string;
    limit?: number;
    connectable?: true;
  },
): Promise<ComposioToolkitsPage> {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set('cursor', opts.cursor);
  if (opts?.search) params.set('search', opts.search);
  if (opts?.category) params.set('category', opts.category);
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.connectable) params.set('connectable', 'true');
  const qs = params.toString();
  const url = `/admin/tenants/${tenantId}/composio/toolkits${qs ? `?${qs}` : ''}`;
  return gatewayFetch<ComposioToolkitsPage>(url);
}

export async function converseEdit(
  tenantId: string,
  archetypeId: string,
  transcript: ConverseMessage[],
): Promise<ConverseResponse> {
  return gatewayFetch<ConverseResponse>(
    `/admin/tenants/${tenantId}/archetypes/${archetypeId}/propose-edit`,
    {
      method: 'POST',
      body: JSON.stringify({ transcript }),
    },
  );
}

export async function recordEditHistory(
  tenantId: string,
  archetypeId: string,
  payload: RecordEditHistoryPayload,
): Promise<EditHistoryRow> {
  return gatewayFetch<EditHistoryRow>(
    `/admin/tenants/${tenantId}/archetypes/${archetypeId}/edit-history`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function listEditHistory(
  tenantId: string,
  archetypeId: string,
): Promise<EditHistoryRow[]> {
  return gatewayFetch<EditHistoryRow[]>(
    `/admin/tenants/${tenantId}/archetypes/${archetypeId}/edit-history`,
  );
}

export async function revertEdit(
  tenantId: string,
  archetypeId: string,
  historyId: string,
): Promise<{ archetype: Archetype; history: EditHistoryRow }> {
  return gatewayFetch<{ archetype: Archetype; history: EditHistoryRow }>(
    `/admin/tenants/${tenantId}/archetypes/${archetypeId}/edit-history/${historyId}/revert`,
    { method: 'POST' },
  );
}
