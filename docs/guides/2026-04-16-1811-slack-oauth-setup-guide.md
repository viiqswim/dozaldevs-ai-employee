# Slack OAuth Setup Guide

How to configure the AI Employee Platform's Slack integration for multiple workspaces.

---

## The Credential Hierarchy

```
Slack App  (created once at api.slack.com/apps)
  ├── CLIENT_ID + CLIENT_SECRET  ← app-level OAuth credentials
  ├── SIGNING_SECRET             ← app-level webhook verification
  └── Installations (one per workspace)
        ├── VLRE workspace      → bot_token (xoxb-...)  stored in tenant_secrets
        └── DozalDevs workspace → bot_token (xoxb-...)  stored in tenant_secrets
```

| Credential                | Scope         | Where it lives                     |
| ------------------------- | ------------- | ---------------------------------- |
| `SLACK_CLIENT_ID`         | App-level     | `.env`                             |
| `SLACK_CLIENT_SECRET`     | App-level     | `.env`                             |
| `SLACK_SIGNING_SECRET`    | App-level     | `.env`                             |
| `SLACK_REDIRECT_BASE_URL` | App-level     | `.env`                             |
| `slack_bot_token`         | Per-workspace | `tenant_secrets` table (encrypted) |

`CLIENT_ID` and `CLIENT_SECRET` are the app's OAuth credentials — like a username and password for the app itself. They are not workspace-specific. The per-workspace `bot_token` (`xoxb-...`) is what the bot actually uses to post messages; it is produced once per workspace OAuth install and stored encrypted in the database.

---

## Step 1: Find Your App Credentials

You already have `SLACK_SIGNING_SECRET` set in `.env`, which means a Slack app already exists. `CLIENT_ID` and `CLIENT_SECRET` come from that same app.

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click the app you already created (the one whose signing secret you have)
3. Left sidebar → **Basic Information**
4. Scroll to **App Credentials**:
   - **Client ID** → this is your `SLACK_CLIENT_ID`
   - **Client Secret** → this is your `SLACK_CLIENT_SECRET`
   - **Signing Secret** → this matches what you already have in `.env`

Add these to `.env`:

```
SLACK_CLIENT_ID=<your-client-id>
SLACK_CLIENT_SECRET=<your-client-secret>
SLACK_REDIRECT_BASE_URL=https://<your-cloudflare-tunnel-url>
```

---

## Step 2: Enable Distribution (Required for Multiple Workspaces)

By default, a Slack app is locked to the single workspace it was created in. Attempting to install it in a second workspace returns:

```
invalid_team_for_non_distributed_app
```

To fix this:

1. In your app → left sidebar → **Manage Distribution**
2. Under **"Share Your App with Other Workspaces"** → click **"Activate Public Distribution"**
3. Confirm the prompt

> You do not need to publish the app to the Slack App Directory. Activating distribution simply unlocks the OAuth flow for additional workspaces. The app stays private.

---

## Step 3: Add the OAuth Redirect URL

1. In your app → left sidebar → **OAuth & Permissions**
2. Under **Redirect URLs** → click **Add New Redirect URL**
3. Add: `https://<your-cloudflare-tunnel-url>/slack/oauth_callback`
4. Click **Save URLs**

To get your Cloudflare tunnel URL:

```bash
cloudflared tunnel --url http://localhost:3000
# Output: https://abc-def-123.trycloudflare.com
```

Set that URL in `.env`:

```
SLACK_REDIRECT_BASE_URL=https://abc-def-123.trycloudflare.com
```

> The tunnel URL changes every time you restart `cloudflared`. When it changes, update `.env` and the redirect URL in your Slack app settings.

---

## Step 4: Install to Each Workspace

Once distribution is enabled and the redirect URL is registered, install the bot to each workspace via the admin API:

```bash
# DozalDevs
open "http://localhost:3000/slack/install?tenant=00000000-0000-0000-0000-000000000002"

# VLRE (only needed if migrating from legacy SLACK_BOT_TOKEN)
open "http://localhost:3000/slack/install?tenant=00000000-0000-0000-0000-000000000003"
```

Each install flow:

1. Redirects to Slack — select the correct workspace
2. Slack asks to grant scopes (`channels:history`, `chat:write`, `chat:write.public`)
3. On approval, Slack redirects back to the callback URL
4. The callback stores the workspace's `bot_token` encrypted in `tenant_secrets` and sets `slack_team_id` on the tenant row

---

## Step 5: Configure Channels Per Tenant

After installing, set which channels the summarizer reads from and where it posts:

```bash
ADMIN_KEY="031ef6bd6f06d069a20957bd3fd2699bb9c0d24c161feae9a9b772c69835f374"

# DozalDevs
curl -s -X PATCH \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"summary":{"channel_ids":["C0123...","C0456..."],"target_channel":"C0789..."}}' \
  http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002/config

# VLRE
curl -s -X PATCH \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"summary":{"channel_ids":["C0AMGJQN05S","C0ANH9J91NC","C0960S2Q8RL"],"target_channel":"C0960S2Q8RL"}}' \
  http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000003/config
```

---

## Step 6: VLRE Legacy Token Migration

If VLRE already has a `SLACK_BOT_TOKEN` in `.env` from before multi-tenancy, migrate it into `tenant_secrets` so the bot can resolve it at runtime:

```bash
ADMIN_KEY="031ef6bd6f06d069a20957bd3fd2699bb9c0d24c161feae9a9b772c69835f374"

curl -s -X PUT \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value":"xoxb-...your-vlre-token..."}' \
  http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/slack_bot_token
```

Then set the VLRE team ID (found via `curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" https://slack.com/api/auth.test`):

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "UPDATE tenants SET slack_team_id = 'T0XXXXXXX' WHERE slug = 'vlre';"
```

Once confirmed, you can remove `SLACK_BOT_TOKEN` from `.env` — the bot token now lives in `tenant_secrets`.

---

## Trigger a Summarizer

```bash
ADMIN_KEY="031ef6bd6f06d069a20957bd3fd2699bb9c0d24c161feae9a9b772c69835f374"
TENANT="00000000-0000-0000-0000-000000000002"  # DozalDevs

curl -s -X POST \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger"
```

---

## Verify Setup

```bash
pnpm verify:multi-tenancy
```

Or manually check each tenant:

```bash
ADMIN_KEY="031ef6bd6f06d069a20957bd3fd2699bb9c0d24c161feae9a9b772c69835f374"

# Check tenant state
curl -s -H "X-Admin-Key: $ADMIN_KEY" \
  http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002

# Check secrets (keys only, no values)
curl -s -H "X-Admin-Key: $ADMIN_KEY" \
  http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002/secrets

# Check channel config
curl -s -H "X-Admin-Key: $ADMIN_KEY" \
  http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002/config
```

---

## Troubleshooting

| Error                                  | Cause                                                                           | Fix                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `invalid_team_for_non_distributed_app` | App not enabled for multiple workspaces                                         | Enable distribution: app → Manage Distribution → Activate Public Distribution                          |
| `redirect_uri_mismatch`                | Redirect URL in app settings doesn't match `SLACK_REDIRECT_BASE_URL`            | Add the exact URL to OAuth & Permissions → Redirect URLs                                               |
| `No installation for team: T0XXXXX`    | `slack_team_id` not set on tenant, or `slack_bot_token` not in `tenant_secrets` | Complete the OAuth install flow or run the legacy token migration (Step 6)                             |
| Bot posts in wrong workspace           | `slack_team_id` set to wrong value                                              | Check `SELECT slack_team_id FROM tenants;` and compare against `auth.test`                             |
| Tunnel URL changed                     | `cloudflared` restarted                                                         | Update `SLACK_REDIRECT_BASE_URL` in `.env`, update redirect URL in Slack app settings, restart gateway |
