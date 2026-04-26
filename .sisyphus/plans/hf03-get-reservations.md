# HF-03: Get Reservations Shell Tool

## TL;DR

> **Quick Summary**: Create a shell tool at `src/worker-tools/hostfully/get-reservations.ts` that fetches reservations (leads) from the Hostfully API with optional date and status filters, returning a curated JSON array to stdout. Hostfully calls reservations "leads" — the tool maps to the leads API internally but uses "reservations" in its interface.
>
> **Deliverables**:
>
> - `src/worker-tools/hostfully/get-reservations.ts` — CLI script with `--property-id`, `--status`, `--from`, `--to` flags
> - `tests/worker-tools/hostfully/get-reservations.test.ts` — mock unit tests with local HTTP server
> - Dockerfile updated with 1 COPY line
> - Live API smoke test against real VLRE property

## API Research (confirmed via live calls 2026-04-22)

- Endpoint: `GET /api/v3.2/leads?propertyUid={uid}` — Hostfully calls reservations "leads"
- Query params: `propertyUid` (required), `checkInFrom`, `checkInTo`, `checkOutFrom`, `checkOutTo`, `_limit`, `_cursor`
- **No server-side status or type filter** — must filter client-side
- Response: `{ leads: [...], _metadata: { count, totalCount: null }, _paging: { _limit, _nextCursor } }`
- Lead types: BLOCK, INQUIRY, BOOKING_REQUEST, BOOKING — only BOOKING type = confirmed reservation
- Pagination: cursor-based with dedup guard (same pattern as get-properties.ts)
- Guest info nested: `guestInformation.firstName`, `guestInformation.lastName`, `guestInformation.adultCount`, `guestInformation.childrenCount`
- Channel field: `channel` (AIRBNB, VRBO, HOSTFULLY, BOOKINGDOTCOM, etc.)
- Status field: `status` (BOOKED, CANCELLED, STAY, ARCHIVED, etc.)
- Date fields: `checkInLocalDateTime`, `checkOutLocalDateTime` (ISO 8601 local datetime strings)
- VLRE test property `dac5a0e0-3984-4f72-b622-de45a9dd758f` has 5 leads (3 BOOKING, 1 BLOCK, 1 INQUIRY)
- `HOSTFULLY_AGENCY_UID` is NOT required — `propertyUid` filter is sufficient

## TODOs

- [x] 1. Create get-reservations.ts shell tool + mock unit tests

  **What to do**:

  **Shell Tool** (`src/worker-tools/hostfully/get-reservations.ts`):
  - Follow `get-properties.ts` pattern: `parseArgs()` + `main()` + `main().catch()` with cursor-dedup pagination
  - `parseArgs(argv)` parses:
    - `--property-id <uid>` (REQUIRED)
    - `--status <status>` (optional — client-side filter on lead status, e.g. `confirmed`, `cancelled`)
    - `--from <date>` (optional — maps to `checkInFrom` query param, format `YYYY-MM-DD`)
    - `--to <date>` (optional — maps to `checkInTo` query param, format `YYYY-MM-DD`)
    - `--help` (print usage and exit 0)
  - Status mapping (user-friendly → API values):
    - `confirmed` → include leads where `type === 'BOOKING'` AND status is one of: `BOOKED`, `BOOKED_BY_AGENT`, `BOOKED_BY_CUSTOMER`, `BOOKED_EXTERNALLY`, `STAY`
    - `cancelled` → include leads where status is one of: `CANCELLED`, `CANCELLED_BY_TRAVELER`, `CANCELLED_BY_OWNER`
    - `inquiry` → include leads where `type === 'INQUIRY'`
    - If `--status` not provided: default to showing only `type === 'BOOKING'` leads (exclude BLOCKs and INQUIRYs)
  - `main()` flow:
    1. Parse args → if `--help`, print usage and exit 0
    2. If `--property-id` missing, exit 1 with stderr `"Error: --property-id argument is required\n"`
    3. Read `HOSTFULLY_API_KEY` from env → if missing, exit 1 with stderr `"Error: HOSTFULLY_API_KEY environment variable is required\n"`
    4. Read `HOSTFULLY_API_URL` from env → default to `"https://api.hostfully.com/api/v3.2"`
    5. Build base URL: `${baseUrl}/leads?propertyUid=${encodeURIComponent(propertyId)}`
    6. If `--from` provided, append `&checkInFrom=${from}`
    7. If `--to` provided, append `&checkInTo=${to}`
    8. If neither `--from` nor `--to` provided (sensible default): append `&checkInFrom=${todayISO}` where `todayISO` is `new Date().toISOString().slice(0, 10)` — this returns current + upcoming reservations
    9. Cursor-dedup pagination loop (copy from `get-properties.ts`):
       - `Set<string>` for seen UIDs
       - Append `&_cursor=${encodeURIComponent(cursor)}` on subsequent pages
       - Break when `!hasNew || !cursor`
    10. Client-side filtering:
        - If `--status` provided: filter by the mapped status values
        - If `--status` NOT provided: filter to `type === 'BOOKING'` only (exclude BLOCKs, INQUIRYs)
    11. Map each lead to curated `ReservationSummary`:
        ```
        {
          uid: lead.uid,
          propertyUid: lead.propertyUid,
          guestName: formatGuestName(lead.guestInformation),  // "John Doe" or null
          checkIn: lead.checkInLocalDateTime ?? null,
          checkOut: lead.checkOutLocalDateTime ?? null,
          channel: lead.channel ?? null,                       // "AIRBNB", "VRBO", etc.
          numberOfGuests: (gi.adultCount ?? 0) + (gi.childrenCount ?? 0),
          status: lead.status ?? null
        }
        ```
    12. Write `JSON.stringify(results) + '\n'` to stdout and exit 0
  - `formatGuestName(gi)`: if `gi?.firstName` or `gi?.lastName`, join non-null parts with space. If both null, return null.
  - Types (internal, not exported):
    - `RawLead` — raw API response shape with all fields used
    - `ReservationSummary` — curated output shape (8 fields: uid, propertyUid, guestName, checkIn, checkOut, channel, numberOfGuests, status)

  **Unit Tests** (`tests/worker-tools/hostfully/get-reservations.test.ts`):
  - Use `http.createServer` to create a mock Hostfully API server in `beforeAll`
  - Mock server serves responses for these paths:
    - `GET /leads?propertyUid=VALID_PROPERTY` → `{ leads: [booking1, booking2, block1, inquiry1], _metadata: {...}, _paging: {...} }`
      - booking1: type=BOOKING, status=BOOKED, channel=AIRBNB, guest=John Doe, adults=2, children=1
      - booking2: type=BOOKING, status=CANCELLED, channel=VRBO, guest=Jane Smith, adults=1, children=0
      - block1: type=BLOCK, status=BLOCKED, channel=HOSTFULLY, guest=null
      - inquiry1: type=INQUIRY, status=CLOSED, channel=AIRBNB, guest=Bob Wilson, adults=3, children=0
    - `GET /leads?propertyUid=EMPTY_PROPERTY` → `{ leads: [], _metadata: { count: 0 }, _paging: {} }`
    - `GET /leads?propertyUid=PAGINATED_PROPERTY` → page 1 with cursor, page 2 without (test pagination)
    - `GET /leads?propertyUid=ERROR_PROPERTY` → 500 error
  - Run the compiled JS via `execFile('node', [SCRIPT_PATH, ...args], { env: { HOSTFULLY_API_KEY: 'test', HOSTFULLY_API_URL: 'http://localhost:PORT' } })`
  - Test cases (minimum 8):
    1. Happy path: `--property-id VALID_PROPERTY` → exit 0, JSON array, only BOOKING type leads (block and inquiry filtered out), has guestName/checkIn/checkOut/channel/numberOfGuests/status
    2. Status filter `--status confirmed`: only BOOKED booking (not CANCELLED)
    3. Status filter `--status cancelled`: only CANCELLED booking
    4. Empty property: `--property-id EMPTY_PROPERTY` → exit 0, empty JSON array `[]`
    5. Missing `--property-id` → exit 1, stderr contains `--property-id`
    6. Missing `HOSTFULLY_API_KEY` → exit 1, stderr contains `HOSTFULLY_API_KEY`
    7. API error (500) → exit 1, stderr contains error
    8. `--help` → exit 0, stdout contains usage text with all flags
    9. Pagination: `--property-id PAGINATED_PROPERTY` → exit 0, results from both pages combined
    10. Guest name formatting: null firstName + null lastName → guestName is null
  - `afterAll`: close mock server

  **Must NOT do**:
  - Add any npm dependencies
  - Add retry logic, caching
  - Export any TypeScript types or create barrel files
  - Validate `HOSTFULLY_AGENCY_UID` — not needed for propertyUid-based queries
  - Modify any existing files (except Dockerfile in Task 2)
  - Add `console.log` — use `process.stdout.write` / `process.stderr.write` only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: ~120+ lines of TypeScript with pagination, client-side filtering, status mapping + ~250 lines of tests with mock HTTP server. More complex than `quick`.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 2 depends on this)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/worker-tools/hostfully/get-properties.ts` — Cursor-dedup pagination loop, env var validation, JSON array output. Copy this structure exactly.
  - `src/worker-tools/hostfully/get-property.ts` — `parseArgs()` pattern with `--property-id`, env validation, API call pattern with headers.
  - `src/worker-tools/hostfully/validate-env.ts` — Script structure: `parseArgs()` + `main()` + `main().catch()`.
  - `tests/worker-tools/hostfully/get-property.test.ts` — Test pattern: `execFile` against compiled JS in `dist/`, mock HTTP server, env injection.
  - `tests/worker-tools/hostfully/get-properties.test.ts` — Pagination test pattern: multi-page mock responses, dedup verification.

  **API References** (verified against real Hostfully API):
  - `GET /api/v3.2/leads?propertyUid={uid}` → `{ leads: [...], _metadata: { count, totalCount: null }, _paging: { _limit, _nextCursor } }`
  - Each lead: `{ uid, propertyUid, agencyUid, checkInLocalDateTime, checkOutLocalDateTime, checkInZonedDateTime, checkOutZonedDateTime, status, type, source, channel, bookedUtcDateTime, externalBookingId, notes, extraNotes, assignee, metadata, guestInformation, referrer, unitUid }`
  - `guestInformation`: `{ firstName, lastName, adultCount, childrenCount, petCount, infantCount, email, phoneNumber, ... }`
  - Query params: `propertyUid` (required), `checkInFrom` (date), `checkInTo` (date), `checkOutFrom` (date), `checkOutTo` (date), `_limit` (int), `_cursor` (string)
  - Auth: `X-HOSTFULLY-APIKEY: <key>` header
  - Test property UID: `dac5a0e0-3984-4f72-b622-de45a9dd758f` (5 leads: 3 BOOKING, 1 BLOCK, 1 INQUIRY)

  **Acceptance Criteria**:
  - [ ] File exists: `src/worker-tools/hostfully/get-reservations.ts`
  - [ ] File exists: `tests/worker-tools/hostfully/get-reservations.test.ts`
  - [ ] `pnpm build` succeeds (new TS file compiles)
  - [ ] `pnpm test -- --run tests/worker-tools/hostfully/get-reservations.test.ts` → PASS (all 8+ tests)
  - [ ] Default output (no --status) contains only BOOKING type leads
  - [ ] Output JSON array items have: uid, propertyUid, guestName, checkIn, checkOut, channel, numberOfGuests, status

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Shell tool outputs valid JSON for valid property
    Tool: Bash
    Steps:
      1. Run: HOSTFULLY_API_KEY=test HOSTFULLY_API_URL=http://localhost:PORT node dist/worker-tools/hostfully/get-reservations.js --property-id VALID_PROPERTY 2>/dev/null
      2. Parse stdout as JSON array
    Expected Result: Array of ReservationSummary objects, only BOOKING type
    Evidence: .sisyphus/evidence/task-1-mock-output.txt

  Scenario: Shell tool exits 1 when --property-id is missing
    Tool: Bash
    Steps:
      1. Run: HOSTFULLY_API_KEY=test node dist/worker-tools/hostfully/get-reservations.js 2>&1; echo "EXIT:$?"
    Expected Result: stderr contains "--property-id" and "EXIT:1"
    Evidence: .sisyphus/evidence/task-1-missing-arg.txt

  Scenario: Unit tests pass
    Tool: Bash
    Steps:
      1. Run: npx vitest run tests/worker-tools/hostfully/get-reservations.test.ts
    Expected Result: All tests pass (8+ tests, 0 failures)
    Evidence: .sisyphus/evidence/task-1-unit-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-unit-tests.txt

  **Commit**: YES
  - Message: `feat(hostfully): add get-reservations shell tool for fetching booking data`
  - Files: `src/worker-tools/hostfully/get-reservations.ts`, `tests/worker-tools/hostfully/get-reservations.test.ts`

- [x] 2. Update Dockerfile to copy get-reservations.js

  **What to do**:
  - Add 1 line to the `Dockerfile` AFTER the existing get-properties.js COPY (after line 66):
    ```dockerfile
    COPY --from=builder /build/dist/worker-tools/hostfully/get-reservations.js /tools/hostfully/get-reservations.js
    ```
  - No `mkdir` needed — already exists from HF-01 (line 63: `RUN mkdir -p /tools/hostfully`)
  - No `npm install` needed — get-reservations.ts has zero npm dependencies

  **Must NOT do**:
  - Modify any existing Dockerfile lines
  - Add `npm install --prefix /tools/hostfully`
  - Add another `mkdir` command

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `Dockerfile:63-66` — Existing hostfully block. Add new COPY after line 66.

  **Acceptance Criteria**:
  - [ ] `Dockerfile` contains `COPY --from=builder /build/dist/worker-tools/hostfully/get-reservations.js /tools/hostfully/get-reservations.js`
  - [ ] No existing Dockerfile lines are modified

  **Commit**: YES
  - Message: `build(docker): add get-reservations shell tool to worker image`
  - Files: `Dockerfile`

- [x] 3. Build verification + test suite + Docker image validation

  **What to do**:
  - Run `pnpm build` — verify new TypeScript compiles
  - Run `npx vitest run tests/worker-tools/hostfully/get-reservations.test.ts` — verify all mock tests pass
  - Run `npx vitest run tests/worker-tools/hostfully/` — verify no regression in existing HF tests
  - Build Docker image (tmux — long-running): `docker build -t ai-employee-worker:latest .`
  - Verify Docker image contents:
    - `docker run --rm ai-employee-worker:latest ls /tools/hostfully/` → lists all 4 tools
    - `docker run --rm ai-employee-worker:latest node /tools/hostfully/get-reservations.js 2>&1; echo "EXIT:$?"` → exit 1 (missing args)
    - `docker run --rm -e HOSTFULLY_API_KEY=test ai-employee-worker:latest node /tools/hostfully/get-reservations.js 2>&1; echo "EXIT:$?"` → exit 1 (missing --property-id)

  **Must NOT do**:
  - Modify any source files — this is verification only
  - Skip Docker image verification

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential gate)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **Acceptance Criteria**:
  - [ ] `pnpm build` → exit 0
  - [ ] All get-reservations tests pass
  - [ ] All existing hostfully tests still pass (no regression)
  - [ ] Docker image builds and contains get-reservations.js
  - [ ] Shell tool exits 1 without args or without --property-id

  **Commit**: NO (verification only)

- [x] 4. Live API smoke test against real VLRE property

  **What to do**:
  - Run the shell tool against the real Hostfully API:
    ```bash
    HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD \
    node dist/worker-tools/hostfully/get-reservations.js \
      --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f
    ```
  - Verify the output:
    - JSON array of reservation objects
    - Each item has: uid, propertyUid, guestName, checkIn, checkOut, channel, numberOfGuests, status
    - Only BOOKING type leads (no BLOCKs or INQUIRYs)
    - `channel` values are real (AIRBNB, VRBO, etc.)
    - `guestName` is formatted (e.g. "Christina Wilkinson")
    - `numberOfGuests` is a number > 0
  - Test with `--status cancelled`:
    ```bash
    HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD \
    node dist/worker-tools/hostfully/get-reservations.js \
      --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f --status cancelled
    ```
  - Test with date filter:
    ```bash
    HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD \
    node dist/worker-tools/hostfully/get-reservations.js \
      --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f --from "2026-04-01" --to "2026-05-01"
    ```
  - Test error case with invalid property ID:
    ```bash
    HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD \
    node dist/worker-tools/hostfully/get-reservations.js \
      --property-id 00000000-0000-0000-0000-000000000000 2>&1
    echo "EXIT:$?"
    ```
  - Also run inside Docker image:
    ```bash
    docker run --rm \
      -e HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD \
      ai-employee-worker:latest \
      node /tools/hostfully/get-reservations.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f
    ```

  **Must NOT do**:
  - Modify any source files
  - Store real API keys in any committed file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (after Task 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 3

  **References**:
  - Test property UID: `dac5a0e0-3984-4f72-b622-de45a9dd758f` (5 leads: 3 BOOKING, 1 BLOCK, 1 INQUIRY)
  - VLRE Hostfully API key: `Y6EQ7KgSwoOGCokD`

  **Acceptance Criteria**:
  - [ ] Live API returns valid JSON array with reservation data
  - [ ] Default output (no --status) contains only BOOKING type leads
  - [ ] Each item has guestName, checkIn, checkOut, channel, numberOfGuests, status
  - [ ] `--status cancelled` returns only cancelled bookings (or empty array)
  - [ ] Date filter `--from`/`--to` narrows results correctly
  - [ ] Invalid property ID returns exit 1 with descriptive error (or empty array — depends on API behavior)
  - [ ] Docker image run produces same valid output

  **Commit**: NO (operational verification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/hf03-get-reservations.md` end-to-end. For each "Must Have" in Task 1: verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check all acceptance criteria. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `npx vitest run tests/worker-tools/hostfully/`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY QA scenario from EVERY task. Test cross-task integration (tool runs in Docker image with real API). Test edge cases: invalid property ID, missing API key, empty results, status filters. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Commit Message                                                               | Files                                                                                                     |
| ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1          | `feat(hostfully): add get-reservations shell tool for fetching booking data` | `src/worker-tools/hostfully/get-reservations.ts`, `tests/worker-tools/hostfully/get-reservations.test.ts` |
| 2          | `build(docker): add get-reservations shell tool to worker image`             | `Dockerfile`                                                                                              |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exit 0, no errors
npx vitest run tests/worker-tools/hostfully/get-reservations.test.ts  # Expected: all tests pass
npx vitest run tests/worker-tools/hostfully/  # Expected: all hostfully tests pass (no regression)
docker build -t ai-employee-worker:latest .  # Expected: exit 0
docker run --rm ai-employee-worker:latest ls /tools/hostfully/  # Expected: get-reservations.js listed
HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD node dist/worker-tools/hostfully/get-reservations.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f  # Expected: JSON array of bookings
```

### Final Checklist

- [ ] All acceptance criteria from story map met
- [ ] `get-reservations.js` exists and compiles
- [ ] `--property-id`, `--status`, `--from`, `--to` flags all work
- [ ] Default output = current + upcoming BOOKING type leads only
- [ ] Output includes: guestName, checkIn, checkOut, channel, numberOfGuests, status
- [ ] Docker image builds and contains get-reservations.js
- [ ] Live API smoke test returns valid curated JSON
- [ ] All tests pass, no regressions
