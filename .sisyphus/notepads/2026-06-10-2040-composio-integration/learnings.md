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
