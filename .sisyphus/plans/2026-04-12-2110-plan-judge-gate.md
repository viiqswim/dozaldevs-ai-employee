# Plan: MiniMax M2.7 Plan Judge Gate (Option 2 — Judge + Corrective Replay)

## TL;DR

> **Quick Summary**: Add a lightweight LLM judge gate (Claude Haiku 4.5 via OpenRouter) that intercepts MiniMax M2.7's plan file after Phase 1 planning, verifies it matches the ticket requirements using 3 binary rubric checks, and on rejection re-runs Phase 1 with corrective feedback injected (max 2 retries). After implementation, validate end-to-end with a live `formatCurrency` E2E run on Fly.io hybrid mode.
>
> **Deliverables**:
>
> - `src/workers/lib/plan-judge.ts` — direct OpenRouter API caller with SVR rubric, PASS-on-failure default
> - `buildCorrectionPrompt()` added to `src/workers/lib/prompt-builder.ts`
> - `planVerifierModel` config field in `src/workers/config/long-running.ts`
> - `PLAN_VERIFIER_MODEL` wired into all 3 dispatch paths in `src/inngest/lifecycle.ts`
> - Retry loop injected into `src/workers/lib/planning-orchestrator.ts`
> - `tests/workers/lib/plan-judge.test.ts` (new) + `planning-orchestrator.test.ts` updated
> - Passing `pnpm test -- --run` (≥515 tests)
> - Docker image rebuilt + pushed to Fly.io
> - Successful E2E run: `pnpm verify:e2e` 12/12, PR diff contains `Intl.NumberFormat` + `formatCurrency`, Fly logs confirm judge ran
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 6 waves
> **Critical Path**: T1 → T5 → T6 → T7 → T8–T11

---

## Context

### Original Request

> "The reason I chose the MiniMax M2.7 model is because of how good it is at that price point. That said, as you mentioned, it's not very good at following instructions. Do you have any ideas on how we can mix different models into our current system so that we can get MiniMax M2.7 back on track if it finds that it's doing something wrong?"
>
> "Please help me put together a plan for option two, including re-running this full workflow with the same task to see if it performed flawlessly without problems. Also, add to the plan that any issues should be corrected before proceeding to the next task."

### Interview Summary

**Key Discussions**:

- MiniMax M2.7 has instruction-following score ~56/100 — excellent at coding but treats constraints as suggestions
- In Clean Run 3 (PR #30), it implemented `formatDate` enhancements instead of `formatCurrency` despite clear ticket requirements — pipeline 12/12 infra-green but wrong code delivered
- Option 2 selected: Judge + Corrective Replay (intercept plan file, not code output — cheaper, earlier catch)
- Judge model: Claude Haiku 4.5 via OpenRouter (`anthropic/claude-haiku-4-5`) — ~$0.001/call, best instruction-following in cheap tier
- Gate disabled when `PLAN_VERIFIER_MODEL=''` (strict opt-in, not fallback to `OPENROUTER_MODEL`)
- Max 2 retries before `PlanJudgeExhaustedError` — prevents infinite loops
- API failure → PASS + warn log (never block the pipeline on judge unavailability)

**Research Findings**:

- **Injection point confirmed**: `src/workers/lib/planning-orchestrator.ts` between `validatePlan()` (structural check passes) and `chmod 0o444` (plan file locked) — ideal intercept
- **`reviews` table exists** in Prisma schema with `verdict`/`comments` fields — judge verdict is ephemeral, do NOT write to `reviews` table
- **`OPENROUTER_MODEL`** env var already flows through all 3 dispatch paths in `lifecycle.ts` — `PLAN_VERIFIER_MODEL` follows the same pattern
- **`planning-orchestrator.test.ts` exists** — follow its `createMock*` factory pattern with `overrides` spread
- **`buildCorrectionPrompt` must be sync** to match `PromptBuilder` interface consistency (use `mockReturnValue` not `mockResolvedValue` in tests)

### Metis Review

**Identified Gaps** (addressed):

- Judge injected as `planJudge?: PlanJudge` into `PlanningPhaseOptions` — NOT constructed inside `runPlanningPhase` (avoids tight coupling)
- Retry loop is internal to `runPlanningPhase` — NOT re-called from `orchestrate.mts`
- On retry: delete/overwrite plan file BEFORE re-running planning session; `chmod 444` only after judge PASS
- `buildCorrectionPrompt` produces complete replacement prompt (full ticket context + rejection reason), not a short addendum
- `PLAN_VERIFIER_MODEL=''` empty string = gate disabled; check must be `if (!planVerifierModel)` not falsy-on-undefined
- Judge outputs structured JSON via `response_format: { type: 'json_object' }` — parse and validate shape before trusting

---

## Work Objectives

### Core Objective

Intercept MiniMax M2.7's plan file immediately after structural validation, verify it matches the ticket requirements via a cheap judge model, and auto-correct by re-running planning with feedback injected (max 2 retries).

### Concrete Deliverables

- `src/workers/lib/plan-judge.ts` — exported `callPlanJudge(planContent, ticket, model): Promise<JudgeResult>`
- `src/workers/lib/prompt-builder.ts` — exported `buildCorrectionPrompt(ticket, rejectionReason, attempt): string`
- `src/workers/config/long-running.ts` — `planVerifierModel: string` field added
- `src/inngest/lifecycle.ts` — `PLAN_VERIFIER_MODEL` env var wired into all 3 machine dispatch env objects
- `src/workers/lib/planning-orchestrator.ts` — `PlanJudge` type + `planJudge?` in options + internal retry loop
- `tests/workers/lib/plan-judge.test.ts` — 5 test scenarios
- `tests/workers/lib/planning-orchestrator.test.ts` — 5 judge integration scenarios added
- `.env.example` — `PLAN_VERIFIER_MODEL=anthropic/claude-haiku-4-5` added
- Docker image rebuilt + pushed to Fly.io registry
- E2E run: PR with correct `formatCurrency` implementation, `verify:e2e` 12/12, Fly logs confirm judge ran

### Definition of Done

- [ ] `pnpm test -- --run` exits 0, ≥515 tests pass
- [ ] `docker build -t ai-employee-worker:latest .` exits 0
- [ ] `pnpm fly:image` exits 0
- [ ] `pnpm verify:e2e --task-id <uuid>` → 12/12 checks pass
- [ ] PR diff contains `Intl.NumberFormat` and `formatCurrency` (≥3 occurrences)
- [ ] `fly logs --app ai-employee-workers` shows `plan-judge` log lines confirming gate ran

### Must Have

- Judge gate intercepts after `validatePlan()` succeeds, before `chmod 0o444`
- Max 2 retries with `PlanJudgeExhaustedError` on exhaustion
- API failure defaults to PASS with exact warn log: `"plan-judge: API unavailable, defaulting to PASS"`
- `PLAN_VERIFIER_MODEL=''` disables gate entirely (explicit check, not undefined-falsy)
- E2E validates with a fresh `TEST-$(date +%s)` key (NEVER reuse blocked keys)
- Any issue found during a task MUST be corrected before proceeding to the next task

### Must NOT Have (Guardrails)

- Do NOT write judge verdicts to the `reviews` table (ephemeral only — log + retry)
- Do NOT construct `PlanJudge` inside `runPlanningPhase` — inject via options
- Do NOT call `runPlanningPhase` from `orchestrate.mts` on retry — retry is internal
- Do NOT set `chmod 444` until judge returns PASS (or gate is disabled)
- Do NOT use blocked E2E keys: `TEST-1775855651`, `TEST-100`, `TEST-1775866864`, `TEST-1775869708`, `TEST-1775876158`, `TEST-1775950556`, `TEST-1775951346`, `TEST-1776026083`, `TEST-1776026999`
- Do NOT merge the PR — stop at PR creation
- Do NOT fix code unrelated to this feature
- Do NOT use `--no-verify` in any git operation
- Do NOT add `Co-authored-by` lines to commits
- All long-running commands (>30s) MUST use tmux (AGENTS.md Long-Running Command Protocol)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, `pnpm test`)
- **Automated tests**: YES (Tests-after for T1–T5, TDD for T6)
- **Framework**: Vitest (`pnpm test -- --run`)
- **Baseline**: ≥515 tests must pass before and after

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/judge-gate/task-{N}-{slug}.{ext}`.

- **Unit tests**: Vitest — `pnpm test -- --run`
- **API calls**: Bash (`curl`) — OpenRouter endpoint validation
- **E2E**: tmux (Long-Running Command Protocol) + Bash (`fly logs`)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — no dependencies):
├── T1: Create src/workers/lib/plan-judge.ts [unspecified-high]
└── T2: Config + env wiring (long-running.ts + .env.example) [quick]

Wave 2 (After Wave 1 — parallel):
├── T3: Add buildCorrectionPrompt() to prompt-builder.ts [quick]
└── T4: Wire PLAN_VERIFIER_MODEL into lifecycle.ts dispatch paths [quick]

Wave 3 (After Wave 2 — sequential):
└── T5: Inject judge gate into planning-orchestrator.ts [unspecified-high]

Wave 4 (After T5):
└── T6: Write plan-judge.test.ts + update planning-orchestrator.test.ts + pnpm test [unspecified-high]

Wave 5 (After T6):
└── T7: docker build + pnpm fly:image [quick]

Wave 6 — E2E Validation (After T7 — sequential sub-tasks):
├── T8:  Pre-flight checks (8 gates) [unspecified-high]
├── T9:  Fire E2E run via USE_FLY_HYBRID=1 pnpm trigger-task [unspecified-high]
├── T10: Monitor to completion + inline issue resolution [unspecified-high]
└── T11: Verify: pnpm verify:e2e + PR diff + fly logs [unspecified-high]

Critical Path: T1 → T5 → T6 → T7 → T8 → T9 → T10 → T11
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks   |
| ---- | ---------- | -------- |
| T1   | —          | T5       |
| T2   | —          | T4, T5   |
| T3   | T1         | T5       |
| T4   | T2         | (deploy) |
| T5   | T1, T2, T3 | T6       |
| T6   | T5         | T7       |
| T7   | T6         | T8       |
| T8   | T7         | T9       |
| T9   | T8         | T10      |
| T10  | T9         | T11      |
| T11  | T10        | —        |

### Agent Dispatch Summary

- **Wave 1**: T1 → `unspecified-high`, T2 → `quick`
- **Wave 2**: T3 → `quick`, T4 → `quick`
- **Wave 3**: T5 → `unspecified-high`
- **Wave 4**: T6 → `unspecified-high`
- **Wave 5**: T7 → `quick`
- **Wave 6**: T8–T11 → `unspecified-high` (sequential)

---

## TODOs

- [x] T1. Create `src/workers/lib/plan-judge.ts`

  **What to do**:
  - Create a new file `src/workers/lib/plan-judge.ts` exporting:
    - `JudgeResult` type: `{ verdict: 'PASS' | 'REJECT'; checks: { scope_match: boolean; function_names: boolean; no_hallucination: boolean }; rejection_reason?: string }`
    - `PlanJudge` type (function signature): `(planContent: string, ticket: Ticket) => Promise<JudgeResult>`
    - `callPlanJudge(planContent: string, ticket: Ticket, model: string): Promise<JudgeResult>` — the concrete implementation
  - Implementation:
    - If `model` is empty string, return `{ verdict: 'PASS', checks: { scope_match: true, function_names: true, no_hallucination: true } }` immediately (gate disabled)
    - Call `https://openrouter.ai/api/v1/chat/completions` via `fetch` with:
      - `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}`
      - `model: model` (the passed-in `PLAN_VERIFIER_MODEL`)
      - `response_format: { type: 'json_object' }`
      - Temperature: 0 (deterministic)
      - System prompt: judge persona with SVR rubric (see below)
      - User message: plan content + ticket summary
    - Parse response JSON — validate it has `verdict` field (`'PASS'` or `'REJECT'`), `checks` object with 3 boolean fields
    - If API call throws, network error, non-200, or JSON parse fails → log `warn("plan-judge: API unavailable, defaulting to PASS")` and return `{ verdict: 'PASS', checks: { scope_match: true, function_names: true, no_hallucination: true } }`
    - Log `info("plan-judge: verdict=%s checks=%j", result.verdict, result.checks)` on every call
  - SVR Rubric (3 binary checks — include verbatim in judge system prompt):

    ```
    You are a strict plan verifier. Given a plan file and a ticket, respond ONLY with valid JSON.

    Check these 3 things:
    1. scope_match: Does the plan implement exactly what the ticket asks? (true/false)
    2. function_names: Do the function names in the plan match what the ticket explicitly requests? (true/false)
    3. no_hallucination: Does the plan avoid implementing features NOT mentioned in the ticket? (true/false)

    Respond with:
    {
      "verdict": "PASS" or "REJECT",
      "checks": { "scope_match": bool, "function_names": bool, "no_hallucination": bool },
      "rejection_reason": "string — only present if verdict is REJECT, explain what is wrong"
    }

    verdict is PASS only if ALL 3 checks are true. Otherwise REJECT.
    ```

  - Import `Ticket` type from the workers' existing ticket types (check `src/workers/lib/` for the import path — do NOT create a new type, reuse what exists)
  - Use `node-fetch` or native `fetch` — check which is available in the worker's Node context (prefer native `fetch` if Node ≥20 is confirmed, fall back to `node-fetch`)

  **Must NOT do**:
  - Do NOT write judge results to the `reviews` Prisma table
  - Do NOT import Prisma client in this file
  - Do NOT throw on API failure — catch all errors and return PASS with warn log
  - Do NOT use `OPENROUTER_MODEL` env var — use the `model` parameter passed in
  - Do NOT hardcode model name — always use the passed `model` parameter

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful API integration, error handling, and TypeScript type design — not a trivial file but not UI work
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI involved
    - `git-master`: No complex git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2)
  - **Blocks**: T3, T5
  - **Blocked By**: None (start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/workers/lib/session-manager.ts` — how OpenRouter/OpenCode API is called in worker context; follow error handling pattern
  - `src/workers/orchestrate.mts` — how `Ticket` type is used in worker entrypoint; find the import path for `Ticket`
  - `src/lib/logger.ts` — logger instance pattern (`logger.warn(...)`, `logger.info(...)`)

  **API/Type References**:
  - OpenRouter chat completions API: `POST https://openrouter.ai/api/v1/chat/completions` — same endpoint used by existing OpenCode integration
  - `response_format: { type: 'json_object' }` — enforces JSON output from the judge model
  - `Ticket` type — find in `src/workers/lib/` or `src/workers/orchestrate.mts` — do NOT redefine

  **External References**:
  - OpenRouter docs: `https://openrouter.ai/docs/requests` — request format, auth headers, `response_format` field

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/plan-judge.ts` exists and compiles (`tsc --noEmit`)
  - [ ] Exports `JudgeResult`, `PlanJudge` types and `callPlanJudge` function
  - [ ] `callPlanJudge` with empty `model` returns PASS immediately without network call
  - [ ] `callPlanJudge` with valid model + matching plan returns PASS
  - [ ] `callPlanJudge` on network error returns PASS and logs warn (unit-testable via mock)

  **QA Scenarios**:

  ```
  Scenario: Empty model string disables gate
    Tool: Bash (bun/node REPL or unit test)
    Preconditions: plan-judge.ts compiled
    Steps:
      1. Call callPlanJudge("any plan content", mockTicket, "")
      2. Assert result.verdict === "PASS"
      3. Assert no fetch() calls were made (spy/mock confirms)
    Expected Result: PASS returned immediately, no network call
    Evidence: .sisyphus/evidence/judge-gate/task-T1-disabled-gate.txt

  Scenario: API network failure defaults to PASS
    Tool: Bash (unit test with mocked fetch)
    Preconditions: fetch mocked to throw NetworkError
    Steps:
      1. Call callPlanJudge("plan", mockTicket, "anthropic/claude-haiku-4-5")
      2. Assert result.verdict === "PASS"
      3. Assert logger.warn was called with "plan-judge: API unavailable, defaulting to PASS"
    Expected Result: PASS returned, warn logged
    Failure Indicators: Error thrown instead of PASS, or no warn log
    Evidence: .sisyphus/evidence/judge-gate/task-T1-api-failure.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T1-disabled-gate.txt` — console output showing empty-model PASS
  - [ ] `task-T1-api-failure.txt` — unit test output showing PASS + warn log on failure

  **Commit**: YES
  - Message: `feat(workers): add plan-judge OpenRouter caller with SVR rubric`
  - Files: `src/workers/lib/plan-judge.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] T2. Add `planVerifierModel` to config + `.env.example`

  **What to do**:
  - In `src/workers/config/long-running.ts`:
    - Add `planVerifierModel: string` field to the config type/interface
    - Set default value `''` (empty string = gate disabled)
    - Populate from `process.env.PLAN_VERIFIER_MODEL ?? ''`
  - In `.env.example`:
    - Add line: `PLAN_VERIFIER_MODEL=anthropic/claude-haiku-4-5`
    - Place it near other model-related env vars (near `OPENROUTER_MODEL` if present, otherwise near the AI/model config section)
    - Add comment: `# Leave empty to disable the plan judge gate`
  - Do NOT modify `.env` directly — agent should instruct the human to set this value in their local `.env`

  **Must NOT do**:
  - Do NOT use `OPENROUTER_MODEL` as fallback — empty string must mean disabled, not "use default model"
  - Do NOT add to `.env` directly (that file is gitignored and contains real secrets)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple config field addition + env example update — 2 files, <10 lines total
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1)
  - **Blocks**: T4, T5
  - **Blocked By**: None (start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/config/long-running.ts` — READ THIS FILE FIRST: understand the config shape, how fields are typed and populated from `process.env`
  - `.env.example` — READ THIS FILE: understand comment style and grouping conventions

  **Acceptance Criteria**:
  - [ ] `src/workers/config/long-running.ts` compiles with new `planVerifierModel: string` field
  - [ ] Default value is `''` (empty string, not `undefined`)
  - [ ] `.env.example` contains `PLAN_VERIFIER_MODEL=anthropic/claude-haiku-4-5` with comment
  - [ ] `pnpm test -- --run` still passes (no regressions)

  **QA Scenarios**:

  ```
  Scenario: Config field present with correct default
    Tool: Bash (bun/node REPL)
    Preconditions: PLAN_VERIFIER_MODEL not set in environment
    Steps:
      1. Import config from src/workers/config/long-running.ts
      2. Assert config.planVerifierModel === ""
    Expected Result: Empty string (gate disabled by default)
    Evidence: .sisyphus/evidence/judge-gate/task-T2-config-default.txt

  Scenario: .env.example contains new variable
    Tool: Bash (grep)
    Steps:
      1. grep "PLAN_VERIFIER_MODEL" .env.example
    Expected Result: Line with PLAN_VERIFIER_MODEL=anthropic/claude-haiku-4-5 found
    Evidence: .sisyphus/evidence/judge-gate/task-T2-env-example.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T2-config-default.txt` — output showing empty string default
  - [ ] `task-T2-env-example.txt` — grep output confirming env example line

  **Commit**: YES
  - Message: `feat(config): add planVerifierModel config field and PLAN_VERIFIER_MODEL env var`
  - Files: `src/workers/config/long-running.ts`, `.env.example`
  - Pre-commit: `pnpm test -- --run`

- [x] T3. Add `buildCorrectionPrompt()` to `src/workers/lib/prompt-builder.ts`

  **What to do**:
  - Read `src/workers/lib/prompt-builder.ts` in full before making changes — understand the existing interface and all exported functions
  - Add a new exported function `buildCorrectionPrompt(ticket: Ticket, rejectionReason: string, attempt: number): string`
  - This function returns a **complete replacement prompt** — NOT a short addendum appended to the original. It includes:
    - Full ticket context (title, description, acceptance criteria — everything from `ticket`)
    - A prominent correction section explaining what the previous attempt got wrong: `rejectionReason`
    - The attempt number (`attempt` = 1 or 2) for logging/context
    - A strong instruction to the coding agent: "Your previous plan was rejected. You MUST implement exactly what the ticket requests. Here is what was wrong: [rejectionReason]. Now re-plan with strict adherence to the ticket."
  - Function signature is **sync** (returns `string`, not `Promise<string>`) — matches the existing PromptBuilder interface convention
  - The prompt structure should mirror `buildPlanningPrompt` in style but with the correction preamble prepended

  **Must NOT do**:
  - Do NOT make this function `async` — must be sync to match interface
  - Do NOT truncate the ticket content — include all fields
  - Do NOT make this a thin wrapper — it must produce a complete, self-contained prompt

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function addition to an existing file — follows established patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T4) — depends on T1 being complete (needs `Ticket` type confirmation)
  - **Blocks**: T5
  - **Blocked By**: T1 (confirm Ticket import path)

  **References**:

  **Pattern References**:
  - `src/workers/lib/prompt-builder.ts` — READ IN FULL: existing function signatures, how `Ticket` is used, return type patterns
  - `tests/workers/lib/prompt-builder.test.ts` — how existing functions are tested (mock patterns to follow in T6)

  **Acceptance Criteria**:
  - [ ] `buildCorrectionPrompt` exported from `src/workers/lib/prompt-builder.ts`
  - [ ] Returns `string` (sync, not Promise)
  - [ ] Returned string contains ticket title and rejectionReason text
  - [ ] Returned string contains correction instruction ("Your previous plan was rejected")
  - [ ] `pnpm test -- --run` still passes

  **QA Scenarios**:

  ```
  Scenario: Correction prompt contains all required sections
    Tool: Bash (bun/node REPL)
    Preconditions: prompt-builder.ts compiled
    Steps:
      1. Call buildCorrectionPrompt(mockTicket, "formatDate implemented instead of formatCurrency", 1)
      2. Assert returned string contains mockTicket.title or description content
      3. Assert returned string contains "formatDate implemented instead of formatCurrency"
      4. Assert returned string contains "rejected" or "correction" keyword
    Expected Result: Complete prompt string with all 3 sections present
    Evidence: .sisyphus/evidence/judge-gate/task-T3-correction-prompt.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T3-correction-prompt.txt` — printed output of a sample correction prompt

  **Commit**: YES
  - Message: `feat(prompt-builder): add buildCorrectionPrompt for judge retry`
  - Files: `src/workers/lib/prompt-builder.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] T4. Wire `PLAN_VERIFIER_MODEL` into all 3 dispatch paths in `lifecycle.ts`

  **What to do**:
  - Read `src/inngest/lifecycle.ts` in full before making changes
  - Find ALL places where a machine dispatch env object is constructed — there are 3 dispatch paths. Identify them by searching for where `OPENROUTER_MODEL` is set in an env object (use this as a locator anchor — do NOT rely on line numbers, search by pattern)
  - In each of the 3 env objects, add: `PLAN_VERIFIER_MODEL: process.env.PLAN_VERIFIER_MODEL ?? ''`
  - Place it adjacent to `OPENROUTER_MODEL` for readability
  - Do NOT change any other logic — purely additive change

  **Must NOT do**:
  - Do NOT use `planVerifierModel` from the config object — read directly from `process.env.PLAN_VERIFIER_MODEL ?? ''` to match how `OPENROUTER_MODEL` is passed
  - Do NOT modify dispatch logic, retry logic, or any other lifecycle behavior
  - Do NOT miss any of the 3 dispatch paths — search the entire file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Purely additive, pattern-following change — find 3 env objects, add 1 line each
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T3) — depends on T2 (config field must exist first for conceptual consistency, though runtime only needs the env var)
  - **Blocks**: T7 (deploy)
  - **Blocked By**: T2

  **References**:

  **Pattern References**:
  - `src/inngest/lifecycle.ts` — READ IN FULL: find all 3 machine dispatch env objects by searching for `OPENROUTER_MODEL`; add `PLAN_VERIFIER_MODEL` adjacent to each
  - AGENTS.md section "Hybrid Fly.io Mode" — background on the 3 dispatch paths (local Docker, Fly native, Fly hybrid)

  **Acceptance Criteria**:
  - [ ] `grep -n "PLAN_VERIFIER_MODEL" src/inngest/lifecycle.ts` returns exactly 3 matches
  - [ ] Each match is inside a machine env object (not a stray reference)
  - [ ] `pnpm test -- --run` still passes
  - [ ] `pnpm build` exits 0 (TypeScript compiles)

  **QA Scenarios**:

  ```
  Scenario: All 3 dispatch paths contain PLAN_VERIFIER_MODEL
    Tool: Bash (grep)
    Steps:
      1. grep -n "PLAN_VERIFIER_MODEL" src/inngest/lifecycle.ts
    Expected Result: Exactly 3 lines returned, each inside an env object block
    Evidence: .sisyphus/evidence/judge-gate/task-T4-grep-lifecycle.txt

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Steps:
      1. pnpm build (or tsc --noEmit)
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/judge-gate/task-T4-build.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T4-grep-lifecycle.txt` — grep output showing 3 matches
  - [ ] `task-T4-build.txt` — build success output

  **Commit**: YES
  - Message: `feat(lifecycle): wire PLAN_VERIFIER_MODEL into Fly dispatch env`
  - Files: `src/inngest/lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] T5. Inject judge gate into `src/workers/lib/planning-orchestrator.ts`

  **What to do**:
  - Read `src/workers/lib/planning-orchestrator.ts` in full before making changes
  - Read `tests/workers/lib/planning-orchestrator.test.ts` to understand mock patterns before touching the implementation
  - Add to the `PlanningPhaseOptions` interface (or equivalent options type — find it by reading the file):
    ```typescript
    planJudge?: PlanJudge
    ```
    Where `PlanJudge` is imported from `./plan-judge` (the type exported in T1)
  - Add `planVerifierModel?: string` to `PlanningPhaseOptions` if needed for the gate-disabled check
  - In `runPlanningPhase` (or the equivalent exported function — find the exact name by reading the file):
    - AFTER `validatePlan()` returns successfully (structural check passes)
    - BEFORE `chmod 0o444` (plan file locked as read-only)
    - Add an internal retry loop (max 2 retries, attempt numbers 1 and 2):
      ```
      if planJudge is provided AND planVerifierModel is non-empty:
        attempt = 1
        loop (max 2 times):
          judgeResult = await planJudge(planFileContent, ticket)
          log info: "plan-judge: attempt=%d verdict=%s" attempt judgeResult.verdict
          if judgeResult.verdict === 'PASS':
            break loop → proceed to chmod 444
          else (REJECT):
            if attempt >= 2:
              throw PlanJudgeExhaustedError("Plan judge rejected after 2 attempts: " + judgeResult.rejection_reason)
            // Retry: delete/overwrite plan file, re-run planning session with correction prompt
            delete (or overwrite with empty) the plan file
            correctionPrompt = buildCorrectionPrompt(ticket, judgeResult.rejection_reason, attempt)
            re-run the planning session using correctionPrompt as the prompt
            re-validate with validatePlan()
            if validatePlan fails: throw that error (don't retry judge again)
            attempt++
      ```
  - Add `PlanJudgeExhaustedError` class in the same file (or in a shared errors file if one exists — check `src/workers/lib/` for an errors module):
    ```typescript
    export class PlanJudgeExhaustedError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'PlanJudgeExhaustedError';
      }
    }
    ```
  - `chmod 0o444` is ONLY called after judge returns PASS (or judge is disabled)
  - Read the plan file content before calling planJudge (use `fs.readFile` at the plan path)

  **Must NOT do**:
  - Do NOT construct `callPlanJudge` inside `runPlanningPhase` — receive `planJudge` via `PlanningPhaseOptions`
  - Do NOT call `runPlanningPhase` from `orchestrate.mts` on retry — retry loop stays INTERNAL
  - Do NOT call `chmod 444` before judge PASS
  - Do NOT write judge verdict to Prisma `reviews` table
  - Do NOT exceed 2 retries (attempt 1, attempt 2 = max)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core orchestration logic with async retry loop, file operations, and new error type — requires careful sequential reasoning
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 — sequential after Wave 2
  - **Blocks**: T6
  - **Blocked By**: T1 (PlanJudge type), T2 (config field), T3 (buildCorrectionPrompt)

  **References**:

  **Pattern References**:
  - `src/workers/lib/planning-orchestrator.ts` — READ IN FULL: find `PlanningPhaseOptions`, `runPlanningPhase`, `validatePlan()`, `chmod 0o444` — understand exact flow
  - `tests/workers/lib/planning-orchestrator.test.ts` — READ IN FULL: understand `createMock*` factory patterns with `overrides` spread before changing implementation
  - `src/workers/lib/plan-judge.ts` (T1 output) — import `PlanJudge` type from here
  - `src/workers/lib/prompt-builder.ts` (T3 output) — import `buildCorrectionPrompt` from here
  - `src/lib/errors.ts` or `src/workers/lib/errors.ts` — check if a shared errors module exists; if yes, add `PlanJudgeExhaustedError` there; if not, define it in `planning-orchestrator.ts`

  **API/Type References**:
  - `PlanJudge` type from T1: `(planContent: string, ticket: Ticket) => Promise<JudgeResult>`
  - `buildCorrectionPrompt` from T3: `(ticket: Ticket, rejectionReason: string, attempt: number) => string`

  **Acceptance Criteria**:
  - [ ] `PlanningPhaseOptions` has `planJudge?: PlanJudge` field
  - [ ] `PlanJudgeExhaustedError` exported and extends `Error`
  - [ ] When `planJudge` returns REJECT on attempt 1, plan file is deleted and planning re-runs
  - [ ] When `planJudge` returns REJECT on attempt 2, `PlanJudgeExhaustedError` is thrown
  - [ ] When `planJudge` returns PASS, `chmod 0o444` is called normally
  - [ ] When `planJudge` not provided, behavior is unchanged (backward compatible)
  - [ ] `pnpm test -- --run` still passes (≥515)

  **QA Scenarios**:

  ```
  Scenario: Judge PASS on first attempt — normal flow
    Tool: Bash (unit test)
    Preconditions: planJudge mock returns { verdict: 'PASS', checks: {...} }
    Steps:
      1. Call runPlanningPhase with planJudge mock
      2. Assert planJudge called exactly once
      3. Assert chmod 0o444 called on plan file
      4. Assert no PlanJudgeExhaustedError thrown
    Expected Result: Normal completion, file locked
    Evidence: .sisyphus/evidence/judge-gate/task-T5-pass-first.txt

  Scenario: Judge REJECT attempt 1 → PASS attempt 2 — corrective retry
    Tool: Bash (unit test)
    Preconditions: planJudge mock returns REJECT on call 1, PASS on call 2
    Steps:
      1. Call runPlanningPhase with planJudge mock
      2. Assert planJudge called twice
      3. Assert buildCorrectionPrompt called once (for the retry)
      4. Assert plan file was deleted/overwritten between attempts
      5. Assert chmod 0o444 called after second PASS
    Expected Result: Retry triggered, corrective prompt used, file locked on second PASS
    Evidence: .sisyphus/evidence/judge-gate/task-T5-reject-then-pass.txt

  Scenario: Judge REJECT both attempts — exhaustion error
    Tool: Bash (unit test)
    Preconditions: planJudge mock returns REJECT on both calls
    Steps:
      1. Call runPlanningPhase with planJudge mock
      2. Assert PlanJudgeExhaustedError thrown
      3. Assert planJudge called exactly twice
      4. Assert chmod 0o444 NOT called
    Expected Result: PlanJudgeExhaustedError thrown after 2 rejections
    Evidence: .sisyphus/evidence/judge-gate/task-T5-exhausted.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T5-pass-first.txt` — unit test output for PASS scenario
  - [ ] `task-T5-reject-then-pass.txt` — unit test output for retry scenario
  - [ ] `task-T5-exhausted.txt` — unit test output for exhaustion scenario

  **Commit**: YES
  - Message: `feat(planning-orchestrator): inject judge gate with corrective replay (max 2 retries)`
  - Files: `src/workers/lib/planning-orchestrator.ts` (+ errors file if applicable)
  - Pre-commit: `pnpm test -- --run`

- [x] T6. Write `tests/workers/lib/plan-judge.test.ts` + update `planning-orchestrator.test.ts` + confirm ≥515 tests pass

  **What to do**:
  - Read `tests/workers/lib/planning-orchestrator.test.ts` in full — understand the `createMock*` factory pattern with `overrides` spread before writing anything
  - Read `tests/workers/lib/prompt-builder.test.ts` — understand assertion style and how sync returns are mocked (`mockReturnValue`, not `mockResolvedValue`)

  **New file: `tests/workers/lib/plan-judge.test.ts`** — 5 test scenarios:
  1. `callPlanJudge` with empty model returns PASS without network call
  2. `callPlanJudge` with valid model + matching plan → mock fetch returns PASS JSON → result is PASS
  3. `callPlanJudge` with valid model + mismatching plan → mock fetch returns REJECT JSON → result is REJECT with rejection_reason
  4. `callPlanJudge` when fetch throws → returns PASS + logs warn "plan-judge: API unavailable, defaulting to PASS"
  5. `callPlanJudge` when fetch returns non-200 → returns PASS + logs warn

  **Updates to `tests/workers/lib/planning-orchestrator.test.ts`** — add 5 judge integration scenarios using the existing mock factory pattern:
  1. No `planJudge` in options → judge not called, normal flow (backward compat)
  2. `planJudge` returns PASS → called once, chmod 444, no error
  3. `planJudge` returns REJECT then PASS → called twice, `buildCorrectionPrompt` called once, plan re-run, chmod 444 on second
  4. `planJudge` returns REJECT both times → `PlanJudgeExhaustedError` thrown, chmod 444 not called
  5. `planVerifierModel` is `''` → `planJudge` not called even if provided (gate disabled check)

  **Mock strategy**:
  - For `plan-judge.test.ts`: mock `fetch` globally using `vi.stubGlobal('fetch', mockFetch)` — restore in `afterEach`
  - For `planning-orchestrator.test.ts`: pass `planJudge` as a `vi.fn()` in the overrides spread to the existing `createMockOptions` factory (or equivalent — follow the exact factory pattern found in the existing test file)
  - `buildCorrectionPrompt` is sync — use `mockReturnValue` NOT `mockResolvedValue`

  **After writing tests**:
  - Run `pnpm test -- --run`
  - Must exit 0 with ≥515 tests passing
  - If any tests fail (other than the pre-existing known failures listed in AGENTS.md): fix them before proceeding
  - Capture the test output

  **Must NOT do**:
  - Do NOT use `mockResolvedValue` for `buildCorrectionPrompt` — it's sync
  - Do NOT skip error scenarios — they are required
  - Do NOT accept <515 tests passing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires reading 3 existing test files to understand patterns, then writing 2 test files with 10 scenarios total — careful pattern matching required
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 — sequential after T5
  - **Blocks**: T7
  - **Blocked By**: T5

  **References**:

  **Pattern References**:
  - `tests/workers/lib/planning-orchestrator.test.ts` — READ IN FULL: find `createMock*` factories, `overrides` pattern, how options are constructed in tests — COPY this pattern exactly
  - `tests/workers/lib/prompt-builder.test.ts` — sync mock patterns (`mockReturnValue`)
  - `src/workers/lib/plan-judge.ts` (T1) — what `callPlanJudge` exports, what `JudgeResult` looks like
  - `src/workers/lib/planning-orchestrator.ts` (T5) — what options interface looks like after T5 changes
  - AGENTS.md "Known Test Failures" — do not chase pre-existing failures: `container-boot.test.ts`, `inngest-serve.test.ts`

  **Acceptance Criteria**:
  - [ ] `tests/workers/lib/plan-judge.test.ts` created with 5 scenarios
  - [ ] `tests/workers/lib/planning-orchestrator.test.ts` updated with 5 judge scenarios
  - [ ] `pnpm test -- --run` exits 0
  - [ ] Test count ≥515 passing
  - [ ] No new test failures introduced (only pre-existing known failures allowed)

  **QA Scenarios**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run 2>&1 | tee .sisyphus/evidence/judge-gate/task-T6-test-run.txt
      2. Check exit code: echo $?
      3. grep "passing" .sisyphus/evidence/judge-gate/task-T6-test-run.txt
      4. Assert passing count ≥ 515
    Expected Result: Exit code 0, ≥515 tests passing, 0 new failures
    Failure Indicators: Any new FAIL lines (excluding pre-existing container-boot and inngest-serve failures)
    Evidence: .sisyphus/evidence/judge-gate/task-T6-test-run.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T6-test-run.txt` — full `pnpm test -- --run` output showing pass count and exit code

  **Commit**: YES
  - Message: `test(workers): add plan-judge and planning-orchestrator judge integration tests`
  - Files: `tests/workers/lib/plan-judge.test.ts`, `tests/workers/lib/planning-orchestrator.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] T7. Rebuild Docker image and push to Fly.io

  **What to do**:
  - This task involves 2 long-running commands — BOTH must follow the AGENTS.md Long-Running Command Protocol (tmux + log file + poll)
  - **Step 1**: Build local Docker image

    ```bash
    # Launch in tmux
    tmux new-session -d -s ai-build -x 220 -y 50
    tmux send-keys -t ai-build \
      "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" \
      Enter
    # Poll every 60s
    tail -30 /tmp/ai-build.log
    grep "EXIT_CODE:" /tmp/ai-build.log && echo "DONE" || echo "RUNNING"
    ```

    - Must exit 0. If it fails: read the error, fix it (may require rebuilding if a dependency is missing), re-run.

  - **Step 2**: Push to Fly.io registry

    ```bash
    tmux new-session -d -s ai-fly -x 220 -y 50
    tmux send-keys -t ai-fly \
      "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm fly:image 2>&1 | tee /tmp/ai-fly.log; echo 'EXIT_CODE:'$? >> /tmp/ai-fly.log" \
      Enter
    # Poll every 60s
    tail -30 /tmp/ai-fly.log
    grep "EXIT_CODE:" /tmp/ai-fly.log && echo "DONE" || echo "RUNNING"
    ```

    - Must exit 0. If it fails: check Fly.io auth (`FLY_API_TOKEN` in `.env`), re-run.

  - **If either step fails**: Fix the issue BEFORE proceeding to T8. Do not skip.

  **Must NOT do**:
  - Do NOT run `docker build` or `pnpm fly:image` as a blocking shell call (>30s commands)
  - Do NOT proceed to T8 if either command exits non-zero

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure mechanical execution of 2 build commands — no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (docker build must complete before fly:image)
  - **Parallel Group**: Wave 5 — sequential after T6
  - **Blocks**: T8
  - **Blocked By**: T6

  **References**:
  - AGENTS.md "Long-Running Command Protocol" — tmux pattern (MANDATORY)
  - AGENTS.md "Infrastructure" — rebuild requirement after `src/workers/` changes
  - AGENTS.md "Hybrid Fly.io Mode" — `pnpm fly:image` command

  **Acceptance Criteria**:
  - [ ] `docker build -t ai-employee-worker:latest .` exits 0
  - [ ] `pnpm fly:image` exits 0
  - [ ] Both log files captured as evidence

  **QA Scenarios**:

  ```
  Scenario: Docker build succeeds
    Tool: Bash (tmux + log poll)
    Steps:
      1. Launch tmux session with docker build command + log redirect
      2. Poll /tmp/ai-build.log every 60s
      3. When EXIT_CODE: line appears, assert value is 0
    Expected Result: "EXIT_CODE:0" in log file
    Failure Indicators: "EXIT_CODE:" with non-zero value
    Evidence: .sisyphus/evidence/judge-gate/task-T7-docker-build.txt (copy of /tmp/ai-build.log)

  Scenario: Fly.io image push succeeds
    Tool: Bash (tmux + log poll)
    Steps:
      1. Launch tmux session with pnpm fly:image + log redirect
      2. Poll /tmp/ai-fly.log every 60s
      3. When EXIT_CODE: line appears, assert value is 0
    Expected Result: "EXIT_CODE:0" in log file
    Evidence: .sisyphus/evidence/judge-gate/task-T7-fly-push.txt (copy of /tmp/ai-fly.log)
  ```

  **Evidence to Capture**:
  - [ ] `task-T7-docker-build.txt` — /tmp/ai-build.log contents
  - [ ] `task-T7-fly-push.txt` — /tmp/ai-fly.log contents

  **Commit**: NO (no source changes in this task)

- [x] T8. Pre-flight checks (8 gates)

  **What to do**:
  Run all 8 checks below. If ANY check fails, fix it before proceeding to T9. Do NOT skip.

  **Gate 1: Services running**

  ```bash
  curl -s http://localhost:3000/health | grep -q "ok" && echo "GATEWAY OK" || echo "GATEWAY DOWN"
  curl -s http://localhost:8288/api/v1/fns | grep -q "inngest" && echo "INNGEST OK" || echo "INNGEST DOWN"
  curl -s http://localhost:54321/rest/v1/ | grep -q "schema" && echo "SUPABASE OK" || echo "SUPABASE DOWN"
  ```

  If any are DOWN: `pnpm dev:start` (via tmux — long-running) and wait for all 3 to be healthy.

  **Gate 2: Docker image exists and is current**

  ```bash
  docker images ai-employee-worker:latest --format "{{.CreatedAt}}"
  ```

  Assert the timestamp is from today (post T7 rebuild).

  **Gate 3: Fly.io connectivity**

  ```bash
  fly status --app ai-employee-workers
  ```

  Must not error. If auth error: check `FLY_API_TOKEN` in `.env`.

  **Gate 4: Cloudflare tunnel running — get tunnel URL**

  ```bash
  # If TUNNEL_URL is already set in environment, use it
  echo $TUNNEL_URL
  # If not set, check if cloudflared is running:
  pgrep -f "cloudflared tunnel" && echo "TUNNEL RUNNING" || echo "TUNNEL NOT RUNNING"
  ```

  If tunnel not running: Start it via tmux:

  ```bash
  tmux new-session -d -s ai-tunnel -x 220 -y 50
  tmux send-keys -t ai-tunnel "cloudflared tunnel --url http://localhost:54321 2>&1 | tee /tmp/ai-tunnel.log" Enter
  # Wait 10s, then extract URL:
  sleep 10 && grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/ai-tunnel.log | head -1
  ```

  Capture tunnel URL to `.sisyphus/evidence/judge-gate/task-T8-tunnel-url.txt`

  **Gate 5: `.env` has required variables**

  ```bash
  grep -q "OPENROUTER_API_KEY=sk-" .env && echo "OPENROUTER_API_KEY OK" || echo "MISSING"
  grep -q "GITHUB_TOKEN=ghp_" .env && echo "GITHUB_TOKEN OK" || echo "MISSING"
  grep -q "PLAN_VERIFIER_MODEL=anthropic/claude-haiku-4-5" .env && echo "PLAN_VERIFIER_MODEL OK" || echo "MISSING — must add"
  ```

  **CRITICAL**: If `PLAN_VERIFIER_MODEL` is missing from `.env`, add it now:

  ```bash
  echo "PLAN_VERIFIER_MODEL=anthropic/claude-haiku-4-5" >> .env
  ```

  **Gate 6: Generate fresh E2E task key**

  ```bash
  E2E_KEY="TEST-$(date +%s)"
  echo $E2E_KEY
  ```

  Save to `.sisyphus/evidence/judge-gate/task-T8-e2e-key.txt`. This key is used in T9.
  NEVER use any of these blocked keys: `TEST-1775855651`, `TEST-100`, `TEST-1775866864`, `TEST-1775869708`, `TEST-1775876158`, `TEST-1775950556`, `TEST-1775951346`, `TEST-1776026083`, `TEST-1776026999`

  **Gate 7: No leftover Fly machines from previous runs**

  ```bash
  fly machines list --app ai-employee-workers
  ```

  If any machines are in non-destroyed state from old runs: `fly machines destroy <id> --force --app ai-employee-workers`

  **Gate 8: Test repo accessible**

  ```bash
  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
    https://api.github.com/repos/viiqswim/ai-employee-test-target | grep -q '"name"' \
    && echo "REPO OK" || echo "REPO INACCESSIBLE"
  ```

  **Must NOT do**:
  - Do NOT proceed to T9 if any gate fails — fix it first
  - Do NOT reuse blocked keys

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires orchestrating multiple system checks, potentially starting services, and conditionally fixing issues
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 start — sequential after T7
  - **Blocks**: T9
  - **Blocked By**: T7

  **References**:
  - AGENTS.md "Long-Running Command Protocol" — for starting dev services via tmux
  - AGENTS.md "Hybrid Fly.io Mode" — tunnel setup instructions
  - `.env.example` — required variable names
  - Previous evidence: `.sisyphus/evidence/formatcurrency-clean-run-3/` — for reference on what a passing pre-flight looks like

  **Acceptance Criteria**:
  - [ ] All 8 gates pass (or issues fixed until they pass)
  - [ ] `PLAN_VERIFIER_MODEL=anthropic/claude-haiku-4-5` confirmed in `.env`
  - [ ] Fresh E2E key captured (not in blocked list)
  - [ ] Tunnel URL captured

  **QA Scenarios**:

  ```
  Scenario: All 8 pre-flight gates pass
    Tool: Bash
    Steps:
      1. Run each gate check command
      2. Capture output to evidence file
      3. Assert all show OK/pass status
    Expected Result: All 8 gates green
    Failure Indicators: Any "DOWN", "MISSING", or error output from gates
    Evidence: .sisyphus/evidence/judge-gate/task-T8-preflight.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T8-preflight.txt` — output of all 8 gate checks
  - [ ] `task-T8-tunnel-url.txt` — cloudflare tunnel URL
  - [ ] `task-T8-e2e-key.txt` — the fresh TEST-{timestamp} key

  **Commit**: NO

- [x] T9. Fire E2E run

  **What to do**:
  - Read tunnel URL from `.sisyphus/evidence/judge-gate/task-T8-tunnel-url.txt`
  - Read E2E key from `.sisyphus/evidence/judge-gate/task-T8-e2e-key.txt`
  - Launch E2E run via tmux (MANDATORY — this can take 45–90 min):
    ```bash
    tmux new-session -d -s ai-e2e -x 220 -y 50
    tmux send-keys -t ai-e2e \
      "cd /Users/victordozal/repos/dozal-devs/ai-employee && TUNNEL_URL=<tunnel-url> USE_FLY_HYBRID=1 pnpm trigger-task -- --key <e2e-key> 2>&1 | tee /tmp/ai-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-e2e.log" \
      Enter
    ```
  - Poll `/tmp/ai-e2e.log` every 60 seconds:
    ```bash
    tail -30 /tmp/ai-e2e.log
    grep "EXIT_CODE:" /tmp/ai-e2e.log && echo "DONE" || echo "STILL RUNNING"
    ```
  - Capture the task UUID from the log output — it appears early in the log as the task ID. Save to `.sisyphus/evidence/judge-gate/task-T9-task-uuid.txt`
  - When `EXIT_CODE:0` appears → proceed to T10
  - When `EXIT_CODE:` non-zero appears → do NOT mark complete; diagnose and resolve (see T10)

  **Must NOT do**:
  - Do NOT run `pnpm trigger-task` as a blocking shell call
  - Do NOT use a blocked key
  - Do NOT proceed to T10 without capturing the task UUID

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires reading evidence files, constructing the correct tmux command, and monitoring output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 — sequential after T8
  - **Blocks**: T10
  - **Blocked By**: T8

  **References**:
  - AGENTS.md "Long-Running Command Protocol" — tmux pattern (verbatim)
  - AGENTS.md "Hybrid Fly.io Mode" — `USE_FLY_HYBRID=1 pnpm trigger-task` pattern
  - `.sisyphus/evidence/judge-gate/task-T8-tunnel-url.txt` — tunnel URL
  - `.sisyphus/evidence/judge-gate/task-T8-e2e-key.txt` — E2E key

  **Acceptance Criteria**:
  - [ ] tmux session `ai-e2e` launched with correct TUNNEL_URL and key
  - [ ] Task UUID captured from log output
  - [ ] Log polling started (evidence of monitoring)

  **QA Scenarios**:

  ```
  Scenario: E2E run launched and UUID captured
    Tool: Bash (tmux + log poll)
    Steps:
      1. Launch tmux session with trigger-task command
      2. Poll log every 60s for 5 minutes to confirm task UUID appears
      3. Save UUID to evidence file
    Expected Result: Task UUID visible in log within first few minutes
    Evidence: .sisyphus/evidence/judge-gate/task-T9-task-uuid.txt, task-T9-initial-log.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T9-task-uuid.txt` — the task UUID
  - [ ] `task-T9-initial-log.txt` — first 50 lines of /tmp/ai-e2e.log showing task started

  **Commit**: NO

- [x] T10. Monitor E2E run to completion + inline issue resolution

  **What to do**:
  - Continue polling `/tmp/ai-e2e.log` every 60 seconds until `EXIT_CODE:` line appears
  - Expected duration: 45–90 minutes
  - Monitor for these key milestones in the log:
    - `"Phase 1 complete"` or `"plan written"` → Phase 1 done
    - `"plan-judge: verdict=PASS"` or `"plan-judge: verdict=REJECT"` → judge gate ran (CRITICAL to observe)
    - `"Phase 2 complete"` or `"waves complete"` → coding done
    - `"PR created"` → PR link visible
    - `EXIT_CODE:0` → success
  - If `EXIT_CODE:` is non-zero:
    - Read the last 100 lines of the log to understand the failure
    - Check Fly machine logs: `fly logs --app ai-employee-workers` (via tmux — long-running)
    - Diagnose root cause — is it:
      - Judge gate error? → Check plan-judge.ts error handling, re-verify PASS-on-failure works
      - Planning failure? → Check orchestrator logs
      - Fly machine startup? → Check image was pushed correctly
      - Tunnel timeout? → Restart tunnel, re-run T9
      - GitHub push/PR error? → Check GITHUB_TOKEN permissions
    - Fix the specific root cause issue
    - Re-run from T9 with a new `TEST-$(date +%s)` key (do not reuse the previous key)
    - Keep iterating until `EXIT_CODE:0`
  - Save the final full log to evidence

  **Must NOT do**:
  - Do NOT mark T10 complete until `EXIT_CODE:0` is seen
  - Do NOT ignore `plan-judge` log lines — confirm the gate ran
  - Do NOT reuse the same key if re-running (generate new `TEST-$(date +%s)`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires monitoring, pattern recognition in logs, root cause analysis, and potentially multiple fix-and-retry cycles
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 — sequential after T9
  - **Blocks**: T11
  - **Blocked By**: T9

  **References**:
  - AGENTS.md "Long-Running Command Protocol" — for `fly logs` monitoring
  - AGENTS.md "Hybrid Fly.io Mode — Debugging" — `fly logs`, `fly machines list`
  - `.sisyphus/notepads/formatcurrency-rerun/learnings.md` — previous run history and bug patterns (REFERENCE for known failure modes)
  - `.sisyphus/evidence/formatcurrency-clean-run-3/` — previous successful run evidence (reference for expected log patterns)

  **Acceptance Criteria**:
  - [ ] `/tmp/ai-e2e.log` ends with `EXIT_CODE:0`
  - [ ] `plan-judge` log lines observed in run logs (confirms gate ran)
  - [ ] PR URL captured from log output
  - [ ] Full log saved to evidence

  **QA Scenarios**:

  ```
  Scenario: E2E run completes successfully
    Tool: Bash (log poll)
    Steps:
      1. Poll /tmp/ai-e2e.log every 60s
      2. When EXIT_CODE: appears, assert it's 0
      3. grep "plan-judge" /tmp/ai-e2e.log → assert match found
      4. grep "PR created\|pull_request\|github.com" /tmp/ai-e2e.log → capture PR URL
    Expected Result: EXIT_CODE:0, judge gate log visible, PR URL captured
    Failure Indicators: EXIT_CODE: non-zero, or "plan-judge" not in logs
    Evidence: .sisyphus/evidence/judge-gate/task-T10-full-run.log
  ```

  **Evidence to Capture**:
  - [ ] `task-T10-full-run.log` — full /tmp/ai-e2e.log
  - [ ] `task-T10-pr-url.txt` — captured PR URL
  - [ ] `task-T10-judge-logs.txt` — grep output of plan-judge lines

  **Commit**: NO

- [x] T11. Verify: `pnpm verify:e2e` + PR diff + Fly logs

  **What to do**:
  - Read task UUID from `.sisyphus/evidence/judge-gate/task-T9-task-uuid.txt`
  - Read PR URL from `.sisyphus/evidence/judge-gate/task-T10-pr-url.txt`

  **Verification 1: `pnpm verify:e2e`**

  ```bash
  pnpm verify:e2e --task-id <uuid> 2>&1 | tee .sisyphus/evidence/judge-gate/task-T11-verify-e2e.txt
  ```

  Must show 12/12 checks passing. If any check fails: diagnose, fix if possible, re-run.

  **Verification 2: PR diff contains correct implementation**

  ```bash
  # Fetch PR diff via GitHub API
  REPO="viiqswim/ai-employee-test-target"
  PR_NUMBER=$(echo "<pr-url>" | grep -oP '\d+$')
  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/pulls/$PR_NUMBER/files" \
    | tee .sisyphus/evidence/judge-gate/task-T11-pr-files.json

  # Check for correct implementation
  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/pulls/$PR_NUMBER/files" \
    | grep -c "formatCurrency" && echo "formatCurrency found" || echo "MISSING"

  curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/pulls/$PR_NUMBER/files" \
    | grep -c "Intl.NumberFormat" && echo "Intl.NumberFormat found" || echo "MISSING"
  ```

  Must find `formatCurrency` (≥3 occurrences) and `Intl.NumberFormat` in the diff.

  **Verification 3: Fly logs confirm judge ran**

  ```bash
  # Use tmux for fly logs (streaming command)
  tmux new-session -d -s ai-logs -x 220 -y 50
  tmux send-keys -t ai-logs \
    "fly logs --app ai-employee-workers --no-tail 2>&1 | tee /tmp/ai-fly-logs.log" \
    Enter
  sleep 15
  grep "plan-judge" /tmp/ai-fly-logs.log | tee .sisyphus/evidence/judge-gate/task-T11-judge-logs.txt
  ```

  Must find at least one line containing `plan-judge` confirming the gate ran.

  **If any verification fails**:
  - `verify:e2e` fails → diagnose which check failed, investigate logs, fix and potentially re-run E2E from T9
  - PR diff missing `formatCurrency` / `Intl.NumberFormat` → judge gate did not work (MiniMax went off-script again) — diagnose judge gate, fix, re-run E2E
  - No `plan-judge` in Fly logs → judge gate not reached — check `PLAN_VERIFIER_MODEL` was set in Fly env, diagnose lifecycle.ts dispatch

  **Must NOT do**:
  - Do NOT merge the PR — stop here
  - Do NOT mark T11 complete unless ALL 3 verifications pass

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step verification with GitHub API calls, log analysis, and conditional remediation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 final — sequential after T10
  - **Blocks**: F1–F4
  - **Blocked By**: T10

  **References**:
  - `pnpm verify:e2e` script: `scripts/verify-e2e.ts`
  - GitHub API: `https://api.github.com/repos/viiqswim/ai-employee-test-target/pulls/{N}/files`
  - AGENTS.md "Long-Running Command Protocol" — for `fly logs`
  - `.sisyphus/evidence/judge-gate/task-T9-task-uuid.txt` — task UUID
  - `.sisyphus/evidence/judge-gate/task-T10-pr-url.txt` — PR URL

  **Acceptance Criteria**:
  - [ ] `pnpm verify:e2e --task-id <uuid>` → 12/12 checks
  - [ ] PR diff contains `formatCurrency` (≥3 occurrences)
  - [ ] PR diff contains `Intl.NumberFormat`
  - [ ] `fly logs | grep "plan-judge"` returns ≥1 line
  - [ ] PR NOT merged

  **QA Scenarios**:

  ```
  Scenario: All 3 verifications pass
    Tool: Bash
    Steps:
      1. pnpm verify:e2e --task-id <uuid> → assert "12/12" in output
      2. GitHub API PR files → assert formatCurrency count ≥ 3
      3. GitHub API PR files → assert Intl.NumberFormat found
      4. fly logs grep plan-judge → assert ≥1 line returned
    Expected Result: All 3 pass
    Failure Indicators: <12/12, missing function name, no judge logs
    Evidence: .sisyphus/evidence/judge-gate/task-T11-verify-e2e.txt, task-T11-pr-files.json, task-T11-judge-logs.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-T11-verify-e2e.txt` — full `pnpm verify:e2e` output
  - [ ] `task-T11-pr-files.json` — GitHub API PR files response
  - [ ] `task-T11-judge-logs.txt` — Fly logs grep output

  **Commit**: NO (E2E only — no source changes)

---

## Final Verification Wave

> Run AFTER all T1–T11 complete. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read plan end-to-end. For each "Must Have": verify implementation exists (read file, grep codebase). For each "Must NOT Have": search for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/judge-gate/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + linter. Review changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic variable names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real E2E QA** — `unspecified-high`
      Run `pnpm verify:e2e --task-id <uuid>` against the E2E task from T11. Check `fly logs | grep "plan-judge"` for gate confirmation. Inspect PR diff for `Intl.NumberFormat` and `formatCurrency`. Save output to `.sisyphus/evidence/judge-gate/final-qa/`.
      Output: `verify:e2e [12/12] | Judge logs [FOUND/NOT FOUND] | PR diff [CORRECT/WRONG] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1**: `feat(workers): add plan-judge OpenRouter caller with SVR rubric` — `src/workers/lib/plan-judge.ts`
- **T2**: `feat(config): add planVerifierModel config field and PLAN_VERIFIER_MODEL env var` — `src/workers/config/long-running.ts`, `.env.example`
- **T3**: `feat(prompt-builder): add buildCorrectionPrompt for judge retry` — `src/workers/lib/prompt-builder.ts`
- **T4**: `feat(lifecycle): wire PLAN_VERIFIER_MODEL into Fly dispatch env` — `src/inngest/lifecycle.ts`
- **T5**: `feat(planning-orchestrator): inject judge gate with corrective replay (max 2 retries)` — `src/workers/lib/planning-orchestrator.ts`
- **T6**: `test(workers): add plan-judge and planning-orchestrator judge integration tests` — `tests/workers/lib/plan-judge.test.ts`, `tests/workers/lib/planning-orchestrator.test.ts`

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run          # Expected: ≥515 passing, 0 failures
pnpm verify:e2e --task-id <uuid>   # Expected: 12/12 checks pass
fly logs --app ai-employee-workers | grep "plan-judge"  # Expected: judge ran log lines visible
```

### Final Checklist

- [ ] All "Must Have" present and verified
- [ ] All "Must NOT Have" absent (grep confirms)
- [ ] `pnpm test -- --run` exits 0
- [ ] Docker image built and pushed
- [ ] E2E: `verify:e2e` 12/12
- [ ] PR diff: `Intl.NumberFormat` + `formatCurrency` ≥3 occurrences
- [ ] Fly logs: `plan-judge` lines visible
- [ ] No blocked keys used
- [ ] PR NOT merged
