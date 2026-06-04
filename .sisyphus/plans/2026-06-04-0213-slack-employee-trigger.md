# Slack @Mention Employee Triggering

## TL;DR

> **Quick Summary**: Enable customers to trigger AI employees by @mentioning the Slack bot in a channel. Uses a hybrid approach — fast path for channels with one assigned employee, LLM routing when ambiguous, confirmation always shown, threaded input collection for missing required inputs.
>
> **Deliverables**:
>
> - New `employee/slack-trigger-handler` Inngest function consuming `employee/task.requested`
> - Block Kit confirmation card + action handlers in Slack Bolt
> - Threaded input collection flow for employees with `input_schema` items
> - LLM routing prompt for multi-employee channel disambiguation
> - Fix for the stub ack message in the interaction handler
> - Fix for `resolveArchetypeFromChannel` silent fallback behavior
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (action IDs) → Task 3 (fix resolveArchetypeFromChannel) → Task 6 (Inngest handler) → Task 8 (input collection) → Task 10 (integration test)

---

## Context

### Original Request

Allow customers to trigger AI employees via Slack by @mentioning the bot in a channel. The system should map the channel to the employee(s) assigned to it, use the platform default LLM (DeepSeek Flash) for disambiguation when multiple employees share a channel, show a confirmation before triggering, and collect any missing required inputs via threaded follow-up messages.

### Interview Summary

**Key Discussions**:

- **Core approach**: Option C — Hybrid (channel-aware with smart fallback). Fast path when channel has exactly 1 employee; LLM routing only when 2+ employees share a channel.
- **Channel mapping**: Keep `notification_channel` as-is (1 employee per channel). No schema changes for channel mapping.
- **Unassigned channels**: Politely decline — "No employee is assigned to this channel." Admin must configure via dashboard.
- **Input collection**: Threaded follow-up messages (no Slack modals). Bot asks for each missing required input as a plain text question.
- **Confirmation**: Always mandatory. No skip option for v1.
- **DMs**: Out of scope for v1 (channels only).
- **Task status in thread**: Only "confirmation buttons" + "Task started." Done/Failed uses existing notification channel behavior.
- **Dedup**: No dedup — confirmation prevents duplicates naturally.
- **Tests**: Tests-after implementation + Agent-Executed QA.

**Research Findings**:

- The `app_mention` handler already exists at `src/gateway/slack/handlers.ts:240` and fires `employee/interaction.received`
- The interaction handler already classifies intent as `task` and emits `employee/task.requested` — but NO handler consumes it (stub)
- `resolveArchetypeFromChannel()` exists but silently falls back to oldest active archetype for unassigned channels — must be fixed
- The stub ack at `interaction-handler.ts:398` posts "Got it! I'll work on that." before the confirmation card — must be suppressed
- `dispatchEmployee()` takes a `slug` (role_name), not `archetypeId` — need to check `createTaskAndDispatch()` as alternative
- `callLLM()` reads `gateway_llm_model` from platform settings (default: `deepseek/deepseek-v4-flash`)
- `input_schema` on archetypes defines required inputs; `InputSchemaSchema` Zod validator exists
- Slack `app_mention` must ack() within 3 seconds; Block Kit buttons are the right UX for in-thread confirmations

### Metis Review

**Identified Gaps** (addressed):

- `resolveArchetypeFromChannel` silent fallback to oldest archetype — will be fixed to return `isExactMatch` flag
- Stub ack "Got it! I'll work on that." fires for task intent before confirmation card — will be suppressed
- `dispatchEmployee` takes slug not archetypeId — will check `createTaskAndDispatch` for archetypeId-based dispatch
- Bot self-mention loop risk — will guard `if (mention.user === botUserId) return`
- Mentions in existing task threads — will check `taskId` presence and skip dispatch
- Confirmation card context reconstruction on button click — will store context in button `value` as JSON
- Employee display name for confirmation card — will prettify `role_name` slug since no `display_name` field exists
- Pending confirmation timeout — documented as known v1 limitation (no cleanup mechanism)
- Input collection user-scoping — accept replies from any user in thread (team collaboration)
- LLM routing context budget — use `role_name` + first 200 chars of `identity` for cost efficiency

---

## Work Objectives

### Core Objective

Enable Slack @mention triggering of AI employees with a hybrid channel-based routing approach, confirmation flow, and threaded input collection.

### Concrete Deliverables

- `src/inngest/slack-trigger-handler.ts` — new Inngest function handling `employee/task.requested`
- Updated `src/lib/slack-action-ids.ts` — new `TRIGGER_CONFIRM` and `TRIGGER_CANCEL` constants
- Updated `src/gateway/slack/handlers.ts` — new button action handlers for confirmation
- Updated `src/gateway/services/interaction-classifier.ts` — `resolveArchetypeFromChannel` returns `isExactMatch`
- Updated `src/inngest/interaction-handler.ts` — suppressed stub ack for `task` intent
- LLM routing prompt for multi-employee disambiguation
- Unit tests for new Inngest function and routing logic

### Definition of Done

- [ ] @mention in a channel with 1 assigned employee → confirmation card appears in thread → confirm → task dispatched → "Task started" reply
- [ ] @mention in a channel with 0 assigned employees → polite decline message in thread
- [ ] @mention in a channel with 2+ assigned employees → LLM picks best match → confirmation card → confirm → task dispatched
- [ ] Employee with required `input_schema` items → after confirm, bot asks for missing inputs in thread → user replies → task dispatched with inputs
- [ ] Cancel button → "Cancelled" message, no task created
- [ ] Existing thread reply and @mention feedback flows still work (no regression)

### Must Have

- Confirmation card with Block Kit buttons before every dispatch
- Threaded follow-up for missing required inputs
- "Politely decline" for unassigned channels (no silent fallback)
- Bot self-mention guard
- Existing task thread detection (don't dispatch new task from task thread @mentions)
- All new action IDs in `src/lib/slack-action-ids.ts` constants
- New Inngest function registered in gateway serve list
- Tests for the new Inngest function
- `chat.update` to replace buttons after click (prevent double-clicks)

### Must NOT Have (Guardrails)

- Do NOT add DM support — channels only for v1
- Do NOT modify `resolveArchetypeFromTask` — thread-reply path depends on it
- Do NOT change existing `APPROVE`/`REJECT`/`GUEST_*` action handlers
- Do NOT post to `notification_channel` from the trigger handler — trigger channel/thread only
- Do NOT hardcode action ID strings — always use `SLACK_ACTION_ID.*` constants
- Do NOT use Slack modals for input collection — threaded messages only
- Do NOT add input validation for collected inputs — accept replies as-is
- Do NOT add task status updates to the trigger thread beyond "Task started"
- Do NOT add timeout/cleanup for pending confirmations in v1
- Do NOT re-implement input schema validation — reuse `InputSchemaSchema` from `src/gateway/validation/schemas.ts`
- Do NOT add slash command support
- Do NOT add dedup logic — confirmation is the dedup mechanism

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Slack interactions**: Use Playwright CDP to connect to real Chrome → navigate to Slack workspace → trigger @mention → verify confirmation card → click buttons → verify thread responses
- **Inngest functions**: Use curl to fire Inngest events manually → verify step outputs via DB queries
- **API/Backend**: Use curl + psql to verify task creation, raw_event content, and lifecycle progression

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: Add action ID constants to slack-action-ids.ts [quick]
├── Task 2: Fix stub ack in interaction-handler.ts for task intent [quick]
├── Task 3: Fix resolveArchetypeFromChannel silent fallback [quick]
├── Task 4: Add bot self-mention guard to app_mention handler [quick]
├── Task 5: Check createTaskAndDispatch for archetypeId support [quick]

Wave 2 (Core logic — after Wave 1):
├── Task 6: Build slack-trigger-handler Inngest function (depends: 1, 3, 5) [deep]
├── Task 7: Build confirmation card Block Kit + action handlers (depends: 1) [unspecified-high]
├── Task 8: Build threaded input collection flow (depends: 6, 7) [deep]

Wave 3 (Integration + testing — after Wave 2):
├── Task 9: Build LLM routing prompt for multi-employee channels (depends: 6) [unspecified-high]
├── Task 10: Write unit tests for new components (depends: 6, 7, 8, 9) [unspecified-high]
├── Task 11: Register Inngest function + AGENTS.md update (depends: 6) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks       | Wave |
| ---- | ---------- | ------------ | ---- |
| 1    | —          | 6, 7         | 1    |
| 2    | —          | 6            | 1    |
| 3    | —          | 6            | 1    |
| 4    | —          | —            | 1    |
| 5    | —          | 6            | 1    |
| 6    | 1, 2, 3, 5 | 8, 9, 10, 11 | 2    |
| 7    | 1          | 8, 10        | 2    |
| 8    | 6, 7       | 10           | 2    |
| 9    | 6          | 10           | 3    |
| 10   | 6, 7, 8, 9 | —            | 3    |
| 11   | 6          | —            | 3    |

### Agent Dispatch Summary

- **Wave 1**: **5 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`, T5 → `quick`
- **Wave 2**: **3 tasks** — T6 → `deep`, T7 → `unspecified-high`, T8 → `deep`
- **Wave 3**: **3 tasks** — T9 → `unspecified-high`, T10 → `unspecified-high`, T11 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add trigger action ID constants

  **What to do**:
  - Add `TRIGGER_CONFIRM` and `TRIGGER_CANCEL` string constants to `src/lib/slack-action-ids.ts`
  - Follow the existing naming pattern in the file (e.g., `APPROVE = 'approve'`, `REJECT = 'reject'`)
  - Use values like `trigger_confirm` and `trigger_cancel` (snake_case, matching existing convention)

  **Must NOT do**:
  - Do NOT rename or modify any existing action ID constants
  - Do NOT use inline action ID strings anywhere — these constants are the single source of truth

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 2 lines added, trivial change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/slack-action-ids.ts` — existing action ID constants. Follow the exact naming pattern and export style.

  **Acceptance Criteria**:

  ```
  Scenario: Action ID constants exist
    Tool: Bash (grep)
    Steps:
      1. grep "TRIGGER_CONFIRM" src/lib/slack-action-ids.ts
      2. grep "TRIGGER_CANCEL" src/lib/slack-action-ids.ts
    Expected Result: Both constants found, exported, with snake_case string values
    Evidence: .sisyphus/evidence/task-1-action-ids.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(slack): add trigger action ID constants`
  - Files: `src/lib/slack-action-ids.ts`

- [x] 2. Fix stub ack message for task intent in interaction handler

  **What to do**:
  - In `src/inngest/interaction-handler.ts`, find the `route-and-store` step where `intent === 'task'` (around line 398)
  - The current code sets `ackText = "Got it! I'll work on that."` for task intent — this fires BEFORE the confirmation card
  - Change the ack text for `task` intent to something like: `null` or an empty string, or a brief neutral message like `"Processing your request..."` that won't conflict with the confirmation card
  - **Better approach**: Set a flag so the `send-acknowledgment` step skips posting for `task` intent entirely — the confirmation card (built in Task 7) will be the first reply instead
  - Check what the `send-acknowledgment` step does when `ackText` is null/empty — if it skips posting, just set `ackText = null`

  **Must NOT do**:
  - Do NOT change ack behavior for `feedback`, `teaching`, or `question` intents
  - Do NOT modify the `classify-intent` step
  - Do NOT remove the `employee/task.requested` event emission — that's the trigger for Task 6's handler

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change, ~5 lines modified, clear scope
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/interaction-handler.ts:390-410` — the `route-and-store` step where ackText is set per intent. The `task` branch is around line 398.
  - `src/inngest/interaction-handler.ts:470-510` — the `send-acknowledgment` step that posts ackText to Slack. Check what happens when ackText is null/undefined.

  **Acceptance Criteria**:

  ```
  Scenario: Task intent does not produce stub ack
    Tool: Bash (grep)
    Steps:
      1. Search interaction-handler.ts for "Got it! I'll work on that"
      2. Verify the string is either removed or only used for non-task intents
    Expected Result: The string "Got it! I'll work on that" does not appear for task intent path
    Evidence: .sisyphus/evidence/task-2-stub-ack-removed.txt

  Scenario: Other intents still get ack messages
    Tool: Bash (grep)
    Steps:
      1. Search interaction-handler.ts for ackText assignments
      2. Verify feedback, teaching, and question intents still have their ack text
    Expected Result: Non-task intents unchanged
    Evidence: .sisyphus/evidence/task-2-other-intents-intact.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `fix(slack): suppress stub ack for task intent in interaction handler`
  - Files: `src/inngest/interaction-handler.ts`

- [x] 3. Fix resolveArchetypeFromChannel silent fallback

  **What to do**:
  - In `src/gateway/services/interaction-classifier.ts`, modify `resolveArchetypeFromChannel()` to return an `isExactMatch` flag alongside the archetype
  - Current behavior: if no archetype has `notification_channel = channelId`, it falls back to the oldest active archetype for the tenant — this is dangerous for the trigger feature because it would dispatch to the wrong employee
  - New return type: `{ archetype: ArchetypeRow | null, isExactMatch: boolean }` or similar
  - When `notification_channel` matches → `isExactMatch: true`
  - When falling back to oldest active → `isExactMatch: false`
  - When no archetypes exist at all → `archetype: null, isExactMatch: false`
  - **IMPORTANT**: Use `lsp_find_references` on `resolveArchetypeFromChannel` before modifying — verify ALL call sites still work with the new return type. The interaction handler calls this for @mentions in the `resolve-context` step.
  - Update ALL callers to handle the new return type — the existing callers (interaction handler `resolve-context` step) should use the archetype regardless of `isExactMatch` (preserving current behavior for feedback/question intents). Only the new trigger handler (Task 6) will check `isExactMatch`.

  **Must NOT do**:
  - Do NOT modify `resolveArchetypeFromTask` — thread-reply path depends on it
  - Do NOT remove the fallback behavior entirely — the existing feedback/teaching/question flows still need it
  - Do NOT change the PostgREST query structure without testing

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function modification with known callers, ~15 lines changed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/services/interaction-classifier.ts:55-80` — `resolveArchetypeFromChannel()` function. The two-step query: first exact match by `notification_channel`, then fallback to oldest active.
  - `src/inngest/interaction-handler.ts:135-165` — `resolve-context` step that calls `resolveArchetypeFromChannel` for @mentions. Must continue to work with the new return type.

  **API/Type References**:
  - PostgREST query pattern used in the function — `fetch(url)` against `localhost:54331/rest/v1/archetypes`

  **Acceptance Criteria**:

  ```
  Scenario: Exact channel match returns isExactMatch=true
    Tool: Bash (node/tsx)
    Steps:
      1. Import resolveArchetypeFromChannel
      2. Call with a channelId that matches an existing archetype's notification_channel
      3. Assert result.isExactMatch === true and result.archetype is not null
    Expected Result: isExactMatch is true
    Evidence: .sisyphus/evidence/task-3-exact-match.txt

  Scenario: No channel match returns isExactMatch=false with fallback archetype
    Tool: Bash (node/tsx)
    Steps:
      1. Call with a channelId that does NOT match any archetype's notification_channel
      2. Assert result.isExactMatch === false and result.archetype is the oldest active archetype
    Expected Result: isExactMatch is false, archetype is the fallback
    Evidence: .sisyphus/evidence/task-3-fallback.txt

  Scenario: Existing interaction handler still works
    Tool: Bash (grep + test)
    Steps:
      1. Run pnpm test -- --run to verify no regressions
      2. grep the interaction-handler.ts resolve-context step to confirm it handles the new return type
    Expected Result: Tests pass, no regressions
    Evidence: .sisyphus/evidence/task-3-no-regression.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(slack): add isExactMatch flag to resolveArchetypeFromChannel`
  - Files: `src/gateway/services/interaction-classifier.ts`, `src/inngest/interaction-handler.ts`

- [x] 4. Add bot self-mention guard to app_mention handler

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, in the `app_mention` event handler (around line 240), add a guard at the very top that checks if the mention came from the bot itself
  - The Bolt app context provides the bot user ID — check if `mention.user === context.botUserId` (or however the bot ID is accessible in the handler context)
  - If the mention is from the bot, return early without firing `employee/interaction.received`
  - Also add a guard for when the mention is in a DM (channel type `im`) — return early with no response for v1
  - Check how the existing handler accesses `mention.user` and the bot's own user ID — the `authorize` callback returns the bot token, and Bolt may provide `context.botUserId`

  **Must NOT do**:
  - Do NOT change the existing mention text stripping logic
  - Do NOT modify the `employee/interaction.received` event payload structure
  - Do NOT add DM handling logic — just silently ignore DMs

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 5-10 lines added to existing handler, simple guard logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: None (nice-to-have guard, doesn't block other tasks)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:240-280` — existing `app_mention` handler. Check how `mention.user` and bot user ID are accessed.
  - `src/gateway/slack/handlers.ts:80-120` — the `message` event handler has a similar bot check pattern (`if (message.bot_id) return`) — follow this pattern.

  **Acceptance Criteria**:

  ```
  Scenario: Bot self-mention is ignored
    Tool: Bash (grep)
    Steps:
      1. Search handlers.ts app_mention handler for bot self-mention guard
      2. Verify the guard returns early before firing interaction.received
    Expected Result: Guard exists, checks mention.user against bot ID, returns early
    Evidence: .sisyphus/evidence/task-4-self-mention-guard.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `fix(slack): add bot self-mention and DM guard to app_mention handler`
  - Files: `src/gateway/slack/handlers.ts`

- [x] 5. Check createTaskAndDispatch for archetypeId-based dispatch

  **What to do**:
  - Read `src/inngest/lib/create-task-and-dispatch.ts` to understand its interface
  - Determine if it accepts `archetypeId` directly (vs requiring a `slug/role_name` like `dispatchEmployee()`)
  - Also check `src/gateway/services/employee-dispatcher.ts` (`dispatchEmployee`) for its exact interface
  - Document findings: which function should the new Inngest handler (Task 6) use for dispatching?
  - If neither accepts `archetypeId` directly, document that Task 6 will need to either:
    - Fetch `role_name` from the archetype row first (extra DB call)
    - OR create a `dispatchEmployeeById()` variant
  - Write findings to `.sisyphus/evidence/task-5-dispatch-interface.md`

  **Must NOT do**:
  - Do NOT modify either dispatch function in this task — just investigate and document
  - This is a research/spike task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read-only investigation, document findings, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task 6 (informs dispatch approach)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/lib/create-task-and-dispatch.ts` — PostgREST-based task creation helper used inside Inngest steps
  - `src/gateway/services/employee-dispatcher.ts` — `dispatchEmployee()` function that creates task + fires lifecycle event
  - `src/gateway/routes/admin-employee-trigger.ts` — how the manual trigger API calls `dispatchEmployee()` — shows the expected interface

  **Acceptance Criteria**:

  ```
  Scenario: Dispatch interface documented
    Tool: Bash (cat)
    Steps:
      1. Read .sisyphus/evidence/task-5-dispatch-interface.md
      2. Verify it documents: function name, parameters, whether it accepts archetypeId, recommended approach for Task 6
    Expected Result: Clear recommendation documented
    Evidence: .sisyphus/evidence/task-5-dispatch-interface.md
  ```

  **Commit**: NO (research task, no code changes)

- [x] 6. Build slack-trigger-handler Inngest function

  **What to do**:
  - Create `src/inngest/slack-trigger-handler.ts` — a new Inngest function that handles the `employee/task.requested` event
  - **Event payload** (from `interaction-handler.ts:451-461`): `{ tenantId, text, userId, channelId, threadTs, archetypeId, taskId }`
  - **Step 1: validate-context** — Guard: if `taskId` is set, this mention was in an existing task thread — skip dispatch, return early (let existing feedback flow handle it). Guard: if `tenantId` is null, return early.
  - **Step 2: resolve-employee** — Call `resolveArchetypeFromChannel(channelId, tenantId)` with the updated function from Task 3.
    - If `result.archetype === null` → go to step 3a (decline)
    - If `result.isExactMatch === true` AND only 1 match → go to step 3b (confirm with this employee)
    - If `result.isExactMatch === false` OR multiple matches → go to step 3c (LLM routing — implemented in Task 9, for now just use the first match)
  - **Step 3a: decline** — Post threaded message: "I don't have any employees assigned to this channel. An admin can assign one in the dashboard." Use `loadTenantEnv()` to get `SLACK_BOT_TOKEN` for the tenant.
  - **Step 3b: send-confirmation** — Post Block Kit confirmation card in thread (built in Task 7). Card shows: employee name (prettified `role_name`), user's request text (truncated to 200 chars). Buttons: Confirm / Cancel. Store context in button `value` as JSON: `{ archetypeId, tenantId, userId, channelId, threadTs, text }`.
  - **Step 3c: llm-route** — Placeholder for Task 9. For now, use the first matched archetype and go to step 3b.
  - Use `thread_ts: event.data.threadTs ?? event.data.ts` for all Slack replies (handle both top-level and in-thread mentions)
  - Import `SLACK_ACTION_ID` from `src/lib/slack-action-ids.ts` for button action IDs
  - Export the function for registration in the gateway serve list

  **Must NOT do**:
  - Do NOT call `dispatchEmployee` from this function — dispatch happens in the button click handler (Task 7) after confirmation
  - Do NOT implement LLM routing here — that's Task 9. Just use a placeholder.
  - Do NOT implement input collection here — that's Task 8
  - Do NOT post to `notification_channel` — only post to the trigger channel/thread
  - Do NOT hardcode action ID strings

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: New Inngest function with multiple steps, Slack API calls, conditional logic, needs careful design
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7 once Wave 1 complete)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 8, 9, 10, 11
  - **Blocked By**: Tasks 1, 2, 3, 5

  **References**:

  **Pattern References**:
  - `src/inngest/interaction-handler.ts` — existing Inngest function pattern. Follow the same structure: `inngest.createFunction({ id, name }, { event }, async ({ event, step }) => { ... })`. Use `step.run()` for each logical step.
  - `src/inngest/interaction-handler.ts:450-461` — where `employee/task.requested` is emitted. This shows the exact event payload structure.
  - `src/inngest/interaction-handler.ts:470-510` — the `send-acknowledgment` step shows how to post Slack messages using `loadTenantEnv()` to get the bot token.
  - `src/gateway/services/interaction-classifier.ts:55-80` — `resolveArchetypeFromChannel()` — call this with the updated return type from Task 3.

  **API/Type References**:
  - `src/gateway/services/tenant-env-loader.ts` — `loadTenantEnv()` returns env vars including `SLACK_BOT_TOKEN`
  - `src/lib/slack-action-ids.ts` — import `SLACK_ACTION_ID.TRIGGER_CONFIRM` and `TRIGGER_CANCEL` (from Task 1)

  **External References**:
  - Slack Block Kit reference for button layout: https://api.slack.com/reference/block-kit/block-elements#button

  **Acceptance Criteria**:

  ```
  Scenario: Handler file exists and exports an Inngest function
    Tool: Bash (grep)
    Steps:
      1. Verify file exists: ls src/inngest/slack-trigger-handler.ts
      2. grep "employee/task.requested" src/inngest/slack-trigger-handler.ts
      3. grep "createFunction" src/inngest/slack-trigger-handler.ts
    Expected Result: File exists, triggers on employee/task.requested, exports a function
    Evidence: .sisyphus/evidence/task-6-handler-exists.txt

  Scenario: Handler guards against existing task thread mentions
    Tool: Bash (grep)
    Steps:
      1. Search for taskId guard in the handler
      2. Verify it returns early when taskId is set
    Expected Result: Guard exists that skips dispatch for existing task threads
    Evidence: .sisyphus/evidence/task-6-task-thread-guard.txt

  Scenario: Handler posts decline message for unassigned channels
    Tool: Bash (curl + Inngest event injection)
    Preconditions: A channel ID that has no archetype assigned
    Steps:
      1. Fire employee/task.requested event via Inngest API with a channelId that has no archetype
      2. Check Slack for a decline message in the thread
    Expected Result: Decline message posted: "I don't have any employees assigned to this channel"
    Evidence: .sisyphus/evidence/task-6-decline-message.png
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(slack): add slack-trigger-handler Inngest function for employee/task.requested`
  - Files: `src/inngest/slack-trigger-handler.ts`

- [x] 7. Build confirmation card Block Kit + action handlers

  **What to do**:
  - **Confirmation card**: Create a function (in the new handler file or a shared utility) that builds Block Kit blocks for the confirmation card:
    ```
    Section: "Trigger **{Employee Name}**?"
    Context: "Requested by <@{userId}>: {truncated request text}"
    Actions: [Confirm (primary style)] [Cancel (danger style)]
    Context: "Task `pending-confirmation`"
    ```
  - Prettify `role_name` for display: `guest-messaging` → `Guest Messaging` (capitalize, replace hyphens with spaces)
  - Store dispatch context in button `value` field as JSON string: `JSON.stringify({ archetypeId, tenantId, userId, channelId, threadTs, originalText })`
  - **Confirm action handler**: In `src/gateway/slack/handlers.ts`, register `app.action(SLACK_ACTION_ID.TRIGGER_CONFIRM, ...)`:
    1. `ack()` immediately
    2. Parse context from `body.actions[0].value` (JSON)
    3. Replace the confirmation card with `chat.update`: "Triggering **{Employee Name}**..."
    4. Check if archetype has required `input_schema` items with `frequency === 'every_run'` and `required === true`
    5. If NO required inputs → dispatch immediately via `dispatchEmployee()` or `createTaskAndDispatch()` (based on Task 5 findings) with `inputs: { prompt: originalText }`
    6. If YES required inputs → fire an Inngest event for input collection (Task 8 handles this)
    7. After dispatch → `chat.update` again: "Task `{taskId}` started for **{Employee Name}**." with task ID in context block
  - **Cancel action handler**: Register `app.action(SLACK_ACTION_ID.TRIGGER_CANCEL, ...)`:
    1. `ack()` immediately
    2. Replace the confirmation card with `chat.update`: "Cancelled by <@{userId}>."
    3. No task created.
  - Follow existing button handler patterns at `handlers.ts:301-308` for `chat.update` after click

  **Must NOT do**:
  - Do NOT use Slack modals — Block Kit buttons in thread only
  - Do NOT modify existing APPROVE/REJECT/GUEST\_\* action handlers
  - Do NOT hardcode action ID strings — use `SLACK_ACTION_ID.*`
  - Do NOT post to notification_channel — only the trigger thread

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Slack Block Kit construction + 2 action handlers + dispatch integration. Not deep algorithmic work but substantial integration.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6 once Task 1 complete)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 8, 10
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:150-198` — `BUTTON_BLOCKS` builder for approval cards. Follow this pattern for confirmation card Block Kit structure.
  - `src/gateway/slack/handlers.ts:301-340` — existing button click handlers (`approve`, `reject`). Follow the same pattern: `ack()` → parse context → `chat.update` → business logic.
  - `src/gateway/slack/handlers.ts:240-280` — app_mention handler shows how `say()` works with `thread_ts`.

  **API/Type References**:
  - `src/lib/slack-action-ids.ts` — import `SLACK_ACTION_ID.TRIGGER_CONFIRM`, `TRIGGER_CANCEL`
  - `src/gateway/services/employee-dispatcher.ts` — `dispatchEmployee()` interface (or `createTaskAndDispatch` per Task 5)
  - `src/gateway/validation/schemas.ts:350-375` — `InputSchemaItemSchema` for checking required inputs

  **External References**:
  - Slack Block Kit Builder: https://app.slack.com/block-kit-builder — test card layout
  - Slack actions reference: https://api.slack.com/reference/block-kit/block-elements#button

  **Acceptance Criteria**:

  ```
  Scenario: Confirm action handler registered
    Tool: Bash (grep)
    Steps:
      1. grep "TRIGGER_CONFIRM" src/gateway/slack/handlers.ts
      2. grep "app.action" src/gateway/slack/handlers.ts | grep -i trigger
    Expected Result: Action handler registered for TRIGGER_CONFIRM and TRIGGER_CANCEL
    Evidence: .sisyphus/evidence/task-7-handlers-registered.txt

  Scenario: Confirm button creates a task
    Tool: Bash (psql)
    Preconditions: Confirmation card posted in Slack, user clicks Confirm
    Steps:
      1. Click Confirm button (via Playwright CDP or manual)
      2. Wait 5 seconds
      3. Query: SELECT id, status, raw_event FROM tasks WHERE created_at > now() - interval '30s' ORDER BY created_at DESC LIMIT 1;
    Expected Result: 1 task row with status 'Ready', raw_event contains inputs.prompt with original text
    Failure Indicators: 0 rows, or raw_event missing inputs.prompt
    Evidence: .sisyphus/evidence/task-7-confirm-creates-task.txt

  Scenario: Cancel button creates no task
    Tool: Bash (psql)
    Preconditions: Confirmation card posted in Slack, user clicks Cancel
    Steps:
      1. Click Cancel button
      2. Wait 3 seconds
      3. Query: SELECT count(*) FROM tasks WHERE created_at > now() - interval '30s';
    Expected Result: 0 new tasks
    Evidence: .sisyphus/evidence/task-7-cancel-no-task.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(slack): add confirmation card and action handlers for Slack trigger`
  - Files: `src/gateway/slack/handlers.ts`

- [x] 8. Build threaded input collection flow

  **What to do**:
  - Handle the case where an employee has required `input_schema` items (`frequency === 'every_run'` AND `required === true`) and those inputs were not found in the user's original message
  - **Approach**: After confirmation, the confirm handler (Task 7) detects missing inputs and fires an Inngest event (e.g., `employee/trigger.collect-inputs`) with context: `{ archetypeId, tenantId, userId, channelId, threadTs, originalText, missingInputs: InputSchemaItem[] }`
  - **New Inngest function** (or add steps to the existing trigger handler):
    - Step 1: For the first missing input, post a threaded message: "Before I can trigger **{Employee Name}**, I need a few details. What is the **{input.label}**?" (include description if available)
    - Step 2: Wait for a reply in the thread. This is the tricky part — options:
      - **Option A (Recommended)**: Use Inngest `waitForEvent` with a timeout to wait for `employee/trigger.input-received` event. The thread reply handler in `handlers.ts` would need to detect when a reply comes in a "pending input collection" thread and fire this event.
      - **Option B**: Poll for new messages in the thread using Slack API `conversations.replies`. Simpler but wasteful.
    - Step 3: Parse the reply as the input value. Accept as-is (no format validation per guardrails).
    - Step 4: If more missing inputs, repeat step 1-3. If all inputs collected, dispatch the task with all inputs.
  - **Thread reply detection**: Modify the `message` event handler in `handlers.ts` to check if a thread reply is in a "pending input collection" context. This could be tracked via a simple in-memory map or a DB record (e.g., `pending_trigger_inputs` table or a JSON entry in an existing table).
  - **Simpler alternative**: Instead of per-field collection, ask for ALL missing inputs in one message: "Before triggering, I need: 1. **Target Date** (a date) 2. **Priority** (select: high/medium/low). Please reply with each on a separate line." Then parse the reply. This is simpler but less conversational.
  - **Decision for implementer**: Choose the approach that's simplest to implement reliably. The "ask all at once" approach is recommended for v1 to avoid complex state management.

  **Must NOT do**:
  - Do NOT use Slack modals — threaded messages only
  - Do NOT validate input format — accept replies as-is
  - Do NOT implement re-asking for malformed inputs — accept the first reply
  - Do NOT scope input collection to the original user — any thread participant can reply
  - Do NOT implement timeout/cleanup for pending input collection in v1

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex async flow with Inngest waitForEvent, thread reply detection, state management. Needs careful design.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Tasks 6 and 7
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 6, 7

  **References**:

  **Pattern References**:
  - `src/inngest/interaction-handler.ts:100-130` — `detect-awaiting-input-rule` step shows the pattern for detecting pending state in a thread
  - `src/inngest/employee-lifecycle.ts` — lifecycle function shows `step.waitForEvent()` pattern for waiting on approval events
  - `src/gateway/slack/handlers.ts:70-120` — `message` event handler shows how thread replies are detected and routed

  **API/Type References**:
  - `src/gateway/validation/schemas.ts:350-375` — `InputSchemaItemSchema` type definition
  - Inngest `step.waitForEvent()` docs: waits for a specific event with optional timeout

  **Acceptance Criteria**:

  ```
  Scenario: Employee with required inputs triggers input collection
    Tool: Bash (Inngest event + psql)
    Preconditions: An archetype with input_schema containing a required every_run field
    Steps:
      1. Trigger @mention → confirmation → Confirm
      2. Verify bot asks for missing input in thread
      3. Reply in thread with the input value
      4. Verify task is created with the input in raw_event.inputs
    Expected Result: Task created, raw_event.inputs contains the collected input value
    Failure Indicators: Task created without collected inputs, or no input prompt posted
    Evidence: .sisyphus/evidence/task-8-input-collection.txt

  Scenario: Employee with no required inputs skips input collection
    Tool: Bash (psql)
    Preconditions: An archetype with NO input_schema or only optional fields
    Steps:
      1. Trigger @mention → confirmation → Confirm
      2. Verify task is created immediately (no input collection messages)
    Expected Result: Task created directly after confirmation, no "I need details" message posted
    Evidence: .sisyphus/evidence/task-8-no-input-skip.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(slack): add threaded input collection for employees with required inputs`
  - Files: `src/inngest/slack-trigger-handler.ts`, `src/gateway/slack/handlers.ts`

- [x] 9. Build LLM routing prompt for multi-employee channels

  **What to do**:
  - Implement the LLM routing logic that was stubbed as a placeholder in Task 6
  - This handles the rare case where multiple archetypes share the same `notification_channel` (or when we need cross-tenant routing in the future)
  - Create a function `routeToEmployee(text: string, archetypes: ArchetypeRow[]): Promise<{ archetype: ArchetypeRow, confidence: number }>` in the trigger handler file (or a new utility)
  - **LLM prompt structure**:

    ```
    System: "You are a routing assistant. Given a user's request, determine which AI employee should handle it. Respond with JSON: { "employee_index": <number>, "confidence": <0-100> }"

    User: "Available employees:
    1. {role_name}: {first 200 chars of identity}
    2. {role_name}: {first 200 chars of identity}
    ...

    User's request: {text}

    Which employee should handle this?"
    ```

  - Use `callLLM()` with `taskType: 'review'`, `temperature: 0`, `maxTokens: 50`
  - Parse the JSON response. If confidence < 50 or parse fails, fall back to asking the user to pick from a list (post Block Kit buttons with one per employee)
  - **Injection boundary**: Wrap user text in `<user_message>` tags per existing pattern in `interaction-classifier.ts`
  - Limit to 10 employees max in the prompt to control token cost

  **Must NOT do**:
  - Do NOT pass full `identity` text — truncate to 200 chars per employee
  - Do NOT hardcode model — use `callLLM()` without model param (reads platform setting)
  - Do NOT retry LLM failures — fall back to user selection

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: LLM prompt engineering + JSON parsing + fallback logic. Moderate complexity.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11 once Task 6 complete)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 10
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `src/gateway/services/interaction-classifier.ts:12-40` — `classifyIntent()` shows the exact LLM call pattern: system prompt, user message in `<user_message>` tags, `maxTokens: 10`, `temperature: 0`. Follow the same injection boundary pattern.
  - `src/gateway/services/archetype-generator.ts:544-573` — `callLLMWithJsonRetry()` shows JSON parsing with retry. Consider a simpler version without retry for this use case.

  **API/Type References**:
  - `src/lib/call-llm.ts` — `callLLM()` interface: `{ messages, taskType, temperature?, maxTokens? }`

  **Acceptance Criteria**:

  ```
  Scenario: LLM routing selects correct employee
    Tool: Bash (tsx)
    Steps:
      1. Call routeToEmployee with text="send a motivational message" and archetypes=[motivation-bot, guest-messaging]
      2. Assert result.archetype.role_name === something reasonable
      3. Assert result.confidence > 0
    Expected Result: Returns a selected archetype with confidence score
    Evidence: .sisyphus/evidence/task-9-llm-routing.txt

  Scenario: Low confidence falls back gracefully
    Tool: Bash (tsx)
    Steps:
      1. Call routeToEmployee with ambiguous text="do something" and archetypes=[multiple employees]
      2. Assert low confidence or fallback behavior
    Expected Result: Either low confidence returned or fallback mechanism triggered
    Evidence: .sisyphus/evidence/task-9-low-confidence.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(slack): add LLM routing for multi-employee channel disambiguation`
  - Files: `src/inngest/slack-trigger-handler.ts`

- [x] 10. Write unit tests for new components

  **What to do**:
  - Create test files for the new functionality. Follow existing test patterns in the codebase.
  - **Tests to write**:
    1. `src/__tests__/inngest/slack-trigger-handler.test.ts`:
       - Test: taskId present in event → returns early (no dispatch)
       - Test: tenantId null → returns early
       - Test: no archetype for channel → posts decline message
       - Test: exact channel match → posts confirmation card
       - Test: confirmation card Block Kit structure is valid
    2. `src/__tests__/gateway/services/interaction-classifier.test.ts` (extend existing):
       - Test: `resolveArchetypeFromChannel` with exact match → `isExactMatch: true`
       - Test: `resolveArchetypeFromChannel` with no match → `isExactMatch: false`, fallback archetype returned
       - Test: `resolveArchetypeFromChannel` with no archetypes at all → `archetype: null`
    3. `src/__tests__/inngest/slack-trigger-routing.test.ts`:
       - Test: LLM routing returns valid archetype index
       - Test: LLM routing with malformed response → falls back gracefully
       - Test: prettifyRoleName converts `guest-messaging` → `Guest Messaging`
  - Mock `callLLM`, `loadTenantEnv`, and PostgREST calls following existing test patterns
  - Run `pnpm test -- --run` to verify all tests pass

  **Must NOT do**:
  - Do NOT modify existing test files beyond adding new test cases to `interaction-classifier.test.ts`
  - Do NOT skip mocking — tests must not make real API calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, mocking patterns, thorough coverage needed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs all implementation tasks complete)
  - **Parallel Group**: Wave 3 (sequential after 6, 7, 8, 9)
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7, 8, 9

  **References**:

  **Test References**:
  - `src/__tests__/inngest/interaction-handler.test.ts` — if it exists, follow its mocking patterns for Inngest functions
  - `src/__tests__/gateway/services/interaction-classifier.test.ts` — if it exists, extend with new test cases
  - `src/__tests__/` — browse for any existing Inngest function tests to follow patterns

  **Acceptance Criteria**:

  ```
  Scenario: All new tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run
    Expected Result: All tests pass, including new tests. 0 failures.
    Failure Indicators: Any test failure in new test files
    Evidence: .sisyphus/evidence/task-10-tests-pass.txt

  Scenario: Test coverage for key paths
    Tool: Bash (grep)
    Steps:
      1. Count test cases in new test files
      2. Verify at least 8 test cases across all files
    Expected Result: >= 8 test cases covering guards, decline, confirm, routing, input collection
    Evidence: .sisyphus/evidence/task-10-test-count.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test(slack): add unit tests for Slack trigger handler and routing`
  - Files: `src/__tests__/inngest/slack-trigger-handler.test.ts`, `src/__tests__/inngest/slack-trigger-routing.test.ts`, `src/__tests__/gateway/services/interaction-classifier.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 11. Register Inngest function + update AGENTS.md

  **What to do**:
  - Register the new `slack-trigger-handler` Inngest function in the gateway serve list
  - Find where Inngest functions are registered (likely `src/gateway/inngest/serve.ts` or similar) — look for the array of functions passed to `serve()`
  - Import `slackTriggerHandler` from `src/inngest/slack-trigger-handler.ts` and add it to the functions array
  - Also register the input collection function if it's a separate Inngest function (from Task 8)
  - **Update AGENTS.md**:
    - Add the new Inngest function to the "Inngest functions (active)" list — increment from 5 to 6 (or 7 if input collection is separate)
    - Add a brief description: `employee/slack-trigger-handler` (handles `employee/task.requested` from Slack @mentions)
    - Document the new Slack trigger feature in a relevant section (e.g., under "Admin API" or a new "Slack Trigger" section)
    - Add new action IDs to any relevant documentation
  - **Update `src/gateway/slack/handlers.ts` handler count comment** if there is one

  **Must NOT do**:
  - Do NOT remove any existing Inngest function registrations
  - Do NOT modify the serve configuration beyond adding the new function

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 2-3 lines in serve file + AGENTS.md documentation update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts` or wherever functions are registered — look for `serve({ client, functions: [...] })` or similar
  - `AGENTS.md` — "Inngest functions (active — 5)" section — update to include the new function

  **Acceptance Criteria**:

  ```
  Scenario: Inngest function is registered
    Tool: Bash (grep)
    Steps:
      1. grep "slack-trigger" src/gateway/inngest/
      2. Verify the function is in the serve registration array
    Expected Result: Function imported and listed in the serve functions array
    Evidence: .sisyphus/evidence/task-11-registered.txt

  Scenario: AGENTS.md updated
    Tool: Bash (grep)
    Steps:
      1. grep "slack-trigger" AGENTS.md
      2. grep "task.requested" AGENTS.md
    Expected Result: New function documented in AGENTS.md
    Evidence: .sisyphus/evidence/task-11-agents-md.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `feat(slack): register trigger handler and update documentation`
  - Files: `src/gateway/inngest/serve.ts`, `AGENTS.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `e2e-testing` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: mention in unassigned channel, cancel flow, existing task thread mention, bot self-mention. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [ ] 12. **Notify completion** — Send Telegram: `tsx scripts/telegram-notify.ts "Slack Employee Trigger plan complete, all tasks done, come back to review."`

---

## Commit Strategy

| Group  | Message                                                                                         | Files                                                                                                                                                  | Pre-commit           |
| ------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Wave 1 | `feat(slack): add trigger action IDs and fix pre-conditions for Slack triggering`               | `src/lib/slack-action-ids.ts`, `src/inngest/interaction-handler.ts`, `src/gateway/services/interaction-classifier.ts`, `src/gateway/slack/handlers.ts` | `pnpm test -- --run` |
| Wave 2 | `feat(slack): implement Slack @mention employee trigger with confirmation and input collection` | `src/inngest/slack-trigger-handler.ts`, `src/gateway/slack/handlers.ts`                                                                                | `pnpm test -- --run` |
| Wave 3 | `feat(slack): add LLM routing, unit tests, and register Inngest function`                       | `src/inngest/slack-trigger-handler.ts`, `src/gateway/inngest/serve.ts`, `src/__tests__/`, `AGENTS.md`                                                  | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# Tests pass
pnpm test -- --run  # Expected: all pass, 0 failures

# TypeScript compiles
npx tsc --noEmit  # Expected: 0 errors

# New Inngest function is registered
grep -r "slack-trigger" src/gateway/inngest/  # Expected: found in serve registration

# Action IDs exist
grep "TRIGGER_CONFIRM\|TRIGGER_CANCEL" src/lib/slack-action-ids.ts  # Expected: both found
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] AGENTS.md updated with new Inngest function and Slack trigger documentation
