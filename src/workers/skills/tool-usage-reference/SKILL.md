---
name: tool-usage-reference
description: 'Use when calling any shell tool available in the container (/tools/slack/, /tools/hostfully/, /tools/sifely/, /tools/knowledge_base/, /tools/platform/). Contains exact CLI syntax, required flags, output JSON shapes, and critical warnings about common mistakes.'
---

# Tool Usage Reference

Exact CLI syntax for every shell tool pre-installed in the worker container.
All tools are executed via `tsx`. Output is JSON to stdout; errors go to stderr.

<!-- The sections below are auto-generated from src/lib/tool-registry.ts (ALL_TOOL_DESCRIPTORS). Run `pnpm generate-tool-usage-skill` to regenerate. Edit the registry, not this section. -->

## composio/execute

**Description**: Execute any Composio action (Notion, Google, Jira, and more)

**Invocation**: `tsx /tools/composio/execute.ts [flags]`

**Environment variables**: COMPOSIO_API_KEY, TENANT_ID

**Arguments**:

- `--action` (required): Composio action slug (e.g. NOTION_CREATE_PAGE)
- `--params` (optional): JSON string of action parameters

## composio/list-actions

**Description**: Discover available Composio actions for a toolkit at runtime

**Invocation**: `tsx /tools/composio/list-actions.ts [flags]`

**Environment variables**: COMPOSIO_API_KEY

**Arguments**:

- `--toolkit` (required): Toolkit name (e.g. notion, gmail, jira)

## github/get-token

**Description**: Fetch a short-lived GitHub App installation token for git/gh CLI operations

**Invocation**: `tsx /tools/github/get-token.ts [flags]`

**Environment variables**: GITHUB_APP_ID, GITHUB_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID

**Arguments**:

- `--installation-id` (optional): GitHub App installation ID (resolved from tenant if omitted)

## hostfully/get-checkouts

**Description**: List upcoming checkouts for Hostfully properties

**Invocation**: `tsx /tools/hostfully/get-checkouts.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--days` (optional): Number of days ahead to look (default: 1)

## hostfully/get-door-code

**Description**: Retrieve the door code custom data field for a Hostfully property

**Invocation**: `tsx /tools/hostfully/get-door-code.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--property-id` (required): Hostfully property UID

## hostfully/get-messages

**Description**: Retrieve inbox messages for a Hostfully lead/thread

**Invocation**: `tsx /tools/hostfully/get-messages.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--lead-uid` (required): Hostfully lead UID

## hostfully/get-properties

**Description**: List all Hostfully properties for the agency

**Invocation**: `tsx /tools/hostfully/get-properties.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- _(no arguments)_

## hostfully/get-property

**Description**: Get details for a single Hostfully property by UID

**Invocation**: `tsx /tools/hostfully/get-property.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--property-uid` (required): Hostfully property UID

## hostfully/get-reservations

**Description**: List reservations for a Hostfully property

**Invocation**: `tsx /tools/hostfully/get-reservations.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--property-uid` (required): Hostfully property UID

## hostfully/get-reviews

**Description**: List guest reviews for a Hostfully property

**Invocation**: `tsx /tools/hostfully/get-reviews.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--property-uid` (required): Hostfully property UID

## hostfully/register-webhook

**Description**: Register a webhook endpoint with Hostfully for a specific event type

**Invocation**: `tsx /tools/hostfully/register-webhook.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--url` (required): Public URL to receive webhook events
- `--event-type` (required): Hostfully event type (e.g. NEW_INBOX_MESSAGE)

## hostfully/send-message

**Description**: Send a reply message to a Hostfully guest thread

**Invocation**: `tsx /tools/hostfully/send-message.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--lead-uid` (required): Hostfully lead UID
- `--body` (required): Message body to send

## hostfully/update-door-code

**Description**: Update the door code custom data field for a Hostfully property

**Invocation**: `tsx /tools/hostfully/update-door-code.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- `--property-id` (required): Hostfully property UID
- `--code` (required): New door code value to set

## hostfully/validate-env

**Description**: Validate that all required Hostfully environment variables are set

**Invocation**: `tsx /tools/hostfully/validate-env.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY

**Arguments**:

- _(no arguments)_

## knowledge_base/search

**Description**: Semantic search over the employee knowledge base entries

**Invocation**: `tsx /tools/knowledge_base/search.ts [flags]`

**Environment variables**: SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID, OPENROUTER_API_KEY

**Arguments**:

- `--query` (required): Natural language search query
- `--limit` (optional): Max results to return (default: 5)

## platform/calculate

**Description**: Evaluate a mathematical expression and return the numeric result

**Invocation**: `tsx /tools/platform/calculate.ts [flags]`

**Environment variables**: None

**Arguments**:

- `--expression` (required): Math expression to evaluate (e.g. "2 + 2 * 3")

## platform/report-issue

**Description**: Report a platform issue or error to the issues Slack channel

**Invocation**: `tsx /tools/platform/report-issue.ts [flags]`

**Environment variables**: SLACK_BOT_TOKEN

**Arguments**:

- `--message` (required): Issue description to report
- `--task-id` (optional): Task ID associated with the issue

## platform/submit-output

**Description**: Submit task output (summary and optional draft file) to the platform

**Invocation**: `tsx /tools/platform/submit-output.ts [flags]`

**Environment variables**: SUPABASE_URL, SUPABASE_SECRET_KEY, TASK_ID

**Arguments**:

- `--summary` (required): Short summary of what was done
- `--classification` (required): NEEDS_APPROVAL or NO_ACTION_NEEDED
- `--draft-file` (optional): Path to file containing the full draft deliverable

## sifely/create-passcode

**Description**: Create a new permanent passcode on a Sifely smart lock

**Invocation**: `tsx /tools/sifely/create-passcode.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

**Arguments**:

- `--lock-id` (required): Sifely lock ID
- `--name` (required): Passcode name (e.g. permanent-visitor-home)
- `--code` (required): Numeric passcode to set

## sifely/delete-passcode

**Description**: Delete a passcode from a Sifely smart lock by passcode ID

**Invocation**: `tsx /tools/sifely/delete-passcode.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

**Arguments**:

- `--lock-id` (required): Sifely lock ID
- `--passcode-id` (required): Passcode ID to delete

## sifely/diagnose-access

**Description**: Cross-references Hostfully door codes against Sifely smart lock passcodes and recent access records to diagnose guest lock access issues.

**Invocation**: `tsx /tools/sifely/diagnose-access.ts [flags]`

**Environment variables**: HOSTFULLY_API_KEY, SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD, SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID

**Arguments**:

- `--property-id` (required): Hostfully property UID to diagnose

## sifely/generate-code

**Description**: Generates a memorable 4–6 digit lock code using mirror (ABBA) or rhythm (ABAB) patterns, excluding weak or previously used codes.

**Invocation**: `tsx /tools/sifely/generate-code.ts [flags]`

**Environment variables**: None

**Arguments**:

- `--length` (optional): Constrain output to a specific code length (4, 5, or 6)
- `--exclude-codes` (optional): Comma-separated list of codes to exclude (for rotation)

## sifely/list-access-records

**Description**: List recent access records (unlock/lock events) for a Sifely lock

**Invocation**: `tsx /tools/sifely/list-access-records.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

**Arguments**:

- `--lock-id` (required): Sifely lock ID
- `--start-date` (optional): Start timestamp in ms (default: 2 hours ago)
- `--end-date` (optional): End timestamp in ms (default: now)

## sifely/list-locks

**Description**: List all Sifely smart locks accessible to the authenticated account

**Invocation**: `tsx /tools/sifely/list-locks.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

**Arguments**:

- _(no arguments)_

## sifely/list-passcodes

**Description**: List all passcodes on a Sifely smart lock

**Invocation**: `tsx /tools/sifely/list-passcodes.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

**Arguments**:

- `--lock-id` (required): Sifely lock ID

## sifely/rotate-property-code

**Description**: Rotates the lock code for a single Hostfully property and all its associated Sifely locks, updating both Sifely passcodes and the Hostfully door code field.

**Invocation**: `tsx /tools/sifely/rotate-property-code.ts [flags]`

**Environment variables**: SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID, SIFELY_USERNAME, SIFELY_PASSWORD, HOSTFULLY_API_KEY

**Arguments**:

- `--property-id` (required): Hostfully property UID to rotate the code for
- `--code` (optional): Use this specific code instead of generating a new one

## sifely/update-passcode

**Description**: Update the code value of an existing Sifely passcode

**Invocation**: `tsx /tools/sifely/update-passcode.ts [flags]`

**Environment variables**: SIFELY_CLIENT_ID, SIFELY_USERNAME, SIFELY_PASSWORD

**Arguments**:

- `--lock-id` (required): Sifely lock ID
- `--passcode-id` (required): Passcode ID to update
- `--code` (required): New numeric passcode value

## slack/post-guest-approval

**Description**: Post a guest-reply approval card to Slack for PM review

**Invocation**: `tsx /tools/slack/post-guest-approval.ts [flags]`

**Environment variables**: SLACK_BOT_TOKEN

**Arguments**:

- `--channel` (required): Slack channel ID
- `--task-id` (required): Task ID for the approval action
- `--draft-reply` (required): Draft reply text to show in the card

## slack/post-message

**Description**: Post a message to a Slack channel

**Invocation**: `tsx /tools/slack/post-message.ts [flags]`

**Environment variables**: SLACK_BOT_TOKEN

**Arguments**:

- `--channel` (required): Slack channel ID
- `--text` (required): Message text to post
- `--thread-ts` (optional): Thread timestamp to reply to

## slack/read-channels

**Description**: Read recent messages from one or more Slack channels

**Invocation**: `tsx /tools/slack/read-channels.ts [flags]`

**Environment variables**: SLACK_BOT_TOKEN

**Arguments**:

- `--channels` (required): Comma-separated list of channel IDs
- `--limit` (optional): Max messages per channel (default: 10)

<!-- HAND-WRITTEN: DO NOT GENERATE BELOW -->

## ⚠️ CRITICAL WARNINGS — Read Before Every Tool Call

> Canonical invocation paths for every tool are listed in the auto-generated section above (the `**Invocation**` line under each `service/id` heading). Never hand-type a `/tools/...` path — copy it from the generated section so it can never go stale on a rename.

### 1. `lead_uid` ≠ `thread_uid` — NEVER pass the same value to both

These are **different UUIDs** from **different Hostfully entities**:

- **`lead_uid`** (`37f5f58f-…`) — identifies the reservation/guest lead (Hostfully `/leads` endpoint)
- **`thread_uid`** (`2f18249a-…`) — identifies the Hostfully message thread (`/threads` or webhook payload)

They are **never the same value**. Passing the same UUID to both `--lead-uid` and `--thread-uid` in `post-guest-approval.ts` is a model error. The tool logs a stderr warning when this happens. If the Hostfully link in the Slack card opens the wrong thread, this is the cause.

### 2. `NODE_NO_WARNINGS=1` prefix required for `post-message.ts`

Always prefix the `post-message.ts` invocation with `NODE_NO_WARNINGS=1` to suppress Node.js deprecation noise that corrupts JSON parsing by the harness. Redirect stdout to `/tmp/approval-message.json`.

### 3. `get-messages.ts` uses `--lead-id` (not `--lead-uid`)

The flag is `--lead-id`, not `--lead-uid`. This differs from `post-guest-approval.ts` which uses `--lead-uid`. Do not confuse them.

### 4. `send-message.ts` is irreversible

Messages sent via `send-message.ts` are delivered immediately to the guest through their booking channel (Airbnb, VRBO, etc.). They cannot be recalled or deleted. Always verify `--lead-id` and `--message` before calling.

### 5. Sifely HTTP 200 ≠ success — always check `body.code`

The Sifely API returns HTTP 200 even on authentication failure. You must check the response body `code` field. The Sifely tools handle this internally — but know why it matters if debugging raw API calls.

---

## Slack Tools (`/tools/slack/`)

### `post-message.ts` — Post a Slack message

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

**Worked example:** Threading is automatic — `NOTIFY_MSG_TS` and `INNGEST_RUN_ID` are read from env. A typical approval post uses `--channel "$NOTIFICATION_CHANNEL" --text "..." --task-id "$TASK_ID"` and redirects stdout to `/tmp/approval-message.json`. To post a standalone top-level message, add `--no-thread`; to thread under a specific message, add `--thread-ts <ts>`.

---

### `read-channels.ts` — Read Slack channel history

**Note on flags:** the generated section lists `--channels` and `--limit`. The tool also accepts `--lookback-hours <n>` (default: `24`) to bound how far back to read.

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

**Worked example:** read two channels for the last 48 hours with `--channels "C092BJ04HUG,C0AUBMXKVNU" --lookback-hours 48`.

---

### `post-guest-approval.ts` — Post a guest message approval card

**Channel:** Always reads from the `NOTIFICATION_CHANNEL` environment variable (injected by the lifecycle). No `--channel` flag — the tool hard-fails if `NOTIFICATION_CHANNEL` is not set.

**Required flags:**

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
- `--thread-ts <ts>` — Override thread timestamp. Defaults to `$NOTIFY_MSG_TS` env var when not provided. Omitting both causes a top-level post (no threading).
- `--reply-broadcast [true|false]` — Whether to broadcast the thread reply to the channel

**Auto-output:** This tool automatically writes `/tmp/summary.txt` via `submit-output.ts` before posting to Slack. Do NOT call `submit-output.ts` separately after this tool — doing so would cause a double-write.

**Environment variables:**

- `SLACK_BOT_TOKEN` (required, unless `--dry-run`)
- `NOTIFICATION_CHANNEL` (required) — Slack channel ID; injected by the lifecycle

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

**Worked example:** the common guest-messaging call is `--lead-id "$LEAD_UID" --fallback-property-uid "$PROPERTY_UID"`.

---

### `send-message.ts` — Send a reply to a guest

⚠️ **IRREVERSIBLE** — Delivered immediately through the booking channel. Cannot be recalled.

**Flags:**

- `--lead-id <uid>` (required) — Hostfully lead/reservation UID
- `--message <text>` (required) — Message text to send
- `--thread-id <uid>` (optional) — Hostfully thread UID. When provided, sends as a reply in that thread.

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

**Required flags:** `--property-id <uid>` — Hostfully property UID

**Environment variables:** `HOSTFULLY_API_KEY` (required)

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

### `get-checkouts.ts` — Fetch all confirmed checkouts for a date (agency-wide)

**Required flags:** `--date <YYYY-MM-DD>` — Target checkout date

**Environment variables:**

- `HOSTFULLY_API_KEY` (required)
- `HOSTFULLY_AGENCY_UID` (required)
- `HOSTFULLY_API_URL` (optional, default: `https://api.hostfully.com/api/v3.2`)
- `HOSTFULLY_MOCK` (optional) — Set to `true` to return fixture data

**Output (stdout) — JSON array of CheckoutItem objects:**

```json
[
  {
    "propertyUid": "8daa2e85-8818-4055-9047-bd712c987026",
    "listingName": "3505-BAN-1",
    "normalizedAddress": "3505 Banton Rd, Unit B",
    "roomId": "Habitación 1",
    "zipCode": "78722",
    "city": "Austin, TX",
    "checkIn": "2026-05-26T15:00:00",
    "checkOut": "2026-06-01T11:00:00",
    "checkOutTime": "11:00",
    "guestName": null,
    "status": "BOOKED",
    "channel": "AIRBNB"
  }
]
```

**Notes:**

- Fetches all properties (paginated), then queries leads API per property sequentially (avoids rate limits).
- Filters: `type === 'BOOKING'` AND status in `{BOOKED, BOOKED_BY_AGENT, BOOKED_BY_CUSTOMER, BOOKED_EXTERNALLY, STAY}` AND `checkOut.substring(0,10) === date`.
- `normalizedAddress` — stripped of embedded unit letters (e.g. `"4405 - A Hayride lane"` → `"4405 Hayride Lane"`), street types title-cased.
- `roomId` — derived from listing name: `-N` suffix → `"Habitación N"`, letter after street number → `"Unidad X"`, `-LOFT` → `"Loft"`, otherwise → `"Casa"`.
- `city` — overridden from ZIP code lookup (ZIP_CITY table).
- Property detail failures are non-fatal (warning to stderr, listing name used as fallback).
- Returns `[]` when no checkouts found (exits 0, not an error).

---

### `get-reservations.ts` — Fetch reservations for a property

**Required flags:** `--property-id <uid>` — Hostfully property UID

**Optional flags:**

- `--status <status>` — Filter reservations:
  - `confirmed` — Active bookings (BOOKED, STAY, and variants)
  - `cancelled` — Any cancellation variant
  - `inquiry` — Guest inquiries (no confirmed booking)
  - Omitted — All non-BLOCK leads (default; last 30 days + future)
- `--from <YYYY-MM-DD>` — Check-in from date
- `--to <YYYY-MM-DD>` — Check-in to date

**Environment variables:** `HOSTFULLY_API_KEY` (required)

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

**Worked example — reservations checking out today:** set `TODAY=$(date +%Y-%m-%d)` and pass `--property-id "$PROPERTY_UID" --status confirmed --from "$TODAY" --to "$TODAY"`.

---

## Sifely Lock Tools (`/tools/sifely/`)

> Each Sifely operation is its own tool (`sifely/list-locks`, `sifely/list-passcodes`, `sifely/create-passcode`, `sifely/update-passcode`, `sifely/delete-passcode`, `sifely/list-access-records`, `sifely/generate-code`, `sifely/diagnose-access`, `sifely/rotate-property-code`). Copy each invocation path from the generated section above.

**Environment variables (Sifely lock tools):**

- `SIFELY_USERNAME` (required)
- `SIFELY_PASSWORD` (required)
- `SIFELY_CLIENT_ID` (optional, default: `VLRE`)
- `SIFELY_BASE_URL` (optional, default: `https://app-smart-server.sifely.com`)

**⚠️ API quirk:** Sifely returns HTTP 200 even on auth failure. The tools check `body.code` internally. For list operations, success omits the `code` field — presence of `code` indicates an error.

### `sifely/list-locks`

**Output (stdout) — JSON array:**

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

### `sifely/list-passcodes`

Required: `--lock-id <id>` — Sifely numeric lock ID

**Output (stdout) — JSON array:**

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

### `sifely/list-access-records`

Required: `--lock-id`, `--start-date` (epoch ms), `--end-date` (epoch ms)

**Output (stdout) — JSON array:**

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

### `sifely/create-passcode`

Required: `--lock-id`, `--name`, `--code` (4–9 numeric digits). Optional: `--type` (default: `permanent`); for `timed`, `--start-date` and `--end-date` are required.

**Output (stdout):**

```json
{ "keyboardPwdId": 99 }
```

Or if a passcode with the same `--name` already exists:

```json
{ "keyboardPwdId": 99, "existed": true }
```

### `sifely/update-passcode`

Required: `--lock-id`, `--passcode-id`. Optional: `--code` (change the code digits), `--name`, `--start-date`, `--end-date`.

**Output (stdout):**

```json
{ "ok": true }
```

### `sifely/delete-passcode`

Required: `--lock-id`, `--passcode-id`.

**Output (stdout):**

```json
{ "ok": true }
```

### `sifely/generate-code` — Generate a memorable lock code

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

### `sifely/rotate-property-code` — Full code rotation for a property

Generates a new memorable code, updates Hostfully's `door_code`, and rotates the matching Sifely passcode for all linked locks in one operation.

**Required flags:** `--property-id <uid>` — Hostfully property UID. **Optional:** `--code <digits>` — Use this specific code instead of generating a new one.

**Environment variables:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TENANT_ID`, `SIFELY_USERNAME`, `SIFELY_PASSWORD`, `HOSTFULLY_API_KEY` (all required).

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

---

## Platform Tools (`/tools/platform/`)

### `report-issue.ts` — Report a tool issue

Call this when a tool returns an unexpected error, behaves differently from its documentation, or you patch a `.ts` file in `/tools/` to work around a bug.

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

---

### `submit-output.ts` — Submit task output and classification

Call this at the end of every task to write the output files the harness expects. This is the final step before the lifecycle transitions out of `Executing`.

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

**Note:** If your `execution_steps` use `post-guest-approval.ts`, do NOT call `submit-output.ts` separately. `post-guest-approval.ts` calls `submit-output.ts` internally and writes both contract files.

**Exit codes:**

- `0` — Files written successfully
- `1` — Missing required flag (`--summary` or `--classification`), invalid `--classification` value, or file write error

**Worked examples:**

- Minimal (task complete, no deliverable): `--summary "No unresponded guest messages found" --classification "NO_ACTION_NEEDED"`.
- With approval draft: `--summary "..." --classification "NEEDS_APPROVAL" --draft "Check-in is at 3 PM. The door code is 1221." --confidence 0.9 --reasoning "..." --urgency --metadata '{"leadUid":"37f5f58f-..."}'`.

---

## Quick Reference Table

Container invocation paths for each tool are in the auto-generated section above (`**Invocation**` line per `service/id`). This table summarizes required flags and output shapes only.

| Tool                          | Required Flags                              | Output Shape                                                                                                                          |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `slack/post-message`          | `--channel`, `--text`                       | `{ts, channel}`                                                                                                                       |
| `slack/read-channels`         | `--channels`                                | `{channels:[{channelId, messages, threadReplies}]}`                                                                                   |
| `slack/post-guest-approval`   | 13 flags (see above)                        | `{ts, channel}` + writes `/tmp/approval-message.json`                                                                                 |
| `hostfully/get-messages`      | `--lead-id` OR `--property-id`              | `[{leadUid, threadUid, propertyUid, guestName, channel, checkIn, checkOut, leadStatus, unresponded, messages}]`                       |
| `hostfully/send-message`      | `--lead-id`, `--message`                    | `{sent, messageId, timestamp}`                                                                                                        |
| `hostfully/get-property`      | `--property-id`                             | `{uid, name, address, amenities, houseRules, ...}`                                                                                    |
| `hostfully/get-checkouts`     | `--date`                                    | `[{propertyUid, listingName, normalizedAddress, roomId, zipCode, city, checkIn, checkOut, checkOutTime, guestName, status, channel}]` |
| `hostfully/get-reservations`  | `--property-id`                             | `[{uid, guestName, checkIn, checkOut, channel, numberOfGuests, status}]`                                                              |
| `sifely/list-locks`           | (none required)                             | array of `{lockId, lockName, lockAlias, lockMac, electricQuantity, hasGateway}`                                                       |
| `sifely/list-passcodes`       | `--lock-id`                                 | array of `{keyboardPwdId, lockId, keyboardPwd, keyboardPwdName, keyboardPwdType, ...}`                                                |
| `sifely/create-passcode`      | `--lock-id`, `--name`, `--code`             | `{keyboardPwdId}` (or `{keyboardPwdId, existed:true}`)                                                                                |
| `sifely/update-passcode`      | `--lock-id`, `--passcode-id`                | `{ok:true}`                                                                                                                           |
| `sifely/delete-passcode`      | `--lock-id`, `--passcode-id`                | `{ok:true}`                                                                                                                           |
| `sifely/generate-code`        | (none required)                             | `{code, pattern, length, description}`                                                                                                |
| `sifely/rotate-property-code` | `--property-id`                             | `{success, newCode, expectedPasscodeName, hostfullyUpdated, hostfullyError, locks}`                                                   |
| `knowledge_base/search`       | `--entity-type`, `--entity-id`              | `{content, entityFound, commonFound, entityType, entityId}`                                                                           |
| `platform/report-issue`       | `--task-id`, `--tool-name`, `--description` | `{ok, event_id}`                                                                                                                      |
| `platform/submit-output`      | `--summary`, `--classification`             | `{summary, classification, draft?, confidence?, reasoning?, urgency?, metadata?}` + writes `/tmp/summary.txt`                         |
