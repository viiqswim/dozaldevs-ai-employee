# Slack Approval Workflow Error Fixes + Diagnostic Logging

> **Project**: vlre-employee (`/Users/victordozal/repos/real-estate/vlre-employee`)
> **IMPORTANT**: This plan targets the vlre-employee project, NOT the ai-employee project.

## TL;DR

> **Quick Summary**: Fix two production errors in the Slack approval workflow — `expired_trigger_id` when opening edit modals and `Hostfully 400 Bad Request` when sending edited messages — and add diagnostic logging to prevent blind debugging in the future.
>
> **Deliverables**:
>
> - Edit handler restructured to open Slack modal faster and gracefully handle expiry
> - Hostfully client captures full request/response details on API errors
> - Audit log captures edited text on send failures (not just successes)
> - Tests covering all changes
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 + Task 2 (parallel) → Task 3 (tests)

---

## Context

### Original Request

User observed two distinct errors in production server logs:

1. `expired_trigger_id` — Slack modal fails to open when CS team clicks "Edit" on approval messages
2. `Hostfully API error: 400 Bad Request` — Edited messages fail to send to guests via Hostfully API

Both errors started appearing on April 16-17, 2026. The user wants the bugs fixed AND improved error diagnostics for future issues.

### Log Evidence

**expired_trigger_id** — Occurs at `approval-handlers.ts:318`. Slack's `trigger_id` has a 3-second TTL from click time. Two sub-causes observed:

- Event loop delay: other processing (pipeline, OpenRouter calls) blocks the handler from executing within the TTL
- Double-click: user clicks Edit twice; second click's trigger_id always expires

**Hostfully 400** — Occurs at `approval-handlers.ts:358`. Both failures on thread `9757e11e...` (Stella Arroyo at 7213-NUT-2). Audit log shows `approve` succeeded on April 15 but `edit` failed on April 17. Guest's check-in date is April 17 — booking state transition correlates with failures. The error message has no detail from Hostfully because `requestOnce` doesn't capture the response body.

### Metis Review

**Identified Gaps** (addressed):

- Double-click strategy: resolved as graceful handling — silently ignore `expired_trigger_id` (modal already opened from first click)
- Hostfully 400 rollback UX: already implemented — error blocks shown in Slack (lines 440-471)
- Logging scope: scoped to error paths + always for write operations (`sendMessage`)
- PII in logs: project already logs message content in audit log (approvedDraft, repliedText) — consistent to add editedText on failure
- 400 reproducibility: can't reproduce booking state, but logging will capture details for next occurrence

---

## Work Objectives

### Core Objective

Fix the two production errors and add diagnostic logging so future API failures include actionable details instead of opaque status codes.

### Concrete Deliverables

- `skills/slack-bot/approval-handlers.ts` — restructured edit handler + graceful expired_trigger_id handling + audit log fix
- `skills/hostfully-client/client.ts` — `requestOnce` captures full response body in error messages
- Updated tests in `skills/slack-bot/handlers.test.ts` and `skills/hostfully-client/hostfully-client.test.ts`

### Definition of Done

- [ ] `bun test` passes with zero regressions
- [ ] `bun run typecheck` passes
- [ ] Edit handler calls `views.open` before any non-essential processing
- [ ] `expired_trigger_id` errors are caught and logged at debug level (not error)
- [ ] Hostfully 400 errors include response body in error message
- [ ] Audit log includes `editedText` on send failure

### Must Have

- Fix expired_trigger_id by making `views.open()` the first async operation after `ack()`
- Graceful handling of `expired_trigger_id` — don't log as error (it's benign when modal already opened)
- Full response body capture in `requestOnce` error path
- `editedText` in failure audit log entries

### Must NOT Have (Guardrails)

- No changes to the approve or reject handlers — only the edit handler
- No changes to Slack message structure or Block Kit layout
- No changes to the pipeline, classifier, or message processing logic
- No changes to reminder behavior
- No retry logic for `sendMessage` (idempotency risk — could send duplicate messages to guests)
- No verbose logging of full request/response bodies on success — only on error paths
- No changes to the `request()` or `requestV3()` methods — only `requestOnce()`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (bun:test)
- **Automated tests**: YES (tests-after — update existing test suites)
- **Framework**: bun:test
- Tests go in existing test files alongside the modules they test

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: `bun test` — run test suites for changed modules
- **Type checking**: `bun run typecheck` — ensure no type regressions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — parallel, independent files):
├── Task 1: Fix edit handler timing + graceful error handling + audit log [quick]
├── Task 2: Enhance Hostfully client error diagnostics [quick]

Wave 2 (After Wave 1 — depends on both tasks):
└── Task 3: Update/add tests for all changes [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real QA execution (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks   |
| ---- | ---------- | -------- |
| 1    | —          | 3, F1-F4 |
| 2    | —          | 3, F1-F4 |
| 3    | 1, 2       | F1-F4    |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 1 task — T3 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix Edit Handler Timing + Graceful Error Handling + Audit Log

  **What to do**:

  **1a. Restructure the edit handler to call `views.open()` ASAP** (`approval-handlers.ts` lines 290-335):
  - Currently the handler does: `ack()` → get channelId/messageTs → check action.value → parse metadata → console.log → build modal → `views.open()`
  - Restructure to: `ack()` → parse metadata (minimal sync — just JSON.parse) → `views.open()` → then log and do everything else
  - The `buildEditModal()` call and `views.open()` must happen before ANY logging or other processing
  - Do NOT move `ack()` — it must remain first (Slack requirement)

  **1b. Add graceful handling for `expired_trigger_id`** in the catch block (line 333-335):
  - Currently: `catch (error) { console.error('[SLACK] Edit: failed to open modal:', error); }`
  - Change to: detect if the error is `expired_trigger_id` (check `error.data?.error === 'expired_trigger_id'`)
  - If expired_trigger_id: log at info/debug level with `console.log('[SLACK] Edit: trigger_id expired (likely double-click or delay)')` — NOT `console.error`
  - If any other error: keep the existing `console.error` behavior

  **1c. Add `editedText` to the failure audit log** (lines 440-451):
  - Currently the failure audit log entry includes `error: errorMsg` but NOT the `editedText`
  - Add `editedText` to the `appendAuditLog` call in the catch block (same as the success path at line 411 includes `editedText`)
  - Also add `originalDraft: modalMetadata.draftResponse ?? ''` to the failure entry for consistency with the success path

  **Must NOT do**:
  - Do NOT modify the approve handler (`app.action('approve_response', ...)`) — only the edit click handler and edit modal submission handler
  - Do NOT modify the reject handler
  - Do NOT add retry logic to `views.open()`
  - Do NOT add debounce or in-flight tracking — graceful error handling is sufficient
  - Do NOT change the modal structure (`buildEditModal`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change, well-scoped modifications in a small handler function
  - **Skills**: `[]`
    - No special skills needed — straightforward TypeScript edits

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `skills/slack-bot/approval-handlers.ts:97-175` — Approve handler pattern (ack → parse → action → error handling) — follow the same structure but with `views.open` prioritized
  - `skills/slack-bot/approval-handlers.ts:290-335` — Current edit click handler — THIS IS WHAT YOU'RE MODIFYING
  - `skills/slack-bot/approval-handlers.ts:338-473` — Edit modal submission handler — modify the catch block at lines 440-451

  **API/Type References**:
  - `skills/slack-bot/approval-handlers.ts:18-48` — `ButtonMetadata`, `ModalMetadata`, `parseMetadata` — the metadata types used in the handler
  - `skills/slack-bot/audit-log.ts` — `appendAuditLog` function — check what fields it accepts

  **External References**:
  - Slack `views.open` trigger_id has a 3-second TTL: https://api.slack.com/interactivity/handling#modal_responses
  - Slack error codes: `expired_trigger_id` means the trigger_id is no longer valid

  **WHY Each Reference Matters**:
  - Lines 290-335: This is the exact code being modified — the edit click handler
  - Lines 338-473: The edit modal submission handler — the catch block at 440-451 needs `editedText` added
  - Lines 97-175: The approve handler shows the established pattern for ack → parse → action flow
  - `audit-log.ts`: Need to verify the `appendAuditLog` function signature accepts `editedText` and `originalDraft` fields

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Edit handler calls views.open before logging
    Tool: Bash (bun test)
    Preconditions: vlre-employee project checked out, dependencies installed
    Steps:
      1. Read `skills/slack-bot/approval-handlers.ts`
      2. In the edit click handler (app.action containing 'edit_response'), verify that `client.views.open()` is called BEFORE any `console.log` statement
      3. Verify `ack()` is still the first call in the handler
    Expected Result: The handler structure is: ack() → parse metadata → views.open() → log → done
    Failure Indicators: console.log or console.error appears before client.views.open in the handler
    Evidence: .sisyphus/evidence/task-1-handler-structure.txt

  Scenario: expired_trigger_id is handled gracefully
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. Search `approval-handlers.ts` for `expired_trigger_id` string
      2. Verify the error handling checks for `expired_trigger_id` specifically
      3. Verify it uses `console.log` (NOT `console.error`) for this specific error
    Expected Result: expired_trigger_id check exists and uses info-level logging
    Failure Indicators: No expired_trigger_id check, or uses console.error for it
    Evidence: .sisyphus/evidence/task-1-graceful-handling.txt

  Scenario: Failure audit log includes editedText
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. In `approval-handlers.ts`, find the `appendAuditLog` call inside the catch block of the edit modal submission handler (around line 444)
      2. Verify it includes `editedText` field
      3. Verify it includes `originalDraft` field
    Expected Result: Failure audit log entry contains editedText and originalDraft
    Failure Indicators: appendAuditLog in catch block missing editedText or originalDraft
    Evidence: .sisyphus/evidence/task-1-audit-log-failure.txt

  Scenario: bun test passes after changes
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run `bun test` from project root
      2. Check exit code
    Expected Result: All tests pass, exit code 0
    Failure Indicators: Any test failure or non-zero exit code
    Evidence: .sisyphus/evidence/task-1-test-pass.txt
  ```

  **Commit**: YES (commit 1)
  - Message: `fix(slack-bot): prevent expired_trigger_id by prioritizing views.open in edit handler`
  - Files: `skills/slack-bot/approval-handlers.ts`
  - Pre-commit: `bun test`

- [x] 2. Enhance Hostfully Client Error Diagnostics

  **What to do**:

  **2a. Capture full response body in `requestOnce` error path** (`client.ts` lines 117-149):
  - Currently the error handling reads status + statusText, then tries to parse JSON for `message` and `error` fields
  - Enhancement: also capture and include the RAW response text in the error message when JSON parsing fails, so we can see what Hostfully actually returned
  - Specifically, in the catch block where JSON parsing fails (line 141-143), read the response as text and append it to the error message (truncated to 500 chars to avoid log pollution)
  - Example error format: `Hostfully API error: 400 Bad Request — [raw response: {"code":"THREAD_CLOSED","detail":"..."}]`

  **2b. Log the request body on error for `sendMessage`** (`client.ts` lines 215-223):
  - Add a `console.error` log in the `sendMessage` method that captures the request body when the call fails
  - Wrap the `requestOnce` call in a try/catch, log `[HOSTFULLY] sendMessage failed for thread ${threadUid}: ${error.message}` and include the text length (NOT the full text — avoid PII in console logs)
  - Re-throw the error after logging so the caller's error handling still works
  - Format: `[HOSTFULLY] sendMessage failed — thread: ${threadUid}, textLength: ${text.length}, error: ${error.message}`

  **Must NOT do**:
  - Do NOT modify `request()` or `requestV3()` methods — only `requestOnce()`
  - Do NOT add retry logic to `requestOnce` or `sendMessage`
  - Do NOT log the full message text in console (PII) — only log text length. The audit log (handled by the caller) captures the full text.
  - Do NOT change the error class or error type — keep throwing plain `Error` instances
  - Do NOT modify the success path — only enhance error path logging

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change, scoped to error handling in two methods
  - **Skills**: `[]`
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `skills/hostfully-client/client.ts:42-78` — `request()` method error handling pattern — follow the same structure for consistency
  - `skills/hostfully-client/client.ts:117-149` — `requestOnce()` — THIS IS WHAT YOU'RE MODIFYING
  - `skills/hostfully-client/client.ts:215-223` — `sendMessage()` — add error logging wrapper here

  **API/Type References**:
  - `skills/hostfully-client/types.ts` — `HostfullyApiError` type — the expected error response shape from Hostfully
  - `skills/hostfully-client/client.ts:6-7` — `HostfullySendMessageRequest`, `HostfullySendMessageResponse` types

  **Test References**:
  - `skills/hostfully-client/hostfully-client.test.ts:218-230` — Existing `sendMessage` test — follow this pattern
  - `skills/hostfully-client/hostfully-client.test.ts:601-606` — Existing test for sendMessage error behavior

  **WHY Each Reference Matters**:
  - Lines 42-78: Shows the established error handling pattern (status checks, JSON parsing, error message construction) — match this style
  - Lines 117-149: The exact method being modified
  - Lines 215-223: The sendMessage method where error logging wrapper is being added
  - Test lines 218-230 and 601-606: Show how sendMessage errors are tested — new tests should follow this pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: requestOnce captures raw response body on JSON parse failure
    Tool: Bash (grep + read)
    Preconditions: Code changes applied
    Steps:
      1. Read `skills/hostfully-client/client.ts`, find `requestOnce` method
      2. Verify that when JSON parsing fails in the error path, the raw response text is captured
      3. Verify it's truncated (max 500 chars) to prevent log pollution
    Expected Result: Error message includes raw response text fallback when JSON parsing fails
    Failure Indicators: No raw text capture, or no truncation
    Evidence: .sisyphus/evidence/task-2-response-capture.txt

  Scenario: sendMessage logs request context on error
    Tool: Bash (grep + read)
    Preconditions: Code changes applied
    Steps:
      1. Read `skills/hostfully-client/client.ts`, find `sendMessage` method
      2. Verify there's a try/catch wrapping the `requestOnce` call
      3. Verify the catch block logs threadUid and text.length (NOT full text)
      4. Verify the error is re-thrown after logging
    Expected Result: sendMessage has error logging with threadUid + textLength, re-throws
    Failure Indicators: No try/catch, logs full text, doesn't re-throw
    Evidence: .sisyphus/evidence/task-2-send-logging.txt

  Scenario: request() and requestV3() are NOT modified
    Tool: Bash (git diff)
    Preconditions: Code changes applied
    Steps:
      1. Run `git diff skills/hostfully-client/client.ts`
      2. Verify diff does NOT touch lines 42-78 (request method) or 80-115 (requestV3 method)
    Expected Result: Only requestOnce (lines 117-149) and sendMessage (lines 215-223) are modified
    Failure Indicators: Changes in request() or requestV3() methods
    Evidence: .sisyphus/evidence/task-2-scope-check.txt

  Scenario: bun test passes after changes
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run `bun test` from project root
      2. Check exit code
    Expected Result: All tests pass, exit code 0
    Failure Indicators: Any test failure or non-zero exit code
    Evidence: .sisyphus/evidence/task-2-test-pass.txt
  ```

  **Commit**: YES (commit 2)
  - Message: `fix(hostfully-client): capture full response body in requestOnce error path`
  - Files: `skills/hostfully-client/client.ts`
  - Pre-commit: `bun test`

- [x] 3. Update/Add Tests for All Changes

  **What to do**:

  **3a. Add test for expired_trigger_id graceful handling** (`skills/slack-bot/handlers.test.ts`):
  - Add a test case that simulates the edit button click where `views.open` throws an error with `data.error === 'expired_trigger_id'`
  - Verify the handler does NOT throw/crash
  - Verify it logs at info level (console.log), not error level (console.error)
  - Follow the existing test patterns in `handlers.test.ts` for mocking Slack's `client` and `body`

  **3b. Add test for editedText in failure audit log** (`skills/slack-bot/handlers.test.ts`):
  - Add a test case that simulates the edit modal submission where `hostfullyClient.sendMessage` throws
  - Verify the `appendAuditLog` call includes `editedText` and `originalDraft` fields
  - Use existing test mocking patterns from the file

  **3c. Add test for requestOnce error body capture** (`skills/hostfully-client/hostfully-client.test.ts`):
  - Add a test case where the mock server returns a 400 with a JSON body containing an error message
  - Verify the thrown error includes the JSON body details
  - Add a test case where the mock server returns a 400 with a NON-JSON body
  - Verify the thrown error includes the raw response text (truncated)
  - Follow the existing test pattern at line 601-606

  **3d. Add test for sendMessage error logging** (`skills/hostfully-client/hostfully-client.test.ts`):
  - Add a test case where `sendMessage` fails (mock returns 400)
  - Verify the error is still thrown (re-thrown after logging)
  - Verify the error message contains the Hostfully API error details

  **Must NOT do**:
  - Do NOT modify existing passing tests — only ADD new test cases
  - Do NOT change test infrastructure or configuration
  - Do NOT add tests for approve or reject handlers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding test cases to existing test files, following established patterns
  - **Skills**: `[]`
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1, Task 2 (needs the implementation changes to test against)

  **References**:

  **Pattern References** (existing test patterns to follow):
  - `skills/slack-bot/handlers.test.ts` — Full test file — follow the existing mock setup, test structure, and assertion patterns
  - `skills/hostfully-client/hostfully-client.test.ts:218-230` — Existing `sendMessage` tests — follow this pattern for new tests
  - `skills/hostfully-client/hostfully-client.test.ts:601-606` — Existing error behavior test for sendMessage

  **Implementation References** (the code being tested):
  - `skills/slack-bot/approval-handlers.ts:290-335` — Edit click handler (Task 1 changes)
  - `skills/slack-bot/approval-handlers.ts:440-451` — Edit modal catch block (Task 1 changes)
  - `skills/hostfully-client/client.ts:117-149` — `requestOnce` method (Task 2 changes)
  - `skills/hostfully-client/client.ts:215-223` — `sendMessage` method (Task 2 changes)

  **WHY Each Reference Matters**:
  - `handlers.test.ts`: Contains the existing mock patterns for Slack client, body, and ack — new tests must use the same mocking approach
  - `hostfully-client.test.ts:218-230`: Shows how to mock HTTP responses for sendMessage tests — new tests follow same setup
  - `hostfully-client.test.ts:601-606`: Shows the existing pattern for testing error cases in sendMessage
  - Implementation files: Need to understand what changed to write accurate test assertions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: Tasks 1 and 2 completed, code changes applied
    Steps:
      1. Run `bun test` from project root
      2. Verify all tests pass including new ones
      3. Count total tests — should be MORE than before (new tests added)
    Expected Result: All tests pass, new test count > old test count
    Failure Indicators: Any test failure, or no new tests detected
    Evidence: .sisyphus/evidence/task-3-all-tests.txt

  Scenario: Typecheck passes
    Tool: Bash
    Preconditions: All code changes applied
    Steps:
      1. Run `bun run typecheck` from project root
      2. Check exit code
    Expected Result: Zero type errors, exit code 0
    Failure Indicators: Any type error or non-zero exit code
    Evidence: .sisyphus/evidence/task-3-typecheck.txt

  Scenario: No existing tests were modified
    Tool: Bash (git diff)
    Preconditions: All code changes applied
    Steps:
      1. Run `git diff skills/slack-bot/handlers.test.ts` and `git diff skills/hostfully-client/hostfully-client.test.ts`
      2. Verify diff only shows ADDITIONS (new test cases), no modifications to existing test code
    Expected Result: Only new code added, no existing test logic changed
    Failure Indicators: Existing test assertions modified or deleted
    Evidence: .sisyphus/evidence/task-3-test-scope.txt
  ```

  **Commit**: YES (commit 3)
  - Message: `test(slack-bot,hostfully-client): add tests for error handling improvements`
  - Files: `skills/slack-bot/handlers.test.ts`, `skills/hostfully-client/hostfully-client.test.ts`
  - Pre-commit: `bun test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run test). For each "Must NOT Have": search codebase for forbidden changes — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `bun run typecheck` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log pollution, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Typecheck [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Run `bun test` end-to-end. Verify typecheck passes. Check audit log format. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Tests [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                 | Files                                                                                   | Pre-commit |
| ------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| 1      | `fix(slack-bot): prevent expired_trigger_id by prioritizing views.open in edit handler` | `skills/slack-bot/approval-handlers.ts`                                                 | `bun test` |
| 2      | `fix(hostfully-client): capture full response body in requestOnce error path`           | `skills/hostfully-client/client.ts`                                                     | `bun test` |
| 3      | `test(slack-bot,hostfully-client): add tests for error handling improvements`           | `skills/slack-bot/handlers.test.ts`, `skills/hostfully-client/hostfully-client.test.ts` | `bun test` |

---

## Success Criteria

### Verification Commands

```bash
bun test                 # Expected: all pass, zero regressions
bun run typecheck        # Expected: zero errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Typecheck passes
- [ ] Audit log includes editedText on failure
- [ ] expired_trigger_id handled gracefully (not logged as error)
- [ ] Hostfully 400 errors include response body details
