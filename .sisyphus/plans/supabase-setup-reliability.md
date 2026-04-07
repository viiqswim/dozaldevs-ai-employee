# Fix Supabase Setup Reliability Across All Repos

## TL;DR

> **Quick Summary**: Fix 7 bugs in the Supabase Docker Compose setup scripts across 4 repos so `pnpm supabase:start` and `pnpm supabase:reset` work reliably from scratch every time.
>
> **Deliverables**:
>
> - Reliable setup scripts in all 4 repos (no transient failures)
> - Missing `zx` dependency installed in nexus-stack and fetched-pets
> - P1001 root cause fixed (localhost vs 127.0.0.1 in DATABASE_URL)
> - Migration retry logic in all setup scripts
> - passcodeName schema drift fixed in vlre-hub
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: T1 (vlre-hub migration) → T5 (vlre-hub full reset verification)

---

## Context

### Original Request

User hit cascading failures trying to run `pnpm supabase:start` in vlre-hub. After investigation, 7 distinct bugs were found across all 4 repos sharing the same Docker Compose Supabase infrastructure.

### Interview Summary

**Key Discussions**:

- User wants ALL repos fixed, not just vlre-hub
- User chose to create a new Prisma migration for the passcodeName drift (not remove the field)
- Old vlre-hub data in nexus-stack volume was seed data only — not worth migrating

**Research Findings**:

- P1001 root cause: Prisma schema-engine (Rust binary) fails with IPv6-mapped IPv4 addresses on macOS. `127.0.0.1` → P1001. `localhost` → works. ai-employee uses `localhost` (works), vlre-hub/nexus-stack use `127.0.0.1` (fails).
- Analytics (Logflare) consistently takes 2-3 min to start. Initial `docker compose up -d` exits non-zero → zx throws → retry loop never reached.
- `.env.example` files correctly use `localhost` but actual `.env` files diverged.

### Metis Review

**Identified Gaps** (addressed):

- `db push` fallback would break `_prisma_migrations` state → removed from plan
- passcodeName column confirmed NOT in current DB → safe `ADD COLUMN` migration
- nexus-stack confirmed to have setup-db.ts → included in scope
- Seed connectivity pre-check scoped as separate task (not bundled)

---

## Work Objectives

### Core Objective

Make `pnpm supabase:start` and `pnpm supabase:reset` work reliably from a clean state in all 4 repos, with zero transient failures.

### Concrete Deliverables

- Updated `scripts/setup.ts` (ai-employee) and `scripts/setup-db.ts` (3 others)
- New Prisma migration in vlre-hub for passcodeName
- Updated `.env` files in vlre-hub and nexus-stack (localhost, not 127.0.0.1)
- Updated `.env.example` files where needed (127.0.0.1 → localhost consistency)

### Definition of Done

- [ ] `pnpm supabase:reset` completes exit 0 from scratch in all 4 repos
- [ ] `pnpm supabase:start` is idempotent (exit 0 when already running)
- [ ] vlre-hub `pnpm db:seed` completes without P1001 errors

### Must Have

- `.nothrow()` on all docker compose up -d calls in all 4 repos
- `localhost` instead of `127.0.0.1` in all DATABASE_URL values
- Migration retry loop (3 attempts, 5s delay) in all 4 setup scripts
- passcodeName migration in vlre-hub
- Seed connectivity pre-check in vlre-hub

### Must NOT Have (Guardrails)

- DO NOT use `db push` as fallback for `migrate deploy` (breaks \_prisma_migrations)
- DO NOT modify docker-compose.yml files — all fixes are TypeScript only
- DO NOT change retry loop timing (8×30s for compose, only add migration retry)
- DO NOT upgrade zx versions — only install if missing
- DO NOT rename any package.json scripts
- DO NOT modify Prisma migration files that already exist

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest in all repos)
- **Automated tests**: NO — these are infrastructure scripts, not app code
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Setup scripts**: Use Bash — run the script, check exit code, verify DB state
- **Migrations**: Use Bash — run migrate deploy, check \_prisma_migrations table
- **Seed**: Use Bash — run seed, check row counts

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - independent per-repo fixes):
├── Task 1: vlre-hub — Create passcodeName migration [quick]
├── Task 2: nexus-stack — Install zx dependency [quick]
├── Task 3: fetched-pets — Install zx dependency [quick]
└── Task 4: ALL repos — Fix DATABASE_URL to use localhost [quick]

Wave 2 (After Wave 1 - setup script fixes, all repos parallel):
├── Task 5: ai-employee — Fix setup.ts (.nothrow + migration retry) [unspecified-high]
├── Task 6: nexus-stack — Fix setup-db.ts (.nothrow + migration retry) [unspecified-high]
├── Task 7: vlre-hub — Fix setup-db.ts (migration retry + seed pre-check) [unspecified-high]
└── Task 8: fetched-pets — Fix setup-db.ts (.nothrow + migration retry) [unspecified-high]

Wave 3 (After Wave 2 - full E2E verification per repo):
├── Task 9: ALL repos — Full supabase:reset from scratch [deep]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
└── Task F2: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | -          | T7, T9 | 1    |
| T2   | -          | T6, T9 | 1    |
| T3   | -          | T8, T9 | 1    |
| T4   | -          | T5-T9  | 1    |
| T5   | T4         | T9     | 2    |
| T6   | T2, T4     | T9     | 2    |
| T7   | T1, T4     | T9     | 2    |
| T8   | T3, T4     | T9     | 2    |
| T9   | T5-T8      | F1, F2 | 3    |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks → `quick` (dependency installs, env fixes, migration creation)
- **Wave 2**: 4 tasks → `unspecified-high` (setup script modifications with retry logic)
- **Wave 3**: 1 task → `deep` (full E2E verification across all repos)
- **FINAL**: 2 tasks → `oracle` + `deep`

---

## TODOs

- [x] 1. vlre-hub — Create passcodeName migration

  **What to do**:
  - Run `prisma migrate dev --name add_property_passcode_name` from `packages/database/` in vlre-hub to create the migration SQL for the `passcodeName` field on `Property` model
  - The field already exists in `packages/database/prisma/schema/property.prisma` line 66: `passcodeName String?`
  - The migration should produce: `ALTER TABLE "properties" ADD COLUMN "passcode_name" TEXT;`
  - Verify migration was created in `packages/database/prisma/schema/migrations/`
  - Run `prisma migrate deploy` to confirm it applies cleanly
  - Run `prisma migrate deploy` a SECOND time to confirm idempotency (should say "already applied")

  **Must NOT do**:
  - Do NOT modify the property.prisma schema — the field already exists
  - Do NOT modify any existing migration files
  - Do NOT run `db push` — use `migrate dev` to create proper migration

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 7, 9
  - **Blocked By**: None

  **References**:
  - `packages/database/prisma/schema/property.prisma:66` — the passcodeName field definition
  - `packages/database/prisma/schema/migrations/` — existing migrations directory (5 migrations)
  - Current DB has no `passcode_name` column (confirmed via `information_schema.columns` query)

  **Acceptance Criteria**:
  - [ ] New migration directory created in `packages/database/prisma/schema/migrations/`
  - [ ] Migration SQL contains `ALTER TABLE "properties" ADD COLUMN "passcode_name"` (or equivalent)
  - [ ] `prisma migrate deploy` succeeds (exit 0)
  - [ ] `prisma migrate deploy` second run succeeds (exit 0, "already applied")
  - [ ] `SELECT column_name FROM information_schema.columns WHERE table_name='properties' AND column_name='passcode_name'` returns 1 row

  **QA Scenarios**:

  ```
  Scenario: Migration applies cleanly on fresh DB
    Tool: Bash
    Preconditions: vlre-hub Supabase running, vlre_hub DB exists with current migrations applied
    Steps:
      1. cd /Users/victordozal/repos/real-estate/vlre-hub
      2. DATABASE_URL="postgresql://postgres:postgres@localhost:56322/vlre_hub" pnpm --filter @repo/database exec prisma migrate dev --name add_property_passcode_name
      3. DATABASE_URL="postgresql://postgres:postgres@localhost:56322/vlre_hub" pnpm --filter @repo/database exec prisma migrate deploy
      4. docker exec supabase-vlre-hub-db-1 psql -U postgres -d vlre_hub -c "SELECT column_name FROM information_schema.columns WHERE table_name='properties' AND column_name='passcode_name';"
    Expected Result: Migration created, deploy succeeds, column exists
    Evidence: .sisyphus/evidence/task-1-migration-apply.txt

  Scenario: Migration is idempotent
    Tool: Bash
    Preconditions: Migration already applied
    Steps:
      1. DATABASE_URL="postgresql://postgres:postgres@localhost:56322/vlre_hub" pnpm --filter @repo/database exec prisma migrate deploy
    Expected Result: Exit 0, "All migrations have been applied" or "Already in sync"
    Evidence: .sisyphus/evidence/task-1-migration-idempotent.txt
  ```

  **Commit**: YES
  - Message: `fix(db): add passcodeName column migration for Property model`
  - Files: `packages/database/prisma/schema/migrations/*/migration.sql`
  - Pre-commit: `prisma migrate deploy`

- [x] 2. nexus-stack — Install zx dependency

  **What to do**:
  - Run `pnpm add -Dw zx` in nexus-stack root to install zx as workspace devDependency
  - Verify: `node -e "import('zx').then(() => console.log('ok'))"` succeeds

  **Must NOT do**:
  - Do NOT upgrade zx if already present — only install if missing
  - Do NOT change any other dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 6, 9
  - **Blocked By**: None

  **References**:
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/scripts/setup-db.ts:12` — imports `import { $ } from "zx"`
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/package.json` — missing zx in devDependencies

  **Acceptance Criteria**:
  - [ ] `grep '"zx"' package.json` returns a match in devDependencies
  - [ ] `node -e "import('zx').then(() => console.log('ok'))"` prints "ok"

  **QA Scenarios**:

  ```
  Scenario: zx is importable
    Tool: Bash
    Preconditions: pnpm add -Dw zx completed
    Steps:
      1. cd /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack
      2. node -e "import('zx').then(() => console.log('zx ok'))"
    Expected Result: prints "zx ok"
    Evidence: .sisyphus/evidence/task-2-zx-importable.txt
  ```

  **Commit**: YES
  - Message: `fix(infra): install missing zx dependency`
  - Files: `package.json`, `pnpm-lock.yaml`

- [x] 3. fetched-pets — Install zx dependency

  **What to do**:
  - Run `pnpm add -Dw zx` in fetched-pets root
  - Verify: `node -e "import('zx').then(() => console.log('ok'))"` succeeds

  **Must NOT do**:
  - Do NOT upgrade zx if already present
  - Do NOT change any other dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: None

  **References**:
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/scripts/setup-db.ts:12` — imports `import { $ } from "zx"`
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/package.json` — missing zx

  **Acceptance Criteria**:
  - [ ] `grep '"zx"' package.json` returns a match in devDependencies
  - [ ] `node -e "import('zx').then(() => console.log('ok'))"` prints "ok"

  **QA Scenarios**:

  ```
  Scenario: zx is importable
    Tool: Bash
    Preconditions: pnpm add -Dw zx completed
    Steps:
      1. cd /Users/victordozal/repos/fetched-pets/pet-adoption-app
      2. node -e "import('zx').then(() => console.log('zx ok'))"
    Expected Result: prints "zx ok"
    Evidence: .sisyphus/evidence/task-3-zx-importable.txt
  ```

  **Commit**: YES
  - Message: `fix(infra): install missing zx dependency`
  - Files: `package.json`, `pnpm-lock.yaml`

- [x] 4. ALL repos — Fix DATABASE_URL to use `localhost` instead of `127.0.0.1`

  **What to do**:
  - In vlre-hub `.env`: change `127.0.0.1` → `localhost` in DATABASE_URL
  - In nexus-stack `.env`: change `127.0.0.1` → `localhost` in DATABASE_URL
  - Verify `.env.example` files in ALL 4 repos already use `localhost` (they should — only update if any use `127.0.0.1`)
  - In each repo's setup-db.ts/setup.ts: add a check that warns if `.env` DATABASE_URL contains `127.0.0.1` instead of `localhost` (print a warning, don't fail)

  **Why**: Prisma's schema-engine binary (Rust) has an IPv6-mapped IPv4 bug on macOS. `127.0.0.1` resolves to `::ffff:127.0.0.1` which the schema-engine can't connect to. `localhost` resolves to `::1` or `127.0.0.1` which works.

  **Must NOT do**:
  - Do NOT change DATABASE_URL values in docker/.env files (those are for Docker internal networking)
  - Do NOT change `.env` files in git (they're gitignored) — only change `.env.example` if needed

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5, 6, 7, 8, 9
  - **Blocked By**: None

  **References**:
  - vlre-hub `.env` has `127.0.0.1:56322` (broken), `.env.example` has `localhost:56322` (correct)
  - nexus-stack `.env` has `127.0.0.1:55322` (broken), `.env.example` has `localhost:55322` (correct)
  - ai-employee `.env` uses `localhost:54322` (correct)
  - fetched-pets `.env` missing (no env file found) — `.env.example` uses `localhost:57322` (correct)
  - P1001 investigation confirmed: `localhost` → works, `127.0.0.1` → P1001 on schema-engine

  **Acceptance Criteria**:
  - [ ] vlre-hub `.env` DATABASE_URL uses `localhost` not `127.0.0.1`
  - [ ] nexus-stack `.env` DATABASE_URL uses `localhost` not `127.0.0.1`
  - [ ] All 4 `.env.example` files use `localhost` (verified, no changes needed if already correct)
  - [ ] Each setup script prints a warning if `.env` contains `127.0.0.1` in DATABASE_URL

  **QA Scenarios**:

  ```
  Scenario: Prisma migrate deploy works after localhost fix
    Tool: Bash
    Preconditions: vlre-hub .env updated to use localhost
    Steps:
      1. cd /Users/victordozal/repos/real-estate/vlre-hub
      2. grep "DATABASE_URL" .env | head -1
      3. pnpm db:migrate
    Expected Result: grep shows "localhost:56322", migrate deploy succeeds (exit 0)
    Evidence: .sisyphus/evidence/task-4-localhost-fix.txt

  Scenario: Warning displayed for 127.0.0.1
    Tool: Bash
    Preconditions: Temporarily set .env to use 127.0.0.1
    Steps:
      1. Verify setup script code contains the 127.0.0.1 check
    Expected Result: Warning check exists in setup script source
    Evidence: .sisyphus/evidence/task-4-warning-check.txt
  ```

  **Commit**: YES (per repo)
  - Message: `fix(infra): use localhost in DATABASE_URL for Prisma compatibility`
  - Files: `.env.example` (if changed), `scripts/setup*.ts` (warning check)
  - Note: `.env` is gitignored — commit only tracks `.env.example` and script changes

- [x] 5. ai-employee — Fix setup.ts (`.nothrow()` + migration retry)

  **What to do**:
  - In `scripts/setup.ts`, add `.nothrow()` to the initial `docker compose up -d` call (same pattern as vlre-hub fix)
  - Add migration retry loop: wrap the `prisma migrate deploy` call in a retry (3 attempts, 5s delay between attempts). On each attempt, first test connectivity with a simple `docker exec supabase-ai-employee-db-1 psql -U postgres -c "SELECT 1;"` before running migrate.
  - Add the `127.0.0.1` warning check from Task 4

  **Must NOT do**:
  - Do NOT change the compose retry loop timing (keep 8×30s)
  - Do NOT add `db push` fallback
  - Do NOT modify docker-compose.yml

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 4

  **References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/setup.ts` — current setup script
  - `/Users/victordozal/repos/real-estate/vlre-hub/scripts/setup-db.ts` — reference for `.nothrow()` pattern (already implemented)
  - ai-employee uses `DATABASE_URL` with inline env vars in the migrate command

  **Acceptance Criteria**:
  - [ ] `grep "nothrow" scripts/setup.ts` returns 2+ matches (initial up -d + retry up -d)
  - [ ] Migration step has retry logic (3 attempts visible in code)
  - [ ] Script contains `127.0.0.1` warning check

  **QA Scenarios**:

  ```
  Scenario: Setup completes when services already running
    Tool: Bash
    Preconditions: ai-employee Supabase already running
    Steps:
      1. cd /Users/victordozal/repos/dozal-devs/ai-employee
      2. pnpm setup
    Expected Result: Exit 0, "already running" or "already applied"
    Evidence: .sisyphus/evidence/task-5-idempotent.txt
  ```

  **Commit**: YES
  - Message: `fix(infra): add .nothrow() and migration retry to setup script`
  - Files: `scripts/setup.ts`

- [x] 6. nexus-stack — Fix setup-db.ts (`.nothrow()` + migration retry)

  **What to do**:
  - Same changes as Task 5 but in nexus-stack's `scripts/setup-db.ts`
  - Add `.nothrow()` to initial docker compose up -d call
  - Add migration retry loop (3 attempts, 5s delay, connectivity pre-check)
  - Add `127.0.0.1` warning check

  **Must NOT do**:
  - Same guardrails as Task 5

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 2, 4

  **References**:
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/scripts/setup-db.ts`
  - Same `.nothrow()` pattern as vlre-hub reference

  **Acceptance Criteria**:
  - [ ] `grep "nothrow" scripts/setup-db.ts` returns 2+ matches
  - [ ] Migration step has retry logic
  - [ ] Script contains `127.0.0.1` warning check

  **QA Scenarios**:

  ```
  Scenario: Setup completes when services already running
    Tool: Bash
    Preconditions: nexus-stack Supabase already running
    Steps:
      1. cd /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack
      2. pnpm supabase:start
    Expected Result: Exit 0
    Evidence: .sisyphus/evidence/task-6-idempotent.txt
  ```

  **Commit**: YES
  - Message: `fix(infra): add .nothrow() and migration retry to setup script`
  - Files: `scripts/setup-db.ts`

- [x] 7. vlre-hub — Fix setup-db.ts (migration retry + seed pre-check)

  **What to do**:
  - `.nothrow()` already applied (from earlier fix) — verify it's still present
  - Add migration retry loop (3 attempts, 5s delay, connectivity pre-check) — same pattern as Tasks 5/6
  - Add `127.0.0.1` warning check
  - In `packages/database/prisma/seed.ts`: add a connectivity pre-check at the top of `main()` — try `prisma.$queryRaw\`SELECT 1\`` with 3 retries (5s delay) before running any seed sections. This prevents transient P1001 from failing the first few seed sections.

  **Must NOT do**:
  - Do NOT change the compose retry loop timing
  - Do NOT add `db push` fallback
  - Do NOT modify the seed data or seed logic — only add connectivity pre-check

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 4

  **References**:
  - `/Users/victordozal/repos/real-estate/vlre-hub/scripts/setup-db.ts` — already has `.nothrow()`
  - `/Users/victordozal/repos/real-estate/vlre-hub/packages/database/prisma/seed.ts` — seed script to add pre-check

  **Acceptance Criteria**:
  - [ ] `grep "nothrow" scripts/setup-db.ts` returns 2+ matches (verify existing)
  - [ ] Migration step has retry logic
  - [ ] `seed.ts` has connectivity pre-check (SELECT 1 with retry)
  - [ ] `pnpm db:seed` completes without P1001 errors

  **QA Scenarios**:

  ```
  Scenario: Seed completes without transient failures
    Tool: Bash
    Preconditions: vlre-hub Supabase running, migrations applied
    Steps:
      1. cd /Users/victordozal/repos/real-estate/vlre-hub
      2. pnpm db:seed
    Expected Result: Exit 0, all sections seeded (preference definitions, subscription plans, properties, etc.)
    Failure Indicators: Any "Can't reach database server" in output
    Evidence: .sisyphus/evidence/task-7-seed-complete.txt
  ```

  **Commit**: YES (2 commits)
  - Message 1: `fix(infra): add migration retry to setup script`
  - Files 1: `scripts/setup-db.ts`
  - Message 2: `fix(db): add connectivity pre-check to seed script`
  - Files 2: `packages/database/prisma/seed.ts`

- [x] 8. fetched-pets — Fix setup-db.ts (`.nothrow()` + migration retry)

  **What to do**:
  - Same changes as Task 5 but in fetched-pets' `scripts/setup-db.ts`
  - Add `.nothrow()` to initial docker compose up -d call
  - Add migration retry loop (3 attempts, 5s delay, connectivity pre-check)
  - Add `127.0.0.1` warning check

  **Must NOT do**:
  - Same guardrails as Task 5

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/scripts/setup-db.ts`

  **Acceptance Criteria**:
  - [ ] `grep "nothrow" scripts/setup-db.ts` returns 2+ matches
  - [ ] Migration step has retry logic
  - [ ] Script contains `127.0.0.1` warning check

  **QA Scenarios**:

  ```
  Scenario: Setup completes when services already running
    Tool: Bash
    Preconditions: fetched-pets Supabase already running
    Steps:
      1. cd /Users/victordozal/repos/fetched-pets/pet-adoption-app
      2. pnpm supabase:start
    Expected Result: Exit 0
    Evidence: .sisyphus/evidence/task-8-idempotent.txt
  ```

  **Commit**: YES
  - Message: `fix(infra): add .nothrow() and migration retry to setup script`
  - Files: `scripts/setup-db.ts`

- [x] 9. ALL repos — Full `supabase:reset` from scratch verification

  **What to do**:
  - For EACH of the 4 repos, run a complete reset-from-scratch cycle:
    1. `docker compose -f docker/docker-compose.yml down -v` (nuke volumes)
    2. `pnpm supabase:start` (or `pnpm setup` for ai-employee)
    3. Verify: all migrations applied, DB has correct tables
    4. For vlre-hub: also run `pnpm db:seed` and verify all sections complete
    5. Run setup command AGAIN to verify idempotency
  - Capture evidence for each repo

  **Must NOT do**:
  - Do NOT modify any files — this is verification only
  - Do NOT skip any repo

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential per repo (to avoid port conflicts)
  - **Blocks**: F1, F2
  - **Blocked By**: Tasks 5, 6, 7, 8

  **References**:
  - All 4 repos' setup scripts and docker-compose.yml files

  **Acceptance Criteria**:
  - [ ] ai-employee: `pnpm setup` exit 0 from scratch
  - [ ] nexus-stack: `pnpm supabase:start` exit 0 from scratch
  - [ ] vlre-hub: `pnpm supabase:start` exit 0 from scratch + `pnpm db:seed` exit 0
  - [ ] fetched-pets: `pnpm supabase:start` exit 0 from scratch
  - [ ] All 4 repos: second run exit 0 (idempotent)
  - [ ] vlre-hub: `_prisma_migrations` table has 6 rows (5 original + 1 passcodeName)
  - [ ] vlre-hub: `properties` table has `passcode_name` column

  **QA Scenarios**:

  ```
  Scenario: ai-employee fresh start
    Tool: Bash (timeout: 300s)
    Steps:
      1. cd /Users/victordozal/repos/dozal-devs/ai-employee
      2. docker compose -f docker/docker-compose.yml down -v
      3. pnpm setup
      4. docker exec supabase-ai-employee-db-1 psql -U postgres -d ai_employee -c "SELECT count(*) FROM _prisma_migrations;"
    Expected Result: pnpm setup exit 0, migration count > 0
    Evidence: .sisyphus/evidence/task-9-ai-employee-reset.txt

  Scenario: vlre-hub fresh start with seed
    Tool: Bash (timeout: 300s)
    Steps:
      1. cd /Users/victordozal/repos/real-estate/vlre-hub
      2. docker compose -f docker/docker-compose.yml down -v
      3. pnpm supabase:start
      4. pnpm db:seed
      5. docker exec supabase-vlre-hub-db-1 psql -U postgres -d vlre_hub -c "SELECT count(*) FROM _prisma_migrations;"
      6. docker exec supabase-vlre-hub-db-1 psql -U postgres -d vlre_hub -c "SELECT count(*) FROM properties;"
      7. docker exec supabase-vlre-hub-db-1 psql -U postgres -d vlre_hub -c "SELECT column_name FROM information_schema.columns WHERE table_name='properties' AND column_name='passcode_name';"
    Expected Result: All exit 0, 6 migrations, 40 properties, passcode_name column exists
    Evidence: .sisyphus/evidence/task-9-vlre-hub-reset.txt

  Scenario: nexus-stack fresh start
    Tool: Bash (timeout: 300s)
    Steps:
      1. cd /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack
      2. docker compose -f docker/docker-compose.yml down -v
      3. pnpm supabase:start
    Expected Result: Exit 0
    Evidence: .sisyphus/evidence/task-9-nexus-stack-reset.txt

  Scenario: fetched-pets fresh start
    Tool: Bash (timeout: 300s)
    Steps:
      1. cd /Users/victordozal/repos/fetched-pets/pet-adoption-app
      2. docker compose -f docker/docker-compose.yml down -v
      3. pnpm supabase:start
    Expected Result: Exit 0
    Evidence: .sisyphus/evidence/task-9-fetched-pets-reset.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 2 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check no docker-compose.yml files modified, no zx versions upgraded, no script names changed.
      Output: `Tasks [N/N compliant] | Guardrails [N/N respected] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

Per repo, per logical change:

- `fix(infra): install missing zx dependency` — package.json, pnpm-lock.yaml (nexus-stack, fetched-pets)
- `fix(infra): use localhost in DATABASE_URL for Prisma compatibility` — .env, .env.example
- `fix(infra): add .nothrow() and migration retry to setup script` — scripts/setup\*.ts
- `fix(db): add passcodeName column migration` — prisma/schema/migrations/ (vlre-hub only)
- `fix(db): add seed connectivity pre-check` — prisma/seed.ts (vlre-hub only)

---

## Success Criteria

### Verification Commands

```bash
# For each repo:
docker compose -f docker/docker-compose.yml down -v
pnpm supabase:start  # Expected: exit 0, all steps pass
pnpm supabase:start  # Expected: exit 0, idempotent (already running)

# vlre-hub additionally:
pnpm db:seed         # Expected: exit 0, all sections seeded
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All 4 repos pass `supabase:reset` from scratch
