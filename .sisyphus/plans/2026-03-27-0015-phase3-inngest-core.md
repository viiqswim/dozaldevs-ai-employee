# Phase 3: Inngest Core — Events, Lifecycle Function, and Status Transitions

## TL;DR

> **Quick Summary**: Wire the Event Gateway to Inngest, implement the engineering task lifecycle function with optimistic-locking status transitions, concurrency control, cancellation checking, placeholder machine dispatch, a redispatch handler skeleton, and comprehensive unit + integration tests.
>
> **Deliverables**:
>
> - `src/inngest/lifecycle.ts` — Engineering task lifecycle function
> - `src/inngest/redispatch.ts` — Redispatch handler skeleton
> - Updated `src/gateway/inngest/serve.ts` — Register both functions
> - `tests/inngest/lifecycle.test.ts` — Unit tests for lifecycle steps
> - `tests/inngest/redispatch.test.ts` — Unit tests for redispatch
> - Updated `tests/gateway/inngest-serve.test.ts` — Integration tests for function registration
> - Updated `.sisyphus/progress.json` — Phase 3 checkpoints marked complete
> - `docs/YYYY-MM-DD-HHMM-phase3-inngest-core.md` — Phase completion document
>
> **Estimated Effort**: Medium (1-2 working sessions)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Task 10 → Task 14 → F1-F4

---

## Context

### Original Request

Create a granular work plan for Phase 3 (Inngest Core) of the AI Employee Platform. Each implementation task must have corresponding testing and documentation tasks. Plan includes progress.json updates and a final review/testing phase. Final deliverable is a phase completion document similar to `docs/2026-03-26-1511-phase1-foundation.md`.

### Interview Summary

**Key Discussions**:

- Phase 1 (Foundation) and Phase 2 (Event Gateway) are complete — 76 tests passing
- Test strategy: Unit tests with mocked Inngest steps + integration tests with Inngest Dev Server
- High accuracy mode: Momus review loop requested
- `inngest_send_failure` checkpoint already implemented in Phase 2 (jira.ts lines 97-115)

**Research Findings**:

- Inngest v4.1.0 SDK is installed; `createFunction()`, `step.run()`, `step.waitForEvent()` all compatible with §10 pseudo-code
- `step.waitForEvent()` returns `null` on timeout (does NOT throw) — critical for finalize logic
- `NonRetriableError` importable from `inngest` — use for optimistic lock failures to prevent retries
- `@inngest/test` package exists with `InngestTestEngine` — verify Vitest compatibility before use
- `scope: 'fn'` is valid in v4 for per-function concurrency limits
- Prisma's `updateMany()` returns `{ count: N }` (for optimistic locking); `update()` throws on not-found

### Metis Review

**Identified Gaps** (addressed):

- `inngest_send_failure` is already Phase 2 work → marked as verification-only, not re-implemented
- Prisma injection pattern undefined → resolved: factory function `createLifecycleFunction(prisma)` matching Gateway's `buildApp(options)` pattern
- `updateMany` not `update` for optimistic locking → enforced in all DB operations
- Step 2 (Fly.io dispatch) must be a strict placeholder → guardrail set
- Slack notification must be stubbed → console.warn with TODO comment
- `waitForEvent` race condition mitigation is Phase 7, not Phase 3 → scope boundary set
- `actor: 'lifecycle_fn'` on all status log entries → explicit in every transition task
- `@inngest/test` Vitest compatibility needs verification → added as dependency-gating task

---

## Work Objectives

### Core Objective

Connect the Event Gateway to Inngest so that `engineering/task.received` events trigger the engineering lifecycle function, which transitions task status through the state machine with optimistic locking, concurrency control, and cancellation checking.

### Concrete Deliverables

- `src/inngest/lifecycle.ts` — Full lifecycle function with Steps 1-4
- `src/inngest/redispatch.ts` — Redispatch handler skeleton
- Updated `src/gateway/inngest/serve.ts` — Both functions registered
- Full test coverage in `tests/inngest/` (unit) and `tests/gateway/` (integration)
- Updated `progress.json` with all Phase 3 checkpoints complete
- Phase completion doc in `docs/`

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 failures (all 76 existing + new Phase 3 tests)
- [ ] `pnpm build` compiles clean (0 TypeScript errors)
- [ ] `pnpm lint` passes clean
- [ ] All Phase 3 checkpoints in `progress.json` are `complete`
- [ ] Phase completion doc exists and accurately describes what was built

### Must Have

- Optimistic locking on every status transition (`WHERE status = $expected`)
- `NonRetriableError` on lock failure (not a regular Error that Inngest retries)
- Concurrency control: `{ limit: 3, key: "event.data.projectId", scope: "fn" }`
- Cancellation check before machine dispatch placeholder
- `task_status_log` entry with `actor: 'lifecycle_fn'` on every transition
- `step.waitForEvent("engineering/task.completed", { timeout: "4h10m" })` for completion
- Finalize step handling: success, timeout re-dispatch, max-attempts escalation
- Re-dispatch handler skeleton emitting new lifecycle event via `step.sendEvent()`
- Step 2 as PLACEHOLDER returning `{ id: 'placeholder-machine-id' }`

### Must NOT Have (Guardrails)

- **No real Fly.io API calls** — Step 2 is a placeholder. No `flyApi` import. Phase 5 concern.
- **No Execution record creation** — `executions` table writes are Phase 4.
- **No triage agent calls** — Phase 3 reads `triage_result` from task record directly.
- **No `cancelOn` in createFunction options** — Phase 3 uses explicit Step 1.5 check.
- **No `waitForEvent` race condition pre-check** — That's Phase 7 (`waitforevent_race_fix`).
- **No `repoUrl`/`repoBranch` in event payload** — Phase 5 concern.
- **No watchdog cron function** — Phase 7.
- **No cost circuit breaker** — Phase 7.
- **No real Slack client** — Stub with `console.warn()` + TODO comment.
- **No Supabase JS client** — All DB operations use Prisma (translate §10 pseudo-code from `supabase.from()` to `prisma.task.updateMany()`).
- **Do NOT re-implement `inngest_send_failure`** — already done in Phase 2.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest from Phase 1, 76 tests passing)
- **Automated tests**: YES (tests-after — implement then test)
- **Framework**: Vitest (existing) + `@inngest/test` (if compatible, verified in Task 1)
- **Integration tests**: Against Inngest Dev Server when `INNGEST_DEV_URL` env var is set

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Lifecycle function**: Use Bash (Vitest) — Run unit tests, assert DB state via Prisma
- **Function registration**: Use Bash (curl) — Hit `/api/inngest`, parse JSON response
- **Integration**: Use Bash (Inngest Dev Server) — Send events, verify step execution

### Status Transition Reference Table

Every lifecycle function status transition MUST write a `task_status_log` entry with these exact values:

| Transition                                                | `from_status` | `to_status`     | `actor`        |
| --------------------------------------------------------- | ------------- | --------------- | -------------- |
| Step 1: Ready → Executing                                 | `Ready`       | `Executing`     | `lifecycle_fn` |
| Finalize timeout, re-dispatch: Executing → Ready          | `Executing`   | `Ready`         | `lifecycle_fn` |
| Finalize timeout, exhausted: Executing → AwaitingInput    | `Executing`   | `AwaitingInput` | `lifecycle_fn` |
| Finalize success: (no write — machine already wrote Done) | —             | —               | —              |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + dependency verification):
├── Task 1: Verify @inngest/test + Vitest compatibility and CEL expression format [quick]
├── Task 2: Mark inngest_send_failure checkpoint as verified-complete [quick]
└── Task 3: Create lifecycle function with factory pattern and Steps 1-4 [deep]

Wave 2 (After Wave 1 — dependent implementation + unit tests):
├── Task 4: Create redispatch handler skeleton [quick]
├── Task 5: Register both functions in serve.ts [quick]
├── Task 6: Unit tests for lifecycle function step behavior [unspecified-high]
├── Task 7: Unit tests for redispatch function [quick]
└── Task 8: Integration tests for function registration [quick]

Wave 3 (After Wave 2 — integration, documentation, tracking):
├── Task 9: Integration tests with Inngest Dev Server [unspecified-high]
├── Task 10: Update progress.json with Phase 3 checkpoint statuses [quick]
├── Task 11: Write phase 3 completion document [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 5 → Task 6 → Task 9 → Task 10 → Task 11 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks  |
| ---- | ---------- | ------- |
| 1    | —          | 3, 6, 7 |
| 2    | —          | 10      |
| 3    | 1          | 4, 5, 6 |
| 4    | 3          | 5, 7    |
| 5    | 3, 4       | 8, 9    |
| 6    | 3, 1       | 9       |
| 7    | 4, 1       | 9       |
| 8    | 5          | 9       |
| 9    | 5, 6, 7, 8 | 10      |
| 10   | 2, 9       | 11      |
| 11   | 10         | F1-F4   |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `deep`
- **Wave 2**: **5** — T4 → `quick`, T5 → `quick`, T6 → `unspecified-high`, T7 → `quick`, T8 → `quick`
- **Wave 3**: **3** — T9 → `unspecified-high`, T10 → `quick`, T11 → `writing`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Verify @inngest/test Vitest compatibility and CEL expression format

  **What to do**:
  - Check if `@inngest/test` package supports Vitest (not just Jest). Read its documentation or test it by installing and running a minimal test.
  - If compatible: install with `pnpm add -D @inngest/test` and note in a comment at the top of future test files.
  - If NOT compatible: document that Phase 3 tests will use the existing `vi.fn()` mock pattern from Phase 2 (as in `tests/setup.ts`).
  - Verify the CEL expression format for `step.waitForEvent()` `if` field in Inngest v4. Specifically confirm: `if: \`async.data.taskId == '${taskId}'\``is valid CEL for matching on the incoming event's`data.taskId` field. Check Inngest v4 docs or source for the exact syntax.
  - Create a brief finding document at `.sisyphus/evidence/task-1-inngest-test-compat.md` summarizing the results.

  **Must NOT do**:
  - Do NOT write any lifecycle function code in this task
  - Do NOT modify any existing source files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Research and verification task, no implementation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — this is a research task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 6, 7 (test framework decision gates all test-writing tasks)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/setup.ts:56-60` — Existing `inngestMock` pattern with `vi.fn()` — this is the fallback if `@inngest/test` is not Vitest-compatible
  - `tests/gateway/inngest-send.test.ts` — Phase 2 Inngest mock usage pattern

  **API/Type References**:
  - `package.json:29` — `"inngest": "^4.1.0"` — current Inngest SDK version
  - `src/gateway/inngest/send.ts:28-32` — Event shape: `{ name: 'engineering/task.received', data: { taskId, projectId }, id?: eventId }` — the CEL expression must match against this `data.taskId` field

  **External References**:
  - Inngest docs: `https://www.inngest.com/docs/reference/functions/step-wait-for-event` — `waitForEvent` `if` expression syntax
  - `@inngest/test` npm: `https://www.npmjs.com/package/@inngest/test` — compatibility info

  **WHY Each Reference Matters**:
  - `tests/setup.ts` provides the fallback testing pattern if `@inngest/test` doesn't work with Vitest
  - The CEL expression format determines whether `step.waitForEvent` can filter events by `taskId` — if the syntax is wrong, the lifecycle function will receive ALL completion events, not just the one for its task

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: @inngest/test Vitest compatibility check
    Tool: Bash
    Preconditions: Clean working directory
    Steps:
      1. Run: pnpm add -D @inngest/test
      2. Create a minimal test file that imports from @inngest/test and runs with vitest
      3. Run: pnpm test -- --run tests/inngest/compat-check.test.ts
      4. If passes: @inngest/test is compatible — note in evidence file
      5. If fails: remove @inngest/test (pnpm remove @inngest/test), note fallback to vi.fn() pattern
    Expected Result: Clear determination of which test pattern to use, documented in evidence file
    Failure Indicators: Import errors, type incompatibilities, or test runner crashes
    Evidence: .sisyphus/evidence/task-1-inngest-test-compat.md

  Scenario: CEL expression format verification
    Tool: Bash
    Preconditions: Inngest v4 docs accessible
    Steps:
      1. Search Inngest v4 documentation for step.waitForEvent `if` expression syntax
      2. Verify that `async.data.taskId == 'uuid-value'` is valid CEL
      3. Check if the field name is `async.data` or `event.data` in v4
      4. Document the correct expression format in evidence file
    Expected Result: Confirmed CEL expression format with correct field name documented
    Failure Indicators: Documentation shows different field name than `async.data`
    Evidence: .sisyphus/evidence/task-1-inngest-test-compat.md
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-inngest-test-compat.md` with: (1) @inngest/test decision, (2) CEL expression format

  **Commit**: NO (research task, no source changes. Remove compat-check.test.ts if created.)

- [x] 2. Mark inngest_send_failure checkpoint as verified-complete

  **What to do**:
  - Verify that the `inngest_send_failure` behavior described in the Phase 3 checkpoint is already implemented in Phase 2.
  - Read `src/gateway/routes/jira.ts` lines 97-115 and confirm: if `inngest.send()` fails after 3 retries → 202 response → task stays in DB with `raw_event` preserved.
  - Read `tests/gateway/inngest-send.test.ts` and confirm test coverage for this behavior exists.
  - Run the specific test to verify: `pnpm test -- --run tests/gateway/inngest-send.test.ts`
  - Document verification in evidence file. This checkpoint requires NO new code — it's verification-only.

  **Must NOT do**:
  - Do NOT modify any source files
  - Do NOT re-implement the send failure handling
  - Do NOT write new tests (existing tests cover this)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification only, no implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 10 (progress.json update needs this verified)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/gateway/routes/jira.ts:97-115` — The existing implementation: checks `sendResult.success`, returns 202 with `action: 'queued_without_inngest'` on failure
  - `src/gateway/inngest/send.ts:20-53` — `sendTaskReceivedEvent()` with 3-retry backoff and error capture
  - `tests/gateway/inngest-send.test.ts` — Existing tests covering retry logic, failure handling

  **WHY Each Reference Matters**:
  - `jira.ts` line 106 is exactly the `inngest_send_failure` checkpoint behavior — confirming this avoids re-implementing existing code

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify inngest_send_failure is already implemented
    Tool: Bash
    Preconditions: Tests passing from Phase 2
    Steps:
      1. Run: pnpm test -- --run tests/gateway/inngest-send.test.ts
      2. Assert: All tests pass (7 tests expected)
      3. Grep jira.ts for "queued_without_inngest" to confirm 202 response path exists
      4. Grep jira.ts for status code 202 to confirm failure response
    Expected Result: All 7 inngest-send tests pass, 202 response code confirmed in jira.ts
    Failure Indicators: Any test failure, or missing 202 response in jira.ts
    Evidence: .sisyphus/evidence/task-2-send-failure-verified.txt

  Scenario: Verify raw_event preservation on failure
    Tool: Bash
    Preconditions: Tests passing
    Steps:
      1. Run: pnpm test -- --run tests/gateway/jira-webhook.test.ts
      2. Assert: The "Inngest send fails" test scenario passes
      3. This confirms task stays in DB with status and raw_event when Inngest send fails
    Expected Result: Jira webhook test suite passes, confirming failure recovery path
    Evidence: .sisyphus/evidence/task-2-send-failure-verified.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-send-failure-verified.txt` with test output confirming all inngest-send tests pass

  **Commit**: NO (verification only, no code changes)

- [x] 3. Create engineering task lifecycle function with factory pattern and Steps 1-4

  **What to do**:
  - Create `src/inngest/lifecycle.ts` exporting:
    - `createLifecycleFunction(inngest: Inngest, prisma: PrismaClient)` — factory function returning the Inngest function (matches Gateway's DI pattern)
    - The function: `inngest.createFunction({ id: 'engineering/task-lifecycle', concurrency: [{ limit: 3, key: 'event.data.projectId', scope: 'fn' }] }, { event: 'engineering/task.received' }, handler)`
  - **Step 1 (`update-status-executing`)**: Use `prisma.task.updateMany({ where: { id: taskId, status: 'Ready' }, data: { status: 'Executing', updated_at: new Date() } })`. Check `count === 0` → throw `new NonRetriableError(\`Task ${taskId} optimistic lock failed: expected status Ready, task may have been modified by concurrent writer or does not exist\`)`. If `count === 1`→ write`task_status_log`entry:`{ task_id: taskId, from_status: 'Ready', to_status: 'Executing', actor: 'lifecycle_fn' }`.
  - **Step 1.5 (`check-cancellation`)**: Read task status from DB. If `status === 'Cancelled'` → return early (no further steps run). No DB write needed (Gateway already logged the cancellation).
  - **Step 2 (`dispatch-fly-machine`)**: PLACEHOLDER. Return `{ id: 'placeholder-machine-id' }`. Add comment: `// TODO Phase 5: Replace with real Fly.io machine dispatch via flyApi.createMachine()`
  - **Step 3 (`wait-for-completion`)**: `step.waitForEvent('wait-for-completion', { event: 'engineering/task.completed', timeout: '4h10m', if: \`async.data.taskId == '${taskId}'\` })` — use the CEL expression format confirmed by Task 1.
  - **Step 4 (`finalize`)**: Handle three paths:
    - **Timeout (`result === null`)**: Read `dispatch_attempts` from DB. If `< 3`: increment `dispatch_attempts`, set `status: 'Ready'`, write `task_status_log` (`Executing → Ready`, `lifecycle_fn`), emit `engineering/task.redispatch` via `inngest.send()`. If `>= 3`: set `status: 'AwaitingInput'`, set `failure_reason: \`Exhausted ${attempts} re-dispatch attempts\``, write `task_status_log` (`Executing → AwaitingInput`, `lifecycle_fn`), stub Slack: `console.warn(\`[SLACK STUB] Task ${taskId} failed after ${attempts} attempts. Manual intervention required.\`)`.
    - **Success (`result !== null`)**: Read task status. If not `Done`: update to `result.data.status ?? 'Done'`. Add comment: `// TODO Phase 6: Machine sends task.completed event with status and PR URL`
    - **Machine cleanup**: `// TODO Phase 5: await flyApi.destroyMachine(machine.id).catch(() => {})` — placeholder comment only.
  - Import `NonRetriableError` from `inngest`.
  - All DB operations use Prisma, NOT Supabase JS client.

  **Must NOT do**:
  - No real Fly.io API calls or `flyApi` import
  - No `Execution` record creation (Phase 4)
  - No triage agent calls
  - No `cancelOn` in createFunction options
  - No `waitForEvent` race condition pre-check (Phase 7)
  - No Supabase JS client usage

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core implementation task requiring careful translation of §10 pseudo-code to Prisma + Inngest v4, with multiple step paths and edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 4, 5, 6 (all depend on lifecycle function existing)
  - **Blocked By**: Task 1 (CEL expression format must be confirmed first)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/gateway/server.ts:21-54` — `buildApp(options)` factory pattern — the lifecycle function's factory `createLifecycleFunction(inngest, prisma)` must follow this DI approach for testability
  - `src/gateway/services/task-creation.ts` — How Phase 2 writes `task_status_log` entries in a transaction — follow same `prisma.taskStatusLog.create()` pattern
  - `src/gateway/inngest/send.ts:28-32` — Event shape for `engineering/task.received`: `{ name, data: { taskId, projectId }, id? }` — the lifecycle function's `event.data` will have `taskId` and `projectId`

  **API/Type References**:
  - Architecture doc §10 lines 1106-1243 (`docs/2026-03-22-2317-ai-employee-architecture.md` lines 1106-1243) — Full pseudo-code for the lifecycle function. CRITICAL: This pseudo-code uses Supabase JS client (`supabase.from()`) — translate ALL DB calls to Prisma (`prisma.task.updateMany()`)
  - Architecture doc §13 lines 1500-1738 — Data model: `tasks` table fields, `task_status_log` table fields, CHECK constraints

  **External References**:
  - Inngest v4 `createFunction` docs: `https://www.inngest.com/docs/reference/functions/create`
  - Inngest `NonRetriableError` docs: `https://www.inngest.com/docs/reference/functions/handling-failures`

  **WHY Each Reference Matters**:
  - §10 pseudo-code is THE spec — but it uses Supabase, not Prisma. Every DB call must be translated.
  - `buildApp()` factory is the established DI pattern — deviating would make the lifecycle function untestable.
  - `task_status_log` actor CHECK constraint (`gateway`, `lifecycle_fn`, `watchdog`, `machine`, `manual`) — using any other string crashes with a DB error.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lifecycle function compiles and exports correctly
    Tool: Bash
    Preconditions: src/inngest/lifecycle.ts created
    Steps:
      1. Run: pnpm build
      2. Assert: 0 TypeScript errors
      3. Verify the file exports createLifecycleFunction by grepping: grep "export function createLifecycleFunction" src/inngest/lifecycle.ts
    Expected Result: TypeScript compiles clean, factory function exported
    Failure Indicators: TypeScript errors, missing export
    Evidence: .sisyphus/evidence/task-3-lifecycle-build.txt

  Scenario: NonRetriableError import verified
    Tool: Bash
    Preconditions: src/inngest/lifecycle.ts created
    Steps:
      1. Grep for NonRetriableError import: grep "NonRetriableError" src/inngest/lifecycle.ts
      2. Assert: Import exists from 'inngest' package
    Expected Result: NonRetriableError is imported and used for optimistic lock failures
    Failure Indicators: Missing import, or using regular Error instead
    Evidence: .sisyphus/evidence/task-3-lifecycle-build.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-lifecycle-build.txt` with TypeScript compilation output

  **Commit**: YES
  - Message: `feat(inngest): implement engineering task lifecycle function with optimistic locking`
  - Files: `src/inngest/lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Create engineering task redispatch function skeleton

  **What to do**:
  - Create `src/inngest/redispatch.ts` exporting:
    - `createRedispatchFunction(inngest: Inngest, prisma: PrismaClient)` — factory function returning the Inngest function
    - The function: `inngest.createFunction({ id: 'engineering/task-redispatch' }, { event: 'engineering/task.redispatch' }, handler)`
  - The handler:
    - Extract `taskId` and `attempt` from `event.data`
    - Add comment: `// TODO Phase 5: Implement elapsed time check using task.created_at (6-hour total budget)`
    - Use `step.sendEvent('restart-lifecycle', { name: 'engineering/task.received', data: { taskId, attempt, ...originalEventData } })` to trigger a new lifecycle function instance
    - NOTE: Use `step.sendEvent()` (durable, inside step) — NOT `inngest.send()` (non-durable)
  - Keep this minimal — it's a skeleton for Phase 5 to flesh out.

  **Must NOT do**:
  - No elapsed time budget tracking (Phase 5)
  - No real machine dispatch
  - No complex retry logic beyond re-emitting the lifecycle event

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small function, skeleton only, follows established pattern from Task 3
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6 if Task 3 is done)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: Task 3 (must follow same factory pattern)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/inngest/lifecycle.ts` — (created in Task 3) — factory pattern and Inngest function structure to follow exactly
  - Architecture doc §10 lines 1229-1243 — Redispatch pseudo-code: `engineeringTaskRedispatch` function spec

  **API/Type References**:
  - `src/gateway/inngest/send.ts:28-32` — Event shape for `engineering/task.received` — the redispatch function must emit this exact event shape

  **WHY Each Reference Matters**:
  - The lifecycle.ts factory pattern must be followed exactly for consistency and testability
  - The redispatch must emit `engineering/task.received` (not a different event name) so the lifecycle function picks it up

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Redispatch function compiles and exports correctly
    Tool: Bash
    Preconditions: src/inngest/redispatch.ts created
    Steps:
      1. Run: pnpm build
      2. Assert: 0 TypeScript errors
      3. Grep for factory export: grep "export function createRedispatchFunction" src/inngest/redispatch.ts
      4. Grep for step.sendEvent usage: grep "step.sendEvent" src/inngest/redispatch.ts
    Expected Result: Compiles clean, factory exported, uses step.sendEvent (not inngest.send)
    Failure Indicators: TypeScript errors, missing export, wrong send method
    Evidence: .sisyphus/evidence/task-4-redispatch-build.txt

  Scenario: Verify step.sendEvent is used (not inngest.send)
    Tool: Bash
    Preconditions: src/inngest/redispatch.ts created
    Steps:
      1. Grep for inngest.send: grep "inngest.send" src/inngest/redispatch.ts
      2. Assert: No matches (inngest.send should NOT appear in the redispatch function)
      3. Grep for step.sendEvent: grep "step.sendEvent" src/inngest/redispatch.ts
      4. Assert: At least one match
    Expected Result: step.sendEvent used, inngest.send absent
    Evidence: .sisyphus/evidence/task-4-redispatch-build.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-4-redispatch-build.txt` with build output and grep results

  **Commit**: YES
  - Message: `feat(inngest): implement engineering task redispatch function skeleton`
  - Files: `src/inngest/redispatch.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Register both functions in serve.ts and verify function discovery

  **What to do**:
  - Modify `src/gateway/inngest/serve.ts`:
    - Import `createLifecycleFunction` from `../../inngest/lifecycle.js`
    - Import `createRedispatchFunction` from `../../inngest/redispatch.js`
    - Create a `PrismaClient` instance (lazy — inside the `inngestServeRoutes` function, not at module level)
    - Pass the `inngest` client and `prisma` to both factory functions
    - Register both returned functions in the `functions: [lifecycleFn, redispatchFn]` array
  - Ensure no circular dependency: `serve.ts` imports from `src/inngest/` which does NOT import back from `src/gateway/`. Verify by checking the lifecycle.ts imports.
  - Run `pnpm build` and `pnpm test -- --run` to confirm all 76 existing tests still pass (especially `tests/gateway/inngest-serve.test.ts`).

  **Must NOT do**:
  - No PrismaClient at module-level (startup failure risk if DB is unavailable)
  - No circular imports between `src/gateway/` and `src/inngest/`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small file modification, wiring existing code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must wait for Tasks 3 and 4)
  - **Parallel Group**: Wave 2 (can be parallel with Tasks 6, 7 once 3+4 are done)
  - **Blocks**: Tasks 8, 9 (integration tests need registered functions)
  - **Blocked By**: Tasks 3, 4

  **References** (CRITICAL):

  **Pattern References**:
  - `src/gateway/inngest/serve.ts` — Current file with `functions: []` placeholder — this is what gets modified
  - `src/gateway/server.ts:44` — How Prisma is instantiated in the Gateway: `const prisma = new PrismaClient()` inside the `buildApp()` function (not module-level)
  - `src/inngest/lifecycle.ts` — (created in Task 3) — import path and factory function signature
  - `src/inngest/redispatch.ts` — (created in Task 4) — import path and factory function signature

  **Test References**:
  - `tests/gateway/inngest-serve.test.ts` — Existing tests that MUST still pass after modification

  **WHY Each Reference Matters**:
  - `serve.ts` is the ONLY file that needs modification — it's the wiring point between Gateway and Inngest functions
  - Prisma instantiation pattern (inside function, not module-level) prevents startup failures
  - Existing inngest-serve tests verify the endpoint still works after adding functions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All existing tests still pass after serve.ts modification
    Tool: Bash
    Preconditions: serve.ts modified with function registration
    Steps:
      1. Run: pnpm build
      2. Assert: 0 TypeScript errors
      3. Run: pnpm test -- --run
      4. Assert: All 76+ tests pass with 0 failures
    Expected Result: Zero test regressions
    Failure Indicators: Any existing test fails
    Evidence: .sisyphus/evidence/task-5-serve-regression.txt

  Scenario: No circular dependencies
    Tool: Bash
    Preconditions: serve.ts imports from src/inngest/
    Steps:
      1. Grep lifecycle.ts imports: grep "from.*gateway" src/inngest/lifecycle.ts
      2. Assert: No matches (lifecycle must NOT import from gateway)
      3. Grep redispatch.ts imports: grep "from.*gateway" src/inngest/redispatch.ts
      4. Assert: No matches
    Expected Result: No circular dependency between gateway and inngest directories
    Failure Indicators: Any import from src/gateway/ in src/inngest/ files
    Evidence: .sisyphus/evidence/task-5-serve-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-5-serve-regression.txt` with full test output

  **Commit**: YES
  - Message: `feat(gateway): register lifecycle and redispatch functions with inngest serve`
  - Files: `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build && pnpm test -- --run`

- [x] 6. Unit tests for lifecycle function step behavior

  **What to do**:
  - Create `tests/inngest/lifecycle.test.ts` with the following test groups:
  - **Group 1: Step 1 — Optimistic locking (4+ tests)**:
    - Happy path: Task in `Ready` → status transitions to `Executing`, `task_status_log` entry created with `actor: 'lifecycle_fn'`
    - Lock conflict: Task already in `Executing` → `NonRetriableError` thrown, no `task_status_log` entry written
    - Task not found: Non-existent `taskId` → `NonRetriableError` thrown
    - Duplicate event: Same task triggered twice → second invocation fails at lock
  - **Group 2: Step 1.5 — Cancellation check (2+ tests)**:
    - Task cancelled between Step 1 and Step 1.5 → function returns early, Step 2 never called
    - Task still Executing → function continues to Step 2
  - **Group 3: Step 2 — Machine dispatch placeholder (1 test)**:
    - Placeholder returns `{ id: 'placeholder-machine-id' }`
  - **Group 4: Step 4 — Finalize (4+ tests)**:
    - Timeout, `dispatch_attempts: 0` → status set to `Ready`, `dispatch_attempts: 1`, `task_status_log` entry (`Executing → Ready`, `lifecycle_fn`), `engineering/task.redispatch` event emitted
    - Timeout, `dispatch_attempts: 3` → status set to `AwaitingInput`, `failure_reason` populated, `task_status_log` entry (`Executing → AwaitingInput`, `lifecycle_fn`), Slack stub called (console.warn)
    - Success event received → task status confirmed as `Done`
    - Timeout, `dispatch_attempts: 1` → verify `dispatch_attempts` incremented to 2
  - Use the test pattern decided by Task 1 (`@inngest/test` or `vi.fn()` mocks).
  - Use `getPrisma()` from `tests/setup.ts` for DB assertions.
  - Use `cleanupTestData()` in `afterEach` to prevent test pollution.
  - All DB assertions check actual table state (not mock return values).

  **Must NOT do**:
  - No tests requiring Inngest Dev Server (those are Task 9)
  - No tests for behaviors outside Phase 3 scope (watchdog, cost breaker, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex test suite covering multiple step paths, DB assertions, and edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 7 if 3 is done)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9 (integration tests depend on unit tests passing)
  - **Blocked By**: Tasks 3 (lifecycle function must exist), 1 (test framework decision)

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/gateway/task-creation.test.ts` — DB assertion pattern: how to create test records, assert state after function calls, clean up
  - `tests/gateway/inngest-send.test.ts` — Mock pattern for Inngest-related testing
  - `tests/setup.ts:15-28` — `cleanupTestData()` — MUST be used in `afterEach` to prevent test pollution

  **API/Type References**:
  - `src/inngest/lifecycle.ts` — (created in Task 3) — the factory function signature determines how to instantiate the function in tests
  - `prisma/schema.prisma` — `TaskStatusLog` model fields: `task_id`, `from_status`, `to_status`, `actor`

  **WHY Each Reference Matters**:
  - `task-creation.test.ts` shows the established pattern for creating test data, running assertions, and cleaning up — consistency with Phase 2 is critical
  - `cleanupTestData()` prevents test pollution — skipping it causes intermittent failures

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All lifecycle unit tests pass
    Tool: Bash
    Preconditions: tests/inngest/lifecycle.test.ts created, lifecycle function exists
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle.test.ts
      2. Assert: All tests pass (expect 11+ tests across 4 groups)
      3. Assert: 0 test failures
    Expected Result: 11+ tests passing with 0 failures
    Failure Indicators: Any test failure, or fewer than 11 tests
    Evidence: .sisyphus/evidence/task-6-lifecycle-tests.txt

  Scenario: Full suite regression check
    Tool: Bash
    Preconditions: All test files present
    Steps:
      1. Run: pnpm test -- --run
      2. Assert: All tests pass (76 existing + new lifecycle tests)
    Expected Result: Zero regressions, total test count increased
    Failure Indicators: Any previously passing test now fails
    Evidence: .sisyphus/evidence/task-6-lifecycle-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-6-lifecycle-tests.txt` with full Vitest output

  **Commit**: YES (groups with Task 7)
  - Message: `test(inngest): add unit tests for lifecycle and redispatch functions`
  - Files: `tests/inngest/lifecycle.test.ts`, `tests/inngest/redispatch.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Unit tests for redispatch function

  **What to do**:
  - Create `tests/inngest/redispatch.test.ts` with:
    - **Test 1**: Redispatch emits `engineering/task.received` event via `step.sendEvent`
    - **Test 2**: Event data includes `taskId` and `attempt` from the trigger event
    - **Test 3**: Function ID is `engineering/task-redispatch`
  - Use the same test pattern as Task 6.
  - Use `cleanupTestData()` in `afterEach`.

  **Must NOT do**:
  - No tests for elapsed time budget (Phase 5)
  - No tests requiring Inngest Dev Server

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small test file, 3 tests, follows pattern from Task 6
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 8 if Task 4 done)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 4, 1

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/inngest/lifecycle.test.ts` — (created in Task 6) — follow exact same test structure and mock pattern
  - `src/inngest/redispatch.ts` — (created in Task 4) — the function under test

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All redispatch unit tests pass
    Tool: Bash
    Preconditions: tests/inngest/redispatch.test.ts created
    Steps:
      1. Run: pnpm test -- --run tests/inngest/redispatch.test.ts
      2. Assert: All 3 tests pass
    Expected Result: 3 tests passing
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-redispatch-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-7-redispatch-tests.txt` with Vitest output

  **Commit**: YES (groups with Task 6)
  - Message: `test(inngest): add unit tests for lifecycle and redispatch functions`
  - Files: `tests/inngest/redispatch.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. Integration tests for function registration in serve.ts

  **What to do**:
  - Update or extend `tests/gateway/inngest-serve.test.ts` to verify:
    - **Test 1**: GET `/api/inngest` response includes `engineering/task-lifecycle` in the registered functions
    - **Test 2**: GET `/api/inngest` response includes `engineering/task-redispatch` in the registered functions
    - **Test 3**: Both functions list `engineering/task.received` and `engineering/task.redispatch` as their trigger events respectively
    - **Test 4**: Total registered function count is 2
  - Use `createTestApp()` from `tests/setup.ts` to get a test Fastify instance.
  - These tests verify the wiring done in Task 5.

  **Must NOT do**:
  - No tests requiring Inngest Dev Server (those are Task 9)
  - No modification of serve.ts (already done in Task 5)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small test additions to existing file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7 if Task 5 is done)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 5

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/gateway/inngest-serve.test.ts` — Existing test file (2 tests) — extend this file, don't create a new one
  - `tests/setup.ts:62-74` — `createTestApp()` helper — use this to get a test app instance

  **WHY Each Reference Matters**:
  - The existing inngest-serve tests already verify the endpoint exists — we're adding assertions about function content

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Function registration tests pass
    Tool: Bash
    Preconditions: serve.ts modified (Task 5), test file updated
    Steps:
      1. Run: pnpm test -- --run tests/gateway/inngest-serve.test.ts
      2. Assert: All tests pass (2 existing + 4 new)
    Expected Result: 6 tests passing
    Failure Indicators: Any test failure, or function IDs not found in response
    Evidence: .sisyphus/evidence/task-8-registration-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-8-registration-tests.txt` with Vitest output

  **Commit**: YES
  - Message: `test(gateway): add integration tests for inngest function registration`
  - Files: `tests/gateway/inngest-serve.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Integration tests with Inngest Dev Server

  **What to do**:
  - Create `tests/inngest/integration.test.ts` with tests that run ONLY when `INNGEST_DEV_URL` environment variable is set (skip otherwise with `describe.skipIf(!process.env.INNGEST_DEV_URL)`).
  - **Test 1**: Start the Gateway app (using `createTestApp()` but wired with the REAL Inngest client, not the mock). Send a valid Jira webhook via HTTP to `/webhooks/jira`. Assert: `engineering/task.received` event appears in Inngest Dev Server (query via Inngest Dev Server REST API at `http://localhost:8288/v1/events`).
  - **Test 2**: After the event is sent, verify the lifecycle function triggered by checking task status in DB transitions from `Ready` → `Executing` (within a polling timeout of 10 seconds).
  - **Test 3**: Verify `task_status_log` has the expected entries: `NULL → Ready (gateway)` and `Ready → Executing (lifecycle_fn)`.
  - **Test 4**: Verify optimistic locking in integration: send the same webhook twice (duplicate). Assert only one task is created (idempotency) and only one lifecycle function runs.
  - Use `cleanupTestData()` in `afterEach`.
  - Add a helper function that polls DB for status change with configurable timeout.
  - These tests validate the full Gateway → Inngest → Lifecycle → DB flow locally.

  **Must NOT do**:
  - No tests that require Fly.io or real machine dispatch
  - No tests that depend on `engineering/task.completed` event (no machine to send it)
  - No modification of source files (tests only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration tests with multiple services, polling logic, and real Inngest interaction
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all Wave 2 tasks)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 5, 6, 7, 8

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/setup.ts:62-74` — `createTestApp()` — for this test, pass the REAL Inngest client (not the mock) to test the full flow
  - `tests/gateway/jira-webhook.test.ts` — How to send a webhook via the test app and assert responses
  - `test-payloads/jira-issue-created.json` — Realistic Jira payload for triggering the flow

  **API/Type References**:
  - `src/gateway/inngest/client.ts` — `createInngestClient()` — the real Inngest client to inject for integration tests
  - Inngest Dev Server API: `GET http://localhost:8288/v1/events` — for verifying events were received

  **WHY Each Reference Matters**:
  - `createTestApp()` needs the REAL Inngest client (not mock) for integration tests — this is the key difference from unit tests
  - `jira-issue-created.json` provides a realistic payload that passes all validation gates

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Integration tests pass with Inngest Dev Server
    Tool: Bash
    Preconditions: Inngest Dev Server running at localhost:8288, local Supabase running
    Steps:
      1. Start Inngest Dev Server: npx inngest-cli@latest dev (in background)
      2. Set env: export INNGEST_DEV_URL=http://localhost:8288
      3. Run: pnpm test -- --run tests/inngest/integration.test.ts
      4. Assert: All 4 tests pass
    Expected Result: 4 integration tests passing, full Gateway→Inngest→Lifecycle flow verified
    Failure Indicators: Test timeout, status never transitions, event not received
    Evidence: .sisyphus/evidence/task-9-integration-tests.txt

  Scenario: Integration tests skip when Dev Server not running
    Tool: Bash
    Preconditions: INNGEST_DEV_URL not set
    Steps:
      1. Unset: unset INNGEST_DEV_URL
      2. Run: pnpm test -- --run tests/inngest/integration.test.ts
      3. Assert: Tests are skipped (not failed)
    Expected Result: Tests skipped gracefully, no failures
    Failure Indicators: Tests fail instead of skip
    Evidence: .sisyphus/evidence/task-9-integration-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-9-integration-tests.txt` with Vitest output

  **Commit**: YES
  - Message: `test(inngest): add integration tests with inngest dev server`
  - Files: `tests/inngest/integration.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 10. Update progress.json with Phase 3 checkpoint statuses

  **What to do**:
  - Update `.sisyphus/progress.json` Phase 3 entry:
    - Set `"status": "complete"`
    - Set `"started_at"` to the timestamp when work began
    - Set `"completed_at"` to the current timestamp
    - Set `"plan_file": ".sisyphus/plans/2026-03-27-0015-phase3-inngest-core.md"`
    - Set `"doc_file"` to the path of the Phase 3 completion doc (created in Task 11)
    - Update `"last_updated"` at the top level
    - Update `"last_session_id"` to the current session ID
  - Update each checkpoint status:
    - `inngest_client`: `"complete"` — add `"verified_at"` timestamp and note: "Implemented in Phase 2, verified in Phase 3. Client in src/gateway/inngest/client.ts, serve endpoint in src/gateway/inngest/serve.ts (now with 2 registered functions), send in src/gateway/inngest/send.ts."
    - `lifecycle_function`: `"complete"` — add `"verified_at"`, `"verify_command": "pnpm test -- --run tests/inngest/lifecycle.test.ts"`
    - `optimistic_locking`: `"complete"` — add `"verified_at"`, `"description"`: "All status transitions use prisma.task.updateMany with WHERE status = $expected. Lock failure → NonRetriableError."
    - `redispatch_handler`: `"complete"` — add `"verified_at"`, `"verify_command": "pnpm test -- --run tests/inngest/redispatch.test.ts"`
    - `inngest_send_failure`: `"complete"` — add `"verified_at"`, note: "Implemented in Phase 2 (jira.ts lines 97-115). Verified in Phase 3."
    - `tests_written`: `"complete"` — add description with test count
    - `tests_passing`: `"complete"` — add `"verify_command": "pnpm test -- --run"`
    - `committed`: `"complete"`
    - `documented`: `"complete"` — reference doc_file path

  **Must NOT do**:
  - Do NOT modify Phase 1 or Phase 2 entries
  - Do NOT update Phase 4+ entries
  - Do NOT change the file structure or add new phases

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: JSON file update, no logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all work being verified)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 2, 9

  **References** (CRITICAL):

  **Pattern References**:
  - `.sisyphus/progress.json` — The file to update. Follow the exact structure established by Phase 1 and Phase 2 entries.
  - Phase 1 entry (lines 14-81) — Structure to follow: `status`, `started_at`, `completed_at`, `plan_file`, `doc_file`, checkpoints with `status`, `description`, `verified_at`, `verify_command`
  - Phase 2 entry (lines 82-161) — Same structure, more recent reference

  **WHY Each Reference Matters**:
  - The progress.json structure MUST match Phase 1 and Phase 2 entries exactly — it's the project's progress tracking contract

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: progress.json is valid JSON after update
    Tool: Bash
    Preconditions: progress.json updated
    Steps:
      1. Run: node -e "JSON.parse(require('fs').readFileSync('.sisyphus/progress.json', 'utf8')); console.log('VALID JSON')"
      2. Assert: "VALID JSON" printed
      3. Run: node -e "const p = JSON.parse(require('fs').readFileSync('.sisyphus/progress.json', 'utf8')); console.log(p.phases[2].status)"
      4. Assert: "complete" printed
    Expected Result: Valid JSON, Phase 3 status is "complete"
    Failure Indicators: JSON parse error, or status not "complete"
    Evidence: .sisyphus/evidence/task-10-progress-update.txt

  Scenario: All Phase 3 checkpoints marked complete
    Tool: Bash
    Preconditions: progress.json updated
    Steps:
      1. Run: node -e "const p = JSON.parse(require('fs').readFileSync('.sisyphus/progress.json', 'utf8')); const c = p.phases[2].checkpoints; const all = Object.values(c).every(v => v.status === 'complete'); console.log(all ? 'ALL COMPLETE' : 'INCOMPLETE')"
      2. Assert: "ALL COMPLETE" printed
    Expected Result: Every checkpoint in Phase 3 is "complete"
    Failure Indicators: Any checkpoint not "complete"
    Evidence: .sisyphus/evidence/task-10-progress-update.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-10-progress-update.txt` with validation output

  **Commit**: YES
  - Message: `chore: update progress.json for phase 3 completion`
  - Files: `.sisyphus/progress.json`
  - Pre-commit: —

- [x] 11. Write Phase 3 completion document

  **What to do**:
  - Create `docs/YYYY-MM-DD-HHMM-phase3-inngest-core.md` (get timestamp with `date "+%Y-%m-%d-%H%M"`).
  - Follow the EXACT structure of `docs/2026-03-26-1511-phase1-foundation.md`:
    - **What This Document Is** — Brief overview of Phase 3
    - **What Was Built** — Mermaid diagram showing the components + table walkthrough
    - **Project Structure** — Updated directory tree showing new files in `src/inngest/` and `tests/inngest/`
    - **Runtime Dependencies** — Note any new dependencies (e.g., `@inngest/test` if installed)
    - **Lifecycle Function Architecture** — Mermaid diagram of the Step 1-4 flow
    - **Status Transition Map** — Table showing all transitions with from/to/actor
    - **Optimistic Locking Pattern** — Explain the `updateMany` + `NonRetriableError` pattern
    - **Re-dispatch Handler** — Brief description of the skeleton
    - **Known Limitations** — Document the 5 known limitations (KL1-KL5):
      - KL1: `dispatch_attempts` increment not atomic
      - KL2: `waitForEvent` race condition (Inngest #1433) — mitigation in Phase 7
      - KL3: Slack notification stubbed
      - KL4: Fly.io dispatch is placeholder
      - KL5: `engineering/task.completed` event payload undefined — success path is dead code until Phase 6
    - **Test Suite** — Table of test files, test counts, and what each covers
    - **Key Design Decisions** — Factory pattern, Prisma over Supabase client, `updateMany` over `update`, `NonRetriableError`
    - **What Phase 4 Builds On Top** — Preview of Execution Infrastructure
  - Use Mermaid diagrams with the standard color palette from AGENTS.md.
  - Include numbered steps and Flow Walkthrough tables per AGENTS.md rules.

  **Must NOT do**:
  - No content about Phase 4+ implementation details (only preview what it builds on)
  - No speculation about future changes
  - No content that contradicts the architecture doc

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation task following an established template
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 10 for final counts/paths)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4 (final verification needs the doc)
  - **Blocked By**: Task 10

  **References** (CRITICAL):

  **Pattern References**:
  - `docs/2026-03-26-1511-phase1-foundation.md` — EXACT structure to follow. This is the template.
  - `docs/2026-03-26-2257-phase2-event-gateway.md` — Secondary reference for structure and style
  - `~/.config/opencode/AGENTS.md` — Mermaid diagram rules: numbered steps, Flow Walkthrough tables, standard color palette

  **API/Type References**:
  - `.sisyphus/progress.json` — Phase 3 entry with checkpoint descriptions (source of truth for what was built)
  - `src/inngest/lifecycle.ts` — The actual code to document
  - `src/inngest/redispatch.ts` — The actual code to document

  **WHY Each Reference Matters**:
  - `phase1-foundation.md` is THE template — deviation would be inconsistent with project documentation style
  - AGENTS.md Mermaid rules are mandatory — diagrams without numbered steps or wrong colors will be rejected

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Phase 3 completion doc exists and follows template
    Tool: Bash
    Preconditions: Document created
    Steps:
      1. Verify file exists: ls docs/*phase3-inngest-core.md
      2. Assert: File exists with correct timestamp prefix
      3. Grep for key sections: grep "What Was Built" docs/*phase3-inngest-core.md
      4. Grep for Mermaid diagrams: grep "mermaid" docs/*phase3-inngest-core.md
      5. Grep for Known Limitations: grep "Known Limitations" docs/*phase3-inngest-core.md
      6. Grep for Phase 4 preview: grep "Phase 4" docs/*phase3-inngest-core.md
    Expected Result: All sections present, follows Phase 1 doc structure
    Failure Indicators: Missing sections, no Mermaid diagrams, no known limitations
    Evidence: .sisyphus/evidence/task-11-doc-structure.txt

  Scenario: Mermaid diagrams use correct color palette
    Tool: Bash
    Preconditions: Document created
    Steps:
      1. Grep for classDef: grep "classDef" docs/*phase3-inngest-core.md
      2. Assert: Uses standard palette colors (#4A90E2 for service, #7B68EE for storage, etc.)
    Expected Result: Standard color palette used in all diagrams
    Failure Indicators: Non-standard colors or missing classDef
    Evidence: .sisyphus/evidence/task-11-doc-structure.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-11-doc-structure.txt` with grep outputs

  **Commit**: YES
  - Message: `docs: add phase 3 inngest core completion document`
  - Files: `docs/YYYY-MM-DD-HHMM-phase3-inngest-core.md`
  - Pre-commit: —

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for pattern). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build && pnpm lint && pnpm test -- --run`. Review all changed/new files for: `as any`/`@ts-ignore`, empty catches, console.log in prod (console.warn stubs are OK), commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state (run `cleanupTestData()`). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (lifecycle function registered and responding to events). Test edge cases: duplicate events, cancelled tasks, optimistic lock conflicts. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Verify `progress.json` accurately reflects the current state.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Order | Message                                                                                | Files                                                                 | Pre-commit                         |
| ----- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| 1     | `feat(inngest): implement engineering task lifecycle function with optimistic locking` | `src/inngest/lifecycle.ts`                                            | `pnpm build`                       |
| 2     | `feat(inngest): implement engineering task redispatch function skeleton`               | `src/inngest/redispatch.ts`                                           | `pnpm build`                       |
| 3     | `feat(gateway): register lifecycle and redispatch functions with inngest serve`        | `src/gateway/inngest/serve.ts`                                        | `pnpm build && pnpm test -- --run` |
| 4     | `test(inngest): add unit tests for lifecycle and redispatch functions`                 | `tests/inngest/lifecycle.test.ts`, `tests/inngest/redispatch.test.ts` | `pnpm test -- --run`               |
| 5     | `test(gateway): add integration tests for inngest function registration`               | `tests/gateway/inngest-serve.test.ts`                                 | `pnpm test -- --run`               |
| 6     | `test(inngest): add integration tests with inngest dev server`                         | `tests/inngest/integration.test.ts`                                   | `pnpm test -- --run`               |
| 7     | `chore: update progress.json for phase 3 completion`                                   | `.sisyphus/progress.json`                                             | —                                  |
| 8     | `docs: add phase 3 inngest core completion document`                                   | `docs/YYYY-MM-DD-HHMM-phase3-inngest-core.md`                         | —                                  |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: 0 errors
pnpm lint           # Expected: 0 warnings/errors
pnpm test -- --run  # Expected: all tests pass (76 existing + new Phase 3)
```

### Final Checklist

- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent (grep confirms no forbidden patterns)
- [ ] All tests pass (76 existing + new)
- [ ] progress.json Phase 3 status = "complete" with all checkpoints
- [ ] Phase completion doc accurately describes implementation
- [ ] All known limitations documented with TODO comments in code
