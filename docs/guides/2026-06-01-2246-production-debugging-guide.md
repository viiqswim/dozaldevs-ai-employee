# Production Debugging Guide

> **AGENTS.md rule**: Load this guide before debugging any production task. Update it immediately if you discover new failure modes, gotchas, or commands that are not already documented here.

## Production Topology

| Component         | Where          | URL / Identifier                                    |
| ----------------- | -------------- | --------------------------------------------------- |
| Gateway           | Render         | `https://ai-employees-laaa.onrender.com`            |
| Database          | Supabase Cloud | project ref `gjqrysxpvktmibpkwrvy`                  |
| PostgREST         | Supabase Cloud | `https://gjqrysxpvktmibpkwrvy.supabase.co/rest/v1`  |
| Inngest           | Inngest Cloud  | `https://inn.gs`                                    |
| Workers           | Fly.io         | app `ai-employee-workers`                           |
| Render service ID | —              | `srv-d8f1b2gg4nts738dj7jg`                          |
| Render API key    | `.env`         | `RENDER_API_KEY`                                    |
| Fly API token     | Render env     | `FLY_API_TOKEN` (available via Render env-vars API) |

**Critical**: Production tasks run in Supabase Cloud, **not** local Docker. Checking `localhost:54322` will return 0 rows for production tasks. Always use the Supabase Cloud pooler.

---

## DB Connection (Production)

Use the **session pooler (port 5432)** for all queries. The transaction pooler (port 6543) has a `search_path` issue that causes `relation "tenants" does not exist` errors.

```bash
# Cloud DB — always use port 5432
CLOUD_DB="postgresql://postgres.gjqrysxpvktmibpkwrvy:WFDMjafHkv7Kyju-QbY9@aws-1-us-west-2.pooler.supabase.com:5432/postgres"

# Check task status
psql "$CLOUD_DB" -c "SELECT status, failure_reason, updated_at FROM tasks WHERE id = '<TASK_ID>';"

# Full lifecycle trace
psql "$CLOUD_DB" -c "SELECT from_status, to_status, actor, created_at FROM task_status_log WHERE task_id = '<TASK_ID>' ORDER BY created_at;"

# Execution token usage
psql "$CLOUD_DB" -c "SELECT prompt_tokens, completion_tokens, estimated_cost_usd FROM executions WHERE task_id = '<TASK_ID>';"

# Cross-table row counts (verify migration or data health)
psql "$CLOUD_DB" -c "SELECT 'tenants' as t, COUNT(*) FROM tenants UNION ALL SELECT 'archetypes', COUNT(*) FROM archetypes UNION ALL SELECT 'tasks', COUNT(*) FROM tasks;"
```

**Known gotcha**: `pg_stat_user_tables.n_live_tup` is stale — always use `COUNT(*)` for accurate row counts.

---

## DB Connection Topology Gotcha (IPv6 vs IPv4)

`DATABASE_URL_DIRECT` on Render points to `db.gjqrysxpvktmibpkwrvy.supabase.co:5432` — the **IPv6-only direct host**. This resolves fine inside Render's infrastructure but is not routable from a typical local machine (most home/office networks don't route IPv6 to Supabase's direct host).

**Use the session pooler for local psql and migrations:**

```bash
# Session pooler — IPv4, reachable from local machines
PROD_5432="postgresql://postgres.gjqrysxpvktmibpkwrvy:<password>@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
psql "$PROD_5432" -c "SELECT COUNT(*) FROM tasks;"
```

**Port rules:**

| Port | Endpoint                                                   | Use for                                                 |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------- |
| 5432 | `aws-1-us-west-2.pooler.supabase.com` (session pooler)     | Local psql queries, migrations, pg_dump                 |
| 6543 | `aws-1-us-west-2.pooler.supabase.com` (transaction pooler) | App `DATABASE_URL` (with `?pgbouncer=true`)             |
| 5432 | `db.gjqrysxpvktmibpkwrvy.supabase.co` (direct host)        | Render-side migrations only — IPv6, not local-reachable |

**PG17 client requirement**: Prod runs PostgreSQL 17.6. The default Homebrew `psql`/`pg_dump` may be 15.x (too old — will error on connection). Use the versioned binaries:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$PROD_5432" -c "SELECT version();"
/opt/homebrew/opt/postgresql@17/bin/pg_dump "$PROD_5432" --format=plain > backup.sql
```

Install if missing: `brew install postgresql@17`

---

## Migration Drift — Dashboard 500s (P2022)

**Symptom**: Dashboard reads return `INTERNAL_ERROR` for `/tasks`, `/employee-rules`, `/task-metrics`. The gateway logs flood with Prisma errors every ~5 seconds (dashboard polling interval). The error is masked in the API response — you won't see `P2022` in the browser, only in Render logs.

**Root cause**: A Prisma migration was applied locally but never deployed to production. The gateway queries a column (e.g. `deleted_at`) that doesn't exist in the prod DB schema.

**Diagnostic queries:**

```bash
# Check which migrations are missing from prod
comm -23 <(ls -1 prisma/migrations | grep -v migration_lock | sort) \
  <(psql "$PROD_5432" -t -A -c "SELECT migration_name FROM _prisma_migrations;" | sort)

# Confirm a specific column is absent
psql "$PROD_5432" -t -A -c "SELECT table_name FROM information_schema.columns WHERE column_name='deleted_at' AND table_name IN ('tasks','task_metrics','employee_rules','feedback_events','pending_approvals','executions') ORDER BY 1;"

# Check for P2022 errors in Render logs
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/logs?ownerId=tea-d1uscc3uibrs738pu040&resource=$RENDER_SERVICE_ID&limit=200&level=error" \
  | jq -r '.logs[]?.message // .[]?.message // .' 2>/dev/null | grep "does not exist"
```

**P2022 grep gotcha**: Prisma's actual error text wraps the column name in backticks: ``The column `tasks.deleted_at` does not exist``. A bare `deleted_at does not exist` grep may miss it because the backtick before "does" breaks the match. Use `does not exist` as the grep pattern, or filter Render logs by `startTime` to narrow the window.

**Fix**: Apply the missing migration(s) — see "How to Apply a Missing Migration" below.

---

## How to Apply a Missing Migration

**Always back up first:**

```bash
TS=$(date "+%Y-%m-%d-%H%M")
mkdir -p "database-backups/$TS"
/opt/homebrew/opt/postgresql@17/bin/pg_dump "$PROD_5432" --format=plain > "database-backups/$TS/full-dump.sql"
echo "Backup: database-backups/$TS/full-dump.sql"
```

**Preferred path — Render one-off job:**

If your Render plan supports Jobs, trigger a one-off job that runs `pnpm prisma migrate deploy`. The job runs inside Render's network where the IPv6 direct host (`DATABASE_URL_DIRECT`) resolves correctly.

```bash
# Trigger a one-off job (requires Render Jobs API access)
curl -s -X POST "https://api.render.com/v1/services/$RENDER_SERVICE_ID/jobs" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"startCommand": "pnpm prisma migrate deploy"}' | jq .
```

**Fallback — apply raw SQL via session pooler:**

If the Jobs API is unavailable (plan restriction), apply the migration SQL directly and record it in `_prisma_migrations`:

```bash
# 1. Apply the migration SQL
psql "$PROD_5432" < prisma/migrations/<migration_name>/migration.sql

# 2. Get the checksum (sha256 of the migration file)
shasum -a 256 prisma/migrations/<migration_name>/migration.sql

# 3. Insert the migration record (replace checksum and name)
psql "$PROD_5432" -c "
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid(),
  '<sha256-checksum-from-step-2>',
  NOW(),
  '<migration_name>',
  NULL,
  NULL,
  NOW(),
  1
);"
```

**Verify the migration landed:**

```bash
psql "$PROD_5432" -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

**Rules:**

- Never use `prisma migrate dev`, `db push`, or `migrate reset` against production
- Never apply migrations without a backup
- After applying, trigger a Render redeploy to confirm the gateway starts cleanly

---

## Admin API (Production)

```bash
source .env  # loads SERVICE_TOKEN

# Check task status
curl -s -H "Authorization: Bearer $SERVICE_TOKEN" \
  "https://ai-employees-laaa.onrender.com/admin/tenants/<tenantId>/tasks/<taskId>" | jq .

# Trigger an employee
curl -s -X POST -H "Authorization: Bearer $SERVICE_TOKEN" \
  "https://ai-employees-laaa.onrender.com/admin/tenants/<tenantId>/employees/<slug>/trigger" \
  -H "Content-Type: application/json" -d '{}' | jq .

# Verify SUPABASE_URL is set correctly (gateway uses it for /api/config.js)
curl -s https://ai-employees-laaa.onrender.com/api/config.js
# Expected: VITE_POSTGREST_URL should be "https://gjqrysxpvktmibpkwrvy.supabase.co/rest/v1"
# If empty: SUPABASE_URL is not set on Render
```

---

## Render: Checking and Managing Env Vars

```bash
RENDER_API_KEY="rnd_0XF5Yo08XVffYVQReUx0VisS1xSp"
RENDER_SERVICE_ID="srv-d8f1b2gg4nts738dj7jg"

# List all env vars (WARNING: only returns vars set via API — not dashboard-set vars)
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars" | jq '[.[] | {key: .envVar.key}]'

# Check latest deploy status
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" | jq '.[0] | {id: .deploy.id, status: .deploy.status}'

# Trigger a new deploy
curl -s -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" -d '{"clearCache":"do_not_clear"}' | jq '{id: .id, status: .status}'
```

**Critical gotcha**: `PUT /env-vars` **replaces ALL env vars**. SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_ANON_KEY, INNGEST_EVENT_KEY, and INNGEST_SIGNING_KEY are set via the Render **dashboard** (not API) and will **not appear** in the `GET /env-vars` response. Never use `PUT /env-vars` without first verifying you have the complete list — it will silently wipe any dashboard-set vars.

**Verifying SUPABASE_URL without the API**: Hit `/api/config.js` — if `VITE_POSTGREST_URL` is non-empty, SUPABASE_URL is set correctly.

---

## Fly.io: Inspecting Worker Machines

`flyctl` requires `fly auth login` interactively — use the Machines REST API directly with the `FLY_API_TOKEN` from Render's env vars.

```bash
FLY_TOKEN="<FLY_API_TOKEN from Render env vars>"

# List all machines (any state)
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers/machines" \
  | jq '[.[] | {id: .id, name: .name, state: .state, created_at: .created_at, updated_at: .updated_at}]'

# Check app status
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers" \
  | jq '{name: .name, status: .status}'

# Get machine details + recent events (useful for crash diagnosis)
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers/machines/<MACHINE_ID>" \
  | jq '{state: .state, image: .image_ref.digest, events: [.events[-5:] | .[] | {type: .type, status: .status, timestamp: .timestamp}]}'

# Destroy a machine (use force=true if stuck)
curl -s -X DELETE -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers/machines/<MACHINE_ID>?force=true"
```

**Diagnosing dispatch loop** — if a task has multiple `Ready → Executing` entries in `task_status_log` all from `lifecycle_fn`, the Inngest `executing` step is failing and retrying. Backoff gaps between entries confirm this pattern:

| # of Ready→Executing entries | Meaning                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| 1                            | Normal — worker dispatched once                                            |
| 2–5                          | Inngest retry loop — `executing` step is crashing                          |
| 5 (no more)                  | Inngest exhausted default retries — task is permanently stuck at Executing |

When this happens, **no Fly machine will be created**. The DB shows `Executing` but the machine list is empty (only old stopped machines exist). The task must be manually re-triggered after fixing the root cause.

**App suspended status**: The Fly app may show `status: "suspended"` when all machines are stopped. This does NOT prevent new machine creation via the API — it's a cosmetic status.

---

## Diagnosing the Inngest Retry Loop

The canonical pattern for a crashing `executing` step:

```sql
-- In task_status_log:
Ready → Executing  (03:28:30)   ← attempt 1
Ready → Executing  (03:29:00)   ← attempt 2, ~30s backoff
Ready → Executing  (03:29:51)   ← attempt 3, ~51s backoff
Ready → Executing  (03:31:02)   ← attempt 4, ~71s backoff
Ready → Executing  (03:33:08)   ← attempt 5, ~126s backoff
-- No more entries — Inngest exhausted 5 attempts (default max)
-- Task stuck at Executing, no Fly machine was ever created
```

**Root cause pinpointing**: Look at what the step does BEFORE `createMachine`. If it throws before the machine creation call, no machine appears in Fly.

**Default Inngest retry count**: 4 retries (5 total attempts). No `maxAttempt` override in `createEmployeeLifecycleFunction` — the default applies.

---

## Known Production Bugs and Fixes

### Bug 1: TUNNEL_URL required for Fly workers (FIXED — 2026-06-02)

**Symptom**: `Ready → Executing` repeated 5× in `task_status_log`, no Fly machines created.

**Root cause**: `src/inngest/employee-lifecycle.ts` line ~407:

```typescript
// BUG (before fix):
const effectiveSupabaseUrl =
  process.env.WORKER_RUNTIME === 'fly' ? await getTunnelUrl() : supabaseUrl;
```

`getTunnelUrl()` throws if `TUNNEL_URL` is not set. In production (cloud Supabase + Fly workers), no tunnel is needed — `supabaseUrl` is already a cloud URL. But the code unconditionally called `getTunnelUrl()` for any Fly worker deployment.

**Fix (deployed 2026-06-02, commit `0b342742`)**:

```typescript
// FIXED:
const effectiveSupabaseUrl =
  process.env.WORKER_RUNTIME === 'fly' && process.env.TUNNEL_URL
    ? await getTunnelUrl()
    : supabaseUrl;
```

**Rule**: `TUNNEL_URL` is only needed in **hybrid mode** (local Supabase + Fly workers). In full cloud mode (Supabase Cloud + Fly workers), `TUNNEL_URL` should NOT be set and `supabaseUrl` is passed directly to the worker.

---

### Bug 2: Transaction pooler search_path issue (KNOWN)

**Symptom**: `ERROR: relation "tenants" does not exist` when querying via port 6543.

**Cause**: Transaction pooler (port 6543) uses a different `search_path` and may not resolve `public` schema correctly.

**Fix**: Always use the **session pooler (port 5432)** for direct psql queries. Port 6543 is for app connections with proper connection string settings.

---

### Bug 3: Fly worker OOM-killed on shared-cpu-1x — OpenCode needs performance-1x (FIXED 2026-06-02)

**Symptom**: Machine starts (visible in Fly), `OpenCode harness starting` appears in logs, then ~45 seconds later:

```
[44.992735] Out of memory: Killed process 665 (.opencode) total-vm:74055836kB, anon-rss:119868kB
[opencode-server] opencode serve exited with code 0
[opencode-harness] Failed to start OpenCode server
Process appears to have been OOM killed!
```

Task fails with 0 tokens in `executions`. Two `machine` failure entries in `task_status_log` (Fly auto-restarts once, fails again).

**Root cause**: The Go-based OpenCode binary reserves ~74GB **virtual** memory at startup (normal Go runtime behavior). On `shared-cpu-1x` Fly machines (256MB RAM, very low VM limits), the OOM killer triggers during health check startup — before any LLM call is made.

**Fix**: Set `vm_size: 'performance-1x'` on the archetype (1 dedicated CPU, 2GB RAM). This gives enough memory headroom for OpenCode's virtual address space reservation.

```sql
-- Fix in cloud DB:
UPDATE archetypes SET vm_size = 'performance-1x' WHERE role_name = 'cleaning-schedule';
```

**Rule**: Any archetype that uses the `opencode` runtime MUST have `vm_size = 'performance-1x'` (or larger) set. `shared-cpu-1x` (256MB) will always OOM-kill OpenCode.

**Verification**: After setting vm_size, a new Fly machine appears with `"cpu_kind":"performance","memory_mb":2048` instead of `"cpu_kind":"shared","memory_mb":256`. OpenCode starts without OOM, and you see `service=llm ... stream` in the logs.

---

### Bug 5: Prisma 42P05 "prepared statement already exists" — pooler without pgbouncer=true (FIXED 2026-06-07)

**Symptom**: Gateway crash-loops at boot with:

```
PrismaClientUnknownRequestError
Invalid `prisma.platformSetting.findMany()` invocation:
ConnectorError ... PostgresError { code: "42P05", message: "prepared statement \"s0\" already exists" }
  at validateRequiredPlatformSettings (dist/lib/platform-settings.js)
  at dist/gateway/server.js
==> Exited with status 1
```

This is **intermittent** — a previous deploy running the exact same query at boot may succeed if it happens to get a fresh backend connection. That makes it a latent infra bug, not a code bug. It can appear after any deploy that touches gateway startup.

**Cause**: `DATABASE_URL` pointed at the Supabase transaction pooler (port 6543) without the `?pgbouncer=true` query param. Prisma uses prepared statements by default. PgBouncer in transaction-pooling mode reuses backend connections across clients, so a connection that already has prepared statement `s0` registered collides with the next client that tries to create it, producing `42P05`.

**Fix**: Append `?pgbouncer=true` to `DATABASE_URL` in Render. Leave `DATABASE_URL_DIRECT` (port 5432, direct connection) unchanged — it's used for migrations and must NOT have the param.

```bash
# Update DATABASE_URL via single-var PUT (does NOT wipe other vars)
curl -s -X PUT "https://api.render.com/v1/services/srv-d8f1b2gg4nts738dj7jg/env-vars/DATABASE_URL" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value":"postgresql://postgres.gjqrysxpvktmibpkwrvy:***@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true"}'

# Verify the change landed — ALWAYS use ?limit=100 (default page is ~20 and hides keys)
curl -s "https://api.render.com/v1/services/srv-d8f1b2gg4nts738dj7jg/env-vars?limit=100" \
  -H "Authorization: Bearer $RENDER_API_KEY" | jq '[.[] | {key: .envVar.key}]'

# Trigger a redeploy
curl -s -X POST "https://api.render.com/v1/services/srv-d8f1b2gg4nts738dj7jg/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache":"do_not_clear"}' | jq '{id: .id, status: .status}'
```

**Verification**: After the redeploy, `/health` returns `{"status":"ok"}`, no FATAL lines in logs, and both `/admin/model-catalog` and `/admin/platform-settings` return 200.

**Pagination gotcha**: The `GET /env-vars` endpoint returns ~20 vars by default. Without `?limit=100`, keys like `DATABASE_URL` can appear missing even when they're set. Always use `?limit=100` when verifying env vars via the API.

**Note on autoDeploy**: Render has `autoDeploy=yes` — merging to `main` triggers a deploy automatically. After fixing the env var, a manual redeploy (above) is still needed to pick up the change without waiting for the next merge.

---

### Bug 4: Render API doesn't return dashboard-set env vars (KNOWN)

**Symptom**: `GET /env-vars` returns only ~20 vars. SUPABASE_URL, SUPABASE_SECRET_KEY, INNGEST_EVENT_KEY etc. appear missing.

**Reality**: These vars ARE set — via the Render dashboard (not API). The API only returns vars set via the API itself.

**Rule**: Never infer a var is missing just because it's absent from `GET /env-vars`. Verify via `/api/config.js` for SUPABASE_URL, or trigger a task and check if early lifecycle transitions appear (confirms SUPABASE_URL is working).

---

## Re-Triggering a Stuck Task

If a task is permanently stuck at `Executing` (Inngest retries exhausted, no Fly machine created):

```bash
source .env
TENANT_ID="00000000-0000-0000-0000-000000000003"
SLUG="cleaning-schedule"

curl -s -X POST \
  "https://ai-employees-laaa.onrender.com/admin/tenants/$TENANT_ID/employees/$SLUG/trigger" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"date":"YYYY-MM-DD"}}' | jq '{task_id: .task_id, status_url: .status_url}'
```

The old stuck task will remain at `Executing` indefinitely (no watchdog cleans non-Reviewing tasks). It can be ignored — it has no effect on new tasks.

---

## Full Production Health Check (Run First for Any Issue)

```bash
# 1. Gateway health
curl -s https://ai-employees-laaa.onrender.com/health | jq .
# Expected: {"status":"ok"}

# 2. Verify SUPABASE_URL is set
curl -s https://ai-employees-laaa.onrender.com/api/config.js
# Expected: VITE_POSTGREST_URL non-empty

# 3. Latest Render deploy
RENDER_API_KEY="rnd_0XF5Yo08XVffYVQReUx0VisS1xSp"
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/srv-d8f1b2gg4nts738dj7jg/deploys?limit=1" \
  | jq '.[0] | {status: .deploy.status, updated_at: .deploy.updatedAt}'
# Expected: status = "live"

# 4. Fly app status + machines
FLY_TOKEN="<from Render env vars FLY_API_TOKEN>"
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers" | jq '{status: .status}'
curl -s -H "Authorization: Bearer $FLY_TOKEN" \
  "https://api.machines.dev/v1/apps/ai-employee-workers/machines" \
  | jq '[.[] | {id: .id, state: .state, name: .name}]'
# Expected after a triggered task: new machine with state "started" or "running"

# 5. Cloud DB recent tasks
psql "postgresql://postgres.gjqrysxpvktmibpkwrvy:WFDMjafHkv7Kyju-QbY9@aws-1-us-west-2.pooler.supabase.com:5432/postgres" \
  -c "SELECT id, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 5;"
```
