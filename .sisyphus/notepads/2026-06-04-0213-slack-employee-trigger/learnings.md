# Learnings

## [2026-06-04] Session Start — Key Discoveries

### slack-action-ids.ts

- File: `src/lib/slack-action-ids.ts`
- Pattern: `APPROVE: 'approve'` — snake_case string values, PascalCase keys
- Export: `export const SLACK_ACTION_ID = { ... } as const;`
- Also exports: `export type SlackActionId = (typeof SLACK_ACTION_ID)[keyof typeof SLACK_ACTION_ID];`
- Need to add: `TRIGGER_CONFIRM: 'trigger_confirm'` and `TRIGGER_CANCEL: 'trigger_cancel'`

### interaction-handler.ts — stub ack location

- Line 398-400: `else { ackText = "Got it! I'll work on that."; }` — this is the task intent branch
- The `send-acknowledgment` step posts ackText to Slack. If ackText is null/empty, need to guard.
- Lines 402-433: The ack posting block — need to add `if (!ackText) return;` guard before building ackBlocks
- Lines 450-461: `employee/task.requested` event emission — MISSING `threadTs` in payload. Must add.
- Line 55: `const archetype = await resolveArchetypeFromChannel(channelId, tenantId);` — caller uses `archetype?.id` and `archetype?.role_name`

### interaction-classifier.ts — resolveArchetypeFromChannel

- Lines 45-82: Current return type: `{ id, role_name, notification_channel } | null`
- Two-step query: exact match by notification_channel first, then fallback to oldest active
- Need to change return type to `{ archetype: {...} | null, isExactMatch: boolean }`
- Caller at interaction-handler.ts:55-60 must be updated to use `result.archetype?.id` etc.

### handlers.ts — app_mention handler

- Lines 240-285: app_mention handler
- `mention.user` is the user who mentioned the bot
- `mention.team` is the Slack team ID
- No bot self-mention guard currently
- No DM guard currently
- Bolt context may provide `context.botUserId` — need to check handler signature
- Current handler fires `employee/interaction.received` — guard must return before this

### Dispatch interface (from prior research)

- `dispatchEmployee()` in `employee-dispatcher.ts` takes `slug` (role_name), NOT archetypeId
- `createTaskAndDispatch()` in `create-task-and-dispatch.ts` takes `archetypeSlug` (role_name)
- Neither accepts archetypeId directly
- Task 6 handler will need to fetch role_name from archetype row first, then use dispatchEmployee()

## [Task 5 Research] Dispatch Interface — Confirmed Details

### createTaskAndDispatch() — RECOMMENDED for Task 6

- Params: `{ inngest, step, tenantId, archetypeSlug (role_name), externalId, sourceSystem }`
- Wraps everything in `step.run(...)` — safe for Inngest step context
- Uses PostgREST (not Prisma) — works inside Inngest functions
- Built-in deduplication by externalId
- Does NOT accept archetypeId — must resolve role_name first

### dispatchEmployee() — NOT suitable for Task 6

- Params: `{ tenantId, slug (role_name), dryRun, prisma, inngest, inputs? }`
- Uses Prisma — NOT available in Inngest function context
- Gateway-only (Express route handlers)
- Supports dry-run and inputs

### Task 6 pattern

1. Receive `archetypeId` from event payload
2. Fetch archetype row via PostgREST to get `role_name` 3. Call `createTaskAndDispatch({ ..., archetypeSlug: roleName, externalId: 'slack-trigger-${messageTs}-${archetypeId}', sourceSystem: 'slack' })`

## [Task 3 Complete] resolveArchetypeFromChannel return type change

### What changed

- `resolveArchetypeFromChannel` now returns `{ archetype: {...} | null, isExactMatch: boolean }` instead of `{...} | null`
- `isExactMatch: true` when `notification_channel` matches exactly
- `isExactMatch: false` on fallback to oldest active archetype
- `isExactMatch: false` when no archetypes found (archetype is null)
- Error path also returns `{ archetype: null, isExactMatch: false }` (was returning `null`)

### Files changed

- `src/gateway/services/interaction-classifier.ts` — function signature + return values
- `src/inngest/interaction-handler.ts` — caller updated: `archetype?.id` → `result.archetype?.id`
- `tests/gateway/services/interaction-classifier.test.ts` — 3 test assertions updated to new shape

### Pre-existing test failures (NOT regressions)

- `tests/worker-tools/hostfully/get-properties.test.ts` — pre-existing
- `src/worker-tools/notion/__tests__/get-page.test.ts` — pre-existing
- `tests/gateway/admin-projects-read.test.ts` — flaky/pre-existing

## Task 6: slack-trigger-handler.ts

- `loadTenantEnv` requires `{ tenantRepo, secretRepo }` deps — must instantiate `PrismaClient` + repos inside step and call `prisma.$disconnect()` in finally block
- `resolveArchetypeFromChannel` returns `{ archetype, isExactMatch }` — archetype has `{ id, role_name, notification_channel }`
- Pattern for getting Slack token inside Inngest steps: same Prisma+repo pattern as `interaction-handler.ts:367-371`
- `SLACK_ACTION_ID.TRIGGER_CONFIRM` and `TRIGGER_CANCEL` already exist in `src/lib/slack-action-ids.ts`
- `threadTs` may be undefined for top-level channel mentions — use `event.data.ts` as fallback
- `prettifyRoleName` exported as standalone helper (needed by Task 10 tests)
- `event.data.ts` typed as `string | undefined` in the spread — cast with `as string | undefined`

## Task 7: TRIGGER_CONFIRM and TRIGGER_CANCEL handlers (2026-06-04)

### Pattern
- Both handlers follow the exact APPROVE/REJECT pattern: `ack({ replace_original: true, blocks: [...] })` immediately, then business logic, then `respond({ replace_original: true, ... })` for final state.
- Button `value` is a JSON string: `{ archetypeId, tenantId, userId, channelId, threadTs, text }`.

### Inlining createTaskAndDispatch
- `createTaskAndDispatch` uses `step.run()` — not usable in action handlers (no Inngest step context).
- Inlined the logic directly: fetch archetype by `archetypeId` (not `role_name`), duplicate check on `externalId`, POST to `/rest/v1/tasks`, then `inngest.send('employee/task.dispatched')`.
- `externalId` format: `slack-trigger-${threadTs}-${archetypeId}`.

### InngestLike
- `inngest` parameter to `registerSlackHandlers` is `InngestLike` which has `send({ name, data, id? })`.
- Can call `inngest.send()` directly inside action handlers — no step wrapper needed.

### SUPABASE helpers
- Module-level `SUPABASE_URL()`, `SUPABASE_KEY()`, `supabaseHeaders()` functions are available to all handlers.

### Files modified
- `src/gateway/slack/handlers.ts` — lines 1385+ (TRIGGER_CONFIRM at 1385, TRIGGER_CANCEL at 1552)

## Task 8: Input Collection Flow (2026-06-04)

### In-memory Map approach
- `pendingInputCollections = new Map<string, PendingInputCollection>()` at module level in handlers.ts
- Key is `ctx.threadTs` (the parent thread ts from the original @mention)
- Entry deleted from map immediately when reply is detected (prevent double-fire)

### message handler ordering
- MUST check `pendingInputCollections` BEFORE `findTaskIdByThreadTs`
- After firing `employee/trigger.input-received`, return early — do NOT fall through to interaction handling

### TRIGGER_CONFIRM handler changes
- Add `client` to destructured params to use `client.chat.postMessage` for new thread messages
- Archetype fetch: `select=id,role_name,input_schema` (was `select=id,role_name`)
- Filter for required inputs: `required===true && (frequency==='every_run' || frequency===undefined)`
- `raw_event: { inputs: { prompt: ctx.text } }` added to task creation for no-input path
- `raw_event: { inputs: { prompt: pending.text, ...collectedInputs } }` used in input collector

### createSlackInputCollectorFunction
- New export in `slack-trigger-handler.ts`
- Triggers on `employee/trigger.input-received`
- `externalId` format: same as TRIGGER_CONFIRM — `slack-trigger-${threadTs}-${archetypeId}`
- Uses `step.sendEvent` (not `inngest.send`) for dispatching within Inngest step context
- No `id` field on `step.sendEvent` — different API from `inngest.send`

### serve.ts registration
- `createSlackTriggerHandlerFunction` (from task 6) was NOT registered — added in task 8
- `createSlackInputCollectorFunction` also added in task 8
- Total active Inngest functions: 7 (was 5)

### Build result
- `pnpm build` EXIT_CODE:0 with all 3 files modified

## Task 9: routeToEmployee LLM routing (2026-06-04)

### Function signature
- `routeToEmployee(text, archetypes, callLLMFn)` — exported from `slack-trigger-handler.ts`
- Returns `{ archetype, confidence }` or null
- callLLMFn typed as `typeof callLLM` (same pattern as InteractionClassifier)

### Short-circuit behavior
- Single archetype → returns `{ archetype: archetypes[0], confidence: 100 }` without LLM call
- Empty array → returns null
- Multi-archetype (future): calls LLM, parses JSON `{ employee_index, confidence }`

### LLM call pattern (same as classifyIntent)
- `taskType: 'review'`, `temperature: 0`, `maxTokens: 50`
- No model param → reads `gateway_llm_model` platform setting (default: deepseek/deepseek-v4-flash)
- Injection boundary: `<user_message>{text}</user_message>` in user message
- JSON response shape: `{ "employee_index": 0, "confidence": 85 }`
- Confidence threshold: 50 — below this returns null

### route-employee step integration
- Positioned after `!botToken` check (avoid LLM call when no bot token)
- Before post-decline check (routing determines final archetype)
- For v1 (single archetype, isExactMatch may be false): always returns `resolution.archetype`
- `routedArchetype` replaces `resolution.archetype` in decline check + send-confirmation

### Import path
- `import { callLLM } from '../lib/call-llm.js'` (file is at `src/inngest/`, lib is at `src/lib/`)
- Task spec said `../../lib/call-llm.js` — that would be WRONG. Correct is `../lib/call-llm.js`

### Build result
- `pnpm build` EXIT_CODE:0 — no TypeScript errors

## Task 10: Unit tests for slack-trigger-handler (2026-06-04)

### Test file created
- `tests/inngest/slack-trigger-handler.test.ts` — 10 tests, all passing

### Inngest function handler invocation pattern
- `(fn as any).fn({ event, step })` — access internal `.fn` property on the function object returned by `inngest.createFunction()`
- Same pattern as `interaction-handler.test.ts` line 80: `(fn as any).fn({ event, step })`
- `@ts-expect-error` NOT needed — just cast with `as any`

### resolveArchetypeFromChannel tests
- Already covered in `tests/gateway/services/interaction-classifier.test.ts` with correct new return type
- No additions needed — 3 existing tests cover exact match, fallback, and null cases

### routeToEmployee tests
- Function exists in `slack-trigger-handler.ts` but not exported
- Tests skipped — function needs to be exported first (Task 9 scope)

### Mocking pattern
- `vi.hoisted()` for module mocks that must be hoisted above imports
- `vi.mock('@prisma/client')` — mock PrismaClient for loadTenantEnv steps
- `vi.mock('../../src/gateway/services/interaction-classifier.js')` — mock resolveArchetypeFromChannel
- `vi.stubGlobal('fetch', mockFetch)` in beforeEach — mock Slack API calls

### Test count: 10 total
- prettifyRoleName: 5 tests
- createSlackTriggerHandlerFunction: 5 tests (including 1 existence test)
