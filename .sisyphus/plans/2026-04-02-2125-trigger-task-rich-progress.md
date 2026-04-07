# Trigger-Task Rich Progress Monitoring

## TL;DR

> **Quick Summary**: Replace the dots-only monitoring in `trigger-task` with DB-driven granular progress — execution stages, individual validation results (with error output on failure), and PR URL the moment it appears.
>
> **Deliverables**:
>
> - Enriched `scripts/trigger-task.ts` with stage/validation/deliverable progress
> - Unit tests for all new helper functions and state-tracking logic
> - E2E verification capturing real output
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 → T2 → T3 → F1–F4

---

## Context

### Original Request

User wants to see what's happening inside the "Executing" phase instead of just dots. When a task stalls, they want to know whether it's stuck at code generation, typescript validation, or unit tests — for debugging, not just cosmetics.

### Interview Summary

**Key Discussions**:

- User proposed LLM-based OpenCode session summarization — decided to start with DB-driven approach (90% solution)
- User confirmed debugging visibility is the core motivation
- Existing DB has all needed data: `executions.current_stage`, `validation_runs`, `deliverables`

**Research Findings**:

- `current_stage` values: `starting` → `executing` → `validating` → `completing` → `done` (+ `error`)
- Validation stages: `typescript` | `lint` | `unit` | `integration` | `e2e`
- Validation status: `passed` | `failed`
- `validation_runs` has `error_output` field — valuable for debugging failures
- Scripts use raw `psql` CLI via `psqlQuery()` helper — no PostgREST
- `getPrUrl()` already exists (line 269) — reuse it, don't duplicate

### Metis Review

**Identified Gaps (addressed)**:

- Must use `ORDER BY created_at DESC LIMIT 1` for executions (multiple rows possible on retry)
- Must use composite key `${stage}-${iteration}` for printedValidations (same stage can repeat in fix loop)
- Must handle NULL `current_stage` gracefully (don't print `Executing › null`)
- Must wrap new queries in try/catch — failures must not abort the poll loop
- `getPrUrl()` already exists — reuse it for early PR URL display
- Metis recommended showing truncated `error_output` on validation failures — included

---

## Work Objectives

### Core Objective

Show granular, real-time progress in `trigger-task` by polling 3 additional DB tables alongside `tasks.status`.

### Target Output

```
── Monitoring ──
→ Polling every 30s until task completes
→ Task ID: 2eeb0487-...

  Useful commands while waiting:
    docker logs -f ai-worker-2eeb0487    # Worker container logs
    open http://localhost:8288            # Inngest dashboard

  [0s]     Ready
  [12s]    Executing › starting
  [30s]    Executing › executing
  [1m 0s]  Executing › validating
  [1m 2s]    ✓ typescript passed
  [1m 35s]    ✓ lint passed
  [3m 10s]    ✓ unit passed
  [3m 30s]  Submitting
  [4m 0s]    → PR: https://github.com/...
  [4m 15s]  Done

── Result ──
✓ Task completed (4m 15s)
✓ Pull Request (https://github.com/.../pull/14)
```

On validation failure:

```
  [1m 35s]    ✗ unit failed
  [1m 35s]      Error: Expected 2 but received 3...
  [1m 40s]  Executing › executing (fix attempt 1)
```

### Concrete Deliverables

- `scripts/trigger-task.ts` — 3 new helper functions + enriched poll loop
- `tests/scripts/trigger-task.test.ts` — new test file with unit tests for helpers + state tracking

### Definition of Done

- [ ] `pnpm build` → exit 0
- [ ] `pnpm test -- --run tests/scripts/trigger-task.test.ts` → all pass
- [ ] E2E: `pnpm trigger-task` output contains `Executing ›` and `✓` lines
- [ ] No regressions in existing behavior (Ready, Done, Error, Cancelled output unchanged)

### Must Have

- `getExecutionProgress(taskId)` → `{ currentStage, fixIterations }` or null
- `getValidationRuns(taskId)` → `{ stage, status, iteration, errorOutput }[]`
- State tracking: `lastStage`, `printedValidations` Set (keyed by `${stage}-${iteration}`), `prUrlPrinted` flag
- Stage line: `Executing › {stage}` printed when `currentStage` changes
- Validation line: `✓ {stage} passed` or `✗ {stage} failed` — printed exactly once per stage-iteration
- Truncated `error_output` on failure (first 200 chars, for debugging)
- PR URL line: `→ PR: {url}` printed as soon as deliverable appears (before Done)
- Fix iteration display: `Executing › executing (fix attempt N)` when `fixIterations > 0`
- All new queries wrapped in try/catch — failures must not abort the poll loop
- Null/empty results handled gracefully (no crashes, no `null` in output)

### Must NOT Have (Guardrails)

- **Do NOT modify `verify-e2e.ts`** — separate script, separate concern
- **Do NOT modify worker, gateway, inngest, or any source code** — only `scripts/trigger-task.ts` and its test
- **Do NOT add DB migrations or schema changes**
- **Do NOT change existing output format** for Ready, Submitting, Done, Error, Cancelled status lines
- **Do NOT replace `getPrUrl()`** — reuse it or call it earlier
- **Do NOT use PostgREST or Prisma** — use existing `psqlQuery()` helper only
- **Do NOT change the 30s poll interval**

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: YES (TDD)
- **Framework**: vitest, mock `psqlQuery()` — no real DB calls in unit tests

### QA Policy

- Unit tests: mock `psqlQuery()`, test helpers + state tracking in isolation
- E2E: run actual `trigger-task`, capture output to file, grep for expected lines
- Evidence saved to `.sisyphus/evidence/`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — implementation + unit tests):
├── Task 1: Add helper functions + state tracking + poll loop enrichment [deep]
├── Task 2: Add unit tests for helpers and state-tracking logic [quick]

Wave 2 (After Wave 1 — E2E verification):
└── Task 3: E2E test — run trigger-task, verify output [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T2 → T3 → F1-F4
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | T2, T3 | 1    |
| T2   | T1         | T3     | 1    |
| T3   | T1, T2     | F1–F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `deep`, T2 → `quick`
- **Wave 2**: **1** — T3 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add helper functions, state tracking, and enriched poll loop

  **What to do**:
  Add 3 helper functions to `scripts/trigger-task.ts` and modify the polling loop to use them.

  **Step 1: Add `getExecutionProgress(taskId)` helper** (after `getTaskStatus`, before `getPrUrl`):

  ```typescript
  async function getExecutionProgress(
    taskId: string,
  ): Promise<{ currentStage: string; fixIterations: number } | null> {
    const sql = `SELECT current_stage, fix_iterations FROM executions WHERE task_id = '${taskId}' ORDER BY created_at DESC LIMIT 1`;
    const row = await psqlQuery(sql).catch(() => '');
    if (!row) return null;
    const [stage, iterations] = row.split('|');
    const currentStage = (stage ?? '').trim();
    if (!currentStage) return null;
    return {
      currentStage,
      fixIterations: parseInt(iterations ?? '0', 10),
    };
  }
  ```

  **Step 2: Add `getValidationRuns(taskId)` helper**:

  ```typescript
  async function getValidationRuns(
    taskId: string,
  ): Promise<Array<{ stage: string; status: string; iteration: number; errorOutput: string }>> {
    const sql = `SELECT vr.stage, vr.status, vr.iteration, COALESCE(LEFT(vr.error_output, 200), '') FROM validation_runs vr JOIN executions e ON vr.execution_id = e.id WHERE e.task_id = '${taskId}' ORDER BY vr.created_at ASC`;
    const raw = await psqlQuery(sql).catch(() => '');
    if (!raw) return [];
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [stage, status, iteration, errorOutput] = line.split('|');
        return {
          stage: (stage ?? '').trim(),
          status: (status ?? '').trim(),
          iteration: parseInt(iteration ?? '0', 10),
          errorOutput: (errorOutput ?? '').trim(),
        };
      });
  }
  ```

  **Step 3: Add state-tracking variables** (after `let lastPrintedStatus = '';`):

  ```typescript
  let lastStage = '';
  const printedValidations = new Set<string>();
  let prUrlPrinted = false;
  ```

  **Step 4: Modify the poll loop body** — after the existing status change detection block and BEFORE the terminal state checks, add a new section that:

  a. Calls `getExecutionProgress(taskId)` — if `currentStage` changed from `lastStage`, print:
  `  ${C.dim}[${elapsed}]${C.reset}  ${C.bold}Executing${C.reset} ${C.dim}› ${stage}${C.reset}`
  If `fixIterations > 0` and stage is `executing`, append ` (fix attempt ${fixIterations})`
  Update `lastStage = currentStage`
  Skip printing the dots when a stage is printed.

  b. Calls `getValidationRuns(taskId)` — for each run, compute key `${stage}-${iteration}`, if NOT in `printedValidations`:
  - If status is `'passed'`: print `  ${C.dim}[${elapsed}]${C.reset}    ${C.green}✓${C.reset} ${stage} passed`
  - If status is `'failed'`: print `  ${C.dim}[${elapsed}]${C.reset}    ${C.red}✗${C.reset} ${stage} failed`
    If `errorOutput` is non-empty, print: `  ${C.dim}[${elapsed}]${C.reset}      ${C.dim}${errorOutput}${C.reset}`
    Add key to `printedValidations`

  c. Calls `getPrUrl(taskId)` — if non-null and `!prUrlPrinted`:
  Print: `  ${C.dim}[${elapsed}]${C.reset}    ${C.cyan}→${C.reset} PR: ${prUrl}`
  Set `prUrlPrinted = true`

  d. Replace the `else { process.stdout.write('.'); }` block — only print a dot if NO new information was printed in this cycle (no stage change, no new validations, no PR URL).

  **Must NOT do**:
  - Do NOT touch `startPolling()` or any other function outside the poll loop
  - Do NOT change how terminal states (Done/Error/Cancelled) are handled
  - Do NOT change the 30s poll interval
  - Do NOT remove existing `getPrUrl()` — reuse it as-is for both inline and final output

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex state tracking logic with edge cases, must preserve existing behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (T2 depends on exact helper signatures)
  - **Parallel Group**: Wave 1 (sequential with T2)
  - **Blocks**: T2, T3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/trigger-task.ts:252-263` — `getTaskStatus()` helper pattern to follow
  - `scripts/trigger-task.ts:269-273` — existing `getPrUrl()` — reuse as-is
  - `scripts/trigger-task.ts:213-221` — `psqlQuery()` helper — all queries must use this
  - `scripts/trigger-task.ts:504-540` — current poll loop to modify

  **API/Type References**:
  - `executions.current_stage` values: `'starting'` | `'executing'` | `'validating'` | `'completing'` | `'done'` | `'error'`
  - `validation_runs.stage` values: `'typescript'` | `'lint'` | `'unit'` | `'integration'` | `'e2e'`
  - `validation_runs.status` values: `'passed'` | `'failed'`
  - `executions.fix_iterations`: integer (0 = first attempt)

  **WHY Each Reference Matters**:
  - `getTaskStatus()` is the exact pattern for new helpers — same psqlQuery, same null handling, same catch
  - The stage values are confirmed from source code — use them exactly as-is in the output

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build passes with new helpers
    Tool: Bash
    Steps:
      1. pnpm build → exit 0
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: New helpers exist
    Tool: Bash
    Steps:
      1. grep -c "getExecutionProgress" scripts/trigger-task.ts → expect >= 2 (def + usage)
      2. grep -c "getValidationRuns" scripts/trigger-task.ts → expect >= 2 (def + usage)
      3. grep -c "printedValidations" scripts/trigger-task.ts → expect >= 2
    Expected Result: All present
    Evidence: .sisyphus/evidence/task-1-helpers-present.txt
  ```

  **Commit**: YES
  - Message: `feat(scripts): add rich progress monitoring to trigger-task`
  - Files: `scripts/trigger-task.ts`
  - Pre-commit: `pnpm build` → exit 0

- [x] 2. Add unit tests for helpers and state-tracking logic

  **What to do**:
  Create `tests/scripts/trigger-task.test.ts` with unit tests. Mock `psqlQuery()` to avoid real DB calls.

  **Tests to write**:

  Test group 1: `getExecutionProgress()`:
  - Returns `{ currentStage: 'executing', fixIterations: 0 }` on valid row
  - Returns null when psqlQuery returns empty string
  - Returns null when current_stage is empty/null
  - Returns `fixIterations: 2` when the field is present
  - Catches query errors and returns null (no crash)

  Test group 2: `getValidationRuns()`:
  - Returns empty array when no rows
  - Parses single row: `{ stage: 'typescript', status: 'passed', iteration: 0, errorOutput: '' }`
  - Parses multiple rows in order
  - Truncates errorOutput at 200 chars (handled by SQL LEFT())
  - Catches query errors and returns empty array (no crash)

  Test group 3: State tracking (integration-level):
  - Given poll sequence: stage `starting` → `executing` → `validating`, assert 3 stage lines printed
  - Given 3 validation results, assert each printed exactly once across 2 poll cycles
  - Given same validation results on 2nd poll, assert no duplicates
  - Given `fixIterations > 0`, assert "(fix attempt N)" shown

  **Important**: These helper functions are defined inside `main()` or at module level in trigger-task.ts. For testability, you may need to either:
  - Export the helpers (add `export` keyword)
  - OR test them indirectly via the main function with mocked DB

  Read the file structure first to decide the best approach.

  **Must NOT do**:
  - Do NOT use real database connections in tests
  - Do NOT modify `scripts/trigger-task.ts` beyond making helpers testable (e.g., export)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Writing test file based on established helper signatures
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after T1)
  - **Blocks**: T3
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `tests/workers/lib/session-manager.test.ts` — mock patterns, vi.mock usage
  - `scripts/trigger-task.ts` — the helpers from T1 to test

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/scripts/trigger-task.test.ts → all pass
    Expected Result: 10+ tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-2-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `test(scripts): add unit tests for trigger-task progress helpers`
  - Files: `tests/scripts/trigger-task.test.ts`, possibly `scripts/trigger-task.ts` (export tweaks)
  - Pre-commit: `pnpm test -- --run tests/scripts/trigger-task.test.ts` → PASS

- [x] 3. E2E verification — run trigger-task, verify output

  **What to do**:
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Cancel any stuck Executing tasks: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "UPDATE tasks SET status='Cancelled' WHERE status='Executing';"`
  - Launch `pnpm trigger-task` in background with a unique key, capture to file
  - Poll until task reaches Done (check DB directly every 15s)
  - Read captured output file and verify:
    - At least 1 `Executing ›` line appears (stage transition)
    - At least 1 `✓` line appears (validation result)
    - `PR:` line appears before `Done` (early PR URL display)
    - `Done` line appears with PR URL in Result section
  - Write evidence

  **Must NOT do**:
  - Do NOT skip the Docker rebuild (scripts run locally but worker changes may affect DB writes)
  - Do NOT use a task key that was used before

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run commands, capture output, verify patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T1, T2)
  - **Blocks**: F1–F4
  - **Blocked By**: T1, T2

  **References**:
  - `test-payloads/jira-realistic-task-103.json` — simple payload for fast completion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: E2E output contains rich progress
    Tool: Bash
    Preconditions: All services running, Docker image rebuilt
    Steps:
      1. Launch trigger-task in background, capture to /tmp/trigger-e2e.txt
      2. Wait for task to reach Done (poll DB every 15s)
      3. grep -c "Executing ›" /tmp/trigger-e2e.txt → expect >= 1
      4. grep -c "✓" /tmp/trigger-e2e.txt → expect >= 1
      5. grep -c "PR:" /tmp/trigger-e2e.txt → expect >= 1
    Expected Result: All 3 patterns found
    Evidence: .sisyphus/evidence/task-3-e2e-output.txt (copy of /tmp/trigger-e2e.txt)

  Scenario: No regressions
    Tool: Bash
    Steps:
      1. pnpm build → exit 0
      2. pnpm test -- --run tests/scripts/trigger-task.test.ts → all pass
    Expected Result: Build and tests clean
    Evidence: .sisyphus/evidence/task-3-no-regressions.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Verify all Must Have items present, all Must NOT Have items absent. Run grep checks on trigger-task.ts for helper functions, state tracking, error output handling.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run tests/scripts/trigger-task.test.ts`. Read the poll loop code for: try/catch on all new queries, null handling, no `as any`, no `console.log` in prod code. Verify state tracking uses composite key `${stage}-${iteration}`.
      Output: `Build [PASS/FAIL] | Tests [N pass] | Code [N clean] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Read E2E output capture from T3. Verify output contains stage transitions, validation results, and PR URL. Check formatting is clean and consistent.
      Output: `E2E Output [N lines verified] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Run `git diff --stat` from before T1. Verify ONLY `scripts/trigger-task.ts` and `tests/scripts/trigger-task.test.ts` changed. No worker, gateway, inngest, or verify-e2e changes.
      Output: `Files [N expected] | Scope [CLEAN/N violations] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                           | Files                                                                    |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1      | `feat(scripts): add rich progress monitoring to trigger-task`     | `scripts/trigger-task.ts`                                                |
| 2      | `test(scripts): add unit tests for trigger-task progress helpers` | `tests/scripts/trigger-task.test.ts`, possibly `scripts/trigger-task.ts` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                                                    # exit 0
pnpm test -- --run tests/scripts/trigger-task.test.ts          # all pass
grep -c "getExecutionProgress" scripts/trigger-task.ts         # >= 2
grep -c "getValidationRuns" scripts/trigger-task.ts            # >= 2
grep -c "printedValidations" scripts/trigger-task.ts           # >= 2
grep -c "error_output\|errorOutput" scripts/trigger-task.ts    # >= 1
git diff --stat HEAD~2..HEAD -- src/ prisma/ docker/            # empty (no source changes)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build passes
- [ ] Unit tests pass
- [ ] E2E output shows stage, validation, and PR URL lines
