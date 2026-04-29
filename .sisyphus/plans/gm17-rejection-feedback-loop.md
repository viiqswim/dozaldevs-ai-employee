# GM-17: Rejection Feedback Loop

## TL;DR

> **Quick Summary**: When a PM rejects an AI-drafted Slack message, the bot posts a thread reply asking "What should I have done differently?", captures the rejector's reply as `rejection_reason` feedback, and feeds it into future runs via FEEDBACK_CONTEXT and weekly digest.
>
> **Deliverables**:
>
> - Thread reply posted on every rejection asking for feedback
> - `guest_reject` modal reason also stored in feedback table (not just task metadata)
> - Rejector's thread reply captured as `feedback_type: 'rejection_reason'`
> - Rejection feedback auto-included in FEEDBACK_CONTEXT for future runs
> - Rejection feedback auto-included in weekly synthesis digest
> - Full automated test coverage
> - Story map GM-17 marked complete
>
> **Estimated Effort**: Short (S complexity — ~3-5 focused tasks)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (SlackClient) → Task 3 (Lifecycle) → Task 5 (Integration Tests) → Task 6 (Story Map)

---

## Context

### Original Request

Implement GM-17 from the Phase 1 story map: Rejection Feedback Loop. When a PM rejects an AI-drafted response, the bot asks for feedback in-thread, captures it, and feeds it into future improvements.

### Interview Summary

**Key Discussions**:

- User wants thorough automated tests AND API endpoint verification
- User wants story map updated after implementation is verified
- GM-05 (dependency) is already complete — approval card with Approve/Edit/Reject exists

**Research Findings**:

- Two rejection paths exist: plain `reject` button (no modal) and `guest_reject` → `guest_reject_modal` (with optional reason field)
- `approvalMsgTs` and `targetChannel` are available in lifecycle rejection branch from deliverable metadata
- `SlackClient.postMessage` currently lacks `thread_ts` — needs extension
- Interaction handler already routes thread replies on approval cards → feedback table via `findTaskIdByThreadTs`
- Existing `feedback_type` values: `thread_reply`, `mention_feedback`, `teaching` — no `rejection_reason` yet
- FEEDBACK_CONTEXT builder queries all feedback rows with `correction_reason` → new rejection_reason rows auto-included
- Feedback summarizer reads all feedback weekly → auto-included in digest
- `employee/rule.extract-requested` event is emitted by interaction handler but no handler exists (GM-18 scope)

### Metis Review

**Identified Gaps** (addressed):

- Exact hardcoded message text needed for test assertions → defined as canonical string
- Null-guard for `approvalMsgTs` needed → skip thread reply silently, log warning
- JSON merge for task metadata (not overwrite) to preserve existing metadata
- Ordering constraint: metadata patch → thread reply → reject message update → cancel
- Only rejector's replies captured as `rejection_reason` (not any user in thread)
- Regression tests for non-rejection and non-rejector scenarios
- Thread reply failure must be non-fatal
- `employee/rule.extract-requested` event payload shape defined as GM-18 contract

---

## Work Objectives

### Core Objective

Enable the platform to learn from rejections by soliciting feedback from the rejector in-thread and storing it as actionable feedback for future AI runs.

### Concrete Deliverables

- Modified `src/lib/slack-client.ts` — `thread_ts` optional param on `postMessage`
- Modified `src/inngest/employee-lifecycle.ts` — rejection branch posts thread reply, stores modal reason in feedback table, sets metadata flags
- Modified `src/inngest/interaction-handler.ts` — detects rejection feedback context, routes as `rejection_reason`
- New test file `tests/inngest/lifecycle-rejection-feedback.test.ts`
- New test file `tests/inngest/interaction-handler-rejection-feedback.test.ts`
- Modified `docs/2026-04-21-2202-phase1-story-map.md` — GM-17 marked complete

### Definition of Done

- [ ] `pnpm test -- --run` passes (all existing + new tests)
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] All 6 GM-17 acceptance criteria verified by automated tests

### Must Have

- Thread reply posted in approval message thread on EVERY rejection
- `feedback_type: 'rejection_reason'` stored in feedback table
- Only rejector's reply treated as `rejection_reason` (user ID match)
- `guest_reject` modal reason stored in feedback table (in addition to metadata)
- `approvalMsgTs` null-guard — skip thread reply silently if absent
- Thread reply failure is non-fatal — log error, continue
- `employee/rule.extract-requested` emitted for rejection feedback (GM-18 hook)
- FEEDBACK_CONTEXT includes rejection_reason rows (already works, verify)
- Weekly digest includes rejection_reason rows (already works, verify)

### Must NOT Have (Guardrails)

- **No timer/cron for 24h follow-up** — feedback is optional, no nagging
- **No `guest_reject` modal UI changes** — modal remains unchanged
- **No LLM call for thread reply text** — hardcoded string only
- **No FEEDBACK_CONTEXT tenant_id filter fix** — pre-existing bug, out of scope
- **No new DB migration** — `feedback_type` is a plain String, no schema change needed
- **No modification to existing classification paths** — `thread_reply`, `mention_feedback`, `teaching` routes untouched
- **No breaking changes to `postMessage` signature** — `thread_ts` is optional only
- **No GM-18 handler implementation** — only emit the event, that's GM-18's scope

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — implement feature, then comprehensive tests)
- **Framework**: Vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Lifecycle/Inngest**: Use Bash (Vitest) — run test suites, assert pass counts
- **Integration**: Use Bash (curl) — fire Inngest events locally, verify PostgREST state

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + implementation):
├── Task 1: Extend SlackClient with thread_ts support [quick]
├── Task 2: Interaction handler — rejection feedback routing [unspecified-high]
└── Task 3: Lifecycle — rejection feedback flow [deep]
    (Task 3 depends on Task 1 completing, can run parallel with Task 2)

Wave 2 (After Wave 1 — tests + verification):
├── Task 4: Lifecycle rejection feedback tests [unspecified-high]
├── Task 5: Interaction handler rejection feedback tests [unspecified-high]
└── Task 6: FEEDBACK_CONTEXT + summarizer integration tests [unspecified-high]
    (All three test tasks can run in parallel)

Wave 3 (After Wave 2 — final):
└── Task 7: Mark GM-17 complete in story map + full suite run [quick]

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
| 1     | —          | 3, 4    | 1     |
| 2     | —          | 5       | 1     |
| 3     | 1          | 4, 6, 7 | 1     |
| 4     | 1, 3       | 7       | 2     |
| 5     | 2          | 7       | 2     |
| 6     | 3          | 7       | 2     |
| 7     | 4, 5, 6    | F1-F4   | 3     |
| F1-F4 | 7          | —       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `unspecified-high`, T3 → `deep`
- **Wave 2**: 3 tasks — T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `unspecified-high`
- **Wave 3**: 1 task — T7 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## Canonical Constants

### Thread Reply Message Text

```
Got it, <@{userId}>. What should I have done differently? (Reply here — I'll learn from it.)
```

This is a hardcoded string. No LLM call. No persona voice. Use exactly this text in implementation and test assertions.

### `employee/rule.extract-requested` Event Payload (GM-18 Contract)

```typescript
{
  name: 'employee/rule.extract-requested',
  data: {
    feedbackId: string,        // UUID of the feedback row
    feedbackType: string,      // 'rejection_reason'
    taskId: string | null,     // UUID of the related task
    archetypeId: string,       // UUID of the archetype
    tenantId: string,          // UUID of the tenant
    content: string,           // The feedback text (correction_reason)
  }
}
```

This event is already emitted by the interaction handler for feedback/teaching intents. Ensure the same shape is used for rejection_reason feedback.

---

## TODOs

- [x] 1. Extend SlackClient with `thread_ts` support

  **What to do**:
  - Add optional `thread_ts?: string` parameter to `SlackMessageParams` interface in `src/lib/slack-client.ts`
  - Update the `postMessage` implementation to include `thread_ts` in the Slack API request body when provided
  - Verify existing callers are unaffected (optional param, no breaking change)
  - Update `tests/inngest/redispatch.test.ts` mock if it breaks due to interface change (the test already has an LSP error for missing `updateMessage` — fix that too by adding `updateMessage` to the mock)

  **Must NOT do**:
  - Do NOT change the `postMessage` method signature in a breaking way
  - Do NOT refactor existing `postMessage` callers
  - Do NOT add any other new parameters

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change, adding an optional parameter to an existing interface
  - **Skills**: []
    - No specialized skills needed for a straightforward interface extension

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/slack-client.ts:34` — `SlackMessageParams` interface definition. Add `thread_ts?: string` here.
  - `src/lib/slack-client.ts:90` — `updateMessage` implementation. This already has `ts` in the Slack API body — follow the same pattern for `thread_ts` in `postMessage`.
  - `src/lib/slack-client.ts:46-76` — `postMessage` implementation. Add `thread_ts` to the `body` object when present.

  **Test References**:
  - `tests/inngest/redispatch.test.ts:53` — SlackClient mock missing `updateMessage`. Fix by adding `updateMessage: vi.fn()` to the mock object.

  **WHY Each Reference Matters**:
  - `slack-client.ts:34`: This is the exact interface to modify — adding the optional field here propagates through TypeScript
  - `slack-client.ts:90`: Shows how the Slack API body is constructed for `updateMessage` — same pattern for `thread_ts`
  - `redispatch.test.ts:53`: Pre-existing mock issue that will surface when you touch `SlackClient` — fix proactively

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SlackClient.postMessage accepts thread_ts without error
    Tool: Bash (Vitest)
    Preconditions: src/lib/slack-client.ts modified
    Steps:
      1. Run `pnpm build` — verify no TypeScript errors
      2. Run `pnpm test -- --run tests/inngest/redispatch.test.ts` — verify existing tests still pass
      3. Grep `src/lib/slack-client.ts` for `thread_ts` — verify field exists in interface and implementation
    Expected Result: Build passes, test passes, `thread_ts` found in both interface and implementation
    Failure Indicators: TypeScript error on build, test failure, missing `thread_ts` in either location
    Evidence: .sisyphus/evidence/task-1-slackclient-build.txt

  Scenario: Existing postMessage callers unaffected
    Tool: Bash (LSP)
    Preconditions: src/lib/slack-client.ts modified
    Steps:
      1. Use lsp_find_references on `postMessage` to list all callers
      2. Run `pnpm build` — all callers compile without changes
    Expected Result: Zero compilation errors from existing callers
    Failure Indicators: Any caller fails to compile
    Evidence: .sisyphus/evidence/task-1-callers-unaffected.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-slackclient-build.txt — build output
  - [ ] task-1-callers-unaffected.txt — lsp_find_references output + build

  **Commit**: YES (group 1)
  - Message: `feat(slack): add thread_ts support to SlackClient.postMessage`
  - Files: `src/lib/slack-client.ts`, `tests/inngest/redispatch.test.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Interaction handler — rejection feedback routing

  **What to do**:
  - In `src/inngest/interaction-handler.ts`, in the `route-and-store` step, add a check BEFORE the LLM classification:
    1. If `event.data.taskId` is present, fetch the task via PostgREST: `GET /rest/v1/tasks?id=eq.{taskId}&select=status,metadata`
    2. If `task.status === 'Cancelled'` AND `task.metadata.rejection_feedback_requested === true` AND `event.data.userId === task.metadata.rejection_user_id`:
       - Skip LLM classification entirely
       - Set `feedbackType = 'rejection_reason'` directly
       - Store in feedback table with `feedback_type: 'rejection_reason'`, `correction_reason: event.data.text`, `task_id`, `created_by: event.data.userId`, `tenant_id`
    3. If the conditions don't match, fall through to existing LLM classification (no changes to existing paths)
  - After storing rejection feedback, clear the `rejection_feedback_requested` flag from task metadata (PATCH with JSON merge: `metadata: { ...existing, rejection_feedback_requested: false }`)
  - Emit `employee/rule.extract-requested` with the canonical payload shape (already done for feedback/teaching — ensure rejection_reason follows same path)

  **Must NOT do**:
  - Do NOT modify the existing `thread_reply` / `mention_feedback` / `teaching` classification paths
  - Do NOT add LLM calls for rejection feedback detection
  - Do NOT change the interaction classifier class
  - Do NOT handle the `employee/rule.extract-requested` event (GM-18 scope)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Modifying a core Inngest function with conditional logic, PostgREST queries, and careful existing-path preservation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/interaction-handler.ts:71-102` — `route-and-store` step. This is where the rejection feedback check goes — BEFORE the `InteractionClassifier.classify()` call.
  - `src/inngest/interaction-handler.ts:81-100` — Existing PostgREST feedback POST. Follow this exact pattern for storing rejection_reason.
  - `src/inngest/interaction-handler.ts:205-215` — `employee/rule.extract-requested` event emission. Same shape for rejection_reason.

  **API/Type References**:
  - `prisma/schema.prisma:142-161` — Feedback model. Fields: `feedback_type` (String), `correction_reason` (String?), `task_id` (String?), `created_by` (String?), `tenant_id` (String).

  **Test References**:
  - `tests/inngest/interaction-handler.test.ts` — Existing test patterns. Use `makeStep()`, `vi.stubGlobal('fetch', ...)`, direct function invocation `(fn as any).fn({ event, step })`.
  - `tests/inngest/interaction-handler.test.ts:321-362` — GM-18 event emission test. Follow this pattern for asserting `employee/rule.extract-requested` emission on rejection_reason.

  **External References**:
  - PostgREST docs: `GET /tasks?id=eq.{uuid}&select=status,metadata` returns task with status and metadata JSON

  **WHY Each Reference Matters**:
  - `interaction-handler.ts:71-102`: Exact insertion point — the rejection check must go BEFORE the LLM classifier call
  - `interaction-handler.ts:81-100`: The PostgREST POST pattern (headers, body shape, error handling) — copy this for rejection_reason insert
  - `interaction-handler.ts:205-215`: The event emission pattern — must match exactly for GM-18 compatibility
  - `interaction-handler.test.ts`: The mock setup pattern (mockFetch URL matching, step mock, direct invocation) must be followed exactly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Thread reply from rejector on cancelled task → stored as rejection_reason
    Tool: Bash (Vitest)
    Preconditions: interaction-handler.ts modified with rejection feedback routing
    Steps:
      1. Mock fetch to return task with status='Cancelled', metadata={rejection_feedback_requested: true, rejection_user_id: 'U123'}
      2. Fire event with taskId, userId='U123', text='The tone was too casual'
      3. Assert fetch POST to /rest/v1/feedback with body containing feedback_type='rejection_reason', correction_reason='The tone was too casual'
      4. Assert fetch PATCH to /rest/v1/tasks with metadata.rejection_feedback_requested=false
      5. Assert step.sendEvent called with employee/rule.extract-requested
    Expected Result: Feedback stored as rejection_reason, flag cleared, event emitted
    Failure Indicators: Wrong feedback_type, flag not cleared, event not emitted
    Evidence: .sisyphus/evidence/task-2-rejection-routing.txt

  Scenario: Thread reply from NON-rejector on cancelled task → falls through to LLM classification
    Tool: Bash (Vitest)
    Preconditions: interaction-handler.ts modified
    Steps:
      1. Mock fetch to return task with status='Cancelled', metadata={rejection_feedback_requested: true, rejection_user_id: 'U123'}
      2. Fire event with taskId, userId='U456' (different user), text='I agree with the rejection'
      3. Assert LLM classifier IS called (existing path)
      4. Assert feedback_type is NOT 'rejection_reason'
    Expected Result: Normal classification flow used, stored as thread_reply or feedback
    Failure Indicators: feedback_type is 'rejection_reason' for wrong user
    Evidence: .sisyphus/evidence/task-2-non-rejector-regression.txt

  Scenario: Thread reply on approved (non-cancelled) task → normal classification
    Tool: Bash (Vitest)
    Preconditions: interaction-handler.ts modified
    Steps:
      1. Mock fetch to return task with status='Done' (approved, not rejected)
      2. Fire event with taskId, userId='U123', text='Great summary!'
      3. Assert LLM classifier IS called
      4. Assert feedback_type is NOT 'rejection_reason'
    Expected Result: Normal classification flow, no rejection_reason override
    Failure Indicators: Rejection feedback path triggered for approved task
    Evidence: .sisyphus/evidence/task-2-approved-task-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-rejection-routing.txt
  - [ ] task-2-non-rejector-regression.txt
  - [ ] task-2-approved-task-regression.txt

  **Commit**: YES (group 2)
  - Message: `feat(lifecycle): post rejection feedback prompt and store rejection reason`
  - Files: `src/inngest/interaction-handler.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Lifecycle — rejection feedback flow

  **What to do**:
  In `src/inngest/employee-lifecycle.ts`, modify the `handle-approval-result` step's rejection branch (the `else` block starting around line 870). The new ordering inside the rejection branch must be:
  1. **Store modal reason in feedback table** (if `rejectionReason` present from guest_reject modal):
     - POST to `/rest/v1/feedback` with `feedback_type: 'rejection_reason'`, `correction_reason: rejectionReason`, `task_id: taskId`, `created_by: actorUserId`, `tenant_id: tenantId`
     - Keep the existing `tasks.metadata` PATCH that stores `rejectionReason` (don't remove it)

  2. **Patch task metadata with rejection feedback flags** (JSON merge, not overwrite):
     - Fetch current task metadata first: `GET /rest/v1/tasks?id=eq.{taskId}&select=metadata`
     - Merge: `{ ...existingMetadata, rejection_feedback_requested: true, rejection_user_id: actorUserId }`
     - PATCH to `/rest/v1/tasks?id=eq.{taskId}` with merged metadata

  3. **Post thread reply asking for feedback** (with null-guard):
     - Guard: `if (approvalMsgTs && targetChannel)` — if either is null, log warning and skip
     - Use `slackClient.postMessage({ channel: targetChannel, text: REJECTION_FEEDBACK_MESSAGE.replace('{userId}', actorUserId), thread_ts: approvalMsgTs })`
     - Where `REJECTION_FEEDBACK_MESSAGE = "Got it, <@{userId}>. What should I have done differently? (Reply here — I'll learn from it.)"`
     - Wrap in try/catch: if postMessage fails, log error and continue (non-fatal)

  4. **Update Slack approval message to "❌ Rejected"** (existing code — keep as-is)

  5. **Clear pending approval** (existing code — keep as-is)

  6. **Patch task to Cancelled** (existing code — keep as-is)

  **Must NOT do**:
  - Do NOT change the approval (non-rejection) branch
  - Do NOT modify the Slack message update blocks/text
  - Do NOT add a 24h timer or follow-up mechanism
  - Do NOT call an LLM for the thread reply text
  - Do NOT remove the existing `tasks.metadata` PATCH for `rejectionReason`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex step modification with careful ordering, multiple PostgREST calls, null-guards, error handling, and preservation of existing behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: PARTIAL — depends on Task 1 (SlackClient thread_ts)
  - **Parallel Group**: Wave 1 (start after Task 1 completes, can run parallel with Task 2)
  - **Blocks**: Tasks 4, 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:870-923` — Current rejection branch. This is the exact code to modify. Read the entire block carefully before making changes.
  - `src/inngest/employee-lifecycle.ts:618-631` — Where `approvalMsgTs` and `targetChannel` are fetched from deliverable metadata. Both values are already in scope within the rejection branch.
  - `src/inngest/employee-lifecycle.ts:871-903` — Existing `rejectionReason` handling (stores in tasks.metadata via PostgREST PATCH). Keep this AND add feedback table POST.
  - `src/inngest/employee-lifecycle.ts:905-917` — Existing Slack message update to "❌ Rejected". Keep as-is, but the new thread reply goes BEFORE this.

  **API/Type References**:
  - `src/lib/slack-client.ts:34` — `SlackMessageParams` interface (will have `thread_ts` after Task 1)
  - `prisma/schema.prisma:142-161` — Feedback model fields for the POST body

  **Test References**:
  - `tests/inngest/lifecycle-guest-approval.test.ts` — Existing lifecycle rejection test patterns. The new lifecycle rejection feedback tests (Task 4) will follow this exact pattern.

  **WHY Each Reference Matters**:
  - `employee-lifecycle.ts:870-923`: The exact code being modified — must understand the full rejection branch before inserting
  - `employee-lifecycle.ts:618-631`: Confirms `approvalMsgTs`/`targetChannel` are in scope — no need to re-fetch
  - `employee-lifecycle.ts:871-903`: Must preserve this code AND add to it — the modal reason now goes to both metadata AND feedback table
  - `lifecycle-guest-approval.test.ts`: Test patterns to follow for Task 4

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rejection posts thread reply in approval message thread
    Tool: Bash (Vitest)
    Preconditions: employee-lifecycle.ts modified, SlackClient has thread_ts
    Steps:
      1. Set up lifecycle test with mocked approval event (action='reject', userId='U123')
      2. Mock deliverable metadata with approval_message_ts='1234567890.123456' and target_channel='C_REVIEW'
      3. Execute the handle-approval-result step
      4. Assert mockPostMessage called with: channel='C_REVIEW', thread_ts='1234567890.123456', text containing '<@U123>' and 'What should I have done differently?'
    Expected Result: postMessage called with correct channel, thread_ts, and message text
    Failure Indicators: postMessage not called, wrong channel, wrong thread_ts, wrong message text
    Evidence: .sisyphus/evidence/task-3-thread-reply-posted.txt

  Scenario: Rejection with approvalMsgTs=null skips thread reply silently
    Tool: Bash (Vitest)
    Preconditions: employee-lifecycle.ts modified
    Steps:
      1. Set up lifecycle test with mocked approval event (action='reject')
      2. Mock deliverable metadata WITHOUT approval_message_ts (null/undefined)
      3. Execute the handle-approval-result step
      4. Assert mockPostMessage NOT called (thread reply skipped)
      5. Assert task still reaches Cancelled state (rejection completes normally)
    Expected Result: No thread reply, no error, task cancelled normally
    Failure Indicators: Error thrown, postMessage called, task not cancelled
    Evidence: .sisyphus/evidence/task-3-null-guard.txt

  Scenario: guest_reject modal reason stored in BOTH metadata AND feedback table
    Tool: Bash (Vitest)
    Preconditions: employee-lifecycle.ts modified
    Steps:
      1. Set up lifecycle test with rejection event containing rejectionReason='Too casual tone'
      2. Execute the handle-approval-result step
      3. Assert fetch PATCH to /rest/v1/tasks with metadata containing rejectionReason (existing behavior preserved)
      4. Assert fetch POST to /rest/v1/feedback with feedback_type='rejection_reason', correction_reason='Too casual tone'
    Expected Result: Reason stored in both locations
    Failure Indicators: Missing from either metadata or feedback table
    Evidence: .sisyphus/evidence/task-3-dual-storage.txt

  Scenario: Thread reply failure does not prevent task cancellation
    Tool: Bash (Vitest)
    Preconditions: employee-lifecycle.ts modified
    Steps:
      1. Set up lifecycle test with rejection event
      2. Mock slackClient.postMessage to throw an error
      3. Execute the handle-approval-result step
      4. Assert task still reaches Cancelled state
      5. Assert no unhandled error propagates
    Expected Result: Task cancelled despite thread reply failure
    Failure Indicators: Error propagated, task not cancelled
    Evidence: .sisyphus/evidence/task-3-non-fatal-failure.txt

  Scenario: Task metadata includes rejection_feedback_requested flag
    Tool: Bash (Vitest)
    Preconditions: employee-lifecycle.ts modified
    Steps:
      1. Set up lifecycle test with rejection event from userId='U123'
      2. Execute the handle-approval-result step
      3. Assert fetch PATCH to /rest/v1/tasks with metadata containing rejection_feedback_requested=true AND rejection_user_id='U123'
    Expected Result: Metadata flags set for interaction handler to detect
    Failure Indicators: Flags missing from metadata PATCH
    Evidence: .sisyphus/evidence/task-3-metadata-flags.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-thread-reply-posted.txt
  - [ ] task-3-null-guard.txt
  - [ ] task-3-dual-storage.txt
  - [ ] task-3-non-fatal-failure.txt
  - [ ] task-3-metadata-flags.txt

  **Commit**: YES (group 2)
  - Message: `feat(lifecycle): post rejection feedback prompt and store rejection reason`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Lifecycle rejection feedback tests

  **What to do**:
  Create `tests/inngest/lifecycle-rejection-feedback.test.ts` with comprehensive tests covering:
  1. **Thread reply posted correctly** — rejection fires postMessage with correct `thread_ts`, `channel`, and exact canonical message text
  2. **Null-guard for missing approvalMsgTs** — thread reply skipped, task still cancelled, no error
  3. **Modal reason stored in feedback table** — POST to `/rest/v1/feedback` with `feedback_type: 'rejection_reason'`
  4. **Rejection without modal reason** — no feedback table POST for modal reason (only thread reply solicitation)
  5. **Thread reply failure is non-fatal** — postMessage throws, task still cancelled
  6. **Metadata flags set** — `rejection_feedback_requested: true`, `rejection_user_id` in task metadata
  7. **Metadata merge (not overwrite)** — existing metadata preserved when adding flags
  8. **Ordering** — metadata flags set BEFORE thread reply posted (verify call order)
  9. **Existing behavior preserved** — Slack message still updated to "❌ Rejected by <@user>", pending approval cleared, task cancelled

  Follow the exact test patterns from `tests/inngest/lifecycle-guest-approval.test.ts`:
  - `vi.hoisted()` for all mocks
  - `vi.mock('@prisma/client')`, `vi.mock('../../src/lib/slack-client.js')`, `vi.mock('../../src/gateway/services/tenant-env-loader.js')`
  - `vi.stubGlobal('fetch', buildFetchMock(...))` with URL pattern matching
  - `InngestTestEngine` + `step.run` switch-case pattern
  - `step.waitForEvent` mocked to return rejection event

  **Must NOT do**:
  - Do NOT test the interaction handler routing (that's Task 5)
  - Do NOT test FEEDBACK_CONTEXT or summarizer integration (that's Task 6)
  - Do NOT modify source code — this task is tests only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive test file creation following complex mock patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-guest-approval.test.ts` — PRIMARY reference. Copy the entire test setup (vi.hoisted, vi.mock, buildFetchMock, InngestTestEngine, step mocking). This is the closest existing test to what we need.
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — Secondary reference for lifecycle test patterns, especially the `transformCtx` and step.run switch-case approach.

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts:870-923` — The rejection branch being tested. Read the modified code to understand what assertions to write.

  **WHY Each Reference Matters**:
  - `lifecycle-guest-approval.test.ts`: Copy the exact mock setup — don't reinvent. The mock patterns are complex (fetch URL matching, step mocking) and must match exactly.
  - `employee-lifecycle.ts:870-923`: The code under test — assertions must match the actual implementation

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All lifecycle rejection feedback tests pass
    Tool: Bash (Vitest)
    Preconditions: tests/inngest/lifecycle-rejection-feedback.test.ts created
    Steps:
      1. Run `pnpm test -- --run tests/inngest/lifecycle-rejection-feedback.test.ts`
      2. Assert all tests pass (0 failures)
      3. Assert at least 8 tests exist (one per scenario listed above)
    Expected Result: 8+ tests, all passing
    Failure Indicators: Any test failure, fewer than 8 tests
    Evidence: .sisyphus/evidence/task-4-lifecycle-tests.txt

  Scenario: Full test suite still passes
    Tool: Bash (Vitest)
    Preconditions: New test file added
    Steps:
      1. Run `pnpm test -- --run`
      2. Assert no regressions — all existing tests still pass
    Expected Result: All tests pass (existing + new)
    Failure Indicators: Any existing test now failing
    Evidence: .sisyphus/evidence/task-4-full-suite.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-lifecycle-tests.txt — new test output
  - [ ] task-4-full-suite.txt — full suite output

  **Commit**: YES (group 3)
  - Message: `test(rejection-feedback): add lifecycle, interaction handler, and integration tests`
  - Files: `tests/inngest/lifecycle-rejection-feedback.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/lifecycle-rejection-feedback.test.ts`

- [x] 5. Interaction handler rejection feedback tests

  **What to do**:
  Create `tests/inngest/interaction-handler-rejection-feedback.test.ts` with tests covering:
  1. **Rejector's reply on cancelled task → stored as rejection_reason** — task status=Cancelled, metadata has flags, userId matches → feedback_type='rejection_reason', LLM classifier NOT called
  2. **Non-rejector's reply on cancelled task → normal classification** — same task, different userId → LLM classifier IS called, feedback_type is NOT 'rejection_reason'
  3. **Reply on approved task → normal classification** — task status=Done (not Cancelled) → LLM classifier IS called, rejection path NOT triggered
  4. **Reply on task without rejection flags → normal classification** — task status=Cancelled but metadata lacks rejection_feedback_requested → LLM classifier IS called
  5. **Rejection feedback clears the flag** — after storing rejection_reason, PATCH to tasks with rejection_feedback_requested=false
  6. **`employee/rule.extract-requested` emitted for rejection_reason** — assert event payload matches canonical shape from plan
  7. **Second reply from rejector after flag cleared → normal classification** — flag was cleared, so subsequent replies go through LLM

  Follow patterns from `tests/inngest/interaction-handler.test.ts`:
  - `vi.hoisted()`, `vi.stubGlobal('fetch', mockFetch)`
  - `makeStep()` helper for step mocking
  - Direct function invocation: `(fn as any).fn({ event, step })`
  - URL pattern matching in mockFetch for PostgREST calls

  **Must NOT do**:
  - Do NOT test lifecycle code (that's Task 4)
  - Do NOT modify source code
  - Do NOT duplicate existing interaction-handler tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive test scenarios with complex mock setup and regression cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `tests/inngest/interaction-handler.test.ts` — PRIMARY reference. Copy mock setup patterns (vi.hoisted, makeStep, mockFetch URL matching, direct invocation).
  - `tests/inngest/interaction-handler.test.ts:321-362` — GM-18 event emission test. Follow exactly for asserting `employee/rule.extract-requested`.

  **API/Type References**:
  - `src/inngest/interaction-handler.ts:71-102` — The route-and-store step being tested (now modified with rejection feedback check)

  **WHY Each Reference Matters**:
  - `interaction-handler.test.ts`: The exact mock patterns — must be compatible with the existing test file structure
  - `interaction-handler.test.ts:321-362`: The event emission assertion pattern — must match for GM-18 contract verification

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All interaction handler rejection feedback tests pass
    Tool: Bash (Vitest)
    Preconditions: tests/inngest/interaction-handler-rejection-feedback.test.ts created
    Steps:
      1. Run `pnpm test -- --run tests/inngest/interaction-handler-rejection-feedback.test.ts`
      2. Assert all tests pass (0 failures)
      3. Assert at least 7 tests exist (one per scenario listed above)
    Expected Result: 7+ tests, all passing
    Failure Indicators: Any test failure, fewer than 7 tests
    Evidence: .sisyphus/evidence/task-5-interaction-tests.txt

  Scenario: Existing interaction handler tests still pass
    Tool: Bash (Vitest)
    Preconditions: New test file added, source modified by Task 2
    Steps:
      1. Run `pnpm test -- --run tests/inngest/interaction-handler.test.ts`
      2. Assert all existing tests still pass
    Expected Result: Zero regressions
    Failure Indicators: Any existing test now failing
    Evidence: .sisyphus/evidence/task-5-existing-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-interaction-tests.txt
  - [ ] task-5-existing-tests.txt

  **Commit**: YES (group 3)
  - Message: `test(rejection-feedback): add lifecycle, interaction handler, and integration tests`
  - Files: `tests/inngest/interaction-handler-rejection-feedback.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/interaction-handler-rejection-feedback.test.ts`

- [x] 6. FEEDBACK_CONTEXT and summarizer integration verification

  **What to do**:
  Verify that rejection_reason feedback rows are automatically included in both FEEDBACK_CONTEXT and the weekly feedback summarizer — no code changes needed (they already query all feedback rows), but add explicit tests to prove it:
  1. **FEEDBACK_CONTEXT test**: In a new test or appended to an existing test file:
     - Mock PostgREST to return feedback rows including one with `feedback_type: 'rejection_reason'` and `correction_reason: 'The tone was too formal'`
     - Execute the `dispatch-machine` step (or extract the FEEDBACK_CONTEXT builder logic)
     - Assert the resulting `FEEDBACK_CONTEXT` string contains `[rejection_reason] "The tone was too formal"`

  2. **Feedback summarizer test**: Add a test to `tests/inngest/triggers/` (or extend existing):
     - Mock PostgREST to return feedback rows including `rejection_reason` type
     - Execute the summarizer step
     - Assert the LLM prompt includes the rejection_reason feedback text

  The goal is to PROVE the existing pipelines handle rejection_reason rows correctly, not to modify them.

  **Must NOT do**:
  - Do NOT modify `src/inngest/employee-lifecycle.ts` FEEDBACK_CONTEXT builder code
  - Do NOT modify `src/inngest/triggers/feedback-summarizer.ts`
  - Do NOT fix the pre-existing tenant_id filter bug — out of scope
  - Do NOT add new source files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration verification requiring understanding of two separate pipelines
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:153-211` — FEEDBACK_CONTEXT builder. Lines 162-206 query feedback and format into string. Rejection_reason rows should appear in the "Recent specific feedback" section.
  - `src/inngest/triggers/feedback-summarizer.ts:56-121` — Summarizer reads feedback, formats for LLM. Rejection_reason rows should be included.
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — Lifecycle test patterns for mocking the dispatch-machine step

  **Test References**:
  - `tests/inngest/triggers/feedback-summarizer-injection.test.ts` — Existing feedback summarizer test. Follow mock patterns.

  **WHY Each Reference Matters**:
  - `employee-lifecycle.ts:153-211`: The code that builds FEEDBACK_CONTEXT — need to understand how it queries and formats to write proper assertions
  - `feedback-summarizer.ts:56-121`: The code that reads feedback for digests — same reasoning
  - Existing test files: Mock patterns for PostgREST calls in both pipelines

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: FEEDBACK_CONTEXT includes rejection_reason feedback
    Tool: Bash (Vitest)
    Preconditions: Test file with mocked feedback data including rejection_reason
    Steps:
      1. Mock fetch for /rest/v1/feedback to return rows including {feedback_type: 'rejection_reason', correction_reason: 'The tone was too formal'}
      2. Execute FEEDBACK_CONTEXT build logic
      3. Assert output string contains '[rejection_reason]' and 'The tone was too formal'
    Expected Result: Rejection reason appears in FEEDBACK_CONTEXT
    Failure Indicators: Missing from output, wrong format
    Evidence: .sisyphus/evidence/task-6-feedback-context.txt

  Scenario: Feedback summarizer includes rejection_reason in LLM prompt
    Tool: Bash (Vitest)
    Preconditions: Test file with mocked feedback data including rejection_reason
    Steps:
      1. Mock fetch for /rest/v1/feedback to return rows including rejection_reason type
      2. Execute summarizer logic
      3. Assert the callLLM prompt contains the rejection_reason text
    Expected Result: Rejection reason included in summarizer LLM prompt
    Failure Indicators: Missing from prompt
    Evidence: .sisyphus/evidence/task-6-summarizer.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-feedback-context.txt
  - [ ] task-6-summarizer.txt

  **Commit**: YES (group 3)
  - Message: `test(rejection-feedback): add lifecycle, interaction handler, and integration tests`
  - Files: `tests/inngest/lifecycle-feedback-context-rejection.test.ts` (or similar)
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Mark GM-17 complete in story map + full validation

  **What to do**:
  1. Run `pnpm build` — verify clean build
  2. Run `pnpm lint` — verify no lint errors
  3. Run `pnpm test -- --run` — verify ALL tests pass (existing + new)
  4. Edit `docs/2026-04-21-2202-phase1-story-map.md`:
     - Find GM-17 acceptance criteria section
     - Change all `- [ ]` to `- [x]` for the 6 acceptance criteria
  5. Commit the story map update

  **Must NOT do**:
  - Do NOT mark any other story items as complete
  - Do NOT modify any other part of the story map
  - Do NOT modify source code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple doc update + validation run
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md` — Find the GM-17 section with its 6 acceptance criteria checkboxes

  **WHY Each Reference Matters**:
  - Story map is the single source of truth for feature completion status

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run `pnpm build` — assert exit code 0
      2. Run `pnpm lint` — assert exit code 0
      3. Run `pnpm test -- --run` — assert all tests pass
    Expected Result: Build, lint, and all tests pass
    Failure Indicators: Any non-zero exit code
    Evidence: .sisyphus/evidence/task-7-full-validation.txt

  Scenario: GM-17 acceptance criteria marked complete in story map
    Tool: Bash (grep)
    Preconditions: Story map edited
    Steps:
      1. Grep docs/2026-04-21-2202-phase1-story-map.md for GM-17 section
      2. Assert all 6 acceptance criteria show `[x]` (not `[ ]`)
    Expected Result: All 6 checkboxes checked
    Failure Indicators: Any unchecked checkbox in GM-17
    Evidence: .sisyphus/evidence/task-7-story-map.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-full-validation.txt
  - [ ] task-7-story-map.txt

  **Commit**: YES (group 4)
  - Message: `docs(story-map): mark GM-17 rejection feedback loop complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

- [x] 8. Notify completion

  Send Telegram notification: plan `gm17-rejection-feedback-loop` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ gm17-rejection-feedback-loop complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run test). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (rejection → thread reply → feedback capture → FEEDBACK_CONTEXT). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group        | Message                                                                               | Files                                                                                                                | Pre-commit           |
| ------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1 (T1)       | `feat(slack): add thread_ts support to SlackClient.postMessage`                       | `src/lib/slack-client.ts`                                                                                            | `pnpm build`         |
| 2 (T2+T3)    | `feat(lifecycle): post rejection feedback prompt and store rejection reason`          | `src/inngest/employee-lifecycle.ts`, `src/inngest/interaction-handler.ts`                                            | `pnpm build`         |
| 3 (T4+T5+T6) | `test(rejection-feedback): add lifecycle, interaction handler, and integration tests` | `tests/inngest/lifecycle-rejection-feedback.test.ts`, `tests/inngest/interaction-handler-rejection-feedback.test.ts` | `pnpm test -- --run` |
| 4 (T7)       | `docs(story-map): mark GM-17 rejection feedback loop complete`                        | `docs/2026-04-21-2202-phase1-story-map.md`                                                                           | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: no errors
pnpm lint           # Expected: no errors
pnpm test -- --run  # Expected: all pass including new rejection feedback tests
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] GM-17 marked complete in story map
