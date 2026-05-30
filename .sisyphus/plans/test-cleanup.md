# Test Suite Nuclear Cleanup

## TL;DR

> **Quick Summary**: Delete all 22 failing test files from the suite, verify zero failures remain, and update AGENTS.md with the corrected test baseline.
>
> **Deliverables**:
>
> - 22 test files deleted
> - `pnpm test -- --run` exits with 0 failures
> - AGENTS.md updated with correct test baseline numbers
>
> **Estimated Effort**: Quick
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request

"There are way too many unit test failures and timeouts. Please help me delete those bad tests, or rewrite them so that they are actually useful and helpful, not failing or timing out."

### Interview Summary

**Key Discussions**:

- Ran full test suite: 22 files failed (63 tests), 143 passed, 1 skipped
- Failures cluster into 5 root causes: dead DB schema, stale Prisma fixtures, changed source behavior, process.exit contamination, and import crashes
- User chose "Nuclear — delete ALL questionable tests" — delete entire files including any passing tests within them

**Research Findings**:

- 1,639 tests pass currently — healthy baseline
- Known pre-existing failures (`inngest-serve.test.ts`, `container-boot.test.ts`) are NOT in the failing list and must be preserved
- AGENTS.md "Pre-existing Test Failures" section is stale — says `inngest-serve.test.ts` fails but it actually passes (1 skip)

### Metis Review

**Identified Gaps** (addressed):

- 2 crash files (`agents-md-resolver.test.ts`, `platform-procedures.test.ts`) were missing from initial count — added to delete list
- Residual `process.exit` noise from `tests/scripts/trigger-task.test.ts` will persist — accepted (it passes, just noisy)
- AGENTS.md pre-existing failures section needs correction, not just append

---

## Work Objectives

### Core Objective

Delete all 22 failing test files and update documentation to reflect the new clean baseline.

### Concrete Deliverables

- All 22 failing test files removed from disk and git
- `pnpm test -- --run` → 0 failed files, 0 failed tests
- AGENTS.md "Pre-existing Test Failures" section corrected

### Definition of Done

- [ ] `pnpm test -- --run` exits with 0 in "failed" column
- [ ] All 22 target files confirmed absent from disk
- [ ] Protected files (`container-boot.test.ts`, `inngest-serve.test.ts`) confirmed present

### Must Have

- All 22 failing test files deleted
- Zero test failures after deletion
- AGENTS.md cleaned up — hardcoded test counts removed, stale entries fixed

### Must NOT Have (Guardrails)

- DO NOT delete `tests/workers/container-boot.test.ts` (pre-existing, intentional skips)
- DO NOT delete `tests/gateway/inngest-serve.test.ts` (pre-existing, passes with 1 skip)
- DO NOT delete `tests/scripts/trigger-task.test.ts` (passes, only generates noise)
- DO NOT delete `tests/setup.test.ts` (passes, only generates noise)
- DO NOT modify any source file under `src/`
- DO NOT modify `vitest.config.ts` or test infrastructure
- DO NOT selectively fix any of the 22 files instead of deleting
- DO NOT add new test files

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None (we're deleting tests, not writing them)
- **Framework**: Vitest (existing)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — the nuclear delete):
├── Task 1: Delete all 22 failing test files [quick]

Wave 2 (After Wave 1 — verify and document):
├── Task 2: Run test suite and verify zero failures [quick]
├── Task 3: Update AGENTS.md with corrected baseline [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 3 → F1-F4 → user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 2, 3   |
| 2    | 1          | F1-F4  |
| 3    | 1          | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 2 tasks — T2 → `quick`, T3 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Delete all 22 failing test files

  **What to do**:
  - Run `git rm` on all 22 files listed below (single command):

    ```
    # Category A — dead schema (agents_md column removed)
    tests/gateway/migration-agents-md.test.ts
    tests/gateway/admin-brain-preview.test.ts

    # Category B — stale Prisma fixtures
    src/gateway/routes/__tests__/admin-archetypes-delete.test.ts
    tests/prisma/archetype-uniqueness.test.ts

    # Category C — source behavior changed, tests assert old behavior
    tests/workers/opencode-harness-delivery.test.ts
    tests/inngest/learned-rules-injection.test.ts
    tests/gateway/services/employee-dispatcher.test.ts
    tests/gateway/seed-guest-messaging.test.ts
    tests/inngest/lifecycle-worker-runtime.test.ts
    tests/workers/lib/approval-card-poster.test.ts
    src/gateway/services/__tests__/archetype-generator.test.ts
    tests/workers/opencode-harness-status-log.test.ts
    tests/gateway/gm04-classification-api.test.ts

    # Category D — process.exit contamination in Slack post-message
    tests/worker-tools/slack/post-message-auto-env.test.ts
    tests/worker-tools/slack/post-message-thread-ts.test.ts
    tests/worker-tools/slack/post-message-conversation-ref.test.ts
    tests/worker-tools/slack/post-message-approval-gating.test.ts
    tests/worker-tools/slack/post-message-newline.test.ts
    tests/worker-tools/slack/post-message.test.ts
    tests/worker-tools/slack/post-guest-approval.test.ts

    # Category F — import crashes (missing source files)
    tests/workers/lib/agents-md-resolver.test.ts
    tests/workers/lib/platform-procedures.test.ts
    ```

  - Verify all 22 files are gone from disk
  - Verify protected files are still present

  **Must NOT do**:
  - DO NOT delete `tests/workers/container-boot.test.ts`
  - DO NOT delete `tests/gateway/inngest-serve.test.ts`
  - DO NOT delete `tests/scripts/trigger-task.test.ts`
  - DO NOT delete `tests/setup.test.ts`
  - DO NOT modify any source code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file deletion — no logic, no code changes
  - **Skills**: []
    - No skills needed for file deletion
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not relevant — deleting tests, not adding tools

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete before verification)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - None needed — simple `git rm` operations

  **Guardrail References**:
  - `AGENTS.md` § "Pre-existing Test Failures" — lists `container-boot.test.ts` and `inngest-serve.test.ts` as protected files

  **WHY Each Reference Matters**:
  - AGENTS.md tells you which test files are known-broken but intentionally preserved — DO NOT delete those

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 22 target files deleted
    Tool: Bash
    Preconditions: All 22 files exist on disk
    Steps:
      1. Run: git rm tests/gateway/migration-agents-md.test.ts tests/gateway/admin-brain-preview.test.ts src/gateway/routes/__tests__/admin-archetypes-delete.test.ts tests/prisma/archetype-uniqueness.test.ts tests/workers/opencode-harness-delivery.test.ts tests/inngest/learned-rules-injection.test.ts tests/gateway/services/employee-dispatcher.test.ts tests/gateway/seed-guest-messaging.test.ts tests/inngest/lifecycle-worker-runtime.test.ts tests/workers/lib/approval-card-poster.test.ts src/gateway/services/__tests__/archetype-generator.test.ts tests/workers/opencode-harness-status-log.test.ts tests/gateway/gm04-classification-api.test.ts tests/worker-tools/slack/post-message-auto-env.test.ts tests/worker-tools/slack/post-message-thread-ts.test.ts tests/worker-tools/slack/post-message-conversation-ref.test.ts tests/worker-tools/slack/post-message-approval-gating.test.ts tests/worker-tools/slack/post-message-newline.test.ts tests/worker-tools/slack/post-message.test.ts tests/worker-tools/slack/post-guest-approval.test.ts tests/workers/lib/agents-md-resolver.test.ts tests/workers/lib/platform-procedures.test.ts
      2. For each of the 22 paths: run `[ ! -f "$path" ] && echo "DELETED: $path" || echo "STILL EXISTS: $path"`
      3. Assert: no output contains "STILL EXISTS"
    Expected Result: All 22 files are confirmed absent
    Failure Indicators: Any file still exists on disk
    Evidence: .sisyphus/evidence/task-1-files-deleted.txt

  Scenario: Protected files preserved
    Tool: Bash
    Preconditions: Protected files exist before deletion
    Steps:
      1. Run: [ -f "tests/workers/container-boot.test.ts" ] && echo "OK: container-boot" || echo "DELETED: container-boot — BUG"
      2. Run: [ -f "tests/gateway/inngest-serve.test.ts" ] && echo "OK: inngest-serve" || echo "DELETED: inngest-serve — BUG"
      3. Run: [ -f "tests/scripts/trigger-task.test.ts" ] && echo "OK: trigger-task" || echo "DELETED: trigger-task — BUG"
      4. Run: [ -f "tests/setup.test.ts" ] && echo "OK: setup" || echo "DELETED: setup — BUG"
      5. Assert: all output lines start with "OK:"
    Expected Result: All 4 protected files confirmed present
    Failure Indicators: Any output contains "DELETED" or "BUG"
    Evidence: .sisyphus/evidence/task-1-protected-files.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-files-deleted.txt — output of file absence checks
  - [ ] task-1-protected-files.txt — output of protected file presence checks

  **Commit**: YES
  - Message: `test: delete 22 failing test files (nuclear cleanup)`
  - Files: all 22 deleted test files
  - Pre-commit: none (we're deleting, not modifying code)

---

- [x] 2. Run test suite and verify zero failures

  **What to do**:
  - Run `pnpm test -- --run` in a tmux session with log capture
  - Wait for completion (should take ~100s based on previous run)
  - Parse summary line: confirm 0 in "failed" column for both "Test Files" and "Tests"
  - Capture the new baseline numbers (passing count, skip count, total count)
  - Kill tmux session after completion

  **Must NOT do**:
  - DO NOT modify any test files to make them pass
  - DO NOT change vitest.config.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running a test command and parsing output — no code changes
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `vitest.config.ts` — test configuration (pool=forks, singleFork, timeout=30000)

  **WHY Each Reference Matters**:
  - Tells the agent the test timeout is 30s and pool config, so they know what "normal" looks like

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Zero test failures after deletion
    Tool: Bash (tmux)
    Preconditions: All 22 failing files deleted (Task 1 complete)
    Steps:
      1. Kill any existing ai-test tmux session
      2. Run: tmux new-session -d -s ai-test -x 220 -y 50
      3. Run: tmux send-keys -t ai-test "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm test -- --run 2>&1 | tee /tmp/ai-test-post-nuke.log; echo 'EXIT_CODE:'$? >> /tmp/ai-test-post-nuke.log" Enter
      4. Poll every 30s: grep "EXIT_CODE:" /tmp/ai-test-post-nuke.log
      5. Once done, extract: grep "Test Files" /tmp/ai-test-post-nuke.log
      6. Assert: output does NOT contain the word "failed"
      7. Extract: grep "^ *Tests " /tmp/ai-test-post-nuke.log
      8. Assert: output does NOT contain the word "failed"
      9. Kill tmux session: tmux kill-session -t ai-test
    Expected Result: "Test Files  N passed | 1 skipped (M)" and "Tests  N passed | K skipped (M)" — no "failed" token
    Failure Indicators: Any line contains "failed" or EXIT_CODE is non-zero
    Evidence: .sisyphus/evidence/task-2-test-results.txt (copy of summary lines)

  Scenario: Test suite exits cleanly
    Tool: Bash
    Preconditions: Test run completed
    Steps:
      1. Run: grep "EXIT_CODE:" /tmp/ai-test-post-nuke.log
      2. Assert: exit code is 0
    Expected Result: EXIT_CODE:0
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-2-exit-code.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-test-results.txt — summary lines from test output
  - [ ] task-2-exit-code.txt — exit code confirmation

  **Commit**: NO (no files changed)

---

- [x] 3. Clean up AGENTS.md and README.md test references

  **What to do**:
  - Remove the hardcoded test count from AGENTS.md entirely — the line that says "expects 1490 passing, 27 skipped, 0 failures" should be removed or replaced with a generic "All tests should pass with 0 failures" (no specific counts). Hardcoded counts go stale every time tests are added or removed.
  - Update AGENTS.md § "Pre-existing Test Failures" section:
    - Remove the stale `inngest-serve.test.ts` entry (it passes now — 1 skip is intentional, not a failure)
    - Keep the `container-boot.test.ts` entry (still valid — skips when Docker unavailable)
  - Remove any hardcoded test counts from README.md as well — keep the expectation as "0 failures" without pinning exact passing/skip numbers
  - Search both files for any other hardcoded test counts (grep for patterns like "NNNN passing", "NN skipped") and remove those too

  **Must NOT do**:
  - DO NOT modify any test files
  - DO NOT change test configuration
  - DO NOT replace old hardcoded counts with new hardcoded counts — remove them entirely

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple markdown edits to AGENTS.md
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES (no dependency on Task 2 baseline numbers — we're removing counts, not updating them)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Final verification
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Pre-existing Test Failures" — current section to update
  - `AGENTS.md` § "Commands" table — mentions `pnpm test -- --run`
  - `README.md` § "Testing" — mentions expected test results

  **WHY Each Reference Matters**:
  - These are the exact locations in docs that reference test counts and need cleaning

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No hardcoded test counts remain in AGENTS.md
    Tool: Bash
    Preconditions: AGENTS.md edited
    Steps:
      1. Run: grep -n "1490" AGENTS.md
      2. Assert: no results (old count removed)
      3. Run: grep -nE "[0-9]+ passing" AGENTS.md
      4. Assert: no results (no hardcoded passing counts)
      5. Assert: "inngest-serve.test.ts" entry removed from pre-existing failures
      6. Assert: "container-boot.test.ts" entry still present
    Expected Result: Zero hardcoded test counts, stale entries cleaned
    Failure Indicators: Any hardcoded count still present
    Evidence: .sisyphus/evidence/task-3-no-hardcoded-counts.txt

  Scenario: No hardcoded test counts remain in README.md
    Tool: Bash
    Preconditions: README.md edited
    Steps:
      1. Run: grep -nE "[0-9]+ passing|[0-9]+ skipped|[0-9]+ failures" README.md
      2. Assert: no results with specific numbers (generic "0 failures" is OK)
    Expected Result: No pinned test counts in README
    Failure Indicators: Specific test counts found
    Evidence: .sisyphus/evidence/task-3-readme-counts.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-no-hardcoded-counts.txt — grep output confirming no hardcoded counts in AGENTS.md
  - [ ] task-3-readme-counts.txt — grep output confirming no hardcoded counts in README.md

  **Commit**: YES
  - Message: `docs: remove hardcoded test counts and stale pre-existing failure entries`
  - Files: `AGENTS.md`, `README.md` (if changed)
  - Pre-commit: none

---

- [x] 4. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ test-cleanup complete — 22 failing test files deleted, zero failures remaining. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final step)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (all 22 files deleted, zero failures, AGENTS.md updated). For each "Must NOT Have": verify protected files still exist, no source files modified. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run`. Verify zero failures. Check that no test file was accidentally modified instead of deleted. Verify git status shows only deletions and AGENTS.md/README.md edits.
      Output: `Tests [PASS/FAIL] | Git Status [CLEAN/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run full test suite. Verify exact counts match what Task 2 reported. Verify no new failures introduced. Check that `container-boot.test.ts` still skips and `inngest-serve.test.ts` still passes.
      Output: `Test Files [N passed/N skip] | Tests [N passed/N skip] | Protected [2/2 OK] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read the spec, read actual git diff. Verify 1:1 — only the 22 specified files were deleted, nothing extra. Check that AGENTS.md edits match the spec exactly. Flag any unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Order | Message                                                                     | Files                 | Pre-commit |
| ----- | --------------------------------------------------------------------------- | --------------------- | ---------- |
| 1     | `test: delete 22 failing test files (nuclear cleanup)`                      | 22 deleted test files | none       |
| 2     | `docs: remove hardcoded test counts and stale pre-existing failure entries` | AGENTS.md, README.md  | none       |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run  # Expected: 0 failed files, 0 failed tests
[ ! -f "tests/gateway/migration-agents-md.test.ts" ]  # Expected: true (file gone)
[ -f "tests/workers/container-boot.test.ts" ]  # Expected: true (file preserved)
[ -f "tests/gateway/inngest-serve.test.ts" ]  # Expected: true (file preserved)
grep -E "[0-9]+ passing" AGENTS.md  # Expected: no output (no hardcoded counts)
```

### Final Checklist

- [ ] All "Must Have" present — 22 files deleted, zero failures, hardcoded counts removed
- [ ] All "Must NOT Have" absent — no protected files deleted, no source files touched
- [ ] All tests pass (0 failures)
