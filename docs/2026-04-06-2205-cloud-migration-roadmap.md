# Cloud Migration Roadmap — Phases A through D

## What This Document Is

This is a practical migration guide for moving the AI Employee Platform from fully local infrastructure to cloud-hosted services. The system currently runs entirely on your machine: Supabase in Docker Compose, Inngest Dev Server, a local Fastify gateway, and Docker containers for workers. It works, but it has real constraints — Cloudflare Tunnel for hybrid mode, no real webhook delivery from Jira, and a polling hack in the lifecycle function because Inngest Dev Server resolves `waitForEvent` immediately.

This roadmap describes four independent migration phases. Each phase is self-contained: you can stop after any one of them and have a working system. The phases are ordered by dependency, not urgency. Do Phase A before Phase B, Phase B before Phase C, and Phase C before Phase D. But you don't have to do all four.

For current architecture details, see [docs/2026-04-01-1726-system-overview.md](./2026-04-01-1726-system-overview.md).

---

## Phases at a Glance

| Phase | Component                                 | Trigger                                                                    | Removes                                  | Effort                        |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| A     | Supabase → Supabase Cloud                 | Cloudflare URL instability is annoying or production-grade database needed | PostgREST tunnel requirement             | Low                           |
| B     | Inngest → Inngest Cloud                   | Need real `step.waitForEvent` instead of polling hack                      | 30s polling, hybrid mode dependency      | Low                           |
| C     | Gateway → Fly.io app                      | Real Jira webhook delivery needed                                          | Webhook tunnel, local server requirement | Medium                        |
| D     | Worker image → Fly.io registry as default | All other phases done, hybrid mode no longer needed                        | Local Docker dependency                  | Low (already designed for it) |

---

## Phase A: Supabase Cloud

### Trigger

Do this when Cloudflare URL instability is causing pain in hybrid mode, or when you want a persistent database that doesn't require your laptop to be running.

### Prerequisites

- A Supabase account (free tier works)
- The Prisma schema is already stable (no pending migrations you haven't applied locally)

### Migration Steps

1. Create a new Supabase Cloud project at [supabase.com](https://supabase.com). Choose a region close to your Fly.io worker region.
2. From the Supabase dashboard, copy the connection strings: `DATABASE_URL` (pooled, for Prisma) and `DATABASE_URL_DIRECT` (direct, for migrations).
3. Run migrations against the cloud database:
   ```bash
   DATABASE_URL="<cloud-direct-url>" pnpm prisma migrate deploy
   ```
4. Seed the project row:
   ```bash
   DATABASE_URL="<cloud-direct-url>" pnpm prisma db seed
   ```
5. Update `.env` with the cloud values:
   ```
   DATABASE_URL=<cloud-pooled-url>
   DATABASE_URL_DIRECT=<cloud-direct-url>
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=<service-role-key-from-dashboard>
   ```
6. Stop the local Docker Compose (no longer needed for the database):
   ```bash
   docker compose -f docker/docker-compose.yml down
   ```
7. Restart the gateway and Inngest Dev Server without Docker Compose running.

### What It Eliminates

- `docker compose -f docker/docker-compose.yml up -d` from your startup sequence
- Cloudflare Tunnel requirement for hybrid mode (worker containers reach Supabase Cloud directly)
- `POSTGRES_DB=ai_employee` and `docker/.env` configuration
- Local PostgreSQL on port 54322 and PostgREST on port 54321

### What It Doesn't Change

- Gateway still runs locally on port 3000
- Inngest Dev Server still runs locally on port 8288
- Worker containers still dispatch via local Docker or Fly.io hybrid mode
- All env var names stay the same — only the values change

### Verification

Run `pnpm trigger-task` without Cloudflare Tunnel running. The task should complete end-to-end. Check the Supabase Cloud dashboard to confirm the task row exists with `status=Done`.

---

## Phase B: Inngest Cloud

### Trigger

Do this when you need `step.waitForEvent` to work correctly, or when the 30-second polling loop in `lifecycle.ts` feels wrong and you want the real event-driven behavior.

**Background**: Inngest Dev Server v1.17.7 resolves `waitForEvent` immediately with `null` instead of blocking until the event arrives. Phase 8 worked around this by replacing `waitForEvent` with a Supabase polling loop (`USE_LOCAL_DOCKER` mode). Inngest Cloud doesn't have this bug.

### Prerequisites

- Phase A complete (Supabase Cloud running), OR you're comfortable running the gateway with a public URL for Inngest Cloud to reach it

### Migration Steps

1. Create an Inngest Cloud account at [inngest.com](https://inngest.com). Create an app and copy the event key and signing key.
2. Update `.env`:
   ```
   INNGEST_DEV=          # remove or set to empty string — disables local dev mode
   INNGEST_EVENT_KEY=<cloud-event-key>
   INNGEST_SIGNING_KEY=<cloud-signing-key>
   INNGEST_BASE_URL=     # remove — Inngest Cloud doesn't need this
   ```
3. Deploy the gateway to a public URL so Inngest Cloud can reach the `/api/inngest` endpoint. Options:
   - Use Cloudflare Tunnel for the gateway only: `cloudflared tunnel --url http://localhost:3000`
   - Or complete Phase C first (Fly.io gateway) and use that URL
4. Register the gateway URL with Inngest Cloud in the dashboard (Apps section).
5. Restart the gateway. Inngest Cloud will sync the registered functions.

### What It Eliminates

- `USE_LOCAL_DOCKER` polling hack in `lifecycle.ts` (the `waitForEvent` path now works correctly)
- Local Inngest Dev Server on port 8288
- `npx inngest-cli@latest dev` from your startup sequence
- The 30-second polling loop and its associated Supabase queries

### What It Doesn't Change

- Gateway code is unchanged — same Inngest client, same function registrations
- Worker dispatch logic is unchanged
- All Inngest function names and event names stay the same

### Verification

Trigger a task and watch the Inngest Cloud dashboard. The lifecycle function should pause at `step.waitForEvent` and resume when the worker sends `engineering/task.completed` — not immediately resolve to `null`. The task should reach `Done` via the event path, not the polling path.

---

## Phase C: Gateway on Fly.io

### Trigger

Do this when you need real Jira webhook delivery (Jira can't reach `localhost:3000`) or when you want the system to run without your laptop.

### Prerequisites

- Phase A complete (Supabase Cloud)
- Phase B complete (Inngest Cloud), OR you're willing to keep Inngest Dev Server running locally and expose it via Cloudflare Tunnel

### Migration Steps

1. Create a Fly.io app for the gateway:
   ```bash
   fly apps create ai-employee-gateway
   ```
2. Set all gateway secrets on the Fly app:
   ```bash
   fly secrets set \
     DATABASE_URL="<cloud-url>" \
     DATABASE_URL_DIRECT="<cloud-direct-url>" \
     SUPABASE_URL="<cloud-supabase-url>" \
     SUPABASE_SECRET_KEY="<service-role-key>" \
     JIRA_WEBHOOK_SECRET="<your-secret>" \
     INNGEST_EVENT_KEY="<cloud-event-key>" \
     INNGEST_SIGNING_KEY="<cloud-signing-key>" \
     GITHUB_TOKEN="<token>" \
     OPENROUTER_API_KEY="<key>" \
     FLY_API_TOKEN="<token>" \
     FLY_WORKER_APP="ai-employee-workers" \
     --app ai-employee-gateway
   ```
3. Add a `fly.toml` for the gateway app (port 3000, health check on `/health`).
4. Deploy:
   ```bash
   fly deploy --app ai-employee-gateway
   ```
5. Update `INNGEST_BASE_URL` in Inngest Cloud to point at `https://ai-employee-gateway.fly.dev/api/inngest`.
6. Update the Jira webhook URL to `https://ai-employee-gateway.fly.dev/webhooks/jira`.

### What It Eliminates

- Local gateway process (`pnpm dev`)
- Webhook tunnel requirement (Cloudflare Tunnel for Jira delivery)
- Local server requirement for Inngest function registration
- `USE_LOCAL_DOCKER=1` from your startup env (gateway on Fly.io uses Fly.io dispatch by default)

### What It Doesn't Change

- Worker containers still run on Fly.io machines (same `createMachine()` path)
- All source code is unchanged — only deployment target changes
- Database and Inngest connections are the same cloud services from Phases A and B

### Verification

Create a real Jira ticket. Confirm the Fly.io gateway logs show the webhook received. Confirm the task appears in Supabase Cloud with `status=Ready`, then progresses to `Done` without any local processes running.

---

## Phase D: Fly.io as Default Dispatch (Remove Hybrid Mode)

### Trigger

Do this after Phases A, B, and C are complete and you want to clean up the codebase. Hybrid mode was a stepping stone — once the gateway runs on Fly.io, there's no reason to keep the local Docker and tunnel paths.

### Prerequisites

- Phases A, B, and C all complete
- At least one successful end-to-end run on full cloud infrastructure

### Migration Steps

1. Remove `USE_LOCAL_DOCKER` and `USE_FLY_HYBRID` from `.env` and `.env.example`. These env vars are no longer needed.
2. In `src/inngest/lifecycle.ts`, remove the `USE_LOCAL_DOCKER` branch. The `createMachine()` path becomes the only dispatch path.
3. Remove the hybrid mode polling loop (the 30-second Supabase poll for `status=Submitting`). The `waitForEvent` path is now the only completion detection path.
4. Update `AGENTS.md` and `README.md` to remove hybrid mode documentation.
5. Run the full test suite to confirm nothing broke:
   ```bash
   pnpm test -- --run
   ```

### What It Eliminates

- `USE_LOCAL_DOCKER` env var and all code paths gated on it
- `USE_FLY_HYBRID` env var and hybrid mode dispatch logic
- Cloudflare Tunnel dependency for worker-to-Supabase connectivity
- Local Docker image build requirement (`docker build -t ai-employee-worker .`)
- The polling hack in `lifecycle.ts` (already removed in Phase B, but Phase D removes the dead code)

### What It Doesn't Change

- Worker container code is unchanged — same `entrypoint.sh`, same `orchestrate.mts`
- Fly.io worker image still needs to be built and pushed when worker code changes
- All Inngest function names, event names, and database schema stay the same

### Verification

Run `pnpm trigger-task` with no `USE_LOCAL_DOCKER` or `USE_FLY_HYBRID` env vars set. The task should dispatch to a real Fly.io machine and complete end-to-end. Confirm no local Docker containers are created during the run.

---

## What This Roadmap Does NOT Cover

These are real concerns for a production system, but they're out of scope here:

- **Production hardening**: observability (structured logs to a log aggregator), alerting on task failures, database backups and point-in-time recovery
- **Multi-tenant isolation**: separate Supabase projects per customer, row-level security policies, tenant-scoped API keys
- **Cost optimization at scale**: Fly.io machine sizing, Supabase connection pooling under load, Inngest plan limits
- **Production-grade secrets management**: Vault, AWS Secrets Manager, or equivalent — the current approach of Fly.io secrets and `.env` files is fine for small teams but not for regulated environments
