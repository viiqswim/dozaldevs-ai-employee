# Contributing to AI Employee Platform

This guide covers the key things you need to know before making changes. It links to the authoritative sources rather than duplicating them.

---

## Active vs Deprecated Components

The platform has a clear boundary between active code and deprecated code. **Do not add features to deprecated components.**

### Active (modify freely)

| Component           | Path                                     | Purpose                                |
| ------------------- | ---------------------------------------- | -------------------------------------- |
| Universal lifecycle | `src/inngest/employee-lifecycle.ts`      | All employee task orchestration        |
| OpenCode harness    | `src/workers/opencode-harness.mts`       | Worker container entry point           |
| Shell tools         | `src/worker-tools/`                      | External service integrations          |
| Gateway routes      | `src/gateway/routes/`                    | HTTP API handlers                      |
| Slack handlers      | `src/gateway/slack/handlers/`            | Slack event/action handlers            |
| Shared lib          | `src/lib/`                               | LLM client, encryption, logging, retry |
| Inngest functions   | `src/inngest/` (except deprecated files) | Durable workflows                      |

### Deprecated (do not touch)

| Component                | Path                              | Reason                                          |
| ------------------------ | --------------------------------- | ----------------------------------------------- |
| Engineering lifecycle    | `src/inngest/lifecycle.ts`        | Engineering employee on hold                    |
| Engineering redispatch   | `src/inngest/redispatch.ts`       | Paired with deprecated lifecycle                |
| Engineering watchdog     | `src/inngest/watchdog.ts`         | On hold with engineering employee               |
| Generic worker harness   | `src/workers/generic-harness.mts` | Replaced by OpenCode harness                    |
| Tool registry            | `src/workers/tools/registry.ts`   | Replaced by shell scripts                       |
| Engineering orchestrator | `src/workers/orchestrate.mts`     | On hold; new archetype-based engineer is active |
| Engineering launcher     | `src/workers/entrypoint.sh`       | Engineering only, on hold                       |
| Engineering worker libs  | `src/workers/lib/` (most files)   | Support deprecated orchestrator                 |

Full deprecated component details: [AGENTS.md](AGENTS.md) — "Deprecated Components" section.

---

## Code Layer Boundaries

The codebase enforces strict import direction rules. Never cross these boundaries:

| Layer               | Path                                     | May import from                                              |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `src/gateway/`      | HTTP server, routes, Slack Bolt handlers | `src/lib/`, `src/repositories/`                              |
| `src/inngest/`      | Durable workflow functions               | `src/lib/`, `src/repositories/`                              |
| `src/repositories/` | Prisma-backed data-access objects        | `src/lib/`                                                   |
| `src/lib/`          | Shared utilities                         | external packages only                                       |
| `src/workers/`      | Worker container harness                 | `src/workers/lib/`, NOT `src/repositories/` (uses PostgREST) |

**`src/repositories/`** is the neutral shared layer for Prisma-backed repositories that are consumed by both `src/inngest/` and `src/gateway/`. Files here:

- `tenant-repository.ts` — CRUD for the `tenants` table
- `tenant-secret-repository.ts` — encrypted secrets CRUD for the `tenant_secrets` table
- `tenant-env-loader.ts` — assembles the worker env-var map from tenant config + secrets
- `notification-channel.ts` — pure helper used by `tenant-env-loader.ts`

**Rule**: `src/inngest/` must NEVER import from `src/gateway/` (one-way dependency). If you need shared data-access logic in both, add it to `src/repositories/` — NOT `src/gateway/services/`.

**Worker containers** (everything under `src/workers/` and `src/worker-tools/`) MUST NOT import from `src/repositories/` — they use PostgREST via `src/workers/lib/postgrest-client.ts` to avoid Prisma in the worker bundle.

---

## Task-Creation Paths

Two patterns exist for creating tasks. Use the right one for your context.

### Gateway (Prisma) — for HTTP-triggered tasks

The gateway uses Prisma directly. The canonical entry point for Slack-triggered tasks is `dispatchEmployeeById()` in `src/gateway/services/employee-dispatcher.ts`.

```typescript
import { dispatchEmployeeById } from '../services/employee-dispatcher.js';

await dispatchEmployeeById({ archetypeId, tenantId, payload, slackContext });
```

For Jira-triggered tasks, see `src/gateway/services/jira-task-creation.ts`.

### Worker containers (PostgREST) — for lifecycle writes

Worker containers and the Inngest lifecycle write task state through PostgREST (`http://localhost:54331`), not Prisma. The shared client is `src/workers/lib/postgrest-client.ts`.

**Why two patterns?** Workers run inside Docker containers that don't have direct DB access — they go through PostgREST. The gateway runs in the Node.js process with Prisma available. Full unification (ARCH-1) is deferred.

**Critical**: After any Prisma migration that adds a new table, reload the PostgREST schema cache:

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"
```

---

## Adding a New Shell Tool

Shell tools are TypeScript scripts in `src/worker-tools/{service}/` that run inside the worker Docker container. They're the only way AI employees interact with external services.

**Quick start**: Load the `adding-shell-tools` skill in OpenCode, or read the full guide:

- Skill: `.opencode/skills/adding-shell-tools/SKILL.md`
- Guide: `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`

**Key conventions:**

- Use `requireEnv('VAR_NAME')` from `../lib/require-env.js` instead of manual env checks
- Use `getArg(args, '--flag')` from `../lib/get-arg.js` instead of manual `for` loops
- Use `node:` prefix for Node.js built-ins: `import { readFileSync } from 'node:fs'`
- `--help` check comes first in `main()`, mock mode check comes second
- Output JSON to stdout, errors/warnings to stderr
- Every tool that calls an external API needs a mock fixture in `fixtures/{verb}-{noun}.json`

---

## Worker Tools Development

Shell tools in `src/worker-tools/` have their **own `package.json`** and `node_modules` — separate from the root workspace. This is intentional: the tools run inside Docker containers at `/tools/` and need their own isolated dependency tree.

**Local development setup** (required once, and after any `package.json` change):

```bash
cd src/worker-tools && pnpm install
```

Without this, TypeScript imports from `@notionhq/client`, `@slack/web-api`, and other tool dependencies will fail to resolve in your editor and during type-checking.

**Key facts:**

- `src/worker-tools/` is **bind-mounted** into local Docker containers — no image rebuild needed for tool-only changes locally. Only changes to `src/workers/` require a rebuild.
- In Docker (CI and production), `pnpm install` runs automatically inside the container at build time.
- `pnpm build` (root `tsconfig.build.json`) **excludes** `src/worker-tools/**` — use `tsc --noEmit -p tsconfig.json` (root tsconfig) to type-check tool files.
- `src/worker-tools/lib/` compiled JS artifacts are gitignored — use `git add -f` if you need to stage new files there.

---

## Adding a New Employee

The primary path is the dashboard wizard. It generates all archetype fields from a plain-English description.

1. Open `http://localhost:7700/dashboard/employees/new?tenant=<tenantId>`
2. Describe what the employee does
3. Review and save the generated archetype
4. Set `status` to `active`
5. Trigger via admin API or dashboard

For manual seed-based setup, see [AGENTS.md](AGENTS.md) — "Adding a New Employee" section.

For the full archetype schema and field reference, load the `creating-archetypes` skill.

---

## Running E2E Tests

### Smoke test (fastest — use for any lifecycle change)

```bash
source .env
curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '{task_id: .task_id}'
```

Wait ~60s, then verify:

```bash
TASK_ID=<task_id>
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Done
```

### Full E2E guides

| Guide                                                              | Scenarios | When to use                                     |
| ------------------------------------------------------------------ | --------- | ----------------------------------------------- |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`          | A-F       | Approval paths, terminal states, Slack UX       |
| `docs/testing/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` | A-F       | Rule extraction, feedback consolidation         |
| `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`       | AC1-AC8   | Wizard generation, full lifecycle with approval |

**Minimum for any Slack trigger workflow change**: single-gateway pre-flight + live @mention → Confirm → Done E2E. See [AGENTS.md](AGENTS.md) — "Plan E2E Validation" section.

### Running Tests

| Command                 | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm test`             | Unit suite in watch mode (default — re-runs on file changes) |
| `pnpm test -- --run`    | Unit suite one-shot (used in CI)                             |
| `pnpm test:unit`        | Explicit one-shot unit suite (same as `test -- --run`)       |
| `pnpm test:integration` | DB-backed integration suite (requires running Docker)        |
| `pnpm test:file <path>` | Run a single test file                                       |
| `pnpm test:coverage`    | Unit suite with coverage report                              |

**Single-file example:**

```bash
pnpm test:file tests/unit/lib/classify-message.test.ts
```

Pre-existing skips: `container-boot.test.ts` skips 4 tests when Docker is unavailable. This is expected.

---

## Writing Lifecycle Tests

Unit tests for the universal lifecycle (`src/inngest/employee-lifecycle.ts`) and its approval handler (`src/inngest/lifecycle/steps/approval-handler.ts`) all need the same modules mocked: the Fly.io machine client, the tunnel-URL resolver, the tenant env loader, the two tenant repositories, the Slack `WebClient`, and the worker PostgREST client. Rather than hand-rolling those `vi.fn()` stubs in every file, use the shared factory at `tests/helpers/lifecycle-mocks.ts`.

`createLifecycleMocks()` returns plain objects of `vi.fn()` stubs — one per module, each shaped like that module's exports with sensible overridable defaults. It does **not** call `vi.mock()` itself; you hand each key to a `vi.mock()` factory:

```ts
import { it, expect, vi } from 'vitest';
import * as flyClient from '../../../src/lib/fly-client.js';
import { loadTenantEnv } from '../../../src/gateway/services/tenant-env-loader.js';
import { createLifecycleMocks } from '../../helpers/lifecycle-mocks.js';

vi.mock('../../../src/lib/fly-client.js', () => createLifecycleMocks().flyClient);
vi.mock('../../../src/lib/tunnel-client.js', () => createLifecycleMocks().tunnelClient);
vi.mock(
  '../../../src/gateway/services/tenant-env-loader.js',
  () => createLifecycleMocks().tenantEnvLoader,
);

it('runs the executing step', async () => {
  vi.mocked(flyClient.createMachine).mockResolvedValueOnce({ id: 'm1', state: 'started' });
  // ...drive the lifecycle...
  expect(flyClient.createMachine).toHaveBeenCalledOnce();
  expect(vi.mocked(loadTenantEnv)).toHaveBeenCalled();
});
```

Each `vi.mock()` factory runs `createLifecycleMocks()` independently, so assert on the **imported (now-mocked) binding** (`flyClient.createMachine`, `vi.mocked(loadTenantEnv)`) — that binding _is_ the stub the lifecycle calls.

For the constructor-based modules (`TenantRepository`, `TenantSecretRepository`, `WebClient` — built via `new X(...)` inside the lifecycle), build the factory once and reuse it so you can override and assert on the shared instance:

```ts
const mocks = createLifecycleMocks();
vi.mock('../../../src/gateway/services/tenant-repository.js', () => mocks.tenantRepository);
vi.mock('@slack/web-api', () => mocks.slackWebApi);

mocks.instances.tenantRepository.findById.mockResolvedValue({ id: 't1', slug: 'vlre' });
expect(mocks.instances.slackWebClient.chat.postMessage).toHaveBeenCalled();
```

Defaults: `createMachine`/`getMachine` resolve a `started` machine, `loadTenantEnv` resolves a tenant env with `SLACK_BOT_TOKEN` + `SUPABASE_URL`, repositories resolve a mock tenant row, and `postgrest-client.query` resolves `[]`. Override any of them per test with `.mockResolvedValue(...)`, `.mockResolvedValueOnce(...)`, or `.mockImplementation(...)`.

Reference: `tests/helpers/lifecycle-mocks.ts` (JSDoc usage example at the top) and the sample test `tests/unit/helpers/lifecycle-mocks.test.ts`. This factory is additive — existing lifecycle tests keep their inline mocks; adopt it for new tests.

### Mocking the Inngest step object

Lifecycle tests drive the function through `InngestTestEngine` and override `ctx.step.run` / `ctx.step.waitForEvent` / `ctx.step.sendEvent` inside `transformCtx`. Use `applyStepMocks()` (also in `tests/helpers/lifecycle-mocks.ts`) instead of casting the context to `any` by hand:

```typescript
import { applyStepMocks } from '../../helpers/lifecycle-mocks.js';

new InngestTestEngine({
  function: createEmployeeLifecycleFunction(inngest),
  transformCtx: (ctx) => applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
});
```

`applyStepMocks` runs `@inngest/test`'s `mockCtx()` and assigns only the step methods you pass — the one unavoidable cast (the `Context.Any` type has no typed mock surface) is encapsulated in the helper, so call sites stay `any`-free.

### Collapsing `setTimeout` in lifecycle tests

The lifecycle inserts real delays (e.g. the post-delivery settle wait). To stop tests from waiting on wall-clock time, stub `setTimeout` so callbacks fire synchronously:

```typescript
vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void) => {
  fn();
  return 0 as unknown as NodeJS.Timeout;
});
// pair with vi.unstubAllGlobals() in afterEach
```

For code that loops on a deadline (e.g. `dev-preflight`'s `killAndWait`), prefer `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)` (the async variant flushes the awaited microtasks between timer fires) and `vi.useRealTimers()` in `afterEach`.

---

## API Error Responses

All gateway routes use a standard response format. Use `sendError` from `src/gateway/lib/http-response.ts` for all error responses and `sendSuccess` for all 2xx responses — never call `res.status(...).json(...)` directly. `sendSuccess(res, status, body?)` sends `res.status(status).json(body)` when body is present, `res.status(status).end()` when absent — no envelope wrapping.

### Standard error body

```json
{ "error": "ERROR_CODE", "message": "Optional human-readable description" }
```

Validation errors include an `issues` array:

```json
{ "error": "INVALID_REQUEST", "issues": [{ "code": "invalid_type", "path": ["value"], ... }] }
```

### `sendError` signature

```typescript
sendError(res: Response, status: number, error: string, message?: string, extra?: Record<string, unknown>): void
```

- `error` — machine-readable code; use constants from `ERROR_CODES` in `src/gateway/lib/prisma-helpers.ts`
- `message` — optional human-readable description (omit for standard codes)
- `extra` — optional additional fields merged into the body (e.g. `{ issues: zodError.issues }`)

### Examples

```typescript
// 404 — no message needed
sendError(res, 404, ERROR_CODES.NOT_FOUND);

// 400 with Zod validation issues
sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, { issues: result.error.issues });

// 500 with a message
sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to update setting');
```

### Route factory signature

All route factory functions use the optional-prisma pattern so they can be called with or without an injected client:

```typescript
export function myRoutes(opts: { prisma?: PrismaClient } = {}): Router {
  const { prisma = new PrismaClient() } = opts;
  // ...
}
```

---

## Key Conventions

A few rules that catch most mistakes:

- **Multi-tenancy is mandatory** — every table, query, and API call must be scoped by `tenant_id`
- **Soft deletes only** — use `deleted_at` timestamp, never `DELETE` SQL or Prisma `.delete()`
- **Shared files stay employee-agnostic** — `employee-lifecycle.ts`, `opencode-harness.mts`, and anything in `src/gateway/` or `src/lib/` serves all employees. No employee-specific language in these files.
- **Searchable dropdowns** — use `<SearchableSelect>` from `dashboard/src/components/ui/searchable-select.tsx`, not Radix `<Select>`
- **URL-encode all navigatable state** — tabs, filters, and modals must reflect state in the URL via query params
- **End-user language is non-technical** — "Organization" not "Tenant", "Employee setup" not "Archetype configuration"
- **`pnpm exec tsx`** not bare `tsx` — tsx is not on PATH in this project
- **`src/worker-tools/knowledge_base/` uses snake_case intentionally** — All other tool directories use kebab-case (e.g. `slack/`, `hostfully/`). `knowledge_base/` is the lone exception: it matches the Docker image path `/tools/knowledge_base/` exactly. Do not rename it to `knowledge-base/`.

Full conventions: [AGENTS.md](AGENTS.md) — "Key Conventions" section.

### Barrel Files

We do **not** use `index.ts` barrel files. Import modules directly by their full path.

Three intentional exceptions exist and must not be removed:

| File                                   | Purpose                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| `src/gateway/slack/handlers/index.ts`  | Registers all Slack action/event handlers on the Bolt app |
| `src/lib/enrichment-adapters/index.ts` | Exports the enrichment adapter registry                   |
| `src/lib/model-selection/index.ts`     | Exports the model-selection engine entry point            |

Do not add new barrels. If you find yourself wanting one, export from the specific file instead.

### Swallowed Errors in Bolt Handlers

Slack/Bolt action handlers **must not throw**. If an unhandled exception escapes a Bolt handler, Bolt swallows it silently and the WebSocket connection can break, causing all subsequent Slack interactions to fail.

For this reason, every `catch` block in `src/gateway/slack/handlers/approval-handlers.ts` and `src/gateway/slack/handlers/override-handlers.ts` logs the error and returns without re-throwing. This is intentional, not a code smell.

`src/gateway/lib/socket-mode-lock.ts` uses bare `catch {}` blocks for the same reason: the lock helpers (`readLockPid`, `releaseSocketModeLock`) must never throw during Socket Mode lifecycle events.

**Rule**: In Bolt handler files, always log-and-return in `catch` blocks. Never re-throw. Never leave a `catch` block empty without a comment explaining why.

### Type Assertions (`as unknown as`)

Some external-boundary points require a type assertion because the library's declared types don't match the actual runtime shape. Legitimate uses in this codebase:

- **Bolt `ack` types** — `ack` in action handlers is typed as `() => Promise<void>` but accepts a `replace_original` payload at runtime. Cast: `(ack as unknown as LegacyMessageAck)(...)`.
- **Prisma `InputJsonValue`** — Prisma's JSON field type doesn't accept plain `object`. Cast the value to `InputJsonValue` at the write boundary.
- **Node `dirent` compatibility** — `fs.Dirent` shape differences between Node versions require a cast at the call site.

**Rules:**

- Prefer fixing the type over adding a cast. If the library has a more specific type, use it.
- Never use `as any`. Always cast through `unknown`: `value as unknown as TargetType`.
- Add a one-line comment explaining why the cast is necessary.
- Do not add new `as unknown as` casts outside documented external-boundary points without a code review.

### Logger Variable Naming

Two variable names are used for the logger — both are correct. The split is historical, not intentional:

- `src/inngest/` and `src/gateway/slack/handlers/` use `const log = createLogger(...)`
- `src/gateway/routes/` uses `const logger = createLogger(...)`

**When adding a new file**, follow the convention of its parent directory. **Do not rename existing variables** — the split is documented, not a bug to fix.

---

## Your First PR

The lowest-risk first change is adding a shell tool. It's self-contained, has a clear checklist, and doesn't touch the lifecycle or gateway. Load the `adding-shell-tools` skill for the full guide, or follow the quick path:

1. Copy `src/worker-tools/_template/example-tool.ts` to `src/worker-tools/{service}/{verb}-{noun}.ts`
2. Add a fixture at `src/worker-tools/{service}/fixtures/{verb}-{noun}.json`
3. Run the tool locally in mock mode: `HOSTFULLY_MOCK=true tsx src/worker-tools/{service}/{verb}-{noun}.ts --help`
4. Add a unit test at `tests/unit/worker-tools/{service}/{verb}-{noun}.test.ts`

**Pre-PR commands (run all three, fix any failures before opening the PR):**

```bash
pnpm lint
pnpm build
pnpm test:unit
```

**Smoke-test curl** (verify the trigger endpoint is reachable after `pnpm dev`):

```bash
source .env
curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '{task_id: .task_id}'
```

---

## Where to Put Your Test

| What you're testing                                                               | Directory                     | Runner                  |
| --------------------------------------------------------------------------------- | ----------------------------- | ----------------------- |
| Pure logic, no DB (lifecycle steps, utilities, service logic, shell tool helpers) | `tests/unit/`                 | `pnpm test:unit`        |
| Gateway routes, PostgREST writes, full request/response cycles (needs real DB)    | `tests/integration/`          | `pnpm test:integration` |
| Dashboard React components                                                        | `dashboard/src/**/*.test.tsx` | `pnpm test:dashboard`   |
| **Never** put tests here                                                          | `tests/gateway/`              | Not picked up by vitest |

**`tests/gateway/` is an orphan directory.** Vitest's include glob is `tests/unit/**` and `tests/integration/**`. Any test file placed directly in `tests/gateway/` will never run. Always use `tests/unit/` or `tests/integration/`.

**Gateway route tests without a real DB** belong in `tests/unit/gateway/routes/` — inject a mock Prisma client via the route factory's `opts.prisma` parameter. No DB required.

---

## Writing Gateway Route Tests

Gateway routes accept an optional injected Prisma client, so you can test them without a real DB. The pattern from `tests/unit/gateway/routes/admin-tasks.test.ts`:

```typescript
// tests/unit/gateway/routes/my-feature.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { myFeatureRoutes } from '../../../../src/gateway/routes/my-feature.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ADMIN_KEY = 'test-admin-key';

function makeApp(findFirst: ReturnType<typeof vi.fn>) {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use(
    myFeatureRoutes({
      prisma: { myModel: { findFirst } } as never,
    }),
  );
  return app;
}

describe('GET /admin/tenants/:tenantId/items/:itemId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when X-Admin-Key header missing', async () => {
    const findFirst = vi.fn();
    const res = await request(makeApp(findFirst)).get(`/admin/tenants/${TENANT}/items/item-1`);
    expect(res.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('400 when tenantId is not a UUID', async () => {
    const findFirst = vi.fn();
    const res = await request(makeApp(findFirst))
      .get('/admin/tenants/not-a-uuid/items/item-1')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('404 when item does not exist', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const res = await request(makeApp(findFirst))
      .get(`/admin/tenants/${TENANT}/items/item-1`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });

  it('200 + item when found', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'item-1', name: 'Test', tenant_id: TENANT });
    const res = await request(makeApp(findFirst))
      .get(`/admin/tenants/${TENANT}/items/item-1`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('item-1');
    // Assert tenant scoping — the query must include tenant_id
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenant_id: TENANT }) }),
    );
  });

  it('500 when prisma throws', async () => {
    const findFirst = vi.fn().mockRejectedValue(new Error('DB down'));
    const res = await request(makeApp(findFirst))
      .get(`/admin/tenants/${TENANT}/items/item-1`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'INTERNAL_ERROR' });
  });
});
```

**Key rules for route tests:**

- Cast the partial mock as `never` to satisfy TypeScript: `{ myModel: { findFirst } } as never`
- Always assert that `findFirst` was NOT called on auth failures (proves middleware ran first)
- Always assert `tenant_id` is in the `where` clause (proves multi-tenancy is enforced)
- Use `vi.clearAllMocks()` in `beforeEach` — not `vi.resetAllMocks()` (reset wipes implementations)
- Run with `pnpm test:unit` (exits cleanly). Never use `pnpm test -- --run` (stays in watch mode)

---

## Writing Shell Tool Tests

Shell tools are TypeScript CLI scripts. Because they read from `process.argv` and call external APIs, the cleanest test approach is to extract the pure logic into testable functions and test those directly, rather than spawning the CLI.

Pattern from `tests/unit/worker-tools/hostfully/get-messages-sender.test.ts`:

```typescript
// tests/unit/worker-tools/{service}/{verb}-{noun}.test.ts
import { describe, it, expect } from 'vitest';

// Mirror the exact expression from the tool — test the logic, not the CLI
function mapSenderToOutput(senderType: string | undefined | null): 'guest' | 'host' | null {
  return senderType === 'AGENCY' ? 'host' : senderType ? 'guest' : null;
}

describe('{verb}-{noun} — {description}', () => {
  it('maps AGENCY to host', () => {
    expect(mapSenderToOutput('AGENCY')).toBe('host');
  });

  it('maps GUEST to guest', () => {
    expect(mapSenderToOutput('GUEST')).toBe('guest');
  });

  it('returns null for undefined', () => {
    expect(mapSenderToOutput(undefined)).toBe(null);
  });
});
```

For tools that call external APIs, use the mock fixture path (`HOSTFULLY_MOCK=true`, `SIFELY_MOCK=true`, etc.) to avoid real network calls. The mock mode reads from `fixtures/{verb}-{noun}.json` and returns it verbatim.

**When to use mock mode in tests vs. mirroring logic:**

- **Mirror logic** (copy the expression into the test file): when the function is a pure transformation (mapping, filtering, formatting). No imports needed.
- **Mock mode** (set `process.env.HOSTFULLY_MOCK = 'true'` and import the tool): when you need to test the full CLI output shape, argument parsing, or `--help` output.

**Run shell tool tests:** `pnpm test:unit` (they live in `tests/unit/worker-tools/` and are picked up by the root vitest glob).

---

## Logger Naming and `vi.stubGlobal('setTimeout')`

### `log` vs `logger`

Two variable names exist for the logger. Both are correct — the split is by directory:

| Directory                     | Variable name                      | Example            |
| ----------------------------- | ---------------------------------- | ------------------ |
| `src/inngest/`                | `const log = createLogger(...)`    | `log.info(...)`    |
| `src/gateway/slack/handlers/` | `const log = createLogger(...)`    | `log.info(...)`    |
| `src/gateway/routes/`         | `const logger = createLogger(...)` | `logger.info(...)` |

**Rule**: when adding a new file, follow the convention of its parent directory. Do not rename existing variables.

### `vi.stubGlobal('setTimeout')` in lifecycle tests

The lifecycle inserts real delays (post-delivery settle waits, poll loops). To prevent tests from waiting on wall-clock time, stub `setTimeout` so callbacks fire synchronously:

```typescript
vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void) => {
  fn();
  return 0 as unknown as NodeJS.Timeout;
});
// pair with vi.unstubAllGlobals() in afterEach
```

For code that loops on a deadline (e.g. `killAndWait` in `dev-preflight`), use `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)` instead. The async variant flushes awaited microtasks between timer fires. Always pair with `vi.useRealTimers()` in `afterEach`.

**`pnpm test:unit` vs `pnpm test -- --run`**: always use `pnpm test:unit`. The `pnpm test -- --run` form does not reliably pass `--run` through the pnpm argument separator and can leave vitest in watch mode, blocking any `&&` chain.

---

## Git Rules

- Never use `--no-verify`
- Never add `Co-authored-by` lines to commits
- Never reference AI tools in commit messages
- Markdown filenames: `YYYY-MM-DD-HHMM-{name}.md` (run `date "+%Y-%m-%d-%H%M"` first)

---

## Where to Find More

| Need                           | Where to look                                                 |
| ------------------------------ | ------------------------------------------------------------- |
| **New contributor setup**      | `docs/guides/2026-06-07-2022-new-contributor-setup.md`        |
| Architecture overview          | `docs/architecture/2026-04-14-0104-full-system-vision.md`     |
| All admin API endpoints        | [AGENTS.md](AGENTS.md) — "Admin API" section                  |
| Lifecycle states and debugging | Load `debugging-lifecycle` skill, or `docs/guides/`           |
| Slack integration details      | `docs/guides/2026-05-14-0040-slack-tenant-integration.md`     |
| Personal Slack dev app setup   | `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md` |
| Production debugging           | `docs/guides/2026-06-01-2246-production-debugging-guide.md`   |
| All reference docs             | [AGENTS.md](AGENTS.md) — "Reference Documents" table          |

---

## Adding a Gateway Route

All gateway routes follow the same factory pattern: a function that accepts optional injected dependencies (Prisma, Inngest) and returns an Express `Router`. This makes routes testable without a real DB.

**Full annotated example** (based on `src/gateway/routes/admin-employee-trigger.ts`):

```typescript
// src/gateway/routes/my-feature.ts
import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

import { createLogger } from '../../lib/logger.js';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';

const logger = createLogger('my-feature'); // use 'logger' in routes/, 'log' in inngest/

// Zod schemas — always validate params, query, and body separately
const ParamsSchema = z.object({
  tenantId: z.string().uuid(),
  itemId: z.string().uuid(),
});

const BodySchema = z.object({
  name: z.string().min(1),
  value: z.string().optional(),
});

// Options interface — every injectable dep is optional so tests can inject mocks
export interface MyFeatureRouteOptions {
  prisma?: PrismaClient;
}

// Factory function — returns a Router, never registers globally
export function myFeatureRoutes(opts: MyFeatureRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient(); // default to real client

  router.get(
    '/admin/tenants/:tenantId/items/:itemId',
    requireAdminKey, // admin-key middleware always first
    async (req, res) => {
      // 1. Validate params with Zod — safeParse, never parse (parse throws into 500)
      const paramsResult = ParamsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: paramsResult.error.issues,
        });
        return;
      }

      const { tenantId, itemId } = paramsResult.data;

      try {
        // 2. DB query — always scope by tenant_id (multi-tenancy is mandatory)
        const item = await prisma.myModel.findFirst({
          where: { id: itemId, tenant_id: tenantId, deleted_at: null },
        });

        if (!item) {
          sendError(res, 404, ERROR_CODES.NOT_FOUND);
          return;
        }

        // 3. Success — use sendSuccess, never res.status().json() directly
        sendSuccess(res, 200, { id: item.id, name: item.name });
      } catch (err) {
        logger.error({ err }, 'Unexpected error in GET /admin/tenants/:tenantId/items/:itemId');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  router.post('/admin/tenants/:tenantId/items', requireAdminKey, async (req, res) => {
    const paramsResult = ParamsSchema.pick({ tenantId: true }).safeParse(req.params);
    if (!paramsResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
        issues: paramsResult.error.issues,
      });
      return;
    }

    const bodyResult = BodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
        issues: bodyResult.error.issues,
      });
      return;
    }

    const { tenantId } = paramsResult.data;
    const { name, value } = bodyResult.data;

    try {
      // 4. Writes — never hard-delete; use soft-delete (deleted_at) for removals
      const item = await prisma.myModel.create({
        data: { name, value, tenant_id: tenantId },
      });

      // 5. 201 Created for new resources
      sendSuccess(res, 201, { id: item.id });
    } catch (err) {
      logger.error({ err }, 'Unexpected error in POST /admin/tenants/:tenantId/items');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  return router;
}
```

**Register the router** in `src/gateway/server.ts`:

```typescript
import { myFeatureRoutes } from './routes/my-feature.js';

// Inside the server setup, after other route registrations:
app.use(myFeatureRoutes({ prisma }));
```

**Key rules:**

- `sendError` / `sendSuccess` for every response — never `res.status(N).json(...)` inline
- `requireAdminKey` middleware on every `/admin/` route
- Zod `safeParse` (not `.parse()`) — parse throws into the catch block and returns 500 instead of 400
- Always filter `deleted_at: null` in queries (soft-delete convention)
- Always scope queries by `tenant_id` (multi-tenancy is mandatory)
- Use `ERROR_CODES` constants from `src/gateway/lib/prisma-helpers.ts` for machine-readable error codes
- Logger variable is `logger` in `src/gateway/routes/` (not `log` — that's the inngest convention)

---

## Test Skeletons

Three patterns cover the vast majority of tests in this codebase. Copy the relevant skeleton and fill in the blanks.

### 1. Unit test (pure logic, no DB)

Use for: lifecycle step functions, utility functions, service logic, Slack handler logic.

```typescript
// tests/unit/inngest/lifecycle/steps/my-step.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { myStepFunction } from '../../../../src/inngest/lifecycle/steps/my-step.js';
import { createLifecycleMocks, applyStepMocks } from '../../../helpers/lifecycle-mocks.js';

// Mock external dependencies at the module level — vi.mock hoists to top of file
const mocks = createLifecycleMocks();
vi.mock('../../../../src/lib/fly-client.js', () => mocks.flyClient);
vi.mock('../../../../src/repositories/tenant-env-loader.js', () => mocks.tenantEnvLoader);
vi.mock('../../../../src/repositories/tenant-repository.js', () => mocks.tenantRepository);
vi.mock('@slack/web-api', () => mocks.slackWebApi);

describe('myStepFunction', () => {
  // step mock — executes each step body immediately and returns its value
  const stepRunMock = vi.fn().mockImplementation(async (_id: string, fn: () => unknown) => fn());
  const waitForEventMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions task to the expected state', async () => {
    // Arrange — override defaults for this specific test
    mocks.instances.tenantRepository.findById.mockResolvedValueOnce({
      id: 'tenant-1',
      slug: 'vlre',
    });

    const ctx = {
      taskId: 'task-1',
      tenantId: 'tenant-1',
      archetypeId: 'arch-1',
    };

    // Act
    await myStepFunction(ctx, { run: stepRunMock, waitForEvent: waitForEventMock });

    // Assert
    expect(stepRunMock).toHaveBeenCalledWith('my-step-id', expect.any(Function));
    expect(mocks.instances.tenantRepository.findById).toHaveBeenCalledWith('tenant-1');
  });

  it('handles missing tenant gracefully', async () => {
    mocks.instances.tenantRepository.findById.mockResolvedValueOnce(null);

    const ctx = { taskId: 'task-1', tenantId: 'missing', archetypeId: 'arch-1' };

    await expect(
      myStepFunction(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
    ).rejects.toThrow();
  });
});
```

**When to use `createLifecycleMocks()`**: only when your code under test imports from `src/lib/fly-client.js`, `src/repositories/tenant-env-loader.js`, `src/repositories/tenant-repository.js`, `src/repositories/tenant-secret-repository.js`, or `@slack/web-api`. For simpler units (pure functions, utilities), skip the factory and mock only what you need.

**When to use `applyStepMocks()`**: when driving a lifecycle function through `InngestTestEngine` and you need to override `ctx.step.run` / `ctx.step.waitForEvent` / `ctx.step.sendEvent` without casting to `any`:

```typescript
import { InngestTestEngine } from '@inngest/test';
import { applyStepMocks } from '../../../helpers/lifecycle-mocks.js';

new InngestTestEngine({
  function: createMyInngestFunction(inngest),
  transformCtx: (ctx) => applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
});
```

### 2. Integration test (real DB via supertest)

Use for: gateway routes, PostgREST interactions, full request/response cycles.

```typescript
// tests/integration/gateway/routes/my-feature.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import express from 'express';

import { myFeatureRoutes } from '../../../../src/gateway/routes/my-feature.js';

const prisma = new PrismaClient();

// Build a minimal Express app with just the routes under test
const app = express();
app.use(express.json());
app.use(myFeatureRoutes({ prisma })); // inject real test-DB Prisma client

const ADMIN_KEY = process.env['ADMIN_API_KEY'] ?? 'test-admin-key';
const TENANT_ID = '00000000-0000-0000-0000-000000000003'; // VLRE test tenant

beforeAll(async () => {
  // Seed any test data your route needs
  await prisma.myModel.create({
    data: { id: 'test-item-1', name: 'Test Item', tenant_id: TENANT_ID },
  });
});

afterAll(async () => {
  // Clean up — soft-delete, never hard-delete
  await prisma.myModel.updateMany({
    where: { tenant_id: TENANT_ID },
    data: { deleted_at: new Date() },
  });
  await prisma.$disconnect();
});

describe('GET /admin/tenants/:tenantId/items/:itemId', () => {
  it('returns 200 with the item', async () => {
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/items/test-item-1`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'test-item-1', name: 'Test Item' });
  });

  it('returns 404 for unknown item', async () => {
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/items/does-not-exist`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 401 without admin key', async () => {
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/items/test-item-1`);

    expect(res.status).toBe(401);
  });
});
```

**Prerequisites**: run `pnpm test:db:setup` once before integration tests. The test DB is `ai_employee_test` — the global setup guard throws if `DATABASE_URL` doesn't contain that string.

**Run integration tests**: `pnpm test:integration` (not `pnpm test` — that's unit-only).

### 3. Dashboard component test (React + @testing-library)

Use for: dashboard React components, panels, forms.

```typescript
// dashboard/src/panels/my-feature/MyComponent.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { MyComponent } from './MyComponent.js';

// Mock any hooks that make network calls
vi.mock('../../hooks/useMyData', () => ({
  useMyData: () => ({ data: null, isLoading: false, error: null }),
}));

describe('MyComponent', () => {
  it('renders the component heading', () => {
    render(<MyComponent tenantId="tenant-1" />);

    expect(screen.getByRole('heading', { name: /my feature/i })).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    vi.mocked(useMyData).mockReturnValueOnce({ data: null, isLoading: true, error: null });

    render(<MyComponent tenantId="tenant-1" />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('calls the action handler on button click', () => {
    const onAction = vi.fn();
    render(<MyComponent tenantId="tenant-1" onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onAction).toHaveBeenCalledOnce();
  });
});
```

**Run dashboard tests**: `pnpm test:dashboard` (runs `cd dashboard && pnpm exec vitest run --config vitest.config.ts`). Do NOT run dashboard tests through the root vitest binary — the dashboard uses vitest v4 while the root uses v2.

**Key facts:**

- Dashboard tests live in `dashboard/src/**/*.{test,spec}.{ts,tsx}`
- Setup file: `dashboard/src/tests/setup.ts` (imports `@testing-library/jest-dom`)
- jsdom environment — no real browser, no WebGL. Components using Three.js/WebGL need mocking or CDP-based testing
- `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` are already installed in `dashboard/`
- Use `screen.getByRole` over `getByTestId` — role queries are more resilient to markup changes

**Shell tool template**: `src/worker-tools/_template/example-tool.ts` — copy to `src/worker-tools/{service}/{verb}-{noun}.ts` and follow the inline checklist.
