# Learnings — composio-integration

## [2026-06-10] Plan Initialization

### Composio v3 SDK

- SDK is `@composio/core` (current ~0.10.0, May 2026) — major rewrite from v1/v2
- All old terms (`ComposioToolSet`, `entity_id`, `actions`, `apps`, `integrations`) are DEAD
- Use `composio.create(userId)` → `session.mcp.url` + `session.mcp.headers`
- Use `link()` not `initiate()` — `initiate()` retired for managed OAuth 2026-07-03
- Pin exact SDK version (no `^`)

### MCP Injection Architecture

- Injection point: `src/workers/lib/execution-phase.mts` — after `writeOpencodeAuth()`, before `runOpencodeSession()`
- `writeOpencodeAuth()` in `harness-helpers.mts` CLOBBERS `opencode.json` wholesale
- MCP injection MUST be read-merge-write (not clobber)
- `@composio/core` SDK goes in GATEWAY deps ONLY — NOT in worker Docker image
- Worker only consumes MCP url+headers — no SDK in worker

### Tenant Namespacing

- `tenant_id` → Composio `user_id` namespaced as `tenant_${tenantId}`
- Per-TENANT connections only — no per-user connections

### Security

- May 2026 Composio breach: ~5,001 GitHub connections compromised; all API keys before 2026-05-22 force-deleted
- `COMPOSIO_DENIED_TOOLKITS`: GitHub, financial/payment, platform infra — PERMANENT denylist
- Enforced at MCP injection time in `writeComposioMcpConfig()`

### Schema

- `tenant_integrations` has `@@unique([tenant_id, provider])` — can only hold ONE row per provider
- Composio needs N rows (one per connected toolkit) → New `composio_connections` table required
- Also need `task_composio_calls` audit table

### AGENTS.md Compiler

- Platform AGENTS.md says "use only `/tools/`" — MCP tools would be silently ignored without update
- Must update `agents-md-compiler.mts` to inject Composio tools section when connections exist
- Must update `src/workers/config/agents.md` to allow MCP tools alongside `/tools/`

### COMPOSIO_API_KEY Injection

- Add to `PLATFORM_ENV_WHITELIST` in `src/repositories/tenant-env-loader.ts`
- Flows into container via `machine-provisioner.ts`

### Pricing

- Composio Cloud: Free 20K tool-calls/mo → $29 (200K) → $229 (2M) → Enterprise
- Self-hosting requires enterprise contract (no public free path)

## [2026-06-11] Wave 1 Spike Results

### Actual API Shape (v0.10.0) — VERIFIED

**link() call — CORRECT form:**

```ts
composio.connectedAccounts.link(userId, authConfigId);
// → ConnectionRequest { id, status: 'INITIATED', redirectUrl: 'https://connect.composio.dev/link/lk_...' }
```

NOT `session.link()` — that method does not exist on ToolRouterSession.
ToolRouterSession has `.authorize()` for per-session OAuth, but for standalone connection creation use `connectedAccounts.link()`.

**Execute API endpoint — CORRECT form:**

```
POST https://backend.composio.dev/api/v3.1/tools/execute/{TOOL_SLUG}
Headers: x-api-key: <COMPOSIO_API_KEY>
Body: { "user_id": "<userId>", "arguments": { ...toolArgs } }
```

NOT `/api/v1/actions/` (returns 410 GONE).
NOT `"input"` field — correct field is `"arguments"`.

**Connected accounts endpoint:**

```
GET https://backend.composio.dev/api/v3.1/connected_accounts?user_id=...&toolkit_slug=...
```

Underscore: `/connected_accounts` not `/connected-accounts`.

**OAuth URL format:** `https://connect.composio.dev/link/lk_XXXXX`

**Connection statuses observed:** INITIALIZING → (after OAuth) → ACTIVE

### Spike Verdict: STOP (partial)

- link() verified working ✓
- Execute API NOT tested (OAuth not completed during spike session)
- Remaining gate: human must complete OAuth + Execute API must return Notion page text

## [2026-06-11] Wave 1 Spike — FINAL RESULTS (PASS)

### Execute API — Correct Tool Slugs for Notion

**WRONG slug (from task spec):** `NOTION_RETRIEVE_A_PAGE` → 404 "Tool not found"

**Correct slugs:**

- `NOTION_RETRIEVE_PAGE` — returns page metadata only (title, properties, timestamps, URL). Does NOT return body content.
- `NOTION_GET_PAGE_MARKDOWN` — returns full page content as markdown. USE THIS for content retrieval.
- `NOTION_FETCH_ALL_BLOCK_CONTENTS` — also available for block-level content

**Verified call:**

```
POST https://backend.composio.dev/api/v3.1/tools/execute/NOTION_GET_PAGE_MARKDOWN
Body: { "user_id": "tenant_spike-test", "arguments": { "page_id": "376d55e97d98808588ffe476de1704d6" } }
Response: { "data": { "markdown": "# System Architecture\nTwo diagrams below...", "successful": true } }
```

### Wave 1 Hard Gate: PASS

- link() → OAuth URL ✓
- OAuth completed by user ✓
- Execute API (NOTION_GET_PAGE_MARKDOWN) → known text found ✓
- VERDICT: PASS written to .sisyphus/evidence/composio/task-1-spike.txt

## [2026-06-11] Task 2 — Cross-Tenant Isolation Proof (PASS)

### Isolation mechanism: Composio `user_id` namespacing

- Call with `user_id: "tenant_spike-test"` (ACTIVE Notion connection) → HTTP 200, returns full page markdown
- Call with `user_id: "tenant_OTHER-TENANT"` (no connections) → HTTP 400, error code 1810 `ActionExecute_ConnectedAccountNotFound`

**Error shape for unknown user_id:**

```json
{
  "error": {
    "message": "No connected account found for user ID tenant_OTHER-TENANT for toolkit notion",
    "code": 1810,
    "slug": "ActionExecute_ConnectedAccountNotFound",
    "status": 400,
    "suggested_fix": "No active connection exists..."
  }
}
```

### Isolation verdict: PASS

- HTTP 400 is returned — no cross-tenant data leakage
- `user_id` namespacing is the isolation boundary — a user_id without a connection for the requested toolkit gets a hard 400 error
- Safe to use `tenant_${tenantId}` as the Composio user_id namespace for production tenant isolation

### Evidence

`.sisyphus/evidence/composio/task-2-isolation.txt`

## [2026-06-10] Task 3 — Prisma Schema Migration

### Shadow DB Blocked by RLS Migration

`pnpm prisma migrate dev` fails on this codebase with:

```
Error: P3006
Migration `20260601214116_add_rls_policies` failed to apply cleanly to the shadow database.
Error code: P1014 — The underlying table for model `public._prisma_migrations` does not exist.
```

Root cause: `20260601214116_add_rls_policies` enables RLS on `_prisma_migrations` without granting any policies. When Prisma creates the shadow DB and re-applies all migrations, it hits this RLS block and can no longer read `_prisma_migrations`.

`--create-only` flag also triggers the shadow DB check and fails identically.

### Workaround: Manual Migration + resolve

1. Create migration directory + SQL manually
2. Apply SQL directly: `psql postgresql://... -f migration.sql`
3. Register: `pnpm prisma migrate resolve --applied <migration_name>`
4. Regenerate client: `pnpm prisma generate`
5. Reload PostgREST: `psql ... -c "NOTIFY pgrst, 'reload schema';"`

This is the established pattern for ALL future migrations in this codebase.

### @@map() is Required

Models without `@@map("snake_case")` would create PascalCase tables. All existing models use explicit `@@map`. Added `@@map("composio_connections")` and `@@map("task_composio_calls")` even though the task spec didn't include it — required for PostgREST compatibility.

### Tables Created

- `composio_connections` — tenant-scoped, one row per toolkit, soft-delete via `deleted_at`
- `task_composio_calls` — audit log for tool calls made during task execution

## [2026-06-10] Task 4 — ComposioConnectionRepository

### Created

- `src/repositories/composio-connection-repository.ts` — 6 methods, Prisma-based, follows `tenant-secret-repository.ts` pattern exactly
- `tests/unit/repositories/composio-connection-repository.test.ts` — 5 tests across 3 methods (getActiveConnections, upsertConnection, disconnectConnection)

### upsert composite-key gotcha

- Prisma's compound-unique `where` for `@@unique([tenant_id, toolkit])` is keyed as `tenant_id_toolkit: { tenant_id, toolkit }` (underscore-joined field names), NOT `tenant_id, toolkit` flat.
- Mirror of `tenant-secret-repository.ts` which uses `tenant_id_key`.

### disconnect/softDelete use updateMany (not update)

- `update` requires a unique `where`; our `where` includes `deleted_at: null` (non-unique filter), so `updateMany` is correct. Returns `{ count }`, method returns `void`.

### Stale LSP after prisma generate

- After adding a model + `prisma generate`, the in-editor LSP keeps showing `Property 'composioConnection' does not exist` / `no exported member 'ComposioConnection'` from cached types.
- `prisma generate` DID write the types (verified in `.prisma/client/index.d.ts`). The authoritative check is `pnpm build` (tsc) — it compiled with 0 errors. Ignore stale per-edit LSP diagnostics; trust the tsc build.

### Comment hook

- Repo convention: every repository file carries a file-level `/** Location rationale... Worker containers MUST NOT import... */` header (see tenant-secret-repository.ts, task-repository.ts). This header is REQUIRED and justified — keep it.
- Per-method docstrings are NOT used in existing repos — removed them to match convention.

### Verification

- `pnpm vitest run tests/unit/repositories/composio-connection-repository.test.ts` → 5 passed
- Full `pnpm test:unit` → 1698 passed, 9 skipped, 0 failures
- `pnpm build` → 0 errors

## [2026-06-10] Task 5 — composio/execute.ts Shell Tool

### Created

- `src/worker-tools/composio/execute.ts` — raw-HTTP wrapper for the Composio Execute API (no SDK)
- `src/worker-tools/composio/__fixtures__/execute.json` — mock fixture (Notion markdown shape)
- `tests/unit/worker-tools/composio-execute.test.ts` — 2 tests (denied toolkit, mock mode)

### yargs vs getArg — used getArg

- Task spec said "parse args with yargs (follow post-message.ts pattern)" but those two conflict: `post-message.ts`, `_template/example-tool.ts`, and the `adding-shell-tools` skill ALL use `getArg` from `../lib/get-arg.js`. yargs is NOT a `src/worker-tools/package.json` dependency. Followed the established codebase convention (getArg) — the skill explicitly forbids CLI frameworks.

### Fixture dir: **fixtures** vs fixtures

- Existing tools use `fixtures/` (google, notion, jira, hostfully). Task 5 spec explicitly required `__fixtures__/execute.json` — used the spec's name. Tool references it via `new URL('./__fixtures__/execute.json', import.meta.url)`.

### Ordering invariant (security)

- Denylist check runs BEFORE mock mode AND before `requireEnv` — a denied toolkit can never execute, not even with `--mock`. Verified: `--toolkit github` exits 1 with `{error, code:"TOOLKIT_DENIED"}` and makes zero fetch calls.
- Mock mode runs BEFORE `requireEnv('COMPOSIO_API_KEY')` so `--mock` works without credentials (matches the verify command in the task spec).

### console.log/error vs process.stdout/stderr.write

- Task spec dictated `console.log`/`console.error` for output (denied + HTTP error paths). The reference tools use `process.stdout.write`. Both work; test harness must spy on BOTH `console.*` and `process.*.write` to capture all output. The `--help` block uses `process.stdout.write` (multi-line string) to match reference tools.

### HTTP contract (from spike)

- `POST https://backend.composio.dev/api/v3.1/tools/execute/{ACTION_SLUG}`
- Header `x-api-key` (NOT Bearer); body `{ user_id: "tenant_${tenantId}", arguments: <params> }`
- Error output shape: `{ error: body.error?.message ?? "HTTP error", status: response.status }` to stderr, exit 1

### Verification

- `pnpm vitest run tests/unit/worker-tools/composio-execute.test.ts` → 2 passed
- `--help` exit 0, `--mock` returns fixture JSON exit 0, denied toolkit exit 1 — all confirmed via CLI
- `pnpm build` → 0 errors (exit 0)
- `pnpm exec eslint <both files>` → 0 errors (exit 0)
- Stale LSP errors on `composio-connection-repository.ts` (Task 4 file) persist in-editor but tsc compiles clean — same artifact documented in Task 4.

### NOT done (out of scope per spec)

- No `@composio/core` import (raw fetch only)
- No COMPOSIO_CALL_COUNT / 50-call soft-cap tracking (future enhancement)
- COMPOSIO_API_KEY never printed in any output path

## Task 6 — Env Whitelist & TASK_TENANT_ID (2026-06-10)

### COMPOSIO_API_KEY whitelist

- Added `COMPOSIO_API_KEY` to `PLATFORM_ENV_WHITELIST` in `src/repositories/tenant-env-loader.ts`
- Reordered the array alphabetically while there
- This makes the key flow automatically into all worker containers via `loadTenantEnv()`

### TASK_TENANT_ID discovery

- The composio shell tool (`src/worker-tools/composio/execute.ts`) reads `requireEnv('TASK_TENANT_ID')`
- BUT machine-provisioner.ts only passes `TENANT_ID` (not `TASK_TENANT_ID`) to containers
- Fix: added `TASK_TENANT_ID: tenantId` alongside `TENANT_ID: tenantId` in BOTH the local Docker path (line ~182) and the Fly.io path (line ~233) in `src/inngest/lifecycle/lib/machine-provisioner.ts`
- Both vars now point to the same value — `TENANT_ID` for backward compat, `TASK_TENANT_ID` for the composio tool

## Task 7 — Composio OAuth Connect/Callback Routes (2026-06-10)

### Created

- `src/gateway/routes/composio-oauth.ts` — connect + callback routes, mirrors `notion-oauth.ts` structure
- `tests/integration/composio-oauth.test.ts` — 5 tests (200 url shape, no-key-leak, denied 400, missing-toolkit 400, 401 no-auth)
- Added `COMPOSIO_API_KEY` lazy getter to `src/lib/config.ts` (Composio section, before Email)
- Registered router in `src/gateway/server.ts` via `app.use(composioOAuthRoutes({ prisma }))` after adminGoogleRoutes

### SDK `link()` signature — VERIFIED from .d.mts

- `composio.connectedAccounts.link(userId, authConfigId, options?)` → `Promise<ConnectionRequest>`
- `ConnectionRequest.redirectUrl` is the OAuth URL to return to the browser
- Constructor: `new Composio({ apiKey })`
- Source of truth: `node_modules/@composio/core/dist/composio-DRl6WCI9.d.mts:3936`

### Route path style — full path, no prefix mount

- Connect/callback use FULL admin paths (`/admin/tenants/:tenantId/composio/...`) and mount via bare `app.use(composioOAuthRoutes(...))` — same as `adminGithubRoutes`, NOT the `/integrations` prefix that notion/jira/google OAuth routes use.
- This is because they are admin/tenant-scoped (auth-guarded), not public OAuth-install routes.

### Testability injection

- Added optional `composio?: Pick<Composio, 'connectedAccounts'>` to route options so the integration test injects a fake `{ connectedAccounts: { link: vi.fn() } }` — no real network call, no SDK instantiation. Falls back to `new Composio({ apiKey })` in production.

### Auth on connect, none on callback

- Connect: `authMiddleware + requireAuth + requireTenantRole(ADMIN)` — SERVICE_TOKEN bypasses membership (test uses `Bearer $SERVICE_TOKEN`).
- Callback: NO auth (browser redirect from Composio) — just validates tenantId + toolkit, upserts, redirects to `/dashboard/integrations/composio`.

### Denylist ordering (security)

- Denied-toolkit check runs BEFORE reading `COMPOSIO_API_KEY` and BEFORE the SDK call — a denied toolkit never reaches Composio. Mirrors the ordering invariant in `execute.ts`.

### Stale LSP (same as Task 4)

- In-editor LSP showed `composioConnection does not exist` / `no exported member ComposioConnection` again. `pnpm prisma generate` + `pnpm build` (tsc) → 0 errors is authoritative. The repo LSP server also errored with "No version is set for typescript-language-server" — `pnpm build` is the verification source of truth here.

### Verification

- `pnpm build` → 0 errors
- `pnpm vitest run --config vitest.integration.config.ts tests/integration/composio-oauth.test.ts` → 5 passed
- `pnpm exec eslint <4 changed files>` → 0 errors

## Task 8 — AGENTS.md Compiler Composio Injection (2026-06-11)

### compileAgentsMd is SYNC — keep it sync

- `compileAgentsMd()` has 25 existing sync unit tests + 3 caller sites (`execution-phase.mts`, `delivery-phase.mts`, `admin-brain-preview.ts`). Making it async to fetch connections inline would break all of them.
- Chosen design: add an OPTIONAL `connectedToolkits?: string[]` field to `CompileAgentsMdInput` (sync, directly unit-testable) + a SEPARATE async `loadConnectedToolkits(tenantId)` PostgREST helper exported from the same file. Callers fetch then pass in. Fully backward compatible — undefined/empty → section omitted.

### PostgREST in compiler — reuse worker `query()` helper

- `agents-md-compiler.mts` imports `query` from `./postgrest-client.js` (the worker PostgREST client, NOT Prisma — worker boundary). `query<T>(table, params)` returns `T[] | null`; null on missing env or HTTP failure → `loadConnectedToolkits` returns `[]` → section absent. Graceful degradation, never throws.
- Query string: `tenant_id=eq.${tenantId}&status=eq.active&deleted_at=is.null&select=toolkit`.

### Injection point

- Section pushed AFTER the `<delivery-instructions>` block and BEFORE Behavioral Rules / Knowledge Base (the employee-specific sections). Matches plan spec "after shell tools, before employee-specific instructions."

### tenant_id source in callers

- `TaskWithArchetype.tenant_id` (snake_case, optional) is the source. Both phases: `task.tenant_id ? await loadConnectedToolkits(task.tenant_id) : []`.

### Testing — mock the `query` export

- `vi.mock('../../../src/workers/lib/postgrest-client.js', () => ({ query: queryMock }))` with `vi.hoisted`. Drive the two required scenarios (1+ rows / empty array) plus null-failure, de-dup, empty-tenantId, and placement assertions. 10 tests, all green. Existing 25 compiler tests still pass — no regression.

### Verification

- `pnpm vitest run` (new + existing compiler tests) → 35 passed
- `pnpm build` → EXIT 0
- Stale LSP on `composio-connection-repository.ts` (Task 4 artifact) + `vitest.config.ts` coverage overload persist in-editor — both pre-existing, unrelated to Task 8; tsc is authoritative.
