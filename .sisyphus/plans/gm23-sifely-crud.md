# GM-23: Sifely Lock — Full CRUD for Passcodes

## TL;DR

> **Quick Summary**: Extend the existing `sifely-client.ts` shell tool with 4 new actions (list-locks, create-passcode, update-passcode, delete-passcode) to enable programmatic smart lock passcode management, then validate against the live VLRE Sifely account.
>
> **Deliverables**:
>
> - Extended `sifely-client.ts` with 4 CRUD mutation actions
> - Updated `--help` output listing all 6 actions
> - Comprehensive unit tests (7 new test cases)
> - Live VLRE API validation (list-locks + create/verify/delete cycle)
> - GM-23 acceptance criteria marked complete in story map
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (implementation) → T2 (unit tests) → T3 (live validation) → T4 (story map update)

---

## Context

### Original Request

Implement GM-23 from the Phase 1 story map: extend `sifely-client.ts` with full CRUD for passcodes (list-locks, create, update, delete). Test thoroughly via automated tests and live API calls. Mark story map acceptance criteria complete.

### Interview Summary

**Key Discussions**:

- This extends GM-15's read-only Sifely client with mutation endpoints
- No new files or DB tables — in-place extension of existing shell tool
- Tests follow the established pattern (real http.Server + subprocess invocation)
- Live VLRE validation required as final verification

**Research Findings**:

- TTLock API mutations use POST with form-urlencoded body (reads use GET + query params)
- Mutations require gateway mode (`addType=2`/`changeType=2`/`deleteType=2`) for server-side use
- `keyboardPwdType` is NOT a param on `/add` — type is inferred from startDate/endDate
- Sifely wrapper uses `code` field (not TTLock's `errcode`) — mutations may follow same pattern
- Current `--lock-id` validation is unconditional — must become conditional for `list-locks`

### Metis Review

**Identified Gaps** (addressed):

- **Pagination for list-locks**: Use pageSize=1000 (VLRE has ~50 locks max) — no multi-page needed
- **`--type` flag semantics**: Maps to startDate/endDate defaults, not a direct API param
- **Mutation response shape on Sifely wrapper**: Unknown until tested — plan includes discovery step
- **Duplicate name check adds latency**: Acceptable (one extra API call per create)

---

## Work Objectives

### Core Objective

Give the platform full programmatic control over Sifely smart lock passcodes — create, update, and delete — enabling future automation of guest access provisioning.

### Concrete Deliverables

- `src/worker-tools/locks/sifely-client.ts` — 4 new `--action` values with full CLI interface
- `tests/worker-tools/locks/sifely-client.test.ts` — 7+ new test cases covering all new actions
- `docs/planning/2026-04-21-2202-phase1-story-map.md` — GM-23 acceptance criteria all checked

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes with no new failures
- [ ] `tsx src/worker-tools/locks/sifely-client.ts --help` shows all 6 actions
- [ ] Live VLRE: `list-locks` returns all physical locks
- [ ] Live VLRE: create-then-delete cycle succeeds on a test lock

### Must Have

- All 4 new actions (list-locks, create-passcode, update-passcode, delete-passcode)
- Gateway mode (`*Type=2`) on all mutations
- `create-passcode` duplicate-name guard (check existing before creating)
- `create-passcode` code format validation (4-9 numeric digits)
- Passcode values never in stderr/logs
- Reuse existing `login()` helper
- Updated `--help` with all 6 actions + new flags + examples

### Must NOT Have (Guardrails)

- ❌ New shell tool files — extend `sifely-client.ts` in-place
- ❌ New database tables or Prisma migrations
- ❌ `console.log()` or `console.error()` — only `process.stdout.write` / `process.stderr.write`
- ❌ Passcode values (`keyboardPwd`, `--code`) in any stderr output or log
- ❌ Token caching between invocations — authenticate fresh each time
- ❌ Pagination logic for list-locks — single page with pageSize=1000 is sufficient
- ❌ Changes to `diagnose-access.ts` or `hostfully-door-code.ts`
- ❌ Changes to Dockerfile (tool already COPYed from GM-15)
- ❌ External dependencies (no npm packages added)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest, existing sifely-client.test.ts)
- **Automated tests**: YES (tests after implementation)
- **Framework**: vitest
- **Pattern**: Real http.Server mock + subprocess invocation via `execFile('npx', ['tsx', SCRIPT_PATH, ...args])`

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — Run command, validate stdout JSON, check exit codes
- **Unit tests**: Use Bash — `pnpm test -- --run tests/worker-tools/locks/sifely-client.test.ts`
- **Live API**: Use Bash — Run tool with real VLRE credentials, validate JSON output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — implementation + unit tests):
├── Task 1: Extend sifely-client.ts with 4 CRUD actions [deep]
└── Task 2: Add unit tests for all new actions [unspecified-high]

Wave 2 (After Wave 1 — validation + finalization):
├── Task 3: Live VLRE API validation [unspecified-high]
└── Task 4: Mark story map complete + build/test verification [quick]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — run tool against mock + live (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T2 → T3 → T4 → F1-F4 → user okay
Parallel Speedup: T1 and T2 can overlap (T2 uses mock server, doesn't need T1's mutations to be "correct" against real API)
Max Concurrent: 2
```

### Dependency Matrix

| Task  | Depends On | Blocks     | Wave  |
| ----- | ---------- | ---------- | ----- |
| T1    | —          | T2, T3, T4 | 1     |
| T2    | T1         | T3         | 1     |
| T3    | T1, T2     | T4         | 2     |
| T4    | T3         | F1-F4      | 2     |
| F1-F4 | T4         | —          | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `deep`, T2 → `unspecified-high`
- **Wave 2**: 2 tasks — T3 → `unspecified-high`, T4 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Extend sifely-client.ts with 4 CRUD Actions

  **What to do**:
  - Add new CLI flags to `parseArgs()`: `--name <string>`, `--code <string>`, `--passcode-id <id>`, `--type <permanent|timed>`
  - Extend `parseArgs()` return type with: `name: string`, `code: string`, `passcodeId: string`, `type: string`
  - Make the existing `--lock-id` validation conditional: required for all actions EXCEPT `list-locks`
  - Add 4 new async functions following existing patterns:
    - `listLocks(baseUrl, token)` — `GET /v3/lock/list` with query params (clientId, accessToken, pageNo=1, pageSize=1000, date)
    - `createPasscode(baseUrl, token, lockId, code, name, startDate, endDate)` — `POST /v3/keyboardPwd/add` with form-urlencoded body (clientId, accessToken, lockId, keyboardPwd, keyboardPwdName, startDate, endDate, addType=2, date)
    - `updatePasscode(baseUrl, token, lockId, passcodeId, name?, startDate?, endDate?)` — `POST /v3/keyboardPwd/change` with form-urlencoded body (clientId, accessToken, lockId, keyboardPwdId, keyboardPwdName?, startDate?, endDate?, changeType=2, date)
    - `deletePasscode(baseUrl, token, lockId, passcodeId)` — `POST /v3/keyboardPwd/delete` with form-urlencoded body (clientId, accessToken, lockId, keyboardPwdId, deleteType=2, date)
  - Add 4 new `else if` branches in `main()` dispatch:
    - `list-locks`: call `listLocks()`, output JSON array
    - `create-passcode`: validate `--code` (4-9 numeric digits, exit 1 if invalid), call `listPasscodes()` to check for existing passcode with same `--name`, if found return `{ keyboardPwdId, existed: true }`, else call `createPasscode()`, output `{ keyboardPwdId }`
    - `update-passcode`: require `--passcode-id`, call `updatePasscode()`, output `{ ok: true }`
    - `delete-passcode`: require `--passcode-id`, call `deletePasscode()`, output `{ ok: true }`
  - Handle `--type` flag for `create-passcode`:
    - `permanent` (default): startDate = Date.now(), endDate = 0 (TTLock permanent convention)
    - `timed`: require `--start-date` and `--end-date`, error if missing
  - Update `--help` text to list all 6 actions with their flags and examples
  - Update the `else` (unknown action) error message to list all 6 valid actions
  - Error handling for mutations: check `response.ok` first (HTTP level), then check `body.code !== undefined` or `body.errcode !== undefined` for API errors (Sifely wrapper may use either — handle both defensively)
  - Security: NEVER include `--code` value or `keyboardPwd` in any stderr output

  **Must NOT do**:
  - Do NOT add `console.log()` or `console.error()` — only `process.stdout.write` / `process.stderr.write`
  - Do NOT create new files
  - Do NOT cache tokens between invocations
  - Do NOT add npm dependencies
  - Do NOT log passcode values to stderr

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Single-file extension with complex API integration, multiple code paths, defensive error handling, and security constraints. Needs careful attention to patterns.
  - **Skills**: []
    - No specialized skills needed — this is pure TypeScript CLI work
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — commit handled separately

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential — T2 depends on T1)
  - **Blocks**: T2, T3, T4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/worker-tools/locks/sifely-client.ts:71-113` — `parseArgs()` manual for-loop, return type object. Add new flags using same `else if (args[i] === '--name' && args[i + 1])` pattern
  - `src/worker-tools/locks/sifely-client.ts:102-137` — `login()` function. Reuse exactly as-is, call from `main()` same way
  - `src/worker-tools/locks/sifely-client.ts:139-179` — `listPasscodes()` function. Follow same URL construction, header pattern, error checking for the new list-locks function
  - `src/worker-tools/locks/sifely-client.ts:228-321` — `main()` dispatch. Add `else if` branches before the final `else`. Follow same env var reading, validation, login, then action execution pattern

  **API/Type References** (contracts to implement against):
  - TTLock API: `GET /v3/lock/list` — params: clientId, accessToken, pageNo, pageSize, date. Response: `{ list: [{lockId, lockName, lockAlias, lockMac, electricQuantity, hasGateway, ...}] }`
  - TTLock API: `POST /v3/keyboardPwd/add` — form body: clientId, accessToken, lockId, keyboardPwd, keyboardPwdName, startDate, endDate, addType=2, date. Response: `{ keyboardPwdId: number }` on success, `{ code: <non-0>, msg }` on error
  - TTLock API: `POST /v3/keyboardPwd/change` — form body: clientId, accessToken, lockId, keyboardPwdId, keyboardPwdName, startDate, endDate, changeType=2, date. Response: `{ errcode: 0 }` on success
  - TTLock API: `POST /v3/keyboardPwd/delete` — form body: clientId, accessToken, lockId, keyboardPwdId, deleteType=2, date. Response: `{ errcode: 0 }` on success

  **External References**:
  - Sifely base URL: `https://app-smart-server.sifely.com` (env var `SIFELY_BASE_URL`)
  - TTLock docs: `https://euopen.ttlock.com/doc/api/v3/keyboardPwd/add`
  - CRITICAL: Sifely's API wrapper may use `code` (like login/list) instead of `errcode` (raw TTLock). Handle BOTH defensively: `if (body.code !== undefined && body.code !== 200) || (body.errcode !== undefined && body.errcode !== 0)`

  **WHY Each Reference Matters**:
  - `parseArgs()` reference: Must add new flags in identical style (else-if chain, `args[++i]` consumption)
  - `login()` reference: Ensures auth reuse, no duplication
  - `listPasscodes()` reference: The duplicate-name check in `create-passcode` calls this existing function — understand its return shape
  - `main()` reference: Critical for understanding the conditional `--lock-id` validation that must be refactored

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: --help shows all 6 actions
    Tool: Bash
    Preconditions: File exists at src/worker-tools/locks/sifely-client.ts
    Steps:
      1. Run: npx tsx src/worker-tools/locks/sifely-client.ts --help
      2. Assert stdout contains "list-locks"
      3. Assert stdout contains "create-passcode"
      4. Assert stdout contains "update-passcode"
      5. Assert stdout contains "delete-passcode"
      6. Assert stdout contains "--name"
      7. Assert stdout contains "--code"
      8. Assert stdout contains "--passcode-id"
      9. Assert stdout contains "--type"
      10. Assert exit code = 0
    Expected Result: Help text lists all 6 actions with correct flags
    Evidence: .sisyphus/evidence/task-1-help-output.txt

  Scenario: create-passcode rejects non-numeric code
    Tool: Bash
    Preconditions: SIFELY_USERNAME, SIFELY_PASSWORD set (can be dummy — validation happens before API call)
    Steps:
      1. Run: npx tsx src/worker-tools/locks/sifely-client.ts --action create-passcode --lock-id 123 --name test --code abc123
      2. Assert exit code = 1
      3. Assert stderr contains "numeric" or "4-9 digits"
    Expected Result: Exits 1 with clear error about code format
    Evidence: .sisyphus/evidence/task-1-invalid-code.txt

  Scenario: create-passcode rejects code with wrong length
    Tool: Bash
    Preconditions: Same as above
    Steps:
      1. Run: npx tsx src/worker-tools/locks/sifely-client.ts --action create-passcode --lock-id 123 --name test --code 12
      2. Assert exit code = 1
      3. Assert stderr contains "4-9 digits"
    Expected Result: Exits 1 — code too short (2 digits)
    Evidence: .sisyphus/evidence/task-1-short-code.txt

  Scenario: list-locks does NOT require --lock-id
    Tool: Bash
    Preconditions: SIFELY_* env vars set to dummy values, no network needed for validation check
    Steps:
      1. Run: npx tsx src/worker-tools/locks/sifely-client.ts --action list-locks (without --lock-id)
      2. Assert exit code != 1 due to "lock-id required" error (may fail on network — that's fine, just not a validation error)
    Expected Result: Does NOT exit with "lock-id is required" error
    Evidence: .sisyphus/evidence/task-1-list-locks-no-lockid.txt
  ```

  **Commit**: YES
  - Message: `feat(worker-tools): add CRUD actions to Sifely shell tool`
  - Files: `src/worker-tools/locks/sifely-client.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Add Unit Tests for All New Actions

  **What to do**:
  - Extend `tests/worker-tools/locks/sifely-client.test.ts` with 7+ new test cases
  - Add new route handlers to the existing `http.createServer` mock:
    - `GET /v3/lock/list` → return mock locks array
    - `POST /v3/keyboardPwd/add` → return `{ keyboardPwdId: 99999 }` (or error based on input)
    - `POST /v3/keyboardPwd/change` → return `{ errcode: 0 }` (or `{ code: 200 }` — match actual Sifely response)
    - `POST /v3/keyboardPwd/delete` → return `{ errcode: 0 }` (or `{ code: 200 }`)
  - Add mock data constants at top of file matching existing style
  - Test cases to add:
    1. `list-locks returns JSON array with lockId, lockName, lockAlias fields`
    2. `create-passcode returns keyboardPwdId on success`
    3. `create-passcode returns existed=true when name already exists` (mock listPasscodes to return a match)
    4. `create-passcode exits 1 with invalid code format (non-numeric)`
    5. `create-passcode exits 1 with invalid code length (< 4 or > 9 digits)`
    6. `update-passcode returns ok=true on success`
    7. `delete-passcode returns ok=true on success`
    8. `exits 1 on Sifely API error during mutation (HTTP 200 with error code in body)`
  - Each test follows existing pattern: `it('description', async () => { ... }, 15000)` with subprocess invocation
  - For the duplicate-name test: the mock server's `/v3/lock/listKeyboardPwd` handler must return a passcode with matching name

  **Must NOT do**:
  - Do NOT use `vi.fn()` or `vi.mock()` — use real http.Server
  - Do NOT add new test files — extend existing one
  - Do NOT include real Sifely credentials in test data
  - Do NOT use `console.log` in test assertions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test writing with subprocess invocation and HTTP mocking — established pattern but needs careful implementation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Commit handled separately

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs T1 complete — tests import the modified file)
  - **Parallel Group**: Wave 1 (sequential after T1)
  - **Blocks**: T3, T4
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `tests/worker-tools/locks/sifely-client.test.ts:1-191` — FULL existing test file. Follow EXACTLY: http.createServer pattern, BASE_ENV, execFile invocation, stdout parsing, exit code checking
  - `tests/worker-tools/locks/sifely-client.test.ts:20-60` — Mock server setup in `beforeAll()`. Add new route handlers here for `/v3/lock/list`, `/v3/keyboardPwd/add`, `/v3/keyboardPwd/change`, `/v3/keyboardPwd/delete`
  - `tests/worker-tools/locks/sifely-client.test.ts:62-90` — First test case pattern: how args are constructed, how env is passed, how stdout is parsed

  **WHY Each Reference Matters**:
  - Full test file: The ONLY way to understand the subprocess+mock-server pattern. Cannot write tests without reading this.
  - Mock server setup: Must extend (not replace) existing handlers for login + list-passcodes + access-records
  - First test pattern: Template for all new tests — arg construction, env injection, result parsing

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/worker-tools/locks/sifely-client.test.ts` → all tests pass
  - [ ] At least 7 new test cases added (one per acceptance criterion from story)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: T1 implementation complete
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/locks/sifely-client.test.ts
      2. Assert exit code = 0
      3. Assert output shows 14+ tests passing (7 existing + 7+ new)
      4. Assert 0 test failures
    Expected Result: All tests green, 14+ pass count
    Evidence: .sisyphus/evidence/task-2-test-results.txt

  Scenario: Tests cover error paths
    Tool: Bash
    Preconditions: Test file includes error-path tests
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/locks/sifely-client.test.ts
      2. Grep output for "invalid code" test name — assert present
      3. Grep output for "API error" test name — assert present
      4. Grep output for "duplicate" or "existed" test name — assert present
    Expected Result: Error-path tests exist and pass
    Evidence: .sisyphus/evidence/task-2-error-tests.txt
  ```

  **Commit**: YES
  - Message: `test(locks): add unit tests for Sifely CRUD actions`
  - Files: `tests/worker-tools/locks/sifely-client.test.ts`
  - Pre-commit: `pnpm test -- --run tests/worker-tools/locks/sifely-client.test.ts`

- [x] 3. Live VLRE API Validation

  **What to do**:
  - Run `list-locks` against live VLRE Sifely account — verify all known physical locks are returned
  - Run `create-passcode` on a non-guest-facing lock (e.g., a lock used for maintenance or testing) with a test passcode
  - Run `list-passcodes` on the same lock — verify the newly created passcode appears
  - Run `delete-passcode` to remove the test passcode
  - Run `list-passcodes` again — verify the passcode is gone
  - Save all command outputs as evidence files
  - Note: SIFELY_USERNAME, SIFELY_PASSWORD, and SIFELY_CLIENT_ID must be available as env vars (from `.env` or tenant_secrets)
  - If any mutation returns an unexpected response shape (e.g., `errcode` vs `code`), document the actual shape in evidence and fix the code if needed

  **Must NOT do**:
  - Do NOT create passcodes on locks actively used by guests
  - Do NOT leave test passcodes on any lock after validation (always clean up)
  - Do NOT commit Sifely credentials to any file

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Live API interaction requires careful credential handling and cleanup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs T1 and T2 complete)
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: T4
  - **Blocked By**: T1, T2

  **References**:

  **Pattern References**:
  - `.env` — contains SIFELY_USERNAME, SIFELY_PASSWORD, SIFELY_CLIENT_ID for VLRE
  - `src/worker-tools/locks/sifely-client.ts` — the tool under test (the implementation from T1)

  **WHY Each Reference Matters**:
  - `.env`: Source of live credentials needed for validation
  - Implementation: Must understand the exact CLI interface to invoke correctly

  **Acceptance Criteria**:
  - [ ] `list-locks` returns valid JSON with at least 1 lock containing `lockId` and `lockName`
  - [ ] `create-passcode` returns `{ keyboardPwdId: <number> }` for a test passcode
  - [ ] `list-passcodes` shows the created passcode by ID
  - [ ] `delete-passcode` returns `{ ok: true }`
  - [ ] `list-passcodes` after delete no longer shows the test passcode
  - [ ] No test passcodes remain on any lock after validation

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full CRUD lifecycle on live VLRE Sifely
    Tool: Bash
    Preconditions: SIFELY_USERNAME, SIFELY_PASSWORD, SIFELY_CLIENT_ID env vars set from .env
    Steps:
      1. Run: npx tsx src/worker-tools/locks/sifely-client.ts --action list-locks
      2. Assert exit code = 0
      3. Parse JSON output — assert array length > 0
      4. Pick first lockId from list
      5. Run: npx tsx src/worker-tools/locks/sifely-client.ts --action create-passcode --lock-id <lockId> --name "test-gm23-validation" --code 987654 --type permanent
      6. Assert exit code = 0
      7. Parse JSON — extract keyboardPwdId
      8. Run: npx tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id <lockId>
      9. Assert output contains a passcode with name "test-gm23-validation"
      10. Run: npx tsx src/worker-tools/locks/sifely-client.ts --action delete-passcode --lock-id <lockId> --passcode-id <keyboardPwdId>
      11. Assert exit code = 0
      12. Run: npx tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id <lockId>
      13. Assert output does NOT contain "test-gm23-validation"
    Expected Result: Full create → verify → delete → verify-gone cycle succeeds
    Failure Indicators: Non-zero exit code, JSON parse failure, passcode not found after create, passcode still present after delete
    Evidence: .sisyphus/evidence/task-3-live-crud-cycle.txt

  Scenario: Duplicate name guard works on live API
    Tool: Bash
    Preconditions: Same as above
    Steps:
      1. Create passcode: --name "test-gm23-dup" --code 123456 --lock-id <lockId>
      2. Create again with SAME name but different code: --name "test-gm23-dup" --code 654321
      3. Assert second call returns { existed: true, keyboardPwdId: <same-id> }
      4. Delete the passcode to clean up
    Expected Result: Second create returns existing ID instead of creating duplicate
    Evidence: .sisyphus/evidence/task-3-duplicate-guard.txt
  ```

  **Commit**: NO (validation only — no code changes)

- [x] 4. Mark Story Map Complete + Final Build Verification

  **What to do**:
  - Run `pnpm build` — verify exit 0
  - Run `pnpm test -- --run` — verify no new test failures vs baseline (385 pass, 34 pre-existing failures)
  - Mark ALL GM-23 acceptance criteria as `[x]` in `docs/planning/2026-04-21-2202-phase1-story-map.md`
  - Send Telegram notification: "✅ gm23-sifely-crud complete — All tasks done."

  **Must NOT do**:
  - Do NOT mark any criteria that haven't been verified
  - Do NOT modify any source code in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple verification + checkbox update — no complex logic
  - **Skills**: [`git-master`]
    - `git-master`: For clean commit of story map update

  **Parallelization**:
  - **Can Run In Parallel**: NO (final task)
  - **Parallel Group**: Wave 2 (after T3)
  - **Blocks**: F1-F4
  - **Blocked By**: T3

  **References**:

  **Pattern References**:
  - `docs/planning/2026-04-21-2202-phase1-story-map.md:980-987` — GM-23 acceptance criteria checkboxes (lines from the story map with `- [ ]` items)

  **WHY Each Reference Matters**:
  - Story map: Exact location of checkboxes to mark `[x]`

  **Acceptance Criteria**:
  - [ ] `pnpm build` exits 0
  - [ ] `pnpm test -- --run` shows no new failures
  - [ ] All GM-23 checkboxes in story map are `[x]`
  - [ ] Telegram notification sent

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build and tests pass
    Tool: Bash
    Preconditions: T1-T3 complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code = 0
      3. Run: pnpm test -- --run
      4. Count failures — assert <= 34 (pre-existing baseline)
    Expected Result: Build clean, no new test failures
    Evidence: .sisyphus/evidence/task-4-build-test.txt

  Scenario: Story map checkboxes all marked
    Tool: Bash (grep)
    Preconditions: Story map file updated
    Steps:
      1. grep "GM-23" in story map file — find the section
      2. Count "- [ ]" lines in GM-23 section — assert 0
      3. Count "- [x]" lines in GM-23 section — assert >= 9
    Expected Result: All acceptance criteria marked complete
    Evidence: .sisyphus/evidence/task-4-story-map.txt
  ```

  **Commit**: YES
  - Message: `docs(planning): mark GM-23 complete in story map`
  - Files: `docs/planning/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (run command, read file). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review `src/worker-tools/locks/sifely-client.ts` for: `console.log`, passcode values in stderr, `as any`, empty catches, dead code. Verify all new code follows existing patterns (process.stdout.write, process.stderr.write, process.exit).
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Code Review [N issues] | VERDICT`

- [x] F3. **Real QA** — `unspecified-high`
      Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Run `--help`, run each action against mock server (via unit tests), verify live VLRE validation evidence exists. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. No new files created, no Dockerfile changes, no DB migrations.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Type                 | Scope                                  | Files                                               | Pre-commit           |
| ------ | -------------------- | -------------------------------------- | --------------------------------------------------- | -------------------- |
| 1      | `feat(worker-tools)` | add CRUD actions to Sifely shell tool  | `src/worker-tools/locks/sifely-client.ts`           | `pnpm build`         |
| 2      | `test(locks)`        | add unit tests for Sifely CRUD actions | `tests/worker-tools/locks/sifely-client.test.ts`    | `pnpm test -- --run` |
| 3      | `docs(planning)`     | mark GM-23 complete in story map       | `docs/planning/2026-04-21-2202-phase1-story-map.md` | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                                    # Expected: exit 0
pnpm test -- --run                            # Expected: no new failures
tsx src/worker-tools/locks/sifely-client.ts --help  # Expected: shows 6 actions

# Live validation (requires VLRE Sifely credentials)
SIFELY_USERNAME=... SIFELY_PASSWORD=... SIFELY_CLIENT_ID=... \
  tsx src/worker-tools/locks/sifely-client.ts --action list-locks
# Expected: JSON with locks array containing VLRE physical locks
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Story map GM-23 criteria all checked
- [ ] Live VLRE validation passed
