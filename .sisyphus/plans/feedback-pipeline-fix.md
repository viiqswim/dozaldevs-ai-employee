# Fix Feedback/Learning Pipeline — End-to-End

## TL;DR

> **Quick Summary**: Fix the broken feedback/learning pipeline so the AI employee actually learns from rejections, edits, and teaching. Currently, rejection-without-reason replies display "Task `unknown`", feedback bleeds across tenants, 8 learned rules are stuck, and the weekly summarizer hasn't populated knowledge themes.
>
> **Deliverables**:
>
> - Fixed rejection-without-reason → reply → rule proposal flow
> - Tenant-scoped feedback queries (lifecycle + summarizer)
> - Cleaned up stale `awaiting_input` rules
> - Verified weekly feedback-summarizer cron populates `knowledge_bases`
> - End-to-end verified learning loop
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Task 8 → F1–F4

---

## Context

### Original Request

User reported: "When he said 'Got it, I'll work on that,' he posted the task as unknown." Also asked: "Can you please help me investigate whether the feedback I'm giving him is being used in other sessions or in other messages the system receives, so the AI employee is constantly learning and growing?"

### Interview Summary

**Key Discussions**:

- Investigation traced the "unknown" bug to `interaction-handler.ts` line 317 — the `contextId` fallback chain hits `'unknown'` when `taskId` is null and `context.archetypeId` is also null
- Root cause: lifecycle's rejection-without-reason flow does NOT create an `awaiting_input` learned_rule, so the interaction-handler can't route the reply correctly
- Feedback query at lifecycle line 253 lacks a `tenant_id` filter — loads ALL tenants' feedback
- 8 of 12 learned_rules are stuck in `awaiting_input` with empty `rule_text`
- `knowledge_bases` table is empty — weekly cron hasn't populated it
- Two-tier memory design (short-term feedback + long-term rules) is correct — the pipeline that converts feedback to rules is broken
- User wants the full pipeline fixed, not just critical bugs

**Research Findings**:

- The `findTaskIdByThreadTs` function (handlers.ts:18-33) queries `deliverables.metadata->>approval_message_ts` — this should work for rejection threads since the user replies in the same thread as the approval card
- The `detect-awaiting-input-rule` step (interaction-handler.ts:65-90) queries by `source_task_id` — works for edit_diff rules, but no equivalent rule exists for rejections
- The `rule-extractor.ts` (lines 265-313) creates `awaiting_input` rules ONLY for `edit_diff` when LLM says non-extractable — this pattern needs to be replicated for rejections
- The `feedback-summarizer.ts` cron (`0 0 * * 0` — Sunday midnight UTC) has the same missing tenant filter issue (line 67-68, already tracked as TODO GM-19)
- The `LEARNED_RULES_CONTEXT` injection (lifecycle lines 303-343) is correctly filtered by tenant and archetype

### Self-Performed Gap Analysis (Metis substitute — descendant limit reached)

**Identified Gaps** (addressed in plan):

- Guardrail: Don't modify `edit_diff` rule-extractor path — only add rejection-without-reason path
- Guardrail: Don't change the 30-day feedback window — correct design once distillation works
- Edge case: User replying twice to solicitation — second reply should go through normal classification after first captures the awaiting_input rule
- Assumption to validate: `findTaskIdByThreadTs` actually works for rejection thread replies (verify in Task 5)
- Missing E2E scenario: Full loop from reject → reply → rule proposed → confirm → verify in next session

---

## Work Objectives

### Core Objective

Fix the feedback/learning pipeline so that:

1. Rejection feedback (with or without inline reason) is properly captured as learned rules
2. Feedback is tenant-scoped (no cross-tenant bleed)
3. The weekly summarizer populates knowledge themes
4. The AI employee demonstrably improves based on confirmed rules

### Concrete Deliverables

- Modified `src/inngest/employee-lifecycle.ts`: Create `awaiting_input` learned_rule on rejection without reason
- Modified `src/inngest/employee-lifecycle.ts`: Add `tenant_id` filter to feedback query (line 253)
- Modified `src/inngest/triggers/feedback-summarizer.ts`: Add `tenant_id` filter to feedback query (line 67-68)
- New tests verifying the fixed flows
- Verified `knowledge_bases` table populated after manual cron trigger
- Cleaned up 8 stale `awaiting_input` rules
- End-to-end verification that the full learning loop works

### Definition of Done

- [ ] Rejection-without-reason → reply flow produces a `proposed` learned_rule (not "Got it! I'll work on that." + "unknown")
- [ ] `FEEDBACK_CONTEXT` query filtered by `tenant_id`
- [ ] Feedback-summarizer query filtered by `tenant_id`
- [ ] `knowledge_bases` table has at least 1 entry after manual trigger
- [ ] `pnpm test -- --run` passes (no regressions beyond pre-existing failures)
- [ ] `pnpm build` passes

### Must Have

- Rejection-without-reason flow creates `awaiting_input` learned_rule with proper `source_task_id`
- Tenant filter on all feedback queries
- Manual trigger of feedback-summarizer cron with verification
- Tests for the rejection-without-reason → reply → rule proposal path
- E2E verification of the full learning loop

### Must NOT Have (Guardrails)

- Do NOT modify the `edit_diff` rule-extractor path (`src/inngest/rule-extractor.ts`) — it works correctly
- Do NOT change the 30-day feedback window — it's the correct design
- Do NOT modify `createTaskAndDispatch` — shared infrastructure
- Do NOT refactor the entire interaction-handler or classifier — just fix the broken paths
- Do NOT change the `LEARNED_RULES_CONTEXT` injection — it already works correctly
- Do NOT add employee-specific language to shared files (e.g., "guest", "Hostfully")
- Do NOT use any LLM model other than `minimax/minimax-m2.7` (execution) or `anthropic/claude-haiku-4-5` (review/judge)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (bun test compatible)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/DB**: Use Bash (curl to PostgREST) — query tables, assert field values
- **Inngest functions**: Use Bash (curl to Inngest dev server) — trigger events, check function runs
- **Code quality**: Use Bash (pnpm test, pnpm build, pnpm lint)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent fixes, MAX PARALLEL):
├── Task 1: Create awaiting_input rule on rejection without reason [quick]
├── Task 2: Add tenant filter to feedback query in lifecycle [quick]
├── Task 3: Add tenant filter to feedback query in summarizer [quick]
└── Task 4: Clean up stale awaiting_input rules [quick]

Wave 2 (After Wave 1 — tests + cron verification):
├── Task 5: Tests for rejection-without-reason → reply → rule flow [unspecified-high]
├── Task 6: Tests for tenant-scoped feedback queries [quick]
└── Task 7: Manually trigger feedback-summarizer and verify knowledge_bases [unspecified-high]

Wave 3 (After Wave 2 — E2E verification):
└── Task 8: End-to-end learning loop verification [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 5, 8   | 1     |
| 2     | —          | 6, 8   | 1     |
| 3     | —          | 6, 7   | 1     |
| 4     | —          | 8      | 1     |
| 5     | 1          | 8      | 2     |
| 6     | 2, 3       | 8      | 2     |
| 7     | 3          | 8      | 2     |
| 8     | 1-7        | F1-F4  | 3     |
| F1-F4 | 8          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: 3 tasks — T5 → `unspecified-high`, T6 → `quick`, T7 → `unspecified-high`
- **Wave 3**: 1 task — T8 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create `awaiting_input` learned_rule on rejection without reason

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, inside the rejection-without-reason block (around line 1550, after the "Got it, what should I have done differently?" solicitation is posted), add code to create an `awaiting_input` learned_rule
  - The new code should:
    1. Look up the archetype for the task (already available as `archetypeId` in the lifecycle scope)
    2. Create a `learned_rules` row via PostgREST POST with:
       - `tenant_id`: from lifecycle scope
       - `entity_type`: `'archetype'`
       - `entity_id`: `archetypeId`
       - `scope`: `'entity'`
       - `rule_text`: `''` (empty — will be filled when user replies)
       - `source`: `'rejection'`
       - `status`: `'awaiting_input'`
       - `source_task_id`: `taskId`
       - `slack_ts`: `approvalMsgTs` (the thread parent — so `detect-awaiting-input-rule` in interaction-handler can match replies by `source_task_id`)
       - `slack_channel`: `targetChannel`
  - Model this after the rule-extractor's `post-awaiting-input` step (rule-extractor.ts lines 265-311), but simpler — no Slack posting needed since the lifecycle already posted the solicitation
  - Wrap in try/catch — this is non-fatal (same pattern as other rejection flow operations)

  **Must NOT do**:
  - Do NOT modify the rejection-WITH-reason flow (lines 1437-1471) — it works correctly
  - Do NOT modify the rule-extractor.ts — it handles edit_diff correctly
  - Do NOT use employee-specific language in log messages

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change, ~20 lines of code, follows existing PostgREST pattern
  - **Skills**: []
    - No special skills needed — follows existing patterns in the same file

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/inngest/rule-extractor.ts:265-311` — The `post-awaiting-input` step that creates an `awaiting_input` rule for edit_diff. This is the EXACT pattern to replicate, minus the Slack posting (lifecycle already posts the solicitation)
  - `src/inngest/employee-lifecycle.ts:1550-1568` — The current rejection-without-reason block where the new code should be inserted (AFTER the solicitation is posted, BEFORE the metadata flag is set)
  - `src/inngest/employee-lifecycle.ts:1521-1548` — The metadata update pattern (`rejection_feedback_requested: true`) — the new rule creation should be near this code

  **API/Type References**:
  - PostgREST insert pattern: `POST ${supabaseUrl}/rest/v1/learned_rules` with `{ ...headers, Prefer: 'return=minimal' }` body
  - `learned_rules` table columns: `id` (UUID), `tenant_id`, `entity_type`, `entity_id`, `scope`, `rule_text`, `source`, `status`, `source_task_id`, `slack_ts`, `slack_channel`, `created_at` (auto)

  **WHY Each Reference Matters**:
  - The rule-extractor pattern shows exact JSON structure for the PostgREST insert
  - The lifecycle rejection block shows where to insert and what variables are available (`taskId`, `tenantId`, `archetypeId`, `approvalMsgTs`, `targetChannel`)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rejection without reason creates awaiting_input rule
    Tool: Bash (curl to PostgREST)
    Preconditions: A task exists in Reviewing state with a deliverable that has approval_message_ts
    Steps:
      1. Send rejection event via Inngest: curl -X POST http://localhost:8288/e/local -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"reject","userId":"U09T3SY6MJ6","userName":"Victor"}}'
      2. Wait 5 seconds for lifecycle to process
      3. Query learned_rules: curl -s "http://localhost:54331/rest/v1/learned_rules?source_task_id=eq.<TASK_ID>&status=eq.awaiting_input&select=id,rule_text,source,status,source_task_id" with service role headers
      4. Assert: at least 1 row returned with source='rejection', status='awaiting_input', rule_text=''
    Expected Result: A new learned_rules row with status='awaiting_input' and source='rejection' matching the task ID
    Failure Indicators: No rows returned, or row has wrong source/status
    Evidence: .sisyphus/evidence/task-1-rejection-awaiting-input.json

  Scenario: Rejection WITH reason does NOT create awaiting_input rule (regression check)
    Tool: Bash (curl to PostgREST)
    Preconditions: Same as above
    Steps:
      1. Send rejection event with reason: curl -X POST http://localhost:8288/e/local -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"reject","userId":"U09T3SY6MJ6","userName":"Victor","rejectionReason":"test reason"}}'
      2. Wait 5 seconds
      3. Query learned_rules for source_task_id=<TASK_ID> and status=awaiting_input
      4. Assert: NO awaiting_input rows for this task (rejection with reason goes through rule-extractor instead)
    Expected Result: No awaiting_input rule created — the with-reason path triggers rule.extract-requested instead
    Failure Indicators: An awaiting_input row exists for this task
    Evidence: .sisyphus/evidence/task-1-rejection-with-reason-no-awaiting.json
  ```

  **Evidence to Capture:**
  - [ ] task-1-rejection-awaiting-input.json — PostgREST query result showing the new rule
  - [ ] task-1-rejection-with-reason-no-awaiting.json — PostgREST query showing no regression

  **Commit**: YES (group T1)
  - Message: `fix(lifecycle): create awaiting_input rule on rejection without reason`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Add tenant filter to feedback query in lifecycle

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, line 252-253, add `&tenant_id=eq.${tenantId}` to the feedback query URL
  - Current: `${supabaseUrl}/rest/v1/feedback?created_at=gte.${thirtyDaysAgo}&select=correction_reason,feedback_type,created_at&order=created_at.desc&limit=10`
  - Fixed: `${supabaseUrl}/rest/v1/feedback?tenant_id=eq.${tenantId}&created_at=gte.${thirtyDaysAgo}&select=correction_reason,feedback_type,created_at&order=created_at.desc&limit=10`
  - The `tenantId` variable is already available in scope (passed to `dispatch-machine` step)

  **Must NOT do**:
  - Do NOT change the 30-day window
  - Do NOT change the limit (10)
  - Do NOT change the select columns or order

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line URL change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 6, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:303-307` — The `learned_rules` query directly below, which ALREADY has `tenant_id=eq.${tenantId}` — use this as the pattern
  - `src/inngest/employee-lifecycle.ts:252-253` — The exact line to modify

  **WHY Each Reference Matters**:
  - The learned_rules query at line 306 shows the correct PostgREST filter syntax and proves `tenantId` is in scope

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback query includes tenant filter
    Tool: Bash (grep)
    Steps:
      1. grep for the feedback query in employee-lifecycle.ts
      2. Assert the URL string contains 'tenant_id=eq.${tenantId}' or equivalent
    Expected Result: The query URL includes a tenant_id filter
    Failure Indicators: No tenant_id filter in the feedback query
    Evidence: .sisyphus/evidence/task-2-tenant-filter-grep.txt

  Scenario: Feedback from other tenants excluded
    Tool: Bash (curl)
    Preconditions: Feedback rows exist for both tenant 00000000-0000-0000-0000-000000000002 (DozalDevs) and 00000000-0000-0000-0000-000000000003 (VLRE)
    Steps:
      1. Query feedback for VLRE tenant only: curl "http://localhost:54331/rest/v1/feedback?tenant_id=eq.00000000-0000-0000-0000-000000000003&select=id,tenant_id&limit=5"
      2. Assert all returned rows have tenant_id = 00000000-0000-0000-0000-000000000003
      3. Verify no rows have tenant_id = 00000000-0000-0000-0000-000000000002
    Expected Result: Only VLRE feedback returned
    Failure Indicators: DozalDevs feedback rows appear
    Evidence: .sisyphus/evidence/task-2-tenant-scoped-feedback.json
  ```

  **Commit**: YES (group T2+T3)
  - Message: `fix(feedback): add tenant_id filter to feedback queries`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Add tenant filter to feedback query in summarizer

  **What to do**:
  - In `src/inngest/triggers/feedback-summarizer.ts`, line 67-68, add tenant filter to the feedback query
  - Current: `${supabaseUrl}/rest/v1/feedback?created_at=gte.${sevenDaysAgo}&select=id,correction_reason,feedback_type,created_at,task_id&limit=100`
  - Fixed: `${supabaseUrl}/rest/v1/feedback?tenant_id=eq.${archetype.tenant_id}&created_at=gte.${sevenDaysAgo}&select=id,correction_reason,feedback_type,created_at,task_id&limit=100`
  - The `archetype.tenant_id` is already available (the loop iterates over archetypes)
  - Remove the TODO comment on line 66: `// TODO(GM-19): feedback query lacks tenant_id and archetype_id filter — pre-existing bug, tracked separately`

  **Must NOT do**:
  - Do NOT change the 7-day window
  - Do NOT change the limit (100)
  - Do NOT modify the LLM summarization logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line URL change + comment removal
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/triggers/feedback-summarizer.ts:62-71` — The loop and feedback query to modify
  - `src/inngest/triggers/feedback-summarizer.ts:138-140` — The learned_rules query in the same file that ALREADY has proper tenant filter — use as pattern

  **WHY Each Reference Matters**:
  - The learned_rules query at line 139 demonstrates the correct `tenant_id=eq.${archetype.tenant_id}` syntax in this file's context

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Summarizer feedback query includes tenant filter
    Tool: Bash (grep)
    Steps:
      1. grep for the feedback query in feedback-summarizer.ts
      2. Assert the URL contains 'tenant_id=eq.' filter
      3. Assert the TODO(GM-19) comment is removed
    Expected Result: Query has tenant filter, TODO comment removed
    Failure Indicators: Missing tenant filter or TODO still present
    Evidence: .sisyphus/evidence/task-3-summarizer-tenant-filter.txt
  ```

  **Commit**: YES (group T2+T3)
  - Message: `fix(feedback): add tenant_id filter to feedback queries`
  - Files: `src/inngest/triggers/feedback-summarizer.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Clean up stale `awaiting_input` learned rules

  **What to do**:
  - Query all `awaiting_input` rules with empty `rule_text` that are older than 48 hours
  - Delete or expire them (set status to `expired` if the column supports it, otherwise delete via PostgREST)
  - Actually: the `learned_rules` table uses a string `status` column — valid values include 'awaiting_input', 'proposed', 'confirmed', 'rejected'. Set stale ones to `'rejected'` (closest semantic match — the input window has passed)
  - Execute via curl to PostgREST:
    ```bash
    curl -X PATCH "http://localhost:54331/rest/v1/learned_rules?status=eq.awaiting_input&rule_text=eq.&created_at=lt.{48_hours_ago}" \
      -H "apikey: ..." -H "Authorization: ..." -H "Content-Type: application/json" \
      -d '{"status": "rejected", "rule_text": "(expired — no reply received)"}'
    ```
  - Log which rules were updated for audit trail

  **Must NOT do**:
  - Do NOT delete rules — update status to `rejected` for audit trail
  - Do NOT touch rules with non-empty `rule_text` (those are legitimate)
  - Do NOT touch rules in `confirmed`, `proposed`, or `rejected` status

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single curl command — DB cleanup operation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **API/Type References**:
  - PostgREST PATCH syntax: `PATCH /rest/v1/learned_rules?{filters}` with body `{"status": "rejected"}`
  - Service role key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzY3OTM0MjgsImV4cCI6MjA5MjE1MzQyOH0.AV3qUQYBeohpMUMXSL4Tm9wJsXtL6MKfGqJJab3Gr4I`
  - PostgREST URL: `http://localhost:54331`

  **WHY Each Reference Matters**:
  - Need exact PostgREST URL and auth headers for the cleanup query

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stale awaiting_input rules cleaned up
    Tool: Bash (curl)
    Steps:
      1. Query current awaiting_input rules with empty rule_text: curl "http://localhost:54331/rest/v1/learned_rules?status=eq.awaiting_input&rule_text=eq.&select=id,status,rule_text,created_at"
      2. Assert: 0 rows returned (all stale ones were cleaned up)
    Expected Result: No more stale awaiting_input rules with empty rule_text
    Failure Indicators: Rows still exist with status=awaiting_input and empty rule_text older than 48 hours
    Evidence: .sisyphus/evidence/task-4-stale-rules-cleaned.json

  Scenario: Non-stale rules preserved
    Tool: Bash (curl)
    Steps:
      1. Query all learned_rules: curl "http://localhost:54331/rest/v1/learned_rules?select=id,status,rule_text&order=created_at.desc"
      2. Assert: The confirmed rule "always end in a friendly tone." still exists with status=confirmed
      3. Assert: The proposed rule "Always end on a friendly note" still exists with status=proposed
    Expected Result: Only stale awaiting_input rules were modified; all others preserved
    Failure Indicators: Confirmed or proposed rules were modified
    Evidence: .sisyphus/evidence/task-4-preserved-rules.json
  ```

  **Commit**: NO (DB operation only, no code changes)

- [x] 5. Tests for rejection-without-reason → reply → rule flow

  **What to do**:
  - Create or extend test file `tests/inngest/lifecycle-rejection-feedback.test.ts` with new test cases:
    1. **"rejection without reason creates awaiting_input learned_rule"** — mock the rejection flow, verify PostgREST POST to `learned_rules` includes `status: 'awaiting_input'`, `source: 'rejection'`, `rule_text: ''`, `source_task_id: taskId`
    2. **"rejection with reason does NOT create awaiting_input rule"** — verify the with-reason path does NOT insert into learned_rules (it fires `rule.extract-requested` event instead)
  - Also add/extend test in `tests/inngest/interaction-handler.test.ts` (create if doesn't exist): 3. **"thread reply matching awaiting_input rule from rejection captures feedback"** — mock the interaction-handler flow where `detect-awaiting-input-rule` finds a matching `awaiting_input` rule with `source: 'rejection'`, verify the rule is PATCHed with `rule_text: <user reply>` and `status: 'proposed'`
  - Follow existing test patterns in `tests/inngest/lifecycle-rejection-feedback.test.ts`

  **Must NOT do**:
  - Do NOT modify existing passing tests
  - Do NOT test the edit_diff path (already covered)
  - Do NOT use any model other than approved models in test mocks

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, needs to understand mocking patterns, moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-rejection-feedback.test.ts` — Existing rejection test file. Follow its mocking patterns (fetch mock, step mock, Inngest mock)
  - `tests/inngest/lifecycle-override.test.ts` — Another lifecycle test file with similar mocking structure

  **Test References**:
  - `tests/inngest/lifecycle-rejection-feedback.test.ts:describe("rejection feedback")` — Existing test structure. Add new `describe` block or extend existing one

  **WHY Each Reference Matters**:
  - The existing rejection test file establishes the mocking patterns (how to mock fetch for PostgREST, how to mock step.run, how to mock Inngest events)
  - The override test shows a more recent pattern that may be cleaner

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New rejection flow tests pass
    Tool: Bash (pnpm test)
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-rejection-feedback.test.ts
      2. Assert: All tests pass including new ones
      3. Run: pnpm test -- --run (full suite)
      4. Assert: No new failures beyond pre-existing ones
    Expected Result: All new tests pass, no regressions
    Failure Indicators: New test failures or regression in existing tests
    Evidence: .sisyphus/evidence/task-5-test-results.txt
  ```

  **Commit**: YES (group T5+T6)
  - Message: `test(feedback): add tests for rejection flow and tenant-scoped queries`
  - Files: `tests/inngest/lifecycle-rejection-feedback.test.ts`, `tests/inngest/interaction-handler.test.ts` (if created)
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Tests for tenant-scoped feedback queries

  **What to do**:
  - Add test case in the lifecycle test suite that verifies the feedback query URL includes `tenant_id` filter
  - Add test case in `tests/inngest/feedback-summarizer.test.ts` (create if doesn't exist) verifying the summarizer's feedback query includes `tenant_id` filter
  - These can be simple string assertion tests: mock fetch, capture the URL called, assert it contains `tenant_id=eq.`

  **Must NOT do**:
  - Do NOT duplicate existing test coverage
  - Do NOT test the full summarizer LLM flow — just the query URL

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple URL assertion tests
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-rejection-feedback.test.ts` — Fetch mocking pattern to capture URLs
  - Existing test files in `tests/inngest/` — General test structure

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tenant filter tests pass
    Tool: Bash (pnpm test)
    Steps:
      1. Run the relevant test files
      2. Assert all pass
    Expected Result: Tests verify tenant_id is included in feedback query URLs
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-6-tenant-filter-tests.txt
  ```

  **Commit**: YES (group T5+T6)

- [ ] 7. Manually trigger feedback-summarizer and verify knowledge_bases

  **What to do**:
  - Send an Inngest event to force-trigger the feedback-summarizer cron:
    ```bash
    curl -X POST http://localhost:8288/e/local \
      -H "Content-Type: application/json" \
      -d '{"name":"inngest/scheduled.timer","data":{"cron":"0 0 * * 0"}}'
    ```
    Or find the correct way to trigger the `trigger/feedback-summarizer` function via Inngest dev server
  - Actually, the simplest approach: use the Inngest dev server UI at `http://localhost:8288` to manually invoke the function, OR send a direct function invoke if supported
  - After trigger, wait 30 seconds, then verify:
    1. Check `knowledge_bases` table: `curl "http://localhost:54331/rest/v1/knowledge_bases?select=*"`
    2. Assert at least 1 row exists with `source_config->>'type' = 'feedback_summary'`
    3. Assert the themes array is non-empty
  - If the trigger fails, investigate the Inngest function logs at `http://localhost:8288`

  **Must NOT do**:
  - Do NOT modify the summarizer code (already fixed in Task 3)
  - Do NOT manually insert rows — the cron must do it

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires Inngest interaction, debugging if trigger doesn't work, verification queries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/inngest/triggers/feedback-summarizer.ts:31-34` — The function definition with cron trigger
  - Inngest dev server: `http://localhost:8288` — Function dashboard for monitoring

  **API/Type References**:
  - `knowledge_bases` table: `archetype_id`, `source_config` (JSONB with `type`, `period`, `themes[]`, `generated_at`, `feedback_count`)

  **WHY Each Reference Matters**:
  - Need to know the exact function ID to trigger it manually
  - Need to know the knowledge_bases schema to verify the output

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback summarizer populates knowledge_bases
    Tool: Bash (curl)
    Steps:
      1. Trigger the feedback-summarizer function via Inngest dev server
      2. Wait 30 seconds
      3. Query: curl "http://localhost:54331/rest/v1/knowledge_bases?select=id,archetype_id,source_config" with service headers
      4. Assert: at least 1 row exists
      5. Assert: source_config->type = 'feedback_summary'
      6. Assert: source_config->themes is a non-empty array
    Expected Result: knowledge_bases table has feedback summary entries with themes
    Failure Indicators: Empty table, or source_config missing themes
    Evidence: .sisyphus/evidence/task-7-knowledge-bases.json

  Scenario: Feedback summarizer fails gracefully with no feedback
    Tool: Bash (check Inngest logs)
    Steps:
      1. Check Inngest dev server at http://localhost:8288 for the function run
      2. Verify no errors in the function execution
    Expected Result: Function completes without errors
    Failure Indicators: Function shows error state in Inngest dashboard
    Evidence: .sisyphus/evidence/task-7-inngest-run.txt
  ```

  **Commit**: NO (verification only, no code changes)

- [ ] 8. End-to-end learning loop verification

  **What to do**:
  - This is a verification-only task. Verify the full learning loop works end-to-end:

  **Step A: Verify FEEDBACK_CONTEXT injection**
  1. Query the `feedback` table for VLRE tenant: verify entries exist with `tenant_id=eq.00000000-0000-0000-0000-000000000003`
  2. Verify the feedback query in the lifecycle code now includes `tenant_id` filter (code review)

  **Step B: Verify LEARNED_RULES_CONTEXT injection**
  1. Query `learned_rules` for confirmed rules: `curl "http://localhost:54331/rest/v1/learned_rules?status=eq.confirmed&tenant_id=eq.00000000-0000-0000-0000-000000000003&select=id,rule_text"`
  2. Verify at least 1 confirmed rule exists ("always end in a friendly tone.")
  3. Verify the lifecycle code loads these rules and formats them as `## Learned Behaviors — follow these rules`

  **Step C: Verify knowledge_bases populated**
  1. Query `knowledge_bases`: verify at least 1 entry from Task 7

  **Step D: Verify stale rules cleaned**
  1. Query `learned_rules?status=eq.awaiting_input&rule_text=eq.` — verify 0 rows

  **Step E: Verify rejection-without-reason flow end-to-end**
  1. Check that Task 1's code creates an `awaiting_input` rule
  2. Check that the interaction-handler's `detect-awaiting-input-rule` would find it
  3. Trace the flow: rejection → awaiting_input rule created → user replies → interaction-handler finds rule → PATCHes to proposed → Slack posts rule review card → user confirms → status=confirmed → next session includes rule in LEARNED_RULES_CONTEXT
  4. Verify all steps have working code paths (code review, not execution)

  **Step F: Build and test verification**
  1. Run `pnpm build` — assert success
  2. Run `pnpm test -- --run` — assert no new failures
  3. Run `pnpm lint` — assert only pre-existing errors

  **Must NOT do**:
  - Do NOT make code changes — this is verification only
  - Do NOT trigger real Hostfully webhooks — this is code path verification

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires reading multiple files, tracing code paths, running multiple verification commands
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — after all implementation)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1-7

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:243-343` — FEEDBACK_CONTEXT and LEARNED_RULES_CONTEXT injection
  - `src/workers/opencode-harness.mts:497-508` — How contexts are appended to system prompt
  - `src/inngest/interaction-handler.ts:65-202` — The awaiting_input detection and capture flow
  - `src/inngest/rule-extractor.ts:159-179` — How proposed rules are stored

  **WHY Each Reference Matters**:
  - Each reference is a node in the learning loop chain that must be verified working

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build and test pass
    Tool: Bash
    Steps:
      1. pnpm build — assert exit code 0
      2. pnpm test -- --run — assert exit code 0 (or only pre-existing failures)
      3. pnpm lint — assert only pre-existing errors
    Expected Result: Clean build, all tests pass
    Failure Indicators: Build failures, new test failures, new lint errors
    Evidence: .sisyphus/evidence/task-8-build-test-lint.txt

  Scenario: Learning loop data verification
    Tool: Bash (curl to PostgREST)
    Steps:
      1. Query feedback: curl "http://localhost:54331/rest/v1/feedback?tenant_id=eq.00000000-0000-0000-0000-000000000003&select=id,feedback_type,correction_reason&order=created_at.desc&limit=5"
      2. Assert: entries exist, all have VLRE tenant_id
      3. Query learned_rules: curl "http://localhost:54331/rest/v1/learned_rules?tenant_id=eq.00000000-0000-0000-0000-000000000003&select=id,status,rule_text,source&order=created_at.desc"
      4. Assert: at least 1 confirmed rule exists
      5. Assert: 0 stale awaiting_input rules with empty rule_text
      6. Query knowledge_bases: curl "http://localhost:54331/rest/v1/knowledge_bases?select=id,archetype_id,source_config"
      7. Assert: at least 1 entry exists
    Expected Result: All three data stores have correct, tenant-scoped data
    Failure Indicators: Missing data, cross-tenant bleed, stale rules remaining
    Evidence: .sisyphus/evidence/task-8-learning-loop-data.json

  Scenario: Code path trace — rejection without reason creates rule that gets captured
    Tool: Bash (grep + read)
    Steps:
      1. Read lifecycle rejection-without-reason block — verify it creates an awaiting_input learned_rule
      2. Read interaction-handler detect-awaiting-input-rule — verify it queries by source_task_id
      3. Read interaction-handler capture-awaiting-input-reply — verify it PATCHes to proposed
      4. Verify the three steps form a connected chain (same table, same columns, same source_task_id)
    Expected Result: Code path from rejection → awaiting_input → capture → proposed is complete
    Failure Indicators: Any gap in the chain (wrong column name, missing query filter)
    Evidence: .sisyphus/evidence/task-8-code-trace.txt
  ```

  **Commit**: NO (verification only)

- [ ] 9. **Notify completion** — Send Telegram notification: plan `feedback-pipeline-fix` complete, all tasks done, come back to review results.
  ```bash
  tsx scripts/telegram-notify.ts "✅ feedback-pipeline-fix complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore` (new ones only), empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group | Message                                                                  | Files                                                                              | Pre-commit           |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------- |
| T1    | `fix(lifecycle): create awaiting_input rule on rejection without reason` | `src/inngest/employee-lifecycle.ts`                                                | `pnpm test -- --run` |
| T2+T3 | `fix(feedback): add tenant_id filter to feedback queries`                | `src/inngest/employee-lifecycle.ts`, `src/inngest/triggers/feedback-summarizer.ts` | `pnpm test -- --run` |
| T4    | `chore(db): clean up stale awaiting_input learned rules`                 | n/a (DB operation only)                                                            | n/a                  |
| T5+T6 | `test(feedback): add tests for rejection flow and tenant-scoped queries` | `tests/inngest/...`                                                                | `pnpm test -- --run` |
| T7    | n/a (verification only)                                                  | n/a                                                                                | n/a                  |
| T8    | n/a (E2E verification only)                                              | n/a                                                                                | n/a                  |

---

## Success Criteria

### Verification Commands

```bash
pnpm build        # Expected: success
pnpm test -- --run # Expected: 515+ passing (no new failures)
pnpm lint         # Expected: only pre-existing errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (no regressions)
- [ ] Build succeeds
- [ ] knowledge_bases table has entries
- [ ] Stale awaiting_input rules cleaned up
- [ ] E2E learning loop verified
