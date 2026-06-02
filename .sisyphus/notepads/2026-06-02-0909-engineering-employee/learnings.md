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
