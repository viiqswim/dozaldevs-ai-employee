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
