// All field names use snake_case to match PostgREST response format

export type TaskStatus =
  | 'Received'
  | 'Triaging'
  | 'AwaitingInput'
  | 'Ready'
  | 'Executing'
  | 'Validating'
  | 'Submitting'
  | 'Reviewing'
  | 'Approved'
  | 'Delivering'
  | 'Done'
  | 'Failed'
  | 'Cancelled';

export interface Task {
  id: string;
  tenant_id: string;
  archetype_id: string | null;
  project_id: string | null;
  external_id: string | null;
  source_system: string | null;
  status: TaskStatus;
  failure_reason: string | null;
  raw_event: Record<string, unknown> | null;
  requirements: Record<string, unknown> | null;
  triage_result: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  dispatch_attempts: number;
  scope_estimate: number | null;
  affected_resources: Record<string, unknown> | null;
  plan_content: string | null;
  plan_generated_at: string | null;
  cost_usd_cents: number;
  created_at: string;
  updated_at: string;
  // From PostgREST embedded join: ?select=*,archetypes(role_name,model)
  archetypes?: { role_name: string | null; model: string | null } | null;
}

export interface TaskStatusLog {
  id: string;
  task_id: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  actor: string;
  created_at: string;
  updated_at: string;
}

export interface Archetype {
  id: string;
  tenant_id: string;
  role_name: string | null;
  model: string | null;
  runtime: string | null;
  deliverable_type: string | null;
  risk_model: { approval_required: boolean; timeout_hours?: number } | null;
  concurrency_limit: number;
  notification_channel: string | null;
  vm_size: string | null;
  enrichment_adapter: string | null;
  pre_check_adapter: string | null;
  department_id: string | null;
  agent_version_id: string | null;
  instructions: string | null;
  system_prompt: string | null;
  trigger_sources: Record<string, unknown> | null;
  tool_registry: Record<string, unknown> | null;
  worker_env: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  config: Record<string, unknown> | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendingApproval {
  id: string;
  tenant_id: string;
  thread_uid: string;
  task_id: string; // TEXT not UUID FK — join with eq, not cast
  slack_ts: string;
  channel_id: string;
  urgency: boolean;
  recipient_name: string | null;
  context_label: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}

export interface EmployeeRule {
  id: string;
  tenant_id: string;
  archetype_id: string;
  rule_text: string;
  source: string;
  status: 'proposed' | 'confirmed' | 'awaiting_input';
  source_task_id: string | null;
  parent_rule_ids: string[];
  slack_ts: string | null;
  slack_channel: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface FeedbackEvent {
  id: string;
  tenant_id: string;
  archetype_id: string;
  task_id: string | null;
  event_type: 'teaching' | 'feedback' | 'rejection_reason' | 'rejection' | 'edit_diff';
  actor_id: string | null;
  correction_content: string | null;
  original_content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface TenantSecret {
  key: string;
  is_set: boolean;
}

export interface TenantIntegration {
  id: string;
  tenant_id: string;
  provider: string;
  external_id: string | null;
  config: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ToolFlag {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description?: string;
  default?: string;
}

export interface ToolEnvVar {
  name: string;
  required: boolean;
}

export interface ToolMetadata {
  name: string;
  service: string;
  containerPath: string;
  description: string;
  flags: ToolFlag[];
  envVars: ToolEnvVar[];
  outputShape?: string;
  notes?: string;
  example?: string;
  sourceLength: number;
}

export interface BrainPreviewEnvVar {
  name: string;
  source: 'platform' | 'tenant_secret' | 'tenant_config' | 'lifecycle' | 'raw_event' | 'harness';
  category: 'always' | 'conditional';
  is_set: boolean;
}

export interface BrainPreviewResponse {
  execution_prompt: string;
  delivery_prompt: string | null;
  agents_md: {
    full: string;
    layers: {
      platform: string;
      tenant: string | null;
      employee: string | null;
      rules: string | null;
      knowledge: string | null;
    };
  };
  env_vars: BrainPreviewEnvVar[];
  tools: Array<{ name: string; service: string; description: string; containerPath: string }>;
  skills: Array<{ name: string; description: string }>;
  config: {
    model: string;
    runtime: string;
    bash_timeout_ms: number;
    permissions: string;
    opencode_version: string;
  };
  output_contract: {
    required_files: Array<{ path: string; description: string; required: boolean }>;
  };
  employee_rules: string[];
  employee_knowledge: string[];
}
