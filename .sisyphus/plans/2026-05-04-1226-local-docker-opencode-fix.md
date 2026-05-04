# Fix OpenCode Server Exit in Local Docker

## TL;DR

> **Quick Summary**: Fix the OpenCode server premature exit (code 0 at ~11s) that prevents the local Docker worker from completing tasks. Root cause is a race condition between stdout detection and process exit events, compounded by OpenCode's idle server shutdown behavior.
>
> **Deliverables**:
>
> - OpenCode server stays alive long enough for session creation + prompt execution
> - Task `f35843e2` completes end-to-end using local Docker
> - Slack approval card posted to `C0AMGJQN05S`
>
> **Estimated Effort**: Short (2-4 hours including Docker rebuilds)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (diagnostic) → Task 2 (fix race) → Task 3 (rebuild + verify) → Task 4 (E2E) → F1-F4

---

## Context

### Original Request

Get the VLRE guest-messaging AI employee working end-to-end locally via Docker. The OpenCode server inside the Docker container exits with code 0 approximately 11 seconds after starting, before the session can complete its work.

### Interview Summary

**Key Discussions**:

- `dev-start.ts` already sets `USE_LOCAL_DOCKER=1` programmatically — previous retries WERE using local Docker
- OpenCode version is pinned to 1.14.31 (1.14.33 has known 6s exit regression)
- TCP keepalive + SSE keepalive mechanism was added but may not prevent exit
- The harness throws "Failed to start OpenCode server" when `startOpencodeServer()` returns `null`

**Research Findings**:

- `OPENCODE_IDLE_TIMEOUT` controls Instance disposal, NOT server lifetime
- SSE `/event` endpoint closes after ~7s (OpenCode issue #15149)
- The `exit` handler in `opencode-server.ts` calls `resolveOnce(null)` unconditionally — this can race with the stdout "listening" detection
- Fly.io uses the same code/version/entrypoint (`node /app/dist/workers/opencode-harness.mjs`)
- The Docker image was rebuilt May 4 at 17:13 UTC (Build 7)

### Metis Review

**Identified Gaps** (addressed):

- **Stdout/exit race condition**: The `exit` handler calls `resolveOnce(null)` even after "listening" was detected — this is the primary bug
- **Missing diagnostic step**: Need to confirm which exact error message appears before applying fix
- **Image staleness risk**: Must verify the built image contains the latest `opencode-server.ts` code
- **Pre-warm ARM64 risk**: SQLite pre-warm may fail silently on Apple Silicon Docker builds

---

## Work Objectives

### Core Objective

Fix the race condition in `opencode-server.ts` where the `exit` event can resolve the startup promise with `null` even after "listening" was successfully detected, then verify end-to-end execution locally.

### Concrete Deliverables

- Fixed `src/workers/lib/opencode-server.ts` — `listeningDetected` guard preventing null resolution after successful startup
- Rebuilt Docker image `ai-employee-worker:latest` with the fix compiled
- Task `f35843e2` reaching `Submitting` or `Done` status via local Docker execution

### Definition of Done

- [ ] `docker logs` shows "TCP keepalive connected" AND "OpenCode session created" with no "Failed to start" error
- [ ] Task status reaches `Submitting` or later (not `Failed`)
- [ ] Container stays alive for the full session duration (not exiting at ~11s)

### Must Have

- Fix the stdout/exit race condition in `opencode-server.ts`
- Docker image rebuild with compiled fix
- End-to-end task execution verification

### Must NOT Have (Guardrails)

- Do NOT change `OPENCODE_IDLE_TIMEOUT` — it controls workspace disposal, not server lifetime
- Do NOT modify the Fly.io dispatch path (lines 319–338 in `employee-lifecycle.ts`)
- Do NOT touch `entrypoint.sh` — only used by deprecated engineering worker
- Do NOT upgrade OpenCode version (1.14.33 is known-broken)
- Do NOT modify `session-manager.ts` monitor logic (it's correct; problem is upstream)
- Do NOT modify `.env` — `dev-start.ts` already sets `USE_LOCAL_DOCKER=1`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO — this is a runtime infrastructure fix, not unit-testable logic
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Docker container**: Use Bash (docker run/logs) — Run container, capture logs, assert expected output
- **API/Backend**: Use Bash (curl) — Query task status, assert progression

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — diagnostic + fix):
├── Task 1: Diagnostic — capture exact failure logs [quick]
├── Task 2: Fix opencode-server.ts race condition [quick]
└── Task 3: (Optional) Add pre-warm verification to Dockerfile [quick]

Wave 2 (After Wave 1 — rebuild + E2E):
├── Task 4: Rebuild Docker image + direct container test [quick]
└── Task 5: Full E2E — trigger task and verify completion [deep]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On                | Blocks |
| ----- | ------------------------- | ------ |
| 1     | None                      | 2, 4   |
| 2     | 1 (to confirm error type) | 4      |
| 3     | None                      | 4      |
| 4     | 2, 3                      | 5      |
| 5     | 4                         | F1-F4  |
| F1-F4 | 5                         | Done   |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 2 tasks — T4 → `quick`, T5 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Diagnostic — Capture exact failure logs and confirm error path

  **What to do**:
  - Run `docker inspect ai-employee-worker:latest --format '{{.Created}}'` — confirm the image was built AFTER the last `opencode-server.ts` modification
  - Run `git log --oneline -1 src/workers/lib/opencode-server.ts` — compare timestamps
  - Check for the most recent container: `docker ps -a --filter name=employee --format '{{.ID}} {{.Status}}' | head -5`
  - Get logs from the last failed container: `docker logs $(docker ps -alq --filter name=employee) 2>&1 | head -80`
  - Determine which error path was hit:
    - `"Failed to start OpenCode server"` → `startOpencodeServer()` returned `null` (race condition)
    - `"opencode serve exited before producing output"` → server started but exited during session
  - Check if "listening" appeared in the logs
  - Check if "TCP keepalive connected" appeared in the logs
  - Record findings for Task 2

  **Must NOT do**:
  - Do NOT modify any files in this task — diagnostic only
  - Do NOT rebuild the Docker image yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple diagnostic commands — no code changes
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — pure shell diagnostics

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (runs first)
  - **Blocks**: Tasks 2, 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/opencode-server.ts:160-164` — The `exit` handler that calls `resolveOnce(null)` — this is where the race condition lives
  - `src/workers/lib/opencode-server.ts:140-150` — The stdout "listening" detection that calls `resolveOnce(handle)`
  - `src/workers/opencode-harness.mts:185-186` — Where "Failed to start OpenCode server" is thrown (when handle is null)
  - `src/workers/opencode-harness.mts:257-273` — Where "opencode serve exited before producing output" is thrown (when onExit wins the race)

  **Acceptance Criteria**:
  - [ ] Clear determination of which error path was hit (null return vs early exit)
  - [ ] Image timestamp vs code timestamp comparison documented
  - [ ] Container logs captured and stored

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Capture diagnostic information from last failed run
    Tool: Bash
    Preconditions: Docker is running, previous container exists in `docker ps -a`
    Steps:
      1. Run `docker inspect ai-employee-worker:latest --format '{{.Created}}'`
      2. Run `git log --oneline -1 -- src/workers/lib/opencode-server.ts`
      3. Run `docker ps -a --filter name=employee --format '{{.ID}} {{.Names}} {{.Status}}' | head -5`
      4. Run `docker logs $(docker ps -alq --filter name=employee) 2>&1 > /tmp/last-container-logs.txt 2>&1`
      5. Run `grep -E "(Failed to start|exited before|listening|TCP keepalive|session created)" /tmp/last-container-logs.txt`
    Expected Result: At least one error pattern identified; image timestamp and code timestamp captured
    Failure Indicators: No container found (docker ps empty), no logs available
    Evidence: .sisyphus/evidence/task-1-diagnostic-logs.txt
  ```

  **Commit**: NO

- [x] 2. Fix the race condition in opencode-server.ts

  **What to do**:
  - Add a `listeningDetected` boolean flag to `startOpencodeServer()` in `src/workers/lib/opencode-server.ts`
  - In the stdout handler (line 140), set `listeningDetected = true` BEFORE calling `resolveOnce(handle)`
  - In the exit handler (line 160-164), only call `resolveOnce(null)` if `!listeningDetected`
  - This prevents the race where: stdout emits "listening" → exit fires → `resolveOnce(null)` overwrites the pending handle resolution

  Additionally, add robustness to the keepalive startup:
  - Move `startKeepaliveOnce()` call to happen IMMEDIATELY when "listening" is detected (already the case — confirm)
  - Add a 200ms delay between detecting "listening" and resolving the promise — give the TCP keepalive time to connect before the harness starts creating sessions

  The fix should look like:

  ```typescript
  let listeningDetected = false;

  // In stdout handler:
  if (text.includes('listening')) {
    listeningDetected = true;
    startKeepaliveOnce();
    // Small delay to let keepalive establish before returning handle
    setTimeout(() => {
      const handle: OpencodeServerHandle = { ... };
      resolveOnce(handle);
    }, 200);
  }

  // In exit handler:
  childProcess.on('exit', (code) => {
    log.warn(`[opencode-server] opencode serve exited with code ${code}`);
    onExitResolve(code);
    if (!listeningDetected) {
      resolveOnce(null);
    }
  });
  ```

  **Must NOT do**:
  - Do NOT change `OPENCODE_IDLE_TIMEOUT`
  - Do NOT modify session-manager.ts
  - Do NOT modify the Fly.io dispatch path in employee-lifecycle.ts
  - Do NOT change the keepalive reconnect logic (it's already aggressive enough at 50ms)
  - Do NOT remove the timeout guard (line 180-188)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file, focused fix — add one boolean flag + modify two code blocks
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — straightforward TypeScript edit

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Task 1 diagnostic results to confirm approach)
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/workers/lib/opencode-server.ts:43` — `let resolved = false;` — existing flag pattern to follow
  - `src/workers/lib/opencode-server.ts:48-53` — `resolveOnce()` function — the mechanism we're guarding
  - `src/workers/lib/opencode-server.ts:134-151` — stdout handler with "listening" detection
  - `src/workers/lib/opencode-server.ts:160-164` — exit handler that must be guarded

  **API/Type References**:
  - `src/workers/lib/opencode-server.ts:7-13` — `OpencodeServerHandle` interface — what gets returned on success

  **Acceptance Criteria**:
  - [ ] `listeningDetected` flag added and set before `resolveOnce(handle)`
  - [ ] Exit handler guarded: `if (!listeningDetected) resolveOnce(null)`
  - [ ] 200ms delay added between "listening" detection and handle resolution
  - [ ] `pnpm lint` passes with no new errors
  - [ ] `tsc --noEmit` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Lint and type-check pass after fix
    Tool: Bash
    Preconditions: Code changes applied to src/workers/lib/opencode-server.ts
    Steps:
      1. Run `pnpm lint -- --no-error-on-unmatched-pattern src/workers/lib/opencode-server.ts`
      2. Run `npx tsc --noEmit`
    Expected Result: Both commands exit with code 0, no new errors
    Failure Indicators: Exit code non-zero, TypeScript errors in opencode-server.ts
    Evidence: .sisyphus/evidence/task-2-lint-typecheck.txt

  Scenario: Verify the race condition fix logic is correct
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run `grep -n "listeningDetected" src/workers/lib/opencode-server.ts`
      2. Verify flag is declared as `let listeningDetected = false`
      3. Verify flag is set to `true` inside the stdout "listening" detection block
      4. Verify the exit handler contains `if (!listeningDetected)` guard
      5. Verify setTimeout delay exists (200ms) before resolveOnce(handle)
    Expected Result: All 4 code assertions pass — flag declared, set, guarded, delay present
    Failure Indicators: Missing flag, missing guard, missing delay
    Evidence: .sisyphus/evidence/task-2-code-verification.txt
  ```

  **Commit**: YES
  - Message: `fix(worker): prevent race condition in opencode server startup detection`
  - Files: `src/workers/lib/opencode-server.ts`
  - Pre-commit: `pnpm lint`

- [x] 3. Add pre-warm verification to Dockerfile (if diagnostic shows DB issue) — SKIPPED: pre-warm is working, server starts OK

  **What to do**:
  - This task is CONDITIONAL — only execute if Task 1's diagnostic reveals the pre-warm step failed (no "listening" in logs AND no SQLite DB in the image)
  - If needed, add a verification step after the pre-warm in the Dockerfile:
    ```dockerfile
    RUN ls -la ~/.local/share/opencode/opencode.db || (echo "PRE-WARM FAILED: no SQLite DB" && exit 1)
    ```
  - Also add `--platform linux/arm64` to the build command documentation if running on Apple Silicon
  - If Task 1 shows the pre-warm succeeded (i.e., "listening" DID appear in container logs), SKIP this task entirely

  **Must NOT do**:
  - Do NOT change the OpenCode version
  - Do NOT modify the pre-warm logic itself (it's correct)
  - Do NOT add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line addition to Dockerfile (or skip entirely)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4
  - **Blocked By**: Task 1 (to determine if needed)

  **References**:

  **Pattern References**:
  - `Dockerfile:55-66` — The pre-warm step that runs `opencode serve` during build and checkpoints the WAL

  **Acceptance Criteria**:
  - [ ] Either: verification line added to Dockerfile AND build succeeds
  - [ ] Or: Task explicitly skipped with documented reason (pre-warm is working fine)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify pre-warm DB exists in image (if task is not skipped)
    Tool: Bash
    Preconditions: Dockerfile modification applied
    Steps:
      1. Run `docker build -t ai-employee-worker:latest .` (in tmux, long-running)
      2. After build completes, run `docker run --rm ai-employee-worker:latest ls -la /root/.local/share/opencode/opencode.db`
    Expected Result: File exists with size > 0
    Failure Indicators: Build fails at verification step; file not found
    Evidence: .sisyphus/evidence/task-3-prewarm-verify.txt

  Scenario: Skip task (if pre-warm is fine)
    Tool: Bash
    Preconditions: Task 1 showed "listening" appeared in container logs
    Steps:
      1. Document: "Pre-warm is working. Task 3 skipped."
    Expected Result: Task marked as completed with skip reason
    Evidence: .sisyphus/evidence/task-3-skipped.txt
  ```

  **Commit**: YES (if applied) | NO (if skipped)
  - Message: `fix(docker): add pre-warm verification step`
  - Files: `Dockerfile`
  - Pre-commit: N/A

- [x] 4. Rebuild Docker image and run direct container test

  **What to do**:
  - Rebuild the Docker image: `docker build -t ai-employee-worker:latest .` (use tmux — takes 3-5 min)
  - After build completes, run a direct container test WITHOUT a real task (just verify OpenCode starts and stays alive):
    ```bash
    docker run --rm --add-host=host.docker.internal:host-gateway \
      -e TASK_ID=test-harness-verification \
      -e SUPABASE_URL=http://host.docker.internal:54331 \
      -e SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzY3OTM0MjgsImV4cCI6MjA5MjE1MzQyOH0.AV3qUQYBeohpMUMXSL4Tm9wJsXtL6MKfGqJJab3Gr4I \
      -e OPENROUTER_API_KEY=$OPENROUTER_API_KEY \
      ai-employee-worker:latest node /app/dist/workers/opencode-harness.mjs
    ```
  - The container WILL fail because `test-harness-verification` is not a real task ID — but the key verification is:
    - Does "listening" appear in logs? (OpenCode server started)
    - Does "TCP keepalive connected" appear? (keepalive working)
    - Does the container stay alive for > 15 seconds? (no premature exit)
    - Does it NOT show "Failed to start OpenCode server"?
  - If the container exits with "Failed to start OpenCode server" → the fix didn't work → investigate further
  - If it exits with a PostgREST error (task not found) → SUCCESS — the server started but the task lookup failed (expected with fake ID)

  **Must NOT do**:
  - Do NOT push the image to Fly.io registry
  - Do NOT modify any source files in this task
  - Do NOT use `--no-cache` unless the build fails (wastes time)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Docker build + verify — no code changes, just build and check
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (first)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:296-316` — How the lifecycle runs local Docker (same flags we use here)
  - `Dockerfile:108-110` — CMD and WORKDIR configuration

  **Acceptance Criteria**:
  - [ ] Docker build succeeds without errors
  - [ ] Container logs show "listening" (OpenCode server started)
  - [ ] Container logs show "TCP keepalive connected" (keepalive active)
  - [ ] Container does NOT show "Failed to start OpenCode server"
  - [ ] Container stays alive for > 15 seconds (not the ~11s premature exit)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker image builds successfully
    Tool: Bash (tmux)
    Preconditions: Task 2 changes committed, Docker daemon running
    Steps:
      1. Kill any existing ai-build tmux session
      2. Start tmux: `tmux new-session -d -s ai-build -x 220 -y 50`
      3. Send: `docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build8.log; echo EXIT_CODE:$? >> /tmp/ai-build8.log`
      4. Poll `/tmp/ai-build8.log` every 30s until EXIT_CODE appears
      5. Assert EXIT_CODE:0
    Expected Result: Build exits with code 0, image tagged `ai-employee-worker:latest`
    Failure Indicators: Non-zero exit code, pre-warm timeout, npm install failure
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: Container starts without premature server exit
    Tool: Bash
    Preconditions: Docker image built successfully
    Steps:
      1. Run container with fake TASK_ID: `timeout 30 docker run --rm --add-host=host.docker.internal:host-gateway -e TASK_ID=test-verify -e SUPABASE_URL=http://host.docker.internal:54331 -e SUPABASE_SECRET_KEY=<key> -e OPENROUTER_API_KEY=<key> ai-employee-worker:latest node /app/dist/workers/opencode-harness.mjs 2>&1 | tee /tmp/container-test.log`
      2. Check: `grep "listening" /tmp/container-test.log` — must be present
      3. Check: `grep "TCP keepalive connected" /tmp/container-test.log` — must be present
      4. Check: `grep "Failed to start OpenCode server" /tmp/container-test.log` — must NOT be present
      5. If container exits before 15s with "Failed to start" → FAIL
      6. If container exits with PostgREST/task-not-found error → PASS (server started OK, task lookup failed expectedly)
    Expected Result: "listening" + "TCP keepalive" present, no "Failed to start" error
    Failure Indicators: "Failed to start OpenCode server" in logs, exit before 15s without any successful server messages
    Evidence: .sisyphus/evidence/task-4-container-test.txt

  Scenario: No premature exit (negative test)
    Tool: Bash
    Preconditions: Container is running
    Steps:
      1. Time how long the container stays alive: check timestamps between "listening" and exit
      2. If exit happens within 11 seconds of "listening" → FAIL (old bug still present)
      3. If exit happens after 15+ seconds OR due to task-lookup failure → PASS
    Expected Result: Container alive for >15s after "listening", or exits due to expected non-server error
    Failure Indicators: Exit within 11s of "listening" with code 0
    Evidence: .sisyphus/evidence/task-4-timing.txt
  ```

  **Commit**: NO (no code changes)

- [x] 5. Full E2E — Trigger task and verify end-to-end completion

  **What to do**:
  - Reset task `f35843e2-67f8-447e-9222-c3f6a47d058f` to `Ready`:
    ```sql
    UPDATE tasks SET status='Ready', failure_reason=NULL, updated_at=NOW()
    WHERE id='f35843e2-67f8-447e-9222-c3f6a47d058f';
    ```
    Execute via: `curl -X PATCH "http://localhost:54331/rest/v1/tasks?id=eq.f35843e2-67f8-447e-9222-c3f6a47d058f" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" -H "Content-Type: application/json" -d '{"status":"Ready","failure_reason":null}'`
  - Ensure the gateway is running via `pnpm dev:start` (it sets `USE_LOCAL_DOCKER=1`)
  - Fire the dispatch event:
    ```bash
    curl -s -X POST "http://localhost:8288/e/local" \
      -H "Content-Type: application/json" \
      -d '{"name":"employee/task.dispatched","data":{"taskId":"f35843e2-67f8-447e-9222-c3f6a47d058f","archetypeId":"00000000-0000-0000-0000-000000000015"},"id":"retry-f35843e2-v12"}'
    ```
  - Monitor container logs: `docker logs -f $(docker ps -lq --filter name=employee)` in tmux
  - Poll task status every 30s for up to 30 minutes:
    ```bash
    curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
      "http://localhost:54331/rest/v1/tasks?id=eq.f35843e2-67f8-447e-9222-c3f6a47d058f&select=status"
    ```
  - Expected progression: `Ready` → `Executing` → `Submitting` → `Reviewing`
  - If task reaches `Submitting` → SUCCESS (the OpenCode session completed and produced output)
  - If task reaches `Failed` → check container logs, determine new failure point

  **Must NOT do**:
  - Do NOT modify the task's archetype or instructions
  - Do NOT change the dispatch event structure
  - Do NOT restart the gateway during the test
  - Do NOT trigger a new task — reuse the existing `f35843e2`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Long-running monitoring task (up to 30 min), needs to handle container logs + status polling + potential debugging
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:296-316` — Local Docker dispatch code
  - `src/inngest/employee-lifecycle.ts:342-356` — Poll completion loop (120 polls × 15s = 30 min max)
  - `src/workers/opencode-harness.mts:163-306` — Full session flow
  - `AGENTS.md` — Admin API trigger endpoint documentation

  **API/Type References**:
  - `src/workers/opencode-harness.mts:46` — PostgREST client for task status
  - Task ID: `f35843e2-67f8-447e-9222-c3f6a47d058f`
  - Archetype ID: `00000000-0000-0000-0000-000000000015`
  - VLRE Tenant ID: `00000000-0000-0000-0000-000000000003`

  **Acceptance Criteria**:
  - [ ] Task status reaches `Submitting` (or later: `Reviewing`, `Done`)
  - [ ] Container logs show full flow: "listening" → "session created" → "Prompt injected" → "session completed"
  - [ ] `/tmp/summary.txt` or `/tmp/approval-message.json` produced by the worker
  - [ ] Slack approval card posted to channel `C0AMGJQN05S`
  - [ ] No "Failed to start OpenCode server" or "opencode serve exited before producing output" errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Task progresses from Ready to Submitting
    Tool: Bash (tmux for monitoring, curl for polling)
    Preconditions: Task reset to Ready, gateway running with USE_LOCAL_DOCKER=1, Docker image rebuilt
    Steps:
      1. Reset task: PATCH via PostgREST to status=Ready, failure_reason=null
      2. Fire dispatch event to Inngest (retry-f35843e2-v12)
      3. Wait 10s, check `docker ps --filter name=employee` — container should be running
      4. Stream container logs to /tmp/employee-f35843e2-v12.log
      5. Poll task status every 30s via PostgREST
      6. Assert: within 30 minutes, status transitions to "Submitting" or "Reviewing" or "Done"
    Expected Result: Task reaches Submitting within 30 minutes; container logs show full session flow
    Failure Indicators: Task reaches "Failed"; container exits with "Failed to start"; no container spawned
    Evidence: .sisyphus/evidence/task-5-e2e-status.txt, .sisyphus/evidence/task-5-container-logs.txt

  Scenario: Slack approval card posted (if task reaches Submitting)
    Tool: Bash (curl to Slack API)
    Preconditions: Task reached Submitting status
    Steps:
      1. Check task metadata for `approval_message_ts` field
      2. Or check Slack channel C0AMGJQN05S for a recent message from the bot with approval buttons
      3. Verify message contains the task summary and Approve/Reject buttons
    Expected Result: Approval card visible in Slack channel with correct task context
    Failure Indicators: No message in channel; message missing buttons; wrong channel
    Evidence: .sisyphus/evidence/task-5-slack-card.txt

  Scenario: Container stays alive for full session (no premature exit)
    Tool: Bash
    Preconditions: Container is running
    Steps:
      1. Check container uptime: `docker inspect $(docker ps -lq --filter name=employee) --format '{{.State.StartedAt}}'`
      2. Wait 60s
      3. Verify container is still running: `docker ps --filter name=employee --format '{{.Status}}'`
      4. If container exited → check exit code and last 20 log lines
    Expected Result: Container still running after 60s
    Failure Indicators: Container exited within 60s; exit code 0 with no output
    Evidence: .sisyphus/evidence/task-5-container-uptime.txt
  ```

  **Commit**: NO (no code changes — this is verification only)

- [x] 6. Notify completion

  **What to do**:
  - Send Telegram notification: plan `local-docker-opencode-fix` complete, all tasks done, come back to review results.
  - Run: `tsx scripts/telegram-notify.ts "✅ local-docker-opencode-fix complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: F1-F4 + user okay

  **Acceptance Criteria**:
  - [ ] Telegram message sent successfully

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "✅ local-docker-opencode-fix complete — All tasks done. Come back to review results."`
    Expected Result: Exit code 0, message delivered
    Evidence: .sisyphus/evidence/task-6-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + `pnpm lint`. Review `src/workers/lib/opencode-server.ts` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Verify the race condition fix is correct and doesn't introduce new bugs.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start fresh: rebuild Docker image, run container directly with test env vars, capture logs for 60+ seconds. Verify: "listening" appears, "TCP keepalive connected" appears, no premature exit. Then trigger full E2E task and verify Slack approval card is posted.
      Output: `Container Alive [PASS/FAIL] | Session Created [PASS/FAIL] | Task Status [status] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      `git diff` all changes vs plan spec. Verify: ONLY `opencode-server.ts` was modified (possibly Dockerfile). No changes to Fly.io path, no changes to session-manager.ts, no env var modifications, no version changes. Flag any unaccounted changes.
      Output: `Files Changed [list] | Scope Violations [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Group         | Message                                                                    | Files                                | Pre-commit                                    |
| ------------- | -------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------- |
| 1             | `fix(worker): prevent race condition in opencode server startup detection` | `src/workers/lib/opencode-server.ts` | `pnpm lint`                                   |
| 2 (if needed) | `fix(docker): add pre-warm verification step`                              | `Dockerfile`                         | `docker build -t ai-employee-worker:latest .` |

---

## Success Criteria

### Verification Commands

```bash
# Container stays alive (no exit within 60s)
docker run --rm --add-host=host.docker.internal:host-gateway \
  -e TASK_ID=test -e SUPABASE_URL=http://host.docker.internal:54331 \
  -e SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY \
  -e OPENROUTER_API_KEY=$OPENROUTER_API_KEY \
  ai-employee-worker:latest node /app/dist/workers/opencode-harness.mjs \
  2>&1 | timeout 60 tee /tmp/harness-test.log

# Check key log lines
grep "TCP keepalive connected" /tmp/harness-test.log  # Expected: present
grep "OpenCode session created" /tmp/harness-test.log  # Expected: present (or fails on missing TASK_ID, which is fine for this test)
grep "Failed to start OpenCode server" /tmp/harness-test.log  # Expected: NOT present

# Full E2E verification
curl -s -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "http://localhost:54331/rest/v1/tasks?id=eq.f35843e2-67f8-447e-9222-c3f6a47d058f&select=status"
# Expected: {"status": "Submitting"} or {"status": "Done"}
```

### Final Checklist

- [ ] OpenCode server stays alive for full session duration
- [ ] No "Failed to start" errors in container logs
- [ ] Task reaches `Submitting` status
- [ ] Slack approval card posted
- [ ] No changes to Fly.io code path
- [ ] No OpenCode version changes
