# Learnings — hf-06-get-reviews

## [2026-04-23] Session Start

### Codebase Patterns (pre-verified)

- All hostfully tools: zero imports, manual argv parsing, `process.stdout.write(JSON.stringify(result) + '\n')`, `process.stderr.write` for errors, `main().catch()`
- Auth header: `X-HOSTFULLY-APIKEY` (not Bearer)
- Base URL env var: `HOSTFULLY_API_URL` (optional, each tool has its own default)
- get-reviews.ts MUST default to `https://api.hostfully.com/api/v3.3` (reviews are v3.3-only; all other tools default to v3.2)
- Cursor pagination: `do { } while (true)` with `seenUids` Set dedup, break on `!hasNew || !cursor`
- Test pattern: `execFile('npx', ['tsx', SCRIPT_PATH, ...args])` with in-process `http.createServer` on port 0

### API Facts (confirmed via librarian)

- Endpoint: `GET /api/v3.3/reviews?propertyUid={uid}`
- `updatedSince` = server-side filter by LAST UPDATE TIME, not review creation date
- `responseDateTimeUTC` being null/undefined = no host response posted
- Source enum (v3.3): BOOKING_DOT_COM, VRBO, FACEBOOK, TRIPADVISOR, REVYOOS, HOSTFULLY
- Cursor pagination via `_paging._nextCursor`
- Auth header: `X-HOSTFULLY-APIKEY`

### Key Decisions

- `--since` maps to `updatedSince` query param (server-side)
- `--unresponded-only` filters client-side: `responseDateTimeUTC === null || responseDateTimeUTC === undefined`
- Portfolio-wide (no `--property-id`): fetch properties first, loop per property, skip-and-continue on errors
- Dockerfile: add after `get-messages.ts` COPY line (was line 70); do NOT add send-message.ts
- Stale story map criterion (`/tools/hostfully/get-reviews.js`): mark `[x]` as-is, do not change text

## [2026-04-23] Implementation Complete

### get-reviews.ts — final structure

- File: `src/worker-tools/hostfully/get-reviews.ts` (283 lines, zero imports)
- Pattern: JSDoc header → RawReview type → ReviewSummary type → parseArgs() → main() → main().catch()
- Base URL default: `https://api.hostfully.com/api/v3.3` (v3.3-only, unlike all other tools which use v3.2)
- Reviews cursor param: `_cursor` (same as leads/reservations — NOT `cursor` like properties endpoint)
- Properties cursor param (portfolio fetch): `cursor` (no underscore — matching get-properties.ts:79)
- `hasResponse` computed as `r.responseDateTimeUTC != null` (intentional `!=` not `!==`, catches both null and undefined)
- `guestName` mapped from `r.author` field (not a nested object like guestInformation in leads)
- `--unresponded-only` filter: `r.responseDateTimeUTC == null` (catches both null and undefined)
- Portfolio error handling: `fetchError` flag, break loop, skip property, `process.stderr.write('Warning: ...')` and continue

### CLI verification

- `--help` → EXIT:0, documents all 4 flags + 3 env vars including updatedSince semantics
- `HOSTFULLY_API_KEY=` → EXIT:1, stderr: "Error: HOSTFULLY_API_KEY environment variable is required"
- `HOSTFULLY_API_KEY=x HOSTFULLY_AGENCY_UID=` → EXIT:1, stderr: "Error: HOSTFULLY_AGENCY_UID environment variable is required"
- `npx tsc --noEmit --strict` → EXIT:0 (no type errors)

### Evidence saved

- `.sisyphus/evidence/task-1-help.txt` — full --help output
- `.sisyphus/evidence/task-1-missing-key.txt` — missing API key error

## [2026-04-23] Live API Verification Complete (Task 5)

### API Key Retrieval

- VLRE `hostfully_api_key` is stored encrypted in `tenant_secrets` (AES-256-GCM)
- Decrypted using `ENCRYPTION_KEY` from `.env` via Node.js `crypto.createDecipheriv('aes-256-gcm', ...)`
- Fields: `ciphertext`, `iv`, `auth_tag` (all base64-encoded in DB)
- PostgREST endpoint: `http://localhost:54331/rest/v1/tenant_secrets` (ai-employee Kong on port 54331, NOT 54321)

### Live API Results

- Property UID: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` (VLRE test property)
- Result: `[]` (empty array) — property has 0 reviews in Hostfully
- Exit code: 0 — PASS
- JSON valid: confirmed via `JSON.parse()` → `records: 0`
- API URL used: `https://api.hostfully.com/api/v3.3` (default, v3.3-only endpoint)

### --help Verification

- Exit code: 0 — PASS
- All 4 flags documented: `--property-id`, `--since`, `--unresponded-only`, `--help`
- All 3 env vars documented: `HOSTFULLY_API_KEY`, `HOSTFULLY_AGENCY_UID`, `HOSTFULLY_API_URL`
- `updatedSince` semantics correctly noted in help text

### Evidence Files

- `.sisyphus/evidence/task-5-live-single.txt` — live API output (`[]`, EXIT:0)
- `.sisyphus/evidence/task-5-live-help.txt` — full --help output (EXIT:0)

## [2026-04-23] Test File Complete

### Test Results

- File: `tests/worker-tools/hostfully/get-reviews.test.ts` (261 lines)
- All 12 tests PASS (8.4s)
- Regression: all 67 Hostfully tests pass (7 files, 53s)

### Test File Patterns Used

- `runScript` helper: exact copy from `get-reservations.test.ts` (execFile + npx tsx)
- In-process `http.createServer` on port 0 (`server.listen(0, resolve)`)
- Dual-path routing: `rawUrl.startsWith('/reviews?')` vs `rawUrl.startsWith('/properties?')`
- `new URL(rawUrl, 'http://localhost')` for query param parsing
- `lastSeenUpdatedSince` module-level `let` mutated by server handler, reset + checked in test #3
- `beforeAll` / `afterAll` promise pattern matches reference exactly

### Mock Data

- `VALID_REVIEWS` (3): rev-1 has responseDateTimeUTC set (hasResponse=true), rev-2/rev-3 are null
- `PAGINATED_PAGE1` (2) + `PAGINATED_PAGE2` (1): cursor='page2' trigger
- `/properties?agencyUid=VALID_AGENCY` → [VALID_PROPERTY, EMPTY_PROPERTY]
- `/properties?agencyUid=MIXED_AGENCY` → [VALID_PROPERTY, ERROR_PROPERTY]
- ERROR_PROPERTY → HTTP 500 (single-property exits 1; portfolio logs Warning + continues)

### Key Gotchas

- Portfolio mode test: pass `HOSTFULLY_AGENCY_UID` as env key, NOT as arg — no `--property-id` arg
- `--unresponded-only` as arg (no value), not `--unresponded-only true`
- `HOSTFULLY_AGENCY_UID: ''` (empty string) overrides any real env var value, triggers exit 1
- `lastSeenUpdatedSince` reset inside the test (`lastSeenUpdatedSince = ''`) before running script
