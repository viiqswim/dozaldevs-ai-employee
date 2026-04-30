# Shell Tools — Verification Notepad

## Source Files Verified

- `src/worker-tools/slack/*.ts` — 4 Slack tools (all read directly)
- `src/worker-tools/hostfully/*.ts` — 7 Hostfully tools (all read directly)
- `src/worker-tools/knowledge_base/search.ts` — 1 KB tool (read directly)
- `src/worker-tools/platform/report-issue.ts` — 1 platform tool (read directly)
- `Dockerfile` lines 60–78 — per-file COPY entries verified

## Current State

### Summary

Total: **13 tools** across 4 directories. All TypeScript, executed via `tsx` inside Docker container. JSON to stdout, errors to stderr. Exit code 0 = success, 1 = failure. `--help` flag available on all tools.

**⚠️ Dockerfile gap**: `post-guest-approval.ts` and `post-no-action-notification.ts` exist in `src/worker-tools/slack/` but are NOT copied into the Docker image. Invocation via `tsx /tools/slack/post-guest-approval.ts` will fail with "file not found" until the Dockerfile is updated and the image rebuilt.

---

### `slack/` (4 tools in source; 2 deployed in Docker)

Env var required: `SLACK_BOT_TOKEN`

| Tool                                              | Usage                                                                                                                                                                                                                                                                                                                                                                                                                       | Output                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post-message.ts`                                 | `tsx /tools/slack/post-message.ts --channel "C123" --text "msg" [--blocks '[...]'] [--task-id "uuid"] [--conversation-ref "<string>"]`                                                                                                                                                                                                                                                                                      | `{"ts":"...","channel":"...","conversationRef?":"..."}`. When `--task-id` provided, auto-generates approval blocks (header + text + divider + context + Approve/Reject buttons). `--blocks` overrides auto-generation.                                                                              |
| `read-channels.ts`                                | `tsx /tools/slack/read-channels.ts --channels "C123,C456" [--lookback-hours 24]`                                                                                                                                                                                                                                                                                                                                            | `{"channels":[{"channelId":"...","messages":[...],"threadReplies":{}}]}`. Thread replies fetched for all threaded messages. Bot summary posts (block_id `papi-chulo-daily-summary`) filtered out. Messages truncated at 500 chars.                                                                  |
| `post-guest-approval.ts` ⚠️ NOT IN DOCKER         | `tsx /tools/slack/post-guest-approval.ts --channel "C123" --task-id "uuid" --guest-name "John" --property-name "Beachhouse" --check-in "2026-05-01" --check-out "2026-05-05" --booking-channel "AIRBNB" --original-message "..." --draft-response "..." --confidence 0.92 --category "check_in_question" --lead-uid "uuid" --thread-uid "uuid" --message-uid "uuid" [--urgency] [--conversation-summary "..."] [--dry-run]` | `{"ts":"...","channel":"..."}`. With `--dry-run`: `{"blocks":[...]}` (no Slack call). Posts rich Block Kit card with guest info, original message, draft response, confidence %, and Approve & Send / ✏️ Edit & Send / Reject buttons (`action_id`: `guest_approve`, `guest_edit`, `guest_reject`). |
| `post-no-action-notification.ts` ⚠️ NOT IN DOCKER | `tsx /tools/slack/post-no-action-notification.ts --channel "C123" --task-id "uuid" --guest-name "John" --property-name "Beachhouse" --check-in "2026-05-01" --check-out "2026-05-05" --booking-channel "AIRBNB" --original-message "..." --summary "..." --confidence 0.88 --category "no_action" --lead-uid "uuid" --thread-uid "uuid" --message-uid "uuid" [--conversation-summary "..."] [--dry-run]`                    | `{"ts":"...","channel":"..."}`. With `--dry-run`: `{"blocks":[...]}`. Posts informational card with "💬 Reply Anyway" button (`action_id`: `guest_reply_anyway`). Original message truncated at 300 chars in display.                                                                               |

**Required flags for `post-guest-approval.ts`** (14 required, 3 optional):
Required: `--channel`, `--task-id`, `--guest-name`, `--property-name`, `--check-in`, `--check-out`, `--booking-channel`, `--original-message`, `--draft-response`, `--confidence`, `--category`, `--lead-uid`, `--thread-uid`, `--message-uid`
Optional: `--urgency` (boolean flag, no value), `--conversation-summary`, `--dry-run` (boolean flag)

**Required flags for `post-no-action-notification.ts`** (13 required, 2 optional):
Required: `--channel`, `--task-id`, `--guest-name`, `--property-name`, `--check-in`, `--check-out`, `--booking-channel`, `--original-message`, `--summary`, `--confidence`, `--category`, `--lead-uid`, `--thread-uid`, `--message-uid`
Optional: `--conversation-summary`, `--dry-run` (boolean flag)

---

### `hostfully/` (7 tools)

All require `HOSTFULLY_API_KEY` env var (header: `X-HOSTFULLY-APIKEY`).  
Default API base: `https://api.hostfully.com/api/v3.2` (overridable via `HOSTFULLY_API_URL`).  
Exception: `get-reviews.ts` defaults to `https://api.hostfully.com/api/v3.3`.  
All support cursor-based pagination with dedup loop.

| Tool                  | Usage                                                                                                                                               | Output                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate-env.ts`     | `tsx /tools/hostfully/validate-env.ts`                                                                                                              | `{"ok":true,"apiKeySet":true,"agencyUidSet":true}`. Checks both `HOSTFULLY_API_KEY` and `HOSTFULLY_AGENCY_UID`.                                                                                                                                                                                                                                                                                                  |
| `get-properties.ts`   | `tsx /tools/hostfully/get-properties.ts`                                                                                                            | `[{"uid":"...","name":"...","propertyType":"...","city":"...","state":"...","bedrooms":N,"maxGuests":N,"isActive":true}]`. Requires `HOSTFULLY_AGENCY_UID`. Paginates all properties for the agency.                                                                                                                                                                                                             |
| `get-property.ts`     | `tsx /tools/hostfully/get-property.ts --property-id "<uid>"`                                                                                        | `{"uid":"...","name":"...","address":"...","bedrooms":N,"beds":N,"bathrooms":"...","maxGuests":N,"checkInTime":N,"checkOutTime":N,"wifiNetwork":"...","wifiPassword":"...","bookingNotes":"...","extraNotes":"...","guideBookUrl":"...","amenities":[...],"houseRules":[{"rule":"...","description":"..."}]}`. Fetches property + amenities + rules in parallel; amenity/rule failures are warnings (non-fatal). |
| `get-reservations.ts` | `tsx /tools/hostfully/get-reservations.ts --property-id "<uid>" [--status confirmed\|cancelled\|inquiry] [--from "YYYY-MM-DD"] [--to "YYYY-MM-DD"]` | `[{"uid":"...","propertyUid":"...","guestName":"...","checkIn":"...","checkOut":"...","channel":"AIRBNB","numberOfGuests":N,"status":"BOOKED"}]`. Default: BOOKING-type leads only, check-in from today forward. Status groups: `confirmed` (BOOKED/STAY variants), `cancelled`, `inquiry`.                                                                                                                      |
| `get-messages.ts`     | `tsx /tools/hostfully/get-messages.ts --property-id "<uid>" [--unresponded-only] [--limit 30]`                                                      | `[{"reservationId":"...","guestName":"...","channel":"AIRBNB","unresponded":true,"messages":[{"text":"...","sender":"guest"\|"host","timestamp":"ISO8601"}]}]`. Two-step: fetches BOOKING leads first, then `/messages?leadUid=` for each. Client-side unresponded filter (last message senderType === GUEST).                                                                                                   |
| `get-reviews.ts`      | `tsx /tools/hostfully/get-reviews.ts [--property-id "<uid>"] [--since "2026-01-01"] [--unresponded-only]`                                           | `[{"uid":"...","propertyUid":"...","guestName":"...","title":"...","content":"...","rating":N,"date":"...","source":"...","hasResponse":false,"responseDateTimeUTC":null}]`. Without `--property-id`, fetches all properties via `HOSTFULLY_AGENCY_UID` then reviews per property (per-property errors are warnings). `--since` maps to `updatedSince` (last-update time, not creation date). API v3.3.          |
| `send-message.ts`     | `tsx /tools/hostfully/send-message.ts --lead-id "<uid>" --message "<text>" [--thread-id "<uid>"]`                                                   | `{"sent":true,"messageId":"uuid\|null","timestamp":"ISO8601\|null"}`. **⚠️ IRREVERSIBLE** — delivered immediately to guest via booking channel (Airbnb, VRBO, etc.). senderType: AGENCY. 204 response (empty body) also treated as success.                                                                                                                                                                      |

---

### `knowledge_base/` (1 tool)

| Tool        | Usage                                                                                            | Output                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search.ts` | `tsx /tools/knowledge_base/search.ts --entity-type <type> --entity-id <id> [--tenant-id <uuid>]` | `{"content":"<entity>\n\n---\n\n# Common Policies\n\n<common>","entityFound":true,"commonFound":true,"entityType":"property","entityId":"<id>"}`. Content is entity-specific + common policies concatenated. Returns exit 0 even if no rows found (content = empty string). |

Env vars: `SUPABASE_URL` (required), `SUPABASE_SECRET_KEY` (required), `TENANT_ID` (required if `--tenant-id` not provided).  
Entity ID is normalized to lowercase before querying. Uses PostgREST `or` filter for single-round-trip combined fetch; falls back to two separate requests if combined fails.

---

### `platform/` (1 tool)

| Tool              | Usage                                                                                                                      | Output                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report-issue.ts` | `tsx /tools/platform/report-issue.ts --task-id "<id>" --tool-name "<name>" --description "<text>" [--patch-diff "<diff>"]` | `{"ok":true,"event_id":"<uuid>"}`. Writes to `system_events` table via PostgREST. Slack alert is non-fatal (warns to stderr if fails or `ISSUES_SLACK_CHANNEL` not set). DB write failure → exit 1. |

Env vars: `SUPABASE_URL` (required), `SUPABASE_SECRET_KEY` (required), `TENANT_ID` (required), `SLACK_BOT_TOKEN` (required), `ISSUES_SLACK_CHANNEL` (optional — skip Slack if absent), `SLACK_API_BASE_URL` (optional, default `https://slack.com/api`).

---

### Dockerfile Path Mapping

Tools are copied per-file (not a bulk COPY) from the builder stage:

```
/build/src/worker-tools/slack/read-channels.ts       → /tools/slack/read-channels.ts
/build/src/worker-tools/slack/post-message.ts        → /tools/slack/post-message.ts
/build/src/worker-tools/hostfully/validate-env.ts    → /tools/hostfully/validate-env.ts
/build/src/worker-tools/hostfully/get-property.ts    → /tools/hostfully/get-property.ts
/build/src/worker-tools/hostfully/get-properties.ts  → /tools/hostfully/get-properties.ts
/build/src/worker-tools/hostfully/get-reservations.ts→ /tools/hostfully/get-reservations.ts
/build/src/worker-tools/hostfully/get-messages.ts    → /tools/hostfully/get-messages.ts
/build/src/worker-tools/hostfully/get-reviews.ts     → /tools/hostfully/get-reviews.ts
/build/src/worker-tools/hostfully/send-message.ts    → /tools/hostfully/send-message.ts
/build/src/worker-tools/platform/report-issue.ts     → /tools/platform/report-issue.ts
/build/src/worker-tools/knowledge_base/search.ts     → /tools/knowledge_base/search.ts
```

`@slack/web-api@^7.15.1` installed at `/tools/slack/` via `npm install --prefix`.

**Missing from Dockerfile** (source exists, image deployment missing):

- `src/worker-tools/slack/post-guest-approval.ts`
- `src/worker-tools/slack/post-no-action-notification.ts`

---

## Changes from April 24 Doc

Old doc (April 24) documented 2 slack tools + 7 hostfully + 1 kb + 1 platform = **11 total**.

Current state: 4 slack + 7 hostfully + 1 kb + 1 platform = **13 total**.

**Added** (2 new source files):

- `slack/post-guest-approval.ts` — Rich Slack card for human-in-the-loop approval of AI-drafted guest responses. Includes guest info, original message, draft, confidence, and 3 action buttons (approve/edit/reject). Used by the guest message poller employee.
- `slack/post-no-action-notification.ts` — Informational Slack card when AI classifies a guest message as requiring no response. Includes "💬 Reply Anyway" override button. Mirrors `post-guest-approval.ts` structure but for the no-action path.

Both new tools support `--dry-run` (returns block JSON without posting) and `--conversation-summary` (optional context prepended to card).

**Unchanged**: All 11 tools from April 24 doc remain with same invocation syntax and output shape.

---

## New Content (not in old doc)

### `post-guest-approval.ts` — full flag reference

```bash
tsx /tools/slack/post-guest-approval.ts \
  --channel "C123" \
  --task-id "uuid" \
  --guest-name "John Smith" \
  --property-name "Beach House" \
  --check-in "2026-05-01" \
  --check-out "2026-05-05" \
  --booking-channel "AIRBNB" \
  --original-message "What time is check-in?" \
  --draft-response "Check-in is at 3pm." \
  --confidence 0.92 \
  --category "check_in_question" \
  --lead-uid "lead-uuid" \
  --thread-uid "thread-uuid" \
  --message-uid "message-uuid" \
  [--urgency] \
  [--conversation-summary "Guest has stayed 3 times before"] \
  [--dry-run]
```

Edit button value is JSON `{"taskId":"...","draftResponse":"..."}`, truncated to ≤1900 chars to stay under Slack's 2000-char button value limit.

### `post-no-action-notification.ts` — full flag reference

```bash
tsx /tools/slack/post-no-action-notification.ts \
  --channel "C123" \
  --task-id "uuid" \
  --guest-name "John Smith" \
  --property-name "Beach House" \
  --check-in "2026-05-01" \
  --check-out "2026-05-05" \
  --booking-channel "AIRBNB" \
  --original-message "Thanks!" \
  --summary "Guest expressing gratitude, no action needed" \
  --confidence 0.88 \
  --category "no_action_needed" \
  --lead-uid "lead-uuid" \
  --thread-uid "thread-uuid" \
  --message-uid "message-uuid" \
  [--conversation-summary "Short thread, one prior exchange"] \
  [--dry-run]
```

---

## Unresolved

- **[UNVERIFIED — ACTION REQUIRED]** `post-guest-approval.ts` and `post-no-action-notification.ts` are missing from Dockerfile lines 60–63. They cannot be invoked by workers until added. Needs: two `COPY` lines in Dockerfile `slack/` block + Docker image rebuild. This is a deployment gap, not a code bug.
