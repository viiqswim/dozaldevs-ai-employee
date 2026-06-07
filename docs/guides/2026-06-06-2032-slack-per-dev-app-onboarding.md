# Slack Per-Developer App Onboarding Guide

> **Why this exists**: The platform's Slack bot uses Socket Mode. Slack round-robins each event across ALL open sockets for an app — so if two engineers (or prod + local) share the same `SLACK_APP_TOKEN`, each gets ~50% of events. The other 50% are silently dropped. This guide gives each developer their own isolated Slack app so their local gateway is the sole socket on their app.

## Overview

Each developer creates their own Slack app (at `api.slack.com`), installs it to a dev workspace, and sets their personal `xapp-` token in `.env`. `pnpm dev` runs unchanged — no extra tooling needed.

**Time to complete**: ~10 minutes

---

## Prerequisites

- Node ≥20, pnpm, Docker (with Compose plugin)
- `pnpm dev` working locally (run `pnpm setup` first if not)
- A Slack account (free tier is fine)
- A dev/sandbox Slack workspace — **NOT the prod VLRE workspace**. Create one at [slack.com/create](https://slack.com/create) or use an existing personal workspace.

---

## Step 1: Create Your Dev Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From an app manifest**
3. Select your dev workspace (NOT the prod VLRE workspace)
4. Paste the contents of `manifest.json` from the repo root:

   ```bash
   cat manifest.json
   ```

5. Click **Next** → **Create**
6. Optionally rename the app to something personal (e.g. "AI Employee (yourname-dev)") under **Basic Information → Display Information**

---

## Step 2: Enable Socket Mode and Get Your App-Level Token

1. In your app's settings, go to **Settings → Socket Mode**
2. Toggle **Enable Socket Mode** to ON
3. Click **Generate an app-level token**
4. Name it anything (e.g. "local-dev")
5. Add the scope: `connections:write`
6. Click **Generate**
7. Copy the `xapp-` token — you'll need it in Step 6

---

## Step 3: Install the App to Your Dev Workspace

1. Go to **OAuth & Permissions** in your app's settings
2. Click **Install to Workspace** (or **Reinstall to Workspace** if already installed)
3. Authorize the requested permissions
4. Copy the **Bot User OAuth Token** (`xoxb-...`) — you'll need it in Step 5

---

## Step 4: Get Your Workspace Team ID

Your workspace's Team ID starts with `T`. Find it one of two ways:

**Option A — Slack app settings:**

- Go to your app at [api.slack.com/apps](https://api.slack.com/apps)
- Click **Basic Information**
- Under **App Credentials**, look for **Workspace** — the ID in parentheses is your Team ID (e.g. `T0601SMSVEU`)

**Option B — Slack UI:**

- In Slack, click your workspace name (top-left)
- Go to **Settings & administration → Workspace settings**
- The URL contains your Team ID: `app.slack.com/client/T0601SMSVEU/...`

---

## Step 5: Register Your Workspace with the Local Platform

The gateway resolves @mentions by looking up the workspace's Team ID in the database. Without this step, every @mention throws "No installation for team" and the bot is silent.

```bash
pnpm register-dev-slack --team-id T<your-team-id> --bot-token xoxb-<your-bot-token>
```

This defaults to the DozalDevs tenant (`00000000-0000-0000-0000-000000000002`). To use the VLRE tenant instead:

```bash
pnpm register-dev-slack \
  --team-id T<your-team-id> \
  --bot-token xoxb-<your-bot-token> \
  --tenant-id 00000000-0000-0000-0000-000000000003
```

**Expected output:**

```
── Register Dev Slack Workspace ──
→ Registering dev Slack workspace:
  tenant_id: 00000000-0000-0000-0000-000000000002
  team_id:   T0601SMSVEU
  bot_token: xoxb-1234...

── Verifying Tenant ──
✓ Tenant found: DozalDevs (slug: dozaldevs)

── Upserting Slack Integration ──
✓ slack_integrations upserted (provider=slack, external_id=T0601SMSVEU)

── Upserting Bot Token Secret ──
✓ tenant_secrets upserted (key=slack_bot_token, token=xoxb-1234...)

── Verification ──
✓ Read-back successful
  integration.id:         <uuid>
  integration.provider:   slack
  integration.external_id: T0601SMSVEU
  integration.status:     active

── Success ──
✓ Dev Slack workspace registered for tenant DozalDevs!

→ Next steps:
  1. Set your personal app token in .env:
       SLACK_APP_TOKEN=xapp-<your-personal-token>
  2. Restart the dev server:
       pnpm dev
  3. @mention the bot in your sandbox workspace — it should respond.

⚠ This registration is idempotent — safe to re-run if the token changes.
```

This command is **idempotent** — safe to re-run if your bot token changes.

---

## Step 6: Set Your Personal App Token in `.env`

Open `.env` and replace the `SLACK_APP_TOKEN` value with your personal `xapp-` token from Step 2:

```bash
# Before (shared/prod token — DO NOT use locally):
SLACK_APP_TOKEN="xapp-1-A09678HT90S-..."

# After (your personal dev token):
SLACK_APP_TOKEN="xapp-1-A0YOURAPPID-..."
```

> **Important**: This is YOUR personal token. Never commit it, never share it. It's already in `.gitignore` via the `.env` entry.

---

## Step 7: Restart `pnpm dev` and Verify

```bash
pnpm dev
```

Look for this in the logs:

```
✓ Socket Mode connected
```

**Verify you're the sole socket** (expected: `num_connections: 1`):

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

If `num_connections: 1` — you're isolated. If it's higher, another process is sharing your app's socket (see Troubleshooting).

**Final test**: @mention the bot in your dev workspace. You should see the "On it…" confirmation card appear.

---

## Troubleshooting

### "No installation for team: T..."

The gateway can't find your workspace's Team ID in the database. Run Step 5 again:

```bash
pnpm register-dev-slack --team-id T<your-team-id> --bot-token xoxb-<your-bot-token>
```

### Bot is silent — no "On it…" ack, no error

Check `num_connections` with the probe above. If it's > 1, another socket is stealing events:

1. Make sure you're running only ONE `pnpm dev` (the single-instance guard should catch this)
2. Check if the prod gateway is sharing your app's socket — this shouldn't happen if you created a NEW app (not the prod "Papi Chulo" app)
3. If you accidentally used the prod `SLACK_APP_TOKEN`, replace it with your personal `xapp-` token and restart

### "SLACK_APP_TOKEN is not set" on `pnpm dev` startup

Add your personal `xapp-` token to `.env`:

```bash
SLACK_APP_TOKEN="xapp-1-A0YOURAPPID-..."
```

### Stale `.env` token shadowing

If you previously had the shared prod token in `.env` and replaced it, make sure the old value is gone. `pnpm dev` loads `.env` and won't overwrite already-set env vars — so if the old token is still in `.env`, it will be used.

### `num_connections` is 2 after a clean restart

One connection is your gateway, one is the probe itself. This is expected — the probe opens a socket to read `hello`, then closes it. If you see 3+, a phantom socket from a previous unclean shutdown may still be registered with Slack. Wait a few minutes for Slack to expire it, or restart `pnpm dev` cleanly with Ctrl+C.

---

## Reference

| Item                          | Value                                  |
| ----------------------------- | -------------------------------------- |
| Dev app manifest              | `manifest.json` (repo root)            |
| Registration script           | `pnpm register-dev-slack --help`       |
| DozalDevs tenant ID           | `00000000-0000-0000-0000-000000000002` |
| VLRE tenant ID                | `00000000-0000-0000-0000-000000000003` |
| Prod app (DO NOT use locally) | app_id `A09678HT90S`, bot "Papi Chulo" |
| AGENTS.md Known Issue #5      | Phantom Socket Mode connections        |
