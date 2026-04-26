# HF-06: Get Reviews Shell Tool

## TL;DR

> **Quick Summary**: Create `src/worker-tools/hostfully/get-reviews.ts` — a shell tool that fetches guest reviews from the Hostfully v3.3 API, supports property-specific and portfolio-wide queries, and filters by date and response status.
>
> **Deliverables**:
>
> - `src/worker-tools/hostfully/get-reviews.ts` — the shell tool
> - `tests/worker-tools/hostfully/get-reviews.test.ts` — automated tests
> - Dockerfile update — one COPY line addition
> - Story map update — mark HF-06 acceptance criteria as complete
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (tool) → Task 2 (tests) → Task 3 (Dockerfile) → Task 4 (story map) → Task 5 (live API verification)

---

## Context

### Original Request

Implement HF-06 from the Phase 1 story map: a shell tool that fetches reviews from Hostfully's connected channels so the Review Response Writer employee can draft responses for every review across the portfolio.

### Interview Summary

**Key Discussions**:

- Docker image copies `.ts` files and runs via `tsx` (not compiled `.js`) — stale criterion in story map acknowledged
- Portfolio-wide reviews (no `--property-id`): confirmed strategy of fetching all properties first via properties endpoint, then looping to get reviews per property
- Test strategy: Vitest with mock HTTP server, matching `get-reservations.test.ts` pattern exactly

**Research Findings**:

- Hostfully reviews API: `GET /api/v3.3/reviews?propertyUid={uid}` with cursor-based pagination
- Auth: `X-HOSTFULLY-APIKEY` header (same as all existing tools)
- Response fields: uid, propertyUid, leadUid, author, title, content, rating, date, source, privateFeedback, responseDateTimeUTC, updatedUtcDateTime, reviewResponse, ratingCategories
- `updatedSince` query param available for server-side date filtering
- Source enum: BOOKING_DOT_COM, VRBO, FACEBOOK, TRIPADVISOR, REVYOOS, HOSTFULLY (AIRBNB removed in v3.3)
- `responseDateTimeUTC` being null/undefined indicates no response has been posted

### Metis Review

**Identified Gaps** (addressed):

- **API version**: `get-reviews.ts` must default to v3.3 (reviews endpoint is v3.3-only), while existing tools use v3.2. This is a per-file default, not a global change.
- **`--since` semantics**: Uses `updatedSince` query param (server-side filtering by last-update time, not review creation date). Must be documented in `--help`.
- **Portfolio-wide error handling**: When looping properties, a single property failure should log a warning to stderr and continue (skip-and-continue), not abort the entire run.
- **`--unresponded-only` definition**: `review.responseDateTimeUTC === null || review.responseDateTimeUTC === undefined`.
- **Stale `.js` criterion**: Mark `[x]` as-is without modifying the criterion text.

---

## Work Objectives

### Core Objective

Create a self-contained shell tool that fetches guest reviews from the Hostfully API, supporting per-property and portfolio-wide queries with date and response-status filters.

### Concrete Deliverables

- `src/worker-tools/hostfully/get-reviews.ts` — zero-import shell tool
- `tests/worker-tools/hostfully/get-reviews.test.ts` — Vitest test file with mock HTTP server
- Dockerfile line: `COPY --from=builder /build/src/worker-tools/hostfully/get-reviews.ts /tools/hostfully/get-reviews.ts`
- Story map: all 6 HF-06 acceptance criteria checked `[x]`

### Definition of Done

- [ ] `pnpm test -- --run tests/worker-tools/hostfully/get-reviews.test.ts` passes with 0 failures
- [ ] `tsx src/worker-tools/hostfully/get-reviews.ts --help` exits 0 and documents all flags
- [ ] Live API call against VLRE tenant's Hostfully account returns valid JSON
- [ ] All 6 HF-06 acceptance criteria in story map are marked `[x]`

### Must Have

- `--property-id <uid>` — optional, filters to specific property
- `--since <date>` — optional, uses `updatedSince` server-side filter
- `--unresponded-only` — optional boolean flag, client-side filter on `responseDateTimeUTC`
- `--help` — usage documentation including env vars and output shape
- Portfolio-wide query when no `--property-id` (requires `HOSTFULLY_AGENCY_UID`)
- Cursor-based pagination with dedup Set
- JSON array output to stdout, errors/warnings to stderr
- JSDoc domain model documentation at file top

### Must NOT Have (Guardrails)

- No imports — zero-import constraint (native `fetch` only)
- No modification to any existing tool file (`get-reservations.ts`, `get-properties.ts`, etc.)
- No adding `send-message.ts` to the Dockerfile
- No flags beyond `--property-id`, `--since`, `--unresponded-only`, `--help`
- No changing `HOSTFULLY_API_URL` default in any other file
- No runtime validation libraries (no Zod, no io-ts)
- No pretty-printed JSON output (single line, newline-terminated)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after, matching existing tool test pattern)
- **Framework**: Vitest (`pnpm test`)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run `tsx` commands, assert stdout JSON shape and exit codes
- **API verification**: Use Bash (curl) — send live requests, assert response status

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — implementation + tests):
├── Task 1: Create get-reviews.ts shell tool [unspecified-high]
└── Task 2: Create get-reviews.test.ts test file [unspecified-high]

Wave 2 (After Wave 1 — integration + verification):
├── Task 3: Add Dockerfile COPY line [quick]
├── Task 4: Mark story map HF-06 criteria complete [quick]
└── Task 5: Live API verification against VLRE tenant [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 (needs tool to exist) → Task 3+4+5 (parallel) → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks     | Wave |
| ---- | ---------- | ---------- | ---- |
| 1    | None       | 2, 3, 4, 5 | 1    |
| 2    | 1          | F1-F4      | 1    |
| 3    | 1          | F1-F4      | 2    |
| 4    | 2, 5       | F1-F4      | 2    |
| 5    | 1          | 4          | 2    |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `unspecified-high`, T2 → `unspecified-high`
- **Wave 2**: **3 tasks** — T3 → `quick`, T4 → `quick`, T5 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Create `src/worker-tools/hostfully/get-reviews.ts`

  **What to do**:
  - Create `src/worker-tools/hostfully/get-reviews.ts` following the exact structural pattern of `get-reservations.ts`
  - **API version**: Default base URL is `https://api.hostfully.com/api/v3.3` (NOT v3.2 — reviews endpoint is v3.3-only). Still read `HOSTFULLY_API_URL` env var if set.
  - **JSDoc header**: Document the Hostfully reviews domain model — explain that reviews are aggregated from OTA channels (Airbnb, VRBO, Booking.com), the `source` enum values, that `responseDateTimeUTC` tracks whether a host reply exists, and that `updatedSince` filters by record update time not review creation date.
  - **`parseArgs` function**: Manual argv loop (zero imports). Flags:
    - `--property-id <uid>` — optional string, filters to specific property
    - `--since <date>` — optional string, passed as `updatedSince` query param (server-side filter)
    - `--unresponded-only` — boolean flag (no value), client-side post-filter
    - `--help` — boolean flag, show usage and exit 0
  - **`--help` output**: Must describe ALL flags, env vars (`HOSTFULLY_API_KEY` required, `HOSTFULLY_AGENCY_UID` required when no `--property-id`, `HOSTFULLY_API_URL` optional), output shape (JSON array of review objects), and the semantics of `--since` (filters by last-updated, not review date)
  - **Raw API type** (`RawReview`): `uid`, `propertyUid`, `leadUid`, `author`, `title`, `content`, `rating`, `date`, `source`, `privateFeedback`, `responseDateTimeUTC`, `updatedUtcDateTime`, `reviewResponse` (object or null), `ratingCategories` (array). All fields optional except `uid`.
  - **Curated output type** (`ReviewSummary`): `uid`, `propertyUid`, `guestName` (from `author`), `title`, `content` (review text), `rating`, `date`, `source` (booking channel), `hasResponse` (boolean, derived from `responseDateTimeUTC !== null && responseDateTimeUTC !== undefined`), `responseDateTimeUTC` (string or null)
  - **Single-property flow** (when `--property-id` is provided):
    1. Validate `HOSTFULLY_API_KEY` env var
    2. Build query: `GET /reviews?propertyUid={uid}` + optional `&updatedSince={date}` + `&sort=SORT_BY_DATE&sortDirection=DESC`
    3. Cursor-paginate: `do { } while (true)` with `seenUids` Set dedup, `_paging._nextCursor`, break on `!hasNew || !cursor`
    4. Client-side filter: if `--unresponded-only`, keep only reviews where `responseDateTimeUTC` is null/undefined
    5. Map to `ReviewSummary[]`, output via `process.stdout.write(JSON.stringify(results) + '\n')`
  - **Portfolio-wide flow** (when `--property-id` is NOT provided):
    1. Validate both `HOSTFULLY_API_KEY` and `HOSTFULLY_AGENCY_UID` env vars
    2. Fetch all property UIDs: `GET /properties?agencyUid={agencyUid}` with cursor pagination (copy `get-properties.ts` pattern exactly)
    3. Loop over each property UID, fetch reviews using the single-property flow
    4. **Error handling per property**: If a property's reviews API call returns non-2xx, write `Warning: Failed to fetch reviews for property {uid}: {status}\n` to stderr and CONTINUE — do NOT abort. Collect reviews from all successful properties.
    5. Merge all reviews into one array, apply `--unresponded-only` filter if set, output combined results
  - **Error handling**: Match existing pattern exactly:
    - Missing required env var → `process.stderr.write('Error: ...\n')` + `process.exit(1)`
    - API error (non-2xx) on single-property → `process.stderr.write('Error: ...\n')` + `process.exit(1)`
    - API error on portfolio property loop → stderr warning + continue
    - Unhandled exception → `main().catch((err) => { process.stderr.write(\`Fatal: ${String(err)}\n\`); process.exit(1); })`

  **Must NOT do**:
  - No imports (zero-import constraint)
  - No modifying any existing tool file
  - No `console.log` — use `process.stdout.write` / `process.stderr.write` only
  - No pretty-printed JSON
  - No runtime validation (no Zod)
  - No flags beyond `--property-id`, `--since`, `--unresponded-only`, `--help`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Self-contained implementation task with clear patterns to follow; needs careful attention to API details and error handling branches
  - **Skills**: `[]`
    - No special skills needed — pure TypeScript file creation following existing patterns
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no browser interaction
    - `git-master`: Not needed — no git operations in this task

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 2 depends on this)
  - **Parallel Group**: Wave 1 (solo — must complete before Task 2)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/worker-tools/hostfully/get-reservations.ts` (entire file) — PRIMARY pattern reference. Copy the exact structure: type definitions → parseArgs → helper functions → async main → main().catch(). The cursor pagination loop (lines 147-177), env var validation (lines 123-131), help output format (lines 94-116), and error handling (lines 155-158) are the canonical patterns.
  - `src/worker-tools/hostfully/get-properties.ts:48-108` — Portfolio-wide query pattern. Shows `HOSTFULLY_AGENCY_UID` env var usage, `agencyUid` query param, and cursor pagination for the properties endpoint. Copy this for the portfolio-wide preamble in get-reviews.ts.
  - `src/worker-tools/hostfully/get-reservations.ts:81-89` — `formatGuestName` helper pattern. For get-reviews.ts, the `author` field is already a string, so no name formatting needed — just map directly.

  **API/Type References** (contracts to implement against):
  - Hostfully API v3.3: `GET /reviews?propertyUid={uid}&updatedSince={date}&sort=SORT_BY_DATE&sortDirection=DESC&_limit={n}&_cursor={cursor}` — cursor pagination, X-HOSTFULLY-APIKEY auth header
  - Response envelope: `{ reviews?: RawReview[], _paging?: { _nextCursor?: string } }`
  - Source enum: `BOOKING_DOT_COM | VRBO | FACEBOOK | TRIPADVISOR | REVYOOS | HOSTFULLY`

  **Test References** (testing patterns to follow):
  - `tests/worker-tools/hostfully/get-reservations.test.ts` — Canonical test pattern: mock HTTP server, `execFile('npx', ['tsx', SCRIPT_PATH, ...args])`, env injection, JSON stdout parsing, exit code assertions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — fetch reviews for a single property
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY and HOSTFULLY_API_URL set (use mock or live)
    Steps:
      1. Run: `tsx src/worker-tools/hostfully/get-reviews.ts --property-id "test-property"`
      2. Parse stdout as JSON array
      3. Assert each element has: uid, propertyUid, guestName, title, content, rating, date, source, hasResponse, responseDateTimeUTC
    Expected Result: Exit code 0, valid JSON array on stdout
    Failure Indicators: Non-zero exit code, malformed JSON, missing fields
    Evidence: .sisyphus/evidence/task-1-happy-path.txt

  Scenario: --help flag
    Tool: Bash
    Preconditions: None (--help should not require env vars)
    Steps:
      1. Run: `tsx src/worker-tools/hostfully/get-reviews.ts --help`
      2. Assert exit code is 0
      3. Assert stdout contains "--property-id", "--since", "--unresponded-only"
      4. Assert stdout contains "HOSTFULLY_API_KEY", "HOSTFULLY_AGENCY_UID"
    Expected Result: Exit code 0, usage text on stdout
    Failure Indicators: Non-zero exit code, missing flag documentation
    Evidence: .sisyphus/evidence/task-1-help.txt

  Scenario: Missing HOSTFULLY_API_KEY
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY not set
    Steps:
      1. Run: `HOSTFULLY_API_KEY= tsx src/worker-tools/hostfully/get-reviews.ts --property-id "test"`
      2. Assert exit code is 1
      3. Assert stderr contains "HOSTFULLY_API_KEY"
    Expected Result: Exit code 1, error message on stderr
    Evidence: .sisyphus/evidence/task-1-missing-key.txt

  Scenario: Missing HOSTFULLY_AGENCY_UID for portfolio-wide query
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY set, HOSTFULLY_AGENCY_UID not set, no --property-id
    Steps:
      1. Run: `HOSTFULLY_API_KEY=test HOSTFULLY_AGENCY_UID= tsx src/worker-tools/hostfully/get-reviews.ts`
      2. Assert exit code is 1
      3. Assert stderr contains "HOSTFULLY_AGENCY_UID"
    Expected Result: Exit code 1, error message on stderr
    Evidence: .sisyphus/evidence/task-1-missing-agency.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3, 4)
  - Message: `feat(hostfully): add get-reviews shell tool (HF-06)`
  - Files: `src/worker-tools/hostfully/get-reviews.ts`

- [x] 2. Create `tests/worker-tools/hostfully/get-reviews.test.ts`

  **What to do**:
  - Create `tests/worker-tools/hostfully/get-reviews.test.ts` following the exact pattern of `get-reservations.test.ts`
  - **Mock server setup**: `http.createServer` on port 0 in `beforeAll`, tear down in `afterAll`
  - **Mock data**: Create realistic review fixtures:
    - `VALID_REVIEWS`: Array of 3 reviews for property `VALID_PROPERTY`:
      1. Review with `responseDateTimeUTC: "2026-01-15T10:00:00Z"` (has response), rating 5, source AIRBNB, author "John Doe"
      2. Review with `responseDateTimeUTC: null` (no response), rating 3, source VRBO, author "Jane Smith"
      3. Review with `responseDateTimeUTC: null` (no response), rating 1, source BOOKING_DOT_COM, author "Bob Wilson"
    - `PAGINATED_PAGE1` / `PAGINATED_PAGE2`: For testing cursor pagination (2 reviews on page 1, 1 on page 2)
    - Empty response for `EMPTY_PROPERTY`
    - 500 response for `ERROR_PROPERTY`
  - **Mock server routes**:
    - `GET /reviews?propertyUid=VALID_PROPERTY` → return VALID_REVIEWS with `{ reviews: [...], _paging: {} }`
    - `GET /reviews?propertyUid=EMPTY_PROPERTY` → return `{ reviews: [], _paging: {} }`
    - `GET /reviews?propertyUid=PAGINATED_PROPERTY` → page 1 with `_nextCursor: "page2"`, then page 2
    - `GET /reviews?propertyUid=ERROR_PROPERTY` → 500
    - `GET /properties?agencyUid=VALID_AGENCY` → return 2 properties: `VALID_PROPERTY` and `EMPTY_PROPERTY`
    - `GET /properties?agencyUid=MIXED_AGENCY` → return 2 properties: `VALID_PROPERTY` and `ERROR_PROPERTY`
    - Check for `updatedSince` query param presence when `--since` is passed
  - **Test cases** (one `it()` per case):
    1. Default (single property) returns all reviews with correct output shape
    2. `--unresponded-only` filters to only reviews without responses (2 of 3)
    3. `--since 2026-01-01` passes `updatedSince=2026-01-01` as query param to API
    4. Empty property returns empty array, exit code 0
    5. API error (500) exits 1 with non-empty stderr
    6. Missing `--property-id` and missing `HOSTFULLY_AGENCY_UID` exits 1 with stderr containing "HOSTFULLY_AGENCY_UID"
    7. Missing `HOSTFULLY_API_KEY` exits 1 with stderr containing "HOSTFULLY_API_KEY"
    8. `--help` exits 0 with stdout containing all flag names
    9. Pagination combines results from both pages (3 total)
    10. Output shape has all expected fields with correct computed values (hasResponse boolean)
    11. Portfolio-wide (no `--property-id`, `HOSTFULLY_AGENCY_UID=VALID_AGENCY`) returns reviews from both properties
    12. Portfolio-wide with mixed success/failure (`MIXED_AGENCY`) — exit code 0, stderr contains warning, output includes reviews from successful property only
  - **`runScript` helper**: Copy from `get-reservations.test.ts` exactly — `execFile('npx', ['tsx', SCRIPT_PATH, ...args])` with env injection
  - Run tests: `pnpm test -- --run tests/worker-tools/hostfully/get-reviews.test.ts` must pass

  **Must NOT do**:
  - No tests requiring real Hostfully API key or live network calls
  - No external mocking libraries (no `nock`, no `msw`)
  - No modifying any existing test file

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex test file with 12 test cases, mock server routing, and multi-scenario assertions. Needs careful attention to mock data shape matching the tool's expectations.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no browser testing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: Tasks 4, F1-F4
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `tests/worker-tools/hostfully/get-reservations.test.ts` (entire file, 320 lines) — PRIMARY test pattern reference. Copy: `runScript` helper (lines 11-25), mock data shape (lines 27-111), `http.createServer` setup (lines 116-177), `beforeAll`/`afterAll` lifecycle (lines 116-183), test assertion patterns (lines 186-319). The mock server routing pattern is the canonical way to test shell tools.
  - `tests/worker-tools/hostfully/get-messages.test.ts` — Secondary reference for a tool with more complex routing logic

  **API/Type References**:
  - `src/worker-tools/hostfully/get-reviews.ts` (Task 1 output) — The tool this test validates. Mock data must match `RawReview` type exactly.

  **Acceptance Criteria**:
  - [ ] Test file created at `tests/worker-tools/hostfully/get-reviews.test.ts`
  - [ ] `pnpm test -- --run tests/worker-tools/hostfully/get-reviews.test.ts` → all 12 tests pass, 0 failures

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Run the test suite
    Tool: Bash
    Preconditions: Task 1 complete (get-reviews.ts exists)
    Steps:
      1. Run: `pnpm test -- --run tests/worker-tools/hostfully/get-reviews.test.ts`
      2. Assert exit code 0
      3. Assert output shows 12 passing tests, 0 failures
    Expected Result: All 12 tests pass
    Failure Indicators: Any test failure, exit code non-zero
    Evidence: .sisyphus/evidence/task-2-test-results.txt

  Scenario: Verify test isolation — existing tests still pass
    Tool: Bash
    Preconditions: Both get-reviews.ts and test file exist
    Steps:
      1. Run: `pnpm test -- --run tests/worker-tools/hostfully/`
      2. Assert all existing tests (get-messages, get-properties, get-property, get-reservations, send-message, validate-env) still pass
      3. Assert get-reviews tests also pass
    Expected Result: All Hostfully tool tests pass, 0 regressions
    Failure Indicators: Any existing test regressed
    Evidence: .sisyphus/evidence/task-2-no-regression.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3, 4)
  - Message: `feat(hostfully): add get-reviews shell tool (HF-06)`
  - Files: `tests/worker-tools/hostfully/get-reviews.test.ts`

- [x] 3. Add Dockerfile COPY line for get-reviews.ts

  **What to do**:
  - Add one line to the `Dockerfile` after line 70 (after the `get-messages.ts` COPY line):
    ```dockerfile
    COPY --from=builder /build/src/worker-tools/hostfully/get-reviews.ts /tools/hostfully/get-reviews.ts
    ```
  - Verify the line is between `get-messages.ts` (current line 70) and the blank line before `RUN mkdir -p /tools/platform` (current line 72)
  - Do NOT add `send-message.ts` to the Dockerfile
  - Do NOT modify any other Dockerfile lines

  **Must NOT do**:
  - No other Dockerfile changes
  - No adding `send-message.ts`
  - No npm install for hostfully tools (they use native fetch)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line addition to a known location in the Dockerfile
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5)
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `Dockerfile:65-72` — Current hostfully tools COPY block. Insert new line between line 70 (`get-messages.ts`) and line 71 (blank line).

  **Acceptance Criteria**:
  - [ ] `grep "get-reviews.ts" Dockerfile` returns exactly one match

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify Dockerfile has the new COPY line
    Tool: Bash
    Preconditions: Dockerfile edited
    Steps:
      1. Run: `grep -n "get-reviews" Dockerfile`
      2. Assert output shows exactly one line with the COPY pattern
      3. Run: `grep -c "hostfully" Dockerfile`
      4. Assert count is 7 (was 6, now 7 with the new line)
    Expected Result: Exactly one new COPY line for get-reviews.ts
    Failure Indicators: No match, or multiple matches, or wrong path
    Evidence: .sisyphus/evidence/task-3-dockerfile.txt

  Scenario: Verify send-message.ts was NOT added
    Tool: Bash
    Preconditions: Dockerfile edited
    Steps:
      1. Run: `grep "send-message" Dockerfile`
      2. Assert no output (exit code 1 — no match)
    Expected Result: send-message.ts is NOT in the Dockerfile
    Evidence: .sisyphus/evidence/task-3-no-send-message.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 4)
  - Message: `feat(hostfully): add get-reviews shell tool (HF-06)`
  - Files: `Dockerfile`

- [x] 4. Mark HF-06 acceptance criteria complete in story map

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - Change ALL 6 HF-06 acceptance criteria from `- [ ]` to `- [x]`:
    - Line 391: `- [x] \`src/worker-tools/hostfully/get-reviews.ts\` exists`
    - Line 392: `- [x] Usage: \`tsx /tools/hostfully/get-reviews.ts [--property-id "<id>"] [--since "2026-05-01"] [--unresponded-only]\``
    - Line 393: `- [x] Output includes: review text, rating (1-5), guest name, property ID, booking channel, date, whether a response exists`
    - Line 394: `- [x] Without \`--property-id\`, returns reviews across all properties for the tenant`
    - Line 395: `- [x] Compiled into Docker image at \`/tools/hostfully/get-reviews.js\``← Mark`[x]`as-is; do NOT change`.js`to`.ts` in the criterion text (it's stale but the intent is satisfied)
    - Line 396: `- [x] Script includes documentation comments explaining the reviews API domain model and \`--help\` describes each option's behavior so an AI agent can use the tool without reading source code`
  - Do NOT modify any other content in the story map

  **Must NOT do**:
  - No modifying criterion text (especially the stale `.js` path)
  - No marking any other story's criteria
  - No other story map changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple checkbox toggle on 6 lines in a markdown file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2, 5 (must verify everything works before marking complete)

  **References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:391-396` — The 6 acceptance criteria lines to change from `[ ]` to `[x]`

  **Acceptance Criteria**:
  - [ ] All 6 HF-06 criteria show `[x]` in the story map
  - [ ] No other story criteria were modified

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify all 6 criteria are checked
    Tool: Bash
    Preconditions: Story map edited
    Steps:
      1. Run: `grep -A 8 "HF-06: Get Reviews" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \[" | head -6`
      2. Assert all 6 lines show `- [x]`
      3. Assert zero lines show `- [ ]` (unchecked)
    Expected Result: All 6 acceptance criteria are checked
    Evidence: .sisyphus/evidence/task-4-story-map.txt

  Scenario: Verify no other criteria were modified
    Tool: Bash
    Preconditions: Story map edited
    Steps:
      1. Run: `git diff docs/2026-04-21-2202-phase1-story-map.md`
      2. Assert only lines 391-396 were changed
      3. Assert only change is `[ ]` → `[x]`
    Expected Result: Exactly 6 lines changed, all within HF-06 block
    Evidence: .sisyphus/evidence/task-4-diff.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 3)
  - Message: `feat(hostfully): add get-reviews shell tool (HF-06)`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`

- [x] 5. Live API verification against VLRE tenant

  **What to do**:
  - Run the tool against the real Hostfully API using the VLRE tenant's credentials
  - This is a verification task, not an implementation task — no code changes
  - Steps:
    1. Source the VLRE tenant's Hostfully API key from `tenant_secrets` (or ask user for it)
    2. Run: `HOSTFULLY_API_KEY=<key> tsx src/worker-tools/hostfully/get-reviews.ts --property-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"` (the VLRE test property from AGENTS.md)
    3. Verify the output is valid JSON
    4. Run with `--help` to verify usage text
    5. Run with `--unresponded-only` to verify filtering works
    6. If the property has no reviews, that's fine — empty array `[]` is valid
  - Record all outputs as evidence

  **Must NOT do**:
  - No code modifications
  - No creating/modifying any files except evidence files
  - No running against the DozalDevs tenant

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run a few commands, capture output — no implementation work
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4 (must pass before marking story map complete)
  - **Blocked By**: Task 1

  **References**:
  - AGENTS.md: VLRE test property UID `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
  - AGENTS.md: VLRE tenant ID `00000000-0000-0000-0000-000000000003`

  **Acceptance Criteria**:
  - [ ] Live API call returns valid JSON (even if empty array)
  - [ ] `--help` shows all flags
  - [ ] No crashes or unhandled errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Live API — single property query
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY for VLRE tenant is available
    Steps:
      1. Run: `HOSTFULLY_API_KEY=<key> tsx src/worker-tools/hostfully/get-reviews.ts --property-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"`
      2. Assert exit code 0
      3. Assert stdout is valid JSON (parse with `node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))"`)
    Expected Result: Valid JSON array output, exit code 0
    Failure Indicators: Non-zero exit code, parse error, connection error
    Evidence: .sisyphus/evidence/task-5-live-single.txt

  Scenario: Live API — help text
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: `tsx src/worker-tools/hostfully/get-reviews.ts --help`
      2. Assert exit code 0
      3. Assert stdout contains "--property-id", "--since", "--unresponded-only"
    Expected Result: Clean help text output
    Evidence: .sisyphus/evidence/task-5-live-help.txt
  ```

  **Commit**: NO (verification only — no code changes)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run tests/worker-tools/hostfully/get-reviews.test.ts`. Review `get-reviews.ts` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

- [x] 6. **Notify completion** — Send Telegram notification: plan `hf-06-get-reviews` complete, all tasks done, come back to review results.

---

## Commit Strategy

| Commit | Message                                               | Files                                                                                                                                                     | Pre-commit                                                            |
| ------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1      | `feat(hostfully): add get-reviews shell tool (HF-06)` | `src/worker-tools/hostfully/get-reviews.ts`, `tests/worker-tools/hostfully/get-reviews.test.ts`, `Dockerfile`, `docs/2026-04-21-2202-phase1-story-map.md` | `pnpm test -- --run tests/worker-tools/hostfully/get-reviews.test.ts` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run tests/worker-tools/hostfully/get-reviews.test.ts  # Expected: all tests pass
tsx src/worker-tools/hostfully/get-reviews.ts --help  # Expected: exit 0, shows all flags
```

### Final Checklist

- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] All tests pass
- [ ] Story map HF-06 criteria all `[x]`
- [ ] Live API verification succeeds
