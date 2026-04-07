# Unified Supabase Infrastructure — Per-Repo, Fully Simultaneous

## TL;DR

> **Quick Summary**: Standardize Supabase infrastructure across 4 repositories using a single canonical Docker Compose template. Each repo gets its own complete, independent Supabase stack on a unique port range, allowing ALL projects to run simultaneously. The Docker Compose file is identical across repos — only the `.env` file differs (ports, database name, project name).
>
> **Deliverables**:
>
> - Canonical Docker Compose template (parameterized ports via env vars) deployed to all 4 repos
> - Per-repo `.env.example` with unique port ranges (543xx, 553xx, 563xx, 573xx)
> - Per-repo database grants SQL for Supabase roles
> - Updated setup scripts in all 4 repos following ai-employee's idempotent pattern
> - Per-repo verification scripts
> - Documentation guide for the template and adding future repos
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 2 → Tasks 3-6 (parallel) → Task 7 → Task 8

---

## Context

### Original Request

User wants all 4 repositories to use the same Supabase Docker Compose configuration instead of `supabase start`. All projects must be able to run simultaneously on the same machine. Each repo must be self-contained — a developer clones ONE repo and runs `pnpm setup` with no external dependencies.

### Interview Summary

**Key Discussions**:

- **Current state**: No repos share anything. ai-employee has custom Docker Compose (14 services); nexus-stack and vlre-hub use `supabase start` (CLI); fetched-pets has standalone PostgreSQL with no local Supabase services.
- **Simultaneous operation required**: User needs ALL projects running at the same time. Original "one-at-a-time switching" architecture was rejected.
- **Per-repo self-contained**: Each repo must work independently when cloned by any team member. No external `~/.supabase-local/` dependency.
- **fetched-pets uses Supabase Auth AND Storage**: Confirmed via code search — `supabase.auth.admin.createUser`, `auth.getUser`, `auth.getSession`, file uploads via `@/lib/supabase/storage`. Needs full Supabase stack.
- **nexus-stack uses `postgres` as DB name**: Must rename to `nexus_stack` (collision risk with PostgreSQL system database).
- **vlre-hub's `supabase/config.toml` has wrong `project_id`**: Copy-paste error (`nexus-stack` instead of `vlre-hub`).

**Research Findings**:

- ai-employee's `setup.ts` pattern: (1) stop Supabase CLI, (2) health-check port 54321, (3) start Docker Compose only if not running, (4) wait 120s, (5) run Prisma migrations, (6) seed.
- ai-employee's Docker Compose: 14 services, all using `${POSTGRES_DB}` env var. Some ports may be hardcoded — need parameterization.
- PostgREST, GoTrue (Auth), and Storage are single-database-per-instance — cannot serve multiple databases simultaneously. This drives the "separate stack per repo" architecture.
- nexus-stack has `scripts/sync-supabase-keys.sh` (extracts keys from `supabase status`) and `scripts/setup-env-links.sh` (symlinks root `.env` to all apps).
- fetched-pets is a Turborepo monorepo — Prisma commands must use `pnpm --filter database`.

### Metis Review

**Identified Gaps** (addressed in this revision):

- **Multi-project simultaneous operation**: Originally missed — now core architecture. Each repo gets its own complete Supabase stack on unique ports.
- **fetched-pets needs full Supabase**: Originally marked as PostgreSQL-only. Corrected — gets full 14-service stack.
- **Portability for teams**: Originally used `~/.supabase-local/` (non-portable). Now per-repo `docker/` directory.
- **`docker-entrypoint-initdb.d/` only runs on empty volume**: Each repo manages its own volume, so this is a per-repo concern handled by setup scripts.
- **vlre-hub database name**: Changed from `vlre-hub` (hyphen) to `vlre_hub` (underscore) — PostgreSQL best practice.
- **nexus-stack `postgres` → `nexus_stack`**: Fresh local start; `pg_dump` option documented for data preservation.
- **Shared JWT secret cross-project risk**: Each repo has its own Supabase instance, so JWT secrets are isolated per-project now.
- **fetched-pets hardcoded production creds**: Flagged as security issue, out of scope.

---

## Work Objectives

### Core Objective

Create a single canonical Docker Compose template that all 4 repositories use for local Supabase development. Each repo gets its own independent, complete Supabase stack on a unique port range, enabling fully simultaneous operation.

### Concrete Deliverables

- Parameterized Docker Compose template (all host ports use env vars)
- Per-repo `docker/.env.example` with unique port ranges
- Per-repo `docker/volumes/db/{project}_grants.sql`
- Updated/new setup scripts in all 4 repos
- Per-repo verification scripts
- `docs/shared-supabase-guide.md` template for each repo

### Port Range Allocation

| Service            | ai-employee | nexus-stack | vlre-hub | fetched-pets |
| ------------------ | ----------- | ----------- | -------- | ------------ |
| Kong (API Gateway) | 54321       | 55321       | 56321    | 57321        |
| Kong HTTPS         | 54340       | 55340       | 56340    | 57340        |
| PostgreSQL         | 54322       | 55322       | 56322    | 57322        |
| Studio             | 54323       | 55323       | 56323    | 57323        |
| Inbucket SMTP      | 54324       | 55324       | 56324    | 57324        |
| Inbucket Web       | 54325       | 55325       | 56325    | 57325        |
| Supavisor (Pooler) | 54331       | 55331       | 56331    | 57331        |
| Analytics          | 54332       | 55332       | 56332    | 57332        |

**Pattern**: `5{N}3xx` where N = 4 (ai-employee), 5 (nexus-stack), 6 (vlre-hub), 7 (fetched-pets).
**Future repos**: 58321, 59321, 60321, etc.

### Definition of Done

- [ ] All 4 repos can start their Supabase stack independently with `pnpm setup` (or equivalent)
- [ ] All 4 Supabase stacks can run simultaneously without port conflicts
- [ ] Each repo's `docker/docker-compose.yml` is the SAME template — only `.env` differs
- [ ] New developer experience: clone repo → `pnpm setup` → working Supabase (no external deps)
- [ ] Verification script in each repo exits 0 when its Supabase is healthy

### Must Have

- Identical Docker Compose template across all 4 repos (all ports parameterized via env vars)
- Unique port ranges per repo that don't conflict
- Per-repo `docker/.env.example` with all ports, database name, and project name pre-configured
- Per-repo grants SQL for Supabase roles on that project's database
- Idempotent setup scripts (run twice → same result)
- Per-repo verification script
- `supabase stop` called in setup scripts to prevent conflicts with Supabase CLI

### Must NOT Have (Guardrails)

- **DO NOT share a PostgreSQL instance across repos** — each repo runs its own complete stack (required for simultaneous operation)
- **DO NOT create external dependencies** — no `~/.supabase-local/`, no shared git repos, no symlinks between repos
- **DO NOT modify ai-employee's existing Prisma migration files**
- **DO NOT touch production Supabase credentials or projects**
- **DO NOT migrate fetched-pets from Firebase to Supabase auth** — keep existing auth strategy
- **DO NOT consolidate application Docker Compose files** (API/Web/Inngest/Redis) — only Supabase infrastructure
- **DO NOT delete `supabase/config.toml` files** in nexus-stack or vlre-hub — add comment noting inactive
- **DO NOT update Supabase service image versions** — use ai-employee's pinned versions as-is
- **DO NOT fix the hardcoded production credentials in `fetched-pets/scripts/supabase-users.sh`** — flag it, separate security task
- **DO NOT create a separate "switch project" mechanism** — not needed (each project has its own ports)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: N/A (infrastructure work, not application code)
- **Automated tests**: Per-repo verification scripts
- **Framework**: TypeScript verification scripts using `zx`

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Infrastructure**: Use Bash — `docker compose ps`, `psql`, `curl`, `docker volume ls`
- **Scripts**: Use Bash — run the script, verify output and exit code
- **Configuration**: Use Bash — `grep` env files, compare compose files

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — template + tooling):
├── Task 1: Create parameterized Docker Compose template [deep]
├── Task 2: Create per-repo .env.example files + grants SQL [quick]

Wave 2 (After Wave 1 — per-repo migrations, MAX PARALLEL):
├── Task 3: Migrate ai-employee to parameterized template (depends: 1, 2) [unspecified-high]
├── Task 4: Migrate nexus-stack from supabase start (depends: 1, 2) [deep]
├── Task 5: Migrate vlre-hub from supabase start (depends: 1, 2) [deep]
├── Task 6: Migrate fetched-pets to full Supabase stack (depends: 1, 2) [deep]

Wave 3 (After Wave 2 — verification + docs):
├── Task 7: E2E verification — all 4 stacks running simultaneously (depends: 3-6) [unspecified-high]
├── Task 8: Documentation — template guide + per-repo READMEs (depends: 7) [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks     | Wave  |
| ----- | ---------- | ---------- | ----- |
| 1     | —          | 3, 4, 5, 6 | 1     |
| 2     | —          | 3, 4, 5, 6 | 1     |
| 3     | 1, 2       | 7          | 2     |
| 4     | 1, 2       | 7          | 2     |
| 5     | 1, 2       | 7          | 2     |
| 6     | 1, 2       | 7          | 2     |
| 7     | 3, 4, 5, 6 | 8          | 3     |
| 8     | 7          | F1-F4      | 3     |
| F1-F4 | 8          | —          | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `deep`, T2 → `quick`
- **Wave 2**: 4 tasks — T3 → `unspecified-high`, T4 → `deep`, T5 → `deep`, T6 → `deep`
- **Wave 3**: 2 tasks — T7 → `unspecified-high`, T8 → `writing`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create parameterized Docker Compose template

  **What to do**:
  - Start from ai-employee's `docker/docker-compose.yml` (14 services). Create a modified version where ALL host-facing ports use env vars with defaults matching ai-employee's current ports.
  - **Port parameterization** — Every `ports:` mapping that exposes a host port must use an env var:

    ```yaml
    # PostgreSQL
    db:
      ports:
        - '${POSTGRES_PORT_HOST:-54322}:${POSTGRES_PORT:-5432}'

    # Kong (API Gateway)
    kong:
      ports:
        - '${KONG_HTTP_PORT_HOST:-54321}:8000'
        - '${KONG_HTTPS_PORT_HOST:-54340}:8443'

    # Studio
    studio:
      ports:
        - '${STUDIO_PORT_HOST:-54323}:3000'

    # Inbucket (email testing)
    inbucket:
      ports:
        - '${INBUCKET_SMTP_PORT_HOST:-54324}:2500'
        - '${INBUCKET_WEB_PORT_HOST:-54325}:9000'

    # Supavisor (connection pooler)
    supavisor:
      ports:
        - '${POOLER_PORT_HOST:-54331}:${POOLER_PROXY_PORT_TRANSACTION:-6543}'

    # Analytics
    analytics:
      ports:
        - '${ANALYTICS_PORT_HOST:-54332}:4000'
    ```

  - **Internal service communication**: Services talk to each other INSIDE the Docker network using internal ports (5432, 3000, 8000, etc.) — these do NOT change. Only HOST-facing port mappings are parameterized.
  - **Docker Compose project name**: Add `name: ${COMPOSE_PROJECT_NAME:-supabase-local}` at the top. Each repo sets this to `supabase-{project-name}` in `.env`.
  - **Volume naming**: Change the PostgreSQL data volume to use project-scoped naming: `${COMPOSE_PROJECT_NAME:-supabase-local}-db-data`. This ensures each repo gets its own data volume.
  - **Container naming**: Do NOT add explicit `container_name:` — let Docker Compose auto-name based on project name. This avoids conflicts when running multiple stacks.
  - **Keep ALL 14 services exactly as ai-employee has them** — same images, same internal env vars, same health checks. Only host port mappings change.
  - Save the template temporarily at `infra/templates/docker-compose-template.yml` for reference during other tasks.

  **Must NOT do**:
  - Do NOT change any Supabase service image versions
  - Do NOT add or remove services
  - Do NOT change internal Docker network ports (only HOST mappings)
  - Do NOT add `container_name:` to services (causes conflicts with multiple stacks)
  - Do NOT modify ai-employee's current `docker/docker-compose.yml` in this task — that's Task 3

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful analysis of a complex 14-service Docker Compose to parameterize every host port without breaking internal service communication
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/docker/docker-compose.yml` — READ THE ENTIRE FILE. This is the source template. Every service, every port mapping, every env var reference must be understood before parameterizing.
  - `/Users/victordozal/repos/dozal-devs/ai-employee/docker/.env.example` — READ THIS FILE. Shows current env vars. New port env vars must be added here.

  **WHY Each Reference Matters**:
  - `docker-compose.yml`: The foundation. Must identify EVERY host-facing port and parameterize it. Missing one causes port conflicts.
  - `.env.example`: Must understand the full set of env vars to extend with port overrides.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Template validates with Docker Compose
    Tool: Bash
    Preconditions: Template file exists at infra/templates/docker-compose-template.yml
    Steps:
      1. Create a test .env with ai-employee ports: all defaults
      2. Validate: `docker compose -f infra/templates/docker-compose-template.yml config --quiet`
    Expected Result: Exit code 0, no errors
    Failure Indicators: Syntax errors, undefined variable warnings
    Evidence: .sisyphus/evidence/task-1-template-valid.txt

  Scenario: Template validates with different port range
    Tool: Bash
    Preconditions: Template file exists
    Steps:
      1. Create a test .env with nexus-stack ports (55xxx range)
      2. Validate: `KONG_HTTP_PORT_HOST=55321 POSTGRES_PORT_HOST=55322 STUDIO_PORT_HOST=55323 docker compose -f infra/templates/docker-compose-template.yml config | grep '55321'`
    Expected Result: Port 55321 appears in Kong service config
    Failure Indicators: Hardcoded 54321 still present
    Evidence: .sisyphus/evidence/task-1-port-override.txt

  Scenario: No hardcoded host ports remain
    Tool: Bash
    Steps:
      1. Search for hardcoded host ports: `grep -n '54321\|54322\|54323\|54324\|54325\|54331\|54332\|54340\|8443' infra/templates/docker-compose-template.yml | grep -v '#' | grep -v 'default'`
    Expected Result: 0 matches (all host ports use env vars)
    Failure Indicators: Any hardcoded port in a `ports:` mapping
    Evidence: .sisyphus/evidence/task-1-no-hardcoded-ports.txt
  ```

  **Commit**: NO (template is a draft artifact used by Tasks 3-6)

---

- [x] 2. Create per-repo .env.example files + grants SQL

  **What to do**:
  - Create 4 `.env.example` files (one per repo) based on ai-employee's `docker/.env.example`, with these per-repo overrides:

  **ai-employee** (`docker/.env.example`):

  ```
  COMPOSE_PROJECT_NAME=supabase-ai-employee
  POSTGRES_DB=ai_employee
  KONG_HTTP_PORT_HOST=54321
  KONG_HTTPS_PORT_HOST=54340
  POSTGRES_PORT_HOST=54322
  STUDIO_PORT_HOST=54323
  INBUCKET_SMTP_PORT_HOST=54324
  INBUCKET_WEB_PORT_HOST=54325
  POOLER_PORT_HOST=54331
  ANALYTICS_PORT_HOST=54332
  ```

  **nexus-stack** (`docker/.env.example`):

  ```
  COMPOSE_PROJECT_NAME=supabase-nexus-stack
  POSTGRES_DB=nexus_stack
  KONG_HTTP_PORT_HOST=55321
  KONG_HTTPS_PORT_HOST=55340
  POSTGRES_PORT_HOST=55322
  STUDIO_PORT_HOST=55323
  INBUCKET_SMTP_PORT_HOST=55324
  INBUCKET_WEB_PORT_HOST=55325
  POOLER_PORT_HOST=55331
  ANALYTICS_PORT_HOST=55332
  ```

  **vlre-hub** (`docker/.env.example`):

  ```
  COMPOSE_PROJECT_NAME=supabase-vlre-hub
  POSTGRES_DB=vlre_hub
  KONG_HTTP_PORT_HOST=56321
  KONG_HTTPS_PORT_HOST=56340
  POSTGRES_PORT_HOST=56322
  STUDIO_PORT_HOST=56323
  INBUCKET_SMTP_PORT_HOST=56324
  INBUCKET_WEB_PORT_HOST=56325
  POOLER_PORT_HOST=56331
  ANALYTICS_PORT_HOST=56332
  ```

  **fetched-pets** (`docker/.env.example`):

  ```
  COMPOSE_PROJECT_NAME=supabase-fetched-pets
  POSTGRES_DB=fetched_pets
  KONG_HTTP_PORT_HOST=57321
  KONG_HTTPS_PORT_HOST=57340
  POSTGRES_PORT_HOST=57322
  STUDIO_PORT_HOST=57323
  INBUCKET_SMTP_PORT_HOST=57324
  INBUCKET_WEB_PORT_HOST=57325
  POOLER_PORT_HOST=57331
  ANALYTICS_PORT_HOST=57332
  ```

  - Each `.env.example` also includes ALL the standard Supabase vars from ai-employee's template (JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, etc.). The port vars are ADDED to the existing content. Include a header comment:

    ```
    # Supabase Docker Compose — {Project Name}
    # Port range: 5{N}3xx (unique per project, allows simultaneous operation)
    # See: docs/YYYY-MM-DD-HHMM-supabase-infrastructure.md
    ```

  - Create per-repo grants SQL files:
    - Copy `/Users/victordozal/repos/dozal-devs/ai-employee/docker/volumes/db/ai_employee_grants.sql` as the template
    - For each repo, create `docker/volumes/db/{project}_grants.sql`:
      - `nexus_stack_grants.sql` — same grants but `\connect nexus_stack` and grant on `nexus_stack` database
      - `vlre_hub_grants.sql` — same but for `vlre_hub`
      - `fetched_pets_grants.sql` — same but for `fetched_pets`
    - Each grants file must configure: `supabase_storage_admin`, `supabase_auth_admin`, `authenticator`, `anon`, `authenticated`, `service_role`, `supabase_admin`

  - Save all files to `infra/templates/` for now (they'll be deployed to repos in Tasks 3-6):
    - `infra/templates/env-ai-employee.example`
    - `infra/templates/env-nexus-stack.example`
    - `infra/templates/env-vlre-hub.example`
    - `infra/templates/env-fetched-pets.example`
    - `infra/templates/nexus_stack_grants.sql`
    - `infra/templates/vlre_hub_grants.sql`
    - `infra/templates/fetched_pets_grants.sql`

  **Must NOT do**:
  - Do NOT modify ai-employee's existing `docker/.env.example` in this task — that's Task 3
  - Do NOT create roles — they already exist in the Supabase PostgreSQL image
  - Do NOT use the same port range for multiple repos

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Templating work — copy existing files with value substitutions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/docker/.env.example` — READ ENTIRE FILE. Base template for all 4 `.env.example` files. Contains JWT secrets, service keys, and all standard Supabase vars.
  - `/Users/victordozal/repos/dozal-devs/ai-employee/docker/volumes/db/ai_employee_grants.sql` — READ ENTIRE FILE. Template for all grants files. Shows exactly which roles need grants.

  **WHY Each Reference Matters**:
  - `.env.example`: The full set of Supabase env vars. Missing any causes service failures.
  - `ai_employee_grants.sql`: The exact grants that make PostgREST/Auth/Storage work. Without these, services fail with permission errors.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 .env.example files have unique ports and no conflicts
    Tool: Bash
    Steps:
      1. Extract all KONG_HTTP_PORT_HOST values from all 4 files
      2. Verify they are: 54321, 55321, 56321, 57321 (all unique)
      3. Extract all POSTGRES_PORT_HOST values
      4. Verify they are: 54322, 55322, 56322, 57322 (all unique)
    Expected Result: All port assignments are unique across repos
    Failure Indicators: Duplicate ports in any two repos
    Evidence: .sisyphus/evidence/task-2-port-uniqueness.txt

  Scenario: All grants SQL files have correct database names
    Tool: Bash
    Steps:
      1. Check nexus_stack_grants.sql contains "nexus_stack" (not "postgres" or "ai_employee")
      2. Check vlre_hub_grants.sql contains "vlre_hub" (not "vlre-hub")
      3. Check fetched_pets_grants.sql contains "fetched_pets"
    Expected Result: Each file references only its own database name
    Failure Indicators: Wrong database name in any grants file
    Evidence: .sisyphus/evidence/task-2-grants-check.txt
  ```

  **Commit**: NO (draft artifacts used by Tasks 3-6)

---

- [x] 3. Migrate ai-employee to parameterized template

  **What to do**:
  - Replace `/Users/victordozal/repos/dozal-devs/ai-employee/docker/docker-compose.yml` with the parameterized template from Task 1
  - Replace `/Users/victordozal/repos/dozal-devs/ai-employee/docker/.env.example` with the ai-employee version from Task 2
  - Update `/Users/victordozal/repos/dozal-devs/ai-employee/docker/.env` — if it exists, add the new port env vars (keeping existing values). If not, copy from `.env.example`.
  - **Verify ai-employee's defaults match current behavior**: Since ai-employee defaults are 543xx, the parameterized template with defaults should produce IDENTICAL behavior to the current setup. This is a non-breaking change.
  - Update `scripts/setup.ts`:
    - No path changes needed (still uses `docker/docker-compose.yml`)
    - The compose file is now parameterized but defaults match current values
    - Add verification that `docker/.env` has `COMPOSE_PROJECT_NAME=supabase-ai-employee`
  - Update `scripts/dev-start.ts`:
    - Same: no path changes, compose file still in `docker/`
  - Update `.env.example` (project root):
    - Change `DATABASE_URL` comment to reference the port env var: `# Port must match POSTGRES_PORT_HOST in docker/.env (default: 54322)`
    - Change `SUPABASE_URL` comment similarly: `# Port must match KONG_HTTP_PORT_HOST in docker/.env (default: 54321)`
  - Create `scripts/verify-supabase.ts` — a simple verification script that checks:
    1. PostgreSQL on `POSTGRES_PORT_HOST` is healthy
    2. Kong on `KONG_HTTP_PORT_HOST` returns 200
    3. The project's database exists
    4. Studio on `STUDIO_PORT_HOST` responds
  - Run existing tests: `pnpm test -- --run` — must still pass 515+ tests

  **Must NOT do**:
  - Do NOT change any port VALUES in the existing docker/.env (only add new env var names with same values)
  - Do NOT modify Prisma migration files
  - Do NOT break existing behavior — this must be a transparent upgrade

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Careful migration of working infrastructure with regression risk
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/docker/docker-compose.yml` — Current compose file being replaced. READ to understand current port mappings and verify defaults in template match.
  - `/Users/victordozal/repos/dozal-devs/ai-employee/docker/.env.example` — Current env template being replaced.
  - `/Users/victordozal/repos/dozal-devs/ai-employee/docker/.env` — Current active env. Must be updated to ADD new vars without losing existing values.
  - `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/setup.ts` — Setup script. Verify it still works with parameterized compose.
  - `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/dev-start.ts` — Dev start script. Same verification.

  **Test References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/tests/` — Run `pnpm test -- --run` after changes. 515+ tests expected.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: ai-employee starts successfully with parameterized compose
    Tool: Bash
    Preconditions: Stop any running ai-employee compose: `docker compose -f /Users/victordozal/repos/dozal-devs/ai-employee/docker/docker-compose.yml down`
    Steps:
      1. Start: `docker compose -f /Users/victordozal/repos/dozal-devs/ai-employee/docker/docker-compose.yml up -d`
      2. Wait for health: retry `curl -sf http://localhost:54321/rest/v1/` up to 120s
      3. Verify PostgreSQL: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT 1;" -t`
    Expected Result: All services start, Kong returns 200 on 54321, PostgreSQL accessible on 54322
    Failure Indicators: Port conflicts, services failing, wrong ports
    Evidence: .sisyphus/evidence/task-3-ai-employee-start.txt

  Scenario: Existing tests still pass (regression)
    Tool: Bash
    Preconditions: ai-employee Supabase running
    Steps:
      1. Run: `cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm test -- --run`
    Expected Result: 515+ tests passing, 0 new failures
    Failure Indicators: Test count drops, new failures
    Evidence: .sisyphus/evidence/task-3-regression.txt

  Scenario: Docker Compose project name is correct
    Tool: Bash
    Steps:
      1. Check: `docker compose -f /Users/victordozal/repos/dozal-devs/ai-employee/docker/docker-compose.yml ps --format "{{.Project}}" | head -1`
    Expected Result: "supabase-ai-employee"
    Failure Indicators: Generic "docker" or "supabase-local" project name
    Evidence: .sisyphus/evidence/task-3-project-name.txt
  ```

  **Commit**: YES
  - Message: `feat(infra): parameterize Docker Compose ports for multi-project support`
  - Files: `docker/docker-compose.yml`, `docker/.env.example`, `docker/.env`, `.env.example`, `scripts/verify-supabase.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 4. Migrate nexus-stack from `supabase start` to Docker Compose

  **What to do**:
  - Create `docker/` directory at `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/docker/`:
    - `docker-compose.yml` — The EXACT same parameterized template from Task 1 (byte-identical to ai-employee's)
    - `.env.example` — The nexus-stack version from Task 2 (ports 553xx, POSTGRES_DB=nexus_stack)
    - `volumes/db/nexus_stack_grants.sql` — From Task 2
  - Create `scripts/setup-db.ts` following ai-employee's `setup.ts` pattern:
    1. Check prerequisites: Docker, Docker Compose v2
    2. Stop Supabase CLI if running: `supabase stop` (prevents port conflicts)
    3. Ensure `docker/.env` exists (copy from `.env.example` if not)
    4. Check if nexus-stack's Docker Compose is already running: `docker compose -f docker/docker-compose.yml ps`
    5. If not running: `docker compose -f docker/docker-compose.yml up -d`
    6. Wait up to 120s for PostgREST health on port 55321
    7. Run Prisma migrations: `pnpm db:migrate` (this uses the existing `packages/database` workspace)
    8. Optionally seed: `pnpm db:seed`
    9. Health check: verify PostgREST on 55321 returns 200
    10. Print Studio URL: `http://localhost:55323`
  - Create `scripts/verify-supabase.ts` — Same structure as ai-employee's (Task 3), but checking ports 553xx
  - Update `package.json`:
    - Change `"supabase:start"` to: `"supabase:start": "tsx scripts/setup-db.ts"`
    - Change `"supabase:stop"` to: `"supabase:stop": "docker compose -f docker/docker-compose.yml down"`
    - Change `"supabase:reset"` to: `"supabase:reset": "docker compose -f docker/docker-compose.yml down -v && tsx scripts/setup-db.ts"`
    - Update `"db:setup:supabase"` to call the new script
    - Remove or update `"db:sync-keys"` — keys are now in `docker/.env`, not extracted from CLI
  - Update root `.env` and `.env.example`:
    - Change `DATABASE_URL` from `postgresql://postgres:postgres@127.0.0.1:54322/postgres` to `postgresql://postgres:postgres@127.0.0.1:55322/nexus_stack`
    - Change `SUPABASE_URL` from `http://127.0.0.1:54321` to `http://127.0.0.1:55321`
    - Update all Supabase key env vars to use the keys from `docker/.env.example`
  - Update `.env.supabase.local` with the same port/URL changes
  - Update `scripts/sync-supabase-keys.sh`:
    - Change from reading `supabase status` output to reading `docker/.env`
    - Extract JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY and write to root `.env`
  - Add comment to `supabase/config.toml`:
    ```toml
    # NOTE: This file is no longer used for local development.
    # Local Supabase runs via Docker Compose at docker/docker-compose.yml
    # This file is preserved for reference and for team members still using `supabase start`.
    ```
  - **Application docker-compose.yml** (the one with API/Web/Inngest/Redis): Do NOT modify. These app services are separate from Supabase infrastructure.

  **Must NOT do**:
  - Do NOT delete `supabase/config.toml`
  - Do NOT modify existing Prisma migration files
  - Do NOT modify application code (NestJS, Next.js)
  - Do NOT modify the application `docker-compose.yml` (API/Web/Inngest/Redis)
  - Do NOT use port range 543xx (that's ai-employee's range)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex migration from CLI to Docker Compose, multiple files across the monorepo, env var propagation via symlinks
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/setup.ts` — READ ENTIRE FILE. The template for `setup-db.ts`. Copy structure, logging, idempotent checks.
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/scripts/sync-supabase-keys.sh` — READ THIS. Understand current key extraction to replace source from CLI to Docker .env.
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/scripts/setup-env-links.sh` — READ THIS. The symlink pattern means updating root .env propagates to all apps.
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/package.json` — READ THIS. Find all supabase/db scripts to update.
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/.env` — Current env with `DATABASE_URL` pointing to `postgres` DB on port 54322. Must change to `nexus_stack` on 55322.
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/.env.example` — Template to update.
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/.env.supabase.local` — Preset to update.
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/supabase/config.toml` — Config to mark as inactive.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: setup-db.ts starts Supabase on nexus-stack ports
    Tool: Bash
    Preconditions: No nexus-stack Supabase running
    Steps:
      1. Run: `cd /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack && npx tsx scripts/setup-db.ts`
      2. Verify Kong on 55321: `curl -sf -o /dev/null -w "%{http_code}" http://localhost:55321/rest/v1/`
      3. Verify PostgreSQL on 55322: `psql postgresql://postgres:postgres@localhost:55322/nexus_stack -c "SELECT 1;" -t`
      4. Verify Studio on 55323: `curl -sf -o /dev/null -w "%{http_code}" http://localhost:55323`
    Expected Result: All services on 553xx ports, nexus_stack DB accessible
    Failure Indicators: Services on 543xx (ai-employee's range), or database name "postgres"
    Evidence: .sisyphus/evidence/task-4-nexus-start.txt

  Scenario: DATABASE_URL no longer references 'postgres' database or port 54322
    Tool: Bash
    Steps:
      1. Check .env: `grep 'DATABASE_URL' /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/.env | head -1`
      2. Check .env.example: `grep 'DATABASE_URL' /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/.env.example | head -1`
    Expected Result: Both show `55322/nexus_stack`, NOT `54322/postgres`
    Failure Indicators: Old port or database name present
    Evidence: .sisyphus/evidence/task-4-env-check.txt

  Scenario: Does not conflict with ai-employee running on 543xx
    Tool: Bash
    Preconditions: ai-employee Supabase already running on 543xx
    Steps:
      1. Start nexus-stack: `cd /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack && npx tsx scripts/setup-db.ts`
      2. Verify BOTH respond: `curl -sf http://localhost:54321/rest/v1/ && curl -sf http://localhost:55321/rest/v1/`
    Expected Result: Both Kong instances respond (54321 for ai-employee, 55321 for nexus-stack)
    Failure Indicators: Port conflict error, one stack fails to start
    Evidence: .sisyphus/evidence/task-4-no-conflict.txt
  ```

  **Commit**: YES
  - Message: `feat(infra): replace supabase start with Docker Compose`
  - Files: `docker/*`, `scripts/setup-db.ts`, `scripts/verify-supabase.ts`, `scripts/sync-supabase-keys.sh`, `package.json`, `.env`, `.env.example`, `.env.supabase.local`, `supabase/config.toml`

---

- [x] 5. Migrate vlre-hub from `supabase start` to Docker Compose

  **What to do**:
  - **IDENTICAL to Task 4 (nexus-stack)** but targeting vlre-hub with these differences:
    - Port range: 563xx (Kong 56321, PostgreSQL 56322, Studio 56323, etc.)
    - Database name: `vlre_hub` (underscore, NOT hyphen)
    - Docker Compose project name: `supabase-vlre-hub`
    - Repo path: `/Users/victordozal/repos/real-estate/vlre-hub`
  - Create `docker/` directory with: `docker-compose.yml` (identical template), `.env.example` (vlre-hub from Task 2), `volumes/db/vlre_hub_grants.sql` (from Task 2)
  - Create `scripts/setup-db.ts` and `scripts/verify-supabase.ts` (same pattern as nexus-stack)
  - Update `package.json`, `.env`, `.env.example` (same changes as nexus-stack but with vlre-hub ports/db name)
  - **ADDITIONAL**: Fix `supabase/config.toml`:
    - Change `project_id = "nexus-stack"` to `project_id = "vlre-hub"` (copy-paste bug fix)
    - Add "no longer used locally" comment
  - **DATABASE NAME CHANGE**: From `vlre-hub` (hyphen) to `vlre_hub` (underscore)
    - Update ALL env files: `.env`, `.env.example`, any `.env.supabase.local`
    - Hyphens in PostgreSQL database names require double-quoting everywhere — underscores are cleaner

  **Must NOT do**:
  - Same guardrails as Task 4
  - Do NOT use hyphenated database name `vlre-hub` — use `vlre_hub`
  - Do NOT use port range 543xx (ai-employee) or 553xx (nexus-stack)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Same complexity as Task 4, plus database name change from hyphen to underscore
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/setup.ts` — Same template as Task 4
  - `/Users/victordozal/repos/real-estate/vlre-hub/package.json` — READ THIS. Find Supabase-related scripts.
  - `/Users/victordozal/repos/real-estate/vlre-hub/supabase/config.toml` — READ THIS. Contains the `project_id = "nexus-stack"` bug to fix.
  - `/Users/victordozal/repos/real-estate/vlre-hub/.env` — Current env with `vlre-hub` DB name and port 54322.
  - `/Users/victordozal/repos/real-estate/vlre-hub/.env.example` — Template to update.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: setup-db.ts starts Supabase on vlre-hub ports
    Tool: Bash
    Steps:
      1. Run: `cd /Users/victordozal/repos/real-estate/vlre-hub && npx tsx scripts/setup-db.ts`
      2. Verify Kong on 56321: `curl -sf -o /dev/null -w "%{http_code}" http://localhost:56321/rest/v1/`
      3. Verify PostgreSQL on 56322: `psql postgresql://postgres:postgres@localhost:56322/vlre_hub -c "SELECT 1;" -t`
    Expected Result: Services on 563xx, vlre_hub DB (underscore) accessible
    Failure Indicators: Services on wrong ports, database name has hyphen
    Evidence: .sisyphus/evidence/task-5-vlre-start.txt

  Scenario: config.toml project_id is fixed
    Tool: Bash
    Steps:
      1. Check: `grep 'project_id' /Users/victordozal/repos/real-estate/vlre-hub/supabase/config.toml`
    Expected Result: `project_id = "vlre-hub"` (NOT "nexus-stack")
    Evidence: .sisyphus/evidence/task-5-config-fix.txt

  Scenario: No port conflicts with ai-employee and nexus-stack
    Tool: Bash
    Preconditions: ai-employee (543xx) and nexus-stack (553xx) already running
    Steps:
      1. Start vlre-hub: `cd /Users/victordozal/repos/real-estate/vlre-hub && npx tsx scripts/setup-db.ts`
      2. Verify all 3 respond: `for port in 54321 55321 56321; do curl -sf http://localhost:$port/rest/v1/ > /dev/null && echo "$port OK"; done`
    Expected Result: All 3 ports respond
    Evidence: .sisyphus/evidence/task-5-no-conflict.txt
  ```

  **Commit**: YES
  - Message: `feat(infra): replace supabase start with Docker Compose`
  - Files: `docker/*`, `scripts/setup-db.ts`, `scripts/verify-supabase.ts`, `package.json`, `.env`, `.env.example`, `supabase/config.toml`

---

- [x] 6. Migrate fetched-pets to full Supabase Docker Compose stack

  **What to do**:
  - Create `docker/` directory at `/Users/victordozal/repos/fetched-pets/pet-adoption-app/docker/`:
    - `docker-compose.yml` — Identical parameterized template from Task 1
    - `.env.example` — fetched-pets version from Task 2 (ports 573xx, POSTGRES_DB=fetched_pets)
    - `volumes/db/fetched_pets_grants.sql` — From Task 2
  - Create `scripts/setup-db.ts` following the same pattern as nexus-stack/vlre-hub (Task 4):
    - Same steps: prerequisites, stop CLI, start compose, wait for health, migrate, seed
    - **IMPORTANT**: Prisma is in `packages/database/`, so migration command is: `pnpm --filter database prisma migrate deploy`
    - Seed command: `pnpm --filter database prisma db seed`
  - Create `scripts/verify-supabase.ts` — checking ports 573xx
  - Update existing `docker-compose.yml` at repo root (`/Users/victordozal/repos/fetched-pets/pet-adoption-app/docker-compose.yml`):
    - **Remove the `db` service** (standalone PostgreSQL on port 5432)
    - **Remove the `postgres_data` volume** definition
    - **Remove the `fetched-pets-network`** if only the db service used it
    - If the file becomes empty (only had the db service), delete it entirely
    - **OR** if it had other services (check first!), keep those and only remove the PostgreSQL service
  - Update `.env.example` (root) and `apps/api/.env.example` and `packages/database/.env.example`:
    - Change `DATABASE_URL` from `postgresql://postgres:postgres@localhost:5432/fetched_pets` to `postgresql://postgres:postgres@localhost:57322/fetched_pets`
    - Update `NEXT_PUBLIC_SUPABASE_URL` from remote/empty to `http://localhost:57321`
    - Update `SUPABASE_SERVICE_ROLE_KEY` to match the key in `docker/.env.example`
  - Update `package.json`:
    - Change `"docker:up"` to: `"docker:up": "tsx scripts/setup-db.ts"`
    - Change `"docker:down"` to: `"docker:down": "docker compose -f docker/docker-compose.yml down"`
    - Change `"docker:reset"` to: `"docker:reset": "docker compose -f docker/docker-compose.yml down -v && tsx scripts/setup-db.ts"`
  - **Flag security issue**: Add a comment in the plan output noting that `scripts/supabase-users.sh` contains hardcoded production Supabase credentials — this is a separate security task.

  **Must NOT do**:
  - Do NOT migrate fetched-pets from Firebase auth to Supabase auth in application code
  - Do NOT modify existing Prisma migration files
  - Do NOT modify the `old/` legacy directory
  - Do NOT fix `scripts/supabase-users.sh` credentials (out of scope)
  - Do NOT use port range 543xx, 553xx, or 563xx

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex migration — from standalone PostgreSQL to full Supabase stack, Turborepo monorepo with filter syntax, multiple env files to update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/setup.ts` — Template for setup-db.ts
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/docker-compose.yml` — READ THIS. The standalone PostgreSQL service to remove.
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/package.json` — READ THIS. Find docker:up/down/reset scripts.
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/.env.example` — Current env with port 5432.
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/apps/api/.env.example` — API env vars.
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/packages/database/.env.example` — Database package env vars.
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/packages/database/prisma/schema.prisma` — Verify datasource uses `env("DATABASE_URL")`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full Supabase stack starts on fetched-pets ports
    Tool: Bash
    Steps:
      1. Run: `cd /Users/victordozal/repos/fetched-pets/pet-adoption-app && npx tsx scripts/setup-db.ts`
      2. Verify Kong on 57321: `curl -sf -o /dev/null -w "%{http_code}" http://localhost:57321/rest/v1/`
      3. Verify PostgreSQL on 57322: `psql postgresql://postgres:postgres@localhost:57322/fetched_pets -c "SELECT 1;" -t`
      4. Verify Auth endpoint: `curl -sf -o /dev/null -w "%{http_code}" http://localhost:57321/auth/v1/health`
      5. Verify Storage endpoint: `curl -sf -o /dev/null -w "%{http_code}" http://localhost:57321/storage/v1/`
    Expected Result: All services on 573xx, Auth and Storage endpoints respond
    Failure Indicators: Services on port 5432 (old), Auth/Storage not available
    Evidence: .sisyphus/evidence/task-6-fetched-pets-start.txt

  Scenario: Standalone PostgreSQL service removed
    Tool: Bash
    Steps:
      1. Check root docker-compose.yml: `grep -c 'image:.*postgres' /Users/victordozal/repos/fetched-pets/pet-adoption-app/docker-compose.yml 2>/dev/null || echo "file removed"`
    Expected Result: 0 matches or "file removed"
    Failure Indicators: Standalone PostgreSQL service still defined
    Evidence: .sisyphus/evidence/task-6-standalone-removed.txt

  Scenario: All 4 stacks run simultaneously
    Tool: Bash
    Preconditions: ai-employee (543xx), nexus-stack (553xx), vlre-hub (563xx) already running
    Steps:
      1. Start fetched-pets: already started above
      2. Verify all 4: `for port in 54321 55321 56321 57321; do curl -sf http://localhost:$port/rest/v1/ > /dev/null && echo "$port OK"; done`
    Expected Result: All 4 ports respond with "OK"
    Evidence: .sisyphus/evidence/task-6-all-four.txt
  ```

  **Commit**: YES
  - Message: `feat(infra): add full Supabase Docker Compose stack`
  - Files: `docker/*`, `scripts/setup-db.ts`, `scripts/verify-supabase.ts`, `docker-compose.yml` (modified/removed), `package.json`, `.env.example`, `apps/api/.env.example`, `packages/database/.env.example`

---

- [x] 7. E2E verification — all 4 stacks running simultaneously

  **What to do**:
  - Perform a clean-room test of the complete infrastructure:
    1. Stop ALL running Supabase stacks: `docker compose -f ... down` for each repo
    2. Remove ALL volumes: `docker volume rm` for each project's volume
    3. Start each repo's setup script in sequence (not parallel — setup scripts do `docker compose up -d` which takes time):
       - ai-employee: `cd /Users/victordozal/repos/dozal-devs/ai-employee && npx tsx scripts/setup.ts`
       - nexus-stack: `cd /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack && npx tsx scripts/setup-db.ts`
       - vlre-hub: `cd /Users/victordozal/repos/real-estate/vlre-hub && npx tsx scripts/setup-db.ts`
       - fetched-pets: `cd /Users/victordozal/repos/fetched-pets/pet-adoption-app && npx tsx scripts/setup-db.ts`
    4. Verify ALL 4 are running simultaneously:
       - Kong responds on: 54321, 55321, 56321, 57321
       - PostgreSQL responds on: 54322, 55322, 56322, 57322
       - Studio responds on: 54323, 55323, 56323, 57323
       - Each database has correct name
    5. Run each repo's verification script
    6. Run ai-employee regression tests: `pnpm test -- --run`
    7. Test idempotency: run each setup script again (should be no-op)
    8. Verify Docker Compose templates are identical: `diff` the compose files across repos (excluding project name line)

  **Must NOT do**:
  - Do NOT skip any repo's verification
  - Do NOT proceed if any check fails

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Sequential verification across 4 repos, evidence capture, regression testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 3, 4, 5, 6

  **References**:
  - Each repo's setup script (Tasks 3-6)
  - Each repo's verification script (Tasks 3-6)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 stacks start from scratch and run simultaneously
    Tool: Bash
    Steps:
      1-4. (As described in "What to do" above)
      5. Count responding Kong instances: `for port in 54321 55321 56321 57321; do curl -sf http://localhost:$port/rest/v1/ > /dev/null && echo "$port OK"; done | wc -l`
    Expected Result: 4 (all ports respond)
    Evidence: .sisyphus/evidence/task-7-simultaneous.txt

  Scenario: Docker Compose templates are identical across repos
    Tool: Bash
    Steps:
      1. Compare (excluding project name): `diff <(sed '/^name:/d' /Users/victordozal/repos/dozal-devs/ai-employee/docker/docker-compose.yml) <(sed '/^name:/d' /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/docker/docker-compose.yml)`
      2. Repeat for vlre-hub and fetched-pets
    Expected Result: No differences (files are identical except `name:` line)
    Evidence: .sisyphus/evidence/task-7-template-identical.txt

  Scenario: Idempotency — setup scripts run twice without error
    Tool: Bash
    Steps:
      1. Run each setup script a second time
      2. All exit 0, show "already running" messages
    Expected Result: No errors, no duplicate containers
    Evidence: .sisyphus/evidence/task-7-idempotency.txt
  ```

  **Commit**: NO (verification only)

---

- [x] 8. Documentation — template guide + per-repo docs

  **What to do**:
  - Create a documentation file in EACH repo explaining the Supabase infrastructure. Use each repo's documentation convention (check if they have a `docs/` dir or just README):
    - **Content for each repo's doc** (adapt to repo context):
      1. **Overview**: This repo uses Docker Compose for local Supabase (not `supabase start`). The docker-compose.yml template is shared across all projects.
      2. **Quick Start**: `pnpm setup` (or equivalent) → everything works
      3. **Port Allocation**: This project's ports (e.g., 553xx for nexus-stack) and the full port table showing all projects
      4. **Adding a New Project**: How to choose a port range, create .env.example, create grants.sql, create setup script
      5. **Known Limitations**: Each project runs its own full Supabase stack (~14 containers). Running all projects simultaneously uses ~56 containers.
      6. **Troubleshooting**: Port already in use, services not starting, database doesn't exist
  - **Flag security issue in fetched-pets doc**: Note that `scripts/supabase-users.sh` contains hardcoded production Supabase credentials. This needs credential rotation (separate task).

  **Must NOT do**:
  - Do NOT include AI tool references
  - Do NOT include production credentials in documentation

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3, after Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:
  - This plan file — contains all architectural decisions, port tables, and constraints to document
  - Each repo's existing README and docs convention

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Each repo has Supabase infrastructure documentation
    Tool: Bash
    Steps:
      1. Verify docs exist in all 4 repos (check for file containing "Docker Compose" and "Supabase")
      2. Verify port allocation table is present in each
      3. Verify "Adding a New Project" section exists
    Expected Result: All 4 repos have documentation with required sections
    Evidence: .sisyphus/evidence/task-8-docs-check.txt
  ```

  **Commit**: YES (per-repo)
  - Message: `docs(infra): add Supabase infrastructure guide`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Verify Docker Compose files in all 4 repos are byte-identical (only .env differs). Check evidence files exist. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run linters on any new TypeScript files. Review all changed files for: hardcoded ports (should use env vars), missing error handling in scripts, shell script portability. Verify no port conflicts in the port allocation table. Check for AI slop: excessive comments, over-abstraction.
      Output: `Scripts [N clean/N issues] | Config [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start all 4 Supabase stacks simultaneously. Verify each project's Kong responds on its assigned port. Create a row in each database via PostgREST. Verify no cross-project interference. Stop one stack, verify others keep running. Cold start test for each repo individually. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Simultaneous [PASS/FAIL] | Isolation [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual changes. Verify Docker Compose files are identical across repos (diff them). Verify no shared external dependencies. Verify ai-employee's tests still pass. Verify no Prisma migrations altered. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Guardrails [N/N respected] | VERDICT`

---

## Commit Strategy

Each commit is per-repo and independently valid:

- **Commit 1** (ai-employee): `feat(infra): parameterize Docker Compose ports for multi-project support` — Updated docker-compose.yml, .env.example, setup.ts, dev-start.ts, verification script
- **Commit 2** (nexus-stack): `feat(infra): replace supabase start with Docker Compose` — New docker/ dir with compose + .env, new setup-db.ts, updated package.json, .env files
- **Commit 3** (vlre-hub): `feat(infra): replace supabase start with Docker Compose` — Same as nexus-stack, plus config.toml project_id fix
- **Commit 4** (fetched-pets): `feat(infra): add full Supabase Docker Compose stack` — New docker/ dir, new setup-db.ts, removed standalone PostgreSQL, updated .env files
- **Commit 5** (each repo): `docs(infra): add Supabase infrastructure guide` — Per-repo documentation

---

## Success Criteria

### Verification Commands

```bash
# All 4 stacks running simultaneously — check Kong on each port
curl -s -o /dev/null -w "%{http_code}" http://localhost:54321/rest/v1/  # ai-employee → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:55321/rest/v1/  # nexus-stack → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:56321/rest/v1/  # vlre-hub → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:57321/rest/v1/  # fetched-pets → 200

# Each PostgreSQL has correct database
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT 1;"   # → success
psql postgresql://postgres:postgres@localhost:55322/nexus_stack -c "SELECT 1;"   # → success
psql postgresql://postgres:postgres@localhost:56322/vlre_hub -c "SELECT 1;"      # → success
psql postgresql://postgres:postgres@localhost:57322/fetched_pets -c "SELECT 1;"  # → success

# No port conflicts (all 4 Kongs respond independently)
for port in 54321 55321 56321 57321; do curl -sf http://localhost:$port/rest/v1/ > /dev/null && echo "$port OK"; done
# → 4 "OK" lines

# ai-employee tests still pass (regression)
cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm test -- --run
# → 515+ tests passing

# Docker Compose templates are identical across repos
diff <(grep -v '^name:' /Users/victordozal/repos/dozal-devs/ai-employee/docker/docker-compose.yml) \
     <(grep -v '^name:' /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/docker/docker-compose.yml)
# → no differences (only .env and project name differ)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All 4 Supabase stacks start and run simultaneously
- [ ] Docker Compose template is identical across repos
- [ ] Each repo's setup is self-contained (no external dependencies)
- [ ] New developer can clone any single repo and `pnpm setup` works
- [ ] ai-employee regression tests pass
