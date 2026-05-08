# Slack UX Overhaul — Guest-Messaging Employee

## TL;DR

> **Quick Summary**: Consolidate all guest-messaging Slack messages into a single thread, enrich the parent message with guest/property context from a Hostfully API call, and keep the parent message updated at every lifecycle state transition. Eliminates orphaned top-level messages, raw UUIDs, and stale "processing" states.
>
> **Deliverables**:
>
> - Enriched parent message showing guest name, property, booking channel, check-in/out
> - All follow-up messages (approval card, no-action-needed, failure) posted as thread replies
> - Parent message reflects current state at all times (Processing → Awaiting approval → Sent/Rejected/No action needed)
> - Override card ("Take Action"/"Dismiss") moved into thread with compact format
> - Unit tests for new block builder functions
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (block builders) → Task 3 (enrich notify-received) → Task 5 (thread approval card) → Task 7 (parent state updates) → Task 9 (E2E verification)

---

## Context

### Original Request

The PM's Slack experience for guest-messaging tasks is cluttered and confusing:

1. The initial "Task received — processing" message has no guest/property context
2. The parent message stays frozen at "⏳ processing" even after the worker finishes
3. Non-happy-path messages (no-action-needed reasoning, override card) get posted as new top-level messages instead of thread replies
4. Raw UUIDs are shown everywhere instead of human-readable names
5. Information is scattered across multiple unconnected top-level messages per task

### Interview Summary

**Key Discussions**:

- **Enrichment approach**: Fetch lead data from Hostfully API (`GET /leads/{lead_uid}`) in the lifecycle before posting the notify-received message. Gets guest name, check-in/out, booking channel. Also store `message_content` from webhook payload (currently dropped).
- **Parent message behavior**: Update to summary status at each state transition. No intermediate updates during worker execution.
- **No-action-needed path**: Compact thread reply with brief explanation. No override card with buttons. Parent updates to "✅ No action needed".
- **Approval card**: Keep current rich card as-is, just post it as a thread reply under the parent message. `post-guest-approval.ts` already supports `--thread-ts` — just needs to be wired to `NOTIFY_MSG_TS`.
- **Technical metadata**: Parent is clean and human-readable. Thread reply includes task ID, property UID, lead UID for debugging.
- **Approved state**: Parent → "✅ Reply sent to Jane Smith"
- **Rejected state**: Keep current behavior (thread asks "what should I have done differently?")
- **Scope**: Guest-messaging employee only, no changes to other employees.
- **Tests**: Both unit tests for new block builders + E2E verification.

**Research Findings**:

- `raw_event` has `lead_uid`, `property_uid`, `thread_uid` but zero human-readable data
- Hostfully sends `message_content` in webhook but we DROP it at `hostfully.ts` line 34
- Poll-triggered tasks (`source: 'poll'`) have NO `property_uid` — only `lead_uid`. All enrichment MUST use `GET /leads/{lead_uid}` as sole source.
- The pre-check step already loads `tenantEnv` with `HOSTFULLY_API_KEY` — pattern can be reused
- `post-guest-approval.ts` already supports `--thread-ts` param (line 93, 338) — just not wired
- `NOTIFY_MSG_TS` is already passed to worker container as env var (lifecycle lines 398, 421)
- The override card builder has `notifyMsgRef` in scope (line 614) but doesn't use `thread_ts`
- `deliverable.metadata` already contains `guest_name`, `property_name` at approval time

### Metis Review

**Identified Gaps** (addressed):

- **Poll tasks have no `property_uid` in raw_event**: Enrichment uses `GET /leads/{lead_uid}` which works for both webhook and poll triggers. Lead response includes `propertyUid`, `guestInformation`, `checkIn`, `checkOut`, `channel`.
- **Override card removal kills Take Action capability**: Override card is NOT removed — it's moved into the thread as a compact thread reply with the same buttons. The `override_take_action` and `override_dismiss` action handlers continue to work regardless of threading.
- **`--thread-ts` wiring is a config change**: The archetype `instructions` in the DB must be updated to pass `$NOTIFY_MSG_TS` as `--thread-ts`. Also, the harness already passes this as an env var.
- **No lifecycle step for "Awaiting approval" update**: A new `step.run('update-notify-awaiting-approval', ...)` will be added between `set-reviewing` and `wait-for-approval`.
- **Rejection reply targets `approvalMsgTs`**: When approval card is a thread reply, rejection acknowledgment posts `thread_ts: approvalMsgTs`. Slack supports reply-to-reply — this creates a nested reply in the same thread. Must be explicitly tested.
- **Guest name at terminal updates**: `deliverable.metadata.guest_name` is already available via `post-guest-approval.ts` output. Terminal update blocks will use it for personalized messages like "✅ Reply sent to Jane Smith".

---

## Work Objectives

### Core Objective

Transform the guest-messaging Slack experience from scattered, context-free messages into a single, well-structured thread with rich context and real-time state updates.

### Concrete Deliverables

- `src/lib/slack-blocks.ts` — new block builder functions for enriched parent messages and state updates
- `src/inngest/employee-lifecycle.ts` — enriched notify-received, threaded override card, parent state updates, threaded no-action info
- `src/gateway/routes/hostfully.ts` — store `message_content` and `property_uid` from webhook payload
- `src/inngest/triggers/guest-message-poll.ts` — store `property_uid` if available from poll data
- Archetype `instructions` DB update — wire `$NOTIFY_MSG_TS` as `--thread-ts` to `post-guest-approval.ts`
- `tests/lib/slack-blocks.test.ts` — unit tests for new block builder functions
- `tests/inngest/lifecycle-enriched-notify.test.ts` — unit tests for enriched notify-received flow

### Definition of Done

- [ ] `pnpm test -- --run` passes (all existing + new tests)
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] E2E: All guest-messaging Slack messages appear in a single thread
- [ ] E2E: Parent message shows guest name, property, booking channel at task creation
- [ ] E2E: Parent message updates at every state transition
- [ ] E2E: No top-level messages other than the parent notification

### Must Have

- All messages for a single task consolidated in one thread
- Guest name and property context in the parent message
- Parent message reflects current lifecycle state at all times
- Approval card posted as a thread reply (not top-level)
- Override card posted as a thread reply (not top-level)
- Override card retains "Take Action" and "Dismiss" buttons
- Works for both webhook-triggered and poll-triggered tasks
- Existing approval flow logic unchanged (just presentation)
- Shared lifecycle code stays employee-agnostic (only guest-messaging-specific branches add enrichment)

### Must NOT Have (Guardrails)

- Do NOT add employee-specific language (guest, property, Hostfully) to shared lifecycle log messages or variable names in generic code paths
- Do NOT remove the override_take_action / override_dismiss button handlers from `src/gateway/slack/handlers.ts`
- Do NOT change the approval flow logic (approve/reject/edit behavior)
- Do NOT add intermediate status updates during worker execution ("Drafting reply...", "Reading messages...")
- Do NOT modify the summarizer (Papi Chulo) message format
- Do NOT change how `post-guest-approval.ts` builds its rich blocks (keep the card format)
- Do NOT make Hostfully API calls from the webhook route handler (enrichment happens in the lifecycle)
- Do NOT break the supersede detection flow (it reads `deliverable.metadata.approval_message_ts`)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (Tests-after)
- **Framework**: Vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Block builders**: Use Bash (Vitest) — run tests, assert pass/fail
- **Lifecycle changes**: Use Bash (Vitest) — run lifecycle tests
- **E2E**: Use Playwright (browser) — navigate Airbnb and Slack, send message, observe thread behavior

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — new utilities + webhook fix):
├── Task 1: Block builder functions for enriched messages [quick]
├── Task 2: Store message_content + property_uid from webhook [quick]
├── Task 3: Hostfully lead enrichment utility function [quick]
└── Task 4: Unit tests for block builders [quick]

Wave 2 (Core changes — lifecycle modifications, depends on Wave 1):
├── Task 5: Enrich notify-received + thread override card [deep]
├── Task 6: Thread the approval card (wire --thread-ts) [unspecified-high]
├── Task 7: Parent message state updates at all transitions [deep]
└── Task 8: Tests for lifecycle changes [unspecified-high]

Wave 3 (Verification):
├── Task 9: Docker rebuild + E2E verification [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
└── Task N: Notify completion (quick)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | -          | 4, 5, 7 | 1    |
| 2    | -          | 5, 9    | 1    |
| 3    | -          | 5, 7    | 1    |
| 4    | 1          | -       | 1    |
| 5    | 1, 2, 3    | 7, 9    | 2    |
| 6    | -          | 9       | 2    |
| 7    | 1, 3, 5    | 9       | 2    |
| 8    | 5, 6, 7    | -       | 2    |
| 9    | 5, 6, 7    | F1-F4   | 3    |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **4 tasks** — T5 → `deep`, T6 → `unspecified-high`, T7 → `deep`, T8 → `unspecified-high`
- **Wave 3**: **1 task** — T9 → `unspecified-high`
- **FINAL**: **5 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`, N → `quick`

---

## TODOs

- [x] 1. Block Builder Functions for Enriched Messages

  **What to do**:
  - Create new block builder functions in `src/lib/slack-blocks.ts` for all guest-messaging Slack message variants:
    - `buildEnrichedNotifyBlocks(params: { guestName: string; propertyName?: string; channel?: string; checkIn?: string; checkOut?: string; messageSnippet?: string; taskId: string })` — builds the initial enriched parent message:
      ```
      ⏳ *Processing reply for Jane Smith*
      _Luxury Private Room · Airbnb · May 15–18_
      > "Is there free WiFi at the property?"
      [context: Task `<taskId>`]
      ```
    - `buildNotifyStateBlocks(params: { emoji: string; text: string; guestName?: string; taskId: string })` — builds state update blocks for the parent message. Used at every transition. Format:
      ```
      {emoji} *{text}*
      [context: Task `<taskId>`]
      ```
      Examples: `⏳ Awaiting approval — reply drafted for Jane Smith`, `✅ Reply sent to Jane Smith`, `❌ Task failed`, `✅ No action needed`
    - `buildNoActionThreadBlocks(params: { reasoning: string; taskId: string; propertyUid?: string; leadUid?: string })` — compact thread reply for no-action-needed path:
      ```
      ℹ️ *No action needed*
      {reasoning}
      [context: Property `<uid>` | Lead `<uid>` | Task `<taskId>`]
      ```
    - `buildOverrideCardBlocks(params: { reasoning: string; taskId: string; roleName: string; displayContext?: Record<string, string> })` — moved override card for thread (keeps Take Action / Dismiss buttons but more compact format):
      ```
      🤖 *AI skipped this task*
      _Reasoning:_ {reasoning}
      [actions: 🔄 Take Action | ✅ Dismiss]
      [context: Task `<taskId>`]
      ```
  - All functions must be pure (no side effects, no API calls) — just return Slack block arrays
  - Export all functions from `src/lib/slack-blocks.ts`
  - Follow existing `buildSupersededBlocks()` pattern in the same file

  **Must NOT do**:
  - Do NOT add employee-specific language to function names (these are in a shared file — the names describe Slack UX concepts, not employee-specific concepts). The function names above are fine because they describe the UI pattern, not the business domain.
  - Do NOT add Hostfully imports or API calls to this file
  - Do NOT modify `buildSupersededBlocks()` or any existing functions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure utility functions with clear input/output contracts, no business logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 4, 5, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/slack-blocks.ts` — existing file with `buildSupersededBlocks()` — follow same export pattern, same block structure conventions
  - `src/inngest/employee-lifecycle.ts:204-216` — current notify-received blocks (inline) — this is what the new `buildEnrichedNotifyBlocks` replaces
  - `src/inngest/employee-lifecycle.ts:651-693` — current override card blocks (inline) — this is what the new `buildOverrideCardBlocks` replaces

  **API/Type References**:
  - Slack Block Kit: blocks use `type: 'section'` with `text.type: 'mrkdwn'`, `type: 'context'` with `elements`, `type: 'actions'` with button elements, `type: 'divider'`
  - Action IDs: `override_take_action` and `override_dismiss` — must match exactly (handlers in `src/gateway/slack/handlers.ts:698,747`)

  **WHY Each Reference Matters**:
  - `slack-blocks.ts` — shows the existing pattern: pure function, returns block array, exported
  - `employee-lifecycle.ts:204-216` — shows current inline block construction that will be replaced by calling the new function
  - `employee-lifecycle.ts:651-693` — shows current override card with action buttons, reasoning display, context fields — the new function must produce equivalent functionality

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Block builders return valid Slack block arrays
    Tool: Bash (Vitest)
    Preconditions: src/lib/slack-blocks.ts has the new functions exported
    Steps:
      1. Run: pnpm test -- --run tests/lib/slack-blocks.test.ts
      2. Assert all tests pass
    Expected Result: 0 failures
    Evidence: .sisyphus/evidence/task-1-block-builders-tests.txt

  Scenario: buildEnrichedNotifyBlocks output structure is correct
    Tool: Bash (node REPL)
    Preconditions: Functions exported from slack-blocks.ts
    Steps:
      1. Run: node -e "const { buildEnrichedNotifyBlocks } = require('./dist/lib/slack-blocks.js'); const blocks = buildEnrichedNotifyBlocks({ guestName: 'Jane Smith', propertyName: 'Luxury Room', channel: 'Airbnb', checkIn: 'May 15', checkOut: 'May 18', messageSnippet: 'Is there free WiFi?', taskId: 'test-123' }); console.log(JSON.stringify(blocks, null, 2))"
      2. Assert output contains section block with "Processing reply for Jane Smith"
      3. Assert output contains context block with "Task `test-123`"
      4. Assert output contains blockquote with message snippet
    Expected Result: Valid JSON block array with correct structure
    Evidence: .sisyphus/evidence/task-1-block-output-structure.json
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(slack): add enriched block builder functions for guest-messaging notifications`
  - Files: `src/lib/slack-blocks.ts`
  - Pre-commit: `pnpm test -- --run tests/lib/slack-blocks.test.ts`

- [x] 2. Store message_content and property_uid from Webhook Payload

  **What to do**:
  - In `src/gateway/routes/hostfully.ts` line 34, expand the destructuring to also capture `property_uid` (already captured, just confirming) and add `message_content` from the validated payload
  - Update the `raw_event` object at lines 125-130 to include `message_content` when present:
    ```typescript
    raw_event: {
      thread_uid: payload.thread_uid,
      message_uid: payload.message_uid,
      lead_uid: payload.lead_uid,
      property_uid: payload.property_uid,
      ...(payload.message_content ? { message_content: payload.message_content } : {}),
    },
    ```
  - Verify that the Zod schema in `src/gateway/validation/schemas.ts` already validates `message_content` as optional string (it does — line 330)
  - The poll trigger (`src/inngest/triggers/guest-message-poll.ts` line 239) does NOT have `property_uid` — leave it as-is. The enrichment utility (Task 3) will handle both cases by fetching from the lead API.

  **Must NOT do**:
  - Do NOT make any Hostfully API calls from the webhook route handler
  - Do NOT change the Zod schema validation
  - Do NOT modify the dedup logic or task creation flow
  - Do NOT change the poll trigger's raw_event format (it only has `lead_uid` + `source`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 3-line change, clear scope
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/routes/hostfully.ts:34` — current destructuring line: `const { agency_uid, event_type, message_uid, thread_uid, lead_uid } = payload;` — needs `property_uid` and access to `message_content`
  - `src/gateway/routes/hostfully.ts:125-130` — current `raw_event` object in task creation

  **API/Type References**:
  - `src/gateway/validation/schemas.ts:322-335` — Zod schema for Hostfully webhook. `message_content` is already validated as `z.string().optional()` at line 330. `property_uid` is validated at line 329.

  **Test References**:
  - `tests/gateway/routes/hostfully.test.ts` — existing webhook handler tests
  - `tests/gateway/hostfully-webhook.test.ts` — another test file for webhook handling

  **WHY Each Reference Matters**:
  - `hostfully.ts:34` — the exact line that drops `message_content` by not destructuring it
  - `hostfully.ts:125-130` — the exact location where `raw_event` is constructed — add `message_content` here
  - `schemas.ts:322-335` — confirms `message_content` is already validated, so we can safely use it

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Webhook with message_content stores it in raw_event
    Tool: Bash (curl + DB query)
    Preconditions: Gateway running on localhost:7700, test DB accessible
    Steps:
      1. Send webhook with message_content: curl -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-content-001","thread_uid":"test-thread-001","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2","message_content":"Is there free WiFi?"}'
      2. Query DB: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT raw_event FROM tasks WHERE external_id = 'hostfully-msg-test-content-001'"
      3. Assert raw_event contains "message_content": "Is there free WiFi?"
    Expected Result: raw_event JSON includes message_content field
    Evidence: .sisyphus/evidence/task-2-webhook-content-stored.txt

  Scenario: Webhook without message_content still works
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Send webhook WITHOUT message_content: curl -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-no-content-001","thread_uid":"test-thread-002","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb"}'
      2. Assert response is 200 with { ok: true, task_id: "..." }
      3. Query DB and confirm raw_event does NOT have message_content key
    Expected Result: Task created successfully, no message_content in raw_event
    Evidence: .sisyphus/evidence/task-2-webhook-no-content.txt
  ```

  **Commit**: YES
  - Message: `feat(hostfully): store message_content and property_uid from webhook payload`
  - Files: `src/gateway/routes/hostfully.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway`

- [x] 3. Hostfully Lead Enrichment Utility Function

  **What to do**:
  - Create `src/lib/hostfully-enrichment.ts` with a function to fetch lead data for Slack notification enrichment:

    ```typescript
    export interface LeadEnrichment {
      guestName: string | null;
      propertyName: string | null; // From lead's property — may be null
      checkIn: string | null;
      checkOut: string | null;
      bookingChannel: string | null; // AIRBNB, VRBO, DIRECT, etc.
    }

    export async function fetchLeadEnrichment(
      leadUid: string,
      apiKey: string,
      apiBaseUrl?: string,
    ): Promise<LeadEnrichment>;
    ```

  - The function calls `GET /leads/{lead_uid}` (same endpoint used in `get-messages.ts:226`) and extracts:
    - `guestInformation.firstName` + `guestInformation.lastName` → `guestName`
    - `checkInLocalDateTime` → `checkIn` (format as "May 15" for Slack display)
    - `checkOutLocalDateTime` → `checkOut` (format as "May 18")
    - `channel` → `bookingChannel`
  - It does NOT fetch property name (that would require a second API call to `/properties/{propertyUid}`). Property name will be shown only when available from deliverable metadata at later stages.
  - Handle errors gracefully: on any failure, return all-null object (non-fatal — the notify message falls back to generic format)
  - Keep the function minimal and focused — no Slack concerns, no side effects
  - Add unit tests in `tests/lib/hostfully-enrichment.test.ts` using fetch mocking (same pattern as `tests/lib/hostfully-precheck.test.ts`)

  **Must NOT do**:
  - Do NOT fetch property data (saves an API call — property name is not critical for the initial message)
  - Do NOT import Slack client or block builders
  - Do NOT modify `src/lib/hostfully-precheck.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility function with clear API contract, single fetch call, mocked tests
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/hostfully-precheck.ts` — exact same pattern: takes `leadUid` + `apiKey`, makes a single Hostfully API call, returns structured result, handles errors gracefully. Follow this pattern exactly.
  - `src/worker-tools/hostfully/get-messages.ts:226-231` — shows the `GET /leads/{leadUid}` call and `RawLead` type shape
  - `src/worker-tools/hostfully/get-messages.ts:30-42` — `RawLead` type definition showing available fields: `uid`, `propertyUid`, `type`, `status`, `channel`, `checkInLocalDateTime`, `checkOutLocalDateTime`, `guestInformation { firstName, lastName }`

  **Test References**:
  - `tests/lib/hostfully-precheck.test.ts` — testing pattern for Hostfully API utility: mocks `global.fetch`, asserts return values, tests error handling

  **WHY Each Reference Matters**:
  - `hostfully-precheck.ts` — exact same architectural pattern (thin API wrapper in `src/lib/`), follow its error handling and API key header pattern
  - `get-messages.ts:30-42` — defines the `RawLead` type that the API returns — use this to know exactly what fields to extract
  - `hostfully-precheck.test.ts` — shows how to mock `global.fetch` for testing Hostfully API calls without hitting the real API

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: fetchLeadEnrichment returns guest data from mocked API
    Tool: Bash (Vitest)
    Preconditions: src/lib/hostfully-enrichment.ts exists with the function
    Steps:
      1. Run: pnpm test -- --run tests/lib/hostfully-enrichment.test.ts
      2. Tests should cover: successful fetch, missing guestInformation, API error (returns null-filled object), network timeout
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-3-enrichment-tests.txt

  Scenario: fetchLeadEnrichment handles API failure gracefully
    Tool: Bash (Vitest)
    Preconditions: Test mocks fetch to return 500
    Steps:
      1. Assert function returns { guestName: null, propertyName: null, checkIn: null, checkOut: null, bookingChannel: null }
      2. Assert no exception is thrown
    Expected Result: Graceful degradation with null values
    Evidence: .sisyphus/evidence/task-3-enrichment-error-handling.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): add Hostfully lead enrichment utility for notify-received`
  - Files: `src/lib/hostfully-enrichment.ts`, `tests/lib/hostfully-enrichment.test.ts`
  - Pre-commit: `pnpm test -- --run tests/lib/hostfully-enrichment.test.ts`

- [x] 4. Unit Tests for Block Builder Functions

  **What to do**:
  - Add comprehensive Vitest tests to `tests/lib/slack-blocks.test.ts` for all new block builder functions created in Task 1
  - Test cases for `buildEnrichedNotifyBlocks`:
    - Full data: guestName, propertyName, channel, checkIn, checkOut, messageSnippet, taskId → verify all fields appear in blocks
    - Minimal data: only guestName + taskId → verify graceful handling of missing optional fields
    - Message snippet truncation: long message (>100 chars) → verify truncation with "..."
    - Special characters in guest name / message (Slack mrkdwn escaping)
  - Test cases for `buildNotifyStateBlocks`:
    - Various state texts: "Awaiting approval", "Reply sent to Jane Smith", "Task failed", "No action needed"
    - With and without guestName
  - Test cases for `buildNoActionThreadBlocks`:
    - With all fields
    - With missing propertyUid/leadUid (poll-triggered tasks)
  - Test cases for `buildOverrideCardBlocks`:
    - Verify action buttons have correct action_ids (`override_take_action`, `override_dismiss`)
    - Verify taskId is in button value fields
    - Verify reasoning text is included
    - With and without displayContext

  **Must NOT do**:
  - Do NOT test any lifecycle logic here — only block builder output
  - Do NOT import or mock Slack client

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure test writing for pure functions, clear expected output
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (can start as soon as Task 1 completes — but same Wave since Task 1 is quick)
  - **Parallel Group**: Wave 1 (runs after Task 1 within same wave)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `tests/lib/slack-blocks.test.ts` — existing test file for `buildSupersededBlocks()` — add new tests in the same file following the same pattern

  **Test References**:
  - `tests/lib/slack-blocks.test.ts` — existing file to extend with new test cases

  **WHY Each Reference Matters**:
  - `tests/lib/slack-blocks.test.ts` — contains the exact testing pattern (import, describe blocks, assertions on block array structure)

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: All new block builder tests pass
    Tool: Bash (Vitest)
    Preconditions: Task 1 complete (block builders exist)
    Steps:
      1. Run: pnpm test -- --run tests/lib/slack-blocks.test.ts
      2. Assert: all tests pass, including new tests for buildEnrichedNotifyBlocks, buildNotifyStateBlocks, buildNoActionThreadBlocks, buildOverrideCardBlocks
    Expected Result: 0 failures, at least 12 new test cases
    Evidence: .sisyphus/evidence/task-4-block-builder-tests.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(slack): add enriched block builder functions for guest-messaging notifications`
  - Files: `tests/lib/slack-blocks.test.ts`
  - Pre-commit: `pnpm test -- --run tests/lib/slack-blocks.test.ts`

- [x] 5. Enrich notify-received + Thread Override Card

  **What to do**:
  This task modifies the lifecycle to: (a) fetch lead data before posting the notify-received message, and (b) move the override card into the notify-received thread.

  **Part A — Enrich notify-received** (lines 184–223 of `src/inngest/employee-lifecycle.ts`):
  - After loading `tenantEnvForNotify`, extract `HOSTFULLY_API_KEY` from it
  - Read `taskData.raw_event` to get `lead_uid` and `message_content` (added by Task 2)
  - If `archetype.role_name === 'guest-messaging'` AND `lead_uid` is present:
    - Call `fetchLeadEnrichment(leadUid, apiKey)` (from Task 3)
    - Use `buildEnrichedNotifyBlocks(...)` (from Task 1) with the enriched data
    - If `message_content` is in `raw_event`, pass it as `messageSnippet`
  - If NOT guest-messaging OR enrichment fails OR no lead_uid:
    - Fall back to the current generic blocks (preserve existing behavior for other employees)
  - Store the enrichment result for later use by returning it alongside `notifyMsgRef`:
    ```typescript
    return {
      ts: result.ts,
      channel,
      enrichment: enrichmentResult, // { guestName, checkIn, checkOut, bookingChannel } or null
    };
    ```

  **Part B — Thread the override card** (lines 614–699):
  - In the `post-override-card` step, add `thread_ts: notifyMsgRef?.ts` to the `slackForCard.postMessage(...)` call at line 695
  - Use `buildOverrideCardBlocks(...)` (from Task 1) instead of the inline block construction
  - The `notifyMsgRef` is already in scope at this point — just pass `notifyMsgRef?.ts` as `thread_ts`
  - Also post a compact `buildNoActionThreadBlocks(...)` as a separate thread reply for the reasoning (before the override card), so the PM can see the explanation even if they dismiss the override card

  **Part C — Update notify-received for no-action path**:
  - In the `complete-no-action-timeout` step (line 763), use `buildNotifyStateBlocks({ emoji: '✅', text: 'No action needed', taskId })` instead of inline blocks
  - Same for `complete-override-dismissed` (line 803)

  **CRITICAL — Preserve employee-agnostic code**:
  - The enrichment branch MUST be inside an `if (archetype.role_name === 'guest-messaging')` guard
  - The generic path (for summarizer etc.) MUST remain unchanged
  - Log messages in shared code paths must NOT use guest-specific language

  **Must NOT do**:
  - Do NOT change notify-received for non-guest-messaging employees
  - Do NOT modify the pre-check step
  - Do NOT remove the override event waiting logic (`waitForEvent('wait-for-override', ...)`)
  - Do NOT change the override button handler logic in `src/gateway/slack/handlers.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex lifecycle modification with multiple interconnected changes, must preserve existing behavior for other employees
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, but sequentially after Wave 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 7, 8, 9
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:141-172` — pre-check step: shows the pattern for guest-messaging-specific branching (`if (archetype.role_name === 'guest-messaging')`) and loading tenant env for API key
  - `src/inngest/employee-lifecycle.ts:184-223` — current `notify-received` step to modify
  - `src/inngest/employee-lifecycle.ts:614-699` — current override card construction to replace with block builders + thread_ts
  - `src/inngest/employee-lifecycle.ts:695-699` — the `slackForCard.postMessage(...)` call where `thread_ts: notifyMsgRef?.ts` needs to be added

  **API/Type References**:
  - `src/lib/hostfully-enrichment.ts` — `fetchLeadEnrichment()` function (created in Task 3)
  - `src/lib/slack-blocks.ts` — `buildEnrichedNotifyBlocks()`, `buildOverrideCardBlocks()`, `buildNoActionThreadBlocks()`, `buildNotifyStateBlocks()` (created in Task 1)

  **WHY Each Reference Matters**:
  - `lifecycle.ts:141-172` — shows exact pattern for guest-messaging guard + tenantEnv + API key extraction — copy this pattern
  - `lifecycle.ts:184-223` — the exact code block to modify — enrichment data feeds into block builder
  - `lifecycle.ts:614-699` — the exact code block to refactor into block builder calls + add thread_ts

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Enriched notify-received message posted for guest-messaging tasks
    Tool: Bash (Vitest lifecycle tests)
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-enriched-notify.test.ts
      2. Test that when archetype.role_name === 'guest-messaging' and raw_event has lead_uid, the notify-received message uses buildEnrichedNotifyBlocks
      3. Test that when archetype.role_name !== 'guest-messaging', the notify-received message uses the original generic format
    Expected Result: Both paths work correctly
    Evidence: .sisyphus/evidence/task-5-enriched-notify-tests.txt

  Scenario: Override card posted in thread
    Tool: Bash (Vitest)
    Preconditions: lifecycle modified
    Steps:
      1. Test that post-override-card call includes thread_ts matching notifyMsgRef.ts
      2. Test that when notifyMsgRef.ts is null, override card still posts (without thread_ts)
    Expected Result: thread_ts is passed when available, graceful fallback when not
    Evidence: .sisyphus/evidence/task-5-override-threaded.txt

  Scenario: Enrichment failure falls back to generic message
    Tool: Bash (Vitest)
    Preconditions: Mock fetchLeadEnrichment to throw or return all-null
    Steps:
      1. Verify notify-received still posts the generic "⏳ Task received — processing" message
      2. Verify no error is logged (just a warn)
    Expected Result: Graceful fallback, non-fatal
    Evidence: .sisyphus/evidence/task-5-enrichment-fallback.txt
  ```

  **Commit**: YES (groups with Tasks 6, 7)
  - Message: `feat(slack): consolidate guest-messaging messages into single thread with enriched parent`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Thread the Approval Card (Wire --thread-ts)

  **What to do**:
  - The approval card (`post-guest-approval.ts`) already supports `--thread-ts` (line 93-94, used in postMessage at line 338). The `NOTIFY_MSG_TS` env var is already passed to the worker container (lifecycle lines 398, 421). The wiring gap is that the archetype's `instructions` (natural language prompt) doesn't tell OpenCode to pass `$NOTIFY_MSG_TS` as `--thread-ts`.
  - Update the guest-messaging archetype's `instructions` in the DB seed (`prisma/seed.ts`) to include guidance to pass `--thread-ts $NOTIFY_MSG_TS` when calling `post-guest-approval.ts`
  - Find the archetype ID for VLRE guest-messaging (`00000000-0000-0000-0000-000000000015`) in `prisma/seed.ts`
  - In the instructions text for this archetype, add a line like:
    ```
    When calling post-guest-approval.ts, ALWAYS pass --thread-ts $NOTIFY_MSG_TS to post the approval card in the notification thread.
    ```
  - Also update the live DB archetype instructions so the change takes effect without re-seeding:
    ```sql
    UPDATE archetypes SET instructions = '...' WHERE id = '00000000-0000-0000-0000-000000000015';
    ```
    This SQL update should be documented as a one-time migration step, or better: create a Prisma migration that updates the archetype instructions.

  **CRITICAL — Supersede detection compatibility**:
  - When the approval card is posted as a thread reply, its `ts` is still stored in `deliverable.metadata.approval_message_ts`. The `check-supersede` step uses this `ts` to update the old card. Thread replies have their own `ts` in Slack — `chat.update` works on thread messages the same way. No change needed to supersede logic.
  - The `pending_approvals.slack_ts` will now be a thread message `ts`. The Bolt action handlers (`guest_approve`, `guest_reject`, `guest_edit` in `src/gateway/slack/handlers.ts`) use `body.message.ts` to identify the card — this should still match because the action comes from the thread message itself.

  **Must NOT do**:
  - Do NOT modify `post-guest-approval.ts` (it already supports `--thread-ts`)
  - Do NOT modify the harness (`opencode-harness.mts`) — it already passes `NOTIFY_MSG_TS` as env var
  - Do NOT change the approval button handler logic in `handlers.ts`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires updating DB seed data and understanding natural language instruction wiring
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: None (independent of Wave 1 — only touches seed data)

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-guest-approval.ts:93-94` — `--thread-ts` argument parsing already exists
  - `src/worker-tools/slack/post-guest-approval.ts:338` — `...(params.threadTs ? { thread_ts: params.threadTs } : {})` — already wired into postMessage
  - `src/workers/opencode-harness.mts` — search for `NOTIFY_MSG_TS` to find where it's set as env var for the container (lines 398, 421)

  **API/Type References**:
  - `prisma/seed.ts` — archetype seed data for `00000000-0000-0000-0000-000000000015` (VLRE guest-messaging) — find the `instructions` field to update

  **WHY Each Reference Matters**:
  - `post-guest-approval.ts:93-94,338` — confirms the `--thread-ts` support already exists, no code change needed
  - `opencode-harness.mts` — confirms `NOTIFY_MSG_TS` is already available in the container env
  - `prisma/seed.ts` — this is where the archetype instructions live, the actual change target

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Approval card posts in thread (E2E verified in Task 9)
    Tool: Bash (DB query)
    Preconditions: Seed updated, DB archetype instructions updated
    Steps:
      1. Query DB: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT instructions FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015'"
      2. Assert instructions contain "--thread-ts" and "NOTIFY_MSG_TS"
    Expected Result: Instructions include threading guidance
    Evidence: .sisyphus/evidence/task-6-archetype-instructions.txt

  Scenario: Dry-run approval card with thread-ts
    Tool: Bash
    Preconditions: post-guest-approval.ts available
    Steps:
      1. Run dry-run: SLACK_BOT_TOKEN=test node -e "..." or tsx src/worker-tools/slack/post-guest-approval.ts --channel test --task-id test --guest-name "Jane" --property-name "Room" --check-in "May 15" --check-out "May 18" --booking-channel "AIRBNB" --original-message "WiFi?" --draft-response "Yes!" --confidence 90 --category "amenity" --lead-uid "test" --thread-uid "test" --message-uid "test" --thread-ts "1234567890.123456" --dry-run
      2. Assert output JSON blocks are valid and the message would be posted with thread_ts
    Expected Result: Dry run succeeds with thread_ts parameter accepted
    Evidence: .sisyphus/evidence/task-6-approval-dry-run.txt
  ```

  **Commit**: YES (groups with Tasks 5, 7)
  - Message: `feat(slack): consolidate guest-messaging messages into single thread with enriched parent`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Parent Message State Updates at All Transitions

  **What to do**:
  Modify `src/inngest/employee-lifecycle.ts` so the parent (notify-received) message is updated with enriched, human-readable status at EVERY state transition. Currently it's updated at terminal states but with generic text like "✅ Task complete".

  **Changes needed** (all in `employee-lifecycle.ts`, all behind `if (archetype.role_name === 'guest-messaging')` guard where applicable):
  1. **New step: `update-notify-reviewing`** — add between `set-reviewing` (line 969) and `track-pending-approval` (line 975):
     - Read `deliverable.metadata.guest_name` from the deliverable (same fetch pattern as `track-pending-approval`)
     - Update notify-received: `buildNotifyStateBlocks({ emoji: '⏳', text: 'Awaiting approval — reply drafted for {guestName}', taskId })`
     - If no guest name available, fall back to: `⏳ Awaiting approval — reply drafted`

  2. **Approved → Delivering** (line 1230-1245):
     - Currently: `✅ Approved by <@userId> — delivering now.`
     - Change to: `buildNotifyStateBlocks({ emoji: '⏳', text: 'Approved by <@userId> — delivering...', guestName, taskId })`
     - Read `guestName` from `deliverable.metadata.guest_name` (already fetched at line 1038)

  3. **Delivery complete** (line 1396-1414):
     - Currently: `✅ Task complete`
     - Change to: `buildNotifyStateBlocks({ emoji: '✅', text: 'Reply sent to {guestName}', taskId })`
     - Read `guestName` from `deliverable.metadata.guest_name`

  4. **Delivery failed** (around line 1357):
     - Currently: `❌ Task failed — delivery unsuccessful`
     - Change to: `buildNotifyStateBlocks({ emoji: '❌', text: 'Delivery failed — reply not sent to {guestName}', taskId })`

  5. **Approval timeout** (line 1046-1075):
     - Currently: `⏰ Daily summary expired — no action taken.` (generic text — bug!)
     - Change to: `buildNotifyStateBlocks({ emoji: '⏰', text: 'Expired — no action taken', taskId })`

  6. **Rejected** (after line 1458):
     - Parent currently not updated on rejection (this is a gap!)
     - Add: `buildNotifyStateBlocks({ emoji: '❌', text: 'Rejected by <@userId>', taskId })`

  7. **Superseded** (line 1434-1451):
     - Currently: `⏭️ Superseded` (generic)
     - Change to: `buildNotifyStateBlocks({ emoji: '⏭️', text: 'Superseded — newer message received', taskId })`

  8. **Failed (machine poll)** (line 449-479):
     - Currently: `❌ Task failed`
     - Change to: `buildNotifyStateBlocks({ emoji: '❌', text: 'Task failed', taskId })`

  **CRITICAL — Use block builders for guest-messaging, keep inline blocks for others**:
  - For guest-messaging tasks, use `buildNotifyStateBlocks()` from Task 1
  - For non-guest-messaging tasks, keep the existing inline block construction unchanged
  - Each update site needs: `if (archetype.role_name === 'guest-messaging') { /* use block builders */ } else { /* existing code */ }`
  - Exception: the `mark-failed` step (line 449) — this runs before we know the archetype role reliably in all paths. For safety, you can use `buildNotifyStateBlocks` unconditionally here since it's a generic format anyway.

  **Must NOT do**:
  - Do NOT change update logic for the approval card (approvalMsgTs updates) — only the notify-received (notifyMsgRef) updates
  - Do NOT remove any existing update calls — only replace the blocks/text within them
  - Do NOT change the summarizer path behavior

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple interconnected update sites across a 1600-line file, must track data flow and avoid breaking adjacent logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 5 (which modifies the same file)
  - **Parallel Group**: Wave 2 (sequential after Task 5)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 1, 3, 5

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1230-1245` — current approval update on notify-received (generic text)
  - `src/inngest/employee-lifecycle.ts:1396-1414` — current delivery complete update (generic text)
  - `src/inngest/employee-lifecycle.ts:975-1006` — `track-pending-approval` step (shows how to read `deliverable.metadata.guest_name`)
  - `src/inngest/employee-lifecycle.ts:1038` — `const metadata = (deliverable?.metadata as Record<string, unknown>) ?? {};` — shows metadata access pattern

  **API/Type References**:
  - `src/lib/slack-blocks.ts` — `buildNotifyStateBlocks()` (created in Task 1)
  - `deliverable.metadata.guest_name` — string, set by `post-guest-approval.ts` at line 355

  **WHY Each Reference Matters**:
  - `lifecycle.ts:1230-1245` — shows the exact inline block pattern that needs to be replaced with block builder call
  - `lifecycle.ts:975-1006` — shows how to read `deliverable.metadata.guest_name` — same pattern needed for the new `update-notify-reviewing` step
  - `lifecycle.ts:1038` — shows the metadata access pattern used throughout `handle-approval-result`

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Parent message updates at reviewing state with guest name
    Tool: Bash (Vitest)
    Preconditions: Tasks 1, 3, 5 complete
    Steps:
      1. Run: pnpm test -- --run tests/inngest
      2. Mock lifecycle flow with guest-messaging archetype
      3. Assert notify-received is updated when transitioning to Reviewing with "Awaiting approval — reply drafted for {guestName}"
    Expected Result: Parent message updated with guest context
    Evidence: .sisyphus/evidence/task-7-reviewing-state-update.txt

  Scenario: Parent message updates at terminal states
    Tool: Bash (Vitest)
    Preconditions: lifecycle modified
    Steps:
      1. Test approved → "Reply sent to {guestName}"
      2. Test rejected → "Rejected by <@userId>"
      3. Test failed → "Task failed"
      4. Test superseded → "Superseded — newer message received"
      5. Test timeout → "Expired — no action taken"
    Expected Result: Each terminal state uses buildNotifyStateBlocks with correct emoji and text
    Evidence: .sisyphus/evidence/task-7-terminal-state-updates.txt

  Scenario: Non-guest-messaging employees use original format
    Tool: Bash (Vitest)
    Preconditions: lifecycle modified
    Steps:
      1. Mock lifecycle flow with daily-summarizer archetype
      2. Assert notify-received uses original inline blocks (not buildNotifyStateBlocks)
    Expected Result: No change in behavior for other employees
    Evidence: .sisyphus/evidence/task-7-non-gm-unchanged.txt
  ```

  **Commit**: YES (groups with Tasks 5, 6)
  - Message: `feat(slack): consolidate guest-messaging messages into single thread with enriched parent`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. Tests for Lifecycle Changes

  **What to do**:
  - Create `tests/inngest/lifecycle-enriched-notify.test.ts` with comprehensive tests for:
    1. **Enriched notify-received**: guest-messaging task with lead_uid → verifies `fetchLeadEnrichment` is called, `buildEnrichedNotifyBlocks` is used, message posted with enriched content
    2. **Generic fallback**: non-guest-messaging task → verifies original generic blocks are used
    3. **Enrichment failure fallback**: guest-messaging task but `fetchLeadEnrichment` fails → verifies generic blocks are used
    4. **Threaded override card**: NO_ACTION_NEEDED path → verifies override card posted with `thread_ts: notifyMsgRef.ts`
    5. **Threaded no-action info**: verifies `buildNoActionThreadBlocks` used for thread explanation
    6. **Parent state updates**: verifies notify-received is updated with `buildNotifyStateBlocks` at reviewing, approved, delivered, rejected, failed, superseded
    7. **Guest name in terminal updates**: verifies `deliverable.metadata.guest_name` is read and used in state update text
    8. **Poll-triggered task** (no property_uid): verifies enrichment still works via lead_uid only
  - Follow the exact testing pattern from existing lifecycle tests (mock Inngest, mock fetch for Supabase, mock Slack client)

  **Must NOT do**:
  - Do NOT duplicate tests already covered by existing lifecycle test files
  - Do NOT test block builder output (that's in Task 4)
  - Do NOT test the approval card threading (that's a DB seed change verified in E2E)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration test writing requires understanding of lifecycle mocking patterns
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 5, 6, 7)
  - **Parallel Group**: Wave 2 (after Tasks 5, 6, 7)
  - **Blocks**: None
  - **Blocked By**: Tasks 5, 6, 7

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-override.test.ts` — testing pattern for the NO_ACTION_NEEDED / override card path
  - `tests/inngest/lifecycle-notify-msg-ts.test.ts` — testing pattern for notify-received message posting and ts tracking
  - `tests/inngest/employee-lifecycle-classification.test.ts` — testing pattern for classification-based branching

  **Test References**:
  - All three files above show the mock setup: `vi.mock('...', ...)`, `vi.fn()` for Slack client, `vi.fn()` for fetch (Supabase PostgREST calls)

  **WHY Each Reference Matters**:
  - `lifecycle-override.test.ts` — shows how to test the NO_ACTION_NEEDED path with mock Slack posting and thread_ts assertions
  - `lifecycle-notify-msg-ts.test.ts` — shows how to test notify-received message posting and ts capture

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: All new lifecycle tests pass
    Tool: Bash (Vitest)
    Preconditions: Tasks 5, 6, 7 complete
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-enriched-notify.test.ts
      2. Assert all tests pass
    Expected Result: 0 failures, at least 8 test cases
    Evidence: .sisyphus/evidence/task-8-lifecycle-tests.txt

  Scenario: Full test suite still passes
    Tool: Bash (Vitest)
    Preconditions: All code changes complete
    Steps:
      1. Run: pnpm test -- --run
      2. Assert no regressions in existing tests
    Expected Result: All existing tests pass, new tests pass
    Evidence: .sisyphus/evidence/task-8-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(lifecycle): add tests for enriched notify and threaded messages`
  - Files: `tests/inngest/lifecycle-enriched-notify.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Docker Rebuild + E2E Verification

  **What to do**:
  - Rebuild Docker worker image: `docker build -t ai-employee-worker:latest .`
  - Re-seed the database to pick up the archetype instruction changes from Task 6:
    ```bash
    pnpm prisma db seed
    ```
  - Run a full E2E test by sending a real message via Airbnb (or simulating a webhook), then verify:
    1. **Parent message is enriched**: Shows guest name, booking channel, check-in/out, message snippet
    2. **Approval card is in thread**: Posted as a reply to the parent message, not top-level
    3. **Parent updates to "Awaiting approval"**: After approval card is posted
    4. **Approve action**: Parent updates to "✅ Reply sent to {guestName}"
    5. **All messages are in one thread**: No orphan top-level messages
    6. **No raw UUIDs in parent**: Only in thread context blocks
  - Also test the NO_ACTION_NEEDED path:
    1. Send a message that will trigger "no action needed" (e.g., a duplicate question on a thread that was already answered)
    2. Verify parent updates to "✅ No action needed"
    3. Verify override card appears in the thread (not top-level)
    4. Verify reasoning is in a thread reply
  - Capture screenshots as evidence

  **Must NOT do**:
  - Do NOT skip the Docker rebuild (worker image must include seed changes)
  - Do NOT use dry-run mode for E2E
  - Do NOT modify any code in this task — only test and verify

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full E2E orchestration with Docker, Slack, and Hostfully integration
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 6, 7

  **References**:

  **Pattern References**:
  - AGENTS.md "Verified E2E flow" section — 12-step E2E flow with exact steps and expected outcomes
  - AGENTS.md "Simulate a webhook locally" — curl command for testing

  **External References**:
  - Airbnb thread: `https://www.airbnb.com/guest/messages/2525238359` (Olivia's test account)
  - Slack channel: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S` (#cs-guest-communication)

  **WHY Each Reference Matters**:
  - AGENTS.md E2E flow — provides the exact 12-step verification sequence and expected outcomes at each step

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Happy path — enriched parent + threaded approval + state updates
    Tool: Bash (webhook + DB queries) or Playwright (if using Airbnb)
    Preconditions: Docker rebuilt, DB seeded, services running
    Steps:
      1. Send a Hostfully webhook (or Airbnb message) that triggers guest-messaging
      2. Within 5 seconds, check Slack channel for the parent message
      3. Assert parent message contains guest name and booking info (not generic "Task received")
      4. Wait for worker to complete (~2-3 minutes)
      5. Check the thread under the parent message — approval card should be there
      6. Assert parent message now shows "Awaiting approval — reply drafted for {guestName}"
      7. Click "Approve & Send" (via Slack or manual event)
      8. Assert parent message updates to "✅ Reply sent to {guestName}"
      9. Assert NO other top-level messages were posted for this task
    Expected Result: Single enriched thread with state progression
    Failure Indicators: Generic "Task received — processing" text, approval card posted top-level, orphan messages
    Evidence: .sisyphus/evidence/task-9-e2e-happy-path.png

  Scenario: No-action-needed path — compact thread reply
    Tool: Bash (webhook)
    Preconditions: Thread already has a recent host reply (to trigger NO_ACTION_NEEDED)
    Steps:
      1. Send a webhook for a thread where the last message is already answered
      2. Wait for worker to complete
      3. Assert parent message shows "✅ No action needed"
      4. Assert override card with buttons appears in thread (not top-level)
      5. Assert reasoning explanation appears in thread
    Expected Result: Clean no-action-needed handling in thread
    Evidence: .sisyphus/evidence/task-9-e2e-no-action.png
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [x] N. **Notify completion** — Send Telegram notification: plan `slack-ux-overhaul` complete, all tasks done, come back to review results.
  ```bash
  tsx scripts/telegram-notify.ts "✅ slack-ux-overhaul complete — All tasks done. Come back to review results."
  ```

---

## Commit Strategy

| Commit | Tasks   | Message                                                                                     | Files                                                                           | Pre-commit                                          |
| ------ | ------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1      | 1, 4    | `feat(slack): add enriched block builder functions for guest-messaging notifications`       | `src/lib/slack-blocks.ts`, `tests/lib/slack-blocks.test.ts`                     | `pnpm test -- --run tests/lib/slack-blocks.test.ts` |
| 2      | 2       | `feat(hostfully): store message_content and property_uid from webhook payload`              | `src/gateway/routes/hostfully.ts`, `src/inngest/triggers/guest-message-poll.ts` | `pnpm test -- --run tests/gateway`                  |
| 3      | 3       | `feat(lifecycle): add Hostfully lead enrichment utility for notify-received`                | `src/lib/hostfully-enrichment.ts`, `tests/lib/hostfully-enrichment.test.ts`     | `pnpm test -- --run`                                |
| 4      | 5, 6, 7 | `feat(slack): consolidate guest-messaging messages into single thread with enriched parent` | `src/inngest/employee-lifecycle.ts`                                             | `pnpm test -- --run`                                |
| 5      | 8       | `test(lifecycle): add tests for enriched notify and threaded messages`                      | `tests/inngest/lifecycle-enriched-notify.test.ts`                               | `pnpm test -- --run`                                |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run           # Expected: all tests pass (existing + new)
pnpm lint                    # Expected: 0 errors
pnpm build                   # Expected: 0 errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] E2E verified: single thread per task in Slack
- [ ] E2E verified: parent message enriched with guest context
- [ ] E2E verified: parent message updates at every state transition
