---
name: data-access-conventions
description: 'Use when adding or modifying a gateway route, an Inngest function, a service, or any code that reads/writes the database, env vars, or makes outbound HTTP calls. Covers the mandatory repository layer, config.ts env access, sendError/sendSuccess, makePostgrestHeaders, mergeTaskMetadata, createHttpClient, and the worker-vs-repository boundary.'
---

# Data-Access Conventions

Seven mandatory conventions introduced in the refactor. Every rule names the exact file it lives in.

---

## Quick Reference

| Rule | Convention                              | File                                                                     |
| ---- | --------------------------------------- | ------------------------------------------------------------------------ |
| 1    | Repository layer for DB access          | `src/repositories/`                                                      |
| 2    | Env access via named helpers            | `src/lib/config.ts`                                                      |
| 3    | Response helpers for all gateway routes | `src/gateway/lib/http-response.ts` + `src/gateway/lib/prisma-helpers.ts` |
| 4    | PostgREST header factory                | `src/inngest/lib/postgrest-headers.ts`                                   |
| 5    | Task metadata merge helper              | `src/inngest/lifecycle/steps/lifecycle-helpers.ts`                       |
| 6    | Outbound HTTP client factory            | `src/lib/http-client.ts`                                                 |
| 7    | Inngest step type alias                 | `src/inngest/events.ts`                                                  |

---

## Rule 1 — Repository Layer

**File**: `src/repositories/`

All Prisma-based DB access from gateway routes and Inngest functions goes through one of the 6 repository modules:

| Module                        | Purpose                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `task-repository.ts`          | Read-only task lookups (by ID, `thread_ts`, `approval_ts`)                       |
| `employee-rule-repository.ts` | Rule CRUD: `get`, `countConfirmed`, `patchConfirm`/`Reject`/`Archive`/`Rephrase` |
| `tenant-repository.ts`        | Tenant create/read/update/soft-delete                                            |
| `tenant-secret-repository.ts` | Encrypted secret read/write                                                      |
| `tenant-env-loader.ts`        | Assembles worker-env record from tenant config + secrets                         |
| `notification-channel.ts`     | Resolves `notification_channel` from archetype or tenant config                  |

**NEVER** write raw `prisma.model.findFirst()` / `prisma.model.update()` inline in a route handler or Inngest function — that logic belongs in a repository.

**NEVER** add write methods to `TaskRepository` — tasks are created and mutated exclusively by the Inngest lifecycle (`src/inngest/employee-lifecycle.ts`). `TaskRepository` is intentionally read-only.

**Worker boundary**: Worker containers run inside Docker/Fly.io and communicate with Supabase via PostgREST REST API (`http://localhost:54331`). They MUST NOT import any repository module — doing so would drag in Prisma and attempt a direct DB connection the container cannot make. Workers use `fetch` + `makePostgrestHeaders`.

---

## Rule 2 — Environment Variable Access

**File**: `src/lib/config.ts`

In gateway and Inngest code, always use one of:

- **`requireEnv(name)`** — throws `Error: Missing required environment variable: ${name}` at call time; use for vars that are non-negotiable at startup (e.g., `ENCRYPTION_KEY`, `ADMIN_API_KEY`).
- **`getEnv(name, defaultValue)`** — returns `process.env[name] ?? defaultValue`; use for optional vars with safe fallbacks.
- **Named lazy getters** exported from `config.ts` (e.g., `SUPABASE_SECRET_KEY()`, `OPENROUTER_API_KEY()`) — these are zero-arg functions that read `process.env` at call time, not at module load time. Import and call them instead of re-reading `process.env`.

**NEVER** access `process.env.FOO` directly in `src/gateway/` or `src/inngest/` — missing vars fail silently and produce cryptic errors at runtime.

**Known exceptions (do NOT "fix"):**

- `src/workers/lib/postgrest-client.ts` uses raw `process.env` intentionally — worker startup guarantees differ from gateway startup.
- `src/inngest/lifecycle/steps/lifecycle-helpers.ts` reads `process.env['FLY_WORKER_APP']` inline — this is a minor residual violation, not an intentional pattern.

**Known violations in existing code (flag new instances, don't copy):**

- `src/gateway/routes/admin-github.ts` and `src/gateway/routes/jira.ts` still read raw `process.env` for webhook/GitHub secrets. These are known tech-debt violations — do not replicate them in new code.

**Worker tools** (`src/worker-tools/`): use `requireEnv()` / `optionalEnv()` — see the `adding-shell-tools` skill.

---

## Rule 3 — Gateway Response Helpers

**Files**: `src/gateway/lib/http-response.ts` · `src/gateway/lib/prisma-helpers.ts`

All admin, OAuth, and internal route handlers must use:

```typescript
// Error responses — all of them
sendError(res, status, code, message?, extra?)
// e.g.:
sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Task not found')
sendError(res, 400, ERROR_CODES.INVALID_REQUEST, 'Missing tenantId', { issues })

// Success responses — all 2xx
sendSuccess(res, 200, { task_id: task.id })  // with body
sendSuccess(res, 204)                          // no content
```

**NEVER** inline `res.status(N).json({ error: '...' })` or `res.status(N).json(data)` — use the helpers.

**`code` argument**: MUST come from `ERROR_CODES` in `src/gateway/lib/prisma-helpers.ts`:

```typescript
export const ERROR_CODES = {
  INVALID_ID: 'INVALID_ID',
  INVALID_REQUEST: 'INVALID_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;
```

**NEVER** pass a hardcoded string literal as the `code` argument — use `ERROR_CODES`.

**Prisma error detection**: Use `isPrismaError(err)` from `src/gateway/lib/prisma-helpers.ts` to detect Prisma constraint violations — **NEVER** `err instanceof PrismaClientKnownRequestError`.

```typescript
if (isPrismaError(err) && err.code === 'P2002') {
  return sendError(res, 409, ERROR_CODES.INVALID_REQUEST, 'Duplicate entry');
}
```

**Exception**: Webhook receiver routes (`hostfully.ts`, `jira.ts`, `github.ts`) use `res.json()` directly for fire-and-forget 200 acks — these are exempt.

---

## Rule 4 — PostgREST Headers

**File**: `src/inngest/lib/postgrest-headers.ts`

All PostgREST requests from Inngest functions use the canonical header factory:

```typescript
import { makePostgrestHeaders } from '../lib/postgrest-headers.js';

// Returns: { apikey, Authorization, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const headers = makePostgrestHeaders(supabaseKey);

// Override a specific header via spread:
const minimalHeaders = { ...makePostgrestHeaders(supabaseKey), Prefer: 'return=minimal' };
```

**NEVER** build the 4 PostgREST headers (`apikey`, `Authorization`, `Content-Type`, `Prefer`) inline — always use `makePostgrestHeaders`. GET requests safely receive the full superset (they ignore `Content-Type` and `Prefer`).

---

## Rule 5 — Task Metadata Updates

**File**: `src/inngest/lifecycle/steps/lifecycle-helpers.ts`

Merging fields into the task `metadata` JSONB column is a common operation. Always use the helper:

```typescript
import { mergeTaskMetadata } from '../lifecycle/steps/lifecycle-helpers.js';

await mergeTaskMetadata(supabaseUrl, headers, taskId, {
  notify_slack_ts: ts,
  notify_slack_channel: channel,
});
```

This helper:

1. GETs current `metadata` for the task
2. Shallow-spreads `updates` onto it
3. Appends `updated_at` ISO timestamp
4. PATCHes back via PostgREST
5. Logs a warning (non-fatal) if the PATCH fails

**NEVER** fetch-then-PATCH task metadata inline — the same 6-step pattern scattered across the codebase is what created tech debt in the first place.

The same file also exports:

- `cleanupExecutionMachine(machineId, taskId)` — destroys Fly or Docker execution container (non-fatal)
- `safeRecordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId)` — records work metric row (non-fatal)
- `writeFeedbackEvent(opts)` — writes a `feedback_events` row for PM approval/rejection (non-fatal)

---

## Rule 6 — Outbound HTTP Clients

**File**: `src/lib/http-client.ts`

Service clients in `src/lib/` (Slack, Hostfully, Fly, GitHub, etc.) use the shared HTTP client factory, which provides 429/`Retry-After` detection and exponential-backoff retry for free:

```typescript
import { createHttpClient } from '../http-client.js';

const http = createHttpClient(
  'https://slack.com',
  { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  { service: 'slack' },
);

const response = await http.post('/api/chat.postMessage', body);
const response = await http.get('/api/resource');
const response = await http.delete('/api/resource/123');
```

**NEVER** write raw `fetch` + hand-rolled retry logic inside a service client — use `createHttpClient`. The factory defaults to `maxAttempts: 3`, `baseDelayMs: 1000ms`, retrying only on `RateLimitExceededError`.

**Exception**: PostgREST calls in Inngest functions are exempt — they use raw `fetch` + `makePostgrestHeaders`. The retry contract for PostgREST is handled at the Inngest step level, not inside the fetch call.

---

## Rule 7 — Inngest Function Signatures

**File**: `src/inngest/events.ts`

Function handler signatures use the aliased `InngestStep` type:

```typescript
import type { InngestStep } from '../events.js';
// InngestStep = GetStepTools<Inngest> from 'inngest'

async ({ event, step }: { event: EventPayload<MyData>; step: InngestStep }) => {
  await step.run('my-step', async () => { ... });
}
```

**NEVER** write `GetStepTools<Inngest>` inline — always import `InngestStep` from `src/inngest/events.ts`.

Event payload shapes (data interfaces) live in `src/inngest/events.ts` or in co-located `*-types.ts` files next to the function. **NEVER** define event data shapes inline in the function file.

---

## Worker-vs-Repository Boundary (Critical)

```
Gateway / Inngest           Worker containers
─────────────────           ─────────────────
Prisma ORM                  PostgREST REST API
src/repositories/           fetch + makePostgrestHeaders
                            (localhost:54331 / Supabase)
```

- **Gateway and Inngest**: use Prisma via `src/repositories/` for all DB access.
- **Worker containers** (running inside Docker/Fly.io): use raw `fetch` to PostgREST. They MUST NOT import any module from `src/repositories/`, `src/lib/config.ts`, or any other gateway/inngest source.
- Crossing this boundary (a worker importing a repository) would cause Prisma initialization inside the container, pulling in `DATABASE_URL` the container doesn't have, and crashing at startup.

---

## Cross-References

- **`prisma` skill** — Prisma schema conventions, migration patterns, soft-delete rules
- **`api-design` skill** — REST route structure, Zod validation, admin auth middleware
- **`inngest` skill** — Inngest function registration, event routing, step composition
- **`adding-shell-tools` skill** — `requireEnv`/`optionalEnv` pattern for worker tool scripts
