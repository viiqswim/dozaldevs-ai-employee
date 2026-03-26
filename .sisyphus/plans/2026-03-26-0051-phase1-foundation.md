# Phase 1: Foundation — TypeScript Project, Prisma Schema, Local Supabase

## TL;DR

> **Quick Summary**: Scaffold a greenfield TypeScript project with pnpm, configure Prisma to define all 16 database tables (7 MVP + 9 forward-compat), run local Supabase, apply migrations with CHECK/UNIQUE constraints, and seed initial data — verified by automated Vitest tests and a manual verification playbook.
>
> **Deliverables**:
> - TypeScript project compiling clean (`tsc --noEmit`)
> - Prisma schema with 16 tables matching §13 architecture spec
> - Local Supabase running with all migrations applied
> - Seed data: 1 project record, 1 agent_version record
> - CHECK constraints on `tasks.status` and `task_status_log.actor`
> - UNIQUE constraint on `tasks(external_id, source_system, tenant_id)`
> - Vitest automated test suite for schema validation
> - Manual verification playbook matching Phase 1 criteria
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: T1 → T4 → T5 → T6 → T7/T8 → F1-F4

---

## Context

### Original Request
Execute Phase 1 (Foundation) from `docs/2026-03-25-1901-mvp-implementation-phases.md`. Work ONLY on the foundation. Include automated tests, agent-executed QA scenarios, and manual verification steps the user can follow after completion.

### Interview Summary
**Key Discussions**:
- Scope: Phase 1 ONLY — no runtime code, no Fastify, no Inngest functions
- Test framework: Vitest (tests-after approach, not TDD)
- ESLint: Flat config (`eslint.config.mjs`)
- GitHub repo for seed data: Placeholder URL (user updates before Phase 5)

**Research Findings**:
- Project is completely greenfield (no package.json, no src/, no prisma/)
- §13 provides exact ERD with all columns for 16 tables
- §15 specifies: pnpm, TypeScript, Prisma migrations, Supabase (PostgreSQL)
- §21 provides exact `feedback` table CREATE TABLE SQL
- §27.5 provides local connection: `postgresql://postgres:postgres@localhost:54322/postgres`

### Metis Review
**Identified Gaps** (addressed):
- Prisma has zero native CHECK constraint support → resolved with raw SQL migration via `--create-only`
- `archetype_id` FK on agent_versions/tasks references empty forward-compat table → resolved by making all forward-compat FKs nullable
- Prisma 7.x has breaking seed config changes → resolved by pinning `^6.0.0`
- Vitest DB tests can race condition → resolved with sequential execution config
- `supabase init` creates competing migrations directory → resolved with Prisma-only migration note
- Phase 6 uses `'machine'` actor not in §13 CHECK constraint → resolved by including `'machine'` preemptively

---

## Work Objectives

### Core Objective
Establish the complete database schema and project infrastructure for the AI Employee platform. After Phase 1, the project compiles, all 16 tables exist in local Supabase, constraints are enforced, and seed data is queryable.

### Concrete Deliverables
- `package.json` with all dependencies installed via pnpm
- `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`
- Directory structure: `src/gateway/`, `src/inngest/`, `src/lib/`, `src/workers/`
- `prisma/schema.prisma` with 16 table models
- Prisma migration files (initial + CHECK constraints)
- `prisma/seed.ts` with idempotent upserts
- `.env` and `.env.example` files
- `supabase/config.toml` (from `supabase init`)
- Vitest test suite (`tests/schema.test.ts`)
- Manual verification playbook (`scripts/verify-phase1.sh`)

### Definition of Done
- [ ] `pnpm tsc --noEmit` exits 0 (zero errors)
- [ ] `supabase status` shows running services
- [ ] `pnpm prisma migrate dev` reports all migrations applied
- [ ] All 16 tables exist and are queryable
- [ ] Seed data present (1 project, 1 agent_version)
- [ ] CHECK constraint rejects invalid `tasks.status`
- [ ] UNIQUE constraint rejects duplicate `tasks(external_id, source_system, tenant_id)`
- [ ] `pnpm prisma generate` succeeds
- [ ] `pnpm test` passes all Vitest tests
- [ ] `pnpm lint` exits 0

### Must Have
- All 7 MVP tables with exact columns from §13
- All 9 forward-compat tables with exact columns from §13
- CHECK constraint on `tasks.status` with all 13 valid values
- CHECK constraint on `task_status_log.actor` with values: `gateway`, `lifecycle_fn`, `watchdog`, `machine`, `manual`
- UNIQUE constraint on `tasks(external_id, source_system, tenant_id)` for idempotency
- Default `tenant_id` = `00000000-0000-0000-0000-000000000001` across all tables
- Idempotent seed script (running twice produces same result)
- All FKs referencing forward-compat tables are NULLABLE

### Must NOT Have (Guardrails)
- NO runtime application code (no Fastify routes, no Inngest functions, no HTTP handlers)
- NO `src/` files with code content — only empty directories with `.gitkeep`
- NO pgvector extension enabled
- NO Supabase Auth or RLS policies configured
- NO GitHub Actions CI/CD workflows
- NO Docker Compose or Dockerfile
- NO `prisma db push` — only `prisma migrate dev`
- NO SQL files in `supabase/migrations/` — Prisma owns all migrations
- NO extra seed data beyond 1 project + 1 agent_version
- NO coverage thresholds or coverage configuration in Vitest

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: NO (greenfield — will be created in this plan)
- **Automated tests**: YES (Tests-after — Vitest tests in Task 7)
- **Framework**: Vitest
- **Manual Verification Playbook**: YES (Task 8 — step-by-step commands the user runs post-completion)

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Database operations**: Use Bash (`npx prisma db execute`) — Run SQL, assert results
- **Build verification**: Use Bash (`pnpm tsc --noEmit`, `pnpm lint`) — Assert exit code 0
- **Test execution**: Use Bash (`pnpm test --run`) — Assert all tests pass

---

## Execution Strategy

### Parallel Execution Waves

> Foundation work is inherently sequential (can't test tables that don't exist).
> Parallelism is maximized within each wave where possible.

```
Wave 1 (Start Immediately — project scaffolding, 3 parallel):
├── Task 1: pnpm project init + all dependencies [quick]
├── Task 2: TypeScript + ESLint + Prettier config [quick]
└── Task 3: Directory structure + Supabase init + .env files [quick]

Wave 2 (After Wave 1 — schema definition):
└── Task 4: Prisma schema — datasource, generator, all 16 models [unspecified-high]

Wave 3 (After Wave 2 — database operations):
└── Task 5: Apply Prisma migration + CHECK constraints via raw SQL [unspecified-high]

Wave 4 (After Wave 3 — seed data):
└── Task 6: Seed data — idempotent upserts [quick]

Wave 5 (After Wave 4 — verification layer, 2 parallel):
├── Task 7: Vitest setup + automated schema constraint tests [unspecified-high]
└── Task 8: Manual verification playbook [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

Critical Path: T1 → T4 → T5 → T6 → T7 → F1-F4 → user okay
Max Concurrent: 3 (Wave 1)

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | — | T4, T5, T6, T7 | 1 |
| T2 | — | T4, T7 | 1 |
| T3 | — | T4, T5 | 1 |
| T4 | T1, T2, T3 | T5 | 2 |
| T5 | T4 | T6 | 3 |
| T6 | T5 | T7, T8 | 4 |
| T7 | T6 | F1-F4 | 5 |
| T8 | T6 | F1-F4 | 5 |
| F1-F4 | T7, T8 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **1** — T4 → `unspecified-high`
- **Wave 3**: **1** — T5 → `unspecified-high`
- **Wave 4**: **1** — T6 → `quick`
- **Wave 5**: **2** — T7 → `unspecified-high`, T8 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [ ] 1. Init pnpm project with all dependencies

  **What to do**:
  - Run `pnpm init` to create `package.json`
  - Set `"name": "ai-employee"`, `"type": "module"`, `"private": true`
  - Add `"engines": { "node": ">=20.0.0" }` for Node.js version enforcement
  - Install production dependencies: `@prisma/client`
  - Install dev dependencies: `prisma@^6`, `typescript@^5`, `@types/node@^20`, `vitest`, `tsx`, `eslint@^9`, `@eslint/js`, `typescript-eslint`, `globals`, `prettier`, `eslint-config-prettier`
  - Add scripts to `package.json`:
    - `"build": "tsc --noEmit"`
    - `"lint": "eslint ."`
    - `"format": "prettier --write ."`
    - `"format:check": "prettier --check ."`
    - `"test": "vitest"`
    - `"db:migrate": "prisma migrate dev"`
    - `"db:generate": "prisma generate"`
    - `"db:seed": "tsx prisma/seed.ts"`
    - `"db:studio": "prisma studio"`
  - Add `"prisma": { "seed": "tsx prisma/seed.ts" }` to package.json (Prisma 6.x seed config)
  - Run `pnpm install` to generate lockfile

  **Must NOT do**:
  - Do NOT install Fastify, Inngest, or any runtime framework
  - Do NOT install testing libraries beyond Vitest
  - Do NOT add start/dev scripts (no server to start in Phase 1)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation (package.json) + dependency installation
  - **Skills**: []
    - No specialized skills needed — standard npm/pnpm init workflow

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7 (need dependencies installed)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1882-1920` — §15 Technology Stack: specifies pnpm, Prisma, TypeScript, Vitest choices and rationale
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:83-86` — Phase 1 scaffolding requirements: "TypeScript project with tsconfig.json, package.json (pnpm)"

  **External References**:
  - Prisma 6.x seed config: seed command goes in `package.json` under `"prisma": { "seed": "..." }` (NOT `prisma.config.ts` which is Prisma 7.x)
  - `tsx` is the recommended TypeScript runner for seed files (faster than ts-node, ESM-compatible)

  **WHY Each Reference Matters**:
  - §15 determines which packages to install — only those listed in the architecture doc
  - Phase 1 doc sets the scope boundary — package.json but no runtime dependencies
  - Prisma 6.x is pinned because 7.x uses `prisma.config.ts` for seed, which is a breaking change

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: package.json created with correct structure
    Tool: Bash
    Preconditions: Clean working directory, pnpm available
    Steps:
      1. Run `cat package.json | node -e "const p=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(p); console.log(j.name, j.type, j.private)"` — verify name, type, private
      2. Run `cat package.json | node -e "const p=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(p); console.log(JSON.stringify(j.engines))"` — verify engines field
      3. Run `cat package.json | node -e "const p=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(p); console.log(Object.keys(j.scripts).sort().join(','))"` — verify all scripts present
    Expected Result: `ai-employee module true`, `{"node":">=20.0.0"}`, all 8 script names listed
    Failure Indicators: Missing fields, wrong values, missing scripts
    Evidence: .sisyphus/evidence/task-1-package-json-structure.txt

  Scenario: All dependencies installed correctly
    Tool: Bash
    Preconditions: package.json created, pnpm available
    Steps:
      1. Run `pnpm list --depth 0 2>/dev/null | grep -c "@prisma/client"` — verify prod dep
      2. Run `pnpm list --dev --depth 0 2>/dev/null | grep -c "prisma"` — verify prisma CLI
      3. Run `pnpm list --dev --depth 0 2>/dev/null | grep -c "vitest"` — verify vitest
      4. Run `pnpm list --dev --depth 0 2>/dev/null | grep -c "typescript"` — verify typescript
      5. Run `pnpm list --dev --depth 0 2>/dev/null | grep -c "tsx"` — verify tsx
      6. Run `test -f pnpm-lock.yaml && echo "EXISTS" || echo "MISSING"` — verify lockfile
    Expected Result: All counts = 1, lockfile EXISTS
    Failure Indicators: Any count = 0, missing lockfile
    Evidence: .sisyphus/evidence/task-1-dependencies-installed.txt

  Scenario: No forbidden runtime dependencies
    Tool: Bash
    Preconditions: Dependencies installed
    Steps:
      1. Run `pnpm list --depth 0 2>/dev/null | grep -iE "fastify|inngest|express|hono" | wc -l`
    Expected Result: 0 (no runtime frameworks installed)
    Failure Indicators: Count > 0
    Evidence: .sisyphus/evidence/task-1-no-forbidden-deps.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-package-json-structure.txt
  - [ ] task-1-dependencies-installed.txt
  - [ ] task-1-no-forbidden-deps.txt

  **Commit**: YES (group 1)
  - Message: `scaffold: init pnpm project with TypeScript and dependencies`
  - Files: `package.json`, `pnpm-lock.yaml`
  - Pre-commit: `test -f pnpm-lock.yaml`

- [ ] 2. TypeScript, ESLint flat config, and Prettier configuration

  **What to do**:
  - Create `tsconfig.json`:
    - `"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
    - `"strict": true`, `"esModuleInterop": true`, `"skipLibCheck": true`
    - `"outDir": "./dist"`, `"rootDir": "."`
    - `"include": ["src/**/*", "prisma/**/*", "tests/**/*", "scripts/**/*"]`
    - `"exclude": ["node_modules", "dist"]`
    - `"forceConsistentCasingInFileNames": true`, `"resolveJsonModule": true`
  - Create `eslint.config.mjs`:
    - Import `@eslint/js` recommended rules
    - Import `typescript-eslint` with `projectService: true`
    - Import `eslint-config-prettier` to disable conflicting rules
    - Import `globals` package for `globals.node`
    - Set `files: ["**/*.ts"]`
    - Set `ignores: ["node_modules/", "dist/", "supabase/", "prisma/migrations/"]`
  - Create `.prettierrc`:
    - `{ "semi": true, "singleQuote": true, "tabWidth": 2, "trailingComma": "all", "printWidth": 100 }`
  - Create `.prettierignore`:
    - `node_modules`, `dist`, `pnpm-lock.yaml`, `supabase/`, `prisma/migrations/`

  **Must NOT do**:
  - Do NOT add React/JSX rules
  - Do NOT add custom ESLint rules beyond recommended + typescript-eslint
  - Do NOT configure ESLint for files that don't exist yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating 4 config files with well-known patterns
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4 (TypeScript compilation check), Task 7 (Vitest config)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1882-1920` — §15 Technology Stack: confirms TypeScript, ESLint
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:86-87` — "ESLint + Prettier configuration"

  **External References**:
  - ESLint 9 flat config: uses `eslint.config.mjs` with composable arrays. `typescript-eslint` v8+ uses `projectService: true` (replaces `parserOptions.project`)
  - `globals` npm package: provides `globals.node` for ESLint flat config (replaces `env: { node: true }`)
  - `eslint-config-prettier`: last in the config array to override conflicting formatting rules

  **WHY Each Reference Matters**:
  - §15 confirms the linting/formatting stack choices
  - Phase 1 doc explicitly requires ESLint + Prettier as part of scaffolding
  - `projectService: true` is the modern approach for typescript-eslint (not `parserOptions.project`)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compiles with zero errors
    Tool: Bash
    Preconditions: tsconfig.json created, dependencies installed (from Task 1)
    Steps:
      1. Run `pnpm tsc --noEmit 2>&1; echo "EXIT:$?"`
    Expected Result: No error output, EXIT:0
    Failure Indicators: Any TypeScript error output, non-zero exit code
    Evidence: .sisyphus/evidence/task-2-tsc-clean.txt

  Scenario: ESLint runs without configuration errors
    Tool: Bash
    Preconditions: eslint.config.mjs created, dependencies installed
    Steps:
      1. Run `pnpm lint 2>&1; echo "EXIT:$?"`
    Expected Result: No errors (may have 0 files to lint — that's OK), EXIT:0
    Failure Indicators: "Configuration error", "Cannot find module", non-zero exit
    Evidence: .sisyphus/evidence/task-2-eslint-clean.txt

  Scenario: Prettier checks pass on config files
    Tool: Bash
    Preconditions: .prettierrc and .prettierignore created
    Steps:
      1. Run `pnpm format:check 2>&1; echo "EXIT:$?"`
    Expected Result: All files formatted correctly, EXIT:0
    Failure Indicators: "Code style issues found", non-zero exit
    Evidence: .sisyphus/evidence/task-2-prettier-clean.txt

  Scenario: ESLint ignores correct directories
    Tool: Bash
    Preconditions: eslint.config.mjs with ignores configured
    Steps:
      1. Run `grep -c "node_modules" eslint.config.mjs && grep -c "prisma/migrations" eslint.config.mjs`
    Expected Result: Both counts >= 1 (ignored directories referenced)
    Failure Indicators: Count = 0 for either
    Evidence: .sisyphus/evidence/task-2-eslint-ignores.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-tsc-clean.txt
  - [ ] task-2-eslint-clean.txt
  - [ ] task-2-prettier-clean.txt
  - [ ] task-2-eslint-ignores.txt

  **Commit**: YES (group 2)
  - Message: `scaffold: add ESLint flat config, Prettier, and TypeScript config`
  - Files: `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`
  - Pre-commit: `pnpm tsc --noEmit && pnpm lint`

- [ ] 3. Directory structure, Supabase init, and environment files

  **What to do**:
  - Create directory structure with `.gitkeep` files:
    - `src/gateway/.gitkeep`
    - `src/inngest/.gitkeep`
    - `src/lib/.gitkeep`
    - `src/workers/.gitkeep`
    - `tests/.gitkeep`
    - `scripts/.gitkeep`
  - Update `.gitignore` to add:
    - `node_modules/`, `dist/`, `.env`, `.env.local`
    - `supabase/.temp/` (Supabase temp files)
    - Keep existing entries intact
  - Run `supabase init` in the project root (creates `supabase/config.toml`)
  - Run `supabase start` to start local Supabase (requires Docker Desktop running)
  - Capture the Supabase output to get the local credentials (especially `service_role key`)
  - Create `.env` file:
    ```
    DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"
    DATABASE_URL_DIRECT="postgresql://postgres:postgres@localhost:54322/postgres"
    SUPABASE_URL="http://localhost:54321"
    SUPABASE_SECRET_KEY="<from supabase start output>"
    ```
  - Create `.env.example` file (same structure but with placeholder values):
    ```
    DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"
    DATABASE_URL_DIRECT="postgresql://postgres:postgres@localhost:54322/postgres"
    SUPABASE_URL="http://localhost:54321"
    SUPABASE_SECRET_KEY="your-supabase-service-role-key"
    ```

  **Must NOT do**:
  - Do NOT create any `.ts` or `.js` files inside `src/` directories — only `.gitkeep`
  - Do NOT put SQL migration files in `supabase/migrations/` — Prisma owns migrations
  - Do NOT configure Supabase Auth, Storage, or Edge Functions
  - Do NOT add runtime environment variables (GITHUB_TOKEN, OPENROUTER_API_KEY, etc.) — those are for Phase 4+

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating empty directories, running CLI commands, creating env files
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5 (need Supabase running and .env for Prisma)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:85` — Directory structure: `src/gateway/`, `src/inngest/`, `src/lib/`, `src/workers/`
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:104-106` — "supabase init + supabase start, Migrations applied via npx prisma migrate dev"
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2757-2765` — §27.5 Local Supabase: `supabase start`, dashboard at http://localhost:54323, DB at localhost:54322
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2819-2831` — §27.5 Minimal `.env.local` format with all connection strings

  **WHY Each Reference Matters**:
  - Phase 1 doc specifies exact directory names — must match for Phase 2+ code to land in correct directories
  - §27.5 has the exact connection strings and port numbers for local Supabase — these go into .env
  - supabase start output includes the service_role key needed for .env

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Directory structure matches Phase 1 spec
    Tool: Bash
    Preconditions: Project root exists
    Steps:
      1. Run `for d in src/gateway src/inngest src/lib src/workers tests scripts; do test -d "$d" && echo "$d:EXISTS" || echo "$d:MISSING"; done`
      2. Run `for d in src/gateway src/inngest src/lib src/workers; do test -f "$d/.gitkeep" && echo "$d/.gitkeep:EXISTS" || echo "$d/.gitkeep:MISSING"; done`
    Expected Result: All directories exist, all .gitkeep files exist
    Failure Indicators: Any "MISSING" output
    Evidence: .sisyphus/evidence/task-3-directory-structure.txt

  Scenario: Supabase is running and accessible
    Tool: Bash
    Preconditions: Docker Desktop running
    Steps:
      1. Run `supabase status 2>&1`
      2. Run `curl -s -o /dev/null -w "%{http_code}" http://localhost:54321/rest/v1/ -H "apikey: $(supabase status -o env | grep ANON_KEY | cut -d= -f2)"`
    Expected Result: supabase status shows services running, curl returns 200
    Failure Indicators: "not running", curl returns non-200
    Evidence: .sisyphus/evidence/task-3-supabase-running.txt

  Scenario: .env file has correct DATABASE_URL
    Tool: Bash
    Preconditions: .env file created
    Steps:
      1. Run `grep "DATABASE_URL=" .env | head -1`
      2. Run `grep "SUPABASE_URL=" .env | head -1`
    Expected Result: DATABASE_URL contains "localhost:54322", SUPABASE_URL contains "localhost:54321"
    Failure Indicators: Wrong port numbers, missing variables
    Evidence: .sisyphus/evidence/task-3-env-file.txt

  Scenario: .gitignore excludes sensitive and generated files
    Tool: Bash
    Preconditions: .gitignore exists
    Steps:
      1. Run `grep -c "node_modules" .gitignore`
      2. Run `grep -c ".env" .gitignore`
      3. Run `grep -c "dist" .gitignore`
    Expected Result: All counts >= 1
    Failure Indicators: Any count = 0
    Evidence: .sisyphus/evidence/task-3-gitignore.txt

  Scenario: No code files exist in src/ directories
    Tool: Bash
    Preconditions: Directory structure created
    Steps:
      1. Run `find src/ -name "*.ts" -o -name "*.js" -o -name "*.mjs" | wc -l`
    Expected Result: 0 (only .gitkeep files, no code)
    Failure Indicators: Count > 0
    Evidence: .sisyphus/evidence/task-3-no-src-code.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-directory-structure.txt
  - [ ] task-3-supabase-running.txt
  - [ ] task-3-env-file.txt
  - [ ] task-3-gitignore.txt
  - [ ] task-3-no-src-code.txt

  **Commit**: YES (group 3)
  - Message: `infra: init local Supabase and create directory structure with env files`
  - Files: `src/*/.gitkeep`, `tests/.gitkeep`, `scripts/.gitkeep`, `.gitignore`, `supabase/config.toml`, `.env.example`
  - Pre-commit: `supabase status`

- [ ] 4. Prisma schema — datasource, generator, and all 16 table models

  **What to do**:
  - Create `prisma/schema.prisma` with:
    - Datasource: `provider = "postgresql"`, `url = env("DATABASE_URL")`, `directUrl = env("DATABASE_URL_DIRECT")`
    - Generator: `provider = "prisma-client-js"`
  - Define all **7 MVP-active table** models with exact columns from §13 ERD:

    **`Task` model**:
    - `id` (String @id @default(uuid()) @db.Uuid)
    - `archetype_id` (String? @db.Uuid) — NULLABLE (archetypes is forward-compat)
    - `project_id` (String? @db.Uuid) — NULLABLE (optional for constraint testing)
    - `external_id` (String?)
    - `source_system` (String?)
    - `status` (String @default("Received"))
    - `requirements` (Json?)
    - `scope_estimate` (Int?)
    - `affected_resources` (Json?)
    - `tenant_id` (String @default("00000000-0000-0000-0000-000000000001") @db.Uuid)
    - `raw_event` (Json?) — Full normalized webhook payload
    - `dispatch_attempts` (Int @default(0))
    - `failure_reason` (String?)
    - `triage_result` (Json?) — Interface between Gateway and execution agent
    - `created_at` (DateTime @default(now()))
    - `updated_at` (DateTime @updatedAt)
    - Relations: project (Project?), archetype (Archetype?), executions, deliverables (via execution), feedback, statusLogs, clarifications, crossDeptTriggers, auditLogs
    - `@@unique([external_id, source_system, tenant_id])` for idempotency
    - `@@map("tasks")`

    **`Execution` model**:
    - `id` (String @id @default(uuid()) @db.Uuid)
    - `task_id` (String @db.Uuid)
    - `runtime_type` (String?) — "opencode" for engineering
    - `runtime_id` (String?) — Fly.io machine ID
    - `fix_iterations` (Int @default(0))
    - `status` (String @default("pending"))
    - `agent_version_id` (String? @db.Uuid) — NULLABLE
    - `prompt_tokens` (Int @default(0))
    - `completion_tokens` (Int @default(0))
    - `primary_model_id` (String?)
    - `estimated_cost_usd` (Decimal @default(0) @db.Decimal(10, 4))
    - `heartbeat_at` (DateTime?)
    - `current_stage` (String?)
    - `created_at` (DateTime @default(now()))
    - `updated_at` (DateTime @updatedAt)
    - Relations: task (Task), agentVersion (AgentVersion?), validationRuns, deliverables
    - `@@map("executions")`

    **`Deliverable` model**:
    - `id` (String @id @default(uuid()) @db.Uuid)
    - `execution_id` (String @db.Uuid)
    - `delivery_type` (String) — "pull_request", etc.
    - `external_ref` (String?) — PR URL
    - `risk_score` (Int @default(0))
    - `status` (String @default("pending"))
    - `created_at` (DateTime @default(now()))
    - Relations: execution (Execution), reviews
    - `@@map("deliverables")`

    **`ValidationRun` model**:
    - `id` (String @id @default(uuid()) @db.Uuid)
    - `execution_id` (String @db.Uuid)
    - `stage` (String) — "typescript", "lint", "unit", etc.
    - `status` (String) — "passed", "failed"
    - `iteration` (Int @default(1))
    - `error_output` (String?)
    - `duration_ms` (Int?)
    - `created_at` (DateTime @default(now()))
    - Relations: execution (Execution)
    - `@@map("validation_runs")`

    **`Project` model**:
    - `id` (String @id @default(uuid()) @db.Uuid)
    - `department_id` (String? @db.Uuid) — NULLABLE (departments is forward-compat)
    - `name` (String)
    - `repo_url` (String)
    - `default_branch` (String @default("main"))
    - `concurrency_limit` (Int @default(3))
    - `tooling_config` (Json?)
    - `tenant_id` (String @default("00000000-0000-0000-0000-000000000001") @db.Uuid)
    - `created_at` (DateTime @default(now()))
    - `updated_at` (DateTime @updatedAt)
    - Relations: department (Department?), tasks
    - `@@map("projects")`

    **`Feedback` model** (matches §21 CREATE TABLE):
    - `id` (String @id @default(uuid()) @db.Uuid)
    - `task_id` (String? @db.Uuid)
    - `agent_version_id` (String? @db.Uuid)
    - `feedback_type` (String) — "triage_override", "merge_override", "risk_score_adjustment", "pr_rejection"
    - `original_decision` (Json?)
    - `corrected_decision` (Json?)
    - `correction_reason` (String?)
    - `created_by` (String?)
    - `created_at` (DateTime @default(now()))
    - `tenant_id` (String @default("00000000-0000-0000-0000-000000000001") @db.Uuid)
    - Relations: task (Task?), agentVersion (AgentVersion?)
    - `@@map("feedback")`

    **`TaskStatusLog` model**:
    - `id` (String @id @default(uuid()) @db.Uuid)
    - `task_id` (String @db.Uuid)
    - `from_status` (String?)
    - `to_status` (String)
    - `actor` (String) — CHECK enforced via raw SQL: gateway, lifecycle_fn, watchdog, machine, manual
    - `created_at` (DateTime @default(now()))
    - Relations: task (Task)
    - `@@map("task_status_log")`

  - Define all **9 forward-compatibility table** models (empty but schema-ready):

    **`Department`**: id, name, slack_channel, tenant_id, created_at. `@@map("departments")`
    **`Archetype`**: id, department_id?, role_name, runtime, trigger_sources (Json?), tool_registry (Json?), risk_model (Json?), concurrency_limit (Int @default(3)), agent_version_id?, tenant_id, created_at. `@@map("archetypes")`
    **`KnowledgeBase`**: id, archetype_id?, last_indexed (DateTime?), chunk_count (Int @default(0)), source_config (Json?), tenant_id, created_at. `@@map("knowledge_bases")`
    **`RiskModel`**: id, archetype_id?, factors (Json?), auto_approve_threshold (Int @default(70)), created_at. `@@map("risk_models")`
    **`CrossDeptTrigger`**: id, source_task_id?, target_archetype_id (String?), runtime_hint (String?), payload (Json?), status (String @default("pending")), created_at. `@@map("cross_dept_triggers")`
    **`AgentVersion`**: id, archetype_id?, prompt_hash (String?), model_id (String?), tool_config_hash (String?), changelog_note (String?), created_at (DateTime @default(now())), is_active (Boolean @default(true)). `@@map("agent_versions")`
    **`Clarification`**: id, task_id?, question (String?), answer (String?), source_system (String?), external_ref (String?), asked_at (DateTime?), answered_at (DateTime?). `@@map("clarifications")`
    **`Review`**: id, deliverable_id?, reviewer_type (String?), agent_version_id?, risk_score (Int?), verdict (String?), comments (String?), created_at. `@@map("reviews")`
    **`AuditLog`**: id, task_id?, agent_version_id?, api_endpoint (String?), http_method (String?), response_status (Int?), created_at. `@@map("audit_log")`

  - Set up all Prisma relations between models (matching §13 ERD relationships)
  - Run `pnpm prisma validate` to verify schema is syntactically correct
  - Run `pnpm prisma format` to auto-format the schema file

  **Must NOT do**:
  - Do NOT add CHECK constraints in the Prisma schema (Prisma doesn't support them natively — handled in Task 5)
  - Do NOT add stored procedures, triggers, or views
  - Do NOT add pgvector column types
  - Do NOT run `prisma migrate dev` yet (that's Task 5)
  - Do NOT add any application logic or utility functions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Large schema file with 16 models, complex relations, precise column types. Requires careful attention to §13 ERD matching.
  - **Skills**: []
    - No specialized skills needed — Prisma schema is well-documented

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Task 5 (migration needs schema)
  - **Blocked By**: Tasks 1, 2, 3 (need deps, .env, Supabase)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1493-1679` — §13 Platform Data Model: COMPLETE ERD with all 16 tables, all columns, all types, all relationships. **This is the source of truth for every column and relation.**
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1681-1683` — CHECK constraint on task_status_log.actor and tasks.status (for documentation only — implementation is in Task 5)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1693` — UNIQUE(external_id, source_system, tenant_id) constraint on tasks table
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1697-1731` — triage_result interface contract (JSONB schema)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1749-1753` — tenant_id default UUID and rationale

  **API/Type References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2222-2234` — §21 feedback table: exact CREATE TABLE SQL with column types

  **External References**:
  - Prisma `@db.Uuid`: maps String to PostgreSQL uuid type
  - Prisma `@db.Decimal(10, 4)`: maps Decimal to PostgreSQL numeric(10,4)
  - Prisma `@@unique`: composite unique constraint (enforced at DB level)
  - Prisma `@@map`: maps model name to table name (e.g., `TaskStatusLog` → `task_status_log`)
  - Prisma `directUrl`: used for migrations (bypasses connection pooler)

  **WHY Each Reference Matters**:
  - §13 ERD is the SINGLE source of truth — every column must match exactly
  - §21 provides the exact SQL for the feedback table, which must be replicated in Prisma syntax
  - The UNIQUE constraint is critical for webhook idempotency (Phase 2)
  - tenant_id default is specified in the architecture doc — all tables use the same UUID constant

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Prisma schema validates without errors
    Tool: Bash
    Preconditions: prisma/schema.prisma created, .env with DATABASE_URL
    Steps:
      1. Run `pnpm prisma validate 2>&1; echo "EXIT:$?"`
    Expected Result: "The schema at prisma/schema.prisma is valid", EXIT:0
    Failure Indicators: Any validation error, non-zero exit
    Evidence: .sisyphus/evidence/task-4-prisma-validate.txt

  Scenario: All 16 models defined in schema
    Tool: Bash
    Preconditions: prisma/schema.prisma created
    Steps:
      1. Run `grep -c "^model " prisma/schema.prisma`
    Expected Result: 16 (exactly 16 model definitions)
    Failure Indicators: Count != 16
    Evidence: .sisyphus/evidence/task-4-model-count.txt

  Scenario: @@unique constraint defined on Task model
    Tool: Bash
    Preconditions: prisma/schema.prisma created
    Steps:
      1. Run `grep "@@unique" prisma/schema.prisma | grep "external_id"`
    Expected Result: Line containing `@@unique([external_id, source_system, tenant_id])`
    Failure Indicators: No match found
    Evidence: .sisyphus/evidence/task-4-unique-constraint.txt

  Scenario: All table names use snake_case mapping
    Tool: Bash
    Preconditions: prisma/schema.prisma created
    Steps:
      1. Run `grep '@@map' prisma/schema.prisma | wc -l`
    Expected Result: 16 (every model has a @@map directive)
    Failure Indicators: Count != 16
    Evidence: .sisyphus/evidence/task-4-table-mapping.txt

  Scenario: Forward-compat FKs are nullable
    Tool: Bash
    Preconditions: prisma/schema.prisma created
    Steps:
      1. Run `grep "archetype_id" prisma/schema.prisma | grep "String?" | wc -l`
      2. Run `grep "department_id" prisma/schema.prisma | grep "String?" | wc -l`
    Expected Result: archetype_id nullable count >= 2 (on Task, AgentVersion), department_id nullable count >= 2 (on Project, Archetype)
    Failure Indicators: Any count = 0
    Evidence: .sisyphus/evidence/task-4-nullable-fks.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-prisma-validate.txt
  - [ ] task-4-model-count.txt
  - [ ] task-4-unique-constraint.txt
  - [ ] task-4-table-mapping.txt
  - [ ] task-4-nullable-fks.txt

  **Commit**: YES (group 4)
  - Message: `db: define Prisma schema with all 16 table models`
  - Files: `prisma/schema.prisma`
  - Pre-commit: `pnpm prisma validate`

- [ ] 5. Apply Prisma migration and add CHECK constraints via raw SQL

  **What to do**:
  - Step 1: Run `pnpm prisma migrate dev --name init` to create and apply the initial migration
    - This auto-generates `prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql`
    - Verify it creates all 16 tables
  - Step 2: Create a raw SQL migration for CHECK constraints:
    - Run `pnpm prisma migrate dev --create-only --name add_check_constraints`
    - This creates an empty migration file at `prisma/migrations/YYYYMMDDHHMMSS_add_check_constraints/migration.sql`
    - Write the following SQL into this migration file:
    ```sql
    -- CHECK constraint on tasks.status (§13 recommendation)
    ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
      CHECK (status IN ('Received', 'Triaging', 'AwaitingInput', 'Ready', 'Executing', 'Validating', 'Submitting', 'Reviewing', 'Approved', 'Delivering', 'Done', 'Cancelled', 'Stale'));

    -- CHECK constraint on task_status_log.actor (§13 mandate)
    -- Includes 'machine' preemptively for Phase 6 compatibility
    ALTER TABLE task_status_log ADD CONSTRAINT task_status_log_actor_check
      CHECK (actor IN ('gateway', 'lifecycle_fn', 'watchdog', 'machine', 'manual'));
    ```
  - Step 3: Apply the CHECK constraint migration: `pnpm prisma migrate dev`
  - Step 4: Generate the Prisma client: `pnpm prisma generate`
  - Step 5: Verify CHECK constraints work by attempting invalid inserts

  **Must NOT do**:
  - Do NOT use `prisma db push` — only `prisma migrate dev`
  - Do NOT add CHECK constraints inside `prisma/schema.prisma` (not supported)
  - Do NOT add triggers, stored procedures, or views
  - Do NOT add CHECK constraints for `feedback_type`, `deliverables.status`, or `validation_runs.stage` (not in spec)
  - Do NOT put any migration SQL in `supabase/migrations/`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step database operation requiring careful ordering (migrate → create-only → write SQL → migrate again → generate). Raw SQL migration writing requires precision.
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: Task 6 (seed needs tables to exist)
  - **Blocked By**: Task 4 (needs Prisma schema)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1681-1683` — §13 CHECK constraints:
    - `tasks.status`: `CHECK (status IN ('Received', 'Triaging', 'AwaitingInput', 'Ready', 'Executing', 'Validating', 'Submitting', 'Reviewing', 'Approved', 'Delivering', 'Done', 'Cancelled', 'Stale'))`
    - `task_status_log.actor`: `CHECK (actor IN ('gateway', 'lifecycle_fn', 'watchdog', 'manual'))` — extend with `'machine'` for Phase 6
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:99-101` — Phase 1: "CHECK constraint on tasks.status", "UNIQUE constraint on tasks(external_id, source_system, tenant_id)"
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1898` — §15: "Prisma migrations hang when using Supabase pooler (port 6543). Always use direct connection (port 5432)"
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:114-142` — Phase 1 verification criteria: exact commands to verify tables and constraints

  **External References**:
  - `prisma migrate dev --create-only`: Creates migration file WITHOUT applying it. Required for hand-editing SQL (adding CHECK constraints)
  - Prisma does NOT support CHECK constraints natively — raw SQL in a separate migration is the documented approach
  - CHECK constraint syntax: `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)`

  **WHY Each Reference Matters**:
  - §13 provides the exact CHECK constraint values — must match character-for-character
  - Phase 1 verification criteria are the acceptance test — the migration must produce results matching those exact commands
  - The Supabase pooler warning prevents a common migration hang (use direct connection)
  - `--create-only` is essential: it lets us write raw SQL without Prisma overwriting it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Initial migration creates all 16 tables
    Tool: Bash
    Preconditions: Supabase running (from Task 3), Prisma schema defined (from Task 4)
    Steps:
      1. Run `pnpm prisma db execute --stdin <<< "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>&1`
    Expected Result: table_count >= 16
    Failure Indicators: Count < 16, migration errors
    Evidence: .sisyphus/evidence/task-5-table-count.txt

  Scenario: CHECK constraint rejects invalid task status
    Tool: Bash
    Preconditions: Migrations applied, CHECK constraints active
    Steps:
      1. Run `pnpm prisma db execute --stdin <<< "INSERT INTO tasks (id, status, tenant_id) VALUES (gen_random_uuid(), 'InvalidStatus', '00000000-0000-0000-0000-000000000001');" 2>&1`
    Expected Result: Error containing "check" or "constraint" or "violates"
    Failure Indicators: Insert succeeds without error
    Evidence: .sisyphus/evidence/task-5-status-check-constraint.txt

  Scenario: CHECK constraint accepts all valid task statuses
    Tool: Bash
    Preconditions: Migrations applied, CHECK constraints active
    Steps:
      1. Run: For each valid status (Received, Triaging, AwaitingInput, Ready, Executing, Validating, Submitting, Reviewing, Approved, Delivering, Done, Cancelled, Stale), insert and then delete a task row
      2. Concrete: `for s in Received Triaging AwaitingInput Ready Executing Validating Submitting Reviewing Approved Delivering Done Cancelled Stale; do pnpm prisma db execute --stdin <<< "INSERT INTO tasks (id, status, tenant_id) VALUES (gen_random_uuid(), '$s', '00000000-0000-0000-0000-000000000001');" 2>&1; done`
      3. Run: `pnpm prisma db execute --stdin <<< "DELETE FROM tasks WHERE tenant_id = '00000000-0000-0000-0000-000000000001';" 2>&1`
    Expected Result: All 13 inserts succeed (no constraint violations), cleanup succeeds
    Failure Indicators: Any insert fails with constraint violation
    Evidence: .sisyphus/evidence/task-5-valid-statuses.txt

  Scenario: CHECK constraint rejects invalid actor
    Tool: Bash
    Preconditions: Migrations applied
    Steps:
      1. First insert a valid task: `pnpm prisma db execute --stdin <<< "INSERT INTO tasks (id, status, tenant_id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Received', '00000000-0000-0000-0000-000000000001');" 2>&1`
      2. Run `pnpm prisma db execute --stdin <<< "INSERT INTO task_status_log (id, task_id, to_status, actor) VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ready', 'robot');" 2>&1`
      3. Cleanup: `pnpm prisma db execute --stdin <<< "DELETE FROM task_status_log; DELETE FROM tasks WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';" 2>&1`
    Expected Result: Step 2 fails with constraint violation (robot is not a valid actor)
    Failure Indicators: Insert succeeds
    Evidence: .sisyphus/evidence/task-5-actor-check-constraint.txt

  Scenario: CHECK constraint accepts 'machine' actor (Phase 6 forward-compat)
    Tool: Bash
    Preconditions: Migrations applied
    Steps:
      1. Insert a task: `pnpm prisma db execute --stdin <<< "INSERT INTO tasks (id, status, tenant_id) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Received', '00000000-0000-0000-0000-000000000001');" 2>&1`
      2. Run `pnpm prisma db execute --stdin <<< "INSERT INTO task_status_log (id, task_id, to_status, actor) VALUES (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Executing', 'machine');" 2>&1`
      3. Cleanup: `pnpm prisma db execute --stdin <<< "DELETE FROM task_status_log; DELETE FROM tasks WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';" 2>&1`
    Expected Result: Insert succeeds (machine is a valid actor)
    Failure Indicators: Constraint violation error
    Evidence: .sisyphus/evidence/task-5-machine-actor-valid.txt

  Scenario: Prisma client generates successfully
    Tool: Bash
    Preconditions: Migrations applied
    Steps:
      1. Run `pnpm prisma generate 2>&1; echo "EXIT:$?"`
    Expected Result: Output contains "Generated Prisma Client", EXIT:0
    Failure Indicators: Generation error, non-zero exit
    Evidence: .sisyphus/evidence/task-5-prisma-generate.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-table-count.txt
  - [ ] task-5-status-check-constraint.txt
  - [ ] task-5-valid-statuses.txt
  - [ ] task-5-actor-check-constraint.txt
  - [ ] task-5-machine-actor-valid.txt
  - [ ] task-5-prisma-generate.txt

  **Commit**: YES (group 5)
  - Message: `db: apply initial migration and add CHECK constraints via raw SQL`
  - Files: `prisma/migrations/*/migration.sql`
  - Pre-commit: `pnpm prisma migrate dev 2>&1 | grep -q "applied" || pnpm prisma migrate dev 2>&1 | grep -q "already"`

- [ ] 6. Seed data — idempotent upserts for project and agent_version

  **What to do**:
  - Create `prisma/seed.ts` with the following seed logic:
    - Import `PrismaClient` from `@prisma/client`
    - Create a singleton PrismaClient instance
    - Use `prisma.$transaction()` for atomicity
    - Use `prisma.agentVersion.upsert()` to create/update the test agent_version record:
      ```
      id: "00000000-0000-0000-0000-000000000002"
      prompt_hash: "initial-v1"
      model_id: "anthropic/claude-sonnet-4"
      tool_config_hash: "initial-v1"
      changelog_note: "Initial agent version for MVP testing"
      is_active: true
      ```
    - Use `prisma.project.upsert()` to create/update the test project record:
      ```
      id: "00000000-0000-0000-0000-000000000003"
      name: "test-project"
      repo_url: "https://github.com/your-org/your-test-repo"
      default_branch: "main"
      concurrency_limit: 3
      ```
    - Use `where` clause on unique fields for upsert (id for both)
    - Add `console.log` for seed completion message
    - Add `prisma.$disconnect()` in a finally block
  - Verify the seed command in `package.json` is correct: `"prisma": { "seed": "tsx prisma/seed.ts" }`
  - Run `pnpm db:seed` to execute the seed
  - Run `pnpm db:seed` a SECOND time to verify idempotency

  **Must NOT do**:
  - Do NOT use `prisma.create()` — use `prisma.upsert()` for idempotency
  - Do NOT seed more than 1 project + 1 agent_version record
  - Do NOT seed data in any other table (archetypes, departments, tasks, etc.)
  - Do NOT use `prisma.$executeRawUnsafe` — use the typed Prisma client

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation (seed.ts) with straightforward upsert calls
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: Tasks 7, 8 (tests and verification need seed data)
  - **Blocked By**: Task 5 (tables must exist before seeding)

  **References**:

  **Pattern References**:
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:108-110` — Phase 1 seed data: "Insert a test projects record (pointing to your test GitHub repo)", "Insert a test agent_versions record (initial version)"
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1749-1753` — tenant_id default: `00000000-0000-0000-0000-000000000001`
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1900` — §15: "PrismaClient Singleton: Use a single shared PrismaClient instance"

  **External References**:
  - Prisma `upsert()`: Atomic create-or-update. Uses `where` (unique field), `create` (full data), `update` (data to update if exists)
  - Prisma 6.x seed config: `"prisma": { "seed": "tsx prisma/seed.ts" }` in package.json
  - `tsx`: TypeScript executor that handles ESM imports correctly

  **WHY Each Reference Matters**:
  - Phase 1 doc specifies exactly which records to seed (1 project, 1 agent_version) — no more, no less
  - tenant_id default must match the constant UUID used across all tables
  - PrismaClient singleton prevents connection pool exhaustion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed creates project and agent_version records
    Tool: Bash
    Preconditions: Migrations applied, tables exist
    Steps:
      1. Run `pnpm db:seed 2>&1; echo "EXIT:$?"`
      2. Run `pnpm prisma db execute --stdin <<< "SELECT name, repo_url, default_branch FROM projects;" 2>&1`
      3. Run `pnpm prisma db execute --stdin <<< "SELECT model_id, is_active, changelog_note FROM agent_versions;" 2>&1`
    Expected Result: EXIT:0, project record with name "test-project", agent_version with model_id "anthropic/claude-sonnet-4"
    Failure Indicators: Non-zero exit, missing records
    Evidence: .sisyphus/evidence/task-6-seed-data.txt

  Scenario: Seed is idempotent (running twice produces same result)
    Tool: Bash
    Preconditions: Seed already ran once
    Steps:
      1. Run `pnpm db:seed 2>&1; echo "EXIT:$?"`
      2. Run `pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM projects;" 2>&1`
      3. Run `pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM agent_versions;" 2>&1`
    Expected Result: EXIT:0, projects count = 1, agent_versions count = 1 (not 2)
    Failure Indicators: Non-zero exit, counts > 1 (duplicate records)
    Evidence: .sisyphus/evidence/task-6-seed-idempotent.txt

  Scenario: Seed data has correct tenant_id
    Tool: Bash
    Preconditions: Seed executed
    Steps:
      1. Run `pnpm prisma db execute --stdin <<< "SELECT tenant_id FROM projects WHERE name = 'test-project';" 2>&1`
    Expected Result: tenant_id = "00000000-0000-0000-0000-000000000001"
    Failure Indicators: Different tenant_id or NULL
    Evidence: .sisyphus/evidence/task-6-tenant-id.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-seed-data.txt
  - [ ] task-6-seed-idempotent.txt
  - [ ] task-6-tenant-id.txt

  **Commit**: YES (group 6)
  - Message: `db: add idempotent seed data for project and agent_version records`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm db:seed && pnpm db:seed`

- [ ] 7. Vitest setup and automated schema constraint tests

  **What to do**:
  - Create `vitest.config.ts`:
    - Set `test.pool` to `'forks'` with `singleFork: true` (sequential DB test execution to prevent race conditions)
    - Set `test.include` to `['tests/**/*.test.ts']`
    - Set `test.testTimeout` to `30000` (30s — DB operations can be slow)
  - Create `tests/setup.ts`:
    - Import `PrismaClient` from `@prisma/client`
    - Export a shared PrismaClient singleton for all tests
    - Export a `cleanupTestData()` helper that truncates test-inserted rows (NOT seed data)
    - Use `beforeEach` / `afterEach` hooks for test isolation
  - Create `tests/schema.test.ts` with the following test groups:

    **Test Group: "Table existence"**:
    - Test: "all 16 tables exist in public schema"
      - Query `information_schema.tables WHERE table_schema = 'public'`
      - Assert count >= 16
      - Assert specific table names: tasks, executions, deliverables, validation_runs, projects, feedback, task_status_log, departments, archetypes, knowledge_bases, risk_models, cross_dept_triggers, agent_versions, clarifications, reviews, audit_log

    **Test Group: "CHECK constraints"**:
    - Test: "rejects invalid task status"
      - Use `prisma.$executeRaw` to INSERT with status = 'InvalidStatus'
      - Assert it throws with message containing 'tasks_status_check'
    - Test: "accepts all 13 valid task statuses"
      - Loop through all valid statuses, INSERT and DELETE each
      - Assert no errors thrown
    - Test: "rejects invalid actor in task_status_log"
      - Insert a valid task first, then INSERT task_status_log with actor = 'robot'
      - Assert it throws with message containing 'task_status_log_actor_check'
    - Test: "accepts all 5 valid actors including 'machine'"
      - Loop through all valid actors (gateway, lifecycle_fn, watchdog, machine, manual)
      - Insert a status log entry for each, then clean up
      - Assert no errors thrown

    **Test Group: "UNIQUE constraints"**:
    - Test: "rejects duplicate tasks with same external_id, source_system, tenant_id"
      - Insert a task with (external_id='TEST-DUP', source_system='jira', tenant_id=default)
      - Attempt second insert with same values
      - Assert it throws with message containing 'unique' or 'Unique'
    - Test: "allows tasks with different external_id but same source_system"
      - Insert task with external_id='TEST-001'
      - Insert task with external_id='TEST-002'
      - Assert both succeed

    **Test Group: "Seed data verification"**:
    - Test: "project seed data is present and correct"
      - Query `prisma.project.findFirst()` where name = 'test-project'
      - Assert record exists with correct repo_url, default_branch
    - Test: "agent_version seed data is present and correct"
      - Query `prisma.agentVersion.findFirst()` where is_active = true
      - Assert record exists with correct model_id
    - Test: "default tenant_id is applied"
      - Query project, assert tenant_id = '00000000-0000-0000-0000-000000000001'

    **Test Group: "Default values"**:
    - Test: "tasks.dispatch_attempts defaults to 0"
      - Insert a task with minimal fields
      - Assert dispatch_attempts = 0
    - Test: "tasks.status defaults to 'Received'"
      - Insert a task without specifying status
      - Assert status = 'Received'

  - Clean up all test-inserted data in `afterEach` blocks (leave seed data intact)
  - Run `pnpm test --run` to execute all tests

  **Must NOT do**:
  - Do NOT delete seed data in test cleanup (only test-inserted rows)
  - Do NOT add coverage configuration or thresholds
  - Do NOT add tests for application logic (no application logic exists yet)
  - Do NOT use `prisma.$executeRawUnsafe` — use `prisma.$executeRaw` with tagged template literals for parameterized queries

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files with complex DB assertions, requires understanding of Prisma error types and constraint violation messages
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 8)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Task 6 (tests query seed data)

  **References**:

  **Pattern References**:
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:114-142` — Phase 1 verification criteria: exact SQL commands and expected outputs that tests should mirror
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1681-1683` — CHECK constraint valid values (tests verify these exact values)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1693` — UNIQUE constraint definition (tests verify this exact constraint)

  **External References**:
  - Vitest `pool: 'forks'` with `singleFork: true`: prevents parallel test execution against shared DB
  - Prisma `$executeRaw`: tagged template for parameterized raw SQL (safe from SQL injection)
  - Prisma error handling: constraint violations throw `PrismaClientKnownRequestError` with `code: 'P2002'` (unique) or raw SQL errors for CHECK constraints

  **WHY Each Reference Matters**:
  - Phase 1 verification criteria define EXACTLY what must be testable — tests automate these checks
  - §13 CHECK constraint values are the test expectations — tests must use the exact same values
  - UNIQUE constraint test proves idempotency works before Phase 2 builds on it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All Vitest tests pass
    Tool: Bash
    Preconditions: Vitest configured, seed data present, Supabase running
    Steps:
      1. Run `pnpm test --run 2>&1`
    Expected Result: All tests pass (0 failed), exit code 0
    Failure Indicators: Any test failure, non-zero exit
    Evidence: .sisyphus/evidence/task-7-vitest-results.txt

  Scenario: Tests properly clean up after themselves
    Tool: Bash
    Preconditions: Tests completed
    Steps:
      1. Run `pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM tasks;" 2>&1`
      2. Run `pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM projects;" 2>&1`
    Expected Result: tasks count = 0 (test data cleaned up), projects count = 1 (seed data preserved)
    Failure Indicators: tasks count > 0 (leaked test data), projects count != 1 (seed data deleted or duplicated)
    Evidence: .sisyphus/evidence/task-7-test-cleanup.txt

  Scenario: No test relies on execution order
    Tool: Bash
    Preconditions: Tests pass in normal order
    Steps:
      1. Run `pnpm test --run 2>&1` (first run)
      2. Run `pnpm test --run 2>&1` (second run — same result expected)
    Expected Result: Both runs pass with identical results
    Failure Indicators: Second run fails (state leak from first run)
    Evidence: .sisyphus/evidence/task-7-test-idempotent.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-vitest-results.txt
  - [ ] task-7-test-cleanup.txt
  - [ ] task-7-test-idempotent.txt

  **Commit**: YES (group 7)
  - Message: `test: add Vitest schema constraint and seed verification tests`
  - Files: `vitest.config.ts`, `tests/setup.ts`, `tests/schema.test.ts`
  - Pre-commit: `pnpm test --run`

- [ ] 8. Manual verification playbook — step-by-step commands for user

  **What to do**:
  - Create `scripts/verify-phase1.sh` — a shell script the user runs to verify all Phase 1 criteria
  - The script must execute ALL 7 verification criteria from the Phase 1 doc (lines 114-142) plus additional checks
  - Script structure:
    ```bash
    #!/bin/bash
    set -e
    PASS=0
    FAIL=0

    echo "=== Phase 1: Foundation Verification ==="
    echo ""

    # Check 1: TypeScript compiles
    echo "--- Check 1: TypeScript compilation ---"
    pnpm tsc --noEmit && echo "✓ PASS: TypeScript compiles clean" && ((PASS++)) || { echo "✗ FAIL: TypeScript compilation errors"; ((FAIL++)); }

    # Check 2: Supabase is running
    echo "--- Check 2: Local Supabase ---"
    supabase status > /dev/null 2>&1 && echo "✓ PASS: Supabase is running" && ((PASS++)) || { echo "✗ FAIL: Supabase is not running"; ((FAIL++)); }

    # Check 3: Migrations applied
    echo "--- Check 3: Migrations ---"
    # (prisma migrate dev should report all applied)

    # Check 4: All 16 tables exist
    echo "--- Check 4: Table count ---"
    TABLE_COUNT=$(pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>&1 | grep -oP '\d+' | tail -1)
    # Assert >= 16

    # Check 5: Seed data present
    echo "--- Check 5: Seed data ---"
    # Query projects and agent_versions

    # Check 6: CHECK constraint enforced
    echo "--- Check 6: Constraints ---"
    # Attempt invalid insert, verify failure

    # Check 7: Prisma client generates
    echo "--- Check 7: Prisma generate ---"
    pnpm prisma generate

    # Check 8: ESLint passes
    echo "--- Check 8: ESLint ---"
    pnpm lint

    # Check 9: Vitest tests pass
    echo "--- Check 9: Tests ---"
    pnpm test --run

    # Check 10: Seed idempotency
    echo "--- Check 10: Seed idempotency ---"
    pnpm db:seed && pnpm db:seed

    # Summary
    echo ""
    echo "=== RESULTS: $PASS passed, $FAIL failed ==="
    ```
  - Make the script executable: `chmod +x scripts/verify-phase1.sh`
  - Each check must:
    - Print a clear header
    - Run the exact command
    - Print PASS or FAIL with explanation
    - Track pass/fail count
  - Include ALL checks from the Phase 1 verification criteria document
  - Add 3 bonus checks: ESLint, Vitest, seed idempotency
  - Print a summary at the end with total pass/fail count
  - Exit with code 1 if any check fails
  - Script output should be user-friendly and self-documenting (a user reading the output understands what was tested)

  **Must NOT do**:
  - Do NOT skip any of the 7 original verification criteria from the Phase 1 doc
  - Do NOT require any manual steps — the script is fully automated
  - Do NOT hardcode credentials — read from `.env` or use Supabase CLI defaults

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single shell script with known commands from the Phase 1 doc
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 7)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Task 6 (verification needs seed data)

  **References**:

  **Pattern References**:
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:114-142` — **THE source of truth for verification commands**. Every command in this section must appear in the script. Exact expected outputs documented here.
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:146-153` — "System Snapshot After Phase 1": what the local environment should look like

  **WHY Each Reference Matters**:
  - Phase 1 verification criteria are the CONTRACTUAL definition of "done" — the playbook script must exercise each one
  - System snapshot describes the expected state — the script's summary should match this description

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verification script runs end-to-end
    Tool: Bash
    Preconditions: All previous tasks complete, Supabase running, seed data present
    Steps:
      1. Run `bash scripts/verify-phase1.sh 2>&1; echo "EXIT:$?"`
    Expected Result: All checks pass, EXIT:0, summary shows 0 failures
    Failure Indicators: Any check fails, non-zero exit, missing checks
    Evidence: .sisyphus/evidence/task-8-verify-playbook.txt

  Scenario: Script is executable
    Tool: Bash
    Preconditions: Script created
    Steps:
      1. Run `test -x scripts/verify-phase1.sh && echo "EXECUTABLE" || echo "NOT_EXECUTABLE"`
    Expected Result: EXECUTABLE
    Failure Indicators: NOT_EXECUTABLE
    Evidence: .sisyphus/evidence/task-8-executable.txt

  Scenario: Script covers all 7 Phase 1 verification criteria
    Tool: Bash
    Preconditions: Script created
    Steps:
      1. Run `grep -c "Check" scripts/verify-phase1.sh`
    Expected Result: Count >= 10 (7 original + 3 bonus checks)
    Failure Indicators: Count < 7
    Evidence: .sisyphus/evidence/task-8-check-coverage.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-verify-playbook.txt
  - [ ] task-8-executable.txt
  - [ ] task-8-check-coverage.txt

  **Commit**: YES (group 8)
  - Message: `chore: add Phase 1 manual verification playbook`
  - Files: `scripts/verify-phase1.sh`
  - Pre-commit: `bash scripts/verify-phase1.sh`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test --run`. Review all created files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic variable names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: run `scripts/verify-phase1.sh` end-to-end. Test edge cases: double seed run, invalid constraint inserts. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual files created. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance — ensure no runtime code, no src/ file content, no extra dependencies. Flag unaccounted files.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| # | Message | Files | Gate |
|---|---------|-------|------|
| 1 | `scaffold: init pnpm project with TypeScript and dependencies` | package.json, pnpm-lock.yaml, tsconfig.json | `pnpm tsc --noEmit` |
| 2 | `scaffold: add ESLint flat config, Prettier, directory structure` | eslint.config.mjs, .prettierrc, .gitignore, src/*/.gitkeep | `pnpm lint` |
| 3 | `infra: init local Supabase and create env files` | supabase/config.toml, .env, .env.example | `supabase status` |
| 4 | `db: define Prisma schema with all 16 table models` | prisma/schema.prisma | `pnpm prisma validate` |
| 5 | `db: apply initial migration and add CHECK constraints` | prisma/migrations/*/migration.sql | `pnpm prisma migrate dev` |
| 6 | `db: add idempotent seed data for projects and agent_versions` | prisma/seed.ts | `pnpm db:seed && pnpm db:seed` |
| 7 | `test: add Vitest schema constraint and seed verification tests` | vitest.config.ts, tests/schema.test.ts, tests/setup.ts | `pnpm test --run` |
| 8 | `chore: add Phase 1 manual verification playbook` | scripts/verify-phase1.sh | `bash scripts/verify-phase1.sh` |

---

## Success Criteria

### Verification Commands
```bash
# TypeScript compiles
pnpm tsc --noEmit                    # Expected: exit 0

# ESLint passes
pnpm lint                            # Expected: exit 0

# Supabase running
supabase status                      # Expected: shows running services

# Migrations applied
pnpm prisma migrate dev              # Expected: "All migrations have been applied"

# 16 tables exist
pnpm prisma db execute --stdin <<< "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
                                     # Expected: count >= 16

# Seed data present
pnpm prisma db execute --stdin <<< "SELECT name, repo_url FROM projects;"
                                     # Expected: 1 row with test project

# CHECK constraint works
pnpm prisma db execute --stdin <<< "INSERT INTO tasks (id, status, tenant_id) VALUES (gen_random_uuid(), 'InvalidStatus', '00000000-0000-0000-0000-000000000001');"
                                     # Expected: CHECK constraint violation error

# Prisma client generates
pnpm prisma generate                 # Expected: "Generated Prisma Client"

# Tests pass
pnpm test --run                      # Expected: all tests pass

# Seed is idempotent
pnpm db:seed && pnpm db:seed         # Expected: exit 0 both times
```

### Final Checklist
- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] All 7 verification criteria from Phase 1 doc pass
- [ ] All Vitest tests pass
- [ ] Manual verification playbook runs cleanly
