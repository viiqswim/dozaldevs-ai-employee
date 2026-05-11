# Feedback/KB Injection Redesign — Zero Data Loss

## TL;DR

> **Quick Summary**: Redesign the feedback injection system to prevent silent data loss. Currently 16 of 26 feedback items are invisible to the AI employee, and only 1 of 22 learned rules ever reached `confirmed`. The fix: inject ALL unconsolidated raw feedback (no limits), replace per-correction rule extraction with threshold-triggered batch consolidation, and give the PM one batch review instead of 14+ individual Slack cards.
>
> **Deliverables**:
>
> - Modified injection logic that injects all unconsolidated feedback + all confirmed rules (no hard limits)
> - Threshold-triggered consolidation that replaces the weekly cron
> - Batch PM review flow (one Slack message with all proposed rules)
> - `consolidated_at` column on feedback table to track graduation
> - Cleanup of 14 stale `awaiting_input` rules
> - Vitest tests for new injection and consolidation logic
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (schema migration) → Task 3 (injection rewrite) → Task 6 (consolidation trigger) → Task 8 (tests) → Final Verification

---

## Context

### Original Request

Victor identified the current feedback injection system as a "massive design flaw" — the AI employee silently forgets feedback past hard-coded limits, and the learned_rules pipeline (designed to be the durable solution) is largely non-functional.

### Interview Summary

**Key Discussions**:

- **Data loss confirmed**: 26 feedback rows exist for VLRE, but only 5 reach the AI. Items 11-26 are invisible.
- **Learned rules broken**: Only 1 of 22 rules is `confirmed`. 14 are stuck in `awaiting_input` with empty `rule_text`.
- **Root cause**: The rule-extractor LLM often returns `{"extractable": false}`, and PMs don't act on individual Slack confirmation cards.
- **Approach**: Remove limits on raw feedback injection. Replace individual rule extraction with periodic batch consolidation. PM reviews one batch, not 14+ cards.
- **PM inaction handling**: If PM doesn't confirm consolidated rules, raw feedback is still injected. No data loss path.
- **Consolidation cadence**: After N new feedback items (not weekly).
- **Stale rules**: Mark the 14 `awaiting_input` rules with empty `rule_text` as `rejected`.

**Research Findings**:

- `employee-lifecycle.ts:502-602` — injection logic with hard limits (3 KB rows, 10 feedback rows, 5 themes slice, 8000 char learned rules cap)
- `rule-extractor.ts` — produces `awaiting_input` with empty `rule_text` for 64% of corrections
- `feedback-summarizer.ts` — weekly cron that summarizes feedback into `knowledge_bases` themes AND synthesizes confirmed rules
- `interaction-handler.ts` — captures thread replies/mentions, detects `awaiting_input` rules for follow-up
- `handlers.ts:970-1214` — Slack button handlers for rule confirm/reject/rephrase
- `opencode-harness.mts:529-537` — consumes `FEEDBACK_CONTEXT` and `LEARNED_RULES_CONTEXT` env vars

### Self-Performed Gap Analysis (Metis unavailable — 50 descendant limit)

**Identified Gaps** (addressed):

- **Env var size limit**: Injecting ALL feedback as a single env var could hit system limits (~128KB). Solution: add a configurable char cap (`MAX_FEEDBACK_CONTEXT_CHARS`, default 32000) with a clear log warning when truncation occurs. This is a safety valve, not a data loss mechanism — consolidation is the real solution.
- **Consolidation threshold N**: Not explicitly decided. Defaulting to 5 unconsolidated items.
- **Multi-archetype feedback**: The current feedback table has no `archetype_id` column. Feedback is tenant-scoped, not archetype-scoped. When consolidating, the system needs to associate feedback with the correct archetype. Solution: use the `task_id → task → archetype_id` join path.
- **Feedback without task_id**: Some feedback rows may have `task_id: null` (from mentions without a task context). These cannot be associated with a specific archetype. Solution: inject tenant-wide null-task feedback into ALL archetypes for that tenant.
- **Edit-diff feedback type**: The `edit_diff` feedback type (from "Edit & Send" approval action) stores original/edited content, not a `correction_reason` string. The current injection only uses `correction_reason`. Solution: for `edit_diff` type, generate a diff summary during consolidation.
- **Race condition**: If consolidation runs while a task is being dispatched, the task might get a partial view. Solution: consolidation is idempotent — it processes all unconsolidated items and marks them, so the next dispatch always gets a consistent view.

---

## Work Objectives

### Core Objective

Eliminate silent feedback data loss by ensuring all PM corrections reach the AI employee, and replace the broken per-correction rule pipeline with a batch consolidation flow.

### Concrete Deliverables

- Modified `employee-lifecycle.ts` injection logic (no hard limits on feedback, inject all unconsolidated)
- New `consolidated_at` column on `feedback` table via Prisma migration
- Modified `feedback-summarizer.ts` (threshold-triggered consolidation + batch PM review)
- Cleanup migration/script for stale `awaiting_input` rules
- Vitest test suite for new injection and consolidation logic
- Updated AGENTS.md with new feedback pipeline documentation

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 failures (excluding pre-existing)
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] ALL feedback rows for VLRE tenant are injected into AI context (verified via env var content)
- [ ] Stale `awaiting_input` rules with empty text are marked `rejected`

### Must Have

- Zero data loss — every feedback item reaches the AI until explicitly consolidated
- Batch consolidation triggered after N new feedback items
- PM reviews consolidated rules via ONE Slack message, not individual cards
- `consolidated_at` tracking on feedback rows
- Safety cap on env var size with clear warning when hit
- Backward-compatible — existing confirmed rules continue to be injected

### Must NOT Have (Guardrails)

- No removal of the `feedback`, `learned_rules`, or `knowledge_bases` tables — schema is additive only
- No changes to how feedback is initially captured (interaction-handler classify + store flow stays the same)
- No changes to the Slack button handlers for existing `rule_confirm`/`rule_reject`/`rule_rephrase` (they continue to work for both old and new rules)
- No hardcoded tenant IDs or archetype IDs in the injection/consolidation logic — keep it employee-agnostic
- No removal of the `LEARNED_RULES_CONTEXT` env var — confirmed rules are still injected separately
- No `as any` or `@ts-ignore` in new code
- No console.log in production code — use `createLogger`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend logic**: Use Bash (node/bun REPL or direct PostgREST calls) to verify injection output
- **Database**: Use psql to verify schema changes and data state
- **Slack integration**: Verify message structure via unit tests (no live Slack needed for plan scope)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — schema + cleanup + types):
├── Task 1: Prisma migration — add consolidated_at to feedback [quick]
├── Task 2: Cleanup stale awaiting_input rules [quick]
└── Task 3: Add consolidation threshold constant + types [quick]

Wave 2 (After Wave 1 — core logic changes, MAX PARALLEL):
├── Task 4: Rewrite injection logic in employee-lifecycle.ts [deep]
├── Task 5: Rewrite feedback-summarizer.ts — threshold-triggered batch consolidation [deep]
└── Task 6: Add consolidation trigger logic [unspecified-high]

Wave 3 (After Wave 2 — tests + docs):
├── Task 7: Vitest tests for injection logic [unspecified-high]
├── Task 8: Vitest tests for consolidation logic [unspecified-high]
└── Task 9: Update AGENTS.md feedback pipeline docs [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks        | Wave  |
| ----- | ---------- | ------------- | ----- |
| 1     | —          | 4, 5, 6, 7, 8 | 1     |
| 2     | —          | —             | 1     |
| 3     | —          | 4, 5, 6       | 1     |
| 4     | 1, 3       | 7             | 2     |
| 5     | 1, 3       | 8             | 2     |
| 6     | 1, 3       | 8             | 2     |
| 7     | 4          | —             | 3     |
| 8     | 5, 6       | —             | 3     |
| 9     | 4, 5       | —             | 3     |
| F1-F4 | 7, 8, 9    | —             | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 3 tasks — T4 `deep`, T5 `deep`, T6 `unspecified-high`
- **Wave 3**: 3 tasks — T7 `unspecified-high`, T8 `unspecified-high`, T9 `writing`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Add `consolidated_at` column to feedback table

  **What to do**:
  - Add a nullable `DateTime` column `consolidated_at` to the `Feedback` model in `prisma/schema.prisma`
  - The column should be `DateTime? @db.Timestamptz(6)` — nullable because most feedback is unconsolidated
  - Run `npx prisma migrate dev --name add-feedback-consolidated-at` to generate the migration
  - Verify the migration SQL is correct (ALTER TABLE feedback ADD COLUMN consolidated_at TIMESTAMPTZ)
  - Run the migration against the local database

  **Must NOT do**:
  - Do NOT modify any other model in the schema
  - Do NOT add indexes on `consolidated_at` yet (premature optimization)
  - Do NOT rename existing columns

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file Prisma schema change + migration generation
  - **Skills**: []
    - No special skills needed for a schema migration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:494-513` — `LearnedRule` model shows the pattern for optional `DateTime` with `@db.Timestamptz(6)` (see `confirmed_at` field)

  **API/Type References**:
  - `prisma/schema.prisma:143-162` — Current `Feedback` model — add the new column here

  **WHY Each Reference Matters**:
  - The `LearnedRule.confirmed_at` pattern shows exactly how to add an optional timestamptz column — copy the same format for `consolidated_at`
  - The `Feedback` model is where the column goes — read the full model to understand the existing structure

  **Acceptance Criteria**:
  - [ ] `prisma/schema.prisma` has `consolidated_at DateTime? @db.Timestamptz(6)` on the `Feedback` model
  - [ ] Migration file exists in `prisma/migrations/` with `ALTER TABLE "feedback" ADD COLUMN "consolidated_at" TIMESTAMPTZ(6)`
  - [ ] `pnpm build` succeeds
  - [ ] Database has the new column: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='feedback' AND column_name='consolidated_at';"` returns 1 row

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Migration adds consolidated_at column successfully
    Tool: Bash (psql)
    Preconditions: Local database running on port 54322
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='feedback' AND column_name='consolidated_at';"
      2. Assert: Returns exactly 1 row with data_type='timestamp with time zone' and is_nullable='YES'
    Expected Result: Column exists, is nullable timestamptz
    Failure Indicators: Empty result set or wrong data type
    Evidence: .sisyphus/evidence/task-1-column-exists.txt

  Scenario: Existing feedback rows have NULL consolidated_at
    Tool: Bash (psql)
    Preconditions: Migration has run
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT COUNT(*) as total, COUNT(consolidated_at) as non_null FROM feedback;"
      2. Assert: non_null = 0 (all existing rows are NULL)
    Expected Result: All existing feedback rows have consolidated_at = NULL
    Failure Indicators: non_null > 0
    Evidence: .sisyphus/evidence/task-1-existing-rows-null.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add consolidated_at column to feedback table`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*add-feedback-consolidated-at*`
  - Pre-commit: `pnpm build`

- [x] 2. Reject stale awaiting_input rules with empty rule_text

  **What to do**:
  - Write a one-time cleanup SQL script that updates `learned_rules` SET `status = 'rejected'` WHERE `status = 'awaiting_input'` AND (`rule_text = ''` OR `rule_text IS NULL`)
  - Scope to VLRE tenant (`tenant_id = '00000000-0000-0000-0000-000000000003'`) to be safe
  - Execute the script against the local database
  - Log the count of affected rows
  - This is a one-time data fix, NOT a migration — use a script in `scripts/` or execute directly

  **Must NOT do**:
  - Do NOT delete any rows — only update status
  - Do NOT modify rules that have non-empty `rule_text`
  - Do NOT modify rules with status other than `awaiting_input`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL statement execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:494-513` — `LearnedRule` model showing `status`, `rule_text` columns

  **WHY Each Reference Matters**:
  - Need to verify column names and types match the UPDATE statement

  **Acceptance Criteria**:
  - [ ] All `awaiting_input` rules with empty `rule_text` for VLRE tenant are now `rejected`
  - [ ] Count of affected rows is logged/captured
  - [ ] No other rules were modified

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Stale rules are rejected
    Tool: Bash (psql)
    Preconditions: Local database with VLRE tenant data
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT COUNT(*) FROM learned_rules WHERE tenant_id='00000000-0000-0000-0000-000000000003' AND status='awaiting_input' AND (rule_text = '' OR rule_text IS NULL);"
      2. Assert: Returns 0 (all stale rules have been rejected)
    Expected Result: Zero rows with status='awaiting_input' and empty rule_text
    Failure Indicators: Count > 0
    Evidence: .sisyphus/evidence/task-2-stale-rules-count.txt

  Scenario: Valid rules are unaffected
    Tool: Bash (psql)
    Preconditions: Cleanup has run
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT id, status, rule_text FROM learned_rules WHERE tenant_id='00000000-0000-0000-0000-000000000003' AND status='confirmed';"
      2. Assert: The 1 confirmed rule still has status='confirmed' with non-empty rule_text
    Expected Result: Confirmed rules untouched
    Failure Indicators: Zero confirmed rules or rule_text changed
    Evidence: .sisyphus/evidence/task-2-valid-rules-intact.txt
  ```

  **Commit**: YES
  - Message: `fix(rules): reject stale awaiting_input rules with empty text`
  - Files: cleanup script or inline SQL evidence
  - Pre-commit: n/a

- [x] 3. Add consolidation constants and types

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, add a new constant `CONSOLIDATION_THRESHOLD = 5` next to the existing `MAX_LEARNED_RULES_CHARS = 8000` (line 31)
  - Add `MAX_FEEDBACK_CONTEXT_CHARS = 32000` constant for the safety cap on raw feedback injection size
  - These constants will be used by Tasks 4 and 5

  **Must NOT do**:
  - Do NOT change any existing logic in this task — just add constants
  - Do NOT add constants to a separate file — keep them co-located with existing `MAX_LEARNED_RULES_CHARS`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding 2 constants to an existing file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:31` — `MAX_LEARNED_RULES_CHARS = 8000` — add new constants next to this one

  **WHY Each Reference Matters**:
  - Constants should be co-located for discoverability — put them right next to the existing one

  **Acceptance Criteria**:
  - [ ] `CONSOLIDATION_THRESHOLD` exported from `employee-lifecycle.ts` with value `5`
  - [ ] `MAX_FEEDBACK_CONTEXT_CHARS` exported from `employee-lifecycle.ts` with value `32000`
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Constants are defined and exported
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n 'CONSOLIDATION_THRESHOLD\|MAX_FEEDBACK_CONTEXT_CHARS' src/inngest/employee-lifecycle.ts
      2. Assert: Both constants appear with correct values (5 and 32000)
    Expected Result: Two lines showing both constants
    Failure Indicators: Missing or wrong values
    Evidence: .sisyphus/evidence/task-3-constants-defined.txt

  Scenario: Build succeeds with new constants
    Tool: Bash
    Preconditions: Constants added
    Steps:
      1. Run: pnpm build
      2. Assert: Exit code 0
    Expected Result: Clean build
    Failure Indicators: TypeScript errors
    Evidence: .sisyphus/evidence/task-3-build-pass.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(lifecycle): inject all unconsolidated feedback without limits`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Rewrite feedback injection logic in employee-lifecycle.ts

  **What to do**:
  - Replace the current feedback injection logic at lines 502-557 of `employee-lifecycle.ts`
  - **New feedback query**: Remove the `limit=10` and `30-day window` filters. Instead, query ALL feedback rows where `consolidated_at IS NULL` for this tenant, ordered by `created_at desc`. Use PostgREST filter: `consolidated_at=is.null&tenant_id=eq.${tenantId}&select=correction_reason,feedback_type,created_at&order=created_at.desc`
  - **New KB query**: Remove the `limit=3` and `30-day window` filters. Query ALL `knowledge_bases` rows for this archetype, ordered by `created_at desc`. Keep the theme extraction logic.
  - **Remove the `.slice(0, 5)` caps** on both themes and feedback items
  - **Add safety cap**: After building the full `feedbackContext` string, if its length exceeds `MAX_FEEDBACK_CONTEXT_CHARS` (32000), truncate with a warning: `log.warn({ taskId, contextLen, maxLen: MAX_FEEDBACK_CONTEXT_CHARS }, 'Feedback context truncated — consolidation needed')`. Truncate by dropping the OLDEST items first (they're at the end since sorted by `created_at desc`).
  - **Keep the learned_rules injection** (lines 562-602) unchanged — it already works correctly for confirmed rules
  - **Log the injection stats**: Add an info log after building context: `log.info({ taskId, feedbackItems: N, kbThemes: N, learnedRules: N, feedbackContextLen: N }, 'Feedback context assembled')`

  **Must NOT do**:
  - Do NOT change the learned_rules query or injection logic (lines 562-602)
  - Do NOT change how env vars are passed to Docker/Fly.io containers
  - Do NOT change the harness consumption (`opencode-harness.mts:529-537`)
  - Do NOT add archetype-scoping to the feedback query (feedback is tenant-scoped by design — archetype-scoping happens during consolidation)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying core lifecycle logic in a 2000-line file requires careful context awareness
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:502-557` — Current feedback/KB injection logic to be replaced
  - `src/inngest/employee-lifecycle.ts:562-602` — Learned rules injection (DO NOT CHANGE — reference only)
  - `src/inngest/employee-lifecycle.ts:31` — `MAX_LEARNED_RULES_CHARS` constant — the new `MAX_FEEDBACK_CONTEXT_CHARS` will be nearby

  **API/Type References**:
  - PostgREST filter syntax: `consolidated_at=is.null` for null check, remove `limit` param for no limit

  **WHY Each Reference Matters**:
  - Lines 502-557 are the exact code to replace — understand the current flow before modifying
  - Lines 562-602 show the learned_rules pattern which must NOT be changed — don't accidentally break it while modifying the adjacent code
  - The safety cap pattern mirrors the `MAX_LEARNED_RULES_CHARS` pattern for consistency

  **Acceptance Criteria**:
  - [ ] Feedback query has NO `limit` parameter and NO `30-day` time window
  - [ ] Feedback query filters on `consolidated_at=is.null`
  - [ ] No `.slice(0, 5)` or `.slice(0, N)` caps on feedback items or themes
  - [ ] KB query has NO `limit=3` or `30-day` time window
  - [ ] Safety cap at `MAX_FEEDBACK_CONTEXT_CHARS` with truncation warning log
  - [ ] Info log with injection stats (feedback count, KB themes, learned rules, context length)
  - [ ] Learned rules injection (lines 562-602) is unchanged
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All unconsolidated feedback is included in context
    Tool: Bash (grep + build verification)
    Preconditions: Task 1 migration applied, constants from Task 3 exist
    Steps:
      1. Run: grep -A5 'consolidated_at' src/inngest/employee-lifecycle.ts | head -20
      2. Assert: Query uses `consolidated_at=is.null` filter
      3. Run: grep 'limit=' src/inngest/employee-lifecycle.ts | grep -i feedback
      4. Assert: No `limit=` parameter on the feedback query
      5. Run: grep 'slice(0' src/inngest/employee-lifecycle.ts
      6. Assert: No `.slice(0, 5)` on feedback or themes (may still exist on other unrelated arrays)
    Expected Result: Feedback query fetches all unconsolidated rows without limits
    Failure Indicators: `limit=` param found, or `slice(0, 5)` on feedback/themes
    Evidence: .sisyphus/evidence/task-4-no-limits.txt

  Scenario: Safety cap prevents env var overflow
    Tool: Bash (grep)
    Preconditions: Implementation complete
    Steps:
      1. Run: grep -n 'MAX_FEEDBACK_CONTEXT_CHARS' src/inngest/employee-lifecycle.ts
      2. Assert: Constant is referenced in truncation logic
      3. Run: grep -n 'Feedback context truncated' src/inngest/employee-lifecycle.ts
      4. Assert: Warning log exists
    Expected Result: Safety cap with truncation warning is implemented
    Failure Indicators: No reference to MAX_FEEDBACK_CONTEXT_CHARS in injection logic
    Evidence: .sisyphus/evidence/task-4-safety-cap.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(lifecycle): inject all unconsolidated feedback without limits`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Rewrite feedback-summarizer.ts — threshold-triggered batch consolidation

  **What to do**:
  - Replace the weekly cron trigger (`0 0 * * 0`) in `feedback-summarizer.ts` with a more frequent schedule (e.g., every 6 hours: `0 */6 * * *`) — the cron checks the threshold condition and exits early if not met
  - Add threshold check at the start: query count of unconsolidated feedback (`consolidated_at IS NULL`) per archetype. If count < `CONSOLIDATION_THRESHOLD` (5), skip this archetype.
  - **Keep the existing theme summarization logic** (lines 62-146) — it already summarizes feedback into themes correctly
  - **Change the Slack output**: Instead of individual rule cards, produce ONE Slack message per archetype with ALL proposed rules in a single batch. Include a "✅ Confirm All" button and a "📋 Review Details" button.
  - **New batch confirmation flow**: When PM clicks "✅ Confirm All", confirm all proposed rules in the batch AND mark all corresponding feedback rows as `consolidated_at = NOW()`. This requires a new Slack action handler (new `action_id`).
  - **Keep the rule synthesis logic** (lines 148-384) — but it should now run AFTER batch confirmation, not on its own schedule. Move it to be triggered when enough confirmed rules accumulate (can be part of the same cron cycle).
  - **Update knowledge_bases storage** — the summarizer should still store theme summaries in `knowledge_bases`, but without the 3-row injection limit (handled by Task 4)
  - Import `CONSOLIDATION_THRESHOLD` from `employee-lifecycle.ts` (or define it in a shared constants file if the circular dependency is awkward — use judgment)

  **Must NOT do**:
  - Do NOT remove the weekly synthesis logic — it still serves a purpose for merging overlapping confirmed rules
  - Do NOT hardcode tenant or archetype IDs
  - Do NOT change the LLM summarization prompts (they work correctly)
  - Do NOT create a completely new Inngest function — modify the existing one

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex logic modification in a 388-line file with Inngest step semantics, Slack integration, and LLM calls
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/inngest/triggers/feedback-summarizer.ts:30-146` — Current summarization logic (theme extraction + KB storage)
  - `src/inngest/triggers/feedback-summarizer.ts:148-384` — Current synthesis logic (merge overlapping rules, detect contradictions)
  - `src/inngest/rule-extractor.ts:183-246` — Slack card posting pattern for rule review (Confirm/Reject/Rephrase buttons) — use as reference for batch card design
  - `src/gateway/slack/handlers.ts:970-1008` — Existing `rule_confirm` handler — reference for new batch confirmation handler

  **API/Type References**:
  - PostgREST: `consolidated_at=is.null` for null check, `PATCH` with `consolidated_at` for marking consolidated

  **WHY Each Reference Matters**:
  - Lines 30-146 contain the theme summarization that should be preserved but triggered differently
  - Lines 148-384 contain the synthesis that stays but needs scheduling adjustment
  - The rule-extractor Slack card shows the button pattern to follow for batch cards
  - The handler shows how to wire a new Slack action for batch confirmation

  **Acceptance Criteria**:
  - [ ] Cron runs more frequently than weekly (every 6 hours)
  - [ ] Threshold check: skips archetypes with < 5 unconsolidated feedback items
  - [ ] Produces ONE Slack message per archetype with all proposed rules
  - [ ] "✅ Confirm All" button action_id is defined (e.g., `batch_rules_confirm`)
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Threshold check skips archetypes with few feedback items
    Tool: Bash (grep)
    Preconditions: Implementation complete
    Steps:
      1. Run: grep -n 'CONSOLIDATION_THRESHOLD\|consolidated_at.*is.null' src/inngest/triggers/feedback-summarizer.ts
      2. Assert: Threshold check exists, uses consolidated_at IS NULL count
    Expected Result: Threshold check prevents unnecessary consolidation
    Failure Indicators: No threshold check found
    Evidence: .sisyphus/evidence/task-5-threshold-check.txt

  Scenario: Batch Slack message replaces individual cards
    Tool: Bash (grep)
    Preconditions: Implementation complete
    Steps:
      1. Run: grep -n 'batch_rules_confirm\|Confirm All' src/inngest/triggers/feedback-summarizer.ts
      2. Assert: Batch confirmation action_id exists
      3. Run: grep -c 'rule_confirm' src/inngest/triggers/feedback-summarizer.ts
      4. Assert: No individual rule_confirm references in the summarizer (individual cards removed)
    Expected Result: Batch review replaces individual cards
    Failure Indicators: Individual rule_confirm still used in summarizer
    Evidence: .sisyphus/evidence/task-5-batch-confirm.txt
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `feat(feedback): threshold-triggered batch consolidation with PM review`
  - Files: `src/inngest/triggers/feedback-summarizer.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Add batch confirmation Slack handler

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, add a new action handler for `batch_rules_confirm` (the action_id from Task 5's batch Slack card)
  - When PM clicks "✅ Confirm All":
    1. Parse the `value` (JSON string containing array of rule IDs and associated feedback IDs)
    2. For each rule ID: PATCH `learned_rules` SET `status = 'confirmed'`, `confirmed_at = NOW()`
    3. For each associated feedback ID: PATCH `feedback` SET `consolidated_at = NOW()`
    4. Update the Slack message to show "✅ Confirmed by @{user} — {N} rules confirmed, {M} feedback items consolidated"
  - Add the handler near the existing `rule_confirm` handler (line 970) for consistency
  - The handler should be idempotent: if rules are already confirmed, skip them and update the message to "Already processed"

  **Must NOT do**:
  - Do NOT modify existing `rule_confirm`, `rule_reject`, `rule_rephrase` handlers
  - Do NOT delete any existing handler code
  - Do NOT use `any` type for the action body

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Slack handler with database operations, idempotency, and message updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:970-1008` — Existing `rule_confirm` handler — follow this exact pattern for the batch handler (ack, parse value, PostgREST PATCH, update Slack message)
  - `src/gateway/slack/handlers.ts:1008-1046` — Existing `rule_reject` handler — shows the message update pattern after processing

  **API/Type References**:
  - PostgREST PATCH: `PATCH /rest/v1/learned_rules?id=in.(id1,id2,id3)` for batch update
  - PostgREST PATCH: `PATCH /rest/v1/feedback?id=in.(id1,id2,id3)` for batch consolidated_at update

  **WHY Each Reference Matters**:
  - The existing `rule_confirm` handler at line 970 is the canonical pattern — the batch handler should look almost identical but operate on arrays instead of single IDs
  - PostgREST `in` filter allows batch updates without N separate requests

  **Acceptance Criteria**:
  - [ ] New `batch_rules_confirm` action handler exists in `handlers.ts`
  - [ ] Handler PATCHes all rule IDs to `confirmed` + PATCHes all feedback IDs with `consolidated_at`
  - [ ] Handler updates Slack message with confirmation text including actor mention (`<@userId>`)
  - [ ] Idempotent: already-confirmed rules don't cause errors
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Batch confirmation handler is registered
    Tool: Bash (grep)
    Preconditions: Implementation complete
    Steps:
      1. Run: grep -n "batch_rules_confirm" src/gateway/slack/handlers.ts
      2. Assert: At least 2 lines (handler registration + action_id usage)
    Expected Result: Handler is registered for the batch_rules_confirm action
    Failure Indicators: No matches
    Evidence: .sisyphus/evidence/task-6-handler-registered.txt

  Scenario: Handler updates both learned_rules and feedback tables
    Tool: Bash (grep)
    Preconditions: Implementation complete
    Steps:
      1. Run: grep -A20 "batch_rules_confirm" src/gateway/slack/handlers.ts | grep -c "learned_rules\|feedback\|consolidated_at"
      2. Assert: References to both tables exist
    Expected Result: Handler writes to both learned_rules (status=confirmed) and feedback (consolidated_at)
    Failure Indicators: Only one table referenced
    Evidence: .sisyphus/evidence/task-6-both-tables.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(feedback): threshold-triggered batch consolidation with PM review`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 7. Vitest tests for injection logic

  **What to do**:
  - Create `tests/inngest/feedback-injection.test.ts` with tests covering the new injection logic from Task 4
  - Test cases:
    1. **All unconsolidated feedback injected**: Mock PostgREST to return 20 feedback rows (none consolidated). Assert all 20 appear in `feedbackContext`.
    2. **Consolidated feedback excluded**: Mock PostgREST with mix of consolidated and unconsolidated. Assert only unconsolidated rows appear.
    3. **Safety cap truncation**: Mock PostgREST with enough feedback to exceed `MAX_FEEDBACK_CONTEXT_CHARS`. Assert context is truncated to the limit. Assert oldest items are dropped first.
    4. **Empty feedback gracefully handled**: Mock PostgREST returning empty array. Assert `feedbackContext` is empty string.
    5. **KB themes injected without limits**: Mock PostgREST with 10 KB entries. Assert all themes are included (no `.slice(0, 5)` cap).
  - Follow existing test patterns from `tests/inngest/` directory

  **Must NOT do**:
  - Do NOT test learned_rules injection (it's unchanged)
  - Do NOT hit real database — use mocked fetch/PostgREST responses
  - Do NOT modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Writing 5+ test cases with PostgREST mocking and assertion logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-feedback-context-rejection.test.ts` — Existing test for feedback context injection — follow the same mocking pattern
  - `tests/inngest/feedback-tenant-filter.test.ts` — Existing test for tenant-scoped feedback — follow the same setup pattern

  **WHY Each Reference Matters**:
  - The existing feedback context tests show exactly how to mock PostgREST responses and assert the constructed `feedbackContext` string — copy this pattern
  - The tenant filter test shows how to set up tenant-scoped test scenarios

  **Acceptance Criteria**:
  - [ ] Test file exists at `tests/inngest/feedback-injection.test.ts`
  - [ ] At least 5 test cases covering the scenarios above
  - [ ] `pnpm test -- --run tests/inngest/feedback-injection.test.ts` passes with 0 failures
  - [ ] Tests use mocked fetch, not real database

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: Test file created
    Steps:
      1. Run: pnpm test -- --run tests/inngest/feedback-injection.test.ts
      2. Assert: Exit code 0, all test cases pass
    Expected Result: 5+ tests pass
    Failure Indicators: Any test failure or file not found
    Evidence: .sisyphus/evidence/task-7-tests-pass.txt
  ```

  **Commit**: YES (groups with Task 8)
  - Message: `test(feedback): add tests for injection and consolidation logic`
  - Files: `tests/inngest/feedback-injection.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. Vitest tests for consolidation logic

  **What to do**:
  - Create `tests/inngest/feedback-consolidation.test.ts` with tests covering the new consolidation logic from Tasks 5 and 6
  - Test cases:
    1. **Threshold check skips low-count archetypes**: Mock PostgREST to return 3 unconsolidated feedback items. Assert the summarization step is NOT called.
    2. **Threshold check proceeds when met**: Mock PostgREST to return 7 unconsolidated feedback items (> threshold of 5). Assert summarization runs.
    3. **Batch Slack message format**: Assert the Slack message contains all proposed rules and has a `batch_rules_confirm` button.
    4. **Batch confirmation marks feedback as consolidated**: Mock the batch_rules_confirm handler, assert feedback rows get `consolidated_at` set.
  - Follow existing test patterns

  **Must NOT do**:
  - Do NOT test existing theme summarization or rule synthesis (unchanged logic)
  - Do NOT hit real Slack API
  - Do NOT modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Testing Inngest function logic with step mocking and Slack message assertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 9)
  - **Blocks**: None
  - **Blocked By**: Tasks 5, 6

  **References**:

  **Pattern References**:
  - `tests/inngest/rule-synthesis.test.ts` — Existing test for rule synthesis in the feedback-summarizer — follow the same mocking pattern
  - `tests/inngest/triggers/feedback-summarizer-injection.test.ts` — Existing test for feedback summarizer — follow the same setup

  **WHY Each Reference Matters**:
  - These tests show how to mock Inngest step functions, PostgREST responses, and Slack API calls for the feedback-summarizer — exact same patterns needed

  **Acceptance Criteria**:
  - [ ] Test file exists at `tests/inngest/feedback-consolidation.test.ts`
  - [ ] At least 4 test cases covering the scenarios above
  - [ ] `pnpm test -- --run tests/inngest/feedback-consolidation.test.ts` passes with 0 failures

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: Test file created
    Steps:
      1. Run: pnpm test -- --run tests/inngest/feedback-consolidation.test.ts
      2. Assert: Exit code 0, all test cases pass
    Expected Result: 4+ tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-8-tests-pass.txt
  ```

  **Commit**: YES (groups with Task 7)
  - Message: `test(feedback): add tests for injection and consolidation logic`
  - Files: `tests/inngest/feedback-consolidation.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Update AGENTS.md feedback pipeline docs

  **What to do**:
  - Update the "Feedback Pipeline" section in `AGENTS.md` to reflect the new architecture:
    - Document the new injection logic: ALL unconsolidated feedback injected (no limits), with `MAX_FEEDBACK_CONTEXT_CHARS` safety cap
    - Document the threshold-triggered consolidation (replaces weekly-only)
    - Document the batch PM review flow (one Slack message instead of individual cards)
    - Document the feedback graduation path: raw feedback → consolidated (via `consolidated_at`)
    - Update the "Inngest functions" list to reflect the changed cron schedule for `feedback-summarizer`
  - Keep the documentation concise and factual — follow the existing AGENTS.md style

  **Must NOT do**:
  - Do NOT rewrite sections unrelated to the feedback pipeline
  - Do NOT add verbose explanations or tutorials — AGENTS.md is a quick-reference guide
  - Do NOT reference specific line numbers (they go stale)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical documentation update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `AGENTS.md` — "Feedback Pipeline" section and "Inngest functions" list — update these sections

  **WHY Each Reference Matters**:
  - The existing sections need to be updated to reflect the new behavior — read them to understand what to change

  **Acceptance Criteria**:
  - [ ] "Feedback Pipeline" section documents the new zero-data-loss injection
  - [ ] Consolidation threshold is documented
  - [ ] Batch PM review flow is documented
  - [ ] Cron schedule for feedback-summarizer is updated
  - [ ] No verbose AI slop — concise, factual style

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Key terms appear in updated docs
    Tool: Bash (grep)
    Preconditions: AGENTS.md updated
    Steps:
      1. Run: grep -c 'consolidated_at\|unconsolidated\|CONSOLIDATION_THRESHOLD\|batch.*confirm\|MAX_FEEDBACK_CONTEXT_CHARS' AGENTS.md
      2. Assert: At least 3 of these terms appear
    Expected Result: New concepts are documented
    Failure Indicators: None of the new terms appear
    Evidence: .sisyphus/evidence/task-9-docs-updated.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): update feedback pipeline documentation`
  - Files: `AGENTS.md`
  - Pre-commit: n/a

- [x] 10. **Notify completion** — Send Telegram notification: plan `feedback-injection-redesign` complete, all tasks done, come back to review results.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Query VLRE tenant feedback rows and verify ALL are present in the injection output. Verify stale rules are rejected. Run consolidation threshold check. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group     | Message                                                                  | Files                                             | Pre-commit           |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------- | -------------------- |
| Tasks 1   | `feat(schema): add consolidated_at column to feedback table`             | prisma/schema.prisma, migration file              | `pnpm build`         |
| Task 2    | `fix(rules): reject stale awaiting_input rules with empty text`          | script or migration                               | n/a                  |
| Tasks 3-4 | `feat(lifecycle): inject all unconsolidated feedback without limits`     | src/inngest/employee-lifecycle.ts, constants file | `pnpm build`         |
| Tasks 5-6 | `feat(feedback): threshold-triggered batch consolidation with PM review` | src/inngest/triggers/feedback-summarizer.ts       | `pnpm build`         |
| Tasks 7-8 | `test(feedback): add tests for injection and consolidation logic`        | tests/                                            | `pnpm test -- --run` |
| Task 9    | `docs(agents): update feedback pipeline documentation`                   | AGENTS.md                                         | n/a                  |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: no errors
pnpm lint           # Expected: no errors
pnpm test -- --run  # Expected: all pass (excluding pre-existing failures)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] VLRE feedback injection includes all 26 rows (not just 5)
- [ ] Stale `awaiting_input` rules with empty text are status=`rejected`
- [ ] Consolidation threshold logic exists and is configurable
