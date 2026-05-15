# Test Suite Fixes — Performance, Hangs, and Failing Tests

## TL;DR

> **Quick Summary**: Fix all test suite issues — eliminate 270+ second runtime and indefinite hangs by replacing real setTimeout delays with fake timers, fix leaked process listeners in source code, optimize globalSetup, and fix all 8 documented known-issue test failures (mock/assertion mismatches, stale test behavior).
>
> **Deliverables**:
>
> - Test suite completes in under 60 seconds with zero failures
> - No process hang at exit (leaked listener cleanup in `opencode-server.ts`)
> - All 8 known issues from `docs/guides/2026-05-14-0155-test-suite-known-issues.md` resolved
> - Known-issues doc updated to reflect resolved state
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (source fix) → Task 2 (opencode-server tests) → Task 9 (full suite verification)

---

## Context

### Original Request

Tests take 270+ seconds and sometimes hang indefinitely. The esbuild bundler warns about a duplicate "dev" key in package.json. Multiple test files have known failures documented in `docs/guides/2026-05-14-0155-test-suite-known-issues.md` with root causes identified but not yet fixed.

### Interview Summary

**Key Discussions**:

- User wants "fix everything possible" scope — all 8 known issues plus the performance/hang problem
- Duplicate "dev" key: verified to NOT exist in current package.json (only one "dev" at line 12). The warning is from a stale/cached esbuild run or was already fixed. **Removed from plan scope.**
- TDD RED tests (lifecycle-guest-delivery): These assert delivery card update behavior not yet implemented in source. **Deferred** — skip with TODO rather than implementing new production features.

### Research Findings

**Performance causes** (ranked by impact):

1. `opencode-server.test.ts`: 2 tests wait real 5s SIGKILL timeout = 10s, 2 tests wait real 2.5s health polling = 5s. Total: ~15s.
2. `globalSetup`: runs `prisma migrate deploy` + `db:seed` every run = 10-25s fixed overhead.
3. `orchestrate.test.ts`: 44 × 50ms real delays = 2.2s (deprecated file — low priority).
4. Leaked `process.on('exit'/'SIGTERM')` listeners in `opencode-server.ts` source — never removed, accumulate across tests, prevent clean exit.
5. `integration.test.ts` creates `PrismaClient` instances via `buildApp()` without disconnect.

**Test failure causes**:

- `feedback-injection.test.ts` (4 skipped): Missing `WORKER_RUNTIME=fly` in test env
- `learned-rules-injection.test.ts` (5 failing): Same root cause
- `multi-tenancy.test.ts` (1 failing): Source renamed env vars (`DAILY_SUMMARY_CHANNELS` → `SOURCE_CHANNELS`, `SUMMARY_TARGET_CHANNEL` → `PUBLISH_CHANNEL`)
- `opencode-harness-delivery.test.ts` (9 failing): Mock lacks `enrichment_adapter` field; source changed from `role_name` to `enrichment_adapter` for delivery routing. Also stale health-check tests mock HTTP fetch but source uses stdout detection.
- `employee-lifecycle-delivery.test.ts` (3 failing): `mockLoadTenantEnv` returns legacy `SUMMARY_TARGET_CHANNEL` but source prefers `NOTIFICATION_CHANNEL`
- `lifecycle-guest-delivery.test.ts` (2 failing): TDD RED — delivery card update behavior not implemented
- `admin-property-locks.test.ts` (2 failing): Test asserts `where: { id }` but source passes `where: { id, tenant_id }`

### Metis Review

**Identified Gaps** (addressed):

- Duplicate "dev" key doesn't exist — removed from plan
- `opencode-server.test.ts` health-check tests test ghost behavior (HTTP polling vs actual stdout detection) — must fix the underlying test/source mismatch, not just add fake timers
- Spawn argument assertions in `opencode-server.test.ts` are stale — source now passes additional flags (`--hostname`, `--print-logs`)
- `globalSetup` teardown is a no-op — must add Prisma disconnect
- `orchestrate.test.ts` is for the deprecated engineering lifecycle — changes are low priority and test-file-only (not touching deprecated source)

---

## Work Objectives

### Core Objective

Make the test suite fast (under 60 seconds), reliable (no hangs), and clean (zero failures).

### Concrete Deliverables

- Modified `src/workers/lib/opencode-server.ts` — process listener cleanup
- Modified `tests/helpers/global-setup.ts` — optimized setup + teardown
- Fixed 7 test files with updated mocks/assertions matching current source behavior
- Updated `tests/inngest/lifecycle-guest-delivery.test.ts` — TDD RED tests marked `.skip` with TODO
- Updated `docs/guides/2026-05-14-0155-test-suite-known-issues.md` — all issues marked resolved

### Definition of Done

- [ ] `pnpm test -- --run` completes in under 60 seconds
- [ ] `pnpm test -- --run` reports 0 failures (only explicit `.skip` on TDD RED tests acceptable)
- [ ] No `MaxListenersExceededWarning` in test output
- [ ] Process exits cleanly — no indefinite hang

### Must Have

- All timing fixes (fake timers replacing real delays)
- Process listener leak fix in production source
- All mock/assertion fixes for known-issue tests
- Full suite verification with timing

### Must NOT Have (Guardrails)

- **No modifications to deprecated source files** (`src/inngest/lifecycle.ts`, `src/workers/orchestrate.mts`, `src/workers/entrypoint.sh`, `src/workers/lib/` except `postgrest-client.ts` and `opencode-server.ts`)
- **No new production feature implementations** — TDD RED tests are skipped, not implemented
- **No changes to test architecture** (keep `singleFork: true` for DB isolation)
- **No AI slop** — no excessive comments, no over-abstraction, no "just in case" error handling
- **No model references outside approved list** (`minimax/minimax-m2.7`, `anthropic/claude-haiku-4-5`)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Not applicable (this plan IS fixing the tests)
- **Framework**: Vitest
- **Verification**: Run `pnpm test -- --run` and verify pass count, fail count, and wall-clock time

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Test fixes**: Use Bash — run individual test file, assert 0 failures
- **Full suite**: Use Bash — run full suite, assert timing and results

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — source fix + infrastructure):
├── Task 1: Fix process listener leak in opencode-server.ts [quick]
├── Task 2: Optimize globalSetup + add teardown [quick]
├── Task 3: Fix admin-property-locks.test.ts assertions [quick]
├── Task 4: Fix multi-tenancy.test.ts env var names [quick]
└── Task 5: Mark lifecycle-guest-delivery.test.ts TDD RED tests as .skip [quick]

Wave 2 (After Wave 1 — test file fixes requiring deeper changes):
├── Task 6: Fix opencode-server.test.ts (timing + stale assertions + ghost tests) [deep]
├── Task 7: Fix feedback-injection.test.ts (un-skip + WORKER_RUNTIME) [quick]
├── Task 8: Fix learned-rules-injection.test.ts (WORKER_RUNTIME) [quick]
├── Task 9: Fix opencode-harness-delivery.test.ts (enrichment_adapter mock) [unspecified-high]
├── Task 10: Fix employee-lifecycle-delivery.test.ts (NOTIFICATION_CHANNEL) [unspecified-high]
└── Task 11: Fix orchestrate.test.ts real delays (deprecated — test file only) [quick]

Wave 3 (After ALL — verification + cleanup):
├── Task 12: Full suite verification + timing [unspecified-high]
├── Task 13: Update known-issues doc + Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 6, 12  | 1    |
| 2    | —          | 12     | 1    |
| 3    | —          | 12     | 1    |
| 4    | —          | 12     | 1    |
| 5    | —          | 12     | 1    |
| 6    | 1          | 12     | 2    |
| 7    | —          | 12     | 2    |
| 8    | —          | 12     | 2    |
| 9    | —          | 12     | 2    |
| 10   | —          | 12     | 2    |
| 11   | —          | 12     | 2    |
| 12   | 1–11       | 13     | 3    |
| 13   | 12         | —      | 3    |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1-T5 → `quick`
- **Wave 2**: 6 tasks — T6 → `deep`, T7-T8 → `quick`, T9-T10 → `unspecified-high`, T11 → `quick`
- **Wave 3**: 2 tasks — T12 → `unspecified-high`, T13 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix process listener leak in `opencode-server.ts`

  **What to do**:
  - Open `src/workers/lib/opencode-server.ts`
  - Find lines 184-185 where `process.on('exit', exitCleanup)` and `process.on('SIGTERM', exitCleanup)` are registered inside `startOpencodeServer()`
  - Add cleanup: when the child process exits or is stopped via `stopOpencodeServer()`, call `process.removeListener('exit', exitCleanup)` and `process.removeListener('SIGTERM', exitCleanup)`
  - The `exitCleanup` function reference must be stored in a module-level variable so `stopOpencodeServer()` can access it for removal
  - Use `lsp_find_references` on `startOpencodeServer` before modifying its return type — verify all call sites still work

  **Must NOT do**:
  - Do NOT change the public API signature of `startOpencodeServer()` or `stopOpencodeServer()` without checking all call sites via LSP
  - Do NOT touch any other file in `src/workers/lib/` except `opencode-server.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 6, 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/opencode-server.ts:184-185` — The exact lines with the leaked listeners. The `exitCleanup` function is defined at ~line 178 and kills the child process.
  - `src/workers/lib/opencode-server.ts:207-219` — `stopOpencodeServer()` function where cleanup should be called after process exit

  **Test References**:
  - `tests/workers/lib/opencode-server.test.ts` — Full test file; after this fix, the listener leak won't cause MaxListenersExceededWarning

  **WHY Each Reference Matters**:
  - Lines 184-185 are the exact source of the leak. The child process exit handler at line 207+ is where `removeListener` calls should go.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Process listeners are cleaned up after stopOpencodeServer
    Tool: Bash
    Preconditions: Source file modified with listener cleanup
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/opencode-server.test.ts 2>&1 | tail -20
      2. Verify: output contains "0 failed" or all tests pass
      3. Run: pnpm test -- --run tests/workers/lib/opencode-server.test.ts 2>&1 | grep -i "maxlisteners"
      4. Verify: no MaxListenersExceededWarning in output
    Expected Result: All tests pass, no listener warnings
    Failure Indicators: "MaxListenersExceededWarning" appears in output, or test failures
    Evidence: .sisyphus/evidence/task-1-listener-cleanup.txt

  Scenario: No regression — opencode-server tests still pass
    Tool: Bash
    Preconditions: After source modification
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/opencode-server.test.ts 2>&1
      2. Grep for "Tests" summary line
    Expected Result: Same number of passing tests as before (no regressions)
    Evidence: .sisyphus/evidence/task-1-no-regression.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: `fix(workers): clean up process listeners in opencode-server to prevent test hangs`
  - Files: `src/workers/lib/opencode-server.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/opencode-server.test.ts`

- [x] 2. Optimize globalSetup + add teardown

  **What to do**:
  - Open `tests/helpers/global-setup.ts`
  - In the `setup()` function, add a migration status check BEFORE running `prisma migrate deploy`. Use `prisma migrate status` or check if the `_prisma_migrations` table shows all migrations applied. Skip `migrate deploy` if already up-to-date.
  - Similarly, check if seed data exists before running `db:seed` (e.g., check if the tenants table has rows).
  - In the `teardown()` function (currently a no-op), add Prisma client disconnection to ensure clean process exit. Import PrismaClient, connect to the test DB, call `$disconnect()`.
  - Keep the `runWithRetry` wrapper for robustness, but add the skip-if-current check inside it.

  **Must NOT do**:
  - Do NOT remove the safety guard that checks `ai_employee_test` in DATABASE_URL
  - Do NOT change the test database name or connection URL

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/helpers/global-setup.ts:35-54` — Current setup() function with `runWithRetry` calls
  - `tests/helpers/global-setup.ts:56` — Empty `teardown()` function

  **External References**:
  - Prisma CLI docs: `prisma migrate status` outputs pending/applied migration info

  **WHY Each Reference Matters**:
  - The setup function runs every time `pnpm test` starts. Adding a check saves 10-25s when migrations are already applied.
  - The empty teardown leaves open connections that can prevent process exit.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: globalSetup skips migrations when already applied
    Tool: Bash
    Preconditions: Test database already has latest migrations (from a previous run)
    Steps:
      1. Run: time pnpm test -- --run tests/setup.test.ts 2>&1
      2. Check output for "already up-to-date" or "skipping migration" message
      3. Compare wall-clock time — should be noticeably faster than 10s
    Expected Result: Setup completes in under 5 seconds when DB is current
    Failure Indicators: Setup still takes 15+ seconds, or "migrate deploy" is run unnecessarily
    Evidence: .sisyphus/evidence/task-2-fast-setup.txt

  Scenario: globalSetup still works on clean DB
    Tool: Bash
    Preconditions: Fresh test database (drop and recreate if needed)
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -c "DROP DATABASE IF EXISTS ai_employee_test; CREATE DATABASE ai_employee_test;"
      2. Run: pnpm test -- --run tests/setup.test.ts 2>&1
      3. Verify: tests pass (migrations were applied)
    Expected Result: Setup correctly applies migrations and seed on fresh DB
    Failure Indicators: "relation does not exist" errors, test failures
    Evidence: .sisyphus/evidence/task-2-fresh-db.txt
  ```

  **Commit**: YES (groups with T2)
  - Message: `fix(test): optimize globalSetup with migration check and add teardown`
  - Files: `tests/helpers/global-setup.ts`
  - Pre-commit: `pnpm test -- --run tests/setup.test.ts`

- [x] 3. Fix `admin-property-locks.test.ts` assertions

  **What to do**:
  - Open `tests/gateway/routes/admin-property-locks.test.ts`
  - Find test 11 (~line 264): change `expect.objectContaining({ where: { id: LOCK_ID } })` to `expect.objectContaining({ where: expect.objectContaining({ id: LOCK_ID }) })`
  - Find test 13 (~line 302): apply the same fix — wrap the `where` value in `expect.objectContaining()`
  - The source correctly includes `tenant_id` in the `where` clause for security. The tests just need looser matching.

  **Must NOT do**:
  - Do NOT change the source route handler — the `tenant_id` in `where` is correct multi-tenancy behavior
  - Do NOT change any other test assertions in this file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/gateway/routes/admin-property-locks.test.ts:264` — Test 11 (PATCH assertion)
  - `tests/gateway/routes/admin-property-locks.test.ts:302` — Test 13 (DELETE assertion)
  - `src/gateway/routes/admin-property-locks.ts:135` — Source PATCH with `where: { id, tenant_id }`
  - `src/gateway/routes/admin-property-locks.ts:173-175` — Source DELETE with `where: { id, tenant_id }`

  **WHY Each Reference Matters**:
  - The source intentionally includes `tenant_id` for security. Tests used exact match on `where` instead of partial match.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Admin property locks tests all pass
    Tool: Bash
    Preconditions: Assertion fix applied
    Steps:
      1. Run: pnpm test -- --run tests/gateway/routes/admin-property-locks.test.ts 2>&1 | tail -5
      2. Verify: 14 tests pass, 0 failures
    Expected Result: "14 passed" with 0 failures
    Failure Indicators: Any test failure, especially tests 11 or 13
    Evidence: .sisyphus/evidence/task-3-property-locks.txt
  ```

  **Commit**: YES (groups with T3-T5)
  - Message: `fix(test): update assertions in admin-property-locks, multi-tenancy, and lifecycle-guest-delivery tests`
  - Files: `tests/gateway/routes/admin-property-locks.test.ts`

- [x] 4. Fix `multi-tenancy.test.ts` env var names

  **What to do**:
  - Open `tests/integration/multi-tenancy.test.ts`
  - Find the failing test "summary.channel_ids and target_channel are flattened into env" (~line 284-292)
  - First, read `src/gateway/services/tenant-env-loader.ts` to confirm actual env var names emitted:
    - `summary.channel_ids` → emitted as `SOURCE_CHANNELS` (not `DAILY_SUMMARY_CHANNELS`)
    - `summary.publish_channel` → emitted as `PUBLISH_CHANNEL` (not `SUMMARY_TARGET_CHANNEL`)
    - `summary.target_channel` is NOT read by the source at all
  - Update the test config fixture: change `target_channel: 'C_TARGET'` to `publish_channel: 'C_TARGET'`
  - Update assertions: `env['DAILY_SUMMARY_CHANNELS']` → `env['SOURCE_CHANNELS']`, `env['SUMMARY_TARGET_CHANNEL']` → `env['PUBLISH_CHANNEL']`

  **Must NOT do**:
  - Do NOT rename env vars in the source to match old test expectations
  - Do NOT add backward-compat aliases — the rename was intentional

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/integration/multi-tenancy.test.ts:284-292` — Failing test with stale env var names
  - `src/gateway/services/tenant-env-loader.ts:60-76` — Source config flattening logic emitting `SOURCE_CHANNELS` and `PUBLISH_CHANNEL`

  **WHY Each Reference Matters**:
  - The test expects old env var names. Source was renamed. Test needs to match.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Multi-tenancy env flattening test passes
    Tool: Bash
    Preconditions: Test assertions updated
    Steps:
      1. Run: pnpm test -- --run tests/integration/multi-tenancy.test.ts 2>&1 | tail -10
      2. Verify: all tests pass (specifically "config flattening" test)
    Expected Result: 0 failures in multi-tenancy tests
    Failure Indicators: "expected undefined to be" or env var mismatch
    Evidence: .sisyphus/evidence/task-4-multi-tenancy.txt
  ```

  **Commit**: YES (groups with T3-T5)
  - Files: `tests/integration/multi-tenancy.test.ts`

- [x] 5. Mark `lifecycle-guest-delivery.test.ts` TDD RED tests as `.skip`

  **What to do**:
  - Open `tests/inngest/lifecycle-guest-delivery.test.ts`
  - Find the 2 failing TDD RED tests in the `describe('employee-lifecycle — guest delivery Slack card updates (TDD RED phase)')` block:
    - `it('updates Slack card to Sent after successful delivery', ...)` (~line 235)
    - `it('updates Slack card to error after 3 failed deliveries', ...)` (~line 249)
  - Change `it(` to `it.skip(` for both
  - Add a comment above each: `// TODO: Implement delivery card Slack updates — see docs/guides/2026-05-14-0155-test-suite-known-issues.md Issue #7`
  - Do NOT skip the other 2 tests in that describe block (`'Sent card update is non-fatal if approvalMsgTs missing'` and `'edited response sent correctly'`) — verify if they pass first; if they pass, keep them active

  **Must NOT do**:
  - Do NOT implement the delivery card update feature — that's new production behavior, out of scope
  - Do NOT skip tests that are currently passing

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-guest-delivery.test.ts:234-260` — TDD RED describe block with the 2 failing tests
  - `docs/guides/2026-05-14-0155-test-suite-known-issues.md` Issue #7 — documents these as intentional TDD RED

  **WHY Each Reference Matters**:
  - These tests assert unimplemented behavior. Skipping is the correct action until the feature is built.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Guest delivery tests pass (skips only TDD RED)
    Tool: Bash
    Preconditions: TDD RED tests marked .skip
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts 2>&1 | tail -10
      2. Verify: output shows 0 failures, 2 skipped
    Expected Result: Passing tests still pass, 2 TDD RED tests skipped
    Failure Indicators: Previously-passing tests now fail, or more than 2 skipped
    Evidence: .sisyphus/evidence/task-5-guest-delivery.txt
  ```

  **Commit**: YES (groups with T3-T5)
  - Files: `tests/inngest/lifecycle-guest-delivery.test.ts`

- [x] 6. Fix `opencode-server.test.ts` — timing, stale assertions, and ghost health-check tests

  **What to do**:
  This is the highest-impact test fix. Three sub-problems:

  **A) Stale spawn argument assertions (lines 61-65, 79-83, 96-100)**:
  - The tests expect `['serve', '--port', '4096']` as spawn args
  - The source now passes `['serve', '--port', '4096', '--hostname', '0.0.0.0', '--print-logs']` with an `env` option
  - Read `src/workers/lib/opencode-server.ts` to confirm the exact current spawn args
  - Update all spawn argument assertions to match the current source

  **B) Ghost health-check tests (lines ~150-233)**:
  - Two tests mock `fetch` and test HTTP health-check polling behavior
  - The actual source does NOT poll HTTP. It watches `stdout` for the string `'listening'`
  - These tests wait real 2500ms each and are testing non-existent behavior
  - Rewrite both tests to test the actual stdout-based detection:
    - Mock the child process to emit `'listening'` on stdout
    - Assert that `startOpencodeServer()` resolves when stdout emits the listening signal
  - Read `src/workers/lib/opencode-server.ts` to understand the exact stdout detection pattern

  **C) SIGKILL timeout tests (lines ~261-284, ~338-364)**:
  - Two tests wait real 5000ms for the SIGKILL timeout in `stopOpencodeServer()`
  - Replace with `vi.useFakeTimers()` + `vi.advanceTimersByTime(5001)` — this pattern is already used correctly in the "clears timeout when process exits before 5s" test at line 303
  - After switching to fake timers, the test should complete in milliseconds instead of 5 seconds

  **Must NOT do**:
  - Do NOT change the source file `src/workers/lib/opencode-server.ts` (that's Task 1)
  - Do NOT just add `vi.useFakeTimers` to the ghost health-check tests — fix the underlying test/source mismatch first

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This task requires understanding the source's actual behavior, comparing it with stale test assertions, and rewriting multiple test sections. Needs careful analysis.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1 (source listener fix must be in place)

  **References**:

  **Pattern References**:
  - `tests/workers/lib/opencode-server.test.ts:61-65` — Stale spawn arg assertion
  - `tests/workers/lib/opencode-server.test.ts:150-233` — Ghost HTTP health-check tests
  - `tests/workers/lib/opencode-server.test.ts:261-284` — SIGKILL timeout test (5s real wait)
  - `tests/workers/lib/opencode-server.test.ts:303-336` — REFERENCE: correctly uses fake timers for SIGKILL — copy this pattern
  - `tests/workers/lib/opencode-server.test.ts:338-364` — Second SIGKILL timeout test
  - `src/workers/lib/opencode-server.ts` — Source file: check spawn args (~line 30-50), stdout detection (~line 60-90), SIGKILL timeout (~line 207-219)

  **WHY Each Reference Matters**:
  - The test at line 303 already demonstrates the correct fake timer pattern for SIGKILL tests. Replicate it.
  - The source's stdout detection must be understood to rewrite the ghost health-check tests correctly.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: opencode-server tests pass with no real-time delays
    Tool: Bash
    Preconditions: All three sub-problems fixed
    Steps:
      1. Run: time pnpm test -- --run tests/workers/lib/opencode-server.test.ts 2>&1
      2. Verify: all tests pass
      3. Verify: wall-clock time is under 10 seconds (was 15+ seconds before)
    Expected Result: All tests pass in under 10 seconds
    Failure Indicators: Tests take 15+ seconds, or any test failure
    Evidence: .sisyphus/evidence/task-6-opencode-server.txt

  Scenario: No ghost behavior — health check tests match source
    Tool: Bash
    Preconditions: Health check tests rewritten
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/opencode-server.test.ts 2>&1
      2. Verify: no `fetch` mock calls in health-check test output
      3. Verify: tests assert stdout 'listening' detection
    Expected Result: Tests verify actual source behavior, not ghost HTTP polling
    Evidence: .sisyphus/evidence/task-6-health-check.txt
  ```

  **Commit**: YES
  - Message: `fix(test): rewrite opencode-server tests to match stdout-based health detection and use fake timers`
  - Files: `tests/workers/lib/opencode-server.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/opencode-server.test.ts`

- [x] 7. Fix `feedback-injection.test.ts` — un-skip + WORKER_RUNTIME

  **What to do**:
  - Open `tests/inngest/feedback-injection.test.ts`
  - In the `beforeEach` block (~line 152-181), add: `process.env.WORKER_RUNTIME = 'fly';`
  - In the `afterEach` block (~line 183-188), add: `delete process.env.WORKER_RUNTIME;`
  - Find the 3 `it.skip(` tests in the "feedback injection" describe block (~lines 191, 219+) and change them to `it(`
  - Run the tests to verify the un-skipped tests now pass — they should invoke `mockCreateMachine` since the lifecycle will take the Fly path
  - If any un-skipped test still fails, debug the specific assertion and fix (may need to adjust mock return values)

  **Must NOT do**:
  - Do NOT modify the employee-lifecycle source
  - Do NOT skip tests that were previously active and passing

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/inngest/feedback-injection.test.ts:152-188` — beforeEach/afterEach blocks where WORKER_RUNTIME must be added
  - `tests/inngest/feedback-injection.test.ts:191` — First `it.skip` to un-skip
  - `src/inngest/employee-lifecycle.ts` — Search for `WORKER_RUNTIME` check — confirms the branch logic (`if (process.env.WORKER_RUNTIME !== 'fly')` takes local Docker path)

  **WHY Each Reference Matters**:
  - The lifecycle checks `WORKER_RUNTIME` to decide Fly vs local Docker path. Without it, `createMachine` is never called, so all assertions on `mockCreateMachine` fail.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All feedback-injection tests pass (none skipped)
    Tool: Bash
    Preconditions: WORKER_RUNTIME added, tests un-skipped
    Steps:
      1. Run: pnpm test -- --run tests/inngest/feedback-injection.test.ts 2>&1 | tail -10
      2. Verify: 0 failures, 0 skipped (all tests active and passing)
    Expected Result: All tests pass with 0 skipped
    Failure Indicators: Any failure, or tests still showing as skipped
    Evidence: .sisyphus/evidence/task-7-feedback-injection.txt
  ```

  **Commit**: YES (groups with T7-T8)
  - Message: `fix(test): add WORKER_RUNTIME=fly to feedback-injection and learned-rules-injection tests`
  - Files: `tests/inngest/feedback-injection.test.ts`

- [x] 8. Fix `learned-rules-injection.test.ts` — WORKER_RUNTIME

  **What to do**:
  - Open `tests/inngest/learned-rules-injection.test.ts`
  - In the `beforeEach` block, add: `process.env.WORKER_RUNTIME = 'fly';`
  - In the `afterEach` block, add: `delete process.env.WORKER_RUNTIME;`
  - Run the tests — the 5 failing tests should now pass because `createMachine` will be called via the Fly path
  - If any test still fails, debug the specific mock/assertion mismatch

  **Must NOT do**:
  - Do NOT modify the employee-lifecycle source

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/inngest/learned-rules-injection.test.ts` — Same pattern as feedback-injection. Look for `beforeEach` block (~line 140-170) and `afterEach` block.
  - `tests/inngest/feedback-injection.test.ts:152-188` — Sibling test file with identical fix pattern (reference after Task 7)

  **WHY Each Reference Matters**:
  - Identical root cause to Task 7. Same fix applied to a different test file.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All learned-rules-injection tests pass
    Tool: Bash
    Preconditions: WORKER_RUNTIME added to beforeEach
    Steps:
      1. Run: pnpm test -- --run tests/inngest/learned-rules-injection.test.ts 2>&1 | tail -10
      2. Verify: 0 failures
    Expected Result: All 5 previously-failing tests now pass
    Failure Indicators: "spy called 0 times" or "expected to have been called"
    Evidence: .sisyphus/evidence/task-8-learned-rules.txt
  ```

  **Commit**: YES (groups with T7-T8)
  - Files: `tests/inngest/learned-rules-injection.test.ts`

- [x] 9. Fix `opencode-harness-delivery.test.ts` — enrichment_adapter mock

  **What to do**:
  - Open `tests/workers/opencode-harness-delivery.test.ts`
  - Find the `buildMockFetch` function that constructs the mock archetype object
  - The mock sets `role_name: roleName` but does NOT set `enrichment_adapter`
  - The source (`src/workers/opencode-harness.mts` ~line 459) checks `archetype.enrichment_adapter` to trigger the delivery adapter, not `role_name`
  - Fix: add `enrichment_adapter: roleName === 'guest-messaging' ? 'hostfully' : null` to the mock archetype object
  - Keep `role_name` in the mock — the source may still use it for other purposes
  - After fixing the adapter field, run the tests. If some of the 9 failing tests still fail, investigate:
    - The delivery adapter is registered under key `'hostfully'` in `src/workers/lib/delivery-adapters/guest-messaging.mts` (line 16)
    - Check if `vi.resetModules()` in beforeEach interacts with the dynamic import of the adapter
    - Check if `fs/promises` mocks are properly applied after module reset

  **Must NOT do**:
  - Do NOT change the source file `src/workers/opencode-harness.mts`
  - Do NOT remove `role_name` from the mock — only ADD `enrichment_adapter`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple interacting mock systems (fetch, fs, module reset, dynamic imports). May need debugging beyond the initial fix.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/workers/opencode-harness-delivery.test.ts:88-93` — Mock archetype with `role_name` but no `enrichment_adapter`
  - `src/workers/opencode-harness.mts:459-462` — Source checks `archetype.enrichment_adapter` for delivery routing
  - `src/workers/lib/delivery-adapters/guest-messaging.mts:16` — Adapter registered under key `'hostfully'`
  - `src/workers/lib/delivery-adapters/index.mts` — Adapter registry (`getDeliveryAdapter`, `registerDeliveryAdapter`)

  **WHY Each Reference Matters**:
  - The adapter key mismatch (`'guest-messaging'` in test name vs `'hostfully'` in registry) is the root cause. The test mock must match how the source looks up the adapter.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness delivery tests pass with enrichment_adapter
    Tool: Bash
    Preconditions: Mock archetype updated with enrichment_adapter field
    Steps:
      1. Run: pnpm test -- --run tests/workers/opencode-harness-delivery.test.ts 2>&1 | tail -10
      2. Count: passing vs failing tests
    Expected Result: 15/15 tests pass (was 6/15 before)
    Failure Indicators: More than 0 failures
    Evidence: .sisyphus/evidence/task-9-harness-delivery.txt

  Scenario: Guest-messaging delivery adapter is invoked
    Tool: Bash
    Preconditions: After fix applied
    Steps:
      1. Run: pnpm test -- --run tests/workers/opencode-harness-delivery.test.ts 2>&1 | grep -i "guest"
      2. Verify guest-messaging test names appear in passing output
    Expected Result: All 5 guest-messaging tests pass
    Evidence: .sisyphus/evidence/task-9-guest-messaging.txt
  ```

  **Commit**: YES
  - Message: `fix(test): add enrichment_adapter to opencode-harness-delivery mock archetypes`
  - Files: `tests/workers/opencode-harness-delivery.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/opencode-harness-delivery.test.ts`

- [x] 10. Fix `employee-lifecycle-delivery.test.ts` — NOTIFICATION_CHANNEL

  **What to do**:
  - Open `tests/inngest/employee-lifecycle-delivery.test.ts`
  - Find the `beforeEach` block where `mockLoadTenantEnv` is configured
  - The mock returns `SUMMARY_TARGET_CHANNEL: 'C-FALLBACK'` — the source now prefers `NOTIFICATION_CHANNEL` in the fallback chain
  - Read `src/inngest/employee-lifecycle.ts` to confirm the exact fallback chain for channel resolution (~line 1355-1359):
    ```
    metadata.target_channel ?? tenantEnv['NOTIFICATION_CHANNEL'] ?? tenantEnv['SUMMARY_TARGET_CHANNEL'] ?? ''
    ```
  - Update the mock: add `NOTIFICATION_CHANNEL: 'C-FALLBACK'` alongside or instead of `SUMMARY_TARGET_CHANNEL`
  - Run the tests to identify which 3 of 9 fail, and fix each one:
    - Check if any test specifically tests the `NOTIFICATION_CHANNEL` fallback path
    - Check if `buildFetchMock` returns correct deliverable metadata
  - If the `mockCreateMachine` assertions fail (similar to Tasks 7-8), also add `process.env.WORKER_RUNTIME = 'fly'` to beforeEach

  **Must NOT do**:
  - Do NOT modify `src/inngest/employee-lifecycle.ts` — the source is correct

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 3 different tests may fail for 3 different reasons. Requires running tests and debugging each failure individually.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9, 11)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/inngest/employee-lifecycle-delivery.test.ts:251-254` — `mockLoadTenantEnv` returning legacy `SUMMARY_TARGET_CHANNEL`
  - `src/inngest/employee-lifecycle.ts:1355-1359` — Channel resolution fallback chain
  - `tests/inngest/employee-lifecycle-delivery.test.ts:256-261` — `vi.stubGlobal('setTimeout')` pattern (correctly used)

  **WHY Each Reference Matters**:
  - The fallback chain prioritizes `NOTIFICATION_CHANNEL` over `SUMMARY_TARGET_CHANNEL`. Mock must reflect current priority.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lifecycle delivery tests pass
    Tool: Bash
    Preconditions: Mock updated with NOTIFICATION_CHANNEL
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts 2>&1 | tail -10
      2. Verify: all tests pass
    Expected Result: 9/9 tests pass (was 6/9 before)
    Failure Indicators: Any remaining failures, especially "expected undefined" or "spy called 0 times"
    Evidence: .sisyphus/evidence/task-10-lifecycle-delivery.txt
  ```

  **Commit**: YES
  - Message: `fix(test): update lifecycle-delivery mock to use NOTIFICATION_CHANNEL`
  - Files: `tests/inngest/employee-lifecycle-delivery.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts`

- [x] 11. Fix `orchestrate.test.ts` real delays (deprecated — test file only)

  **What to do**:
  - Open `tests/workers/orchestrate.test.ts`
  - This file has 44 instances of `await new Promise((resolve) => setTimeout(resolve, 50))` used as a workaround for `process.exit` mocking — it lets async cleanup settle after the mock throws
  - **NOTE**: This file tests deprecated code (`src/workers/orchestrate.mts`). The source MUST NOT be modified per AGENTS.md. We are only fixing the test file for performance.
  - Replace the 50ms delays with `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(50)` or `vi.runAllTimersAsync()`
  - Add `vi.useFakeTimers()` in the `beforeEach` and `vi.useRealTimers()` in `afterEach`
  - Note: the file already sets `process.setMaxListeners(100)` at line 6 — this is a symptom of accumulated listeners. After fixing the delays with fake timers, this may no longer be needed, but leave it in place to avoid regressions.
  - **Alternative approach** (simpler): If `vi.useFakeTimers()` causes issues with the async mocks in this complex test file, instead reduce the delay from 50ms to 1ms (`setTimeout(resolve, 1)`). This saves 44 × 49ms = 2.1s without changing timer behavior.

  **Must NOT do**:
  - Do NOT modify `src/workers/orchestrate.mts` — it is deprecated
  - Do NOT modify `src/inngest/lifecycle.ts` — it is deprecated
  - Do NOT remove `process.setMaxListeners(100)` — it may still be needed

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9, 10)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/workers/orchestrate.test.ts:708` — First instance of `setTimeout(resolve, 50)` pattern
  - `tests/workers/orchestrate.test.ts:6` — `process.setMaxListeners(100)` — symptom of listener leak
  - `tests/workers/orchestrate.test.ts` — 44 total instances to fix (search `setTimeout(resolve, 50)`)

  **WHY Each Reference Matters**:
  - 44 × 50ms = 2.2s of pure sleep. Reducing to 1ms or using fake timers saves this.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Orchestrate tests pass faster
    Tool: Bash
    Preconditions: Delays replaced with fake timers or reduced to 1ms
    Steps:
      1. Run: time pnpm test -- --run tests/workers/orchestrate.test.ts 2>&1 | tail -10
      2. Verify: all tests pass
      3. Verify: wall-clock time is under 15 seconds (was 17+ before)
    Expected Result: All tests pass, noticeably faster
    Failure Indicators: Test failures (async timing issues from fake timers)
    Evidence: .sisyphus/evidence/task-11-orchestrate.txt
  ```

  **Commit**: YES
  - Message: `fix(test): replace real setTimeout delays with fake timers in orchestrate tests`
  - Files: `tests/workers/orchestrate.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/orchestrate.test.ts`

- [x] 12. Full suite verification + timing

  **What to do**:
  - Run the full test suite: `time pnpm test -- --run 2>&1`
  - Capture and verify:
    - Wall-clock time is under 60 seconds
    - 0 test failures (only `.skip` on TDD RED tests acceptable)
    - No `MaxListenersExceededWarning` in output
    - Process exits cleanly (no hang — command returns)
  - If any test fails, identify which task's fix is incomplete and note it
  - If the suite still takes over 60 seconds, identify remaining slow test files with `--reporter=verbose` and note them
  - Save full test output as evidence

  **Must NOT do**:
  - Do NOT make additional fixes in this task — only verify and document
  - If issues are found, they should be reported, not silently fixed

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Needs to run the full suite, parse complex output, and make a judgment call on pass/fail.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — after all fixes)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 1-11

  **References**:

  **Pattern References**:
  - `vitest.config.ts` — Test config with singleFork, testTimeout
  - All fixed test files from Tasks 1-11

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite completes quickly with zero failures
    Tool: Bash
    Preconditions: All Tasks 1-11 completed
    Steps:
      1. Run: time pnpm test -- --run 2>&1 | tee /tmp/test-suite-full.log
      2. Check: grep -E "Tests.*failed" /tmp/test-suite-full.log — expected "0 failed"
      3. Check: grep -i "maxlisteners" /tmp/test-suite-full.log — expected no output
      4. Check: wall-clock time from time output — expected under 60 seconds
      5. Verify process exited (command returned, no hang)
    Expected Result: 0 failures, under 60s, no warnings, clean exit
    Failure Indicators: Any failure count > 0, time > 60s, MaxListenersExceeded warning, or process hang
    Evidence: .sisyphus/evidence/task-12-full-suite.txt

  Scenario: No regressions in previously-passing tests
    Tool: Bash
    Preconditions: Full suite run completed
    Steps:
      1. Check /tmp/test-suite-full.log for total pass count
      2. Verify pass count is >= previous baseline (515+ per AGENTS.md)
    Expected Result: Pass count >= 515
    Evidence: .sisyphus/evidence/task-12-pass-count.txt
  ```

  **Commit**: NO (verification only)

- [x] 13. Update known-issues doc + Telegram notification

  **What to do**:
  - Open `docs/guides/2026-05-14-0155-test-suite-known-issues.md`
  - For each issue (#1 through #8), add a "Status: RESOLVED" line with a brief note of what was done:
    - Issue #1 (hangs): Resolved — fake timers in opencode-server tests, process listener cleanup, globalSetup optimization
    - Issue #2 (feedback-injection): Resolved — added WORKER_RUNTIME=fly, un-skipped tests
    - Issue #3 (learned-rules-injection): Resolved — added WORKER_RUNTIME=fly
    - Issue #4 (multi-tenancy): Resolved — updated env var assertions to match source rename
    - Issue #5 (opencode-harness-delivery): Resolved — added enrichment_adapter to mock
    - Issue #6 (employee-lifecycle-delivery): Resolved — updated mock to use NOTIFICATION_CHANNEL
    - Issue #7 (lifecycle-guest-delivery): Deferred — TDD RED tests marked .skip with TODO
    - Issue #8 (admin-property-locks): Resolved — fixed assertions to use objectContaining for where clause
  - Update the Summary Table at the bottom to reflect resolved status
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "📋 Plan ready: test-suite-fixes\n\nCome back to start the work."`

  **Must NOT do**:
  - Do NOT delete the known-issues doc — update it in place

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 12)
  - **Blocks**: None
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `docs/guides/2026-05-14-0155-test-suite-known-issues.md` — Full known-issues document to update
  - `scripts/telegram-notify.ts` — Telegram notification script

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Known-issues doc reflects current state
    Tool: Bash
    Preconditions: Doc updated
    Steps:
      1. Read docs/guides/2026-05-14-0155-test-suite-known-issues.md
      2. Verify each issue has a "Status: RESOLVED" or "Status: DEFERRED" annotation
      3. Verify Summary Table is updated
    Expected Result: All 8 issues have resolution status noted
    Evidence: .sisyphus/evidence/task-13-doc-update.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "📋 Plan ready: test-suite-fixes — Come back to start the work."
    Expected Result: Notification delivered successfully
    Evidence: .sisyphus/evidence/task-13-telegram.txt
  ```

  **Commit**: YES (groups with T12-T13)
  - Message: `docs: update known-issues doc — all test suite issues resolved`
  - Files: `docs/guides/2026-05-14-0155-test-suite-known-issues.md`
  - Pre-commit: `pnpm test -- --run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`
      VERDICT: APPROVE — Must Have [13/13] | Must NOT Have [5/5] | Tasks [13/13] | Evidence [3/3]

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`
      VERDICT: APPROVE (from prior session)

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run full test suite: `pnpm test -- --run`. Verify: (1) wall-clock time under 60s, (2) 0 failures, (3) no MaxListenersExceededWarning, (4) clean process exit. Run each individually-fixed test file separately to confirm isolation. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`
      VERDICT: APPROVE (from prior session)

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance (no deprecated source changes, no new features). Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`
      VERDICT: APPROVE (from prior session)

---

## Commit Strategy

| Group   | Message                                                                                                   | Files                                                                                                                                            | Pre-commit check                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1      | `fix(workers): clean up process listeners in opencode-server to prevent test hangs`                       | `src/workers/lib/opencode-server.ts`                                                                                                             | `pnpm test -- --run tests/workers/lib/opencode-server.test.ts`                                                                                                |
| T2      | `fix(test): optimize globalSetup with migration check and add teardown`                                   | `tests/helpers/global-setup.ts`                                                                                                                  | `pnpm test -- --run tests/setup.test.ts`                                                                                                                      |
| T3-T5   | `fix(test): update assertions in admin-property-locks, multi-tenancy, and lifecycle-guest-delivery tests` | `tests/gateway/routes/admin-property-locks.test.ts`, `tests/integration/multi-tenancy.test.ts`, `tests/inngest/lifecycle-guest-delivery.test.ts` | `pnpm test -- --run tests/gateway/routes/admin-property-locks.test.ts tests/integration/multi-tenancy.test.ts tests/inngest/lifecycle-guest-delivery.test.ts` |
| T6      | `fix(test): rewrite opencode-server tests to match stdout-based health detection and use fake timers`     | `tests/workers/lib/opencode-server.test.ts`                                                                                                      | `pnpm test -- --run tests/workers/lib/opencode-server.test.ts`                                                                                                |
| T7-T8   | `fix(test): add WORKER_RUNTIME=fly to feedback-injection and learned-rules-injection tests`               | `tests/inngest/feedback-injection.test.ts`, `tests/inngest/learned-rules-injection.test.ts`                                                      | `pnpm test -- --run tests/inngest/feedback-injection.test.ts tests/inngest/learned-rules-injection.test.ts`                                                   |
| T9      | `fix(test): add enrichment_adapter to opencode-harness-delivery mock archetypes`                          | `tests/workers/opencode-harness-delivery.test.ts`                                                                                                | `pnpm test -- --run tests/workers/opencode-harness-delivery.test.ts`                                                                                          |
| T10     | `fix(test): update lifecycle-delivery mock to use NOTIFICATION_CHANNEL`                                   | `tests/inngest/employee-lifecycle-delivery.test.ts`                                                                                              | `pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts`                                                                                        |
| T11     | `fix(test): replace real setTimeout delays with fake timers in orchestrate tests`                         | `tests/workers/orchestrate.test.ts`                                                                                                              | `pnpm test -- --run tests/workers/orchestrate.test.ts`                                                                                                        |
| T12-T13 | `docs: update known-issues doc — all test suite issues resolved`                                          | `docs/guides/2026-05-14-0155-test-suite-known-issues.md`                                                                                         | `pnpm test -- --run`                                                                                                                                          |

---

## Success Criteria

### Verification Commands

```bash
time pnpm test -- --run 2>&1 | tail -20  # Expected: <60s wall clock, 0 failures
pnpm test -- --run 2>&1 | grep -i "maxlisteners"  # Expected: no output
pnpm test -- --run 2>&1 | grep -E "Tests.*failed"  # Expected: "0 failed" or no match
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `pnpm test -- --run` completes in under 60 seconds
- [ ] 0 test failures (only `.skip` on TDD RED tests)
- [ ] No MaxListenersExceededWarning
- [ ] Clean process exit (no hang)
- [ ] All tests pass
