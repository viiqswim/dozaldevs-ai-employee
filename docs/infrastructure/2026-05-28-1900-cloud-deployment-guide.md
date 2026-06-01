# Cloud Deployment Guide

This guide walks through deploying the AI Employee Platform to production. The platform uses four managed services: Supabase Cloud (database + PostgREST), Render (gateway + Slack bot), Inngest Cloud (workflow orchestration), and Fly.io (AI worker containers).

---

## 1. Architecture Overview

| Component                                  | Service            | Monthly Cost           | Why This Service                                                    |
| ------------------------------------------ | ------------------ | ---------------------- | ------------------------------------------------------------------- |
| Express gateway + Slack bot + Inngest host | Render Starter     | $7/mo                  | Persistent process, 100-min HTTP timeout, good for Socket Mode      |
| PostgreSQL + PostgREST                     | Supabase Cloud Pro | $25/mo                 | Only managed service that bundles PostgREST (mandatory for workers) |
| AI worker containers                       | Fly.io Machines    | ~$5–15/mo              | Already integrated, pay-per-use, ~$0.002/run                        |
| Workflow orchestration                     | Inngest Cloud      | $0 (50K steps/mo free) | Durable execution, no self-hosting needed                           |
| CI/CD                                      | GitHub Actions     | $0                     | Auto-deploy on push to main                                         |

**Key topology notes:**

- The gateway serves the dashboard at `/dashboard/` as pre-built static files. No separate frontend deploy is needed.
- PostgREST is at `https://{ref}.supabase.co/rest/v1/` in cloud (same pattern as local `localhost:54331/rest/v1/`).
- Workers get `SUPABASE_URL` injected at machine creation time by `employee-lifecycle.ts`. Set this in Render env vars so it flows through.
- Fly.io worker image must be built with `--platform linux/amd64` before pushing to the registry.

---

## 2. Prerequisites

Before starting, make sure you have:

- **fly CLI** installed and authenticated (`fly auth login`)
- **Render account** connected to your GitHub repo
- **Inngest Cloud account** created at [app.inngest.com](https://app.inngest.com)
- **Supabase Cloud account** at [supabase.com](https://supabase.com)
- **GitHub repo** with Actions enabled

---

## 3. Step-by-Step Provisioning

### 3.1 Supabase Cloud

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Choose a region close to your Render deployment region.
3. Wait for the project to finish provisioning (about 2 minutes).
4. Collect credentials from **Project Settings > API**:
   - **Project URL** (`https://{ref}.supabase.co`) — this is your `SUPABASE_URL`
   - **anon public** key — this is your `SUPABASE_ANON_KEY`
   - **service_role** key — this is your `SUPABASE_SECRET_KEY`
5. Collect the direct database connection string from **Project Settings > Database > Connection string > URI** (use the "Direct connection" tab, not the pooler). This is your `DATABASE_URL` and `DATABASE_URL_DIRECT`.

> **Important:** Use the direct connection URL (port 5432) for Prisma migrations, not the pooled connection (port 6543). Prisma's migration engine requires a direct connection.

### 3.2 Inngest Cloud

1. Sign up at [app.inngest.com](https://app.inngest.com) and create a new app.
2. Go to **Manage > Keys** and collect:
   - **Event Key** — this is your `INNGEST_EVENT_KEY`
   - **Signing Key** — this is your `INNGEST_SIGNING_KEY`
3. Set `INNGEST_DEV=""` (empty) in production — this tells the SDK to use Inngest Cloud instead of the local dev server.
4. Set `INNGEST_BASE_URL="https://inn.gs"` so workers know where to fire events.

### 3.3 Fly.io

1. Create a new app: `fly apps create ai-employee-workers`
2. Set `FLY_WORKER_APP=ai-employee-workers` in Render env vars.
3. Get your API token: `fly tokens create deploy -x 999999h`
4. Store this as `FLY_API_TOKEN` in Render env vars and as a GitHub Actions secret.
5. Build and push the worker image (see Section 6 for CI/CD automation):
   ```bash
   docker build --platform linux/amd64 -t registry.fly.io/ai-employee-workers:latest .
   fly auth docker
   docker push registry.fly.io/ai-employee-workers:latest
   ```

### 3.4 Render

1. Create a new **Web Service** in Render, connected to your GitHub repo.
2. Set the build command: `pnpm install && pnpm build && pnpm dashboard:build`
3. Set the start command: `node dist/gateway/index.js`
4. Choose the **Starter** plan ($7/mo) — it provides a persistent process needed for Slack Socket Mode.
5. Add all environment variables from Section 4.
6. After the first deploy, copy the Render service URL (e.g. `https://your-app.onrender.com`) and set it as `GATEWAY_PUBLIC_URL` in Render env vars. Then redeploy.

---

## 4. Environment Variables Reference

Set these in Render's environment variable panel. Variables marked **Build-time** must be set before the build runs (Vite bakes them into the dashboard bundle at build time).

### Database

| Variable              | Where to Find                                          | Notes                           |
| --------------------- | ------------------------------------------------------ | ------------------------------- |
| `DATABASE_URL`        | Supabase > Settings > Database > Direct connection URI | Must use port 5432, not 6543    |
| `DATABASE_URL_DIRECT` | Same as `DATABASE_URL`                                 | Used by Prisma migration engine |

### Supabase (PostgREST + Auth)

| Variable              | Where to Find                                | Notes                            |
| --------------------- | -------------------------------------------- | -------------------------------- |
| `SUPABASE_URL`        | Supabase > Settings > API > Project URL      | e.g. `https://{ref}.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase > Settings > API > service_role key | Keep secret — full DB access     |
| `SUPABASE_ANON_KEY`   | Supabase > Settings > API > anon public key  | Safe to expose in frontend       |

### Platform Core

| Variable             | Value / Source          | Notes                                                                       |
| -------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`     | `openssl rand -hex 32`  | 64 hex chars; never change after first deploy                               |
| `ADMIN_API_KEY`      | `openssl rand -hex 32`  | Protects all `/admin/*` endpoints                                           |
| `PORT`               | `7700`                  | Render sets `PORT` automatically; this is the fallback                      |
| `GATEWAY_PUBLIC_URL` | Your Render service URL | e.g. `https://your-app.onrender.com` — required for Inngest Cloud callbacks |

### Inngest

| Variable              | Value / Source                | Notes                                |
| --------------------- | ----------------------------- | ------------------------------------ |
| `INNGEST_DEV`         | `""` (empty)                  | Leave empty in production            |
| `INNGEST_EVENT_KEY`   | Inngest Cloud > Manage > Keys |                                      |
| `INNGEST_SIGNING_KEY` | Inngest Cloud > Manage > Keys |                                      |
| `INNGEST_BASE_URL`    | `https://inn.gs`              | Inngest Cloud ingest URL for workers |

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

### Dashboard (Build-time only)

These are set in Render's environment and must be present **before the build runs**. Vite bakes them into the static bundle.

| Variable                 | Value                       | Notes                                     |
| ------------------------ | --------------------------- | ----------------------------------------- |
| `VITE_SUPABASE_URL`      | Same as `SUPABASE_URL`      | Baked into dashboard bundle at build time |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` | Baked into dashboard bundle at build time |

> **Gotcha:** If the dashboard shows blank or "—" for all data, `VITE_SUPABASE_ANON_KEY` was missing at build time. Set it and trigger a new deploy.

---

## 5. Database Migration

Run migrations against Supabase Cloud using the direct connection URL (not the pooled connection):

```bash
# Set the direct URL (port 5432, not 6543)
export DATABASE_URL="postgresql://postgres:{password}@db.{ref}.supabase.co:5432/postgres"

# Deploy all pending migrations
npx prisma migrate deploy

# Seed initial data (tenants, archetypes, model catalog)
npx prisma db seed
```

After migrations run, reload the PostgREST schema cache so it picks up new tables:

```bash
# Connect via psql and notify PostgREST
psql "$DATABASE_URL" -c "NOTIFY pgrst, 'reload schema';"
```

Verify PostgREST can see the tables:

```bash
curl -s "https://{ref}.supabase.co/rest/v1/tasks?limit=1" \
  -H "apikey: {anon_key}" \
  -H "Authorization: Bearer {anon_key}"
# Expected: [] (empty array), NOT a PGRST205 schema cache error
```

---

## 6. CI/CD Pipeline

The `.github/workflows/deploy.yml` workflow runs on every push to `main`:

1. **Test** — runs `pnpm test -- --run` and `pnpm lint`
2. **Build worker image** — `docker build --platform linux/amd64 -t registry.fly.io/ai-employee-workers:latest .`
3. **Push to Fly.io registry** — `fly auth docker && docker push registry.fly.io/ai-employee-workers:latest`
4. **Deploy gateway** — hits the Render deploy hook URL to trigger a new Render build

Required GitHub repository secrets:

| Secret                   | Value                                      |
| ------------------------ | ------------------------------------------ |
| `RENDER_DEPLOY_HOOK_URL` | Render > Service > Settings > Deploy Hook  |
| `FLY_API_TOKEN`          | From `fly tokens create deploy -x 999999h` |

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

## 7. Ongoing Costs

**Baseline (~$42/mo):**

| Service        | Plan                | Cost           |
| -------------- | ------------------- | -------------- |
| Render         | Starter             | $7/mo          |
| Supabase Cloud | Pro                 | $25/mo         |
| Fly.io         | Pay-per-use         | ~$5–15/mo      |
| Inngest Cloud  | Free (50K steps/mo) | $0/mo          |
| GitHub Actions | Free tier           | $0/mo          |
| **Total**      |                     | **~$37–47/mo** |

**Growth triggers:**

- **Render Standard ($25/mo)** — when the gateway needs more than 512MB RAM or you want zero cold starts
- **Inngest Pro ($75/mo)** — when you exceed 50K workflow steps per month (check Inngest dashboard for usage)
- **Supabase Pro add-ons** — additional compute or storage as the database grows

Fly.io costs scale with actual usage. Each worker run costs roughly $0.002 for a `shared-cpu-1x` machine running for 2 minutes. At 100 tasks/day, that's about $6/mo.

---

## 8. Troubleshooting

### Inngest not connecting

**Symptom:** Inngest Cloud shows no functions registered, or events are not being processed.

**Fix:** Check that `GATEWAY_PUBLIC_URL` is set in Render env vars to the public Render URL (e.g. `https://your-app.onrender.com`). Inngest Cloud needs to reach the gateway to register functions and deliver events. `localhost` will not work.

Also verify the Inngest serve endpoint is reachable:

```bash
curl https://your-app.onrender.com/api/inngest
# Expected: JSON with function list
```

### PostgREST 401 Unauthorized

**Symptom:** Worker containers get 401 errors when reading or writing task data.

**Fix:** Verify `SUPABASE_ANON_KEY` is the Supabase Cloud anon key, not the local dev JWT. The local dev JWT is only valid against the local Docker Compose stack. Get the correct key from Supabase > Settings > API > anon public.

### PostgREST PGRST205 "table not found"

**Symptom:** PostgREST returns `{"code":"PGRST205","message":"Could not find the table in the schema cache"}`.

**Fix:** A migration added a new table but PostgREST hasn't reloaded its schema cache. Run:

```bash
psql "$DATABASE_URL" -c "NOTIFY pgrst, 'reload schema';"
```

### Slack Socket Mode not connecting

**Symptom:** Gateway logs don't show `"Slack Bolt — Socket Mode connected"`.

**Fix:** Verify `SLACK_APP_TOKEN` (starts with `xapp-`) is set in Render env vars. Socket Mode is an outbound WebSocket from the gateway to Slack — no inbound URL configuration is needed. If the token is set and it still doesn't connect, check the Slack app's Socket Mode is enabled at api.slack.com > App > Socket Mode.

### Worker not starting

**Symptom:** Tasks get stuck in `Executing` state; no worker container appears in `fly status`.

**Fix:** Check that `WORKER_RUNTIME=fly` is set in Render env vars. Then check Fly.io machine logs:

```bash
fly logs -a ai-employee-workers
```

Also verify the worker image was pushed successfully:

```bash
fly image show -a ai-employee-workers
```

### Dashboard blank or showing "—" for all data

**Symptom:** The dashboard loads but shows no data, or all stats show "—".

**Fix:** `VITE_SUPABASE_ANON_KEY` was not set at build time. Vite bakes environment variables into the static bundle during the build step — runtime env vars don't help. Set `VITE_SUPABASE_ANON_KEY` in Render env vars and trigger a new deploy (not just a restart).

### Slack approval buttons not working

**Symptom:** Clicking Approve/Reject in Slack does nothing.

**Fix:** This is usually a transient WebSocket drop. Do not change Slack app settings. Use the manual approval fallback:

```bash
curl -X POST "https://inn.gs/e/{your-inngest-event-key}" \
  -H "Content-Type: application/json" \
  -d '{"name":"employee/approval.received","data":{"taskId":"{task_id}","action":"approve","userId":"{slack_user_id}","userName":"Your Name"}}'
```

---

## 9. Local vs Cloud Differences

| Variable                  | Local Dev                                                    | Cloud (Render)                                                  |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `DATABASE_URL`            | `postgresql://postgres:postgres@localhost:54322/ai_employee` | `postgresql://postgres:{pw}@db.{ref}.supabase.co:5432/postgres` |
| `SUPABASE_URL`            | `http://localhost:54331`                                     | `https://{ref}.supabase.co`                                     |
| `SUPABASE_ANON_KEY`       | Local dev JWT (from `docker/.env`)                           | Supabase Cloud anon key                                         |
| `SUPABASE_SECRET_KEY`     | Local service role JWT                                       | Supabase Cloud service_role key                                 |
| `INNGEST_DEV`             | `"1"`                                                        | `""` (empty)                                                    |
| `INNGEST_EVENT_KEY`       | `"local"`                                                    | Inngest Cloud event key                                         |
| `INNGEST_SIGNING_KEY`     | _(not required)_                                             | Inngest Cloud signing key                                       |
| `INNGEST_BASE_URL`        | `http://localhost:8288`                                      | `https://inn.gs`                                                |
| `WORKER_RUNTIME`          | `""` or `"docker"`                                           | `"fly"`                                                         |
| `TUNNEL_URL`              | Cloudflare tunnel URL (for Fly.io hybrid mode)               | _(not needed)_                                                  |
| `GATEWAY_PUBLIC_URL`      | _(not required)_                                             | `https://your-app.onrender.com`                                 |
| `SLACK_REDIRECT_BASE_URL` | Cloudflare tunnel URL                                        | `https://your-app.onrender.com`                                 |
| `WEBHOOK_PUBLIC_URL`      | Cloudflare tunnel URL                                        | `https://your-app.onrender.com`                                 |
| `VITE_SUPABASE_URL`       | `http://localhost:54331`                                     | `https://{ref}.supabase.co`                                     |
| `VITE_SUPABASE_ANON_KEY`  | Local dev JWT                                                | Supabase Cloud anon key                                         |

**Key differences to remember:**

- Local dev uses Docker Compose for PostgreSQL + PostgREST. Cloud uses Supabase Cloud.
- Local dev uses the Inngest Dev Server at `localhost:8288`. Cloud uses Inngest Cloud at `inn.gs`.
- Local dev can run workers in local Docker containers (`WORKER_RUNTIME=docker`). Cloud always uses Fly.io (`WORKER_RUNTIME=fly`).
- Dashboard env vars (`VITE_*`) must be set before the build runs in Render — they're baked into the static bundle, not read at runtime.
