# Production Deployment — user-auth-orgs + Resend + PLATFORM_OWNER

## TL;DR

> **Quick Summary**: Production is currently broken — the last two Render deploys `build_failed`, so the merged auth/orgs/invitations feature never went live and prod runs pre-auth code. This runbook fixes the build break, provisions the cloud (DB migration + Supabase/Resend env vars), redeploys, and bootstraps the `victor@dozaldevs.com` PLATFORM_OWNER so the feature works end-to-end.
>
> **Deliverables**:
>
> - Fixed `Dockerfile.gateway` (husky/prune build break) → green Render build
> - `users` / `tenant_memberships` / `tenant_invitations` tables live in cloud Supabase with RLS
> - Render env vars provisioned (SUPABASE\_\*, INNGEST, then Resend) without wiping existing secrets
> - Healthy redeployed gateway with populated `/api/config.js` and re-synced Inngest app
> - `victor@dozaldevs.com` as PLATFORM_OWNER (password `Test1234!`) able to log in
> - Working invitation → email → accept flow via Resend (Phase B, after DNS verification)
> - Updated docs resolving the cloud migration-method conflict
>
> **Estimated Effort**: Large (production, multi-system, includes user-action gates + DNS wait)
> **Parallel Execution**: NO — strictly sequential critical path. Production deploys have hard ordering dependencies; each step gates the next. Two phases (A = deploy+login now, B = email after DNS).
> **Critical Path**: A1 build fix → A2 build green → A3 creds → A4 probe → A5 migrate → A7 env PUT → A8 redeploy → A10 seed owner → A11 login ✓ ‖ B1 Resend DNS → B2 env → B3 invite E2E → B4 docs

---

## Context

### Original Request

Deploy all latest changes (user auth / orgs / invitations) to production: handle DB migrations, create a PLATFORM_OWNER `victor@dozaldevs.com`, set up Resend so invitations work, and anything else needed.

### Investigation Summary (confirmed read-only)

- **Production is BROKEN**: last 2 Render deploys both `build_failed` (the PR #9 auth-orgs merge `0ca7ce74`, and a prior hardening commit). Last LIVE deploy is `2026-06-07` — predates ALL auth work. **The merge to main never reached production; prod runs old pre-auth code.**
- **Build failure root cause** (reproduced locally): `Dockerfile.gateway` line 34 `RUN pnpm prune --prod` re-fires the `prepare`→`husky` lifecycle script (`package.json` line 48), but husky (a devDep) was just pruned → `sh: husky: not found` → exit 1. Note: line 18 install already uses `--ignore-scripts`; prune does not reliably honor it. Robust fix = `ENV HUSKY=0` (husky v9 respects it).
- **Cloud never provisioned for auth**: Render has NO `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SECRET_KEY` → `/api/config.js` returns empty → dashboard login impossible + no CLOUD JWT verification.
- **Email not configured**: Render has NO `RESEND_API_KEY`/`EMAIL_FROM`/`DASHBOARD_BASE_URL` → email falls back to nonexistent SMTP/Mailpit → invitations fail.
- **Migration `20260609000000_add_user_auth_rbac`** (3 tables, 2 enums, 4 FKs, RLS enable, 3 service_role policies) almost certainly NOT applied to cloud.
- **Stale**: Render still has `ADMIN_API_KEY` (removed from code in T24) and a duplicate `GATEWAY_URL` alongside `GATEWAY_PUBLIC_URL`.
- **Inngest**: live gateway reports `functionCount: 0` — needs re-sync after a healthy deploy.
- **Dashboard config resolution** (`dashboard/src/lib/constants.ts`): reads runtime `__RUNTIME_CONFIG__` FIRST, then baked `VITE_*`, then localhost. → Setting Render runtime env is SUFFICIENT for login; no Docker VITE build args needed.

### Cloud Facts

- Project ref: `gjqrysxpvktmibpkwrvy` (us-west-2). JWKS: `https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/.well-known/jwks.json`.
- Cloud pooler is reportedly IPv6-only → may be unreachable from local Mac; auth guide says apply migrations via Supabase dashboard SQL Editor.
- Render service ID `srv-d8f1b2gg4nts738dj7jg`; live URL `https://ai-employees-laaa.onrender.com`. Service created manually → `render.yaml` NOT authoritative; configure via Render API.
- Tenant IDs: DozalDevs `00000000-0000-0000-0000-000000000002`, VLRE `00000000-0000-0000-0000-000000000003`.

### Metis Review (gaps addressed)

- Build fix corrected to `ENV HUSKY=0` (verify locally, don't guess).
- Migration SQL is NOT idempotent → re-run aborts on duplicate `CREATE TYPE`; recovery = DROP CASCADE then re-run. AC verifies 3 tables + 2 enums + 4 FKs + 3 policies + RLS=on.
- Owner seed Prisma path needs cloud DB reach → explicit SQL-Editor fallback written.
- FK precondition: cloud `tenants` must contain both IDs before seeding → verify gate.
- Env PUT: save current full list to file (rollback artifact), PUT, re-GET, assert every pre-existing secret survived.
- `tenant_secrets` RLS: explicit AC — anon key cannot read it.
- JWT profile: ANON must be `sb_publishable_*` AND URL `https://...supabase.co` together or boot crashes.
- Inngest re-sync strictly AFTER health gate.

### Decisions (confirmed with user)

- Migration: probe connectivity first, expect SQL Editor fallback.
- Resend: full setup from scratch; sending domain = **subdomain `send.dozaldevs.com`**; `EMAIL_FROM = DozalDevs <noreply@send.dozaldevs.com>`.
- Owner password: **`Test1234!` only, no rotation** (user explicitly accepts the risk — do NOT add a rotation task).
- Sequencing: **SPLIT** — Phase A (deploy + owner login) now; Phase B (Resend + invite E2E) after DNS verifies.
- Delivery: written runbook → `/start-work`.

---

## Work Objectives

### Core Objective

Make the merged user-auth-orgs feature fully operational in production: green build, migrated cloud DB, provisioned env, healthy gateway, a working PLATFORM_OWNER login, and (Phase B) a working invitation email flow.

### Concrete Deliverables

- `Dockerfile.gateway` build fix committed to `main`
- Auth-rbac schema present in cloud Supabase (verified)
- Render env vars: SUPABASE\_\*, INNGEST_DEV, RESEND_API_KEY, EMAIL_FROM, DASHBOARD_BASE_URL set; ADMIN_API_KEY removed; all prior secrets preserved
- `victor@dozaldevs.com` = PLATFORM_OWNER with OWNER memberships in both tenants
- Documented final production state + resolved migration-method doc conflict

### Definition of Done

- [ ] Render latest deploy `status: live` on the build-fix commit
- [ ] `curl https://ai-employees-laaa.onrender.com/api/inngest` → functions > 0
- [ ] `/api/config.js` returns non-empty SUPABASE*URL + `sb_publishable*` anon key
- [ ] Playwright login as `victor@dozaldevs.com` → `/me` returns `globalRole: PLATFORM_OWNER`
- [ ] (Phase B) Invitation → email arrives → accept → membership row created

### Must Have

- Local `docker build -f Dockerfile.gateway` exits 0 with no `husky: not found`
- Every pre-existing Render secret preserved across the env PUT
- `tenant_secrets` unreadable by the anon key in cloud
- Owner can log in before Phase B begins

### Must NOT Have (Guardrails)

- Do NOT rotate or change `ENCRYPTION_KEY` (orphans all tenant secrets)
- Do NOT modify member removal / deactivation / role-change endpoint logic
- Do NOT push the build fix and assume CI passes — verify the Docker build locally first
- Do NOT run `PUT /env-vars` without first saving the current full list as rollback
- Do NOT add a password-rotation task (user opted out)
- Do NOT expand scope to Fly worker env, Slack OAuth, or cron triggers (out of scope — flag only)
- Do NOT commit `Test1234!`, Supabase keys, or the Resend key into the repo

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION for verification** — all acceptance is agent-executed via curl, SQL, and Playwright. (Distinct from USER-ACTION steps that require dashboard access for secrets/DNS — those are explicitly marked and unavoidable for a production deploy.)

### Test Decision

- **Infrastructure exists**: YES (vitest unit/integration) — but this is a DEPLOYMENT runbook, not a code feature. No new unit tests.
- **Automated tests**: None added. Verification = live production probes.
- **Framework**: curl + jq (API/env), Supabase SQL Editor / psql (DB), Playwright (`playwright` skill) for browser login/accept.

### QA Policy

Every task includes agent-executed verification with exact commands and expected output. Evidence saved to `.sisyphus/evidence/deploy-{task}-{slug}.{ext}`.

- **API/env**: Bash (curl + Render API) — assert status + named fields
- **DB/migration**: SQL queries — assert exact row counts of tables/enums/policies
- **Browser (login, accept)**: Playwright — navigate, fill, assert `/me` payload + DOM

---

## Execution Strategy

### Why Sequential (not parallel)

This is a production deployment runbook. Steps have hard ordering dependencies: you cannot migrate before you have credentials, cannot redeploy before the build is fixed, cannot seed the owner before the tables exist, cannot re-sync Inngest before the gateway is healthy. Forcing parallel "waves" here would be wrong and dangerous. The plan is a strict critical path, split into two phases gated by an external dependency (Resend DNS propagation).

### Phase A — Deploy + Owner Login (do now, unblocked by DNS)

```
A1  Fix Dockerfile.gateway build break (HUSKY=0) + local docker build verify   [quick]
A2  Commit + push to main; confirm Render build PASSES on the new commit        [deep]
A3  USER-ACTION: retrieve cloud Supabase credentials from dashboard             [unspecified-high]
A4  Probe cloud DB connectivity → choose migration method (SQL Editor expected) [deep]
A5  Apply auth-rbac migration to cloud + reload PostgREST + verify schema        [deep]
A6  Verify FK precondition (tenants seeded) + tenant_secrets RLS blocked         [deep]
A7  Render env PUT (save → merge → PUT → re-GET → assert secrets preserved)      [deep]
A8  Trigger fresh redeploy + health/profile gate + /api/config.js populated      [deep]
A9  Re-sync Inngest Cloud app (AFTER A8 health gate)                             [unspecified-high]
A10 Seed PLATFORM_OWNER victor@dozaldevs.com (Auth API + SQL fallback)           [deep]
A11 E2E: Playwright owner login → /me PLATFORM_OWNER → members page loads        [unspecified-high]
```

### Phase B — Email + Invitations (after Resend DNS verifies)

```
B1  USER-ACTION: Resend account + verify send.dozaldevs.com (DNS) + API key      [unspecified-high]
B2  Render env: add RESEND_API_KEY + EMAIL_FROM + DASHBOARD_BASE_URL + redeploy   [deep]
B3  E2E: invite → Resend message ID → email arrives → accept → membership         [unspecified-high]
B4  Update docs (resolve migration-method conflict, record final prod state)      [writing]
B5  Notify completion (Telegram)                                                  [quick]
```

### Dependency Chain

- **A1** → A2 → A3 → A4 → A5 → A6 → A7 → A8 → A9, A10 → A11
- **A8** strictly precedes **A9** (Inngest registers against new code only after healthy redeploy)
- **A5** strictly precedes **A10** (tables must exist before seeding)
- **A11** completes Phase A. **B1** can start in parallel with Phase A (DNS wait) but **B2/B3** require both A-complete and B1-complete.
- **B4** after B3. **B5** last.

### Agent Dispatch Summary

- A1 → `quick` · A2,A4,A5,A6,A7,A8,A10,B2 → `deep` · A3,A9,A11,B1,B3 → `unspecified-high` · B4 → `writing` · B5 → `quick`

---

## TODOs

### PHASE A — Deploy + Owner Login

- [x] A1. Fix the `Dockerfile.gateway` build break (HUSKY=0)

  **What to do**:
  - Add `ENV HUSKY=0` to the **builder** stage of `Dockerfile.gateway`, placed BEFORE the first pnpm command (after `RUN corepack enable pnpm`, around line 4). Husky v9 reads `HUSKY=0` and turns the `prepare` script into a no-op, so `pnpm prune --prod` (line 34) no longer fails with `husky: not found`.
  - Do NOT remove the `prepare` script from `package.json` (it's needed for local git-hook setup).
  - Verify with a real local build: `docker build -f Dockerfile.gateway -t ai-employee-gateway:verify .`

  **Must NOT do**:
  - Do not rely on `pnpm prune --ignore-scripts` as the fix (unreliable for prune; Metis flagged this).
  - Do not change the dashboard `VITE_*` build args or the runner stage.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single-line Dockerfile change with a build verify.
  - **Skills**: [] — no domain skill needed.

  **References**:
  - `Dockerfile.gateway:1-6` — builder stage head (`FROM node:22-alpine AS builder` → `corepack enable pnpm` → `apk add openssl`); insert `ENV HUSKY=0` here.
  - `Dockerfile.gateway:34` — `RUN pnpm prune --prod` — the failing step.
  - `package.json:48` — `"prepare": "husky"` — the lifecycle script that fails; leave it intact.
  - **WHY**: husky v9 honors `HUSKY=0` to skip the `prepare` hook during non-interactive installs/prunes. This is the documented, robust fix; `--ignore-scripts` on prune is not reliable.

  **Acceptance Criteria**:

  ```
  Scenario: Gateway image builds cleanly with the husky fix
    Tool: Bash (docker, run via tmux per long-running-commands skill — build >30s)
    Steps:
      1. tmux launch: docker build -f Dockerfile.gateway -t ai-employee-gateway:verify . 2>&1 | tee /tmp/ai-build.log; echo EXIT_CODE:$? >> /tmp/ai-build.log
      2. Poll until "EXIT_CODE:" appears in /tmp/ai-build.log
      3. Assert: grep "EXIT_CODE:0" /tmp/ai-build.log  → present
      4. Assert: grep -c "husky: not found" /tmp/ai-build.log  → 0
    Expected Result: Build exits 0; zero "husky: not found" occurrences
    Failure Indicators: EXIT_CODE non-zero, or "husky: not found" present, or "ELIFECYCLE Command failed" on the prune step
    Evidence: .sisyphus/evidence/deploy-A1-docker-build.log
  ```

  - [ ] Kill the tmux build session after completion (long-running-commands cleanup rule)

  **Commit**: YES (standalone)
  - Message: `fix(docker): set HUSKY=0 so gateway prune does not run husky`
  - Files: `Dockerfile.gateway`
  - Pre-commit: local docker build exits 0

- [x] A2. Push to `main` and confirm the Render build PASSES on the new commit

  **What to do**:
  - Push the A1 commit to `origin/main` (this is already the active branch's merge target; CI `deploy.yml` fires on push to main and triggers the Render deploy hook).
  - Watch the Render deploy that the push triggers. Confirm it reaches `status: live` AND its commit SHA matches the A1 commit (not a cached/old image).
  - If the build still fails, read the Render dashboard build log (build logs are NOT available via API — note this for the operator), diagnose, and create a NEW fix commit. Do not proceed to A3 until a deploy is `live` on the fix commit.

  **Must NOT do**:
  - Do not skip the local build verify from A1 before pushing.
  - Do not use `--no-verify` on the push/commit.

  **Recommended Agent Profile**:
  - **Category**: `deep` — must reason about CI/deploy timing, SHA matching, and failure diagnosis.
  - **Skills**: [`production-ops`] — Render deploy/status API commands and quirks.

  **References**:
  - `.github/workflows/deploy.yml` — `deploy-gateway` job hits `RENDER_DEPLOY_HOOK_URL` on push to main; `test` job must pass first.
  - production-ops skill — `GET /v1/services/$RENDER_SERVICE_ID/deploys?limit=1` for status; `$RENDER_API_KEY` + `$RENDER_SERVICE_ID` in `.env`.
  - **WHY**: A green local build does not guarantee a green Render build (env differences). Must confirm the actual prod build went live on the right SHA before provisioning anything else.

  **Acceptance Criteria**:

  ```
  Scenario: Render deploy is live on the build-fix commit
    Tool: Bash (curl + Render API), poll loop
    Steps:
      1. Capture fix SHA: git rev-parse --short HEAD
      2. Poll: curl -s -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" | jq '.[0].deploy | {status, sha: .commit.id}'
      3. Assert status transitions to "live" (not build_failed/canceled)
      4. Assert the deploy commit corresponds to the A1 fix commit
    Expected Result: status=live on the fix commit
    Failure Indicators: status=build_failed → must read dashboard build log + re-fix
    Evidence: .sisyphus/evidence/deploy-A2-render-deploy.json
  ```

  **Commit**: NO (operational; A1 already committed)

- [x] A3. USER-ACTION: retrieve cloud Supabase credentials

  **What to do**:
  - This step REQUIRES the user (dashboard access to secrets). The executing agent should print a precise checklist and pause for the operator to supply values into the shell environment (never into the repo).
  - From Supabase dashboard (project `gjqrysxpvktmibpkwrvy`) → Settings > API and Settings > Database, collect:
    - `SUPABASE_URL` = `https://gjqrysxpvktmibpkwrvy.supabase.co`
    - `SUPABASE_ANON_KEY` = the `sb_publishable_...` key
    - `SUPABASE_SECRET_KEY` = the `sb_secret_...` (service_role) key
    - Session pooler URL (port 5432) — for migration/seed attempts
    - Direct connection URL (port 5432, `db.{ref}.supabase.co`) — IPv6, Render/CI only
  - Export these into the current shell session as env vars for subsequent steps (e.g. `export CLOUD_SUPABASE_URL=...`). Do NOT write them to `.env` or any tracked file.

  **Must NOT do**:
  - Do NOT paste any of these values into the repo, the plan, or evidence files (mask when logging).
  - Do NOT confuse the publishable (anon) and secret keys — the profile detector requires `sb_publishable_` for ANON.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — coordinates a user-action gate with careful secret handling.
  - **Skills**: [`security`] — secret-handling discipline (never log/commit secrets).

  **References**:
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` §Cloud Setup — project ref, key formats, JWKS endpoint.
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` §3.2 — the three connection-string types and when to use each.
  - **WHY**: Every subsequent cloud step needs these. The anon/secret distinction directly causes the JWT-profile boot crash if mixed up (Metis R4).

  **Acceptance Criteria**:

  ```
  Scenario: Cloud credentials are present and well-formed in the shell (values masked)
    Tool: Bash (shape checks only — never print full values)
    Steps:
      1. Assert: echo "$CLOUD_SUPABASE_URL" | grep -E '^https://gjqrysxpvktmibpkwrvy\.supabase\.co$'
      2. Assert: echo "$CLOUD_SUPABASE_ANON_KEY" | grep -qE '^sb_publishable_' && echo OK
      3. Assert: echo "$CLOUD_SUPABASE_SECRET_KEY" | grep -qE '^sb_secret_' && echo OK
      4. Assert JWKS reachable: curl -s "https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/.well-known/jwks.json" | jq -e '.keys | length > 0'
    Expected Result: all four assertions pass; no secret value printed in full
    Failure Indicators: anon key starts with eyJ (legacy/wrong) or sb_secret_ (swapped) → would crash profile detection
    Evidence: .sisyphus/evidence/deploy-A3-cred-shape.txt  (shapes only, masked)
  ```

- [x] A4. Probe cloud DB connectivity and choose the migration method

  **What to do**:
  - Attempt a lightweight connection to the cloud session pooler (port 5432) using the URL from A3, e.g. `psql "$CLOUD_SESSION_POOLER_URL" -c "select 1"` with a short timeout.
  - If it connects → migration method = **psql/`prisma migrate deploy` via pooler** (record this).
  - If it fails (IPv6/timeout, the expected outcome per the auth guide) → migration method = **Supabase dashboard SQL Editor** (record this). Also confirm the Data API read path works: `curl "$CLOUD_SUPABASE_URL/rest/v1/tenants?limit=1" -H "apikey: $CLOUD_SUPABASE_SECRET_KEY"` returns rows (proves secret-key read access for verification queries that don't need psql).
  - Write the chosen method to the evidence file so A5/A10 branch deterministically.

  **Must NOT do**:
  - Do not spend more than a short timeout on the pooler probe — the guide already says expect failure locally.

  **Recommended Agent Profile**:
  - **Category**: `deep` — decision step that sets the method for two later tasks.
  - **Skills**: [`prisma`] — PostgREST-vs-psql verification distinction.

  **References**:
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` §Cloud Setup (line ~176-180) — "Direct psql/Prisma connections to the cloud pooler fail (IPv6-only). Use the Supabase dashboard SQL Editor for schema changes."
  - **WHY**: Determines whether A5 (migration) and A10 (owner seed) use psql or the SQL Editor fallback. The auth guide says SQL Editor is the expected path; the probe confirms before committing.

  **Acceptance Criteria**:

  ```
  Scenario: Migration method is determined and recorded
    Tool: Bash (psql probe + curl Data API)
    Steps:
      1. Run: timeout 20 psql "$CLOUD_SESSION_POOLER_URL" -c "select 1" ; echo "POOLER_EXIT:$?"
      2. Run Data API check: curl -s "$CLOUD_SUPABASE_URL/rest/v1/tenants?limit=1" -H "apikey: $CLOUD_SUPABASE_SECRET_KEY" | jq 'length'
      3. Record METHOD=pooler if step 1 exit 0, else METHOD=sql_editor
    Expected Result: METHOD written to evidence; Data API returns >=1 tenant (read path works regardless of method)
    Failure Indicators: BOTH pooler unreachable AND Data API failing → credentials wrong, return to A3
    Evidence: .sisyphus/evidence/deploy-A4-method.txt
  ```

- [x] A5. Apply the auth-rbac migration to the cloud DB + reload PostgREST

  **What to do**:
  - Apply migration `20260609000000_add_user_auth_rbac` to the cloud DB using the method from A4.
    - **SQL Editor path (expected)**: paste the full contents of `prisma/migrations/20260609000000_add_user_auth_rbac/migration.sql` into the Supabase dashboard SQL Editor and run it. (USER-ACTION: requires the operator's authenticated browser session.)
    - **Pooler path**: `DATABASE_URL="$CLOUD_SESSION_POOLER_URL" pnpm prisma migrate deploy`.
  - The migration is **NOT idempotent** (`CREATE TYPE`/`CREATE TABLE`/`CREATE POLICY` have no `IF NOT EXISTS`). If it errors on a duplicate `CREATE TYPE "Role"` (partial prior apply), recover: in SQL Editor run `DROP TABLE IF EXISTS tenant_invitations, tenant_memberships, users CASCADE; DROP TYPE IF EXISTS "TenantRole", "Role" CASCADE;` then re-run the full migration once, clean.
  - After applying, reload the PostgREST schema cache: `NOTIFY pgrst, 'reload schema';` (SQL Editor) or via psql.

  **Must NOT do**:
  - Do not run the migration twice without the DROP recovery (it will abort mid-transaction).
  - Do not edit the migration file to add `IF NOT EXISTS` (keep migration history immutable; handle re-runs via DROP recovery instead).

  **Recommended Agent Profile**:
  - **Category**: `deep` — production schema change with a non-idempotent recovery path.
  - **Skills**: [`prisma`, `supabase`] — migration workflow + Supabase SQL Editor / schema-cache reload.

  **References**:
  - `prisma/migrations/20260609000000_add_user_auth_rbac/migration.sql` — full DDL: 2 enums, 3 tables, 7 indexes, 4 FKs, RLS enable on 3 tables, 3 service_role policies.
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` §3.4 — `NOTIFY pgrst, 'reload schema'` after table changes.
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` gotcha #6 — schema-drift recovery (`ADD COLUMN IF NOT EXISTS` + NOTIFY).
  - **WHY**: Gateway code already deployed (after A2) expects these tables. Without them, every authenticated request 500s on missing `users`.

  **Acceptance Criteria**:

  ```
  Scenario: Auth schema fully present and PostgREST sees it
    Tool: SQL (Editor or psql) + curl Data API
    Steps:
      1. SQL: SELECT typname FROM pg_type WHERE typname IN ('Role','TenantRole');  → 2 rows
      2. SQL: SELECT tablename FROM pg_tables WHERE tablename IN ('users','tenant_memberships','tenant_invitations');  → 3 rows
      3. SQL: SELECT count(*) FROM pg_constraint WHERE conname LIKE 'tenant_%_fkey';  → >= 4
      4. SQL: SELECT count(*) FROM pg_policies WHERE tablename IN ('users','tenant_memberships','tenant_invitations');  → >= 3
      5. SQL: SELECT relrowsecurity FROM pg_class WHERE relname='users';  → t
      6. Data API: curl -s -o /dev/null -w "%{http_code}" "$CLOUD_SUPABASE_URL/rest/v1/users?limit=0" -H "apikey: $CLOUD_SUPABASE_SECRET_KEY"  → 200 (not 404)
    Expected Result: all six pass — schema present AND PostgREST cache reloaded
    Failure Indicators: step 6 returns 404 "relation does not exist" → NOTIFY didn't take; re-run reload
    Evidence: .sisyphus/evidence/deploy-A5-migration-verify.txt
  ```

- [x] A6. Verify FK precondition (tenants seeded) and `tenant_secrets` RLS

  **What to do**:
  - Confirm the cloud `tenants` table already contains BOTH hardcoded IDs the owner-seed will reference, so the membership upsert in A10 won't hit an FK violation:
    - `00000000-0000-0000-0000-000000000002` (DozalDevs), `00000000-0000-0000-0000-000000000003` (VLRE).
  - Confirm `tenant_secrets` is NOT readable by the anon/publishable key (security gate — separate from the new auth-table RLS).
  - If `tenants` is missing either ID → STOP and surface to the operator (the cloud DB needs its base seed; out of this plan's scope to fix blindly — flag it).

  **Must NOT do**:
  - Do not seed/insert tenants here — if missing, surface it; don't guess tenant data into production.

  **Recommended Agent Profile**:
  - **Category**: `deep` — precondition + security verification before the irreversible seed.
  - **Skills**: [`security`] — RLS / anon-exposure reasoning.

  **References**:
  - `scripts/seed-platform-owner.ts:20-21,127-136` — the two hardcoded tenant IDs and the membership upsert that FK-references `tenants.id`.
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` §3.8 — the historical anon-key `tenant_secrets` exposure and the RLS remediation; `tenant_secrets` must return 42501 to anon.
  - **WHY**: Metis R-FK — seeding memberships against absent tenants fails on FK; and the `tenant_secrets` anon exposure is the platform's worst historical security bug — must confirm it stays closed in cloud.

  **Acceptance Criteria**:

  ```
  Scenario: Tenants present and tenant_secrets locked to anon
    Tool: SQL + curl (anon key)
    Steps:
      1. SQL: SELECT id FROM tenants WHERE id IN ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');  → 2 rows
      2. Anon read attempt: curl -s "$CLOUD_SUPABASE_URL/rest/v1/tenant_secrets?limit=1" -H "apikey: $CLOUD_SUPABASE_ANON_KEY"
      3. Assert step 2 returns permission-denied (42501) or empty — NEVER actual secret rows
    Expected Result: both tenant IDs present; tenant_secrets blocked to anon
    Failure Indicators: step 1 < 2 rows → STOP, surface to operator; step 2 returns ciphertext rows → CRITICAL security failure, block deploy
    Evidence: .sisyphus/evidence/deploy-A6-fk-rls.txt
  ```

- [x] A7. Render env PUT — save, merge, PUT, re-GET, assert secrets preserved

  **What to do**:
  - **SAVE FIRST (rollback artifact)**: `GET /v1/services/$RENDER_SERVICE_ID/env-vars?limit=100`, save the raw JSON to `.sisyphus/evidence/deploy-A7-env-before.json`. This file is the rollback — PUT it back verbatim if anything goes wrong.
  - Build the new env-var array = **every existing var** (from the saved file) PLUS the new ones, MINUS the stale ones:
    - ADD `SUPABASE_URL`, `SUPABASE_ANON_KEY` (sb*publishable*), `SUPABASE_SECRET_KEY` (sb*secret*) — from A3.
    - ADD `INNGEST_DEV` = `""` (empty → Inngest Cloud, not dev server).
    - REMOVE `ADMIN_API_KEY` (removed from code in T24).
    - Consider removing the duplicate `GATEWAY_URL` (keep `GATEWAY_PUBLIC_URL`) — only if confirmed unused; otherwise leave it.
    - Do NOT add Resend vars yet — those are Phase B (B2).
  - `PUT /v1/services/$RENDER_SERVICE_ID/env-vars` with the FULL merged array.
  - **Immediately re-GET** and assert every pre-existing secret still present (PUT replaces the entire list — Metis R2, deploy guide Issue 7).

  **Must NOT do**:
  - Do NOT call PUT without saving the before-state first.
  - Do NOT send a partial array — PUT replaces ALL env vars; omitting any deletes it.
  - Do NOT touch `ENCRYPTION_KEY` (must remain byte-identical or all tenant secrets become undecryptable).

  **Recommended Agent Profile**:
  - **Category**: `deep` — highest blast-radius step; careful merge + verification.
  - **Skills**: [`production-ops`] — the `PUT /env-vars` replace-all quirk and `?limit=100` pagination gotcha.

  **References**:
  - production-ops skill — "PUT /env-vars replaces ALL env vars"; "GET paginates at ~20 by default — always append ?limit=100".
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` §6.6 + Issue 7 — full env list + the wipe foot-gun.
  - Known existing Render keys (from investigation): `ENCRYPTION_KEY, SERVICE_TOKEN, FLY_API_TOKEN, FLY_WORKER_APP, FLY_WORKER_IMAGE, SLACK_APP_TOKEN, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_BASE_URL, OPENROUTER_API_KEY, OPENCODE_GO_API_KEY, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY, GATEWAY_PUBLIC_URL, WEBHOOK_PUBLIC_URL, WORKER_RUNTIME, NODE_ENV, DATABASE_URL, DATABASE_URL_DIRECT, COST_LIMIT_USD_PER_DEPT_PER_DAY`.
  - **WHY**: Missing any pre-existing secret silently breaks workers/Slack/employees with no deploy-time error. The save-file is the only rollback.

  **Acceptance Criteria**:

  ```
  Scenario: New vars added, stale removed, every prior secret preserved
    Tool: Bash (curl Render API + jq diff)
    Steps:
      1. Save before: curl -s -H "Authorization: Bearer $RENDER_API_KEY" ".../env-vars?limit=100" > .sisyphus/evidence/deploy-A7-env-before.json
      2. PUT merged array
      3. Re-GET after: curl ... "?limit=100" > .sisyphus/evidence/deploy-A7-env-after.json
      4. Assert each pre-existing key in before-file is present in after-file (jq set-difference = empty, except ADMIN_API_KEY intentionally removed)
      5. Assert new keys present: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY, INNGEST_DEV
      6. Assert ADMIN_API_KEY absent in after-file
    Expected Result: before-keys ⊆ after-keys (minus ADMIN_API_KEY) AND new keys present
    Failure Indicators: any prior key missing from after → restore immediately by PUTting deploy-A7-env-before.json
    Evidence: deploy-A7-env-before.json, deploy-A7-env-after.json, deploy-A7-diff.txt
  ```

- [x] A8. Trigger a fresh redeploy + health/profile gate + config populated

  **What to do**:
  - Trigger a fresh Render deploy so the new env vars take effect: `POST /v1/services/$RENDER_SERVICE_ID/deploys` with `{"clearCache":"do_not_clear"}`.
  - Wait for `status: live`.
  - Health gate: `curl /health` → 200. Critically, confirm the gateway did NOT fatal-crash on `detectEnvProfile()` (LOCAL/CLOUD mix). If `/health` is 200 the process booted, which means the profile check passed — but if it's failing, check the Render dashboard logs for `detectEnvProfile` / "Mixing LOCAL and CLOUD" fatal.
  - Confirm `/api/config.js` now returns a NON-EMPTY `VITE_POSTGREST_URL` and a `sb_publishable_` `VITE_SUPABASE_ANON_KEY`.

  **Must NOT do**:
  - Do not proceed to A9/A10 if `/health` is non-200 or config.js values are empty.

  **Recommended Agent Profile**:
  - **Category**: `deep` — deploy orchestration + multi-signal health gate.
  - **Skills**: [`production-ops`] — deploy trigger/status + log access notes.

  **References**:
  - production-ops skill — deploy trigger + status curl; runtime logs only in dashboard.
  - `src/lib/config.ts` `detectEnvProfile()` — fatal on LOCAL/CLOUD mix (Metis R4).
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` Issue 6 — empty config.js root cause.
  - **WHY**: Env vars only apply on a new deploy. The profile crash is a "healthy build, crashing container" failure mode — must be gated on `/health` 200 + populated config, not just deploy status.

  **Acceptance Criteria**:

  ```
  Scenario: Gateway healthy on cloud profile with populated dashboard config
    Tool: Bash (curl), poll
    Steps:
      1. POST a new deploy; poll deploys?limit=1 until status=live
      2. curl -s -o /dev/null -w "%{http_code}" https://ai-employees-laaa.onrender.com/health  → 200
      3. curl -s https://ai-employees-laaa.onrender.com/api/config.js  → contains non-empty VITE_POSTGREST_URL AND VITE_SUPABASE_ANON_KEY starting sb_publishable_
    Expected Result: deploy live, health 200, config.js populated with cloud values
    Failure Indicators: health != 200 → check dashboard logs for detectEnvProfile fatal (likely anon/url profile mismatch from A3/A7)
    Evidence: .sisyphus/evidence/deploy-A8-health-config.txt
  ```

- [x] A9. Re-sync the Inngest Cloud app (AFTER A8 health gate)

  **What to do**:
  - With the gateway healthy on new code, re-sync the Inngest Cloud app so functions register (currently `functionCount: 0`).
  - USER-ACTION (Inngest dashboard) OR API: point Inngest at `https://ai-employees-laaa.onrender.com/api/inngest` (app.inngest.com > Apps > Sync). Confirm `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` are present in Render env (verified preserved in A7).
  - Verify the gateway now advertises its functions.

  **Must NOT do**:
  - Do NOT re-sync before A8's health gate passes — syncing against old/crashing code registers the wrong function set (Metis R6).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — coordinates a dashboard sync + verification.
  - **Skills**: [`inngest`] — function registration + serve endpoint.

  **References**:
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` §4 — Inngest Cloud sync via `/api/inngest`.
  - `src/gateway/inngest/serve.ts` — registered functions list (the source of truth for the count).
  - **WHY**: Workers/lifecycle won't run without registered functions. Must follow the healthy redeploy.

  **Acceptance Criteria**:

  ```
  Scenario: Inngest functions registered against the new gateway
    Tool: Bash (curl)
    Steps:
      1. curl -s https://ai-employees-laaa.onrender.com/api/inngest | jq '{mode, count: (.functions | length)}'
      2. Assert mode == "cloud" AND count > 0
    Expected Result: cloud mode, functions > 0
    Failure Indicators: count still 0 → sync didn't register; re-trigger sync from Inngest dashboard
    Evidence: .sisyphus/evidence/deploy-A9-inngest.json
  ```

- [x] A10. Seed PLATFORM_OWNER `victor@dozaldevs.com` (Auth API + SQL fallback)

  **What to do**:
  - **Step (a) — Auth user (works from anywhere over HTTPS)**: create the Supabase Auth user via the Admin API with `email_confirm: true` and password `Test1234!`:
    `POST $CLOUD_SUPABASE_URL/auth/v1/admin/users` with `apikey` + `Authorization: Bearer` = `$CLOUD_SUPABASE_SECRET_KEY`, body `{"email":"victor@dozaldevs.com","password":"Test1234!","email_confirm":true}`. If it returns 422 (already exists), list users by email to capture the existing `supabase_id`. Capture `supabase_id`.
  - **Step (b) — app rows**: create the `users` row (role `PLATFORM_OWNER`) + `OWNER` memberships in both tenants.
    - **If A4 method = pooler**: run `BOOTSTRAP_OWNER_EMAIL=victor@dozaldevs.com BOOTSTRAP_OWNER_PASSWORD='Test1234!' SUPABASE_URL=$CLOUD_SUPABASE_URL SUPABASE_SECRET_KEY=$CLOUD_SUPABASE_SECRET_KEY DATABASE_URL=$CLOUD_SESSION_POOLER_URL pnpm seed-platform-owner` (the script is idempotent and does both (a) and (b)).
    - **If A4 method = sql_editor (expected)**: the script's Prisma step can't reach cloud, so do (b) via SQL Editor using the `supabase_id` from (a):
      ```sql
      INSERT INTO users (id, supabase_id, email, role, status, updated_at)
      VALUES (gen_random_uuid(), '<supabase_id>', 'victor@dozaldevs.com', 'PLATFORM_OWNER', 'active', now())
      ON CONFLICT (supabase_id) DO UPDATE SET role='PLATFORM_OWNER', email=EXCLUDED.email;
      INSERT INTO tenant_memberships (tenant_id, user_id, role, joined_at)
      SELECT t, (SELECT id FROM users WHERE supabase_id='<supabase_id>'), 'OWNER', now()
      FROM (VALUES ('00000000-0000-0000-0000-000000000002'::uuid), ('00000000-0000-0000-0000-000000000003'::uuid)) AS x(t)
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET role='OWNER', deleted_at=NULL;
      ```
  - This password `Test1234!` is the user's explicit choice — note it once in evidence (masked) and do NOT add a rotation task.

  **Must NOT do**:
  - Do NOT commit `Test1234!` or `supabase_id` to the repo.
  - Do NOT skip step (a) — the `users.supabase_id` must match the Auth user or login won't map to the app user.
  - Do NOT insert memberships before A6 confirmed both tenants exist (FK).

  **Recommended Agent Profile**:
  - **Category**: `deep` — branching seed with a production SQL fallback.
  - **Skills**: [`security`, `prisma`] — secret handling + the PostgREST/psql boundary.

  **References**:
  - `scripts/seed-platform-owner.ts` — full idempotent logic: Auth create/lookup (lines 67-110), `users` upsert (114-125), membership upsert for both tenants (127-136). Mirror this exactly in the SQL fallback.
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` §Bootstrapping + gotcha #7 (ensureUserExists creates role USER — must explicitly set PLATFORM_OWNER).
  - **WHY**: This is the account the user logs in with. The Auth user and the `users.supabase_id` must be linked, and the role must be PLATFORM_OWNER with both OWNER memberships, or the dashboard shows no orgs.

  **Acceptance Criteria**:

  ```
  Scenario: Owner exists in Auth and app DB with correct role + memberships
    Tool: SQL + curl (Auth API)
    Steps:
      1. Auth user exists: curl -s "$CLOUD_SUPABASE_URL/auth/v1/admin/users?email=victor@dozaldevs.com" -H "apikey: $CLOUD_SUPABASE_SECRET_KEY" -H "Authorization: Bearer $CLOUD_SUPABASE_SECRET_KEY" | jq '.users[0].email_confirmed_at != null'  → true
      2. SQL: SELECT role FROM users WHERE email='victor@dozaldevs.com';  → PLATFORM_OWNER
      3. SQL: SELECT count(*) FROM tenant_memberships WHERE user_id=(SELECT id FROM users WHERE email='victor@dozaldevs.com') AND role='OWNER' AND deleted_at IS NULL;  → 2
    Expected Result: confirmed Auth user + PLATFORM_OWNER + 2 OWNER memberships
    Failure Indicators: role=USER → ensureUserExists ran but seed role-write didn't; memberships < 2 → FK or tenant-id issue
    Evidence: .sisyphus/evidence/deploy-A10-owner.txt (masked)
  ```

- [x] A11. E2E: Playwright owner login → `/me` PLATFORM_OWNER → members page loads

  **What to do**:
  - Using Playwright (the `playwright` skill), from a clean browser context, navigate to `https://ai-employees-laaa.onrender.com/dashboard/`, log in as `victor@dozaldevs.com` / `Test1234!`.
  - Assert the dashboard loads (not blank/localhost) and an authenticated `GET /me` returns `globalRole: PLATFORM_OWNER`.
  - Navigate to the members page for both tenants and assert it loads (200, no 403 — this also re-confirms the fix shipped in the earlier members-role commit is live).

  **Must NOT do**:
  - Do NOT accept "dashboard loads" alone as proof — assert the `/me` payload role (Metis directive).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — live browser E2E with payload assertions.
  - **Skills**: [`playwright`] — browser automation.

  **References**:
  - `dashboard/src/pages/MembersPage.tsx` — members page; loads `listMembers` (needs VIEWER+, fixed earlier).
  - `src/gateway/routes/me.ts` — `GET /me` returns `globalRole`.
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` §Invitation Flow / acceptance page for selectors context.
  - **WHY**: This is the end-state proof of Phase A: the owner can actually use production. It also validates the CLOUD JWT (ES256/JWKS) verification path end-to-end.

  **Acceptance Criteria**:

  ```
  Scenario: Owner logs in and is recognized as PLATFORM_OWNER (happy path)
    Tool: Playwright
    Preconditions: A8 healthy, A10 owner seeded
    Steps:
      1. Navigate https://ai-employees-laaa.onrender.com/dashboard/
      2. Fill login: email "victor@dozaldevs.com", password "Test1234!"; submit
      3. Wait for dashboard; capture authenticated GET /me response
      4. Assert /me JSON globalRole == "PLATFORM_OWNER"
      5. Navigate members page (tenant ...0003); assert HTTP 200 and members table renders (no "Failed to load members" / 403)
    Expected Result: logged in, globalRole PLATFORM_OWNER, members list visible for both tenants
    Failure Indicators: login rejected (Auth user/password mismatch → A10), /me 401 (JWT profile → A7/A8), members 403 (role mapping → A10)
    Evidence: .sisyphus/evidence/deploy-A11-login.png + me.json

  Scenario: Wrong password is rejected (negative)
    Tool: Playwright
    Steps:
      1. Attempt login with "victor@dozaldevs.com" / "wrongpass"
      2. Assert an auth error is shown and dashboard does NOT load
    Expected Result: graceful auth failure, no session
    Evidence: .sisyphus/evidence/deploy-A11-login-negative.png
  ```

### PHASE B — Email + Invitations (after Resend DNS verifies)

> Phase B can be STARTED (B1) in parallel with Phase A since DNS propagation is a wait, but B2/B3 require Phase A complete AND B1 verified.

- [x] B1. USER-ACTION: Resend account + verify `send.dozaldevs.com` + API key

  **What to do**:
  - This is a USER-ACTION (external service + DNS). The agent prints the checklist and waits.
  - Create a Resend account (if none). Add domain **`send.dozaldevs.com`** (subdomain — user's chosen path) and add the DNS records Resend provides (SPF/DKIM/DMARC) to the dozaldevs.com DNS provider.
  - Wait for Resend to show the domain **Verified** (DNS propagation — minutes to hours).
  - Create a Resend API key; export it to the shell as `RESEND_API_KEY` (do NOT commit).

  **Must NOT do**:
  - Do NOT proceed to B2 until Resend shows the domain Verified — sends to arbitrary recipients fail until then.
  - Do NOT verify the apex domain (user chose the subdomain to isolate reputation).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — external-service coordination + secret handling.
  - **Skills**: [`security`] — API-key handling.

  **References**:
  - `src/lib/email/resend-provider.js` (via `src/lib/email/index.ts`) — `ResendEmailProvider` is selected when `RESEND_API_KEY` is set.
  - `src/lib/config.ts` — `RESEND_API_KEY()`, `EMAIL_FROM()` (default `DozalDevs <noreply@dozaldevs.com>`).
  - **WHY**: Without a verified domain, `EMAIL_FROM` on `send.dozaldevs.com` fails Resend's domain check and invitations silently don't send.

  **Acceptance Criteria**:

  ```
  Scenario: Resend domain verified and key works
    Tool: Bash (curl Resend API)
    Steps:
      1. Assert key present: echo "$RESEND_API_KEY" | grep -qE '^re_' && echo OK
      2. Assert domain verified: curl -s -H "Authorization: Bearer $RESEND_API_KEY" "https://api.resend.com/domains" | jq -e '.data[] | select(.name=="send.dozaldevs.com") | .status=="verified"'
    Expected Result: key valid; send.dozaldevs.com status verified
    Failure Indicators: status "pending"/"not_started" → DNS not propagated; wait and re-check
    Evidence: .sisyphus/evidence/deploy-B1-resend.txt (masked)
  ```

- [x] B2. Render env: add `RESEND_API_KEY` + `EMAIL_FROM` + `DASHBOARD_BASE_URL` + redeploy

  **What to do**:
  - Repeat the A7 save-and-verify pattern: GET current full env list (save to `deploy-B2-env-before.json`), append the three new vars, PUT the full array, re-GET and assert nothing else changed.
    - `RESEND_API_KEY` = from B1
    - `EMAIL_FROM` = `DozalDevs <noreply@send.dozaldevs.com>` (matches the verified subdomain)
    - `DASHBOARD_BASE_URL` = `https://ai-employees-laaa.onrender.com` (used to build accept-invite links in emails)
  - Trigger a fresh redeploy; confirm `/health` 200.

  **Must NOT do**:
  - Do NOT set `EMAIL_FROM` to an apex/unverified address — must match the verified `send.dozaldevs.com`.
  - Do NOT PUT a partial array (same replace-all rule as A7).

  **Recommended Agent Profile**:
  - **Category**: `deep` — same blast-radius env-PUT discipline.
  - **Skills**: [`production-ops`] — env PUT replace-all + redeploy.

  **References**:
  - `src/lib/config.ts` — `EMAIL_FROM`, `DASHBOARD_BASE_URL`, `RESEND_API_KEY` accessors.
  - production-ops skill — env PUT quirk + `?limit=100`.
  - A7 evidence `deploy-A7-env-after.json` — the baseline to extend.
  - **WHY**: These three wire the production email pipeline. `DASHBOARD_BASE_URL` makes the accept-invite link point to prod, not localhost.

  **Acceptance Criteria**:

  ```
  Scenario: Email env vars set, redeploy healthy, all prior preserved
    Tool: Bash (curl Render API)
    Steps:
      1. Save before; PUT merged (prior + 3 new); re-GET
      2. Assert RESEND_API_KEY, EMAIL_FROM, DASHBOARD_BASE_URL present
      3. Assert EMAIL_FROM value contains "send.dozaldevs.com"
      4. Assert all keys from before-file still present
      5. Trigger deploy; poll status=live; curl /health → 200
    Expected Result: 3 new vars set, no prior var lost, deploy live, health 200
    Failure Indicators: any prior key missing → restore from before-file
    Evidence: deploy-B2-env-before.json, deploy-B2-env-after.json
  ```

- [x] B3. E2E: invite → Resend message ID → email arrives → accept → membership

  **What to do**:
  - As the owner (or via SERVICE_TOKEN), create a real invitation: `POST /admin/tenants/00000000-0000-0000-0000-000000000003/invitations` with a test recipient email and role MEMBER.
  - Confirm Resend ACCEPTED the send (message ID in Resend dashboard/API logs) — distinct from arrival.
  - Confirm the email ARRIVES at the recipient (use a real inbox you control; with the verified domain, arbitrary recipients work).
  - Open the accept-invite link, complete the flow (set-password for a new user, or sign-in for existing), and assert the invitation transitions to `accepted` and a `tenant_memberships` row is created.

  **Must NOT do**:
  - Do NOT conflate "Resend returned a message ID" with "email arrived" — assert both independently (Metis directive).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — multi-system live E2E (gateway + Resend + browser).
  - **Skills**: [`playwright`] — browser accept flow.

  **References**:
  - `src/gateway/routes/admin-invitations.ts` — create handler + accept/set-password endpoints.
  - `dashboard/src/pages/AcceptInvitePage.tsx` — new-user vs existing-user branches.
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` §Invitation Flow — full endpoint behavior.
  - **WHY**: This is the end-state proof of Phase B and the user's core request — invitations actually work in prod.

  **Acceptance Criteria**:

  ```
  Scenario: Full invitation lifecycle in production (happy path)
    Tool: Bash (curl) + Playwright + Resend API
    Steps:
      1. POST invitation for a controlled test email; capture invitation id + status=pending
      2. Resend accepted: curl Resend /emails (or dashboard) shows a message to that recipient with a delivered/sent status
      3. Email arrives in the test inbox; extract the accept-invite token/link
      4. Playwright: open link, complete set-password (Test-strength) + sign-in, click accept
      5. Assert: GET invitation → status=accepted; SQL: tenant_memberships row exists for the new user in tenant ...0003
    Expected Result: invite sent + delivered + accepted + membership created
    Failure Indicators: no Resend message → EMAIL_FROM/domain mismatch (B1/B2); email not arriving → DNS/deliverability; accept 410 → token expired/used
    Evidence: .sisyphus/evidence/deploy-B3-invite-e2e/ (resend.json, accept.png, membership.txt)

  Scenario: Expired/invalid token is rejected (negative)
    Tool: Bash (curl)
    Steps:
      1. POST /invitations/accept with a bogus token
      2. Assert 404/410 (not a 500 or silent success)
    Expected Result: graceful rejection
    Evidence: .sisyphus/evidence/deploy-B3-accept-negative.txt
  ```

- [x] B4. Update docs (resolve migration-method conflict + record final prod state)

  **What to do**:
  - Resolve the documented conflict between the cloud deployment guide (§3.3 "use session pooler for migrations") and the auth/RBAC guide (§Cloud Setup "use SQL Editor — pooler is IPv6-only"). Per the Documentation Discrepancy rule (AGENTS.md), make them consistent: note that the SQL Editor is the confirmed working path for this cloud project, with the pooler as a conditional alternative if reachable.
  - Record the final production state: auth tables live, env vars provisioned, owner bootstrapped, Resend on `send.dozaldevs.com`, Inngest re-synced. Add/update a short section in the cloud deployment guide (or a new dated doc under `docs/infrastructure/`) capturing what was actually done and any foot-guns hit (e.g., the husky/prune build break + fix).
  - Update AGENTS.md if any durable convention changed (e.g., the husky/prune Dockerfile note as a known build foot-gun).

  **Must NOT do**:
  - Do NOT put secrets, the owner password, or keys into any doc.
  - Do NOT edit immutable snapshots (`docs/snapshots/`).

  **Recommended Agent Profile**:
  - **Category**: `writing` — documentation reconciliation.
  - **Skills**: [] — none required.

  **References**:
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` §3.3 — pooler-migration claim to reconcile.
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` §Cloud Setup — SQL Editor claim.
  - AGENTS.md §Documentation Freshness / Discrepancy rule — mandates same-session doc fixes.
  - **WHY**: Prevents the next deployer from hitting the same IPv6 wall and the husky build break.

  **Acceptance Criteria**:

  ```
  Scenario: Docs are consistent and reflect reality
    Tool: Bash (grep) + Read
    Steps:
      1. Assert both guides now agree on the cloud migration method (SQL Editor primary)
      2. Assert the husky/prune build foot-gun is documented
      3. Assert no secrets present: git grep -iE "Test1234|sb_secret_|re_[A-Za-z0-9]" -- docs AGENTS.md  → no hits
    Expected Result: consistent docs, build foot-gun captured, zero secret leaks
    Evidence: git diff of docs in the B4 commit
  ```

  **Commit**: YES
  - Message: `docs(deploy): record prod auth-orgs deployment + resolve migration-method conflict`
  - Files: `docs/**`, `AGENTS.md`
  - Pre-commit: `git grep` finds no secrets in staged docs

- [x] B5. Notify completion (Telegram)

  **What to do**:
  - Per the Prometheus plan rule, send the final Telegram notification: `tsx scripts/telegram-notify.ts "✅ Production auth-orgs deployment complete — gateway live, owner login works, invitations sending via Resend. Come back to review."`

  **Recommended Agent Profile**:
  - **Category**: `quick` — single command.
  - **Skills**: [] — none.

  **References**:
  - `scripts/telegram-notify.ts` — notification script (TELEGRAM_BOT_TOKEN/CHAT_ID in `.env`).
  - **WHY**: Mandatory plan-completion notification.

  **Acceptance Criteria**:

  ```
  Scenario: Completion notification sent
    Tool: Bash
    Steps:
      1. Run the telegram-notify command; assert exit 0
    Expected Result: notification delivered
    Evidence: .sisyphus/evidence/deploy-B5-notify.txt
  ```

---

## Final Verification Wave (MANDATORY — after Phase A and Phase B)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before declaring done. Never mark F1–F4 checked before user approval.

- [x] F1. **Deploy Compliance Audit** — `oracle`
      Re-read this plan end-to-end. For each "Must Have": verify live (curl health, curl /api/config.js, SQL owner role, Render deploy status=live). For each "Must NOT Have": confirm absent (ENCRYPTION_KEY unchanged, ADMIN_API_KEY gone, no secrets in repo via git grep, no rotation task added). Confirm all evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Security & Secrets Review** — `unspecified-high` (+ `security` skill)
      Verify: anon key cannot SELECT `tenant_secrets` in cloud (42501/empty); all 3 auth tables have RLS on; ENCRYPTION*KEY value unchanged from pre-deploy; `git grep` for `Test1234!`, `sb_secret*`, `re\_`(Resend), cloud DB password across the repo → zero hits; Render env still holds every pre-existing secret (diff against the saved rollback JSON).
Output:`tenant_secrets [BLOCKED] | RLS [3/3] | Secret leaks [0] | Env preserved [Y/N] | VERDICT`

- [x] F3. **Live Production QA** — `unspecified-high` (+ `playwright` skill)
      From clean browser state: log in as `victor@dozaldevs.com` / `Test1234!` → assert dashboard loads + `/me` = PLATFORM_OWNER. Load members page for both tenants → 200, no 403. (Phase B) Send a real invitation → confirm Resend message ID + email arrival → complete accept → assert membership row. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Login [PASS/FAIL] | Members [2/2] | Invite E2E [PASS/FAIL/N-A] | VERDICT`

- [x] F4. **State & Scope Fidelity** — `deep`
      Confirm only intended changes shipped: `git diff` on `main` since the build-fix commit touches only `Dockerfile.gateway` (+ docs in B4) — no stray source edits, no touched member/deactivation/role endpoints. Confirm Inngest functions > 0, Render deploy live on correct SHA, cloud migration row present in `_prisma_migrations` (or documented as manually applied). Flag any unaccounted change.
      Output: `Code scope [CLEAN/N issues] | Inngest [N fns] | Deploy SHA [match] | VERDICT`

-> Present consolidated F1–F4 results -> Get explicit user "okay" -> Done.

## Commit Strategy

- **A1**: `fix(docker): set HUSKY=0 so gateway prune does not run husky` — `Dockerfile.gateway` — local `docker build -f Dockerfile.gateway .` exits 0
- **B4**: `docs(deploy): record prod auth-orgs deployment + resolve migration-method conflict` — `docs/**`, `AGENTS.md`
- Env-var, migration, and seed steps are operational (no repo commit) — evidence captured to `.sisyphus/evidence/`

## Success Criteria

### Verification Commands

```bash
# Build green + live on the fix commit
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" \
  | jq '.[0].deploy | {status, commit: .commit.message}'   # status: live

# Config populated
curl -s https://ai-employees-laaa.onrender.com/api/config.js   # non-empty SUPABASE_URL + sb_publishable_ key

# Inngest re-synced
curl -s https://ai-employees-laaa.onrender.com/api/inngest | jq '.functions | length'   # > 0

# Owner role (via SQL Editor or reachable psql)
# SELECT role FROM users WHERE email='victor@dozaldevs.com';   -> PLATFORM_OWNER
# SELECT count(*) FROM tenant_memberships WHERE user_id=(SELECT id FROM users WHERE email='victor@dozaldevs.com');  -> 2
```

### Final Checklist

- [ ] All Phase A "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Owner login works; members page loads (no 403)
- [ ] (Phase B) invitation email delivered + accept creates membership
- [ ] Docs updated; F1–F4 APPROVE; user okay received
