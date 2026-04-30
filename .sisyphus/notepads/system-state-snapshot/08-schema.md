# Database Schema & Migrations — Verification Notepad

## Source Files Verified

- `prisma/schema.prisma` — 23 models (confirmed via `grep "^model "`)
- `prisma/migrations/` — 26 migrations (excludes `migration_lock.toml`)

---

## Current State

### Model Count

Total: **23 models** across 4 groups.

---

### Group A: MVP-Active (7 tables)

| Table             | Key Columns                                                                                                                  | Purpose                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `tasks`           | `id`, `archetype_id`, `project_id`, `external_id`, `source_system`, `status`, `tenant_id`, `failure_reason`, `triage_result` | Core work unit                       |
| `executions`      | `id`, `task_id`, `runtime_type`, `runtime_id`, `status`, `heartbeat_at`, `wave_state`, `agent_version_id`                    | Worker run record                    |
| `deliverables`    | `id`, `execution_id`, `delivery_type`, `external_ref`, `content`, `status`, `metadata`                                       | Output produced by execution         |
| `validation_runs` | `id`, `execution_id`, `stage`, `status`, `error_output`, `duration_ms`, `iteration`                                          | Per-execution validation attempts    |
| `projects`        | `id`, `name`, `repo_url`, `jira_project_key`, `tenant_id`, `default_branch`, `concurrency_limit`                             | Registered repos                     |
| `feedback`        | `id`, `task_id`, `feedback_type`, `tenant_id`, `created_by`, `agent_version_id`                                              | Human corrections to agent decisions |
| `task_status_log` | `id`, `task_id`, `from_status`, `to_status`, `actor`                                                                         | Immutable audit trail                |

---

### Group B: Config and Versioning (5 tables)

| Table                    | Key Columns                                                                                                                                                           | Purpose                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `archetypes`             | `id`, `role_name`, `tenant_id`, `system_prompt`, `instructions`, `model`, `runtime`, `agents_md`, `delivery_instructions`, `notification_channel`, `deliverable_type` | Employee type definitions (config-driven)       |
| `departments`            | `id`, `name`, `tenant_id`, `slack_channel`                                                                                                                            | Org unit grouping                               |
| `agent_versions`         | `id`, `archetype_id`, `model_id`, `prompt_hash`, `tool_config_hash`, `is_active`                                                                                      | Versioned snapshots of archetype config         |
| `knowledge_bases`        | `id`, `archetype_id`, `source_config`, `tenant_id`, `chunk_count`, `last_indexed`                                                                                     | Feedback-derived knowledge (weekly digest)      |
| `knowledge_base_entries` | `id`, `tenant_id`, `entity_type`, `entity_id`, `scope`, `content`                                                                                                     | Per-entity KB content (property info, policies) |

---

### Group C: Multi-Tenancy (6 tables)

| Table                 | Key Columns                                                                                                                                            | Purpose                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `tenants`             | `id`, `name`, `slug`, `config`, `status`, `deleted_at`                                                                                                 | Tenant registry                                           |
| `tenant_integrations` | `id`, `tenant_id`, `provider`, `external_id`, `status`                                                                                                 | External service connections (Slack OAuth)                |
| `tenant_secrets`      | `id`, `tenant_id`, `key`, `ciphertext`, `iv`, `auth_tag`                                                                                               | Encrypted per-tenant credentials (AES-256-GCM)            |
| `system_events`       | `id`, `task_id`, `tenant_id`, `tool_name`, `issue_description`, `patch_applied`, `patch_diff`                                                          | Runtime tool issue tracking                               |
| `pending_approvals`   | `id`, `tenant_id`, `thread_uid`, `task_id`, `slack_ts`, `channel_id`, `reminder_sent_at`, `urgency`, `guest_name`, `property_name`                     | Tracks Hostfully threads awaiting human approval in Slack |
| `learned_rules`       | `id`, `tenant_id`, `entity_type`, `entity_id`, `scope`, `rule_text`, `source`, `status`, `source_task_id`, `slack_ts`, `slack_channel`, `confirmed_at` | Persistent rules extracted from feedback/interactions     |

---

### Group D: Forward-Compatibility (5 tables — schema-ready, not yet active)

`risk_models`, `cross_dept_triggers`, `clarifications`, `reviews`, `audit_log`

These tables exist in the schema and are migrated but not populated in production workflows.

---

### New Models Since April 24

#### `pending_approvals`

- **Purpose**: Tracks Hostfully guest-message threads that have been sent to Slack for human approval. One row per thread per tenant.
- **Fields**:
  - `id` UUID PK
  - `tenant_id` UUID FK → `tenants`
  - `thread_uid` String — Hostfully thread UID
  - `task_id` String — associated Inngest task ID
  - `slack_ts` String — Slack message timestamp (for updates/reactions)
  - `channel_id` String — Slack channel where approval was posted
  - `created_at` DateTime
  - `reminder_sent_at` DateTime? — when the reminder was last sent (nullable)
  - `urgency` Boolean default false — flagged by poller or classifier
  - `guest_name` String? — for display in Slack messages
  - `property_name` String? — for display in Slack messages
- **Constraints**: unique `(tenant_id, thread_uid)`, index on `(tenant_id)`
- **Added by**: `20260429042621_add_pending_approvals_table` + `20260429131314_add_reminder_fields_to_pending_approvals`

#### `learned_rules`

- **Purpose**: Stores persistent rules extracted from human feedback, corrections, or interactions. Used to influence future agent behavior within the same tenant/entity scope.
- **Fields**:
  - `id` UUID PK
  - `tenant_id` UUID FK → `tenants` (CASCADE delete)
  - `entity_type` String? — e.g. `property`, `tenant`
  - `entity_id` String? — ID of the entity the rule applies to
  - `scope` String — rule scope (e.g. `global`, `property`, `guest`)
  - `rule_text` String — human-readable rule text
  - `source` String — how the rule was created (e.g. `feedback`, `interaction`)
  - `status` String — e.g. `active`, `expired`, `pending`
  - `source_task_id` String? — task that generated the rule
  - `slack_ts` String? — Slack message timestamp for confirmation UX
  - `slack_channel` String? — Slack channel for confirmation
  - `created_at` Timestamptz
  - `confirmed_at` Timestamptz? — when a human confirmed this rule
- **Added by**: `20260429232114_add_learned_rules`

---

### Changed Models Since April 24

#### `archetypes` — 2 new columns

| Column                  | Type  | Migration                                                |
| ----------------------- | ----- | -------------------------------------------------------- |
| `delivery_instructions` | Text? | `20260426170200_add_delivery_instructions_to_archetypes` |
| `notification_channel`  | Text? | `20260427064845_add_notification_channel`                |

Note: `agents_md` was added in the April 24 doc period (`20260423060515`), so it is NOT new since April 24 — it's already documented in the April 24 snapshot.

---

### Key Constraints

| Table                    | Constraint                                                         | Purpose                                    |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------ |
| `tasks`                  | unique `(external_id, source_system, tenant_id)`                   | Prevents duplicate task creation           |
| `projects`               | unique `(jira_project_key, tenant_id)`                             | One project per Jira key per tenant        |
| `archetypes`             | unique `(tenant_id, role_name)`                                    | One archetype per role per tenant          |
| `tenant_integrations`    | unique `(tenant_id, provider)`                                     | One provider connection per tenant         |
| `tenant_secrets`         | unique `(tenant_id, key)`                                          | One secret per key per tenant              |
| `knowledge_base_entries` | unique `(tenant_id, entity_type, entity_id, scope)`; index on same | One entry per entity per scope per tenant  |
| `pending_approvals`      | unique `(tenant_id, thread_uid)`; index on `(tenant_id)`           | One pending approval per thread per tenant |

---

### Changes Since Last Doc (April 24)

| Change                                                                                    | Migration                                                 |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Added `delivery_instructions` to `archetypes`                                             | `20260426170200_add_delivery_instructions_to_archetypes`  |
| Added `notification_channel` to `archetypes`                                              | `20260427064845_add_notification_channel`                 |
| Added `pending_approvals` table                                                           | `20260429042621_add_pending_approvals_table`              |
| Added `reminder_sent_at`, `urgency`, `guest_name`, `property_name` to `pending_approvals` | `20260429131314_add_reminder_fields_to_pending_approvals` |
| Added `learned_rules` table                                                               | `20260429232114_add_learned_rules`                        |

---

### All Migrations (26 total)

| #   | Migration Directory                                                        | Notes                          |
| --- | -------------------------------------------------------------------------- | ------------------------------ |
| 1   | `20260326135305_init`                                                      | Initial schema                 |
| 2   | `20260326135326_add_check_constraints`                                     |                                |
| 3   | `20260326135742_sync_schema`                                               |                                |
| 4   | `20260327030220_add_jira_project_key`                                      |                                |
| 5   | `20260401210430_postgrest_grants`                                          | PostgREST GRANT statements     |
| 6   | `20260402011141_updated_at_defaults`                                       |                                |
| 7   | `20260407_unique_jira_project_key_per_tenant`                              |                                |
| 8   | `20260408221305_long_running_session_support`                              |                                |
| 9   | `20260410140640_add_uuid_defaults`                                         |                                |
| 10  | `20260415182242_add_failed_awaiting_approval_statuses`                     |                                |
| 11  | `20260415212203_add_archetype_config_fields`                               |                                |
| 12  | `20260415213855_add_deliverable_content_metadata`                          |                                |
| 13  | `20260416065948_add_archetype_unique_tenant_role_name`                     |                                |
| 14  | `20260416210126_add_tenant_and_secret_tables`                              |                                |
| 15  | `20260416220000_enforce_tenant_id_foreign_keys`                            |                                |
| 16  | `20260417164314_add_timestamps_tenant_integrations_archetype_instructions` |                                |
| 17  | `20260417175738_drop_slack_team_id_and_steps`                              |                                |
| 18  | `20260420204044_remove_platform_tenant_defaults`                           |                                |
| 19  | `20260422224712_add_system_events_table`                                   |                                |
| 20  | `20260423060515_add_agents_md_to_archetypes`                               |                                |
| 21  | `20260424020323_add_knowledge_base_entries`                                | Last migration in April 24 doc |
| 22  | `20260426170200_add_delivery_instructions_to_archetypes`                   | **NEW since April 24**         |
| 23  | `20260427064845_add_notification_channel`                                  | **NEW since April 24**         |
| 24  | `20260429042621_add_pending_approvals_table`                               | **NEW since April 24**         |
| 25  | `20260429131314_add_reminder_fields_to_pending_approvals`                  | **NEW since April 24**         |
| 26  | `20260429232114_add_learned_rules`                                         | **NEW since April 24**         |

---

## Changes from April 24 Doc

| Dimension            | April 24 | April 29 | Delta                                             |
| -------------------- | -------- | -------- | ------------------------------------------------- |
| Model count          | 21       | 23       | +2 (`LearnedRule`, `PendingApproval`)             |
| Migration count      | 21       | 26       | +5 (see table above)                              |
| `archetypes` columns | 11       | 13       | +`delivery_instructions`, +`notification_channel` |
| Group C tables       | 4        | 6        | +`pending_approvals`, +`learned_rules`            |

**Group restructure**: April 24 doc listed `system_events` in Group C (4 tables). Current: Group C has 6 tables (adds `pending_approvals`, `learned_rules`).

---

## Unresolved

None. All 23 models verified directly from `prisma/schema.prisma`. All 26 migrations verified from `prisma/migrations/` directory listing.
