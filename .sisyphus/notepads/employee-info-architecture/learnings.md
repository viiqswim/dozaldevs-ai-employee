## Task 2 — tool-reference-generator.mts

- `getToolByPath(basePath, service, toolName)` from `tool-parser.ts` returns `null` on any error — safe to call with nonexistent paths
- Container paths `/tools/service/name.ts` → strip `/tools/` prefix, split on `/` → service + toolName
- Import `.mts` files in Vitest tests using `.mjs` extension (ESM convention)
- `submit-output.ts` JSDoc first line is "submit-output.ts" (filename) so `description` from parser = "submit-output.ts" — acceptable since we don't hardcode
- `vitest run <file>` works correctly; avoid interactive watch mode in tmux sessions
- Evidence dir `.sisyphus/evidence/` is gitignored — no need to force-add

## Task 4 — Harness Wiring

- Both generators integrate cleanly into the platformRuntimeSections block in `main()` (async function — `await` works)
- `ArchetypeRow` interface in harness does NOT auto-reflect DB schema — must manually add fields when new archetype columns are read
- Insertion point: after legacy system_prompt push, before the `try` block that calls `resolveAgentsMd`
- Type cast pattern for optional JSONB fields: `(archetype.field as { key?: type } | null)?.key ?? default`
- `pnpm test --run` ran 1508 tests, 27 skipped, 0 failures — new generator tests from Wave 1 are included in the count
- `.mts` → `.mjs` import extension required in all ESM harness imports

## Task 5 — Motivation Bot Archetype Cleanup

- Use `docker cp <local-file> shared-postgres:/tmp/<file>` then `docker exec shared-postgres psql -U postgres -d ai_employee -f /tmp/<file>` to run SQL files against the DB
- Single-quoted strings in SQL need escaped single quotes (`''`) — the SQL file approach avoids shell escaping issues
- `UPDATE 1` confirms exactly one row was modified — always check this output
- Verification pattern: check for absence of boilerplate keywords (`submit-output`, `CLASSIFICATION`, `MANDATORY`, `TOOLS RELEVANT`, `tsx /tools/`) in updated fields
- Guard query: `COUNT(*) WHERE id != '<target-id>' AND updated_at > NOW() - INTERVAL '1 minute'` = 0 confirms no collateral damage
- The `instructions` field should contain ONLY pure task logic steps (no platform boilerplate)
- The `agents_md` field should contain ONLY the employee identity paragraph (no tool references — those are auto-injected by the harness)

## Task 6 — E2E Verification

- Motivation bot archetype is under tenant `00000000-0000-0000-0000-000000000003` (VLRE), NOT DozalDevs — always query DB to confirm correct tenant before triggering
- Container log for task `{taskId}` is at `/tmp/employee-{first8chars}.log` — this is the primary source for harness behavior evidence
- "Wrote concatenated AGENTS.md (platform + tenant + archetype)" appears at line 10 of container startup sequence — confirms the new info architecture is working
- Docker VM disk can fill up (116.8G limit) when running frequent builds — `docker builder prune -f` reclaims build cache (21.47GB freed in one call); PostgreSQL enters recovery mode when disk hits 100%
- After PostgreSQL recovery, `Executing → Submitting` DB write may be lost if it happened mid-recovery — this is a transient data gap, not a bug; task still reaches `Done` correctly
- `psql postgresql://...` TCP connection is more reliable than `docker exec shared-postgres psql` for health checks during container stress
- Full startup sequence order: harness → archetype loaded → execution record created → heartbeat started → task status → Executing → auth.json → permission config → global opencode.json → skills available → **Wrote concatenated AGENTS.md** → opencode serve starts
- `approval_required: false` → lifecycle flow: `Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Validating → Submitting → Done` (note Submitting→Validating→Submitting→Done is the no-approval path)
