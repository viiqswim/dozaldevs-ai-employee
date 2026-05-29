# Cleaning Schedule Employee — Notion OAuth Integration + Shell Tools + Archetype

## TL;DR

> **Quick Summary**: Build full Notion OAuth 2.0 integration (following the Jira pattern), Notion shell tools (`get-page.ts`, `append-blocks.ts`, `update-block.ts`), a "Connect Notion" dashboard button, and a cleaning schedule AI employee that chains Hostfully → Notion → scheduling logic → Slack delivery.
>
> **Deliverables**:
>
> - Notion OAuth flow: `src/gateway/routes/notion-oauth.ts` (install + callback), `src/lib/notion-types.ts` (constants)
> - Notion shell tools: `src/worker-tools/notion/` — `get-page.ts`, `append-blocks.ts`, `update-block.ts`, `auth.ts` (dual-mode: OAuth + API key fallback), `validate-env.ts`, mock fixtures
> - Dashboard: "Connect Notion" button in tenant integrations tab
> - Employee archetype (`cleaning-schedule`) seeded for VLRE tenant
> - `@notionhq/client` added to worker-tools dependencies
> - `NOTION_MOCK` added to platform env whitelist
> - `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_BASE_URL` added to `.env.example`
> - Notion secrets stored via OAuth: `notion_access_token`, `notion_refresh_token`, `notion_workspace_id`, `notion_workspace_name`
> - Unit tests for Notion tools
> - AGENTS.md + tool-usage-reference skill updated
> - Docker image rebuilt with Notion tools
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 7 → Task 11 → Task 13 → F1-F4

---

## Context

### Original Request

User wants a daily cleaning schedule AI employee for the VLRE tenant (`00000000-0000-0000-0000-000000000003`). The employee should:

1. Go to Hostfully and get checkouts for a user-specified date
2. Read cleaner info from TWO Notion pages (name, location, availability, capacity)
3. Create a cleaning schedule matching cleaners to properties
4. Post the schedule to Slack

### Interview Summary

**Key Discussions**:

- **Notion integration**: Does not exist — must be built from scratch
- **Notion auth**: Full OAuth 2.0 following Jira pattern — dual-mode (OAuth preferred, API key fallback). "Connect Notion" button in dashboard.
- **Trigger type**: Manual only (no cron) — user provides the target date when triggering
- **Notion data**: TWO pages, both in Spanish:
  - **Page 1** (`36fd540b4380809ca373ca83e90216a3`): Trash/recycling schedule organized by day of week, listing property codes per day
  - **Page 2** (`36fd540b438080b2be9cf4b4218d657b`): Cleaning zones with teams (cleaners + availability) and properties (addresses, service times, costs, lock codes)
- **Notion page IDs**: Both hardcoded in the archetype's `execution_steps`
- **Property matching**: Hostfully Internal Property Names (e.g., `271-GIN-HOME`) matched to Notion codes (e.g., `271-GIN`) by code prefix
- **Cleaner assignment**: Dynamic zone-based matching — match cleaners to properties by zone/location, considering day availability. NOT pre-assigned.
- **Trash duties**: INCLUDED in the schedule output
- **Service time + cost**: INCLUDED in the schedule output
- **Unassigned properties**: Flagged with ⚠️ UNASSIGNED in the schedule
- **Slack channel**: `C0B71QSMZKQ` (ops-cleaning-schedule)
- **Notion write tools**: Build read AND write tools. Write tools used during development for restructuring Notion pages. Employee itself only reads in production.
- **Tests**: After implementation (not TDD)

**Research Findings**:

- `get-reservations.ts` filters by **check-in date only** (`--from`/`--to`) — checkout filtering must be done client-side by the LLM
- `get-reservations.ts` requires `--property-id` — must loop per property (no cross-property query)
- `get-property.ts` returns full address + `checkOutTime` — needed for complete schedule info
- Hostfully properties have Internal Property Names containing codes like `271-GIN-HOME` that match Notion codes like `271-GIN`
- Wizard auto-discovers tools via `tool-parser.ts` scanning `src/worker-tools/` at runtime
- Jira OAuth flow is the exact template: `src/gateway/routes/jira-oauth.ts` (install + callback), `src/lib/jira-types.ts` (constants), HMAC-signed state for CSRF
- Slack OAuth follows identical pattern: `src/gateway/routes/slack-oauth.ts`
- `loadTenantEnv()` auto-injects all tenant secrets as uppercased env vars — ZERO changes needed for new providers
- `tenant_integrations` table uses free-form `provider` string — no migration needed
- Dashboard `IntegrationRow` component handles connect buttons — ~5-line addition
- Cloudflare tunnel `https://local-ai-employee.dozaldevs.com` required for OAuth redirect URI (HTTPS)
- `@notionhq/client` is not in `src/worker-tools/package.json` — must be added
- All Notion content is in Spanish — execution_steps must instruct the LLM to parse Spanish

### Metis Review

**Identified Gaps** (addressed):

- **🔴 Notion tokens DO expire**: `refresh_token` is always returned. Must store `notion_refresh_token`. Original plan incorrectly assumed tokens don't expire.
- **Notion page picker UX**: During OAuth, user manually selects which pages to share. Need setup docs warning PM to select both cleaning pages.
- **`owner` parameter**: Auth URL requires `owner=user` (not `workspace` — PM may not be workspace admin)
- **`Notion-Version` header**: `2022-06-28` required on every API call — constant in `notion-types.ts`
- **Token exchange format**: Notion uses HTTP Basic auth (`Authorization: Basic base64(clientId:clientSecret)`), NOT JSON body like Jira
- **Conflict detection**: Check `integrationRepo.findByExternalId('notion', workspaceId)` before storing — prevent workspace double-attach
- **Missing env var warning**: `server.ts` should warn if `NOTION_CLIENT_ID` is unset (follow existing Jira pattern)
- **Edge case — Notion not connected**: `auth.ts` must give helpful error: "Connect Notion via dashboard or set API key manually"
- **Pre-OAuth testing path**: Keep seeded `notion_access_token` for local development before OAuth is wired up
- **Notion Developer Portal prerequisite**: Redirect URI must be registered before OAuth can be tested

---

## Work Objectives

### Core Objective

Build full Notion OAuth integration, Notion shell tools, and a cleaning schedule AI employee that chains Hostfully → Notion → scheduling logic → Slack delivery.

### Concrete Deliverables

- `src/gateway/routes/notion-oauth.ts` — OAuth install + callback routes (copy Jira pattern)
- `src/lib/notion-types.ts` — OAuth constants, API version, scopes
- `src/worker-tools/notion/get-page.ts` — fetches Notion page content with recursive block handling
- `src/worker-tools/notion/append-blocks.ts` — appends new blocks to a Notion page
- `src/worker-tools/notion/update-block.ts` — updates an existing block's content
- `src/worker-tools/notion/auth.ts` — dual-mode: OAuth (`NOTION_ACCESS_TOKEN`) preferred, API key (`NOTION_API_KEY`) fallback
- `src/worker-tools/notion/validate-env.ts` — diagnostic tool for env var validation
- `src/worker-tools/notion/fixtures/get-page/` — mock fixtures for trash schedule and cleaning zones (Spanish)
- `@notionhq/client` added to `src/worker-tools/package.json`
- `NOTION_MOCK` added to `PLATFORM_ENV_WHITELIST`
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_BASE_URL` added to `.env.example`
- Dashboard "Connect Notion" `IntegrationRow` in tenant integrations tab
- Employee archetype (`cleaning-schedule`) seeded for VLRE tenant with `input_schema`, `tool_registry`, `execution_steps`
- `notion_access_token` pre-seeded as tenant secret for pre-OAuth development
- Unit tests for Notion tools
- AGENTS.md + tool-usage-reference skill + employee docs updated
- Docker image rebuilt

### Definition of Done

- [ ] OAuth flow: `GET /integrations/notion/install?tenant=vlre` redirects to Notion auth URL
- [ ] OAuth callback stores 4 secrets: `notion_access_token`, `notion_refresh_token`, `notion_workspace_id`, `notion_workspace_name`
- [ ] Dashboard shows "Connect Notion" button; after OAuth, shows "✓ Connected"
- [ ] `bun src/worker-tools/notion/get-page.ts --page-id <ID>` returns page content (with `NOTION_ACCESS_TOKEN` set)
- [ ] `NOTION_MOCK=true bun src/worker-tools/notion/get-page.ts --page-id fake` returns mock fixture data
- [ ] Employee can be triggered: `POST /admin/tenants/.../employees/cleaning-schedule/trigger` with `{"inputs":{"date":"2026-06-01"}}` returns 202
- [ ] Task reaches `Done` status within 5 minutes
- [ ] Slack message appears in `C0B71QSMZKQ` with the cleaning schedule
- [ ] `pnpm test -- --run` passes with 0 new failures

### Must Have

- Notion OAuth routes (`/integrations/notion/install`, `/integrations/notion/callback`) following Jira pattern exactly
- HMAC-signed state parameter for CSRF protection (reuse `signState`/`verifyState` from Jira)
- Conflict detection: prevent one Notion workspace attached to multiple tenants
- Token exchange using HTTP Basic auth (`Authorization: Basic base64(clientId:clientSecret)`) — NOT JSON body
- `notion_refresh_token` stored (tokens DO expire)
- `owner=user` in auth URL (not `workspace`)
- `Notion-Version: 2022-06-28` header constant in `notion-types.ts` and used in every API call
- Dual-mode auth in `auth.ts`: OAuth (`NOTION_ACCESS_TOKEN`) preferred, API key (`NOTION_API_KEY`) fallback
- Helpful error in `auth.ts` when neither OAuth nor API key configured
- "Connect Notion" `IntegrationRow` in dashboard integrations tab
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_BASE_URL` in `.env.example`
- `server.ts` startup warning when `NOTION_CLIENT_ID` is not set
- Notion `get-page.ts` with recursive block fetching (handles `has_children: true`, max 3 levels)
- Notion `append-blocks.ts` for adding blocks to a page
- Notion `update-block.ts` for modifying existing block content
- Mock fixture support (`NOTION_MOCK=true`) — TWO fixtures (trash + zones)
- `--help` flag on all tools
- Error handling: missing `--page-id`/`--block-id`, missing credentials, Notion 404
- `input_schema` with `date` as required `every_run` field
- `execution_steps` referencing BOTH Notion page IDs
- `execution_steps` that explicitly filter by checkout date client-side (NOT using `--from`/`--to`)
- `execution_steps` that match Hostfully property names to Notion codes by prefix
- `execution_steps` that handle zero checkouts (post "No checkouts" + `NO_ACTION_NEEDED`)
- Schedule posted to Slack channel `C0B71QSMZKQ`
- ⚠️ UNASSIGNED flag for properties with no available cleaner
- `submit-output.ts` in `tool_registry`
- Content in Spanish — execution_steps must instruct LLM to parse Spanish text
- Setup checklist in employee docs: "Select both Notion pages during OAuth page picker"

### Must NOT Have (Guardrails)

- ❌ Do NOT modify `get-reservations.ts` or any existing Hostfully tool
- ❌ Do NOT build `query-database.ts` or `search-pages.ts` — only `get-page.ts`, `append-blocks.ts`, `update-block.ts`
- ❌ Do NOT set `approval_required: true` — this is a report, not a guest-facing action
- ❌ Do NOT use `minimax/minimax-m2.7` for E2E testing — override to `deepseek/deepseek-v4-flash`
- ❌ Do NOT build Slack Block Kit tables or interactive buttons — plain mrkdwn text only
- ❌ Do NOT add cron trigger — manual trigger only
- ❌ Do NOT send per-cleaner DMs or multiple Slack messages — one message to one channel
- ❌ Do NOT use `text.content` on Notion rich text items — use `plain_text` field only
- ❌ Do NOT add employee-specific language to shared files (`employee-lifecycle.ts`, `opencode-harness.mts`, etc.)
- ❌ Do NOT use `btoa()` for token exchange — use `Buffer.from().toString('base64')` (Node.js compatibility)
- ❌ Do NOT log `NOTION_CLIENT_SECRET` or `notion_access_token` values — credential leak
- ❌ Do NOT use `===` for HMAC comparison — use `crypto.timingSafeEqual()`
- ❌ Do NOT use `owner=workspace` in Notion auth URL — PM may not be workspace admin, use `owner=user`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash (`bun`/`tsx`) — run tool CLI, assert exit code + JSON output
- **OAuth routes**: Use Bash (`curl`) — test redirects, callbacks, error cases
- **Dashboard UI**: Use Playwright — navigate, click, assert DOM
- **E2E lifecycle**: Use Bash (`psql` + `curl`) — trigger task, poll status, verify Slack

---

## Execution Strategy

### Prerequisites (Manual — before Wave 1)

> **The user must create a Notion OAuth app before any OAuth testing can proceed.**
>
> 1. Go to https://www.notion.so/my-integrations → "New integration"
> 2. Set type to "Public" (required for OAuth)
> 3. Add redirect URI: `https://local-ai-employee.dozaldevs.com/integrations/notion/callback`
> 4. Copy `Client ID` and `Client Secret` → add to `.env`
> 5. Share both Notion pages with the integration

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, 6 parallel):
├── Task 1: Add @notionhq/client + NOTION_MOCK whitelist [quick]
├── Task 2: Notion auth.ts (dual-mode OAuth+API key) + validate-env.ts [quick]
├── Task 3: Design mock fixtures (trash + zones pages) [quick]
├── Task 4: Create notion-types.ts (OAuth constants + API version) + .env.example [quick]
├── Task 5: Seed notion_access_token for pre-OAuth local testing [quick]
└── Task 6: Add NOTION_CLIENT_ID/SECRET/REDIRECT to .env.example [quick]

Wave 2 (After Wave 1 — core tools + OAuth + archetype, 4 parallel):
├── Task 7: Build get-page.ts with recursive block fetching [deep]
├── Task 8: Build write tools (append-blocks.ts + update-block.ts) [deep]
├── Task 9: Build notion-oauth.ts routes + register in server.ts [unspecified-high]
└── Task 10: Seed cleaning-schedule archetype in prisma/seed.ts [unspecified-high]

Wave 3 (After Wave 2 — tests + UI + docs + E2E, 4 parallel):
├── Task 11: Unit tests for Notion tools (read + write) [unspecified-high]
├── Task 12: Dashboard "Connect Notion" button + OAuth flow test [visual-engineering]
├── Task 13: Docker rebuild + E2E employee trigger test [unspecified-high]
└── Task 14: Update AGENTS.md + tool-usage-reference + employee docs [writing]

Wave 4 (After Wave 3 — notification):
└── Task 15: Notify completion [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 7 → Task 11 → Task 13 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task  | Depends On  | Blocks     | Wave  |
| ----- | ----------- | ---------- | ----- |
| 1     | —           | 2, 7, 8, 9 | 1     |
| 2     | 1           | 7, 8       | 1     |
| 3     | —           | 7, 8, 10   | 1     |
| 4     | —           | 9          | 1     |
| 5     | —           | 13         | 1     |
| 6     | —           | 9          | 1     |
| 7     | 1, 2, 3     | 11, 13     | 2     |
| 8     | 1, 2, 3     | 11, 13     | 2     |
| 9     | 1, 4, 6     | 12, 13     | 2     |
| 10    | 3           | 13         | 2     |
| 11    | 7, 8        | 13         | 3     |
| 12    | 9           | 13         | 3     |
| 13    | 7-12        | 15, F1-F4  | 3     |
| 14    | 7, 8, 9, 10 | F1         | 3     |
| 15    | 13          | —          | 4     |
| F1-F4 | 13, 14, 15  | —          | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 6 tasks — T1-T6 → `quick`
- **Wave 2**: 4 tasks — T7 → `deep`, T8 → `deep`, T9 → `unspecified-high`, T10 → `unspecified-high`
- **Wave 3**: 4 tasks — T11 → `unspecified-high`, T12 → `visual-engineering`, T13 → `unspecified-high`, T14 → `writing`
- **Wave 4**: 1 task — T15 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `@notionhq/client` dependency + `NOTION_MOCK` whitelist

  **What to do**:
  - Add `@notionhq/client` (latest stable, currently ~2.x) to `src/worker-tools/package.json` as a production dependency
  - Run `pnpm install` from `src/worker-tools/` to update the lockfile
  - In `src/gateway/services/tenant-env-loader.ts`, find the `PLATFORM_ENV_WHITELIST` array and add `'NOTION_MOCK'` — this allows mock mode to be injected into the worker container for local testing without real Notion credentials
  - Verify the whitelist addition by searching for similar entries like `HOSTFULLY_MOCK`, `JIRA_MOCK`, `SIFELY_MOCK`

  **Must NOT do**:
  - Do NOT add Notion to the main project `package.json` — only `src/worker-tools/package.json`
  - Do NOT add `NOTION_API_KEY` or `NOTION_ACCESS_TOKEN` to the whitelist — those are secrets, injected via `tenant_secrets`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small edits to existing files — dependency addition and array entry
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers dependency management and env var whitelisting for new tool services

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-6)
  - **Blocks**: Tasks 2, 7, 8, 9
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/package.json` — Existing dependency list; add `@notionhq/client` alongside `@slack/web-api`
  - `src/gateway/services/tenant-env-loader.ts` — Find `PLATFORM_ENV_WHITELIST` or equivalent array where `HOSTFULLY_MOCK`, `JIRA_MOCK`, etc. are listed; add `NOTION_MOCK` in the same pattern

  **External References**:
  - `@notionhq/client` npm page: https://www.npmjs.com/package/@notionhq/client

  **WHY Each Reference Matters**:
  - `package.json` — need to match existing dependency format (caret vs exact version)
  - `tenant-env-loader.ts` — must find the exact whitelist mechanism so `NOTION_MOCK=true` propagates into worker containers

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: @notionhq/client installed successfully
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `cat src/worker-tools/package.json | jq '.dependencies["@notionhq/client"]'`
      2. Assert output is a non-null version string (e.g., "^2.2.15")
      3. Run `ls src/worker-tools/node_modules/@notionhq/client/package.json`
      4. Assert file exists (exit code 0)
    Expected Result: Dependency installed and resolvable
    Evidence: .sisyphus/evidence/task-1-notion-client-installed.txt

  Scenario: NOTION_MOCK in env whitelist
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -n 'NOTION_MOCK' src/gateway/services/tenant-env-loader.ts`
      2. Assert match found (exit code 0) showing NOTION_MOCK in the whitelist array
    Expected Result: NOTION_MOCK appears in the platform env whitelist
    Evidence: .sisyphus/evidence/task-1-notion-mock-whitelist.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `pnpm test -- --run` from project root
      2. Assert 0 new failures vs baseline
    Expected Result: No test regressions
    Evidence: .sisyphus/evidence/task-1-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `feat(notion): add @notionhq/client dependency and NOTION_MOCK whitelist`
  - Files: `src/worker-tools/package.json`, `src/worker-tools/pnpm-lock.yaml`, `src/gateway/services/tenant-env-loader.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 2. Create Notion `auth.ts` (dual-mode OAuth + API key) + `validate-env.ts`

  **What to do**:
  - Create `src/worker-tools/notion/auth.ts` — **dual-mode auth** following `src/worker-tools/jira/auth.ts` exactly:
    - **OAuth mode** (preferred): Checks `NOTION_ACCESS_TOKEN` (injected by `loadTenantEnv()` from `notion_access_token` tenant secret stored via OAuth callback). Returns headers: `{ "Authorization": "Bearer <token>", "Notion-Version": "2022-06-28", "Content-Type": "application/json" }`
    - **API key mode** (fallback): Checks `NOTION_API_KEY` (can be set directly as tenant secret for pre-OAuth testing). Same header format.
    - **Neither set**: Print helpful error to stderr: "Notion credentials not configured. Either: (1) Connect Notion via dashboard → Tenant → Integrations → Connect Notion, or (2) Set notion_access_token as a tenant secret via admin API." Then `process.exit(1)`
    - Export a `resolveNotionAuth()` function that returns `{ headers: Record<string, string>, mode: 'oauth' | 'api_key' }`
  - Create `src/worker-tools/notion/validate-env.ts` — diagnostic tool that checks:
    - `NOTION_ACCESS_TOKEN` is set (OAuth path)
    - `NOTION_API_KEY` is set (fallback path)
    - Outputs `{ ok: boolean, mode: "oauth" | "api_key" | "none", vars: { NOTION_ACCESS_TOKEN: boolean, NOTION_API_KEY: boolean } }` JSON to stdout
    - Always exits 0 (diagnostic, not gating)
  - Both must follow the exact patterns from `src/worker-tools/jira/auth.ts` and `src/worker-tools/jira/validate-env.ts`

  **Must NOT do**:
  - Do NOT import from `@notionhq/client` in auth.ts — raw headers are sufficient
  - Do NOT log the actual token value — credential leak risk
  - Do NOT use `NOTION_API_KEY` as the OAuth token env var name — OAuth tokens are `NOTION_ACCESS_TOKEN` (matching `notion_access_token` secret key from OAuth callback)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small boilerplate files following an existing pattern exactly
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers the exact file structure and CLI patterns for new tool services

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-6)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 1 (needs `@notionhq/client` in package.json)

  **References**:

  **Pattern References**:
  - `src/worker-tools/jira/auth.ts` — THE primary template. This file implements dual-mode auth: checks `JIRA_ACCESS_TOKEN` + `JIRA_CLOUD_ID` first (OAuth), falls back to `JIRA_API_TOKEN` (Basic). Copy this exact pattern, replacing Jira vars with Notion vars.
  - `src/worker-tools/jira/validate-env.ts` — Copy this diagnostic pattern. Checks env vars, outputs JSON, always exits 0.
  - `src/worker-tools/hostfully/validate-env.ts` — Alternative reference for the same validate-env pattern

  **External References**:
  - Notion API authentication: https://developers.notion.com/reference/authentication — Bearer token + `Notion-Version` header required

  **WHY Each Reference Matters**:
  - `jira/auth.ts` — provides the exact dual-mode function signature, OAuth-preferred fallback logic, and error handling. Notion's auth.ts should be near-identical in structure.
  - `jira/validate-env.ts` — provides the exact output JSON shape and exit code convention

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: OAuth mode returns correct headers
    Tool: Bash
    Preconditions: NOTION_ACCESS_TOKEN set
    Steps:
      1. Run `NOTION_ACCESS_TOKEN=test-token-123 bun -e "const auth = require('./src/worker-tools/notion/auth'); const result = auth.resolveNotionAuth(); console.log(JSON.stringify(result))"`
      2. Assert output contains `"Authorization": "Bearer test-token-123"`
      3. Assert output contains `"Notion-Version": "2022-06-28"`
      4. Assert output contains `"mode": "oauth"`
    Expected Result: OAuth mode detected, correct headers returned
    Evidence: .sisyphus/evidence/task-2-auth-oauth.txt

  Scenario: API key fallback works
    Tool: Bash
    Preconditions: Only NOTION_API_KEY set (no NOTION_ACCESS_TOKEN)
    Steps:
      1. Run `NOTION_API_KEY=ntn_key_456 bun -e "const auth = require('./src/worker-tools/notion/auth'); const result = auth.resolveNotionAuth(); console.log(JSON.stringify(result))"`
      2. Assert output contains `"Authorization": "Bearer ntn_key_456"`
      3. Assert output contains `"mode": "api_key"`
    Expected Result: Falls back to API key mode
    Evidence: .sisyphus/evidence/task-2-auth-fallback.txt

  Scenario: Neither set — helpful error and exit 1
    Tool: Bash
    Preconditions: Both NOTION_ACCESS_TOKEN and NOTION_API_KEY unset
    Steps:
      1. Run `NOTION_ACCESS_TOKEN="" NOTION_API_KEY="" bun -e "const auth = require('./src/worker-tools/notion/auth'); auth.resolveNotionAuth()" 2>&1; echo "EXIT:$?"`
      2. Assert output contains "EXIT:1"
      3. Assert stderr contains "Connect Notion" or "dashboard"
    Expected Result: Helpful error message, non-zero exit
    Evidence: .sisyphus/evidence/task-2-auth-missing.txt

  Scenario: validate-env reports OAuth mode
    Tool: Bash
    Preconditions: NOTION_ACCESS_TOKEN set
    Steps:
      1. Run `NOTION_ACCESS_TOKEN=secret bun src/worker-tools/notion/validate-env.ts`
      2. Assert exit code 0
      3. Assert stdout JSON contains `"ok": true` and `"mode": "oauth"`
    Expected Result: Diagnostic reports OAuth mode
    Evidence: .sisyphus/evidence/task-2-validate-oauth.txt

  Scenario: validate-env reports no credentials
    Tool: Bash
    Preconditions: Both unset
    Steps:
      1. Run `NOTION_ACCESS_TOKEN="" NOTION_API_KEY="" bun src/worker-tools/notion/validate-env.ts`
      2. Assert exit code 0
      3. Assert stdout JSON contains `"ok": false` and `"mode": "none"`
    Expected Result: Diagnostic reports missing, exits 0 (not gating)
    Evidence: .sisyphus/evidence/task-2-validate-none.txt
  ```

  **Commit**: NO (groups with Task 7)

---

- [x] 3. Design mock fixtures for both Notion pages (trash schedule + cleaning zones)

  **What to do**:
  - Create TWO mock fixtures reflecting the actual Notion page structures:

  **Fixture 1**: `src/worker-tools/notion/fixtures/get-page/trash-schedule.json`
  - Mirrors the actual trash schedule page structure (all in Spanish)
  - Organized by day of week: `📅 LUNES`, `📅 MARTES`, `📅 MIÉRCOLES`, `📅 JUEVES`, `📅 VIERNES`
  - Each day lists property codes (e.g., `271-GIN`, `3401-BRE`) with trash type (General / Reciclaje)
  - Include notes per property (e.g., `⚠️ Nota: El bote de basura siempre está en la calle`)
  - Include "free" days (e.g., `🛑 Libre: No hay propiedades para sacar bote de basura este día`)
  - Use heading_2 blocks for day sections, bulleted_list_item blocks for properties

  **Fixture 2**: `src/worker-tools/notion/fixtures/get-page/cleaning-zones.json`
  - Mirrors the actual cleaning zones page structure (all in Spanish)
  - Organized by zone: `📍 ZONA 1: AUSTIN / KYLE`, `📍 ZONA 2: SAN ANTONIO / CONVERSE`, `📍 ZONA 3: BAILEY, COLORADO`
  - Each zone has team availability section with cleaner names, days, hours
  - Each zone lists properties with: address, assigned cleaner, service description (time + cost), lock codes
  - Use heading_1 for zones, heading_3 for sub-sections, bulleted_list_item for properties
  - Include nested blocks (`has_children: true`) for property details under each property bullet

  **Also**: Create a `default.json` that points to the zones fixture (for backward compatibility with mock mode that loads `default.json`)

  **Must NOT do**:
  - Do NOT use database/table format — the real pages are free-form text
  - Do NOT translate to English — fixtures must be in Spanish to match real data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: JSON files with realistic test data — no logic, but requires attention to Notion API response structure
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers mock fixture conventions and directory structure

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4-6)
  - **Blocks**: Tasks 7, 8, 10
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/fixtures/get-reservations/default.json` — Fixture format convention: realistic data that mimics the actual API response shape
  - `src/worker-tools/jira/fixtures/get-issue/default.json` — Another fixture example showing the expected JSON structure

  **Content References** (from user-provided page content):
  - **Trash page example** (use this as the basis for the fixture):
    ```
    📅 LUNES (Sacar el Domingo)
    - 🏷️ 271-GIN: General / Reciclaje ♻️
    - 🏷️ 7213-NUT: General / Reciclaje ♻️
    📅 MARTES (Sacar el Lunes)
    - 🏷️ 3401-BRE: General / Reciclaje ♻️
    - 🏷️ 219-PAU: ⚠️ Nota: El bote de basura siempre está en la calle.
    📅 MIÉRCOLES
    - 🛑 Libre: No hay propiedades para sacar bote de basura este día.
    ```
  - **Zones page example** (use this as the basis for the fixture):
    ```
    📍 ZONA 1: AUSTIN / KYLE
    Yessica (Equipo principal): Lunes a Viernes (7 horas, 10:00 AM - 5:00 PM) y Sábados (11:00 AM - 3:00 PM)
    Diana: Disponible para backup entre semana en el área de Austin
    - 271 Gina Dr — Asignado a: Diana — Home (90 min - $125) — Códigos: 271-Gin-1, 271-Gin-Home
    📍 ZONA 2: SAN ANTONIO / CONVERSE
    Zenaida: Equipo primario, disponible todos los días
    - 407 S Gevers St — Bundle (120 min - $165) | Home (90 min - $130) | Loft (60 min - $60)
    ```

  **External References**:
  - Notion blocks API response shape: https://developers.notion.com/reference/get-block-children — shows `results` array with block objects containing `type`, `has_children`, and type-specific content with `rich_text` arrays

  **WHY Each Reference Matters**:
  - Hostfully fixture — shows the convention for fixture file location and realistic data quality
  - User-provided content — MUST be the basis for fixtures; they represent the actual page structure the employee will encounter
  - Notion blocks API — need to match the actual API response shape so mock mode is indistinguishable from live mode

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Both fixture files are valid JSON
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `cat src/worker-tools/notion/fixtures/get-page/trash-schedule.json | jq '.' > /dev/null`
      2. Run `cat src/worker-tools/notion/fixtures/get-page/cleaning-zones.json | jq '.' > /dev/null`
      3. Assert both exit code 0
    Expected Result: Both files parse as valid JSON
    Evidence: .sisyphus/evidence/task-3-fixtures-valid.txt

  Scenario: Trash fixture contains Spanish day-of-week sections
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `cat src/worker-tools/notion/fixtures/get-page/trash-schedule.json | jq -r '.. | .rich_text? // empty | .[] | .plain_text' 2>/dev/null`
      2. Assert output contains "LUNES", "MARTES", "JUEVES", "VIERNES"
      3. Assert output contains property codes like "271-GIN", "3401-BRE"
    Expected Result: Trash fixture has Spanish day sections and property codes
    Evidence: .sisyphus/evidence/task-3-trash-content.txt

  Scenario: Zones fixture contains zone sections with cleaner data
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `cat src/worker-tools/notion/fixtures/get-page/cleaning-zones.json | jq -r '.. | .rich_text? // empty | .[] | .plain_text' 2>/dev/null`
      2. Assert output contains "ZONA 1", "ZONA 2", "ZONA 3"
      3. Assert output contains cleaner names like "Yessica", "Zenaida"
      4. Assert output contains service info like "$125", "$130", "90 min"
    Expected Result: Zones fixture has zone sections, cleaner names, and service info
    Evidence: .sisyphus/evidence/task-3-zones-content.txt

  Scenario: Zones fixture includes nested blocks
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `cat src/worker-tools/notion/fixtures/get-page/cleaning-zones.json | jq '[.. | objects | select(.has_children == true)] | length'`
      2. Assert result > 0
    Expected Result: At least one block has has_children: true for recursion testing
    Evidence: .sisyphus/evidence/task-3-fixture-nested.txt
  ```

  **Commit**: NO (groups with Task 7)

---

- [x] 4. Create `src/lib/notion-types.ts` — Notion OAuth constants + API version

  **What to do**:
  - Create `src/lib/notion-types.ts` following the pattern from `src/lib/jira-types.ts` exactly
  - Define constants:
    ```typescript
    export const NOTION_AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';
    export const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
    export const NOTION_API_VERSION = '2022-06-28';
    export const NOTION_REQUIRED_SCOPES = ''; // Notion OAuth doesn't use scopes in the same way — the page picker controls access
    ```
  - Also include a note/comment about the token exchange format: Notion uses HTTP Basic auth (`Authorization: Basic base64(clientId:clientSecret)`) for token exchange, NOT a JSON body like Jira
  - This file is used by `src/gateway/routes/notion-oauth.ts` (Task 9) and referenced by `src/worker-tools/notion/auth.ts` (Task 2) for the `NOTION_API_VERSION` constant

  **Must NOT do**:
  - Do NOT define scopes — Notion OAuth uses the page picker instead of scopes for access control
  - Do NOT add runtime logic here — constants only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single constants file, ~15 lines, exact copy of jira-types.ts structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5-6)
  - **Blocks**: Task 9
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/jira-types.ts` — THE template. Copy this exact file structure, replacing Jira constants with Notion ones.

  **External References**:
  - Notion OAuth reference: https://developers.notion.com/docs/authorization — auth URL, token URL, exchange format
  - Notion API versioning: https://developers.notion.com/reference/versioning — current version `2022-06-28`

  **WHY Each Reference Matters**:
  - `jira-types.ts` — ensures consistency across all OAuth integrations in the codebase
  - Notion docs — need exact URLs and version string

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: notion-types.ts exports all required constants
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `bun -e "const nt = require('./src/lib/notion-types'); console.log(JSON.stringify({ auth: nt.NOTION_AUTH_URL, token: nt.NOTION_TOKEN_URL, version: nt.NOTION_API_VERSION }))"`
      2. Assert output contains `api.notion.com/v1/oauth/authorize`
      3. Assert output contains `api.notion.com/v1/oauth/token`
      4. Assert output contains `2022-06-28`
    Expected Result: All constants exported correctly
    Evidence: .sisyphus/evidence/task-4-notion-types.txt

  Scenario: File follows jira-types.ts structure
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `wc -l src/lib/notion-types.ts`
      2. Assert file exists and has reasonable length (5-30 lines)
      3. Run `grep -c 'export const' src/lib/notion-types.ts`
      4. Assert at least 3 exported constants
    Expected Result: Constants file follows expected pattern
    Evidence: .sisyphus/evidence/task-4-structure.txt
  ```

  **Commit**: YES
  - Message: `feat(notion): add Notion OAuth constants and API version`
  - Files: `src/lib/notion-types.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Seed `notion_access_token` tenant secret for pre-OAuth local testing

  **What to do**:
  - Add `notion_access_token` to the VLRE tenant's secrets in `prisma/seed.ts` with a placeholder value (`secret_placeholder_replace_me`)
  - This enables Notion tool testing BEFORE the OAuth flow is implemented (Wave 2)
  - The user will replace this placeholder with their real Notion Internal Integration token for local dev
  - Follow the existing pattern for seeding tenant secrets (look for `hostfully_api_key` or `sifely_*` secrets)
  - Document in a code comment that this placeholder is for pre-OAuth development and will be overwritten when the user completes the OAuth flow

  **Must NOT do**:
  - Do NOT store a real Notion API key in source code
  - Do NOT add `NOTION_API_KEY` to `.env.example` — it's a tenant secret, not a platform env var

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single small addition to seed file
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers tenant secret seeding

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4, 6)
  - **Blocks**: Task 13
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Find where `tenant_secrets` are seeded for VLRE (look for `hostfully_api_key` or `sifely_*` secrets as examples of the exact upsert format)
  - `src/gateway/services/tenant-env-loader.ts` — Shows how tenant secrets are loaded: `notion_access_token` → `NOTION_ACCESS_TOKEN` in worker env (auto-uppercased)

  **WHY Each Reference Matters**:
  - `seed.ts` — need to match the exact secret upsert format (encrypted storage)
  - `tenant-env-loader.ts` — confirms the naming convention: `notion_access_token` (snake_case in DB) becomes `NOTION_ACCESS_TOKEN` (UPPER in worker)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Notion secret exists for VLRE tenant after seed
    Tool: Bash
    Preconditions: Database running
    Steps:
      1. Run `pnpm prisma db seed`
      2. Run `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT key FROM tenant_secrets WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND key = 'notion_access_token';"`
      3. Assert exactly 1 row returned
    Expected Result: Notion access token secret slot exists
    Evidence: .sisyphus/evidence/task-5-secret-exists.txt
  ```

  **Commit**: NO (groups with Task 10)

---

- [x] 6. Add `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_BASE_URL` to `.env.example`

  **What to do**:
  - Add three new env vars to `.env.example` in a new "Notion OAuth" subsection under section 9 (Slack Integration) or as a new section 10:
    ```
    # ── Notion OAuth ──
    NOTION_CLIENT_ID=           # From Notion Developer Portal → Your Integration → OAuth
    NOTION_CLIENT_SECRET=       # From Notion Developer Portal → Your Integration → OAuth
    NOTION_REDIRECT_BASE_URL=   # e.g., https://local-ai-employee.dozaldevs.com (must be HTTPS for Notion OAuth)
    ```
  - Also add these vars to `.env` with empty values (user fills in after creating Notion OAuth app)
  - Follow the env file conventions documented in README.md (section order, .env.example is source of truth)

  **Must NOT do**:
  - Do NOT add `NOTION_API_KEY` or `NOTION_ACCESS_TOKEN` — those are tenant secrets, not platform env vars
  - Do NOT put placeholder secrets in `.env.example` — only descriptions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two file edits adding 3 env vars each
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5)
  - **Blocks**: Task 9
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.env.example` — Follow the existing section order and format. Look at how `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_BASE_URL` are documented — use the same comment format for Notion.
  - `README.md` — Environment Variables section documents the section ordering convention

  **WHY Each Reference Matters**:
  - `.env.example` — must match exact format and section order per project conventions
  - README.md — confirms the section ordering rules

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 3 Notion OAuth vars present in .env.example
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -c 'NOTION_CLIENT_ID\|NOTION_CLIENT_SECRET\|NOTION_REDIRECT_BASE_URL' .env.example`
      2. Assert count >= 3
    Expected Result: All 3 vars documented in .env.example
    Evidence: .sisyphus/evidence/task-6-env-vars.txt

  Scenario: .env also has the vars
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -c 'NOTION_CLIENT_ID\|NOTION_CLIENT_SECRET\|NOTION_REDIRECT_BASE_URL' .env`
      2. Assert count >= 3
    Expected Result: All 3 vars present in .env
    Evidence: .sisyphus/evidence/task-6-env-dotenv.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(notion): add Notion OAuth constants and env vars`
  - Files: `src/lib/notion-types.ts`, `.env.example`, `.env`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 7. Build Notion `get-page.ts` with recursive block fetching

  **What to do**:
  - Create `src/worker-tools/notion/get-page.ts` — the main tool that fetches a Notion page's content
  - **CLI interface**: `tsx /tools/notion/get-page.ts --page-id <PAGE_ID> [--help]`
  - **Flow** (follow Jira `get-issue.ts` pattern exactly):
    1. Parse `--help` flag → print usage and exit 0
    2. Check `NOTION_MOCK=true` → load fixture from `fixtures/get-page/`. Support `--fixture <name>` flag to select which fixture (default: `default.json`). This allows the employee to test with both trash-schedule and cleaning-zones fixtures.
    3. Validate `--page-id` is provided → exit 1 with error if missing
    4. Import auth headers from `./auth.ts` (uses `resolveNotionAuth()` — dual-mode)
    5. Fetch page blocks from Notion API: `GET https://api.notion.com/v1/blocks/{page-id}/children`
    6. **Include `Notion-Version: 2022-06-28` header** on every API call (import from `notion-types.ts` or hardcode)
    7. **Recursively fetch children** for any block where `has_children: true` (up to 3 levels deep to prevent infinite recursion)
    8. Handle pagination (Notion returns max 100 blocks per request, use `start_cursor` for next page)
    9. Extract `plain_text` from each block's `rich_text` array — NEVER use `text.content` (only exists on `type: "text"` rich text items)
    10. Filter out blocks where `in_trash: true`
    11. Skip `synced_block` type (returns reference ID, not content — document this limitation)
    12. Output JSON to stdout: `{ "success": true, "pageId": "<id>", "content": "<full text content>", "blockCount": N }`
  - **Error handling**: Notion 404 → `{ "success": false, "error": "Page not found. Is it shared with the Notion integration?" }`; missing credentials → exit 1 with stderr message (from `auth.ts`)
  - **`import.meta.url` pattern**: Use the same `if (import.meta.url === ...)` guard for CLI execution as other worker tools

  **Must NOT do**:
  - Do NOT fetch page properties (title, metadata) — only blocks (content)
  - Do NOT recurse deeper than 3 levels
  - Do NOT handle `synced_block` — skip it and document the limitation
  - Do NOT use the `@notionhq/client` SDK for API calls — use native `fetch` with auth headers (matches Jira/Hostfully pattern)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core tool with recursive fetching, pagination, error handling, and multiple edge cases
  - **Skills**: [`adding-shell-tools`, `hostfully-api`]
    - `adding-shell-tools`: Full checklist for building shell tools — file structure, CLI pattern, mock support
    - `hostfully-api`: Reference for API response envelope patterns and safe casting

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10)
  - **Blocks**: Tasks 11, 13
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/worker-tools/jira/get-issue.ts` — THE primary template. Copy the exact flow: `--help` → mock → validate args → auth → fetch → output. Lines 1-76 show the complete pattern.
  - `src/worker-tools/hostfully/get-messages.ts` — Shows pagination handling pattern (Hostfully uses offset-based, Notion uses cursor-based, but the loop structure is similar)
  - `src/worker-tools/notion/auth.ts` — Import `resolveNotionAuth()` from here (created in Task 2)
  - `src/worker-tools/notion/fixtures/get-page/default.json` — Mock fixture to load when `NOTION_MOCK=true` (created in Task 3)

  **API/Type References**:
  - Notion blocks API: `GET https://api.notion.com/v1/blocks/{block_id}/children?page_size=100&start_cursor={cursor}` — returns `{ results: Block[], has_more: boolean, next_cursor: string | null }`
  - Block types to handle: `paragraph`, `heading_1/2/3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `toggle`, `callout`, `quote`, `divider`, `column_list`, `column`
  - Rich text extraction: `block[block.type].rich_text.map(rt => rt.plain_text).join('')`
  - Required headers: `Authorization: Bearer <token>`, `Notion-Version: 2022-06-28`, `Content-Type: application/json`

  **External References**:
  - Notion blocks API reference: https://developers.notion.com/reference/get-block-children
  - Notion block types: https://developers.notion.com/reference/block

  **WHY Each Reference Matters**:
  - `jira/get-issue.ts` — the canonical pattern; deviating from it means the tool won't match platform conventions
  - `hostfully/get-messages.ts` — shows how to handle paginated API responses in a loop
  - Notion blocks API — need the exact URL format, query params, and response shape to implement correctly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock mode returns fixture data
    Tool: Bash
    Preconditions: NOTION_MOCK=true
    Steps:
      1. Run `NOTION_MOCK=true bun src/worker-tools/notion/get-page.ts --page-id fake-page-id`
      2. Parse stdout as JSON
      3. Assert `.success` is `true`
      4. Assert `.content` is non-empty string
      5. Assert `.blockCount` > 0
    Expected Result: Mock returns fixture data with correct output shape
    Failure Indicators: exit code != 0, empty content, missing fields
    Evidence: .sisyphus/evidence/task-7-mock-mode.txt

  Scenario: --help exits 0 with usage info
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `bun src/worker-tools/notion/get-page.ts --help`
      2. Assert exit code 0
      3. Assert stdout contains "Usage:" and "--page-id"
    Expected Result: Help text printed, clean exit
    Evidence: .sisyphus/evidence/task-7-help.txt

  Scenario: Missing --page-id exits 1
    Tool: Bash
    Preconditions: Notion credentials set
    Steps:
      1. Run `NOTION_ACCESS_TOKEN=fake bun src/worker-tools/notion/get-page.ts 2>&1; echo "EXIT:$?"`
      2. Assert output contains "EXIT:1"
      3. Assert stderr contains "page-id" or "required"
    Expected Result: Validation error, non-zero exit
    Evidence: .sisyphus/evidence/task-7-missing-page-id.txt

  Scenario: Missing credentials exits 1 (non-mock mode)
    Tool: Bash
    Preconditions: All Notion env vars unset, NOTION_MOCK unset
    Steps:
      1. Run `NOTION_ACCESS_TOKEN="" NOTION_API_KEY="" bun src/worker-tools/notion/get-page.ts --page-id abc 2>&1; echo "EXIT:$?"`
      2. Assert output contains "EXIT:1"
      3. Assert stderr contains "Notion" or "Connect" or "credentials"
    Expected Result: Auth error with helpful message, non-zero exit
    Evidence: .sisyphus/evidence/task-7-missing-creds.txt
  ```

  **Commit**: YES
  - Message: `feat(notion): add Notion shell tools with dual-mode auth and recursive block fetching`
  - Files: `src/worker-tools/notion/get-page.ts`, `src/worker-tools/notion/auth.ts`, `src/worker-tools/notion/validate-env.ts`, `src/worker-tools/notion/fixtures/get-page/*`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 8. Build Notion write tools (`append-blocks.ts` + `update-block.ts`)

  **What to do**:
  - Create `src/worker-tools/notion/append-blocks.ts` — appends new blocks to a Notion page
    - CLI: `tsx /tools/notion/append-blocks.ts --page-id <PAGE_ID> --content "<text>" [--type paragraph|bulleted_list_item|heading_2] [--help]`
    - Follow same pattern as `get-page.ts`: `--help` → mock → validate → auth → API call → output
    - Include `Notion-Version: 2022-06-28` header on the API call
    - Uses Notion API: `PATCH https://api.notion.com/v1/blocks/{block_id}/children` with `children` array
    - Output: `{ "success": true, "blocksAdded": N }`
    - Mock mode: when `NOTION_MOCK=true`, return success without making API call
  - Create `src/worker-tools/notion/update-block.ts` — updates an existing block's content
    - CLI: `tsx /tools/notion/update-block.ts --block-id <BLOCK_ID> --content "<new text>" [--help]`
    - Include `Notion-Version: 2022-06-28` header
    - Uses Notion API: `PATCH https://api.notion.com/v1/blocks/{block_id}` with updated rich_text
    - Output: `{ "success": true, "blockId": "<id>" }`
    - Mock mode: return success without API call

  **Must NOT do**:
  - Do NOT build `delete-block.ts` — out of scope
  - Do NOT build `create-page.ts` — pages already exist, we only modify content
  - Do NOT import from `@notionhq/client` — use native `fetch` like `get-page.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Two tools with API interaction, error handling, and mock mode
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Full checklist for building shell tools

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 9, 10)
  - **Blocks**: Tasks 11, 13
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/worker-tools/notion/get-page.ts` — Follow the exact same CLI pattern (created in Task 7)
  - `src/worker-tools/notion/auth.ts` — Import `resolveNotionAuth()` from here

  **External References**:
  - Notion append block children: https://developers.notion.com/reference/patch-block-children
  - Notion update block: https://developers.notion.com/reference/update-a-block

  **WHY Each Reference Matters**:
  - `get-page.ts` — ensures consistency across all Notion tools (same CLI conventions, error handling, mock mode)
  - Notion API docs — exact request/response shapes for write operations

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: append-blocks.ts --help exits 0
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `bun src/worker-tools/notion/append-blocks.ts --help`
      2. Assert exit code 0, stdout contains "Usage:", "--page-id", "--content"
    Expected Result: Help text printed
    Evidence: .sisyphus/evidence/task-8-append-help.txt

  Scenario: append-blocks.ts mock mode returns success
    Tool: Bash
    Preconditions: NOTION_MOCK=true
    Steps:
      1. Run `NOTION_MOCK=true bun src/worker-tools/notion/append-blocks.ts --page-id fake --content "Test block"`
      2. Parse stdout as JSON
      3. Assert `.success` is `true`
    Expected Result: Mock mode succeeds without API call
    Evidence: .sisyphus/evidence/task-8-append-mock.txt

  Scenario: update-block.ts --help exits 0
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `bun src/worker-tools/notion/update-block.ts --help`
      2. Assert exit code 0, stdout contains "Usage:", "--block-id", "--content"
    Expected Result: Help text printed
    Evidence: .sisyphus/evidence/task-8-update-help.txt

  Scenario: Missing required args exits 1
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `NOTION_ACCESS_TOKEN=fake bun src/worker-tools/notion/append-blocks.ts 2>&1; echo "EXIT:$?"`
      2. Assert "EXIT:1"
      3. Run `NOTION_ACCESS_TOKEN=fake bun src/worker-tools/notion/update-block.ts 2>&1; echo "EXIT:$?"`
      4. Assert "EXIT:1"
    Expected Result: Validation errors for missing required args
    Evidence: .sisyphus/evidence/task-8-missing-args.txt
  ```

  **Commit**: YES
  - Message: `feat(notion): add Notion write tools (append-blocks, update-block)`
  - Files: `src/worker-tools/notion/append-blocks.ts`, `src/worker-tools/notion/update-block.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Build Notion OAuth routes (`notion-oauth.ts`) + register in `server.ts`

  **What to do**:
  - Create `src/gateway/routes/notion-oauth.ts` — copy `src/gateway/routes/jira-oauth.ts` and adapt for Notion:

  **Install route**: `GET /integrations/notion/install?tenant=<slug>`
  - Look up tenant by slug (same as Jira)
  - Generate HMAC-signed `state` param using existing `signState` utility (CSRF protection)
  - Redirect to `https://api.notion.com/v1/oauth/authorize` with query params:
    - `client_id` = `process.env.NOTION_CLIENT_ID`
    - `redirect_uri` = `${process.env.NOTION_REDIRECT_BASE_URL}/integrations/notion/callback`
    - `response_type` = `code`
    - `owner` = `user` (NOT `workspace` — PM may not be workspace admin)
    - `state` = HMAC-signed state

  **Callback route**: `GET /integrations/notion/callback?code=...&state=...`
  - Verify HMAC state signature using `crypto.timingSafeEqual()` (CSRF protection)
  - Exchange `code` for tokens: `POST https://api.notion.com/v1/oauth/token`
    - **CRITICAL DIFFERENCE FROM JIRA**: Use HTTP Basic auth header, NOT JSON body:
      ```
      Authorization: Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}
      Content-Type: application/json
      Body: { "grant_type": "authorization_code", "code": "<code>", "redirect_uri": "<redirect_uri>" }
      ```
    - Do NOT use `btoa()` — use `Buffer.from().toString('base64')` for Node.js compatibility
  - Parse response: `{ access_token, token_type, bot_id, workspace_id, workspace_name, owner, duplicated_template_id }`
  - **Conflict detection**: Check `integrationRepo.findByExternalId('notion', workspaceId)` — if this workspace is already attached to a different tenant, return an error
  - Store 4 secrets via `TenantSecretRepository`:
    - `notion_access_token` → the Bearer token
    - `notion_refresh_token` → if present in response (Notion docs say it IS returned)
    - `notion_workspace_id` → workspace ID
    - `notion_workspace_name` → workspace name (for display in dashboard)
  - Register integration: `integrationRepo.upsert(tenantId, 'notion', { external_id: workspaceId })`
  - Redirect to `/dashboard/` (same as Jira callback)

  **Route registration in `server.ts`**:
  - Import `notionOAuthRoutes` from `./routes/notion-oauth.ts`
  - Mount: `app.use('/integrations', notionOAuthRoutes({ prisma }))` — same pattern as Jira
  - Add startup warning: `if (!process.env.NOTION_CLIENT_ID) { logger.warn('NOTION_CLIENT_ID not set — Notion OAuth disabled') }`

  **Must NOT do**:
  - Do NOT use JSON body for token exchange — Notion requires HTTP Basic auth header
  - Do NOT use `btoa()` — use `Buffer.from().toString('base64')`
  - Do NOT use `===` for HMAC comparison — use `crypto.timingSafeEqual()`
  - Do NOT log `NOTION_CLIENT_SECRET` or `notion_access_token` values
  - Do NOT use `owner=workspace` in auth URL — use `owner=user`
  - Do NOT skip conflict detection — prevent workspace double-attach

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: OAuth flow with security requirements (CSRF, timing-safe comparison, Basic auth), token exchange, secret storage, conflict detection — follows Jira pattern but with Notion-specific differences
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers route registration patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10)
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Tasks 1, 4, 6

  **References**:

  **Pattern References**:
  - `src/gateway/routes/jira-oauth.ts` — THE primary template. Copy this file and adapt. Key sections: HMAC state signing (lines ~20-30), redirect construction, callback verification, token exchange, secret storage, integration registry upsert.
  - `src/gateway/routes/slack-oauth.ts` — Secondary reference for OAuth flow. Shows the conflict detection pattern with `integrationRepo.findByExternalId()`.
  - `src/gateway/services/tenant-secret-repository.ts` — `secretRepo.set(tenantId, key, value)` for encrypted storage
  - `src/gateway/services/tenant-integration-repository.ts` — `integrationRepo.upsert(tenantId, 'notion', { external_id: workspaceId })`
  - `src/gateway/server.ts` — Route mount point: `app.use('/integrations', ...)` — add Notion alongside Jira
  - `src/lib/notion-types.ts` — Import `NOTION_AUTH_URL`, `NOTION_TOKEN_URL` constants (created in Task 4)

  **External References**:
  - Notion OAuth authorization: https://developers.notion.com/docs/authorization — full flow including page picker
  - Notion token exchange: https://developers.notion.com/reference/create-a-token — request/response format, Basic auth requirement

  **WHY Each Reference Matters**:
  - `jira-oauth.ts` — near-identical flow; the main differences are (1) token exchange uses Basic auth instead of JSON body, (2) `owner=user` param, (3) no scopes in auth URL
  - `slack-oauth.ts` — shows the conflict detection pattern to prevent double-attach
  - `server.ts` — need exact mount point to avoid breaking existing routes

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Install route redirects to Notion auth URL
    Tool: Bash
    Preconditions: Gateway running, NOTION_CLIENT_ID set
    Steps:
      1. Run `curl -v "http://localhost:7700/integrations/notion/install?tenant=vlre" 2>&1`
      2. Assert response is 302 redirect
      3. Assert Location header contains `api.notion.com/v1/oauth/authorize`
      4. Assert Location header contains `client_id=`
      5. Assert Location header contains `state=`
      6. Assert Location header contains `owner=user`
    Expected Result: Redirect to Notion auth with correct params
    Evidence: .sisyphus/evidence/task-9-install-redirect.txt

  Scenario: CSRF protection — tampered state rejected
    Tool: Bash
    Preconditions: Gateway running
    Steps:
      1. Run `curl -s "http://localhost:7700/integrations/notion/callback?code=test&state=tampered-state-value"`
      2. Assert response contains error (not a successful redirect)
    Expected Result: Invalid state param is rejected
    Evidence: .sisyphus/evidence/task-9-csrf-protection.txt

  Scenario: Missing tenant returns 400
    Tool: Bash
    Preconditions: Gateway running
    Steps:
      1. Run `curl -s "http://localhost:7700/integrations/notion/install?tenant=doesnotexist"`
      2. Assert response is 4xx error
    Expected Result: Unknown tenant rejected
    Evidence: .sisyphus/evidence/task-9-missing-tenant.txt

  Scenario: Route registered in server.ts
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -n 'notion' src/gateway/server.ts`
      2. Assert match found showing Notion OAuth route registration
    Expected Result: Route is registered
    Evidence: .sisyphus/evidence/task-9-route-registered.txt
  ```

  **Commit**: YES
  - Message: `feat(notion): add Notion OAuth routes (install + callback)`
  - Files: `src/gateway/routes/notion-oauth.ts`, `src/gateway/server.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 10. Seed cleaning-schedule employee archetype in `prisma/seed.ts`

  **What to do**:
  - Add a new archetype record to `prisma/seed.ts` for the `cleaning-schedule` employee under the VLRE tenant (`00000000-0000-0000-0000-000000000003`)
  - **Key archetype fields**:
    - `role_name`: `"Cleaning Schedule Coordinator"`
    - `slug`: `"cleaning-schedule"`
    - `runtime`: `"opencode"`
    - `model`: Use recommendation engine or `minimax/minimax-m2.7` as default (override to `deepseek/deepseek-v4-flash` for testing)
    - `temperature`: `0.7` (lower for consistent scheduling)
    - `status`: `"active"`
    - `approval_required`: `false` — this is a report, not a guest-facing action
    - `deliverable_type`: `"slack_message"`
    - `notification_channel`: `"C0B71QSMZKQ"` (ops-cleaning-schedule)
    - `input_schema`: Define `date` as a required `every_run` input field:
      ```json
      {
        "fields": [
          {
            "key": "date",
            "label": "Checkout Date",
            "type": "text",
            "required": true,
            "frequency": "every_run",
            "description": "Target checkout date in YYYY-MM-DD format (e.g., 2026-06-01)"
          }
        ]
      }
      ```
    - `tool_registry`: `{ "tools": ["/tools/hostfully/get-properties.ts", "/tools/hostfully/get-reservations.ts", "/tools/hostfully/get-property.ts", "/tools/notion/get-page.ts", "/tools/slack/post-message.ts", "/tools/platform/submit-output.ts"] }`
    - `identity`: Clear identity as a cleaning schedule coordinator for short-term rental properties. Must understand Spanish content from Notion pages. Coordinates between Hostfully (reservations) and Notion (cleaner teams/zones) to produce daily cleaning assignments.
    - `execution_steps`: Numbered steps that:
      1. Call `get-properties.ts` to list all property UIDs + Internal Property Names
      2. For each property, call `get-reservations.ts --property-id <uid> --status confirmed` — CRITICAL: do NOT use `--from`/`--to` flags, those filter by CHECK-IN date, not checkout. Fetch all confirmed reservations.
      3. **Client-side filter**: From all fetched reservations, keep only those where `checkOut` date starts with `$INPUT_DATE`
      4. For properties with checkouts, call `get-property.ts --property-id <uid>` to get full address + `checkOutTime`
      5. Determine the day of week for `$INPUT_DATE` in Spanish (Lunes/Martes/Miércoles/Jueves/Viernes/Sábado/Domingo)
      6. Call `get-page.ts --page-id 36fd540b4380809ca373ca83e90216a3` to read the **trash schedule** page
      7. Call `get-page.ts --page-id 36fd540b438080b2be9cf4b4218d657b` to read the **cleaning zones** page
      8. Match and assign cleaners by zone, availability, and workload
      9. Build the cleaning schedule message in plain mrkdwn
      10. Handle zero checkouts: post "No hay checkouts programados" + `NO_ACTION_NEEDED`
      11. Post schedule to Slack via `post-message.ts --channel C0B71QSMZKQ`
      12. Write schedule to `/tmp/draft.txt` and call `submit-output.ts` with `--draft-file /tmp/draft.txt`
    - `delivery_steps`: Simple — execution handles Slack posting, delivery confirms completion
    - `delivery_instructions`: Minimal — no separate delivery needed

  **Must NOT do**:
  - Do NOT use `approval_required: true`
  - Do NOT add cron trigger
  - Do NOT use `--from`/`--to` in execution_steps
  - Do NOT include Notion write tools in `tool_registry`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex seed entry with carefully crafted execution_steps
  - **Skills**: [`creating-archetypes`, `adding-shell-tools`]
    - `creating-archetypes`: All archetype schema fields, seed data patterns
    - `adding-shell-tools`: Tool registry format

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9)
  - **Blocks**: Task 13
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Find existing archetype seeds (especially `code-rotation` or `real-estate-motivation-bot-2`) for the exact seed record format
  - `src/worker-tools/hostfully/get-reservations.ts` — Understanding `--property-id`, `--status`, `--from`/`--to` flags (filter CHECK-IN not checkout)
  - `src/worker-tools/hostfully/get-properties.ts` — No flags needed, returns all properties with Internal Property Names
  - `src/worker-tools/notion/get-page.ts` — `--page-id` flag, returns page content as text

  **Content References** (CRITICAL — actual page content):
  - Trash page: Spanish days (LUNES-VIERNES), property codes (271-GIN, 3401-BRE), notes, free days
  - Zones page: 3 zones, cleaner names + availability, property addresses + service times + costs
  - Property code matching: `271-GIN-HOME` → `271-GIN` by prefix

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archetype seeded successfully
    Tool: Bash
    Preconditions: Database running
    Steps:
      1. Run `pnpm prisma db seed`
      2. Run `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT id, role_name, slug, status FROM archetypes WHERE slug = 'cleaning-schedule';"`
      3. Assert exactly 1 row with status = 'active'
    Expected Result: Archetype exists in database
    Evidence: .sisyphus/evidence/task-10-archetype-seeded.txt

  Scenario: input_schema has required date field
    Tool: Bash
    Preconditions: Archetype seeded
    Steps:
      1. Run `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT input_schema FROM archetypes WHERE slug = 'cleaning-schedule';" -t`
      2. Parse as JSON
      3. Assert `.fields[0].key` = "date" and `.fields[0].required` = true
    Expected Result: Date input required on every trigger
    Evidence: .sisyphus/evidence/task-10-input-schema.txt

  Scenario: execution_steps reference both Notion page IDs and correct filtering
    Tool: Bash
    Preconditions: Archetype seeded
    Steps:
      1. Run `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT execution_steps FROM archetypes WHERE slug = 'cleaning-schedule';" -t`
      2. Assert contains `36fd540b4380809ca373ca83e90216a3` (trash page)
      3. Assert contains `36fd540b438080b2be9cf4b4218d657b` (zones page)
      4. Assert does NOT contain `--from` or `--to` with get-reservations
      5. Assert contains `C0B71QSMZKQ`
    Expected Result: Correct page IDs, channel, and filtering instructions
    Evidence: .sisyphus/evidence/task-10-execution-steps.txt

  Scenario: tool_registry includes correct tools
    Tool: Bash
    Preconditions: Archetype seeded
    Steps:
      1. Run `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT tool_registry FROM archetypes WHERE slug = 'cleaning-schedule';" -t`
      2. Parse as JSON
      3. Assert `.tools` contains: get-properties.ts, get-reservations.ts, get-property.ts, get-page.ts, post-message.ts, submit-output.ts
      4. Assert `.tools` does NOT contain append-blocks.ts or update-block.ts
    Expected Result: All 6 read tools, no write tools
    Evidence: .sisyphus/evidence/task-10-tool-registry.txt
  ```

  **Commit**: YES
  - Message: `feat(employee): add cleaning-schedule archetype seed for VLRE tenant`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 11. Unit tests for Notion tools (read + write)

  **What to do**:
  - Create `src/worker-tools/notion/__tests__/get-page.test.ts`
  - Create `src/worker-tools/notion/__tests__/write-tools.test.ts`
  - Create `src/worker-tools/notion/__tests__/validate-env.test.ts`
  - Tests should cover:
    **get-page.ts:** mock mode (both fixtures), `--help`, missing `--page-id`, missing credentials, recursive block fetching, `in_trash` filtering, `synced_block` skipping, pagination, `plain_text` extraction (Spanish content with emojis)
    **write tools:** mock mode, missing args, help flag
    **validate-env.ts:** OAuth mode detected, API key mode, no credentials
  - Follow existing test patterns in the project (Vitest)

  **Must NOT do**:
  - Do NOT make real API calls in tests — mock `fetch` or use fixture mechanism

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test cases covering recursion, pagination, dual-mode auth, error handling
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12, 13, 14)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 7, 8

  **References**:

  **Pattern References**:
  - `src/worker-tools/notion/get-page.ts`, `append-blocks.ts`, `update-block.ts` — Tools being tested
  - `src/worker-tools/notion/fixtures/get-page/*` — Fixtures for mock mode tests
  - Check existing `*.test.ts` files under `src/worker-tools/` or `src/__tests__/` for test patterns

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All Notion tests pass
    Tool: Bash
    Preconditions: Tasks 7, 8 complete
    Steps:
      1. Run `pnpm test -- --run src/worker-tools/notion/`
      2. Assert all tests pass (0 failures)
      3. Assert at least 10 test cases (mock, help, missing args, auth modes, recursion, pagination, filter, skip synced, plain_text, write mock)
    Expected Result: All tests pass, comprehensive coverage
    Evidence: .sisyphus/evidence/task-11-tests-pass.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `pnpm test -- --run`
      2. Assert 0 new failures vs baseline
    Expected Result: No regressions
    Evidence: .sisyphus/evidence/task-11-full-tests.txt
  ```

  **Commit**: YES
  - Message: `test(notion): add unit tests for Notion read and write tools`
  - Files: `src/worker-tools/notion/__tests__/*`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 12. Dashboard "Connect Notion" button + OAuth flow verification

  **What to do**:
  - Add a "Connect Notion" `IntegrationRow` to the dashboard's tenant integrations tab
  - Find the existing `IntegrationRow` component usage (look for Jira's `IntegrationRow` in `TenantOverview.tsx` or similar)
  - Add after the Jira row:
    ```tsx
    <IntegrationRow
      name="Notion"
      description="Read cleaning schedules and zone assignments from Notion pages."
      integration={integrations?.find((i) => i.provider === 'notion') ?? null}
      connectHref={
        tenant?.slug
          ? `${GATEWAY_URL}/integrations/notion/install?tenant=${tenant.slug}`
          : undefined
      }
      connectLabel="Connect Notion"
    />
    ```
  - Verify the dashboard shows the button, and after OAuth completion, shows "✓ Connected"
  - Test the full OAuth flow end-to-end: click button → Notion auth → page picker → callback → secrets stored → dashboard shows Connected

  **Must NOT do**:
  - Do NOT create a new API endpoint — the IntegrationRow component navigates directly to the install URL
  - Do NOT add new component files unless the existing pattern requires it

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI change + visual verification via Playwright
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 13, 14)
  - **Blocks**: Task 13
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - Dashboard file containing `IntegrationRow` for Jira — find via `grep -r "IntegrationRow" dashboard/src/` and add the Notion row in the same file, after Jira
  - `src/gateway/routes/notion-oauth.ts` — The install URL pattern: `/integrations/notion/install?tenant=<slug>`

  **WHY Each Reference Matters**:
  - `IntegrationRow` — need to copy the exact props pattern from Jira's row
  - OAuth routes — need the correct install URL for the `connectHref`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard shows "Connect Notion" button
    Tool: Playwright
    Preconditions: Dashboard running at localhost:7701, VLRE tenant exists
    Steps:
      1. Navigate to `http://localhost:7701/dashboard/` and select VLRE tenant
      2. Click on the integrations tab
      3. Assert page contains text "Notion"
      4. Assert page contains a link/button with text "Connect Notion"
      5. Assert the link href contains `/integrations/notion/install?tenant=`
    Expected Result: Connect Notion button visible with correct URL
    Evidence: .sisyphus/evidence/task-12-connect-button.png

  Scenario: After OAuth, dashboard shows Connected
    Tool: Playwright
    Preconditions: OAuth flow completed (notion_access_token stored)
    Steps:
      1. Navigate to dashboard integrations tab for VLRE tenant
      2. Assert page contains "✓ Connected" or equivalent badge next to "Notion"
    Expected Result: Connected status displayed after OAuth
    Evidence: .sisyphus/evidence/task-12-connected-badge.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add Connect Notion integration button`
  - Files: `dashboard/src/...` (file containing IntegrationRow)
  - Pre-commit: `pnpm test -- --run`

- [x] 13. Docker rebuild + E2E employee trigger test

  **What to do**:
  - Rebuild the Docker image: `docker build -t ai-employee-worker:latest .`
  - Verify Notion tools are accessible inside the container: `docker run --rm ai-employee-worker:latest ls /tools/notion/`
  - Override the cleaning-schedule archetype's model to `deepseek/deepseek-v4-flash` for testing: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE slug = 'cleaning-schedule';"`
  - Ensure the user has set the real `notion_access_token` tenant secret (either via OAuth flow or manual seeding)
  - Trigger the employee: `curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" -H "Content-Type: application/json" -d '{"inputs":{"date":"<TODAY_DATE>"}}'`
  - Monitor task status until it reaches `Done` or `Failed`
  - If `Done`: verify Slack message was posted with schedule content
  - If `Failed`: check container logs and fix issues
  - **Test trigger without date input**: should be rejected by `input_schema` validation
  - **Test OAuth secrets flow**: verify `NOTION_ACCESS_TOKEN` is injected into worker container by checking harness logs

  **Must NOT do**:
  - Do NOT use `minimax/minimax-m2.7` for E2E — override to `deepseek/deepseek-v4-flash`
  - Do NOT skip the Docker rebuild — Notion tools won't be in the container without it

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full E2E test with Docker build, API trigger, status monitoring, Slack verification
  - **Skills**: [`debugging-lifecycle`, `e2e-testing`]
    - `debugging-lifecycle`: Task status checking, container log inspection
    - `e2e-testing`: Prerequisites checklist, trigger methods, state verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — requires all Wave 2 + Tasks 11, 12 complete)
  - **Blocks**: Tasks 15, F1-F4
  - **Blocked By**: Tasks 7, 8, 9, 10, 11, 12

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — Full E2E test guide
  - `AGENTS.md` — Task Debugging Quick Reference section
  - `docs/employees/code-rotation.md` — Simple employee E2E test flow pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image contains Notion tools
    Tool: Bash
    Preconditions: Docker image rebuilt
    Steps:
      1. Run `docker run --rm ai-employee-worker:latest ls /tools/notion/`
      2. Assert output contains: get-page.ts, append-blocks.ts, update-block.ts, auth.ts, validate-env.ts
      3. Run `docker run --rm ai-employee-worker:latest ls /tools/notion/fixtures/get-page/`
      4. Assert output contains fixture files
    Expected Result: All Notion tools and fixtures present in container
    Evidence: .sisyphus/evidence/task-13-docker-tools.txt

  Scenario: Trigger without date is rejected
    Tool: Bash
    Preconditions: Gateway running, archetype seeded
    Steps:
      1. Run `source .env && curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" -H "Content-Type: application/json" -d '{}'`
      2. Assert response contains error about missing required input "date"
      3. Assert HTTP status is 4xx (not 202)
    Expected Result: Trigger rejected — date input required
    Evidence: .sisyphus/evidence/task-13-missing-date.txt

  Scenario: E2E — employee triggered, reaches Done, Slack message posted
    Tool: Bash
    Preconditions: Gateway running, Docker rebuilt, model overridden, Notion credentials set
    Steps:
      1. Trigger: `source .env && curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" -H "Content-Type: application/json" -d '{"inputs":{"date":"2026-06-01"}}'`
      2. Capture task_id from response
      3. Poll status every 30s (timeout: 5 minutes)
      4. Assert status reaches 'Done'
      5. Verify lifecycle trace shows correct state progression
      6. Verify Slack message posted (check container logs or Slack API)
    Expected Result: Task completes, schedule posted to Slack
    Failure Indicators: Task stuck in Executing, status = Failed, no Slack message
    Evidence: .sisyphus/evidence/task-13-e2e-lifecycle.txt

  Scenario: Container logs show Notion page fetched
    Tool: Bash
    Preconditions: E2E scenario completed
    Steps:
      1. Run `grep -i "notion\|get-page" /tmp/employee-${TASK_ID:0:8}.log | head -20`
      2. Assert logs show Notion page fetch attempts
    Expected Result: Container executed get-page.ts during task
    Evidence: .sisyphus/evidence/task-13-notion-logs.txt
  ```

  **Commit**: NO (verification only — no code changes)

---

- [x] 14. Update AGENTS.md + tool-usage-reference skill + employee docs

  **What to do**:
  - **AGENTS.md updates**:
    - Add `Notion` row to the shell tools table under "OpenCode Worker" section:
      `| Notion | /tools/notion/ | Read/write Notion pages (cleaner lists, schedules, zones) |`
    - Add `notion-oauth.ts` to the route references if applicable
    - Add `docs/employees/cleaning-schedule.md` to the Reference Documents table
  - **`src/workers/skills/tool-usage-reference/SKILL.md`** — add Notion section:
    - `get-page.ts`: CLI syntax, flags (`--page-id`, `--fixture`, `--help`), output JSON shape, required env vars (`NOTION_ACCESS_TOKEN` or `NOTION_API_KEY`), mock mode (`NOTION_MOCK=true`), known limitations (no synced_block, max 3 levels recursion)
    - `append-blocks.ts`: CLI syntax, flags, output shape
    - `update-block.ts`: CLI syntax, flags, output shape
    - `validate-env.ts`: CLI syntax, output shape (shows auth mode)
  - **`docs/employees/cleaning-schedule.md`** — create with:
    - Archetype ID, tenant, slug
    - Trigger method (manual with date input)
    - Required secrets (notion_access_token — via OAuth or manual)
    - **Setup checklist**: (1) Create Notion OAuth app, (2) Connect via dashboard, (3) **CRITICAL: Select BOTH Notion pages in the page picker during OAuth** — list both page IDs, (4) Trigger with date
    - Example trigger command
    - Known quirks (checkout filtering, Spanish content)

  **Must NOT do**:
  - Do NOT add employee-specific language to AGENTS.md shared sections
  - Do NOT document `auth.ts` internals in tool-usage-reference (it's not user-facing)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation-only task
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13)
  - **Blocks**: F1
  - **Blocked By**: Tasks 7, 8, 9, 10

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Shell tools table, Reference Documents table
  - `src/workers/skills/tool-usage-reference/SKILL.md` — Existing tool documentation format
  - `docs/employees/guest-messaging.md` — Template for employee docs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md has Notion tool row and OAuth route reference
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -n "Notion" AGENTS.md`
      2. Assert match in shell tools table containing `/tools/notion/`
      3. Assert Reference Documents table has cleaning-schedule.md entry
    Expected Result: Notion rows present in AGENTS.md
    Evidence: .sisyphus/evidence/task-14-agents-md.txt

  Scenario: tool-usage-reference has Notion section
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -n "notion\|get-page\|NOTION_ACCESS_TOKEN" src/workers/skills/tool-usage-reference/SKILL.md`
      2. Assert matches showing get-page.ts, append-blocks.ts, update-block.ts documentation
    Expected Result: All Notion tools documented
    Evidence: .sisyphus/evidence/task-14-skill-doc.txt

  Scenario: Employee doc exists with setup checklist
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `ls docs/employees/cleaning-schedule.md`
      2. Assert file exists
      3. Run `grep -c "page picker\|Select both\|notion_access_token\|C0B71QSMZKQ" docs/employees/cleaning-schedule.md`
      4. Assert count >= 3
    Expected Result: Employee docs complete with OAuth setup checklist
    Evidence: .sisyphus/evidence/task-14-employee-doc.txt
  ```

  **Commit**: YES
  - Message: `docs: add Notion tool, OAuth routes, and cleaning-schedule employee documentation`
  - Files: `AGENTS.md`, `src/workers/skills/tool-usage-reference/SKILL.md`, `docs/employees/cleaning-schedule.md`
  - Pre-commit: —

---

- [x] 15. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ Cleaning Schedule Employee plan complete — all tasks done (including Notion OAuth). Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 13

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "✅ Cleaning Schedule Employee plan complete — all tasks done (including Notion OAuth). Come back to review results."`
      2. Assert exit code 0
    Expected Result: Notification sent
    Evidence: .sisyphus/evidence/task-15-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan. **Special focus on OAuth**: verify CSRF protection, token storage, conflict detection, refresh token handling.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. **Security check**: no credential logging (`NOTION_CLIENT_SECRET`, `notion_access_token`), HMAC uses `timingSafeEqual`, no `btoa()`.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `adding-shell-tools` + `e2e-testing` skills)
      Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration: OAuth flow → Notion tool with stored token → trigger employee → verify schedule in Slack. Test edge cases: OAuth not connected, missing date input, zero checkouts. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log`/`diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                   | Files                                                                                                  | Pre-commit           |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------- |
| 1      | `feat(notion): add @notionhq/client dependency and NOTION_MOCK whitelist` | `src/worker-tools/package.json`, `src/gateway/services/tenant-env-loader.ts`                           | `pnpm test -- --run` |
| 2      | `feat(notion): add Notion OAuth constants and env vars`                   | `src/lib/notion-types.ts`, `.env.example`                                                              | `pnpm test -- --run` |
| 3      | `feat(notion): add Notion shell tools (read + write) with dual-mode auth` | `src/worker-tools/notion/*`, `src/worker-tools/notion/fixtures/**`                                     | `pnpm test -- --run` |
| 4      | `feat(notion): add Notion OAuth routes (install + callback)`              | `src/gateway/routes/notion-oauth.ts`, `src/gateway/server.ts`                                          | `pnpm test -- --run` |
| 5      | `feat(employee): add cleaning-schedule archetype seed for VLRE`           | `prisma/seed.ts`                                                                                       | `pnpm test -- --run` |
| 6      | `test(notion): add unit tests for Notion read and write tools`            | `src/worker-tools/notion/__tests__/*`                                                                  | `pnpm test -- --run` |
| 7      | `feat(dashboard): add Connect Notion integration button`                  | `dashboard/src/...`                                                                                    | `pnpm test -- --run` |
| 8      | `docs: add Notion tool and cleaning-schedule employee documentation`      | `AGENTS.md`, `src/workers/skills/tool-usage-reference/SKILL.md`, `docs/employees/cleaning-schedule.md` | —                    |

---

## Success Criteria

### Verification Commands

```bash
# OAuth install redirects correctly
curl -v "http://localhost:7700/integrations/notion/install?tenant=vlre" 2>&1 \
  | grep "Location:" | grep "api.notion.com/v1/oauth/authorize"
# Expected: 302 redirect to Notion auth with client_id and state

# CSRF protection works
curl -s "http://localhost:7700/integrations/notion/callback?code=test&state=tampered"
# Expected: Error response (invalid state)

# Notion tool works locally (API key path)
NOTION_ACCESS_TOKEN=$TOKEN bun src/worker-tools/notion/get-page.ts --page-id <PAGE_ID>
# Expected: JSON with .content (non-empty string)

# Mock mode works
NOTION_MOCK=true bun src/worker-tools/notion/get-page.ts --page-id fake
# Expected: JSON with mock cleaner data

# Employee can be triggered
source .env && curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"date":"2026-06-01"}}' | jq '{task_id}'
# Expected: task_id present, HTTP 202

# Task reaches Done
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '<TASK_ID>';"
# Expected: Done

# Dashboard shows Connect Notion
# Navigate to http://localhost:7701/dashboard/ → tenant integrations tab
# Expected: "Notion" row with "Connect Notion" button

# All secrets stored after OAuth
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets" \
  | jq '[.[] | select(.key | startswith("notion_")) | .key]'
# Expected: ["notion_access_token","notion_refresh_token","notion_workspace_id","notion_workspace_name"]

# Tests pass
pnpm test -- --run
# Expected: 0 new failures
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] OAuth flow works end-to-end (install → callback → secrets stored → dashboard shows Connected)
- [ ] Docker image rebuilt and working
- [ ] AGENTS.md updated with Notion tool row + OAuth routes
- [ ] E2E: cleaning-schedule employee triggered, reached Done, Slack message posted
