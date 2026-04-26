# HF-05: Send Message Shell Tool

## TL;DR

> **Quick Summary**: Build a shell tool that sends messages to guests via Hostfully's unified inbox, with comprehensive automated tests and live VLRE verification. Port from proven standalone MVP implementation.
>
> **Deliverables**:
>
> - `src/worker-tools/hostfully/send-message.ts` — shell tool
> - `tests/worker-tools/hostfully/send-message.test.ts` — automated tests
> - Live VLRE verification evidence
> - Story map checkboxes updated
>
> **Estimated Effort**: Quick (S-complexity, hours to 1 day)
> **Parallel Execution**: NO — sequential (4 tasks, each depends on previous)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Final Verification

---

## Context

### Original Request

Build HF-05: Send Message Shell Tool from the Phase 1 story map (`docs/2026-04-21-2202-phase1-story-map.md`). Include thorough automated tests, live API verification on VLRE, and update the story map to mark HF-05 acceptance criteria as complete.

### Interview Summary

**Key Discussions**:

- Test strategy: Tests-after (not TDD), using Vitest with subprocess + mock server pattern matching existing tools
- Live VLRE test: Approved — use test resources from AGENTS.md (Lead UID: `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`, Thread UID: `2f18249a-9523-4acd-a512-20ff06d5c3fa`)
- The standalone MVP at `/Users/victordozal/repos/real-estate/vlre-employee` has a proven `sendMessage()` implementation

**Research Findings**:

- **Existing tool patterns**: Zero imports, manual arg parsing (for-loop, no libraries), native `fetch`, `process.stdout.write(JSON.stringify(...) + '\n')`, `process.stderr.write(...)` for errors, `process.exit(1)` on failure
- **MVP API contract (proven)**: `POST /messages` with `{ type: "DIRECT_MESSAGE", threadUid, leadUid, content: { text } }`. No retry — fires once (irreversible). Error handling: 429/401/403/400/204
- **Test patterns**: Subprocess via `execFile` + `npx tsx`, raw `http.createServer` mock (no nock/msw), `capturedRequests` array for POST body verification, `baseEnv()` helper, mutable `serverStatus`
- **API docs**: v3.2 endpoint, either `leadUid` or `threadUid` sufficient, `DIRECT_MESSAGE` routes to Airbnb/VRBO/Booking.com automatically

### Metis Review

**Identified Gaps** (addressed):

- Output contract must match transformed API response, not raw Hostfully response → Output transforms `uid` → `messageId`, `createdUtcDateTime` → `timestamp`
- `HOSTFULLY_API_KEY` env var injection verified — HF-01 is complete, `loadTenantEnv()` already wires it
- Exit code contract specified — follow existing tools: exit 0 success, exit 1 failure, errors to stderr
- `--thread-id` optionality — make optional since API docs say either UID is sufficient, but MVP sends both
- Duplicate message risk documented as known limitation (no retry by design)
- Unicode/emoji, long messages, multi-line text — let API handle, don't validate locally

---

## Work Objectives

### Core Objective

Create a shell tool that sends messages to guests via the Hostfully unified inbox API, matching the exact pattern of existing Hostfully tools, with comprehensive automated tests and live verification.

### Concrete Deliverables

- `src/worker-tools/hostfully/send-message.ts` — fully functional shell tool
- `tests/worker-tools/hostfully/send-message.test.ts` — comprehensive Vitest test suite
- Evidence files proving live VLRE test succeeded
- Updated story map with HF-05 checkboxes marked complete

### Definition of Done

- [ ] `pnpm test -- --run` passes (all existing tests + new send-message tests)
- [ ] `pnpm build` exits 0
- [ ] Live VLRE test succeeds with exit code 0 and valid JSON output
- [ ] All HF-05 checkboxes in story map marked `[x]`

### Must Have

- Zero imports — Node.js built-ins only (process, fetch)
- Manual arg parsing (for-loop pattern matching existing tools)
- `--help` flag with comprehensive documentation and irreversibility warning
- JSON output to stdout on success: `{"sent": true, "messageId": "...", "timestamp": "..."}`
- Non-zero exit code + stderr text on any failure
- No retry logic (irreversible operation — by design)
- `type: "DIRECT_MESSAGE"` in all API requests
- `content: { text }` format (proven in production MVP, NOT `content: { body }`)

### Must NOT Have (Guardrails)

- MUST NOT add retry or backoff logic — sending a message to a guest is irreversible
- MUST NOT extract a shared Hostfully client abstraction — inline all HTTP logic
- MUST NOT add `--dry-run`, `--property-id`, or any CLI flag beyond `--lead-id`, `--thread-id`, `--message`, `--help`
- MUST NOT touch `loadTenantEnv()`, lifecycle files, or archetype `instructions`
- MUST NOT create barrel files (`index.ts`) or shared utilities
- MUST NOT add per-status-code error branching beyond what existing tools do (single `!res.ok` check)
- MUST NOT use `content: { body }` — only `content: { text }` (production-proven)
- MUST NOT add rate limiting or throttling logic
- MUST NOT import any npm packages or Node.js modules (match zero-import pattern)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest
- **If TDD**: N/A — tests-after approach

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell Tool**: Use Bash — Run tool with args, assert exit code + stdout/stderr content
- **Tests**: Use Bash — Run `pnpm test -- --run` and assert pass count
- **Live API**: Use Bash — Run tool with real `HOSTFULLY_API_KEY`, assert exit 0 + valid JSON

---

## Execution Strategy

### Parallel Execution Waves

> Sequential for this S-complexity task. Each task depends on the previous.

```
Wave 1 (Start Immediately):
└── Task 1: Implement send-message.ts shell tool [quick]

Wave 2 (After Wave 1):
└── Task 2: Write automated tests send-message.test.ts [quick]

Wave 3 (After Wave 2):
└── Task 3: Run test suite + live VLRE verification [quick]

Wave 4 (After Wave 3):
└── Task 4: Update story map + notify completion [quick]

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
| 1     | —          | 2, 3, 4 | 1     |
| 2     | 1          | 3       | 2     |
| 3     | 2          | 4       | 3     |
| 4     | 3          | F1-F4   | 4     |
| F1-F4 | 4          | —       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 1 task — T2 → `quick`
- **Wave 3**: 1 task — T3 → `quick`
- **Wave 4**: 1 task — T4 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Implement `send-message.ts` Shell Tool

  **What to do**:
  - Create `src/worker-tools/hostfully/send-message.ts` following the exact pattern of existing Hostfully tools
  - Add a top-level JSDoc block documenting: the Hostfully message domain model (Lead → Thread → Messages), the POST /messages endpoint, sender type AGENCY, and an **irreversibility warning** explaining that messages sent through this tool cannot be recalled or deleted
  - Implement manual CLI arg parsing (for-loop pattern, no libraries):
    - `--lead-id <uid>` (required) — the Hostfully lead/reservation UID, maps to `leadUid` in request body
    - `--thread-id <uid>` (optional) — the Hostfully thread UID, maps to `threadUid` in request body
    - `--message <text>` (required) — the message text to send to the guest
    - `--help` — shows usage, all options with descriptions, output shape, env vars, and irreversibility warning
  - Read `HOSTFULLY_API_KEY` from `process.env['HOSTFULLY_API_KEY']` (bracket notation)
  - Read base URL from `process.env['HOSTFULLY_API_URL'] ?? 'https://api.hostfully.com/api/v3.2'`
  - Make a single `POST` request to `${baseUrl}/messages` with:
    - Headers: `{ 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json', 'Content-Type': 'application/json' }`
    - Body: `{ type: "DIRECT_MESSAGE", leadUid, threadUid (if provided), content: { text: message } }`
  - On success (2xx): transform response to `{ sent: true, messageId: json.uid ?? null, timestamp: json.createdUtcDateTime ?? json.createdAt ?? null }` and write to stdout
  - On failure (!res.ok): write descriptive error to stderr including the HTTP status code, then `process.exit(1)`
  - Wrap in `main().catch(err => { process.stderr.write('Fatal: ' + String(err)); process.exit(1); })` pattern
  - **No retry logic** — this is a write operation. Retrying could send duplicate messages to real guests.

  **Must NOT do**:
  - DO NOT import any modules (zero-import pattern)
  - DO NOT add retry, backoff, or rate limiting logic
  - DO NOT use `content: { body }` — only `content: { text }` (production-proven format)
  - DO NOT use `console.log` — only `process.stdout.write` and `process.stderr.write`
  - DO NOT add `--dry-run`, `--property-id`, or any flag not listed above
  - DO NOT extract shared utilities or create a Hostfully client class

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation following a well-documented pattern. No complex logic or multi-file coordination.
  - **Skills**: `[]`
    - No special skills needed — straightforward file creation matching existing patterns.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/worker-tools/hostfully/get-messages.ts` — **PRIMARY PATTERN REFERENCE**. Copy the exact structure: JSDoc block, type declarations, `parseArgs()` function, env reads, `main()` with `.catch()`. This is the most recent and most complex Hostfully tool — it demonstrates the canonical pattern.
  - `src/worker-tools/hostfully/get-reservations.ts` — Secondary pattern reference. Shows the same arg parsing, env reading, and error handling. Simpler but confirms the pattern.
  - `src/worker-tools/hostfully/get-property.ts` — Shows how `Content-Type` is set for requests and the warning pattern for non-fatal errors (NOT needed for send-message, but shows the contrast).

  **API/Type References** (contracts to implement against):
  - Standalone MVP `skills/hostfully-client/client.ts:276-301` at `/Users/victordozal/repos/real-estate/vlre-employee` — The **proven `sendMessage()` implementation**. Shows exact request body shape: `{ type: "DIRECT_MESSAGE", threadUid, leadUid, content: { text } }`. Shows no-retry pattern (`requestOnce` not `withRetry`). Shows error handling for 429/401/403/400/204.
  - Standalone MVP `skills/hostfully-client/types.ts` at `/Users/victordozal/repos/real-estate/vlre-employee` — TypeScript types: `HostfullySendMessageRequest` and `HostfullySendMessageResponse`. Shows exact field names and shapes.

  **External References**:
  - Hostfully API docs: `https://dev.hostfully.com/reference/createmessage` — POST /messages endpoint documentation. Note: docs suggest `content.body` but MVP uses `content.text` which is proven in production — use `content.text`.
  - Hostfully API v3.2 messaging update: `https://dev.hostfully.com/reference/v32-messaging-updates` — Thread-per-reservation model documentation.

  **WHY Each Reference Matters**:
  - `get-messages.ts`: Copy the file structure verbatim (JSDoc → types → parseArgs → main → catch). This ensures the tool is pattern-identical to all other Hostfully tools.
  - MVP `client.ts:276-301`: The exact API contract — request body shape, no-retry behavior, error handling. This code has been running in production against real guests. Do NOT deviate from it.
  - MVP `types.ts`: The TypeScript types tell you exactly what Hostfully returns. Use these to define your `RawCreatedMessage` type.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — --help flag shows usage and exits 0
    Tool: Bash
    Preconditions: None (no env vars needed for --help)
    Steps:
      1. Run: `npx tsx src/worker-tools/hostfully/send-message.ts --help`
      2. Assert exit code is 0
      3. Assert stdout contains "--lead-id"
      4. Assert stdout contains "--thread-id"
      5. Assert stdout contains "--message"
      6. Assert stdout contains "HOSTFULLY_API_KEY"
      7. Assert stdout contains "irreversible" or "cannot be recalled" (irreversibility warning)
    Expected Result: Exit 0, all flag names and env vars documented, irreversibility warning present
    Failure Indicators: Non-zero exit, missing flag documentation, no irreversibility mention
    Evidence: .sisyphus/evidence/task-1-help-flag.txt

  Scenario: Missing --lead-id exits 1 with error to stderr
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY=testkey in env
    Steps:
      1. Run: `HOSTFULLY_API_KEY=testkey npx tsx src/worker-tools/hostfully/send-message.ts --message "hello"`
      2. Assert exit code is 1
      3. Assert stderr contains "--lead-id" (tells user what's missing)
    Expected Result: Exit 1, stderr mentions the missing flag
    Failure Indicators: Exit 0, or error doesn't mention the missing flag name
    Evidence: .sisyphus/evidence/task-1-missing-lead-id.txt

  Scenario: Missing --message exits 1 with error to stderr
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY=testkey in env
    Steps:
      1. Run: `HOSTFULLY_API_KEY=testkey npx tsx src/worker-tools/hostfully/send-message.ts --lead-id abc-123`
      2. Assert exit code is 1
      3. Assert stderr contains "--message" (tells user what's missing)
    Expected Result: Exit 1, stderr mentions the missing flag
    Failure Indicators: Exit 0, or error doesn't mention the flag name
    Evidence: .sisyphus/evidence/task-1-missing-message.txt

  Scenario: Missing HOSTFULLY_API_KEY exits 1 with error to stderr
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY NOT set in env
    Steps:
      1. Run: `npx tsx src/worker-tools/hostfully/send-message.ts --lead-id abc --message "hello"` (without HOSTFULLY_API_KEY)
      2. Assert exit code is 1
      3. Assert stderr contains "HOSTFULLY_API_KEY"
    Expected Result: Exit 1, stderr mentions the missing env var
    Failure Indicators: Exit 0, or error doesn't mention env var name
    Evidence: .sisyphus/evidence/task-1-missing-api-key.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-1-{scenario-slug}.txt
  - [ ] Terminal output for each scenario

  **Commit**: YES
  - Message: `feat(hostfully): add send-message shell tool`
  - Files: `src/worker-tools/hostfully/send-message.ts`
  - Pre-commit: `pnpm build`

---

- [x] 2. Write Automated Tests for `send-message.ts`

  **What to do**:
  - Create `tests/worker-tools/hostfully/send-message.test.ts` following the exact pattern of existing Hostfully tool tests
  - Use subprocess invocation: `execFile('npx', ['tsx', SCRIPT_PATH, ...args], { env: { ...process.env, ...env } }, callback)` wrapped in a `runScript()` helper
  - Set up a mock HTTP server using raw `http.createServer` (no nock, no msw) on a random port (`server.listen(0)`)
  - Use `capturedRequests` array to capture POST request bodies (via `req.on('data')` + `req.on('end')`) for verifying the tool sends the correct payload
  - Use `baseEnv()` helper returning `{ HOSTFULLY_API_KEY: 'testkey', HOSTFULLY_API_URL: \`http://localhost:\${port}\` }`
  - Use mutable `serverStatus` variable (reset in `beforeEach`) for error simulation
  - Cover these test scenarios:
    1. **Happy path**: exits 0, stdout JSON has `{ sent: true, messageId: "test-uid", timestamp: "..." }`
    2. **Verifies POST body shape**: `capturedRequests[0].body` matches `{ type: "DIRECT_MESSAGE", leadUid: "...", content: { text: "..." } }`
    3. **Includes threadUid when --thread-id provided**: POST body includes `threadUid` field
    4. **Omits threadUid when --thread-id NOT provided**: POST body does NOT include `threadUid`
    5. **Missing --lead-id**: exits 1, stderr contains "--lead-id"
    6. **Missing --message**: exits 1, stderr contains "--message"
    7. **Missing HOSTFULLY_API_KEY**: exits 1, stderr contains "HOSTFULLY_API_KEY"
    8. **API returns 500**: exits 1, stderr.length > 0
    9. **API returns 400**: exits 1, stderr contains "400"
    10. **API returns 401**: exits 1, stderr mentions auth or 401
    11. **--help flag**: exits 0, stdout contains all flag names and "HOSTFULLY_API_KEY"
  - The mock server should:
    - On `POST /messages` with `serverStatus === 201`: respond with `{ uid: "test-uid", leadUid: "...", createdUtcDateTime: "2026-04-23T00:00:00Z", senderType: "AGENCY" }`
    - On any other status: respond with `{ error: "server error" }`
    - Capture request method, path, and parsed JSON body into `capturedRequests`

  **Must NOT do**:
  - DO NOT use nock, msw, or any mock library — use raw `http.createServer`
  - DO NOT import the tool directly — always invoke as subprocess via `execFile` + `npx tsx`
  - DO NOT extract the mock server into a shared utility
  - DO NOT add tests for scenarios not listed above (scope control)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single test file creation following well-documented patterns. The test structure is identical to 5 existing tool test files.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `tests/worker-tools/hostfully/get-messages.test.ts` — **PRIMARY TEST PATTERN REFERENCE**. Shows: `runScript()` helper, `http.createServer` mock, `beforeAll`/`afterAll` lifecycle, `describe`/`it` structure, all standard scenarios (happy path, missing args, API errors, --help). Copy this structure.
  - `tests/worker-tools/hostfully/get-reservations.test.ts` — Secondary test pattern. Shows mutable `serverStatus` for error simulation and `beforeEach` reset.
  - `tests/worker-tools/platform/report-issue.test.ts` — **POST BODY CAPTURE PATTERN**. Shows `capturedRequests` array, `req.on('data')` body parsing, `baseEnv()` helper. Copy this pattern for verifying the POST request body the tool sends to Hostfully.
  - `tests/worker-tools/hostfully/get-property.test.ts` — Shows `requestPaths` capture for verifying which API endpoints were called.

  **API/Type References**:
  - The `send-message.ts` tool created in Task 1 — read the actual implementation to understand exact arg names and output shape.

  **WHY Each Reference Matters**:
  - `get-messages.test.ts`: The canonical test structure. Every test scenario, import, and helper follows this pattern exactly. Do not deviate.
  - `report-issue.test.ts`: The only existing test that captures POST request bodies. The `capturedRequests` pattern is essential for verifying `send-message` sends the correct payload.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All automated tests pass
    Tool: Bash
    Preconditions: Task 1 complete (send-message.ts exists)
    Steps:
      1. Run: `pnpm test -- --run tests/worker-tools/hostfully/send-message.test.ts`
      2. Assert exit code is 0
      3. Assert output shows all tests passing (0 failures)
      4. Count test cases — expect at least 11 tests (matching the 11 scenarios listed above)
    Expected Result: All 11+ tests pass, 0 failures
    Failure Indicators: Any test failure, fewer than 11 tests, non-zero exit code
    Evidence: .sisyphus/evidence/task-2-test-results.txt

  Scenario: Full test suite still passes (no regressions)
    Tool: Bash
    Preconditions: Task 1 and new test file both complete
    Steps:
      1. Run: `pnpm test -- --run`
      2. Assert exit code is 0
      3. Assert no new test failures beyond pre-existing ones (container-boot.test.ts, inngest-serve.test.ts)
    Expected Result: All tests pass except pre-existing failures
    Failure Indicators: New test failures not in the pre-existing list
    Evidence: .sisyphus/evidence/task-2-full-suite.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-test-results.txt — output of running send-message tests
  - [ ] task-2-full-suite.txt — output of full test suite

  **Commit**: YES
  - Message: `test(hostfully): add send-message automated tests`
  - Files: `tests/worker-tools/hostfully/send-message.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 3. Live VLRE Verification

  **What to do**:
  - Retrieve the VLRE tenant's `HOSTFULLY_API_KEY` from the database: query `tenant_secrets` where `tenant_id = '00000000-0000-0000-0000-000000000003'` and `key = 'hostfully_api_key'`. The value is AES-256-GCM encrypted — use the `ENCRYPTION_KEY` from `.env` to decrypt, or read it from the environment if available. Alternatively, check if there is a script or admin API endpoint to retrieve decrypted secrets.
  - If the API key cannot be retrieved programmatically, check if `HOSTFULLY_API_KEY` is set in the current environment (`.env` file).
  - Run the send-message tool with real credentials against the VLRE test resources:
    ```bash
    HOSTFULLY_API_KEY=$VLRE_API_KEY npx tsx src/worker-tools/hostfully/send-message.ts \
      --lead-id "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb" \
      --thread-id "2f18249a-9523-4acd-a512-20ff06d5c3fa" \
      --message "Automated verification test from ai-employee platform — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    ```
  - Verify: exit code 0, stdout parses as valid JSON, `.sent === true`, `.messageId` is a non-empty string
  - Save the full stdout + stderr + exit code as evidence
  - **IMPORTANT**: This sends a real message to the Hostfully inbox. The test resources (Lead UID `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`) are designated test resources from AGENTS.md. This is expected and approved.

  **Must NOT do**:
  - DO NOT send to any lead/thread other than the designated test resources
  - DO NOT run multiple times unnecessarily — one successful send is sufficient evidence
  - DO NOT modify the tool based on live test results (that would be a separate task)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single verification step — run a command, capture output, verify JSON.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - AGENTS.md `## Hostfully Testing` section — Lists all test resource UIDs: Thread UID `2f18249a-9523-4acd-a512-20ff06d5c3fa`, Lead UID `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`, Property UID `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`

  **API/Type References**:
  - `.env` file — May contain `HOSTFULLY_API_KEY` for local development
  - `src/lib/encryption.ts` — AES-256-GCM encryption/decryption utilities if needed to decrypt tenant secret from DB

  **WHY Each Reference Matters**:
  - AGENTS.md test resources: These are the ONLY safe UIDs to test with. Using any other UID risks sending messages to real guests.
  - `.env`: Fastest path to getting the API key if it's already configured locally.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Live send-message succeeds with real Hostfully API
    Tool: Bash
    Preconditions: Valid HOSTFULLY_API_KEY for VLRE tenant available
    Steps:
      1. Obtain HOSTFULLY_API_KEY (from .env or tenant_secrets)
      2. Run: HOSTFULLY_API_KEY=$KEY npx tsx src/worker-tools/hostfully/send-message.ts --lead-id "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb" --thread-id "2f18249a-9523-4acd-a512-20ff06d5c3fa" --message "Automated verification test — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      3. Assert exit code is 0
      4. Parse stdout as JSON
      5. Assert .sent === true
      6. Assert .messageId is a non-empty string (proves API returned a real ID)
      7. Assert .timestamp is a non-empty string
    Expected Result: Exit 0, valid JSON with sent=true and real messageId/timestamp
    Failure Indicators: Non-zero exit, JSON parse error, sent=false, empty messageId
    Evidence: .sisyphus/evidence/task-3-live-vlre-send.txt

  Scenario: Verify no error output on successful live send
    Tool: Bash
    Preconditions: Same as above
    Steps:
      1. Capture stderr from the live send command
      2. Assert stderr is empty (no warnings or errors)
    Expected Result: stderr is empty
    Failure Indicators: Any content in stderr
    Evidence: .sisyphus/evidence/task-3-live-vlre-stderr.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-live-vlre-send.txt — full stdout from live send
  - [ ] task-3-live-vlre-stderr.txt — stderr from live send (should be empty)

  **Commit**: YES
  - Message: `chore: live VLRE send-message verification evidence`
  - Files: `.sisyphus/evidence/task-3-*`
  - Pre-commit: —

---

- [x] 4. Update Story Map and Final Checks

  **What to do**:
  - Open `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the HF-05 section (around line 355-375)
  - Update each acceptance criteria checkbox from `- [ ]` to `- [x]`:
    - `- [x] \`src/worker-tools/hostfully/send-message.ts\` exists`
    - `- [x] Usage: \`tsx /tools/hostfully/send-message.ts --reservation-id "<id>" --message "<text>"\``— NOTE: the actual CLI uses`--lead-id`and`--thread-id`(matching Hostfully domain naming), not`--reservation-id`. Update the usage example text to match the actual implementation: `tsx /tools/hostfully/send-message.ts --lead-id "<uid>" --message "<text>" [--thread-id "<uid>"]`
    - `- [x] Output: JSON with \`{"sent": true, "messageId": "...", "timestamp": "..."}\` on success`
    - `- [x] Non-zero exit code on failure with descriptive error (e.g., reservation not found, API rate limit)`
    - `- [x] Compiled into Docker image at \`/tools/hostfully/send-message.js\``— Update text to`.ts`(tsx runtime per PLAT-01):`Available in Docker image at \`/tools/hostfully/send-message.ts\` (tsx runtime)`
    - `- [x] **Manual test on VLRE**: Send a test message to a test reservation and confirm it appears in Hostfully inbox`
    - `- [x] Script includes documentation comments explaining the send-message API semantics, irreversibility warning, and \`--help\` describes each option's behavior so an AI agent can use the tool without reading source code`
  - Run `pnpm build` to verify no regressions
  - Run `pnpm test -- --run` one final time to verify all tests pass

  **Must NOT do**:
  - DO NOT modify any other section of the story map
  - DO NOT check off acceptance criteria for other stories (HF-06, GM-01, etc.)
  - DO NOT modify any source code files in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple markdown edit + verification commands. No code changes.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:355-375` — The HF-05 section with checkboxes to update. Look for the `#### HF-05: Send Message Shell Tool` heading and the `**Acceptance Criteria:**` section below it.
  - Same file, lines 33-41 — Shell Tool Convention section confirming `.ts` Docker paths (PLAT-01 migration complete).

  **WHY Each Reference Matters**:
  - Story map HF-05 section: These are the exact checkboxes to update. The line numbers may shift if earlier sections were modified — search for `HF-05` heading to find the right location.
  - Shell Tool Convention: Confirms the `.ts` path is correct for Docker references (not `.js`).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All HF-05 checkboxes are marked complete
    Tool: Bash (grep)
    Preconditions: Story map file exists
    Steps:
      1. Run: grep -c "\- \[x\]" on the HF-05 section of docs/2026-04-21-2202-phase1-story-map.md
      2. Count checked boxes in the HF-05 acceptance criteria section
      3. Assert all 7 checkboxes are `[x]` (none remain `[ ]`)
    Expected Result: 7 checkboxes marked [x], 0 remaining [ ] in HF-05 section
    Failure Indicators: Any unchecked box in HF-05, or checked boxes in wrong sections
    Evidence: .sisyphus/evidence/task-4-story-map-checkboxes.txt

  Scenario: Build and tests still pass after story map update
    Tool: Bash
    Preconditions: All previous tasks complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Run: pnpm test -- --run
      4. Assert exit code 0 (excluding pre-existing failures)
    Expected Result: Build and tests pass
    Failure Indicators: Build failure, new test failures
    Evidence: .sisyphus/evidence/task-4-final-build-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-story-map-checkboxes.txt — grep output showing all HF-05 checkboxes checked
  - [ ] task-4-final-build-test.txt — build + test output

  **Commit**: YES
  - Message: `docs: mark HF-05 send-message as complete in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

- [x] 5. **Notify completion** — Send Telegram notification: plan `hf05-send-message` complete, all tasks done, come back to review results.

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "✅ hf05-send-message complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Blocked By**: Task 4

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review `src/worker-tools/hostfully/send-message.ts` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports, deviations from existing tool patterns. Check AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test the `--help` flag, missing args, missing env vars, mock API errors, and the live VLRE send. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Commit Message                                           | Files                                               | Pre-commit Check     |
| ---------- | -------------------------------------------------------- | --------------------------------------------------- | -------------------- |
| 1          | `feat(hostfully): add send-message shell tool`           | `src/worker-tools/hostfully/send-message.ts`        | `pnpm build`         |
| 2          | `test(hostfully): add send-message automated tests`      | `tests/worker-tools/hostfully/send-message.test.ts` | `pnpm test -- --run` |
| 3          | `chore: live VLRE send-message verification evidence`    | `.sisyphus/evidence/task-3-*`                       | —                    |
| 4          | `docs: mark HF-05 send-message as complete in story map` | `docs/2026-04-21-2202-phase1-story-map.md`          | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exits 0
pnpm test -- --run            # Expected: all pass (including new send-message tests)
npx tsx src/worker-tools/hostfully/send-message.ts --help  # Expected: exits 0, shows help text
```

### Final Checklist

- [ ] All "Must Have" present (zero imports, manual arg parsing, --help, JSON output, no retry, DIRECT_MESSAGE, content.text)
- [ ] All "Must NOT Have" absent (no retry, no shared client, no extra flags, no lifecycle changes)
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Live VLRE test exits 0 with valid JSON
- [ ] Story map HF-05 checkboxes all `[x]`
