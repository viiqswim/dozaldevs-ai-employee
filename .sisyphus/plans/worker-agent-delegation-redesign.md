# Worker Agent Delegation Redesign

## TL;DR

> **Quick Summary**: Replace the current custom TypeScript orchestration inside the worker container (phases, waves, sessions, fix loops, validation pipelines) with a thin wrapper that starts OpenCode with the oh-my-opencode plugin, delegates planning to Prometheus, execution to Atlas, and lets the agent own its own completion signaling, observability, and restart idempotency via the plan file.
>
> **Deliverables**:
>
> - Thin `orchestrate.mts` wrapper (~100 lines replacing ~600)
> - oh-my-opencode plugin installed in worker Docker image
> - Single-session execution with native auto-compact support
> - Unified `WORKER_RUNTIME=docker|hybrid|fly` replacing two boolean flags
> - Base Docker image with Node, Python, Go, Rust + dynamic install support
> - Project profile persisted to Supabase (language, tooling, installed tools)
> - Cost-based escalation replacing iteration count limits
> - ngrok references removed entirely
> - Plan file unlocked — Atlas checks off tasks as it completes them
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 3 (Docker + plugin) → Task 5 (thin wrapper) → Task 10 (delete old code) → Task 12 (project profiles) → F1-F4

---

## Context

### Original Request

Victor reviewed `docs/2026-04-07-1732-hybrid-mode-current-state.md` and identified systemic over-engineering and design inconsistencies accumulated across multiple implementation phases. The core critique: the system is too deterministic, too Node-specific, too fragmented across three inconsistent dispatch modes, and its orchestration code duplicates what the oh-my-opencode agent system already does natively.

### Interview Summary

**Key Discussions**:

- **Full agent delegation**: Replace `orchestrate.mts` custom orchestration with thin wrapper. Atlas executes plans. Prometheus generates them. Oracle (or Haiku verifier) validates them. The agent owns planning, execution, verification, commit strategy, and completion signaling.
- **Plan as source of truth**: Checked-off plan tasks = progress. Unchecked = remaining. Restarted machine reads plan, continues from first unchecked task. Plan synced to Supabase after every check-off for durability.
- **Single session + auto-compact**: OpenCode has native `EventSessionCompacted` — no need for new-session-per-wave. Current code ignores this event (gap). One session per task.
- **No iteration count limits**: Replace with cost-based escalation (`TASK_COST_LIMIT_USD`, configurable). No hardcoded error truncation — let the model handle via auto-compact. Heartbeat-based timeout (no heartbeat → investigate → escalate), not fixed 30-min.
- **Dynamic tooling**: AI discovers what's available. `tooling_config` becomes override, not requirement. Agent installs what it needs dynamically on Fly.io machine.
- **Project profiles**: First-run discovery → stored in Supabase. Subsequent runs load profile → passed to Prometheus as context.

**Research Findings**:

- OpenCode SDK has `CompactionPart`, `EventSessionCompacted` types — auto-compact is native
- `session.promptAsync` supports `agent: string` parameter for programmatic agent selection
- oh-my-opencode plugin is NOT in worker's `opencode.json` or Docker image — must be added
- `boulder.json` / `boulderContext` is wired in orchestrate.mts but always passed as `null`
- `plan-sync.ts` infrastructure exists and can support per-task sync (currently per-wave only)

### Metis Review

**Identified Gaps** (addressed in plan):

- Completion signal contract must be specified in Prometheus's system prompt (exact PostgREST call), not assumed
- `session.promptAsync` agent parameter must be verified against installed plugin before shipping thin wrapper
- Track sequencing is critical: Foundation (T1-T4) must merge and pass tests before Core (T5-T9)
- Plan-sync must be more aggressive (per-task, not per-wave) to support the restart idempotency design

---

## Work Objectives

### Core Objective

Transition the worker from a custom multi-session orchestration system to a thin wrapper that delegates all execution intelligence to the oh-my-opencode Prometheus + Atlas agent system, while unifying the three dispatch modes and making the system language-agnostic.

### Concrete Deliverables

- `src/workers/orchestrate.mts` — thin wrapper, ~100 lines
- `src/workers/config/opencode.json` — plugin loaded, agent config set
- `Dockerfile` — Node + Python + Go + Rust + oh-my-opencode plugin
- `src/inngest/lifecycle.ts` — WORKER_RUNTIME enum, unified finally cleanup, Inngest tunnel
- `src/lib/ngrok-client.ts` — simplified to TUNNEL_URL-only or deleted
- Deleted: `fix-loop.ts`, `validation-pipeline.ts`, `between-wave-push.ts`, `continuation-dispatcher.ts`, `cost-breaker.ts`, `planning-orchestrator.ts`
- Simplified: `session-manager.ts` → lean `session-monitor.ts`
- New: `src/workers/lib/project-profile.ts` — Supabase profile read/write
- New: Prisma migration adding `project_profile` JSONB to `projects` table

### Definition of Done

- [ ] `pnpm trigger-task` completes with status=Done and a real PR created (local Docker mode)
- [ ] `USE_FLY_HYBRID=1 pnpm trigger-task` completes with status=Done and a real PR created (hybrid mode)
- [ ] `pnpm test -- --run` passes with no new failures beyond known pre-existing ones
- [ ] `pnpm build` succeeds (no TypeScript errors)
- [ ] `grep -r "ngrok" src/` returns zero matches
- [ ] `grep -r "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/` returns zero matches (except comments/docs)
- [ ] `grep -r "fix-loop\|validation-pipeline\|between-wave-push\|continuation-dispatcher\|cost-breaker\|planning-orchestrator" src/` returns zero matches

### Must Have

- oh-my-opencode plugin available inside worker container (Prometheus + Atlas agents callable)
- Single OpenCode session per task (no session-per-wave)
- Atlas checks off tasks in plan file as it completes them (plan lock removed)
- Plan file synced to Supabase after every check-off
- Completion signaling baked into Prometheus's system prompt (agent writes status=Submitting directly)
- Progress update milestones baked into plan via Prometheus instructions
- Heartbeat-based timeout (replaces fixed 30-min monitor)
- Cost-based escalation (replaces 3/10 iteration limits)
- WORKER_RUNTIME=docker|hybrid|fly (replaces two boolean flags)
- All modes use `finally` block for machine cleanup

### Must NOT Have (Guardrails)

- No `USE_LOCAL_DOCKER` or `USE_FLY_HYBRID` env vars in src/ (except migration comments)
- No `chmod 0o444` plan lock anywhere in code
- No hardcoded 4000-char error truncation
- No hardcoded 30-minute monitor timeout
- No per-stage or global fix-loop iteration counts
- No ngrok agent API calls or `NGROK_AGENT_URL` references
- No new-session-per-wave pattern
- No `fix-loop.ts`, `validation-pipeline.ts`, `between-wave-push.ts`, `continuation-dispatcher.ts`, `cost-breaker.ts`, `planning-orchestrator.ts` files
- No silent no-op when both mode flags are set (gone with WORKER_RUNTIME enum)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after (update/add tests for new modules; delete tests for deleted modules)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Backend/Node**: Bash (bun/node script or curl)
- **CLI/process**: interactive_bash (tmux)
- **API**: Bash (curl to Supabase PostgREST, Inngest API)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all parallel, different files/systems):
├── Task 1:  Remove ngrok → simplify ngrok-client.ts [quick]
├── Task 2:  Unify lifecycle.ts: WORKER_RUNTIME + cleanup + Inngest tunnel [unspecified-high]
└── Task 3:  Update Dockerfile: add runtimes + oh-my-opencode plugin + update opencode.json [deep]

Wave 2 (Core Delegation — after Wave 1):
├── Task 4:  Write thin orchestrate.mts wrapper [deep]
├── Task 5:  Write worker context template (Prometheus system prompt) [quick]
├── Task 6:  Handle session.compacted events in session monitoring [quick]
├── Task 7:  Make plan verifier always-on by default [quick]
└── Task 8:  Remove plan file lock (chmod 0o444) [quick]

Wave 3 (Cleanup — after Wave 2):
├── Task 9:  Delete over-engineered orchestration modules + tests [unspecified-high]
├── Task 10: Simplify session-manager.ts → lean session-monitor.ts [deep]
└── Task 11: Update plan-sync.ts for per-task sync cadence [quick]

Wave 4 (Enhancements — after Wave 3):
├── Task 12: Project profile schema (Prisma migration) + loader/writer [unspecified-high]
├── Task 13: Cost-based escalation (replace iteration count limits) [quick]
└── Task 14: Heartbeat-based timeout detection [quick]

Wave FINAL (after ALL tasks):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Full E2E manual QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]
```

### Dependency Matrix

- **1**: none → 4, 5, 6
- **2**: none → 4, 5, 6
- **3**: none → 4, 5, 6, 7
- **4**: 1, 2, 3 → 9, 10
- **5**: 3 → 9
- **6**: 2, 3 → 10
- **7**: 3 → 9
- **8**: none → 9
- **9**: 4, 5, 7, 8 → 12, 13, 14
- **10**: 4, 6 → 12, 13, 14
- **11**: 4 → 12
- **12**: 9, 10, 11 → F1-F4
- **13**: 9, 10 → F1-F4
- **14**: 10 → F1-F4

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `unspecified-high`, T3 `deep`
- **Wave 2**: 5 tasks — T4 `deep`, T5 `quick`, T6 `quick`, T7 `quick`, T8 `quick`
- **Wave 3**: 3 tasks — T9 `unspecified-high`, T10 `deep`, T11 `quick`
- **Wave 4**: 3 tasks — T12 `unspecified-high`, T13 `quick`, T14 `quick`
- **Final**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. Remove ngrok — simplify `ngrok-client.ts` to `TUNNEL_URL`-only

  **What to do**:
  - In `src/lib/ngrok-client.ts`: remove the ngrok agent API path entirely. If `TUNNEL_URL` env var is set, return it. If not set, throw a clear error: `"TUNNEL_URL is required for hybrid mode. Set it to your Cloudflare Tunnel URL."` Remove all ngrok-specific logic, the `NGROK_AGENT_URL` fallback, and the axios/fetch to `localhost:4040`.
  - Delete `NGROK_AGENT_URL` from `.env.example` and `AGENTS.md`.
  - Update the pre-flight check in `lifecycle.ts` that calls `getNgrokTunnelUrl()` — the function now either returns a URL or throws. The pre-flight catch already handles the throw correctly (sets `AwaitingInput`).
  - Update `tests/lib/ngrok-client.test.ts`: remove tests for the ngrok agent API path. Keep only the TUNNEL_URL override tests. Add a test for the "no TUNNEL_URL set" error case.
  - Update `AGENTS.md` hybrid mode section: remove all ngrok references, simplify to Cloudflare-only workflow.

  **Must NOT do**:
  - Do not remove the function itself — it's still called by lifecycle.ts
  - Do not change the function signature
  - Do not touch lifecycle.ts dispatch logic (that's Task 2)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4 (thin wrapper depends on ngrok being cleaned up)
  - **Blocked By**: None

  **References**:
  - `src/lib/ngrok-client.ts` — current implementation to simplify
  - `tests/lib/ngrok-client.test.ts` — tests to update
  - `src/inngest/lifecycle.ts:hybridFlyDispatch` — the pre-flight check that calls `getNgrokTunnelUrl()`
  - `.env.example` — remove `NGROK_AGENT_URL`
  - `AGENTS.md` — remove ngrok hybrid setup instructions

  **Acceptance Criteria**:
  - [ ] `grep -r "ngrok" src/` returns 0 matches
  - [ ] `grep -r "NGROK_AGENT_URL" .env.example` returns 0 matches
  - [ ] `pnpm test tests/lib/ngrok-client.test.ts -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: TUNNEL_URL set → returns URL
    Tool: Bash (bun/node REPL)
    Steps:
      1. TUNNEL_URL=https://test.trycloudflare.com node -e "const {getNgrokTunnelUrl} = require('./dist/lib/ngrok-client.js'); getNgrokTunnelUrl().then(console.log)"
    Expected Result: prints "https://test.trycloudflare.com"
    Evidence: .sisyphus/evidence/task-1-tunnel-url-set.txt

  Scenario: TUNNEL_URL not set → throws clear error
    Tool: Bash
    Steps:
      1. node -e "const {getNgrokTunnelUrl} = require('./dist/lib/ngrok-client.js'); getNgrokTunnelUrl().catch(e => console.log(e.message))"
    Expected Result: prints "TUNNEL_URL is required for hybrid mode..."
    Evidence: .sisyphus/evidence/task-1-no-tunnel-url.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(infra): remove ngrok, require TUNNEL_URL for hybrid mode`
  - Files: `src/lib/ngrok-client.ts`, `tests/lib/ngrok-client.test.ts`, `.env.example`, `AGENTS.md`

- [ ] 2. Unify dispatch modes in `lifecycle.ts`: `WORKER_RUNTIME` enum + unified cleanup + Inngest tunnel

  **What to do**:
  - Replace `USE_LOCAL_DOCKER` and `USE_FLY_HYBRID` booleans with a single `WORKER_RUNTIME` env var. Values: `docker`, `hybrid`, `fly`. Default (unset) → `fly` (current default behavior). Update the `update-status-executing` step to read `WORKER_RUNTIME` and return the mode string.
  - In ALL three dispatch paths, wrap the machine/container lifecycle in a `try/finally` block that calls the appropriate cleanup (`docker stop` for docker, `destroyMachine()` for fly/hybrid). Hybrid already has this — add it to docker and fly.
  - Add Inngest tunnel support to hybrid mode: if `INNGEST_TUNNEL_URL` env var is set, include `INNGEST_BASE_URL: process.env.INNGEST_TUNNEL_URL` in the hybrid machine env block. If not set, omit it (existing behavior).
  - Add `INNGEST_EVENT_KEY` to hybrid env block (pass `process.env.INNGEST_EVENT_KEY`).
  - Switch hybrid completion detection: if `INNGEST_TUNNEL_URL` is set, use `step.waitForEvent('engineering/task.completed', { timeout: '8h30m' })` instead of `pollForCompletion()`. If not set, fall back to `pollForCompletion()` (existing behavior).
  - Update `.env.example`: add `WORKER_RUNTIME=docker`, deprecate `USE_LOCAL_DOCKER` and `USE_FLY_HYBRID` with comments.
  - Update `AGENTS.md`: replace two-flag instructions with single `WORKER_RUNTIME` instructions.

  **Must NOT do**:
  - Do not break the existing `fly-client.ts` usage in the default Fly path
  - Do not change the machine env blocks beyond adding `INNGEST_BASE_URL`/`INNGEST_EVENT_KEY`
  - Do not remove `pollForCompletion()` — it's still the fallback
  - Do not accept both old flags AND new WORKER_RUNTIME simultaneously — migrate cleanly

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 6 (thin wrapper and session changes depend on clean lifecycle)
  - **Blocked By**: None

  **References**:
  - `src/inngest/lifecycle.ts` — full file, all three dispatch blocks
  - `src/inngest/lib/poll-completion.ts` — polling helper (keep as fallback)
  - `src/lib/fly-client.ts` — `createMachine()` used by default fly path (do not modify)
  - `tests/inngest/lifecycle.test.ts` (if exists) — update for WORKER_RUNTIME

  **Acceptance Criteria**:
  - [ ] `grep -r "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/` returns 0 matches
  - [ ] `pnpm build` passes
  - [ ] All three dispatch paths have try/finally cleanup blocks
  - [ ] `WORKER_RUNTIME=docker pnpm trigger-task` completes with status=Done (local Docker mode)

  **QA Scenarios**:

  ```
  Scenario: WORKER_RUNTIME=docker → dispatches local Docker container
    Tool: Bash (pnpm trigger-task in tmux)
    Steps:
      1. Start services: pnpm dev:start (in tmux session)
      2. WORKER_RUNTIME=docker pnpm trigger-task 2>&1 | tee /tmp/task-2-docker.log
      3. grep "status.*Done\|Done" /tmp/task-2-docker.log
    Expected Result: task reaches Done state, PR URL printed
    Evidence: .sisyphus/evidence/task-2-docker-mode.txt

  Scenario: WORKER_RUNTIME unset (no flags) → defaults to fly path without error
    Tool: Bash
    Steps:
      1. Verify no USE_LOCAL_DOCKER or USE_FLY_HYBRID anywhere in loaded env
      2. Run pnpm build to confirm TypeScript compiles cleanly
      3. grep -r "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/ — expect 0 matches
    Expected Result: Build passes, no references to old flags
    Evidence: .sisyphus/evidence/task-2-no-old-flags.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(infra): unify dispatch modes to WORKER_RUNTIME enum, add Inngest tunnel support`

- [ ] 3. Update Docker base image: add Python/Go/Rust runtimes + oh-my-opencode plugin

  **What to do**:
  - In `Dockerfile`: add to the apt-get install line (or a new RUN layer): Python 3, pip, golang, rustup/cargo. Use official slim packages where possible to keep image size reasonable.
  - Install oh-my-opencode plugin globally: `RUN npm install -g @opencode-ai/oh-my-opencode` (or whatever the correct package name is — verify by checking npm for the oh-my-opencode plugin package). If it's not a standalone npm package but embedded in oh-my-openagent, find the correct install path.
  - Update `src/workers/config/opencode.json` to load the plugin: `{ "plugins": ["oh-my-opencode"], "permission": { "*": "allow", "question": "deny" } }`. Verify the correct plugin identifier by checking `~/.config/opencode/opencode.json` on the developer's machine.
  - Verify Prometheus and Atlas agents are available: run `node -e "const sdk = require('@opencode-ai/sdk'); ..."` or check `app.agents()` response includes `prometheus` and `atlas`.
  - Do a test build: `docker build -t ai-employee-worker-test .` and verify the image builds without errors.
  - Add a smoke test script `scripts/verify-worker-agents.ts` that spins up the worker image locally and confirms Prometheus + Atlas are listed in `app.agents()`.

  **Must NOT do**:
  - Do not break the existing `pnpm build` step (TypeScript compile happens outside Docker)
  - Do not add GUI/display packages to the image
  - Do not remove existing tooling (git, GitHub CLI, opencode-ai, node:20-slim base)
  - Do not change WORKDIR or CMD in Dockerfile

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 7, 8 (thin wrapper and agent-delegation features require plugin in image)
  - **Blocked By**: None

  **References**:
  - `Dockerfile` — current base image and install layers
  - `src/workers/config/opencode.json` — worker's opencode config (add plugin declaration)
  - `~/.config/opencode/opencode.json` — developer's global opencode.json (copy plugin declaration pattern)
  - `~/.config/opencode/oh-my-openagent.json` — agent registry definition (understand what gets registered)
  - `@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `app.agents()` method signature

  **Acceptance Criteria**:
  - [ ] `docker build -t ai-employee-worker-test .` exits 0
  - [ ] Inside container: `opencode agents list` (or equivalent) includes `prometheus` and `atlas`
  - [ ] `src/workers/config/opencode.json` contains plugin declaration
  - [ ] Python3, Go, Rust available in container: `docker run --rm ai-employee-worker-test which python3 go rustc`

  **QA Scenarios**:

  ```
  Scenario: Docker image builds with all runtimes
    Tool: Bash (tmux for docker build)
    Steps:
      1. docker build -t ai-employee-worker-test . 2>&1 | tee /tmp/task-3-build.log
      2. grep "EXIT_CODE:" /tmp/task-3-build.log
      3. docker run --rm ai-employee-worker-test sh -c "which python3 && python3 --version && which go && go version && which rustc && rustc --version"
    Expected Result: All three runtimes found, versions printed
    Evidence: .sisyphus/evidence/task-3-runtimes.txt

  Scenario: oh-my-opencode agents available in container
    Tool: Bash
    Steps:
      1. docker run --rm -e OPENROUTER_API_KEY=test ai-employee-worker-test opencode agent list 2>&1
      2. Confirm "prometheus" and "atlas" in output
    Expected Result: Agent list includes prometheus and atlas
    Evidence: .sisyphus/evidence/task-3-agents.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(docker): add Python/Go/Rust runtimes and oh-my-opencode plugin`

- [ ] 4. Write thin `orchestrate.mts` wrapper

  **What to do**:
  - Replace the current `src/workers/orchestrate.mts` (~600 lines) with a thin wrapper (~100 lines) that does exactly:
    1. `parseContextFromEnv()` — read TASK_ID, EXECUTION_ID, SUPABASE_URL, SUPABASE_SECRET_KEY, REPO_URL, REPO_BRANCH, OPENROUTER_API_KEY, OPENROUTER_MODEL
    2. Load project profile from Supabase (`projects` table, look up by REPO_URL) — if no profile yet, pass `null` (Task 12 will fill this in)
    3. `runPreFlight()` — install dependencies (`resolveToolingConfig()` for install command), start heartbeat, start `opencode serve`, auth with OpenRouter (keep existing `opencode-server.ts` and auth call)
    4. Build branch name and checkout (keep existing `branch-manager.ts`)
    5. Create a SINGLE OpenCode session. Pass `agent: "prometheus"` in the initial prompt body. The initial prompt includes: ticket context, project profile (if any), repo info, and the worker system prompt template (see Task 5).
    6. Monitor the session via SSE events (see Task 6 — `session-monitor.ts`). Listen for: `session.idle` (check if completion written to Supabase), `session.compacted` (log + continue), `session.error` (escalate).
    7. Completion detection: poll Supabase every 30s for `tasks.status = Submitting`. If detected → task complete. If cost limit exceeded → escalate. If heartbeat stops → investigate → escalate.
    8. `finalize()` — write final status if not already done, cleanup.
  - Keep `src/workers/lib/opencode-server.ts`, `src/workers/lib/branch-manager.ts`, `src/workers/lib/heartbeat.ts`, `src/workers/lib/task-context.ts`, `src/workers/lib/project-config.ts`, `src/workers/lib/install-runner.ts`
  - Verify that `session.promptAsync` with `agent: "prometheus"` body parameter works against the installed plugin before shipping. Write a brief integration test in `scripts/verify-worker-agents.ts`.

  **Must NOT do**:
  - Do not recreate the phase/wave/session-per-wave pattern
  - Do not import or call `fix-loop.ts`, `validation-pipeline.ts`, `between-wave-push.ts`, `continuation-dispatcher.ts`, `planning-orchestrator.ts` (they will be deleted in Task 9)
  - Do not add logic for "when to switch agents" — the Prometheus→Atlas handoff is handled by the agent system itself
  - Do not hardcode any 30-minute timeout — completion monitoring is heartbeat-based + cost-based (Task 14)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 10, 11 (old code can only be deleted once thin wrapper is proven)
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `src/workers/orchestrate.mts` — current implementation to replace (read to understand what to preserve)
  - `src/workers/lib/opencode-server.ts` — keep, still needed to start opencode serve
  - `src/workers/lib/branch-manager.ts` — keep, still needed for branch setup
  - `src/workers/lib/heartbeat.ts` — keep, still needed for observability
  - `src/workers/lib/task-context.ts` — keep, still needed to parse task context
  - `src/workers/lib/install-runner.ts` — keep, still needed for dependency installation
  - `@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `session.promptAsync` signature with `agent` param
  - `src/workers/lib/session-manager.ts` — read to understand current SSE monitoring (then simplify in Task 10)
  - `src/inngest/lib/poll-completion.ts` — the Supabase polling pattern for completion detection

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes with new thin orchestrate.mts
  - [ ] `WORKER_RUNTIME=docker pnpm trigger-task` runs to completion (agent drives the work)
  - [ ] Supabase shows `status=Submitting` written by the agent directly
  - [ ] A PR is created on the test repo

  **QA Scenarios**:

  ```
  Scenario: Thin wrapper starts OpenCode, delegates to Prometheus, task completes
    Tool: interactive_bash (tmux)
    Steps:
      1. tmux new-session -d -s task4-e2e
      2. tmux send-keys -t task4-e2e "WORKER_RUNTIME=docker pnpm trigger-task 2>&1 | tee /tmp/task4-e2e.log; echo EXIT_CODE:$? >> /tmp/task4-e2e.log" Enter
      3. Poll: tail -30 /tmp/task4-e2e.log every 60s
      4. grep "status.*Done\|EXIT_CODE:0" /tmp/task4-e2e.log
    Expected Result: Task reaches Done state. PR URL logged.
    Failure Indicators: EXIT_CODE non-zero, "AwaitingInput" in log, no PR URL
    Evidence: .sisyphus/evidence/task-4-e2e.txt

  Scenario: session.promptAsync with agent:"prometheus" is accepted
    Tool: Bash
    Steps:
      1. Start opencode serve in background
      2. curl -X POST http://localhost:4096/session -d '{"title":"test"}' → get session ID
      3. curl -X POST http://localhost:4096/session/{id}/prompt -d '{"agent":"prometheus","parts":[{"type":"text","text":"hello"}]}'
      4. Verify HTTP 204 (accepted, not 400/422)
    Expected Result: 204 response, no error
    Evidence: .sisyphus/evidence/task-4-agent-param.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(worker): thin orchestrate.mts wrapper delegating to prometheus+atlas`

- [ ] 5. Write worker context template (Prometheus system prompt injected at session start)

  **What to do**:
  - Create `src/workers/lib/worker-context-template.ts` that exports a `buildWorkerSystemPrompt(task, projectProfile)` function.
  - The function returns a string that is passed as the first prompt to the Prometheus agent when the session is created. It must include:
    1. **Completion signaling**: "When all tasks in your plan are complete, signal completion by running: `curl -X PATCH \"$SUPABASE_URL/rest/v1/tasks?id=eq.$TASK_ID\" -H \"apikey: $SUPABASE_SECRET_KEY\" -H \"Authorization: Bearer $SUPABASE_SECRET_KEY\" -H \"Content-Type: application/json\" -d '{\"status\":\"Submitting\",\"updated_at\":\"now()\"}'`. This is your final mandatory task. Always include it in the plan."
    2. **Progress milestones**: "At the end of each major milestone (every 3-4 tasks), run: `curl -X PATCH \"$SUPABASE_URL/rest/v1/executions?id=eq.$EXECUTION_ID\" ...` to update the heartbeat. The platform monitors this to know you're still working."
    3. **Dynamic tooling**: "Discover what's available in this repository by reading package.json, Makefile, Cargo.toml, go.mod, requirements.txt, etc. Do NOT assume pnpm or any specific toolchain. Install what you need with apt-get, pip, cargo, go get, etc. if it's not available."
    4. **Plan format**: "Your plan must follow the `.sisyphus/plans/TICKET-KEY.md` format with `## Wave N` sections and `- [ ] N. Task title` items. Check off tasks as you complete them."
    5. **Project profile update**: "At the end of your work, update the project profile by running a curl POST to `$SUPABASE_URL/rest/v1/project_profiles` with the language, package manager, test framework, and any tools you installed."
    6. **Restart resilience**: "If you find a plan already partially checked off when you start, continue from the first unchecked task. Never re-do completed tasks."
  - Update `orchestrate.mts` (Task 4) to call `buildWorkerSystemPrompt()` when creating the session.

  **Must NOT do**:
  - Do not hardcode specific Supabase URLs or task IDs in the template (they come from env vars injected into the prompt)
  - Do not include Node/pnpm-specific instructions — keep tool discovery generic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6, 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9 (deletion of planning-orchestrator depends on this template replacing its functionality)
  - **Blocked By**: Task 3 (need to know which agents are available and their naming)

  **References**:
  - `src/workers/lib/prompt-builder.ts` — current prompt building (read to understand what context is currently injected)
  - `src/workers/lib/planning-orchestrator.ts` — the planning session prompt (understand what it currently tells the agent)
  - `src/inngest/lib/poll-completion.ts` — the PostgREST call format for Supabase writes

  **Acceptance Criteria**:
  - [ ] `buildWorkerSystemPrompt()` function exported from new file
  - [ ] Function includes all 6 required sections (completion signal, milestones, tooling, plan format, profile update, restart resilience)
  - [ ] `grep "Submitting" src/workers/lib/worker-context-template.ts` returns a match (completion signal present)
  - [ ] `pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: Template includes completion signal instruction
    Tool: Bash
    Steps:
      1. grep -A5 "Submitting" src/workers/lib/worker-context-template.ts
    Expected Result: Shows the curl PATCH command for status=Submitting
    Evidence: .sisyphus/evidence/task-5-completion-signal.txt

  Scenario: Template includes dynamic tooling instruction
    Tool: Bash
    Steps:
      1. grep -i "discover\|package.json\|Makefile\|Cargo.toml" src/workers/lib/worker-context-template.ts
    Expected Result: At least one match confirming dynamic tooling instructions present
    Evidence: .sisyphus/evidence/task-5-dynamic-tooling.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(worker): add worker context template with completion/milestone/tooling instructions`

- [ ] 6. Handle `session.compacted` events in session monitoring

  **What to do**:
  - In `src/workers/lib/session-manager.ts` (or `session-monitor.ts` once Task 10 renames it): add a handler for the `session.compacted` SSE event (`EventSessionCompacted` type from SDK).
  - When `session.compacted` fires: log `"Session auto-compacted — context window was full, continuing"`. Do NOT treat this as session completion. Do NOT interrupt the session. Reset any idle-detection timers that might interpret compaction as inactivity.
  - Verify: the current `monitorSession()` function has an SSE event loop — find where it handles `session.idle` and add `session.compacted` as a separate handled case.

  **Must NOT do**:
  - Do not abort or restart the session on compaction
  - Do not add compaction to the "completion" detection logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10 (session-monitor.ts simplification)
  - **Blocked By**: Tasks 2, 3 (need clean lifecycle and session infrastructure)

  **References**:
  - `src/workers/lib/session-manager.ts` — specifically the SSE event loop in `monitorSession()`
  - `@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `EventSessionCompacted`, `CompactionPart` types
  - `@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `event.subscribe()` SSE stream

  **Acceptance Criteria**:
  - [ ] `grep "session.compacted\|compacted" src/workers/lib/session-manager.ts` returns a match
  - [ ] `pnpm build` passes
  - [ ] No abort/restart logic in the compaction handler

  **QA Scenarios**:

  ```
  Scenario: session.compacted event logged without aborting
    Tool: Bash
    Steps:
      1. grep -A10 "session.compacted\|compacted" src/workers/lib/session-manager.ts
    Expected Result: Handler logs the event and continues (no abort/throw)
    Evidence: .sisyphus/evidence/task-6-compacted-handler.txt
  ```

  **Commit**: YES (groups with Wave 2)

- [ ] 7. Make plan verifier always-on by default

  **What to do**:
  - In `src/workers/config/long-running.ts`: change `planVerifierModel` to default to `'anthropic/claude-haiku-4-5'` (not `''`).
  - Replace the "empty string = disabled" pattern with an explicit `PLAN_VERIFIER_ENABLED` env var check. If `PLAN_VERIFIER_ENABLED=false`, skip the verifier. Otherwise always run it.
  - Update `.env.example`: add `PLAN_VERIFIER_ENABLED=true` with a comment explaining how to disable.
  - Update `src/workers/lib/plan-judge.ts`: change the guard from `if (!planVerifierModel)` to `if (process.env.PLAN_VERIFIER_ENABLED === 'false')`.
  - Extend plan-judge rubric: add two new checks — (a) plan contains a completion signaling task (grep for "Submitting" or "signal completion"), (b) plan contains at least one progress milestone update task. These are now mandatory per the worker context template (Task 5).

  **Must NOT do**:
  - Do not change the judge gate retry logic (2 attempts, then PlanJudgeExhaustedError)
  - Do not change the rubric scoring weights

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 6, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9 (deletion of old planning-orchestrator)
  - **Blocked By**: Task 3 (need plugin loaded so Haiku can be used as verifier)

  **References**:
  - `src/workers/config/long-running.ts` — `planVerifierModel` field
  - `src/workers/lib/plan-judge.ts` — the judge function and rubric
  - `src/workers/lib/planning-orchestrator.ts` — where the judge gate is called (this file will be deleted in Task 9, so thin wrapper in Task 4 must call judge before Task 9 runs)
  - `.env.example` — update env var documentation

  **Acceptance Criteria**:
  - [ ] `grep "PLAN_VERIFIER_ENABLED" src/workers/` returns matches
  - [ ] `grep "planVerifierModel.*''" src/workers/config/long-running.ts` returns 0 (empty string default gone)
  - [ ] Plan judge rubric includes completion signal check
  - [ ] `pnpm test tests/workers/lib/plan-judge.test.ts -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: Plan verifier runs by default (no env var needed)
    Tool: Bash
    Steps:
      1. grep "PLAN_VERIFIER_ENABLED" src/workers/config/long-running.ts
    Expected Result: Default is enabled (not the empty string pattern)
    Evidence: .sisyphus/evidence/task-7-verifier-default.txt

  Scenario: Plan without completion signal is rejected
    Tool: Bash (bun test)
    Steps:
      1. Write unit test: callPlanJudge() with a plan that has no "Submitting" mention
      2. Assert verdict is REJECT with reason about missing completion signal
    Expected Result: REJECT verdict
    Evidence: .sisyphus/evidence/task-7-verifier-rejects-no-signal.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(worker): plan verifier always-on, extend rubric for completion signal check`

- [ ] 8. Remove plan file lock (`chmod 0o444`)

  **What to do**:
  - In `src/workers/lib/planning-orchestrator.ts`: remove the `chmod(planPath, 0o444)` call (or equivalent `fs.chmod`). The plan file must remain writable so Atlas can check off tasks as it completes them.
  - Search for any other places where the plan file is locked: `grep -r "chmod\|0o444" src/`.
  - Verify plan file remains readable and writable throughout task execution.
  - Update the comment in `planning-orchestrator.ts` that explains the lock rationale — remove or replace with a note that the plan is intentionally writable for Atlas to track progress.
  - No other code changes needed for this task.

  **Must NOT do**:
  - Do not change any other aspect of `planning-orchestrator.ts` (that file is being deleted in Task 9 — keep changes minimal here to avoid conflicts)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: None (independent of other Wave 2 tasks)

  **References**:
  - `src/workers/lib/planning-orchestrator.ts` — find the chmod call
  - `src/workers/lib/plan-sync.ts` — verify no lock on plan sync side

  **Acceptance Criteria**:
  - [ ] `grep -r "chmod\|0o444" src/` returns 0 matches
  - [ ] `pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: Plan file is writable after session creates it
    Tool: Bash
    Steps:
      1. grep -r "chmod\|0o444" src/
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-8-no-chmod.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(worker): remove plan file lock, allow Atlas to check off tasks`

- [ ] 9. Delete over-engineered orchestration modules and their tests

  **What to do**:
  - Delete the following source files (ONLY after Task 4 thin wrapper is proven working):
    - `src/workers/lib/fix-loop.ts`
    - `src/workers/lib/validation-pipeline.ts`
    - `src/workers/lib/between-wave-push.ts`
    - `src/workers/lib/continuation-dispatcher.ts`
    - `src/workers/lib/cost-breaker.ts`
    - `src/workers/lib/planning-orchestrator.ts`
    - `src/workers/lib/wave-executor.ts`
    - `src/workers/lib/completion-detector.ts`
  - Additionally, audit and delete the following files IF they are not imported by the new thin `orchestrate.mts` or any load-bearing file. **Read each file before deleting** to confirm it is not used by `opencode-server.ts`, `branch-manager.ts`, `heartbeat.ts`, `task-context.ts`, `install-runner.ts`, or the new `session-monitor.ts`:
    - `src/workers/lib/resource-caps.ts` — likely resource/CPU/memory caps tied to old orchestration
    - `src/workers/lib/cost-tracker-v2.ts` — old cost tracking, superseded by Task 13 cost-based escalation
    - `src/workers/lib/token-tracker.ts` — old token usage tracking, superseded by Task 13
    - `src/workers/lib/cache-validator.ts` — cache validation tied to old wave pattern
    - `src/workers/lib/ci-classifier.ts` — CI environment classifier; delete if not used by thin wrapper
    - `src/workers/lib/completion.ts` — separate from `completion-detector.ts`; read carefully before deleting, may contain shared completion helpers still needed
  - Delete corresponding test files:
    - `tests/workers/lib/fix-loop.test.ts` (if exists)
    - `tests/workers/lib/validation-pipeline.test.ts` (if exists)
    - `tests/workers/lib/planning-orchestrator.test.ts` (if exists)
    - Others in the same pattern for all deleted files
  - Remove all imports of these modules from other files. Use `grep -r "fix-loop\|validation-pipeline\|between-wave-push\|continuation-dispatcher\|cost-breaker\|planning-orchestrator\|wave-executor\|completion-detector\|resource-caps\|cost-tracker-v2\|token-tracker\|cache-validator\|ci-classifier" src/` to find all import sites. Update `orchestrate.mts` and any other files that imported these.
  - Run `pnpm build` after each deletion to catch missing imports.

  **Must NOT do**:
  - Do not delete `session-manager.ts` yet (that's Task 10)
  - Do not delete `plan-judge.ts` (still needed — verifier is always-on from Task 7)
  - Do not delete `plan-parser.ts` (still needed — thin wrapper may still parse plan for restart detection)
  - Do not delete `prompt-builder.ts` (may still be needed — check if thin wrapper uses it)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 12, 13, 14 (enhancements can only run on clean codebase)
  - **Blocked By**: Tasks 4, 5, 7, 8

  **References**:
  - All files listed above (read before deleting to confirm no shared utilities)
  - `src/workers/orchestrate.mts` (new thin wrapper) — confirm it imports none of these

  **Acceptance Criteria**:
  - [ ] `grep -r "fix-loop\|validation-pipeline\|between-wave-push\|continuation-dispatcher\|cost-breaker\|planning-orchestrator\|wave-executor\|completion-detector\|resource-caps\|cost-tracker-v2\|token-tracker\|cache-validator\|ci-classifier" src/` returns 0 matches (for all confirmed-deleted files)
  - [ ] `pnpm build` passes after all deletions
  - [ ] `pnpm test -- --run` passes (no tests referencing deleted modules)
  - [ ] Each of the 6 audited files (resource-caps, cost-tracker-v2, token-tracker, cache-validator, ci-classifier, completion.ts) has a decision recorded in a comment at the top of the commit message: kept or deleted with one-line reason

  **QA Scenarios**:

  ```
  Scenario: No references to deleted modules remain
    Tool: Bash
    Steps:
      1. grep -r "fix-loop\|validation-pipeline\|between-wave-push\|continuation-dispatcher\|cost-breaker\|planning-orchestrator\|wave-executor\|completion-detector\|resource-caps\|cost-tracker-v2\|token-tracker\|cache-validator\|ci-classifier" src/
    Expected Result: 0 matches for all confirmed-deleted files
    Evidence: .sisyphus/evidence/task-9-no-references.txt

  Scenario: Build still passes after deletions
    Tool: Bash
    Steps:
      1. pnpm build 2>&1 | tee /tmp/task-9-build.log
      2. grep "error TS\|Cannot find module" /tmp/task-9-build.log
    Expected Result: 0 TypeScript errors
    Evidence: .sisyphus/evidence/task-9-build.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(worker): delete over-engineered orchestration modules`

- [ ] 10. Simplify `session-manager.ts` → lean `session-monitor.ts`

  **What to do**:
  - Create `src/workers/lib/session-monitor.ts` as a lean replacement for `session-manager.ts`. It needs only:
    - `createSession(client, title)` — create a single session
    - `promptSession(client, sessionId, prompt, agentName?)` — send a prompt with optional agent override
    - `monitorSession(client, sessionId, opts)` — SSE-based monitoring that handles: `session.idle` (check if done), `session.compacted` (log + continue, reset idle timer), `session.error` (throw), heartbeat check (if no event in N minutes → escalate)
    - `abortSession(client, sessionId)` — abort running session
  - The key simplification: remove all wave-specific logic, continuation logic, fix-loop integration, and multiple-session management. Single session, simple monitor.
  - Once `session-monitor.ts` is working: delete `session-manager.ts`. Update `orchestrate.mts` (thin wrapper) imports.
  - Delete `tests/workers/lib/session-manager.test.ts` (has known pre-existing ESLint failure). Add `tests/workers/lib/session-monitor.test.ts` with unit tests for the new lean API.

  **Must NOT do**:
  - Do not port the wave-management logic into the new file
  - Do not keep the continuation-dispatcher pattern
  - Do not keep the `sendFixPrompt()` method — that's gone

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 12, 13, 14
  - **Blocked By**: Tasks 4, 6

  **References**:
  - `src/workers/lib/session-manager.ts` — read entire file to understand what to keep
  - `@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `session.*` methods and `event.subscribe()`
  - `@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `SessionStatus`, `EventSessionCompacted`, etc.

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/session-monitor.ts` exists with all 4 required functions
  - [ ] `src/workers/lib/session-manager.ts` deleted
  - [ ] `grep "session-manager" src/` returns 0 matches
  - [ ] `pnpm test tests/workers/lib/session-monitor.test.ts -- --run` passes
  - [ ] `pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: session-monitor handles session.compacted without aborting
    Tool: Bash (bun test)
    Steps:
      1. Unit test: mock SSE stream emitting session.compacted then session.idle
      2. Assert monitorSession() continues after compacted event (does not throw/resolve early)
    Expected Result: Test passes
    Evidence: .sisyphus/evidence/task-10-compacted-test.txt

  Scenario: No references to old session-manager remain
    Tool: Bash
    Steps:
      1. grep -r "session-manager" src/
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-10-no-session-manager.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(worker): replace session-manager with lean session-monitor`

- [ ] 11. Update `plan-sync.ts` for per-task sync cadence

  **What to do**:
  - In `src/workers/lib/plan-sync.ts`: update the sync logic to persist the plan to Supabase after every individual task check-off, not just at wave boundaries.
  - The plan file is now updated by Atlas (checked-off tasks) as it works. The sync needs to watch for changes and persist them.
  - Implementation options: (a) file watcher on the plan file path, or (b) periodic sync every 30 seconds, or (c) expose a `syncPlanNow()` function that the thin wrapper calls when it detects `session.idle` (a natural checkpoint).
  - Recommended approach: (c) — call `syncPlanNow()` after each `session.idle` event in `session-monitor.ts`. This is the natural checkpoint. Simple, no file-watching complexity.
  - Remove `wave_number` tracking from `plan-sync.ts` (no longer relevant — replaced by plan check-offs).
  - Keep: plan content storage in Supabase, plan retrieval on restart.

  **Must NOT do**:
  - Do not add real-time file watching (adds OS-level complexity)
  - Do not remove the plan retrieval on restart (still needed for idempotency)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 12
  - **Blocked By**: Task 4

  **References**:
  - `src/workers/lib/plan-sync.ts` — full current implementation
  - `src/workers/lib/session-monitor.ts` (Task 10) — `session.idle` event is the sync trigger

  **Acceptance Criteria**:
  - [ ] `grep "wave_number" src/workers/lib/plan-sync.ts` returns 0 matches
  - [ ] `syncPlanNow()` (or equivalent) is called on session.idle in session-monitor.ts
  - [ ] `pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: Plan synced to Supabase on session.idle
    Tool: Bash (unit test)
    Steps:
      1. Mock session-monitor to emit session.idle
      2. Assert syncPlanNow() is called
      3. Assert Supabase plan content is updated
    Expected Result: Plan content written to Supabase after idle event
    Evidence: .sisyphus/evidence/task-11-plan-sync.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `refactor(worker): update plan-sync for per-task checkpoint cadence`

- [ ] 12. Add project profile to Supabase + loader/writer in thin wrapper

  **What to do**:
  - Write a Prisma migration adding `project_profile` JSONB column to the `projects` table. Schema: `{ language: string[], packageManager: string, testFramework: string, buildCommands: string[], installedTools: string[], lastUpdated: string }`. Nullable (no profile yet = first run).
  - Create `src/workers/lib/project-profile.ts` with:
    - `loadProjectProfile(supabaseUrl, supabaseKey, repoUrl)` — fetches `project_profile` from `projects` where `repo_url = repoUrl`. Returns `null` if not found or column is null.
    - `saveProjectProfile(supabaseUrl, supabaseKey, repoUrl, profile)` — PATCHes `project_profile` on the matching project row.
  - In thin `orchestrate.mts` (Task 4): call `loadProjectProfile()` in pre-flight and pass the result to `buildWorkerSystemPrompt()` (Task 5). The template already has a slot for it.
  - The agent itself (Atlas) saves the profile at the end of its work via the worker context template instruction (Task 5 — the PostgREST call is in the prompt). This file just provides the TypeScript helper for the loader.

  **Must NOT do**:
  - Do not block task execution if profile is null (first run is fine)
  - Do not add profile discovery logic in TypeScript — the agent does discovery

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 9, 10, 11

  **References**:
  - `prisma/schema.prisma` — add `project_profile` to `Project` model
  - `src/workers/lib/task-context.ts` — pattern for Supabase PostgREST reads in the worker
  - `src/workers/orchestrate.mts` — where `loadProjectProfile()` gets called

  **Acceptance Criteria**:
  - [ ] `prisma migrate dev` applies cleanly (migration adds `project_profile` column)
  - [ ] `loadProjectProfile()` returns `null` for a project with no profile
  - [ ] `saveProjectProfile()` updates the column via PostgREST
  - [ ] `pnpm test tests/workers/lib/project-profile.test.ts -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: Load profile for project with no profile → null
    Tool: Bash (curl)
    Steps:
      1. curl "$SUPABASE_URL/rest/v1/projects?repo_url=eq.https://github.com/viiqswim/ai-employee-test-target&select=project_profile" -H "apikey: $SUPABASE_SECRET_KEY"
    Expected Result: JSON with project_profile: null
    Evidence: .sisyphus/evidence/task-12-null-profile.txt

  Scenario: Save profile → persisted in Supabase
    Tool: Bash (curl)
    Steps:
      1. PATCH project_profile with test profile JSON
      2. GET project_profile — verify round-trip
    Expected Result: Saved profile matches sent profile
    Evidence: .sisyphus/evidence/task-12-save-profile.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(worker): add project profile persistence to Supabase`

- [ ] 13. Implement cost-based escalation (replace iteration count limits)

  **What to do**:
  - In `src/workers/lib/session-monitor.ts` (Task 10): add cost tracking. After each `session.idle` or `session.compacted` event, query the session's total token usage via `session.messages({ path: { id: sessionId } })` and calculate approximate cost (input tokens × input rate + output tokens × output rate for the configured model).
  - If cumulative cost exceeds `process.env.TASK_COST_LIMIT_USD` (default: `"20"`): call `escalate()` with reason `"Cost limit exceeded: $X spent on this task"`.
  - Add `TASK_COST_LIMIT_USD` to `.env.example` with default `20` and explanation.
  - Remove any remaining references to `perStageFixes`, `globalFixes`, or iteration count limits from the codebase (should be gone after Task 9, but verify).

  **Must NOT do**:
  - Do not implement complex cost calculators — simple token count × known rate is sufficient
  - Do not add per-model rate tables — use a conservative single rate (e.g., $0.003/1k tokens combined) or read rate from env

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 14)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 9, 10

  **References**:
  - `src/workers/lib/session-monitor.ts` (Task 10) — add cost check to idle handler
  - `@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `session.messages()` for token data
  - `src/workers/lib/heartbeat.ts` — escalate() pattern

  **Acceptance Criteria**:
  - [ ] `grep -r "perStageFixes\|globalFixes\|maxStageRetries\|maxGlobalRetries" src/` returns 0 matches
  - [ ] `TASK_COST_LIMIT_USD` present in `.env.example`
  - [ ] `pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: Cost limit exceeded → escalation triggered
    Tool: Bash (unit test)
    Steps:
      1. Mock session.messages() to return high token count
      2. Set TASK_COST_LIMIT_USD=0.001 (very low to trigger)
      3. Assert escalate() is called with cost-limit reason
    Expected Result: escalate() called
    Evidence: .sisyphus/evidence/task-13-cost-escalation.txt

  Scenario: No iteration count references in codebase
    Tool: Bash
    Steps:
      1. grep -r "perStageFixes\|globalFixes\|maxStageRetries\|maxGlobalRetries" src/
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-13-no-iteration-limits.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(worker): replace iteration count limits with cost-based escalation`

- [ ] 14. Implement heartbeat-based timeout detection

  **What to do**:
  - In `src/workers/lib/session-monitor.ts` (Task 10): replace the fixed 30-minute monitor timeout with heartbeat-based detection. If no SSE event is received for `N` minutes (`HEARTBEAT_TIMEOUT_MINS`, default `"15"`), AND no Supabase heartbeat has been posted recently: investigate (query task status) → if still Executing → escalate with `"Agent appears stuck: no activity for N minutes"`.
  - The heartbeat from `heartbeat.ts` posts to Supabase every 60 seconds. Use the `executions.last_heartbeat_at` field as the liveness indicator: if it's more than `HEARTBEAT_TIMEOUT_MINS` old, the agent is stuck.
  - Remove any hardcoded `30 * 60 * 1000` timeout values from `session-manager.ts` / `long-running.ts`. Replace with the new heartbeat-based detection.
  - Add `HEARTBEAT_TIMEOUT_MINS` to `.env.example` with default `15`.

  **Must NOT do**:
  - Do not remove the heartbeat poster (`heartbeat.ts`) — it's still needed
  - Do not use wall-clock timeout for session monitoring — use heartbeat liveness instead

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Task 10

  **References**:
  - `src/workers/lib/session-monitor.ts` (Task 10)
  - `src/workers/lib/heartbeat.ts` — how heartbeat is posted, `last_heartbeat_at` field
  - `src/workers/config/long-running.ts` — find existing timeout values to remove

  **Acceptance Criteria**:
  - [ ] `grep -r "30 \* 60\|30\*60\|1800000" src/workers/` returns 0 matches (no hardcoded 30-min timeout)
  - [ ] `HEARTBEAT_TIMEOUT_MINS` in `.env.example`
  - [ ] `pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: Stale heartbeat → escalation triggered
    Tool: Bash (unit test)
    Steps:
      1. Mock heartbeat.ts to return last_heartbeat_at = 20 minutes ago
      2. Set HEARTBEAT_TIMEOUT_MINS=15
      3. Assert escalate() is called
    Expected Result: escalate() called with stuck-agent message
    Evidence: .sisyphus/evidence/task-14-heartbeat-timeout.txt

  Scenario: No hardcoded 30-min timeout
    Tool: Bash
    Steps:
      1. grep -r "30 \* 60\|1800000" src/workers/
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-14-no-hardcoded-timeout.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `feat(worker): replace fixed timeout with heartbeat-based stuck detection`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run` + `pnpm lint` (excluding known pre-existing session-manager.test.ts lint failure). Review all changed files for: `as any`, `@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Full E2E Manual QA** — `unspecified-high`
      Run `pnpm trigger-task` in local Docker mode. Verify: task reaches Done state, PR created on test repo, plan file has checked-off tasks, project profile written to Supabase, no over-engineered modules present in src/. Evidence saved to `.sisyphus/evidence/final-qa/`.
      Output: `E2E [PASS/FAIL] | PR URL | Profile written [YES/NO] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec built, nothing beyond spec. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `refactor(infra): remove ngrok, unify dispatch modes, update docker base image`
- **Wave 2**: `feat(worker): delegate planning/execution to oh-my-opencode prometheus+atlas agents`
- **Wave 3**: `refactor(worker): remove over-engineered orchestration modules`
- **Wave 4**: `feat(worker): project profiles, cost-based escalation, heartbeat timeout`

---

## Success Criteria

### Verification Commands

```bash
pnpm build                          # Expected: 0 errors
pnpm test -- --run                  # Expected: all pass (minus 2 known pre-existing failures)
grep -r "ngrok" src/               # Expected: 0 matches
grep -r "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/ # Expected: 0 matches (except comments)
grep -r "chmod.*0o444" src/        # Expected: 0 matches
grep -r "fix-loop" src/            # Expected: 0 matches
pnpm trigger-task                  # Expected: status=Done, PR created
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (minus known pre-existing)
- [ ] E2E trigger-task completes end-to-end in local Docker mode
- [ ] E2E trigger-task completes end-to-end in hybrid Fly.io mode
