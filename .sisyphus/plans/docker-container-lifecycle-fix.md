# Docker Container Lifecycle Fix — Permanent Solution

## TL;DR

> **Quick Summary**: Fix all Docker container lifecycle management bugs in local dev — containers leak on retry, cleanup steps use Fly.io API instead of `docker stop`, delivery retry loop uses duplicate names, and `dev.ts` shutdown orphans worker containers. The deprecated `lifecycle.ts` had correct `docker_` prefix branching; this was lost in the rewrite.
>
> **Deliverables**:
>
> - Idempotent `runLocalDockerContainer()` with pre-cleanup
> - All 4 cleanup steps fixed with local Docker branching
> - Reply-anyway container cleanup added
> - Delivery retry loop with unique container names + inter-attempt cleanup
> - `dev.ts` shutdown kills worker containers
> - Helper function `stopLocalDockerContainer()` for DRY cleanup
> - Tests for all new logic paths
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 6 → F1-F4

---

## Context

### Original Request

User clicked "approve and send" on a guest-messaging task. The delivery step failed with: `docker: Error response from daemon: Conflict. The container name "/employee-delivery-f2c8430a" is already in use`. Investigation revealed this is one of 8 distinct container leak vectors — a systemic issue, not a one-off bug.

### Interview Summary

**Key Discussions**:

- User wants a permanent solution, not a band-aid — "Why did this even happen? How can we prevent it ever again?"
- Agreed on automated tests with mocked `execSync`
- Scope covers all spawn sites (3), all cleanup paths (4+), delivery retry, dev.ts shutdown

**Research Findings**:

- 3 spawn sites: `employee-{id[:8]}`, `employee-reply-{id[:8]}`, `employee-delivery-{id[:8]}`
- 4 cleanup steps all call `destroyMachine()` with no local Docker branch: `cleanup-on-failure` (L439), `cleanup-no-approval` (L504), `cleanup-no-action` (L553), `cleanup` (L1597)
- Delivery cleanup (L1284) gates on `!USE_LOCAL_DOCKER` but has zero local Docker cleanup between retry attempts
- Reply-anyway (L770) has zero container cleanup on failure
- `dev.ts` cleanup (L129-143) only kills gateway/inngest/cloudflared child processes
- Deprecated `lifecycle.ts` L470-474 had the correct pattern: `machine.id.startsWith('docker_')` → `docker stop`
- `--rm` flag with `-d`: only fires on normal container exit — not on crashes, stuck containers, or daemon restarts
- Inngest defaults to 4 retries per step — retry with same container name = guaranteed conflict

### Metis Review

**Identified Gaps** (addressed):

- All 4 cleanup steps need fixing (not just 2 initially identified) — confirmed via code inspection
- `docker rm -f` should live inside `runLocalDockerContainer()` — single change covers all 3 spawn sites
- Reply-anyway failure path at L770 has no cleanup — must add
- No existing tests set `USE_LOCAL_DOCKER=1` — entire local Docker path is untested
- Test mock pattern: `vi.hoisted()` + `vi.mock('node:child_process', ...)` is the right approach

---

## Work Objectives

### Core Objective

Eliminate all Docker container leak vectors in local dev by making container start idempotent, all cleanup paths Docker-aware, and dev shutdown comprehensive.

### Concrete Deliverables

- Modified `runLocalDockerContainer()` with `docker rm -f` pre-cleanup (employee-lifecycle.ts:66-89)
- New helper `stopLocalDockerContainer(name: string)` for DRY cleanup logic
- Fixed cleanup steps: `cleanup-on-failure` (L439), `cleanup-no-approval` (L504), `cleanup-no-action` (L553), `cleanup` (L1597)
- Delivery retry loop with local Docker cleanup between attempts (L1284-1293)
- Reply-anyway failure cleanup (after L770)
- `dev.ts` cleanup function extended to stop worker containers (L129-143)
- Test file: `tests/inngest/lifecycle-local-docker.test.ts`
- Test file: `tests/scripts/dev-cleanup.test.ts` (optional — may be QA-only)

### Definition of Done

- [ ] `docker run` never fails with "name already in use" on retry
- [ ] No orphaned worker containers after task completion (success or failure)
- [ ] No orphaned worker containers after `dev.ts` Ctrl+C
- [ ] `pnpm test -- --run` passes (pre-existing failures excluded)

### Must Have

- `docker rm -f` pre-cleanup inside `runLocalDockerContainer()`
- `docker_` prefix branching in ALL 4 cleanup steps
- Local Docker cleanup between delivery retry attempts
- Reply-anyway container cleanup on failure
- `dev.ts` shutdown cleanup for `ai-employee-worker` containers
- Tests covering the local Docker paths

### Must NOT Have (Guardrails)

- DO NOT modify deprecated `lifecycle.ts` — on hold, do not touch
- DO NOT modify the Fly.io path — `createMachine` / `destroyMachine` are not affected
- DO NOT add employee-specific language (e.g., "delivery", "guest") to `runLocalDockerContainer()` — it must remain employee-agnostic
- DO NOT add retry logic inside `runLocalDockerContainer()` — let Inngest handle retries
- DO NOT use `docker kill` instead of `docker stop` in cleanup — `docker stop` sends SIGTERM first (graceful)
- DO NOT change container naming convention — keep `employee-{type}-{taskId[:8]}`
- DO NOT add a Docker cleanup cron/watchdog — the fix should be deterministic, not probabilistic

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest with `vi.mock('node:child_process', ...)`
- **Test mock approach**: Mock `execSync` to verify docker command sequences; mock `destroyMachine` to verify it's NOT called for local Docker

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Container lifecycle**: Use Bash (docker commands) — start containers, verify cleanup, check for orphans
- **Code verification**: Use Bash (grep/ast-grep) — verify patterns exist in code
- **Tests**: Use Bash (`pnpm test`) — run test suite

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Add stopLocalDockerContainer() helper + make runLocalDockerContainer() idempotent [quick]
├── Task 2: Fix all 4 cleanup steps with docker_ prefix branching [quick]
├── Task 3: Fix dev.ts shutdown to stop worker containers [quick]

Wave 2 (After Wave 1 — depends on helper function):
├── Task 4: Fix delivery retry loop with inter-attempt cleanup [quick]
├── Task 5: Add reply-anyway failure cleanup [quick]
├── Task 6: Tests for all local Docker lifecycle paths [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 4 → Task 6 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On    | Blocks     | Wave                                  |
| ---- | ------------- | ---------- | ------------------------------------- |
| 1    | —             | 2, 4, 5, 6 | 1                                     |
| 2    | 1             | 6          | 1 (can start after T1 helper is done) |
| 3    | —             | 6          | 1                                     |
| 4    | 1, 2          | 6          | 2                                     |
| 5    | 1             | 6          | 2                                     |
| 6    | 1, 2, 3, 4, 5 | F1-F4      | 2                                     |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **3** — T4 → `quick`, T5 → `quick`, T6 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `stopLocalDockerContainer()` helper + make `runLocalDockerContainer()` idempotent

  **What to do**:
  - Add a new helper function `stopLocalDockerContainer(name: string)` right after `runLocalDockerContainer()` (after line 89) in `src/inngest/employee-lifecycle.ts`. This function:
    ```typescript
    function stopLocalDockerContainer(name: string): void {
      try {
        execSync(`docker stop ${JSON.stringify(name)} 2>/dev/null || true`, { encoding: 'utf8' });
        execSync(`docker rm -f ${JSON.stringify(name)} 2>/dev/null || true`, { encoding: 'utf8' });
      } catch {
        /* Container may not exist — safe to ignore */
      }
    }
    ```
  - Modify `runLocalDockerContainer()` to call `stopLocalDockerContainer(opts.name)` as its first line, BEFORE `docker run`. This makes every container start idempotent — if a container with the same name exists (running, stopped, or created), it's forcibly removed first.
  - The `|| true` ensures no error is thrown if the container doesn't exist.
  - `docker stop` first sends SIGTERM (graceful shutdown), then `docker rm -f` force-removes. This two-step approach respects SIGTERM handlers in the harness.

  **Must NOT do**:
  - DO NOT add retry logic — just pre-cleanup
  - DO NOT add employee-specific language (no "delivery", "guest", etc.)
  - DO NOT change the function signature or return type
  - DO NOT remove the existing `--rm` flag — it still helps for normal exits

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused change — 2 functions, ~15 lines total
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed for a simple function addition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 2, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/inngest/employee-lifecycle.ts:66-89` — current `runLocalDockerContainer()` function. Add `stopLocalDockerContainer` right after this function and call it as the first line of `runLocalDockerContainer`.
  - `src/inngest/lifecycle.ts:470-477` — deprecated lifecycle's correct cleanup pattern: `machine.id.startsWith('docker_')` → `execSync('docker stop ...')`. This is the reference pattern for the helper.

  **API/Type References**:
  - `child_process.execSync` — already imported at top of file (verify: line 3 `import { execSync, spawn } from 'child_process'`)

  **WHY Each Reference Matters**:
  - `employee-lifecycle.ts:66-89` — this is the exact function you're modifying. Read it to understand the current shape before adding the pre-cleanup call.
  - `lifecycle.ts:470-477` — this shows the proven pattern from the deprecated code. The new helper should follow the same `docker stop` + fallback approach, but factored into a reusable function.

  **Acceptance Criteria**:
  - [ ] `stopLocalDockerContainer(name)` function exists after `runLocalDockerContainer()`
  - [ ] `runLocalDockerContainer()` calls `stopLocalDockerContainer(opts.name)` before `docker run`
  - [ ] Both commands use `|| true` to avoid throwing on non-existent containers
  - [ ] No employee-specific language in either function

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Pre-cleanup prevents name conflict on retry
    Tool: Bash (grep + code inspection)
    Preconditions: Task 1 changes applied to employee-lifecycle.ts
    Steps:
      1. grep -n 'stopLocalDockerContainer' src/inngest/employee-lifecycle.ts — expect function definition AND call inside runLocalDockerContainer
      2. grep -n 'docker rm -f' src/inngest/employee-lifecycle.ts — expect match inside stopLocalDockerContainer
      3. grep -n 'docker stop' src/inngest/employee-lifecycle.ts — expect match inside stopLocalDockerContainer
      4. Verify no employee-specific language: grep -c 'delivery\|guest\|summarizer' on the new function lines — expect 0
    Expected Result: All 4 greps pass with expected counts
    Failure Indicators: Missing function, missing docker commands, employee-specific language found
    Evidence: .sisyphus/evidence/task-1-pre-cleanup-code.txt

  Scenario: Function handles non-existent container gracefully
    Tool: Bash (code inspection)
    Preconditions: Task 1 changes applied
    Steps:
      1. Read the stopLocalDockerContainer function and verify both execSync calls have `|| true` and are wrapped in try/catch
      2. Verify no error is propagated — the catch block is empty or logs a warning
    Expected Result: Function never throws, regardless of container state
    Failure Indicators: Missing try/catch, missing `|| true`, error propagation
    Evidence: .sisyphus/evidence/task-1-graceful-handling.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `fix(lifecycle): make local Docker containers idempotent with pre-cleanup and proper shutdown`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Fix all 4 cleanup steps with `docker_` prefix branching

  **What to do**:
  - Modify ALL 4 cleanup steps in `src/inngest/employee-lifecycle.ts` to branch on `machineId.startsWith('docker_')`:
    1. `cleanup-on-failure` (line 439-447)
    2. `cleanup-no-approval` (line 504-512)
    3. `cleanup-no-action` (line 553-561)
    4. `cleanup` (line 1597-1605)
  - For each, replace the body with:
    ```typescript
    await step.run('cleanup-{name}', async () => {
      try {
        if ((machineId as string).startsWith('docker_')) {
          const containerName = `employee-${taskId.slice(0, 8)}`;
          stopLocalDockerContainer(containerName);
        } else {
          const flyApp =
            process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
          await destroyMachine(flyApp, machineId as string);
        }
      } catch (err) {
        log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
      }
    });
    ```
  - The container name in cleanup is always `employee-${taskId.slice(0, 8)}` because these 4 steps only clean up the PRIMARY execution container (not delivery or reply-anyway). This matches the name constructed at line 344.
  - Uses `stopLocalDockerContainer()` from Task 1.

  **Must NOT do**:
  - DO NOT modify the Fly.io path (the `else` branch) — just wrap it in the `if/else`
  - DO NOT change step names — keep `cleanup-on-failure`, `cleanup-no-approval`, etc.
  - DO NOT add employee-specific language to the cleanup logic
  - DO NOT modify deprecated `lifecycle.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Repetitive pattern applied to 4 locations — same change 4 times
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3, but after Task 1 completes — needs `stopLocalDockerContainer`)
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Tasks 4, 6
  - **Blocked By**: Task 1 (needs `stopLocalDockerContainer` helper)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:439-447` — `cleanup-on-failure` step (current code, needs fix)
  - `src/inngest/employee-lifecycle.ts:504-512` — `cleanup-no-approval` step (current code, needs fix)
  - `src/inngest/employee-lifecycle.ts:553-561` — `cleanup-no-action` step (current code, needs fix)
  - `src/inngest/employee-lifecycle.ts:1597-1605` — `cleanup` step (current code, needs fix)
  - `src/inngest/lifecycle.ts:470-477` — deprecated lifecycle's correct `docker_` branching pattern. THIS IS THE REFERENCE to follow.
  - `src/inngest/employee-lifecycle.ts:344` — primary execution container name: `employee-${taskId.slice(0, 8)}`. This is the name to use in all 4 cleanup steps.

  **WHY Each Reference Matters**:
  - Lines 439, 504, 553, 1597 — the 4 exact locations to modify. Read current code to understand the wrapping pattern.
  - `lifecycle.ts:470-477` — the proven pattern to replicate: check `machineId.startsWith('docker_')` then branch.
  - Line 344 — confirms the container name convention for the primary execution container.

  **Acceptance Criteria**:
  - [ ] All 4 cleanup steps have `if ((machineId as string).startsWith('docker_'))` branching
  - [ ] Docker branch calls `stopLocalDockerContainer()` with correct container name
  - [ ] Fly.io branch still calls `destroyMachine()` (unchanged logic)
  - [ ] All 4 steps still have try/catch wrapping
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 cleanup steps have docker_ branching
    Tool: Bash (grep)
    Preconditions: Task 2 changes applied
    Steps:
      1. grep -n "startsWith('docker_')" src/inngest/employee-lifecycle.ts — expect exactly 4 matches (one per cleanup step)
      2. grep -n 'stopLocalDockerContainer' src/inngest/employee-lifecycle.ts — expect at least 5 matches (1 definition + 1 call in runLocalDockerContainer + 4 in cleanup steps)
      3. grep -n 'destroyMachine' src/inngest/employee-lifecycle.ts — expect matches still present (Fly.io path preserved)
    Expected Result: 4 docker_ branches, 5+ stopLocalDockerContainer calls, destroyMachine still present
    Failure Indicators: Missing branches, fewer than expected calls
    Evidence: .sisyphus/evidence/task-2-cleanup-branches.txt

  Scenario: Build still passes
    Tool: Bash
    Preconditions: Tasks 1 and 2 applied
    Steps:
      1. Run `pnpm build` — expect exit code 0
    Expected Result: Clean build, no TypeScript errors
    Failure Indicators: Type errors, missing imports
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `fix(lifecycle): make local Docker containers idempotent with pre-cleanup and proper shutdown`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Fix `dev.ts` shutdown to stop worker containers

  **What to do**:
  - Modify the `cleanup()` function in `scripts/dev.ts` (lines 129-143) to stop all `ai-employee-worker` containers before killing child processes:

    ```typescript
    async function cleanup(): Promise<void> {
      if (cleaningUp) return;
      cleaningUp = true;
      log('');
      log('Shutting down services...');

      // Stop any running worker containers spawned by lifecycle steps
      try {
        const { execSync } = await import('child_process');
        const containers = execSync(
          'docker ps --filter ancestor=ai-employee-worker:latest --format "{{.Names}}" 2>/dev/null || true',
          { encoding: 'utf8' },
        ).trim();
        if (containers) {
          log(`Stopping worker containers: ${containers.replace(/\n/g, ', ')}`);
          execSync(`docker stop ${containers.replace(/\n/g, ' ')} 2>/dev/null || true`, {
            encoding: 'utf8',
          });
        }
      } catch {
        /* Docker may not be available — ignore */
      }

      for (const child of children) {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((r) => setTimeout(r, 1000));
      log('Shutdown complete.');
      process.exit(0);
    }
    ```

  - This catches worker containers that leaked from any lifecycle step — not just the current task.
  - Uses `--filter ancestor=ai-employee-worker:latest` to only target AI employee worker containers, not other Docker containers.

  **Must NOT do**:
  - DO NOT kill non-worker containers (use `--filter`)
  - DO NOT add a general-purpose Docker cleanup — only worker containers
  - DO NOT change the existing SIGTERM/SIGINT handler registration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function modification in scripts/dev.ts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `scripts/dev.ts:129-143` — current `cleanup()` function. This is the exact function to modify.
  - `scripts/dev.ts:146-151` — signal handlers (SIGINT, SIGTERM). Do NOT modify these.
  - `scripts/verify-e2e.ts:190` — uses `docker ps --filter ancestor=ai-employee-worker` pattern. This confirms the correct filter syntax.

  **WHY Each Reference Matters**:
  - `dev.ts:129-143` — read to understand current cleanup shape and where to insert Docker cleanup
  - `verify-e2e.ts:190` — confirms the exact `--filter` syntax for targeting worker containers

  **Acceptance Criteria**:
  - [ ] `cleanup()` function in `dev.ts` includes Docker container stop logic
  - [ ] Uses `--filter ancestor=ai-employee-worker:latest` to target only worker containers
  - [ ] Docker cleanup runs BEFORE child process SIGTERM (so containers are stopped before Inngest shuts down)
  - [ ] Failure in Docker cleanup doesn't prevent rest of shutdown (try/catch)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: dev.ts cleanup includes Docker worker stop
    Tool: Bash (grep)
    Preconditions: Task 3 changes applied
    Steps:
      1. grep -n 'ai-employee-worker' scripts/dev.ts — expect match inside cleanup function
      2. grep -n 'docker stop' scripts/dev.ts — expect match
      3. grep -n 'docker ps' scripts/dev.ts — expect match with --filter
    Expected Result: All 3 patterns present in dev.ts
    Failure Indicators: Missing patterns
    Evidence: .sisyphus/evidence/task-3-dev-cleanup.txt

  Scenario: Docker cleanup failure doesn't block shutdown
    Tool: Bash (code inspection)
    Preconditions: Task 3 changes applied
    Steps:
      1. Read the Docker cleanup block in dev.ts and verify it's wrapped in try/catch
      2. Verify the catch block doesn't re-throw
    Expected Result: Docker cleanup is fully contained — any error is swallowed
    Failure Indicators: Missing try/catch, error propagation
    Evidence: .sisyphus/evidence/task-3-error-handling.txt
  ```

  **Commit**: YES
  - Message: `fix(dev): stop orphaned worker containers on shutdown`
  - Files: `scripts/dev.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Fix delivery retry loop with inter-attempt cleanup

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, modify the delivery retry loop (lines 1225-1299) to:
    1. **Stop the previous container before each retry attempt** (not the first attempt). Add this at the beginning of the loop body, AFTER the first iteration:

    ```typescript
    for (let attempt = 0; attempt < 3; attempt++) {
      // Clean up previous attempt's container (if any) before starting new one
      if (attempt > 0 && process.env.USE_LOCAL_DOCKER === '1') {
        stopLocalDockerContainer(`employee-delivery-${taskId.slice(0, 8)}`);
      }

      let deliveryMachine: { id: string };
      // ... rest of existing code ...
    ```

    2. **Also add local Docker cleanup AFTER the delivery poll loop completes** (alongside the existing Fly.io cleanup at L1284). Modify:

    ```typescript
    // Existing code (L1284-1293):
    if (process.env.USE_LOCAL_DOCKER !== '1') {
      try {
        await destroyMachine(deliveryFlyApp, deliveryMachine.id);
      } catch (err) { ... }
    }

    // ADD this else branch:
    if (process.env.USE_LOCAL_DOCKER !== '1') {
      try {
        await destroyMachine(deliveryFlyApp, deliveryMachine.id);
      } catch (err) { ... }
    } else {
      stopLocalDockerContainer(`employee-delivery-${taskId.slice(0, 8)}`);
    }
    ```

  - This ensures: (a) each retry starts clean, (b) the container is stopped after each attempt's poll completes.
  - The `stopLocalDockerContainer()` from Task 1 handles the case where the container doesn't exist.

  **Must NOT do**:
  - DO NOT change the number of retry attempts (keep 3)
  - DO NOT change the poll interval or max polls
  - DO NOT modify the Fly.io path
  - DO NOT change the container name pattern

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, targeted change in one loop
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2 (after Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2 (needs `stopLocalDockerContainer` + cleanup branching pattern)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1225-1299` — the delivery retry loop. Read the FULL loop to understand the flow before modifying.
  - `src/inngest/employee-lifecycle.ts:1227-1246` — local Docker branch of container spawn inside the loop
  - `src/inngest/employee-lifecycle.ts:1284-1293` — existing Fly.io-only cleanup inside the loop. This is where to add the `else` branch for local Docker.
  - `src/inngest/employee-lifecycle.ts:1297-1299` — retry logic at end of loop (attempt < 2 check, re-patch status)

  **WHY Each Reference Matters**:
  - Lines 1225-1299 — full loop context. Must understand the flow to place cleanup correctly.
  - Lines 1284-1293 — the exact location for adding the `else` branch.
  - Lines 1297-1299 — shows what happens between attempts. Pre-cleanup goes at loop top.

  **Acceptance Criteria**:
  - [ ] `stopLocalDockerContainer()` called at start of retry loop for `attempt > 0`
  - [ ] `else` branch added at L1284 for local Docker cleanup after each attempt's poll
  - [ ] Fly.io path unchanged
  - [ ] Container name matches spawn name: `employee-delivery-${taskId.slice(0, 8)}`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Delivery retry loop has inter-attempt cleanup
    Tool: Bash (code inspection)
    Preconditions: Task 4 changes applied
    Steps:
      1. Read src/inngest/employee-lifecycle.ts around the delivery retry loop (search for "for (let attempt = 0; attempt < 3")
      2. Verify stopLocalDockerContainer is called with `employee-delivery-${taskId.slice(0, 8)}` when attempt > 0
      3. Verify the post-poll cleanup has an `else` branch calling stopLocalDockerContainer for local Docker
      4. Verify the Fly.io path (destroyMachine) is unchanged in the `if` branch
    Expected Result: Inter-attempt cleanup present, post-poll cleanup for local Docker present, Fly.io path unchanged
    Failure Indicators: Missing cleanup calls, wrong container name, modified Fly.io path
    Evidence: .sisyphus/evidence/task-4-delivery-retry.txt

  Scenario: Container name matches spawn name
    Tool: Bash (grep)
    Preconditions: Task 4 changes applied
    Steps:
      1. grep -n 'employee-delivery-' src/inngest/employee-lifecycle.ts — expect all instances use same pattern
      2. Count unique patterns — expect exactly 1 unique pattern (all match)
    Expected Result: All container name references consistent
    Failure Indicators: Mismatched names
    Evidence: .sisyphus/evidence/task-4-name-consistency.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `fix(lifecycle): make local Docker containers idempotent with pre-cleanup and proper shutdown`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Add reply-anyway failure cleanup

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, after the reply-anyway poll check (around line 770), add container cleanup when `replyDraftStatus === 'Failed'`:
    ```typescript
    if (replyDraftStatus === 'Failed') {
      // Add cleanup for the reply-anyway container
      if (process.env.USE_LOCAL_DOCKER === '1') {
        stopLocalDockerContainer(`employee-reply-${taskId.slice(0, 8)}`);
      }
      // ... rest of existing failure handling code ...
    ```
  - Also add cleanup on the SUCCESS path — after the reply-anyway poll succeeds, the reply-anyway container should be stopped. Look for where `replyDraftStatus === 'Submitting'` is handled (the happy path after the poll) and add:
    ```typescript
    // After reply-anyway poll succeeds, clean up the container
    if (process.env.USE_LOCAL_DOCKER === '1') {
      stopLocalDockerContainer(`employee-reply-${taskId.slice(0, 8)}`);
    }
    ```
  - The container name `employee-reply-${taskId.slice(0, 8)}` matches the spawn at line 713.

  **Must NOT do**:
  - DO NOT change the reply-anyway Slack notification logic
  - DO NOT modify the Fly.io path for reply-anyway (if one exists)
  - DO NOT change the poll interval or timeout

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding cleanup calls at 2 locations in existing code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2 (after Task 1)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (needs `stopLocalDockerContainer`)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:710-730` — reply-anyway container spawn. Container name: `employee-reply-${taskId.slice(0, 8)}` (line 713)
  - `src/inngest/employee-lifecycle.ts:750-768` — reply-anyway poll loop
  - `src/inngest/employee-lifecycle.ts:770-800` — reply-anyway failure path. This is where to add cleanup on failure.
  - `src/inngest/employee-lifecycle.ts` — search for where `replyDraftStatus` is checked after the poll. Find the success path to add cleanup there too.

  **WHY Each Reference Matters**:
  - Line 713 — confirms the container name to use in cleanup
  - Lines 770-800 — the failure path where cleanup must be added
  - Success path — cleanup also needed here (container may still be running even after success)

  **Acceptance Criteria**:
  - [ ] `stopLocalDockerContainer('employee-reply-${taskId.slice(0, 8)}')` called on failure path
  - [ ] `stopLocalDockerContainer('employee-reply-${taskId.slice(0, 8)}')` called on success path
  - [ ] Both calls gated on `process.env.USE_LOCAL_DOCKER === '1'`
  - [ ] Container name matches spawn name at line 713

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Reply-anyway container cleanup on both paths
    Tool: Bash (grep + code inspection)
    Preconditions: Task 5 changes applied
    Steps:
      1. grep -n 'employee-reply-' src/inngest/employee-lifecycle.ts — expect at least 3 matches (1 spawn + 2 cleanup)
      2. Read the code around line 770 (failure path) — verify stopLocalDockerContainer call exists
      3. Find the success path after reply-anyway poll — verify stopLocalDockerContainer call exists
    Expected Result: Cleanup present on both success and failure paths
    Failure Indicators: Missing cleanup on either path
    Evidence: .sisyphus/evidence/task-5-reply-cleanup.txt

  Scenario: Cleanup gated on USE_LOCAL_DOCKER
    Tool: Bash (code inspection)
    Preconditions: Task 5 changes applied
    Steps:
      1. Read both cleanup call sites — verify each is wrapped in `if (process.env.USE_LOCAL_DOCKER === '1')`
    Expected Result: Both calls properly gated
    Failure Indicators: Missing gate, cleanup runs unconditionally
    Evidence: .sisyphus/evidence/task-5-docker-gate.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 4)
  - Message: `fix(lifecycle): make local Docker containers idempotent with pre-cleanup and proper shutdown`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Tests for all local Docker lifecycle paths

  **What to do**:
  - Create `tests/inngest/lifecycle-local-docker.test.ts` with tests covering:
    1. **`runLocalDockerContainer` calls `stopLocalDockerContainer` before `docker run`** — mock `execSync`, verify call sequence: `docker stop`, `docker rm -f`, then `docker run -d --rm`
    2. **`stopLocalDockerContainer` handles non-existent container** — mock `execSync` to throw, verify no error propagated
    3. **Cleanup steps branch on `docker_` prefix** — for each of the 4 cleanup steps, verify:
       - When `machineId.startsWith('docker_')` → `stopLocalDockerContainer` called, `destroyMachine` NOT called
       - When `machineId` doesn't start with `docker_` → `destroyMachine` called, `stopLocalDockerContainer` NOT called
    4. **Delivery retry loop stops previous container** — verify `stopLocalDockerContainer` called between attempts
    5. **Reply-anyway cleanup on failure and success** — verify `stopLocalDockerContainer` called with correct container name
  - Use `vi.hoisted()` + `vi.mock('node:child_process', ...)` pattern to mock `execSync`
  - Use `vi.mock('../lib/fly-client.js', ...)` to mock `destroyMachine`
  - Set `process.env.USE_LOCAL_DOCKER = '1'` in test setup
  - Follow the test pattern in `tests/inngest/lifecycle-notify-msg-ts.test.ts` (created in previous plan) for mocking the lifecycle function

  **Must NOT do**:
  - DO NOT test the Fly.io path — it's unchanged and has its own tests
  - DO NOT write integration tests that actually run Docker — keep it unit-level with mocks
  - DO NOT modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test scenarios covering branching logic, mock setup complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential — must wait for all implementation tasks)
  - **Parallel Group**: Wave 2 (after Tasks 1-5 complete)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-notify-msg-ts.test.ts` — most recent lifecycle test file. Follow this exact pattern for test structure, mock setup, and assertions.
  - `tests/workers/opencode-harness-delivery.test.ts` — shows how to mock `child_process` functions with `vi.hoisted()` + `vi.mock()`. This is the reference for mocking `execSync`.
  - `src/inngest/employee-lifecycle.ts:66-89` — `runLocalDockerContainer` function (under test)
  - `src/inngest/employee-lifecycle.ts:439-447` — `cleanup-on-failure` step (under test)

  **Test References**:
  - `tests/inngest/lifecycle-notify-msg-ts.test.ts` — shows how to import and test lifecycle internals, mock Inngest step functions
  - `tests/workers/opencode-harness-delivery.test.ts` — shows `vi.hoisted()` + `vi.mock('node:child_process', ...)` pattern

  **WHY Each Reference Matters**:
  - `lifecycle-notify-msg-ts.test.ts` — provides the template for testing lifecycle code with proper mock setup
  - `opencode-harness-delivery.test.ts` — provides the template for mocking `execSync` specifically

  **Acceptance Criteria**:
  - [ ] Test file `tests/inngest/lifecycle-local-docker.test.ts` exists
  - [ ] Tests cover: idempotent start, graceful non-existent container, cleanup branching (4 steps), delivery retry cleanup, reply-anyway cleanup
  - [ ] All tests pass: `pnpm test -- --run tests/inngest/lifecycle-local-docker.test.ts`
  - [ ] Full test suite passes: `pnpm test -- --run` (pre-existing failures excluded)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All local Docker lifecycle tests pass
    Tool: Bash
    Preconditions: All Tasks 1-5 implemented, Task 6 test file created
    Steps:
      1. Run `pnpm test -- --run tests/inngest/lifecycle-local-docker.test.ts`
      2. Verify exit code 0
      3. Count total tests — expect at least 8 (idempotent start + graceful error + 4 cleanup branches + delivery retry + reply-anyway)
    Expected Result: All tests pass, 8+ tests
    Failure Indicators: Test failures, fewer than 8 tests
    Evidence: .sisyphus/evidence/task-6-test-results.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run `pnpm test -- --run`
      2. Compare pass count to baseline (~1593 passing)
      3. Verify no NEW failures (pre-existing 39 failures allowed)
    Expected Result: Pass count >= 1593 + new tests, no new failures
    Failure Indicators: New test failures, significantly lower pass count
    Evidence: .sisyphus/evidence/task-6-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(lifecycle): add local Docker container lifecycle tests`
  - Files: `tests/inngest/lifecycle-local-docker.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Notify completion

  **What to do**:
  - Send Telegram notification: plan `docker-container-lifecycle-fix` complete, all tasks done, come back to review results.
  - Command: `tsx scripts/telegram-notify.ts "✅ docker-container-lifecycle-fix complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: F1-F4 (runs after final wave)

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches (except Docker cleanup which intentionally swallows), console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Verify: (a) `runLocalDockerContainer` can be called twice with same name without error (pre-cleanup works), (b) cleanup steps call `docker stop` for local Docker (grep for pattern), (c) `dev.ts` cleanup function includes Docker cleanup logic, (d) delivery retry loop uses per-attempt names or stops between attempts, (e) reply-anyway failure path has cleanup. Run `pnpm test -- --run` to verify no regressions.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: deprecated lifecycle.ts untouched, Fly.io path untouched, no employee-specific language in shared function. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit                                                                                         | Files                                                 | Pre-commit           |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------- |
| `fix(lifecycle): make local Docker containers idempotent with pre-cleanup and proper shutdown` | `src/inngest/employee-lifecycle.ts`, `scripts/dev.ts` | `pnpm test -- --run` |
| `test(lifecycle): add local Docker container lifecycle tests`                                  | `tests/inngest/lifecycle-local-docker.test.ts`        | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                    # Expected: all pass (pre-existing failures excluded)
pnpm build                            # Expected: no errors
grep -n 'stopLocalDockerContainer' src/inngest/employee-lifecycle.ts  # Expected: multiple matches
grep -n 'docker_' src/inngest/employee-lifecycle.ts                   # Expected: matches in all cleanup steps
grep -n 'docker stop' src/inngest/employee-lifecycle.ts               # Expected: matches (via helper)
grep -n 'docker rm -f' src/inngest/employee-lifecycle.ts              # Expected: match in runLocalDockerContainer
grep -n 'ai-employee-worker' scripts/dev.ts                           # Expected: match in cleanup function
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] No orphaned containers after any lifecycle path
