export interface TaskRow {
  id: string;
  archetype_id: string | null;
  project_id: string | null;
  external_id: string | null;
  source_system: string | null;
  status: string;
  requirements: unknown | null;
  scope_estimate: number | null;
  affected_resources: unknown | null;
  tenant_id: string;
  raw_event: unknown | null;
  dispatch_attempts: number;
  failure_reason: string | null;
  triage_result: unknown | null;
  metadata: unknown | null;
  plan_content: string | null;
  plan_generated_at: string | null;
  cost_usd_cents: number;
  started_at: string | null;
  completed_at: string | null;
  failure_code: string | null;
  compiled_agents_md: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ArchetypeRow {
  id: string;
  department_id: string | null;
  role_name: string | null;
  runtime: string | null;
  trigger_sources: unknown | null;
  tool_registry: unknown | null;
  risk_model: unknown | null;
  concurrency_limit: number;
  agent_version_id: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  execution_instructions: string | null;
  delivery_instructions: string | null;
  notification_channel: string | null;
  vm_size: string | null;
  enrichment_adapter: string | null;
  pre_check_adapter: string | null;
  worker_env: unknown | null;
  input_schema: unknown | null;
  model: string;
  deliverable_type: string | null;
  status: string;
  overview: unknown | null;
  parent_draft_id: string | null;
  deleted_at: string | null;
  estimated_manual_minutes: number | null;
  estimated_manual_minutes_override: number | null;
  identity: string | null;
  execution_steps: string | null;
  delivery_steps: string | null;
  temperature: number | null;
  platform_rules_override: string | null;
}

export interface ExecutionRow {
  id: string;
  task_id: string;
  runtime_type: string | null;
  phase: string;
  runtime_id: string | null;
  fix_iterations: number;
  status: string;
  agent_version_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  primary_model_id: string | null;
  estimated_cost_usd: string; // Prisma Decimal serializes as string in PostgREST
  heartbeat_at: string | null;
  current_stage: string | null;
  wave_number: number | null;
  wave_state: unknown | null;
  session_transcript: unknown | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  config: unknown | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PendingApprovalRow {
  id: string;
  tenant_id: string;
  thread_uid: string;
  task_id: string;
  slack_ts: string;
  channel_id: string;
  created_at: string;
  reminder_sent_at: string | null;
  urgency: boolean;
  recipient_name: string | null;
  context_label: string | null;
  deleted_at: string | null;
}

export interface TaskStatusLogRow {
  id: string;
  task_id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  created_at: string;
  updated_at: string;
}

export interface TaskMetricsRow {
  id: string;
  task_id: string;
  archetype_id: string;
  tenant_id: string;
  work_minutes: number;
  created_at: string;
  deleted_at: string | null;
}

export interface EmployeeRuleRow {
  id: string;
  tenant_id: string;
  archetype_id: string;
  rule_text: string;
  source: string;
  status: string;
  source_task_id: string | null;
  parent_rule_ids: string[];
  slack_ts: string | null;
  slack_channel: string | null;
  created_at: string;
  confirmed_at: string | null;
  deleted_at: string | null;
}
