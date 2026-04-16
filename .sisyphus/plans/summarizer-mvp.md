# Summarizer AI Employee — Config-Driven MVP

## TL;DR

> **Quick Summary**: Bring the VLRE Slack daily summarizer (Papi Chulo) into the AI Employee Platform as the first non-engineering employee, using a config-driven architecture where employee behavior is defined by archetype records in the DB — not code files per employee. Build a generic worker harness, a platform tool registry, and a summarizer Inngest lifecycle function with Slack approval flow.
>
> **Deliverables**:
>
> - Generic worker harness that reads archetype config and executes tools
> - Platform tool registry with `slack.readChannels`, `slack.postMessage`, `llm.generate`
> - Summarizer archetype record (Papi Chulo persona, explicit step config)
> - Summarizer Inngest lifecycle (cron → dispatch machine → poll → approval → deliver)
> - Slack interaction webhook for approval/rejection buttons
> - Schema migration for archetype config fields
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Schema Migration → Tool Interface → Generic Harness → Lifecycle Function → Approval Flow → E2E

---

## Context

### Original Request

Build the first non-engineering AI employee (Slack daily summarizer) to validate the platform's generality. The existing VLRE summarizer (Papi Chulo) generates dramatic Spanish news-style digests of Slack channel activity.

### Interview Summary

**Key Discussions**:

- **Image Strategy**: One universal Docker image for all employees. No Dockerfile changes when adding new employee types. Archetype config determines behavior.
- **No Code Per Employee**: User explicitly rejected "skill module .ts per employee." New employees must be creatable via DB config alone (if tools already exist).
- **Tool Registry**: Platform provides reusable tools. Archetype selects which tools to use + provides explicit ordered steps.
- **Orchestration**: Explicit steps in archetype config, executed deterministically (not autonomous LLM).
- **Execution Model**: Fly.io Machine (full vision) — even though summarizer only needs ~30-60s of compute. Validates the complete platform path.
- **Machine Pools**: Skip for MVP. Keep current create-on-demand pattern.
- **Supervised Mode**: Summary held for human approval via Slack interactive buttons.
- **Approval Timeout**: 24 hours → auto-cancel.
- **Cron**: `0 8 * * 1-5` with `timezone: 'America/Chicago'` (no holiday calendar).
- **Target Workspace**: VLRE Slack workspace.
- **Persona**: Keep Papi Chulo dramatic Spanish news correspondent.

### Research Findings

- **Worker audit**: 15+ hardcoded engineering assumptions. Archetype table exists with right fields but is completely unused. Worker never reads `archetype_id`.
- **Fly.io**: Pre-created stopped machines are the recommended pattern (~10ms startup). Deferred to post-MVP.
- **Routing mechanism**: Fly.io API supports `config.cmd` override — summarizer machine runs a different entrypoint (`generic-harness.mjs`) without modifying engineering's `entrypoint.sh`.
- **Slack client**: Only `postMessage` exists. Need `conversations.history` (raw fetch, extend existing pattern). No Slack SDK needed.
- **VLRE reference**: `daily-summary-scheduler.ts`, `channel-fetcher.ts`, `daily-summary-blocks.ts` — proven implementation to port.

### Metis Review

**Identified Gaps** (addressed):

- Schema missing `system_prompt`, `steps`, `model`, `deliverable_type` on Archetype → added migration task
- No routing mechanism in worker → solved via Fly.io CMD override + generic harness
- Tool interface undefined → added as first task (Wave 1)
- Approval flow splits across machine (generate + post) and lifecycle (wait + deliver) → documented clearly
- Duplicate run prevention → idempotency via `external_id: summary-{YYYY-MM-DD}`
- Slack signing secret prerequisite → added env var + verification

---

## Work Objectives

### Core Objective

Validate the AI Employee Platform's generality by deploying a non-engineering employee (Slack summarizer) that runs through the full machine lifecycle, driven entirely by archetype configuration.

### Concrete Deliverables

- `prisma/migrations/*/` — Archetype schema additions
- `src/workers/tools/types.ts` — Tool interface contract
- `src/workers/tools/slack-read-channels.ts` — Slack channel history tool
- `src/workers/tools/slack-post-message.ts` — Slack post with Block Kit tool
- `src/workers/tools/llm-generate.ts` — LLM generation wrapper tool
- `src/workers/generic-harness.mts` — Generic worker harness (reads archetype, executes tools)
- `src/inngest/employee-lifecycle.ts` — **Generic** lifecycle for ALL non-engineering employees (event-triggered, with conditional approval)
- `src/inngest/lib/create-task-and-dispatch.ts` — Reusable utility: create task + fire dispatch event + duplicate detection
- `src/inngest/triggers/summarizer-trigger.ts` — Thin cron trigger adapter (3-5 lines of logic)
- `src/gateway/server.ts` (rewritten) — Express + Bolt replaces Fastify
- `src/gateway/routes/*.ts` (converted) — All routes migrated from Fastify to Express
- `src/gateway/slack/handlers.ts` — Bolt action handlers for Slack interactions
- `prisma/seed.ts` (updated) — Summarizer archetype + Operations department seed
- `src/lib/fly-client.ts` (updated) — `cmd` field in FlyMachineConfig
- `src/lib/slack-client.ts` (updated) — `updateMessage` method for editing approval messages

### Definition of Done

- [ ] `pnpm build` passes with zero errors
- [ ] `pnpm test -- --run` passes with 515+ tests (no regressions) + new tests
- [ ] Summarizer archetype exists in DB with system_prompt, tools, steps, model
- [ ] Inngest Dev Server shows `employee/task-lifecycle` (generic) + `trigger/daily-summarizer` (cron `0 8 * * 1-5`)
- [ ] `POST /webhooks/slack/interactions` returns 200 with valid signing
- [ ] Machine dispatch creates worker with CMD override (not entrypoint.sh)

### Must Have

- Generic worker harness reads archetype from Supabase and dispatches to tools
- Tool registry with standard interface — all tools conform to same contract
- Archetype config contains system_prompt, tools list, explicit steps, model, deliverable_type
- Step definitions are structured JSON (tool + params), not natural language
- Params support `$ENV_VAR` and `$prev_result` variable interpolation
- **Generic employee lifecycle** function handles ALL non-engineering employees (not one per employee)
- **Thin trigger adapters** create tasks and fire dispatch events (3-5 lines per trigger)
- Approval flow is **conditional** on `archetype.risk_model.approval_required`
- **Deliverables table** bridges machine output → lifecycle approval handling (machine writes summary + metadata before exiting, lifecycle reads it after approval)
- Slack webhook verifies signing secret (HMAC-SHA256)
- Approval: Approve → read deliverable → post final summary, Reject → cancel, Timeout (from `risk_model.timeout_hours`) → cancel
- Idempotency: `external_id = summary-{YYYY-MM-DD}` prevents duplicate daily runs
- `updateMessage` added to Slack client for editing approval messages post-action
- Papi Chulo persona fully written in archetype seed (not TBD)

### Must NOT Have (Guardrails)

- Do NOT modify `src/workers/entrypoint.sh` — engineering entrypoint is frozen
- Do NOT modify `src/workers/orchestrate.mts` — engineering worker logic is frozen
- Do NOT modify `src/inngest/lifecycle.ts` — engineering lifecycle is frozen
- Do NOT use raw `fetch` for Slack API calls — use `@slack/web-api` (official SDK with types, rate limiting, pagination)
- Do NOT make Archetype schema fields non-nullable — would break existing rows
- Do NOT add redispatch/retry logic for summarizer — one attempt per day, fail gracefully
- Do NOT put channel IDs in archetype steps config — use `DAILY_SUMMARY_CHANNELS` env var
- Do NOT make cron schedule configurable from DB — hardcode in Inngest function
- Do NOT add follow-up Q&A (@mention in summary threads) — post-MVP
- Do NOT build Event Router or Colleague Discovery — out of scope
- Do NOT create a UI for approval management — Slack-native only
- Do NOT activate multi-tenancy — keep single default tenant UUID `00000000-0000-0000-0000-000000000001`
- Do NOT change `FLY_WORKER_APP` env var — introduce separate `FLY_SUMMARIZER_APP` if needed
- Do NOT generalize the approval flow beyond summarizer — generalize after second use case

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ passing tests)
- **Automated tests**: YES (Tests-after — write tests for new code after implementation)
- **Framework**: Vitest (`pnpm test -- --run`)
- **Verification frequency**: After every 2-3 implementation tasks

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Database**: Use Bash (curl to PostgREST) — Query tables, assert row data
- **Inngest**: Use Bash (curl to Inngest Dev Server API) — Check function registration, events
- **Worker**: Use Bash (Docker run) — Verify harness boots and reads config

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Gateway Migration — 3 tasks, sequential):
├── Task 0a: Migrate gateway from Fastify to Express + install @slack/bolt + @slack/web-api [deep]
├── Task 0b: Convert all routes to Express + switch Inngest adapter [unspecified-high]
└── Task 0c: Verification Gate 0 (all existing tests pass, engineering flow unbroken)

Wave 1 (Foundation — all parallel, 7 tasks, after Wave 0):
├── Task 1: Schema migration (Archetype fields) [quick]
├── Task 2: Tool interface definition [quick]
├── Task 3: slack.readChannels tool (using @slack/web-api) [unspecified-high]
├── Task 4: llm.generate tool wrapper [quick]
├── Task 5: FlyMachineConfig cmd field [quick]
├── Task 6: Env vars + Slack prerequisites verification [quick]
└── Task 7: Verification Gate 1 (build + test + schema check)

Wave 2 (Core — 6 tasks, after Wave 1):
├── Task 8: slack.postApprovalMessage tool (Block Kit + buttons, using @slack/web-api) [unspecified-high]
├── Task 9: Generic worker harness (depends: 2, 3, 4) [deep]
├── Task 10: Generic employee lifecycle + createTaskAndDispatch (depends: 1, 5) [deep]
├── Task 11: Bolt action handlers for Slack interactions (depends: 0a) [unspecified-high]
├── Task 12: Archetype + Department seeding (depends: 1) [unspecified-high]
└── Task 13: Verification Gate 2 (build + test + integration checks)

Wave 3 (Approval Flow + Integration — 5 tasks, after Wave 2):
├── Task 14: Wire Bolt handlers → generic lifecycle events (depends: 10, 11) [unspecified-high]
├── Task 15: Register lifecycle + summarizer trigger adapter (depends: 10) [quick]
├── Task 16: Verify duplicate prevention + edge cases (depends: 10) [quick]
├── Task 17: Automated tests for tools + lifecycle + Bolt handlers [unspecified-high]
└── Task 18: Verification Gate 3 (build + test + full integration)

Wave 4 (E2E + Documentation — 3 tasks, after Wave 3):
├── Task 19: Full E2E manual test (cron → machine → summary → approval) [deep]
├── Task 20: AGENTS.md + documentation updates [quick]
└── Task 21: Verification Gate 4 (final)

Wave FINAL (4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T0a → T0b → T0c → T1 → T2 → T9 → T10 → T14 → T19 → F1-F4 → user okay
Parallel Speedup: ~55% faster than sequential
Max Concurrent: 7 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks     | Wave |
| ---- | ---------- | ---------- | ---- |
| 0a   | —          | 0b         | 0    |
| 0b   | 0a         | 0c         | 0    |
| 0c   | 0a, 0b     | Wave 1     | 0    |
| 1    | 0c         | 10, 12     | 1    |
| 2    | 0c         | 3, 4, 8, 9 | 1    |
| 3    | 2          | 9          | 1    |
| 4    | 2          | 9          | 1    |
| 5    | 0c         | 10         | 1    |
| 6    | 0c         | 11         | 1    |
| 7    | 1-6        | Wave 2     | 1    |
| 8    | 2          | 9, 14      | 2    |
| 9    | 2, 3, 4, 8 | 19         | 2    |
| 10   | 1, 5       | 14, 15, 16 | 2    |
| 11   | 0a         | 14         | 2    |
| 12   | 1          | 9, 19      | 2    |
| 13   | 8-12       | Wave 3     | 2    |
| 14   | 10, 11     | 19         | 3    |
| 15   | 10         | 19         | 3    |
| 16   | 10         | 19         | 3    |
| 17   | 8-12       | 18         | 3    |
| 18   | 14-17      | Wave 4     | 3    |
| 19   | 14, 15, 16 | F1-F4      | 4    |
| 20   | —          | F1-F4      | 4    |
| 21   | 19, 20     | F1-F4      | 4    |

### Agent Dispatch Summary

- **Wave 0**: 3 tasks — T0a → `deep`, T0b → `unspecified-high`, T0c → `unspecified-high`
- **Wave 1**: 7 tasks — T1-T2,T4-T6 → `quick`, T3 → `unspecified-high`, T7 → `unspecified-high`
- **Wave 2**: 6 tasks — T8 → `unspecified-high`, T9 → `deep`, T10 → `deep`, T11 → `unspecified-high`, T12 → `unspecified-high`, T13 → `unspecified-high`
- **Wave 3**: 5 tasks — T14 → `unspecified-high`, T15-T16 → `quick`, T17 → `unspecified-high`, T18 → `unspecified-high`
- **Wave 4**: 3 tasks — T19 → `deep`, T20 → `quick`, T21 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 0a. Migrate Gateway from Fastify to Express + Install Slack Libraries

  **What to do**:
  - Install packages: `express`, `@slack/bolt`, `@slack/web-api`, `@types/express`
  - Remove packages: `fastify`, `@fastify/cors`, and any Fastify-specific plugins
  - Rewrite `src/gateway/server.ts`:
    - Replace Fastify app with Express app
    - Initialize Slack Bolt `App` with `ExpressReceiver`:
      ```typescript
      const receiver = new ExpressReceiver({
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        endpoints: '/webhooks/slack/interactions',
      });
      const boltApp = new App({ token: process.env.SLACK_BOT_TOKEN, receiver });
      ```
    - Bolt's `ExpressReceiver` exposes an Express `app` — use it as the main Express app, OR mount Bolt's receiver inside our own Express app
    - Configure CORS, JSON parsing, health check
    - Export the Express app and Bolt app for route registration and Slack handler registration
  - The `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` should be optional at startup (not all deployments need Slack). Initialize Bolt only when both are set. Log a warning otherwise.

  **Must NOT do**:
  - Do NOT change route paths — all URLs (`/webhooks/jira`, `/admin/projects`, etc.) must remain identical
  - Do NOT change the Inngest integration yet (that's Task 0b)
  - Do NOT modify route handler LOGIC — only change the framework API (e.g., `request.body` → `req.body`, `reply.send()` → `res.send()`)
  - Do NOT remove Fastify from the codebase until ALL routes are migrated and verified

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Framework migration touching the core server. Must be careful not to break the engineering flow.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (sequential)
  - **Blocks**: Tasks 0b, 0c, and ALL subsequent tasks
  - **Blocked By**: None

  **References**:
  - `src/gateway/server.ts` — Current Fastify server setup. Study the entire file to understand: CORS config, route registration, plugin system, startup sequence.
  - `src/gateway/routes/*.ts` — All 5 route files. These use Fastify's `FastifyInstance`, `FastifyRequest`, `FastifyReply`. Must be converted to Express `Router`, `Request`, `Response`.
  - `src/gateway/inngest/serve.ts` — Inngest Fastify adapter. Will need Express adapter (Task 0b).
  - Express docs: `https://expressjs.com/en/api.html`
  - Bolt for JavaScript: `https://slack.dev/bolt-js/` — Getting started, ExpressReceiver
  - `@slack/web-api`: `https://slack.dev/node-slack-sdk/web-api`

  **Acceptance Criteria**:
  - [ ] Express app starts on the same port as before
  - [ ] `@slack/bolt` and `@slack/web-api` installed
  - [ ] Bolt initialized with ExpressReceiver (when SLACK_SIGNING_SECRET is set)
  - [ ] Gateway starts without Slack env vars (graceful degradation)

  **QA Scenarios**:

  ```
  Scenario: Gateway starts with Express
    Tool: Bash
    Steps:
      1. Start gateway
      2. curl -s http://localhost:3000/health
      3. Assert: 200 OK
    Expected Result: Health endpoint responds
    Evidence: .sisyphus/evidence/task-0a-health.txt

  Scenario: Gateway starts without Slack env vars
    Tool: Bash
    Steps:
      1. Unset SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN
      2. Start gateway
      3. Assert: starts with warning log, no crash
    Expected Result: Graceful degradation
    Evidence: .sisyphus/evidence/task-0a-no-slack.txt
  ```

  **Commit**: NO (groups with 0b)

---

- [x] 0b. Convert All Routes to Express + Switch Inngest Adapter

  **What to do**:
  - Convert all route files from Fastify to Express router format:
    - `src/gateway/routes/admin-projects.ts` — Admin API CRUD
    - `src/gateway/routes/github.ts` — GitHub webhook
    - `src/gateway/routes/health.ts` — Health check
    - `src/gateway/routes/jira.ts` — Jira webhook with HMAC verification
  - For each route file:
    - Replace `FastifyInstance` with `express.Router()`
    - Replace `FastifyRequest` / `FastifyReply` with `Request` / `Response`
    - Replace `request.body` → `req.body`, `reply.send()` → `res.send()`, `reply.code()` → `res.status()`
    - Replace Fastify schema validation with Express middleware (or remove for MVP — validation logic stays in handlers)
  - Switch Inngest adapter:
    - `src/gateway/inngest/serve.ts` uses Inngest's Fastify adapter → switch to Express adapter
    - Inngest has `serve({ client, functions })` for Express — check their docs
  - Update all route registration in `server.ts` to use `app.use()` instead of `app.register()`
  - Remove all Fastify dependencies from `package.json`

  **Must NOT do**:
  - Do NOT change any route handler BUSINESS LOGIC — only framework API conversions
  - Do NOT change route paths or HTTP methods
  - Do NOT change HMAC verification logic in Jira webhook (just adapt the crypto calls to Express req/res)
  - Do NOT remove any existing tests — update their imports

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Mechanical conversion of 5 route files + Inngest adapter. Must preserve exact behavior.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on 0a)
  - **Parallel Group**: Wave 0 (sequential)
  - **Blocks**: Task 0c
  - **Blocked By**: Task 0a

  **References**:
  - `src/gateway/routes/admin-projects.ts` — Admin API (CRUD routes, error handling)
  - `src/gateway/routes/github.ts` — GitHub webhook handler
  - `src/gateway/routes/health.ts` — Simple health check
  - `src/gateway/routes/jira.ts` — Jira webhook with HMAC-SHA256 verification (most complex)
  - `src/gateway/inngest/serve.ts` — Current Inngest Fastify adapter
  - Inngest Express adapter: `https://www.inngest.com/docs/reference/serve#framework-express`

  **Acceptance Criteria**:
  - [ ] All routes respond at same paths with same status codes
  - [ ] Jira webhook rejects unsigned requests (HMAC still works)
  - [ ] Inngest functions register (visible in Dev Server)
  - [ ] `pnpm build` passes
  - [ ] Fastify completely removed from package.json

  **QA Scenarios**:

  ```
  Scenario: All existing routes work
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. curl -s http://localhost:3000/health → 200
      2. curl -s -X POST http://localhost:3000/webhooks/jira -d '{}' → 401 (unsigned)
      3. curl -s http://localhost:3000/admin/projects -H "X-Admin-Key: $ADMIN_API_KEY" → 200
      4. curl -s http://localhost:8288/v1/fns | jq 'length' → 3 (existing functions)
    Expected Result: All endpoints respond correctly
    Evidence: .sisyphus/evidence/task-0b-routes.txt

  Scenario: Inngest functions still register
    Tool: Bash (curl)
    Steps:
      1. curl -s http://localhost:8288/v1/fns | jq '.[].name'
      2. Assert: contains engineering/task-lifecycle, engineering/task-redispatch, engineering/task-watchdog
    Expected Result: All 3 existing functions present
    Evidence: .sisyphus/evidence/task-0b-inngest.txt
  ```

  **Commit**: NO (groups with 0a)

---

- [x] 0c. Verification Gate 0 — Gateway Migration Complete

  **What to do**:
  - Run comprehensive verification:
    1. `pnpm build` — zero TypeScript errors
    2. `pnpm test -- --run` — 515+ passing, ZERO regressions
    3. `pnpm lint` — zero errors
    4. Start all services: gateway + Inngest Dev Server + Docker Compose
    5. Verify ALL existing routes respond correctly (curl each one)
    6. Verify Inngest functions register (3 existing functions)
    7. Verify Jira HMAC validation still works
    8. Run `pnpm trigger-task` to test full engineering E2E (if practical) — this is the MOST IMPORTANT test to confirm the migration didn't break the engineering flow
  - Fix ANY issue before proceeding to Wave 1. Zero regressions is mandatory.

  **Must NOT do**:
  - Do NOT skip the engineering E2E test — this is the highest-risk verification

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive verification after framework migration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Wave 1 (all)
  - **Blocked By**: Tasks 0a, 0b

  **Acceptance Criteria**:
  - [ ] All verification commands pass
  - [ ] Zero test regressions
  - [ ] Engineering flow unbroken

  **QA Scenarios**:

  ```
  Scenario: Full regression check
    Tool: Bash
    Steps:
      1. pnpm build && pnpm lint && pnpm test -- --run
      2. Assert: 515+ tests pass, zero failures beyond known pre-existing ones
    Expected Result: Clean build and test suite
    Evidence: .sisyphus/evidence/task-0c-verification.txt
  ```

  **Commit**: YES (standalone — gateway migration is a clean commit boundary)
  - Message: `refactor(gateway): migrate from Fastify to Express + add @slack/bolt and @slack/web-api`
  - Files: `src/gateway/**`, `package.json`, `pnpm-lock.yaml`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 1. Schema Migration — Add Archetype Config Fields

  **What to do**:
  - Add four nullable fields to the `Archetype` model in `prisma/schema.prisma`:
    - `system_prompt  String?  @db.Text` — persona + instructions for the LLM
    - `steps          Json?` — ordered step definitions (array of `{ tool, params }` objects)
    - `model          String?` — which LLM model to use (e.g., `anthropic/claude-sonnet-4-20250514`)
    - `deliverable_type String?` — output type (`slack_message`, `pull_request`, etc.)
  - Run `npx prisma migrate dev --name add-archetype-config-fields`
  - Verify migration applies cleanly and existing data is unaffected (all new fields nullable)
  - Verify PostgREST can query the new fields

  **Must NOT do**:
  - Do NOT make any field non-nullable (would break existing rows)
  - Do NOT modify existing fields on the Archetype model
  - Do NOT touch any other model

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change (schema.prisma) + migration command
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-6)
  - **Blocks**: Tasks 10, 12
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma:187-209` — Current Archetype model with existing fields (`role_name`, `runtime`, `tool_registry`, `trigger_sources`, `risk_model`, `concurrency_limit`)
  - `prisma/schema.prisma:173-185` — Department model (reference for conventions)
  - `prisma/migrations/` — Existing migration directory (follow naming conventions)

  **Acceptance Criteria**:
  - [ ] `npx prisma migrate dev` completes without errors
  - [ ] `pnpm build` passes
  - [ ] `pnpm test -- --run` passes with 515+ tests (no regressions)

  **QA Scenarios**:

  ```
  Scenario: New fields queryable via PostgREST
    Tool: Bash (curl)
    Preconditions: Docker Compose running, migration applied
    Steps:
      1. curl -s "http://localhost:54321/rest/v1/archetypes?select=system_prompt,steps,model,deliverable_type&limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
      2. Assert HTTP 200 (not 400 "column does not exist")
      3. Response should be empty array [] (no data yet)
    Expected Result: HTTP 200, body is `[]`
    Failure Indicators: HTTP 400, error mentioning "column system_prompt does not exist"
    Evidence: .sisyphus/evidence/task-1-schema-postgrest.txt

  Scenario: Existing data unaffected
    Tool: Bash (curl)
    Preconditions: Migration applied
    Steps:
      1. curl -s "http://localhost:54321/rest/v1/archetypes?select=*" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
      2. If rows exist, verify they have null values for new fields
      3. Verify no migration errors in console output
    Expected Result: All existing rows preserved with null new fields
    Evidence: .sisyphus/evidence/task-1-existing-data.txt
  ```

  **Commit**: YES (standalone)
  - Message: `feat(schema): add archetype config fields for generic employees`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 2. Tool Interface Definition

  **What to do**:
  - Create `src/workers/tools/types.ts` with the standard tool contract:

    ```typescript
    export interface ToolContext {
      taskId: string;
      env: Record<string, string>; // resolved env vars
      logger: Logger;
      previousResult?: unknown; // result from previous step
    }

    export interface ToolDefinition<TParams = Record<string, unknown>, TResult = unknown> {
      name: string;
      execute: (params: TParams, ctx: ToolContext) => Promise<TResult>;
    }

    export interface StepDefinition {
      tool: string;
      params: Record<string, unknown>; // values can contain $ENV_VAR and $prev_result references
    }

    export interface ArchetypeConfig {
      system_prompt: string;
      tools: string[];
      steps: StepDefinition[];
      model: string;
      deliverable_type: string;
    }
    ```

  - Create `src/workers/tools/registry.ts` — static map from tool name → ToolDefinition
  - Create `src/workers/tools/param-resolver.ts` — resolves `$ENV_VAR` and `$prev_result` references in step params
  - Export everything from `src/workers/tools/index.ts`

  **Must NOT do**:
  - Do NOT implement any actual tools yet (just the interface + registry skeleton + param resolver)
  - Do NOT add dynamic tool loading — static imports only
  - Do NOT add more than the three tool types needed (slack.readChannels, slack.postMessage, llm.generate)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure TypeScript type definitions + simple utility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-6)
  - **Blocks**: Tasks 3, 4, 8, 9
  - **Blocked By**: None

  **References**:
  - `src/lib/logger.ts` — Logger type used in ToolContext (import from here)
  - `src/workers/lib/postgrest-client.ts` — Example of a thin typed wrapper (follow pattern)
  - `src/workers/config/long-running.ts:readConfigFromEnv()` — Pattern for reading config from env vars

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes (types compile)
  - [ ] `src/workers/tools/index.ts` exports ToolContext, ToolDefinition, StepDefinition, ArchetypeConfig, TOOL_REGISTRY, resolveParams

  **QA Scenarios**:

  ```
  Scenario: Tool types compile and export correctly
    Tool: Bash
    Preconditions: Source files created
    Steps:
      1. pnpm build
      2. Verify dist/workers/tools/index.js exists
      3. Verify dist/workers/tools/types.js exists
      4. Verify dist/workers/tools/registry.js exists
      5. Verify dist/workers/tools/param-resolver.js exists
    Expected Result: All files compile, zero errors
    Evidence: .sisyphus/evidence/task-2-build-output.txt

  Scenario: Param resolver handles $ENV_VAR and $prev_result
    Tool: Bash (node -e)
    Preconditions: Built
    Steps:
      1. node -e "const {resolveParams} = require('./dist/workers/tools/param-resolver'); const result = resolveParams({channel: '\$SLACK_CHANNEL', data: '\$prev_result'}, {SLACK_CHANNEL: 'C123'}, {messages: []}); console.log(JSON.stringify(result))"
      2. Assert output: {"channel":"C123","data":{"messages":[]}}
    Expected Result: Env vars and prev_result resolved correctly
    Failure Indicators: Unresolved $-prefixed strings, undefined values
    Evidence: .sisyphus/evidence/task-2-param-resolver.txt
  ```

  **Commit**: NO (groups with Tasks 3-6)

---

- [x] 3. Tool: slack.readChannels — Fetch Channel History

  **What to do**:
  - Create `src/workers/tools/slack-read-channels.ts`
  - Implements `ToolDefinition` interface from Task 2
  - Uses `@slack/web-api` `WebClient` to call `conversations.history` API
  - Params: `{ channels: string (comma-separated channel IDs), lookback_hours: number }`
  - For each channel: fetches messages from last N hours, handles pagination (cursor-based)
  - Also fetches thread replies for messages with `reply_count > 0` using `conversations.replies`
  - `@slack/web-api` handles rate limiting and pagination automatically
  - Returns: `{ channels: Array<{ channelId: string, messages: SlackMessage[] }> }`
  - Uses `SLACK_BOT_TOKEN` from ToolContext.env

  **Must NOT do**:
  - Do NOT modify `src/lib/slack-client.ts` — this tool is for the worker, not the gateway (the old raw-fetch client will be replaced separately or kept for backward compatibility)
  - Do NOT add pagination limits that would skip messages (fetch all within lookback window)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Non-trivial API integration with pagination, rate limiting, thread replies
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4-6, after Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 9
  - **Blocked By**: Task 2 (needs ToolDefinition interface)

  **References**:
  - `src/workers/tools/types.ts` (from Task 2) — ToolDefinition interface to implement
  - `src/lib/slack-client.ts:1-50` — Existing raw-fetch Slack pattern (follow same style: base URL, headers, error handling)
  - `src/lib/retry.ts` — `withRetry` utility (use for rate limit retries)
  - VLRE reference: `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/channel-fetcher.ts` — Proven implementation to port (channel history + thread replies + rate limit handling)
  - Slack API: `https://api.slack.com/methods/conversations.history` — endpoint docs
  - Slack API: `https://api.slack.com/methods/conversations.replies` — thread replies

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] Tool registered in TOOL_REGISTRY as `slack.readChannels`
  - [ ] Handles empty channel (no messages) gracefully — returns empty array, no error

  **QA Scenarios**:

  ```
  Scenario: Tool registered and callable
    Tool: Bash (node -e)
    Preconditions: Built
    Steps:
      1. node -e "const {TOOL_REGISTRY} = require('./dist/workers/tools'); console.log(Object.keys(TOOL_REGISTRY))"
      2. Assert output contains "slack.readChannels"
    Expected Result: Tool is registered in registry
    Evidence: .sisyphus/evidence/task-3-registry.txt

  Scenario: Handles empty channel gracefully
    Tool: Bash (unit test)
    Preconditions: Built
    Steps:
      1. Create a test that mocks fetch to return {ok: true, messages: [], has_more: false}
      2. Call slack.readChannels with channels: "C123", lookback_hours: 24
      3. Assert result: { channels: [{ channelId: "C123", messages: [] }] }
    Expected Result: Returns structured result with empty messages array
    Failure Indicators: Throws error, returns undefined
    Evidence: .sisyphus/evidence/task-3-empty-channel.txt
  ```

  **Commit**: NO (groups with Tasks 2, 4-6)

---

- [x] 4. Tool: llm.generate — LLM Generation Wrapper

  **What to do**:
  - Create `src/workers/tools/llm-generate.ts`
  - Implements `ToolDefinition` interface from Task 2
  - Wraps the existing `callLLM` utility from `src/lib/call-llm.ts`
  - Params: `{ system_prompt: string, user_prompt: string, model?: string }`
  - If `model` not in params, uses `OPENROUTER_MODEL` from ToolContext.env
  - Returns: `{ text: string, model: string, usage: { prompt_tokens, completion_tokens } }`

  **Must NOT do**:
  - Do NOT rewrite `callLLM` — wrap it, don't duplicate
  - Do NOT add streaming support — single completion only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Thin wrapper around existing utility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 5, 6 — after Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 9
  - **Blocked By**: Task 2 (needs ToolDefinition interface)

  **References**:
  - `src/workers/tools/types.ts` (from Task 2) — ToolDefinition interface
  - `src/lib/call-llm.ts` — Existing OpenRouter wrapper with cost circuit breaker, retry, timeout. **Call this, don't duplicate.** Key function: `callLLM({ model, messages, maxTokens })` returns `{ content, model, usage }`

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] Tool registered in TOOL_REGISTRY as `llm.generate`

  **QA Scenarios**:

  ```
  Scenario: Tool wraps callLLM correctly
    Tool: Bash (node -e)
    Preconditions: Built
    Steps:
      1. node -e "const {TOOL_REGISTRY} = require('./dist/workers/tools'); console.log('llm.generate' in TOOL_REGISTRY)"
      2. Assert: true
    Expected Result: Tool is registered
    Evidence: .sisyphus/evidence/task-4-registry.txt
  ```

  **Commit**: NO (groups with Tasks 2, 3, 5, 6)

---

- [x] 5. FlyMachineConfig — Add `cmd` Field

  **What to do**:
  - Add `cmd?: string[]` to `FlyMachineConfig` interface in `src/lib/fly-client.ts`
  - When `cmd` is provided, include it in the machine config body sent to Fly.io API: `config.processes[0].cmd` or `config.init.cmd` depending on Fly API version
  - Verify with Fly.io Machines API docs which field path accepts CMD override
  - This enables the summarizer lifecycle to dispatch machines with a different entrypoint than the Dockerfile CMD

  **Must NOT do**:
  - Do NOT change the default behavior — if `cmd` is not provided, machine uses Dockerfile CMD as before
  - Do NOT modify `createMachine` call sites in `lifecycle.ts` — engineering continues using default CMD

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single interface addition + minor logic change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4, 6)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - `src/lib/fly-client.ts:8-13` — Current `FlyMachineConfig` interface: `{ image, vm_size?, env?, auto_destroy? }`
  - `src/lib/fly-client.ts:15-50` — `createMachine` function that builds the request body
  - `src/inngest/lifecycle.ts:337-357` — Where machines are created (shows current env var passing)
  - `src/inngest/lifecycle.ts:144-172` — Hybrid mode uses raw fetch to pass extra fields (reference for how to pass `cmd`)
  - Fly.io API: `https://fly.io/docs/machines/api/machines-resource/` — Machine config schema (check `config.init.cmd` field)

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] `pnpm test -- --run` passes (no regressions to fly-client tests)
  - [ ] FlyMachineConfig accepts `cmd` field
  - [ ] When `cmd` is provided, it appears in the API request body

  **QA Scenarios**:

  ```
  Scenario: cmd field included in API request when provided
    Tool: Bash (unit test or node -e)
    Preconditions: Built
    Steps:
      1. Write a test that mocks fetch, calls createMachine with cmd: ["node", "test.js"]
      2. Assert the request body contains cmd field
      3. Write a test that calls createMachine WITHOUT cmd
      4. Assert the request body does NOT contain cmd (backward compatible)
    Expected Result: cmd field conditionally included
    Evidence: .sisyphus/evidence/task-5-cmd-field.txt
  ```

  **Commit**: NO (groups with Tasks 2-4, 6)

---

- [x] 6. Env Vars + Slack Prerequisites Verification

  **What to do**:
  - Add to `.env.example`:
    - `SLACK_SIGNING_SECRET` — Required for verifying Slack interaction webhooks (HMAC-SHA256)
    - `DAILY_SUMMARY_CHANNELS` — Comma-separated Slack channel IDs to summarize
    - `SUMMARY_TARGET_CHANNEL` — Channel ID where summaries are posted
    - `FLY_SUMMARIZER_APP` — Fly.io app name for summarizer machines (if separate from engineering)
    - `SUMMARIZER_VM_SIZE` — VM size for summarizer (default: `shared-cpu-1x`, much smaller than engineering's `performance-2x`)
  - Add to `src/gateway/server.ts`: make `JIRA_WEBHOOK_SECRET` optional (currently required at startup, blocking non-Jira deployments)
    - Change from `throw if missing` to `warn if missing` — only throw when a Jira webhook actually arrives
  - Document prerequisites in a comment block:
    - Slack bot must have `channels:history`, `chat:write` scopes
    - `SLACK_SIGNING_SECRET` comes from Slack app settings → "Basic Information" → "Signing Secret"

  **Must NOT do**:
  - Do NOT create a Slack app — that's a manual prerequisite
  - Do NOT modify SLACK_BOT_TOKEN handling — it already exists

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config file updates + one guard clause fix
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5)
  - **Blocks**: Task 11
  - **Blocked By**: None

  **References**:
  - `.env.example` — Current env var template (add new vars at end in a "Summarizer" section)
  - `src/gateway/server.ts:~20-30` — Where JIRA_WEBHOOK_SECRET is validated at startup (make optional)
  - `src/gateway/routes/jira.ts:~15-25` — Where JIRA_WEBHOOK_SECRET is used for HMAC verification (keep this check, just don't crash at boot)

  **Acceptance Criteria**:
  - [ ] `.env.example` contains all new vars with comments
  - [ ] Gateway starts without JIRA_WEBHOOK_SECRET set (no crash)
  - [ ] Jira webhook still rejects unsigned requests when JIRA_WEBHOOK_SECRET IS set

  **QA Scenarios**:

  ```
  Scenario: Gateway starts without JIRA_WEBHOOK_SECRET
    Tool: Bash
    Preconditions: Services not running
    Steps:
      1. Temporarily unset JIRA_WEBHOOK_SECRET from .env
      2. Start gateway (or run server.ts)
      3. Assert it starts without crashing
      4. Restore JIRA_WEBHOOK_SECRET
    Expected Result: Gateway boots successfully with a warning log
    Failure Indicators: Process exits with "JIRA_WEBHOOK_SECRET is required" error
    Evidence: .sisyphus/evidence/task-6-gateway-boot.txt

  Scenario: Jira webhook still validates when secret is set
    Tool: Bash (curl)
    Preconditions: Gateway running with JIRA_WEBHOOK_SECRET set
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/webhooks/jira -H "Content-Type: application/json" -d '{"test":true}'
      2. Assert: HTTP 401 (unsigned request rejected)
    Expected Result: 401 Unauthorized
    Evidence: .sisyphus/evidence/task-6-jira-still-validates.txt
  ```

  **Commit**: NO (groups with Tasks 2-5)

---

- [x] 7. Verification Gate 1 — Foundation Complete

  **What to do**:
  - Run full verification suite after Wave 1 completes:
    1. `pnpm build` — zero TypeScript errors
    2. `pnpm test -- --run` — 515+ passing, no regressions
    3. `pnpm lint` — zero errors
    4. Verify schema migration applied: `curl` PostgREST for new archetype fields
    5. Verify tool registry exports: `node -e "require('./dist/workers/tools')"` succeeds
    6. Verify .env.example has all new vars
    7. Verify gateway boots without JIRA_WEBHOOK_SECRET
  - Fix any issues found before proceeding to Wave 2

  **Must NOT do**:
  - Do NOT skip this gate — Wave 2 depends on all Wave 1 outputs being correct

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Verification requires running multiple commands and checking results
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Wave 1)
  - **Blocks**: Wave 2 (all)
  - **Blocked By**: Tasks 1-6

  **References**: All Wave 1 task QA scenarios

  **Acceptance Criteria**:
  - [ ] All verification commands pass
  - [ ] Zero regressions

  **QA Scenarios**:

  ```
  Scenario: Full build + test + lint
    Tool: Bash
    Steps:
      1. pnpm build && pnpm lint && pnpm test -- --run
      2. Assert all three pass
    Expected Result: Zero errors across all three
    Evidence: .sisyphus/evidence/task-7-verification-gate-1.txt
  ```

  **Commit**: NO (verification only)

---

- [x] 8. Tool: slack.postApprovalMessage — Block Kit with Interactive Buttons

  **What to do**:
  - Create `src/workers/tools/slack-post-message.ts`
  - Implements `ToolDefinition` interface
  - Uses `@slack/web-api` `WebClient` to call `chat.postMessage` API
  - Params: `{ channel: string, summary_text: string, stats: { messages: number, threads: number, participants: number }, task_id: string }`
  - Builds a Block Kit payload with:
    - Header: "📰 Daily Summary — {date}" (Papi Chulo styled)
    - Section: Summary text (the LLM-generated content)
    - Section: Stats (messages, threads, participants)
    - Actions block: two buttons — "✅ Approve & Post" (`action_id: approve`, `value: {task_id}`) and "❌ Reject" (`action_id: reject`, `value: {task_id}`)
  - Returns: `{ ts: string, channel: string }` (message timestamp for later editing)
  - Port Block Kit structure from VLRE reference, adding interactive buttons

  **Must NOT do**:
  - Do NOT modify `src/lib/slack-client.ts` — this is a worker tool, not a gateway client
  - Do NOT make the Block Kit layout configurable — hardcode for MVP

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex Block Kit JSON structure + Slack API integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9-12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 14
  - **Blocked By**: Task 2 (needs ToolDefinition interface)

  **References**:
  - `src/workers/tools/types.ts` (from Task 2) — ToolDefinition interface
  - VLRE reference: `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/daily-summary-blocks.ts` — Block Kit card builders (stats section, summary formatting). Port this structure, ADD interactive buttons.
  - VLRE reference: `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/daily-summary-scheduler.ts:~80-120` — How the summary is posted to Slack (channel, token, blocks)
  - Slack Block Kit: `https://api.slack.com/reference/block-kit/blocks` — Actions block with buttons
  - Slack interactive components: `https://api.slack.com/reference/block-kit/block-elements#button`

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] Tool registered in TOOL_REGISTRY as `slack.postMessage`
  - [ ] Block Kit payload includes actions block with approve/reject buttons
  - [ ] Button values contain `task_id` for routing approval back to correct task

  **QA Scenarios**:

  ```
  Scenario: Block Kit payload is valid
    Tool: Bash (node -e)
    Preconditions: Built
    Steps:
      1. Import tool, mock fetch, call with test params
      2. Capture the request body sent to fetch
      3. Parse the blocks array
      4. Assert blocks contains a section with summary text
      5. Assert blocks contains an actions block with 2 buttons
      6. Assert first button has action_id "approve" and value containing task_id
      7. Assert second button has action_id "reject"
    Expected Result: Valid Block Kit JSON with interactive buttons
    Evidence: .sisyphus/evidence/task-8-block-kit.txt
  ```

  **Commit**: NO (groups with Tasks 9-12)

---

- [x] 9. Generic Worker Harness

  **What to do**:
  - Create `src/workers/generic-harness.mts` — the main entry point for non-engineering workers
  - On boot:
    1. Read `TASK_ID` and `SUPABASE_URL` + `SUPABASE_SECRET_KEY` from env
    2. Fetch task row from PostgREST: `GET /rest/v1/tasks?id=eq.{TASK_ID}&select=*,archetypes(*)`
    3. Extract archetype config from the joined archetype record
    4. Validate archetype has `steps` and `tools` defined
    5. Create ToolContext with `taskId`, `env` (all process.env), `logger`
    6. Instantiate tools from TOOL_REGISTRY matching archetype's tool list
    7. Create execution record in PostgREST: `POST /rest/v1/executions` with `task_id`, `runtime_type: "generic-harness"`, `status: "running"`
    8. Update task status to `Executing` via PostgREST
  - Execute steps:
    1. For each step in archetype.steps (in order):
       a. Resolve params using `resolveParams(step.params, process.env, previousResult)`
       b. Look up tool in instantiated tool map
       c. Call `tool.execute(resolvedParams, context)`
       d. Store result as `previousResult` for next step
       e. Log step completion with tool name and duration
    2. On step failure: log error, update task status to `Failed`, update execution status, exit with code 1
  - On all steps complete:
    1. Update task status to `Submitting` via PostgREST
    2. Write deliverable record if applicable
    3. Fire Inngest event `summarizer/task.completed` (via curl to Inngest Dev Server) with `{ taskId }`
    4. Exit cleanly
  - Handle SIGTERM gracefully (update status to `Failed` on kill)

  **Must NOT do**:
  - Do NOT import or reference `entrypoint.sh`, `orchestrate.mts`, or any engineering worker code
  - Do NOT clone git repos or create branches
  - Do NOT use OpenCode
  - Do NOT hardcode summarizer-specific logic — the harness is GENERIC, driven by archetype config

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core architectural component, many moving parts, must be robust
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10-12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 19
  - **Blocked By**: Tasks 2, 3, 4, 8 (needs tools and interface)

  **References**:
  - `src/workers/tools/types.ts` (from Task 2) — ToolContext, StepDefinition, ArchetypeConfig
  - `src/workers/tools/registry.ts` (from Task 2) — TOOL_REGISTRY for tool lookup
  - `src/workers/tools/param-resolver.ts` (from Task 2) — resolveParams function
  - `src/workers/lib/postgrest-client.ts:1-60` — PostgREST client for reading tasks and writing status. Use `createPostgRESTClient()` for all DB operations.
  - `src/workers/lib/task-context.ts:1-40` — `TaskRow` type definition (what a task row looks like). Use for type reference.
  - `src/workers/orchestrate.mts:80-120` — How the engineering worker creates execution records and writes heartbeats. Follow the same PostgREST patterns but with different data.
  - `src/workers/lib/completion.ts:60-120` — How engineering reports completion (status update + deliverable + Inngest event). Follow same pattern for generic completion.
  - `prisma/schema.prisma:187-209` — Archetype model fields to read
  - `prisma/schema.prisma:10-50` — Task model fields to update

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] Harness reads task and archetype from PostgREST
  - [ ] Harness resolves params and executes tools in order
  - [ ] Harness updates task status through lifecycle: Executing → Submitting (or Failed)
  - [ ] Harness is fully generic — no summarizer-specific code

  **QA Scenarios**:

  ```
  Scenario: Harness boots and reads archetype config
    Tool: Bash (Docker)
    Preconditions: Docker image rebuilt, Supabase running, summarizer archetype seeded (Task 12)
    Steps:
      1. Create a test task with archetype_id pointing to summarizer archetype
      2. docker run --rm -e TASK_ID={task_id} -e SUPABASE_URL=http://host.docker.internal:54321 -e SUPABASE_SECRET_KEY={key} ai-employee-worker:latest node /app/dist/workers/generic-harness.mjs
      3. Check logs for "Loaded archetype: summarizer" or similar
      4. Check logs for step execution attempts
    Expected Result: Harness boots, reads config, attempts to execute steps (may fail on missing Slack token — that's OK, proves the harness works)
    Failure Indicators: "Cannot find module", "archetype_id is null", process crashes before reading config
    Evidence: .sisyphus/evidence/task-9-harness-boot.txt

  Scenario: Harness handles missing task gracefully
    Tool: Bash (Docker)
    Preconditions: Docker image rebuilt, Supabase running
    Steps:
      1. docker run --rm -e TASK_ID=00000000-0000-0000-0000-000000000000 -e SUPABASE_URL=http://host.docker.internal:54321 -e SUPABASE_SECRET_KEY={key} ai-employee-worker:latest node /app/dist/workers/generic-harness.mjs
      2. Assert: process exits with error "Task not found"
      3. Assert: exit code is 1
    Expected Result: Graceful error with descriptive message
    Evidence: .sisyphus/evidence/task-9-missing-task.txt
  ```

  **Commit**: NO (groups with Tasks 8, 10-12)

---

- [x] 10. Generic Employee Lifecycle Function + createTaskAndDispatch Utility

  **What to do**:

  **Part A — `createTaskAndDispatch` utility** (`src/inngest/lib/create-task-and-dispatch.ts`):
  - Reusable function that trigger adapters call. Handles:
    1. Fetch archetype by `role_name` from PostgREST
    2. Check for duplicate: query tasks with same `external_id` in non-terminal state → skip if found
    3. Create task row: `archetype_id`, `external_id`, `source_system`, `status: "Ready"`, `tenant_id: "00000000-0000-0000-0000-000000000001"`
    4. Fire Inngest event: `{ name: "employee/task.dispatched", data: { taskId, archetypeId } }`
    5. Return task (or null if duplicate)
  - Signature: `createTaskAndDispatch({ archetypeSlug: string, externalId: string, sourceSystem: string, step: InngestStep })`

  **Part B — Generic lifecycle function** (`src/inngest/employee-lifecycle.ts`):
  - Function ID: `employee/task-lifecycle`
  - Trigger: `{ event: "employee/task.dispatched" }` (NOT cron — triggered by events from trigger adapters)
  - Lifecycle steps:
    1. **step.run("load-task")**: Fetch task + archetype from PostgREST (join via `archetype_id`)
       - Extract: archetype config (runtime, risk_model, tool_registry, steps, system_prompt, model, deliverable_type)
    2. **step.run("dispatch-machine")**: Create Fly.io machine
       - `cmd`: `["node", "/app/dist/workers/generic-harness.mjs"]`
       - `vm_size`: from archetype.runtime config or `SUMMARIZER_VM_SIZE` env var (default `shared-cpu-1x`)
       - `image`: `FLY_WORKER_IMAGE` (same universal image)
       - `env`: `TASK_ID`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, plus all env vars the tools need (derived from archetype tool list — e.g., if tools include `slack.readChannels` → include `SLACK_BOT_TOKEN`, `DAILY_SUMMARY_CHANNELS`)
       - `auto_destroy`: true
       - Update task status to `Executing`
    3. **step.run("poll-completion")**: Poll task status via PostgREST until `Submitting` or `Failed`
       - Reuse or adapt `pollCompletion` from `src/inngest/lib/poll-completion.ts`
       - Timeout: 5 minutes
    4. **IF task status is `Failed`**: Log error, mark task `Failed`, exit
    5. **IF archetype.risk_model.approval_required === true**:
       a. **step.run("set-awaiting")**: Update task status to `AwaitingApproval`
       b. **step.waitForEvent("employee/approval.received")**: Wait for approval
       - Match on `data.taskId === taskId`
       - Timeout: `${archetype.risk_model.timeout_hours || 24}h`
         c. **step.run("handle-result")**: Based on event or timeout:
       - **Approve**: Read deliverable from `deliverables` table (machine wrote it before exiting). Based on `deliverable_type`:
         - `"slack_message"`: Use `deliverable.metadata.approval_message_ts` to call `chat.update` → "✅ Approved by {userName}". Then `chat.postMessage` to `deliverable.metadata.target_channel` with clean summary (from `deliverable.content` and `deliverable.metadata.blocks`). Mark task `Done`.
         - Other types: Mark task `Done` (deliverable already created by machine).
       - **Reject**: Call `chat.update` → "❌ Rejected by {userName}". Mark task `Cancelled`.
       - **Timeout**: Call `chat.update` → "⏰ Expired". Mark task `Cancelled`.
    6. **IF archetype.risk_model.approval_required !== true**:
       a. **step.run("complete")**: Mark task `Done` directly
    7. **step.run("cleanup")**: Destroy Fly.io machine if still running

  **Must NOT do**:
  - Do NOT modify `src/inngest/lifecycle.ts` (engineering lifecycle)
  - Do NOT use `engineering/*` event names
  - Do NOT hardcode any summarizer-specific logic — read everything from archetype config
  - Do NOT add redispatch/retry logic — out of scope for MVP
  - Do NOT hardcode env var names for machine dispatch — derive from archetype tool list

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core architectural component — generic lifecycle with conditional approval, deliverable handling, machine dispatch. Must be robust and truly generic.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9, 11, 12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 14, 15, 16
  - **Blocked By**: Tasks 1 (schema), 5 (cmd field)

  **References**:
  - `src/inngest/lifecycle.ts:1-50` — Engineering lifecycle function structure. Follow `createFunction` pattern but with DIFFERENT function ID and event trigger. Study how it's structured to match conventions.
  - `src/inngest/lifecycle.ts:337-357` — Machine creation with env vars. Follow same pattern but add `cmd` field and derive env vars from archetype.
  - `src/inngest/lib/poll-completion.ts` — Reusable polling helper. Check if generic enough to reuse; if not, write a similar one.
  - `src/gateway/inngest/client.ts` — Inngest client factory (`createInngestClient()`)
  - `src/lib/fly-client.ts` — `createMachine`, `destroyMachine`
  - `src/lib/slack-client.ts` — `postMessage` for final delivery + need `updateMessage` (new method — raw fetch to `chat.update`)
  - `prisma/schema.prisma:~230-250` — `deliverables` table schema (what fields are available for reading machine output)
  - Inngest docs: `https://www.inngest.com/docs/features/events-triggers/wait-for-event` — waitForEvent with match and timeout

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] Lifecycle function is generic — zero summarizer-specific code
  - [ ] `createTaskAndDispatch` handles duplicate detection and event firing
  - [ ] Approval flow is conditional on `archetype.risk_model.approval_required`
  - [ ] Deliverable read + delivery based on `deliverable_type`
  - [ ] Machine created with `cmd` override pointing to generic harness
  - [ ] `chat.update` method added to Slack client (or created as utility)

  **QA Scenarios**:

  ```
  Scenario: Lifecycle function registers and triggers on event
    Tool: Bash (curl)
    Preconditions: Gateway + Inngest Dev Server running
    Steps:
      1. curl -s http://localhost:8288/v1/fns | jq '.[] | select(.name | contains("employee/task-lifecycle"))'
      2. Assert: function exists with event trigger "employee/task.dispatched"
    Expected Result: Function visible with correct event trigger
    Failure Indicators: Function not found, wrong trigger type
    Evidence: .sisyphus/evidence/task-10-lifecycle-registration.txt

  Scenario: createTaskAndDispatch detects duplicates
    Tool: Bash (curl + PostgREST)
    Preconditions: Supabase running
    Steps:
      1. Insert a task with external_id "summary-2026-04-15" and status "AwaitingApproval"
      2. Call createTaskAndDispatch logic with same external_id
      3. Assert: returns null, no new task created
      4. Query tasks table: still only 1 row with that external_id
    Expected Result: Duplicate detected, no new task
    Evidence: .sisyphus/evidence/task-10-duplicate-prevention.txt

  Scenario: Lifecycle skips approval when not required
    Tool: Bash (unit test)
    Preconditions: Built
    Steps:
      1. Create test with archetype where risk_model.approval_required = false
      2. Mock Inngest steps, simulate task.dispatched event
      3. Assert: function does NOT call step.waitForEvent
      4. Assert: function marks task Done directly
    Expected Result: Approval skipped, task completed immediately
    Evidence: .sisyphus/evidence/task-10-no-approval.txt
  ```

  **Commit**: NO (groups with Tasks 8, 9, 11, 12)

---

- [x] 11. Bolt Action Handlers for Slack Interactions

  **What to do**:
  - Create `src/gateway/slack/handlers.ts` — Bolt action handler registrations
  - Register action handlers on the Bolt app (initialized in Task 0a):

    ```typescript
    boltApp.action('approve', async ({ ack, body, client }) => {
      await ack(); // acknowledge within 3 seconds
      const taskId = body.actions[0].value;
      const user = body.user;
      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'approve', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`, // deterministic ID prevents double-send
      });
    });

    boltApp.action('reject', async ({ ack, body }) => {
      await ack();
      const taskId = body.actions[0].value;
      const user = body.user;
      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'reject', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`,
      });
    });
    ```

  - Bolt's `ExpressReceiver` handles ALL of the complexity we'd otherwise reimplement:
    - Signature verification (HMAC-SHA256 with signing secret) — built-in
    - Request timestamp validation (replay attack prevention) — built-in
    - Payload parsing (`application/x-www-form-urlencoded` → JSON) — built-in
    - 3-second acknowledgment requirement — handled by `ack()`
  - Import and call the handler registration function in `server.ts` after Bolt app is created

  **Must NOT do**:
  - Do NOT process the approval inline — fire Inngest event and let the generic lifecycle handle it
  - Do NOT write manual HMAC verification — Bolt handles this
  - Do NOT write manual payload parsing — Bolt handles this

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Bolt handler setup + Inngest event integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8-10, 12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 14
  - **Blocked By**: Task 0a (needs Bolt app initialized)

  **References**:
  - `src/gateway/server.ts` (from Task 0a) — Where Bolt app is initialized. Handlers must be registered before `receiver.start()`.
  - `src/gateway/inngest/send.ts` — How to send Inngest events from gateway
  - Bolt action handlers: `https://slack.dev/bolt-js/concepts/actions` — Action handling guide
  - Bolt block actions: `https://slack.dev/bolt-js/concepts/actions#listening-to-actions` — `app.action()` API

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] Bolt handles signature verification automatically (invalid signatures rejected)
  - [ ] `approve` action fires `employee/approval.received` event with correct payload
  - [ ] `reject` action fires `employee/approval.received` event with action: "reject"
  - [ ] Deterministic event ID prevents double-send on rapid clicks

  **QA Scenarios**:

  ```
  Scenario: Bolt rejects unsigned requests automatically
    Tool: Bash (curl)
    Preconditions: Gateway running with Bolt initialized
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/webhooks/slack/interactions -H "Content-Type: application/x-www-form-urlencoded" -d "payload=%7B%7D"
      2. Assert: non-200 response (Bolt rejects unsigned)
    Expected Result: Request rejected by Bolt's built-in verification
    Evidence: .sisyphus/evidence/task-11-unsigned.txt

  Scenario: Approval action fires Inngest event
    Tool: Bash (curl + Inngest API)
    Preconditions: Gateway + Inngest running, valid Slack signing secret
    Steps:
      1. Send a properly signed interaction payload with action_id "approve" and value "{task_id}"
         (Use Bolt's signing algorithm or send via Slack test tools)
      2. curl -s http://localhost:8288/v1/events | jq '.[] | select(.name == "employee/approval.received")'
      3. Assert: event exists with taskId and action: "approve"
    Expected Result: Event visible in Inngest Dev Server
    Failure Indicators: No event, wrong event name, missing fields
    Evidence: .sisyphus/evidence/task-11-approval-event.txt
  ```

  **Commit**: NO (groups with Tasks 8-10, 12)

---

- [x] 12. Archetype + Department Seeding

  **What to do**:
  - Update `prisma/seed.ts` (or create seed script) to insert:
    1. **Department**: `{ name: "Operations", slack_channel: "$SUMMARY_TARGET_CHANNEL", tenant_id: "00000000-0000-0000-0000-000000000001" }`
    2. **Archetype** (summarizer):
       ```json
       {
         "department_id": "<operations_dept_id>",
         "role_name": "daily-summarizer",
         "runtime": "generic-harness",
         "system_prompt": "<FULL Papi Chulo persona - see below>",
         "model": "anthropic/claude-sonnet-4-20250514",
         "deliverable_type": "slack_message",
         "tool_registry": { "tools": ["slack.readChannels", "llm.generate", "slack.postMessage"] },
         "steps": [
           {
             "tool": "slack.readChannels",
             "params": { "channels": "$DAILY_SUMMARY_CHANNELS", "lookback_hours": 24 }
           },
           {
             "tool": "llm.generate",
             "params": {
               "system_prompt": "$archetype.system_prompt",
               "user_prompt": "Generate a dramatic Spanish news-style summary of these Slack messages:\n\n$prev_result"
             }
           },
           {
             "tool": "slack.postMessage",
             "params": {
               "channel": "$SUMMARY_TARGET_CHANNEL",
               "summary_text": "$prev_result",
               "task_id": "$TASK_ID"
             }
           }
         ],
         "trigger_sources": {
           "type": "cron",
           "expression": "0 8 * * 1-5",
           "timezone": "America/Chicago"
         },
         "risk_model": { "approval_required": true, "timeout_hours": 24 },
         "concurrency_limit": 1,
         "tenant_id": "00000000-0000-0000-0000-000000000001"
       }
       ```
  - **Papi Chulo system prompt** (MUST be fully written, not TBD):
    - Port from VLRE reference: `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/daily-summary-scheduler.ts` — find the system prompt used for LLM summary generation
    - The prompt should instruct the LLM to: write in dramatic Spanish news correspondent style, include key discussion points, highlight important decisions, note active threads, provide statistics
  - Make seed idempotent: use upsert or check-before-insert

  **Must NOT do**:
  - Do NOT leave system_prompt as placeholder/TBD
  - Do NOT hardcode channel IDs in the steps (use $ENV_VAR references)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Needs to read VLRE source to port the system prompt, complex JSON structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8-11)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 19
  - **Blocked By**: Task 1 (schema migration must be applied first)

  **References**:
  - `prisma/seed.ts` — Existing seed script (follow conventions)
  - `prisma/schema.prisma:173-209` — Department and Archetype models (field names and types)
  - VLRE reference: `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/daily-summary-scheduler.ts` — **CRITICAL: Find and port the system prompt for Papi Chulo persona.** This is the exact persona and instructions that make the summary dramatic and Spanish news-style.
  - VLRE reference: `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/daily-summary-blocks.ts` — Block Kit structure (for understanding what the summary output looks like)

  **Acceptance Criteria**:
  - [ ] Seed runs without errors: `npx prisma db seed`
  - [ ] Department "Operations" exists in DB
  - [ ] Archetype "daily-summarizer" exists with non-empty system_prompt
  - [ ] system_prompt contains Papi Chulo persona (Spanish dramatic news style)
  - [ ] steps array has exactly 3 steps

  **QA Scenarios**:

  ```
  Scenario: Archetype seeded with full config
    Tool: Bash (curl)
    Preconditions: Seed applied
    Steps:
      1. curl -s "http://localhost:54321/rest/v1/archetypes?role_name=eq.daily-summarizer&select=*" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0]'
      2. Assert: system_prompt is not null and not empty
      3. Assert: system_prompt contains "Papi Chulo" or Spanish/dramatic keywords
      4. Assert: steps array has length 3
      5. Assert: model is "anthropic/claude-sonnet-4-20250514"
      6. Assert: deliverable_type is "slack_message"
    Expected Result: Fully populated archetype record
    Failure Indicators: null fields, empty system_prompt, wrong model
    Evidence: .sisyphus/evidence/task-12-archetype-seed.txt

  Scenario: Seed is idempotent
    Tool: Bash
    Steps:
      1. npx prisma db seed
      2. npx prisma db seed (run again)
      3. curl -s "http://localhost:54321/rest/v1/archetypes?role_name=eq.daily-summarizer&select=id" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq 'length'
      4. Assert: exactly 1 record (not 2)
    Expected Result: No duplicate records
    Evidence: .sisyphus/evidence/task-12-idempotent-seed.txt
  ```

  **Commit**: NO (groups with Tasks 8-11)

---

- [x] 13. Verification Gate 2 — Core Components Complete

  **What to do**:
  - Run full verification suite after Wave 2:
    1. `pnpm build` — zero errors
    2. `pnpm test -- --run` — 515+ passing, no regressions
    3. Docker rebuild: `docker build -t ai-employee-worker:latest .`
    4. Verify generic harness is in the built image: `docker run --rm ai-employee-worker:latest ls /app/dist/workers/generic-harness.mjs`
    5. Verify archetype seeded: curl PostgREST for summarizer archetype
    6. Verify Slack webhook route exists (not yet wired to Inngest, just responds)
    7. Run the harness boot test from Task 9 QA scenarios
  - Fix any issues before proceeding to Wave 3

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Wave 3
  - **Blocked By**: Tasks 8-12

  **QA Scenarios**:

  ```
  Scenario: Full verification
    Tool: Bash
    Steps:
      1. pnpm build && pnpm lint && pnpm test -- --run
      2. docker build -t ai-employee-worker:latest .
      3. docker run --rm ai-employee-worker:latest ls /app/dist/workers/generic-harness.mjs
      4. Assert all pass
    Expected Result: Clean build, image contains harness
    Evidence: .sisyphus/evidence/task-13-verification-gate-2.txt
  ```

  **Commit**: YES (commit all Wave 2 work)
  - Message: `feat(summarizer): add generic harness, lifecycle, webhook, and archetype seed`
  - Files: `src/workers/tools/slack-post-message.ts`, `src/workers/generic-harness.mts`, `src/inngest/summarizer-lifecycle.ts`, `src/gateway/routes/slack-interactions.ts`, `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 14. Wire Approval Webhook → Generic Lifecycle via Inngest Events

  **What to do**:
  - In `src/gateway/routes/slack-interactions.ts` (from Task 11):
    - Wire the `approve` action to fire `inngest.send({ name: "employee/approval.received", data: { taskId, action: "approve", userId, userName } })`
    - Wire the `reject` action to fire same event with `action: "reject"`
    - Use deterministic event ID: `employee-approval-{taskId}` (prevents double-send on rapid clicks)
    - **Note**: Event name is `employee/approval.received` (generic), NOT `summarizer/approval.received`
  - Verify end-to-end integration:
    - Slack button click → webhook fires `employee/approval.received` → generic lifecycle resumes from `step.waitForEvent` → reads deliverable → handles approve/reject/timeout
  - The delivery logic in the lifecycle (Task 10) reads from `deliverables` table:
    - `deliverable.content` = the summary text
    - `deliverable.metadata.approval_message_ts` = Slack message ID to update
    - `deliverable.metadata.target_channel` = where to post final summary
    - `deliverable.metadata.blocks` = Block Kit JSON for clean summary (no buttons)

  **Must NOT do**:
  - Do NOT dispatch a second Fly.io machine for approval handling — Slack API calls run directly in the Inngest lifecycle
  - Do NOT use summarizer-specific event names — `employee/*` is the generic namespace

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration across webhook + lifecycle + Slack API + deliverables, multiple code paths
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 15-17)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 19
  - **Blocked By**: Tasks 10 (lifecycle), 11 (webhook)

  **References**:
  - `src/inngest/employee-lifecycle.ts` (from Task 10) — Generic lifecycle with waitForEvent + handle-result step
  - `src/gateway/routes/slack-interactions.ts` (from Task 11) — Webhook handler to wire events
  - `src/gateway/inngest/send.ts` — `sendInngestEvent()` for firing events from gateway
  - `src/lib/slack-client.ts` — Need `updateMessage(channel, ts, blocks/text)` method (raw fetch to `chat.update`). Add alongside existing `postMessage`.
  - `prisma/schema.prisma:~230-250` — Deliverables table (content, metadata fields)
  - Slack API: `https://api.slack.com/methods/chat.update` — Update existing message

  **Acceptance Criteria**:
  - [ ] Approve action → fires `employee/approval.received` event → lifecycle posts summary → task Done
  - [ ] Reject action → fires event → lifecycle updates message → task Cancelled
  - [ ] Timeout → lifecycle updates message → task Cancelled
  - [ ] Deterministic event ID prevents double-send
  - [ ] `updateMessage` added to Slack client (raw fetch, same pattern as `postMessage`)

  **QA Scenarios**:

  ```
  Scenario: Approval event reaches generic lifecycle
    Tool: Bash (curl)
    Preconditions: Gateway + Inngest running
    Steps:
      1. Send a properly signed Slack interaction payload with action "approve" and value containing a test task_id
      2. Check Inngest Dev Server event log: curl http://localhost:8288/v1/events
      3. Assert: event "employee/approval.received" exists with correct taskId and action
    Expected Result: Event visible in Inngest Dev Server with generic name
    Failure Indicators: No event, wrong event name (e.g., "summarizer/*"), missing taskId
    Evidence: .sisyphus/evidence/task-14-approval-event.txt

  Scenario: Double-click prevention
    Tool: Bash (curl)
    Preconditions: Gateway + Inngest running
    Steps:
      1. Send the same approval payload twice rapidly
      2. Check Inngest events: should only see one event (deterministic ID)
    Expected Result: Only one event created despite two requests
    Evidence: .sisyphus/evidence/task-14-double-click.txt
  ```

  **Commit**: NO (groups with Tasks 15-17)

---

- [x] 15. Register Lifecycle + Summarizer Trigger Adapter in serve.ts

  **What to do**:
  - **Part A — Register generic lifecycle**:
    - Import `employeeLifecycle` from `src/inngest/employee-lifecycle.ts` in `src/gateway/inngest/serve.ts`
    - Add it to the `functions` array alongside existing engineering functions
  - **Part B — Create summarizer trigger adapter** (`src/inngest/triggers/summarizer-trigger.ts`):
    - This is the thin cron function that creates a summarizer task:
      ```typescript
      export const summarizerTrigger = inngest.createFunction(
        { id: 'trigger/daily-summarizer' },
        { cron: '0 8 * * 1-5', timezone: 'America/Chicago' },
        async ({ step }) => {
          const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          await createTaskAndDispatch({
            archetypeSlug: 'daily-summarizer',
            externalId: `summary-${today}`,
            sourceSystem: 'cron',
            step,
          });
        },
      );
      ```
    - Import and register this in serve.ts too
  - **Part C — Register webhook route**:
    - Register `POST /webhooks/slack/interactions` route in `src/gateway/server.ts`
  - Update function count in any related test assertions (e.g., `inngest-serve.test.ts`)

  **Must NOT do**:
  - Do NOT remove or modify existing function registrations
  - Do NOT change the engineering lifecycle function ID
  - Do NOT put ANY summarizer-specific logic in the generic lifecycle — it belongs in the trigger adapter ONLY (just the cron schedule and archetype slug)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Import + array append + thin trigger function + route registration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 16, 17)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 19
  - **Blocked By**: Task 10 (lifecycle + createTaskAndDispatch must exist)

  **References**:
  - `src/gateway/inngest/serve.ts` — Current function registration. Shows pattern: import function → add to array. Currently 3 functions: lifecycle, redispatch, watchdog.
  - `src/gateway/server.ts` — Route registration pattern. Add Slack interactions route alongside existing routes.
  - `src/inngest/employee-lifecycle.ts` (from Task 10) — Generic lifecycle to register
  - `src/inngest/lib/create-task-and-dispatch.ts` (from Task 10) — Utility the trigger adapter calls

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] Inngest Dev Server shows 5 functions (3 existing + generic lifecycle + summarizer trigger)
  - [ ] Summarizer trigger has cron `0 8 * * 1-5` with timezone `America/Chicago`
  - [ ] `/webhooks/slack/interactions` route is registered

  **QA Scenarios**:

  ```
  Scenario: All functions visible in Inngest Dev Server
    Tool: Bash (curl)
    Preconditions: Gateway + Inngest running
    Steps:
      1. curl -s http://localhost:8288/v1/fns | jq 'length'
      2. Assert: count is 5 (was 3, now +2: generic lifecycle + summarizer trigger)
      3. curl -s http://localhost:8288/v1/fns | jq '.[].name'
      4. Assert: contains "employee/task-lifecycle" (generic)
      5. Assert: contains "trigger/daily-summarizer" (cron)
    Expected Result: 5 functions registered
    Evidence: .sisyphus/evidence/task-15-registration.txt

  Scenario: Summarizer trigger has correct cron config
    Tool: Bash (curl)
    Preconditions: Gateway + Inngest running
    Steps:
      1. curl -s http://localhost:8288/v1/fns | jq '.[] | select(.name == "trigger/daily-summarizer")'
      2. Assert: cron is "0 8 * * 1-5"
      3. Assert: timezone is "America/Chicago"
    Expected Result: Correct cron schedule
    Evidence: .sisyphus/evidence/task-15-cron.txt
  ```

  **Commit**: NO (groups with Tasks 14, 16, 17)

---

- [x] 16. Verify Duplicate Run Prevention + Edge Cases

  **What to do**:
  - Duplicate prevention is already built into `createTaskAndDispatch` (Task 10). This task VERIFIES it works correctly and handles edge cases:
    1. **Same-day duplicate**: Trigger adapter fires twice on same day → second call returns null, no duplicate task
    2. **Previous day still pending**: Monday's summary is `AwaitingApproval` at 8am Tuesday → Tuesday creates a NEW task (different `external_id`: `summary-2026-04-15` vs `summary-2026-04-14`)
    3. **Inngest retry**: If `createTaskAndDispatch` is called again due to Inngest step retry → same `external_id` → duplicate detected → skips
    4. **Terminal state allows re-run**: If today's task is `Done` or `Cancelled`, a re-trigger should create a new task (terminal states are not "in-flight")
  - Write unit tests for `createTaskAndDispatch` covering all these cases
  - Verify the PostgREST query correctly filters by non-terminal statuses

  **Must NOT do**:
  - Do NOT add database constraints — application-level check is sufficient for MVP
  - Do NOT cancel previous tasks — just skip duplicate creation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification + unit tests for existing logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 15, 17)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 19
  - **Blocked By**: Task 10 (`createTaskAndDispatch` must be implemented)

  **References**:
  - `src/inngest/lib/create-task-and-dispatch.ts` (from Task 10) — The utility to test
  - `src/workers/lib/postgrest-client.ts` — PostgREST query pattern used in duplicate check

  **Acceptance Criteria**:
  - [ ] Unit tests pass for all 4 edge cases above
  - [ ] `createTaskAndDispatch` returns null on duplicate, task on success

  **QA Scenarios**:

  ```
  Scenario: Same-day duplicate blocked
    Tool: Bash (unit test)
    Steps:
      1. Mock PostgREST to return 1 existing task with matching external_id and status "AwaitingApproval"
      2. Call createTaskAndDispatch with same external_id
      3. Assert: returns null, no POST to /tasks
    Expected Result: Duplicate detected, no new task
    Evidence: .sisyphus/evidence/task-16-duplicate-blocked.txt

  Scenario: Terminal state allows re-run
    Tool: Bash (unit test)
    Steps:
      1. Mock PostgREST to return 1 existing task with matching external_id and status "Done"
      2. Call createTaskAndDispatch with same external_id
      3. Assert: creates new task (terminal state doesn't block)
    Expected Result: New task created
    Evidence: .sisyphus/evidence/task-16-terminal-allows-rerun.txt
  ```

  **Commit**: NO (groups with Tasks 14, 15, 17)

---

- [x] 17. Automated Tests for New Code

  **What to do**:
  - Write Vitest tests for all new code:
    1. **Tool interface tests** (`src/workers/tools/__tests__/param-resolver.test.ts`):
       - `$ENV_VAR` resolution from env map
       - `$prev_result` resolution from previous step output
       - Nested object resolution
       - Missing env var → throws or returns undefined
    2. **slack.readChannels tests** (`src/workers/tools/__tests__/slack-read-channels.test.ts`):
       - Happy path: mock fetch → returns parsed messages
       - Empty channel: returns empty array
       - Rate limit: mock 429 → retries with delay
       - Pagination: mock cursor → follows cursor until done
    3. **llm.generate tests** (`src/workers/tools/__tests__/llm-generate.test.ts`):
       - Wraps callLLM correctly (passes system_prompt, user_prompt, model)
    4. **slack.postMessage tests** (`src/workers/tools/__tests__/slack-post-message.test.ts`):
       - Block Kit structure is valid (has sections, actions, buttons)
       - Button values contain task_id
    5. **Slack webhook tests** (`src/gateway/routes/__tests__/slack-interactions.test.ts`):
       - Valid signature → 200
       - Invalid signature → 401
       - Expired timestamp → 401
       - Unknown action type → 200 (acknowledge)
    6. **Summarizer lifecycle tests** (`src/inngest/__tests__/summarizer-lifecycle.test.ts`):
       - Function ID is correct
       - Cron expression is correct
       - Duplicate detection works
  - Follow existing test patterns in the codebase

  **Must NOT do**:
  - Do NOT write E2E tests (that's Task 19)
  - Do NOT mock Supabase for lifecycle tests — test the logic, mock the HTTP calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Many test files, multiple patterns, need to follow existing conventions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14-16)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 18
  - **Blocked By**: Tasks 8-12 (needs implementations to test)

  **References**:
  - `src/__tests__/` — Existing test directory (follow conventions)
  - `src/inngest/__tests__/lifecycle.test.ts` — Engineering lifecycle test pattern
  - `src/gateway/routes/__tests__/jira.test.ts` — Webhook route test pattern (if exists)
  - `vitest.config.ts` — Test configuration

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run` passes with all new tests
  - [ ] At least 15 new test cases across all files
  - [ ] No regressions to existing 515+ tests

  **QA Scenarios**:

  ```
  Scenario: All new tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run src/workers/tools src/gateway/routes/slack src/inngest/summarizer
      2. Assert: all tests pass
      3. pnpm test -- --run (full suite)
      4. Assert: 530+ tests pass (515 existing + 15+ new)
    Expected Result: Zero failures
    Evidence: .sisyphus/evidence/task-17-tests.txt
  ```

  **Commit**: YES (standalone)
  - Message: `test(summarizer): add tests for tools, lifecycle, and webhook`
  - Files: `src/**/__tests__/*.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 18. Verification Gate 3 — Integration Complete

  **What to do**:
  - Run full verification after Wave 3:
    1. `pnpm build` — zero errors
    2. `pnpm test -- --run` — 530+ passing (515 existing + 15+ new)
    3. `pnpm lint` — zero errors
    4. Start services: gateway + Inngest Dev Server
    5. Verify 4 Inngest functions registered
    6. Verify Slack webhook route responds (401 for unsigned = route exists)
    7. Verify archetype seeded with full config
    8. Docker rebuild: `docker build -t ai-employee-worker:latest .`
    9. Verify generic harness exists in image
  - Fix any issues before proceeding to Wave 4

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Wave 4
  - **Blocked By**: Tasks 14-17

  **Commit**: YES (commit all Wave 3 work)
  - Message: `feat(summarizer): wire approval flow, register lifecycle, add duplicate prevention`
  - Files: updated files from Tasks 14-16
  - Pre-commit: `pnpm test -- --run`

---

- [x] 19. Full E2E Test — Cron → Machine → Summary → Approval

  **What to do**:
  - Start all services: Docker Compose (Supabase), Gateway, Inngest Dev Server
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Run seed: `npx prisma db seed`
  - Manually trigger the summarizer lifecycle (simulate cron):
    1. Use Inngest Dev Server to invoke `summarizer/task-lifecycle` function manually
    2. OR send a cron trigger event via API
  - Verify the complete flow:
    1. Task created in DB with correct archetype_id, external_id, status
    2. Machine dispatched with CMD override (check Inngest logs)
    3. Machine runs generic harness (check execution record in DB)
    4. If SLACK_BOT_TOKEN is configured and valid:
       a. Channel history fetched (check execution logs)
       b. LLM summary generated (check deliverables table)
       c. Approval message posted to Slack with buttons
    5. If SLACK_BOT_TOKEN is NOT configured (dry-run mode):
       a. Verify harness boots and reads archetype
       b. Verify it fails gracefully at Slack API call with descriptive error
       c. Task marked as Failed with error message
  - Test approval flow (if Slack is configured):
    1. Click "Approve" in Slack
    2. Verify: approval message updated to "✅ Approved", final summary posted, task status Done
  - Test rejection flow:
    1. Click "Reject" in Slack
    2. Verify: message updated to "❌ Rejected", task status Cancelled

  **Must NOT do**:
  - Do NOT skip this test — it's the entire point of the MVP
  - Do NOT fake the machine dispatch — use actual Docker/Fly.io

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full system integration test across multiple services
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on everything)
  - **Parallel Group**: Wave 4 (sequential with Task 20)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 14, 15, 16

  **References**:
  - `scripts/trigger-task.ts` — Engineering E2E trigger script (reference for how to set up and monitor a task)
  - `scripts/verify-e2e.ts` — Engineering E2E verification (reference for checking task completion)
  - Inngest Dev Server: `http://localhost:8288` — Function invocation UI

  **Acceptance Criteria**:
  - [ ] Task created with archetype_id linked to summarizer
  - [ ] Machine dispatched with `cmd` override for generic harness
  - [ ] Generic harness reads archetype and executes steps
  - [ ] Task reaches terminal state (Done or Failed with descriptive error)

  **QA Scenarios**:

  ```
  Scenario: Complete lifecycle (with or without Slack token)
    Tool: Bash (curl + Inngest API)
    Preconditions: All services running, image rebuilt, seed applied
    Steps:
      1. Trigger summarizer lifecycle via Inngest Dev Server API
      2. Poll task status via PostgREST every 10 seconds
      3. Assert: task goes through Ready → Executing → (Submitting/Failed)
      4. If Submitting: check deliverables table for summary content
      5. If Failed: check error message is descriptive (not just "unknown error")
    Expected Result: Full lifecycle executed, task in terminal state
    Evidence: .sisyphus/evidence/task-19-e2e.txt

  Scenario: Generic harness uses correct CMD
    Tool: Bash (Inngest logs or Docker logs)
    Steps:
      1. After dispatching, check Inngest step logs for machine creation params
      2. Assert: machine config contains cmd: ["node", "/app/dist/workers/generic-harness.mjs"]
      3. Assert: machine config does NOT contain entrypoint.sh reference
    Expected Result: CMD override confirmed in machine creation
    Evidence: .sisyphus/evidence/task-19-cmd-override.txt
  ```

  **Commit**: NO (evidence only)

---

- [x] 20. AGENTS.md + Documentation Updates

  **What to do**:
  - Update `AGENTS.md` with:
    - New scripts section entry for triggering summarizer
    - New env vars section for summarizer-specific vars
    - Brief description of the generic worker harness and tool registry
    - How to add a new employee (seed archetype → done if tools exist, or add tool → seed archetype)
  - Update `.env.example` comments if not already done in Task 6
  - NO separate docs/ file — keep it in AGENTS.md

  **Must NOT do**:
  - Do NOT create a README.md for the summarizer
  - Do NOT write architecture documentation (that's in the vision doc)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 19)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: None (can reference code from Wave 3)

  **Acceptance Criteria**:
  - [ ] AGENTS.md updated with summarizer section
  - [ ] .env.example up to date

  **Commit**: YES (standalone)
  - Message: `docs: update AGENTS.md and .env.example for summarizer employee`
  - Files: `AGENTS.md`, `.env.example`

---

- [x] 21. Verification Gate 4 — Final

  **What to do**:
  - Final comprehensive check:
    1. `pnpm build` — zero errors
    2. `pnpm test -- --run` — all tests pass (530+)
    3. `pnpm lint` — zero errors
    4. Review all evidence files in `.sisyphus/evidence/`
    5. Verify AGENTS.md is accurate
    6. Verify no engineering regressions: run `pnpm trigger-task` if services are available
  - Sign off for Final Verification Wave

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 19, 20

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start services (`pnpm dev:start`). Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: empty channels, invalid signing secret, double approval click, timeout. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task(s) | Commit Message                                                    | Key Files                                                                                                            |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1             | `feat(schema): add archetype config fields for generic employees` | `prisma/schema.prisma`, migration                                                                                    |
| 2-6           | `feat(tools): add tool registry interface and platform tools`     | `src/workers/tools/*`, `src/lib/fly-client.ts`                                                                       |
| 8-12          | `feat(summarizer): add generic harness, lifecycle, and webhook`   | `src/workers/generic-harness.mts`, `src/inngest/summarizer-lifecycle.ts`, `src/gateway/routes/slack-interactions.ts` |
| 14-16         | `feat(summarizer): wire approval flow and duplicate prevention`   | multiple                                                                                                             |
| 17            | `test(summarizer): add tests for tools, lifecycle, and webhook`   | `src/**/*.test.ts`                                                                                                   |
| 19-20         | `docs: update AGENTS.md and .env.example for summarizer`          | `AGENTS.md`, `.env.example`                                                                                          |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: zero errors
pnpm test -- --run            # Expected: 515+ passing (no regressions) + new tests
pnpm lint                     # Expected: zero errors

# Schema
curl -s http://localhost:54321/rest/v1/archetypes?select=system_prompt,steps,model,deliverable_type -H "apikey: $SUPABASE_ANON_KEY" | jq .
# Expected: 200, array with summarizer archetype record

# Inngest functions (2 new: generic lifecycle + summarizer trigger)
curl -s http://localhost:8288/v1/fns | jq '.[].name'
# Expected: includes "employee/task-lifecycle" and "trigger/daily-summarizer"

# Webhook
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/webhooks/slack/interactions -H "Content-Type: application/x-www-form-urlencoded" -d "payload={}"
# Expected: 401 (unsigned) — not 404

# Worker harness boots
docker run --rm -e TASK_ID=test -e SUPABASE_URL=http://host.docker.internal:54321 -e SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY ai-employee-worker:latest node /app/dist/workers/generic-harness.mjs
# Expected: error about task not found (proves harness boots and reads from Supabase)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (515+ existing + new)
- [ ] Summarizer archetype seeded with full Papi Chulo persona
- [ ] Generic harness dispatches to tools based on archetype steps
- [ ] Approval flow works (approve, reject, timeout)
- [ ] No modifications to engineering entrypoint, orchestrator, or lifecycle
