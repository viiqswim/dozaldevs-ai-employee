# Inngest Dev Server Step Output Contamination — Diagnosis, Logging & Hardening

## TL;DR

> **Quick Summary**: The Inngest Dev Server (v1.19.4) shows cross-run step output contamination — every run of `employee/universal-lifecycle` shares deterministic step IDs, and the Dev Server's output storage/cache doesn't scope by run ID. The upgrade alone does NOT fix it (confirmed via changelog analysis). This plan adds structured lifecycle logging for independent verification, pins the CLI version, and documents the known issue with workaround.
>
> **Deliverables**:
>
> - Diagnostic confirmation: restart-clears-contamination test
> - CLI version pin in `scripts/dev.ts` (v1.19.4 → pinned v1.21.0)
> - Structured `runId`-enriched logging at key lifecycle transitions
> - AGENTS.md Known Issues entry with workaround
> - Cross-contamination regression verification
>
> **Estimated Effort**: Short (2-3 hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (diagnostic) → Task 2+3+4 (parallel) → Task 5+6 (parallel) → Task 7 (verification) → Task 8 (notify)

---

## Context

### Original Request

User triggered `real-estate-motivation-bot` via the dashboard and observed that ALL step outputs in the Inngest Dev Server UI showed data from a completely different employee (guest-messaging, task `83324a8c` from ~26 hours earlier). Deep investigation confirmed the function executed correctly (6 independent sources), but stored/displayed step outputs are cross-contaminated.

### Investigation Summary

**Key Discussions**:

- Root cause: Step IDs are `sha1(stepName)` — all 31 steps in the lifecycle produce the same hash across every run. The Dev Server output storage references use zero UUIDs and empty trace IDs (`tid: ""`), causing cross-run contamination.
- 6 sources confirm correct execution (event payload, DB task, DB archetype, Slack message, lifecycle path, no pre-check step) vs 2 sources show wrong data (Inngest UI, Inngest GraphQL stored outputs).
- User selected "Plan a full fix" path.

**Research Findings**:

- Inngest CLI v1.21.0 changelog: **zero fixes** for step output storage, run isolation, or memoization
- Storage layer uses `{prefix:runID}:actions:{fnID}:{runID}` in production Redis — correctly isolated. The contamination is Dev Server UI/cache specific.
- `inngest-cli@latest` in `scripts/dev.ts` line 527 is unpinned — every developer may run a different version
- All 31 steps use static string literals — `taskId` and `runId` are available at line 132-133 but not logged at step boundaries
- `waitForEvent` calls use `match: 'data.taskId'` — correctly correlated, unaffected

### Metis Review

**Identified Gaps** (addressed):

- Missing diagnostic: restart-clears-contamination test → Added as Task 1
- Upgrade framing wrong: was "the fix", now correctly framed as hygiene → Reframed
- No CLI version pin → Added explicit pin task
- Missing structured log field specification → Specified: `taskId`, `runId`, `step`, component `employee-lifecycle`
- No approval flow regression test → Added as part of final verification
- No "before" baseline capture → Added to diagnostic task

---

## Work Objectives

### Core Objective

Establish reliable, independent verification of lifecycle step outputs (via gateway logs) so developers never depend solely on the Inngest Dev Server UI for debugging — and document the known contamination bug with its workaround.

### Concrete Deliverables

- `scripts/dev.ts`: CLI pinned to `inngest-cli@1.21.0`
- `src/inngest/employee-lifecycle.ts`: structured logging at key step transitions
- `AGENTS.md`: Known Issues entry §3 with symptom, root cause, workaround, ground-truth sources
- `.sisyphus/evidence/`: diagnostic and verification artifacts

### Definition of Done

- [ ] `scripts/dev.ts` line 527 reads `'inngest-cli@1.21.0'` (not `@latest`)
- [ ] `curl -s http://localhost:8288/dev | jq '.version'` returns `1.21.0` after restart
- [ ] Gateway logs contain `runId` in structured JSON for lifecycle step transitions
- [ ] AGENTS.md Known Issues §3 documents the contamination bug with workaround
- [ ] Two-employee trigger test shows correct data in gateway logs despite UI contamination
- [ ] All existing tests pass (`pnpm test -- --run`)

### Must Have

- Diagnostic test to confirm restart-clears-contamination behavior
- CLI version pin for deterministic builds
- Structured logging with `runId` at key lifecycle transitions (minimum: `load-task`, `triaging`, `executing`, `poll-completion`, `validating`, `submitting`, `handle-approval-result`)
- AGENTS.md documentation with workaround (restart Dev Server, use DB + gateway logs)

### Must NOT Have (Guardrails)

- **DO NOT** change any step name strings (memoization risk for in-flight runs)
- **DO NOT** add `await` or async operations inside existing steps (logging must be synchronous `log.info()` only)
- **DO NOT** upgrade the `inngest` npm SDK package (`^4.1.0` stays)
- **DO NOT** touch `inngest-serve.test.ts` (pre-existing known failure)
- **DO NOT** frame the CLI upgrade as "the fix" for contamination — it is hygiene only
- **DO NOT** add a new admin endpoint or API for step output comparison
- **DO NOT** refactor the logger module or change existing log patterns
- **DO NOT** add `taskId` prefix to step names
- **DO NOT** trigger `guest-messaging`, `code-rotation`, or `daily-summarizer` employees during verification — use `real-estate-motivation-bot` only (DozalDevs tenant)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (`pnpm test` runs Vitest)
- **Automated tests**: NO — this is infrastructure + Dev Server behavior, not unit-testable
- **Framework**: Vitest exists but not applicable to this work

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Infrastructure**: Use Bash (curl, psql, grep) — query APIs, check logs, verify versions
- **Code changes**: Use Bash (`pnpm test -- --run`) — ensure no regressions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — diagnostic + foundation):
├── Task 1: Diagnostic — restart Dev Server, verify contamination behavior [deep]
├── Task 2: Pin CLI version in scripts/dev.ts [quick]
├── Task 3: Add structured lifecycle logging [unspecified-high]
└── Task 4: Document Known Issue in AGENTS.md [quick]

Note: Task 1 runs first (diagnostic informs framing). Tasks 2-4 can run in parallel after Task 1.

Wave 2 (After Wave 1 — verification):
├── Task 5: Cross-contamination regression test [unspecified-high]
├── Task 6: Existing test suite verification [quick]
└── Task 7: Notify completion [quick]

Critical Path: Task 1 → Tasks 2+3+4 → Task 5 → Task 7
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Tasks 2, 3, 4)
```

### Dependency Matrix

| Task | Depends On | Blocks     | Wave |
| ---- | ---------- | ---------- | ---- |
| 1    | —          | 2, 3, 4, 5 | 1    |
| 2    | 1          | 5          | 1    |
| 3    | 1          | 5          | 1    |
| 4    | 1          | 7          | 1    |
| 5    | 2, 3       | 7          | 2    |
| 6    | 3          | 7          | 2    |
| 7    | 4, 5, 6    | —          | 2    |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `deep`, T2 → `quick`, T3 → `unspecified-high`, T4 → `quick`
- **Wave 2**: 3 tasks — T5 → `unspecified-high`, T6 → `quick`, T7 → `quick`

---

## TODOs

- [x] 1. Diagnostic — Restart Dev Server and Verify Contamination Behavior

  **What to do**:
  - Capture a "before" baseline: query the Inngest GraphQL API for the most recent completed run's `load-task` step output. Save the raw JSON response to `.sisyphus/evidence/task-1-before-baseline.json`.
  - Kill the current `pnpm dev` process (or the Inngest Dev Server subprocess specifically).
  - Restart `pnpm dev` (or just the Inngest Dev Server: `npx inngest-cli@latest dev -u http://localhost:7700/api/inngest --port 8288`).
  - Wait for the Dev Server to be healthy: `curl -s http://localhost:8288/dev | jq '.version'`
  - Trigger `real-estate-motivation-bot` via the admin API:
    ```bash
    TENANT=00000000-0000-0000-0000-000000000002
    curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/$TENANT/employees/real-estate-motivation-bot/trigger" \
      -H "Content-Type: application/json" -d '{}'
    ```
  - Wait for task to reach `Done` status (poll via admin API every 5s, timeout 120s).
  - Query the Inngest GraphQL API for the new run's step outputs. Specifically fetch `load-task` output via `runTraceSpanOutputByID`.
  - Compare: does `load-task` output contain the correct `archetypeId` (motivation-bot `e4dd9e63`) or stale data?
  - Document findings: "Restart clears contamination: YES/NO" and "Contamination classification: UI cache / deeper storage bug"
  - Save the "after" GraphQL response to `.sisyphus/evidence/task-1-after-restart.json`

  **Must NOT do**:
  - Do NOT trigger guest-messaging, code-rotation, or daily-summarizer
  - Do NOT modify any source code in this task

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful diagnostic methodology — must capture before/after evidence, control the restart, and classify the root cause correctly. Autonomous problem-solving with thorough research.
  - **Skills**: []
    - No domain-specific skills needed — this is pure infrastructure investigation
  - **Skills Evaluated but Omitted**:
    - `debugging-lifecycle`: Domain is lifecycle states, not Dev Server UI behavior

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — must complete first
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None (starts immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `scripts/dev.ts:520-535` — How the Inngest Dev Server is started (spawn process, args, port)

  **API/Type References**:
  - Inngest GraphQL endpoint: `http://localhost:8288/v0/gql`
  - Query for runs: `{ runs(first:3,filter:{status:[COMPLETED]}) { edges { node { id status } } } }`
  - Query for trace tree: `{ runTrace(runID: "<ID>") { name stepID outputID childrenSpans { name stepID outputID } } }`
  - Query for stored output: `{ runTraceSpanOutputByID(outputID: "<base64>") { data } }`
  - Admin trigger: `POST /admin/tenants/:tenantId/employees/real-estate-motivation-bot/trigger`
  - Admin task status: `GET /admin/tenants/:tenantId/tasks/:id`

  **External References**:
  - Inngest Dev Server API: `http://localhost:8288/dev` — returns version info

  **WHY Each Reference Matters**:
  - `scripts/dev.ts` — Understand how to restart just the Inngest process vs full `pnpm dev`
  - GraphQL queries — These are the exact queries that revealed the contamination; reuse them for before/after comparison
  - Admin API — Trigger the employee and poll task status without touching production employees

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Capture before-baseline of contaminated state
    Tool: Bash (curl)
    Preconditions: Dev Server is running at localhost:8288
    Steps:
      1. curl -s http://localhost:8288/v0/gql -X POST -H "Content-Type: application/json" -d '{"query":"{ runs(first:1,filter:{status:[COMPLETED]}) { edges { node { id } } } }"}' | jq -r '.data.runs.edges[0].node.id'
      2. Using that runID, fetch the trace tree and find `load-task` outputID
      3. Fetch the actual stored output via runTraceSpanOutputByID
      4. Save to .sisyphus/evidence/task-1-before-baseline.json
    Expected Result: JSON file saved containing the stored output (likely showing stale guest-messaging data)
    Failure Indicators: GraphQL returns null or empty, no completed runs exist
    Evidence: .sisyphus/evidence/task-1-before-baseline.json

  Scenario: Restart and trigger — verify contamination behavior
    Tool: Bash (curl, process management)
    Preconditions: Before-baseline captured
    Steps:
      1. Kill the Inngest Dev Server process
      2. Restart it: npx inngest-cli@latest dev -u http://localhost:7700/api/inngest --port 8288
      3. Wait for health: curl -s http://localhost:8288/dev returns valid JSON
      4. Trigger motivation-bot: curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/real-estate-motivation-bot/trigger" -H "Content-Type: application/json" -d '{}'
      5. Poll task status until Done (timeout 120s)
      6. Query new run's load-task output via GraphQL
      7. Save to .sisyphus/evidence/task-1-after-restart.json
    Expected Result: After restart, load-task output contains motivation-bot data (archetypeId e4dd9e63), confirming restart clears UI cache
    Failure Indicators: Output still shows guest-messaging data after restart
    Evidence: .sisyphus/evidence/task-1-after-restart.json
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-before-baseline.json` — contaminated state
  - [ ] `.sisyphus/evidence/task-1-after-restart.json` — post-restart state
  - [ ] `.sisyphus/evidence/task-1-diagnostic-summary.md` — classification and findings

  **Commit**: NO (diagnostic only, no code changes)

- [x] 2. Pin Inngest CLI Version in scripts/dev.ts

  **What to do**:
  - Open `scripts/dev.ts` line 527
  - Change `'inngest-cli@latest'` to `'inngest-cli@1.21.0'`
  - This is a single-line change. Nothing else in the file changes.

  **Must NOT do**:
  - Do NOT change any other arguments to the spawn call
  - Do NOT modify the port, URL, or stdio configuration
  - Do NOT upgrade the `inngest` npm SDK package

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line change in a known file at a known line number
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — trivial change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 4) — after Task 1
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `scripts/dev.ts:527` — Current line: `'inngest-cli@latest'` — change to `'inngest-cli@1.21.0'`

  **WHY Each Reference Matters**:
  - Exact line and exact old/new value — executor needs nothing else

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CLI version pinned in source
    Tool: Bash (grep)
    Preconditions: Edit applied
    Steps:
      1. grep "inngest-cli@1.21.0" scripts/dev.ts
      2. grep "inngest-cli@latest" scripts/dev.ts (should return empty)
    Expected Result: First grep matches line 527. Second grep returns no matches.
    Failure Indicators: First grep has no matches, or second grep still finds @latest
    Evidence: .sisyphus/evidence/task-2-cli-pin-verified.txt

  Scenario: No other changes in dev.ts
    Tool: Bash (git diff)
    Preconditions: Edit applied
    Steps:
      1. git diff scripts/dev.ts | head -30
    Expected Result: Only one line changed — `inngest-cli@latest` → `inngest-cli@1.21.0`
    Failure Indicators: More than 1 line changed, or unrelated changes appear
    Evidence: .sisyphus/evidence/task-2-diff.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-cli-pin-verified.txt`
  - [ ] `.sisyphus/evidence/task-2-diff.txt`

  **Commit**: YES (groups with Task 3)
  - Message: `fix(inngest): pin CLI version and add lifecycle step logging`
  - Files: `scripts/dev.ts`, `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Add Structured Lifecycle Logging with runId

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, add structured logging at key lifecycle step boundaries. The goal: every major step transition emits a log line with `taskId`, `runId`, and the step output summary, so developers can verify correct execution via gateway logs without depending on the Inngest UI.
  - Import the existing logger: `import { createLogger } from '../lib/logger.js';` (check if already imported)
  - Create a logger instance early in the function body (after line 133 where `taskId` and `runId` are destructured):
    ```typescript
    const log = createLogger('employee-lifecycle').child({ taskId, runId });
    ```
  - Add `log.info()` calls AFTER (not inside) the following `step.run()` calls. The logging goes OUTSIDE the step callback, using the return value. This is critical — logging inside `step.run()` would execute on every replay, but logging outside only executes once when the step completes.
  - Steps to log (minimum — add after each `step.run()` resolves):
    1. After `load-task` (line ~154): `log.info({ step: 'load-task', archetypeId: archetype.id, roleName: archetype.role_name, approvalRequired }, 'Step complete: load-task');`
    2. After `triaging` (line ~208): `log.info({ step: 'triaging' }, 'Step complete: triaging');`
    3. After `notify-received` (line ~209+): `log.info({ step: 'notify-received', channel: notifyMsgRef?.channel }, 'Step complete: notify-received');`
    4. After `executing` (line ~368+): `log.info({ step: 'executing', machineId }, 'Step complete: executing');`
    5. After `poll-completion` (line ~583+): `log.info({ step: 'poll-completion', finalStatus }, 'Step complete: poll-completion');`
    6. After `validating` (line ~723+): `log.info({ step: 'validating' }, 'Step complete: validating');`
    7. After `submitting` (line ~730+): `log.info({ step: 'submitting' }, 'Step complete: submitting');`
    8. After `handle-approval-result` (line ~1530+): `log.info({ step: 'handle-approval-result' }, 'Step complete: handle-approval-result');`
  - Also add a log at the very start of the function (after logger creation): `log.info({ archetypeId: event.data.archetypeId }, 'Lifecycle started');`
  - Also add a log at each terminal state: `mark-failed`, `mark-cancelled`, `complete`, `cleanup-no-approval`.

  **Must NOT do**:
  - Do NOT add logging INSIDE `step.run()` callbacks — these replay on every Inngest retry and would produce duplicate logs
  - Do NOT add `await` or any async operation — `log.info()` is synchronous
  - Do NOT change any step name strings
  - Do NOT modify step logic or return values
  - Do NOT refactor the logger module itself
  - Do NOT add logging to ALL 31 steps — only the key transitions listed above

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple surgical edits across a large file (2500+ lines) — needs precision to add logging OUTSIDE step callbacks at correct locations
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `debugging-lifecycle`: Covers lifecycle states but not logging patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4) — after Task 1
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 1

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/lib/logger.ts:10-28` — `createLogger(component)` returns pino logger with component binding, `.child()` for adding fields
  - `src/lib/logger.ts:35-37` — `taskLogger(component, taskId)` — existing pattern for task-scoped logging (but we need `runId` too, so use `createLogger().child({ taskId, runId })` instead)
  - `src/inngest/employee-lifecycle.ts:132-133` — Where `runId` and `taskId` are destructured from the function args/event
  - `src/inngest/employee-lifecycle.ts:146-154` — `load-task` step — log AFTER line 154 (after the step resolves), NOT inside the callback
  - `src/inngest/employee-lifecycle.ts:202-208` — `triaging` step
  - `src/inngest/employee-lifecycle.ts:209` — `notify-received` step
  - `src/inngest/employee-lifecycle.ts:368` — `executing` step
  - `src/inngest/employee-lifecycle.ts:583` — `poll-completion` step
  - `src/inngest/employee-lifecycle.ts:723` — `validating` step
  - `src/inngest/employee-lifecycle.ts:730` — `submitting` step
  - `src/inngest/employee-lifecycle.ts:1530` — `handle-approval-result` step

  **WHY Each Reference Matters**:
  - `logger.ts` — Shows the exact API for creating loggers. Use `createLogger('employee-lifecycle').child({ taskId, runId })` to get structured fields on every line.
  - Line 132-133 — Confirms `runId` is available from the Inngest function args. This is the key field for independent verification.
  - Each step reference — Exact location to insert `log.info()` AFTER the step resolves. Critical to place OUTSIDE `step.run()` to avoid replay duplication.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Logger import and instance creation
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. grep "createLogger" src/inngest/employee-lifecycle.ts | head -5
      2. grep "runId" src/inngest/employee-lifecycle.ts | grep "log\." | head -5
    Expected Result: createLogger imported and used. Log lines contain runId in structured fields.
    Failure Indicators: No import found, or log lines missing runId
    Evidence: .sisyphus/evidence/task-3-logger-grep.txt

  Scenario: Logging is OUTSIDE step callbacks, not inside
    Tool: Bash (ast-grep or manual inspection)
    Preconditions: Code changes applied
    Steps:
      1. Read the file around each step.run() call and verify log.info() appears AFTER the closing `);` of step.run(), not inside the callback
      2. Specifically check load-task (line ~154) — log should be after the `});` line, before the next code block
    Expected Result: All log.info() calls are outside step.run() callbacks
    Failure Indicators: log.info() appears inside an `async () => {` callback of step.run()
    Evidence: .sisyphus/evidence/task-3-log-placement.txt

  Scenario: No step name changes
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. git diff src/inngest/employee-lifecycle.ts | grep "^[-+].*step\.\(run\|waitForEvent\)" | head -20
    Expected Result: No lines with `-` prefix (no step.run() calls removed or modified). Only `+` lines are log.info() additions.
    Failure Indicators: Any step.run() or waitForEvent call appears with `-` prefix in diff
    Evidence: .sisyphus/evidence/task-3-no-step-changes.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-logger-grep.txt`
  - [ ] `.sisyphus/evidence/task-3-log-placement.txt`
  - [ ] `.sisyphus/evidence/task-3-no-step-changes.txt`

  **Commit**: YES (groups with Task 2)
  - Message: `fix(inngest): pin CLI version and add lifecycle step logging`
  - Files: `scripts/dev.ts`, `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Document Known Issue in AGENTS.md

  **What to do**:
  - Add a new Known Issues entry `### 3. Inngest Dev Server step output contamination` in `AGENTS.md` after the existing Known Issue §2 (Slack OAuth redirect URI) and before the `## Prometheus Planning` section.
  - The entry must include:
    1. **Symptom**: What developers will see — Inngest UI step outputs show data from wrong runs
    2. **Root cause**: Step IDs are `sha1(stepName)` — identical across all runs. Dev Server UI cache doesn't scope by run ID.
    3. **Impact**: Display only — actual function execution is correct. Does NOT affect production Inngest Cloud.
    4. **Workaround**: Restart Dev Server to clear cache. Use DB queries and gateway logs (with `runId`) as ground truth instead of Inngest UI.
    5. **Ground truth sources**: `docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT id, status, archetype_id FROM tasks WHERE id = '<taskId>'"` and `grep '"runId":"<runId>"' /tmp/ai-dev.log`
  - Also reference Task 1's diagnostic result (update after Task 1 completes if restart does NOT clear contamination — adjust wording accordingly).

  **Must NOT do**:
  - Do NOT move or renumber existing Known Issues entries
  - Do NOT modify any other section of AGENTS.md
  - Do NOT add employee-specific language in the Known Issues entry (keep it generic to the lifecycle)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding a single markdown section to a known location in AGENTS.md
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — straightforward documentation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3) — after Task 1
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (needs diagnostic result for accurate wording)

  **References**:

  **Pattern References**:
  - `AGENTS.md:393-401` — Existing Known Issues §1 and §2 — follow this format exactly
  - `AGENTS.md:403` — `## Prometheus Planning` section — new entry goes BEFORE this line

  **WHY Each Reference Matters**:
  - Lines 393-401 — Shows the exact heading style (`### N. Title`) and content format for Known Issues entries. The new entry must match.
  - Line 403 — Insertion point: the new `### 3.` goes between the end of §2 and the `## Prometheus Planning` heading.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Known Issue entry exists with required sections
    Tool: Bash (grep)
    Preconditions: AGENTS.md edited
    Steps:
      1. grep "### 3. Inngest Dev Server" AGENTS.md
      2. grep "Workaround" AGENTS.md | grep -i "restart"
      3. grep "ground truth" AGENTS.md | grep -i "gateway logs"
    Expected Result: All three greps return matches
    Failure Indicators: Any grep returns empty
    Evidence: .sisyphus/evidence/task-4-agents-md-verified.txt

  Scenario: Entry is in correct location (between §2 and Prometheus section)
    Tool: Bash (grep -n)
    Preconditions: AGENTS.md edited
    Steps:
      1. grep -n "### 2. Slack OAuth" AGENTS.md (get line N)
      2. grep -n "### 3. Inngest Dev Server" AGENTS.md (get line M)
      3. grep -n "## Prometheus Planning" AGENTS.md (get line P)
      4. Verify N < M < P
    Expected Result: Known Issue §3 appears after §2 and before Prometheus section
    Failure Indicators: Lines are out of order or entry is misplaced
    Evidence: .sisyphus/evidence/task-4-location-verified.txt

  Scenario: No other AGENTS.md sections modified
    Tool: Bash (git diff)
    Preconditions: AGENTS.md edited
    Steps:
      1. git diff AGENTS.md | grep "^@@" | wc -l
    Expected Result: Exactly 1 hunk (the new Known Issues entry insertion)
    Failure Indicators: More than 1 hunk means unrelated sections were touched
    Evidence: .sisyphus/evidence/task-4-diff-check.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-4-agents-md-verified.txt`
  - [ ] `.sisyphus/evidence/task-4-location-verified.txt`
  - [ ] `.sisyphus/evidence/task-4-diff-check.txt`

  **Commit**: YES
  - Message: `docs(agents): document Inngest Dev Server step output contamination bug`
  - Files: `AGENTS.md`

- [x] 5. Cross-Contamination Regression Verification

  **What to do**:
  - This is the key verification task. After Tasks 2 and 3 are committed:
  - Restart the Dev Server (it will now use the pinned CLI v1.21.0 from the Task 2 change)
  - Wait for Dev Server to be healthy: `curl -s http://localhost:8288/dev | jq '.version'` should return `"1.21.0"`
  - Trigger `real-estate-motivation-bot` twice in succession (with a 30s gap between triggers) to create two separate runs
  - For each run:
    1. Capture the task ID from the trigger response
    2. Wait for task to reach `Done`
    3. Check gateway logs: `grep '"runId"' /tmp/ai-dev.log | grep '<taskId>' | tail -5` — verify structured logging shows correct data per-run
    4. Query the DB to confirm correct archetype: `docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT id, archetype_id, status FROM tasks WHERE id = '<taskId>'"`
  - Compare the two runs' gateway log outputs — each should show its own `taskId` and `runId`, confirming independent verification works regardless of Inngest UI contamination
  - Optionally check Inngest UI to document whether contamination still occurs in the UI (for the Known Issue entry) — but do NOT rely on it as the success criterion

  **Must NOT do**:
  - Do NOT trigger guest-messaging, code-rotation, or daily-summarizer
  - Do NOT modify any code — this is a verification-only task

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful orchestration of multiple sequential operations (restart, double-trigger, log analysis, DB verification) with evidence capture
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `e2e-testing`: Covers E2E scenarios but not this specific infrastructure-level verification

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Admin API trigger pattern: `POST /admin/tenants/:tenantId/employees/:slug/trigger`
  - `AGENTS.md` — DB query pattern: `docker exec shared-postgres psql -U postgres -d ai_employee -c "..."`

  **API/Type References**:
  - Admin trigger: `POST http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/real-estate-motivation-bot/trigger`
  - Admin task status: `GET http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/tasks/:id`
  - Dev Server version: `GET http://localhost:8288/dev`

  **WHY Each Reference Matters**:
  - Admin API — Exact URLs to trigger and poll the motivation-bot employee
  - DB query — Ground truth for verifying task data matches gateway logs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Pinned CLI version confirmed running
    Tool: Bash (curl)
    Preconditions: Dev Server restarted after Task 2's code change
    Steps:
      1. curl -s http://localhost:8288/dev | jq '.version'
    Expected Result: Output is "1.21.0"
    Failure Indicators: Output is "1.19.4" or null (old version still running)
    Evidence: .sisyphus/evidence/task-5-version-check.txt

  Scenario: Two-run independence verified via gateway logs
    Tool: Bash (curl, grep, psql)
    Preconditions: Dev Server running with pinned CLI + structured logging
    Steps:
      1. Trigger motivation-bot, capture task_id_1 from response
      2. Wait 30s, trigger motivation-bot again, capture task_id_2
      3. Wait for both tasks to reach Done
      4. grep "<task_id_1>" /tmp/ai-dev.log | grep '"step":"load-task"' — verify archetypeId is e4dd9e63
      5. grep "<task_id_2>" /tmp/ai-dev.log | grep '"step":"load-task"' — verify archetypeId is e4dd9e63
      6. Confirm each log line has a different runId
      7. DB verification: SELECT id, archetype_id FROM tasks WHERE id IN ('<task_id_1>', '<task_id_2>')
    Expected Result: Both tasks show correct archetype in logs AND DB. Each has a unique runId.
    Failure Indicators: Logs show wrong archetypeId, or both tasks share the same runId
    Evidence: .sisyphus/evidence/task-5-two-run-logs.txt

  Scenario: Structured log format verification
    Tool: Bash (grep, jq)
    Preconditions: At least one task triggered after logging changes
    Steps:
      1. grep '"component":"employee-lifecycle"' /tmp/ai-dev.log | grep '"runId"' | tail -3
      2. Pipe one line through jq to verify JSON structure
      3. Confirm fields present: component, taskId, runId, step
    Expected Result: Valid JSON with all required fields
    Failure Indicators: Missing fields, malformed JSON, or runId is empty/null
    Evidence: .sisyphus/evidence/task-5-log-format.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-5-version-check.txt`
  - [ ] `.sisyphus/evidence/task-5-two-run-logs.txt`
  - [ ] `.sisyphus/evidence/task-5-log-format.txt`

  **Commit**: NO (verification only)

- [x] 6. Existing Test Suite Verification

  **What to do**:
  - Run `pnpm test -- --run` to verify no regressions from the logging changes
  - Capture output
  - Confirm 515+ tests passing
  - If any test fails that is NOT in the pre-existing known failures list (`container-boot.test.ts`, `inngest-serve.test.ts`), investigate and fix before proceeding

  **Must NOT do**:
  - Do NOT fix pre-existing test failures
  - Do NOT modify test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution with output analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Pre-existing test failures: `container-boot.test.ts` (Docker socket), `inngest-serve.test.ts` (function count)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: Tasks 2+3 committed
    Steps:
      1. pnpm test -- --run 2>&1 | tee /tmp/test-output.log
      2. grep "Tests" /tmp/test-output.log | tail -3
    Expected Result: 515+ tests passing. Only known failures: container-boot.test.ts (skips), inngest-serve.test.ts (stale assertion)
    Failure Indicators: New test failures not in the known list
    Evidence: .sisyphus/evidence/task-6-test-results.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-6-test-results.txt`

  **Commit**: NO (verification only)

- [x] 7. Notify Completion

  **What to do**:
  - Send Telegram notification that the plan is complete:
    ```bash
    tsx scripts/telegram-notify.ts "✅ inngest-devserver-output-fix complete — All tasks done. Come back to review results."
    ```

  **Must NOT do**:
  - Do NOT send notification before ALL other tasks are complete

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — last task
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 5, 6

  **References**:
  - `AGENTS.md:409` — Telegram notification rule: `tsx scripts/telegram-notify.ts "..."`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: All tasks 1-6 complete
    Steps:
      1. tsx scripts/telegram-notify.ts "✅ inngest-devserver-output-fix complete — All tasks done. Come back to review results."
    Expected Result: Command exits with code 0
    Failure Indicators: Non-zero exit code, error message
    Evidence: .sisyphus/evidence/task-7-telegram-sent.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-7-telegram-sent.txt`

  **Commit**: NO

---

## Final Verification Wave

> This plan is small enough that the verification is embedded in Tasks 5 and 6.
> Task 5 serves as the cross-contamination regression test.
> Task 6 serves as the code quality / test suite check.
> No separate F1-F4 wave needed for a plan of this size.

---

## Commit Strategy

- **Commit A** (after Tasks 2+3): `fix(inngest): pin CLI version and add lifecycle step logging`
  - Files: `scripts/dev.ts`, `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`
- **Commit B** (after Task 4): `docs(agents): document Inngest Dev Server step output contamination`
  - Files: `AGENTS.md`

---

## Success Criteria

### Verification Commands

```bash
# CLI version pinned and running
grep "inngest-cli@1.21.0" scripts/dev.ts        # Expected: match found
curl -s http://localhost:8288/dev | jq '.version' # Expected: "1.21.0"

# Structured logging present
grep '"runId"' /tmp/ai-dev.log | grep '"component":"employee-lifecycle"' | tail -5
# Expected: JSON log lines with taskId, runId, step fields

# AGENTS.md updated
grep "Inngest Dev Server step output contamination" AGENTS.md  # Expected: match found

# Tests pass
pnpm test -- --run  # Expected: 515+ passing
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Diagnostic results documented
- [ ] AGENTS.md Known Issue §3 includes workaround
