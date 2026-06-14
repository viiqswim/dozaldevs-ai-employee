# End-to-End Execution & Debugging Skill (Slack @mention → Delivery)

## TL;DR

> **Quick Summary**: Create one comprehensive dev skill at `.opencode/skills/` that maps the COMPLETE AI-employee execution path (Slack @mention → gateway → interaction classification → trigger handling → input collection → task dispatch → lifecycle → execution → delivery) and tells a debugger exactly where to look — logs, DB tables, Slack — in BOTH local and production. Plus 5 surgical logging additions that close the worst silent-failure gaps.
>
> **Deliverables**:
>
> - New `.opencode/skills/<slug>/SKILL.md` — full forward trace + reverse "stuck-in-state" lookup + log-location matrix (local + prod)
> - 5 logging additions to existing files (dispatch, exec poll, delivery poll, approval wait, app_mention early-returns)
> - AGENTS.md registration in both dev-skill tables
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Wave 1 logging additions → live task verification → Wave 2 skill authoring → command-execution verification → AGENTS.md registration → Final Verification Wave → user okay

---

## Context

### Original Request

"Help me go through the full AI employee execution process, all the way from triggering via Slack, handling that trigger, everything that happens at the gateway, the handling, the execution and delivery steps. Make sure that if I try to troubleshoot/debug anything in local or production, everything is appropriately logged or stored somewhere so that I can debug any issues. Create a skill in `.opencode/skills` so you can do this easily in the future. There may already be a related skill, but make it 100% perfect and ensure everything is visible for debugging."

### Interview Summary

**Key Discussions**:

- Primary purpose: Full trace map + debugging playbook — the skill IS the deliverable.
- New end-to-end skill; cross-link existing focused skills (don't duplicate).
- Add logging code to fix the CRITICAL silent-failure gaps (not just document them).
- Cover local AND production equally.

**Research Findings**:

- Logger is `src/lib/logger.ts` (pino): `createLogger(component)`, `taskLogger(component, taskId)`, `logStep/logTool/logCost`, automatic redaction of `*_TOKEN/*_SECRET/*_KEY`, level via `LOG_LEVEL` (default `info`).
- Worker logs originate in `src/inngest/lib/lifecycle-helpers.ts` via `docker logs -f {containerId} > /tmp/employee-{name}.log`. Container names: execution `employee-{taskId.slice(0,8)}`, delivery `employee-delivery-{taskId.slice(0,8)}`.
- SSE log viewer `src/gateway/routes/admin-tasks.ts` serves ONLY the execution log (`/tmp/employee-{id.slice(0,8)}.log`), local Docker mode only — the delivery log is never served.
- DB observability tables (in `prisma/schema.prisma`): `task_status_log`, `pending_approvals`, `feedback_events`, `task_metrics`, `task_composio_calls`, `archetype_edit_history`, plus `tasks` (status/failure_reason/failure_code/compiled_agents_md/metadata/raw_event) and `executions` (session_transcript).
- Production access: Render API (gateway logs), Fly Machines REST API (worker), Inngest Cloud dashboard, Supabase Cloud DB on port 5432 — all in `docs/guides/2026-06-01-2246-production-debugging-guide.md` and the `production-ops` skill.

### Metis Review

**Identified Gaps** (addressed in this plan):

- Skill classification locked to DEV (`.opencode/skills/`), explicitly NOT `src/workers/skills/` or any Docker COPY path.
- Log levels resolved: poll-loop logs at `debug`, dedup/dispatch/wait/early-return at `info`.
- `create-task-and-dispatch.ts` has no logger import → use `createLogger('task-dispatch')` with scalar fields (no taskId at dedup time).
- Gap 5 is partial (receipt already logged) → add early-return REASON only, no duplicate.
- Skill must include a reverse "stuck-in-state → look here" lookup, document the delivery-log SSE blind spot, the local-only `/tmp` caveat, the Fly-mode no-`/tmp` caveat, Inngest replay memoization, and the `LOG_LEVEL` prod divergence.
- Durability + registration are mandatory (no line numbers / volatile counts; register in both AGENTS.md dev-skill tables).
- "Skill is correct" = every command/query in it was executed successfully, prod commands cross-referenced (never invented).

---

## Work Objectives

### Core Objective

Make the entire AI-employee execution path fully debuggable: one authoritative skill that points to the exact log/DB/Slack location for every step in local and production, backed by code additions that eliminate the worst silent-failure blind spots.

### Concrete Deliverables

- `.opencode/skills/<slug>/SKILL.md` (slug chosen in Task 1; e.g. `execution-trace-debugging`).
- Logging additions in: `src/inngest/lib/create-task-and-dispatch.ts`, `src/inngest/lifecycle/steps/execute.ts`, `src/inngest/lifecycle/steps/delivery-retry.ts`, `src/inngest/lifecycle/steps/reviewing-path.ts`, `src/gateway/slack/handlers/event-handlers.ts`.
- Two new rows in AGENTS.md dev-skill tables for the skill.

### Definition of Done

- [ ] `pnpm build` exits 0 and `pnpm lint` exits 0 after all changes.
- [ ] A real local task run emits every new log line (`grep` proves it).
- [ ] Every local command and SQL query in the skill executes successfully against the running stack / `ai_employee` DB.
- [ ] Every prod command in the skill is cross-referenced to `production-ops` / the prod-debugging-guide (none invented).
- [ ] Skill registered in AGENTS.md; cross-links resolve; durability check passes.

### Must Have

- Forward trace covering all 8 steps with per-step log/DB/Slack locations for local AND prod.
- Side-by-side local|prod log-location matrix and local+prod DB queries (same question, both environments).
- A dedicated, deep **Production Incident Playbook**: topology orientation, numbered triage order, per-tier inspection commands (Render / Fly Machines REST / Supabase Cloud port 5432 / Inngest Cloud), prod-specific failure modes (Inngest retry loop, Render env gotchas, IPv6-vs-pooler, raising LOG_LEVEL in prod), and the no-`/tmp`/no-SSE-in-prod reality.
- Reverse "stuck in state X → look here" lookup table (Failed / failure_reason / failure_code / reviewing-watchdog), local AND prod.
- The 5 logging additions, each emitting verified output at the correct level.
- Documentation of the delivery-log SSE gap and all caveats Metis listed.

### Must NOT Have (Guardrails)

- NO skill placement in `src/workers/skills/` or any Docker `COPY` path — it is a DEV skill.
- NO logging changes beyond the 5 named files/locations (other silent spots → document in skill only).
- NO refactor of poll loops; NO behavior change — logging only.
- NO code change to the SSE endpoint (delivery-log gap is DOCUMENT-only / backlog).
- NO change to `src/lib/logger.ts` config or `LOG_LEVEL` default; NO tracing/OTel.
- NO employee-specific words (guest/summary/Hostfully/etc.) in shared-file log messages.
- NO dollar amounts in any log; NO logging of raw headers/env objects/secrets.
- NO line numbers or volatile counts in the skill (durability rule; semantic constants allowed).
- NO new test files unless an existing test breaks.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest).
- **Automated tests**: None (logging emissions are verified by running a task and grepping; no unit tests for log lines per Metis).
- **Framework**: n/a for this plan; `pnpm build` + `pnpm lint` are the static gates.
- **TDD**: No — this is a documentation + surgical-logging plan.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Logging additions**: Bash (`pnpm build`/`pnpm lint`, trigger a local task, `grep /tmp/ai-dev.log` and `/tmp/employee-*.log`).
- **Skill correctness**: Bash (execute every local fenced command; run every SQL via `psql ... ai_employee`; `ls` cross-linked skills; `grep` durability).
- **Prod commands**: Bash (cross-reference against `production-ops` SKILL.md + prod-debugging-guide; no live prod calls required).

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 5 independent logging additions, MAX PARALLEL):
├── Task 1: Add logging to create-task-and-dispatch.ts        [quick]
├── Task 2: Add per-poll debug log to execute.ts poll loop    [quick]
├── Task 3: Add per-poll debug log to delivery-retry.ts loop  [quick]
├── Task 4: Add wait-begin log to reviewing-path.ts           [quick]
└── Task 5: Add early-return reason logs to event-handlers.ts [quick]

Wave 1.5 (After Wave 1 — gate + live proof):
└── Task 6: pnpm build + lint + live local task, grep-prove all 5 logs emit  [unspecified-high]

Wave 2 (After Wave 1.5 — authoring depends on verified log behavior):
├── Task 7: Author SKILL.md (forward trace + reverse lookup + log matrix, local+prod)  [writing]
├── Task 8: Verify every LOCAL command + SQL query in the skill executes              [unspecified-high]
└── Task 9: Cross-reference every PROD command; register skill in AGENTS.md (both tables) [writing]

Wave FINAL (after ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — execute skill commands + live log emission (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
→ Task 10: Notify completion (Telegram)

Critical Path: T1–5 → T6 → T7 → T8 → T9 → F1–F4 → user okay → T10
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

- **1**: depends none → blocks 6
- **2**: depends none → blocks 6
- **3**: depends none → blocks 6
- **4**: depends none → blocks 6
- **5**: depends none → blocks 6
- **6**: depends 1,2,3,4,5 → blocks 7,8,9
- **7**: depends 6 → blocks 8,9
- **8**: depends 7 → blocks F-wave
- **9**: depends 7 → blocks F-wave
- **F1–F4**: depend 8,9 → block user okay
- **10**: depends user okay

### Agent Dispatch Summary

- **Wave 1**: 5 — T1–T5 → `quick`
- **Wave 1.5**: 1 — T6 → `unspecified-high`
- **Wave 2**: 3 — T7 → `writing`, T8 → `unspecified-high`, T9 → `writing`
- **FINAL**: 4 — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Each Wave-1 task is a single surgical logging addition. Logging only — NO behavior change, NO refactor.

- [x] 1. Add logging to `create-task-and-dispatch.ts` (Gap 1 — zero logging)

  **What to do**:
  - In `src/inngest/lib/create-task-and-dispatch.ts`, add `import { createLogger } from '<the logger module path used elsewhere in src/inngest>'` and instantiate `const log = createLogger('task-dispatch')` (file currently has NO logger import).
  - Add an `info` log at the dedup-hit branch (where a duplicate task is found and the function returns `{ taskId: null }`): message like `'Duplicate task suppressed — skipping dispatch'`, fields `{ externalId, tenantId, archetypeSlug }` (NO taskId — none exists at dedup time).
  - Add an `info` log immediately after the task row is created: `'Task created'`, fields `{ taskId, tenantId, archetypeSlug }`.
  - Add an `info` log immediately after the `employee/task.dispatched` event is sent: `'task.dispatched event sent'`, fields `{ taskId, tenantId }`.

  **Must NOT do**:
  - No employee-specific words. No dollar amounts. No logging raw event/headers/secrets — scalar IDs only.
  - No change to control flow, dedup logic, or the created task shape.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single small file, additive logging only.
  - **Skills**: [`inngest`] — this file is in the Inngest dispatch path; the skill covers `makePostgrestHeaders`, the dispatch flow, and event conventions.
  - **Skills Evaluated but Omitted**: `data-access-conventions` — no DB-access pattern change; only adding log lines.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** (with Tasks 2,3,4,5). **Blocked By**: None. **Blocks**: Task 6.

  **References**:
  - Pattern: `src/inngest/lifecycle/steps/execute.ts` — `createLogger(...)` instantiation + `log.info({ scalarFields }, 'message')` usage. Mirror this style.
  - Pattern: `src/lib/logger.ts` — `createLogger(component)` signature; confirm import path used by sibling `src/inngest` files (copy their exact import specifier).
  - Target: `src/inngest/lib/create-task-and-dispatch.ts` — the dedup-return branch, the post-create line, and the post-send line.
  - WHY: This file is the single most logging-sparse node in the whole flow; a suppressed duplicate is currently invisible. These three logs make dispatch fully traceable.

  **Acceptance Criteria**:
  - [ ] `import { createLogger }` present and `createLogger('task-dispatch')` instantiated.
  - [ ] Three `log.info` calls added at the three points described.
  - [ ] `pnpm lint` on the file passes (verified in Task 6 gate).

  **QA Scenarios**:

  ```
  Scenario: Logger import resolves and lint passes
    Tool: Bash
    Steps:
      1. Run: pnpm lint 2>&1 | tee .sisyphus/evidence/task-1-lint.txt
      2. Assert: exit code 0, no errors referencing create-task-and-dispatch.ts
    Expected Result: lint passes; file compiles with new import
    Evidence: .sisyphus/evidence/task-1-lint.txt
  ```

  (Live emission proven in Task 6.)

  **Commit**: Groups with Tasks 2–5 (single observability commit).

- [x] 2. Add per-poll `debug` log to `execute.ts` completion poll loop (Gap 2)

  **What to do**:
  - In `src/inngest/lifecycle/steps/execute.ts`, inside the poll-completion loop (the loop that polls the DB up to ~120 times every ~15s while the task is Executing), add a single `log.debug` line each iteration: `'Polling for completion'`, fields `{ taskId, poll: <iteration>, status: <current status> }`.
  - Use the existing `log` instance already in the file (`createLogger('lifecycle-execute')`). Level MUST be `debug` (not `info`) to avoid prod log spam.

  **Must NOT do**:
  - No `info` level. No refactor of the loop, poll count, or interval. No employee-specific words. No dollar amounts.

  **Recommended Agent Profile**:
  - **Category**: `quick`.
  - **Skills**: [`inngest`] — covers the lifecycle step modules and `step.run`/poll mechanics.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1**. **Blocked By**: None. **Blocks**: Task 6.

  **References**:
  - Target: `src/inngest/lifecycle/steps/execute.ts` — the poll loop (search for the loop that calls the DB repeatedly with a 15s wait and a max iteration cap) and the existing `log.info` for "State: Executing" / "Step complete: poll-completion".
  - Pattern: existing `log.info` calls in the same file for field-object style.
  - WHY: A task stuck in Executing currently produces no lifecycle-side output for up to 30 min; a per-poll `debug` line lets a debugger (with `LOG_LEVEL=debug`) see progress.

  **Acceptance Criteria**:
  - [ ] One `log.debug` added inside the poll loop with `{ taskId, poll, status }`.
  - [ ] Level is `debug`.

  **QA Scenarios**:

  ```
  Scenario: Debug poll log present and at correct level
    Tool: Bash
    Steps:
      1. Run: grep -n "log.debug" src/inngest/lifecycle/steps/execute.ts | tee .sisyphus/evidence/task-2-grep.txt
      2. Assert: a debug line referencing poll exists
    Expected Result: exactly one new debug poll log in the loop
    Evidence: .sisyphus/evidence/task-2-grep.txt
  ```

  (Live emission with LOG_LEVEL=debug proven in Task 6.)

  **Commit**: Groups with Tasks 1,3,4,5.

- [x] 3. Add per-poll `debug` log to `delivery-retry.ts` poll loop (Gap 3)

  **What to do**:
  - In `src/inngest/lifecycle/steps/delivery-retry.ts`, inside the delivery-machine poll loop (polls the DB while the delivery container runs), add a single `log.debug` per iteration: `'Polling delivery for completion'`, fields `{ taskId, attempt, poll, status }`.
  - Use the existing `log` (`createLogger('lifecycle-delivery-retry')`). Level MUST be `debug`.

  **Must NOT do**:
  - No `info`. No change to the 3-attempt retry loop, spawn, or destroy logic. No employee-specific words. No dollar amounts.

  **Recommended Agent Profile**:
  - **Category**: `quick`.
  - **Skills**: [`inngest`].

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1**. **Blocked By**: None. **Blocks**: Task 6.

  **References**:
  - Target: `src/inngest/lifecycle/steps/delivery-retry.ts` — the delivery poll loop (near the existing `'Delivery machine spawned'` log and the retry/destroy block).
  - Pattern: the existing `log.info`/`log.warn` calls in the same file.
  - WHY: Delivery stalls are currently invisible from the lifecycle side; this mirrors the execution poll fix for the delivery phase.

  **Acceptance Criteria**:
  - [ ] One `log.debug` added inside the delivery poll loop with `{ taskId, attempt, poll, status }`.
  - [ ] Level is `debug`.

  **QA Scenarios**:

  ```
  Scenario: Delivery poll debug log present
    Tool: Bash
    Steps:
      1. Run: grep -n "log.debug" src/inngest/lifecycle/steps/delivery-retry.ts | tee .sisyphus/evidence/task-3-grep.txt
      2. Assert: a debug line referencing delivery poll exists
    Expected Result: one new debug poll log in the delivery loop
    Evidence: .sisyphus/evidence/task-3-grep.txt
  ```

  **Commit**: Groups with Tasks 1,2,4,5.

- [x] 4. Add wait-begin `info` log to `reviewing-path.ts` (Gap 4)

  **What to do**:
  - In `src/inngest/lifecycle/steps/reviewing-path.ts`, immediately BEFORE the `step.waitForEvent(...)` call that blocks for human approval, add an `info` log: `'Awaiting approval event'`, fields `{ taskId, tenantId, timeoutHours }` (use the timeout value already computed for the `waitForEvent` timeout).
  - Use the existing `log` instance in the file. Level `info` (a debugger must see this in prod at default level — a task blocked in Reviewing should be obvious).

  **Must NOT do**:
  - No change to the wait timeout, the supersede check, or approval handling. No employee-specific words. No dollar amounts. No logging the approval payload.

  **Recommended Agent Profile**:
  - **Category**: `quick`.
  - **Skills**: [`inngest`] — covers `step.waitForEvent` semantics and the reviewing path.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1**. **Blocked By**: None. **Blocks**: Task 6.

  **References**:
  - Target: `src/inngest/lifecycle/steps/reviewing-path.ts` — the `step.waitForEvent` call (near the existing `'State: Reviewing — awaiting human approval'` log) and the `timeoutHours` variable.
  - Pattern: existing `log.info` in the same file.
  - WHY: Currently a task in Reviewing produces no lifecycle log until the approval arrives or times out — the debugger can't tell the lifecycle is healthy-but-blocked vs hung.

  **Acceptance Criteria**:
  - [ ] One `log.info('Awaiting approval event', { taskId, tenantId, timeoutHours })`-style call added before `waitForEvent`.
  - [ ] Level is `info`.

  **QA Scenarios**:

  ```
  Scenario: Wait-begin log present before waitForEvent
    Tool: Bash
    Steps:
      1. Run: grep -n -B2 "waitForEvent" src/inngest/lifecycle/steps/reviewing-path.ts | tee .sisyphus/evidence/task-4-grep.txt
      2. Assert: an info wait-begin log appears immediately before waitForEvent
    Expected Result: wait-begin info log precedes the approval wait
    Evidence: .sisyphus/evidence/task-4-grep.txt
  ```

  **Commit**: Groups with Tasks 1,2,3,5.

- [x] 5. Add early-return reason logs to `event-handlers.ts` app_mention (Gap 5 — partial)

  **What to do**:
  - In `src/gateway/slack/handlers/event-handlers.ts`, the `app_mention` handler already logs receipt. Add an `info` log at EACH silent early-return: (a) the bot-ID guard (`if (mention.bot_id) return;`) → `'Ignoring app_mention from bot'` with `{ channel }`; (b) the DM guard (channel starts with `D`) → `'Ignoring app_mention in DM channel'` with `{ channel }`.
  - Use the existing `log` instance. Level `info`.

  **Must NOT do**:
  - Do NOT duplicate the existing receipt log. Do NOT change the guard conditions or control flow. No secrets/raw payload logged — `{ channel }` only.

  **Recommended Agent Profile**:
  - **Category**: `quick`.
  - **Skills**: [`slack-conventions`] — covers the Slack event/Bolt handler conventions for this file.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1**. **Blocked By**: None. **Blocks**: Task 6.

  **References**:
  - Target: `src/gateway/slack/handlers/event-handlers.ts` — the `app_mention` handler's bot-ID guard and DM guard (the two `return` statements that currently log nothing), plus the existing receipt `log.info`.
  - Pattern: the existing receipt `log.info` in the same handler for field style.
  - WHY: When an @mention "does nothing," there's currently no way to tell it was a bot echo or a DM; these two logs make the silent drops explicit.

  **Acceptance Criteria**:
  - [ ] Two `log.info` lines added, one per early-return guard, each with `{ channel }`.
  - [ ] Existing receipt log untouched (not duplicated).

  **QA Scenarios**:

  ```
  Scenario: Two early-return reason logs present
    Tool: Bash
    Steps:
      1. Run: grep -n "Ignoring app_mention" src/gateway/slack/handlers/event-handlers.ts | tee .sisyphus/evidence/task-5-grep.txt
      2. Assert: exactly two matching info logs
    Expected Result: bot and DM early-returns each log a reason
    Evidence: .sisyphus/evidence/task-5-grep.txt
  ```

  **Commit**: Groups with Tasks 1,2,3,4.

- [x] 6. Gate + live proof — `pnpm build`/`lint` + trigger a real local task, prove all 5 logs emit

  **What to do**:
  - Run `pnpm build` and `pnpm lint`; both must exit 0.
  - Ensure the local stack is running (`pnpm dev`) and the Docker worker image is built (`docker build -t ai-employee-worker:latest .` if needed). Set `LOG_LEVEL=debug` for the gateway/inngest process so poll `debug` logs emit (note how it's set — env for the dev process).
  - Trigger a real task. Preferred: the recommended smoke-test employee from the `feature-verification` skill (`real-estate-motivation-bot-2`, VLRE tenant, `approval_required: false`) via its trigger, OR a Slack @mention to a routed employee. Use `deepseek/deepseek-v4-flash` if a model override is needed (per AGENTS.md).
  - Tail/grep the logs and confirm EACH of the 5 additions emits: task-dispatch (`Task created`/`task.dispatched event sent`), execute poll (`Polling for completion`), delivery poll (`Polling delivery for completion`), reviewing wait (`Awaiting approval event` — only if the employee requires approval; if smoke-test is no-approval, prove this one with an approval-required employee OR document why it can't fire and verify via a unit-level grep that the call site exists), app_mention early-returns (trigger a bot/DM mention or note these fire only on bot/DM events).
  - Capture the task ID and the matching log lines.

  **Must NOT do**:
  - Do NOT mark pass on "code looks right" — logs must actually emit (per AGENTS.md post-implementation E2E rule). Do NOT skip the single-gateway pre-flight if testing via @mention.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — multi-step live verification requiring judgment.
  - **Skills**: [`feature-verification`, `e2e-testing`, `long-running-commands`, `debugging-lifecycle`] — smoke-test employee + trigger methods + tmux for the dev stack + lifecycle log expectations.

  **Parallelization**:
  - **Can Run In Parallel**: NO — gate. **Blocked By**: 1,2,3,4,5. **Blocks**: 7,8,9.

  **References**:
  - `feature-verification` skill — recommended smoke-test employee + zero-rows-is-failure rule.
  - `e2e-testing` skill — trigger methods + single-gateway pre-flight + state verification queries.
  - `long-running-commands` skill — tmux launch+poll for `pnpm dev` and `docker build`.
  - Log destinations: `/tmp/ai-dev.log` (gateway/inngest), `/tmp/employee-{taskId8}.log` and `/tmp/employee-delivery-{taskId8}.log` (worker).
  - WHY: This is the proof the 5 gap-fixes actually work end-to-end before the skill documents them.

  **Acceptance Criteria**:
  - [ ] `pnpm build` exit 0; `pnpm lint` exit 0.
  - [ ] A real task ran to a terminal state; task ID recorded.
  - [ ] Each of the 5 new logs proven to emit (or, for approval-wait / app_mention-DM cases that need a specific trigger, the alternate trigger used and emission proven — never skipped).

  **QA Scenarios**:

  ```
  Scenario: Build/lint gate passes
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tail -5 | tee .sisyphus/evidence/task-6-build.txt
      2. Run: pnpm lint 2>&1 | tail -5 | tee .sisyphus/evidence/task-6-lint.txt
      3. Assert: both exit 0
    Expected Result: clean build + lint
    Evidence: .sisyphus/evidence/task-6-build.txt, task-6-lint.txt

  Scenario: All five new logs emit on a real run
    Tool: Bash (+ e2e-testing trigger)
    Preconditions: pnpm dev running (stable >30s), worker image built, LOG_LEVEL=debug
    Steps:
      1. Trigger a real task (smoke-test employee or @mention); record TASK_ID
      2. Run: grep -E "Task created|task.dispatched event sent|Duplicate task suppressed" /tmp/ai-dev.log
      3. Run: grep -E "Polling for completion" /tmp/employee-${TASK_ID:0:8}.log /tmp/ai-dev.log
      4. Run: grep -E "Polling delivery for completion" /tmp/employee-delivery-${TASK_ID:0:8}.log /tmp/ai-dev.log
      5. Run: grep -E "Awaiting approval event" /tmp/ai-dev.log   # approval-required employee
      6. Run: grep -E "Ignoring app_mention" /tmp/ai-dev.log      # bot/DM mention trigger
      7. Save all output to evidence
    Expected Result: each new log line appears ≥1 time (with the appropriate trigger)
    Evidence: .sisyphus/evidence/task-6-log-emission.txt
  ```

  **Commit**: NO (verification task).

- [x] 7. Author the SKILL.md (forward trace + reverse lookup + log matrix, local + prod)

  **What to do**:
  - Create `.opencode/skills/<slug>/SKILL.md` (choose a durable kebab-case slug matching `^[a-z0-9]+(-[a-z0-9]+)*$`, e.g. `execution-trace-debugging`; directory name MUST equal the `name` frontmatter).
  - Frontmatter: `name:` (kebab-case) + `description:` single-quoted, starting "Use when…" then "Covers…", with strong trigger phrases (debug a task end-to-end, trace a Slack @mention to delivery, find where a step is logged, task disappeared/stuck/silently failed).
  - Body sections:
    1. **Forward trace** — all 8 steps (Slack @mention → interaction classification → trigger handling → input collection → task creation/dispatch → lifecycle states → execution phase → delivery phase). For each step name the responsible file(s) by SYMBOL/FILE (no line numbers), what it logs, and WHERE the log goes.
    2. **Log-location matrix (local vs production)** — table: for each surface, local command AND prod command, SIDE BY SIDE so each "where do I read X" question shows both answers. Local: gateway/inngest `/tmp/ai-dev.log`; worker `/tmp/employee-{taskId8}.log`; delivery `/tmp/employee-delivery-{taskId8}.log`; `docker logs employee-{first8}` (note `-delivery-` infix disambiguates both containers); SSE viewer route + dashboard `/dashboard/tasks/:taskId/logs`. Prod: Render API gateway logs, Fly Machines REST API worker logs, Inngest Cloud, Supabase Cloud DB (port 5432).
    3. **DB observability** — queryable tables with example SQL: `task_status_log` (state transitions + actor), `tasks` (status/failure_reason/failure_code/compiled_agents_md/metadata/raw_event), `executions` (session_transcript), `pending_approvals`, `feedback_events`, `task_metrics`, `task_composio_calls`. Column names MUST match `prisma/schema.prisma`. Show the SAME query against local (`psql ...:54322/ai_employee`) and prod (Supabase Cloud pooler, port 5432) so a debugger can run it in either environment.
    4. **Reverse "stuck-in-state → look here" lookup** — for each blocking state (Executing, Submitting, Reviewing, Delivering, Failed): what it means, where to look (local AND prod), the diagnostic query/command. Include reviewing-watchdog behavior and `failure_reason`/`failure_code`.
    5. **PRODUCTION INCIDENT PLAYBOOK (dedicated, deep section — not a thin matrix)** — a self-contained "you got paged, the stack is in the cloud" runbook. MUST cover:
       - **Topology orientation**: where each piece runs in prod (gateway → Render; worker/delivery containers → Fly machines; queue/lifecycle → Inngest Cloud; DB → Supabase Cloud). One-line "if symptom is X, the suspect tier is Y" map.
       - **Triage order**: the exact sequence to run when a prod task misbehaves — (1) find the task row + last `task_status_log` transition in Supabase Cloud (port 5432, session pooler — NOT 6543), (2) read gateway logs via Render API for the dispatch/lifecycle trace, (3) inspect the Fly worker/delivery machine state via the Machines REST API, (4) inspect the Inngest Cloud run for retry loops / stuck steps.
       - **Per-tier inspection commands**: concrete, copy-runnable — Render runtime-log fetch; Fly Machines REST list/state/logs for `ai-employee-workers`; Supabase Cloud psql connection string shape (port 5432) and the postgresql@17 client note; how to open the right Inngest Cloud run and read its step timeline.
       - **Prod-specific failure modes**: Inngest retry loop diagnosis, Render env-var gotchas, the IPv6-only direct-DB host vs IPv4 session pooler distinction, raising `LOG_LEVEL` in prod (Render env var) so the new poll/debug logs surface — and the restart caveat.
       - **No-`/tmp` reality**: in prod (`WORKER_RUNTIME=fly`) there is NO local worker log file and NO SSE viewer — worker logs come ONLY from Fly. State this prominently.
       - Every prod command MUST be sourced verbatim/cited from `production-ops` SKILL.md and `docs/guides/2026-06-01-2246-production-debugging-guide.md` (Task 9 verifies). Do NOT invent endpoints; where the prod-debugging-guide is the authority, cross-reference it explicitly rather than copying stale specifics.
    6. **Caveats** (all from Metis): delivery log NOT served by SSE (use `docker logs employee-delivery-{id}` or `cat /tmp/employee-delivery-{id}.log` locally; Fly logs in prod); `/tmp` logs exist only in local Docker mode; Inngest step memoization means per-poll logs appear once per step execution not per replay; `LOG_LEVEL=debug` required to see poll logs.
    7. **Cross-links** — point to `debugging-lifecycle` (state machine detail), `production-ops` (Render/Fly command reference), `e2e-testing` (triggering), `feature-verification` (PostgREST-vs-psql, zero-rows rule), `long-running-commands` (tmux). Cross-link, do NOT duplicate — the incident playbook ORCHESTRATES these into a triage sequence rather than restating their raw command tables.
  - Use the verified log names/levels from Tasks 1–5 and the real commands proven in Task 6.

  **Must NOT do**:
  - NO line numbers, NO volatile counts (durability rule; semantic constants like `SYNTHESIS_THRESHOLD = 5` allowed). NO duplication of cross-linked skills' content (the incident playbook references them, doesn't restate their command catalogs). NO inventing prod commands/endpoints. NOT placed under `src/workers/skills/`.

  **Recommended Agent Profile**:
  - **Category**: `writing` — technical documentation.
  - **Skills**: [`debugging-lifecycle`, `production-ops`, `feature-verification`] — to accurately summarize/cross-link without duplicating and to source prod commands.

  **Parallelization**:
  - **Can Run In Parallel**: NO (authoring precedes verification). **Blocked By**: 6. **Blocks**: 8, 9.

  **References**:
  - Format: any existing `.opencode/skills/*/SKILL.md` (e.g. `debugging-lifecycle`) for frontmatter + H2 + bash-block conventions.
  - `prisma/schema.prisma` — source of truth for every cited column.
  - `docs/guides/2026-06-01-2246-production-debugging-guide.md` + `production-ops` SKILL.md — source for all prod commands.
  - Verified outputs from Task 6 (log names, file paths, task ID).
  - WHY: This is the primary deliverable — the authoritative end-to-end debugging map.

  **Acceptance Criteria**:
  - [ ] File exists at `.opencode/skills/<slug>/SKILL.md` with directory name == `name` frontmatter.
  - [ ] Contains all 7 body sections: forward trace, log matrix (side-by-side local|prod), DB queries (local+prod), reverse lookup, the dedicated Production Incident Playbook, caveats, cross-links.
  - [ ] Production Incident Playbook is a self-contained runbook with: topology orientation, a numbered triage order, per-tier inspection commands (Render / Fly Machines REST / Supabase Cloud port 5432 / Inngest Cloud), prod-specific failure modes (Inngest retry loop, Render env gotchas, IPv6-vs-pooler, raising LOG_LEVEL in prod), and the no-`/tmp`/no-SSE-in-prod statement.
  - [ ] `head -5` shows valid frontmatter (`name` kebab-case, `description` "Use when… Covers…").

  **QA Scenarios**:

  ```
  Scenario: Skill file structure valid
    Tool: Bash
    Steps:
      1. Run: ls .opencode/skills/*/SKILL.md | tee .sisyphus/evidence/task-7-ls.txt
      2. Run: head -5 .opencode/skills/<slug>/SKILL.md | tee .sisyphus/evidence/task-7-frontmatter.txt
      3. Assert: file exists; frontmatter name matches dir; description present
    Expected Result: well-formed skill file
    Evidence: .sisyphus/evidence/task-7-ls.txt, task-7-frontmatter.txt
  ```

  (Command correctness verified in Task 8.)

  **Commit**: Groups with Task 9 (docs commit).

- [x] 8. Verify every LOCAL command + SQL query in the skill executes

  **What to do**:
  - Extract every fenced bash block in the skill that targets LOCAL and run it (dry-run/echo any destructive one). Confirm: `docker ps --filter name=employee-` runs; the `/tmp/employee-{id8}.log` pattern matches a real file from Task 6's run; the SSE route `GET /admin/tenants/:tenantId/tasks/:id/logs` returns a stream.
  - Run every documented SQL query via `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "<query>"` — each must execute with NO column-not-found error. Cross-check every cited column against `prisma/schema.prisma`.
  - Verify all cross-linked skills resolve: `ls .opencode/skills/<name>/SKILL.md` for `debugging-lifecycle`, `production-ops`, `e2e-testing`, `feature-verification`, `long-running-commands`.
  - Verify durability: `grep -nE ':[0-9]+|\([0-9]+ (states|tables|tools|files)\)' .opencode/skills/<slug>/SKILL.md` returns nothing (semantic constants excepted).
  - Fix any command/query/column the skill got wrong (report back; the skill author/Task 9 adjusts).

  **Must NOT do**:
  - Do NOT accept "reads correctly" — every local command/query must be executed. Do NOT run live PROD commands (those are cross-referenced in Task 9, not executed).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — execution-and-judgment verification.
  - **Skills**: [`feature-verification`, `prisma`] — PostgREST-vs-psql + schema-as-source-of-truth.

  **Parallelization**:
  - **Can Run In Parallel**: YES with Task 9 (different concerns). **Blocked By**: 7. **Blocks**: F-wave.

  **References**:
  - `prisma/schema.prisma` — verify each column.
  - The authored skill from Task 7.
  - WHY: A debugging skill is worthless if its commands/queries don't run; this is the "skill is correct" gate.

  **Acceptance Criteria**:
  - [ ] Every local bash block executed; output captured.
  - [ ] Every SQL query runs without column error.
  - [ ] All 5 cross-linked skills resolve.
  - [ ] Durability grep returns nothing.

  **QA Scenarios**:

  ```
  Scenario: All local skill commands and queries run
    Tool: Bash
    Steps:
      1. Execute each local fenced bash block; capture to evidence
      2. Run each documented SQL via psql ... ai_employee; capture to evidence
      3. Run: for s in debugging-lifecycle production-ops e2e-testing feature-verification long-running-commands; do ls .opencode/skills/$s/SKILL.md; done
      4. Run: grep -nE ':[0-9]+|\([0-9]+ (states|tables|tools|files)\)' .opencode/skills/<slug>/SKILL.md
      5. Assert: no command errors, no SQL column errors, all cross-links exist, durability grep empty
    Expected Result: skill is executable and durable
    Evidence: .sisyphus/evidence/task-8-commands.txt, task-8-sql.txt, task-8-crosslinks.txt, task-8-durability.txt
  ```

  **Commit**: NO (verification; any fixes fold into Task 9's docs commit).

- [x] 9. Cross-reference PROD commands + register skill in AGENTS.md (both dev-skill tables)

  **What to do**:
  - For every PRODUCTION command in the skill — including the full Production Incident Playbook (Render runtime-log fetch, Fly Machines REST list/state/logs, Supabase Cloud psql on port 5432, Inngest Cloud run inspection) — confirm it matches `production-ops` SKILL.md and/or `docs/guides/2026-06-01-2246-production-debugging-guide.md` verbatim or via explicit citation. Replace any invented/mismatched command with the documented form (or a cross-reference). Verify the prod-specific failure-mode guidance (Inngest retry loop, Render env gotchas, IPv6-direct-host vs IPv4-session-pooler port-5432 distinction, raising LOG_LEVEL in prod + restart caveat) matches the prod-debugging-guide.
  - Register the new skill in AGENTS.md in BOTH dev-skill locations: (a) the "If you are about to… / Load this skill" table, and (b) the "Dev skills (project-level at `.opencode/skills/`)" table — with an accurate one-line description that mentions BOTH local trace and production incident debugging.
  - Per Documentation Freshness rule, this is part of the same docs commit as the skill.

  **Must NOT do**:
  - Do NOT invent prod endpoints. Do NOT add the skill to any employee-skill table or Docker COPY path. Do NOT introduce volatile counts into AGENTS.md rows.

  **Recommended Agent Profile**:
  - **Category**: `writing`.
  - **Skills**: [`production-ops`] — the authoritative source for prod commands to cross-reference.

  **Parallelization**:
  - **Can Run In Parallel**: YES with Task 8. **Blocked By**: 7. **Blocks**: F-wave.

  **References**:
  - `production-ops` SKILL.md + `docs/guides/2026-06-01-2246-production-debugging-guide.md` — prod command source of truth.
  - AGENTS.md "Skills System" section — the two dev-skill tables to edit.
  - WHY: Ensures prod commands are real and the skill is discoverable (unregistered skill = invisible).

  **Acceptance Criteria**:
  - [ ] Every prod command matches or cites `production-ops` / prod-debugging-guide.
  - [ ] AGENTS.md has a row for the skill in BOTH dev-skill tables (`grep "<slug>" AGENTS.md` ≥ 2).

  **QA Scenarios**:

  ```
  Scenario: Skill registered and prod commands sourced
    Tool: Bash
    Steps:
      1. Run: grep -n "<slug>" AGENTS.md | tee .sisyphus/evidence/task-9-registration.txt
      2. Assert: ≥2 matches (both tables)
      3. Manually confirm each prod command appears in production-ops SKILL.md or the prod-debugging-guide; capture the cross-reference list
    Expected Result: registered in both tables; all prod commands sourced
    Evidence: .sisyphus/evidence/task-9-registration.txt, task-9-prod-xref.txt
  ```

  **Commit**: `docs(skills): add end-to-end execution trace & debugging skill` — SKILL.md + AGENTS.md; pre-commit `pnpm lint`.

- [ ] 10. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do** (only after F1–F4 pass and the user gives explicit okay):
  - Run: `tsx scripts/telegram-notify.ts "✅ e2e-debugging-skill complete — End-to-end debugging skill written, 5 logging gaps closed and verified. Come back to review."`

  **Recommended Agent Profile**: `quick`.
  **Parallelization**: NO. **Blocked By**: user okay after F-wave.
  **Acceptance Criteria**: [ ] Telegram message sent.
  **Commit**: NO.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Never mark F1–F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists (read SKILL.md; read each changed source file). For each "Must NOT Have": search for violations — skill NOT under `src/workers/skills/` or any Docker COPY path (`grep -rn "skills" Dockerfile`); no logger.ts config change (`git diff src/lib/logger.ts` empty); no poll-loop refactor; no SSE endpoint code change. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review all changed source files: confirm log messages are employee-agnostic (no guest/summary/Hostfully), correct levels (debug for poll loops, info otherwise), no dollar amounts (`grep -nE '\$[0-9]'`), no raw headers/env/secrets logged, scalar IDs only. Check for AI slop (over-logging, generic var names).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Re-run Task 6's live trigger; confirm each of the 5 new logs emits (poll logs with `LOG_LEVEL=debug`). Then execute EVERY local fenced bash block and EVERY SQL query in the skill — capture output. Confirm the delivery-log gap statement is accurate (`docker logs employee-delivery-*` works; SSE does not serve it). Confirm the Production Incident Playbook is present and complete (topology, numbered triage order, per-tier commands, prod failure modes, no-`/tmp`-in-prod) and that every prod command is cited to `production-ops`/the prod-debugging-guide (not invented). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Logs emitted [5/5] | Local cmds [N/N pass] | SQL [N/N pass] | Prod playbook [complete/incomplete + cited] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — everything specced was built, nothing beyond spec. Confirm exactly 5 source files changed for logging (plus SKILL.md + AGENTS.md). Detect contamination (no unrelated file touched). Verify durability: `grep -nE ':[0-9]+|\([0-9]+ (states|tables|tools|files)\)' SKILL.md` returns nothing (semantic constants excepted).
      Output: `Tasks [N/N compliant] | Files changed [exact list] | Contamination [CLEAN/N] | Durability [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **Logging (T1–5)**: `feat(observability): add logging at silent-failure points in dispatch and lifecycle` — the 5 changed source files; pre-commit: `pnpm lint`.
- **Skill + registration (T7,T9)**: `docs(skills): add end-to-end execution trace & debugging skill` — SKILL.md + AGENTS.md; pre-commit: `pnpm lint`.

---

## Success Criteria

### Verification Commands

```bash
pnpm build   # Expected: exit 0
pnpm lint    # Expected: exit 0
ls .opencode/skills/*/SKILL.md   # Expected: new skill listed
grep -nE ':[0-9]+' .opencode/skills/*/SKILL.md   # Expected: no line-number refs in new skill
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `pnpm build` + `pnpm lint` pass
- [ ] All 5 new logs proven to emit
- [ ] All local skill commands/queries executed successfully
