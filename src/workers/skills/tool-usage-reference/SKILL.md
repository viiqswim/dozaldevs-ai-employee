---
name: tool-usage-reference
description: 'Use when calling any shell tool available in the container (/tools/slack/, /tools/hostfully/, /tools/locks/, /tools/knowledge_base/, /tools/platform/, /tools/jira/). Contains exact CLI syntax, required flags, output JSON shapes, and critical warnings about common mistakes.'
---

# Tool Usage Reference

Exact CLI syntax for every shell tool pre-installed in the worker container.
All tools are executed via `tsx`. Output is JSON to stdout; errors go to stderr.

---

## ⚠️ CRITICAL WARNINGS — Read Before Every Tool Call

### 1. `lead_uid` ≠ `thread_uid` — NEVER pass the same value to both

These are **different UUIDs** from **different Hostfully entities**:

- **`lead_uid`** (`37f5f58f-…`) — identifies the reservation/guest lead (Hostfully `/leads` endpoint)
- **`thread_uid`** (`2f18249a-…`) — identifies the Hostfully message thread (`/threads` or webhook payload)

They are **never the same value**. Passing the same UUID to both `--lead-uid` and `--thread-uid` in `post-guest-approval.ts` is a model error. The tool logs a stderr warning when this happens. If the Hostfully link in the Slack card opens the wrong thread, this is the cause.

### 2. `NODE_NO_WARNINGS=1` prefix required for `post-message.ts`

Always prefix the call with `NODE_NO_WARNINGS=1` to suppress Node.js deprecation noise that corrupts JSON parsing by the harness.

```bash
NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "C123" --text "msg" > /tmp/approval-message.json
```

### 3. `get-messages.ts` uses `--lead-id` (not `--lead-uid`)

The flag is `--lead-id`, not `--lead-uid`. This differs from `post-guest-approval.ts` which uses `--lead-uid`. Do not confuse them.

### 4. `send-message.ts` is irreversible

Messages sent via `send-message.ts` are delivered immediately to the guest through their booking channel (Airbnb, VRBO, etc.). They cannot be recalled or deleted. Always verify `--lead-id` and `--message` before calling.

### 5. Sifely HTTP 200 ≠ success — always check `body.code`

The Sifely API returns HTTP 200 even on authentication failure. You must check the response body `code` field. `sifely-client.ts` handles this internally — but know why it matters if debugging raw API calls.

---

## Slack Tools (`/tools/slack/`)

### `post-message.ts` — Post a Slack message

```bash
NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts \
  --channel "C123456" \
  --text "Message text" \
  [--task-id "uuid"]                \
  [--title "Custom card title"]     \
  [--blocks '[...]']                \
  [--conversation-ref "thread-uid"] \
  > /tmp/approval-message.json
```

**Required flags:**

- `--channel <id>` — Slack channel ID (e.g. `C0960S2Q8RL`)
- `--text <string>` — Message text (plain text fallback for notifications)

**Automatic behaviors (no flags needed):**

- **Auto-threading**: Automatically reads `NOTIFY_MSG_TS` from the environment and threads the message under the task notification. No `--thread-ts` flag needed unless you want to override.
- **Auto-Run-ID**: Automatically reads `INNGEST_RUN_ID` from the environment and includes it in the context block alongside the Task ID. No explicit flag needed.

**Optional flags:**

- `--task-id <uuid>` — When provided, auto-generates approval blocks with header, text, task context block, Approve & Post / Reject buttons. Omit `--blocks` when using this.
- `--title <string>` — Custom header title for the approval card (default: `"Task Review — <date>"`)
- `--blocks <json>` — Raw Block Kit JSON array. Mutually exclusive with `--task-id` auto-blocks.
- `--conversation-ref <string>` — Hostfully thread UID for supersede detection. Included in output if provided.
- `--thread-ts <ts>` — Override thread timestamp. If omitted, auto-reads `NOTIFY_MSG_TS` from env to thread under the task notification.
- `--no-thread` — Suppress auto-threading. Posts a new top-level message even when `NOTIFY_MSG_TS` is set in the environment.

**Environment variables:**

- `SLACK_BOT_TOKEN` (required)
- `NOTIFY_MSG_TS` (auto-read) — task notification timestamp; used for auto-threading
- `INNGEST_RUN_ID` (auto-read) — included in context block alongside Task ID

**Output (stdout):**

```json
{ "ts": "1234567890.123456", "channel": "C123456" }
```

Or with `--conversation-ref`:

```json
{
  "ts": "1234567890.123456",
  "channel": "C123456",
  "conversationRef": "2f18249a-9523-4acd-a512-20ff06d5c3fa"
}
```

**Example:**

```bash
# Threading is automatic — NOTIFY_MSG_TS and INNGEST_RUN_ID are read from env automatically
NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts \
  --channel "C0960S2Q8RL" \
  --text "Daily summary ready for review" \
  --task-id "$TASK_ID" \
  > /tmp/approval-message.json

# Override thread (explicit --thread-ts) or suppress threading (--no-thread):
NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts \
  --channel "C0960S2Q8RL" \
  --text "Standalone message" \
  --no-thread \
  > /tmp/approval-message.json
```

---

### `read-channels.ts` — Read Slack channel history

```bash
tsx /tools/slack/read-channels.ts \
  --channels "C123,C456" \
  [--lookback-hours 24]
```

**Required flags:**

- `--channels <ids>` — Comma-separated Slack channel IDs

**Optional flags:**

- `--lookback-hours <n>` — How far back to read (default: `24`)

**Environment variables:**

- `SLACK_BOT_TOKEN` (required)

**Output (stdout):**

```json
{
  "channels": [
    {
      "channelId": "C123",
      "messages": [
        {
          "ts": "1234.5678",
          "user": "U123",
          "text": "hello",
          "reply_count": 2,
          "thread_ts": "1234.5678"
        }
      ],
      "threadReplies": {
        "1234.5678": [
          {
            "ts": "1234.5679",
            "user": "U456",
            "text": "reply text",
            "reply_count": 0,
            "thread_ts": "1234.5678"
          }
        ]
      }
    }
  ]
}
```

**Notes:**

- Bot summary posts (blocks with `block_id: "papi-chulo-daily-summary"`) are automatically filtered out.
- Messages are returned in chronological order (oldest first).
- Thread replies are fetched for all parent messages with `reply_count > 0`.
- Channel fetch failures are non-fatal — failed channels return `{channelId, messages:[], threadReplies:{}}`.

**Example:**

```bash
tsx /tools/slack/read-channels.ts \
  --channels "C092BJ04HUG,C0AUBMXKVNU" \
  --lookback-hours 48 \
  > /tmp/channels.json
```

---

### `post-guest-approval.ts` — Post a guest message approval card

```bash
tsx /tools/slack/post-guest-approval.ts \
  --channel "C123456" \
  --task-id "uuid" \
  --guest-name "Jane Smith" \
  --property-name "Ocean View Condo" \
  --check-in "2026-06-01T15:00:00" \
  --check-out "2026-06-05T11:00:00" \
  --booking-channel "AIRBNB" \
  --original-message "What time is check-in?" \
  --draft-response "Check-in is at 3 PM." \
  --confidence 0.92 \
  --category "check-in-info" \
  --lead-uid "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb" \
  --thread-uid "2f18249a-9523-4acd-a512-20ff06d5c3fa" \
  --message-uid "msg-uid-here" \
  --thread-ts "$NOTIFY_MSG_TS" \
  [--lead-status "BOOKED"] \
  [--urgency] \
  [--conversation-summary "Guest asking about check-in time"] \
  [--conversation-ref "2f18249a-9523-4acd-a512-20ff06d5c3fa"]
```

**Required flags:**

- `--channel <id>` — Slack channel ID to post the approval card
- `--task-id <uuid>` — Current task UUID
- `--guest-name <string>` — Guest's full name
- `--property-name <string>` — Property display name
- `--check-in <string>` — Check-in date/time (ISO string or "TBD")
- `--check-out <string>` — Check-out date/time (ISO string or "TBD")
- `--booking-channel <string>` — Booking channel (e.g. `AIRBNB`, `VRBO`)
- `--original-message <string>` — The guest's message text
- `--draft-response <string>` — The proposed host reply
- `--confidence <float>` — Confidence score 0.0–1.0
- `--category <string>` — Message category (e.g. `check-in-info`, `access-codes`)
- `--lead-uid <uuid>` — **Lead/reservation UID** (from Hostfully `/leads`) — DIFFERENT from `--thread-uid`
- `--thread-uid <uuid>` — **Thread UID** (from Hostfully webhook `THREAD_UID` env var) — DIFFERENT from `--lead-uid`
- `--message-uid <string>` — Hostfully message UID

**Optional flags:**

- `--lead-status <string>` — Lead status (e.g. `BOOKED`, `INQUIRY`, `CLOSED`, `NEW`) — shown with emoji in card
- `--urgency` — Boolean flag (no value). Adds `:rotating_light: Urgent` to card.
- `--conversation-summary <string>` — Brief summary of the conversation context
- `--diagnosis <json>` — JSON string `{"hasMismatch":bool,"diagnosisSummary":"..."}` for lock diagnosis block
- `--conversation-ref <string>` — Hostfully thread UID for supersede detection (defaults to `--thread-uid`)
- `--dry-run` — Print blocks JSON to stdout without posting to Slack
- `--thread-ts <ts>` — ALWAYS pass `--thread-ts "$NOTIFY_MSG_TS"` to post the approval card as a thread reply under the task's notification message. `NOTIFY_MSG_TS` is the env var injected by the lifecycle. Omitting this causes the card to post as a new top-level message in the channel.
- `--reply-broadcast [true|false]` — Whether to broadcast the thread reply to the channel

**Environment variables:**

- `SLACK_BOT_TOKEN` (required, unless `--dry-run`)

**Output (stdout):**

```json
{ "ts": "1234567890.123456", "channel": "C123456" }
```

**Side effect:** Writes full approval metadata to `/tmp/approval-message.json`. The harness reads this file. Do not delete it.

**Idempotency guard:** If `/tmp/approval-message.json` already exists with a valid `ts`, the tool skips posting and returns the existing `ts`. This prevents double-posts on model retries.

**⚠️ CRITICAL:** `--lead-uid` and `--thread-uid` MUST be different UUIDs. The tool logs a stderr warning if they are identical, but does not error out. The Hostfully "View in Hostfully" button URL uses both separately — wrong values produce broken links.

---

## Hostfully Tools (`/tools/hostfully/`)

### `get-messages.ts` — Fetch guest conversation threads

```bash
tsx /tools/hostfully/get-messages.ts \
  [--lead-id <uid>] \
  [--property-id <uid>] \
  [--unresponded-only] \
  [--limit 30] \
  [--fallback-property-uid <uid>]
```

**⚠️ Flag name:** `--lead-id` (NOT `--lead-uid`). This differs from `post-guest-approval.ts`.

**Mutually exclusive:**

- `--lead-id <uid>` — Fetch conversation for a single lead. Falls back to `LEAD_UID` env var if omitted.
- `--property-id <uid>` — Fetch all conversations for a property. Requires `HOSTFULLY_AGENCY_UID` if also omitted.

**Optional flags:**

- `--unresponded-only` — Filter to threads where last message is from guest (ignored when `--lead-id` set)
- `--limit <n>` — Max messages per conversation thread (default: `30`)
- `--fallback-property-uid <uid>` — Property UID fallback when API returns null `propertyUid` (common for INQUIRY-type leads)

**Environment variables:**

- `HOSTFULLY_API_KEY` (required)
- `HOSTFULLY_AGENCY_UID` (required when no `--property-id` or `--lead-id`)
- `LEAD_UID` (automatic fallback if `--lead-id` not provided — injected by lifecycle)
- `THREAD_UID` (injected by lifecycle; populates `threadUid` in output)

**Output (stdout) — JSON array of thread objects:**

```json
[
  {
    "leadUid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "threadUid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "propertyUid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2",
    "guestName": "Jane Smith",
    "channel": "AIRBNB",
    "checkIn": "2026-06-01T15:00:00",
    "checkOut": "2026-06-05T11:00:00",
    "leadStatus": "BOOKED",
    "unresponded": true,
    "messages": [
      { "text": "What time is check-in?", "sender": "guest", "timestamp": "2026-05-20T14:30:00Z" },
      { "text": "Check-in is at 3 PM.", "sender": "host", "timestamp": "2026-05-20T15:00:00Z" }
    ]
  }
]
```

**Notes:**

- Includes all lead types **except** `BLOCK` (calendar blocks). Includes `BOOKING`, `INQUIRY`, `BOOKING_REQUEST`.
- Messages are sorted chronological (oldest first).
- `sender` values: `"guest"` or `"host"` (normalized from Hostfully's `GUEST`/`AGENCY`)
- `threadUid` is populated from the `THREAD_UID` env var (set by the lifecycle)

**Example:**

```bash
tsx /tools/hostfully/get-messages.ts \
  --lead-id "$LEAD_UID" \
  --fallback-property-uid "$PROPERTY_UID" \
  > /tmp/messages.json
```

---

### `send-message.ts` — Send a reply to a guest

⚠️ **IRREVERSIBLE** — Delivered immediately through the booking channel. Cannot be recalled.

```bash
tsx /tools/hostfully/send-message.ts \
  --lead-id <uid> \
  --message "Your message text here" \
  [--thread-id <uid>]
```

**Required flags:**

- `--lead-id <uid>` — Hostfully lead/reservation UID
- `--message <text>` — Message text to send

**Optional flags:**

- `--thread-id <uid>` — Hostfully thread UID. When provided, sends as a reply in that thread.

**Environment variables:**

- `HOSTFULLY_API_KEY` (required)

**Output (stdout):**

```json
{ "sent": true, "messageId": "abc123-uuid", "timestamp": "2026-05-20T15:00:00Z" }
```

**Notes:**

- All messages appear from `senderType: AGENCY` (the host/agency side).
- A 204 (empty body) response from Hostfully is also treated as success.

---

### `get-property.ts` — Fetch property details

```bash
tsx /tools/hostfully/get-property.ts --property-id <uid>
```

**Required flags:**

- `--property-id <uid>` — Hostfully property UID

**Environment variables:**

- `HOSTFULLY_API_KEY` (required)

**Output (stdout):**

```json
{
  "uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2",
  "name": "Ocean View Condo",
  "propertyType": "CONDO",
  "address": "123 Main St, Miami, FL 33101, US",
  "bedrooms": 2,
  "beds": 3,
  "bathrooms": 2,
  "maxGuests": 6,
  "checkInTime": 1500,
  "checkOutTime": 1100,
  "wifiNetwork": "OceanView_5G",
  "wifiPassword": "Welcome2OV",
  "bookingNotes": "...",
  "extraNotes": "...",
  "guideBookUrl": "https://...",
  "amenities": ["WIFI", "POOL", "PARKING"],
  "houseRules": [{ "rule": "NO_SMOKING", "description": "No smoking inside" }]
}
```

**Notes:**

- Fetches property info, amenities, and house rules in parallel.
- Amenities/rules fetch failures are non-fatal (logged to stderr; main property object still returned).

---

### `get-reservations.ts` — Fetch reservations for a property

```bash
tsx /tools/hostfully/get-reservations.ts \
  --property-id <uid> \
  [--status confirmed|cancelled|inquiry] \
  [--from YYYY-MM-DD] \
  [--to YYYY-MM-DD]
```

**Required flags:**

- `--property-id <uid>` — Hostfully property UID

**Optional flags:**

- `--status <status>` — Filter reservations:
  - `confirmed` — Active bookings (BOOKED, STAY, and variants)
  - `cancelled` — Any cancellation variant
  - `inquiry` — Guest inquiries (no confirmed booking)
  - Omitted — All non-BLOCK leads (default; last 30 days + future)
- `--from <YYYY-MM-DD>` — Check-in from date
- `--to <YYYY-MM-DD>` — Check-in to date

**Environment variables:**

- `HOSTFULLY_API_KEY` (required)

**Output (stdout) — JSON array:**

```json
[
  {
    "uid": "lead-uuid",
    "propertyUid": "property-uuid",
    "guestName": "Jane Smith",
    "checkIn": "2026-06-01T15:00:00",
    "checkOut": "2026-06-05T11:00:00",
    "channel": "AIRBNB",
    "numberOfGuests": 3,
    "status": "BOOKED"
  }
]
```

**Example — reservations checking out today:**

```bash
TODAY=$(date +%Y-%m-%d)
tsx /tools/hostfully/get-reservations.ts \
  --property-id "$PROPERTY_UID" \
  --status confirmed \
  --from "$TODAY" \
  --to "$TODAY"
```

---

## Lock Tools (`/tools/locks/`)

### `sifely-client.ts` — Sifely smart lock management

```bash
tsx /tools/locks/sifely-client.ts --action <action> [flags]
```

**Environment variables:**

- `SIFELY_USERNAME` (required)
- `SIFELY_PASSWORD` (required)
- `SIFELY_CLIENT_ID` (optional, default: `VLRE`)
- `SIFELY_BASE_URL` (optional, default: `https://app-smart-server.sifely.com`)

**⚠️ API quirk:** Sifely returns HTTP 200 even on auth failure. The tool checks `body.code` internally. For list operations, success omits the `code` field — presence of `code` indicates an error.

---

#### Action: `list-locks`

```bash
tsx /tools/locks/sifely-client.ts --action list-locks
```

Output (stdout) — JSON array:

```json
[
  {
    "lockId": 24572672,
    "lockName": "5306-kin-Home Front",
    "lockAlias": "Front Door",
    "lockMac": "AA:BB:CC:DD:EE:FF",
    "electricQuantity": 85,
    "hasGateway": 1
  }
]
```

---

#### Action: `list-passcodes`

```bash
tsx /tools/locks/sifely-client.ts --action list-passcodes --lock-id <id>
```

Required: `--lock-id <id>` — Sifely numeric lock ID

Output (stdout) — JSON array:

```json
[
  {
    "keyboardPwdId": 99,
    "lockId": "24572672",
    "keyboardPwd": "1221",
    "keyboardPwdName": "permanent-visitor-home",
    "keyboardPwdType": 2,
    "startDate": 1700000000000,
    "endDate": 0,
    "status": 1
  }
]
```

`keyboardPwdType`: 1=ONE_TIME, 2=PERMANENT, 3=TIMED

---

#### Action: `list-access-records`

```bash
tsx /tools/locks/sifely-client.ts --action list-access-records \
  --lock-id <id> \
  --start-date <epoch-ms> \
  --end-date <epoch-ms>
```

Required: `--lock-id`, `--start-date` (epoch ms), `--end-date` (epoch ms)

Output (stdout) — JSON array:

```json
[
  {
    "recordId": 12345,
    "lockId": 24572672,
    "recordType": 4,
    "success": 1,
    "keyboardPwd": "1221",
    "lockDate": 1700050000000,
    "serverDate": 1700050001000
  }
]
```

`success`: 1=success, 0=failed. `recordType`: 4=passcode entry.

---

#### Action: `create-passcode`

```bash
tsx /tools/locks/sifely-client.ts --action create-passcode \
  --lock-id <id> \
  --name "Passcode Name" \
  --code "1221" \
  [--type permanent|timed] \
  [--start-date <epoch-ms>] \
  [--end-date <epoch-ms>]
```

Required: `--lock-id`, `--name`, `--code` (4–9 numeric digits)
Optional: `--type` (default: `permanent`). For `timed`, `--start-date` and `--end-date` required.

Output (stdout):

```json
{ "keyboardPwdId": 99 }
```

Or if a passcode with the same `--name` already exists:

```json
{ "keyboardPwdId": 99, "existed": true }
```

---

#### Action: `update-passcode`

```bash
tsx /tools/locks/sifely-client.ts --action update-passcode \
  --lock-id <id> \
  --passcode-id <id> \
  [--code "4321"] \
  [--name "New Name"] \
  [--start-date <epoch-ms>] \
  [--end-date <epoch-ms>]
```

Required: `--lock-id`, `--passcode-id`
Optional: `--code` (change the code digits), `--name`, `--start-date`, `--end-date`

Output (stdout):

```json
{ "ok": true }
```

---

#### Action: `delete-passcode`

```bash
tsx /tools/locks/sifely-client.ts --action delete-passcode \
  --lock-id <id> \
  --passcode-id <id>
```

Required: `--lock-id`, `--passcode-id`

Output (stdout):

```json
{ "ok": true }
```

---

### `generate-code.ts` — Generate a memorable lock code

```bash
tsx /tools/locks/generate-code.ts \
  [--length 4|5|6] \
  [--exclude-codes "1221,2332"]
```

**Optional flags:**

- `--length <4|5|6>` — Constrain to a specific digit length (default: random from 4, 5, 6)
- `--exclude-codes <codes>` — Comma-separated codes to exclude (prevents reusing the current code)

**No environment variables required.**

**Output (stdout):**

```json
{
  "code": "1221",
  "pattern": "mirror",
  "length": 4,
  "description": "12, 21 — first two digits, then reversed"
}
```

**Patterns:**

- `mirror` — ABBA (4-digit), ABCBA (5-digit), ABCCBA (6-digit)
- `rhythm` — ABAB (4-digit), ABABA (5-digit), ABABAB/ABCABC (6-digit)

Never generates all-same digits or strict sequential sequences (e.g., 1234, 9876).

---

### `update-door-code.ts` — Update Hostfully property door code field

```bash
tsx /tools/locks/update-door-code.ts \
  --property-id <hostfully-property-uid> \
  --code <digits>
```

**Required flags:**

- `--property-id <uid>` — Hostfully property UID
- `--code <digits>` — New door code to set

**Environment variables:**

- `HOSTFULLY_API_KEY` (required)

**Output (stdout):**

```json
{ "success": true, "propertyId": "c960c8d2-...", "previousCode": "1221", "newCode": "4334" }
```

**Exit codes:**

- `0` — Success
- `1` — General error (API failure, missing args, etc.)
- `2` — `door_code` custom data field not found on the property

---

### `rotate-property-code.ts` — Full code rotation for a property

Generates a new memorable code, updates Hostfully's `door_code`, and rotates the matching Sifely passcode for all linked locks in one operation.

```bash
tsx /tools/locks/rotate-property-code.ts \
  --property-id <hostfully-property-uid> \
  [--code <specific-code>]
```

**Required flags:**

- `--property-id <uid>` — Hostfully property UID

**Optional flags:**

- `--code <digits>` — Use this specific code instead of generating a new one

**Environment variables:**

- `SUPABASE_URL` (required)
- `SUPABASE_SECRET_KEY` (required)
- `TENANT_ID` (required)
- `SIFELY_USERNAME` (required)
- `SIFELY_PASSWORD` (required)
- `HOSTFULLY_API_KEY` (required)

**Output (stdout):**

```json
{
  "success": true,
  "propertyId": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2",
  "newCode": "1221",
  "expectedPasscodeName": "permanent-visitor-home",
  "hostfullyUpdated": true,
  "hostfullyError": null,
  "locks": [
    {
      "lockId": "24572672",
      "lockName": "5306-kin-Home Front (PERSONAL)",
      "success": true,
      "action": "updated",
      "passcodeId": 99
    }
  ]
}
```

**Notes:**

- Looks up linked locks from `property_locks` table via PostgREST.
- For each lock: lists passcodes, finds one matching `passcode_name` (default: `permanent-visitor-home`), updates it (or creates if not found).
- `hostfullyUpdated: false` with `hostfullyError: "door_code field not found"` means the Hostfully custom data field is missing.

---

## Knowledge Base Tools (`/tools/knowledge_base/`)

### `search.ts` — Fetch knowledge base content for an entity

```bash
tsx /tools/knowledge_base/search.ts \
  --entity-type <type> \
  --entity-id <id> \
  [--tenant-id <uuid>]
```

**Required flags:**

- `--entity-type <type>` — Entity type (e.g. `property`, `restaurant`)
- `--entity-id <id>` — Entity ID (normalized to lowercase before querying)

**Optional flags:**

- `--tenant-id <uuid>` — Tenant UUID (falls back to `TENANT_ID` env var)

**Environment variables:**

- `SUPABASE_URL` (required)
- `SUPABASE_SECRET_KEY` (required)
- `TENANT_ID` (required if `--tenant-id` not provided)

**Output (stdout):**

```json
{
  "content": "# Ocean View Condo\nCheck-in is at 3 PM...\n\n---\n\n# Common Policies\n\nNo smoking...",
  "entityFound": true,
  "commonFound": true,
  "entityType": "property",
  "entityId": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
}
```

**Notes:**

- Returns entity-specific content followed by common (shared) policies, concatenated with a `---` separator.
- No keyword filtering — returns all content; the LLM interprets relevance.
- Exit code 0 even when no rows found (`content` will be empty string, `entityFound`/`commonFound` will be `false`).

**Example:**

```bash
tsx /tools/knowledge_base/search.ts \
  --entity-type property \
  --entity-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2" \
  > /tmp/kb.json
```

---

## Jira Tools (`/tools/jira/`)

All Jira tools require environment variables `JIRA_API_TOKEN`, `JIRA_USER_EMAIL`, and `JIRA_BASE_URL` (Basic auth). Set `JIRA_MOCK=true` to return fixture data without hitting the real API.

### `validate-env.ts` — Check Jira credentials

```bash
tsx /tools/jira/validate-env.ts
```

**No flags required.** **Always exits 0.** Outputs JSON status.

**Output (stdout):**

```json
// All configured:
{ "ok": true, "vars": { "JIRA_API_TOKEN": "set", "JIRA_USER_EMAIL": "set", "JIRA_BASE_URL": "set" } }

// Missing vars:
{ "ok": false, "missing": ["JIRA_API_TOKEN", "JIRA_USER_EMAIL"] }
```

---

### `get-issue.ts` — Fetch a Jira issue

```bash
tsx /tools/jira/get-issue.ts --issue-key PROJ-123
```

**Required flags:** `--issue-key <key>` — Jira issue key (e.g. `VLRE-42`)

**Mock mode:** `JIRA_MOCK=true tsx /tools/jira/get-issue.ts --issue-key TEST-1`

**Output (stdout):**

```json
{
  "id": "10042",
  "key": "PROJ-1",
  "summary": "Implement login feature",
  "description": "Plain text description (ADF converted)",
  "status": "In Progress",
  "priority": "High",
  "assignee": "Alice Johnson",
  "reporter": "Bob Martinez",
  "labels": ["authentication", "backend"],
  "created": "2026-05-01T09:00:00.000+0000",
  "updated": "2026-05-20T14:30:00.000+0000",
  "project": { "key": "PROJ", "name": "My SaaS Project" }
}
```

**Exit codes:** `0` success · `1` missing flag/env var/API error

---

### `search-issues.ts` — Search Jira issues by JQL

```bash
tsx /tools/jira/search-issues.ts [--project KEY] [--status "In Progress"] [--assignee "Name"] [--jql "raw JQL"]
```

**Optional flags (build JQL):** `--project`, `--status`, `--assignee` — combined with AND  
**Or raw:** `--jql "project = VLRE AND status = 'In Progress'"`

**Mock mode:** `JIRA_MOCK=true tsx /tools/jira/search-issues.ts --project TEST`

**Output (stdout):**

```json
{
  "issues": [
    {
      "key": "PROJ-1",
      "summary": "...",
      "status": "In Progress",
      "priority": "High",
      "assignee": "Alice"
    }
  ],
  "total": 3,
  "maxResults": 50
}
```

**Exit codes:** `0` success · `1` API error

---

### `add-comment.ts` — Add a comment to a Jira issue

```bash
tsx /tools/jira/add-comment.ts --issue-key PROJ-123 --text "Plain text comment"
```

**Required flags:** `--issue-key <key>`, `--text <text>` — Text is auto-wrapped in ADF; no manual ADF needed.

**Mock mode:** `JIRA_MOCK=true tsx /tools/jira/add-comment.ts --issue-key TEST-1 --text "test"`

**Output (stdout):**

```json
{ "id": "10101", "body": "Plain text of posted comment", "created": "2026-05-21T10:00:00.000+0000" }
```

**Exit codes:** `0` success · `1` missing flag/env var/API error

---

### `list-comments.ts` — List comments on a Jira issue

```bash
tsx /tools/jira/list-comments.ts --issue-key PROJ-123
```

**Required flags:** `--issue-key <key>`

**Mock mode:** `JIRA_MOCK=true tsx /tools/jira/list-comments.ts --issue-key TEST-1`

**Output (stdout):**

```json
{
  "comments": [
    {
      "id": "10099",
      "author": "Alice Johnson",
      "body": "Plain text (ADF converted)",
      "created": "2026-05-15T09:30:00.000+0000"
    }
  ],
  "total": 2
}
```

**Exit codes:** `0` success · `1` missing flag/env var/API error

---

## Platform Tools (`/tools/platform/`)

### `report-issue.ts` — Report a tool issue

Call this when a tool returns an unexpected error, behaves differently from its documentation, or you patch a `.ts` file in `/tools/` to work around a bug.

```bash
tsx /tools/platform/report-issue.ts \
  --task-id <uuid> \
  --tool-name <name> \
  --description "Description of what went wrong" \
  [--patch-diff "<unified diff string>"]
```

**Required flags:**

- `--task-id <uuid>` — Current task UUID (use `$TASK_ID`)
- `--tool-name <name>` — Name of the affected tool (e.g. `get-messages.ts`)
- `--description <text>` — What went wrong (unexpected error, API shape mismatch, etc.)

**Optional flags:**

- `--patch-diff <diff>` — Unified diff of any patch you applied to work around the issue

**Environment variables:**

- `SUPABASE_URL` (required)
- `SUPABASE_SECRET_KEY` (required)
- `TENANT_ID` (required)
- `SLACK_BOT_TOKEN` (required)
- `ISSUES_SLACK_CHANNEL` (optional — if not set, DB write still succeeds but no Slack alert sent)

**Output (stdout):**

```json
{ "ok": true, "event_id": "system-event-uuid" }
```

**Exit codes:**

- `0` — DB write succeeded (Slack alert failure is non-fatal — logged to stderr)
- `1` — DB write failed, missing required arg, or missing required env var

**Example:**

```bash
tsx /tools/platform/report-issue.ts \
  --task-id "$TASK_ID" \
  --tool-name "get-messages.ts" \
  --description "API returned 404 for lead $LEAD_UID — lead may have been deleted"
```

---

### `submit-output.ts` — Submit task output and classification

Call this at the end of every task to write the output files the harness expects. This is the final step before the lifecycle transitions out of `Executing`.

```bash
tsx /tools/platform/submit-output.ts \
  --summary "Task complete — drafted reply sent for approval" \
  --classification "NEEDS_APPROVAL" \
  [--draft "Your message text here"] \
  [--confidence 0.9] \
  [--reasoning "High confidence based on property KB match"] \
  [--urgency] \
  [--metadata '{"key":"value"}'] \
  [--help]
```

**Required flags:**

- `--summary <text>` — Human-readable summary of what the task accomplished. Written to `/tmp/summary.txt`.
- `--classification <value>` — Exactly one of:
  - `NEEDS_APPROVAL` — A deliverable was produced and requires human review before sending
  - `NO_ACTION_NEEDED` — Task is complete with no deliverable (e.g. message already answered, no unresponded threads)

**Optional flags:**

- `--draft <text>` — The proposed deliverable text (e.g. the guest reply draft). Included in the JSON output.
- `--confidence <float>` — Confidence score 0.0–1.0 for the classification or draft quality.
- `--reasoning <text>` — Explanation of why this classification was chosen.
- `--urgency` — Boolean presence flag (no value). Marks the task as urgent.
- `--metadata <json>` — Arbitrary JSON string for additional structured data (e.g. `'{"leadUid":"abc-123"}'`).
- `--help` — Print usage to stdout and exit 0.

**No environment variables required.**

**Output (stdout):**

```json
{
  "summary": "Task complete — drafted reply sent for approval",
  "classification": "NEEDS_APPROVAL",
  "draft": "Your message text here",
  "confidence": 0.9,
  "reasoning": "High confidence based on property KB match",
  "urgency": true,
  "metadata": { "key": "value" }
}
```

**Side effect:** Writes the output contract JSON to `/tmp/summary.txt` only. Do NOT write `/tmp/approval-message.json` — the platform constructs approval cards automatically from `/tmp/summary.txt`. Do not delete `/tmp/summary.txt`.

**Exit codes:**

- `0` — Files written successfully
- `1` — Missing required flag (`--summary` or `--classification`), invalid `--classification` value, or file write error

**Examples:**

```bash
# Minimal — task complete, no deliverable needed:
tsx /tools/platform/submit-output.ts \
  --summary "No unresponded guest messages found" \
  --classification "NO_ACTION_NEEDED"

# With approval draft:
tsx /tools/platform/submit-output.ts \
  --summary "Drafted reply to guest check-in question" \
  --classification "NEEDS_APPROVAL" \
  --draft "Check-in is at 3 PM. The door code is 1221." \
  --confidence 0.9 \
  --reasoning "Clear check-in question with matching KB entry" \
  --urgency \
  --metadata '{"leadUid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb"}'
```

---

## Quick Reference Table

| Tool                      | Container Path           | Required Flags                              | Output Shape                                                                                                    |
| ------------------------- | ------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `post-message.ts`         | `/tools/slack/`          | `--channel`, `--text`                       | `{ts, channel}`                                                                                                 |
| `read-channels.ts`        | `/tools/slack/`          | `--channels`                                | `{channels:[{channelId, messages, threadReplies}]}`                                                             |
| `post-guest-approval.ts`  | `/tools/slack/`          | 13 flags (see above)                        | `{ts, channel}` + writes `/tmp/approval-message.json`                                                           |
| `get-messages.ts`         | `/tools/hostfully/`      | `--lead-id` OR `--property-id`              | `[{leadUid, threadUid, propertyUid, guestName, channel, checkIn, checkOut, leadStatus, unresponded, messages}]` |
| `send-message.ts`         | `/tools/hostfully/`      | `--lead-id`, `--message`                    | `{sent, messageId, timestamp}`                                                                                  |
| `get-property.ts`         | `/tools/hostfully/`      | `--property-id`                             | `{uid, name, address, amenities, houseRules, ...}`                                                              |
| `get-reservations.ts`     | `/tools/hostfully/`      | `--property-id`                             | `[{uid, guestName, checkIn, checkOut, channel, numberOfGuests, status}]`                                        |
| `sifely-client.ts`        | `/tools/locks/`          | `--action`, `--lock-id` (most)              | Varies by action (array for list, `{ok:true}` for mutations)                                                    |
| `generate-code.ts`        | `/tools/locks/`          | (none required)                             | `{code, pattern, length, description}`                                                                          |
| `update-door-code.ts`     | `/tools/locks/`          | `--property-id`, `--code`                   | `{success, propertyId, previousCode, newCode}`                                                                  |
| `rotate-property-code.ts` | `/tools/locks/`          | `--property-id`                             | `{success, newCode, expectedPasscodeName, hostfullyUpdated, hostfullyError, locks}`                             |
| `search.ts`               | `/tools/knowledge_base/` | `--entity-type`, `--entity-id`              | `{content, entityFound, commonFound, entityType, entityId}`                                                     |
| `validate-env.ts`         | `/tools/jira/`           | (none)                                      | `{ok, vars}` or `{ok:false, missing:[]}`                                                                        |
| `get-issue.ts`            | `/tools/jira/`           | `--issue-key`                               | `{id, key, summary, description, status, priority, assignee, reporter, labels, created, updated, project}`      |
| `search-issues.ts`        | `/tools/jira/`           | (at least one filter or `--jql`)            | `{issues:[{key, summary, status, priority, assignee}], total, maxResults}`                                      |
| `add-comment.ts`          | `/tools/jira/`           | `--issue-key`, `--text`                     | `{id, body, created}`                                                                                           |
| `list-comments.ts`        | `/tools/jira/`           | `--issue-key`                               | `{comments:[{id, author, body, created}], total}`                                                               |
| `report-issue.ts`         | `/tools/platform/`       | `--task-id`, `--tool-name`, `--description` | `{ok, event_id}`                                                                                                |
| `submit-output.ts`        | `/tools/platform/`       | `--summary`, `--classification`             | `{summary, classification, draft?, confidence?, reasoning?, urgency?, metadata?}` + writes `/tmp/summary.txt`   |
