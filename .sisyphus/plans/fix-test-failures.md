# Fix Pre-Existing Test Failures

## TL;DR

> **Quick Summary**: Fix 14 active test failures (stale mocks, missing `inngest.send` mock) and delete 1 deprecated test file (`lifecycle.test.ts`), bringing the test suite from 20 failures down to 0 new failures (only documented pre-existing failures remain).
>
> **Deliverables**:
>
> - `tests/inngest/interaction-handler.test.ts` — fix 9 failures (add `.text()` to fetch mock)
> - `tests/inngest/lifecycle.test.ts` — delete entire file (deprecated engineering lifecycle)
> - `tests/inngest/lifecycle-rejection-feedback.test.ts` — fix 3 failures (mock `inngest.send`)
> - `tests/inngest/employee-lifecycle-delivery.test.ts` — fix 1 failure (mock `inngest.send`)
> - `tests/inngest/lifecycle-guest-approval.test.ts` — fix 1 failure (mock `inngest.send`)
> - AGENTS.md — update "Pre-existing Test Failures" section to accurately reflect remaining known failures
>
> **Estimated Effort**: Short (S — 2-4 hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (baseline) → Tasks 2-5 (parallel fixes) → Task 6 (full suite verification)

---

## Context

### Original Request

Fix pre-existing test failures on main branch. Fix tests for active code, delete tests for deprecated components.

### Interview Summary

**Key Discussions**:

- User wants to fix active code tests and delete deprecated ones
- `lifecycle.test.ts`: Delete ENTIRE file — all tests are for deprecated engineering lifecycle
- `workers/lib/` tests: Leave alone — passing, source still exists
- `inngest-serve.test.ts`: Leave alone — AGENTS.md pre-existing failure, uses Fastify API
- Source code: MUST NOT modify any `src/` files — test-only fixes

**Research Findings**:

- 20 tests failing across 5 files
- 5 root cause groups identified (stale mock, deprecated code, missing `inngest.send` mock)
- Vitest with `singleFork: true`, 159 test files in `tests/`
- `interaction-handler.ts` calls `res.text()` at line 245 but test mock only has `.json()`
- Groups C/D/E all share the same root cause: `inngest.send()` called directly without Inngest server in tests

### Metis Review

**Identified Gaps** (all addressed):

- `inngest-serve.test.ts` is doubly broken (Fastify API + wrong count) → leave alone per AGENTS.md
- `inngest.send` mock must be set up AFTER `inngest` instance is created in test files → plan instructs `vi.spyOn`
- Must NOT modify source code to fix tests → explicit guardrail added
- Must establish baseline failure count before changes → Task 1
- Must verify per-file after each fix → each task has targeted test command

---

## Work Objectives

### Core Objective

Eliminate all test failures caused by stale mocks and deprecated code, so the only remaining failures are the documented pre-existing ones (`container-boot.test.ts`, `inngest-serve.test.ts`, `inngest/integration.test.ts`).

### Concrete Deliverables

- 4 test files fixed (mock corrections)
- 1 test file deleted (deprecated `lifecycle.test.ts`)
- AGENTS.md pre-existing failures section updated
- Full test suite run with 0 new failures

### Definition of Done

- [ ] `pnpm test -- --run` exits with only documented pre-existing failures
- [ ] No regressions — passing test count stays same or increases
- [ ] AGENTS.md accurately reflects which tests are known failures

### Must Have

- Baseline failure count captured before any changes
- Each fix verified with targeted `pnpm test -- --run <file>` before moving on
- Full suite run after all fixes to confirm no regressions
- `inngest.send` mocked via `vi.spyOn(inngest, 'send')` in affected test files

### Must NOT Have (Guardrails)

- DO NOT modify any source files under `src/` — test-only fixes
- DO NOT fix `inngest-serve.test.ts` — pre-existing per AGENTS.md
- DO NOT fix `container-boot.test.ts` — pre-existing per AGENTS.md
- DO NOT fix `tests/inngest/integration.test.ts` — pre-existing per AGENTS.md
- DO NOT delete `tests/workers/lib/` test files — user decided to leave alone
- DO NOT delete `tests/workers/lib/postgrest-client.test.ts` — active shared code
- DO NOT refactor source code to make tests pass — only fix test mocks/setup
- DO NOT add new test files — only fix or delete existing ones

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (fixing existing tests)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task verifies by running `pnpm test -- --run <specific-file>`. Final task runs full suite.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — baseline + independent fixes):
├── Task 1: Capture baseline test results [quick]
├── Task 2: Fix interaction-handler.test.ts mock (Group A) [quick]
├── Task 3: Delete lifecycle.test.ts (Group B) [quick]

Wave 2 (After Wave 1 — depends on baseline, parallel fixes):
├── Task 4: Fix lifecycle-rejection-feedback + delivery tests (Groups C+D) [unspecified-high]
├── Task 5: Fix lifecycle-guest-approval.test.ts (Group E) [quick]

Wave 3 (After Wave 2 — verification + cleanup):
├── Task 6: Full suite verification + AGENTS.md update [unspecified-high]

Wave FINAL (After ALL tasks):
├── F1: Plan Compliance Audit — oracle
├── F2: Code Quality Review — unspecified-high
├── F3: Real Manual QA — unspecified-high
├── F4: Scope Fidelity Check — deep
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 4, 5, 6 | 1    |
| 2    | —          | 6       | 1    |
| 3    | —          | 6       | 1    |
| 4    | 1          | 6       | 2    |
| 5    | 1          | 6       | 2    |
| 6    | 2, 3, 4, 5 | F1-F4   | 3    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 2 tasks — T4 `unspecified-high`, T5 `quick`
- **Wave 3**: 1 task — T6 `unspecified-high`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Capture baseline test results

  **What to do**:
  - Run `pnpm test -- --run 2>&1 | tee /tmp/test-baseline.log`
  - Record: total tests, passing count, failing count, list of failing test files
  - Save output to `.sisyphus/evidence/task-1-baseline.txt`
  - This establishes the "before" state to compare against after fixes

  **Must NOT do**:
  - Do NOT modify any files
  - Do NOT attempt to fix anything in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None

  **References**:
  - `vitest.config.ts` — test framework config, pool settings, timeout
  - `tests/helpers/global-setup.ts` — global setup runs migrations + seed before tests

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Capture baseline test results
    Tool: Bash
    Preconditions: Docker Compose running (test DB available at localhost:54322)
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee /tmp/test-baseline.log
      2. Extract summary line: grep "Tests" /tmp/test-baseline.log | tail -1
      3. Extract failing files: grep "FAIL" /tmp/test-baseline.log
      4. Save evidence: cp /tmp/test-baseline.log .sisyphus/evidence/task-1-baseline.txt
    Expected Result: Summary shows ~20 failing tests across 5 known files. Exact count recorded.
    Failure Indicators: Test suite can't run (DB not available, missing deps)
    Evidence: .sisyphus/evidence/task-1-baseline.txt
  ```

  **Commit**: NO (no code changes)

---

- [x] 2. Fix `interaction-handler.test.ts` — add `.text()` to fetch mock (Group A, 9 failures)

  **What to do**:
  - Open `tests/inngest/interaction-handler.test.ts`
  - Find the `beforeEach` block where `globalThis.fetch` is mocked (or `vi.stubGlobal('fetch', ...)`)
  - Every mock fetch response object currently has `.json()` but is missing `.text()`
  - Add `text: vi.fn().mockResolvedValue('')` (or appropriate string) to ALL mock response objects
  - The production code at `src/inngest/interaction-handler.ts:245` calls `res.text()` on failed responses
  - Run `pnpm test -- --run tests/inngest/interaction-handler.test.ts` → all 9 tests should pass

  **Must NOT do**:
  - Do NOT modify `src/inngest/interaction-handler.ts` — test-only fix
  - Do NOT change the test assertions — only fix the mock setup
  - Do NOT add new tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `tests/inngest/interaction-handler.test.ts` — the test file to fix. Look at the `beforeEach` mock setup.
  - `src/inngest/interaction-handler.ts:245` — where `res.text()` is called. Read this to understand what the mock needs to provide.

  **WHY Each Reference Matters**:
  - `interaction-handler.test.ts` beforeEach: Contains the fetch mock that's missing `.text()`. The fix is adding it here.
  - `interaction-handler.ts:245`: Shows the code path that calls `res.text()` — confirms what the mock must provide.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 9 interaction-handler tests pass after mock fix
    Tool: Bash
    Preconditions: Test DB available
    Steps:
      1. Run: pnpm test -- --run tests/inngest/interaction-handler.test.ts 2>&1
      2. Assert exit code 0
      3. Assert output contains "9 passed" (or all tests in the describe block pass)
      4. Assert output does NOT contain "FAIL" or "failed"
    Expected Result: All 9 tests pass, exit code 0
    Failure Indicators: Any test still fails with "res.text is not a function"
    Evidence: .sisyphus/evidence/task-2-interaction-handler-fix.txt

  Scenario: No changes to source code
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: git diff --name-only -- src/
      2. Assert output is empty (no src/ files changed)
    Expected Result: Zero source files modified
    Evidence: .sisyphus/evidence/task-2-no-src-changes.txt
  ```

  **Commit**: YES
  - Message: `fix(tests): add missing .text() to fetch mock in interaction-handler tests`
  - Files: `tests/inngest/interaction-handler.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/interaction-handler.test.ts`

---

- [x] 3. Delete `lifecycle.test.ts` (Group B — deprecated engineering lifecycle)

  **What to do**:
  - Delete the entire file: `tests/inngest/lifecycle.test.ts`
  - This file tests the deprecated `createLifecycleFunction` from `src/inngest/lifecycle.ts` (engineering employee, on hold per AGENTS.md)
  - All tests in this file test deprecated code — not just the 6 failing `USE_FLY_HYBRID` tests
  - Verify deletion doesn't break other test files (no other file imports from this test)

  **Must NOT do**:
  - Do NOT delete `tests/inngest/employee-lifecycle*.test.ts` files — those test the ACTIVE universal lifecycle
  - Do NOT delete `src/inngest/lifecycle.ts` — only the test file, not the source
  - Do NOT delete any other test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `tests/inngest/lifecycle.test.ts` — the file to delete. Contains ~900 lines testing deprecated `createLifecycleFunction`.
  - `AGENTS.md` "Deprecated Components" table — confirms `src/inngest/lifecycle.ts` is deprecated.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: lifecycle.test.ts deleted and no other tests break
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: rm tests/inngest/lifecycle.test.ts
      2. Verify: ls tests/inngest/lifecycle.test.ts → file not found
      3. Run: grep -r "lifecycle.test" tests/ → no imports referencing this file
      4. Run: pnpm test -- --run tests/inngest/ 2>&1 | tail -20
      5. Assert no new failures introduced by deletion
    Expected Result: File deleted, no other test files break
    Failure Indicators: Other test files import from lifecycle.test.ts (unlikely but check)
    Evidence: .sisyphus/evidence/task-3-lifecycle-deletion.txt
  ```

  **Commit**: YES
  - Message: `chore(tests): delete deprecated engineering lifecycle test file`
  - Files: `tests/inngest/lifecycle.test.ts` (deletion)

---

- [x] 4. Fix rejection-feedback + delivery tests (Groups C+D, 4 failures)

  **What to do**:
  - Fix `tests/inngest/lifecycle-rejection-feedback.test.ts` (3 failures) and `tests/inngest/employee-lifecycle-delivery.test.ts` (1 failure)
  - Root cause: `employee-lifecycle.ts` calls `inngest.send()` directly (not `step.sendEvent`) in some code paths. In tests, there's no Inngest server so `inngest.send()` throws.
  - Fix approach: In each test file's `beforeEach`, add `vi.spyOn(inngest, 'send').mockResolvedValue(undefined)` AFTER the `inngest` instance is created. This prevents the raw `inngest.send()` from hitting a real server.
  - IMPORTANT: The `inngest` instance is created inside the test file. The spy must be set up on the existing instance, not via `vi.mock`.
  - After mocking `inngest.send`, the actual rejection behavior tests may need the mock to be more specific — read the test expectations carefully to understand what `inngest.send` should return.
  - Also investigate: Are the `mockPostMessage` assertions correct? The tests expect rejection thread replies via `mockPostMessage`, but the code might use a different mechanism. Read the rejection path in `employee-lifecycle.ts` to trace how the thread reply is posted.

  **Must NOT do**:
  - Do NOT modify `src/inngest/employee-lifecycle.ts` — test-only fixes
  - Do NOT change test assertions that verify correct behavior — only fix the mock setup
  - Do NOT modify tests in other files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful analysis of how `inngest.send()` is called in the lifecycle, tracing through step functions to understand which code path fails, and precise mock setup.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (needs baseline to compare)

  **References**:
  - `tests/inngest/lifecycle-rejection-feedback.test.ts` — 3 failing tests: "posts thread reply", "metadata includes rejection_feedback_requested", "metadata merge preserves existing"
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — 1 failing test: "reject action → task Cancelled, thread reply posted"
  - `src/inngest/employee-lifecycle.ts:928` — supersede path calls `inngest.send()` directly
  - `src/inngest/employee-lifecycle.ts:1114` — approve path calls `inngest.send()` for `rule.extract-requested`
  - `tests/inngest/lifecycle-guest-approval.test.ts` — reference for how other test files mock similar patterns (this file already mocks `step.sendEvent` at line 155)

  **WHY Each Reference Matters**:
  - `lifecycle-rejection-feedback.test.ts`: The 3 failing tests — read to understand what behavior they expect (thread reply text, metadata fields)
  - `employee-lifecycle-delivery.test.ts`: The 1 failing test — read to understand the reject flow assertions
  - `employee-lifecycle.ts:928,1114`: The two `inngest.send()` call sites that throw in tests — need to know which one is reached in rejection vs approval paths
  - `lifecycle-guest-approval.test.ts:155`: Shows the `step.sendEvent` mock pattern already used in this codebase

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 3 lifecycle-rejection-feedback tests pass
    Tool: Bash
    Preconditions: Test DB available
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-rejection-feedback.test.ts 2>&1
      2. Assert exit code 0
      3. Assert output does NOT contain "FAIL" or "failed"
    Expected Result: All tests pass, exit code 0
    Failure Indicators: Tests still fail with inngest.send error or mockPostMessage assertion
    Evidence: .sisyphus/evidence/task-4-rejection-feedback-fix.txt

  Scenario: employee-lifecycle-delivery reject test passes
    Tool: Bash
    Preconditions: Test DB available
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts 2>&1
      2. Assert exit code 0
      3. Assert output does NOT contain "FAIL" or "failed"
    Expected Result: All tests pass, exit code 0
    Evidence: .sisyphus/evidence/task-4-delivery-fix.txt

  Scenario: No source files modified
    Tool: Bash
    Steps:
      1. Run: git diff --name-only -- src/
      2. Assert output is empty
    Expected Result: Zero src/ files changed
    Evidence: .sisyphus/evidence/task-4-no-src-changes.txt
  ```

  **Commit**: YES
  - Message: `fix(tests): mock inngest.send in rejection-feedback and delivery tests`
  - Files: `tests/inngest/lifecycle-rejection-feedback.test.ts`, `tests/inngest/employee-lifecycle-delivery.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/lifecycle-rejection-feedback.test.ts tests/inngest/employee-lifecycle-delivery.test.ts`

---

- [x] 5. Fix `lifecycle-guest-approval.test.ts` (Group E, 1 failure)

  **What to do**:
  - Fix `tests/inngest/lifecycle-guest-approval.test.ts` — the "approve with editedContent" test
  - Root cause: The `approve with editedContent` code path in `employee-lifecycle.ts:1114` calls `inngest.send({ name: 'employee/rule.extract-requested', ... })` directly. In tests, this throws `Inngest API Error: 200 []`.
  - Fix approach: Add `vi.spyOn(inngest, 'send').mockResolvedValue(undefined)` in the test's `beforeEach` or in the specific test case setup
  - This file already mocks `step.sendEvent` at line 155 — the `inngest.send` mock is a separate concern (direct Inngest client call vs step-based event send)

  **Must NOT do**:
  - Do NOT modify `src/inngest/employee-lifecycle.ts`
  - Do NOT change the test to skip the editedContent path
  - Do NOT break other passing tests in this file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:
  - `tests/inngest/lifecycle-guest-approval.test.ts` — the test file. Line 155 has existing `step.sendEvent` mock. The "approve with editedContent" test is the failing one.
  - `src/inngest/employee-lifecycle.ts:1114` — the `inngest.send()` call that throws in test env
  - `tests/inngest/lifecycle-rejection-feedback.test.ts` — after Task 4 fixes it, reference the `inngest.send` mock pattern used there

  **WHY Each Reference Matters**:
  - `lifecycle-guest-approval.test.ts:155`: Shows existing mock pattern — add `inngest.send` mock alongside it
  - `employee-lifecycle.ts:1114`: Confirms the exact `inngest.send` call signature to mock

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All lifecycle-guest-approval tests pass
    Tool: Bash
    Preconditions: Test DB available
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-guest-approval.test.ts 2>&1
      2. Assert exit code 0
      3. Assert output does NOT contain "FAIL" or "failed"
      4. Assert "approve with editedContent" test specifically passes
    Expected Result: All tests pass including the editedContent approve test
    Failure Indicators: inngest.send error persists, or other tests break
    Evidence: .sisyphus/evidence/task-5-guest-approval-fix.txt
  ```

  **Commit**: YES
  - Message: `fix(tests): mock inngest.send in guest-approval editedContent test`
  - Files: `tests/inngest/lifecycle-guest-approval.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/lifecycle-guest-approval.test.ts`

---

- [x] 6. Full suite verification + AGENTS.md update

  **What to do**:
  - Run the FULL test suite: `pnpm test -- --run 2>&1 | tee /tmp/test-final.log`
  - Compare against baseline from Task 1:
    - Failing count should be LOWER (20 failures fixed → only pre-existing remain)
    - Passing count should be same or higher
  - Identify remaining failures — should ONLY be the documented pre-existing ones:
    - `container-boot.test.ts` (Docker socket required — skips gracefully)
    - `inngest-serve.test.ts` (Fastify API + wrong function count)
    - `inngest/integration.test.ts` (INNGEST_DEV_URL required — skips gracefully)
  - Update AGENTS.md "Pre-existing Test Failures" section to accurately reflect reality:
    - Remove any entries that no longer fail
    - Add any newly discovered failures that are genuinely pre-existing
    - Update the count in the `pnpm test -- --run` expected output
  - Save final test output as evidence

  **Must NOT do**:
  - Do NOT modify source files
  - Do NOT add new pre-existing failure entries for tests we just fixed (they should be passing now)
  - Do NOT delete the pre-existing failure entries for `container-boot.test.ts` — it still needs Docker

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Needs careful comparison of before/after results, precise AGENTS.md editing, and full suite analysis
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: F1-F4 (Final Verification Wave)
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:
  - `.sisyphus/evidence/task-1-baseline.txt` — baseline test results from Task 1
  - `AGENTS.md` — "Pre-existing Test Failures" section (search for "Pre-existing Test Failures")
  - `README.md` — also mentions expected test count and known failures

  **WHY Each Reference Matters**:
  - Baseline evidence: Compare before/after to confirm improvements
  - AGENTS.md: The section to update with accurate failure information
  - README.md: May also need updating if it references specific test counts

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full suite shows fewer failures than baseline
    Tool: Bash
    Preconditions: All previous tasks committed
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee /tmp/test-final.log
      2. Extract summary: grep "Tests" /tmp/test-final.log | tail -1
      3. Compare against baseline in .sisyphus/evidence/task-1-baseline.txt
      4. Assert failing count is LOWER than baseline
      5. Assert passing count is SAME or HIGHER than baseline
      6. Verify remaining failures are ONLY: container-boot, inngest-serve, integration.test.ts
    Expected Result: ~14 fewer failures than baseline, only documented pre-existing failures remain
    Failure Indicators: New failures appear, or fixed tests still fail
    Evidence: .sisyphus/evidence/task-6-final-suite.txt

  Scenario: AGENTS.md accurately reflects remaining failures
    Tool: Bash
    Steps:
      1. Read AGENTS.md "Pre-existing Test Failures" section
      2. Verify each listed test actually fails
      3. Verify no unlisted tests are failing (besides the documented ones)
    Expected Result: AGENTS.md matches reality
    Evidence: .sisyphus/evidence/task-6-agents-md-update.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md pre-existing test failures section`
  - Files: `AGENTS.md`

---

- [ ] 7. Notify completion

  Send Telegram notification: plan `fix-test-failures` complete, all tasks done, come back to review results.

  ```bash
  npx tsx scripts/telegram-notify.ts "📋 fix-test-failures complete — All tasks done. Come back to review results."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Blocked By**: F1-F4 + user okay
  - **Blocks**: None

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed test files for: empty tests, trivial assertions (`expect(true).toBe(true)`), mocks that swallow real errors, unused imports. Check no source files were modified.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Run `pnpm test -- --run` from clean state. Verify that the ONLY remaining failures are the documented pre-existing ones (`container-boot.test.ts`, `inngest-serve.test.ts`, `inngest/integration.test.ts`). Count total pass/fail. Compare against baseline from Task 1. Save evidence.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1. Check "Must NOT do" compliance — especially that NO `src/` files were modified. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message                                                                      | Files                                                                                                     | Pre-commit                                                                                                                |
| ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 2          | `fix(tests): add missing .text() to fetch mock in interaction-handler tests` | `tests/inngest/interaction-handler.test.ts`                                                               | `pnpm test -- --run tests/inngest/interaction-handler.test.ts`                                                            |
| 3          | `chore(tests): delete deprecated engineering lifecycle test file`            | `tests/inngest/lifecycle.test.ts`                                                                         | —                                                                                                                         |
| 4          | `fix(tests): mock inngest.send in rejection-feedback and delivery tests`     | `tests/inngest/lifecycle-rejection-feedback.test.ts`, `tests/inngest/employee-lifecycle-delivery.test.ts` | `pnpm test -- --run tests/inngest/lifecycle-rejection-feedback.test.ts tests/inngest/employee-lifecycle-delivery.test.ts` |
| 5          | `fix(tests): mock inngest.send in guest-approval editedContent test`         | `tests/inngest/lifecycle-guest-approval.test.ts`                                                          | `pnpm test -- --run tests/inngest/lifecycle-guest-approval.test.ts`                                                       |
| 6          | `docs: update AGENTS.md pre-existing test failures section`                  | `AGENTS.md`                                                                                               | —                                                                                                                         |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run  # Expected: only container-boot, inngest-serve, integration.test.ts failures remain
pnpm build          # Expected: exits 0
```

### Final Checklist

- [ ] All 14 active test failures fixed
- [ ] `lifecycle.test.ts` deleted
- [ ] No `src/` files modified
- [ ] AGENTS.md pre-existing failures section accurate
- [ ] Full suite regression check passed
- [ ] Passing test count same or higher than baseline
