# MVP Implementation Phases — Local-First Progressive Testing

> **Companion document to**: `docs/2026-03-22-2317-ai-employee-architecture.md`
>
> **Scope**: MVP only (M1 + M3). Platform Foundation + Engineering Execution Agent.
>
> **Principle**: Every phase is testable in isolation. Nothing deploys to the cloud until the full flow works locally. Each phase builds on the previous — don't skip ahead.

---

## How to Use This Document

This document splits the MVP into 10 phases. Each phase has:

- **What you're building** — the components and their purpose
- **Architecture references** — sections in the architecture doc with the detailed spec
- **Verification criteria** — specific commands and expected outputs that prove the phase works
- **System snapshot** — what your local environment looks like after completing the phase

**The rule is simple: if the verification criteria don't pass, don't move to the next phase.** Each phase is designed so that failures surface immediately — no silent breakage that compounds later.

The phases are ordered by dependency:

```
Phase 1 (Foundation) → Phase 2 (Gateway) → Phase 3 (Inngest) → Phase 4 (Execution Infra)
                                                                         ↓
Phase 8 (Local E2E) ← Phase 7 (Resilience) ← Phase 6 (Completion) ← Phase 5 (Agent)
         ↓
Phase 9 (Cloud Deploy) → Phase 10 (Production)
```

---

## Prerequisites

**Tools** (install before starting):

- Node.js 20+ and pnpm
- Docker Desktop (running)
- Supabase CLI (`npx supabase --version`)
- Inngest CLI (`npx inngest-cli@latest --version`)
- GitHub CLI (`gh --version`, authenticated)
- OpenCode CLI (`opencode --version`)

**Accounts** (create before starting):

- GitHub (with a test repository for execution agent to target)
- Supabase (for cloud deployment in Phase 9 — not needed until then)
- Inngest (for cloud deployment in Phase 9 — not needed until then)
- OpenRouter (API key for LLM calls)
- Jira Cloud (with a test project for webhook integration)
- Slack (workspace with a test channel for escalation notifications)

**Test Repository**: Create or designate a GitHub repository that the execution agent will work against. This should be a real TypeScript project with a working test suite — the agent needs something to validate against. The nexus-stack or a fork of it works well for this.

---

## Phase Summary

| # | Phase | What You're Testing | Key Verification |
|---|---|---|---|
| 1 | Foundation | Project compiles, DB schema exists, local Supabase running | `npx prisma migrate dev` succeeds, tables queryable |
| 2 | Event Gateway | Webhooks received, validated, normalized, written to DB | `curl` test payload → task record in Supabase |
| 3 | Inngest Core | Events flow Gateway → Inngest, lifecycle function triggers | Event visible in Inngest Dev dashboard, status transitions |
| 4 | Execution Infrastructure | LLM wrapper works, Docker image builds, container boots | `callLLM()` returns response, container clones repo |
| 5 | Execution Agent | OpenCode session runs, validation pipeline works, fix loop works | Code written, tests run, fix loop iterates on failure |
| 6 | Completion & Delivery | Branch created, PR submitted, task marked Done | PR on GitHub, task status `Done` in Supabase |
| 7 | Resilience & Monitoring | Failure recovery, watchdog, cost circuit breaker | Simulated failures → correct recovery behavior |
| 8 | Full Local E2E | Complete flow: webhook → PR, all local | Jira webhook → PR appears → task lifecycle complete |
| 9 | Cloud Deployment | Same flow on Fly.io + Supabase Cloud + Inngest Cloud | Same verification against cloud URLs |
| 10 | Production Integration | Real Jira tickets trigger the flow, human reviews PRs | Real ticket → PR → human review → feedback recorded |

---

## Phase 1: Foundation

**Goal**: TypeScript project compiles, Prisma schema matches architecture doc, local Supabase runs with all 7 MVP tables.

**Architecture references**: §13 (Platform Data Model), §15 (Technology Stack), §27.5 (Local Development Setup)

### What to Build

1. **Project scaffolding**
   - TypeScript project with `tsconfig.json`, `package.json` (pnpm)
   - Directory structure: `src/gateway/`, `src/inngest/`, `src/lib/`, `src/workers/`
   - ESLint + Prettier configuration

2. **Prisma setup**
   - `prisma/schema.prisma` pointing to local Supabase
   - Schema for the 7 MVP-active tables from §13:
     - `tasks` — with all MVP columns including `raw_event`, `triage_result`, `dispatch_attempts`, `failure_reason`
     - `executions` — with `heartbeat_at`, `current_stage`, token tracking columns
     - `deliverables` — with `risk_score`, `status`
     - `validation_runs` — with `stage`, `iteration`, `error_output`, `duration_ms`
     - `projects` — with `repo_url`, `default_branch`, `concurrency_limit`, `tooling_config`
     - `feedback` — full schema from §21
     - `task_status_log` — with `actor` CHECK constraint
   - Also create the forward-compatibility tables (empty but schema-ready):
     - `departments`, `archetypes`, `knowledge_bases`, `risk_models`, `cross_dept_triggers`, `agent_versions`, `clarifications`, `reviews`, `audit_log`
   - CHECK constraint on `tasks.status` for valid values (§13 recommendation)
   - UNIQUE constraint on `tasks(external_id, source_system, tenant_id)` for idempotency
   - Default `tenant_id` constant UUID (`00000000-0000-0000-0000-000000000001`)

3. **Local Supabase**
   - `supabase init` + `supabase start`
   - Migrations applied via `npx prisma migrate dev`

4. **Seed data**
   - Insert a test `projects` record (pointing to your test GitHub repo)
   - Insert a test `agent_versions` record (initial version)

### Verification Criteria

```bash
# 1. Project compiles
npx tsc --noEmit
# Expected: No errors

# 2. Local Supabase is running
supabase status
# Expected: Shows running services (DB, Auth, Storage, etc.)

# 3. Migrations applied
npx prisma migrate dev
# Expected: "All migrations have been applied"

# 4. Tables exist and are queryable
npx prisma db execute --stdin <<< "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
# Expected: All 16 tables listed (7 active + 9 forward-compatibility)

# 5. Seed data present
npx prisma db execute --stdin <<< "SELECT id, name, repo_url FROM projects;"
# Expected: Test project record visible

# 6. Constraints enforced
npx prisma db execute --stdin <<< "INSERT INTO tasks (id, status, tenant_id) VALUES (gen_random_uuid(), 'InvalidStatus', '00000000-0000-0000-0000-000000000001');"
# Expected: CHECK constraint violation error

# 7. Prisma client generates
npx prisma generate
# Expected: Client generated successfully
```

### System Snapshot After Phase 1

```
Local Supabase: RUNNING (localhost:54322)
Supabase Dashboard: http://localhost:54323
Tables: 16 tables created, 7 active for MVP
Seed data: 1 project, 1 agent_version
TypeScript: Compiles clean
Prisma: Client generated, migrations applied
```

---

## Phase 2: Event Gateway

**Goal**: Fastify server accepts webhooks, validates signatures, parses payloads with Zod, writes task records to Supabase with idempotency and project filtering.

**Architecture references**: §8 (Engineering Dept — System Context), §8 Webhook Event Routing table, §8 Error Handling Contract

### What to Build

1. **Fastify server**
   - `GET /health` — returns 200 when ready
   - `POST /webhooks/jira` — Jira webhook handler
   - `POST /webhooks/github` — GitHub webhook handler (stub for now — active in M4)
   - Structured logging (§14 logging schema) from day one

2. **Signature verification**
   - Jira: HMAC signature verification from the webhook payload
   - GitHub: `X-Hub-Signature-256` header verification
   - Invalid signature → 401, logged

3. **Payload validation (Zod)**
   - Jira required fields: `webhookEvent`, `issue.id`, `issue.key`, `issue.fields.summary`, `issue.fields.project.key`
   - GitHub PR required fields: `action`, `pull_request.number`, `repository.full_name`
   - Invalid payload → 400, payload shape logged

4. **Webhook event routing** (§8 Webhook Event Routing table)
   - `jira:issue_created` → Create task record (`Ready` status), store normalized payload
   - `jira:issue_updated` → Ignore (per §4.2)
   - `jira:issue_deleted` / status to Cancelled → Set task `Cancelled`
   - Unknown events → Log and ignore

5. **Project filtering**
   - Match `issue.fields.project.key` against `projects` table
   - Unknown project → 200 OK, no task created, logged

6. **Task creation**
   - Write to `tasks` table with status `Ready` (MVP bypasses triage)
   - Populate `triage_result` with raw Jira webhook payload (MVP schema from §13)
   - Store full normalized payload in `raw_event` JSONB column
   - UNIQUE constraint handles duplicates → 200 OK (idempotent)

7. **Task status log**
   - Write `task_status_log` entry on every status transition (actor: `gateway`)

8. **Test fixtures**
   - Create `test-payloads/jira-issue-created.json` with realistic Jira webhook data
   - Create `test-payloads/jira-issue-created-invalid.json` (missing required fields)
   - Create `test-payloads/jira-issue-created-unknown-project.json` (project not registered)

### Verification Criteria

```bash
# Start the gateway (from a separate terminal)
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
JIRA_WEBHOOK_SECRET=test-secret \
npx ts-node src/gateway/index.ts
# Expected: "Server listening on port 3000"

# 1. Health check
curl -s http://localhost:3000/health
# Expected: 200 OK with {"status":"ok"}

# 2. Valid Jira webhook → task created
curl -s -X POST http://localhost:3000/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: <valid-hmac>" \
  -d @test-payloads/jira-issue-created.json
# Expected: 200/202, task record in Supabase with status "Ready"

# Verify in DB:
npx prisma db execute --stdin <<< "SELECT id, external_id, status, source_system FROM tasks;"
# Expected: 1 row, status=Ready, source_system=jira

# Verify triage_result populated:
npx prisma db execute --stdin <<< "SELECT triage_result->>'ticket_id' as ticket, triage_result->>'title' as title FROM tasks;"
# Expected: ticket_id and title from the webhook payload

# Verify status log:
npx prisma db execute --stdin <<< "SELECT * FROM task_status_log;"
# Expected: 1 row, from_status=NULL, to_status=Ready, actor=gateway

# 3. Invalid signature → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: invalid" \
  -d @test-payloads/jira-issue-created.json
# Expected: 401

# 4. Invalid payload → 400
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: <valid-hmac>" \
  -d @test-payloads/jira-issue-created-invalid.json
# Expected: 400

# 5. Unknown project → 200 (logged, no task created)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: <valid-hmac>" \
  -d @test-payloads/jira-issue-created-unknown-project.json
# Expected: 200 (task count unchanged)

# 6. Duplicate webhook → 200 (idempotent)
curl -s -X POST http://localhost:3000/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: <valid-hmac>" \
  -d @test-payloads/jira-issue-created.json
# Expected: 200 (no new task record, count unchanged)
npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM tasks;"
# Expected: 1 (not 2)
```

### System Snapshot After Phase 2

```
Gateway: RUNNING (localhost:3000)
Routes: /health, /webhooks/jira, /webhooks/github
Supabase: Tasks table populated on webhook receipt
Signature verification: Working (Jira HMAC, GitHub X-Hub-Signature-256)
Payload validation: Working (Zod schemas)
Project filtering: Working (unknown projects ignored)
Idempotency: Working (duplicate webhooks handled)
Status logging: Working (task_status_log populated)
```

---

## Phase 3: Inngest Core

**Goal**: Events flow from Gateway to Inngest Dev Server, engineering lifecycle function triggers and manages status transitions with optimistic locking.

**Architecture references**: §10 (Orchestration and Scaling), §10 MVP Lifecycle Function pseudo-code, §14 Inngest Execution Limits

### What to Build

1. **Inngest Dev Server**
   - Running at `http://localhost:8288`
   - Auto-discovers functions from the Fastify app

2. **Inngest client integration**
   - Inngest client configured in the Gateway app
   - `/api/inngest` endpoint for Inngest function hosting
   - `inngest.send()` called after Supabase task creation in webhook handler
   - Event ID set to webhook delivery ID (deduplication per §8)
   - Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s) per §8

3. **Engineering lifecycle function** (skeleton matching §10 pseudo-code)
   - `engineering/task-lifecycle` function
   - Concurrency control: `{ limit: 3, key: "event.data.projectId", scope: "fn" }`
   - Step 1: Update task status `Ready → Executing` (optimistic lock)
   - Step 1.5: Check for cancellation before proceeding
   - Step 2: Dispatch placeholder (log message — real dispatch in Phase 5)
   - Step 3: `step.waitForEvent("engineering/task.completed", { timeout: "4h10m" })`
   - Step 4: Finalize (handle completion, timeout, or failure)

4. **Optimistic locking pattern**
   - All status transitions use `WHERE status = $expected` per §13
   - Conflict detected → log and skip (not crash)

5. **Re-dispatch handler** (skeleton)
   - `engineering/task-redispatch` function per §10 pseudo-code
   - Triggers new lifecycle function instance

6. **Inngest send failure handling** (§8)
   - If `inngest.send()` fails after 3 retries → return 202
   - Task stays in `Received` state with `raw_event` preserved
   - Log the failure for manual recovery

### Verification Criteria

```bash
# Start Inngest Dev Server (separate terminal)
npx inngest-cli@latest dev
# Expected: Dev server at http://localhost:8288

# Start Gateway with Inngest integration
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
INNGEST_DEV=1 \
INNGEST_SIGNING_KEY=local \
INNGEST_EVENT_KEY=local \
JIRA_WEBHOOK_SECRET=test-secret \
npx ts-node src/gateway/index.ts
# Expected: Gateway starts, Inngest discovers functions

# 1. Event appears in Inngest
# (First, clean the tasks table)
npx prisma db execute --stdin <<< "DELETE FROM task_status_log; DELETE FROM tasks;"

curl -s -X POST http://localhost:3000/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: <valid-hmac>" \
  -d @test-payloads/jira-issue-created.json
# Expected: Event visible in Inngest Dev dashboard (http://localhost:8288)

# 2. Lifecycle function triggered
# Open http://localhost:8288 in browser
# Expected: "engineering/task-lifecycle" function run visible
# Expected: Step "update-status-executing" completed

# 3. Task status transitioned
npx prisma db execute --stdin <<< "SELECT id, status FROM tasks;"
# Expected: status = "Executing"

# 4. Status log shows both transitions
npx prisma db execute --stdin <<< "SELECT from_status, to_status, actor FROM task_status_log ORDER BY created_at;"
# Expected:
#   Row 1: NULL → Ready (actor: gateway)
#   Row 2: Ready → Executing (actor: lifecycle_fn)

# 5. Optimistic lock conflict test
# Manually set a task back to "Ready":
npx prisma db execute --stdin <<< "UPDATE tasks SET status = 'Cancelled' WHERE status = 'Executing';"
# Re-trigger the lifecycle function (send another event for same task)
# Expected: Lifecycle function detects status changed, logs conflict, exits gracefully

# 6. Cancellation check
# Create a new task, then immediately cancel it:
npx prisma db execute --stdin <<< "DELETE FROM task_status_log; DELETE FROM tasks;"
# Send webhook, then quickly cancel:
curl -s -X POST http://localhost:3000/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: <valid-hmac>" \
  -d @test-payloads/jira-issue-created.json
npx prisma db execute --stdin <<< "UPDATE tasks SET status = 'Cancelled';"
# Expected: Lifecycle function's check-cancellation step detects Cancelled, exits

# 7. Inngest Dev dashboard shows full trace
# Open http://localhost:8288
# Expected: Each step visible with timing, inputs, outputs
```

### System Snapshot After Phase 3

```
Inngest Dev Server: RUNNING (localhost:8288)
Functions registered: engineering/task-lifecycle, engineering/task-redispatch
Event flow: Webhook → Gateway → Supabase → Inngest → Lifecycle → Status update
Concurrency: 3 per project (enforced by Inngest)
Optimistic locking: Working
Cancellation check: Working
Status transitions: Ready → Executing (logged in task_status_log)
```

---

## Phase 4: Execution Infrastructure

**Goal**: `callLLM()` wrapper calls OpenRouter successfully, thin API wrappers handle retries, Docker image builds, worker container boots and reads task context from Supabase.

**Architecture references**: §22 (LLM Gateway Design), §24 (API Rate Limiting — MVP wrappers), §7.3 (Fly.io Machine Lifecycle), §14.1 (Multi-Project Docker Image Strategy), §9.2 (Execution Agent — boot sequence)

### What to Build

1. **LLM Gateway — `callLLM()` wrapper** (§22 interface contract)
   - `callLLM({ model, messages, taskType, taskId })` function
   - OpenRouter integration (single API key)
   - Retry-on-429: 3 attempts, exponential backoff
   - Token tracking: `promptTokens`, `completionTokens`, `estimatedCostUsd`, `latencyMs`
   - Timeout handling (`LLMTimeoutError` after `timeoutMs`)
   - Cost accumulation in-memory per execution
   - Cost circuit breaker check (cached daily spend per department)

2. **Thin API wrappers** (§24 MVP scope)
   - `jiraClient` — `getTicket()`, `postComment()`, `updateStatus()` with retry-on-429
   - `githubClient` — `createPR()`, `listPRs()`, `getPR()` with retry-on-429
   - `slackClient` — `postMessage()` for escalation notifications
   - Each wrapper: 3 retries, exponential backoff on 429

3. **Docker image** (§14.1)
   - `Dockerfile` for the base worker image
   - Contents: Node.js, pnpm, git, GitHub CLI (`gh`), Docker-in-Docker (fuse-overlayfs), OpenCode CLI, platform scripts
   - No repository baked in — cloned at boot time via `REPO_URL`

4. **`entrypoint.sh`** (adapted from nexus-stack)
   - Step 1: Write auth tokens from environment variables
   - Step 2: Shallow clone repo (`git clone --depth=2 $REPO_URL`)
   - Step 3: Checkout or create task branch
   - Step 4: Install dependencies (pnpm install)
   - Step 5: Start Docker daemon (for Supabase local — if needed)
   - Step 6: Read task context from Supabase (`SELECT * FROM tasks WHERE id = $TASK_ID`)
   - Step 7: Write heartbeat to `executions` table
   - Step 8: Hand off to `orchestrate.mjs`

5. **Task context injection**
   - Environment variables: `TASK_ID`, `REPO_URL`, `REPO_BRANCH`
   - Credentials: `GITHUB_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`

### Verification Criteria

```bash
# 1. callLLM() works
# Create a simple test script: src/lib/__tests__/call-llm.test.ts
# Run it:
OPENROUTER_API_KEY=<your-key> npx ts-node -e "
  const { callLLM } = require('./src/lib/llm-gateway');
  callLLM({
    model: 'anthropic/claude-sonnet-4',
    messages: [{ role: 'user', content: 'Reply with exactly: hello' }],
    taskType: 'execution',
  }).then(r => {
    console.log('Response:', r.content);
    console.log('Tokens:', r.promptTokens, '+', r.completionTokens);
    console.log('Cost: $' + r.estimatedCostUsd.toFixed(4));
    console.log('Latency:', r.latencyMs + 'ms');
    console.log('Model:', r.model);
  });
"
# Expected: Response received, token counts > 0, cost calculated, latency measured

# 2. GitHub client works
GITHUB_TOKEN=<your-token> npx ts-node -e "
  const { githubClient } = require('./src/lib/github-client');
  githubClient.listPRs({ repo: '<your-test-repo>', state: 'open' })
    .then(prs => console.log('Open PRs:', prs.length));
"
# Expected: PR count returned (may be 0)

# 3. Docker image builds
docker build -t ai-employee-worker .
# Expected: Build succeeds, image created

# 4. Container boots and reads task
# First, insert a test task:
npx prisma db execute --stdin <<< "
  INSERT INTO tasks (id, external_id, source_system, status, tenant_id, triage_result, project_id)
  VALUES (
    '11111111-1111-1111-1111-111111111111',
    'TEST-001',
    'jira',
    'Executing',
    '00000000-0000-0000-0000-000000000001',
    '{\"ticket_id\": \"TEST-001\", \"title\": \"Test task\", \"description\": \"A test task for verification\"}',
    (SELECT id FROM projects LIMIT 1)
  );
"

# Run the container (use host network to reach local Supabase):
docker run --rm --network host \
  -e TASK_ID=11111111-1111-1111-1111-111111111111 \
  -e REPO_URL=<your-test-repo-url> \
  -e REPO_BRANCH=main \
  -e GITHUB_TOKEN=<your-token> \
  -e SUPABASE_URL=http://localhost:54321 \
  -e SUPABASE_SECRET_KEY=<from-supabase-start> \
  -e OPENROUTER_API_KEY=<your-key> \
  ai-employee-worker
# Expected: Container boots, clones repo, reads task from Supabase, writes heartbeat

# 5. Heartbeat written
npx prisma db execute --stdin <<< "SELECT id, task_id, current_stage, heartbeat_at FROM executions;"
# Expected: 1 row with recent heartbeat_at timestamp

# 6. Boot time measured
# Add timing output to entrypoint.sh (start/end timestamps)
# Expected: < 80s warm (without volume caching, expect longer on first run)
```

### System Snapshot After Phase 4

```
LLM Gateway: callLLM() calling OpenRouter, tracking tokens and cost
API Wrappers: jiraClient, githubClient, slackClient with retry-on-429
Docker Image: Built, contains all tooling
Worker Container: Boots, clones repo, reads task from Supabase
Heartbeat: Writing to executions table
Boot sequence: entrypoint.sh running full lifecycle
```

---

## Phase 5: Execution Agent

**Goal**: OpenCode session receives task context, generates an implementation plan, writes code, and the validation pipeline (TypeScript → lint → unit tests) runs with the fix loop.

**Architecture references**: §9.2 (Execution Agent), §6.1 (Engineering Department — agent runtime)

### What to Build

1. **`orchestrate.mjs`** (adapted from nexus-stack)
   - Start `opencode serve` on port 4096
   - Create OpenCode session via `@opencode-ai/sdk` (`createOpencodeClient()`)
   - Inject task context (from `triage_result`) as the initial prompt
   - Monitor session progress via SDK events
   - Write heartbeats between validation stages AND on 60-second timer

2. **Validation pipeline**
   - Stage runner: TypeScript check → Lint → Unit tests → Integration tests → E2E tests
   - Each stage: run command, capture output, record result in `validation_runs` table
   - Duration tracking per stage (`duration_ms`)

3. **Fix loop** (§9.2 fix loop)
   - On stage failure: send error output to OpenCode session for diagnosis and fix
   - Re-enter pipeline at the failing stage, run all subsequent stages
   - Per-stage iteration limit: 3
   - Global iteration limit: 10
   - Track `fix_iterations` on `executions` table

4. **Escalation**
   - On budget exhaustion (per-stage 3 or global 10): stop execution
   - Post to Slack: failing stage, full error output, diff attempted
   - Update task status to `AwaitingInput`

5. **Execution record management**
   - Create `executions` record at start
   - Link `agent_version_id`
   - Update `prompt_tokens`, `completion_tokens`, `estimated_cost_usd` from cumulative `callLLM()` tracking
   - Write `primary_model_id`

### Verification Criteria

For this phase, test inside the Docker container (or locally with OpenCode running):

```bash
# 1. OpenCode server starts
opencode serve --port 4096 &
# Expected: Server listening on port 4096

# 2. SDK client connects
npx ts-node -e "
  const { createClient } = require('@opencode-ai/sdk');
  const client = createClient({ url: 'http://localhost:4096' });
  client.session.list().then(sessions => console.log('Sessions:', sessions.length));
"
# Expected: Sessions count returned (may be 0)

# 3. Session creation with task context
# Run orchestrate.mjs with a test task:
TASK_ID=11111111-1111-1111-1111-111111111111 \
SUPABASE_URL=http://localhost:54321 \
SUPABASE_SECRET_KEY=<key> \
node src/workers/orchestrate.mjs
# Expected:
#   - Session created with task prompt
#   - OpenCode generates implementation plan
#   - Code changes written to disk
#   - Validation pipeline starts

# 4. Validation stages run
# Check validation_runs table:
npx prisma db execute --stdin <<< "
  SELECT stage, status, iteration, duration_ms
  FROM validation_runs
  ORDER BY created_at;
"
# Expected: Rows for each stage (typescript, lint, unit, etc.) with pass/fail status

# 5. Fix loop works
# To test the fix loop, give the agent a task that produces initially broken code:
# (Use a task with triage_result that describes a change likely to cause a type error)
# Expected:
#   - First validation_run for typescript: status=failed
#   - Fix iteration runs
#   - Second validation_run for typescript: status=passed
#   - Pipeline continues to lint, unit, etc.

# 6. Iteration limits enforced
# Check execution record:
npx prisma db execute --stdin <<< "SELECT fix_iterations FROM executions;"
# Expected: Count matches actual fix iterations observed

# 7. Escalation fires on budget exhaustion
# Create a task that causes persistent failures (e.g., impossible constraint)
# Expected: After 3 iterations on a single stage → Slack notification → task status AwaitingInput

# 8. Heartbeats written between stages
npx prisma db execute --stdin <<< "
  SELECT heartbeat_at, current_stage
  FROM executions
  WHERE task_id = '11111111-1111-1111-1111-111111111111';
"
# Expected: heartbeat_at updates between stages, current_stage reflects progress
```

### System Snapshot After Phase 5

```
OpenCode: Serving on port 4096 inside container
Orchestration: orchestrate.mjs managing sessions via SDK
Validation: TypeScript → Lint → Unit stages running
Fix loop: Stage-targeted re-entry, iteration limits enforced
Escalation: Slack notification on budget exhaustion
Tracking: validation_runs populated, executions updated, heartbeats writing
```

---

## Phase 6: Completion & Delivery

**Goal**: Execution agent creates a branch and PR, writes completion status to Supabase before sending the Inngest event, lifecycle function finalizes the task.

**Architecture references**: §9.4 (Branch Naming), §9.2 (PR Deduplication on Re-dispatch), §8 (Reverse-Path SPOF Mitigation), §10 MVP Lifecycle Function (finalize step)

### What to Build

1. **Branch creation**
   - Format: `ai/<jira-ticket-id>-<kebab-summary>` (§9.4)
   - Check if branch already exists (re-dispatch scenario) — reuse, don't create new
   - Commit all changes to the branch

2. **PR creation**
   - Before `gh pr create`: check for existing PR on this branch (§9.2 deduplication)
   - If PR exists: push new commits, update PR body if needed
   - If no PR: create new PR with task context in the body
   - PR title format: `[AI] <ticket-id>: <summary>`

3. **Supabase-first completion write** (§8 Reverse-Path SPOF)
   - Write `status = 'Submitting'` + PR URL to Supabase BEFORE sending Inngest event
   - This is the critical SPOF mitigation — if Inngest event is lost, Supabase has the truth
   - Retry Supabase write: 3 attempts, exponential backoff (1s, 2s, 4s)
   - Fallback: write to stdout (captured in logs) if Supabase write fails

4. **Inngest completion event**
   - Send `engineering/task.completed` with `taskId` and completion data
   - Retry: 3 attempts, exponential backoff
   - Event ID: deterministic (task_id + attempt) for deduplication

5. **Lifecycle function finalize** (§10 pseudo-code Step 4)
   - On completion event: read final status from Supabase, confirm Done
   - On timeout (4h10m): check `dispatch_attempts`, re-dispatch or escalate
   - Machine cleanup: `flyApi.destroyMachine()` as fallback (machine self-destructs first)
   - Create `deliverables` record with PR URL and delivery type

6. **Self-destruct** (local mock)
   - Container exits cleanly after completion event sent
   - In production: Fly.io Machines API call to destroy self

### Verification Criteria

```bash
# 1. Branch created on GitHub
# Run the full execution flow (from Phase 5) to completion
# Check GitHub:
gh pr list --repo <your-test-repo> --head "ai/TEST-001-test-task"
# Expected: PR listed (or branch visible)

# 2. PR created
gh pr view --repo <your-test-repo> --json number,title,headRefName
# Expected: PR with title "[AI] TEST-001: Test task", head branch "ai/TEST-001-test-task"

# 3. Supabase has completion data BEFORE Inngest event
# (Add logging to verify order)
npx prisma db execute --stdin <<< "
  SELECT status,
         (triage_result->>'pr_url') as pr_url
  FROM tasks
  WHERE id = '11111111-1111-1111-1111-111111111111';
"
# Expected: status = "Submitting" (or "Done" if lifecycle already finalized)

# 4. Deliverable record created
npx prisma db execute --stdin <<< "SELECT * FROM deliverables;"
# Expected: 1 row with delivery_type='pull_request', external_ref=PR URL

# 5. Full lifecycle completes
npx prisma db execute --stdin <<< "
  SELECT from_status, to_status, actor
  FROM task_status_log
  WHERE task_id = '11111111-1111-1111-1111-111111111111'
  ORDER BY created_at;
"
# Expected sequence:
#   NULL → Ready (gateway)
#   Ready → Executing (lifecycle_fn)
#   Executing → Submitting (machine)
#   Submitting → Done (lifecycle_fn)

# 6. PR deduplication
# Re-run the same task (simulate re-dispatch)
# Expected: No duplicate PR created, existing PR updated

# 7. Execution record fully populated
npx prisma db execute --stdin <<< "
  SELECT prompt_tokens, completion_tokens, estimated_cost_usd, primary_model_id, fix_iterations
  FROM executions;
"
# Expected: All fields populated with real values
```

### System Snapshot After Phase 6

```
Branch creation: ai/<ticket-id>-<summary> format, reuse on re-dispatch
PR creation: With deduplication, task context in body
Completion: Supabase-first write, then Inngest event
Lifecycle: Full flow Ready → Executing → Submitting → Done
Deliverables: Record created with PR reference
Status log: Complete audit trail with all transitions and actors
```

---

## Phase 7: Resilience & Monitoring

**Goal**: All failure modes have recovery paths. Watchdog detects stale machines. Cost circuit breaker works. Agent versioning tracks what ran.

**Architecture references**: §10.1 (3-Layer Monitoring), §22.1 (Cost Circuit Breaker), §23 (Agent Versioning), §18 (Risk Mitigation)

### What to Build

1. **Watchdog cron** (§10.1 Layer 3)
   - Inngest cron function running every 10 minutes
   - Query: tasks in `Executing` with no heartbeat in 10 minutes
   - For stale tasks: check machine status, mark `Failed` if dead
   - For `Submitting` tasks with no lifecycle completion: emit `engineering/task.completed` on machine's behalf
   - Destroy machines running > 4 hours
   - Write `task_status_log` entries (actor: `watchdog`)

2. **Re-dispatch flow**
   - On timeout: check `dispatch_attempts` < 3 → re-dispatch
   - On `dispatch_attempts` >= 3 → Slack escalation, task → `AwaitingInput`
   - New machine picks up existing branch (branch is the checkpoint)
   - Total timeout budget: 6 hours across all attempts

3. **Cost circuit breaker** (§22.1)
   - Track cumulative daily spend per department (in-memory cache, refresh every 5 min)
   - Threshold: configurable (default $50/day engineering)
   - Over threshold: pause new LLM calls, Slack alert, tasks held in `AwaitingInput`

4. **Inngest send failure handling** (§8)
   - Forward path: Gateway → Inngest fails after 3 retries → 202 response, task in `Received` with `raw_event`
   - Reverse path: Machine → Inngest fails after 3 retries → status in Supabase (`Submitting`), watchdog recovers

5. **`step.waitForEvent` race condition mitigation** (§10 Known Issue)
   - Before calling `step.waitForEvent`: check Supabase for existing completion
   - If found: skip wait, proceed immediately
   - This is mandatory for ALL `step.waitForEvent` calls

6. **Agent versioning** (§23 MVP scope)
   - `agent_versions` table with `prompt_hash`, `model_id`, `tool_config_hash`
   - Every `execution` links to `agent_version_id`
   - Create version record on startup, reuse for all executions in that deployment

7. **Structured logging** (§14 logging schema)
   - All components emit: `timestamp`, `level`, `taskId`, `step`, `component`, `message`, `error`, `metadata`
   - Write to stdout (Fly.io logs handle collection)

### Verification Criteria

```bash
# 1. Watchdog detects stale task
# Create an execution with an old heartbeat:
npx prisma db execute --stdin <<< "
  INSERT INTO executions (id, task_id, runtime_type, status, heartbeat_at, current_stage)
  VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    'opencode',
    'running',
    NOW() - INTERVAL '15 minutes',
    'execute'
  );
"
# Wait for watchdog cron to run (or trigger manually in Inngest Dev dashboard)
# Check: http://localhost:8288 — watchdog function should have run
npx prisma db execute --stdin <<< "
  SELECT from_status, to_status, actor
  FROM task_status_log
  WHERE actor = 'watchdog'
  ORDER BY created_at DESC LIMIT 1;
"
# Expected: Watchdog detected stale execution, updated status

# 2. Re-dispatch on timeout
# Create a task with dispatch_attempts = 1:
npx prisma db execute --stdin <<< "
  UPDATE tasks SET dispatch_attempts = 1, status = 'Ready'
  WHERE id = '11111111-1111-1111-1111-111111111111';
"
# Trigger lifecycle → let it timeout (or use short timeout for testing)
# Expected: dispatch_attempts incremented to 2, new lifecycle triggered

# 3. Escalation after max attempts
npx prisma db execute --stdin <<< "
  UPDATE tasks SET dispatch_attempts = 3, status = 'Executing'
  WHERE id = '11111111-1111-1111-1111-111111111111';
"
# Trigger watchdog or lifecycle timeout
# Expected: Task status → AwaitingInput, Slack message posted, failure_reason populated
npx prisma db execute --stdin <<< "SELECT status, failure_reason FROM tasks WHERE id = '11111111-1111-1111-1111-111111111111';"
# Expected: status=AwaitingInput, failure_reason contains attempt count

# 4. Cost circuit breaker
# Insert execution records that exceed the threshold:
npx prisma db execute --stdin <<< "
  INSERT INTO executions (id, task_id, runtime_type, status, estimated_cost_usd)
  SELECT gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'opencode', 'completed', 20
  FROM generate_series(1, 3);
"
# ($60 total — over $50 threshold)
# Attempt callLLM():
# Expected: CostCircuitBreakerError thrown, Slack alert posted

# 5. waitForEvent race condition mitigation
# Write completion to Supabase before lifecycle starts waiting:
npx prisma db execute --stdin <<< "
  UPDATE tasks SET status = 'Submitting'
  WHERE id = '11111111-1111-1111-1111-111111111111';
"
# Trigger lifecycle function
# Expected: Lifecycle detects Submitting status in pre-check, skips waitForEvent, proceeds to finalize

# 6. Agent version linked to execution
npx prisma db execute --stdin <<< "
  SELECT e.id, av.prompt_hash, av.model_id
  FROM executions e
  JOIN agent_versions av ON e.agent_version_id = av.id;
"
# Expected: Each execution linked to an agent version with hash and model
```

### System Snapshot After Phase 7

```
Watchdog: Running every 10 min, detecting stale executions
Re-dispatch: Working with attempt counting and branch reuse
Escalation: Slack notifications on max attempts
Cost circuit breaker: Daily spend tracking, threshold enforcement
Race condition mitigation: Supabase pre-check before all waitForEvent calls
Agent versioning: All executions linked to version records
Structured logging: Consistent JSON schema across all components
```

---

## Phase 8: Full Local End-to-End

**Goal**: Complete flow from Jira webhook to PR, running entirely locally. This is the MVP validation milestone — if this works, the system is functionally complete.

**Architecture references**: §27.5 (Local Development Setup), §11 (Full Lifecycle Sequence — MVP steps 1-20)

### Test Procedure

This is the integration test that proves the MVP works. Follow these steps in order:

#### Setup (one-time, before the test)

```bash
# Terminal 1: Local Supabase
supabase start
npx prisma migrate dev

# Terminal 2: Inngest Dev Server
npx inngest-cli@latest dev

# Terminal 3: Event Gateway
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
INNGEST_DEV=1 \
INNGEST_SIGNING_KEY=local \
INNGEST_EVENT_KEY=local \
SUPABASE_URL=http://localhost:54321 \
SUPABASE_SECRET_KEY=<from-supabase-start> \
GITHUB_TOKEN=<your-token> \
JIRA_WEBHOOK_SECRET=test-secret \
OPENROUTER_API_KEY=<your-key> \
npx ts-node src/gateway/index.ts

# Ensure test project record exists in DB
# Ensure Docker Desktop is running
```

#### Execute the Test

```bash
# Step 1: Send a realistic Jira webhook
# Use a payload that describes a real, simple task for your test repo
# (e.g., "Add a utility function that formats dates as ISO strings")
curl -s -X POST http://localhost:3000/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: <valid-hmac>" \
  -d @test-payloads/jira-realistic-task.json

echo "Webhook sent. Monitoring..."
```

#### Verification Checklist

Monitor these in real-time as the system processes:

```bash
# 1. Task created in Supabase
npx prisma db execute --stdin <<< "SELECT id, external_id, status FROM tasks ORDER BY created_at DESC LIMIT 1;"
# Expected: status = "Ready"

# 2. Event visible in Inngest Dev dashboard
# Open http://localhost:8288
# Expected: "engineering/task.received" event, "engineering/task-lifecycle" function running

# 3. Lifecycle function triggered, status → Executing
npx prisma db execute --stdin <<< "SELECT status FROM tasks ORDER BY created_at DESC LIMIT 1;"
# Expected: status = "Executing"

# 4. Docker container boots (visible in Docker Desktop or docker ps)
docker ps
# Expected: ai-employee-worker container running

# 5. Heartbeats appearing
npx prisma db execute --stdin <<< "SELECT heartbeat_at, current_stage FROM executions ORDER BY created_at DESC LIMIT 1;"
# Expected: Recent heartbeat_at, current_stage updating

# 6. Validation runs recorded
npx prisma db execute --stdin <<< "SELECT stage, status, iteration FROM validation_runs ORDER BY created_at;"
# Expected: Rows for typescript, lint, unit (at minimum)

# 7. PR created on GitHub
gh pr list --repo <your-test-repo> --state open
# Expected: PR with title "[AI] <ticket-id>: <summary>"

# 8. Task status → Submitting → Done
npx prisma db execute --stdin <<< "SELECT status FROM tasks ORDER BY created_at DESC LIMIT 1;"
# Expected: status = "Done"

# 9. Full status log audit trail
npx prisma db execute --stdin <<< "
  SELECT from_status, to_status, actor, created_at
  FROM task_status_log
  ORDER BY created_at;
"
# Expected sequence:
#   NULL → Ready (gateway)
#   Ready → Executing (lifecycle_fn)
#   Executing → Submitting (machine)
#   Submitting → Done (lifecycle_fn)

# 10. Deliverable record exists
npx prisma db execute --stdin <<< "SELECT delivery_type, external_ref, status FROM deliverables;"
# Expected: delivery_type=pull_request, external_ref=PR URL, status=submitted

# 11. Execution record complete
npx prisma db execute --stdin <<< "
  SELECT prompt_tokens, completion_tokens, estimated_cost_usd, fix_iterations, primary_model_id
  FROM executions ORDER BY created_at DESC LIMIT 1;
"
# Expected: All fields populated

# 12. Container cleaned up
docker ps
# Expected: ai-employee-worker container no longer running
```

### Success Criteria

**The MVP is functionally complete when ALL 12 checks pass.** If any check fails, go back to the corresponding phase and fix it before proceeding to cloud deployment.

### System Snapshot After Phase 8

```
Full local E2E: PASSING
Flow: Jira webhook → Gateway → Inngest → Lifecycle → Docker → OpenCode → PR → Done
All records: tasks, executions, validation_runs, deliverables, task_status_log populated
PR: Created on GitHub with task context
Container: Self-cleaned after completion
Total flow time: ~5-15 minutes depending on task complexity
```

---

## Phase 9: Cloud Deployment

**Goal**: Same flow works on Fly.io + Supabase Cloud + Inngest Cloud. The local-first approach means this should "just work" — cloud deployment is an infrastructure swap, not a code change.

**Architecture references**: §27 (Deployment Runbook), §25 (Security Model), §15 (Technology Stack)

### What to Deploy

1. **Supabase Cloud**
   - Create Supabase project
   - Run migrations: `npx prisma migrate deploy` (use direct connection, port 5432 — NOT the pooler)
   - Insert seed data (test project, initial agent version)
   - Verify connection string works

2. **Inngest Cloud**
   - Create Inngest project
   - Copy signing key and event key
   - Functions auto-discovered when Gateway deploys

3. **Fly.io — Event Gateway**
   - `fly launch --app ai-employee-gateway`
   - Set secrets:
     ```bash
     fly secrets set \
       DATABASE_URL="<supabase-pooler-url>" \
       DATABASE_URL_DIRECT="<supabase-direct-url>" \
       SUPABASE_URL="<supabase-url>" \
       SUPABASE_SECRET_KEY="<supabase-service-key>" \
       INNGEST_SIGNING_KEY="<inngest-signing-key>" \
       INNGEST_EVENT_KEY="<inngest-event-key>" \
       GITHUB_TOKEN="<github-pat>" \
       JIRA_WEBHOOK_SECRET="<jira-secret>" \
       OPENROUTER_API_KEY="<openrouter-key>" \
       SLACK_WEBHOOK_URL="<slack-webhook>" \
       --app ai-employee-gateway
     ```
   - Deploy: `fly deploy --app ai-employee-gateway`
   - Configure health check: `GET /health` every 10s, 5s timeout

4. **Fly.io — Worker Image**
   - Build and push: `fly deploy --app ai-employee-workers` (or push to Fly.io registry)
   - Set secrets (same credentials as gateway)

5. **Webhook Configuration**
   - Point Jira webhook to `https://ai-employee-gateway.fly.dev/webhooks/jira`
   - Point GitHub webhook to `https://ai-employee-gateway.fly.dev/webhooks/github`

### Verification Criteria

Run the EXACT SAME tests as Phase 8, but against cloud URLs:

```bash
# 1. Gateway health check
curl -s https://ai-employee-gateway.fly.dev/health
# Expected: 200 OK

# 2. Send test webhook to cloud gateway
curl -s -X POST https://ai-employee-gateway.fly.dev/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: <valid-hmac>" \
  -d @test-payloads/jira-realistic-task.json
# Expected: 200/202

# 3. Verify in Inngest Cloud dashboard (https://app.inngest.com)
# Expected: Event received, lifecycle function triggered

# 4. Verify in Supabase Cloud dashboard
# Expected: Task record created, status transitions occurring

# 5. Verify Fly.io machine created
fly machines list --app ai-employee-workers
# Expected: Machine running (or recently completed)

# 6. PR created on GitHub
gh pr list --repo <your-test-repo> --state open
# Expected: New PR from the cloud execution

# 7. Full lifecycle completes
# Query Supabase Cloud:
# Expected: Task status = Done, all records populated (same as Phase 8 checks 9-12)

# 8. Machine cleaned up
fly machines list --app ai-employee-workers
# Expected: Machine destroyed after completion

# 9. Watchdog cron running
# Check Inngest Cloud dashboard for watchdog function executions
# Expected: Running every 10 minutes
```

### Cloud-Specific Checks

```bash
# Connection pool health (Supabase)
# Check Supabase dashboard > Database > Metrics > Active Connections
# Expected: < 15 connections (well under the 60 limit)

# Inngest concurrency
# Check Inngest dashboard > Functions > engineering/task-lifecycle > Concurrency
# Expected: Concurrency limit of 3 per project enforced

# Fly.io app health
fly status --app ai-employee-gateway
# Expected: 1+ instances running, health checks passing

# Logs (structured JSON)
fly logs --app ai-employee-gateway | head -20
# Expected: JSON-structured logs matching §14 schema
```

### Rollback Plan

If cloud deployment fails:

1. **Gateway crash**: `fly deploy --app ai-employee-gateway --image <previous-image>` — Fly.io keeps previous images
2. **Schema issue**: `npx prisma migrate resolve --rolled-back <migration-name>` — then manual SQL fix
3. **Inngest failure**: Functions stop executing. Tasks accumulate in `Received` state. Run `npx dispatch-task.ts --status received --since 1h` after fix to catch up

### System Snapshot After Phase 9

```
Supabase Cloud: Running, schema deployed, seed data present
Inngest Cloud: Functions registered, events flowing
Fly.io Gateway: Running, health checks passing, webhooks receivable
Fly.io Workers: Image pushed, machines dispatchable
Full cloud E2E: Same flow as local, same verification criteria
Watchdog: Running on Inngest Cloud cron
```

---

## Phase 10: Production Integration

**Goal**: Real Jira tickets trigger the flow. Human reviews all PRs (supervised mode). Feedback loop starts capturing corrections.

**Architecture references**: §16 (Implementation Roadmap — M3 gate), §19 (Department Onboarding Checklist), §21 (Feedback Loops)

### What to Configure

1. **Real Jira webhooks**
   - Configure Jira project webhook → Gateway URL
   - Event types: `jira:issue_created`, `jira:issue_deleted`
   - Verify webhook fires on ticket creation

2. **Shadow mode first** (1-2 weeks)
   - System processes real tickets and creates PRs
   - Add a `[SHADOW]` prefix to PR titles during shadow mode
   - PRs are created as **draft PRs** (`gh pr create --draft`) so they're clearly not ready for merge
   - Developer reviews every PR output but doesn't merge
   - Record feedback in `feedback` table for every review

3. **Supervised mode** (ongoing)
   - Remove `[SHADOW]` prefix and draft status
   - PRs created normally, developer reviews and merges manually
   - This IS the MVP operational mode — human reviews all PRs
   - Continue recording feedback

4. **Feedback capture** (§21)
   - On PR rejection: record `feedback_type = 'pr_rejection'` with original decision and correction
   - On PR approval with changes: record `feedback_type = 'merge_override'`
   - Weekly: query feedback table, identify patterns, update prompts if needed

5. **Monitoring ritual** (§27 Monitoring Runbook)
   - Daily (5 min): Check Inngest queue, execution logs, OpenRouter costs, Fly.io health
   - Weekly (15 min): Review feedback, check escalation patterns, update agent versions

### Verification Criteria

```bash
# 1. Real Jira webhook fires
# Create a real ticket in your Jira test project
# Expected: Task appears in Supabase within seconds

# 2. Full flow executes
# Expected: Task goes through Ready → Executing → Submitting → Done
# Expected: PR appears on GitHub

# 3. PR quality check (manual)
# Review the PR:
# - Does the code compile?
# - Do tests pass?
# - Does it address the ticket requirements?
# - Is the code quality acceptable?
# Record your assessment in the feedback table

# 4. Feedback recorded
npx prisma db execute --stdin <<< "
  SELECT feedback_type, correction_reason, created_at
  FROM feedback
  ORDER BY created_at DESC LIMIT 5;
"
# Expected: Feedback entries from your reviews

# 5. M3 gate criteria (from §16)
# After processing 10+ tickets:
# "Agent creates compilable PRs for simple, well-scoped tickets.
#  Human reviewer can approve without requesting changes at least 60% of the time."
# Track: approved without changes / total PRs
# Expected: >= 60% approval rate
```

### What "Done" Looks Like for the MVP

The MVP is operational when:

- [ ] Real Jira tickets trigger automated PR creation
- [ ] PRs compile and pass the project's test suite >= 80% of the time
- [ ] Human reviewer approves without changes >= 60% of the time
- [ ] Escalation path works (Slack notifications on failure)
- [ ] Watchdog recovers from machine failures
- [ ] Cost tracking is accurate and circuit breaker is tested
- [ ] Feedback loop is capturing corrections
- [ ] Full audit trail exists (task_status_log, executions, validation_runs)

---

## Appendix A: Phase Dependencies and Parallel Work

While phases are ordered sequentially, some work can be developed in parallel:

| Can Be Developed In Parallel | Reason |
|---|---|
| Phase 4 (LLM + Docker) alongside Phase 3 (Inngest) | LLM wrapper and Docker image don't depend on Inngest integration |
| Phase 7 (Resilience) alongside Phase 6 (Completion) | Watchdog and circuit breaker are independent functions |
| Test fixtures for all phases | Can be created upfront — Jira payloads, task records, etc. |

**But always VERIFY sequentially.** Even if you build Phases 4 and 3 in parallel, verify Phase 3 first, then Phase 4, because Phase 4's Docker container verification requires Inngest to be working.

---

## Appendix B: Troubleshooting Common Issues

| Symptom | Likely Cause | Fix |
|---|---|---|
| `prisma migrate dev` hangs | Using pooled Supabase connection (port 6543) | Use direct connection (port 5432) for all migrations |
| Inngest functions not discovered | Gateway not exposing `/api/inngest` endpoint | Verify Inngest serve middleware is registered in Fastify |
| Docker container can't reach local Supabase | Network isolation | Use `--network host` or set `SUPABASE_URL` to host IP |
| OpenCode session hangs | Model timeout or token limit | Check OpenRouter dashboard, verify API key, try smaller model |
| Webhook signature verification fails | Secret mismatch or encoding issue | Log the raw signature and expected HMAC, compare byte-by-byte |
| `step.waitForEvent` never receives event | Inngest issue #1433 race condition | Implement Supabase pre-check before every `waitForEvent` call |
| Machine boots but task read fails | Wrong `TASK_ID` or Supabase URL | Verify env vars in `docker run`, check Supabase is accessible |
| PR creation fails | GitHub token permissions or branch protection | Verify token scopes (`repo` full access), check branch protection rules |
| Cost circuit breaker fires unexpectedly | Stale cost cache or test data in executions table | Clear test execution records, verify cache refresh interval |
| Lifecycle function retries indefinitely | Step failure without proper error handling | Check Inngest dashboard for step errors, add proper try/catch |

---

## Appendix C: Local vs. Cloud Differences

The local-first approach means most code is identical between environments. These are the differences:

| Component | Local | Cloud |
|---|---|---|
| Supabase | `localhost:54322` via `supabase start` | `db.<project>.supabase.co:5432` |
| Inngest | `localhost:8288` via `inngest-cli dev` | `app.inngest.com` (SaaS) |
| Event Gateway | `localhost:3000` via `ts-node` | `ai-employee-gateway.fly.dev` via Fly.io |
| Worker machines | Docker container via `docker run` | Fly.io machine via Machines API |
| Webhooks | `curl` or Smee/ngrok tunnel | Direct Jira/GitHub → Fly.io URL |
| Secrets | `.env.local` file or inline env vars | Fly.io Secrets (never in code) |
| Machine self-destruct | Container exit | Fly.io Machines API `DELETE` call |
| Volume caching | Docker volumes (optional) | Fly.io volume forking from seed |

**The key principle**: If it works locally, it works in the cloud. The only failure modes unique to cloud are networking (DNS, TLS, firewall) and credential management (Fly.io Secrets rotation). Everything else — business logic, lifecycle management, error handling — is identical.
