# HF-03 Learnings

## 2026-04-22 Init: API Research (confirmed via live probes)

### Hostfully Leads API (reservations = leads)

- Endpoint: `GET /api/v3.2/leads?propertyUid={uid}`
- Hostfully calls reservations "leads" — there is NO `/reservations` endpoint
- One of `propertyUid`, `agencyUid`, or `leadUids` is required
- Query params: `propertyUid`, `agencyUid`, `checkInFrom`, `checkInTo`, `checkOutFrom`, `checkOutTo`, `_limit`, `_cursor`
- **No server-side status or type filter** — must filter client-side
- Auth: `X-HOSTFULLY-APIKEY: <key>` header (same as all other endpoints)

### Response shape (confirmed live)

```json
{
  "leads": [
    {
      "uid": "string",
      "propertyUid": "string",
      "agencyUid": "string",
      "checkInZonedDateTime": "2026-04-22T16:00:00-05:00",
      "checkOutZonedDateTime": "2026-04-25T11:00:00-05:00",
      "checkInLocalDateTime": "2026-04-22T16:00:00",
      "checkOutLocalDateTime": "2026-04-25T11:00:00",
      "status": "BOOKED",
      "type": "BOOKING",
      "source": "DIRECT_AIRBNB",
      "channel": "AIRBNB",
      "bookedUtcDateTime": "2026-04-01T10:00:00",
      "externalBookingId": null,
      "notes": "",
      "extraNotes": null,
      "assignee": { "uid": null, "type": "EMPLOYEE" },
      "metadata": { "createdUtcDateTime": "...", "updatedUtcDateTime": "..." },
      "guestInformation": {
        "firstName": "John",
        "lastName": "Doe",
        "adultCount": 2,
        "childrenCount": 0,
        "petCount": 0,
        "infantCount": 0,
        "email": "john@example.com",
        "phoneNumber": "+1234567890"
      },
      "referrer": null,
      "unitUid": null
    }
  ],
  "_metadata": { "count": 2, "totalCount": null },
  "_paging": { "_limit": 2, "_nextCursor": "eyJvZmZzZXQiOjJ9" }
}
```

### Lead types and statuses

- `type`: BLOCK, INQUIRY, BOOKING_REQUEST, BOOKING
- BOOKING statuses: BOOKED_BY_AGENT, BOOKED_BY_CUSTOMER, BOOKED_EXTERNALLY, BOOKED, CANCELLED, CANCELLED_BY_TRAVELER, CANCELLED_BY_OWNER, STAY (ongoing), ARCHIVED (past)
- INQUIRY statuses: NEW, ON_HOLD, QUOTE_SENT, HOLD_EXPIRED, CLOSED_QUOTE, CLOSED_HOLD, CLOSED
- BLOCK statuses: BLOCKED

### Channel/source values (confirmed live)

- channel: AIRBNB, VRBO, HOSTFULLY, BOOKINGDOTCOM, etc.
- source: DIRECT_AIRBNB, DIRECT_VRBO, HOSTFULLY_UI, HOSTFULLY_API, etc.

### Guest count

- `guestInformation.adultCount` + `guestInformation.childrenCount` = total guests
- Also: `infantCount`, `petCount`

### Pagination

- Same cursor-dedup pattern as properties: `_paging._nextCursor`
- `_nextCursor` always returned even when no more data (API quirk) — use dedup guard

### VLRE test data (property dac5a0e0-3984-4f72-b622-de45a9dd758f)

- 5 leads total: 3 BOOKING (BOOKED), 1 BLOCK (BLOCKED), 1 INQUIRY (CLOSED)
- Channels: AIRBNB (3), VRBO (1), HOSTFULLY (1)
- Date filter works: `checkInFrom=2026-04-20` returns 2 leads (1 BOOKING + 1 BLOCK)

### "Sensible default" for no filters

- Filter to `type === 'BOOKING'` only (exclude BLOCKs and INQUIRYs)
- Use `checkInFrom=today` to get current + upcoming reservations
- This matches the acceptance criteria: "Without filters, returns current + upcoming reservations"

### Key constraints (same as all shell tools)

- NO npm imports — only Node built-ins + native `fetch`
- NO `export` statements
- NO retry logic, NO caching
- NO `console.log` — use `process.stdout.write` / `process.stderr.write`
- `HOSTFULLY_API_URL` env var override is the test seam for mocking
- `HOSTFULLY_API_KEY` required, `HOSTFULLY_AGENCY_UID` NOT required (propertyUid filter)

## 2026-04-22 Implementation Complete

### Files created
- `src/worker-tools/hostfully/get-reservations.ts` — 172 lines
- `tests/worker-tools/hostfully/get-reservations.test.ts` — 248 lines

### Key decisions
- `_cursor` (not `cursor`) for leads API pagination param
- Default behavior: filter to `type === 'BOOKING'` (exclude BLOCK and INQUIRY)
- `--from`/`--to` absent → auto-append `checkInFrom=today` via `new Date().toISOString().slice(0, 10)`
- `Set<string>` dedup guard prevents infinite cursor loops (same pattern as get-properties)
- `formatGuestName`: uses `(p): p is string => typeof p === 'string' && p !== ''` type predicate for clean join
- CANCELLED_STATUSES filter applies to any lead type (not just BOOKING) — matches spec

### Test patterns
- Mock server parses `new URL(req.url, 'http://localhost')` to extract `propertyUid` and `_cursor` from query params
- URL matching via `rawUrl.startsWith('/leads?')` then param extraction — handles any extra query params (e.g. `checkInFrom=today`)
- 11 tests total: default/confirmed/cancelled/inquiry filters, empty, missing-arg errors, API 500, --help, pagination, computed fields

## 2026-04-22 QA Results (F3 — Manual QA)

### Verdict: APPROVE — All 12/12 Scenarios PASS

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Default filter (current + upcoming) | ✅ PASS | 1 BOOKING returned; checkIn=today; 8 fields exact |
| 2 | Date range filter (Apr 1–Jun 1 2026) | ✅ PASS | 4 BOOKINGs returned (more than S1) |
| 3 | Status=confirmed full year | ✅ PASS | 9 BOOKEDs; all BOOKED status (confirmed statuses) |
| 4 | Status=inquiry full year | ✅ PASS | 2 entries; status CLOSED (INQUIRY statuses) |
| 5 | Missing --property-id | ✅ PASS | EXIT:1; "Error: --property-id argument is required" |
| 6 | Missing HOSTFULLY_API_KEY | ✅ PASS | EXIT:1; "Error: HOSTFULLY_API_KEY environment variable is required" |
| 7 | --help | ✅ PASS | EXIT:0; all 4 options (--property-id, --status, --from, --to) shown |
| 8 | Invalid property ID | ✅ PASS | EXIT:1; "Error: Failed to fetch reservations: 403" |
| 9 | Docker integration - default filter | ✅ PASS | Identical output to Scenario 1 |
| 10 | Docker - missing --property-id | ✅ PASS | EXIT:1; correct error message |
| 11 | Unit tests (11) | ✅ PASS | 11/11 tests pass in 2.15s |
| 12 | All hostfully tests (31) | ✅ PASS | 31/31 (11 new + 20 existing) — no regressions |

### Live API observations
- Property has MORE data than learnings snapshot: 9 confirmed BOOKINGs for 2026 full year
- Default filter (checkInFrom=today) correctly narrows to 1 ongoing booking
- Date range Apr 1–Jun 1 returns 4 (the 4 that have checkIn in that window)
- Inquiry filter returns 2 CLOSED-status INQUIRYs — correct type mapping
- Invalid UUID (all zeros) → 403 from API → EXIT:1 with error in stderr ✓
- Docker: `/tools/hostfully/get-reservations.js` exists in image; `--entrypoint node` works correctly

## 2026-04-22 HF-04 Messages API (confirmed via live API)

### Messages endpoint (confirmed live 2026-04-22)
- URL: GET /api/v3.2/messages?leadUid={uid}&_limit={n}
- Auth: same X-HOSTFULLY-APIKEY header
- Response envelope: `{ messages: [...], _metadata: { count: N, totalCount: null }, _paging: { _limit: N, _nextCursor: "..." } }`
- Message fields (actual): uid, createdUtcDateTime, status, type (booking channel), senderType, content: { subject, text }, threadUid, attachments
- senderType values: "GUEST" or "AGENCY" (NOT "HOST" — agency = host/property manager side)
- content is a nested OBJECT `{ subject: string|null, text: string }` — NOT a flat string field
- Timestamp field: `createdUtcDateTime` (ISO 8601 UTC with Z suffix)
- Sort order from API: newest-first (descending). Client sorts to oldest-first.
- Invalid leadUid: returns `{ apiErrorMessage: "Lead not found: ...", uid: "..." }` (not 404 status code — untested at HTTP level)
- Zero messages (valid lead with no conversations): returns `{ messages: [], _metadata: { count: 0 }, _paging: {} }`

### Two-step implementation
- Step 1: GET /leads?propertyUid=...&checkInFrom=<30-days-ago> (cursor-dedup pagination, BOOKING type only)
- Step 2: GET /messages?leadUid=... per BOOKING lead (single page, _limit caps it)

### Key gotchas
- `senderType: "AGENCY"` maps to 'host' in output (not "HOST")
- `content.text` (nested) not `content` (flat string) as many docs suggest
- API returns newest-first; MUST sort client-side for chronological order
- Last message in chronological sort determines unresponded state
- Leads with 0 messages are EXCLUDED from output (not included with empty messages array)

### Test seam
- Same as get-reservations: `HOSTFULLY_API_URL` env override
- Mock server handles two URL patterns: `/leads?` and `/messages?`
- Messages mock routes by `leadUid` query param

### Files created
- `src/worker-tools/hostfully/get-messages.ts` — 255 lines
- `tests/worker-tools/hostfully/get-messages.test.ts` — 310 lines (13 tests, all passing)

## 2026-04-22 T2: Dockerfile fix
- Added get-reservations.js and get-messages.js COPY lines after get-properties.js (line 66)
- Docker build: exit 0
- All 5 hostfully tools confirmed in /tools/hostfully/

## 2026-04-22 T3: Live API smoke tests

### Sort order
- API returns messages newest-first (descending by createdUtcDateTime) — CONFIRMED via raw API probe
- Tool sorts client-side to oldest-first (ascending) — CORRECT
- All 4 threads in default output: messages in ascending chronological order ✅

### Scenario results (all PASS)
| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Default fetch (no filters) | ✅ PASS | 4 threads; all 5 fields present; all messages sorted asc |
| 2 | --unresponded-only | ✅ PASS | Returns `[]` — all threads currently responded |
| 3 | --limit 2 | ✅ PASS | 4 threads each with exactly 2 messages; limit respected |
| 4 | Invalid property ID (all zeros) | ✅ PASS | EXIT:1; "Error: Failed to fetch leads: 403" |
| 5 | --help | ✅ PASS | EXIT:0; shows --property-id, --unresponded-only, --limit |

### Live data observations
- Property dac5a0e0 has 4 threads with active messages (all unresponded=false today)
- Thread message counts: 6, 21, 17, 13 (default fetch, last 30 days window)
- With --limit 2: all 4 threads return exactly 2 messages (the 2 most recent, then sorted oldest-first in output)
- Message fields in output: `text`, `sender` ("guest"/"host"), `timestamp`
- Thread fields in output: `reservationId`, `guestName`, `channel`, `unresponded`, `messages[]`
- Invalid all-zeros UUID → 403 from Hostfully API → clean EXIT:1 with error on stderr

### Evidence files
- `.sisyphus/evidence/task-3-live-default.json` — Scenario 1 full output (4 threads)
- `.sisyphus/evidence/task-3-live-unresponded.json` — Scenario 2 output (`[]`)
- `.sisyphus/evidence/task-3-live-limit.json` — Scenario 3 output (limit=2)
- `.sisyphus/evidence/task-3-live-invalid.txt` — Scenario 4 error output
- `.sisyphus/evidence/task-3-help.txt` — Scenario 5 help text
- `.sisyphus/evidence/task-3-sort-order.txt` — Sort order detailed findings
