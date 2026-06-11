# Composio Integration — 1000+ App Connections via REST API Shell Tool

## TL;DR

> **Quick Summary**: Integrate Composio into the AI Employee Platform so tenant admins can connect apps (starting with Notion) via a dashboard UI, and AI employees can call those apps via a token-efficient shell tool that wraps the Composio Execute API — opening the door to 1000+ apps with no new custom code per app.
>
> **Architecture** (REST API shell tool, NOT MCP):
>
> - AI employees call: `node /tools/composio/execute.ts --toolkit notion --action NOTION_RETRIEVE_A_PAGE --params '{"page_id": "..."}'`
> - Shell tool wraps Composio's Execute API — token-efficient, follows existing platform patterns
> - `@composio/core` SDK stays gateway-only (for OAuth connect flow only)
> - No MCP injection, no opencode.json changes, no complex harness modifications
>
> **Deliverables**:
>
> - Wave 1 (spike gate): Verify SDK `link()` + OAuth; verify Execute API reads Notion; cross-tenant isolation
> - Wave 2 (max parallel): `composio_connections` table + repo; `composio/execute.ts` shell tool; env whitelist; gateway OAuth routes; AGENTS.md injection; tool-call metering
> - Wave 3: Admin API; dashboard "Connect an app" page; Docker image + end-to-end wiring
> - Wave Final: Live E2E — real worker task reads Notion page via shell tool
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES — Wave 1 sequential gate, Wave 2 max parallel, Wave 3 after Wave 2
> **Critical Path**: Task 1 → Task 2 → Wave 2 → Wave 3 → Task 13 (live E2E)

---

## Context

### Original Request

"Help me research if and how we could use composio.dev to augment our custom connections so customers can get 1000+ apps from Day 1. Help me understand how to set it up, configure it, and add it to the codebase so AI employees can use all tools connected in an org/tenant once humans have connected to it."

### Architecture Decision: REST API Shell Tool (Not MCP)

MCP was the initially-planned interface but was rejected due to token overhead:

- MCP lists the full tool schema for every connected app on every task invocation → thousands of extra tokens
- Shell tool approach: AI calls one command with known shape → token-efficient, deterministic
- Shell tool follows the exact same pattern as existing tools (`/tools/slack/`, `/tools/hostfully/`, etc.)

### User Decisions

1. **Strategy**: AUGMENT — all existing custom integrations (Slack, Google, GitHub, Jira, Notion, Hostfully, Sifely) stay as-is; Composio adds the long tail
2. **Interface**: REST API shell tool (not MCP)
3. **Schema**: New `composio_connections` table (not JSON blob on existing row)
4. **Dashboard UI**: "Connect an app" UI is in-scope (Wave 3)
5. **Prereqs confirmed**: `COMPOSIO_API_KEY` already in `.env`; Notion auth config ID: `ac_Gsqb4UMAQUkD`
6. **First toolkit**: Notion only (others deferred)
7. **Security**: `COMPOSIO_DENIED_TOOLKITS` — GitHub, financial/payment, platform infra — enforced in shell tool

### Confirmed Test Data

- **Notion auth config ID**: `ac_Gsqb4UMAQUkD`
- **Notion test page ID**: `376d55e97d98808588ffe476de1704d6`
- **Known text on page**: `"Two diagrams below. The first shows where everything lives. The second shows what happens when a quote is requested."`

### How It Works (End to End)

1. Tenant admin visits dashboard → "Connect an app" → selects Notion → gateway calls `link()` → redirected to Notion OAuth
2. After OAuth callback: `composio_connections` row created for `(tenant_id, "notion")`
3. On next task execution: `agents-md-compiler.mts` checks for active connections → injects Composio section into compiled AGENTS.md listing available toolkits + shell tool usage
4. AI employee sees: "You have access to these connected apps: notion. Use `node /tools/composio/execute.ts --toolkit notion --action <ACTION_NAME> --params <JSON>`"
5. AI employee calls the shell tool → shell tool calls Composio Execute API → returns JSON result
6. Audit row written to `task_composio_calls`

### Key Constants

- `COMPOSIO_DENIED_TOOLKITS`: `['github', 'stripe', 'paypal', 'plaid', 'fly', 'render', 'aws', 'gcp', 'azure']`
- `COMPOSIO_MAX_CALLS_PER_TASK = 50` (soft cap — warning log, not hard stop)
- Composio `userId` = `tenant_${tenantId}` (namespaced per tenant)
- Shell tool path in Docker: `/tools/composio/execute.ts`
- Source path: `src/worker-tools/composio/execute.ts`

---

## Work Objectives

### Concrete Deliverables

- `prisma/schema.prisma`: `ComposioConnection` model + `TaskComposioCall` audit model
- `src/repositories/composio-connection-repository.ts`: tenant-scoped data access
- `src/worker-tools/composio/execute.ts`: shell tool wrapping Composio Execute API
- `src/gateway/routes/composio-oauth.ts`: connect route + OAuth callback (mirrors `notion-oauth.ts`)
- `src/workers/lib/agents-md-compiler.mts`: inject Composio tools section when connections exist
- Admin API: `GET /admin/tenants/:tenantId/composio/connections`, `DELETE .../connections/:toolkit`, `GET .../composio/usage`
- Dashboard "Connect an app" page under `dashboard/src/`
- Docker image rebuilt with `/tools/composio/` included

### Must Have

- Wave 1 spike passes before any Wave 2 code is written (hard gate)
- `@composio/core` installed in gateway only (NOT in worker Docker image — shell tool uses raw HTTP)
- `link()` used for OAuth (not deprecated `initiate()`)
- `COMPOSIO_DENIED_TOOLKITS` enforced in shell tool (exits non-zero for denied toolkits)
- Per-tenant isolation: `tenant_${tenantId}` as Composio `userId`; cross-tenant proof in spike
- Tool-call metering: `task_composio_calls` audit row per call
- Live E2E: real worker task reads the known Notion page text via shell tool

### Must NOT Have (Guardrails)

- Do NOT install `@composio/core` in the worker Docker image — shell tool uses raw HTTP only
- Do NOT use MCP injection or modify `opencode.json` for Composio
- Do NOT migrate/modify/route ANY existing in-house tool through Composio
- Do NOT use `initiate()` — `link()` only
- Do NOT implement per-USER connections — per-TENANT only
- Do NOT add toolkits beyond Notion in this plan
- Do NOT hard-stop tasks when Composio is unavailable — graceful degradation (error JSON returned)
- Do NOT hardcode `COMPOSIO_API_KEY` anywhere — env var only

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (SEQUENTIAL GATE — must all pass before Wave 2):
├── Task 1: Verify @composio/core link() → OAuth URL + Execute API → reads Notion page
└── Task 2: Cross-tenant isolation proof via Execute API

Wave 2 (After Wave 1 — MAX PARALLEL):
├── Task 3: composio_connections + task_composio_calls Prisma tables + migration
├── Task 4: ComposioConnectionRepository
├── Task 5: composio/execute.ts shell tool (wraps Execute API + denylist + metering)
├── Task 6: COMPOSIO_API_KEY in PLATFORM_ENV_WHITELIST + TENANT_ID available in worker env
├── Task 7: Gateway connect route + OAuth callback (link())
└── Task 8: AGENTS.md compiler injection (available toolkits + usage instructions)

Wave 3 (After Wave 2):
├── Task 9: Admin API — list/connect/disconnect + usage endpoint
├── Task 10: Dashboard "Connect an app" page
└── Task 11: Docker image rebuild + end-to-end wiring verification

Wave Final:
├── Task 12: Live E2E — real worker task reads Notion page via shell tool
└── Task 13: Telegram completion notification
F1: Plan Compliance Audit (oracle)
F2: Code Quality + Local CI Green (unspecified-high)
F3: Hands-on QA (unspecified-high)
F4: Scope Fidelity (deep)
F5: Docs Freshness (writing)
```

### Dependency Matrix

- **1**: deps none — hard gate, blocks everything
- **2**: deps 1 — blocks Wave 2
- **3-8**: deps 2 — max parallel
- **9**: deps 3, 4 — blocks 11
- **10**: deps 9 — blocks 11
- **11**: deps 5, 6, 7, 8, 9, 10 — blocks 12
- **12**: deps 11 — blocks FINAL
- **13**: deps 12

---

## TODOs

- [ ] 1. **Verify `@composio/core` `link()` → OAuth URL + Execute API → reads Notion page (HARD GATE)**

  **What to do**: Write `scripts/spike-composio-api.ts` (throwaway, delete after):
  1. Install `@composio/core` at exact latest stable version (check npm, pin no `^`): `pnpm add @composio/core@X.Y.Z`
  2. Using the SDK, call `composio.create('tenant_spike-test')` to get a session
  3. Call `session.link({ toolkit: 'notion', authConfigId: 'ac_Gsqb4UMAQUkD' })` → print the OAuth URL
  4. Human opens URL, completes Notion OAuth
  5. After OAuth, make a direct REST call to the Composio Execute API to read the Notion test page:
     - `POST https://backend.composio.dev/api/v1/actions/NOTION_RETRIEVE_A_PAGE/execute`
     - Headers: `x-api-key: <COMPOSIO_API_KEY>`
     - Body: `{ "userId": "tenant_spike-test", "input": { "page_id": "376d55e97d98808588ffe476de1704d6" } }`
  6. Assert the response contains the known text: `"Two diagrams below. The first shows where everything lives. The second shows what happens when a quote is requested."`
  7. Capture full output to `.sisyphus/evidence/composio/task-1-spike.txt`
  - **VERDICT**: If OAuth URL returned AND Notion page text retrieved → PASS. If either fails → STOP, document exact error, surface to user. Do NOT proceed to Task 2 if FAIL.

  **Must NOT do**: Do NOT use `initiate()`. Do NOT use this for production code — spike only. Do NOT commit the spike script (delete after).

  **Recommended Agent Profile**: Category `deep` — unverified API, highest risk. Skills: [`adding-shell-tools`].

  **Parallelization**: Can Run In Parallel: NO (Wave 1 gate). Blocks: EVERYTHING. Blocked By: None.

  **References**:
  - Composio docs: `docs.composio.dev/reference/sdk-reference/typescript`
  - Composio Execute API: `docs.composio.dev/docs/how-composio-works`
  - `.env` — `COMPOSIO_API_KEY`
  - Notion auth config ID: `ac_Gsqb4UMAQUkD`
  - Notion test page ID: `376d55e97d98808588ffe476de1704d6`
  - Known text: `"Two diagrams below. The first shows where everything lives. The second shows what happens when a quote is requested."`

  **Acceptance Criteria**:
  - [ ] `@composio/core` version pinned (exact, no `^`) in `package.json`
  - [ ] `link()` returns a valid Notion OAuth URL
  - [ ] Execute API call returns JSON containing the known page text
  - [ ] Output in `.sisyphus/evidence/composio/task-1-spike.txt`
  - [ ] VERDICT: PASS documented

  **Commit**: YES (just `package.json` + lockfile for SDK install). Message: `chore: install @composio/core SDK (gateway only)`. Delete spike script — do NOT commit it.

- [ ] 2. **Cross-tenant isolation proof via Execute API**

  **What to do**: Using the Notion connection established in Task 1, write a second spike (throwaway):
  1. Make Execute API call with `userId: "tenant_spike-test"` (connected to Notion) → should succeed
  2. Make Execute API call with `userId: "tenant_OTHER-TENANT"` (NOT connected) → should return an error/empty
  3. Assert the second call does NOT return the page content
  4. Capture output to `.sisyphus/evidence/composio/task-2-isolation.txt`
  - **VERDICT**: If isolation holds → PASS, Wave 2 may proceed. If not → STOP.

  **Must NOT do**: Do NOT use real tenant IDs from production DB. Use test IDs only. Delete spike after.

  **Recommended Agent Profile**: Category `deep` — security isolation. Skills: [`security`].

  **Parallelization**: Can Run In Parallel: NO (after Task 1). Blocks: Wave 2. Blocked By: 1.

  **References**:
  - Task 1 spike output (Execute API pattern confirmed)
  - `.sisyphus/evidence/composio/task-1-spike.txt`

  **Acceptance Criteria**:
  - [ ] `tenant_spike-test` Execute call returns Notion page content
  - [ ] `tenant_OTHER-TENANT` Execute call returns error/empty (no content)
  - [ ] Isolation proof in `.sisyphus/evidence/composio/task-2-isolation.txt`
  - [ ] VERDICT: PASS documented

  **Commit**: NO (spike only, delete after).

- [ ] 3. **`composio_connections` + `task_composio_calls` Prisma tables + migration**

  **What to do**:
  - Add to `prisma/schema.prisma`:

    ```prisma
    model ComposioConnection {
      id              String    @id @default(uuid())
      tenant_id       String
      toolkit         String
      status          String    @default("active")
      connected_at    DateTime  @default(now())
      disconnected_at DateTime?
      deleted_at      DateTime?
      created_at      DateTime  @default(now())
      updated_at      DateTime  @updatedAt

      @@unique([tenant_id, toolkit])
      @@index([tenant_id])
    }

    model TaskComposioCall {
      id        String   @id @default(uuid())
      task_id   String
      tenant_id String
      toolkit   String
      tool_name String
      called_at DateTime @default(now())

      @@index([task_id])
      @@index([tenant_id])
    }
    ```

  - Run `pnpm prisma migrate dev --name add_composio_connections`
  - Verify migration applies cleanly + `pnpm build` exits 0

  **Must NOT do**: Do NOT modify `tenant_integrations`. Soft-delete only (`deleted_at`).

  **Recommended Agent Profile**: Category `deep`. Skills: [`prisma`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES (Wave 2, with 4-8). Blocks: 4, 9. Blocked By: 2.

  **References**:
  - `prisma/schema.prisma` — existing model patterns (`@@index`, `@@unique`, `deleted_at`)
  - AGENTS.md "Soft deletes only" rule

  **Acceptance Criteria**:
  - [ ] Both models in schema with correct indexes + unique constraints
  - [ ] Migration applies cleanly: `pnpm prisma migrate deploy` exits 0
  - [ ] `pnpm build` exits 0 (Prisma client regenerated)

  **Commit**: YES. Message: `feat: add composio_connections and task_composio_calls tables`.

- [ ] 4. **`ComposioConnectionRepository`**

  **What to do**: Create `src/repositories/composio-connection-repository.ts`:
  - `getActiveConnections(tenantId: string): Promise<ComposioConnection[]>` — filters `deleted_at IS NULL` AND `status = 'active'`
  - `getConnection(tenantId: string, toolkit: string): Promise<ComposioConnection | null>`
  - `upsertConnection(tenantId: string, toolkit: string): Promise<ComposioConnection>` — creates or reactivates (sets `status = 'active'`, `disconnected_at = null`, `deleted_at = null`)
  - `disconnectConnection(tenantId: string, toolkit: string): Promise<void>` — sets `status = 'disconnected'`, `disconnected_at = now()`
  - `softDeleteConnection(tenantId: string, toolkit: string): Promise<void>` — sets `deleted_at = now()`
  - `recordToolCall(taskId: string, tenantId: string, toolkit: string, toolName: string): Promise<void>` — inserts `TaskComposioCall` row
  - Follow pattern from `src/repositories/tenant-secret-repository.ts`

  **Must NOT do**: Do NOT use raw `process.env`. Do NOT use in routes directly — route calls service, service calls repo.

  **Recommended Agent Profile**: Category `unspecified-high`. Skills: [`prisma`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES (Wave 2). Blocks: 7, 9. Blocked By: 3.

  **References**:
  - `src/repositories/tenant-secret-repository.ts` — pattern to follow
  - `src/repositories/` — existing repo structure

  **Acceptance Criteria**:
  - [ ] All 6 methods implemented with correct soft-delete + status filtering
  - [ ] Unit tests for `getActiveConnections`, `upsertConnection`, `disconnectConnection`
  - [ ] `pnpm test:unit` passes
  - [ ] LSP diagnostics clean

  **Commit**: YES. Message: `feat: add ComposioConnectionRepository`.

- [ ] 5. **`composio/execute.ts` shell tool (wraps Composio Execute API)**

  **What to do**: Create `src/worker-tools/composio/execute.ts`. This is a standard shell tool following the `adding-shell-tools` skill pattern:

  **CLI interface**:

  ```
  node execute.ts --toolkit <name> --action <ACTION_NAME> --params <json> [--tenant-id <id>]
  --help          Show usage
  --toolkit       Composio toolkit name (e.g. "notion", "linear")
  --action        Action name (e.g. "NOTION_RETRIEVE_A_PAGE")
  --params        JSON string of action input params
  --tenant-id     Tenant ID (defaults to TASK_TENANT_ID env var)
  ```

  **Implementation**:
  1. Parse args with `yargs` (follow existing tool pattern)
  2. Wrap every free-text arg with `unescapeShellArg` (AGENTS.md mandate)
  3. Read `COMPOSIO_API_KEY` via `requireEnv('COMPOSIO_API_KEY')`
  4. Read tenant ID: `--tenant-id` arg OR `requireEnv('TASK_TENANT_ID')` fallback
  5. Check `COMPOSIO_DENIED_TOOLKITS` — if toolkit is denied, exit non-zero with clear message
  6. Check call count: read `COMPOSIO_CALL_COUNT` env var (set by harness or default 0); if >= 50, log warning (do NOT exit — soft cap)
  7. Make HTTP call to Composio Execute API:
     ```
     POST https://backend.composio.dev/api/v1/actions/{ACTION_NAME}/execute
     Headers: { "x-api-key": COMPOSIO_API_KEY, "Content-Type": "application/json" }
     Body: { "userId": "tenant_${tenantId}", "input": <parsed params> }
     ```
  8. Print JSON result to stdout
  9. On HTTP error: print `{ "error": "<message>", "status": <code> }` and exit non-zero
  10. Support `--mock` flag with fixture file at `src/worker-tools/composio/__fixtures__/execute.json`

  **Must NOT do**: Do NOT import `@composio/core` — raw HTTP only. Do NOT print `COMPOSIO_API_KEY`. Do NOT hard-stop on soft cap.

  **Recommended Agent Profile**: Category `unspecified-high`. Skills: [`adding-shell-tools`, `security`].

  **Parallelization**: Can Run In Parallel: YES (Wave 2). Blocks: 11. Blocked By: 2.

  **References**:
  - **MUST LOAD**: `adding-shell-tools` skill — file structure, CLI pattern, mock fixture, Docker integration
  - `src/worker-tools/lib/unescape-args.ts` — `unescapeShellArg` (wrap all free-text args)
  - `src/worker-tools/slack/post-message.ts` — existing tool to mirror structure
  - Task 1 evidence — confirms exact Execute API endpoint + request shape
  - `.sisyphus/evidence/composio/task-1-spike.txt` — exact API format

  **Acceptance Criteria**:
  - [ ] `--help` prints usage
  - [ ] `--mock` returns fixture JSON without making HTTP call
  - [ ] Denied toolkit exits non-zero with clear error
  - [ ] Happy path returns JSON from Composio API
  - [ ] Error path prints error JSON + exits non-zero
  - [ ] Unit test: denied toolkit check
  - [ ] Unit test: mock mode returns fixture
  - [ ] `pnpm build` exits 0

  **Commit**: YES. Message: `feat: add composio/execute.ts shell tool`.

- [ ] 6. **`COMPOSIO_API_KEY` + `TASK_TENANT_ID` in worker env whitelist**

  **What to do**:
  - In `src/repositories/tenant-env-loader.ts`, add `'COMPOSIO_API_KEY'` to `PLATFORM_ENV_WHITELIST`
  - Verify `TASK_TENANT_ID` (or however the tenant ID is passed to the worker) is already available in the worker env — check `src/inngest/lifecycle/lib/machine-provisioner.ts` for what gets passed to the container. If not present, add it.
  - Add `COMPOSIO_API_KEY` to `.env.example` under a new `# Composio` section with description: `# Composio API key for 1000+ app integrations (gateway OAuth + worker shell tool)`
  - Update AGENTS.md environment variables section

  **Must NOT do**: Do NOT hardcode the key. Do NOT add to Docker build args.

  **Recommended Agent Profile**: Category `quick`. Skills: [`security`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES (Wave 2). Blocks: 11. Blocked By: 2.

  **References**:
  - `src/repositories/tenant-env-loader.ts` — `PLATFORM_ENV_WHITELIST` array
  - `src/inngest/lifecycle/lib/machine-provisioner.ts` — env assembly (check what TASK\_\* vars are passed)
  - `.env.example` — section ordering convention

  **Acceptance Criteria**:
  - [ ] `COMPOSIO_API_KEY` in `PLATFORM_ENV_WHITELIST`
  - [ ] `TASK_TENANT_ID` confirmed available in worker env (or added)
  - [ ] `.env.example` updated with Composio section
  - [ ] `pnpm build` exits 0

  **Commit**: YES. Message: `feat: add COMPOSIO_API_KEY to platform env whitelist`.

- [ ] 7. **Gateway connect route + OAuth callback (`link()`)**

  **What to do**: Create `src/gateway/routes/composio-oauth.ts` mirroring `src/gateway/routes/notion-oauth.ts`:
  - `GET /admin/tenants/:tenantId/composio/connect?toolkit=notion`
    - Auth: `requireTenantRole(TenantRole.ADMIN)`
    - Validate `toolkit` not in `COMPOSIO_DENIED_TOOLKITS` → 400 if denied
    - Call `composio.create('tenant_${tenantId}')` → `session.link({ toolkit, authConfigId: 'ac_Gsqb4UMAQUkD' })` → return OAuth URL
    - Return: `sendSuccess(res, 200, { url: oauthUrl })`
  - `GET /admin/tenants/:tenantId/composio/callback?toolkit=notion`
    - No auth (OAuth callback)
    - Call `ComposioConnectionRepository.upsertConnection(tenantId, toolkit)`
    - Redirect to dashboard connections page
  - Register both routes in `src/gateway/server.ts`

  **Must NOT do**: Do NOT use `initiate()`. Do NOT skip auth on connect endpoint. Do NOT echo `COMPOSIO_API_KEY`.

  **Recommended Agent Profile**: Category `unspecified-high`. Skills: [`api-design`, `security`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES (Wave 2). Blocks: 9, 11. Blocked By: 2, 4.

  **References**:
  - `src/gateway/routes/notion-oauth.ts` — pattern to mirror exactly
  - `src/gateway/middleware/authz.ts` — `requireTenantRole`
  - `src/gateway/lib/http-response.ts` — `sendError`/`sendSuccess`
  - `src/gateway/server.ts` — route registration

  **Acceptance Criteria**:
  - [ ] `GET .../composio/connect?toolkit=notion` returns `{ url: "https://..." }`
  - [ ] Denied toolkit returns 400
  - [ ] Callback upserts `ComposioConnection` row
  - [ ] Integration test: connect endpoint returns URL shape
  - [ ] LSP diagnostics clean

  **Commit**: YES. Message: `feat: add Composio OAuth connect/callback routes`.

- [ ] 8. **AGENTS.md compiler injection (available toolkits + usage instructions)**

  **What to do**:
  - In `src/workers/lib/agents-md-compiler.mts`, after loading the archetype:
    1. Query `composio_connections` for the tenant (via PostgREST — worker uses PostgREST, not Prisma): `GET /composio_connections?tenant_id=eq.{tenantId}&status=eq.active&deleted_at=is.null`
    2. If connections exist, inject a section into the compiled AGENTS.md:

       ````markdown
       ## Connected Apps (via Composio)

       You have access to the following connected apps: {toolkit list}.

       To use them, call the shell tool:

       ```bash
       node /tools/composio/execute.ts \
         --toolkit <toolkit-name> \
         --action <ACTION_NAME> \
         --params '<json-params>'
       ```
       ````

       Available toolkits: {comma-separated list of toolkit names}
       The tool returns JSON. On error it exits non-zero with `{ "error": "..." }`.

       ```

       ```

    3. If no connections: do NOT inject this section

  - The section should be injected AFTER `## Shell Tools` and BEFORE any employee-specific instructions

  **Must NOT do**: Do NOT list specific actions in the AGENTS.md (too verbose — let the AI ask the Composio API for action discovery if needed). Do NOT inject if no connections.

  **Recommended Agent Profile**: Category `unspecified-high`. Skills: [`inngest`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES (Wave 2). Blocks: 11. Blocked By: 2.

  **References**:
  - `src/workers/lib/agents-md-compiler.mts` — how sections are assembled
  - `src/workers/lib/postgrest-client.ts` — PostgREST client for DB reads in worker context
  - AGENTS.md "AI employee injection — exactly two things" and "Worker containers communicate with Supabase via PostgREST"

  **Acceptance Criteria**:
  - [ ] When connections exist, compiled AGENTS.md includes Connected Apps section with correct toolkit list
  - [ ] When no connections: section absent
  - [ ] Unit test: compiler includes/excludes section based on connection count
  - [ ] `pnpm build` exits 0

  **Commit**: YES. Message: `feat: inject Composio connected apps section into compiled AGENTS.md`.

- [ ] 9. **Admin API — list/connect/disconnect + usage endpoint**

  **What to do**: Add to `src/gateway/routes/composio-oauth.ts` (or a new `src/gateway/routes/composio-admin.ts`):
  - `GET /admin/tenants/:tenantId/composio/connections` — list active connections: `[{ toolkit, status, connected_at }]`
    - Auth: `requireTenantRole(TenantRole.MEMBER)`
  - `DELETE /admin/tenants/:tenantId/composio/connections/:toolkit` — soft-delete via `softDeleteConnection()`
    - Auth: `requireTenantRole(TenantRole.ADMIN)`
  - `GET /admin/tenants/:tenantId/composio/usage` — tool call counts from `task_composio_calls` grouped by `(toolkit, date)`:
    - Auth: `requireTenantRole(TenantRole.MEMBER)`
  - Register routes in `src/gateway/server.ts`
  - Use `sendError`/`sendSuccess` throughout

  **Must NOT do**: Do NOT hard-delete. Do NOT expose Composio internal session IDs. Do NOT return `deleted_at` connections in the list.

  **Recommended Agent Profile**: Category `unspecified-high`. Skills: [`api-design`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: NO (after 3, 4). Blocks: 10, 11. Blocked By: 3, 4.

  **References**:
  - `src/repositories/composio-connection-repository.ts` — all methods available
  - `src/gateway/lib/http-response.ts` — `sendError`/`sendSuccess`
  - AGENTS.md "Soft deletes only" rule

  **Acceptance Criteria**:
  - [ ] `GET .../composio/connections` returns active connections array
  - [ ] `DELETE .../composio/connections/notion` soft-deletes (no longer in list)
  - [ ] `GET .../composio/usage` returns grouped call counts
  - [ ] Integration tests for all three endpoints
  - [ ] LSP diagnostics clean

  **Commit**: YES. Message: `feat: add Composio admin API (list/disconnect/usage)`.

- [ ] 10. **Dashboard "Connect an app" page**

  **What to do**: Create `dashboard/src/pages/ComposioConnections.tsx` (or similar path following existing page pattern):
  - **Connected apps list**: card shell, shows each connection (toolkit icon/name, status, connected date, "Disconnect" button)
  - **"Connect an app" button**: opens a modal with:
    - `SearchableSelect` for toolkit (hardcoded list for now: `[{ value: 'notion', label: 'Notion' }]`)
    - "Connect" button → calls `GET /admin/tenants/:tenantId/composio/connect?toolkit=<toolkit>` → opens returned URL in new tab
  - **After OAuth callback**: page auto-refreshes connections list (or user clicks refresh)
  - **Disconnect button**: calls `DELETE /admin/tenants/:tenantId/composio/connections/:toolkit` → removes from list
  - Add route to dashboard router under settings or integrations nav
  - Non-technical copy: "Connect an app" not "Configure Composio toolkit"; "Connected" not "active"

  **Must NOT do**: Do NOT use raw `<select>` — `SearchableSelect` mandatory. Do NOT use jargon. Do NOT show Composio session IDs or `tenant_${tenantId}` strings.

  **Recommended Agent Profile**: Category `visual-engineering`. Skills: [`react-dashboard`, `web-design-guidelines`, `vercel-react-best-practices`].

  **Parallelization**: Can Run In Parallel: NO (after 9). Blocks: 11. Blocked By: 9.

  **References**:
  - `dashboard/src/components/ui/searchable-select.tsx` — mandatory for dropdowns
  - `dashboard/src/` — existing page patterns + router config
  - AGENTS.md "Searchable dropdowns", "Dashboard UI sections use cards", "URL-encoded state", "End-user language is non-technical"

  **Acceptance Criteria**:
  - [ ] Connections list renders with card shells
  - [ ] `SearchableSelect` for toolkit dropdown
  - [ ] Connect flow calls API + opens OAuth URL
  - [ ] Disconnect button calls DELETE endpoint + updates list
  - [ ] Non-technical copy throughout
  - [ ] `pnpm test:dashboard` passes

  **Commit**: YES. Message: `feat: add Composio "Connect an app" dashboard page`.

- [ ] 11. **Docker image rebuild + end-to-end wiring verification**

  **What to do**:
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Verify `/tools/composio/execute.ts` is present in the image: `docker run --rm ai-employee-worker:latest ls /tools/composio/`
  - Verify `COMPOSIO_API_KEY` flows into worker container: `docker run --rm -e COMPOSIO_API_KEY=test ai-employee-worker:latest node /tools/composio/execute.ts --help`
  - Run the shell tool in `--mock` mode inside the container to confirm the fixture works
  - Run `pnpm test:unit` and `pnpm test:integration` → 0 failed
  - Verify `pnpm build` exits 0 and LSP diagnostics clean

  **Must NOT do**: Do NOT run with real `COMPOSIO_API_KEY` in verification — use `--mock` only. Do NOT skip the Docker build.

  **Recommended Agent Profile**: Category `unspecified-high`. Skills: [`long-running-commands`, `feature-verification`].

  **Parallelization**: Can Run In Parallel: NO (after all Wave 2 + tasks 9, 10). Blocks: 12. Blocked By: 5, 6, 7, 8, 9, 10.

  **References**:
  - AGENTS.md "CRITICAL — Rebuild after every worker change"
  - `src/worker-tools/composio/execute.ts` — the tool to verify
  - `src/workers/lib/agents-md-compiler.mts` — compiler changes

  **Acceptance Criteria**:
  - [ ] `docker build` exits 0
  - [ ] `/tools/composio/execute.ts` present in image
  - [ ] `--mock` mode works inside container
  - [ ] `pnpm test:unit` → 0 failed
  - [ ] `pnpm test:integration` → 0 failed
  - [ ] LSP diagnostics clean

  **Commit**: NO (Docker build is not committed).

- [ ] 12. **Live E2E — real worker task reads Notion page via shell tool**

  **What to do**:
  - Ensure the Notion connection established in Task 1 spike is active for the test tenant
  - If the spike used a test tenant ID, upsert a `composio_connections` row for the real test tenant: toolkit `notion`, `tenant_id = <test-tenant-id>`
  - Trigger a real AI employee task (use the recommended smoke-test employee or a simple test archetype) with the instruction: "Use the Composio shell tool to read the Notion page with ID `376d55e97d98808588ffe476de1704d6` and tell me what it says."
  - Verify:
    1. Task reaches `Executing` state
    2. Compiled AGENTS.md contains "Connected Apps" section with "notion"
    3. Worker calls `node /tools/composio/execute.ts --toolkit notion --action NOTION_RETRIEVE_A_PAGE ...`
    4. Response JSON contains: `"Two diagrams below. The first shows where everything lives. The second shows what happens when a quote is requested."`
    5. `task_composio_calls` has at least 1 row for this task
    6. Task reaches `Done` state
  - Capture: task ID, `task_status_log` trace, `task_composio_calls` rows, shell tool output snippet
  - Record all evidence to `.sisyphus/evidence/composio/task-12-live-e2e.txt`

  **Must NOT do**: Do NOT fabricate results. Do NOT accept "from code" as proof — live task must run and reach `Done`.

  **Recommended Agent Profile**: Category `unspecified-high`. Skills: [`e2e-testing`, `feature-verification`, `debugging-lifecycle`].

  **Parallelization**: Can Run In Parallel: NO (final, after 11). Blocks: FINAL. Blocked By: 11.

  **References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`
  - `docs/employees/` — smoke-test employee docs
  - Notion test page ID: `376d55e97d98808588ffe476de1704d6`
  - Known text: `"Two diagrams below. The first shows where everything lives. The second shows what happens when a quote is requested."`
  - `pnpm trigger-task` — trigger command

  **Acceptance Criteria**:
  - [ ] Task reaches `Done` state
  - [ ] Compiled AGENTS.md for task contains "Connected Apps" section
  - [ ] `task_composio_calls` has ≥ 1 row for this task + tenant
  - [ ] Known Notion page text appears in task output or shell tool response
  - [ ] Evidence in `.sisyphus/evidence/composio/task-12-live-e2e.txt`

  **Commit**: NO (evidence only).

- [ ] 13. **Notify completion** — `tsx scripts/telegram-notify.ts "✅ composio-integration complete — All tasks done. Come back to review results."`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 5 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Verify "Must Have": Wave 1 gates passed; SDK gateway-only; `link()` used; denylist enforced in shell tool; per-tenant isolation; metering works; live E2E succeeded.
      Verify "Must NOT Have": no `@composio/core` in worker image; no MCP injection; no existing tools touched; no `initiate()`; no per-user connections; no other toolkits; no hardcoded keys.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality + Local CI Green** — `unspecified-high`
      Run `pnpm build`, `pnpm test:unit`, `pnpm test:integration`, `pnpm lint` → all 0-fail. LSP diagnostics clean. No `as any` in new code. Repository + shell tool patterns followed. `unescapeShellArg` used in shell tool.
      Output: `Build | Unit [N/N] | Integration [N/N] | Lint | LSP | VERDICT`

- [ ] F3. **Hands-on QA** — `unspecified-high`
      Exercise the full flow: connect Notion via dashboard → connection appears in list → trigger task → shell tool called in logs → `task_composio_calls` row written → Notion content in output → disconnect via dashboard → verify graceful degradation (task runs without Composio section).
      Output: `Connect ✅ | List ✅ | Task shell tool ✅ | Audit ✅ | Disconnect ✅ | Degradation ✅ | VERDICT`

- [ ] F4. **Scope Fidelity** — `deep`
      `git diff --name-only origin/main` — confirm only in-scope files. No existing integration files modified. No `@composio/core` in worker Dockerfile or worker code. No `initiate()`. No per-user logic. No toolkits beyond Notion in any seeded/hardcoded list.
      Output: `Files [N/N in scope] | Protected intact | No forbidden patterns | VERDICT`

- [ ] F5. **Docs Freshness** — `writing`
      AGENTS.md updated: `composio_connections` table; `task_composio_calls` table; new admin API endpoints; `COMPOSIO_API_KEY` env var; `COMPOSIO_DENIED_TOOLKITS` constant; shell tool at `/tools/composio/`. README: new admin API endpoints. No stale "Composio not integrated" claims.
      Output: `AGENTS.md ✅ | README ✅ | No stale claims ✅ | VERDICT`

---

## Commit Strategy

- Task 1: `chore: install @composio/core SDK (gateway only)`
- Task 3: `feat: add composio_connections and task_composio_calls tables`
- Task 4: `feat: add ComposioConnectionRepository`
- Task 5: `feat: add composio/execute.ts shell tool wrapping Composio Execute API`
- Task 6: `feat: add COMPOSIO_API_KEY to platform env whitelist`
- Task 7: `feat: add Composio OAuth connect/callback routes`
- Task 8: `feat: inject Composio connected apps section into compiled AGENTS.md`
- Task 9: `feat: add Composio admin API (list/disconnect/usage)`
- Task 10: `feat: add Composio "Connect an app" dashboard page`

## Success Criteria

```bash
pnpm build && pnpm lint                                           # exit 0
pnpm test:unit && pnpm test:integration                          # 0 failed
curl -s http://localhost:7700/admin/tenants/$TENANT_ID/composio/connections \
  -H "Authorization: Bearer $SERVICE_TOKEN"                      # returns [] or [{toolkit,...}]
docker run --rm ai-employee-worker:latest \
  node /tools/composio/execute.ts --help                         # prints usage
```

## Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Wave 1 spike evidence in `.sisyphus/evidence/composio/`
- [ ] Live E2E proved Notion read via shell tool
- [ ] Notify completion (Telegram)
