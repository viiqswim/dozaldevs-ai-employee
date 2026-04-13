# Fly.io Hybrid E2E: Execution Tracking Fix + 12/12 verify:e2e

## TL;DR

> **Quick Summary**: Fix 5 confirmed bugs in the Fly.io hybrid dispatch path (missing execution record, EXECUTION_ID not injected, stale image tag, fix-loop silent failure, validation write unguarded), push the updated worker image to Fly.io registry, and run the full hybrid E2E pipeline until `pnpm verify:e2e` achieves 12/12 on a clean Fly.io hybrid run.
>
> **Deliverables**:
>
> - `src/inngest/lifecycle.ts`: hybrid-spawn creates execution record + injects EXECUTION_ID + updates stale image tag
> - `src/workers/lib/validation-pipeline.ts`: try/catch around PostgREST write for validation_runs
> - `src/workers/orchestrate.mts`: write AwaitingInput status before process.exit(1) in fix-loop failure branch
> - Worker Docker image rebuilt locally + pushed to Fly.io registry as `latest`
> - Gateway restarted with `USE_FLY_HYBRID=1` and `FLY_WORKER_IMAGE` in env
> - Full hybrid E2E run completed; `pnpm verify:e2e --task-id <uuid>` shows 12/12
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — Waves 1–3 have parallel tasks
> **Critical Path**: Task 1 → Task 4 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 12 → [Task 13 loop] → 12/12

---

## Context

### Original Request

Fix Check 6 (validation_runs not written) and run a full Fly.io hybrid E2E end-to-end until every verify:e2e check passes. Plan is NOT complete until 12/12 on a clean hybrid run.

### Root Cause Summary

**Check 6 in local Docker run (e0d99179)**: Worker got stuck at wave-2 due to manual status intervention during debugging. `finalize()` never ran → validation pipeline never ran → validation_runs empty. **Not a code bug** in a clean run.

**Fly.io hybrid path**: Multiple confirmed bugs that WILL cause failures even in a clean run:

| Bug    | File                        | Impact                                                                                                                |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| BUG #1 | `lifecycle.ts` hybrid-spawn | No execution record created + EXECUTION_ID not in machine env → executionId=null in worker → Checks 5, 6, 10, 11 fail |
| BUG #2 | Fly.io registry             | Stale image `bd34f83` — missing all 5 worker fixes from prior session                                                 |
| BUG #3 | `.env`                      | `USE_FLY_HYBRID=1` not in gateway process env                                                                         |
| BUG #4 | `lifecycle.ts:127`          | Hardcoded image tag default `bd34f83` instead of `latest`                                                             |
| BUG #5 | `orchestrate.mts:968–981`   | Fix-loop failure exits `process.exit(1)` without writing `AwaitingInput` → task stuck Executing, watchdog-invisible   |
| BUG #6 | `validation-pipeline.ts:99` | No try/catch around PostgREST write → network error crashes entire pipeline                                           |

**Watchdog critical nuance**: Hybrid path never creates an execution row. Watchdog requires `exec.runtime_id` to identify stale machines. No execution row = watchdog cannot recover stuck hybrid tasks → stuck **indefinitely**, not 20 min.

### Metis Review

**Critical gaps surfaced**:

- BUG #1 fix **must** be inside `step.run('hybrid-spawn', ...)` — Inngest step idempotency; creating execution record outside the step causes duplicates on retry
- Orphaned Fly machines from prior failed hybrid runs must be destroyed before each E2E run
- `docker buildx ls` must verify multi-platform builder before `pnpm fly:image`
- Watchdog can't recover hybrid tasks (no execution row) — more severe than initially assessed
- Cap iteration loop at 3 full hybrid E2E cycles

---

## Work Objectives

### Core Objective

Fix all bugs in the Fly.io hybrid dispatch path, push updated worker image, and run the hybrid E2E pipeline until `pnpm verify:e2e` shows 12/12 on a clean run with no manual intervention.

### Concrete Deliverables

- `src/inngest/lifecycle.ts` — hybrid-spawn step creates `prisma.execution.create()` + returns `executionId` + adds `EXECUTION_ID` to Fly machine env + fixes image tag default
- `src/workers/lib/validation-pipeline.ts` — try/catch around validation_runs PostgREST write
- `src/workers/orchestrate.mts` — AwaitingInput write before process.exit(1) in fix-loop failure branch
- Docker image `ai-employee-worker:latest` rebuilt locally
- `registry.fly.io/ai-employee-workers:latest` updated with new image via `pnpm fly:image`
- `.env` updated: `USE_FLY_HYBRID=1`, `FLY_WORKER_IMAGE=registry.fly.io/ai-employee-workers:latest`
- Gateway restarted with updated env
- `pnpm verify:e2e --task-id <hybrid-run-uuid>` exits with all 12 checks green

### Definition of Done

- [x] `grep 'EXECUTION_ID' src/inngest/lifecycle.ts` shows it in the hybrid machine env block
- [x] `grep 'bd34f83' src/inngest/lifecycle.ts` returns empty (stale tag removed)
- [x] `pnpm tsc --noEmit 2>&1 | grep -E "src/(workers|inngest)/"` returns empty
- [x] `pnpm test -- --run` passes (515+ tests, no new failures)
- [x] `fly machines list --app ai-employee-workers --json` shows no running machines after E2E
- [x] `pnpm verify:e2e --task-id <uuid>` shows **12/12** — no exceptions

### Must Have

- BUG #1 fix inside `step.run('hybrid-spawn', ...)` callback, not outside
- Execution record created **before** Fly machine creation (so ID is available for machine env)
- `pnpm fly:image` run AFTER Docker rebuild (cross-compiles linux/amd64 — required for Fly.io)
- Pre-flight: destroy orphaned Fly machines + reset stuck Executing tasks before each run
- `docker buildx ls` verified before `pnpm fly:image`
- Max 3 full hybrid E2E cycles in the iteration loop; surface blockers if 12/12 not achieved

### Must NOT Have (Guardrails)

- No changes to `lifecycle.ts:232–286` (local Docker path — untouched)
- No `--no-verify` on git commits
- No try/catch added to any PostgREST calls OTHER than `validation_runs` in `validation-pipeline.ts`
- No AwaitingInput writes at any `process.exit(1)` path OTHER than the `fixResult.success === false` branch at `orchestrate.mts:968–981`
- No `pnpm dev:start` for gateway restart — kill only the gateway process, restart targeted
- No `.env` committed to git (it is gitignored; update `.env.example` only)
- No changes to Dockerfile, Prisma schema, gateway beyond lifecycle.ts, or scripts
- Do NOT declare 12/12 until `pnpm verify:e2e` output confirms it — no partial credit

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: YES (run after code changes in Task 4, before image rebuild)
- **Framework**: Vitest (existing)
- **Agent-Executed QA**: Bash commands verifying DB state, Fly machine output, verify:e2e output

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

- **CLI/Shell**: psql queries, grep/docker commands, gh CLI
- **Long-running**: tmux sessions per AGENTS.md protocol

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — code fixes, parallel):
├── Task 1: lifecycle.ts — BUG #1 + BUG #4 [quick]
├── Task 2: validation-pipeline.ts — BUG #6 [quick]
└── Task 3: orchestrate.mts — BUG #5 [quick]

Wave 2 (After Wave 1 — TypeScript + tests + commit):
└── Task 4: tsc check + pnpm test + commit [quick]

Wave 3 (After Wave 2 — parallel: gateway restart + Docker rebuild):
├── Task 5: Configure .env + restart gateway [quick]
└── Task 6: Docker rebuild local [unspecified-high]

Wave 4 (After Wave 3 — push image after rebuild):
└── Task 7: pnpm fly:image (push to Fly.io registry) [unspecified-high]

Wave 5 (After Wave 4 — pre-flight):
└── Task 8: Fly.io pre-flight checks [quick]

Wave 6 (After Wave 5 — E2E run: sequential):
└── Task 9: Start cloudflared tunnel [quick]
└── Task 10: Fire hybrid E2E trigger-task [unspecified-high]
└── Task 11: Monitor to completion [unspecified-high]
└── Task 12: Run verify:e2e + assess results [quick]

Wave 7 (Conditional — iterate until 12/12, max 3 cycles):
└── Task 13: Fix issues + re-run hybrid E2E until 12/12 [deep]

Wave FINAL (After 12/12 confirmed):
├── F1: Plan Compliance Audit [oracle]
├── F2: Code Quality Review [unspecified-high]
├── F3: Real Manual QA [unspecified-high]
└── F4: Scope Fidelity Check [deep]
```

### Critical Path

Task 1 → Task 4 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10 → Task 12 → [Task 13 max 3×] → F1-F4

---

## TODOs

---

- [x] 1. Fix `lifecycle.ts` hybrid-spawn — BUG #1 (execution record + EXECUTION_ID) + BUG #4 (image tag)

  **What to do**:

  **Fix A — Add execution record creation inside `hybrid-spawn` step (BUG #1)**:
  - File: `src/inngest/lifecycle.ts`, inside `step.run('hybrid-spawn', async () => { ... })` at line ~98
  - Pattern to follow: local Docker path at `lifecycle.ts:247–253` — mirror exactly
  - BEFORE the `fetch(...)` call that creates the Fly machine, add:
    ```typescript
    const execution = await prisma.execution.create({
      data: { task_id: taskId, status: 'running' },
    });
    const executionId = execution.id;
    ```
  - This MUST be inside the `step.run()` callback (Inngest idempotency — retries would create duplicates if outside)

  **Fix B — Add EXECUTION_ID to machine env block (BUG #1)**:
  - In the same `hybrid-spawn` step, find the `env:` block inside the `body: JSON.stringify({...})` call
  - Add `EXECUTION_ID: executionId` to the env object alongside TASK_ID, REPO_URL, etc.

  **Fix C — Update `hybrid-spawn` step return value (BUG #1)**:
  - Change the step return from `return flyMachine` to:
    ```typescript
    return { id: flyMachine.id, state: flyMachine.state, executionId };
    ```
  - Then after the step, update runtime_id using the returned value:
    ```typescript
    await prisma.execution.update({
      where: { id: hybridMachine.executionId },
      data: { runtime_id: hybridMachine.id },
    });
    ```
  - Note: the existing `prisma.execution.updateMany()` after dispatch is a no-op (updates 0 rows since no record existed). Replace it with the above `update()` call.

  **Fix D — Update hardcoded image tag default (BUG #4)**:
  - Find: `const flyWorkerImage = process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:bd34f83'`
  - Change to: `const flyWorkerImage = process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest'`
  - This is in the `hybrid-spawn` step, NOT the non-hybrid Fly dispatch path

  **Must NOT do**:
  - Do NOT touch `lifecycle.ts:232–286` (local Docker path)
  - Do NOT call `prisma.execution.create()` outside the `step.run('hybrid-spawn', ...)` callback
  - Do NOT add INNGEST_EVENT_KEY or INNGEST_BASE_URL to the hybrid machine env (intentionally absent — hybrid uses polling)
  - Do NOT change the non-hybrid Fly path image tag (already uses `latest`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2 and 3 — different files)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4 (TypeScript check)
  - **Blocked By**: None

  **References**:
  - `src/inngest/lifecycle.ts:98–169` — hybrid-spawn step (the block to modify)
  - `src/inngest/lifecycle.ts:247–253` — local Docker path (exact pattern to mirror for execution.create)
  - `src/inngest/lifecycle.ts:257` — shows `-e EXECUTION_ID="${executionId}"` in local Docker env (mirror for hybrid)
  - `src/inngest/lifecycle.ts:127` — hardcoded `bd34f83` tag to change
  - `src/inngest/lifecycle.ts:281` — shows local Docker `execution.update({ runtime_id })` — mirror for hybrid

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: EXECUTION_ID present in hybrid machine env
    Tool: Bash
    Steps:
      1. Run: grep -n "EXECUTION_ID" src/inngest/lifecycle.ts
    Expected Result: At least one line showing EXECUTION_ID in the hybrid env block (lines 98-169)
    Failure Indicator: No EXECUTION_ID found, or only found in local Docker block (232-286)
    Evidence: .sisyphus/evidence/task-1-execution-id-grep.txt

  Scenario: Stale image tag removed
    Tool: Bash
    Steps:
      1. Run: grep 'bd34f83' src/inngest/lifecycle.ts
    Expected Result: Empty output (no stale tag)
    Failure Indicator: 'bd34f83' still present in file
    Evidence: .sisyphus/evidence/task-1-tag-grep.txt

  Scenario: execution.create() inside step.run
    Tool: Bash
    Steps:
      1. Run: grep -n "execution.create\|hybrid-spawn\|step.run" src/inngest/lifecycle.ts | head -20
    Expected Result: execution.create appears AFTER the hybrid-spawn step.run opening, BEFORE the fetch() call
    Evidence: .sisyphus/evidence/task-1-create-placement.txt
  ```

  **Commit**: NO — commit in Task 4 after TypeScript check passes

---

- [x] 2. Fix `validation-pipeline.ts` — BUG #6 (add try/catch around validation_runs write)

  **What to do**:
  - File: `src/workers/lib/validation-pipeline.ts`
  - Find: the `await postgrestClient.post('validation_runs', {...})` call at line ~99, inside `if (executionId) { ... }`
  - Wrap it in try/catch:
    ```typescript
    if (executionId) {
      try {
        await postgrestClient.post('validation_runs', {
          execution_id: executionId,
          stage,
          status: result.passed ? 'passed' : 'failed',
          iteration,
          error_output: result.passed ? null : (result.stderr || result.stdout).slice(0, 10000),
          duration_ms: result.durationMs,
        });
      } catch (err) {
        log.warn(
          `[validation-pipeline] Failed to write validation_run for stage "${stage}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      log.warn(
        `[validation-pipeline] Skipping DB write for stage "${stage}" — executionId is null`,
      );
    }
    ```
  - The catch block logs the error and continues — it does NOT rethrow, does NOT stop the pipeline

  **Must NOT do**:
  - Do NOT add try/catch to any other PostgREST calls in this file or other files
  - Do NOT change the function signature, return types, or any other logic
  - Do NOT swallow errors silently — always log with `log.warn`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1 and 3 — different files)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/workers/lib/validation-pipeline.ts:95–110` — the `if (executionId)` block to wrap
  - `src/workers/lib/validation-pipeline.ts:2–5` — existing imports (logger already imported)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: try/catch present around validation_runs write
    Tool: Bash
    Steps:
      1. Run: grep -n "try\|catch\|validation_runs" src/workers/lib/validation-pipeline.ts
    Expected Result: Lines show try{ before postgrestClient.post, catch after closing brace
    Evidence: .sisyphus/evidence/task-2-trycatch-grep.txt

  Scenario: log.warn in catch block (not silent swallow)
    Tool: Bash
    Steps:
      1. Run: grep -A 3 "catch" src/workers/lib/validation-pipeline.ts
    Expected Result: catch block contains log.warn call
    Failure Indicator: Empty catch block
    Evidence: .sisyphus/evidence/task-2-catch-warn.txt
  ```

  **Commit**: NO — commit in Task 4 after TypeScript check passes

---

- [x] 3. Fix `orchestrate.mts` — BUG #5 (write AwaitingInput before process.exit in fix-loop failure)

  **What to do**:
  - File: `src/workers/orchestrate.mts`
  - Find: the `else` branch of `if (fixResult.success) { ... } else { ... }` near line 968–981
  - The else branch currently: patches execution for token counts → heartbeat.stop() → serverHandle.kill() → process.exit(1)
  - ADD a PostgREST status write BEFORE the heartbeat.stop() call:
    ```typescript
    } else {
      // Fix loop failed — persist partial token counts before exit
      const accumulatedOnFailure = tokenTracker.getAccumulated();
      if (accumulatedOnFailure.promptTokens > 0 || accumulatedOnFailure.completionTokens > 0) {
        await patchExecution(postgrestClient, executionId, {
          prompt_tokens: accumulatedOnFailure.promptTokens,
          completion_tokens: accumulatedOnFailure.completionTokens,
          estimated_cost_usd: accumulatedOnFailure.estimatedCostUsd,
          primary_model_id: accumulatedOnFailure.primaryModelId || null,
        });
      }
      // Write AwaitingInput status so watchdog can detect failure (NEW)
      try {
        await postgrestClient.patch('tasks', `id=eq.${task.id}`, {
          status: 'AwaitingInput',
          failure_reason: `Fix loop failed after ${fixResult.totalIterations} iterations: ${fixResult.reason ?? 'unknown'}`,
          updated_at: new Date().toISOString(),
        });
        await postgrestClient.post('task_status_log', {
          task_id: task.id,
          from_status: 'Executing',
          to_status: 'AwaitingInput',
          actor: 'machine',
        });
      } catch (err) {
        log.warn(`[orchestrate] Failed to write AwaitingInput status: ${err instanceof Error ? err.message : String(err)}`);
      }
      heartbeat.stop();
      await serverHandle.kill();
      process.exit(1);
    }
    ```
  - The try/catch ensures the status write failure doesn't prevent the exit

  **Must NOT do**:
  - Do NOT change `process.exit(1)` exit code
  - Do NOT add AwaitingInput writes to any other `process.exit(1)` paths in this file
  - Do NOT remove or reorder heartbeat.stop() / serverHandle.kill() / process.exit(1)
  - Only this specific `else` branch of the `if (fixResult.success)` check is in scope

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1 and 2 — different files)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/workers/orchestrate.mts:968–981` — the else branch to modify
  - `src/workers/lib/completion.ts:38–60` — reference for PostgREST patch pattern (copy the pattern)
  - `src/workers/orchestrate.mts:1` — top of file for context on imports available

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: AwaitingInput write present in fix-loop failure branch
    Tool: Bash
    Steps:
      1. Run: grep -n "AwaitingInput\|fixResult.success\|Fix loop failed" src/workers/orchestrate.mts
    Expected Result: AwaitingInput appears in the else branch context (after fixResult.success check)
    Failure Indicator: AwaitingInput not found, or found only in unrelated code
    Evidence: .sisyphus/evidence/task-3-awaiting-grep.txt

  Scenario: process.exit(1) still present (unchanged)
    Tool: Bash
    Steps:
      1. Run: grep -n "process.exit" src/workers/orchestrate.mts | grep "fixResult\|Fix loop\|AwaitingInput" -A 5
    Expected Result: process.exit(1) still follows the AwaitingInput write in the else branch
    Evidence: .sisyphus/evidence/task-3-exit-present.txt
  ```

  **Commit**: NO — commit in Task 4

---

- [x] 4. TypeScript check + run tests + commit Wave 1 fixes

  **What to do**:
  - Run `pnpm tsc --noEmit` — fix any TypeScript errors introduced by Tasks 1-3
  - Run `pnpm test -- --run` — confirm 515+ tests pass, no new failures
  - If TypeScript errors exist: open the relevant file and fix the type error (do NOT use `as any` or `@ts-ignore`)
  - Stage and commit all three changed files in a single commit:
    - `src/inngest/lifecycle.ts` (Task 1)
    - `src/workers/lib/validation-pipeline.ts` (Task 2)
    - `src/workers/orchestrate.mts` (Task 3)
  - Commit message: `fix(hybrid): add execution tracking, harden validation and fix-loop failure paths`

  **Must NOT do**:
  - Do NOT commit with `--no-verify`
  - Do NOT add `Co-authored-by` lines
  - Do NOT reference AI/Claude in commit message
  - Do NOT commit `.env`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after Wave 1
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Tasks 5 and 6
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `package.json` — scripts.build, scripts.test
  - `tsconfig.json` — TypeScript config for type check

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: TypeScript clean
    Tool: Bash
    Steps:
      1. Run: pnpm tsc --noEmit 2>&1 | grep -E "src/(workers|inngest)/"
    Expected Result: Empty output (no errors in worker or inngest files)
    Failure Indicator: Any error lines in output
    Evidence: .sisyphus/evidence/task-4-tsc.txt

  Scenario: Tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
    Expected Result: 515 or more tests passing, 0 new failures beyond the 2 known pre-existing
    Failure Indicator: Test count drops below 515, or new FAIL lines appear
    Evidence: .sisyphus/evidence/task-4-test.txt

  Scenario: Commit created
    Tool: Bash
    Steps:
      1. Run: git log --oneline -1
    Expected Result: Latest commit message contains "fix(hybrid)"
    Evidence: .sisyphus/evidence/task-4-git-log.txt
  ```

  **Commit**: YES — `fix(hybrid): add execution tracking, harden validation and fix-loop failure paths`
  - Files: `src/inngest/lifecycle.ts`, `src/workers/lib/validation-pipeline.ts`, `src/workers/orchestrate.mts`
  - Pre-commit: `pnpm tsc --noEmit && pnpm test -- --run`

---

- [x] 5. Configure `.env` + restart gateway process with `USE_FLY_HYBRID=1`

  **What to do**:
  - Open `.env` and ensure the following vars are set (add/update, do NOT remove existing vars):
    ```
    USE_FLY_HYBRID=1
    FLY_WORKER_IMAGE=registry.fly.io/ai-employee-workers:latest
    ```
  - Also update `.env.example` to document these two vars (verify they are present with example values; update if missing or stale)
  - Find the gateway process PID: `lsof -ti tcp:3000` or `pgrep -f "tsx.*gateway"` or equivalent
  - Kill only the gateway process: `kill <PID>` (SIGTERM — not SIGKILL unless it doesn't respond)
  - Restart the gateway in a tmux sub-pane or background with updated env loaded from `.env`:
    - Check `scripts/dev-start.ts` for the exact command used to start the gateway
    - Ensure the `.env` file is sourced in the new process (e.g., `dotenv -e .env -- <gateway-cmd>` or equivalent)
  - Confirm gateway is healthy: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health` returns 200

  **Must NOT do**:
  - Do NOT run `pnpm dev:start` — this restarts ALL services, not just the gateway
  - Do NOT kill the `ai-dev` tmux session
  - Do NOT commit `.env` (it is gitignored)
  - Do NOT stop Docker Compose services

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6 — independent operations)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 4

  **References**:
  - `.env.example` — document USE_FLY_HYBRID and FLY_WORKER_IMAGE values
  - `scripts/dev-start.ts` — how gateway is started (for correct restart command)
  - `src/gateway/index.ts` — gateway entry point

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Gateway healthy with new env
    Tool: Bash
    Steps:
      1. Run: curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
    Expected Result: 200
    Failure Indicator: Non-200 response or connection refused
    Evidence: .sisyphus/evidence/task-5-gateway-health.txt

  Scenario: USE_FLY_HYBRID set in .env
    Tool: Bash
    Steps:
      1. Run: grep "USE_FLY_HYBRID" .env
    Expected Result: USE_FLY_HYBRID=1
    Failure Indicator: Missing or set to empty string
    Evidence: .sisyphus/evidence/task-5-env-check.txt
  ```

  **Commit**: NO — `.env` is not committed; `.env.example` update is committed in Task 4 if needed (minor doc change)

---

- [x] 6. Rebuild Docker image locally

  **What to do**:
  - Verify multi-platform builder is configured: `docker buildx ls` — look for a builder with `linux/amd64` support
  - If no multi-platform builder exists: `docker buildx create --use --name multiplatform`
  - Launch the build in a tmux session (takes 5–15 min — MANDATORY per AGENTS.md protocol):
    ```bash
    tmux new-session -d -s ai-build -x 220 -y 50
    tmux send-keys -t ai-build \
      "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" \
      Enter
    ```
  - Poll every 60 seconds: `tail -20 /tmp/ai-build.log` and `grep "EXIT_CODE:" /tmp/ai-build.log`
  - Once EXIT_CODE:0 appears, confirm: `docker images ai-employee-worker:latest` shows a recent timestamp

  **Must NOT do**:
  - Do NOT run `docker build` as a blocking shell call (5-15 min build)
  - Do NOT use `docker buildx build --push` here — local tag only; cross-compile push is Task 7
  - Do NOT skip and go straight to Task 7 (Task 7's `pnpm fly:image` pulls from local)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5 — independent)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:
  - `Dockerfile` — image definition being built
  - AGENTS.md — Long-Running Command Protocol (tmux pattern, mandatory)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker build succeeds
    Tool: Bash
    Steps:
      1. Poll: grep "EXIT_CODE:" /tmp/ai-build.log
      2. Run: docker images ai-employee-worker:latest --format "{{.CreatedAt}}"
    Expected Result: EXIT_CODE:0, image timestamp within last 30 minutes
    Failure Indicator: EXIT_CODE:1, or image is hours old
    Evidence: .sisyphus/evidence/task-6-build-result.txt

  Scenario: buildx multi-platform builder exists
    Tool: Bash
    Steps:
      1. Run: docker buildx ls | grep -E "linux/amd64"
    Expected Result: At least one builder shows linux/amd64 support
    Evidence: .sisyphus/evidence/task-6-buildx-ls.txt
  ```

  **Commit**: NO (local rebuild only)

---

- [x] 7. Push updated worker image to Fly.io registry (`pnpm fly:image`)

  **What to do**:
  - Verify the local Docker image is fresh from Task 6: `docker images ai-employee-worker:latest --format "{{.CreatedAt}}"`
  - Verify `docker buildx ls` shows a multi-platform builder (set up in Task 6 if needed)
  - Launch `pnpm fly:image` in a tmux session (cross-compiles linux/amd64 + pushes — 10-20 min):
    ```bash
    tmux new-session -d -s ai-push -x 220 -y 50
    tmux send-keys -t ai-push \
      "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm fly:image 2>&1 | tee /tmp/ai-push.log; echo 'EXIT_CODE:'$? >> /tmp/ai-push.log" \
      Enter
    ```
  - Poll every 60 seconds: `tail -20 /tmp/ai-push.log` and `grep "EXIT_CODE:" /tmp/ai-push.log`
  - Once EXIT_CODE:0 appears, verify the image is in the registry:
    `fly images list --app ai-employee-workers 2>/dev/null | head -5` (if flyctl available)
    OR confirm the push log ends with "digest: sha256:..." (success indicator)

  **Must NOT do**:
  - Do NOT run `pnpm fly:image` as a blocking shell call
  - Do NOT skip this task — a stale Fly.io registry image (bd34f83) is BUG #2 and will cause failures
  - Do NOT push without verifying local build is fresh (Task 6 must be complete)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after Task 6
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:
  - `package.json` — `fly:image` script definition
  - AGENTS.md — Long-Running Command Protocol (tmux pattern)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: fly:image push succeeds
    Tool: Bash
    Steps:
      1. Poll: grep "EXIT_CODE:" /tmp/ai-push.log
      2. Run: tail -5 /tmp/ai-push.log
    Expected Result: EXIT_CODE:0, log tail shows "pushed" or "digest: sha256:" indicating registry write
    Failure Indicator: EXIT_CODE:1, authentication error, or build failure
    Evidence: .sisyphus/evidence/task-7-push-result.txt

  Scenario: Old bd34f83 tag no longer default in lifecycle.ts
    Tool: Bash
    Steps:
      1. Run: grep "bd34f83" src/inngest/lifecycle.ts
    Expected Result: Empty output (stale tag removed in Task 1)
    Evidence: .sisyphus/evidence/task-7-tag-removed.txt
  ```

  **Commit**: NO

---

- [x] 8. Fly.io pre-flight checks (destroy orphans, reset stuck tasks)

  **What to do**:
  - List any running Fly machines from prior failed hybrid runs:
    `fly machines list --app ai-employee-workers --json 2>/dev/null | jq '.[].id'`
  - If any machines are in `started` or `stopping` state: destroy them:
    `fly machines destroy <machine-id> --app ai-employee-workers --force`
  - Check for tasks stuck in `Executing` status in DB (older than 10 min):
    ```bash
    psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
      -c "SELECT id, status, created_at FROM tasks WHERE status = 'Executing' ORDER BY created_at DESC LIMIT 5;"
    ```
  - If stuck tasks found: reset them to `Ready`:
    ```bash
    psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
      -c "UPDATE tasks SET status = 'Ready' WHERE status = 'Executing' AND created_at < NOW() - INTERVAL '10 minutes';"
    ```
  - Confirm Docker Compose services are running (Supabase, PostgREST):
    `docker compose -f docker/docker-compose.yml ps`

  **Must NOT do**:
  - Do NOT destroy machines created within the last 5 minutes (might be a live run)
  - Do NOT reset tasks that are `Ready` or `Done` — only `Executing` older than 10 min
  - Do NOT stop Docker Compose services

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after Tasks 5 and 7
  - **Parallel Group**: Wave 5 (solo)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 5, 7

  **References**:
  - `src/lib/fly-client.ts` — Fly Machines API (machine state reference)
  - `docker/docker-compose.yml` — service names for `docker compose ps`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: No orphaned Fly machines
    Tool: Bash
    Steps:
      1. Run: fly machines list --app ai-employee-workers --json 2>/dev/null | jq 'length'
    Expected Result: 0 (no running machines)
    Failure Indicator: Any machines in started/stopping state remain
    Evidence: .sisyphus/evidence/task-8-fly-machines.txt

  Scenario: No Executing tasks older than 10 min
    Tool: Bash
    Steps:
      1. Run: psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "SELECT COUNT(*) FROM tasks WHERE status = 'Executing' AND created_at < NOW() - INTERVAL '10 minutes';"
    Expected Result: Count = 0
    Evidence: .sisyphus/evidence/task-8-stuck-tasks.txt

  Scenario: Docker Compose services running
    Tool: Bash
    Steps:
      1. Run: docker compose -f docker/docker-compose.yml ps
    Expected Result: All core services show "running" state (postgres, kong, postgrest, etc.)
    Evidence: .sisyphus/evidence/task-8-docker-ps.txt
  ```

  **Commit**: NO

---

- [x] 9. Start cloudflared tunnel + capture tunnel URL

  **What to do**:
  - Start a cloudflared tunnel to expose local PostgREST (port 54321) to Fly.io workers:
    ```bash
    tmux new-session -d -s ai-tunnel -x 220 -y 50
    tmux send-keys -t ai-tunnel \
      "cloudflared tunnel --url http://localhost:54321 2>&1 | tee /tmp/ai-tunnel.log" \
      Enter
    ```
  - Wait ~15 seconds for the tunnel to initialize, then extract the URL:
    ```bash
    grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/ai-tunnel.log | head -1
    ```
  - Save the URL to an evidence file: `echo "<url>" > .sisyphus/evidence/task-9-tunnel-url.txt`
  - Set TUNNEL_URL in the environment for Task 10 (will be passed as env var to trigger-task):
    The URL will be consumed as: `TUNNEL_URL=$(cat .sisyphus/evidence/task-9-tunnel-url.txt) USE_FLY_HYBRID=1 pnpm trigger-task`

  **Must NOT do**:
  - Do NOT use ngrok free tier (blocked by Fly.io IPs per AGENTS.md)
  - Do NOT kill the `ai-tunnel` session before Task 11 completes (tunnel must stay alive for entire E2E run)
  - Do NOT hardcode the tunnel URL in any source file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after Task 8
  - **Parallel Group**: Wave 6 (sequential E2E chain)
  - **Blocks**: Task 10
  - **Blocked By**: Task 8

  **References**:
  - AGENTS.md — Hybrid Fly.io Mode setup steps (Option A: Cloudflare Tunnel)
  - `src/lib/ngrok-client.ts` — shows how TUNNEL_URL env var is consumed (bypasses ngrok agent API)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tunnel URL captured and reachable
    Tool: Bash
    Steps:
      1. Run: cat .sisyphus/evidence/task-9-tunnel-url.txt
      2. Run: curl -s -o /dev/null -w "%{http_code}" "$(cat .sisyphus/evidence/task-9-tunnel-url.txt)/rest/v1/"
    Expected Result: URL is non-empty; HTTP response is 200 or 401 (PostgREST responds, not 000)
    Failure Indicator: Empty URL, or curl returns 000 (connection refused)
    Evidence: .sisyphus/evidence/task-9-tunnel-url.txt (the URL itself)
  ```

  **Commit**: NO

---

- [x] 10. Fire hybrid E2E trigger-task

  **What to do**:
  - Read the tunnel URL: `TUNNEL_URL=$(cat .sisyphus/evidence/task-9-tunnel-url.txt)`
  - Launch `pnpm trigger-task` in a tmux session (polls until Done — 45-90 min — MANDATORY tmux pattern):
    ```bash
    tmux new-session -d -s ai-e2e -x 220 -y 50
    tmux send-keys -t ai-e2e \
      "cd /Users/victordozal/repos/dozal-devs/ai-employee && TUNNEL_URL=$(cat .sisyphus/evidence/task-9-tunnel-url.txt) USE_FLY_HYBRID=1 pnpm trigger-task 2>&1 | tee /tmp/ai-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-e2e.log" \
      Enter
    ```
  - Immediately after firing: poll the log every ~10 seconds until the task UUID appears:
    ```bash
    sleep 10 && grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" /tmp/ai-e2e.log | head -1
    ```
  - Save the task ID: `echo "<task-id>" > .sisyphus/evidence/task-10-task-id.txt`
  - This task ID is required for Task 12's `pnpm verify:e2e --task-id <uuid>`

  **Must NOT do**:
  - Do NOT run `pnpm trigger-task` as a blocking shell call
  - Do NOT proceed to Task 11 until task ID is captured from the log
  - Do NOT pass `--key` flag unless a specific ticket key is needed

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after Task 9
  - **Parallel Group**: Wave 6 (sequential E2E chain)
  - **Blocks**: Task 11
  - **Blocked By**: Task 9

  **References**:
  - `scripts/trigger-task.ts` — what trigger-task does (Jira webhook mock + monitoring)
  - AGENTS.md — Long-Running Command Protocol (tmux pattern)
  - `.sisyphus/evidence/task-9-tunnel-url.txt` — tunnel URL for TUNNEL_URL env var

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: trigger-task fired and task ID captured
    Tool: Bash
    Steps:
      1. Run: cat .sisyphus/evidence/task-10-task-id.txt
    Expected Result: Non-empty UUID (36 chars, xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    Failure Indicator: Empty file, or non-UUID content
    Evidence: .sisyphus/evidence/task-10-task-id.txt

  Scenario: E2E session running in tmux
    Tool: Bash
    Steps:
      1. Run: tmux list-sessions | grep ai-e2e
    Expected Result: ai-e2e session listed as active
    Failure Indicator: Session not found
    Evidence: .sisyphus/evidence/task-10-tmux-session.txt
  ```

  **Commit**: NO

---

- [x] 11. Monitor E2E run to completion

  **What to do**:
  - Poll the `ai-e2e` tmux session every 60 seconds until a terminal state is reached:
    - "Task status: Done" or similar → success
    - "Task status: AwaitingInput" or early exit → failure path
    - EXIT_CODE line in `/tmp/ai-e2e.log` → process finished
  - Polling commands:
    ```bash
    tail -30 /tmp/ai-e2e.log
    grep -E "EXIT_CODE:|status: Done|status: AwaitingInput|Error|FAILED" /tmp/ai-e2e.log | tail -10
    ```
  - Optionally monitor the Fly machine state:
    ```bash
    fly machines list --app ai-employee-workers --json 2>/dev/null | jq '.[].state'
    ```
  - If AwaitingInput or timeout (>90 min): capture Fly logs for diagnosis:
    ```bash
    tmux new-session -d -s ai-flylogs -x 220 -y 50
    tmux send-keys -t ai-flylogs \
      "fly logs --app ai-employee-workers --no-tail 2>&1 | tee /tmp/ai-flylogs.log; echo 'EXIT_CODE:'$? >> /tmp/ai-flylogs.log" \
      Enter
    ```
  - Also check DB task state:
    ```bash
    psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
      -c "SELECT status, failure_reason FROM tasks WHERE id = '$(cat .sisyphus/evidence/task-10-task-id.txt)';"
    ```
  - Once terminal state reached: save the full run log:
    ```bash
    cp /tmp/ai-e2e.log .sisyphus/evidence/task-11-e2e-run.log
    ```

  **Must NOT do**:
  - Do NOT kill the `ai-tunnel` session while waiting (tunnel must stay alive)
  - Do NOT interfere with the running Fly machine
  - Do NOT manually update task status in DB during the run
  - Cap wait at 90 minutes — if still running after 90 min, something is hung; proceed to diagnosis

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after Task 10
  - **Parallel Group**: Wave 6 (sequential E2E chain)
  - **Blocks**: Task 12
  - **Blocked By**: Task 10

  **References**:
  - `scripts/trigger-task.ts` — status polling logic (understand what "done" looks like in logs)
  - `scripts/verify-e2e.ts` — the 12 checks to run in Task 12

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Run reached terminal state
    Tool: Bash
    Steps:
      1. Run: grep -E "status: (Done|AwaitingInput)|EXIT_CODE:" /tmp/ai-e2e.log | tail -3
    Expected Result: At least one of: "status: Done", "status: AwaitingInput", or "EXIT_CODE:" line
    Failure Indicator: None of these found (still polling or hung)
    Evidence: .sisyphus/evidence/task-11-e2e-run.log

  Scenario: Task status in DB is terminal
    Tool: Bash
    Steps:
      1. Run: psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "SELECT status FROM tasks WHERE id = '$(cat .sisyphus/evidence/task-10-task-id.txt)';"
    Expected Result: status = 'Done' (ideal) or 'AwaitingInput' (failure, diagnose in Task 13)
    Evidence: .sisyphus/evidence/task-11-db-status.txt
  ```

  **Commit**: NO

---

- [x] 12. Run `pnpm verify:e2e` + assess results

  **What to do**:
  - Run the 12-point verification against the completed task:
    ```bash
    TASK_ID=$(cat .sisyphus/evidence/task-10-task-id.txt)
    pnpm verify:e2e --task-id $TASK_ID 2>&1 | tee .sisyphus/evidence/task-12-verify-e2e.txt
    ```
  - Read the output carefully — each of the 12 checks shows PASS or FAIL with details
  - If **12/12 PASS**: plan is complete → proceed to Final Verification Wave
  - If **< 12/12**: record which checks failed and their error messages, then proceed to Task 13
  - Root cause map for failing checks:
    - Check 5 (execution record): BUG #1 fix may not have taken effect; verify lifecycle.ts hybrid-spawn
    - Check 6 (validation_runs): No EXECUTION_ID → executionId=null → write skipped; or PostgREST error caught by try/catch
    - Check 9 (machine actor): completion.ts writes actor='machine' using taskId — check if completion flow ran
    - Check 10 (deliverables): No executionId in deliverable write; check completion.ts + worker logs
    - Check 11 (execution populated): execution row exists but fields null → check worker logs for errors
    - Check 12 (container cleanup): Fly machine still running → destroy orphan

  **Must NOT do**:
  - Do NOT declare 12/12 from memory or inference — ONLY from actual `pnpm verify:e2e` output
  - Do NOT skip this task even if the run looked successful in the trigger-task logs
  - Do NOT proceed to Final Verification Wave if any check is failing

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after Task 11
  - **Parallel Group**: Wave 6 (sequential E2E chain)
  - **Blocks**: Task 13 (if < 12/12) OR Final Verification Wave (if 12/12)
  - **Blocked By**: Task 11

  **References**:
  - `scripts/verify-e2e.ts` — the 12 checks (read to understand what each check queries)
  - `.sisyphus/evidence/task-10-task-id.txt` — task UUID for verify:e2e

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: verify:e2e output captured
    Tool: Bash
    Steps:
      1. Run: cat .sisyphus/evidence/task-12-verify-e2e.txt | tail -20
    Expected Result: File contains 12 check results with PASS/FAIL labels
    Failure Indicator: Empty file or missing check lines
    Evidence: .sisyphus/evidence/task-12-verify-e2e.txt

  Scenario: 12/12 achieved (ideal)
    Tool: Bash
    Steps:
      1. Run: grep -c "PASS" .sisyphus/evidence/task-12-verify-e2e.txt
    Expected Result: 12 (all checks passing) → proceed to Final Verification Wave
    Failure Indicator: Count < 12 → proceed to Task 13
    Evidence: .sisyphus/evidence/task-12-verify-e2e.txt
  ```

  **Commit**: NO

---

- [x] 13. Fix remaining verify:e2e failures + re-run hybrid E2E (max 3 cycles total)

  > **Conditional task** — only execute if Task 12 shows < 12/12. Skip if 12/12 achieved.
  > Cycle 1 was Task 12's run. This task covers cycles 2 and 3 maximum.
  > If 12/12 not achieved after 3 total cycles, document findings and surface blockers — do NOT continue looping.

  **What to do**:

  **Per iteration (repeat up to 2 more times, cycles 2-3):**
  1. **Diagnose failing checks** from `.sisyphus/evidence/task-12-verify-e2e.txt` (or previous iteration's evidence):
     - For each FAIL: identify the root cause using logs, DB queries, and source code inspection
     - Map to the specific file/function to change
     - Check Fly machine logs: `fly logs --app ai-employee-workers --no-tail 2>&1 | head -200`
     - Check worker execution state in DB:
       ```bash
       TASK_ID=$(cat .sisyphus/evidence/task-10-task-id.txt)
       psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
         -c "SELECT e.status, e.runtime_id, e.prompt_tokens FROM executions e JOIN tasks t ON t.id = e.task_id WHERE t.id = '$TASK_ID';"
       ```

  2. **Apply targeted fixes** to the relevant files:
     - Run `pnpm tsc --noEmit` after each fix to verify no TypeScript errors
     - If fix is in `src/workers/` or `src/inngest/lifecycle.ts`: rebuild Docker image AND push to Fly.io registry (Tasks 6+7 pattern):
       ```bash
       # Rebuild local
       tmux new-session -d -s ai-build-N -x 220 -y 50
       tmux send-keys -t ai-build-N "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build-N.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build-N.log" Enter
       # After EXIT_CODE:0: push to Fly.io registry
       tmux new-session -d -s ai-push-N -x 220 -y 50
       tmux send-keys -t ai-push-N "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm fly:image 2>&1 | tee /tmp/ai-push-N.log; echo 'EXIT_CODE:'$? >> /tmp/ai-push-N.log" Enter
       ```
     - If fix is only in gateway code (`src/inngest/`, `src/gateway/`): restart gateway only (no rebuild needed)
     - Run `pnpm test -- --run` to confirm no regressions

  3. **Commit the fix** (if code was changed):
     - Message: `fix(hybrid): <describe the specific fix>`
     - Do NOT use `--no-verify`

  4. **Pre-flight cleanup** (same as Task 8):
     - Destroy any orphaned Fly machines
     - Reset any stuck Executing tasks (> 10 min old)
     - Kill old `ai-tunnel` session if still running; restart with fresh cloudflared tunnel
     - Update `.sisyphus/evidence/task-9-tunnel-url.txt` with the new URL

  5. **Re-fire trigger-task** (same as Task 10):

     ```bash
     tmux new-session -d -s ai-e2e-N -x 220 -y 50
     tmux send-keys -t ai-e2e-N "cd /Users/victordozal/repos/dozal-devs/ai-employee && TUNNEL_URL=$(cat .sisyphus/evidence/task-9-tunnel-url.txt) USE_FLY_HYBRID=1 pnpm trigger-task 2>&1 | tee /tmp/ai-e2e-N.log; echo 'EXIT_CODE:'$? >> /tmp/ai-e2e-N.log" Enter
     ```

     Capture new task ID: `grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" /tmp/ai-e2e-N.log | head -1 > .sisyphus/evidence/task-13-iterN-task-id.txt`

  6. **Monitor to completion** (same as Task 11):
     - Poll every 60 seconds
     - Wait up to 90 minutes for terminal state

  7. **Run verify:e2e** against the new task ID:
     ```bash
     pnpm verify:e2e --task-id $(cat .sisyphus/evidence/task-13-iterN-task-id.txt) 2>&1 | tee .sisyphus/evidence/task-13-iterN-verify-e2e.txt
     ```
     If 12/12: DONE — proceed to Final Verification Wave.
     If < 12/12 and cycle count < 3: repeat from step 1.
     If < 12/12 and cycle 3 exhausted: document remaining failures and surface blockers.

  **Must NOT do**:
  - Do NOT exceed 3 total hybrid E2E cycles (cycle 1 = Task 12, cycles 2-3 = this task)
  - Do NOT manually update DB task status during a running E2E
  - Do NOT kill `ai-tunnel` while a trigger-task is polling
  - Do NOT declare 12/12 without actual verify:e2e output confirming it
  - Do NOT continue to Final Verification Wave if < 12/12 after 3 cycles — surface blockers instead

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential, conditional on Task 12
  - **Parallel Group**: Wave 7 (conditional, solo)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Task 12

  **References**:
  - `src/inngest/lifecycle.ts:98–169` — hybrid-spawn step (primary fix target BUG #1)
  - `src/workers/lib/validation-pipeline.ts:95–110` — validation_runs write (BUG #6)
  - `src/workers/orchestrate.mts:968–981` — fix-loop failure path (BUG #5)
  - `src/workers/lib/completion.ts` — completion flow that writes deliverables + machine actor
  - `scripts/verify-e2e.ts` — 12 checks (understand what each actually queries)
  - AGENTS.md — Long-Running Command Protocol, Hybrid Fly.io Mode
  - `.sisyphus/evidence/task-12-verify-e2e.txt` — first run results to diagnose

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: verify:e2e 12/12 on a clean hybrid run
    Tool: Bash
    Steps:
      1. Run: grep -c "PASS" .sisyphus/evidence/task-13-iter{N}-verify-e2e.txt
    Expected Result: 12
    Failure Indicator: Count < 12 after 3 total cycles → surface blockers, stop
    Evidence: .sisyphus/evidence/task-13-iter{N}-verify-e2e.txt (one per iteration)

  Scenario: No manual DB intervention during run (audit)
    Tool: Bash
    Steps:
      1. Run: psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "SELECT actor, from_status, to_status FROM task_status_log WHERE task_id = '$(cat .sisyphus/evidence/task-13-iterN-task-id.txt)' ORDER BY created_at;"
    Expected Result: All status transitions show actor = 'machine' or 'lifecycle' — no 'manual' actor
    Evidence: .sisyphus/evidence/task-13-iter{N}-status-log.txt
  ```

  **Commit**: YES (for each fix applied) — `fix(hybrid): <describe specific fix>`
  - Pre-commit: `pnpm tsc --noEmit && pnpm test -- --run`

---

## Final Verification Wave (MANDATORY — after 12/12 confirmed)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before marking work complete.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** If any reviewer rejects or user has feedback → fix → re-run → present again → wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`

  Read the plan end-to-end. For each "Must Have": verify implementation exists (read relevant file, grep for the specific code change). For each "Must NOT Have" (guardrails): search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan list.

  Specific checks:
  - `grep 'EXECUTION_ID' src/inngest/lifecycle.ts` → must appear in hybrid-spawn block (lines 98-169)
  - `grep 'bd34f83' src/inngest/lifecycle.ts` → must be empty
  - `grep 'try' src/workers/lib/validation-pipeline.ts` → must wrap validation_runs write
  - `grep 'AwaitingInput' src/workers/orchestrate.mts` → must appear in fixResult.success else branch
  - `.sisyphus/evidence/task-12-verify-e2e.txt` or `task-13-iter*-verify-e2e.txt` → must exist and show 12 PASS

  Output: `Must Have [N/N] | Must NOT Have [N/N] guardrails clean | Evidence [N files exist] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`

  Run `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for:
  - `as any` / `@ts-ignore` (forbidden unless pre-existing)
  - Empty catch blocks (all catches must log with `log.warn`)
  - `console.log` in production code (use structured logger)
  - Commented-out code blocks
  - Unused imports
  - AI slop: excessive comments, over-abstraction, generic variable names (`data`/`result`/`item`)

  Files to review: `src/inngest/lifecycle.ts`, `src/workers/lib/validation-pipeline.ts`, `src/workers/orchestrate.mts`

  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT: APPROVE/REJECT`

- [x] F3. **Real Manual QA** — `unspecified-high`

  Execute a fresh hybrid E2E run from scratch with a clean DB state:
  - Destroy any orphaned Fly machines
  - Fire `pnpm trigger-task` via tmux with `TUNNEL_URL` and `USE_FLY_HYBRID=1`
  - Monitor to completion (Done state in DB)
  - Run `pnpm verify:e2e --task-id <uuid>` and capture output
  - Confirm 12/12 PASS on this independent run (not relying on Task 12/13 evidence)

  Save all evidence to `.sisyphus/evidence/final-qa/`.

  Output: `Scenarios [12/12 pass] | VERDICT: APPROVE/REJECT`

- [x] F4. **Scope Fidelity Check** — `deep`

  For each task: read "What to do", then read the actual git diff (`git log --oneline`, `git show <commit>`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no scope creep). Check "Must NOT do" compliance for each task. Detect cross-task contamination (Task N touching Task M's files without authorization). Flag unaccounted changes.

  Specific checks:
  - Confirm `lifecycle.ts:232-286` (local Docker path) is UNCHANGED
  - Confirm no try/catch added to any PostgREST calls OTHER than `validation_runs` in validation-pipeline.ts
  - Confirm no AwaitingInput writes at any `process.exit(1)` OTHER than the fix-loop failure branch
  - Confirm `.env` was NOT committed

  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

| Commit | Task              | Message                                                                             | Files                                                                                               |
| ------ | ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1      | Task 4            | `fix(hybrid): add execution tracking, harden validation and fix-loop failure paths` | `src/inngest/lifecycle.ts`, `src/workers/lib/validation-pipeline.ts`, `src/workers/orchestrate.mts` |
| 2+     | Task 13 (per fix) | `fix(hybrid): <describe specific fix>`                                              | files changed per iteration                                                                         |

- All commits run pre-commit hooks (no `--no-verify`)
- No `Co-authored-by` lines
- No AI/Claude references in commit messages
- `.env` is NEVER committed

---

## Success Criteria

### Verification Commands

```bash
# BUG #1 fix — EXECUTION_ID in hybrid path
grep -n "EXECUTION_ID" src/inngest/lifecycle.ts
# Expected: line in 98-169 range (hybrid-spawn block)

# BUG #4 fix — stale image tag removed
grep "bd34f83" src/inngest/lifecycle.ts
# Expected: empty output

# BUG #6 fix — try/catch around validation_runs write
grep -A 3 "try" src/workers/lib/validation-pipeline.ts
# Expected: try block wrapping postgrestClient.post('validation_runs', ...)

# BUG #5 fix — AwaitingInput write in fix-loop failure branch
grep -n "AwaitingInput" src/workers/orchestrate.mts
# Expected: appears in else branch of fixResult.success check (~line 968-981)

# Local Docker path untouched (CRITICAL guardrail)
git diff HEAD~1 -- src/inngest/lifecycle.ts | grep "^+" | grep -E "232|233|234|235|236|237|238|239|240|241|242|243|244|245|246|247|248|249|250|251|252|253|254|255|256|257|258|259|260|261|262|263|264|265|266|267|268|269|270|271|272|273|274|275|276|277|278|279|280|281|282|283|284|285|286"
# Expected: empty output (no changes in local Docker block)

# TypeScript clean
pnpm tsc --noEmit 2>&1 | grep -E "src/(workers|inngest)/"
# Expected: empty output

# Tests pass
pnpm test -- --run 2>&1 | tail -5
# Expected: 515+ passing, 0 new failures

# Final E2E verification (use actual UUID from the successful hybrid run)
pnpm verify:e2e --task-id <uuid-from-successful-hybrid-run>
# Expected: 12/12 checks PASS
```

### Final Checklist

- [x] `grep 'EXECUTION_ID' src/inngest/lifecycle.ts` shows result in lines 98-169
- [x] `grep 'bd34f83' src/inngest/lifecycle.ts` returns empty
- [x] `pnpm tsc --noEmit 2>&1 | grep -E "src/(workers|inngest)/"` returns empty
- [x] `pnpm test -- --run` passes with 515+ tests
- [x] `fly machines list --app ai-employee-workers --json | jq 'length'` returns 0 after E2E
- [x] `pnpm verify:e2e --task-id <uuid>` shows **12/12** — no exceptions
- [x] `.env` is NOT in `git log --oneline -5` commits
- [x] `lifecycle.ts:232-286` (local Docker path) is unchanged from main
