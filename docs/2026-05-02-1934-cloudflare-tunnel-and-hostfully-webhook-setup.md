# Cloudflare Tunnel + Hostfully Webhook Setup Guide

**Purpose**: How to configure the named Cloudflare tunnel (`local-ai-employee.dozaldevs.com`) and register it as a Hostfully webhook endpoint so the `guest-messaging` employee receives `NEW_INBOX_MESSAGE` events.

---

## Overview

```
Guest sends message in Hostfully
        ↓
Hostfully → POST https://local-ai-employee.dozaldevs.com/webhooks/hostfully
        ↓
Cloudflare Tunnel → http://localhost:7700/webhooks/hostfully
        ↓
Gateway matches agency_uid → VLRE tenant → guest-messaging archetype
        ↓
Task created → Inngest lifecycle → Fly.io worker → AI drafts reply
        ↓
Slack approval → send via Hostfully API
```

The tunnel is the bridge between Hostfully (external) and your local gateway (port 7700). It must be running whenever you want to receive Hostfully webhooks or perform Slack OAuth.

---

## Status for This Machine (VLRE tenant)

| Prerequisite                                              | Status     | Notes                                                      |
| --------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| `cloudflared` binary installed                            | ✅ Done    | `brew install cloudflare/cloudflare/cloudflared`           |
| Named tunnel created (`e160ac6d-...`)                     | ✅ Done    | Tunnel exists at `~/.cloudflared/`                         |
| DNS route: `local-ai-employee.dozaldevs.com` → tunnel     | ✅ Done    | Managed by Cloudflare DNS                                  |
| Config file `~/.cloudflared/ai-employee-local.yml`        | ✅ Done    | Routes hostname → `localhost:7700`                         |
| Credentials file `~/.cloudflared/e160ac6d-...json`        | ✅ Done    | Auth for this tunnel                                       |
| `SLACK_REDIRECT_BASE_URL` in `.env`                       | ✅ Done    | `https://local-ai-employee.dozaldevs.com`                  |
| VLRE `tenant.config.guest_messaging.hostfully_agency_uid` | ✅ Done    | `942d08d9-82bb-4fd3-9091-ca0c6b50b578` (seeded)            |
| VLRE `guest-messaging` archetype                          | ✅ Done    | ID `00000000-0000-0000-0000-000000000015` (seeded)         |
| Hostfully webhook registered with Hostfully API           | ❓ Unknown | Run `register-webhook.ts` to check/register (see §3 below) |
| `HOSTFULLY_API_KEY` in `.env`                             | ❌ Not set | Needed only to run `register-webhook.ts` locally           |
| `HOSTFULLY_AGENCY_UID` in `.env`                          | ❌ Not set | Needed only to run `register-webhook.ts` locally           |

> **Bottom line**: The tunnel and VLRE tenant DB config are complete. The only open question is whether the Hostfully webhook has been registered via the API. If the guest-messaging employee is already receiving Hostfully events, it has. If not, follow §3 to register it.

---

## Part 1: Cloudflare Tunnel

### Config file (already on this machine)

`~/.cloudflared/ai-employee-local.yml`:

```yaml
tunnel: e160ac6d-2d7d-47c4-a552-b13700947d29
credentials-file: /Users/victordozal/.cloudflared/e160ac6d-2d7d-47c4-a552-b13700947d29.json

ingress:
  - hostname: local-ai-employee.dozaldevs.com
    service: http://localhost:7700
  - service: http_status:404
```

This routes all traffic for `local-ai-employee.dozaldevs.com` to your local gateway on port 7700. The catch-all `http_status:404` is required by cloudflared.

### Starting the tunnel

**Preferred — `pnpm dev:local` starts everything:**

```bash
pnpm dev:local
# Starts: Docker Compose + Inngest (:8288) + Gateway (:7700) + Cloudflare tunnel + Docker image build
# Flags: --skip-build (faster restart), --reset (wipe DB + re-seed)
```

**Manual — tunnel only (if services are already running):**

```bash
cloudflared tunnel --config ~/.cloudflared/ai-employee-local.yml run
# Logs → /tmp/cloudflared.log
```

### Verify the tunnel is alive

```bash
curl https://local-ai-employee.dozaldevs.com/health
# → 200 OK  (requires gateway to also be running on :7700)
```

### What the tunnel is used for

| Use case                   | URL                                                            |
| -------------------------- | -------------------------------------------------------------- |
| Slack OAuth redirect       | `https://local-ai-employee.dozaldevs.com/slack/oauth_callback` |
| Hostfully webhook receiver | `https://local-ai-employee.dozaldevs.com/webhooks/hostfully`   |

---

## Part 2: One-Time Setup (new machine or new contributor)

If you're setting up on a new machine, the tunnel doesn't exist yet. Follow these steps once:

```bash
# 1. Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# 2. Authenticate (opens browser)
cloudflared tunnel login
# → saves cert.pem to ~/.cloudflared/

# 3. Create the named tunnel
cloudflared tunnel create ai-employee-local
# → prints a UUID — save it (e.g. e160ac6d-2d7d-47c4-a552-b13700947d29)
# → saves credentials JSON to ~/.cloudflared/<uuid>.json

# 4. Route the subdomain to the tunnel
cloudflared tunnel route dns ai-employee-local local-ai-employee.dozaldevs.com
# → creates a CNAME in Cloudflare DNS for dozaldevs.com

# 5. Create the config file ~/.cloudflared/ai-employee-local.yml
tunnel: <your-uuid>
credentials-file: /Users/<yourname>/.cloudflared/<your-uuid>.json

ingress:
  - hostname: local-ai-employee.dozaldevs.com
    service: http://localhost:7700
  - service: http_status:404

# 6. Set in .env
SLACK_REDIRECT_BASE_URL=https://local-ai-employee.dozaldevs.com
WEBHOOK_PUBLIC_URL=https://local-ai-employee.dozaldevs.com
```

**For a new contributor with a different subdomain** (e.g. `local-ai-employee-yourname.dozaldevs.com`):

- Use a unique subdomain name: `cloudflared tunnel create ai-employee-yourname`
- Route it: `cloudflared tunnel route dns ai-employee-yourname local-ai-employee-yourname.dozaldevs.com`
- Ask the repo owner to add `https://local-ai-employee-yourname.dozaldevs.com/slack/oauth_callback` to the Slack app's Redirect URLs in the Slack API dashboard
- Update `.env` to use your subdomain

---

## Part 3: Hostfully Webhook Registration

The webhook tells Hostfully where to send `NEW_INBOX_MESSAGE` events. It only needs to be registered once per public URL. The script is idempotent — safe to run again; it skips registration if the same event+URL pair is already registered.

### Prerequisites

- `pnpm dev:local` must be running (tunnel must be alive so Hostfully can reach the URL)
- You need: `HOSTFULLY_API_KEY` and `HOSTFULLY_AGENCY_UID` (from the Hostfully dashboard)

### Register the webhook

```bash
HOSTFULLY_API_KEY="<your-key>" \
HOSTFULLY_AGENCY_UID="942d08d9-82bb-4fd3-9091-ca0c6b50b578" \
WEBHOOK_PUBLIC_URL="https://local-ai-employee.dozaldevs.com" \
  npx tsx src/worker-tools/hostfully/register-webhook.ts
```

On success:

```
✅ Webhook registered successfully!
  UID: <some-uid>
  Event: NEW_INBOX_MESSAGE
  URL: https://local-ai-employee.dozaldevs.com/webhooks/hostfully

Add to .env:
HOSTFULLY_WEBHOOK_UID="<some-uid>"
```

If already registered:

```
✅ Webhook already registered: <uid>
No action needed.
```

Add `HOSTFULLY_WEBHOOK_UID` to your `.env` for future reference.

### VLRE agency UID

| Field          | Value                                  |
| -------------- | -------------------------------------- |
| Agency UID     | `942d08d9-82bb-4fd3-9091-ca0c6b50b578` |
| Tenant ID      | `00000000-0000-0000-0000-000000000003` |
| Archetype ID   | `00000000-0000-0000-0000-000000000015` |
| Archetype role | `guest-messaging`                      |

---

## Part 4: How the Webhook Works (End-to-End)

### What the gateway does when a webhook fires

`POST /webhooks/hostfully` → `src/gateway/routes/hostfully.ts`:

1. Validates the payload shape (Zod)
2. Ignores non-`NEW_INBOX_MESSAGE` events
3. Looks up all tenants and matches `agency_uid` against `tenant.config.guest_messaging.hostfully_agency_uid`
4. Finds the `guest-messaging` archetype for the matched tenant
5. Creates a task with `source_system: 'hostfully'`, `external_id: hostfully-msg-{message_uid}` (idempotent — same message twice returns `{ok: true, duplicate: true}`)
6. Fires `employee/task.dispatched` to Inngest → full lifecycle begins

### Payload shape Hostfully sends

```json
{
  "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
  "event_type": "NEW_INBOX_MESSAGE",
  "message_uid": "<uuid>",
  "thread_uid": "<uuid>",
  "lead_uid": "<uuid>",
  "property_uid": "<uuid>"
}
```

### Test the endpoint locally (without Hostfully)

```bash
curl -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-msg-001",
    "thread_uid": "test-thread-001",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
  }'

# First call  → {"ok":true,"task_id":"<uuid>"}
# Second call → {"ok":true,"duplicate":true}
```

> The lead and property UIDs above are the VLRE test resources from AGENTS.md.

---

## Part 5: Troubleshooting

| Symptom                                                    | Cause                                        | Fix                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `curl health` → connection refused                         | Tunnel running but gateway not started       | Run `pnpm dev:local` or start gateway separately                                          |
| `curl health` → `ERR_CONNECTION_REFUSED` on the public URL | cloudflared not running                      | `cloudflared tunnel --config ~/.cloudflared/ai-employee-local.yml run`                    |
| `cloudflared exited immediately`                           | Bad credentials or config                    | Check `/tmp/cloudflared.log`                                                              |
| Webhook → `{"ok":true,"tenant_not_found":true}`            | `agency_uid` doesn't match any tenant config | Run `pnpm prisma db seed` to re-seed VLRE config                                          |
| Webhook → `{"ok":true,"archetype_not_found":true}`         | `guest-messaging` archetype missing          | Run `pnpm prisma db seed`                                                                 |
| Webhook → 400 `Invalid payload`                            | Hostfully sent unexpected shape              | Check gateway logs for Zod error details                                                  |
| Webhook registered but events not arriving                 | Hostfully still targeting old URL            | Re-register: old webhook must be deleted in Hostfully dashboard first, then re-run script |
| `cloudflared tunnel login` fails                           | No internet or cert expired                  | Re-run `cloudflared tunnel login`                                                         |

---

## Quick Reference

```bash
# Start everything (recommended)
pnpm dev:local

# Verify tunnel
curl https://local-ai-employee.dozaldevs.com/health

# Register Hostfully webhook (one-time, idempotent)
HOSTFULLY_API_KEY="..." HOSTFULLY_AGENCY_UID="942d08d9-82bb-4fd3-9091-ca0c6b50b578" \
WEBHOOK_PUBLIC_URL="https://local-ai-employee.dozaldevs.com" \
  npx tsx src/worker-tools/hostfully/register-webhook.ts

# Test webhook locally
curl -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-001","thread_uid":"t-001","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
```
