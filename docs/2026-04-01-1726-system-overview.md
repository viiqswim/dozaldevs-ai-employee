# AI Employee Platform — System Overview

## What This Document Is

This is a system-level reference for the AI Employee platform as it runs locally after Phase 8. It describes the actual data flow, services, and infrastructure — not future plans. Every claim is grounded in the current codebase. If something has a known limitation or quirk, it's called out directly. Use this document to understand how the system actually works before reading the individual phase docs.

---

## System Architecture Overview

```mermaid
flowchart LR
    JIRA["Jira\n(external)"]:::external
    GW["Gateway\nFastify :3000"]:::service
    DB["PostgreSQL\nSupabase :54322"]:::storage
    INN["Inngest Dev\n:8288"]:::service
    LC["Lifecycle Fn\nengineering/task-lifecycle"]:::service
    DOC["Docker\nai-employee-worker"]:::service
    OC["OpenCode\n:4096 (in container)"]:::service
    GH["GitHub\n(external)"]:::external
    WD["Watchdog Cron\nevery 10 min"]:::event

    JIRA -->|"POST /webhooks/jira"| GW
    GW -->|"INSERT tasks (Ready)"| DB
    GW -->|"engineering/task.received"| INN
    INN --> LC
    LC -->|"UPDATE tasks (Executing)"| DB
    LC -->|"docker run --network host"| DOC
    DOC --> OC
    OC -->|"git push + gh pr create"| GH
    DOC -->|"PATCH tasks (Submitting)"| DB
    LC -->|"poll Supabase"| DB
    LC -->|"UPDATE tasks (Done)"| DB
    WD -->|"stale detection"| DB

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
```

| #   | What happens                     | Details                                                                                            |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Jira fires webhook               | `POST /webhooks/jira` with HMAC-SHA256 signature                                                   |
| 2   | Gateway validates + creates task | HMAC check, project lookup, `INSERT tasks (status=Ready)` + status log                             |
| 3   | Gateway sends Inngest event      | `engineering/task.received` with `taskId`, `repoUrl`, `repoBranch`                                 |
| 4   | Lifecycle function triggers      | Inngest Dev Server routes event to `engineering/task-lifecycle`                                    |
| 5   | Lifecycle transitions task       | `UPDATE tasks SET status='Executing'`, logs transition                                             |
| 6   | Lifecycle dispatches container   | `docker run -d --rm --network host ai-employee-worker` (local mode)                                |
| 7   | Container boots                  | 8-step entrypoint: auth, clone, branch, install, Docker daemon, task context, heartbeat, auth.json |
| 8   | Orchestrator runs                | `orchestrate.mjs` starts OpenCode server on port 4096, injects prompt                              |
| 9   | Code generation                  | OpenCode session with `minimax/minimax-m2.7` via OpenRouter                                        |
| 10  | Validation pipeline              | TypeScript, lint, unit, integration, e2e — fix loop retries on failure                             |
| 11  | PR created                       | `git push` + `gh pr create` via GitHub API                                                         |
| 12  | Worker writes completion         | `PATCH tasks (Submitting)` + `INSERT deliverables` via PostgREST                                   |
| 13  | Lifecycle finalizes              | Polls Supabase every 30s, detects `Submitting`, writes `Done`                                      |
| 14  | Watchdog monitors                | Every 10 min: stale heartbeat detection, recovery or escalation                                    |

---

## What Each Phase Built

| Phase | Name                     | What It Added                                                                                                           | Key Files                                                                                                                                                                           |
| ----- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Foundation               | Prisma schema (16 tables), migrations, seed data, logger, test harness                                                  | `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/logger.ts`                                                                                                                       |
| 2     | Event Gateway            | Fastify server, Jira webhook route with HMAC validation, task creation service, project lookup                          | `src/gateway/server.ts`, `src/gateway/routes/jira.ts`, `src/gateway/services/task-creation.ts`                                                                                      |
| 3     | Inngest Core             | Inngest client, lifecycle function skeleton, `engineering/task.received` event dispatch                                 | `src/gateway/inngest/send.ts`, `src/inngest/lifecycle.ts`                                                                                                                           |
| 4     | Execution Infrastructure | Fly.io client, PostgREST client, cost gate, execution record creation, container dispatch path                          | `src/lib/fly-client.ts`, `src/workers/lib/postgrest-client.ts`, `src/lib/cost-gate.ts`                                                                                              |
| 5     | Execution Agent          | Worker entrypoint, orchestrate.mts, OpenCode server wrapper, session manager, heartbeat                                 | `src/workers/entrypoint.sh`, `src/workers/orchestrate.mts`, `src/workers/lib/opencode-server.ts`, `src/workers/lib/session-manager.ts`                                              |
| 6     | Completion & Delivery    | Validation pipeline (5 stages), fix loop, branch manager, PR manager, completion flow                                   | `src/workers/lib/validation-pipeline.ts`, `src/workers/lib/fix-loop.ts`, `src/workers/lib/pr-manager.ts`, `src/workers/lib/completion.ts`                                           |
| 7     | Resilience               | Watchdog cron, redispatch function, token tracker, agent version tracking, Slack client                                 | `src/inngest/watchdog.ts`, `src/inngest/redispatch.ts`, `src/workers/lib/token-tracker.ts`                                                                                          |
| 8     | E2E Validation           | Local Docker dispatch path, Supabase polling (replaces waitForEvent), zx TypeScript scripts, 7 infrastructure bug fixes | `scripts/dev-start.ts`, `scripts/verify-e2e.ts`, `scripts/setup.ts`, `scripts/trigger-task.ts`, fixes across `lifecycle.ts`, `completion.ts`, `session-manager.ts`, `entrypoint.sh` |

---

## The Complete Data Flow (Webhook to PR)

```mermaid
sequenceDiagram
    participant J as Jira
    participant G as Gateway :3000
    participant DB as Supabase :54322
    participant I as Inngest :8288
    participant L as Lifecycle Fn
    participant D as Docker
    participant W as Worker Container
    participant GH as GitHub

    J->>G: POST /webhooks/jira (HMAC signed)
    G->>DB: INSERT tasks (status=Ready)
    G->>DB: INSERT task_status_log (NULL→Ready)
    G->>I: send engineering/task.received
    I->>L: trigger lifecycle function
    L->>DB: UPDATE tasks (Ready→Executing)
    L->>DB: INSERT task_status_log (Ready→Executing)
    L->>D: docker run --network host ai-employee-worker
    D->>W: entrypoint.sh (8 steps)
    W->>DB: POST /rest/v1/executions (heartbeat)
    W->>W: opencode serve --port 4096
    W->>W: promptAsync (minimax/minimax-m2.7)
    W->>W: validation pipeline + fix loop
    W->>GH: git push + gh pr create
    W->>DB: PATCH tasks (Executing→Submitting)
    W->>DB: INSERT deliverables
    L->>DB: poll every 30s for status=Submitting
    L->>DB: UPDATE tasks (Submitting→Done)
    L->>DB: INSERT task_status_log (Submitting→Done)
```

| #   | Actor        | What happens             | Details                                                                                                                                                                                                                                                                                                                                |
| --- | ------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gateway      | Receives Jira webhook    | `POST /webhooks/jira`, validates HMAC-SHA256 against `JIRA_WEBHOOK_SECRET`                                                                                                                                                                                                                                                             |
| 2   | Gateway      | Looks up project         | `project-lookup.ts` matches `jira_project_key` to project row                                                                                                                                                                                                                                                                          |
| 3   | Gateway      | Creates task             | `createTaskFromJiraWebhook()` — atomic transaction: task row + status log. Status is `Ready` (not `Received`). Idempotent on duplicate webhook.                                                                                                                                                                                        |
| 4   | Gateway      | Sends Inngest event      | `inngest.send({ name: 'engineering/task.received', data: { taskId, repoUrl, repoBranch } })`                                                                                                                                                                                                                                           |
| 5   | Lifecycle    | Checks cost gate         | `COST_LIMIT_USD_PER_DEPT_PER_DAY` threshold (default: 50 USD). Fails to `AwaitingInput` if exceeded.                                                                                                                                                                                                                                   |
| 6   | Lifecycle    | Transitions to Executing | `UPDATE tasks SET status='Executing'`, creates execution record                                                                                                                                                                                                                                                                        |
| 7   | Lifecycle    | Dispatches container     | `USE_LOCAL_DOCKER=1`: `docker run -d --rm --network host --name ai-worker-{taskId[:8]} {envArgs} ai-employee-worker`                                                                                                                                                                                                                   |
| 8   | Container    | Runs entrypoint.sh       | Step 1: git auth + identity. Step 2: `git clone --depth=2`. Step 3: checkout branch. Step 4: `pnpm install --frozen-lockfile`. Step 5: optional Docker daemon. Step 6: fetch task context via PostgREST. Step 7: write heartbeat to `executions`. Step 7.5: write `~/.local/share/opencode/auth.json`. Step 8: exec `orchestrate.mjs`. |
| 9   | Orchestrator | Starts OpenCode          | `opencode serve --port 4096`, health-checks `/health`, then `PUT /auth/openrouter` (belt-and-suspenders)                                                                                                                                                                                                                               |
| 10  | Orchestrator | Injects prompt           | `createSession()` + `promptAsync(sessionId, prompt, { model: 'openrouter/minimax/minimax-m2.7' })`                                                                                                                                                                                                                                     |
| 11  | Orchestrator | Monitors session         | SSE stream watching for `session.idle` event, 60-minute timeout                                                                                                                                                                                                                                                                        |
| 12  | Orchestrator | Runs validation          | `runWithFixLoop()` — stages: `typescript`, `lint`, `unit`, `integration`, `e2e`. Each stage writes a `validation_runs` row. Fix loop re-prompts OpenCode on failure.                                                                                                                                                                   |
| 13  | Orchestrator | Creates PR               | `buildBranchName()` → `ai/{ticketId}-{slug}`. `commitAndPush()`. `createOrUpdatePR()` via GitHub REST API.                                                                                                                                                                                                                             |
| 14  | Worker       | Writes completion        | `runCompletionFlow()`: PATCH task to `Submitting` via PostgREST, INSERT deliverable, send `engineering/task.completed` Inngest event                                                                                                                                                                                                   |
| 15  | Lifecycle    | Detects completion       | In `USE_LOCAL_DOCKER` mode: polls Supabase every 30s for `status=Submitting`. Transitions to `Done`.                                                                                                                                                                                                                                   |
| 16  | Watchdog     | Monitors health          | Every 10 min: finds executions with `heartbeat_at < now()-10min` and task `status=Executing`. If machine gone: retry (dispatch < 3) or escalate to `AwaitingInput`. Also recovers tasks stuck in `Submitting` for >15 min.                                                                                                             |

---

## Local Development Environment

### Required Services

| Service                     | Port  | How to start                                                      |
| --------------------------- | ----- | ----------------------------------------------------------------- |
| Supabase (PostgREST + Auth) | 54321 | `supabase start`                                                  |
| Supabase PostgreSQL         | 54322 | started by `supabase start`                                       |
| Inngest Dev Server          | 8288  | `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` |
| Gateway (Fastify)           | 3000  | `USE_LOCAL_DOCKER=1 pnpm dev`                                     |

### Start Everything at Once

```bash
pnpm dev:start          # recommended — TypeScript version (scripts/dev-start.ts)
./scripts/dev-start.sh  # bash original (preserved for reference)
```

Both scripts start Supabase, wait for it to be healthy, start Inngest Dev Server, then start the gateway.

### Manual Steps (if dev-start.sh fails)

```bash
# 1. Start Supabase
supabase start

# 2. Run migrations and seed
pnpm prisma migrate deploy
pnpm prisma db seed

# 3. Start Inngest Dev Server (separate terminal)
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest

# 4. Start gateway (separate terminal)
USE_LOCAL_DOCKER=1 pnpm dev
```

### First-Time Setup

Run the interactive setup wizard (idempotent — safe to re-run):

```bash
pnpm setup    # runs scripts/setup.ts
```

To trigger a test task after services are running:

```bash
pnpm trigger-task    # runs scripts/trigger-task.ts
```

### Database

The system uses the `ai_employee` database on the shared local Supabase instance (port 54322). A PostgREST migration (`20260401210430_postgrest_grants`) applied explicit GRANTs and DB-side UUID defaults so PostgREST can read/write all 16 tables via `service_role`.

```
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee
DATABASE_URL_DIRECT=postgresql://postgres:postgres@localhost:54322/ai_employee
```

### Docker Image

The worker image must be built locally before any task can run:

```bash
docker build -t ai-employee-worker .
```

The lifecycle function dispatches `ai-employee-worker` (no tag suffix). The container runs with `--network host` so it can reach Supabase on `localhost:54321` and Inngest on `localhost:8288`.

### OpenCode Auth

The container writes `~/.local/share/opencode/auth.json` in entrypoint step 7.5 using `OPENROUTER_API_KEY`. The format is:

```json
{
  "openrouter": {
    "type": "api",
    "key": "<OPENROUTER_API_KEY>"
  }
}
```

This must happen before `opencode serve` starts. The orchestrator also calls `PUT /auth/openrouter` after the server is up as a belt-and-suspenders measure.

---

## Database Schema

### 7 MVP-Active Tables

```mermaid
flowchart TD
    P["projects\nid, name, repo_url,\njira_project_key, tooling_config"]:::storage
    T["tasks\nid, external_id, status,\nproject_id, triage_result,\ndispatch_attempts"]:::storage
    E["executions\nid, task_id, runtime_id,\nstatus, heartbeat_at,\ncurrent_stage"]:::storage
    D["deliverables\nid, execution_id,\ndelivery_type, external_ref"]:::storage
    VR["validation_runs\nid, execution_id,\nstage, status, iteration"]:::storage
    SL["task_status_log\nid, task_id,\nfrom_status, to_status, actor"]:::storage
    AV["agent_versions\nid, prompt_hash,\nmodel_id, tool_config_hash"]:::storage

    P --> T
    T --> E
    T --> SL
    E --> D
    E --> VR
    E --> AV

    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
```

| Table             | Purpose                        | Key columns                                                                     |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `projects`        | Repo + Jira mapping            | `repo_url`, `jira_project_key`, `default_branch`, `tooling_config`              |
| `tasks`           | Central entity, status machine | `status`, `external_id`, `triage_result`, `dispatch_attempts`, `failure_reason` |
| `executions`      | One per task attempt           | `runtime_id`, `heartbeat_at`, `current_stage`, `status`, `fix_iterations`       |
| `deliverables`    | PR references                  | `delivery_type='pull_request'`, `external_ref` (PR URL)                         |
| `validation_runs` | Per-stage results              | `stage`, `status`, `iteration`, `error_output`, `duration_ms`                   |
| `task_status_log` | Audit trail                    | `from_status`, `to_status`, `actor` (gateway/lifecycle_fn/machine/watchdog)     |
| `agent_versions`  | Model + prompt tracking        | `prompt_hash`, `model_id`, `tool_config_hash`                                   |

### Task Status State Machine

```mermaid
flowchart LR
    N(["NULL"]):::event
    R["Ready\n(actor: gateway)"]:::service
    EX["Executing\n(actor: lifecycle_fn)"]:::service
    SB["Submitting\n(actor: machine)"]:::service
    DN["Done\n(actor: lifecycle_fn)"]:::storage
    AI["AwaitingInput\n(actor: watchdog/lifecycle)"]:::external
    CA["Cancelled\n(actor: gateway)"]:::external

    N -->|"webhook received"| R
    R -->|"lifecycle triggered"| EX
    EX -->|"PR created"| SB
    SB -->|"Supabase poll"| DN
    R -->|"cost gate exceeded"| AI
    EX -->|"dispatch >= 3"| AI
    EX -->|"stale, dispatch < 3"| R
    R -->|"issue_deleted webhook"| CA

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
```

Note: The Prisma schema has `@default("Received")` on `tasks.status`, but `task-creation.ts` explicitly writes `status: 'Ready'` — the default is never used in the current flow.

The 9 forward-compatibility tables (`departments`, `archetypes`, `knowledge_bases`, `risk_models`, `cross_dept_triggers`, `clarifications`, `reviews`, `audit_log`, `feedback`) exist in the schema and have migrations but contain no data in local dev.

---

## Project Structure

```
src/
├── gateway/                    # Fastify HTTP server
│   ├── server.ts               # Plugin registration, Inngest wiring
│   ├── routes/
│   │   ├── health.ts           # GET /health → {"status":"ok"}
│   │   ├── jira.ts             # POST /webhooks/jira — HMAC, task creation
│   │   └── github.ts           # POST /webhooks/github — stub
│   ├── inngest/
│   │   └── send.ts             # inngest.send() wrapper
│   ├── services/
│   │   ├── task-creation.ts    # createTaskFromJiraWebhook(), cancelTaskByExternalId()
│   │   └── project-lookup.ts   # findProjectByJiraKey()
│   └── validation/
│       └── schemas.ts          # Zod schemas for webhook payloads
│
├── inngest/                    # Inngest functions (run in gateway process)
│   ├── lifecycle.ts            # engineering/task-lifecycle — main flow
│   ├── redispatch.ts           # engineering/task-redispatch — retry (6h budget)
│   └── watchdog.ts             # engineering/watchdog-cron — every 10 min
│
├── lib/                        # Shared utilities
│   ├── logger.ts               # Pino logger factory
│   ├── fly-client.ts           # Fly.io Machines API client
│   ├── github-client.ts        # Octokit wrapper
│   ├── slack-client.ts         # Slack Web API wrapper
│   ├── cost-gate.ts            # Per-dept daily cost threshold check
│   └── agent-version.ts        # computeVersionHash() for model tracking
│
└── workers/                    # Docker container code
    ├── entrypoint.sh           # 8-step boot sequence (bash)
    ├── orchestrate.mts         # Main orchestration (16-step flow)
    └── lib/
        ├── opencode-server.ts  # Spawn + health-check opencode serve
        ├── session-manager.ts  # createSession(), promptAsync(), monitorSession()
        ├── validation-pipeline.ts  # 5-stage runner (typescript/lint/unit/integration/e2e)
        ├── fix-loop.ts         # Auto-retry failed stages via re-prompt
        ├── branch-manager.ts   # buildBranchName(), ensureBranch(), commitAndPush()
        ├── pr-manager.ts       # createOrUpdatePR() via GitHub REST API
        ├── completion.ts       # runCompletionFlow() — Supabase-first, then Inngest
        ├── heartbeat.ts        # Periodic PATCH to executions.heartbeat_at
        ├── postgrest-client.ts # HTTP client for Supabase PostgREST
        ├── task-context.ts     # parseTaskContext(), buildPrompt()
        ├── project-config.ts   # fetchProjectConfig(), parseRepoOwnerAndName()
        └── token-tracker.ts    # Accumulate prompt/completion token counts
```

---

## Known Limitations (Reality Check)

1. **Test suite**: 515 tests pass. 2 pre-existing failures exist: `container-boot.test.ts` (infrastructure test that requires a real Docker socket) and `inngest-serve.test.ts` (function count mismatch — expects a different number of registered functions). Neither is a regression from Phase 8. Two tests intermittently fail in parallel runs due to shared DB state: `migration.test.ts` and `project-lookup.test.ts`. Run them serially if they fail: `pnpm test -- --run --reporter=verbose`.

2. **Database name**: The system uses the `ai_employee` database (not `postgres`). The migration `20260401210430_postgrest_grants` applied explicit GRANTs so PostgREST can access all tables via `service_role`. If you run multiple projects on the same Supabase instance, each needs its own database — see `AGENTS.md` for the convention.

3. **Watchdog in local Docker mode**: The watchdog checks for executions with `heartbeat_at < now() - 10 minutes`. In local Docker mode, the watchdog calls `flyClient.getMachine()` which will fail (no Fly.io credentials), causing it to skip the stale task rather than recover it. The watchdog's stale-detection path is effectively a no-op locally. The Submitting-recovery path (15-min threshold) does work because it only uses Inngest.

4. **OpenCode auth timing**: `auth.json` must be written before `opencode serve` starts. The entrypoint does this in step 7.5. If `OPENROUTER_API_KEY` is missing, the server starts without credentials and all model calls fail with 401.

5. **No production deployment**: Everything runs locally. The Fly.io dispatch path (`createMachine()`) exists in `lifecycle.ts` and is tested in unit tests, but has never been run against a real Fly.io account.

6. **Token tracking**: `TokenTracker` accumulates token counts from direct `callLLM()` calls. OpenCode SDK v1 doesn't expose per-session token usage, so tokens consumed during OpenCode sessions are not tracked. The `executions` table columns `prompt_tokens` and `completion_tokens` will be 0 for all Phase 8 runs.

7. **Cost gate**: `COST_LIMIT_USD_PER_DEPT_PER_DAY` defaults to `50` USD. Since token tracking is incomplete (see above), the cost gate compares against 0 and never triggers in practice.

8. **Forward-compatibility tables**: 9 of 16 tables (`departments`, `archetypes`, `knowledge_bases`, `risk_models`, `cross_dept_triggers`, `clarifications`, `reviews`, `audit_log`, `feedback`) are schema-only. They have no data and no code paths that write to them in the current flow.

9. **`progress.json`**: The root `progress.json` file tracks phase completion status. Phases 2-7 show older statuses that may not reflect the final state of each phase. Phase 8 is the authoritative completion marker.

---

## Environment Variables Reference

### Gateway Process

| Variable                          | Required | Description                                                                             |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Yes      | Prisma connection string — `postgresql://postgres:postgres@localhost:54322/ai_employee` |
| `DATABASE_URL_DIRECT`             | Yes      | Direct connection (same as above for local)                                             |
| `SUPABASE_URL`                    | Yes      | PostgREST base URL — `http://localhost:54321`                                           |
| `SUPABASE_SECRET_KEY`             | Yes      | Supabase service role key (from `supabase status`)                                      |
| `JIRA_WEBHOOK_SECRET`             | Yes      | HMAC secret for Jira webhook validation                                                 |
| `GITHUB_WEBHOOK_SECRET`           | No       | HMAC secret for GitHub webhooks (stub route)                                            |
| `INNGEST_EVENT_KEY`               | Yes      | Inngest event key (use `local` for dev)                                                 |
| `INNGEST_SIGNING_KEY`             | No       | Inngest signing key (not required for local dev)                                        |
| `INNGEST_DEV`                     | Yes      | Set to `1` to point at local Inngest Dev Server                                         |
| `USE_LOCAL_DOCKER`                | Yes      | Set to `1` to use local Docker instead of Fly.io                                        |
| `COST_LIMIT_USD_PER_DEPT_PER_DAY` | No       | Daily cost cap per department (default: 50)                                             |

### Lifecycle Function (reads from gateway process env)

| Variable             | Required | Description                                                                          |
| -------------------- | -------- | ------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`       | Yes      | Passed to worker container for git push + PR creation                                |
| `OPENROUTER_API_KEY` | Yes      | Passed to worker container for OpenCode auth                                         |
| `OPENROUTER_MODEL`   | No       | Model to use (default: `minimax/minimax-m2.7`)                                       |
| `INNGEST_EVENT_KEY`  | Yes      | Passed to worker container for completion event                                      |
| `INNGEST_BASE_URL`   | No       | Inngest Dev Server URL (default: `http://localhost:8288`)                            |
| `FLY_API_TOKEN`      | No       | Required only when `USE_LOCAL_DOCKER` is not set                                     |
| `FLY_WORKER_APP`     | No       | Fly.io app name for worker machines                                                  |
| `FLY_WORKER_IMAGE`   | No       | Worker image on Fly registry (default: `registry.fly.io/ai-employee-workers:latest`) |

### Worker Container (injected by lifecycle.ts)

| Variable              | Required | Description                                             |
| --------------------- | -------- | ------------------------------------------------------- |
| `TASK_ID`             | Yes      | UUID of the task to execute                             |
| `REPO_URL`            | Yes      | Git clone URL of the target repository                  |
| `REPO_BRANCH`         | No       | Branch to push to (default: `main`)                     |
| `SUPABASE_URL`        | Yes      | PostgREST base URL for task context + completion writes |
| `SUPABASE_SECRET_KEY` | Yes      | Service role key for PostgREST auth                     |
| `GITHUB_TOKEN`        | Yes      | For `git push` and `gh pr create`                       |
| `OPENROUTER_API_KEY`  | Yes      | Written to `auth.json` before OpenCode starts           |
| `OPENROUTER_MODEL`    | No       | Model identifier (default: `minimax/minimax-m2.7`)      |
| `INNGEST_EVENT_KEY`   | Yes      | For sending `engineering/task.completed` event          |
| `INNGEST_DEV`         | Yes      | Set to `1` in local mode                                |
| `INNGEST_BASE_URL`    | Yes      | `http://localhost:8288` in local mode                   |
