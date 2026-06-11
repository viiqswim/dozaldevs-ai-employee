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
composio.connectedAccounts.link(userId, authConfigId)
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
