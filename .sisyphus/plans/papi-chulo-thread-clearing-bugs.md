# Papi Chulo: Fix Thread-Clearing Lifecycle Bugs + Add LLM Admin Commands

> **Project**: vlre-employee (`/Users/victordozal/repos/real-estate/vlre-employee`)
> **IMPORTANT**: This plan targets the vlre-employee project, NOT the ai-employee project.

## TL;DR

> **Quick Summary**: Fix two bugs where `threadTracker.clear()` is skipped (approve/edit Hostfully 400 errors, reply-anyway handler), and add an extensible LLM-powered `@Papi Chulo` admin command system starting with "clear pending threads" and "show status".
>
> **Deliverables**:
>
> - Approve/edit handlers clear threads even on Hostfully send failure (with console.warn)
> - Reply-anyway handler clears threads after successful send
> - New admin command handler: `@Papi Chulo clear pending threads` / `@Papi Chulo show status`
> - Tests covering all changes
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 + Task 2 + Task 3 (parallel) → Task 4 (tests) → Final Wave

---

## Context

### Original Request

User observed that Papi Chulo keeps posting reminders for "unanswered" guest messages even after clearing `data/pending-threads.json` multiple times. Investigation revealed three root causes plus a feature request for a natural language admin command.

### Investigation Findings

**Bug 1 — Approve/Edit handlers skip `threadTracker.clear()` on Hostfully 400 (Critical)**
In `approval-handlers.ts`, `threadTracker.clear()` is inside the `try` block after `hostfullyClient.sendMessage()`. When Hostfully returns 400, the clear is never reached. Audit log proves: 6 of 12 currently pending threads have already been approved/edited by CS but remain tracked because Hostfully returned 400. The Slack card shows the error state, but reminders keep firing.

**Bug 2 — Reply-anyway handler never calls `threadTracker.clear()` (High)**
In `reply-anyway-handler.ts`, the `reply_anyway_modal` submit handler sends to Hostfully and updates Slack, but never clears the thread from the tracker. Any thread handled via "Reply Anyway" stays pending forever.

**Feature — LLM admin command via `@Papi Chulo` mention**
User wants to mention `@Papi Chulo` in Slack and issue natural language admin commands. LLM classifies intent and routes to the correct action. Starting with "clear pending threads" and "show status", extensible for future actions.

### Metis Review

**Identified Gaps** (addressed):

- Reject handler `clear()` placement: confirmed intentional (before try block) — no change needed
- Edit modal handler: same bug as approve handler — same fix needed
- Admin handler routing: works everywhere, but skips response on unrecognized intent if in summary thread or KB channel context
- `clearAll` doesn't exist on `SlackThreadTracker`: admin handler must iterate `getAllPending()` keys and call `clear()` for each
- OpenRouter timeout handling: must follow existing AbortController pattern from `callOpenRouterQA`

---

## Work Objectives

### Core Objective

Fix two bugs that cause infinite reminders for already-actioned threads, and add an extensible LLM admin command system so the team can manage Papi Chulo directly from Slack.

### Concrete Deliverables

- `skills/slack-bot/approval-handlers.ts` — clear threads on both success AND error paths in approve/edit handlers
- `skills/slack-bot/reply-anyway-handler.ts` — add `threadTracker.clear()` after successful send
- `skills/slack-bot/admin-command-handler.ts` (new file) — LLM-based admin command handler
- `src/index.ts` — register admin command handler
- Updated tests covering all changes

### Definition of Done

- [ ] `bun test` passes with zero new regressions
- [ ] `bun run typecheck` passes
- [ ] Approve handler clears thread even when `sendMessage` throws
- [ ] Edit modal handler clears thread even when `sendMessage` throws
- [ ] Reply-anyway handler clears thread after successful `sendMessage`
- [ ] `@Papi Chulo clear pending threads` clears all pending threads
- [ ] `@Papi Chulo show status` shows count + guest names + property + age
- [ ] Unrecognized mentions get a help response (unless in summary thread or KB channel)

### Must Have

- `threadTracker.clear()` in the `catch` block of approve handler (with `console.warn`)
- `threadTracker.clear()` in the `catch` block of edit modal handler (with `console.warn`)
- `threadTracker.clear()` after `sendMessage` success in reply-anyway modal handler
- New `admin-command-handler.ts` with LLM intent classification
- At least 2 admin actions: `clear_pending_threads`, `show_status`
- Extensible action routing (easy to add new actions later)
- Admin handler responds in ANY channel
- Unrecognized intent → reply with available commands (unless in summary thread or KB channel where other handlers will respond)

### Must NOT Have (Guardrails)

- No changes to the reject handler — its `clear()` placement is intentional
- No changes to the reminder scheduler interval or logic
- No changes to the supersede flow in processor.ts
- No TTL logic on pending threads
- No `clearAll()` method added to `SlackThreadTracker` — use existing `clear()` in a loop
- No access control or role checks on admin commands
- No changes to existing `app_mention` handlers (summary Q&A in index.ts, KB handler)
- No retry logic for admin commands
- No changes to `thread-tracker.ts` — the tracker class itself is correct

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (bun:test)
- **Automated tests**: YES (tests-after — update existing + create new test file)
- **Framework**: bun:test
- Tests co-located with source files

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
├── Task 1: Fix approve/edit handlers — clear thread on Hostfully send failure [quick]
├── Task 2: Fix reply-anyway handler — add threadTracker.clear() [quick]
└── Task 3: Create admin command handler [deep]

Wave 2 (After Wave 1 — depends on all 3 tasks):
└── Task 4: Add tests for all changes [unspecified-high]

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
| 1    | —          | 4, F1-F4 |
| 2    | —          | 4, F1-F4 |
| 3    | —          | 4, F1-F4 |
| 4    | 1, 2, 3    | F1-F4    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `deep`
- **Wave 2**: 1 task — T4 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix Approve/Edit Handlers — Clear Thread on Hostfully Send Failure

  **What to do**:

  **1a. Add `threadTracker.clear()` to the approve handler's `catch` block** (`approval-handlers.ts` lines 196-231):
  - Currently: the catch block logs the error, writes audit log, and updates Slack to error state — but never calls `threadTracker.clear()`
  - Add `threadTracker.clear(metadata.threadUid)` at the START of the catch block (line 197, before the error log)
  - Add `console.warn('[SLACK] Approve: Hostfully send failed, clearing thread anyway:', errorMsg)` right after the clear
  - The existing `console.error` at line 198 can be removed or kept — the `console.warn` replaces its purpose

  **1b. Add `threadTracker.clear()` to the edit modal handler's `catch` block** (`approval-handlers.ts` lines 499-536):
  - Same pattern as approve: the catch block logs error and updates Slack but never clears
  - Add `threadTracker.clear(modalMetadata.threadUid)` at the START of the catch block (line 500, before the error log)
  - Add `console.warn('[SLACK] Edit: Hostfully send failed, clearing thread anyway:', errorMsg)` right after

  **Must NOT do**:
  - Do NOT modify the reject handler — its `clear()` placement (before try, line 259) is intentional
  - Do NOT move or remove the existing `threadTracker.clear()` from the success paths (lines 139, 405)
  - Do NOT change any Slack message structure or Block Kit layouts
  - Do NOT add retry logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, two small additions to catch blocks following existing patterns
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `skills/slack-bot/approval-handlers.ts:131-139` — Approve handler SUCCESS path: `sendMessage` → `clear()`. Shows the pattern to mirror in the catch block
  - `skills/slack-bot/approval-handlers.ts:196-231` — Approve handler CATCH block: this is where `clear()` must be added
  - `skills/slack-bot/approval-handlers.ts:402-405` — Edit modal SUCCESS path: `sendMessage` → `clear()`. Same pattern to mirror
  - `skills/slack-bot/approval-handlers.ts:499-536` — Edit modal CATCH block: this is where `clear()` must be added
  - `skills/slack-bot/approval-handlers.ts:257-259` — Reject handler: `clear()` is BEFORE try. Do NOT change this.

  **WHY Each Reference Matters**:
  - Lines 131-139 and 402-405: Show the existing success-path clear pattern — mirror it
  - Lines 196-231 and 499-536: These ARE the catch blocks being modified — add `clear()` at the top
  - Lines 257-259: Proof that reject is correctly handled — do not touch

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Approve handler clears thread on Hostfully 400
    Tool: Bash (grep + read)
    Preconditions: Code changes applied
    Steps:
      1. Read `skills/slack-bot/approval-handlers.ts`
      2. Find the approve handler catch block (after `catch (error)` around line 196)
      3. Verify `threadTracker.clear(metadata.threadUid)` is present in the catch block
      4. Verify `console.warn` with 'clearing thread anyway' is present
    Expected Result: catch block contains both clear() and console.warn
    Failure Indicators: No clear() in catch block, or uses console.error instead of console.warn for the clearing message
    Evidence: .sisyphus/evidence/task-1-approve-catch-clear.txt

  Scenario: Edit modal handler clears thread on Hostfully 400
    Tool: Bash (grep + read)
    Preconditions: Code changes applied
    Steps:
      1. Read `skills/slack-bot/approval-handlers.ts`
      2. Find the edit modal catch block (after `catch (error)` around line 499)
      3. Verify `threadTracker.clear(modalMetadata.threadUid)` is present
      4. Verify `console.warn` with 'clearing thread anyway' is present
    Expected Result: catch block contains both clear() and console.warn
    Failure Indicators: No clear() in catch block
    Evidence: .sisyphus/evidence/task-1-edit-catch-clear.txt

  Scenario: Reject handler is NOT modified
    Tool: Bash (git diff)
    Preconditions: Code changes applied
    Steps:
      1. Run `git diff skills/slack-bot/approval-handlers.ts`
      2. Verify lines 235-263 (reject handler) have NO changes in the diff
    Expected Result: Reject handler code is untouched
    Failure Indicators: Any changes in the registerRejectHandler function
    Evidence: .sisyphus/evidence/task-1-reject-untouched.txt

  Scenario: bun test passes
    Tool: Bash
    Steps:
      1. Run `bun test` from project root
    Expected Result: All tests pass, exit code 0
    Evidence: .sisyphus/evidence/task-1-test-pass.txt
  ```

  **Commit**: YES (commit 1)
  - Message: `fix(slack-bot): clear pending thread on Hostfully send failure in approve/edit handlers`
  - Files: `skills/slack-bot/approval-handlers.ts`
  - Pre-commit: `bun test`

- [x] 2. Fix Reply-Anyway Handler — Add threadTracker.clear()

  **What to do**:

  Add `threadTracker.clear(modalMetadata.threadUid)` to the `reply_anyway_modal` submit handler in `reply-anyway-handler.ts`, after `sendMessage` succeeds.

  **Exact location**: After line 127 (`console.log('[SLACK] Reply Anyway: sent message')`), before line 129 (building the `context` object). Insert:

  ```
  threadTracker.clear(modalMetadata.threadUid);
  ```

  This mirrors the pattern from `approval-handlers.ts:405` where the edit modal clears the thread after a successful send.

  **Important**: Only add `clear()` on the SUCCESS path (inside the `try` block, after `sendMessage`). Do NOT add it to the catch block — if `sendMessage` fails in reply-anyway, the thread should stay pending (unlike approve/edit where the CS team's intent was already captured).

  **Must NOT do**:
  - Do NOT add `clear()` to the catch block (lines 153-166) — only on success
  - Do NOT modify the button action handler (`app.action('reply_anyway')`, lines 63-106) — only the modal submission
  - Do NOT modify the audit log or error handling patterns

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, one-line addition
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `skills/slack-bot/reply-anyway-handler.ts:108-167` — The modal submission handler — THIS IS WHAT YOU'RE MODIFYING
  - `skills/slack-bot/reply-anyway-handler.ts:125-127` — The success path after sendMessage — insert clear() after line 127
  - `skills/slack-bot/approval-handlers.ts:403-405` — Edit modal success path: `sendMessage` → `clear()`. This is the PATTERN to follow.

  **WHY Each Reference Matters**:
  - Lines 108-167: Full modal handler — understand the structure before inserting
  - Lines 125-127: Exact insertion point — after `sendMessage` succeeds and log fires
  - approval-handlers.ts:403-405: Identical pattern to replicate

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Reply-anyway modal clears thread after successful send
    Tool: Bash (grep + read)
    Preconditions: Code changes applied
    Steps:
      1. Read `skills/slack-bot/reply-anyway-handler.ts`
      2. Find the reply_anyway_modal view handler
      3. Verify `threadTracker.clear(modalMetadata.threadUid)` appears AFTER `sendMessage` and BEFORE `client.chat.update`
    Expected Result: clear() is present in the success path, between sendMessage and chat.update
    Failure Indicators: No clear() call, or clear() in wrong location (catch block)
    Evidence: .sisyphus/evidence/task-2-reply-anyway-clear.txt

  Scenario: clear() is NOT in the catch block
    Tool: Bash (read)
    Preconditions: Code changes applied
    Steps:
      1. Read `skills/slack-bot/reply-anyway-handler.ts`
      2. Examine the catch block (lines 153-166)
      3. Verify NO `threadTracker.clear` call exists in the catch block
    Expected Result: catch block does not contain threadTracker.clear
    Evidence: .sisyphus/evidence/task-2-no-catch-clear.txt

  Scenario: bun test passes
    Tool: Bash
    Steps:
      1. Run `bun test` from project root
    Expected Result: All tests pass, exit code 0
    Evidence: .sisyphus/evidence/task-2-test-pass.txt
  ```

  **Commit**: YES (commit 2)
  - Message: `fix(slack-bot): add threadTracker.clear to reply-anyway handler`
  - Files: `skills/slack-bot/reply-anyway-handler.ts`
  - Pre-commit: `bun test`

- [x] 3. Create LLM-Powered Admin Command Handler

  **What to do**:

  **3a. Create `skills/slack-bot/admin-command-handler.ts`** (new file):

  Create an extensible admin command handler with this architecture:
  1. **Registration function**: `registerAdminCommandHandler(app, threadTracker)` — registers an `app.event('app_mention')` listener
  2. **Intent classifier**: Calls OpenRouter LLM to classify the mention text into one of: `clear_pending_threads`, `show_status`, or `unknown`
  3. **Action router**: Maps classified intent to action handler functions
  4. **Action handlers**: Individual functions for each admin action

  **Intent classification prompt**: Send the mention text (stripped of the `<@BOT_ID>` prefix) to OpenRouter with a system prompt like:

  ```
  You are an intent classifier for a Slack bot admin command system. Classify the user's message into one of these intents:
  - "clear_pending_threads": User wants to clear/flush/remove all pending message threads
  - "show_status": User wants to see current status, pending thread count, or system info
  - "unknown": Message doesn't match any known admin command

  Respond with ONLY a JSON object: {"intent": "clear_pending_threads"} or {"intent": "show_status"} or {"intent": "unknown"}
  ```

  **Action: `clear_pending_threads`**:
  - Call `threadTracker.getAllPending()` to get all pending threads
  - Iterate `Object.keys(result)` and call `threadTracker.clear(uid)` for each
  - Reply in Slack: "Cleared N pending thread(s)" with a brief list of guest names/properties cleared

  **Action: `show_status`**:
  - Call `threadTracker.getAllPending()` to get all pending threads
  - Calculate age for each thread: `Math.floor((Date.now() - SlackThreadTracker.getPostedAtMs(thread.slackTs)) / 60000)` minutes
  - Format and reply: count + list with guest name, property, and age (e.g., "Richard Pena · 3412-SAN-1 · 4h 23m ago")
  - If no pending threads: "No pending threads"

  **Action: `unknown`**:
  - Check if the event is in a context where another handler will respond:
    - If `event.thread_ts` exists → could be a summary thread Q&A, do NOT respond
    - Otherwise → reply with: "I can help with these commands:\n• _Clear pending threads_ — remove all pending message reminders\n• _Show status_ — see current pending thread count and details"

  **OpenRouter call pattern**: Follow `src/index.ts:441-474` (`callOpenRouterQA`) exactly:
  - Read `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `OPENROUTER_TIMEOUT_MS` from env
  - Use `AbortController` + `setTimeout` for timeout
  - Parse JSON from response: try `JSON.parse` on the content, fallback to regex extraction
  - If OpenRouter fails, reply with a brief error message: "Sorry, I couldn't process that. Try: 'clear pending threads' or 'show status'"

  **3b. Register the handler in `src/index.ts`**:
  - Import `registerAdminCommandHandler` from `../skills/slack-bot/admin-command-handler.ts`
  - Call it BEFORE `startSlackApp(slackApp)` (around line 334), alongside the other handler registrations
  - Pass `slackApp` and `threadTracker` as arguments

  **Must NOT do**:
  - Do NOT modify existing `app_mention` handlers (summary Q&A at line 301, KB handler)
  - Do NOT add a `clearAll()` method to `SlackThreadTracker` — use `clear()` in a loop
  - Do NOT add access control or role checks
  - Do NOT use a different LLM model — use the same `OPENROUTER_MODEL` env var
  - Do NOT make the handler async-blocking — keep it responsive (the LLM call is the only await)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: New file creation with LLM integration, multiple action handlers, and careful routing logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/index.ts:441-474` — `callOpenRouterQA()` — EXACT OpenRouter call pattern to follow (env vars, AbortController, timeout, response parsing)
  - `skills/kb-assistant/kb-handlers.ts:47-58` — KB handler registration function structure — follow this pattern for `registerAdminCommandHandler`
  - `skills/slack-bot/approval-handlers.ts:97-102` — Approval handler registration signature — shows how handlers accept `app`, `threadTracker`
  - `src/index.ts:301-333` — Existing `app_mention` handler for summary Q&A — shows how mentions are processed and how `thread_ts` guards work

  **API/Type References**:
  - `skills/thread-tracker/thread-tracker.ts:87-93` — `getAllPending()` returns `Record<string, PendingThread>` (a copy, not the live map)
  - `skills/thread-tracker/thread-tracker.ts:103-107` — `clear(hostfullyThreadUid: string)` — single thread deletion
  - `skills/thread-tracker/thread-tracker.ts:109-111` — `static getPostedAtMs(slackTs: string): number` — converts Slack timestamp to ms

  **External References**:
  - OpenRouter chat completions API: `POST /chat/completions` with `{ model, messages, max_tokens }`

  **WHY Each Reference Matters**:
  - `callOpenRouterQA` (lines 441-474): Copy this pattern exactly for OpenRouter calls — env vars, headers, AbortController, timeout, response shape
  - KB handler (lines 47-58): Shows the registration function pattern — exports a function that takes `app` and registers event handlers
  - thread-tracker types: Must know `getAllPending()` returns a copy (not live), and `clear()` takes a single UID

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Admin command handler file exists and exports registration function
    Tool: Bash (read)
    Preconditions: Code changes applied
    Steps:
      1. Read `skills/slack-bot/admin-command-handler.ts`
      2. Verify it exports a `registerAdminCommandHandler` function
      3. Verify the function registers an `app.event('app_mention', ...)` listener
    Expected Result: File exists with correct export and event registration
    Failure Indicators: File missing, wrong export name, no app.event registration
    Evidence: .sisyphus/evidence/task-3-handler-exists.txt

  Scenario: Handler is registered in index.ts
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. Search `src/index.ts` for `registerAdminCommandHandler`
      2. Verify it's imported and called with slackApp and threadTracker
    Expected Result: Import and call site present in index.ts
    Evidence: .sisyphus/evidence/task-3-registration.txt

  Scenario: OpenRouter call follows established pattern
    Tool: Bash (read)
    Preconditions: Code changes applied
    Steps:
      1. Read `skills/slack-bot/admin-command-handler.ts`
      2. Verify it reads OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL from env
      3. Verify it uses AbortController + setTimeout for timeout
      4. Verify it sends a POST to `${baseUrl}/chat/completions`
    Expected Result: OpenRouter call pattern matches callOpenRouterQA
    Evidence: .sisyphus/evidence/task-3-openrouter-pattern.txt

  Scenario: bun test and typecheck pass
    Tool: Bash
    Steps:
      1. Run `bun test` from project root
      2. Run `bun run typecheck` from project root
    Expected Result: All pass, exit code 0
    Evidence: .sisyphus/evidence/task-3-test-typecheck.txt
  ```

  **Commit**: YES (commit 3)
  - Message: `feat(slack-bot): add LLM-powered admin command handler via @mention`
  - Files: `skills/slack-bot/admin-command-handler.ts`, `src/index.ts`
  - Pre-commit: `bun test`

- [x] 4. Add Tests for All Changes

  **What to do**:

  **4a. Add tests for approve handler error-path clearing** (`skills/slack-bot/handlers.test.ts`):
  - Add a test case that simulates `hostfullyClient.sendMessage` throwing an error on approve
  - Verify `threadTracker.clear()` IS called with the correct threadUid even though sendMessage failed
  - Verify a `console.warn` is emitted (optional — focus on `clear()` assertion)

  **4b. Add tests for edit modal handler error-path clearing** (`skills/slack-bot/handlers.test.ts`):
  - Add a test case that simulates `hostfullyClient.sendMessage` throwing an error on edit modal submit
  - Verify `threadTracker.clear()` IS called with the correct threadUid

  **4c. Add test for reply-anyway handler clearing** (`skills/slack-bot/reply-anyway-handler.test.ts`):
  - Check if this test file exists. If it does, add a new test. If not, create it following the pattern from `handlers.test.ts`.
  - Add a test case that simulates successful `sendMessage` in the reply_anyway_modal handler
  - Verify `threadTracker.clear()` IS called with the correct threadUid

  **4d. Add tests for admin command handler** (`skills/slack-bot/admin-command-handler.test.ts`):
  - Create a new test file
  - Test: LLM classification is called on app_mention events (mock the OpenRouter call)
  - Test: `clear_pending_threads` intent → `threadTracker.clear()` called for each pending thread
  - Test: `show_status` intent → response includes thread count and guest names
  - Test: `unknown` intent outside summary thread → help message posted
  - Test: `unknown` intent inside a thread (thread_ts present) → no response posted
  - Mock OpenRouter responses with predefined JSON

  **Must NOT do**:
  - Do NOT modify existing passing tests — only ADD new test cases
  - Do NOT modify `thread-tracker.test.ts` — the tracker class is unchanged
  - Do NOT test the LLM's actual classification quality — just mock the response and test routing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, requires understanding mock patterns across the project, new test file creation
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `skills/slack-bot/handlers.test.ts` — Existing test file for approval handlers — follow mock setup, test structure
  - `skills/slack-bot/reply-anyway-handler.test.ts` — If exists, follow its patterns; if not, create following handlers.test.ts patterns
  - `skills/slack-bot/reminder-scheduler.test.ts` — Shows how to mock SlackThreadTracker with `getAllPending()` and `clear()` spies

  **Implementation References** (the code being tested):
  - `skills/slack-bot/approval-handlers.ts:196-231` — Approve catch block (Task 1 changes)
  - `skills/slack-bot/approval-handlers.ts:499-536` — Edit modal catch block (Task 1 changes)
  - `skills/slack-bot/reply-anyway-handler.ts:108-167` — Reply-anyway modal handler (Task 2 changes)
  - `skills/slack-bot/admin-command-handler.ts` — Admin command handler (Task 3, new file)

  **WHY Each Reference Matters**:
  - `handlers.test.ts`: Contains the existing mock patterns for Slack client, body, ack — new tests must use the same approach
  - `reminder-scheduler.test.ts`: Shows how to mock `threadTracker.getAllPending()` and `threadTracker.clear()` — needed for admin command tests
  - Implementation files: Need to understand what changed to write accurate assertions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Steps:
      1. Run `bun test` from project root
      2. Verify all tests pass including new ones
    Expected Result: All tests pass, exit code 0
    Evidence: .sisyphus/evidence/task-4-all-tests.txt

  Scenario: Typecheck passes
    Tool: Bash
    Steps:
      1. Run `bun run typecheck` from project root
    Expected Result: Zero type errors, exit code 0
    Evidence: .sisyphus/evidence/task-4-typecheck.txt

  Scenario: New test files exist
    Tool: Bash (ls)
    Steps:
      1. Verify `skills/slack-bot/admin-command-handler.test.ts` exists
      2. Count total tests in changed test files
    Expected Result: New test file exists, test count increased
    Evidence: .sisyphus/evidence/task-4-test-files.txt
  ```

  **Commit**: YES (commit 4)
  - Message: `test(slack-bot): add tests for thread-clearing fixes and admin commands`
  - Files: `skills/slack-bot/handlers.test.ts`, `skills/slack-bot/reply-anyway-handler.test.ts`, `skills/slack-bot/admin-command-handler.test.ts`
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
      Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Run `bun test` end-to-end. Verify typecheck passes. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Tests [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                   | Files                                                                                                                                  | Pre-commit |
| ------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1      | `fix(slack-bot): clear pending thread on Hostfully send failure in approve/edit handlers` | `skills/slack-bot/approval-handlers.ts`                                                                                                | `bun test` |
| 2      | `fix(slack-bot): add threadTracker.clear to reply-anyway handler`                         | `skills/slack-bot/reply-anyway-handler.ts`                                                                                             | `bun test` |
| 3      | `feat(slack-bot): add LLM-powered admin command handler via @mention`                     | `skills/slack-bot/admin-command-handler.ts`, `src/index.ts`                                                                            | `bun test` |
| 4      | `test(slack-bot): add tests for thread-clearing fixes and admin commands`                 | `skills/slack-bot/handlers.test.ts`, `skills/slack-bot/reply-anyway-handler.test.ts`, `skills/slack-bot/admin-command-handler.test.ts` | `bun test` |

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
- [ ] Approve/edit handlers clear thread on 400 with console.warn
- [ ] Reply-anyway handler clears thread on success
- [ ] Admin command handler responds to @mentions
- [ ] "clear pending threads" action works
- [ ] "show status" action returns count + details
