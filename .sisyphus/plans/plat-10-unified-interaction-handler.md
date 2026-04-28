# PLAT-10: Unified Interaction Handler

## TL;DR

> **Quick Summary**: Replace the separate `feedback-handler.ts` (thread replies) and `mention-handler.ts` (@mentions) with a single `employee/interaction-handler` Inngest function that classifies all interactions through one Haiku pipeline and routes them consistently — fixing the current gap where @mentions get no acknowledgment and thread reply acks post as top-level messages instead of thread replies.
>
> **Deliverables**:
>
> - New unified Inngest function: `src/inngest/interaction-handler.ts`
> - New interaction classifier service: `src/gateway/services/interaction-classifier.ts`
> - Updated Bolt handlers firing `employee/interaction.received`
> - Updated `serve.ts` registration
> - Deleted: `feedback-handler.ts`, `mention-handler.ts`, `feedback-responder.ts` + their tests
> - Comprehensive unit tests for new function + service
> - Story-map doc updated with PLAT-10 marked complete
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (classifier service) → Task 3 (unified handler) → Task 5 (Bolt wiring) → Task 6 (cleanup) → Task 8 (API verification)

---

## Context

### Original Request

Implement PLAT-10 from the phase 1 story map: unify the two separate Slack interaction handlers into a single Inngest function with a shared classification pipeline, then thoroughly test via automated tests and API endpoint verification.

### Interview Summary

**Key Discussions**:

- PLAT-07 (notification_channel config): Already implemented — provides `archetype.notification_channel` and `tenants.config.notification_channel` for channel→archetype lookup
- GM-18 (learned rule extraction): Stub only — emit event, don't implement extraction logic
- User wants automated tests + API endpoint verification as part of the plan
- User wants story-map document updated to mark PLAT-10 acceptance criteria as completed

**Research Findings**:

- **feedback-handler.ts**: No classification, always stores as `thread_reply`, resolves tenantId via PostgREST tasks table
- **mention-handler.ts**: Haiku classification (4 intents), only stores feedback/teaching, NO acknowledgment sent
- **feedback-responder.ts**: Separate Inngest fn for thread reply acks — BUG: missing `thread_ts` (ack posts as top-level message), missing task ID context block
- **Channel→archetype**: `archetypes.notification_channel` is null for all seeded archetypes. Fallback needed: use `tenants.config.notification_channel` to match tenant, then find tenant's archetype
- **Test patterns**: Direct `fn.fn({ event, step })` invocation, `vi.mock()` for deps, local `makeStep()` helpers
- **Test gaps**: mention-handler Inngest function has NO test (only service class tested); stale test at mention-handler.test.ts:138

### Metis Review

**Identified Gaps** (addressed):

- **feedback-responder.ts fate**: Decided to DELETE it — unified handler owns all acks inline, avoiding double-ack risk
- **Channel→archetype null archetypes**: Fallback algorithm defined — query archetypes by notification_channel, if empty, query first archetype for tenant
- **`task` intent scope**: Locked to STUB — emit `employee/task.requested` event only, no machine spin-up
- **`question` intent KB lookup**: Defined as simple `knowledgeBaseEntry.findMany({ tenant_id })`, capped at 5 entries, passed as context to Haiku
- **GM-18 stub event**: Named `employee/rule.extract-requested` with payload `{ tenantId, feedbackId, feedbackType, source }`
- **thread_ts bug**: Fixed as part of unified handler (ack always includes thread_ts)
- **Task ID context block**: All acks include it per AGENTS.md Slack Message Standards

---

## Work Objectives

### Core Objective

Replace three Inngest functions (`feedback-handler`, `mention-handler`, `feedback-responder`) with one unified `interaction-handler` that classifies all Slack interactions through a single Haiku pipeline and routes them consistently with proper thread acknowledgments.

### Concrete Deliverables

- `src/gateway/services/interaction-classifier.ts` — classification service (Haiku + archetype context)
- `src/inngest/interaction-handler.ts` — unified Inngest function
- Updated `src/gateway/slack/handlers.ts` — both events → `employee/interaction.received`
- Updated `src/gateway/inngest/serve.ts` — new registration
- `tests/inngest/interaction-handler.test.ts` — Inngest function tests
- `tests/gateway/services/interaction-classifier.test.ts` — service tests
- Updated `docs/2026-04-21-2202-phase1-story-map.md` — PLAT-10 marked complete

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes (excluding known pre-existing failures)
- [ ] `pnpm lint` exits 0
- [ ] Old handler files deleted: `feedback-handler.ts`, `mention-handler.ts`, `feedback-responder.ts`
- [ ] Old test files deleted: `tests/inngest/feedback-handler.test.ts`, `tests/inngest/feedback-responder.test.ts`, `tests/gateway/services/mention-handler.test.ts`
- [ ] Inngest dashboard shows `employee/interaction-handler` registered, old function IDs absent

### Must Have

- All interactions (thread replies + @mentions) go through same classification pipeline
- Classification uses `anthropic/claude-haiku-4-5` with archetype context
- Four intents: `feedback`, `teaching`, `question`, `task`
- `feedback`/`teaching`: store in feedback table + emit GM-18 stub event
- `question`: KB lookup + inline Haiku answer
- `task`: stub — emit event only, no machine spin-up
- All intents produce Slack thread acknowledgment (with `thread_ts` and task ID context block)
- Archetype resolution: from `taskId` (thread replies) or channel lookup (mentions)

### Must NOT Have (Guardrails)

- **NO semantic search / pgvector** — KB lookup is simple `findMany` capped at 5 entries
- **NO full task creation/dispatch** for `task` intent — stub event only
- **NO new columns** on the `feedback` table
- **NO centralized event types file** — follow existing inline `any` cast pattern
- **NO modifications to `inngest-serve.test.ts`** — pre-existing failure, excluded
- **NO modifications to `handlers.ts`** beyond the two `inngest.send()` calls
- **NO shared `makeStep()` extraction** — define locally in each test file per existing pattern
- **NO over-engineered channel→archetype mapping** — simple DB query with tenant fallback

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest + @inngest/test)
- **Automated tests**: YES (Tests-after — new tests for new code)
- **Framework**: Vitest with `vi.mock()` pattern
- **Pattern**: Pattern A (direct `fn.fn({ event, step })` invocation)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Inngest functions**: Use Bash (`pnpm test -- --run`) — run specific test files, assert pass count
- **Build verification**: Use Bash (`pnpm build`) — assert exit code 0
- **API verification**: Use Bash (`curl`) — query Inngest dev server for registered functions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — service + types, MAX PARALLEL):
├── Task 1: Interaction classifier service + tests [unspecified-high]
├── Task 2: Unified event payload design + Bolt handler update [quick]
└── (Independent — no cross-dependencies)

Wave 2 (After Wave 1 — core handler + wiring):
├── Task 3: Unified interaction-handler Inngest function + tests (depends: 1, 2) [deep]
├── Task 4: Serve.ts registration update (depends: 3) [quick]
└── Task 5: Wire Bolt handlers to fire unified event (depends: 2) [quick]

Wave 3 (After Wave 2 — cleanup + verification):
├── Task 6: Delete old handler files + old tests (depends: 3, 4, 5) [quick]
├── Task 7: Build + test + lint verification (depends: 6) [quick]
├── Task 8: API endpoint verification via Inngest dev server (depends: 7) [quick]
├── Task 9: Update story-map doc (depends: 7) [quick]
└── Task 10: Notify completion via Telegram (depends: 9) [quick]

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
| 1     | —          | 3       | 1     |
| 2     | —          | 3, 5    | 1     |
| 3     | 1, 2       | 4, 5, 6 | 2     |
| 4     | 3          | 6       | 2     |
| 5     | 2          | 6       | 2     |
| 6     | 3, 4, 5    | 7       | 3     |
| 7     | 6          | 8, 9    | 3     |
| 8     | 7          | —       | 3     |
| 9     | 7          | 10      | 3     |
| 10    | 9          | —       | 3     |
| F1-F4 | 10         | —       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `unspecified-high`, T2 → `quick`
- **Wave 2**: **3** — T3 → `deep`, T4 → `quick`, T5 → `quick`
- **Wave 3**: **5** — T6-T10 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Interaction Classifier Service + Tests

  **What to do**:
  - Create `src/gateway/services/interaction-classifier.ts` with:
    - `InteractionClassifier` class that accepts a `callLLM` dependency
    - `classifyIntent(text: string, archetypeContext?: { role_name: string }): Promise<MentionIntent>` method
    - Uses `anthropic/claude-haiku-4-5`, `taskType: 'review'`, `maxTokens: 10`, `temperature: 0`
    - System prompt includes archetype `role_name` if available: `"You are {role_name}. Classify this interaction into exactly one category: feedback, teaching, question, task. Respond with one word only."`
    - If no archetype context: `"Classify this interaction into exactly one category: feedback, teaching, question, task. Respond with one word only."`
    - Normalize response: `.trim().toLowerCase()`, fallback to `'question'` for unrecognized values
    - Export `MentionIntent` type: `'feedback' | 'teaching' | 'question' | 'task'`
  - `resolveArchetypeFromChannel(channelId: string, tenantId: string): Promise<{ id: string; role_name: string; notification_channel: string | null } | null>` — standalone exported function
    - Query PostgREST: `archetypes?notification_channel=eq.{channelId}&tenant_id=eq.{tenantId}&select=id,role_name,notification_channel&limit=1`
    - If no result: fallback to `archetypes?tenant_id=eq.{tenantId}&select=id,role_name,notification_channel&order=created_at.asc&limit=1`
    - If still no result: return `null`
  - `resolveArchetypeFromTask(taskId: string): Promise<{ id: string; role_name: string; tenantId: string } | null>` — standalone exported function
    - Query PostgREST: `tasks?id=eq.{taskId}&select=tenant_id,archetype_id` → then `archetypes?id=eq.{archetypeId}&select=id,role_name`
    - Return `null` if task not found
  - Create `tests/gateway/services/interaction-classifier.test.ts`:
    - Test `classifyIntent()`: all 4 intents, unknown response → `question` fallback, with/without archetype context, model assertion (`anthropic/claude-haiku-4-5`)
    - Test `resolveArchetypeFromChannel()`: direct match, fallback to first tenant archetype, no archetype found
    - Test `resolveArchetypeFromTask()`: task found, task not found
    - Use `vi.stubGlobal('fetch', ...)` for PostgREST mocking, `vi.mock('../../src/lib/call-llm.js')` for LLM

  **Must NOT do**:
  - Do NOT import or use Prisma directly — use PostgREST `fetch()` calls (consistent with existing handler pattern)
  - Do NOT implement semantic search for KB lookup — that's in the handler, not the classifier
  - Do NOT create a centralized event types file

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Service class with LLM integration + PostgREST queries + comprehensive unit tests — moderate complexity
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/services/mention-handler.ts:26-48` — Existing `classifyIntent()` method to port: Haiku call pattern, system prompt, normalization logic. Lift this logic into the new classifier.
  - `src/gateway/services/mention-handler.ts:50-90` — Existing `handle()` method showing intent→storage routing. The new classifier does NOT do storage — only classification.
  - `src/inngest/feedback-responder.ts:40-70` — PostgREST fetch pattern for resolving archetype from task: `fetch(SUPABASE_URL + '/rest/v1/tasks?id=eq.' + taskId)` with `apikey` and `Authorization` headers.
  - `src/gateway/services/notification-channel.ts` — `resolveNotificationChannel()` — reference for the PLAT-07 notification_channel field usage.

  **API/Type References**:
  - `src/lib/call-llm.ts:CallLLMOptions` — `{ model, messages, taskType, taskId?, temperature?, maxTokens? }` — exact interface to use
  - `src/gateway/services/mention-handler.ts:5` — `MentionIntent` type definition: `'feedback' | 'teaching' | 'question' | 'task'` — reuse or re-export from new file

  **Test References**:
  - `tests/gateway/services/mention-handler.test.ts` — Full test file to port: `classifyIntent` test cases (lines 20-95), mock patterns for `callLLM`, `makePrisma()` factory. Adapt for PostgREST `fetch` instead of Prisma.
  - `tests/inngest/lib/create-task-and-dispatch.test.ts:15-30` — `vi.stubGlobal('fetch', ...)` pattern for PostgREST mocking

  **WHY Each Reference Matters**:
  - `mention-handler.ts` is the source code being replaced — copy its classification logic exactly, then enhance with archetype context
  - `feedback-responder.ts` shows the PostgREST fetch pattern used inside Inngest functions — follow the same headers/URL construction
  - `notification-channel.ts` confirms `archetype.notification_channel` is the field to query for channel→archetype lookup
  - `mention-handler.test.ts` provides the exact test cases to port — all 4 intents + fallback + model assertion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Classification returns correct intent for each category
    Tool: Bash
    Preconditions: Test file exists at tests/gateway/services/interaction-classifier.test.ts
    Steps:
      1. Run: pnpm test -- tests/gateway/services/interaction-classifier.test.ts --run
      2. Assert exit code 0
      3. Assert output contains "Tests  X passed" where X >= 12
    Expected Result: All classification tests pass — feedback, teaching, question, task intents + fallback + archetype context variants
    Failure Indicators: Any test failure or "FAIL" in output
    Evidence: .sisyphus/evidence/task-1-classifier-tests.txt

  Scenario: Archetype resolution handles missing data gracefully
    Tool: Bash
    Preconditions: Test file exists
    Steps:
      1. Run: pnpm test -- tests/gateway/services/interaction-classifier.test.ts --run
      2. Check test output for "resolveArchetypeFromChannel" and "resolveArchetypeFromTask" describe blocks
      3. Assert all pass including: direct match, fallback to first tenant archetype, no archetype found, task not found
    Expected Result: All archetype resolution tests pass
    Failure Indicators: Any test in the "resolve" blocks fails
    Evidence: .sisyphus/evidence/task-1-archetype-resolution-tests.txt

  Scenario: Build succeeds with new service file
    Tool: Bash
    Preconditions: Source file created
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: TypeScript compilation succeeds
    Failure Indicators: tsc errors, non-zero exit code
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-classifier-tests.txt
  - [ ] task-1-archetype-resolution-tests.txt
  - [ ] task-1-build.txt

  **Commit**: YES
  - Message: `feat(interactions): add interaction classifier service with Haiku classification`
  - Files: `src/gateway/services/interaction-classifier.ts`, `tests/gateway/services/interaction-classifier.test.ts`
  - Pre-commit: `pnpm test -- tests/gateway/services/interaction-classifier.test.ts --run`

- [x] 2. Unified Event Payload Design + Bolt Handler Update

  **What to do**:
  - Update `src/gateway/slack/handlers.ts` to fire `employee/interaction.received` instead of the two separate events:
    - **Thread reply path** (currently `message` event handler, ~line 92-121):
      - Keep existing logic: filter for thread replies, not bot, has user+text
      - Keep existing `findTaskIdByThreadTs()` lookup
      - Change `inngest.send()` from `employee/feedback.received` to:
        ```typescript
        inngest.send({
          name: 'employee/interaction.received',
          data: {
            source: 'thread_reply',
            text: msg.text,
            userId: msg.user,
            channelId: msg.channel,
            threadTs: msg.thread_ts,
            taskId: taskId, // resolved from deliverables
            tenantId: undefined, // resolved inside the Inngest handler from taskId
            team: undefined, // not needed for thread replies
          },
        });
        ```
    - **@mention path** (currently `app_mention` event handler, ~line 128-163):
      - Keep existing logic: strip bot mention, resolve tenantId from team
      - Change `inngest.send()` from `employee/mention.received` to:
        ```typescript
        inngest.send({
          name: 'employee/interaction.received',
          data: {
            source: 'mention',
            text: cleanedText,
            userId: mention.user,
            channelId: mention.channel,
            threadTs: mention.thread_ts,
            taskId: undefined, // mentions don't have a task context
            tenantId: tenantId, // resolved from team
            team: mention.team, // for tenant lookup fallback
          },
        });
        ```
  - The unified event payload shape:
    ```typescript
    {
      source: 'thread_reply' | 'mention';
      text: string;
      userId: string;
      channelId: string;
      threadTs?: string;
      taskId?: string;     // present for thread_reply
      tenantId?: string;   // present for mention (resolved from team)
      team?: string;       // Slack team ID, for mention tenant resolution
    }
    ```

  **Must NOT do**:
  - Do NOT change anything in `handlers.ts` beyond the two `inngest.send()` call sites
  - Do NOT change the approval/rejection button handlers
  - Do NOT restructure the handler file
  - Do NOT remove the `findTaskIdByThreadTs()` helper

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two targeted `inngest.send()` call changes — minimal scope, clear before/after
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:92-121` — Current `message` event handler with `inngest.send('employee/feedback.received', ...)` — change this call
  - `src/gateway/slack/handlers.ts:128-163` — Current `app_mention` event handler with `inngest.send('employee/mention.received', ...)` — change this call
  - `src/gateway/slack/handlers.ts:62-85` — `findTaskIdByThreadTs()` helper — do NOT modify, just reference for understanding

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after Bolt handler changes
    Tool: Bash
    Preconditions: handlers.ts modified
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: TypeScript compilation succeeds with new event name
    Failure Indicators: tsc errors referencing handlers.ts
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: Old event names no longer fired from handlers.ts
    Tool: Bash
    Preconditions: handlers.ts modified
    Steps:
      1. Run: grep -n "employee/feedback.received" src/gateway/slack/handlers.ts
      2. Assert no output (exit code 1)
      3. Run: grep -n "employee/mention.received" src/gateway/slack/handlers.ts
      4. Assert no output (exit code 1)
      5. Run: grep -n "employee/interaction.received" src/gateway/slack/handlers.ts
      6. Assert output shows two matches (one for thread reply, one for mention)
    Expected Result: Only `employee/interaction.received` event is fired from handlers.ts
    Failure Indicators: Old event names still present, or fewer than 2 occurrences of new event
    Evidence: .sisyphus/evidence/task-2-event-names.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-build.txt
  - [ ] task-2-event-names.txt

  **Commit**: YES (groups with Task 5 if run sequentially)
  - Message: `refactor(slack): update Bolt handlers to fire unified interaction event`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Unified Interaction Handler Inngest Function + Tests

  **What to do**:
  - Create `src/inngest/interaction-handler.ts` with:
    - Export `createInteractionHandlerFunction(inngest: Inngest): InngestFunction`
    - Inngest function ID: `employee/interaction-handler`
    - Trigger event: `employee/interaction.received`
    - **Step 1 — `resolve-context`**: Based on `event.data.source`:
      - If `thread_reply`: call `resolveArchetypeFromTask(taskId)` → returns `{ id, role_name, tenantId }`. If null, log warning + return early.
      - If `mention`: use `event.data.tenantId`. Call `resolveArchetypeFromChannel(channelId, tenantId)` → returns `{ id, role_name }` or null. If tenantId is falsy, log warning + return early.
    - **Step 2 — `classify-intent`**: Call `InteractionClassifier.classifyIntent(text, archetypeContext)`. `archetypeContext` = `{ role_name }` if archetype was resolved, undefined otherwise.
    - **Step 3 — `route-and-store`**: Based on classified intent:
      - `feedback`: POST to PostgREST `feedback` table — `{ task_id: taskId || null, feedback_type: source === 'thread_reply' ? 'thread_reply' : 'mention_feedback', correction_reason: text, created_by: userId, tenant_id: tenantId, original_decision: null, corrected_decision: null }`
      - `teaching`: POST to PostgREST `feedback` table — same as feedback but `feedback_type: 'teaching'`
      - `question`: Query PostgREST `knowledge_base_entries?tenant_id=eq.{tenantId}&select=content&limit=5`. Call `callLLM()` with Haiku: system prompt = `"You are {role_name}. Answer this question based on the following knowledge:\n{kbContent}\n\nIf you don't have enough information, say so honestly."`, user message = `text`. Store the LLM answer for the ack step.
      - `task`: No storage. Log: `"Task intent received — stubbed, not implemented"`.
    - **Step 4 — `send-acknowledgment`**: Load tenant Slack bot token via `loadTenantEnv()`. Create Slack client. Post ack as thread reply:
      - For `feedback`/`teaching`: Generate Haiku in-character ack (same as current feedback-responder pattern): system = `"You are {role_name}. A human has given you feedback on your work. Acknowledge it warmly and briefly in character. Max 2 sentences."`, user = feedbackText. Post with `thread_ts` and task ID context block.
      - For `question`: Post the LLM answer from step 3 with `thread_ts` and task ID context block (use archetype ID as context if no task ID).
      - For `task`: Post a brief ack: `"Got it! I'll work on that."` with `thread_ts` and context block.
      - **CRITICAL**: Always pass `thread_ts` to `postMessage()` — fixes the existing bug where acks posted as top-level messages.
      - **CRITICAL**: Always include task ID context block: `{ type: 'context', elements: [{ type: 'mrkdwn', text: 'Task \`{taskId || archetypeId}\`' }] }` per AGENTS.md Slack Message Standards.
      - If `SLACK_BOT_TOKEN` is missing from `loadTenantEnv()`, log warning and skip ack (don't throw).
    - **Step 5 — `emit-downstream-events`**: Based on intent:
      - `feedback`/`teaching`: `step.sendEvent('emit-rule-extract', { name: 'employee/rule.extract-requested', data: { tenantId, feedbackId: storedFeedbackId, feedbackType: intent, source: event.data.source } })` — GM-18 stub
      - `task`: `step.sendEvent('emit-task-requested', { name: 'employee/task.requested', data: { tenantId, text, userId, channelId, archetypeId: archetype?.id } })` — task stub
      - `question`: no downstream event
  - Create `tests/inngest/interaction-handler.test.ts`:
    - Follow Pattern A: `(fn as any).fn({ event, step })` direct invocation
    - Local `makeStep()`, `makeEvent(overrides)`, `invokeHandler()` helpers
    - Mock: `vi.mock()` for `call-llm`, `slack-client`, `tenant-env-loader`, `interaction-classifier`
    - `vi.stubGlobal('fetch', ...)` for PostgREST feedback storage + KB lookup
    - Test cases (minimum 15):
      - Thread reply → feedback intent: stores with `feedback_type: 'thread_reply'`, ack sent with `thread_ts`, GM-18 event emitted
      - Thread reply → teaching intent: stores with `feedback_type: 'teaching'`, ack sent
      - Thread reply → question intent: KB lookup, Haiku answer, ack with answer, no GM-18 event
      - Thread reply → task intent: no storage, stub event emitted, brief ack
      - Mention → feedback intent: stores with `feedback_type: 'mention_feedback'`, ack sent, GM-18 event
      - Mention → teaching intent: stores with `feedback_type: 'teaching'`, ack sent
      - Mention → question intent: KB lookup, ack with answer
      - Mention → task intent: stub event, brief ack
      - Missing tenantId on mention: early return, no classification
      - Missing taskId on thread reply (task not found): early return, no classification
      - No Slack bot token: ack step skipped, no throw
      - Ack includes `thread_ts` (exact value assertion, not matcher)
      - Ack includes task ID context block (exact block structure assertion)
      - Model assertion: classification uses `anthropic/claude-haiku-4-5`
      - KB lookup for question: `knowledgeBaseEntry` fetch called with correct tenant_id, limit=5

  **Must NOT do**:
  - Do NOT emit `employee/feedback.stored` — that event is owned by the now-deleted `feedback-responder` pipeline
  - Do NOT use Prisma directly — use PostgREST `fetch()` for all DB operations
  - Do NOT implement actual task creation for `task` intent — stub event only
  - Do NOT implement semantic search for `question` intent — simple `findMany` with limit

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core logic with 5 steps, 4 intent routes, PostgREST integration, LLM calls, Slack ack, downstream events — highest complexity task in the plan
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential within wave)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/inngest/feedback-handler.ts` — FULL FILE — Current handler being replaced. Copy the PostgREST tenant resolution pattern (lines 20-35) and event emission pattern (lines 50-60).
  - `src/inngest/feedback-responder.ts` — FULL FILE — Current ack generator being replaced. Copy the Haiku ack generation pattern (lines 40-80) and `loadTenantEnv()` → Slack client creation pattern (lines 30-40).
  - `src/inngest/mention-handler.ts` — FULL FILE — Current handler being replaced. Copy the MentionHandler delegation pattern but inline classification via the new `InteractionClassifier`.
  - `src/gateway/services/feedback-service.ts:ingestThreadReply()` — Storage pattern: what fields go into `prisma.feedback.create()`. Adapt for PostgREST POST.

  **API/Type References**:
  - `src/gateway/services/interaction-classifier.ts` — New classifier from Task 1: `classifyIntent()`, `resolveArchetypeFromChannel()`, `resolveArchetypeFromTask()`
  - `src/lib/call-llm.ts:CallLLMOptions` — Interface for question-answering LLM call
  - `src/lib/slack-client.ts:createSlackClient` — Factory for Slack posting

  **Test References**:
  - `tests/inngest/feedback-handler.test.ts` — FULL FILE — Primary test pattern to follow: `makeStep()`, `makeEvent()`, `(fn as any).fn()` invocation, `step.sendEvent` assertions
  - `tests/inngest/feedback-responder.test.ts` — Test pattern for `vi.hoisted()` + `vi.mock()` for Slack client and callLLM
  - `tests/gateway/services/mention-handler.test.ts` — Classification test cases to port (all 4 intents + fallback)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All interaction handler tests pass
    Tool: Bash
    Preconditions: Handler and test file created
    Steps:
      1. Run: pnpm test -- tests/inngest/interaction-handler.test.ts --run
      2. Assert exit code 0
      3. Assert output contains "Tests  X passed" where X >= 15
    Expected Result: All 15+ test cases pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-handler-tests.txt

  Scenario: Thread reply ack includes thread_ts (bug fix verification)
    Tool: Bash
    Preconditions: Tests exist
    Steps:
      1. Run: pnpm test -- tests/inngest/interaction-handler.test.ts --run -t "thread_ts"
      2. Assert test specifically asserts mockPostMessage called with thread_ts value
    Expected Result: Test passes proving thread_ts is passed to postMessage
    Failure Indicators: Test fails or thread_ts assertion missing
    Evidence: .sisyphus/evidence/task-3-thread-ts-fix.txt

  Scenario: Task ID context block included in ack
    Tool: Bash
    Preconditions: Tests exist
    Steps:
      1. Run: pnpm test -- tests/inngest/interaction-handler.test.ts --run -t "context block"
      2. Assert test asserts blocks array contains context element with task ID
    Expected Result: Test passes proving context block is included
    Failure Indicators: Test fails or context block assertion missing
    Evidence: .sisyphus/evidence/task-3-context-block.txt

  Scenario: Build succeeds with new handler file
    Tool: Bash
    Preconditions: Source file created
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: TypeScript compilation succeeds
    Failure Indicators: tsc errors
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-handler-tests.txt
  - [ ] task-3-thread-ts-fix.txt
  - [ ] task-3-context-block.txt
  - [ ] task-3-build.txt

  **Commit**: YES
  - Message: `feat(interactions): add unified interaction-handler Inngest function`
  - Files: `src/inngest/interaction-handler.ts`, `tests/inngest/interaction-handler.test.ts`
  - Pre-commit: `pnpm test -- tests/inngest/interaction-handler.test.ts --run`

- [x] 4. Update serve.ts Registration

  **What to do**:
  - Update `src/gateway/inngest/serve.ts`:
    - Import `createInteractionHandlerFunction` from `../../inngest/interaction-handler.js`
    - Remove imports for `createFeedbackHandlerFunction`, `createMentionHandlerFunction`, `createFeedbackResponderFunction`
    - Replace `feedbackHandlerFn`, `mentionHandlerFn`, `feedbackResponderFn` in the function array with `interactionHandlerFn`
    - Net result: function count goes from 9 → 7 (remove 3, add 1)
  - Do NOT modify `tests/gateway/inngest-serve.test.ts` — it's a pre-existing failure per AGENTS.md

  **Must NOT do**:
  - Do NOT touch `inngest-serve.test.ts`
  - Do NOT change function ordering beyond the swap
  - Do NOT add any new configuration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, import swap + array modification — trivial change
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 3)
  - **Blocks**: Task 6
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts` — FULL FILE — Current registration listing all 9 functions. Modify the imports and function array.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after serve.ts changes
    Tool: Bash
    Preconditions: serve.ts modified, interaction-handler.ts exists
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: No import errors, TypeScript compilation succeeds
    Failure Indicators: Module not found errors for old imports or new import
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: Old handler imports removed from serve.ts
    Tool: Bash
    Preconditions: serve.ts modified
    Steps:
      1. Run: grep -n "createFeedbackHandlerFunction\|createMentionHandlerFunction\|createFeedbackResponderFunction" src/gateway/inngest/serve.ts
      2. Assert no output (exit code 1)
      3. Run: grep -n "createInteractionHandlerFunction" src/gateway/inngest/serve.ts
      4. Assert output shows the import line
    Expected Result: Only new handler imported, old handlers gone
    Failure Indicators: Old imports still present
    Evidence: .sisyphus/evidence/task-4-imports.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-build.txt
  - [ ] task-4-imports.txt

  **Commit**: YES
  - Message: `refactor(inngest): register interaction-handler, remove old handlers from serve`
  - Files: `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Verify Bolt Handler Wiring (merged with Task 2 execution)

  **What to do**:
  - This task verifies that the Bolt handler changes from Task 2 are correctly wired end-to-end with the new unified handler from Task 3.
  - Run `pnpm build` to verify no broken imports between `handlers.ts` → `serve.ts` → `interaction-handler.ts`
  - Verify the event name `employee/interaction.received` in `handlers.ts` matches the trigger in `interaction-handler.ts`

  **Must NOT do**:
  - Do NOT make additional changes to `handlers.ts`
  - Do NOT add new handler registrations

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification only — no code changes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2

  **References**:
  - `src/gateway/slack/handlers.ts` — Updated in Task 2
  - `src/inngest/interaction-handler.ts` — Created in Task 3

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Event name consistency between Bolt and Inngest
    Tool: Bash
    Preconditions: Tasks 2 and 3 completed
    Steps:
      1. Run: grep -n "employee/interaction.received" src/gateway/slack/handlers.ts
      2. Assert 2 matches (one for thread reply, one for mention)
      3. Run: grep -n "employee/interaction.received" src/inngest/interaction-handler.ts
      4. Assert at least 1 match (the trigger event)
    Expected Result: Event name is consistent across Bolt handler and Inngest function
    Failure Indicators: Mismatch in event names or missing occurrences
    Evidence: .sisyphus/evidence/task-5-event-consistency.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-event-consistency.txt

  **Commit**: NO (verification only)

- [x] 6. Delete Old Handler Files + Old Tests

  **What to do**:
  - Before deletion, verify no other callers exist:
    - Use `lsp_find_references` on `createFeedbackHandlerFunction` — confirm only `serve.ts` (already updated)
    - Use `lsp_find_references` on `createMentionHandlerFunction` — confirm only `serve.ts`
    - Use `lsp_find_references` on `createFeedbackResponderFunction` — confirm only `serve.ts`
  - Delete source files:
    - `src/inngest/feedback-handler.ts`
    - `src/inngest/mention-handler.ts`
    - `src/inngest/feedback-responder.ts`
    - `src/gateway/services/mention-handler.ts` (service class — replaced by interaction-classifier)
    - `src/gateway/services/feedback-service.ts` (service class — storage now inline in handler via PostgREST)
  - Delete test files:
    - `tests/inngest/feedback-handler.test.ts`
    - `tests/inngest/feedback-responder.test.ts`
    - `tests/gateway/services/mention-handler.test.ts`
    - `tests/gateway/services/feedback-service.test.ts`
  - Verify no dangling imports: `pnpm build` must exit 0 after all deletions
  - **IMPORTANT**: Check if `FeedbackService` or `MentionHandler` are imported anywhere else (e.g., in `feedback-summarizer.ts`). If `feedback-summarizer.ts` uses `FeedbackService`, do NOT delete `feedback-service.ts` — only delete if there are zero remaining callers.

  **Must NOT do**:
  - Do NOT delete `feedback-summarizer.ts` — it's a cron trigger that's still active
  - Do NOT modify `inngest-serve.test.ts` — pre-existing failure
  - Do NOT delete any files without first verifying zero callers via lsp_find_references

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion + reference verification — straightforward but needs care
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 4, 5

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts` — Already updated in Task 4, should have no imports of old functions
  - `src/inngest/triggers/feedback-summarizer.ts` — Check if it imports `FeedbackService` — if so, do NOT delete `feedback-service.ts`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All old handler files are deleted
    Tool: Bash
    Preconditions: Tasks 3-5 completed, serve.ts updated
    Steps:
      1. Run: ls src/inngest/feedback-handler.ts 2>&1
      2. Assert: "No such file or directory"
      3. Run: ls src/inngest/mention-handler.ts 2>&1
      4. Assert: "No such file or directory"
      5. Run: ls src/inngest/feedback-responder.ts 2>&1
      6. Assert: "No such file or directory"
    Expected Result: All three old Inngest function files are gone
    Failure Indicators: Any file still exists
    Evidence: .sisyphus/evidence/task-6-files-deleted.txt

  Scenario: Build succeeds after all deletions
    Tool: Bash
    Preconditions: Files deleted
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: No dangling imports — TypeScript compilation succeeds
    Failure Indicators: Module not found errors for deleted files
    Evidence: .sisyphus/evidence/task-6-build.txt

  Scenario: No references to old function names remain in source
    Tool: Bash
    Preconditions: Files deleted
    Steps:
      1. Run: grep -r "createFeedbackHandlerFunction\|createMentionHandlerFunction\|createFeedbackResponderFunction" src/ --include="*.ts"
      2. Assert no output (exit code 1) — no source references remain
    Expected Result: Zero references to old function creators in src/
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-6-no-refs.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-files-deleted.txt
  - [ ] task-6-build.txt
  - [ ] task-6-no-refs.txt

  **Commit**: YES
  - Message: `refactor(interactions): remove deprecated feedback-handler, mention-handler, feedback-responder`
  - Files: all deleted files
  - Pre-commit: `pnpm build && pnpm test -- --run`

- [x] 7. Full Build + Test + Lint Verification

  **What to do**:
  - Run the complete verification suite:
    1. `pnpm build` — TypeScript compilation
    2. `pnpm lint` — ESLint checks
    3. `pnpm test -- --run` — Full test suite
  - Document results. If any new test failures appear (beyond the known pre-existing ones: `container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`), investigate and fix.
  - Count total passing tests and compare to baseline (should be similar to pre-change, minus deleted tests, plus new tests)

  **Must NOT do**:
  - Do NOT fix pre-existing test failures
  - Do NOT modify test infrastructure

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run commands, check output — no code changes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Task 6

  **References**:
  - AGENTS.md — Pre-existing test failures list (do NOT fix these)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build, lint, and test pass
    Tool: Bash
    Preconditions: All implementation tasks completed
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Run: pnpm lint
      4. Assert exit code 0
      5. Run: pnpm test -- --run
      6. Assert no NEW failures (only pre-existing ones)
    Expected Result: Build, lint, and tests all pass
    Failure Indicators: New test failures, build errors, lint errors
    Evidence: .sisyphus/evidence/task-7-full-verification.txt

  Scenario: New tests are included in test run
    Tool: Bash
    Preconditions: Test files created
    Steps:
      1. Run: pnpm test -- --run 2>&1 | grep -E "interaction-handler|interaction-classifier"
      2. Assert output shows both test files were run
    Expected Result: Both new test files appear in test output
    Failure Indicators: New test files not found in test run
    Evidence: .sisyphus/evidence/task-7-new-tests-included.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-full-verification.txt
  - [ ] task-7-new-tests-included.txt

  **Commit**: NO (verification only)

- [x] 8. API Endpoint Verification via Inngest Dev Server

  **What to do**:
  - Start dev services if not already running: `pnpm dev:start` (use tmux for long-running process)
  - Wait for Inngest dev server to be ready at `http://localhost:8288`
  - Query registered Inngest functions:
    ```bash
    curl -s http://localhost:8288/v1/fns | jq '.[].id'
    ```
  - Verify:
    - `employee/interaction-handler` IS present
    - `employee/feedback-handler` is NOT present
    - `employee/mention-handler` is NOT present
    - `employee/feedback-responder` is NOT present
    - All other existing functions still registered (lifecycle, summarizer, etc.)
  - Count total registered functions — should be 7 (was 9, removed 3, added 1)

  **Must NOT do**:
  - Do NOT send real Slack events — this is registration verification only
  - Do NOT modify any code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Start services, run curl, check output — pure verification
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 9)
  - **Blocks**: None
  - **Blocked By**: Task 7

  **References**:
  - AGENTS.md — Long-running commands section: use tmux for `pnpm dev:start`
  - `src/gateway/inngest/serve.ts` — Updated registration file

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Inngest dev server shows correct function registration
    Tool: Bash
    Preconditions: Dev services running (pnpm dev:start via tmux)
    Steps:
      1. Run: curl -s http://localhost:8288/v1/fns | jq '.[].id' > /tmp/inngest-fns.txt
      2. Assert: grep -c "interaction-handler" /tmp/inngest-fns.txt returns 1
      3. Assert: grep -c "feedback-handler" /tmp/inngest-fns.txt returns 0
      4. Assert: grep -c "mention-handler" /tmp/inngest-fns.txt returns 0
      5. Assert: grep -c "feedback-responder" /tmp/inngest-fns.txt returns 0
      6. Assert: wc -l /tmp/inngest-fns.txt shows 7 functions
    Expected Result: Only unified handler registered, old handlers absent, correct total count
    Failure Indicators: Old function IDs present, new function absent, wrong count
    Evidence: .sisyphus/evidence/task-8-inngest-functions.txt

  Scenario: Dev services start without errors
    Tool: Bash (tmux)
    Preconditions: No services running
    Steps:
      1. Start: tmux new-session -d -s ai-dev "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev:start 2>&1 | tee /tmp/ai-dev.log"
      2. Wait 30 seconds
      3. Check: tail -20 /tmp/ai-dev.log
      4. Assert: log shows Inngest dev server ready and gateway running
    Expected Result: Services start cleanly, Inngest registers all functions
    Failure Indicators: Startup errors, function registration failures
    Evidence: .sisyphus/evidence/task-8-dev-start.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-inngest-functions.txt
  - [ ] task-8-dev-start.txt

  **Commit**: NO (verification only)

- [x] 9. Update Story Map Document

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the PLAT-10 acceptance criteria section
  - Mark ALL acceptance criteria checkboxes as checked (`- [x]`)
  - Specifically mark:
    - [x] New unified Inngest function: `employee/interaction-handler` replaces both handlers
    - [x] All interactions go through same classification pipeline
    - [x] Classification uses Haiku with archetype context
    - [x] Thread replies: resolve archetype from taskId
    - [x] @mentions: resolve archetype from channel-to-archetype mapping
    - [x] All classified interactions produce acknowledgment in Slack thread
    - [x] feedback/teaching: store in feedback table, trigger learned rule extraction (GM-18)
    - [x] question: answer inline using KB lookup + callLlm
    - [x] task: create a task and trigger employee lifecycle (stubbed)
    - [x] Old handlers removed
    - [x] Bolt event handlers updated to fire unified event
    - [x] pnpm build exits 0, pnpm test -- --run passes

  **Must NOT do**:
  - Do NOT modify any other stories in the document
  - Do NOT change PLAT-10's description or attributes
  - Do NOT mark stories other than PLAT-10

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit — mark checkboxes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: Task 10
  - **Blocked By**: Task 7

  **References**:
  - `docs/2026-04-21-2202-phase1-story-map.md` — Story map file, PLAT-10 section (around lines 477-502)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All PLAT-10 checkboxes marked complete
    Tool: Bash
    Preconditions: Story map file edited
    Steps:
      1. Run: grep -A 20 "PLAT-10" docs/2026-04-21-2202-phase1-story-map.md | grep -c "\- \[x\]"
      2. Assert count >= 12 (all acceptance criteria checked)
      3. Run: grep -A 20 "PLAT-10" docs/2026-04-21-2202-phase1-story-map.md | grep -c "\- \[ \]"
      4. Assert count = 0 (no unchecked criteria remain)
    Expected Result: All PLAT-10 acceptance criteria marked as complete
    Failure Indicators: Any unchecked criteria remain
    Evidence: .sisyphus/evidence/task-9-story-map-update.txt
  ```

  **Evidence to Capture:**
  - [ ] task-9-story-map-update.txt

  **Commit**: YES
  - Message: `docs: mark PLAT-10 unified interaction handler as complete in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: none

- [x] 10. Notify Completion via Telegram

  **What to do**:
  - Send Telegram notification that PLAT-10 implementation is complete:
    ```bash
    tsx scripts/telegram-notify.ts "✅ plat-10-unified-interaction-handler complete — All tasks done. Come back to review results."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Task 9

  **References**:
  - AGENTS.md — Telegram notification rules

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent successfully
    Tool: Bash
    Preconditions: telegram-notify.ts script exists
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ plat-10-unified-interaction-handler complete — All tasks done. Come back to review results."
      2. Assert exit code 0
    Expected Result: Notification sent
    Failure Indicators: Non-zero exit code, network error
    Evidence: .sisyphus/evidence/task-10-telegram.txt
  ```

  **Evidence to Capture:**
  - [ ] task-10-telegram.txt

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start dev services (`pnpm dev:start`). Query Inngest dev server (`http://localhost:8288/v1/fns`) and verify: `employee/interaction-handler` present, `employee/feedback-handler` absent, `employee/mention-handler` absent, `employee/feedback-responder` absent. Verify build passes. Run full test suite. Capture all evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Inngest Fns [PASS/FAIL] | Build [PASS/FAIL] | Tests [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                                    | Files                                                                                                     | Pre-commit Check                                                           |
| ---- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1    | `feat(interactions): add interaction classifier service with Haiku classification`                | `src/gateway/services/interaction-classifier.ts`, `tests/gateway/services/interaction-classifier.test.ts` | `pnpm test -- tests/gateway/services/interaction-classifier.test.ts --run` |
| 2    | `refactor(slack): update Bolt handlers to fire unified interaction event`                         | `src/gateway/slack/handlers.ts`                                                                           | `pnpm build`                                                               |
| 3    | `feat(interactions): add unified interaction-handler Inngest function`                            | `src/inngest/interaction-handler.ts`, `tests/inngest/interaction-handler.test.ts`                         | `pnpm test -- tests/inngest/interaction-handler.test.ts --run`             |
| 4    | `refactor(inngest): register interaction-handler, remove old handlers from serve`                 | `src/gateway/inngest/serve.ts`                                                                            | `pnpm build`                                                               |
| 5    | Groups with Task 2                                                                                | —                                                                                                         | —                                                                          |
| 6    | `refactor(interactions): remove deprecated feedback-handler, mention-handler, feedback-responder` | deleted files + deleted test files                                                                        | `pnpm build && pnpm test -- --run`                                         |
| 7-8  | No commit — verification only                                                                     | —                                                                                                         | —                                                                          |
| 9    | `docs: mark PLAT-10 unified interaction handler as complete in story map`                         | `docs/2026-04-21-2202-phase1-story-map.md`                                                                | —                                                                          |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: exit 0
pnpm lint           # Expected: exit 0
pnpm test -- --run  # Expected: all pass (excluding known pre-existing failures)

# Inngest function registration (requires dev services running)
curl -s http://localhost:8288/v1/fns | jq '.[].id' | grep -c 'interaction-handler'
# Expected: 1

curl -s http://localhost:8288/v1/fns | jq '.[].id' | grep -c 'feedback-handler'
# Expected: 0

curl -s http://localhost:8288/v1/fns | jq '.[].id' | grep -c 'mention-handler'
# Expected: 0

curl -s http://localhost:8288/v1/fns | jq '.[].id' | grep -c 'feedback-responder'
# Expected: 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Old files deleted
- [ ] Story-map updated
- [ ] Telegram notification sent
