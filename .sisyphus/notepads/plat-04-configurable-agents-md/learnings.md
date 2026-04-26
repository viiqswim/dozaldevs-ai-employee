# Learnings — plat-04-configurable-agents-md

## Conventions

- Long text fields on Archetype use `String? @db.Text` (see system_prompt, instructions in schema.prisma:212-213)
- Tenant config is `Json?` — no schema migration needed for new JSON keys
- Seed uses `(prisma.archetype as any).upsert` cast pattern for new columns not yet in Prisma client
- Migration naming: `YYYYMMDDHHMMSS_snake_case_description`
- Latest migration: `20260422224712_add_system_events_table`
- Dynamic imports in harness: `await import('node:fs/promises')` inside async functions (not top-level)
- Worker lib modules: `.mts` extension, minimal exports

## Key IDs

- DozalDevs archetype: `00000000-0000-0000-0000-000000000012` (tenant `...0002`)
- VLRE archetype: `00000000-0000-0000-0000-000000000013` (tenant `...0003`)
- DozalDevs tenant: `00000000-0000-0000-0000-000000000002`
- VLRE tenant: `00000000-0000-0000-0000-000000000003`

## Infrastructure

- PostgREST via Kong on port 54331 (NOT 54321 directly)
- Gateway on port 7700
- PostgreSQL direct on port 54322, database: `ai_employee`
- Auth header: `apikey: $SUPABASE_ANON_KEY` + `Authorization: Bearer $SUPABASE_SECRET_KEY`

## Task 2 — agents-md-resolver.mts (Wave 1)

- Pure function, no imports — `.mts` extension, ESM module
- `tenantConfig` typed as `Record<string, unknown>` — access `default_agents_md` with `typeof` guard
- Empty string / whitespace-only treated as null (fall through to next level)
- Compiled to `dist/workers/lib/agents-md-resolver.mjs` — import path in harness: `'./lib/agents-md-resolver.mjs'`
- Build passes clean with zero diagnostics

## [2026-04-23] Task 7: Seed data verification tests
- Added 6 seed data tests to tests/gateway/migration-agents-md.test.ts
- ESM path: new URL('../../src/workers/config/agents.md', import.meta.url).pathname (2 levels up from tests/gateway/, NOT 3)
- import.meta.url resolves relative to the test file location — tests/gateway/ needs ../../ to reach repo root
- All 10 tests pass (4 existing migration + 6 new seed data)
- Tenant JSONB query: SELECT config->>'default_agents_md' as default_agents_md FROM tenants WHERE id = '...'::uuid

## [2026-04-23] Task 8: Full verification sweep
- pnpm build: PASS (exit 0)
- pnpm prisma db seed: PASS (exit 0) — both tenants + archetypes upserted cleanly
- npx vitest run: 1130 pass / 73 fail (all 73 failures are pre-existing, unrelated to PLAT-04)
  - PLAT-04 specific: tests/workers/lib/agents-md-resolver.test.ts (9 pass), tests/gateway/migration-agents-md.test.ts (10 pass)
  - Pre-existing failures confirmed via git stash test: feedback-responder, feedback-handler, lifecycle, task-creation, schema, etc.
- PostgREST archetype agents_md: non-null, length=5213+ chars (full agents.md content)
- PostgREST tenant default_agents_md: non-null, length=5213 (DozalDevs config)
- Trigger dry-run (VLRE): 200 OK — `{"valid":true,"would_fire":{...},"archetype_id":"00000000-0000-0000-0000-000000000013"}`
- SUPABASE_ANON_KEY not in .env — use docker/.env ANON_KEY for PostgREST calls
- Gateway was stale when DB restarted — needed kill + restart before dry-run worked
