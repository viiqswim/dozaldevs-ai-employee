# PLAT-05: Unify Delivery Path — Always Fly.io Machine

## TL;DR

> **Quick Summary**: Refactor the employee lifecycle so delivery ALWAYS runs inside a Fly.io machine (no inline `slackClient.postMessage()`). Add `delivery_instructions` field to archetypes, introduce `EMPLOYEE_PHASE=delivery` env var, remove `DELIVERY_MODE` and `DELIVERY_MACHINE_ENABLED` from the codebase entirely. Write comprehensive tests for the universal lifecycle's delivery flow.
>
> **Deliverables**:
>
> - Prisma migration adding `delivery_instructions` column to `archetypes`
> - Harness `runDeliveryPhase()` function for delivery-mode execution
> - Lifecycle refactored to single delivery path with retry (up to 2 retries)
> - All 3 archetype seeds updated with `delivery_instructions`
> - `DELIVERY_MODE` and `DELIVERY_MACHINE_ENABLED` completely removed
> - Comprehensive tests for lifecycle delivery + harness delivery phase
> - E2E verification via admin API
> - Story map PLAT-05 items marked complete
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 3/4 → Task 6/7/8 → Task 10

---

## Context

### Original Request

Implement PLAT-05 from the Phase 1 story map: unify the delivery path so the lifecycle always spawns a Fly.io machine for delivery after approval. Test thoroughly with automated tests and admin API endpoint verification. Mark story map items as completed.

### Interview Summary

**Key Discussions**:

- **Test strategy**: Tests-after (implement first, then comprehensive test suite)
- **Delivery mode signal**: `EMPLOYEE_PHASE=delivery` env var — lifecycle sets, harness reads `delivery_instructions` instead of `instructions`
- **E2E verification**: Both automated unit/integration tests AND live admin API trigger-and-verify
- **Approval message update**: Lifecycle handles (before spawning delivery machine), NOT the delivery machine
- **Retry semantics**: Lifecycle spawns up to 3 delivery machines total (1 initial + 2 retries)

**Research Findings**:

- `employee-lifecycle.ts` has ZERO test coverage — only deprecated lifecycle has tests
- Harness is stateless w.r.t. delivery — `DELIVERY_MODE` only in archetype instructions (natural language)
- `poll-completion.ts` from `src/inngest/lib/` is NOT used by the lifecycle (lifecycle has inline polling)
- 5 files reference the env vars: lifecycle (lines 375, 393), seed (lines 392, 407, 433), test (line 92), 2 docs
- Harness uses `archetypes(*)` wildcard — new columns auto-available in query results
- Migration pattern: simple `ALTER TABLE` matching recent `agents_md` migration
- Deliverables table stores `content`, `metadata` (approval_message_ts, target_channel, blocks)

### Metis Review

**Identified Gaps** (all addressed in plan):

- **Delivery machine completion contract**: Delivery machine patches task to `Done` directly (not `Submitting`). Lifecycle polls for `Done`/`Failed`.
- **Execution/deliverable record creation**: Delivery machine MUST NOT create new `executions` or `deliverables` records — it reads the existing deliverable.
- **No-approval path**: `approval_required: false` archetypes skip delivery entirely — leave as-is (out of scope).
- **Null guard**: If `delivery_instructions` is null on an approval-required archetype, mark task `Failed` with descriptive error.
- **Retry implementation**: Lifecycle spawns up to 3 delivery machines sequentially (1 initial + 2 retries) with 5-minute poll per attempt.
- **Dead code cleanup**: Remove `summaryContent`/`summaryBlocks` variables if they become dead after PATH B removal (keep if still used by approval message update logic).
- **SlackClient preservation**: `slackClient.updateMessage()` stays for approval card update; only `slackClient.postMessage()` delivery is removed.

---

## Work Objectives

### Core Objective

Consolidate the two delivery paths (inline Slack + conditional Fly.io machine) into a single, universal Fly.io-machine-based delivery path for all employee archetypes.

### Concrete Deliverables

- `prisma/migrations/{timestamp}_add_delivery_instructions_to_archetypes/migration.sql`
- Updated `prisma/schema.prisma` with `delivery_instructions` field
- Updated `src/workers/opencode-harness.mts` with `runDeliveryPhase()` function
- Refactored `src/inngest/employee-lifecycle.ts` with unified delivery path + retry
- Updated `prisma/seed.ts` with `delivery_instructions` on all 3 archetypes
- Updated `tests/gateway/seed-guest-messaging.test.ts`
- New test file(s) for lifecycle delivery flow and harness delivery phase
- Updated `docs/2026-04-24-1452-current-system-state.md`
- Updated `docs/2026-04-21-2202-phase1-story-map.md` (PLAT-05 checkboxes marked)

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes (excluding pre-existing failures)
- [ ] `grep -r "DELIVERY_MACHINE_ENABLED\|DELIVERY_MODE" src/ prisma/ .env.example` returns zero matches
- [ ] `grep -n "postMessage" src/inngest/employee-lifecycle.ts` returns zero matches
- [ ] All PLAT-05 acceptance criteria in story map marked `[x]`

### Must Have

- Lifecycle always spawns a Fly.io machine for delivery after approval
- Delivery machine reads approved content from `deliverables` table
- Each archetype has `delivery_instructions` field (nullable text)
- Summarizer delivery instructions reference `tsx /tools/slack/post-message.ts`
- Guest messaging delivery instructions reference `tsx /tools/hostfully/send-message.ts`
- `DELIVERY_MODE` and `DELIVERY_MACHINE_ENABLED` completely removed
- Lifecycle polls delivery machine and retries up to 2 times on failure
- Delivery machine patches task to `Done` on success (NOT `Submitting`)
- Delivery machine does NOT create new `executions` or `deliverables` records
- Null `delivery_instructions` guard: mark task `Failed` with error message

### Must NOT Have (Guardrails)

- Must NOT modify deprecated files: `src/inngest/lifecycle.ts`, `src/inngest/redispatch.ts`, `src/inngest/watchdog.ts`, or `src/workers/lib/` (except as needed)
- Must NOT modify the `approval_required: false` path (lines 277–293 of lifecycle)
- Must NOT remove `slackClient.updateMessage()` — only remove `slackClient.postMessage()` delivery call
- Must NOT remove `slackClient` import from lifecycle (still used for approval message update)
- Must NOT add retry logic inside the delivery machine itself — retry is lifecycle-level only
- Must NOT change `FLY_SUMMARIZER_APP` env var or its fallback logic (out of scope)
- Must NOT update `docs/2026-04-14-0104-full-system-vision.md` (out of scope — only update `2026-04-24-1452-current-system-state.md`)
- Must NOT create QA scenarios requiring manual Slack checks — all verification via API, DB query, or log grep
- Must NOT add excessive comments, over-abstractions, or generic variable names (AI slop)
- Must NOT use any LLM model other than `minimax/minimax-m2.7` or `anthropic/claude-haiku-4-5` in any code

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest with `@inngest/test`)
- **Automated tests**: Tests-after (implement first, write comprehensive tests after)
- **Framework**: Vitest (`pnpm test -- --run`)
- **Pattern**: `InngestTestEngine` + `mockCtx` for Inngest functions; `vi.mock()` + `vi.stubGlobal('fetch', ...)` for unit tests

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Schema/Migration**: Use Bash (psql, prisma) — verify column exists, seed applies
- **Backend/Lifecycle**: Use Bash (pnpm test, grep) — verify tests pass, code patterns correct
- **E2E**: Use Bash (curl, jq) — trigger via admin API, poll status, verify delivery
- **Cleanup**: Use Bash (grep) — verify env vars removed, no stale references

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Prisma migration + schema + generate [quick]
└── Task 2: Harness ArchetypeRow interface + EMPLOYEE_PHASE skeleton [quick]

Wave 2 (After Wave 1 — core implementation, MAX PARALLEL):
├── Task 3: Harness runDeliveryPhase() function [deep]
├── Task 4: Lifecycle refactor — unified delivery path + retry [deep]
└── Task 5: Seed update — delivery_instructions + remove DELIVERY_MODE [quick]

Wave 3 (After Wave 2 — tests + cleanup, MAX PARALLEL):
├── Task 6: Write lifecycle delivery tests [unspecified-high]
├── Task 7: Write harness delivery phase tests [unspecified-high]
└── Task 8: Cleanup — remove env vars, update existing test, update docs [quick]

Wave 4 (After Wave 3 — verification):
├── Task 9: Build verification + Docker rebuild [quick]
├── Task 10: E2E admin API trigger + verify delivery [deep]
└── Task 11: Update story map + Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3/4 → Task 6/7/8 → Task 10 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Waves 2 & 3)
```

### Dependency Matrix

| Task  | Depends On | Blocks  | Wave  |
| ----- | ---------- | ------- | ----- |
| 1     | —          | 3, 4, 5 | 1     |
| 2     | —          | 3       | 1     |
| 3     | 1, 2       | 7, 8    | 2     |
| 4     | 1          | 6, 8    | 2     |
| 5     | 1          | 7, 8    | 2     |
| 6     | 4          | 9       | 3     |
| 7     | 3, 5       | 9       | 3     |
| 8     | 3, 4, 5    | 9       | 3     |
| 9     | 6, 7, 8    | 10      | 4     |
| 10    | 9          | 11      | 4     |
| 11    | 10         | F1-F4   | 4     |
| F1-F4 | 11         | —       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **3** — T3 → `deep`, T4 → `deep`, T5 → `quick`
- **Wave 3**: **3** — T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `quick`
- **Wave 4**: **3** — T9 → `quick`, T10 → `deep`, T11 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma Migration — Add `delivery_instructions` to Archetypes

  **What to do**:
  - Add `delivery_instructions String? @db.Text` to the `Archetype` model in `prisma/schema.prisma` (after `agents_md` field)
  - Run `npx prisma migrate dev --name add_delivery_instructions_to_archetypes` to generate the migration
  - Run `npx prisma generate` to update the Prisma client types
  - Verify the migration SQL is a simple `ALTER TABLE "archetypes" ADD COLUMN "delivery_instructions" TEXT;`

  **Must NOT do**:
  - Do NOT add a default value — field is nullable
  - Do NOT modify any other model or field
  - Do NOT run `prisma migrate deploy` (dev is correct for creating the migration)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit + CLI command — straightforward schema change
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — simple Prisma operation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/migrations/20260423060515_add_agents_md_to_archetypes/migration.sql` — exact migration pattern to follow (nullable TEXT column add)
  - `prisma/schema.prisma:199-229` — current Archetype model definition, add new field after `agents_md`

  **WHY Each Reference Matters**:
  - The agents_md migration is the most recent column addition to archetypes — copy its pattern exactly for consistency
  - The schema file shows exact placement and type annotation (`@db.Text`) to match

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration creates delivery_instructions column
    Tool: Bash (psql)
    Preconditions: Database running at localhost:54322, migration applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetypes" | grep delivery_instructions
      2. Assert output contains: delivery_instructions | text |
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT delivery_instructions FROM archetypes LIMIT 1;"
      4. Assert query succeeds (column exists, values are NULL)
    Expected Result: Column exists as nullable TEXT, all existing rows have NULL
    Failure Indicators: Column not found, wrong type, or NOT NULL constraint
    Evidence: .sisyphus/evidence/task-1-migration-column.txt

  Scenario: Prisma client types include delivery_instructions
    Tool: Bash (grep)
    Preconditions: prisma generate has been run
    Steps:
      1. Run: grep -r "delivery_instructions" node_modules/.prisma/client/index.d.ts
      2. Assert: at least 1 match showing the field in the generated types
    Expected Result: Field appears in Prisma generated types
    Failure Indicators: No match found
    Evidence: .sisyphus/evidence/task-1-prisma-types.txt

  Scenario: Build still passes after migration
    Tool: Bash
    Preconditions: Migration and generate complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: TypeScript compilation succeeds
    Failure Indicators: Build fails with type errors
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add delivery_instructions column to archetypes`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
  - Pre-commit: `pnpm build`

---

- [x] 2. Harness — Add `delivery_instructions` to ArchetypeRow + EMPLOYEE_PHASE Skeleton

  **What to do**:
  - In `src/workers/opencode-harness.mts`, add `delivery_instructions?: string | null` to the `ArchetypeRow` interface (after `agents_md`)
  - At the top of the `main()` function (after env var reads), add a constant: `const isDeliveryPhase = process.env.EMPLOYEE_PHASE === 'delivery';`
  - Add an early branch after archetype loading: `if (isDeliveryPhase) { await runDeliveryPhase(archetype, taskId, db, logger); return; }` — where `runDeliveryPhase` is a stub function that will be implemented in Task 3
  - Create the stub: `async function runDeliveryPhase(archetype: ArchetypeRow, taskId: string, db: PostgRESTClient, logger: Logger): Promise<void> { throw new Error('runDeliveryPhase not yet implemented'); }`

  **Must NOT do**:
  - Do NOT implement the full `runDeliveryPhase` logic — that's Task 3
  - Do NOT modify the existing work-phase flow in `main()`
  - Do NOT change any existing function signatures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Interface update + simple code skeleton — 3 small edits to one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:18-27` — `ArchetypeRow` interface definition, add field here
  - `src/workers/opencode-harness.mts:29-50` (approx) — `main()` function entry point, add `EMPLOYEE_PHASE` check early

  **API/Type References**:
  - `src/workers/lib/postgrest-client.ts` — `PostgRESTClient` type used by the harness for DB operations

  **WHY Each Reference Matters**:
  - The ArchetypeRow interface determines what fields the harness can access from the archetype — must add field here
  - The main() function entry is where the delivery branch must go — before any work-phase logic executes

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: ArchetypeRow interface includes delivery_instructions
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -n "delivery_instructions" src/workers/opencode-harness.mts
      2. Assert: at least 2 matches (interface field + isDeliveryPhase usage)
    Expected Result: Field in interface, EMPLOYEE_PHASE check present
    Failure Indicators: Missing field or missing phase check
    Evidence: .sisyphus/evidence/task-2-interface.txt

  Scenario: EMPLOYEE_PHASE check exists in main()
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -n "EMPLOYEE_PHASE" src/workers/opencode-harness.mts
      2. Assert: at least 1 match for the env var check
      3. Run: grep -n "runDeliveryPhase" src/workers/opencode-harness.mts
      4. Assert: at least 2 matches (call site + stub function)
    Expected Result: Phase check and stub function both present
    Failure Indicators: Missing check or missing stub
    Evidence: .sisyphus/evidence/task-2-phase-check.txt

  Scenario: Build passes with new interface
    Tool: Bash
    Preconditions: Task 2 edits complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Compilation succeeds
    Failure Indicators: Type errors
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES
  - Message: `feat(harness): add ArchetypeRow.delivery_instructions + EMPLOYEE_PHASE check`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 3. Harness — Implement `runDeliveryPhase()` Function

  **What to do**:
  - Replace the stub `runDeliveryPhase` from Task 2 with full implementation
  - The function must:
    1. Read the existing deliverable from PostgREST: `GET /rest/v1/deliverables?external_ref=eq.{taskId}&select=*&order=created_at.desc&limit=1`
    2. Extract `content` from the deliverable — this is the approved content to deliver
    3. Resolve the instructions to use: `archetype.delivery_instructions` (if null, patch task to `Failed` with descriptive error and return)
    4. Start an OpenCode session with `delivery_instructions` as the instructions (NOT `archetype.instructions`)
    5. Pass the deliverable content to OpenCode via the instructions or as context (prepend it: "APPROVED CONTENT TO DELIVER:\n{content}\n\n{delivery_instructions}")
    6. On OpenCode completion, patch task to `Done` via PostgREST: `PATCH /rest/v1/tasks?id=eq.{taskId}` with `{ status: 'Done' }`
    7. Log status transition: `POST /rest/v1/status_transitions` with `{ task_id, from_status: 'Delivering', to_status: 'Done' }`
    8. On failure, patch task to `Failed` and let the lifecycle retry logic handle it
  - Do NOT create new `executions` or `deliverables` records — the delivery phase reuses the existing ones
  - Do NOT write `/tmp/summary.txt` or `/tmp/approval-message.json` — these are work-phase artifacts
  - The SIGTERM handler should still patch to `Failed` (this is correct for delivery too)

  **Must NOT do**:
  - Do NOT create new execution records — delivery reuses the work-phase execution
  - Do NOT create new deliverable records — delivery reads the existing one
  - Do NOT modify the existing work-phase `main()` flow
  - Do NOT add retry logic — that's the lifecycle's responsibility
  - Do NOT use any model other than what's in `archetype.model` (verified as `minimax/minimax-m2.7`)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex function with multiple PostgREST calls, OpenCode integration, error handling, and state management. Requires deep understanding of the harness flow.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:289-363` — existing `main()` flow for work phase: how it creates execution, starts OpenCode, writes deliverable, patches status. Use this as the reference for PostgREST call patterns but do NOT replicate execution/deliverable creation.
  - `src/workers/opencode-harness.mts:365-410` (approx) — existing `markFailed()` function for error handling pattern
  - `src/workers/opencode-harness.mts:18-27` — `ArchetypeRow` interface showing available fields

  **API/Type References**:
  - `src/workers/lib/postgrest-client.ts` — `PostgRESTClient` class with `get()`, `patch()`, `post()` methods
  - `prisma/schema.prisma` — `Deliverable` model: `content`, `metadata`, `external_ref` fields
  - `prisma/schema.prisma` — `StatusTransition` model for logging state changes

  **External References**:
  - OpenCode session API: the harness starts it via `spawn('opencode', [...])` with environment variables — same pattern applies for delivery

  **WHY Each Reference Matters**:
  - The work-phase `main()` flow shows the exact PostgREST patterns and OpenCode session management — delivery follows the same infrastructure but with different logic
  - `markFailed()` shows the error handling pattern including SIGTERM awareness
  - The PostgRESTClient is the ONLY way to interact with the database from the worker container

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: runDeliveryPhase reads existing deliverable
    Tool: Bash (grep)
    Preconditions: Task 3 implementation complete
    Steps:
      1. Run: grep -n "deliverables" src/workers/opencode-harness.mts | grep -i "get\|fetch"
      2. Assert: at least 1 match showing deliverable fetch via external_ref
      3. Run: grep -n "executions" src/workers/opencode-harness.mts | grep -i "post\|create\|insert"
      4. Count matches in runDeliveryPhase context — assert 0 (no new execution creation in delivery phase)
    Expected Result: Delivery phase reads deliverable but does NOT create execution records
    Failure Indicators: New execution INSERT found in delivery code path
    Evidence: .sisyphus/evidence/task-3-deliverable-read.txt

  Scenario: Delivery phase patches task to Done (not Submitting)
    Tool: Bash (grep)
    Preconditions: Task 3 implementation complete
    Steps:
      1. Run: grep -A5 "runDeliveryPhase" src/workers/opencode-harness.mts | grep -i "Done\|status"
      2. Assert: contains `status: 'Done'` or equivalent patch
      3. Verify no `Submitting` status patch exists in the delivery code path
    Expected Result: Delivery patches to Done, not Submitting
    Failure Indicators: `Submitting` found in delivery path
    Evidence: .sisyphus/evidence/task-3-done-status.txt

  Scenario: Null delivery_instructions guard
    Tool: Bash (grep)
    Preconditions: Task 3 implementation complete
    Steps:
      1. Run: grep -B2 -A5 "delivery_instructions" src/workers/opencode-harness.mts | grep -i "null\|failed\|error"
      2. Assert: null check exists with Failed status patch
    Expected Result: Missing delivery_instructions causes task to be marked Failed
    Failure Indicators: No null guard found
    Evidence: .sisyphus/evidence/task-3-null-guard.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: Task 3 complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Compilation succeeds
    Failure Indicators: Type errors in harness
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES
  - Message: `feat(harness): implement runDeliveryPhase for delivery-mode execution`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

---

- [x] 4. Lifecycle — Unified Delivery Path with Retry

  **What to do**:
  - Refactor the `handle-approval-result` step in `src/inngest/employee-lifecycle.ts` (lines 310–489):
  - **Keep**: All approval/rejection/timeout logic (lines 310–370 approx)
  - **Keep**: `slackClient.updateMessage()` call for updating the approval message with "✅ Approved by @user"
  - **Keep**: Deliverable fetch from PostgREST (lines 325–339) — needed for `approval_message_ts` and `target_channel`
  - **Remove entirely**: PATH B — the inline `slackClient.postMessage()` block (lines 422–468 approx). This is the core change.
  - **Modify**: PATH A — remove the `if (process.env.DELIVERY_MACHINE_ENABLED === 'true')` guard. Make machine spawn unconditional.
  - **Add**: `EMPLOYEE_PHASE: 'delivery'` to the delivery machine's env vars (replacing `DELIVERY_MODE: 'true'`)
  - **Remove**: `DELIVERY_MODE: 'true'` from the machine env vars
  - **Add retry logic**: Wrap the delivery machine spawn + poll in a retry loop:
    ```
    for (let attempt = 0; attempt < 3; attempt++) {
      // spawn delivery machine with EMPLOYEE_PHASE=delivery
      // poll for Done/Failed (20 × 15s = 5 minutes)
      // destroy machine
      // if status === 'Done', break
      // if status === 'Failed' and attempt < 2, reset task to 'Delivering', log retry
      // if status === 'Failed' and attempt === 2, mark task Failed permanently
    }
    ```
  - **Add null guard**: Before spawning delivery machine, check that the archetype has `delivery_instructions`. If null, mark task `Failed` with error "Archetype missing delivery_instructions". To get the archetype, fetch it via: `GET /rest/v1/tasks?id=eq.{taskId}&select=archetypes(delivery_instructions)`
  - **Remove dead code**: After removing PATH B, check if `summaryContent` and `summaryBlocks` variables (lines 338-339) are still used. If only used by the removed `postMessage`, delete them. If used by the approval message update, keep them.
  - **Do NOT touch**: The `approval_required === false` path (lines 277–293) — leave completely as-is
  - **Do NOT touch**: The cleanup step (lines 491–499) — it destroys the WORK machine, which is still needed

  **Must NOT do**:
  - Do NOT remove `slackClient` import or `updateMessage` call
  - Do NOT modify the `approval_required === false` path
  - Do NOT modify the cleanup step
  - Do NOT touch the work machine polling logic (lines 228–242)
  - Do NOT modify any deprecated lifecycle files
  - Do NOT add `DELIVERY_MODE` to any env vars

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex refactoring of a 180-line step with two conditional paths, retry logic, and state machine semantics. Requires careful preservation of existing behavior.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Tasks 6, 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:310-489` — the ENTIRE `handle-approval-result` step. Read this fully before making any changes. The two paths are at lines 375-421 (PATH A: Fly.io) and 422-468 (PATH B: inline Slack).
  - `src/inngest/employee-lifecycle.ts:228-242` — work machine polling pattern (same inline loop pattern to follow for delivery)
  - `src/inngest/employee-lifecycle.ts:375-421` — existing PATH A machine spawn + polling (this becomes the base for the unified path)
  - `src/inngest/employee-lifecycle.ts:277-293` — `approval_required === false` path — DO NOT TOUCH this

  **API/Type References**:
  - `src/lib/fly-client.ts` — `createMachine()` and `destroyMachine()` functions
  - `src/lib/slack-client.ts` — `SlackClient` type with `postMessage` and `updateMessage` methods

  **WHY Each Reference Matters**:
  - Lines 310-489 are the ENTIRE scope of this task — must be read in full before any edit
  - The work machine polling pattern is the template for delivery machine polling
  - PATH A is the foundation for the new unified path — it already spawns a Fly.io machine
  - The `approval_required === false` path is a no-go zone — understanding its boundaries prevents accidental modification

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No inline postMessage delivery remains
    Tool: Bash (grep)
    Preconditions: Task 4 complete
    Steps:
      1. Run: grep -n "postMessage" src/inngest/employee-lifecycle.ts
      2. Assert: zero matches
      3. Run: grep -n "updateMessage" src/inngest/employee-lifecycle.ts
      4. Assert: at least 1 match (approval message update preserved)
    Expected Result: postMessage removed, updateMessage preserved
    Failure Indicators: postMessage still present OR updateMessage removed
    Evidence: .sisyphus/evidence/task-4-no-postmessage.txt

  Scenario: DELIVERY_MACHINE_ENABLED guard removed
    Tool: Bash (grep)
    Preconditions: Task 4 complete
    Steps:
      1. Run: grep -n "DELIVERY_MACHINE_ENABLED" src/inngest/employee-lifecycle.ts
      2. Assert: zero matches
      3. Run: grep -n "DELIVERY_MODE" src/inngest/employee-lifecycle.ts
      4. Assert: zero matches
    Expected Result: Both old env vars completely removed from lifecycle
    Failure Indicators: Either env var still referenced
    Evidence: .sisyphus/evidence/task-4-env-vars-removed.txt

  Scenario: EMPLOYEE_PHASE=delivery is set on delivery machine
    Tool: Bash (grep)
    Preconditions: Task 4 complete
    Steps:
      1. Run: grep -n "EMPLOYEE_PHASE" src/inngest/employee-lifecycle.ts
      2. Assert: at least 1 match showing `EMPLOYEE_PHASE: 'delivery'`
    Expected Result: New env var present in delivery machine spawn
    Failure Indicators: Missing EMPLOYEE_PHASE
    Evidence: .sisyphus/evidence/task-4-employee-phase.txt

  Scenario: Retry logic exists (up to 3 attempts)
    Tool: Bash (grep)
    Preconditions: Task 4 complete
    Steps:
      1. Run: grep -n "attempt\|retry\|< 3" src/inngest/employee-lifecycle.ts
      2. Assert: retry loop structure visible
    Expected Result: Delivery retry loop with 3 max attempts
    Failure Indicators: No retry logic found
    Evidence: .sisyphus/evidence/task-4-retry.txt

  Scenario: approval_required=false path untouched
    Tool: Bash (grep)
    Preconditions: Task 4 complete
    Steps:
      1. Run: grep -B2 -A10 "approvalRequired.*false\|!approvalRequired" src/inngest/employee-lifecycle.ts
      2. Assert: path exists and goes directly to 'Done' (no delivery machine spawn)
    Expected Result: No-approval path still goes straight to Done
    Failure Indicators: Delivery machine spawn in no-approval path
    Evidence: .sisyphus/evidence/task-4-no-approval-path.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: Task 4 complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Compilation succeeds
    Failure Indicators: Type errors
    Evidence: .sisyphus/evidence/task-4-build.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): unify delivery path — always spawn Fly.io machine with retry`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

- [x] 5. Seed Update — Add `delivery_instructions`, Remove `DELIVERY_MODE` from Instructions

  **What to do**:
  - In `prisma/seed.ts`, update all 3 archetype upserts:
  - **DozalDevs daily-summarizer** (ID `00000000-0000-0000-0000-000000000012`):
    - Add `delivery_instructions`: `"Read the approved summary from the deliverable. Post it to the publish channel using: tsx /tools/slack/post-message.ts --channel \"$SUMMARY_PUBLISH_CHANNEL\" --text \"<content>\". If SUMMARY_PUBLISH_CHANNEL is not set, use the target_channel from the deliverable metadata. Post the summary as a clean message without approval buttons."`
    - Remove the `DELIVERY_MODE` paragraph from `instructions` (lines ~392-394)
  - **VLRE daily-summarizer** (ID `00000000-0000-0000-0000-000000000013`):
    - Add `delivery_instructions`: Same as DozalDevs summarizer (same delivery pattern)
    - Remove the `DELIVERY_MODE` paragraph from `instructions` (lines ~407-409)
  - **VLRE guest-messaging** (ID `00000000-0000-0000-0000-000000000015`):
    - Add `delivery_instructions`: `"Read the approved response from the deliverable. Send it to the guest via Hostfully: tsx /tools/hostfully/send-message.ts --thread-uid \"<thread_uid>\" --message \"<content>\". The thread UID is available in the deliverable metadata. Confirm delivery was successful."`
    - Remove the `DELIVERY_MODE` paragraph from `instructions` (lines ~432-435)
  - Run `pnpm prisma db seed` to verify seed applies without error
  - The `delivery_instructions` field uses `(prisma.archetype as any).upsert(...)` — the `as any` cast is already there

  **Must NOT do**:
  - Do NOT modify the `system_prompt` field on any archetype
  - Do NOT change the archetype IDs, role_names, or tenant assignments
  - Do NOT modify any other seed data (tenants, departments, projects, etc.)
  - Do NOT hardcode channel IDs in `delivery_instructions` — use env var references like `$SUMMARY_PUBLISH_CHANNEL` or deliverable metadata

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text editing in seed file — no complex logic, just string content changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 1 (migration must exist for the column)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:380-400` — DozalDevs summarizer archetype upsert with current `DELIVERY_MODE` instructions
  - `prisma/seed.ts:400-420` — VLRE summarizer archetype upsert
  - `prisma/seed.ts:420-450` — VLRE guest messaging archetype upsert
  - `src/worker-tools/slack/post-message.ts` — CLI usage for `--help` output (to write accurate delivery_instructions)
  - `src/worker-tools/hostfully/send-message.ts` — CLI usage for guest messaging delivery

  **WHY Each Reference Matters**:
  - The exact line ranges in seed.ts show where `DELIVERY_MODE` text must be removed and `delivery_instructions` must be added
  - The shell tool files show the exact CLI syntax that delivery_instructions must reference

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed applies without error
    Tool: Bash
    Preconditions: Migration from Task 1 applied
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert exit code 0
    Expected Result: Seed completes successfully
    Failure Indicators: Prisma error, missing column, type mismatch
    Evidence: .sisyphus/evidence/task-5-seed.txt

  Scenario: All 3 archetypes have delivery_instructions
    Tool: Bash (psql)
    Preconditions: Seed applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, role_name, (delivery_instructions IS NOT NULL) as has_di FROM archetypes ORDER BY role_name;"
      2. Assert: all rows show has_di = true (or t)
    Expected Result: 3 archetypes, all with delivery_instructions set
    Failure Indicators: Any row with NULL delivery_instructions
    Evidence: .sisyphus/evidence/task-5-delivery-instructions.txt

  Scenario: DELIVERY_MODE removed from instructions
    Tool: Bash (grep)
    Preconditions: Seed file edited
    Steps:
      1. Run: grep -n "DELIVERY_MODE" prisma/seed.ts
      2. Assert: zero matches
    Expected Result: No references to DELIVERY_MODE in seed file
    Failure Indicators: DELIVERY_MODE still present
    Evidence: .sisyphus/evidence/task-5-no-delivery-mode.txt
  ```

  **Commit**: YES
  - Message: `feat(seed): add delivery_instructions, remove DELIVERY_MODE from instructions`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Write Lifecycle Delivery Tests

  **What to do**:
  - Create `tests/inngest/employee-lifecycle-delivery.test.ts` with comprehensive tests for the delivery flow
  - Use the `InngestTestEngine` pattern from `tests/inngest/lifecycle.test.ts` (deprecated engineering lifecycle) as the testing pattern reference — but test the universal lifecycle from `src/inngest/employee-lifecycle.ts`
  - Test cases to cover:
    1. **Happy path**: Approval received → delivery machine spawned with `EMPLOYEE_PHASE=delivery` → polls until Done → task marked Done
    2. **Delivery failure + retry**: Delivery machine fails → lifecycle retries → second machine succeeds → task Done
    3. **All retries exhausted**: 3 delivery machines fail → task marked Failed permanently
    4. **Null delivery_instructions**: Archetype missing delivery_instructions → task marked Failed with error (no machine spawned)
    5. **Rejection path preserved**: Rejection action → task marked Cancelled (no delivery machine)
    6. **Timeout path preserved**: Approval timeout → task marked Cancelled (no delivery machine)
    7. **Approval message updated**: On approval, `slackClient.updateMessage()` called with approved text
  - Mock strategy:
    - `vi.mock()` for `src/lib/fly-client` (createMachine, destroyMachine)
    - `vi.mock()` for `src/lib/slack-client` (updateMessage — verify it's called; postMessage — verify it's NOT called)
    - `vi.stubGlobal('fetch', mockFetch)` for PostgREST calls (deliverables, tasks, archetypes, status_transitions)
    - Use `vi.hoisted()` for mock hoisting
  - Each test should verify specific function calls and their arguments (not just that the test passes)

  **Must NOT do**:
  - Do NOT modify the source code — this is a test-only task
  - Do NOT test the deprecated lifecycle (`src/inngest/lifecycle.ts`)
  - Do NOT import from deprecated test file (`tests/inngest/lifecycle.test.ts`) — only reference its pattern

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex test authoring requiring deep understanding of Inngest test engine, mock patterns, and the lifecycle state machine. Multiple test cases with detailed assertions.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 4 (lifecycle must be implemented first)

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle.test.ts` — test pattern for Inngest lifecycle functions: `InngestTestEngine`, `mockCtx`, `transformCtx`, `vi.mock()` usage. Read the first 50 lines for setup pattern, then the `describe('approval')` block for relevant test structure.
  - `tests/inngest/feedback-handler.test.ts` — simpler Inngest test pattern, useful for mock setup reference
  - `tests/inngest/lib/poll-completion.test.ts` — mock fetch pattern with `vi.stubGlobal`

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts` — the function being tested. Read the full `handle-approval-result` step after Task 4's refactoring.
  - `@inngest/test` package — `InngestTestEngine` API

  **WHY Each Reference Matters**:
  - The deprecated lifecycle test shows EXACTLY how to set up InngestTestEngine with mocked steps — this is the canonical test pattern in this codebase
  - The feedback handler test shows a simpler example of the same pattern
  - The poll-completion test shows how to mock PostgREST fetch calls

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All delivery tests pass
    Tool: Bash
    Preconditions: Test file created, Tasks 1-5 complete
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts
      2. Assert exit code 0
      3. Assert output shows 7+ test cases passing
    Expected Result: All tests pass, zero failures
    Failure Indicators: Any test failure or import error
    Evidence: .sisyphus/evidence/task-6-tests.txt

  Scenario: Tests verify no postMessage call
    Tool: Bash (grep)
    Preconditions: Test file created
    Steps:
      1. Run: grep -n "postMessage" tests/inngest/employee-lifecycle-delivery.test.ts
      2. Assert: matches include assertions that postMessage was NOT called (e.g., `expect(mockPostMessage).not.toHaveBeenCalled()`)
    Expected Result: Tests explicitly verify postMessage is never called in delivery flow
    Failure Indicators: No negative assertion on postMessage
    Evidence: .sisyphus/evidence/task-6-no-postmessage-test.txt

  Scenario: Tests cover retry exhaustion
    Tool: Bash (grep)
    Preconditions: Test file created
    Steps:
      1. Run: grep -n "retry\|attempt\|Failed\|exhaust" tests/inngest/employee-lifecycle-delivery.test.ts
      2. Assert: at least 1 test case covers retry exhaustion → Failed
    Expected Result: Retry exhaustion test exists
    Failure Indicators: No retry test found
    Evidence: .sisyphus/evidence/task-6-retry-test.txt
  ```

  **Commit**: YES
  - Message: `test(lifecycle): add delivery flow tests for universal employee lifecycle`
  - Files: `tests/inngest/employee-lifecycle-delivery.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts`

---

- [x] 7. Write Harness Delivery Phase Tests

  **What to do**:
  - Create `tests/workers/opencode-harness-delivery.test.ts` with tests for `runDeliveryPhase()`
  - Test cases to cover:
    1. **Happy path**: `EMPLOYEE_PHASE=delivery` → reads deliverable → runs OpenCode with delivery_instructions → patches task to Done
    2. **Null delivery_instructions**: Archetype has null delivery_instructions → patches task to Failed with error
    3. **Missing deliverable**: No deliverable found for task ID → patches task to Failed
    4. **OpenCode failure**: OpenCode session fails/crashes → patches task to Failed
    5. **Correct instructions used**: Verify `delivery_instructions` (not `instructions`) is passed to OpenCode
  - Mock strategy:
    - `vi.stubGlobal('fetch', mockFetch)` for PostgREST calls
    - Mock the OpenCode spawn/session (the `child_process.spawn` or equivalent)
    - Mock `process.env` to set `EMPLOYEE_PHASE=delivery`, `TASK_ID`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
  - Verify that no `executions` or `deliverables` INSERT calls are made during delivery phase

  **Must NOT do**:
  - Do NOT modify the harness source — test-only task
  - Do NOT test the work-phase flow — only delivery phase
  - Do NOT run actual OpenCode sessions — mock the subprocess

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex test authoring for a worker harness with subprocess mocking
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 5

  **References**:

  **Pattern References**:
  - `tests/workers/lib/completion.test.ts` — existing worker test pattern: mock fetch, verify PostgREST calls
  - `src/workers/opencode-harness.mts` — the source being tested, specifically the `runDeliveryPhase()` function from Task 3

  **API/Type References**:
  - `src/workers/lib/postgrest-client.ts` — PostgRESTClient interface for mock verification

  **WHY Each Reference Matters**:
  - The completion test shows the exact pattern for mocking PostgREST in worker tests
  - The harness source shows what functions and calls need to be mocked

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All harness delivery tests pass
    Tool: Bash
    Preconditions: Test file created, Tasks 1-5 complete
    Steps:
      1. Run: pnpm test -- --run tests/workers/opencode-harness-delivery.test.ts
      2. Assert exit code 0
      3. Assert output shows 5+ test cases passing
    Expected Result: All tests pass
    Failure Indicators: Test failures or import errors
    Evidence: .sisyphus/evidence/task-7-tests.txt

  Scenario: Tests verify no execution/deliverable creation
    Tool: Bash (grep)
    Preconditions: Test file created
    Steps:
      1. Run: grep -n "executions\|deliverables" tests/workers/opencode-harness-delivery.test.ts
      2. Assert: matches include negative assertions (no INSERT/POST to executions or deliverables)
    Expected Result: Tests verify delivery phase doesn't create records
    Failure Indicators: No negative assertions found
    Evidence: .sisyphus/evidence/task-7-no-creation-test.txt
  ```

  **Commit**: YES
  - Message: `test(harness): add delivery phase tests for opencode harness`
  - Files: `tests/workers/opencode-harness-delivery.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/opencode-harness-delivery.test.ts`

---

- [x] 8. Cleanup — Remove Env Vars, Update Existing Test, Update Docs

  **What to do**:
  - **Update test**: `tests/gateway/seed-guest-messaging.test.ts`
    - Line 92: Replace `expect(result[0].instructions).toContain('DELIVERY_MODE')` with `expect(result[0].delivery_instructions).toBeTruthy()` or an assertion that `delivery_instructions` contains the expected tool reference
    - Add assertion: `expect(result[0].instructions).not.toContain('DELIVERY_MODE')` to verify removal
  - **Update docs**: `docs/2026-04-24-1452-current-system-state.md`
    - Line 119: Remove the bullet point about delivery mode ("When `DELIVERY_MODE=true` is set...")
    - Add new documentation about the unified delivery path: "Delivery always runs inside a Fly.io machine with `EMPLOYEE_PHASE=delivery`. The harness reads `archetype.delivery_instructions` to determine what delivery action to perform."
  - **Final sweep**: Verify no remaining references to `DELIVERY_MODE` or `DELIVERY_MACHINE_ENABLED` in any source file:
    - `grep -r "DELIVERY_MODE\|DELIVERY_MACHINE_ENABLED" src/ prisma/ tests/ .env.example docs/`
    - The only acceptable match is in `docs/2026-04-21-2202-phase1-story-map.md` (the story map's porting notes — historical context, not active code)
  - **Clean up `.env.example`**: If `DELIVERY_MACHINE_ENABLED` or `DELIVERY_MODE` appear, remove them. (Research shows they're NOT in `.env.example`, but verify.)

  **Must NOT do**:
  - Do NOT modify `docs/2026-04-21-2202-phase1-story-map.md` porting notes — those are historical context
  - Do NOT modify `docs/2026-04-14-0104-full-system-vision.md` — out of scope
  - Do NOT modify source code — this is cleanup-only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple text edits across 2-3 files — no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4, 5

  **References**:

  **Pattern References**:
  - `tests/gateway/seed-guest-messaging.test.ts:90-95` — the assertion block to modify
  - `docs/2026-04-24-1452-current-system-state.md:119` — the delivery mode bullet to remove/replace

  **WHY Each Reference Matters**:
  - The exact line numbers tell the executor precisely what to change
  - The docs file needs a replacement paragraph, not just deletion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Updated seed test passes
    Tool: Bash
    Preconditions: Task 5 seed changes applied, Task 8 test changes applied
    Steps:
      1. Run: pnpm test -- --run tests/gateway/seed-guest-messaging.test.ts
      2. Assert exit code 0
    Expected Result: Test passes with updated assertions
    Failure Indicators: Test failure on delivery_instructions or DELIVERY_MODE assertion
    Evidence: .sisyphus/evidence/task-8-seed-test.txt

  Scenario: No stale env var references in codebase
    Tool: Bash (grep)
    Preconditions: All cleanup done
    Steps:
      1. Run: grep -r "DELIVERY_MODE\|DELIVERY_MACHINE_ENABLED" src/ prisma/ tests/ .env.example 2>/dev/null
      2. Assert: zero matches
      3. Run: grep -r "DELIVERY_MODE\|DELIVERY_MACHINE_ENABLED" docs/ 2>/dev/null
      4. Assert: only matches in story map (historical porting notes) — NOT in current-system-state.md
    Expected Result: No active references remain
    Failure Indicators: References in source, test, or active docs
    Evidence: .sisyphus/evidence/task-8-env-cleanup.txt

  Scenario: Docs updated with unified delivery description
    Tool: Bash (grep)
    Preconditions: Docs edited
    Steps:
      1. Run: grep -n "EMPLOYEE_PHASE" docs/2026-04-24-1452-current-system-state.md
      2. Assert: at least 1 match describing the new delivery architecture
    Expected Result: Docs reflect new unified delivery path
    Failure Indicators: Old delivery mode description still present, new one missing
    Evidence: .sisyphus/evidence/task-8-docs.txt
  ```

  **Commit**: YES
  - Message: `chore: remove DELIVERY_MODE/DELIVERY_MACHINE_ENABLED, update docs and tests`
  - Files: `tests/gateway/seed-guest-messaging.test.ts`, `docs/2026-04-24-1452-current-system-state.md`
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Build Verification + Docker Rebuild

  **What to do**:
  - Run full verification suite:
    1. `pnpm build` — must exit 0
    2. `pnpm test -- --run` — must pass (excluding pre-existing failures: `container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`)
    3. `pnpm lint` — must exit 0 (if lint script exists)
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Verify Docker image has updated harness: `docker run --rm --entrypoint node ai-employee-worker:latest -e "const m = require('/app/dist/workers/opencode-harness.mjs'); console.log('harness loaded')"` (or equivalent smoke test)
  - Verify env var cleanup: `grep -r "DELIVERY_MODE\|DELIVERY_MACHINE_ENABLED" src/ prisma/ tests/` returns zero matches

  **Must NOT do**:
  - Do NOT push the Docker image to any registry
  - Do NOT run `fly deploy` or any remote deployment

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running verification commands — no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Wave 3)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 6, 7, 8

  **References**:

  **Pattern References**:
  - `Dockerfile` — Docker build context, verify COPY lines include updated harness
  - `package.json` — verify `build`, `test`, `lint` scripts

  **WHY Each Reference Matters**:
  - Docker image must be rebuilt after any harness change — this is a critical step before E2E

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build passes
    Tool: Bash
    Preconditions: All implementation tasks (1-8) complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Run: pnpm test -- --run
      4. Assert exit code 0 (or only pre-existing failures)
    Expected Result: Build and tests pass
    Failure Indicators: Any new failure
    Evidence: .sisyphus/evidence/task-9-build.txt

  Scenario: Docker image builds successfully
    Tool: Bash (tmux — long-running)
    Preconditions: pnpm build passes
    Steps:
      1. Run in tmux: docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/docker-build.log
      2. Poll until complete
      3. Assert exit code 0 in log
    Expected Result: Docker image builds with updated harness
    Failure Indicators: Build failure, missing dependencies
    Evidence: .sisyphus/evidence/task-9-docker.txt

  Scenario: Zero stale env var references
    Tool: Bash (grep)
    Preconditions: All tasks complete
    Steps:
      1. Run: grep -r "DELIVERY_MODE\|DELIVERY_MACHINE_ENABLED" src/ prisma/ tests/
      2. Assert: zero matches
    Expected Result: Complete cleanup confirmed
    Failure Indicators: Any remaining reference
    Evidence: .sisyphus/evidence/task-9-env-cleanup.txt
  ```

  **Commit**: NO (verification only — no code changes)

---

- [x] 10. E2E Admin API Trigger + Verify Delivery

  **What to do**:
  - This task performs end-to-end verification using the admin API. **Prerequisites**: All services must be running (`pnpm dev:start`), Docker image rebuilt (Task 9), and Inngest dev server at `http://localhost:8288`.
  - **Step 1: Trigger a summarizer task**:
    ```bash
    TENANT=00000000-0000-0000-0000-000000000002
    curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" \
      -H "Content-Type: application/json" -d '{}' | jq .
    ```
    Expected: HTTP 202, response has `task_id` and `status_url`
  - **Step 2: Poll task status until Reviewing**:
    ```bash
    TASK_ID=<from step 1>
    # Poll every 30s for up to 10 minutes
    curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/$TENANT/tasks/$TASK_ID" | jq .status
    ```
    Expected: Reaches `Reviewing` within 10 minutes
  - **Step 3: Approve the task** (manual event injection):
    ```bash
    curl -X POST "http://localhost:8288/e/local" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"employee/approval.received\",\"data\":{\"taskId\":\"$TASK_ID\",\"action\":\"approve\",\"userId\":\"U05V0CTJLF6\",\"userName\":\"Victor\"}}"
    ```
  - **Step 4: Verify delivery machine spawns**:
    - Poll task status — should transition through `Approved` → `Delivering` → `Done`
    - Check Fly.io logs or Inngest dashboard for delivery machine with `EMPLOYEE_PHASE=delivery`
    - Final status should be `Done` within 10 minutes of approval
  - **Step 5: Verify no inline postMessage**:
    - Check gateway logs — no `slackClient.postMessage` call should appear in the approval handler
    - The delivery should happen via the Fly.io machine, not inline

  **Important**: If services are not running or the Fly.io app is not available, this task should document what WOULD be verified and skip the live trigger. The automated tests (Tasks 6-7) are the primary verification.

  **Must NOT do**:
  - Do NOT modify any code
  - Do NOT deploy to production
  - Do NOT run against VLRE tenant unless explicitly asked

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-step E2E verification requiring service orchestration, polling, and log analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 9)
  - **Blocks**: Task 11
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `scripts/trigger-task.ts` — existing E2E trigger script, reference for admin API usage
  - `scripts/verify-e2e.ts` — existing E2E verification script
  - AGENTS.md § Admin API — curl examples for trigger and status endpoints
  - AGENTS.md § Manual approval fallback — curl command for Inngest event injection

  **WHY Each Reference Matters**:
  - The trigger and verify scripts show the exact API patterns and expected responses
  - The AGENTS.md section has pre-built curl commands ready to use

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Task reaches Reviewing via admin API trigger
    Tool: Bash (curl + jq)
    Preconditions: Services running, Docker image rebuilt
    Steps:
      1. Trigger task via admin API (see Step 1 above)
      2. Poll status every 30s for up to 10 minutes
      3. Assert status reaches "Reviewing"
    Expected Result: Task in Reviewing state, waiting for approval
    Failure Indicators: Task stuck in earlier state, reaches Failed
    Evidence: .sisyphus/evidence/task-10-trigger.txt

  Scenario: Approval triggers delivery machine → Done
    Tool: Bash (curl + jq)
    Preconditions: Task in Reviewing state
    Steps:
      1. Send approval event via Inngest (see Step 3 above)
      2. Poll status every 30s for up to 10 minutes
      3. Assert status transitions: Approved → Delivering → Done
    Expected Result: Task reaches Done via delivery machine
    Failure Indicators: Task stays in Delivering, reaches Failed, inline Slack delivery instead of machine
    Evidence: .sisyphus/evidence/task-10-delivery.txt

  Scenario: (Fallback) If services unavailable, document verification plan
    Tool: Bash
    Preconditions: Services NOT available
    Steps:
      1. Document what would be verified
      2. Verify automated tests pass as primary evidence
      3. Run: pnpm test -- --run
      4. Assert all tests pass
    Expected Result: Automated tests serve as verification
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-10-fallback.txt
  ```

  **Commit**: NO (verification only — no code changes)

---

- [x] 11. Update Story Map + Telegram Notification

  **What to do**:
  - In `docs/2026-04-21-2202-phase1-story-map.md`, find the PLAT-05 acceptance criteria section (lines 370-379) and mark all items as complete:
    - `- [ ]` → `- [x]` for each acceptance criterion
  - Verify the checkboxes match the actual implementation:
    - `[x]` Lifecycle always spawns a Fly.io machine for delivery after approval
    - `[x]` Delivery machine reads approved content from the `deliverables` table
    - `[x]` Each archetype has a `delivery_instructions` field (nullable text)
    - `[x]` Summarizer delivery instructions reference `tsx /tools/slack/post-message.ts`
    - `[x]` Guest messaging delivery instructions reference `tsx /tools/hostfully/send-message.ts`
    - `[x]` `DELIVERY_MODE` and `DELIVERY_MACHINE_ENABLED` env vars removed
    - `[x]` All conditional delivery paths replaced with single machine-based delivery
    - `[x]` Delivery machine uses same completion contract
    - `[x]` Lifecycle polls delivery machine completion with retry (up to 2 times)
    - `[x]` `pnpm build` exits 0, `pnpm test -- --run` passes
  - Send Telegram notification:
    ```bash
    tsx scripts/telegram-notify.ts "✅ PLAT-05 (Unify Delivery Path) complete — all tasks done, come back to review results."
    ```

  **Must NOT do**:
  - Do NOT modify any other story in the story map
  - Do NOT change the porting notes or description — only the acceptance criteria checkboxes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple checkbox edits + single command
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 10)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:370-379` — PLAT-05 acceptance criteria checkboxes
  - `scripts/telegram-notify.ts` — Telegram notification script

  **WHY Each Reference Matters**:
  - Exact line range for the checkboxes to flip
  - Notification script path for completion alert

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Story map checkboxes updated
    Tool: Bash (grep)
    Preconditions: Story map edited
    Steps:
      1. Run: grep -A20 "PLAT-05.*Acceptance" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \[ \]"
      2. Assert: zero unchecked items under PLAT-05
      3. Run: grep -A20 "PLAT-05.*Acceptance" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \[x\]"
      4. Assert: 10 checked items
    Expected Result: All PLAT-05 criteria marked complete
    Failure Indicators: Any unchecked item
    Evidence: .sisyphus/evidence/task-11-story-map.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: telegram-notify.ts script exists
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ PLAT-05 (Unify Delivery Path) complete — all tasks done, come back to review results."
      2. Assert exit code 0
    Expected Result: Notification delivered
    Failure Indicators: Script error or network failure
    Evidence: .sisyphus/evidence/task-11-telegram.txt
  ```

  **Commit**: YES
  - Message: `docs(story-map): mark PLAT-05 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify no models other than `minimax/minimax-m2.7` or `anthropic/claude-haiku-4-5` are referenced.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (delivery machine actually delivers after approval). Test edge cases: null delivery_instructions, delivery machine failure. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Verify deprecated files were NOT modified.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                                                  | Files                                                       | Pre-commit Check     |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------- |
| 1    | `feat(schema): add delivery_instructions column to archetypes`                  | `prisma/schema.prisma`, `prisma/migrations/*/migration.sql` | `pnpm build`         |
| 1    | `feat(harness): add ArchetypeRow.delivery_instructions + EMPLOYEE_PHASE check`  | `src/workers/opencode-harness.mts`                          | `pnpm build`         |
| 2    | `feat(harness): implement runDeliveryPhase for delivery-mode execution`         | `src/workers/opencode-harness.mts`                          | `pnpm build`         |
| 2    | `feat(lifecycle): unify delivery path — always spawn Fly.io machine with retry` | `src/inngest/employee-lifecycle.ts`                         | `pnpm build`         |
| 2    | `feat(seed): add delivery_instructions, remove DELIVERY_MODE from instructions` | `prisma/seed.ts`                                            | `pnpm build`         |
| 3    | `test(lifecycle): add delivery flow tests for universal employee lifecycle`     | `tests/inngest/employee-lifecycle.test.ts`                  | `pnpm test -- --run` |
| 3    | `test(harness): add delivery phase tests for opencode harness`                  | `tests/workers/opencode-harness-delivery.test.ts`           | `pnpm test -- --run` |
| 3    | `chore: remove DELIVERY_MODE/DELIVERY_MACHINE_ENABLED, update docs and tests`   | `tests/gateway/seed-guest-messaging.test.ts`, `docs/*.md`   | `pnpm test -- --run` |
| 4    | `docs(story-map): mark PLAT-05 acceptance criteria complete`                    | `docs/2026-04-21-2202-phase1-story-map.md`                  | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                          # Expected: exits 0
pnpm test -- --run                  # Expected: all pass (except pre-existing failures)
pnpm lint                           # Expected: exits 0
grep -r "DELIVERY_MACHINE_ENABLED\|DELIVERY_MODE" src/ prisma/  # Expected: zero matches
grep -n "postMessage" src/inngest/employee-lifecycle.ts          # Expected: zero matches
grep -n "delivery_instructions" prisma/schema.prisma             # Expected: 1 match
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, delivery_instructions IS NOT NULL FROM archetypes;"  # Expected: all rows have delivery_instructions
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] E2E trigger → approve → delivery machine → Done verified
- [ ] Story map PLAT-05 checkboxes all `[x]`
- [ ] Telegram notification sent
