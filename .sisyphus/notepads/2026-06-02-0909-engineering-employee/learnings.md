# Learnings

<!-- Append findings here — never overwrite. Format: ## [TIMESTAMP] Task: {task-id} -->

## [2026-06-02] Task: T1

**OAuth state utility extraction — `src/gateway/lib/oauth-state.ts`**

- All 3 OAuth route files (`slack-oauth.ts`, `jira-oauth.ts`, `notion-oauth.ts`) had byte-for-byte identical `signState`/`verifyState` implementations. Extraction was a pure DRY lift with zero behavior change.
- `crypto` import kept in all 3 route files — still needed for `crypto.randomBytes(16)` nonce generation.
- `src/gateway/lib/` directory created new (did not previously exist). Pattern established for gateway-internal shared utilities.
- Tests placed at `src/gateway/__tests__/oauth-state.test.ts` (7 tests, all pass in ~1ms). Pre-existing failures in `get-properties.test.ts` and `notion/get-page.test.ts` are unrelated infrastructure tests.
- Build: exit 0. New tests: 7 pass. Zero regressions.
- T4 (GitHub OAuth route) can now import from `../lib/oauth-state.js` directly.

## [2026-06-02] Task: T2

**`platform_rules_override` field — Prisma + compiler + Zod**

- Field added as `String? @db.Text` in `prisma/schema.prisma` after `temperature` field.
- `pnpm prisma migrate dev` fails with P3006 shadow DB error on this Supabase Docker Compose setup (recurring known issue). Workaround: create migration directory + SQL file manually, apply with `psql`, then `pnpm prisma migrate resolve --applied <migration_name>`. Pattern confirmed from prior migrations in this project.
- Migration timestamp: `20260602101613_add_platform_rules_override`. Column: `ALTER TABLE "archetypes" ADD COLUMN "platform_rules_override" TEXT;`
- PostgREST schema cache reloaded via `NOTIFY pgrst, 'reload schema';` — always required after any `ALTER TABLE`.
- Compiler (`agents-md-compiler.mts`): check uses `!= null` (not truthiness) so empty string `""` counts as an override (uses empty content). Null/undefined → default platform rules from `agents.md`. Interface extended with `platformRulesOverride?: string | null`.
- Zod: added to both `PatchArchetypeBodySchema` (`.nullable().optional()`) and `CreateArchetypeBodySchema` (`.nullable().optional().default(null)`).
- Unit tests: 9 new tests in `compileAgentsMd — platformRulesOverride` describe block covering: override set, null, undefined, empty string, and replaces-entire-section semantics. All 25 compiler tests pass.
- Pre-existing test failures: `get-properties.test.ts` (1) + `notion/get-page.test.ts` (3) — unrelated, confirmed pre-existing before any of my changes.
- Build: exit 0. Tests: 1541 pass / 4 pre-existing fail (unchanged baseline).

## [2026-06-02] Task: T3

**Container capability spike — tool versions + full pipeline test**

### Tool versions confirmed in ai-employee-worker:latest
- gh: 2.45.0
- git: 2.39.5
- pnpm: 11.5.0
- node: v22.22.3
- npm: 10.9.8
- tsx: available at /usr/local/bin/tsx
- opencode: available at /usr/local/bin/opencode
- OS: Debian GNU/Linux 12 (bookworm), arch: arm64

All tools required for code development are present.

### Repo URL
Task instructions specified `dozal-devs/ai-employee` but the actual remote is:
`viiqswim/dozaldevs-ai-employee`
The engineering employee's run-tests shell tool MUST use the correct repo URL.
GITHUB_TOKEN with access to `viiqswim/dozaldevs-ai-employee` works for token-auth clone.

### /tmp/workspace write
Works perfectly: `mkdir -p /tmp/workspace && echo test > /tmp/workspace/test.txt` ✅

### git clone (HTTPS token auth)
Works: `git clone --depth=1 https://x-access-token:TOKEN@github.com/viiqswim/dozaldevs-ai-employee /tmp/workspace/repo`
Timing: **2s** for shallow clone ✅

### pnpm install — BLOCKER: pnpm 11 build approval required
**CRITICAL FINDING for T8 (run-tests shell tool):**

pnpm 11.5.0 blocks install with `ERR_PNPM_IGNORED_BUILDS` when the repo doesn't have
build approvals configured. Affected packages:
- @prisma/client, @prisma/engines, esbuild, prisma, protobufjs

Failed approaches:
1. `.npmrc` with `onlyBuiltDependencies=...` → pnpm 11 no longer reads this format
2. `package.json` pnpm.onlyBuiltDependencies → WARN: "no longer read by pnpm" in v11
3. `pnpm.toml` with `onlyBuiltDependencies = [...]` → Still same error (may need different syntax)

Workaround for spike: `pnpm install --ignore-scripts`
- Timing: **14s** for 537 packages (no cache, fresh download) ✅
- This is FAST — no bottleneck at this stage

### pnpm build (TypeScript compilation)
- With `--ignore-scripts`: build FAILS because prisma generate was skipped
  → `Module '"@prisma/client"' has no exported member 'PrismaClient'`
  → build takes 5s before failing
- Fix required: run `npx prisma generate` after `pnpm install --ignore-scripts`
  OR use proper build approval so prisma post-install runs automatically

### Recommended approach for T8 (run-tests shell tool)
```bash
# 1. Clone repo
git clone --depth=1 "https://x-access-token:${GITHUB_TOKEN}@github.com/viiqswim/dozaldevs-ai-employee" /tmp/workspace/repo
cd /tmp/workspace/repo

# 2. Install with build scripts (investigate pnpm.toml v2 syntax or use --ignore-scripts + manual steps)
# Option A (if pnpm.toml works in final pnpm 11 syntax):
#   Create pnpm.toml, then: pnpm install
# Option B (workaround):
pnpm install --ignore-scripts
npx prisma generate   # re-runs prisma generate manually

# 3. Build
pnpm build   # tsc compilation ~5s

# 4. Test
pnpm test -- --run
```

### vm_size recommendation
- Install (537 pkgs, no cache): 14s — memory usage appears moderate
- Recommend `performance-1x` if running tests (vitest loads test DB, spawns workers)
- `shared-cpu-1x` (256MB) may be insufficient for full test suite

### Evidence files
- `.sisyphus/evidence/task-3-tool-versions.txt` — full tool versions
- `.sisyphus/evidence/task-3-full-pipeline.txt` — full pipeline results with timings

## [2026-06-02] Task: T18

**trigger_payload.prompt forwarding to initial OpenCode message**

- Injection point: after `resolvedInstructions` is set (line ~895) and before `assembleTaskPrompt` call (line ~988) in `main()` execution phase.
- `task.trigger_payload` is typed as `unknown` via `[key: string]: unknown` index sig on `TaskWithArchetype`. Safe access requires full object+key+type guard chain.
- Extracted logic into `src/workers/lib/trigger-payload.mts` (two pure exports: `extractTriggerPrompt`, `injectAssignmentSection`) — makes it unit-testable without importing the side-effect-laden harness.
- Format injected: `${instructions}\n\n## Your Assignment\n\n${prompt}` — appended to the instructions string BEFORE `assembleTaskPrompt` wraps it (so it appears before the Task ID line in the final message).
- Empty string / whitespace-only prompt → no injection (`.trim()` then falsy check).
- Import in harness uses `.mjs` extension (matching other lib imports like `prompt-assembler.mjs`).
- 25 tests in `src/workers/__tests__/opencode-harness-prompt.test.ts`, all pass in 1ms.
- Build: exit 0. Test results: 1566 pass / 4 pre-existing fail (unchanged from baseline).
- No changes to `employee-lifecycle.ts` or any deprecated files.

## [2026-06-02] Task: T4

**GitHub App OAuth routes — `src/gateway/routes/github-oauth.ts`**

- GitHub App callback is NOT OAuth2: receives `installation_id` (integer as string), no `code`, no token exchange. Store `installation_id` directly as tenant secret.
- Install route: slug-based tenant lookup (`findBySlug`), HMAC state signed with `ENCRYPTION_KEY`, redirects to `https://github.com/apps/{GITHUB_APP_NAME}/installations/new?state=...`.
- Callback route: verifyState → store `github_installation_id` via `secretRepo.set()` → upsert `TenantIntegrationRepository` with `provider:'github', external_id: installation_id` → redirect to `/dashboard/integrations?connected=github`.
- `verifyState` throws `RangeError` when passed a state whose hex sig has the wrong byte length (odd-length hex). Wrapped verifyState in try-catch to map to 400 INVALID_STATE instead of 500.
- Route registered: `app.use('/integrations', githubOAuthRoutes({ prisma }))` in `server.ts` alongside Jira/Notion OAuth routes.
- Env warning added to server.ts startup for missing `GITHUB_APP_NAME`.
- Test pitfall: `makeApp()` must NOT set `GITHUB_APP_NAME` in its body, or `delete process.env.GITHUB_APP_NAME` tests will fail (makeApp() re-sets it). Set env only in `beforeEach`.
- 9 tests: install redirect 302, missing tenant 400, tenant not found 400, missing app name 503; callback happy-path 302 with both mock calls, missing params 400 (×2), invalid state 400, guard-no-calls.
- Build: exit 0. Tests: 9 new pass, 0 regressions.

## [2026-06-02] Task: T5

**GitHub integration row — `dashboard/src/panels/integrations/IntegrationsPage.tsx`**

- `IntegrationRow` component accepts: `name`, `description`, `integration` (TenantIntegration|null), `connectHref?`, `connectLabel?` (defaults to 'Connect').
- Connected check: `integrations?.find((i) => i.provider === 'github') ?? null` — same pattern as Slack/Jira/Notion.
- Connect URL uses `tenant.slug` (not `tenantId`) — same as Jira/Notion since backend route uses slug: `${GATEWAY_URL}/integrations/github/install?tenant=${tenant.slug}`.
- Slack row is the odd one out — uses `tenantId` UUID directly (not slug) because Slack install uses a different route pattern.
- When connected, shows "✓ Connected" badge + "Reconnect" link. When not connected, shows the `connectLabel` link.
- `connectHref` guarded by `tenant?.slug` — undefined when tenant slug not yet loaded, disables the link (renders with `pointer-events-none` + `opacity-40`).
- Build: exit 0. Tests: 4 pre-existing failures only (get-properties.test.ts ×1 + notion/get-page.test.ts ×3), 1575 pass.
- Screenshot: `.sisyphus/evidence/task-5-integrations-page.png` (gitignored by .gitignore — evidence dir is excluded).

## [2026-06-02] Task: T6

**GitHub token manager — `src/gateway/services/github-token-manager.ts`**

- No external JWT dependencies needed — Node.js 20+ `crypto.createSign('RSA-SHA256')` with `base64url()` helper is sufficient for RS256 JWT generation. Avoids adding `jsonwebtoken` or `@octokit/app` to package.json.
- JWT payload: `{ iat: now - 60, exp: now + 600, iss: appId }` — `iat` is set 60s in the past to tolerate clock skew between app server and GitHub API (GitHub's own requirement).
- In-memory cache: module-level `Map<number, CachedToken>`. Key = `installationId`, value = `{ token, expires_at, cachedAt }`. TTL = 55 minutes (tokens expire at 60 min, 5-min buffer).
- `_resetCacheForTest()` escape hatch for test isolation — named with `_` prefix convention to signal non-production use.
- Tests use `vi.stubGlobal('fetch', mockFn)` to intercept HTTP calls without any additional setup.
- RSA key for tests: `crypto.generateKeyPairSync('rsa', { modulusLength: 1024 })` in `beforeAll` — 1024-bit is fast (~200ms) and sufficient for unit test signing; production will use 2048+.
- Cache TTL expiry tested via `vi.useFakeTimers()` + `vi.advanceTimersByTime(56 * 60 * 1000)` — proper time-travel test without mocking `Date.now` manually.
- Build: exit 0. Tests: 10 new pass (github-token-manager.test.ts), 0 regressions.

## [2026-06-02] Task: T7

**Internal GitHub token endpoint — `src/gateway/routes/internal-github-token.ts`**

- Route: `POST /internal/tasks/:taskId/github-token` — task-scoped, no admin key required.
- Auth guard: `X-Task-ID` header must exactly equal the `:taskId` route param. Return 400 if missing or mismatched. Prevents cross-task token theft.
- Task status guard: only `'Executing'` tasks can fetch tokens (403 otherwise). Prevents post-execution token reuse.
- Secret lookup: `secretRepo.get(tenantId, 'github_installation_id')` — if null, returns 404 `{"error": "GitHub not connected"}`.
- `parseInt(installationIdStr, 10)` converts stored string → number before passing to `generateInstallationToken`.
- Registered: `app.use('/internal', internalGithubTokenRoutes({ prisma }))` in `server.ts` alongside `/integrations` routes.
- The `logger.error` call in the catch block is intentional — the "GitHub API 500" error log in test output is from the 500 test scenario and is expected behavior.
- 8 tests: happy path 200 (verifies token + expires_at body and all mock calls), missing header 400, mismatched header 400, task not found 404, task in Done (non-Executing) 403, task in Submitting 403, no GitHub secret 404, token generation throws 500.
- Build: exit 0. Tests: 8 new pass, 1593 total pass, 4 pre-existing failures (unchanged baseline).

## [2026-06-02] Task: T8

**GitHub get-token shell tool — `src/worker-tools/github/get-token.ts`**

- Simple HTTP wrapper: `POST ${GATEWAY_URL}/internal/tasks/${TASK_ID}/github-token` with `X-Task-ID: ${TASK_ID}` header.
- `GATEWAY_URL` defaults to `http://localhost:7700` if not set. In Docker containers, set to `http://gateway:7700`.
- Writes token string to `/tmp/github-token` for easy use in shell: `git clone https://x-access-token:$(cat /tmp/github-token)@github.com/org/repo`.
- No mock mode needed — this tool calls the internal gateway (not an external API), so no `GITHUB_MOCK` env var.

### Test pattern gotcha: spawnSync blocks event loop

**CRITICAL**: `spawnSync` blocks the Node.js event loop. If you create an in-process HTTP mock server and then call `spawnSync`, the child process cannot connect to the server because the event loop is blocked and the server can't accept connections. All tests will time out at 15s.

**Fix**: Use `execFile` (async, callback-based) instead of `spawnSync` for tests that need a mock HTTP server. The existing pattern in `tests/worker-tools/hostfully/get-messages.test.ts` uses `execFile` with `npx tsx` — follow that pattern exactly.

**Working pattern**:
```typescript
import { execFile } from 'child_process';
import * as http from 'http';  // NOT 'node:http' — causes TS1192 default export error

function runScript(args, envOverrides) {
  return new Promise((resolve) => {
    execFile('npx', ['tsx', SCRIPT_PATH, ...args], { env: {...process.env, ...envOverrides} },
      (err, stdout, stderr) => resolve({ stdout, stderr, code: err ? (err.code ?? 1) : 0 })
    );
  });
}
```

**Import style**: Use `import * as http from 'http'` (not `import http from 'node:http'`) — the latter causes TS1192 "no default export" error in this project's tsconfig.

- Build: exit 0. Tests: 8 new pass (all get-token tests), 1601 total pass, 4 pre-existing failures (unchanged baseline).

## [2026-06-02] Task: T9

**GitHub repo listing endpoint — `src/gateway/routes/admin-github.ts`**

- Route: `GET /admin/tenants/:tenantId/github/repos` — admin-auth protected.
- Flow: read `github_installation_id` from tenant secrets → generate installation token → paginate GitHub API → return `{ repos: [{full_name, html_url, default_branch, private}] }`.
- Pagination: parse `Link` header for `<url>; rel="next"` pattern. Loop until no next link. Max 100 per page.
- Returns 404 `{"error": "GitHub not connected"}` when no `github_installation_id` secret exists.
- Returns 502 for both token generation failures and GitHub API failures.
- Only 4 fields returned per repo — extra GitHub fields stripped explicitly.

### Test pattern: mock TenantSecretRepository at module level

**CRITICAL**: `TenantSecretRepository.get()` calls `decrypt()` which requires a real `ENCRYPTION_KEY`. Mocking the Prisma `findUnique` at the prisma-client level is NOT sufficient — the `decrypt()` call will throw `ERR_INVALID_ARG_TYPE` because the mock returns a raw object without encrypted fields.

**Fix**: Mock the entire `TenantSecretRepository` class at the module level using `vi.hoisted()`:

```typescript
const { mockSecretGet } = vi.hoisted(() => ({ mockSecretGet: vi.fn() }));

vi.mock('../../services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({ get: mockSecretGet })),
}));
```

Then pass `prisma: {} as never` to the route factory — the real Prisma client is never used.

This pattern is established in `admin-slack-channels.test.ts` — always follow it for routes that use `TenantSecretRepository`.

- Build: exit 0. Tests: 8 new pass (admin-github.test.ts), 0 regressions.

## [2026-06-02] Task: T10

**Repo picker in wizard — `dashboard/src/panels/employees/CreateEmployeePage.tsx`**

- `GitHubRepo` type added to `dashboard/src/lib/types.ts`. `CreateArchetypePayload` extended with optional `worker_env?: Record<string, string> | null`.
- `fetchGitHubRepos(tenantId)` added to `dashboard/src/lib/gateway.ts` — calls `GET /admin/tenants/:tenantId/github/repos`.
- GitHub connected status: `postgrestFetch<TenantIntegration>('tenant_integrations', { tenant_id: 'eq.X', provider: 'eq.github' })` — same PostgREST filter pattern as IntegrationsPage.
- URL state: `useSearchParams` from react-router-dom. `repoUrl` initialized from `searchParams.get('repo')` (decoded). Synced back via `setSearchParams((prev) => { ...copy; set/delete 'repo' }, { replace: true })`.
- `CollapsibleSection` placed between Delivery and Settings sections. States: loading (skeleton pulse), not-connected (text message), repos-loading, repos-error, SearchableSelect.
- `worker_env: repoUrl ? { GITHUB_REPO_URL: repoUrl } : undefined` — only included in `createArchetype` payload when a repo is selected.
- `pnpm build` (tsc -p tsconfig.build.json): exit 0.
- LSP not available in dashboard dir (`asdf` version not set for typescript-language-server in that directory) — use `pnpm build` as type-check instead.

## [2026-06-02] Task: T11

**Code-writing employee auto-detection in archetype generator**

### Detection approach
- Used `RegExp` array with `\b` word boundaries instead of simple `includes()` — critical to avoid false positives:
  - `\bpr\b` with `includes('pr')` matches "properties", "print", "project" → caused test failure
  - `\bcode\b` with `includes('code')` matches "passcode", "lock codes", "decode" → false positives
  - Solution: Use regex patterns with `\b` word boundaries for all detection
- Final regex patterns cover: github, repository, repo, pull request, bug fix, commit, branch, write code, implement, programming, software engineer, typescript, javascript, python, refactor, code review, codebase

### Schema changes
- Added `vm_size?: string | null`, `worker_env?: Record<string, string> | null`, `platform_rules_override?: string | null` to `GenerateArchetypeResponse` interface
- Added matching fields to JSON shape in `SYSTEM_PROMPT_POST`
- `isCodeWritingEmployee()` and `CODE_EMPLOYEE_PLATFORM_RULES_OVERRIDE` exported for testing

### postProcess deterministic overrides
When `isCodeWritingEmployee(description)` is true:
- `concurrency_limit` forced to 1 (regardless of LLM output)
- `vm_size` forced to `'performance-1x'`
- `platform_rules_override` set to the workspace authorization text
- `worker_env` set to `{ GITHUB_REPO_URL: '' }` (user fills in wizard)
- `risk_model.approval_required` forced to `true`
- `/tools/github/get-token.ts` added to `tool_registry.tools` if not already present

### System prompt addition
Added "## Code-Writing Employees" section before "## Environment Variables" in `SYSTEM_PROMPT_PRE` listing all 9 required overrides and the exact git workflow pattern for execution_steps.

### Test results
- 22 new tests in `archetype-generator-code.test.ts` (15 unit tests for `isCodeWritingEmployee` + 7 integration tests for `ArchetypeGenerator`)
- Build: exit 0. Tests: all 22 pass, 4 pre-existing failures only (get-properties.test.ts ×1 + notion/get-page.test.ts ×3)

## [2026-06-02] Task: T19

**Trigger-with-instructions modal — `EmployeeDetail.tsx`**

- The Trigger button in `EmployeeDetail.tsx` has two paths: (1) `every_run` inputs present → navigate to `TriggerEmployeePage`, (2) no `every_run` inputs → direct trigger. T19 modifies path (2) to open a modal instead.
- Added `triggerModalOpen` + `triggerPrompt` state. `handleTrigger(prompt?: string)` now accepts optional prompt, passes it as 5th arg to `triggerEmployee()`, and closes modal on success.
- `gateway.ts` `triggerEmployee()` — added 5th optional `prompt` param. Only includes `body.prompt` when truthy (`.trim()` check). Backward-compatible — callers without prompt arg get same behavior.
- Send button disabled when textarea is empty. "Trigger without instructions" button always available.
- `cleaning-schedule` employee has `every_run` inputs → clicking Trigger navigates to `/trigger` page (expected). Test modal with `real-estate-motivation-bot-2` (no `every_run` inputs).
- `dialog.tsx` already exports all required pieces: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`. No changes needed to ui library.
- LSP not available in dashboard/ subdir (needs asdf nodejs version set). Use `pnpm build` instead.
- Build passes: `pnpm build` (tsc) exit code 0.

## T12 — .env.example GitHub App vars

- Added 5 new vars under section 8 (GitHub) in `.env.example`: `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `GITHUB_APP_NAME` is the URL slug used in `github-oauth.ts` for the install redirect: `https://github.com/apps/${appName}/installations/new`
- `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` are used in `github-token-manager.ts` to generate the App JWT for installation token exchange
- `GITHUB_PRIVATE_KEY` placeholder uses PEM format with `\n` encoding note — important for single-line env var storage
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` are OAuth App credentials (separate from the GitHub App credentials)
- Existing `GITHUB_TOKEN` preserved as-is

## [2026-06-02] Task: T13

**Engineer employee documentation — `docs/employees/2026-06-02-1230-engineer.md`**

- Followed exact format of `docs/employees/2026-05-21-1721-jira-motivation-bot.md` (header, archetype metadata, what-it-does, inbound flow, setup, triggering, configuration, checking status, known gotchas, verified E2E flow).
- Archetype IDs left as TBD — to be filled after first E2E run.
- Key gotchas documented: pnpm install blocker (`--ignore-scripts` + `npx prisma generate`), correct repo URL (`viiqswim/dozaldevs-ai-employee`), token TTL (1hr, always fetch fresh), `vm_size: 'performance-1x'` mandatory, `platform_rules_override` required for code-writing authorization.
- Pre-existing test failures (4) noted so engineer employee doesn't treat them as regressions.
- Trigger modal documented: dashboard shows text area for instructions, admin API uses `{ "prompt": "..." }` body.

## [2026-06-02] Task: T14

**AGENTS.md + README.md documentation updates for engineer employee**

### AGENTS.md changes
- Added GitHub shell tool row to shell tools table: `| GitHub | /tools/github/ | Fetch short-lived GitHub App installation tokens for git/gh CLI |`
- Added GitHub OAuth endpoints to Admin API section: `GET /admin/tenants/:tenantId/github/repos`, `GET /auth/github/install`, `GET /auth/github/callback`, `POST /internal/tasks/:taskId/github-token`
- Added GitHub token manager note: `src/gateway/services/github-token-manager.ts` — RS256 JWT + installation tokens, 55-min cache
- Added engineer employee to Reference Documents table: `docs/employees/2026-06-02-1230-engineer.md`
- Updated deprecated orchestrator note to clarify: "This is the old orchestrator-based engineering employee. The new archetype-based engineer employee (created via wizard) is active and uses the OpenCode harness."

### README.md changes
- Added engineer employee row to active employees table: `| **Engineer (DozalDevs)** | Manual (admin API or dashboard) | Receives coding instructions, implements changes in GitHub repo, creates PR for review |`
- Updated deprecated engineering employee note to clarify old vs new
- Added "Engineer employee (archetype-based, active)" env vars section: `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`
- Added engineer employee to Documentation table
- Updated section 8 (GitHub) in env file conventions to include new vars

### Build
- `pnpm build` (tsc): exit 0. No TypeScript errors.
