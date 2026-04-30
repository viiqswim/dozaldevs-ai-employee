# Ground Truth Counts — April 29, 2026

## Source Files Verified

- `prisma/schema.prisma` — DB models
- `src/worker-tools/` — shell tools
- `src/gateway/inngest/serve.ts` — Inngest functions
- `prisma/migrations/` — migrations
- `src/lib/` — shared libraries
- `scripts/` — scripts
- `tests/` — test files
- `docs/` — documentation files

## Current State

### DB Models

Count: 23
Models:
AgentVersion
Archetype
AuditLog
Clarification
CrossDeptTrigger
Deliverable
Department
Execution
Feedback
KnowledgeBase
KnowledgeBaseEntry
LearnedRule
PendingApproval
Project
Review
RiskModel
SystemEvent
Task
TaskStatusLog
Tenant
TenantIntegration
TenantSecret
ValidationRun

### Shell Tools

Count: 13
Files:
src/worker-tools/hostfully/get-messages.ts
src/worker-tools/hostfully/get-properties.ts
src/worker-tools/hostfully/get-property.ts
src/worker-tools/hostfully/get-reservations.ts
src/worker-tools/hostfully/get-reviews.ts
src/worker-tools/hostfully/send-message.ts
src/worker-tools/hostfully/validate-env.ts
src/worker-tools/knowledge_base/search.ts
src/worker-tools/platform/report-issue.ts
src/worker-tools/slack/post-guest-approval.ts
src/worker-tools/slack/post-message.ts
src/worker-tools/slack/post-no-action-notification.ts
src/worker-tools/slack/read-channels.ts

### Inngest Functions (from serve.ts)

Count: 11
Functions:
lifecycleFn (createLifecycleFunction — engineering/task lifecycle — DEPRECATED)
redispatchFn (createRedispatchFunction — engineering/task redispatch — DEPRECATED)
watchdogFn (createWatchdogFunction — engineering watchdog cron — DEPRECATED)
employeeLifecycleFn (createEmployeeLifecycleFunction — employee/universal-lifecycle)
summarizerTriggerFn (createSummarizerTrigger — trigger/daily-summarizer)
interactionHandlerFn (createInteractionHandlerFunction — employee/interaction-handler)
feedbackSummarizerFn (createFeedbackSummarizerTrigger — trigger/feedback-summarizer)
guestMessagePollerFn (createGuestMessagePollerTrigger — trigger/guest-message-poller)
unrespondedAlertFn (createUnrespondedMessageAlertTrigger — trigger/unresponded-message-alert)
ruleExtractorFn (createRuleExtractorFunction — employee/rule-extractor)
learnedRulesExpiryFn (createLearnedRulesExpiryTrigger — trigger/learned-rules-expiry)

### Migrations

Count: 26 (excluding migration_lock.toml)
Migrations (sorted by timestamp):
20260326135305_init
20260326135326_add_check_constraints
20260326135742_sync_schema
20260327030220_add_jira_project_key
20260401210430_postgrest_grants
20260402011141_updated_at_defaults
20260407_unique_jira_project_key_per_tenant
20260408221305_long_running_session_support
20260410140640_add_uuid_defaults
20260415182242_add_failed_awaiting_approval_statuses
20260415212203_add_archetype_config_fields
20260415213855_add_deliverable_content_metadata
20260416065948_add_archetype_unique_tenant_role_name
20260416210126_add_tenant_and_secret_tables
20260416220000_enforce_tenant_id_foreign_keys
20260417164314_add_timestamps_tenant_integrations_archetype_instructions
20260417175738_drop_slack_team_id_and_steps
20260420204044_remove_platform_tenant_defaults
20260422224712_add_system_events_table
20260423060515_add_agents_md_to_archetypes
20260424020323_add_knowledge_base_entries
20260426170200_add_delivery_instructions_to_archetypes
20260427064845_add_notification_channel
20260429042621_add_pending_approvals_table
20260429131314_add_reminder_fields_to_pending_approvals
20260429232114_add_learned_rules

### Shared Libraries

Count: 15
Files:
src/lib/agent-version.ts
src/lib/call-llm.ts
src/lib/classify-message.ts
src/lib/encryption.ts
src/lib/errors.ts
src/lib/fly-client.ts
src/lib/github-client.ts
src/lib/jira-client.ts
src/lib/logger.ts
src/lib/repo-url.ts
src/lib/retry.ts
src/lib/slack-blocks.ts
src/lib/slack-client.ts
src/lib/telegram-client.ts
src/lib/tunnel-client.ts

### Scripts

Count: 21
Files:
scripts/benchmark-classifier.ts
scripts/dev-start.sh
scripts/dev-start.ts
scripts/docker-reset.sh
scripts/ensure-infra.sh
scripts/fly-setup.ts
scripts/generate-jwt-keys.sh
scripts/migrate-vlre-kb.ts
scripts/register-project.ts
scripts/resolve-hostfully-uids.ts
scripts/setup-two-tenants.ts
scripts/setup.ts
scripts/telegram-notify.ts
scripts/trigger-task.ts
scripts/verify-container-boot.sh
scripts/verify-docker.sh
scripts/verify-e2e.sh
scripts/verify-e2e.ts
scripts/verify-multi-tenancy.ts
scripts/verify-phase1.sh
scripts/verify-supabase.ts

### Test Files

Count: 152

### Documentation Files

Count: 28
Files:
docs/2026-03-22-2317-ai-employee-architecture.md
docs/2026-03-25-1901-mvp-implementation-phases.md
docs/2026-03-26-1511-phase1-foundation.md
docs/2026-03-26-2257-phase2-event-gateway.md
docs/2026-03-27-2027-phase3-inngest-core.md
docs/2026-03-28-1902-phase4-execution-infra.md
docs/2026-03-30-1511-phase5-execution-agent.md
docs/2026-03-30-2038-phase6-completion-delivery.md
docs/2026-04-01-0114-phase7-resilience.md
docs/2026-04-01-1655-phase8-e2e.md
docs/2026-04-01-1726-system-overview.md
docs/2026-04-01-2110-troubleshooting.md
docs/2026-04-03-1251-supabase-infrastructure.md
docs/2026-04-06-2205-cloud-migration-roadmap.md
docs/2026-04-07-1732-hybrid-mode-current-state.md
docs/2026-04-08-1357-project-registration-and-development-loop.md
docs/2026-04-14-0057-worker-post-redesign-overview.md
docs/2026-04-14-0104-full-system-vision.md
docs/2026-04-15-1910-summarizer-overview.md
docs/2026-04-16-0310-manual-employee-trigger.md
docs/2026-04-16-1655-multi-tenancy-guide.md
docs/2026-04-16-1811-slack-oauth-setup-guide.md
docs/2026-04-16-2149-current-system-state.md
docs/2026-04-17-1408-current-system-state.md
docs/2026-04-20-1314-current-system-state.md
docs/2026-04-21-1813-product-roadmap.md
docs/2026-04-21-2202-phase1-story-map.md
docs/2026-04-24-1452-current-system-state.md

## Changes from April 24 Doc

- Old doc said: 21 DB models, 11 shell tools, 9 Inngest functions, 21 migrations, 13 shared libs, 12 scripts, 118 test files
- Current counts:
  - DB models: 23 (+2: LearnedRule, PendingApproval)
  - Shell tools: 13 (+2: post-guest-approval.ts, post-no-action-notification.ts)
  - Inngest functions: 11 (+2: ruleExtractorFn, learnedRulesExpiryFn; also interactionHandlerFn replaced feedbackHandler+mentionHandler)
  - Migrations: 26 (+5: add_delivery_instructions, add_notification_channel, add_pending_approvals_table, add_reminder_fields_to_pending_approvals, add_learned_rules)
  - Shared libs: 15 (+2: classify-message.ts, slack-blocks.ts, telegram-client.ts; -0)
  - Scripts: 21 (+9 vs old count of 12)
  - Test files: 152 (+34 vs old count of 118)

## New Content (not in old doc)

- New DB models: `LearnedRule`, `PendingApproval`
- New shell tools: `post-guest-approval.ts`, `post-no-action-notification.ts`, `hostfully/` suite (7 files), `knowledge_base/search.ts`, `platform/report-issue.ts`
- New Inngest functions: `ruleExtractorFn`, `learnedRulesExpiryFn`, `guestMessagePollerFn`, `unrespondedAlertFn`; `interactionHandlerFn` (unified, replaced feedbackHandler+mentionHandler)
- New shared libs: `classify-message.ts`, `slack-blocks.ts`, `telegram-client.ts`
- New scripts: `benchmark-classifier.ts`, `docker-reset.sh`, `fly-setup.ts`, `generate-jwt-keys.sh`, `migrate-vlre-kb.ts`, `resolve-hostfully-uids.ts`, `setup-two-tenants.ts`, `telegram-notify.ts`, `verify-phase1.sh`
- New docs: `2026-04-15-1910-summarizer-overview.md`, `2026-04-16-1811-slack-oauth-setup-guide.md`, `2026-04-16-2149-current-system-state.md`, `2026-04-17-1408-current-system-state.md`

## Mermaid Diagram (if applicable)

N/A

## Unresolved

- `ls prisma/migrations/ | wc -l` returns 27 (includes migration_lock.toml); actual migration directories = 26
