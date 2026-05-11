# Slack Minimal Feed — Eliminate Broadcast Duplication & Condense Channel Messages

## TL;DR

> **Quick Summary**: Fix the `REPLY_BROADCAST` bug, condense channel messages to compact one-liners, and add a "nudge then delete" pattern — post a short broadcast nudge when approval is needed, then delete it after PM acts, keeping the channel pristine.
>
> **Deliverables**:
>
> - Fix `REPLY_BROADCAST` condition in `employee-lifecycle.ts` (2 lines)
> - New compact block builder function in `slack-blocks.ts`
> - Updated lifecycle call-sites to use compact builder for `notifyMsgRef` updates
> - New nudge broadcast posted in `track-pending-approval` step, deleted in `handle-approval-result`
> - Tests for the new compact builder
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Tasks 1+2 (parallel) → Task 3 (compact blocks) → Tasks 4+5 (nudge post + delete, parallel)

---

## Context

### Original Request

The guest-messaging employee posts duplicate messages in the Slack channel. Every task produces the approval card both in the thread AND as a broadcast in the main channel, doubling the visible messages. The channel is extremely noisy.

### Interview Summary

**Key Discussions**:

- **Channel UX goal**: Minimal feed — ONE compact line per task in the channel
- **Approval accessibility**: Thread is fine — PMs click "1 reply" to see approval card
- **Content density**: Guest name + Property code only, with inline Hostfully link
- **Format examples**: "✅ c.e. Wilson · 7213-NUT-2 — Reply sent · @Victor 🔗 View"
- **Nudge-then-delete**: Post a short broadcast nudge when approval is needed ("⏳ c.e. Wilson · 7213-NUT-2 — Needs your review"). Delete it entirely after PM acts — channel stays pristine.

**Research Findings**:

- `reply_broadcast: true` is set in exactly one place: `post-guest-approval.ts:382`
- The bug is in the condition that injects `REPLY_BROADCAST` env var: it checks `rawEvent['thread_uid']` (always present in Hostfully webhooks) instead of `rawEvent['superseded_notify_ts']` (only present for superseded tasks)
- The `notify-received` message already evolves through all states via `chat.update` — it's the natural single channel message
- `metadata['property_name']` (model-provided) contains the formatted property name at terminal states; `enrichment.propertyName` (API) is available at initial states
- `slack-blocks.ts` is a shared file — Summarizer also uses `buildNotifyStateBlocks`. Must NOT modify existing functions.

### Metis Review

**Identified Gaps** (addressed):

- **Property code availability**: Resolved — `metadata['property_name']` has it at terminal states, `enrichment.propertyName` at initial states
- **Shared file safety**: New compact functions only; existing functions untouched
- **Both Docker paths**: Both line 645 (local) and 669 (Fly.io) must be fixed
- **Fallback supersede path**: Lifecycle-detected supersedes don't set `superseded_notify_ts` — `REPLY_BROADCAST` won't fire, which is correct
- **NO_ACTION_NEEDED path**: Already minimal via `buildNotifyStateBlocks` — leave as-is

---

## Work Objectives

### Core Objective

Reduce main channel noise from 2+ messages per task to exactly 1 compact one-liner, by fixing the broadcast bug and condensing the notify-received message format.

### Concrete Deliverables

- Fixed `REPLY_BROADCAST` condition in `employee-lifecycle.ts` lines 645 and 669
- New `buildCompactNotifyBlocks()` function exported from `src/lib/slack-blocks.ts`
- Updated lifecycle call-sites: all `notifyMsgRef` updates use compact format for guest-messaging tasks
- Nudge broadcast message posted in `track-pending-approval` step, stored in `deliverables.metadata.nudge_ts`
- Nudge deleted via `chat.delete` in `handle-approval-result` step (all terminal paths)
- Unit tests for `buildCompactNotifyBlocks()` in `tests/unit/slack-blocks.test.ts` (or adjacent)

### Definition of Done

- [ ] Single webhook → approval card appears ONLY in thread (no channel broadcast)
- [ ] Channel shows exactly 1 compact message per task + 1 temporary nudge (disappears after PM acts)
- [ ] All lifecycle states render as compact one-liners for guest-messaging tasks
- [ ] Nudge is deleted from channel after approve/reject/edit/expiry/supersede
- [ ] Summarizer messages are unaffected
- [ ] Existing tests pass (`pnpm test -- --run`)

### Must Have

- Fix `REPLY_BROADCAST` on BOTH local Docker (line 645) and Fly.io (line 669) paths
- Compact format includes: status emoji, guest name, property name, status text, actor mention (where applicable), Hostfully link
- Task ID context block preserved at the bottom of every message
- Fallback when enrichment fails (just show emoji + status + task ID)
- Nudge broadcast posted as thread reply to `notifyMsgRef` with `reply_broadcast: true`
- Nudge `ts` stored in `deliverables.metadata.nudge_ts` (JSON blob, no migration)
- `chat.delete` on nudge in ALL terminal paths: approve, reject, edit, expiry, supersede
- Deletion failures swallowed silently (cosmetic, non-critical)

### Must NOT Have (Guardrails)

- Do NOT modify existing `buildEnrichedNotifyBlocks`, `buildEnrichedTerminalBlocks`, `buildNotifyStateBlocks`, `buildContextThreadBlocks`, or `buildSupersededBlocks` functions
- Do NOT modify `post-guest-approval.ts` block structure or the approval card
- Do NOT change approval card (`approvalMsgTs`) update calls — those stay verbose in the thread
- Do NOT use employee-specific language in shared code without gating it behind a role check
- Do NOT change Summarizer message paths
- Do NOT add a Prisma migration — nudge `ts` goes in existing `deliverables.metadata` JSON blob
- Do NOT let nudge deletion failure crash the lifecycle step — always try-catch
- Do NOT delete the notify-received message or the approval card — only delete the nudge

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES — Vitest
- **Automated tests**: YES (tests-after) — unit tests for new block builder
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (Vitest) — run tests, compare output
- **Backend**: Use Bash (curl) — fire webhooks, check lifecycle behavior
- **Frontend/UI**: Use Playwright — inspect Slack channel messages

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent fixes):
├── Task 1: Fix REPLY_BROADCAST condition [quick]
├── Task 2: Create buildCompactNotifyBlocks function + tests [unspecified-high]

Wave 2 (After Wave 1 — lifecycle integration):
├── Task 3: Update lifecycle call-sites to use compact blocks [deep]

Wave 3 (After Wave 2 — nudge feature):
├── Task 4: Post nudge broadcast in track-pending-approval step [unspecified-high]
├── Task 5: Delete nudge in handle-approval-result step [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1+T2 (parallel) → T3 → T4+T5 (parallel) → F1-F4 → user okay
```

### Dependency Matrix

| Task | Depends On | Blocks      | Wave |
| ---- | ---------- | ----------- | ---- |
| 1    | —          | 3, F1-F4    | 1    |
| 2    | —          | 3, F1-F4    | 1    |
| 3    | 1, 2       | 4, 5, F1-F4 | 2    |
| 4    | 3          | F1-F4       | 3    |
| 5    | 3          | F1-F4       | 3    |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `unspecified-high`
- **Wave 2**: 1 task — T3 → `deep`
- **Wave 3**: 2 tasks — T4 → `unspecified-high`, T5 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Fix REPLY_BROADCAST condition — only broadcast for superseded tasks

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find the two lines where `REPLY_BROADCAST: 'true'` is injected into the worker env (lines 645 and 669)
  - Change the condition from `rawEvent['thread_uid']` to `rawEvent['superseded_notify_ts']`
  - Line 645 (local Docker path): `...(rawEvent['thread_uid'] ? { REPLY_BROADCAST: 'true' } : {})` → `...(rawEvent['superseded_notify_ts'] ? { REPLY_BROADCAST: 'true' } : {})`
  - Line 669 (Fly.io path): identical change
  - Both paths MUST be changed identically

  **Must NOT do**:
  - Do NOT touch `post-guest-approval.ts` — the `--reply-broadcast` flag logic there is correct
  - Do NOT modify any other env vars in the dispatch-machine step
  - Do NOT change the `NOTIFY_MSG_TS` injection (that's separate and correct)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 2-line change, straightforward string replacement
  - **Skills**: []
    - No special skills needed for this surgical fix

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:645` — Local Docker path: the `REPLY_BROADCAST` env var injection inside the `localDocker` branch of the `dispatch-machine` step
  - `src/inngest/employee-lifecycle.ts:669` — Fly.io path: the identical `REPLY_BROADCAST` env var injection inside the Fly.io machine dispatch branch

  **API/Type References**:
  - `src/gateway/routes/hostfully.ts:156-161` — Where `superseded_notify_ts` is added to `raw_event` during webhook processing (shows the field name and when it's set)

  **WHY Each Reference Matters**:
  - Line 645/669: These are the exact two lines to change — find `rawEvent['thread_uid']` and replace with `rawEvent['superseded_notify_ts']`
  - `hostfully.ts`: Confirms that `superseded_notify_ts` is the correct field name and is only set when a task is actually superseded

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Normal webhook — approval card should NOT broadcast
    Tool: Bash (grep)
    Preconditions: Code change applied to both lines
    Steps:
      1. Run: grep -n "superseded_notify_ts.*REPLY_BROADCAST" src/inngest/employee-lifecycle.ts
      2. Verify output shows exactly 2 matching lines (the local and Fly.io paths)
      3. Run: grep -n "thread_uid.*REPLY_BROADCAST" src/inngest/employee-lifecycle.ts
      4. Verify output shows 0 matching lines (old condition fully removed)
    Expected Result: 2 lines with `superseded_notify_ts`, 0 lines with `thread_uid` in REPLY_BROADCAST context
    Failure Indicators: Any remaining `thread_uid` in a REPLY_BROADCAST condition
    Evidence: .sisyphus/evidence/task-1-broadcast-condition-check.txt

  Scenario: Build succeeds with the change
    Tool: Bash
    Preconditions: Code change applied
    Steps:
      1. Run: pnpm build
      2. Verify exit code 0
    Expected Result: TypeScript compiles without errors
    Failure Indicators: Any type error in employee-lifecycle.ts
    Evidence: .sisyphus/evidence/task-1-build-check.txt
  ```

  **Commit**: YES
  - Message: `fix(lifecycle): only broadcast approval card for superseded tasks`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Create buildCompactNotifyBlocks function + unit tests

  **What to do**:
  - Add a new exported function `buildCompactNotifyBlocks` to `src/lib/slack-blocks.ts`
  - Function signature should accept a params object with these fields:
    ```typescript
    export function buildCompactNotifyBlocks(params: {
      status:
        | 'processing'
        | 'reviewing'
        | 'done'
        | 'rejected'
        | 'failed'
        | 'expired'
        | 'delivery_failed'
        | 'no_action'
        | 'superseded';
      guestName?: string;
      propertyName?: string;
      actorUserId?: string;
      threadUid?: string;
      leadUid?: string;
      taskId: string;
    }): unknown[];
    ```
  - Return exactly 2 blocks: one `section` block with the compact one-liner text, one `context` block with the task ID
  - Format per status (all on ONE line in the section block):
    - `processing`: `⏳ {guestName} · {propertyName} — Processing 🔗 View`
    - `reviewing`: `⏳ {guestName} · {propertyName} — Awaiting approval 🔗 View`
    - `done`: `✅ {guestName} · {propertyName} — Reply sent · <@{actorUserId}> 🔗 View`
    - `rejected`: `❌ {guestName} · {propertyName} — Rejected · <@{actorUserId}> 🔗 View`
    - `failed`: `❌ {guestName} · {propertyName} — Failed 🔗 View`
    - `expired`: `⏰ {guestName} · {propertyName} — Expired 🔗 View`
    - `delivery_failed`: `❌ {guestName} · {propertyName} — Delivery failed 🔗 View`
    - `no_action`: `✅ {guestName} · {propertyName} — No action needed 🔗 View`
    - `superseded`: `⏭️ {guestName} · {propertyName} — Superseded 🔗 View`
  - The "🔗 View" should be a clickable Hostfully link using `buildHostfullyLink(threadUid, leadUid)` when both are available; omit if either is missing
  - When `guestName` is missing, omit it (start with propertyName or just the status)
  - When `propertyName` is missing, omit the " · propertyName" part
  - When both are missing, show just the status text (e.g., `⏳ Processing`)
  - Bold the entire text line using `*...*` mrkdwn syntax
  - Add unit tests covering: all 9 statuses, missing guestName, missing propertyName, missing both, missing threadUid/leadUid (no link), full params (with link)

  **Must NOT do**:
  - Do NOT modify any existing function in `slack-blocks.ts`
  - Do NOT import anything new — `buildHostfullyLink` is already in the same file
  - Do NOT add employee-specific branching inside existing functions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New function with multiple status branches + comprehensive test coverage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3, F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/slack-blocks.ts:58-73` — `buildNotifyStateBlocks` — follow this pattern for return type (`unknown[]`) and block structure (section + context)
  - `src/lib/slack-blocks.ts:155-157` — `buildHostfullyLink` — use this helper for the Hostfully URL
  - `src/lib/slack-blocks.ts:159-305` — `buildEnrichedTerminalBlocks` — reference for how status-based switching is done and how `actorUserId` is formatted as `<@{userId}>`

  **Test References**:
  - Check `tests/` directory for existing `slack-blocks` tests to follow the same pattern. If none exist, create `tests/unit/slack-blocks.test.ts` following Vitest conventions used elsewhere in the project.

  **WHY Each Reference Matters**:
  - `buildNotifyStateBlocks`: The compact function replaces this for guest-messaging — follow the same 2-block structure (section + context)
  - `buildHostfullyLink`: Reuse this to generate the Hostfully URL — don't reconstruct it
  - `buildEnrichedTerminalBlocks`: Shows the status-switching pattern and mrkdwn formatting conventions to follow

  **Acceptance Criteria**:
  - [ ] `buildCompactNotifyBlocks` exported from `src/lib/slack-blocks.ts`
  - [ ] Returns exactly 2 blocks for every status
  - [ ] `pnpm test -- --run` passes with new tests

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 9 statuses produce valid compact blocks
    Tool: Bash (Vitest)
    Preconditions: Function and tests written
    Steps:
      1. Run: pnpm test -- --run tests/unit/slack-blocks.test.ts
      2. Verify all tests pass
    Expected Result: 0 failures, all status variants tested
    Failure Indicators: Any test failure or missing status coverage
    Evidence: .sisyphus/evidence/task-2-unit-tests.txt

  Scenario: Function returns exactly 2 blocks (section + context)
    Tool: Bash (Vitest)
    Preconditions: Tests include block count assertion
    Steps:
      1. In test: call buildCompactNotifyBlocks with full params for each status
      2. Assert result.length === 2
      3. Assert result[0].type === 'section'
      4. Assert result[1].type === 'context'
    Expected Result: All statuses return exactly 2 blocks with correct types
    Evidence: .sisyphus/evidence/task-2-block-structure.txt

  Scenario: Fallback when no guest/property info
    Tool: Bash (Vitest)
    Preconditions: Tests include edge case for missing params
    Steps:
      1. Call buildCompactNotifyBlocks({ status: 'processing', taskId: 'test-123' })
      2. Assert section text is "*⏳ Processing*" (no guest/property/link)
      3. Assert context text is "Task `test-123`"
    Expected Result: Graceful fallback with no undefined/null in output
    Evidence: .sisyphus/evidence/task-2-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(slack): add compact notify blocks for minimal channel feed`
  - Files: `src/lib/slack-blocks.ts`, `tests/unit/slack-blocks.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Update lifecycle call-sites to use compact blocks for guest-messaging notify-received updates

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find ALL places where the `notifyMsgRef` message is updated via `slackClient.updateMessage(...)` for guest-messaging tasks
  - Replace the current block builders (`buildEnrichedNotifyBlocks`, `buildEnrichedTerminalBlocks`, `buildNotifyStateBlocks`) with `buildCompactNotifyBlocks` **only for the `notifyMsgRef` updates** — NEVER for `approvalMsgTs` updates
  - The key call-sites to update (all update `notifyMsgRef.ts`):
    1. **`notify-received` step** (~line 298-303): Initial message creation — use `buildCompactNotifyBlocks({ status: 'processing', guestName, propertyName: enrichment.propertyName, threadUid, leadUid, taskId })`
    2. **`update-notify-reviewing` step** (~line 1329): Update to reviewing state — use `buildCompactNotifyBlocks({ status: 'reviewing', guestName, propertyName, threadUid, leadUid, taskId })`
    3. **`handle-approval-result` — approve notify update** (~line 1659): Update on approval — use `buildCompactNotifyBlocks({ status: 'done', guestName, propertyName: metadata['property_name'], actorUserId, threadUid, leadUid, taskId })`
    4. **`handle-approval-result` — done notify update** (~line 1838-1859): Terminal done state — use `buildCompactNotifyBlocks({ status: 'done', ... })` (same as above, may already be updated at this point)
    5. **`handle-approval-result` — reject notify update** (~line 2041-2060): Rejection terminal — use `buildCompactNotifyBlocks({ status: 'rejected', guestName, propertyName: metadata['property_name'], actorUserId, threadUid, leadUid, taskId })`
    6. **`handle-approval-result` — expiry notify update** (~line 1444-1461): Expiry terminal — use `buildCompactNotifyBlocks({ status: 'expired', guestName, propertyName, threadUid, leadUid, taskId })`
    7. **`mark-failed` step** (~line 700-737): Failure terminal — use `buildCompactNotifyBlocks({ status: 'failed', guestName, propertyName, threadUid, leadUid, taskId })`
    8. **Superseded notify update** (~line 1891-1898): Superseded — use `buildCompactNotifyBlocks({ status: 'superseded', guestName, propertyName, threadUid, leadUid, taskId })`
    9. **Delivery failure notify update** (~line 1787-1805): Delivery failed — use `buildCompactNotifyBlocks({ status: 'delivery_failed', guestName, propertyName: metadata['property_name'], threadUid, leadUid, taskId })`
  - **CRITICAL**: These changes MUST be gated behind a check for `task.archetype?.role_name === 'guest-messaging'` (or equivalent). When the role is NOT guest-messaging (e.g., Summarizer), fall through to the existing block builders unchanged.
  - **Data availability**: At `notify-received` time, guest info comes from `enrichment` (fetched from Hostfully API). At terminal states, guest info comes from `metadata` (stored in the deliverable by the worker). Both paths need to extract `guestName`, `propertyName`, `threadUid`, `leadUid`.
  - `threadUid` and `leadUid` are available from `task.raw_event` at all lifecycle steps.

  **Must NOT do**:
  - Do NOT change any `approvalMsgTs` update calls (lines that update `deliverableRefs.metadata.approval_message_ts`) — those stay verbose with `buildEnrichedTerminalBlocks`
  - Do NOT change `buildContextThreadBlocks` calls (thread-only context replies)
  - Do NOT change any `buildSupersededBlocks` calls on the approval card
  - Do NOT remove existing block builder imports — they're still used for non-guest-messaging employees and for approval card updates
  - Do NOT change the `NO_ACTION_NEEDED` path's `buildNoActionThreadBlocks` or `buildOverrideCardBlocks` calls (those are thread-only)
  - Do NOT add employee-specific log messages or comments that name "guest-messaging" — use the role_name variable

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple call-sites across a large lifecycle file (~2500 lines), requires careful identification of which updates target `notifyMsgRef` vs `approvalMsgTs`, and conditional branching by employee type
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1, Task 2

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:298-303` — `notify-received` step, guest-messaging branch where `buildEnrichedNotifyBlocks` is called for the initial `postMessage`
  - `src/inngest/employee-lifecycle.ts:1293-1329` — `update-notify-reviewing` step where `notifyMsgRef` is updated with `buildNotifyStateBlocks`
  - `src/inngest/employee-lifecycle.ts:1610-1670` — `handle-approval-result` approve path — both `approvalMsgTs` update (line ~1610, keep verbose) and `notifyMsgRef` update (line ~1659, make compact)
  - `src/inngest/employee-lifecycle.ts:1816-1860` — `handle-approval-result` done state — `approvalMsgTs` update (line ~1816, keep verbose) and `notifyMsgRef` update (line ~1849, make compact)
  - `src/inngest/employee-lifecycle.ts:1986-2060` — reject path — same dual-update pattern
  - `src/inngest/employee-lifecycle.ts:1431-1461` — expiry path
  - `src/inngest/employee-lifecycle.ts:700-737` — `mark-failed` step
  - `src/inngest/employee-lifecycle.ts:1876-1898` — superseded notify update

  **API/Type References**:
  - `src/lib/slack-blocks.ts` — `buildCompactNotifyBlocks` — the new function from Task 2 to call at each site
  - `src/lib/hostfully-enrichment.ts:13-19` — `LeadEnrichment` type — shows what fields are available from enrichment

  **WHY Each Reference Matters**:
  - Lines 298-303: First message creation — this is a `postMessage`, not `updateMessage`, so the compact blocks go in the `blocks` param of the initial post
  - Lines 1610-1670 vs 1816-1860: Shows the dual-update pattern — one update targets `approvalMsgTs` (keep verbose), the other targets `notifyMsgRef.ts` (make compact). Must correctly distinguish between the two.
  - `LeadEnrichment` type: Shows what data is available at `notify-received` time vs later when `metadata` from the deliverable provides model-enriched data

  **Acceptance Criteria**:
  - [ ] All `notifyMsgRef` updates for guest-messaging use `buildCompactNotifyBlocks`
  - [ ] All `approvalMsgTs` updates unchanged
  - [ ] Non-guest-messaging employees (Summarizer) still use existing block builders
  - [ ] `pnpm build` passes (no type errors)
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Guest-messaging notify updates use compact blocks
    Tool: Bash (grep)
    Preconditions: All call-sites updated
    Steps:
      1. Run: grep -n "buildCompactNotifyBlocks" src/inngest/employee-lifecycle.ts
      2. Count the occurrences — should be 7-9 (one per lifecycle state update on notifyMsgRef)
      3. Run: grep -n "buildEnrichedTerminalBlocks" src/inngest/employee-lifecycle.ts
      4. Verify remaining occurrences are ONLY for approvalMsgTs updates (thread card), not notifyMsgRef
    Expected Result: buildCompactNotifyBlocks used for all notifyMsgRef updates; buildEnrichedTerminalBlocks only on approval card updates
    Failure Indicators: buildEnrichedTerminalBlocks still used for a notifyMsgRef update, or buildCompactNotifyBlocks used for an approvalMsgTs update
    Evidence: .sisyphus/evidence/task-3-callsite-audit.txt

  Scenario: Summarizer messages are unaffected
    Tool: Bash (grep)
    Preconditions: Role-gating implemented
    Steps:
      1. Search for the role-name conditional gating in the lifecycle: grep -n "role_name.*guest-messaging\|guest.messaging.*role_name" src/inngest/employee-lifecycle.ts
      2. Verify at least one conditional check exists
      3. Verify the else branch (non-guest-messaging) still calls the original block builders
    Expected Result: Guest-messaging gating exists; Summarizer path unchanged
    Evidence: .sisyphus/evidence/task-3-summarizer-safety.txt

  Scenario: Build and tests pass
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run: pnpm build
      2. Run: pnpm test -- --run
    Expected Result: Both commands exit 0
    Failure Indicators: Type errors in employee-lifecycle.ts or test failures
    Evidence: .sisyphus/evidence/task-3-build-test.txt
  ```

  **Commit**: YES
  - Message: `refactor(lifecycle): use compact blocks for guest-messaging notify-received updates`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Post nudge broadcast in track-pending-approval step

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, inside the `track-pending-approval` step (after `trackPendingApproval()` call at ~line 1362), add a new Slack message post for guest-messaging tasks only
  - Post a compact nudge as a thread reply to `notifyMsgRef` with `reply_broadcast: true`:
    ```
    "⏳ *{guestName} · {propertyName} — Needs your review*"
    ```
  - Use `slackClient.postMessage()` or direct `WebClient.chat.postMessage()` with:
    - `channel`: the notification channel (same as `notifyMsgRef.channel`)
    - `thread_ts`: `notifyMsgRef.ts` (thread reply to the notify-received message)
    - `reply_broadcast: true` (this is the intentional broadcast — PMs see it in channel)
    - `text`: the compact nudge text (fallback for notifications)
    - `blocks`: minimal — one section block with the nudge text
  - Capture the returned `ts` from the postMessage call
  - Store `nudge_ts` and `nudge_channel` in the `deliverables.metadata` JSON blob by PATCHing the deliverable row via PostgREST:
    ```typescript
    // After posting nudge:
    const nudgeResult = await slackClient.postMessage({
      channel: targetChannel,
      text: `⏳ ${guestName} · ${propertyName} — Needs your review`,
      blocks: buildCompactNotifyBlocks({
        status: 'reviewing',
        guestName: delivMeta.guest_name as string | undefined,
        propertyName: delivMeta.property_name as string | undefined,
        threadUid: rawEventForTracking['thread_uid'],
        leadUid: rawEventForTracking['lead_uid'],
        taskId,
      }),
      thread_ts: notifyMsgRef?.ts,
      reply_broadcast: true,
    });
    // Store nudge ts in deliverable metadata
    await fetch(`${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        metadata: { ...delivMeta, nudge_ts: nudgeResult.ts, nudge_channel: targetChannel },
      }),
    });
    ```
  - Gate behind `task.archetype?.role_name === 'guest-messaging'` check — Summarizer should NOT post nudges
  - If the postMessage fails, log a warning but do NOT fail the step — the nudge is cosmetic

  **Must NOT do**:
  - Do NOT post the nudge for non-guest-messaging employees
  - Do NOT post the nudge if the task is `NO_ACTION_NEEDED` (pre-check path)
  - Do NOT modify the `trackPendingApproval()` call itself or the `pending_approvals` table
  - Do NOT use `chat.update` on the nudge — it's meant to be ephemeral (posted then deleted)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Moderate complexity — Slack API call + PostgREST metadata update + conditional logic in a large lifecycle file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 3 (needs compact blocks and the lifecycle changes in place)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1336-1373` — `track-pending-approval` step — the exact location where the nudge post should go (after `trackPendingApproval()` call at line 1362)
  - `src/inngest/employee-lifecycle.ts:1340-1350` — How `delivMeta` is fetched from PostgREST and destructured (same pattern for reading/writing metadata)
  - `src/inngest/employee-lifecycle.ts:298-303` — Example of `postMessage` call with blocks in the same lifecycle

  **API/Type References**:
  - `src/lib/slack-client.ts:38-70` — `SlackClient.postMessage()` — check if it supports `reply_broadcast` and `thread_ts` params. If not, use the raw `WebClient` directly.
  - `src/lib/slack-blocks.ts` — `buildCompactNotifyBlocks` — reuse the `reviewing` status for the nudge content

  **WHY Each Reference Matters**:
  - Line 1336-1373: This is where the nudge goes — right after approval tracking. The `delivMeta`, `targetChannel`, `approvalMsgTs`, and `notifyMsgRef` are all available here
  - `SlackClient.postMessage`: Need to check if it passes through `reply_broadcast` — if not, the nudge must use the raw Slack WebClient. The `SlackClient` wrapper at line 38 does accept `thread_ts` but may not accept `reply_broadcast` (it's not in the current signature)

  **Acceptance Criteria**:
  - [ ] Nudge posted as broadcast thread reply to `notifyMsgRef` for guest-messaging tasks
  - [ ] `nudge_ts` stored in `deliverables.metadata`
  - [ ] Non-guest-messaging employees do NOT get nudges
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Nudge posting code exists and compiles
    Tool: Bash (grep + build)
    Preconditions: Code added to track-pending-approval step
    Steps:
      1. Run: grep -n "nudge_ts\|reply_broadcast.*true\|Needs your review" src/inngest/employee-lifecycle.ts
      2. Verify at least 2 matches (posting + metadata storage)
      3. Run: pnpm build
      4. Verify exit code 0
    Expected Result: Nudge-related code present and compiles
    Evidence: .sisyphus/evidence/task-4-nudge-code.txt

  Scenario: Nudge is gated behind guest-messaging role check
    Tool: Bash (grep)
    Preconditions: Role gating implemented
    Steps:
      1. Verify the nudge post is inside a guest-messaging conditional block
      2. grep -A5 "guest.messaging.*nudge\|nudge.*guest.messaging" src/inngest/employee-lifecycle.ts
    Expected Result: Nudge post is conditional on role_name
    Evidence: .sisyphus/evidence/task-4-role-gate.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(lifecycle): add nudge broadcast for guest-messaging approval requests`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Delete nudge in handle-approval-result step (all terminal paths)

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, inside the `handle-approval-result` step, add `chat.delete` calls to remove the nudge message
  - The nudge `ts` is stored in `deliverables.metadata.nudge_ts` and `deliverables.metadata.nudge_channel` (written by Task 4)
  - Read `nudge_ts` and `nudge_channel` from `delivMeta` (already fetched at ~line 1404-1410)
  - Call `chat.delete` early in the step, BEFORE any other message updates — this ensures the nudge disappears immediately regardless of which action was taken
  - Delete in ALL terminal paths:
    1. **Approve path** — before the approval card update
    2. **Reject path** — before the rejection card update
    3. **Expiry path** — before the expiry card update
    4. **Supersede path** — handled separately in `check-supersede` step; add nudge deletion there too if the superseded task has a nudge
  - Since all paths go through the same `handle-approval-result` step, a single deletion block at the top of the step (before the approve/reject/expiry branching) handles cases 1-3
  - For the supersede path (case 4): the `check-supersede` step at ~line 1159 already looks up the old task's deliverable metadata — add nudge deletion there
  - **Error handling**: Wrap `chat.delete` in a try-catch. If deletion fails (message already deleted, bot lacks permission, etc.), log a warning but do NOT fail the step
  - **Check `SlackClient`**: The `SlackClient` wrapper may not have a `deleteMessage` method. If not, use the raw `WebClient` from `@slack/web-api` directly:
    ```typescript
    const { WebClient } = await import('@slack/web-api');
    const web = new WebClient(slackToken);
    try {
      const nudgeTs = delivMeta.nudge_ts as string | undefined;
      const nudgeChannel = delivMeta.nudge_channel as string | undefined;
      if (nudgeTs && nudgeChannel) {
        await web.chat.delete({ channel: nudgeChannel, ts: nudgeTs });
      }
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to delete nudge message (non-fatal)');
    }
    ```

  **Must NOT do**:
  - Do NOT let a deletion failure crash the step — this is cosmetic, the actual approval/rejection flow must complete
  - Do NOT delete the approval card (`approvalMsgTs`) — only delete the nudge (`nudge_ts`)
  - Do NOT delete the `notify-received` message (`notifyMsgRef.ts`) — that stays as the permanent compact record
  - Do NOT add a Prisma migration — all metadata goes through the existing `deliverables.metadata` JSON blob

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple insertion points across the lifecycle + careful error handling + need to distinguish nudge vs approval card vs notify messages
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 3 (with Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1382-1410` — Start of `handle-approval-result` step — where the nudge deletion block should go (early, before branching)
  - `src/inngest/employee-lifecycle.ts:1404-1410` — Where `delivMeta` is fetched — `nudge_ts` and `nudge_channel` are read from here
  - `src/inngest/employee-lifecycle.ts:1159-1260` — `check-supersede` step — add nudge deletion for the superseded task's nudge here
  - `src/inngest/employee-lifecycle.ts:1431-1461` — Expiry path in handle-approval-result — nudge should already be deleted by the early block

  **API/Type References**:
  - Slack Web API `chat.delete`: `{ channel: string, ts: string }` — standard params
  - `src/lib/slack-client.ts` — Check if `deleteMessage` exists. If not, use `WebClient` directly.

  **WHY Each Reference Matters**:
  - Lines 1382-1410: The nudge deletion must go HERE (early in the step) so it fires for all paths (approve, reject, expiry)
  - Lines 1404-1410: This is where `delivMeta` is already destructured — add `nudge_ts` and `nudge_channel` extraction here
  - Lines 1159-1260: The supersede path runs in a different step — needs its own nudge deletion logic

  **Acceptance Criteria**:
  - [ ] `chat.delete` called with `nudge_ts` early in `handle-approval-result`
  - [ ] Deletion is wrapped in try-catch (non-fatal)
  - [ ] Superseded task's nudge also deleted in `check-supersede`
  - [ ] `pnpm build` passes
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Nudge deletion code exists in handle-approval-result
    Tool: Bash (grep)
    Preconditions: Deletion code added
    Steps:
      1. Run: grep -n "chat.delete\|nudge_ts\|nudge_channel" src/inngest/employee-lifecycle.ts
      2. Verify matches in both handle-approval-result and check-supersede regions
      3. Run: grep -n "non-fatal\|Failed to delete nudge" src/inngest/employee-lifecycle.ts
      4. Verify error handling is present (try-catch)
    Expected Result: Deletion code present in both steps with error handling
    Evidence: .sisyphus/evidence/task-5-deletion-code.txt

  Scenario: Build and tests pass
    Tool: Bash
    Preconditions: All deletion code added
    Steps:
      1. Run: pnpm build
      2. Run: pnpm test -- --run
    Expected Result: Both exit 0
    Evidence: .sisyphus/evidence/task-5-build-test.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(lifecycle): delete nudge broadcast after PM action`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Fire a real Hostfully webhook: `curl -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"qa-final-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'`. Wait for task to reach Reviewing. Open Slack `#cs-guest-communication` (C0960S2Q8RL). Verify: (1) exactly 1 compact top-level message + 1 nudge broadcast in channel, (2) approval card is in thread only (no separate broadcast), (3) nudge says "Needs your review". Then approve the task. Verify: (4) nudge disappears from channel, (5) compact message updates to "✅ Reply sent", (6) only 1 message remains in channel for this task. Screenshot evidence at both stages.
      Output: `Channel Messages [1 before + nudge, 1 after] | Nudge Deleted [YES/NO] | Compact [YES/NO] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                               | Files                                                        | Pre-commit           |
| ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------- |
| 1      | `fix(lifecycle): only broadcast approval card for superseded tasks`                   | `src/inngest/employee-lifecycle.ts`                          | `pnpm test -- --run` |
| 2      | `feat(slack): add compact notify blocks for minimal channel feed`                     | `src/lib/slack-blocks.ts`, `tests/unit/slack-blocks.test.ts` | `pnpm test -- --run` |
| 3      | `refactor(lifecycle): use compact blocks for guest-messaging notify-received updates` | `src/inngest/employee-lifecycle.ts`                          | `pnpm test -- --run` |
| 4      | `feat(lifecycle): add nudge broadcast for guest-messaging approval requests`          | `src/inngest/employee-lifecycle.ts`                          | `pnpm build`         |
| 5      | `feat(lifecycle): delete nudge broadcast after PM action`                             | `src/inngest/employee-lifecycle.ts`                          | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run        # Expected: all tests pass
pnpm build                # Expected: no TypeScript errors
pnpm lint                 # Expected: no lint errors
```

### Final Checklist

- [ ] `REPLY_BROADCAST` condition uses `superseded_notify_ts` on both Docker paths
- [ ] New `buildCompactNotifyBlocks` function exists in `slack-blocks.ts`
- [ ] All `notifyMsgRef` updates for guest-messaging use compact blocks
- [ ] Existing block builder functions unmodified
- [ ] Summarizer messages unaffected
- [ ] Nudge broadcast posted as thread reply with `reply_broadcast: true`
- [ ] `nudge_ts` stored in `deliverables.metadata`
- [ ] Nudge deleted via `chat.delete` in all terminal paths (approve, reject, expiry, supersede)
- [ ] Deletion failures handled gracefully (try-catch, non-fatal)
- [ ] All tests pass
- [ ] Channel shows 1 compact message per task + ephemeral nudge (deleted after action)

---

## Notification

- [x] N. **Notify completion** — Send Telegram notification: plan `slack-minimal-feed` complete, all tasks done, come back to review results.
  ```bash
  tsx scripts/telegram-notify.ts "✅ slack-minimal-feed complete — All tasks done. Come back to review results."
  ```
