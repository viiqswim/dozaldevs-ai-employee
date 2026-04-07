# Supabase Infrastructure — Documentation Cleanup & Replication Guide

## TL;DR

> **Quick Summary**: Fix all stale Supabase references across 4 repositories after the Docker Compose migration. Update documentation, scripts, source code, and test files to use correct ports, database names, and commands. Add an AI-agent-ready replication guide to each repo.
>
> **Deliverables**:
>
> - All stale `supabase start` CLI references replaced with Docker Compose equivalents
> - vlre-hub: 53+ files migrated from ports 543xx → 563xx and database `vlre-hub` → `vlre_hub`
> - fetched-pets: docs migrated from port 5432 → 57322 and old container name removed
> - Historical docs get deprecation headers (not rewritten)
> - AI-agent replication guide (≤50 lines) added to each repo's infrastructure doc
> - Final grep verification: zero stale references remain
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (vlre-hub audit) → Task 2 (vlre-hub bulk replace) → Tasks 3-6 (parallel per-repo) → Task 7 (verification)

---

## Context

### Original Request

User wants granular documentation tasks to ensure all 4 repos accurately reflect the new Docker Compose Supabase infrastructure. Must include replication guide for AI agents and removal of all stale references.

### What Changed (Prior Plan)

Each repo was migrated to a self-contained Docker Compose Supabase stack with unique port ranges:

- ai-employee: 543xx (Kong 54321, PG 54322)
- nexus-stack: 553xx (Kong 55321, PG 55322)
- vlre-hub: 563xx (Kong 56321, PG 56322)
- fetched-pets: 573xx (Kong 57321, PG 57322)

### Audit Findings

| Repo         | Stale Files | Key Issues                                                   |
| ------------ | ----------- | ------------------------------------------------------------ |
| ai-employee  | 7           | Shell scripts + 5 docs reference `supabase start/status`     |
| nexus-stack  | 6           | Docs with old ports (54321→55321) + `supabase start`         |
| vlre-hub     | **53+**     | Source code, tests, scripts, docs — all hardcode 54321/54322 |
| fetched-pets | 10          | Docs reference port 5432, old container `fetched-pets-db`    |

### Metis Review Key Points

- Historical docs (pre-migration) get deprecation HEADERS, not rewrites
- vlre-hub bulk replacement needs dry-run audit first (edge cases: bare numbers, lock files, env var interpolation)
- Port `5432` in fetched-pets: only replace in context (`:5432/` or `localhost:5432`), never bare
- Replication guide must be ≤50 lines, commands-only, no narrative
- Exclude `node_modules/`, `pnpm-lock.yaml`, `.prisma/` from all replacements

---

## Work Objectives

### Core Objective

Eliminate ALL stale Supabase infrastructure references across 4 repos and add replication guides for AI agents.

### Definition of Done

- [ ] `grep -r "supabase start" {repo}/scripts {repo}/docs --include="*.sh" --include="*.md"` returns 0 matches (or only inside "DO NOT use" warnings) for all 4 repos
- [ ] `grep -rn "54321\|54322\|54323\|54324" vlre-hub/apps vlre-hub/packages vlre-hub/scripts vlre-hub/e2e --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sh"` returns 0 matches
- [ ] `grep "fetched-pets-db\|localhost:5432[^2]" fetched-pets/docs fetched-pets/scripts --include="*.md" --include="*.sh"` returns 0 matches
- [ ] Each repo's infrastructure doc has a "Replication Guide" section ≤50 lines
- [ ] All historical docs have deprecation headers

### Must Have

- Deprecation headers on all pre-migration historical docs
- All `supabase start/status` CLI references updated to Docker Compose equivalents
- vlre-hub ports 54321→56321, 54322→56322, 54323→56323, 54324→56324 across ALL file types
- vlre-hub database name `vlre-hub`→`vlre_hub` in all connection strings
- fetched-pets port 5432→57322 in docs/scripts (context-aware, not bare replacement)
- fetched-pets container name `fetched-pets-db` removed from all docs
- Replication guide in each repo's `docs/*-supabase-infrastructure.md`
- Final grep sweep proving zero stale references

### Must NOT Have (Guardrails)

- **DO NOT rewrite historical doc content** — only add deprecation headers
- **DO NOT modify Prisma migration files** under any circumstances
- **DO NOT replace bare `5432` in fetched-pets** — only `localhost:5432` or `:5432/`
- **DO NOT modify `node_modules/`, `pnpm-lock.yaml`, `.prisma/` generated files**
- **DO NOT change shell script exit codes or output format** — only update check mechanisms
- **DO NOT touch files confirmed as accurate** (README.md, AGENTS.md, new infra docs in repos where they're already correct)
- **DO NOT create replication guides longer than 50 lines**
- **DO NOT combine port changes with database name changes in the same commit** (independently revertable)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### QA Policy

Every task ends with a grep verification command proving zero stale references remain for that scope.
Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.txt`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — vlre-hub audit + bulk replace, highest risk):
├── Task 1: vlre-hub dry-run audit — confirm all 53+ files [quick]
├── Task 2: vlre-hub bulk port replacement (54321→56321 etc.) [deep]
├── Task 3: vlre-hub database name replacement (vlre-hub→vlre_hub) [quick]

Wave 2 (After Wave 1 — per-repo updates, MAX PARALLEL):
├── Task 4: ai-employee — shell scripts + docs + deprecation headers (depends: —) [unspecified-high]
├── Task 5: nexus-stack — docs port updates + deprecation headers (depends: —) [unspecified-high]
├── Task 6: vlre-hub — docs updates + deprecation headers (depends: 2, 3) [unspecified-high]
├── Task 7: fetched-pets — docs + scripts + database-cli-guide rewrite (depends: —) [unspecified-high]

Wave 3 (After Wave 2 — replication guides + final verification):
├── Task 8: Add replication guide to all 4 repos' infra docs (depends: 4-7) [writing]
├── Task 9: Final verification sweep — grep all repos for stale refs (depends: 8) [unspecified-high]

Wave FINAL:
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2      | 1    |
| 2    | 1          | 6      | 1    |
| 3    | 1          | 6      | 1    |
| 4    | —          | 8      | 2    |
| 5    | —          | 8      | 2    |
| 6    | 2, 3       | 8      | 2    |
| 7    | —          | 8      | 2    |
| 8    | 4-7        | 9      | 3    |
| 9    | 8          | F1-F2  | 3    |

---

## TODOs

- [x] 1. vlre-hub dry-run audit — confirm all stale files

  **What to do**:
  - Run comprehensive grep across the vlre-hub repository to produce a CONFIRMED list of every file containing stale port references (54321, 54322, 54323, 54324) or stale database name (`vlre-hub` with hyphen)
  - Search patterns:

    ```bash
    cd /Users/victordozal/repos/real-estate/vlre-hub
    # Ports in source/test/script files (excluding node_modules, .prisma, lock files)
    grep -rn "54321\|54322\|54323\|54324" apps/ packages/ scripts/ e2e/ tools/ --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sh" --include="*.sql" --include="*.exs" | grep -v node_modules | grep -v ".prisma" | grep -v "pnpm-lock"

    # Ports in documentation
    grep -rn "54321\|54322\|54323\|54324" docs/ *.md --include="*.md" --include="*.mdx"

    # Database name with hyphen in all files
    grep -rn "vlre-hub" apps/ packages/ scripts/ docs/ e2e/ --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sh" --include="*.md" --include="*.env*" | grep -v node_modules | grep -v "COMPOSE_PROJECT_NAME\|supabase-vlre-hub\|project_id" | grep -v ".git/"
    ```

  - For EACH match, categorize:
    - **PORT in connection string**: `localhost:54322` → `localhost:56322` (safe to replace)
    - **PORT in URL**: `http://localhost:54321` → `http://localhost:56321` (safe to replace)
    - **PORT in config/test**: `port: 54322` → `port: 56322` (safe to replace)
    - **BARE NUMBER**: `54321` not in port context → DO NOT REPLACE (false positive)
    - **DATABASE NAME**: `vlre-hub` as database → `vlre_hub` (safe to replace)
    - **PROJECT NAME**: `vlre-hub` as project identifier → KEEP (e.g., `COMPOSE_PROJECT_NAME=supabase-vlre-hub`)
  - Save the confirmed file list with line numbers and replacement categorization to `.sisyphus/evidence/task-1-vlre-hub-audit.txt`
  - Also verify: `docker/.env.example` already has correct 563xx ports (should be confirmed from prior plan)

  **Must NOT do**:
  - Do NOT modify any files — this is audit only
  - Do NOT include `node_modules/`, `pnpm-lock.yaml`, `.prisma/` in the audit

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References**:
  - `/Users/victordozal/repos/real-estate/vlre-hub/docker/.env.example` — Verify 563xx ports are already set
  - `/Users/victordozal/repos/real-estate/vlre-hub/docker/.env` — Verify actual running config

  **Acceptance Criteria**:

  ```
  Scenario: Audit produces confirmed file list
    Tool: Bash
    Steps:
      1. Run all grep commands above
      2. Count total matches
      3. Categorize each into safe-replace vs false-positive
    Expected Result: File list saved to evidence with 40+ confirmed replacements
    Evidence: .sisyphus/evidence/task-1-vlre-hub-audit.txt
  ```

  **Commit**: NO (audit only)

---

- [x] 2. vlre-hub bulk port replacement (54321→56321, 54322→56322, etc.)

  **What to do**:
  - Using the confirmed file list from Task 1, replace all stale port references across vlre-hub
  - Replacement map:
    - `54321` → `56321` (Kong/API)
    - `54322` → `56322` (PostgreSQL)
    - `54323` → `56323` (Studio)
    - `54324` → `56324` (Inbucket SMTP)
    - `54325` → `56325` (Inbucket Web)
  - **CRITICAL REPLACEMENT RULES**:
    - Only replace when the number appears as a PORT (in a URL, connection string, port config, or env var value)
    - SKIP bare numbers that aren't ports (ticket numbers, timeouts, test assertions)
    - SKIP comments in `supabase/config.toml` (file is already marked inactive)
    - SKIP `docker/.env.example` and `docker/.env` (already correct from prior plan)
    - SKIP `docs/2026-04-03-1251-supabase-infrastructure.md` (already correct — it shows the full port table)
  - Files to update (from audit, confirmed categories):
    - **Package.json**: `test:integration:setup` script (line 44)
    - **Shell scripts**: `pre-push-check.sh`, `worktree/verify.sh`, `worktree/setup.sh`, `worktree/cleanup.sh`, `worktree/env-template.sh`, `reset-setup.sh`, `setup-web-env-local.sh`, `sync-supabase-keys.sh`
    - **Test files**: `apps/api/src/config/__tests__/env.test.ts`, `apps/api/src/supabase/__tests__/supabase.service.test.ts`, `apps/api/src/supabase/supabase.service.integration.test.ts`, `packages/database/src/testing/global-setup.ts`, `packages/database/vitest.config.ts`
    - **E2E**: `e2e/playwright.config.ts`, `e2e/test-suites/helpers/storage.ts`, `e2e/test-suites/helpers/supabase-admin.ts`, `e2e/test-suites/storage-rls.spec.ts`
    - **Source code**: `apps/api/src/config/env.ts`, `apps/web/src/components/setup/setup-guide-content.tsx`, `apps/web/src/middleware.ts`, `apps/web/src/app/examples/auth-email-hook/page.tsx`, `apps/web/src/lib/features/roadmap-data-*.ts`, `apps/web/content/blog/getting-started.mdx`
    - **Documentation**: `docs/LOCAL_DEVELOPMENT.md`, `docs/QUICKSTART.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/SUPABASE_DEPLOYMENT.md`, `docs/2026-02-26-0233-ENV_VARS_REFERENCE.md`, `docs/2026-02-23-1928-feature-inventory.md`, `docs/2026-02-23-2112-feature-comparison.md`, `docs/2026-02-16-1555-entity-preferences-system-overview.md`, `docs/features/2026-03-04-1422-auth-email-hook.md`, `docs/improvements/*`, `AGENTS.md`, `apps/api/AGENTS.md`, `packages/database/AGENTS.md`, `tools/fly-worker/README.md`
    - **SQL scripts**: `scripts/cleanup-rotation-duplicates.sql`
  - After replacement, verify: `grep -rn "54321\|54322\|54323\|54324" apps/ packages/ scripts/ e2e/ tools/ --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sh" --include="*.sql" | grep -v node_modules | grep -v ".prisma" | grep -v "pnpm-lock"` → 0 matches
  - Commit in vlre-hub repo

  **Must NOT do**:
  - Do NOT replace bare numbers that aren't ports
  - Do NOT modify `docker/.env.example`, `docker/.env`, `docker/docker-compose.yml` (already correct)
  - Do NOT modify `docs/2026-04-03-1251-supabase-infrastructure.md` (already correct)
  - Do NOT modify Prisma migration files
  - Do NOT modify `node_modules/`, `pnpm-lock.yaml`, `.prisma/`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after Task 1)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:
  - `.sisyphus/evidence/task-1-vlre-hub-audit.txt` — The confirmed file list from Task 1
  - All files listed above — read before modifying

  **Acceptance Criteria**:

  ```
  Scenario: Zero old ports remain in source/test/script files
    Tool: Bash
    Steps:
      1. grep -rn "54321\|54322\|54323\|54324" /Users/victordozal/repos/real-estate/vlre-hub/apps /Users/victordozal/repos/real-estate/vlre-hub/packages /Users/victordozal/repos/real-estate/vlre-hub/scripts /Users/victordozal/repos/real-estate/vlre-hub/e2e /Users/victordozal/repos/real-estate/vlre-hub/tools --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sh" --include="*.sql" | grep -v node_modules | grep -v ".prisma" | grep -v "pnpm-lock" | wc -l
    Expected Result: 0
    Evidence: .sisyphus/evidence/task-2-vlre-hub-ports.txt
  ```

  **Commit**: YES
  - Message: `chore: bulk replace ports 54321→56321, 54322→56322 across all files`

---

- [x] 3. vlre-hub database name replacement (vlre-hub → vlre_hub)

  **What to do**:
  - Replace stale database name `vlre-hub` (with hyphen) with `vlre_hub` (with underscore) in connection strings, env references, and documentation
  - **ONLY replace when `vlre-hub` refers to the DATABASE NAME** — NOT when it's a project name, Docker Compose project name, or directory name
  - Safe to replace: `postgresql://...@localhost:56322/vlre-hub` → `postgresql://...@localhost:56322/vlre_hub`
  - Do NOT replace: `COMPOSE_PROJECT_NAME=supabase-vlre-hub` (this is the Docker project name, hyphens are fine)
  - Do NOT replace: `project_id = "vlre-hub"` in `supabase/config.toml` (this is the Supabase project ID)
  - After replacement, verify no stale database name refs remain
  - Commit in vlre-hub repo

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2 if audit is done)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **Acceptance Criteria**:

  ```
  Scenario: No stale database name in connection strings
    Tool: Bash
    Steps:
      1. grep -rn "vlre-hub" /Users/victordozal/repos/real-estate/vlre-hub/ --include="*.ts" --include="*.env*" --include="*.md" | grep -v node_modules | grep -v "supabase-vlre-hub\|COMPOSE_PROJECT_NAME\|project_id\|docker-compose\|supabase/config" | grep -i "database\|postgres\|psql\|DATABASE_URL\|/vlre-hub" | wc -l
    Expected Result: 0
    Evidence: .sisyphus/evidence/task-3-vlre-hub-dbname.txt
  ```

  **Commit**: YES
  - Message: `chore: replace database name vlre-hub→vlre_hub in connection strings`

---

- [x] 4. ai-employee — shell scripts + docs + deprecation headers

  **What to do**:
  - **Shell scripts** (2 files):
    - `scripts/verify-phase1.sh` (lines 41-44): Replace `supabase status` check with Docker Compose health check: `docker compose -f docker/docker-compose.yml ps --format json | grep -q '"running"'`
    - `scripts/verify-container-boot.sh` (line 71): Replace error message `"Run: supabase start"` with `"Run: pnpm setup or docker compose -f docker/docker-compose.yml up -d"`
  - **Deprecation headers** on historical docs (5 files):
    - `docs/2026-03-22-2317-ai-employee-architecture.md` — Add at top: `> ⚠️ **Historical Document**: This doc predates the Docker Compose migration (April 2026). For current Supabase setup, see [docs/2026-04-03-1251-supabase-infrastructure.md](2026-04-03-1251-supabase-infrastructure.md).`
    - `docs/2026-03-25-1901-mvp-implementation-phases.md` — Same deprecation header
    - `docs/2026-03-28-1902-phase4-execution-infra.md` — Same header
    - `docs/2026-04-01-2110-troubleshooting.md` — Update the port conflict section (lines 111-117) to clarify this is handled automatically by `pnpm setup`
    - `docs/2026-04-01-1726-system-overview.md` — Update line 381 from `supabase status` to `docker/.env`
  - Commit in ai-employee repo

  **Must NOT do**:
  - Do NOT rewrite historical doc content (only add deprecation header at top)
  - Do NOT change shell script exit codes or output format
  - Do NOT touch README.md or AGENTS.md (already accurate)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/verify-phase1.sh` — Lines 41-44
  - `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/verify-container-boot.sh` — Line 71
  - All 5 docs files listed above

  **Acceptance Criteria**:

  ```
  Scenario: No stale supabase CLI refs in scripts
    Tool: Bash
    Steps:
      1. grep -n "supabase status\|supabase start" /Users/victordozal/repos/dozal-devs/ai-employee/scripts/verify-phase1.sh /Users/victordozal/repos/dozal-devs/ai-employee/scripts/verify-container-boot.sh | grep -v "supabase stop\|#.*deprecated\|NOT\|never" | wc -l
    Expected Result: 0
    Evidence: .sisyphus/evidence/task-4-ai-employee.txt

  Scenario: Historical docs have deprecation headers
    Tool: Bash
    Steps:
      1. grep -c "Historical Document\|predates.*Docker Compose" /Users/victordozal/repos/dozal-devs/ai-employee/docs/2026-03-22-2317-ai-employee-architecture.md /Users/victordozal/repos/dozal-devs/ai-employee/docs/2026-03-25-1901-mvp-implementation-phases.md /Users/victordozal/repos/dozal-devs/ai-employee/docs/2026-03-28-1902-phase4-execution-infra.md
    Expected Result: 3 (one per file)
    Evidence: .sisyphus/evidence/task-4-deprecation-headers.txt
  ```

  **Commit**: YES (2 commits)
  - C1: `fix: update verify scripts to use Docker Compose health checks`
  - C2: `docs: add deprecation headers to pre-migration architecture docs`

---

- [x] 5. nexus-stack — docs port updates + deprecation headers

  **What to do**:
  - **Update docs with stale ports** (ports 54321→55321, 54322→55322, 54323→55323, 54324→55324):
    - `docs/LOCAL_DEVELOPMENT.md` (lines 9, 63-66, 72-75): All port references
    - `docs/features/2026-03-11-1804-e2e-testing-ci.md` (lines 65, 77, 85, 198): `supabase start` + old ports + database `postgres`→`nexus_stack`
    - `docs/2026-03-05-1530-fly-dispatch-workflow-summary.md` (line 147): `supabase start`→`pnpm supabase:start`
    - `docs/2026-02-23-1928-feature-inventory.md` (line 357): `supabase start`→Docker Compose
    - `tools/fly-worker/README.md` (line 521): `supabase start`→Docker Compose
    - `tools/fly-worker/entrypoint.sh` (lines 332, 345): Update log messages from `supabase start` to `Docker Compose`
  - **Deprecation headers** on historical docs (pre-migration):
    - `docs/2026-02-23-1928-feature-inventory.md` — Add header
    - `docs/2026-03-05-1530-fly-dispatch-workflow-summary.md` — Add header
    - `docs/features/2026-03-11-1804-e2e-testing-ci.md` — Add header
  - Commit in nexus-stack repo

  **Must NOT do**:
  - Do NOT touch README.md, AGENTS.md, package.json (already correct)
  - Do NOT touch `docs/2026-04-03-1251-supabase-infrastructure.md` (already correct)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - All files listed above — read before modifying

  **Acceptance Criteria**:

  ```
  Scenario: No stale ports in nexus-stack docs
    Tool: Bash
    Steps:
      1. grep -rn "54321\|54322\|54323\|54324" /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/docs/ --include="*.md" | grep -v "supabase-infrastructure\|supabase/config\|ai-employee\|ai_employee" | wc -l
    Expected Result: 0 (or only in cross-project reference tables)
    Evidence: .sisyphus/evidence/task-5-nexus-stack.txt
  ```

  **Commit**: YES
  - Message: `docs: replace stale supabase start refs and update ports to 553xx range`

---

- [x] 6. vlre-hub — docs updates + deprecation headers

  **What to do**:
  - After Tasks 2 and 3 have replaced ports and database names in source/test/script files, update DOCUMENTATION files:
    - `AGENTS.md` (lines 130-131): Update port table to 563xx range
    - `apps/api/AGENTS.md`: Update port and database references
    - `packages/database/AGENTS.md`: Update port reference
    - `docs/LOCAL_DEVELOPMENT.md`: Update all port references (already done by Task 2 grep, verify)
    - `docs/2026-02-26-0233-ENV_VARS_REFERENCE.md`: Update port references
    - `docs/SUPABASE_DEPLOYMENT.md`: Update port references
    - `docs/QUICKSTART.md`: Update port reference
    - `docs/DEVELOPMENT_WORKFLOW.md`: Update port reference
    - `docs/features/2026-03-04-1422-auth-email-hook.md`: Update port references
  - **Deprecation headers** on historical/improvement docs:
    - `docs/improvements/2026-02-26-1935-decouple-auth-email.md` — Add header
    - `docs/improvements/2026-02-21-0132-best-practices-audit.md` — Add header
    - `docs/improvements/2026-02-24-0027-ai-agent-metadata-system.md` — Add header
  - Also update `docs/LOCAL_DEVELOPMENT.md` line 91 if it still uses old port (verify Task 2 didn't already fix this)
  - Commit in vlre-hub repo

  **Must NOT do**:
  - Do NOT touch `docs/2026-04-03-1251-supabase-infrastructure.md` (already correct)
  - Do NOT rewrite historical content — only add deprecation headers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (after Tasks 2, 3)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 2, 3

  **Acceptance Criteria**:

  ```
  Scenario: Zero stale ports in vlre-hub docs
    Tool: Bash
    Steps:
      1. grep -rn "54321\|54322\|54323\|54324" /Users/victordozal/repos/real-estate/vlre-hub/docs/ /Users/victordozal/repos/real-estate/vlre-hub/AGENTS.md --include="*.md" | grep -v "supabase-infrastructure\|supabase/config\|ai-employee\|ai_employee\|nexus-stack\|fetched-pets" | wc -l
    Expected Result: 0
    Evidence: .sisyphus/evidence/task-6-vlre-hub-docs.txt
  ```

  **Commit**: YES
  - Message: `docs: update stale Supabase references and add deprecation headers`

---

- [x] 7. fetched-pets — docs + scripts + database-cli-guide rewrite

  **What to do**:
  - **README.md** (`/Users/victordozal/repos/fetched-pets/pet-adoption-app/README.md`):
    - Line 52: `DATABASE_URL` port 5432→57322
    - Line 66: "Expose it on `localhost:5432`" → "Expose it on `localhost:57322`"
    - Line 127: "Port: 5432" → "Port: 57322"
    - Lines 64-66: "Start a PostgreSQL 16 container" → "Start Supabase Docker Compose stack (14 services)"
  - **docs/database-cli-guide.md** — REWRITE entire file:
    - Replace all `docker exec -it fetched-pets-db psql` → `docker compose -f docker/docker-compose.yml exec db psql`
    - Replace all port 5432 → 57322
    - Update connection string: `postgresql://postgres:postgres@localhost:57322/fetched_pets`
    - Update Docker log command: `docker compose -f docker/docker-compose.yml logs db`
    - Add note that Supabase Studio (http://localhost:57323) provides a GUI alternative to CLI
  - **scripts/docker-up.sh**: Update comment from "Start the PostgreSQL database container" to "Start Supabase Docker Compose stack". Update `docker compose` command to use `-f docker/docker-compose.yml`.
  - **scripts/db-console.sh**: Replace `docker exec -it fetched-pets-db psql` with `docker compose -f docker/docker-compose.yml exec db psql`
  - **apps/docs/AUTH_ARCHITECTURE.md** (line 1597): Update example connection string port
  - Commit in fetched-pets repo

  **Must NOT do**:
  - Do NOT replace bare `5432` — only `localhost:5432`, `:5432/`, or `Port: 5432`
  - Do NOT touch `docs/2026-04-03-1251-supabase-infrastructure.md` (already correct)
  - Do NOT fix `scripts/supabase-users.sh` credentials (out of scope — security task)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - All files listed above — read before modifying

  **Acceptance Criteria**:

  ```
  Scenario: No stale container name or port in docs/scripts
    Tool: Bash
    Steps:
      1. grep -rn "fetched-pets-db\|localhost:5432[^2]" /Users/victordozal/repos/fetched-pets/pet-adoption-app/docs /Users/victordozal/repos/fetched-pets/pet-adoption-app/scripts --include="*.md" --include="*.sh" | wc -l
    Expected Result: 0
    Evidence: .sisyphus/evidence/task-7-fetched-pets.txt
  ```

  **Commit**: YES (2 commits)
  - C1: `docs: rewrite database-cli-guide and update README for Docker Compose Supabase`
  - C2: `fix: update scripts to use Docker Compose commands`

---

- [x] 8. Add AI agent replication guide to all 4 repos

  **What to do**:
  - In EACH repo's infrastructure doc (`docs/2026-04-03-1251-supabase-infrastructure.md`), add a new section called **"Replicating This System for a New Repository"** at the end, before any existing footer.
  - The guide must be ≤50 lines, structured as commands-only, no narrative. It targets an AI agent (or developer) who wants to copy this exact Docker Compose Supabase pattern to a new project.
  - Template (adapt port examples per repo):

  ```markdown
  ## Replicating This System for a New Repository

  ### Step 1: Choose port range

  Pick the next available `5{N}3xx` range. Current allocations:
  | Project | Range | Kong | PostgreSQL | Studio |
  |---------|-------|------|-----------|--------|
  | ai-employee | 543xx | 54321 | 54322 | 54323 |
  | nexus-stack | 553xx | 55321 | 55322 | 55323 |
  | vlre-hub | 563xx | 56321 | 56322 | 56323 |
  | fetched-pets | 573xx | 57321 | 57322 | 57323 |
  | **next project** | **583xx** | **58321** | **58322** | **58323** |

  ### Step 2: Copy docker/ directory

  Copy the entire `docker/` directory from any existing repo to your new project.

  ### Step 3: Configure .env.example

  Update `docker/.env.example`:
  ```

  COMPOSE_PROJECT_NAME=supabase-{your-project}
  POSTGRES_DB={your_database_name}
  KONG_HTTP_PORT_HOST={your_kong_port}
  KONG_HTTPS_PORT_HOST={your_https_port}
  POSTGRES_PORT_HOST={your_pg_port}
  STUDIO_PORT_HOST={your_studio_port}
  INBUCKET_SMTP_PORT_HOST={your_inbucket_smtp}
  INBUCKET_WEB_PORT_HOST={your_inbucket_web}
  POOLER_PORT_HOST={your_pooler_port}
  ANALYTICS_PORT_HOST={your_analytics_port}

  ````

  ### Step 4: Create grants SQL
  Copy `docker/volumes/db/{existing}_grants.sql` → `docker/volumes/db/{your_db}_grants.sql`.
  Replace all occurrences of the old database name with yours.

  ### Step 5: Create setup script
  Copy `scripts/setup-db.ts` from any repo. Update:
  - Kong health check URL port
  - Database name in migration command
  - Project title in log output

  ### Step 6: Update project env
  Set `DATABASE_URL=postgresql://postgres:postgres@localhost:{your_pg_port}/{your_db}` in `.env.example`.
  Set `SUPABASE_URL=http://localhost:{your_kong_port}`.

  ### Step 7: Verify
  ```bash
  cp docker/.env.example docker/.env
  docker compose -f docker/docker-compose.yml up -d
  # Wait ~2 minutes for all services
  curl -s http://localhost:{your_kong_port}/rest/v1/  # Should return 401
  psql postgresql://postgres:postgres@localhost:{your_pg_port}/{your_db} -c "SELECT 1;"
  ````

  ### Hard constraints
  - NEVER use `supabase start` — it hardcodes the database as `postgres`
  - NEVER share port ranges between projects
  - ALWAYS use underscore in database names (not hyphens)
  - ALWAYS commit `docker/.env.example` but NEVER commit `docker/.env`

  ```

  - Add this section to ALL 4 repos' infrastructure docs
  - Commit each repo separately

  **Must NOT do**:
  - Do NOT exceed 50 lines for the replication section
  - Do NOT include narrative explanations (commands only)
  - Do NOT create a separate file — add to existing infrastructure doc

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (after Wave 2)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 4, 5, 6, 7

  **Acceptance Criteria**:
  ```

  Scenario: All 4 repos have replication guide
  Tool: Bash
  Steps: 1. for repo in /Users/victordozal/repos/dozal-devs/ai-employee /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack /Users/victordozal/repos/real-estate/vlre-hub /Users/victordozal/repos/fetched-pets/pet-adoption-app; do
  grep -c "Replicating This System" "$repo"/docs/\*supabase-infrastructure.md
  done
  Expected Result: 1 for each repo (4 total)
  Evidence: .sisyphus/evidence/task-8-replication-guides.txt

  Scenario: Guide is ≤50 lines
  Tool: Bash
  Steps: 1. For each repo, count lines from "Replicating" to end of section
  Expected Result: ≤50 lines each
  Evidence: .sisyphus/evidence/task-8-line-count.txt

  ```

  **Commit**: YES (per repo)
  - Message: `docs: add AI agent replication guide to Supabase infrastructure doc`
  ```

---

- [x] 9. Final verification sweep — grep all repos for stale refs

  **What to do**:
  - Run comprehensive grep across ALL 4 repos to confirm zero stale references remain
  - Verification commands:

    ```bash
    # vlre-hub: zero old ports in non-doc files
    grep -rn "54321\|54322\|54323\|54324" /Users/victordozal/repos/real-estate/vlre-hub/apps /Users/victordozal/repos/real-estate/vlre-hub/packages /Users/victordozal/repos/real-estate/vlre-hub/scripts /Users/victordozal/repos/real-estate/vlre-hub/e2e --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sh" | grep -v node_modules | grep -v ".prisma" | wc -l

    # fetched-pets: zero old container name or port
    grep -rn "fetched-pets-db\|localhost:5432[^2]" /Users/victordozal/repos/fetched-pets/pet-adoption-app/docs /Users/victordozal/repos/fetched-pets/pet-adoption-app/scripts --include="*.md" --include="*.sh" | wc -l

    # All repos: supabase start only in "do not use" context
    for repo in ...; do grep count; done

    # All repos: replication guide present
    for repo in ...; do grep "Replicating This System"; done
    ```

  - Save ALL verification output as evidence
  - If ANY stale reference found: fix it before marking complete

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final step)
  - **Blocks**: F1, F2
  - **Blocked By**: Task 8

  **Acceptance Criteria**:

  ```
  Scenario: All verification commands return 0 stale refs
    Tool: Bash
    Steps: Run all verification commands from Success Criteria section
    Expected Result: 0 matches for each
    Evidence: .sisyphus/evidence/task-9-final-sweep.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY)

- [x] F1. **Plan Compliance Audit** — `oracle`
      For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Verify grep results show zero stale references across all repos.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT`

- [x] F2. **Scope Fidelity Check** — `deep`
      Verify no Prisma migrations modified. Verify historical docs have headers (not rewrites). Verify replication guides are ≤50 lines. Verify no lock files or node_modules were touched.
      Output: `Tasks [N/N compliant] | Guardrails [N/N respected] | VERDICT`

---

## Commit Strategy

Each commit is per-repo and represents one logical change type:

- **vlre-hub C1**: `chore: bulk replace ports 54321→56321, 54322→56322 across all files`
- **vlre-hub C2**: `chore: replace database name vlre-hub→vlre_hub in connection strings`
- **vlre-hub C3**: `docs: update stale Supabase references and add deprecation headers`
- **ai-employee C1**: `fix: update verify scripts to use Docker Compose health checks`
- **ai-employee C2**: `docs: add deprecation headers to pre-migration docs`
- **nexus-stack C1**: `docs: replace stale supabase start refs with Docker Compose`
- **fetched-pets C1**: `docs: rewrite database-cli-guide for Docker Compose Supabase`
- **fetched-pets C2**: `fix: update scripts to use Docker Compose commands`
- **All repos C**: `docs: add AI agent replication guide to infrastructure doc`

---

## Success Criteria

### Verification Commands

```bash
# vlre-hub: zero old ports in source/test/script files
grep -rn "54321\|54322\|54323\|54324" /Users/victordozal/repos/real-estate/vlre-hub/apps /Users/victordozal/repos/real-estate/vlre-hub/packages /Users/victordozal/repos/real-estate/vlre-hub/scripts /Users/victordozal/repos/real-estate/vlre-hub/e2e --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sh" | grep -v node_modules | grep -v ".prisma" | wc -l
# Expected: 0

# fetched-pets: zero old container name or port
grep -rn "fetched-pets-db\|localhost:5432[^2]" /Users/victordozal/repos/fetched-pets/pet-adoption-app/docs /Users/victordozal/repos/fetched-pets/pet-adoption-app/scripts --include="*.md" --include="*.sh" | wc -l
# Expected: 0

# All repos: supabase start only appears in "do not use" context
for repo in /Users/victordozal/repos/dozal-devs/ai-employee /Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack /Users/victordozal/repos/real-estate/vlre-hub /Users/victordozal/repos/fetched-pets/pet-adoption-app; do
  count=$(grep -rn "supabase start" "$repo/scripts" "$repo/docs" --include="*.sh" --include="*.md" 2>/dev/null | grep -v "NOT\|never\|no longer\|instead\|deprecated\|DO NOT\|don't" | wc -l)
  echo "$(basename $repo): $count stale refs"
done
# Expected: 0 for each
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Zero stale port references in vlre-hub source/tests
- [ ] Zero stale container names in fetched-pets docs
- [ ] Replication guide in each repo's infra doc (≤50 lines each)
- [ ] Historical docs have deprecation headers
