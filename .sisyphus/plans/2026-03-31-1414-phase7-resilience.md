# Phase 7: Resilience & Monitoring

## TL;DR

> **Quick Summary**: Turn the functional MVP (Phases 1-6) into a production-ready system by adding failure recovery (watchdog cron + redispatch), cost protection (circuit breaker with Slack alerting), observability (structured logging + agent versioning), and production infrastructure (real Fly.io dispatch + token tracking).
>
> **Deliverables**:
>
> - Watchdog Inngest cron detecting stale machines and recovering stuck tasks
> - Redispatch flow with 6-hour budget enforcement
> - Cost circuit breaker with Slack alerting and lifecycle-level gate
> - waitForEvent race condition mitigation
> - Agent version tracking linked to every execution
> - Structured JSON logging across workers and Inngest functions
> - Fly.io machine dispatch (replacing placeholder) with Fly API client
> - Token tracking persisting LLM costs to executions table
> - Phase 7 completion doc
> - Updated progress.json
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves + final verification
> **Critical Path**: Task 1 (baseline) → Task 2 (logger) → Task 4 (token tracking) → Task 7 (circuit breaker) → Task 14 (watchdog) → F1-F4

---

## Context

### Original Request

Create a granular work plan for Phase 7 with every meaningful implementation task having corresponding automated testing, manual testing, and documentation tasks. Include progress.json updates, a final review phase, and a Phase completion doc.

### Interview Summary

**Key Discussions**:

- Phase 7 scope is defined by 6 checkpoints in progress.json + 3 deferred items from Phase 6
- User wants task-level testing and documentation companions — not separate "write tests" phases
- Testing baseline: ~435+ tests (Phases 1-6 combined)
- Phase completion doc must follow the format of `docs/2026-03-26-1511-phase1-foundation.md`

**Research Findings**:

- `callLLM()` circuit breaker is reading zero — nothing writes `estimated_cost_usd` to executions. Token tracking is a prerequisite for the circuit breaker to function.
- No `flyApi` module exists — must be created from scratch
- ~50+ `console.log` calls need migration to structured logger
- `redispatch.ts` is a 27-line skeleton without elapsed time check
- `waitForEvent` has one location with zero pre-checks
- Tests that `spyOn(console)` will break when logger is introduced

### Metis Review

**Identified Gaps** (addressed):

- Token tracking must precede circuit breaker upgrade (dependency ordering enforced in Wave 1/2)
- Fly.io dispatch needs prerequisite verification (FLY_API_TOKEN, app name, image URI)
- Watchdog must not double-dispatch (atomic dispatch_attempts check added to acceptance criteria)
- Structured logging scope bounded to `src/workers/` and `src/inngest/` only (not gateway)
- Agent version must use upsert semantics (hash-based dedup, not insert-on-every-restart)
- Auto-release of cost-held tasks is explicitly OUT of scope

---

## Work Objectives

### Core Objective

Add failure recovery, cost protection, and observability to the AI Employee Platform so it can operate reliably in production without constant human monitoring.

### Concrete Deliverables

- `src/inngest/watchdog.ts` — Inngest cron function (10-min interval)
- `src/lib/fly-client.ts` — Fly.io Machines API client
- `src/lib/logger.ts` — Structured JSON logger utility
- `src/lib/agent-version.ts` — Agent version hash computation and upsert
- Updated `src/inngest/lifecycle.ts` — Real Fly.io dispatch, waitForEvent pre-check, cost gate
- Updated `src/inngest/redispatch.ts` — 6-hour elapsed time check
- Updated `src/lib/call-llm.ts` — Slack alerting on circuit breaker trip
- Updated `src/workers/orchestrate.mts` — Token tracking persistence
- `docs/2026-MM-DD-HHMM-phase7-resilience.md` — Phase completion doc

### Definition of Done

- [ ] All Phase 7 checkpoints in progress.json have `status: "complete"`
- [ ] `pnpm test -- --run` passes with 0 failures (new tests + no regressions)
- [ ] `pnpm tsc --noEmit` passes with 0 errors

### Must Have

- Watchdog cron that detects stale executions and recovers stuck Submitting tasks
- Redispatch with 6-hour budget enforcement and 3-attempt limit
- Cost circuit breaker with Slack webhook alerting
- waitForEvent race condition pre-check
- Every execution linked to an agent_version_id
- Structured JSON logging in workers and Inngest functions
- Token tracking persisting to executions table

### Must NOT Have (Guardrails)

- Multi-department cost tracking (use `"default"` department throughout)
- OpenTelemetry SDK integration (add trace_id as manual field only)
- Log shipping to external services (stdout only)
- Agent version feedback loop or performance comparison
- Auto-release of cost-held tasks (manual release only)
- Gateway structured logging (scope: workers + inngest only)
- Pre-warmed Fly.io machine pool
- Excessive comments or JSDoc on every function (comment only non-obvious logic)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, established patterns from Phases 1-6)
- **Automated tests**: Tests-after (implementation + tests in same task)
- **Framework**: Vitest

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Inngest functions**: Use Bash (Vitest) — Run test commands, assert pass/fail
- **API clients**: Use Bash (Vitest) — Mock-based unit tests
- **CLI utilities**: Use Bash (node REPL) — Import, call functions, verify output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + infra):
├── Task 1: Establish test baseline + verify local environment [quick]
├── Task 2: Structured JSON logger utility [quick]
├── Task 3: Fly.io Machines API client [quick]
├── Task 4: Token tracking persistence [unspecified-high]
├── Task 5: Agent version hash computation + upsert [quick]

Wave 2 (After Wave 1 — core resilience modules):
├── Task 6: Migrate workers + inngest to structured logger (depends: 2) [unspecified-high]
├── Task 7: Cost circuit breaker — Slack alerting + lifecycle gate (depends: 4) [deep]
├── Task 8: waitForEvent race condition pre-check (depends: 2) [unspecified-high]
├── Task 9: Redispatch flow — 6h elapsed time check (depends: 2) [unspecified-high]
├── Task 10: Agent versioning — link executions at runtime (depends: 5) [unspecified-high]
├── Task 11: Fly.io machine dispatch in lifecycle.ts (depends: 3) [deep]

Wave 3 (After Wave 2 — watchdog + integration):
├── Task 12: tooling_config re-entry in fix loop [quick]
├── Task 13: Fly.io machine cleanup in lifecycle finalize (depends: 11) [quick]
├── Task 14: Watchdog cron — stale detection + recovery (depends: 3, 9, 11) [deep]
├── Task 15: Update progress.json with all Phase 7 checkpoints [quick]
├── Task 16: Phase 7 completion doc [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 4 → Task 7 → Task 14 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On            | Blocks     |
| ---- | --------------------- | ---------- |
| 1    | —                     | 2-5        |
| 2    | 1                     | 6, 8, 9    |
| 3    | 1                     | 11, 13, 14 |
| 4    | 1                     | 7          |
| 5    | 1                     | 10         |
| 6    | 2                     | 14         |
| 7    | 4                     | 14         |
| 8    | 2                     | 14         |
| 9    | 2                     | 14         |
| 10   | 5                     | —          |
| 11   | 3                     | 13, 14     |
| 12   | —                     | —          |
| 13   | 11                    | 14         |
| 14   | 3, 9, 11, 6, 7, 8, 13 | F1-F4      |
| 15   | 14                    | 16         |
| 16   | 15                    | F1-F4      |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `unspecified-high`, T5 → `quick`
- **Wave 2**: **6** — T6 → `unspecified-high`, T7 → `deep`, T8 → `unspecified-high`, T9 → `unspecified-high`, T10 → `unspecified-high`, T11 → `deep`
- **Wave 3**: **5** — T12 → `quick`, T13 → `quick`, T14 → `deep`, T15 → `quick`, T16 → `writing`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Establish Test Baseline + Verify Local Environment

  **What to do**:
  - Run `pnpm test -- --run` to capture the exact current test count and verify all pass
  - Run `pnpm tsc --noEmit` to verify TypeScript builds clean
  - Run `pnpm lint` to verify linting passes
  - Record the baseline test count in a comment at the top of the first new test file
  - Verify local Supabase is running and `ai_employee` database is accessible
  - Verify Inngest Dev Server connectivity
  - Run `grep -rn "spyOn(console" tests/` to enumerate all tests that spy on console (needed for Task 6)
  - Save the console spy list to `.sisyphus/evidence/task-1-console-spies.txt`

  **Must NOT do**:
  - Modify any source files
  - Change test configurations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run first — establishes baseline)
  - **Parallel Group**: Wave 1 (first task)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None

  **References**:
  - `package.json` — test/lint/build scripts
  - `tests/` — all existing test files (37+ files from Phases 1-6)
  - `.sisyphus/progress.json` — Phase 6 reported 435 tests, may be stale

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run` exits with code 0
  - [ ] `pnpm tsc --noEmit` exits with code 0
  - [ ] Baseline test count documented in `.sisyphus/evidence/task-1-baseline.txt`
  - [ ] Console spy list saved to `.sisyphus/evidence/task-1-console-spies.txt`

  **QA Scenarios**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run 2>&1 | tee .sisyphus/evidence/task-1-baseline.txt`
      2. Assert exit code = 0
      3. Extract test count from output (grep for "Tests" line)
    Expected Result: All tests pass, count documented
    Evidence: .sisyphus/evidence/task-1-baseline.txt

  Scenario: Console spy enumeration
    Tool: Bash
    Steps:
      1. Run `grep -rn "spyOn(console" tests/ > .sisyphus/evidence/task-1-console-spies.txt`
      2. Read the file and count lines
    Expected Result: File exists with 0+ matches listed with file:line references
    Evidence: .sisyphus/evidence/task-1-console-spies.txt
  ```

  **Commit**: YES
  - Message: `chore(phase7): establish test baseline and verify environment`
  - Files: `.sisyphus/evidence/task-1-*.txt`

- [x] 2. Structured JSON Logger Utility

  **What to do**:
  - Create `src/lib/logger.ts` with a structured JSON logger
  - Use `pino` (fast, JSON-native) as the logging library — `pnpm add pino` + `pnpm add -D @types/pino`
  - Export a `createLogger(component: string)` factory that returns a pino instance with the platform's schema
  - Logger schema fields: `timestamp` (ISO 8601), `level`, `taskId` (optional via child logger), `component`, `message`, `error` (serialized), `metadata`
  - Export a `taskLogger(component: string, taskId: string)` convenience function that creates a child logger with `taskId` bound
  - Handle circular references gracefully (pino handles this natively)
  - Redact sensitive fields: patterns matching `*_TOKEN`, `*_SECRET`, `*_KEY`, `*_PASSWORD` in metadata
  - Create `tests/lib/logger.test.ts` with comprehensive tests
  - Document the logger API in inline JSDoc comments

  **Must NOT do**:
  - Migrate existing console.log calls (that's Task 6)
  - Add OpenTelemetry SDK
  - Add log shipping to external services
  - Add logger to gateway routes (scope: workers + inngest only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4, 5)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 6, 8, 9
  - **Blocked By**: Task 1

  **References**:
  - Architecture doc §14 Structured Logging Schema — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 1812-1829 — JSON schema spec with fields: timestamp, level, taskId, step, component, message, error, metadata
  - `src/lib/errors.ts` — existing error types (CostCircuitBreakerError, LLMTimeoutError, etc.) that need proper serialization in logs
  - `src/lib/retry.ts` — existing retry utility, logger should follow the same export pattern

  **Acceptance Criteria**:
  - [ ] `src/lib/logger.ts` exists and exports `createLogger` and `taskLogger`
  - [ ] Every log line is valid JSON (parseable with `JSON.parse`)
  - [ ] Every log line contains: `timestamp`, `level`, `msg`, `component`
  - [ ] `taskLogger` binds `taskId` to all child log calls
  - [ ] Sensitive fields matching `*_TOKEN`, `*_SECRET`, `*_KEY` are redacted in metadata
  - [ ] Circular references don't crash the logger
  - [ ] `pnpm test -- --run tests/lib/logger.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Logger outputs valid JSON
    Tool: Bash
    Steps:
      1. Run: `node -e "const {createLogger}=require('./dist/lib/logger.js'); const l=createLogger('test'); l.info({meta:'data'},'hello');" 2>&1 | head -1 | node -e "process.stdin.on('data',d=>{JSON.parse(d);console.log('VALID_JSON')})"`
      2. Assert output contains "VALID_JSON"
    Expected Result: Log output is parseable JSON
    Evidence: .sisyphus/evidence/task-2-json-validity.txt

  Scenario: Sensitive field redaction
    Tool: Bash (Vitest)
    Steps:
      1. Run `pnpm test -- --run tests/lib/logger.test.ts`
      2. Assert test for redaction passes (metadata containing GITHUB_TOKEN is replaced with "[REDACTED]")
    Expected Result: All logger tests pass
    Evidence: .sisyphus/evidence/task-2-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): add structured JSON logger utility`
  - Files: `src/lib/logger.ts`, `tests/lib/logger.test.ts`, `package.json`, `pnpm-lock.yaml`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Fly.io Machines API Client

  **What to do**:
  - Create `src/lib/fly-client.ts` with a typed Fly.io Machines API client
  - Implement `createMachine({ appName, config })` — POST to `https://api.machines.dev/v1/apps/{app}/machines`
  - Implement `destroyMachine({ appName, machineId })` — DELETE to `https://api.machines.dev/v1/apps/{app}/machines/{id}?force=true`
  - Implement `getMachine({ appName, machineId })` — GET machine status
  - All methods use `FLY_API_TOKEN` from environment for Bearer auth
  - Retry on 429 (Fly rate-limits creation to 1 req/sec, 3/sec burst) using existing `withRetry` utility
  - Handle 404 on destroyMachine as success (machine already gone)
  - Return typed responses with machine ID, state, and metadata
  - Create `tests/lib/fly-client.test.ts` with mock-based unit tests (never make real Fly.io calls)

  **Must NOT do**:
  - Create real Fly.io machines in tests
  - Implement volume forking (deferred to Phase 9)
  - Implement pre-warmed machine pool

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 4, 5)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 11, 13, 14
  - **Blocked By**: Task 1

  **References**:
  - Architecture doc §7.3 Fly.io Machine Lifecycle — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 572-587 — machine specs (performance-2x, 4GB RAM), teardown mechanisms
  - Architecture doc §9.2 Execution Agent — lines 838-941 — task context injection via env vars (TASK_ID, REPO_URL, REPO_BRANCH, credentials)
  - `src/lib/retry.ts` — existing `withRetry` utility for retry-on-429
  - `src/lib/github-client.ts` — pattern reference for typed API client with retry logic
  - Fly.io Machines API docs: `https://fly.io/docs/machines/api/machines-resource/`

  **Acceptance Criteria**:
  - [ ] `src/lib/fly-client.ts` exports `createMachine`, `destroyMachine`, `getMachine`
  - [ ] `createMachine` sends POST to correct Fly.io API URL with Bearer auth
  - [ ] `destroyMachine` handles 404 as success (machine already gone, no throw)
  - [ ] 429 responses trigger retry via `withRetry`
  - [ ] Machine config includes env vars: TASK_ID, REPO_URL, REPO_BRANCH + credentials from Fly.io Secrets
  - [ ] `pnpm test -- --run tests/lib/fly-client.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: createMachine returns machine ID
    Tool: Bash (Vitest)
    Steps:
      1. Run `pnpm test -- --run tests/lib/fly-client.test.ts`
      2. Assert test for createMachine mock passes (returns { id: 'mock-machine-id', state: 'started' })
    Expected Result: All fly-client tests pass
    Evidence: .sisyphus/evidence/task-3-tests.txt

  Scenario: destroyMachine handles 404 gracefully
    Tool: Bash (Vitest)
    Steps:
      1. Assert test where mock returns 404 does NOT throw
      2. Assert destroyMachine returns success indicator
    Expected Result: 404 treated as success
    Evidence: .sisyphus/evidence/task-3-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): add Fly.io Machines API client`
  - Files: `src/lib/fly-client.ts`, `tests/lib/fly-client.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Token Tracking Persistence

  **What to do**:
  - Update `src/workers/orchestrate.mts` to accumulate `promptTokens`, `completionTokens`, and `estimatedCostUsd` from each `callLLM()` call during execution
  - At execution completion (Step 16 in orchestrate.mts), PATCH the `executions` row with cumulative token counts: `prompt_tokens`, `completion_tokens`, `estimated_cost_usd`, `primary_model_id`
  - Use atomic increment pattern via PostgREST PATCH to avoid race conditions: set the final accumulated values (the orchestrator is single-threaded per execution, so a single write at completion is safe)
  - If execution fails mid-way, still persist partial token counts in the error/escalation path
  - Create or update `src/workers/lib/token-tracker.ts` — a simple in-memory accumulator: `addUsage({ promptTokens, completionTokens, estimatedCostUsd, model })` and `getAccumulated()`
  - Write tests for the token tracker and the orchestrate integration

  **Must NOT do**:
  - Write to the DB on every LLM call (batch at completion)
  - Implement per-department aggregation
  - Change the `callLLM()` interface

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3, 5)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7 (cost circuit breaker depends on token data being written)
  - **Blocked By**: Task 1

  **References**:
  - `src/workers/orchestrate.mts` — 16-step main(), Steps 8-11 make LLM calls via OpenCode sessions
  - `src/lib/call-llm.ts` — returns `CallLLMResult` with `promptTokens`, `completionTokens`, `estimatedCostUsd`
  - `src/workers/lib/postgrest-client.ts` — PostgREST client used for PATCH to executions
  - Architecture doc §22 Cost Tracking — lines 2383-2385 — per-execution columns: `prompt_tokens`, `completion_tokens`, `primary_model_id`, `estimated_cost_usd`
  - Phase 6 known limitations — `docs/2026-03-30-2038-phase6-completion-delivery.md` line 344 — "Token tracking deferred to Phase 7"
  - Prisma schema `executions` table — `prompt_tokens Int?`, `completion_tokens Int?`, `estimated_cost_usd Decimal?`, `primary_model_id String?`

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/token-tracker.ts` exists with `addUsage()` and `getAccumulated()`
  - [ ] Orchestrate.mts writes accumulated tokens to executions row at completion
  - [ ] Partial token counts are persisted even on execution failure/escalation
  - [ ] `estimated_cost_usd` is accurate to 4 decimal places (Decimal(10,4))
  - [ ] After a test execution, `SELECT prompt_tokens, completion_tokens, estimated_cost_usd FROM executions` returns non-null values
  - [ ] `pnpm test -- --run tests/workers/lib/token-tracker.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Token accumulation across multiple calls
    Tool: Bash (Vitest)
    Steps:
      1. Create TokenTracker instance
      2. Call addUsage({ promptTokens: 100, completionTokens: 50, estimatedCostUsd: 0.0045, model: 'anthropic/claude-sonnet-4-6' })
      3. Call addUsage({ promptTokens: 200, completionTokens: 150, estimatedCostUsd: 0.0285, model: 'anthropic/claude-sonnet-4-6' })
      4. Call getAccumulated()
    Expected Result: { promptTokens: 300, completionTokens: 200, estimatedCostUsd: 0.0330, primaryModelId: 'anthropic/claude-sonnet-4-6' }
    Evidence: .sisyphus/evidence/task-4-accumulation.txt

  Scenario: Partial persistence on failure
    Tool: Bash (Vitest)
    Steps:
      1. Mock orchestrate to call addUsage twice, then simulate failure
      2. Assert PATCH to executions was called with partial token counts
    Expected Result: Partial tokens persisted (non-zero values in PATCH body)
    Evidence: .sisyphus/evidence/task-4-partial.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): persist LLM token counts to executions table`
  - Files: `src/workers/lib/token-tracker.ts`, `src/workers/orchestrate.mts`, `tests/workers/lib/token-tracker.test.ts`, `tests/workers/orchestrate.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Agent Version Hash Computation + Upsert

  **What to do**:
  - Create `src/lib/agent-version.ts` with functions for computing and managing agent versions
  - Implement `computeVersionHash({ promptTemplate, modelId, toolConfig })` — SHA-256 of JSON-serialized, key-sorted config. Must be deterministic across restarts.
  - Implement `ensureAgentVersion(prisma, { promptHash, modelId, toolConfigHash, changelogNote? })` — upsert semantics: check if record with matching hashes exists, create only if not found, return the version ID
  - The hash function must use `crypto.createHash('sha256')` on deterministic JSON (sorted keys)
  - Write tests verifying determinism, upsert behavior (no duplicates on restart), and hash stability

  **Must NOT do**:
  - Implement agent version feedback loop or performance comparison
  - Implement A/B testing or version promotion
  - Create a new version on every server restart if config hasn't changed

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3, 4)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 10
  - **Blocked By**: Task 1

  **References**:
  - Architecture doc §23 Agent Versioning — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 2462-2496 — prompt_hash, model_id, tool_config_hash, changelog_note, is_active
  - `prisma/schema.prisma` — `AgentVersion` model with fields: prompt_hash, model_id, tool_config_hash, changelog_note, is_active, created_at
  - `prisma/seed.ts` — existing seed record with UUID `00000000-...-0002`, model `claude-sonnet-4-6`

  **Acceptance Criteria**:
  - [ ] `src/lib/agent-version.ts` exports `computeVersionHash` and `ensureAgentVersion`
  - [ ] Same prompt + model + tool config always produces the same hash (deterministic)
  - [ ] `ensureAgentVersion` does NOT create duplicate records on repeated calls with same hashes
  - [ ] `ensureAgentVersion` DOES create a new record when any hash changes
  - [ ] `pnpm test -- --run tests/lib/agent-version.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Hash determinism
    Tool: Bash (Vitest)
    Steps:
      1. Call computeVersionHash with fixed inputs twice
      2. Assert both outputs are identical
    Expected Result: hash1 === hash2
    Evidence: .sisyphus/evidence/task-5-determinism.txt

  Scenario: Upsert prevents duplicates
    Tool: Bash (Vitest)
    Steps:
      1. Call ensureAgentVersion with mock Prisma
      2. Call ensureAgentVersion again with same inputs
      3. Assert Prisma.create was called only once (second call returns existing)
    Expected Result: Only 1 record created
    Evidence: .sisyphus/evidence/task-5-upsert.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): add agent version hash computation and upsert`
  - Files: `src/lib/agent-version.ts`, `tests/lib/agent-version.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Migrate Workers + Inngest to Structured Logger

  **What to do**:
  - Replace all `console.log`, `console.warn`, `console.error` calls in `src/workers/` and `src/inngest/` with the structured logger from Task 2
  - Use `createLogger(component)` at module level, `taskLogger(component, taskId)` when taskId is available
  - Component names: `'orchestrate'`, `'heartbeat'`, `'fix-loop'`, `'validation-pipeline'`, `'session-manager'`, `'opencode-server'`, `'completion'`, `'branch-manager'`, `'pr-manager'`, `'project-config'`, `'lifecycle'`, `'redispatch'`
  - Update ALL tests that `spyOn(console)` (from Task 1's enumeration in `.sisyphus/evidence/task-1-console-spies.txt`) to spy on the logger instead
  - Preserve existing log semantics — info stays info, warn stays warn, error stays error
  - Add `taskId` to all log calls where task context is available

  **Must NOT do**:
  - Modify gateway code (`src/gateway/`) — that's Phase 8+ scope
  - Add OpenTelemetry traces
  - Change log levels (don't promote info to debug or vice versa)
  - Remove useful error context from log messages

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8, 9, 10, 11 — but depends on Task 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14 (watchdog needs logger)
  - **Blocked By**: Task 2

  **References**:
  - `.sisyphus/evidence/task-1-console-spies.txt` — list of tests that spy on console (from Task 1)
  - `src/lib/logger.ts` — logger created in Task 2
  - `src/workers/orchestrate.mts` — ~15+ console.log calls
  - `src/workers/lib/heartbeat.ts` — console.log for heartbeat writes
  - `src/workers/lib/fix-loop.ts` — console.log for fix iterations
  - `src/inngest/lifecycle.ts` — console.warn for Slack stub
  - `src/inngest/redispatch.ts` — no console calls currently

  **Acceptance Criteria**:
  - [ ] Zero `console.log` / `console.warn` / `console.error` calls remain in `src/workers/` and `src/inngest/`
  - [ ] Every log call uses the structured logger with appropriate `component` field
  - [ ] `taskId` is included in all log calls where task context is available
  - [ ] All tests that previously spied on console now spy on logger or verify behavior differently
  - [ ] `pnpm test -- --run` passes with 0 failures (no regressions)

  **QA Scenarios**:

  ```
  Scenario: No console.log in workers/inngest
    Tool: Bash
    Steps:
      1. Run `grep -rn "console\.\(log\|warn\|error\)" src/workers/ src/inngest/ | grep -v node_modules | grep -v "\.test\." | wc -l`
      2. Assert count = 0
    Expected Result: Zero console.log/warn/error calls in production code
    Evidence: .sisyphus/evidence/task-6-console-check.txt

  Scenario: All tests pass after migration
    Tool: Bash (Vitest)
    Steps:
      1. Run `pnpm test -- --run`
      2. Assert exit code = 0, compare test count to Task 1 baseline
    Expected Result: Same or more tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-6-tests.txt
  ```

  **Commit**: YES
  - Message: `refactor(phase7): migrate workers and inngest to structured logger`
  - Files: `src/workers/**/*.ts`, `src/inngest/**/*.ts`, `tests/**/*.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Cost Circuit Breaker — Slack Alerting + Lifecycle Gate

  **What to do**:
  - Update `src/lib/call-llm.ts` `checkCostCircuitBreaker()` to send a Slack webhook alert when the threshold is crossed
  - Use existing `src/lib/slack-client.ts` `postMessage()` for Slack alerting
  - Alert should fire exactly ONCE per threshold crossing (use a flag/timestamp, not on every call)
  - Alert content: current spend, threshold, department, timestamp
  - Add a lifecycle-level cost gate to `src/inngest/lifecycle.ts`: before `dispatch-fly-machine` step, check daily cost via the same query used by callLLM's circuit breaker
  - If over threshold: set task status to `AwaitingInput` with `failure_reason: "Daily cost limit ($X) exceeded. Current spend: $Y. Task paused until cost window resets or limit is increased."`
  - Write to `task_status_log` with `actor: 'lifecycle_fn'`
  - Write tests for: Slack alert fires once, lifecycle gate holds task, cost query returns correct sum

  **Must NOT do**:
  - Implement multi-department cost tracking (use `"default"` department)
  - Implement auto-release of cost-held tasks
  - Change the cost threshold default ($50/day)
  - Add per-call cost tracking to the DB (stays in-memory per callLLM)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 8, 9, 10, 11)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Task 4 (token tracking must be writing data for circuit breaker to read meaningful values)

  **References**:
  - `src/lib/call-llm.ts` lines 42-82 — existing `checkCostCircuitBreaker()` with in-memory cache, COST_CACHE, SQL query
  - `src/lib/slack-client.ts` — existing `postMessage()` function with retry logic
  - `src/inngest/lifecycle.ts` lines 48-51 — `dispatch-fly-machine` step (add cost gate before this)
  - Architecture doc §22.1 Cost Circuit Breaker — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 2448-2458 — threshold, Slack alert, lifecycle gate behavior
  - `src/lib/errors.ts` — existing `CostCircuitBreakerError` class

  **Acceptance Criteria**:
  - [ ] Slack alert fires when daily spend first exceeds threshold
  - [ ] Slack alert fires exactly ONCE per threshold crossing (not on every subsequent LLM call)
  - [ ] Alert contains: current spend, threshold, department, timestamp
  - [ ] Lifecycle gate checks cost before dispatching machine
  - [ ] When over threshold: task status = `AwaitingInput`, failure_reason populated, task_status_log entry written
  - [ ] When under threshold: lifecycle proceeds normally (no change to happy path)
  - [ ] `pnpm test -- --run tests/lib/call-llm.test.ts tests/inngest/lifecycle.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Slack alert fires on threshold crossing
    Tool: Bash (Vitest)
    Steps:
      1. Mock Prisma to return cost sum = $55 (over $50 threshold)
      2. Mock slack-client.postMessage
      3. Call checkCostCircuitBreaker()
      4. Assert postMessage was called once with spend/threshold details
    Expected Result: Slack postMessage called exactly once
    Evidence: .sisyphus/evidence/task-7-slack-alert.txt

  Scenario: Lifecycle gate holds task when over threshold
    Tool: Bash (Vitest)
    Steps:
      1. Mock Prisma cost query to return $60
      2. Trigger lifecycle function with a task in Ready state
      3. Assert task status changed to AwaitingInput
      4. Assert failure_reason contains "cost limit"
    Expected Result: Task held, not dispatched
    Evidence: .sisyphus/evidence/task-7-lifecycle-gate.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): add Slack alerting and lifecycle gate to cost circuit breaker`
  - Files: `src/lib/call-llm.ts`, `src/inngest/lifecycle.ts`, `tests/lib/call-llm.test.ts`, `tests/inngest/lifecycle.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. waitForEvent Race Condition Pre-Check

  **What to do**:
  - In `src/inngest/lifecycle.ts`, add a new step `'pre-check-completion'` BEFORE `step.waitForEvent('wait-for-completion')`
  - The pre-check queries Supabase for the task's current status
  - If status is `Submitting` or `Done`: skip `step.waitForEvent` entirely, construct a synthetic result object matching the waitForEvent return shape, and proceed to finalize
  - If status is `Cancelled`: return early (task cancelled)
  - If status is still `Executing`: proceed to `step.waitForEvent` as normal
  - This mitigates the Inngest #1433 race condition where events sent before `step.waitForEvent` starts listening are silently missed
  - Document the TOCTOU limitation: pre-check reduces the race window but doesn't eliminate it. Inngest's upcoming "lookback" feature is the proper fix.
  - Write tests for all three pre-check outcomes

  **Must NOT do**:
  - Remove the existing `step.waitForEvent` (it's still needed for the normal case)
  - Change the waitForEvent timeout (stays at 4h10m)
  - Add pre-checks to non-existent waitForEvent calls (there's only one in MVP)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7, 9, 10, 11)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Task 2 (needs logger for logging the pre-check decision)

  **References**:
  - `src/inngest/lifecycle.ts` lines 53-57 — existing `step.waitForEvent` call
  - Architecture doc §10 Known Issue — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 1274-1276 — Inngest #1433, mandatory Supabase pre-check
  - Implementation phases doc Phase 7 verification criteria — `docs/2026-03-25-1901-mvp-implementation-phases.md` lines 849-855 — pre-check expected behavior
  - `src/inngest/lifecycle.ts` lines 113-161 — finalize step that processes the waitForEvent result

  **Acceptance Criteria**:
  - [ ] Pre-check step reads task status from Supabase before waitForEvent
  - [ ] If task is `Submitting`: waitForEvent is skipped, finalize runs with synthetic completion result
  - [ ] If task is `Done`: lifecycle returns early
  - [ ] If task is `Cancelled`: lifecycle returns early
  - [ ] If task is `Executing`: waitForEvent proceeds normally (no behavior change)
  - [ ] TOCTOU limitation is documented in a code comment
  - [ ] `pnpm test -- --run tests/inngest/lifecycle.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Pre-check detects Submitting status — skips waitForEvent
    Tool: Bash (Vitest)
    Steps:
      1. Create task with status 'Submitting' in mock Prisma
      2. Trigger lifecycle function
      3. Assert step.waitForEvent was NOT called
      4. Assert finalize step ran with synthetic result
    Expected Result: waitForEvent skipped, finalize proceeds
    Evidence: .sisyphus/evidence/task-8-precheck-submitting.txt

  Scenario: Pre-check finds Executing — waitForEvent proceeds normally
    Tool: Bash (Vitest)
    Steps:
      1. Create task with status 'Executing' in mock Prisma
      2. Trigger lifecycle function
      3. Assert step.waitForEvent WAS called with 4h10m timeout
    Expected Result: Normal flow unchanged
    Evidence: .sisyphus/evidence/task-8-precheck-executing.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): add waitForEvent race condition pre-check`
  - Files: `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Redispatch Flow — 6-Hour Elapsed Time Check

  **What to do**:
  - Update `src/inngest/redispatch.ts` to add the 6-hour total budget check
  - Query `task.created_at` from Supabase and compare against current time
  - If elapsed time > 6 hours: escalate to Slack and set task status to `AwaitingInput` with failure_reason `"Total timeout budget (6h) exceeded after N dispatch attempts"`
  - If elapsed time <= 6 hours AND dispatch_attempts < 3: proceed with re-dispatch (emit `engineering/task.received`)
  - If dispatch_attempts >= 3 (regardless of time): escalate (this is the existing behavior from lifecycle.ts finalize)
  - Add `repoUrl` and `repoBranch` to the redispatch event data (read from the task's project config) so the new lifecycle instance can dispatch correctly
  - Use structured logger (from Task 2) for all logging
  - Write tests for: time check passes, time check fails, attempt limit reached

  **Must NOT do**:
  - Add exponential backoff or jitter to redispatch timing
  - Rewrite lifecycle.ts finalize logic (that already handles attempt counting)
  - Change the 3-attempt limit or 6-hour budget

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7, 8, 10, 11)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Task 2 (needs logger)

  **References**:
  - `src/inngest/redispatch.ts` — existing 27-line skeleton with TODO for elapsed time check
  - Architecture doc §10 MVP Lifecycle Function — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 1228-1243 — redispatch handler spec with elapsed time check
  - `tests/inngest/redispatch.test.ts` — existing 3 tests for the skeleton

  **Acceptance Criteria**:
  - [ ] Redispatch checks `task.created_at` against 6-hour budget
  - [ ] Elapsed > 6h → task status = `AwaitingInput`, failure_reason populated, Slack alert
  - [ ] Elapsed <= 6h AND attempts < 3 → new `engineering/task.received` event emitted with repoUrl/repoBranch
  - [ ] Attempts >= 3 → escalation regardless of elapsed time
  - [ ] `pnpm test -- --run tests/inngest/redispatch.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: 6-hour budget exceeded
    Tool: Bash (Vitest)
    Steps:
      1. Mock task.created_at = 7 hours ago, dispatch_attempts = 1
      2. Trigger redispatch function
      3. Assert task status changed to AwaitingInput
      4. Assert Slack postMessage called
    Expected Result: Escalation triggered, no re-dispatch
    Evidence: .sisyphus/evidence/task-9-time-exceeded.txt

  Scenario: Within budget — re-dispatch proceeds
    Tool: Bash (Vitest)
    Steps:
      1. Mock task.created_at = 2 hours ago, dispatch_attempts = 1
      2. Trigger redispatch function
      3. Assert engineering/task.received event emitted with repoUrl and repoBranch
    Expected Result: Re-dispatch event sent
    Evidence: .sisyphus/evidence/task-9-redispatch-ok.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): add 6h elapsed time check to redispatch`
  - Files: `src/inngest/redispatch.ts`, `tests/inngest/redispatch.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 10. Agent Versioning — Link Executions at Runtime

  **What to do**:
  - In `src/workers/orchestrate.mts`, at execution start (Step 6 — PATCH execution starting), compute the current agent version hash and call `ensureAgentVersion()` from Task 5
  - Use the prompt template (from the task context injection), the model ID (from environment or config), and the tool config (from project tooling_config) as inputs to the hash
  - Write the returned `agent_version_id` to the execution record via PostgREST PATCH
  - Ensure every execution created from this point forward has a non-null `agent_version_id`
  - Write tests verifying the version is linked and the hash is computed from real values

  **Must NOT do**:
  - Create new agent version on every execution (upsert handles dedup)
  - Implement version comparison or performance tracking
  - Modify the seed agent_version record

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7, 8, 9, 11)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `src/lib/agent-version.ts` — created in Task 5 (computeVersionHash, ensureAgentVersion)
  - `src/workers/orchestrate.mts` — Step 6 PATCH execution starting
  - `src/workers/lib/postgrest-client.ts` — PostgREST client for PATCH
  - Architecture doc §23 Linking Versions to Executions — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 2480-2483

  **Acceptance Criteria**:
  - [ ] Every execution row has a non-null `agent_version_id` after orchestrate.mts runs
  - [ ] Version hash is computed from actual prompt template + model + tool config
  - [ ] Repeated executions with same config reuse the same agent_version_id
  - [ ] `pnpm test -- --run tests/workers/orchestrate.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Execution linked to agent version
    Tool: Bash (Vitest)
    Steps:
      1. Run orchestrate.mts with mocked dependencies
      2. Assert PostgREST PATCH to executions includes agent_version_id
      3. Assert agent_version_id is non-null
    Expected Result: agent_version_id written to execution
    Evidence: .sisyphus/evidence/task-10-version-linked.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): link executions to agent versions at runtime`
  - Files: `src/workers/orchestrate.mts`, `tests/workers/orchestrate.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 11. Fly.io Machine Dispatch in Lifecycle

  **What to do**:
  - Replace the placeholder `{ id: 'placeholder-machine-id' }` in `src/inngest/lifecycle.ts` `dispatch-fly-machine` step with real `flyApi.createMachine()` call
  - Import and use the Fly.io client from Task 3 (`src/lib/fly-client.ts`)
  - Pass machine config: image = `registry.fly.io/ai-employee-workers:latest` (configurable via env `FLY_WORKER_IMAGE`), VM size = `performance-2x`, env vars = { TASK_ID, REPO_URL, REPO_BRANCH } + credentials from Fly.io Secrets
  - Read app name from `FLY_WORKER_APP` environment variable
  - Add prerequisite verification: if `FLY_API_TOKEN` or `FLY_WORKER_APP` are not set, throw a descriptive error and skip dispatch (task escalates)
  - Store the REAL machine ID in the execution record (PATCH executions with `runtime_id = machine.id`)
  - Handle `createMachine` failure: if all Inngest retries exhaust, task escalates to AwaitingInput
  - Update tests to mock the fly-client instead of checking for placeholder

  **Must NOT do**:
  - Make real Fly.io API calls in tests
  - Implement volume forking
  - Implement pre-warmed machine pool
  - Hard-code the Fly.io app name or image URI

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7, 8, 9, 10)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 13, 14
  - **Blocked By**: Task 3

  **References**:
  - `src/inngest/lifecycle.ts` lines 48-51 — placeholder dispatch step
  - `src/lib/fly-client.ts` — created in Task 3 (createMachine, destroyMachine)
  - Architecture doc §9.2 Task Context Injection — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 933-940 — env vars: TASK_ID, REPO_URL, REPO_BRANCH + credentials
  - Architecture doc §7.3 Machine Lifecycle — lines 572-587 — performance-2x spec, cost, teardown

  **Acceptance Criteria**:
  - [ ] `dispatch-fly-machine` step calls `flyApi.createMachine()` instead of returning placeholder
  - [ ] Machine config includes correct env vars (TASK_ID, REPO_URL, REPO_BRANCH)
  - [ ] Image URI is configurable via `FLY_WORKER_IMAGE` env var
  - [ ] App name is configurable via `FLY_WORKER_APP` env var
  - [ ] Missing `FLY_API_TOKEN` → descriptive error, task escalates
  - [ ] Real machine ID stored in execution record via PostgREST PATCH
  - [ ] `pnpm test -- --run tests/inngest/lifecycle.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Real dispatch with mocked Fly.io API
    Tool: Bash (Vitest)
    Steps:
      1. Mock fly-client.createMachine to return { id: 'fly-machine-abc123', state: 'started' }
      2. Set FLY_API_TOKEN, FLY_WORKER_APP in test env
      3. Trigger lifecycle function
      4. Assert createMachine called with correct image + env vars
      5. Assert execution record PATCHed with runtime_id = 'fly-machine-abc123'
    Expected Result: Dispatch uses fly-client, machine ID persisted
    Evidence: .sisyphus/evidence/task-11-fly-dispatch.txt

  Scenario: Missing FLY_API_TOKEN — graceful failure
    Tool: Bash (Vitest)
    Steps:
      1. Unset FLY_API_TOKEN from test env
      2. Trigger lifecycle function
      3. Assert task status changed to AwaitingInput
      4. Assert failure_reason mentions missing token
    Expected Result: Task escalated, not silently stuck
    Evidence: .sisyphus/evidence/task-11-missing-token.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): replace placeholder with real Fly.io machine dispatch`
  - Files: `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 12. tooling_config Re-Entry in Fix Loop

  **What to do**:
  - In `src/workers/orchestrate.mts`, move the `fetchProjectConfig()` call from Step 12 (post-fix-loop) to Step 4 (pre-fix-loop) so that the real `tooling_config` is available for the validation pipeline
  - Pass the fetched `tooling_config` (TypeScript command, lint command, test command, etc.) to `runWithFixLoop()` and `runValidationPipeline()` instead of using `DEFAULT_TOOLING_CONFIG`
  - Keep the fallback to `DEFAULT_TOOLING_CONFIG` if `fetchProjectConfig()` returns null
  - Update the fix loop and validation pipeline to accept optional tooling config overrides
  - Write tests verifying real config is used when available and defaults are used on failure

  **Must NOT do**:
  - Change the validation pipeline stage order
  - Add new validation stages
  - Modify the fix loop iteration limits

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent of Wave 2 tasks)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: None (can start independently)

  **References**:
  - `src/workers/orchestrate.mts` — Step 12 fetchProjectConfig (currently post-fix-loop)
  - `src/workers/lib/validation-pipeline.ts` — validation stage runner, uses tooling config for commands
  - `src/workers/lib/fix-loop.ts` — fix loop wrapper around validation pipeline
  - Phase 6 known limitations — `docs/2026-03-30-2038-phase6-completion-delivery.md` line 352 — "tooling_config re-entry is Phase 7 cleanup"

  **Acceptance Criteria**:
  - [ ] `fetchProjectConfig()` is called before the fix loop, not after
  - [ ] Real `tooling_config` is passed to `runWithFixLoop()` when available
  - [ ] `DEFAULT_TOOLING_CONFIG` is used as fallback when fetchProjectConfig returns null
  - [ ] No change to validation pipeline behavior when real config matches defaults
  - [ ] `pnpm test -- --run tests/workers/orchestrate.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Real tooling config used in fix loop
    Tool: Bash (Vitest)
    Steps:
      1. Mock fetchProjectConfig to return custom tooling_config
      2. Run orchestrate flow
      3. Assert validation pipeline receives custom config
    Expected Result: Custom config passed to fix loop
    Evidence: .sisyphus/evidence/task-12-tooling-config.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): pass real tooling_config to fix loop`
  - Files: `src/workers/orchestrate.mts`, `tests/workers/orchestrate.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 13. Fly.io Machine Cleanup in Lifecycle Finalize

  **What to do**:
  - In `src/inngest/lifecycle.ts` finalize step, replace the two TODO comments for `flyApi.destroyMachine()` (lines 61 and 160) with real calls using the fly-client from Task 3
  - On completion (result received): call `flyApi.destroyMachine({ appName, machineId: machine.id })` as a backup cleanup (machine self-destructs first)
  - On timeout (result is null): call `flyApi.destroyMachine()` before checking dispatch_attempts
  - Both calls must use `.catch(() => {})` — machine may already be gone (self-destroyed or 404)
  - Read `FLY_WORKER_APP` from environment for the app name
  - Write tests verifying cleanup is called on both paths and 404 is handled gracefully

  **Must NOT do**:
  - Make cleanup blocking (it's a fire-and-forget backup)
  - Fail the lifecycle function if cleanup fails
  - Add cleanup to any step other than finalize

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 14, 15, 16)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 14
  - **Blocked By**: Task 11

  **References**:
  - `src/inngest/lifecycle.ts` lines 61-62 — TODO: `await flyApi.destroyMachine(machine.id).catch(() => {})`
  - `src/inngest/lifecycle.ts` lines 160-161 — TODO: same cleanup on success path
  - `src/lib/fly-client.ts` — fly client from Task 3 (destroyMachine handles 404)
  - Architecture doc §7.3 Teardown — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 585-587

  **Acceptance Criteria**:
  - [ ] `flyApi.destroyMachine()` called in finalize on completion path (backup cleanup)
  - [ ] `flyApi.destroyMachine()` called in finalize on timeout path (before re-dispatch check)
  - [ ] Both calls use `.catch(() => {})` — non-blocking, non-fatal
  - [ ] Tests verify cleanup is called with correct machine ID and app name
  - [ ] `pnpm test -- --run tests/inngest/lifecycle.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Machine cleanup on completion
    Tool: Bash (Vitest)
    Steps:
      1. Mock fly-client.destroyMachine
      2. Trigger lifecycle with completion event (result received)
      3. Assert destroyMachine called with the dispatched machine ID
    Expected Result: Cleanup attempted
    Evidence: .sisyphus/evidence/task-13-cleanup-completion.txt

  Scenario: Cleanup failure doesn't break lifecycle
    Tool: Bash (Vitest)
    Steps:
      1. Mock fly-client.destroyMachine to throw Error
      2. Trigger lifecycle with completion event
      3. Assert lifecycle completes successfully (task → Done)
    Expected Result: Lifecycle succeeds despite cleanup failure
    Evidence: .sisyphus/evidence/task-13-cleanup-failure.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): add Fly.io machine cleanup in lifecycle finalize`
  - Files: `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 14. Watchdog Cron — Stale Detection + Recovery

  **What to do**:
  - Create `src/inngest/watchdog.ts` with an Inngest cron function running every 10 minutes
  - Export the handler as a pure function `runWatchdog(prisma, flyClient, inngest, slackClient)` for testability
  - **Stale execution detection**: query `executions` where `heartbeat_at < NOW() - INTERVAL '10 minutes'` AND task status = `Executing`
  - For each stale execution:
    - Check machine status via `flyClient.getMachine()` — if machine is dead (404 or stopped state), proceed with recovery
    - If machine is still alive: skip (machine may be slow but not dead)
  - **Recovery logic for dead machines**: update task status to `Ready`, increment `dispatch_attempts`, write `task_status_log` (actor: `watchdog`)
  - **4h+ machine destruction**: query for machines running > 4 hours via execution records, call `flyClient.destroyMachine()` (handle 404 as success)
  - **Submitting task recovery**: query tasks in `Submitting` status with no lifecycle function completion for > 15 minutes — emit `engineering/task.completed` event on machine's behalf using the deterministic event ID pattern from Task 6 completion module
  - **Dispatch attempt guard**: check `dispatch_attempts < 3` before re-dispatching. If >= 3, escalate to Slack and set AwaitingInput
  - Use structured logger throughout
  - Write comprehensive tests for all detection and recovery paths

  **Must NOT do**:
  - Re-dispatch tasks in terminal states (Done, Cancelled, Stale)
  - Bypass the 3-attempt dispatch limit
  - Cancel running Inngest functions (that's a future enhancement)
  - Make real Fly.io or Slack API calls in tests

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on many Wave 2 tasks)
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 3, 6, 7, 8, 9, 11, 13

  **References**:
  - Architecture doc §10.1 Layer 3 Watchdog Cron — `docs/2026-03-22-2317-ai-employee-architecture.md` lines 1256-1259 — full watchdog spec: stale detection, machine destroy, Submitting recovery
  - Architecture doc §8 Reverse-Path SPOF — lines 660-668 — watchdog emits completion event for stuck Submitting tasks
  - `src/workers/lib/completion.ts` — deterministic event ID pattern: `task-${taskId}-completion-${executionId}`
  - `src/lib/fly-client.ts` — getMachine, destroyMachine (from Task 3)
  - `src/lib/slack-client.ts` — postMessage for escalation
  - `src/inngest/lifecycle.ts` — lifecycle function pattern reference
  - `src/inngest/redispatch.ts` — redispatch flow (from Task 9)
  - Implementation phases doc Phase 7 watchdog criteria — `docs/2026-03-25-1901-mvp-implementation-phases.md` lines 795-863

  **Acceptance Criteria**:
  - [ ] `src/inngest/watchdog.ts` exists with 10-minute cron schedule
  - [ ] `runWatchdog` exported as a testable pure function
  - [ ] Stale executions (heartbeat > 10 min old, status Executing) are detected
  - [ ] Dead machines trigger recovery (status → Ready, dispatch_attempts++)
  - [ ] Alive machines are skipped (no false positive recovery)
  - [ ] 4h+ machines are destroyed via flyClient.destroyMachine()
  - [ ] Submitting tasks stuck > 15 min trigger completion event emission
  - [ ] dispatch_attempts >= 3 → Slack escalation, task → AwaitingInput
  - [ ] Terminal state tasks (Done, Cancelled, Stale) are never re-dispatched
  - [ ] task_status_log entries written with actor = 'watchdog'
  - [ ] Fly.io 404 on destroyMachine handled as success
  - [ ] `pnpm test -- --run tests/inngest/watchdog.test.ts` passes
  - [ ] Watchdog function registered in `src/gateway/inngest/serve.ts`

  **QA Scenarios**:

  ```
  Scenario: Detect and recover stale execution with dead machine
    Tool: Bash (Vitest)
    Steps:
      1. Create mock execution with heartbeat_at = 15 minutes ago, task status = Executing
      2. Mock flyClient.getMachine to return 404 (machine dead)
      3. Call runWatchdog()
      4. Assert task status changed to Ready
      5. Assert dispatch_attempts incremented by 1
      6. Assert task_status_log entry with actor = 'watchdog'
    Expected Result: Task recovered for re-dispatch
    Evidence: .sisyphus/evidence/task-14-stale-recovery.txt

  Scenario: Skip alive machine (no false positive)
    Tool: Bash (Vitest)
    Steps:
      1. Create mock execution with heartbeat_at = 12 minutes ago
      2. Mock flyClient.getMachine to return { state: 'started' } (alive)
      3. Call runWatchdog()
      4. Assert task status NOT changed
    Expected Result: No action taken on alive machine
    Evidence: .sisyphus/evidence/task-14-alive-skip.txt

  Scenario: Recover stuck Submitting task
    Tool: Bash (Vitest)
    Steps:
      1. Create task with status = 'Submitting', updated_at = 20 minutes ago
      2. Call runWatchdog()
      3. Assert engineering/task.completed event emitted with deterministic ID
    Expected Result: Completion event emitted on machine's behalf
    Evidence: .sisyphus/evidence/task-14-submitting-recovery.txt

  Scenario: Respect 3-attempt limit
    Tool: Bash (Vitest)
    Steps:
      1. Create stale execution with dispatch_attempts = 3
      2. Mock flyClient.getMachine to return 404
      3. Call runWatchdog()
      4. Assert Slack postMessage called (escalation)
      5. Assert task status = AwaitingInput
    Expected Result: Escalation, not re-dispatch
    Evidence: .sisyphus/evidence/task-14-attempt-limit.txt

  Scenario: Destroy 4h+ machine
    Tool: Bash (Vitest)
    Steps:
      1. Create execution with created_at = 5 hours ago, status = running
      2. Call runWatchdog()
      3. Assert flyClient.destroyMachine called
    Expected Result: Long-running machine destroyed
    Evidence: .sisyphus/evidence/task-14-4h-destroy.txt
  ```

  **Commit**: YES
  - Message: `feat(phase7): add watchdog cron for stale detection and recovery`
  - Files: `src/inngest/watchdog.ts`, `tests/inngest/watchdog.test.ts`, `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 15. Update progress.json with Phase 7 Checkpoints

  **What to do**:
  - Update `.sisyphus/progress.json` Phase 7 entry:
    - Set `status: "complete"`
    - Set `started_at` and `completed_at` timestamps
    - Set `plan_file: ".sisyphus/plans/2026-03-31-1414-phase7-resilience.md"`
    - Set `doc_file` to the Phase 7 completion doc path (from Task 16)
    - Update `last_updated` and `last_session_id` at the top level
    - Set each checkpoint status to `"complete"` with `verified_at` timestamps and appropriate `verify_command` values
    - Add verify_commands for each checkpoint:
      - watchdog_cron: `pnpm test -- --run tests/inngest/watchdog.test.ts`
      - redispatch_flow: `pnpm test -- --run tests/inngest/redispatch.test.ts`
      - cost_circuit_breaker: `pnpm test -- --run tests/lib/call-llm.test.ts`
      - waitforevent_race_fix: `pnpm test -- --run tests/inngest/lifecycle.test.ts`
      - agent_versioning: `pnpm test -- --run tests/lib/agent-version.test.ts`
      - structured_logging: `pnpm test -- --run tests/lib/logger.test.ts`
    - Add new checkpoints not in the original:
      - fly_dispatch: `pnpm test -- --run tests/inngest/lifecycle.test.ts`
      - token_tracking: `pnpm test -- --run tests/workers/lib/token-tracker.test.ts`
      - tooling_config_reentry: `pnpm test -- --run tests/workers/orchestrate.test.ts`
    - Update `resume_hint` to: "Phase 7 is complete. Proceed to Phase 8 (Full Local E2E)."
  - Run `pnpm test -- --run` to verify all tests pass before committing

  **Must NOT do**:
  - Modify other phases' entries
  - Change the progress.json schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run after all implementation tasks)
  - **Parallel Group**: Wave 3 (after Task 14)
  - **Blocks**: Task 16
  - **Blocked By**: Task 14

  **References**:
  - `.sisyphus/progress.json` — current file, Phase 7 entry at lines 441-487
  - Previous phase entries (1-6) — format reference for checkpoints structure

  **Acceptance Criteria**:
  - [ ] progress.json Phase 7 `status` = `"complete"`
  - [ ] All 9+ checkpoints have `status: "complete"` with `verified_at` timestamps
  - [ ] `plan_file` and `doc_file` paths are correct
  - [ ] `resume_hint` points to Phase 8

  **QA Scenarios**:

  ```
  Scenario: progress.json is valid JSON
    Tool: Bash
    Steps:
      1. Run `node -e "JSON.parse(require('fs').readFileSync('.sisyphus/progress.json','utf8')); console.log('VALID')"`
      2. Assert output = "VALID"
    Expected Result: File is valid JSON
    Evidence: .sisyphus/evidence/task-15-json-valid.txt
  ```

  **Commit**: YES
  - Message: `chore(phase7): update progress.json with Phase 7 checkpoints`
  - Files: `.sisyphus/progress.json`

- [x] 16. Phase 7 Completion Doc

  **What to do**:
  - Run `date "+%Y-%m-%d-%H%M"` to get the timestamp
  - Create `docs/YYYY-MM-DD-HHMM-phase7-resilience.md` following the format of `docs/2026-03-26-1511-phase1-foundation.md`
  - Document:
    - What was built (all Phase 7 modules with descriptions)
    - Project structure changes (new files created)
    - Module architecture (interface contracts for each new module)
    - Execution flow diagrams (Mermaid — watchdog cycle, cost gate flow)
    - Test suite table (test file, count, coverage description)
    - Key design decisions (why pino, why atomic upsert, why pre-check not eliminate TOCTOU)
    - Known limitations (TOCTOU in pre-check, auto-release not implemented, gateway logging deferred)
    - What Phase 8 builds on top of Phase 7
  - Include test counts: delta from Task 1 baseline
  - Include Mermaid diagrams for the watchdog cron cycle and cost circuit breaker flow

  **Must NOT do**:
  - Include implementation details that belong in code comments
  - Add diagrams that aren't useful for understanding the architecture

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run after progress.json update)
  - **Parallel Group**: Wave 3 (after Task 15)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 15

  **References**:
  - `docs/2026-03-26-1511-phase1-foundation.md` — format reference (411 lines, sections: What Was Built, Project Structure, Module Architecture, Test Suite, Key Decisions, What Next Phase Builds)
  - `docs/2026-03-30-2038-phase6-completion-delivery.md` — most recent phase doc (424 lines)
  - All Task 1-14 implementation — source material for the doc

  **Acceptance Criteria**:
  - [ ] Doc exists at `docs/YYYY-MM-DD-HHMM-phase7-resilience.md` with correct timestamp
  - [ ] Follows Phase 1 doc format (sections, Mermaid diagrams, test table)
  - [ ] All 9 implementation areas documented
  - [ ] Test count delta from baseline included
  - [ ] Known limitations documented
  - [ ] What Phase 8 builds section included

  **QA Scenarios**:

  ```
  Scenario: Doc exists and has correct structure
    Tool: Bash
    Steps:
      1. Find the doc file: `ls docs/*phase7*.md`
      2. Assert file exists
      3. Assert file contains "## What Was Built"
      4. Assert file contains "## Test Suite"
      5. Assert file contains "## Key Design Decisions"
    Expected Result: Doc has all required sections
    Evidence: .sisyphus/evidence/task-16-doc-structure.txt
  ```

  **Commit**: YES
  - Message: `docs(phase7): add Phase 7 completion architecture doc`
  - Files: `docs/YYYY-MM-DD-HHMM-phase7-resilience.md`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod code (should use logger), commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run the full verification sequence:
  1. Start local Supabase + Inngest Dev Server + Gateway
  2. Send test Jira webhook → verify task created
  3. Verify lifecycle triggers → check Inngest dashboard
  4. Verify structured logs are JSON (parse with `JSON.parse`)
  5. Verify cost circuit breaker by inserting high-cost execution records
  6. Verify watchdog detects stale execution (insert old heartbeat)
  7. Verify agent version linked to execution
     Save evidence to `.sisyphus/evidence/final-qa/`.
     Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task(s) | Commit Message                                                                | Files                                                                                | Pre-commit           |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------- |
| 1       | `chore(phase7): establish test baseline and verify environment`               | test output only                                                                     | `pnpm test -- --run` |
| 2       | `feat(phase7): add structured JSON logger utility`                            | `src/lib/logger.ts`, `tests/lib/logger.test.ts`                                      | `pnpm test -- --run` |
| 3       | `feat(phase7): add Fly.io Machines API client`                                | `src/lib/fly-client.ts`, `tests/lib/fly-client.test.ts`                              | `pnpm test -- --run` |
| 4       | `feat(phase7): persist LLM token counts to executions table`                  | `src/workers/orchestrate.mts`, `src/workers/lib/*.ts`, `tests/workers/lib/*.test.ts` | `pnpm test -- --run` |
| 5       | `feat(phase7): add agent version hash computation and upsert`                 | `src/lib/agent-version.ts`, `tests/lib/agent-version.test.ts`                        | `pnpm test -- --run` |
| 6       | `refactor(phase7): migrate workers and inngest to structured logger`          | `src/workers/**/*.ts`, `src/inngest/**/*.ts`, `tests/**/*.test.ts`                   | `pnpm test -- --run` |
| 7       | `feat(phase7): add Slack alerting and lifecycle gate to cost circuit breaker` | `src/lib/call-llm.ts`, `src/inngest/lifecycle.ts`, `tests/**/*.test.ts`              | `pnpm test -- --run` |
| 8       | `feat(phase7): add waitForEvent race condition pre-check`                     | `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`                        | `pnpm test -- --run` |
| 9       | `feat(phase7): add 6h elapsed time check to redispatch`                       | `src/inngest/redispatch.ts`, `tests/inngest/redispatch.test.ts`                      | `pnpm test -- --run` |
| 10      | `feat(phase7): link executions to agent versions at runtime`                  | `src/workers/orchestrate.mts`, `src/lib/agent-version.ts`, `tests/**/*.test.ts`      | `pnpm test -- --run` |
| 11      | `feat(phase7): replace placeholder with real Fly.io machine dispatch`         | `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`                        | `pnpm test -- --run` |
| 12      | `feat(phase7): pass real tooling_config to fix loop`                          | `src/workers/orchestrate.mts`, `tests/workers/orchestrate.test.ts`                   | `pnpm test -- --run` |
| 13      | `feat(phase7): add Fly.io machine cleanup in lifecycle finalize`              | `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`                        | `pnpm test -- --run` |
| 14      | `feat(phase7): add watchdog cron for stale detection and recovery`            | `src/inngest/watchdog.ts`, `tests/inngest/watchdog.test.ts`                          | `pnpm test -- --run` |
| 15      | `chore(phase7): update progress.json with Phase 7 checkpoints`                | `.sisyphus/progress.json`                                                            | —                    |
| 16      | `docs(phase7): add Phase 7 completion architecture doc`                       | `docs/YYYY-MM-DD-HHMM-phase7-resilience.md`                                          | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm tsc --noEmit          # Expected: 0 errors
pnpm lint                  # Expected: 0 errors
pnpm test -- --run         # Expected: all pass, 0 failures
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (new + existing, 0 regressions)
- [ ] progress.json Phase 7 status = "complete"
- [ ] Phase completion doc created
