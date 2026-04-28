# GM-06: Send Approved Response to Guest

## TL;DR

> **Quick Summary**: Wire the existing Slack approval → lifecycle delivery → Hostfully send-message.ts pipeline so approved guest responses actually reach the guest, with "Sent" confirmation and error feedback on the Slack card.
>
> **Deliverables**:
>
> - Dockerfile COPY fix so `send-message.ts` is available in the worker container
> - Lifecycle "Sent ✓" Slack card update after successful delivery
> - Lifecycle error Slack card update after failed delivery (3 retries exhausted)
> - Updated `delivery_instructions` with `--thread-id` for proper Hostfully threading
> - TDD unit tests for all lifecycle changes
> - E2E verification against real Hostfully API (VLRE test resources)
> - Story map GM-06 acceptance criteria marked complete
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (tests) → Task 3 (lifecycle) → Task 6 (E2E)

---

## Context

### Original Request

Implement GM-06 from the Phase 1 story map: "Send Approved Response to Guest." When a PM approves (or edits and approves) an AI-drafted guest response in Slack, the platform must send that response to the guest via Hostfully immediately. The Slack card should show "Sent" status after delivery and error status if delivery fails.

### Interview Summary

**Key Discussions**:

- E2E test strategy: Real Hostfully API using VLRE test resources (thread `2f18249a-...`, lead `37f5f58f-...`)
- Test approach: TDD — write failing tests first, then implement
- Edit & Send flow: Already fully wired in GM-05 (`editedContent` → lifecycle patches `deliverables.content.draftResponse`)
- Retry button: Excluded from scope — error visibility only, no Slack retry button

**Research Findings**:

- **HF-05 complete**: `send-message.ts` exists, tested (11 scenarios), accepts `--lead-id`, `--thread-id`, `--message`
- **GM-05 complete**: `post-guest-approval.ts` posts Block Kit card with `guest_approve`/`guest_edit`/`guest_reject` buttons
- **Bolt handlers exist**: `guest_approve`, `guest_edit`, `guest_reject` all fire `employee/approval.received`
- **Lifecycle delivery path exists**: approve → patch deliverable → "delivering now" card → spawn Fly.io machine → poll → retry 3x
- **Delivery-phase harness exists**: reads `archetype.delivery_instructions` + deliverable content → runs OpenCode → patches task Done
- **Archetype delivery_instructions seeded**: References `send-message.ts --lead-id ...` but missing `--thread-id`
- **CRITICAL GAP**: `send-message.ts` NOT in Dockerfile COPY block — delivery machine will fail on every attempt
- **CRITICAL GAP**: No "Sent" Slack card update after delivery Done
- **CRITICAL GAP**: No error Slack card update after delivery failure

### Metis Review

**Identified Gaps** (addressed):

- Retry button scope clarified: error visibility only (user confirmed)
- `handle-approval-result` step atomicity: all card updates must be INSIDE that step, not new steps
- `delivery_instructions` field name mismatch: instructions say `lead_uid` but JSON field is `leadUid` — must match
- Both DozalDevs (`...014`) and VLRE (`...015`) guest-messaging archetypes need delivery_instructions update
- Re-seed (`pnpm prisma db seed`) required after seed.ts changes, before E2E
- Docker rebuild required after Dockerfile changes, before E2E
- `threadUid` may be null for new conversations — delivery_instructions must handle the optional case
- `approvalMsgTs` and `targetChannel` are in scope within `handle-approval-result` — no scoping issue

---

## Work Objectives

### Core Objective

Close the 3 infrastructure gaps that prevent approved guest responses from being delivered to guests via Hostfully, and add post-delivery Slack feedback so PMs know the message was sent (or failed).

### Concrete Deliverables

- `Dockerfile` — 1 new COPY line for `send-message.ts`
- `src/inngest/employee-lifecycle.ts` — "Sent ✓" card update after delivery Done + error card update after delivery Failed
- `prisma/seed.ts` — `delivery_instructions` updated with `--thread-id` for both guest-messaging archetypes
- `tests/inngest/lifecycle-guest-delivery.test.ts` — new TDD test file for delivery card updates
- `docs/2026-04-21-2202-phase1-story-map.md` — GM-06 acceptance criteria marked `[x]`

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 new failures
- [ ] `docker build -t ai-employee-worker:latest .` succeeds
- [ ] `send-message.ts` accessible at `/tools/hostfully/send-message.ts` inside container
- [ ] After approve, Slack card shows "Sent ✓" with timestamp
- [ ] After 3 failed deliveries, Slack card shows error message
- [ ] E2E: guest message appears in Hostfully inbox after approval

### Must Have

- Dockerfile COPY for `send-message.ts`
- "Sent ✓" Slack card update with timestamp after delivery Done
- Error Slack card update after delivery exhausts 3 retries
- `--thread-id` in delivery_instructions for Hostfully threading
- TDD: failing tests written before implementation
- E2E against real Hostfully API

### Must NOT Have (Guardrails)

- **NO new Slack action handlers** — no retry button (confirmed out of scope)
- **NO changes to `send-message.ts`** — HF-05 is complete and read-only
- **NO changes to `post-guest-approval.ts`** — GM-05 is complete and read-only
- **NO new `step.run()` after `handle-approval-result`** — Inngest step atomicity; all updates inside existing step
- **NO changes to `tenant-env-loader.ts`** — `HOSTFULLY_API_KEY` already flows correctly
- **NO inline delivery in lifecycle** — PLAT-05 mandates delivery machine pattern
- **NO changes to non-guest-messaging archetypes** — summarizer delivery_instructions untouched
- **NO message preview in "Sent" card** — avoids PII in Slack history; timestamp only
- **NO AI slop**: no excessive comments, no over-abstraction, no generic variable names, no unnecessary error handling layers

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests, InngestTestEngine)
- **Automated tests**: TDD (RED → GREEN → REFACTOR)
- **Framework**: Vitest with `@inngest/test`
- **If TDD**: Each implementation task has its test task preceding it

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Lifecycle changes**: Use Bash (Vitest) — run test suite, assert pass counts
- **Dockerfile**: Use Bash (docker build + docker run) — verify file exists in container
- **Seed changes**: Use Bash (psql) — query DB for updated delivery_instructions
- **E2E**: Use Bash (curl + tsx) — trigger task, approve, verify Hostfully message

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — TDD + infrastructure fixes):
├── Task 1: TDD — Write failing tests for "Sent" and error card updates [quick]
├── Task 2: Dockerfile COPY fix for send-message.ts [quick]
├── Task 3: Update delivery_instructions with --thread-id in seed.ts [quick]
└── Task 4: Fix pre-existing test mocks (SlackClient.updateMessage) [quick]

Wave 2 (After Wave 1 — implementation to make tests pass):
├── Task 5: Implement "Sent" and error card updates in lifecycle [deep]
└── Task 6: Re-seed DB + rebuild Docker image [quick]

Wave 3 (After Wave 2 — verification):
├── Task 7: E2E verification against real Hostfully API [unspecified-high]
└── Task 8: Mark GM-06 complete in story map [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 5      | 1    |
| 2    | —          | 6      | 1    |
| 3    | —          | 6      | 1    |
| 4    | —          | 1      | 1    |
| 5    | 1, 4       | 7      | 2    |
| 6    | 2, 3       | 7      | 2    |
| 7    | 5, 6       | 8      | 3    |
| 8    | 7          | F1-F4  | 3    |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **2 tasks** — T5 → `deep`, T6 → `quick`
- **Wave 3**: **2 tasks** — T7 → `unspecified-high`, T8 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. TDD — Write Failing Tests for "Sent" and Error Card Updates

  **What to do**:
  - Create new test file `tests/inngest/lifecycle-guest-delivery.test.ts`
  - Follow the exact pattern from `tests/inngest/employee-lifecycle-delivery.test.ts`: `vi.hoisted()` for mocks, `vi.mock()` for modules, `InngestTestEngine` + `transformCtx`, `vi.stubGlobal('fetch', buildFetchMock(...))`, `vi.stubGlobal('setTimeout', (fn: Function) => fn())`
  - Write test: **"updates Slack card to Sent after successful delivery"** — mock `step.waitForEvent` to return `{action:'approve', userId:'U-ACTOR'}`, mock fetch to return task polling status `['Done']` on first poll, assert `mockUpdateMessage` is called with text matching `/✅ Sent.*\d{4}/` and `targetChannel` + `approvalMsgTs` from deliverable metadata
  - Write test: **"updates Slack card to error after 3 failed deliveries"** — mock fetch to return `['Failed', 'Failed', 'Failed']` across 3 retry cycles, assert `mockUpdateMessage` is called with text containing "failed" or "error" (case-insensitive)
  - Write test: **"Sent card update is non-fatal if approvalMsgTs missing"** — mock deliverable metadata without `approval_message_ts`, assert delivery still succeeds (task patched to Done), no `updateMessage` call for the "Sent" update
  - Write test: **"edited response sent correctly"** — mock approval event with `editedContent: 'Edited text'`, assert deliverable PATCH body contains `draftResponse: 'Edited text'`, delivery proceeds normally
  - Run tests: expect ALL to FAIL (RED phase — lifecycle doesn't have these features yet)

  **Must NOT do**:
  - Do NOT modify `employee-lifecycle.ts` yet — tests must fail first (TDD RED phase)
  - Do NOT create a new `step.run` — tests must assert behavior inside `handle-approval-result`
  - Do NOT duplicate tests from `employee-lifecycle-delivery.test.ts` — only test the NEW behavior (Sent card, error card)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward test file creation following an existing pattern
  - **Skills**: []
    - No special skills needed — test patterns are well-documented in references

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 4 completes)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 4 (mock fixes needed for tests to even compile)

  **References**:

  **Pattern References** (existing code to follow):
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — THE reference. Copy the entire test setup pattern: `vi.hoisted()` block, `vi.mock()` calls, `InngestTestEngine` constructor with `transformCtx`, `buildFetchMock` helper. This file tests the existing delivery retry loop — your tests extend it for the "Sent" and "error" card updates.
  - `tests/inngest/lifecycle-guest-approval.test.ts` — Tests the `editedContent` path. Shows how to mock the approval event with `editedContent` and assert the deliverable PATCH. Your "edited response sent correctly" test follows this pattern.

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts:351-615` — The `handle-approval-result` step. Lines 549-561 are the retry loop where your "Sent" and "error" updates will be added (Task 5). Your tests must assert calls that happen AFTER the retry loop.
  - `src/lib/slack-client.ts` — `SlackClient` interface with `updateMessage(channel, ts, text, blocks)` method. This is what your `mockUpdateMessage` mock needs to match.

  **Test References**:
  - `tests/inngest/employee-lifecycle-delivery.test.ts:describe("delivery machine retries")` — Shows how to mock `['Failed', 'Failed', 'Failed']` status sequence for the 3-retry test
  - `tests/inngest/employee-lifecycle-delivery.test.ts:describe("approve spawns delivery machine")` — Shows how to mock `['Done']` status for the success path test

  **Acceptance Criteria**:
  - [ ] File `tests/inngest/lifecycle-guest-delivery.test.ts` exists
  - [ ] At least 4 test cases: Sent card success, error card on 3 failures, non-fatal missing approvalMsgTs, editedContent flow
  - [ ] `pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts` runs (tests FAIL — RED phase is correct)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tests compile and run (but fail — RED phase)
    Tool: Bash
    Preconditions: Task 4 mock fixes applied
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts 2>&1
      2. Check output for test count — should be 4+ tests
      3. Check output for failure count — all tests should FAIL
    Expected Result: 4+ tests run, all fail with assertion errors (not compilation errors)
    Failure Indicators: Compilation errors (import failures, type errors) instead of test assertion failures
    Evidence: .sisyphus/evidence/task-1-tdd-red-phase.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `test(lifecycle): add TDD tests for guest delivery card updates`
  - Files: `tests/inngest/lifecycle-guest-delivery.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts` (expect failures — RED phase)

---

- [x] 2. Dockerfile COPY Fix for send-message.ts

  **What to do**:
  - Open `Dockerfile` and find the Hostfully tools COPY block (after `RUN mkdir -p /tools/hostfully`)
  - Add: `COPY --from=builder /build/src/worker-tools/hostfully/send-message.ts /tools/hostfully/send-message.ts`
  - Place it after the existing Hostfully COPY lines (after `get-reviews.ts` line), before `RUN mkdir -p /tools/platform`

  **Must NOT do**:
  - Do NOT add `npm install` for Hostfully tools — they use native `fetch`, no external deps
  - Do NOT change the order of existing COPY lines
  - Do NOT modify any other section of the Dockerfile

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line addition to an existing file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `Dockerfile:65-71` — Existing Hostfully COPY block. Follow the exact same `COPY --from=builder /build/src/worker-tools/hostfully/{name}.ts /tools/hostfully/{name}.ts` pattern.

  **API/Type References**:
  - `src/worker-tools/hostfully/send-message.ts` — The file that needs to be copied. 170 lines, zero external imports, uses native `fetch`.

  **Acceptance Criteria**:
  - [ ] `grep "send-message.ts" Dockerfile` returns a COPY line
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds
  - [ ] `docker run --rm ai-employee-worker:latest ls /tools/hostfully/send-message.ts` shows the file

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: send-message.ts is present in built Docker image
    Tool: Bash
    Preconditions: Dockerfile updated
    Steps:
      1. Run: docker build -t ai-employee-worker:latest .
      2. Run: docker run --rm ai-employee-worker:latest ls -la /tools/hostfully/send-message.ts
      3. Assert file exists and is non-empty
    Expected Result: File listed with size > 0 bytes
    Failure Indicators: "No such file or directory" or build failure
    Evidence: .sisyphus/evidence/task-2-dockerfile-build.txt

  Scenario: send-message.ts --help works inside container
    Tool: Bash
    Preconditions: Docker image built
    Steps:
      1. Run: docker run --rm ai-employee-worker:latest tsx /tools/hostfully/send-message.ts --help
      2. Assert output contains "--lead-id" and "--message"
    Expected Result: Help text printed with argument descriptions
    Failure Indicators: "Cannot find module" or "tsx: not found"
    Evidence: .sisyphus/evidence/task-2-send-message-help.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `fix(worker): add send-message.ts to Docker image and update delivery instructions`
  - Files: `Dockerfile`
  - Pre-commit: `grep send-message.ts Dockerfile`

---

- [x] 3. Update delivery_instructions with --thread-id in seed.ts

  **What to do**:
  - Open `prisma/seed.ts` and find the `delivery_instructions` for guest-messaging archetypes
  - There are TWO guest-messaging archetypes to update:
    - DozalDevs guest-messaging (ID `00000000-0000-0000-0000-000000000014`)
    - VLRE guest-messaging (ID `00000000-0000-0000-0000-000000000015`)
  - Update the `delivery_instructions` to include `--thread-id`:
    - Before: `tsx /tools/hostfully/send-message.ts --lead-id "<lead_uid from the original message thread>" --message "<draftResponse from the JSON>"`
    - After: `tsx /tools/hostfully/send-message.ts --lead-id "<leadUid field from the JSON>" --thread-id "<threadUid field from the JSON, if present>" --message "<draftResponse field from the JSON>"`
  - Fix the field name reference: change `lead_uid` to `leadUid` (matches the actual JSON field name in the deliverable)
  - Make `--thread-id` clearly optional in the instructions (the field may be absent for new conversations)

  **Must NOT do**:
  - Do NOT change delivery_instructions for daily-summarizer archetypes
  - Do NOT change `system_prompt` or `instructions` fields (those are for the execution phase)
  - Do NOT change the `tool_registry` field
  - Do NOT modify the Prisma schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text edits in a seed file following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:1244-1245` — Current VLRE guest-messaging `delivery_instructions`. This is the text to update.
  - `prisma/seed.ts:1273-1274` — Current DozalDevs guest-messaging `delivery_instructions`. Same update needed.

  **API/Type References**:
  - `src/worker-tools/hostfully/send-message.ts:parseArgs` — The `--lead-id`, `--thread-id`, `--message` flags the tool accepts. The delivery_instructions must match these flag names exactly.
  - The deliverable JSON schema (set in archetype `instructions` Step 5): `{ leadUid: string, threadUid?: string, draftResponse: string, classification: string, ... }` — field names the delivery_instructions must reference.

  **Acceptance Criteria**:
  - [ ] Both guest-messaging archetypes' `delivery_instructions` contain `--thread-id`
  - [ ] Both reference `leadUid` (not `lead_uid`) as the JSON field name
  - [ ] `--thread-id` is described as optional in the instructions
  - [ ] Summarizer archetypes are unchanged

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: delivery_instructions contain --thread-id after seed
    Tool: Bash
    Preconditions: seed.ts updated, DB seeded (Task 6)
    Steps:
      1. Run: pnpm prisma db seed
      2. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, delivery_instructions FROM archetypes WHERE slug = 'guest-messaging';"
      3. Assert both rows contain '--thread-id'
      4. Assert both rows contain 'leadUid' (not 'lead_uid')
    Expected Result: 2 rows returned, both containing --thread-id and leadUid
    Failure Indicators: 0 rows, or rows without --thread-id, or rows with 'lead_uid'
    Evidence: .sisyphus/evidence/task-3-seed-verification.txt

  Scenario: summarizer delivery_instructions unchanged
    Tool: Bash
    Preconditions: seed.ts updated, DB seeded
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, delivery_instructions FROM archetypes WHERE slug = 'daily-summarizer';"
      2. Assert results do NOT contain '--thread-id' or 'leadUid'
    Expected Result: Summarizer archetypes unchanged
    Failure Indicators: Summarizer archetypes modified
    Evidence: .sisyphus/evidence/task-3-summarizer-unchanged.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `fix(worker): add send-message.ts to Docker image and update delivery instructions`
  - Files: `prisma/seed.ts`
  - Pre-commit: `grep "thread-id" prisma/seed.ts`

---

- [x] 4. Fix Pre-existing Test Mocks (SlackClient.updateMessage)

  **What to do**:
  - The LSP reports pre-existing errors in test files where `SlackClient` mocks are missing the `updateMessage` method:
    - `tests/inngest/lifecycle.test.ts:29` — mock `{ postMessage: vi.fn() }` missing `updateMessage`
    - `tests/lib/call-llm.test.ts:59` — same issue
    - `tests/inngest/watchdog.test.ts:16` — same issue
  - Add `updateMessage: vi.fn()` to each mock that creates a partial `SlackClient`
  - These fixes are prerequisites for Task 1's tests to compile correctly, since they share mock patterns

  **Must NOT do**:
  - Do NOT change the actual `SlackClient` interface or implementation
  - Do NOT refactor test setup beyond adding the missing mock method
  - Do NOT fix the `knowledgeBaseEntry` errors in `seed.ts` (unrelated, pre-existing)
  - Do NOT fix the `tenantId` errors in `create-task-and-dispatch.test.ts` (unrelated, pre-existing)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding a single property to 3 mock objects
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 1
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — Shows the CORRECT mock pattern with `updateMessage: mockUpdateMessage` included. Copy this pattern.
  - `src/lib/slack-client.ts` — `SlackClient` type definition. Shows `updateMessage` is a required method.

  **API/Type References**:
  - `tests/inngest/lifecycle.test.ts:29` — Add `updateMessage: vi.fn()` to the mock
  - `tests/lib/call-llm.test.ts:59` — Add `updateMessage: vi.fn()` to the mock
  - `tests/inngest/watchdog.test.ts:16` — Add `updateMessage: vi.fn()` to the mock

  **Acceptance Criteria**:
  - [ ] No TypeScript errors in the 3 fixed test files (check via `lsp_diagnostics`)
  - [ ] `pnpm test -- --run tests/inngest/lifecycle.test.ts tests/lib/call-llm.test.ts tests/inngest/watchdog.test.ts` runs without compilation errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Fixed test files compile without SlackClient type errors
    Tool: Bash
    Preconditions: Mock fixes applied
    Steps:
      1. Run: npx tsc --noEmit 2>&1 | grep -c "updateMessage"
      2. Assert count is 0 (no remaining updateMessage type errors in these files)
    Expected Result: 0 updateMessage-related type errors in the fixed files
    Failure Indicators: Type errors still present
    Evidence: .sisyphus/evidence/task-4-mock-fixes.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `test(lifecycle): add TDD tests for guest delivery card updates`
  - Files: `tests/inngest/lifecycle.test.ts`, `tests/lib/call-llm.test.ts`, `tests/inngest/watchdog.test.ts`
  - Pre-commit: N/A

- [x] 5. Implement "Sent" and Error Card Updates in Lifecycle

  **What to do**:
  - Open `src/inngest/employee-lifecycle.ts` and find the `handle-approval-result` step (line ~351)
  - Find the retry loop (lines ~506-561) where `finalStatus` is determined after delivery machine polling
  - **After** the retry loop, add two card updates INSIDE the `handle-approval-result` step:

  **"Sent ✓" update (after delivery succeeds)**:

  ```
  After the retry loop breaks with finalStatus === 'Done':
  - If approvalMsgTs && targetChannel:
    - Call slackClient.updateMessage(targetChannel, approvalMsgTs, sentText, sentBlocks)
    - sentText: `✅ Sent to guest at ${new Date().toISOString()}`
    - sentBlocks: [{ type: 'section', text: { type: 'mrkdwn', text: sentText } }, { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] }]
    - Wrap in try/catch — non-fatal (log warning if update fails, don't throw)
  ```

  **Error update (after 3 retries exhausted)**:

  ```
  After retryCount >= 3 and task is patched to Failed:
  - If approvalMsgTs && targetChannel:
    - Call slackClient.updateMessage(targetChannel, approvalMsgTs, errorText, errorBlocks)
    - errorText: `❌ Failed to send response to guest after 3 attempts. Task \`${taskId}\` marked as failed.`
    - errorBlocks: [{ type: 'section', text: { type: 'mrkdwn', text: errorText } }, { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] }]
    - Wrap in try/catch — non-fatal
  ```

  - **CRITICAL**: Both updates must be INSIDE the existing `step.run('handle-approval-result', ...)` closure. Do NOT add new `step.run()` calls.
  - The "delivering now" update (existing, lines ~482-496) should remain unchanged.
  - Run tests after implementation: `pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts` should now PASS (GREEN phase)

  **Must NOT do**:
  - Do NOT add a new `step.run()` after `handle-approval-result`
  - Do NOT include message preview text in the "Sent" card (PII risk)
  - Do NOT add a "Retry" button to the error card
  - Do NOT modify the existing "delivering now" update
  - Do NOT touch the reject path
  - Do NOT change the delivery machine spawn or retry logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying a complex lifecycle function (~600 lines) with atomicity constraints. Needs careful placement within the step closure and thorough understanding of the retry loop flow.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (tests must exist first — TDD), Task 4 (mock fixes)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:482-496` — The existing "✅ Approved by @user — delivering now" card update. Follow this EXACT pattern for the "Sent" update: same `if (approvalMsgTs && targetChannel)` guard, same `slackClient.updateMessage()` call signature, same block structure with section + context.
  - `src/inngest/employee-lifecycle.ts:506-561` — The retry loop. `finalStatus` is set here. Your "Sent" update goes AFTER the loop when `finalStatus === 'Done'`. Your "error" update goes where the task is patched to `Failed` after `retryCount >= maxRetries`.
  - `src/inngest/employee-lifecycle.ts:597-610` — The reject card update pattern. Shows the same `slackClient.updateMessage` + try/catch non-fatal pattern.

  **API/Type References**:
  - `src/lib/slack-client.ts:updateMessage` — `(channel: string, ts: string, text: string, blocks: Block[]) => Promise<void>`. The method signature to match.

  **Test References**:
  - `tests/inngest/lifecycle-guest-delivery.test.ts` — The TDD tests from Task 1. These must PASS after this implementation (GREEN phase).

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts` → ALL PASS (GREEN phase)
  - [ ] `pnpm test -- --run` → 515+ passing, 0 new failures
  - [ ] No new `step.run()` calls added (verify: `grep -c "step.run" src/inngest/employee-lifecycle.ts` — count should not increase)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: TDD tests pass (GREEN phase)
    Tool: Bash
    Preconditions: lifecycle.ts updated, test file from Task 1 exists
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts 2>&1
      2. Assert: all 4+ tests pass
      3. Assert: 0 test failures
    Expected Result: 4+ tests pass, 0 failures
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-tdd-green-phase.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Preconditions: All implementation complete
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert: test count >= 515
      3. Assert: 0 new failures (pre-existing failures are known: container-boot, inngest-serve)
    Expected Result: 515+ passing, same failure count as before
    Failure Indicators: New test failures, reduced pass count
    Evidence: .sisyphus/evidence/task-5-full-suite.txt

  Scenario: No new step.run calls added
    Tool: Bash
    Preconditions: lifecycle.ts updated
    Steps:
      1. Run: grep -c "step.run" src/inngest/employee-lifecycle.ts
      2. Compare with pre-implementation count
    Expected Result: Count unchanged (no new step.run calls)
    Failure Indicators: Count increased
    Evidence: .sisyphus/evidence/task-5-step-run-count.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): add Sent and error Slack card updates after guest delivery`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts`

---

- [x] 6. Re-seed Database and Rebuild Docker Image

  **What to do**:
  - Run `pnpm prisma db seed` to update the guest-messaging archetypes' `delivery_instructions` in the database
  - Run `docker build -t ai-employee-worker:latest .` to rebuild the Docker image with `send-message.ts` included
  - Verify both succeeded:
    - Query DB: `delivery_instructions` contains `--thread-id`
    - Docker: `/tools/hostfully/send-message.ts` exists in container

  **Must NOT do**:
  - Do NOT run `prisma migrate` — no schema changes were made
  - Do NOT run `prisma db push` — use seed only
  - Do NOT modify any source files in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Operational commands only, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 2 + 3)
  - **Parallel Group**: Wave 2 (after Wave 1)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2 (Dockerfile), Task 3 (seed.ts)

  **References**:

  **External References**:
  - `prisma/seed.ts` — The seed file with updated delivery_instructions (from Task 3)
  - `Dockerfile` — The Dockerfile with send-message.ts COPY (from Task 2)

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` completes without error
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds
  - [ ] DB query confirms `--thread-id` in delivery_instructions
  - [ ] Docker container has `/tools/hostfully/send-message.ts`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Database seeded with updated delivery_instructions
    Tool: Bash
    Preconditions: seed.ts updated (Task 3)
    Steps:
      1. Run: pnpm prisma db seed 2>&1
      2. Assert: exit code 0
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT delivery_instructions FROM archetypes WHERE slug = 'guest-messaging' LIMIT 1;" 2>&1
      4. Assert: output contains '--thread-id'
    Expected Result: Seed succeeds, delivery_instructions updated
    Failure Indicators: Seed error, missing --thread-id
    Evidence: .sisyphus/evidence/task-6-seed-result.txt

  Scenario: Docker image contains send-message.ts
    Tool: Bash
    Preconditions: Dockerfile updated (Task 2)
    Steps:
      1. Run: docker build -t ai-employee-worker:latest . 2>&1 | tail -5
      2. Assert: build succeeds
      3. Run: docker run --rm ai-employee-worker:latest ls /tools/hostfully/send-message.ts
      4. Assert: file exists
    Expected Result: Build success, file present at /tools/hostfully/send-message.ts
    Failure Indicators: Build failure, file not found
    Evidence: .sisyphus/evidence/task-6-docker-build.txt
  ```

  **Commit**: NO (operational step — no code changes)

- [x] 7. E2E Verification Against Real Hostfully API

  **What to do**:
  - Ensure local services are running: `pnpm dev:start` (gateway + Inngest dev server)
  - Trigger the guest-messaging employee for VLRE tenant via admin API
  - Wait for task to reach `Reviewing` status (employee drafts response, posts Slack card)
  - Send manual approval event via Inngest dev server
  - Wait for task to reach `Done` status
  - Verify the message was sent to Hostfully by querying the test thread via `get-messages.ts`
  - Verify the Slack card was updated to "Sent ✓" status

  **Full E2E Steps**:

  ```bash
  # Step 1: Trigger guest messaging
  TASK_ID=$(curl -s -X POST \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    -H "Content-Type: application/json" \
    "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger" \
    -d '{}' | jq -r '.task_id')

  # Step 2: Poll for Reviewing status (max 5 min)
  # Poll every 10s: GET /admin/tenants/.../tasks/$TASK_ID → .status === "Reviewing"

  # Step 3: Approve via Inngest dev server
  curl -X POST "http://localhost:8288/e/local" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"employee/approval.received\",\"data\":{\"taskId\":\"$TASK_ID\",\"action\":\"approve\",\"userId\":\"U05V0CTJLF6\",\"userName\":\"Victor\"}}"

  # Step 4: Poll for Done status (max 10 min)

  # Step 5: Verify Hostfully message
  tsx src/worker-tools/hostfully/get-messages.ts --thread-id 2f18249a-9523-4acd-a512-20ff06d5c3fa
  # Check latest message: senderType === "AGENCY" and timestamp within last 15 min
  ```

  **Must NOT do**:
  - Do NOT send test messages to real guest reservations (use ONLY the VLRE test resources from AGENTS.md)
  - Do NOT modify any code — this is a verification-only task
  - Do NOT skip the Hostfully message verification (step 5) — this is the core E2E proof

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Long-running E2E requiring polling, multiple API calls, and judgment about success/failure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 8
  - **Blocked By**: Task 5 (lifecycle changes), Task 6 (DB seed + Docker rebuild)

  **References**:

  **External References**:
  - AGENTS.md § "Hostfully Testing" — Test thread UID: `2f18249a-9523-4acd-a512-20ff06d5c3fa`, Lead UID: `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`
  - AGENTS.md § "Admin API" — Trigger endpoint: `POST /admin/tenants/:tenantId/employees/:slug/trigger`
  - AGENTS.md § "Manual approval fallback" — curl command to fire approval event via Inngest dev server

  **Pattern References**:
  - `scripts/trigger-task.ts` — Shows the polling pattern for waiting on task status changes
  - `scripts/verify-e2e.ts` — Shows the 12-point verification pattern

  **Acceptance Criteria**:
  - [ ] Task transitions: Received → ... → Reviewing → Approved → Delivering → Done
  - [ ] Hostfully test thread contains a new AGENCY message with recent timestamp
  - [ ] Task final status is `Done` (not `Failed`)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full E2E — trigger → approve → message in Hostfully
    Tool: Bash
    Preconditions: Services running (pnpm dev:start), DB seeded (Task 6), Docker rebuilt (Task 6)
    Steps:
      1. Trigger: curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger" -d '{}'
      2. Capture TASK_ID from response
      3. Poll task status every 10s until "Reviewing" (max 5 min, timeout = failure)
      4. Approve: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U05V0CTJLF6","userName":"Victor"}}'
      5. Poll task status every 15s until "Done" or "Failed" (max 10 min)
      6. Assert final status === "Done"
      7. Verify: HOSTFULLY_API_KEY=<from env> tsx src/worker-tools/hostfully/get-messages.ts --thread-id 2f18249a-9523-4acd-a512-20ff06d5c3fa 2>/dev/null | jq '.messages | map(select(.senderType == "AGENCY")) | sort_by(.createdAt) | last'
      8. Assert: latest AGENCY message timestamp within last 15 minutes
    Expected Result: Task Done, AGENCY message in Hostfully thread with recent timestamp
    Failure Indicators: Task Failed, no AGENCY message, message timestamp too old
    Evidence: .sisyphus/evidence/task-7-e2e-full.txt

  Scenario: Task status transitions are correct
    Tool: Bash
    Preconditions: E2E task completed
    Steps:
      1. Query task audit log: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status, created_at FROM task_status_logs WHERE task_id = '<TASK_ID>' ORDER BY created_at;"
      2. Assert transitions include: Reviewing → Approved → Delivering → Done
    Expected Result: All expected status transitions present in order
    Failure Indicators: Missing transitions, unexpected status, stuck at a state
    Evidence: .sisyphus/evidence/task-7-status-transitions.txt
  ```

  **Commit**: NO (verification only — no code changes)

---

- [x] 8. Mark GM-06 Complete in Story Map + Send Notification

  **What to do**:
  - Open `docs/2026-04-21-2202-phase1-story-map.md`
  - Find GM-06 acceptance criteria (line ~675-680)
  - Change all `- [ ]` to `- [x]` for the 6 acceptance criteria items
  - Note: The first AC says `send-message.js` — update to `send-message.ts` (tsx runtime, not compiled JS)
  - Send Telegram notification that GM-06 is complete

  **Must NOT do**:
  - Do NOT modify any other story's acceptance criteria
  - Do NOT change the story description, attributes, or porting notes
  - Do NOT mark any criteria `[x]` that wasn't verified in Task 7

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple markdown checkbox updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7 (E2E must pass first)

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:675-680` — The 6 GM-06 acceptance criteria lines to update

  **Acceptance Criteria**:
  - [ ] All 6 GM-06 acceptance criteria marked `[x]`
  - [ ] `send-message.js` reference corrected to `send-message.ts`
  - [ ] No other stories modified
  - [ ] Telegram notification sent

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: GM-06 acceptance criteria all checked
    Tool: Bash
    Preconditions: Story map updated
    Steps:
      1. Run: grep -A 10 "GM-06" docs/2026-04-21-2202-phase1-story-map.md | grep -c "\[x\]"
      2. Assert: count >= 5 (the 6 ACs, some may be on adjacent lines)
    Expected Result: 5+ lines with [x] in GM-06 section
    Failure Indicators: Any [  ] remaining, or count < 5
    Evidence: .sisyphus/evidence/task-8-story-map.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: All tasks complete
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "📋 Plan gm06-send-approved-response complete — all tasks done. Come back to review results."
      2. Assert: exit code 0
    Expected Result: Notification sent successfully
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-8-telegram.txt
  ```

  **Commit**: YES
  - Message: `docs(story-map): mark GM-06 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: N/A

---

- [x] 9. Notify Completion

  **What to do**:
  - Send Telegram notification: plan `gm06-send-approved-response` complete, all tasks done, come back to review results.
  - Run: `tsx scripts/telegram-notify.ts "✅ gm06-send-approved-response complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: All tasks + F1-F4

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task(s) | Commit Message                                                                      | Files                                                            | Pre-commit                                                                                        |
| ------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 4, 1          | `test(lifecycle): add TDD tests for guest delivery card updates`                    | `tests/inngest/lifecycle-guest-delivery.test.ts`, any mock fixes | `pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts` (expect failures — RED phase) |
| 2, 3          | `fix(worker): add send-message.ts to Docker image and update delivery instructions` | `Dockerfile`, `prisma/seed.ts`                                   | `grep send-message.ts Dockerfile`                                                                 |
| 5             | `feat(lifecycle): add Sent and error Slack card updates after guest delivery`       | `src/inngest/employee-lifecycle.ts`                              | `pnpm test -- --run tests/inngest/lifecycle-guest-delivery.test.ts` (expect PASS — GREEN phase)   |
| 6             | — (no commit, operational step)                                                     | —                                                                | —                                                                                                 |
| 7             | — (no commit, verification step)                                                    | —                                                                | —                                                                                                 |
| 8             | `docs(story-map): mark GM-06 acceptance criteria complete`                          | `docs/2026-04-21-2202-phase1-story-map.md`                       | —                                                                                                 |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                          # Expected: 515+ passing, 0 new failures
docker build -t ai-employee-worker:latest . # Expected: success
docker run --rm ai-employee-worker:latest ls /tools/hostfully/send-message.ts  # Expected: file listed
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT delivery_instructions FROM archetypes WHERE slug = 'guest-messaging' AND delivery_instructions LIKE '%--thread-id%';"  # Expected: rows returned
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] E2E: message appears in Hostfully inbox after Slack approval
- [ ] GM-06 acceptance criteria marked `[x]` in story map
