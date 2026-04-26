# HF-04: Get Guest Messages Shell Tool

## TL;DR

> **Quick Summary**: Build a CLI shell tool that fetches guest message threads from Hostfully's messaging API for a given property, with `--unresponded-only` filtering and per-thread `--limit`. Uses a two-step approach: fetch leads for property → fetch messages per lead via the separate `/messages` endpoint.
>
> **Deliverables**:
>
> - `src/worker-tools/hostfully/get-messages.ts` — shell tool with documentation comments
> - `tests/worker-tools/hostfully/get-messages.test.ts` — mock server tests (≥10 cases)
> - Dockerfile updated (add `get-messages.js` + fix missing `get-reservations.js`)
> - Story map ACs marked `[x]`
>
> **Estimated Effort**: Short (S complexity, established patterns)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → Task 5 → F1-F4

---

## Context

### Original Request

Build HF-04 from the Phase 1 story map. Create a shell tool that fetches guest messages from Hostfully's unified inbox for a given property, with support for `--unresponded-only` filtering and `--limit` per thread. Test thoroughly via automated tests and live API verification. Mark story map ACs when complete.

### Interview Summary

**Key Discussions**:

- Two-step API approach confirmed: fetch leads → fetch messages per lead (separate endpoint)
- Documentation comments required on all shell tools (new standard AC)
- `--limit` applies per-thread (from porting notes: "MVP fetches the last 30 messages per conversation")
- User asked to add "mark story map ACs" as an explicit task in the plan

**Research Findings**:

- **Messaging API is separate from leads API**: `GET /api/v3.2/messages?leadUid=<uuid>`
- **Different response shape**: `{ data: [...], nextCursor: "..." }` (NOT `{ leads: [...], _paging: { _nextCursor: "..." } }`)
- **Message fields**: uid, threadUid, leadUid, propertyUid, content, type (channel), status, senderType (GUEST/HOST), created
- **No server-side unresponded filter** — must check last message senderType client-side
- **No propertyUid filter on /messages** — must go through leads first
- **Guest name** comes from lead's `guestInformation` (not on message objects)
- **Rate limit**: 10,000 calls/hour (N+1 pattern for leads × messages is acceptable for single-property queries)

### Metis Review

**Identified Gaps** (addressed):

- **Dockerfile bug**: `get-reservations.js` COPY line is missing — plan includes fix in Task 2
- **Message sort order unknown**: Plan includes live API verification step in Task 3 to confirm before filter logic is trusted
- **Zero-message leads**: Plan specifies skip behavior (no messages = nothing to show)
- **Unknown senderType**: Treated as responded (conservative default)
- **Guest name fallback**: Uses same `formatGuestName()` pattern as get-reservations.ts, returns `null` if empty

---

## Work Objectives

### Core Objective

Create a shell tool that gives AI employees full conversation context for guest interactions at a specific property, including which threads need responses.

### Concrete Deliverables

- `src/worker-tools/hostfully/get-messages.ts` (new file)
- `tests/worker-tools/hostfully/get-messages.test.ts` (new file)
- `Dockerfile` line additions (get-messages.js + missing get-reservations.js)
- `docs/2026-04-21-2202-phase1-story-map.md` HF-04 ACs marked `[x]`

### Definition of Done

- [ ] `pnpm build` → exit 0
- [ ] `npx vitest run tests/worker-tools/hostfully/` → all pass (31 existing + new)
- [ ] `docker build -t ai-employee-worker:latest .` → exit 0
- [ ] `docker run --rm --entrypoint node ai-employee-worker:latest /tools/hostfully/get-messages.js --help` → exit 0 with usage text
- [ ] Live API returns messages for VLRE test property with real data
- [ ] All 7 HF-04 ACs in story map marked `[x]`

### Must Have

- `--property-id` (required), `--unresponded-only` (optional flag), `--limit` (optional, default 30), `--help`
- Output per thread: reservationId, guestName, channel, unresponded flag, messages array
- Each message: text, sender (guest/host), timestamp
- Chronological ordering within each thread
- Documentation comments explaining Lead → Thread → Message domain model
- Enhanced `--help` describing all options, output shape, and domain terminology

### Must NOT Have (Guardrails)

- MUST NOT add `HOSTFULLY_AGENCY_UID` dependency (not needed for property-scoped queries)
- MUST NOT add write/reply/send operations (that's HF-05)
- MUST NOT add `--status` filtering (that's HF-03's concern)
- MUST NOT add multi-property support in a single call
- MUST NOT add retry logic or caching
- MUST NOT use `console.log` — always `process.stdout.write` / `process.stderr.write`
- MUST NOT add npm imports — only Node built-ins + native `fetch`
- MUST NOT add `export` statements
- MUST NOT paginate messages beyond `--limit` (pass `_limit` to API, take one page per thread)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, `pnpm test`)
- **Automated tests**: YES (tests-after — implement tool first, then test file)
- **Framework**: Vitest (`npx vitest run`)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI tool**: Use Bash — run command, check stdout JSON, check stderr, check exit code
- **Docker**: Use Bash — build image, run container, verify tool exists and runs
- **Live API**: Use Bash — run tool with real VLRE credentials, verify real data returns

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — implementation):
├── Task 1: Create get-messages.ts + get-messages.test.ts [deep]
└── Task 2: Fix Dockerfile (add get-reservations.js + get-messages.js) [quick]

Wave 2 (After Wave 1 — live verification):
├── Task 3: Live API smoke tests + message sort order verification [unspecified-high]

Wave 3 (After Wave 2 — wrap-up):
├── Task 4: Mark story map ACs as [x] [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks  | Wave  |
| ----- | ---------- | ------- | ----- |
| 1     | None       | 2, 3, 4 | 1     |
| 2     | 1          | 3       | 1     |
| 3     | 1, 2       | 4       | 2     |
| 4     | 3          | F1-F4   | 3     |
| F1-F4 | 4          | None    | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `deep`, T2 → `quick`
- **Wave 2**: 1 task — T3 → `unspecified-high`
- **Wave 3**: 1 task — T4 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create `get-messages.ts` + `get-messages.test.ts`

  **What to do**:
  - **API exploration first**: Hit the real Hostfully messages API to confirm response shape and sort order:
    - `curl -H "X-HOSTFULLY-APIKEY: Y6EQ7KgSwoOGCokD" "https://api.hostfully.com/api/v3.2/messages?leadUid=<a-real-lead-uid>&_limit=5"` — use a lead UID from get-reservations output for property `dac5a0e0-3984-4f72-b622-de45a9dd758f`
    - Document: response envelope shape (`data` vs `messages`?), field names, sort order (oldest-first or newest-first), `nextCursor` location
    - If response shape differs from research, adapt implementation accordingly
  - **Create `src/worker-tools/hostfully/get-messages.ts`**:
    - File-level JSDoc block explaining:
      - Hostfully's two-layer messaging model: Lead (reservation) → Thread (1:1) → Messages (1:N)
      - The `/messages` endpoint is separate from `/leads` — this tool does a two-step fetch
      - No server-side unresponded filter exists — client-side detection via `senderType`
      - `type` field on messages = booking channel (AIRBNB, VRBO, etc.), not message type
      - `senderType` = GUEST or HOST — direction of the message
    - Types: `RawLead` (reuse shape from get-reservations for uid, guestInformation, channel), `RawMessage` (uid, leadUid, content, senderType, type, created), output type `ThreadSummary` with nested `MessageSummary[]`
    - `parseArgs()`: `--property-id` (required), `--unresponded-only` (boolean flag), `--limit` (default 30), `--help`
    - `formatGuestName()`: same null-safe pattern as get-reservations.ts
    - `main()`:
      1. Validate args and env (`HOSTFULLY_API_KEY` required, `HOSTFULLY_API_URL` optional override)
      2. Fetch BOOKING-type leads for property: `GET /leads?propertyUid=<uid>&checkInFrom=<30-days-ago>` with cursor-dedup pagination (same pattern as get-reservations.ts). Use 30-days-ago as default `checkInFrom` to include current stays and recent checkouts (not just future bookings)
      3. For each lead: `GET /messages?leadUid=<uid>&_limit=<limit>` — single page, no pagination needed since `--limit` caps it
      4. Sort messages chronologically within each thread (sort by `created` ascending)
      5. Skip leads with zero messages
      6. Compute `unresponded`: true if last message has `senderType === 'GUEST'`
      7. If `--unresponded-only`: filter to threads where `unresponded === true`
      8. Output JSON array of thread summaries
    - Output shape per thread:
      ```json
      {
        "reservationId": "lead-uid",
        "guestName": "John Doe",
        "channel": "AIRBNB",
        "unresponded": true,
        "messages": [
          { "text": "Hi, check-in time?", "sender": "guest", "timestamp": "2026-04-20T14:30:00Z" },
          { "text": "3pm! See you then.", "sender": "host", "timestamp": "2026-04-20T15:00:00Z" }
        ]
      }
      ```
    - Enhanced `--help` text: explain unified inbox concept, what each flag does, output shape, default behavior
  - **Create `tests/worker-tools/hostfully/get-messages.test.ts`**:
    - Mock HTTP server with routes for BOTH `/leads` and `/messages` endpoints (two-step fetch means two URL patterns)
    - Mock leads route: return leads with varying types (BOOKING, BLOCK, INQUIRY) — tool should only fetch messages for BOOKING leads
    - Mock messages route: keyed by `leadUid` query param, return different message arrays per lead
    - Test data: at minimum 3 leads (2 BOOKINGs + 1 BLOCK), with messages having mixed senderTypes
    - **Test cases (minimum 12)**:
      1. Happy path: returns threads for BOOKING leads only, messages in chronological order
      2. `--unresponded-only`: filters to threads where last message is from guest
      3. `--limit 2`: passes `_limit=2` to messages endpoint, respects limit
      4. Empty property (no leads): returns `[]`, exit 0
      5. Lead with zero messages: skipped in output
      6. Missing `--property-id`: exit 1, stderr contains "--property-id"
      7. Missing `HOSTFULLY_API_KEY`: exit 1, stderr contains "HOSTFULLY_API_KEY"
      8. API error (500 on leads fetch): exit 1, stderr non-empty
      9. API error (500 on messages fetch): exit 1 or skip that thread (document which)
      10. `--help`: exit 0, stdout contains all flag names
      11. Pagination: leads span 2 pages, messages fetched for all leads across pages
      12. Output shape: verify all fields present with correct types on a known thread
    - Follow exact mock server pattern from `get-reservations.test.ts`: `http.createServer`, port 0, `beforeAll`/`afterAll`, `runScript` helper with `execFile`

  **Must NOT do**:
  - Do NOT paginate messages (single page per thread with `_limit`)
  - Do NOT add `HOSTFULLY_AGENCY_UID` dependency
  - Do NOT add npm imports — only Node built-ins + native `fetch`
  - Do NOT use `console.log`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Two-step API integration with unknown response shape requires exploration + careful implementation + comprehensive tests. More complex than a single-endpoint tool.
  - **Skills**: `[]`
    - No specialized skills needed — standard TypeScript + HTTP

  **Parallelization**:
  - **Can Run In Parallel**: NO (other tasks depend on this)
  - **Parallel Group**: Wave 1 (but Task 2 waits for this)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/worker-tools/hostfully/get-reservations.ts` — CLOSEST reference. Copy: `parseArgs()` structure, `formatGuestName()`, cursor-dedup pagination loop for leads fetch, error handling pattern, `process.stdout.write(JSON.stringify(...))` output. The leads fetch in this tool is identical to what get-messages needs for step 1.
  - `src/worker-tools/hostfully/get-reservations.ts:1-22` — Documentation comment style (file-level JSDoc block). Match this pattern for the messaging domain model explanation.
  - `src/worker-tools/hostfully/get-reservations.ts:148-168` — Client-side filtering pattern. Get-messages uses similar logic for `--unresponded-only` but checks `senderType` instead of lead `status`.

  **Test References**:
  - `tests/worker-tools/hostfully/get-reservations.test.ts` — EXACT template. Copy: imports, `SCRIPT_PATH`, `runScript` helper, `beforeAll`/`afterAll` server lifecycle, mock data constants, route dispatch by query params. Adapt: add a SECOND route for `/messages` (get-reservations only has one route for `/leads`).
  - `tests/worker-tools/hostfully/get-property.test.ts` — Secondary reference for multi-endpoint mocking (this tool mocks `/properties`, `/amenities`, `/property-rules` — similar to how get-messages needs `/leads` + `/messages`).

  **API References**:
  - Messages endpoint: `GET /api/v3.2/messages?leadUid=<uuid>&_limit=30` — response shape (from librarian research): `{ data: [...], nextCursor: "..." }`. Fields: uid, threadUid, leadUid, propertyUid, content, type, status, senderType, created. **VERIFY via live API call before implementing — response shape is inferred from docs, not confirmed.**
  - Leads endpoint: `GET /api/v3.2/leads?propertyUid=<uid>&checkInFrom=<date>` — already known from get-reservations. Response: `{ leads: [...], _paging: { _nextCursor: "..." } }`.

  **External References**:
  - Hostfully messages API: `https://dev.hostfully.com/reference/findallmessagesforagency`
  - Hostfully v3.2 messaging updates: `https://dev.hostfully.com/reference/v32-messaging-updates`

  **Acceptance Criteria**:
  - [ ] `src/worker-tools/hostfully/get-messages.ts` exists with file-level JSDoc and enhanced `--help`
  - [ ] `tests/worker-tools/hostfully/get-messages.test.ts` exists with ≥12 test cases
  - [ ] `pnpm build` → exit 0
  - [ ] `npx vitest run tests/worker-tools/hostfully/get-messages.test.ts` → all pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Happy path — messages returned for valid property
    Tool: Bash
    Preconditions: pnpm build completed, mock server not needed (test file handles this)
    Steps:
      1. npx vitest run tests/worker-tools/hostfully/get-messages.test.ts
      2. Verify test count ≥ 12 in output
      3. Verify 0 failures
    Expected Result: All tests pass, exit 0
    Failure Indicators: Any test failure, exit code non-zero
    Evidence: .sisyphus/evidence/task-1-tests-pass.txt

  Scenario: --help outputs usage without requiring env vars
    Tool: Bash
    Preconditions: pnpm build completed
    Steps:
      1. node dist/worker-tools/hostfully/get-messages.js --help
      2. Verify stdout contains "--property-id"
      3. Verify stdout contains "--unresponded-only"
      4. Verify stdout contains "--limit"
      5. Verify stdout contains "HOSTFULLY_API_KEY"
      6. Verify exit code 0
    Expected Result: All flags documented, exit 0
    Failure Indicators: Missing flag in output, non-zero exit
    Evidence: .sisyphus/evidence/task-1-help-output.txt

  Scenario: Missing --property-id fails gracefully
    Tool: Bash
    Preconditions: pnpm build completed
    Steps:
      1. HOSTFULLY_API_KEY=test node dist/worker-tools/hostfully/get-messages.js 2>&1; echo "EXIT:$?"
      2. Verify stderr contains "--property-id"
      3. Verify exit code 1
    Expected Result: Clear error message, exit 1
    Failure Indicators: Exit 0, no error message, or crash with stack trace
    Evidence: .sisyphus/evidence/task-1-missing-arg.txt
  ```

  **Commit**: YES
  - Message: `feat(hostfully): add get-messages shell tool for guest conversations`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `tests/worker-tools/hostfully/get-messages.test.ts`
  - Pre-commit: `pnpm build && npx vitest run tests/worker-tools/hostfully/get-messages.test.ts`

---

- [x] 2. Fix Dockerfile — add `get-reservations.js` (bug fix) + `get-messages.js`

  **What to do**:
  - **Fix pre-existing bug**: `get-reservations.js` COPY line is missing from Dockerfile despite HF-03 being complete. Add it.
  - **Add new tool**: `get-messages.js` COPY line.
  - After line 66 (`get-properties.js`), add:
    ```dockerfile
    COPY --from=builder /build/dist/worker-tools/hostfully/get-reservations.js /tools/hostfully/get-reservations.js
    COPY --from=builder /build/dist/worker-tools/hostfully/get-messages.js /tools/hostfully/get-messages.js
    ```
  - Verify Docker build succeeds
  - Verify both new files exist in the image at `/tools/hostfully/`

  **Must NOT do**:
  - Do NOT modify any other Dockerfile lines
  - Do NOT add npm dependencies
  - Do NOT rename or reorder existing COPY lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-line Dockerfile edit, trivial
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Task 1's .ts file to compile)
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `Dockerfile:63-66` — existing hostfully COPY block. Add after line 66.

  **Acceptance Criteria**:
  - [ ] Dockerfile contains COPY line for `get-reservations.js`
  - [ ] Dockerfile contains COPY line for `get-messages.js`
  - [ ] `docker build -t ai-employee-worker:latest .` → exit 0
  - [ ] `docker run --rm --entrypoint ls ai-employee-worker:latest /tools/hostfully/` → shows both new files

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker image contains all 5 hostfully tools
    Tool: Bash
    Preconditions: docker build completed
    Steps:
      1. docker run --rm --entrypoint ls ai-employee-worker:latest /tools/hostfully/
      2. Verify output contains: validate-env.js, get-property.js, get-properties.js, get-reservations.js, get-messages.js
    Expected Result: All 5 files listed
    Failure Indicators: Missing file(s)
    Evidence: .sisyphus/evidence/task-2-docker-ls.txt

  Scenario: get-messages.js runs --help in Docker
    Tool: Bash
    Preconditions: docker build completed
    Steps:
      1. docker run --rm --entrypoint node ai-employee-worker:latest /tools/hostfully/get-messages.js --help
      2. Verify exit 0 and usage text appears
    Expected Result: Help text printed, exit 0
    Failure Indicators: Non-zero exit, missing usage text
    Evidence: .sisyphus/evidence/task-2-docker-help.txt

  Scenario: get-messages.js missing env exits 1 in Docker
    Tool: Bash
    Preconditions: docker build completed
    Steps:
      1. docker run --rm --entrypoint node ai-employee-worker:latest /tools/hostfully/get-messages.js --property-id test 2>&1; echo "EXIT:$?"
      2. Verify stderr contains "HOSTFULLY_API_KEY"
      3. Verify exit 1
    Expected Result: Clean error, exit 1
    Failure Indicators: Exit 0 or stack trace
    Evidence: .sisyphus/evidence/task-2-docker-missing-env.txt
  ```

  **Commit**: YES
  - Message: `build(docker): add get-reservations and get-messages to worker image`
  - Files: `Dockerfile`
  - Pre-commit: `docker build -t ai-employee-worker:latest .`

---

- [x] 3. Live API smoke tests + message sort order verification

  **What to do**:
  - Run the tool against VLRE's real Hostfully API to verify end-to-end behavior
  - **Sort order verification** (CRITICAL): Fetch messages for a known lead and verify whether they arrive oldest-first or newest-first. Document the finding. If the tool's sort logic is wrong, fix it before proceeding.
  - **Test scenarios** (all against VLRE property `dac5a0e0-3984-4f72-b622-de45a9dd758f`):
    1. Default (no filters): `HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD node dist/worker-tools/hostfully/get-messages.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f`
       - Verify: returns array, each thread has reservationId, guestName, channel, messages[]
       - Verify: messages within each thread are chronologically ordered
    2. `--unresponded-only`: verify it filters correctly (may return 0 threads if all are responded)
    3. `--limit 2`: verify each thread has at most 2 messages
    4. Invalid property ID: `--property-id invalid-uuid-here` → verify exit 1 with error
    5. `--help`: verify comprehensive output
  - Record all outputs as evidence
  - If sort order is wrong or response shape differs from expectations, fix the tool and re-run tests

  **Must NOT do**:
  - Do NOT modify any code unless sort order or response shape needs fixing
  - Do NOT skip the sort order verification — it determines correctness of --unresponded-only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Live API testing requires careful observation and potential debugging. May need to fix code if API response differs from research.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after implementation + Docker)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `.sisyphus/notepads/hf03-get-reservations/learnings.md` — prior API discoveries and test data
  - VLRE property: `dac5a0e0-3984-4f72-b622-de45a9dd758f`
  - VLRE API key: `Y6EQ7KgSwoOGCokD`

  **Acceptance Criteria**:
  - [ ] Live API returns messages for VLRE test property
  - [ ] Message sort order verified and documented
  - [ ] `--unresponded-only` tested with real data
  - [ ] `--limit` tested with real data
  - [ ] Invalid property ID returns clean error

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Live API — default fetch returns threads with messages
    Tool: Bash
    Preconditions: pnpm build completed, VLRE API key available
    Steps:
      1. HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD node dist/worker-tools/hostfully/get-messages.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f
      2. Parse JSON output
      3. Verify at least 1 thread returned
      4. Verify first thread has: reservationId (string), guestName (string), channel (string), messages (array)
      5. Verify messages within thread are ordered by timestamp ascending
    Expected Result: Valid JSON with real guest conversation data
    Failure Indicators: Empty result, parse error, wrong field names
    Evidence: .sisyphus/evidence/task-3-live-default.json

  Scenario: Live API — sort order verification
    Tool: Bash
    Preconditions: pnpm build completed
    Steps:
      1. Fetch messages for a known lead with multiple messages
      2. Compare raw API response order vs tool output order
      3. Verify tool outputs oldest-first within each thread
    Expected Result: Messages sorted chronologically (oldest first)
    Failure Indicators: Newest-first or unsorted
    Evidence: .sisyphus/evidence/task-3-sort-order.txt

  Scenario: Live API — --limit 2 caps messages per thread
    Tool: Bash
    Preconditions: pnpm build completed
    Steps:
      1. HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD node dist/worker-tools/hostfully/get-messages.js --property-id dac5a0e0-3984-4f72-b622-de45a9dd758f --limit 2
      2. Verify no thread has more than 2 messages
    Expected Result: All threads have ≤2 messages
    Failure Indicators: Any thread with >2 messages
    Evidence: .sisyphus/evidence/task-3-live-limit.json
  ```

  **Commit**: NO (verification only — unless fixes needed, in which case commit the fix)

---

- [x] 4. Mark story map ACs as `[x]`

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - Find HF-04 acceptance criteria section (around line 234)
  - Change all 7 `- [ ]` items to `- [x]`
  - Verify by reading the file back

  **Must NOT do**:
  - Do NOT modify any other story's ACs
  - Do NOT change any text — only toggle `[ ]` → `[x]`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple find-and-replace in one file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after everything verified)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 3

  **References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:234-243` — HF-04 acceptance criteria

  **Acceptance Criteria**:
  - [ ] All 7 HF-04 ACs in story map show `[x]`
  - [ ] No other story's ACs were modified

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All HF-04 ACs marked complete
    Tool: Bash
    Preconditions: Story map file exists
    Steps:
      1. Read lines 232-245 of docs/2026-04-21-2202-phase1-story-map.md
      2. Count occurrences of "- [x]" in HF-04 section
      3. Count occurrences of "- [ ]" in HF-04 section
    Expected Result: 7 checked, 0 unchecked
    Failure Indicators: Any unchecked box, wrong section modified
    Evidence: .sisyphus/evidence/task-4-story-map.txt
  ```

  **Commit**: YES
  - Message: `docs(story-map): mark HF-04 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: None

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `npx vitest run tests/worker-tools/hostfully/`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty property, invalid property ID, missing env vars.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Order | Message                                                                | Files                                                                                             | Pre-commit                                                                       |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1     | `feat(hostfully): add get-messages shell tool for guest conversations` | `src/worker-tools/hostfully/get-messages.ts`, `tests/worker-tools/hostfully/get-messages.test.ts` | `pnpm build && npx vitest run tests/worker-tools/hostfully/get-messages.test.ts` |
| 2     | `build(docker): add get-reservations and get-messages to worker image` | `Dockerfile`                                                                                      | `docker build -t ai-employee-worker:latest .`                                    |
| 3     | `docs(story-map): mark HF-04 acceptance criteria complete`             | `docs/2026-04-21-2202-phase1-story-map.md`                                                        | None                                                                             |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                                          # Expected: exit 0
npx vitest run tests/worker-tools/hostfully/         # Expected: all pass (31 existing + ~12 new)
docker build -t ai-employee-worker:latest .          # Expected: exit 0
docker run --rm --entrypoint node ai-employee-worker:latest /tools/hostfully/get-messages.js --help  # Expected: exit 0, usage text
grep -c '\[x\]' docs/2026-04-21-2202-phase1-story-map.md  # Expected: increased count
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (existing + new)
- [ ] Docker image builds and contains get-messages.js
- [ ] Live API returns real data for VLRE test property
- [ ] Story map ACs marked `[x]`
