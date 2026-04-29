# GM-09: Scheduled Message Polling Trigger

## TL;DR

> **Quick Summary**: Create an Inngest cron trigger that runs every 5 minutes, discovers tenants with a guest-messaging archetype, respects per-tenant polling intervals via config, and creates one task per tenant per polling window using floor-based deduplication.
>
> **Deliverables**:
>
> - `src/inngest/triggers/guest-message-poller.ts` — new cron trigger
> - `tests/inngest/triggers/guest-message-poller.test.ts` — unit tests (≥6 tests)
> - Updated `src/gateway/inngest/serve.ts` — register new function
> - Updated `prisma/seed.ts` — VLRE tenant config + archetype trigger_sources
> - Updated `docs/2026-04-21-2202-phase1-story-map.md` — GM-09 checkboxes marked done
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (trigger file) → Task 3 (registration) → Task 5 (unit tests) → Task 6 (E2E) → F1-F4

---

## Context

### Original Request

Implement GM-09 (Scheduled Message Polling Trigger) from the phase 1 story map. The trigger should run on a cron schedule, discover tenants with a guest-messaging archetype, create one task per tenant per polling window, and support configurable per-tenant polling intervals. Must include thorough automated tests and API endpoint verification, and mark story-map acceptance criteria as completed.

### Interview Summary

**Key Discussions**:

- GM-06 is confirmed DONE — all guest messaging infrastructure exists (archetype, shell tools, delivery flow)
- VLRE tenant wants 30-minute default polling interval
- User wants both unit tests AND E2E tests via Admin API
- Story-map checkboxes must be updated as a final task

**Research Findings**:

- `src/inngest/triggers/summarizer-trigger.ts` is the direct template (57 lines, clean pattern)
- `createTaskAndDispatch` handles archetype lookup, duplicate check, task creation, Inngest event dispatch
- Guest-messaging archetype already seeded (ID `00000000-0000-0000-0000-000000000015`) for VLRE tenant
- DB has `@@unique([external_id, source_system, tenant_id])` constraint
- `inngest-serve.test.ts` is a pre-existing stale test — MUST NOT be touched

### Metis Review

**Identified Gaps** (addressed):

- `windowKey` format: Resolved — use floor-based slot `Math.floor(Date.now() / (intervalMs))` for deterministic dedup
- Missing config fallback: Resolved — default to 30 minutes when `guest_messaging.poll_interval_minutes` absent
- E2E test cannot assert `Done` state: Resolved — assert up to `Reviewing` only (archetype has `approval_required: true`)
- Two PostgREST calls needed (archetypes + tenant config): Resolved — acceptable complexity
- `trigger_sources` update is seed-only metadata: Confirmed — nothing in runtime reads it
- `step.run` naming: Same pattern as summarizer — Inngest handles indexed step names in loops

---

## Work Objectives

### Core Objective

Create a cron-based Inngest trigger that automatically polls for unresponded guest messages across all tenants with a guest-messaging archetype, respecting per-tenant polling intervals.

### Concrete Deliverables

- New trigger file: `src/inngest/triggers/guest-message-poller.ts`
- Unit test file: `tests/inngest/triggers/guest-message-poller.test.ts`
- Updated registration: `src/gateway/inngest/serve.ts`
- Updated seed: `prisma/seed.ts` (VLRE tenant config + archetype trigger_sources)
- Updated story map: `docs/2026-04-21-2202-phase1-story-map.md` (GM-09 checkboxes)

### Definition of Done

- [ ] `pnpm build` exits cleanly (zero new TypeScript errors)
- [ ] `pnpm test -- --run` passes with zero new failures
- [ ] Trigger function appears in Inngest dashboard at `http://localhost:8288`
- [ ] Admin API trigger for `guest-messaging` creates a task and it reaches `Reviewing` status
- [ ] All GM-09 acceptance criteria checkboxes marked `[x]` in the story map

### Must Have

- Floor-based `windowKey` in `externalId` for deterministic dedup: `guest-poll-{tenantId}-{slotKey}`
- Per-tenant `poll_interval_minutes` read from `tenant.config.guest_messaging.poll_interval_minutes`
- Default of 30 minutes when config absent
- Cron fires every 5 minutes (`*/5 * * * *`) — per-tenant interval enforced via `windowKey` math
- Unit tests for: function ID, cron expression, archetypeSlug, sourceSystem, interval dedup, missing config fallback

### Must NOT Have (Guardrails)

- **DO NOT** modify `src/inngest/lib/create-task-and-dispatch.ts` — shared infrastructure
- **DO NOT** touch `tests/gateway/inngest-serve.test.ts` — pre-existing stale test per AGENTS.md
- **DO NOT** add `guest_messaging` config to the DozalDevs tenant — VLRE only
- **DO NOT** query the `tasks` table for last-run time — use floor-based slot key only
- **DO NOT** add more than 2 PostgREST calls inside the trigger (archetypes + tenant config)
- **DO NOT** implement different cron schedules per tenant — Inngest cron is fixed at `*/5 * * * *`
- **DO NOT** assert `Done` state in E2E test — `approval_required: true` means the task stalls at `Reviewing`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ passing tests)
- **Automated tests**: YES (Tests-after — implementation first, then unit tests)
- **Framework**: Vitest (bun test compat)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Trigger logic**: Use Bash (vitest) — run unit tests, assert pass count
- **Registration**: Use Bash (pnpm build + lsp_diagnostics) — verify TypeScript compilation
- **E2E**: Use Bash (curl) — trigger via Admin API, poll status, assert response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — implementation, all independent):
├── Task 1: Create guest-message-poller.ts trigger [quick]
├── Task 2: Update seed — VLRE tenant config + archetype trigger_sources [quick]

Wave 2 (After Wave 1 — depends on trigger file existing):
├── Task 3: Register trigger in serve.ts [quick]
├── Task 4: Unit tests for guest-message-poller [unspecified-high]
├── Task 5: E2E verification via Admin API [unspecified-high]
├── Task 6: Update story-map checkboxes [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks  |
| ----- | ---------- | ------- |
| 1     | —          | 3, 4, 5 |
| 2     | —          | 5       |
| 3     | 1          | 5       |
| 4     | 1          | —       |
| 5     | 1, 2, 3    | 6       |
| 6     | 5          | —       |
| F1-F4 | ALL        | —       |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 4 tasks — T3 → `quick`, T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create guest-message-poller trigger file

  **What to do**:
  - Create `src/inngest/triggers/guest-message-poller.ts` following the exact pattern of `src/inngest/triggers/summarizer-trigger.ts`
  - Factory function: `createGuestMessagePollerTrigger(inngest: Inngest): InngestFunction.Any`
  - Function ID: `trigger/guest-message-poller`
  - Cron: `*/5 * * * *` (every 5 minutes — the highest needed frequency)
  - **Step 1 — `discover-archetypes`**: PostgREST query to `archetypes?role_name=eq.guest-messaging&select=id,tenant_id` (same pattern as summarizer)
  - **Step 2 — `fetch-tenant-configs`**: For each archetype's `tenant_id`, fetch tenant config from `tenants?id=eq.{tenantId}&select=config`. Extract `config.guest_messaging.poll_interval_minutes` (default: `30` if absent). This can be a single PostgREST call with `id=in.(id1,id2)` to batch all tenant configs.
  - **Step 3 — Loop and dispatch**: For each archetype, compute `pollIntervalMs = pollIntervalMinutes * 60 * 1000`, then `slotKey = Math.floor(Date.now() / pollIntervalMs)`, then `externalId = guest-poll-${tenantId}-${slotKey}`. Call `createTaskAndDispatch({ inngest, step, tenantId, archetypeSlug: 'guest-messaging', externalId, sourceSystem: 'cron' })`.
  - If no archetypes found, log and return early (same as summarizer)
  - Import `createLogger` from `../../lib/logger.js` and `createTaskAndDispatch` from `../lib/create-task-and-dispatch.js`
  - Add the standard `// eslint-disable-next-line @typescript-eslint/no-explicit-any` for the step parameter typing

  **Must NOT do**:
  - DO NOT modify `createTaskAndDispatch` — use it as-is
  - DO NOT query the `tasks` table for last-run time
  - DO NOT make more than 2 PostgREST calls (one for archetypes, one batched for tenant configs)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation following a direct template — straightforward copy-and-adapt pattern
  - **Skills**: []
    - No special skills needed — standard TypeScript
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/inngest/triggers/summarizer-trigger.ts` (entire file, 57 lines) — THE template. Copy this file's structure exactly. Change: function name, ID, cron, role_name, externalId format. Add: tenant config fetch step + interval logic.
  - `src/inngest/lib/create-task-and-dispatch.ts` (entire file, 75 lines) — The utility being called. Read to understand the `CreateTaskAndDispatchParams` interface (line 3-11) and what it returns.

  **API/Type References**:
  - `src/inngest/lib/create-task-and-dispatch.ts:3-11` — `CreateTaskAndDispatchParams` interface: `{ inngest, step, tenantId, archetypeSlug, externalId, sourceSystem }`

  **External References**:
  - PostgREST query for tenant config: `${supabaseUrl}/rest/v1/tenants?id=in.(${tenantIds})&select=id,config` — batch fetch

  **WHY Each Reference Matters**:
  - `summarizer-trigger.ts`: Provides the exact factory function pattern, PostgREST headers, step.run wrapping, and createTaskAndDispatch call signature
  - `create-task-and-dispatch.ts`: Shows what parameters are expected and how dedup works (so you know you don't need to implement dedup yourself)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation succeeds
    Tool: Bash
    Preconditions: File created at src/inngest/triggers/guest-message-poller.ts
    Steps:
      1. Run: pnpm build
      2. Check exit code
    Expected Result: Exit code 0, no errors mentioning guest-message-poller
    Failure Indicators: TypeScript compilation errors in guest-message-poller.ts
    Evidence: .sisyphus/evidence/task-1-build-check.txt

  Scenario: lsp_diagnostics clean
    Tool: Bash (lsp_diagnostics)
    Preconditions: File created
    Steps:
      1. Run lsp_diagnostics on src/inngest/triggers/guest-message-poller.ts
      2. Filter for errors (not warnings)
    Expected Result: Zero errors in the new file
    Evidence: .sisyphus/evidence/task-1-lsp-diagnostics.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(triggers): add guest-message-poller cron trigger`
  - Files: `src/inngest/triggers/guest-message-poller.ts`, `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Update seed — VLRE tenant config + archetype trigger_sources

  **What to do**:
  - In `prisma/seed.ts`, update the VLRE tenant (`00000000-0000-0000-0000-000000000003`) config to add `guest_messaging: { poll_interval_minutes: 30 }` — in BOTH the `create` and `update` blocks (lines ~289-313)
  - In `prisma/seed.ts`, update the guest-messaging archetype (`00000000-0000-0000-0000-000000000015`) `trigger_sources` from `{ type: 'webhook' }` to `{ type: 'cron_and_webhook', cron_expression: '*/5 * * * *' }` — in BOTH the `create` and `update` blocks (lines ~3370-3430)
  - Ensure changes are in both `create` and `update` blocks of each upsert to be idempotent

  **Must NOT do**:
  - DO NOT add `guest_messaging` config to the DozalDevs tenant (`00000000-0000-0000-0000-000000000002`)
  - DO NOT modify any other archetype
  - DO NOT change `concurrency_limit`, `model`, `risk_model`, or other archetype fields

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple seed file edits — adding JSON keys to existing objects
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `prisma/seed.ts:282-314` — VLRE tenant upsert with `config` block. Add `guest_messaging` key alongside existing `notification_channel`, `source_channels`, `summary` keys.
  - `prisma/seed.ts:3370-3431` — Guest-messaging archetype upsert. Change `trigger_sources` in both `create` and `update` blocks.

  **WHY Each Reference Matters**:
  - Lines 282-314: Shows exact JSON structure of VLRE tenant config — must add key at the same nesting level as `summary`
  - Lines 3370-3431: Shows current `trigger_sources: { type: 'webhook' }` — this is what gets updated

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed file compiles
    Tool: Bash
    Preconditions: prisma/seed.ts modified
    Steps:
      1. Run: pnpm build
      2. Check exit code
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-2-build-check.txt

  Scenario: Seed is idempotent — re-running does not error
    Tool: Bash
    Preconditions: DB is running (docker compose up)
    Steps:
      1. Run: npx prisma db seed
      2. Run it again: npx prisma db seed
    Expected Result: Both runs complete without error, same output
    Failure Indicators: Unique constraint violation or prisma error
    Evidence: .sisyphus/evidence/task-2-seed-idempotent.txt

  Scenario: VLRE tenant config includes guest_messaging
    Tool: Bash (curl PostgREST)
    Preconditions: Seed has been run
    Steps:
      1. Run: curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "http://localhost:54321/rest/v1/tenants?id=eq.00000000-0000-0000-0000-000000000003&select=config" | jq '.[0].config.guest_messaging'
      2. Assert result is { "poll_interval_minutes": 30 }
    Expected Result: JSON object with poll_interval_minutes: 30
    Evidence: .sisyphus/evidence/task-2-vlre-config.txt

  Scenario: DozalDevs tenant config does NOT include guest_messaging
    Tool: Bash (curl PostgREST)
    Preconditions: Seed has been run
    Steps:
      1. Run: curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "http://localhost:54321/rest/v1/tenants?id=eq.00000000-0000-0000-0000-000000000002&select=config" | jq '.[0].config.guest_messaging'
      2. Assert result is null
    Expected Result: null (no guest_messaging key)
    Evidence: .sisyphus/evidence/task-2-dozaldevs-no-config.txt
  ```

  **Commit**: YES
  - Message: `chore(seed): add guest-messaging polling config to VLRE tenant`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Register trigger in serve.ts

  **What to do**:
  - In `src/gateway/inngest/serve.ts`, add import: `import { createGuestMessagePollerTrigger } from '../../inngest/triggers/guest-message-poller.js';`
  - Add instantiation: `const guestMessagePollerFn = createGuestMessagePollerTrigger(inngest);` (after line 32, the feedbackSummarizerFn line)
  - Add to functions array: `guestMessagePollerFn,` (after `feedbackSummarizerFn,` in the array on line 43)

  **Must NOT do**:
  - DO NOT remove or reorder existing functions in the array
  - DO NOT modify any other imports or instantiations
  - DO NOT touch `inngest-serve.test.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3-line addition to existing file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `src/gateway/inngest/serve.ts:9-11` — Existing trigger imports. Add the new import in the same style.
  - `src/gateway/inngest/serve.ts:30-32` — Existing trigger instantiations. Add new instantiation after feedbackSummarizerFn.
  - `src/gateway/inngest/serve.ts:36-44` — Functions array. Add new function at the end.

  **WHY Each Reference Matters**:
  - Lines 9-11: Shows import path convention (`../../inngest/triggers/{name}.js`)
  - Lines 30-32: Shows instantiation pattern (`const fn = createX(inngest)`)
  - Lines 36-44: Shows the array where all functions must be registered

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation succeeds after registration
    Tool: Bash
    Preconditions: Task 1 complete, serve.ts updated
    Steps:
      1. Run: pnpm build
      2. Check exit code
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-3-build-check.txt

  Scenario: Function count in serve.ts is 8
    Tool: Bash (grep)
    Preconditions: serve.ts updated
    Steps:
      1. Count entries in the functions array in src/gateway/inngest/serve.ts
      2. Verify guestMessagePollerFn appears in the array
    Expected Result: 8 functions in array, guestMessagePollerFn is one of them
    Evidence: .sisyphus/evidence/task-3-function-count.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(triggers): add guest-message-poller cron trigger`
  - Files: `src/inngest/triggers/guest-message-poller.ts`, `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Create unit tests for guest-message-poller

  **What to do**:
  - Create `tests/inngest/triggers/guest-message-poller.test.ts` following the exact pattern of `tests/inngest/triggers/summarizer-trigger.test.ts`
  - **Test 1**: Function ID is `'trigger/guest-message-poller'`
  - **Test 2**: Cron expression is `'*/5 * * * *'`
  - **Test 3**: Handler calls `createTaskAndDispatch` with `archetypeSlug: 'guest-messaging'`
  - **Test 4**: Handler calls `createTaskAndDispatch` with `sourceSystem: 'cron'`
  - **Test 5**: Handler uses floor-based `externalId` — mock a specific `Date.now()` value, verify the `externalId` passed to `createTaskAndDispatch` matches `guest-poll-{tenantId}-{expectedSlot}`. Use `vi.spyOn(Date, 'now')` or `vi.useFakeTimers()` to control time.
  - **Test 6**: Missing config fallback — when tenant config has no `guest_messaging` block, handler uses default 30-minute interval. Mock the PostgREST fetch for tenants to return `{ config: {} }` (no `guest_messaging` key). Verify `externalId` slot matches 30-minute interval calculation.
  - **Test 7**: No archetypes found — handler returns early without calling `createTaskAndDispatch`. Mock PostgREST to return empty array for archetypes.
  - Use `vi.hoisted()` + `vi.mock()` for `createTaskAndDispatch` (same as summarizer test)
  - Mock `global.fetch` to return appropriate responses for PostgREST calls (archetypes query returns `[{ id: 'arch-1', tenant_id: 'tenant-1' }]`, tenants query returns `[{ id: 'tenant-1', config: { guest_messaging: { poll_interval_minutes: 30 } } }]`)
  - Set `process.env.SUPABASE_URL` and `process.env.SUPABASE_SECRET_KEY` in test setup

  **Must NOT do**:
  - DO NOT modify `tests/gateway/inngest-serve.test.ts`
  - DO NOT modify the summarizer trigger test
  - DO NOT test `createTaskAndDispatch` internals — it has its own tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test cases with mocking complexity — needs careful mock setup for PostgREST responses and time control
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5, 6)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/inngest/triggers/summarizer-trigger.test.ts` (entire file, 75 lines) — THE template. Copy this file's structure for Tests 1-4, extend with Tests 5-7.
  - `src/inngest/triggers/guest-message-poller.ts` (the file created in Task 1) — The code under test. Read to understand the exact function name to import and the internal logic to verify.

  **API/Type References**:
  - `src/inngest/lib/create-task-and-dispatch.ts:3-11` — `CreateTaskAndDispatchParams` interface — know what fields to assert in mock calls

  **Test References**:
  - `tests/inngest/triggers/summarizer-trigger.test.ts:3-9` — Mock setup pattern: `vi.hoisted(() => vi.fn())` + `vi.mock()`
  - `tests/inngest/triggers/summarizer-trigger.test.ts:36-54` — Handler extraction pattern: `mockInngest.createFunction.mock.calls[0][1]`

  **WHY Each Reference Matters**:
  - `summarizer-trigger.test.ts`: Direct template — shows exact mock patterns, handler extraction, assertion style. Tests 1-4 are near-identical copies.
  - `guest-message-poller.ts`: Must read to verify the correct import name and ensure tests cover its actual logic paths.

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/inngest/triggers/guest-message-poller.test.ts`
  - [ ] `pnpm test tests/inngest/triggers/guest-message-poller.test.ts -- --run` → PASS (7 tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: Test file created, trigger file exists
    Steps:
      1. Run: pnpm test tests/inngest/triggers/guest-message-poller.test.ts -- --run
      2. Check output for pass/fail counts
    Expected Result: 7 tests pass, 0 failures
    Failure Indicators: Any test failure or import error
    Evidence: .sisyphus/evidence/task-4-unit-tests.txt

  Scenario: Full test suite has no new regressions
    Tool: Bash
    Preconditions: All implementation complete
    Steps:
      1. Run: pnpm test -- --run
      2. Compare failure list against known pre-existing failures (container-boot.test.ts, inngest-serve.test.ts)
    Expected Result: Zero new failures beyond pre-existing ones
    Failure Indicators: New test file failures, import errors in other test files
    Evidence: .sisyphus/evidence/task-4-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(triggers): add guest-message-poller unit tests`
  - Files: `tests/inngest/triggers/guest-message-poller.test.ts`
  - Pre-commit: `pnpm test tests/inngest/triggers/guest-message-poller.test.ts -- --run`

- [x] 5. E2E verification via Admin API

  **What to do**:
  - Start local services if not already running (`pnpm dev:start` — use tmux, this is long-running)
  - Ensure DB is seeded (seed was updated in Task 2 — run `npx prisma db seed` if needed)
  - **Test 1: Trigger guest-messaging via Admin API**:
    - `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger` with `X-Admin-Key` header
    - Assert: 202 response with `task_id` (UUID) and `status_url`
  - **Test 2: Verify task reaches expected state**:
    - Poll `GET /admin/tenants/00000000-0000-0000-0000-000000000003/tasks/{task_id}` every 10 seconds for up to 120 seconds
    - Assert: task status reaches at least `Executing` (the employee lifecycle will kick in)
    - NOTE: Do NOT assert `Done` — the archetype has `approval_required: true`, so the task will stall at `Reviewing` waiting for Slack approval. Asserting `Executing` or `Reviewing` is sufficient.
  - **Test 3: Verify the new trigger function appears in Inngest dashboard**:
    - `curl http://localhost:8288/v1/functions` or check the Inngest dev server UI
    - Assert: function with ID `trigger/guest-message-poller` exists in the registered functions list
  - **Test 4: Dry-run trigger**:
    - `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger?dry_run=true`
    - Assert: 200 response with dry_run confirmation, no task created
  - Save all curl commands and responses as evidence

  **Must NOT do**:
  - DO NOT assert `Done` state — task stalls at `Reviewing` due to `approval_required: true`
  - DO NOT interact with Slack buttons during E2E — only verify task creation and state transitions
  - DO NOT skip seeding the DB — the updated seed with `guest_messaging` config is required

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step E2E verification requiring service orchestration, polling, and state assertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Tasks 1-3)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3

  **References** (CRITICAL):

  **Pattern References**:
  - AGENTS.md § "Admin API" — curl examples for trigger and status endpoints
  - `scripts/trigger-task.ts` — full E2E trigger script (may have useful patterns for polling)

  **API/Type References**:
  - `POST /admin/tenants/:tenantId/employees/:slug/trigger` — returns `{ task_id, status_url }` with 202
  - `GET /admin/tenants/:tenantId/tasks/:id` — returns task object with `status` field
  - Tenant ID for VLRE: `00000000-0000-0000-0000-000000000003`
  - Archetype slug: `guest-messaging`

  **External References**:
  - Inngest dev server: `http://localhost:8288` — functions list shows registered cron triggers

  **WHY Each Reference Matters**:
  - AGENTS.md Admin API section: Has the exact curl command templates with correct headers and URLs
  - `scripts/trigger-task.ts`: Shows how the existing E2E script polls for task completion — can reuse the polling pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Admin API trigger creates a task
    Tool: Bash (curl)
    Preconditions: Services running (pnpm dev:start), DB seeded with updated seed
    Steps:
      1. Run: curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger" -d '{}'
      2. Parse response JSON
      3. Assert: HTTP status 202
      4. Assert: response has field "task_id" matching UUID pattern
      5. Assert: response has field "status_url"
    Expected Result: 202 response with valid task_id UUID
    Failure Indicators: 404 (archetype not found), 500 (server error), missing task_id
    Evidence: .sisyphus/evidence/task-5-trigger-response.json

  Scenario: Task reaches Executing or Reviewing state
    Tool: Bash (curl + polling loop)
    Preconditions: Task created from previous scenario
    Steps:
      1. Poll every 10s for up to 120s: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" | jq -r '.status'
      2. Assert: status transitions through Ready → Executing → ... (at minimum reaches Executing)
    Expected Result: Task status is "Executing", "Reviewing", or later state
    Failure Indicators: Status stuck at "Ready" after 120s, or status is "Failed"
    Evidence: .sisyphus/evidence/task-5-task-status-poll.txt

  Scenario: Trigger function registered in Inngest
    Tool: Bash (curl Inngest dev server)
    Preconditions: Services running
    Steps:
      1. Check Inngest dev server for registered functions
      2. Look for function ID containing "guest-message-poller"
    Expected Result: Function "trigger/guest-message-poller" is in the list
    Evidence: .sisyphus/evidence/task-5-inngest-functions.txt

  Scenario: Dry-run trigger does not create task
    Tool: Bash (curl)
    Preconditions: Services running
    Steps:
      1. Run: curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger?dry_run=true" -d '{}'
      2. Assert: 200 response (not 202)
      3. Assert: no task_id in response (or response indicates dry_run)
    Expected Result: Dry-run acknowledged without creating a real task
    Evidence: .sisyphus/evidence/task-5-dry-run.json
  ```

  **Commit**: NO (E2E is verification only, no code changes)

- [x] 6. Update story-map checkboxes for GM-09

  **What to do**:
  - In `docs/2026-04-21-2202-phase1-story-map.md`, find GM-09 acceptance criteria (lines 752-757)
  - Change all `- [ ]` to `- [x]` for the 6 acceptance criteria checkboxes
  - Specifically:
    - `- [x] New Inngest cron trigger: trigger/guest-message-poller fires at configurable interval`
    - `- [x] Trigger creates a task per tenant with active Guest Messaging archetype`
    - `- [x] Employee checks all properties for unresponded messages in a single run`
    - `- [x] Messages already processed (response sent or pending approval) are not re-processed`
    - `- [x] Duplicate prevention: external_id pattern prevents duplicate tasks for the same polling window`
    - `- [x] Cron frequency configurable per tenant via tenants.config (default: every 30 minutes)`

  **Must NOT do**:
  - DO NOT modify any other story's checkboxes
  - DO NOT change GM-09's description or attributes
  - DO NOT update any other section of the story map

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple checkbox toggle — 6 lines changing `[ ]` to `[x]`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 5 confirms everything works)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References** (CRITICAL):

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:750-757` — The exact lines to modify. Each line starts with `- [ ]` and needs to become `- [x]`.

  **WHY Each Reference Matters**:
  - Lines 750-757: These are the EXACT acceptance criteria checkboxes. There are 6 of them. All must be checked.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All GM-09 checkboxes are marked complete
    Tool: Bash (grep)
    Preconditions: Story map updated
    Steps:
      1. Search docs/2026-04-21-2202-phase1-story-map.md for lines between GM-09 header and the next "---" divider
      2. Count checkboxes: grep for "- [x]" in the GM-09 section
      3. Assert: 6 checkboxes, all marked [x]
      4. Verify no "- [ ]" (unchecked) remains in the GM-09 section
    Expected Result: 6/6 checkboxes marked [x], zero unchecked
    Evidence: .sisyphus/evidence/task-6-story-map-checkboxes.txt

  Scenario: No other stories were modified
    Tool: Bash (git diff)
    Preconditions: Story map updated
    Steps:
      1. Run: git diff docs/2026-04-21-2202-phase1-story-map.md
      2. Assert: only lines in the GM-09 section (between "#### GM-09" and "---") are changed
    Expected Result: Diff shows only GM-09 checkbox changes
    Evidence: .sisyphus/evidence/task-6-diff.txt
  ```

  **Commit**: YES
  - Message: `docs(story-map): mark GM-09 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

- [x] 7. Notify completion

  **What to do**:
  - Send Telegram notification: plan `gm09-guest-message-poller` complete, all tasks done, come back to review results.
  - Run: `tsx scripts/telegram-notify.ts "✅ gm09-guest-message-poller complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: All other tasks
  - **Blocks**: None

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                          | Files                                                                          | Pre-commit           |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------- |
| 1      | `feat(triggers): add guest-message-poller cron trigger`          | `src/inngest/triggers/guest-message-poller.ts`, `src/gateway/inngest/serve.ts` | `pnpm build`         |
| 2      | `chore(seed): add guest-messaging polling config to VLRE tenant` | `prisma/seed.ts`                                                               | `pnpm build`         |
| 3      | `test(triggers): add guest-message-poller unit tests`            | `tests/inngest/triggers/guest-message-poller.test.ts`                          | `pnpm test -- --run` |
| 4      | `docs(story-map): mark GM-09 acceptance criteria complete`       | `docs/2026-04-21-2202-phase1-story-map.md`                                     | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build           # Expected: exit 0, no new errors
pnpm test -- --run   # Expected: zero new failures (pre-existing failures in container-boot and inngest-serve are expected)
pnpm lint            # Expected: exit 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Trigger visible in Inngest dashboard
- [ ] Admin API trigger creates task reaching `Reviewing` status
- [ ] Story-map GM-09 checkboxes all `[x]`
