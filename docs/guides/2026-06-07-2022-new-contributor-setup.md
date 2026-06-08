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

1. Starts the Docker Compose stack (PostgreSQL, PostgREST, Kong, Auth)
2. Runs Prisma migrations against the `ai_employee` database
3. Seeds the database with two tenants (DozalDevs and VLRE) and their archetypes
4. Builds the Docker worker image (`ai-employee-worker:latest`)
5. Generates `ADMIN_API_KEY` and `ENCRYPTION_KEY` if they're missing from `.env`

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
| `ENCRYPTION_KEY`       | Auto-generated by `pnpm setup` if missing. If you're joining an existing team DB, ask for the key — changing it requires re-encrypting all tenant secrets. |
| `ADMIN_API_KEY`        | Auto-generated by `pnpm setup` if missing                                                                                                                  |
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
