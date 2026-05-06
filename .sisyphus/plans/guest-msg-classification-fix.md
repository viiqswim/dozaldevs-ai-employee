# Guest-Messaging Classification & Notification Fix

## TL;DR

> **Quick Summary**: Fix two bugs where the guest-messaging worker (1) incorrectly classifies Airbnb-relayed messages as "already responded" due to strict `senderType` matching, and (2) silently drops NO_ACTION_NEEDED results without posting a Slack notification for PM visibility.
>
> **Deliverables**:
>
> - Hardened `senderType` check in `get-messages.ts` (defensive: any non-AGENCY = guest)
> - Diagnostic logging of raw `senderType` values
> - Updated STEP 1 instructions to post Slack notification on early exit
> - Unit tests for the new senderType logic
> - Docker image rebuild + seed + E2E verification
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (resolve stuck task) → T2+T3 (parallel: harden code + update instructions) → T4 (tests) → T5 (rebuild + seed) → T6 (E2E) → F1-F4 (final wave)

---

## Context

### Original Request

User sent a test message via Airbnb to a Hostfully property. The webhook fired, a task was created (`cf9e9f60`), the worker ran — but it incorrectly classified the thread as NO_ACTION_NEEDED ("Thread already responded to. Last message is from host.") when the last message **was** from the guest. Additionally, no Slack notification appeared — the PM had zero visibility.

### Investigation Summary

**Key Findings**:

- `get-messages.ts --lead-id "$LEAD_UID" --unresponded-only` returned an empty array
- The `--unresponded-only` filter checks `lastMessage?.senderType === 'GUEST'` (strict equality)
- Airbnb-relayed messages may use a `senderType` value other than exactly `"GUEST"` — the tool was only confirmed against direct Hostfully messages (2026-04-22)
- The STEP 1 early exit in archetype instructions explicitly says "Do NOT post any Slack notification"
- Two inconsistent NO_ACTION_NEEDED paths exist: STEP 1 (silent) vs STEP 4 (posts notification card)
- Task `cf9e9f60` is stuck in `Submitting` with a 24h `waitForEvent` — no Slack card means PM can't trigger "Reply Anyway"

### Metis Review

**Identified Gaps** (addressed):

- STEP 1 notification: `post-no-action-notification.ts` requires 12 fields unavailable at STEP 1 → resolved: use `post-message.ts` with simple text message instead
- Seed upsert behavior: confirmed `update:` block exists → re-seeding updates existing row
- Stuck task Slack cleanup: one-off, leave frozen notification message — not worth the complexity

---

## Work Objectives

### Core Objective

Make the guest-messaging worker correctly identify Airbnb-relayed messages as guest messages and always provide PM visibility via Slack when NO_ACTION_NEEDED.

### Concrete Deliverables

- `src/worker-tools/hostfully/get-messages.ts` — hardened senderType logic + diagnostic stderr logging
- `prisma/seed.ts` — updated STEP 1 instructions to post Slack notification
- `tests/worker-tools/hostfully/get-messages-sender.test.ts` — unit tests for new senderType logic
- Task `cf9e9f60` resolved (patched to Done)
- Docker image rebuilt, seed applied, E2E verified

### Definition of Done

- [ ] `get-messages.ts` treats any non-'AGENCY' senderType as guest (defensive default)
- [ ] `get-messages.ts` logs raw senderType values to stderr for diagnostics
- [ ] STEP 1 early exit posts a simple Slack notification before stopping
- [ ] Unit tests pass for new senderType logic (edge cases: null, undefined, "AIRBNB_GUEST", "OTA", etc.)
- [ ] E2E: retrigger Hostfully webhook → worker correctly classifies → Slack notification appears

### Must Have

- Defensive senderType handling (non-AGENCY = guest)
- Diagnostic logging of raw senderType values to stderr
- Slack notification on STEP 1 early exit
- Unit tests for senderType edge cases
- Docker image rebuild + seed apply

### Must NOT Have (Guardrails)

- DO NOT modify `send-message.ts`
- DO NOT change delivery instructions or prompt structure for daily-summarizer archetypes
- DO NOT add employee-specific language to shared files (`employee-lifecycle.ts`, `opencode-harness.mts`)
- DO NOT change the STEP 4 NO_ACTION_NEEDED path (it already works correctly)
- DO NOT add retry logic or new features beyond the two fixes
- DO NOT use `post-no-action-notification.ts` in STEP 1 (requires 12 fields unavailable at that point)
- DO NOT modify the lifecycle's `waitForEvent` behavior or timeout handling

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (`pnpm test`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run get-messages.ts with mock data, verify output
- **Seed changes**: Use Bash — grep seed content after apply
- **E2E**: Use Bash (curl) — trigger webhook, check task status, verify Slack notification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — resolve + parallel code changes):
├── Task 1: Resolve stuck task cf9e9f60 [quick]
├── Task 2: Harden senderType in get-messages.ts [quick]
├── Task 3: Update STEP 1 instructions in seed.ts [quick]
└── Task 4: Unit tests for senderType logic [quick]

Wave 2 (After Wave 1 — rebuild + verify):
├── Task 5: Docker rebuild + seed apply [quick]
└── Task 6: E2E verification — retrigger webhook [deep]

Wave FINAL (After ALL tasks):
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high)
└── F4: Scope Fidelity Check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | T6     | 1    |
| T2   | —          | T4, T5 | 1    |
| T3   | —          | T5     | 1    |
| T4   | T2         | T5     | 1    |
| T5   | T2, T3, T4 | T6     | 2    |
| T6   | T1, T5     | F1-F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `quick`, T2 `quick`, T3 `quick`, T4 `quick`
- **Wave 2**: 2 tasks — T5 `quick`, T6 `deep`
- **Final**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Resolve stuck task cf9e9f60

  **What to do**:
  - Patch task `cf9e9f60-1cef-4c77-ad7a-18d7419d9b4e` to `Done` status via PostgREST
  - This task is stuck in `Submitting` with a 24h `waitForEvent` that will never be triggered (no Slack card was posted)
  - Use: `curl -X PATCH "http://localhost:54331/rest/v1/tasks?id=eq.cf9e9f60-1cef-4c77-ad7a-18d7419d9b4e" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hmuj5FMNJSzOAzI4c" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hmuj5FMNJSzOAzI4c" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"status":"Done"}'`
  - Verify the response shows `"status": "Done"`

  **Must NOT do**:
  - Do NOT try to update the Slack notification message — leave it frozen
  - Do NOT modify any code files for this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `src/inngest/employee-lifecycle.ts:591-595` — the `waitForEvent` that this task is stuck on
  - PostgREST URL: `http://localhost:54331/rest/v1/`
  - Auth: both `apikey` and `Authorization: Bearer` headers required with the service role JWT

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify task patched to Done
    Tool: Bash (curl)
    Preconditions: Task cf9e9f60 exists in Submitting status
    Steps:
      1. Run curl PATCH to set status to Done (command above)
      2. Run curl GET: `curl -s "http://localhost:54331/rest/v1/tasks?id=eq.cf9e9f60-1cef-4c77-ad7a-18d7419d9b4e&select=status" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hmuj5FMNJSzOAzI4c" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hmuj5FMNJSzOAzI4c"`
      3. Assert response contains `"status":"Done"`
    Expected Result: `[{"status":"Done"}]`
    Failure Indicators: Status is still "Submitting" or curl returns error
    Evidence: .sisyphus/evidence/task-1-resolve-stuck-task.txt
  ```

  **Commit**: NO (no code changes)

- [x] 2. Harden senderType check in get-messages.ts

  **What to do**:
  - In `src/worker-tools/hostfully/get-messages.ts`, change the `unresponded` detection logic to treat any non-`'AGENCY'` senderType as a guest message (defensive default)
  - **Line 231** (single-lead path): Change `const unresponded = lastMessage?.senderType === 'GUEST';` to `const unresponded = lastMessage?.senderType !== 'AGENCY';` — but ONLY if lastMessage exists and has a senderType that is not null/undefined. Specifically: `const unresponded = !!lastMessage?.senderType && lastMessage.senderType !== 'AGENCY';`
  - **Line 321** (multi-lead path): Apply the same change: `const unresponded = !!lastMessage?.senderType && lastMessage.senderType !== 'AGENCY';`
  - **Lines 235 and 325** (sender mapping in `MessageSummary`): Change to map `'AGENCY'` → `'host'`, anything else with a value → `'guest'`, null/undefined → `null`. Specifically: `sender: m.senderType === 'AGENCY' ? 'host' : m.senderType ? 'guest' : null`
  - **Add diagnostic logging**: Before the `unresponded` assignment (both paths), add `process.stderr.write()` calls that log the raw senderType values of all messages. Format: `[get-messages] Lead ${leadId}: ${rawMessages.length} messages, lastMessage.senderType="${lastMessage?.senderType}", unresponded=${unresponded}\n`
  - The stderr logging ensures diagnostics appear in container logs but don't pollute stdout JSON output

  **Must NOT do**:
  - Do NOT change the sort order or any other logic in the tool
  - Do NOT modify the `--unresponded-only` filter behavior beyond the senderType check
  - Do NOT add any new CLI flags or arguments
  - Do NOT modify the multi-property pagination logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts:226-249` — single-lead path with the senderType check (line 231) and sender mapping (line 235)
  - `src/worker-tools/hostfully/get-messages.ts:316-336` — multi-lead path with the same logic (lines 321, 325)

  **API/Type References**:
  - `src/worker-tools/hostfully/get-messages.ts:46-56` — `RawMessage` type, `senderType?: string`
  - `src/worker-tools/hostfully/get-messages.ts:58-62` — `MessageSummary` type, `sender: 'guest' | 'host' | null`

  **WHY Each Reference Matters**:
  - Lines 231 and 321 are the exact lines to change — the strict `=== 'GUEST'` checks
  - Lines 235 and 325 are the sender mapping — must be consistent with the unresponded logic
  - The RawMessage type shows `senderType` is optional string — defensive null check needed

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Non-AGENCY senderType treated as guest
    Tool: Bash
    Preconditions: get-messages.ts modified
    Steps:
      1. Read the modified file
      2. Verify line containing "unresponded" uses `!== 'AGENCY'` pattern (not `=== 'GUEST'`)
      3. Verify both single-lead path (~line 231) and multi-lead path (~line 321) are updated
      4. Verify sender mapping uses `m.senderType === 'AGENCY' ? 'host' : m.senderType ? 'guest' : null`
    Expected Result: Both paths use defensive non-AGENCY check
    Failure Indicators: Still contains `=== 'GUEST'` for unresponded check
    Evidence: .sisyphus/evidence/task-2-sendertype-hardening.txt

  Scenario: Diagnostic logging present
    Tool: Bash (grep)
    Preconditions: get-messages.ts modified
    Steps:
      1. Grep for `process.stderr.write` in get-messages.ts
      2. Verify at least 2 occurrences (one per path: single-lead and multi-lead)
      3. Verify log includes `senderType` value
    Expected Result: 2+ stderr.write calls with senderType diagnostic info
    Failure Indicators: No stderr logging found, or only in one path
    Evidence: .sisyphus/evidence/task-2-diagnostic-logging.txt

  Scenario: Null/undefined senderType does NOT mark as unresponded
    Tool: Bash (code review)
    Preconditions: get-messages.ts modified
    Steps:
      1. Read the unresponded logic
      2. Verify null senderType → unresponded = false (not true)
      3. The pattern `!!lastMessage?.senderType && lastMessage.senderType !== 'AGENCY'` ensures null/undefined → false
    Expected Result: Null senderType does not trigger unresponded=true
    Failure Indicators: Missing null guard, would treat null as non-AGENCY (truthy)
    Evidence: .sisyphus/evidence/task-2-null-guard.txt
  ```

  **Commit**: YES (groups with T4)
  - Message: `fix(hostfully): harden senderType check to treat non-AGENCY as guest`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `tests/worker-tools/hostfully/get-messages-sender.test.ts`
  - Pre-commit: `pnpm test -- --run tests/worker-tools/hostfully/get-messages-sender.test.ts`

---

- [x] 3. Update STEP 1 instructions in seed.ts to post Slack notification

  **What to do**:
  - In `prisma/seed.ts`, find the `VLRE_GUEST_MESSAGING_INSTRUCTIONS` string, specifically the STEP 1 section (lines 282-285)
  - Replace the current STEP 1 early exit text:
    ```
    'If the output is an empty array, the host has already responded — no action needed from the AI. ' +
    'Write "NO_ACTION_NEEDED: Thread already responded to. Last message is from host." to /tmp/summary.txt and stop. Do NOT post any Slack notification.\n\n' +
    ```
  - With updated text that posts a simple Slack notification:
    ```
    'If the output is an empty array, the host has already responded — no action needed from the AI. ' +
    'Write "NO_ACTION_NEEDED: Thread already responded to. Last message is from host." to /tmp/summary.txt.\n' +
    'Then post a brief notification so the PM knows this task was processed:\n' +
    'NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "ℹ️ Guest message task processed — no unresponded messages found. No action needed." --task-id "$TASK_ID" > /tmp/approval-message.json\n' +
    'Both /tmp/summary.txt and /tmp/approval-message.json MUST exist before stopping.\n\n' +
    ```
  - This ensures the harness finds both output files and the PM gets a Slack notification

  **Must NOT do**:
  - Do NOT modify STEP 4 NO_ACTION_NEEDED path (it already works correctly with `post-no-action-notification.ts`)
  - Do NOT use `post-no-action-notification.ts` in STEP 1 (requires 12 fields unavailable at that point)
  - Do NOT change any other steps (2, 3, 3.5, 5, 6)
  - Do NOT modify the summarizer archetype instructions
  - Do NOT change the `GUEST_MESSAGING_SYSTEM_PROMPT`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `prisma/seed.ts:273-285` — the `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant, specifically the STEP 1 section
  - `prisma/seed.ts:314-332` — STEP 4 NO_ACTION_NEEDED path (reference for how notifications are posted — do NOT modify this)
  - `prisma/seed.ts:270` — existing `post-message.ts` usage pattern with `--task-id` and `> /tmp/approval-message.json`

  **External References**:
  - `src/worker-tools/slack/post-message.ts` — the tool being called. Accepts `--channel`, `--text`, `--task-id` flags. Outputs JSON `{"ts":"...","channel":"..."}` to stdout.

  **WHY Each Reference Matters**:
  - Lines 282-285 are the exact lines to change — the current silent early exit
  - Line 270 shows the existing pattern for calling post-message.ts with --task-id and redirecting to /tmp/approval-message.json
  - Lines 314-332 show STEP 4's approach — we are NOT using this approach in STEP 1

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: STEP 1 now posts Slack notification
    Tool: Bash (grep)
    Preconditions: seed.ts modified
    Steps:
      1. Grep for "post-message.ts" in the VLRE_GUEST_MESSAGING_INSTRUCTIONS section of seed.ts
      2. Verify the STEP 1 section includes a call to post-message.ts
      3. Verify it includes `--channel "$NOTIFICATION_CHANNEL"` and `--task-id "$TASK_ID"`
      4. Verify it redirects to `> /tmp/approval-message.json`
    Expected Result: STEP 1 calls post-message.ts with proper flags
    Failure Indicators: STEP 1 still says "Do NOT post any Slack notification"
    Evidence: .sisyphus/evidence/task-3-step1-notification.txt

  Scenario: "Do NOT post" instruction removed
    Tool: Bash (grep)
    Preconditions: seed.ts modified
    Steps:
      1. Grep for "Do NOT post any Slack notification" in seed.ts
      2. Should return zero matches
    Expected Result: Zero matches — instruction removed
    Failure Indicators: Still contains "Do NOT post any Slack notification"
    Evidence: .sisyphus/evidence/task-3-no-silent-exit.txt

  Scenario: STEP 1 requires both output files
    Tool: Bash (grep)
    Preconditions: seed.ts modified
    Steps:
      1. Search STEP 1 section for mention of both /tmp/summary.txt and /tmp/approval-message.json
      2. Verify STEP 1 says both files MUST exist
    Expected Result: STEP 1 mentions both files must exist
    Evidence: .sisyphus/evidence/task-3-both-files.txt
  ```

  **Commit**: YES (separate)
  - Message: `fix(guest-messaging): add Slack notification to STEP 1 early exit`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/seed-guest-messaging.test.ts`

- [x] 4. Unit tests for senderType logic

  **What to do**:
  - Create `tests/worker-tools/hostfully/get-messages-sender.test.ts`
  - Test the senderType → unresponded mapping logic by importing and testing the tool's behavior with mock data
  - Since `get-messages.ts` is a CLI script (not an importable module), test by:
    - Setting `HOSTFULLY_MOCK=true` and creating fixture files that simulate different senderType values
    - OR extracting the mapping logic into a testable helper (preferred if clean)
    - OR running the script with mock env and verifying stdout JSON output
  - **Test cases to cover**:
    1. `senderType: "GUEST"` → `sender: "guest"`, `unresponded: true` ✅
    2. `senderType: "AGENCY"` → `sender: "host"`, `unresponded: false` ✅
    3. `senderType: "AIRBNB_GUEST"` → `sender: "guest"`, `unresponded: true` (new defensive behavior)
    4. `senderType: "OTA"` → `sender: "guest"`, `unresponded: true` (new defensive behavior)
    5. `senderType: "HOST"` → `sender: "guest"`, `unresponded: true` (non-AGENCY = guest)
    6. `senderType: null/undefined` → `sender: null`, `unresponded: false`
    7. `senderType: ""` (empty string) → `sender: null`, `unresponded: false`
  - Use the existing mock fixture pattern: `HOSTFULLY_MOCK=true` with fixture files in `src/worker-tools/hostfully/fixtures/get-messages/`
  - Create fixture JSON files for each test case with the appropriate senderType values

  **Must NOT do**:
  - Do NOT modify the existing fixture files used by other tests
  - Do NOT add any runtime dependencies
  - Do NOT test the Hostfully API itself (mock only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (but depends on T2 completing first for the code to test)
  - **Parallel Group**: Wave 1 — start after T2 completes
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:
  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts:165-183` — HOSTFULLY_MOCK fixture loading pattern
  - `src/worker-tools/hostfully/fixtures/get-messages/` — existing fixture directory

  **Test References**:
  - `tests/workers/opencode-harness-delivery.test.ts` — example of testing worker tools with Vitest in this codebase
  - `tests/gateway/seed-guest-messaging.test.ts` — example of testing seed data

  **WHY Each Reference Matters**:
  - The fixture pattern at lines 165-183 shows how to create mock data that the tool reads instead of calling the API
  - Existing test files show the project's Vitest conventions (describe/it blocks, assertion style)

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/worker-tools/hostfully/get-messages-sender.test.ts`
  - [ ] `pnpm test -- --run tests/worker-tools/hostfully/get-messages-sender.test.ts` → PASS (7+ tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All senderType tests pass
    Tool: Bash
    Preconditions: Test file created, get-messages.ts hardened (T2 complete)
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/hostfully/get-messages-sender.test.ts
      2. Assert exit code 0
      3. Assert output shows 7+ tests passed, 0 failed
    Expected Result: All tests pass
    Failure Indicators: Any test failure or exit code non-zero
    Evidence: .sisyphus/evidence/task-4-unit-tests.txt

  Scenario: Edge case coverage verified
    Tool: Bash (grep)
    Preconditions: Test file exists
    Steps:
      1. Grep test file for "AIRBNB_GUEST" — should exist
      2. Grep test file for "null" or "undefined" senderType test — should exist
      3. Grep test file for "AGENCY" — should exist
    Expected Result: All edge cases present in test file
    Evidence: .sisyphus/evidence/task-4-edge-cases.txt
  ```

  **Commit**: YES (groups with T2)
  - Message: `fix(hostfully): harden senderType check to treat non-AGENCY as guest`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `tests/worker-tools/hostfully/get-messages-sender.test.ts`
  - Pre-commit: `pnpm test -- --run tests/worker-tools/hostfully/get-messages-sender.test.ts`

---

- [x] 5. Docker image rebuild + seed apply

  **What to do**:
  - Rebuild the Docker image to include the hardened `get-messages.ts`:
    `docker build -t ai-employee-worker:latest .`
  - Apply the seed to update the archetype instructions in the database:
    `pnpm prisma db seed`
  - Verify the seed applied correctly by checking the archetype instructions via PostgREST:
    `curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hmuj5FMNJSzOAzI4c" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hmuj5FMNJSzOAzI4c"` | check instructions contain "post-message.ts" in STEP 1 and no longer contain "Do NOT post any Slack notification"
  - Verify the Docker image contains the updated get-messages.ts:
    `docker run --rm ai-employee-worker:latest grep -c "!== 'AGENCY'" /tools/hostfully/get-messages.js` (should return 2, one per path)

  **Must NOT do**:
  - Do NOT run `pnpm prisma migrate` (no schema changes)
  - Do NOT restart the gateway (not needed for this fix)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 2, 3, 4

  **References**:
  - `Dockerfile` — the build file for the worker image
  - `prisma/seed.ts` — seed file (modified in T3)
  - PostgREST URL: `http://localhost:54331/rest/v1/`

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image built successfully
    Tool: Bash
    Preconditions: T2, T3, T4 complete
    Steps:
      1. Run: docker build -t ai-employee-worker:latest .
      2. Assert exit code 0
      3. Verify image exists: docker images ai-employee-worker:latest --format "{{.CreatedAt}}"
      4. Verify image contains hardened code: docker run --rm ai-employee-worker:latest grep -c "!== 'AGENCY'" /tools/hostfully/get-messages.js
    Expected Result: Image built, grep returns "2" (both paths hardened)
    Failure Indicators: Build fails or grep returns 0
    Evidence: .sisyphus/evidence/task-5-docker-build.txt

  Scenario: Seed applied — instructions updated
    Tool: Bash (curl)
    Preconditions: Seed run
    Steps:
      1. Run: pnpm prisma db seed
      2. Fetch archetype via PostgREST (command above)
      3. Check that instructions contain "post-message.ts" in STEP 1 context
      4. Check that instructions do NOT contain "Do NOT post any Slack notification"
    Expected Result: Instructions updated with notification call, old silent exit removed
    Failure Indicators: Instructions still contain silent exit text
    Evidence: .sisyphus/evidence/task-5-seed-verify.txt
  ```

  **Commit**: NO (no code changes — build/deploy step)

- [x] 6. E2E verification — retrigger Hostfully webhook

  **What to do**:
  - Trigger a new guest-messaging task by sending a simulated Hostfully webhook:
    ```
    curl -X POST http://localhost:7700/webhooks/hostfully \
      -H "Content-Type: application/json" \
      -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-classification-fix-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
    ```
  - Capture the returned `task_id`
  - Monitor the task through its lifecycle:
    1. Poll task status every 10s until it reaches `Submitting` or `Reviewing`
    2. Check the deliverable content — it should either be a proper classification JSON (NEEDS_APPROVAL) or NO_ACTION_NEEDED with a valid reason
    3. If NO_ACTION_NEEDED: verify that `/tmp/approval-message.json` was written (deliverable metadata should NOT be empty `{}`)
  - Check Slack for a notification message:
    - For NEEDS_APPROVAL: an approval card should appear in `C0960S2Q8RL`
    - For NO_ACTION_NEEDED: a simple text notification should appear in `C0960S2Q8RL`
  - Check Docker container logs for diagnostic senderType logging:
    `docker logs employee-<task-id-first-8-chars> 2>&1 | grep "get-messages"` — should show senderType values
  - **Important**: The actual classification result depends on whether there's a real unresponded message in Hostfully at execution time. If there IS an unresponded message, expect NEEDS_APPROVAL. If not, expect NO_ACTION_NEEDED — but now with a Slack notification.

  **Must NOT do**:
  - Do NOT approve or reject the task — just verify the classification and notification
  - Do NOT modify any code during this task

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T5)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 5

  **References**:
  - AGENTS.md § "Simulate a webhook locally" — the curl command pattern
  - AGENTS.md § "Hostfully Testing" — test thread/lead/property UIDs
  - `src/inngest/employee-lifecycle.ts:538-595` — classification check and NO_ACTION_NEEDED path
  - `src/worker-tools/slack/post-message.ts` — the tool that STEP 1 now calls

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Webhook triggers task successfully
    Tool: Bash (curl)
    Preconditions: Docker image rebuilt, seed applied, gateway running
    Steps:
      1. Send webhook curl command (above)
      2. Assert response contains task_id and status 202
      3. Poll task status every 10s for up to 3 minutes
      4. Assert task reaches Submitting or Reviewing
    Expected Result: Task created and progresses through lifecycle
    Failure Indicators: 500 error, task stuck in Received/Executing
    Evidence: .sisyphus/evidence/task-6-webhook-trigger.txt

  Scenario: Slack notification appears (regardless of classification)
    Tool: Bash (curl + docker logs)
    Preconditions: Task reached Submitting or Reviewing
    Steps:
      1. Check deliverable content via PostgREST
      2. If NO_ACTION_NEEDED: verify deliverable metadata is NOT empty {} (approval-message.json was written)
      3. Check Docker container logs for the task: docker logs employee-<first-8-chars> 2>&1
      4. Look for "post-message.ts" or "post-no-action-notification.ts" or "post-guest-approval.ts" in logs
    Expected Result: Some Slack notification was posted (either simple text or rich card)
    Failure Indicators: Deliverable metadata is empty {}, no Slack tool call in logs
    Evidence: .sisyphus/evidence/task-6-slack-notification.txt

  Scenario: Diagnostic senderType logging visible
    Tool: Bash (docker logs)
    Preconditions: Task ran in Docker container
    Steps:
      1. Get container name: docker ps -a --format '{{.Names}}' | grep employee
      2. Check logs: docker logs <container> 2>&1 | grep -i "senderType"
      3. Assert at least one senderType diagnostic line appears
    Expected Result: Log line showing raw senderType value(s)
    Failure Indicators: No senderType logging in container output
    Evidence: .sisyphus/evidence/task-6-sendertype-logs.txt
  ```

  **Commit**: NO (verification only)

- [x] 7. Notify completion — Send Telegram notification: plan `guest-msg-classification-fix` complete, all tasks done, come back to review results.

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "✅ guest-msg-classification-fix complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Blocked By**: F1-F4 (Final Wave)

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run the tsx command above
      2. Assert exit code 0
    Expected Result: Notification sent
    Evidence: .sisyphus/evidence/task-7-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group | Message                                                                | Files                                                                                                    | Pre-commit                                                                    |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| T2+T4 | `fix(hostfully): harden senderType check to treat non-AGENCY as guest` | `src/worker-tools/hostfully/get-messages.ts`, `tests/worker-tools/hostfully/get-messages-sender.test.ts` | `pnpm test -- --run tests/worker-tools/hostfully/get-messages-sender.test.ts` |
| T3    | `fix(guest-messaging): add Slack notification to STEP 1 early exit`    | `prisma/seed.ts`                                                                                         | `pnpm test -- --run tests/gateway/seed-guest-messaging.test.ts`               |

---

## Success Criteria

### Verification Commands

```bash
# senderType logic tests pass
pnpm test -- --run tests/worker-tools/hostfully/get-messages-sender.test.ts

# Seed tests pass
pnpm test -- --run tests/gateway/seed-guest-messaging.test.ts

# Full test suite passes (excluding known failures)
pnpm test -- --run
```

### Final Checklist

- [ ] Non-AGENCY senderType treated as guest in get-messages.ts
- [ ] Diagnostic senderType logging present in get-messages.ts
- [ ] STEP 1 instructions call post-message.ts for Slack notification
- [ ] Unit tests cover: "GUEST", "AGENCY", null, undefined, "AIRBNB_GUEST", "OTA", "HOST", empty string
- [ ] Docker image rebuilt with all changes
- [ ] Seed applied successfully
- [ ] E2E webhook retrigger shows correct classification or proper notification
- [ ] No modifications to send-message.ts, lifecycle, or summarizer instructions
