# Issues

## [2026-06-03] Known gotchas

- Wave 2 tasks (4, 5, 6, 7) all edit prisma/seed.ts — run them sequentially or carefully merge
- M2.7 notes value must be preserved — the upsert will overwrite if not careful
- MiniMax M3 (released June 1, 2026) and Qwen3.7 Plus (June 2, 2026) may not be on OpenRouter yet
- PostgREST schema cache MUST be reloaded after migration: `NOTIFY pgrst, 'reload schema'`
- makeModelRow() test fixture MUST be updated with strengths: null, weaknesses: null to avoid deep equality failures
