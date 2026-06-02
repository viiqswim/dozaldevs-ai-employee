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
