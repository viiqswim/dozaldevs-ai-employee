# HF-02: Get Property Details Shell Tool

## TL;DR

> **Quick Summary**: Create a shell tool at `src/worker-tools/hostfully/get-property.ts` that fetches a property's full profile from the Hostfully API (3 endpoints: property details, amenities, house rules), merges them into a curated flat JSON, and outputs to stdout. Includes mock-based unit tests, Dockerfile update, and live API smoke test.
>
> **Deliverables**:
>
> - `src/worker-tools/hostfully/get-property.ts` — CLI script making 3 API calls, outputting curated JSON
> - `tests/worker-tools/hostfully/get-property.test.ts` — mock unit tests with local HTTP server
> - Dockerfile updated to copy get-property.js to `/tools/hostfully/`
> - Live API smoke test verified against real VLRE property
>
> **Estimated Effort**: Quick-to-Short (S complexity — 1-2 days)
> **Parallel Execution**: YES — 2 waves + final verification
> **Critical Path**: Task 1 (shell tool + tests) → Task 3 (build verification) → Task 4 (live smoke test)

---

## Context

### Original Request

Implement HF-02 from the Phase 1 story map (`docs/2026-04-21-2202-phase1-story-map.md`). This shell tool is the first real Hostfully API integration, enabling AI employees to fetch property-specific details for drafting accurate guest responses.

### Interview Summary

**Key Discussions**:

- Hostfully API v3.2 does NOT return amenities or house rules on the property endpoint — they are separate endpoints (`/amenities?propertyUid=`, `/property-rules?propertyUid=`)
- Tool makes 3 API calls total, merges results into curated flat JSON
- Output format: curated flat JSON with human-friendly field names (not raw API dump)
- Base URL: hardcode `https://api.hostfully.com/api/v3.2` with `HOSTFULLY_API_URL` env var override
- Test strategy: mock unit tests using local HTTP server (leveraging `HOSTFULLY_API_URL` override) + live smoke test
- No npm dependencies needed — Node 20 native `fetch` handles HTTP calls
- HF-01 completed — `validate-env.ts` exists, Dockerfile has `mkdir -p /tools/hostfully`

**Research Findings**:

- `GET /properties/:uid` returns `{ property: {...} }` — unwrap with `raw.property ?? raw`
- `GET /amenities?propertyUid=:uid` returns `{ amenities: [...], _metadata: {...} }` — 49 items for test property
- `GET /property-rules?propertyUid=:uid` returns `{ propertyRules: [...], _metadata: {...} }` — items like `{ rule: "IS_FAMILY_FRIENDLY", description: "" }`
- Address is nested object `{ address, city, state, zipCode, countryCode }` — flatten to string
- Check-in/out times are integers in `availability.checkInTimeStart` (16 = 4PM) and `availability.checkOutTime` (11 = 11AM)
- `wifiNetwork` and `wifiPassword` are top-level property fields
- `HOSTFULLY_AGENCY_UID` is NOT required for property/amenities/property-rules endpoints — only `HOSTFULLY_API_KEY` as the `X-HOSTFULLY-APIKEY` header
- Real test property: `dac5a0e0-3984-4f72-b622-de45a9dd758f` (1602-BLU-HOME, Bailey CO, 3BR cabin, 49 amenities, 1 house rule)

### Metis Review

**Identified Gaps** (addressed):

- `HOSTFULLY_AGENCY_UID` not needed for these endpoints → Only validate `HOSTFULLY_API_KEY`
- Null/absent field behavior undefined → Absent fields output as `null`
- `checkInTime` format unclear → Output as integers (matching API response)
- Partial API failure behavior → Graceful degradation for amenities/rules (property call is required)
- Scope creep risks: retry logic, caching, pagination, format flags → All explicitly excluded
- CLI flag naming → Use `--property-id` as specified in acceptance criteria
- Test mock must verify all 3 endpoints called → Mock server logs requests

---

## Work Objectives

### Core Objective

Create a shell tool that fetches a complete property profile from the Hostfully API — including amenities and house rules from separate endpoints — and outputs curated JSON suitable for AI employee consumption.

### Concrete Deliverables

- `src/worker-tools/hostfully/get-property.ts` compiled to `/tools/hostfully/get-property.js` in Docker image
- `tests/worker-tools/hostfully/get-property.test.ts` — mock unit tests with local HTTP server
- Updated `Dockerfile` with 1 additional COPY line
- Live API smoke test evidence in `.sisyphus/evidence/`

### Definition of Done

- [ ] `pnpm build` succeeds with the new TypeScript file
- [ ] `pnpm test -- --run tests/worker-tools/hostfully/get-property.test.ts` passes with all tests green
- [ ] Docker image contains `/tools/hostfully/get-property.js`
- [ ] Shell tool exits 0 with valid JSON when given a valid property ID and API key
- [ ] Shell tool exits 1 with descriptive stderr when property ID is invalid, API key is missing, or arg is missing
- [ ] Live smoke test against real VLRE property returns valid curated JSON with amenities and house rules

### Must Have

- CLI accepts `--property-id <uid>` and `--help` flags
- Validates `HOSTFULLY_API_KEY` env var is present (exit 1 with stderr if missing)
- Makes 3 API calls: `GET /properties/:uid`, `GET /amenities?propertyUid=:uid`, `GET /property-rules?propertyUid=:uid`
- Auth header: `X-HOSTFULLY-APIKEY: <key>` on all requests
- Curated flat JSON output to stdout with fields: uid, name, propertyType, address (formatted string), bedrooms, beds, bathrooms, maxGuests, checkInTime, checkOutTime, wifiNetwork, wifiPassword, bookingNotes, extraNotes, guideBookUrl, amenities (string array), houseRules (array of {rule, description})
- Absent/nullable fields output as `null`
- Base URL defaults to `https://api.hostfully.com/api/v3.2`, overridable via `HOSTFULLY_API_URL`
- Exit 1 with descriptive stderr on: missing arg, missing env var, HTTP 4xx/5xx, network error
- Graceful degradation: if amenities or property-rules calls fail, output empty arrays + stderr warning (property call failure = hard exit 1)
- Tests using local HTTP mock server with `HOSTFULLY_API_URL` override
- Dockerfile COPY line for get-property.js

### Must NOT Have (Guardrails)

- **No retry logic** — single-attempt fetch, fail fast (retry is HF-02+ enhancement if needed)
- **No response caching** — tool is stateless
- **No pagination on amenities** — fetch all in one call
- **No additional CLI flags** beyond `--property-id` and `--help` (no `--format`, `--verbose`, `--raw`)
- **No npm dependencies** — pure Node 20 built-ins (native `fetch`)
- **No exported TypeScript types or barrel files** — this is a standalone CLI script
- **No `npm install` step in Dockerfile** for `/tools/hostfully/`
- **No `HOSTFULLY_AGENCY_UID` validation** — not needed for these endpoints
- **No modifications to existing files** (except Dockerfile COPY addition)
- **No AI slop**: no excessive comments, no over-abstraction, no generic variable names

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: YES (tests alongside implementation)
- **Framework**: Vitest
- **Mock approach**: Local HTTP server (`http.createServer`) serving mock responses, `HOSTFULLY_API_URL=http://localhost:PORT` override
- **New test file**: `tests/worker-tools/hostfully/get-property.test.ts`

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run `node` with/without env vars, check exit code + stdout + stderr
- **Mock tests**: Use Bash — `pnpm test -- --run` and check output
- **Docker image**: Use Bash — `docker run --rm` to verify tool presence and behavior
- **Live API**: Use Bash — run tool with real credentials, parse JSON output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — code + tests + Dockerfile, MAX PARALLEL):
├── Task 1: Create get-property.ts shell tool + mock unit tests [unspecified-high]
└── Task 2: Update Dockerfile to copy get-property.js [quick]

Wave 2 (After Wave 1 — verification + live smoke test):
├── Task 3: Build verification + test run + Docker image validation [quick]
└── Task 4: Live API smoke test against VLRE property [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 4 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2, 3   | 1    |
| 2    | 1          | 3      | 1    |
| 3    | 1, 2       | 4      | 2    |
| 4    | 3          | F1-F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `unspecified-high`, T2 → `quick`
- **Wave 2**: **2 tasks** — T3 → `quick`, T4 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create get-property.ts shell tool + mock unit tests

  **What to do**:

  **Shell Tool** (`src/worker-tools/hostfully/get-property.ts`):
  - Follow `validate-env.ts` pattern: `parseArgs()` + `main()` + `main().catch()`
  - `parseArgs(argv)` parses `--property-id <uid>` and `--help`
  - `main()` flow:
    1. Parse args → if `--help`, print usage and exit 0
    2. If `--property-id` missing, exit 1 with stderr `"Error: --property-id argument is required\n"`
    3. Read `HOSTFULLY_API_KEY` from env → if missing, exit 1 with stderr `"Error: HOSTFULLY_API_KEY environment variable is required\n"`
    4. Read `HOSTFULLY_API_URL` from env → default to `"https://api.hostfully.com/api/v3.2"`
    5. Make 3 API calls in parallel (`Promise.all`):
       - `GET {baseUrl}/properties/{propertyId}` → unwrap `response.property ?? response`
       - `GET {baseUrl}/amenities?propertyUid={propertyId}` → unwrap `response.amenities ?? []`
       - `GET {baseUrl}/property-rules?propertyUid={propertyId}` → unwrap `response.propertyRules ?? []`
    6. All requests use header `X-HOSTFULLY-APIKEY: {apiKey}` and `Accept: application/json`
    7. Property call failure → exit 1 with stderr describing the error (include HTTP status)
    8. Amenities/rules call failure → graceful degradation: stderr warning, use empty array
    9. Build curated output object:
       ```
       {
         uid: property.uid,
         name: property.name,
         propertyType: property.propertyType ?? null,
         address: formatAddress(property.address) ?? null,  // "1602 Bluebird Dr, Bailey, CO 80421, US"
         bedrooms: property.bedrooms ?? null,
         beds: property.beds ?? null,
         bathrooms: property.bathrooms ?? null,
         maxGuests: property.availability?.maxGuests ?? null,
         checkInTime: property.availability?.checkInTimeStart ?? null,
         checkOutTime: property.availability?.checkOutTime ?? null,
         wifiNetwork: property.wifiNetwork ?? null,
         wifiPassword: property.wifiPassword ?? null,
         bookingNotes: property.bookingNotes ?? null,
         extraNotes: property.extraNotes ?? null,
         guideBookUrl: property.guideBookUrl ?? null,
         amenities: amenities.map(a => a.amenity),  // ["HAS_BODY_SOAP", "HAS_WIFI_SPEED_50", ...]
         houseRules: rules.map(r => ({ rule: r.rule, description: r.description ?? null }))
       }
       ```
    10. Write `JSON.stringify(output) + '\n'` to stdout and exit 0
  - `formatAddress(addr)`: if `addr` is an object with `address`/`city`/`state`/`zipCode`/`countryCode`, join non-null parts with `, `. If `addr` is a string, return as-is. If null/undefined, return null.
  - All fetch calls use native Node 20 `fetch` — NO npm deps

  **Unit Tests** (`tests/worker-tools/hostfully/get-property.test.ts`):
  - Use `http.createServer` to create a mock Hostfully API server in `beforeAll`
  - Mock server serves responses for these paths:
    - `GET /properties/:uid` → `{ property: { uid, name, address: {...}, bedrooms, availability: { maxGuests, checkInTimeStart, checkOutTime }, wifiNetwork, ... } }`
    - `GET /amenities?propertyUid=:uid` → `{ amenities: [{ amenity: "HAS_WIFI", category: "INDOOR" }] }`
    - `GET /property-rules?propertyUid=:uid` → `{ propertyRules: [{ rule: "IS_FAMILY_FRIENDLY", description: "Kids welcome" }] }`
    - Unknown UIDs → 404 `{ error: "Property not found" }`
  - Mock server tracks request paths for verification
  - Run the compiled JS via `execFile('node', [SCRIPT_PATH], { env: { HOSTFULLY_API_KEY: 'test', HOSTFULLY_API_URL: 'http://localhost:PORT', ...process.env } })`
  - Test cases (minimum 7):
    1. Happy path: valid property ID → exit 0, stdout is valid JSON, has uid/name/amenities/houseRules, all 3 endpoints called
    2. Missing `--property-id` arg → exit 1, stderr contains `--property-id`
    3. Missing `HOSTFULLY_API_KEY` → exit 1, stderr contains `HOSTFULLY_API_KEY`
    4. Invalid property ID (404) → exit 1, stderr contains error message
    5. Property with absent optional fields (wifiNetwork=undefined) → output has `null` for those fields
    6. `--help` flag → exit 0, stdout contains usage text
    7. Amenities endpoint fails (500) → exit 0 still (graceful degradation), amenities is `[]`, stderr contains warning
  - `afterAll`: close mock server

  **Must NOT do**:
  - Add any npm dependencies
  - Add retry logic, caching, or pagination
  - Export any TypeScript types or create barrel files
  - Add `--format`, `--verbose`, `--raw` or any flag beyond `--property-id` and `--help`
  - Validate `HOSTFULLY_AGENCY_UID` — it's not needed for these endpoints
  - Modify any existing files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: ~100+ lines of TypeScript with 3 API calls + error handling + ~150 lines of tests with mock HTTP server. More complex than a `quick` task.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/worker-tools/hostfully/validate-env.ts` — Script structure: `parseArgs()` + `main()` + `main().catch()` with `process.stderr.write()` for errors, `process.stdout.write()` for output, `process.exit(1)` on failure. Copy this structure exactly.
  - `src/worker-tools/slack/post-message.ts:8-38` — Arg parsing pattern with `--channel`, `--text`, `--help`. Adapt for `--property-id` and `--help`.
  - `src/worker-tools/slack/post-message.ts:78-121` — Main function pattern: validate env → parse args → make API call → format output → write stdout.
  - `tests/worker-tools/hostfully/validate-env.test.ts` — Test pattern: `execFile` against compiled JS in `dist/`, env vars passed via `execFile` options. Adapt for mock HTTP server approach.

  **API References** (verified against real Hostfully API):
  - `GET /api/v3.2/properties/{uid}` → `{ property: { uid, name, address: { address, city, state, zipCode, countryCode }, propertyType, bedrooms, beds, bathrooms, availability: { maxGuests, checkInTimeStart, checkOutTime }, wifiNetwork, wifiPassword, bookingNotes, extraNotes, guideBookUrl, ... } }`
  - `GET /api/v3.2/amenities?propertyUid={uid}` → `{ amenities: [{ uid, amenity: "HAS_BODY_SOAP", category: "INDOOR", description, price }], _metadata: { count } }`
  - `GET /api/v3.2/property-rules?propertyUid={uid}` → `{ propertyRules: [{ uid, rule: "IS_FAMILY_FRIENDLY", propertyUid, description }], _metadata: { count } }`
  - Auth: `X-HOSTFULLY-APIKEY: <key>` header on all requests
  - Test property UID: `dac5a0e0-3984-4f72-b622-de45a9dd758f` (1602-BLU-HOME, 49 amenities, 1 house rule)

  **Standalone MVP References** (porting source):
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/hostfully-client/client.ts:268-274` — `getProperty()` method: `GET /properties/${propertyUid}`, unwraps `raw.property ?? raw`. Copy this unwrap pattern.
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/hostfully-client/client.ts:30-36` — Headers pattern: `{ "X-HOSTFULLY-APIKEY": this.apiKey, "Content-Type": "application/json", "Accept": "application/json" }`. Copy for fetch calls.

  **Acceptance Criteria**:
  - [ ] File exists: `src/worker-tools/hostfully/get-property.ts`
  - [ ] File exists: `tests/worker-tools/hostfully/get-property.test.ts`
  - [ ] `pnpm build` succeeds (new TS file compiles)
  - [ ] `pnpm test -- --run tests/worker-tools/hostfully/get-property.test.ts` → PASS (all 7+ tests)
  - [ ] stdout is valid JSON parseable by `JSON.parse`
  - [ ] Output contains `uid`, `name`, `amenities` (array), `houseRules` (array)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Shell tool outputs valid JSON for valid property
    Tool: Bash
    Preconditions: pnpm build completed, mock server NOT needed (uses compiled dist/)
    Steps:
      1. Run: HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD node dist/worker-tools/hostfully/get-property.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f 2>/dev/null
      2. Pipe stdout through: node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('name:'+d.name, 'amenities:'+d.amenities.length, 'rules:'+d.houseRules.length)"
    Expected Result: "name:1602-BLU-HOME amenities:49 rules:1"
    Failure Indicators: JSON.parse error, missing fields, wrong counts
    Evidence: .sisyphus/evidence/task-1-live-property-output.txt

  Scenario: Shell tool exits 1 when --property-id is missing
    Tool: Bash
    Preconditions: pnpm build completed
    Steps:
      1. Run: HOSTFULLY_API_KEY=test node dist/worker-tools/hostfully/get-property.js 2>&1; echo "EXIT:$?"
    Expected Result: stderr contains "--property-id" and "EXIT:1"
    Failure Indicators: Exit 0, or missing error message
    Evidence: .sisyphus/evidence/task-1-missing-arg.txt

  Scenario: Shell tool exits 1 when HOSTFULLY_API_KEY is missing
    Tool: Bash
    Preconditions: pnpm build completed
    Steps:
      1. Run: node dist/worker-tools/hostfully/get-property.js --property-id test 2>&1; echo "EXIT:$?"
    Expected Result: stderr contains "HOSTFULLY_API_KEY" and "EXIT:1"
    Failure Indicators: Exit 0, or wrong error message
    Evidence: .sisyphus/evidence/task-1-missing-key.txt

  Scenario: Unit tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/hostfully/get-property.test.ts
    Expected Result: All tests pass (7+ tests, 0 failures)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-1-unit-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-live-property-output.txt
  - [ ] task-1-missing-arg.txt
  - [ ] task-1-missing-key.txt
  - [ ] task-1-unit-tests.txt

  **Commit**: YES
  - Message: `feat(hostfully): add get-property shell tool for fetching property details`
  - Files: `src/worker-tools/hostfully/get-property.ts`, `tests/worker-tools/hostfully/get-property.test.ts`
  - Pre-commit: `pnpm build && pnpm test -- --run tests/worker-tools/hostfully/get-property.test.ts`

- [x] 2. Update Dockerfile to copy get-property.js

  **What to do**:
  - Add 1 line to the `Dockerfile` AFTER the existing validate-env.js COPY (after line 64):
    ```dockerfile
    COPY --from=builder /build/dist/worker-tools/hostfully/get-property.js /tools/hostfully/get-property.js
    ```
  - No `mkdir` needed — already exists from HF-01 (line 63: `RUN mkdir -p /tools/hostfully`)
  - No `npm install` needed — get-property.ts has zero npm dependencies

  **Must NOT do**:
  - Modify any existing Dockerfile lines
  - Add `npm install --prefix /tools/hostfully`
  - Add another `mkdir` command
  - Move or reorder existing COPY commands

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding 1 line to an existing file in a clear, specified location
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (but logically depends on Task 1 existing)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1 (the source file must exist for docker build to succeed)

  **References**:

  **Pattern References**:
  - `Dockerfile:63-64` — Existing hostfully block:
    ```dockerfile
    RUN mkdir -p /tools/hostfully
    COPY --from=builder /build/dist/worker-tools/hostfully/validate-env.js /tools/hostfully/validate-env.js
    ```
    Add the new COPY line right after line 64 (validate-env.js COPY).

  **Acceptance Criteria**:
  - [ ] `Dockerfile` contains `COPY --from=builder /build/dist/worker-tools/hostfully/get-property.js /tools/hostfully/get-property.js`
  - [ ] No existing Dockerfile lines are modified
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds (requires Task 1 complete)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dockerfile contains correct get-property COPY line
    Tool: Bash
    Steps:
      1. Run: grep "get-property" Dockerfile
    Expected Result: Exactly 1 line with COPY path to get-property.js
    Failure Indicators: 0 lines or wrong path
    Evidence: .sisyphus/evidence/task-2-dockerfile-grep.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-dockerfile-grep.txt

  **Commit**: YES
  - Message: `build(docker): add get-property shell tool to worker image`
  - Files: `Dockerfile`
  - Pre-commit: `pnpm build`

- [x] 3. Build verification + test suite + Docker image validation

  **What to do**:
  - Run `pnpm build` — verify new TypeScript compiles
  - Run `pnpm test -- --run tests/worker-tools/hostfully/get-property.test.ts` — verify all mock tests pass
  - Run `pnpm test -- --run tests/worker-tools/hostfully/validate-env.test.ts` — verify HF-01 tests still pass (no regression)
  - Run `docker build -t ai-employee-worker:latest .` — verify Docker image builds
  - Verify Docker image contents:
    - `docker run --rm ai-employee-worker:latest ls /tools/hostfully/` → lists both `validate-env.js` and `get-property.js`
    - `docker run --rm ai-employee-worker:latest node /tools/hostfully/get-property.js 2>&1; echo "EXIT:$?"` → exit 1 (missing args)
    - `docker run --rm -e HOSTFULLY_API_KEY=test ai-employee-worker:latest node /tools/hostfully/get-property.js 2>&1; echo "EXIT:$?"` → exit 1 (missing --property-id)
  - This is a verification gate — if anything fails, fix before proceeding

  **Must NOT do**:
  - Modify any source files — this is verification only
  - Skip Docker image verification
  - Continue to Task 4 if any check fails

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running pre-defined verification commands, no code changes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential gate)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:
  - Success Criteria section of this plan — contains all verification commands

  **Acceptance Criteria**:
  - [ ] `pnpm build` → exit 0
  - [ ] All get-property tests pass
  - [ ] All validate-env tests still pass (no regression)
  - [ ] Docker image builds and contains both hostfully tools
  - [ ] Shell tool exits 1 without args or without --property-id

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds and tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1; echo "BUILD_EXIT:$?"
      2. Run: pnpm test -- --run tests/worker-tools/hostfully/ 2>&1 | tail -15
    Expected Result: BUILD_EXIT:0, all tests pass (12+ across both files)
    Evidence: .sisyphus/evidence/task-3-build-and-tests.txt

  Scenario: Docker image contains both hostfully tools
    Tool: Bash
    Steps:
      1. Run: docker run --rm ai-employee-worker:latest ls /tools/hostfully/
      2. Run: docker run --rm ai-employee-worker:latest node /tools/hostfully/get-property.js 2>&1; echo "EXIT:$?"
    Expected Result: Both validate-env.js and get-property.js listed. get-property.js exits 1 with error about --property-id.
    Evidence: .sisyphus/evidence/task-3-docker-validation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-build-and-tests.txt
  - [ ] task-3-docker-validation.txt

  **Commit**: NO (verification only)

- [x] 4. Live API smoke test against real VLRE property

  **What to do**:
  - Run the shell tool against the real Hostfully API with the VLRE property:
    ```bash
    HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD \
    node dist/worker-tools/hostfully/get-property.js \
      --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f
    ```
  - Verify the output:
    - `uid` equals `dac5a0e0-3984-4f72-b622-de45a9dd758f`
    - `name` equals `1602-BLU-HOME`
    - `address` contains `Bailey` and `CO`
    - `bedrooms` equals `3`
    - `maxGuests` equals `8`
    - `checkInTime` equals `16`
    - `checkOutTime` equals `11`
    - `amenities` is an array with length > 0 (expected: 49)
    - `houseRules` is an array with length > 0 (expected: 1)
    - `wifiNetwork` is `"PrincessLucy"`
  - Test error case with an invalid property ID:
    ```bash
    HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD \
    node dist/worker-tools/hostfully/get-property.js \
      --property-id 00000000-0000-0000-0000-000000000000 2>&1
    echo "EXIT:$?"
    ```
  - Expected: exit 1, stderr contains error about property not found or 404
  - Also run inside Docker image to verify the full path:
    ```bash
    docker run --rm \
      -e HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD \
      ai-employee-worker:latest \
      node /tools/hostfully/get-property.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f
    ```

  **Must NOT do**:
  - Modify any source files
  - Store real API keys in any committed file
  - Skip the Docker image test

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running curl/node commands, no code changes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 3

  **References**:
  - Test property UID: `dac5a0e0-3984-4f72-b622-de45a9dd758f` (1602-BLU-HOME, Bailey CO)
  - VLRE Hostfully API key: `Y6EQ7KgSwoOGCokD`
  - Expected values confirmed via direct API calls during planning

  **Acceptance Criteria**:
  - [ ] Live API returns valid JSON with correct property data
  - [ ] `uid`, `name`, `address`, `bedrooms`, `maxGuests`, `checkInTime`, `checkOutTime` are all correct
  - [ ] `amenities` array length > 0
  - [ ] `houseRules` array length > 0
  - [ ] Invalid property ID returns exit 1 with descriptive error
  - [ ] Docker image run produces same valid output

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Live API returns correct property data
    Tool: Bash
    Preconditions: pnpm build completed, HOSTFULLY_API_KEY available
    Steps:
      1. Run: HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD node dist/worker-tools/hostfully/get-property.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f 2>/dev/null
      2. Parse JSON and verify fields
    Expected Result: name="1602-BLU-HOME", bedrooms=3, maxGuests=8, amenities.length>=40, houseRules.length>=1
    Failure Indicators: JSON parse error, wrong values, empty arrays
    Evidence: .sisyphus/evidence/task-4-live-smoke-test.txt

  Scenario: Invalid property ID returns exit 1
    Tool: Bash
    Steps:
      1. Run: HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD node dist/worker-tools/hostfully/get-property.js --property-id 00000000-0000-0000-0000-000000000000 2>&1; echo "EXIT:$?"
    Expected Result: EXIT:1, stderr contains error message
    Evidence: .sisyphus/evidence/task-4-invalid-property.txt

  Scenario: Docker image runs tool successfully against live API
    Tool: Bash
    Steps:
      1. Run: docker run --rm -e HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD ai-employee-worker:latest node /tools/hostfully/get-property.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.name, d.amenities.length)"
    Expected Result: "1602-BLU-HOME 49" (or similar count)
    Evidence: .sisyphus/evidence/task-4-docker-live-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-live-smoke-test.txt
  - [ ] task-4-invalid-property.txt
  - [ ] task-4-docker-live-test.txt

  **Commit**: NO (operational verification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/hf02-get-property.md` end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY QA scenario from EVERY task. Test cross-task integration (tool runs in Docker image with real API). Test edge cases: invalid property ID, missing API key, empty amenities. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Commit Message                                                               | Files                                                                                             | Pre-commit Check                                                                     |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1          | `feat(hostfully): add get-property shell tool for fetching property details` | `src/worker-tools/hostfully/get-property.ts`, `tests/worker-tools/hostfully/get-property.test.ts` | `pnpm build && pnpm test -- --run tests/worker-tools/hostfully/get-property.test.ts` |
| 2          | `build(docker): add get-property shell tool to worker image`                 | `Dockerfile`                                                                                      | `pnpm build`                                                                         |
| 4          | No commit — operational verification (live API smoke test)                   | —                                                                                                 | —                                                                                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exit 0, no errors
pnpm test -- --run tests/worker-tools/hostfully/get-property.test.ts  # Expected: all tests pass
docker build -t ai-employee-worker:latest .  # Expected: exit 0
docker run --rm ai-employee-worker:latest ls /tools/hostfully/  # Expected: get-property.js listed
HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD node dist/worker-tools/hostfully/get-property.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.name, d.amenities.length, d.houseRules.length)"  # Expected: "1602-BLU-HOME 49 1"
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker image builds and contains get-property.js
- [ ] Live API smoke test returns valid curated JSON
