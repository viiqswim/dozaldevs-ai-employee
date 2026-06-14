---
name: execution-trace-debugging
description: 'Use when tracing a Slack @mention through the full AI employee execution path, debugging a task that disappeared or silently failed, finding where a step is logged in local or production, or running a production incident triage. Covers the complete 8-step forward trace (Slack @mention → interaction classification → trigger handling → input collection → task dispatch → lifecycle states → execution phase → delivery phase), a side-by-side local|prod log-location matrix, DB observability queries (local + prod), a reverse stuck-in-state lookup, a deep Production Incident Playbook, and all known caveats (delivery-log SSE gap, /tmp local-only, LOG_LEVEL=debug for poll logs, Inngest step memoization).'
---

# Execution Trace Debugging

Use this skill when you need to follow a task from the moment a Slack @mention fires to the moment it reaches `Done` (or fails), and you want to know exactly which file logged what, and where to find that log in both local and production environments.

For state-machine detail (all lifecycle states, watchdog behavior, approval flow), load `debugging-lifecycle` instead. This skill focuses on the **forward trace** and **log location** — not the state reference table.

---

## Section 1: Forward Trace (8 Steps)

### Step 1 — Slack @mention received

**File**: `src/gateway/slack/handlers/event-handlers.ts` (`registerEventHandlers`, `app_mention` handler)  
**Logger name**: `slack-handlers`  
**Log destination**: gateway process stdout → `/tmp/ai-dev.log` (local)

What it logs:

| Log message                          | Level | When                                            |
| ------------------------------------ | ----- | ----------------------------------------------- |
| `app_mention event received`         | info  | Every @mention that passes dedup                |
| `Ignoring app_mention from bot`      | info  | `mention.bot_id` is set — bot talking to itself |
| `Ignoring app_mention in DM channel` | info  | Channel starts with `D` — DMs are ignored       |
| _(dedup suppression)_                | info  | Duplicate event ID seen within the dedup window |

If you see no log at all for a known @mention, the event was either deduplicated before this handler ran, or the gateway was restarting when the event arrived (tsx watch restart window is 5–15 seconds).

---

### Step 2 — Interaction classification

**File**: `src/inngest/interaction-handler.ts`  
**Logger name**: `interaction-handler`  
**Log destination**: Inngest function stdout → `/tmp/ai-dev.log` (local), Inngest Cloud run log (prod)

What it does:

- Classifies the @mention intent: `task`, `correction`, or `question`
- Writes a `feedback_events` DB row for every classified interaction
- For `task` intent: emits `employee/task.requested` event to Inngest

If the task never appears in the DB, check whether `employee/task.requested` was emitted here. A classification of `correction` or `question` will NOT create a task.

---

### Step 3 — Trigger handling and task dispatch

**Files**:

- `src/inngest/slack-trigger-handler.ts` — resolves channel → employee, posts confirmation card, waits for user to click Confirm
- `src/gateway/services/employee-dispatcher.ts` (`dispatchEmployee` / `dispatchEmployeeById`) — creates the `tasks` row, emits `employee/task.dispatched`

**Logger names**: `slack-trigger-handler`, _(no dedicated logger in employee-dispatcher.ts currently)_  
**Log destination**: Inngest function stdout → `/tmp/ai-dev.log` (local), Inngest Cloud run log (prod)

What it does:

- `slack-trigger-handler` resolves which employee owns the channel (single candidate → direct dispatch; multiple → disambiguation card; zero → "no employees" message)
- On Confirm click: calls `dispatchEmployee` or `dispatchEmployeeById`
- `dispatchEmployee`/`dispatchEmployeeById` creates the `tasks` row with `status = Ready` and emits `employee/task.dispatched` to Inngest
- `employee/task.dispatched` triggers `employee/universal-lifecycle`

DB state after this step: one row in `tasks` with `status = Ready`.

> **CAVEAT — orphaned dead code**: `src/inngest/lib/create-task-and-dispatch.ts` (`createTaskAndDispatch`) is never called anywhere in the live codebase. It has no callers — only its own definition. The real dispatch path is `employee-dispatcher.ts`. Any log messages added to `createTaskAndDispatch` will never emit at runtime.

---

### Step 4 — Input collection (optional)

**File**: `src/inngest/slack-input-collector.ts`  
**Logger name**: `slack-input-collector`  
**Log destination**: Inngest function stdout → `/tmp/ai-dev.log` (local), Inngest Cloud run log (prod)

Only fires when the employee's archetype has required `input_schema` fields. Waits for a thread reply from the user before dispatching. If the task never dispatches and the employee has `input_schema`, check whether the user replied in the correct thread.

---

### Step 5 — Lifecycle orchestration

**Files**: `src/inngest/employee-lifecycle.ts` + `src/inngest/lifecycle/steps/` (step modules)  
**Logger names**: `lifecycle-*` (one per step module)  
**Log destination**: Inngest function stdout → `/tmp/ai-dev.log` (local), Inngest Cloud run log (prod)

State transitions (full approval path):

```
Received → Triaging → AwaitingInput → Ready → Executing
  → Validating → Submitting → Reviewing → Approved → Delivering → Done
```

Short-circuit when `approval_required = false`:

```
... → Submitting → Delivering → Done
```

Every transition is written to the `task_status_log` table with `from_status`, `to_status`, `actor`, and `created_at`.

Key log message added for observability:

| Log message               | Level | File                | When                                                                               |
| ------------------------- | ----- | ------------------- | ---------------------------------------------------------------------------------- |
| `Awaiting approval event` | info  | `reviewing-path.ts` | Just before `step.waitForEvent` — confirms the lifecycle reached the approval gate |

---

### Step 6 — Execution phase

**Files**:

- `src/inngest/lifecycle/lib/machine-provisioner.ts` — provisions the Fly.io or Docker worker machine
- `src/workers/opencode-harness.mts` — main harness entry point inside the worker container
- `src/workers/lib/execution-phase.mts` — execution logic (tool filtering, OpenCode session management)

**Logger names**: `machine-provisioner`, `opencode-harness`, `lifecycle-execute`  
**Log destination**:

- Lifecycle side: Inngest function stdout → `/tmp/ai-dev.log` (local), Inngest Cloud run log (prod)
- Worker side: `/tmp/employee-{taskId8}.log` (local Docker only), `docker logs employee-{taskId8}` (local), Fly Machines REST API logs (prod)

Container naming: `employee-{taskId.slice(0,8)}`

Key log messages:

| Log message                 | Level     | Where                  | When                                                             |
| --------------------------- | --------- | ---------------------- | ---------------------------------------------------------------- |
| `Polling for completion`    | **debug** | `execute.ts` poll loop | Every 15-second poll tick — requires `LOG_LEVEL=debug` to appear |
| `session bootstrap failure` | error     | `opencode-harness.mts` | OpenCode failed to start                                         |
| `Task not found`            | error     | `opencode-harness.mts` | Worker can't reach PostgREST                                     |

> **CAVEAT**: `Polling for completion` is `debug` level. The default log level is `info`, so these messages are suppressed unless you restart the gateway with `LOG_LEVEL=debug`. In production, set `LOG_LEVEL=debug` as a Render env var and redeploy to see poll logs.

---

### Step 7 — Delivery phase

**Files**:

- `src/inngest/lifecycle/steps/delivery-retry.ts` — lifecycle side, spawns delivery machine, polls for completion (up to 3 retries)
- `src/workers/lib/delivery-phase.mts` — delivery logic inside the delivery container

**Logger names**: `lifecycle-delivery-retry`, `opencode-harness` (delivery container)  
**Log destination**:

- Lifecycle side: Inngest function stdout → `/tmp/ai-dev.log` (local), Inngest Cloud run log (prod)
- Delivery container: `/tmp/employee-delivery-{taskId8}.log` (local Docker only), `docker logs employee-delivery-{taskId8}` (local), Fly Machines REST API logs (prod)

Container naming: `employee-delivery-{taskId.slice(0,8)}`

Key log messages:

| Log message                       | Level     | Where                         | When                                         |
| --------------------------------- | --------- | ----------------------------- | -------------------------------------------- |
| `Polling delivery for completion` | **debug** | `delivery-retry.ts` poll loop | Every poll tick — requires `LOG_LEVEL=debug` |

> **CAVEAT**: The SSE log endpoint (`GET /admin/tenants/:tenantId/tasks/:id/logs`) serves ONLY the execution log (`/tmp/employee-{taskId8}.log`). It does NOT serve the delivery log. To read delivery logs locally, use `docker logs employee-delivery-{taskId8}` or `cat /tmp/employee-delivery-{taskId8}.log` directly.

---

### Step 8 — Output contract

**File**: `src/worker-tools/platform/submit-output.ts` (called by the worker via shell)  
**Paths**: `/tmp/summary.txt` (full content), `/tmp/approval-message.json` (classification + routing)

The worker writes these files via the `submit-output` tool before the OpenCode session ends. The harness reads them after the session completes. If BOTH files are absent, the harness treats it as a hard failure. If only a short summary appears in delivery (no actual content), the `--draft-file` flag was missing from the `submit-output` call in the archetype's `execution_steps`.

Output classifications:

- `NEEDS_APPROVAL` → lifecycle posts Slack approval card, enters `Reviewing`
- `NO_ACTION_NEEDED` → lifecycle short-circuits to `Done` (no delivery)

---

## Section 2: Log-Location Matrix

| Surface                               | Local command                                                                                            | Production command                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Gateway + Inngest logs                | `tail -f /tmp/ai-dev.log`                                                                                | Render API runtime logs (see below)        |
| Worker execution log                  | `tail -f /tmp/employee-${TASK_ID:0:8}.log` OR `docker logs -f employee-${TASK_ID:0:8}`                   | Fly Machines REST API (see Section 5)      |
| Delivery log                          | `tail -f /tmp/employee-delivery-${TASK_ID:0:8}.log` OR `docker logs -f employee-delivery-${TASK_ID:0:8}` | Fly Machines REST API for delivery machine |
| SSE log viewer (execution only)       | `GET /admin/tenants/:tenantId/tasks/:id/logs`                                                            | Not available in prod                      |
| Dashboard log viewer (execution only) | `http://localhost:7700/dashboard/tasks/:taskId/logs?tenant=:tenantId`                                    | Not available in prod                      |

**Render runtime logs (production gateway):**

```bash
curl -sN -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/logs?tail=100" | head -c 20000
```

> **CRITICAL — production has no `/tmp` files**: When `WORKER_RUNTIME=fly`, there are NO `/tmp/employee-*.log` files and NO SSE viewer. Worker and delivery logs exist ONLY in Fly Machines REST API. See Section 5 for the exact commands.

---

## Section 3: DB Observability

All queries work for both local and production. Swap the connection string:

- **Local**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **Production**: `postgresql://postgres.gjqrysxpvktmibpkwrvy:<password>@aws-1-us-west-2.pooler.supabase.com:5432/postgres` (session pooler, port 5432 — NOT 6543)

```bash
# Set your connection string
LOCAL_DB="postgresql://postgres:postgres@localhost:54322/ai_employee"
CLOUD_DB="postgresql://postgres.gjqrysxpvktmibpkwrvy:<password>@aws-1-us-west-2.pooler.supabase.com:5432/postgres"

# Use $LOCAL_DB or $CLOUD_DB in the commands below
DB="$LOCAL_DB"  # or $CLOUD_DB for production
```

### Task status and failure reason

```bash
psql "$DB" -c "SELECT id, status, failure_reason, failure_code, updated_at FROM tasks WHERE id = '<TASK_ID>';"
```

### Full lifecycle trace

```bash
psql "$DB" -c "SELECT from_status, to_status, actor, created_at FROM task_status_log WHERE task_id = '<TASK_ID>' ORDER BY created_at;"
```

Actor values: `lifecycle_fn` (Inngest lifecycle), `opencode_harness` (worker container), `reviewing-watchdog` (zombie cleanup cron).

### What the worker saw (compiled AGENTS.md)

```bash
psql "$DB" -c "SELECT compiled_agents_md FROM tasks WHERE id = '<TASK_ID>';"
```

### Original trigger payload

```bash
psql "$DB" -c "SELECT raw_event FROM tasks WHERE id = '<TASK_ID>';"
```

### Approval tracking

```bash
psql "$DB" -c "SELECT * FROM pending_approvals WHERE task_id = '<TASK_ID>';"
```

Empty result + `status = Reviewing` + `updated_at > 30 min ago` = zombie. The reviewing-watchdog (15-min cron) will mark it `Failed` within 30 minutes.

### Session transcript (what the LLM actually did)

```bash
psql "$DB" -c "SELECT session_transcript FROM executions WHERE task_id = '<TASK_ID>';"
```

### Token usage and cost

```bash
psql "$DB" -c "SELECT prompt_tokens, completion_tokens, estimated_cost_usd FROM executions WHERE task_id = '<TASK_ID>';"
```

Red flags: `completion_tokens > 50000` (model looping), `estimated_cost_usd > 0.50` (expensive run for a simple employee).

---

## Section 4: Reverse "Stuck in State" Lookup

| State                 | What it means                                 | Local: where to look                                                                                                                            | Production: where to look                                                                    |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Executing` (>5 min)  | Worker running or hung                        | `docker ps --filter name=employee-${TASK_ID:0:8}`, `/tmp/employee-${TASK_ID:0:8}.log`, `task_status_log` for repeated `Ready→Executing` entries | Fly Machines REST API (list machines, check state), Inngest Cloud run for retry loop pattern |
| `Submitting` (>5 min) | Worker finished, lifecycle classifying output | `task_status_log`, `tasks.failure_reason`, `deliverables` table for missing row                                                                 | Inngest Cloud run step timeline, Supabase Cloud `deliverables` table                         |
| `Reviewing` (>30 min) | Awaiting human approval or zombie             | `pending_approvals` table — empty = zombie, watchdog fires in ≤15 min                                                                           | `pending_approvals` in Supabase Cloud                                                        |
| `Delivering` (>5 min) | Delivery container running or hung            | `docker ps --filter name=employee-delivery-`, `/tmp/employee-delivery-${TASK_ID:0:8}.log`                                                       | Fly Machines REST API for delivery machine                                                   |
| `Failed`              | Terminal failure                              | `tasks.failure_reason`, `tasks.failure_code`, `task_status_log` actor field                                                                     | Same via Supabase Cloud session pooler                                                       |
| `Done` in <5s         | Pre-check short-circuit                       | `task_status_log` — single row `Received→Done`, actor `lifecycle_fn`                                                                            | Same via Supabase Cloud                                                                      |

**Repeated `Ready→Executing` entries** in `task_status_log` (2–5 rows, all from `lifecycle_fn`) means the Inngest `executing` step is crashing and retrying. After 5 attempts, Inngest stops retrying and the task stays stuck at `Executing` with no Fly machine ever created. Fix the root cause and re-trigger.

**Reviewing watchdog**: Inngest function `trigger/reviewing-watchdog`, schedule `*/15 * * * *`. Marks tasks `Failed` when `status = Reviewing` AND `updated_at < NOW() - 30 min` AND no `pending_approvals` row exists.

---

## Section 5: Production Incident Playbook

This section is a self-contained runbook for when a production task misbehaves and you need to triage from scratch.

### Production topology

| Component                  | Where          | Identifier                                                                   |
| -------------------------- | -------------- | ---------------------------------------------------------------------------- |
| Gateway                    | Render         | `https://ai-employees-laaa.onrender.com`, service `srv-d8f1b2gg4nts738dj7jg` |
| Worker/delivery containers | Fly.io         | app `ai-employee-workers`                                                    |
| Lifecycle queue            | Inngest Cloud  | `https://inn.gs`                                                             |
| Database                   | Supabase Cloud | project ref `gjqrysxpvktmibpkwrvy`                                           |
| PostgREST                  | Supabase Cloud | `https://gjqrysxpvktmibpkwrvy.supabase.co/rest/v1`                           |

> **No `/tmp` in production**: `WORKER_RUNTIME=fly` means there are no local log files and no SSE viewer. All worker and delivery logs come from the Fly Machines REST API only.

---

### Triage order (numbered — follow in sequence)

**1. Find the task and its last state transition**

```bash
CLOUD_DB="postgresql://postgres.gjqrysxpvktmibpkwrvy:<password>@aws-1-us-west-2.pooler.supabase.com:5432/postgres"

# Task status
psql "$CLOUD_DB" -c "SELECT status, failure_reason, failure_code, updated_at FROM tasks WHERE id = '<TASK_ID>';"

# Full lifecycle trace
psql "$CLOUD_DB" -c "SELECT from_status, to_status, actor, created_at FROM task_status_log WHERE task_id = '<TASK_ID>' ORDER BY created_at;"
```

Use port 5432 (session pooler). Port 6543 (transaction pooler) causes `relation "tenants" does not exist` errors. The direct host `db.gjqrysxpvktmibpkwrvy.supabase.co:5432` is IPv6-only and unreachable from most local machines — always use the session pooler URL above.

**2. Read gateway logs via Render API**

```bash
curl -sN -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/logs?tail=100" | head -c 20000
```

Look for: dispatch events, lifecycle step logs, Slack Bolt errors, `SLACK_BOT_TOKEN` warnings.

**3. Inspect Fly worker/delivery machine state**

```bash
FLY_TOKEN="<FLY_API_TOKEN from Render env vars>"

# List all machines (find the one for your task)
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers/machines" \
  | jq '[.[] | {id: .id, name: .name, state: .state, created_at: .created_at}]'

# Get machine details and recent events
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers/machines/<MACHINE_ID>" \
  | jq '{state: .state, image: .image_ref.digest, events: [.events[-5:] | .[] | {type: .type, status: .status, timestamp: .timestamp}]}'

# Destroy a stuck machine
curl -s -X DELETE -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers/machines/<MACHINE_ID>?force=true"
```

Machine naming: execution machines are named `employee-{taskId8}`, delivery machines are `employee-delivery-{taskId8}`.

**4. Inspect the Inngest Cloud run**

Navigate to `https://inn.gs` → find the `employee/universal-lifecycle` run for your task ID → read the step timeline. Look for:

- Which step last succeeded
- Which step is retrying (backoff gaps between attempts)
- Error messages in the step output

---

### Production-specific failure modes

**Inngest retry loop (executing step crashing)**

Pattern in `task_status_log`: multiple `Ready → Executing` entries from `lifecycle_fn` with increasing time gaps (30s, 51s, 71s, 126s). After 5 attempts, Inngest stops. No Fly machine is ever created. The task stays at `Executing` indefinitely — no watchdog cleans non-Reviewing tasks.

Fix: identify what the `executing` step does before `createMachine` and find the throw. Re-trigger after fixing.

**Inngest step memoization and debug logs**

Inngest memoizes step results. When a step is replayed (after a retry or resume), it replays from the memoized result — it does NOT re-execute the step body. This means per-poll `debug` log messages (like `Polling for completion`) appear only once per step execution, not once per Inngest replay. If you see fewer poll logs than expected, this is why.

**Raising log verbosity in production**

`Polling for completion` (Step 6) and `Polling delivery for completion` (Step 7) are `debug` level. To see them in production:

1. Set `LOG_LEVEL=debug` as a Render env var
2. Trigger a new deploy (env var changes require a restart)

> **Render env-var gotcha**: `PUT /env-vars` replaces ALL env vars. Always include the full list or you will wipe existing secrets. Use the single-var endpoint instead: `PUT /env-vars/<KEY>`.

**OOM-killed worker (OpenCode needs performance-1x)**

Symptom: machine appears in Fly, `OpenCode harness starting` in logs, then ~45 seconds later `Out of memory: Killed`. Task fails with 0 tokens in `executions`.

Cause: OpenCode's Go binary reserves ~74GB virtual memory at startup. `shared-cpu-1x` machines (256MB RAM) OOM-kill it every time.

Fix:

```sql
UPDATE archetypes SET vm_size = 'performance-1x' WHERE id = '<archetype_id>';
```

**IPv6 vs IPv4 DB connection**

The direct Supabase host (`db.gjqrysxpvktmibpkwrvy.supabase.co:5432`) is IPv6-only. Most local machines and GitHub Actions runners are IPv4-only. Always use the session pooler (`aws-1-us-west-2.pooler.supabase.com:5432`) for local psql and CI migrations.

**Render env vars not visible via API**

`GET /env-vars` only returns vars set via the API. Vars set via the Render dashboard (SUPABASE_URL, SUPABASE_SECRET_KEY, INNGEST_EVENT_KEY, etc.) do NOT appear. Always use `?limit=100` when listing — the default page size is ~20 and hides keys. Verify SUPABASE_URL indirectly via `curl https://ai-employees-laaa.onrender.com/api/config.js` — if `VITE_POSTGREST_URL` is non-empty, it's set.

---

### Full production health check

Run this first for any production issue:

```bash
# 1. Gateway health
curl -s https://ai-employees-laaa.onrender.com/health | jq .
# Expected: {"status":"ok"}

# 2. SUPABASE_URL set correctly
curl -s https://ai-employees-laaa.onrender.com/api/config.js
# Expected: VITE_POSTGREST_URL non-empty

# 3. Latest Render deploy status
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" \
  | jq '.[0] | {status: .deploy.status, updated_at: .deploy.updatedAt}'
# Expected: status = "live"

# 4. Fly app + machines
FLY_TOKEN="<FLY_API_TOKEN from Render env vars>"
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers" | jq '{status: .status}'
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers/machines" \
  | jq '[.[] | {id: .id, state: .state, name: .name}]'

# 5. Recent tasks in cloud DB
psql "$CLOUD_DB" -c "SELECT id, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 5;"
```

---

## Section 6: Caveats

**Delivery log not served by SSE endpoint**

`GET /admin/tenants/:tenantId/tasks/:id/logs` (and the dashboard log viewer) serves ONLY the execution log (`/tmp/employee-{taskId8}.log`). The delivery log (`/tmp/employee-delivery-{taskId8}.log`) is NOT served. To read delivery logs locally: `docker logs employee-delivery-${TASK_ID:0:8}` or `cat /tmp/employee-delivery-${TASK_ID:0:8}.log`. In production: Fly Machines REST API.

**`/tmp` log files exist only in local Docker mode**

When `WORKER_RUNTIME=fly` (production), there are no `/tmp/employee-*.log` files anywhere. Worker logs come exclusively from the Fly Machines REST API. The SSE viewer and dashboard log viewer are also unavailable in production.

**`LOG_LEVEL=debug` required for poll logs**

`Polling for completion` (execution poll loop in `execute.ts`) and `Polling delivery for completion` (delivery poll loop in `delivery-retry.ts`) are both `debug` level. The default log level is `info`, so these messages are suppressed in normal operation. To see them: restart the gateway with `LOG_LEVEL=debug` (local) or set it as a Render env var and redeploy (production).

**Inngest step memoization**

Inngest replays step functions from memoized results on retry or resume. Per-poll debug logs appear once per step execution, not once per Inngest replay. If you see fewer poll log entries than expected, this is expected behavior — not a logging bug.

**`createTaskAndDispatch` is orphaned dead code**

`src/inngest/lib/create-task-and-dispatch.ts` (`createTaskAndDispatch`) has no live callers. The real dispatch path is `src/gateway/services/employee-dispatcher.ts` (`dispatchEmployee` / `dispatchEmployeeById`). Any log messages in `createTaskAndDispatch` will never emit at runtime. Do not trace the dispatch step through this file.

**PG17 client for production psql**

Production runs PostgreSQL 17.6. The default Homebrew `psql` may be 15.x and will error on connection. Use the versioned binary:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$CLOUD_DB" -c "SELECT version();"
# Install if missing: brew install postgresql@17
```

---

## Section 7: Cross-Links

Load these skills for the referenced topics — don't duplicate their content here.

| Topic                                                                                                                | Skill                   |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| All 13 lifecycle states, auto-pass vs blocking, watchdog behavior, approval flow debugging, manual approval fallback | `debugging-lifecycle`   |
| Render API command reference, deploy management, env-var PUT gotcha, known Render quirks                             | `production-ops`        |
| Triggering employees for testing, single-gateway pre-flight, Slack UX scenarios                                      | `e2e-testing`           |
| PostgREST-vs-psql distinction, zero-rows-is-failure rule, dashboard real-data verification                           | `feature-verification`  |
| tmux patterns for long-running dev commands, session cleanup rules                                                   | `long-running-commands` |
