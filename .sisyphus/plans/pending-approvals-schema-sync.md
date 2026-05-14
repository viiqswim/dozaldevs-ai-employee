# Fix pending_approvals Schema Drift + REPLY_BROADCAST

## TL;DR

> **Quick Summary**: Fix two E2E-blocking bugs — `pending_approvals` table columns were renamed in the DB but code/schema never updated (PostgREST 400), and `REPLY_BROADCAST` env var only fires for superseded messages instead of all threaded messages. Then verify with Scenario A E2E.
>
> **Deliverables**:
>
> - `pending-approvals.ts` updated to use `recipient_name`/`context_label` column names
> - Prisma schema aligned with actual DB state (including `pre_check_adapter`/`worker_env` on archetypes)
> - Missing migration file created for `20260513064913`
> - `REPLY_BROADCAST` logic fixed to fire when `thread_uid` is present
> - Scenario A E2E passing end-to-end
>
> **Estimated Effort**: Short (~30 min implementation + E2E time)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (schema) → Task 2 (code) → Task 3 (REPLY_BROADCAST) → Task 4 (verify) → Task 5 (E2E)

---

## Context

### Original Request

User ran E2E test for guest-messaging Scenario A and hit two bugs:

1. PostgREST 400 error at `track-pending-approval` step: `Could not find the 'guest_name' column of 'pending_approvals' in the schema cache`
2. Approval card posted as top-level message instead of thread reply with channel broadcast

### Interview Summary

**Key Discussions**:

- User confirmed the `pending_approvals` table structure was intentionally changed (columns renamed)
- The migration file was never committed and code was never updated to match
- The `REPLY_BROADCAST` env var logic only fires for supersede scenarios, not normal messages

**Research Findings**:

- DB `pending_approvals` has: `recipient_name`, `context_label` (renamed from `guest_name`, `property_name`)
- DB `archetypes` has: `pre_check_adapter` (text), `worker_env` (jsonb) — added by same migration, no code references
- Code writes `guest_name`/`property_name` via PostgREST → 400 error
- `REPLY_BROADCAST` at lifecycle lines 509/533 checks `rawEvent['superseded_notify_ts']` but AGENTS.md + test guide say it should check `rawEvent['thread_uid']`
- `reviewing-watchdog.ts` has its own `PendingApprovalRow` with only `id` — NOT affected
- `reminder-blocks.ts` references old names but is dead code — leave as-is
- `post-guest-approval.ts` output keys (`guest_name`/`property_name`) go to `tasks.metadata` JSON, NOT to `pending_approvals` — NOT affected

### Metis Review

**Identified Gaps** (addressed):

- Confirmed `reminder-blocks.ts` is dead code — excluded from scope
- Confirmed `post-guest-approval.ts` metadata fields are unrelated to `pending_approvals` columns
- Confirmed `reviewing-watchdog.ts` only uses `id` field — not affected
- Must NOT run `prisma migrate dev` since migration is already applied to DB
- Must run `pnpm prisma generate` after schema changes

---

## Work Objectives

### Core Objective

Align code and Prisma schema with the actual DB state after a migration that was applied but never reflected in the codebase, fix REPLY_BROADCAST gating, and verify both fixes with a full E2E Scenario A run.

### Concrete Deliverables

- Updated `src/inngest/lib/pending-approvals.ts` — new column names
- Updated `src/inngest/employee-lifecycle.ts` — trackPendingApproval call + REPLY_BROADCAST fix
- Updated `prisma/schema.prisma` — PendingApproval + Archetype models
- Created `prisma/migrations/20260513064913_add_pre_check_adapter_worker_env_rename_fields/migration.sql`
- Passing Scenario A E2E test

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes with same count as before
- [ ] `pnpm prisma migrate status` shows "up to date"
- [ ] PostgREST insert with `recipient_name`/`context_label` returns 201
- [ ] Scenario A E2E: task reaches Done, approval card in thread with channel broadcast, context reply posted

### Must Have

- Column rename in `pending-approvals.ts` (both interfaces + all PostgREST operations)
- Prisma schema sync (both `PendingApproval` and `Archetype` models)
- Migration file matching the already-applied DB changes
- REPLY_BROADCAST condition changed to `rawEvent['thread_uid']`
- Lifecycle `trackPendingApproval` call updated to use new field names

### Must NOT Have (Guardrails)

- Do NOT modify `post-guest-approval.ts` — its `guest_name`/`property_name` are `tasks.metadata` keys
- Do NOT modify `reviewing-watchdog.ts` — only uses `id`
- Do NOT modify `reminder-blocks.ts` — dead code
- Do NOT run `prisma migrate dev` — migration is already applied
- Do NOT change `NOTIFY_MSG_TS` logic
- Do NOT rename metadata fields on `tasks.metadata` — those are employee-specific and correct as-is

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (verify existing tests still pass)
- **Framework**: vitest

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/DB**: Use Bash (curl, psql) — send PostgREST requests, assert status + response fields
- **E2E**: Use Playwright (dev-browser skill) — navigate Airbnb/Slack, interact, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — schema + migration file + code fixes):
├── Task 1: Create migration file + update Prisma schema + generate client [quick]
├── Task 2: Update pending-approvals.ts column names [quick]
├── Task 3: Update lifecycle — trackPendingApproval call + REPLY_BROADCAST fix [quick]

Wave 2 (After Wave 1 — verify + E2E):
├── Task 4: Build, test, PostgREST verification [quick]
├── Task 5: Scenario A E2E — full happy path [deep + dev-browser]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 5 → F1-F4 → user okay
Parallel Speedup: Tasks 1-3 can run in parallel
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 4      |
| 2    | —          | 4      |
| 3    | —          | 4      |
| 4    | 1, 2, 3    | 5      |
| 5    | 4          | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2** — T4 → `quick`, T5 → `deep` + `dev-browser`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` + `playwright`, F4 → `deep`

---

## TODOs

- [x] 1. Create migration file + update Prisma schema + regenerate client

  **What to do**:
  - Create directory `prisma/migrations/20260513064913_add_pre_check_adapter_worker_env_rename_fields/`
  - Create `migration.sql` with the SQL that was already applied to the DB:

    ```sql
    -- AlterTable: archetypes — add new columns
    ALTER TABLE "archetypes" ADD COLUMN "pre_check_adapter" TEXT;
    ALTER TABLE "archetypes" ADD COLUMN "worker_env" JSONB;

    -- AlterTable: pending_approvals — rename columns to employee-agnostic names
    ALTER TABLE "pending_approvals" RENAME COLUMN "guest_name" TO "recipient_name";
    ALTER TABLE "pending_approvals" RENAME COLUMN "property_name" TO "context_label";
    ```

  - Update `prisma/schema.prisma` `PendingApproval` model:
    - Change `guest_name String? @map("guest_name")` → `recipient_name String? @map("recipient_name")`
    - Change `property_name String? @map("property_name")` → `context_label String? @map("context_label")`
  - Update `prisma/schema.prisma` `Archetype` model — add after `enrichment_adapter`:
    - `pre_check_adapter String?` (text, nullable)
    - `worker_env Json?` (jsonb, nullable)
  - Run `pnpm prisma generate` to regenerate the Prisma client
  - Run `pnpm prisma migrate status` to verify migration shows as "applied"

  **Must NOT do**:
  - Do NOT run `prisma migrate dev` — the migration is already applied to the DB
  - Do NOT change any column names beyond what's listed
  - Do NOT modify the migration timestamp — it must match `20260513064913`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:435-453` — Current PendingApproval model with old column names (@map directives)
  - `prisma/schema.prisma:179-215` — Current Archetype model (missing pre_check_adapter, worker_env)
  - `prisma/migrations/20260429131314_add_reminder_fields_to_pending_approvals/migration.sql` — Example migration format for this table
  - `prisma/migrations/20260512224843_add_archetype_vm_size_and_enrichment_adapter/migration.sql` — Example migration that added archetype columns

  **API/Type References**:
  - DB `\d pending_approvals` shows: `recipient_name text`, `context_label text` (the ACTUAL column names)
  - DB `\d archetypes` shows: `pre_check_adapter text`, `worker_env jsonb` (columns that exist but aren't in schema)
  - `_prisma_migrations` table has row for `20260513064913_add_pre_check_adapter_worker_env_rename_fields` (already applied)

  **WHY Each Reference Matters**:
  - The schema.prisma file MUST match the DB exactly — Prisma generate needs correct @map names to produce valid PostgREST-compatible column references
  - The migration file must exist in the filesystem because `prisma migrate status` checks for it — without it, the status shows "migration found in DB but not on filesystem"

  **Acceptance Criteria**:
  - [ ] Migration file exists at correct path with correct SQL
  - [ ] `pnpm prisma generate` exits 0
  - [ ] `pnpm prisma migrate status` shows no pending/failed migrations

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Prisma migration status is clean
    Tool: Bash
    Preconditions: Migration file created, schema updated
    Steps:
      1. Run: pnpm prisma migrate status
      2. Assert output contains "Database schema is up to date" or shows no pending migrations
      3. Assert output does NOT contain "migration found in the migration directory but not in the database" or "have not yet been applied"
    Expected Result: All migrations resolved — no drift between filesystem and DB
    Failure Indicators: "not applied", "failed", "drift detected"
    Evidence: .sisyphus/evidence/task-1-prisma-status.txt

  Scenario: Prisma generate succeeds
    Tool: Bash
    Preconditions: Schema file updated
    Steps:
      1. Run: pnpm prisma generate
      2. Assert exit code 0
    Expected Result: Client generated without errors
    Failure Indicators: Non-zero exit code, error messages
    Evidence: .sisyphus/evidence/task-1-prisma-generate.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `fix(schema): align pending_approvals + archetypes with DB state`
  - Files: `prisma/schema.prisma`, `prisma/migrations/20260513064913_.../migration.sql`
  - Pre-commit: `pnpm prisma generate`

- [x] 2. Update pending-approvals.ts column names

  **What to do**:
  - In `src/inngest/lib/pending-approvals.ts`:
    - Rename interface `PendingApproval` fields: `guestName` → `recipientName`, `propertyName` → `contextLabel`
    - Rename interface `PendingApprovalData` fields: `guestName` → `recipientName`, `propertyName` → `contextLabel`
    - In `getPendingApproval()` (line 56-57): Change `row['guest_name']` → `row['recipient_name']`, `row['property_name']` → `row['context_label']`
    - In `trackPendingApproval()` (line 80-81): Change `guest_name: data.guestName` → `recipient_name: data.recipientName`, `property_name: data.propertyName` → `context_label: data.contextLabel`
    - In `getStaleApprovals()` (line 137-138): Same column name changes as getPendingApproval

  **Must NOT do**:
  - Do NOT change any logic — only rename fields and column references
  - Do NOT touch `reminder-blocks.ts` (dead code)
  - Do NOT touch `reviewing-watchdog.ts` (uses only `id`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/lib/pending-approvals.ts:1-154` — The entire file (all 6 locations to change)

  **API/Type References**:
  - DB column names: `recipient_name`, `context_label` (PostgREST expects these exact names)

  **WHY Each Reference Matters**:
  - The PostgREST JSON body keys MUST exactly match the DB column names — `recipient_name` not `guest_name`

  **Acceptance Criteria**:
  - [ ] All 6 references changed (lines 56, 57, 80, 81, 137, 138)
  - [ ] Interface fields renamed in both `PendingApproval` and `PendingApprovalData`
  - [ ] No remaining references to `guest_name` or `property_name` in this file

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No old column names remain in pending-approvals.ts
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -n "guest_name\|property_name" src/inngest/lib/pending-approvals.ts
      2. Assert: zero matches
    Expected Result: No occurrences of old column names
    Failure Indicators: Any line with guest_name or property_name
    Evidence: .sisyphus/evidence/task-2-no-old-names.txt

  Scenario: New column names present
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -n "recipient_name\|context_label\|recipientName\|contextLabel" src/inngest/lib/pending-approvals.ts
      2. Assert: at least 6 matches (2 per function × 3 functions)
    Expected Result: New names present in all expected locations
    Failure Indicators: Fewer than 6 matches
    Evidence: .sisyphus/evidence/task-2-new-names.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `fix(schema): align pending_approvals + archetypes with DB state`
  - Files: `src/inngest/lib/pending-approvals.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Update lifecycle — trackPendingApproval call + REPLY_BROADCAST fix

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`:
    - **trackPendingApproval call** (lines 1257-1258): Change `guestName:` → `recipientName:`, `propertyName:` → `contextLabel:`
    - **REPLY_BROADCAST fix** (line 509): Change `rawEvent['superseded_notify_ts']` → `rawEvent['thread_uid']`
    - **REPLY_BROADCAST fix** (line 533): Same change — `rawEvent['superseded_notify_ts']` → `rawEvent['thread_uid']`
  - These are the ONLY 3 changes in this file

  **Must NOT do**:
  - Do NOT change `NOTIFY_MSG_TS` logic
  - Do NOT change any other env var injection
  - Do NOT rename `metadata['guest_name']` references — those are `tasks.metadata` keys, not `pending_approvals` columns
  - Do NOT touch `delivMeta.guest_name` read (that reads from tasks.metadata) — only change what it's mapped TO in the trackPendingApproval call

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1251-1261` — The `trackPendingApproval` call with old field names
  - `src/inngest/employee-lifecycle.ts:508-509` — Local Docker env with REPLY_BROADCAST (superseded_notify_ts check)
  - `src/inngest/employee-lifecycle.ts:532-533` — Fly.io env with REPLY_BROADCAST (same check)

  **API/Type References**:
  - `PendingApprovalData` interface (from Task 2) now expects `recipientName`/`contextLabel`
  - AGENTS.md states: `REPLY_BROADCAST=true` should be set when `rawEvent['thread_uid']` is truthy

  **Test References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` Step A/3: "The approval card thread reply must also appear as a stand-alone channel-level message" — confirms REPLY_BROADCAST should be true for guest messages

  **WHY Each Reference Matters**:
  - Lines 1257-1258: Must match the renamed interface fields from Task 2 or TypeScript won't compile
  - Lines 509/533: The REPLY_BROADCAST condition determines whether the approval card appears at channel level — the test guide explicitly expects it

  **Acceptance Criteria**:
  - [ ] `trackPendingApproval` call uses `recipientName:` and `contextLabel:`
  - [ ] Both REPLY_BROADCAST conditions check `rawEvent['thread_uid']`
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: trackPendingApproval uses new field names
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -n "recipientName:" src/inngest/employee-lifecycle.ts
      2. Assert: at least 1 match near line 1257
      3. Run: grep -n "contextLabel:" src/inngest/employee-lifecycle.ts
      4. Assert: at least 1 match near line 1258
    Expected Result: New field names used in trackPendingApproval call
    Failure Indicators: No matches, or old guestName/propertyName still present at those lines
    Evidence: .sisyphus/evidence/task-3-field-names.txt

  Scenario: REPLY_BROADCAST checks thread_uid
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -n "REPLY_BROADCAST" src/inngest/employee-lifecycle.ts
      2. Assert: both matches contain "thread_uid" (not "superseded_notify_ts")
      3. Run: grep -n "superseded_notify_ts.*REPLY_BROADCAST\|REPLY_BROADCAST.*superseded_notify_ts" src/inngest/employee-lifecycle.ts
      4. Assert: zero matches
    Expected Result: REPLY_BROADCAST condition uses thread_uid
    Failure Indicators: superseded_notify_ts still used for REPLY_BROADCAST
    Evidence: .sisyphus/evidence/task-3-reply-broadcast.txt
  ```

  **Commit**: YES
  - Message: `fix(lifecycle): update trackPendingApproval column names and REPLY_BROADCAST gating`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Build, test, PostgREST verification

  **What to do**:
  - Record baseline: `pnpm test -- --run` (note pass count)
  - Run `pnpm build` — must exit 0
  - Run `pnpm lint` — must pass
  - Run `pnpm test -- --run` — same pass count as baseline
  - Run PostgREST insert test with new column names:
    ```bash
    source .env
    curl -X POST "http://localhost:54331/rest/v1/pending_approvals" \
      -H "Content-Type: application/json" \
      -H "apikey: $SUPABASE_SECRET_KEY" \
      -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
      -H "Prefer: return=representation" \
      -d '{"id":"00000000-0000-0000-0000-000000000099","tenant_id":"00000000-0000-0000-0000-000000000003","thread_uid":"test-schema-sync","task_id":"test","slack_ts":"test","channel_id":"test","recipient_name":"Test Guest","context_label":"Test Property"}'
    ```
    Assert: 201 response with `recipient_name` and `context_label` populated
  - Clean up test row:
    ```bash
    curl -X DELETE "http://localhost:54331/rest/v1/pending_approvals?thread_uid=eq.test-schema-sync" \
      -H "apikey: $SUPABASE_SECRET_KEY" \
      -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
    ```

  **Must NOT do**:
  - Do NOT skip any verification step
  - Do NOT ignore test failures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — after Wave 1)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - Metis QA acceptance criteria (PostgREST curl commands)

  **Acceptance Criteria**:
  - [ ] `pnpm build` exits 0
  - [ ] `pnpm lint` passes
  - [ ] `pnpm test -- --run` passes with same count as baseline
  - [ ] PostgREST insert with new column names returns 201
  - [ ] Test row cleaned up

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compiles cleanly
    Tool: Bash
    Preconditions: All code changes from Tasks 1-3 complete
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: No compilation errors
    Failure Indicators: Non-zero exit code, type errors
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: PostgREST accepts new column names
    Tool: Bash (curl)
    Preconditions: Services running, schema changes applied
    Steps:
      1. Insert test row with recipient_name and context_label via PostgREST
      2. Assert: HTTP 201
      3. Assert: response body contains "recipient_name":"Test Guest" and "context_label":"Test Property"
      4. Delete test row
    Expected Result: PostgREST accepts the new column names without error
    Failure Indicators: HTTP 400 with "Could not find column" or HTTP 409
    Evidence: .sisyphus/evidence/task-4-postgrest-insert.txt

  Scenario: Old column names are rejected
    Tool: Bash (curl)
    Preconditions: Services running
    Steps:
      1. Attempt insert with old column names (guest_name, property_name)
      2. Assert: HTTP 400 (column not found)
    Expected Result: PostgREST rejects the old column names — confirms the columns were truly renamed
    Failure Indicators: HTTP 201 (would mean columns still exist under old names)
    Evidence: .sisyphus/evidence/task-4-old-names-rejected.txt
  ```

  **Commit**: NO (verification only — no files changed)

- [x] 5. Scenario A E2E — full happy path with real Hostfully data

  **What to do**:
  - Follow `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` Scenario A steps 1–7 exactly
  - Use VLRE test resources: Airbnb thread `https://www.airbnb.com/guest/messages/2530903609`, Slack `#cs-guest-communication` (`C0AMGJQN05S`)
  - Include `[e2e-test-{epoch}]` suffix in Airbnb message for dedup
  - **Step 1**: Send message on Airbnb
  - **Step 2**: Confirm task created, "Processing" notify message appears in Slack
  - **Step 3**: Confirm approval card in thread AND at channel level (REPLY_BROADCAST fix). Verify guest name is real (NOT "Test Guest"). Verify `pending_approvals` row has non-null `recipient_name` and `context_label`
  - **Step 4**: Click "✅ Approve & Send"
  - **Step 5**: Confirm rich Done terminal blocks (actor name, property, snippet, timestamp)
  - **Step 6**: Confirm context thread reply (📋 header, guest message, sent response)
  - **Step 7**: Confirm delivery in Airbnb thread, task `Done`, full state machine trace, `pending_approvals` cleaned up

  **Must NOT do**:
  - Do NOT approve if card shows "Test Guest" or "Test Beach House" (fixture data)
  - Do NOT rebuild Docker image during E2E
  - Do NOT modify code during E2E

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Required for Playwright browser automation (Airbnb messaging + Slack interaction)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — after Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md:44-304` — Full Scenario A steps 1-7 with exact commands, selectors, and expected values

  **External References**:
  - Airbnb thread: `https://www.airbnb.com/guest/messages/2530903609`
  - Slack channel: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`

  **WHY Each Reference Matters**:
  - The test guide has exact DB queries, Slack selectors, and expected values for each step — the executor must follow them exactly

  **Acceptance Criteria**:
  - [ ] Task reaches `Done` status
  - [ ] State machine trace: `Received → Ready → Executing → Submitting → Reviewing → Approved → Delivering → Done`
  - [ ] Approval card visible at channel level (not just in thread) — confirms REPLY_BROADCAST
  - [ ] `pending_approvals` row has non-null `recipient_name` and `context_label` during Reviewing state
  - [ ] `pending_approvals` cleaned up (count = 0) after Done
  - [ ] Guest name is real (Olivia), NOT "Test Guest"
  - [ ] Context thread reply posted with all expected sections
  - [ ] Reply delivered to Airbnb thread

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — send message, approve, verify delivery
    Tool: Playwright (dev-browser) + Bash (psql/curl)
    Preconditions: Gateway, Inngest, Socket Mode all healthy. No hostfully_mock in tenant secrets.
    Steps:
      1. Navigate to https://www.airbnb.com/guest/messages/2530903609
      2. Type "Is there air conditioning? [e2e-test-{epoch}]" and click Send
      3. Wait 30s, check gateway logs for "POST /webhooks/hostfully 200"
      4. Query DB: SELECT id, status FROM tasks WHERE raw_event->>'thread_uid' = 'dc2c8f5e-b83d-4078-b709-cc03bf47dd4a' ORDER BY created_at DESC LIMIT 1
      5. Wait for task to reach Reviewing (poll every 15s, max 3 min)
      6. Verify pending_approvals: SELECT recipient_name, context_label FROM pending_approvals WHERE task_id = '<task_id>'
      7. Assert: recipient_name IS NOT NULL AND context_label IS NOT NULL
      8. Navigate to Slack #cs-guest-communication
      9. Find approval card at channel level (not just in thread)
      10. Assert: card shows real guest name (not "Test Guest")
      11. Click "✅ Approve & Send" button
      12. Wait 30s for lifecycle to process
      13. Verify task status = 'Done'
      14. Verify context thread reply exists with "📋 Message Context" header
      15. Verify pending_approvals count = 0
    Expected Result: Full lifecycle completes with real data, approval card at channel level
    Failure Indicators: Task stuck in Reviewing, fixture data shown, card only in thread, PostgREST errors in logs
    Evidence: .sisyphus/evidence/task-5-scenario-a-screenshots/ (multiple screenshots)

  Scenario: State machine trace is complete
    Tool: Bash (psql)
    Preconditions: Task reached Done
    Steps:
      1. Query task_status_log for the task
      2. Assert: trace includes Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Reviewing → Approved → Delivering → Done
    Expected Result: Complete lifecycle without gaps
    Failure Indicators: Missing transitions, unexpected states
    Evidence: .sisyphus/evidence/task-5-state-trace.txt
  ```

  **Commit**: NO (E2E verification only)

- [ ] 6. Notify completion
     Send Telegram notification: plan `pending-approvals-schema-sync` complete, all tasks done, come back to review results.
  ```bash
  tsx scripts/telegram-notify.ts "✅ pending-approvals-schema-sync complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `dev-browser` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| #   | Message                                                                               | Files                                                                        | Pre-commit             |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------- |
| 1   | `fix(schema): align pending_approvals + archetypes with DB state`                     | `prisma/schema.prisma`, `prisma/migrations/20260513064913_.../migration.sql` | `pnpm prisma generate` |
| 2   | `fix(lifecycle): update trackPendingApproval column names and REPLY_BROADCAST gating` | `src/inngest/lib/pending-approvals.ts`, `src/inngest/employee-lifecycle.ts`  | `pnpm build`           |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exit 0
pnpm test -- --run            # Expected: same pass count
pnpm prisma migrate status    # Expected: "up to date"
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Scenario A E2E passes end-to-end
- [ ] Task reaches Done state with full status trace
- [ ] Approval card visible at channel level (REPLY_BROADCAST working)
- [ ] pending_approvals row has recipient_name and context_label populated
