# Feedback System Redesign — Clean Separation of Concerns

## TL;DR

> **Quick Summary**: Replace the tangled three-table feedback pipeline (`feedback` + `learned_rules` + `knowledge_bases`) with a clean two-table design (`feedback_events` for audit + `employee_rules` for behavioral knowledge), event-driven synthesis instead of cron-based consolidation, and 1:1 injection mapping (one table → one env var). `knowledge_bases` stays untouched for its intended purpose: reference knowledge.
>
> **Deliverables**:
>
> - New `feedback_events` table (immutable audit log with archetype_id)
> - New `employee_rules` table (behavioral rules with lifecycle: proposed → confirmed → archived)
> - Uniform correction pipeline: every correction type writes audit + triggers rule extraction
> - Event-driven synthesis replacing the cron-based feedback-summarizer
> - Clean injection: `EMPLOYEE_RULES` from employee_rules, `EMPLOYEE_KNOWLEDGE` from knowledge_bases
> - Migration of existing confirmed rules to new schema
> - Removal of old tables, old cron function, old env vars
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 4 → Task 10 → Task 12 → Task 15 → F1-F4 → user okay

---

## Context

### Original Request

The user identified that the current feedback/learning system is too complex for scale: three tables (`feedback`, `learned_rules`, `knowledge_bases`) with overlapping purposes, two injection env vars with no 1:1 mapping, cron-dependent consolidation, no dedup, and inconsistent entry points. They want the simplest possible system that allows humans to give feedback and AI employees to continuously learn from it.

### Interview Summary

**Key Discussions**:

- `feedback` and `learned_rules` hold the same information at different lifecycle stages — confusing duplication
- `knowledge_bases` was co-opted by feedback consolidation to store "theme summaries" — its intended purpose is reference knowledge (property policies, amenities, local attractions)
- Three tables → two env vars mapping is confusing and hard to debug
- No dedup exists anywhere — rules and knowledge accumulate unboundedly
- Cron dependency (every 6 hours) for consolidation is unnecessary

**Decisions**:

- Architecture: `feedback_events` (immutable audit) + `employee_rules` (behavioral) + `knowledge_bases` (reference knowledge, unchanged)
- Injection: Two env vars with 1:1 mapping — `EMPLOYEE_RULES` ← employee_rules, `EMPLOYEE_KNOWLEDGE` ← knowledge_bases
- Every correction type (Edit & Send, Reject, thread reply, @mention) uniformly writes audit event + triggers rule extraction
- When LLM can't extract a rule → always ask PM to clarify (`awaiting_input` flow)
- Synthesis triggered every 5th confirmation (configurable), no crons
- Keep Confirm/Reject/Rephrase Slack review card UX
- Tests after implementation
- Migrate existing confirmed learned_rules → confirmed employee_rules
- `feedback_events` gets `archetype_id` for per-employee traceability

### Metis Review

**Identified Gaps** (addressed):

- Dedup keys needed for both new tables — resolved: `(source_task_id, source)` unique constraint on employee_rules, idempotency key on Inngest events for feedback_events
- In-flight `proposed` learned_rules rows need migration — resolved: copy ALL statuses, not just confirmed
- `batch_rules_confirm` Slack handler must be removed (no more consolidation) — explicitly included as task
- Synthesis must fire as async Inngest event from rule_confirm handler (not inline, would timeout) — designed accordingly
- Race condition on "every Nth confirmation" — resolved: use DB-level count + idempotency key on synthesis event
- `awaiting_input` → PM reply path continues to bypass LLM (current behavior preserved)
- Rule card block deduplication across 3 files — explicitly OUT OF SCOPE (leave as-is)
- Feedback-summarizer must be deregistered from Inngest serve — explicit task included
- 16+ test files reference old tables — explicit rewrite task included

---

## Work Objectives

### Core Objective

Replace the three-table feedback pipeline with a clean two-table design where each table has exactly one purpose and one injection channel, everything is event-driven (no crons), and all correction types follow a uniform path.

### Concrete Deliverables

- Prisma migration: `feedback_events` + `employee_rules` tables with proper constraints and indexes
- Data migration script: confirmed/proposed/awaiting_input learned_rules → employee_rules
- Updated pipeline: lifecycle, rule-extractor, interaction-handler, Slack handlers all use new tables
- New `rule-synthesizer.ts` Inngest function (event-driven, replaces cron synthesis)
- Updated injection: `EMPLOYEE_RULES` + `EMPLOYEE_KNOWLEDGE` env vars
- Removal: feedback-summarizer cron, old tables (feedback, learned_rules), old constants
- Updated tests, AGENTS.md documentation

### Definition of Done

- [x] New tables exist: `feedback_events`, `employee_rules`
- [ ] Old tables dropped: `feedback`, `learned_rules`
- [ ] All correction types uniformly write audit event + trigger rule extraction
- [ ] Synthesis is event-driven (no crons in the feedback pipeline)
- [ ] Injection uses `EMPLOYEE_RULES` + `EMPLOYEE_KNOWLEDGE` (old env vars removed)
- [ ] Existing confirmed rules migrated to new schema
- [ ] All tests pass (`pnpm test -- --run` ≥ 515 passing)
- [ ] `git status` clean

### Must Have

- Every correction path (Edit & Send, Reject with reason, Reject without reason, thread reply, @mention) writes a `feedback_events` row AND fires rule extraction
- Dedup constraints on `employee_rules` prevent duplicate proposed rules for the same task
- Synthesis fires after every 5th rule confirmation per archetype (configurable via `SYNTHESIS_THRESHOLD`)
- `knowledge_bases` table and its read paths are completely untouched
- Migration preserves ALL existing learned_rules (confirmed, proposed, awaiting_input)

### Must NOT Have (Guardrails)

- Do NOT modify `knowledge_bases` schema or `knowledge_base_entries` read path
- Do NOT touch `guest_approve`, `guest_edit`, `guest_reject`, `guest_edit_modal`, `guest_reject_modal` Slack handlers
- Do NOT touch `pending_approvals` table or its helpers
- Do NOT touch `AwaitingInput` auto-pass state in `employee-lifecycle.ts` (lines 436-442)
- Do NOT touch `classify-message.ts` (guest message classifier — unrelated)
- Do NOT refactor rule card block duplication across files (out of scope — leave as-is)
- Do NOT add cron triggers — everything must be event-driven
- Do NOT modify `interaction-classifier.ts` intent categories unless uniform correction handling explicitly requires it
- No `as any`, `@ts-ignore`, or empty catch blocks
- No AI slop: no excessive comments, no over-abstraction, no generic names

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Schema/DB**: Use Bash (psql) — Query tables, verify constraints, check data
- **Pipeline Logic**: Use Bash (curl to PostgREST + Inngest dev server) — Fire events, verify DB state
- **Injection**: Use Bash (curl to admin API) — Trigger task, inspect machine env
- **Cleanup**: Use Bash (grep, curl) — Verify no stale references

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — schema + types):
├── Task 1: Prisma migration — feedback_events + employee_rules tables [quick]
├── Task 2: Shared types, constants, Inngest event definitions [quick]

Wave 2 (After Wave 1 — data migration + core pipeline, MAX PARALLEL):
├── Task 3: Data migration script (depends: 1) [quick]
├── Task 4: Lifecycle — uniform correction handling (depends: 1, 2) [deep]
├── Task 5: Rule extractor — employee_rules writes (depends: 1, 2) [unspecified-high]
├── Task 6: Interaction handler — feedback_events + employee_rules (depends: 1, 2) [deep]
├── Task 7: Rule synthesizer — new event-driven Inngest function (depends: 1, 2) [deep]
├── Task 8: Slack handlers — employee_rules + confirmed event (depends: 1, 2) [unspecified-high]
├── Task 9: Remove batch_rules_confirm flow (depends: 1) [quick]

Wave 3 (After Wave 2 — injection + cleanup, MAX PARALLEL):
├── Task 10: Injection refactor — EMPLOYEE_RULES + EMPLOYEE_KNOWLEDGE (depends: 4, 5, 6, 7, 8) [deep]
├── Task 11: Deregister feedback-summarizer + delete file (depends: 7) [quick]
├── Task 12: Drop old tables migration (depends: 10) [quick]
├── Task 13: Update AGENTS.md (depends: 10, 11) [writing]
├── Task 14: Rewrite test files (depends: 4, 5, 6, 7, 8, 10) [unspecified-high]

Wave 4 (After Wave 3 — E2E test guide + execution):
├── Task 15: Create E2E test guide document (depends: all implementation) [writing]
├── Task 16: Execute ALL E2E test guide scenarios (depends: 15) [deep + dev-browser]
├── Task 17: Telegram notification (depends: 16) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
├── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 10 → Task 12 → Task 15 → Task 16 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Wave 2)
```

### Dependency Matrix

| Task | Depends On      | Blocks     | Wave |
| ---- | --------------- | ---------- | ---- |
| 1    | —               | 3-9, 12    | 1    |
| 2    | —               | 4-8        | 1    |
| 3    | 1               | 12         | 2    |
| 4    | 1, 2            | 10, 14     | 2    |
| 5    | 1, 2            | 10, 14     | 2    |
| 6    | 1, 2            | 10, 14     | 2    |
| 7    | 1, 2            | 10, 11, 14 | 2    |
| 8    | 1, 2            | 10, 14     | 2    |
| 9    | 1               | 14         | 2    |
| 10   | 4, 5, 6, 7, 8   | 12, 13, 14 | 3    |
| 11   | 7               | 13         | 3    |
| 12   | 10, 3           | 15         | 3    |
| 13   | 10, 11          | 15         | 3    |
| 14   | 4-8, 10         | 15         | 3    |
| 15   | all impl (1-14) | 16         | 4    |
| 16   | 15              | 17         | 4    |
| 17   | 16              | —          | 4    |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **7 tasks** — T3 → `quick`, T4 → `deep`, T5 → `unspecified-high`, T6 → `deep`, T7 → `deep`, T8 → `unspecified-high`, T9 → `quick`
- **Wave 3**: **5 tasks** — T10 → `deep`, T11 → `quick`, T12 → `quick`, T13 → `writing`, T14 → `unspecified-high`
- **Wave 4**: **3 tasks** — T15 → `writing`, T16 → `deep` + `dev-browser`, T17 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma migration — create `feedback_events` and `employee_rules` tables

  **What to do**:
  Create a new Prisma migration that adds two tables. Keep the old tables (`feedback`, `learned_rules`) — they'll be dropped later after all code is updated.

  **`feedback_events` table** (immutable audit log):

  ```
  id                 UUID PK (default gen_random_uuid())
  tenant_id          UUID FK → tenants (CASCADE)
  archetype_id       UUID FK → archetypes (CASCADE)
  task_id            UUID? FK → tasks
  event_type         String — 'edit_diff' | 'rejection' | 'rejection_reason' | 'thread_reply' | 'mention'
  actor_id           String? — Slack user ID of the PM who gave feedback
  correction_content String? — the raw text of what the PM said/edited
  original_content   String? — the original AI output before correction
  metadata           Json? — additional context (diff, edited content, etc.)
  created_at         DateTime (default now())
  ```

  Index: `(tenant_id, archetype_id, created_at DESC)`

  **`employee_rules` table** (behavioral knowledge):

  ```
  id                 UUID PK (default gen_random_uuid())
  tenant_id          UUID FK → tenants (CASCADE)
  archetype_id       UUID FK → archetypes (CASCADE)
  rule_text          String — the behavioral instruction
  source             String — 'edit_diff' | 'rejection' | 'thread_reply' | 'mention' | 'synthesis'
  status             String — 'proposed' | 'confirmed' | 'awaiting_input' | 'archived'
  source_task_id     UUID? — which task triggered this rule
  parent_rule_ids    UUID[]? — for synthesis: which rules were merged
  slack_ts           String? — Slack message timestamp for review card
  slack_channel      String? — Slack channel for review card
  created_at         DateTime (default now())
  confirmed_at       DateTime?
  ```

  Unique constraint: `(source_task_id, source)` WHERE `source != 'synthesis'` — prevents duplicate rule extraction for the same task
  Index: `(tenant_id, archetype_id, status)` — for injection queries
  Index: `(status, archetype_id)` — for synthesis count queries

  **Must NOT do**:
  - Do NOT drop `feedback` or `learned_rules` tables in this migration (they're dropped in Task 12)
  - Do NOT modify `knowledge_bases` schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3-9, 12
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma` — existing schema, follow the same FK and index conventions used by `Feedback` (line ~143) and `LearnedRule` (line ~495) models
  - `prisma/schema.prisma:Tenant` — FK target for tenant_id
  - `prisma/schema.prisma:Archetype` — FK target for archetype_id (the `learned_rules` model uses `entity_type`/`entity_id` instead of a direct FK — the new design uses a proper `archetype_id` FK)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New tables exist with correct columns
    Tool: Bash (psql)
    Preconditions: Migration has been run via `pnpm prisma migrate dev`
    Steps:
      1. Run: psql $DATABASE_URL -c "\d feedback_events"
      2. Verify columns: id (uuid), tenant_id (uuid), archetype_id (uuid), task_id (uuid), event_type (text), actor_id (text), correction_content (text), original_content (text), metadata (jsonb), created_at (timestamptz)
      3. Run: psql $DATABASE_URL -c "\d employee_rules"
      4. Verify columns: id (uuid), tenant_id (uuid), archetype_id (uuid), rule_text (text), source (text), status (text), source_task_id (uuid), parent_rule_ids (uuid[]), slack_ts (text), slack_channel (text), created_at (timestamptz), confirmed_at (timestamptz)
    Expected Result: Both tables exist with all specified columns and correct types
    Evidence: .sisyphus/evidence/task-1-tables-exist.txt

  Scenario: Unique constraint prevents duplicate rule extraction
    Tool: Bash (psql)
    Preconditions: Tables created
    Steps:
      1. INSERT a row into employee_rules with source_task_id='test-uuid', source='edit_diff'
      2. INSERT another row with same source_task_id='test-uuid', source='edit_diff'
      3. Assert: second INSERT fails with unique constraint violation
      4. INSERT a row with source_task_id='test-uuid', source='synthesis' (should succeed — synthesis is excluded)
      5. Clean up test rows
    Expected Result: Duplicate (source_task_id, source) rejected for non-synthesis; synthesis rows allowed
    Evidence: .sisyphus/evidence/task-1-dedup-constraint.txt

  Scenario: Old tables still exist (not dropped yet)
    Tool: Bash (psql)
    Steps:
      1. Run: psql $DATABASE_URL -c "\d feedback"
      2. Run: psql $DATABASE_URL -c "\d learned_rules"
    Expected Result: Both old tables still exist
    Evidence: .sisyphus/evidence/task-1-old-tables-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add feedback_events and employee_rules tables`
  - Files: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_add_feedback_events_and_employee_rules/migration.sql`
  - Pre-commit: `pnpm build`

---

- [x] 2. Shared types, constants, and Inngest event definitions

  **What to do**:
  Create shared type definitions and constants for the new feedback pipeline. These are used by multiple files in Waves 2-3.
  1. Create `src/inngest/types/feedback.ts` (or add to existing types file if one exists):

     ```typescript
     // Event type definitions
     export interface RuleConfirmedEvent {
       name: 'employee/rule.confirmed';
       data: {
         ruleId: string;
         tenantId: string;
         archetypeId: string;
         confirmedBy: string; // Slack user ID
       };
     }

     export interface SynthesisRequestedEvent {
       name: 'employee/rule.synthesize-requested';
       data: {
         tenantId: string;
         archetypeId: string;
         triggerRuleId: string; // the Nth rule that triggered synthesis
       };
     }

     // Status and source literal types
     export type RuleStatus = 'proposed' | 'confirmed' | 'awaiting_input' | 'archived';
     export type RuleSource = 'edit_diff' | 'rejection' | 'thread_reply' | 'mention' | 'synthesis';
     export type FeedbackEventType =
       | 'edit_diff'
       | 'rejection'
       | 'rejection_reason'
       | 'thread_reply'
       | 'mention';
     ```

  2. Add constants to `src/inngest/employee-lifecycle.ts` (alongside existing exports):
     ```typescript
     export const SYNTHESIS_THRESHOLD = 5; // fire synthesis every Nth confirmed rule per archetype
     export const MAX_EMPLOYEE_RULES_CHARS = 8000; // cap on confirmed rules injected into worker env
     ```
     Keep `MAX_FEEDBACK_CONTEXT_CHARS` and `CONSOLIDATION_THRESHOLD` for now (removed in Task 12 cleanup).

  **Must NOT do**:
  - Do NOT remove existing constants yet (`MAX_FEEDBACK_CONTEXT_CHARS`, `CONSOLIDATION_THRESHOLD`, `MAX_LEARNED_RULES_CHARS`) — they're still referenced by old code until Wave 3

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 4-8
  - **Blocked By**: None

  **References**:
  - `src/inngest/employee-lifecycle.ts:33-35` — existing exported constants (`MAX_LEARNED_RULES_CHARS`, `CONSOLIDATION_THRESHOLD`, `MAX_FEEDBACK_CONTEXT_CHARS`) — follow same pattern
  - `src/inngest/rule-extractor.ts:1-20` — existing event type patterns for Inngest events
  - `src/gateway/inngest/client.ts` — Inngest client type definitions (if events are typed there)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Types and constants compile without errors
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0, no type errors
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-2-build-pass.txt

  Scenario: Constants are exported and importable
    Tool: Bash
    Steps:
      1. Run: node -e "const m = require('./dist/inngest/employee-lifecycle.mjs'); console.log(m.SYNTHESIS_THRESHOLD, m.MAX_EMPLOYEE_RULES_CHARS)"
      2. Assert output: "5 8000"
    Expected Result: Constants export correctly with expected values
    Evidence: .sisyphus/evidence/task-2-constants-export.txt
  ```

  **Commit**: YES
  - Message: `feat(feedback): add shared types, constants, and event definitions`
  - Files: `src/inngest/types/feedback.ts`, `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

- [x] 3. Data migration script

  **What to do**:
  Create a TypeScript migration script that copies data from old tables to new tables. This runs ONCE after the schema migration (Task 1) and before old tables are dropped (Task 12).

  Create `scripts/migrate-feedback-data.ts`:
  1. **Copy ALL `learned_rules` → `employee_rules`**:
     - Map `entity_id` → `archetype_id` (direct copy, same UUID)
     - Copy `rule_text`, `source`, `status`, `source_task_id`, `slack_ts`, `slack_channel`, `created_at`, `confirmed_at`
     - Generate new UUID for `id`
     - Set `tenant_id` from the original row
     - For `source: 'weekly_synthesis'` rows: set `parent_rule_ids` to empty array (original parent tracking wasn't stored)
     - Log count of migrated rows by status

  2. **Copy `feedback` rows → `feedback_events`** (as audit trail):
     - Map `feedback_type` → `event_type`
     - Map `correction_reason` → `correction_content`
     - Set `archetype_id` by looking up the task's archetype (JOIN via `tasks.archetype_id` if available, otherwise use tenant's default archetype)
     - Set `actor_id` from `created_by` if available
     - Log count of migrated rows

  3. **Clean `knowledge_bases`**: Remove rows where `source_config->>'type' = 'feedback_summary'` (these are feedback consolidation artifacts, not reference knowledge). Log count of deleted rows.

  4. **Verification step**: Print counts for old vs new tables to confirm data integrity.

  Add npm script: `"migrate:feedback": "tsx scripts/migrate-feedback-data.ts"`

  **Must NOT do**:
  - Do NOT delete or modify old tables — just copy data
  - Do NOT modify `knowledge_bases` rows that aren't `feedback_summary` type

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4-9)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:
  - `prisma/schema.prisma:Feedback` (line ~143) — source table schema for feedback rows
  - `prisma/schema.prisma:LearnedRule` (line ~495) — source table schema for learned_rules rows
  - `scripts/trigger-task.ts` — example of a TypeScript script using Prisma client directly
  - `prisma/seed.ts` — example of database manipulation script patterns in this codebase

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration copies all learned_rules to employee_rules
    Tool: Bash
    Preconditions: Task 1 migration applied, existing confirmed rules in learned_rules
    Steps:
      1. Count existing learned_rules: psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM learned_rules GROUP BY status"
      2. Run: pnpm migrate:feedback
      3. Count employee_rules: psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM employee_rules GROUP BY status"
      4. Assert: counts match per status
    Expected Result: All rows migrated with matching status counts
    Evidence: .sisyphus/evidence/task-3-migration-counts.txt

  Scenario: Feedback summary rows removed from knowledge_bases
    Tool: Bash
    Steps:
      1. Count before: psql $DATABASE_URL -c "SELECT COUNT(*) FROM knowledge_bases WHERE source_config->>'type' = 'feedback_summary'"
      2. Run migration
      3. Count after: same query
      4. Assert: after count is 0
    Expected Result: All feedback_summary knowledge_bases rows deleted
    Evidence: .sisyphus/evidence/task-3-kb-cleanup.txt

  Scenario: Script is idempotent (safe to re-run)
    Tool: Bash
    Steps:
      1. Run: pnpm migrate:feedback (first time)
      2. Run: pnpm migrate:feedback (second time)
      3. Assert: no duplicate rows in employee_rules (dedup constraint prevents it or script checks)
    Expected Result: Second run produces no errors and no duplicates
    Evidence: .sisyphus/evidence/task-3-idempotent.txt
  ```

  **Commit**: YES
  - Message: `feat(migration): add script to migrate feedback data to new schema`
  - Files: `scripts/migrate-feedback-data.ts`, `package.json` (new script)
  - Pre-commit: `pnpm build`

---

- [x] 4. Lifecycle — uniform correction handling with feedback_events

  **What to do**:
  Update `src/inngest/employee-lifecycle.ts` `handle-approval-result` step so that ALL correction types uniformly write a `feedback_events` row AND fire rule extraction. Currently:
  - Edit & Send: fires `rule.extract-requested` but does NOT write to `feedback`
  - Reject with reason: writes to `feedback` but does NOT fire rule extraction
  - Reject without reason: writes to `learned_rules` directly (bypasses feedback)

  After this change, ALL three paths do the same thing:
  1. Write a `feedback_events` row (audit trail)
  2. Fire `employee/rule.extract-requested` (triggers rule extraction)

  **Specific changes**:
  1. **Edit & Send path** (currently fires rule extraction only):
     - ADD: Write `feedback_events` row with `event_type: 'edit_diff'`, `correction_content: editedContent`, `original_content: originalDraft`
     - KEEP: Fire `employee/rule.extract-requested` (already exists)
     - CHANGE: Pass `archetypeId` in the event data (currently not passed)

  2. **Reject with reason path** (currently writes feedback only):
     - CHANGE: Write to `feedback_events` instead of `feedback` table, with `event_type: 'rejection_reason'`, `correction_content: rejectionReason`
     - ADD: Fire `employee/rule.extract-requested` with `feedbackType: 'rejection_reason'` (currently missing — rejections with reasons never become rules)

  3. **Reject without reason path** (currently writes learned_rules directly):
     - ADD: Write `feedback_events` row with `event_type: 'rejection'`
     - CHANGE: Write to `employee_rules` instead of `learned_rules` with `status: 'awaiting_input'`
     - KEEP: Slack message asking "What should I have done differently?"

  4. **Remove old writes**: No more `POST /rest/v1/feedback` calls. No more `POST /rest/v1/learned_rules` calls. All writes go to `feedback_events` and `employee_rules` via PostgREST.

  **Must NOT do**:
  - Do NOT touch the `AwaitingInput` auto-pass state (lines 436-442)
  - Do NOT touch guest approval handlers (`guest_approve`, `guest_edit`, `guest_reject`, etc.)
  - Do NOT change the task approval flow itself — only the feedback/rule side effects
  - Do NOT modify `pending_approvals` logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5-9)
  - **Blocks**: Tasks 10, 14
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts` — the `handle-approval-result` step contains ALL three correction paths. Search for `editedContent` (Edit & Send), `rejectionReason` (Reject with reason), and `rejection_feedback_requested` (Reject without reason). This is the ONLY file to modify.
  - `src/inngest/employee-lifecycle.ts:33-35` — exported constants. Add `SYNTHESIS_THRESHOLD` and `MAX_EMPLOYEE_RULES_CHARS` here (may already be done by Task 2).

  **API References**:
  - PostgREST endpoint for new tables: `POST ${supabaseUrl}/rest/v1/feedback_events` and `POST ${supabaseUrl}/rest/v1/employee_rules`
  - Follow the same PostgREST call pattern used for the existing `POST /rest/v1/feedback` and `POST /rest/v1/learned_rules` calls in this file

  **Why Each Reference Matters**:
  - The lifecycle file is ~2500 lines. The `handle-approval-result` step is the ONLY section to modify. Use `lsp_find_references` on `rule.extract-requested` to find the exact fire location.
  - The PostgREST base URL is already available as a variable in this step — look for `supabaseUrl` or the existing `fetch` calls to `/rest/v1/feedback`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Edit & Send creates feedback_events row + fires rule extraction
    Tool: Bash (curl to PostgREST + Inngest)
    Preconditions: Dev services running, a task in Reviewing state exists
    Steps:
      1. Fire employee/approval.received with action='approve', editedContent='Modified response [test-edit-uniform]'
      2. Wait 10s for lifecycle to process
      3. Query: curl "$SUPABASE_URL/rest/v1/feedback_events?event_type=eq.edit_diff&order=created_at.desc&limit=1" -H "apikey: $ANON_KEY"
      4. Assert: row exists with correction_content containing 'Modified response'
      5. Query: curl "$SUPABASE_URL/rest/v1/employee_rules?source=eq.edit_diff&status=eq.proposed&order=created_at.desc&limit=1" -H "apikey: $ANON_KEY"
      6. Assert: proposed rule exists (created by rule-extractor triggered by the event)
    Expected Result: Both feedback_events and employee_rules rows created
    Evidence: .sisyphus/evidence/task-4-edit-send-uniform.txt

  Scenario: Reject with reason creates feedback_events row + fires rule extraction
    Tool: Bash (curl)
    Steps:
      1. Fire employee/approval.received with action='reject', rejectionReason='Too informal, use formal language'
      2. Wait 10s
      3. Query feedback_events for event_type='rejection_reason'
      4. Assert: row exists with correction_content='Too informal, use formal language'
      5. Query employee_rules for source='rejection' status='proposed' (or 'awaiting_input')
      6. Assert: rule extraction was attempted
    Expected Result: Reject-with-reason now triggers rule extraction (previously it did not)
    Evidence: .sisyphus/evidence/task-4-reject-reason-uniform.txt

  Scenario: No writes to old feedback table
    Tool: Bash (psql)
    Steps:
      1. Count feedback rows before: psql $DATABASE_URL -c "SELECT COUNT(*) FROM feedback"
      2. Trigger all three correction types
      3. Count feedback rows after
      4. Assert: count unchanged (no new rows in old table)
    Expected Result: Zero new rows in old feedback table
    Evidence: .sisyphus/evidence/task-4-no-old-writes.txt
  ```

  **Commit**: YES
  - Message: `refactor(lifecycle): uniform correction handling with feedback_events`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

- [x] 5. Rule extractor — write to `employee_rules` instead of `learned_rules`

  **What to do**:
  Update `src/inngest/rule-extractor.ts` to write proposed rules to `employee_rules` instead of `learned_rules`. The logic stays the same — only the table name and column mapping change.

  **Specific changes**:
  1. Change `POST /rest/v1/learned_rules` → `POST /rest/v1/employee_rules` in the `store-proposed-rule` step
  2. Change column `entity_type: 'archetype'` + `entity_id: archetypeId` → `archetype_id: archetypeId`
  3. Change column `scope: 'entity'` → remove (not needed — archetype_id is the direct FK)
  4. Ensure `id` is always provided as `crypto.randomUUID()` (Bug Fix 10 from E2E already does this for learned_rules)
  5. Update the `store-slack-ref` step to PATCH `employee_rules` instead of `learned_rules`
  6. Update the `post-awaiting-input` step to write `employee_rules` with `status: 'awaiting_input'`
  7. Add `archetype_id` to the event data received by the function (Task 4 passes it)

  **Must NOT do**:
  - Do NOT change the LLM extraction logic or prompt
  - Do NOT change the Slack card format (keep Confirm/Reject/Rephrase buttons)
  - Do NOT refactor the duplicated rule card block builder (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 6-9)
  - **Blocks**: Tasks 10, 14
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/inngest/rule-extractor.ts` — the ENTIRE file is in scope. Key steps: `store-proposed-rule` (line ~163), `store-slack-ref` (line ~190), `post-awaiting-input` (line ~210). All PostgREST calls reference `learned_rules` — change to `employee_rules`.
  - `src/inngest/rule-extractor.ts:163-184` — the `store-proposed-rule` step. This is where `POST /rest/v1/learned_rules` happens. Change table name and column mapping.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Extracted rule written to employee_rules (not learned_rules)
    Tool: Bash (curl)
    Steps:
      1. Fire employee/rule.extract-requested with feedbackType='edit_diff', content suitable for extraction
      2. Wait 15s for extractor to process
      3. Query: curl "$SUPABASE_URL/rest/v1/employee_rules?source=eq.edit_diff&status=eq.proposed&order=created_at.desc&limit=1"
      4. Assert: row exists with rule_text populated, archetype_id set
      5. Query: curl "$SUPABASE_URL/rest/v1/learned_rules?order=created_at.desc&limit=1"
      6. Assert: no NEW rows in learned_rules (timestamp check)
    Expected Result: New rules go to employee_rules only
    Evidence: .sisyphus/evidence/task-5-extractor-new-table.txt

  Scenario: Awaiting-input rule written to employee_rules
    Tool: Bash (curl)
    Steps:
      1. Fire rule.extract-requested with vague content that LLM can't extract a clear rule from
      2. Wait 15s
      3. Query employee_rules for status='awaiting_input'
      4. Assert: row exists with empty rule_text
    Expected Result: Awaiting-input rules use new table
    Evidence: .sisyphus/evidence/task-5-awaiting-input-new-table.txt
  ```

  **Commit**: YES
  - Message: `refactor(rule-extractor): write to employee_rules table`
  - Files: `src/inngest/rule-extractor.ts`
  - Pre-commit: `pnpm build`

---

- [x] 6. Interaction handler — use `feedback_events` and `employee_rules`

  **What to do**:
  Update `src/inngest/interaction-handler.ts` to write to `feedback_events` and use `employee_rules` for the awaiting_input detection.

  **Specific changes**:
  1. **`detect-awaiting-input-rule` step**: Change query from `GET /rest/v1/learned_rules?status=eq.awaiting_input&source_task_id=eq.{taskId}` to `GET /rest/v1/employee_rules?status=eq.awaiting_input&source_task_id=eq.{taskId}`

  2. **`capture-awaiting-input-reply` step**: Change PATCH from `/rest/v1/learned_rules` to `/rest/v1/employee_rules`. Update column mapping (remove `entity_type`/`entity_id`/`scope`, ensure `archetype_id` is set).

  3. **`route-and-store` step**: Change `POST /rest/v1/feedback` to `POST /rest/v1/feedback_events`. Map columns:
     - `feedback_type` → `event_type`
     - `correction_reason` → `correction_content`
     - Add `archetype_id` (resolve from task → archetype)
     - Add `actor_id` from the Slack event data

  4. **`detect-rejection-feedback-request` step**: Change `POST /rest/v1/feedback` to `POST /rest/v1/feedback_events`. Update column mapping.

  5. **Keep**: The intent classification logic, question-answering path (uses `knowledge_base_entries` — different table), and Slack reply logic all stay unchanged.

  **Must NOT do**:
  - Do NOT modify the question-answering path that reads `knowledge_base_entries`
  - Do NOT change intent classification categories
  - Do NOT refactor the duplicated rule card block builder

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3-5, 7-9)
  - **Blocks**: Tasks 10, 14
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/inngest/interaction-handler.ts` — the ENTIRE file is in scope. Key steps: `detect-awaiting-input-rule` (line ~185), `capture-awaiting-input-reply` (line ~220), `route-and-store` (line ~260), `detect-rejection-feedback-request` (line ~150). All PostgREST calls reference `learned_rules` or `feedback` — change to `employee_rules` or `feedback_events`.
  - `src/inngest/interaction-handler.ts:185-295` — the awaiting_input → proposed promotion path. This directly patches `learned_rules` to `proposed` without calling the LLM extractor. Preserve this behavior (bypass LLM) but target `employee_rules`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Thread reply writes to feedback_events (not feedback)
    Tool: Bash (curl)
    Steps:
      1. Fire employee/interaction.received with source='thread_reply', text='Always be more formal with guests'
      2. Wait 15s
      3. Query: curl "$SUPABASE_URL/rest/v1/feedback_events?event_type=eq.thread_reply&order=created_at.desc&limit=1"
      4. Assert: row exists with correction_content containing 'formal'
      5. Assert: archetype_id is set (not null)
    Expected Result: Interaction handler writes to new table with archetype scoping
    Evidence: .sisyphus/evidence/task-6-thread-reply-feedback-events.txt

  Scenario: Awaiting-input detection uses employee_rules
    Tool: Bash (curl + psql)
    Steps:
      1. Insert an employee_rules row with status='awaiting_input', source_task_id='test-task'
      2. Fire employee/interaction.received with source='thread_reply', taskId='test-task', text='Be more polite'
      3. Wait 10s
      4. Query employee_rules for the awaiting_input row
      5. Assert: status changed to 'proposed', rule_text updated to 'Be more polite'
    Expected Result: Awaiting-input promotion uses new table
    Evidence: .sisyphus/evidence/task-6-awaiting-input-employee-rules.txt
  ```

  **Commit**: YES
  - Message: `refactor(interaction-handler): use feedback_events and employee_rules`
  - Files: `src/inngest/interaction-handler.ts`
  - Pre-commit: `pnpm build`

---

- [x] 7. Rule synthesizer — new event-driven Inngest function

  **What to do**:
  Create `src/inngest/rule-synthesizer.ts` — a new Inngest function that replaces the synthesis step from the old feedback-summarizer cron. It is triggered by an event (not a cron), fires when the Nth rule is confirmed for an archetype, and merges overlapping confirmed rules.

  **Event trigger**: `employee/rule.synthesize-requested`
  **Function ID**: `employee/rule-synthesizer`

  **Steps**:
  1. **`load-confirmed-rules`**: Query `employee_rules` WHERE `status='confirmed' AND archetype_id={archetypeId}`. If < 2 rules, return early (nothing to synthesize).

  2. **`detect-overlaps`**: Call LLM (Claude Haiku `anthropic/claude-haiku-4-5`) with all confirmed rules. Prompt: "Find overlapping or contradictory rules that can be merged into a single, clearer instruction." Response format: `{ merges: [{ original_ids: string[], merged_text: string }], contradictions: [{ rule_ids: string[], description: string }] }`. Strip markdown code fences before parsing (Bug Fix 9 pattern).

  3. **`propose-merged-rules`**: For each merge:
     - Write `employee_rules` row: `status: 'proposed'`, `source: 'synthesis'`, `parent_rule_ids: original_ids`, `rule_text: merged_text`
     - Post Slack rule review card with Confirm/Reject/Rephrase buttons (same format as rule-extractor)
     - Store `slack_ts` and `slack_channel` on the row

  4. **`report-contradictions`**: For each contradiction, post a warning message to Slack (no DB write).

  **Synthesis trigger logic** (goes in `src/gateway/slack/handlers.ts` Task 8, but documented here for context):
  After `rule_confirm` handler updates status to `confirmed`:

  ```typescript
  const confirmedCount = await countConfirmedRules(archetypeId);
  if (confirmedCount % SYNTHESIS_THRESHOLD === 0) {
    await inngest.send({
      name: 'employee/rule.synthesize-requested',
      data: { tenantId, archetypeId, triggerRuleId: ruleId },
      id: `synthesis-${archetypeId}-${confirmedCount}`, // idempotency key prevents duplicate synthesis
    });
  }
  ```

  **Register** this function in `src/gateway/inngest/serve.ts` alongside existing functions.

  **Must NOT do**:
  - Do NOT add a cron trigger — this is event-driven only
  - Do NOT include the consolidation logic from feedback-summarizer (consolidation is eliminated)
  - Do NOT archive the original rules when a merge is proposed — only archive after the merged rule is confirmed (handled by Task 8's rule_confirm handler)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3-6, 8-9)
  - **Blocks**: Tasks 10, 11, 14
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/inngest/rule-extractor.ts` — follow this exact pattern for the Inngest function structure (event-triggered, multi-step, LLM call + DB write + Slack post). The synthesizer is structurally identical.
  - `src/inngest/triggers/feedback-summarizer.ts` — the `synthesize-rules` step (search for `synthesize-rules`) contains the existing synthesis LLM prompt and merge logic. Port this logic to the new function but target `employee_rules` instead of `learned_rules`.
  - `src/inngest/triggers/feedback-summarizer.ts:402-416` — the existing `POST /rest/v1/learned_rules` for merged rules. Change to `POST /rest/v1/employee_rules` with `parent_rule_ids` populated.

  **API References**:
  - `src/lib/call-llm.ts` — the `callLLM` function. Use model `anthropic/claude-haiku-4-5` (verification/judge model per AGENTS.md).
  - `src/gateway/inngest/serve.ts` — where Inngest functions are registered. Add the new function here.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Synthesis detects overlapping rules and proposes merge
    Tool: Bash (curl + psql)
    Preconditions: At least 2 confirmed employee_rules with overlapping content for the same archetype
    Steps:
      1. Insert 2 confirmed rules: "Always mention free parking" and "Tell guests about complimentary parking"
      2. Fire employee/rule.synthesize-requested with archetypeId
      3. Wait 20s for synthesis to process
      4. Query: curl "$SUPABASE_URL/rest/v1/employee_rules?source=eq.synthesis&status=eq.proposed&order=created_at.desc&limit=1"
      5. Assert: merged rule exists with parent_rule_ids containing both original IDs
      6. Assert: rule_text is a sensible merge of the two originals
    Expected Result: Synthesis produces a proposed merged rule
    Evidence: .sisyphus/evidence/task-7-synthesis-merge.txt

  Scenario: Synthesis skips when fewer than 2 confirmed rules
    Tool: Bash (curl)
    Steps:
      1. Ensure only 1 confirmed rule exists for archetype
      2. Fire employee/rule.synthesize-requested
      3. Wait 10s
      4. Assert: no new employee_rules rows created
    Expected Result: Synthesis is a no-op with insufficient rules
    Evidence: .sisyphus/evidence/task-7-synthesis-skip.txt

  Scenario: Function is registered in Inngest
    Tool: Bash (curl)
    Steps:
      1. curl -s http://localhost:8288/v1/fns | jq '.[].name'
      2. Assert: output contains "employee/rule-synthesizer"
    Expected Result: Function is registered and visible
    Evidence: .sisyphus/evidence/task-7-inngest-registered.txt
  ```

  **Commit**: YES
  - Message: `feat(feedback): add event-driven rule-synthesizer function`
  - Files: `src/inngest/rule-synthesizer.ts`, `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

---

- [x] 8. Slack handlers — `employee_rules` + synthesis trigger on confirmation

  **What to do**:
  Update `src/gateway/slack/handlers.ts` to use `employee_rules` instead of `learned_rules` for all rule-related Slack actions, and add synthesis trigger on rule confirmation.

  **Specific changes**:
  1. **`rule_confirm` action handler**:
     - Change PATCH from `/rest/v1/learned_rules` to `/rest/v1/employee_rules`
     - After successful PATCH to `confirmed`:
       - Fire `employee/rule.confirmed` event (new event for downstream consumption)
       - Count confirmed rules for this archetype: `GET /rest/v1/employee_rules?status=eq.confirmed&archetype_id=eq.{archetypeId}&select=id`
       - If `count % SYNTHESIS_THRESHOLD === 0`, fire `employee/rule.synthesize-requested` with idempotency key `synthesis-${archetypeId}-${count}`
     - When confirming a `source: 'synthesis'` rule: archive the parent rules (PATCH `parent_rule_ids` rows to `status: 'archived'`)

  2. **`rule_reject` action handler**: Change PATCH target to `/rest/v1/employee_rules`

  3. **`rule_rephrase` modal handler**: Change PATCH target to `/rest/v1/employee_rules`. Keep the rephrase-and-re-propose flow.

  4. **`batch_rules_confirm` action handler**: REMOVE entirely. This handler was for feedback consolidation batch cards — consolidation is eliminated. Remove the handler registration, the action_id matching, and any related helper functions.

  5. **`findTaskIdByThreadTs`**: Update to check `employee_rules.slack_ts` if it currently checks `learned_rules.slack_ts` (verify whether this function references learned_rules).

  **Must NOT do**:
  - Do NOT touch `guest_approve`, `guest_edit`, `guest_reject`, `guest_edit_modal`, `guest_reject_modal` handlers
  - Do NOT touch `pending_approvals` handlers
  - Do NOT touch `override_dismiss` or `override_take_action_modal` handlers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3-7, 9)
  - **Blocks**: Tasks 10, 14
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/gateway/slack/handlers.ts` — search for `rule_confirm` (line ~979), `rule_reject` (line ~1015), `rule_rephrase`, `batch_rules_confirm`. Each is a Bolt action handler registered with `boltApp.action('action_id', ...)`.
  - `src/gateway/slack/handlers.ts:findTaskIdByThreadTs` — check if this function references `learned_rules` (it was updated in Bug Fix 4 to fall back to `notify_slack_ts`)
  - `src/inngest/employee-lifecycle.ts:SYNTHESIS_THRESHOLD` — import this constant for the threshold check
  - `src/gateway/inngest/client.ts` — Inngest client for firing events

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: rule_confirm updates employee_rules (not learned_rules)
    Tool: Bash (psql + curl)
    Steps:
      1. Insert a proposed employee_rules row with known slack_ts
      2. Simulate rule_confirm action via Inngest event or direct PostgREST PATCH
      3. Query employee_rules: assert status='confirmed', confirmed_at IS NOT NULL
      4. Query learned_rules: assert no changes
    Expected Result: Confirmation targets new table
    Evidence: .sisyphus/evidence/task-8-confirm-new-table.txt

  Scenario: Synthesis triggered on every 5th confirmation
    Tool: Bash (psql + curl + Inngest logs)
    Steps:
      1. Confirm 4 rules for archetype X (no synthesis expected)
      2. Confirm 5th rule
      3. Check Inngest dev server for employee/rule.synthesize-requested event
      4. Assert: event fired exactly once with correct archetypeId
    Expected Result: Synthesis fires on 5th confirmation
    Evidence: .sisyphus/evidence/task-8-synthesis-trigger.txt

  Scenario: batch_rules_confirm handler removed
    Tool: Bash (grep)
    Steps:
      1. grep -n "batch_rules_confirm" src/gateway/slack/handlers.ts
      2. Assert: zero matches
    Expected Result: Handler completely removed
    Evidence: .sisyphus/evidence/task-8-batch-removed.txt
  ```

  **Commit**: YES
  - Message: `refactor(slack): update rule handlers for employee_rules and add synthesis trigger`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

---

- [x] 9. Remove batch_rules_confirm Slack card posting from cron

  **What to do**:
  The batch consolidation card is posted by `feedback-summarizer.ts` during the consolidation step. Since consolidation is eliminated and the `batch_rules_confirm` handler is removed in Task 8, the card-posting code also needs to be disabled. Rather than rewriting the entire cron function now (it's deleted in Task 11), this task simply prevents the consolidation step from executing.

  **Specific changes**:
  1. In `src/inngest/triggers/feedback-summarizer.ts`, add an early return at the top of the function body: `return { skipped: true, reason: 'Consolidation disabled — replaced by event-driven synthesis' }` — this prevents the cron from running consolidation or synthesis while the old function is still registered.

  **Why not just delete the file now?** The function is registered in Inngest serve. Deleting it before deregistering (Task 11) would cause a startup error. This task just disables it safely.

  **Must NOT do**:
  - Do NOT delete the file (done in Task 11)
  - Do NOT deregister from Inngest serve (done in Task 11)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3-8)
  - **Blocks**: Task 14
  - **Blocked By**: Task 1

  **References**:
  - `src/inngest/triggers/feedback-summarizer.ts` — the function body. Add early return at line ~50 (after the function definition starts).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback-summarizer cron is effectively disabled
    Tool: Bash (curl)
    Steps:
      1. Fire the cron trigger manually via Inngest dev server
      2. Wait 10s
      3. Check Inngest run log: assert function returned { skipped: true }
      4. Assert: no new knowledge_bases rows created
    Expected Result: Cron function no-ops gracefully
    Evidence: .sisyphus/evidence/task-9-cron-disabled.txt
  ```

  **Commit**: YES
  - Message: `chore(feedback-summarizer): disable consolidation (replaced by event-driven synthesis)`
  - Files: `src/inngest/triggers/feedback-summarizer.ts`
  - Pre-commit: `pnpm build`

---

- [x] 10. Injection refactor — `EMPLOYEE_RULES` + `EMPLOYEE_KNOWLEDGE`

  **What to do**:
  Replace the current injection logic in `src/inngest/employee-lifecycle.ts` `dispatch-machine` step. Currently it builds `FEEDBACK_CONTEXT` (from unconsolidated feedback + knowledge_bases themes) and `LEARNED_RULES_CONTEXT` (from confirmed learned_rules). Replace with:
  - **`EMPLOYEE_RULES`**: Query `employee_rules WHERE status='confirmed' AND (archetype_id={archetypeId} OR scope='common')`, format as structured text, cap at `MAX_EMPLOYEE_RULES_CHARS` (8000). Sort: archetype-specific first, then common. Format: numbered list of rules.

  - **`EMPLOYEE_KNOWLEDGE`**: Query `knowledge_bases WHERE archetype_id={archetypeId}`, extract reference knowledge from `source_config`. Format as structured text. Cap at a reasonable limit (32000 chars — reuse the old `MAX_FEEDBACK_CONTEXT_CHARS` value under a new name `MAX_EMPLOYEE_KNOWLEDGE_CHARS`).

  **Specific changes**:
  1. **Remove**: The entire `FEEDBACK_CONTEXT` construction block — the query to `feedback` WHERE `consolidated_at IS NULL`, the query to `knowledge_bases` for themes, the combination and truncation logic, the `FEEDBACK_CONTEXT` env var injection.

  2. **Remove**: The entire `LEARNED_RULES_CONTEXT` construction block — the query to `learned_rules` WHERE `status='confirmed'`, the formatting and truncation logic, the `LEARNED_RULES_CONTEXT` env var injection.

  3. **Add**: `EMPLOYEE_RULES` construction:

     ```typescript
     // Query confirmed rules for this archetype
     const rulesResp = await fetch(`${supabaseUrl}/rest/v1/employee_rules?status=eq.confirmed&or=(archetype_id.eq.${archetypeId},scope.eq.common)&order=confirmed_at.desc`, ...);
     const rules = await rulesResp.json();
     if (rules.length > 0) {
       let rulesContext = rules.map((r, i) => `${i+1}. ${r.rule_text}`).join('\n');
       if (rulesContext.length > MAX_EMPLOYEE_RULES_CHARS) {
         rulesContext = rulesContext.slice(0, MAX_EMPLOYEE_RULES_CHARS) + '\n[truncated]';
         logger.warn('Employee rules context truncated');
       }
       machineEnv.EMPLOYEE_RULES = rulesContext;
     }
     ```

  4. **Add**: `EMPLOYEE_KNOWLEDGE` construction:

     ```typescript
     // Query reference knowledge for this archetype
     const kbResp = await fetch(`${supabaseUrl}/rest/v1/knowledge_bases?archetype_id=eq.${archetypeId}`, ...);
     const kbRows = await kbResp.json();
     if (kbRows.length > 0) {
       let knowledgeContext = kbRows.map(kb => {
         const config = kb.source_config;
         if (config?.themes) return config.themes.map(t => `- ${t}`).join('\n');
         return JSON.stringify(config);
       }).join('\n\n');
       if (knowledgeContext.length > MAX_EMPLOYEE_KNOWLEDGE_CHARS) {
         knowledgeContext = knowledgeContext.slice(0, MAX_EMPLOYEE_KNOWLEDGE_CHARS) + '\n[truncated]';
       }
       machineEnv.EMPLOYEE_KNOWLEDGE = knowledgeContext;
     }
     ```

  5. **Remove old constants** (if not still referenced): `MAX_FEEDBACK_CONTEXT_CHARS`, `CONSOLIDATION_THRESHOLD`, `MAX_LEARNED_RULES_CHARS`. Replace with `MAX_EMPLOYEE_RULES_CHARS` and `MAX_EMPLOYEE_KNOWLEDGE_CHARS`. Use `lsp_find_references` on each constant before deleting to ensure no other code references them.

  **Must NOT do**:
  - Do NOT modify the `knowledge_bases` query structure — just change the env var name
  - Do NOT add any filtering to knowledge_bases (the query stays as-is, reading ALL KB rows for the archetype)
  - Do NOT modify the FEEDBACK_CONTEXT or LEARNED_RULES_CONTEXT in the harness (`src/workers/opencode-harness.mts`) — it just reads env vars; changing the var names in the lifecycle is sufficient

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11-14)
  - **Blocks**: Tasks 12, 13, 14
  - **Blocked By**: Tasks 4, 5, 6, 7, 8

  **References**:
  - `src/inngest/employee-lifecycle.ts:490-609` — the `dispatch-machine` step's feedback/rules injection section. This is the ONLY section to modify. The step is long (~150 lines for injection); use `lsp_find_references` on `FEEDBACK_CONTEXT` and `LEARNED_RULES_CONTEXT` to find exact locations.
  - `src/workers/opencode-harness.mts` — reads `process.env.FEEDBACK_CONTEXT` and `process.env.LEARNED_RULES_CONTEXT`. After this change, it will read `process.env.EMPLOYEE_RULES` and `process.env.EMPLOYEE_KNOWLEDGE`. Check if the harness explicitly references these env var names (it may just pass through all env vars without naming them).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: EMPLOYEE_RULES injected with confirmed rules
    Tool: Bash (curl to admin API + psql)
    Preconditions: At least 1 confirmed employee_rules row for the guest-messaging archetype
    Steps:
      1. Trigger a guest-messaging task: curl -X POST admin trigger endpoint
      2. Wait for task to reach Executing state
      3. Check the task's machine env (from logs or DB metadata)
      4. Assert: EMPLOYEE_RULES env var is present and contains the confirmed rule text
      5. Assert: FEEDBACK_CONTEXT env var is NOT present
      6. Assert: LEARNED_RULES_CONTEXT env var is NOT present
    Expected Result: New env vars used, old env vars absent
    Evidence: .sisyphus/evidence/task-10-injection-new-vars.txt

  Scenario: EMPLOYEE_KNOWLEDGE injected with reference knowledge
    Tool: Bash (psql + curl)
    Steps:
      1. Verify knowledge_bases rows exist for the archetype (reference knowledge, not feedback themes)
      2. Trigger a task
      3. Check EMPLOYEE_KNOWLEDGE env var in machine env
      4. Assert: contains knowledge content from knowledge_bases
    Expected Result: Reference knowledge injected via new env var name
    Evidence: .sisyphus/evidence/task-10-knowledge-injection.txt

  Scenario: Old constants removed
    Tool: Bash (grep)
    Steps:
      1. grep -rn "MAX_FEEDBACK_CONTEXT_CHARS\|CONSOLIDATION_THRESHOLD\|MAX_LEARNED_RULES_CHARS" src/ --include='*.ts'
      2. Assert: zero matches (or only in comments/deprecation notes)
    Expected Result: No stale constant references in source
    Evidence: .sisyphus/evidence/task-10-constants-cleaned.txt
  ```

  **Commit**: YES
  - Message: `refactor(lifecycle): replace FEEDBACK_CONTEXT/LEARNED_RULES_CONTEXT with EMPLOYEE_RULES/EMPLOYEE_KNOWLEDGE`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

- [x] 11. Deregister feedback-summarizer and delete file

  **What to do**:
  Remove the old feedback-summarizer cron function from the codebase.
  1. **Deregister from Inngest serve**: Remove the function import and registration from `src/gateway/inngest/serve.ts`
  2. **Delete the file**: Remove `src/inngest/triggers/feedback-summarizer.ts`
  3. **Verify**: Restart the gateway and confirm the function no longer appears in the Inngest dev server function list

  **Must NOT do**:
  - Do NOT remove other trigger functions in the same directory (e.g., `guest-message-poll.ts`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 12-14)
  - **Blocks**: Task 13
  - **Blocked By**: Task 7

  **References**:
  - `src/gateway/inngest/serve.ts` — find the import and registration of `feedbackSummarizer` (or similar name). Remove both.
  - `src/inngest/triggers/feedback-summarizer.ts` — the file to delete

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Function deregistered from Inngest
    Tool: Bash (curl)
    Steps:
      1. Restart gateway (or wait for auto-restart)
      2. curl -s http://localhost:8288/v1/fns | jq '.[].name'
      3. Assert: output does NOT contain "trigger/feedback-summarizer"
    Expected Result: Cron function fully removed
    Evidence: .sisyphus/evidence/task-11-deregistered.txt

  Scenario: File deleted
    Tool: Bash
    Steps:
      1. ls src/inngest/triggers/feedback-summarizer.ts
      2. Assert: file not found
    Expected Result: File no longer exists
    Evidence: .sisyphus/evidence/task-11-file-deleted.txt
  ```

  **Commit**: YES
  - Message: `chore(inngest): deregister and delete feedback-summarizer cron`
  - Files: `src/inngest/triggers/feedback-summarizer.ts` (deleted), `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

---

- [x] 12. Drop old tables — `feedback` and `learned_rules`

  **What to do**:
  Create a Prisma migration that drops the `feedback` and `learned_rules` tables. This runs AFTER all code has been updated to use the new tables (Tasks 4-10) and data has been migrated (Task 3).
  1. Remove the `Feedback` and `LearnedRule` models from `prisma/schema.prisma`
  2. Run `pnpm prisma migrate dev --name drop_feedback_and_learned_rules`
  3. Verify the migration SQL contains `DROP TABLE feedback` and `DROP TABLE learned_rules`

  **Must NOT do**:
  - Do NOT drop `knowledge_bases` — it's still in use for reference knowledge
  - Do NOT drop `knowledge_base_entries` — used by interaction-handler for Q&A

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 13, 14)
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 3, 10

  **References**:
  - `prisma/schema.prisma:Feedback` (line ~143) — model to remove
  - `prisma/schema.prisma:LearnedRule` (line ~495) — model to remove
  - Check for any other models that have FK relations to `Feedback` or `LearnedRule` — use `lsp_find_references` on each model name

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Old tables dropped
    Tool: Bash (psql)
    Steps:
      1. Run: psql $DATABASE_URL -c "\d feedback"
      2. Assert: ERROR relation does not exist
      3. Run: psql $DATABASE_URL -c "\d learned_rules"
      4. Assert: ERROR relation does not exist
    Expected Result: Both old tables are gone
    Evidence: .sisyphus/evidence/task-12-tables-dropped.txt

  Scenario: New tables still intact
    Tool: Bash (psql)
    Steps:
      1. Run: psql $DATABASE_URL -c "SELECT COUNT(*) FROM feedback_events"
      2. Run: psql $DATABASE_URL -c "SELECT COUNT(*) FROM employee_rules"
      3. Assert: both queries succeed
    Expected Result: New tables unaffected by migration
    Evidence: .sisyphus/evidence/task-12-new-tables-intact.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): drop feedback and learned_rules tables`
  - Files: `prisma/schema.prisma`, migration file
  - Pre-commit: `pnpm build`

---

- [x] 13. Update AGENTS.md for redesigned feedback pipeline

  **What to do**:
  Update the `AGENTS.md` file to reflect the new feedback pipeline architecture. This is a documentation-only change.

  **Sections to update**:
  1. **Feedback Pipeline section**: Replace the entire section with the new architecture:
     - Two tables: `feedback_events` (audit) + `employee_rules` (behavioral)
     - Event-driven synthesis (no cron)
     - Uniform correction entry points
     - Two injection env vars: `EMPLOYEE_RULES`, `EMPLOYEE_KNOWLEDGE`

  2. **Inngest functions list**: Remove `trigger/feedback-summarizer`. Add `employee/rule-synthesizer`.

  3. **Key constants**: Replace `MAX_FEEDBACK_CONTEXT_CHARS`, `CONSOLIDATION_THRESHOLD`, `MAX_LEARNED_RULES_CHARS` with `MAX_EMPLOYEE_RULES_CHARS`, `MAX_EMPLOYEE_KNOWLEDGE_CHARS`, `SYNTHESIS_THRESHOLD`.

  4. **Database section**: Update table descriptions. Remove `feedback` and `learned_rules` references. Add `feedback_events` and `employee_rules`.

  5. **OpenCode worker section**: Update env var names (`FEEDBACK_CONTEXT` → removed, `LEARNED_RULES_CONTEXT` → `EMPLOYEE_RULES`, add `EMPLOYEE_KNOWLEDGE`).

  **Must NOT do**:
  - Do NOT rewrite unrelated sections of AGENTS.md
  - Do NOT remove historical context about deprecated components (keep the deprecation table)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10-12, 14)
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 10, 11

  **References**:
  - `AGENTS.md` — the file to update. Search for: "Feedback Pipeline", "feedback-summarizer", "FEEDBACK_CONTEXT", "LEARNED_RULES_CONTEXT", "CONSOLIDATION_THRESHOLD", "MAX_FEEDBACK_CONTEXT_CHARS", "MAX_LEARNED_RULES_CHARS", "learned_rules", "feedback" (as table name)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No stale references in AGENTS.md
    Tool: Bash (grep)
    Steps:
      1. grep -c "FEEDBACK_CONTEXT\|LEARNED_RULES_CONTEXT\|CONSOLIDATION_THRESHOLD\|MAX_FEEDBACK_CONTEXT_CHARS\|MAX_LEARNED_RULES_CHARS" AGENTS.md
      2. Assert: 0 matches (or only in historical/deprecated context)
      3. grep -c "feedback-summarizer" AGENTS.md
      4. Assert: 0 matches in active function lists (may appear in deregistered list)
    Expected Result: Documentation reflects new architecture
    Evidence: .sisyphus/evidence/task-13-agents-md-updated.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): update AGENTS.md for redesigned feedback pipeline`
  - Files: `AGENTS.md`
  - Pre-commit: —

---

- [x] 14. Rewrite test files for new schema

  **What to do**:
  Find all test files that reference old table names (`feedback`, `learned_rules`) or old env vars (`FEEDBACK_CONTEXT`, `LEARNED_RULES_CONTEXT`) and update them.
  1. **Find affected tests**: Run `grep -rl "learned_rules\|'feedback'\|FEEDBACK_CONTEXT\|LEARNED_RULES_CONTEXT" tests/ src/**/*.test.ts`
  2. **For each test file**:
     - Replace `learned_rules` table references → `employee_rules`
     - Replace `feedback` table references → `feedback_events`
     - Replace `FEEDBACK_CONTEXT` → `EMPLOYEE_RULES` (where testing injection)
     - Replace `LEARNED_RULES_CONTEXT` → `EMPLOYEE_RULES` (where testing injection)
     - Update column names: `entity_type`/`entity_id` → `archetype_id`, `correction_reason` → `correction_content`, etc.
     - Remove tests for `batch_rules_confirm` handler (consolidation is eliminated)
     - Add basic tests for the synthesis trigger (every Nth confirmation fires event)
  3. **Run full test suite**: `pnpm test -- --run` — must pass with ≥515 tests

  **Must NOT do**:
  - Do NOT modify tests unrelated to the feedback pipeline
  - Do NOT skip pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10-13)
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 4-8, 10

  **References**:
  - `tests/` directory — all test files. Use `grep -rl "learned_rules\|FEEDBACK_CONTEXT\|LEARNED_RULES_CONTEXT\|batch_rules_confirm" tests/` to find affected files.
  - `src/inngest/__tests__/` — may contain tests for rule-extractor, interaction-handler, lifecycle
  - `src/gateway/__tests__/` — may contain tests for Slack handlers

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1
      2. Assert: exit code 0
      3. Assert: ≥515 tests passing
      4. Assert: 0 failures (excluding pre-existing known failures)
    Expected Result: Full test suite green
    Evidence: .sisyphus/evidence/task-14-tests-pass.txt

  Scenario: No stale table references in test files
    Tool: Bash (grep)
    Steps:
      1. grep -rn "'learned_rules'\|'feedback'" tests/ src/**/*.test.ts | grep -v feedback_events | grep -v "// migration"
      2. Assert: 0 matches
    Expected Result: All tests reference new table names
    Evidence: .sisyphus/evidence/task-14-no-stale-refs.txt
  ```

  **Commit**: YES
  - Message: `test(feedback): rewrite feedback pipeline tests for new schema`
  - Files: `tests/**/*.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [ ] 15. Create E2E test guide for redesigned feedback pipeline

  **What to do**:
  Create a comprehensive E2E test guide document at `docs/YYYY-MM-DD-HHMM-feedback-pipeline-v2-e2e-test-guide.md` (run `date "+%Y-%m-%d-%H%M"` for the timestamp). This guide covers sequential scenarios that exercise the full redesigned feedback loop, similar in structure and depth to the original `docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md`.

  **Document structure** (follow the original guide's format exactly):
  1. **Prerequisites** section — services health checks (gateway, Inngest, Socket Mode), fixed test resources table (VLRE tenant, archetype ID, channels, DB connection, Inngest dashboard)

  2. **Scenario A — Edit & Send: uniform audit + rule extraction**
     - Send Airbnb message → wait for approval card → click Edit & Send with modification
     - **Verify**: `feedback_events` row created with `event_type: 'edit_diff'`, `archetype_id` set
     - **Verify**: `employee_rules` row created with `status: 'proposed'`, `source: 'edit_diff'`
     - **Verify**: Rule review card posted to notification channel
     - Click Confirm → `employee_rules.status = 'confirmed'`
     - Each step: exact SQL queries to run, exact expected output, what to check

  3. **Scenario B — Reject with reason: now triggers rule extraction (previously didn't)**
     - Send message → wait for card → click Reject with reason "Too informal, always use formal language"
     - **Verify**: `feedback_events` row created with `event_type: 'rejection_reason'`
     - **Verify**: Rule extraction fires (this is NEW — old system didn't extract rules from rejections with reasons)
     - **Verify**: `employee_rules` row with `status: 'proposed'` or `'awaiting_input'`
     - Confirm the rule

  4. **Scenario C — Thread reply teaching: audit + rule via interaction handler**
     - Reply in thread on an existing task message with a teaching correction
     - **Verify**: `feedback_events` row with `event_type: 'thread_reply'` and `archetype_id` set
     - **Verify**: Rule extraction fires, proposed rule appears
     - Confirm the rule

  5. **Scenario D — Injection verification**
     - Trigger a new guest-messaging task
     - **Verify**: `EMPLOYEE_RULES` env var contains all confirmed rules from Scenarios A-C
     - **Verify**: `EMPLOYEE_KNOWLEDGE` env var present (if knowledge_bases has reference knowledge)
     - **Verify**: `FEEDBACK_CONTEXT` env var is ABSENT
     - **Verify**: `LEARNED_RULES_CONTEXT` env var is ABSENT
     - Exact commands to check the dispatched machine's environment

  6. **Scenario E — Synthesis trigger on 5th confirmation**
     - Confirm 2 more rules (reaching 5 total confirmed for the archetype)
     - **Verify**: `employee/rule.synthesize-requested` event fired in Inngest
     - **Verify**: If overlapping rules exist, a `source: 'synthesis'` proposed rule appears
     - **Verify**: No `knowledge_bases` rows written (consolidation is gone)

  7. **Scenario F — Synthesis confirmation and archival**
     - If synthesis proposed a merged rule: confirm it
     - **Verify**: Merged rule is `confirmed`, original parent rules are `archived`
     - **Verify**: `EMPLOYEE_RULES` injection on next run includes the merged rule and excludes archived originals

  **For each scenario include** (matching original guide format):
  - Numbered steps with Action / Where table format
  - Exact DB verification queries (SQL with expected output)
  - Checkpoint boxes: `- [ ] Checkpoint: [description]`
  - Edge cases and failure indicators
  - What to do if a step fails

  **Additional sections**:
  - **Cleanup**: How to reset test state (delete test feedback_events, employee_rules rows)
  - **Troubleshooting**: Common failures mapped to causes and fixes
  - **Dedup verification**: Attempt to fire rule.extract-requested twice for the same task — verify only one employee_rules row created
  - **No-cron verification**: Confirm feedback-summarizer is NOT in Inngest function list

  **Must NOT do**:
  - Do NOT modify or overwrite the original E2E test guide (`docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md`)
  - Do NOT reference old table names (`feedback`, `learned_rules`) except to contrast with old behavior

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after all implementation)
  - **Blocks**: Tasks 16, 17
  - **Blocked By**: All previous tasks (needs to reflect final implementation)

  **References**:
  - `docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` — the EXACT format model. Match its structure: prerequisites table, scenario-per-section with numbered steps, DB verification queries at each checkpoint, troubleshooting section. This is the template — the new guide should feel like a natural sequel.
  - `AGENTS.md` — E2E Testing with Playwright Browser section, Hostfully Testing section, fixed test resource IDs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Test guide document exists and is well-structured
    Tool: Bash
    Steps:
      1. ls docs/*feedback-pipeline-v2-e2e-test-guide.md
      2. Assert: file exists
      3. grep -c "## Scenario" docs/*feedback-pipeline-v2-e2e-test-guide.md
      4. Assert: at least 6 scenarios (A through F)
      5. grep -c "Checkpoint:" docs/*feedback-pipeline-v2-e2e-test-guide.md
      6. Assert: at least 12 checkpoints (2+ per scenario)
    Expected Result: Comprehensive test guide with 6+ scenarios and 12+ checkpoints
    Evidence: .sisyphus/evidence/task-15-test-guide-structure.txt

  Scenario: Guide references new tables and env vars only
    Tool: Bash (grep)
    Steps:
      1. grep -c "feedback_events" docs/*feedback-pipeline-v2-e2e-test-guide.md
      2. Assert: > 0 (uses new table name)
      3. grep -c "employee_rules" docs/*feedback-pipeline-v2-e2e-test-guide.md
      4. Assert: > 0
      5. grep -c "EMPLOYEE_RULES" docs/*feedback-pipeline-v2-e2e-test-guide.md
      6. Assert: > 0
      7. grep "FEEDBACK_CONTEXT\|LEARNED_RULES_CONTEXT" docs/*feedback-pipeline-v2-e2e-test-guide.md
      8. Assert: only appears in "verify ABSENT" context, not as active env vars
    Expected Result: Guide uses new schema terminology throughout
    Evidence: .sisyphus/evidence/task-15-correct-refs.txt
  ```

  **Commit**: YES
  - Message: `docs(e2e): add feedback pipeline v2 E2E test guide`
  - Files: `docs/YYYY-MM-DD-HHMM-feedback-pipeline-v2-e2e-test-guide.md`
  - Pre-commit: —

---

- [ ] 16. Full pipeline E2E verification

  **What to do**:
  Execute ALL scenarios from the E2E test guide created in Task 15 against the live local dev environment. Walk the full pipeline end-to-end, fixing any bugs found in-flight.

  **Execute these scenarios sequentially**:
  1. **Scenario A** — Edit & Send: audit + rule extraction + confirmation
  2. **Scenario B** — Reject with reason: audit + rule extraction (new behavior)
  3. **Scenario C** — Thread reply teaching: audit + rule via interaction handler
  4. **Scenario D** — Injection verification: EMPLOYEE_RULES present, old env vars absent
  5. **Scenario E** — Synthesis trigger on 5th confirmation
  6. **Scenario F** — Synthesis confirmation and archival

  Follow every step, run every DB verification query, check every checkpoint. If a bug is found, fix it in-flight and re-verify the failing step before proceeding.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`dev-browser`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential)
  - **Blocks**: Task 17
  - **Blocked By**: All previous tasks including Task 15

  **References**:
  - `docs/*feedback-pipeline-v2-e2e-test-guide.md` — the test guide created in Task 15. Execute it exactly.
  - `docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` — the original test guide (for methodology reference, not execution)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All E2E scenarios pass
    Tool: Bash + Playwright browser
    Steps:
      1. Execute Scenarios A through F from the test guide
      2. Verify each checkpoint passes
      3. Document results
    Expected Result: All 6+ scenarios pass, complete feedback loop verified
    Evidence: .sisyphus/evidence/task-16-e2e-results.txt
  ```

  **Commit**: NO (verification only — bug fixes committed individually if needed)

---

- [ ] 17. Telegram notification

  **What to do**:
  Send Telegram notification that the plan is complete.

  ```bash
  tsx scripts/telegram-notify.ts "✅ feedback-system-redesign complete — All tasks done. Come back to review results."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: Task 15

  **Acceptance Criteria**:

  ```
  Scenario: Notification sent
    Tool: Bash
    Steps:
      1. Run: npx tsx scripts/telegram-notify.ts "✅ feedback-system-redesign complete"
      2. Assert: output contains "Notification sent"
    Expected Result: Telegram notification delivered
    Evidence: .sisyphus/evidence/task-16-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, query DB, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no references to old table names (`feedback` as table name, `learned_rules`) remain in source code (excluding migration files and AGENTS.md history).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Walk the full feedback pipeline: (1) trigger a guest-messaging task, (2) click Edit & Send with a modification, (3) verify feedback_events row created + rule proposed, (4) confirm the rule via PostgREST, (5) trigger another task and verify EMPLOYEE_RULES contains the rule, (6) confirm 4 more rules and verify synthesis fires. Check that FEEDBACK_CONTEXT and LEARNED_RULES_CONTEXT are NOT present in the env. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Verify knowledge_bases table was NOT modified. Verify guest approval handlers were NOT touched. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Message                                                                                                      | Files                                                                     | Pre-commit           |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------- |
| 1    | `feat(schema): add feedback_events and employee_rules tables`                                                | prisma/schema.prisma, migration file                                      | `pnpm build`         |
| 1    | `feat(feedback): add shared types, constants, and event definitions`                                         | src/inngest/types/feedback.ts, src/lib/constants.ts                       | `pnpm build`         |
| 2    | `feat(migration): migrate learned_rules data to employee_rules`                                              | scripts/migrate-feedback-data.ts                                          | `pnpm build`         |
| 2    | `refactor(lifecycle): uniform correction handling with feedback_events`                                      | src/inngest/employee-lifecycle.ts                                         | `pnpm build`         |
| 2    | `refactor(rule-extractor): write to employee_rules table`                                                    | src/inngest/rule-extractor.ts                                             | `pnpm build`         |
| 2    | `refactor(interaction-handler): use feedback_events + employee_rules`                                        | src/inngest/interaction-handler.ts                                        | `pnpm build`         |
| 2    | `feat(feedback): add event-driven rule-synthesizer function`                                                 | src/inngest/rule-synthesizer.ts                                           | `pnpm build`         |
| 2    | `refactor(slack): update rule handlers for employee_rules + synthesis trigger`                               | src/gateway/slack/handlers.ts                                             | `pnpm build`         |
| 3    | `refactor(lifecycle): replace FEEDBACK_CONTEXT/LEARNED_RULES_CONTEXT with EMPLOYEE_RULES/EMPLOYEE_KNOWLEDGE` | src/inngest/employee-lifecycle.ts                                         | `pnpm build`         |
| 3    | `chore(inngest): deregister feedback-summarizer cron`                                                        | src/inngest/triggers/feedback-summarizer.ts, src/gateway/inngest/serve.ts | `pnpm build`         |
| 3    | `feat(schema): drop feedback and learned_rules tables`                                                       | prisma/schema.prisma, migration file                                      | `pnpm build`         |
| 3    | `docs(agents): update AGENTS.md for redesigned feedback pipeline`                                            | AGENTS.md                                                                 | —                    |
| 3    | `test(feedback): rewrite feedback pipeline tests for new schema`                                             | tests/\*_/_.test.ts                                                       | `pnpm test -- --run` |
| 4    | `docs(e2e): add feedback pipeline v2 E2E test guide`                                                         | docs/YYYY-MM-DD-HHMM-feedback-pipeline-v2-e2e-test-guide.md               | —                    |
| 4    | `test(e2e): verify full feedback pipeline end-to-end`                                                        | .sisyphus/evidence/                                                       | —                    |

---

## Success Criteria

### Verification Commands

```bash
# New tables exist
psql $DATABASE_URL -c "\d feedback_events"  # Expected: table with archetype_id, correction_content, etc.
psql $DATABASE_URL -c "\d employee_rules"   # Expected: table with status, source, archetype_id, etc.

# Old tables gone
psql $DATABASE_URL -c "\d feedback"         # Expected: ERROR relation does not exist
psql $DATABASE_URL -c "\d learned_rules"    # Expected: ERROR relation does not exist

# Migration preserved data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM employee_rules WHERE status='confirmed'"  # Expected: ≥ 1

# No crons in feedback pipeline
curl -s http://localhost:8288/v1/fns | grep -c "feedback-summarizer"  # Expected: 0

# Injection uses new env vars
# Trigger a task, check that EMPLOYEE_RULES is set, FEEDBACK_CONTEXT is NOT set

# Tests pass
pnpm test -- --run  # Expected: ≥515 passing, 0 failures

# No stale references
grep -r "FEEDBACK_CONTEXT\|LEARNED_RULES_CONTEXT" src/ --include='*.ts' | grep -v '// deprecated'  # Expected: 0 matches
grep -r "'feedback'" src/ --include='*.ts' | grep -v feedback_events | grep -v migration  # Expected: 0 matches
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] No stale table/env var references in source
- [ ] `git status` clean
