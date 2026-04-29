# GM-11: Message Superseding

## TL;DR

> **Quick Summary**: When a new guest message arrives for a Hostfully conversation that already has a pending Slack approval card, supersede the old card (remove buttons, add "Superseded" banner) and post a new card with full updated context. Lifecycle-based detection using a `pending_approvals` DB table.
>
> **Deliverables**:
>
> - `pending_approvals` Prisma table with PostgREST grants
> - `buildSupersededBlocks()` Slack Block Kit utility
> - `post-message.ts` updated with `--conversation-ref` flag
> - Harness stores `conversation_ref` in deliverable metadata
> - Lifecycle supersede detection + execution logic
> - `action === 'superseded'` handling in lifecycle
> - Pending approvals written on Reviewing entry, cleared on ALL terminal states
> - Updated guest messaging archetype instructions
> - Comprehensive unit + integration tests
> - E2E verification via API endpoints
> - Story map items marked complete
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 6 → Task 8 → Task 10 → F1-F4

---

## Context

### Original Request

Implement GM-11 (Message Superseding) from the Phase 1 story map. When a guest sends a new message for a conversation that already has a pending approval card, the old card should be superseded and a new one posted. Test thoroughly with automated tests and API verification. Mark story map items as complete.

### Interview Summary

**Key Discussions**:

- Race condition strategy: **"Approve wins the race"** — if PM already clicked approve before superseding, let it proceed normally
- Automated tests required using existing Vitest infrastructure (515+ existing tests)
- API endpoint verification for E2E confirmation
- Story map acceptance criteria to be marked `[x]` after verification

**Research Findings**:

- **MVP Pattern** (`/Users/victordozal/repos/real-estate/vlre-employee`): Uses `SlackThreadTracker` class backed by `data/pending-threads.json`, keyed by Hostfully `thread_uid`. On new message for a pending thread: `chat.update` with `buildSupersededBlocks()` replaces all blocks (buttons disappear), new card posted with `thread_ts` for visual continuity. Race condition: last-write-wins (no atomic guard).
- **Platform State**: `deliverables.metadata` stores `{ approval_message_ts, target_channel }`. No `conversation_id` or `thread_uid` exists anywhere in the DB — Hostfully identifiers only in ClassifyResult text. Lifecycle uses `waitForEvent('employee/approval.received')` with match on `data.taskId`. `isTaskAwaitingApproval()` in handlers.ts already guards against clicks on non-Reviewing tasks.
- **Key Integration Point**: Between `check-classification` (line 317) and `set-reviewing` (line 338) in `employee-lifecycle.ts` — the only place where the deliverable is already fetched and classification is known.

### Metis Review

**Identified Gaps** (addressed):

- `threadUid` has no DB path today → pipe through `post-message.ts --conversation-ref` → deliverable metadata
- No `action === 'superseded'` branch in lifecycle → explicit task to add it
- `pending_approvals` must include `tenant_id` → multi-tenancy enforced
- PostgREST grants needed for new table → included in migration
- Cleanup must happen on ALL terminal states (approve/reject/timeout/fail) → not just approve/reject

**Scope Locks** (DO NOT modify):

- `handlers.ts` `isTaskAwaitingApproval()` — already handles stale button clicks correctly
- `create-task-and-dispatch.ts` — task creation is correct as-is
- `guest-message-poller.ts` — don't change `externalId` format
- No threading of new card under old one (not in story map ACs)

---

## Work Objectives

### Core Objective

Implement message superseding so that PMs never approve a response to a guest problem that no longer exists — when a guest sends a follow-up message before the PM acts on the first, the old approval card is replaced and a new one with full context is posted.

### Concrete Deliverables

- New `pending_approvals` Prisma model + migration
- `buildSupersededBlocks()` in `src/lib/slack-blocks.ts`
- Updated `src/worker-tools/slack/post-message.ts` with `--conversation-ref` flag
- Updated `src/workers/opencode-harness.mts` to store `conversation_ref` in metadata
- Updated `src/inngest/employee-lifecycle.ts` with supersede detection + superseded action handling
- Updated guest messaging archetype instructions in `prisma/seed.ts`
- Test files covering all superseding logic
- Story map `docs/2026-04-21-2202-phase1-story-map.md` with GM-11 criteria marked `[x]`

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes (all existing + new tests)
- [ ] New guest message for a pending conversation supersedes the old Slack card
- [ ] Superseded card has no action buttons, shows "Superseded" banner
- [ ] PM approve on old card before superseding still works (race condition)
- [ ] Superseding is scoped to same conversation thread only
- [ ] All 6 story map acceptance criteria marked `[x]`

### Must Have

- `pending_approvals` table with `tenant_id` (multi-tenancy)
- PostgREST grants on new table
- Lifecycle supersede detection between classification check and set-reviewing
- `action === 'superseded'` branch in handle-approval-result
- Pending approval cleanup on ALL terminal states (approve, reject, timeout, fail, supersede)
- Buttons removed from superseded card (full block replacement)
- Unit tests for all new components
- Integration tests for lifecycle supersede flow

### Must NOT Have (Guardrails)

- DO NOT modify `handlers.ts` `isTaskAwaitingApproval()` — it already works
- DO NOT change `create-task-and-dispatch.ts` task creation logic
- DO NOT change `guest-message-poller.ts` `externalId` format
- DO NOT thread new card under old one in Slack (not in ACs)
- DO NOT add `as any` or `@ts-ignore` — use proper typing
- DO NOT add console.log in production code — use existing logger
- DO NOT modify any deprecated components listed in AGENTS.md
- DO NOT use any model other than `minimax/minimax-m2.7` or `anthropic/claude-haiku-4-5`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (bun test)
- **Approach**: Unit tests for utilities + integration tests for lifecycle flow

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB/Migration**: Use Bash (psql) — verify table exists, columns correct, grants applied
- **Utility Functions**: Use Bash (`pnpm test -- --run {file}`) — run specific test files
- **Lifecycle Logic**: Use Bash (`pnpm test -- --run`) — run full test suite
- **Shell Tool**: Use Bash (`tsx src/worker-tools/slack/post-message.ts --help`) — verify CLI flag
- **E2E**: Use Bash (curl admin API) — trigger employee, check task status

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 3 parallel tasks):
├── Task 1: Prisma migration — pending_approvals table + PostgREST grants [quick]
├── Task 2: buildSupersededBlocks() utility + pending approvals DB helpers [quick]
└── Task 3: Update post-message.ts — add --conversation-ref flag [quick]

Wave 2 (Core Logic — 4 parallel tasks, depends on Wave 1):
├── Task 4: Update harness — store conversation_ref in metadata (depends: 3) [quick]
├── Task 5: Lifecycle — add 'superseded' action branch (depends: 2) [unspecified-high]
├── Task 6: Lifecycle — supersede detection + pending_approvals integration (depends: 1, 2, 5) [deep]
└── Task 7: Update guest messaging archetype instructions + seed (depends: 3) [quick]

Wave 3 (Tests + Verification — 3 parallel tasks, depends on Wave 2):
├── Task 8: Unit + integration tests for all superseding components [unspecified-high]
├── Task 9: Docker rebuild + E2E API verification [unspecified-high]
└── Task 10: Mark story map items as complete + Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 6 → Task 8 → Task 9 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 2 & 3)
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 6      | 1     |
| 2     | —          | 5, 6   | 1     |
| 3     | —          | 4, 7   | 1     |
| 4     | 3          | 8, 9   | 2     |
| 5     | 2          | 6      | 2     |
| 6     | 1, 2, 5    | 8, 9   | 2     |
| 7     | 3          | 9      | 2     |
| 8     | 4, 5, 6, 7 | —      | 3     |
| 9     | 4, 5, 6, 7 | —      | 3     |
| 10    | 8, 9       | —      | 3     |
| F1-F4 | ALL        | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **4** — T4 → `quick`, T5 → `unspecified-high`, T6 → `deep`, T7 → `quick`
- **Wave 3**: **3** — T8 → `unspecified-high`, T9 → `unspecified-high`, T10 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma Migration — `pending_approvals` Table + PostgREST Grants

  **What to do**:
  - Create a new Prisma migration adding the `pending_approvals` table:
    ```
    pending_approvals:
      id          String    @id @default(uuid())
      tenant_id   String    (FK to tenants, NOT NULL)
      thread_uid  String    (NOT NULL — Hostfully conversation thread identifier)
      task_id     String    (NOT NULL — Task ID with the pending approval)
      slack_ts    String    (NOT NULL — Slack message timestamp of the approval card)
      channel_id  String    (NOT NULL — Slack channel where card was posted)
      created_at  DateTime  @default(now())
    ```
  - Add UNIQUE constraint on `(tenant_id, thread_uid)` — only one pending approval per conversation per tenant
  - Add index on `tenant_id` for efficient lookup
  - Add SQL in the migration to grant `SELECT, INSERT, UPDATE, DELETE` on `pending_approvals` to `anon` and `authenticated` roles (PostgREST access)
  - Run `npx prisma migrate dev --name add-pending-approvals-table`
  - Run `npx prisma generate` to update the client

  **Must NOT do**:
  - DO NOT modify any existing tables
  - DO NOT add RLS policies (lifecycle uses service key which bypasses RLS)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file schema change + migration, well-established Prisma pattern in codebase
  - **Skills**: []
    - No special skills needed — standard Prisma workflow

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` — Full schema, see existing models (especially `SystemEvent` at the end) for naming conventions, FK patterns, and timestamp defaults
  - `prisma/migrations/` — Existing migrations for SQL grant patterns (look for `GRANT` statements in recent migration files)

  **API/Type References**:
  - `prisma/schema.prisma:SystemEvent` — Most recently added table, follow its exact FK and index patterns

  **External References**:
  - PostgREST requires explicit SQL GRANT on tables for API access — the `anon` role is used by workers via `SUPABASE_SECRET_KEY`

  **WHY Each Reference Matters**:
  - `SystemEvent` model was the last table added (PLAT-03) — its migration has the correct GRANT SQL pattern to copy
  - The `tenant_id` FK pattern on `SystemEvent` shows the exact foreign key constraint syntax used in this project

  **Acceptance Criteria**:
  - [ ] `npx prisma migrate dev` succeeds without errors
  - [ ] `npx prisma generate` succeeds
  - [ ] `pnpm build` exits 0
  - [ ] Table exists in DB: `psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pending_approvals';"` returns all columns
  - [ ] Unique constraint exists: `psql $DATABASE_URL -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'pending_approvals' AND constraint_type = 'UNIQUE';"` returns the constraint
  - [ ] PostgREST grants applied: `psql $DATABASE_URL -c "SELECT grantee, privilege_type FROM information_schema.table_privileges WHERE table_name = 'pending_approvals';"` shows anon + authenticated roles

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Table creation — verify schema
    Tool: Bash (psql)
    Preconditions: Database running on localhost:54322
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'pending_approvals' ORDER BY ordinal_position;"
      2. Assert output contains: id (uuid, NO), tenant_id (uuid, NO), thread_uid (text, NO), task_id (text, NO), slack_ts (text, NO), channel_id (text, NO), created_at (timestamp with time zone, NO)
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'pending_approvals';"
      4. Assert output contains a UNIQUE constraint covering tenant_id + thread_uid
    Expected Result: All 7 columns exist with correct types, unique constraint present
    Failure Indicators: Missing columns, wrong types, no unique constraint
    Evidence: .sisyphus/evidence/task-1-schema-verification.txt

  Scenario: PostgREST access — verify grants
    Tool: Bash (curl)
    Preconditions: Supabase Docker Compose running
    Steps:
      1. Run: curl -s -o /dev/null -w "%{http_code}" "http://localhost:54321/rest/v1/pending_approvals?select=id&limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
      2. Assert HTTP status is 200 (not 401 or 403)
    Expected Result: 200 OK (empty array is fine — table accessible)
    Failure Indicators: 403 Forbidden (missing grants), 404 Not Found (table not exposed)
    Evidence: .sisyphus/evidence/task-1-postgrest-access.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add pending_approvals table for message superseding`
  - Files: `prisma/migrations/*/`, `prisma/schema.prisma`
  - Pre-commit: `pnpm build`

---

- [x] 2. buildSupersededBlocks() Utility + Pending Approvals DB Helpers

  **What to do**:
  - Create `src/lib/slack-blocks.ts` with a `buildSupersededBlocks()` function:

    ```typescript
    import type { KnownBlock } from '@slack/types';

    export function buildSupersededBlocks(): KnownBlock[] {
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '⏭️ *Superseded* — a newer message from this guest is pending review below.\n_This suggested response was not sent._',
          },
        },
      ];
    }
    ```

  - The function returns blocks with NO action buttons — the full block replacement via `chat.update` removes all buttons from the old card
  - Create `src/inngest/lib/pending-approvals.ts` with helper functions for lifecycle use:
    ```typescript
    export async function getPendingApproval(
      supabaseUrl: string,
      supabaseKey: string,
      tenantId: string,
      threadUid: string,
    ): Promise<PendingApproval | null>;
    export async function trackPendingApproval(
      supabaseUrl: string,
      supabaseKey: string,
      data: PendingApprovalData,
    ): Promise<void>;
    export async function clearPendingApproval(
      supabaseUrl: string,
      supabaseKey: string,
      tenantId: string,
      threadUid: string,
    ): Promise<void>;
    export async function clearPendingApprovalByTaskId(
      supabaseUrl: string,
      supabaseKey: string,
      taskId: string,
    ): Promise<void>;
    ```
  - These use raw `fetch()` against PostgREST (same pattern as the lifecycle's existing DB calls)
  - `clearPendingApprovalByTaskId` is needed for terminal states where we have taskId but not threadUid

  **Must NOT do**:
  - DO NOT import Prisma client (lifecycle uses PostgREST, not Prisma directly)
  - DO NOT add heavy dependencies — use native fetch

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small utility files with clear specifications, no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:370-380` — How the lifecycle reads from PostgREST using raw fetch() with SUPABASE_URL + SUPABASE_SECRET_KEY headers — copy this exact fetch pattern for pending-approvals helpers
  - `src/workers/lib/postgrest-client.ts` — PostgREST client patterns (GET/POST/PATCH/DELETE) for reference, but lifecycle uses raw fetch not this client

  **API/Type References**:
  - `@slack/types` — `KnownBlock` type for the block kit return type

  **Test References**:
  - MVP `skills/slack-blocks/blocks.ts:366` — `buildSupersededBlocks()` function to port (exact block structure)

  **WHY Each Reference Matters**:
  - The lifecycle fetch pattern (line 370-380) is critical — all DB helpers must use the exact same auth headers and URL format
  - The MVP's blocks.ts shows the exact Block Kit structure that was battle-tested on VLRE

  **Acceptance Criteria**:
  - [ ] `src/lib/slack-blocks.ts` exports `buildSupersededBlocks()` returning `KnownBlock[]`
  - [ ] `src/inngest/lib/pending-approvals.ts` exports `getPendingApproval`, `trackPendingApproval`, `clearPendingApproval`, `clearPendingApprovalByTaskId`
  - [ ] `pnpm build` exits 0
  - [ ] No type errors in new files

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build passes with new modules
    Tool: Bash
    Preconditions: Code written
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Run: grep -l "buildSupersededBlocks" src/lib/slack-blocks.ts
      4. Assert file contains the export
      5. Run: grep -l "getPendingApproval" src/inngest/lib/pending-approvals.ts
      6. Assert file contains all 4 exports
    Expected Result: Build passes, both files export the correct functions
    Failure Indicators: Type errors, missing exports, import resolution failures
    Evidence: .sisyphus/evidence/task-2-build-verification.txt

  Scenario: Block structure — no action buttons
    Tool: Bash (node REPL)
    Preconditions: Code written
    Steps:
      1. Run: node -e "const {buildSupersededBlocks} = require('./dist/lib/slack-blocks.js'); const blocks = buildSupersededBlocks(); console.log(JSON.stringify(blocks)); const hasActions = blocks.some(b => b.type === 'actions'); console.log('Has actions:', hasActions);"
      2. Assert "Has actions: false"
      3. Assert blocks contain "Superseded" text
    Expected Result: Blocks have section with superseded message, NO actions block
    Failure Indicators: Actions block present, missing superseded text
    Evidence: .sisyphus/evidence/task-2-block-structure.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(slack): add superseded blocks and pending approvals helpers`
  - Files: `src/lib/slack-blocks.ts`, `src/inngest/lib/pending-approvals.ts`
  - Pre-commit: `pnpm build`

---

- [x] 3. Update post-message.ts — Add `--conversation-ref` Flag

  **What to do**:
  - Add `--conversation-ref <string>` optional CLI flag to `src/worker-tools/slack/post-message.ts`
  - When provided, include `conversationRef` in the JSON output alongside `ts` and `channel`:
    ```json
    {
      "ts": "1234567890.000001",
      "channel": "C0XXXXXXXXX",
      "conversationRef": "hostfully-thread-uid"
    }
    ```
  - Update the `--help` output to document the new flag
  - This flag is optional — existing summarizer usage without `--conversation-ref` continues to work (outputs `{ ts, channel }` only)
  - The `conversationRef` is a passthrough value — the tool doesn't validate or use it, just includes it in output

  **Must NOT do**:
  - DO NOT change `buildApprovalBlocks()` — the card structure is unchanged
  - DO NOT make `--conversation-ref` required — it must be optional for backward compatibility
  - DO NOT change the behavior of the Slack API call

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single flag addition to an existing CLI tool, minimal change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-message.ts` — The entire file. Read the existing argument parsing pattern (uses `process.argv` manual parsing or a CLI parser). Add `--conversation-ref` following the same pattern as `--task-id`, `--channel`, `--text`
  - `src/worker-tools/hostfully/get-messages.ts` — Another shell tool with multiple CLI flags — reference for argument parsing pattern

  **WHY Each Reference Matters**:
  - post-message.ts is the file being modified — must understand the exact argument parsing approach before adding a flag
  - get-messages.ts shows how optional flags are handled in other shell tools in this codebase

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/slack/post-message.ts --help` shows `--conversation-ref` in the output
  - [ ] Running with `--conversation-ref "test-ref"` includes `"conversationRef": "test-ref"` in stdout JSON
  - [ ] Running without `--conversation-ref` still works (backward compatible)
  - [ ] `pnpm build` exits 0
  - [ ] Existing post-message tests still pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Help output includes new flag
    Tool: Bash
    Preconditions: Code updated
    Steps:
      1. Run: tsx src/worker-tools/slack/post-message.ts --help 2>&1
      2. Assert output contains "--conversation-ref"
      3. Assert output describes the flag's purpose
    Expected Result: Help text documents the new --conversation-ref flag
    Failure Indicators: Missing flag in help, description unclear
    Evidence: .sisyphus/evidence/task-3-help-output.txt

  Scenario: Backward compatibility — no conversation-ref
    Tool: Bash
    Preconditions: Code updated, mock or dry-run mode if available
    Steps:
      1. Verify the argument parsing code: when --conversation-ref is NOT provided, the output JSON should NOT contain a conversationRef key
      2. Run existing tests: pnpm test -- --run post-message
      3. Assert all existing tests pass
    Expected Result: Existing behavior unchanged when flag is omitted
    Failure Indicators: Tests fail, output format changed when flag absent
    Evidence: .sisyphus/evidence/task-3-backward-compat.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(slack): add --conversation-ref flag to post-message tool`
  - Files: `src/worker-tools/slack/post-message.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Update Harness — Store `conversation_ref` in Deliverable Metadata

  **What to do**:
  - In `src/workers/opencode-harness.mts`, where `/tmp/approval-message.json` is read (lines 211-226):
    - Currently reads `{ ts, channel }` → maps to `approval_message_ts` and `target_channel`
    - Add: if `conversationRef` exists in the JSON, map it to `conversation_ref` in deliverable metadata
    - The metadata object should become: `{ approval_message_ts, target_channel, conversation_ref, ts, channel }`
  - If `conversationRef` is absent (summarizer use case), `conversation_ref` should be omitted from metadata (no null/undefined)

  **Must NOT do**:
  - DO NOT change any other harness behavior
  - DO NOT make conversation_ref required — it's optional
  - DO NOT modify the PostgREST write pattern — just add the field to the existing metadata object

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single field addition to an existing metadata mapping, 3-5 lines of code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Task 3 (post-message.ts must output conversationRef first)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:211-226` — The exact lines where `/tmp/approval-message.json` is read and metadata is constructed. Add `conversation_ref` to this object following the same pattern as `approval_message_ts`
  - `src/workers/opencode-harness.mts:409-419` — Where the deliverable is POSTed to PostgREST with the metadata object

  **WHY Each Reference Matters**:
  - Lines 211-226 are the exact code to modify — the metadata mapping logic
  - Lines 409-419 show that metadata is a JSON blob passed directly to PostgREST — no schema enforcement

  **Acceptance Criteria**:
  - [ ] `pnpm build` exits 0
  - [ ] When `/tmp/approval-message.json` contains `{ "ts": "...", "channel": "...", "conversationRef": "thread-123" }`, the deliverable metadata includes `conversation_ref: "thread-123"`
  - [ ] When `/tmp/approval-message.json` does NOT contain `conversationRef`, metadata remains unchanged (no null key)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build verification
    Tool: Bash
    Preconditions: Code updated
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Grep the compiled output for "conversation_ref" in dist/workers/opencode-harness.mjs
      4. Assert the string is present
    Expected Result: Build passes, compiled output contains conversation_ref mapping
    Failure Indicators: Build fails, mapping not in compiled output
    Evidence: .sisyphus/evidence/task-4-build-verification.txt

  Scenario: Backward compatibility — no conversationRef in JSON
    Tool: Bash (code review)
    Preconditions: Code updated
    Steps:
      1. Read the modified code section
      2. Verify that `conversation_ref` is only added to metadata when `conversationRef` exists in the parsed JSON
      3. Verify no `undefined` or `null` values are added to metadata when field is absent
    Expected Result: Conditional inclusion — field only present when source data exists
    Failure Indicators: Unconditional addition, null/undefined in metadata
    Evidence: .sisyphus/evidence/task-4-backward-compat.txt
  ```

  **Commit**: YES (groups with Tasks 5, 6, 7)
  - Message: `feat(harness): store conversation_ref from approval message in deliverable metadata`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

---

- [x] 5. Lifecycle — Add `action === 'superseded'` Branch to handle-approval-result

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, in the `handle-approval-result` step (lines 351-646):
    - Add a new branch for `action === 'superseded'` alongside the existing `approve` and `reject` branches
    - When superseded:
      1. Log: `"Task superseded by newer message for same conversation"`
      2. Update Slack card: `slackClient.updateMessage(targetChannel, approvalMsgTs, '⏭️ Superseded', buildSupersededBlocks())`
      3. Set task status to `Cancelled` via PostgREST PATCH
      4. Clear pending approval entry: `clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId)`
      5. Return (no delivery machine, no further processing)
  - Import `buildSupersededBlocks` from `src/lib/slack-blocks.ts`
  - Import `clearPendingApprovalByTaskId` from `src/inngest/lib/pending-approvals.ts`
  - The `data` payload for superseded events: `{ taskId, action: 'superseded', userId: 'system', userName: 'System (superseded)' }`

  **Must NOT do**:
  - DO NOT modify the existing `approve` or `reject` branches
  - DO NOT change the `waitForEvent` match pattern
  - DO NOT modify `isTaskAwaitingApproval()` in handlers.ts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Modifying the core lifecycle orchestrator requires careful understanding of the state machine
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2 (needs buildSupersededBlocks and clearPendingApprovalByTaskId)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:351-646` — The entire `handle-approval-result` step. Read ALL of it. The new `superseded` branch goes alongside the existing `approve` (line ~413) and `reject` (line ~630) branches
  - `src/inngest/employee-lifecycle.ts:380-390` — How the lifecycle calls `slackClient.updateMessage()` — copy this exact pattern for the superseded update
  - `src/inngest/employee-lifecycle.ts:630-646` — The `reject` branch — structurally similar to what `superseded` needs (update card, set Cancelled, return)

  **API/Type References**:
  - `src/lib/slack-blocks.ts:buildSupersededBlocks` — The Block Kit function created in Task 2
  - `src/inngest/lib/pending-approvals.ts:clearPendingApprovalByTaskId` — The cleanup function created in Task 2

  **WHY Each Reference Matters**:
  - Lines 351-646 is the code being modified — the entire handle-approval-result step must be understood
  - The reject branch (line 630-646) is the closest structural match for superseded — both update Slack, set Cancelled, return
  - The Slack updateMessage pattern (line 380-390) must be copied exactly

  **Acceptance Criteria**:
  - [ ] `action === 'superseded'` branch exists in handle-approval-result
  - [ ] Branch calls `slackClient.updateMessage` with `buildSupersededBlocks()`
  - [ ] Branch sets task status to `Cancelled`
  - [ ] Branch clears pending approval entry
  - [ ] `pnpm build` exits 0
  - [ ] Existing approve/reject behavior unchanged

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build passes with new branch
    Tool: Bash
    Preconditions: Code updated
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Grep for "superseded" in src/inngest/employee-lifecycle.ts
      4. Assert the string appears in the handle-approval-result step
    Expected Result: Build passes, superseded branch exists
    Failure Indicators: Type errors, syntax issues, missing imports
    Evidence: .sisyphus/evidence/task-5-build-verification.txt

  Scenario: Existing branches unmodified
    Tool: Bash (code review)
    Preconditions: Code updated
    Steps:
      1. Run: git diff src/inngest/employee-lifecycle.ts
      2. Verify the approve and reject branches have NO modifications (only additions)
      3. Verify the new branch is structurally similar to reject (update card, set cancelled, return)
    Expected Result: Only additions, no modifications to existing logic
    Failure Indicators: Changes to approve/reject code paths
    Evidence: .sisyphus/evidence/task-5-diff-review.txt
  ```

  **Commit**: YES (groups with Tasks 4, 6, 7)
  - Message: `feat(lifecycle): add superseded action branch for message superseding`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

- [x] 6. Lifecycle — Supersede Detection + Pending Approvals Integration

  **What to do**:
  This is the core task. Add three pieces to `src/inngest/employee-lifecycle.ts`:

  **A) Supersede Detection Step** (new step between `check-classification` and `set-reviewing`):
  - After the classification check determines `NEEDS_APPROVAL`, but BEFORE setting Reviewing:
  - Read `conversation_ref` from `deliverable.metadata.conversation_ref`
  - If `conversation_ref` exists, query `pending_approvals` for the same `tenant_id` + `thread_uid`:
    ```typescript
    const pending = await getPendingApproval(supabaseUrl, supabaseKey, tenantId, conversationRef);
    ```
  - If `pending` exists AND `pending.task_id !== currentTaskId`:
    1. Check old task is still in Reviewing: `GET /rest/v1/tasks?id=eq.{pending.task_id}&select=status`
    2. If still Reviewing ("approve wins the race" — only supersede if old task hasn't been acted on):
       - Update old Slack card: `slackClient.updateMessage(pending.channel_id, pending.slack_ts, '⏭️ Superseded', buildSupersededBlocks())`
       - Fire `employee/approval.received` event for old task with `action: 'superseded'` to unblock old lifecycle
       - Log: `"Superseded task {pending.task_id} for conversation {conversationRef}"`
    3. If NOT Reviewing (PM already acted): just clear the stale pending_approvals entry
  - If `conversation_ref` is null/undefined (e.g., summarizer tasks): skip superseding entirely

  **B) Write Pending Approval on Reviewing Entry**:
  - After setting task to Reviewing, write to `pending_approvals`:
    ```typescript
    await trackPendingApproval(supabaseUrl, supabaseKey, {
      tenantId,
      threadUid: conversationRef,
      taskId,
      slackTs: approvalMsgTs,
      channelId: targetChannel,
    });
    ```
  - Only write if `conversationRef` exists

  **C) Clear Pending Approval on ALL Terminal States**:
  - On approve → clear by taskId
  - On reject → clear by taskId
  - On timeout → clear by taskId
  - On superseded → clear by taskId (handled in Task 5)
  - On any failure → clear by taskId
  - Use `clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId)` in each terminal path

  **Must NOT do**:
  - DO NOT modify `handlers.ts` — `isTaskAwaitingApproval()` already handles stale clicks
  - DO NOT change `create-task-and-dispatch.ts`
  - DO NOT thread new card under old one (not in ACs)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex task — touches multiple lifecycle steps, requires understanding the full state machine, involves race condition handling and Inngest event firing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 5 completing first for the superseded branch)
  - **Parallel Group**: Wave 2 (sequential after Task 5)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 1, 2, 5

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:290-340` — The `check-classification` step → this is WHERE the new supersede-detection step goes (immediately after, before `set-reviewing` at line 338)
  - `src/inngest/employee-lifecycle.ts:338-348` — The `set-reviewing` step → pending_approvals write goes AFTER the status PATCH
  - `src/inngest/employee-lifecycle.ts:344-348` — How `inngest.send()` fires events → copy this pattern for firing `employee/approval.received` with `action: 'superseded'`
  - `src/inngest/employee-lifecycle.ts:370-380` — How deliverable metadata is read (approval_message_ts, target_channel) → read conversation_ref the same way
  - `src/inngest/employee-lifecycle.ts:630-646` — Terminal state handling in reject branch → add clearPendingApproval calls alongside existing cleanup

  **API/Type References**:
  - `src/inngest/lib/pending-approvals.ts` — All helper functions (Task 2)
  - `src/lib/slack-blocks.ts:buildSupersededBlocks` — Block Kit function (Task 2)

  **WHY Each Reference Matters**:
  - Lines 290-340 define the exact insertion point for supersede detection
  - Lines 338-348 show the set-reviewing step where tracking begins
  - Lines 344-348 show the inngest.send() pattern needed to fire the superseded event
  - Lines 370-380 show how to read deliverable metadata — conversation_ref follows the same pattern
  - Lines 630-646 show all existing terminal cleanup paths that need clearPendingApproval added

  **Acceptance Criteria**:
  - [ ] Supersede detection step exists between classification check and set-reviewing
  - [ ] Detection queries `pending_approvals` by `tenant_id` + `thread_uid`
  - [ ] When pending found AND old task still Reviewing: old Slack card updated + superseded event fired
  - [ ] When pending found BUT old task already acted on: stale entry cleared, no supersede
  - [ ] When no conversation_ref: superseding skipped entirely
  - [ ] Pending approval written to DB after entering Reviewing
  - [ ] Pending approval cleared on ALL terminal states (approve, reject, timeout, fail, supersede)
  - [ ] `pnpm build` exits 0

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Happy path — supersede detection works
    Tool: Bash (pnpm test)
    Preconditions: All code from Tasks 1-6 complete
    Steps:
      1. Run: pnpm test -- --run
      2. Assert all tests pass
      3. Review the new lifecycle code for the supersede-detection step
      4. Verify it reads conversation_ref from deliverable.metadata
      5. Verify it queries pending_approvals
      6. Verify it fires employee/approval.received with action: 'superseded'
    Expected Result: Build + tests pass, supersede detection logic present
    Failure Indicators: Test failures, missing detection step, wrong event payload
    Evidence: .sisyphus/evidence/task-6-build-and-tests.txt

  Scenario: Race condition — approve wins
    Tool: Bash (code review)
    Preconditions: Code updated
    Steps:
      1. Read the supersede detection code
      2. Verify it checks old task status BEFORE superseding
      3. Verify if old task status !== 'Reviewing', it only clears the stale entry (no supersede)
      4. Confirm no error is thrown if old task was already approved
    Expected Result: Old task that's already been approved is not superseded
    Failure Indicators: Superseding attempted on non-Reviewing tasks
    Evidence: .sisyphus/evidence/task-6-race-condition-review.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5, 7)
  - Message: `feat(lifecycle): implement message superseding detection and pending approval tracking`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build && pnpm test -- --run`

---

- [x] 7. Update Guest Messaging Archetype Instructions + Seed

  **What to do**:
  - In `prisma/seed.ts`, find the guest messaging archetype instructions for VLRE
  - Update the instructions section where `post-message.ts` is called to include `--conversation-ref`:
    - The instructions should tell the LLM: "When posting an approval card for a guest message, include the Hostfully thread UID as the conversation ref"
    - Example instruction addition: `"When calling tsx /tools/slack/post-message.ts, include --conversation-ref with the Hostfully threadUid from your classification result"`
  - Run `npx prisma db seed` to verify the seed works

  **Must NOT do**:
  - DO NOT change the system_prompt — only instructions
  - DO NOT change the classification behavior or categories
  - DO NOT modify any other archetype (summarizer, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text edit in seed file, no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3 (post-message.ts must have the flag first)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Find the guest messaging archetype(s) for VLRE. Search for `guest-messaging` slug. The `instructions` field is a large text block telling the LLM what tools to call and how
  - `src/worker-tools/slack/post-message.ts` — The `--help` output (after Task 3 updates it) documents `--conversation-ref` — reference this in the instruction text

  **WHY Each Reference Matters**:
  - The seed.ts guest messaging archetype instructions tell the LLM how to use each shell tool — the --conversation-ref flag must be documented here for the LLM to use it
  - Understanding the full instructions text is needed to find the right insertion point

  **Acceptance Criteria**:
  - [ ] Guest messaging archetype instructions mention `--conversation-ref`
  - [ ] Instructions tell the LLM to pass the Hostfully threadUid
  - [ ] `npx prisma db seed` succeeds without errors
  - [ ] No other archetypes modified

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Seed runs successfully
    Tool: Bash
    Preconditions: Code updated, DB running
    Steps:
      1. Run: npx prisma db seed
      2. Assert exit code 0
      3. Query DB: psql $DATABASE_URL -c "SELECT instructions FROM archetypes WHERE role_name = 'guest-messaging' LIMIT 1;" | grep "conversation-ref"
      4. Assert the instructions contain the --conversation-ref flag reference
    Expected Result: Seed succeeds, instructions updated
    Failure Indicators: Seed fails, instructions don't mention --conversation-ref
    Evidence: .sisyphus/evidence/task-7-seed-verification.txt

  Scenario: No other archetypes affected
    Tool: Bash
    Preconditions: Seed applied
    Steps:
      1. Run: git diff prisma/seed.ts
      2. Assert only the guest-messaging archetype instructions changed
      3. Verify daily-summarizer instructions are untouched
    Expected Result: Only guest-messaging instructions modified
    Failure Indicators: Changes to summarizer or other archetypes
    Evidence: .sisyphus/evidence/task-7-diff-review.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5, 6)
  - Message: `feat(instructions): add --conversation-ref to guest messaging archetype`
  - Files: `prisma/seed.ts`
  - Pre-commit: `npx prisma db seed`

- [x] 8. Unit + Integration Tests for All Superseding Components

  **What to do**:
  - Create test files for all new components:

  **A) `tests/lib/slack-blocks.test.ts`** — Unit tests for `buildSupersededBlocks()`:
  - Returns an array of blocks
  - Contains no `actions` block (buttons removed)
  - Contains section with "Superseded" text
  - Returns valid `KnownBlock[]` type

  **B) `tests/inngest/lib/pending-approvals.test.ts`** — Unit tests for DB helpers (mock PostgREST):
  - `getPendingApproval`: returns null when not found, returns data when found
  - `trackPendingApproval`: POSTs correct data to PostgREST
  - `clearPendingApproval`: DELETEs by tenant_id + thread_uid
  - `clearPendingApprovalByTaskId`: DELETEs by task_id
  - Handles PostgREST errors gracefully

  **C) `tests/inngest/lifecycle-supersede.test.ts`** — Integration tests for lifecycle superseding:
  - **Happy path**: New message for conversation with pending approval → old card superseded, new card posted
  - **Race condition**: Old task already approved → no supersede, stale entry cleared
  - **No conversation_ref**: Task without conversation_ref → superseding skipped entirely
  - **Same-thread-only**: Tasks for different threads → no superseding
  - **Terminal cleanup**: Pending approval cleared on approve, reject, timeout, fail, supersede
  - **Superseded event payload**: `employee/approval.received` fired with correct `action: 'superseded'`, `taskId`, `userId: 'system'`

  **D) `tests/worker-tools/slack/post-message-conversation-ref.test.ts`** — Tests for --conversation-ref flag:
  - Flag present → included in JSON output
  - Flag absent → not in JSON output (backward compat)

  **Must NOT do**:
  - DO NOT modify existing test files
  - DO NOT skip testing race condition scenario
  - DO NOT use `as any` to bypass type errors in tests — use proper mocking

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, integration testing with mocks, race condition scenarios require careful setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `tests/inngest/employee-lifecycle.test.ts` — Existing lifecycle tests. Follow the exact mocking pattern for `step`, `inngest`, `slackClient`, and PostgREST fetch calls
  - `tests/worker-tools/slack/post-message.test.ts` — Existing post-message tests. Follow the mock server pattern for Slack API
  - `tests/inngest/lib/create-task-and-dispatch.test.ts` — Tests for another inngest lib utility. Follow the PostgREST mocking pattern
  - `tests/lib/classify-message.test.ts` — Tests for the classify message parser — follow the test structure

  **Test References**:
  - `vitest.config.ts` — Test configuration, test DB setup, environment variables

  **WHY Each Reference Matters**:
  - employee-lifecycle.test.ts is the gold standard for lifecycle test patterns in this codebase — mock setup, step simulation, assertion patterns
  - post-message.test.ts shows how to mock the Slack Web API for shell tool tests
  - create-task-and-dispatch.test.ts shows the PostgREST mocking approach used for inngest lib utilities

  **Acceptance Criteria**:
  - [ ] All 4 test files created and pass
  - [ ] `pnpm test -- --run` passes (all existing + new tests)
  - [ ] Race condition scenario tested (old task already approved → no supersede)
  - [ ] Same-thread-only scenario tested (different threads → no supersede)
  - [ ] Terminal cleanup tested for all 5 states
  - [ ] At least 15 test cases total across all files

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: All test files created
    Steps:
      1. Run: pnpm test -- --run tests/lib/slack-blocks.test.ts
      2. Assert all tests pass
      3. Run: pnpm test -- --run tests/inngest/lib/pending-approvals.test.ts
      4. Assert all tests pass
      5. Run: pnpm test -- --run tests/inngest/lifecycle-supersede.test.ts
      6. Assert all tests pass
      7. Run: pnpm test -- --run tests/worker-tools/slack/post-message-conversation-ref.test.ts
      8. Assert all tests pass
    Expected Result: All 4 test files pass with 15+ test cases
    Failure Indicators: Any test failure, missing test scenarios
    Evidence: .sisyphus/evidence/task-8-test-results.txt

  Scenario: Full test suite regression check
    Tool: Bash
    Preconditions: All code complete
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert no new failures (pre-existing failures: container-boot.test.ts, inngest-serve.test.ts are known)
      3. Count total passing tests — should be > 515 (existing) + 15 (new)
    Expected Result: 530+ passing tests, no new failures
    Failure Indicators: Test count decreased, new failures in unrelated files
    Evidence: .sisyphus/evidence/task-8-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(superseding): add unit and integration tests for GM-11 message superseding`
  - Files: `tests/lib/slack-blocks.test.ts`, `tests/inngest/lib/pending-approvals.test.ts`, `tests/inngest/lifecycle-supersede.test.ts`, `tests/worker-tools/slack/post-message-conversation-ref.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 9. Docker Rebuild + E2E API Verification

  **What to do**:
  - **Docker rebuild** (required because `post-message.ts` was modified — a worker tool):
    ```bash
    docker build -t ai-employee-worker:latest .
    ```
  - **API verification** — Use the admin API to verify the system works end-to-end:
    1. Verify the `pending_approvals` table is accessible via PostgREST
    2. Verify the build and tests pass after all changes
    3. Verify `post-message.ts --help` in the Docker container shows `--conversation-ref`
    4. Verify the seed was applied and guest-messaging instructions mention conversation-ref
  - Run all verification commands and capture evidence

  **Must NOT do**:
  - DO NOT push the Docker image to any registry
  - DO NOT trigger actual E2E (would require Fly.io + Slack + Hostfully)
  - DO NOT modify any code in this task — only verify

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Docker build + multiple verification steps + evidence capture
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `Dockerfile` — The Docker build context. Verify it copies `src/worker-tools/slack/post-message.ts` to `/tools/slack/post-message.ts`
  - AGENTS.md section "CRITICAL — Rebuild after every worker change" — confirms Docker rebuild is required

  **WHY Each Reference Matters**:
  - The Dockerfile determines where tools end up in the container — verify the path
  - AGENTS.md confirms the rebuild requirement and the correct image tag

  **Acceptance Criteria**:
  - [ ] `docker build -t ai-employee-worker:latest .` exits 0
  - [ ] `docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/slack/post-message.ts --help` shows `--conversation-ref`
  - [ ] `pnpm build` exits 0
  - [ ] `pnpm test -- --run` passes
  - [ ] PostgREST query to `pending_approvals` returns 200

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker image builds and tool works
    Tool: Bash (tmux for Docker build)
    Preconditions: All code changes complete
    Steps:
      1. Run in tmux: docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/docker-build.log; echo 'EXIT_CODE:'$? >> /tmp/docker-build.log
      2. Poll: grep "EXIT_CODE:" /tmp/docker-build.log — wait for completion
      3. Assert EXIT_CODE:0
      4. Run: docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/slack/post-message.ts --help
      5. Assert output contains "--conversation-ref"
    Expected Result: Docker builds, tool accessible with new flag
    Failure Indicators: Build failure, tool not found, flag missing
    Evidence: .sisyphus/evidence/task-9-docker-verification.txt

  Scenario: Full build + test pass
    Tool: Bash
    Preconditions: All code complete
    Steps:
      1. Run: pnpm build && echo "BUILD_OK" || echo "BUILD_FAIL"
      2. Assert BUILD_OK
      3. Run: pnpm test -- --run 2>&1 | tail -5
      4. Assert all tests pass
    Expected Result: Build and tests green
    Failure Indicators: Build errors, test failures
    Evidence: .sisyphus/evidence/task-9-build-test.txt
  ```

  **Commit**: NO (verification only, no code changes)

---

- [x] 10. Mark Story Map Items as Complete + Telegram Notification

  **What to do**:
  - Open `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the GM-11 acceptance criteria section (around line 774-779)
  - Change all 6 `- [ ]` to `- [x]`:
    ```
    - [x] When a new guest message arrives for a conversation that has a pending (unacted) approval card, the old card is superseded
    - [x] Superseded card is visually updated in Slack (e.g., strikethrough or "Superseded - see latest" banner) so PMs scrolling up aren't confused
    - [x] New approval card contains the full updated conversation context (including the new message)
    - [x] Superseded card's action buttons are disabled (clicking Approve on a stale card does nothing)
    - [x] If the PM already approved the old card before superseding, the approval proceeds normally (race condition handled)
    - [x] Superseding only applies within the same conversation thread, not across different guests
    ```
  - Send Telegram notification:
    ```bash
    tsx scripts/telegram-notify.ts "✅ GM-11 Message Superseding complete — all tasks done, come back to review results."
    ```

  **Must NOT do**:
  - DO NOT modify any other story's acceptance criteria
  - DO NOT change the story description or attributes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text replacement in markdown file + one script call
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run after Tasks 8, 9 confirm everything works)
  - **Parallel Group**: Wave 3 (sequential after Tasks 8, 9)
  - **Blocks**: None
  - **Blocked By**: Tasks 8, 9

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:774-779` — The GM-11 acceptance criteria lines to modify
  - `scripts/telegram-notify.ts` — Telegram notification script (per AGENTS.md Prometheus rule 2)

  **WHY Each Reference Matters**:
  - Exact line numbers for the acceptance criteria ensure the right checkboxes are modified
  - Telegram notification is mandatory per AGENTS.md planning rules

  **Acceptance Criteria**:
  - [ ] All 6 GM-11 acceptance criteria changed from `- [ ]` to `- [x]`
  - [ ] No other stories modified
  - [ ] Telegram notification sent successfully

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Story map updated correctly
    Tool: Bash (grep)
    Preconditions: Story map edited
    Steps:
      1. Grep for "GM-11" section in the story map
      2. Count unchecked boxes: grep -c "\- \[ \]" in the GM-11 section
      3. Assert count is 0
      4. Count checked boxes: grep -c "\- \[x\]" in the GM-11 section
      5. Assert count is 6
    Expected Result: All 6 criteria marked complete
    Failure Indicators: Any unchecked boxes remain, wrong count
    Evidence: .sisyphus/evidence/task-10-story-map.txt

  Scenario: No other stories modified
    Tool: Bash
    Preconditions: Story map edited
    Steps:
      1. Run: git diff docs/2026-04-21-2202-phase1-story-map.md
      2. Assert only GM-11 section has changes (lines ~774-779)
      3. Assert no other "- [ ]" → "- [x]" changes outside GM-11
    Expected Result: Changes scoped to GM-11 only
    Failure Indicators: Changes in other story sections
    Evidence: .sisyphus/evidence/task-10-diff-review.txt
  ```

  **Commit**: YES
  - Message: `docs(story-map): mark GM-11 message superseding acceptance criteria as complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (superseding working end-to-end). Test edge cases: rapid messages, concurrent approvals. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After     | Message                                                                   | Files                                                                                     | Pre-commit                         |
| --------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| Task 1    | `feat(db): add pending_approvals table for message superseding`           | `prisma/migrations/*/`, `prisma/schema.prisma`                                            | `pnpm build`                       |
| Tasks 2-3 | `feat(slack): add superseded blocks and conversation-ref to post-message` | `src/lib/slack-blocks.ts`, `src/worker-tools/slack/post-message.ts`                       | `pnpm build`                       |
| Tasks 4-7 | `feat(lifecycle): implement message superseding detection and handling`   | `src/workers/opencode-harness.mts`, `src/inngest/employee-lifecycle.ts`, `prisma/seed.ts` | `pnpm build && pnpm test -- --run` |
| Tasks 8-9 | `test(superseding): add unit and integration tests for GM-11`             | `tests/`                                                                                  | `pnpm test -- --run`               |
| Task 10   | `docs(story-map): mark GM-11 acceptance criteria as complete`             | `docs/2026-04-21-2202-phase1-story-map.md`                                                | —                                  |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exits 0
pnpm test -- --run            # Expected: all pass (existing + new)
pnpm lint                     # Expected: exits 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] `pending_approvals` table exists with correct columns and grants
- [ ] Superseded card has no buttons and shows banner
- [ ] Race condition handled (approve wins)
- [ ] Same-thread-only scoping enforced
- [ ] Story map GM-11 criteria all marked `[x]`
