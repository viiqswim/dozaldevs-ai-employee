# Supersede Slack Threading — Reuse Thread on Guest Follow-Up

## TL;DR

> **Quick Summary**: When a guest sends a follow-up message while a previous AI reply is pending approval, the old task is superseded and the new task reuses the same Slack thread — updating the parent message in-place and posting the new approval card with `reply_broadcast` so PMs see it at the channel level.
>
> **Deliverables**:
>
> - Prisma migration adding `metadata Json?` to tasks table
> - Parent message ts persisted to DB after `notify-received`
> - Webhook handler passes old parent ts to new task on supersede
> - Lifecycle detects supersede and reuses old Slack thread via `chat.update`
> - `post-guest-approval.ts` supports `--reply-broadcast` flag
> - Tests + E2E verification
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (migration) → T4 (webhook metadata lookup) → T5 (lifecycle supersede detection) → T7 (E2E)

---

## Context

### Original Request

The guest-messaging employee creates a new top-level Slack message for every task. When a guest sends a follow-up message while a previous reply is pending approval, this creates disconnected message chains — the old approval card sits orphaned while a new message appears elsewhere in the channel. PMs must mentally connect these and risk acting on stale approval cards.

### Interview Summary

**Key Discussions**:

- Three UX options considered: (A) new top-level always, (B) same thread with `reply_broadcast`, (C) same thread silent
- User chose **Option B**: one Slack thread per guest conversation, `reply_broadcast` surfaces new approval card at channel level, old card marked "Superseded"

**Research Findings**:

- `notifyMsgRef.ts` (parent message Slack timestamp) lives ONLY in Inngest step memoization — not persisted to DB, inaccessible across task lifecycle runs
- `tasks` table has NO `metadata` column, but lifecycle code already PATCHes `metadata` on tasks at 4 callsites (lines 884, 898-905, 1544-1565, 1661-1682) — all are silent no-ops because PostgREST ignores unknown columns
- Existing `check-supersede` step already handles approval card supersede + fires events to old lifecycle
- `notify-received` runs BEFORE `check-supersede` — too late for lifecycle-only thread discovery
- `post-guest-approval.ts` supports `--thread-ts` but has no `reply_broadcast` support
- Supersede logic in `hostfully.ts` (webhook handler) already cancels old tasks and creates new ones

### Metis Review

**Identified Gaps** (addressed):

- **Race condition**: If second webhook arrives before first task's `notify-received` writes metadata, lookup returns null → graceful fallback to new top-level message (documented, logged, acceptable)
- **Thread ownership conflict**: Old lifecycle's `handle-approval-result` may briefly update parent to "Superseded" before new lifecycle overwrites with current state — momentary flash, acceptable given alternative complexity
- **Empty string guard**: `--thread-ts ""` must be treated as absent in `post-guest-approval.ts`
- **Scope creep risks**: Do NOT modify `check-supersede`, `buildSupersededBlocks()`, `pending_approvals` schema, or `notifyMsgRef` closure flow

---

## Work Objectives

### Core Objective

Enable superseded guest-messaging tasks to reuse the old task's Slack thread, keeping one message chain per guest conversation with `reply_broadcast` visibility.

### Concrete Deliverables

- `prisma/migrations/YYYYMMDDHHMMSS_add_tasks_metadata/migration.sql` — adds `metadata` JSONB column to tasks
- `src/inngest/employee-lifecycle.ts` — `notify-received` step writes `notify_slack_ts` to tasks.metadata; detects supersede and uses `chat.update`
- `src/gateway/routes/hostfully.ts` — supersede block reads old task's metadata, passes to new task
- `src/worker-tools/slack/post-guest-approval.ts` — `--reply-broadcast` flag support
- Tests covering supersede thread reuse, fallback, and empty-string guard

### Definition of Done

- [ ] `SELECT metadata FROM tasks` returns JSON with `notify_slack_ts` after a guest-messaging task's notify-received step
- [ ] Superseded task's Slack thread contains both old (superseded) and new approval cards
- [ ] New approval card is visible at channel level (reply_broadcast)
- [ ] Fallback: when metadata is null, new task creates its own top-level message without error

### Must Have

- Thread reuse when old task has persisted `notify_slack_ts`
- `reply_broadcast: true` on new approval card in supersede thread
- Graceful fallback to new top-level message when metadata is unavailable
- Old approval card marked "⏭️ Superseded" (already works via `check-supersede`)

### Must NOT Have (Guardrails)

- Do NOT modify `check-supersede` step — it already correctly handles approval card supersede
- Do NOT modify `buildSupersededBlocks()` — used by existing supersede flow
- Do NOT modify `pending_approvals` table schema
- Do NOT change how `notifyMsgRef` flows through the lifecycle closure (10+ consumers)
- Do NOT add `reply_broadcast: true` unconditionally — must be conditional on supersede
- Do NOT add a comprehensive `TaskMetadata` type and retrofit all callsites — only add needed keys
- Do NOT backfill existing tasks' metadata — column starts NULL for all existing rows

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: YES (tests after implementation)
- **Framework**: vitest (existing setup in `tests/`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Lifecycle**: Use Bash (curl, psql) — send webhooks, assert DB state
- **Shell tools**: Use Bash — run tool directly, validate output
- **Frontend/Slack**: Use Playwright — navigate Slack, assert thread structure, screenshots
- **Integration**: Use Bash (curl) + Playwright — end-to-end webhook → Slack thread

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 3 parallel tasks):
├── Task 1: Prisma migration — add metadata Json? to tasks [quick]
├── Task 2: Lifecycle — persist notify_slack_ts to tasks.metadata [unspecified-high]
└── Task 3: post-guest-approval.ts — add --reply-broadcast flag [quick]

Wave 2 (Core — 2 parallel tasks, depend on Wave 1):
├── Task 4: Webhook handler — read old task metadata on supersede (depends: T1) [unspecified-high]
└── Task 5: Lifecycle notify-received — detect supersede, chat.update + REPLY_BROADCAST env (depends: T1, T2) [deep]

Wave 3 (Integration + E2E):
├── Task 6: Tests — unit tests for supersede threading (depends: T2, T3, T4, T5) [unspecified-high]
└── Task 7: Docker rebuild + E2E verification (depends: T6) [unspecified-high]

Wave FINAL (4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T4 → T5 → T6 → T7 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On     | Blocks     | Wave                        |
| ---- | -------------- | ---------- | --------------------------- |
| T1   | —              | T2, T4, T5 | 1                           |
| T2   | T1             | T5, T6     | 1 (after T1 migration runs) |
| T3   | —              | T6         | 1                           |
| T4   | T1             | T6         | 2                           |
| T5   | T1, T2         | T6         | 2                           |
| T6   | T2, T3, T4, T5 | T7         | 3                           |
| T7   | T6             | F1-F4      | 3                           |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`
- **Wave 2**: **2** — T4 → `unspecified-high`, T5 → `deep`
- **Wave 3**: **2** — T6 → `unspecified-high`, T7 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma migration — add `metadata Json?` to tasks table

  **What to do**:
  - Add `metadata Json?` field to the `Task` model in `prisma/schema.prisma` (after `triage_result` field, line ~42)
  - Run `pnpm prisma migrate dev --name add_tasks_metadata` to generate the migration SQL
  - Run the migration against local dev DB
  - Verify column exists: `psql -c "\d tasks" | grep metadata` → `metadata | jsonb`

  **Must NOT do**:
  - Do NOT add NOT NULL constraint — column must be nullable (existing rows get NULL)
  - Do NOT add a default value — NULL is the correct default
  - Do NOT backfill existing rows
  - Do NOT add any index on the metadata column

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 2, 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:84-101` — `Deliverable` model has `metadata Json?` field — follow this exact pattern for the Task model

  **API/Type References**:
  - `prisma/schema.prisma:20-54` — `Task` model definition — add the new field here

  **WHY Each Reference Matters**:
  - The `Deliverable` model already uses `metadata Json?` — copy the exact field definition for consistency
  - The `Task` model is where the field is added — understand the existing fields to place it correctly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration creates metadata column on tasks table
    Tool: Bash (psql)
    Preconditions: Local dev DB running on port 54322
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "\d tasks"
      2. Assert output contains: metadata | jsonb
      3. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT metadata FROM tasks LIMIT 1;"
      4. Assert: returns NULL (no backfill)
    Expected Result: Column exists, nullable, JSONB type, all existing rows have NULL
    Failure Indicators: Column missing, wrong type, or NOT NULL constraint present
    Evidence: .sisyphus/evidence/task-1-migration-column.txt

  Scenario: Migration is idempotent (no error on re-run)
    Tool: Bash (prisma)
    Preconditions: Migration already applied
    Steps:
      1. Run: pnpm prisma migrate deploy
      2. Assert: exits with code 0, no error output
    Expected Result: Clean exit, no "already exists" errors
    Evidence: .sisyphus/evidence/task-1-migration-idempotent.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add metadata column to tasks table`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 2. Lifecycle — persist `notify_slack_ts` to tasks.metadata after notify-received

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, inside the `notify-received` step (lines 191-272), AFTER the Slack message is successfully posted (after `result.ts` is obtained), add a PostgREST PATCH to write `{ notify_slack_ts: result.ts, notify_slack_channel: channel }` to the task's `metadata` field
  - Use the read-modify-write merge pattern already used elsewhere in the lifecycle (lines 1549-1557): read existing metadata, merge new keys, PATCH back
  - The PATCH must use the existing `patchTask` helper or direct PostgREST call pattern from the file
  - Do this for BOTH paths: the guest-messaging enriched path (line ~246) and the generic path (line ~267)
  - Guard: only write if `result.ts` is truthy (don't write null ts)

  **Must NOT do**:
  - Do NOT modify the return value of the step — keep returning `{ ts, channel, enrichment }` as-is
  - Do NOT modify the enrichment logic or block-building logic
  - Do NOT modify any other step's metadata writes
  - Do NOT create a separate step for the metadata write — it goes inside the existing `notify-received` step

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T3, after T1 migration)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 1 (metadata column must exist)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1549-1557` — Read-modify-write metadata merge pattern (in handle-approval-result reject branch). Follow this exact pattern: read task, merge metadata, PATCH back
  - `src/inngest/employee-lifecycle.ts:884` — Another metadata PATCH callsite (currently silent no-op, will start working after T1 migration)

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts:191-272` — The `notify-received` step — this is where the new code goes
  - `src/inngest/employee-lifecycle.ts:246` — Guest-messaging return path with `result.ts`
  - `src/inngest/employee-lifecycle.ts:267` — Generic return path with `result.ts`

  **External References**:
  - PostgREST PATCH: the lifecycle uses `fetch(supabaseUrl + '/rest/v1/tasks?id=eq.' + taskId, { method: 'PATCH', body: JSON.stringify({ metadata }), headers })` — search for `patchTask` or `/rest/v1/tasks` in the file to find the exact pattern

  **WHY Each Reference Matters**:
  - Lines 1549-1557 show the exact read-modify-write pattern needed — read existing metadata (may be null), merge new keys, PATCH back. This prevents overwriting metadata written by other steps.
  - Lines 191-272 are the target step — must understand the two return paths (enriched vs generic) to add the write at the right location

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: notify-received persists Slack ts to task metadata
    Tool: Bash (curl + psql)
    Preconditions: Gateway running, Inngest running, T1 migration applied
    Steps:
      1. Fire a guest-messaging webhook:
         curl -s 'http://localhost:7700/webhooks/hostfully' -X POST -H 'Content-Type: application/json' \
           -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"metadata-test-'$(date +%s)'","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
      2. Wait 10 seconds for lifecycle to start and notify-received to complete
      3. Query: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
           -c "SELECT metadata->>'notify_slack_ts' as ts, metadata->>'notify_slack_channel' as ch FROM tasks WHERE source_system='hostfully' ORDER BY created_at DESC LIMIT 1;"
      4. Assert: ts is a non-null Slack timestamp (format: digits.digits), ch is a channel ID starting with 'C'
    Expected Result: metadata contains notify_slack_ts and notify_slack_channel
    Failure Indicators: metadata is NULL, or ts/ch keys are missing
    Evidence: .sisyphus/evidence/task-2-metadata-persisted.txt

  Scenario: metadata merge does not overwrite existing keys
    Tool: Bash (psql)
    Preconditions: A task exists with metadata written by notify-received
    Steps:
      1. Find the task ID from the previous scenario
      2. Manually add a key: PGPASSWORD=postgres psql ... -c "UPDATE tasks SET metadata = metadata || '{\"test_key\":\"test_value\"}' WHERE id='<task_id>';"
      3. Trigger the lifecycle to write metadata again (or check that existing metadata is preserved)
      4. Assert: both notify_slack_ts AND test_key are present in metadata
    Expected Result: Merge preserves existing keys
    Evidence: .sisyphus/evidence/task-2-metadata-merge.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): persist notify Slack ts to task metadata`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 3. `post-guest-approval.ts` — add `--reply-broadcast` flag

  **What to do**:
  - Add a `--reply-broadcast` boolean CLI argument to `src/worker-tools/slack/post-guest-approval.ts`
  - When `--reply-broadcast` is truthy AND `--thread-ts` is provided and non-empty, add `reply_broadcast: true` to the `chat.postMessage` call
  - Add empty-string guard for `--thread-ts`: if the value is `""` (empty string), treat it as absent (do not pass `thread_ts` to Slack API)
  - Do NOT add `reply_broadcast` when `--thread-ts` is absent or empty — the flag only makes sense for threaded messages

  **Must NOT do**:
  - Do NOT add `reply_broadcast: true` unconditionally
  - Do NOT modify the idempotency guard (existing `/tmp/approval-message.json` check)
  - Do NOT change the output format of `/tmp/approval-message.json`
  - Do NOT modify block construction or approval card content

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-guest-approval.ts:93` — Where `thread_ts: params.threadTs` is added to the Slack API call
  - `src/worker-tools/slack/post-guest-approval.ts:338` — CLI argument parsing with `parseArgs` — add new `--reply-broadcast` arg here
  - `src/worker-tools/slack/post-guest-approval.ts:355` — Output writing to `/tmp/approval-message.json`

  **External References**:
  - Slack API `chat.postMessage` `reply_broadcast` parameter: when true, the message appears in the channel feed in addition to the thread

  **WHY Each Reference Matters**:
  - Line 93 is where `thread_ts` is conditionally added — add `reply_broadcast` in the same conditional
  - Line 338 is the CLI parser — add the new boolean argument following the existing pattern
  - Line 355 is the output — do NOT modify this structure

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: --reply-broadcast flag posts with reply_broadcast when --thread-ts is provided
    Tool: Bash
    Preconditions: SLACK_BOT_TOKEN set, valid channel ID available
    Steps:
      1. Run: NODE_NO_WARNINGS=1 tsx src/worker-tools/slack/post-guest-approval.ts \
           --channel "C0960S2Q8RL" --task-id "test-broadcast" \
           --thread-ts "1778258745.633869" --reply-broadcast \
           --guest-name "Test Guest" --draft-response "Test reply" \
           --original-message "Test message" --category "general_inquiry" \
           --confidence 0.9 --lead-uid "test" --thread-uid "test" --message-uid "test"
      2. Check Slack: message should appear both in thread AND channel feed
      3. Check /tmp/approval-message.json is written correctly
    Expected Result: Message posted with reply_broadcast, visible in channel feed
    Failure Indicators: Message only in thread (not in channel feed), or tool crashes
    Evidence: .sisyphus/evidence/task-3-reply-broadcast.txt

  Scenario: Empty --thread-ts is treated as absent
    Tool: Bash
    Preconditions: Same as above
    Steps:
      1. Run same command but with --thread-ts ""
      2. Assert: message posts as top-level (not threaded), no error
    Expected Result: Top-level message, no thread_ts in API call
    Failure Indicators: Error about invalid thread_ts, or message threaded under empty ts
    Evidence: .sisyphus/evidence/task-3-empty-thread-ts.txt
  ```

  **Commit**: YES
  - Message: `feat(slack): add reply-broadcast flag to post-guest-approval`
  - Files: `src/worker-tools/slack/post-guest-approval.ts`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 4. Webhook handler — read old task metadata on supersede, pass to new task

  **What to do**:
  - In `src/gateway/routes/hostfully.ts`, in the supersede block (lines ~92-133 after the recent fix), modify the `findFirst` query to also select `metadata` from the old task: `select: { id: true, status: true, metadata: true }`
  - After cancelling the old task, extract `notify_slack_ts` and `notify_slack_channel` from the old task's metadata (if present)
  - Include these values in the new task's `raw_event` as `superseded_notify_ts` and `superseded_notify_channel`
  - Guard: if `metadata` is null or doesn't contain the keys, omit them from raw_event (don't pass null values)

  **Must NOT do**:
  - Do NOT restructure the existing supersede detection logic
  - Do NOT change the Executing/Validating guard behavior
  - Do NOT add a separate DB query — extend the existing `findFirst` query's `select`
  - Do NOT pass the ts in a field other than `raw_event` (no new columns)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (metadata column must exist)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/hostfully.ts:92-133` — Current supersede block with `findFirst` and cancel logic (recently modified)
  - `src/gateway/routes/hostfully.ts:125-131` — `raw_event` construction in `task.create` — add `superseded_notify_ts` and `superseded_notify_channel` here

  **API/Type References**:
  - Prisma `findFirst` with `select` — adding `metadata: true` to the select object
  - `metadata` is `Json?` in Prisma — returned as `unknown`, needs type assertion: `(activeTask.metadata as Record<string, unknown> | null)?.notify_slack_ts`

  **WHY Each Reference Matters**:
  - Lines 92-133 are the exact code being modified — need to understand the flow: findFirst → status check → cancel → fall through
  - Lines 125-131 are where raw_event is set for the new task — the superseded values must be added here, conditionally

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Superseded task's notify ts is passed to new task
    Tool: Bash (psql + curl)
    Preconditions: T1 migration applied, gateway running with new code
    Steps:
      1. Create a simulated old task with metadata:
         PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c \
           "INSERT INTO tasks (id, archetype_id, tenant_id, external_id, source_system, status, raw_event, metadata) \
            VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', \
            '00000000-0000-0000-0000-000000000003', 'hostfully-msg-supersede-ts-test', 'hostfully', 'Reviewing', \
            '{\"thread_uid\":\"supersede-ts-test-thread\",\"lead_uid\":\"test-lead\"}', \
            '{\"notify_slack_ts\":\"1234567890.123456\",\"notify_slack_channel\":\"C0960S2Q8RL\"}');"
      2. Send webhook for same thread:
         curl -s 'http://localhost:7700/webhooks/hostfully' -X POST -H 'Content-Type: application/json' \
           -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"supersede-ts-'$(date +%s)'","thread_uid":"supersede-ts-test-thread","lead_uid":"test-lead"}'
      3. Query new task's raw_event:
         PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c \
           "SELECT raw_event->>'superseded_notify_ts' as ts, raw_event->>'superseded_notify_channel' as ch FROM tasks WHERE raw_event->>'thread_uid'='supersede-ts-test-thread' AND status != 'Cancelled' ORDER BY created_at DESC LIMIT 1;"
      4. Assert: ts = '1234567890.123456', ch = 'C0960S2Q8RL'
      5. Assert: old task status = 'Cancelled'
    Expected Result: New task's raw_event contains the old task's Slack ts and channel
    Failure Indicators: ts or ch is NULL, or old task not cancelled
    Evidence: .sisyphus/evidence/task-4-supersede-ts-passed.txt

  Scenario: Fallback when old task has no metadata
    Tool: Bash (psql + curl)
    Preconditions: Same as above
    Steps:
      1. Create old task WITHOUT metadata:
         PGPASSWORD=postgres psql ... -c "INSERT INTO tasks (..., metadata) VALUES (..., NULL);"
      2. Send webhook for same thread
      3. Query new task's raw_event
      4. Assert: superseded_notify_ts is absent from raw_event (not null string — actually absent)
    Expected Result: raw_event has no superseded_notify_ts key, no error in gateway logs
    Evidence: .sisyphus/evidence/task-4-supersede-no-metadata.txt
  ```

  **Commit**: YES
  - Message: `feat(hostfully): pass old task Slack ts on supersede`
  - Files: `src/gateway/routes/hostfully.ts`
  - Pre-commit: `pnpm tsc --noEmit`

---

- [x] 5. Lifecycle `notify-received` — detect supersede, use `chat.update` + pass `REPLY_BROADCAST`

  **What to do**:
  This is the core task. Modify the `notify-received` step in `src/inngest/employee-lifecycle.ts` to detect when the task is superseding an old one and reuse the old Slack thread.

  **Step-by-step implementation**:
  1. At the start of the `notify-received` step (line ~192), read `raw_event.superseded_notify_ts` and `raw_event.superseded_notify_channel` from the task's `raw_event`
  2. If both values are present and non-empty:
     a. Instead of `slackClient.postMessage(...)`, call `slackClient.updateMessage(supersededNotifyChannel, supersededNotifyTs, text, blocks)` — this updates the old parent message in-place with the new task's "⏳ Processing" content
     b. Return `{ ts: supersededNotifyTs, channel: supersededNotifyChannel, enrichment }` — all downstream steps use this `notifyMsgRef` to post in the same thread
     c. If `chat.update` fails (message deleted, channel mismatch), log a warning and FALL BACK to `postMessage` (create new top-level message) — do NOT throw
  3. If values are absent → standard behavior (post new top-level message, no change)

  **Additionally**, in the `executing` step (lines ~440-475) where `NOTIFY_MSG_TS` is injected into the worker container env: 4. If `raw_event.superseded_notify_ts` is present, also inject `REPLY_BROADCAST=true` into the worker env vars 5. The archetype instructions already tell the model to use `--thread-ts $NOTIFY_MSG_TS` — add instruction to use `--reply-broadcast` when `$REPLY_BROADCAST` is `true`

  **For the instruction update**, modify the archetype `instructions` in `prisma/seed.ts` (around line 269-360, guest-messaging instructions section): 6. Add to the existing instructions: "If the environment variable `REPLY_BROADCAST` is set to `true`, add the `--reply-broadcast` flag when calling `post-guest-approval.ts`"

  **Must NOT do**:
  - Do NOT modify the return type/shape of `notify-received` — keep `{ ts, channel, enrichment }`
  - Do NOT modify `check-supersede` step — it already handles approval card supersede correctly
  - Do NOT modify `buildSupersededBlocks()` or `buildEnrichedNotifyBlocks()`
  - Do NOT touch `notifyMsgRef` closure flow in any other step
  - Do NOT add a new step — all changes go inside existing steps

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1 (metadata column), 2 (metadata persistence)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:191-272` — `notify-received` step — the primary target for modification
  - `src/inngest/employee-lifecycle.ts:246` — Guest-messaging path return with `result.ts` — this is where the supersede branch diverges
  - `src/inngest/employee-lifecycle.ts:267` — Generic path return — same divergence point
  - `src/inngest/employee-lifecycle.ts:447,470` — `NOTIFY_MSG_TS` injection into worker env (local Docker and Fly.io) — add `REPLY_BROADCAST` here
  - `src/inngest/employee-lifecycle.ts:501-530` — `mark-failed` step — uses `notifyMsgRef` from closure. Do NOT touch this. Just ensure `notifyMsgRef` returned from notify-received still has the same shape.

  **API/Type References**:
  - `src/lib/slack-client.ts` — `createSlackClient` return type has `updateMessage(channel, ts, text, blocks)` method
  - `src/lib/slack-blocks.ts:buildEnrichedNotifyBlocks` — signature: `({ guestName, propertyName?, checkIn?, checkOut?, bookingChannel?, messageSnippet?, taskId })` — reuse for the supersede chat.update call

  **Seed References**:
  - `prisma/seed.ts:269-360` — Guest-messaging archetype instructions — add `REPLY_BROADCAST` instruction here
  - `prisma/seed.ts:324` — Existing `--thread-ts $NOTIFY_MSG_TS` instruction line

  **WHY Each Reference Matters**:
  - Lines 191-272 are the exact step being modified — must understand both code paths (enriched vs generic) to add the supersede branch correctly
  - Lines 447, 470 show the env var injection pattern — follow the same pattern for `REPLY_BROADCAST`
  - `prisma/seed.ts:324` shows where the model is told to use `--thread-ts` — add `--reply-broadcast` instruction nearby
  - `slack-client.ts` confirms `updateMessage` is available — no need to add a new method

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Superseded task reuses old Slack thread
    Tool: Bash (curl + psql)
    Preconditions: Gateway + Inngest running, T1-T4 applied, Docker image rebuilt
    Steps:
      1. Fire first webhook (creates task, lifecycle posts parent message):
         curl -s 'http://localhost:7700/webhooks/hostfully' -X POST -H 'Content-Type: application/json' \
           -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"thread-reuse-1-'$(date +%s)'","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
      2. Wait for task to reach Reviewing (check DB: SELECT status FROM tasks ORDER BY created_at DESC LIMIT 1)
      3. Note the task's notify_slack_ts from metadata
      4. Fire second webhook (same thread_uid, different message_uid):
         curl -s 'http://localhost:7700/webhooks/hostfully' -X POST -H 'Content-Type: application/json' \
           -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"thread-reuse-2-'$(date +%s)'","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
      5. Wait for new task to reach Reviewing
      6. Check new task's metadata: notify_slack_ts should match old task's notify_slack_ts (same parent message reused)
    Expected Result: Both tasks use the same Slack parent message ts
    Failure Indicators: New task has a different notify_slack_ts (created new parent), or errors in lifecycle logs
    Evidence: .sisyphus/evidence/task-5-thread-reuse.txt

  Scenario: Fallback to new parent when superseded_notify_ts is missing
    Tool: Bash (curl + psql)
    Preconditions: Same as above
    Steps:
      1. Create an old task WITH NO metadata (simulating race condition):
         PGPASSWORD=postgres psql ... -c "INSERT INTO tasks (..., metadata) VALUES (..., NULL);"
      2. Fire webhook for same thread
      3. Wait for new task's notify-received to complete
      4. Check new task's metadata: should have its OWN notify_slack_ts (not the old task's)
      5. Check gateway and lifecycle logs: should contain a warning about missing superseded ts, NOT an error
    Expected Result: New top-level message created, no crash, warning logged
    Evidence: .sisyphus/evidence/task-5-fallback-new-parent.txt
  ```

  **Commit**: YES (groups with seed.ts change)
  - Message: `feat(lifecycle): reuse Slack thread on superseded task`
  - Files: `src/inngest/employee-lifecycle.ts`, `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 6. Tests — unit tests for supersede threading

  **What to do**:
  - Create `tests/inngest/supersede-threading.test.ts` with tests covering:
    1. **Webhook handler supersede passes metadata**: Mock Prisma findFirst returning a task with metadata containing `notify_slack_ts` → verify the created task's raw_event includes `superseded_notify_ts` and `superseded_notify_channel`
    2. **Webhook handler supersede with no metadata**: Mock findFirst returning a task with `metadata: null` → verify created task's raw_event does NOT include `superseded_notify_ts`
    3. **post-guest-approval.ts empty thread-ts guard**: Call with `--thread-ts ""` → verify it's treated as absent (no `thread_ts` in API call)
    4. **post-guest-approval.ts reply-broadcast flag**: Call with `--thread-ts "valid" --reply-broadcast` → verify `reply_broadcast: true` in API call

  - Follow existing test patterns in `tests/inngest/` and `tests/worker-tools/`

  **Must NOT do**:
  - Do NOT modify existing test files
  - Do NOT test the lifecycle `notify-received` step directly (it's an Inngest step, tested via integration)
  - Do NOT create an overly complex test setup — use existing mock patterns

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-enriched-notify.test.ts` — Test patterns for lifecycle behavior with mocked Prisma and Inngest
  - `tests/gateway/hostfully-route.test.ts` — Test patterns for the webhook handler with mocked Prisma
  - `tests/worker-tools/` — Test patterns for shell tools (if any exist)

  **WHY Each Reference Matters**:
  - Existing test files show the project's mocking conventions (Prisma mock, Inngest mock, Slack mock) — follow the same patterns

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: All implementation tasks (T1-T5) complete
    Steps:
      1. Run: pnpm test -- --run tests/inngest/supersede-threading.test.ts
      2. Assert: all tests pass, 0 failures
      3. Run: pnpm test -- --run
      4. Assert: no regressions (same pass count as before, excluding pre-existing failures)
    Expected Result: All new tests pass, no regressions
    Failure Indicators: Any test failure, or existing tests broken
    Evidence: .sisyphus/evidence/task-6-test-results.txt
  ```

  **Commit**: YES
  - Message: `test(lifecycle): add supersede threading tests`
  - Files: `tests/inngest/supersede-threading.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 7. Docker rebuild + E2E verification

  **What to do**:
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .` (picks up updated `post-guest-approval.ts`)
  - Re-seed the database: `pnpm prisma db seed` (picks up updated archetype instructions with `--reply-broadcast`)
  - Run full E2E test using the Olivia test account Airbnb thread:
    1. Send a message as Olivia on Airbnb → first task processes → approval card appears in Slack
    2. While first task is in Reviewing, send ANOTHER message as Olivia on Airbnb
    3. Verify: old approval card shows "⏭️ Superseded", new approval card appears IN THE SAME THREAD
    4. Verify: new approval card is visible at channel level (reply_broadcast)
    5. Click "Approve & Send" on the new card → verify delivery works
  - Clean up: cancel any lingering test tasks

  **Must NOT do**:
  - Do NOT use fake/simulated data — use the real Olivia test account for E2E
  - Do NOT skip the Docker rebuild — `post-guest-approval.ts` changes are baked into the image
  - Do NOT skip the re-seed — archetype instructions must include `--reply-broadcast`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after T6)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References**:

  **E2E References**:
  - `AGENTS.md` § "E2E Testing with Playwright Browser" — Full E2E flow documentation, Airbnb thread URL, Slack channel
  - Airbnb thread: `https://www.airbnb.com/guest/messages/2525238359` — Send messages as Olivia
  - Slack channel: `#cs-guest-communication` (`C0AMGJQN05S`) — Approval cards appear here

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E — superseded task reuses Slack thread
    Tool: Playwright + Bash
    Preconditions: Docker image rebuilt, DB re-seeded, gateway + Inngest running
    Steps:
      1. Navigate to https://www.airbnb.com/guest/messages/2525238359
      2. Send message: "Hi, I have a question about check-in"
      3. Wait for Hostfully webhook → task created → approval card in Slack
      4. Navigate to Slack #cs-guest-communication, find the approval card thread
      5. Note the parent message ts (from task metadata in DB)
      6. Go back to Airbnb, send follow-up: "Also, is there parking available?"
      7. Wait for second webhook → old task superseded → new task created
      8. Check Slack: old approval card shows "⏭️ Superseded"
      9. Check Slack: new approval card is in the SAME thread (same parent message)
      10. Check Slack: new approval card is visible at channel level (reply_broadcast indicator)
      11. Click "Approve & Send" on new card
      12. Verify: reply appears in Airbnb thread from host
      13. Verify: task status = Done in DB
    Expected Result: Single Slack thread with chronological progression, channel-level visibility
    Failure Indicators: New top-level message created, or new card not visible in channel feed
    Evidence: .sisyphus/evidence/task-7-e2e-screenshot.png, .sisyphus/evidence/task-7-e2e-db-state.txt

  Scenario: Verify no stale messages left behind
    Tool: Bash (psql)
    Preconditions: E2E test complete
    Steps:
      1. Query: SELECT id, status FROM tasks WHERE archetype_id='00000000-0000-0000-0000-000000000015' AND status NOT IN ('Done','Failed','Cancelled');
      2. Assert: 0 rows (no stuck tasks)
    Expected Result: All tasks in terminal state
    Evidence: .sisyphus/evidence/task-7-no-stuck-tasks.txt
  ```

  **Commit**: NO (E2E is verification, not code)

---

- [ ] 8. Notify completion — Send Telegram notification: plan `supersede-slack-threading` complete, all tasks done, come back to review results.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [5/5] | Must NOT Have [5/5] | Tasks [7/7] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS] | Lint [PASS] | Tests [40 pass/0 fail] | Files [8 clean/0 issues] | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [7/7 pass] | Integration [3/3] | Edge Cases [3 tested] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [7/7 compliant] | Contamination [CLEAN] | Unaccounted [CLEAN] | VERDICT: APPROVE`

---

## Commit Strategy

| Wave | Commit Message                                                 | Files                                           | Pre-commit           |
| ---- | -------------------------------------------------------------- | ----------------------------------------------- | -------------------- |
| 1    | `feat(db): add metadata column to tasks table`                 | `prisma/schema.prisma`, migration SQL           | `pnpm tsc --noEmit`  |
| 1    | `feat(lifecycle): persist notify Slack ts to task metadata`    | `src/inngest/employee-lifecycle.ts`             | `pnpm test -- --run` |
| 1    | `feat(slack): add reply-broadcast flag to post-guest-approval` | `src/worker-tools/slack/post-guest-approval.ts` | `pnpm tsc --noEmit`  |
| 2    | `feat(hostfully): pass old task Slack ts on supersede`         | `src/gateway/routes/hostfully.ts`               | `pnpm tsc --noEmit`  |
| 2    | `feat(lifecycle): reuse Slack thread on superseded task`       | `src/inngest/employee-lifecycle.ts`             | `pnpm test -- --run` |
| 3    | `test(lifecycle): add supersede threading tests`               | `tests/inngest/supersede-threading.test.ts`     | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# Migration applied
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "\d tasks" | grep metadata
# Expected: metadata | jsonb

# Metadata persisted after task
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE source_system='hostfully' ORDER BY created_at DESC LIMIT 1;"
# Expected: non-null Slack timestamp string

# TypeScript compiles
pnpm tsc --noEmit  # Expected: 0 new errors

# Tests pass
pnpm test -- --run  # Expected: all pass (pre-existing failures excluded)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker image rebuilt with updated post-guest-approval.ts
- [ ] E2E: superseded thread shows old + new cards in same thread
- [ ] E2E: new card visible at channel level via reply_broadcast
- [ ] E2E: fallback to new top-level when metadata is null
