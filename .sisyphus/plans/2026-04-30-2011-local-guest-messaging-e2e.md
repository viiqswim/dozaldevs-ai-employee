# Local Guest Messaging E2E — Single-Command Setup

## TL;DR

> **Quick Summary**: Add local Docker execution to the active employee lifecycle and create a single-command script (`pnpm dev:e2e`) that starts all services, builds the worker image, runs pre-flight checks, triggers a guest messaging task, and tails logs — all with output in `/tmp/`.
>
> **Deliverables**:
>
> - `USE_LOCAL_DOCKER` branch in `employee-lifecycle.ts` (execution + reply-anyway + delivery)
> - `scripts/dev-e2e.ts` — single-command startup with pre-flight checks + trigger + log tailing
> - `pnpm dev:e2e` alias in `package.json`
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (lifecycle change) → Task 3 (startup script) → Task 5 (E2E verification)

---

## Context

### Original Request

Run everything locally for the VLRE guest messaging AI employee, testing end-to-end before cloud deployment. Single command, simple as possible, logs to `/tmp/`.

### Interview Summary

**Key Discussions**:

- Active `employee-lifecycle.ts` has no local Docker path — always dispatches to Fly.io
- User chose to add `USE_LOCAL_DOCKER` support (port pattern from deprecated `lifecycle.ts`)
- Delivery machine should also run locally as a second Docker container (full production fidelity)
- Pre-flight checks should detect + block with clear instructions (no interactive prompts)
- Docker image always rebuilds on startup (Docker layer caching keeps no-change builds fast)
- No automated tests — manual E2E verification only

**Research Findings**:

- `dev-start.ts` already sets `USE_LOCAL_DOCKER=1` in the gateway env (line 329) but the lifecycle doesn't read it
- 3 `createMachine` call sites: line 259 (execution), line 473 (reply-anyway), line 821 (delivery)
- Deprecated `lifecycle.ts` has the Docker pattern at lines 295-326: `docker run -d --rm --network host`
- `--network host` is broken on macOS — must use `host.docker.internal` instead
- Guest messaging archetype ID: `00000000-0000-0000-0000-000000000015`, slug needs verification
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- Required per-tenant secrets: `hostfully_api_key`, `hostfully_agency_uid`, `slack_bot_token`

### Metis Review

**Identified Gaps** (addressed):

- `--network host` macOS incompatibility → Use `host.docker.internal` + `--add-host=host.docker.internal:host-gateway`
- `FLY_API_TOKEN` throws before branching → Branch `USE_LOCAL_DOCKER` before `createMachine()` call
- `tenantEnv` spreads wrong `SUPABASE_URL` → Override after spread with `host.docker.internal` variant
- No delivery machine local Docker precedent → Second container with `EMPLOYEE_PHASE=delivery`
- `dev-start.ts` already sets `USE_LOCAL_DOCKER=1` → Leverage existing behavior, don't duplicate

---

## Work Objectives

### Core Objective

Enable fully local E2E testing of the VLRE guest messaging employee with a single command, no Fly.io credentials required.

### Concrete Deliverables

- Modified `src/inngest/employee-lifecycle.ts` with `USE_LOCAL_DOCKER` branches at all 3 machine creation sites
- New `scripts/dev-e2e.ts` — single-command orchestrator
- New `pnpm dev:e2e` alias in `package.json`

### Definition of Done

- [ ] `pnpm dev:e2e` starts all services, builds Docker image, runs pre-flight checks, and triggers a guest messaging task
- [ ] Worker container runs locally via `docker run` (no Fly.io)
- [ ] Delivery container runs locally on approval (no Fly.io)
- [ ] Logs visible at `/tmp/guest-worker-*.log`
- [ ] Task reaches `Reviewing` state with Slack approval card

### Must Have

- Local Docker execution for all 3 `createMachine` call sites (execution, reply-anyway, delivery)
- Pre-flight checks for: VLRE Slack OAuth token, Hostfully secrets, ENCRYPTION_KEY, SLACK_APP_TOKEN
- Docker image build on every startup
- Container logs piped to `/tmp/`
- Manual trigger via Admin API (no waiting for 5-min cron)

### Must NOT Have (Guardrails)

- MUST NOT modify `scripts/dev-start.ts` — it's shared infrastructure for all employees
- MUST NOT change the Fly.io production path — `USE_LOCAL_DOCKER` is additive branching only
- MUST NOT use `--network host` — macOS incompatible; use `host.docker.internal`
- MUST NOT touch deprecated files (`lifecycle.ts`, `redispatch.ts`)
- MUST NOT add `FLY_API_TOKEN` to required vars — local Docker mode doesn't need it
- MUST NOT use `execSync` with blocking docker run — use `-d` flag (detached)
- MUST NOT add interactive prompts to any script — detect and block with clear instructions
- MUST NOT use `as any` or `@ts-ignore` in new code

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None — this is dev tooling, manual E2E verification only
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Lifecycle change**: Use Bash — trigger task via Admin API, verify Docker container appears in `docker ps`, check logs
- **Script**: Use Bash — run `pnpm dev:e2e`, verify all services start, check log files exist
- **E2E**: Use Bash — full flow verification from trigger to Reviewing state

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — lifecycle change + script skeleton):
├── Task 1: Add USE_LOCAL_DOCKER to employee-lifecycle.ts (all 3 sites) [deep]
├── Task 2: Add pnpm dev:e2e alias to package.json [quick]

Wave 2 (After Wave 1 — script that uses the lifecycle change):
├── Task 3: Create scripts/dev-e2e.ts — full startup + pre-flight + trigger + logs [unspecified-high]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 3      | 1    |
| 2    | —          | 3      | 1    |
| 3    | 1, 2       | F1-F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: **2 agents** — T1 → `deep`, T2 → `quick`
- **Wave 2**: **1 agent** — T3 → `unspecified-high`
- **FINAL**: **4 agents** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `USE_LOCAL_DOCKER` branch to `employee-lifecycle.ts`

  **What to do**:
  - Add a `USE_LOCAL_DOCKER` check at **three** `createMachine` call sites in `employee-lifecycle.ts`:
    1. **Primary execution** (line 259): Before the `createMachine(flyApp, {...})` call, check `process.env.USE_LOCAL_DOCKER === '1'`. If true, run `docker run -d --rm` locally instead.
    2. **Reply-anyway execution** (line 473): Same pattern — branch before `createMachine`.
    3. **Delivery execution** (line 821): Same pattern — branch before `createMachine`. Include `EMPLOYEE_PHASE: 'delivery'` in env.
  - At each site, the local Docker branch must:
    1. Build env args from `tenantEnv` spread + task-specific vars (same env as the Fly.io path)
    2. **Override `SUPABASE_URL`** to `http://host.docker.internal:54321` (macOS compat — `--network host` doesn't work)
    3. **Override `INNGEST_BASE_URL`** to `http://host.docker.internal:8288`
    4. Run `execSync('docker run -d --rm --add-host=host.docker.internal:host-gateway --name "employee-${taskId.slice(0, 8)}" ${envArgs} ai-employee-worker:latest node /app/dist/workers/opencode-harness.mjs')`
    5. Return a synthetic machine ID: `{ id: 'docker_' + containerId.slice(0, 12) }`
    6. After container start, spawn a detached process to tail logs: `execSync('docker logs -f ${containerId} > /tmp/employee-${taskId.slice(0, 8)}.log 2>&1 &')`
  - Add `import { execSync } from 'node:child_process';` at the top of the file
  - **CRITICAL**: The `USE_LOCAL_DOCKER` branch must be placed **before** the `createMachine` call, not after — because `createMachine` internally calls `getFlyApiToken()` which **throws** if `FLY_API_TOKEN` is unset. The entire purpose of local Docker mode is to not need Fly.io credentials.
  - **CRITICAL**: Do NOT use `--network host` — it doesn't work on macOS Docker Desktop (containers run in a Linux VM). Use `host.docker.internal` for service URLs + `--add-host=host.docker.internal:host-gateway` for Linux compat.
  - The existing polling logic (`poll-completion`, `reply-anyway-poll`, delivery poll loop) remains unchanged — it polls task status via PostgREST from the gateway process, which runs on the host. The container writes status updates to PostgREST via `host.docker.internal:54321`.
  - Extract a shared helper function `runLocalDockerContainer(opts: { taskId, env, name, cmd? })` to avoid duplicating the docker run logic at all 3 sites.

  **Must NOT do**:
  - MUST NOT modify the Fly.io code path — the `createMachine` call and everything after it must remain byte-for-byte identical
  - MUST NOT use `--network host`
  - MUST NOT add `FLY_API_TOKEN` to any required env check
  - MUST NOT touch the deprecated `lifecycle.ts`
  - MUST NOT use `as any` or `@ts-ignore`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying a critical lifecycle file with 3 insertion points, requires understanding the full execution flow and macOS networking nuances
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — single file change, no complex git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/inngest/lifecycle.ts:295-326` — Deprecated local Docker pattern: `docker run -d --rm --network host` with `execSync`. Copy the env-args-building approach but fix networking (use `host.docker.internal` instead of `--network host`)
  - `src/inngest/employee-lifecycle.ts:259-278` — Primary `createMachine` call site. The `USE_LOCAL_DOCKER` branch goes **before** line 259
  - `src/inngest/employee-lifecycle.ts:457-491` — Reply-anyway `createMachine` call site. Branch goes **before** line 473
  - `src/inngest/employee-lifecycle.ts:820-834` — Delivery `createMachine` call site (inside a retry loop). Branch goes **before** line 821
  - `src/inngest/employee-lifecycle.ts:266-274` — The env object spread pattern: `...tenantEnv, TASK_ID, TENANT_ID, SUPABASE_URL, ...`. Reuse this exact env set but override `SUPABASE_URL` and add `INNGEST_BASE_URL`

  **API/Type References** (contracts to implement against):
  - `src/lib/fly-client.ts:createMachine` — Returns `{ id: string }`. The local Docker branch must return the same shape
  - `src/gateway/services/tenant-env-loader.ts:loadTenantEnv` — Returns `Record<string, string>`. This is already called before each `createMachine` — reuse the result

  **External References**:
  - Docker `host.docker.internal`: https://docs.docker.com/desktop/networking/#i-want-to-connect-from-a-container-to-a-service-on-the-host
  - `--add-host=host.docker.internal:host-gateway` for Linux: https://docs.docker.com/engine/reference/commandline/run/#add-host

  **WHY Each Reference Matters**:
  - `lifecycle.ts:295-326`: Shows the exact `execSync` + env-args pattern to follow, but with wrong networking that must be fixed
  - `employee-lifecycle.ts:259-278`: The insertion point — you need to understand what variables are in scope (`flyApp`, `image`, `vmSize`, `cmd`, `tenantEnv`, `taskId`, etc.)
  - `employee-lifecycle.ts:820-834`: The delivery site is inside a `for` loop (retry logic) — the local Docker branch must also be inside that loop
  - `fly-client.ts:createMachine`: The return type contract — your Docker branch must match it so downstream code works

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Primary execution runs locally via Docker
    Tool: Bash
    Preconditions: Services running via `pnpm dev:start`, Docker image `ai-employee-worker:latest` built, VLRE tenant secrets configured
    Steps:
      1. Trigger task: `curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger" -d '{}'`
      2. Wait 30s: `sleep 30`
      3. Check for local Docker container: `docker ps -a --filter "name=employee-" --format "{{.Names}} {{.Status}}"`
      4. Assert: output contains a container name starting with `employee-`
      5. Check log file exists: `ls /tmp/employee-*.log`
      6. Assert: at least one log file exists with non-zero size
    Expected Result: Docker container started locally, log file created in /tmp/
    Failure Indicators: No container with `employee-` prefix in `docker ps -a`; no log file in /tmp/; container exited immediately with error
    Evidence: .sisyphus/evidence/task-1-local-docker-execution.txt

  Scenario: Fly.io path still works when USE_LOCAL_DOCKER is unset
    Tool: Bash
    Preconditions: Gateway running WITHOUT `USE_LOCAL_DOCKER=1` in env, `FLY_API_TOKEN` set
    Steps:
      1. Verify `USE_LOCAL_DOCKER` is not set: `echo $USE_LOCAL_DOCKER` → empty
      2. Grep the lifecycle code for the branch: `grep -n 'USE_LOCAL_DOCKER' src/inngest/employee-lifecycle.ts`
      3. Assert: branch exists but is guarded by env check — production path is untouched
    Expected Result: Code review confirms the Fly.io path is byte-for-byte identical (only additive branching)
    Failure Indicators: Any modification to the existing `createMachine` call or its surrounding code
    Evidence: .sisyphus/evidence/task-1-flyio-path-preserved.txt
  ```

  **Evidence to Capture:**
  - [ ] `task-1-local-docker-execution.txt` — docker ps output + log file listing
  - [ ] `task-1-flyio-path-preserved.txt` — grep output showing additive-only changes

  **Commit**: YES
  - Message: `feat(lifecycle): add USE_LOCAL_DOCKER support for local worker execution`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm lint`

- [x] 2. Add `pnpm dev:e2e` alias to `package.json`

  **What to do**:
  - Add a new script entry to `package.json` scripts: `"dev:e2e": "tsx scripts/dev-e2e.ts"`
  - This is a placeholder — the actual script is created in Task 3

  **Must NOT do**:
  - MUST NOT modify any other scripts
  - MUST NOT remove existing scripts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line JSON edit
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `package.json:20` — Existing `"dev:start": "tsx scripts/dev-start.ts"` pattern to follow

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: pnpm dev:e2e alias exists
    Tool: Bash
    Preconditions: package.json has been edited
    Steps:
      1. Check script exists: `node -e "const p = require('./package.json'); console.log(p.scripts['dev:e2e'])"`
      2. Assert output: `tsx scripts/dev-e2e.ts`
    Expected Result: Script alias resolves to `tsx scripts/dev-e2e.ts`
    Failure Indicators: `undefined` output or missing key
    Evidence: .sisyphus/evidence/task-2-package-json-alias.txt
  ```

  **Commit**: NO (groups with Task 3)

- [x] 3. Create `scripts/dev-e2e.ts` — single-command E2E orchestrator

  **What to do**:
  Create a TypeScript script that orchestrates the full local E2E experience. The script does these phases in order:

  **Phase 1 — Pre-flight checks (fail fast):**
  - Check Docker daemon is running (`docker info`)
  - Check `.env` has required vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`, `INNGEST_EVENT_KEY`, `ADMIN_API_KEY`, `ENCRYPTION_KEY`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`
  - Check Docker image `ai-employee-worker:latest` will be built (informational message)
  - Check VLRE tenant secrets exist in DB by querying PostgREST:
    ```
    GET http://localhost:54321/rest/v1/tenant_secrets?tenant_id=eq.00000000-0000-0000-0000-000000000003&select=key
    ```
    Required keys: `slack_bot_token`, `hostfully_api_key`, `hostfully_agency_uid`
    If any missing, print the exact `curl` command to set each missing secret and exit with code 2
  - Check VLRE tenant integration exists (Slack OAuth completed):
    ```
    GET http://localhost:54321/rest/v1/tenant_integrations?tenant_id=eq.00000000-0000-0000-0000-000000000003&provider=eq.slack&select=id
    ```
    If missing, print the OAuth URL and exit with code 3

  **Phase 2 — Build Docker image:**
  - Run `docker build -t ai-employee-worker:latest .` with output streamed to terminal
  - This always runs (Docker layer caching makes no-change builds ~5-10s)

  **Phase 3 — Start services (reuse dev-start.ts logic):**
  - Do NOT import or call dev-start.ts. Instead, orchestrate the same steps inline:
    1. Start Docker Compose if not running: `docker compose -f docker/docker-compose.yml up -d`
    2. Wait for PostgREST health: `http://localhost:54321/rest/v1/` (up to 120s)
    3. Run migrations: `pnpm prisma migrate deploy`
    4. Start Inngest Dev Server: `npx inngest-cli@latest dev -u http://localhost:7700/api/inngest --port 8288` (spawn, pipe to `/tmp/inngest-dev.log`)
    5. Wait for Inngest health: `http://localhost:8288/` (up to 30s)
    6. Start Gateway with `USE_LOCAL_DOCKER=1`: `node --import tsx/esm src/gateway/server.ts` (spawn, pipe to `/tmp/gateway.log`)
    7. Wait for Gateway health: `http://localhost:7700/health` (up to 30s)
  - For each spawned process, register for cleanup on SIGINT/SIGTERM
  - Skip services that are already running (check health endpoints first)

  **Phase 4 — Trigger guest messaging task:**
  - Hit the Admin API: `POST http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger`
  - Print the task ID and status URL
  - Print the log file path: `Logs: /tmp/employee-<taskId-prefix>.log`
  - Print how to check status: `curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/<taskId>" | jq '.status'`
  - Print how to manually approve: the manual approval curl from AGENTS.md

  **Phase 5 — Summary banner:**

  ```
  ╔══════════════════════════════════════════════════╗
  ║      Local Guest Messaging E2E — Running        ║
  ╚══════════════════════════════════════════════════╝
    Services:
      Supabase:   http://localhost:54321
      Studio:     http://localhost:54323
      Inngest:    http://localhost:8288
      Gateway:    http://localhost:7700

    Task:
      ID:         <task-id>
      Status:     curl -s -H "X-Admin-Key: ..." ".../tasks/<id>" | jq '.status'
      Worker Log: /tmp/employee-<prefix>.log
      Gateway:    /tmp/gateway.log
      Inngest:    /tmp/inngest-dev.log

    Approval (when task reaches Reviewing):
      Check Slack #vlre-guest-messaging for approval card
      Or manual: curl -X POST "http://localhost:8288/e/local" ...

    Press Ctrl+C to stop all services.
  ```

  - Block until SIGINT (same pattern as `dev-start.ts` line 379)

  **Implementation notes:**
  - Use `zx` (`$` helper) for shell commands, same as `dev-start.ts`
  - Use `spawn` from `node:child_process` for long-running processes
  - Follow the color helpers pattern from `dev-start.ts` (lines 23-36)
  - Add `--reset` flag support (same as `dev-start.ts`) to wipe DB and re-seed
  - The script should support `--skip-build` flag to skip Docker image build (for faster iteration when only changing lifecycle/gateway code)
  - The script should support `--trigger-only` flag to skip service startup and just trigger + monitor (assumes services already running via `pnpm dev:start`)

  **Must NOT do**:
  - MUST NOT import or modify `scripts/dev-start.ts`
  - MUST NOT add interactive prompts
  - MUST NOT hardcode secrets/tokens
  - MUST NOT use `as any` or `@ts-ignore`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Medium-complexity script with multiple phases, process management, health checks, and error handling — but well-defined pattern to follow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1, Task 2

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `scripts/dev-start.ts:1-379` — **Primary pattern reference**. Follow the exact same structure: banner → prereq check → Docker Compose → Inngest → Gateway → summary. Copy the `waitForHttp()`, color helpers, cleanup handler, and spawn patterns verbatim.
  - `scripts/dev-start.ts:23-36` — Color helpers (`C.green`, `ok()`, `fail()`, `info()`)
  - `scripts/dev-start.ts:98-112` — `waitForHttp()` health check with retry
  - `scripts/dev-start.ts:68-93` — Process cleanup on SIGINT/SIGTERM
  - `scripts/dev-start.ts:147-165` — Env var validation pattern
  - `scripts/trigger-task.ts` — Task trigger + polling pattern (for Phase 4)

  **API/Type References**:
  - Admin API trigger: `POST /admin/tenants/:tenantId/employees/:slug/trigger` — returns `{ task_id, status_url }`
  - Admin API status: `GET /admin/tenants/:tenantId/tasks/:id` — returns task object with `status` field
  - PostgREST tenant_secrets query: `GET /rest/v1/tenant_secrets?tenant_id=eq.<id>&select=key` with `apikey` and `Authorization: Bearer <service-role-key>` headers

  **External References**:
  - `AGENTS.md` "Manual approval fallback" section — curl command for manual approval via Inngest event

  **WHY Each Reference Matters**:
  - `dev-start.ts` is the canonical pattern for everything (color, health checks, process mgmt) — copy structure, don't reinvent
  - `trigger-task.ts` shows how to call the Admin API and parse the response
  - AGENTS.md has the exact manual approval curl command to include in the summary banner

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Pre-flight detects missing Hostfully secrets
    Tool: Bash
    Preconditions: VLRE tenant exists but hostfully_api_key secret is NOT set
    Steps:
      1. Delete the secret if it exists: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "DELETE FROM tenant_secrets WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND key = 'hostfully_api_key'"`
      2. Run the script: `tsx scripts/dev-e2e.ts --trigger-only 2>&1` (will fail at pre-flight)
      3. Assert: exit code is 2 (missing DB secret)
      4. Assert: output contains the exact curl command to set the missing secret
      5. Re-add the secret (cleanup): use the Admin API curl from the output
    Expected Result: Script exits with code 2 and prints actionable fix instructions
    Failure Indicators: Script exits with code 0 or 1; no curl command in output; generic error message
    Evidence: .sisyphus/evidence/task-3-preflight-missing-secret.txt

  Scenario: Full startup with trigger
    Tool: Bash
    Preconditions: All services stopped, Docker image exists, all secrets configured
    Steps:
      1. Run: `tsx scripts/dev-e2e.ts 2>&1 | tee /tmp/dev-e2e-output.log &`
      2. Wait 180s for startup: `sleep 180`
      3. Check services: `curl -s http://localhost:7700/health` → 200
      4. Check Inngest: `curl -s http://localhost:8288/` → 200
      5. Check log files: `ls /tmp/gateway.log /tmp/inngest-dev.log`
      6. Check task was triggered: `grep -i "task.*id" /tmp/dev-e2e-output.log`
    Expected Result: All services running, task triggered, log files exist
    Failure Indicators: Any service health check fails; no task ID in output
    Evidence: .sisyphus/evidence/task-3-full-startup.txt

  Scenario: --trigger-only skips service startup
    Tool: Bash
    Preconditions: Services already running via `pnpm dev:start`
    Steps:
      1. Verify services running: `curl -s http://localhost:7700/health` → 200
      2. Run: `tsx scripts/dev-e2e.ts --trigger-only 2>&1`
      3. Assert: output does NOT contain "Starting Docker Compose" or "Starting Inngest"
      4. Assert: output contains a task ID
    Expected Result: Script skips service startup and goes straight to trigger
    Failure Indicators: Script tries to start services; no task triggered
    Evidence: .sisyphus/evidence/task-3-trigger-only.txt
  ```

  **Evidence to Capture:**
  - [ ] `task-3-preflight-missing-secret.txt` — script output showing detection + fix instructions
  - [ ] `task-3-full-startup.txt` — service health checks + task trigger output
  - [ ] `task-3-trigger-only.txt` — output confirming skip + trigger

  **Commit**: YES
  - Message: `feat(scripts): add dev:e2e single-command local E2E script`
  - Files: `scripts/dev-e2e.ts`, `package.json`
  - Pre-commit: `pnpm lint`

- [x] 4. Notify completion

  Send Telegram notification: plan `local-guest-messaging-e2e` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ local-guest-messaging-e2e complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `pnpm dev:e2e` and verify: services start, Docker image builds, pre-flight passes, task triggers, container starts, logs appear in `/tmp/`, task reaches Reviewing. Save evidence.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                    | Files                                | Pre-commit  |
| ------ | -------------------------------------------------------------------------- | ------------------------------------ | ----------- |
| 1      | `feat(lifecycle): add USE_LOCAL_DOCKER support for local worker execution` | `src/inngest/employee-lifecycle.ts`  | `pnpm lint` |
| 2      | `feat(scripts): add dev:e2e single-command local E2E script`               | `scripts/dev-e2e.ts`, `package.json` | `pnpm lint` |

---

## Success Criteria

### Verification Commands

```bash
# 1. Start everything
pnpm dev:e2e
# Expected: All services start, Docker image builds, pre-flight passes, task triggers

# 2. Verify worker container ran locally
docker ps -a --filter "name=employee-" --format "{{.Names}} {{.Status}}"
# Expected: at least one container with "employee-" prefix

# 3. Check logs exist
ls /tmp/employee-*.log
# Expected: at least one log file

# 4. Check task status
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/<task_id>" | jq '.status'
# Expected: "Reviewing"
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `pnpm dev:e2e` works end-to-end
- [ ] No Fly.io credentials needed for local run
