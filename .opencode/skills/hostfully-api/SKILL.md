---
name: hostfully-api
description: Use when working with Hostfully API integration — message retrieval, sending, property/reservation lookups, webhook handling. Covers response envelope patterns, known API quirks, shell tool CLI syntax, and UUID disambiguation (lead_uid vs thread_uid vs property_uid).
---

# Hostfully API Integration

## Domain Model

Hostfully uses a two-layer messaging model:

```
Lead (reservation) ──1:1──▶ Thread ──1:N──▶ Messages
```

- **Lead** — a guest reservation or inquiry (Hostfully calls reservations "leads"). Has `uid`, `type`, `status`, `propertyUid`, `guestInformation`.
- **Thread** — the unified inbox thread for a lead (one per lead). Has its own `uid` separate from the lead.
- **Message** — individual message in a thread. Has `senderType`, `content.text`, `createdUtcDateTime`.

---

## UUID Disambiguation (CRITICAL — Never Confuse These)

| Name           | Field in webhook       | What it identifies           | Source                           |
| -------------- | ---------------------- | ---------------------------- | -------------------------------- |
| `lead_uid`     | `payload.lead_uid`     | The guest reservation/lead   | Hostfully `/leads` endpoint      |
| `thread_uid`   | `payload.thread_uid`   | The Hostfully message thread | Hostfully unified inbox          |
| `property_uid` | `payload.property_uid` | The property                 | Hostfully `/properties` endpoint |
| `message_uid`  | `payload.message_uid`  | A single message             | Dedup key for webhook            |

**`lead_uid` and `thread_uid` are NEVER the same value.** They are different UUIDs from different data models. `post-guest-approval.ts` emits a stderr warning if both flags receive identical values — treat that as a model error.

When calling `get-messages.ts`, use `--lead-id` (takes `lead_uid`, NOT `thread_uid`).
When calling `send-message.ts`, use `--lead-id` (takes `lead_uid`).
When calling `post-guest-approval.ts`, pass BOTH `--lead-uid` AND `--thread-uid` separately.

---

## Response Envelope Patterns

Hostfully wraps single-resource and list responses differently:

| Endpoint type   | Shape                                                         | Example                                                   |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| Single resource | `{ "resource_name": {...} }`                                  | `{ "lead": {...} }`, `{ "property": {...} }`              |
| Collection      | `{ "resource_names": [...], "_paging": {...} }`               | `{ "leads": [...], "_paging": { "_nextCursor": "..." } }` |
| Messages list   | `{ "messages": [...], "_metadata": {...}, "_paging": {...} }` | messages newest-first; tool sorts to chronological        |

**Safe parsing pattern** — never use bare `as T` on API JSON:

```typescript
// Single resource (lead)
const json = (await res.json()) as { lead?: RawLead };
const lead = json.lead ?? (json as unknown as RawLead);

// Collection (leads list)
const json = (await res.json()) as { leads?: RawLead[]; _paging?: { _nextCursor?: string } };
const page = json.leads ?? [];

// Messages list
const json = (await res.json()) as { messages?: RawMessage[] };
const rawMessages = json.messages ?? [];
```

**If critical fields come back `undefined`**, log a warning with `Object.keys(json)` — silent null propagation is the root of hard-to-trace bugs.

---

## senderType Values

| Value    | Meaning                          | Action needed   |
| -------- | -------------------------------- | --------------- |
| `AGENCY` | Message sent by host/agency side | No reply needed |
| `GUEST`  | Message sent by guest            | Reply needed    |

**Unresponded detection** — there is no server-side filter. Check client-side: the thread is unresponded if the chronologically last message has `senderType !== 'AGENCY'`. This is how `get-messages.ts` computes the `unresponded` field.

---

## Lead Types

| Type              | Description                                              | Included by default                            |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `BOOKING`         | Confirmed guest reservation                              | Yes                                            |
| `INQUIRY`         | Guest question or availability check; no booking yet     | Yes (Airbnb often uses INQUIRY for real stays) |
| `BOOKING_REQUEST` | Pending reservation awaiting host approval               | Yes                                            |
| `BLOCK`           | Owner/manager calendar block (maintenance, personal use) | **No — always excluded**                       |

Always exclude `BLOCK` type. Never filter by `type === 'BOOKING'` alone — OTAs like Airbnb sometimes surface real stays as `INQUIRY`.

---

## Lead Statuses

| Status                                                         | Meaning                                      |
| -------------------------------------------------------------- | -------------------------------------------- |
| `NEW`                                                          | Newly created lead, not yet processed        |
| `BOOKED`                                                       | Reservation confirmed                        |
| `BOOKED_BY_AGENT` / `BOOKED_BY_CUSTOMER` / `BOOKED_EXTERNALLY` | Confirmed variants                           |
| `STAY`                                                         | Guest currently checked in                   |
| `CLOSED`                                                       | Lead closed (checkout past, cancelled, etc.) |
| `CANCELLED` / `CANCELLED_BY_TRAVELER` / `CANCELLED_BY_OWNER`   | Cancelled variants                           |

**CRITICAL**: `CLOSED` leads do **not** fire `NEW_INBOX_MESSAGE` webhooks. They are handled by the `trigger/guest-message-poll` cron (every 15 min), which polls all leads regardless of status.

---

## Shell Tool Reference

All tools run via `tsx` from `/tools/hostfully/` (or `/tools/slack/` for approval). Base URL defaults to `https://api.hostfully.com/api/v3.2`. Set `HOSTFULLY_MOCK=true` for local testing without real credentials.

### `get-messages.ts` — Fetch guest message threads

```bash
# By lead ID (single thread — most common; used by guest-messaging employee)
tsx /tools/hostfully/get-messages.ts --lead-id <lead_uid>

# By property ID (all threads for a property)
tsx /tools/hostfully/get-messages.ts --property-id <property_uid>

# Agency-wide scan (all properties; requires HOSTFULLY_AGENCY_UID env var)
tsx /tools/hostfully/get-messages.ts

# Optional flags
--unresponded-only           # Filter to threads where last message is from guest
                             # (ignored when --lead-id is set — returns full conversation)
--limit <n>                  # Max messages per thread (default: 30)
--fallback-property-uid <uid> # Use when Hostfully returns null propertyUid on lead
                             # (INQUIRY-type leads often have no propertyUid assigned yet)
                             # Use the webhook payload's property_uid as the fallback source
```

**Env var fallback**: If `--lead-id` is not provided but `LEAD_UID` env var is set (injected by the lifecycle from the webhook `raw_event`), it is used automatically. A stderr warning is emitted.

**Output** — JSON array of thread objects:

```json
[
  {
    "leadUid": "uuid", // the lead/reservation ID
    "threadUid": "uuid", // from THREAD_UID env var (injected by lifecycle)
    "propertyUid": "uuid", // the property UID (use with get-property.ts)
    "guestName": "John Doe", // from guestInformation (null if not set)
    "channel": "AIRBNB", // booking channel
    "checkIn": "2026-05-01T15:00:00",
    "checkOut": "2026-05-05T11:00:00",
    "leadStatus": "BOOKED",
    "unresponded": true,
    "messages": [
      {
        "text": "What time is check-in?",
        "sender": "guest", // "guest" or "host" (normalized from senderType)
        "timestamp": "2026-04-20T14:30:00Z"
      }
    ]
  }
]
```

**Pagination**: When fetching by property or agency, uses cursor-based pagination (`_paging._nextCursor`). Deduplicated by `uid` to prevent duplicates across pages.

**Mutually exclusive**: `--lead-id` and `--property-id` cannot both be set.

---

### `send-message.ts` — Send reply to guest

**IRREVERSIBLE** — messages deliver immediately to the guest through their booking channel (Airbnb, VRBO, etc.) and cannot be recalled.

```bash
tsx /tools/hostfully/send-message.ts \
  --lead-id <lead_uid> \
  --message "Your check-in time is 3pm." \
  [--thread-id <thread_uid>]   # optional; omit to let API create a new thread
```

All messages sent have `senderType: AGENCY` (host/agency side).

**Output**:

```json
{ "sent": true, "messageId": "uuid", "timestamp": "2026-04-22T..." }
```

A 204 response (empty body) from the API is also a valid success — the tool handles this.

---

### `get-property.ts` — Fetch property details

```bash
tsx /tools/hostfully/get-property.ts --property-id <property_uid>
```

Fetches property, amenities, and house rules in parallel (`Promise.allSettled`). Amenity/rules failures emit warnings but do not fail the tool.

**Output** (JSON object):

```json
{
  "uid": "uuid",
  "name": "Beachfront Villa",
  "propertyType": "HOUSE",
  "address": "123 Main St, Miami, FL 33101, US",
  "bedrooms": 3,
  "beds": 4,
  "bathrooms": 2,
  "maxGuests": 6,
  "checkInTime": 1500,
  "checkOutTime": 1100,
  "wifiNetwork": "GuestWifi",
  "wifiPassword": "password123",
  "bookingNotes": "...",
  "extraNotes": "...",
  "guideBookUrl": "https://...",
  "amenities": ["WiFi", "Pool", "Parking"],
  "houseRules": [{ "rule": "NO_SMOKING", "description": "No smoking indoors" }]
}
```

Response envelope: `{ "property": {...} }` — tool unwraps with `propertyJson.property ?? propertyJson`.

---

### `get-reservations.ts` — Fetch reservations for a property

```bash
tsx /tools/hostfully/get-reservations.ts \
  --property-id <property_uid> \
  [--status confirmed|cancelled|inquiry]  # default: all non-BLOCK
  [--from YYYY-MM-DD]                     # check-in from date
  [--to YYYY-MM-DD]                       # check-in to date
```

Without `--from`/`--to`, defaults to last 30 days + future (to include recently checked-out guests who may still message).

**Status filters**:

- `confirmed` — active bookings (`BOOKED`, `STAY`, `BOOKED_BY_*`)
- `cancelled` — any cancellation variant
- `inquiry` — INQUIRY-type leads only
- (omit) — all non-BLOCK leads

**Output** — JSON array:

```json
[
  {
    "uid": "uuid",
    "propertyUid": "uuid",
    "guestName": "Jane Smith",
    "checkIn": "2026-05-01T15:00:00",
    "checkOut": "2026-05-05T11:00:00",
    "channel": "VRBO",
    "numberOfGuests": 4,
    "status": "BOOKED"
  }
]
```

Uses cursor-based pagination; deduplicates by `uid`.

---

### `post-guest-approval.ts` — Post Slack approval card for PM review

Path in container: `/tools/slack/post-guest-approval.ts` (under `slack/`, not `hostfully/`).

```bash
tsx /tools/slack/post-guest-approval.ts \
  --channel <slack_channel_id> \
  --task-id <task_uuid> \
  --guest-name "Jane Smith" \
  --property-name "Beachfront Villa" \
  --check-in "2026-05-01" \
  --check-out "2026-05-05" \
  --booking-channel "AIRBNB" \
  --original-message "What time is check-in?" \
  --draft-response "Check-in is at 3pm..." \
  --confidence 0.92 \
  --category "check-in-inquiry" \
  --lead-uid <lead_uid> \
  --thread-uid <thread_uid> \
  --message-uid <message_uid> \
  [--urgency]                              # adds :warning: header
  [--conversation-summary "..."]
  [--diagnosis '{"hasMismatch":false,"diagnosisSummary":"..."}']  # lock diagnosis JSON
  [--lead-status BOOKED]                   # shows colored status icon in card
  [--dry-run]                              # returns blocks JSON without posting
  [--thread-ts <parent_ts>]               # post as thread reply
  [--reply-broadcast]                     # also show in channel
  [--conversation-ref <ref>]             # defaults to thread_uid if omitted
```

**CRITICAL**: `--lead-uid` and `--thread-uid` are DIFFERENT UUIDs. The tool emits a stderr warning if they are identical — this is a model error.

**Idempotency**: If `/tmp/approval-message.json` already exists with a real `ts`, the tool skips the Slack post and returns the existing result.

**Output** — JSON written to `/tmp/approval-message.json` AND stdout:

```json
{
  "ts": "1234567890.123456",
  "channel": "C0AMGJQN05S",
  "approval_message_ts": "1234567890.123456",
  "lead_uid": "uuid",
  "thread_uid": "uuid",
  ...
}
```

The approval card includes Approve & Send, Edit & Send, and Reject buttons.

---

## Webhook Payload (POST /webhooks/hostfully)

No HMAC verification — Zod schema validation only.

```json
{
  "agency_uid": "uuid", // tenant matching key
  "event_type": "NEW_INBOX_MESSAGE",
  "message_uid": "uuid", // dedup key (external_id: hostfully-msg-{message_uid})
  "thread_uid": "uuid", // message thread identifier
  "lead_uid": "uuid", // guest lead/reservation identifier
  "property_uid": "uuid" // property identifier (may be absent for some events)
}
```

Only `NEW_INBOX_MESSAGE` events create tasks; all others are ignored.

**Tenant matching**: `agency_uid` is matched against `tenant.config.guest_messaging.hostfully_agency_uid` in the DB. No matching tenant → 200 + `{ tenant_not_found: true }`.

**Dedup**: `external_id: hostfully-msg-{message_uid}` — Prisma unique constraint. Duplicate webhook → 200 + `{ duplicate: true }` (no new task).

**Thread-level supersede**: If an existing non-terminal task exists for the same `thread_uid`:

- If `Executing` or `Validating` → webhook is skipped (worker is actively running)
- Otherwise → old task is cancelled, new task is created (supersede pattern)

---

## Environment Variables

| Variable               | Required                | Description                                                                                              |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `HOSTFULLY_API_KEY`    | Yes                     | API key (header: `X-HOSTFULLY-APIKEY`)                                                                   |
| `HOSTFULLY_AGENCY_UID` | When no `--property-id` | Agency UID for listing all properties                                                                    |
| `HOSTFULLY_API_URL`    | No                      | Base URL (default: `https://api.hostfully.com/api/v3.2`)                                                 |
| `HOSTFULLY_MOCK`       | No                      | Set to `true` to return fixture data without real API calls                                              |
| `LEAD_UID`             | No                      | Injected by lifecycle from webhook `raw_event`; fallback for `get-messages.ts`                           |
| `THREAD_UID`           | No                      | Injected by lifecycle from webhook `raw_event`; used to populate `threadUid` in `get-messages.ts` output |

Credentials are stored as **tenant secrets** in the DB (`tenant_secrets` table), not in `.env`. The `tenant-env-loader.ts` auto-uppercases and injects all secrets into the worker machine env.

---

## Safe API Integration Rules

1. **Raw response first** — when data is wrong or missing, run a live `curl` or `node -e` call before reading code. `Object.keys(json)` reveals envelope mismatches immediately.

2. **Never bare `as T`** — `(await res.json()) as RawLead` silently accepts any shape. Use the wrapper-aware pattern: `const json = ... as { lead?: RawLead }; const lead = json.lead ?? (json as unknown as RawLead)`.

3. **Document envelope shape at parse site** — add a comment like `// Hostfully single-resource: { "lead": {...} }` the moment you discover it.

4. **Scan existing patterns before adding new API calls** — a `?? fallback` near an API call documents a known quirk. Ask "why does this exist?" before writing similar code.

5. **Log when critical fields are null** — `if (!lead.guestInformation) { logger.warn('...', { topLevelKeys: Object.keys(json) }); }`. Silent null propagation turns a one-line bug into a multi-session investigation.

---

## Common Gotchas

| Symptom                                                          | Cause                                                             | Fix                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `guestName` is null in approval card                             | `lead.guestInformation` came back `undefined` (envelope mismatch) | Log `Object.keys(json)` — likely need `json.lead ?? json` unwrap  |
| Worker calls `get-messages.ts` but finds no unresponded messages | Last message is from host (`AGENCY`) — pre-check logic            | Expected: lifecycle auto-completes the task as `Done`             |
| `thread_uid` in Hostfully URL is wrong                           | Model passed `lead_uid` where `thread_uid` was required           | Check `post-guest-approval.ts` stderr for the "identical" warning |
| CLOSED lead never triggers a task                                | Hostfully silently drops webhooks for CLOSED leads                | Handled by `trigger/guest-message-poll` cron (15 min)             |
| `propertyUid` is null on a lead                                  | INQUIRY-type leads often have no property assigned yet            | Use `--fallback-property-uid` with the webhook's `property_uid`   |
| Messages appear in wrong order                                   | API returns newest-first                                          | Tools sort chronologically (oldest-first) before output           |
| `--unresponded-only` does nothing                                | Flag is ignored when `--lead-id` is set                           | Full conversation is always returned for a specific lead          |

---

## Mock Fixtures (Local Testing)

Set `HOSTFULLY_MOCK=true` to use fixture files instead of calling the real API:

| Tool                        | Default fixture path                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `get-messages.ts`           | `src/worker-tools/hostfully/fixtures/get-messages/default.json`     |
| `get-messages.ts` (by lead) | `src/worker-tools/hostfully/fixtures/get-messages/{lead_uid}.json`  |
| `send-message.ts`           | `src/worker-tools/hostfully/fixtures/send-message/default.json`     |
| `get-property.ts`           | `src/worker-tools/hostfully/fixtures/get-property/default.json`     |
| `get-reservations.ts`       | `src/worker-tools/hostfully/fixtures/get-reservations/default.json` |
