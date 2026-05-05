# Guest-Messaging Employee — E2E Manual Testing Guide

> **Audience**: Developer or PM running the full guest-messaging pipeline locally, from webhook through Slack interaction through delivery.
>
> **Covers**: All three approval actions (Approve, Edit, Reject) plus supporting scenarios. Includes both mock mode (no real Hostfully API calls) and real-API mode.
>
> **Single-file reference** — all steps in one place. Companion to the split scenario files in this directory.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Prerequisites Checklist](#2-prerequisites-checklist)
3. [Choose Your Testing Mode](#3-choose-your-testing-mode)
4. [Start the Stack](#4-start-the-stack)
5. [Verify the Stack is Healthy](#5-verify-the-stack-is-healthy)
6. [How to Send a Test Webhook](#6-how-to-send-a-test-webhook)
7. [Watch the Lifecycle Execute](#7-watch-the-lifecycle-execute)
8. [Scenario A — Approve & Send](#8-scenario-a--approve--send)
9. [Scenario B — Edit & Send](#9-scenario-b--edit--send)
10. [Scenario C — Reject](#10-scenario-c--reject)
11. [How to Check Task Status at Any Time](#11-how-to-check-task-status-at-any-time)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Quick Reference

| Item                         | Value                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway                      | `http://localhost:7700`                                                                                                                  |
| Inngest dashboard            | `http://localhost:8288`                                                                                                                  |
| Supabase PostgREST           | `http://localhost:54321`                                                                                                                 |
| Cloudflare tunnel            | `https://local-ai-employee.dozaldevs.com`                                                                                                |
| Slack approval channel       | `C0960S2Q8RL`                                                                                                                            |
| VLRE Tenant ID               | `00000000-0000-0000-0000-000000000003`                                                                                                   |
| VLRE Agency UID              | `942d08d9-82bb-4fd3-9091-ca0c6b50b578`                                                                                                   |
| Guest-messaging Archetype ID | `00000000-0000-0000-0000-000000000015`                                                                                                   |
| Test lead UID                | `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`                                                                                                   |
| Test thread UID              | `2f18249a-9523-4acd-a512-20ff06d5c3fa`                                                                                                   |
| Test property UID            | `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`                                                                                                   |
| Hostfully inbox URL          | `https://platform.hostfully.com/app/#/inbox?threadUid=2f18249a-9523-4acd-a512-20ff06d5c3fa&leadUid=37f5f58f-d308-42bf-8ed3-f0c2d70f16fb` |

---

## 2. Prerequisites Checklist

Work through every item in order before sending any webhooks. If the automated preflight script is available, you can run it instead:

```bash
npx tsx scripts/preflight-guest-messaging.ts
```

The script checks and auto-fixes most items. If any check fails, follow the manual steps below.

### 2.1 — Required environment variables

Open `.env` and confirm every variable below is present and non-empty:

```bash
grep -E "^(DATABASE_URL|SUPABASE_URL|SUPABASE_SECRET_KEY|INNGEST_EVENT_KEY|INNGEST_SIGNING_KEY|ADMIN_API_KEY|ENCRYPTION_KEY|SLACK_APP_TOKEN|SLACK_SIGNING_SECRET|OPENROUTER_API_KEY)=" .env
```

**Expected**: 10 lines printed, each with a value after `=`.

| Variable               | What it's for                                                |
| ---------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`         | `postgresql://postgres:postgres@localhost:54322/ai_employee` |
| `SUPABASE_URL`         | `http://localhost:54321`                                     |
| `SUPABASE_SECRET_KEY`  | Supabase service role key (in `docker/.env`)                 |
| `INNGEST_EVENT_KEY`    | Any non-empty string for local dev                           |
| `INNGEST_SIGNING_KEY`  | Any non-empty string for local dev                           |
| `ADMIN_API_KEY`        | Generated by `pnpm setup`                                    |
| `ENCRYPTION_KEY`       | 64-char hex, generated by `pnpm setup`                       |
| `SLACK_APP_TOKEN`      | `xapp-...` for Socket Mode                                   |
| `SLACK_SIGNING_SECRET` | From Slack app settings                                      |
| `OPENROUTER_API_KEY`   | For the MiniMax model via OpenRouter                         |

### 2.2 — Docker is running

```bash
docker info --format '{{.ServerVersion}}' 2>/dev/null && echo "✅ Docker OK" || echo "❌ Docker not running — start Docker Desktop"
```

### 2.3 — Worker Docker image is built and up to date

The guest-messaging worker runs inside a Docker container. It must be rebuilt whenever you change worker code or `.env` variables that affect the container environment (including `HOSTFULLY_MOCK`).

```bash
docker build -t ai-employee-worker:latest .
```

This takes ~2 minutes the first time, ~30 seconds with cache. You only need to redo this when code under `src/workers/` or `src/worker-tools/` changes, or when switching mock mode on/off.

### 2.4 — VLRE tenant exists in the database

```bash
source .env

curl -s "http://localhost:54321/tenants?id=eq.00000000-0000-0000-0000-000000000003" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0] | {id, name, slug}'
```

**Expected**:

```json
{ "id": "00000000-0000-0000-0000-000000000003", "name": "VLRE", "slug": "vlre" }
```

If empty: the database was wiped. Run `pnpm prisma migrate deploy && pnpm prisma db seed`.

### 2.5 — Guest-messaging archetype exists

```bash
source .env

curl -s "http://localhost:54321/archetypes?id=eq.00000000-0000-0000-0000-000000000015" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0] | {id, role_name, slug, runtime}'
```

**Expected**:

```json
{
  "id": "00000000-0000-0000-0000-000000000015",
  "role_name": "Guest Messaging Agent",
  "slug": "guest-messaging",
  "runtime": "opencode"
}
```

If missing: run `pnpm prisma db seed`.

### 2.6 — VLRE Slack OAuth is connected

```bash
source .env

curl -s "http://localhost:54321/tenant_integrations?tenant_id=eq.00000000-0000-0000-0000-000000000003&provider=eq.slack" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0] | {tenant_id, provider, external_id}'
```

**Expected**: A row with `provider: "slack"` and a non-null `external_id` (Slack team ID, e.g. `T06KFDGLHS6`).

If empty or null: re-run Slack OAuth.

1. Make sure `pnpm dev:local` is running (needs the Cloudflare tunnel for the OAuth callback)
2. Open in browser: `http://localhost:7700/slack/install?tenant=00000000-0000-0000-0000-000000000003`
3. Select the VLRE workspace (`vlreworkspace.slack.com`) and complete the flow
4. Re-run the check above

### 2.7 — Hostfully API key stored as tenant secret

The worker reads secrets from the database, not from `.env`. The `hostfully_api_key` must be stored for the VLRE tenant.

**Check if it's already stored:**

```bash
source .env

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[] | select(.key == "hostfully_api_key")'
```

**Expected**: A row with `"key": "hostfully_api_key"`. Values are never returned — only the key name confirms it exists.

**If missing — store it:**

```bash
source .env

curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/hostfully_api_key" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"value\":\"$HOSTFULLY_API_KEY\"}"
```

**Expected**: `{ "ok": true }`

> **Note**: This step is only required for real-API mode. In mock mode, the worker never calls Hostfully, so the API key is not used. However, storing it is harmless and keeps real-API mode ready.

---

## 3. Choose Your Testing Mode

You have two modes. Choose one before starting the stack.

### Mode 1: Mock Mode (recommended for local development)

`HOSTFULLY_MOCK=true` in `.env`

What changes:

- `get-messages.ts` returns a **fixture** — a guest asking "what's the WiFi password?" — instead of calling Hostfully
- `send-message.ts` returns `{ "sent": true, "messageId": "mock-message-id-001" }` — no real message is sent to any guest
- `get-property.ts` and `get-reservations.ts` also return fixtures
- All Slack interactions are real (buttons, modals, thread replies)
- The LLM model still runs and generates a real draft — OpenRouter credits are consumed

**To enable:**

```bash
# In .env, add or update:
HOSTFULLY_MOCK=true
```

Then rebuild the Docker image:

```bash
docker build -t ai-employee-worker:latest .
```

### Mode 2: Real API Mode

`HOSTFULLY_MOCK` is unset or `false` in `.env`

What changes:

- The model polls Hostfully for **real unresponded messages** in the test lead's thread
- Approving actually **sends an irreversible message to the guest** via their booking channel (Airbnb, VRBO, etc.)
- If no unresponded messages exist in Hostfully at execution time, the model returns `NO_ACTION_NEEDED` regardless of the webhook payload
- A Cloudflare tunnel is required (for Slack OAuth callback)

**To enable:**

```bash
# In .env — remove or comment out:
# HOSTFULLY_MOCK=true
```

Then rebuild the Docker image:

```bash
docker build -t ai-employee-worker:latest .
```

> **Warning for real-API mode**: Only approve tasks where you intend to actually send that message to a real guest. Edit or reject anything else.

---

## 4. Start the Stack

The stack includes: Docker Compose (Postgres, PostgREST), Gateway (port 7700), Inngest dev server (port 8288), Slack Bolt (Socket Mode), and optionally the Cloudflare tunnel.

**This is a long-running command — always launch it in tmux:**

```bash
# Kill any stale session first
tmux kill-session -t ai-dev 2>/dev/null

# Start a new session
tmux new-session -d -s ai-dev -x 220 -y 50
tmux send-keys -t ai-dev \
  "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev:local 2>&1 | tee /tmp/ai-dev.log" \
  Enter

# Watch the startup logs
sleep 15 && tail -40 /tmp/ai-dev.log
```

`pnpm dev:local` starts everything including the named Cloudflare tunnel (`local-ai-employee.dozaldevs.com → :7700`). The tunnel is required for Slack OAuth but not for sending test webhooks locally.

If you only need to test without Slack OAuth setup, you can use `pnpm dev:start` instead (no tunnel, no Docker build).

---

## 5. Verify the Stack is Healthy

Run all of these checks after startup to confirm everything is connected:

### 5.1 — Gateway health

```bash
curl -s http://localhost:7700/health | jq .
```

**Expected**: `{ "status": "ok" }`

### 5.2 — Inngest is reachable

Open `http://localhost:8288` in your browser.

**Expected**: The Inngest dashboard loads and shows the `employee/universal-lifecycle` function under Functions.

### 5.3 — Slack Socket Mode is connected

Check the logs:

```bash
grep -i "socket mode" /tmp/ai-dev.log | tail -5
```

**Expected**: A line containing `Slack Bolt — Socket Mode connected`.

If missing, `SLACK_APP_TOKEN` (`xapp-...`) is not set in `.env`, or the Slack app's Socket Mode is not enabled. Slack button clicks will not reach the gateway.

### 5.4 — Tunnel is reachable (real-API mode only)

```bash
curl -s https://local-ai-employee.dozaldevs.com/health | jq .
```

**Expected**: `{ "status": "ok" }`

If this fails, the Cloudflare tunnel is down. Check: `tail -50 /tmp/ai-dev.log | grep cloudflare`.

---

## 6. How to Send a Test Webhook

Every test scenario starts with a `POST /webhooks/hostfully` request. The webhook simulates a Hostfully `NEW_INBOX_MESSAGE` event.

**Rules:**

- `message_uid` must be **unique per test run** — using the same value twice returns `{ "ok": true, "duplicate": true }` without creating a task
- Use `$(date +%s)` or a manual counter suffix to guarantee uniqueness
- No authentication headers are needed on this endpoint

**Template command:**

```bash
source .env

curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
  }' | jq .
```

**Expected successful response:**

```json
{ "ok": true, "task_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

**Save the task ID immediately** — you'll use it to check status and verify results:

```bash
TASK_ID="paste-the-uuid-here"
```

**Other responses you might see:**

| Response                                           | Meaning                                             |
| -------------------------------------------------- | --------------------------------------------------- |
| `{ "ok": true, "duplicate": true }`                | Same `message_uid` already used — change the suffix |
| `{ "ok": true, "ignored": true }`                  | `event_type` was not `NEW_INBOX_MESSAGE`            |
| `{ "ok": true, "tenant_not_found": true }`         | `agency_uid` doesn't match any tenant config        |
| `{ "error": "lead_uid is required..." }`           | Missing `lead_uid` field                            |
| `{ "error": "Invalid payload", "details": [...] }` | Zod validation failure — check the body structure   |

---

## 7. Watch the Lifecycle Execute

After sending a webhook, the lifecycle runs through several automatic steps before waiting for your Slack input. This section explains what you'll see and how long each phase takes.

### 7.1 — Watch in the Inngest dashboard

Open `http://localhost:8288` → click **Functions** → click `employee/universal-lifecycle`.

A new run appears within a few seconds of the webhook. Click it to see each step execute in real time.

**Automatic steps (no action required from you):**

| Step                   | What it does                                                      | Duration        |
| ---------------------- | ----------------------------------------------------------------- | --------------- |
| `receive-task`         | Fetches the task from DB                                          | ~1s             |
| `triage`               | Auto-passes                                                       | ~1s             |
| `await-input`          | Auto-passes                                                       | ~1s             |
| `mark-ready`           | Sets status → `Ready`                                             | ~1s             |
| `execute`              | Spins up Docker container, runs OpenCode + model                  | **1–5 minutes** |
| `validate`             | Auto-passes                                                       | ~1s             |
| `submit`               | Auto-passes                                                       | ~1s             |
| `check-classification` | Reads model output, routes to NEEDS_APPROVAL or NO_ACTION_NEEDED  | ~1s             |
| `check-supersede`      | Checks if another task for same thread is pending                 | ~1s             |
| `mark-reviewing`       | Sets status → `Reviewing`                                         | ~1s             |
| `post-slack-approval`  | Posts the Slack card with 3 buttons                               | ~2s             |
| `wait-for-approval`    | **Pauses here — waits for your Slack button click** (24h timeout) | until you act   |

### 7.2 — Check task status via API

While the lifecycle is running, you can check status at any time (see [Section 11](#11-how-to-check-task-status-at-any-time)).

### 7.3 — What the Slack card looks like

When the `post-slack-approval` step completes, a card appears in Slack channel `C0960S2Q8RL` with this structure:

```
┌─────────────────────────────────────────────────────────┐
│ 🚨 Guest Message — [Property Name]                       │
│                                                          │
│ Guest Name: [Name]          Property: [Property Name]   │
│ Check-in: [Date]            Check-out: [Date]           │
│ Channel: [Airbnb/VRBO/etc]                              │
│ ─────────────────────────────────────────────────────── │
│ Original Message:                                        │
│   > [Guest's message text]                              │
│                                                          │
│ Proposed Response:                                       │
│   [AI-generated draft reply]                            │
│                                                          │
│ Confidence: 87% | Category: wifi                        │
│ ─────────────────────────────────────────────────────── │
│  [✅ Approve & Send]  [✏️ Edit & Send]  [❌ Reject]      │
│                                                          │
│ Task `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`             │
└─────────────────────────────────────────────────────────┘
```

> **Mock mode**: The guest message will be "what's the WiFi password?" (from the fixture). The AI draft will be whatever MiniMax generates based on that.
>
> **Real-API mode**: The guest message and draft are from the actual Hostfully conversation.

---

## 8. Scenario A — Approve & Send

**Goal**: Verify the happy path — approve the AI draft, confirm delivery, confirm task reaches `Done`.

### Step 1 — Send the webhook

```bash
source .env

curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-approve-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
  }' | jq .
```

Save the task ID:

```bash
TASK_ID="paste-uuid-here"
```

### Step 2 — Wait for the Slack card

Monitor the Inngest dashboard at `http://localhost:8288`. The `execute` step takes 1–5 minutes. Wait until the run reaches `wait-for-approval`.

You can also poll the task status:

```bash
source .env

watch -n 5 "curl -s \
  'http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID' \
  -H 'X-Admin-Key: $ADMIN_API_KEY' | jq '{status}'"
```

Press `Ctrl+C` when you see `"status": "Reviewing"`.

### Step 3 — Verify the Slack card

Open the VLRE Slack workspace → channel `C0960S2Q8RL`.

Confirm you see:

- [ ] A card with a guest message and a proposed reply
- [ ] Three buttons: `✅ Approve & Send`, `✏️ Edit & Send`, `❌ Reject`
- [ ] A trailing context block showing the task ID

### Step 4 — Click "Approve & Send"

Click the `✅ Approve & Send` button.

**What you should see immediately** (within 1–2 seconds, the card updates in-place):

```
⏳ Processing approval...
Task `xxxxxxxx-...`
```

**What you should see within 5–10 seconds:**

```
✅ Approved by @[your name] — delivering now.
Task `xxxxxxxx-...`
```

If the card does not update within 30 seconds, check [Troubleshooting](#12-troubleshooting).

### Step 5 — Watch delivery in Inngest

Back in the Inngest dashboard, the run continues past `wait-for-approval`:

| Step                | Expected                                        |
| ------------------- | ----------------------------------------------- |
| `wait-for-approval` | ✅ received `approve` event                     |
| `mark-approved`     | ✅ status → `Approved`                          |
| `mark-delivering`   | ✅ status → `Delivering`                        |
| `deliver`           | ✅ delivery Docker container runs (1–3 minutes) |
| `mark-done`         | ✅ status → `Done`                              |

The delivery container runs a second OpenCode session that calls `send-message.ts` with the approved draft.

### Step 6 — Verify task is Done

```bash
source .env

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '{id, status}'
```

**Expected:**

```json
{ "id": "...", "status": "Done" }
```

### Step 7 — Verify Slack card shows delivery confirmation

In the VLRE Slack channel `C0960S2Q8RL`, the card should have updated one final time:

```
✅ Sent to guest at [ISO timestamp]
Task `xxxxxxxx-...`
```

### Step 8 — Verify in Hostfully (real-API mode only / skip in mock mode)

1. Log into Hostfully
2. Open the inbox thread: `https://platform.hostfully.com/app/#/inbox?threadUid=2f18249a-9523-4acd-a512-20ff06d5c3fa&leadUid=37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`
3. Confirm the AI-drafted reply appears as a sent message

> **Mock mode**: No message is sent to Hostfully. The delivery worker returns `{ "sent": true, "messageId": "mock-message-id-001" }` from the fixture. Skip this step.

### ✅ Scenario A passes when:

- [ ] Webhook returned `{ "ok": true, "task_id": "..." }`
- [ ] Slack card appeared with 3 buttons
- [ ] Clicking Approve showed `⏳ Processing...` then `✅ Approved — delivering now.`
- [ ] Task status reached `Done`
- [ ] Slack card shows `✅ Sent to guest at ...`

---

## 9. Scenario B — Edit & Send

**Goal**: Verify the edit path — the modal opens pre-filled with the AI draft, you modify the text, and the **edited** text (not the original) is delivered to the guest.

### Step 1 — Send the webhook

```bash
source .env

curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-edit-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
  }' | jq .
```

Save the task ID:

```bash
TASK_ID="paste-uuid-here"
```

### Step 2 — Wait for the Slack card

Wait for `"status": "Reviewing"` as in Scenario A Steps 2–3. The same 3-button card will appear in `C0960S2Q8RL`.

### Step 3 — Note the original AI draft

Before clicking anything, read the AI's proposed response from the card, or via the API:

```bash
source .env

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.deliverable.draftResponse'
```

Note this text — you'll verify it gets replaced by your edit.

### Step 4 — Click "Edit & Send"

Click the `✏️ Edit & Send` button on the Slack card.

**What you should see**: A Slack modal dialog opens. It has:

- A title like "Edit Response" or "Edit Guest Reply"
- A **text area pre-filled with the AI's draft** — you should recognize the text from Step 3
- A "Send Edited Response" submit button and a "Cancel" close button

If the text area is empty (not pre-filled), the button value was not set correctly — this is a bug. File it with the task ID.

### Step 5 — Edit the text and submit

1. Clear or modify the pre-filled text
2. Type your edited response. Example:
   ```
   Hi! The WiFi network is called "VLRE_Guests" and the password is on the card next to the TV. Let me know if you need anything else!
   ```
3. Click "Send Edited Response"

**What you should see**: The modal closes. The Slack card updates to:

```
⏳ Processing edited response...
Task `xxxxxxxx-...`
```

Then within a few seconds:

```
✅ Approved by @[your name] — delivering now.
Task `xxxxxxxx-...`
```

### Step 6 — Verify the deliverable was updated in the DB

Check that the `draftResponse` in the DB now contains your edited text, not the original AI draft:

```bash
source .env

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.deliverable.draftResponse'
```

**Expected**: Your edited text, not the original AI draft.

> This confirms the lifecycle's `patch-deliverable` step ran correctly before dispatching the delivery machine. If this still shows the original AI text, the edited content was not carried through — check the Inngest run for errors on the `patch-deliverable` step.

### Step 7 — Watch delivery in Inngest

The run should complete identically to Scenario A, with one extra step visible:

| Step                | Expected                                         |
| ------------------- | ------------------------------------------------ |
| `wait-for-approval` | ✅ received `approve` event with `editedContent` |
| `patch-deliverable` | ✅ `draftResponse` updated to your edited text   |
| `mark-approved`     | ✅                                               |
| `mark-delivering`   | ✅                                               |
| `deliver`           | ✅ delivery machine sends **your edited text**   |
| `mark-done`         | ✅                                               |

### Step 8 — Verify task is Done

```bash
source .env

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '{id, status}'
```

**Expected:** `"status": "Done"`

### Step 9 — Verify edited message in Hostfully (real-API mode only)

1. Open the inbox thread in Hostfully
2. Confirm the message sent is **your edited version**, not the original AI draft

> **Mock mode**: Skip this step. The `send-message.ts` fixture is returned regardless of message content.

### ✅ Scenario B passes when:

- [ ] Edit & Send button opened a modal pre-filled with the AI draft
- [ ] After submitting, card showed `⏳ Processing edited response...` then `✅ Approved — delivering now.`
- [ ] `deliverable.draftResponse` in the DB reflects your edited text (not the original)
- [ ] Task reached `Done`
- [ ] Slack card shows `✅ Sent to guest at ...`

---

## 10. Scenario C — Reject

**Goal**: Verify the rejection path — a modal asks for an optional reason, the task is cancelled, and **no message is sent** to the guest.

### Step 1 — Send the webhook

```bash
source .env

curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-reject-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
  }' | jq .
```

Save the task ID:

```bash
TASK_ID="paste-uuid-here"
```

### Step 2 — Wait for the Slack card

Wait for `"status": "Reviewing"` as in the previous scenarios. The same 3-button card appears in `C0960S2Q8RL`.

### Step 3 — Click "Reject"

Click the `❌ Reject` button on the Slack card.

**What you should see**: A Slack modal dialog opens with:

- A title like "Reject Response"
- An **optional** text area for a rejection reason, with placeholder text like "Help improve future responses..."
- A "Reject" submit button and a "Cancel" close button

### Step 4 — Choose Sub-Path A or B

#### Sub-Path A: Reject without a reason

1. Leave the reason text area **empty**
2. Click "Reject"

**Expected**: Modal closes. Slack card updates to:

```
❌ Rejected by @[your name]
Task `xxxxxxxx-...`
```

A thread reply is also posted under the card:

```
Got it, @[your name]. What should I have done differently? (Reply here — I'll learn from it.)
```

#### Sub-Path B: Reject with a reason

1. Type a reason, e.g.:
   ```
   The discount offer wasn't accurate — this needs owner approval first. Do not send.
   ```
2. Click "Reject"

**Expected**: Modal closes. Slack card updates to:

```
❌ Rejected by @[your name]
Task `xxxxxxxx-...`
```

And a thread reply is posted:

```
Got it, @[your name]. What should I have done differently? (Reply here — I'll learn from it.)
```

### Step 5 — Verify task is Cancelled

```bash
source .env

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '{id, status, metadata}'
```

**Expected (Sub-Path A — no reason):**

```json
{
  "id": "...",
  "status": "Cancelled",
  "metadata": {
    "rejection_feedback_requested": true,
    "rejection_user_id": "U..."
  }
}
```

**Expected (Sub-Path B — with reason):**

```json
{
  "id": "...",
  "status": "Cancelled",
  "metadata": {
    "rejectionReason": "The discount offer wasn't accurate...",
    "rejection_feedback_requested": true,
    "rejection_user_id": "U..."
  }
}
```

### Step 6 — Verify rejection reason was stored in feedback table (Sub-Path B only)

```bash
source .env

curl -s "http://localhost:54321/feedback?task_id=eq.$TASK_ID" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0] | {feedback_type, correction_reason}'
```

**Expected (Sub-Path B):**

```json
{
  "feedback_type": "rejection_reason",
  "correction_reason": "The discount offer wasn't accurate..."
}
```

**Expected (Sub-Path A):** Empty array `[]` — no row created when no reason was given.

### Step 7 — Verify Inngest run completed (no delivery step)

In the Inngest dashboard, the run should show:

| Step                | Expected                          |
| ------------------- | --------------------------------- |
| `wait-for-approval` | ✅ received `reject` event        |
| `handle-rejection`  | ✅ reason stored, feedback posted |
| `mark-cancelled`    | ✅                                |

Critically: **no `deliver` step should appear**. If you see a `deliver` step after `mark-cancelled`, that is a bug — file it immediately.

### Step 8 — Confirm no message was sent to Hostfully (real-API mode only)

1. Open the inbox thread in Hostfully
2. Confirm the conversation thread has **no new message** from the host after the rejection

> **Mock mode**: `send-message.ts` was never called. Skip this step.

### ✅ Scenario C passes when:

- [ ] Reject button opened a modal with an optional reason field
- [ ] Submitting closed the modal and updated the Slack card to `❌ Rejected by @you`
- [ ] A thread reply appeared asking for feedback
- [ ] Task status is `Cancelled`
- [ ] Sub-Path B: rejection reason appears in the `feedback` table
- [ ] No `deliver` step ran in Inngest
- [ ] No message appeared in Hostfully (real-API mode)

---

## 11. How to Check Task Status at Any Time

Use the admin API to check the current state of any task:

```bash
source .env

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq .
```

**Status values and what they mean:**

| Status          | Meaning                                             |
| --------------- | --------------------------------------------------- |
| `Received`      | Task created, Inngest event queued                  |
| `Triaging`      | Auto-passing step                                   |
| `AwaitingInput` | Auto-passing step                                   |
| `Ready`         | About to launch Docker container                    |
| `Executing`     | Docker container / OpenCode model is running        |
| `Submitting`    | Model finished, output being processed              |
| `Reviewing`     | Slack card posted, waiting for your button click    |
| `Approved`      | Button clicked, transitioning to delivery           |
| `Delivering`    | Delivery Docker container running `send-message.ts` |
| `Done`          | Message delivered (or confirmed mock-sent)          |
| `Cancelled`     | Rejected by PM, timed out, or superseded            |
| `Failed`        | Unrecoverable error (check Inngest for details)     |

**Poll with a loop** (useful while the model is executing):

```bash
source .env

while true; do
  STATUS=$(curl -s \
    "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
    -H "X-Admin-Key: $ADMIN_API_KEY" | jq -r '.status')
  echo "$(date '+%H:%M:%S') — $STATUS"
  [[ "$STATUS" == "Reviewing" || "$STATUS" == "Done" || "$STATUS" == "Cancelled" || "$STATUS" == "Failed" ]] && break
  sleep 10
done
```

---

## 12. Troubleshooting

### Slack card does not appear after ~5 minutes

1. Check the Inngest dashboard — did the `execute` step fail?
2. Check worker logs:
   ```bash
   fly logs -a ai-employee-workers
   ```
   or for local Docker:
   ```bash
   docker logs $(docker ps -q --filter ancestor=ai-employee-worker:latest) --tail 50
   ```
3. Look for "Task not found" — this means the task ID was not passed to the container. Check the Inngest `execute` step details.
4. Look for model errors from OpenRouter — check `OPENROUTER_API_KEY` is valid.

### Button click has no effect / Slack card does not update

1. Check that Slack Socket Mode is connected:

   ```bash
   grep -i "socket mode" /tmp/ai-dev.log | tail -3
   ```

   If missing, the gateway lost its WebSocket connection to Slack. Restart with `pnpm dev:local`.

2. Check gateway logs for authorization errors:

   ```bash
   grep "slack_bolt_authorization_error\|No installation" /tmp/ai-dev.log | tail -5
   ```

   If you see this with a team ID, the VLRE Slack OAuth token is missing. Re-run OAuth (see Section 2.6).

3. **Manual approval fallback** — if buttons are broken but you want to test the lifecycle anyway:

   ```bash
   # For Approve:
   curl -X POST "http://localhost:8288/e/local" \
     -H "Content-Type: application/json" \
     -d "{\"name\":\"employee/approval.received\",\"data\":{\"taskId\":\"$TASK_ID\",\"action\":\"approve\",\"userId\":\"U05V0CTJLF6\",\"userName\":\"Victor\"}}"

   # For Reject:
   curl -X POST "http://localhost:8288/e/local" \
     -H "Content-Type: application/json" \
     -d "{\"name\":\"employee/approval.received\",\"data\":{\"taskId\":\"$TASK_ID\",\"action\":\"reject\",\"userId\":\"U05V0CTJLF6\",\"userName\":\"Victor\",\"rejectionReason\":\"Testing rejection\"}}"
   ```

### Task stuck in `Executing` for more than 10 minutes

1. The OpenCode model may have crashed or timed out. Check worker logs.
2. If the container OOM-killed (out of memory), increase `SUMMARIZER_VM_SIZE` in `.env`.
3. In the Inngest dashboard, cancel the stuck run and try again with a rebuilt image.

### Task reaches `Reviewing` but no Slack card appears

The `post-slack-approval` step ran but the Slack API call failed. Check:

```bash
grep "post-slack-approval\|chat.postMessage\|channel_not_found\|not_in_channel" /tmp/ai-dev.log | tail -10
```

Common cause: the bot token stored for the VLRE tenant belongs to the wrong Slack workspace. Re-run OAuth (Section 2.6).

### Delivery fails — task goes to `Failed` after Approve

1. Check if `delivery_instructions` is set on the archetype:

   ```bash
   source .env
   curl -s "http://localhost:54321/archetypes?id=eq.00000000-0000-0000-0000-000000000015" \
     -H "apikey: $SUPABASE_SECRET_KEY" \
     -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0].delivery_instructions'
   ```

   If `null`: run `pnpm prisma db seed` to restore the archetype config.

2. Check delivery worker logs:

   ```bash
   fly logs -a ai-employee-workers
   ```

3. The lifecycle retries delivery up to 3 times before marking `Failed`. Each retry takes ~1–3 minutes. Wait for all retries to complete before concluding it's broken.

### `message_uid` already used — getting `{ "duplicate": true }`

Just change the `message_uid` suffix in your curl command. Example: change `test-approve-001` to `test-approve-002`.

### Model returns `NO_ACTION_NEEDED` unexpectedly (mock mode)

This should not happen in mock mode — the default fixture (`fixtures/get-messages/default.json`) contains a WiFi password question which always triggers `NEEDS_APPROVAL`. If you're getting `NO_ACTION_NEEDED`:

1. Confirm `HOSTFULLY_MOCK=true` is in `.env`
2. Confirm the Docker image was rebuilt **after** setting the env var:
   ```bash
   docker build -t ai-employee-worker:latest .
   ```
3. Check that `HOSTFULLY_MOCK` appears in the worker environment. In the Inngest `execute` step, expand the step details and look for `HOSTFULLY_MOCK` in the machine env vars.

---

## Appendix: All curl Commands in One Block

```bash
# Load environment variables
source .env

# --- WEBHOOK ---
# Send a test webhook (change message_uid suffix each run)
curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
  }' | jq .

# --- TASK STATUS ---
TASK_ID="paste-uuid-here"

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '{id, status, metadata}'

# --- MANUAL APPROVE (if Slack buttons not working) ---
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"employee/approval.received\",\"data\":{\"taskId\":\"$TASK_ID\",\"action\":\"approve\",\"userId\":\"U05V0CTJLF6\",\"userName\":\"Victor\"}}"

# --- MANUAL REJECT (if Slack buttons not working) ---
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"employee/approval.received\",\"data\":{\"taskId\":\"$TASK_ID\",\"action\":\"reject\",\"userId\":\"U05V0CTJLF6\",\"userName\":\"Victor\",\"rejectionReason\":\"Testing\"}}"

# --- VERIFY FEEDBACK ROW (after reject with reason) ---
curl -s "http://localhost:54321/feedback?task_id=eq.$TASK_ID" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0] | {feedback_type, correction_reason}'

# --- CHECK ARCHETYPE DELIVERY INSTRUCTIONS ---
curl -s "http://localhost:54321/archetypes?id=eq.00000000-0000-0000-0000-000000000015" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0] | {role_name, delivery_instructions}'

# --- VERIFY TENANT SECRET EXISTS ---
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[] | select(.key == "hostfully_api_key")'

# --- STORE HOSTFULLY API KEY AS TENANT SECRET ---
curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/hostfully_api_key" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"value\":\"$HOSTFULLY_API_KEY\"}"
```
