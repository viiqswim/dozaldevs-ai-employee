# Jira Integration — Full Platform Support

## TL;DR

> **Quick Summary**: Add complete Jira integration to the AI employee platform — OAuth 2.0 tenant connection, per-employee webhook URLs for Jira ticket triggers, 4 shell tools for reading/writing Jira tickets, and a new `jira-motivation-bot` employee that posts Slack messages when Jira tickets are created.
>
> **Deliverables**:
>
> - Jira OAuth 2.0 (3LO) flow with dashboard "Connect Jira" UI
> - Per-employee webhook route: `POST /webhooks/jira/:tenantSlug/:employeeSlug`
> - Refactored existing Jira route to use active lifecycle
> - Dual-mode `jira-client.ts` (OAuth 2.0 Bearer + Basic auth)
> - 4 shell tools: `get-issue`, `search-issues`, `add-comment`, `list-comments`
> - New `jira-motivation-bot` archetype (seeded)
> - Dashboard webhook URL display per employee
> - Tests for all new code
> - AGENTS.md + docs updates
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (types) → Task 4 (client rewrite) → Task 8 (shell tools) → Task 14 (webhook route) → Task 18 (E2E) → Final Verification

---

## Context

### Original Request

Full Jira integration for the AI employee platform with 5 capabilities:

1. Tenant connects Jira account via OAuth
2. Webhook triggers AI employee on `jira:issue_created` in a specific project
3. Shell tooling for reading Jira ticket context
4. Shell tooling for inspecting any ticket in a Jira project
5. Shell tooling for writing comments to Jira tickets

Plus a new `jira-motivation-bot` employee that mirrors the existing `real-estate-motivation-bot` behavior but triggers from Jira webhooks.

### Interview Summary

**Key Discussions**:

- **Employee scope**: New `jira-motivation-bot` archetype, separate from existing `real-estate-motivation-bot`
- **Auth approach**: OAuth 2.0 (3LO) for dashboard "Connect Jira" flow; Basic auth (API token) retained for shell tools
- **Webhook routing**: Per-employee URLs — `/webhooks/jira/:tenantSlug/:employeeSlug` — no lookup tables needed
- **Trigger events**: `jira:issue_created` only (not updates)
- **Webhook setup**: Manual — tenant copies URL from dashboard, configures in Jira settings (never expires)
- **Test strategy**: Tests after implementation + agent QA scenarios

**Research Findings**:

- **Existing Jira infrastructure**: Webhook route, signature validation, Zod schemas, task creation, jira-client all exist but use deprecated engineering lifecycle
- **Critical blocker**: Existing `POST /webhooks/jira` fires `engineering/task.received` (deprecated) — must switch to `employee/task.dispatched`
- **Jira API v3**: OAuth base URL is `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`, requires `cloudId` from `accessible-resources` endpoint
- **Scopes needed**: `read:jira-work write:jira-work read:jira-user manage:jira-webhook offline_access`
- **ADF format**: Comments must use Atlassian Document Format — shell tools must wrap plain text automatically
- **Connect is EOL** (Sep 2025), Forge doesn't fit — OAuth 2.0 3LO is the only viable path

### Metis Review

**Identified Gaps** (addressed):

- **Old route fate**: Keep existing `/webhooks/jira` alongside new per-employee route (non-breaking)
- **OAuth token refresh in shell tools**: Shell tools use Basic auth (API tokens), not OAuth — simplest and most robust
- **ADF wrapping**: `add-comment.ts` accepts `--body "plain text"` and wraps in ADF internally
- **Archetype routing**: Embedded in URL (`tenantSlug/employeeSlug`), projects table bypassed for routing
- **Webhook secret scope**: Per-tenant (current behavior preserved)
- **New env vars**: `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_BASE_URL` must be added to `.env.example`

---

## Work Objectives

### Core Objective

Enable the AI employee platform to fully integrate with Jira — tenants connect via OAuth, employees trigger from Jira webhooks, and employees can read/write Jira tickets through shell tools.

### Concrete Deliverables

- `src/gateway/routes/jira-oauth.ts` — OAuth 2.0 install + callback routes
- `src/gateway/routes/jira.ts` — refactored to support both legacy + per-employee webhook URLs
- `src/lib/jira-client.ts` — dual-mode client (OAuth Bearer + Basic auth)
- `src/worker-tools/jira/get-issue.ts` — read issue details
- `src/worker-tools/jira/search-issues.ts` — JQL search
- `src/worker-tools/jira/add-comment.ts` — write comment (plain text → ADF)
- `src/worker-tools/jira/list-comments.ts` — read comments
- `src/worker-tools/jira/validate-env.ts` — env validation
- `src/worker-tools/jira/fixtures/` — mock fixtures for all tools
- Dashboard: "Connect Jira" button + webhook URL display per employee
- `prisma/seed.ts` — new `jira-motivation-bot` archetype
- `docs/employees/jira-motivation-bot.md` — employee documentation
- Updated `AGENTS.md` with Jira tool CLI syntax
- Updated `.env.example` with new Jira env vars
- Tests for all new/modified code

### Definition of Done

- [ ] `curl -s "http://localhost:7700/integrations/jira/install?tenant=dozaldevs"` returns 302 redirect to `auth.atlassian.com`
- [ ] Webhook `POST /webhooks/jira/dozaldevs/jira-motivation-bot` creates task with `archetype_id` set, fires `employee/task.dispatched`
- [ ] All 4 shell tools work in mock mode (`JIRA_MOCK=true`) and return valid JSON
- [ ] `pnpm test -- --run` passes with 0 new failures
- [ ] Dashboard shows "Connect Jira" and displays webhook URL per employee

### Must Have

- Per-employee webhook URLs (`/webhooks/jira/:tenantSlug/:employeeSlug`)
- OAuth 2.0 (3LO) flow with `cloudId` resolution
- Dual-mode jira-client (OAuth + Basic auth)
- 4 shell tools with mock mode
- `jira-motivation-bot` archetype in seed data
- HMAC signature validation on new webhook route (reuse existing `verifyJiraSignature`)
- ADF wrapping in `add-comment.ts` (accept plain text, output ADF)

### Must NOT Have (Guardrails)

- NO dynamic Jira webhook registration via API (manual setup only)
- NO Jira status transitions from shell tools (existing `transitionIssue` in client stays but no shell tool wrapper)
- NO Jira attachment upload/download tools
- NO Forge app or Connect app
- NO modifications to deprecated files: `src/inngest/lifecycle.ts`, `src/inngest/redispatch.ts`, `src/workers/orchestrate.mts`
- NO employee-specific language ("jira", "motivation", "ticket") in shared lifecycle files (`employee-lifecycle.ts`, `opencode-harness.mts`)
- NO models other than `minimax/minimax-m2.7` (execution) or `anthropic/claude-haiku-4-5` (verification) in the new archetype
- NO second Jira HTTP client — extend existing `src/lib/jira-client.ts`
- NO multi-cloud Jira support (one `cloudId` per tenant)
- NO webhook URL auto-configuration (tenant copies URL manually)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (`pnpm test -- --run`)
- **Baseline**: 1490 passing, 27 skipped, 0 failures

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — send requests, assert status + response fields
- **Shell tools**: Use Bash (tsx) — run tool in mock mode, parse JSON output
- **Frontend/UI**: Use Playwright (CDP connection to user's Chrome) — navigate, interact, assert DOM, screenshot
- **Database**: Use Bash (psql) — query tables, assert row existence and values

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — types, client rewrite, archetype research):
├── Task 1: Jira TypeScript types + shared constants [quick]
├── Task 2: Query existing motivation-bot archetype from DB [quick]
├── Task 3: Jira OAuth route scaffolding (install + callback) [unspecified-high]
├── Task 4: Dual-mode jira-client.ts rewrite [deep]
├── Task 5: .env.example + env var documentation [quick]

Wave 2 (After Wave 1 — shell tools + dashboard + archetype, MAX PARALLEL):
├── Task 6: Shell tool: get-issue.ts + fixtures [unspecified-high] (depends: 1, 4)
├── Task 7: Shell tool: search-issues.ts + fixtures [unspecified-high] (depends: 1, 4)
├── Task 8: Shell tool: add-comment.ts + fixtures (ADF wrapping) [unspecified-high] (depends: 1, 4)
├── Task 9: Shell tool: list-comments.ts + fixtures [unspecified-high] (depends: 1, 4)
├── Task 10: Shell tool: validate-env.ts [quick] (depends: 1)
├── Task 11: Seed jira-motivation-bot archetype [unspecified-high] (depends: 2)
├── Task 12: Dashboard — "Connect Jira" OAuth UI [visual-engineering] (depends: 3)
├── Task 13: Dashboard — webhook URL display per employee [visual-engineering] (depends: none — uses existing data)

Wave 3 (After Wave 2 — webhook route + integration + tests):
├── Task 14: Per-employee webhook route + existing route refactor [deep] (depends: 1, 4, 11)
├── Task 15: Tests for jira-client.ts (dual-mode) [unspecified-high] (depends: 4)
├── Task 16: Tests for shell tools [unspecified-high] (depends: 6, 7, 8, 9, 10)
├── Task 17: Tests for webhook route + OAuth route [unspecified-high] (depends: 3, 14)

Wave 4 (After Wave 3 — documentation + E2E + cleanup):
├── Task 18: E2E validation (webhook → lifecycle → Slack) [deep] (depends: 11, 14)
├── Task 19: AGENTS.md + docs/employees/jira-motivation-bot.md [writing] (depends: 6-10, 14)
├── Task 20: Docker image verification [quick] (depends: 6-10)
├── Task 21: Notify completion via Telegram [quick] (depends: all)

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks      | Wave |
| ---- | ---------- | ----------- | ---- |
| 1    | —          | 4, 6-10, 14 | 1    |
| 2    | —          | 11          | 1    |
| 3    | —          | 12, 17      | 1    |
| 4    | 1          | 6-9, 14, 15 | 1    |
| 5    | —          | —           | 1    |
| 6    | 1, 4       | 16          | 2    |
| 7    | 1, 4       | 16          | 2    |
| 8    | 1, 4       | 16          | 2    |
| 9    | 1, 4       | 16          | 2    |
| 10   | 1          | 16          | 2    |
| 11   | 2          | 14, 18      | 2    |
| 12   | 3          | —           | 2    |
| 13   | —          | —           | 2    |
| 14   | 1, 4, 11   | 17, 18      | 3    |
| 15   | 4          | —           | 3    |
| 16   | 6-10       | —           | 3    |
| 17   | 3, 14      | —           | 3    |
| 18   | 11, 14     | —           | 4    |
| 19   | 6-10, 14   | —           | 4    |
| 20   | 6-10       | —           | 4    |
| 21   | all        | —           | 4    |

### Agent Dispatch Summary

- **Wave 1**: **5 tasks** — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`, T4 → `deep`, T5 → `quick`
- **Wave 2**: **8 tasks** — T6-T9 → `unspecified-high`, T10 → `quick`, T11 → `unspecified-high`, T12-T13 → `visual-engineering`
- **Wave 3**: **4 tasks** — T14 → `deep`, T15-T17 → `unspecified-high`
- **Wave 4**: **4 tasks** — T18 → `deep`, T19 → `writing`, T20 → `quick`, T21 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Jira TypeScript Types + Shared Constants

  **What to do**:
  - Create `src/lib/jira-types.ts` with shared TypeScript types for the Jira integration:
    - `JiraAuthMode = 'oauth' | 'basic'`
    - `JiraOAuthConfig = { accessToken: string; cloudId: string }`
    - `JiraBasicConfig = { email: string; apiToken: string; baseUrl: string }`
    - `JiraClientConfig = { auth: JiraOAuthConfig | JiraBasicConfig; mock?: boolean }`
    - `JiraIssue = { id: string; key: string; fields: { summary: string; description: AdfDocument | null; status: { name: string }; priority: { name: string }; assignee: { displayName: string; accountId: string } | null; reporter: { displayName: string; accountId: string }; labels: string[]; created: string; updated: string; project: { key: string; name: string } } }`
    - `JiraComment = { id: string; author: { displayName: string; accountId: string }; body: AdfDocument; created: string; updated: string }`
    - `AdfDocument = { type: 'doc'; version: 1; content: AdfNode[] }` (minimal ADF types)
    - `AdfNode = { type: string; content?: AdfNode[]; text?: string; attrs?: Record<string, unknown> }`
    - `JiraSearchResult = { issues: JiraIssue[]; total: number; maxResults: number; startAt: number }`
  - Add constants:
    - `JIRA_OAUTH_BASE_URL = 'https://api.atlassian.com/ex/jira'`
    - `JIRA_AUTH_URL = 'https://auth.atlassian.com/authorize'`
    - `JIRA_TOKEN_URL = 'https://auth.atlassian.com/oauth/token'`
    - `JIRA_ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources'`
    - `JIRA_API_VERSION = '3'`
    - `JIRA_REQUIRED_SCOPES = 'read:jira-work write:jira-work read:jira-user manage:jira-webhook offline_access'`
  - Add helper: `plainTextToAdf(text: string): AdfDocument` — wraps plain text into ADF paragraph format
  - Add helper: `adfToPlainText(adf: AdfDocument | null): string` — extracts plain text from ADF (port logic from deprecated `src/workers/lib/task-context.ts` `renderAdfDescription`)

  **Must NOT do**:
  - Do NOT add employee-specific language to this shared module
  - Do NOT import from deprecated `src/workers/lib/` — port the logic fresh

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, type definitions + pure functions, no external deps
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not a shell tool, just shared types

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 4, 6, 7, 8, 9, 10, 14
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/lib/task-context.ts:renderAdfDescription` — ADF → plain text conversion logic to port (lines where `JiraPayload` type and `renderAdfDescription` are defined). This is in the deprecated worker but the ADF parsing logic itself is correct and should be reused.
  - `src/gateway/validation/schemas.ts` — Existing `JiraWebhookSchema` Zod types for reference on Jira payload shapes

  **API/Type References**:
  - Jira REST API v3 issue response shape: `https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get`
  - ADF format spec: `https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: plainTextToAdf produces valid ADF
    Tool: Bash
    Preconditions: File src/lib/jira-types.ts exists
    Steps:
      1. Run: node -e "const { plainTextToAdf } = require('./src/lib/jira-types'); const result = plainTextToAdf('Hello world'); console.log(JSON.stringify(result))"
      2. Assert output JSON has: type === "doc", version === 1, content[0].type === "paragraph", content[0].content[0].text === "Hello world"
    Expected Result: Valid ADF JSON with the text wrapped in a paragraph node
    Evidence: .sisyphus/evidence/task-1-adf-creation.json

  Scenario: adfToPlainText extracts text from ADF
    Tool: Bash
    Preconditions: File src/lib/jira-types.ts exists
    Steps:
      1. Run: node -e "const { adfToPlainText } = require('./src/lib/jira-types'); const adf = {type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text:'Hello'},{type:'text',text:' world'}]}]}; console.log(adfToPlainText(adf))"
      2. Assert output is "Hello world"
    Expected Result: Plain text extracted from nested ADF structure
    Evidence: .sisyphus/evidence/task-1-adf-extraction.txt

  Scenario: adfToPlainText handles null gracefully
    Tool: Bash
    Preconditions: File src/lib/jira-types.ts exists
    Steps:
      1. Run: node -e "const { adfToPlainText } = require('./src/lib/jira-types'); console.log(JSON.stringify(adfToPlainText(null)))"
      2. Assert output is empty string ""
    Expected Result: Empty string returned for null input, no error thrown
    Evidence: .sisyphus/evidence/task-1-adf-null.txt
  ```

  **Commit**: YES
  - Message: `feat(jira): add shared types and constants`
  - Files: `src/lib/jira-types.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Query Existing Motivation-Bot Archetype from DB

  **What to do**:
  - Query the live database to capture the existing `real-estate-motivation-bot` archetype configuration:
    ```bash
    docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT id, role_name, tenant_id, status, system_prompt, instructions, model, deliverable_type, runtime, risk_model, agents_md, delivery_instructions, notification_channel, enrichment_adapter, vm_size, worker_env FROM archetypes WHERE id = 'e4dd9e63-91ac-490b-ba4f-10246be6fa76';" -x
    ```
  - Save the full output to `.sisyphus/evidence/task-2-motivation-bot-config.txt`
  - This output will be used by Task 11 to create the new `jira-motivation-bot` archetype with matching behavior

  **Must NOT do**:
  - Do NOT modify the existing archetype
  - Do NOT add it to seed.ts in this task (that's Task 11)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single DB query, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 11
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Look at existing archetype upsert blocks to understand the full field set

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DB query returns archetype data
    Tool: Bash
    Preconditions: Database is running (docker exec shared-postgres works)
    Steps:
      1. Run the psql query above
      2. Assert output contains role_name, system_prompt, instructions fields with non-empty values
      3. Assert model field contains an approved model ID
    Expected Result: Full archetype row with all fields populated
    Failure Indicators: "0 rows" in output, or connection refused
    Evidence: .sisyphus/evidence/task-2-motivation-bot-config.txt
  ```

  **Commit**: NO (no code changes)

- [x] 3. Jira OAuth Route Scaffolding (Install + Callback)

  **What to do**:
  - Create `src/gateway/routes/jira-oauth.ts` following the exact pattern from `src/gateway/routes/slack-oauth.ts`:
    - `GET /integrations/jira/install` — OAuth 2.0 authorization redirect
      - Accept `?tenant=<tenantSlug>` query param
      - Resolve tenant by slug from DB
      - Generate HMAC-signed `state` param (tenant ID + timestamp + signature) using `JIRA_CLIENT_SECRET`
      - Redirect to `https://auth.atlassian.com/authorize` with params: `audience=api.atlassian.com`, `client_id`, `scope` (from constants), `redirect_uri`, `state`, `response_type=code`, `prompt=consent`
    - `GET /integrations/jira/callback` — OAuth 2.0 code exchange
      - Validate `state` param (HMAC verification, expiry check)
      - Exchange `code` for tokens: `POST https://auth.atlassian.com/oauth/token` with `grant_type=authorization_code`
      - Call `GET https://api.atlassian.com/oauth/token/accessible-resources` to get `cloudId` and `jiraSiteUrl`
      - Store as tenant secrets via `TenantSecretRepository`:
        - `jira_access_token` — encrypted access token
        - `jira_refresh_token` — encrypted refresh token
        - `jira_cloud_id` — the cloudId for API URL construction
        - `jira_site_url` — e.g., `https://acme.atlassian.net`
      - Upsert `TenantIntegration` row with `provider='jira'`, `external_id=cloudId`, `status='active'`
      - Redirect to dashboard with success indicator
  - Register routes in `src/gateway/server.ts`
  - Read `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_BASE_URL` from `process.env`
  - Log warning (not error) if env vars are unset — route still mounts but returns 503

  **Must NOT do**:
  - Do NOT add employee-specific language in this shared route
  - Do NOT implement token refresh in this route (shell tools use Basic auth)
  - Do NOT auto-register Jira webhooks

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step OAuth flow, external API calls, security (HMAC state), DB operations
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `hostfully-api`: Different API, not relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Tasks 12, 17
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/slack-oauth.ts` — EXACT template for the OAuth flow structure (HMAC-signed state, code exchange, secret storage). Follow this file's patterns for state generation, validation, error handling, and redirect behavior.

  **API/Type References**:
  - `src/gateway/services/tenant-secret-repository.ts` — `set(tenantId, key, plaintext)` for storing tokens
  - `src/gateway/services/tenant-integration-repository.ts` — `upsert()` for storing integration status
  - Atlassian OAuth 2.0 docs: `https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Install endpoint redirects to Atlassian OAuth
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700, JIRA_CLIENT_ID set in .env
    Steps:
      1. curl -sI "http://localhost:7700/integrations/jira/install?tenant=dozaldevs"
      2. Assert HTTP 302 response
      3. Assert Location header starts with "https://auth.atlassian.com/authorize"
      4. Assert Location contains "client_id=" and "scope=" and "state="
    Expected Result: 302 redirect to Atlassian with all required OAuth params
    Failure Indicators: 404 (route not mounted), 500 (env vars missing), 400 (invalid tenant)
    Evidence: .sisyphus/evidence/task-3-oauth-redirect.txt

  Scenario: Install endpoint returns 400 for unknown tenant
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. curl -s "http://localhost:7700/integrations/jira/install?tenant=nonexistent"
      2. Assert HTTP 400 response with error message
    Expected Result: 400 Bad Request with clear error
    Evidence: .sisyphus/evidence/task-3-oauth-bad-tenant.txt

  Scenario: Install endpoint returns 503 when env vars are missing
    Tool: Bash (curl)
    Preconditions: Gateway running WITHOUT JIRA_CLIENT_ID set
    Steps:
      1. curl -s "http://localhost:7700/integrations/jira/install?tenant=dozaldevs"
      2. Assert HTTP 503 response
    Expected Result: 503 Service Unavailable indicating Jira OAuth not configured
    Evidence: .sisyphus/evidence/task-3-oauth-unconfigured.txt
  ```

  **Commit**: YES
  - Message: `feat(jira): add OAuth 2.0 install and callback routes`
  - Files: `src/gateway/routes/jira-oauth.ts`, `src/gateway/server.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Dual-Mode jira-client.ts Rewrite

  **What to do**:
  - Rewrite `src/lib/jira-client.ts` to support both OAuth 2.0 (Bearer token + cloudId URL) and Basic auth (email:apiToken + domain URL):
    - **Factory function**: `createJiraClient(config: JiraClientConfig): JiraClient`
    - If `config.auth` has `accessToken` + `cloudId` → OAuth mode: base URL = `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3`
    - If `config.auth` has `email` + `apiToken` + `baseUrl` → Basic mode: base URL = `{baseUrl}/rest/api/3` (existing behavior)
    - **Existing methods** (preserve behavior):
      - `getIssue(issueKey: string): Promise<JiraIssue>`
      - `addComment(issueKey: string, body: AdfDocument): Promise<JiraComment>`
      - `transitionIssue(issueKey: string, transitionId: string): Promise<void>`
    - **New methods**:
      - `searchIssues(jql: string, fields?: string[], startAt?: number, maxResults?: number): Promise<JiraSearchResult>` — uses `POST /rest/api/3/search/jql` (NOT deprecated GET endpoint)
      - `getComments(issueKey: string, startAt?: number, maxResults?: number): Promise<{ comments: JiraComment[]; total: number }>`
    - Import types from `src/lib/jira-types.ts` (Task 1)
    - Keep existing retry logic (`withRetry`, max 3 attempts, 1s base delay)
    - Both auth modes use the same retry and error handling

  **Must NOT do**:
  - Do NOT create a second client file — extend this one in-place
  - Do NOT remove Basic auth support (dual-mode)
  - Do NOT add token refresh logic (shell tools use Basic auth, OAuth tokens are refreshed at a different layer)
  - Do NOT use the deprecated `GET /rest/api/3/search` endpoint

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core library rewrite, dual auth modes, new API methods, must preserve all existing behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (but depends on Task 1 types)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Tasks 6, 7, 8, 9, 14, 15
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/lib/jira-client.ts` — THE file being rewritten. Read it fully first. Preserve `withRetry` logic, error handling, and the `JiraClient` interface pattern. Lines ~1-120.
  - `tests/lib/jira-client.test.ts` — Existing 9 unit tests that must continue passing after the rewrite

  **API/Type References**:
  - `src/lib/jira-types.ts` (Task 1 output) — Import all types from here
  - Jira REST API v3 search: `POST /rest/api/3/search/jql` — `https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/`
  - Jira REST API v3 comments: `GET /rest/api/3/issue/{issueIdOrKey}/comment` — `https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Basic auth mode constructs correct URL and headers
    Tool: Bash
    Preconditions: src/lib/jira-client.ts rewritten
    Steps:
      1. Run: node -e "const { createJiraClient } = require('./src/lib/jira-client'); const c = createJiraClient({ auth: { email: 'test@test.com', apiToken: 'tok123', baseUrl: 'https://test.atlassian.net' } }); console.log('created')"
      2. Assert no errors, client created successfully
    Expected Result: Client instantiates without error in Basic auth mode
    Evidence: .sisyphus/evidence/task-4-basic-auth-create.txt

  Scenario: OAuth mode constructs correct URL pattern
    Tool: Bash
    Preconditions: src/lib/jira-client.ts rewritten
    Steps:
      1. Run: node -e "const { createJiraClient } = require('./src/lib/jira-client'); const c = createJiraClient({ auth: { accessToken: 'at_123', cloudId: 'cloud-abc' } }); console.log('created')"
      2. Assert no errors, client created successfully
    Expected Result: Client instantiates without error in OAuth mode
    Evidence: .sisyphus/evidence/task-4-oauth-create.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: Rewrite complete
    Steps:
      1. Run: pnpm test -- --run tests/lib/jira-client.test.ts
      2. Assert all 9 existing tests pass
    Expected Result: 9 tests passing, 0 failures
    Failure Indicators: Any test failure or "not found" error
    Evidence: .sisyphus/evidence/task-4-existing-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(jira): rewrite jira-client for dual-mode auth (OAuth + Basic)`
  - Files: `src/lib/jira-client.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. .env.example + Environment Variable Documentation

  **What to do**:
  - Add new Jira OAuth environment variables to `.env.example`:
    ```
    # --- 11. Jira OAuth (for tenant Jira connections) ---
    JIRA_CLIENT_ID=""
    JIRA_CLIENT_SECRET=""
    JIRA_REDIRECT_BASE_URL="http://localhost:7700"  # Base URL for OAuth callback
    ```
  - Ensure existing `JIRA_WEBHOOK_SECRET` in section 10 remains unchanged
  - Move `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `JIRA_USER_EMAIL` from DEPRECATED section to a "Per-tenant secrets (stored in DB)" comment explaining they're set via admin API, not env vars
  - Add `JIRA_MOCK=true` to the development/testing section

  **Must NOT do**:
  - Do NOT remove the existing `JIRA_WEBHOOK_SECRET` entry
  - Do NOT change any non-Jira env vars

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit, documentation changes only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.env.example` — Read the full file to understand section numbering and style conventions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New env vars present in .env.example
    Tool: Bash
    Steps:
      1. grep "JIRA_CLIENT_ID" .env.example
      2. grep "JIRA_CLIENT_SECRET" .env.example
      3. grep "JIRA_REDIRECT_BASE_URL" .env.example
      4. grep "JIRA_MOCK" .env.example
    Expected Result: All 4 vars found in the file
    Evidence: .sisyphus/evidence/task-5-env-vars.txt

  Scenario: Existing JIRA_WEBHOOK_SECRET unchanged
    Tool: Bash
    Steps:
      1. grep "JIRA_WEBHOOK_SECRET" .env.example
    Expected Result: Entry still present, not modified
    Evidence: .sisyphus/evidence/task-5-existing-vars.txt
  ```

  **Commit**: YES
  - Message: `chore: add Jira OAuth env vars to .env.example`
  - Files: `.env.example`
  - Pre-commit: —

- [x] 6. Shell Tool: get-issue.ts + Fixtures

  **What to do**:
  - Create `src/worker-tools/jira/get-issue.ts` following the exact Hostfully shell tool pattern:
    - CLI: `tsx /tools/jira/get-issue.ts --issue-key <KEY> [--help]`
    - Env vars: `JIRA_API_TOKEN`, `JIRA_USER_EMAIL`, `JIRA_BASE_URL` (for Basic auth mode), `JIRA_MOCK`
    - Mock mode: if `JIRA_MOCK=true`, read from `fixtures/get-issue/default.json`
    - Parse args manually (no library), validate `--issue-key` is required
    - Create `createJiraClient()` with Basic auth config from env vars
    - Call `client.getIssue(issueKey)`
    - Output: JSON to stdout with fields: `{ id, key, summary, description, status, priority, assignee, reporter, labels, created, updated, project }`
    - `description` field: run `adfToPlainText()` on the raw ADF to provide plain text
    - `--help` prints usage including all flags, env vars, and output shape
  - Create `src/worker-tools/jira/fixtures/get-issue/default.json` with realistic mock data

  **Must NOT do**:
  - Do NOT use OAuth mode in shell tools — Basic auth only
  - Do NOT use any third-party arg parser
  - Do NOT write to stdout anything other than the final JSON result

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Shell tool following strict conventions, needs mock fixtures, references external API
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers exact file structure, CLI pattern, mock support, and documentation requirements

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10, 11, 12, 13)
  - **Blocks**: Task 16
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts` — EXACT template for shell tool structure: parseArgs, mock mode check, env var validation, fetch + JSON stdout, --help flag. Follow this file line by line.
  - `src/worker-tools/hostfully/fixtures/get-messages/default.json` — Mock fixture format example

  **API/Type References**:
  - `src/lib/jira-client.ts` (Task 4 output) — `createJiraClient()` factory, `getIssue()` method
  - `src/lib/jira-types.ts` (Task 1 output) — `JiraIssue` type, `adfToPlainText()` helper

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock mode returns valid JSON
    Tool: Bash
    Preconditions: Shell tool and fixtures created
    Steps:
      1. JIRA_MOCK=true tsx src/worker-tools/jira/get-issue.ts --issue-key PROJ-1
      2. Parse stdout as JSON
      3. Assert fields: id, key, summary, description, status, priority exist
      4. Assert exit code 0
    Expected Result: Valid JSON with all expected fields, exit 0
    Evidence: .sisyphus/evidence/task-6-mock-output.json

  Scenario: Missing --issue-key flag returns error
    Tool: Bash
    Steps:
      1. JIRA_MOCK=true tsx src/worker-tools/jira/get-issue.ts 2>/tmp/task-6-err.txt; echo $?
      2. Assert exit code 1
      3. Assert stderr contains "issue-key" or "required"
    Expected Result: Exit 1 with helpful error message on stderr
    Evidence: .sisyphus/evidence/task-6-missing-flag-error.txt

  Scenario: --help prints usage
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/jira/get-issue.ts --help
      2. Assert stdout contains "--issue-key", "JIRA_API_TOKEN", "JIRA_MOCK"
    Expected Result: Help text with flags, env vars, and output shape documented
    Evidence: .sisyphus/evidence/task-6-help.txt
  ```

  **Commit**: YES (groups with Tasks 7-10)
  - Message: `feat(jira): add shell tools for Jira API operations`
  - Files: `src/worker-tools/jira/*`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Shell Tool: search-issues.ts + Fixtures

  **What to do**:
  - Create `src/worker-tools/jira/search-issues.ts`:
    - CLI: `tsx /tools/jira/search-issues.ts --project <KEY> [--status <status>] [--assignee <accountId>] [--jql <raw-jql>] [--max-results <N>] [--help]`
    - `--project` is required; `--jql` overrides all other filters if provided
    - If no `--jql`: build JQL from `--project`, `--status`, `--assignee` (e.g., `project = PROJ AND status = "In Progress"`)
    - Call `client.searchIssues(jql, fields, 0, maxResults)`
    - Output: `{ issues: [{ key, summary, status, priority, assignee }], total, maxResults }`
    - Use `POST /rest/api/3/search/jql` via the client (NOT deprecated GET endpoint)
  - Create `src/worker-tools/jira/fixtures/search-issues/default.json`

  **Must NOT do**:
  - Do NOT use the deprecated `GET /rest/api/3/search` endpoint
  - Do NOT return full issue details — return summary fields only for search results

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9, 10, 11, 12, 13)
  - **Blocks**: Task 16
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts` — Shell tool structure template
  - `src/worker-tools/jira/get-issue.ts` (Task 6 output) — Follow same arg parsing and mock patterns

  **API/Type References**:
  - `src/lib/jira-client.ts` (Task 4) — `searchIssues(jql, fields, startAt, maxResults)` method
  - Jira JQL syntax: `https://support.atlassian.com/jira-service-management-cloud/docs/use-advanced-search-with-jira-query-language-jql/`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock mode search returns issue list
    Tool: Bash
    Steps:
      1. JIRA_MOCK=true tsx src/worker-tools/jira/search-issues.ts --project PROJ
      2. Parse stdout as JSON
      3. Assert fields: issues (array), total (number), maxResults (number)
      4. Assert each issue has: key, summary, status
    Expected Result: Valid JSON array of summarized issues
    Evidence: .sisyphus/evidence/task-7-mock-search.json

  Scenario: Custom JQL override
    Tool: Bash
    Steps:
      1. JIRA_MOCK=true tsx src/worker-tools/jira/search-issues.ts --jql "project = PROJ AND status = Done"
      2. Assert exit code 0, valid JSON output
    Expected Result: Tool accepts --jql flag and exits successfully
    Evidence: .sisyphus/evidence/task-7-jql-override.json
  ```

  **Commit**: YES (groups with Tasks 6, 8-10)

- [x] 8. Shell Tool: add-comment.ts + Fixtures (ADF Wrapping)

  **What to do**:
  - Create `src/worker-tools/jira/add-comment.ts`:
    - CLI: `tsx /tools/jira/add-comment.ts --issue-key <KEY> --body "comment text" [--help]`
    - Both `--issue-key` and `--body` are required
    - **CRITICAL**: Accept plain text via `--body`, then wrap it in ADF using `plainTextToAdf()` from `src/lib/jira-types.ts`. The AI employee must NEVER construct raw ADF.
    - Call `client.addComment(issueKey, adfBody)`
    - Output: `{ id, body, created }` (where `body` is the plain text version for readability)
    - `--help` warns: "⚠️ Irreversible: Comments cannot be deleted via this tool"
  - Create `src/worker-tools/jira/fixtures/add-comment/default.json`

  **Must NOT do**:
  - Do NOT expose raw ADF format to the CLI interface
  - Do NOT accept `--body` as JSON — always plain text
  - Do NOT add comment deletion capability

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 16
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/send-message.ts` — Write-path tool with irreversibility warning in --help
  - `src/lib/jira-types.ts` (Task 1) — `plainTextToAdf()` helper for text → ADF conversion

  **API/Type References**:
  - `src/lib/jira-client.ts` (Task 4) — `addComment(issueKey, adfBody)` method
  - ADF format: `https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock mode add comment returns created comment
    Tool: Bash
    Steps:
      1. JIRA_MOCK=true tsx src/worker-tools/jira/add-comment.ts --issue-key PROJ-1 --body "Great progress on this ticket!"
      2. Parse stdout as JSON
      3. Assert fields: id, body, created
    Expected Result: Valid JSON with comment metadata
    Evidence: .sisyphus/evidence/task-8-mock-comment.json

  Scenario: Missing --body flag returns error
    Tool: Bash
    Steps:
      1. JIRA_MOCK=true tsx src/worker-tools/jira/add-comment.ts --issue-key PROJ-1 2>/tmp/task-8-err.txt; echo $?
      2. Assert exit code 1
      3. Assert stderr mentions "body" or "required"
    Expected Result: Exit 1 with helpful error
    Evidence: .sisyphus/evidence/task-8-missing-body.txt

  Scenario: --help shows irreversibility warning
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/jira/add-comment.ts --help
      2. Assert output contains "Irreversible" or "cannot be deleted"
    Expected Result: Help text includes warning about irreversibility
    Evidence: .sisyphus/evidence/task-8-help.txt
  ```

  **Commit**: YES (groups with Tasks 6, 7, 9, 10)

- [x] 9. Shell Tool: list-comments.ts + Fixtures

  **What to do**:
  - Create `src/worker-tools/jira/list-comments.ts`:
    - CLI: `tsx /tools/jira/list-comments.ts --issue-key <KEY> [--max-results <N>] [--help]`
    - `--issue-key` required
    - Call `client.getComments(issueKey, 0, maxResults)`
    - Output: `{ comments: [{ id, author, body, created }], total }` where `body` is plain text (run `adfToPlainText()`)
  - Create `src/worker-tools/jira/fixtures/list-comments/default.json`

  **Must NOT do**:
  - Do NOT return raw ADF in the output — convert to plain text

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 16
  - **Blocked By**: Tasks 1, 4

  **References**:

  **Pattern References**:
  - `src/worker-tools/jira/get-issue.ts` (Task 6) — Same pattern, different API call

  **API/Type References**:
  - `src/lib/jira-client.ts` (Task 4) — `getComments()` method
  - `src/lib/jira-types.ts` (Task 1) — `adfToPlainText()` for comment body conversion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock mode returns comment list
    Tool: Bash
    Steps:
      1. JIRA_MOCK=true tsx src/worker-tools/jira/list-comments.ts --issue-key PROJ-1
      2. Parse stdout as JSON
      3. Assert fields: comments (array), total (number)
      4. Assert each comment has: id, author, body (string, not ADF), created
    Expected Result: Valid JSON with plain-text comment bodies
    Evidence: .sisyphus/evidence/task-9-mock-comments.json
  ```

  **Commit**: YES (groups with Tasks 6-8, 10)

- [x] 10. Shell Tool: validate-env.ts

  **What to do**:
  - Create `src/worker-tools/jira/validate-env.ts`:
    - CLI: `tsx /tools/jira/validate-env.ts [--help]`
    - Check for: `JIRA_API_TOKEN`, `JIRA_USER_EMAIL`, `JIRA_BASE_URL`
    - Output: `{ ok: true, vars: { JIRA_API_TOKEN: "set", JIRA_USER_EMAIL: "set", JIRA_BASE_URL: "https://..." } }` or `{ ok: false, missing: ["JIRA_API_TOKEN"] }`
    - Never outputs actual secret values — only "set" or "missing"
  - Follow exact pattern from `src/worker-tools/hostfully/validate-env.ts`

  **Must NOT do**:
  - Do NOT log actual secret values

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple env var check, no API calls
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 16
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/validate-env.ts` — EXACT template

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Reports missing vars when none set
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/jira/validate-env.ts
      2. Parse stdout as JSON
      3. Assert ok === false, missing array contains expected var names
    Expected Result: { ok: false, missing: ["JIRA_API_TOKEN", ...] }
    Evidence: .sisyphus/evidence/task-10-validate-missing.json

  Scenario: Reports ok when all vars set
    Tool: Bash
    Steps:
      1. JIRA_API_TOKEN=test JIRA_USER_EMAIL=test@test.com JIRA_BASE_URL=https://test.atlassian.net tsx src/worker-tools/jira/validate-env.ts
      2. Assert ok === true
    Expected Result: { ok: true, vars: { JIRA_API_TOKEN: "set", ... } }
    Evidence: .sisyphus/evidence/task-10-validate-ok.json
  ```

  **Commit**: YES (groups with Tasks 6-9)

- [x] 11. Seed jira-motivation-bot Archetype

  **What to do**:
  - Read the `real-estate-motivation-bot` archetype config from `.sisyphus/evidence/task-2-motivation-bot-config.txt` (Task 2 output)
  - Add a new archetype upsert block to `prisma/seed.ts`:
    - **New UUID**: Generate a new deterministic UUID for the archetype (e.g., `00000000-0000-0000-0000-000000000017`)
    - **`role_name`**: `jira-motivation-bot`
    - **`tenant_id`**: Same tenant as the existing motivation bot (VLRE: `00000000-0000-0000-0000-000000000003`)
    - **`model`**: `minimax/minimax-m2.7` (MUST use approved model)
    - **`runtime`**: `opencode`
    - **`system_prompt`**: Mirror the existing motivation bot's system_prompt but adjust for Jira context (e.g., "You are a motivation bot that celebrates when new Jira tickets are created")
    - **`instructions`**: Mirror but reference Jira ticket data instead of whatever the existing bot uses. Include: "Read the task's triage_result to understand the Jira ticket details. Post an encouraging, motivational message to Slack using the Slack post-message tool."
    - **`deliverable_type`**: Same as existing motivation bot
    - **`risk_model`**: `{ approval_required: false }` (motivation messages don't need approval)
    - **`notification_channel`**: Same as existing motivation bot's channel, or configurable
  - Add Jira-specific `agents_md` content explaining the Jira shell tools available
  - Ensure the seed is idempotent (upsert pattern like existing archetypes)

  **Must NOT do**:
  - Do NOT modify the existing `real-estate-motivation-bot` archetype
  - Do NOT use any model other than `minimax/minimax-m2.7`
  - Do NOT hardcode employee-specific language in shared files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Archetype design requires understanding the existing bot's behavior and adapting it for Jira
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Full field reference, seed patterns, approved models

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-10, 12, 13)
  - **Blocks**: Tasks 14, 18
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Existing archetype upsert blocks (daily-summarizer, guest-messaging, code-rotation). Follow exact same upsert pattern.
  - `.sisyphus/evidence/task-2-motivation-bot-config.txt` (Task 2 output) — The existing motivation bot's full config to mirror

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed creates the archetype
    Tool: Bash
    Steps:
      1. pnpm prisma db seed
      2. docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT id, role_name, model, runtime FROM archetypes WHERE role_name = 'jira-motivation-bot';"
      3. Assert 1 row returned with model = 'minimax/minimax-m2.7' and runtime = 'opencode'
    Expected Result: Archetype exists in DB with correct fields
    Failure Indicators: 0 rows, wrong model, missing fields
    Evidence: .sisyphus/evidence/task-11-archetype-seeded.txt

  Scenario: Seed is idempotent
    Tool: Bash
    Steps:
      1. pnpm prisma db seed (run twice)
      2. docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT count(*) FROM archetypes WHERE role_name = 'jira-motivation-bot';"
      3. Assert count = 1 (not duplicated)
    Expected Result: Exactly 1 row, no duplicates
    Evidence: .sisyphus/evidence/task-11-idempotent.txt
  ```

  **Commit**: YES
  - Message: `feat(jira): seed jira-motivation-bot archetype`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 12. Dashboard — "Connect Jira" OAuth UI

  **What to do**:
  - Add a "Connect Jira" integration panel to the dashboard, following the existing Slack OAuth pattern:
    - Location: Within the tenant/organization settings or integrations section of the dashboard
    - UI: A card with "Connect Jira" button that links to `GET /integrations/jira/install?tenant={tenantSlug}`
    - After successful OAuth, show connection status: "Connected to {jiraSiteName}" with a "Disconnect" option
    - Query tenant integration status via existing API to determine if Jira is connected (`GET /admin/tenants/:id/integrations` or similar)
  - Use existing dashboard component patterns (cards with `rounded-lg border bg-card`, proper padding)
  - Match existing visual style — don't introduce new design patterns

  **Must NOT do**:
  - Do NOT use Radix `<Select>` — use `<SearchableSelect>` if dropdowns are needed
  - Do NOT create a standalone page — integrate into existing settings/integrations area
  - Do NOT implement the actual OAuth flow (that's Task 3) — this is just the UI that links to it

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI component, visual design, must match existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - Search the dashboard source for any existing Slack OAuth connection UI — follow the same pattern for Jira
  - `dashboard/src/components/ui/searchable-select.tsx` — Use if any dropdowns are needed (per AGENTS.md convention)

  **External References**:
  - Dashboard dev URL: `http://localhost:7701/dashboard/` (use this for all UI testing)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: "Connect Jira" button visible in dashboard
    Tool: Playwright (CDP)
    Preconditions: Dashboard running at localhost:7701, gateway running at localhost:7700
    Steps:
      1. Navigate to http://localhost:7701/dashboard/
      2. Select a tenant
      3. Navigate to integrations/settings area
      4. Assert element with text "Connect Jira" or "Jira" is visible
      5. Assert the link points to /integrations/jira/install with correct tenant param
    Expected Result: Jira connection option visible with correct link
    Evidence: .sisyphus/evidence/task-12-connect-jira-ui.png
  ```

  **Commit**: YES (groups with Task 13)
  - Message: `feat(dashboard): add Jira OAuth connect and webhook URL display`
  - Files: `dashboard/src/**`
  - Pre-commit: `pnpm test -- --run`

- [x] 13. Dashboard — Webhook URL Display per Employee

  **What to do**:
  - In the employee detail view, add a "Webhook URL" section that displays the per-employee Jira webhook URL:
    - Format: `{baseUrl}/webhooks/jira/{tenantSlug}/{employeeSlug}`
    - Include a "Copy" button to copy the full URL to clipboard
    - Show instructional text: "Add this URL as a webhook in your Jira project settings. Select 'Issue Created' as the trigger event."
    - Only show this section for employees that have a Jira trigger configured (or show for all employees since any could be webhook-triggered)
  - The `baseUrl` should be derived from `JIRA_REDIRECT_BASE_URL` or `window.location.origin` (for the public-facing URL)
  - Use the existing employee detail page layout and card styling

  **Must NOT do**:
  - Do NOT implement webhook registration — just display the URL for manual copy
  - Do NOT add a new page — integrate into existing employee detail view

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI component, clipboard interaction, instructional text
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: None (uses existing data — tenant slug and employee slug are already available in the dashboard)

  **References**:

  **Pattern References**:
  - The existing employee detail page in the dashboard — find the component that renders employee details and add the webhook URL section there
  - Dashboard URL pattern: `http://localhost:7701/dashboard/employees/:id`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Webhook URL displayed on employee detail page
    Tool: Playwright (CDP)
    Preconditions: Dashboard running at localhost:7701
    Steps:
      1. Navigate to any employee detail page in the dashboard
      2. Look for text containing "/webhooks/jira/"
      3. Assert the URL contains the tenant slug and employee slug
      4. Assert a "Copy" button is visible near the URL
    Expected Result: Webhook URL visible with copy button
    Evidence: .sisyphus/evidence/task-13-webhook-url-display.png

  Scenario: Copy button copies URL to clipboard
    Tool: Playwright (CDP)
    Steps:
      1. Navigate to employee detail page
      2. Click the "Copy" button near the webhook URL
      3. Assert clipboard contains the full webhook URL (or assert a "Copied!" feedback appears)
    Expected Result: URL copied to clipboard with visual feedback
    Evidence: .sisyphus/evidence/task-13-copy-button.png
  ```

  **Commit**: YES (groups with Task 12)

- [x] 14. Per-Employee Webhook Route + Existing Route Refactor

  **What to do**:
  - **Part A: Add new per-employee webhook route** in `src/gateway/routes/jira.ts`:
    - `POST /webhooks/jira/:tenantSlug/:employeeSlug`
    - Route handler:
      1. Zod-parse body using existing `JiraWebhookSchema` (reuse, don't rebuild)
      2. Filter: only handle `jira:issue_created` events (return 200 OK for others)
      3. Resolve tenant by slug: `prisma.tenant.findFirst({ where: { slug: tenantSlug } })`
      4. Resolve archetype by slug + tenant: `prisma.archetype.findFirst({ where: { role_name: employeeSlug, tenant_id: tenantId } })`
      5. Return 404 if tenant or archetype not found
      6. Verify HMAC signature using existing `verifyJiraSignature()` with per-tenant secret (reuse existing 2-tier lookup: `secretRepo.get(tenantId, 'jira_webhook_secret')` → fallback `JIRA_WEBHOOK_SECRET`)
      7. Create task via an updated `createTaskFromJiraWebhook()` that now accepts and sets `archetype_id`
      8. Fire `employee/task.dispatched` event (NOT `engineering/task.received`) with `{ taskId, archetypeId }`
      9. Return `{ status: 'task_created', taskId }`
    - Handle idempotency via existing P2002 unique constraint

  - **Part B: Refactor existing `/webhooks/jira` route**:
    - Keep the existing route mounted for backward compatibility
    - Change it to fire `employee/task.dispatched` instead of `engineering/task.received`
    - It still resolves tenant from `jira_project_key` in the payload (existing behavior)
    - It must now also resolve `archetype_id` — use `prisma.archetype.findFirst({ where: { tenant_id, role_name: <configured-slug> } })` or a default archetype for the tenant
    - If no archetype can be resolved, return 422 with clear error message

  - **Part C: Update `createTaskFromJiraWebhook()`** in `src/gateway/services/task-creation.ts`:
    - Add `archetype_id` as a required parameter
    - Set it on the task row creation
    - Ensure `source_system: 'jira'` is preserved

  - **Part D: Update Inngest event dispatch**:
    - Replace `sendTaskReceivedEvent()` call with direct `inngest.send({ name: 'employee/task.dispatched', data: { taskId, archetypeId } })`
    - Or update `sendTaskReceivedEvent` to accept and send the correct event
    - Use `lsp_find_references` on `sendTaskReceivedEvent` before modifying to confirm no other active routes depend on it

  **Must NOT do**:
  - Do NOT modify `src/inngest/lifecycle.ts` (deprecated)
  - Do NOT remove the existing `/webhooks/jira` route (backward compatibility)
  - Do NOT add employee-specific language to the route handler (it's generic — handles any archetype)
  - Do NOT change the HMAC signature validation logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Refactoring existing route, adding new route, updating service layer, changing Inngest event — multiple interconnected changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (touches shared services)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 17, 18
  - **Blocked By**: Tasks 1, 4, 11

  **References**:

  **Pattern References**:
  - `src/gateway/routes/jira.ts` — THE file being modified. Read it fully first. Understand current flow, signature validation, tenant resolution, error handling.
  - `src/gateway/routes/hostfully.ts` — Alternative webhook pattern showing archetype resolution and `employee/task.dispatched` event dispatch. This is the correct pattern to follow for the active lifecycle.
  - `src/gateway/routes/admin-employee-trigger.ts` — Shows `tenant slug + employee slug → archetype` resolution pattern via `employee-dispatcher.ts`
  - `src/gateway/services/employee-dispatcher.ts` — `resolveArchetype(tenantId, slug)` pattern — may be reusable here

  **API/Type References**:
  - `src/gateway/services/task-creation.ts` — `createTaskFromJiraWebhook()` function to modify
  - `src/gateway/inngest/send.ts` — `sendTaskReceivedEvent()` function — check if this should be updated or bypassed
  - `src/inngest/employee-lifecycle.ts` — The active lifecycle that will receive `employee/task.dispatched` — read the `load-task` step to understand what data it expects

  **Tool Recommendations**:
  - `lsp_find_references` on `sendTaskReceivedEvent` to map all callers
  - `lsp_find_references` on `createTaskFromJiraWebhook` to map all call sites
  - `ast_grep_search` for `engineering/task.received` to find all references to the deprecated event

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Per-employee webhook creates task with correct archetype
    Tool: Bash (curl)
    Preconditions: Gateway running, jira-motivation-bot archetype seeded (Task 11), JIRA_WEBHOOK_SECRET set
    Steps:
      1. Compute HMAC: SIGNATURE=$(echo -n '<payload>' | openssl dgst -sha256 -hmac "$JIRA_WEBHOOK_SECRET" | cut -d' ' -f2)
      2. curl -s -X POST "http://localhost:7700/webhooks/jira/vlre/jira-motivation-bot" -H "Content-Type: application/json" -H "X-Hub-Signature: sha256=$SIGNATURE" -d @test-payloads/jira-issue-created.json
      3. Parse response JSON
      4. Assert response contains taskId and status === "task_created"
      5. docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT id, archetype_id, source_system FROM tasks WHERE id = '<taskId>';"
      6. Assert archetype_id is NOT NULL and matches the jira-motivation-bot archetype ID
      7. Assert source_system === 'jira'
    Expected Result: Task created with correct archetype_id, source_system='jira'
    Evidence: .sisyphus/evidence/task-14-webhook-create.txt

  Scenario: Unknown tenant slug returns 404
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:7700/webhooks/jira/nonexistent/jira-motivation-bot" -H "Content-Type: application/json" -d @test-payloads/jira-issue-created.json
      2. Assert HTTP 404
    Expected Result: 404 Not Found
    Evidence: .sisyphus/evidence/task-14-unknown-tenant.txt

  Scenario: Unknown employee slug returns 404
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:7700/webhooks/jira/vlre/nonexistent-bot" -H "Content-Type: application/json" -d @test-payloads/jira-issue-created.json
      2. Assert HTTP 404
    Expected Result: 404 Not Found
    Evidence: .sisyphus/evidence/task-14-unknown-employee.txt

  Scenario: Invalid signature returns 401
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:7700/webhooks/jira/vlre/jira-motivation-bot" -H "Content-Type: application/json" -H "X-Hub-Signature: sha256=invalid" -d @test-payloads/jira-issue-created.json
      2. Assert HTTP 401
    Expected Result: 401 Unauthorized
    Evidence: .sisyphus/evidence/task-14-bad-signature.txt

  Scenario: Legacy route still works (backward compatibility)
    Tool: Bash (curl)
    Steps:
      1. curl -s -X POST "http://localhost:7700/webhooks/jira" -H "Content-Type: application/json" -H "X-Hub-Signature: sha256=$SIGNATURE" -d @test-payloads/jira-issue-created.json
      2. Assert response is not 404 (route still mounted)
    Expected Result: Route responds (may error on archetype resolution but is not 404)
    Evidence: .sisyphus/evidence/task-14-legacy-route.txt
  ```

  **Commit**: YES
  - Message: `feat(jira): add per-employee webhook route, refactor existing route to active lifecycle`
  - Files: `src/gateway/routes/jira.ts`, `src/gateway/services/task-creation.ts`, `src/gateway/server.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 15. Tests for jira-client.ts (Dual-Mode)

  **What to do**:
  - Update `tests/lib/jira-client.test.ts` to cover the new dual-mode functionality:
    - **Existing tests** (9 tests) — ensure they still pass without modification
    - **New OAuth mode tests**:
      - OAuth client constructs correct base URL: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`
      - OAuth client sends Bearer token in Authorization header
      - OAuth `getIssue` returns correct response shape
      - OAuth `addComment` sends ADF body
      - OAuth `searchIssues` uses POST to `/search/jql`
      - OAuth `getComments` returns paginated comments
    - **New Basic mode tests for new methods**:
      - Basic auth `searchIssues` returns JiraSearchResult shape
      - Basic auth `getComments` returns comments array
    - **Edge cases**:
      - Invalid auth config (missing fields) throws descriptive error
      - Both modes handle 401 Unauthorized correctly

  **Must NOT do**:
  - Do NOT modify existing passing tests
  - Do NOT mock at too low a level — test the client interface, mock fetch responses

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Extending test suite for dual-mode client, multiple test scenarios
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 16, 17)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `tests/lib/jira-client.test.ts` — Existing test file to extend. Read all 9 tests to understand mocking pattern and test style.

  **API/Type References**:
  - `src/lib/jira-client.ts` (Task 4 output) — The client being tested

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/lib/jira-client.test.ts
      2. Assert ≥15 tests passing (9 existing + ≥6 new), 0 failures
    Expected Result: All tests green
    Evidence: .sisyphus/evidence/task-15-client-tests.txt
  ```

  **Commit**: YES (groups with Tasks 16, 17)
  - Message: `test(jira): add tests for client, shell tools, and routes`
  - Files: `tests/**`
  - Pre-commit: `pnpm test -- --run`

- [x] 16. Tests for Shell Tools

  **What to do**:
  - Create `tests/worker-tools/jira/` directory with test files for each shell tool:
    - `get-issue.test.ts` — Tests mock mode output shape, missing flag errors, help text
    - `search-issues.test.ts` — Tests mock mode, JQL construction from flags, custom JQL override
    - `add-comment.test.ts` — Tests mock mode, ADF wrapping (verify plain text → ADF conversion), missing flags
    - `list-comments.test.ts` — Tests mock mode output, ADF → plain text conversion in output
    - `validate-env.test.ts` — Tests with/without env vars set
  - Use existing test patterns from `tests/` — check how other shell tool tests are structured
  - Each test should run the tool as a subprocess and validate stdout/stderr/exit code

  **Must NOT do**:
  - Do NOT test against real Jira API — mock mode only
  - Do NOT import tool internals — test via subprocess execution

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, subprocess testing pattern, comprehensive coverage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 17)
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7, 8, 9, 10

  **References**:

  **Pattern References**:
  - Search `tests/` for any existing shell tool tests to follow the pattern (e.g., subprocess execution, stdout parsing)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All shell tool tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/worker-tools/jira/
      2. Assert all tests pass, 0 failures
    Expected Result: Full green test suite for all 5 shell tools
    Evidence: .sisyphus/evidence/task-16-tool-tests.txt
  ```

  **Commit**: YES (groups with Tasks 15, 17)

- [x] 17. Tests for Webhook Route + OAuth Route

  **What to do**:
  - Update or create tests for the refactored Jira routes:
    - **Per-employee webhook route tests** (`tests/gateway/routes/jira.test.ts` or new file):
      - Valid webhook with correct tenant/employee slug → 200 + task created
      - Unknown tenant slug → 404
      - Unknown employee slug → 404
      - Invalid HMAC signature → 401
      - Invalid payload (fails Zod) → 400
      - Duplicate webhook (idempotency) → 200 with existing task ID
      - Verify `employee/task.dispatched` event is fired (not `engineering/task.received`)
      - Verify task has `archetype_id` set
    - **OAuth route tests** (`tests/gateway/routes/jira-oauth.test.ts`):
      - Install redirect: valid tenant → 302 to auth.atlassian.com
      - Install: unknown tenant → 400
      - Install: missing env vars → 503
      - Callback: valid state + code → stores tokens + redirects
      - Callback: invalid/expired state → 401
      - Callback: missing code → 400
  - Update existing Jira webhook tests if they break due to the refactor (they test the legacy route which now fires a different event)

  **Must NOT do**:
  - Do NOT delete existing test files — update them
  - Do NOT mock at too high a level — test route behavior end-to-end with supertest

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test scenarios, route-level testing, must handle refactored behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 16)
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 14

  **References**:

  **Pattern References**:
  - `tests/gateway/routes/jira.test.ts` — Existing route tests to update/extend
  - `tests/gateway/jira-webhook.test.ts` — Existing webhook integration tests
  - `tests/gateway/jira-webhook-with-new-project.test.ts` — Unknown project key tests

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All route tests pass
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/gateway/
      2. Assert 0 failures in any Jira-related test file
    Expected Result: All gateway tests pass including new and updated Jira tests
    Evidence: .sisyphus/evidence/task-17-route-tests.txt
  ```

  **Commit**: YES (groups with Tasks 15, 16)

- [x] 18. E2E Validation (Webhook → Lifecycle → Slack)

  **What to do**:
  - Run a full end-to-end test of the Jira webhook → employee lifecycle → Slack delivery pipeline:
    1. **Prerequisites check**: Verify gateway running (`curl localhost:7700/health`), Inngest running (`curl localhost:8288/health`), Docker running
    2. **Ensure archetype is seeded**: Verify `jira-motivation-bot` exists in DB
    3. **Build Docker image**: `docker build -t ai-employee-worker:latest .` (includes new shell tools)
    4. **Send test webhook**: `POST /webhooks/jira/vlre/jira-motivation-bot` with a realistic Jira payload and valid HMAC signature
    5. **Track task through lifecycle**: Poll `SELECT status FROM tasks WHERE id = '<taskId>'` every 10s
    6. **Verify task reaches Executing**: Assert status progresses through Received → Ready → Executing
    7. **Verify task completes**: Assert status reaches Done or Delivering (depending on approval_required setting)
    8. **Check for Slack message**: Verify a Slack message was posted (check task output or Slack channel)
    9. **Record all state transitions**: Capture full lifecycle trace
  - Use tmux for the Docker build (long-running command)
  - Follow the E2E testing patterns from `docs/testing/` guides

  **Must NOT do**:
  - Do NOT skip the Docker build — shell tools must be in the image
  - Do NOT use blocking Bash calls for Docker build — use tmux

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full E2E pipeline, multiple services, Docker build, lifecycle tracking, evidence capture
  - **Skills**: [`e2e-testing`]
    - `e2e-testing`: Prerequisites checklist, trigger methods, state verification via task_status_log

  **Parallelization**:
  - **Can Run In Parallel**: NO (requires all prior tasks complete)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Tasks 11, 14 (plus all shell tools must be built)

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — E2E test patterns and verification steps
  - `scripts/trigger-task.ts` — How existing E2E triggers work
  - `scripts/verify-e2e.ts` — How to verify task completion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E — Jira webhook to Slack message
    Tool: Bash + tmux
    Preconditions: All services running, Docker image built, archetype seeded
    Steps:
      1. Send Jira webhook: curl -X POST with HMAC signature to /webhooks/jira/vlre/jira-motivation-bot
      2. Capture task ID from response
      3. Poll task status every 10s: docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '<taskId>';"
      4. Assert task reaches 'Executing' within 60 seconds
      5. Assert task reaches 'Done' or 'Delivering' within 5 minutes
      6. Check task output: docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT triage_result, status FROM tasks WHERE id = '<taskId>';" -x
    Expected Result: Task completes full lifecycle from webhook to Done
    Failure Indicators: Task stuck in 'Ready', 'Failed' status, or no task created
    Evidence: .sisyphus/evidence/task-18-e2e-lifecycle.txt

  Scenario: Docker image includes Jira shell tools
    Tool: Bash
    Steps:
      1. docker run --rm ai-employee-worker:latest ls /tools/jira/
      2. Assert output lists: get-issue.ts, search-issues.ts, add-comment.ts, list-comments.ts, validate-env.ts
    Expected Result: All 5 tools present in Docker image at /tools/jira/
    Evidence: .sisyphus/evidence/task-18-docker-tools.txt
  ```

  **Commit**: NO (E2E evidence only)

- [x] 19. AGENTS.md + docs/employees/jira-motivation-bot.md

  **What to do**:
  - **Update `AGENTS.md`**:
    - Add Jira shell tools section under "OpenCode Worker" → "Shell tools":
      ```
      - **Jira tools** (`/tools/jira/`):
        - `tsx /tools/jira/get-issue.ts --issue-key <KEY>` — get full issue details
        - `tsx /tools/jira/search-issues.ts --project <KEY> [--status <status>] [--jql <raw-jql>]` — search issues via JQL
        - `tsx /tools/jira/add-comment.ts --issue-key <KEY> --body "text"` — add comment (plain text, auto-wrapped to ADF)
        - `tsx /tools/jira/list-comments.ts --issue-key <KEY>` — list comments on an issue
        - `tsx /tools/jira/validate-env.ts` — validate Jira env vars
      ```
    - Add Jira OAuth routes to gateway routes section if one exists
    - Add `docs/employees/jira-motivation-bot.md` to Reference Documents table
    - Update Skills table if any new skills were created
  - **Create `docs/employees/jira-motivation-bot.md`**:
    - Archetype ID and role_name
    - Tenant(s) it's deployed to
    - Trigger: `POST /webhooks/jira/{tenantSlug}/jira-motivation-bot`
    - What it does: Posts motivation message to Slack when Jira ticket is created
    - Jira webhook setup instructions (manual steps in Jira settings)
    - Channel IDs for Slack posting
    - Test resources: test payload file, mock mode
    - Known gotchas

  **Must NOT do**:
  - Do NOT add employee-specific content to the main AGENTS.md beyond the tool CLI syntax
  - Do NOT duplicate information already in AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing, following existing doc patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 18, 20, 21)
  - **Blocks**: None
  - **Blocked By**: Tasks 6-10, 14

  **References**:

  **Pattern References**:
  - `docs/employees/guest-messaging.md` — Template for employee documentation
  - `docs/employees/code-rotation.md` — Another employee doc template
  - `AGENTS.md` — Read the Sifely/Hostfully tool sections for CLI syntax documentation style

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md contains Jira tool syntax
    Tool: Bash
    Steps:
      1. grep "get-issue.ts" AGENTS.md
      2. grep "add-comment.ts" AGENTS.md
      3. grep "search-issues.ts" AGENTS.md
      4. grep "list-comments.ts" AGENTS.md
    Expected Result: All 4 tools documented in AGENTS.md
    Evidence: .sisyphus/evidence/task-19-agents-md.txt

  Scenario: Employee doc file exists and is complete
    Tool: Bash
    Steps:
      1. test -f docs/employees/jira-motivation-bot.md && echo "exists"
      2. grep "Trigger" docs/employees/jira-motivation-bot.md
      3. grep "webhook" docs/employees/jira-motivation-bot.md
    Expected Result: File exists with trigger and webhook documentation
    Evidence: .sisyphus/evidence/task-19-employee-doc.txt
  ```

  **Commit**: YES
  - Message: `docs: add Jira integration documentation`
  - Files: `AGENTS.md`, `docs/employees/jira-motivation-bot.md`
  - Pre-commit: —

- [x] 20. Docker Image Verification

  **What to do**:
  - Verify the Docker image builds successfully with the new Jira tools:
    - `docker build -t ai-employee-worker:latest .`
    - Verify tools are at correct path: `docker run --rm ai-employee-worker:latest ls /tools/jira/`
    - Verify mock mode works inside container: `docker run --rm -e JIRA_MOCK=true ai-employee-worker:latest tsx /tools/jira/get-issue.ts --issue-key TEST-1`
  - Check `Dockerfile` to ensure `COPY src/worker-tools/ /tools/` includes the new `jira/` directory (it should since it copies the entire directory)
  - Verify `GET /admin/tools` API lists the new Jira tools

  **Must NOT do**:
  - Do NOT modify the Dockerfile unless the COPY pattern doesn't include new subdirectories
  - Do NOT push the Docker image — local verification only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification task, no code changes expected
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 18, 19, 21)
  - **Blocks**: None
  - **Blocked By**: Tasks 6-10

  **References**:

  **Pattern References**:
  - `Dockerfile` — Check COPY commands for worker-tools

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds and contains tools
    Tool: Bash (tmux for docker build)
    Steps:
      1. docker build -t ai-employee-worker:latest .
      2. docker run --rm ai-employee-worker:latest ls /tools/jira/
      3. Assert output contains: get-issue.ts, search-issues.ts, add-comment.ts, list-comments.ts, validate-env.ts
    Expected Result: All 5 tools present in image
    Evidence: .sisyphus/evidence/task-20-docker-tools.txt

  Scenario: Admin tools API lists Jira tools
    Tool: Bash (curl)
    Steps:
      1. curl -s -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tools | python3 -c "import json,sys; tools=[t for t in json.load(sys.stdin) if t.get('service')=='jira']; print(len(tools))"
      2. Assert output is 5 (or 4 if validate-env is excluded)
    Expected Result: Jira tools discoverable via admin API
    Evidence: .sisyphus/evidence/task-20-admin-tools.txt
  ```

  **Commit**: NO (verification only)

- [x] 21. Notify Completion via Telegram

  **What to do**:
  - Send Telegram notification that all tasks are complete:
    ```bash
    tsx scripts/telegram-notify.ts "📋 Jira Integration plan complete — all tasks done. Come back to review results."
    ```
  - Kill all tmux sessions created during execution:
    ```bash
    tmux list-sessions -F '#{session_name}' | grep '^ai-' | xargs -I{} tmux kill-session -t {}
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final task)
  - **Blocks**: None
  - **Blocked By**: All previous tasks

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "📋 Jira Integration plan complete"
      2. Assert exit code 0
    Expected Result: Notification sent successfully
    Evidence: .sisyphus/evidence/task-21-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no employee-specific language in shared files.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill for dashboard)
      Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration (webhook → lifecycle → Slack). Test edge cases: invalid signature, unknown tenant slug, unknown employee slug, duplicate webhooks. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group   | Message                                                                                   | Files                                                                 | Pre-commit           |
| ------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| T1      | `feat(jira): add shared types and constants`                                              | `src/lib/jira-types.ts`                                               | `pnpm test -- --run` |
| T4      | `feat(jira): rewrite jira-client for dual-mode auth`                                      | `src/lib/jira-client.ts`                                              | `pnpm test -- --run` |
| T3      | `feat(jira): add OAuth 2.0 install and callback routes`                                   | `src/gateway/routes/jira-oauth.ts`                                    | `pnpm test -- --run` |
| T5      | `chore: add Jira OAuth env vars to .env.example`                                          | `.env.example`                                                        | —                    |
| T6-T10  | `feat(jira): add shell tools for Jira API operations`                                     | `src/worker-tools/jira/*`                                             | `pnpm test -- --run` |
| T11     | `feat(jira): seed jira-motivation-bot archetype`                                          | `prisma/seed.ts`                                                      | `pnpm test -- --run` |
| T12-T13 | `feat(dashboard): add Jira OAuth connect and webhook URL display`                         | `dashboard/src/**`                                                    | `pnpm test -- --run` |
| T14     | `feat(jira): add per-employee webhook route, refactor existing route to active lifecycle` | `src/gateway/routes/jira.ts`, `src/gateway/services/task-creation.ts` | `pnpm test -- --run` |
| T15-T17 | `test(jira): add tests for client, shell tools, and routes`                               | `tests/**`                                                            | `pnpm test -- --run` |
| T19     | `docs: add Jira integration documentation`                                                | `AGENTS.md`, `docs/employees/jira-motivation-bot.md`                  | —                    |

---

## Success Criteria

### Verification Commands

```bash
# OAuth redirect works
curl -sI "http://localhost:7700/integrations/jira/install?tenant=dozaldevs" | grep "Location: https://auth.atlassian.com"

# Per-employee webhook creates task
curl -X POST "http://localhost:7700/webhooks/jira/dozaldevs/jira-motivation-bot" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: sha256=<computed>" \
  -d @test-payloads/jira-issue-created.json

# Shell tools work in mock mode
JIRA_MOCK=true tsx src/worker-tools/jira/get-issue.ts --issue-key PROJ-1
JIRA_MOCK=true tsx src/worker-tools/jira/add-comment.ts --issue-key PROJ-1 --body "Test"
JIRA_MOCK=true tsx src/worker-tools/jira/search-issues.ts --project PROJ
JIRA_MOCK=true tsx src/worker-tools/jira/list-comments.ts --issue-key PROJ-1

# Tests pass
pnpm test -- --run  # Expected: ≥1490 passing, 0 new failures

# Dashboard shows Jira integration
# Playwright: navigate to localhost:7701/dashboard, check for "Connect Jira" button
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] AGENTS.md updated with Jira tool CLI syntax
- [ ] `.env.example` updated with new env vars
- [ ] `docs/employees/jira-motivation-bot.md` created
- [ ] Docker image builds successfully with new tools
