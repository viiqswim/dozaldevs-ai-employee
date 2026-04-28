# GM-05: Slack Approval Card for Guest Messages

## TL;DR

> **Quick Summary**: Build a rich Slack Block Kit approval card that shows PMs all guest messaging context (guest name, property, dates, booking channel, original message, AI-drafted response, confidence, category) with Approve, Edit & Send, and Reject buttons — plus full modal infrastructure for editing drafts and capturing rejection reasons.
>
> **Deliverables**:
>
> - New shell tool `src/worker-tools/slack/post-guest-approval.ts` with `--dry-run` flag
> - Extended `ClassifyResult` type with 9 guest context fields + backward-compatible parser
> - 3 new Bolt action handlers (`guest_approve`, `guest_edit`, `guest_reject`)
> - 2 new Bolt view handlers (`guest_edit_modal`, `guest_reject_modal`) — first modals in the platform
> - Lifecycle updates: `editedContent` patching + `rejectionReason` storage
> - Updated VLRE guest messaging archetype instructions
> - Comprehensive Vitest tests + E2E verification
> - GM-05 marked complete in story map
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1/2 → Task 5/6/7 → Task 9/10 → Task 12

---

## Context

### Original Request

Implement GM-05 from the Phase 1 story map: a rich Slack approval card for guest messages with Approve, Edit & Send, and Reject flows. Include thorough automated tests and API endpoint verification. Mark GM-05 done in the story map after implementation.

### Interview Summary

**Key Discussions**:

- **GM-04 data contract**: Include ClassifyResult type extension + archetype instruction updates in this plan — GM-05 can't render the card without guest context fields that GM-04 currently doesn't serialize
- **Edit & Send**: Full Slack modal implementation (first `boltApp.view()` handler in the platform). Port block layout from standalone MVP at `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/blocks.ts`
- **Architecture**: One task = one message (not batch). Clean lifecycle alignment. Trigger/webhook spawns N tasks for N messages
- **Reject flow**: Modal with optional reason text input. Low marginal cost since Edit modal infra is being built anyway. Stores in `tasks.metadata` for future learning engine
- **Test strategy**: Vitest tests-after + Agent-Executed QA scenarios

**Research Findings**:

- Existing approval flow: `post-message.ts` → `/tmp/approval-message.json` → harness → `deliverable.metadata` → lifecycle `waitForEvent` → `handle-approval-result`
- Standalone MVP has proven `buildApprovalBlocks()` for guest cards at `vlre-employee/skills/slack-blocks/blocks.ts` with `ApprovalMessageParams` interface
- Standalone MVP has `buildEditModal()` for the Edit & Send flow at `vlre-employee/skills/slack-bot/approval-handlers.ts`
- Button value JSON carries context (max 2000 chars Slack limit) — Edit button carries `{taskId, draftResponse}`, Approve/Reject carry just `taskId`
- Action IDs are bare lowercase verbs (`'approve'`, `'reject'`) — new guest IDs use `guest_` prefix to avoid collision
- Zero modal/view handlers exist today — this is greenfield modal infrastructure
- `SlackClient` interface has `postMessage` + `updateMessage` only — modals use Bolt's `client` object directly
- `handle-approval-result` has zero test coverage

### Metis Review

**Identified Gaps** (addressed):

- **Button value strategy**: Resolved — Edit button carries `{taskId, draftResponse}` in value JSON to avoid async fetch before `views.open` (trigger_id 3s expiry). Approve/Reject carry `taskId` only.
- **`views:open` OAuth scope**: Added as validation task (Task 3) — must confirm Slack app has this scope before modal code works
- **leadUid threading**: Added to ClassifyResult extension — load-bearing for GM-06 delivery
- **originalMessage field**: Added to ClassifyResult — needed for card display but not currently serialized
- **Reject reason storage**: `tasks.metadata` (operational metadata), NOT `feedback` table — avoids polluting feedback-summarizer digest
- **Action ID collision**: New IDs use `guest_` prefix: `guest_approve`, `guest_edit`, `guest_reject`
- **Empty edit submission**: Edit modal textarea marked `required: true` with Slack-side validation
- **trigger_id expiry**: Edit button carries draftResponse in value, so no async fetch needed before `views.open`
- **Backward compatibility**: `editedContent` and `rejectionReason` are optional fields on approval event — summarizer events unaffected

---

## Work Objectives

### Core Objective

Build a rich Slack Block Kit approval card for guest messaging with three interactive flows (approve, edit+send, reject), extend the data contract to carry guest context end-to-end, and verify everything with automated tests and E2E.

### Concrete Deliverables

- `src/worker-tools/slack/post-guest-approval.ts` — new shell tool
- Extended `ClassifyResult` in `src/lib/classify-message.ts`
- New handlers + view handlers in `src/gateway/slack/handlers.ts`
- Lifecycle changes in `src/inngest/employee-lifecycle.ts`
- Updated archetype instructions in `prisma/seed.ts`
- Test files: `tests/worker-tools/slack/post-guest-approval.test.ts`, extended `tests/lib/classify-message.test.ts`, new `tests/gateway/slack/guest-handlers.test.ts`
- GM-05 checkbox marked in `docs/2026-04-21-2202-phase1-story-map.md`

### Definition of Done

- [ ] `pnpm test -- --run` passes (all existing + new tests)
- [ ] `pnpm build` compiles clean
- [ ] `pnpm lint` passes
- [ ] Dry-run of shell tool outputs valid Block Kit JSON with all required fields
- [ ] Guest approval card posts to Slack with correct layout
- [ ] Approve/Edit/Reject buttons all fire correct Inngest events
- [ ] Edit modal pre-fills with draft, submit patches deliverable
- [ ] Reject modal captures optional reason, stores in task metadata
- [ ] Summarizer approval flow still works (regression check)
- [ ] GM-05 marked done in story map

### Must Have

- All 7 fields displayed in card: guest name, property name, check-in/out dates, booking channel, original message, draft response, confidence score + category tag
- Three action buttons: Approve, Edit & Send, Reject
- Task ID context block (per AGENTS.md Slack standards)
- `--dry-run` flag on shell tool for testing without Slack API
- Backward-compatible `ClassifyResult` (existing 25 test cases must pass unchanged)
- `editedContent` and `rejectionReason` as optional fields on `employee/approval.received` event
- Summarizer approval flow unbroken after changes

### Must NOT Have (Guardrails)

- DO NOT modify `buildApprovalBlocks()` in `src/worker-tools/slack/post-message.ts`
- DO NOT change existing `approve` and `reject` action IDs in handlers
- DO NOT change existing `ClassifyResult` field names or types — additive extension only
- DO NOT add `openModal` to `SlackClient` interface — use Bolt's `client` object directly in handlers
- DO NOT add tests for existing untested summarizer approval paths — only test new guest paths
- DO NOT implement GM-06 delivery logic (Hostfully send-message) — that's a separate story
- DO NOT add category dropdowns, severity ratings, or teaching notes to reject modal — one plain text input only
- DO NOT add fields beyond draft response textarea to edit modal — no category override, no confidence override
- DO NOT register handlers outside `registerSlackHandlers()` in `handlers.ts`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (new infrastructure)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run with `--dry-run`, pipe through `jq`, assert JSON structure
- **Handlers**: Use Bash (curl to Inngest dev server) — fire events, check task status via PostgREST
- **Lifecycle**: Use Bash (curl to admin API) — trigger employee, verify DB state
- **Modals**: Use Bash (curl to Slack API) — verify OAuth scopes; functional modal testing via E2E trigger

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, all parallel):
├── Task 1: Extend ClassifyResult type + parser [quick]
├── Task 2: Create post-guest-approval.ts shell tool [unspecified-high]
├── Task 3: Validate Slack OAuth scopes for views:open [quick]

Wave 2 (After Wave 1 — event schema + handlers, all parallel):
├── Task 4: Extend employee/approval.received event schema [quick]
├── Task 5: Add guest_approve Bolt action handler [quick]
├── Task 6: Add guest_edit action handler + edit modal view handler [deep]
├── Task 7: Add guest_reject action handler + reject modal view handler [deep]

Wave 3 (After Wave 2 — lifecycle + instructions + tests):
├── Task 8: Wire editedContent and rejectionReason in lifecycle [deep]
├── Task 9: Update archetype instructions for enriched JSON + new tool [unspecified-high]
├── Task 10: Vitest tests for shell tool, handlers, and ClassifyResult [unspecified-high]

Wave 4 (After Wave 3 — verification + cleanup):
├── Task 11: E2E verification via admin API trigger [unspecified-high]
├── Task 12: Summarizer regression check [quick]
├── Task 13: Mark GM-05 done in story map [quick]
├── Task 14: Send Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On       | Blocks             | Wave |
| ---- | ---------------- | ------------------ | ---- |
| 1    | —                | 4, 5, 6, 7, 9, 10  | 1    |
| 2    | —                | 5, 6, 7, 9, 10, 11 | 1    |
| 3    | —                | 6, 7               | 1    |
| 4    | 1                | 5, 6, 7, 8         | 2    |
| 5    | 1, 2, 4          | 8, 10, 11          | 2    |
| 6    | 1, 2, 3, 4       | 8, 10, 11          | 2    |
| 7    | 1, 2, 3, 4       | 8, 10, 11          | 2    |
| 8    | 4, 5, 6, 7       | 10, 11             | 3    |
| 9    | 1, 2             | 10, 11             | 3    |
| 10   | 1, 2, 5, 6, 7, 8 | 11                 | 3    |
| 11   | 8, 9, 10         | 12                 | 4    |
| 12   | 11               | 13                 | 4    |
| 13   | 12               | 14                 | 4    |
| 14   | 13               | —                  | 4    |

**Critical Path**: Task 1 → Task 4 → Task 6 → Task 8 → Task 10 → Task 11 → Task 12 → F1-F4 → user okay

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`
- **Wave 2**: **4 tasks** — T4 → `quick`, T5 → `quick`, T6 → `deep`, T7 → `deep`
- **Wave 3**: **3 tasks** — T8 → `deep`, T9 → `unspecified-high`, T10 → `unspecified-high`
- **Wave 4**: **4 tasks** — T11 → `unspecified-high`, T12 → `quick`, T13 → `quick`, T14 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Extend ClassifyResult with guest context fields

  **What to do**:
  - Add 9 new optional fields to `ClassifyResult` interface in `src/lib/classify-message.ts`:
    - `guestName?: string` — guest's full name from Hostfully reservation
    - `propertyName?: string` — property name from Hostfully
    - `checkIn?: string` — check-in date (YYYY-MM-DD)
    - `checkOut?: string` — check-out date (YYYY-MM-DD)
    - `bookingChannel?: string` — "AIRBNB" | "VRBO" | "BOOKING_COM" | "DIRECT" etc.
    - `originalMessage?: string` — the raw guest message text being responded to
    - `leadUid?: string` — Hostfully lead UUID (load-bearing for GM-06 delivery: `send-message.ts --lead-id`)
    - `threadUid?: string` — Hostfully thread UUID for message context
    - `messageUid?: string` — specific message UUID being responded to
  - All new fields are **optional** (`?`) to maintain backward compatibility — existing summarizer ClassifyResult JSON without these fields must still parse correctly
  - Update `parseClassifyResponse()` to extract these fields from JSON (if present)
  - Run existing 25-case test suite to confirm zero regressions: `pnpm test -- --run tests/lib/classify-message.test.ts`
  - Add new test cases for parsing JSON with guest context fields present and absent

  **Must NOT do**:
  - DO NOT rename or change types of existing 8 ClassifyResult fields
  - DO NOT make new fields required — they must be optional
  - DO NOT modify test fixtures for existing 25 test cases

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file type extension + parser update, straightforward additive change
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — simple type extension

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 9, 10
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/classify-message.ts` — `ClassifyResult` interface definition and `parseClassifyResponse()` function. This is the ONLY file to modify. Study the existing field types and parsing pattern.

  **API/Type References**:
  - `src/worker-tools/hostfully/get-messages.ts` — `ThreadSummary` type has `guestName`, `channel`, `reservationId`. These are the source fields the agent will serialize.
  - `src/worker-tools/hostfully/get-reservations.ts` — `ReservationSummary` type has `guestName`, `checkIn`, `checkOut`, `channel`, `uid`. Cross-reference for field naming.

  **Test References**:
  - `tests/lib/classify-message.test.ts` — All 25 existing test cases. Study the fixture format. Add new cases following the same pattern. Run with `pnpm test -- --run tests/lib/classify-message.test.ts`.

  **External References**:
  - None needed

  **WHY Each Reference Matters**:
  - `classify-message.ts` is the single source of truth for the type and parser — the executor should read the entire file to understand the parsing logic before extending it
  - The Hostfully types show the exact field names from the source data — naming should be consistent
  - The test file shows the fixture format so new test cases follow the same pattern

  **Acceptance Criteria**:
  - [ ] `ClassifyResult` interface has 9 new optional fields (guestName, propertyName, checkIn, checkOut, bookingChannel, originalMessage, leadUid, threadUid, messageUid)
  - [ ] `parseClassifyResponse()` extracts new fields when present in JSON
  - [ ] `parseClassifyResponse()` returns `undefined` for new fields when absent (backward compat)
  - [ ] `pnpm test -- --run tests/lib/classify-message.test.ts` — all 25 existing cases pass + new cases pass

  **QA Scenarios:**

  ```
  Scenario: Parse enriched ClassifyResult JSON with all guest fields
    Tool: Bash
    Preconditions: classify-message.ts updated with new fields
    Steps:
      1. Run: pnpm test -- --run tests/lib/classify-message.test.ts
      2. Verify output contains "Tests: X passed" with X >= 25
      3. Verify output contains 0 failures
    Expected Result: All existing + new test cases pass
    Failure Indicators: Any test failure, or existing test count decreased
    Evidence: .sisyphus/evidence/task-1-classify-result-tests.txt

  Scenario: Backward compatibility — parse JSON without guest fields
    Tool: Bash
    Preconditions: New test case added that parses a JSON string with only the original 8 fields
    Steps:
      1. Run: pnpm test -- --run tests/lib/classify-message.test.ts
      2. Grep output for the specific backward-compat test name
      3. Verify it passes
    Expected Result: Parsing a JSON without guest fields succeeds, new fields are undefined
    Failure Indicators: Test failure or TypeError on missing fields
    Evidence: .sisyphus/evidence/task-1-backward-compat.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-classify-result-tests.txt — full test output
  - [ ] task-1-backward-compat.txt — backward compatibility test output

  **Commit**: YES
  - Message: `feat(types): extend ClassifyResult with guest context fields`
  - Files: `src/lib/classify-message.ts`, `tests/lib/classify-message.test.ts`
  - Pre-commit: `pnpm test -- --run tests/lib/classify-message.test.ts`

- [x] 2. Create post-guest-approval.ts shell tool

  **What to do**:
  - Create `src/worker-tools/slack/post-guest-approval.ts` — a new shell tool that builds and posts a rich guest messaging approval card to Slack
  - Implement `buildGuestApprovalBlocks(params)` function that produces a Block Kit block array:
    1. **Header block**: `:rotating_light: Guest Message — {propertyName}` (or `:warning:` if urgent)
    2. **Section block**: Guest info fields — `*Guest:* {guestName}`, `*Property:* {propertyName}`, `*Check-in:* {checkIn}`, `*Check-out:* {checkOut}`, `*Channel:* {bookingChannel}`
    3. **Divider**
    4. **Section block**: `*Original Message:*\n>{originalMessage}` (blockquote format)
    5. **Section block**: `*Proposed Response:*\n{draftResponse}`
    6. **Section block**: `*Confidence:* {confidence}% | *Category:* {category}` (with urgency indicator if urgent)
    7. **Divider**
    8. **Actions block**: Three buttons:
       - `action_id: 'guest_approve'`, value: `taskId`, style: `primary`, text: `Approve & Send`
       - `action_id: 'guest_edit'`, value: `JSON.stringify({taskId, draftResponse})`, text: `Edit & Send`
       - `action_id: 'guest_reject'`, value: `taskId`, style: `danger`, text: `Reject`
    9. **Context block**: `Task \`{taskId}\`` (platform standard per AGENTS.md)
  - Implement CLI with args: `--channel`, `--task-id`, `--guest-name`, `--property-name`, `--check-in`, `--check-out`, `--booking-channel`, `--original-message`, `--draft-response`, `--confidence`, `--category`, `--urgency`, `--lead-uid`, `--thread-uid`, `--message-uid`, `--conversation-summary` (optional)
  - Implement `--dry-run` flag: outputs JSON `{ blocks: [...] }` to stdout without calling Slack API
  - Without `--dry-run`: posts to Slack via `WebClient.chat.postMessage()` and outputs `{ ts, channel }` to stdout (same contract as `post-message.ts`)
  - Handle `draftResponse` truncation in Edit button value: if `JSON.stringify({taskId, draftResponse})` exceeds 1900 chars, truncate `draftResponse` and append "..." (Slack's 2000-char button value limit)
  - Port block layout from standalone MVP reference — adapt to shell tool CLI pattern

  **Must NOT do**:
  - DO NOT modify `src/worker-tools/slack/post-message.ts`
  - DO NOT modify `buildApprovalBlocks()` in post-message.ts
  - DO NOT use any action IDs that conflict with existing `approve`/`reject`
  - DO NOT add Block Kit type imports beyond `@slack/web-api`'s existing types

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New file creation with complex Block Kit structure, CLI arg parsing, Slack API integration, and edge case handling (truncation, dry-run)
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — this is a CLI tool, not UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 6, 7, 9, 10, 11
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-message.ts` — The existing shell tool pattern. Copy the CLI arg parsing structure (process.argv parsing), WebClient initialization (`new WebClient(process.env.SLACK_BOT_TOKEN)`), error handling, and stdout output format (`JSON.stringify({ ts, channel })`). DO NOT modify this file, only reference it for patterns.
  - `src/worker-tools/slack/post-message.ts:40-76` — `buildApprovalBlocks()` function. Reference for the block array structure pattern (header → section → divider → context → actions). Do NOT modify.

  **API/Type References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/blocks.ts` — Standalone MVP's `buildApprovalBlocks()` for guest cards. This is the PROVEN block layout to port. Study the `ApprovalMessageParams` interface and the full block structure. This file is in a DIFFERENT repo — read it for reference only.
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/approval-handlers.ts` — Shows how button values carry JSON context. Reference for the `{taskId, draftResponse}` value strategy on the Edit button.

  **Test References**:
  - No existing test for post-message.ts to reference. Create `tests/worker-tools/slack/post-guest-approval.test.ts` following the project's Vitest patterns.

  **External References**:
  - Slack Block Kit Builder: https://app.slack.com/block-kit-builder — use to validate block JSON
  - `@slack/web-api` WebClient.chat.postMessage: https://api.slack.com/methods/chat.postMessage

  **WHY Each Reference Matters**:
  - `post-message.ts` is the canonical shell tool pattern — CLI structure, WebClient init, output contract must be identical
  - The standalone MVP's `blocks.ts` has the proven card layout that PMs have already validated — porting saves design iteration
  - The standalone MVP's handlers show the button value JSON strategy that works in production

  **Acceptance Criteria**:
  - [ ] File exists: `src/worker-tools/slack/post-guest-approval.ts`
  - [ ] `--dry-run` outputs valid JSON with `blocks` array containing >= 8 blocks
  - [ ] Dry-run output contains all 3 button action IDs: `guest_approve`, `guest_edit`, `guest_reject`
  - [ ] Dry-run output contains task ID context block with correct taskId
  - [ ] Dry-run output contains all display fields: guest name, property name, dates, booking channel, original message, draft response, confidence, category
  - [ ] Without `--dry-run`, outputs `{ ts, channel }` JSON (same contract as post-message.ts)
  - [ ] Edit button value is valid JSON containing taskId and draftResponse
  - [ ] Edit button value does not exceed 2000 characters (truncation works)
  - [ ] `pnpm build` compiles the new file without errors

  **QA Scenarios:**

  ```
  Scenario: Dry-run outputs valid Block Kit JSON
    Tool: Bash
    Preconditions: post-guest-approval.ts created
    Steps:
      1. Run: bun run src/worker-tools/slack/post-guest-approval.ts --dry-run --channel "C123" --task-id "test-uuid-123" --guest-name "John Doe" --property-name "3505 Bandera" --check-in "2026-05-01" --check-out "2026-05-05" --booking-channel "AIRBNB" --original-message "What time is check-in?" --draft-response "Check-in is at 3pm, checkout is at 11am." --confidence 0.92 --category "access" --urgency false --lead-uid "lead-abc" --thread-uid "thread-def" --message-uid "msg-ghi"
      2. Pipe output through: | jq '.blocks | length'
      3. Assert output >= 8
      4. Pipe through: | jq '[.blocks[] | select(.type=="actions") | .elements[].action_id]'
      5. Assert output contains ["guest_approve", "guest_edit", "guest_reject"]
      6. Pipe through: | jq '.blocks[] | select(.type=="context") | .elements[0].text'
      7. Assert output contains "test-uuid-123"
    Expected Result: Valid JSON, >= 8 blocks, 3 correct action IDs, task ID present
    Failure Indicators: jq parse error, missing blocks, wrong action IDs
    Evidence: .sisyphus/evidence/task-2-dry-run-output.json

  Scenario: Edit button value handles long draft responses
    Tool: Bash
    Preconditions: post-guest-approval.ts created
    Steps:
      1. Generate a 2000-char draft response string
      2. Run with --dry-run and the long --draft-response
      3. Extract the guest_edit button value: | jq '.blocks[] | select(.type=="actions") | .elements[] | select(.action_id=="guest_edit") | .value'
      4. Assert the value string length <= 2000
      5. Assert the value is valid JSON containing taskId
    Expected Result: Button value truncated to <= 2000 chars, still valid JSON
    Failure Indicators: Value exceeds 2000 chars, or not valid JSON after truncation
    Evidence: .sisyphus/evidence/task-2-truncation-test.txt

  Scenario: Missing required args produce clear error
    Tool: Bash
    Preconditions: post-guest-approval.ts created
    Steps:
      1. Run: bun run src/worker-tools/slack/post-guest-approval.ts --dry-run --channel "C123"
      2. Assert exit code is non-zero
      3. Assert stderr contains meaningful error about missing arguments
    Expected Result: Clear error message, non-zero exit
    Failure Indicators: Silent failure, zero exit code, or cryptic error
    Evidence: .sisyphus/evidence/task-2-missing-args-error.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-dry-run-output.json — full dry-run JSON output
  - [ ] task-2-truncation-test.txt — long draft response truncation test
  - [ ] task-2-missing-args-error.txt — missing args error output

  **Commit**: YES
  - Message: `feat(tools): add post-guest-approval.ts shell tool with dry-run`
  - Files: `src/worker-tools/slack/post-guest-approval.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Validate Slack app OAuth scopes for views:open

  **What to do**:
  - Check whether the current Slack app manifest includes the OAuth scopes needed for `views.open` (modal opening). The required scope is typically part of the bot token scopes.
  - Run: `curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" https://slack.com/api/auth.test` to verify the bot token works
  - Run: `curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" https://slack.com/api/team.info` to verify API access
  - Test `views.open` capability by checking Slack app configuration — the Interactivity toggle must be ON (Socket Mode handles this automatically)
  - If `views.open` is NOT available (missing scope error), document what scope is needed and how to add it. This would be a **blocker** for Tasks 6 and 7.
  - Create a brief validation report in `.sisyphus/evidence/task-3-slack-scope-validation.txt`

  **Must NOT do**:
  - DO NOT modify any Slack app settings — only verify and report
  - DO NOT store Slack tokens in any file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: API calls + documentation, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 6, 7 (modal tasks depend on scope being available)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts:68-83` — Bolt initialization with Socket Mode. Shows how the app is configured. Socket Mode apps handle interactivity via WebSocket, so no Request URL is needed.
  - `src/gateway/slack/installation-store.ts` — `TenantInstallationStore` fetches per-tenant bot tokens. The scope check should use the VLRE tenant's token.

  **External References**:
  - Slack `views.open` docs: https://api.slack.com/methods/views.open — lists required scopes
  - Slack Bolt modals guide: https://slack.dev/bolt-js/concepts/creating-modals

  **WHY Each Reference Matters**:
  - `server.ts` confirms Socket Mode is active — this means interactivity works via WebSocket, not HTTP endpoints
  - The installation store shows where tokens come from — we need to test with the correct tenant token

  **Acceptance Criteria**:
  - [ ] `curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" https://slack.com/api/auth.test | jq '.ok'` returns `true`
  - [ ] Validation report saved to `.sisyphus/evidence/task-3-slack-scope-validation.txt`
  - [ ] Report states whether `views.open` is available or blocked
  - [ ] If blocked: report documents exact scope needed and steps to add it

  **QA Scenarios:**

  ```
  Scenario: Verify Slack bot token is valid and scopes are sufficient
    Tool: Bash
    Preconditions: .env loaded with SLACK_BOT_TOKEN
    Steps:
      1. Run: source .env && curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" https://slack.com/api/auth.test | jq '.'
      2. Assert .ok == true
      3. Check response for scope information
      4. Document findings in evidence file
    Expected Result: Token valid, scopes documented, views.open availability confirmed
    Failure Indicators: .ok == false, or missing required scopes
    Evidence: .sisyphus/evidence/task-3-slack-scope-validation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-slack-scope-validation.txt — scope validation report

  **Commit**: NO (no code changes)

- [x] 4. Extend employee/approval.received event with optional fields

  **What to do**:
  - Find all places where `employee/approval.received` event is typed, sent, or consumed
  - Use `lsp_find_references` on the event name string and `ast_grep_search` for `employee/approval.received` to find all 3+ send sites
  - Add optional fields to the event data type:
    - `editedContent?: string` — the PM's edited draft text (from Edit & Send modal)
    - `rejectionReason?: string` — optional rejection reason text (from Reject modal)
  - These fields must be OPTIONAL — existing summarizer approve/reject events do not include them
  - If the event types are defined inline (not in a separate type file), add the optional fields at each definition site
  - Verify: the lifecycle's `waitForEvent` match on `data.taskId` still works with the new optional fields

  **Must NOT do**:
  - DO NOT change existing event fields (taskId, action, userId, userName)
  - DO NOT make editedContent or rejectionReason required
  - DO NOT modify the Inngest event dedup ID pattern (`employee-approval-{taskId}`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small additive type change across a few sites
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 5, 6, 7, 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:229` — `inngest.send({ name: 'employee/approval.received', data: { taskId, action: 'approve', userId, userName }, id: ... })` — this is one of the send sites. The new fields are NOT added here (summarizer stays as-is). New guest handlers will include the new fields.
  - `src/inngest/employee-lifecycle.ts:344` — `step.waitForEvent('wait-for-approval', { event: 'employee/approval.received', match: 'data.taskId', ... })` — the consumer. Must remain compatible.

  **API/Type References**:
  - Check for any Inngest event type definitions in `src/gateway/inngest/` or a shared types file. The event schema may be defined via Inngest's `EventSchemas` type.

  **WHY Each Reference Matters**:
  - The handlers send the event — we need to confirm the new fields don't break existing sends
  - The lifecycle consumes the event — we need to confirm `waitForEvent` match still works

  **Acceptance Criteria**:
  - [ ] `editedContent` and `rejectionReason` are optional string fields on the approval event data
  - [ ] Existing summarizer approve/reject handler code compiles unchanged
  - [ ] `pnpm build` succeeds
  - [ ] Lifecycle `waitForEvent` match on `data.taskId` still works (no type errors)

  **QA Scenarios:**

  ```
  Scenario: Build succeeds with extended event types
    Tool: Bash
    Preconditions: Event types updated
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Run: pnpm lint
      4. Assert exit code 0
    Expected Result: Clean build and lint
    Failure Indicators: Type errors in existing handler code or lifecycle
    Evidence: .sisyphus/evidence/task-4-build-output.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-build-output.txt — build + lint output

  **Commit**: YES (groups with Task 5)
  - Message: `feat(events): extend approval event with editedContent and rejectionReason`
  - Files: Event type definition files
  - Pre-commit: `pnpm build`

- [x] 5. Add guest_approve Bolt action handler

  **What to do**:
  - Add `boltApp.action('guest_approve', async ({ ack, body, respond }) => { ... })` inside `registerSlackHandlers()` in `src/gateway/slack/handlers.ts`
  - Follow the EXACT same pattern as the existing `approve` handler (lines 176-251):
    1. Extract `taskId` from `actionBody.actions[0].value` (plain string, not JSON)
    2. Immediate ack with inline replace: `(ack as any)({ replace_original: true, blocks: [...processing state...] })` — "Processing approval..." state
    3. Idempotency check: `isTaskAwaitingApproval(taskId)` via PostgREST
    4. If already processed: `respond()` with "already processed" message
    5. If awaiting: `inngest.send({ name: 'employee/approval.received', data: { taskId, action: 'approve', userId, userName }, id: \`employee-approval-${taskId}\` })`
    6. On error: `respond()` with error message + restore buttons using a `GUEST_BUTTON_BLOCKS(taskId)` helper
  - Create `GUEST_BUTTON_BLOCKS(taskId)` helper (similar to existing `BUTTON_BLOCKS`) that restores the three guest messaging buttons for error recovery
  - The handler is functionally identical to the existing `approve` handler — same event, same idempotency, same dedup. The only difference is the `action_id` being `guest_approve` instead of `approve`.

  **Must NOT do**:
  - DO NOT modify the existing `approve` handler
  - DO NOT change the `isTaskAwaitingApproval()` function
  - DO NOT add new event names — reuse `employee/approval.received`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Near-copy of existing handler with different action_id
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Tasks 8, 10, 11
  - **Blocked By**: Tasks 1, 2, 4

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:176-251` — Existing `approve` handler. Copy this pattern EXACTLY. Pay attention to: the ack envelope pattern, idempotency check, error recovery with BUTTON_BLOCKS, inngest.send() call.
  - `src/gateway/slack/handlers.ts:69-89` — `BUTTON_BLOCKS(taskId)` helper. Create a `GUEST_BUTTON_BLOCKS(taskId)` with the three guest buttons following the same pattern.

  **API/Type References**:
  - `src/gateway/slack/handlers.ts` — `ActionBody` interface (lines ~50-60). Same interface applies to guest handlers.

  **WHY Each Reference Matters**:
  - The existing approve handler is the exact template — the guest version is functionally identical with a different action_id. Copying ensures consistency.

  **Acceptance Criteria**:
  - [ ] `boltApp.action('guest_approve', ...)` registered in `registerSlackHandlers()`
  - [ ] Handler follows exact same pattern as existing `approve` handler
  - [ ] `GUEST_BUTTON_BLOCKS(taskId)` helper exists for error recovery
  - [ ] `pnpm build` succeeds

  **QA Scenarios:**

  ```
  Scenario: guest_approve handler fires correct Inngest event
    Tool: Bash (curl to Inngest dev server)
    Preconditions: Gateway running (pnpm dev:start), guest task in Reviewing status
    Steps:
      1. Create a test task in Reviewing status via PostgREST
      2. Fire a manual approval event: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U_TEST","userName":"TestUser"}}'
      3. Check task status via PostgREST: curl "http://localhost:54321/rest/v1/tasks?id=eq.<TASK_ID>&select=status"
      4. Assert status changed from Reviewing
    Expected Result: Task status progresses past Reviewing
    Failure Indicators: Task stays in Reviewing, or error in Inngest logs
    Evidence: .sisyphus/evidence/task-5-approve-handler.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-approve-handler.txt — handler test output

  **Commit**: YES (groups with Task 4)
  - Message: `feat(slack): add guest_approve Bolt action handler`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Add guest_edit action handler + edit modal view handler

  **What to do**:
  - **Part A — Action handler**: Add `boltApp.action('guest_edit', async ({ ack, body, client }) => { ... })` in `registerSlackHandlers()`:
    1. Extract button value: `JSON.parse(actionBody.actions[0].value)` → `{ taskId, draftResponse }`
    2. `ack()` immediately (within 3 seconds)
    3. Open modal: `client.views.open({ trigger_id: body.trigger_id, view: { type: 'modal', callback_id: 'guest_edit_modal', private_metadata: JSON.stringify({ taskId, channelId: body.channel?.id, messageTs: body.message?.ts }), title: { type: 'plain_text', text: 'Edit Response' }, submit: { type: 'plain_text', text: 'Send Edited Response' }, blocks: [{ type: 'input', block_id: 'draft_input', label: { type: 'plain_text', text: 'Draft Response' }, element: { type: 'plain_text_input', action_id: 'edited_draft', multiline: true, initial_value: draftResponse } }] } })`
    4. The `initial_value` pre-fills the textarea with the current draft
    5. `private_metadata` carries taskId + channel info through the modal round-trip

  - **Part B — View handler**: Add `boltApp.view('guest_edit_modal', async ({ ack, view, body }) => { ... })`:
    1. `ack()` immediately
    2. Extract edited text: `view.state.values.draft_input.edited_draft.value`
    3. Extract context: `JSON.parse(view.private_metadata)` → `{ taskId, channelId, messageTs }`
    4. Validate: if edited text is empty/whitespace-only, return ack with `response_action: 'errors'` and error message on the input block
    5. Idempotency check: `isTaskAwaitingApproval(taskId)`
    6. Fire event: `inngest.send({ name: 'employee/approval.received', data: { taskId, action: 'approve', userId: body.user.id, userName: body.user.name, editedContent: editedText }, id: \`employee-approval-${taskId}\` })`
    7. Update the original Slack message to show "Processing edit..." using `client.chat.update({ channel: channelId, ts: messageTs, blocks: [...processing state...] })`

  **Must NOT do**:
  - DO NOT add `openModal` to `SlackClient` interface — use Bolt's `client` object directly
  - DO NOT add fields beyond the draft textarea to the edit modal
  - DO NOT modify any existing handlers

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: First modal implementation in the platform, complex async flow with trigger_id timing, private_metadata round-trip, view submission handling, empty validation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: Tasks 8, 10, 11
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:176-251` — Existing `approve` handler pattern for ack, idempotency, error handling
  - `src/gateway/slack/handlers.ts` — `registerSlackHandlers(boltApp, inngestClient)` — this is where ALL handlers are registered. Add `boltApp.view()` here too.

  **API/Type References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/approval-handlers.ts` — Standalone MVP's edit handler and `buildEditModal()`. Shows the proven modal structure, private_metadata pattern, and view submission handling. This is in a DIFFERENT repo — read for reference only.

  **External References**:
  - Slack Bolt modals: https://slack.dev/bolt-js/concepts/creating-modals — `views.open`, `view_submission` handling
  - Slack `views.open` API: https://api.slack.com/methods/views.open — trigger_id, view payload structure
  - Slack Block Kit `input` block: https://api.slack.com/reference/block-kit/blocks#input — `plain_text_input` element with `initial_value`

  **WHY Each Reference Matters**:
  - The standalone MVP's edit handler is the proven implementation — it shows the complete modal lifecycle (open → pre-fill → submit → process)
  - Slack Bolt docs show the correct `boltApp.view()` registration pattern for `view_submission` events
  - The `views.open` API docs show the exact payload structure and `trigger_id` requirements

  **Acceptance Criteria**:
  - [ ] `boltApp.action('guest_edit', ...)` registered in `registerSlackHandlers()`
  - [ ] `boltApp.view('guest_edit_modal', ...)` registered in `registerSlackHandlers()`
  - [ ] Modal opens with pre-filled draft response text
  - [ ] Empty/whitespace submission returns validation error (modal stays open)
  - [ ] Valid submission fires `employee/approval.received` with `editedContent` field
  - [ ] Original Slack message updated to processing state after submission
  - [ ] `pnpm build` succeeds

  **QA Scenarios:**

  ```
  Scenario: Edit modal submission fires approval event with editedContent
    Tool: Bash (curl to Inngest dev server)
    Preconditions: Gateway running, guest task in Reviewing status
    Steps:
      1. Manually fire an approval event with editedContent: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U_TEST","userName":"TestUser","editedContent":"My edited response text here"}}'
      2. Wait 5 seconds for lifecycle processing
      3. Check deliverable content: curl "http://localhost:54321/rest/v1/deliverables?external_ref=eq.<TASK_ID>&select=content&order=created_at.desc&limit=1"
      4. Parse content JSON and check if draftResponse was updated to "My edited response text here"
    Expected Result: Deliverable content contains the edited text
    Failure Indicators: Content unchanged, or task status error
    Evidence: .sisyphus/evidence/task-6-edit-modal-flow.txt

  Scenario: Empty edit submission is rejected
    Tool: Bash
    Preconditions: Modal view handler validates input
    Steps:
      1. This is tested via unit tests (Task 10) — the view handler checks for empty/whitespace text
      2. Verify in test output that empty submission test case passes
    Expected Result: View handler returns validation error for empty input
    Failure Indicators: Empty text accepted, or no validation test
    Evidence: .sisyphus/evidence/task-6-empty-edit-validation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-edit-modal-flow.txt — edit flow test output
  - [ ] task-6-empty-edit-validation.txt — validation test output

  **Commit**: YES (groups with Tasks 5, 7)
  - Message: `feat(slack): add guest_edit action handler and edit modal`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 7. Add guest_reject action handler + reject reason modal view handler

  **What to do**:
  - **Part A — Action handler**: Add `boltApp.action('guest_reject', async ({ ack, body, client }) => { ... })` in `registerSlackHandlers()`:
    1. Extract `taskId` from `actionBody.actions[0].value` (plain string)
    2. `ack()` immediately
    3. Open modal: `client.views.open({ trigger_id: body.trigger_id, view: { type: 'modal', callback_id: 'guest_reject_modal', private_metadata: JSON.stringify({ taskId, channelId: body.channel?.id, messageTs: body.message?.ts }), title: { type: 'plain_text', text: 'Reject Response' }, submit: { type: 'plain_text', text: 'Reject' }, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Are you sure you want to reject this draft response?' } }, { type: 'input', block_id: 'reason_input', optional: true, label: { type: 'plain_text', text: 'Rejection Reason (optional)' }, element: { type: 'plain_text_input', action_id: 'rejection_reason', multiline: true, placeholder: { type: 'plain_text', text: 'Help improve future responses...' } } }] } })`

  - **Part B — View handler**: Add `boltApp.view('guest_reject_modal', async ({ ack, view, body }) => { ... })`:
    1. `ack()` immediately
    2. Extract reason: `view.state.values.reason_input.rejection_reason.value` (may be null/empty — that's OK, it's optional)
    3. Extract context: `JSON.parse(view.private_metadata)` → `{ taskId, channelId, messageTs }`
    4. Idempotency check: `isTaskAwaitingApproval(taskId)`
    5. Fire event: `inngest.send({ name: 'employee/approval.received', data: { taskId, action: 'reject', userId: body.user.id, userName: body.user.name, rejectionReason: reason || undefined }, id: \`employee-approval-${taskId}\` })`
    6. Update original Slack message to "Processing rejection..." state

  **Must NOT do**:
  - DO NOT modify the existing `reject` handler (action_id: `'reject'`)
  - DO NOT add category dropdowns or severity ratings — one plain text input only
  - DO NOT make the rejection reason required

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Second modal in the platform, builds on patterns from Task 6 but with different form structure (optional input, confirmation text)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Tasks 8, 10, 11
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - Task 6's implementation — the edit modal pattern. The reject modal follows the same `views.open` → `boltApp.view()` → `private_metadata` round-trip pattern, but with an optional input instead of required.
  - `src/gateway/slack/handlers.ts:253-328` — Existing `reject` handler. Same idempotency and event-firing pattern.

  **External References**:
  - Slack `input` block `optional` property: https://api.slack.com/reference/block-kit/blocks#input — when `optional: true`, Slack allows empty submission

  **WHY Each Reference Matters**:
  - Task 6's edit modal is the template — reject modal is structurally similar but with optional input
  - The existing reject handler shows the rejection event pattern

  **Acceptance Criteria**:
  - [ ] `boltApp.action('guest_reject', ...)` registered in `registerSlackHandlers()`
  - [ ] `boltApp.view('guest_reject_modal', ...)` registered in `registerSlackHandlers()`
  - [ ] Modal shows confirmation text + optional reason text input
  - [ ] Submission with reason fires event with `rejectionReason` set
  - [ ] Submission without reason fires event with `rejectionReason: undefined`
  - [ ] Original Slack message updated to processing state
  - [ ] `pnpm build` succeeds

  **QA Scenarios:**

  ```
  Scenario: Reject with reason fires event with rejectionReason
    Tool: Bash (curl to Inngest dev server)
    Preconditions: Gateway running, guest task in Reviewing status
    Steps:
      1. Fire rejection event with reason: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"reject","userId":"U_TEST","userName":"TestUser","rejectionReason":"Too casual, needs more formal tone"}}'
      2. Wait 5 seconds
      3. Check task status: curl "http://localhost:54321/rest/v1/tasks?id=eq.<TASK_ID>&select=status,metadata"
      4. Assert status is "Cancelled"
      5. Assert metadata contains rejectionReason
    Expected Result: Task cancelled, rejection reason stored in metadata
    Failure Indicators: Task not cancelled, or reason not stored
    Evidence: .sisyphus/evidence/task-7-reject-with-reason.txt

  Scenario: Reject without reason fires event without rejectionReason
    Tool: Bash (curl to Inngest dev server)
    Preconditions: Gateway running, guest task in Reviewing status
    Steps:
      1. Fire rejection event without reason: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"reject","userId":"U_TEST","userName":"TestUser"}}'
      2. Wait 5 seconds
      3. Check task status: curl "http://localhost:54321/rest/v1/tasks?id=eq.<TASK_ID>&select=status"
      4. Assert status is "Cancelled"
    Expected Result: Task cancelled normally without rejection reason
    Failure Indicators: Error due to missing rejectionReason field
    Evidence: .sisyphus/evidence/task-7-reject-no-reason.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-reject-with-reason.txt — rejection with reason test
  - [ ] task-7-reject-no-reason.txt — rejection without reason test

  **Commit**: YES (groups with Tasks 5, 6)
  - Message: `feat(slack): add guest_reject action handler and reject reason modal`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 8. Wire editedContent and rejectionReason in lifecycle

  **What to do**:
  - Modify `handle-approval-result` step in `src/inngest/employee-lifecycle.ts` to handle the new optional fields:
  - **editedContent handling** (approve path):
    1. Extract `editedContent` from `approvalEvent.data.editedContent` (may be undefined)
    2. If `editedContent` is present AND action is `'approve'`:
       a. Fetch the current deliverable via PostgREST: `deliverables?external_ref=eq.{taskId}&select=id,content&order=created_at.desc&limit=1`
       b. Parse `deliverable.content` as JSON (it's a `ClassifyResult` JSON string)
       c. Replace `draftResponse` with `editedContent`
       d. PATCH the deliverable content back: `PATCH /deliverables?id=eq.{deliverableId}` with `{ content: JSON.stringify(updatedClassifyResult) }`
       e. The delivery machine will then read the updated content with the edited draft
    3. If `editedContent` is NOT present: proceed as normal (existing behavior)

  - **rejectionReason handling** (reject path):
    1. Extract `rejectionReason` from `approvalEvent.data.rejectionReason` (may be undefined)
    2. If action is `'reject'` AND `rejectionReason` is present:
       a. Fetch current task metadata via PostgREST
       b. Merge `rejectionReason` into task metadata: `PATCH /tasks?id=eq.{taskId}` with `{ metadata: { ...existingMetadata, rejectionReason } }`
    3. If `rejectionReason` is NOT present: proceed as normal (existing behavior — task goes to Cancelled)

  - **Backward compatibility**: Both paths have fallback to existing behavior when new fields are absent. The summarizer's approve/reject flow is completely unaffected.

  **Must NOT do**:
  - DO NOT change the existing approve path logic (status transitions, Slack message updates, delivery machine spawning)
  - DO NOT change the existing reject path logic (status transition to Cancelled, Slack message update)
  - DO NOT store rejectionReason in the `feedback` table — store in `tasks.metadata` only
  - DO NOT add any new PostgREST dependencies — use the existing client pattern

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Lifecycle code is critical path, requires careful handling of optional fields, PostgREST PATCH for deliverable content, and strict backward compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:351-529` — The entire `handle-approval-result` step. Read this thoroughly. The approve path is at ~line 405, reject path at ~line 490. The code fetches the deliverable, reads metadata, updates Slack messages, and transitions task status.
  - `src/inngest/employee-lifecycle.ts:344` — The `waitForEvent` call that receives the approval event. The event data is destructured from `approvalEvent.data`.

  **API/Type References**:
  - PostgREST PATCH pattern — check how task status patches are done in the lifecycle. The same pattern applies to `PATCH /deliverables?id=eq.{id}`.
  - `src/workers/lib/postgrest-client.ts` — PostgREST client used by both workers and lifecycle. Check if it supports PATCH operations on the `deliverables` table.

  **Test References**:
  - `tests/inngest/lifecycle.test.ts` — Existing lifecycle tests. The `handle-approval-result` step has ZERO test coverage per Metis review. New tests for editedContent/rejectionReason go in Task 10.

  **WHY Each Reference Matters**:
  - The lifecycle code is the critical path — any mistake here breaks the entire approval flow for ALL employees (summarizer included)
  - The PostgREST client pattern shows how to make PATCH calls — follow the exact same pattern for deliverable content patching
  - Zero existing test coverage means extra caution is needed — manual verification of backward compatibility is essential

  **Acceptance Criteria**:
  - [ ] `editedContent` from approval event patches `deliverables.content` JSON (replaces `draftResponse`)
  - [ ] `rejectionReason` from approval event stored in `tasks.metadata`
  - [ ] Approve without `editedContent` works as before (no regression)
  - [ ] Reject without `rejectionReason` works as before (no regression)
  - [ ] `pnpm build` succeeds
  - [ ] Summarizer approve/reject still compiles and works

  **QA Scenarios:**

  ```
  Scenario: editedContent patches deliverable before delivery
    Tool: Bash
    Preconditions: Task in Reviewing status with deliverable containing original draftResponse
    Steps:
      1. Note original deliverable content: curl "http://localhost:54321/rest/v1/deliverables?external_ref=eq.<TASK_ID>&select=content"
      2. Fire approval with editedContent: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U_TEST","userName":"TestUser","editedContent":"My completely rewritten response"}}'
      3. Wait 10 seconds for lifecycle processing
      4. Check updated deliverable: curl "http://localhost:54321/rest/v1/deliverables?external_ref=eq.<TASK_ID>&select=content&order=created_at.desc&limit=1"
      5. Parse content JSON, assert draftResponse equals "My completely rewritten response"
    Expected Result: Deliverable content updated with edited text
    Failure Indicators: Content unchanged, or JSON parse error
    Evidence: .sisyphus/evidence/task-8-edited-content-patch.txt

  Scenario: rejectionReason stored in task metadata
    Tool: Bash
    Preconditions: Task in Reviewing status
    Steps:
      1. Fire rejection with reason: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"reject","userId":"U_TEST","userName":"TestUser","rejectionReason":"Draft is too informal for this guest"}}'
      2. Wait 5 seconds
      3. Check task: curl "http://localhost:54321/rest/v1/tasks?id=eq.<TASK_ID>&select=status,metadata"
      4. Assert status is "Cancelled"
      5. Parse metadata JSON, assert rejectionReason equals "Draft is too informal for this guest"
    Expected Result: Task cancelled, reason persisted in metadata
    Failure Indicators: Metadata missing rejectionReason, or status not Cancelled
    Evidence: .sisyphus/evidence/task-8-rejection-reason-stored.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-edited-content-patch.txt — editedContent patching test
  - [ ] task-8-rejection-reason-stored.txt — rejection reason storage test

  **Commit**: YES
  - Message: `feat(lifecycle): thread editedContent and rejectionReason through approval`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 9. Update VLRE guest messaging archetype instructions

  **What to do**:
  - Update `VLRE_GUEST_MESSAGING_INSTRUCTIONS` in `prisma/seed.ts` (around line 413) to:
    1. **Serialize enriched ClassifyResult**: After classification, the agent must output a JSON that includes ALL ClassifyResult fields (original 8 + new 9 guest context fields). The enriched JSON includes `guestName`, `propertyName`, `checkIn`, `checkOut`, `bookingChannel`, `originalMessage`, `leadUid`, `threadUid`, `messageUid` alongside the existing `classification`, `confidence`, `reasoning`, `draftResponse`, `summary`, `category`, `conversationSummary`, `urgency`.
    2. **Use the new shell tool**: Replace the current `post-message.ts --text "..."` call with:
       ```
       tsx /tools/slack/post-guest-approval.ts \
         --channel "$NOTIFICATION_CHANNEL" \
         --task-id "$TASK_ID" \
         --guest-name "<guestName from JSON>" \
         --property-name "<propertyName from JSON>" \
         --check-in "<checkIn>" \
         --check-out "<checkOut>" \
         --booking-channel "<bookingChannel>" \
         --original-message "<originalMessage>" \
         --draft-response "<draftResponse>" \
         --confidence <confidence> \
         --category "<category>" \
         --urgency <urgency> \
         --lead-uid "<leadUid>" \
         --thread-uid "<threadUid>" \
         --message-uid "<messageUid>" \
         > /tmp/approval-message.json
       ```
    3. **Write enriched JSON to /tmp/summary.txt**: The agent must write the full enriched ClassifyResult JSON to `/tmp/summary.txt` so the harness stores it as `deliverable.content` — this is how the lifecycle and delivery machine access the data.
    4. **One message per task**: Ensure instructions say "process ONE message per task" (not batch all unresponded). The trigger layer handles batching.
  - Also update the `notification_channel` field on archetype `00000000-0000-0000-0000-000000000015` if it's currently null — set to `C0960S2Q8RL` (VLRE's channel)
  - Run `pnpm prisma db seed` after changes to update the database

  **Must NOT do**:
  - DO NOT change the `GUEST_MESSAGING_SYSTEM_PROMPT` (line 37) — only change the instructions
  - DO NOT change the archetype `model` field — keep `minimax/minimax-m2.7`
  - DO NOT change the DozalDevs archetype instructions — only VLRE
  - DO NOT change any other seed data (summarizer archetypes, tenants, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Careful editing of natural language instructions in seed.ts, must match the exact shell tool CLI syntax, and ensure the data contract is complete
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:413-500` (approximate) — Current `VLRE_GUEST_MESSAGING_INSTRUCTIONS`. Read the entire string to understand what to modify. The instructions tell OpenCode what shell tools to call and in what order.
  - `prisma/seed.ts:37-80` (approximate) — `GUEST_MESSAGING_SYSTEM_PROMPT`. DO NOT modify, but read to understand the agent's persona and classification logic.

  **API/Type References**:
  - Task 2's `post-guest-approval.ts` — the exact CLI flags the instructions must call. The instruction text must match the tool's expected args exactly.
  - Task 1's extended `ClassifyResult` — the instructions must tell the agent to output ALL these fields in the JSON.

  **Test References**:
  - After running `pnpm prisma db seed`, verify via PostgREST: `curl "http://localhost:54321/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions"` — confirm instructions contain the new shell tool command.

  **WHY Each Reference Matters**:
  - The current instructions are the baseline — the executor must understand what to keep, what to change, and what the overall flow is
  - The shell tool's exact CLI flags must match what the instructions tell the agent to call — any mismatch means the card won't render

  **Acceptance Criteria**:
  - [ ] `VLRE_GUEST_MESSAGING_INSTRUCTIONS` updated in `prisma/seed.ts`
  - [ ] Instructions reference `post-guest-approval.ts` instead of `post-message.ts`
  - [ ] Instructions tell agent to serialize all ClassifyResult fields (original + guest context) to `/tmp/summary.txt`
  - [ ] Instructions specify one-message-per-task processing
  - [ ] `pnpm prisma db seed` runs successfully
  - [ ] PostgREST query confirms archetype instructions are updated in DB

  **QA Scenarios:**

  ```
  Scenario: Seed updates archetype instructions in DB
    Tool: Bash
    Preconditions: seed.ts updated
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert exit code 0
      3. Query: curl -s "http://localhost:54321/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
      4. Assert response contains "post-guest-approval.ts"
      5. Assert response contains "guestName"
      6. Assert response does NOT contain the old "post-message.ts --text" pattern for guest messaging
    Expected Result: DB contains updated instructions
    Failure Indicators: Seed fails, or instructions still reference old tool
    Evidence: .sisyphus/evidence/task-9-seed-verification.txt
  ```

  **Evidence to Capture:**
  - [ ] task-9-seed-verification.txt — seed and DB verification output

  **Commit**: YES
  - Message: `feat(archetype): update guest messaging instructions for rich approval card`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 10. Vitest tests for shell tool, handlers, and lifecycle changes

  **What to do**:
  - **Shell tool tests** (`tests/worker-tools/slack/post-guest-approval.test.ts`):
    1. Test `buildGuestApprovalBlocks()` — verify block count, block types, field content, action IDs, task ID context block
    2. Test with all fields present → correct block structure
    3. Test with `conversationSummary: null` → section gracefully handled
    4. Test button value JSON → valid JSON with taskId and draftResponse
    5. Test long draftResponse truncation in Edit button value → <= 2000 chars
    6. Test CLI arg parsing (mock WebClient to avoid Slack API calls)

  - **Handler tests** (`tests/gateway/slack/guest-handlers.test.ts`):
    1. Test `guest_approve` handler → fires `employee/approval.received` with `action: 'approve'`
    2. Test `guest_approve` idempotency → already-processed task returns "already processed"
    3. Test `guest_edit` handler → calls `client.views.open` with correct modal structure
    4. Test `guest_edit_modal` view handler → fires event with `editedContent`
    5. Test `guest_edit_modal` empty text validation → returns error
    6. Test `guest_reject` handler → calls `client.views.open` with reject modal
    7. Test `guest_reject_modal` view handler → fires event with `rejectionReason`
    8. Test `guest_reject_modal` no reason → fires event without `rejectionReason`

  - **Lifecycle tests** (extend `tests/inngest/lifecycle.test.ts` or new file):
    1. Test approve with `editedContent` → deliverable content patched
    2. Test approve without `editedContent` → deliverable content unchanged
    3. Test reject with `rejectionReason` → stored in task metadata
    4. Test reject without `rejectionReason` → normal cancellation

  - Run full test suite: `pnpm test -- --run` to verify no regressions

  **Must NOT do**:
  - DO NOT add tests for existing summarizer approval paths
  - DO NOT modify existing test fixtures
  - DO NOT mock PostgREST in a way that breaks existing tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, complex mocking (Slack WebClient, Bolt client, PostgREST), comprehensive coverage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (partially — can start after Wave 2 tasks complete)
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 1, 2, 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - `tests/lib/classify-message.test.ts` — Test fixture pattern for ClassifyResult
  - `tests/inngest/lifecycle.test.ts` — Lifecycle test setup (mock Inngest, step, slackClient)
  - `tests/gateway/slack/` — Check if handler tests exist; if not, create following project Vitest patterns

  **Test References**:
  - `vitest.config.ts` — Test configuration, understand the setup
  - Any existing `*.test.ts` in `tests/` — Follow naming conventions and import patterns

  **WHY Each Reference Matters**:
  - Existing test patterns ensure consistency — follow the same describe/it/expect structure and mock patterns

  **Acceptance Criteria**:
  - [ ] `tests/worker-tools/slack/post-guest-approval.test.ts` exists with >= 6 test cases
  - [ ] `tests/gateway/slack/guest-handlers.test.ts` exists with >= 8 test cases
  - [ ] Lifecycle tests for editedContent and rejectionReason exist with >= 4 test cases
  - [ ] `pnpm test -- --run` — ALL tests pass (existing + new), 0 new failures
  - [ ] New test count: >= 18 new test cases total

  **QA Scenarios:**

  ```
  Scenario: Full test suite passes with new tests
    Tool: Bash
    Preconditions: All test files created
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee /tmp/test-output.txt
      2. Assert exit code 0
      3. Grep for "Tests:" line and verify no failures
      4. Grep for new test file names to confirm they ran
      5. Count new test cases
    Expected Result: All tests pass, >= 18 new test cases
    Failure Indicators: Any test failure, or new test files not found in output
    Evidence: .sisyphus/evidence/task-10-test-results.txt

  Scenario: No regressions in existing tests
    Tool: Bash
    Preconditions: All changes complete
    Steps:
      1. Run: pnpm test -- --run tests/lib/classify-message.test.ts 2>&1
      2. Assert all 25+ cases pass
      3. Run: pnpm test -- --run tests/inngest/lifecycle.test.ts 2>&1
      4. Assert existing cases still pass (note: some may have pre-existing failures per AGENTS.md)
    Expected Result: No new regressions introduced
    Failure Indicators: Previously passing test now fails
    Evidence: .sisyphus/evidence/task-10-regression-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-10-test-results.txt — full test suite output
  - [ ] task-10-regression-check.txt — regression check output

  **Commit**: YES
  - Message: `test: add tests for guest approval card, handlers, and lifecycle changes`
  - Files: `tests/worker-tools/slack/post-guest-approval.test.ts`, `tests/gateway/slack/guest-handlers.test.ts`, `tests/inngest/lifecycle.test.ts` (or new file)
  - Pre-commit: `pnpm test -- --run`

- [x] 11. E2E verification via admin API trigger

  **What to do**:
  - Trigger the guest messaging employee via the admin API and verify the full flow end-to-end
  - **Prerequisites**: Services running (`pnpm dev:start`), Inngest dev server at `http://localhost:8288`, DB seeded with updated archetype
  - **Steps**:
    1. Trigger: `curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger" -d '{}'`
    2. Monitor task status via `GET /admin/tenants/.../tasks/{id}` until it reaches `Reviewing` (meaning the card was posted)
    3. Verify the Slack card was posted to the configured channel
    4. Verify the card contains all required fields (guest name, property, dates, etc.)
    5. Verify all three buttons are present (Approve & Send, Edit & Send, Reject)
    6. Test the approve button by firing the approval event manually via Inngest dev server
    7. Verify the Slack card updates to approved state
    8. Verify the task status transitions correctly through the lifecycle
  - **Note**: This is an integration test that depends on real Slack API access and Hostfully data. If Hostfully API is unavailable, test with a mock task that has pre-populated deliverable content.
  - Document all verification results in evidence files

  **Must NOT do**:
  - DO NOT push to production
  - DO NOT trigger with real guest data unless using the test property from AGENTS.md (Hostfully Testing section)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E verification requiring multiple tools (curl, jq, Slack API), careful state checking, and evidence capture
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after all implementation tasks)
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Tasks 8, 9, 10

  **References**:

  **Pattern References**:
  - AGENTS.md "Admin API" section — trigger endpoint and status endpoint patterns
  - AGENTS.md "Hostfully Testing" section — test property and thread UIDs for VLRE tenant

  **WHY Each Reference Matters**:
  - Admin API patterns ensure correct triggering — wrong tenant ID or slug will 404
  - Test resources ensure we use safe test data, not real guest data

  **Acceptance Criteria**:
  - [ ] Employee triggered successfully via admin API (202 response)
  - [ ] Task reaches `Reviewing` status (card posted)
  - [ ] Slack card visible in configured channel
  - [ ] Card contains all required fields
  - [ ] Approval event processes correctly
  - [ ] All evidence files captured

  **QA Scenarios:**

  ```
  Scenario: Full E2E — trigger employee and verify card
    Tool: Bash (curl)
    Preconditions: pnpm dev:start running, DB seeded, Slack connected
    Steps:
      1. Trigger: curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger" -H "Content-Type: application/json" -d '{}'
      2. Extract task_id from 202 response
      3. Poll task status every 10s: curl -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/<TASK_ID>"
      4. Wait until status reaches "Reviewing" (max 5 minutes)
      5. Check deliverable content: curl "http://localhost:54321/rest/v1/deliverables?external_ref=eq.<TASK_ID>&select=content,metadata"
      6. Assert content JSON contains guestName, propertyName, draftResponse
      7. Assert metadata contains approval_message_ts and target_channel
    Expected Result: Task in Reviewing, deliverable has enriched ClassifyResult, card posted to Slack
    Failure Indicators: Task stuck in Executing, or deliverable missing guest context fields
    Evidence: .sisyphus/evidence/task-11-e2e-trigger.txt

  Scenario: Approve button processes correctly
    Tool: Bash (curl to Inngest dev server)
    Preconditions: Task in Reviewing status from previous scenario
    Steps:
      1. Fire approval: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U05V0CTJLF6","userName":"Victor"}}'
      2. Poll task status every 5s until terminal state
      3. Assert status reaches "Approved" then "Delivering" (or "Done")
    Expected Result: Task progresses through approval lifecycle
    Failure Indicators: Task stays in Reviewing, or goes to Failed
    Evidence: .sisyphus/evidence/task-11-e2e-approve.txt
  ```

  **Evidence to Capture:**
  - [ ] task-11-e2e-trigger.txt — trigger and monitoring output
  - [ ] task-11-e2e-approve.txt — approval flow output

  **Commit**: NO (verification only)

- [x] 12. Summarizer regression check

  **What to do**:
  - Verify the daily summarizer's approval flow still works after all handler changes
  - Trigger the DozalDevs summarizer: `curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'`
  - Monitor until the task reaches `Reviewing` status
  - Fire a manual approval event using the existing `approve` action_id pattern
  - Verify the task progresses through `Approved` → `Delivering` → `Done`
  - This confirms the existing `approve`/`reject` handlers and lifecycle path are unaffected by the new `guest_*` handlers

  **Must NOT do**:
  - DO NOT modify any summarizer code for this task
  - DO NOT skip this check — it's the most critical regression surface

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Execute existing E2E flow, verify status transitions — no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (after Task 11)
  - **Parallel Group**: Wave 4 (sequential after Task 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 11

  **References**:

  **Pattern References**:
  - AGENTS.md "Admin API" section — summarizer trigger command with DozalDevs tenant ID
  - AGENTS.md "Manual approval fallback" — curl command for manual approval via Inngest

  **Acceptance Criteria**:
  - [ ] Summarizer triggered successfully (202 response)
  - [ ] Task reaches `Reviewing` status
  - [ ] Manual approval processes correctly (task transitions to Approved → Done)
  - [ ] No errors in gateway logs related to handler registration

  **QA Scenarios:**

  ```
  Scenario: Summarizer E2E still works
    Tool: Bash (curl)
    Preconditions: Services running, DozalDevs tenant has valid Slack OAuth
    Steps:
      1. Trigger: curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'
      2. Extract task_id
      3. Poll until Reviewing (max 5 min)
      4. Fire manual approval: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U05V0CTJLF6","userName":"Victor"}}'
      5. Poll until terminal state
      6. Assert final status is "Done" (or appropriate terminal)
    Expected Result: Full summarizer flow completes without errors
    Failure Indicators: Task stuck, handler errors, or action_id routing broken
    Evidence: .sisyphus/evidence/task-12-summarizer-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] task-12-summarizer-regression.txt — regression test output

  **Commit**: NO (verification only)

- [x] 13. Mark GM-05 done in story map

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the GM-05 section and mark ALL acceptance criteria checkboxes as checked (`[x]`)
  - Specifically mark:
    - `[x]` Slack card displays: guest name, property name, check-in/out dates, booking channel, original guest message, AI-drafted response, confidence score, category tag
    - `[x]` Three action buttons: Approve, Edit & Send, Reject
    - `[x]` Task ID context block present
    - `[x]` Card posts to tenant's configured Slack channel
    - `[x]` Approve triggers the response to be sent (GM-06)
    - `[x]` Edit & Send allows PM to modify draft text
    - `[x]` Reject logs the rejection reason

  **Must NOT do**:
  - DO NOT change any other section of the story map
  - DO NOT add new stories or modify surrounding text
  - DO NOT change dates or metadata

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit, checkbox toggling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 12)
  - **Blocks**: Task 14
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md` — Find the GM-05 section. The acceptance criteria are listed with `- [ ]` checkboxes.

  **Acceptance Criteria**:
  - [ ] All GM-05 acceptance criteria checkboxes marked as `[x]`
  - [ ] No other changes to the story map file

  **QA Scenarios:**

  ```
  Scenario: GM-05 marked complete in story map
    Tool: Bash (grep)
    Preconditions: Story map edited
    Steps:
      1. Run: grep -A20 "GM-05" docs/2026-04-21-2202-phase1-story-map.md | grep "\[x\]" | wc -l
      2. Assert count >= 7 (all acceptance criteria checked)
      3. Run: grep -A20 "GM-05" docs/2026-04-21-2202-phase1-story-map.md | grep "\[ \]" | wc -l
      4. Assert count == 0 (no unchecked criteria)
    Expected Result: All GM-05 criteria checked
    Failure Indicators: Any unchecked checkbox
    Evidence: .sisyphus/evidence/task-13-story-map-update.txt
  ```

  **Evidence to Capture:**
  - [ ] task-13-story-map-update.txt — grep verification output

  **Commit**: YES
  - Message: `docs: mark GM-05 complete in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

- [x] 14. Send Telegram notification

  **What to do**:
  - Send a Telegram notification that the plan is complete and all tasks are done
  - Run: `tsx scripts/telegram-notify.ts "✅ gm05-slack-approval-card complete — All tasks done. Come back to review results."`

  **Must NOT do**:
  - Nothing else

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (final task)
  - **Blocks**: None
  - **Blocked By**: Task 13

  **References**:
  - AGENTS.md "Prometheus Planning — Telegram Notifications" section

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

  **QA Scenarios:**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ gm05-slack-approval-card complete — All tasks done. Come back to review results."
      2. Assert exit code 0
    Expected Result: Notification delivered
    Evidence: .sisyphus/evidence/task-14-telegram-sent.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (card renders correctly, buttons fire events, modals open and submit, lifecycle processes correctly). Test edge cases: empty state, null draftResponse, very long messages. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no changes to `post-message.ts` `buildApprovalBlocks`, no changes to existing `approve`/`reject` action IDs, no changes to existing ClassifyResult fields. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                                                | Key Files                                                                                               | Pre-commit Check                                        |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1    | `feat(types): extend ClassifyResult with guest context fields`                | `src/lib/classify-message.ts`, `tests/lib/classify-message.test.ts`                                     | `pnpm test -- --run tests/lib/classify-message.test.ts` |
| 1    | `feat(tools): add post-guest-approval.ts shell tool with dry-run`             | `src/worker-tools/slack/post-guest-approval.ts`, `tests/worker-tools/slack/post-guest-approval.test.ts` | `pnpm build`                                            |
| 2    | `feat(slack): add guest messaging Bolt action and view handlers`              | `src/gateway/slack/handlers.ts`, `tests/gateway/slack/guest-handlers.test.ts`                           | `pnpm test -- --run tests/gateway/slack/`               |
| 3    | `feat(lifecycle): thread editedContent and rejectionReason through approval`  | `src/inngest/employee-lifecycle.ts`                                                                     | `pnpm test -- --run tests/inngest/lifecycle.test.ts`    |
| 3    | `feat(archetype): update guest messaging instructions for rich approval card` | `prisma/seed.ts`                                                                                        | `pnpm build`                                            |
| 4    | `docs: mark GM-05 complete in story map`                                      | `docs/2026-04-21-2202-phase1-story-map.md`                                                              | —                                                       |

---

## Success Criteria

### Verification Commands

```bash
# All tests pass
pnpm test -- --run                          # Expected: all pass including new tests

# Build compiles
pnpm build                                  # Expected: 0 errors

# Lint passes
pnpm lint                                   # Expected: 0 errors

# Shell tool dry-run outputs valid Block Kit JSON
bun run src/worker-tools/slack/post-guest-approval.ts --dry-run \
  --channel "C123" --task-id "test-123" --guest-name "John Doe" \
  --property-name "3505 Bandera" --check-in "2026-05-01" --check-out "2026-05-05" \
  --booking-channel "AIRBNB" --original-message "What time is check-in?" \
  --draft-response "Check-in is at 3pm" --confidence 0.92 --category "access" \
  --lead-uid "abc" --thread-uid "def" --message-uid "ghi" \
  | jq '.blocks | length'                  # Expected: >= 8 blocks

# ClassifyResult backward compatibility
pnpm test -- --run tests/lib/classify-message.test.ts  # Expected: all 25+ cases pass

# Summarizer still works (regression)
# Trigger via admin API and verify approve/reject buttons work
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] GM-05 marked complete in story map
- [ ] Summarizer regression check passes
