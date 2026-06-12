# Slack Per-Developer App Onboarding Guide

> **Why this exists**: The platform's Slack bot uses Socket Mode. Slack round-robins each event across ALL open sockets for an app — so if two engineers (or prod + local) share the same `SLACK_APP_TOKEN`, each gets ~50% of events. The other 50% are silently dropped. This guide gives each developer their own isolated Slack app so their local gateway is the sole socket on their app.

## Overview

Each developer creates their own Slack app (at `api.slack.com`), installs it to a dev workspace, and sets their personal `xapp-` token in `.env`. `pnpm dev` runs unchanged — no extra tooling needed.

**Time to complete**: ~10 minutes (basic single-workspace setup)

---

## Critical Concept: Two Tokens, One App (read this first)

Every Slack app produces two completely different tokens. They are a **matched pair** — both must belong to the SAME app or things break in subtle, hard-to-debug ways.

| Token         | Prefix  | What it does                                                               | Causes round-robin?                                             |
| ------------- | ------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **App token** | `xapp-` | Opens the Socket Mode WebSocket — this is how your gateway RECEIVES events | Yes — every open socket on the same app splits the event stream |
| **Bot token** | `xoxb-` | Authenticates HTTP API calls — posts messages, reads channels, posts cards | No — HTTP calls don't open a socket                             |

**Two hard rules before you start:**

1. **Round-robin is per-app, not per-token.** Two sockets on the SAME app (e.g. prod + local both using app `A09678HT90S`) split events 50/50 regardless of which token strings you use. Two DIFFERENT apps are fully isolated. The fix is your OWN app — not just a different token string from the same app.

2. **Your local `xapp-` and `xoxb-` MUST belong to the same app.** If your socket is on App X but you post messages with App Y's `xoxb-`: the wrong bot posts your cards AND button clicks (Confirm/Cancel) silently die. Slack routes interactive payloads back to the app that OWNS the message — which is listening on a different socket. This is a real incident: "Papi Chulo" replied to a "Demo App" @mention and the Confirm button did nothing, because the card was posted by Papi Chulo's token while the socket was on Demo App.

> **Workspace prefix trap**: All tokens from one workspace share a numeric prefix (e.g. `xoxb-6001905913504-...`). Two DIFFERENT apps in the same workspace produce `xoxb-` tokens with the SAME prefix but different suffixes. Never match tokens by eyeballing the prefix — always verify with `auth.test` (see Step 5a).

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

> **Strongly prefer "From an app manifest" over "From scratch".** A manually-created app does NOT auto-configure Event Subscriptions or OAuth scopes. You'd have to add `app_mention` under Event Subscriptions and all bot scopes under OAuth & Permissions by hand — forgetting any of them makes the bot silently receive nothing. The manifest sets all of this for you in one paste.

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

### Step 5a: Verify the Token Identity BEFORE Registering

The workspace-prefix trap makes it easy to accidentally register the wrong app's bot token. Before running `register-dev-slack`, confirm the `xoxb-` token you're about to use belongs to YOUR dev app — not prod Papi Chulo or another app.

```bash
curl -s "https://slack.com/api/auth.test" -H "Authorization: Bearer xoxb-<your-bot-token>" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('bot:',d.user,'| bot_id:',d.bot_id,'| team:',d.team,'('+d.team_id+')');"
```

Confirm `bot:` shows YOUR dev app's bot handle (e.g. `demo_app` or `remi_victor_1`) and NOT `papichulo`. If it says `papichulo`, you grabbed the prod bot token — go back to your app's **OAuth & Permissions** page and copy the Bot User OAuth Token from THERE.

### Register the workspace

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

## Optional: Install Your Dev App into a Second Workspace (e.g. VLRE)

One Slack app can be installed in multiple workspaces. Prod proves this — the single Papi Chulo app serves both Dozal Inc. and VLRE through ONE socket. Slack tags every event with its `team_id`; the gateway looks up all tenants connected to that workspace, then resolves which employee owns the channel across all of them. So to test VLRE-tenant employees locally with YOUR app, install your existing dev app into the VLRE workspace too.

This does NOT add a second socket and does NOT recreate round-robin. Still one app = one socket; adding a workspace adds zero sockets.

**1. Swap `.env` OAuth credentials to YOUR dev app.**

The platform's `/slack/install` flow uses `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_SIGNING_SECRET`. By default `.env` holds the prod Papi Chulo values. Replace all three with YOUR dev app's values from **Basic Information → App Credentials**.

These are three SEPARATE fields — don't confuse Client Secret with Signing Secret. Restart `pnpm dev` after editing `.env` (it's read at startup).

**2. Add the OAuth redirect URL on your app.**

In your app: **OAuth & Permissions → Redirect URLs → Add New Redirect URL**:

```
https://local-ai-employee.dozaldevs.com/slack/oauth_callback
```

This is `${SLACK_REDIRECT_BASE_URL}/slack/oauth_callback`. The tunnel `local-ai-employee.dozaldevs.com` forwards to your local gateway.

**3. Activate Public Distribution.**

In your app: **Manage Distribution → Activate Public Distribution**.

This is REQUIRED for cross-workspace installs — installing your app into a workspace OTHER than the one it was created in. Same-workspace installs via "Install to Workspace" don't need this, which is why the first workspace worked without it.

**4. Run the install** (with `pnpm dev` running):

Open this URL in your browser:

```
https://local-ai-employee.dozaldevs.com/slack/install?tenant=00000000-0000-0000-0000-000000000003
```

On the Slack consent screen, use the top-right workspace picker to select **VLRE**, then click **Allow**. You should land on "Connected to VLRE. You can close this tab." The callback auto-stores the bot token into the VLRE tenant's `tenant_secrets` and upserts the integration — no manual `register-dev-slack` needed for this OAuth path.

**5. Invite and test.**

In a VLRE channel mapped to an employee, run `/invite @<your-app>`, then @mention it.

> After this, your LOCAL VLRE `tenant_secrets.slack_bot_token` holds YOUR dev app's token instead of prod Papi Chulo's. This only affects your LOCAL database — prod is untouched. VLRE employees triggered locally will post as your dev app, which is correct for testing.

---

## App Name vs Bot Display Name (they're different)

Slack has two separate names and renaming one does NOT change the other:

- **App name** (Basic Information → Display Information): shown in the admin UI, app directory, and install screen.
- **Bot Display Name** (App Home → "Your App's Presence in Slack"): the name shown ON messages the bot posts in channels.

Real incident: an app renamed to "REMI - Victor 1" still posted messages as "Demo App" because only the app name was changed, not the bot display name.

**Fix**: Go to **App Home → Your App's Presence in Slack → edit Display Name (and Default Name)**, then **reinstall** the app (OAuth & Permissions → Reinstall to Workspace) for BOTH workspaces it's installed in. The display name is baked in at install time, so reinstalling is required for the change to take effect.

Verify the live display name with:

```bash
# Step 1: get the bot user id
curl -s "https://slack.com/api/auth.test" -H "Authorization: Bearer xoxb-<token>" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('bot_user_id:', d.user_id);"

# Step 2: look up its profile real_name
curl -s "https://slack.com/api/users.info?user=<bot_user_id>" -H "Authorization: Bearer xoxb-<token>" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('display:', d.user.profile.real_name);"
```

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

### The wrong bot replied (e.g. "Papi Chulo" instead of your dev app)

**Cause**: the `xoxb-` bot token stored in `tenant_secrets` for that tenant belongs to a DIFFERENT app than your `xapp-` socket. The @mention triggers YOUR app's socket, but the gateway posts the card using the stored (wrong) bot token. The card appears to come from Papi Chulo even though your local gateway handled the event.

**Fix**: verify with `auth.test` (Step 5a) that your `xoxb-` token is the right one, then re-run `pnpm register-dev-slack` with YOUR app's correct bot token. To inspect what's actually stored in the database right now, see the decrypt-and-verify snippet below.

### Confirm/Cancel buttons do nothing

**Cause**: same token mismatch as above. The card was posted by App Y's bot token, so Slack sends the button click back to App Y (often prod). Your local gateway on App X never receives it. Confirm there are zero `block_actions` lines in your gateway log when you click — if there are none, the click never arrived.

**Fix**: ensure the SAME app owns both the `xapp-` socket and the `xoxb-` posting token. Re-register the correct bot token via `pnpm register-dev-slack`.

### OAuth install shows `{"error":"MISSING_PARAMS"}`

**Symptom**: after clicking Allow on the Slack consent screen, the browser lands on `/slack/oauth_callback?code=<garbage>` with no `state` parameter, and the page shows `{"error":"MISSING_PARAMS"}`.

**Cause**: the consent flow never completed cleanly at Slack. The most common reasons are:

- **Public Distribution isn't activated** (required for cross-workspace installs) — go to Manage Distribution and activate it, then retry.
- A stale or redirected browser tab that lost the `state` parameter mid-flow.

The gateway requires BOTH `code` and `state` on the callback. Activate distribution, confirm the redirect URL is saved, and retry in a fresh tab.

### Gateway logs only show in the terminal (can't grep)

`pnpm dev` does NOT write the gateway log to a file by default. To get a searchable log for debugging, run:

```bash
pnpm dev 2>&1 | tee /tmp/ai-dev.log
```

Then grep for the flow:

```bash
grep "app_mention event received" /tmp/ai-dev.log
grep "Trigger confirmation card posted" /tmp/ai-dev.log
grep "block_actions" /tmp/ai-dev.log
```

### Inspect which bot token is actually stored (decrypt-and-verify)

When in doubt about what's in `tenant_secrets`, decrypt and identify it. Replace `<TENANT_ID>` with the tenant you're checking (see the Reference table below for IDs):

```bash
ENCRYPTION_KEY=$(grep '^ENCRYPTION_KEY=' .env | cut -d'=' -f2- | tr -d '"')
FULL=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -F'|' \
  -c "SELECT ciphertext, iv, auth_tag FROM tenant_secrets WHERE key='slack_bot_token' AND tenant_id='<TENANT_ID>';")
CT=$(echo "$FULL"|cut -d'|' -f1); IV=$(echo "$FULL"|cut -d'|' -f2); TAG=$(echo "$FULL"|cut -d'|' -f3)
node -e "const c=require('crypto');const k=Buffer.from('$ENCRYPTION_KEY','hex');const d=c.createDecipheriv('aes-256-gcm',k,Buffer.from('$IV','base64'));d.setAuthTag(Buffer.from('$TAG','base64'));let t=d.update(Buffer.from('$CT','base64'),undefined,'utf8');t+=d.final('utf8');require('fs').writeFileSync('/tmp/t.txt',t);"
curl -s "https://slack.com/api/auth.test" -H "Authorization: Bearer $(cat /tmp/t.txt)" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('stored bot:',d.user,'| team:',d.team);"; rm -f /tmp/t.txt
```

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

| Item                          | Value                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| Dev app manifest              | `manifest.json` (repo root)                                                |
| Registration script           | `pnpm register-dev-slack --help`                                           |
| DozalDevs tenant ID           | `00000000-0000-0000-0000-000000000002`                                     |
| VLRE tenant ID                | `00000000-0000-0000-0000-000000000003`                                     |
| Prod app (DO NOT use locally) | app_id `A09678HT90S`, bot "Papi Chulo"                                     |
| AGENTS.md Known Issue #5      | Phantom Socket Mode connections                                            |
| OAuth redirect URL            | `https://local-ai-employee.dozaldevs.com/slack/oauth_callback`             |
| Multi-workspace install URL   | `https://local-ai-employee.dozaldevs.com/slack/install?tenant=<tenant-id>` |
| Verify a token's identity     | `curl auth.test` (see Step 5a)                                             |
| Bot display name setting      | App Home → Your App's Presence in Slack (reinstall to apply)               |
