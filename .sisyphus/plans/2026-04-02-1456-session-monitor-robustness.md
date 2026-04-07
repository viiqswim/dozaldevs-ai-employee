# Session Monitor Robustness — Handle All Task Durations

## TL;DR

> **Quick Summary**: Fix the session monitoring pipeline so it handles tasks of ANY duration — from 3-second trivial edits to 4-hour complex features — without hanging, timing out prematurely, or losing error signals.
>
> **Deliverables**:
>
> - Fixed `session-manager.ts` — deferred idle check (no more permanent hangs on fast tasks)
> - Fixed `session-manager.ts` — `session.error` event handling (no more silent error swallowing)
> - Fixed `orchestrate.mts` — configurable timeout via `ORCHESTRATE_TIMEOUT_MINS` env var
> - Comprehensive test coverage for all new paths + regression
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (SDK validation) → T2 (deferred idle fix + tests) → T3 (error handling + tests) → T4 (timeout config) → T5 (regression) → F1–F4

---

## Context

### Original Request

User ran a trivial task ("add hello to README") that completed in 3 seconds. The worker container got stuck at "Executing" for 20 minutes and timed out. User wants the system to work for ANY task duration — from 3 seconds to 4 hours.

### Interview Summary

**Key Discussions**:

- Root cause traced to `monitorViaSSE()` in `session-manager.ts` lines 67-73
- The `minElapsedMs` guard (30s default) silently discards early idle events
- Since the SSE stream is infinite and no more events fire after idle, the monitor hangs forever
- The guard exists to prevent premature completion during micro-idle gaps between tool calls — its intent is correct, its implementation is wrong

**Research Findings (3 parallel explore agents)**:

- OpenCode SDK has 32 SSE event types; `session.error` exists but is not handled
- Polling fallback has same guard but self-heals (re-evaluates every 10s) — however polling only starts when SSE FAILS
- Fix loop also calls `monitorSession()` — same bug applies during fix iterations
- Watchdog would rescue after 10-20 min delay — but that's too slow
- Test coverage: fast completion, SSE fallback, and error handling are all untested

### Metis Review

**Identified Gaps (addressed)**:

- Deferred timer must use `minElapsedMs - elapsed` (not a fixed value)
- Timer must be cleaned up if outer timeout fires first (prevent dangling callbacks)
- Must guard against multiple deferred timers from repeated early idle events
- `session.error` handler must resolve the promise, not just log
- `ORCHESTRATE_TIMEOUT_MINS` should scope to orchestrate.mts code-gen only (not fix-loop)
- All 3 call sites of `monitorSession()` must be considered
- `client.session.status()` API behavior on completed sessions needs validation

---

## Work Objectives

### Core Objective

Make `monitorSession()` reliably detect session completion for ALL task durations, handle errors from the SSE stream, and allow configurable timeouts for long-running tasks.

### Concrete Deliverables

- `src/workers/lib/session-manager.ts` — deferred idle check + error event handler
- `src/workers/orchestrate.mts` — configurable timeout via env var
- `.env.example` — document `ORCHESTRATE_TIMEOUT_MINS`
- `tests/workers/lib/session-manager.test.ts` — 5+ new test cases
- `tests/workers/orchestrate.test.ts` — 2+ new test cases

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 new failures
- [ ] `pnpm build` compiles cleanly
- [ ] Fast task scenario tested: session idles at 3s, monitor completes by 31s (not 60min)
- [ ] Error scenario tested: `session.error` event → monitor returns `{ completed: false, reason: 'error' }`
- [ ] Timeout scenario tested: `ORCHESTRATE_TIMEOUT_MINS=2` overrides 60min default
- [ ] All existing session-manager tests still pass

### Must Have

- Deferred idle check that fires at exactly `minElapsedMs - elapsed` after an early idle event
- `settled` flag prevents double-resolution of the promise
- Deferred timer stored and cleaned up in outer timeout handler
- Guard against multiple deferred timers (only one pending at a time)
- `session.error` SSE events handled — resolve with `{ completed: false, reason: 'error' }`
- `ORCHESTRATE_TIMEOUT_MINS` env var (default 60, used in orchestrate.mts line 222)
- Tests for: fast completion, error handling, configurable timeout, deferred timer cleanup
- All 515+ existing tests still passing

### Must NOT Have (Guardrails)

- **Do NOT touch the polling fallback logic** — it self-heals and is not broken
- **Do NOT make `minElapsedMs` configurable via env var** — separate concern, separate PR
- **Do NOT apply `ORCHESTRATE_TIMEOUT_MINS` to fix-loop timeouts** — only code-gen in orchestrate.mts
- **Do NOT refactor SSE event handling architecture** — surgical addition of error handler only
- **Do NOT handle all 32 SSE event types** — only add `session.error`
- **Do NOT change the `monitorSession()` public API signature** — `MonitorOptions` interface stays stable
- **Do NOT change fix-loop.ts** — it calls `monitorSession()` which will inherit the fix
- **Do NOT change watchdog.ts or heartbeat.ts** — out of scope

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest, 515+ tests)
- **Automated tests**: YES (TDD — write failing tests first, then implement)
- **Framework**: vitest with `vi.useFakeTimers()` for timer-dependent tests

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Code changes**: Use Bash (`pnpm test -- --run`) — run targeted test file, then full suite
- **TypeScript**: Use Bash (`pnpm build`) — verify no compile errors
- **Regression**: Run full `pnpm test -- --run` after each commit

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Validate SDK assumptions (session.error shape, client.session.status() on idle sessions) [quick]
├── Task 2: Implement deferred idle check + tests (TDD) [deep]

Wave 2 (After Wave 1 — depends on T1 for error shape, T2 for pattern):
├── Task 3: Implement session.error handler + tests (TDD) [quick]
├── Task 4: Add ORCHESTRATE_TIMEOUT_MINS env var + tests [quick]
├── Task 5: Full regression run + cleanup [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T2 → T3 → T5 → F1-F4 → user okay
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | T2, T3 | 1    |
| T2   | T1         | T3, T5 | 1    |
| T3   | T1, T2     | T5     | 2    |
| T4   | —          | T5     | 2    |
| T5   | T2, T3, T4 | F1–F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `deep`
- **Wave 2**: **3** — T3 → `quick`, T4 → `quick`, T5 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Validate SDK assumptions before writing code

  **What to do**:
  - Read `@opencode-ai/sdk` type definitions to confirm the exact shape of `session.error` events
  - Verify that `client.session.status()` returns a reliable idle status for a completed (but not deleted) session
  - Confirm how the existing `for await...of` SSE loop breaks when the outer promise settles (the `settled` flag + `if (settled) break` at line 65)
  - Record all findings to `.sisyphus/evidence/task-1-sdk-validation.txt`

  **Must NOT do**:
  - Do NOT modify any source files
  - Do NOT install or update packages

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read-only investigation of SDK types
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 2, 3 (need confirmed event shape)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — All event type definitions (3380 lines)
  - `node_modules/@opencode-ai/sdk/dist/gen/core/serverSentEvents.gen.d.ts` — Stream behavior
  - `src/workers/lib/session-manager.ts:62-87` — Current SSE loop and `settled` break pattern

  **WHY Each Reference Matters**:
  - The `session.error` event properties must be known BEFORE writing the handler
  - The `client.session.status()` return shape must be confirmed for the deferred verification call
  - The `settled` flag pattern must be understood to ensure the deferred timer can safely resolve

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SDK validation findings documented
    Tool: Bash
    Preconditions: SDK types are in node_modules
    Steps:
      1. Read node_modules/@opencode-ai/sdk types for session.error event shape
      2. Read types for client.session.status() return value
      3. Document exact TypeScript types for both
      4. Write findings to .sisyphus/evidence/task-1-sdk-validation.txt
    Expected Result: Evidence file contains exact type definitions for session.error and session.status()
    Failure Indicators: Missing or incomplete type information
    Evidence: .sisyphus/evidence/task-1-sdk-validation.txt
  ```

  **Commit**: NO (read-only investigation)

- [x] 2. Implement deferred idle check + TDD tests

  **What to do**:
  This is the CORE FIX. Implement the "deferred idle check" in `monitorViaSSE()` so that when `session.idle` fires before `minElapsedMs`, the monitor schedules a verification instead of silently discarding the event.

  **Step 1: Write failing tests FIRST** in `tests/workers/lib/session-manager.test.ts`:

  Test A: "fast completion — session idles before minElapsedMs, deferred check verifies still idle":
  - Mock SSE stream: emit `session.idle` at time 0 (before minElapsedMs)
  - Mock `client.session.status()` to return `{ [sessionId]: { type: 'idle' } }`
  - Advance fake timers by `minElapsedMs`
  - Assert: `monitorSession()` resolves `{ completed: true, reason: 'idle' }`

  Test B: "fast completion — session idles but resumes before deferred check":
  - Mock SSE stream: emit `session.idle` at time 0, then emit `session.status { type: 'busy' }` at time 5s
  - Mock `client.session.status()` to return `{ [sessionId]: { type: 'busy' } }`
  - Advance fake timers by `minElapsedMs`
  - Assert: deferred check finds busy → does NOT resolve → SSE continues listening
  - Then emit another `session.idle` after minElapsedMs has elapsed
  - Assert: NOW resolves `{ completed: true, reason: 'idle' }`

  Test C: "deferred timer cleaned up on outer timeout":
  - Mock SSE stream: emit `session.idle` at time 0 (schedules deferred timer for 30s)
  - Advance fake timers by `timeoutMs` (past the outer timeout)
  - Assert: resolves `{ completed: false, reason: 'timeout' }` — NOT the deferred check
  - Assert: no dangling timer callbacks fire after resolution

  Test D: "multiple early idle events — only one deferred timer":
  - Mock SSE stream: emit 3 `session.idle` events before minElapsedMs
  - Assert: only 1 deferred timer scheduled (not 3)

  **Step 2: Implement the fix** in `src/workers/lib/session-manager.ts`:

  In `monitorViaSSE()`, modify lines 67-85 (both idle event handlers):

  ```typescript
  // Add state at the top of monitorViaSSE():
  let deferredCheckHandle: ReturnType<typeof setTimeout> | null = null;

  // Modify the settle() function to clean up deferred timer:
  const settle = (result: SessionMonitorResult): void => {
    if (settled) return;
    settled = true;
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (deferredCheckHandle !== null) {
      clearTimeout(deferredCheckHandle);
      deferredCheckHandle = null;
    }
    resolve(result);
  };

  // Replace the silent discard with deferred check:
  if (event.type === 'session.idle' && event.properties.sessionID === sessionId) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= minElapsedMs) {
      settle({ completed: true, reason: 'idle' });
      return;
    }
    // Schedule deferred verification (only if not already pending)
    if (deferredCheckHandle === null) {
      const remainingMs = minElapsedMs - elapsed;
      log.info(
        `[session-manager] Early idle detected at ${elapsed}ms, scheduling deferred check in ${remainingMs}ms`,
      );
      deferredCheckHandle = setTimeout(() => {
        deferredCheckHandle = null;
        if (settled) return;
        void (async () => {
          try {
            const statusResponse = await client.session.status();
            const statusMap = statusResponse.data;
            if (!settled && statusMap && statusMap[sessionId]?.type === 'idle') {
              settle({ completed: true, reason: 'idle' });
            }
            // If busy, session resumed — SSE will catch next idle naturally
          } catch {
            // API call failed — SSE still active, will catch next idle or timeout
          }
        })();
      }, remainingMs);
    }
  }
  ```

  Apply the same pattern to the `session.status` handler (lines 75-85) — same logic, reuse the `deferredCheckHandle`.

  **Must NOT do**:
  - Do NOT change the polling fallback logic (lines 117-144)
  - Do NOT change `minElapsedMs` default value (30000)
  - Do NOT change the `MonitorOptions` interface
  - Do NOT change `startPolling()` at all
  - Do NOT add any new dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD workflow with complex async timer logic, requires careful reasoning about race conditions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1 — but should read T1 evidence first if available)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 5 (pattern established here)
  - **Blocked By**: Task 1 (needs confirmed `client.session.status()` return type)

  **References**:

  **Pattern References**:
  - `src/workers/lib/session-manager.ts:37-148` — The `monitorViaSSE()` function to modify
  - `src/workers/lib/session-manager.ts:44-56` — Existing `settle()` pattern — extend with deferred timer cleanup
  - `src/workers/lib/session-manager.ts:117-144` — Polling fallback — DO NOT TOUCH, but reference its `client.session.status()` API call pattern
  - `tests/workers/lib/session-manager.test.ts:230-290` — Existing `monitorSession` test group — add new tests here

  **API/Type References**:
  - `.sisyphus/evidence/task-1-sdk-validation.txt` — Confirmed types from Task 1
  - `src/workers/lib/session-manager.ts:126-134` — Existing `client.session.status()` usage in polling (reference for API shape)

  **WHY Each Reference Matters**:
  - The `settle()` pattern on lines 44-56 is the established cleanup mechanism — extend it, don't replace it
  - The polling code at lines 126-134 shows exactly how to call `client.session.status()` and interpret the result — copy this pattern for the deferred check
  - Existing tests at lines 230-290 show the mock patterns (fake timers, mock SSE stream, mock client) — follow them

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All session-manager tests pass (existing + new)
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/session-manager.test.ts
      2. Assert: all tests pass, 0 failures
      3. Count new test cases containing "deferred" — expect >= 3
    Expected Result: All tests pass, 3+ new deferred tests present
    Failure Indicators: Any test failure, or fewer than 3 new tests
    Evidence: .sisyphus/evidence/task-2-tests-pass.txt

  Scenario: Build still compiles
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Run: pnpm build 2>&1 | tail -5
      2. Assert: exit 0, no TypeScript errors
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-2-build-clean.txt

  Scenario: Fast completion no longer hangs (verified by test)
    Tool: Bash
    Preconditions: New test exists
    Steps:
      1. grep "deferred" tests/workers/lib/session-manager.test.ts
      2. Assert: test for fast-idle-then-deferred-check exists and passes
    Expected Result: Test exists and passes
    Evidence: .sisyphus/evidence/task-2-fast-completion.txt
  ```

  **Commit**: YES
  - Message: `fix(workers): add deferred idle check for fast-completing sessions`
  - Files: `src/workers/lib/session-manager.ts`, `tests/workers/lib/session-manager.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/session-manager.test.ts` → PASS

- [x] 3. Implement session.error event handler + TDD tests

  **What to do**:
  Add handling for `session.error` SSE events in `monitorViaSSE()`. Currently these events are silently ignored, meaning if OpenCode encounters a provider auth error, API error, or output length error, the monitor keeps waiting forever.

  **Step 1: Write failing tests FIRST**:

  Test A: "session.error event resolves monitor with error reason":
  - Mock SSE stream: emit `session.error` event with matching sessionID
  - Assert: `monitorSession()` resolves `{ completed: false, reason: 'error' }`

  Test B: "session.error event for different session is ignored":
  - Mock SSE stream: emit `session.error` with different sessionID
  - Assert: monitor does NOT resolve from this event

  **Step 2: Implement** in `monitorViaSSE()`:

  Add a new event handler inside `runStreamOnce()` (after the existing idle handlers):

  ```typescript
  if (event.type === 'session.error' && event.properties.sessionID === sessionId) {
    const errorInfo = event.properties.error;
    log.error(`[session-manager] Session ${sessionId} error: ${JSON.stringify(errorInfo)}`);
    settle({ completed: false, reason: 'error' });
    return;
  }
  ```

  **Step 3: Update orchestrate.mts** to handle `reason: 'error'`:
  After `monitorResult` check (line 224), the existing code handles `!monitorResult.completed` — the error case will naturally be caught here since `completed: false`. Add a log line to distinguish error from timeout:

  ```typescript
  if (!monitorResult.completed) {
    const reason = monitorResult.reason === 'error' ? 'session error' : 'timeout';
    log.error(`[orchestrate] Session failed during code generation: ${reason}`);
    // ... existing cleanup ...
  }
  ```

  **Must NOT do**:
  - Do NOT handle all 32 SSE event types — only `session.error`
  - Do NOT add error handling to the polling fallback path
  - Do NOT change the `SessionMonitorResult` interface — `reason: 'error'` is already in the union type

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small addition — one new event handler, two tests, one log line
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5 (regression)
  - **Blocked By**: Tasks 1, 2 (needs T1 for event shape, T2 for pattern)

  **References**:

  **Pattern References**:
  - `src/workers/lib/session-manager.ts:67-85` — Existing event handlers to follow the pattern of
  - `src/workers/orchestrate.mts:224-229` — Existing `!monitorResult.completed` handling
  - `tests/workers/lib/session-manager.test.ts` — Existing mock SSE stream pattern for events

  **API/Type References**:
  - `.sisyphus/evidence/task-1-sdk-validation.txt` — Confirmed `session.error` event shape
  - `src/workers/lib/session-manager.ts:6-9` — `SessionMonitorResult` interface (already has `'error'` in reason union)

  **WHY Each Reference Matters**:
  - The existing idle handlers show exactly how to match event type and sessionID — copy the pattern
  - `SessionMonitorResult` already includes `'error'` as a valid reason — no interface change needed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: session.error tests pass
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/session-manager.test.ts
      2. Assert: all tests pass including new error handling tests
      3. grep "session.error" tests/workers/lib/session-manager.test.ts — expect >= 1 test
    Expected Result: All pass, error tests present
    Evidence: .sisyphus/evidence/task-3-error-tests.txt

  Scenario: orchestrate.mts handles error reason
    Tool: Bash
    Preconditions: orchestrate.mts updated
    Steps:
      1. grep "session error" src/workers/orchestrate.mts — expect >= 1
      2. pnpm build → exit 0
    Expected Result: Error handling added, builds clean
    Evidence: .sisyphus/evidence/task-3-orchestrate-error.txt
  ```

  **Commit**: YES
  - Message: `fix(workers): handle session.error SSE events in monitor`
  - Files: `src/workers/lib/session-manager.ts`, `tests/workers/lib/session-manager.test.ts`, `src/workers/orchestrate.mts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/session-manager.test.ts` → PASS

- [x] 4. Add ORCHESTRATE_TIMEOUT_MINS env var + tests

  **What to do**:
  Make the code-generation timeout in `orchestrate.mts` configurable via environment variable, allowing operators to extend it for complex tasks that need more than 60 minutes.

  **Step 1: Modify `orchestrate.mts`** (line 222):

  Current:

  ```typescript
  const monitorResult = await sessionManager.monitorSession(sessionId, {
    timeoutMs: 60 * 60 * 1000, // 60 minutes for code generation
  });
  ```

  Replace with:

  ```typescript
  const codeGenTimeoutMins = parseInt(process.env.ORCHESTRATE_TIMEOUT_MINS ?? '60', 10);
  const monitorResult = await sessionManager.monitorSession(sessionId, {
    timeoutMs: codeGenTimeoutMins * 60 * 1000,
  });
  ```

  **Step 2: Update `.env.example`**:
  Add this line in the appropriate section (near other optional worker config):

  ```
  # ORCHESTRATE_TIMEOUT_MINS=60  # Code generation timeout in minutes (default: 60)
  ```

  **Step 3: Add test** in `tests/workers/orchestrate.test.ts`:
  - Test: "ORCHESTRATE_TIMEOUT_MINS overrides default timeout"
  - Set `process.env.ORCHESTRATE_TIMEOUT_MINS = '120'`
  - Verify `monitorSession` is called with `timeoutMs: 120 * 60 * 1000`
  - Clean up env var in afterEach

  **Must NOT do**:
  - Do NOT apply this env var to fix-loop timeouts in fix-loop.ts
  - Do NOT add complex validation (NaN handling beyond parseInt is fine)
  - Do NOT add the env var to AGENTS.md (it's an operator config, not an agent concern)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: One line change + env var + one test
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5 (regression)
  - **Blocked By**: None (independent of T1/T2)

  **References**:

  **Pattern References**:
  - `src/workers/orchestrate.mts:221-223` — The exact line to modify
  - `src/workers/orchestrate.mts:157` — Existing `process.env.OPENROUTER_MODEL ?? 'minimax/minimax-m2.7'` pattern for env var with default
  - `.env.example` — Where to add the documentation line
  - `tests/workers/orchestrate.test.ts` — Existing test patterns

  **WHY Each Reference Matters**:
  - Line 221-223 is the exact location — minimal change, maximum impact
  - The existing env var pattern on line 157 shows the project's convention for optional env vars with defaults

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Env var documented
    Tool: Bash
    Preconditions: .env.example updated
    Steps:
      1. grep -c "ORCHESTRATE_TIMEOUT_MINS" .env.example → expect >= 1
    Expected Result: Env var documented
    Evidence: .sisyphus/evidence/task-4-env-documented.txt

  Scenario: Env var used in orchestrate.mts
    Tool: Bash
    Preconditions: orchestrate.mts updated
    Steps:
      1. grep -c "ORCHESTRATE_TIMEOUT_MINS" src/workers/orchestrate.mts → expect >= 1
      2. pnpm build → exit 0
    Expected Result: Env var used and builds clean
    Evidence: .sisyphus/evidence/task-4-env-used.txt

  Scenario: Test verifies env var override
    Tool: Bash
    Preconditions: Test written
    Steps:
      1. pnpm test -- --run tests/workers/orchestrate.test.ts → all pass
      2. grep "ORCHESTRATE_TIMEOUT_MINS" tests/workers/orchestrate.test.ts → expect >= 1
    Expected Result: Override test exists and passes
    Evidence: .sisyphus/evidence/task-4-test-pass.txt
  ```

  **Commit**: YES
  - Message: `feat(workers): add ORCHESTRATE_TIMEOUT_MINS env var`
  - Files: `src/workers/orchestrate.mts`, `tests/workers/orchestrate.test.ts`, `.env.example`
  - Pre-commit: `pnpm test -- --run tests/workers/orchestrate.test.ts` → PASS

- [x] 5. Full regression run + cleanup

  **What to do**:
  - Run the complete test suite: `pnpm test -- --run`
  - Run the build: `pnpm build`
  - Run lint: `pnpm lint`
  - Verify no regressions from the changes in T2, T3, T4
  - If any test failures, investigate and fix (should be 0 given TDD approach)
  - Record evidence

  **Must NOT do**:
  - Do NOT fix pre-existing test failures (container-boot, inngest-serve)
  - Do NOT modify files that weren't changed in T2-T4
  - Do NOT skip the lint check

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run commands, capture output, no code changes expected
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, after T2, T3, T4)
  - **Blocks**: F1–F4 (verification)
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `package.json` scripts — `test`, `build`, `lint` commands
  - `vitest.config.ts` — Test configuration

  **WHY Each Reference Matters**:
  - Must run the same commands CI would run to ensure no regressions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
         Use 300-second timeout. Note: lifecycle tests may spawn Docker containers.
         If tests hang on lifecycle, run with: pnpm test -- --run --exclude="**/lifecycle.test.ts"
      2. Capture total passing count
      3. Verify count >= 515 (plus new tests)
    Expected Result: 515+ tests pass, 0 new failures
    Failure Indicators: Count < 515 or new failures not in known list
    Evidence: .sisyphus/evidence/task-5-regression.txt

  Scenario: Build and lint pass
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. pnpm build → exit 0
      2. pnpm lint → exit 0
    Expected Result: Both pass
    Evidence: .sisyphus/evidence/task-5-build-lint.txt

  Scenario: Guardrail files untouched
    Tool: Bash
    Preconditions: All commits made
    Steps:
      1. git diff --stat HEAD~4..HEAD -- src/workers/lib/fix-loop.ts → expect empty
      2. git diff --stat HEAD~4..HEAD -- src/inngest/watchdog.ts → expect empty
      3. git diff --stat HEAD~4..HEAD -- src/workers/lib/heartbeat.ts → expect empty
    Expected Result: All 3 show 0 changes
    Evidence: .sisyphus/evidence/task-5-guardrails.txt
  ```

  **Commit**: NO (verification only — no file changes unless regression fix needed)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read files, run grep). For each "Must NOT Have": search codebase for forbidden changes — reject if polling fallback was modified, if fix-loop.ts was changed, or if watchdog.ts was touched. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` and `pnpm build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, missing timer cleanup. Check that deferred timer is stored and cleared. Check `settled` flag is checked before every `settle()` call.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Code [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Run the specific test files: `pnpm test -- --run tests/workers/lib/session-manager.test.ts` and `pnpm test -- --run tests/workers/orchestrate.test.ts`. Verify new tests exist for: fast completion, session.error, configurable timeout, timer cleanup. Capture test names and pass/fail status.
      Output: `New Tests [N found] | All Pass [Y/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Run `git diff --stat` from the starting commit. Verify ONLY these files were changed: `session-manager.ts`, `session-manager.test.ts`, `orchestrate.mts`, `orchestrate.test.ts`, `.env.example`. Reject if `fix-loop.ts`, `watchdog.ts`, `heartbeat.ts`, `validation-pipeline.ts`, or any other file was modified.
      Output: `Files [N/N expected] | Scope [CLEAN/N violations] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                              | Files                                                                              | Pre-commit check                                                      |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1      | `fix(workers): add deferred idle check for fast-completing sessions` | `src/workers/lib/session-manager.ts`, `tests/workers/lib/session-manager.test.ts`  | `pnpm test -- --run tests/workers/lib/session-manager.test.ts` → PASS |
| 2      | `fix(workers): handle session.error SSE events in monitor`           | `src/workers/lib/session-manager.ts`, `tests/workers/lib/session-manager.test.ts`  | `pnpm test -- --run tests/workers/lib/session-manager.test.ts` → PASS |
| 3      | `feat(workers): add ORCHESTRATE_TIMEOUT_MINS env var`                | `src/workers/orchestrate.mts`, `tests/workers/orchestrate.test.ts`, `.env.example` | `pnpm test -- --run tests/workers/orchestrate.test.ts` → PASS         |
| 4      | `test(workers): verify full regression suite passes`                 | — (no file changes, verification only)                                             | `pnpm test -- --run` → 515+ passing                                   |

---

## Success Criteria

### Verification Commands

```bash
# Targeted tests pass
pnpm test -- --run tests/workers/lib/session-manager.test.ts    # Expected: all pass
pnpm test -- --run tests/workers/orchestrate.test.ts             # Expected: all pass

# Build clean
pnpm build                                                       # Expected: exit 0

# Full regression
pnpm test -- --run                                               # Expected: 515+ pass

# New test cases exist
grep -c "deferred" tests/workers/lib/session-manager.test.ts     # Expected: >= 1
grep -c "session.error" tests/workers/lib/session-manager.test.ts # Expected: >= 1
grep -c "ORCHESTRATE_TIMEOUT_MINS" tests/workers/orchestrate.test.ts # Expected: >= 1

# Env var documented
grep -c "ORCHESTRATE_TIMEOUT_MINS" .env.example                  # Expected: >= 1

# Guardrails held
git diff --stat HEAD~4..HEAD -- src/workers/lib/fix-loop.ts      # Expected: 0 changes
git diff --stat HEAD~4..HEAD -- src/inngest/watchdog.ts           # Expected: 0 changes
git diff --stat HEAD~4..HEAD -- src/workers/lib/heartbeat.ts      # Expected: 0 changes
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (515+)
- [ ] Fast task no longer hangs
- [ ] Error events detected and reported
- [ ] Long task timeout configurable
