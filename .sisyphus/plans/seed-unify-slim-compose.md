# Unified Seed Command + Slim Docker Compose

## TL;DR

> **Quick Summary**: Make `pnpm supabase:start` (or `pnpm setup`) the single command that starts infra, migrates, generates Prisma client, seeds auth users, and seeds app data. Remove unused Docker Compose containers per repo (keep only what's needed + studio).
>
> **Deliverables**:
>
> - Unified setup commands in all 4 repos
> - Slim docker-compose.yml files (5–7 services instead of 14)
> - New auth seed for fetched-pets (seed-auth.sh + supabase/seed.sql)
> - Simplified retry loop in setup scripts (no more analytics workaround)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (ai-employee compose) → T5 (ai-employee verify) → T9 (full E2E)

---

## Context

### Original Request

User noticed vlre-hub requires running `pnpm db:seed` and `pnpm db:seed:auth` separately after `pnpm supabase:start`. Wants a single command pattern across all repos. Also wants unused Docker containers removed.

### Interview Summary

**Key Decisions**:

- `supabase:start` / `pnpm setup` becomes the one-stop command (infra + migrate + generate + seed)
- fetched-pets gets a new auth seed (seed-auth.sh + supabase/seed.sql)
- Keep studio + meta in all repos. Remove analytics, vector, supavisor, imgproxy, functions, realtime.

**Research Findings**:

- All 4 repos use identical docker-compose.yml (only ports differ)
- analytics is the sole cause of 2–4 minute startup delays and OOM kills
- storage depends on imgproxy (must unwire before removing)
- studio depends on analytics (must unwire before removing)
- fetched-pets `supabase-users.sh` is a production admin tool, NOT a local seed script
- nexus/vlre already have `db:setup:supabase` that does everything — but `supabase:start` doesn't call it

### Metis Review

**Key Risks Addressed**:

- storage → imgproxy dependency must be unwired (3 changes: remove depends_on, set ENABLE_IMAGE_TRANSFORMATION=false, remove IMGPROXY_URL)
- studio → analytics dependency must be unwired (2 changes: remove depends_on, set NEXT_PUBLIC_ENABLE_LOGS=false)
- After removing analytics, the 8×30s retry loop in setup scripts becomes dead code — must simplify
- fetched-pets uses npm, not pnpm — unified command syntax differs

---

## Work Objectives

### Core Objective

Single `pnpm supabase:start` (or `pnpm setup`) command per repo that delivers a fully working local environment. Remove unnecessary Docker containers.

### Concrete Deliverables

- 4 updated `docker/docker-compose.yml` files (slim)
- 4 updated setup scripts (unified seed)
- 1 new `scripts/seed-auth.sh` + `supabase/seed.sql` for fetched-pets
- 4 simplified retry loops

### Definition of Done

- [ ] Each repo: `docker compose down -v && pnpm supabase:start` exits 0 with auth users and app data seeded
- [ ] Each repo: removed services do NOT appear in `docker compose ps`
- [ ] Each repo: Studio accessible at its port
- [ ] Startup time under 90 seconds (no more 4-minute analytics waits)

### Must Have

- Unified setup command in each repo (one command does everything)
- analytics, vector, supavisor, imgproxy, functions, realtime removed from all compose files
- storage → imgproxy dependency unwired where storage is kept
- studio → analytics dependency unwired in all repos
- Simplified retry loop (no more analytics-specific workaround)
- Auth seed for fetched-pets
- Existing seed scripts still work standalone (`pnpm db:seed`, `pnpm db:seed:auth`)

### Must NOT Have (Guardrails)

- DO NOT touch `volumes/db/logs.sql` — leave analytics DB init scripts in place (harmless)
- DO NOT remove `LOGFLARE_*` vars from `docker/.env.example` — leave them
- DO NOT migrate fetched-pets from npm to pnpm
- DO NOT modify any nexus-stack worktree other than the main one
- DO NOT touch `supabase:reset` / `docker:reset` commands
- DO NOT modify seed data content — only wiring and orchestration
- DO NOT modify `sync-supabase-keys.sh` internal logic — only call it from the right place
- DO NOT combine compose changes with script changes in the same commit

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision

- **Automated tests**: NO — infrastructure scripts
- **QA Policy**: Agent runs each repo's unified command from scratch, verifies exit 0, checks DB state

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Slim compose files — all 4 repos in parallel):
├── Task 1: ai-employee — slim docker-compose.yml [quick]
├── Task 2: nexus-stack — slim docker-compose.yml [quick]
├── Task 3: vlre-hub — slim docker-compose.yml [quick]
└── Task 4: fetched-pets — slim docker-compose.yml + create auth seed files [unspecified-high]

Wave 2 (Unified setup scripts — all 4 repos in parallel):
├── Task 5: ai-employee — simplify retry loop [quick]
├── Task 6: nexus-stack — unify supabase:start + simplify retry [unspecified-high]
├── Task 7: vlre-hub — unify supabase:start + simplify retry [unspecified-high]
└── Task 8: fetched-pets — unify docker:up + simplify retry [unspecified-high]

Wave 3 (Full E2E verification — sequential per repo):
└── Task 9: ALL repos — docker compose down -v, then unified command, verify [deep]

Wave FINAL:
├── F1: Plan compliance audit [oracle]
└── F2: Scope fidelity check [deep]
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | -          | T5, T9 | 1    |
| T2   | -          | T6, T9 | 1    |
| T3   | -          | T7, T9 | 1    |
| T4   | -          | T8, T9 | 1    |
| T5   | T1         | T9     | 2    |
| T6   | T2         | T9     | 2    |
| T7   | T3         | T9     | 2    |
| T8   | T4         | T9     | 2    |
| T9   | T5-T8      | F1, F2 | 3    |

---

## TODOs

- [x] 1. ai-employee — Slim docker-compose.yml

  **What to do**:
  - Remove these services from `docker/docker-compose.yml`: `analytics`, `vector`, `supavisor`, `imgproxy`, `functions`, `realtime`
  - Keep: `db`, `kong`, `rest`, `studio`, `meta`, `auth` (keep auth even though unused — low overhead, consistent pattern)
  - In `studio` service: remove `depends_on.analytics` block, set `NEXT_PUBLIC_ENABLE_LOGS: "false"`
  - Remove `storage` service (ai-employee doesn't use it). Since storage depends on imgproxy, removing both is clean.
  - In `kong` service: if it depends on `studio` which depends on `analytics`, update the chain. Kong should depend on `auth` and `rest` directly, not studio.
  - Add `--remove-orphans` documentation comment at top of compose file
  - Run `docker compose -f docker/docker-compose.yml config --services` to verify only kept services appear

  **Must NOT do**:
  - Do NOT touch `volumes/db/logs.sql`
  - Do NOT remove `LOGFLARE_*` vars from `docker/.env.example`
  - Do NOT change port numbers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T5, T9
  - **Blocked By**: None

  **References**:
  - `docker/docker-compose.yml` — the file to edit
  - `docker/.env` — port variables (read only, don't modify)
  - Dependency chain: `analytics → studio → kong → functions`. After removal: `db → auth, rest, meta; studio (no analytics dep); kong (depends on auth, rest, studio)`

  **Acceptance Criteria**:
  - [ ] `docker compose -f docker/docker-compose.yml config --services` lists only: db, kong, rest, studio, meta, auth
  - [ ] `docker compose -f docker/docker-compose.yml up -d` starts all services without error
  - [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost:54321/rest/v1/` returns non-000
  - [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost:54323/` returns 200 (Studio)

  **QA Scenarios**:

  ```
  Scenario: Slim compose starts cleanly
    Tool: Bash
    Steps:
      1. docker compose -f docker/docker-compose.yml down -v
      2. docker compose -f docker/docker-compose.yml up -d
      3. Wait 30s for services to stabilize
      4. docker compose -f docker/docker-compose.yml ps
      5. curl -s -o /dev/null -w "%{http_code}" http://localhost:54321/rest/v1/
    Expected Result: All listed services running/healthy, Kong returns HTTP response
    Evidence: .sisyphus/evidence/task-1-slim-compose.txt
  ```

  **Commit**: YES
  - Message: `chore(infra): remove unused services from docker compose`
  - Files: `docker/docker-compose.yml`

- [x] 2. nexus-stack — Slim docker-compose.yml

  **What to do**:
  - Remove: `analytics`, `vector`, `supavisor`, `imgproxy`, `functions`, `realtime`
  - Keep: `db`, `kong`, `auth`, `rest`, `storage`, `studio`, `meta`
  - In `studio`: remove `depends_on.analytics`, set `NEXT_PUBLIC_ENABLE_LOGS: "false"`
  - In `storage`: remove `depends_on.imgproxy`, set `ENABLE_IMAGE_TRANSFORMATION: "false"`, remove `IMGPROXY_URL` env var
  - Fix kong dependency chain (remove indirect analytics dependency)

  **Must NOT do**: Same guardrails as T1. Also: do NOT modify any nexus-stack worktree other than the main one.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 1 (with T1, T3, T4)
  - **Blocks**: T6, T9
  - **Blocked By**: None

  **References**:
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/docker/docker-compose.yml`
  - Kong port: 55321, DB port: 55322, Studio port: 55323

  **Acceptance Criteria**:
  - [ ] `docker compose config --services` lists: db, kong, auth, rest, storage, studio, meta
  - [ ] `docker compose up -d` succeeds
  - [ ] Kong responds, Studio loads

  **QA Scenarios**: Same pattern as T1 with nexus-stack ports.

  **Commit**: YES — `chore(infra): remove unused services from docker compose`

- [x] 3. vlre-hub — Slim docker-compose.yml

  **What to do**: Same as T2 (identical changes, different port range).
  - Remove: `analytics`, `vector`, `supavisor`, `imgproxy`, `functions`, `realtime`
  - Keep: `db`, `kong`, `auth`, `rest`, `storage`, `studio`, `meta`
  - Same unwiring: studio→analytics, storage→imgproxy

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 1 (with T1, T2, T4)
  - **Blocks**: T7, T9

  **References**:
  - `/Users/victordozal/repos/real-estate/vlre-hub/docker/docker-compose.yml`
  - Kong: 56321, DB: 56322, Studio: 56323

  **Commit**: YES — `chore(infra): remove unused services from docker compose`

- [x] 4. fetched-pets — Slim docker-compose.yml + create auth seed

  **What to do** (TWO parts):

  **Part A — Slim compose**:
  - Remove: `analytics`, `vector`, `supavisor`, `imgproxy`, `functions`, `realtime`, `storage` (storage not confirmed used)
  - Keep: `db`, `kong`, `auth`, `rest`, `studio`, `meta`
  - Same unwiring as T1

  **Part B — Create auth seed files**:
  - Create `scripts/seed-auth.sh` — bash script that runs `supabase/seed.sql` against DATABASE_URL (copy pattern from nexus-stack/vlre-hub, adjust for npm project)
  - Create `supabase/seed.sql` — SQL to create test users in auth.users. Same users as nexus/vlre: owner@example.com (ADMIN), admin@example.com (MANAGER), user@example.com (USER), viewer@example.com (USER). All with password `TestPassword123!`. Use `ON CONFLICT (id) DO UPDATE` for idempotency.
  - Add `db:seed:auth` script to package.json: `"db:seed:auth": "./scripts/seed-auth.sh"`
  - `chmod +x scripts/seed-auth.sh`
  - NOTE: fetched-pets uses different roles than nexus/vlre (ADMIN, MANAGER, USER — not PLATFORM_OWNER, ADMIN, EDITOR, USER, VIEWER). Check the Prisma schema for the actual Role enum.
  - NOTE: `scripts/supabase-users.sh` is a PRODUCTION admin tool with hardcoded cloud credentials — do NOT modify or reuse it.

  **Recommended Agent Profile**: `unspecified-high`

  **Parallelization**: Wave 1 (with T1, T2, T3)
  - **Blocks**: T8, T9

  **References**:
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/docker/docker-compose.yml`
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/scripts/seed-auth.sh` — reference pattern
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/supabase/seed.sql` — reference SQL pattern
  - `/Users/victordozal/repos/fetched-pets/pet-adoption-app/packages/database/prisma/schema.prisma` — check Role enum
  - Kong: 57321, DB: 57322, Studio: 57323

  **Commit**: YES (2 commits)
  - Commit A: `chore(infra): remove unused services from docker compose`
  - Commit B: `feat(infra): create auth seed for local development`

- [x] 5. ai-employee — Simplify setup.ts retry loop

  **What to do**:
  - In `scripts/setup.ts`, replace the 8×30s retry-compose-up loop with a simpler pattern:
    1. Run `docker compose up -d` once (with `.nothrow()`)
    2. Poll Kong health every 5s for up to 60s (not 30s intervals, not 240s total)
    3. If Kong responds, proceed. No retry of `docker compose up -d`.
  - Remove the comment about "Logflare (analytics) takes time to stabilize"
  - ai-employee's setup.ts already includes seed — no seed changes needed

  **Must NOT do**: Do NOT change the migration retry logic (3 attempts, 5s delay — that stays)

  **Recommended Agent Profile**: `quick`

  **Parallelization**: Wave 2 (with T6, T7, T8)
  - **Blocks**: T9
  - **Blocked By**: T1

  **References**: `/Users/victordozal/repos/dozal-devs/ai-employee/scripts/setup.ts`

  **Acceptance Criteria**:
  - [ ] No mention of "analytics" or "Logflare" in setup.ts
  - [ ] Retry loop polls every 5s (not 30s) for max 60s (not 240s)
  - [ ] Only ONE `docker compose up -d` call (no retry of compose itself)
  - [ ] `pnpm setup` exits 0 when services already running

  **Commit**: YES — `chore(setup): simplify startup after removing analytics`

- [x] 6. nexus-stack — Unify supabase:start + simplify retry

  **What to do**:
  - In `scripts/setup-db.ts`, after Step 4 (migrations), add new steps:
    - Step 5: `pnpm db:sync-keys` — sync Supabase keys from docker/.env to root .env
    - Step 6: `pnpm db:generate` — regenerate Prisma client
    - Step 7: `pnpm db:seed:auth` — seed auth users (idempotent, safe to re-run)
    - Step 8: `pnpm db:seed` — seed app data (idempotent)
  - Each step: try/catch, ok/fail logging, same pattern as existing steps
  - Simplify the compose retry loop (same as T5 — poll every 5s for 60s, single compose up)
  - Update the "Next steps" output at the end to remove "run db:setup:supabase"
  - The existing `db:setup:supabase` script in package.json can stay (backward compat) but `supabase:start` now does the same thing

  **Must NOT do**: Do NOT modify `sync-supabase-keys.sh` internal logic

  **Recommended Agent Profile**: `unspecified-high`

  **Parallelization**: Wave 2 (with T5, T7, T8)
  - **Blocks**: T9
  - **Blocked By**: T2

  **References**:
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/scripts/setup-db.ts`
  - Current health check step is Step 5 — new steps become 5, 6, 7, 8 (renumber)

  **Acceptance Criteria**:
  - [ ] `pnpm supabase:start` from scratch: exit 0, auth users seeded, app data seeded
  - [ ] `docker exec supabase-nexus-stack-db-1 psql -U postgres -d nexus_stack -c "SELECT count(*) FROM auth.users;"` returns ≥5
  - [ ] Retry loop uses 5s intervals, 60s max, single compose up

  **Commit**: YES — `chore(setup): unify supabase:start to include seed and key sync`

- [x] 7. vlre-hub — Unify supabase:start + simplify retry

  **What to do**: Same as T6 but for vlre-hub.
  - Add sync-keys, generate, seed-auth, seed steps to setup-db.ts
  - Simplify compose retry loop
  - Update "Next steps" output

  **Recommended Agent Profile**: `unspecified-high`

  **Parallelization**: Wave 2 (with T5, T6, T8)
  - **Blocks**: T9
  - **Blocked By**: T3

  **References**: `/Users/victordozal/repos/real-estate/vlre-hub/scripts/setup-db.ts`

  **Commit**: YES — `chore(setup): unify supabase:start to include seed and key sync`

- [x] 8. fetched-pets — Unify docker:up + simplify retry

  **What to do**: Same concept as T6/T7 but for fetched-pets (uses npm).
  - In `scripts/setup-db.ts`, after migrations, add:
    - Step 5: Sync keys (read from docker/.env, write to root .env — inline logic since fetched-pets may not have sync-supabase-keys.sh)
    - Step 6: Generate Prisma client (`npm run db:generate` or `npx prisma generate --schema packages/database/prisma/schema.prisma`)
    - Step 7: Seed auth (`./scripts/seed-auth.sh` created in T4)
    - Step 8: Seed app data (`npm run db:seed`)
  - Simplify compose retry loop (same pattern as T5)
  - NOTE: fetched-pets uses `npm`, not `pnpm`. All commands must use `npm run` or `npx`.

  **Recommended Agent Profile**: `unspecified-high`

  **Parallelization**: Wave 2 (with T5, T6, T7)
  - **Blocks**: T9
  - **Blocked By**: T4

  **References**: `/Users/victordozal/repos/fetched-pets/pet-adoption-app/scripts/setup-db.ts`

  **Commit**: YES — `chore(setup): unify docker:up to include seed and key sync`

- [x] 9. ALL repos — Full E2E verification from scratch

  **What to do**:
  - For EACH repo (sequential to avoid port conflicts):
    1. `docker compose -f docker/docker-compose.yml down -v`
    2. Run unified command (`pnpm setup` / `pnpm supabase:start` / `npm run docker:up`)
    3. Verify: exit 0, services running, Studio loads, auth users exist (where applicable), app data exists
    4. Time the startup — should be under 90 seconds
    5. Run unified command AGAIN to verify idempotency

  **Must NOT do**: Do NOT modify any files. Verification only.

  **Recommended Agent Profile**: `deep`

  **Parallelization**: Sequential (one repo at a time)
  - **Blocks**: F1, F2
  - **Blocked By**: T5, T6, T7, T8

  **References**: All 4 repos

  **Acceptance Criteria**:
  - [ ] ai-employee: `pnpm setup` exit 0, Kong responds, Studio loads, <90s
  - [ ] nexus-stack: `pnpm supabase:start` exit 0, auth users ≥5, Studio loads, <90s
  - [ ] vlre-hub: `pnpm supabase:start` exit 0, auth users ≥5, app data seeded, Studio loads, <90s
  - [ ] fetched-pets: `npm run docker:up` exit 0, auth users ≥1, Studio loads, <90s
  - [ ] All 4: second run exits 0 (idempotent)

  **QA Scenarios**:

  ```
  Scenario: vlre-hub fresh start with unified command
    Tool: Bash (timeout: 120s)
    Steps:
      1. cd /Users/victordozal/repos/real-estate/vlre-hub
      2. docker compose -f docker/docker-compose.yml down -v
      3. time pnpm supabase:start
      4. docker exec supabase-vlre-hub-db-1 psql -U postgres -d vlre_hub -c "SELECT count(*) FROM auth.users;"
      5. docker exec supabase-vlre-hub-db-1 psql -U postgres -d vlre_hub -c "SELECT count(*) FROM properties;"
      6. curl -s -o /dev/null -w "%{http_code}" http://localhost:56323/
    Expected Result: exit 0, auth users ≥5, properties ≥40, Studio HTTP 200, <90s
    Evidence: .sisyphus/evidence/task-9-vlre-hub-unified.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 2 review agents run in PARALLEL. ALL must APPROVE.

- [x] F1. **Plan Compliance Audit** — `oracle`
      For each Must Have: verify implementation exists. For each Must NOT Have: search for forbidden patterns.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Scope Fidelity Check** — `deep`
      For each task: read diff, verify 1:1 compliance. Check no compose changes mixed with script changes in same commit.
      Output: `Tasks [N/N compliant] | Guardrails [N/N respected] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

Per repo, per concern (never mix compose + script in one commit):

- Commit A: `chore(infra): remove unused services from docker compose`
- Commit B: `chore(setup): unify supabase:start to include seed and key sync`
- Commit C (fetched-pets only): `feat(infra): create auth seed for local development`

---

## Success Criteria

### Verification Commands

```bash
# Per repo (sequential):
docker compose -f docker/docker-compose.yml down -v
pnpm supabase:start  # (or pnpm setup for ai-employee, npm run docker:up for fetched-pets)
# Expected: exit 0, <90 seconds

# Verify services
docker compose -f docker/docker-compose.yml config --services
# Expected: NO analytics, vector, supavisor, imgproxy, functions, realtime

# Verify Studio
curl -s -o /dev/null -w "%{http_code}" http://localhost:{STUDIO_PORT}/
# Expected: 200

# Verify auth users (nexus/vlre/fetched-pets)
docker exec supabase-{PROJECT}-db-1 psql -U postgres -d {DB} -c "SELECT count(*) FROM auth.users;"
# Expected: >= 5
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All 4 repos pass unified command from scratch
