# Guest-Messaging Echo Loop Fix

## TL;DR

> **Quick Summary**: Fix the Hostfully webhook echo loop that creates ghost tasks when the AI's own outgoing replies trigger new `NEW_INBOX_MESSAGE` webhooks, fix the "Daily Summary" format appearing on NO_ACTION_NEEDED notifications, and bulk-clean ~100+ stuck ghost tasks.
>
> **Deliverables**:
>
> - Thread-level dedup in Hostfully webhook handler
> - Updated guest-messaging archetype instructions for NO_ACTION_NEEDED path
> - Bulk cleanup of stuck ghost tasks
> - Tests for all fixes
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: T1 (thread dedup) → T4 (build+restart) → T5 (E2E verify) → F1-F4

---

## Context

### Original Request

User reported three issues during live guest-messaging employee testing:

1. A second guest-messaging task (`8fdf3f37`) was triggered at 4:39 PM after the first task was already approved and the reply sent
2. The second task's approval card showed "Daily Summary" format instead of guest-messaging format
3. Two stuck Inngest runs in the dashboard

### Interview Summary

**Key Discussions**:

- Webhook echo loop: Hostfully fires `NEW_INBOX_MESSAGE` for the AI's own outgoing replies, each with a unique `message_uid`, bypassing the existing per-message dedup
- "Daily Summary" format: `post-message.ts` hardcodes Papi Chulo format (`block_id: 'papi-chulo-daily-summary'`, header "Daily Summary — {date}") when `--task-id` is passed — the guest-messaging archetype instructions tell the worker to use `--task-id` for NO_ACTION notifications
- Stuck tasks: Task `8fdf3f37` is correctly in the NO_ACTION_NEEDED 24h wait loop but the Slack card has wrong buttons (Approve/Reject instead of Reply Anyway)
- ~100+ ghost tasks accumulated from previous echo loops

**Research Findings**:

- `src/gateway/routes/hostfully.ts` has dedup by `message_uid` only (line 89: `external_id: hostfully-msg-${message_uid}`). No thread-level dedup.
- `raw_event` column stores `{ thread_uid, message_uid, lead_uid, property_uid }` as JSONB — can be queried for thread-level dedup
- `parseClassifyResponse()` correctly handles `NO_ACTION_NEEDED:` prefix strings (classify-message.ts:27-38)
- Harness only throws if BOTH `/tmp/summary.txt` and `/tmp/approval-message.json` are missing (harness lines 343-347). If only summary.txt exists, it succeeds.
- Guest-messaging archetype `notification_channel`: `C0AMGJQN05S`
- Deliverable for task 8fdf3f37: `content: "NO_ACTION_NEEDED: Thread already responded to..."`, `metadata: { ts, channel: "C0AMGJQN05S", approval_message_ts }`

### Metis Review (Self-Conducted)

**Identified Gaps** (addressed):

- Thread-level dedup must NOT block re-triggers after terminal states (Done/Failed/Cancelled) — addressed in dedup query
- NO_ACTION notification without `--task-id` means no `/tmp/approval-message.json` — harness handles this (only throws if BOTH files missing)
- Lifecycle's NO_ACTION timeout handler (line 647) checks `approval_message_ts` — if missing, it just skips card update (correct behavior)
- Race condition on simultaneous webhooks for same thread — use Prisma `findFirst` with catch on P2002 as fallback
- Bulk cleanup must scope to guest-messaging tasks only

---

## Work Objectives

### Core Objective

Prevent the Hostfully webhook echo loop from creating ghost tasks, fix the wrong Slack card format for NO_ACTION_NEEDED notifications, and clean up accumulated stuck tasks.

### Concrete Deliverables

- Modified `src/gateway/routes/hostfully.ts` with thread-level dedup
- Updated guest-messaging archetype instructions in DB (seed file + live DB)
- Test for thread-level dedup
- ~100+ stuck tasks bulk-cancelled
- Clean Inngest run state

### Definition of Done

- [ ] Sending a reply via guest-messaging does NOT trigger a new ghost task
- [ ] NO_ACTION_NEEDED notifications appear as plain text (no "Daily Summary" header, no approval buttons)
- [ ] All stuck ghost tasks are in Cancelled state
- [ ] `pnpm build` passes
- [ ] Existing tests pass (`pnpm test -- --run`)

### Must Have

- Thread-level dedup in webhook handler — query for active task on same thread_uid before creating
- Updated archetype instructions — NO_ACTION path must NOT use `--task-id` with `post-message.ts`
- Bulk cleanup of stuck ghost tasks

### Must NOT Have (Guardrails)

- DO NOT modify `post-message.ts` or any shell tools under `src/worker-tools/`
- DO NOT modify `createTaskAndDispatch` (shared infrastructure)
- DO NOT change the NEEDS_APPROVAL path in archetype instructions (only the NO_ACTION_NEEDED path)
- DO NOT add rate-limiting or throttling logic
- DO NOT fix the SIGTERM race condition (task showing Failed despite successful delivery) — separate issue
- DO NOT add Hostfully API calls to the webhook handler (no sender-type checking)
- DO NOT modify the lifecycle's NO_ACTION_NEEDED classification logic
- DO NOT touch summarizer archetype or its notification paths

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (add test for thread-level dedup)
- **Framework**: vitest
- **No TDD**: Tests written after implementation

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Webhook**: Use Bash (curl) — Send webhook requests, assert responses
- **DB State**: Use Bash (curl to PostgREST) — Query task states, verify cleanup
- **Build**: Use Bash — `pnpm build`, `pnpm test -- --run`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Thread-level dedup in webhook handler [quick]
├── Task 2: Update archetype instructions for NO_ACTION path [quick]
├── Task 3: Add test for thread-level dedup [quick]

Wave 2 (After Wave 1 — build, verify, cleanup):
├── Task 4: Build, restart gateway, run tests [quick]
├── Task 5: E2E verification with live webhook [unspecified-high]
├── Task 6: Bulk cleanup of stuck ghost tasks [quick]
├── Task 7: Telegram notification [quick]

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
| T1    | —          | T4, T5 | 1     |
| T2    | —          | T4, T5 | 1     |
| T3    | —          | T4     | 1     |
| T4    | T1, T2, T3 | T5, T6 | 2     |
| T5    | T4         | T7     | 2     |
| T6    | T4         | T7     | 2     |
| T7    | T5, T6     | F1-F4  | 2     |
| F1-F4 | T7         | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 4 tasks — T4 `quick`, T5 `unspecified-high`, T6 `quick`, T7 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Add thread-level dedup to Hostfully webhook handler

  **What to do**:
  - In `src/gateway/routes/hostfully.ts`, after tenant and archetype lookup (line 82) but BEFORE `prisma.task.create` (line 86), add a query to check for active tasks on the same `thread_uid`
  - Query: `prisma.task.findFirst()` where `tenant_id` matches, `archetype_id` matches the guest-messaging archetype, `status` is NOT in terminal states (`Done`, `Failed`, `Cancelled`), and `raw_event` path `thread_uid` matches `payload.thread_uid`
  - Prisma JSONB filter syntax: `raw_event: { path: ['thread_uid'], equals: payload.thread_uid }`
  - If an active task exists, return early: `res.json({ ok: true, active_task_exists: true, existing_task_id: activeTask.id })`
  - Log: `logger.info({ thread_uid: payload.thread_uid, existingTaskId: activeTask.id }, 'Active task already exists for thread — skipping duplicate')`
  - Guard: Only apply this check when `payload.thread_uid` is truthy (webhooks without thread_uid should proceed normally)

  **Must NOT do**:
  - DO NOT modify `createTaskAndDispatch`
  - DO NOT add Hostfully API calls
  - DO NOT change the existing `message_uid` dedup (P2002 catch) — the thread-level dedup is an additional layer
  - DO NOT use raw SQL — use Prisma's JSONB filtering

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file modification, clear implementation, <30 lines of code
  - **Skills**: []
    - No special skills needed — straightforward Prisma query addition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/hostfully.ts:49-62` — Existing tenant lookup pattern using Prisma
  - `src/gateway/routes/hostfully.ts:84-112` — Existing task creation with P2002 dedup catch — insert new code BEFORE this block
  - `src/gateway/routes/hostfully.ts:93-98` — How `raw_event` is structured: `{ thread_uid, message_uid, lead_uid, property_uid }`

  **API/Type References**:
  - `prisma/schema.prisma:20-54` — Task model: `raw_event Json?`, `status String`, `tenant_id String`, `archetype_id String?`
  - `prisma/schema.prisma:52` — Unique constraint: `@@unique([external_id, source_system, tenant_id])` — this is the existing message-level dedup, NOT what we're adding

  **Test References**:
  - `tests/gateway/routes/hostfully.test.ts` — Existing Hostfully webhook handler tests (if this file exists; if not, create it alongside Task 3)

  **WHY Each Reference Matters**:
  - `hostfully.ts:49-62`: Follow same Prisma query pattern for consistency
  - `hostfully.ts:84-112`: This is the insertion point — new dedup check goes immediately before `prisma.task.create`
  - `hostfully.ts:93-98`: Shows exact structure of `raw_event` to know how to query `thread_uid`
  - `schema.prisma:20-54`: Confirms `raw_event` is `Json?` type and `status` is freeform string

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Echo-loop webhook returns active_task_exists
    Tool: Bash (curl)
    Preconditions: Gateway running on port 7700, DB has at least one non-terminal guest-messaging task for thread_uid 2f18249a-9523-4acd-a512-20ff06d5c3fa
    Steps:
      1. Send POST to http://localhost:7700/webhooks/hostfully with body:
         {"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"echo-test-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}
      2. Assert response status is 200
      3. Assert response body contains `"active_task_exists":true`
      4. Query tasks table: curl "http://localhost:54331/rest/v1/tasks?external_id=eq.hostfully-msg-echo-test-001&select=id" — assert empty array (no task created)
    Expected Result: 200 with `{ ok: true, active_task_exists: true, existing_task_id: "<uuid>" }`, no new task row
    Failure Indicators: Response has `task_id` field (task was created), or 500 error
    Evidence: .sisyphus/evidence/task-1-echo-dedup.txt

  Scenario: First webhook for new thread creates task normally
    Tool: Bash (curl)
    Preconditions: Gateway running, no active tasks for thread_uid "fresh-thread-test-001"
    Steps:
      1. Send POST to http://localhost:7700/webhooks/hostfully with body:
         {"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"fresh-msg-001","thread_uid":"fresh-thread-test-001","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}
      2. Assert response status is 200
      3. Assert response body contains `"task_id"` (task was created)
    Expected Result: 200 with `{ ok: true, task_id: "<uuid>" }`
    Failure Indicators: Response has `active_task_exists` (dedup triggered incorrectly)
    Evidence: .sisyphus/evidence/task-1-fresh-thread.txt

  Scenario: Webhook for thread with only terminal tasks creates task normally
    Tool: Bash (curl)
    Preconditions: All tasks for thread_uid 2f18249a-... are in terminal states (Done/Failed/Cancelled)
    Steps:
      1. Bulk-update all tasks for that thread to 'Cancelled' first (via PostgREST PATCH)
      2. Send POST to http://localhost:7700/webhooks/hostfully with same thread_uid but new message_uid "post-terminal-msg-001"
      3. Assert response body contains `"task_id"` (new task created)
    Expected Result: 200 with task_id — dedup does NOT block when all existing tasks are terminal
    Failure Indicators: Response has `active_task_exists`
    Evidence: .sisyphus/evidence/task-1-terminal-passthrough.txt
  ```

  **Commit**: YES (groups with T3)
  - Message: `fix(gateway): add thread-level dedup to Hostfully webhook handler`
  - Files: `src/gateway/routes/hostfully.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Update guest-messaging archetype instructions for NO_ACTION_NEEDED path

  **What to do**:
  - Update the guest-messaging archetype instructions in `prisma/seed.ts` (archetype ID `00000000-0000-0000-0000-000000000015`)
  - Find the NO_ACTION_NEEDED instructions in STEP 1 — currently says:
    ```
    Then post a brief notification so the PM knows this task was processed:
    NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "ℹ️ Guest message task processed — no unresponded messages found. No action needed." --task-id "$TASK_ID" > /tmp/approval-message.json
    Both /tmp/summary.txt and /tmp/approval-message.json MUST exist before stopping.
    ```
  - Change to:
    ```
    Then post a brief notification so the PM knows this task was processed:
    NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "ℹ️ Guest message task processed — no unresponded messages found. No action needed. Task $TASK_ID"
    /tmp/summary.txt MUST exist before stopping. Do NOT write /tmp/approval-message.json for NO_ACTION_NEEDED cases.
    ```
  - Key changes: (1) Remove `--task-id "$TASK_ID"` to avoid approval buttons, (2) Remove `> /tmp/approval-message.json` redirect, (3) Update the "MUST exist" line to only require summary.txt, (4) Add task ID to the text itself for traceability
  - ALSO update the live DB record for immediate effect — run a SQL UPDATE or PostgREST PATCH on the archetype's `instructions` field
  - The seed file change ensures this persists across DB resets

  **Must NOT do**:
  - DO NOT modify `post-message.ts` — archetype instructions only
  - DO NOT change the NEEDS_APPROVAL path (STEP 3+) — only the NO_ACTION_NEEDED early exit in STEP 1
  - DO NOT change the system_prompt — only instructions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text change in seed file + DB update, no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Find the archetype with ID `00000000-0000-0000-0000-000000000015`, locate its `instructions` field

  **API/Type References**:
  - `src/workers/opencode-harness.mts:343-347` — Harness output file check: only throws if BOTH `/tmp/summary.txt` and `/tmp/approval-message.json` are missing. Confirms that removing the approval-message.json output for NO_ACTION is safe.
  - `src/workers/opencode-harness.mts:225-257` — `checkOutputFiles()` function: reads summary.txt first, then tries approval-message.json. If only summary.txt exists, `content` will have the NO_ACTION text and `extraMetadata` will be empty — this is fine.

  **WHY Each Reference Matters**:
  - `seed.ts`: This is where the archetype instructions live — the exact text the worker receives
  - `harness.mts:343-347`: Validates our assumption that removing approval-message.json output won't break the harness
  - `harness.mts:225-257`: Shows the exact code path when only summary.txt exists — confirms it returns `{ content: "NO_ACTION...", metadata: {} }` successfully

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed file has updated NO_ACTION instructions
    Tool: Bash (grep)
    Preconditions: Task 2 completed
    Steps:
      1. Search prisma/seed.ts for the string "--task-id" in the NO_ACTION_NEEDED section of the guest-messaging archetype
      2. Assert it does NOT contain `--task-id "$TASK_ID" > /tmp/approval-message.json` in the NO_ACTION path
      3. Assert it DOES contain `--task-id "$TASK_ID"` in the NEEDS_APPROVAL path (STEP 4/5 — unchanged)
      4. Assert it contains "Do NOT write /tmp/approval-message.json for NO_ACTION_NEEDED" or equivalent
    Expected Result: NO_ACTION path has no --task-id, NEEDS_APPROVAL path still has --task-id
    Failure Indicators: --task-id still present in NO_ACTION path, or removed from NEEDS_APPROVAL path
    Evidence: .sisyphus/evidence/task-2-seed-instructions.txt

  Scenario: Live DB archetype instructions updated
    Tool: Bash (curl to PostgREST)
    Preconditions: Task 2 completed, DB updated
    Steps:
      1. curl "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions"
      2. Assert instructions do NOT contain `--task-id "$TASK_ID" > /tmp/approval-message.json` in the NO_ACTION section
    Expected Result: Live DB instructions match seed file
    Failure Indicators: Live DB still has old instructions
    Evidence: .sisyphus/evidence/task-2-live-db-instructions.txt
  ```

  **Commit**: YES
  - Message: `fix(seed): update guest-messaging instructions for NO_ACTION notification`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Add test for thread-level dedup in webhook handler

  **What to do**:
  - Add test cases to `tests/gateway/routes/hostfully.test.ts` (create file if it doesn't exist)
  - Test 1: "skips task creation when active task exists for same thread_uid" — mock Prisma `findFirst` to return an existing task, send webhook, assert response has `active_task_exists: true` and `prisma.task.create` was NOT called
  - Test 2: "creates task when no active task for thread_uid" — mock Prisma `findFirst` to return null, send webhook, assert `prisma.task.create` was called
  - Test 3: "creates task when all existing tasks are terminal" — mock `findFirst` to return null (because query filters out terminal statuses), assert task created
  - Test 4: "creates task when thread_uid is missing from webhook" — send webhook without `thread_uid`, assert dedup check is skipped and task is created normally
  - Follow existing test patterns in the codebase

  **Must NOT do**:
  - DO NOT modify the handler code (that's Task 1)
  - DO NOT test the lifecycle or classification logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test file creation with clear test cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/gateway/routes/` — Check for existing route test files to follow patterns (e.g., mock setup, Prisma mocking)
  - `tests/inngest/` — Examples of Prisma mocking patterns in tests

  **API/Type References**:
  - `src/gateway/routes/hostfully.ts:16-19` — `HostfullyRouteOptions` interface: `{ inngestClient?, prisma? }` — tests can inject mock Prisma
  - `src/gateway/routes/hostfully.ts:21` — Route handler signature for supertest

  **WHY Each Reference Matters**:
  - `HostfullyRouteOptions`: Tests can inject a mock PrismaClient to control `findFirst` and `task.create` behavior
  - Existing test patterns: Follow the same mock/spy setup conventions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Thread dedup tests pass
    Tool: Bash
    Preconditions: Task 1 (handler code) and Task 3 (tests) both complete
    Steps:
      1. Run: pnpm test -- --run tests/gateway/routes/hostfully.test.ts
      2. Assert all tests pass (0 failures)
      3. Assert at least 4 test cases ran
    Expected Result: All 4+ tests pass
    Failure Indicators: Any test failure or fewer than 4 tests
    Evidence: .sisyphus/evidence/task-3-test-results.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: `fix(gateway): add thread-level dedup to Hostfully webhook handler`
  - Files: `tests/gateway/routes/hostfully.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/routes/hostfully.test.ts`

- [x] 4. Build, restart gateway, and run full test suite

  **What to do**:
  - Run `pnpm build` — assert no errors
  - Run `pnpm test -- --run` — assert all tests pass (including new thread-dedup test)
  - Restart the gateway process to pick up new code: kill the existing gateway process (check `lsof -i :7700`), then start it fresh
  - Verify gateway is responsive: `curl http://localhost:7700/health`

  **Must NOT do**:
  - DO NOT modify any code — this is a build+verify task only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Build and restart commands only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential gate)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - Previous Phase 1 Task 5 used `lsof -i :7700` to find gateway PID and `kill` + restart

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Clean build with no errors
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: Tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0 and no test failures
    Expected Result: All tests pass (515+)
    Evidence: .sisyphus/evidence/task-4-tests.txt

  Scenario: Gateway responds after restart
    Tool: Bash
    Steps:
      1. curl http://localhost:7700/health
      2. Assert 200 response
    Expected Result: Gateway healthy
    Evidence: .sisyphus/evidence/task-4-health.txt
  ```

  **Commit**: NO (build-only task)

- [x] 5. E2E verification — send echo webhook and verify dedup

  **What to do**:
  - Verify the thread-level dedup works against the live running gateway
  - First, confirm there's at least one active (non-terminal) guest-messaging task for thread_uid `2f18249a-9523-4acd-a512-20ff06d5c3fa` (there should be — task `8fdf3f37` is in Submitting)
  - Send an echo-simulating webhook: `curl -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"e2e-echo-verify-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'`
  - Assert response: `{ "ok": true, "active_task_exists": true, "existing_task_id": "..." }`
  - Verify no new task was created: query PostgREST for `external_id=eq.hostfully-msg-e2e-echo-verify-001`

  **Must NOT do**:
  - DO NOT modify any code
  - DO NOT trigger a task that would actually run a worker

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E verification requiring careful DB state checking
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - Phase 1 Task 6 evidence pattern — `curl` + PostgREST queries for verification

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Echo webhook is blocked by thread-level dedup
    Tool: Bash (curl)
    Preconditions: Gateway running with new code, task 8fdf3f37 still in Submitting for thread 2f18249a-...
    Steps:
      1. Verify active task exists: curl "http://localhost:54331/rest/v1/tasks?raw_event->>thread_uid=eq.2f18249a-9523-4acd-a512-20ff06d5c3fa&status=neq.Done&status=neq.Failed&status=neq.Cancelled&select=id,status&limit=1" with service role key
      2. Send echo webhook with unique message_uid "e2e-echo-verify-001"
      3. Assert response contains "active_task_exists":true
      4. Query tasks: curl "http://localhost:54331/rest/v1/tasks?external_id=eq.hostfully-msg-e2e-echo-verify-001&select=id" — assert empty array
    Expected Result: Webhook returns active_task_exists, no new task created
    Failure Indicators: Response has task_id, or new task found in DB
    Evidence: .sisyphus/evidence/task-5-e2e-echo-blocked.txt
  ```

  **Commit**: NO (verification only)

- [x] 6. Bulk cleanup of stuck ghost tasks

  **What to do**:
  - Query PostgREST for all guest-messaging tasks that are stuck in non-terminal states (Submitting, Reviewing, Executing, etc.) — filter by `archetype_id=eq.00000000-0000-0000-0000-000000000015` and `status` NOT in (Done, Failed, Cancelled)
  - Count them first to confirm the scope (~100+ expected)
  - PATCH all of them to `status: 'Cancelled'` with `failure_reason: 'Bulk cancelled — echo-loop ghost tasks'`
  - Verify the count of Cancelled tasks matches
  - NOTE: Do NOT cancel task `8fdf3f37` separately — it should be included in the bulk cancel. After the echo-loop fix, these tasks are all ghosts.
  - For the stuck Inngest runs: they will time out naturally (24h timeout on waitForEvent). Cancelling the tasks in DB is sufficient — the Inngest runs will check task status and exit gracefully.

  **Must NOT do**:
  - DO NOT cancel tasks from other archetypes (summarizer, etc.)
  - DO NOT cancel tasks in terminal states (they're already done)
  - DO NOT try to cancel Inngest runs directly via API — let them timeout naturally

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: PostgREST PATCH operations only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:

  **API/Type References**:
  - PostgREST PATCH syntax: `PATCH /rest/v1/tasks?archetype_id=eq.UUID&status=not.in.(Done,Failed,Cancelled)` with body `{ "status": "Cancelled", "failure_reason": "..." }`
  - Service role key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzY3OTM0MjgsImV4cCI6MjA5MjE1MzQyOH0.AV3qUQYBeohpMUMXSL4Tm9wJsXtL6MKfGqJJab3Gr4I`
  - PostgREST URL: `http://localhost:54331/rest/v1`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All ghost tasks cancelled
    Tool: Bash (curl)
    Preconditions: Task 6 completed
    Steps:
      1. Count guest-messaging tasks NOT in terminal states: curl "http://localhost:54331/rest/v1/tasks?archetype_id=eq.00000000-0000-0000-0000-000000000015&status=not.in.(Done,Failed,Cancelled)&select=id" — assert empty array
      2. Count guest-messaging tasks in Cancelled state with echo-loop failure_reason: curl query with failure_reason filter — assert count > 0
    Expected Result: Zero non-terminal guest-messaging ghost tasks remain
    Failure Indicators: Any tasks still in Submitting/Reviewing/Executing
    Evidence: .sisyphus/evidence/task-6-bulk-cleanup.txt

  Scenario: Non-guest-messaging tasks unaffected
    Tool: Bash (curl)
    Preconditions: Task 6 completed
    Steps:
      1. Count summarizer tasks (archetype_id=00000000-0000-0000-0000-000000000012 or 00000000-0000-0000-0000-000000000013) with failure_reason containing "echo-loop"
      2. Assert count is 0
    Expected Result: No summarizer tasks were affected by bulk cancel
    Evidence: .sisyphus/evidence/task-6-scope-check.txt
  ```

  **Commit**: NO (DB-only operation, no code changes)

- [x] 7. Send Telegram notification

  **What to do**:
  - Send notification that the plan is complete:
    ```bash
    tsx scripts/telegram-notify.ts "✅ guest-messaging-echo-loop-fix complete — All tasks done. Come back to review results."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (last task before FINAL)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 6

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ guest-messaging-echo-loop-fix complete — All tasks done."
      2. Assert exit code 0
    Expected Result: Notification delivered
    Evidence: .sisyphus/evidence/task-7-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task  | Commit Message                                                              | Files                                                                       | Pre-commit Check |
| ----- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------- |
| T1+T3 | `fix(gateway): add thread-level dedup to Hostfully webhook handler`         | `src/gateway/routes/hostfully.ts`, `tests/gateway/routes/hostfully.test.ts` | `pnpm build`     |
| T2    | `fix(seed): update guest-messaging instructions for NO_ACTION notification` | `prisma/seed.ts`                                                            | `pnpm build`     |
| T6    | `chore(db): bulk-cancel stuck ghost guest-messaging tasks`                  | — (DB-only)                                                                 | —                |

---

## Success Criteria

### Verification Commands

```bash
pnpm build           # Expected: no errors
pnpm test -- --run   # Expected: all tests pass (including new thread-dedup test)
```

### Final Checklist

- [ ] Thread-level dedup prevents echo-loop ghost tasks
- [ ] NO_ACTION_NEEDED notification is plain text without approval buttons
- [ ] ~100+ stuck ghost tasks cancelled
- [ ] All "Must NOT Have" guardrails respected
- [ ] Build and tests pass
