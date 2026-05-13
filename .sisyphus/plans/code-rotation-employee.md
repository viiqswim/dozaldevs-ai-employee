# Code Rotation AI Employee

## TL;DR

> **Quick Summary**: Build a new AI employee that rotates Sifely smart lock passcodes for all VLRE properties on manual trigger, replacing the vlre-hub rotation engine with direct tool-based orchestration.
>
> **Deliverables**:
>
> - New `code-rotation` archetype seeded in the database (system prompt + instructions)
> - New shell tool: `generate-code.ts` — memorable code generation (mirror/rhythm patterns, blacklisting, weak-code rejection)
> - New shell tool: `update-door-code.ts` — writes door_code back to Hostfully custom data
> - Tests for both new shell tools
> - AGENTS.md + README.md documentation updates
> - Docker image rebuild
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (generate-code.ts) → Task 5 (archetype seed) → Task 8 (E2E validation)

---

## Context

### Original Request

Build an AI employee that performs lock code rotation for all VLRE properties. Currently handled by vlre-hub's NestJS `CodeRotationService` with a daily cron + manual web UI. The new employee replaces that engine entirely — the LLM orchestrates using shell tools directly with no vlre-hub dependency.

### Interview Summary

**Key Discussions**:

- **Architecture**: Replace vlre-hub entirely — AI employee uses Sifely/Hostfully tools directly
- **Trigger**: Manual only — `POST /admin/tenants/:id/employees/code-rotation/trigger` (existing admin API, zero new code)
- **Approval**: Fully automated — `approval_required: false`, no PM approval needed
- **Notifications**: Always post Slack summary after rotation (success and failure)
- **Scope**: Lock codes only — no WiFi passwords or gate codes
- **Code generation**: Replicate the memorable pattern logic exactly (mirror ABBA, rhythm ABAB, 4-6 digits, blacklisting, weak-code rejection)
- **Portfolio**: 50+ rooms — large enough to need batching consideration

**Critical Domain Model**:

- **Property = Room** — not a whole house
- **Locks are SHARED** across properties — e.g., a front door lock serves all rooms in a house
- **Passcode naming convention**: `permanent-visitor-{propertyType}[-{roomNumber}]`
  - HOME → `permanent-visitor-home`
  - ROOM → `permanent-visitor-room-N` (N from last segment of property name)
  - BUNDLE/MULTI_HOME → `permanent-visitor-bundle`
  - Custom override via `passcode_name` field on `property_locks` row
- **Rotation is name-scoped**: When rotating Room 1, only the passcode named `permanent-visitor-room-1` is touched — other rooms' passcodes are untouched on the same shared lock

**Research Findings**:

- All Sifely lock operations already exist in `sifely-client.ts` (list, create, update, delete passcodes)
- The `property_locks` table is already built and seeded with real VLRE data (lines 3561–4018 of seed.ts)
- `diagnose-access.ts` already has `deriveExpectedPasscodeName()` ported
- `hostfully-door-code.ts` already reads door codes from Hostfully custom data — needs a WRITE counterpart
- The Sifely API has a quirk: HTTP 200 on auth failure — must check `body.code`
- The memorable code generation logic is ~278 lines in vlre-hub (`code-generator.util.ts`) — needs to be ported as a standalone shell tool

### Metis Review

**Identified Gaps** (addressed):

- **Concurrency for 50+ rooms**: Instructions must tell the LLM to process properties sequentially to avoid Sifely rate limits — batch processing is handled by the LLM's sequential tool calls, not parallel
- **Hostfully custom data write API**: Requires first reading custom data to get the `uid` of the `door_code` field, then PUT to update it — not a simple single-call operation
- **Error reporting granularity**: Slack notification should include per-property status (success/failed/skipped) for operational visibility
- **Hostfully-first ordering**: Update Hostfully door code BEFORE touching locks — PMS always stays ahead of physical state
- **Update in-place**: Use `update-passcode` to change existing codes rather than delete+create — simpler, avoids momentary gap
- **Existing passcode cleanup**: Must handle duplicate passcodes (keep newest, delete extras) before rotation — this is a known edge case from vlre-hub

---

## Work Objectives

### Core Objective

Add a `code-rotation` AI employee that, when manually triggered, rotates the Sifely lock passcodes for ALL VLRE properties using memorable code patterns, updates Hostfully with the new codes, and posts a Slack summary.

### Concrete Deliverables

- `src/worker-tools/locks/generate-code.ts` — shell tool for memorable code generation
- `src/worker-tools/locks/update-door-code.ts` — shell tool to write door_code to Hostfully custom data
- `prisma/seed.ts` — new archetype upsert block for `code-rotation` (with system_prompt + instructions)
- `tests/worker-tools/generate-code.test.ts` — unit tests for code generation
- `tests/worker-tools/update-door-code.test.ts` — unit tests for door code update
- Updated `AGENTS.md` and `README.md`

### Definition of Done

- [ ] `pnpm test -- --run` passes with new tests included
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] Docker image builds: `docker build -t ai-employee-worker:latest .`
- [ ] Manual trigger via admin API creates a task and the lifecycle completes to `Done`

### Must Have

- Memorable code generation with mirror (ABBA) and rhythm (ABAB) patterns, 4-6 digits
- Weak-code rejection (all-same, sequential, static blacklist)
- Shared-lock isolation — only rotate the passcode matching the property's expected name
- Passcode naming convention: `permanent-visitor-{type}[-{roomNumber}]` with custom override support
- Rotation sequence: UPDATE Hostfully first → UPDATE existing passcode in-place → VERIFY (CREATE only if no passcode exists yet)
- Hostfully door_code sync BEFORE lock updates (PMS always ahead of physical lock)
- Slack notification with per-property results (success/failed/skipped)
- All properties for the tenant rotated in a single run

### Must NOT Have (Guardrails)

- No scheduled trigger (cron) — manual trigger only for now
- No event-driven trigger (webhook) — manual only
- No PM approval gate — `approval_required: false`
- No vlre-hub dependency — the AI employee uses tools directly
- No WiFi password rotation — lock codes only
- No modifications to the universal lifecycle (`employee-lifecycle.ts`)
- No modifications to existing shell tools — only NEW files
- No new Inngest function files — trigger via existing admin API route
- No employee-specific language in shared files (per AGENTS.md convention)
- **TESTING RESTRICTION**: ALL E2E and manual testing MUST use ONLY the designated test property (Hostfully UID: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`, Sifely lock ID: `24572672`). Do NOT touch any other property or lock until the process is fully verified.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (via `pnpm test`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash (node/tsx REPL) — Import, call functions, compare output
- **Archetype**: Use Bash (curl) — Trigger via admin API, check task status, verify Slack notification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — new shell tools, independent of each other):
├── Task 1: generate-code.ts shell tool [unspecified-high]
├── Task 2: update-door-code.ts shell tool [unspecified-high]
└── Task 3: Tests for generate-code.ts [unspecified-high]

Wave 2 (After Wave 1 — archetype + tests that depend on tools):
├── Task 4: Tests for update-door-code.ts [unspecified-high]
├── Task 5: Archetype seed entry (system_prompt + instructions) [deep]
└── Task 6: Documentation updates (AGENTS.md + README.md) [writing]

Wave 3 (After Wave 2 — integration):
├── Task 7: Docker image rebuild + seed DB [quick]
└── Task 8: E2E validation — manual trigger, verify full rotation [deep]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 7 → Task 8 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 3, 5   | 1    |
| 2    | —          | 4, 5   | 1    |
| 3    | 1          | —      | 1    |
| 4    | 2          | —      | 2    |
| 5    | 1, 2       | 7      | 2    |
| 6    | —          | —      | 2    |
| 7    | 5          | 8      | 3    |
| 8    | 7          | F1-F4  | 3    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `unspecified-high`, T2 → `unspecified-high`, T3 → `unspecified-high`
- **Wave 2**: 3 tasks — T4 → `unspecified-high`, T5 → `deep`, T6 → `writing`
- **Wave 3**: 2 tasks — T7 → `quick`, T8 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Memorable Code Generation Shell Tool (`generate-code.ts`)

  **What to do**:
  - Port the memorable code generation logic from vlre-hub's `code-generator.util.ts` into a standalone shell tool at `src/worker-tools/locks/generate-code.ts`
  - Implement the exact same patterns: mirror (ABBA/ABCBA/ABCCBA) and rhythm (ABAB/ABABA/ABABAB/ABCABC)
  - Support code lengths 4, 5, and 6 digits (randomly chosen if not specified)
  - Include weak-code rejection: all-same digits, strict sequential runs (ascending/descending), static blacklist
  - Support `--exclude-codes` flag for rotation (skip recently used codes)
  - Output JSON to stdout: `{"code": "1221", "pattern": "mirror", "length": 4, "description": "12, 21 — first two digits, then reversed"}`
  - Include the `describeCode()` function for human-readable pattern descriptions
  - Follow the shell tool checklist: `parseArgs()`, `--help`, env var validation, JSON stdout, stderr errors, non-zero exit on failure

  **CLI Interface**:

  ```
  tsx generate-code.ts [--length 4|5|6] [--exclude-codes "1221,2332,4554"] [--help]
  ```

  **Must NOT do**:
  - Do not add any external dependencies — pure TypeScript, no npm packages
  - Do not modify existing shell tools
  - Do not deviate from the mirror/rhythm patterns defined in vlre-hub

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Algorithmic port requiring precision — not visual, not trivial
  - **Skills**: []
    - No special skills needed — straightforward TypeScript implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `vlre-hub: apps/api/src/code-rotation/utils/code-generator.util.ts` (full file, 278 lines) — THE source of truth. Port this logic exactly. Contains: `generateMemorableCode()`, `isWeakCode()`, `isValidCode()`, `describeCode()`, all mirror/rhythm generators, `STATIC_WEAK_CODES` set, `GENERATORS` dispatch map.
  - `vlre-hub: apps/api/src/code-rotation/utils/__tests__/code-generator.test.ts` — Test cases from vlre-hub that validate the logic. Use these as a reference for what to test.

  **Shell Tool Pattern References**:
  - `src/worker-tools/locks/hostfully-door-code.ts` — Follow this exact script structure: `parseArgs()` → `--help` handler → arg validation → env var validation → work → JSON stdout
  - `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` — Shell tool onboarding checklist (naming, structure, output format)

  **WHY Each Reference Matters**:
  - `code-generator.util.ts` is the authoritative implementation — the port must produce identical code distributions and reject the same weak codes
  - `hostfully-door-code.ts` shows the exact script structure expected by the OpenCode harness

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Generate a valid memorable code with default options
    Tool: Bash (node/tsx)
    Preconditions: generate-code.ts exists at src/worker-tools/locks/
    Steps:
      1. Run: tsx src/worker-tools/locks/generate-code.ts
      2. Parse stdout as JSON
      3. Assert: output has fields "code", "pattern", "length", "description"
      4. Assert: code is 4, 5, or 6 digits (all numeric)
      5. Assert: pattern is "mirror" or "rhythm"
      6. Assert: length equals code.length
    Expected Result: Valid JSON with a memorable code
    Failure Indicators: Non-zero exit code, non-JSON output, missing fields
    Evidence: .sisyphus/evidence/task-1-default-generation.txt

  Scenario: Generate with specific length
    Tool: Bash (tsx)
    Preconditions: generate-code.ts exists
    Steps:
      1. Run: tsx src/worker-tools/locks/generate-code.ts --length 4
      2. Parse stdout as JSON
      3. Assert: code is exactly 4 digits
      4. Run again with --length 5, assert 5 digits
      5. Run again with --length 6, assert 6 digits
    Expected Result: Code length matches the requested length
    Evidence: .sisyphus/evidence/task-1-specific-length.txt

  Scenario: Exclude codes are respected
    Tool: Bash (tsx)
    Preconditions: generate-code.ts exists
    Steps:
      1. Generate 50 codes with --exclude-codes "1221,2332" (loop in bash)
      2. Assert: none of the 50 codes are "1221" or "2332"
    Expected Result: Excluded codes never appear in output
    Evidence: .sisyphus/evidence/task-1-exclude-codes.txt

  Scenario: Weak codes are never generated
    Tool: Bash (tsx)
    Preconditions: generate-code.ts exists
    Steps:
      1. Generate 200 codes (loop in bash), collect all
      2. Assert: none are all-same digits (1111, 2222, etc.)
      3. Assert: none are sequential (1234, 4321, 12345, etc.)
      4. Assert: none are in the static blacklist
    Expected Result: Zero weak codes in 200 generations
    Evidence: .sisyphus/evidence/task-1-no-weak-codes.txt

  Scenario: --help flag works
    Tool: Bash (tsx)
    Preconditions: generate-code.ts exists
    Steps:
      1. Run: tsx src/worker-tools/locks/generate-code.ts --help
      2. Assert: exit code is 0
      3. Assert: stdout contains "Usage"
    Expected Result: Help text displayed, clean exit
    Evidence: .sisyphus/evidence/task-1-help.txt
  ```

  **Commit**: YES
  - Message: `feat(locks): add memorable code generation shell tool`
  - Files: `src/worker-tools/locks/generate-code.ts`
  - Pre-commit: `pnpm lint`

- [x] 2. Hostfully Door Code Update Shell Tool (`update-door-code.ts`)

  **What to do**:
  - Create `src/worker-tools/locks/update-door-code.ts` — writes a new door_code value to a Hostfully property's custom data
  - The Hostfully custom data API is a two-step process:
    1. `GET /api/v3.2/custom-data?propertyUid={uid}` — fetch all custom data entries to find the `uid` of the `door_code` field
    2. `PUT /api/v3.2/custom-data/{entryUid}` — update the text value with the new code
  - If the `door_code` custom data field does not exist, log a warning to stderr and exit with a specific exit code (e.g., exit 2) so the caller can distinguish "field not found" from other errors
  - Output JSON: `{"success": true, "propertyId": "...", "previousCode": "1234", "newCode": "5678"}` or `{"success": false, "error": "..."}`
  - Follow the shell tool checklist exactly

  **CLI Interface**:

  ```
  tsx update-door-code.ts --property-id <hostfully-property-uid> --code <new-door-code> [--help]
  ```

  **Must NOT do**:
  - Do not modify `hostfully-door-code.ts` (the read-only counterpart)
  - Do not add external dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API integration requiring correct HTTP method and envelope handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/locks/hostfully-door-code.ts` (full file, 105 lines) — The READ counterpart. Copy the exact structure: `parseArgs()`, Hostfully API headers (`X-HOSTFULLY-APIKEY`), custom data response parsing (`CustomDataEntry[]`), `door_code` field lookup. The new tool adds the WRITE step after the read.
  - `vlre-hub: apps/api/src/code-rotation/code-rotation.service.ts` — Search for `updateHostfullyDoorCode` or `custom-data` to see how vlre-hub writes back to Hostfully. The exact PUT endpoint and payload shape.

  **API References**:
  - Hostfully custom data API: `GET /api/v3.2/custom-data?propertyUid={uid}` returns `CustomDataEntry[]` where each has `{customDataField: {uid, name}, text}`. The `door_code` field's `uid` is needed for the PUT call.
  - Hostfully update: `PUT /api/v3.2/custom-data/{entryUid}` with body `{"text": "<newCode>"}` and header `X-HOSTFULLY-APIKEY`.

  **Shell Tool Checklist**:
  - `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` — naming, structure, output format, mock fixture pattern

  **WHY Each Reference Matters**:
  - `hostfully-door-code.ts` is the exact counterpart — same API, same headers, same response parsing. Copy its structure.
  - The vlre-hub code shows the proven PUT endpoint and payload shape for Hostfully custom data updates.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Successfully update door code (requires real Hostfully API key)
    Tool: Bash (tsx)
    Preconditions: HOSTFULLY_API_KEY is set, property UID is valid
    Steps:
      1. Read current door code: tsx src/worker-tools/locks/hostfully-door-code.ts --property-id "$PROPERTY_UID"
      2. Generate a new code: tsx src/worker-tools/locks/generate-code.ts
      3. Update: tsx src/worker-tools/locks/update-door-code.ts --property-id "$PROPERTY_UID" --code "$NEW_CODE"
      4. Parse stdout as JSON
      5. Assert: output has "success": true
      6. Verify: read door code again, assert it matches the new code
    Expected Result: Door code updated in Hostfully, round-trip verified
    Failure Indicators: Non-zero exit, "success": false, or door code unchanged
    Evidence: .sisyphus/evidence/task-2-update-door-code.txt

  Scenario: Missing --property-id flag
    Tool: Bash (tsx)
    Preconditions: None
    Steps:
      1. Run: tsx src/worker-tools/locks/update-door-code.ts --code "1234"
      2. Assert: exit code is non-zero
      3. Assert: stderr contains "property-id" or "required"
    Expected Result: Graceful error with clear message
    Evidence: .sisyphus/evidence/task-2-missing-property-id.txt

  Scenario: Missing HOSTFULLY_API_KEY env var
    Tool: Bash (tsx)
    Preconditions: Unset HOSTFULLY_API_KEY
    Steps:
      1. Run: HOSTFULLY_API_KEY="" tsx src/worker-tools/locks/update-door-code.ts --property-id "test" --code "1234"
      2. Assert: exit code is non-zero
      3. Assert: stderr contains "HOSTFULLY_API_KEY"
    Expected Result: Clear error about missing env var
    Evidence: .sisyphus/evidence/task-2-missing-api-key.txt

  Scenario: --help flag works
    Tool: Bash (tsx)
    Steps:
      1. Run: tsx src/worker-tools/locks/update-door-code.ts --help
      2. Assert: exit code 0, stdout contains "Usage"
    Expected Result: Help text displayed
    Evidence: .sisyphus/evidence/task-2-help.txt
  ```

  **Commit**: YES
  - Message: `feat(locks): add Hostfully door code update shell tool`
  - Files: `src/worker-tools/locks/update-door-code.ts`
  - Pre-commit: `pnpm lint`

- [x] 3. Unit Tests for `generate-code.ts`

  **What to do**:
  - Create `tests/worker-tools/generate-code.test.ts` with comprehensive unit tests
  - Test all patterns: mirror-4 (ABBA), mirror-5 (ABCBA), mirror-6 (ABCCBA), rhythm-4 (ABAB), rhythm-5 (ABABA), rhythm-6 (ABABAB and ABCABC)
  - Test weak-code rejection: all-same digits, sequential ascending/descending, static blacklist entries
  - Test `--exclude-codes` flag: excluded codes never appear
  - Test edge cases: max attempts exceeded (when all possible codes are excluded), invalid `--length` values
  - Test `describeCode()` output for each pattern type
  - Import the functions directly from the tool file (not via CLI) for unit testing — the tool should export its pure functions alongside the CLI entrypoint

  **Must NOT do**:
  - Do not test via CLI execution (slow, fragile) — test pure functions directly
  - Do not mock randomness — test statistical properties instead (e.g., "in 200 generations, no weak codes")

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test writing requiring understanding of the code generation algorithm
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2) — but depends on Task 1 completing first for imports
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:

  **Test References**:
  - `vlre-hub: apps/api/src/code-rotation/utils/__tests__/code-generator.test.ts` — The existing test suite from vlre-hub. Port relevant test cases.
  - `tests/worker-tools/` — Check for existing test file patterns in the ai-employee repo to follow conventions (describe blocks, assertion style, file naming)

  **Pattern References**:
  - `src/worker-tools/locks/generate-code.ts` (Task 1 output) — The functions to test

  **WHY Each Reference Matters**:
  - vlre-hub tests define the expected behavior contract — if vlre-hub tests pass for a code, our port should too
  - Existing test patterns ensure consistency with the project's testing conventions

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/worker-tools/generate-code.test.ts` passes
  - [ ] Tests cover: all 7 pattern generators, weak-code rejection, exclude-codes, describeCode()

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/generate-code.test.ts
      2. Assert: exit code 0
      3. Assert: output shows all tests passing, zero failures
    Expected Result: All generate-code tests pass
    Evidence: .sisyphus/evidence/task-3-test-results.txt

  Scenario: Test coverage is comprehensive
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/generate-code.test.ts
      2. Count the number of test cases
      3. Assert: at least 10 test cases covering patterns, weak codes, exclusions, and descriptions
    Expected Result: Comprehensive test suite with broad coverage
    Evidence: .sisyphus/evidence/task-3-test-count.txt
  ```

  **Commit**: YES
  - Message: `test(locks): add generate-code unit tests`
  - Files: `tests/worker-tools/generate-code.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Unit Tests for `update-door-code.ts`

  **What to do**:
  - Create `tests/worker-tools/update-door-code.test.ts`
  - Test the argument parsing logic: missing flags, help flag, valid inputs
  - Test the Hostfully API interaction using mocked `fetch`:
    - Successful update flow (GET custom data → find door_code uid → PUT update)
    - `door_code` field not found in custom data
    - Hostfully API returns non-200
    - Network error during fetch
  - Test the two-step API flow: first GET to find the field UID, then PUT to update

  **Must NOT do**:
  - Do not call real Hostfully API in tests — mock `fetch`
  - Do not test via CLI execution

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test writing with fetch mocking
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:

  **Test References**:
  - `tests/worker-tools/` — Existing test patterns for shell tools (if any exist)
  - `src/worker-tools/locks/update-door-code.ts` (Task 2 output) — The functions to test

  **Pattern References**:
  - `src/worker-tools/locks/hostfully-door-code.ts` — The read counterpart; test should verify the write tool handles the same response shapes

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/worker-tools/update-door-code.test.ts` passes
  - [ ] Tests cover: arg parsing, successful update, field-not-found, API errors, network errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/update-door-code.test.ts
      2. Assert: exit code 0
      3. Assert: output shows all tests passing, zero failures
    Expected Result: All update-door-code tests pass
    Evidence: .sisyphus/evidence/task-4-test-results.txt

  Scenario: Error handling tests are present
    Tool: Bash (grep)
    Steps:
      1. Search test file for error-related test descriptions (e.g., "error", "fail", "missing", "not found")
      2. Assert: at least 3 error/edge case tests exist
    Expected Result: Error paths are tested
    Evidence: .sisyphus/evidence/task-4-error-tests.txt
  ```

  **Commit**: YES
  - Message: `test(locks): add update-door-code unit tests`
  - Files: `tests/worker-tools/update-door-code.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Code-Rotation Archetype Seed Entry

  **What to do**:
  - Add a new archetype upsert block in `prisma/seed.ts` for the `code-rotation` employee
  - Archetype ID: `00000000-0000-0000-0000-000000000016`
  - Tenant: VLRE (`00000000-0000-0000-0000-000000000003`)
  - Key fields:
    - `role_name: 'code-rotation'`
    - `runtime: 'opencode'`
    - `model: 'minimax/minimax-m2.7'`
    - `deliverable_type: 'lock_code_rotation'`
    - `risk_model: { approval_required: false, timeout_hours: 2 }`
    - `notification_channel: 'C0960S2Q8RL'` (VLRE ops channel)
    - `concurrency_limit: 1` (only one rotation at a time to avoid Sifely race conditions)
  - Write a detailed `system_prompt` that defines the employee's persona and role
  - Write comprehensive `instructions` (natural language) that guide the LLM through the full rotation workflow

  **The `instructions` must cover this exact workflow**:

  STEP 1: Fetch all property-lock mappings for this tenant from PostgREST:

  ```
  GET $SUPABASE_URL/rest/v1/property_locks?tenant_id=eq.$TENANT_ID&select=*
  ```

  STEP 2: Group properties by `lock_external_id` to understand shared locks.

  STEP 3: For each unique property (by `property_external_id`):
  a. Derive the expected passcode name using the naming convention:
  - If `passcode_name` field is set → use it
  - HOME → `permanent-visitor-home`
  - ROOM → `permanent-visitor-room-{N}` (N = last numeric segment of `property_name`)
  - BUNDLE/MULTI_HOME → `permanent-visitor-bundle`
    b. Generate a new memorable code:

  ```
  tsx /tools/locks/generate-code.ts --exclude-codes "<current-codes-for-this-property>"
  ```

  c. Update Hostfully door code FIRST (before touching locks):

  ```
  tsx /tools/locks/update-door-code.ts --property-id <property_external_id> --code "<new-code>"
  ```

  - Read back Hostfully door code to verify:
    ```
    tsx /tools/locks/hostfully-door-code.ts --property-id <property_external_id>
    ```

  d. For each lock associated with this property:
  - List current passcodes:
    ```
    tsx /tools/locks/sifely-client.ts --action list-passcodes --lock-id <lock_external_id>
    ```
  - Find the passcode matching the expected name (type 2 = PERMANENT only)
  - Handle duplicates: if multiple match, note the newest (highest keyboardPwdId), delete the extras
  - UPDATE the existing passcode in-place with the new code (do NOT delete and recreate):
    ```
    tsx /tools/locks/sifely-client.ts --action update-passcode --lock-id <lock_external_id> --passcode-id <keyboardPwdId> --code "<new-code>"
    ```
  - If NO matching passcode exists (first-time setup), CREATE one:
    ```
    tsx /tools/locks/sifely-client.ts --action create-passcode --lock-id <lock_external_id> --name "<expected-name>" --code "<new-code>"
    ```
  - Verify the passcode was updated:
    ```
    tsx /tools/locks/sifely-client.ts --action list-passcodes --lock-id <lock_external_id>
    ```

  STEP 4: Build a results summary with per-property status (success/failed/skipped).

  STEP 5: Post Slack notification:

  ```
  NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "<summary>" --task-id "$TASK_ID"
  ```

  STEP 6: Write `/tmp/summary.txt` with the full results.

  **CRITICAL instructions to include**:
  - Process properties SEQUENTIALLY (not parallel) to avoid Sifely rate limits
  - Update Hostfully door code BEFORE updating locks — ensures the PMS is always ahead of the physical lock
  - UPDATE existing passcodes in-place (do NOT delete + recreate) — only CREATE if no matching passcode exists
  - On shared locks, only touch the passcode matching the expected name — leave all others untouched
  - If a lock operation fails, mark that property as FAILED and continue with the next property — do not abort the entire run
  - Use case-insensitive passcode name comparison

  **Must NOT do**:
  - Do not modify the universal lifecycle
  - Do not reference other archetypes' instructions (each archetype is self-contained)
  - Do not hardcode property UIDs or lock IDs in the instructions — they come from the DB

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex natural language instruction writing requiring deep domain understanding of the rotation workflow, shared lock model, and error handling. Must be precisely correct.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2 (instructions reference both new tools)

  **References**:

  **Pattern References** (existing archetypes to follow):
  - `prisma/seed.ts` lines 3194–3355 — The daily-summarizer and guest-messaging archetype upsert blocks. Follow the exact `prisma.archetype.upsert` pattern.
  - `prisma/seed.ts` lines 3561–4018 — The existing VLRE property-lock seed data. This is the data the instructions will query at runtime.

  **Domain References** (rotation logic):
  - `vlre-hub: apps/api/src/code-rotation/code-rotation.service.ts` — The full rotation engine. The instructions must replicate this workflow using shell tools.
  - `vlre-hub: apps/api/src/code-rotation/utils/passcode-naming.util.ts` — The authoritative passcode naming convention. Instructions must describe this convention exactly.
  - `vlre-hub: apps/api/src/code-rotation/passcode-resolution.service.ts` — How to find the correct passcode on a shared lock.

  **Tool References** (what the instructions tell the LLM to call):
  - `src/worker-tools/locks/sifely-client.ts` — CLI syntax for all 6 actions (lines 1–16 for usage docs)
  - `src/worker-tools/locks/generate-code.ts` (Task 1) — CLI syntax for code generation
  - `src/worker-tools/locks/update-door-code.ts` (Task 2) — CLI syntax for Hostfully update
  - `src/worker-tools/locks/hostfully-door-code.ts` — CLI syntax for reading current door code
  - `src/worker-tools/locks/diagnose-access.ts` lines 138–164 — The `deriveExpectedPasscodeName()` function. The instructions must describe this same logic in natural language.

  **Lifecycle References**:
  - `src/inngest/employee-lifecycle.ts` — The `approval_required: false` path (short-circuits at Submitting→Done). The archetype's `risk_model` field controls this.
  - `AGENTS.md` section "Adding a new employee" — The full checklist

  **WHY Each Reference Matters**:
  - The seed pattern must be followed exactly or Prisma will reject the upsert
  - The rotation logic in instructions must match vlre-hub's battle-tested workflow
  - Tool CLI syntax must be referenced precisely so the LLM calls tools correctly
  - `deriveExpectedPasscodeName()` is the isolation mechanism for shared locks — getting this wrong means rotating the wrong passcode

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` succeeds without errors
  - [ ] Archetype appears in DB: `SELECT role_name, model, deliverable_type FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000016'`
  - [ ] Instructions reference all 4 shell tools with correct CLI syntax
  - [ ] Instructions describe the passcode naming convention accurately
  - [ ] Instructions explicitly state sequential processing, "update in-place" approach, and "Hostfully first" ordering

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archetype seed succeeds
    Tool: Bash
    Preconditions: Docker Compose running (PostgreSQL on 54322)
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exit code 0
      3. Query DB: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name, model, deliverable_type FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000016'"
      4. Assert: row exists with role_name='code-rotation', model='minimax/minimax-m2.7'
    Expected Result: Archetype seeded successfully
    Evidence: .sisyphus/evidence/task-5-archetype-seed.txt

  Scenario: Instructions contain all required tool references
    Tool: Bash (grep)
    Steps:
      1. Read the instructions string from seed.ts
      2. Assert: contains "generate-code.ts"
      3. Assert: contains "update-door-code.ts"
      4. Assert: contains "sifely-client.ts"
      5. Assert: contains "hostfully-door-code.ts"
      6. Assert: contains "permanent-visitor-"
      7. Assert: contains "update-passcode"
      8. Assert: contains "create-passcode" (for first-time setup fallback)
    Expected Result: All tool references and naming convention present
    Evidence: .sisyphus/evidence/task-5-instruction-check.txt

  Scenario: Risk model is correct
    Tool: Bash
    Steps:
      1. Query DB: psql ... -c "SELECT risk_model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000016'"
      2. Assert: approval_required is false
      3. Assert: timeout_hours is 2
    Expected Result: Fully automated, no approval gate
    Evidence: .sisyphus/evidence/task-5-risk-model.txt
  ```

  **Commit**: YES
  - Message: `feat(archetype): add code-rotation employee for VLRE`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm lint`

- [x] 6. Documentation Updates (AGENTS.md + README.md)

  **What to do**:
  - Update `AGENTS.md`:
    - Add `code-rotation` to the active employees description (after Guest-Messaging)
    - Mention: archetype ID (`00000000-0000-0000-0000-000000000016`), tenant (VLRE), trigger (manual), approval (none), notification channel (`C0960S2Q8RL`)
    - Add the new shell tools (`generate-code.ts`, `update-door-code.ts`) to the locks tool documentation section
    - Add testing instructions (manual trigger curl command)
    - **Add a "Code-Rotation Testing" section** (near the existing "Hostfully Testing" section) with:
      - The designated test property for code-rotation testing:
        - Hostfully URL: `https://platform.hostfully.com/app/#/calendar?propertyUid=c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
        - Property UID: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
      - The designated test lock:
        - Sifely lock name: `5306-kin-Home Front (PERSONAL)`
        - Sifely lock ID: `24572672`
      - A **bold warning**: ALL E2E and manual testing of code rotation MUST use ONLY this property and lock. No other properties or locks should be touched until the process is fully verified and working as expected.
  - Update `README.md`:
    - Add `code-rotation` to the "Active employees" table
    - Add testing curl command example

  **Must NOT do**:
  - Do not modify any sections unrelated to the new employee
  - Do not add employee-specific language to shared infrastructure sections
  - Do not create new documentation files — only update existing ones

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing with precise technical content
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: None
  - **Blocked By**: None (can reference plan for content)

  **References**:

  **Pattern References**:
  - `AGENTS.md` — The existing Guest-Messaging and Summarizer sections. Follow the same format and level of detail.
  - `README.md` — The "Active employees" table and "Testing Employees Locally" section.

  **Acceptance Criteria**:
  - [ ] AGENTS.md contains a `code-rotation` section with archetype ID, trigger, approval gate, notification channel
  - [ ] README.md "Active employees" table has a `code-rotation` row
  - [ ] Manual trigger curl command is documented in both files

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md contains code-rotation documentation and test property
    Tool: Bash (grep)
    Steps:
      1. grep "code-rotation" AGENTS.md
      2. Assert: at least 3 matches (section header, archetype ID, trigger command)
      3. grep "generate-code.ts" AGENTS.md
      4. Assert: at least 1 match (new tool documented)
      5. grep "24572672" AGENTS.md
      6. Assert: at least 1 match (test lock ID documented)
      7. grep "5306-kin" AGENTS.md
      8. Assert: at least 1 match (test lock name documented)
      9. grep -i "ONLY.*this property\|MUST use ONLY\|should be touched" AGENTS.md
      10. Assert: at least 1 match (testing restriction warning present)
    Expected Result: New employee fully documented with test property and safety warning
    Evidence: .sisyphus/evidence/task-6-agents-md.txt

  Scenario: README.md active employees table updated
    Tool: Bash (grep)
    Steps:
      1. grep "Code-Rotation\|code-rotation" README.md
      2. Assert: at least 1 match in the active employees table
    Expected Result: New employee listed in README
    Evidence: .sisyphus/evidence/task-6-readme.txt
  ```

  **Commit**: YES
  - Message: `docs: add code-rotation employee to AGENTS.md and README.md`
  - Files: `AGENTS.md`, `README.md`
  - Pre-commit: —

- [x] 7. Docker Image Rebuild + DB Seed

  **What to do**:
  - Rebuild the Docker image to include the new shell tools:
    ```bash
    docker build -t ai-employee-worker:latest .
    ```
  - Re-run the database seed to create the new archetype:
    ```bash
    pnpm prisma db seed
    ```
  - Verify the new tools are accessible inside the container:
    ```bash
    docker run --rm ai-employee-worker:latest ls -la /tools/locks/
    ```

  **Must NOT do**:
  - Do not push the Docker image to a registry
  - Do not modify the Dockerfile

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple operational commands, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Task 5 (seed.ts must be updated before seeding)

  **References**:
  - `Dockerfile` — Verify the COPY pattern includes `src/worker-tools/locks/` → `/tools/locks/`

  **Acceptance Criteria**:
  - [ ] `docker build` succeeds
  - [ ] Container contains `/tools/locks/generate-code.ts` and `/tools/locks/update-door-code.ts`
  - [ ] `pnpm prisma db seed` succeeds

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds and contains new tools
    Tool: Bash
    Steps:
      1. Run: docker build -t ai-employee-worker:latest .
      2. Assert: build succeeds (exit code 0)
      3. Run: docker run --rm ai-employee-worker:latest ls /tools/locks/
      4. Assert: output contains "generate-code.ts" and "update-door-code.ts"
    Expected Result: New tools are in the Docker image
    Evidence: .sisyphus/evidence/task-7-docker-build.txt

  Scenario: DB seed creates archetype
    Tool: Bash
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exit code 0
      3. Query: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name FROM archetypes WHERE role_name = 'code-rotation'"
      4. Assert: row exists
    Expected Result: code-rotation archetype in database
    Evidence: .sisyphus/evidence/task-7-db-seed.txt
  ```

  **Commit**: NO (operational step)

- [x] 8. E2E Validation — Manual Trigger on Test Property ONLY

  **What to do**:
  - Ensure all services are running (`pnpm dev` or equivalent)
  - Provision Sifely credentials as tenant secrets for VLRE (if not already done):
    ```bash
    curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/sifely_username" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"value":"<sifely-username>"}'
    curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/sifely_password" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"value":"<sifely-password>"}'
    ```
  - **CRITICAL — Test scope restriction**: Before triggering, ensure the `property_locks` table contains ONLY the designated test property for the rotation run. The archetype instructions should be configured so the E2E test only processes:
    - **Property UID**: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
    - **Lock name**: `5306-kin-Home Front (PERSONAL)`
    - **Lock ID**: `24572672`
    - Do NOT rotate any other property's locks during this validation.
  - Trigger the code-rotation employee:
    ```bash
    curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/code-rotation/trigger" -H "Content-Type: application/json" -d '{}'
    ```
  - Monitor the task through the lifecycle: Received → Ready → Executing → Submitting → Done
  - Verify:
    1. Task reaches `Done` status (not `Failed`)
    2. Slack notification was posted to `C0960S2Q8RL` with results
    3. The test lock (`24572672`) has an updated passcode (verify via `sifely-client.ts --action list-passcodes --lock-id 24572672`)
    4. Hostfully door code was updated for the test property (verify via `hostfully-door-code.ts --property-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`)
    5. NO other locks were touched — spot-check another lock (e.g., 271-GIN front door, lock `4831824`) to confirm its passcodes are unchanged

  **Must NOT do**:
  - Do NOT test against any property or lock other than the designated test pair
  - Do not skip verification steps — each must be confirmed
  - Do not consider the task done if the lifecycle fails

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-step validation requiring API calls, DB checks, and Slack verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:
  - `AGENTS.md` section "Admin API" — Manual trigger endpoint syntax
  - `AGENTS.md` section "Sifely Lock Tool" — CLI syntax for verification
  - `src/inngest/employee-lifecycle.ts` — Lifecycle states to monitor

  **Acceptance Criteria**:
  - [ ] Task created via admin API returns 202 with task_id
  - [ ] Task reaches `Done` status
  - [ ] Slack notification posted with rotation results
  - [ ] At least one Sifely passcode was rotated (verified via list-passcodes)
  - [ ] At least one Hostfully door code was updated (verified via hostfully-door-code.ts)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E — manual trigger on test property only
    Tool: Bash (curl + tsx)
    Preconditions: All services running, Sifely credentials provisioned, Docker image rebuilt, property_locks scoped to test property only
    Steps:
      1. Record current passcode state: tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id 24572672 > /tmp/before-rotation.json
      2. Record current Hostfully door code: tsx src/worker-tools/locks/hostfully-door-code.ts --property-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2
      3. Trigger: curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/code-rotation/trigger" -H "Content-Type: application/json" -d '{}'
      4. Capture task_id from response
      5. Poll task status every 30s: curl -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID"
      6. Assert: task reaches "Done" status within 10 minutes
      7. Check Slack channel C0960S2Q8RL for notification message
      8. Verify test lock passcode changed: tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id 24572672
      9. Verify Hostfully door code updated: tsx src/worker-tools/locks/hostfully-door-code.ts --property-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2
      10. Assert: new door code differs from step 2 value
    Expected Result: Full lifecycle completes, Slack notified, test lock code changed, Hostfully updated
    Failure Indicators: Task status is "Failed", no Slack message, passcode unchanged, Hostfully code unchanged
    Evidence: .sisyphus/evidence/task-8-e2e-full.txt

  Scenario: No other locks were touched (isolation check)
    Tool: Bash (tsx)
    Preconditions: E2E has completed
    Steps:
      1. Pick an unrelated lock (e.g., 271-GIN front door, lock ID 4831824)
      2. List all passcodes: tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id 4831824
      3. Assert: all expected passcode names are present (permanent-visitor-home, permanent-visitor-room-1, etc.)
      4. Assert: passcode values are unchanged from before the E2E test
    Expected Result: Non-test locks are completely untouched
    Failure Indicators: Any passcode on lock 4831824 was modified or deleted
    Evidence: .sisyphus/evidence/task-8-isolation-check.txt
  ```

  **Commit**: NO (validation step)

- [x] 9. Notify completion

  Send Telegram notification: plan `code-rotation-employee` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ code-rotation-employee complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Trigger the code-rotation employee manually via admin API. Verify: task reaches `Done` status, Slack notification posted with per-property results, at least one Sifely passcode was actually created (check via `sifely-client.ts --action list-passcodes`), Hostfully door code updated. Test error scenario: provide an invalid lock ID and verify graceful handling.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                | Files                                         | Pre-commit           |
| ---- | ------------------------------------------------------------- | --------------------------------------------- | -------------------- |
| 1    | `feat(locks): add memorable code generation shell tool`       | `src/worker-tools/locks/generate-code.ts`     | `pnpm lint`          |
| 2    | `feat(locks): add Hostfully door code update shell tool`      | `src/worker-tools/locks/update-door-code.ts`  | `pnpm lint`          |
| 3    | `test(locks): add generate-code unit tests`                   | `tests/worker-tools/generate-code.test.ts`    | `pnpm test -- --run` |
| 4    | `test(locks): add update-door-code unit tests`                | `tests/worker-tools/update-door-code.test.ts` | `pnpm test -- --run` |
| 5    | `feat(archetype): add code-rotation employee for VLRE`        | `prisma/seed.ts`                              | `pnpm lint`          |
| 6    | `docs: add code-rotation employee to AGENTS.md and README.md` | `AGENTS.md`, `README.md`                      | —                    |
| 7    | — (no commit, operational step)                               | —                                             | —                    |
| 8    | — (no commit, validation step)                                | —                                             | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run          # Expected: all tests pass including new ones
pnpm build                  # Expected: clean compile
pnpm lint                   # Expected: no errors
docker build -t ai-employee-worker:latest .  # Expected: successful build
```

### Final Checklist

- [ ] `generate-code.ts` produces memorable codes (mirror/rhythm, 4-6 digits, no weak codes)
- [ ] `update-door-code.ts` writes door_code back to Hostfully custom data
- [ ] `code-rotation` archetype exists in seed with correct system_prompt and instructions
- [ ] Manual trigger via admin API creates task → lifecycle completes to `Done`
- [ ] Slack notification posted with per-property rotation results
- [ ] Shared lock isolation works — only the target property's passcode is rotated
- [ ] All "Must NOT Have" items confirmed absent
- [ ] AGENTS.md and README.md updated with new employee
