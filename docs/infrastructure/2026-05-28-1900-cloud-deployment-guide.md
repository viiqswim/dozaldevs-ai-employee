# Cloud Deployment Guide

This guide documents the complete production deployment of the AI Employee Platform. It's written from the actual deployment experience, including every foot-gun encountered. Someone following this guide from scratch should be able to replicate the full production setup.

---

## 1. Architecture Overview

| Component                                  | Service            | Monthly Cost           | Why This Service                                                    |
| ------------------------------------------ | ------------------ | ---------------------- | ------------------------------------------------------------------- |
| Express gateway + Slack bot + Inngest host | Render Starter     | $7/mo                  | Persistent process, 100-min HTTP timeout, good for Socket Mode      |
| PostgreSQL + PostgREST                     | Supabase Cloud Pro | $25/mo                 | Only managed service that bundles PostgREST (mandatory for workers) |
| AI worker containers                       | Fly.io Machines    | ~$5-15/mo              | Pay-per-use, ~$0.002/run                                            |
| Workflow orchestration                     | Inngest Cloud      | $0 (50K steps/mo free) | Durable execution, no self-hosting needed                           |
| CI/CD                                      | GitHub Actions     | $0                     | Auto-deploy on push to main                                         |

**Key topology notes:**

- The gateway serves the dashboard at `/dashboard/` as pre-built static files baked into the Docker image at build time. No separate frontend deploy is needed. Production URL: `https://{render-url}/dashboard/`
- The four dashboard config values (`VITE_POSTGREST_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GATEWAY_URL`, `VITE_INNGEST_URL`) are injected at runtime via `GET /api/config.js` — no Docker build args needed. The gateway serves this endpoint using its own runtime env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GATEWAY_PUBLIC_URL`), so the dashboard always reflects the current config without a rebuild.
- PostgREST is at `https://{ref}.supabase.co/rest/v1/` in cloud (same pattern as local `localhost:54331/rest/v1/`).
- Workers get `SUPABASE_URL` injected at machine creation time by `employee-lifecycle.ts`. Set this in Render env vars so it flows through.
- Fly.io worker image must be built with `--platform linux/amd64` before pushing to the registry.

---

## 2. Prerequisites

**CLIs required:**

- `fly` — authenticated via `fly auth login`
- `docker` — with buildx support for cross-platform builds
- `psql` — for running migrations and schema cache reloads
- `curl` + `jq` — for API calls and response inspection

**Accounts required:**

- [Supabase](https://supabase.com) — database + PostgREST
- [Render](https://render.com) — gateway hosting, connected to your GitHub repo
- [Inngest Cloud](https://app.inngest.com) — workflow orchestration
- [Fly.io](https://fly.io) — worker container runtime
- GitHub — repo with Actions enabled

---

## 3. Supabase Cloud Setup

### 3.1 Create the Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Choose a region close to your Render deployment region (e.g. `us-west-2` for Render Ohio).
3. Wait for provisioning to finish (about 2 minutes).
4. Collect credentials from **Project Settings > API**:
   - **Project URL** (`https://{ref}.supabase.co`) — this is your `SUPABASE_URL`
   - **anon public** key — this is your `SUPABASE_ANON_KEY`
   - **service_role** key — this is your `SUPABASE_SECRET_KEY`

### 3.2 Connection Strings

Three distinct connection URLs exist, each for a different purpose. Using the wrong one for the wrong task causes hard-to-diagnose failures.

**Transaction pooler (port 6543)** — use for runtime gateway connections (`DATABASE_URL`):

```
postgresql://postgres.{ref}:{pw}@aws-1-{region}.pooler.supabase.com:6543/postgres
```

**Session pooler (port 5432)** — use for Prisma migrations and seeding:

```
postgresql://postgres.{ref}:{pw}@aws-1-{region}.pooler.supabase.com:5432/postgres
```

The transaction pooler (port 6543) uses pgbouncer in transaction mode, which doesn't support prepared statements. Prisma's migration engine uses prepared statements and will fail with `"prepared statement already exists"` if you use port 6543 for migrations.

**Direct connection** — use for `DATABASE_URL_DIRECT` (Render and CI only):

```
postgresql://postgres:{pw}@db.{ref}.supabase.co:5432/postgres
```

The direct connection is IPv6-only. It's unreachable from a local Mac but works fine from Render and GitHub Actions.

### 3.3 Running Migrations

Always use the session pooler URL (port 5432) for migrations, not the transaction pooler (port 6543):

```bash
DATABASE_URL="postgresql://postgres.{ref}:{pw}@aws-1-{region}.pooler.supabase.com:5432/postgres" \
  npx prisma migrate deploy
```

### 3.4 Reload PostgREST Schema Cache

After every migration that adds or removes tables, PostgREST needs to reload its schema cache. Without this, workers will get `PGRST205 "Could not find the table in the schema cache"` errors even though the table exists in PostgreSQL.

```bash
psql "postgresql://postgres.{ref}:{pw}@aws-1-{region}.pooler.supabase.com:5432/postgres" \
  -c "NOTIFY pgrst, 'reload schema';"
```

### 3.5 Verify PostgREST Sees the Tables

```bash
curl -s "https://{ref}.supabase.co/rest/v1/tasks?limit=1" \
  -H "apikey: {anon_key}" \
  -H "Authorization: Bearer {anon_key}"
# Expected: [] (empty array)
# NOT expected: {"code":"PGRST205","message":"Could not find the table in the schema cache"}
```

### 3.6 Seeding

Use the session pooler URL for seeding too. The direct connection is IPv6-only and unreachable locally:

```bash
DATABASE_URL="postgresql://postgres.{ref}:{pw}@aws-1-{region}.pooler.supabase.com:5432/postgres" \
  npx prisma db seed
```

### 3.7 API Key Format

New Supabase projects use `sb_publishable_*` (anon) and `sb_secret_*` (service*role) instead of the old JWT format. Both formats work with PostgREST Bearer token auth. If you see a JWT-format key in older docs, the `sb*\*` format is the current equivalent.

---

## 3.8 Security: Row Level Security (RLS)

### Vulnerability discovered (post-deployment)

When Supabase Cloud is provisioned and `prisma migrate deploy` runs, Prisma's migration engine grants the `anon` role full CRUD privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE) on all tables by default. No Row Level Security is enabled.

The anon key (`sb_publishable_*`) is intentionally public. Supabase exposes it via the `/api/config.js` endpoint so the dashboard can make PostgREST calls from the browser. That's by design.

The problem: with no RLS in place, anyone who loaded the dashboard or fetched `/api/config.js` had the anon key and could read or write every table, including `tenant_secrets`, which stores encrypted API credentials for all tenants.

The `tenant_secrets` ciphertext was readable via the anon key. The values were protected at rest by AES-256-GCM encryption using the `ENCRYPTION_KEY` stored only in Render's runtime environment, so an attacker couldn't decrypt them without that key. But the exposure was still a serious misconfiguration.

### How it was discovered

Discovered on 2026-06-02 by confirming that a `curl` to PostgREST using the public anon key returned rows from `tenant_secrets`:

```bash
curl "https://{ref}.supabase.co/rest/v1/tenant_secrets?limit=1" \
  -H "apikey: {anon_key}" \
  -H "Authorization: Bearer {anon_key}"
# Returned: encrypted rows — readable, not blocked
```

### Remediation applied (migration `20260601214116_add_rls_policies`)

The migration applied four changes in sequence:

1. Revoked INSERT, UPDATE, DELETE, TRUNCATE from `anon` on all tables in the `public` schema
2. Revoked SELECT on `tenant_secrets` and `_prisma_migrations` from `anon`
3. Enabled RLS on all 27 tables
4. Created `anon_select` policies (`SELECT USING (true)`) on 25 non-sensitive tables; left `tenant_secrets` and `_prisma_migrations` with no policy, which completely blocks `anon` access

Verification after applying the migration:

```
tenant_secrets SELECT  → {"code":"42501","message":"permission denied for table tenant_secrets"}  ✅
tasks SELECT           → [] (readable)  ✅
tasks INSERT           → {"code":"42501","message":"permission denied for table tasks"}  ✅
tasks DELETE           → {"code":"42501","message":"permission denied for table tasks"}  ✅
RLS enabled            → 27/27 tables  ✅
```

The `service_role` key (used by the gateway and workers) has `BYPASSRLS=true` and is unaffected by all of the above.

### For new deployments — apply RLS immediately after migration

> **⚠️ MANDATORY — Apply after every fresh `prisma migrate deploy`**
>
> Prisma migrations grant broad privileges to `anon` by default. The RLS migration must run as part of every fresh deployment. Since it's already in `prisma/migrations/`, running `prisma migrate deploy` on a fresh database will apply it automatically as part of the migration sequence.
>
> After any fresh deployment, verify both checks pass before going live:
>
> ```bash
> # Must return 42501 — never actual rows
> curl "https://{ref}.supabase.co/rest/v1/tenant_secrets?limit=1" \
>   -H "apikey: {anon_key}" -H "Authorization: Bearer {anon_key}"
>
> # Must return 27/27
> psql "{session-pooler-url}" -c \
>   "SELECT count(*) as rls_on FROM pg_tables WHERE schemaname='public' AND rowsecurity=true;"
> ```
>
> If either check fails, the RLS migration did not apply. Re-run `prisma migrate deploy` and check for errors.

### Current security posture

| Table group                                       | anon SELECT     | anon writes     | Notes                                  |
| ------------------------------------------------- | --------------- | --------------- | -------------------------------------- |
| 25 non-sensitive tables (tasks, archetypes, etc.) | Allowed         | Blocked (42501) | Dashboard reads these                  |
| `tenant_secrets`                                  | Blocked (42501) | Blocked (42501) | Encrypted credentials                  |
| `_prisma_migrations`                              | Blocked (42501) | Blocked (42501) | Internal metadata                      |
| All tables via `service_role`                     | Full access     | Full access     | BYPASSRLS — gateway/workers unaffected |

---

## 4. Inngest Cloud Setup

1. Sign up at [app.inngest.com](https://app.inngest.com) and create a new app.
2. Go to **Manage > Keys** and collect:
   - **Event Key** — this is your `INNGEST_EVENT_KEY`
   - **Signing Key** — this is your `INNGEST_SIGNING_KEY`
3. Set `INNGEST_DEV=""` (empty or absent) in production. This tells the SDK to use Inngest Cloud instead of the local dev server.
4. Do NOT set `INNGEST_BASE_URL` in Render env vars. The gateway doesn't need it. Workers get it injected separately.
5. After the gateway is live, register the app: go to **app.inngest.com > Apps > Sync** and enter `https://{render-url}/api/inngest`.

Verify registration worked:

```bash
curl https://{render-url}/api/inngest
# Expected: JSON with a list of 5 registered functions
```

---

## 5. Fly.io Worker Setup

### 5.1 Create the App

```bash
fly apps create ai-employee-workers
```

### 5.2 Build and Push the Worker Image

The worker image must be built for `linux/amd64` regardless of your local machine architecture:

```bash
fly auth docker
docker buildx build --platform linux/amd64 -t registry.fly.io/ai-employee-workers:latest --push .
```

Note: this builds using the root `Dockerfile` (the OpenCode worker image), not `Dockerfile.gateway`.

### 5.3 Set Worker Secrets

Worker secrets are injected into Fly.io machines at runtime. Set them via the CLI, not as env vars:

```bash
fly secrets set -a ai-employee-workers \
  OPENROUTER_API_KEY="{your-key}" \
  SUPABASE_URL="https://{ref}.supabase.co" \
  SUPABASE_SECRET_KEY="sb_secret_{...}"
```

Verify:

```bash
fly secrets list -a ai-employee-workers
```

---

## 6. Render Gateway Setup

### 6.1 Critical: render.yaml Is NOT Authoritative

The service was created manually via the Render dashboard UI, not via Blueprint/IaC. Any settings in `render.yaml` (dockerfilePath, healthCheckPath, envVars) must be applied manually via the Render API or dashboard. Changes to `render.yaml` alone have no effect on the running service.

### 6.2 Create the Service

1. Go to render.com > **New Web Service** > connect your GitHub repo.
2. Choose **Docker** runtime.
3. Choose the **Starter** plan ($7/mo) for a persistent process (required for Slack Socket Mode).

### 6.3 Set the Correct Dockerfile

After creation, the Render dashboard defaults to `./Dockerfile` (the OpenCode worker image). The gateway needs `./Dockerfile.gateway`. Update it via the API:

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer {render_api_key}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/{service_id}" \
  -d '{"serviceDetails": {"envSpecificDetails": {"dockerfilePath": "./Dockerfile.gateway"}}}' \
  | jq '.serviceDetails.envSpecificDetails.dockerfilePath'
# Expected: "./Dockerfile.gateway"
```

### 6.4 Set the Health Check Path

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer {render_api_key}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/{service_id}" \
  -d '{"serviceDetails": {"healthCheckPath": "/health"}}'
```

### 6.5 Dashboard Config (Runtime — no action needed)

The dashboard receives its config at runtime via `GET /api/config.js`. The gateway derives all four values from its own runtime env vars — no Docker build arguments are needed.

> **How dashboard config works**: The gateway serves `GET /api/config.js` using its runtime environment variables. `dashboard/index.html` loads this script synchronously before React mounts, which sets `window.__RUNTIME_CONFIG__`. `constants.ts` reads from this object first, then falls back to `import.meta.env.VITE_*`, then to localhost defaults. This means you never need to rebuild the Docker image to change dashboard config — just update the Render env vars and restart.

The four dashboard values are derived automatically:

| Dashboard value          | Derived from                                          |
| ------------------------ | ----------------------------------------------------- |
| `VITE_POSTGREST_URL`     | `SUPABASE_URL` + `/rest/v1` (set in Section 6.6)      |
| `VITE_SUPABASE_ANON_KEY` | `SUPABASE_ANON_KEY` (set in Section 6.6)              |
| `VITE_GATEWAY_URL`       | `GATEWAY_PUBLIC_URL` (set in Section 6.6)             |
| `VITE_INNGEST_URL`       | Hardcoded to `https://inn.gs` in the gateway endpoint |

No separate configuration is needed as long as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GATEWAY_PUBLIC_URL` are set as runtime env vars (which they are in Section 6.6).

### 6.6 Set Environment Variables

**WARNING: `PUT /env-vars` replaces the ENTIRE list.** Always include all variables when calling this endpoint, or you will wipe existing secrets.

Set all env vars in one call:

```bash
curl -s -X PUT \
  -H "Authorization: Bearer {render_api_key}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/{service_id}/env-vars" \
  -d '[
    {"key": "NODE_ENV", "value": "production"},
    {"key": "WORKER_RUNTIME", "value": "fly"},
    {"key": "DATABASE_URL", "value": "postgresql://postgres.{ref}:{pw}@aws-1-{region}.pooler.supabase.com:6543/postgres"},
    {"key": "DATABASE_URL_DIRECT", "value": "postgresql://postgres:{pw}@db.{ref}.supabase.co:5432/postgres"},
    {"key": "SUPABASE_URL", "value": "https://{ref}.supabase.co"},
    {"key": "SUPABASE_SECRET_KEY", "value": "sb_secret_{...}"},
    {"key": "SUPABASE_ANON_KEY", "value": "sb_publishable_{...}"},
    {"key": "ENCRYPTION_KEY", "value": "{64-hex-chars}"},
    {"key": "SERVICE_TOKEN", "value": "{your-key}"},
    {"key": "INNGEST_EVENT_KEY", "value": "{your-key}"},
    {"key": "INNGEST_SIGNING_KEY", "value": "{your-key}"},
    {"key": "GATEWAY_PUBLIC_URL", "value": "https://{render-url}"},
    {"key": "FLY_API_TOKEN", "value": "{your-token}"},
    {"key": "FLY_WORKER_APP", "value": "ai-employee-workers"},
    {"key": "FLY_WORKER_IMAGE", "value": "registry.fly.io/ai-employee-workers:latest"},
    {"key": "WORKER_VM_SIZE", "value": "shared-cpu-1x"},
    {"key": "OPENROUTER_API_KEY", "value": "{your-key}"},
    {"key": "SLACK_SIGNING_SECRET", "value": "{your-secret}"},
    {"key": "SLACK_BOT_TOKEN", "value": "xoxb-{...}"},
    {"key": "SLACK_APP_TOKEN", "value": "xapp-{...}"},
    {"key": "SLACK_CLIENT_ID", "value": "{your-id}"},
    {"key": "SLACK_CLIENT_SECRET", "value": "{your-secret}"},
    {"key": "SLACK_REDIRECT_BASE_URL", "value": "https://{render-url}"},
    {"key": "WEBHOOK_PUBLIC_URL", "value": "https://{render-url}"},
    {"key": "COST_LIMIT_USD_PER_DEPT_PER_DAY", "value": "50"}
  ]'
```

### 6.7 Monitor Deploys via API

Runtime logs (stdout/stderr from the Node.js process) are NOT available via the Render API. They're only visible in the Render dashboard Logs tab. Use the deploy and events APIs for status:

```bash
# Check latest deploy status
curl -s -H "Authorization: Bearer {render_api_key}" \
  "https://api.render.com/v1/services/{service_id}/deploys?limit=1" \
  | jq '.[0].deploy | {status, id}'

# Get deploy events (includes failure reason)
curl -s -H "Authorization: Bearer {render_api_key}" \
  "https://api.render.com/v1/services/{service_id}/events?limit=5" \
  | jq '[.[] | {type: .event.type, details: .event.details}]'

# Trigger a new deploy
curl -s -X POST \
  -H "Authorization: Bearer {render_api_key}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/{service_id}/deploys" \
  -d '{"clearCache":"do_not_clear"}'

# Cancel a running deploy
curl -s -X POST \
  -H "Authorization: Bearer {render_api_key}" \
  "https://api.render.com/v1/services/{service_id}/deploys/{deploy_id}/cancel"
```

To debug startup crashes locally before deploying:

```bash
docker build -f Dockerfile.gateway -t ai-employee-gateway:test .
docker run --rm \
  -e ENCRYPTION_KEY={...} \
  -e SERVICE_TOKEN={...} \
  -e PORT=10000 \
  -p 10000:10000 \
  ai-employee-gateway:test
```

---

## 7. Environment Variable Reference

Set these in Render's environment variable panel. All variables listed here are runtime env vars — no Docker build arguments are required.

### Database

| Variable              | Where to Find                                           | Notes                                       |
| --------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `DATABASE_URL`        | Supabase > Settings > Database > Transaction pooler URI | Port 6543 — for runtime gateway connections |
| `DATABASE_URL_DIRECT` | Supabase > Settings > Database > Direct connection URI  | IPv6 only — for Render and CI migrations    |

### Supabase (PostgREST + Auth)

| Variable              | Where to Find                                | Notes                            |
| --------------------- | -------------------------------------------- | -------------------------------- |
| `SUPABASE_URL`        | Supabase > Settings > API > Project URL      | e.g. `https://{ref}.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase > Settings > API > service_role key | Keep secret — full DB access     |
| `SUPABASE_ANON_KEY`   | Supabase > Settings > API > anon public key  | Safe to expose in frontend       |

### Platform Core

| Variable             | Value / Source          | Notes                                                                                |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `ENCRYPTION_KEY`     | `openssl rand -hex 32`  | 64 hex chars; never change after first deploy — all tenant secrets become unreadable |
| `SERVICE_TOKEN`      | `openssl rand -hex 32`  | Machine-to-machine auth for all `/admin/*` endpoints                                 |
| `PORT`               | `7700`                  | Render sets `PORT` automatically; this is the fallback                               |
| `GATEWAY_PUBLIC_URL` | Your Render service URL | e.g. `https://{render-url}` — required for Inngest Cloud callbacks                   |

### Inngest

| Variable              | Value / Source                | Notes                     |
| --------------------- | ----------------------------- | ------------------------- |
| `INNGEST_DEV`         | `""` (empty or absent)        | Leave empty in production |
| `INNGEST_EVENT_KEY`   | Inngest Cloud > Manage > Keys |                           |
| `INNGEST_SIGNING_KEY` | Inngest Cloud > Manage > Keys |                           |

Do NOT set `INNGEST_BASE_URL` in Render env vars. The gateway doesn't need it.

### Worker Dispatch

| Variable         | Value                   | Notes                                                        |
| ---------------- | ----------------------- | ------------------------------------------------------------ |
| `WORKER_RUNTIME` | `fly`                   | Tells the lifecycle to spawn Fly.io machines                 |
| `TUNNEL_URL`     | _(not needed in cloud)_ | Only needed for local Docker mode pointing at local Supabase |

### Fly.io

| Variable           | Value / Source                               | Notes                                                        |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------ |
| `FLY_API_TOKEN`    | `fly tokens create deploy -x 999999h`        |                                                              |
| `FLY_WORKER_APP`   | `ai-employee-workers`                        | Must match the Fly.io app name                               |
| `FLY_WORKER_IMAGE` | `registry.fly.io/ai-employee-workers:latest` |                                                              |
| `WORKER_VM_SIZE`   | `shared-cpu-1x`                              | Override per-archetype via `vm_size` in the archetypes table |

### AI / OpenRouter

| Variable              | Value / Source                                   | Notes                                    |
| --------------------- | ------------------------------------------------ | ---------------------------------------- |
| `OPENROUTER_API_KEY`  | [openrouter.ai/keys](https://openrouter.ai/keys) |                                          |
| `OPENROUTER_MODEL`    | `minimax/minimax-m2.7`                           | Default execution model                  |
| `PLAN_VERIFIER_MODEL` | `anthropic/claude-haiku-4-5`                     | Verification/judge model — do not change |

### Slack Integration

| Variable                  | Where to Find                                                    | Notes                                         |
| ------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| `SLACK_SIGNING_SECRET`    | api.slack.com > App > Basic Information > Signing Secret         |                                               |
| `SLACK_BOT_TOKEN`         | api.slack.com > App > OAuth & Permissions > Bot User OAuth Token | Primary workspace token                       |
| `SLACK_APP_TOKEN`         | api.slack.com > App > Basic Information > App-Level Tokens       | Must have `connections:write` scope           |
| `SLACK_CLIENT_ID`         | api.slack.com > App > Basic Information > App Credentials        |                                               |
| `SLACK_CLIENT_SECRET`     | api.slack.com > App > Basic Information > App Credentials        |                                               |
| `SLACK_REDIRECT_BASE_URL` | Your Render service URL                                          | Must be registered in Slack app Redirect URLs |
| `SLACK_CHANNEL_ID`        | Slack > right-click channel > Copy link                          | Fallback channel for notifications            |
| `VLRE_SLACK_BOT_TOKEN`    | Same as `SLACK_BOT_TOKEN` for VLRE workspace                     | Seed-only — used by `prisma/seed.ts`          |

### Webhooks

| Variable              | Value / Source           | Notes                                       |
| --------------------- | ------------------------ | ------------------------------------------- |
| `JIRA_WEBHOOK_SECRET` | Your Jira webhook config | Engineering employee (on hold)              |
| `WEBHOOK_PUBLIC_URL`  | Your Render service URL  | For one-time Hostfully webhook registration |

### Cost Control

| Variable                          | Value | Notes                                |
| --------------------------------- | ----- | ------------------------------------ |
| `COST_LIMIT_USD_PER_DEPT_PER_DAY` | `50`  | Daily circuit breaker per department |

### Dashboard Config (Runtime — no separate setup needed)

The dashboard config is served at runtime via `GET /api/config.js`. The gateway derives all four values from the runtime env vars already set above (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GATEWAY_PUBLIC_URL`). No Docker build arguments are needed.

| Dashboard value          | Source                        | Notes                                      |
| ------------------------ | ----------------------------- | ------------------------------------------ |
| `VITE_POSTGREST_URL`     | `SUPABASE_URL` + `/rest/v1`   | PostgREST endpoint for dashboard API calls |
| `VITE_SUPABASE_ANON_KEY` | `SUPABASE_ANON_KEY`           | Injected at runtime, not baked at build    |
| `VITE_GATEWAY_URL`       | `GATEWAY_PUBLIC_URL`          | Gateway URL for dashboard API calls        |
| `VITE_INNGEST_URL`       | Hardcoded to `https://inn.gs` | Inngest Cloud URL                          |

---

## 8. Known Build and Runtime Issues

Every foot-gun encountered during the actual production deployment, with symptom, cause, and fix.

### Issue 1: Wrong Dockerfile

**Symptom:** Deploy fails immediately with `deploy_ended: nonZeroExit: 1`. The build log shows it's trying to build the OpenCode worker image (which requires Go, large dependencies, etc.) instead of the gateway.

**Cause:** Render defaults to `./Dockerfile` when you create a service via the dashboard. The root `Dockerfile` is the OpenCode worker image. The gateway needs `./Dockerfile.gateway`.

**Fix:** PATCH the dockerfilePath via the Render API (see Section 6.3). This cannot be set reliably via `render.yaml` for manually created services.

### Issue 2: Missing OpenSSL on Alpine

**Symptom:** Container starts, then crashes immediately with an error about `libssl.so.3` or a Prisma native binary failing to load.

**Cause:** `node:22-alpine` doesn't include OpenSSL. Prisma's native query engine binary requires `libssl.so.3`.

**Fix:** Add `RUN apk add --no-cache openssl` to both the builder and runner stages of `Dockerfile.gateway`. This is already applied in the current Dockerfile.

### Issue 3: Missing agents.md Static Asset

**Symptom:** Container crashes at startup with:

```
Error: ENOENT: no such file or directory, open '/app/dist/workers/config/agents.md'
```

**Cause:** `src/gateway/routes/admin-brain-preview.ts` imports `agents-md-compiler.mjs`, which calls `readFileSync` on `agents.md` at module load time (not lazily). TypeScript compilation doesn't copy `.md` files to `dist/`. So the file exists in `src/workers/config/agents.md` but not in `dist/workers/config/agents.md`.

**Fix:** Add this line to `Dockerfile.gateway` after `pnpm build`:

```dockerfile
RUN mkdir -p dist/workers/config && cp src/workers/config/agents.md dist/workers/config/agents.md
```

This is already applied in the current Dockerfile.

### Issue 4: Prisma Migration Fails with "Prepared Statement Already Exists"

**Symptom:** `prisma migrate deploy` fails with:

```
ERROR: prepared statement "s0" already exists
```

**Cause:** Using the transaction pooler URL (port 6543) for migrations. pgbouncer transaction mode doesn't support prepared statements, which Prisma's migration engine uses.

**Fix:** Use the session pooler URL (port 5432) for migrations. See Section 3.3.

### Issue 5: Supabase Direct Connection Unreachable Locally

**Symptom:** `psql` or `prisma migrate deploy` hangs or times out when using the direct connection URL (`db.{ref}.supabase.co:5432`).

**Cause:** The direct connection endpoint is IPv6-only. Most local Mac setups don't route IPv6 to Supabase's infrastructure.

**Fix:** Use the session pooler URL (port 5432) for local migrations and seeding. The direct connection works fine from Render and GitHub Actions.

### Issue 6: Dashboard Shows Blank or Localhost Data

**Symptom:** The dashboard loads but shows no data, or all API calls go to `localhost:54331` instead of the Supabase Cloud URL.

**Cause:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `GATEWAY_PUBLIC_URL` are missing or incorrect in Render's runtime env vars. The gateway's `/api/config.js` endpoint returns empty strings, so the dashboard falls back to localhost defaults.

**Fix:** Confirm all three env vars are set correctly in Render (Settings > Environment). Then verify the endpoint is returning populated values:

```bash
curl https://{render-url}/api/config.js
# Expected: window.__RUNTIME_CONFIG__ = {"VITE_POSTGREST_URL":"https://...","VITE_SUPABASE_ANON_KEY":"sb_publishable_...","VITE_GATEWAY_URL":"https://...","VITE_INNGEST_URL":"https://inn.gs"};
# If any value is an empty string, the corresponding env var is missing.
```

After fixing the env vars, a simple restart is enough — no rebuild needed.

### Issue 7: PUT /env-vars Wiped Existing Secrets

**Symptom:** After updating one env var, other secrets stop working. The gateway can't connect to the database, Slack, etc.

**Cause:** `PUT /env-vars` replaces the ENTIRE list of environment variables. Any variable not included in the PUT body is deleted.

**Fix:** Always include ALL env vars when calling `PUT /env-vars`. Fetch the current list first if you're unsure what's set:

```bash
curl -s -H "Authorization: Bearer {render_api_key}" \
  "https://api.render.com/v1/services/{service_id}/env-vars" | jq '[.[] | {key, value}]'
```

### Issue 8: render.yaml Changes Have No Effect

**Symptom:** You update `render.yaml` and push to main, but the Render service doesn't pick up the changes.

**Cause:** The service was created manually via the Render dashboard, not via Blueprint/IaC. Render only applies `render.yaml` to Blueprint-managed services.

**Fix:** Apply all settings via the Render API PATCH endpoint or the dashboard UI directly. Treat `render.yaml` as documentation only for this service.

---

## 9. CI/CD Pipeline

The `.github/workflows/deploy.yml` workflow runs on every push to `main`:

1. **Test** — runs `pnpm test -- --run` and `pnpm lint`
2. **Build worker image** — `docker buildx build --platform linux/amd64 -t registry.fly.io/ai-employee-workers:latest .`
3. **Push to Fly.io registry** — `fly auth docker && docker push registry.fly.io/ai-employee-workers:latest`
4. **Deploy gateway** — hits the Render deploy hook URL to trigger a new Render build

Required GitHub repository secrets:

| Secret                   | Value                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- |
| `RENDER_DEPLOY_HOOK_URL` | Render > Service > Settings > Deploy Hooks (copy the URL from the dashboard) |
| `FLY_API_TOKEN`          | From `fly tokens create deploy -x 999999h`                                   |

Example workflow snippet:

```yaml
- name: Deploy to Render
  run: curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"

- name: Push worker image to Fly.io
  run: |
    fly auth docker
    docker push registry.fly.io/ai-employee-workers:latest
  env:
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

---

## 10. Ongoing Costs

**Baseline (~$37-47/mo):**

| Service        | Plan                | Cost           |
| -------------- | ------------------- | -------------- |
| Render         | Starter             | $7/mo          |
| Supabase Cloud | Pro                 | $25/mo         |
| Fly.io         | Pay-per-use         | ~$5-15/mo      |
| Inngest Cloud  | Free (50K steps/mo) | $0/mo          |
| GitHub Actions | Free tier           | $0/mo          |
| **Total**      |                     | **~$37-47/mo** |

**Growth triggers:**

- **Render Standard ($25/mo)** — when the gateway needs more than 512MB RAM or you want zero cold starts
- **Inngest Pro ($75/mo)** — when you exceed 50K workflow steps per month (check Inngest dashboard for usage)
- **Supabase Pro add-ons** — additional compute or storage as the database grows

Fly.io costs scale with actual usage. Each worker run costs roughly $0.002 for a `shared-cpu-1x` machine running for 2 minutes. At 100 tasks/day, that's about $6/mo.

---

## 11. Local vs Cloud Differences

| Variable                  | Local Dev                                                    | Cloud (Render)                                                     |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `DATABASE_URL`            | `postgresql://postgres:postgres@localhost:54322/ai_employee` | Transaction pooler URL (port 6543)                                 |
| `SUPABASE_URL`            | `http://localhost:54331`                                     | `https://{ref}.supabase.co`                                        |
| `SUPABASE_ANON_KEY`       | Local dev JWT (from `docker/.env`)                           | Supabase Cloud anon key (`sb_publishable_*`)                       |
| `SUPABASE_SECRET_KEY`     | Local service role JWT                                       | Supabase Cloud service*role key (`sb_secret*\*`)                   |
| `INNGEST_DEV`             | `"1"`                                                        | `""` (empty)                                                       |
| `INNGEST_EVENT_KEY`       | `"local"`                                                    | Inngest Cloud event key                                            |
| `INNGEST_SIGNING_KEY`     | _(not required)_                                             | Inngest Cloud signing key                                          |
| `INNGEST_BASE_URL`        | `http://localhost:8288`                                      | _(not set — gateway doesn't need it)_                              |
| `WORKER_RUNTIME`          | `""` or `"docker"`                                           | `"fly"`                                                            |
| `TUNNEL_URL`              | Cloudflare tunnel URL (for Fly.io hybrid mode)               | _(not needed)_                                                     |
| `GATEWAY_PUBLIC_URL`      | _(not required)_                                             | `https://{render-url}`                                             |
| `SLACK_REDIRECT_BASE_URL` | Cloudflare tunnel URL                                        | `https://{render-url}`                                             |
| `WEBHOOK_PUBLIC_URL`      | Cloudflare tunnel URL                                        | `https://{render-url}`                                             |
| `VITE_POSTGREST_URL`      | `http://localhost:54331/rest/v1` (fallback default)          | `https://{ref}.supabase.co/rest/v1` (runtime via `/api/config.js`) |
| `VITE_SUPABASE_ANON_KEY`  | Local dev JWT (fallback default)                             | Supabase Cloud anon key (runtime via `/api/config.js`)             |
| `VITE_GATEWAY_URL`        | `http://localhost:7700` (fallback default)                   | `https://{render-url}` (runtime via `/api/config.js`)              |
| `VITE_INNGEST_URL`        | `http://localhost:8288` (fallback default)                   | `https://inn.gs` (runtime via `/api/config.js`)                    |

**Key differences to remember:**

- Local dev uses Docker Compose for PostgreSQL + PostgREST. Cloud uses Supabase Cloud.
- Local dev uses the Inngest Dev Server at `localhost:8288`. Cloud uses Inngest Cloud at `inn.gs`.
- Local dev can run workers in local Docker containers (`WORKER_RUNTIME=docker`). Cloud always uses Fly.io (`WORKER_RUNTIME=fly`).
- Dashboard config (`VITE_*` values) is injected at runtime via `/api/config.js` — not baked at build time. Changing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `GATEWAY_PUBLIC_URL` in Render env vars takes effect after a restart, no rebuild needed.

---

## 12. Post-Deploy Checklist

Run through this after every fresh deployment to confirm everything is wired up correctly:

```
[ ] curl https://{render-url}/health
    Expected: {"status":"ok"}

[ ] curl https://{render-url}/api/inngest
    Expected: JSON with 5 functions listed

[ ] Inngest Cloud dashboard shows app registered with 5 functions
    Go to app.inngest.com > Apps

[ ] Supabase dashboard > Table Editor > tasks table exists and is accessible
    Also verify via PostgREST: curl https://{ref}.supabase.co/rest/v1/tasks?limit=1

[ ] Dashboard loads at https://{render-url}/dashboard/
    Check that data loads (not blank or "—" for all stats)

[ ] Trigger a test task via admin API and confirm it reaches Done status
    curl -X POST -H "Authorization: Bearer {SERVICE_TOKEN}" https://{render-url}/admin/tenants/{tenant_id}/employees/{slug}/trigger

[ ] Slack message appears in the configured channel after the task completes
```

---

## Production Deployment History

### 2026-06-10: user-auth-orgs feature deployment

**What was deployed**: PR #9 (user auth, RBAC, invitations, members page) + Dockerfile build fix.

**Build foot-gun hit**: `pnpm prune --prod` re-fires the `prepare` → `husky` lifecycle script after devDeps are pruned, causing `sh: husky: not found` → exit 1. Fix: add `ENV HUSKY=0` in the builder stage (after `RUN corepack enable pnpm`) AND use `pnpm prune --prod --ignore-scripts`. Husky v9 respects `HUSKY=0` to skip the prepare hook.

**Steps taken**:

1. Added `ENV HUSKY=0` + `--ignore-scripts` to `Dockerfile.gateway` builder stage → build fixed
2. Applied migration `20260609000000_add_user_auth_rbac` (already present in cloud DB from prior manual apply; marked in `_prisma_migrations` via INSERT)
3. Added `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `SERVICE_TOKEN`, `INNGEST_DEV` to Render env; removed stale `ADMIN_API_KEY`, `COST_LIMIT_USD_PER_DEPT_PER_DAY`, `GATEWAY_URL`
4. Triggered fresh redeploy → `status: live`, `/health` 200, `/api/config.js` populated with cloud values
5. Inngest auto-synced on redeploy (7 functions, cloud mode)
6. Seeded PLATFORM_OWNER `victor@dozaldevs.com` via `pnpm seed-platform-owner` against session pooler
7. Verified login via Playwright: `/me` = `PLATFORM_OWNER`, members page loads

**Migration note**: The session pooler (port 5432) was reachable from local Mac — `prisma migrate deploy` worked directly. The auth/RBAC guide's claim that the pooler is IPv6-only was incorrect for this project.
