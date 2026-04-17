# Learnings — Platform Architecture Redesign

## Conventions

### LLM Models (CRITICAL — NEVER VIOLATE)

- ONLY approved models: `minimax/minimax-m2.7` (primary/execution) and `anthropic/claude-haiku-4-5` (verification/judge)
- Any other model reference in production code = bug. Period.
- Tests must also use only these model IDs in fixtures.

### Engineering Lifecycle

- `src/inngest/lifecycle.ts` is DEPRECATED — do NOT touch it
- The unified lifecycle lives in `src/inngest/employee-lifecycle.ts`

### Pre-existing LSP errors (IGNORE)

- `lifecycle.ts` lines 26:14, 26:21 — implicit any binding
- `redispatch.ts` lines 21:14, 21:21 — implicit any binding
- `employee-lifecycle.ts` lines 20:14, 20:21 — implicit any binding
- `seed.ts` — multiple LSP errors (stale generated client)
- `tests/inngest/lifecycle.test.ts` — stale test using old Inngest API

### Schema conventions

- Use `@updatedAt` Prisma decorator for `updated_at` fields
- Use `@default(now())` for `created_at` fields
- UUID primary keys: `@id @default(uuid()) @db.Uuid`
- All tables need `created_at` AND `updated_at`
- Soft deletes: `deleted_at DateTime?`
- Tenant scoping: every table needs `tenant_id` where applicable

### Build verification

- Use `pnpm build` as source of truth (not LSP)
- Run `pnpm test -- --run` after any test changes
- Known pre-existing test failures: `container-boot.test.ts`, `inngest-serve.test.ts`

## 2026-04-17 Session Start

- Starting fresh from 0/27 tasks
- Wave 1 schema tasks (T2, T3, T4) must be combined — all touch prisma/schema.prisma
- T8 depends on T3 being complete (Prisma client must be regenerated)
