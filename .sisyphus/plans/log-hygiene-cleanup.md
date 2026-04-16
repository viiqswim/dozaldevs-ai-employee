# Log Hygiene Cleanup (Post-E2E Polish)

## TL;DR

> **Quick Summary**: Fix two log pollution issues uncovered during a successful Papi Chulo E2E: (1) `destroyMachine` treats HTTP 200 as an error, (2) Slack Bolt's Socket Mode emits noisy `"pong/ping wasn't received"` WARN messages that drown out real signals.
>
> **Deliverables**:
>
> - `src/lib/fly-client.ts` — `destroyMachine` accepts any 2xx status (+ 404) as success
> - `src/gateway/slack-logger.ts` — NEW: custom Bolt `Logger` that demotes pong/ping timeout warnings to debug
> - `src/gateway/server.ts` — wire the custom logger into `new App({...})`
> - Unit tests (Vitest) for both fixes
>
> **Estimated Effort**: Quick (~20–30 min)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 ∥ Task 2 → Task 3 (final verification)

---

## Context

### Original Request

After the successful Papi Chulo E2E (cron → Fly.io → Slack summary → user Approve → posted → task Done), the user asked how to handle three polish items:

1. Fly.io destroy warnings logged as errors
2. Socket Mode pong heartbeat warnings
3. Inngest dev server restart noise

User confirmed:

- **Items 1 & 2 in scope** — "both"
- **Item 3 out of scope** — session artifact, not a real fix target (confirmed by Prometheus, not contested)
- **Priority**: Now — polish before moving on

### Interview Summary

**Key Discussions**:

- Item 1 root cause identified: `fly-client.ts:146` only accepts status 204/404 as success, but Fly.io DELETE returns 200 too
- Item 2 approach decided: custom `Logger` wrapper for Bolt (NOT `logLevel: ERROR` — would suppress legitimate warnings)
- Test strategy: tests-after, Vitest (project standard, matches `tests/lib/fly-client.test.ts`)

**Research Findings**:

- Bolt version `@slack/bolt ^4.7.0` — supports custom `logger` option on `App` constructor
- `createMachine` (same file, line 121) already uses the idiomatic `status < 200 || status >= 300` pattern → mirror it in `destroyMachine`
- Bolt's `Logger` interface requires 6 methods: `debug`, `info`, `warn`, `error`, `setLevel`, `getLevel`, `setName` — missing any one crashes startup
- Auth errors (`invalid_auth`, `not_authed`, `account_inactive`) route through `logger.error()`, not `.warn()` → filtering warn is safe

### Metis Review

**Identified Gaps** (addressed in this plan):

- Also suppress `"A ping wasn't received"` — same harmless reconnect class as pong, different line in `SlackWebSocket.js`
- Existing test title at `tests/lib/fly-client.test.ts:136` (`"non-2xx, non-404"`) will become misleading → update to `"5xx responses"`
- JSDoc on `destroyMachine` (line 137) needs update to reflect all-2xx acceptance
- Must match **exact message prefixes** (e.g., `"A pong wasn't received from the server"`), not substring `"pong"` — robust against future warns incidentally containing the word
- Must include false-positive guard test: arbitrary warn (e.g., `"Slack workspace not found"`) still forwards to pino at warn level
- Must include error-never-filtered guard test: `logger.error("invalid_auth")` reaches pino at error level

---

## Work Objectives

### Core Objective

Eliminate log noise that masks real problems during operation of the Papi Chulo AI employee, without introducing silent failure modes.

### Concrete Deliverables

- `src/lib/fly-client.ts` — updated `destroyMachine` (2xx success range + updated JSDoc)
- `src/gateway/slack-logger.ts` — new file: `createFilteredBoltLogger(pino)` factory
- `src/gateway/server.ts` — pass the filtered logger to `new App({...})` in Socket Mode branch
- `tests/lib/fly-client.test.ts` — updated existing test title + new test for status 200 success
- `tests/gateway/slack-logger.test.ts` — new: filter function unit tests (pong filtered, ping filtered, unrelated warn forwarded, error never filtered)

### Definition of Done

- [ ] `pnpm build` exits 0 (TypeScript satisfied — confirms Logger interface compliance)
- [ ] `pnpm test -- --run` exits 0 with total passing count ≥ 515 (no regressions)
- [ ] `pnpm test -- --run tests/lib/fly-client.test.ts` exits 0 with the new 200-status test passing
- [ ] `pnpm test -- --run tests/gateway/slack-logger.test.ts` exits 0 with ≥ 4 filter tests passing
- [ ] Gateway starts without the pong/ping WARN messages appearing in `/tmp/ai-gateway.log` (evidence: 2-min log sample, zero matches)

### Must Have

- `destroyMachine` treats status 200 as success (plus the existing 204 and 404)
- `destroyMachine` still throws `ExternalApiError` on 5xx (regression guard)
- Custom Bolt logger demotes BOTH `"A pong wasn't received..."` AND `"A ping wasn't received..."` WARN to debug-level
- Custom Bolt logger implements ALL 6 `Logger` interface methods
- Non-matching warn messages still forward to pino at warn level
- Error-level messages are NEVER filtered (auth failures must surface)

### Must NOT Have (Guardrails)

- **NO** modification of `src/workers/entrypoint.sh`, `src/workers/orchestrate.mts`, or `src/inngest/lifecycle.ts` (FROZEN per AGENTS.md)
- **NO** changes to `createMachine` or `getMachine` — only `destroyMachine` is in scope
- **NO** use of `logLevel: LogLevel.ERROR` on `new App({})` — this would suppress legitimate info/warn from Bolt beyond just pong/ping
- **NO** logger-name-based filtering (e.g., matching on `socket-mode:SlackWebSocket:N`) — the `:N` suffix is dynamic and name-based matching is fragile
- **NO** substring match on `"pong"` alone — must use the exact message prefix `"A pong wasn't received from the server"` to avoid accidental suppression of unrelated future warns
- **NO** live Fly.io or live Slack credentials required for verification — unit tests must be sufficient
- **NO** scope creep into other log noise (e.g., Prisma query logs, pino formatting) — out of scope

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES — Vitest, `tests/` directory, `tests/lib/fly-client.test.ts` established
- **Automated tests**: YES (tests-after) — add tests alongside the fix in the same task
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module (fly-client.ts, slack-logger.ts)**: Vitest — run test file, capture stdout/exit code
- **Gateway integration (server.ts)**: `interactive_bash` (tmux) — start gateway, tail log for N minutes, grep for suppressed patterns

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent fixes):
├── Task 1: Fix fly-client.ts destroyMachine (status 2xx + 404) [quick]
└── Task 2: Create Bolt filter logger + wire into server.ts [quick]

Wave 2 (After Wave 1 — integration verification):
└── Task 3: Full build + test suite + gateway startup log check [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: (T1 ∥ T2) → T3 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential (trivial plan, limited parallelism opportunity)
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

- **Task 1**: blocked by: none | blocks: Task 3
- **Task 2**: blocked by: none | blocks: Task 3
- **Task 3**: blocked by: 1, 2 | blocks: F1-F4
- **F1-F4**: blocked by: 3 | blocks: user-okay

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 1 task — T3 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Fix `destroyMachine` to accept all 2xx status codes (+ 404) as success

  **What to do**:
  - Open `src/lib/fly-client.ts`
  - On line ~146, replace the condition in `destroyMachine`:
    - OLD: `if (status === 204 || status === 404) { return; }`
    - NEW: `if ((status >= 200 && status < 300) || status === 404) { return; }`
  - Update the JSDoc on `destroyMachine` (line ~132-139) — change `@throws ExternalApiError on non-2xx, non-404 responses` to `@throws ExternalApiError on non-2xx responses (except 404, which is treated as already-gone)`
  - Open `tests/lib/fly-client.test.ts`
  - Update the existing test title at line ~136 from `"should throw ExternalApiError on non-2xx, non-404 response"` to `"should throw ExternalApiError on 5xx responses"` (the body tests status 500 — title now accurate)
  - Add a NEW test case in the same `describe("destroyMachine")` block: `"should treat 200 as success (Fly.io real-world DELETE behavior)"` — mock fetch to return `{ ok: true, status: 200, json: async () => ({ ok: true }) }`, call `destroyMachine("app", "machineId")`, assert it resolves without throwing.
  - Also add a confirmatory test: `"should still treat 204 as success (backward compat)"` — mock returns status 204 empty, assert no throw.

  **Must NOT do**:
  - Do NOT change `createMachine` or `getMachine` — only `destroyMachine` is in scope.
  - Do NOT modify `makeRequest` or `makeRequestWithRetry` — the bug is purely in `destroyMachine`'s status-check branch.
  - Do NOT introduce new helper functions — this is a 1-line logic fix plus comment/test updates.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial single-file logic change + 2 new test cases + 1 test title rename. No architectural decisions.
  - **Skills**: []
    - No skill required. Standard TypeScript edit.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None — can start immediately

  **References**:

  **Pattern References**:
  - `src/lib/fly-client.ts:121` — `createMachine` uses `if (status < 200 || status >= 300) { throw ... }`. This is the IDIOMATIC 2xx-range check in this file — `destroyMachine` should use the inverse form for its success check.
  - `src/lib/fly-client.ts:169-180` — `getMachine` demonstrates the same pattern (`if (status === 200) return data; if (status === 404) return null;` else throw). Follow this style.

  **API/Type References**:
  - `src/lib/errors.ts` — `ExternalApiError` class. No changes needed; just keep throwing the same error on non-2xx non-404.

  **Test References**:
  - `tests/lib/fly-client.test.ts:136` — existing test for destroyMachine non-success case. Uses `global.fetch = vi.fn()` mocking pattern — follow this for the new 200/204 success tests.
  - Look at the existing destroyMachine "happy path" test (likely just above line 136) — it uses `status: 204`. Use that as a template, change to `status: 200` for the new test.

  **External References**:
  - Fly.io Machines API docs: `https://docs.machines.dev/#tag/Machines/operation/Machines_delete` — confirms DELETE returns 200 on success (the bug)

  **WHY Each Reference Matters**:
  - `fly-client.ts:121` — copying this EXACT pattern keeps the file internally consistent; reviewers should see the same 2xx-range shape in two places.
  - `fly-client.test.ts` — Vitest + `vi.fn()` mocking pattern is already established; don't invent a new mocking style.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: destroyMachine treats HTTP 200 as success (the bug fix)
    Tool: Bash (vitest)
    Preconditions: Test file updated with new "200 success" test case; fly-client.ts updated with 2xx-range check
    Steps:
      1. Run: pnpm test -- --run tests/lib/fly-client.test.ts 2>&1 | tee .sisyphus/evidence/task-1-fly-200.log
      2. Assert: stdout contains "should treat 200 as success" followed by checkmark/PASS indicator
      3. Assert: exit code 0
    Expected Result: New test passes. No test failures in the file.
    Failure Indicators: "FAIL" in output; exit code != 0; the new test not found in stdout
    Evidence: .sisyphus/evidence/task-1-fly-200.log

  Scenario: destroyMachine still throws on 5xx (regression guard)
    Tool: Bash (vitest)
    Preconditions: Renamed test "should throw ExternalApiError on 5xx responses" is present
    Steps:
      1. Run: pnpm test -- --run tests/lib/fly-client.test.ts 2>&1 | tee .sisyphus/evidence/task-1-fly-5xx.log
      2. Assert: stdout contains "should throw ExternalApiError on 5xx responses" followed by PASS
    Expected Result: Old behavior preserved — 5xx still throws ExternalApiError
    Failure Indicators: Renamed test missing; test fails
    Evidence: .sisyphus/evidence/task-1-fly-5xx.log

  Scenario: destroyMachine 204 still treated as success (backward compat)
    Tool: Bash (vitest)
    Preconditions: New "204 backward compat" test case added
    Steps:
      1. Run: pnpm test -- --run tests/lib/fly-client.test.ts 2>&1 | tee .sisyphus/evidence/task-1-fly-204.log
      2. Assert: stdout contains "should still treat 204 as success" with PASS
    Expected Result: 204 path unchanged
    Evidence: .sisyphus/evidence/task-1-fly-204.log
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-fly-200.log` — vitest output for 200 test
  - [ ] `.sisyphus/evidence/task-1-fly-5xx.log` — vitest output for 5xx regression
  - [ ] `.sisyphus/evidence/task-1-fly-204.log` — vitest output for 204 backward-compat

  **Commit**: YES
  - Message: `fix(fly-client): accept all 2xx status codes on machine destroy`
  - Files: `src/lib/fly-client.ts`, `tests/lib/fly-client.test.ts`
  - Pre-commit: `pnpm test -- --run tests/lib/fly-client.test.ts`

- [x] 2. Create filtered Bolt logger + wire into Socket Mode App

  **What to do**:
  - CREATE new file `src/gateway/slack-logger.ts` exporting `createFilteredBoltLogger(pinoLogger: pino.Logger): Logger`.
    - Import the `Logger` type from `@slack/logger` (or from `@slack/bolt` if it re-exports)
    - Implement a thin wrapper object with ALL 6 required methods:
      - `debug(...msgs: unknown[]): void` — forward to `pinoLogger.debug(msgs)`
      - `info(...msgs: unknown[]): void` — forward to `pinoLogger.info(msgs)`
      - `warn(...msgs: unknown[]): void` — check if first arg (as string) starts with `"A pong wasn't received from the server"` OR `"A ping wasn't received from the server"`. If YES → forward to `pinoLogger.debug(msgs)` (demote to debug, effectively silent at default level). Otherwise forward to `pinoLogger.warn(msgs)`.
      - `error(...msgs: unknown[]): void` — forward to `pinoLogger.error(msgs)` (NEVER filter)
      - `setLevel(level: LogLevel): void` — no-op (pino level comes from env)
      - `getLevel(): LogLevel` — return `LogLevel.INFO` (or use `LogLevel` enum value matching pino's current level)
      - `setName(name: string): void` — optionally prefix future log entries with this name (store in closure); simplest: no-op
  - Open `src/gateway/server.ts` — in the Socket Mode branch (lines ~51-56), pass the filtered logger:
    ```ts
    import { createFilteredBoltLogger } from './slack-logger.js';
    ...
    boltApp = new App({
      token: process.env.SLACK_BOT_TOKEN,
      appToken,
      socketMode: true,
      logger: createFilteredBoltLogger(logger), // <-- new line
    });
    ```
  - CREATE new test file `tests/gateway/slack-logger.test.ts` with 4 test cases:
    1. `"filters pong-timeout warn"` — call wrapper's `warn("A pong wasn't received from the server before the timeout of 5000ms!")`; assert mocked pino `warn` was NOT called and `debug` WAS called.
    2. `"filters ping-timeout warn"` — call `warn("A ping wasn't received from the server before the timeout of 10000ms!")`; assert same as above.
    3. `"forwards unrelated warn to pino warn"` — call `warn("Slack workspace not found")`; assert pino `warn` WAS called (NOT debug).
    4. `"never filters error — forwards to pino error"` — call `error("invalid_auth")`; assert pino `error` WAS called.

  **Must NOT do**:
  - Do NOT use `logLevel: LogLevel.ERROR` on `new App({...})` — suppresses legitimate info/warn from Bolt core.
  - Do NOT filter by logger name (e.g., `socket-mode:SlackWebSocket:N`) — the `:N` suffix is dynamic; match on message prefix only.
  - Do NOT use substring match on `"pong"` alone — must match the full prefix `"A pong wasn't received from the server"` to avoid accidental future suppressions.
  - Do NOT filter `error()` under any circumstances — auth failures surface there.
  - Do NOT modify the ExpressReceiver branch (lines 68-84 in `server.ts`). It's only used when `SLACK_APP_TOKEN` is absent; no pong warnings occur there. Leave it untouched.
  - Do NOT touch `src/workers/entrypoint.sh`, `src/workers/orchestrate.mts`, or `src/inngest/lifecycle.ts` (FROZEN).
  - Do NOT add new pino transports or reconfigure the existing pino logger in server.ts — reuse the existing `logger` instance.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: One new file (~40 lines), one 1-line wiring change, one new test file with 4 focused unit tests. No architecture decisions.
  - **Skills**: []
    - No skill required. Standard TypeScript + Vitest.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None — touches different files than Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts:13` — `const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });` — reuse this existing pino instance; do NOT create a second one.
  - `src/gateway/server.ts:48-66` — Socket Mode App construction. The new `logger` property must be added to the options object at line 52-56.

  **API/Type References**:
  - `@slack/bolt` v4.7 — `App` constructor accepts `logger?: Logger` option.
  - `@slack/logger` — exports `Logger` interface and `LogLevel` enum. The 6 required methods are: `debug`, `info`, `warn`, `error`, `setLevel`, `getLevel`, `setName`.
  - Bolt source reference (for context, not to modify): `node_modules/@slack/bolt/dist/App.js` — verify the `logger` option exists and is passed to SocketModeClient.

  **Test References**:
  - `tests/lib/fly-client.test.ts` — Vitest + `vi.fn()` mocking pattern. Mock pino logger as `const mockPino = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }`. Pass into `createFilteredBoltLogger(mockPino as any)`. Use `expect(mockPino.warn).not.toHaveBeenCalled()` / `.toHaveBeenCalledWith(...)`.

  **External References**:
  - Bolt docs: `https://slack.dev/bolt-js/concepts/logging` — custom logger example.
  - Slack socket-mode source (read-only reference): `node_modules/@slack/socket-mode/dist/SlackWebSocket.js` — `"A pong wasn't received..."` is at the pong-timeout handler; `"A ping wasn't received..."` is at the ping-timeout handler. Both are `logger.warn()` calls.

  **WHY Each Reference Matters**:
  - `server.ts:13` pino instance — using a second pino instance would result in duplicate config and potential log-level mismatch.
  - `@slack/logger` Logger interface — omitting ANY of the 6 methods causes Bolt to throw at App construction.
  - `SlackWebSocket.js` — these are the EXACT message strings we need to match; matching substrings loosely (just `"pong"`) would be fragile.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Filter demotes pong-timeout warn to debug
    Tool: Bash (vitest)
    Preconditions: slack-logger.ts created, test file created with 4 test cases
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack-logger.test.ts 2>&1 | tee .sisyphus/evidence/task-2-logger-pong.log
      2. Assert: stdout contains "filters pong-timeout warn" with PASS
    Expected Result: Pong warn is routed to debug, not warn
    Failure Indicators: Test not found; FAIL in stdout; pino.warn called when it shouldn't be
    Evidence: .sisyphus/evidence/task-2-logger-pong.log

  Scenario: Filter demotes ping-timeout warn to debug
    Tool: Bash (vitest)
    Preconditions: slack-logger.ts includes ping-timeout prefix in filter
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack-logger.test.ts 2>&1 | tee .sisyphus/evidence/task-2-logger-ping.log
      2. Assert: stdout contains "filters ping-timeout warn" with PASS
    Expected Result: Ping warn is also routed to debug
    Evidence: .sisyphus/evidence/task-2-logger-ping.log

  Scenario: Unrelated warn is forwarded to pino.warn (false-positive guard)
    Tool: Bash (vitest)
    Preconditions: Filter matches prefix only, not arbitrary substrings
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack-logger.test.ts 2>&1 | tee .sisyphus/evidence/task-2-logger-forward.log
      2. Assert: stdout contains "forwards unrelated warn to pino warn" with PASS
    Expected Result: "Slack workspace not found" type warns still reach operators
    Evidence: .sisyphus/evidence/task-2-logger-forward.log

  Scenario: Error is NEVER filtered (auth failure guard)
    Tool: Bash (vitest)
    Preconditions: .error() method in wrapper forwards directly to pino.error
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack-logger.test.ts 2>&1 | tee .sisyphus/evidence/task-2-logger-error.log
      2. Assert: stdout contains "never filters error" with PASS
    Expected Result: invalid_auth / not_authed surface at error level
    Evidence: .sisyphus/evidence/task-2-logger-error.log

  Scenario: TypeScript build passes (Logger interface compliance)
    Tool: Bash (tsc via pnpm build)
    Preconditions: slack-logger.ts implements all 6 Logger interface methods
    Steps:
      1. Run: pnpm build 2>&1 | tee .sisyphus/evidence/task-2-build.log
      2. Assert: exit code 0
    Expected Result: No TypeScript errors; confirms all 6 interface methods present with correct signatures
    Failure Indicators: TS2739 (missing properties); TS2345 (bad signature)
    Evidence: .sisyphus/evidence/task-2-build.log
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-logger-pong.log`
  - [ ] `.sisyphus/evidence/task-2-logger-ping.log`
  - [ ] `.sisyphus/evidence/task-2-logger-forward.log`
  - [ ] `.sisyphus/evidence/task-2-logger-error.log`
  - [ ] `.sisyphus/evidence/task-2-build.log`

  **Commit**: YES
  - Message: `feat(gateway): filter noisy Bolt socket-mode heartbeat warnings`
  - Files: `src/gateway/slack-logger.ts` (new), `src/gateway/server.ts`, `tests/gateway/slack-logger.test.ts` (new)
  - Pre-commit: `pnpm test -- --run tests/gateway/slack-logger.test.ts && pnpm build`

- [x] 3. Integration verification — full build, test suite, live gateway log cleanliness

  **What to do**:
  - Run full build: `pnpm build` — must exit 0.
  - Run full test suite: `pnpm test -- --run` — must exit 0 with total passing count ≥ 515 (current baseline).
  - Run lint: `pnpm lint` — must exit 0.
  - Start the gateway in a detached tmux session, pipe to a log file, let it run for 2 minutes:
    ```bash
    tmux new-session -d -s ai-log-check -x 220 -y 50
    tmux send-keys -t ai-log-check "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev 2>&1 | tee /tmp/ai-log-check.log" Enter
    sleep 120
    tmux kill-session -t ai-log-check
    ```
  - Inspect the log: `grep -c "wasn't received from the server" /tmp/ai-log-check.log`
  - Assert the match count is 0 (the filter is working in the live gateway).
  - Copy the log to evidence: `cp /tmp/ai-log-check.log .sisyphus/evidence/task-3-gateway-log.log`

  **Must NOT do**:
  - Do NOT trigger a real task or call Fly.io during this verification — local-only.
  - Do NOT require a live Slack workspace connection to pass. If Socket Mode fails to connect (missing SLACK_APP_TOKEN in local env), accept that path — the relevant assertion is "no pong/ping warnings appear" which is trivially true if SocketMode didn't even start. Log the decision in the evidence file.
  - Do NOT commit any changes in this task — it's verification only. Commits happened in Tasks 1 and 2.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure verification — run commands, check exit codes, grep a log. No code changes.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential — depends on T1 and T2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Final Verification Wave (F1-F4)
  - **Blocked By**: Tasks 1 and 2

  **References**:

  **Pattern References**:
  - AGENTS.md — "Long-Running Commands" section. Use tmux for `pnpm dev` per project convention.

  **Test References**:
  - No new test code. Verification only.

  **External References**:
  - None.

  **WHY Each Reference Matters**:
  - tmux pattern is the project standard for non-terminating commands like `pnpm dev`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build passes
    Tool: Bash
    Preconditions: All Task 1 and Task 2 changes applied and committed
    Steps:
      1. Run: pnpm build 2>&1 | tee .sisyphus/evidence/task-3-build.log
      2. Assert: exit code 0
      3. Assert: no "error TS" lines in stdout
    Expected Result: Clean TypeScript compile
    Evidence: .sisyphus/evidence/task-3-build.log

  Scenario: Full test suite passes with ≥ 515 tests
    Tool: Bash
    Preconditions: All new tests added
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee .sisyphus/evidence/task-3-tests.log
      2. Assert: exit code 0
      3. Parse stdout for total test count; assert ≥ 515
    Expected Result: No regressions; new tests included in total
    Failure Indicators: Total drops below 515; any new FAIL
    Evidence: .sisyphus/evidence/task-3-tests.log

  Scenario: Lint passes
    Tool: Bash
    Preconditions: New files conform to lint rules
    Steps:
      1. Run: pnpm lint 2>&1 | tee .sisyphus/evidence/task-3-lint.log
      2. Assert: exit code 0
    Expected Result: No lint errors
    Evidence: .sisyphus/evidence/task-3-lint.log

  Scenario: Gateway starts and emits zero pong/ping warnings over 2 minutes
    Tool: interactive_bash (tmux)
    Preconditions: Gateway has Task 2 changes (filter logger); .env has SLACK_BOT_TOKEN and SLACK_APP_TOKEN for Socket Mode
    Steps:
      1. tmux new-session -d -s ai-log-check -x 220 -y 50
      2. tmux send-keys -t ai-log-check "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev 2>&1 | tee /tmp/ai-log-check.log" Enter
      3. sleep 120
      4. tmux kill-session -t ai-log-check
      5. Count matches: grep -c "wasn't received from the server" /tmp/ai-log-check.log
      6. Assert count is 0
      7. Copy log: cp /tmp/ai-log-check.log .sisyphus/evidence/task-3-gateway-log.log
    Expected Result: Zero pong/ping timeout warnings in log; "Socket Mode connected" INFO line present (confirms Socket Mode actually started and the filter is exercised)
    Failure Indicators: grep count > 0; Socket Mode failed to connect
    Evidence: .sisyphus/evidence/task-3-gateway-log.log

  Scenario: Gateway startup error regression guard
    Tool: Bash
    Preconditions: Same as above
    Steps:
      1. Inspect .sisyphus/evidence/task-3-gateway-log.log for any line matching "Failed to" or "ERROR" related to logger setup
      2. Assert: zero unexpected errors (known-OK errors: Fly.io destroy warnings should now be ABSENT since Task 1 fixed them — but they only appear when a real task is processed, which this task does NOT do)
    Expected Result: Clean startup log
    Evidence: (same log as above)
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-build.log`
  - [ ] `.sisyphus/evidence/task-3-tests.log`
  - [ ] `.sisyphus/evidence/task-3-lint.log`
  - [ ] `.sisyphus/evidence/task-3-gateway-log.log`

  **Commit**: NO (verification only — no code changes in this task)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` (via `pnpm build`) + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Confirm pino logger instance is shared (not re-instantiated per call).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Specifically: run `pnpm build && pnpm test -- --run`; start gateway in tmux, tail log 2 minutes, grep for `"pong wasn't received"` and `"ping wasn't received"` — assert ZERO matches. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance (especially: no edits to frozen files, no changes to `createMachine`/`getMachine`, no `logLevel: ERROR` shortcut). Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1**: `fix(fly-client): accept 2xx status on machine destroy` — `src/lib/fly-client.ts`, `tests/lib/fly-client.test.ts` — pre-commit: `pnpm test -- --run tests/lib/fly-client.test.ts`
- **Task 2**: `feat(gateway): filter noisy Bolt socket-mode heartbeat warnings` — `src/gateway/slack-logger.ts`, `src/gateway/server.ts`, `tests/gateway/slack-logger.test.ts` — pre-commit: `pnpm test -- --run tests/gateway/slack-logger.test.ts`
- **Task 3**: NO COMMIT (verification only — groups with Tasks 1 & 2 above, or squashed if trivial)

---

## Success Criteria

### Verification Commands

```bash
# Task 1 verification
pnpm test -- --run tests/lib/fly-client.test.ts
# Expected: all destroyMachine tests pass, including new "200 success" case

# Task 2 verification
pnpm test -- --run tests/gateway/slack-logger.test.ts
# Expected: ≥ 4 tests pass (pong filtered, ping filtered, unrelated warn forwarded, error never filtered)

# Full regression
pnpm build
# Expected: exit 0 (no TypeScript errors — confirms Logger interface compliance)

pnpm test -- --run
# Expected: exit 0, total passing ≥ 515

# Gateway log cleanliness (Task 3)
tmux new-session -d -s ai-log-check "pnpm dev 2>&1 | tee /tmp/ai-log-check.log"
sleep 120
grep -c "wasn't received from the server" /tmp/ai-log-check.log
# Expected: 0
tmux kill-session -t ai-log-check
```

### Final Checklist

- [ ] All "Must Have" present (verified by F1)
- [ ] All "Must NOT Have" absent (verified by F4)
- [ ] All tests pass (verified by F2)
- [ ] Gateway log is clean — no pong/ping heartbeat warnings (verified by F3)
- [ ] No regressions in ≥ 515-test baseline (verified by F2)
