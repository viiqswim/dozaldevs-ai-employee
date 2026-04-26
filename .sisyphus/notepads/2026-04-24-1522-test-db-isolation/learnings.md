# Learnings — test-db-isolation

## Key Facts

- Dev DB: `ai_employee` on `postgresql://postgres:postgres@localhost:54322/ai_employee`
- Test DB: `ai_employee_test` on `postgresql://postgres:postgres@localhost:54322/ai_employee_test`
- Vitest `test.env` sets DATABASE_URL BEFORE module imports — so `tests/setup.ts:117` `getPrisma().$connect()` at module load is safe
- `prisma db seed` loads `.env` via dotenv independently — MUST pass `DATABASE_URL` explicitly via `execSync` env option
- Nexus pattern reference: `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/packages/database/src/testing/global-setup.ts`
- `test:db:setup` uses psql idempotency check: `SELECT 1 FROM pg_database WHERE datname='ai_employee_test'`

## Pre-existing test failures (NOT regressions)

- `container-boot.test.ts` — requires Docker socket
- `inngest-serve.test.ts` — function count mismatch

## Critical: dispatchEmployee takes prisma as parameter

- In manual-trigger.integration.test.ts, `prisma` is passed to `dispatchEmployee({ ..., prisma, ... })`
- Refactor: use `getPrisma()` INLINE at each call site: `prisma: getPrisma()`
- For read calls in test bodies: `await getPrisma().task.findUnique(...)`
- Remove `let prisma: PrismaClient;` and `beforeAll(() => { prisma = new PrismaClient(); })`
- Same pattern in seed-guest-messaging.test.ts with `integrationPrisma`

## seed-guest-messaging.test.ts structure

- Lines 1-143: First describe already uses `getPrisma()` via local var — no changes needed
- Lines 145-163: `integrationPrisma` lifecycle → convert to `getPrisma()` / `disconnectPrisma()`
- Lines 165-251: test bodies pass `prisma: integrationPrisma` → change to `prisma: getPrisma()`
- NOTE: afterAll on line 161-163 (`integrationPrisma.$disconnect()`) should be REMOVED — line 10-12 already calls `disconnectPrisma()`

## Files to touch (Wave 1)

- CREATE: `tests/helpers/global-setup.ts`
- EDIT: `package.json` (add test:db:setup script)
- EDIT: `vitest.config.ts` (add test.env + globalSetup)
- EDIT: `tests/gateway/integration/manual-trigger.integration.test.ts`
- EDIT: `tests/gateway/seed-guest-messaging.test.ts`

## Files to touch (Wave 2)

- EDIT: `AGENTS.md`

## [TASK-1 COMPLETE]
- tests/helpers/global-setup.ts created ✓
- package.json test:db:setup script added ✓
- ai_employee_test database created via pnpm test:db:setup ✓

## [TASK-2 BLOCKER — Prisma v6 .env Override]

**Root cause confirmed**: Prisma v6 CLI always loads `.env` and its values **override** process environment variables. This is a breaking change from Prisma v5.

**Evidence**:
- `env: { ...process.env, DATABASE_URL: 'ai_employee_test' }` passed to `execSync` — IGNORED
- `env -i DATABASE_URL=ai_employee_test npx prisma migrate deploy` — IGNORED  
- `PRISMA_DISABLE_DOTENV=1` — not a valid Prisma env var, has no effect
- Prisma output always shows: `Environment variables loaded from .env` then `Datasource "db": PostgreSQL database "ai_employee"`

**What works**: Temporarily renaming `.env` to `.env.bak` before running Prisma CLI commands, then restoring it in a `finally` block. This was implemented and confirmed working (migration ran against `ai_employee_test`) but was reverted by orchestrator instruction.

**Current state**: `global-setup.ts` uses `env: { ...process.env }` as prescribed, but migrations run against `ai_employee` (dev DB) and seed fails on `ai_employee_test` (no tables).

**Required fix**: Either (a) restore the `.env` rename approach, or (b) pre-create `ai_employee_test` schema separately outside of globalSetup.
