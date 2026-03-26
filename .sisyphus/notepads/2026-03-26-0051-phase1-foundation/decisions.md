# Decisions — Phase 1 Foundation

## Architectural Decisions
- pnpm as package manager (per §15)
- Vitest for automated tests (tests-after, not TDD)
- ESLint 9 flat config (eslint.config.mjs)
- placeholder GitHub repo URL for seed data project record
- Prisma ^6.0.0 pinned for stability (7.x has breaking seed changes)
- Two-migration strategy: first migration creates tables, second adds CHECK constraints via --create-only
- 'machine' actor added to task_status_log CHECK constraint (Phase 6 forward-compat)

## Scope Boundaries  
- Phase 1 ONLY — no runtime code
- src/ directories are empty (.gitkeep only)
- Supabase init but migrations via Prisma only
