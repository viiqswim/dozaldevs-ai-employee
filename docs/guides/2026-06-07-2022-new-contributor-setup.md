# New Contributor Setup Guide

Everything you need to go from a fresh clone to a running local stack. Follow these steps in order on your first day.

---

## 1. Prerequisites

Before you start, make sure you have:

- **Node.js ≥20** — check with `node --version`
- **pnpm** — install with `npm install -g pnpm` if missing
- **Docker with the Compose plugin** — Docker Desktop includes this; verify with `docker compose version`

All three are required. The setup script will fail fast if any are missing.

---

## 2. First-Time Setup

Clone the repo and run the one-time setup script:

```bash
git clone <repo-url>
cd ai-employee
cp .env.example .env
pnpm install
pnpm setup
```

`pnpm setup` does the following (it's idempotent — safe to re-run):

1. Copies `docker/.env.example` to `docker/.env` if it doesn't exist yet
2. Starts the Docker Compose stack (PostgreSQL, PostgREST, Kong, Auth)
3. Runs Prisma migrations against the `ai_employee` database
4. Seeds the database with two tenants (DozalDevs and VLRE) and their archetypes
5. Builds the Docker worker image (`ai-employee-worker:latest`)
6. Generates `ENCRYPTION_KEY` if missing from `.env`

**What is `docker/.env`?** It's the config file for the Docker Compose stack — it sets the database name, port assignments, and the Supabase JWT keys (`ANON_KEY` and `SERVICE_ROLE_KEY`). You don't normally edit it; the defaults work out of the box. The two Supabase JWT values in your `.env` (`SUPABASE_SECRET_KEY` and `SUPABASE_ANON_KEY`) must match `SERVICE_ROLE_KEY` and `ANON_KEY` in `docker/.env` respectively. `pnpm setup` auto-creates `docker/.env` with the correct demo values, so you can copy them straight across.

After it completes, fill in the remaining `.env` values (see Section 5 below).

---

## 3. Personal Cloudflare Tunnel

The platform uses a named Cloudflare Tunnel (`local-ai-employee.dozaldevs.com`) to expose your local gateway to Slack webhooks and Hostfully callbacks. Without it, Slack button clicks and inbound webhooks won't reach your machine.

**Full setup guide**: `docs/guides/2026-05-02-1934-cloudflare-tunnel-and-hostfully-webhook-setup.md`

Quick summary of what you need:

1. Install `cloudflared`: `brew install cloudflare/cloudflare/cloudflared`
2. Ask the repo owner to provision a named tunnel for your subdomain and share the tunnel credentials file (`.json`) and config file (`.yml`)
3. Place both files in `~/.cloudflared/`
4. The tunnel config file path must match `TUNNEL_CONFIG` in `scripts/dev.ts` (line ~116)

`pnpm dev` auto-detects whether `cloudflared` is installed and the config files exist. If either is missing, it logs a warning and skips the tunnel — the rest of the stack still starts.

> **Note**: The tunnel UUID in the credentials filename is personal to each developer. Never commit it or share it publicly.

---

## 4. Personal Slack Dev App

**This step is required.** The platform's Slack bot uses Socket Mode. If two developers (or prod + local) share the same `SLACK_APP_TOKEN`, Slack round-robins events across all open sockets and each developer gets roughly half the events. The other half are silently dropped.

The fix is simple: each developer creates their own Slack app and uses their own `xapp-` token locally.

**Full setup guide**: `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md`

The guide covers:

- Creating your dev app from the repo's `manifest.json` (takes ~10 minutes)
- Enabling Socket Mode and getting your personal `xapp-` token
- Registering your dev workspace with the local platform via `pnpm register-dev-slack`
- Verifying you're the sole socket (`num_connections: 1`)

Do not skip this. Using the shared prod token locally is the most common cause of "the bot is silent" on day one.

---

## 5. Env-Var Checklist

`.env.example` is the source of truth. Copy it to `.env` and fill in the values below.

### Personal (each developer sets their own)

| Variable                | Where to get it                                                 | Notes                                   |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------- |
| `SLACK_APP_TOKEN`       | Your dev Slack app → Basic Information → App-Level Tokens       | Must be `xapp-` from YOUR app, not prod |
| `SLACK_SIGNING_SECRET`  | Your dev Slack app → Basic Information → App Credentials        |                                         |
| `SLACK_BOT_TOKEN`       | Your dev Slack app → OAuth & Permissions → Bot User OAuth Token |                                         |
| `SLACK_CLIENT_ID`       | Your dev Slack app → Basic Information → App Credentials        | Only needed for OAuth install flow      |
| `SLACK_CLIENT_SECRET`   | Your dev Slack app → Basic Information → App Credentials        | Only needed for OAuth install flow      |
| `GITHUB_APP_ID`         | GitHub App settings page → App ID                               | Dev and prod use different App IDs      |
| `GITHUB_APP_NAME`       | GitHub App settings page → URL slug                             |                                         |
| `GITHUB_PRIVATE_KEY`    | GitHub App settings → Private keys → Generate                   | Encode newlines as `\n`                 |
| `GITHUB_WEBHOOK_SECRET` | Generate a random string; register it in your GitHub App        |                                         |

### Shared (ask the team for these)

| Variable               | Notes                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`   | Team OpenRouter key for LLM calls                                                                                                                          |
| `OPENCODE_GO_API_KEY`  | Optional — routes compatible models through OpenCodeGo ($10/mo flat). Falls back to OpenRouter if unset.                                                   |
| `SUPABASE_SECRET_KEY`  | Copy `SERVICE_ROLE_KEY` from `docker/.env` (auto-created by `pnpm setup`)                                                                                  |
| `SUPABASE_ANON_KEY`    | Copy `ANON_KEY` from `docker/.env` (auto-created by `pnpm setup`)                                                                                          |
| `ENCRYPTION_KEY`       | Auto-generated by `pnpm setup` if missing. If you're joining an existing team DB, ask for the key — changing it requires re-encrypting all tenant secrets. |
| `SERVICE_TOKEN`        | Machine-to-machine auth for admin API calls. Generate with `openssl rand -hex 32`.                                                                         |
| `VLRE_SLACK_BOT_TOKEN` | Used only by `prisma/seed.ts` on DB reset — ask the team                                                                                                   |

### Tenant secrets (NOT in `.env`)

Hostfully credentials, Sifely lock credentials, and per-tenant Slack bot tokens are stored in the database via the admin API, not in `.env`. The only exception is `VLRE_SLACK_BOT_TOKEN` (seed-only). See the `TENANT SECRETS` block in `.env.example` for the full list and provisioning commands.

### Variables managed via the dashboard (not `.env`)

`WORKER_VM_SIZE`, `COST_LIMIT_USD_PER_DAY`, and other platform behavior defaults live in the `platform_settings` database table. Manage them at `http://localhost:7700/dashboard/settings` or via `PATCH /admin/platform-settings/:key`.

---

## 6. Running `pnpm dev`

Once `.env` is filled in, start the full local stack:

```bash
pnpm dev
```

This starts six things in order:

1. **Docker Compose** — PostgreSQL, PostgREST, Kong, Auth (if not already running)
2. **Prisma migrations** — runs `migrate deploy` (idempotent)
3. **Inngest Dev Server** at `http://localhost:8288` — durable workflow engine
4. **Event Gateway** at `http://localhost:7700` — Express server with Slack Bolt and all API routes (auto-restarts on file changes via `tsx watch`)
5. **Cloudflare Tunnel** — routes `local-ai-employee.dozaldevs.com` to your local gateway (skipped if not configured)
6. **Dashboard Dev Server** at `http://localhost:7700/dashboard/` — Vite with HMR

### What the startup banner means

When all services are up, you'll see:

```
╔══════════════════════════════════════════════════╗
║      Local Full-Stack Environment Ready         ║
╚══════════════════════════════════════════════════╝
  PostgREST:  http://localhost:54331
  Studio:     http://localhost:54323
  Inngest:    http://localhost:8288
  Gateway:    http://localhost:7700 (auto-restart enabled)
  Dashboard:  http://localhost:7700/dashboard/ (HMR via proxy to :7701)
  Tunnel:     https://local-ai-employee.dozaldevs.com
```

Each line confirms a service is healthy. If a line is missing (e.g. `Tunnel:` doesn't appear), that service failed or was skipped — check the output above the banner for the warning.

### Useful flags

```bash
pnpm dev --skip-build   # skip Docker image build (fast restart when you haven't changed worker code)
pnpm dev --reset        # wipe the database and re-seed before starting
pnpm dev --no-tunnel    # start without the Cloudflare tunnel
```

### Stopping

Always stop with **Ctrl+C** (SIGINT). This sends a clean shutdown signal that closes the Slack Socket Mode WebSocket before exiting. Killing the tmux session or using `kill -9` leaves a phantom WebSocket registered with Slack that silently absorbs events for several minutes.

---

## 7. Common First-Day Issues

### "Tunnel config not found" or tunnel skipped

`pnpm dev` looks for `~/.cloudflared/ai-employee-local.yml` and the matching credentials file. If either is missing, it logs a warning and skips the tunnel. The rest of the stack still starts — you just won't receive Slack webhooks or Hostfully callbacks from the internet.

**Fix**: follow Section 3 above to get your tunnel credentials from the repo owner.

### Bot is silent after @mention

The most common cause is a shared `SLACK_APP_TOKEN`. Check how many sockets are open on your app:

```bash
node --input-type=module << 'EOF'
import { WebSocket } from 'ws';
import { config } from 'dotenv';
config();
const resp = await fetch('https://slack.com/api/apps.connections.open', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + process.env.SLACK_APP_TOKEN,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});
const { url } = await resp.json();
const ws = new WebSocket(url + '&debug_reconnects=true');
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'hello') {
    console.log('num_connections:', msg.num_connections);
    ws.close();
  } else if (msg.envelope_id) {
    ws.send(JSON.stringify({ envelope_id: msg.envelope_id }));
  }
});
EOF
```

If `num_connections` is greater than 1 (the probe itself counts as one), another socket is stealing events. Follow Section 4 to create your own dev app.

Also check that only one `pnpm dev` is running:

```bash
pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l
# Expected: 1
```

### PostgREST schema cache error after a migration

After running `pnpm prisma migrate dev` or `pnpm prisma migrate deploy`, PostgREST needs to reload its schema cache before it can see new tables:

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "NOTIFY pgrst, 'reload schema';"
```

Without this, any code that writes to a new table via PostgREST (worker containers, the lifecycle) will get a `"Could not find the table in the schema cache"` error.

### "No installation for team: T..."

Your workspace's Team ID isn't registered in the local database. Run:

```bash
pnpm register-dev-slack --team-id T<your-team-id> --bot-token xoxb-<your-bot-token>
```

See `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md` Step 5 for details.

### Gateway won't start — missing env var

`pnpm dev` checks for required env vars before starting. If one is missing, it prints which one and exits. Add the missing value to `.env` and re-run.

### Docker build fails

Make sure Docker Desktop is running (`docker info` should succeed). If the build fails mid-way, check for disk space (`df -h`) — Docker image layers can fill up fast.

### Task is stuck or failed

If a triggered task never reaches `Done` (or lands in `Failed`), check these in order:

**1. Check the task status and lifecycle trace:**

```bash
TASK_ID=<your-task-id>
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"

PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT from_status, to_status, created_at FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"
```

**2. Check the worker container logs (active during `Executing`):**

```bash
docker logs -f employee-${TASK_ID:0:8}
```

**3. Check the harness log (persists after the container exits):**

```bash
# Harness events only — skip OpenCode noise
grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30

# Errors and warnings only
grep '"level":[45][0-9]' /tmp/employee-${TASK_ID:0:8}.log
```

**4. For deeper diagnosis** (stuck states, approval flow, watchdog behavior), load the `debugging-lifecycle` skill in your OpenCode session — it covers all 13 lifecycle states, root-cause tables, and admin API commands.

---

## Quick Reference

| Task                    | Command                            |
| ----------------------- | ---------------------------------- |
| First-time setup        | `pnpm setup`                       |
| Start everything        | `pnpm dev`                         |
| Fast restart (no build) | `pnpm dev --skip-build`            |
| Run unit tests          | `pnpm test -- --run`               |
| Lint                    | `pnpm lint`                        |
| Build TypeScript        | `pnpm build`                       |
| Trigger a test task     | `pnpm trigger-task`                |
| Dashboard               | `http://localhost:7700/dashboard/` |
| Inngest UI              | `http://localhost:8288`            |
| DB Studio               | `http://localhost:54323`           |

For deeper context on any topic, see [AGENTS.md](../../AGENTS.md) — it's the authoritative reference for the platform.
