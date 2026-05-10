# Guest-Messaging Slack UX Overhaul

## TL;DR

> **Quick Summary**: Overhaul the Slack experience for guest-messaging from opaque status notifications into rich, contextual conversation cards with full audit trails — matching the proven patterns from the VLRE employee reference implementation.
>
> **Deliverables**:
>
> - Hostfully deep-links on every Slack card and terminal state
> - Property name + guest context shown from the very first notification
> - Rich terminal states preserving who approved, what was sent, and when
> - Thread replies after every action creating a permanent audit trail
> - Copy-paste bug fixes, human-readable timestamps, lead status display
> - `reply_broadcast` on approval cards so PMs don't need to expand threads
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 2 (block builders) → Task 4 (lifecycle wiring) → Task 7 (E2E validation)

---

## Context

### Original Request

Improve the Slack UX for the `guest-messaging` employee so property managers have a much better experience reviewing and approving AI-drafted guest replies. Current Slack messages are bare status notifications lacking guest/property context, audit trails, and actionable links.

### Interview Summary

**Key Discussions**:

- Threading model: Keep two-message structure (top-level status + threaded approval card)
- Scope: All 10 identified issues addressed in one plan
- Priority ranking agreed (P1: Hostfully links → P10: reply_broadcast)
- Test strategy: Tests after implementation, plus full real E2E browser validation
- Reference implementation: VLRE employee repo (`/Users/victordozal/repos/real-estate/vlre-employee`)

**Research Findings**:

- `fetchLeadEnrichment()` hardcodes `propertyName: null` — never calls Hostfully properties API despite having `property_uid`
- Approval card `"Approved by @X"` text gets overwritten by `"Delivered at {ISO}"` — actor info erased at terminal state
- `deliverables.metadata` has full context at terminal states (guest_name, property_name, original_message, draft_response, etc.) but only `guest_name` is used
- Approval card expiry text says `"Daily summary expired"` — copy-paste from summarizer
- `buildSupersededBlocks()` is the only terminal state missing the task ID context block
- VLRE employee has complete reference: `buildApprovalBlocks`, `buildContextThreadBlocks`, approval handlers with post-action state management

### Metis Review

**Identified Gaps** (addressed):

- Property name API call adds latency to notify-received → mitigated with 2s timeout + best-effort fallback
- Lifecycle is shared across employees → all changes gated on metadata existence, not role_name (employee-agnostic)
- Inngest step names are immutable → no step renames, only body modifications and new steps
- `reply_broadcast` may be noisy → applied as default for guest-messaging, disclosed to user
- `post-guest-approval.ts` changes require Docker rebuild → explicit rebuild task included
- `buildSupersededBlocks` called from 2 locations → fix the function, not call sites
- Lead status can come from enrichment (lifecycle) OR worker → using worker path (already has it from `get-messages.ts`)

---

## Work Objectives

### Core Objective

Transform the guest-messaging Slack experience from opaque status notifications into rich, contextual conversation cards that give PMs immediate visibility into guest details, property context, and a permanent audit trail of all actions taken.

### Concrete Deliverables

- Hostfully deep-link (`🔗 View in Hostfully` button/link) on every Slack message in the lifecycle
- Property name shown in the notify-received message from the start (fix `fetchLeadEnrichment`)
- Rich terminal states on both top-level message AND approval card (guest, property, actor, snippet, timestamp, Hostfully link)
- Context thread reply posted after every approve/reject/edit action
- Fixed expiry text (no more "Daily summary expired" for guest messages)
- Slack-native `<!date^>` formatting replacing raw ISO timestamps
- Lead status (BOOKED/INQUIRY/CLOSED) shown in approval card
- `buildSupersededBlocks` includes task ID context block
- `reply_broadcast: true` on all guest approval cards

### Definition of Done

- [x] `pnpm test -- --run` passes with all new tests
- [x] `pnpm build` succeeds with no type errors
- [x] Full E2E: Airbnb test message → Slack approval card with Hostfully link → Approve → Delivery confirmed → all Slack messages show enriched context

### Must Have

- Hostfully deep-link on approval card as a URL button (opens in browser, no handler needed)
- Property name in notify-received message (best-effort, fallback to omission on API failure)
- Actor attribution preserved in terminal states (`Approved by <@userId>`)
- Context thread reply after approve action (with original message + what was sent)
- Human-readable timestamps using Slack's `<!date^>` format

### Must NOT Have (Guardrails)

- **No employee-specific language in shared files** — `employee-lifecycle.ts` must stay employee-agnostic. Gate all guest-messaging-specific behavior on `metadata` field existence (e.g., `metadata.original_message`), never on `archetype.role_name`
- **No Inngest step renames** — step names are immutable idempotency keys; only modify step bodies or add new steps
- **No changes to `/tmp/approval-message.json` output shape** — the harness reads it; adding fields is OK, removing/renaming is not
- **No changes to summarizer flow** — expiry text fix must use generic language or data-gated branching, not break Papi Chulo
- **No changes to deprecated components** — `lifecycle.ts`, `redispatch.ts`, `generic-harness.mts`, `orchestrate.mts` are off-limits
- **No over-abstraction** — these are targeted Slack block improvements, not a "Slack framework refactor"
- **No additional API calls in hot paths without timeouts** — property name fetch must have ≤2s timeout

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: YES (tests after implementation)
- **Framework**: Vitest
- **If TDD**: N/A — tests written after implementation

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Block builder functions**: Use Bash (bun/node) — import, call with test data, assert output structure
- **Lifecycle Slack messages**: Use Playwright (browser) — navigate Slack, inspect messages, screenshot
- **Approval card**: Use Playwright — interact with Slack thread, verify blocks, click buttons
- **E2E flow**: Use Playwright — trigger from Airbnb, observe Slack, approve, verify delivery

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, all independent):
├── Task 1: Enrich Hostfully lead data with property name [quick]
├── Task 2: Build Hostfully link helper + enriched block builders [unspecified-high]
└── Task 3: Add lead status + Hostfully link to approval card [quick]

Wave 2 (After Wave 1 — integration):
└── Task 4: Wire all Slack UX improvements into lifecycle [deep]

Wave 3 (After Wave 2 — verification, parallel):
├── Task 5: Unit tests for enrichment + block builders + lifecycle [unspecified-high]
└── Task 6: Docker rebuild [quick]

Wave 4 (After Wave 3 — E2E):
└── Task 7: Full E2E browser validation [unspecified-high + playwright]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Task 8: Telegram notification (after user okay)

Critical Path: Task 2 → Task 4 → Task 6 → Task 7 → F1-F4 → user okay → Task 8
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task  | Depends On        | Blocks | Wave       |
| ----- | ----------------- | ------ | ---------- |
| 1     | —                 | 4      | 1          |
| 2     | —                 | 4      | 1          |
| 3     | —                 | 6      | 1          |
| 4     | 1, 2              | 5, 7   | 2          |
| 5     | 1, 2, 4           | 7      | 3          |
| 6     | 3                 | 7      | 3          |
| 7     | 4, 5, 6           | F1-F4  | 4          |
| F1-F4 | 7                 | 8      | FINAL      |
| 8     | F1-F4 + user okay | —      | Post-FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`
- **Wave 2**: 1 task — T4 → `deep`
- **Wave 3**: 2 tasks — T5 → `unspecified-high`, T6 → `quick`
- **Wave 4**: 1 task — T7 → `unspecified-high` (skills: `playwright`)
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (skills: `playwright`), F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Enrich Hostfully lead data with property name

  **What to do**:
  - In `src/lib/hostfully-enrichment.ts`, modify `fetchLeadEnrichment()` to also fetch the property name
  - The function already calls `GET /leads/{leadUid}` and gets the lead response which contains `propertyUid`
  - Extract `propertyUid` from the lead response
  - Make a second HTTP call to the Hostfully properties API (`GET /properties/{propertyUid}`) to resolve the property name
  - Reference `src/worker-tools/hostfully/get-property.ts` for the exact API endpoint URL, headers, and response field that contains the property display name
  - Add a **2-second timeout** to the properties API call — if it fails or times out, return `propertyName: null` (best-effort, never block the notification)
  - Update the `LeadEnrichment` return type's `propertyName` field to be populated (currently hardcoded `null` at line 63)
  - The API key is already passed as a parameter — reuse it for the properties call

  **Must NOT do**:
  - Do NOT change the function signature of `fetchLeadEnrichment` (it already takes `leadUid` and `apiKey`)
  - Do NOT add new exported functions — keep it as a single enrichment call
  - Do NOT let a slow/failed properties API call block or fail the notify-received step
  - Do NOT call shell tools (this runs in the lifecycle process, not the Docker worker)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change, straightforward HTTP call addition with timeout
  - **Skills**: []
    - No special skills needed — standard TypeScript HTTP call

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4 (lifecycle wiring needs enrichment to return property name)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/hostfully-enrichment.ts` — the entire file; the existing `fetchLeadEnrichment()` function that needs modification. Line 63 has the hardcoded `propertyName: null`
  - `src/lib/hostfully-enrichment.ts:fetchLeadEnrichment` — existing pattern for calling Hostfully API with headers and error handling

  **API/Type References**:
  - `src/worker-tools/hostfully/get-property.ts` — the worker tool that calls the Hostfully properties API. Read this to find the exact API endpoint URL format and the response field containing the property name. This file is the ground truth for how to call the properties API
  - `src/lib/hostfully-enrichment.ts:LeadEnrichment` — the return type interface; `propertyName` is already declared but always set to `null`

  **External References**:
  - Hostfully API docs (if needed): the base URL is already in `hostfully-enrichment.ts`

  **WHY Each Reference Matters**:
  - `hostfully-enrichment.ts` — you're modifying this file; understand the existing HTTP call pattern, error handling, and return type
  - `get-property.ts` — contains the exact API endpoint and response parsing for property name; copy the endpoint URL pattern and field name from here

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Property name enrichment succeeds
    Tool: Bash (curl + node)
    Preconditions: VLRE tenant has Hostfully API key in tenant_secrets; lead 37f5f58f-d308-42bf-8ed3-f0c2d70f16fb exists
    Steps:
      1. Read `src/lib/hostfully-enrichment.ts` and verify `propertyName` is no longer hardcoded `null`
      2. Verify the properties API call has a timeout ≤2000ms (check the code for AbortController or timeout option)
      3. Run: `curl -s "https://api.hostfully.com/v2/properties?agencyUid=942d08d9-82bb-4fd3-9091-ca0c6b50b578" -H "X-HOSTFULLY-APIKEY: $HOSTFULLY_API_KEY" | head -c 500` to confirm properties API is accessible
    Expected Result: Code shows a second HTTP call to properties API with 2s timeout; `propertyName` populated from response
    Failure Indicators: `propertyName: null` still hardcoded; no timeout on properties call; function signature changed
    Evidence: .sisyphus/evidence/task-1-enrichment-code-review.md

  Scenario: Property name enrichment fails gracefully
    Tool: Bash (node)
    Preconditions: None
    Steps:
      1. Read the error handling path in the modified `fetchLeadEnrichment`
      2. Verify that when the properties API call fails (network error, timeout, 404), the function returns `propertyName: null` without throwing
      3. Verify no `console.error` or noisy logging on expected failure paths (use logger if available)
    Expected Result: Function returns `{ ..., propertyName: null }` on any properties API failure
    Failure Indicators: Function throws on properties API failure; no try-catch around the properties call
    Evidence: .sisyphus/evidence/task-1-enrichment-fallback.md
  ```

  **Commit**: YES
  - Message: `feat(hostfully): add property name lookup to lead enrichment`
  - Files: `src/lib/hostfully-enrichment.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Build Hostfully link helper, enriched terminal blocks, and context thread blocks

  **What to do**:
  - In `src/lib/slack-blocks.ts`, add the following new functions:

  **A. `buildHostfullyLink(threadUid, leadUid)` helper**:
  - Returns a Hostfully deep-link URL string: `https://platform.hostfully.com/app/#/inbox?threadUid=${threadUid}&leadUid=${leadUid}`
  - Pure function, no side effects
  - Used by all other block builders and the lifecycle

  **B. `buildEnrichedTerminalBlocks(...)` for rich terminal states**:
  - Accepts: `{ status, actorUserId?, guestName?, propertyName?, threadUid?, leadUid?, sentSnippet?, taskId, timestamp? }`
  - Returns Slack blocks for terminal states that preserve full context:
    - For `done`: `✅ *Approved by <@userId>* · Reply sent to {guestName}\n_{propertyName}_` + truncated snippet of what was sent (first 150 chars) + Hostfully link (inline mrkdwn) + task ID context block + Slack `<!date^>` timestamp
    - For `rejected`: `❌ *Rejected by <@userId>* · {guestName}\n_{propertyName}_` + Hostfully link + task ID context block + timestamp
    - For `failed`: `❌ *Task failed* · {guestName}\n_{propertyName}_` + Hostfully link + task ID context block
    - For `expired`: `⏰ *Expired — no action taken* · {guestName}\n_{propertyName}_` + Hostfully link + task ID context block
    - For `delivery_failed`: `❌ *Delivery failed — reply not sent* · {guestName}\n_{propertyName}_` + Hostfully link + task ID context block
  - All fields except `status` and `taskId` are optional — gracefully degrade when data is missing (e.g., omit property line if no propertyName)
  - Use Slack's `<!date^{epoch}^{date_short_pretty} at {time}|${isoFallback}>` for timestamps
  - Reference the VLRE employee's post-action states in `skills/slack-blocks/blocks.ts` for the visual pattern (compact context line + Hostfully link + timestamp)

  **C. `buildContextThreadBlocks(...)` for post-action audit trail**:
  - Accepts: `{ action, actorUserId, guestName?, propertyName?, checkIn?, checkOut?, bookingChannel?, originalMessage, sentResponse?, draftResponse?, editedResponse?, confidence?, category?, threadUid?, leadUid?, taskId }`
  - Returns Slack blocks for a thread reply that preserves the full decision context:
    - Header: `📋 *Message Context* — preserved for reference`
    - Context row: `*Guest:* {name} | *Dates:* {checkIn}–{checkOut} | *Channel:* {bookingChannel}`
    - Original guest message (quoted with `>` prefix)
    - For `approve`: `*📤 Response sent to guest:*` + the sent response quoted
    - For `edit`: `*🤖 Original AI draft:*` + draft quoted, then `*✏️ Edited response (sent):*` + edited version quoted
    - For `reject`: `*🤖 AI suggested response (not sent):*` + draft quoted
    - Footer with Hostfully link + confidence + category (if available)
    - Task ID context block
  - All optional fields gracefully degrade — omit sections when data is missing
  - Reference the VLRE employee's `skills/slack-blocks/context-thread-blocks.ts` for the exact pattern

  **D. Fix `buildSupersededBlocks()` to include task ID**:
  - Add `taskId: string` parameter to the function signature
  - Append a `context` block with `Task \`${taskId}\`` — matching every other terminal state
  - Update BOTH call sites in `employee-lifecycle.ts` (use `lsp_find_references` on `buildSupersededBlocks` to confirm exactly 2)

  **Must NOT do**:
  - Do NOT change existing function signatures in a breaking way (additive only)
  - Do NOT use employee-specific language in function names (no "guest" in function names — these are generic block builders)
  - Do NOT add emoji unless matching the existing patterns
  - Do NOT over-abstract — these are concrete block builders, not a framework

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple related functions in one file requiring careful Slack Block Kit knowledge and consistency with existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4 (lifecycle needs these builders)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/slack-blocks.ts` — the entire file; existing block builder patterns (`buildEnrichedNotifyBlocks`, `buildNotifyStateBlocks`, `buildOverrideCardBlocks`). Follow the same pure-function style, typed params, `unknown[]` return type
  - `src/lib/slack-blocks.ts:buildSupersededBlocks` — the function to modify (currently returns only a section block, no context block)

  **API/Type References**:
  - Slack Block Kit reference: `section`, `context`, `divider` block types; `mrkdwn` text type
  - Slack date formatting: `<!date^{epoch}^{date_short_pretty} at {time}|{fallback}>` — epoch is Unix seconds

  **Test References**:
  - Existing tests in `tests/` that test block builders (if any) — follow the same assertion pattern

  **External References**(VLRE employee — the reference implementation to mirror):
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/blocks.ts` — `buildApprovedBlocks`, `buildRejectedBlocks`, `buildEditedBlocks`, `buildSupersededBlocks` — the exact visual patterns for terminal states (compact context line + Hostfully link + actor + timestamp)
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/context-thread-blocks.ts` — `buildContextThreadBlocks` — the exact pattern for post-action thread replies (preserved message context, original vs edited, action attribution)

  **WHY Each Reference Matters**:
  - `slack-blocks.ts` — you're adding to this file; match existing patterns exactly (return type, param style, block structure)
  - VLRE `blocks.ts` — the proven UX pattern for terminal states; copy the visual structure (compact context + link + timestamp), adapt to the ai-employee's block conventions
  - VLRE `context-thread-blocks.ts` — the proven pattern for audit trail thread replies; copy the information hierarchy, adapt field names to match `deliverables.metadata` shape

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hostfully link helper generates correct URL
    Tool: Bash (node -e)
    Preconditions: None
    Steps:
      1. Import `buildHostfullyLink` from the modified slack-blocks.ts
      2. Call with test data: buildHostfullyLink('2f18249a-9523-4acd-a512-20ff06d5c3fa', '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb')
      3. Assert result equals 'https://platform.hostfully.com/app/#/inbox?threadUid=2f18249a-9523-4acd-a512-20ff06d5c3fa&leadUid=37f5f58f-d308-42bf-8ed3-f0c2d70f16fb'
    Expected Result: URL matches exactly with both UIDs interpolated
    Failure Indicators: Missing query params, wrong base URL, encoded characters
    Evidence: .sisyphus/evidence/task-2-hostfully-link.md

  Scenario: Enriched terminal blocks include actor and context
    Tool: Bash (node -e)
    Preconditions: None
    Steps:
      1. Import `buildEnrichedTerminalBlocks` from slack-blocks.ts
      2. Call with: { status: 'done', actorUserId: 'U05V0CTJLF6', guestName: 'Tiffany White', propertyName: 'Ocean View Suite', threadUid: '2f18249a', leadUid: '37f5f58f', sentSnippet: 'Hi Tiffany, the door code is 4829.', taskId: 'test-123' }
      3. Assert output blocks contain: '<@U05V0CTJLF6>' (actor), 'Tiffany White' (guest), 'Ocean View Suite' (property), 'hostfully.com' (link), '<!date^' (Slack date format), 'test-123' (task ID)
    Expected Result: All 6 data points present in the block structure
    Failure Indicators: Missing actor, missing property, ISO timestamp instead of <!date^, no Hostfully link
    Evidence: .sisyphus/evidence/task-2-terminal-blocks.md

  Scenario: Enriched terminal blocks degrade gracefully with missing data
    Tool: Bash (node -e)
    Preconditions: None
    Steps:
      1. Call `buildEnrichedTerminalBlocks` with only required fields: { status: 'failed', taskId: 'test-456' }
      2. Assert output blocks still render (no crashes)
      3. Assert task ID context block is present
      4. Assert no undefined/null text in rendered blocks
    Expected Result: Blocks render with only status + task ID; no crashes, no "undefined" text
    Failure Indicators: TypeError on missing fields, "undefined" appearing in block text
    Evidence: .sisyphus/evidence/task-2-terminal-graceful.md

  Scenario: Context thread blocks include full audit trail for approve action
    Tool: Bash (node -e)
    Preconditions: None
    Steps:
      1. Import `buildContextThreadBlocks`
      2. Call with approve action: { action: 'approve', actorUserId: 'U05V0CTJLF6', guestName: 'Tiffany White', propertyName: 'Ocean View Suite', originalMessage: 'What is the door code?', sentResponse: 'Hi Tiffany, the door code is 4829.', taskId: 'test-789' }
      3. Assert blocks contain: the original message quoted (with >), the sent response quoted, actor mention, Hostfully link
    Expected Result: Thread reply blocks contain original message, sent response, actor, and link
    Failure Indicators: Missing original message, missing sent response, no quoting with >
    Evidence: .sisyphus/evidence/task-2-context-thread-approve.md

  Scenario: Superseded blocks now include task ID
    Tool: Bash (node -e)
    Preconditions: None
    Steps:
      1. Import `buildSupersededBlocks`
      2. Call with taskId: buildSupersededBlocks('test-superseded-123')
      3. Assert output includes a context block with text containing 'test-superseded-123'
    Expected Result: Context block with task ID present (was previously missing)
    Failure Indicators: No context block in output, only section block returned
    Evidence: .sisyphus/evidence/task-2-superseded-taskid.md
  ```

  **Commit**: YES
  - Message: `feat(slack): add enriched block builders, Hostfully link helper, and context thread blocks`
  - Files: `src/lib/slack-blocks.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Add lead status and Hostfully deep-link button to approval card

  **What to do**:
  - In `src/worker-tools/slack/post-guest-approval.ts`:

  **A. Add `--lead-status` CLI argument**:
  - Accept a new optional `--lead-status` string arg (values: `BOOKED`, `INQUIRY`, `CLOSED`, `NEW`, etc.)
  - Display in the fields section of the approval card alongside existing fields (Guest, Property, Check-in, Check-out, Booking Channel)
  - Format: `*Status:* 📗 BOOKED` / `📙 INQUIRY` / `📕 CLOSED` / `📘 NEW` (emoji prefix by status)
  - If not provided, omit the field (don't show "Status: Unknown")

  **B. Add Hostfully deep-link as URL button**:
  - Add a `url` type button to the actions row: `{ type: 'button', text: { type: 'plain_text', text: '🔗 View in Hostfully', emoji: true }, url: 'https://platform.hostfully.com/app/#/inbox?threadUid=${threadUid}&leadUid=${leadUid}', action_id: 'view_in_hostfully' }`
  - `threadUid` and `leadUid` are already accepted as CLI args (`--thread-uid`, `--lead-uid`)
  - Place the Hostfully button AFTER the Reject button in the actions row
  - URL buttons open in the browser — no action handler needed

  **C. Include `lead_status` in the output JSON**:
  - Add `lead_status` to the JSON written to `/tmp/approval-message.json` (additive — don't remove/rename existing fields)
  - This makes it available in `deliverables.metadata` for the lifecycle

  **Must NOT do**:
  - Do NOT remove or rename any existing CLI args or output JSON fields
  - Do NOT change the block structure of existing sections (header, fields, original message, proposed response, confidence, etc.)
  - Do NOT add more than one new button to the actions row

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, adding 2 features (CLI arg + button) with clear patterns already in the file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6 (Docker rebuild depends on this completing)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-guest-approval.ts` — the entire file; existing CLI arg parsing pattern (lines ~80-130), existing fields section (lines ~180-210), existing actions row (lines ~250-270), output JSON structure (lines ~366-387)
  - `src/worker-tools/slack/post-guest-approval.ts:buildGuestApprovalBlocks` — the function that constructs the approval card blocks

  **API/Type References**:
  - Slack Block Kit `url` button: `{ type: 'button', text: { type: 'plain_text', text: '...' }, url: '...', action_id: '...' }` — opens URL in browser, no server-side handler
  - `src/worker-tools/hostfully/get-messages.ts:ThreadSummary` — shows that `leadStatus` is available in the worker's data

  **External References** (VLRE employee):
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/blocks.ts` — the `🔗 View in Hostfully` button pattern and how it's placed in the actions row after other buttons

  **WHY Each Reference Matters**:
  - `post-guest-approval.ts` — you're modifying this file; understand CLI arg parsing, block construction, and output JSON shape
  - VLRE `blocks.ts` — the exact button placement pattern to follow (Hostfully link button after action buttons)
  - `get-messages.ts` — confirms `leadStatus` is available to the model, which passes it as `--lead-status` arg

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Approval card includes Hostfully link button
    Tool: Bash (grep + read)
    Preconditions: None
    Steps:
      1. Read `src/worker-tools/slack/post-guest-approval.ts`
      2. Search for 'view_in_hostfully' action_id
      3. Verify the button has `url` property (not `value`) — confirming it's a URL button
      4. Verify the URL contains 'platform.hostfully.com/app/#/inbox'
      5. Verify it uses `threadUid` and `leadUid` variables for the query params
    Expected Result: URL button present with correct Hostfully deep-link format
    Failure Indicators: No button found, button uses `value` instead of `url`, wrong URL format
    Evidence: .sisyphus/evidence/task-3-hostfully-button.md

  Scenario: Lead status field shown in approval card
    Tool: Bash (grep + read)
    Preconditions: None
    Steps:
      1. Read the CLI arg parsing section — verify `--lead-status` is accepted
      2. Read the fields section in `buildGuestApprovalBlocks` — verify lead status field is conditionally included
      3. Verify the field is NOT shown when `--lead-status` is not provided (graceful omission)
    Expected Result: Lead status appears as a field in the approval card when provided, omitted when not
    Failure Indicators: "Status: undefined" shown when arg missing, field not present at all
    Evidence: .sisyphus/evidence/task-3-lead-status.md

  Scenario: Output JSON includes lead_status
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Read the output JSON section (around line 366-387)
      2. Verify `lead_status` is included in the JSON written to `/tmp/approval-message.json`
      3. Verify existing fields are unchanged (no removals or renames)
    Expected Result: `lead_status` field added to output JSON; all existing fields preserved
    Failure Indicators: Missing from output JSON, existing field removed or renamed
    Evidence: .sisyphus/evidence/task-3-output-json.md
  ```

  **Commit**: YES
  - Message: `feat(slack): add lead status and Hostfully deep-link to guest approval card`
  - Files: `src/worker-tools/slack/post-guest-approval.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Wire all Slack UX improvements into the lifecycle

  **What to do**:
  Modify `src/inngest/employee-lifecycle.ts` to use the new block builders and fix existing bugs. This task covers P1, P3, P4, P5, P6, and P10.

  **CRITICAL CONSTRAINT**: This file is shared across ALL employees (summarizer, guest-messaging, future employees). Every change MUST be gated on metadata field existence, NEVER on `archetype.role_name`. This is non-negotiable.

  **A. Fix expiry text copy-paste bug (P5)**:
  - Find the text `'⏰ Daily summary expired — no action taken.'` (around line 1373)
  - Replace with a generic `'⏰ Expired — no action taken.'` that works for ALL employees
  - Do the same for the approval card expiry update — also change to generic text
  - Verify there are no other occurrences of "Daily summary" in terminal state messages

  **B. Replace ISO timestamps with Slack-native dates (P6)**:
  - Find `Delivered at ${new Date().toISOString()}` (around line 1705)
  - Replace with Slack date format: `` `Delivered <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>` ``
  - The ISO string becomes the fallback text (shown in notifications/email where Slack formatting doesn't render)

  **C. Use enriched terminal state blocks for both Message A and Message B (P3)**:
  - **Message A (notify-received updates)**: Replace the bare `buildNotifyStateBlocks` calls at terminal states with `buildEnrichedTerminalBlocks` from Task 2
  - Gate on metadata existence: `if (deliverable?.metadata?.guest_name)` → use enriched blocks; else → use existing bare blocks (fallback for summarizer and other employees)
  - Pass all available data from `deliverable.metadata`: `guest_name`, `property_name`, `lead_uid`, `thread_uid`, `original_message`, `draft_response`, `check_in`, `check_out`, `booking_channel`
  - **Message B (approval card updates)**: Same pattern — replace bare blocks with enriched terminal blocks when metadata is available
  - The "Approved by @X" state must NOT be overwritten by "Delivered" — instead, the final delivered state should INCLUDE the actor: `✅ Approved by <@userId> · Delivered {slack_date}`
  - Specifically: the `done` terminal state on the approval card (currently `"✅ Delivered at {ISO}"`) should become the enriched version with actor + human timestamp + snippet

  **D. Post context thread reply after approve/reject/edit (P4)**:
  - After the approval card is updated to its terminal state, post a new thread reply using `buildContextThreadBlocks` from Task 2
  - Thread reply goes to the same thread as the approval card (use `approval_message_ts` as `thread_ts`)
  - Gate on `deliverable?.metadata?.original_message` existing — only guest-messaging tasks have this field; summarizer tasks won't trigger this
  - For approve: pass `action: 'approve'`, `sentResponse: deliverable.metadata.draft_response` (or `approvalEvent.data.editedResponse` if edited)
  - For edit: pass `action: 'edit'`, `draftResponse: deliverable.metadata.draft_response`, `editedResponse: approvalEvent.data.editedResponse`
  - For reject: pass `action: 'reject'`, `draftResponse: deliverable.metadata.draft_response`
  - **CRITICAL**: This is a NEW `postMessage` call (thread reply), NOT an update to the approval card. It preserves the audit trail.
  - Consider whether to add this as a new Inngest step or within the existing `handle-approval-result` step. If adding a new step, use a descriptive name like `'post-context-thread'` — step names are immutable once deployed.

  **E. Include Hostfully link in notify-received terminal states (P1)**:
  - When building terminal state blocks for Message A, include a Hostfully deep-link if `deliverable.metadata.thread_uid` and `deliverable.metadata.lead_uid` are available
  - Use `buildHostfullyLink()` from Task 2 to generate the URL
  - Include as an inline mrkdwn link in the context or section block

  **F. Enable `reply_broadcast` for all guest approval cards (P10)**:
  - In the section where `REPLY_BROADCAST` env var is set for the worker machine, change from conditional (`only when superseded_notify_ts exists`) to always `'true'` when the task has guest-messaging metadata
  - Gate on `raw_event.thread_uid` existence (guest-messaging tasks have this; summarizer tasks don't)
  - This ensures approval cards are visible in the channel feed without expanding the thread

  **Must NOT do**:
  - Do NOT rename any existing Inngest step (step names are immutable idempotency keys)
  - Do NOT use `archetype.role_name` to gate behavior — use metadata field existence
  - Do NOT break the summarizer's approval/expiry flow — test both paths
  - Do NOT remove the existing `buildNotifyStateBlocks` calls — keep them as the fallback path
  - Do NOT add employee-specific language to log messages or comments (no "guest", "hostfully", "property" in shared code logs)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex file with 1500+ lines, multiple interleaved concerns, Inngest step semantics, and a shared-file constraint requiring careful gating logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — depends on Wave 1)
  - **Blocks**: Tasks 5, 7 (tests and E2E depend on lifecycle being wired)
  - **Blocked By**: Tasks 1, 2 (needs enrichment fix + new block builders)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts` — the entire file; specifically:
    - `notify-received` step (~line 216) — where enrichment is called and initial Slack message is posted
    - `update-notify-reviewing` step (~line 1281) — where notify-received is updated to "Awaiting approval"
    - `handle-approval-result` step (~line 1363) — the massive approval/rejection handler where most changes go
    - `mark-failed` step — where failure terminal state is set
    - Lines 622, 646 — where `REPLY_BROADCAST` env var is set for the worker (currently only for superseded tasks)
  - `src/inngest/employee-lifecycle.ts:1373` — the `'⏰ Daily summary expired'` copy-paste bug location
  - `src/inngest/employee-lifecycle.ts:1705` — the `Delivered at ${new Date().toISOString()}` ISO timestamp location
  - `src/inngest/employee-lifecycle.ts:1540-1543` — the approve terminal state blocks (bare `✅ Approved by @X`)
  - `src/inngest/employee-lifecycle.ts:1708-1711` — the delivered terminal state blocks (bare `✅ Delivered at {ISO}`)
  - `src/inngest/employee-lifecycle.ts:1854-1857` — the rejected terminal state blocks (bare `❌ Rejected by @X`)

  **API/Type References**:
  - `src/lib/slack-blocks.ts` — the new functions from Task 2: `buildEnrichedTerminalBlocks`, `buildContextThreadBlocks`, `buildHostfullyLink`, updated `buildSupersededBlocks`
  - `src/lib/hostfully-enrichment.ts` — the updated `fetchLeadEnrichment` from Task 1 (now returns `propertyName`)
  - Slack API `chat.postMessage` with `thread_ts` — for posting context thread replies

  **WHY Each Reference Matters**:
  - The lifecycle line references are exact locations of the bugs and bare blocks you need to modify
  - The block builders from Task 2 are what you'll call instead of inline block arrays
  - Understanding the gating pattern (metadata existence) is critical for not breaking the summarizer

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Expiry text no longer says "Daily summary"
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "Daily summary" src/inngest/employee-lifecycle.ts
      2. Assert zero matches
    Expected Result: No occurrence of "Daily summary" in the lifecycle
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-4-expiry-text.md

  Scenario: ISO timestamp replaced with Slack date format
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "toISOString" src/inngest/employee-lifecycle.ts
      2. Check that the "Delivered" terminal state uses <!date^ format, not raw ISO
      3. The ISO string may still appear as the FALLBACK text inside <!date^...| — that's correct
    Expected Result: "Delivered" text uses <!date^ format; ISO only appears as fallback
    Failure Indicators: Raw ISO string is the primary display text (not inside <!date^)
    Evidence: .sisyphus/evidence/task-4-timestamp-format.md

  Scenario: Terminal states include enriched context when metadata available
    Tool: Bash (grep + read)
    Preconditions: None
    Steps:
      1. Search for `buildEnrichedTerminalBlocks` in the lifecycle file
      2. Verify it's called with data from `deliverable.metadata` (guest_name, property_name, etc.)
      3. Verify the call is gated on `deliverable?.metadata?.guest_name` (not role_name)
      4. Verify the fallback path still uses `buildNotifyStateBlocks` for non-guest-messaging tasks
    Expected Result: Enriched blocks used when metadata available, bare blocks as fallback
    Failure Indicators: Gated on role_name, no fallback path, bare blocks completely removed
    Evidence: .sisyphus/evidence/task-4-enriched-terminals.md

  Scenario: Context thread reply posted after approval
    Tool: Bash (grep + read)
    Preconditions: None
    Steps:
      1. Search for `buildContextThreadBlocks` in the lifecycle file
      2. Verify it's called after the approval card is updated to terminal state
      3. Verify it uses `thread_ts` pointing to the approval card's ts
      4. Verify it's gated on `deliverable?.metadata?.original_message` (not role_name)
      5. Verify it includes the sent response content
    Expected Result: Context thread reply is posted after approve/reject/edit with full audit data
    Failure Indicators: No thread reply posted, gated on role_name, missing sent response
    Evidence: .sisyphus/evidence/task-4-context-thread.md

  Scenario: reply_broadcast enabled for guest messaging tasks
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Search for REPLY_BROADCAST in the lifecycle
      2. Verify it's set to 'true' when raw_event has thread_uid (not just for superseded tasks)
    Expected Result: REPLY_BROADCAST='true' for all tasks with thread_uid in raw_event
    Failure Indicators: Still only set for superseded tasks
    Evidence: .sisyphus/evidence/task-4-reply-broadcast.md

  Scenario: Employee-agnostic constraint respected
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -n "role_name.*guest" src/inngest/employee-lifecycle.ts (case-insensitive)
      2. Run: grep -n "'guest-messaging'" src/inngest/employee-lifecycle.ts
      3. Assert zero matches for both
    Expected Result: No hardcoded references to 'guest-messaging' role name in the lifecycle
    Failure Indicators: Any role_name-based conditional found
    Evidence: .sisyphus/evidence/task-4-employee-agnostic.md
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): wire enriched Slack UX — rich terminals, thread replies, timestamp fix`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Unit tests for enrichment, block builders, and lifecycle changes

  **What to do**:
  - Write Vitest unit tests covering the new and modified functions from Tasks 1, 2, and 4

  **A. Tests for `hostfully-enrichment.ts`**:
  - Test `fetchLeadEnrichment` returns property name when properties API succeeds
  - Test `fetchLeadEnrichment` returns `propertyName: null` when properties API fails (network error)
  - Test `fetchLeadEnrichment` returns `propertyName: null` when properties API times out (>2s)
  - Mock the HTTP calls (don't hit real Hostfully API in tests)

  **B. Tests for `slack-blocks.ts` new functions**:
  - Test `buildHostfullyLink` returns correct URL format with interpolated UIDs
  - Test `buildEnrichedTerminalBlocks` for each status: `done`, `rejected`, `failed`, `expired`, `delivery_failed`
  - Test `buildEnrichedTerminalBlocks` with all fields provided → all data points present in output
  - Test `buildEnrichedTerminalBlocks` with minimal fields → graceful degradation, no undefined text
  - Test `buildEnrichedTerminalBlocks` uses `<!date^` format (not ISO)
  - Test `buildContextThreadBlocks` for each action: `approve`, `edit`, `reject`
  - Test `buildContextThreadBlocks` includes original message quoted with `>`
  - Test `buildContextThreadBlocks` for edit action includes both original draft and edited version
  - Test updated `buildSupersededBlocks` includes task ID context block

  **C. Tests for lifecycle changes** (if testable without full Inngest):
  - Test that the expiry text no longer contains "Daily summary"
  - Test that the gating logic uses metadata fields, not role_name (code review assertion)

  **Must NOT do**:
  - Do NOT hit real external APIs (Hostfully, Slack) in unit tests
  - Do NOT modify production code — tests only
  - Do NOT break existing passing tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files covering different modules, requires understanding of both the implementation and test patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 7 (E2E requires tests passing)
  - **Blocked By**: Tasks 1, 2, 4 (must test the implemented code)

  **References**:

  **Pattern References**:
  - `tests/` directory — existing test file patterns, import conventions, mock setup
  - Vitest docs — `describe`, `it`, `expect`, `vi.fn()`, `vi.mock()` patterns

  **API/Type References**:
  - `src/lib/slack-blocks.ts` — the functions being tested (from Task 2)
  - `src/lib/hostfully-enrichment.ts` — the enrichment function being tested (from Task 1)

  **WHY Each Reference Matters**:
  - Existing tests show the project's test conventions (file naming, describe structure, assertion style)
  - The source files define the exact function signatures and expected behavior

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: Tasks 1, 2, 4 completed
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0
      3. Count new test files created
    Expected Result: All tests pass, including new tests; no regressions in existing tests
    Failure Indicators: Any test failure, exit code non-zero
    Evidence: .sisyphus/evidence/task-5-test-results.txt

  Scenario: No existing tests broken
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Compare total test count to baseline (515+ tests)
      3. Assert no regression — existing test count stable or higher
    Expected Result: Total test count ≥ baseline + new tests added
    Failure Indicators: Fewer passing tests than baseline
    Evidence: .sisyphus/evidence/task-5-no-regressions.txt
  ```

  **Commit**: YES
  - Message: `test(slack): add unit tests for block builders, enrichment, and lifecycle Slack changes`
  - Files: `tests/slack-blocks.test.ts`, `tests/hostfully-enrichment.test.ts` (or wherever tests belong per project convention)
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Docker image rebuild

  **What to do**:
  - Rebuild the Docker image to include the `post-guest-approval.ts` changes from Task 3
  - The worker container at `/tools/slack/post-guest-approval.ts` must reflect the new `--lead-status` arg and Hostfully link button
  - Run: `docker build -t ai-employee-worker:latest .`
  - Verify the build succeeds

  **Must NOT do**:
  - Do NOT push the image to any registry — local only
  - Do NOT modify the Dockerfile

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: Task 7 (E2E requires updated Docker image)
  - **Blocked By**: Task 3 (worker tool changes must be in place)

  **References**:

  **Pattern References**:
  - `Dockerfile` — the build configuration
  - AGENTS.md "CRITICAL — Rebuild after every worker change" section

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker build succeeds
    Tool: Bash (docker)
    Preconditions: Task 3 completed
    Steps:
      1. Run: docker build -t ai-employee-worker:latest .
      2. Assert exit code 0
      3. Run: docker run --rm ai-employee-worker:latest cat /tools/slack/post-guest-approval.ts | grep -c "lead-status"
      4. Assert count ≥ 1 (the new arg is present in the container)
    Expected Result: Build succeeds; new code present in container at /tools/slack/
    Failure Indicators: Build failure, missing file in container
    Evidence: .sisyphus/evidence/task-6-docker-build.txt
  ```

  **Commit**: NO (Docker build, no code changes to commit)

- [x] 7. Full E2E browser validation

  **What to do**:
  Walk the FULL trigger-to-delivery flow in real browsers to validate every Slack UX improvement. This is the definitive validation that the user explicitly requested.

  **Prerequisites**:
  - All implementation tasks (1-4) complete
  - Docker image rebuilt (Task 6)
  - Development services running (`pnpm dev`)

  **E2E Flow to Execute**:
  1. **Trigger**: Send a new message as Olivia from the Airbnb test account
     - Navigate to `https://www.airbnb.com/guest/messages/2525238359`
     - Type a test message (e.g., "Hi, what is the door code for the property?")
     - Send it

  2. **Verify notify-received (Message A)**:
     - Navigate to Slack `#cs-guest-communication` channel (`https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`)
     - Wait for new message from Papi Chulo
     - **Assert**: Message shows `⏳ Processing reply for {guestName}` with property name, dates, booking channel, message snippet
     - **Assert**: Property name is NOT null/blank (P2, P7 fix verified)
     - Screenshot the message

  3. **Verify approval card (Message B)**:
     - Expand the thread (click "1 reply" or "View thread")
     - **Assert**: Approval card is also visible in the channel (reply_broadcast — P10)
     - **Assert**: Card shows Guest, Property, Check-in, Check-out, Booking Channel, AND lead status (P8)
     - **Assert**: Card has `🔗 View in Hostfully` URL button (P1)
     - **Assert**: Hostfully link URL contains the correct thread_uid and lead_uid
     - Click the Hostfully link — verify it opens the correct Hostfully thread
     - Screenshot the approval card

  4. **Approve the message**:
     - Click "Approve & Send" button on the approval card
     - Wait for the card to update

  5. **Verify terminal states (P3, P6)**:
     - **Assert**: Approval card shows `✅ Approved by <@userId> · Delivered {human_date}` — NOT raw ISO
     - **Assert**: Approval card includes guest name, property name, Hostfully link, snippet of what was sent
     - **Assert**: Top-level message (Message A) shows `✅ Reply sent to {guestName}` with property context
     - Screenshot both messages

  6. **Verify context thread reply (P4)**:
     - **Assert**: A new thread reply appeared after the terminal state update
     - **Assert**: Thread reply contains original guest message (quoted), sent response (quoted), actor mention, Hostfully link
     - Screenshot the thread reply

  7. **Verify delivery**:
     - Navigate back to Airbnb thread (`https://www.airbnb.com/guest/messages/2525238359`)
     - **Assert**: Reply from host ("Leo") appeared in the thread
     - Screenshot the Airbnb reply

  8. **Test edge case — superseded card (P9)**:
     - Send two messages rapidly from the Airbnb account
     - Wait for both tasks to be created
     - **Assert**: The first approval card is updated to "⏭️ Superseded" with task ID context block
     - Screenshot the superseded card

  **Must NOT do**:
  - Do NOT use mock data — all real services (Airbnb, Hostfully, Slack, Inngest)
  - Do NOT skip the Hostfully link click verification
  - Do NOT accept "it looks right" — assert specific text content using browser snapshot or network inspection

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex multi-service E2E validation requiring browser automation across Airbnb, Slack, and Hostfully
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential — depends on everything)
  - **Blocks**: F1-F4 (final verification depends on E2E passing)
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - AGENTS.md "E2E Testing with Playwright Browser" section — full setup for Airbnb and Slack browser testing
  - AGENTS.md "Verified E2E flow" table — the 12-step flow showing what happens at each stage
  - AGENTS.md "Hostfully Testing" section — test thread and property UIDs

  **Test Data**:
  - Airbnb thread: `https://www.airbnb.com/guest/messages/2525238359`
  - Slack channel: `C0AMGJQN05S` (`#cs-guest-communication`)
  - Hostfully thread UID: `aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`
  - Hostfully lead UID: `29a64abd-d02c-44bc-8d5c-47df58a7ab14`
  - Property UID: `562695df-6a4f-40d6-990d-56fe043aa9e8`
  - Guest: Olivia (test account)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full happy-path E2E — message to delivery
    Tool: Playwright (browser)
    Preconditions: Dev services running (pnpm dev), Docker image rebuilt
    Steps:
      1. Navigate to https://www.airbnb.com/guest/messages/2525238359
      2. Type "Hi, what is the door code?" in the message textbox
      3. Send the message
      4. Navigate to Slack #cs-guest-communication
      5. Wait for Papi Chulo message (up to 120s)
      6. Assert top-level message contains property name (not null/blank)
      7. Expand thread — assert approval card shows lead status, Hostfully button
      8. Click Approve & Send
      9. Wait for terminal state update (up to 60s)
      10. Assert terminal state shows actor, human timestamp, property, Hostfully link
      11. Assert context thread reply posted with original message + sent response
      12. Navigate to Airbnb thread — assert host reply appeared
    Expected Result: All 12 assertions pass; complete audit trail visible in Slack
    Failure Indicators: Missing property name, raw ISO timestamp, no thread reply, no Hostfully link
    Evidence: .sisyphus/evidence/task-7-e2e-happy-path/ (multiple screenshots)

  Scenario: Superseded card includes task ID
    Tool: Playwright (browser)
    Preconditions: E2E services running
    Steps:
      1. Send message from Airbnb test account
      2. Wait 10 seconds
      3. Send another message from Airbnb test account
      4. Wait for second task to process
      5. Check first approval card — assert updated to superseded state with task ID
    Expected Result: Superseded card shows "⏭️ Superseded" with task ID context block
    Failure Indicators: No task ID on superseded card, card not updated
    Evidence: .sisyphus/evidence/task-7-e2e-superseded.png
  ```

  **Commit**: NO (validation only, no code changes)

- [x] 8. Notify completion

  **What to do**:
  - Send Telegram notification that plan `guest-messaging-slack-ux` is complete, all tasks done
  - Run: `tsx scripts/telegram-notify.ts "✅ guest-messaging-slack-ux complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: F1-F4 + user okay

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check Slack blocks). For each "Must NOT Have": search codebase for forbidden patterns (employee-specific language in shared files, renamed Inngest steps). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no employee-specific language in `employee-lifecycle.ts` (search for "guest", "hostfully", "property" in log messages/comments in shared code).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (enriched notify-received → approval card → approve → thread reply → terminal states). Test edge cases: webhook without `message_content`, property API timeout, rapid duplicate messages. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log`/`diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message                                                                                      | Files                                                              | Pre-commit           |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| 1          | `feat(hostfully): add property name lookup to lead enrichment`                               | `src/lib/hostfully-enrichment.ts`                                  | `pnpm build`         |
| 2          | `feat(slack): add enriched block builders, Hostfully link helper, and context thread blocks` | `src/lib/slack-blocks.ts`                                          | `pnpm build`         |
| 3          | `feat(slack): add lead status and Hostfully deep-link to guest approval card`                | `src/worker-tools/slack/post-guest-approval.ts`                    | `pnpm build`         |
| 4          | `feat(lifecycle): wire enriched Slack UX — rich terminals, thread replies, timestamp fix`    | `src/inngest/employee-lifecycle.ts`                                | `pnpm build`         |
| 5          | `test(slack): add unit tests for block builders, enrichment, and lifecycle Slack changes`    | `tests/slack-blocks.test.ts`, `tests/hostfully-enrichment.test.ts` | `pnpm test -- --run` |
| 6          | N/A (Docker rebuild, no commit)                                                              | —                                                                  | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: no errors
pnpm test -- --run  # Expected: all tests pass including new ones
pnpm lint           # Expected: no lint errors
```

### Final Checklist

- [x] All "Must Have" present — Hostfully links, property name, actor attribution, thread replies, timestamps
- [x] All "Must NOT Have" absent — no employee-specific language in shared files, no step renames, no output shape breaks
- [x] All tests pass (existing + new)
- [x] Full E2E validated: Airbnb → Slack → Approve → Delivery → all messages show enriched context
- [x] Docker image rebuilt with approval card changes
- [x] Telegram notification sent on completion
