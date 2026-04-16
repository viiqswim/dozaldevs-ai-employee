# Learnings — multi-tenancy-implementation

## [2026-04-16] Initial Codebase Scan

### Schema patterns

- Prisma models use `@id @default(uuid()) @db.Uuid` for UUID PKs
- Some older models use `@default(dbgenerated("gen_random_uuid()"))` — prefer `@default(uuid())` for new models
- All 6 tenant-bearing tables use `@default("00000000-0000-0000-0000-000000000001")` as default `tenant_id`
- `Archetype` model already has `@@unique([tenant_id, role_name])` — this is the pattern for TenantSecret's `@@unique([tenant_id, key])`
- Tables to add FK constraints in T6: `tasks`, `projects`, `feedback`, `departments`, `archetypes`, `knowledge_bases`
- DO NOT add `tenant_id` to: `executions`, `deliverables`, `validation_runs`, `task_status_log`, `risk_models`, `cross_dept_triggers`, `agent_versions`, `clarifications`, `reviews`, `audit_log`

### Existing schemas.ts

- `UUID_REGEX` and `uuidField()` already exist in `src/gateway/validation/schemas.ts` (lines 168-170)
- Import `uuidField` (or replicate `UUID_REGEX`) when writing new schemas — do NOT use `z.string().uuid()` (breaks system tenant UUID)
- Exports are named (no default exports)

### Route patterns

- Routes use `adminProjectRoutes(opts: AdminProjectRouteOptions = {}): Router` factory pattern
- `requireAdminKey` middleware from `src/gateway/middleware/admin-auth.ts` — applied as Express middleware
- Error pattern: catch `PrismaClientKnownRequestError` code `P2002` for unique constraint violations → return 409
- Pino logger constructed in-file: `const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })`
- `SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001'` constant used in routes

### Service patterns

- Services use plain async functions (employee-dispatcher) OR classes (look for project-registry.ts)
- Dependencies injected via function params or constructor
- Prisma client: `import { PrismaClient } from '@prisma/client'`

### Pre-existing errors to ignore (per AGENTS.md)

- `src/inngest/lifecycle.ts` — has pre-existing TS errors; do NOT fix unrelated ones
- `src/inngest/redispatch.ts` — same
- `prisma/seed.ts` — same
- `src/inngest/employee-lifecycle.ts` — same
- `tests/inngest/lifecycle.test.ts` — same

### Key UUIDs

- Platform tenant: `00000000-0000-0000-0000-000000000001`
- DozalDevs tenant: `00000000-0000-0000-0000-000000000002`
- VLRE tenant: `00000000-0000-0000-0000-000000000003`

### Database

- URL: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- `DATABASE_URL` env var points to this
