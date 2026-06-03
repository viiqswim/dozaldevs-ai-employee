# Google OAuth Integration + Workspace Shell Tools + Assistant Archetype

## TL;DR

> **Quick Summary**: Add Google OAuth 2.0 (per-tenant) to the AI Employee platform — OAuth install/callback routes, token manager with refresh, internal token endpoint for workers, ~18 shell tools for Gmail/Docs/Sheets/Slides/Drive/Calendar, dashboard integration card, and a "General Google Assistant" employee archetype.
>
> **Deliverables**:
>
> - Google OAuth install + callback routes (`/integrations/google/install`, `/integrations/google/callback`)
> - Google token manager service with in-memory cache + refresh logic
> - Internal token endpoint (`POST /internal/tasks/:taskId/google-token`)
> - Admin disconnect endpoint (`DELETE /admin/tenants/:tenantId/integrations/google`)
> - 18 shell tools across 6 Google services (Gmail 3, Docs 3, Sheets 3, Slides 2, Drive 4, Calendar 3)
> - Dashboard integration card (connect/disconnect)
> - "General Google Assistant" employee archetype (VLRE tenant)
> - GCP setup guide documentation
> - `.env` / `.env.example` / AGENTS.md / README updates
>
> **Estimated Effort**: Large (2-3 days)
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: T1 (npm) → T3 (token mgr) → T5 (OAuth routes) → T7 (internal endpoint) → T15-T20 (shell tools) → T22 (archetype) → T23 (Docker) → T24 (E2E)

---

## Context

### Original Request

User wants a Google integration via OAuth that lets AI employees interact with Gmail, Google Docs, Sheets, Slides (PowerPoint), Google Drive, Calendar, and other essential tools with CRUD operations.

### Interview Summary

**Key Discussions**:

- **Auth model**: Per-tenant (one PM connects Google per tenant, all employees use it)
- **Scope level**: Full access — `gmail.modify` (RESTRICTED), `drive` (RESTRICTED), `documents`, `spreadsheets`, `presentations`, `calendar` (all Sensitive). User accepts Google security audit requirement for production.
- **Tool scope**: Essential CRUD per service (~18 tools)
- **Employee**: "General Google Assistant" — receives NL instructions, any Google Workspace task
- **Test strategy**: Tests after implementation (Vitest)
- **GCP setup**: Include guide in plan (user doesn't have credentials yet)

**Research Findings**:

- 4 existing OAuth flows in codebase (GitHub, Slack, Notion, Jira) — `notion-oauth.ts` is the closest analog
- All use shared `signState`/`verifyState` from `src/gateway/lib/oauth-state.ts`
- Token storage: `TenantSecretRepository` (AES-256-GCM encrypted) + `TenantIntegrationRepository`
- GitHub token pattern: internal endpoint `POST /internal/tasks/:taskId/github-token` with `X-Task-ID` auth
- Google access tokens expire in 1 hour; refresh tokens are permanent unless revoked/unused 6 months
- `prompt: 'consent'` + `access_type: 'offline'` required for refresh tokens
- `googleapis` npm package bundles auth library + typed API clients
- Shell tools should use raw `fetch()` against Google REST APIs (not `googleapis` package)
- Granular permissions: users can deny individual scopes at consent screen

### Metis Review

**Identified Gaps** (all addressed):

- Store `google_token_expiry` as a 4th secret (without it, proactive refresh never fires) → **Added**
- Store `google_granted_scopes` as a 5th secret for scope checking → **Added**
- Use Google `sub` (permanent user ID) as `external_id`, not email (emails change) → **Fixed**
- Internal token endpoint must handle refresh and persist back to DB → **Designed into token manager**
- GCP Testing mode = 7-day token death → **GCP guide includes Production mode publish step**
- Multi-process token refresh race → **Accepted (same as GitHub), documented**
- `tokens` event must merge, never overwrite `refresh_token` → **Explicit guardrail**
- Archetype needs a specific E2E test scenario → **"List 3 most recent unread emails"**
- Shell tools must NOT import `googleapis` → **Use raw fetch, gateway-only dependency**

---

## Work Objectives

### Core Objective

Enable AI employees to interact with Google Workspace services (Gmail, Docs, Sheets, Slides, Drive, Calendar) via a per-tenant OAuth 2.0 connection, with a complete set of shell tools and a ready-to-use assistant archetype.

### Concrete Deliverables

- `src/gateway/routes/google-oauth.ts` — OAuth install + callback routes
- `src/gateway/services/google-token-manager.ts` — Token refresh with in-memory cache
- `src/gateway/routes/internal-google-token.ts` — Worker container token endpoint
- `src/gateway/routes/admin-google.ts` — Disconnect endpoint
- `src/worker-tools/google/*.ts` — 18 shell tools
- `dashboard/src/panels/integrations/IntegrationsPage.tsx` — Google integration card
- `prisma/seed.ts` — Google Assistant archetype seed
- `docs/guides/2026-06-03-HHMM-google-cloud-setup.md` — GCP setup instructions
- `docs/employees/2026-06-03-HHMM-google-assistant.md` — Employee operational doc

### Definition of Done

- [ ] Google OAuth connect flow works end-to-end (install → consent → callback → secrets stored)
- [ ] Google OAuth disconnect flow works (admin API → secrets + integration cleared)
- [ ] Internal token endpoint returns fresh access tokens for executing tasks
- [ ] All 18 shell tools execute with `--help`, return JSON on success, exit 1 on missing env
- [ ] Dashboard shows Connected/Disconnected state for Google
- [ ] Google Assistant archetype can be triggered and reaches at least Executing state
- [ ] All tests pass (`pnpm test -- --run` + `pnpm build`)

### Must Have

- OAuth routes using `signState`/`verifyState` from `src/gateway/lib/oauth-state.ts`
- `prompt: 'consent'` AND `access_type: 'offline'` in every authorization URL
- 5 tenant secrets stored: `google_access_token`, `google_refresh_token`, `google_token_expiry`, `google_user_email`, `google_granted_scopes`
- Google user's `sub` (permanent numeric ID) as `external_id` in `tenant_integrations`
- Internal token endpoint at `POST /internal/tasks/:taskId/google-token` with `X-Task-ID` auth
- Token manager that refreshes expired tokens and persists new tokens back to `tenant_secrets`
- `forceRefreshOnFailure: true` on OAuth2Client instances
- Structured error codes from internal token endpoint: `google_not_connected` (404), `google_reauth_required` (401), `google_workspace_session_expired` (401)
- Shell tools use raw `fetch()` against Google REST APIs (not `googleapis` package import)
- Each shell tool supports `--help`, outputs JSON to stdout, errors to stderr with exit 1
- GCP setup guide includes step to publish app to **Production mode**
- `approval_required: true` on the Google Assistant archetype

### Must NOT Have (Guardrails)

- NO `googleapis` import in `src/worker-tools/` — shell tools use raw `fetch()` only
- NO Google-specific language in shared files (`employee-lifecycle.ts`, `opencode-harness.mts`, `agents-md-compiler.mts`)
- NO incremental authorization — request all scopes at install time
- NO token refresh UI in dashboard — reconnect via install URL is sufficient
- NO overwriting `google_refresh_token` in the `tokens` event handler — always merge
- NO hardcoded Google credentials in source code — all in `.env` / `tenant_secrets`
- NO `as any` type casts in new TypeScript files
- NO changes to existing OAuth routes (Slack, GitHub, Notion, Jira)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests after — google-token-manager.ts unit tests)
- **Framework**: Vitest

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **OAuth routes**: curl for redirects + psql for stored secrets + Playwright for dashboard state
- **Token manager**: Vitest unit tests (cache hit/miss, refresh, invalid_grant)
- **Shell tools**: `tsx tool.ts --help` (exit 0) + `tsx tool.ts [args]` without env (exit 1) + with valid token (JSON output)
- **E2E**: Trigger archetype → monitor lifecycle → verify output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: Install googleapis + google-auth-library npm packages [quick]
├── Task 2: Add env vars to .env.example + .env [quick]
├── Task 3: Google token manager service [deep]
└── Task 4: GCP setup guide documentation [writing]

Wave 2 (OAuth + Gateway — after Wave 1):
├── Task 5: Google OAuth routes (install + callback) [unspecified-high]
├── Task 6: Register Google OAuth routes in server.ts [quick]
├── Task 7: Internal Google token endpoint for workers [unspecified-high]
├── Task 8: Admin Google disconnect endpoint [quick]
├── Task 9: Dashboard Google integration card [visual-engineering]
└── Task 10: Token manager unit tests [quick]

Wave 3 (Shell Tools — after Wave 2, all parallel):
├── Task 11: Google validate-env tool + shared fetch helper [quick]
├── Task 12: Gmail tools (list-emails, get-email, send-email) [unspecified-high]
├── Task 13: Google Drive tools (list-files, get-file, upload-file, delete-file) [unspecified-high]
├── Task 14: Google Docs tools (list-documents, get-document, create-document) [unspecified-high]
├── Task 15: Google Sheets tools (list-spreadsheets, get-sheet-data, update-sheet-data) [unspecified-high]
├── Task 16: Google Slides tools (list-presentations, get-presentation) [quick]
└── Task 17: Google Calendar tools (list-events, create-event, update-event) [unspecified-high]

Wave 4 (Integration — after Wave 3):
├── Task 18: Google Assistant archetype seed + employee doc [unspecified-high]
├── Task 19: Update AGENTS.md + README.md + tool-usage-reference skill [quick]
├── Task 20: Docker image rebuild [quick]
└── Task 21: E2E: Connect Google + trigger assistant + verify [unspecified-high]

Wave 5 (Notification):
└── Task 22: Notify completion [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On       | Blocks         |
| ---- | ---------------- | -------------- |
| 1    | —                | 3, 5, 7, 10-17 |
| 2    | —                | 5, 7, 8        |
| 3    | 1                | 5, 7, 10       |
| 4    | —                | 21             |
| 5    | 2, 3             | 6, 9, 21       |
| 6    | 5                | 7, 8, 21       |
| 7    | 3, 6             | 11-17, 21      |
| 8    | 6                | 9, 21          |
| 9    | 5, 8             | 21             |
| 10   | 3                | 21             |
| 11   | 7                | 12-17          |
| 12   | 11               | 18, 21         |
| 13   | 11               | 18, 21         |
| 14   | 11               | 18, 21         |
| 15   | 11               | 18, 21         |
| 16   | 11               | 18, 21         |
| 17   | 11               | 18, 21         |
| 18   | 12-17            | 20, 21         |
| 19   | 12-17            | 21             |
| 20   | 18               | 21             |
| 21   | 4, 9, 18, 19, 20 | 22, F1-F4      |
| 22   | F1-F4            | —              |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 `quick`, T2 `quick`, T3 `deep`, T4 `writing`
- **Wave 2**: **6 tasks** — T5 `unspecified-high`, T6 `quick`, T7 `unspecified-high`, T8 `quick`, T9 `visual-engineering`, T10 `quick`
- **Wave 3**: **7 tasks** — T11 `quick`, T12-T15 `unspecified-high`, T16 `quick`, T17 `unspecified-high`
- **Wave 4**: **4 tasks** — T18 `unspecified-high`, T19 `quick`, T20 `quick`, T21 `unspecified-high`
- **Wave 5**: **1 task** — T22 `quick`
- **FINAL**: **4 tasks** — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Install `googleapis` and `google-auth-library` npm packages

  **What to do**:
  - Run `pnpm add googleapis google-auth-library` in the project root
  - Verify packages are added to `package.json` dependencies
  - Run `pnpm build` to ensure no TypeScript conflicts

  **Must NOT do**:
  - Do NOT add these packages to `devDependencies` — they're runtime dependencies
  - Do NOT modify any existing imports

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 3, 5, 7, 10-17
  - **Blocked By**: None

  **References**:
  - `package.json` — existing dependencies list

  **Acceptance Criteria**:
  - [ ] `googleapis` appears in `package.json` dependencies
  - [ ] `google-auth-library` appears in `package.json` dependencies
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Packages installed and build succeeds
    Tool: Bash
    Steps:
      1. Run `cat package.json | jq '.dependencies["googleapis"]'` → non-null
      2. Run `cat package.json | jq '.dependencies["google-auth-library"]'` → non-null
      3. Run `pnpm build` → exit code 0
    Expected Result: Both packages present, build passes
    Evidence: .sisyphus/evidence/task-1-npm-install.txt
  ```

  **Commit**: YES (groups with T2)
  - Message: `chore: add googleapis dependency and Google env vars`
  - Files: `package.json`, `pnpm-lock.yaml`

- [x] 2. Add Google env vars to `.env.example` and `.env`

  **What to do**:
  - Add the following env vars to `.env.example` in a new **"Google Integration"** section between **"GitHub"** (section 8) and **"Slack Integration"** (section 9):
    ```
    # ── Google Integration ──────────────────────────────
    GOOGLE_CLIENT_ID=           # OAuth 2.0 client ID from Google Cloud Console
    GOOGLE_CLIENT_SECRET=       # OAuth 2.0 client secret from Google Cloud Console
    GOOGLE_REDIRECT_BASE_URL=http://localhost:7700   # Base URL for OAuth callback (production: https://your-domain.com)
    ```
  - Add the same vars to `.env` with placeholder values (user will fill in after GCP setup)
  - Follow the section ordering convention documented in README.md

  **Must NOT do**:
  - Do NOT add Google tokens to `.env` — those go in `tenant_secrets` DB table
  - Do NOT change existing env var sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 7, 8
  - **Blocked By**: None

  **References**:
  - `.env.example` — existing structure with section ordering
  - `README.md` § "Environment File Conventions" — section order rules

  **Acceptance Criteria**:
  - [ ] `GOOGLE_CLIENT_ID` in `.env.example` with description comment
  - [ ] `GOOGLE_CLIENT_SECRET` in `.env.example` with description comment
  - [ ] `GOOGLE_REDIRECT_BASE_URL` in `.env.example` with default `http://localhost:7700`
  - [ ] Same 3 vars present in `.env`
  - [ ] Section positioned between GitHub and Slack

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Env vars are correctly placed
    Tool: Bash (grep)
    Steps:
      1. grep -n "GOOGLE_CLIENT_ID" .env.example → line exists
      2. grep -n "GOOGLE_CLIENT_SECRET" .env.example → line exists
      3. grep -n "GOOGLE_REDIRECT_BASE_URL" .env.example → line exists
    Expected Result: All 3 vars present in .env.example
    Evidence: .sisyphus/evidence/task-2-env-vars.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: `chore: add googleapis dependency and Google env vars`
  - Files: `.env.example`

- [x] 3. Google token manager service

  **What to do**:
  - Create `src/gateway/services/google-token-manager.ts` following the `github-token-manager.ts` pattern (pure functions, module-level Map cache)
  - The service must:
    1. Create an `OAuth2Client` instance from `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars
    2. Accept a tenant ID → fetch `google_refresh_token`, `google_access_token`, `google_token_expiry` from `tenant_secrets`
    3. Check if the access token is expired (compare `google_token_expiry` against `Date.now()` with 5-minute buffer)
    4. If expired: use `OAuth2Client.refreshAccessToken()` to get a new token
    5. Persist the new `google_access_token` and `google_token_expiry` back to `tenant_secrets` (MERGE — never overwrite `google_refresh_token`)
    6. Cache the result in a module-level `Map<tenantId, CachedGoogleToken>` with 50-minute TTL (10-minute buffer from 1-hour expiry)
    7. Return `{ token: string, expires_at: string, granted_scopes: string }`
  - Handle error cases:
    - No secrets found → throw `GoogleNotConnectedError`
    - `invalid_grant` → throw `GoogleReauthRequiredError`
    - `invalid_rapt` → throw `GoogleWorkspaceSessionExpiredError`
  - Export: `getGoogleAccessToken(tenantId: string, prisma: PrismaClient): Promise<GoogleTokenResult>`
  - Export custom error classes for use by the internal endpoint
  - Use `forceRefreshOnFailure: true` on OAuth2Client

  **Must NOT do**:
  - Do NOT use `googleapis` package for API calls here — only use `google-auth-library` OAuth2Client
  - Do NOT share OAuth2Client instances across tenants — one per tenant in cache
  - Do NOT overwrite `google_refresh_token` during refresh (Google doesn't return a new refresh token on refresh)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex token lifecycle management with caching, refresh, error handling, and DB persistence
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 7, 10
  - **Blocked By**: Task 1 (googleapis npm package)

  **References**:
  - `src/gateway/services/github-token-manager.ts` — Cache structure pattern, module-level Map, TTL approach. Copy the cache pattern but replace JWT generation with OAuth2 refresh.
  - `src/gateway/services/tenant-secret-repository.ts` — How to read/write encrypted secrets. Use `TenantSecretRepository.get()` and `.set()`.
  - `src/lib/encryption.ts` — Underlying encryption primitives (used by TenantSecretRepository, no direct use needed).
  - `google-auth-library` npm docs — `OAuth2Client`, `refreshAccessToken()`, `forceRefreshOnFailure` option.

  **Acceptance Criteria**:
  - [ ] File exists at `src/gateway/services/google-token-manager.ts`
  - [ ] Exports `getGoogleAccessToken(tenantId, prisma)` function
  - [ ] Exports `GoogleNotConnectedError`, `GoogleReauthRequiredError`, `GoogleWorkspaceSessionExpiredError`
  - [ ] Caches tokens with 50-minute TTL
  - [ ] Persists refreshed tokens back to `tenant_secrets`
  - [ ] Never overwrites `google_refresh_token` during refresh
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Token manager compiles and exports expected symbols
    Tool: Bash
    Steps:
      1. Run `pnpm build` → exit code 0
      2. Run `node -e "const m = require('./dist/gateway/services/google-token-manager.js'); console.log(typeof m.getGoogleAccessToken, typeof m.GoogleNotConnectedError)"` → "function function"
    Expected Result: Module exports the expected function and error class
    Evidence: .sisyphus/evidence/task-3-token-manager.txt

  Scenario: Token manager handles missing secrets
    Tool: Bash
    Steps:
      1. Run unit test (Task 10) that verifies GoogleNotConnectedError is thrown when no secrets exist
    Expected Result: Error thrown with correct class
    Evidence: .sisyphus/evidence/task-3-missing-secrets.txt
  ```

  **Commit**: YES
  - Message: `feat(google): add token manager service with refresh and caching`
  - Files: `src/gateway/services/google-token-manager.ts`

- [x] 4. GCP setup guide documentation

  **What to do**:
  - Create `docs/guides/2026-06-03-HHMM-google-cloud-setup.md` (run `date "+%Y-%m-%d-%H%M"` for exact timestamp)
  - Include step-by-step instructions:
    1. Create or select a GCP project at `console.cloud.google.com`
    2. Enable APIs: Gmail API, Google Drive API, Google Docs API, Google Sheets API, Google Slides API, Google Calendar API
    3. Configure OAuth Consent Screen: External audience, app name, support email, scopes (list all 8 scope URIs)
    4. **CRITICAL**: Publish app to Production mode (Testing mode = 7-day token death)
    5. Create OAuth 2.0 credentials: Web application, redirect URI `http://localhost:7700/integrations/google/callback` (dev) and production URL
    6. Copy Client ID and Client Secret to `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
    7. Note: 100-user cap until Google verifies the app
    8. Note: RESTRICTED scopes (gmail.modify, drive) require a security assessment for production with external users
  - Use plain, non-technical language where possible (per convention: end users are non-technical)

  **Must NOT do**:
  - Do NOT include actual credentials or API keys in the guide
  - Do NOT create the GCP project yourself — this is a user-facing guide

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 21 (E2E — user must complete GCP setup before E2E)
  - **Blocked By**: None

  **References**:
  - `docs/guides/2026-06-02-1727-github-integration.md` — Similar integration setup guide pattern
  - Google OAuth2 web server guide: `https://developers.google.com/identity/protocols/oauth2/web-server`
  - Google OAuth scopes reference: `https://developers.google.com/identity/protocols/oauth2/scopes`

  **Acceptance Criteria**:
  - [ ] Guide file exists in `docs/guides/`
  - [ ] All 6 APIs listed with enable instructions
  - [ ] OAuth consent screen configuration documented
  - [ ] **Production mode publish step** explicitly included
  - [ ] Redirect URI for both dev and production documented
  - [ ] 100-user cap and RESTRICTED scope notes included

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Guide exists and has all critical sections
    Tool: Bash (grep)
    Steps:
      1. grep -c "Production" docs/guides/2026-06-03-*-google-cloud-setup.md → at least 1
      2. grep -c "gmail.modify" docs/guides/2026-06-03-*-google-cloud-setup.md → at least 1
      3. grep -c "GOOGLE_CLIENT_ID" docs/guides/2026-06-03-*-google-cloud-setup.md → at least 1
    Expected Result: All critical terms present
    Evidence: .sisyphus/evidence/task-4-gcp-guide.txt
  ```

  **Commit**: YES
  - Message: `docs: add Google Cloud Platform setup guide`
  - Files: `docs/guides/2026-06-03-*-google-cloud-setup.md`

- [x] 5. Google OAuth routes (install + callback)

  **What to do**:
  - Create `src/gateway/routes/google-oauth.ts` following the `notion-oauth.ts` pattern exactly
  - Factory function: `googleOAuthRoutes(opts: { prisma?: PrismaClient }): Router`
  - Instantiate repos inside factory: `TenantRepository`, `TenantSecretRepository`, `TenantIntegrationRepository`
  - **Install route** `GET /google/install?tenant=<slug>`:
    1. Look up tenant by slug via `tenantRepo.findBySlug(slug)`
    2. Generate 16-byte random nonce: `crypto.randomBytes(16).toString('hex')`
    3. Sign state: `signState({ tenant_id: tenant.id, nonce }, process.env.ENCRYPTION_KEY!)`
    4. Build Google authorization URL:
       ```
       https://accounts.google.com/o/oauth2/v2/auth
       ?client_id=GOOGLE_CLIENT_ID
       &redirect_uri=GOOGLE_REDIRECT_BASE_URL/integrations/google/callback
       &response_type=code
       &scope=<all 8 scopes space-separated>
       &access_type=offline
       &prompt=consent
       &include_granted_scopes=true
       &state=<signed_state>
       ```
    5. Redirect (302)
  - **Callback route** `GET /google/callback?code=...&state=...&error=...`:
    1. Handle `error` query param (user denied) → redirect to dashboard with error
    2. Verify HMAC state: `verifyState(state, process.env.ENCRYPTION_KEY!)` → extract `tenant_id`
    3. Exchange code for tokens: POST to `https://oauth2.googleapis.com/token` with `client_id`, `client_secret`, `code`, `redirect_uri`, `grant_type=authorization_code`
    4. Fetch userinfo: GET `https://www.googleapis.com/oauth2/v3/userinfo` with `Authorization: Bearer <access_token>` → get `sub` and `email`
    5. Conflict check: `integrationRepo.findByExternalId('google', sub)` — if different tenant owns this Google account, return 409
    6. Store 5 secrets:
       - `secretRepo.set(tenantId, 'google_access_token', tokens.access_token)`
       - `secretRepo.set(tenantId, 'google_refresh_token', tokens.refresh_token)`
       - `secretRepo.set(tenantId, 'google_token_expiry', String(tokens.expiry_date || Date.now() + tokens.expires_in * 1000))`
       - `secretRepo.set(tenantId, 'google_user_email', email)`
       - `secretRepo.set(tenantId, 'google_granted_scopes', tokens.scope)`
    7. Upsert integration: `integrationRepo.upsert(tenantId, 'google', { external_id: sub })`
    8. Redirect to `/dashboard/integrations?tenant=${tenantId}&connected=google`
  - All scopes (8 total):
    ```
    https://www.googleapis.com/auth/gmail.modify
    https://www.googleapis.com/auth/drive
    https://www.googleapis.com/auth/documents
    https://www.googleapis.com/auth/spreadsheets
    https://www.googleapis.com/auth/presentations
    https://www.googleapis.com/auth/calendar
    https://www.googleapis.com/auth/userinfo.email
    https://www.googleapis.com/auth/userinfo.profile
    ```

  **Must NOT do**:
  - Do NOT use `googleapis` package for the token exchange — use raw `fetch()` against Google's token endpoint (matches Notion/Jira pattern)
  - Do NOT skip the HMAC state verification
  - Do NOT skip the conflict check
  - Do NOT store tokens without `prompt: 'consent'` in the auth URL (no refresh token without it)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step OAuth flow with security-critical HMAC verification, token exchange, and DB writes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs T1, T2, T3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 9, 21
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `src/gateway/routes/notion-oauth.ts` — **Primary template**. Copy this file and adapt: replace `NOTION_*` env vars with `GOOGLE_*`, replace Notion token endpoint with Google's, add userinfo fetch step after token exchange.
  - `src/gateway/routes/jira-oauth.ts` — Secondary reference: shows the post-auth resource fetch pattern (accessible-resources) similar to our userinfo fetch.
  - `src/gateway/lib/oauth-state.ts` — `signState()` and `verifyState()` — import and use directly, no modifications.
  - `src/gateway/services/tenant-secret-repository.ts` — `.set(tenantId, key, value)` for encrypted storage.
  - `src/gateway/services/tenant-integration-repository.ts` — `.upsert()` and `.findByExternalId()` for conflict detection.
  - Google token endpoint: `https://oauth2.googleapis.com/token`
  - Google userinfo endpoint: `https://www.googleapis.com/oauth2/v3/userinfo`

  **Acceptance Criteria**:
  - [ ] File exists at `src/gateway/routes/google-oauth.ts`
  - [ ] Exports `googleOAuthRoutes` factory function
  - [ ] Install route generates auth URL with all 8 scopes, `prompt=consent`, `access_type=offline`
  - [ ] Callback exchanges code, fetches userinfo, stores 5 secrets, upserts integration
  - [ ] Uses `sub` as `external_id` (not email)
  - [ ] HMAC state verified in callback
  - [ ] Conflict check prevents same Google account on two tenants
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Install route returns 302 redirect to Google
    Tool: Bash (curl)
    Preconditions: GOOGLE_CLIENT_ID set in .env
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}\n%{redirect_url}" "http://localhost:7700/integrations/google/install?tenant=vlre"
    Expected Result: HTTP 302, redirect URL starts with "https://accounts.google.com/o/oauth2/v2/auth"
    Evidence: .sisyphus/evidence/task-5-install-redirect.txt

  Scenario: Install route returns 404 for unknown tenant
    Tool: Bash (curl)
    Steps:
      1. curl -s "http://localhost:7700/integrations/google/install?tenant=nonexistent"
    Expected Result: HTTP 404 or 400
    Evidence: .sisyphus/evidence/task-5-install-bad-tenant.txt
  ```

  **Commit**: YES (groups with T6)
  - Message: `feat(google): add OAuth install and callback routes`
  - Files: `src/gateway/routes/google-oauth.ts`

- [x] 6. Register Google OAuth routes in server.ts

  **What to do**:
  - Import `googleOAuthRoutes` in `src/gateway/server.ts`
  - Add `app.use('/integrations', googleOAuthRoutes({ prisma }))` alongside the existing integration routes (~line 211)
  - Place it after the existing integration routes (Jira, Notion, GitHub)

  **Must NOT do**:
  - Do NOT modify existing route registrations
  - Do NOT add middleware specific to Google routes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T5)
  - **Blocks**: Tasks 7, 8, 21
  - **Blocked By**: Task 5

  **References**:
  - `src/gateway/server.ts:208-212` — Existing integration route registration block

  **Acceptance Criteria**:
  - [ ] `googleOAuthRoutes` imported in server.ts
  - [ ] Route registered with `/integrations` prefix
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Route is accessible after registration
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" "http://localhost:7700/integrations/google/install?tenant=vlre"
    Expected Result: HTTP 302 (not 404)
    Evidence: .sisyphus/evidence/task-6-route-registered.txt
  ```

  **Commit**: YES (groups with T5)
  - Message: `feat(google): add OAuth install and callback routes`
  - Files: `src/gateway/server.ts`

- [x] 7. Internal Google token endpoint for worker containers

  **What to do**:
  - Create `src/gateway/routes/internal-google-token.ts` following `src/gateway/routes/internal-github-token.ts` pattern
  - Factory: `internalGoogleTokenRoutes(opts: { prisma?: PrismaClient }): Router`
  - Route: `POST /tasks/:taskId/google-token`
  - Auth: `X-Task-ID` header must match `:taskId` URL param
  - Flow:
    1. Validate `X-Task-ID` matches URL param
    2. Fetch task from DB — must exist and be in `Executing` or `Delivering` state (403 otherwise)
    3. Call `getGoogleAccessToken(task.tenant_id, prisma)` from `google-token-manager.ts`
    4. Return `{ token, expires_at, granted_scopes }`
  - Error responses:
    - `GoogleNotConnectedError` → HTTP 404 `{ error: 'google_not_connected', message: 'Google is not connected for this tenant. Ask the admin to connect Google in the dashboard.' }`
    - `GoogleReauthRequiredError` → HTTP 401 `{ error: 'google_reauth_required', message: 'Google authorization has expired or been revoked. Ask the admin to reconnect Google.' }`
    - `GoogleWorkspaceSessionExpiredError` → HTTP 401 `{ error: 'google_workspace_session_expired', message: 'Google Workspace session policy requires re-authentication.' }`
  - Register in `server.ts`: `app.use('/internal', internalGoogleTokenRoutes({ prisma }))`

  **Must NOT do**:
  - Do NOT expose this endpoint without task ID validation
  - Do NOT allow requests from tasks not in Executing or Delivering state

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-critical endpoint with multiple error handling paths
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs T3, T6)
  - **Parallel Group**: Wave 2 (after T6)
  - **Blocks**: Tasks 11-17, 21
  - **Blocked By**: Tasks 3, 6

  **References**:
  - `src/gateway/routes/internal-github-token.ts` — **Primary template**. Copy and adapt: replace `generateInstallationToken` with `getGoogleAccessToken`, add structured error handling for the 3 Google-specific error classes.
  - `src/gateway/services/google-token-manager.ts` — The service this endpoint calls. Import `getGoogleAccessToken` and the error classes.

  **Acceptance Criteria**:
  - [ ] File exists at `src/gateway/routes/internal-google-token.ts`
  - [ ] Validates X-Task-ID header matches URL param
  - [ ] Only allows Executing or Delivering tasks
  - [ ] Returns structured error codes (404, 401) for each error type
  - [ ] Route registered in server.ts under `/internal` prefix
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Token endpoint rejects without X-Task-ID header
    Tool: Bash (curl)
    Steps:
      1. curl -s -w "%{http_code}" -X POST "http://localhost:7700/internal/tasks/fake-id/google-token"
    Expected Result: HTTP 401 or 403
    Evidence: .sisyphus/evidence/task-7-no-header.txt

  Scenario: Token endpoint rejects non-Executing task
    Tool: Bash (curl + psql)
    Steps:
      1. Find a task in Done state: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT id FROM tasks WHERE status='Done' LIMIT 1;"
      2. curl -s -w "%{http_code}" -X POST "http://localhost:7700/internal/tasks/$TASK_ID/google-token" -H "X-Task-ID: $TASK_ID"
    Expected Result: HTTP 403
    Evidence: .sisyphus/evidence/task-7-wrong-state.txt
  ```

  **Commit**: YES
  - Message: `feat(google): add internal token endpoint for worker containers`
  - Files: `src/gateway/routes/internal-google-token.ts`, `src/gateway/server.ts`

- [x] 8. Admin Google disconnect endpoint

  **What to do**:
  - Create `src/gateway/routes/admin-google.ts` following `src/gateway/routes/admin-github.ts` pattern
  - Factory: `adminGoogleRoutes(opts: { prisma?: PrismaClient }): Router`
  - Route: `DELETE /admin/tenants/:tenantId/integrations/google`
  - Auth: `requireAdminKey` middleware
  - Flow:
    1. Validate tenant ID
    2. Delete all `google_*` secrets: `secretRepo.deleteByPrefix(tenantId, 'google_')` or delete each key individually (`google_access_token`, `google_refresh_token`, `google_token_expiry`, `google_user_email`, `google_granted_scopes`)
    3. Soft-delete integration: `integrationRepo.delete(tenantId, 'google')`
    4. Clear any cached tokens from the token manager
    5. Return `{ disconnected: true }`
  - Register in `server.ts`: `app.use(adminGoogleRoutes({ prisma }))` (no prefix — admin routes define full paths internally)

  **Must NOT do**:
  - Do NOT hard-delete the `tenant_integrations` record — use soft-delete (set `deleted_at`)
  - Do NOT remove the `requireAdminKey` middleware

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple route with admin auth, DB deletes, return JSON
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7, T9 in Wave 2)
  - **Parallel Group**: Wave 2 (after T6)
  - **Blocks**: Tasks 9, 21
  - **Blocked By**: Task 6

  **References**:
  - `src/gateway/routes/admin-github.ts` — **Primary template**. Copy disconnect pattern.
  - `src/gateway/middleware/admin-auth.ts` — `requireAdminKey` middleware import.
  - `src/gateway/services/tenant-secret-repository.ts` — Secret deletion methods.

  **Acceptance Criteria**:
  - [ ] File exists at `src/gateway/routes/admin-google.ts`
  - [ ] Requires `X-Admin-Key` header
  - [ ] Deletes all 5 `google_*` secrets
  - [ ] Soft-deletes `tenant_integrations` record
  - [ ] Returns `{ disconnected: true }`
  - [ ] Route registered in server.ts

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Disconnect endpoint requires admin key
    Tool: Bash (curl)
    Steps:
      1. curl -s -w "%{http_code}" -X DELETE "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/integrations/google"
    Expected Result: HTTP 401 (no admin key)
    Evidence: .sisyphus/evidence/task-8-no-auth.txt
  ```

  **Commit**: YES
  - Message: `feat(google): add admin disconnect endpoint`
  - Files: `src/gateway/routes/admin-google.ts`, `src/gateway/server.ts`

- [x] 9. Dashboard Google integration card

  **What to do**:
  - Edit `dashboard/src/panels/integrations/IntegrationsPage.tsx`:
    - Add a new `<IntegrationRow>` for Google inside the existing integration list `<div className="space-y-4">`
    - Props:
      ```tsx
      <IntegrationRow
        name="Google"
        description="Connect Google to let AI employees access Gmail, Drive, Docs, Sheets, Slides, and Calendar."
        integration={integrations?.find((i) => i.provider === 'google') ?? null}
        connectHref={
          tenant?.slug
            ? `${GATEWAY_URL}/integrations/google/install?tenant=${tenant.slug}`
            : undefined
        }
        connectLabel="Connect Google"
      />
      ```
    - If `IntegrationRow` already has a disconnect callback pattern (like `GitHubIntegrationRow`), add a disconnect button that calls `disconnectGoogle(tenantId)`
  - Edit `dashboard/src/lib/gateway.ts`:
    - Add `disconnectGoogle(tenantId: string)` function that calls `DELETE /admin/tenants/${tenantId}/integrations/google`

  **Must NOT do**:
  - Do NOT create a new page — Google goes in the existing integrations page
  - Do NOT modify the `IntegrationRow` component itself
  - Do NOT add Google-specific styling

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI modification following existing component patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7, T8 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 5, 8

  **References**:
  - `dashboard/src/panels/integrations/IntegrationsPage.tsx` — Existing integration card list. Add Google row here.
  - `dashboard/src/lib/gateway.ts` — Gateway client functions. Add `disconnectGoogle` here.
  - The existing GitHub disconnect flow in the same file — pattern for disconnect button + API call.

  **Acceptance Criteria**:
  - [ ] Google integration row visible in dashboard at `/dashboard/integrations?tenant=<id>`
  - [ ] Connect button links to `/integrations/google/install?tenant=<slug>`
  - [ ] `disconnectGoogle` function added to `gateway.ts`
  - [ ] Dashboard builds: `pnpm dashboard:build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Google card visible in dashboard
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003
      2. Assert element containing text "Google" exists on page
      3. Assert element containing text "Connect Google" or "Connected" exists
    Expected Result: Google integration row is visible
    Evidence: .sisyphus/evidence/task-9-dashboard-card.png

  Scenario: Dashboard builds without errors
    Tool: Bash
    Steps:
      1. Run `pnpm dashboard:build`
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-9-dashboard-build.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add Google integration card`
  - Files: `dashboard/src/panels/integrations/IntegrationsPage.tsx`, `dashboard/src/lib/gateway.ts`

- [x] 10. Token manager unit tests

  **What to do**:
  - Create `src/gateway/services/__tests__/google-token-manager.test.ts`
  - Test cases:
    1. `getGoogleAccessToken` throws `GoogleNotConnectedError` when no secrets exist
    2. `getGoogleAccessToken` returns cached token on second call (cache hit)
    3. Cache misses after TTL expires
    4. Refreshed tokens are persisted back to `tenant_secrets` (mock TenantSecretRepository.set)
    5. `invalid_grant` response throws `GoogleReauthRequiredError`
  - Mock: `TenantSecretRepository`, `OAuth2Client.refreshAccessToken()`, `fetch` for Google token endpoint
  - Use Vitest `vi.mock()` and `vi.spyOn()`

  **Must NOT do**:
  - Do NOT make real HTTP calls to Google APIs in tests
  - Do NOT use real database in tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard Vitest unit tests with mocks
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5-T9 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 21
  - **Blocked By**: Task 3

  **References**:
  - `src/gateway/services/google-token-manager.ts` — The module under test
  - `src/workers/__tests__/opencode-harness-prompt.test.ts` — Example Vitest test pattern in this codebase

  **Acceptance Criteria**:
  - [ ] Test file exists
  - [ ] All 5 test cases pass
  - [ ] `pnpm test -- --run src/gateway/services/__tests__/google-token-manager.test.ts` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All token manager tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run src/gateway/services/__tests__/google-token-manager.test.ts`
    Expected Result: 5 tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-10-token-tests.txt
  ```

  **Commit**: YES
  - Message: `test(google): add token manager unit tests`
  - Files: `src/gateway/services/__tests__/google-token-manager.test.ts`

- [x] 11. Google validate-env tool + shared fetch helper

  **What to do**:
  - Create `src/worker-tools/google/validate-env.ts` — validates `GOOGLE_ACCESS_TOKEN` is set, exits 0 with `{ valid: true }` or exits 1 with descriptive stderr
  - Create `src/worker-tools/google/lib/google-fetch.ts` — shared helper for all Google tools:
    - `googleFetch(url: string, opts?: RequestInit): Promise<Response>` — wraps `fetch()` with:
      - `Authorization: Bearer ${process.env['GOOGLE_ACCESS_TOKEN']}` header
      - Content-Type: `application/json`
      - Error handling: on 401 → stderr "Access token expired or invalid. Re-run validate-env or reconnect Google.", exit 1
      - On 403 → stderr "Insufficient permissions. Check granted scopes.", exit 1
    - `requireEnv(name: string): string` — reads env var, exits 1 with descriptive error if missing
  - Create `src/worker-tools/google/fixtures/` directory for future mock support

  **Must NOT do**:
  - Do NOT import `googleapis` — use raw `fetch()` only
  - Do NOT duplicate env var checking in every tool — use the shared `requireEnv()` helper

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers file structure, CLI pattern, TypeScript conventions for new shell tools

  **Parallelization**:
  - **Can Run In Parallel**: NO (first shell tool, foundation for others)
  - **Parallel Group**: Wave 3 (first)
  - **Blocks**: Tasks 12-17
  - **Blocked By**: Task 7

  **References**:
  - `src/worker-tools/hostfully/validate-env.ts` — Pattern for validate-env tool
  - `src/worker-tools/slack/post-message.ts` — Pattern for shell tool CLI structure
  - `src/worker-tools/hostfully/get-messages.ts` — Pattern for mock fixture support

  **Acceptance Criteria**:
  - [ ] `src/worker-tools/google/validate-env.ts` exists and supports `--help`
  - [ ] `src/worker-tools/google/lib/google-fetch.ts` exports `googleFetch` and `requireEnv`
  - [ ] `src/worker-tools/google/fixtures/` directory exists
  - [ ] `tsx src/worker-tools/google/validate-env.ts --help` exits 0

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: validate-env exits 1 without GOOGLE_ACCESS_TOKEN
    Tool: Bash
    Steps:
      1. unset GOOGLE_ACCESS_TOKEN && tsx src/worker-tools/google/validate-env.ts 2>&1; echo "Exit: $?"
    Expected Result: stderr contains "GOOGLE_ACCESS_TOKEN", Exit: 1
    Evidence: .sisyphus/evidence/task-11-validate-env.txt

  Scenario: validate-env --help exits 0
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/google/validate-env.ts --help; echo "Exit: $?"
    Expected Result: Exit: 0, stdout contains usage info
    Evidence: .sisyphus/evidence/task-11-help.txt
  ```

  **Commit**: YES
  - Message: `feat(google-tools): add validate-env and shared fetch helper`
  - Files: `src/worker-tools/google/validate-env.ts`, `src/worker-tools/google/lib/google-fetch.ts`

- [x] 12. Gmail tools (list-emails, get-email, send-email)

  **What to do**:
  - Create 3 Gmail shell tools in `src/worker-tools/google/`:
  - **`list-emails.ts`**: `--query <string>` (Gmail search query, default "is:unread"), `--max-results <number>` (default 10)
    - GET `https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}&maxResults={max}`
    - For each message ID, fetch minimal headers (subject, from, date, snippet) via batch or individual calls
    - Output: `{ messages: [{ id, subject, from, date, snippet }], resultSizeEstimate }`
  - **`get-email.ts`**: `--message-id <string>` (required)
    - GET `https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full`
    - Parse headers for subject, from, to, date; extract plain text body
    - Output: `{ id, subject, from, to, date, body, labels }`
  - **`send-email.ts`**: `--to <string>` (required), `--subject <string>` (required), `--body <string>` (required), `--cc <string>` (optional), `--bcc <string>` (optional)
    - POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
    - Body: base64url-encoded RFC 2822 message
    - Output: `{ id, threadId, labelIds }`

  **Must NOT do**:
  - Do NOT import `googleapis` — use `googleFetch` from `lib/google-fetch.ts`
  - Do NOT implement draft, label, or thread management tools

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 3 tools with Gmail-specific formatting (RFC 2822, base64url encoding)
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-17)
  - **Blocks**: Tasks 18, 21
  - **Blocked By**: Task 11

  **References**:
  - `src/worker-tools/google/lib/google-fetch.ts` — Shared fetch helper (from T11)
  - Gmail API reference: `https://developers.google.com/gmail/api/reference/rest`
  - `src/worker-tools/hostfully/get-messages.ts` — Pattern for paginated API tool

  **Acceptance Criteria**:
  - [ ] All 3 files exist in `src/worker-tools/google/`
  - [ ] Each supports `--help`
  - [ ] Each outputs JSON to stdout
  - [ ] Each exits 1 with descriptive stderr when GOOGLE_ACCESS_TOKEN is missing
  - [ ] `send-email.ts` correctly base64url-encodes RFC 2822 message

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: list-emails --help works
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/google/list-emails.ts --help; echo "Exit: $?"
    Expected Result: Exit: 0, stdout shows usage with --query and --max-results flags
    Evidence: .sisyphus/evidence/task-12-gmail-help.txt

  Scenario: send-email exits 1 without required args
    Tool: Bash
    Steps:
      1. GOOGLE_ACCESS_TOKEN=fake tsx src/worker-tools/google/send-email.ts 2>&1; echo "Exit: $?"
    Expected Result: stderr contains "--to is required", Exit: 1
    Evidence: .sisyphus/evidence/task-12-send-missing-args.txt
  ```

  **Commit**: YES
  - Message: `feat(google-tools): add Gmail tools (list, get, send)`
  - Files: `src/worker-tools/google/list-emails.ts`, `src/worker-tools/google/get-email.ts`, `src/worker-tools/google/send-email.ts`

- [x] 13. Google Drive tools (list-files, get-file, upload-file, delete-file)

  **What to do**:
  - Create 4 Drive shell tools in `src/worker-tools/google/`:
  - **`list-files.ts`**: `--query <string>` (Drive search query, optional), `--max-results <number>` (default 20), `--mime-type <string>` (optional filter)
    - GET `https://www.googleapis.com/drive/v3/files?q={query}&pageSize={max}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)`
    - Output: `{ files: [{ id, name, mimeType, modifiedTime, size, webViewLink }] }`
  - **`get-file.ts`**: `--file-id <string>` (required), `--download` (optional boolean, downloads content)
    - Metadata: GET `https://www.googleapis.com/drive/v3/files/{id}?fields=*`
    - Download: GET `https://www.googleapis.com/drive/v3/files/{id}?alt=media` (writes to stdout or `--output <path>`)
    - Output (metadata mode): `{ id, name, mimeType, size, webViewLink, modifiedTime, owners }`
  - **`upload-file.ts`**: `--file-path <string>` (required), `--name <string>` (optional, defaults to filename), `--folder-id <string>` (optional parent folder)
    - POST `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
    - Output: `{ id, name, mimeType, webViewLink }`
  - **`delete-file.ts`**: `--file-id <string>` (required), `--permanent` (optional, default: trash)
    - Trash: POST `https://www.googleapis.com/drive/v3/files/{id}/trash` (PATCH with `trashed: true`)
    - Permanent: DELETE `https://www.googleapis.com/drive/v3/files/{id}`
    - Output: `{ deleted: true, permanent: boolean }`

  **Must NOT do**:
  - Do NOT implement file sharing/permissions tools
  - Do NOT implement folder creation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 4 tools with multipart upload and download logic
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12, 14-17)
  - **Blocks**: Tasks 18, 21
  - **Blocked By**: Task 11

  **References**:
  - `src/worker-tools/google/lib/google-fetch.ts` — Shared fetch helper
  - Drive API v3: `https://developers.google.com/drive/api/reference/rest/v3`

  **Acceptance Criteria**:
  - [ ] All 4 files exist
  - [ ] Each supports `--help` and exits 1 on missing env/args

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: list-files --help works
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/google/list-files.ts --help; echo "Exit: $?"
    Expected Result: Exit: 0
    Evidence: .sisyphus/evidence/task-13-drive-help.txt
  ```

  **Commit**: YES
  - Message: `feat(google-tools): add Drive tools (list, get, upload, delete)`
  - Files: `src/worker-tools/google/list-files.ts`, `src/worker-tools/google/get-file.ts`, `src/worker-tools/google/upload-file.ts`, `src/worker-tools/google/delete-file.ts`

- [x] 14. Google Docs tools (list-documents, get-document, create-document)

  **What to do**:
  - **`list-documents.ts`**: `--max-results <number>` (default 20)
    - Uses Drive API filtered by mimeType: GET `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document'&pageSize={max}&fields=files(id,name,modifiedTime,webViewLink)`
    - Output: `{ documents: [{ id, name, modifiedTime, webViewLink }] }`
  - **`get-document.ts`**: `--document-id <string>` (required)
    - GET `https://docs.googleapis.com/v1/documents/{id}`
    - Extract plain text from document body (iterate `body.content[].paragraph.elements[].textRun.content`)
    - Output: `{ id, title, body_text, revisionId }`
  - **`create-document.ts`**: `--title <string>` (required), `--content <string>` (optional initial text)
    - POST `https://docs.googleapis.com/v1/documents` with `{ title }`
    - If `--content` provided, follow up with batch update to insert text
    - Output: `{ id, title, webViewLink }`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 18, 21
  - **Blocked By**: Task 11

  **References**:
  - Docs API: `https://developers.google.com/docs/api/reference/rest`

  **Acceptance Criteria**:
  - [ ] All 3 files exist
  - [ ] Each supports `--help`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: get-document --help works
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/google/get-document.ts --help; echo "Exit: $?"
    Expected Result: Exit: 0
    Evidence: .sisyphus/evidence/task-14-docs-help.txt
  ```

  **Commit**: YES
  - Message: `feat(google-tools): add Docs tools (list, get, create)`
  - Files: `src/worker-tools/google/list-documents.ts`, `src/worker-tools/google/get-document.ts`, `src/worker-tools/google/create-document.ts`

- [x] 15. Google Sheets tools (list-spreadsheets, get-sheet-data, update-sheet-data)

  **What to do**:
  - **`list-spreadsheets.ts`**: `--max-results <number>` (default 20)
    - Uses Drive API filtered by mimeType: `mimeType='application/vnd.google-apps.spreadsheet'`
    - Output: `{ spreadsheets: [{ id, name, modifiedTime, webViewLink }] }`
  - **`get-sheet-data.ts`**: `--spreadsheet-id <string>` (required), `--range <string>` (required, e.g. "Sheet1!A1:D10")
    - GET `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}`
    - Output: `{ spreadsheetId, range, values: string[][] }`
  - **`update-sheet-data.ts`**: `--spreadsheet-id <string>` (required), `--range <string>` (required), `--values <json-string>` (required, 2D array as JSON)
    - PUT `https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}?valueInputOption=USER_ENTERED`
    - Body: `{ values: JSON.parse(valuesArg) }`
    - Output: `{ updatedRange, updatedRows, updatedColumns, updatedCells }`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 18, 21
  - **Blocked By**: Task 11

  **References**:
  - Sheets API v4: `https://developers.google.com/sheets/api/reference/rest`

  **Acceptance Criteria**:
  - [ ] All 3 files exist
  - [ ] Each supports `--help`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: get-sheet-data --help works
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/google/get-sheet-data.ts --help; echo "Exit: $?"
    Expected Result: Exit: 0
    Evidence: .sisyphus/evidence/task-15-sheets-help.txt
  ```

  **Commit**: YES
  - Message: `feat(google-tools): add Sheets tools (list, get, update)`

- [x] 16. Google Slides tools (list-presentations, get-presentation)

  **What to do**:
  - **`list-presentations.ts`**: `--max-results <number>` (default 20)
    - Uses Drive API: `mimeType='application/vnd.google-apps.presentation'`
    - Output: `{ presentations: [{ id, name, modifiedTime, webViewLink }] }`
  - **`get-presentation.ts`**: `--presentation-id <string>` (required)
    - GET `https://slides.googleapis.com/v1/presentations/{id}`
    - Output: `{ id, title, slides_count, slides: [{ objectId, pageElements_count }] }`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Only 2 tools, simpler API
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 18, 21
  - **Blocked By**: Task 11

  **Acceptance Criteria**:
  - [ ] Both files exist and support `--help`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: list-presentations --help works
    Tool: Bash
    Steps:
      1. tsx src/worker-tools/google/list-presentations.ts --help; echo "Exit: $?"
    Expected Result: Exit: 0
    Evidence: .sisyphus/evidence/task-16-slides-help.txt
  ```

  **Commit**: YES
  - Message: `feat(google-tools): add Slides tools (list, get)`

- [x] 17. Google Calendar tools (list-events, create-event, update-event)

  **What to do**:
  - **`list-events.ts`**: `--calendar-id <string>` (default "primary"), `--max-results <number>` (default 10), `--time-min <string>` (ISO date, default now)
    - GET `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?maxResults={max}&timeMin={timeMin}&singleEvents=true&orderBy=startTime`
    - Output: `{ events: [{ id, summary, start, end, location, description, attendees }] }`
  - **`create-event.ts`**: `--calendar-id <string>` (default "primary"), `--summary <string>` (required), `--start <string>` (ISO datetime, required), `--end <string>` (ISO datetime, required), `--description <string>` (optional), `--location <string>` (optional), `--attendees <string>` (optional, comma-separated emails)
    - POST `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events`
    - Output: `{ id, summary, htmlLink, start, end }`
  - **`update-event.ts`**: `--calendar-id <string>` (default "primary"), `--event-id <string>` (required), `--summary <string>`, `--start <string>`, `--end <string>`, `--description <string>`, `--location <string>`
    - PATCH `https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}`
    - Only send fields that are provided as flags
    - Output: `{ id, summary, htmlLink, updated }`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 18, 21
  - **Blocked By**: Task 11

  **References**:
  - Calendar API v3: `https://developers.google.com/calendar/api/v3/reference`

  **Acceptance Criteria**:
  - [ ] All 3 files exist and support `--help`
  - [ ] `create-event.ts` exits 1 when `--summary`, `--start`, or `--end` missing

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: create-event validates required args
    Tool: Bash
    Steps:
      1. GOOGLE_ACCESS_TOKEN=fake tsx src/worker-tools/google/create-event.ts 2>&1; echo "Exit: $?"
    Expected Result: stderr mentions required args, Exit: 1
    Evidence: .sisyphus/evidence/task-17-calendar-args.txt
  ```

  **Commit**: YES
  - Message: `feat(google-tools): add Calendar tools (list, create, update)`

- [x] 18. Google Assistant archetype seed + employee doc

  **What to do**:
  - Add a new archetype to `prisma/seed.ts` for the VLRE tenant (`00000000-0000-0000-0000-000000000003`):
    - `role_name`: "Google Workspace Assistant"
    - `slug`: "google-assistant"
    - `status`: "active"
    - `model`: Use the recommendation engine or default `minimax/minimax-m2.7`
    - `runtime`: "opencode"
    - `vm_size`: "performance-1x" (required for OpenCode runtime)
    - `temperature`: 1.0
    - `approval_required`: true (the assistant can send emails and modify files — needs human approval)
    - `identity`: A concise identity description for a general-purpose Google Workspace assistant
    - `execution_steps`: Clear steps the LLM follows:
      1. Read the assignment from "## Your Assignment"
      2. Get Google token: `tsx /tools/google/validate-env.ts` (verifies GOOGLE_ACCESS_TOKEN is available)
      3. Based on the assignment, use the appropriate Google tools (list tools available at /tools/google/)
      4. Complete the task and summarize results
      5. Submit output: `tsx /tools/platform/submit-output.ts --summary "..." --classification "NEEDS_APPROVAL" --draft-file /tmp/summary.txt`
    - `delivery_steps`: "Post the task results summary to Slack."
    - `delivery_instructions`: Compact instructions for the delivery container to post to Slack
    - `tool_registry`: `{ "tools": ["/tools/platform/submit-output.ts", "/tools/slack/post-message.ts", "/tools/google/validate-env.ts", "/tools/google/list-emails.ts", "/tools/google/get-email.ts", "/tools/google/send-email.ts", "/tools/google/list-files.ts", "/tools/google/get-file.ts", "/tools/google/upload-file.ts", "/tools/google/delete-file.ts", "/tools/google/list-documents.ts", "/tools/google/get-document.ts", "/tools/google/create-document.ts", "/tools/google/list-spreadsheets.ts", "/tools/google/get-sheet-data.ts", "/tools/google/update-sheet-data.ts", "/tools/google/list-presentations.ts", "/tools/google/get-presentation.ts", "/tools/google/list-events.ts", "/tools/google/create-event.ts", "/tools/google/update-event.ts"] }`
    - Use a stable UUID (generate one)
  - Create `docs/employees/2026-06-03-HHMM-google-assistant.md` with:
    - Archetype ID and tenant
    - Trigger command (curl example)
    - Available tools list
    - Known gotchas (RESTRICTED scopes, token expiry, Testing mode)

  **Must NOT do**:
  - Do NOT use a hardcoded model that isn't in the model catalog — use `minimax/minimax-m2.7` (seeded)
  - Do NOT set `approval_required: false` — this assistant can send emails and modify Drive files
  - Do NOT add Google-specific language to shared files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Archetype seed requires careful field composition matching existing patterns
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers all archetype schema fields, seed data patterns, tool_registry format

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs all shell tools)
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 20, 21
  - **Blocked By**: Tasks 12-17

  **References**:
  - `prisma/seed.ts` — Existing archetype seed patterns
  - `docs/employees/2026-06-02-1230-engineer.md` — Employee doc pattern
  - Load `creating-archetypes` skill for archetype schema field reference

  **Acceptance Criteria**:
  - [ ] Archetype record seeded with all required fields
  - [ ] `approval_required: true`
  - [ ] `vm_size: 'performance-1x'`
  - [ ] `runtime: 'opencode'`
  - [ ] All 18 Google tools + submit-output + post-message in tool_registry
  - [ ] Employee doc exists with trigger command
  - [ ] `pnpm prisma db seed` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Archetype exists after seed
    Tool: Bash (psql)
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT role_name, status, approval_required, vm_size, runtime FROM archetypes WHERE role_name LIKE '%Google%' OR role_name LIKE '%google%';"
    Expected Result: 1 row with status=active, approval_required=true, vm_size=performance-1x, runtime=opencode
    Evidence: .sisyphus/evidence/task-18-archetype.txt
  ```

  **Commit**: YES
  - Message: `feat(google): seed Google Assistant archetype and employee doc`
  - Files: `prisma/seed.ts`, `docs/employees/2026-06-03-*-google-assistant.md`

- [x] 19. Update AGENTS.md + README.md + tool-usage-reference skill

  **What to do**:
  - **AGENTS.md updates**:
    - Add Google to the shell tools table: `| Google | /tools/google/ | Gmail, Drive, Docs, Sheets, Slides, Calendar |`
    - Add Google env vars to the Environment Variables section
    - Add `google-assistant` employee to any employee listing
    - Add `docs/employees/2026-06-03-*-google-assistant.md` to the Reference Documents table
    - Add `docs/guides/2026-06-03-*-google-cloud-setup.md` to the Reference Documents table
    - Add Google OAuth routes to Admin API section:
      - `GET /integrations/google/install?tenant=<slug>` — initiates Google OAuth flow
      - `GET /integrations/google/callback` — OAuth callback
      - `DELETE /admin/tenants/:tenantId/integrations/google` — disconnect Google
      - `POST /internal/tasks/:taskId/google-token` — internal token endpoint
  - **README.md updates**:
    - Add Google to Active Employees table
    - Add Google env vars to Environment Variables section
    - Add admin API endpoints
    - Add employee doc to Documentation table
  - **tool-usage-reference skill** (`src/workers/skills/tool-usage-reference/SKILL.md`):
    - Add Google tools section with CLI syntax, required flags, output JSON shapes

  **Must NOT do**:
  - Do NOT add Google-specific language to the shared AGENTS.md narrative sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T18, T20 in Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 21
  - **Blocked By**: Tasks 12-17

  **References**:
  - `AGENTS.md` — Current structure, section locations for each update
  - `README.md` — Current structure
  - `src/workers/skills/tool-usage-reference/SKILL.md` — Existing tool reference format

  **Acceptance Criteria**:
  - [ ] AGENTS.md has Google in shell tools table
  - [ ] AGENTS.md has Google OAuth routes in Admin API section
  - [ ] AGENTS.md has employee doc and GCP guide in Reference Documents
  - [ ] README.md has Google in Active Employees
  - [ ] tool-usage-reference has Google tools section

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: AGENTS.md mentions Google tools
    Tool: Bash (grep)
    Steps:
      1. grep -c "/tools/google/" AGENTS.md → at least 1
      2. grep -c "google-assistant" AGENTS.md → at least 1
    Expected Result: Both present
    Evidence: .sisyphus/evidence/task-19-docs-update.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md and README for Google integration`
  - Files: `AGENTS.md`, `README.md`, `src/workers/skills/tool-usage-reference/SKILL.md`

- [x] 20. Docker image rebuild

  **What to do**:
  - Rebuild the Docker image to include the new Google shell tools and the googleapis npm package:
    ```bash
    tmux kill-session -t ai-build 2>/dev/null
    tmux new-session -d -s ai-build -x 220 -y 50
    tmux send-keys -t ai-build "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" Enter
    ```
  - Poll until complete, then kill tmux session

  **Must NOT do**:
  - Do NOT skip this — shell tools won't be available in worker containers without rebuild

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after T18)
  - **Blocks**: Task 21
  - **Blocked By**: Task 18

  **Acceptance Criteria**:
  - [ ] Docker build exits code 0
  - [ ] Image `ai-employee-worker:latest` has recent timestamp

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker image built successfully
    Tool: Bash
    Steps:
      1. docker images ai-employee-worker:latest --format "{{.Repository}}:{{.Tag}} {{.CreatedAt}}"
    Expected Result: Recent timestamp
    Evidence: .sisyphus/evidence/task-20-docker-build.txt
  ```

  **Commit**: NO (build artifact)

- [x] 21. E2E: Connect Google + trigger assistant + verify

  **What to do**:
  - **Prerequisite**: User must have completed GCP setup (Task 4 guide) and set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env`
  - **Step 1**: Connect Google to VLRE tenant via the dashboard OAuth flow
    - Navigate to `http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003`
    - Click "Connect Google" → complete Google consent in browser
    - Verify redirect back to dashboard with "Connected" state
    - Verify 5 secrets stored in DB
  - **Step 2**: Trigger the Google Assistant with a simple task:
    ```bash
    source .env
    curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/google-assistant/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"inputs": {"prompt": "List my 3 most recent unread emails and summarize each one in one sentence."}}' \
      | jq '{task_id: .task_id}'
    ```
  - **Step 3**: Monitor lifecycle progression:
    - Check status every 30s
    - Watch container logs during Executing
    - Verify `## Your Assignment` injected in harness log
  - **Step 4**: If reaches Reviewing, approve manually
  - **Step 5**: Document full lifecycle trace and results

  **Must NOT do**:
  - Do NOT change the model if it fails — document the failure
  - Do NOT skip the OAuth connection step (this tests the full flow)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step E2E spanning OAuth + archetype + lifecycle
  - **Skills**: [`debugging-lifecycle`, `e2e-testing`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (last, after T20)
  - **Blocks**: Task 22, F1-F4
  - **Blocked By**: Tasks 4, 9, 18, 19, 20

  **Acceptance Criteria**:
  - [ ] Google connected (5 secrets in DB)
  - [ ] Task created successfully (202 response)
  - [ ] Task progresses through lifecycle
  - [ ] `## Your Assignment` visible in harness log
  - [ ] Either: task reaches Done with email summary OR failure documented

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full E2E from OAuth to task execution
    Tool: Bash (curl + psql) + Playwright (dashboard)
    Steps:
      1. Connect Google via dashboard (Playwright)
      2. Verify secrets: psql → 5 google_* rows
      3. Trigger assistant: curl POST → task_id
      4. Monitor: poll status every 30s
      5. If Reviewing: approve via manual fallback curl
      6. Document outcome
    Expected Result: Task created, progresses, ideally reaches Done
    Evidence: .sisyphus/evidence/task-21-e2e-full.txt
  ```

  **Commit**: NO (test only)

- [x] 22. Notify completion

  **What to do**:
  - Send Telegram: `npx tsx scripts/telegram-notify.ts "✅ google-oauth-integration complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1-F4

  **Acceptance Criteria**:
  - [ ] Telegram notification sent

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (OAuth → token endpoint → shell tool → archetype). Test edge cases: missing env, expired token, disconnect then reconnect. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group | Message                                                            | Files                                                                                    |
| ----- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| T1-T2 | `chore: add googleapis dependency and Google env vars`             | `package.json`, `pnpm-lock.yaml`, `.env.example`                                         |
| T3    | `feat(google): add token manager service with refresh and caching` | `src/gateway/services/google-token-manager.ts`                                           |
| T4    | `docs: add Google Cloud Platform setup guide`                      | `docs/guides/2026-06-03-*-google-cloud-setup.md`                                         |
| T5-T6 | `feat(google): add OAuth install and callback routes`              | `src/gateway/routes/google-oauth.ts`, `src/gateway/server.ts`                            |
| T7    | `feat(google): add internal token endpoint for worker containers`  | `src/gateway/routes/internal-google-token.ts`, `src/gateway/server.ts`                   |
| T8    | `feat(google): add admin disconnect endpoint`                      | `src/gateway/routes/admin-google.ts`, `src/gateway/server.ts`                            |
| T9    | `feat(dashboard): add Google integration card`                     | `dashboard/src/panels/integrations/IntegrationsPage.tsx`, `dashboard/src/lib/gateway.ts` |
| T10   | `test(google): add token manager unit tests`                       | `src/gateway/services/__tests__/google-token-manager.test.ts`                            |
| T11   | `feat(google-tools): add validate-env and shared fetch helper`     | `src/worker-tools/google/validate-env.ts`, `src/worker-tools/google/lib/google-fetch.ts` |
| T12   | `feat(google-tools): add Gmail tools (list, get, send)`            | `src/worker-tools/google/list-emails.ts`, etc.                                           |
| T13   | `feat(google-tools): add Drive tools (list, get, upload, delete)`  | `src/worker-tools/google/list-files.ts`, etc.                                            |
| T14   | `feat(google-tools): add Docs tools (list, get, create)`           | `src/worker-tools/google/list-documents.ts`, etc.                                        |
| T15   | `feat(google-tools): add Sheets tools (list, get, update)`         | `src/worker-tools/google/list-spreadsheets.ts`, etc.                                     |
| T16   | `feat(google-tools): add Slides tools (list, get)`                 | `src/worker-tools/google/list-presentations.ts`, etc.                                    |
| T17   | `feat(google-tools): add Calendar tools (list, create, update)`    | `src/worker-tools/google/list-events.ts`, etc.                                           |
| T18   | `feat(google): seed Google Assistant archetype and employee doc`   | `prisma/seed.ts`, `docs/employees/2026-06-03-*-google-assistant.md`                      |
| T19   | `docs: update AGENTS.md and README for Google integration`         | `AGENTS.md`, `README.md`                                                                 |
| T22   | `chore(sisyphus): complete google-oauth-integration plan`          | `.sisyphus/`                                                                             |

---

## Success Criteria

### Verification Commands

```bash
# OAuth install returns redirect
curl -s -o /dev/null -w "%{http_code}" "http://localhost:7700/integrations/google/install?tenant=vlre"
# Expected: 302

# After OAuth, 5 secrets stored
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT key FROM tenant_secrets WHERE tenant_id='00000000-0000-0000-0000-000000000003' AND key LIKE 'google_%' ORDER BY key;"
# Expected: 5 rows (google_access_token, google_granted_scopes, google_refresh_token, google_token_expiry, google_user_email)

# Integration record exists with sub as external_id
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT provider, external_id FROM tenant_integrations WHERE provider='google' AND deleted_at IS NULL;"
# Expected: 1 row with numeric external_id (Google sub)

# Internal token endpoint returns token
curl -s -X POST "http://localhost:7700/internal/tasks/$TASK_ID/google-token" \
  -H "X-Task-ID: $TASK_ID" | jq '.token | length > 0'
# Expected: true

# All shell tools have --help
for tool in src/worker-tools/google/*.ts; do tsx "$tool" --help > /dev/null 2>&1 && echo "OK: $tool" || echo "FAIL: $tool"; done
# Expected: all OK

# Tests pass
pnpm test -- --run
pnpm build
# Expected: 0 failures
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] OAuth connect + disconnect flow works
- [ ] All 18 shell tools functional
- [ ] Google Assistant archetype triggers and executes
