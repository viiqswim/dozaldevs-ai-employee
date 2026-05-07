# Generic Override System — Replace Reply Anyway with Employee-Agnostic NO_ACTION Override

## TL;DR

> **Quick Summary**: Replace the guest-messaging-specific "Reply Anyway" pattern with a generic, employee-agnostic override system. When any AI employee classifies work as NO_ACTION_NEEDED, the lifecycle posts a generic Slack card; humans can override via a modal with direction text, creating a new linked task.
>
> **Deliverables**:
>
> - Generic override card posted by lifecycle (not worker) for all NO_ACTION_NEEDED classifications
> - Slack modal for human direction input (follows `guest_edit` pattern)
> - New linked task creation on override (not same-task re-run)
> - `OVERRIDE_DIRECTION` env var injection in harness
> - Full removal of Reply Anyway pattern (handler, lifecycle flow, shell tool, env var)
> - Updated archetype instructions (workers just classify, don't post cards)
> - Updated and new tests covering the generic override flow
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (classify contract) → T3 (lifecycle override) → T5 (harness) → T7 (instructions) → T8 (cleanup) → F1-F4

---

## Context

### Original Request

Replace the guest-messaging-specific "Reply Anyway" pattern with a scalable, employee-agnostic override system. When AI says "no action needed," humans should be able to disagree and provide direction via a Slack modal, triggering a new linked task with that direction.

### Interview Summary

**Key Discussions**:

- **Separation of concerns**: Worker ONLY classifies → Lifecycle handles Slack notification → Human overrides via modal
- **Direction input**: Slack modal (not thread reply, not plain button) — follows existing `guest_edit` modal pattern
- **Override dispatch**: Create NEW LINKED TASK (original → Done with metadata, new task with direction) — NOT same-task re-run. Rationale: cleaner audit trail, avoids backward state transitions, compatible with thread-level dedup
- **Reply Anyway removal**: User explicitly said "get rid of it" — no two competing patterns
- **Generic design**: Must work for ANY employee type (summarizer, guest-messaging, future employees)

**Research Findings**:

- Lifecycle NO_ACTION flow lives at lines 535-877 of `employee-lifecycle.ts` — includes `check-classification`, `cleanup-no-action`, `wait-for-reply-anyway` (24h), same-task re-run machine spawn, poll, failure handling
- `guest_edit` modal (handlers.ts:516-653) is the exact reference pattern: `client.views.open()`, `private_metadata`, `view.state.values`, Inngest event fire
- `post-no-action-notification.ts` is 260 lines with 13 guest-messaging-specific params — NOT generic, to be deleted
- Harness reads `REPLY_ANYWAY_CONTEXT` (line 506) and completely overrides instructions — new `OVERRIDE_DIRECTION` will prepend direction instead
- `createTaskAndDispatch` (inngest/lib) wraps PostgREST task creation + `inngest.send()` in a step — too coupled for inline lifecycle use; override will use direct PostgREST + `inngest.send()` in a step

### Self-Performed Gap Analysis (Metis Equivalent)

**Identified Gaps** (all addressed in plan):

- `ClassifyResult` interface needs generic `displayContext` field for employee-agnostic card rendering
- Backward compat: existing workers write guest-specific fields, not `displayContext` — parser must synthesize `displayContext` from legacy fields
- Override card `ts` must be stored in deliverable metadata for later update on dismiss/timeout
- `OVERRIDE_DIRECTION` must be injected via env var in the new linked task's machine (same pattern as `FEEDBACK_CONTEXT`)
- 3 existing test files directly test Reply Anyway — must be rewritten to test new override pattern
- `inngest-serve.test.ts` function count will NOT change (no new Inngest functions added, just new event handling within existing lifecycle)

---

## Work Objectives

### Core Objective

Replace the Reply Anyway pattern with a generic override system that works for any employee type, using a new linked task model instead of same-task re-run.

### Concrete Deliverables

- Modified `src/lib/classify-message.ts` — `ClassifyResult` with `displayContext` + backward compat synthesis
- Modified `src/inngest/employee-lifecycle.ts` — generic override card posting, waitForEvent, new linked task creation (replacing ~340 lines of Reply Anyway flow)
- Modified `src/gateway/slack/handlers.ts` — new `override_take_action`, `override_dismiss`, `override_take_action_modal` handlers; removed `guest_reply_anyway`, `isTaskPendingReplyAnyway`, `NO_ACTION_BUTTON_BLOCKS`
- Modified `src/workers/opencode-harness.mts` — `OVERRIDE_DIRECTION` env var handling (replacing `REPLY_ANYWAY_CONTEXT`)
- Deleted `src/worker-tools/slack/post-no-action-notification.ts`
- Modified `prisma/seed.ts` — updated archetype instructions (NO_ACTION paths)
- New/rewritten tests covering override flow

### Definition of Done

- [ ] `pnpm build` passes
- [ ] `pnpm test -- --run` passes (no new failures beyond 39 pre-existing)
- [ ] Override card appears in Slack when lifecycle detects NO_ACTION_NEEDED
- [ ] "Take Action" button opens modal, submit creates new linked task
- [ ] "Dismiss" button marks task Done immediately
- [ ] 24h timeout with no action marks task Done (existing behavior preserved)
- [ ] New linked task runs full lifecycle with `OVERRIDE_DIRECTION` available to worker
- [ ] No references to `reply-anyway`, `REPLY_ANYWAY_CONTEXT`, `guest_reply_anyway`, or `post-no-action-notification.ts` remain in codebase

### Must Have

- Generic override card with AI reasoning + employee-specific displayContext fields
- Slack modal for direction text input
- New linked task creation (not same-task re-run)
- `OVERRIDE_DIRECTION` env var in new task's worker machine
- Full removal of Reply Anyway pattern
- Backward compat for existing workers that don't emit `displayContext`
- All existing test files updated (no broken tests)

### Must NOT Have (Guardrails)

- No guest-messaging-specific language in shared files (`employee-lifecycle.ts`, `handlers.ts`, `opencode-harness.mts`) — employee-agnostic only
- No modification to `createTaskAndDispatch` (shared infrastructure)
- No new Inngest functions (override handled within existing lifecycle)
- No new Prisma models or migrations (use existing `tasks` table with metadata)
- No changes to the NEEDS_APPROVAL flow (`guest_approve`, `guest_edit`, `guest_reject` handlers)
- No `as any` or `@ts-ignore` in new code
- No hardcoded channel IDs
- No inline delivery logic (per PLAT-05 constraint)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, `@inngest/test`, Bolt mocks)
- **Automated tests**: YES (Tests-after) — rewrite existing Reply Anyway tests + add new override tests
- **Framework**: Vitest

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Lifecycle behavior**: Bash (curl to PostgREST) + Vitest test runs
- **Slack handlers**: Vitest mock-based handler tests
- **Harness**: Vitest unit tests for env var handling
- **Build/lint**: `pnpm build && pnpm lint`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately, MAX PARALLEL):
├── Task 1: ClassifyResult displayContext + backward compat [quick]
├── Task 2: Override Slack handlers (take_action, dismiss, modal) [unspecified-high]

Wave 2 (Core lifecycle — after Wave 1):
├── Task 3: Lifecycle generic override path (card + waitForEvent + linked task) [deep]
├── Task 4: Remove Reply Anyway from lifecycle (cleanup old code) [unspecified-high]

Wave 3 (Harness + instructions + tests — after Wave 2):
├── Task 5: Harness OVERRIDE_DIRECTION env var [quick]
├── Task 6: Rewrite Reply Anyway tests → override tests [unspecified-high]
├── Task 7: Update archetype instructions + delete post-no-action-notification.ts [quick]

Wave 4 (Cleanup + verification — after Wave 3):
├── Task 8: Codebase sweep — remove all Reply Anyway references [quick]
├── Task 9: Build, lint, test verification [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On     | Blocks         | Wave  |
| ----- | -------------- | -------------- | ----- |
| T1    | —              | T3, T6         | 1     |
| T2    | —              | T3, T6         | 1     |
| T3    | T1, T2         | T4, T5, T6, T7 | 2     |
| T4    | T3             | T8             | 2     |
| T5    | T3             | T8, T9         | 3     |
| T6    | T1, T2, T3     | T9             | 3     |
| T7    | T3             | T8, T9         | 3     |
| T8    | T4, T5, T7     | T9             | 4     |
| T9    | T5, T6, T7, T8 | F1-F4          | 4     |
| F1-F4 | T9             | —              | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `unspecified-high`
- **Wave 2**: 2 tasks — T3 → `deep`, T4 → `unspecified-high`
- **Wave 3**: 3 tasks — T5 → `quick`, T6 → `unspecified-high`, T7 → `quick`
- **Wave 4**: 2 tasks — T8 → `quick`, T9 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add generic `displayContext` to ClassifyResult with backward compatibility

  **What to do**:
  - Add `displayContext?: Record<string, string>` field to the `ClassifyResult` interface in `src/lib/classify-message.ts`
  - In `parseClassifyResponse()`, extract `displayContext` from parsed JSON if present
  - Add backward compatibility: if `displayContext` is NOT present but guest-specific fields ARE (guestName, propertyName, checkIn, checkOut, etc.), synthesize a `displayContext` from those fields:
    ```
    displayContext: {
      "Guest": guestName,
      "Property": propertyName,
      "Check-in": checkIn,
      "Check-out": checkOut,
      "Channel": bookingChannel,
    }
    ```
  - Only include keys where the value is non-empty
  - Add tests for: (a) explicit displayContext pass-through, (b) guest-field synthesis, (c) both present (explicit wins), (d) neither present (empty object)

  **Must NOT do**:
  - Do not remove existing guest-specific fields from `ClassifyResult` (backward compat)
  - Do not change `parseClassifyResponse` return type for NEEDS_APPROVAL classifications
  - Do not rename existing fields

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file modification with clear logic, plus test additions
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None needed — straightforward TypeScript changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/classify-message.ts:1-86` — Full file. `ClassifyResult` interface (lines 1-19) defines the type. `parseClassifyResponse()` (lines 26-86) is the parser. Lines 76-84 show how optional guest fields are conditionally spread — follow same pattern for `displayContext`.

  **Test References**:
  - `tests/lib/classify-message.test.ts` — Full test file for `parseClassifyResponse`. Follow existing test structure. Add new `describe('displayContext')` block.

  **WHY Each Reference Matters**:
  - `classify-message.ts`: You need to modify both the interface AND the parser. The conditional spread pattern at lines 76-84 is exactly how `displayContext` should be handled.
  - `classify-message.test.ts`: Tests must follow the existing structure to stay consistent.

  **Acceptance Criteria**:
  - [ ] `ClassifyResult` interface includes `displayContext?: Record<string, string>`
  - [ ] `parseClassifyResponse()` extracts explicit `displayContext` from JSON
  - [ ] When no explicit `displayContext` but guest fields present → synthesized displayContext returned
  - [ ] When both present → explicit `displayContext` wins
  - [ ] When neither present → `displayContext` is `undefined`
  - [ ] `pnpm build` passes
  - [ ] All existing `classify-message.test.ts` tests still pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Explicit displayContext passed through
    Tool: Bash (vitest)
    Preconditions: Test file updated with new test case
    Steps:
      1. Run `pnpm test -- --run tests/lib/classify-message.test.ts`
      2. Verify test "explicit displayContext is extracted from JSON" passes
      3. Test input: JSON with `displayContext: { "Guest": "John", "Property": "Beach House" }`
    Expected Result: `result.displayContext` equals `{ "Guest": "John", "Property": "Beach House" }`
    Failure Indicators: Test fails, displayContext undefined or wrong shape
    Evidence: .sisyphus/evidence/task-1-explicit-display-context.txt

  Scenario: Guest fields synthesized into displayContext
    Tool: Bash (vitest)
    Preconditions: Test file updated with synthesis test case
    Steps:
      1. Run `pnpm test -- --run tests/lib/classify-message.test.ts`
      2. Verify test "guest fields synthesized into displayContext" passes
      3. Test input: JSON with guestName, propertyName, checkIn, checkOut but NO displayContext
    Expected Result: `result.displayContext` has keys "Guest", "Property", "Check-in", "Check-out"
    Failure Indicators: displayContext is undefined when guest fields are present
    Evidence: .sisyphus/evidence/task-1-synthesis-display-context.txt

  Scenario: Build still passes
    Tool: Bash
    Preconditions: Changes saved
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
    Expected Result: Build succeeds with no type errors
    Failure Indicators: TypeScript compilation errors referencing ClassifyResult
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES
  - Message: `feat(classify): add generic displayContext to ClassifyResult with backward compat`
  - Files: `src/lib/classify-message.ts`, `tests/lib/classify-message.test.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Add generic override Slack handlers (take_action, dismiss, modal)

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, add three new handlers inside `registerSlackHandlers()`:

  **Handler 1 — `override_take_action` action** (opens modal):
  - Follow `guest_edit` pattern (lines 516-568) exactly
  - Extract `taskId` from `actionBody.actions[0]?.value`
  - Extract `channelId` from `actionBody.channel?.id`, `messageTs` from `actionBody.message?.ts`
  - `await ack()` first
  - Check task is not in terminal state: call `isTaskAwaitingOverride(taskId)` (new helper — similar to `isTaskPendingReplyAnyway` but checks for `Submitting` status since NO_ACTION tasks are in Submitting state waiting for override event)
  - If terminal → update message to "already resolved", return
  - Open modal via `client.views.open()`:
    - `callback_id: 'override_take_action_modal'`
    - `private_metadata: JSON.stringify({ taskId, channelId, messageTs })`
    - Title: `"Provide Direction"`
    - Submit: `"Send Direction"`
    - Close: `"Cancel"`
    - Blocks: read-only context section showing "The AI determined no action was needed. Provide direction below if you disagree." + multiline text input (`block_id: 'direction_input'`, `action_id: 'direction_text'`)

  **Handler 2 — `override_dismiss` action** (marks Done immediately):
  - Extract `taskId` from `actionBody.actions[0]?.value`
  - `await ack()` with `replace_original: true` showing "✅ Dismissed by <@userId>"
  - Fire `employee/override.dismissed` event: `{ taskId, userId: user.id, userName: user.name }`
  - This event will be caught by the lifecycle's `waitForEvent` — lifecycle handles the Done transition

  **Handler 3 — `override_take_action_modal` view** (submits direction):
  - Follow `guest_edit_modal` pattern (lines 571-653) exactly
  - Extract direction text from `view.state.values?.direction_input?.direction_text?.value`
  - Validate non-empty (return `response_action: 'errors'` if empty)
  - Parse `private_metadata` for `taskId`, `channelId`, `messageTs`
  - Fire `employee/override.requested` event: `{ taskId, direction: directionText.trim(), userId: user.id, userName: user.name }`
  - Dedup ID: `employee-override-${taskId}`
  - Update original message to "⏳ Processing override..."

  **New helper — `isTaskAwaitingOverride(taskId)`**:
  - Similar to `isTaskPendingReplyAnyway` (lines 88-117) but rename and check for non-terminal status
  - This replaces `isTaskPendingReplyAnyway` conceptually

  **Must NOT do**:
  - Do not modify `guest_approve`, `guest_edit`, `guest_reject`, `guest_reject_modal` handlers
  - Do not add guest-messaging-specific text in any handler
  - Do not use `respond()` — use `ack()` with `replace_original` for processing state (Socket Mode pattern)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple handlers with complex Slack Bolt patterns, modal views, event firing, and idempotency checks
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None — standard TypeScript/Slack patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:516-568` — `guest_edit` action handler. THIS IS THE EXACT PATTERN for `override_take_action`. Copy structure: extract taskId, ack, views.open with callback_id/private_metadata/blocks.
  - `src/gateway/slack/handlers.ts:571-653` — `guest_edit_modal` view handler. THIS IS THE EXACT PATTERN for `override_take_action_modal`. Copy structure: extract view.state.values, validate non-empty, parse private_metadata, fire Inngest event, update message.
  - `src/gateway/slack/handlers.ts:88-117` — `isTaskPendingReplyAnyway` function. Pattern for the new `isTaskAwaitingOverride` helper. Uses PostgREST to check task status, returns boolean.
  - `src/gateway/slack/handlers.ts:712-794` — `guest_reply_anyway` action handler. Shows the ack-with-replace_original Socket Mode pattern and error recovery with button restore.
  - `src/gateway/slack/handlers.ts:169-181` — `NO_ACTION_BUTTON_BLOCKS` helper. Shows how button blocks are structured for reference when building new override buttons.

  **API/Type References**:
  - `src/gateway/types.ts` — `InngestLike` type used for the `inngest` parameter

  **External References**:
  - Slack Block Kit: button actions, modal views, view submissions — patterns are fully represented in the codebase references above

  **WHY Each Reference Matters**:
  - Lines 516-568: You're building an identical flow (button click → modal open) so copy the structure exactly
  - Lines 571-653: Your modal submission handler must follow this pattern for metadata parsing, validation, event firing, and message updating
  - Lines 88-117: The idempotency check pattern is reusable — same PostgREST call, just with different function name
  - Lines 712-794: Shows error recovery and the ack pattern unique to Socket Mode

  **Acceptance Criteria**:
  - [ ] `override_take_action` action registered in `registerSlackHandlers`
  - [ ] `override_dismiss` action registered in `registerSlackHandlers`
  - [ ] `override_take_action_modal` view registered in `registerSlackHandlers`
  - [ ] `isTaskAwaitingOverride` helper function exists
  - [ ] Modal opens with direction text input on "Take Action" click
  - [ ] Empty direction text returns validation error
  - [ ] `employee/override.requested` event fired with `{ taskId, direction, userId, userName }` on modal submit
  - [ ] `employee/override.dismissed` event fired with `{ taskId, userId, userName }` on dismiss
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Override modal opens on take_action click
    Tool: Bash (vitest)
    Preconditions: Handler registered, mock Bolt app set up
    Steps:
      1. Invoke `override_take_action` handler with mock body containing taskId and trigger_id
      2. Assert `client.views.open` was called with callback_id 'override_take_action_modal'
      3. Assert private_metadata contains serialized taskId, channelId, messageTs
    Expected Result: Modal opens with correct structure
    Failure Indicators: views.open not called, wrong callback_id, missing private_metadata
    Evidence: .sisyphus/evidence/task-2-modal-open.txt

  Scenario: Override modal submit fires event with direction
    Tool: Bash (vitest)
    Preconditions: Modal view handler registered
    Steps:
      1. Invoke `override_take_action_modal` view handler with direction text "Please respond to this guest"
      2. Assert `inngest.send` called with name 'employee/override.requested'
      3. Assert data includes `{ taskId, direction: "Please respond to this guest", userId, userName }`
    Expected Result: Event fired with correct payload
    Failure Indicators: inngest.send not called, missing direction field
    Evidence: .sisyphus/evidence/task-2-modal-submit.txt

  Scenario: Empty direction text returns validation error
    Tool: Bash (vitest)
    Preconditions: Modal view handler registered
    Steps:
      1. Invoke `override_take_action_modal` with empty direction text
      2. Assert ack called with response_action 'errors'
      3. Assert inngest.send was NOT called
    Expected Result: Validation error returned, no event sent
    Failure Indicators: Event sent with empty direction, no validation error
    Evidence: .sisyphus/evidence/task-2-empty-validation.txt

  Scenario: Dismiss fires dismissed event
    Tool: Bash (vitest)
    Preconditions: Handler registered
    Steps:
      1. Invoke `override_dismiss` handler with mock body containing taskId
      2. Assert ack called with replace_original showing dismissed state
      3. Assert `inngest.send` called with name 'employee/override.dismissed'
    Expected Result: Dismissed event fired, message updated
    Failure Indicators: Wrong event name, ack not called
    Evidence: .sisyphus/evidence/task-2-dismiss.txt

  Scenario: Already-resolved task shows warning
    Tool: Bash (vitest)
    Preconditions: Mock PostgREST returns terminal task status
    Steps:
      1. Invoke `override_take_action` handler with taskId of terminal-state task
      2. Assert modal was NOT opened
      3. Assert message updated to "already resolved"
    Expected Result: No modal, resolved message shown
    Failure Indicators: Modal opens for terminal task
    Evidence: .sisyphus/evidence/task-2-already-resolved.txt
  ```

  **Commit**: YES
  - Message: `feat(slack): add generic override handlers (take_action, dismiss, modal)`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Implement lifecycle generic override path (card + waitForEvent + linked task creation)

  **What to do**:
  This is the core task. Replace the entire Reply Anyway NO_ACTION flow (lines 535-877) with the generic override system. The work has two parts:

  **Part A — Generic override card posting** (replaces worker-posted card):
  After `cleanup-no-action` step (line 572-586, which destroys the machine), add new step `post-override-card`:
  - Load tenant env (bot token, notification channel) — same pattern as `notify-received` step (lines 150-180)
  - Read the deliverable to get the classification result (same as existing `check-classification` step)
  - Call `parseClassifyResponse()` to get `summary` and `displayContext`
  - Build Slack blocks for the override card:
    - Header: `"ℹ️ No Action Needed"`
    - Section: AI's summary/reasoning text
    - Fields section: render `displayContext` as key-value Slack fields (iterate Record<string, string>). If displayContext empty/undefined, skip this section.
    - Actions block with two buttons:
      - `"💬 Take Action"` — action_id `override_take_action`, value: `taskId`
      - `"✅ Dismiss"` — action_id `override_dismiss`, value: `taskId`
    - Context block: `Task \`${taskId}\``
  - Post card via `slackClient.postMessage()` to the notification channel
  - Store the card's `ts` and `channel` in deliverable metadata via PostgREST PATCH: `metadata: { ...existingMeta, override_card_ts: result.ts, override_card_channel: channel }`
  - Return `{ overrideCardTs: result.ts, overrideCardChannel: channel }`

  **Part B — waitForEvent + handle override or dismiss or timeout**:
  Replace the existing `wait-for-reply-anyway` step (line 588) with:
  - `step.waitForEvent('wait-for-override', { event: 'employee/override.requested', match: 'data.taskId', timeout: '${timeoutHours}h' })`
  - BUT ALSO need to handle `employee/override.dismissed` — use a SECOND waitForEvent in parallel? NO — Inngest doesn't support that cleanly. Instead:
    - Use SINGLE `step.waitForEvent` for `employee/override.requested`
    - The `override_dismiss` handler will fire `employee/override.dismissed` — but we handle dismissal DIFFERENTLY: the dismiss handler will directly PATCH the task to Done via PostgREST and update the Slack card. The lifecycle's waitForEvent will eventually time out, and the `complete-no-action-timeout` step will check if task is already Done before doing anything (idempotent).

    **ACTUALLY — BETTER APPROACH**: Have the dismiss handler fire `employee/override.requested` with `direction: null` (or a sentinel like `__DISMISS__`). Then the lifecycle has one waitForEvent:
    - If event received and `direction` is truthy → create new linked task
    - If event received and `direction` is null/empty → mark Done immediately (dismissed)
    - If timeout → mark Done (no action taken in 24h)

  **Part C — New linked task creation**:
  When override event has direction (non-null):
  - New step `create-override-task`:
    - `POST /rest/v1/tasks` via PostgREST with:
      - `archetype_id`: same as original task
      - `tenant_id`: same as original task
      - `source_system`: `'override'`
      - `external_id`: `override-${taskId}` (dedup key)
      - `status`: `'Ready'`
      - `raw_event`: `{ override_of_task_id: taskId, direction: event.data.direction }`
      - `metadata`: `{ override_direction: event.data.direction, overridden_by: event.data.userId }`
    - PATCH original task: `status: 'Done'`, `metadata: { ...existing, overridden: true, override_task_id: newTaskId, overridden_by: event.data.userId }`
    - Fire `employee/task.dispatched` event: `{ taskId: newTaskId, archetypeId }` with dedup ID `employee-dispatch-override-${taskId}`
    - Update notify-received Slack message to "🔄 Override — new task created"
    - Update override card to "🔄 Override by <@userId> — new task dispatched"
  - Return `newTaskId`

  **Part D — Dismiss + timeout handling**:
  When override event has no direction (dismiss) or timeout:
  - PATCH task to Done
  - Update notify-received message to "✅ Task complete — no action needed"
  - Update override card to "✅ Dismissed" (if dismissed) or "✅ Task complete — no action needed (24h timeout)" (if timeout)
  - Clear pending approval if applicable

  **Must NOT do**:
  - Do not reference guest-specific fields (guestName, propertyName, etc.) in this code — use only `displayContext`
  - Do not use employee-specific language in log messages (no "guest", "message", "reply")
  - Do not modify `createTaskAndDispatch` — create task inline via PostgREST
  - Do not change the NEEDS_APPROVAL flow (lines 884+)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core lifecycle modification, ~340 lines replaced, complex state machine with multiple paths (override/dismiss/timeout), PostgREST calls, Slack message updates, and new task creation
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None — deep understanding of lifecycle is needed, not specialized tooling

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 4, but T3 must complete before T4 starts)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:150-180` — `notify-received` step. Pattern for loading tenant env + bot token + posting Slack message. Copy this exact pattern for the override card posting step.
  - `src/inngest/employee-lifecycle.ts:536-569` — `check-classification` step. Shows how to read deliverable, call `parseClassifyResponse()`, and check classification. The override card step reads the same data.
  - `src/inngest/employee-lifecycle.ts:572-586` — `cleanup-no-action` step. The override card step goes AFTER this step.
  - `src/inngest/employee-lifecycle.ts:588-592` — `wait-for-reply-anyway` waitForEvent. Replace with `wait-for-override` using `employee/override.requested` event.
  - `src/inngest/employee-lifecycle.ts:594-670` — `complete-no-action-timeout` step. Pattern for timeout handling — updating both Slack messages, PATCH task to Done.
  - `src/inngest/employee-lifecycle.ts:673-877` — Reply Anyway re-run flow. THIS ENTIRE BLOCK IS DELETED and replaced by the new linked task creation.
  - `src/inngest/lib/create-task-and-dispatch.ts:53-73` — Shows how to create a task via PostgREST and fire `employee/task.dispatched`. Use this as reference for the inline task creation in the lifecycle step.

  **API/Type References**:
  - `src/lib/classify-message.ts:1-19` — `ClassifyResult` interface with `displayContext` (after Task 1)
  - `src/lib/slack-client.ts` — `postMessage`, `updateMessage` method signatures

  **WHY Each Reference Matters**:
  - Lines 150-180: Exact pattern for Slack client setup within lifecycle step — PrismaClient, loadTenantEnv, createSlackClient, postMessage
  - Lines 536-569: Shows deliverable reading + parsing pattern that will be reused for override card content
  - Lines 594-670: Timeout handling pattern that will be adapted for the new timeout/dismiss case
  - Lines 673-877: The code being DELETED — must understand fully to ensure no important behavior is lost
  - `create-task-and-dispatch.ts:53-73`: PostgREST task creation + inngest.send() pattern to copy inline

  **Acceptance Criteria**:
  - [ ] Override card posted to notification channel after NO_ACTION_NEEDED classification
  - [ ] Card has header, AI summary, displayContext fields (if present), Take Action + Dismiss buttons, task ID context
  - [ ] Override card `ts` stored in deliverable metadata for later updates
  - [ ] `waitForEvent` listens for `employee/override.requested` with correct match and timeout
  - [ ] Override with direction → new task created via PostgREST, original task Done, event dispatched
  - [ ] Dismiss (direction null) → task Done, cards updated
  - [ ] Timeout → task Done, cards updated (same as existing behavior)
  - [ ] New linked task has correct `raw_event`, `metadata`, `external_id`, `archetype_id`, `tenant_id`
  - [ ] No guest-messaging-specific language in any log messages or comments
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Override card posted with displayContext fields
    Tool: Bash (vitest — lifecycle test)
    Preconditions: Mock deliverable returns NO_ACTION_NEEDED with displayContext
    Steps:
      1. Run lifecycle with NO_ACTION_NEEDED classification
      2. Assert Slack postMessage called with blocks containing displayContext fields
      3. Assert card has "Take Action" and "Dismiss" buttons
      4. Assert deliverable metadata patched with override_card_ts and override_card_channel
    Expected Result: Card posted with correct structure
    Failure Indicators: No postMessage call, missing buttons, no metadata update
    Evidence: .sisyphus/evidence/task-3-override-card.txt

  Scenario: Override creates new linked task
    Tool: Bash (vitest — lifecycle test)
    Preconditions: Mock waitForEvent returns override event with direction
    Steps:
      1. Fire lifecycle through NO_ACTION → override event with direction "Reply to the guest about parking"
      2. Assert PostgREST POST /rest/v1/tasks called with correct body
      3. Assert original task PATCHed to Done with overridden metadata
      4. Assert inngest.send called with employee/task.dispatched for new task
    Expected Result: New task created, original Done, dispatch event sent
    Failure Indicators: No new task created, original not marked Done, missing dispatch
    Evidence: .sisyphus/evidence/task-3-linked-task.txt

  Scenario: Dismiss marks task Done immediately
    Tool: Bash (vitest — lifecycle test)
    Preconditions: Mock waitForEvent returns override event with null direction
    Steps:
      1. Fire lifecycle through NO_ACTION → override event with direction null
      2. Assert task PATCHed to Done
      3. Assert Slack messages updated to dismissed text
      4. Assert NO new task created
    Expected Result: Task Done, no new task
    Failure Indicators: New task created on dismiss, task not Done
    Evidence: .sisyphus/evidence/task-3-dismiss.txt

  Scenario: 24h timeout marks task Done
    Tool: Bash (vitest — lifecycle test)
    Preconditions: Mock waitForEvent returns null (timeout)
    Steps:
      1. Fire lifecycle through NO_ACTION → waitForEvent times out (returns null)
      2. Assert task PATCHed to Done
      3. Assert Slack messages updated to timeout text
    Expected Result: Task Done on timeout
    Failure Indicators: Task not Done, error thrown
    Evidence: .sisyphus/evidence/task-3-timeout.txt

  Scenario: Override card renders without displayContext (empty)
    Tool: Bash (vitest — lifecycle test)
    Preconditions: Deliverable has NO_ACTION_NEEDED but no displayContext
    Steps:
      1. Run lifecycle with classification that has no displayContext
      2. Assert card posted without fields section (header + summary + buttons only)
    Expected Result: Card still renders correctly with just summary
    Failure Indicators: Error thrown due to missing displayContext, card not posted
    Evidence: .sisyphus/evidence/task-3-no-display-context.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(lifecycle): replace Reply Anyway with generic override card + linked task`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Remove Reply Anyway code from lifecycle

  **What to do**:
  After Task 3 has written the new override path, verify and clean up any remaining Reply Anyway code in `employee-lifecycle.ts`:
  - Remove the `reply_anyway` infinite loop guard (lines 540-550 in original) — no longer needed since new system creates a fresh task
  - Remove `build-reply-context` step (lines 696-717) — guest-specific context extraction
  - Remove `reply-anyway-execute` step (lines 719-778) — same-task re-run machine spawn
  - Remove `reply-anyway-poll` step (lines 780-793) — polling for re-run completion
  - Remove Reply Anyway failure handling (lines 795-876) — Slack updates on re-draft failure
  - Remove the `stopLocalDockerContainer` call for reply containers (lines 872-874, 878-881)
  - Verify NO references to `reply_anyway`, `REPLY_ANYWAY_CONTEXT`, `replyAnywayEvent`, `replyContext`, `replyMachineId`, `replyDraftStatus` remain in the file

  **NOTE**: Task 3 REPLACES the code at lines 588-877. Task 4 is a CLEANUP pass to catch anything Task 3 missed, ensure no stale variable references, and verify the file compiles cleanly. If Task 3 does a complete job, Task 4 may be a quick verification pass.

  **Must NOT do**:
  - Do not modify the `check-classification` step (lines 536-569) — it's still used
  - Do not modify `cleanup-no-action` step (lines 572-586) — it's still used
  - Do not modify anything after the NO_ACTION block (line 884+)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Careful code deletion with verification — needs to ensure nothing breaks
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run after T3)
  - **Parallel Group**: Wave 2 (sequential after Task 3)
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:540-550` — Infinite loop guard to remove
  - `src/inngest/employee-lifecycle.ts:696-717` — `build-reply-context` step to remove
  - `src/inngest/employee-lifecycle.ts:719-778` — `reply-anyway-execute` step to remove
  - `src/inngest/employee-lifecycle.ts:780-793` — `reply-anyway-poll` step to remove
  - `src/inngest/employee-lifecycle.ts:795-877` — Reply Anyway failure handling to remove

  **WHY Each Reference Matters**:
  - Each reference points to a specific block of Reply Anyway code that must be removed. After Task 3 replaces the main flow, these line numbers may shift — use the step names (e.g., `build-reply-context`, `reply-anyway-execute`) to locate them.

  **Acceptance Criteria**:
  - [ ] Zero references to `reply_anyway`, `REPLY_ANYWAY_CONTEXT`, `replyAnywayEvent` in employee-lifecycle.ts
  - [ ] `reply-anyway-execute`, `reply-anyway-poll`, `build-reply-context` step names gone
  - [ ] `pnpm build` passes
  - [ ] File compiles with no TypeScript errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: No Reply Anyway references remain
    Tool: Bash (grep)
    Preconditions: Task 3 and Task 4 changes applied
    Steps:
      1. Run `grep -n "reply.anyway\|reply_anyway\|REPLY_ANYWAY\|replyAnywayEvent\|replyContext\|replyMachineId\|replyDraftStatus" src/inngest/employee-lifecycle.ts`
      2. Assert zero matches
    Expected Result: No matches found
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-4-no-reply-anyway-refs.txt

  Scenario: Build passes after cleanup
    Tool: Bash
    Preconditions: All cleanup applied
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
    Expected Result: Clean build
    Failure Indicators: TypeScript errors referencing removed variables
    Evidence: .sisyphus/evidence/task-4-build.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(lifecycle): replace Reply Anyway with generic override card + linked task`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Replace REPLY_ANYWAY_CONTEXT with OVERRIDE_DIRECTION in harness

  **What to do**:
  - In `src/workers/opencode-harness.mts`, replace the `REPLY_ANYWAY_CONTEXT` handling (lines 506-509):
    - Remove: `const replyAnywayContext = process.env.REPLY_ANYWAY_CONTEXT ?? '';`
    - Remove: The conditional that replaces `instructions` with Reply Anyway override text
    - Add: `const overrideDirection = process.env.OVERRIDE_DIRECTION ?? '';`
    - Add: If `overrideDirection` is non-empty, prepend to instructions:
      ```
      const instructions = overrideDirection
        ? `OVERRIDE DIRECTION FROM HUMAN:\n${overrideDirection}\n\n---\nOriginal instructions:\n${archetype.instructions ?? ''}`
        : (archetype.instructions ?? '');
      ```
    - This is simpler than the old Reply Anyway pattern — it doesn't skip steps or redirect the workflow, it just prepends the human's direction as context
  - Update the lifecycle's new linked task machine dispatch (Task 3) to inject `OVERRIDE_DIRECTION` instead of `REPLY_ANYWAY_CONTEXT` — but this should already be handled by Task 3's implementation. Verify.

  **Must NOT do**:
  - Do not change `FEEDBACK_CONTEXT` or `LEARNED_RULES_CONTEXT` handling
  - Do not add guest-messaging-specific language

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, focused change in one file — replacing one env var pattern with another
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:497-509` — Current `FEEDBACK_CONTEXT` and `REPLY_ANYWAY_CONTEXT` handling. Lines 497-505 show `FEEDBACK_CONTEXT` pattern (keep as-is). Lines 506-509 show `REPLY_ANYWAY_CONTEXT` pattern (replace).

  **WHY Each Reference Matters**:
  - Lines 506-509: The exact code to replace. The old pattern completely overrides instructions. The new pattern just prepends direction.

  **Acceptance Criteria**:
  - [ ] `REPLY_ANYWAY_CONTEXT` no longer referenced in `opencode-harness.mts`
  - [ ] `OVERRIDE_DIRECTION` env var read and prepended to instructions when present
  - [ ] When `OVERRIDE_DIRECTION` is empty, instructions unchanged
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: No REPLY_ANYWAY_CONTEXT references in harness
    Tool: Bash (grep)
    Preconditions: Changes applied
    Steps:
      1. Run `grep -n "REPLY_ANYWAY" src/workers/opencode-harness.mts`
      2. Assert zero matches
    Expected Result: No matches
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-5-no-reply-anyway-ref.txt

  Scenario: OVERRIDE_DIRECTION prepended to instructions
    Tool: Bash (grep + read)
    Preconditions: Changes applied
    Steps:
      1. Run `grep -n "OVERRIDE_DIRECTION" src/workers/opencode-harness.mts`
      2. Assert at least 1 match showing env var read
      3. Verify the conditional prepend pattern exists
    Expected Result: OVERRIDE_DIRECTION read and conditionally prepended
    Failure Indicators: No reference found, or instructions completely replaced instead of prepended
    Evidence: .sisyphus/evidence/task-5-override-direction.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: Changes saved
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
    Expected Result: Build succeeds
    Failure Indicators: TypeScript errors
    Evidence: .sisyphus/evidence/task-5-build.txt
  ```

  **Commit**: YES
  - Message: `feat(harness): replace REPLY_ANYWAY_CONTEXT with OVERRIDE_DIRECTION`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 6. Rewrite Reply Anyway tests for generic override system

  **What to do**:
  Three existing test files test the Reply Anyway pattern. Rewrite them to test the new generic override system:

  **File 1 — `tests/inngest/lifecycle-reply-anyway.test.ts`** → Rename to `tests/inngest/lifecycle-override.test.ts`:
  - Rewrite all test cases to test the new override flow:
    - Test: NO_ACTION_NEEDED → override card posted with displayContext fields
    - Test: Override event with direction → new linked task created, original task Done, dispatch event sent
    - Test: Override event with null direction (dismiss) → task Done, no new task
    - Test: Timeout → task Done, Slack messages updated
    - Test: Override card renders correctly without displayContext (empty)
    - Test: New linked task has correct metadata (`override_direction`, `overridden_by`, `override_of_task_id`)
  - Follow existing test patterns: `vi.hoisted()` mocks, `InngestTestEngine`, `mockCtx`, PostgREST fetch mocks

  **File 2 — `tests/inngest/employee-lifecycle-classification.test.ts`**:
  - Update tests that reference `employee/reply-anyway.requested` → change to `employee/override.requested`
  - Update assertions that check for `wait-for-reply-anyway` step → `wait-for-override`
  - Keep the classification detection tests intact (they test `check-classification`, which is unchanged)

  **File 3 — `tests/gateway/slack/reply-anyway-handler.test.ts`** → Rename to `tests/gateway/slack/override-handler.test.ts`:
  - Rewrite to test new handlers: `override_take_action`, `override_dismiss`, `override_take_action_modal`
  - Follow existing test structure (makeMockBoltApp, makeMockInngest, etc.)
  - Test cases:
    - `override_take_action` opens modal with correct callback_id and private_metadata
    - `override_take_action` on terminal task shows "already resolved"
    - `override_take_action_modal` fires `employee/override.requested` with direction
    - `override_take_action_modal` validates non-empty direction
    - `override_dismiss` fires `employee/override.dismissed` (or `employee/override.requested` with null direction)
    - `override_dismiss` on terminal task shows "already resolved"

  **Must NOT do**:
  - Do not modify tests for `guest_approve`, `guest_edit`, `guest_reject` (those are NEEDS_APPROVAL flow tests)
  - Do not create test files that don't follow existing naming/structure patterns

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Rewriting 3 test files with complex mock setup, ~800+ lines of test code
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-reply-anyway.test.ts` — Full file (458 lines). Test structure with `vi.hoisted()` mocks, InngestTestEngine, PostgREST fetch mocks. THIS IS THE FILE BEING REWRITTEN — understand its structure to maintain consistency.
  - `tests/inngest/employee-lifecycle-classification.test.ts` — Full file (329 lines). Tests classification detection. References to `employee/reply-anyway.requested` need updating to `employee/override.requested`.
  - `tests/gateway/slack/reply-anyway-handler.test.ts` — Full file (351 lines). Test structure with `makeMockBoltApp()`, `makeMockInngest()`, handler extraction. THIS IS THE FILE BEING REWRITTEN.
  - `tests/inngest/lifecycle-local-docker.test.ts` — May reference Reply Anyway patterns — check and update if needed.

  **WHY Each Reference Matters**:
  - `lifecycle-reply-anyway.test.ts`: Primary test file being rewritten. Must understand mock setup (vi.hoisted, PrismaClient mock, fetch mock, InngestTestEngine) to maintain same patterns.
  - `employee-lifecycle-classification.test.ts`: Contains references to `reply-anyway.requested` that must be updated. The classification tests themselves stay the same.
  - `reply-anyway-handler.test.ts`: Primary handler test being rewritten. Must understand mock Bolt app pattern to write new handler tests.

  **Acceptance Criteria**:
  - [ ] `tests/inngest/lifecycle-override.test.ts` exists and passes
  - [ ] `tests/gateway/slack/override-handler.test.ts` exists and passes
  - [ ] `tests/inngest/employee-lifecycle-classification.test.ts` updated and passes
  - [ ] Old file names removed (`lifecycle-reply-anyway.test.ts`, `reply-anyway-handler.test.ts`)
  - [ ] Zero references to `reply-anyway` in any test file
  - [ ] `pnpm test -- --run` passes (no new failures beyond 39 pre-existing)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Override lifecycle tests pass
    Tool: Bash (vitest)
    Preconditions: New test file written
    Steps:
      1. Run `pnpm test -- --run tests/inngest/lifecycle-override.test.ts`
      2. Assert all tests pass
    Expected Result: All tests pass (0 failures)
    Failure Indicators: Test failures, import errors
    Evidence: .sisyphus/evidence/task-6-lifecycle-override-tests.txt

  Scenario: Override handler tests pass
    Tool: Bash (vitest)
    Preconditions: New test file written
    Steps:
      1. Run `pnpm test -- --run tests/gateway/slack/override-handler.test.ts`
      2. Assert all tests pass
    Expected Result: All tests pass (0 failures)
    Failure Indicators: Test failures, handler not found
    Evidence: .sisyphus/evidence/task-6-handler-override-tests.txt

  Scenario: Classification tests still pass
    Tool: Bash (vitest)
    Preconditions: Updated test file
    Steps:
      1. Run `pnpm test -- --run tests/inngest/employee-lifecycle-classification.test.ts`
      2. Assert all tests pass
    Expected Result: All tests pass
    Failure Indicators: References to old event names
    Evidence: .sisyphus/evidence/task-6-classification-tests.txt

  Scenario: No reply-anyway references in tests
    Tool: Bash (grep)
    Preconditions: All test files updated
    Steps:
      1. Run `grep -rn "reply.anyway\|reply_anyway\|REPLY_ANYWAY" tests/`
      2. Assert zero matches
    Expected Result: No matches
    Failure Indicators: Stale references found
    Evidence: .sisyphus/evidence/task-6-no-reply-refs.txt
  ```

  **Commit**: YES
  - Message: `test: rewrite Reply Anyway tests for generic override system`
  - Files: `tests/inngest/lifecycle-override.test.ts` (new), `tests/gateway/slack/override-handler.test.ts` (new), `tests/inngest/employee-lifecycle-classification.test.ts` (updated), `tests/inngest/lifecycle-reply-anyway.test.ts` (deleted), `tests/gateway/slack/reply-anyway-handler.test.ts` (deleted)
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Update archetype instructions + delete post-no-action-notification.ts

  **What to do**:

  **Part A — Delete `post-no-action-notification.ts`**:
  - Delete file: `src/worker-tools/slack/post-no-action-notification.ts`
  - This tool is no longer called by any archetype instructions (lifecycle posts the card now)

  **Part B — Update guest-messaging archetype instructions in `prisma/seed.ts`**:
  - Find the guest-messaging archetype instruction text (archetype ID `00000000-0000-0000-0000-000000000015`)
  - **STEP 1 early exit** (no unresponded messages): Should already write `NO_ACTION_NEEDED:` to summary.txt (updated in Phase 2). Verify this is correct. No further changes needed.
  - **STEP 4 NO_ACTION classification path**: Remove the instruction to call `post-no-action-notification.ts`. Replace with: "Write your classification JSON to `/tmp/summary.txt` with the following structure: `{ classification: 'NO_ACTION_NEEDED', summary: '...your reasoning...', displayContext: { 'Guest': '...', 'Property': '...', 'Check-in': '...', 'Check-out': '...', ... } }`. The lifecycle will handle Slack notification."
  - Ensure the `displayContext` field instruction includes all relevant guest-messaging context (guestName, propertyName, checkIn, checkOut, bookingChannel)

  **Part C — Update live DB archetype record**:
  - After updating seed.ts, also PATCH the live archetype via PostgREST to update the `instructions` field
  - URL: `PATCH http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015`
  - Body: `{ "instructions": "<updated instructions>" }`
  - Headers: apikey + Authorization with service role key

  **Part D — Verify Dockerfile doesn't reference deleted file**:
  - Check `Dockerfile` for any COPY of `post-no-action-notification.ts` — likely copied as part of `worker-tools/slack/` directory
  - The directory copy (`COPY src/worker-tools/ /tools/`) will simply not include the deleted file — no Dockerfile change needed
  - Verify no other file imports or references `post-no-action-notification`

  **Must NOT do**:
  - Do not modify `post-guest-approval.ts` (that's for NEEDS_APPROVAL flow)
  - Do not change the STEP 5 (NEEDS_APPROVAL) instructions
  - Do not remove guest-specific fields from the JSON classification instruction — the backward compat in Task 1 handles that

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion + text update in seed.ts + PostgREST PATCH — straightforward
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5, 6)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-no-action-notification.ts` — The file being deleted. 260 lines, 13 guest-specific params. Read to understand what it did (for verifying the lifecycle replacement covers everything).
  - `prisma/seed.ts` — Search for archetype ID `00000000-0000-0000-0000-000000000015` or `guest-messaging` to find the instructions block. The STEP 4 NO_ACTION section is what needs updating.

  **WHY Each Reference Matters**:
  - `post-no-action-notification.ts`: Must understand what the worker used to do to verify the lifecycle replacement (Task 3) covers all functionality. Also confirms the file can be safely deleted.
  - `prisma/seed.ts`: Contains the archetype instruction text that tells the worker what to do. Must update to stop calling deleted tool and instead write classification JSON.

  **Acceptance Criteria**:
  - [ ] `src/worker-tools/slack/post-no-action-notification.ts` deleted
  - [ ] `prisma/seed.ts` updated with new NO_ACTION instructions
  - [ ] Live DB archetype updated via PostgREST PATCH
  - [ ] No file in codebase references `post-no-action-notification`
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Deleted file no longer exists
    Tool: Bash
    Preconditions: File deleted
    Steps:
      1. Run `ls src/worker-tools/slack/post-no-action-notification.ts`
      2. Assert file not found
    Expected Result: "No such file or directory"
    Failure Indicators: File still exists
    Evidence: .sisyphus/evidence/task-7-file-deleted.txt

  Scenario: No references to deleted file
    Tool: Bash (grep)
    Preconditions: File deleted, seed updated
    Steps:
      1. Run `grep -rn "post-no-action-notification" src/ prisma/`
      2. Assert zero matches
    Expected Result: No matches
    Failure Indicators: Stale imports or references
    Evidence: .sisyphus/evidence/task-7-no-refs.txt

  Scenario: Seed archetype instructions updated
    Tool: Bash (grep)
    Preconditions: seed.ts updated
    Steps:
      1. Run `grep -A5 "displayContext" prisma/seed.ts`
      2. Assert displayContext instruction present in guest-messaging archetype
    Expected Result: displayContext instruction found
    Failure Indicators: No displayContext reference, old post-no-action-notification call still present
    Evidence: .sisyphus/evidence/task-7-seed-updated.txt

  Scenario: Build passes after deletion
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
    Expected Result: Build succeeds (no import errors for deleted file)
    Failure Indicators: Import error referencing deleted file
    Evidence: .sisyphus/evidence/task-7-build.txt
  ```

  **Commit**: YES
  - Message: `feat(seed): update archetype instructions for generic override + delete post-no-action-notification.ts`
  - Files: `prisma/seed.ts`, `src/worker-tools/slack/post-no-action-notification.ts` (deleted)
  - Pre-commit: `pnpm build`

- [x] 8. Codebase sweep — remove ALL remaining Reply Anyway references

  **What to do**:
  Final cleanup pass to ensure zero Reply Anyway artifacts remain anywhere in the codebase:
  - Run comprehensive grep for: `reply-anyway`, `reply_anyway`, `REPLY_ANYWAY`, `guest_reply_anyway`, `NO_ACTION_BUTTON_BLOCKS`, `isTaskPendingReplyAnyway`, `replyAnywayEvent`, `post-no-action-notification`
  - Check ALL file types: `.ts`, `.mts`, `.md`, `.json`, `.yml`, `.yaml`, `.env`, `Dockerfile`
  - For each match found:
    - If in source code → remove/replace
    - If in test code → should already be handled by Task 6
    - If in documentation → update to reference new override system
    - If in comments → remove stale comments
  - Also remove `NO_ACTION_BUTTON_BLOCKS` and `isTaskPendingReplyAnyway` from `handlers.ts` if not already done by Task 2
  - Verify the `guest_reply_anyway` action handler is fully removed from `handlers.ts`
  - Check `AGENTS.md` for any Reply Anyway references that need updating

  **Must NOT do**:
  - Do not modify git history or commit messages
  - Do not modify files unrelated to Reply Anyway cleanup

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Grep + targeted removals across files — straightforward but thorough
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (with Task 9)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 4, 5, 7

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:88-117` — `isTaskPendingReplyAnyway` — should be removed (replaced by `isTaskAwaitingOverride` in Task 2)
  - `src/gateway/slack/handlers.ts:169-181` — `NO_ACTION_BUTTON_BLOCKS` — should be removed
  - `src/gateway/slack/handlers.ts:712-794` — `guest_reply_anyway` handler — should be removed

  **WHY Each Reference Matters**:
  - These are the specific code blocks that must be confirmed deleted. If Task 2 already handles their removal, this task just verifies. If not, this task removes them.

  **Acceptance Criteria**:
  - [ ] `grep -rn "reply.anyway\|reply_anyway\|REPLY_ANYWAY" src/ tests/ prisma/` returns zero matches
  - [ ] `grep -rn "guest_reply_anyway" src/ tests/` returns zero matches
  - [ ] `grep -rn "NO_ACTION_BUTTON_BLOCKS" src/ tests/` returns zero matches
  - [ ] `grep -rn "isTaskPendingReplyAnyway" src/ tests/` returns zero matches
  - [ ] `grep -rn "post-no-action-notification" src/ tests/ prisma/` returns zero matches
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Comprehensive grep returns zero Reply Anyway references
    Tool: Bash (grep)
    Preconditions: All previous tasks complete
    Steps:
      1. Run `grep -rn "reply.anyway\|reply_anyway\|REPLY_ANYWAY\|guest_reply_anyway\|NO_ACTION_BUTTON_BLOCKS\|isTaskPendingReplyAnyway\|post-no-action-notification\|REPLY_ANYWAY_CONTEXT" src/ tests/ prisma/`
      2. Assert zero matches
    Expected Result: No matches anywhere
    Failure Indicators: Any stale reference found
    Evidence: .sisyphus/evidence/task-8-full-sweep.txt

  Scenario: Build passes after all removals
    Tool: Bash
    Preconditions: All removals applied
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
    Expected Result: Clean build
    Failure Indicators: Missing references cause compilation errors
    Evidence: .sisyphus/evidence/task-8-build.txt
  ```

  **Commit**: YES
  - Message: `chore: remove all remaining Reply Anyway references`
  - Files: Any files with stale references
  - Pre-commit: `pnpm build`

- [x] 9. Full build, lint, and test verification

  **What to do**:
  Final verification that everything works together:
  - Run `pnpm build` — must pass with 0 exit code
  - Run `pnpm lint` — must pass (or only have pre-existing warnings)
  - Run `pnpm test -- --run` — must pass with no NEW failures (39 pre-existing are expected)
  - Count test results and compare to baseline:
    - Before: Check current pass/fail count
    - After: Verify same or better pass count, no new failures
  - If any failures are found that are NOT in the pre-existing list, debug and fix

  **Must NOT do**:
  - Do not try to fix the 39 pre-existing test failures
  - Do not skip lint or test steps

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full verification suite with potential debugging if new failures found
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after Task 8)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - Pre-existing test failures list (from context): `opencode-server.test.ts` (7), `fallback-pr.test.ts` (11), `branch-manager.test.ts` (1), `between-wave-push.test.ts` (1), `lifecycle-guest-delivery.test.ts` (1), `rule-handlers.test.ts` (2), `interaction-handler-rejection-feedback.test.ts` (7), `inngest-serve.test.ts` (1), `schema.test.ts` (1), `admin-property-locks.test.ts` (2), `installation-store.test.ts` (1), `employee-dispatcher.test.ts` (1), `jira-webhook-with-new-project.test.ts` (1), `summarizer-trigger.test.ts` (2)

  **WHY Each Reference Matters**:
  - The pre-existing failures list is essential to distinguish new failures from old ones. Any failure NOT in this list is a regression that must be fixed.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes (exit code 0)
  - [ ] `pnpm lint` passes (exit code 0)
  - [ ] `pnpm test -- --run` shows no new failures beyond 39 pre-existing
  - [ ] Override-specific tests pass (lifecycle-override, override-handler, classification)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build passes
    Tool: Bash
    Preconditions: All implementation complete
    Steps:
      1. Run `pnpm build`
      2. Assert exit code 0
    Expected Result: Clean build
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-9-build.txt

  Scenario: Lint passes
    Tool: Bash
    Preconditions: All implementation complete
    Steps:
      1. Run `pnpm lint`
      2. Assert exit code 0
    Expected Result: Clean lint
    Failure Indicators: New lint errors
    Evidence: .sisyphus/evidence/task-9-lint.txt

  Scenario: Tests pass (no new failures)
    Tool: Bash
    Preconditions: All implementation complete
    Steps:
      1. Run `pnpm test -- --run 2>&1 | tail -20`
      2. Count total tests, passed, failed
      3. Compare failed count to baseline (39)
      4. If failed > 39, identify new failures
    Expected Result: ≤39 failures (all pre-existing)
    Failure Indicators: >39 failures, new test file names in failures
    Evidence: .sisyphus/evidence/task-9-tests.txt
  ```

  **Commit**: YES (if any fixes were needed)
  - Message: `chore: verify build, lint, and tests pass`
  - Files: Any files fixed during verification
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 10. Notify completion

  Send Telegram notification: plan `generic-override-system` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ generic-override-system complete — All tasks done. Come back to review results."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - **Blocked By**: F1-F4

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep codebase). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no guest-messaging-specific language in shared files.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty displayContext, missing summary, rapid button clicks, concurrent overrides. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes. Verify zero references remain to: `reply-anyway`, `REPLY_ANYWAY_CONTEXT`, `guest_reply_anyway`, `post-no-action-notification`, `NO_ACTION_BUTTON_BLOCKS`, `isTaskPendingReplyAnyway`.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Removed Refs [CLEAN/N remaining] | VERDICT`

---

## Commit Strategy

| After Task(s) | Commit Message                                                                                           | Files                                                                                                                                                                         | Pre-commit                                      |
| ------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| T1            | `feat(classify): add generic displayContext to ClassifyResult with backward compat`                      | `src/lib/classify-message.ts`, `tests/lib/classify-message.test.ts`                                                                                                           | `pnpm build`                                    |
| T2            | `feat(slack): add generic override handlers (take_action, dismiss, modal)`                               | `src/gateway/slack/handlers.ts`                                                                                                                                               | `pnpm build`                                    |
| T3, T4        | `feat(lifecycle): replace Reply Anyway with generic override card + linked task`                         | `src/inngest/employee-lifecycle.ts`                                                                                                                                           | `pnpm build`                                    |
| T5            | `feat(harness): replace REPLY_ANYWAY_CONTEXT with OVERRIDE_DIRECTION`                                    | `src/workers/opencode-harness.mts`                                                                                                                                            | `pnpm build`                                    |
| T6            | `test: rewrite Reply Anyway tests for generic override system`                                           | `tests/inngest/lifecycle-reply-anyway.test.ts`, `tests/inngest/employee-lifecycle-classification.test.ts`, `tests/gateway/slack/reply-anyway-handler.test.ts`, new test files | `pnpm test -- --run`                            |
| T7            | `feat(seed): update archetype instructions for generic override + delete post-no-action-notification.ts` | `prisma/seed.ts`, `src/worker-tools/slack/post-no-action-notification.ts` (deleted)                                                                                           | `pnpm build`                                    |
| T8            | `chore: remove all remaining Reply Anyway references`                                                    | Any files with stale references                                                                                                                                               | `pnpm build`                                    |
| T9            | `chore: verify build, lint, and tests pass`                                                              | —                                                                                                                                                                             | `pnpm build && pnpm lint && pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: 0 exit code
pnpm lint                     # Expected: 0 exit code
pnpm test -- --run            # Expected: same pass count, no new failures beyond 39 pre-existing
grep -r "reply-anyway" src/   # Expected: no matches
grep -r "reply_anyway" src/   # Expected: no matches
grep -r "REPLY_ANYWAY" src/   # Expected: no matches
grep -r "guest_reply_anyway" src/  # Expected: no matches
grep -r "post-no-action-notification" src/  # Expected: no matches
grep -r "NO_ACTION_BUTTON_BLOCKS" src/  # Expected: no matches
grep -r "isTaskPendingReplyAnyway" src/  # Expected: no matches
ls src/worker-tools/slack/post-no-action-notification.ts  # Expected: file not found
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (no new failures)
- [ ] Build and lint clean
- [ ] No Reply Anyway references in codebase
- [ ] Override card renders correctly for any employee type
- [ ] New linked task dispatches and runs full lifecycle
