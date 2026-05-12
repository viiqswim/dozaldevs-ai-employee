# Slack UX E2E Test Guide — guest-messaging-slack-ux

This guide covers six test scenarios that together exercise every change introduced between
`victor/working-2026-05-09-1804` and the current `main`. Run them in order when needed — each
scenario is self-contained. All browser interactions use the Playwright MCP browser tool.

---

## Prerequisites

Before running any scenario, confirm services are live:

```bash
# Gateway
curl -s http://localhost:7700/health
# → {"status":"ok"}

# Inngest
curl -s http://localhost:8288/health
# → {"status":200,"message":"OK"}

# Gateway logs show Socket Mode connected (check tmux ai-dev)
tail -20 /tmp/ai-dev.log | grep -i "socket mode"
# → ... "Slack Bolt — Socket Mode connected"
```

**Fixed test resources (VLRE tenant)**

| Resource               | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| Airbnb guest thread    | `https://www.airbnb.com/guest/messages/2525238359`           |
| Thread UID             | `aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`                       |
| Lead UID               | `29a64abd-d02c-44bc-8d5c-47df58a7ab14`                       |
| Property UID           | `562695df-6a4f-40d6-990d-56fe043aa9e8`                       |
| Slack approval channel | `#cs-guest-communication` (`C0AMGJQN05S`)                    |
| VLRE tenant ID         | `00000000-0000-0000-0000-000000000003`                       |
| DB                     | `postgresql://postgres:postgres@localhost:54322/ai_employee` |
| PostgREST              | `http://localhost:54331`                                     |

**Unique message suffix pattern:** include `[e2e-test-{unix_epoch}]` in every Airbnb message
to prevent dedup collisions. Generate with: `date +%s`

---

## Scenario A — Happy Path: Property name + lead status + Approve → rich Done + context reply

**Exercises:** property name lookup in `fetchLeadEnrichment()`, lead status field in approval card,
"🔗 View in Hostfully" button, `REPLY_BROADCAST` gating on `thread_uid`, rich Done terminal blocks
(`buildEnrichedTerminalBlocks` status `done`), localized `<!date^...>` timestamp, context thread
reply (`buildContextThreadBlocks` action `approve`).

---

### Step 1 — Send a guest message on Airbnb

| Action                                                                                   | Where                     |
| ---------------------------------------------------------------------------------------- | ------------------------- |
| Navigate to `https://www.airbnb.com/guest/messages/2525238359`                           | Playwright browser        |
| Click `textbox "Write a message..."`                                                     | Airbnb thread compose bar |
| Type: `Is there air conditioning? [e2e-test-{epoch}]`                                    | Compose bar               |
| Click `button "Send"` (`ref=e1568` or `data-testid="messaging_compose_bar_send_button"`) | Airbnb thread             |

**Internal check — Hostfully webhook received:**

```bash
tail -30 /tmp/ai-dev.log | grep -E "hostfully|NEW_INBOX_MESSAGE|task.*created|dispatched"
```

Expected line: `POST /webhooks/hostfully 200` followed by `employee/task.dispatched`.

---

### Step 2 — Confirm task created and "Processing" notify message appears

**DB check:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, status, metadata->>'guest_name', raw_event->>'thread_uid'
   FROM tasks
   WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
   ORDER BY created_at DESC LIMIT 1;"
```

Expected: `status = 'Received'` (may transition quickly to `Executing`).

**Slack check:** Navigate to `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`.
Look for a new top-level message from "Papi chulo" with:

- Emoji `⏳`
- Text: `Processing reply for Guest` with the guest message quoted in a blockquote
- Property name (e.g. `Luxury Private Room (2) in Austin's McKinney Falls`) on the second line

> The property name comes from `fetchLeadEnrichment()` → `GET /properties/{propertyUid}` on
> Hostfully API with `AbortSignal.timeout(2000)`. If the property API is unreachable, the name
> falls back to absent (no second line).

**Internal check — enrichment fetch:**

```bash
docker logs $(docker ps -q --filter name=employee-) 2>/dev/null | grep -i "property\|enrich" | head -10
```

---

### Step 3 — Confirm approval card appears in thread

Click "View thread" (or the reply count badge) on the notify message.

The threaded approval card (`post-guest-approval.ts`) must contain:

| Field                    | Expected value                                                                                                                                                        | Where in card                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Guest name               | `Olivia`                                                                                                                                                              | Header section                       |
| Property name            | `Luxury Private Room (2) in Austin's McKinney Falls`                                                                                                                  | `fields` section                     |
| Check-in / Check-out     | ISO dates from Hostfully                                                                                                                                              | `fields` section                     |
| Booking Channel          | `AIRBNB`                                                                                                                                                              | `fields` section                     |
| **Lead Status**          | `📙 INQUIRY` (or `📗 BOOKED` / `📕 CLOSED` / `📘 NEW`)                                                                                                                | `fields` section — **new field**     |
| Original message         | Quoted guest message                                                                                                                                                  | `section` block                      |
| Draft response           | Quoted AI draft                                                                                                                                                       | `section` block                      |
| **🔗 View in Hostfully** | Clickable URL button — opens `https://platform.hostfully.com/app/#/inbox?threadUid=aef3d0cf-bc61-4f05-a3ce-1a4199ca336d&leadUid=29a64abd-d02c-44bc-8d5c-47df58a7ab14` | `actions` block, after Reject button |
| Action buttons           | `✅ Approve & Send`, `✏️ Edit & Send`, `❌ Reject`, `🔗 View in Hostfully`                                                                                            | `actions` block                      |

**Internal check — `/tmp/approval-message.json` inside the worker container:**

```bash
CONTAINER=$(docker ps -q --filter name=employee-)
docker exec $CONTAINER cat /tmp/approval-message.json 2>/dev/null || \
  cat /tmp/employee-$(psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c \
    "SELECT id FROM tasks WHERE raw_event->>'thread_uid'='aef3d0cf-bc61-4f05-a3ce-1a4199ca336d' ORDER BY created_at DESC LIMIT 1" \
    | tr -d ' ' | head -c 8).log 2>/dev/null | grep "approval-message"
```

The JSON must include `lead_status` — this is the new field written by `post-guest-approval.ts`
at line 416: `lead_status: params.leadStatus ?? null`.

**DB check — task is `Reviewing` and `pending_approvals` row exists:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT t.id, t.status, pa.slack_ts, pa.guest_name, pa.property_name
   FROM tasks t
   JOIN pending_approvals pa ON pa.task_id = t.id::text
   WHERE t.raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
   ORDER BY t.created_at DESC LIMIT 1;"
```

Expected: `status = 'Reviewing'`, `pa.property_name` is populated (not null).
`pending_approvals.property_name` is stored by the lifecycle at the same time as `pending_approvals.guest_name`.

**REPLY_BROADCAST check:** The approval card thread reply must also appear as a stand-alone
channel-level message (not just inside the thread). This is controlled by `REPLY_BROADCAST=true`
in the worker environment, which is now set when `rawEvent['thread_uid']` is truthy (line 624 of
`employee-lifecycle.ts`). If the card appears only inside the thread but not at channel level,
`REPLY_BROADCAST` was not set.

**Inngest check:** Open `http://localhost:8288` → find the `employee/universal-lifecycle` run →
confirm the `handle-worker-execution` step environment includes `REPLY_BROADCAST=true`.

---

### Step 4 — Click "✅ Approve & Send"

| Action                                                                                             | Where        |
| -------------------------------------------------------------------------------------------------- | ------------ |
| In the thread, click `button "white check mark emoji Approve & Send"` (action_id: `guest_approve`) | Slack thread |

**Immediate ack:** The button block replaces itself with `⏳ Processing approval...` inline in
the Socket Mode ack response (handlers.ts line 430–437). This is rendered client-side before any
round-trip to Inngest.

**Internal check — `employee/approval.received` event fired:**

```bash
curl -s http://localhost:8288/v1/events?name=employee%2Fapproval.received | \
  python3 -m json.tool | grep -A5 "taskId"
```

**Internal check — idempotency guard:**
The handler calls `isTaskAwaitingApproval(taskId, { maxRetries: 10, retryDelayMs: 2000 })`.
If the task is no longer in `Reviewing`, the card updates to `⚠️ This task has already been
processed.` (handlers.ts line 454). Watch gateway logs for:

```
guest_approve action received — processing state sent inline with ack
Guest approval event sent — lifecycle will update message
```

---

### Step 5 — Confirm approval card updated to rich Done state

The **threaded approval card** (the one with buttons) must update via `slackClient.updateMessage`
to show `buildEnrichedTerminalBlocks({ status: 'done', ... })` output:

```
✅ *Approved by @ActorName* · Olivia
_Luxury Private Room (2) in Austin's McKinney Falls_
> [first 150 chars of draft_response]…
🔗 View in Hostfully   Today at 4:00 PM
Task `{taskId}`
```

- The timestamp uses Slack's `<!date^{epoch}^{date_short_pretty} at {time}|{isoFallback}>` format
  (employee-lifecycle.ts line 1789). It must **not** render as a raw ISO string. In Slack, it
  shows localized time.
- `sentSnippet` is `metadata['draft_response'].slice(0, 150)` — the exact response sent, not
  the guest message.
- The Hostfully link in the footer is `buildHostfullyLink(threadUid, leadUid)` from `slack-blocks.ts`.

**The top-level notify message** also updates to `buildEnrichedTerminalBlocks({ status: 'done', ... })`
when `terminalRecipientName` (`metadata['guest_name']`) is set (lifecycle line 1819–1844).

---

### Step 6 — Confirm context thread reply posted

Still in the thread, a **new reply** must appear **after** the approval card update.
This is posted by `slackClient.postMessage({ thread_ts: approvalMsgTs, ... })` at lifecycle
line 1624, triggered when `metadata['original_message']` is truthy.

The reply (`buildContextThreadBlocks({ action: 'approve', ... })`) must contain:

| Block                 | Expected content                                                          |
| --------------------- | ------------------------------------------------------------------------- |
| Header section        | `📋 *Message Context* — preserved for reference`                          |
| Context row           | `*Guest:* Olivia \| *Dates:* {checkIn}–{checkOut} \| *Channel:* AIRBNB`   |
| Guest message section | `*💬 Guest message:*` + blockquoted original guest message                |
| Sent response section | `*📤 Response sent to guest:*` + blockquoted draft_response               |
| Footer context        | `🔗 View in Hostfully` link + `Confidence: {N}%` + `Category: {category}` |
| Task context          | `Task \`{taskId}\``                                                       |

**DB check — metadata keys present:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT
     metadata->>'guest_name'       AS guest_name,
     metadata->>'property_name'    AS property_name,
     metadata->>'original_message' AS original_message,
     metadata->>'draft_response'   AS draft_response,
     metadata->>'thread_uid'       AS thread_uid,
     metadata->>'lead_uid'         AS lead_uid,
     metadata->>'confidence'       AS confidence,
     metadata->>'category'         AS category,
     metadata->>'check_in'         AS check_in,
     metadata->>'check_out'        AS check_out,
     metadata->>'booking_channel'  AS booking_channel
   FROM tasks
   WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
   ORDER BY created_at DESC LIMIT 1;"
```

All fields must be non-null for the full context reply to render. They are written by the lifecycle
from the `/tmp/approval-message.json` output of `post-guest-approval.ts`.

---

### Step 7 — Confirm delivery to Airbnb

Switch to the Airbnb browser tab. The thread must show a new reply from "Leo" matching the
`draft_response` content from metadata.

**DB check — task is `Done`:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, status, updated_at FROM tasks
   WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
   ORDER BY created_at DESC LIMIT 1;"
```

**Status log check — full state machine trace:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT from_status, to_status, actor, created_at
   FROM task_status_log
   WHERE task_id = (
     SELECT id FROM tasks
     WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
     ORDER BY created_at DESC LIMIT 1
   )
   ORDER BY created_at;"
```

Expected sequence: `NULL→Received`, `Received→Ready`, `Ready→Executing`, `Executing→Submitting`,
`Submitting→Reviewing`, `Reviewing→Approved`, `Approved→Delivering`, `Delivering→Done`.

**`pending_approvals` must be cleaned up:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT COUNT(*) FROM pending_approvals
   WHERE task_id = (
     SELECT id::text FROM tasks
     WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
     ORDER BY created_at DESC LIMIT 1
   );"
```

Expected: `0` — the row is deleted on approval/rejection.

---

## Scenario B — Reject path: rich Rejected terminal + "not sent" context reply

**Exercises:** `buildEnrichedTerminalBlocks` status `rejected`, `buildContextThreadBlocks`
action `reject` (shows draft that was NOT sent).

---

### Step 1 — Send a guest message and wait for the approval card

Follow Scenario A steps 1–3. Confirm the approval card is visible in the thread.

---

### Step 2 — Click "❌ Reject"

| Action                                                      | Where        |
| ----------------------------------------------------------- | ------------ |
| Click `button "x emoji Reject"` (action_id: `guest_reject`) | Slack thread |

A Slack modal opens asking for a rejection reason (handlers.ts line 641).
Fill in a reason (or leave blank) and submit.

**Internal check — `employee/approval.received` event with `action: 'reject'`:**

```bash
curl -s http://localhost:8288/v1/events?name=employee%2Fapproval.received | \
  python3 -m json.tool | grep -E "action|taskId" | head -10
```

Expected: `"action": "reject"`.

---

### Step 3 — Confirm approval card updated to rich Rejected state

The threaded approval card updates to `buildEnrichedTerminalBlocks({ status: 'rejected', ... })`:

```
❌ *Rejected by @ActorName* · Olivia
_Luxury Private Room (2) in Austin's McKinney Falls_
🔗 View in Hostfully   Today at {time}
Task `{taskId}`
```

Note: there is **no** `sentSnippet` section for rejections — only for `done`. The Hostfully link
and timestamp appear in a context block.

---

### Step 4 — Confirm context thread reply shows "not sent" draft

The context reply uses `buildContextThreadBlocks({ action: 'reject', ... })`:

| Block                   | Expected content                                                        |
| ----------------------- | ----------------------------------------------------------------------- |
| Header                  | `📋 *Message Context* — preserved for reference`                        |
| Context row             | `*Guest:* Olivia \| *Dates:* {checkIn}–{checkOut} \| *Channel:* AIRBNB` |
| Guest message           | `*💬 Guest message:*` + blockquoted original                            |
| **AI draft (not sent)** | `*🤖 AI suggested response (not sent):*` + blockquoted draft_response   |
| Footer                  | `🔗 View in Hostfully` + `Confidence: {N}%` + `Category: {category}`    |
| Task context            | `Task \`{taskId}\``                                                     |

Critically: there must be **no** `📤 Response sent to guest:` section — only the `🤖` not-sent
section. This is controlled by the `action === 'reject'` branch in `buildContextThreadBlocks`
(slack-blocks.ts).

**DB check — task is `Done` with rejection path:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, status FROM tasks
   WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
   ORDER BY created_at DESC LIMIT 1;"
```

Status is `Done` (rejection still completes the task without delivery).

---

## Scenario C — Edit & Send path: context reply shows both original draft and edited version

**Exercises:** `buildContextThreadBlocks` action `edit` — two response sections: `🤖 Original AI
draft:` and `✏️ Edited response (sent):`.

---

### Step 1 — Send a guest message and wait for the approval card

Follow Scenario A steps 1–3.

---

### Step 2 — Click "✏️ Edit & Send"

| Action                                                               | Where        |
| -------------------------------------------------------------------- | ------------ |
| Click `button "pencil2 emoji Edit & Send"` (action_id: `guest_edit`) | Slack thread |

A Slack modal opens with the AI draft pre-filled in a `plain_text_input` (action_id: `edited_draft`,
handlers.ts line 543). Modify the text to something clearly different from the AI draft, then submit.

---

### Step 3 — Confirm context thread reply shows both versions

After delivery completes, the context reply must contain **both** sections:

| Block                      | Expected content                                                             |
| -------------------------- | ---------------------------------------------------------------------------- |
| Header                     | `📋 *Message Context* — preserved for reference`                             |
| Context row                | Guest, dates, channel                                                        |
| Guest message              | `*💬 Guest message:*` + blockquote                                           |
| **Original AI draft**      | `*🤖 Original AI draft:*` + blockquoted `draft_response` from metadata       |
| **Edited response (sent)** | `*✏️ Edited response (sent):*` + blockquoted the text you typed in the modal |
| Footer                     | Hostfully link + confidence + category                                       |

This is the `action === 'edit'` branch in `buildContextThreadBlocks`. The `draftResponse` param
comes from `metadata['draft_response']` and the `editedResponse` param comes from `editedContent`
(the modal submission), read at lifecycle line 1616–1619.

---

## Scenario D — Supersede: second message cancels first approval card with task ID in footer

**Exercises:** `buildSupersededBlocks(taskId)` — the superseded card now includes a task ID
context block (previously it had no task ID).

---

### Step 1 — Send first guest message, wait for approval card

Follow Scenario A steps 1–3. Confirm the approval card is visible in the thread. Note the task ID
from the `Task \`{taskId}\`` context block.

---

### Step 2 — Send a second guest message immediately (before approving the first)

While the first approval card is still pending, go back to the Airbnb thread and send a second
message:

```
Actually, is there parking too? [e2e-test-{epoch+1}]
```

---

### Step 3 — Confirm the first approval card updates to "Superseded"

The lifecycle's supersede path calls `buildSupersededBlocks(oldTaskId)` (lifecycle lines 1240 and
1858). The card must update to:

```
⏭️ *Superseded* — a newer message from this guest is pending review below.
_This suggested response was not sent._
Task `{oldTaskId}`
```

Verify the **task ID in the context block matches the first task**, not the second. This is the fix
introduced in this plan — previously `buildSupersededBlocks()` accepted no arguments and emitted no
task ID.

**DB check — first task in `Done` state (superseded path skips delivery):**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, status FROM tasks
   WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
   ORDER BY created_at DESC LIMIT 2;"
```

The older task must be `Done`; the newer task will be in `Executing` or `Reviewing`.

**Notify message check:** The top-level notify message for the first task must update to
`⏭️ Superseded — newer message received` (the `buildSupersededBlocks` section text).

---

## Scenario E — Expiry: rich Expired terminal blocks (requires DB manipulation)

**Exercises:** `buildEnrichedTerminalBlocks` status `expired` and the updated expiry text
(no longer says "Daily summary expired").

> Direct real-time testing requires waiting 24 hours for the `approval_timeout_hours` to elapse.
> Instead, manipulate the `pending_approvals` row timestamp to simulate expiry.

---

### Step 1 — Trigger a task and wait until it reaches `Reviewing`

Follow Scenario A steps 1–3. Confirm `pending_approvals` row exists.

Note the task ID (`{TASK_ID}`).

---

### Step 2 — Artificially age the pending_approvals row and fire the reviewing-watchdog

The `trigger/reviewing-watchdog` Inngest function runs every 15 minutes and finds tasks stuck in
`Reviewing` with no `pending_approvals` row for >30 minutes. To simulate expiry via the lifecycle's
`approval_timeout_hours` path, directly send the expiry event to Inngest:

```bash
TASK_ID="<the task id from Step 1>"
curl -X POST http://localhost:8288/e/local \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"employee/approval.timeout\",\"data\":{\"taskId\":\"${TASK_ID}\"}}"
```

> The lifecycle's `step.waitForEvent('wait-for-approval', { timeout: '24h' })` fires the expiry
> path when `approvalEvent` is null (the event times out). The manual event above simulates this.

---

### Step 3 — Confirm rich Expired terminal blocks

The approval card must update to `buildEnrichedTerminalBlocks({ status: 'expired', ... })`:

```
⏰ *Expired — no action taken* · Olivia
_Luxury Private Room (2) in Austin's McKinney Falls_
🔗 View in Hostfully
Task `{taskId}`
```

Note the message text is `⏰ Expired — no action taken.` — **not** `⏰ Daily summary expired — no
action taken.` The old hardcoded text was replaced (lifecycle line 1396).

The top-level notify message updates identically via `notifyExpiryBlocks`.

**DB check — task is `Done`:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT status FROM tasks WHERE id = '{TASK_ID}';"
```

---

## Scenario F — Failure: rich Failed terminal blocks (requires forced failure)

**Exercises:** `buildEnrichedTerminalBlocks` status `failed`.

> Genuine worker failures are rare. The most reliable way to trigger the `mark-failed` path is
> a SIGTERM signal to the running worker container, or by injecting an invalid `SUPABASE_URL`.

---

### Step 1 — Trigger a task and identify the worker container

Follow Scenario A steps 1–2. While the task is `Executing`, find the worker container:

```bash
docker ps --filter name=employee- --format "{{.Names}}\t{{.Status}}"
```

Container name format: `employee-{first8charsOfTaskId}` (lifecycle line 611).

---

### Step 2 — Kill the worker container to force a SIGTERM

```bash
docker stop employee-{taskIdPrefix}
```

The harness SIGTERM handler (`opencode-harness.mts`) PATCHes the execution to `failed` and the
lifecycle's `mark-failed` step fires.

---

### Step 3 — Confirm rich Failed terminal blocks

The top-level notify message updates to `buildEnrichedTerminalBlocks({ status: 'failed', ... })`
when `failedEnrichment?.guestName` is set (lifecycle line 706–715):

```
❌ *Task failed* · Olivia
_Luxury Private Room (2) in Austin's McKinney Falls_
🔗 View in Hostfully
Task `{taskId}`
```

`failedEnrichment` is read from `notifyMsgRef.enrichment` — the enrichment object returned by
`fetchLeadEnrichment()` during the `notify-received` Inngest step and stored in Inngest's step
result cache. If enrichment was null (API unreachable at notify time), the message falls back to
`buildNotifyStateBlocks({ emoji: '❌', text: 'Task failed', taskId })`.

**DB check:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT status, failure_reason FROM tasks WHERE id = '{TASK_ID}';"
```

Expected: `status = 'Failed'`.

---

## Quick-Reference: What to Check for Each Change

| Change                                          | Scenario | What to look at                                                                                                                |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Property name in notify + approval card         | A/2, A/3 | Notify message second line; `fields` section of approval card; `pa.property_name` in `pending_approvals` table                 |
| Lead status field in approval card              | A/3      | `*Status:* 📙 INQUIRY` (or other book emoji) in `fields` section                                                               |
| Hostfully button in approval card               | A/3      | `button "🔗 View in Hostfully"` in `actions` block; URL must be `platform.hostfully.com/app/#/inbox?threadUid=...&leadUid=...` |
| `REPLY_BROADCAST` gating on `thread_uid`        | A/3      | Approval card appears at channel level (not just inside thread)                                                                |
| Rich Done terminal blocks + localized timestamp | A/5      | Approval card updated text has `@ActorName`, property name, snippet, Hostfully link, localized time (not raw ISO)              |
| Context thread reply on Approve                 | A/6      | New reply in thread with 📋, guest message, sent response, Hostfully link, confidence, category                                |
| Context thread reply on Reject                  | B/4      | New reply in thread with `🤖 AI suggested response (not sent):`; no `📤 Response sent`                                         |
| Context thread reply on Edit                    | C/3      | Two sections: `🤖 Original AI draft:` and `✏️ Edited response (sent):`                                                         |
| Superseded card has task ID                     | D/3      | `Task \`{oldTaskId}\`` context block on the superseded card                                                                    |
| Rich Expired terminal blocks                    | E/3      | `⏰ *Expired — no action taken*` (not "Daily summary expired") with guest name + property                                      |
| Rich Failed terminal blocks                     | F/3      | `❌ *Task failed* · Olivia` with property name and Hostfully link                                                              |
