# Replace Supabase CLI with Docker Compose

## TL;DR

> **Quick Summary**: Replace `supabase start` (CLI) with the official Supabase self-hosted Docker Compose, setting `POSTGRES_DB=ai_employee` so PostgREST natively uses the correct database. Update setup/dev scripts, remap ports to match current convention (54321/54322), run full E2E + test suite.
>
> **Deliverables**:
>
> - `docker/docker-compose.yml` — official Supabase Docker Compose with port remapping + PG17
> - `docker/.env.example` — pre-configured for local dev with `POSTGRES_DB=ai_employee`
> - Updated `scripts/setup.ts` — uses `docker compose` instead of `supabase start`
> - Updated `scripts/dev-start.ts` — uses `docker compose` instead of `supabase start/status/db reset`
> - Updated `scripts/dev-start.sh` — bash version mirrors TypeScript changes
> - Updated docs (README, system-overview, troubleshooting, AGENTS.md)
> - Full E2E verified: webhook → task → PR → 12/12 checks
> - Test suite verified: 515+ passing
>
> **Estimated Effort**: Medium (1-2 sessions)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (compose files) → T2 (setup.ts) → T5 (E2E) → F1-F4

---

## Context

### Original Request

User wants everything to run in the `ai_employee` database. The Supabase CLI hardcodes `Database: "postgres"` in Go source code (`start.go` line 70) — it cannot be changed via config.toml, environment variables, or CLI flags. The solution: replace the CLI with the official Supabase self-hosted Docker Compose, which uses `${POSTGRES_DB}` everywhere — set it to `ai_employee` and all services (PostgREST, Auth, etc.) automatically use that database.

### Interview Summary

**Key Discussions**:

- Confirmed the CLI hardcodes `postgres` — no workaround exists
- User chose Option B (Docker Compose) over FDW proxy or minimal PostgREST
- User chose full official compose (all ~15 containers) over trimmed version
- User confirmed creating a new plan (not extending the docs-and-dx plan)

**Research Findings**:

- Supabase CLI `start.go` line 70: `Database: "postgres"` hardcoded
- PostgREST container gets `PGRST_DB_URI=...5432/postgres` — changes automatically with `${POSTGRES_DB}`
- Official Docker Compose `.env.example` has `POSTGRES_DB=postgres` — just change to `ai_employee`
- Current JWT secret: `super-secret-jwt-token-with-at-least-32-characters-long` — same as Docker Compose default
- Current PG version: 17.6 (`public.ecr.aws/supabase/postgres:17.6.1.064`) — must override Docker Compose default (PG15)
- Project only uses PostgreSQL + PostgREST from Supabase — Auth/Realtime/Storage/Studio unused but will run
- Worker containers use `--network host` + `SUPABASE_URL=http://localhost:54321`

### Metis Review

**Identified Gaps** (addressed):

- Port mismatch: Docker Compose exposes 8000 (Kong) and 5432 (db) — must remap to 54321/54322
- PG version: Docker Compose defaults to PG15 — must use PG17 image to match current setup
- JWT keys: Same default secret — keys are compatible, no migration needed
- Supavisor: Included in full compose but Prisma needs direct DB access — expose port 54322 directly from db container
- Volume data: Existing CLI data is NOT migrated — fresh start with migrations + seed
- `supabase db reset` equivalent: `docker compose down -v && docker compose up -d` + re-migrate
- First-run vs re-run: Docker init scripts only run on volume creation — setup.ts handles gracefully
- CLI containers must be stopped first: setup.ts/dev-start.ts must stop CLI containers before starting compose

---

## Work Objectives

### Core Objective

Replace the Supabase CLI with the official Docker Compose setup so that `POSTGRES_DB=ai_employee` makes all services (including PostgREST) natively use the `ai_employee` database. Verify with full E2E and test suite.

### Concrete Deliverables

- `docker/docker-compose.yml` — from official supabase/supabase repo, with port remapping
- `docker/.env.example` — pre-configured with `POSTGRES_DB=ai_employee`, PG17 image, matched JWT keys
- Updated `scripts/setup.ts` — docker compose instead of supabase CLI
- Updated `scripts/dev-start.ts` — docker compose instead of supabase CLI
- Updated `scripts/dev-start.sh` — mirrors TypeScript changes
- Updated `README.md`, `docs/2026-04-01-1726-system-overview.md`, `docs/2026-04-01-2110-troubleshooting.md`, `~/.config/opencode/AGENTS.md`

### Definition of Done

- [ ] `docker compose -f docker/docker-compose.yml up -d` starts all services
- [ ] PostgREST connects to `ai_employee` (verified via `docker inspect` showing `PGRST_DB_URI=.../ai_employee`)
- [ ] `pnpm prisma migrate deploy` succeeds against `ai_employee` on port 54322
- [ ] `pnpm trigger-task` → task reaches `Done` → PR created on GitHub
- [ ] `pnpm verify:e2e --task-id <uuid>` → 12/12 checks pass
- [ ] `pnpm test` → 515+ passing (2 known failures)
- [ ] `pnpm setup` runs idempotently (exit 0 twice)

### Must Have

- Full official Supabase Docker Compose (all services)
- `POSTGRES_DB=ai_employee` — PostgREST natively uses ai_employee
- Port remapping: Kong→54321, PostgreSQL→54322 (preserves all env vars)
- PostgreSQL 17 (match current CLI version)
- JWT secret compatibility (same keys as current)
- `--reset` flag preserved in dev-start scripts
- Existing Prisma migrations run unmodified

### Must NOT Have (Guardrails)

- MUST NOT modify any source code in `src/` — zero changes to lifecycle.ts, postgrest-client.ts, entrypoint.sh
- MUST NOT modify existing Prisma schema (`.prisma` file) or migration files
- MUST NOT delete bash scripts — update them alongside TypeScript versions
- MUST NOT delete `supabase/config.toml` — preserve as legacy reference
- MUST NOT commit `docker/.env` or `.env` to git
- MUST NOT modify `Dockerfile` (worker image)
- MUST NOT change the worker container `--network host` behavior
- MUST NOT add new npm dependencies to `package.json`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO — this is infrastructure, not code. Verification is via script execution + curl + E2E
- **Framework**: Vitest (existing, for regression check only)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Docker Compose**: Use Bash — verify containers running, ports open, PostgREST responds
- **Scripts**: Use Bash — run scripts, check exit codes, verify idempotency
- **E2E**: Use Bash — trigger-task.ts + verify-e2e.ts
- **Docs**: Use Bash — grep for consistency

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — no dependencies):
├── T1: Add Docker Compose files + .env.example [deep]
├── T2: Update scripts/setup.ts [unspecified-high]
└── T3: Update scripts/dev-start.ts + dev-start.sh [unspecified-high]

Wave 2 (Docs — depends on T1-T3 for accurate references):
└── T4: Update all docs (README, system-overview, troubleshooting, AGENTS.md) [writing]

Wave 3 (Capstone — depends on all above):
└── T5: Full E2E + test suite verification [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks         |
| ---- | ---------- | -------------- |
| T1   | —          | T2, T3, T4, T5 |
| T2   | T1         | T5             |
| T3   | T1         | T5             |
| T4   | T1, T2, T3 | —              |
| T5   | T1, T2, T3 | F1-F4          |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `deep`, T2 `unspecified-high`, T3 `unspecified-high`
- **Wave 2**: 1 task — T4 `writing`
- **Wave 3**: 1 task — T5 `deep`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Add Supabase Docker Compose files with ai_employee configuration

  **What to do**:
  - Clone/download the official Supabase Docker Compose from `https://github.com/supabase/supabase/tree/master/docker`
  - Place files in `docker/` directory at project root:
    - `docker/docker-compose.yml` — the full official compose file
    - `docker/.env.example` — pre-configured for this project
    - `docker/volumes/` — any init SQL scripts from the official repo
  - Critical modifications to `docker/docker-compose.yml`:
    1. **Port remapping**: Kong service: `54321:8000` (not `8000:8000`). DB service: `54322:5432` (not `5432:5432`). Studio: `54323:3000`. Mailpit: `54324:8025`. Analytics: `54327:4000`.
    2. **PostgreSQL 17**: Change db image from `supabase/postgres:15.x` to `public.ecr.aws/supabase/postgres:17.6.1.064` (current version)
  - Create `docker/.env.example` with these critical values:
    ```
    POSTGRES_DB=ai_employee
    POSTGRES_PASSWORD=postgres
    POSTGRES_HOST=db
    POSTGRES_PORT=5432
    JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
    ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
    SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
    ```
    These are the EXACT SAME keys the Supabase CLI generates — they are demo keys, not secrets.
  - Add to root `.gitignore`:
    ```
    docker/.env
    docker/volumes/db/data/
    docker/volumes/storage/
    docker/volumes/logs/
    ```
  - Verify `docker compose -f docker/docker-compose.yml up -d` starts all containers
  - Verify PostgREST env: `docker inspect <rest-container> | grep PGRST_DB_URI` shows `ai_employee`
  - Verify DB accessible: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT 1;"`

  **Must NOT do**:
  - MUST NOT modify any files in `src/`
  - MUST NOT modify `supabase/config.toml` (preserve as legacy)
  - MUST NOT commit `docker/.env`
  - MUST NOT use a PostgreSQL version other than 17.x
  - MUST NOT change JWT_SECRET or key values (they must match current CLI output)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Downloading and configuring the full Docker Compose requires careful port remapping and validation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T2, T3, T4, T5
  - **Blocked By**: None

  **References**:
  - Official Docker Compose: `https://github.com/supabase/supabase/tree/master/docker`
  - Official `.env.example`: `https://raw.githubusercontent.com/supabase/supabase/master/docker/.env.example`
  - Current PostgREST container env: `PGRST_DB_URI=postgresql://authenticator:postgres@supabase_db_ai-employee:5432/postgres` — must change to `/ai_employee`
  - Current PG image: `public.ecr.aws/supabase/postgres:17.6.1.064`
  - Current JWT secret: `super-secret-jwt-token-with-at-least-32-characters-long`
  - Current port mapping: Kong→54321, DB→54322, Studio→54323, Mailpit→54324, Analytics→54327

  **Acceptance Criteria**:
  - [ ] `docker compose -f docker/docker-compose.yml up -d` exits 0, all containers healthy within 120s
  - [ ] `docker inspect <rest-container>` shows `PGRST_DB_URI` containing `ai_employee`
  - [ ] `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT 1;"` returns 1
  - [ ] `curl -sf http://localhost:54321/rest/v1/ -H "apikey: <SERVICE_ROLE_KEY>"` returns 200
  - [ ] `docker/.env.example` exists and contains `POSTGRES_DB=ai_employee`
  - [ ] `.gitignore` includes `docker/.env`, `docker/volumes/db/data/`, `docker/volumes/storage/`, `docker/volumes/logs/`

  **QA Scenarios**:

  ```
  Scenario: Docker Compose starts all services and PostgREST uses ai_employee
    Tool: Bash
    Steps:
      1. docker compose -f docker/docker-compose.yml down -v 2>/dev/null
      2. cp docker/.env.example docker/.env
      3. docker compose -f docker/docker-compose.yml up -d
      4. Wait 120s for all containers to be healthy
      5. docker inspect <rest-container> --format '{{range .Config.Env}}{{println .}}{{end}}' | grep PGRST_DB_URI
      6. Assert output contains "ai_employee"
      7. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT current_database();"
      8. Assert output is "ai_employee"
    Expected Result: PostgREST connects to ai_employee, DB accessible on 54322
    Evidence: .sisyphus/evidence/task-1-compose-startup.txt

  Scenario: PostgREST returns 200 with service role key
    Tool: Bash
    Steps:
      1. curl -sf http://localhost:54321/rest/v1/ -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
      2. Assert HTTP 200
    Expected Result: PostgREST responds with 200
    Evidence: .sisyphus/evidence/task-1-postgrest-auth.txt
  ```

  **Commit**: YES
  - Message: `chore: add Supabase Docker Compose with ai_employee DB`
  - Files: `docker/docker-compose.yml`, `docker/.env.example`, `.gitignore`

- [x] 2. Update scripts/setup.ts to use Docker Compose

  **What to do**:
  - Replace `supabase start` with `docker compose -f docker/docker-compose.yml up -d`
  - Replace `supabase status` check with `docker compose -f docker/docker-compose.yml ps --format json`
  - Remove `supabase` CLI from prerequisite checks (replace with `docker compose version` check)
  - Remove the "Create ai_employee database" step (POSTGRES_DB=ai_employee handles this now)
  - Add a step to stop any existing Supabase CLI containers: `supabase stop 2>/dev/null || true`
  - Add a step to copy `docker/.env.example` to `docker/.env` if it doesn't exist
  - Keep all Prisma migration + seed steps unchanged
  - Keep Docker image build step unchanged
  - Keep PostgREST health verification unchanged (same URL: `http://localhost:54321/rest/v1/...`)
  - Ensure idempotency: if containers are already running and healthy, skip startup

  **Must NOT do**:
  - MUST NOT modify any files in `src/`
  - MUST NOT add new npm dependencies
  - MUST NOT remove the `--help` flag support
  - MUST NOT change the exit code behavior (0 on success, 1 on failure)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1 for compose files to exist)
  - **Parallel Group**: Wave 1 (after T1)
  - **Blocks**: T5
  - **Blocked By**: T1

  **References**:
  - `scripts/setup.ts` — current file (read EVERY line before editing)
  - `docker/docker-compose.yml` — created in T1
  - `docker/.env.example` — created in T1

  **Acceptance Criteria**:
  - [ ] `npx tsx scripts/setup.ts` exits 0 on first run
  - [ ] `npx tsx scripts/setup.ts` exits 0 on second run (idempotent)
  - [ ] Script does NOT check for `supabase` CLI as prerequisite
  - [ ] Script checks for `docker compose` as prerequisite
  - [ ] Script does NOT call `supabase start` anywhere
  - [ ] Script does NOT create `ai_employee` database manually (POSTGRES_DB handles it)

  **QA Scenarios**:

  ```
  Scenario: setup.ts is idempotent with Docker Compose
    Tool: Bash
    Steps:
      1. npx tsx scripts/setup.ts
      2. Verify exit code 0
      3. npx tsx scripts/setup.ts
      4. Verify exit code 0
    Expected Result: Both runs exit 0
    Evidence: .sisyphus/evidence/task-2-setup-idempotent.txt

  Scenario: setup.ts detects missing Docker Compose
    Tool: Bash
    Steps:
      1. Temporarily rename docker binary
      2. npx tsx scripts/setup.ts
      3. Assert output mentions "docker" in error
      4. Restore docker binary
    Expected Result: Clear error about missing Docker/Compose
    Evidence: .sisyphus/evidence/task-2-setup-prereq.txt
  ```

  **Commit**: YES
  - Message: `feat(scripts): update setup.ts for Docker Compose`
  - Files: `scripts/setup.ts`

- [x] 3. Update scripts/dev-start.ts and scripts/dev-start.sh for Docker Compose

  **What to do**:
  - **dev-start.ts**:
    1. Replace `supabase` CLI prerequisite check with `docker compose version` check
    2. Replace `supabase status` with `docker compose -f docker/docker-compose.yml ps --format json` to check if running
    3. Replace `supabase start` with `docker compose -f docker/docker-compose.yml up -d`
    4. Replace `supabase db reset` (for `--reset` flag) with: `docker compose -f docker/docker-compose.yml down -v && docker compose -f docker/docker-compose.yml up -d` then re-run migrations + seed
    5. Add: stop any existing CLI containers before starting compose (`supabase stop 2>/dev/null || true`)
    6. Keep health check polling unchanged (same URLs: localhost:54321, :8288, :3000)
    7. Keep Inngest + Gateway startup unchanged
    8. Keep SIGINT cleanup unchanged
  - **dev-start.sh**:
    1. Mirror all changes from dev-start.ts
    2. Replace `command -v supabase` with `docker compose version`
    3. Replace `supabase status` with `docker compose -f docker/docker-compose.yml ps`
    4. Replace `supabase start` with `docker compose -f docker/docker-compose.yml up -d`
    5. Replace `supabase db reset` with compose down -v + up -d + migrate + seed

  **Must NOT do**:
  - MUST NOT modify any files in `src/`
  - MUST NOT delete the bash script (keep both .ts and .sh)
  - MUST NOT change the health check URLs or timeouts (except increasing Supabase timeout from 60s to 120s if needed)
  - MUST NOT add new npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1)
  - **Parallel Group**: Wave 1 (after T1, parallel with T2)
  - **Blocks**: T5
  - **Blocked By**: T1

  **References**:
  - `scripts/dev-start.ts` — current file (read EVERY line)
  - `scripts/dev-start.sh` — current file (read EVERY line)
  - `docker/docker-compose.yml` — created in T1

  **Acceptance Criteria**:
  - [ ] `npx tsx scripts/dev-start.ts` starts all services (exit when healthy)
  - [ ] `npx tsx scripts/dev-start.ts --reset` destroys and recreates database
  - [ ] Ctrl+C cleanly kills all child processes
  - [ ] `scripts/dev-start.sh` mirrors TypeScript behavior
  - [ ] Neither script calls `supabase start/status/db reset`

  **QA Scenarios**:

  ```
  Scenario: dev-start.ts starts services with Docker Compose
    Tool: Bash
    Steps:
      1. docker compose -f docker/docker-compose.yml down -v 2>/dev/null
      2. npx tsx scripts/dev-start.ts &
      3. Wait 120s
      4. curl -sf http://localhost:54321/health
      5. curl -sf http://localhost:3000/health
      6. curl -sf http://localhost:8288/
      7. Kill the script
    Expected Result: All 3 health checks return 200
    Evidence: .sisyphus/evidence/task-3-devstart-health.txt

  Scenario: dev-start.ts --reset wipes and recreates DB
    Tool: Bash
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "INSERT INTO tasks (external_id, source_system, status, tenant_id, project_id) VALUES ('sentinel', 'test', 'Ready', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003');"
      2. npx tsx scripts/dev-start.ts --reset &
      3. Wait for setup completion
      4. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT count(*) FROM tasks WHERE external_id='sentinel';"
      5. Assert count is 0 (row was wiped)
    Expected Result: Sentinel row is gone after reset
    Evidence: .sisyphus/evidence/task-3-devstart-reset.txt
  ```

  **Commit**: YES
  - Message: `feat(scripts): update dev-start scripts for Docker Compose`
  - Files: `scripts/dev-start.ts`, `scripts/dev-start.sh`

- [x] 4. Update all documentation for Docker Compose migration

  **What to do**:
  - **README.md**:
    - Update Prerequisites: remove "Supabase CLI", add "Docker + Docker Compose"
    - Update Quick Start step 2: `pnpm setup` still works (no change to user command)
    - Add note about `docker/docker-compose.yml` in Project Structure section
  - **docs/2026-04-01-1726-system-overview.md**:
    - Update "Local Development Environment" > "Required Services" table to reference Docker Compose
    - Update "Start Everything at Once" to show `pnpm dev:start` (which now uses docker compose internally)
    - Remove "Manual Steps (if dev-start.sh fails)" section referencing `supabase start` — replace with docker compose commands
    - Update "Known Limitations" item about database name — it's now fixed
  - **docs/2026-04-01-2110-troubleshooting.md**:
    - Add scenario: "Docker Compose containers won't start" (port conflict with CLI containers)
    - Update "PostgREST returns 403" scenario if the fix approach changed
  - **~/.config/opencode/AGENTS.md**:
    - Update ai-employee project section: mention Docker Compose instead of Supabase CLI
    - Update the "Local Supabase — Per-Project Database Names" section to note the Docker Compose approach

  **Must NOT do**:
  - MUST NOT rewrite entire documents — targeted edits only
  - MUST NOT modify phase docs (1-8) — they are historical records
  - MUST NOT add emojis or badges

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1-T3 for accurate references)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: T1, T2, T3

  **References**:
  - `README.md` — current file
  - `docs/2026-04-01-1726-system-overview.md` — current file
  - `docs/2026-04-01-2110-troubleshooting.md` — current file
  - `~/.config/opencode/AGENTS.md` — current file

  **Acceptance Criteria**:
  - [ ] README.md does not mention `supabase start` or `Supabase CLI` as prerequisite
  - [ ] README.md mentions Docker + Docker Compose as prerequisite
  - [ ] system-overview.md references `docker compose` for starting services
  - [ ] system-overview.md "Known Limitations" no longer lists `postgres` database name as limitation
  - [ ] AGENTS.md mentions Docker Compose in ai-employee section
  - [ ] All doc links still resolve

  **QA Scenarios**:

  ```
  Scenario: No docs reference supabase start as required
    Tool: Bash
    Steps:
      1. grep -rn "supabase start" README.md docs/2026-04-01-1726-system-overview.md
      2. Assert zero matches (except historical references in phase docs, which are not modified)
    Expected Result: No docs tell users to run "supabase start"
    Evidence: .sisyphus/evidence/task-4-docs-no-supabase.txt
  ```

  **Commit**: YES
  - Message: `docs: update all docs for Docker Compose migration`
  - Files: `README.md`, `docs/2026-04-01-1726-system-overview.md`, `docs/2026-04-01-2110-troubleshooting.md`

- [x] 5. Full E2E verification + test suite (capstone)

  **What to do**:
  - This is the capstone verification task. Steps:
    1. Ensure Docker Compose is running: `docker compose -f docker/docker-compose.yml up -d`
    2. Wait for all services healthy (120s)
    3. Verify `.env` has `DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee`
    4. Run Prisma migrations: `pnpm prisma migrate deploy`
    5. Run Prisma seed: `pnpm prisma db seed`
    6. Verify PostgREST can read projects table: `curl -sf http://localhost:54321/rest/v1/projects?limit=1 -H "apikey: <key>"`
    7. Build Docker worker image: `docker build -t ai-employee-worker:latest .`
    8. Start Gateway + Inngest (if not already): `npx tsx scripts/dev-start.ts &`
    9. Wait for all services healthy
    10. Trigger E2E: `npx tsx scripts/trigger-task.ts --key TEST-compose-$(date +%s)`
    11. Wait for task to reach Done (max 20 min)
    12. Run verify: `npx tsx scripts/verify-e2e.ts --task-id <uuid> --repo viiqswim/ai-employee-test-target`
    13. Run test suite: `pnpm prisma db seed && CI=true pnpm test -- --run`
    14. Verify: 515+ passing, 2 known failures only
    15. Verify `.env` is NOT committed: `git check-ignore .env`

  **Must NOT do**:
  - MUST NOT commit `.env` or `docker/.env`
  - MUST NOT modify source code
  - MUST NOT wait more than 20 minutes for E2E

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential capstone)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: T1, T2, T3

  **References**:
  - `scripts/trigger-task.ts` — webhook sender
  - `scripts/verify-e2e.ts` — 12-point verification
  - `docker/docker-compose.yml` — created in T1
  - `.env` — must have DATABASE_URL pointing to ai_employee

  **Acceptance Criteria**:
  - [ ] PostgREST `PGRST_DB_URI` contains `ai_employee`
  - [ ] Full E2E: webhook → Done → PR created
  - [ ] verify-e2e.ts: 12/12 checks pass
  - [ ] Test suite: 515+ passing
  - [ ] `.env` and `docker/.env` NOT committed

  **QA Scenarios**:

  ```
  Scenario: Full E2E with Docker Compose ai_employee
    Tool: Bash
    Steps:
      1. Verify docker compose services running
      2. npx tsx scripts/trigger-task.ts --key TEST-compose-$(date +%s)
      3. Wait for Done (max 20 min)
      4. npx tsx scripts/verify-e2e.ts --task-id $UUID --repo viiqswim/ai-employee-test-target
    Expected Result: 12/12 checks pass
    Evidence: .sisyphus/evidence/task-5-e2e-compose.txt

  Scenario: Test suite regression check
    Tool: Bash
    Steps:
      1. pnpm prisma db seed
      2. CI=true pnpm test -- --run
    Expected Result: 515+ tests passing, 2 known failures only
    Evidence: .sisyphus/evidence/task-5-test-suite.txt
  ```

  **Commit**: NO (verification only, `.env` is gitignored)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm tsc --noEmit` + linter + `pnpm test -- --run`. Verify all updated scripts have proper error handling. Check for `as any`, empty catches, console.log in TypeScript files.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Scripts [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Run `pnpm setup` from a state where Docker Compose is already running (idempotent check). Run `pnpm trigger-task` and verify task reaches Done. Run `pnpm verify:e2e` with the task ID. Check every link in README.md resolves.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read spec, read actual diff. Verify 1:1 match. Check "Must NOT" compliance — especially that zero `src/` files were modified. Detect cross-task contamination.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| #   | Commit Message                                               | Files                                                                                             |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1   | `chore: add Supabase Docker Compose with ai_employee DB`     | `docker/docker-compose.yml`, `docker/.env.example`, `.gitignore`                                  |
| 2   | `feat(scripts): update setup.ts for Docker Compose`          | `scripts/setup.ts`                                                                                |
| 3   | `feat(scripts): update dev-start scripts for Docker Compose` | `scripts/dev-start.ts`, `scripts/dev-start.sh`                                                    |
| 4   | `docs: update all docs for Docker Compose migration`         | `README.md`, `docs/2026-04-01-1726-system-overview.md`, `docs/2026-04-01-2110-troubleshooting.md` |
| 5   | (no commit — E2E verification, `.env` is gitignored)         | —                                                                                                 |

---

## Success Criteria

### Verification Commands

```bash
# PostgREST connects to ai_employee
docker inspect supabase-rest-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep "PGRST_DB_URI.*ai_employee"

# Database exists with all tables
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "\dt public.*" | grep -c "tasks"

# Prisma migrations applied
pnpm prisma migrate status 2>&1 | grep "up to date"

# Test suite passes
CI=true pnpm test -- --run 2>&1 | tail -5  # 515+

# Full E2E
pnpm trigger-task --key TEST-compose-$(date +%s)
pnpm verify:e2e --task-id <uuid>  # 12/12

# Setup idempotent
pnpm setup && pnpm setup  # Both exit 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] PostgREST uses `ai_employee` database
- [ ] All tests pass (515+)
- [ ] Full E2E 12/12
- [ ] Scripts idempotent
