# Learnings — gm22-hostfully-webhook-trigger

## 2026-05-01 Session Start

### Critical Architectural Decisions

- **DO NOT use `createTaskAndDispatch`** — it requires Inngest `step` context, unavailable in Express routes
- **USE `employee-dispatcher.ts` pattern** — Prisma direct + `inngest.send()` in Express handlers
- **Inngest event name**: `employee/task.dispatched` with `{ taskId, archetypeId }` payload
- **Dedup mechanism**: Catch Prisma P2002 error on `prisma.task.create()` — do NOT SELECT-then-INSERT
- **Composite unique key**: `@@unique([external_id, source_system, tenant_id])` — must supply all 3 fields

### Key Values

- **VLRE Hostfully Agency UID**: `942d08d9-82bb-4fd3-9091-ca0c6b50b578`
- **VLRE Tenant ID**: `00000000-0000-0000-0000-000000000003`
- **Archetype slug**: `guest-messaging`
- **External ID format**: `hostfully-msg-{message_uid}`
- **Source system**: `'hostfully'`

### Route Pattern

- Follow `src/gateway/routes/jira.ts` exactly — Router factory, options interface, inline handler
- Return HTTP 200 for ALL payloads that Hostfully could retry (unknown agency, non-message events)
- Return 400 ONLY for genuinely malformed payloads (Zod validation failure)

### Environment Variables for Registration Script

- `HOSTFULLY_API_KEY` — the API key
- `HOSTFULLY_AGENCY_UID` — `942d08d9-82bb-4fd3-9091-ca0c6b50b578` for VLRE
- `WEBHOOK_PUBLIC_URL` — gateway's public URL (e.g., from Cloudflare tunnel)

### PII Guardrail

- NEVER log `message_content` — only log `agency_uid`, `event_type`, `message_uid`, `thread_uid`

## 2026-05-01 Route Implementation

### Task model field for payload storage
- `input_payload` does NOT exist in the Task model
- Use `raw_event` (Json?) to store the hostfully message context (thread_uid, message_uid, lead_uid, property_uid)

### Tenant config lookup pattern
```typescript
const gm = (t.config as Record<string, unknown> | null)?.['guest_messaging'];
return (gm as Record<string, unknown> | undefined)?.['hostfully_agency_uid'] === agency_uid;
```

### Route registered at POST /webhooks/hostfully
- File: `src/gateway/routes/hostfully.ts`
- Exports: `HostfullyRouteOptions`, `hostfullyRoutes()`
- Build: `pnpm build` exits 0

## Route Registration (server.ts)
- Import added after `jiraRoutes` import (line 8)
- Route registered after `jiraRoutes` registration (line 155)
- Pattern: `app.use(hostfullyRoutes({ inngestClient: options.inngestClient, prisma }));`
- No auth middleware needed on the Hostfully webhook route

## .env.example
- Added `HOSTFULLY_API_KEY=`, `HOSTFULLY_AGENCY_UID=`, `WEBHOOK_PUBLIC_URL=` under a new "Hostfully Integration" section before Telegram Notifications
- `pnpm build` exits 0 after changes

## Unit Test Patterns (hostfully.test.ts)

**Date**: 2026-05-01

### Test structure
- Follows `jira.test.ts` template exactly: `makeApp(overrides)` factory, `supertest`, inline mocked Prisma, `beforeEach(() => vi.clearAllMocks())`
- `makeApp` returns just `app` (not a tuple); callers create `vi.fn()` mocks before passing as overrides so they can inspect call args
- Prisma mock shape: `{ tenant: { findMany }, archetype: { findUnique }, task: { create } }` cast as `never`
- `inngestClient` defaults to `undefined` — tests that need inngest explicitly pass `{ send: vi.fn() }`

### P2002 duplicate test
- Throw plain object `{ code: 'P2002' }` (NOT `PrismaClientKnownRequestError`) — route checks `(error as any)?.code === 'P2002'`
- Using `PrismaClientKnownRequestError` is unnecessary and would also work but adds import overhead

### Running tests
- Use `pnpm exec vitest run <path>` (subcommand syntax) NOT `pnpm test -- --run <path>` (flag syntax)
- The flag syntax `pnpm test -- --run path` runs ALL tests due to vitest config; subcommand syntax filters correctly
- Global setup requires DB at `localhost:54322` even for unit tests — Docker must be running

### Non-NEW_INBOX_MESSAGE test
- The route bails BEFORE calling `prisma.tenant.findMany` for non-message events
- So pass explicit overrides for all 3 Prisma mocks in test 2 to verify none are called

### valid payload shape (all required fields)
```json
{ "agency_uid": "...", "event_type": "...", "message_uid": "...", "thread_uid": "..." }
```
(`lead_uid`, `property_uid` are optional in schema but good to include for raw_event assertions)

## Integration Test Patterns (T8)

- `beforeAll` to seed/update tenant config is needed when test DB may be stale — VLRE tenant must have `config.guest_messaging.hostfully_agency_uid` set for hostfully route to match
- `vi.spyOn(inngestMock, 'send')` must be set up BEFORE calling `createTestApp` to catch the spy correctly — actually no: spy needs to be set up before the `inject` call that triggers the route (after `createTestApp`)
- `npx vitest run tests/gateway/hostfully-webhook.test.ts` is the reliable isolation command (vs `pnpm test -- --run` which runs the full suite due to vitest config with `singleFork: true`)
- Route: `POST /webhooks/hostfully` — registered in `server.ts` line 156 via `hostfullyRoutes({ inngestClient, prisma })`
- T7 (server registration) was already done in parallel when T8 ran — `hostfullyRoutes` import and `app.use` were already in server.ts
