# Learnings

## [2026-05-30T23:51:06Z] Session Start: ses_18aab566bffe6yLQjmsyNfzUwQ

### Inherited Wisdom (from prior plan: 2026-05-30-0112-cleaning-schedule-corrected-rules)

- Both create (~lines 3530-3640) and update (~lines 3685-3795) blocks in prisma/seed.ts must be edited IDENTICALLY
- SQL UPDATE uses dollar-quoting: `$EXEC_TAG$...$EXEC_TAG$`
- MUST NOT run `pnpm prisma db seed` — SQL UPDATE directly to live DB only
- MUST NOT use host pg_dump (version mismatch 15 vs 17) — but no backup needed for this plan
- Archetype ID: `00000000-0000-0000-0000-000000000019`
- VLRE tenant: `00000000-0000-0000-0000-000000000003`
- Slack channel: `C0B71QSMZKQ`
- Production model: `minimax/minimax-m2.7` (already set in DB — no override needed)
- CHECK-IN BILLING RULE section in STEP 1 must stay untouched — only the OUTPUT FORMAT labels in STEP 4 get removed

### What This Plan Is Fixing

- STEP 4 output format currently includes `| CHECK-IN` / `| CHECK-OUT` labels → remove
- STEP 4 format currently says `[checkout/check-in] [Hora]` → remove check-in/out reference
- No instruction for multi-room properties → add ROOM/UNIT IDENTIFICATION to STEP 1

### User Decisions

- No DB backup needed for this fix
- Target date for test run: Saturday May 31, 2026
- Iterative review loop: keep fixing and re-triggering until output passes ALL quality checks
- No doom loop prevention
- No model override — use production model

## [2026-05-30T23:59:05Z] Task 2 Complete: DB Updated

- Applied SQL UPDATE to archetype `00000000-0000-0000-0000-000000000019` via dollar-quoting temp file
- `psql output: UPDATE 1` — confirmed single row updated
- Verification: `| CHECK-IN` / `| CHECK-OUT` count = 0 ✅
- Verification: `ROOM/UNIT IDENTIFICATION` count = 1 ✅
- `updated_at` = `2026-05-30 23:59:05.954`
- Evidence: `.sisyphus/evidence/task-2-db-verified.txt`
