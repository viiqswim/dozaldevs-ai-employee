# Learnings — summarizer-mvp

## [2026-04-15] Session Start

### Architecture Decisions (from planning phase)

- **One Universal Docker Image**: All employees share single image. Behavior is driven by archetype DB record.
- **CMD Override Routing**: Engineering uses default Dockerfile CMD (entrypoint.sh). Generic harness uses `cmd: ["node", "/app/dist/workers/generic-harness.mjs"]` override via Fly.io Machines API `config.init.cmd`.
- **Tool Registry**: Static map of tool name → ToolDefinition. No dynamic loading. Archetype steps specify tool name + params.
- **Param Resolution**: `$ENV_VAR` resolved from process.env, `$prev_result` resolved from previous step output.
- **Deliverables Bridge**: Machine writes summary + metadata to `deliverables` table. Lifecycle reads it after approval.
- **Generic Lifecycle**: One lifecycle function handles ALL non-engineering employees. Triggered by `employee/task.dispatched` event.
- **Trigger Adapters**: Thin 3-5 line functions that call `createTaskAndDispatch()`. Summarizer trigger = cron adapter.
- **Approval**: Conditional on `archetype.risk_model.approval_required`. Timeout from `risk_model.timeout_hours`.
- **Event Namespace**: `employee/task.dispatched`, `employee/approval.received` (generic, not per-employee).
- **External ID Format**: `summary-{YYYY-MM-DD}` for duplicate prevention.
- **Default Tenant UUID**: `00000000-0000-0000-0000-000000000001`
- **Summarizer Archetype Slug**: `daily-summarizer`
- **Cron**: `0 8 * * 1-5` with `timezone: 'America/Chicago'`

### Frozen Files (DO NOT MODIFY)

- `src/workers/entrypoint.sh`
- `src/workers/orchestrate.mts`
- `src/inngest/lifecycle.ts`

### Key Stack

- Gateway: Fastify → Express + @slack/bolt + @slack/web-api (Wave 0)
- DB ORM: Prisma + PostgREST for workers
- Supabase: PostgREST on http://localhost:54321
- Inngest Dev: http://localhost:8288
- Gateway: http://localhost:3000

### VLRE Reference Files

- `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/daily-summary-scheduler.ts` — Papi Chulo persona + system prompt
- `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/channel-fetcher.ts` — channel history fetcher
- `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/daily-summary-blocks.ts` — Block Kit builders

## [2026-04-15-1502] Task: 0a — Gateway Fastify → Express + Slack Bolt

- `@slack/bolt` 4.x: `ExpressReceiver` mounts Bolt's router via `receiver.router` (not `app`). Mount with `app.use(receiver.router)`.
- `ExpressReceiver` `endpoints` option sets the path for Bolt's interactions handler (e.g. `/webhooks/slack/interactions`).
- Removing `fastify` from `package.json` causes TS errors in all route files that import from `fastify` — this is expected until Task 0b converts them. `server.ts` itself compiles clean.
- The `buildApp()` return type changed from `Promise<FastifyInstance>` to `Promise<BuildAppResult>` — tests importing `buildApp` will need updating in Task 0b.
- `express 5.x` is installed (latest). Types `@types/express 5.x` match.
- Module-level `export let expressApp` and `export let boltApp` allow route files and Bolt handlers to import the live instances after startup.
- `PrismaClient` was imported in old server.ts for route registration — removed since route registration moves to Task 0b.

## [2026-04-15-1517] Task: 0b — Fastify→Express Route Conversion

### Key Patterns

**Inngest Express adapter**: `serve()` from `inngest/express` returns a standard Express middleware `(req, res) => void`. Mount it as `app.use('/api/inngest', router)` where `router.use(handler)`. The handler reads `req.originalUrl` so it gets the full path even when mounted under a prefix.

**Raw body for HMAC verification**: Use `express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } })` — cleanest approach, populates `rawBody` before JSON parsing without interfering with the stream.

**Test infrastructure**: Replaced Fastify's `app.inject()` with a `TestApp` wrapper class (in `tests/setup.ts`) that uses `supertest`. Wraps an Express `Application` in an `http.Server`. Provides `inject()`, `ready()` (no-op), `close()` interface matching Fastify's test API.

**supertest + array headers**: When Fastify tests pass `headers: { 'x-foo': ['a', 'b'] }`, convert to `req.set('x-foo', 'a, b')` (comma-join). HTTP spec and Express both handle it as a single string — length mismatch triggers auth failures correctly.

**Route function signature**: `FastifyPluginAsync` → `function (): Router`. `app.register(fn, opts)` → `app.use(fn(opts))`. Admin middleware changed from `fastify.addHook('preHandler', fn)` → `router.use(fn)`.

**`buildApp()` return**: Now returns `{ app: express.Application; boltApp: App | undefined }`. Callers must destructure `{ app }`.

### Files Modified

- `src/gateway/middleware/admin-auth.ts` — `preHandlerHookHandler` → `RequestHandler`
- `src/gateway/routes/health.ts` — Router
- `src/gateway/routes/github.ts` — Router
- `src/gateway/routes/jira.ts` — Router, raw body via `req.rawBody`, pino logger
- `src/gateway/routes/admin-projects.ts` — Router, `router.use(requireAdminKey)`
- `src/gateway/inngest/serve.ts` — `inngest/fastify` → `inngest/express`, `router.use(handler)`
- `src/gateway/server.ts` — All routes registered via `app.use()`, raw body via `express.json({ verify })`
- `tests/setup.ts` — Added `TestApp` class, updated `createTestApp` → returns `TestApp`
- `tests/gateway/*.test.ts` (10 files) — `FastifyInstance` → `TestApp`, Fastify instance creation → Express

### Dependencies Added

- `supertest@7.2.2` (devDep)
- `@types/supertest@7.2.0` (devDep)

## [2026-04-15] Task: 1 — Schema Migration

- Added system_prompt, steps, model, deliverable_type to Archetype model
- Migration: add-archetype-config-fields (20260415212203_add_archetype_config_fields)
- PostgREST verified: HTTP 200 on new fields
- Build verified: pnpm build exits 0 with zero TypeScript errors

## [2026-04-15] Task: 2 — Tool Interface Definition

- Created src/workers/tools/types.ts with ToolContext, ToolDefinition, StepDefinition, ArchetypeConfig
- Created src/workers/tools/registry.ts with empty TOOL_REGISTRY (tools added in T3/T4/T8)
- Created src/workers/tools/param-resolver.ts with resolveParams
- Created src/workers/tools/index.ts re-exporting everything
- Logger type imported from src/lib/logger.ts (export type Logger = pino.Logger)
- param-resolver: $ENV_VAR → env[VAR], $prev_result → previousResult, non-$ → passthrough
- Build verified: pnpm build exits 0, dist/workers/tools/ contains all 4 compiled files

## [2026-04-15] Task: 4 — llm.generate tool
- Created src/workers/tools/llm-generate.ts wrapping callLLM
- callLLM signature: { model, messages, taskType, taskId?, temperature?, maxTokens?, timeoutMs? } → { content, model, promptTokens, completionTokens, estimatedCostUsd, latencyMs }
- Note: result fields are camelCase (promptTokens, completionTokens), not snake_case
- taskType is required — used 'execution' for tool calls
- Registered as 'llm.generate' in TOOL_REGISTRY
- Falls back to OPENROUTER_MODEL env var if model not in params
- Registry cast: `llmGenerateTool as unknown as ToolDefinition` needed because generic params don't overlap with Record<string, unknown>

## [2026-04-15] Task: 6 — Env Vars + Slack Prerequisites
- Added Summarizer section to .env.example: SLACK_SIGNING_SECRET, DAILY_SUMMARY_CHANNELS, SUMMARY_TARGET_CHANNEL, FLY_SUMMARIZER_APP, SUMMARIZER_VM_SIZE
- JIRA_WEBHOOK_SECRET: already warn-only at startup in server.ts (lines 36-40) — no change needed
- Jira HMAC validation in routes/jira.ts unchanged — still rejects unsigned requests (returns 401)
- jira.ts lines 31-35: when secret missing, returns 401 "Webhook signing not configured"
- pnpm build: PASS (zero TypeScript errors)
- Unsigned Jira webhook curl: 401 confirmed

## [2026-04-15] Task 5 — FlyMachineConfig cmd field
- Added `cmd?: string[]` to `FlyMachineConfig` interface in `src/lib/fly-client.ts`
- `cmd` passed via `config.init.cmd` in Fly.io API request body (spread conditional: `...(config.cmd ? { init: { cmd: config.cmd } } : {})`)
- Backward compatible: `init` key omitted entirely from body when `cmd` not provided
- All 14 fly-client tests pass; `pnpm build` clean

## [2026-04-15] Task: 3 — slack.readChannels tool
- Created src/workers/tools/slack-read-channels.ts
- Uses @slack/web-api WebClient (NOT raw fetch)
- Ported from VLRE channel-fetcher.ts: pagination, thread replies, fatal error codes
- Params: { channels: string (comma-separated), lookback_hours: number }
- Returns: { channels: [{ channelId, messages, threadReplies }] }
- Registered as 'slack.readChannels' in TOOL_REGISTRY

## [2026-04-15] Task: 8 — slack.postMessage tool
- Created src/workers/tools/slack-post-message.ts
- Uses @slack/web-api WebClient (NOT raw fetch)
- Block Kit: header + summary section + divider + stats context + divider + actions (approve/reject buttons)
- Button action_ids: "approve" and "reject" — value is task_id for routing
- Returns { ts, channel } for later message editing
- Registered as 'slack.postMessage' in TOOL_REGISTRY

## [2026-04-15] Task 11 — Bolt Action Handlers
- Created src/gateway/slack/handlers.ts with approve + reject handlers
- Handlers fire employee/approval.received event with deterministic ID: employee-approval-{taskId}
- InngestLike interface redefined inline in handlers.ts to avoid circular import (server.ts imports handlers.ts)
- Registered in server.ts after boltApp creation via registerSlackHandlers(boltApp, options.inngestClient)
- Guard: only registers if options.inngestClient is defined
- Bolt handles HMAC verification automatically — no manual verification needed
- Unsigned requests rejected by Bolt (non-200); when Slack not configured, route not mounted → 404

## [2026-04-15] Task: 12 — Archetype + Department Seeding
- Added Operations department to seed (fixed UUID: 00000000-0000-0000-0000-000000000010)
- Added daily-summarizer archetype with full Papi Chulo system prompt (fixed UUID: 00000000-0000-0000-0000-000000000011)
- system_prompt: Spanish dramatic news correspondent style (600 word max)
- 3 steps: slack.readChannels → llm.generate → slack.postMessage
- model: anthropic/claude-sonnet-4-20250514
- deliverable_type: slack_message
- risk_model: { approval_required: true, timeout_hours: 24 }
- Seed is idempotent via upsert by fixed ID (no unique constraint on role_name/name — must use id)
- Prisma client must be regenerated (npx prisma generate) when new schema fields are added before seed runs

## [2026-04-15] Task 10 — Generic Employee Lifecycle + createTaskAndDispatch
- Created src/inngest/lib/create-task-and-dispatch.ts
- Created src/inngest/employee-lifecycle.ts (function ID: employee/task-lifecycle)
- Added updateMessage to src/lib/slack-client.ts
- Added content + metadata fields to Deliverable model via migration (20260415213855_add_deliverable_content_metadata)
- Lifecycle trigger: employee/task.dispatched
- Approval: conditional on archetype.risk_model.approval_required
- Machine cmd: ["node", "/app/dist/workers/generic-harness.mjs"]
- Deliverable query: via external_ref=eq.{taskId}
- step typed as `any` in create-task-and-dispatch.ts — same implicit-any pattern as existing lifecycle.ts/redispatch.ts; build passes clean
- Registered employeeLifecycleFn in src/gateway/inngest/serve.ts functions array

## [2026-04-15] Task: T9 — generic-harness.mts

### File: `src/workers/generic-harness.mts`

- Created the generic worker harness entry point for non-engineering employees
- CMD override: `["node", "/app/dist/workers/generic-harness.mjs"]`
- Module-level `TASK_ID: string` guaranteed via IIFE + `process.exit(1)` — TypeScript narrows to `string` but only within same scope, not across function boundaries. Used IIFE pattern to declare `const TASK_ID: string` at module level.
- PostgREST join `select=*,archetypes(*)` returns archetype as nested object (not array) for `*-to-one` FK relations — but code handles both object and array defensively.
- Deliverable `content` = first step result with `.text` string field (llm.generate result); fallback JSON.stringify
- Deliverable `metadata` = `{ approval_message_ts, target_channel, blocks: null }` if last step result has `{ ts, channel }` (slack.postMessage); otherwise null
- Execution record: `{ task_id, runtime_type: 'generic-harness', status: 'running' }` — note `started_at` NOT in Prisma schema, omitted
- Task status flow: `Ready` → `Executing` → `Submitting` (success) or `Failed` (error)
- Inngest event: `employee/task.completed` with deterministic id `employee-complete-{taskId}`
- SIGTERM handler uses `.finally(() => process.exit(1))` to ensure exit after async PATCH
- Build: pnpm build exits 0, zero TypeScript errors
- Tests: 817 passing (> 515 minimum), no regressions from this change
- Output: `dist/workers/generic-harness.mjs` confirmed present after build

## [2026-04-15] Task 13 — Verification Gate 2
- Build: PASS
- Lint: PASS (0 errors, 92 warnings — all pre-existing)
- Tests: 817 passing, 51 pre-existing failures (no new regressions)
- Docker image rebuilt: generic-harness.mjs present at /app/dist/workers/generic-harness.mjs
- Archetype seeded: PASS — daily-summarizer confirmed via PostgREST (model=anthropic/claude-sonnet-4-20250514, has_system_prompt=true, step_count=3, deliverable_type=slack_message)
- Wave 2 committed: feat(summarizer): add generic harness, lifecycle, webhook, and archetype seed (a700569)

## [2026-04-15] Task 14 — Wire Approval Webhook
- handlers.ts: approve/reject handlers verified, fire employee/approval.received with correct payload
- deterministic event ID: employee-approval-{taskId} confirmed
- updateMessage: confirmed in slack-client.ts (calls chat.update, same retry pattern as postMessage)
- employee-lifecycle.ts: waitForEvent confirmed with correct event name and match (`event: 'employee/approval.received'`, `match: 'data.taskId'`, `timeout: '${timeoutHours}h'`)
- On approve: reads deliverable, posts summary to target channel, updates approval message, marks task Done ✅
- On reject: updates approval message, marks task Cancelled ✅
- On timeout (null approvalEvent): updates approval message, marks task Cancelled ✅
- Build: PASS (zero TypeScript errors)

## [2026-04-15] Task 15 — Register Lifecycle + Summarizer Trigger
- Created src/inngest/triggers/summarizer-trigger.ts
- Cron: 0 8 * * 1-5 (UTC) — timezone option not supported in triggers array format
- Inngest createFunction takes 2 args: (options, handler) — trigger goes in options.triggers[]
- Registered in serve.ts — now 5 functions total
- Build: PASS

## [2026-04-15] Task 16 — Duplicate Prevention Tests
- Created tests/inngest/lib/create-task-and-dispatch.test.ts
- 4 test cases: duplicate blocked, terminal allows re-run, archetype not found, happy path
- Tests pass: PASS (4/4)
- Key pattern: `vi.stubGlobal('fetch', vi.fn())` + `mockStep.run` that immediately invokes callback
- `pnpm test -- --run <path>` runs ALL tests; use `npx vitest run <path>` for targeted single-file run

## [2026-04-15] Task 17 — Automated Tests
- Created tests/workers/tools/param-resolver.test.ts (7 tests)
- Created tests/workers/tools/slack-post-message.test.ts (6 tests)
- Created tests/inngest/triggers/summarizer-trigger.test.ts (4 tests)
- Total new tests: 17 — all passing, no regressions
- vi.hoisted() required for mock vars referenced inside vi.mock() factory (temporal dead zone)
- mockPostMessage.mockClear() needed in beforeEach when shared mock accumulates calls across tests
- vitest singleFork:true runs all suite tests together; use `npx vitest run FILE1 FILE2...` to target specific files and avoid 40s orchestrate overhead
