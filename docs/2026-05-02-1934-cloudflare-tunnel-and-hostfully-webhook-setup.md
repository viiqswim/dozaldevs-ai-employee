# Cloudflare Tunnel + Hostfully Webhook Setup Guide

**Purpose**: How the named Cloudflare tunnel (`local-ai-employee.dozaldevs.com`) is configured, how Hostfully webhooks currently reach `vlre-employee`, and what is needed for `ai-employee` to also receive them.

---

## Two-System Context

There are **two separate local systems** that both need to receive Hostfully `NEW_INBOX_MESSAGE` events:

| System                       | Repo                               | Port    | Tunnel            | Path                       | Status                                |
| ---------------------------- | ---------------------------------- | ------- | ----------------- | -------------------------- | ------------------------------------- |
| `vlre-employee` (Papi Chulo) | `/repos/real-estate/vlre-employee` | `48901` | Tailscale Funnel  | `POST /webhook`            | ✅ Active — registered with Hostfully |
| `ai-employee`                | `/repos/dozal-devs/ai-employee`    | `7700`  | Cloudflare tunnel | `POST /webhooks/hostfully` | ⏳ Not yet registered with Hostfully  |

**Current flow** (production):

```
Guest sends message in Hostfully
        ↓
Hostfully → POST https://<tailscale-hostname>/webhook
        ↓
Tailscale Funnel → http://localhost:48901/webhook
        ↓
vlre-employee pipeline → Slack approval → Hostfully API
```

**Cloudflare tunnel** (`local-ai-employee.dozaldevs.com → localhost:7700`) is currently used **only for Slack OAuth**. It is not the registered Hostfully webhook URL.

> **The fanout problem**: Hostfully supports only one registered webhook per event type. To compare both systems simultaneously, a local fanout proxy is needed. See [Part 5: Dual-System Fanout](#part-5-dual-system-fanout-receiving-webhooks-in-both-apps-simultaneously).

---

## VLRE Prerequisites Status (as of 2026-05-03)

### Cloudflare tunnel (ai-employee — Slack OAuth)

| Prerequisite                                          | Status  | Notes                                            |
| ----------------------------------------------------- | ------- | ------------------------------------------------ |
| `cloudflared` binary installed                        | ✅ Done | `brew install cloudflare/cloudflare/cloudflared` |
| Named tunnel created (`e160ac6d-...`)                 | ✅ Done | Credentials at `~/.cloudflared/e160ac6d-...json` |
| DNS route: `local-ai-employee.dozaldevs.com` → tunnel | ✅ Done | Managed by Cloudflare DNS                        |
| Config file `~/.cloudflared/ai-employee-local.yml`    | ✅ Done | Routes hostname → `localhost:7700`               |
| `SLACK_REDIRECT_BASE_URL` in ai-employee `.env`       | ✅ Done | `https://local-ai-employee.dozaldevs.com`        |

### VLRE tenant DB config (ai-employee)

| Prerequisite                                         | Status  | Notes                                              |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `tenant.config.guest_messaging.hostfully_agency_uid` | ✅ Done | `942d08d9-82bb-4fd3-9091-ca0c6b50b578` (seeded)    |
| `guest-messaging` archetype                          | ✅ Done | ID `00000000-0000-0000-0000-000000000015` (seeded) |

### Hostfully webhook (vlre-employee — currently active)

| Prerequisite                             | Status  | Notes                                                      |
| ---------------------------------------- | ------- | ---------------------------------------------------------- |
| Tailscale Funnel running on port `48901` | ✅ Done | Auto-started by `bun run start` in vlre-employee           |
| Webhook registered with Hostfully        | ✅ Done | Points to Tailscale public URL → `localhost:48901/webhook` |
| `HOSTFULLY_API_KEY`                      | ✅ Done | Set in vlre-employee's `.env` (not in ai-employee)         |
| `HOSTFULLY_AGENCY_UID`                   | ✅ Done | Set in vlre-employee's `.env` (not in ai-employee)         |

### Hostfully webhook (ai-employee — not yet receiving)

| Prerequisite                                         | Status      | Notes                                                     |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------- |
| `POST /webhooks/hostfully` route exists              | ✅ Done     | `src/gateway/routes/hostfully.ts`                         |
| Cloudflare tunnel exposing `:7700`                   | ✅ Done     | Must be running via `pnpm dev:local`                      |
| Hostfully webhook registered pointing to ai-employee | ❌ Not done | Blocked: Hostfully only supports one webhook — see Part 5 |

> **Bottom line**: All ai-employee infrastructure is in place. The only missing piece is getting Hostfully to send events to ai-employee — which requires solving the fanout problem since vlre-employee is already registered.

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

| Use case                                      | URL                                                            |
| --------------------------------------------- | -------------------------------------------------------------- |
| Slack OAuth redirect                          | `https://local-ai-employee.dozaldevs.com/slack/oauth_callback` |
| Hostfully webhooks (future — requires fanout) | `https://local-ai-employee.dozaldevs.com/webhooks/hostfully`   |

> The Cloudflare tunnel is **not** the current registered Hostfully webhook URL. That is the Tailscale Funnel URL (vlre-employee). See Part 5 for how to receive webhooks in both systems simultaneously.

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

## Part 5: Dual-System Fanout — Receiving Webhooks in Both Apps Simultaneously

### The Problem

Hostfully supports only **one registered webhook URL** per event type. `vlre-employee` is already registered at the Tailscale Funnel URL. Adding `ai-employee` as a second recipient requires a fanout layer that receives the single Hostfully event and forwards it to both apps in parallel.

### Key Insight: Tailscale port changes don't require Hostfully re-registration

From vlre-employee's README:

> "You only need to re-register if the public URL changes. Changing `WEBHOOK_PORT` does **not** require re-registration because Tailscale Funnel always serves on public port 443 regardless of the local port."

This means we can redirect the Tailscale Funnel to a **new fanout server** on a different local port, and the Hostfully-registered URL stays exactly the same.

### Recommended Solution: Local Fanout Proxy

```
Hostfully → POST https://<tailscale-hostname>/webhook   (unchanged — no Hostfully config change)
                    ↓
        Tailscale Funnel (now points to :18080 instead of :48901)
                    ↓
            Fanout Proxy (:18080)
            ↙                    ↘  (parallel, fire-and-forget)
localhost:48901/webhook    localhost:7700/webhooks/hostfully
    ↓                               ↓
vlre-employee                  ai-employee
(unchanged behavior)         (new — for comparison)
```

**Steps to implement:**

1. **Write a fanout proxy script** (small tsx or Bun script, ~50 lines):
   - Listens on port `18080`
   - On `POST /webhook` or `POST /webhooks/hostfully` (accept both): forward the raw body to both downstream targets in parallel using `Promise.all()`
   - Return 200 immediately (don't wait for downstream responses — Hostfully expects a fast ack)
   - Log both downstream responses for observability

2. **Switch the Tailscale Funnel** from port `48901` to `18080`:

   ```bash
   # Stop existing funnel
   tailscale funnel reset
   # Start new one pointing to the fanout
   tailscale funnel --bg 18080
   ```

3. **Verify nothing broke for vlre-employee**:

   ```bash
   # Tailscale public URL is unchanged — test it
   curl -X POST https://<tailscale-hostname>/webhook \
     -H "Content-Type: application/json" \
     -d '{"event_type":"NEW_INBOX_MESSAGE","agency_uid":"942d08d9-...","message_uid":"fanout-test-001",...}'
   # Both apps should receive the event simultaneously
   ```

4. **No Hostfully re-registration needed** — the external URL hasn't changed.

### Alternative: Use vlre-employee's simulate script as a manual fanout

`vlre-employee` has a simulate script that fires a real Hostfully message through its own pipeline. You can manually fire the same message UID at ai-employee too:

```bash
# In vlre-employee: pick a real message UID
bun run scripts/simulate-webhook.ts --list

# Fire it through vlre-employee normally
bun run scripts/simulate-webhook.ts --uid <message-uid>

# Fire the same message UID at ai-employee manually
curl -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"<message-uid>","thread_uid":"<thread-uid>","lead_uid":"<lead-uid>","property_uid":"<property-uid>"}'
```

This is the lowest-friction option for occasional one-off comparisons — no infrastructure changes needed.

### Webhook paths differ between the two systems

| System          | Expected path              | Port    |
| --------------- | -------------------------- | ------- |
| `vlre-employee` | `POST /webhook`            | `48901` |
| `ai-employee`   | `POST /webhooks/hostfully` | `7700`  |

Any fanout proxy must map between these paths explicitly.

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
