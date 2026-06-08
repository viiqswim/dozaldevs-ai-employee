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
