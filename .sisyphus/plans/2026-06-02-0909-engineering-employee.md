# Engineering Employee — Full Stack: GitHub App + Wizard + Runtime

## TL;DR

> **Quick Summary**: Enable anyone to create code-writing AI employees through the dashboard wizard — backed by GitHub App OAuth for secure repo access, a repo picker in the wizard, archetype generator auto-detection of code-writing intent, and the execution runtime that clones, codes, tests, and creates PRs. No artificial limits on file count or retry attempts.
>
> **Deliverables**:
>
> - GitHub App OAuth integration (dashboard Connect button, OAuth route, token manager)
> - Wizard repo picker (list repos from GitHub installation, store in worker_env)
> - Archetype generator enhancement (auto-detect code employees, include git/PR patterns)
> - Platform rules override mechanism (per-archetype AGENTS.md rule suppression)
> - Internal token generation endpoint + shell tool (task-scoped auth, on-demand tokens)
> - E2E verified: wizard → create code employee → trigger → clone → code → test → PR → approve → deliver
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: T1 (shared OAuth utility) → T4 (GitHub OAuth route) → T6 (token manager) → T7 (token endpoint) → T8 (shell tool) → T11 (archetype generator) → T15 (E2E)

---

## Context

### Original Request

"If you were to help me leverage this AI employee platform so that it can spin up AI employees to write features, bug fixes, or enhancements for this code itself, how would you do it?"

### Interview Summary

**Key Decisions**:

- **Employee creation**: Via dashboard wizard, NOT direct DB seeding — stress-tests that anyone can create code-writing employees
- **GitHub auth**: GitHub App (not OAuth App) — bot identity, fine-grained permissions, store `installation_id` per tenant, generate short-lived tokens on demand
- **Repo selection**: Picker in wizard listing repos from GitHub App installation. Each employee tied to one repo.
- **Auto-detection**: Archetype generator auto-detects code-writing intent from description and adds git/PR patterns
- **No artificial limits**: No max file count, no retry cap. Let the agent work as long as it needs.
- **Always require approval**: `approval_required: true`. PRs always human-reviewed before merge.
- **Branching**: Employee creates its own branch per task (e.g. `ai/{taskId}-{slug}`), NOT configured at wizard time. Just like a real engineer picks a branch per assignment.
- **Per-trigger instructions**: Simple text box on dashboard trigger button — "What should this employee work on?" The trigger payload flows into the employee's initial prompt so it knows the assignment.
- **Delivery**: After PM approval, Slack summary with PR link. PM manually merges.
- **Clarification questions**: OUT OF SCOPE — requires 5 new infrastructure pieces, separate plan.
- **Execution vs Delivery clarified**: PR is created during execution (before container dies). Approval card references the PR. Delivery just posts final Slack summary with PR link. No auto-merge.

**Research Findings**:

- Docker container already has Node.js 22, pnpm, git, gh CLI v2.45.0, OpenCode — ready for code development
- 3 existing OAuth integrations (Slack, Jira, Notion) follow identical pattern — GitHub is the 4th
- `signState`/`verifyState` duplicated across 3 OAuth files — must extract to shared utility
- GitHub App installation callback is DIFFERENT from OAuth2 code flow — receives `installation_id`, not `code`
- `worker_env` already exists in archetype schema, already injected into containers — no migration needed for repo config
- Trigger API already accepts JSON body → stored as `trigger_payload` in task — plumbing for per-trigger instructions partially exists
- Platform AGENTS.md rule "NEVER modify files outside /tools/" is a hard blocker — must add per-archetype override mechanism
- Installation tokens expire in 1 hour — shell tool calling internal gateway endpoint is the correct token generation approach
- `GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY` are platform-level (`.env`), `installation_id` is tenant-level (`tenant_secrets`)

### Metis Review

**Identified Gaps** (addressed):

- **Platform rules override is a hard blocker**: No mechanism exists to suppress the file-write restriction for code employees — must add `platform_rules_override` field to archetypes + compiler support
- **GitHub App callback is different**: Receives `?installation_id=...&setup_action=...`, NOT `?code=...` — cannot copy-paste existing OAuth template
- **Token generation**: Pre-generating tokens in lifecycle breaks long tasks (1hr expiry). Shell tool calling task-scoped internal endpoint is the correct approach.
- **`worker_env` not in generator output**: Archetype generator schema has no `worker_env` field — must add for code employees
- **`worker_env` not set by wizard**: Wizard currently never sets `worker_env` — must update
- **Concurrent code tasks**: Must set `concurrency_limit: 1` for code-writing employees
- **Repo validation**: Should verify `GITHUB_REPO_URL` belongs to tenant's installation (deferred to v2)
- **Org admin requirement**: GitHub App installation on orgs requires admin — document in UI, don't solve programmatically
- **Branch should not be wizard-configured**: Employee creates its own branch per task — removed branch picker from wizard
- **Per-trigger instructions missing**: Code employees need different instructions each trigger ("fix bug X", "add feature Y"). Trigger payload already flows to task — harness must forward `trigger_payload.prompt` to initial OpenCode message, and dashboard needs a text input on the trigger button
- **Execution vs delivery boundary**: PR must be created during execution (container dies after). Delivery phase only posts Slack summary with PR link. No auto-merge.

---

## Work Objectives

### Core Objective

Enable anyone to create code-writing AI employees through the dashboard wizard, backed by secure GitHub App OAuth, a repo picker, and the execution runtime — all without modifying the universal lifecycle.

### Concrete Deliverables

- GitHub App OAuth route (`src/gateway/routes/github-oauth.ts`)
- Shared OAuth state utility (`src/gateway/lib/oauth-state.ts`)
- GitHub token manager service (`src/gateway/services/github-token-manager.ts`)
- Internal token endpoint (`POST /internal/tasks/:taskId/github-token`)
- GitHub shell tools (`src/worker-tools/github/get-token.ts`)
- Dashboard: GitHub row in IntegrationsPage
- Dashboard: Repo picker in wizard edit step
- Archetype generator: code-writing auto-detection + git/PR patterns
- `platform_rules_override` field on archetypes + compiler support
- Prisma migration for `platform_rules_override`
- Harness enhancement: forward `trigger_payload.prompt` to initial OpenCode message
- Dashboard: trigger-with-instructions text input on employee trigger action
- `.env.example` updates for GitHub App env vars
- Employee documentation (`docs/employees/engineer.md`)
- AGENTS.md + README.md updates

### Definition of Done

- [ ] A user can connect GitHub via the dashboard Integrations page
- [ ] A user can create a code-writing employee via the wizard (describe → generate → pick repo → save) — no branch picker, employee creates branches per-task
- [ ] Triggering the employee shows a text input for per-task instructions ("What should this employee work on?")
- [ ] The employee receives the trigger instructions as part of its initial prompt and acts on them
- [ ] Triggering the employee creates a task that clones the repo, writes code, runs tests, creates a PR, and submits for approval
- [ ] After Slack approval, a delivery message with the PR link is posted
- [ ] Non-code employees are completely unaffected (motivation-bot still reaches Done, platform rules still enforced, trigger without instructions still works)

### Must Have

- GitHub App OAuth flow: dashboard button → install redirect → callback → store `installation_id`
- Shared `signState`/`verifyState` utility (extracted from existing OAuth files)
- Repo listing endpoint: `GET /admin/tenants/:tenantId/github/repos`
- Wizard repo picker with `SearchableSelect` component (repo only — no branch picker)
- `platform_rules_override` archetype field + compiler support
- Harness forwards `trigger_payload.prompt` to initial OpenCode message (enables per-task instructions)
- Dashboard trigger button shows text input: "What should this employee work on?"
- Internal token endpoint with task-scoped authentication (NOT `ADMIN_API_KEY`)
- GitHub `get-token.ts` shell tool
- Archetype generator auto-detection of code-writing intent
- `worker_env` in generator output schema for code employees
- `concurrency_limit: 1` for generated code-writing archetypes
- `vm_size: 'performance-1x'` for code-writing archetypes
- `approval_required: true` for code-writing archetypes

### Must NOT Have (Guardrails)

- **No lifecycle code changes** — `employee-lifecycle.ts` stays untouched
- **No modifications to deprecated files** — `lifecycle.ts`, `orchestrate.mts`, `redispatch.ts`
- **No modifications to `src/workers/config/agents.md`** — use `platform_rules_override` mechanism instead
- **No `ADMIN_API_KEY` in containers** — use task-scoped auth for internal endpoints
- **No pre-generated tokens in lifecycle** — always generate on demand via shell tool
- **No artificial file count or retry limits** in execution_steps
- **No auto-merge** — PM manually merges after reviewing the PR
- **No branch picker in wizard** — employee creates its own branch per task (like a real engineer)
- **No clarification questions mid-execution** — separate plan (per-trigger instructions at trigger time IS in scope)
- **No GitHub webhook receiver** — manual trigger only for MVP
- **No copy-pasting `signState`/`verifyState`** into a 4th OAuth file
- **No code employee detection altering non-code employee generation**

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES — vitest, `pnpm test -- --run`
- **Automated tests**: YES (tests-after) — unit tests for OAuth route, token manager, shell tool, compiler override
- **Framework**: vitest

### QA Policy

Every task includes agent-executed QA scenarios.

- **API/Backend**: Bash (curl) + psql
- **Dashboard/UI**: Playwright
- **Shell tools**: Bash (docker run)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — prerequisites for everything):
├── T1: Extract signState/verifyState to shared utility + migrate existing OAuth files [unspecified-high]
├── T2: Add platform_rules_override field to archetypes schema + compiler support [deep]
├── T3: Container capability spike — git auth, clone, install, test [deep]
└── T18: Harness: forward trigger_payload.prompt to initial OpenCode message [unspecified-high]

Wave 2 (GitHub App Integration):
├── T4: GitHub App OAuth route (install + callback) [unspecified-high]
├── T5: Dashboard GitHub integration row in IntegrationsPage [visual-engineering]
├── T6: GitHub token manager service [unspecified-high]
└── T7: Internal token endpoint (POST /internal/tasks/:taskId/github-token) [unspecified-high]

Wave 3 (Shell Tools + Wizard + Trigger UX):
├── T8: GitHub get-token shell tool [quick]
├── T9: Repo listing endpoint (GET /admin/tenants/:tenantId/github/repos) [quick]
├── T10: Wizard repo picker in edit step (repo only — no branch picker) [visual-engineering]
├── T11: Archetype generator code-writing enhancement [deep]
└── T19: Dashboard trigger-with-instructions text input [visual-engineering]

Wave 4 (Documentation + env):
├── T12: .env.example updates for GitHub App vars [quick]
├── T13: Employee documentation (docs/employees/engineer.md) [writing]
└── T14: AGENTS.md + README.md updates [quick]

Wave 5 (E2E Validation):
├── T15: E2E happy path — wizard → create → trigger with instructions → PR → approve → deliver → Done [deep]
├── T16: E2E regression — verify non-code employees unaffected [quick]
└── T17: Notify completion via Telegram [quick]

Wave FINAL (4 parallel reviews → user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
```

### Dependency Matrix

| Task | Depends On    | Blocks         | Wave |
| ---- | ------------- | -------------- | ---- |
| T1   | —             | T4             | 1    |
| T2   | —             | T11, T15       | 1    |
| T3   | —             | T8, T15        | 1    |
| T18  | —             | T15, T19       | 1    |
| T4   | T1            | T5, T6, T7, T9 | 2    |
| T5   | T4            | T10            | 2    |
| T6   | T4            | T7             | 2    |
| T7   | T6            | T8             | 2    |
| T8   | T3, T7        | T11, T15       | 3    |
| T9   | T4            | T10            | 3    |
| T10  | T5, T9        | T15            | 3    |
| T11  | T2, T8        | T15            | 3    |
| T19  | T18           | T15            | 3    |
| T12  | T4            | —              | 4    |
| T13  | T11           | —              | 4    |
| T14  | T11           | —              | 4    |
| T15  | T10, T11, T19 | T17            | 5    |
| T16  | T2, T18       | T17            | 5    |
| T17  | T15, T16      | —              | 5    |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `unspecified-high`, T2 `deep`, T3 `deep`, T18 `unspecified-high`
- **Wave 2**: 4 tasks — T4 `unspecified-high`, T5 `visual-engineering`, T6 `unspecified-high`, T7 `unspecified-high`
- **Wave 3**: 5 tasks — T8 `quick`, T9 `quick`, T10 `visual-engineering`, T11 `deep`, T19 `visual-engineering`
- **Wave 4**: 3 tasks — T12 `quick`, T13 `writing`, T14 `quick`
- **Wave 5**: 3 tasks — T15 `deep`, T16 `quick`, T17 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Extract signState/verifyState to shared OAuth utility + migrate existing files

  **What to do**:
  - Create `src/gateway/lib/oauth-state.ts` with `signState()` and `verifyState()` functions extracted from the existing OAuth files
  - Update `src/gateway/routes/slack-oauth.ts`, `jira-oauth.ts`, and `notion-oauth.ts` to import from the shared utility instead of their inline copies
  - Run `pnpm build` and `pnpm test -- --run` to verify no regressions
  - Write unit tests for the shared utility

  **Must NOT do**: Change any OAuth behavior — purely a DRY refactor.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: Multi-file refactor with regression risk
  - **Skills**: [] — No domain-specific skills needed

  **Parallelization**: Wave 1, parallel with T2 and T3. Blocks T4.

  **References**:
  - `src/gateway/routes/slack-oauth.ts:10-35` — `signState` and `verifyState` functions (canonical copy)
  - `src/gateway/routes/jira-oauth.ts:10-35` — Identical copy
  - `src/gateway/routes/notion-oauth.ts:10-35` — Identical copy
  - `src/lib/encryption.ts` — `ENCRYPTION_KEY` used by `signState`

  **Acceptance Criteria**:
  - [ ] `src/gateway/lib/oauth-state.ts` exists with exported `signState()` and `verifyState()`
  - [ ] All 3 existing OAuth files import from shared utility (zero inline `signState`/`verifyState`)
  - [ ] `pnpm build` passes, `pnpm test -- --run` passes
  - [ ] Unit tests for `signState`/`verifyState` roundtrip

  **QA Scenarios**:

  ```
  Scenario: Shared utility roundtrip
    Tool: Bash (pnpm test)
    Steps: Run unit test that signs a payload and verifies it
    Expected: Test passes
    Evidence: .sisyphus/evidence/task-1-oauth-state-tests.txt

  Scenario: Existing OAuth flows still work
    Tool: Bash (pnpm build + pnpm test)
    Steps: Build and run full test suite
    Expected: Zero new failures
    Evidence: .sisyphus/evidence/task-1-regression.txt
  ```

  **Commit**: YES — `refactor(oauth): extract signState/verifyState to shared utility`

---

- [x] 2. Add platform_rules_override field to archetypes + compiler support

  **What to do**:
  - Add `platform_rules_override String?` field to the `Archetype` model in `prisma/schema.prisma`
  - Create and run Prisma migration
  - Update `src/workers/lib/agents-md-compiler.mts` to check `archetype.platform_rules_override`: if set, use it instead of the default platform rules from `src/workers/config/agents.md`
  - Update the archetype Zod schemas in `src/gateway/routes/admin-archetypes.ts` to accept `platform_rules_override`
  - Write unit tests for the compiler override behavior
  - Verify non-code employees still get the default platform rules (regression test)

  **Must NOT do**: Modify `src/workers/config/agents.md` directly. Do NOT change behavior for existing employees.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: Schema migration + compiler modification with critical regression risk
  - **Skills**: []

  **Parallelization**: Wave 1, parallel with T1 and T3. Blocks T11 and T15.

  **References**:
  - `prisma/schema.prisma` — Archetype model (add field near other optional fields)
  - `src/workers/lib/agents-md-compiler.mts:85-95` — Where platform rules are appended to compiled AGENTS.md
  - `src/workers/config/agents.md` — The default platform rules content (never modify this file)
  - `src/gateway/routes/admin-archetypes.ts:60-120` — Archetype Zod schemas

  **Acceptance Criteria**:
  - [ ] Migration runs successfully
  - [ ] PostgREST cache reloaded (`NOTIFY pgrst, 'reload schema'`)
  - [ ] Compiler uses override when `platform_rules_override` is set
  - [ ] Compiler uses default rules when `platform_rules_override` is null
  - [ ] `pnpm build` + `pnpm test -- --run` pass

  **QA Scenarios**:

  ```
  Scenario: Override suppresses default rules
    Tool: Bash (unit test)
    Steps: Compile AGENTS.md with archetype that has platform_rules_override set. Assert output does NOT contain "NEVER modify files outside /tools/".
    Expected: Override content present, default rule absent
    Evidence: .sisyphus/evidence/task-2-compiler-override.txt

  Scenario: Default rules preserved when no override
    Tool: Bash (unit test)
    Steps: Compile AGENTS.md with archetype that has platform_rules_override = null. Assert output DOES contain "NEVER modify files outside /tools/".
    Expected: Default platform rules present
    Evidence: .sisyphus/evidence/task-2-compiler-default.txt
  ```

  **Commit**: YES — `feat(archetype): add platform_rules_override field and compiler support`

---

- [x] 3. Container capability spike — validate git auth, clone, install, test

  **What to do**:
  - Run a bare `ai-employee-worker:latest` container and verify: `gh --version`, `git --version`, `pnpm --version`
  - Test git clone with HTTPS token auth: `git clone https://x-access-token:$GITHUB_TOKEN@github.com/dozal-devs/ai-employee /tmp/workspace`
  - Test `pnpm install --frozen-lockfile` inside the cloned repo
  - Test `pnpm build`, `pnpm lint`, `pnpm test -- --run` inside the container
  - Time each step and record durations
  - Test file writes to `/tmp/workspace/` work from OpenCode's perspective
  - If any step fails, document the failure clearly — this blocks Features D and E

  **Must NOT do**: Create PRs, push branches, or modify source code.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: Systematic environment validation
  - **Skills**: []

  **Parallelization**: Wave 1, parallel with T1 and T2. Blocks T8 and T15.

  **References**:
  - `Dockerfile` — Container build spec
  - `src/workers/entrypoint.sh:30-85` — Deprecated but proven git auth pattern

  **QA Scenarios**:

  ```
  Scenario: All dev tools available
    Tool: Bash (docker run)
    Steps: docker run --rm ai-employee-worker:latest bash -c 'gh --version && git --version && pnpm --version && node --version'
    Expected: All 4 commands succeed with version output
    Evidence: .sisyphus/evidence/task-3-tool-versions.txt

  Scenario: Clone + install + build + test
    Tool: Bash (docker run, 600s timeout)
    Steps: Full pipeline in single container run, timing each step
    Expected: All steps pass. Record timings.
    Evidence: .sisyphus/evidence/task-3-full-pipeline.txt
  ```

  **Commit**: NO (spike only)

---

- [x] 4. GitHub App OAuth route — install redirect and callback handler

  **What to do**:
  - Create `src/gateway/routes/github-oauth.ts` with two routes:
    - `GET /integrations/github/install?tenant=<slug>` — validates tenant, signs state, redirects to `https://github.com/apps/{APP_NAME}/installations/new?state=...`
    - `GET /integrations/github/callback?installation_id=...&setup_action=install&state=...` — verifies state, stores `installation_id` as tenant secret (`github_installation_id`), upserts `tenant_integrations` row with `provider: 'github'`, redirects to dashboard
  - **CRITICAL**: GitHub App callback is NOT an OAuth2 code flow. It receives `installation_id` and `setup_action`, NOT `code`. No token exchange step.
  - Import `signState`/`verifyState` from the shared utility (T1)
  - Register route in `src/gateway/server.ts`: `app.use('/integrations', githubOAuthRoutes({ prisma }))`
  - Add `GITHUB_APP_NAME` to `.env.example` (the App's URL slug for the install redirect)
  - Write unit tests for the route handler

  **Must NOT do**: Copy-paste `signState`/`verifyState` — import from shared utility. Do NOT implement OAuth2 code flow.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: New OAuth route following established patterns but with different callback
  - **Skills**: []

  **Parallelization**: Wave 2, parallel with T5, T6, T7. Blocked by T1. Blocks T5, T6, T7, T9.

  **References**:
  - `src/gateway/routes/notion-oauth.ts` — Cleanest existing OAuth template (follow structure, NOT callback logic)
  - `src/gateway/routes/jira-oauth.ts` — Another reference for route structure
  - `src/gateway/lib/oauth-state.ts` — Shared utility from T1
  - `src/gateway/services/tenant-secret-repository.ts` — `set()` for storing installation_id
  - `src/gateway/services/tenant-integration-repository.ts` — `upsert()` for integration record
  - `src/gateway/server.ts:200-210` — Where other OAuth routes are registered

  **QA Scenarios**:

  ```
  Scenario: Install redirect works
    Tool: Bash (curl)
    Steps: curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "http://localhost:7700/integrations/github/install?tenant=vlre"
    Expected: 302 redirect to https://github.com/apps/...
    Evidence: .sisyphus/evidence/task-4-install-redirect.txt

  Scenario: Build and tests pass
    Tool: Bash
    Steps: pnpm build && pnpm test -- --run
    Expected: All pass
    Evidence: .sisyphus/evidence/task-4-build-test.txt
  ```

  **Commit**: YES — `feat(github): add GitHub App OAuth install and callback routes`

---

- [x] 5. Dashboard GitHub integration row in IntegrationsPage

  **What to do**:
  - Add a new `IntegrationRow` for GitHub in `dashboard/src/panels/integrations/IntegrationsPage.tsx`
  - Connect URL: `${GATEWAY_URL}/integrations/github/install?tenant=${tenant.slug}`
  - Show "Connected" badge when `tenant_integrations` has a `provider: 'github'` row
  - Show "Connect GitHub" button when not connected
  - Include a brief description: "Connect GitHub to let AI employees access your repositories"

  **Must NOT do**: Modify any other integration rows.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: Dashboard UI component
  - **Skills**: []

  **Parallelization**: Wave 2, parallel with T4, T6, T7. Blocked by T4. Blocks T10.

  **References**:
  - `dashboard/src/panels/integrations/IntegrationsPage.tsx` — Existing integration rows (Slack, Jira, Notion) to follow exact pattern

  **QA Scenarios**:

  ```
  Scenario: GitHub row renders in integrations page
    Tool: Playwright
    Steps: Navigate to /dashboard/integrations?tenant=vlre. Assert text "GitHub" visible. Assert "Connect GitHub" button visible.
    Expected: GitHub integration row present
    Evidence: .sisyphus/evidence/task-5-integrations-page.png
  ```

  **Commit**: YES — `feat(dashboard): add GitHub integration row`

---

- [x] 6. GitHub token manager service

  **What to do**:
  - Create `src/gateway/services/github-token-manager.ts`
  - Implement `generateInstallationToken(installationId: number): Promise<{token: string, expires_at: string}>`
  - Uses `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` from process.env (platform-level, NOT tenant secrets)
  - Generates JWT (RS256, 10min expiry) signed with the private key
  - Calls `POST https://api.github.com/app/installations/${installationId}/access_tokens` with the JWT
  - Returns the installation token (`ghs_...`) and its expiry time
  - Implement in-memory token cache with 55-minute TTL (tokens last 60min, refresh with 5min buffer)
  - Consider using `@octokit/app` for JWT generation if it simplifies implementation
  - Write unit tests with mocked GitHub API responses

  **Must NOT do**: Store generated tokens in the database. Access `tenant_secrets` (that's the caller's job).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: Crypto/JWT service with external API integration
  - **Skills**: []

  **Parallelization**: Wave 2. Blocked by T4 (needs OAuth flow working). Blocks T7.

  **References**:
  - `src/lib/call-llm.ts` — Example of an external API client service in the codebase
  - GitHub API docs: `POST /app/installations/{id}/access_tokens` — https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app

  **QA Scenarios**:

  ```
  Scenario: Token generation with valid installation_id
    Tool: Bash (unit test)
    Steps: Run unit test that mocks GitHub API and generates a token
    Expected: Returns {token: "ghs_...", expires_at: "..."}
    Evidence: .sisyphus/evidence/task-6-token-manager-test.txt
  ```

  **Commit**: YES (grouped with T7)

---

- [x] 7. Internal token endpoint (POST /internal/tasks/:taskId/github-token)

  **What to do**:
  - Create an internal gateway route: `POST /internal/tasks/:taskId/github-token`
  - Authentication: Verify the request comes from a running task (check task exists, status is `Executing`, and the `X-Task-ID` header matches the route param)
  - Flow: Look up task → get `tenant_id` → get `github_installation_id` from tenant secrets → call `generateInstallationToken()` from T6 → return `{token, expires_at}`
  - Return 404 if task not found, 403 if task not in `Executing` state, 500 if token generation fails
  - Register in `server.ts`

  **Must NOT do**: Use `ADMIN_API_KEY` for auth. Expose this endpoint externally.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: Internal API with task-scoped security
  - **Skills**: []

  **Parallelization**: Wave 2. Blocked by T6. Blocks T8.

  **References**:
  - `src/gateway/routes/admin-employee-trigger.ts` — Example route handler pattern
  - `src/gateway/services/github-token-manager.ts` (from T6)
  - `src/gateway/services/tenant-secret-repository.ts` — For reading `github_installation_id`

  **QA Scenarios**:

  ```
  Scenario: Token endpoint returns token for valid executing task
    Tool: Bash (curl)
    Steps: Create a task in Executing state, call the endpoint
    Expected: 200 with {token: "ghs_...", expires_at: "..."}
    Evidence: .sisyphus/evidence/task-7-token-endpoint.txt

  Scenario: Token endpoint rejects non-executing task
    Tool: Bash (curl)
    Steps: Call endpoint with a task in Done state
    Expected: 403 Forbidden
    Evidence: .sisyphus/evidence/task-7-token-endpoint-reject.txt
  ```

  **Commit**: YES — `feat(github): add token manager service and internal token endpoint`

---

- [x] 8. GitHub get-token shell tool

  **What to do**:
  - Create `src/worker-tools/github/get-token.ts` following the `adding-shell-tools` skill pattern
  - CLI: `tsx /tools/github/get-token.ts`
  - Reads `TASK_ID`, `SUPABASE_URL` from env (available in all containers)
  - Calls `POST ${GATEWAY_URL}/internal/tasks/${TASK_ID}/github-token` (where GATEWAY_URL is derived from `SUPABASE_URL` or a new `GATEWAY_URL` env var)
  - Outputs JSON: `{"token": "ghs_...", "expires_at": "..."}`
  - Also writes token to `/tmp/github-token` for easy use by the agent in subsequent bash commands
  - Error handling: clear error messages if tenant has no GitHub connection, if task is not executing, etc.
  - Add `--help` flag per shell tool convention

  **Must NOT do**: Hardcode any tokens. Access the database directly.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: Simple shell tool following established pattern
  - **Skills**: [`adding-shell-tools`]

  **Parallelization**: Wave 3. Blocked by T3 (container validation) and T7 (endpoint). Blocks T11 and T15.

  **References**:
  - `src/worker-tools/platform/submit-output.ts` — Shell tool CLI pattern to follow
  - `src/worker-tools/slack/post-message.ts` — Another shell tool example

  **QA Scenarios**:

  ```
  Scenario: Shell tool outputs token JSON
    Tool: Bash (docker run with mocked endpoint)
    Steps: Run the tool inside a container with proper env vars
    Expected: JSON output with token field, file at /tmp/github-token
    Evidence: .sisyphus/evidence/task-8-get-token-tool.txt
  ```

  **Commit**: YES — `feat(tools): add github get-token shell tool`

---

- [x] 9. Repo listing endpoint (GET /admin/tenants/:tenantId/github/repos)

  **What to do**:
  - Add route: `GET /admin/tenants/:tenantId/github/repos`
  - Auth: `X-Admin-Key` (existing admin auth middleware)
  - Flow: Get `github_installation_id` from tenant secrets → generate installation token via T6 → call `GET https://api.github.com/installation/repositories` → return `{ repos: [{full_name, html_url, default_branch, private}] }`
  - Handle pagination (GitHub returns max 100 per page) — fetch all pages and return combined list
  - Return 404 if tenant has no GitHub integration
  - Return 502 if GitHub API call fails

  **Must NOT do**: Expose raw GitHub API response. Return repos from other tenants.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: Simple API endpoint with GitHub API call
  - **Skills**: []

  **Parallelization**: Wave 3. Blocked by T4 (OAuth flow for installation_id). Blocks T10.

  **References**:
  - `src/gateway/routes/admin-tenants.ts` — Example admin route pattern
  - `src/gateway/services/github-token-manager.ts` (from T6)
  - GitHub API: `GET /installation/repositories` — https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation

  **QA Scenarios**:

  ```
  Scenario: Repo listing returns repos
    Tool: Bash (curl)
    Steps: source .env && curl -s "http://localhost:7700/admin/tenants/$TENANT/github/repos" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.repos | length'
    Expected: Number > 0
    Evidence: .sisyphus/evidence/task-9-repo-list.txt
  ```

  **Commit**: YES — `feat(github): add repo listing endpoint`

---

- [x] 10. Wizard repo picker in employee creation edit step

  **What to do**:
  - In `dashboard/src/panels/employees/CreateEmployeePage.tsx`, add a new `CollapsibleSection` titled "Code Repository" in the `edit` step
  - Conditionally show section: only when the tenant has a GitHub integration connected (check `tenant_integrations` for `provider: 'github'`). If not connected, show a message: "Connect GitHub in Settings → Integrations to enable repository selection"
  - Fetch repos from `GET /admin/tenants/:tenantId/github/repos` when section is expanded
  - Use `<SearchableSelect>` component (per platform convention) to let user pick a repo
  - **No branch picker** — the employee creates its own branch per task (like a real engineer picking `ai/{taskId}-{slug}` off the default branch)
  - Store selected repo in component state as `repoUrl`
  - When saving the archetype, include `worker_env: { GITHUB_REPO_URL: repoUrl }` in the `createArchetype` payload
  - Do NOT make repo selection required — an employee can be created without a repo (it can be set later via admin API)
  - Encode selected repo in URL state (`?repo=...`) so the selection survives refresh

  **Must NOT do**: Show repo picker for non-code employees. Make repo selection required. Add a branch picker — branching is per-task, not per-employee.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: Dashboard UI with API integration
  - **Skills**: []

  **Parallelization**: Wave 3. Blocked by T5 (IntegrationsPage) and T9 (repo endpoint). Blocks T15.

  **References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx` — Wizard component (add section in edit step)
  - `dashboard/src/components/ui/searchable-select.tsx` — SearchableSelect component (MUST use)
  - `dashboard/src/lib/gateway.ts` — Where to add the `fetchGitHubRepos` API call
  - `dashboard/src/lib/types.ts` — Types to add for GitHub repo response

  **QA Scenarios**:

  ```
  Scenario: Repo picker visible when GitHub connected
    Tool: Playwright
    Steps: Navigate to /dashboard/employees/new?tenant=vlre. Enter a code-writing description. Generate. In edit step, verify "Code Repository" section exists.
    Expected: Section visible with repo dropdown
    Evidence: .sisyphus/evidence/task-10-repo-picker.png

  Scenario: Repo picker hidden when GitHub not connected
    Tool: Playwright
    Steps: Navigate to wizard for a tenant without GitHub. Verify "Code Repository" section shows connect prompt.
    Expected: Connect prompt visible, no dropdown
    Evidence: .sisyphus/evidence/task-10-no-github.png

  Scenario: No branch picker exists
    Tool: Playwright
    Steps: Navigate to wizard, generate a code employee, check the "Code Repository" section.
    Expected: Only repo dropdown visible. No branch input field anywhere.
    Evidence: .sisyphus/evidence/task-10-no-branch-picker.png
  ```

  **Commit**: YES — `feat(wizard): add repo picker to employee creation`

---

- [x] 11. Archetype generator code-writing enhancement

  **What to do**:
  - Update `src/gateway/services/archetype-generator.ts` system prompt to include:
    - A new section about code-writing employees: when the description mentions code/GitHub/repository/PR/bug fix/feature development, include git/PR workflow patterns in `execution_steps`
    - Reference `$GITHUB_REPO_URL` as available env var for code-writing employees (no `$GITHUB_DEFAULT_BRANCH` — employee discovers default branch via git)
    - Include the `get-token.ts` shell tool in the tool catalog as available for GitHub operations
    - Set `concurrency_limit: 1` for code-writing employees
    - Set `vm_size: 'performance-1x'` for code-writing employees (OpenCode binary requirement)
    - Set `approval_required: true` for code-writing employees
    - Include `platform_rules_override` in the output that overrides the "NEVER modify files outside /tools/" rule with "You are authorized to read and write files anywhere in `/tmp/workspace/`. This is a code-writing employee. Your workspace IS `/tmp/workspace/`."
    - **Branching**: execution_steps must instruct the employee to create its own branch per task (e.g. `ai/{taskId}-{short-slug}`) off the repo's default branch — NOT use a pre-configured branch
    - **Per-trigger instructions**: execution_steps must reference the trigger payload as the task assignment — "Your assignment for this task is provided in the initial prompt message. Read it carefully before starting."
  - Add `worker_env` and `platform_rules_override` to the generator's output schema
  - Verify that non-code employee descriptions (e.g., "A daily Slack summarizer") produce archetypes WITHOUT any code-writing patterns
  - Write tests for code-detection and non-code-detection paths

  **Must NOT do**: Change behavior for non-code employees. Add git tools to non-code archetypes. Pre-configure branch names — branching is always per-task.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: LLM prompt engineering with conditional logic and regression risk
  - **Skills**: [`creating-archetypes`]

  **Parallelization**: Wave 3. Blocked by T2 (platform_rules_override) and T8 (shell tool exists for catalog). Blocks T15.

  **References**:
  - `src/gateway/services/archetype-generator.ts` — The generator's system prompt and output schema
  - `src/gateway/services/archetype-generator.ts:discoverTools()` — How tools are cataloged (only tools in `src/worker-tools/` appear)
  - `src/workers/lib/agents-md-compiler.mts` — How `platform_rules_override` is used (from T2)

  **QA Scenarios**:

  ```
  Scenario: Code employee detected and configured
    Tool: Bash (curl)
    Steps: POST /admin/tenants/.../archetypes/generate with description "An employee that reads Jira tickets and writes code fixes as GitHub PRs". Check response for git tools, worker_env, platform_rules_override.
    Expected: tool_registry includes github tools, execution_steps references $GITHUB_REPO_URL, platform_rules_override is set
    Evidence: .sisyphus/evidence/task-11-code-detection.txt

  Scenario: Non-code employee unaffected
    Tool: Bash (curl)
    Steps: POST /admin/tenants/.../archetypes/generate with description "A daily Slack summarizer that posts channel digests". Check response has NO git tools.
    Expected: No github tools, no worker_env, no platform_rules_override
    Evidence: .sisyphus/evidence/task-11-non-code.txt
  ```

  **Commit**: YES — `feat(generator): auto-detect code-writing employees`

---

- [x] 12. .env.example updates for GitHub App env vars

  **What to do**:
  - Add to `.env.example` under section 8 (GitHub): `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  - Add comments explaining each variable
  - Verify `.env.example` and `.env` stay in sync per project conventions

  **Recommended Agent Profile**: `quick`
  **Parallelization**: Wave 4, parallel with T13 and T14.
  **Commit**: YES — `chore(env): add GitHub App env vars to .env.example`

---

- [x] 13. Employee documentation (docs/employees/engineer.md)

  **What to do**:
  - Create `docs/employees/YYYY-MM-DD-HHMM-engineer.md` following the format of existing employee docs
  - Document: what the engineer employee does, how to set it up (connect GitHub, create via wizard), how to trigger, guardrails, configuration, known gotchas (token expiry, concurrency limit, pnpm install time)

  **Recommended Agent Profile**: `writing`
  **Parallelization**: Wave 4, parallel with T12 and T14.
  **References**: `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — Format to follow
  **Commit**: YES (grouped with T14)

---

- [x] 14. AGENTS.md + README.md updates

  **What to do**:
  - Add engineer employee reference to AGENTS.md Reference Documents table
  - Add GitHub OAuth section to AGENTS.md (token manager, internal endpoint, shell tool)
  - Update README.md active employees table
  - Update the deprecated engineering employee note to clarify: old orchestrator is deprecated, new archetype-based engineer is active

  **Recommended Agent Profile**: `quick`
  **Parallelization**: Wave 4, parallel with T12 and T13.
  **Commit**: YES — `docs: add engineer employee documentation and update references`

---

- [ ] 15. E2E happy path — wizard → create → trigger → PR → approve → deliver → Done

  **What to do**:
  - Ensure all services running (gateway, Inngest, Docker)
  - Build Docker image: `docker build -t ai-employee-worker:latest .`
  - Go through the full wizard flow: describe a code-writing employee → generate → select repo → save
  - Trigger the created employee **using the dashboard trigger-with-instructions text input** with a simple prompt: "Add a one-line comment to README.md"
  - Monitor task status through the full lifecycle
  - Verify: PR created on GitHub, Slack approval card posted, approve → delivery → Done
  - Verify the compiled AGENTS.md does NOT contain the file-write restriction
  - Clean up: close test PR, delete branch

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: Complex multi-system E2E validation
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`]

  **Parallelization**: Wave 5. Blocked by T10 and T11.
  **Commit**: NO (E2E test only)

---

- [x] 16. E2E regression — verify non-code employees unaffected

  **What to do**:
  - Trigger `real-estate-motivation-bot-2` (VLRE tenant, simplest employee) with an empty body (no `trigger_payload.prompt`)
  - Verify it reaches Done within 2 minutes
  - Verify its compiled AGENTS.md STILL contains "NEVER modify files outside /tools/"
  - Verify its initial OpenCode message does NOT contain "## Your Assignment" (no spurious injection)
  - Verify the IntegrationsPage still shows all existing integrations correctly
  - Verify the dashboard trigger button still works for non-code employees (with and without text input)

  **Recommended Agent Profile**: `quick`
  **Skills**: [`e2e-testing`]
  **Parallelization**: Wave 5, parallel with T15.
  **Commit**: NO

---

- [x] 17. Notify completion via Telegram

  **What to do**: `tsx scripts/telegram-notify.ts "Engineering employee plan complete — GitHub App integration, wizard repo picker, and code-writing runtime all live. Come back to review."`

  **Recommended Agent Profile**: `quick`
  **Parallelization**: Wave 5, after T15 and T16.
  **Commit**: NO

- [x] 18. Harness: forward trigger_payload.prompt to initial OpenCode message

  **What to do**:
  - In `src/workers/opencode-harness.mts`, after fetching the task from DB, check if `task.trigger_payload?.prompt` exists
  - If present, append it to the `execution_instructions` (the initial OpenCode message) under a clear heading: `\n\n## Your Assignment\n\n${task.trigger_payload.prompt}`
  - This makes the per-trigger instructions visible to the employee as part of its initial prompt
  - The trigger API (`POST /admin/tenants/:tenantId/employees/:slug/trigger`) already accepts a JSON body that becomes `trigger_payload` — no API changes needed
  - Write a unit test that verifies: (a) when `trigger_payload.prompt` is set, it appears in the initial message; (b) when `trigger_payload` is empty or has no `prompt` field, the initial message is unchanged
  - **CRITICAL**: This benefits ALL employees, not just code ones. A summarizer could also receive per-trigger overrides in the future. Keep the implementation generic.

  **Must NOT do**: Modify `employee-lifecycle.ts`. Change the trigger API contract. Make `trigger_payload.prompt` required — it must be optional.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: Harness modification with regression risk for all employees
  - **Skills**: []

  **Parallelization**: Wave 1, parallel with T1, T2, T3. No dependencies. Blocks T15 (E2E) and T19.

  **References**:
  - `src/workers/opencode-harness.mts` — Where execution_instructions is read and sent to OpenCode (look for where the initial message is composed)
  - `src/gateway/routes/admin-employee-trigger.ts` — Where trigger body becomes trigger_payload

  **Acceptance Criteria**:
  - [ ] When trigger body includes `{"prompt": "Fix the login bug"}`, the employee's initial message contains "## Your Assignment\n\nFix the login bug"
  - [ ] When trigger body is `{}`, the employee's initial message is unchanged
  - [ ] `pnpm build` + `pnpm test -- --run` pass
  - [ ] Existing employees (motivation-bot, summarizer) still work when triggered with empty body

  **QA Scenarios**:

  ```
  Scenario: Trigger with prompt — assignment appears in initial message
    Tool: Bash (unit test)
    Steps: Mock a task with trigger_payload.prompt set. Run harness message composition logic. Assert output contains "## Your Assignment" and the prompt text.
    Expected: Prompt text present in initial message
    Evidence: .sisyphus/evidence/task-18-prompt-forwarding.txt

  Scenario: Trigger without prompt — no change to initial message
    Tool: Bash (unit test)
    Steps: Mock a task with empty trigger_payload. Run harness message composition logic. Assert output does NOT contain "## Your Assignment".
    Expected: Initial message unchanged
    Evidence: .sisyphus/evidence/task-18-no-prompt.txt

  Scenario: Regression — motivation-bot still works
    Tool: Bash (curl + psql)
    Steps: Trigger real-estate-motivation-bot-2 with empty body. Wait for Done. Verify status.
    Expected: Task reaches Done within 2 minutes
    Evidence: .sisyphus/evidence/task-18-regression.txt
  ```

  **Commit**: YES — `feat(harness): forward trigger_payload.prompt to initial OpenCode message`

---

- [x] 19. Dashboard: trigger-with-instructions text input

  **What to do**:
  - Find the employee trigger action in the dashboard (the "Trigger" button on the employee detail page or employee list)
  - Add a modal or inline expansion that shows when the trigger button is clicked:
    - A text area: "What should this employee work on?" (placeholder: "e.g., Fix the login page timeout bug")
    - A "Send" button that calls the trigger API with `{ prompt: <text> }` as the request body
    - A "Trigger without instructions" link/button for employees that don't need per-trigger input (e.g., summarizer)
  - The text input is OPTIONAL — the user can still trigger with no instructions (backwards compatible)
  - Encode nothing in URL — this is a transient action, not navigatable state

  **Must NOT do**: Make the text input required. Change the trigger API. Break existing trigger flows.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: Dashboard UI with interaction design
  - **Skills**: []

  **Parallelization**: Wave 3, parallel with T8-T11. Blocked by T18 (harness must forward prompt first). Blocks T15 (E2E).

  **References**:
  - `dashboard/src/panels/employees/` — Employee pages (find where trigger button lives)
  - `dashboard/src/lib/gateway.ts` — Where API calls are made (find existing trigger call, add prompt to body)
  - Platform convention: modals/dialogs use Radix Dialog or inline expansion

  **Acceptance Criteria**:
  - [ ] Clicking "Trigger" shows a text input area
  - [ ] Entering text and clicking "Send" triggers with `{ prompt: "..." }` in request body
  - [ ] Clicking "Trigger without instructions" triggers with `{}` body
  - [ ] After trigger, a success toast/message appears with the task ID

  **QA Scenarios**:

  ```
  Scenario: Trigger with instructions
    Tool: Playwright
    Steps: Navigate to employee detail page. Click "Trigger". Enter "Add a comment to README.md". Click "Send". Capture the network request body.
    Expected: POST body contains {"prompt": "Add a comment to README.md"}. Success feedback shown.
    Evidence: .sisyphus/evidence/task-19-trigger-with-prompt.png

  Scenario: Trigger without instructions
    Tool: Playwright
    Steps: Navigate to employee detail page. Click "Trigger". Click "Trigger without instructions".
    Expected: POST body is {} or has no prompt field. Success feedback shown.
    Evidence: .sisyphus/evidence/task-19-trigger-no-prompt.png
  ```

  **Commit**: YES — `feat(dashboard): add trigger-with-instructions text input`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for quality issues. Verify no employee-specific language in shared files. Check all new routes have proper auth. Check all new DB queries are tenant-scoped.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill for UI)
      Execute EVERY QA scenario from EVERY task. Full E2E: GitHub App install → wizard → create code employee → trigger → clone → code → test → PR → approve → delivery → Done. Also verify non-code employees unaffected. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read spec, read actual diff. Verify 1:1. Check "Must NOT do" compliance. Flag unaccounted changes. Kill all tmux sessions created during execution.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task    | Commit Message                                                              | Key Files                                                   |
| ------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| T1      | `refactor(oauth): extract signState/verifyState to shared utility`          | `src/gateway/lib/oauth-state.ts`, `*-oauth.ts`              |
| T2      | `feat(archetype): add platform_rules_override field and compiler support`   | `prisma/schema.prisma`, migration, `agents-md-compiler.mts` |
| T18     | `feat(harness): forward trigger_payload.prompt to initial OpenCode message` | `src/workers/opencode-harness.mts`                          |
| T4      | `feat(github): add GitHub App OAuth install and callback routes`            | `src/gateway/routes/github-oauth.ts`, `server.ts`           |
| T5      | `feat(dashboard): add GitHub integration row`                               | `IntegrationsPage.tsx`                                      |
| T6+T7   | `feat(github): add token manager service and internal token endpoint`       | `github-token-manager.ts`, route file                       |
| T8      | `feat(tools): add github get-token shell tool`                              | `src/worker-tools/github/get-token.ts`                      |
| T9      | `feat(github): add repo listing endpoint`                                   | route file                                                  |
| T10     | `feat(wizard): add repo picker to employee creation`                        | `CreateEmployeePage.tsx`                                    |
| T11     | `feat(generator): auto-detect code-writing employees`                       | `archetype-generator.ts`                                    |
| T19     | `feat(dashboard): add trigger-with-instructions text input`                 | employee detail page, `gateway.ts`                          |
| T12     | `chore(env): add GitHub App env vars to .env.example`                       | `.env.example`                                              |
| T13+T14 | `docs: add engineer employee documentation and update references`           | `docs/employees/`, `AGENTS.md`, `README.md`                 |

---

## Success Criteria

### Verification Commands

```bash
# GitHub integration connected
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT provider, status FROM tenant_integrations WHERE provider = 'github';"
# Expected: github, active

# Token generation works
source .env
curl -s -X POST "http://localhost:7700/internal/tasks/<task-id>/github-token" \
  -H "Content-Type: application/json" | jq .token
# Expected: ghs_... token string

# Wizard-created archetype has worker_env
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT worker_env FROM archetypes WHERE role_name = '<wizard-created-slug>';"
# Expected: {"GITHUB_REPO_URL": "https://github.com/..."}

# Platform rules override works
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT compiled_agents_md FROM tasks WHERE id = '<code-task-id>';" | grep -c "NEVER modify files outside"
# Expected: 0 (rule suppressed for code employee)

# Non-code employees still protected
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT compiled_agents_md FROM tasks WHERE id = '<motivation-bot-task-id>';" | grep -c "NEVER modify files outside"
# Expected: 1 (rule present for non-code employee)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test -- --run` passes
- [ ] GitHub OAuth flow works end-to-end
- [ ] Wizard repo picker works
- [ ] Code employee E2E: trigger → PR → approve → deliver → Done
- [ ] Non-code employee regression: motivation-bot still works
