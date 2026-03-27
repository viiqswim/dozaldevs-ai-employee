# Learnings — Phase 1 Foundation

## Key Technical Facts
- Prisma version pinned to ^6.0.0 (NOT 7.x — seed config is in package.json, not prisma.config.ts)
- Local Supabase DB: postgresql://postgres:postgres@localhost:54322/postgres (port 54322, NOT 5432)
- Dashboard: http://localhost:54323
- REST API: http://localhost:54321
- Default tenant_id: 00000000-0000-0000-0000-000000000001
- ESM project: "type": "module" + NodeNext module resolution
- tsx (NOT ts-node) for TypeScript execution (seed, scripts)
- CHECK constraints require raw SQL migration (--create-only), NOT Prisma schema
- actor CHECK values: gateway, lifecycle_fn, watchdog, machine, manual (note: 'machine' added preemptively for Phase 6)
- All FKs referencing forward-compat tables (archetypes, departments) must be NULLABLE
- Vitest DB tests: pool='forks', singleFork=true for sequential execution

## Task 5: Prisma Migrations + CHECK Constraints (2026-03-26)

### Migration Flow
- `prisma migrate dev --name init` → creates and applies initial migration with all 16 tables
- `prisma migrate dev --create-only --name add_check_constraints` → creates migration file WITHOUT applying
- The `--create-only` file was NOT empty — Prisma generated `ALTER TABLE SET DEFAULT` statements for tenant_id drift
- Must APPEND CHECK constraints to the existing content (not overwrite)
- `prisma migrate dev` (no --name) applied the check_constraints migration but then detected further drift and prompted for new migration name (timed out)
- Workaround: ran `prisma migrate dev --name sync_schema` to apply remaining drift as a named migration
- Final state: 3 migrations total (init, add_check_constraints, sync_schema) — all applied

### Schema Drift Issue
- Even though init migration sets `DEFAULT '00000000-0000-0000-0000-000000000001'` in CREATE TABLE DDL, Prisma still generated duplicate `ALTER TABLE SET DEFAULT` in subsequent migrations
- Root cause: Prisma shadow DB compares schema.prisma representation vs actual DB state — subtle UUID default representation difference
- Result: `sync_schema` contains same SET DEFAULT statements as `add_check_constraints` — harmless no-op

### `prisma db execute --stdin` Usage
- Requires `--schema prisma/schema.prisma` flag (or --url) — not auto-detected from .env when using stdin
- Returns only "Script executed successfully." — no query results returned to stdout
- Use `psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SQL"` for queries that need output

### QA Results
- Table count: 17 (16 app tables + `_prisma_migrations` internal table) — satisfies >= 16
- tasks_status_check: rejects 'InvalidStatus' ✓
- All 13 valid statuses accepted ✓
- task_status_log_actor_check: rejects 'robot' ✓
- 'machine' actor accepted (Phase 6 forward-compat) ✓
- `pnpm prisma generate` exits 0 ✓
- Commit: `db: apply initial migration and add CHECK constraints via raw SQL`

### INSERT Requirements for tasks table
- Must include `updated_at` when inserting via raw SQL (it's NOT NULL, no DEFAULT in SQL level)
- Prisma auto-populates `updated_at` via `@updatedAt` directive — but raw SQL bypasses this

## Task 1: Package.json & Dependencies (2026-03-26)
- Created package.json with ESM type module, Node >=20.0.0
- Prisma 6.19.2 installed (^6.0.0 constraint respected)
- All dev tools installed: typescript 5.9.3, vitest 2.1.9, tsx 4.21.0, eslint 9.39.4, prettier 3.8.1
- pnpm-lock.yaml generated (75KB, 193 packages total)
- No runtime frameworks installed (Fastify, Inngest, Express, Hono) — correct for Phase 1
- No start/dev scripts — correct for Phase 1 (server comes in Phase 2)
- Prisma seed config in package.json: `"prisma": { "seed": "tsx prisma/seed.ts" }` (Prisma 6.x format)
- All QA checks passed: structure ✓, @prisma/client ✓, dev deps ✓, lockfile ✓, no forbidden deps ✓

## Task 2: Config Files Scaffolding (2026-03-26)

### ESLint 9 Flat Config
- Use `eslint.config.mjs` (not `.eslintrc.json`) for flat config format
- Import `typescript-eslint` and use `tseslint.config()` wrapper
- Use `projectService: true` instead of `parserOptions.project` (modern approach)
- `globals` npm package provides `globals.node` for Node.js environments
- `eslint-config-prettier` MUST be last in config array to disable conflicting rules
- Ignores array in first config object handles all ignore patterns

### TypeScript Config
- `noEmit: true` added to prevent output directory creation during type checking
- Include paths require at least one matching file (created `src/index.ts` placeholder)
- `NodeNext` module resolution works with `"type": "module"` in package.json
- Strict mode enabled for type safety

### Prettier Config
- JSON format works fine (no need for .js)
- Config files themselves must be formatted with Prettier
- `.prettierignore` file prevents formatting of lock files and migrations

### Verification
- All QA checks pass: build, lint, format
- ESLint ignores verified to contain required patterns
- Commit successful with proper message format

## Task 4: Prisma Schema — All 16 Models (2026-03-26)

### Relation Disambiguation (Critical)
- Archetype↔AgentVersion has TWO distinct relations that must both be named:
  1. `"ArchetypeVersions"` — AgentVersion.archetype FK (ownership: which archetype owns this version)
     Back-relation: Archetype.agentVersions AgentVersion[]
  2. `"CurrentArchetypeVersion"` — Archetype.agentVersion FK (the currently active version pointer)
     Back-relation: AgentVersion.activeArchetypes Archetype[]
- Without naming BOTH, Prisma throws P1012 "missing opposite relation field"
- prisma format auto-aligns columns but does NOT auto-fix missing back-relations

### QA Results
- `pnpm prisma validate` → EXIT:0 "The schema at prisma/schema.prisma is valid 🚀"
- 16 models confirmed (`grep -c "^model "`)
- 16 @@map entries (one per model)
- @@unique([external_id, source_system, tenant_id]) on Task confirmed
- 5 nullable archetype_id fields (>= 2 required)
- `pnpm prisma format` ran successfully after validate

### Notes
- The deprecation warning about `package.json#prisma` is harmless (Prisma 7 concern, we're on 6.x)
- .sisyphus/evidence/ is in .gitignore — evidence files saved but not committed (correct)

## Task 5 Gotcha (2026-03-26)
- tasks.updated_at is NOT NULL (Prisma @updatedAt). Raw SQL inserts MUST include updated_at=NOW()
- executions.updated_at is also NOT NULL — same rule
- projects.updated_at is also NOT NULL — same rule
- pnpm prisma db execute --stdin requires --schema prisma/schema.prisma flag
- For direct SQL queries, use psql: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres
- 3 migration files: init (tables), add_check_constraints (CHECK SQL), sync_schema (housekeeping)

## Task 6: Idempotent Seed Data (2026-03-26)

### Seed File Implementation
- Created `prisma/seed.ts` with upsert pattern for idempotency
- Seeded 2 records: 1 project + 1 agent_version (no other tables)
- Project ID: `00000000-0000-0000-0000-000000000003`
- AgentVersion ID: `00000000-0000-0000-0000-000000000002`
- Project tenant_id defaults to `00000000-0000-0000-0000-000000000001` (via schema default, NOT set in seed)
- AgentVersion has NO tenant_id column (verified in schema)

### Idempotency Verification
- Run 1: `pnpm db:seed` → EXIT:0, created 2 records
- Run 2: `pnpm db:seed` → EXIT:0, updated same 2 records (no duplicates)
- `SELECT COUNT(*) FROM projects` → 1 (not 2)
- `SELECT COUNT(*) FROM agent_versions` → 1 (not 2)
- Project tenant_id confirmed: `00000000-0000-0000-0000-000000000001`

### Commit
- Message: `db: add idempotent seed data for project and agent_version records`
- File: `prisma/seed.ts`
- Hash: 473e6de

## Task 8: Phase 1 Verification Playbook (2026-03-26)

### Script Implementation
- Created `scripts/verify-phase1.sh` with 10 checks (7 original + 3 bonus)
- All checks pass end-to-end: EXIT:0
- Script is executable: `chmod +x scripts/verify-phase1.sh`

### Check Coverage
1. TypeScript compilation (pnpm build)
2. Local Supabase running (supabase status)
3. Prisma migrations applied (prisma migrate status)
4. All 16 tables exist (information_schema query)
5. Seed data present (projects + agent_versions count)
6. CHECK constraint enforced (tasks.status rejects InvalidStatus)
7. Prisma client generation (prisma generate)
8. BONUS: ESLint passes (pnpm lint)
9. BONUS: Vitest tests pass (pnpm test --run)
10. BONUS: Seed idempotency (2 runs produce same result)

### Output Format
- User-friendly with ✓ PASS / ✗ FAIL per check
- Summary box with total passed/failed
- System snapshot showing key endpoints
- Exit code 0 if all pass, 1 if any fail

### Commit
- Message: `chore: add Phase 1 manual verification playbook`
- File: `scripts/verify-phase1.sh`
- Hash: 5c71edd
