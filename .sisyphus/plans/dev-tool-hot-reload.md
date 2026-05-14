# Dev Tool Hot-Reload — Bind-Mount Worker Tools for Instant Iteration

## TL;DR

> **Quick Summary**: Eliminate Docker image rebuilds when iterating on worker tools by bind-mounting `src/worker-tools/` into local Docker containers at runtime. Tool files are raw TypeScript executed by `tsx` — no compilation needed.
>
> **Deliverables**:
>
> - Dockerfile modified to install tool deps at `/tool-deps/` (not `/tools/`)
> - `runLocalDockerContainer()` adds `-v` mount for `src/worker-tools/` → `/tools/`
> - `dev.ts` watcher updated — no longer warns to rebuild for tool changes
> - AGENTS.md + shell tool guide updated
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (Dockerfile) + T2 (lifecycle) → T5 (E2E verify)

---

## Context

### Original Request

User's development workflow for tool iteration is: `edit tool → docker build (~60-120s) → trigger task`. This happens "extremely frequently." Goal is near-real-time: `edit tool → trigger task`.

### Interview Summary

**Key Discussions**:

- Tools are raw `.ts` files run by `tsx` — zero compilation needed
- User wants full directory mount (`src/worker-tools/` → `/tools/`), not individual file mounts
- Auto-enable in dev mode (`WORKER_RUNTIME=docker`), no opt-in flag
- Fly.io production path is unaffected

**Research Findings**:

- `runLocalDockerContainer()` in `employee-lifecycle.ts:79-103` builds docker command with zero `-v` flags
- Only `@slack/web-api` is installed as a local dep in `/tools/slack/node_modules/` (Dockerfile line 86)
- All unit tests use `.toContain()` for docker command assertions — adding `-v` flags won't break them
- `dev.ts` lines 600-611 watch `src/worker-tools/` and warn to rebuild — needs updating

### Metis Review

**Identified Gaps** (addressed):

- **Path resolution**: Must use `import.meta.url` or `__dirname`, NOT `process.cwd()` — gateway may start from different directories
- **`existsSync` guard**: Must check path exists before adding volume mount — otherwise Docker creates empty `/tools/` and wipes all baked tools
- **`NODE_PATH` strategy**: Must be explicit — `@slack/web-api` won't resolve via normal module resolution from `/tools/slack/` when deps are at `/tool-deps/`
- **Two call sites**: `runLocalDockerContainer()` is called for both execution (line 481) and delivery (line 1686) — changing the function itself covers both automatically

---

## Work Objectives

### Core Objective

Enable instant tool iteration by bind-mounting the host `src/worker-tools/` directory into local Docker containers, eliminating the rebuild step.

### Concrete Deliverables

- Modified `Dockerfile` — tool deps installed at `/tool-deps/slack/` instead of `/tools/slack/`
- Modified `src/inngest/employee-lifecycle.ts` — volume mount flag in `runLocalDockerContainer()`
- Modified `scripts/dev.ts` — watcher message conditional on runtime mode
- Updated `AGENTS.md` — nuanced rebuild guidance
- Updated `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` — local dev section

### Definition of Done

- [ ] `edit tool → trigger task` works without `docker build` (verified via E2E)
- [ ] `@slack/web-api` imports resolve correctly in bind-mounted containers
- [ ] All existing unit tests pass (`pnpm test -- --run`)
- [ ] Fly.io dispatch path is completely unaffected

### Must Have

- Single `-v` mount for entire `src/worker-tools/` directory — no per-file mounts
- Automatic activation when `WORKER_RUNTIME=docker` (or unset)
- `existsSync` guard on the mount path — fail gracefully, don't wipe container tools
- Path derived from `import.meta.url` or `__dirname`, NOT `process.cwd()`

### Must NOT Have (Guardrails)

- No hot-reload for `src/workers/` (harness) — that requires compilation, stays as rebuild
- No opt-in flag (`HOT_RELOAD_TOOLS`, etc.) — always on in Docker mode
- No changes to `pnpm setup` — still builds the Docker image on first run
- No generalized dependency management — only `@slack/web-api` needs relocation
- No changes to the `src/workers/` watcher (line 610) — that rebuild warning stays correct
- No mounting over `/app/` or any path other than `/tools/`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — changes are infra-level, verified by E2E
- **Framework**: vitest (existing tests must still pass)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Dockerfile**: Bash — `docker build` + `docker run` to verify dep path
- **Lifecycle**: Bash — trigger task, inspect docker command in logs
- **E2E**: Bash — edit tool, trigger without rebuild, verify change is live in container

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all touch different files):
├── Task 1: Dockerfile — relocate tool deps to /tool-deps/ [quick]
├── Task 2: employee-lifecycle.ts — add volume mount [quick]
├── Task 3: dev.ts — update watcher message [quick]
└── Task 4: Update AGENTS.md + shell tool guide [quick]

Wave 2 (After Wave 1 — integration verification):
└── Task 5: Rebuild image + E2E verification [deep]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 5      | 1    |
| 2    | —          | 5      | 1    |
| 3    | —          | 5      | 1    |
| 4    | —          | 5      | 1    |
| 5    | 1,2,3,4    | F1-F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: 1 task — T5 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Dockerfile — Relocate tool deps to `/tool-deps/`

  **What to do**:
  - In `Dockerfile` line 86, change `npm install --prefix /tools/slack @slack/web-api@^7.15.1` to `npm install --prefix /tool-deps/slack @slack/web-api@^7.15.1`
  - Add `RUN mkdir -p /tool-deps/slack` before the npm install
  - Add `ENV NODE_PATH=/tool-deps/slack/node_modules` after the npm install so `tsx` can resolve `@slack/web-api` from any tool path
  - Keep all existing `COPY --from=builder` lines for `/tools/` unchanged — the image still needs baked-in tools for Fly.io (non-mount) mode

  **Must NOT do**:
  - Do not remove any existing tool COPY lines from the Dockerfile
  - Do not install deps globally — keep them isolated at `/tool-deps/slack/`
  - Do not touch any non-Slack tool deps (there are none)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 3-line change, well-scoped
  - **Skills**: []
    - No special skills needed — straightforward Dockerfile edit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `Dockerfile:82-86` — Current slack tool setup with `npm install --prefix /tools/slack`. Change prefix to `/tool-deps/slack/`
  - `Dockerfile:100-112` — Other tool directories (platform, knowledge_base, locks) — NO changes needed here, they have no local deps

  **WHY Each Reference Matters**:
  - Line 86 is the exact line to modify — the only `npm install --prefix` in the Dockerfile
  - Lines 100-112 confirm no other tool directories install local deps — no further relocation needed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds successfully with relocated deps
    Tool: Bash
    Preconditions: Docker daemon running
    Steps:
      1. Run `docker build -t ai-employee-worker:latest .`
      2. Assert exit code 0
      3. Run `docker run --rm ai-employee-worker:latest ls /tool-deps/slack/node_modules/@slack/web-api/`
      4. Assert output contains `package.json` (deps installed at new path)
      5. Run `docker run --rm ai-employee-worker:latest ls /tools/slack/`
      6. Assert output contains `post-message.ts` (original tool files still baked in)
    Expected Result: Image builds, deps at `/tool-deps/slack/`, tools still at `/tools/slack/`
    Failure Indicators: Build failure, empty `/tool-deps/slack/`, or missing files in `/tools/slack/`
    Evidence: .sisyphus/evidence/task-1-dockerfile-deps.txt

  Scenario: NODE_PATH resolves @slack/web-api from /tools/slack/ context
    Tool: Bash
    Preconditions: Image built from previous scenario
    Steps:
      1. Run `docker run --rm ai-employee-worker:latest node -e "require.resolve('@slack/web-api')"`
      2. Assert exit code 0 and output contains `/tool-deps/slack/node_modules`
    Expected Result: Node resolves the module via NODE_PATH
    Failure Indicators: MODULE_NOT_FOUND error
    Evidence: .sisyphus/evidence/task-1-node-path-resolve.txt
  ```

  **Commit**: YES
  - Message: `chore(docker): relocate tool deps to /tool-deps/ for bind-mount support`
  - Files: `Dockerfile`

- [x] 2. employee-lifecycle.ts — Add volume mount to `runLocalDockerContainer()`

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, modify `runLocalDockerContainer()` (lines 79-103) to add a `-v` volume mount flag mapping the host's `src/worker-tools/` to `/tools/` inside the container
  - Derive the host path from `import.meta.url` (or `fileURLToPath` + `dirname` + `resolve`) — NOT `process.cwd()`. The lifecycle file is at `src/inngest/employee-lifecycle.ts`, so the worker-tools directory is at `../../src/worker-tools` relative to the compiled output, or resolve from the project root
  - Add an `existsSync(workerToolsPath)` guard — if the path doesn't exist, log a warning and proceed WITHOUT the mount (do not crash, do not create empty `/tools/`)
  - The mount flag should be: `-v "${workerToolsPath}:/tools"` inserted into the `dockerCmd` string at line 90, after the `--add-host` flag and before `${envArgs}`
  - Add `NODE_PATH` to the env args: include `NODE_PATH: '/tool-deps/slack/node_modules'` in `opts.env` at the call site (line ~487), or directly in the function
  - Import `existsSync` from `node:fs` and path utilities from `node:path` and `node:url` at the top of the file

  **Must NOT do**:
  - Do not use `process.cwd()` for path resolution — the gateway may start from any directory
  - Do not add the mount when `WORKER_RUNTIME=fly` — but this is already guaranteed since `runLocalDockerContainer()` is only called in the `!== 'fly'` branch
  - Do not mount over `/app/` or any path other than `/tools/`
  - Do not add an opt-in flag — always mount when this function is called
  - Do not modify any other function besides `runLocalDockerContainer()` and its call sites for env injection

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, surgical change to one function + one env var addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:79-103` — `runLocalDockerContainer()` function. Line 90 is the `dockerCmd` string where the `-v` flag must be inserted
  - `src/inngest/employee-lifecycle.ts:87-89` — How `envArgs` are built from `opts.env` — shows the string interpolation pattern to follow for the `-v` flag
  - `src/inngest/employee-lifecycle.ts:480-502` — The execution dispatch call site where `runLocalDockerContainer()` is invoked with `env` object. This is where `NODE_PATH` should be added to the env map

  **API/Type References**:
  - `node:url` — `fileURLToPath(import.meta.url)` for converting the module URL to a filesystem path
  - `node:path` — `dirname()`, `resolve()` for navigating from the lifecycle file to `src/worker-tools/`
  - `node:fs` — `existsSync()` for the guard check

  **Test References**:
  - `tests/inngest/lifecycle-worker-runtime.test.ts:243-256` — Test 1 checks docker command ordering using `.toContain()`. Adding `-v` flag will NOT break this test. The agent should run the test after implementation to confirm.

  **WHY Each Reference Matters**:
  - Line 90 is the exact insertion point for the `-v` flag in the docker command string
  - Lines 87-89 show the pattern for building the command string (string interpolation with template literals)
  - Lines 480-502 show where `NODE_PATH` should be injected into the env map
  - The test file confirms all assertions use `.toContain()`, not full string equality — safe to modify the command

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Volume mount flag appears in docker run command
    Tool: Bash
    Preconditions: Gateway running (`pnpm dev`), WORKER_RUNTIME=docker (default)
    Steps:
      1. Trigger a task: `curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'`
      2. Check gateway logs: `grep "docker run" /tmp/ai-dev.log | tail -1`
      3. Assert the log line contains `-v` and `worker-tools:/tools`
    Expected Result: Docker run command includes the volume mount flag
    Failure Indicators: No `-v` flag in the command, or path doesn't contain `worker-tools`
    Evidence: .sisyphus/evidence/task-2-volume-mount-cmd.txt

  Scenario: Missing worker-tools directory doesn't crash
    Tool: Bash
    Preconditions: None
    Steps:
      1. In the source code, verify the `existsSync` guard is present
      2. Search for the guard: `grep -n "existsSync" src/inngest/employee-lifecycle.ts`
      3. Assert it appears in or near the `runLocalDockerContainer` function
    Expected Result: Guard exists — container launches without mount if path is missing
    Failure Indicators: No `existsSync` call found near the docker command
    Evidence: .sisyphus/evidence/task-2-exists-guard.txt

  Scenario: Unit tests still pass
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `pnpm test -- --run tests/inngest/lifecycle-worker-runtime.test.ts`
      2. Assert all 7 tests pass
    Expected Result: 7 tests pass, 0 failures
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-2-unit-tests.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(dx): bind-mount worker-tools in local Docker containers`
  - Files: `src/inngest/employee-lifecycle.ts`, `scripts/dev.ts`

- [x] 3. dev.ts — Update watcher message for worker-tools changes

  **What to do**:
  - In `scripts/dev.ts`, modify the `watchWorkerDirs` watcher section (lines 600-611) to differentiate between `src/workers/` and `src/worker-tools/` changes
  - For `src/workers/` changes (line 610): keep the existing rebuild warning — `warn('Worker files changed — run docker build ...')`
  - For `src/worker-tools/` changes (line 611): change the message to inform the user that changes are live — something like `info('Worker tools changed — changes will be live in the next task run (no rebuild needed)')`
  - The simplest approach: instead of using the shared `watchWorkerDirs` function for both, call it for `src/workers/` with the existing warn message, and add a separate watcher for `src/worker-tools/` with an info message. Or parameterize `watchWorkerDirs` to accept a message/callback.

  **Must NOT do**:
  - Do not change the `src/workers/` watcher behavior — that rebuild warning is still correct
  - Do not add auto-rebuild logic — just update the message
  - Do not condition on `WORKER_RUNTIME` — when `dev.ts` runs, it's always local dev mode

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, ~5 lines of change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/dev.ts:600-611` — Current watcher implementation. The `watchWorkerDirs` function uses `warn()` for both `src/workers/` and `src/worker-tools/`. Split the behavior.
  - `scripts/dev.ts:606` — The warn message string to change for `src/worker-tools/`

  **WHY Each Reference Matters**:
  - Lines 600-611 are the exact code to modify — the watcher function and its two invocations
  - Line 606 is the message that becomes incorrect after this feature — tools no longer need rebuilds

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Worker-tools change shows "live" message, not rebuild warning
    Tool: Bash
    Preconditions: `pnpm dev` is running
    Steps:
      1. Touch a file: `touch src/worker-tools/platform/report-issue.ts`
      2. Wait 1 second, then check dev log: `tail -5 /tmp/ai-dev.log`
      3. Assert output contains "no rebuild" or "live" (not "docker build")
    Expected Result: Info message about changes being live, not a rebuild warning
    Failure Indicators: Message still says "run docker build"
    Evidence: .sisyphus/evidence/task-3-watcher-message.txt

  Scenario: Workers change still shows rebuild warning
    Tool: Bash
    Preconditions: `pnpm dev` is running
    Steps:
      1. Touch a file: `touch src/workers/opencode-harness.mts`
      2. Wait 1 second, then check dev log: `tail -5 /tmp/ai-dev.log`
      3. Assert output contains "docker build" (rebuild warning)
    Expected Result: Rebuild warning preserved for src/workers/
    Failure Indicators: Message says "live" or "no rebuild" for workers changes
    Evidence: .sisyphus/evidence/task-3-workers-warning.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(dx): bind-mount worker-tools in local Docker containers`
  - Files: `scripts/dev.ts`

- [x] 4. Documentation — Update AGENTS.md + shell tool guide

  **What to do**:
  - In `AGENTS.md`, find the section that says **"CRITICAL — Rebuild after every worker change"** and update it to distinguish between `src/workers/` (still requires rebuild) and `src/worker-tools/` (no rebuild needed in Docker mode — changes are live via bind mount)
  - In `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`, find the section about Docker integration and add a note about local dev: new tool files are automatically available in the next container launch without rebuilding (the bind mount covers the entire `src/worker-tools/` directory). The Dockerfile COPY still needs updating for Fly.io production.
  - Keep the guidance concise — 2-3 sentences per update, not paragraphs

  **Must NOT do**:
  - Do not rewrite entire sections — surgical updates only
  - Do not update any other documentation files
  - Do not remove the rebuild guidance for `src/workers/` — that remains true

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two files, ~5 lines each, clear scope
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Search for "Rebuild after every worker change" — this is the section to update
  - `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` — Find the Docker/Dockerfile section

  **WHY Each Reference Matters**:
  - AGENTS.md is loaded into every LLM call — if it says "always rebuild," agents will tell users to rebuild unnecessarily
  - The shell tool guide is the reference for adding new tools — it needs to mention that local dev doesn't require rebuilds

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md distinguishes workers from worker-tools rebuild requirements
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -A5 "Rebuild" AGENTS.md`
      2. Assert output mentions both `src/workers/` (needs rebuild) and `src/worker-tools/` (no rebuild in Docker mode)
    Expected Result: Clear distinction between the two directories
    Failure Indicators: Still says "rebuild after every worker change" without distinction
    Evidence: .sisyphus/evidence/task-4-agents-md.txt

  Scenario: Shell tool guide mentions bind-mount for local dev
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -i "bind-mount\|no rebuild\|live" docs/guides/2026-05-04-1645-adding-a-shell-tool.md`
      2. Assert at least one match found
    Expected Result: Guide mentions the local dev workflow doesn't require rebuilds
    Failure Indicators: No mention of bind-mount or hot-reload in the guide
    Evidence: .sisyphus/evidence/task-4-shell-tool-guide.txt
  ```

  **Commit**: YES
  - Message: `docs: update rebuild guidance for tool hot-reload`
  - Files: `AGENTS.md`, `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`

- [x] 5. Rebuild + E2E Verification — Confirm hot-reload works end-to-end

  **What to do**:
  - Rebuild the Docker image: `docker build -t ai-employee-worker:latest .` (needed once to apply the Dockerfile changes from Task 1)
  - Start the dev environment: `pnpm dev` (or verify it's already running)
  - **Test 1 — Live tool change**: Add a distinctive marker to `src/worker-tools/platform/report-issue.ts` (e.g., `console.error('HOT_RELOAD_TEST_MARKER_' + Date.now())`), trigger a task WITHOUT rebuilding, and verify the marker appears in the container logs
  - **Test 2 — Slack dep resolution**: Trigger a summarizer task and verify it reaches at least `Reviewing` state (proves `@slack/web-api` resolved correctly via `NODE_PATH`)
  - **Test 3 — Full test suite**: Run `pnpm test -- --run` and verify all tests pass
  - **Test 4 — Revert marker**: Remove the test marker added to `report-issue.ts`
  - Document all results with task IDs and log excerpts

  **Must NOT do**:
  - Do not rebuild the image between the tool edit and the task trigger — that defeats the purpose
  - Do not skip the Slack dep test — `MODULE_NOT_FOUND` is the most likely failure mode
  - Do not leave test markers in the codebase

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-step verification requiring services running, task triggering, log inspection, and patience for async results
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - `src/worker-tools/platform/report-issue.ts` — Safe tool file to add a test marker to (simple, rarely called, low risk)
  - AGENTS.md "Testing Employees Locally" section — admin API trigger commands for summarizer

  **External References**:
  - Admin API trigger for summarizer: `POST /admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger`
  - Task status check: `GET /admin/tenants/00000000-0000-0000-0000-000000000002/tasks/{id}`

  **WHY Each Reference Matters**:
  - `report-issue.ts` is the safest tool to modify for testing — it's rarely invoked by employees and a `console.error` marker is harmless
  - The admin API endpoints are needed to trigger tasks and check status for the E2E verification

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tool change is live without rebuild (happy path)
    Tool: Bash
    Preconditions: Docker image rebuilt with Task 1 changes, services running via `pnpm dev`
    Steps:
      1. Add marker: `echo "console.error('HOT_RELOAD_E2E_MARKER_42');" >> src/worker-tools/platform/report-issue.ts`
      2. DO NOT rebuild the Docker image
      3. Trigger a task: `curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id'`
      4. Wait for container to start (10s), then check: `docker ps --filter "name=employee-" --format '{{.Names}}'`
      5. Check container logs: `docker logs $(docker ps --filter "name=employee-" -q --latest) 2>&1 | grep "HOT_RELOAD_E2E_MARKER_42"`
      6. Assert the marker line is found
    Expected Result: Marker appears in container logs — proves bind mount is working
    Failure Indicators: Marker not found (bind mount not active), or container failed to start
    Evidence: .sisyphus/evidence/task-5-hot-reload-e2e.txt

  Scenario: Slack deps resolve correctly (critical regression check)
    Tool: Bash
    Preconditions: Same task triggered above (summarizer uses @slack/web-api)
    Steps:
      1. Use the task ID from the previous scenario
      2. Poll status every 10s for up to 3 min: `curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/tasks/$TASK_ID" | jq -r '.status'`
      3. Assert final status is NOT `Failed`
      4. Check container logs for MODULE_NOT_FOUND: `docker logs $(docker ps -a --filter "name=employee-" -q --latest) 2>&1 | grep -i "MODULE_NOT_FOUND" || echo "NO_MODULE_ERRORS"`
      5. Assert "NO_MODULE_ERRORS" appears (no resolution failures)
    Expected Result: Task reaches Reviewing/Submitting (not Failed), no MODULE_NOT_FOUND errors
    Failure Indicators: Status = Failed, or MODULE_NOT_FOUND in logs
    Evidence: .sisyphus/evidence/task-5-slack-deps-resolve.txt

  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: All code changes applied
    Steps:
      1. Run `pnpm test -- --run 2>&1 | tail -20`
      2. Assert output contains "Tests" and shows 0 failures
    Expected Result: Full test suite passes
    Failure Indicators: Any test failure in lifecycle tests
    Evidence: .sisyphus/evidence/task-5-unit-tests.txt
  ```

  **Commit**: NO (verification only — revert any test markers)

- [x] 6. Notify completion

  Send Telegram notification: plan `dev-tool-hot-reload` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ dev-tool-hot-reload complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute the E2E scenario from Task 5: edit a tool file, trigger task without rebuild, verify the change is live in the container. Also test the negative case: edit `src/workers/opencode-harness.mts` and verify the watcher STILL warns about rebuilding. Capture evidence screenshots/logs.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                            | Files                                                             |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | `chore(docker): relocate tool deps to /tool-deps/ for bind-mount support` | `Dockerfile`                                                      |
| 2-3  | `feat(dx): bind-mount worker-tools in local Docker containers`            | `src/inngest/employee-lifecycle.ts`, `scripts/dev.ts`             |
| 4    | `docs: update rebuild guidance for tool hot-reload`                       | `AGENTS.md`, `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` |

---

## Success Criteria

### Verification Commands

```bash
# 1. Unit tests pass
pnpm test -- --run  # Expected: all tests pass

# 2. Docker image builds with new dep path
docker build -t ai-employee-worker:latest .  # Expected: success

# 3. Tool change is live without rebuild
echo "console.error('HOT_RELOAD_WORKS_' + Date.now())" >> src/worker-tools/platform/report-issue.ts
# Trigger task (without rebuild)
# Check container logs for HOT_RELOAD_WORKS_ marker
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Fly.io path unaffected
