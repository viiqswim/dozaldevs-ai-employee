# Test Suite Audit & Cleanup

## TL;DR

> **Quick Summary**: Audit the entire test suite — delete ~43 deprecated test files, fix 19 failing tests (stale mocks), investigate 14 silently-skipped tests, merge 1 duplicate, and verify green CI.
>
> **Deliverables**:
>
> - All deprecated test files removed from disk
> - All 19 failing tests fixed (3 root causes: mock mismatch, empty prisma, stale content)
> - Silently-skipped tests resolved (fixed or removed with rationale)
> - Duplicate tenant-secret-repository tests merged
> - `pnpm test -- --run` exits 0 with 0 failures
> - vitest.config.ts exclude list simplified (no longer need globs for deleted files)
> - AGENTS.md expected test count updated
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (delete deprecated) → Task 3 (simplify vitest config) → Task 10 (final verification)

---

## Context

### Original Request

User wants to review all tests, figure out which to keep/remove, and ensure remaining important tests all pass. Test suite has been neglected — user hasn't run tests recently.

### Interview Summary

**Key Discussions**:

- Full audit revealed 150 test files, 107 active, ~43 already excluded by vitest.config.ts
- Current state: 1505 tests, 1445 pass, 19 fail, 41 skipped
- User wants Green CI: all remaining tests pass, dead weight removed

**Research Findings**:

- 19 failures are ALL stale mocks — production code changed (findUnique→findFirst, added prisma.archetype.findFirst call, agents.md content diverged), tests weren't updated
- ~43 deprecated files already excluded by vitest config but still on disk
- 2 groups of silently-skipped tests need investigation: tenant-repository (13), feedback-context-rejection (1)
- 1 duplicate: tenant-secret-repository tested in both `tests/` and `src/__tests__/`

### Metis Review

**Identified Gaps** (addressed):

- Vitest config exclude globs should be simplified after file deletion — added as Task 3
- AGENTS.md expected test count ("515+") needs updating after cleanup — added to final verification
- Need to verify no other code imports from deprecated test helpers — covered by running full suite after deletion

---

## Work Objectives

### Core Objective

Achieve a clean, green test suite where every remaining test passes, all dead test code is removed, and the vitest configuration is simplified.

### Concrete Deliverables

- 0 test failures on `pnpm test -- --run`
- ~43 deprecated test files deleted
- vitest.config.ts simplified (fewer exclude patterns)
- Duplicate test merged into one canonical file
- AGENTS.md test count updated

### Definition of Done

- [ ] `pnpm test -- --run` exits 0 with 0 failures
- [ ] No deprecated test files exist on disk
- [ ] vitest.config.ts exclude list only contains items that still exist
- [ ] No duplicate test files for the same module

### Must Have

- All 19 failing tests fixed (not deleted — they test active code)
- All deprecated test files deleted from disk
- Silently-skipped tests investigated and resolved
- Full test suite passes after all changes

### Must NOT Have (Guardrails)

- Do NOT write new tests — only fix or remove existing
- Do NOT modify production source code — only test files and vitest config
- Do NOT reseed the database — update test expectations instead
- Do NOT touch pre-existing known skips documented in AGENTS.md (container-boot, inngest-serve function count)
- Do NOT fix the 2 pre-existing test failures listed in AGENTS.md — they are known and tracked

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, fully configured)
- **Automated tests**: YES (tests-after — fixing existing tests, not TDD)
- **Framework**: Vitest
- **If TDD**: N/A

### QA Policy

Every task MUST verify by running the relevant test files. Final wave runs the complete suite.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Test verification**: Use Bash (`pnpm test -- --run path/to/file.test.ts`) — assert 0 failures
- **File deletion verification**: Use Bash (`ls path/to/deleted/file`) — assert "No such file"
- **Full suite**: Use Bash (`pnpm test -- --run`) — assert exit code 0

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent cleanup tasks):
├── Task 1: Delete deprecated test files [quick]
├── Task 2: Fix hostfully + supersede-threading mock mismatch [quick]
├── Task 4: Fix admin-employee-trigger mock [quick]
├── Task 5: Fix migration-agents-md test expectations [quick]
├── Task 6: Fix github-stub empty body test [quick]
└── Task 7: Investigate & fix tenant-repository skipped tests [unspecified-high]

Wave 2 (After Wave 1 — depends on deletions + investigation results):
├── Task 3: Simplify vitest.config.ts excludes (depends: 1) [quick]
├── Task 8: Investigate & fix lifecycle-feedback-context-rejection (depends: none, but sequenced for clarity) [quick]
└── Task 9: Merge duplicate tenant-secret-repository tests [quick]

Wave 3 (After ALL — final verification):
├── Task 10: Full test suite verification + AGENTS.md update [unspecified-high]
└── Task 11: Notify completion via Telegram [quick]

Critical Path: Task 1 → Task 3 → Task 10
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | -          | 3, 10  |
| 2    | -          | 10     |
| 3    | 1          | 10     |
| 4    | -          | 10     |
| 5    | -          | 10     |
| 6    | -          | 10     |
| 7    | -          | 10     |
| 8    | -          | 10     |
| 9    | -          | 10     |
| 10   | 1-9        | 11     |
| 11   | 10         | -      |

### Agent Dispatch Summary

- **Wave 1**: **6** — T1 → `quick`, T2 → `quick`, T4 → `quick`, T5 → `quick`, T6 → `quick`, T7 → `unspecified-high`
- **Wave 2**: **3** — T3 → `quick`, T8 → `quick`, T9 → `quick`
- **Wave 3**: **2** — T10 → `unspecified-high`, T11 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Delete all deprecated test files from disk

  **What to do**:
  - Delete ALL of the following test files (they test deprecated modules and are already excluded by vitest.config.ts):

  **Inngest deprecated tests:**
  - `tests/inngest/redispatch.test.ts`
  - `tests/inngest/watchdog.test.ts`
  - `tests/inngest/learned-rules-expiry.test.ts`
  - `tests/inngest/triggers/summarizer-trigger.test.ts`

  **Workers deprecated tests (root):**
  - `tests/workers/orchestrate.test.ts`
  - `tests/workers/entrypoint.test.ts`
  - `tests/workers/install-runner.test.ts`
  - `tests/workers/tooling-config-install.test.ts`

  **Workers config deprecated tests:**
  - `tests/workers/config/agents-md-content.test.ts`
  - Delete the entire `tests/workers/config/` directory if empty after deletion

  **Workers tools deprecated tests:**
  - `tests/workers/tools/param-resolver.test.ts`
  - `tests/workers/tools/slack-post-message.test.ts`
  - Delete the entire `tests/workers/tools/` directory if empty after deletion

  **Workers lib deprecated tests (ALL of these — keep only the 5 active ones):**
  Delete every `.test.ts` file in `tests/workers/lib/` EXCEPT these 5 which test active code:
  - `opencode-server.test.ts` — KEEP
  - `postgrest-client.test.ts` — KEEP
  - `output-schema.test.ts` — KEEP
  - `approval-card-poster.test.ts` — KEEP
  - `agents-md-resolver.test.ts` — KEEP

  Files to DELETE from `tests/workers/lib/`:
  - `agents-md-reader.test.ts`
  - `between-wave-push.test.ts`
  - `branch-manager.test.ts`
  - `cache-validator.test.ts`
  - `ci-classifier.test.ts`
  - `completion.test.ts`
  - `completion-detector.test.ts`
  - `continuation-dispatcher.test.ts`
  - `cost-breaker.test.ts`
  - `cost-tracker-v2.test.ts`
  - `disk-check.test.ts`
  - `fallback-pr.test.ts`
  - `fix-loop.test.ts`
  - `heartbeat.test.ts`
  - `plan-judge.test.ts`
  - `plan-parser.test.ts`
  - `plan-sync.test.ts`
  - `planning-orchestrator.test.ts`
  - `pr-manager.test.ts`
  - `project-config.test.ts`
  - `prompt-builder.test.ts`
  - `resource-caps.test.ts`
  - `session-manager.test.ts`
  - `task-context.test.ts`
  - `token-tracker.test.ts`
  - `validation-pipeline.test.ts`
  - `wave-executor.test.ts`

  Also check for any files named `failure-codes.test.ts` or `heartbeat.test.ts` in the keeplist of vitest.config.ts — the config mentions them in the negation glob. If `heartbeat.test.ts` exists and tests active code, keep it. If it tests deprecated code, delete it.

  **Must NOT do**:
  - Do NOT delete the 5 active test files in `tests/workers/lib/` listed above
  - Do NOT delete `tests/workers/harness-placeholder-validation.test.ts` — this tests the active harness (note: it IS in the vitest exclude list which may be a bug — Task 3 will address this)
  - Do NOT modify any production source code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure file deletion — no logic, no code changes, just `rm` commands
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not relevant — we're deleting test files, not adding tools

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4, 5, 6, 7)
  - **Blocks**: Task 3 (vitest config simplification), Task 10 (final verification)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `vitest.config.ts:6-24` — Current exclude list showing which files are excluded (confirms they're safe to delete)

  **API/Type References**: None

  **Test References**: N/A (we're deleting tests)

  **External References**: None

  **WHY Each Reference Matters**:
  - `vitest.config.ts` exclude list confirms these files are already not running — deletion is safe and the exclude patterns can be simplified afterward

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All deprecated files are deleted
    Tool: Bash
    Preconditions: Files exist on disk
    Steps:
      1. Run `ls tests/workers/orchestrate.test.ts 2>&1` — should say "No such file"
      2. Run `ls tests/inngest/redispatch.test.ts 2>&1` — should say "No such file"
      3. Run `ls tests/workers/lib/wave-executor.test.ts 2>&1` — should say "No such file"
      4. Run `ls tests/workers/lib/pr-manager.test.ts 2>&1` — should say "No such file"
      5. Run `ls tests/workers/config/ 2>&1` — should say "No such file or directory"
      6. Run `ls tests/workers/tools/ 2>&1` — should say "No such file or directory"
    Expected Result: All deprecated files return "No such file"
    Failure Indicators: Any file still exists
    Evidence: .sisyphus/evidence/task-1-deprecated-files-deleted.txt

  Scenario: Active test files are preserved
    Tool: Bash
    Preconditions: Active files should NOT be deleted
    Steps:
      1. Run `ls tests/workers/lib/opencode-server.test.ts` — should exist
      2. Run `ls tests/workers/lib/postgrest-client.test.ts` — should exist
      3. Run `ls tests/workers/lib/output-schema.test.ts` — should exist
      4. Run `ls tests/workers/lib/approval-card-poster.test.ts` — should exist
      5. Run `ls tests/workers/lib/agents-md-resolver.test.ts` — should exist
    Expected Result: All 5 active files exist
    Failure Indicators: Any active file was accidentally deleted
    Evidence: .sisyphus/evidence/task-1-active-files-preserved.txt
  ```

  **Commit**: YES (group 1)
  - Message: `chore(tests): remove deprecated engineering worker test files`
  - Files: ~43 deleted test files
  - Pre-commit: `pnpm test -- --run`

- [ ] 2. Fix hostfully.test.ts and supersede-threading.test.ts mock mismatch

  **What to do**:
  - In `tests/gateway/routes/hostfully.test.ts`: The test's `makeApp()` helper mocks `archetype.findUnique` but the production code at `src/gateway/routes/hostfully.ts` calls `archetype.findFirst`. Update the mock to use `findFirst` instead of `findUnique`.
  - In `tests/inngest/supersede-threading.test.ts`: Same root cause — this test also sets up a mock for the hostfully route that uses `archetypeFindUnique`. Update to `archetypeFindFirst`.
  - Search both files for every occurrence of `findUnique` related to archetype and replace with `findFirst`
  - Run the affected tests to verify they pass

  **Must NOT do**:
  - Do NOT modify the production code (`src/gateway/routes/hostfully.ts`) — only fix the tests
  - Do NOT change the mock's return value shape — only the method name

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple find-and-replace in mock setup — 2 files, same pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 4, 5, 6, 7)
  - **Blocks**: Task 10 (final verification)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/routes/hostfully.ts` — Production code using `archetype.findFirst` (the correct method name)
  - `tests/gateway/routes/hostfully.test.ts` — Find `findUnique` references in the mock setup (look at `makeApp()` helper)
  - `tests/inngest/supersede-threading.test.ts` — Same mock pattern to update

  **WHY Each Reference Matters**:
  - The production code shows the correct method name (`findFirst`) that tests should mock
  - The test files show the stale mock (`findUnique`) that needs updating

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: hostfully.test.ts all tests pass
    Tool: Bash
    Preconditions: Mock updated from findUnique to findFirst
    Steps:
      1. Run `pnpm test -- --run tests/gateway/routes/hostfully.test.ts`
      2. Check output for "Tests: X passed"
      3. Check exit code is 0
    Expected Result: All tests pass (previously 10 were failing)
    Failure Indicators: Any test failure or non-zero exit code
    Evidence: .sisyphus/evidence/task-2-hostfully-tests.txt

  Scenario: supersede-threading.test.ts all tests pass
    Tool: Bash
    Preconditions: Mock updated from findUnique to findFirst
    Steps:
      1. Run `pnpm test -- --run tests/inngest/supersede-threading.test.ts`
      2. Check output for "Tests: X passed"
      3. Check exit code is 0
    Expected Result: All tests pass (previously 2 were failing)
    Failure Indicators: Any test failure or non-zero exit code
    Evidence: .sisyphus/evidence/task-2-supersede-tests.txt
  ```

  **Commit**: YES (group 2)
  - Message: `fix(tests): update stale mocks to match production code`
  - Files: `tests/gateway/routes/hostfully.test.ts`, `tests/inngest/supersede-threading.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/routes/hostfully.test.ts tests/inngest/supersede-threading.test.ts`

- [ ] 3. Simplify vitest.config.ts exclude list after deprecated file deletion

  **What to do**:
  - After Task 1 deletes the deprecated files, the vitest.config.ts exclude patterns are now redundant (they reference files that no longer exist)
  - Remove ALL exclude entries that reference deleted files
  - Keep only exclude entries for files that still exist on disk (if any)
  - Specifically investigate `tests/workers/harness-placeholder-validation.test.ts` — it's listed in the excludes but appears to test active code (`opencode-harness.mts`). If it tests active code, REMOVE it from the exclude list so it runs. Read the file first to confirm.
  - Also check if `failure-codes.test.ts` and `heartbeat.test.ts` still exist in `tests/workers/lib/` — they are referenced in the negation glob. If they were deleted in Task 1, the entire negation glob can be removed.
  - After simplifying, the exclude array should be minimal or empty
  - Run the full test suite to verify nothing broke

  **Must NOT do**:
  - Do NOT change any other vitest.config.ts settings (pool, timeout, env, globalSetup)
  - Do NOT add new exclude entries

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config file edit — read current state, remove dead entries, verify
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 10 (final verification)
  - **Blocked By**: Task 1 (must delete files first)

  **References**:

  **Pattern References**:
  - `vitest.config.ts:6-24` — Current exclude list to simplify
  - `tests/workers/harness-placeholder-validation.test.ts` — Read to determine if it tests active or deprecated code

  **WHY Each Reference Matters**:
  - `vitest.config.ts` is the file being edited
  - `harness-placeholder-validation.test.ts` needs to be read to decide whether to keep or remove its exclude entry

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: vitest.config.ts exclude list is minimal
    Tool: Bash
    Preconditions: Deprecated files deleted in Task 1
    Steps:
      1. Read `vitest.config.ts`
      2. Verify exclude array has no entries referencing non-existent files
      3. Run `pnpm test -- --run` to verify full suite still works
    Expected Result: Config is clean, all tests pass
    Failure Indicators: Exclude references non-existent files, or tests fail
    Evidence: .sisyphus/evidence/task-3-vitest-config.txt

  Scenario: harness-placeholder-validation runs if it tests active code
    Tool: Bash
    Preconditions: File was investigated and determined to test active code
    Steps:
      1. Run `pnpm test -- --run tests/workers/harness-placeholder-validation.test.ts`
      2. Verify it passes
    Expected Result: Test passes (it was incorrectly excluded)
    Failure Indicators: Test fails — then it should remain excluded with a comment
    Evidence: .sisyphus/evidence/task-3-harness-placeholder.txt
  ```

  **Commit**: YES (group 3)
  - Message: `chore(tests): simplify vitest config after deprecated file removal`
  - Files: `vitest.config.ts`
  - Pre-commit: `pnpm test -- --run`

- [ ] 4. Fix admin-employee-trigger.test.ts mock

  **What to do**:
  - The route at `src/gateway/routes/admin-employee-trigger.ts` now calls `prisma.archetype.findFirst(...)` before calling `dispatchEmployee`
  - The test's `makeApp()` passes `prisma: {} as never` (empty object), so `prisma.archetype` is `undefined`, causing a 500 crash before the mocked dispatcher is reached
  - Fix: Add a proper mock for `prisma.archetype.findFirst` in the test setup. The mock should return an archetype object (or `null` depending on the test scenario)
  - Read the production code first to understand what `findFirst` returns and what the test expects
  - The 4 failing tests are the ones expecting 202, 200, 404, and 501 — they all require the code to get past the `prisma.archetype.findFirst` call
  - The 2 passing tests (401 and 400) short-circuit before reaching `prisma` (auth/validation failures)

  **Must NOT do**:
  - Do NOT modify the production route code
  - Do NOT change the behavior of the 2 already-passing tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add mock to existing test helper — straightforward mock setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 5, 6, 7)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-employee-trigger.ts:60` — The `prisma.archetype.findFirst` call that needs mocking
  - `tests/gateway/routes/admin-employee-trigger.test.ts` — The `makeApp()` helper that needs the mock added

  **WHY Each Reference Matters**:
  - Production code shows exactly what `findFirst` call signature and return shape the mock needs
  - Test file shows the existing `makeApp()` pattern to extend

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 6 admin-employee-trigger tests pass
    Tool: Bash
    Preconditions: Mock added for prisma.archetype.findFirst
    Steps:
      1. Run `pnpm test -- --run tests/gateway/routes/admin-employee-trigger.test.ts`
      2. Check output for "Tests: 6 passed" (all 6, including the 4 previously failing)
      3. Check exit code is 0
    Expected Result: 6 passed, 0 failed
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-4-admin-trigger-tests.txt

  Scenario: The 2 auth/validation tests still pass unchanged
    Tool: Bash
    Preconditions: Same test run as above
    Steps:
      1. In the output from step 1, verify the 401 (missing admin key) and 400 (validation) tests still pass
    Expected Result: Auth and validation tests unaffected
    Failure Indicators: Previously passing tests now fail
    Evidence: .sisyphus/evidence/task-4-admin-trigger-tests.txt (same file)
  ```

  **Commit**: YES (group 2 — combine with Task 2's commit)
  - Message: `fix(tests): update stale mocks to match production code`
  - Files: `tests/gateway/routes/admin-employee-trigger.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/routes/admin-employee-trigger.test.ts`

- [ ] 5. Fix migration-agents-md.test.ts stale expectations

  **What to do**:
  - The test reads `src/workers/config/agents.md` and compares it against the `agents_md` column in the DB archetype row and the tenant's `default_agents_md` config
  - The static file was updated (sections 7–9 removed), but the DB was not reseeded
  - **Do NOT reseed the DB** — instead, update the test to not do a byte-for-byte comparison against the DB
  - Options (pick the most robust):
    1. Change the test to verify structural properties (e.g., "agents_md is not null", "agents_md contains expected sections") rather than exact equality
    2. Or skip the exact-match assertions and replace with assertions that the `agents_md` field is populated and contains key markers
    3. Or if the test's purpose was to ensure the DB stays in sync with the static file, and we're not reseeding, remove the test entirely (it's fundamentally brittle)
  - Read the full test file to understand what it's actually verifying before choosing an approach

  **Must NOT do**:
  - Do NOT reseed the database (`pnpm prisma db seed`)
  - Do NOT modify `src/workers/config/agents.md`
  - Do NOT modify the seed file (`prisma/seed.ts`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Update test assertions — single file, clear problem
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 6, 7)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/gateway/migration-agents-md.test.ts` — Full test file to understand what it verifies
  - `src/workers/config/agents.md` — Current static file content (source of truth for what the agents.md should contain)

  **WHY Each Reference Matters**:
  - Test file shows exactly which assertions fail and what they compare
  - Static file shows the current expected content

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: migration-agents-md tests pass
    Tool: Bash
    Preconditions: Test expectations updated
    Steps:
      1. Run `pnpm test -- --run tests/gateway/migration-agents-md.test.ts`
      2. Check exit code is 0
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-migration-agents-md.txt

  Scenario: DB was NOT reseeded
    Tool: Bash
    Preconditions: Task should not have run any seed commands
    Steps:
      1. Check bash history / evidence for any `prisma db seed` commands — should find none
    Expected Result: No seed commands were run
    Failure Indicators: Evidence of DB reseed
    Evidence: .sisyphus/evidence/task-5-no-reseed-verification.txt
  ```

  **Commit**: YES (group 2 — combine with Task 2's commit)
  - Message: `fix(tests): update stale mocks to match production code`
  - Files: `tests/gateway/migration-agents-md.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/migration-agents-md.test.ts`

- [ ] 6. Fix github-stub.test.ts empty body test

  **What to do**:
  - The test `responds to empty body without error` calls `app.inject({ method: 'POST', url: '/webhooks/github' })` with no body and no Content-Type header
  - All other tests in this file pass (they send a JSON payload)
  - The route returns 404 for this specific case — likely because Express/Fastify routing doesn't match the POST without a Content-Type
  - Read the test file and the route handler to understand the expected behavior
  - Fix options:
    1. Add `payload: {}` and/or `headers: { 'Content-Type': 'application/json' }` to the inject call
    2. If the route genuinely doesn't handle empty bodies, update the test assertion to expect 400 or 404 (whatever the actual behavior is)
    3. If this test isn't testing anything meaningful (edge case nobody cares about), remove it

  **Must NOT do**:
  - Do NOT modify the production route handler

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single test case fix — trivial
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 7)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/gateway/github-stub.test.ts` — The failing test and the passing tests (compare inject call patterns)
  - `src/gateway/routes/` — Find the github webhook route handler to understand expected behavior

  **WHY Each Reference Matters**:
  - Test file shows the difference between the failing inject call (no body) and passing ones (with body)
  - Route handler shows what the endpoint actually expects

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: github-stub.test.ts all tests pass
    Tool: Bash
    Preconditions: Empty body test fixed
    Steps:
      1. Run `pnpm test -- --run tests/gateway/github-stub.test.ts`
      2. Check exit code is 0
    Expected Result: All tests pass (previously 1 was failing)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-6-github-stub.txt
  ```

  **Commit**: YES (group 2 — combine with Task 2's commit)
  - Message: `fix(tests): update stale mocks to match production code`
  - Files: `tests/gateway/github-stub.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/github-stub.test.ts`

- [ ] 7. Investigate and resolve tenant-repository.test.ts (13 skipped tests)

  **What to do**:
  - `tests/gateway/services/tenant-repository.test.ts` has ALL 13 tests wrapped in `describe.skip` with comment: `// TODO: Pre-existing failure — all 13 tests fail (skipped 2026-05-15)`
  - This was skipped just 5 days ago — investigate WHY they fail:
    1. Remove the `describe.skip` → run as `describe`
    2. Run the tests and capture the failure output
    3. Analyze the failures:
       - If they fail due to DB schema changes (missing columns, renamed fields): Fix the test assertions to match current schema
       - If they fail due to the `TenantRepository` API changing: Fix the test calls to match current API
       - If the `TenantRepository` class itself is broken/deprecated: Remove the test file entirely
       - If they fail due to test DB setup issues: Fix the setup
  - Read `src/gateway/services/tenant-repository.ts` (the production code) to understand the current API
  - Compare against the test expectations
  - The tests use Prisma test DB directly (`getPrisma()`) and do cleanup in `afterEach`

  **Must NOT do**:
  - Do NOT modify the production `TenantRepository` class
  - Do NOT leave tests in `describe.skip` without a clear reason — either fix them or delete them with rationale

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Investigation required — need to read production code, understand why 13 tests fail, and decide fix vs remove
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/gateway/services/tenant-repository.test.ts` — Full test file (118 lines, 13 test cases)
  - `src/gateway/services/tenant-repository.ts` — Production code being tested (current API surface)

  **WHY Each Reference Matters**:
  - Test file shows what the tests expect from the TenantRepository
  - Production code shows what TenantRepository actually does — comparing the two reveals the mismatch

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: tenant-repository tests either pass or are deleted with rationale
    Tool: Bash
    Preconditions: Tests investigated
    Steps:
      1. If fixed: Run `pnpm test -- --run tests/gateway/services/tenant-repository.test.ts` — expect 0 failures
      2. If deleted: Run `ls tests/gateway/services/tenant-repository.test.ts 2>&1` — expect "No such file"
    Expected Result: Tests pass OR file is deleted (no `describe.skip` remaining)
    Failure Indicators: Tests still in `describe.skip` state, or tests fail
    Evidence: .sisyphus/evidence/task-7-tenant-repository.txt

  Scenario: No silently-skipped tests remain
    Tool: Bash
    Preconditions: Investigation complete
    Steps:
      1. Run `grep -r "describe.skip" tests/gateway/services/tenant-repository.test.ts 2>/dev/null`
      2. Should return nothing (file fixed or deleted)
    Expected Result: No `describe.skip` in this file
    Failure Indicators: `describe.skip` still present
    Evidence: .sisyphus/evidence/task-7-no-skip.txt
  ```

  **Commit**: YES (group 4)
  - Message: `fix(tests): resolve silently-skipped tests`
  - Files: `tests/gateway/services/tenant-repository.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/services/tenant-repository.test.ts` (if kept)

- [ ] 8. Investigate and resolve lifecycle-feedback-context-rejection.test.ts (1 skipped test)

  **What to do**:
  - `tests/inngest/lifecycle-feedback-context-rejection.test.ts` has 1 test skipped via `it.skip` at line 155: `it.skip('EMPLOYEE_RULES string includes confirmed rule text when dispatch-machine runs', ...)`
  - Investigate:
    1. Read the full test file to understand the test's intent
    2. Remove the `it.skip` → run as `it`
    3. If it passes: great, un-skip it and move on
    4. If it fails: analyze the failure
       - If fixable: fix it
       - If the feature it tests was removed: delete the test case (keep the other tests in the file if any)
       - If it's a mock/timing issue: fix the mock setup
  - The file is 227 lines and uses InngestTestEngine with extensive mock setup

  **Must NOT do**:
  - Do NOT modify the production lifecycle code
  - Do NOT leave it.skip without a documented reason

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single skipped test case — read, un-skip, run, fix or remove
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 9)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-feedback-context-rejection.test.ts:155` — The skipped test case
  - `src/inngest/employee-lifecycle.ts` — The lifecycle function being tested (for understanding expected behavior)

  **WHY Each Reference Matters**:
  - Test file shows what the skipped test expects — understanding this reveals whether the expectation is still valid
  - Lifecycle source shows current implementation to compare against

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skipped test either passes or is removed
    Tool: Bash
    Preconditions: Test investigated and resolved
    Steps:
      1. Run `pnpm test -- --run tests/inngest/lifecycle-feedback-context-rejection.test.ts`
      2. Check for 0 failures and 0 skips
    Expected Result: All tests pass, no skips
    Failure Indicators: Test still skipped or failing
    Evidence: .sisyphus/evidence/task-8-feedback-context.txt
  ```

  **Commit**: YES (group 4 — combine with Task 7's commit)
  - Message: `fix(tests): resolve silently-skipped tests`
  - Files: `tests/inngest/lifecycle-feedback-context-rejection.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/lifecycle-feedback-context-rejection.test.ts`

- [ ] 9. Merge duplicate tenant-secret-repository tests

  **What to do**:
  - Two test files test the same module (`TenantSecretRepository`):
    1. `tests/gateway/services/tenant-secret-repository.test.ts` — 9 test blocks, uses Prisma test DB
    2. `src/gateway/services/__tests__/tenant-secret-repository.test.ts` — 6 test blocks, uses mocks
  - Merge strategy:
    1. Read BOTH files completely
    2. Identify unique test cases in each (some may overlap)
    3. Keep the `tests/gateway/services/tenant-secret-repository.test.ts` version as the canonical location (consistent with project convention — tests go in `tests/` directory)
    4. Copy any unique test cases from the `src/__tests__/` version into the `tests/` version
    5. Delete `src/gateway/services/__tests__/tenant-secret-repository.test.ts`
    6. If the `src/gateway/services/__tests__/` directory becomes empty, delete it too
    7. Run the merged test to verify it passes

  **Must NOT do**:
  - Do NOT lose any unique test coverage during the merge
  - Do NOT modify the production `TenantSecretRepository` class

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read two files, merge, delete duplicate — straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 8)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/gateway/services/tenant-secret-repository.test.ts` — Canonical location (9 test blocks)
  - `src/gateway/services/__tests__/tenant-secret-repository.test.ts` — Duplicate to merge from (6 test blocks)
  - `src/gateway/services/tenant-secret-repository.ts` — Production code (to understand what's being tested)

  **WHY Each Reference Matters**:
  - Both test files need to be read to identify overlapping vs unique test cases
  - Production code helps understand if any test case is more valuable than another

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Merged test file passes
    Tool: Bash
    Preconditions: Tests merged, duplicate deleted
    Steps:
      1. Run `pnpm test -- --run tests/gateway/services/tenant-secret-repository.test.ts`
      2. Check exit code is 0
    Expected Result: All merged tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-9-merged-tests.txt

  Scenario: Duplicate file deleted
    Tool: Bash
    Preconditions: Merge complete
    Steps:
      1. Run `ls src/gateway/services/__tests__/tenant-secret-repository.test.ts 2>&1`
      2. Should say "No such file"
    Expected Result: Duplicate file is gone
    Failure Indicators: File still exists
    Evidence: .sisyphus/evidence/task-9-duplicate-deleted.txt
  ```

  **Commit**: YES (group 5)
  - Message: `chore(tests): merge duplicate tenant-secret-repository tests`
  - Files: `tests/gateway/services/tenant-secret-repository.test.ts`, `src/gateway/services/__tests__/tenant-secret-repository.test.ts` (deleted)
  - Pre-commit: `pnpm test -- --run tests/gateway/services/tenant-secret-repository.test.ts`

- [ ] 10. Full test suite verification and AGENTS.md update

  **What to do**:
  - Run the complete test suite: `pnpm test -- --run`
  - Verify: 0 failures
  - Capture the exact test counts: passed, skipped, total
  - Update AGENTS.md:
    - Find the line mentioning "515+" expected passing tests
    - Update it with the new accurate count from the test run
  - Also verify the pre-existing known skips documented in AGENTS.md are still just skips (not failures):
    - `container-boot.test.ts` — should skip (Docker not available)
    - `inngest-serve.test.ts` — should have 1 skip (stale function count)
  - Do NOT modify the pre-existing failure documentation in AGENTS.md — only update the expected count

  **Must NOT do**:
  - Do NOT modify any test files at this point — only AGENTS.md
  - Do NOT remove the pre-existing failure documentation from AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full suite run + documentation update + verification of known skips
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — after all fixes)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1-9 (all must complete first)

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Find "515+" or the expected test count line to update

  **WHY Each Reference Matters**:
  - AGENTS.md contains the expected test count that needs updating to reflect the cleaned-up suite

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes with 0 failures
    Tool: Bash
    Preconditions: All fix tasks (1-9) complete
    Steps:
      1. Run `pnpm test -- --run`
      2. Capture full output
      3. Verify: 0 failures in the summary line
      4. Verify exit code is 0
    Expected Result: 0 failures, exit code 0
    Failure Indicators: Any failure, non-zero exit code
    Evidence: .sisyphus/evidence/task-10-full-suite.txt

  Scenario: Known skips are still just skips (not failures)
    Tool: Bash
    Preconditions: Full suite output captured
    Steps:
      1. In the output, find `container-boot.test.ts` — should show "skipped"
      2. Find `inngest-serve.test.ts` — should show 1 skip
    Expected Result: Known skips documented in AGENTS.md are still skipping, not failing
    Failure Indicators: Known skips started failing
    Evidence: .sisyphus/evidence/task-10-known-skips.txt

  Scenario: AGENTS.md updated with correct count
    Tool: Bash
    Preconditions: Test count captured
    Steps:
      1. Read AGENTS.md and find the test count line
      2. Verify it matches the actual count from the test run
    Expected Result: Expected count matches actual
    Failure Indicators: Count mismatch
    Evidence: .sisyphus/evidence/task-10-agents-md-updated.txt
  ```

  **Commit**: YES (group 6)
  - Message: `docs: update expected test count in AGENTS.md`
  - Files: `AGENTS.md`
  - Pre-commit: `pnpm test -- --run`

- [ ] 11. Notify completion via Telegram

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ test-suite-audit complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 10)
  - **Blocks**: None
  - **Blocked By**: Task 10

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "✅ test-suite-audit complete — All tasks done. Come back to review results."`
      2. Check exit code is 0
    Expected Result: Notification sent successfully
    Evidence: .sisyphus/evidence/task-11-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + `pnpm lint`. Review all changed test files for: `as any`/`@ts-ignore`, empty catches, console.log, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Tests [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `pnpm test -- --run` and capture full output. Verify: 0 failures, no unexpected skips beyond the known ones (container-boot, inngest-serve function count, integration tests needing OPENCODE_TEST_URL). Verify deleted files are truly gone. Verify vitest.config.ts exclude patterns match only existing files.
      Output: `Tests [N pass/N skip/N fail] | Deleted files [N verified gone] | Config [CLEAN/issues] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance — no production source code modified, no new tests written, no DB reseed. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Scope [CLEAN/issues] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                              | Files                                                                                                                              | Pre-commit Check     |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1      | `chore(tests): remove deprecated engineering worker test files`      | ~43 deleted test files                                                                                                             | `pnpm test -- --run` |
| 2      | `fix(tests): update stale mocks to match production code`            | hostfully.test.ts, supersede-threading.test.ts, admin-employee-trigger.test.ts, migration-agents-md.test.ts, github-stub.test.ts   | `pnpm test -- --run` |
| 3      | `chore(tests): simplify vitest config after deprecated file removal` | vitest.config.ts                                                                                                                   | `pnpm test -- --run` |
| 4      | `fix(tests): resolve silently-skipped tests`                         | tenant-repository.test.ts, lifecycle-feedback-context-rejection.test.ts                                                            | `pnpm test -- --run` |
| 5      | `chore(tests): merge duplicate tenant-secret-repository tests`       | tests/gateway/services/tenant-secret-repository.test.ts, src/gateway/services/**tests**/tenant-secret-repository.test.ts (deleted) | `pnpm test -- --run` |
| 6      | `docs: update expected test count in AGENTS.md`                      | AGENTS.md                                                                                                                          | -                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run  # Expected: 0 failures, exit code 0
ls tests/workers/orchestrate.test.ts 2>&1  # Expected: No such file or directory
ls tests/workers/lib/wave-executor.test.ts 2>&1  # Expected: No such file or directory
ls tests/inngest/redispatch.test.ts 2>&1  # Expected: No such file or directory
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] AGENTS.md updated with new expected count
