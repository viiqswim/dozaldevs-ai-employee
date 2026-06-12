# Composio Authentication Consolidation

## TL;DR

> **Quick Summary**: Make Composio the single authentication/connection manager for all mainstream third-party services. Delete the dedicated shell tools whose functionality Composio fully replaces (`notion`, `google`, `jira`); keep the few tools that do something special (`slack` Block Kit cards, `github` raw git) but re-source their credentials from Composio instead of our own per-service OAuth flows.
>
> **Deliverables**:
>
> - Deleted dedicated tools: `src/worker-tools/{notion,google,jira}/` (+ their tests) — these use **Composio-managed credentials** (no own app; Composio makes the call, we never hold the token)
> - Rewritten archetypes (`cleaning-schedule`, `google-workspace-assistant`) + `prisma/seed.ts` to call Composio `execute.ts` instead of deleted tools
> - GitHub token endpoint re-sourced: `internal-github-token.ts` fetches the token from Composio (**own app, `repo` scope**) instead of minting a GitHub App installation token
> - Slack bot token re-sourced: `tenant_secrets.slack_bot_token` populated from the Composio Slack connection (**your own Slack app inside Composio**, so the bot name is yours); the `xapp-` Socket Mode token stays in `.env` (Composio can't issue it); the `teamId → tenant` mapping is preserved
> - A Composio credentials helper (`getComposioConnectionToken`) used by the gateway to fetch raw tokens (for Slack + GitHub — the two we hold tokens for)
> - Dead per-service credential endpoints removed (Notion/Jira/Google/GitHub OAuth + disconnect routes); obsolete tenant secrets pruned after E2E proof
> - **Unified integrations page**: the Composio marketplace page becomes THE integrations page; the old custom integrations page is removed; niche own-credential apps (Hostfully, Sifely) appear as cards with a credentials-form connect flow (saved via the existing encrypted secrets API)
> - Docs + AGENTS.md + employee docs updated; live E2E re-verification per affected employee
>
> **Credential model**: Notion/Google/Jira → Composio (managed creds OK). Slack/GitHub → Composio with YOUR OWN app creds (GitHub: `repo` scope; Slack: your bot identity). Only `xapp-` (Slack Socket Mode) stays in `.env` — everything else is Composio-managed. No new env vars required.
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Wave 1 (Composio token helper + connection prerequisites) → Wave 2 (re-source github/slack auth; rewrite notion/google/jira employees) → Wave 3 (delete tools, seed, wizard, docs) → Wave 4 (live E2E verification)

---

## Context

### Original Request

The user connected several apps via Composio and asked whether AI employees would actually use those Composio connections rather than the pre-existing dedicated shell tools. Investigation revealed overlap: some services have BOTH a dedicated `/tools/{service}/` tool AND a Composio connection. The user wants ONE connection per service, with Composio as the authentication manager. Not released to real users yet — clean cut is acceptable.

### Interview Summary

**Final architecture (confirmed)**: **Composio = authentication/connection manager.**

- DELETE dedicated tools whose functionality Composio fully replaces → employees call `tsx /tools/composio/execute.ts --toolkit <x>`.
- KEEP tools that do something special, but change their credential SOURCE to Composio (gateway fetches the token from Composio and injects it as the same env var the tool already reads).
- KEEP unchanged: niche tools (`hostfully`, `sifely`) and internal tools (`knowledge_base`, `platform`).
- UNTOUCHED: the gateway's inbound Slack Socket Mode listener and its `SLACK_APP_TOKEN` (`xapp-`) — not Composio-managed.

**Per-tool decisions**:
| Tool | Decision | Auth source after |
| --- | --- | --- |
| `notion/` | DELETE | employees use Composio `execute.ts` |
| `google/` | DELETE | employees use Composio `execute.ts` |
| `jira/` | DELETE | employees use Composio `execute.ts` |
| `slack/` | KEEP (Block Kit cards + Socket Mode are special) | `xoxb-` bot token from Composio → `tenant_secrets.slack_bot_token` → `SLACK_BOT_TOKEN` env |
| `github/` | KEEP (raw git clone/push/PR is special) | token from Composio via the internal token endpoint; `get-token.ts` unchanged |
| `hostfully/`, `sifely/` | KEEP unchanged | own tenant secrets (no Composio equivalent) |
| `knowledge_base/`, `platform/` | KEEP unchanged | internal |

### Research Findings (verified this session)

- **Tool exposure**: ALL `/tools/` dirs are baked into every container (`Dockerfile` single `COPY`). `tool_registry` is advisory-only, NOT access control.
- **Wizard catalog** is built by `discoverTools()` (`src/gateway/services/tool-parser.ts`) scanning `src/worker-tools/` — deleting a tool directory automatically removes it from the wizard catalog. No separate catalog edit needed.
- **Composio returns raw tokens** via `connectedAccounts.get()` → `account.state.val` (`oauth_token`/`access_token`). Masked by default (`gho_...`); disable via project setting `mask_secret_keys_in_connected_account: false`.
- **Composio has managed toolkits** for GMAIL, GOOGLEDRIVE (89 tools), GOOGLEDOCS, GOOGLESHEETS, GOOGLECALENDAR, GOOGLESLIDES, GITHUB, SLACK, JIRA, NOTION — all OAUTH2.
- **Slack has two tokens**: `xapp-` (Socket Mode inbound — env, NOT Composio, stays) and `xoxb-` (outbound posting — Composio brokers).
- **Slack shell tools are EMPLOYEE-ONLY** (referenced only by the 3 tool files + tool-parser + wizard prompt + 2 skill docs). The platform's own Slack code in `src/gateway/slack/` uses Bolt/WebClient directly and is independent of the shell tools.
- **GitHub re-source point**: `src/gateway/routes/internal-github-token.ts:42-49` fetches `github_installation_id` + calls `generateInstallationToken()`. Swap for a Composio token fetch; `get-token.ts` stays unchanged.
- **Token injection path**: `src/repositories/tenant-env-loader.ts:51-53` uppercases tenant secrets into env (`slack_bot_token` → `SLACK_BOT_TOKEN`). Re-source = populate that secret from Composio.

### Blast Radius (verified against live DB)

- **Auth today is OUR OWN OAuth, not Composio**: `tenant_secrets` holds `notion_access_token`, `google_access_token`/`refresh_token`, `jira_access_token`, `slack_bot_token`, `github_installation_id`, plus niche `hostfully_*`, `sifely_*`. These come from our own OAuth flows (`github-oauth.ts`, `google-token-manager.ts`, jira/notion oauth).
- **ACTIVE employees that BREAK if tools deleted without rewrite**:
  - `cleaning-schedule` (tenant `…0003`) → references `/tools/notion/`.
  - `google-workspace-assistant` (tenant `…0003`) → references `/tools/google/`.
  - No active jira archetype currently.
- **`prisma/seed.ts` hardcodes the deleted tool paths** → must be rewritten or `pnpm setup` regresses.
- **Slack employees** (daily-summarizer, guest-messaging, etc.) use the KEPT slack tools — unaffected.
- **GitHub employees** (`engineer`, `github-code-engineer`) call the KEPT `get-token.ts` — only the gateway endpoint's token SOURCE changes.

### Metis Review

**Gaps addressed in this plan**:

- Active archetypes referencing deleted tools = hard break → dedicated rewrite tasks WITH per-employee live E2E.
- `seed.ts` rewrite is mandatory.
- A Composio connection must exist for each migrated service BEFORE rewiring.
- GitHub token-scope parity (`repo`) and Slack token parity (post Block Kit + button round-trip) must be proven by live E2E, not code inspection.
- Disabling Composio masking affects only the token-fetch path, not T1-T13 audit/usage.

---

## Work Objectives

### Core Objective

Establish Composio as the single authentication manager for all mainstream third-party services, eliminating dedicated-vs-Composio overlap: delete the redundant tools, re-source the special tools' credentials from Composio, and rewrite affected employees — with zero regression to active employees, proven by live E2E.

### Concrete Deliverables

- `src/worker-tools/{notion,google,jira}/` deleted (+ tests)
- `getComposioConnectionToken()` gateway helper
- `internal-github-token.ts` re-sourced to Composio
- Slack `xoxb-` token re-sourced into `tenant_secrets.slack_bot_token` from Composio
- `cleaning-schedule` + `google-workspace-assistant` archetypes rewritten to Composio `execute.ts`
- `prisma/seed.ts` rewritten
- Wizard prompt Composio-only for migrated services (no tiebreaker rule)
- Unified integrations page (Composio page becomes the main page; old custom page removed; Hostfully/Sifely as credential-form cards)
- Docs/AGENTS.md/employee docs updated
- Live E2E per affected employee

### Definition of Done

- [ ] `cleaning-schedule` runs to `Done` using Composio Notion (live E2E, real Notion read, audit row written)
- [ ] `google-workspace-assistant` runs to `Done` using Composio Google (live E2E)
- [ ] `engineer` clones→branches→commits→pushes→opens a PR using a Composio-sourced GitHub token (live E2E)
- [ ] An approval-flow employee posts a Block Kit card with working Approve/Reject buttons using a Composio-sourced Slack token (live E2E)
- [ ] `src/worker-tools/{notion,google,jira}/` absent; `pnpm build` + `pnpm test` clean
- [ ] `pnpm setup` on a fresh DB produces no archetype referencing a deleted tool path
- [ ] `/dashboard/integrations` is the single unified page; old custom page removed (URL redirects); Slack is a Composio-native connection; Hostfully/Sifely connectable as credential-form cards (live UI E2E)
- [ ] Dead Notion/Jira/Google/GitHub credential endpoints removed; `slack-oauth.ts` + secrets API + Composio routes intact; `pnpm build`/`pnpm test` clean
- [ ] Obsolete notion/google/jira/github*installation_id secrets pruned (after E2E proof); slack_bot_token/hostfully*\_/sifely\_\_ retained

### Must Have

- Composio is the credential source for notion/google/jira (via execute.ts), and for slack/github (via re-sourced token injection)
- Active employees rewritten BEFORE or WITH the tool deletion (no broken intermediate state on `main`)
- `seed.ts` consistent with the new model
- Per-employee live E2E verification

### Must NOT Have (Guardrails)

- NO deletion of `hostfully/`, `sifely/`, `knowledge_base/`, `platform/`
- NO change to the gateway Slack Socket Mode listener or `SLACK_APP_TOKEN` (`xapp-`)
- NO preference/tiebreaker rule in the wizard (deletion removes the overlap entirely)
- NO per-tenant migration tooling (not released yet)
- NO change to the T1-T13 Composio skill/audit mechanism (it stays as-is)
- NO leaving `main` in a state where an active employee references a deleted tool
- NO hardcoded Composio toolkit slugs scattered across code — centralize the token helper
- NO committing real tokens or disabling masking without a documented security note
- **GitHub goes FULLY through Composio** (own-app credentials chosen INSIDE Composio, `repo` scope). REMOVE the custom GitHub App install flow (`github-oauth.ts`), `generateInstallationToken()` in `github-token-manager.ts`, and the GitHub App env vars (`GITHUB_APP_ID`/`GITHUB_APP_NAME`/`GITHUB_PRIVATE_KEY`). GitHub is a normal Composio connection, NOT a custom card.
- **Slack goes through Composio too** — using the user's OWN Slack app credentials inside Composio (so the bot name is theirs). Composio manages the connection + `xoxb-` bot token. The ONLY self-held piece is `SLACK_APP_TOKEN` (`xapp-`, Socket Mode) in `.env` — Composio cannot issue an app-level token (it's not OAuth). Slack is a Composio-native connection, NOT a custom card. The `xapp-`/Socket Mode setup in `server.ts` is untouched.
- **NO use of Composio-managed (Composio's own) credentials for Slack or GitHub.** Both MUST use "Your Own Credentials" inside Composio (GitHub needs `repo` scope; Slack needs the user's own bot identity + the matching app for Socket Mode). (Notion/Google/Jira may use Composio-managed.)
- **REMOVE the dead per-service credential endpoints** after migration: Notion/Jira/Google/GitHub OAuth install+callback routes (`{notion,jira,google,github}-oauth.ts`), `admin-google.ts`, `internal-google-token.ts`, and the Notion/Jira/Slack disconnect routes in `admin-integrations.ts`. `slack-oauth.ts` is removable ONLY once the Composio connect path establishes the `teamId → tenant` mapping (Task 5); otherwise keep it and flag. KEEP: the generic secrets API, `internal-github-token.ts`, the Composio routes, the Socket Mode setup, and `installation-store.ts`. Verify nothing else calls a route before deleting it.
- **NO plaintext credential storage** for Hostfully/Sifely — they MUST go through the existing encrypted secrets API (`PUT /admin/tenants/:tenantId/secrets/:key`, AES-256-GCM). NO new secret-storage mechanism.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No "user manually confirms" criteria.

### Test Decision

- **Infrastructure exists**: YES (vitest unit + integration)
- **Automated tests**: Tests-after for the token helper + endpoint rewrite; delete tests alongside deleted tools; update tests referencing deleted tools
- **Framework**: vitest
- **Migrations**: none expected (no schema change); secrets are data, not schema

### QA Policy

Every task includes agent-executed QA scenarios. Evidence → `.sisyphus/evidence/{task-slug}/`.

- **Gateway endpoint / helper**: Bash (curl) + unit tests
- **DB assertions**: psql against `ai_employee` (zero rows = failure)
- **Employee behavior**: live trigger + `task_status_log` trace + container log grep + `task_composio_calls` audit row
- **Slack approval**: Playwright/CDP to click the button and confirm the round-trip
- **GitHub**: real PR URL produced

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundations — establish Composio as credential source):
├── Task 1: getComposioConnectionToken() gateway helper + tests [deep]
├── Task 2: Establish Composio connections for google/jira/slack/github (own-credentials) + masking note [unspecified-high]
└── Task 3: Confirm Notion Composio connection + capabilities for cleaning-schedule's actions [quick]

Wave 2 (Re-source auth + rewrite employees — depends on Wave 1):
├── Task 4: Re-source GitHub token endpoint to Composio + remove GitHub App machinery (depends: 1) [deep]
├── Task 5: Re-source Slack xoxb bot token from Composio (own app); keep xapp in .env (depends: 1) [deep]
├── Task 6: Rewrite cleaning-schedule archetype → Composio Notion (depends: 3) [unspecified-high]
└── Task 7: Rewrite google-workspace-assistant archetype → Composio Google (depends: 2) [unspecified-high]

Wave 3 (Delete tools + seed + wizard + docs + dashboard — depends on Wave 2):
├── Task 8: Delete src/worker-tools/{notion,google,jira}/ + tests + references (depends: 6,7) [unspecified-high]
├── Task 9: Rewrite prisma/seed.ts to Composio calls (depends: 6,7) [deep]
├── Task 10: Wizard prompt Composio-only for migrated services; no tiebreaker (depends: 8) [unspecified-high]
├── Task 11: Docs + AGENTS.md + employee docs update (depends: 8) [writing]
├── Task 16: Make Composio page THE integrations page; remove custom page (depends: none — UI-only) [visual-engineering]
├── Task 17: Add Slack/Hostfully/Sifely as custom integration cards on the unified page (depends: 16) [visual-engineering]
└── Task 19: Remove dead Notion/Jira/Google/GitHub credential endpoints (depends: 4,6,7,16) [deep]

Wave 4 (Live E2E verification + gated cleanup — after ALL):
├── Task 12: Live E2E — cleaning-schedule (Notion via Composio) [unspecified-high]
├── Task 13: Live E2E — google-workspace-assistant (Google via Composio) [unspecified-high]
├── Task 14: Live E2E — engineer (GitHub clone/push/PR via Composio token) [unspecified-high]
├── Task 15: Live E2E — approval-flow employee (Slack via Composio token + button round-trip) [unspecified-high]
├── Task 18: E2E — unified integrations page (connect a Composio app + save custom creds via UI) [visual-engineering]
└── Task 20: Prune obsolete tenant secrets (gated: after 12,13,14 pass) [deep]

Wave FINAL (4 parallel reviews → user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Live E2E evidence audit (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4 → Task 19 → Task 15 → F-wave  (and Task 4 → Task 14; Tasks 6/7 → 12/13/14 → Task 20)
Max Concurrent: 4
```

### Dependency Matrix

- **1**: deps none → blocks 4
- **2**: deps none → blocks 7
- **3**: deps none → blocks 6, 12
- **4**: deps 1 → blocks 14, 19
- **5**: deps 1 → blocks 15, 19
- **6**: deps 3 → blocks 8, 9, 12, 19
- **7**: deps 2 → blocks 8, 9, 13, 19
- **8**: deps 6,7 → blocks 10, 11
- **9**: deps 6,7 → blocks Final
- **10**: deps 8 → blocks Final
- **11**: deps 8 → blocks Final
- **12,13,14**: deps respective rewrites → block 20, Final
- **15**: deps 19 (regression after endpoint removal) → blocks Final
- **16**: deps none (UI-only; can start anytime) → blocks 17, 18, 19
- **17**: deps 16 → blocks 18
- **18**: deps 16, 17 → blocks Final
- **19**: deps 4, 6, 7, 16 → blocks 15, Final
- **20**: deps 12, 13, 14 (gated on E2E proof) → blocks Final

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep` (+data-access-conventions), T2 → `unspecified-high` (+security), T3 → `quick`
- **Wave 2**: T4 → `deep` (+data-access-conventions, +security), T5 → `deep` (+security, +slack-conventions), T6 → `unspecified-high` (+creating-archetypes), T7 → `unspecified-high` (+creating-archetypes)
- **Wave 3**: T8 → `unspecified-high`, T9 → `deep` (+prisma, +creating-archetypes), T10 → `unspecified-high` (+api-design), T11 → `writing` (+writing-guidelines), T16 → `visual-engineering` (+react-dashboard), T17 → `visual-engineering` (+react-dashboard, +security), T19 → `deep` (+api-design)
- **Wave 4**: T12-T15 → `unspecified-high` (+e2e-testing, +debugging-lifecycle, +playwright), T18 → `visual-engineering` (+playwright), T20 → `deep` (+security, +prisma)
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+e2e-testing), F4 → `deep`

---

## TODOs

> Implementation + Test = ONE task. EVERY task has a Recommended Agent Profile, Parallelization info, References, and QA Scenarios.

- [x] 1. `getComposioConnectionToken()` gateway helper

  **What to do**:
  - Add a gateway service helper that, given `(tenantId, toolkitSlug)`, fetches the tenant's active Composio connection for that toolkit and returns the raw OAuth token. Use the Composio SDK `connectedAccounts` API (list by `user_id: tenant_${tenantId}` + toolkit, then `get()` → `account.state.val` → `oauth_token`/`access_token`).
  - Handle: no connection found (throw a typed error), masked value returned (detect `...`-suffixed masked tokens and throw a clear error instructing to disable masking), token expired (surface Composio's refresh or error).
  - NEVER log the token value. Log only toolkit + tenantId + success/failure.
  - Place alongside the existing Composio code (`src/lib/composio/` or `src/gateway/services/`). Mirror the existing `connectable-apps.ts` Composio SDK init pattern.

  **Must NOT do**:
  - Do NOT scatter toolkit slugs across the codebase — this helper is the single token-fetch entry point.
  - Do NOT write the token to disk or DB here (callers decide). Do NOT log the token.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Composio SDK integration with auth edge cases
  - **Skills**: [`data-access-conventions`] — `createHttpClient`/config env access, repository boundary
  - **Skills Evaluated but Omitted**: `security` (token handling) — the no-log/no-persist rules are simple enough to state inline; load if the executor wants the encryption context.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 4, 5 · Blocked By: None

  **References**:
  - `src/lib/composio/connectable-apps.ts` — Composio SDK init (`new Composio({ apiKey })`), `authConfigs.list()` pattern to mirror
  - `src/worker-tools/composio/execute.ts` — how `COMPOSIO_API_KEY` + `user_id: tenant_${tenantId}` namespace is used for execution (same identity model)
  - `src/lib/config.ts` (`COMPOSIO_API_KEY` — it is a function `(): string`, call it)
  - Composio docs: `connectedAccounts.get(id)` → `account.state.val` contains `oauth_token`/`access_token`; masking disabled via project setting `mask_secret_keys_in_connected_account: false`
  - `src/gateway/services/github-token-manager.ts` — existing token-manager service shape to mirror (function exports, error handling)

  **Acceptance Criteria**:
  - [ ] Unit test: given a mocked `connectedAccounts` returning an unmasked token for `notion`, helper returns the token string
  - [ ] Unit test: masked token (`gho_...`) → throws a clear "masking enabled" error
  - [ ] Unit test: no connection → throws a typed "not connected" error
  - [ ] `pnpm build` clean; token never appears in any log line (assert in test via logger spy)

  **QA Scenarios**:

  ```
  Scenario: Returns unmasked token for a connected toolkit
    Tool: Bash (vitest)
    Steps:
      1. Mock connectedAccounts.list()+get() to return state.val.oauth_token = "test_tok_123"
      2. Call getComposioConnectionToken(tenantId, "notion")
      3. Assert return === "test_tok_123"
    Expected Result: token returned, no token in logs
    Evidence: .sisyphus/evidence/task-1-helper/unit.txt

  Scenario: Masked token throws actionable error
    Tool: Bash (vitest)
    Steps:
      1. Mock get() to return state.val.access_token = "gho_..."
      2. Call helper; assert it throws an error mentioning masking
    Expected Result: typed error, no silent return of masked value
    Evidence: .sisyphus/evidence/task-1-helper/masked.txt
  ```

  **Commit**: YES — `feat(composio): add getComposioConnectionToken auth helper`

- [x] 2. Establish Composio connections (managed for Google/Jira; OWN app for Slack + GitHub) + confirm masking off

  > **Credential model (critical distinction)**:
  >
  > - **Google & Jira → Composio-managed credentials are fine.** Their employees call `execute.ts`; Composio makes the API call on our behalf and we NEVER hold the token. No own app needed.
  > - **Slack → OWN app REQUIRED.** The app that POSTS an approval card must be the SAME app that RECEIVES the button clicks. Button clicks arrive via OUR gateway's Socket Mode listener (our own Slack app, `xapp-` token in env). If Composio's managed Slack app posted the card, clicks would route to Composio's app and approvals would silently break. Using our own Slack app in Composio keeps poster == listener.
  > - **GitHub → OWN app REQUIRED.** The coding employee runs a real `git push`, which needs a token with `repo` write scope. The Composio-managed GitHub app may not grant repo-write. Our own app lets us select `repo` scope explicitly (user confirmed it is selected).

  **What to do**:
  - In the Composio dashboard (or via API), create/confirm connections for the active tenant(s):
    - `google` toolkits used (GMAIL, GOOGLEDRIVE, GOOGLEDOCS, GOOGLESHEETS, GOOGLECALENDAR, GOOGLESLIDES as needed) and `jira` — **Composio-managed credentials are acceptable** (no own app).
    - `slack` and `github` — **using "Your Own Credentials"** (own app). GitHub: `repo` scope (+ the scopes the engineer needs). Slack: bot scopes for posting Block Kit messages, using the SAME Slack app whose `xapp-` token the gateway already uses for Socket Mode.
  - Credential masking is ALREADY disabled at the project level (user confirmed). Just VERIFY it: `getComposioConnectionToken` returns a full token (not `...`-suffixed) for `slack` and `github` (the only two we read tokens for).
  - Record connection IDs / toolkit slugs in evidence. NO new env var expected (only `COMPOSIO_API_KEY`, already present).

  **Must NOT do**:
  - Do NOT use own-app credentials for Google/Jira unless a specific feature forces it (managed is the default for those). Do NOT commit any real token. Do NOT change `SLACK_APP_TOKEN` / Socket Mode. Do NOT use a DIFFERENT Slack app than the gateway's Socket Mode app.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`security`, `slack-conventions`] — tenant-secret handling; xapp vs xoxb + same-app requirement

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 7, 15 · Blocked By: None

  **References**:
  - `src/lib/composio/connectable-apps.ts` — how connectable toolkits are discovered (auth configs)
  - `src/gateway/routes/composio-catalog.ts` — existing Composio connection listing/management
  - Composio dashboard auth-config flow (user screenshot: GitHub OAuth2 "Your Own Credentials" with `repo`,`user`,`gist`,`notifications`,`project`,`workflow`,`codespace` scopes selected)
  - `slack-conventions` skill — Socket Mode app identity; same app must post and receive
  - AGENTS.md § Composio — `COMPOSIO_API_KEY`, connected-toolkit injection

  **Acceptance Criteria**:
  - [ ] Google & Jira connections ACTIVE (managed credentials acceptable) for the test tenant
  - [ ] Slack & GitHub connections ACTIVE using OWN app credentials (GitHub has `repo` scope; Slack is the gateway's own Socket Mode app)
  - [ ] `getComposioConnectionToken(tenant, 'slack')` and `(tenant, 'github')` each return a FULL (unmasked) token
  - [ ] Masking-off confirmed; connection IDs recorded in evidence

  **QA Scenarios**:

  ```
  Scenario: Managed connections active for Google/Jira; own-app connections token-readable for Slack/GitHub
    Tool: Bash (curl + helper script)
    Steps:
      1. curl GET /admin/tenants/<tenant>/composio/connections — assert google/jira/slack/github ACTIVE
      2. Fetch token via Task 1 helper for slack + github — assert full tokens, not "..."
      3. Confirm github connection's app grants repo scope (own app); slack connection is the gateway's own app
    Expected Result: 4 active connections; slack+github tokens readable; correct credential model per app
    Evidence: .sisyphus/evidence/task-2-connections/connections.json + token-check.txt
  ```

  **Commit**: NO (operational setup; evidence + any `.env.example` doc change committed)

- [x] 3. Confirm Notion Composio connection + capability for cleaning-schedule's actions

  **What to do**:
  - Notion is already connected for tenant `…0003` (verified). Confirm the specific Notion actions `cleaning-schedule` needs (read page/database, append blocks, update blocks — whatever its current `/tools/notion/` usage maps to) exist on the Composio NOTION toolkit via `tsx /tools/composio/list-actions.ts --toolkit notion` (or the docs).
  - Produce a mapping table: each `/tools/notion/{tool}.ts` operation `cleaning-schedule` uses → the equivalent Composio NOTION action slug + params. This mapping is the input to Task 6.

  **Must NOT do**:
  - Do NOT modify the archetype here (that's Task 6). Do NOT assume parity — verify each action exists.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [] — discovery only

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 6, 12 · Blocked By: None

  **References**:
  - Current `cleaning-schedule` archetype `execution_steps` (psql: `SELECT execution_steps FROM archetypes WHERE role_name='cleaning-schedule'`) — the source of truth for which Notion ops it uses
  - `docs/employees/cleaning-schedule.md` — operational details, Notion page IDs
  - `src/worker-tools/notion/` (get-page, append-blocks, update-block) — the operations to map
  - `tsx /tools/composio/list-actions.ts --toolkit notion` — live action discovery

  **Acceptance Criteria**:
  - [ ] A written mapping: each Notion op cleaning-schedule uses → Composio NOTION action slug (+ required params)
  - [ ] Every needed op has a confirmed Composio equivalent (or a flagged gap with a fallback)

  **QA Scenarios**:

  ```
  Scenario: Every Notion op cleaning-schedule uses maps to a real Composio action
    Tool: Bash (psql + list-actions)
    Steps:
      1. psql: read cleaning-schedule execution_steps; enumerate /tools/notion/* calls
      2. tsx /tools/composio/list-actions.ts --toolkit notion — list available slugs
      3. Assert each needed op has a matching slug; record the mapping
    Expected Result: complete mapping table, no unresolved gap
    Evidence: .sisyphus/evidence/task-3-notion-map/mapping.md
  ```

  **Commit**: NO (analysis; mapping committed under `.sisyphus/`)

- [x] 4. Re-source GitHub token endpoint to Composio

  **What to do**:
  - Rewrite `src/gateway/routes/internal-github-token.ts` so that, instead of reading `github_installation_id` + calling `generateInstallationToken()`, it fetches the GitHub token from Composio via the Task 1 helper (`getComposioConnectionToken(tenantId, 'github')`).
  - Keep the endpoint contract identical: same route, same `X-Task-ID` auth, same `Executing`-state gate, same response shape `{ token, expires_at }`. (For `expires_at`, use Composio's token expiry if available, else a sensible default.)
  - The `/tools/github/get-token.ts` shell tool stays UNCHANGED (still POSTs to the endpoint, still writes `/tmp/github-token`).
  - Update `internal-github-token.test.ts` to mock the Composio helper instead of the installation-token manager.
  - **Remove the now-dead GitHub App machinery** (GitHub goes fully through Composio): delete `generateInstallationToken()` in `github-token-manager.ts` (and the file if nothing else uses it), the `github-oauth.ts` App-install flow, and the `GITHUB_APP_ID`/`GITHUB_APP_NAME`/`GITHUB_PRIVATE_KEY` env usages. Grep for every reference first and remove cleanly. (Endpoint-route removal of `github-oauth.ts` is coordinated with Task 19.)
  - The `github_installation_id` tenant secret becomes obsolete — handled by the secret-cleanup task (Task 20).

  **Must NOT do**:
  - Do NOT change the endpoint's route, auth, or response shape. Do NOT touch `get-token.ts` (it stays; only its token SOURCE changes server-side). Do NOT leave dangling imports after removing the App machinery.

  **Recommended Agent Profile**:
  - **Category**: `deep` — auth-critical path with token-scope implications
  - **Skills**: [`data-access-conventions`, `security`] — PostgREST/secret boundary, token handling

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 14 · Blocked By: 1

  **References**:
  - `src/gateway/routes/internal-github-token.ts:42-49` — the exact lines to replace (installation-id fetch + `generateInstallationToken`)
  - `src/gateway/services/github-token-manager.ts` — `generateInstallationToken()` being replaced
  - `src/worker-tools/github/get-token.ts` — the unchanged caller (contract to preserve)
  - `docs/employees/2026-06-02-1230-engineer.md` — git clone/push/PR workflow + `repo` scope requirement; `github_installation_id` secret usage
  - Task 1 helper (`getComposioConnectionToken`)

  **Acceptance Criteria**:
  - [ ] Endpoint returns a Composio-sourced token with unchanged response shape
  - [ ] `internal-github-token.test.ts` updated + passes
  - [ ] `get-token.ts` unchanged (git diff shows no change to the tool)
  - [ ] `pnpm build` + `pnpm test` clean

  **QA Scenarios**:

  ```
  Scenario: Endpoint issues a Composio-sourced GitHub token
    Tool: Bash (curl against running gateway, Executing task)
    Steps:
      1. Create/locate an Executing task for a tenant with github connected via Composio
      2. POST /internal/tasks/<id>/github-token with X-Task-ID header
      3. Assert 200 + { token, expires_at }; token is a usable GitHub token (gho_/ghs_ form)
    Expected Result: 200, valid token, shape unchanged
    Evidence: .sisyphus/evidence/task-4-github-endpoint/curl.txt

  Scenario: Non-Executing task still 403 (contract preserved)
    Tool: Bash (curl)
    Steps:
      1. POST for a task not in Executing state
      2. Assert 403
    Expected Result: 403 unchanged
    Evidence: .sisyphus/evidence/task-4-github-endpoint/403.txt
  ```

  **Commit**: YES — `feat(github): source installation token from Composio connection`

- [x] 5. Re-source Slack `xoxb` bot token from Composio (keep `xapp-` Socket Mode token in env)

  > **Model (confirmed):** Composio manages the Slack connection using the user's OWN Slack app credentials (so the bot name is the user's), including the `xoxb-` bot token. The `xapp-` app-level token (Socket Mode WebSocket) is NOT an OAuth token and cannot be issued by Composio — it stays in `.env` as `SLACK_APP_TOKEN`. So Slack IS a Composio-managed connection like the others; only the one architecturally-unprovidable token (`xapp-`) is self-held.

  **What to do**:
  - Make the Slack `xoxb-` bot token come from the Composio Slack connection instead of our own `slack-oauth.ts` flow. Lowest-risk wiring: keep populating `tenant_secrets.slack_bot_token` (so `TenantInstallationStore`, the worker tools, and `admin-slack-channels.ts` all keep working unchanged) — but source its value from `getComposioConnectionToken(tenantId, 'slack')`. Populate on the Composio connect/callback (event-driven; NO cron/timer per hard rule).
  - Leave `SLACK_APP_TOKEN` (`xapp-`) exactly as-is in `server.ts:124` — Socket Mode untouched.
  - The Bolt `authorize` callback (`server.ts:130-138`) and `TenantInstallationStore.fetchInstallation` (reads `slack_bot_token`) need NO change IF the secret is kept populated from Composio. (If instead you fetch directly from Composio in the store, update `installation-store.ts:28` to call the helper — pick the cleaner of the two; keeping the secret populated is preferred for minimal blast radius.)
  - **CRITICAL — preserve the `teamId → tenant` mapping**: `installation-store.ts:24` resolves the workspace via `integrationRepo.findByExternalId('slack', teamId)`. The Composio connect path MUST persist this mapping (upsert a `slack` integration record with `external_id = teamId`) when it syncs the token — otherwise inbound Socket Mode events can't resolve the bot token and Slack breaks. This is what lets Task 19 safely remove `slack-oauth.ts`.
  - The `/tools/slack/` tools stay UNCHANGED (still read `SLACK_BOT_TOKEN`).

  **Must NOT do**:
  - Do NOT add cron/timer/background poll. Do NOT change `SLACK_APP_TOKEN` or the Socket Mode setup in `server.ts`. Do NOT modify the slack shell tools. Do NOT use Composio-managed (Composio's own) Slack app — must be the user's own credentials so the bot identity is theirs.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`security`, `slack-conventions`] — secret storage; xapp vs xoxb distinction, Socket Mode rules

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 15 · Blocked By: 1

  **References**:
  - `src/gateway/server.ts:124-141` — Bolt App: `appToken` (xapp, KEEP) + `authorize` callback (resolves xoxb via the store)
  - `src/gateway/slack/installation-store.ts:28` — `fetchInstallation` reads `slack_bot_token` from tenant secrets (the value we now source from Composio)
  - `src/repositories/tenant-env-loader.ts:51-53` — `slack_bot_token` → `SLACK_BOT_TOKEN` for workers
  - `src/worker-tools/slack/post-message.ts:114` — `requireEnv('SLACK_BOT_TOKEN')` (unchanged consumer)
  - `src/gateway/routes/admin-slack-channels.ts:39` — also reads `SLACK_BOT_TOKEN` from secrets (kept working)
  - Task 1 helper (`getComposioConnectionToken`)
  - `slack-conventions` skill — Socket Mode never reconfigured; xapp stays

  **Acceptance Criteria**:
  - [ ] `tenant_secrets.slack_bot_token` is populated from the Composio Slack connection (own-app creds)
  - [ ] The `slack` integration record (`teamId → tenant`) is persisted by the Composio connect path so `installation-store.ts` resolves inbound events
  - [ ] Bolt resolves the bot token and posts successfully; `SLACK_APP_TOKEN`/Socket Mode unchanged (git diff shows no change to `server.ts` Socket Mode lines)
  - [ ] Worker `post-message.ts` posts using the Composio-sourced token
  - [ ] No cron/timer added; bot identity is the user's own app

  **QA Scenarios**:

  ```
  Scenario: Slack posts work with a Composio-sourced (own-app) bot token
    Tool: Bash (psql + live employee or post-message run)
    Steps:
      1. Connect Slack in Composio with own-app creds; trigger the sync that populates slack_bot_token
      2. psql: assert slack_bot_token present (ciphertext)
      3. Trigger a slack-posting employee; assert message posts under the user's bot name
    Expected Result: post succeeds via Composio-brokered own-app token
    Evidence: .sisyphus/evidence/task-5-slack-token/post.txt

  Scenario: Socket Mode (xapp) untouched
    Tool: Bash (git diff)
    Steps:
      1. git diff src/gateway/server.ts around the appToken/socketMode lines
      2. Assert no change to SLACK_APP_TOKEN / socketMode setup
    Expected Result: inbound listener unaffected
    Evidence: .sisyphus/evidence/task-5-slack-token/socket-untouched.txt
  ```

  **Commit**: YES — `feat(slack): source bot token from Composio (own-app), keep xapp in env`

- [x] 6. Rewrite `cleaning-schedule` archetype → Composio Notion

  **What to do**:
  - Using the mapping from Task 3, rewrite the `cleaning-schedule` archetype's `execution_steps` (and `delivery_steps` if they touch Notion) to call `tsx /tools/composio/execute.ts --toolkit notion --action <SLUG> --params '<json>'` instead of `/tools/notion/*`.
  - Update BOTH the live DB row (`UPDATE archetypes ...` for tenant `…0003`) AND the `prisma/seed.ts` source (coordinate with Task 9) so they match.
  - Preserve the employee's behavior exactly (same Notion pages, same output).

  **Must NOT do**:
  - Do NOT change what the employee does — only how it calls Notion. Do NOT leave the DB and seed inconsistent.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`creating-archetypes`] — archetype fields, execution_steps quality, loadTenantEnv

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 8, 9, 12 · Blocked By: 3

  **References**:
  - Task 3 mapping (Notion op → Composio action)
  - Current `cleaning-schedule` `execution_steps` (psql)
  - `docs/employees/cleaning-schedule.md` — Notion page IDs, Slack channel, gotchas
  - `src/worker-tools/composio/execute.ts` — CLI contract (`--toolkit --action --params`)
  - `creating-archetypes` skill

  **Acceptance Criteria**:
  - [ ] `cleaning-schedule` execution_steps reference Composio `execute.ts --toolkit notion`, no `/tools/notion/`
  - [ ] DB row and `seed.ts` agree
  - [ ] (Full behavior proof deferred to Task 12 live E2E)

  **QA Scenarios**:

  ```
  Scenario: Archetype no longer references the dedicated Notion tool
    Tool: Bash (psql + grep)
    Steps:
      1. psql: SELECT execution_steps,delivery_steps FROM archetypes WHERE role_name='cleaning-schedule'
      2. Assert contains 'execute.ts --toolkit notion'; assert NOT contains '/tools/notion/'
    Expected Result: fully migrated
    Evidence: .sisyphus/evidence/task-6-cleaning/steps.txt
  ```

  **Commit**: YES — `feat(cleaning-schedule): migrate Notion calls to Composio`

- [x] 7. Rewrite `google-workspace-assistant` archetype → Composio Google

  **What to do**:
  - Map each `/tools/google/*` operation the employee uses to the right Composio Google toolkit action (GMAIL / GOOGLEDRIVE / GOOGLEDOCS / GOOGLESHEETS / GOOGLECALENDAR / GOOGLESLIDES) and rewrite its `execution_steps`/`delivery_steps` to `execute.ts --toolkit <googletoolkit> --action <SLUG>`.
  - Update BOTH the live DB row (tenant `…0003`) AND `prisma/seed.ts` (coordinate with Task 9).
  - Note Google spans multiple Composio toolkits — pick the correct toolkit per operation.

  **Must NOT do**:
  - Do NOT change behavior. Do NOT assume one "google" toolkit — use the specific per-service toolkits.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`creating-archetypes`]

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 8, 9, 13 · Blocked By: 2

  **References**:
  - Current `google-workspace-assistant` `execution_steps` (psql)
  - `docs/employees/2026-06-03-0243-google-assistant.md` — tools used, required secrets, gotchas
  - `src/worker-tools/google/` — the operations to map
  - Composio toolkits: GMAIL, GOOGLEDRIVE(89 tools), GOOGLEDOCS, GOOGLESHEETS, GOOGLECALENDAR, GOOGLESLIDES
  - `tsx /tools/composio/list-actions.ts --toolkit <googletoolkit>` for slugs
  - Task 2 (connections must exist)

  **Acceptance Criteria**:
  - [ ] execution_steps reference Composio Google toolkits, no `/tools/google/`
  - [ ] DB row and `seed.ts` agree
  - [ ] Each mapped op has a verified Composio action slug

  **QA Scenarios**:

  ```
  Scenario: Archetype no longer references the dedicated Google tool
    Tool: Bash (psql + grep)
    Steps:
      1. psql: read google-workspace-assistant steps
      2. Assert contains 'execute.ts --toolkit google'-family slugs; NOT '/tools/google/'
    Expected Result: fully migrated
    Evidence: .sisyphus/evidence/task-7-google/steps.txt
  ```

  **Commit**: YES — `feat(google-assistant): migrate Google calls to Composio`

- [x] 8. Delete `src/worker-tools/{notion,google,jira}/` + tests + references

  **What to do**:
  - Delete the three tool directories and their `__tests__/`.
  - Find and fix every remaining reference: `grep -rn "/tools/notion\|/tools/google\|/tools/jira"` across `src/`, `docs/`, `prisma/`, skills. Update `tool-usage-reference` SKILL.md (remove those tools' sections). Remove any `tool_registry` entries pointing at them in seed/DB (coordinate with Task 9).
  - Verify no dangling imports (`grep` for imports from the deleted dirs) — the deleted tools are standalone CLI scripts, so imports are unlikely, but confirm.
  - Run `pnpm build` + `pnpm test` and fix anything that breaks.

  **Must NOT do**:
  - Do NOT delete `hostfully/`, `sifely/`, `knowledge_base/`, `platform/`, `slack/`, `github/`, `composio/`. Do NOT run before Tasks 6 & 7 land (else active employees break on `main`).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**: Can Run In Parallel: NO (after 6,7) · Wave 3 · Blocks: 10, 11 · Blocked By: 6, 7

  **References**:
  - `src/worker-tools/notion/`, `src/worker-tools/google/`, `src/worker-tools/jira/` — directories to delete
  - `src/workers/skills/tool-usage-reference/SKILL.md` — sections to remove
  - Grep targets: `/tools/notion`, `/tools/google`, `/tools/jira` across the repo
  - `prisma/seed.ts` (tool_registry arrays) — coordinate with Task 9

  **Acceptance Criteria**:
  - [ ] `ls src/worker-tools/` shows no notion/google/jira
  - [ ] `grep -rn "/tools/notion\|/tools/google\|/tools/jira" src/ prisma/` → zero (docs handled in Task 11)
  - [ ] `pnpm build` + `pnpm test` clean

  **QA Scenarios**:

  ```
  Scenario: Tools deleted, no references remain in code
    Tool: Bash
    Steps:
      1. ls src/worker-tools/ — assert notion/google/jira absent
      2. grep -rn '/tools/notion\|/tools/google\|/tools/jira' src/ prisma/ — assert empty
      3. pnpm build && pnpm test -- --run — assert pass
    Expected Result: clean deletion, green build/tests
    Evidence: .sisyphus/evidence/task-8-delete/result.txt
  ```

  **Commit**: YES — `refactor(tools): remove notion/google/jira dedicated tools (replaced by Composio)`

- [x] 9. Rewrite `prisma/seed.ts` to Composio calls

  **What to do**:
  - Update `prisma/seed.ts` so the seeded `cleaning-schedule` and `google-workspace-assistant` archetypes use Composio `execute.ts` calls (matching Tasks 6 & 7) and so no seeded archetype's `tool_registry`/`execution_steps` references the deleted tools.
  - **Slack seed-token nuance**: `seed.ts:133-140` seeds `slack_bot_token` from `VLRE_SLACK_BOT_TOKEN`. After this change the real Slack token comes from Composio (Task 5). Decide: keep the seeded value as a LOCAL-DEV-ONLY fallback (add a clarifying comment that Composio is the source of truth in real operation), or remove it if Task 5's population runs at setup. Do NOT silently leave it implying it's authoritative.
  - Run `pnpm prisma db seed` against a scratch/test DB (NOT prod — back up first per AGENTS.md) to confirm it applies cleanly and produces no `/tools/{notion,google,jira}/` references.

  **Must NOT do**:
  - Do NOT reseed the live dev DB without backing it up first (AGENTS.md Database Backup rule). Do NOT reintroduce deleted tool paths.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`prisma`, `creating-archetypes`] — seed patterns, archetype fields, backup rule

  **Parallelization**: Can Run In Parallel: NO (after 6,7) · Wave 3 · Blocks: Final · Blocked By: 6, 7

  **References**:
  - `prisma/seed.ts` — archetype seed definitions referencing `/tools/notion/` etc.
  - Tasks 6 & 7 rewritten steps (source of truth for the new content)
  - `prisma` skill — seed workflow, backup-before-reseed rule
  - AGENTS.md § Database Backup (MANDATORY before reseed)

  **Acceptance Criteria**:
  - [ ] `seed.ts` archetypes use Composio calls; no deleted-tool paths
  - [ ] `pnpm prisma db seed` on a scratch DB applies cleanly
  - [ ] Post-seed psql: zero active archetypes referencing deleted tools

  **QA Scenarios**:

  ```
  Scenario: Fresh seed produces no deleted-tool references
    Tool: Bash (psql on scratch/test DB)
    Steps:
      1. Back up DB; seed a scratch DB
      2. psql: SELECT count(*) FROM archetypes WHERE execution_steps LIKE '%/tools/notion/%' OR ... google ... OR ... jira ...
      3. Assert 0
    Expected Result: clean seed
    Evidence: .sisyphus/evidence/task-9-seed/seed-check.txt
  ```

  **Commit**: YES — `chore(seed): migrate seeded archetypes to Composio tool calls`

- [x] 10. Wizard prompt Composio-only for migrated services; no tiebreaker rule

  **What to do**:
  - Since the dedicated notion/google/jira tools are deleted, `discoverTools()` already drops them from the catalog automatically. Verify that, and ensure the wizard prompt (`archetype-generator-prompts.ts`) cleanly steers the LLM to use Composio `execute.ts` for those services when connected.
  - Explicitly DO NOT add any preference/tiebreaker rule (the overlap is gone). If the prompt currently contains any dedicated-vs-Composio tiebreaker language for these services, remove it.
  - Confirm the wizard still offers slack/github dedicated tools (kept) correctly.

  **Must NOT do**:
  - Do NOT add a tiebreaker rule. Do NOT hardcode skill names. Do NOT remove slack/github from the catalog.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`api-design`] — generator prompt + route shape

  **Parallelization**: Can Run In Parallel: NO (after 8) · Wave 3 · Blocks: Final · Blocked By: 8

  **References**:
  - `src/gateway/services/prompts/archetype-generator-prompts.ts` — `buildConnectedAppsBlock()` + system prompt
  - `src/gateway/services/archetype-generator.ts` — `buildSystemPrompt()`, `discoverTools()` call
  - `src/gateway/services/tool-parser.ts` `discoverTools()` — catalog is directory-driven (auto-updates on deletion)

  **Acceptance Criteria**:
  - [ ] Wizard catalog no longer lists notion/google/jira dedicated tools (verified via a generate call or unit)
  - [ ] No tiebreaker/preference language remains for those services
  - [ ] A generate call for a Notion-implying job produces Composio `execute.ts --toolkit notion` steps

  **QA Scenarios**:

  ```
  Scenario: Wizard generates Composio-only steps for a migrated service
    Tool: Bash (curl + jq)
    Steps:
      1. curl the generate endpoint for a tenant with notion connected, Notion-ish description
      2. Assert execution_steps reference execute.ts --toolkit notion; assert NO /tools/notion/
    Expected Result: Composio-only generation
    Evidence: .sisyphus/evidence/task-10-wizard/generate.json
  ```

  **Commit**: YES — `feat(wizard): Composio-only generation for migrated services`

- [x] 11. Docs + AGENTS.md + employee docs update

  **What to do**:
  - AGENTS.md: remove notion/google/jira rows from the shell-tools table; note Composio is the auth source for slack/github; update the Composio section to describe the auth-manager model.
  - Employee docs: `docs/employees/cleaning-schedule.md`, `docs/employees/2026-06-03-0243-google-assistant.md`, `docs/employees/2026-06-02-1230-engineer.md` — reflect Composio calls / Composio-sourced GitHub token.
  - Any guide referencing the deleted tools (`tool-usage-reference` skill already handled in Task 8; check `docs/guides/*`).
  - Follow the Documentation Durability rule (no volatile counts/line numbers).

  **Must NOT do**:
  - Do NOT add volatile counts or line-number references. Keep edits factual and durable.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: Can Run In Parallel: NO (after 8) · Wave 3 · Blocks: Final · Blocked By: 8

  **References**:
  - `AGENTS.md` — shell-tools table (lines around the Composio/Notion/Google rows), Composio section, env section
  - `docs/employees/cleaning-schedule.md`, `docs/employees/2026-06-03-0243-google-assistant.md`, `docs/employees/2026-06-02-1230-engineer.md`
  - `docs/guides/2026-06-02-1727-github-integration.md` — if the install-token model description changes
  - Tasks 4-9 (the actual behavior changes to document)

  **Acceptance Criteria**:
  - [ ] AGENTS.md shell-tools table has no notion/google/jira rows; Composio auth-manager model documented
  - [ ] The 3 employee docs reflect the new calls/token source
  - [ ] `grep -rn "/tools/notion\|/tools/google\|/tools/jira" docs/` → only historical/architecture mentions, no operational instructions

  **QA Scenarios**:

  ```
  Scenario: Docs reflect the deletion + auth-manager model
    Tool: Bash (grep)
    Steps:
      1. grep AGENTS.md for the deleted tool rows — assert removed
      2. grep employee docs for /tools/notion etc. — assert updated to Composio
    Expected Result: docs consistent with code
    Evidence: .sisyphus/evidence/task-11-docs/grep.txt
  ```

  **Commit**: YES — `docs: reflect Composio auth-manager model and tool removals`

- [x] 12. **LIVE E2E — cleaning-schedule (Notion via Composio)**

  > Rebuild the Docker image first (deleted tools + rewritten archetype only ship via rebuild). Trigger the real employee; verify it reads Notion through Composio and completes.

  **What to do**:
  - `docker build -t ai-employee-worker:latest .` (tmux, per long-running-commands).
  - Trigger `cleaning-schedule` (tenant `…0003`) via the admin trigger endpoint. Capture the task ID.
  - Verify the full chain: container has no `composio`-filtered-out skills issue; the task log shows `execute.ts --toolkit notion`; a `task_composio_calls` row with `toolkit='notion'` exists; the task reaches `Done`; the deliverable lands.

  **Must NOT do**:
  - Do NOT accept "unit tests pass" — requires a real task ID, real audit row, real deliverable. Do NOT skip the rebuild.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`]

  **Parallelization**: Can Run In Parallel: YES (with 13-15) · Wave 4 · Blocks: Final · Blocked By: 6, 8, 9

  **References**:
  - `e2e-testing` skill — trigger methods, task_status_log, container inspection, tmux rules
  - `docs/employees/cleaning-schedule.md` — trigger command, Notion page IDs, Slack channel
  - AGENTS.md § E2E — model recommendation, rebuild requirement

  **Acceptance Criteria**:
  - [ ] Real task reaches `Done` (full `task_status_log` trace captured)
  - [ ] Task log shows `execute.ts --toolkit notion`
  - [ ] `task_composio_calls` row with `toolkit='notion'` for this task (psql; zero rows = failure)
  - [ ] Deliverable landed (Slack/Notion artifact captured)

  **QA Scenarios**:

  ```
  Scenario: cleaning-schedule runs end-to-end on Composio Notion
    Tool: Bash (docker + curl + psql) + interactive_bash (tmux build)
    Steps:
      1. Rebuild image (tmux, wait EXIT_CODE:0)
      2. Trigger cleaning-schedule; capture TASK_ID
      3. psql task_status_log → assert reaches Done
      4. grep task log for 'execute.ts --toolkit notion'
      5. psql task_composio_calls WHERE task_id — assert notion row(s)
      6. Capture deliverable
    Expected Result: every checkpoint passes
    Evidence: .sisyphus/evidence/task-12-cleaning-e2e/
  ```

  **Commit**: NO (verification; evidence under `.sisyphus/`)

- [ ] 13. **LIVE E2E — google-workspace-assistant (Google via Composio)**

  **What to do**:
  - Trigger `google-workspace-assistant` (tenant `…0003`) after rebuild. Verify it calls a Composio Google toolkit, writes an audit row, reaches `Done`, and delivers.

  **Must NOT do**:
  - Do NOT accept code-only evidence. Requires real task ID + audit row + deliverable.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`]

  **Parallelization**: Can Run In Parallel: YES · Wave 4 · Blocks: Final · Blocked By: 7, 8, 9

  **References**:
  - `docs/employees/2026-06-03-0243-google-assistant.md` — trigger command, tools, secrets
  - `e2e-testing` skill

  **Acceptance Criteria**:
  - [ ] Task reaches `Done`; log shows `execute.ts --toolkit <google toolkit>`
  - [ ] `task_composio_calls` row with the Google toolkit for this task
  - [ ] Deliverable landed

  **QA Scenarios**:

  ```
  Scenario: google-workspace-assistant runs end-to-end on Composio Google
    Tool: Bash (curl + psql + docker)
    Steps:
      1. Trigger; capture TASK_ID
      2. psql task_status_log → Done
      3. grep log for execute.ts --toolkit google-family
      4. psql task_composio_calls — assert row
      5. Capture deliverable
    Expected Result: all pass
    Evidence: .sisyphus/evidence/task-13-google-e2e/
  ```

  **Commit**: NO

- [x] 14. **LIVE E2E — engineer (GitHub clone/push/PR via Composio token)**

  > The riskiest verification: proves the Composio-sourced GitHub token has `repo` scope and works for the full git workflow.

  **What to do**:
  - Trigger the `engineer` (DozalDevs) or `github-code-engineer` (VLRE) employee with a small coding prompt after rebuild. Verify `get-token.ts` receives a Composio-sourced token, the worker clones + branches + commits + pushes + opens a PR.
  - Capture the real PR URL and the `task_status_log` trace to `Done` (through the approval path).

  **Must NOT do**:
  - Do NOT accept a token issued but unused — the git push + `gh pr create` must actually succeed. Do NOT skip rebuild.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`]

  **Parallelization**: Can Run In Parallel: YES · Wave 4 · Blocks: Final · Blocked By: 4

  **References**:
  - `docs/employees/2026-06-02-1230-engineer.md` — trigger, repo, model override, branch naming, approval path
  - `src/gateway/routes/internal-github-token.ts` (re-sourced in Task 4)
  - `e2e-testing` skill

  **Acceptance Criteria**:
  - [ ] Worker obtains a Composio-sourced token via the endpoint (log evidence)
  - [ ] Real clone + branch + commit + push succeed; a real PR URL is produced
  - [ ] Task reaches `Done` through the approval path

  **QA Scenarios**:

  ```
  Scenario: engineer completes a coding task using a Composio GitHub token
    Tool: Bash (curl + psql + docker logs) + Playwright (approve PR card)
    Steps:
      1. Trigger engineer with a tiny prompt; capture TASK_ID
      2. docker logs / harness log — assert github-token fetched (Composio-sourced) + git push succeeded
      3. Capture PR URL
      4. Approve via Slack card; assert reaches Done
    Expected Result: real PR opened, token worked for push
    Evidence: .sisyphus/evidence/task-14-engineer-e2e/ (pr-url.txt, status-log.txt, token-log.txt)
  ```

  **Commit**: NO

- [x] 15. **LIVE E2E — approval-flow employee (Slack via Composio token + button round-trip)**

  > Proves the Composio-sourced `xoxb-` bot token (your own Slack app) posts a Block Kit approval card AND that Approve/Reject buttons still round-trip via Socket Mode (`xapp-` in env). ALSO serves as the post-endpoint-removal regression check (runs after Task 19).

  **What to do**:
  - Trigger an approval-required employee (e.g. `guest-messaging` or any `approval_required: true` archetype) after rebuild. Verify it posts a Block Kit approval card using the Composio-sourced `SLACK_BOT_TOKEN`, then click Approve and confirm the lifecycle advances (`Reviewing → Approved → Delivering → Done`).
  - This is the critical proof that "Composio manages the bot token + your own xapp- handles Socket Mode" works for the full round-trip. Capture the bot identity (confirm it's the user's own app name).
  - Single-gateway pre-flight per AGENTS.md (`pgrep ... src/gateway/server.ts | wc -l` == 1).

  **Must NOT do**:
  - Do NOT verify only the post — the button round-trip (Socket Mode) MUST be exercised. Do NOT reconfigure Socket Mode.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`, `playwright`, `slack-conventions`]

  **Parallelization**: Can Run In Parallel: YES · Wave 4 · Blocks: Final · Blocked By: 5, 19 (Composio Slack token in place + after endpoint removal)

  **References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Scenario A (approve happy path)
  - `slack-conventions` skill — Socket Mode, approval cards
  - `e2e-testing` skill — single-gateway pre-flight, Playwright via CDP
  - Task 5 (Composio-sourced Slack bot token + teamId→tenant mapping)

  **Acceptance Criteria**:
  - [ ] Approval card posts using the Composio-sourced (own-app) bot token; bot name is the user's
  - [ ] Approve button click round-trips (Socket Mode via `xapp-`) and the task advances to `Done`
  - [ ] Single-gateway pre-flight passed

  **QA Scenarios**:

  ```
  Scenario: Approval card posts + button round-trips (Composio xoxb + env xapp)
    Tool: Bash (psql) + Playwright (CDP, click Approve)
    Steps:
      1. Pre-flight: assert exactly 1 gateway process
      2. Trigger approval-required employee; capture TASK_ID
      3. Assert card posted (ts in DB / visible in channel) under the user's bot name
      4. Playwright: click Approve
      5. psql task_status_log → assert Reviewing→Approved→Delivering→Done
    Expected Result: full approval round-trip works with Composio-brokered own-app token
    Evidence: .sisyphus/evidence/task-15-slack-e2e/ (card.txt, status-log.txt, screenshot.png)
  ```

  **Commit**: NO

- [x] 16. Make the Composio page THE integrations page; remove the custom integrations page

  **What to do**:
  - Point the `/dashboard/integrations` route (and the sidebar "Integrations" link) at the Composio marketplace page (`ComposioConnections`). Remove the old custom page (`panels/integrations/IntegrationsPage.tsx`) from routing.
  - Keep the nested `/dashboard/integrations/composio` route working (or collapse it into `/dashboard/integrations`) — pick one canonical URL and redirect the other so existing links/bookmarks don't 404. Preserve URL-encoded state (search/category params) per the repo's URL-state convention.
  - Rename the page heading to "Integrations" (it currently says "Connected Apps") so it reads as the single home for all connections.
  - Do NOT remove the gateway OAuth routes (`/slack/install`, `/integrations/{jira,notion,github,google}/install`) — UI only. First verify nothing else deep-links to them (grep the dashboard + onboarding); if something does, leave a reachable path or note it.
  - Run `pnpm dashboard:build` + dashboard tests.

  **Must NOT do**:
  - Do NOT delete the gateway OAuth install routes. Do NOT break deep links — add redirects. Do NOT use a non-`SearchableSelect` dropdown or component-local state for navigable filters (repo conventions).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`react-dashboard`] — SearchableSelect, URL-encoded state, card shells, non-technical copy

  **Parallelization**: Can Run In Parallel: YES (UI-only) · Wave 3 · Blocks: 17, 18 · Blocked By: None

  **References**:
  - `dashboard/src/App.tsx:104-105` — the two integration routes to consolidate
  - `dashboard/src/components/layout/Sidebar.tsx:30` — the "Integrations" nav link
  - `dashboard/src/pages/ComposioConnections.tsx` — the page that becomes canonical (heading at line 173)
  - `dashboard/src/panels/integrations/IntegrationsPage.tsx` — the custom page being removed (note its OAuth `connectHref`s at lines 310,322,337,351,362 — these reference gateway routes that STAY)
  - `react-dashboard` skill — URL-encoded state, card shells, non-technical end-user language

  **Acceptance Criteria**:
  - [ ] `/dashboard/integrations` renders the Composio marketplace page; sidebar link goes there
  - [ ] Old custom page no longer routable; its prior URL redirects (no 404)
  - [ ] Gateway OAuth routes untouched (git diff shows no route deletion)
  - [ ] `pnpm dashboard:build` + dashboard tests pass

  **QA Scenarios**:

  ```
  Scenario: The integrations page is the unified Composio page
    Tool: Playwright (CDP, localhost:7700/dashboard)
    Steps:
      1. Navigate to /dashboard/integrations?tenant=<id>
      2. Assert the Composio marketplace UI renders (Connected Apps zone + Available + Browse)
      3. Click sidebar "Integrations" — assert same page
      4. Navigate to old /dashboard/integrations/composio — assert it still resolves (or redirects to canonical)
    Expected Result: single unified page, no 404
    Evidence: .sisyphus/evidence/task-16-unified-page/ (screenshots)
  ```

  **Commit**: YES — `feat(dashboard): unify integrations into the Composio page`

- [x] 17. Add Hostfully/Sifely (and future niche apps) as credential-form cards on the unified page

  > Slack is NOT here — it's a Composio-managed connection (Task 5), so it appears natively on the Composio page like Notion/Google/Jira/GitHub. This task is only for niche apps Composio does NOT support.

  **What to do**:
  - Introduce a small registry of "custom credential" apps (start with Hostfully and Sifely) that render as cards in the "Available to connect now" section alongside Composio apps — same `IntegrationCard` look.
  - Their "Connect" action opens a credentials-form modal (Hostfully: `hostfully_api_key`, `hostfully_agency_uid`; Sifely: `sifely_username`, `sifely_password`) and saves each field via the encrypted secrets API (`PUT /admin/tenants/:tenantId/secrets/:key`). Connection status = "Connected" when the required secrets exist (secrets list endpoint — keys only, never values).
  - Disconnect = delete those secrets. Plain, non-technical labels ("Connect Hostfully", "API Key").
  - Make the registry easy to extend so future niche apps are a config addition, not new components.

  **Must NOT do**:
  - Do NOT store credentials anywhere except the encrypted secrets API. Do NOT display secret values back (keys-only). Do NOT hardcode a one-off component per app — use the registry pattern. Do NOT add Slack here (it's Composio-managed).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`react-dashboard`, `security`] — card shells/forms + encrypted-secret handling, no value display

  **Parallelization**: Can Run In Parallel: NO (after 16) · Wave 3 · Blocks: 18 · Blocked By: 16

  **References**:
  - `dashboard/src/pages/composio/IntegrationCard.tsx` — the card + ActionArea state machine to extend with a "credentials form" variant
  - `dashboard/src/pages/ComposioConnections.tsx:186-204` — the "Available to connect now" section where these cards render
  - `src/gateway/routes/admin-tenant-secrets.ts:27,53,88` — secrets API: list keys, set, delete
  - Live secret keys today: `hostfully_api_key`, `hostfully_agency_uid`, `sifely_username`, `sifely_password`
  - `docs/employees/guest-messaging.md` (Hostfully), `docs/employees/code-rotation.md` (Sifely)
  - `security` skill — AES-256-GCM secret storage, never return values

  **Acceptance Criteria**:
  - [ ] Hostfully and Sifely render as cards in "Available to connect now"
  - [ ] Connect opens a form; saving writes encrypted secrets via the secrets API
  - [ ] Status shows "Connected" when required secrets exist; Disconnect removes them
  - [ ] Secret values are never rendered back; adding a new niche app is a registry entry
  - [ ] `pnpm dashboard:build` + tests pass

  **QA Scenarios**:

  ```
  Scenario: Connect Hostfully via the credentials form
    Tool: Playwright (CDP) + Bash (psql)
    Steps:
      1. On /dashboard/integrations, find the Hostfully card → click Connect
      2. Fill API Key + Agency UID with test values; submit
      3. Assert card flips to "Connected"
      4. psql tenant_secrets — assert hostfully_api_key + hostfully_agency_uid rows exist (ciphertext, not plaintext)
    Expected Result: credentials saved encrypted, status reflects connection
    Evidence: .sisyphus/evidence/task-17-niche-cards/ (screenshot + secret-rows.txt)

  Scenario: Secret values are never shown back
    Tool: Playwright (CDP)
    Steps:
      1. Reload the page on a Connected Hostfully
      2. Open the form again — assert fields are empty/masked, not pre-filled with the stored secret
    Expected Result: no secret leakage to the UI
    Evidence: .sisyphus/evidence/task-17-niche-cards/no-leak.png
  ```

  **Commit**: YES — `feat(dashboard): add custom-credential apps (Hostfully, Sifely) to integrations`

- [x] 18. **E2E — unified integrations page (Composio connect + niche credential save)**

  **What to do**:
  - On the running dashboard, exercise the unified page end-to-end: (a) connect/disconnect a Composio app, (b) save Hostfully credentials via the form and confirm encrypted persistence, (c) confirm the old custom-page URL redirects.

  **Must NOT do**:
  - Do NOT accept build-only evidence — real browser interaction + DB check required.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`playwright`]

  **Parallelization**: Can Run In Parallel: YES (with 12-15) · Wave 4 · Blocks: Final · Blocked By: 16, 17

  **References**:
  - `e2e-testing` skill — Playwright via CDP against `localhost:7700/dashboard`
  - Tasks 16 & 17 (the UI under test)

  **Acceptance Criteria**:
  - [ ] Unified page loads at `/dashboard/integrations`; old URL redirects (no 404)
  - [ ] A Composio app connect flow opens the OAuth popup (or shows connected state)
  - [ ] Hostfully form save persists encrypted secrets (psql confirms)

  **QA Scenarios**:

  ```
  Scenario: Full unified-integrations page exercise
    Tool: Playwright (CDP) + Bash (psql)
    Steps:
      1. Open /dashboard/integrations — assert unified page
      2. Save Hostfully creds via form — psql confirms encrypted rows
      3. Hit old /dashboard/integrations/composio — assert canonical resolution/redirect
    Expected Result: all interactions work against real UI + DB
    Evidence: .sisyphus/evidence/task-18-integrations-e2e/
  ```

  **Commit**: NO

- [x] 19. Remove dead credential endpoints (Notion/Jira/Google OAuth + GitHub App flow + disconnect routes)

  **What to do**:
  - Now that Notion/Google/Jira/GitHub/Slack all go through Composio and the custom UI page is gone, remove the dead gateway endpoints:
    - `src/gateway/routes/notion-oauth.ts`, `src/gateway/routes/jira-oauth.ts`, `src/gateway/routes/google-oauth.ts`, `src/gateway/routes/github-oauth.ts` (install/callback flows)
    - `src/gateway/routes/admin-google.ts` and `src/gateway/routes/internal-google-token.ts` (Google token management — replaced by Composio)
    - The Notion, Jira, AND Slack DELETE/disconnect routes in `src/gateway/routes/admin-integrations.ts` (all replaced by Composio disconnect)
  - **Slack OAuth flow (`slack-oauth.ts`) — DECIDE CAREFULLY**: with Slack now Composio-managed (Task 5), the user connects Slack via Composio's connect flow, so `/slack/install` + `/slack/oauth_callback` become dead. BUT `TenantInstallationStore.fetchInstallation` resolves the bot token by `teamId → tenant` via the `slack` integration record (`integrationRepo.findByExternalId('slack', teamId)`) that `slack-oauth.ts` used to create. Before removing `slack-oauth.ts`, ensure the `teamId → tenant` mapping is still established by the Composio connect path (Task 5 must persist the slack integration record / teamId when it syncs the token). If Task 5 does not yet create that mapping, KEEP `slack-oauth.ts` and flag it; do NOT remove it blindly.
  - Unregister each removed router in `src/gateway/server.ts`. Remove now-unused imports, helpers (`generateInstallationToken` if not already removed in Task 4, `google-token-manager.ts` if unused), and their tests.
  - **KEEP**: the generic secrets API (`admin-tenant-secrets.ts`), `internal-github-token.ts` (re-sourced, still used by get-token.ts), `composio-oauth.ts`/`composio-catalog.ts`, the Bolt Socket Mode setup in `server.ts`, `installation-store.ts` (still resolves the bot token at runtime).
  - **Verify before deleting each route**: grep the dashboard, onboarding, docs, and server.ts for references. If anything still calls a route, resolve it first. Run `pnpm build` + `pnpm test`.

  **Must NOT do**:
  - Do NOT remove the secrets API, the Composio routes, `internal-github-token.ts`, the Socket Mode setup, or `installation-store.ts`. Do NOT remove `slack-oauth.ts` UNLESS the Composio connect path (Task 5) provably establishes the `teamId → tenant` mapping that `installation-store.ts` depends on. Do NOT remove a route without grepping for callers first. Do NOT touch the `xapp-`/Socket Mode listener.

  **Recommended Agent Profile**:
  - **Category**: `deep` — multi-file removal with caller-verification
  - **Skills**: [`api-design`] — route registration, server.ts wiring

  **Parallelization**: Can Run In Parallel: NO (after migration + UI) · Wave 3 · Blocks: 15, Final · Blocked By: 4, 5, 6, 7, 16

  **References**:
  - `src/gateway/routes/admin-integrations.ts` — Notion/Jira/Slack disconnect routes to remove (all Composio-managed now)
  - `src/gateway/routes/{notion,jira,google,github}-oauth.ts` — install/callback flows to remove
  - `src/gateway/routes/admin-google.ts`, `src/gateway/routes/internal-google-token.ts` — Google management to remove
  - `src/gateway/routes/slack-oauth.ts` — removable ONLY if Task 5 established the teamId→tenant mapping via Composio; else KEEP + flag
  - `src/gateway/slack/installation-store.ts` — KEEP (runtime bot-token resolver, depends on the teamId→tenant mapping)
  - `src/gateway/server.ts` — where routers are registered/unregistered
  - `src/gateway/services/github-token-manager.ts`, `google-token-manager.ts` — remove if unused after route removal

  **Acceptance Criteria**:
  - [ ] notion/jira/google/github OAuth route files removed + unregistered in server.ts
  - [ ] Notion/Jira disconnect routes removed from admin-integrations.ts; Slack disconnect KEPT
  - [ ] `slack-oauth.ts`, secrets API, Composio routes, internal-github-token.ts all intact
  - [ ] No dangling imports; `pnpm build` + `pnpm test` clean
  - [ ] grep confirms no remaining caller of any removed route

  **QA Scenarios**:

  ```
  Scenario: Dead endpoints removed, kept endpoints intact, build green
    Tool: Bash (grep + build + curl)
    Steps:
      1. ls src/gateway/routes/ — assert notion/jira/google/github-oauth.ts absent; slack-oauth.ts present
      2. grep server.ts — assert removed routers unregistered, slack + composio + secrets registered
      3. curl a removed route (e.g. /integrations/notion/install) — assert 404
      4. curl /slack/install?tenant=<slug> — assert still works (302)
      5. pnpm build && pnpm test -- --run — assert pass
    Expected Result: clean removal, kept routes functional
    Evidence: .sisyphus/evidence/task-19-endpoint-removal/
  ```

  **Commit**: YES — `refactor(gateway): remove dead Notion/Jira/Google/GitHub credential endpoints`

- [x] 20. Prune obsolete tenant secrets (notion*\*, google*\_, jira\_\_, github_installation_id)

  > Runs LAST, after the migrated employees' live E2Es (Tasks 12-14) prove nothing reads these secrets. Irreversible data change — gated behind proof.

  **What to do**:
  - After Tasks 12, 13, 14 pass (Notion/Google/GitHub employees confirmed working via Composio), delete the now-obsolete secret keys from `tenant_secrets` for the affected tenant(s): `notion_access_token`, `notion_refresh_token`, `notion_workspace_id`, `notion_workspace_name`, `google_access_token`, `google_refresh_token`, `google_token_expiry`, `google_granted_scopes`, `google_user_email`, `jira_access_token`, `jira_refresh_token`, `jira_cloud_id`, `jira_site_url`, `github_installation_id`.
  - **KEEP**: `slack_bot_token` (still the runtime source for Bolt's bot token, now populated from Composio), `hostfully_*`, `sifely_*` (niche, still used), and `COMPOSIO_API_KEY`-class platform env (not a tenant secret).
  - **Back up the DB first** (AGENTS.md Database Backup rule) before deleting. Use the secrets DELETE API or a scripted prune; soft-delete semantics if the table supports it.
  - Confirm the secrets tab no longer shows the obsolete keys and the migrated employees still run (quick re-trigger or rely on Tasks 12-14 evidence).

  **Must NOT do**:
  - Do NOT delete `slack_bot_token`, `hostfully_*`, or `sifely_*`. Do NOT run before Tasks 12-14 pass. Do NOT skip the DB backup.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`security`, `prisma`] — secret handling, backup-before-mutation

  **Parallelization**: Can Run In Parallel: NO (gated) · Wave 4 · Blocks: Final · Blocked By: 12, 13, 14

  **References**:
  - `src/gateway/routes/admin-tenant-secrets.ts:87-115` — secret DELETE endpoint
  - Live obsolete keys (from DB verification): notion*\*, google*\_, jira\_\_, github_installation_id
  - AGENTS.md § Database Backup (MANDATORY before mutation)
  - `dashboard/src/panels/tenants/TenantOverview.tsx` — secrets tab (dynamic; will reflect the prune automatically)

  **Acceptance Criteria**:
  - [ ] DB backed up before prune (backup path recorded in evidence)
  - [ ] Obsolete notion/google/jira/github_installation_id secrets removed for affected tenant(s)
  - [ ] slack*bot_token, hostfully*\_, sifely\_\_ retained
  - [ ] Secrets tab no longer lists the obsolete keys; migrated employees still run

  **QA Scenarios**:

  ```
  Scenario: Obsolete secrets pruned, essential secrets retained
    Tool: Bash (psql)
    Steps:
      1. Back up DB; record path
      2. Delete obsolete keys for the tenant
      3. psql: assert notion_*/google_*/jira_*/github_installation_id absent
      4. psql: assert slack_bot_token, hostfully_*, sifely_* present
    Expected Result: targeted prune, essentials intact
    Evidence: .sisyphus/evidence/task-20-secret-prune/ (backup-path.txt, before.txt, after.txt)
  ```

  **Commit**: NO (data change; evidence under `.sisyphus/`)

---

## Final Verification Wave (MANDATORY — after ALL implementation + E2E tasks)

> Runs AFTER Tasks 12-15 (live E2E) pass. 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Never mark F1-F4 checked before the user's okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command, psql query). For each "Must NOT Have": search the codebase for forbidden patterns (deleted hostfully/sifely/knowledge_base/platform; changes to SLACK_APP_TOKEN/Socket Mode listener; wizard tiebreaker rule; `main` referencing a deleted tool) — reject with file:line if found. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit` + `pnpm dashboard:build` + dashboard tests. Review changed files for `as any`/`@ts-ignore`, empty catches, leaked tokens in logs, AI slop. Verify the Composio token helper handles errors (connection missing, masked value) and never logs the token. Verify no dangling imports/refs to deleted tools. Verify the dashboard niche-credential forms never render secret values back and use the encrypted secrets API only.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Live E2E Evidence Audit** — `unspecified-high` (+ `e2e-testing`)
      Audit Tasks 12-15 evidence in `.sisyphus/evidence/` for sufficiency: real task IDs, `task_status_log` traces to `Done`, `task_composio_calls` rows (re-verify live via psql), GitHub PR URL, Slack button round-trip proof. If any evidence is missing/stale, REJECT and require re-run.
      Output: `Notion E2E [Y/N] | Google E2E [Y/N] | GitHub E2E [Y/N] | Slack E2E [Y/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — everything specced was built, nothing beyond spec. Confirm only notion/google/jira tools deleted; slack/github tools byte-unchanged; gateway Slack listener untouched; gateway OAuth install routes NOT deleted (UI-only removal); niche credentials stored only via the encrypted secrets API; no per-tenant migration tooling crept in.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [ ] F5. **Documentation Freshness** — update AGENTS.md (shell-tool table: remove notion/google/jira rows; note GitHub + Slack auth now via Composio with own-app creds; `xapp-` SLACK_APP_TOKEN remains the only self-held Slack token), employee docs (`cleaning-schedule.md`, `google-assistant.md`, `engineer.md`), the GitHub integration guide (`docs/guides/2026-06-02-1727-github-integration.md` — App-install flow removed, now Composio), the Slack integration guide (`docs/guides/2026-05-14-0040-slack-tenant-integration.md` — bot token now from Composio, xapp- still in env), the dashboard/integrations docs (unified page; Slack native + Hostfully/Sifely as credential cards), and any guide referencing the deleted tools, removed endpoints, or the old integrations page. Per AGENTS.md Documentation Freshness rule.

- [ ] F6. **Tmux cleanup** — kill all `ai-*` tmux sessions created during execution.

- [ ] F7. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

## Commit Strategy

One commit per task (or tightly-coupled pair). Conventional commits. Never `--no-verify`. No AI/Co-authored-by references. Critical ordering: employee rewrites (T6/T7) + seed (T9) must land BEFORE or WITH tool deletion (T8) so `main` never references a deleted tool.

## Success Criteria

### Verification Commands

```bash
pnpm build                                  # Expected: clean
pnpm lint                                   # Expected: clean
pnpm test -- --run                          # Expected: 0 failures
ls src/worker-tools/                        # Expected: no notion/ google/ jira/
psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT role_name FROM archetypes WHERE deleted_at IS NULL AND status='active' AND (execution_steps LIKE '%/tools/notion/%' OR execution_steps LIKE '%/tools/google/%' OR execution_steps LIKE '%/tools/jira/%');"   # Expected: zero rows
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All four live E2Es passed (Notion, Google, GitHub, Slack)
- [ ] `main` never references a deleted tool at any commit
