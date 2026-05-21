# Learnings — jira-integration

## [2026-05-21] Session Start

- Plan: 21 tasks across 4 waves + 4 final verification
- Existing Jira infrastructure is extensive but wired to deprecated engineering lifecycle
- Critical: existing `POST /webhooks/jira` fires `engineering/task.received` — must switch to `employee/task.dispatched`
- Shell tools use Basic auth (API tokens) only — OAuth only for dashboard "Connect" flow
- ADF wrapping: add-comment.ts accepts plain text, wraps internally — AI employees never construct ADF
- Per-employee webhook URL: `/webhooks/jira/:tenantSlug/:employeeSlug`
- Dual-mode jira-client: OAuth (Bearer + cloudId URL) AND Basic auth (API token + domain URL)
- motivation-bot archetype e4dd9e63 exists in live DB only, not in seed — must capture from DB (Task 2) then seed (Task 11)
- Approved models: minimax/minimax-m2.7 (execution), anthropic/claude-haiku-4-5 (verification)
- VLRE tenant ID: 00000000-0000-0000-0000-000000000003
- DozalDevs tenant ID: 00000000-0000-0000-0000-000000000002

## Task 2: real-estate-motivation-bot archetype config captured

- Archetype ID: `e4dd9e63-91ac-490b-ba4f-10246be6fa76`
- role_name: `real-estate-motivation-bot`
- tenant_id: `00000000-0000-0000-0000-000000000003` (VLRE)
- model: `minimax/minimax-m2.7`
- deliverable_type: `slack_message`
- runtime: `opencode`
- risk_model: `{"timeout_hours": 2, "approval_required": false}`
- notification_channel: `C0960S2Q8RL`
- system_prompt: empty string
- agents_md: motivational content creator persona for real estate team
- delivery_instructions, enrichment_adapter, vm_size, worker_env: all empty
- Evidence saved to: `.sisyphus/evidence/task-2-motivation-bot-config.txt`

## Task 1: src/lib/jira-types.ts created

- File: `src/lib/jira-types.ts` — 103 lines, no imports, pure TypeScript
- All 9 types exported: JiraAuthMode, JiraOAuthConfig, JiraBasicConfig, JiraClientConfig, AdfNode, AdfDocument, JiraIssue, JiraComment, JiraSearchResult
- All 6 constants exported: JIRA_OAUTH_BASE_URL, JIRA_AUTH_URL, JIRA_TOKEN_URL, JIRA_ACCESSIBLE_RESOURCES_URL, JIRA_API_VERSION, JIRA_REQUIRED_SCOPES
- plainTextToAdf: wraps text in doc→paragraph→text ADF structure
- adfToPlainText: recursively extracts text nodes, joins with '' (no separator) — handles null → ''
- ADF logic ported fresh (not imported from deprecated src/workers/lib/task-context.ts which uses '\n' join)
- Tests: 1508 passing, 27 skipped — no regressions
- Commit: 11d2913 feat(jira): add shared types and constants

## Task 3: Jira OAuth 2.0 install + callback routes

- File: `src/gateway/routes/jira-oauth.ts` — 168 lines
- Routes: `GET /jira/install` and `GET /jira/callback` (registered under `/integrations` prefix)
- Registered in server.ts as: `app.use('/integrations', jiraOAuthRoutes({ prisma }))`
- Startup warning for JIRA_CLIENT_ID added to buildApp() in server.ts
- .env.example updated with JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, JIRA_REDIRECT_BASE_URL vars

### Key implementation decisions:

1. Install route order: slug param check → DB lookup → JIRA_CLIENT_ID check → redirect
   - ?tenant=nonexistent → 400 TENANT_NOT_FOUND (DB lookup fires before JIRA_CLIENT_ID check)
   - ?tenant=vlre (valid) + no JIRA_CLIENT_ID → 503
   - ?tenant=vlre + JIRA_CLIENT_ID set → 302 to Atlassian auth URL

2. State signing: identical HMAC-sha256 pattern from slack-oauth.ts
   - Payload: { tenant_id, nonce }
   - Signed: base64url(payload) + "." + hex(hmac-sha256)

3. Atlassian auth URL params: audience, client_id, scope, redirect_uri, state, response_type=code, prompt=consent

4. Token exchange: JSON body (POST to JIRA_TOKEN_URL), not form-encoded like Slack

5. After token exchange: fetch accessible resources to get cloudId + siteUrl from [0]

6. Secrets stored: jira_access_token, jira_refresh_token (if present), jira_cloud_id, jira_site_url

7. Integration upsert: provider='jira', external_id=cloudId

8. Callback success: redirect 302 to ${redirectBase}/dashboard/

### QA evidence captured:

- .sisyphus/evidence/task-3-oauth-redirect.txt — 302 redirect to Atlassian with all required params
- .sisyphus/evidence/task-3-oauth-bad-tenant.txt — 400 TENANT_NOT_FOUND
- .sisyphus/evidence/task-3-oauth-unconfigured.txt — 503 JIRA_CLIENT_ID not configured

## T2: jira-client.ts dual-mode auth rewrite (2026-05-21)

### Key findings

1. **Existing tests use old flat config format** `{ baseUrl, email, apiToken }` not the new `{ auth: {...} }` shape.
   - Solution: accept a union type `JiraClientConfig | LegacyJiraClientConfig` with runtime detection via `'auth' in config`.
   - Vitest strips types at runtime so no type error prevents tests from running.

2. **URL path change**: Old client concatenated `baseUrl + /rest/api/3/issue/...`. New client stores `/rest/api/3` in `resolvedBaseUrl` and paths are relative (e.g. `/issue/${issueKey}`). Tests verified URL construction matches.

3. **Auth mode detection**: `'accessToken' in auth` → OAuth; else → Basic. Both use same `makeRequest` and `withRetry` infrastructure.

4. **`skipBody` param** replaces the old path-sniffing approach (`path.includes('/comment')`) for skipping JSON parsing on 201/204 responses — cleaner and more explicit.

5. **searchIssues** uses `POST /rest/api/3/search/jql` (not deprecated `GET /rest/api/3/search`).

6. **getComments** returns `{ comments: JiraComment[], total: number }` with pagination via query params.

7. **Actual test count**: 10 tests (not 9 as stated in task spec).

8. **Types**: All imported from `jira-types.ts` — `JiraClientConfig`, `JiraIssue`, `JiraComment`, `JiraSearchResult`, `AdfDocument`, `JIRA_OAUTH_BASE_URL`.

## Task 5-10: Jira shell tools created (2026-05-21)

### Files created

- `src/worker-tools/jira/get-issue.ts` — GET /rest/api/3/issue/{key}, outputs transformed shape (plain-text description)
- `src/worker-tools/jira/search-issues.ts` — POST /rest/api/3/search/jql, builds JQL from --project/--status/--assignee or uses raw --jql
- `src/worker-tools/jira/add-comment.ts` — POST /rest/api/3/issue/{key}/comment, accepts plain text, wraps in ADF inline
- `src/worker-tools/jira/list-comments.ts` — GET /rest/api/3/issue/{key}/comment, converts ADF bodies to plain text
- `src/worker-tools/jira/validate-env.ts` — checks JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL; outputs {ok, vars} or {ok:false, missing:[]}

### Key implementation decisions

1. **No import from src/lib** — Tools run standalone via tsx in Docker. `adfToPlainText` is inlined in get-issue.ts, add-comment.ts, and list-comments.ts (copy of the logic from jira-types.ts without TypeScript types).

2. **Buffer.from().toString('base64') for auth** — More reliable than `btoa()` for non-ASCII chars; consistent with Jira client pattern.

3. **Fixture → tool output shape** — Mock mode returns the fixture directly (same as hostfully pattern). Fixtures contain the already-transformed tool output, not the raw Jira API response.

4. **add-comment returns the created comment** — Unlike `jira-client.ts` which uses `skipBody: true`, the shell tool parses the POST response to return `{id, body (plain text), created}`.

5. **validate-env always exits 0** — Reports status in JSON rather than exiting 1 on missing vars. Useful for agents to understand what's configured.

6. **Mock mode checked BEFORE arg/env validation** — Follows the exact hostfully pattern.

### QA evidence

- task-6-mock-output.json — get-issue mock output
- task-7-mock-search.json — search-issues mock output
- task-8-mock-comment.json — add-comment mock output
- task-9-mock-comments.json — list-comments mock output
- task-10-validate-missing.json — validate-env with all vars missing → {ok:false,missing:[...]}
- task-10-validate-ok.json — validate-env with all vars set → {ok:true,vars:{...:set}}

### Test results

- 1508 passing, 27 skipped, 0 failures (matches expected baseline)

## Task 11: jira-motivation-bot archetype seeded (2026-05-21)

### UUID collision discovery

- Plan spec said UUID `00000000-0000-0000-0000-000000000017` was free — it was NOT.
- `000017` was already in live DB as `schedule-generator-thornton` (tenant `000004`, Snöbahn ski school).
- Prisma upsert ran UPDATE (not CREATE) → jira-motivation-bot values applied to wrong tenant `000004`.
- Restored `000017` from backup (`database-backups/2026-05-21-1527/archetypes.sql`).
- **Correct UUID: `00000000-0000-0000-0000-000000000018`** (first free sequential UUID).

### Archetype seeded

- id: `00000000-0000-0000-0000-000000000018`
- role_name: `jira-motivation-bot`
- tenant_id: `00000000-0000-0000-0000-000000000003` (VLRE)
- model: `minimax/minimax-m2.7`
- runtime: `opencode`
- deliverable_type: `slack_message`
- notification_channel: `C0960S2Q8RL`
- risk_model: `{"timeout_hours": 2, "approval_required": false}`

### Idempotency

- Seed run twice → still 1 row. Upsert pattern confirmed correct.

### Test results

- 1508 passing, 27 skipped, 0 failures (matches expected baseline)

### Lesson learned

- Always query live DB for existing UUIDs before assigning a new one in seed.ts.
- `SELECT id FROM archetypes ORDER BY id` is the safest way to find the next free sequential UUID.
