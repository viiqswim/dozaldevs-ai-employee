# Multi-Tenancy Implementation: Running One Summarizer Across DozalDevs and VLRE

## TL;DR

> **Quick Summary**: Introduce a proper `Tenant` table (currently `tenant_id` is an orphaned UUID with no FK), add an encrypted `tenant_secrets` table for per-tenant Slack tokens AND business secrets (Jira, OpenRouter, GitHub), implement Slack OAuth for per-workspace installs, make the Jira webhook tenant-aware, and wire the employee lifecycle to load tenant-specific config at dispatch time. Prove it works by running the same `daily-summarizer` archetype in two real Slack workspaces: **DozalDevs** and **VLRE**.
>
> **Deliverables**:
>
> - `Tenant` + `TenantSecret` Prisma models with FK-enforced relations across 6 existing tables
> - AES-256-GCM encryption utility backed by `ENCRYPTION_KEY` env var
> - Admin API — `/admin/tenants` (CRUD) + `/admin/tenants/:id/secrets` (CRUD) + `/admin/tenants/:id/config`
> - Slack OAuth — `/slack/install?tenant=<uuid>` + `/slack/oauth_callback` endpoints (no UI; redirect-only)
> - Slack Bolt `InstallationStore` backed by `tenant_secrets`
> - Tenant-aware worker dispatch (replaces broad `process.env` spread in `employee-lifecycle.ts`)
> - **Tenant-aware Jira webhook handler** (verify HMAC with tenant's secret; route to tenant's archetype)
> - **Engineering lifecycle injects tenant-scoped `GITHUB_TOKEN` + `OPENROUTER_API_KEY`** (per-tenant billing/repo isolation)
> - Two real tenants ("DozalDevs" + "VLRE") seeded and verified end-to-end (VLRE Slack already connected; DozalDevs Slack OAuth flow run)
> - Integration tests for isolation + automated + manual 2-workspace Slack E2E
>
> **Estimated Effort**: Large+ (22 tasks; 2 added for Jira/Engineering tenant-awareness)
> **Parallel Execution**: YES — 4 waves + final review
> **Critical Path**: T1 → T6 → T7 → T14 → T15 → T17 → T20 → F1-F4

---

## Context

### Original Request

User asked: _"Need to figure out how to run this same summarizer AI employee in two different organizations, so that we can prove that the same employee can be used across multiple organizations without any issues... This will also probably involve saving the env variables in the database instead of in the .env file, so that we can have different env variables for different organizations... We should think about a system so that we can support multi-tenancy, starting with the database... Let's make sure that each tenant (organization) has a name and a unique identifier (tenant_id) that can be used to associate data with the correct tenant."_

**Concrete real-world test case** (per follow-up): Provision two REAL tenants in this platform:

- **DozalDevs** — the user's primary business; needs Slack OAuth flow run.
- **VLRE** — the user's second business; Slack workspace already connected (token previously installed via the legacy global `SLACK_BOT_TOKEN` env var; this plan migrates that legacy install into the new `tenant_secrets` table).

### Interview Summary

**Key architectural decisions** (confirmed via interview):

- **Isolation model**: Shared schema + app-level `tenant_id` filtering (NO Postgres RLS). Simplest, matches existing code, acceptable for 2-100 tenants with rigorous testing.
- **Secret encryption**: App-level AES-256-GCM with `ENCRYPTION_KEY` master key. Portable across self-hosted Docker + Supabase Cloud. No Vault/pgcrypto/external manager dependency.
- **Scope**: Foundation + 2-tenant real-world proof (22 tasks after env audit expansion). Explicit OUT: RLS, tenant-scoped admin API keys, self-serve signup, billing, user auth.
- **Tenant management**: Admin API only via existing `X-Admin-Key` header. No user auth, no org membership.
- **Tenant deletion**: Soft-delete only for tenants (per user policy: data is never physically deleted). Hard-delete for individual secrets (true credential revoke).
- **Legacy system tenant**: Migrate UUID `00000000-0000-0000-0000-000000000001` to a real `Tenant` row named "Platform". Preserves existing test data + default seeds.
- **Slack app architecture**: ONE distributed Slack app with per-workspace OAuth installs (NO admin UI; redirect-only `/slack/install` endpoint). `InstallationStore` resolves `bot_token` per-request by `team_id` → tenant lookup.
- **Env classification (full audit)**: `SLACK_BOT_TOKEN`, `JIRA_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN` are all moved to `tenant_secrets`. Jira webhook handler becomes tenant-aware. Engineering lifecycle injects tenant-scoped `GITHUB_TOKEN` + `OPENROUTER_API_KEY`. Only true platform infrastructure stays in `.env`.
- **Test strategy**: Tests-after + Agent-executed QA. Matches existing 887-test codebase pattern.
- **Verification**: BOTH automated integration tests AND manual 2-workspace Slack end-to-end proof using DozalDevs + VLRE.

### Research Findings

**Current `tenant_id` state** (from `prisma/schema.prisma`):

- 6 tables have `tenant_id` column with default `00000000-...-0001`: `tasks`, `projects`, `feedback`, `departments`, `archetypes`, `knowledge_bases`
- 10 tables lack `tenant_id` entirely: `executions`, `deliverables`, `validation_runs`, `task_status_log`, `risk_models`, `cross_dept_triggers`, `agent_versions`, `clarifications`, `reviews`, `audit_log`
- **No FK constraint** enforces `tenant_id` integrity today — just loose UUIDs
- `Archetype` already has `@@unique([tenant_id, role_name])` — per-tenant archetypes supported at schema level already
- `employee-dispatcher.ts:32` already performs per-tenant archetype resolution

**Current Slack integration state**:

- `server.ts:46-85`: Single global `@slack/bolt` App with hardcoded `process.env.SLACK_BOT_TOKEN`
- `slack-client.ts`: Factory takes `botToken` as constructor arg (good — per-tenant is just a refactor)
- `slack/handlers.ts`: Approve/reject button handlers have no `team_id` extraction — they respond using the global token

**Current worker dispatch (the choke point)**:

- `employee-lifecycle.ts:68-92`: Spreads **ALL** `process.env` into the Fly.io machine env (filtered blacklist). This is where tenant-scoped config must be INJECTED instead of copied from the gateway's environment.

**Env var classification** (after user re-review — full audit):

| Category                                                             | Variables                                                                                                                                                                        | Rationale                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Truly platform-shared** (stay in `.env`)                           | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_API_KEY`, `INNGEST_*`, `FLY_*`, `ENCRYPTION_KEY`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | Our own infrastructure + the single distributed Slack app's credentials.      |
| **Tenant-scoped secrets** (move to `TenantSecret`)                   | `SLACK_BOT_TOKEN` (per workspace), `JIRA_WEBHOOK_SECRET` (per Jira instance), `OPENROUTER_API_KEY` (per billing account), `GITHUB_TOKEN` (per GitHub org/token)                  | Each tenant (DozalDevs, VLRE) has their own values. Fixes mis-classification. |
| **Tenant-scoped config** (move to `Tenant.config` JSONB, non-secret) | `DAILY_SUMMARY_CHANNELS`, `SUMMARY_TARGET_CHANNEL`                                                                                                                               | Non-sensitive tenant preferences; stored in plain JSONB.                      |

**Implication**: The Jira webhook handler (`src/gateway/routes/jira.ts`) MUST become tenant-aware — look up the tenant from the Jira project key or incoming payload, then verify HMAC with that tenant's `JIRA_WEBHOOK_SECRET`. Adds T21. The engineering employee lifecycle (`engineering/task-lifecycle`) must also inject `GITHUB_TOKEN` + `OPENROUTER_API_KEY` from the resolved tenant. Adds T22.

### Metis Review

**Status**: Metis sub-agent invocation was BLOCKED by the 50-descendant session limit. Self-review was performed as a replacement; findings below are already applied to the plan design.

**Gaps identified (applied)**:

- Encryption key validation at boot (32-byte hex, fail-fast) — baked into T2
- Guardrails: never log plaintext secrets, API responses show `{ is_set: true }` only — baked into T8 + Must-NOT-do
- Migration safety split: (a) create tables + backfill in one migration, (b) add FK constraints in a second migration — baked into T1 + T6
- OAuth callback atomicity (code exchange + encrypt + tenant update in one Prisma transaction) — baked into T12
- Idempotency via `slack_team_id` uniqueness; duplicate install returns 409 — baked into T12
- Bot uninstalled edge case: InstallationStore returns null on missing team_id — baked into T13
- Tenant deletion: `onDelete: Cascade` for secrets; block tenant delete if active tasks (409) — baked into T7
- Regression: all 887 existing tests must still pass after Prisma regen — baked into T1 acceptance

---

## Work Objectives

### Core Objective

Transform the AI Employee Platform from effectively single-tenant (orphaned `tenant_id`, shared `.env`, one Slack bot token) into proper multi-tenant architecture with a `Tenant` table, encrypted per-tenant secrets, Slack OAuth for per-workspace installs, and tenant-aware runtime dispatch — proven by running the same `daily-summarizer` archetype across two independent Slack workspaces with zero cross-contamination.

### Concrete Deliverables

- `Tenant` model in Prisma schema with: `id`, `name`, `slug` (URL-safe unique), `slack_team_id` (nullable unique), `config` (JSONB), `status`, timestamps, soft-delete
- `TenantSecret` model in Prisma schema with: `id`, `tenant_id` FK (cascade), `key`, `ciphertext`, `iv`, `auth_tag`, timestamps, `@@unique([tenant_id, key])`
- Two Prisma migrations: (1) create tables + backfill data, (2) add FK constraints
- `src/lib/encryption.ts` — AES-256-GCM `encrypt(plaintext)` / `decrypt(ciphertext)` utilities
- `src/gateway/services/tenant-repository.ts` — Tenant CRUD with slug/team_id lookup helpers
- `src/gateway/services/tenant-secret-repository.ts` — Secret CRUD with encrypt/decrypt
- `src/gateway/routes/admin-tenants.ts` — Admin API for tenant CRUD
- `src/gateway/routes/admin-tenant-secrets.ts` — Admin API for secret CRUD
- `src/gateway/routes/admin-tenant-config.ts` — Admin API for non-secret config
- `src/gateway/routes/slack-oauth.ts` — Install link + OAuth callback endpoints
- `src/gateway/slack/installation-store.ts` — Slack Bolt `InstallationStore` implementation
- `src/gateway/services/tenant-env-loader.ts` — Helper that loads decrypted secrets + config for a tenant
- Updated `src/inngest/employee-lifecycle.ts` — injects tenant-scoped env instead of spreading all `process.env`
- Updated `src/gateway/server.ts` — Slack Bolt uses `InstallationStore` for per-workspace `authorize`
- Updated `prisma/seed.ts` — migrates system tenant → Platform tenant, seeds **DozalDevs + VLRE** real tenants
- **Updated `src/gateway/routes/jira.ts`** — tenant-aware HMAC verification using per-tenant `JIRA_WEBHOOK_SECRET` (T21)
- **Updated `src/inngest/lifecycle.ts` (engineering)** — injects tenant-scoped `GITHUB_TOKEN` + `OPENROUTER_API_KEY` (T22)
- `scripts/setup-two-tenants.ts` — end-to-end provisioning script that:
  - Creates DozalDevs tenant
  - Migrates legacy `SLACK_BOT_TOKEN` env value into VLRE tenant's `tenant_secrets` (preserving existing install)
  - Prompts admin to run DozalDevs Slack OAuth flow
- `scripts/verify-multi-tenancy.ts` — automated verification runner
- `docs/YYYY-MM-DD-HHMM-multi-tenancy-guide.md` — admin flow, OAuth setup, troubleshooting

### Definition of Done

- [ ] `pnpm build` passes with zero new TypeScript errors (pre-existing errors in `lifecycle.ts`/`redispatch.ts`/`seed.ts` unchanged)
- [ ] `pnpm test -- --run` — all 887 existing tests pass + new tests for encryption, tenant repo, secret repo, admin APIs, OAuth callback, InstallationStore (target: 925+ passing)
- [ ] `pnpm lint` passes
- [ ] `curl POST /admin/tenants` creates Tenant with 201 status, returns `{ id, slug, install_link }`
- [ ] `curl POST /admin/tenants/:id/secrets` stores encrypted secret; DB inspection shows ciphertext only (not plaintext)
- [ ] Both real tenants (DozalDevs + VLRE) successfully run `daily-summarizer` with independent Slack digests posted to their respective workspaces
- [ ] Cross-tenant admin API access returns 404 (Tenant A cannot read Tenant B's tasks)
- [ ] `grep -r "process.env.SLACK_BOT_TOKEN" src/ --include="*.ts" | grep -v test | grep -v lifecycle | grep -v server` returns empty (bot token now tenant-scoped)

### Must Have

- Proper `Tenant` model with FK constraints on all 6 current `tenant_id`-bearing tables
- AES-256-GCM encryption for all secrets at rest; plaintext never written to disk or logs
- Slack OAuth install flow functional for 2 separate workspaces
- Slack Bolt `InstallationStore` correctly resolves `bot_token` per `team_id`
- Employee lifecycle loads tenant-specific env (from `TenantSecret` + `Tenant.config`) at dispatch time
- Admin API routes for tenant lifecycle (create/read/update/delete + secret management)
- Cross-tenant isolation enforced at every admin API endpoint (`GET /admin/tenants/:A/tasks/:B_task_id` → 404)
- `ENCRYPTION_KEY` validated at boot; server refuses to start if missing or malformed
- **Soft-delete-only semantics for tenants** (`deleted_at` timestamp); NO hard-delete API surface anywhere in the codebase. Repository, routes, and DB FKs all enforce this. Restore endpoint allows recovery.
- Secrets follow standard hard-delete (true credential revoke, per user decision)
- Seed file updated to create "Platform" tenant (preserving legacy UUID) + DozalDevs + VLRE
- **Jira webhook handler resolves tenant from incoming payload** (e.g., Jira project key → tenant), then verifies HMAC with that tenant's `JIRA_WEBHOOK_SECRET` from `tenant_secrets`. Falls back to platform `.env` value only if tenant has no secret set (migration grace period).
- **Engineering lifecycle injects tenant-scoped `GITHUB_TOKEN` + `OPENROUTER_API_KEY` into worker container env**, falling back to platform `.env` if tenant secret unset.
- Regression: all 887 existing tests continue to pass

### Must NOT Have (Guardrails from Metis Review + Scope Discipline)

- **NO Postgres Row-Level Security (RLS)** — explicitly deferred; shared schema only
- **NO tenant-scoped API keys** (`X-Tenant-Key` header) — admin key remains the single authentication surface
- **NO user authentication / org membership / invite flows** — separate future plan
- **NO self-serve tenant signup UI** — admin creates tenants only
- **NO automatic cron dispatch to all tenants** — only manual trigger via `POST /admin/tenants/:id/employees/:slug/trigger` for this proof
- **NO modifications to engineering worker code itself (`src/workers/orchestrate.mts`)** — only the engineering LIFECYCLE (`src/inngest/lifecycle.ts`) which dispatches the worker is updated to inject tenant-scoped env
- **NO new tables beyond `tenant` and `tenant_secrets`** — resist schema expansion
- **NO adding `tenant_id` to the 10 unrelated tables** (`executions`, `deliverables`, `validation_runs`, `task_status_log`, `risk_models`, `cross_dept_triggers`, `agent_versions`, `clarifications`, `reviews`, `audit_log`) — derive via JOIN when needed
- **NO logging of decrypted secret plaintext** — add explicit check in encryption utility + PR review guardrail
- **NO returning `ciphertext`, `iv`, or `auth_tag` in API responses** — API exposes `{ key, is_set: true, updated_at }` only
- **NO hard-delete of tenant rows ANYWHERE** (per user policy: data is never physically deleted). The repository must NOT expose `hardDelete()`, no route must accept `?hard=true`, no admin script may execute `DELETE FROM tenants`. Defense-in-depth: DB FKs use `ON DELETE RESTRICT`.
- **NO modifications to existing engineering worker (`orchestrate.mts`)** — summarizer generic harness only
- **NO breaking changes to existing admin endpoints** (`/admin/projects` keeps working; new routes are additive)
- **NO scope creep via Metis-flagged patterns**: "while I'm here, let me also...", "since we touched X, let's also fix Y"

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** for automated verification. Manual Slack QA is the one explicit exception (user chose "both automated + manual Slack E2E").
> Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

### Test Decision

- **Infrastructure exists**: YES (Vitest, `pnpm test -- --run`, 887 passing baseline)
- **Automated tests**: YES (tests-after — implement → write tests → ensure all pass)
- **Framework**: Vitest (existing)
- **If TDD**: NO (user chose tests-after + agent-QA)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence pattern:

- **API routes**: `curl` + assert JSON + exit code; save response body to evidence file
- **Services/repos**: `bun`/`node` REPL invocation + assertion on return value
- **Database state**: `psql` SELECT query output; save to evidence file
- **End-to-end**: `scripts/verify-multi-tenancy.ts` programmatic runner; save stdout
- **Manual Slack E2E**: Screenshot evidence of digests in both workspaces (F3 final QA only)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 5 parallel tasks, start immediately):
├── T1:  Prisma schema + migration A (Tenant + TenantSecret tables + backfill)          [quick]
├── T2:  Encryption utility (AES-256-GCM) + ENCRYPTION_KEY validator + tests            [deep]
├── T3:  Tenant repository (CRUD service)                                                [quick]
├── T4:  TenantSecret repository (uses encryption utility from T2)                       [unspecified-high]
└── T5:  Zod validation schemas (tenant + secret + OAuth state)                          [quick]

Wave 2 (Migration + Management API — 5 parallel tasks, after Wave 1):
├── T6:  Prisma migration B (add FK constraints after backfill complete)                 [deep]
├── T7:  Admin API — /admin/tenants (CRUD)                         (deps: T3, T5)        [unspecified-high]
├── T8:  Admin API — /admin/tenants/:id/secrets (CRUD)             (deps: T4, T5)        [unspecified-high]
├── T9:  Admin API — /admin/tenants/:id/config (GET/PATCH)         (deps: T3, T5)        [quick]
└── T10: Update seed.ts — Platform tenant + DozalDevs + VLRE       (deps: T1, T3, T4)    [quick]

Wave 3 (Slack OAuth + Runtime Wiring — 8 parallel tasks, after Wave 2):
├── T11: Slack OAuth install endpoint (/slack/install?tenant=X)   (deps: T3, T5)         [deep]
├── T12: Slack OAuth callback (/slack/oauth_callback, atomic)     (deps: T3, T4, T11)    [deep]
├── T13: Slack InstallationStore implementation                   (deps: T4)             [unspecified-high]
├── T14: Slack Bolt App reconfig (server.ts, uses T13)            (deps: T13)            [unspecified-high]
├── T15: employee-lifecycle.ts — tenant env loader injection      (deps: T3, T4)         [deep]
├── T16: slack tools + param resolver verification                 (deps: T15)            [quick]
├── T21: Tenant-aware Jira webhook handler                         (deps: T3, T4)         [deep]
└── T22: Engineering lifecycle — inject tenant-scoped GITHUB_TOKEN + OPENROUTER_API_KEY (deps: T3, T4) [deep]

Wave 4 (Verification — 4 parallel tasks, after Wave 3):
├── T17: Setup script scripts/setup-two-tenants.ts                (deps: T7, T8, T9, T22) [unspecified-high]
├── T18: Integration tests — tenant isolation + encryption + Jira + Engineering (deps: all above) [unspecified-high]
├── T19: Documentation (docs/multi-tenancy-guide.md)               (deps: T17)            [writing]
└── T20: Verification script scripts/verify-multi-tenancy.ts      (deps: T17)           [deep]

Wave FINAL (After ALL implementation — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — run summarizer in DozalDevs + VLRE Slack workspaces (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T6 → T7 → T14 → T15 → T17 → T20 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 8 (Wave 3)
```

### Dependency Matrix

- **T1**: none → blocks T3, T4, T6, T10
- **T2**: none → blocks T4
- **T3**: T1 → blocks T7, T9, T10, T11, T12, T15, T17, T21, T22
- **T4**: T1, T2 → blocks T8, T10, T12, T13, T15, T17, T21, T22
- **T5**: none → blocks T7, T8, T9, T11
- **T6**: T1, T10 → blocks T11 (safety: FK after backfill)
- **T7**: T3, T5 → blocks T17
- **T8**: T4, T5 → blocks T17
- **T9**: T3, T5 → blocks T17
- **T10**: T1, T3, T4 → blocks T6, T17
- **T11**: T3, T5, T6 → blocks T12
- **T12**: T3, T4, T11 → blocks T17
- **T13**: T4 → blocks T14
- **T14**: T13 → blocks T18
- **T15**: T3, T4 → blocks T16, T17
- **T16**: T15 → blocks T17
- **T17**: T7, T8, T9, T10, T12, T15, T16, T22 → blocks T18, T19, T20
- **T18**: T17, T14, T21, T22 → blocks F1
- **T19**: T17 → blocks F1
- **T20**: T17 → blocks F1
- **T21**: T3, T4 → blocks T18
- **T22**: T3, T4 → blocks T17, T18
- **F1-F4**: all → user okay

### Agent Dispatch Summary

- **Wave 1**: **5** — T1/T3/T5 → `quick`, T2 → `deep`, T4 → `unspecified-high`
- **Wave 2**: **5** — T6 → `deep`, T7/T8 → `unspecified-high`, T9/T10 → `quick`
- **Wave 3**: **8** — T11/T12/T15/T21/T22 → `deep`, T13/T14 → `unspecified-high`, T16 → `quick`
- **Wave 4**: **4** — T17/T18 → `unspecified-high`, T19 → `writing`, T20 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` + `playwright`, F4 → `deep`

---

## TODOs

- [x] 1. **Prisma schema: add Tenant + TenantSecret models + Migration A**

  **What to do**:
  - Add `model Tenant` to `prisma/schema.prisma` with: `id` (UUID), `name`, `slug` (unique), `slack_team_id` (unique nullable), `config` (Json?), `status` (default `"active"`), `created_at`, `updated_at`, `deleted_at` (nullable). Map to table `tenants`.
  - Add `model TenantSecret` with: `id` (UUID), `tenant_id` (UUID FK to Tenant with `onDelete: Cascade`), `key` (string), `ciphertext` (string), `iv` (string), `auth_tag` (string), `created_at`, `updated_at`. Add `@@unique([tenant_id, key])`. Map to table `tenant_secrets`.
  - Add reverse relations on Tenant: `tasks Task[]`, `archetypes Archetype[]`, `projects Project[]`, `departments Department[]`, `secrets TenantSecret[]`. (Do NOT add relations on `feedback`/`knowledge_bases` if their existing `tenant_id` is non-FK — they get FKs in T6 but Prisma relations only need to be declared once they're FK-backed.)
  - Generate Migration A: `pnpm prisma migrate dev --name add_tenant_and_secret_tables --create-only`. Manually edit the generated SQL to:
    1. Create `tenants` table (with the system Platform tenant pre-inserted: `INSERT INTO tenants (id, name, slug, status) VALUES ('00000000-0000-0000-0000-000000000001', 'Platform', 'platform', 'active') ON CONFLICT DO NOTHING;`).
    2. Create `tenant_secrets` table.
    3. **DO NOT** add FK constraints to existing tables yet (saved for T6 after backfill verification).
  - Apply migration: `pnpm prisma migrate dev` (this re-runs and applies).
  - Run `pnpm prisma generate` to regenerate the client.
  - Run `pnpm test -- --run` to confirm 887 baseline tests still pass (regression guard).

  **Must NOT do**:
  - Do NOT add FK constraints in this migration — only table creation + Platform row insertion.
  - Do NOT add `tenant_id` to `executions`, `deliverables`, `validation_runs`, `task_status_log`, `risk_models`, `cross_dept_triggers`, `agent_versions`, `clarifications`, `reviews`, or `audit_log` (explicit Must-NOT-Have).
  - Do NOT modify the existing `default("00000000-...-0001")` clauses on the 6 tables that already have `tenant_id` — leave them as-is for backward compatibility.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema additions are mechanical Prisma edits + a single migration file; no complex logic.
  - **Skills**: none
    - Reasoning: Prisma is documented in-house in `prisma/schema.prisma`; no external skill needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with T2, T3, T4, T5)
  - **Blocks**: T3, T4, T6, T10
  - **Blocked By**: None — start immediately

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:1-40` — existing model header style and `@db.Uuid` usage
  - `prisma/schema.prisma` (search for `model Archetype`) — existing `@@unique([tenant_id, role_name])` pattern to mirror
  - `prisma/schema.prisma` (search for `default(uuid())`) — existing UUID PK pattern
  - `prisma/migrations/` (most recent migration) — naming convention and structure for new migrations

  **External References**:
  - Prisma docs: `https://www.prisma.io/docs/orm/prisma-schema/data-model/relations#cascade-deletes` — onDelete: Cascade syntax

  **WHY Each Reference Matters**:
  - The Archetype model already has the per-tenant unique constraint pattern we're replicating for TenantSecret — copy that style exactly to keep schema consistent.
  - The Platform tenant must be pre-inserted in Migration A so that all 6 existing tables (which default `tenant_id` to `'00000...001'`) maintain referential integrity once FKs are added in T6.

  **Acceptance Criteria**:
  - [ ] `prisma/schema.prisma` contains `model Tenant` and `model TenantSecret` with all fields above.
  - [ ] `pnpm prisma validate` passes (exit 0).
  - [ ] `pnpm prisma migrate dev` applies cleanly.
  - [ ] `psql $DATABASE_URL -c "SELECT id, name, slug FROM tenants WHERE id='00000000-0000-0000-0000-000000000001';"` returns the Platform row.
  - [ ] `psql $DATABASE_URL -c "\d tenants"` and `\d tenant_secrets` show correct columns.
  - [ ] `pnpm test -- --run` — all 887 existing tests still pass.
  - [ ] `pnpm build` — no NEW TypeScript errors (pre-existing errors in `lifecycle.ts`, `redispatch.ts`, `seed.ts`, `lifecycle.test.ts`, `employee-lifecycle.ts` documented and unchanged).

  **QA Scenarios**:

  ```
  Scenario: Migration A applies cleanly and creates Platform tenant
    Tool: Bash
    Preconditions: Clean DB state (or migrations applied through previous head)
    Steps:
      1. Run: pnpm prisma migrate dev --name add_tenant_and_secret_tables
      2. Capture output to .sisyphus/evidence/task-1-migrate.log
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, name, slug FROM tenants;" > .sisyphus/evidence/task-1-platform-row.txt
      4. Assert file contains: "00000000-0000-0000-0000-000000000001 | Platform | platform"
    Expected Result: Migration succeeds (exit 0), Platform tenant exists
    Failure Indicators: Migration error, missing Platform row, FK errors
    Evidence: .sisyphus/evidence/task-1-migrate.log, .sisyphus/evidence/task-1-platform-row.txt

  Scenario: Regression — all existing tests still pass
    Tool: Bash
    Preconditions: Migration applied, prisma client regenerated
    Steps:
      1. Run: pnpm prisma generate
      2. Run: pnpm test -- --run 2>&1 | tee .sisyphus/evidence/task-1-tests.log
      3. Grep for "Tests" summary line; assert "887 passed" or higher
    Expected Result: All 887 baseline tests still pass; new failures = 0
    Failure Indicators: Any new test failure not in the documented pre-existing list
    Evidence: .sisyphus/evidence/task-1-tests.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-migrate.log`
  - [ ] `.sisyphus/evidence/task-1-platform-row.txt`
  - [ ] `.sisyphus/evidence/task-1-tests.log`

  **Commit**: YES (groups as own commit)
  - Message: `feat(db): add Tenant and TenantSecret models with migration A`
  - Files: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_add_tenant_and_secret_tables/migration.sql`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 2. **Encryption utility (AES-256-GCM) + ENCRYPTION_KEY validator + tests**

  **What to do**:
  - Create `src/lib/encryption.ts` exporting:
    - `interface EncryptedPayload { ciphertext: string; iv: string; auth_tag: string; }`
    - `function encrypt(plaintext: string): EncryptedPayload` — uses Node `crypto.createCipheriv("aes-256-gcm", key, iv)` with random 12-byte IV, returns base64-encoded `ciphertext`, `iv`, `auth_tag`.
    - `function decrypt(payload: EncryptedPayload): string` — uses `crypto.createDecipheriv("aes-256-gcm", key, iv)`, validates auth tag, throws on mismatch.
    - `function validateEncryptionKey(): void` — reads `process.env.ENCRYPTION_KEY`, validates it's exactly 64 hex chars (32 bytes), throws `Error("ENCRYPTION_KEY missing or malformed (must be 64-char hex string)")` if invalid. Called at server boot.
  - Add `ENCRYPTION_KEY=<generated>` to `.env.example` with comment `# Generate with: openssl rand -hex 32`.
  - Wire `validateEncryptionKey()` into `src/gateway/server.ts` startup — call BEFORE Express listen, fail-fast if missing.
  - Create `src/lib/encryption.test.ts` with Vitest tests:
    - Roundtrip: `decrypt(encrypt("hello")) === "hello"`
    - Roundtrip with empty string: handles ""
    - Roundtrip with unicode: handles "héllo 世界"
    - Tamper detection: modifying `ciphertext` or `auth_tag` causes `decrypt()` to throw
    - Different IVs: encrypting same plaintext twice produces different ciphertexts (IV randomness)
    - `validateEncryptionKey()` throws on missing env var (use `vi.stubEnv`)
    - `validateEncryptionKey()` throws on wrong-length key
    - `validateEncryptionKey()` throws on non-hex key
    - `validateEncryptionKey()` succeeds on valid 64-char hex key
  - Add a CI guard: helper function `assertNoPlaintextLogged(plaintext: string, logOutput: string)` exported for use in repo tests later (T4).

  **Must NOT do**:
  - Do NOT log plaintext, even at debug level — explicit Must-NOT-Have.
  - Do NOT use AES-CBC, AES-CTR, or non-authenticated modes — must be GCM (authenticated).
  - Do NOT hardcode the key as a fallback default — fail-fast if env var is missing.
  - Do NOT use `Buffer.from(plaintext, 'hex')` for plaintext — that's a misuse (plaintext is utf8).
  - Do NOT export the raw key buffer — only encrypt/decrypt/validate.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cryptography correctness is critical (auth tag handling, IV randomness, key validation) — must reason carefully about security boundaries.
  - **Skills**: none
    - Reasoning: Node `crypto` is well-documented inline; no external skill needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with T1, T3, T4, T5)
  - **Blocks**: T4
  - **Blocked By**: None — start immediately

  **References**:

  **Pattern References**:
  - `src/lib/logger.ts` — existing lib pattern (named exports, no default export)
  - `src/lib/retry.ts` — error class + thrown errors pattern
  - `src/lib/errors.ts` — custom Error subclasses if needed
  - `tests/lib/` (any existing lib test) — Vitest test structure (`describe`, `it`, `expect`, `vi.stubEnv`)

  **External References**:
  - Node docs: `https://nodejs.org/api/crypto.html#class-cipher` — createCipheriv API + GCM auth tag handling
  - Node docs: `https://nodejs.org/api/crypto.html#cryptorandombytessize-callback` — randomBytes for IV generation

  **WHY Each Reference Matters**:
  - GCM mode requires explicit `getAuthTag()` after encryption and `setAuthTag()` before decryption — this is easy to forget and produces silent corruption. The Node docs example shows the correct sequence.
  - Existing `src/lib/` files establish the export style (named exports, types alongside, no classes for utilities).

  **Acceptance Criteria**:
  - [ ] `src/lib/encryption.ts` exists with `encrypt`, `decrypt`, `validateEncryptionKey` exports.
  - [ ] `src/lib/encryption.test.ts` exists with all 9 tests above passing.
  - [ ] `pnpm test src/lib/encryption.test.ts -- --run` exits 0.
  - [ ] `validateEncryptionKey()` is invoked in `src/gateway/server.ts` startup.
  - [ ] `.env.example` contains `ENCRYPTION_KEY` line with generation hint.
  - [ ] `pnpm build` no new errors.
  - [ ] `pnpm lint` clean for new file.

  **QA Scenarios**:

  ```
  Scenario: Encryption roundtrip with all data types
    Tool: Bash
    Preconditions: encryption.ts compiled
    Steps:
      1. Set ENCRYPTION_KEY=$(openssl rand -hex 32) in shell
      2. Run: pnpm test src/lib/encryption.test.ts -- --run 2>&1 | tee .sisyphus/evidence/task-2-tests.log
      3. Assert all 9 tests pass
    Expected Result: 9 tests pass, 0 failures
    Failure Indicators: Any test fails, particularly tamper detection or IV randomness
    Evidence: .sisyphus/evidence/task-2-tests.log

  Scenario: Server refuses to boot with missing/malformed ENCRYPTION_KEY
    Tool: Bash
    Preconditions: encryption.ts wired into server.ts startup
    Steps:
      1. Run: ENCRYPTION_KEY="" node dist/gateway/server.js 2>&1 | tee .sisyphus/evidence/task-2-boot-fail.log
      2. Assert exit code != 0
      3. Assert log contains "ENCRYPTION_KEY missing or malformed"
      4. Run: ENCRYPTION_KEY="too-short" node dist/gateway/server.js 2>&1 | tee -a .sisyphus/evidence/task-2-boot-fail.log
      5. Assert same failure mode
    Expected Result: Server exits with clear error message; never starts listening
    Failure Indicators: Server starts despite invalid key, or generic/unclear error
    Evidence: .sisyphus/evidence/task-2-boot-fail.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-2-tests.log`
  - [ ] `.sisyphus/evidence/task-2-boot-fail.log`

  **Commit**: YES (own commit)
  - Message: `feat(lib): add AES-256-GCM encryption utility with key validation`
  - Files: `src/lib/encryption.ts`, `src/lib/encryption.test.ts`, `src/gateway/server.ts`, `.env.example`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 3. **Tenant repository (CRUD service) — soft-delete only**

  **What to do**:
  - Create `src/gateway/services/tenant-repository.ts` exporting a `TenantRepository` class (match existing repo pattern in `src/gateway/services/employee-dispatcher.ts` — class with injected `PrismaClient`).
  - Methods:
    - `create(input: { name: string; slug: string; config?: Json }): Promise<Tenant>` — creates tenant, returns full row.
    - `findById(id: string): Promise<Tenant | null>` — scoped to non-deleted (`deleted_at IS NULL`).
    - `findBySlug(slug: string): Promise<Tenant | null>` — same scope.
    - `findBySlackTeamId(teamId: string): Promise<Tenant | null>` — same scope (only ACTIVE tenants resolve via Slack Bolt; soft-deleted tenants reject installations).
    - `list(opts?: { includeDeleted?: boolean }): Promise<Tenant[]>` — default excludes soft-deleted; `includeDeleted: true` returns all.
    - `update(id: string, patch: Partial<...>): Promise<Tenant>` — whitelist patchable fields (name, config, status, slack_team_id).
    - `softDelete(id: string): Promise<Tenant>` — sets `deleted_at = now()`. Idempotent: re-soft-deleting a soft-deleted tenant is a no-op (returns the existing row).
    - `restore(id: string): Promise<Tenant>` — sets `deleted_at = null`. Throws if `slug` collides with an active tenant created since the soft-delete.
  - **NO `hardDelete` method.** Per user decision: data is NEVER physically deleted. All deletion is soft-delete via `deleted_at`. Repository must not expose any DELETE escape hatch.
  - Create `src/gateway/services/tenant-repository.test.ts` — Vitest tests using `@/prisma` client against the real test DB (or `prismock` if already used in existing tests; check `tests/` for precedent).
  - Tests must cover: create, findById (happy + not-found + soft-deleted-excluded), findBySlug, findBySlackTeamId, update (whitelist enforcement), softDelete, softDelete idempotency, restore success, restore blocked on slug collision, list excludes vs includes deleted.

  **Must NOT do**:
  - Do NOT add a `hardDelete()` method, ANY method that runs `DELETE FROM tenants`, or any raw SQL escape hatch (per user policy: NEVER delete data).
  - Do NOT allow `id`, `created_at`, or `deleted_at` to be patched via `update()`.
  - Do NOT expose a raw query escape hatch — all operations go through defined methods.
  - Do NOT cross-tenant query without explicit intent (no generic `findAny()` helper).

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard repository pattern following existing codebase conventions.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with T1, T2, T4, T5)
  - **Blocks**: T7, T9, T10, T11, T12, T15, T17
  - **Blocked By**: T1 (needs Prisma model generated)

  **References**:

  **Pattern References**:
  - `src/gateway/services/employee-dispatcher.ts` — existing service class pattern with Prisma client constructor
  - `src/gateway/services/project-repository.ts` (or nearest equivalent) — CRUD structure, error handling
  - `tests/gateway/services/*.test.ts` — service test structure

  **WHY Each Reference Matters**:
  - `employee-dispatcher.ts:32` already queries per-tenant archetypes; the new `TenantRepository` should use the same `PrismaClient` constructor-injection style so it can be wired into the route factories identically.

  **Acceptance Criteria**:
  - [ ] `src/gateway/services/tenant-repository.ts` exports `TenantRepository` class.
  - [ ] All 8 methods implemented (create, findById, findBySlug, findBySlackTeamId, list, update, softDelete, restore). NO hardDelete.
  - [ ] `grep -n "hardDelete\|DELETE FROM tenants" src/gateway/services/tenant-repository.ts` returns empty.
  - [ ] `src/gateway/services/tenant-repository.test.ts` exists with 12+ tests.
  - [ ] `pnpm test src/gateway/services/tenant-repository.test.ts -- --run` — all pass.
  - [ ] `pnpm build` no new errors.

  **QA Scenarios**:

  ```
  Scenario: CRUD + soft-delete + restore roundtrip
    Tool: Bash (node REPL)
    Preconditions: T1 migration applied, prisma generated
    Steps:
      1. Write a small runner script .sisyphus/evidence/task-3-runner.mts that imports the repo, creates a tenant, fetches by id, updates name, lists, soft-deletes, verifies soft-delete excluded from list, restores, verifies present in list again.
      2. Run: pnpm tsx .sisyphus/evidence/task-3-runner.mts 2>&1 | tee .sisyphus/evidence/task-3-crud.log
      3. Assert all assertions pass; exit 0.
    Expected Result: All CRUD operations succeed; soft-deleted excluded from default list; restore reverses soft-delete
    Failure Indicators: Any assertion fails, soft-deleted row appears in list(), restore fails
    Evidence: .sisyphus/evidence/task-3-crud.log

  Scenario: Hard-delete API surface does NOT exist
    Tool: Bash (grep)
    Preconditions: tenant-repository.ts written
    Steps:
      1. Run: grep -nE "hardDelete|DELETE FROM tenants|prisma\.tenant\.delete" src/gateway/services/tenant-repository.ts > .sisyphus/evidence/task-3-no-hard-delete.log
      2. Assert file is empty (no matches)
    Expected Result: Repository contains no hard-delete code path
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-3-no-hard-delete.log

  Scenario: Restore blocked on slug collision
    Tool: Bash (vitest)
    Preconditions: Tenant A (slug="probe") soft-deleted; new Tenant B created with slug="probe"
    Steps:
      1. Call repo.restore(tenantA_id)
      2. Assert error thrown with message about slug conflict
    Expected Result: Restore fails cleanly; tenant A remains soft-deleted
    Evidence: .sisyphus/evidence/task-3-restore-conflict.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-crud.log`
  - [ ] `.sisyphus/evidence/task-3-no-hard-delete.log`
  - [ ] `.sisyphus/evidence/task-3-restore-conflict.log`

  **Commit**: YES
  - Message: `feat(gateway): add tenant repository service with soft-delete-only semantics`
  - Files: `src/gateway/services/tenant-repository.ts`, `src/gateway/services/tenant-repository.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 4. **TenantSecret repository (with encryption)**

  **What to do**:
  - Create `src/gateway/services/tenant-secret-repository.ts` exporting `TenantSecretRepository` class.
  - Methods:
    - `set(tenantId: string, key: string, plaintext: string): Promise<{ key: string; is_set: true; updated_at: Date }>` — upserts: encrypts plaintext via `src/lib/encryption.ts`, stores `{ciphertext, iv, auth_tag}`.
    - `get(tenantId: string, key: string): Promise<string | null>` — returns DECRYPTED plaintext; null if not found.
    - `listKeys(tenantId: string): Promise<Array<{ key: string; is_set: true; updated_at: Date }>>` — list without plaintext.
    - `delete(tenantId: string, key: string): Promise<boolean>` — returns true if deleted.
    - `getMany(tenantId: string, keys: string[]): Promise<Record<string, string>>` — batch decrypt for tenant env loader (T15).
  - Create `src/gateway/services/tenant-secret-repository.test.ts`:
    - Set + get roundtrip returns plaintext exactly.
    - `listKeys` does NOT return plaintext or ciphertext.
    - Upsert: setting the same key twice updates ciphertext (different IV each time).
    - Delete removes row; subsequent get returns null.
    - Cross-tenant isolation: tenant A's secret NOT returned for tenant B's query.
    - getMany batch returns only keys that exist.
    - Decryption failure (tampered ciphertext) throws and does not leak plaintext.

  **Must NOT do**:
  - Do NOT return `ciphertext`, `iv`, or `auth_tag` from any method (security guardrail).
  - Do NOT log plaintext OR ciphertext at any level.
  - Do NOT cache plaintext in memory between calls — decrypt on every `get()`.
  - Do NOT allow `listKeys` to leak "is_set: false" for unset keys (skip them entirely).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-sensitive; requires careful attention to data-at-rest and no-plaintext-leak rules.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with T1, T2, T3, T5)
  - **Blocks**: T8, T10, T12, T13, T15, T17
  - **Blocked By**: T1 (Prisma model) AND T2 (encryption utility)

  **References**:

  **Pattern References**:
  - `src/gateway/services/tenant-repository.ts` (from T3) — same class pattern
  - `src/lib/encryption.ts` (from T2) — encrypt/decrypt API

  **WHY Each Reference Matters**:
  - T3's repository establishes the canonical shape — match it exactly for consistency (route layer can treat them uniformly).

  **Acceptance Criteria**:
  - [ ] `src/gateway/services/tenant-secret-repository.ts` exists with 5 methods.
  - [ ] 7+ tests in `tenant-secret-repository.test.ts`, all pass.
  - [ ] DB inspection after `set()` shows ciphertext differs from plaintext.
  - [ ] `pnpm build` no new errors.

  **QA Scenarios**:

  ```
  Scenario: Encryption proof — DB ciphertext is NOT plaintext
    Tool: Bash
    Preconditions: T1 + T2 applied
    Steps:
      1. Via REPL or test: repo.set(tenantId, "test_key", "super-secret-token-xyz")
      2. Run: psql $DATABASE_URL -c "SELECT ciphertext FROM tenant_secrets WHERE key='test_key';" | tee .sisyphus/evidence/task-4-ciphertext.txt
      3. Assert output does NOT contain "super-secret-token-xyz"
      4. Call repo.get(tenantId, "test_key") — assert returns "super-secret-token-xyz"
    Expected Result: Plaintext stored nowhere; roundtrip returns original
    Failure Indicators: plaintext visible in ciphertext column
    Evidence: .sisyphus/evidence/task-4-ciphertext.txt

  Scenario: Cross-tenant isolation
    Tool: Bash
    Preconditions: Two tenants exist
    Steps:
      1. repo.set(tenantA, "shared_key", "secret-A")
      2. repo.set(tenantB, "shared_key", "secret-B")
      3. Assert repo.get(tenantA, "shared_key") === "secret-A"
      4. Assert repo.get(tenantB, "shared_key") === "secret-B"
      5. Save outputs to .sisyphus/evidence/task-4-isolation.log
    Expected Result: Each tenant reads only their own value
    Failure Indicators: Wrong tenant's secret returned
    Evidence: .sisyphus/evidence/task-4-isolation.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4-ciphertext.txt`
  - [ ] `.sisyphus/evidence/task-4-isolation.log`

  **Commit**: YES
  - Message: `feat(gateway): add tenant secret repository with AES-256-GCM storage`
  - Files: `src/gateway/services/tenant-secret-repository.ts`, `src/gateway/services/tenant-secret-repository.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 5. **Zod validation schemas for tenant management**

  **What to do**:
  - Add to `src/gateway/validation/schemas.ts` the following Zod schemas (follow existing `UUID_REGEX` pattern noted in AGENTS.md — do NOT use strict `z.string().uuid()` for tenant UUIDs since the system tenant violates RFC 4122 version bits):
    - `CreateTenantBodySchema`: `{ name: string (1..200), slug: string (matches /^[a-z0-9-]+$/, 1..64), config?: Record<string, unknown> }`
    - `UpdateTenantBodySchema`: `{ name?: string, config?: Record<string, unknown>, status?: "active" | "suspended" }`
    - `TenantIdParamSchema`: `{ tenantId: string matching UUID_REGEX }`
    - `SecretKeyParamSchema`: `{ tenantId: UUID_REGEX, key: string (1..100, /^[a-z0-9_]+$/) }`
    - `SetSecretBodySchema`: `{ value: string (1..10000) }`
    - `TenantConfigBodySchema`: `{ summary?: { channel_ids?: string[], target_channel?: string } }` — extensible for future
    - `SlackOAuthStateSchema`: `{ tenant_id: UUID_REGEX, nonce: string (32 chars) }`
  - Export all schemas as named exports.
  - Add tests to existing `tests/gateway/validation/schemas.test.ts` (or create if not present).

  **Must NOT do**:
  - Do NOT use strict `z.string().uuid()` — breaks system tenant UUID parsing (per AGENTS.md).
  - Do NOT define duplicate schemas — reuse existing `UUID_REGEX` if exported.
  - Do NOT accept arbitrary JSON payloads for `config` without size/depth limits (DoS guard).

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definitions are mechanical; existing patterns in `schemas.ts` guide structure.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with T1-T4)
  - **Blocks**: T7, T8, T9, T11
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/validation/schemas.ts` — existing zod schemas + `UUID_REGEX` pattern
  - Existing route files — how schemas are imported and `.parse()`'d

  **Acceptance Criteria**:
  - [ ] All 7 schemas exported from `src/gateway/validation/schemas.ts`.
  - [ ] Tests cover: valid input parses, invalid slug rejected, invalid UUID rejected, oversized value rejected.
  - [ ] `pnpm test tests/gateway/validation/schemas.test.ts -- --run` passes.

  **QA Scenarios**:

  ```
  Scenario: Schema validation rejects bad input, accepts good input
    Tool: Bash
    Preconditions: Schemas file updated
    Steps:
      1. Run: pnpm test tests/gateway/validation/schemas.test.ts -- --run 2>&1 | tee .sisyphus/evidence/task-5-tests.log
      2. Assert all new schema tests pass.
    Expected Result: All pass
    Failure Indicators: Any schema accepts bad input or rejects good input
    Evidence: .sisyphus/evidence/task-5-tests.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-5-tests.log`

  **Commit**: YES
  - Message: `feat(gateway): add zod schemas for tenant and secret management`
  - Files: `src/gateway/validation/schemas.ts`, `tests/gateway/validation/schemas.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 6. **Prisma Migration B: enforce FK constraints on tenant_id columns**

  **What to do**:
  - Generate Migration B: `pnpm prisma migrate dev --name enforce_tenant_id_foreign_keys --create-only`.
  - Manually edit the generated SQL to ALTER each of the 6 tables that already have `tenant_id`:
    - `tasks`, `projects`, `feedback`, `departments`, `archetypes`, `knowledge_bases`
    - Add `ALTER TABLE <table> ADD CONSTRAINT <table>_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE;`
  - Update `prisma/schema.prisma` to declare the corresponding `@relation(fields: [tenant_id], references: [id], onDelete: Restrict)` on each model.
  - Pre-flight backfill check (BEFORE applying): write a verification SQL that counts orphaned `tenant_id` references — `SELECT COUNT(*) FROM tasks t WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = t.tenant_id);` for each table. If any returns > 0, the migration MUST fail loudly (do not silently leave orphans). The Platform tenant inserted in T1 should cover the existing system tenant references.
  - Apply migration: `pnpm prisma migrate dev`.
  - Run `pnpm prisma generate` and `pnpm test -- --run` (regression).

  **Note on policy alignment**: Per user policy, the application layer NEVER hard-deletes tenants (T3 has no `hardDelete()` method). The `RESTRICT` clause is defense-in-depth — if any future code path or manual psql attempts a `DELETE FROM tenants`, the FK will block it.

  **Must NOT do**:
  - Do NOT use `ON DELETE CASCADE` on these FKs — use `RESTRICT` (defense-in-depth against accidental hard-delete; aligns with user's "never delete data" policy).
  - Do NOT use `ON DELETE SET NULL` — orphans break tenant scoping.
  - Do NOT add FKs to the 10 tables that lack `tenant_id` (explicit Must-NOT-Have).
  - Do NOT skip the orphan pre-flight check.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: FK migrations on production-shape data require careful pre-flight safety checks; mistakes here can corrupt referential integrity.

  **Parallelization**:
  - **Can Run In Parallel**: NO — must wait for T10 (seed) to complete to ensure backfill data exists.
  - **Parallel Group**: Wave 2 (sequenced after T10)
  - **Blocks**: T11
  - **Blocked By**: T1, T10 (seed must run before FK enforcement)

  **References**:

  **Pattern References**:
  - `prisma/migrations/` — most recent migration for SQL formatting
  - `prisma/schema.prisma` — existing `@relation` declarations on other models for syntax

  **Acceptance Criteria**:
  - [ ] Migration B SQL file exists and includes all 6 ALTER TABLE statements.
  - [ ] Pre-flight orphan check SQL is documented (run manually before applying, or embedded in migration).
  - [ ] `pnpm prisma migrate status` shows both migrations applied.
  - [ ] `psql $DATABASE_URL -c "\d tasks"` shows FK to tenants(id) exists.
  - [ ] `pnpm test -- --run` regression passes.
  - [ ] Attempting to insert a row with non-existent tenant_id in `tasks` raises `foreign_key_violation`.

  **QA Scenarios**:

  ```
  Scenario: FK constraint enforces tenant existence
    Tool: Bash
    Preconditions: Migration B applied, Platform + 2 demo tenants seeded (T10 complete)
    Steps:
      1. Run: psql $DATABASE_URL -c "INSERT INTO tasks (id, tenant_id, status) VALUES (gen_random_uuid(), '99999999-9999-9999-9999-999999999999', 'Ready');" 2>&1 | tee .sisyphus/evidence/task-6-fk-violation.log
      2. Assert output contains "violates foreign key constraint"
    Expected Result: INSERT fails with FK violation
    Failure Indicators: INSERT succeeds (FK not enforced)
    Evidence: .sisyphus/evidence/task-6-fk-violation.log

  Scenario: Defense-in-depth — DB rejects manual hard-delete of tenant with data
    Tool: Bash
    Preconditions: Tenant with at least one task exists
    Steps:
      1. Run: psql $DATABASE_URL -c "DELETE FROM tenants WHERE slug='dozaldevs';" 2>&1 | tee .sisyphus/evidence/task-6-delete-block.log
      2. Assert output contains "violates foreign key constraint" (RESTRICT behavior)
    Expected Result: DELETE blocked at DB layer (defense-in-depth; app layer also has no hardDelete API)
    Failure Indicators: DELETE succeeds (RESTRICT not working)
    Evidence: .sisyphus/evidence/task-6-delete-block.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-6-fk-violation.log`
  - [ ] `.sisyphus/evidence/task-6-delete-block.log`

  **Commit**: YES
  - Message: `feat(db): enforce foreign key constraints on tenant_id columns`
  - Files: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_enforce_tenant_id_foreign_keys/migration.sql`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 7. **Admin API: /admin/tenants CRUD routes**

  **What to do**:
  - Create `src/gateway/routes/admin-tenants.ts` exporting a route factory (mirror `src/gateway/routes/admin-employee-trigger.ts` style — `createAdminTenantsRouter(deps: { repo, logger })`).
  - Endpoints (all require `X-Admin-Key` middleware from `src/gateway/middleware/admin-auth.ts`):
    - `POST /admin/tenants` — body validated via `CreateTenantBodySchema`; calls `repo.create()`; returns `201 { id, slug, install_link: "/slack/install?tenant={id}" }`. Returns `409` on slug collision (Prisma `P2002`).
    - `GET /admin/tenants` — returns array of tenants (slug, name, status, slack_team_id, created_at). Supports `?include_deleted=true` query.
    - `GET /admin/tenants/:tenantId` — returns full tenant record. `404` if not found or soft-deleted (unless `?include_deleted=true`).
    - `PATCH /admin/tenants/:tenantId` — body validated via `UpdateTenantBodySchema`; returns updated tenant. `404` if not found.
    - `DELETE /admin/tenants/:tenantId` — **soft-delete only**. Calls `repo.softDelete()`; returns `200 { id, deleted_at }`. There is NO hard-delete option (per user policy: data is never physically deleted).
    - `POST /admin/tenants/:tenantId/restore` — calls `repo.restore()`; returns `200` on success, `409` if slug now collides with active tenant, `404` if tenant not found at all.
  - Wire router into `src/gateway/server.ts`.
  - Create `tests/gateway/routes/admin-tenants.test.ts` (mirror existing route test style) — test all 6 endpoints + auth (no key → 401, wrong key → 401), 404, 409 paths.

  **Must NOT do**:
  - Do NOT add a `?hard=true` query param or any hard-delete code path (per user policy).
  - Do NOT expose tenant `secrets` data via these routes — that's T8.
  - Do NOT allow patching `slug` (immutable identifier) or `id`.
  - Do NOT bypass admin auth — every endpoint goes through middleware.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-endpoint REST surface with edge cases (404, 409, soft-delete, hard-delete) — needs careful coverage but not algorithmically deep.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with T6, T8, T9, T10)
  - **Blocks**: T17
  - **Blocked By**: T3, T5

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-employee-trigger.ts` — route factory pattern, X-Admin-Key middleware wiring, status codes
  - `src/gateway/routes/admin-projects.ts` — REST conventions in this codebase
  - `src/gateway/middleware/admin-auth.ts` — auth middleware to apply to all routes

  **Acceptance Criteria**:
  - [ ] All 6 endpoints implemented and registered in server.ts.
  - [ ] Auth enforced (curl without `X-Admin-Key` → 401).
  - [ ] No `?hard=true` parameter accepted on DELETE (verified via test).
  - [ ] `grep -nE "hard.*delete|prisma\.tenant\.delete" src/gateway/routes/admin-tenants.ts` returns empty.
  - [ ] All test cases pass.
  - [ ] `pnpm build` no new errors.

  **QA Scenarios**:

  ```
  Scenario: Full lifecycle via curl (soft-delete + restore)
    Tool: Bash (curl)
    Preconditions: Server running with ADMIN_API_KEY set
    Steps:
      1. POST /admin/tenants with {"name":"Test","slug":"test"} → expect 201
      2. GET /admin/tenants/{id} → expect 200 with name="Test"
      3. PATCH /admin/tenants/{id} with {"name":"Renamed"} → expect 200
      4. DELETE /admin/tenants/{id} → expect 200 with {deleted_at:<iso>}
      5. GET /admin/tenants/{id} → expect 404 (soft-deleted)
      6. GET /admin/tenants/{id}?include_deleted=true → expect 200
      7. POST /admin/tenants/{id}/restore → expect 200
      8. GET /admin/tenants/{id} → expect 200 (restored)
      9. Save all responses to .sisyphus/evidence/task-7-crud.log
    Expected Result: All status codes correct; restore reverses soft-delete
    Failure Indicators: Wrong status, soft-deleted tenant returned without flag, restore fails
    Evidence: .sisyphus/evidence/task-7-crud.log

  Scenario: Hard-delete API surface does NOT exist
    Tool: Bash (curl + grep)
    Preconditions: Server running
    Steps:
      1. curl -X DELETE "http://localhost:3000/admin/tenants/{id}?hard=true" -H "X-Admin-Key: $K"
      2. Assert response is 200 (param ignored, soft-delete still applies) — NOT a hard delete
      3. Verify row STILL exists in DB (only deleted_at is set): psql -c "SELECT id, deleted_at FROM tenants WHERE id='{id}';"
      4. Save to .sisyphus/evidence/task-7-no-hard-delete.log
    Expected Result: hard=true param has no effect; row remains
    Failure Indicators: Row physically deleted from DB
    Evidence: .sisyphus/evidence/task-7-no-hard-delete.log

  Scenario: Auth + 409 paths
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. POST /admin/tenants WITHOUT X-Admin-Key → expect 401
      2. POST /admin/tenants with duplicate slug (twice in a row) → first 201, second 409
      3. Save outputs
    Expected Result: Auth and conflict handling correct
    Failure Indicators: 200 without auth, 500 instead of 409
    Evidence: .sisyphus/evidence/task-7-auth-conflict.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-7-crud.log`
  - [ ] `.sisyphus/evidence/task-7-no-hard-delete.log`
  - [ ] `.sisyphus/evidence/task-7-auth-conflict.log`

  **Commit**: YES
  - Message: `feat(gateway): add /admin/tenants CRUD routes`
  - Files: `src/gateway/routes/admin-tenants.ts`, `src/gateway/server.ts`, `tests/gateway/routes/admin-tenants.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 8. **Admin API: /admin/tenants/:id/secrets CRUD routes**

  **What to do**:
  - Create `src/gateway/routes/admin-tenant-secrets.ts` exporting `createAdminTenantSecretsRouter(deps: { secretRepo, tenantRepo, logger })`.
  - Endpoints (all require `X-Admin-Key`):
    - `GET /admin/tenants/:tenantId/secrets` — returns `[{ key, is_set: true, updated_at }]`. NEVER includes plaintext, ciphertext, iv, or auth_tag.
    - `PUT /admin/tenants/:tenantId/secrets/:key` — body `{ value: string }` validated; calls `secretRepo.set()`; returns `200 { key, is_set: true, updated_at }`.
    - `DELETE /admin/tenants/:tenantId/secrets/:key` — returns `204` on success, `404` if not found.
  - Pre-flight: every endpoint checks `tenantRepo.findById(tenantId)` first; returns `404` if tenant missing/soft-deleted.
  - Add tests covering: set + list shows key, double-PUT updates (different ciphertext), delete removes, list NEVER leaks plaintext, cross-tenant 404.

  **Must NOT do**:
  - Do NOT add a `GET /admin/tenants/:tenantId/secrets/:key` endpoint that returns plaintext — write-only by design.
  - Do NOT log the request body containing `value` — middleware redaction required.
  - Do NOT expose ciphertext fields in any response.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-sensitive endpoints; need careful redaction + response shape audit.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with T6, T7, T9, T10)
  - **Blocks**: T17
  - **Blocked By**: T4, T5

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-tenants.ts` (from T7) — same factory pattern
  - `src/gateway/middleware/admin-auth.ts` — auth wiring
  - Any existing route with body-redacted logging (search for `redact` in src/lib/logger.ts)

  **Acceptance Criteria**:
  - [ ] 3 endpoints implemented and registered.
  - [ ] No endpoint returns plaintext; tested via curl + grep.
  - [ ] Cross-tenant 404 enforced.
  - [ ] Server logs show no plaintext for `value` field on PUT requests.

  **QA Scenarios**:

  ```
  Scenario: Set + list never leaks plaintext
    Tool: Bash (curl)
    Preconditions: Server running, tenant created
    Steps:
      1. PUT /admin/tenants/{id}/secrets/slack_bot_token with {"value":"xoxb-secret-123"} → expect 200
      2. GET /admin/tenants/{id}/secrets → save response
      3. Assert response does NOT contain "xoxb-secret-123" or "ciphertext" or "iv"
      4. Assert response contains {"key":"slack_bot_token","is_set":true}
    Expected Result: Only metadata returned
    Failure Indicators: Plaintext or encrypted fields in response
    Evidence: .sisyphus/evidence/task-8-no-plaintext.log

  Scenario: Server logs do not contain plaintext
    Tool: Bash
    Preconditions: Server logs streamed to file
    Steps:
      1. Tail /tmp/ai-dev.log into .sisyphus/evidence/task-8-server.log
      2. PUT /admin/tenants/{id}/secrets/test_key with {"value":"PLAINTEXT_MARKER_XYZ"}
      3. Stop tailing
      4. Assert .sisyphus/evidence/task-8-server.log does NOT contain "PLAINTEXT_MARKER_XYZ"
    Expected Result: No plaintext in logs
    Failure Indicators: Plaintext marker found
    Evidence: .sisyphus/evidence/task-8-server.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-8-no-plaintext.log`
  - [ ] `.sisyphus/evidence/task-8-server.log`

  **Commit**: YES
  - Message: `feat(gateway): add /admin/tenants/:id/secrets CRUD routes`
  - Files: `src/gateway/routes/admin-tenant-secrets.ts`, `src/gateway/server.ts`, `tests/gateway/routes/admin-tenant-secrets.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 9. **Admin API: /admin/tenants/:id/config endpoints**

  **What to do**:
  - Create `src/gateway/routes/admin-tenant-config.ts` exporting `createAdminTenantConfigRouter(deps: { tenantRepo, logger })`.
  - Endpoints:
    - `GET /admin/tenants/:tenantId/config` — returns `tenant.config` (or `{}` if null).
    - `PATCH /admin/tenants/:tenantId/config` — body validated via `TenantConfigBodySchema`; merges (NOT replaces) into existing config; returns merged result.
  - Use deep merge (lodash-style), not shallow `{ ...old, ...new }`, so partial updates to `summary.channel_ids` don't blow away `summary.target_channel`.
  - Tests: GET on tenant with no config returns `{}`, PATCH adds field, PATCH partial leaves untouched fields, cross-tenant 404.

  **Must NOT do**:
  - Do NOT use this endpoint for secrets — `value` field must NOT be accepted in config payload.
  - Do NOT replace config wholesale on PATCH — must merge.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two simple endpoints; main complexity is the merge utility.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with T6-T8, T10)
  - **Blocks**: T17
  - **Blocked By**: T3, T5

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-tenants.ts` (T7) — route factory pattern
  - Look for existing deep-merge usage in `package.json` deps; if `lodash.merge` not present, implement small helper inline (10 lines)

  **Acceptance Criteria**:
  - [ ] 2 endpoints implemented and registered.
  - [ ] Deep merge verified (PATCH `{summary: {channel_ids: [...]}}` does NOT erase `summary.target_channel`).
  - [ ] Tests pass.

  **QA Scenarios**:

  ```
  Scenario: PATCH performs deep merge
    Tool: Bash (curl)
    Preconditions: Tenant exists with config={"summary":{"target_channel":"C123"}}
    Steps:
      1. PATCH /admin/tenants/{id}/config with {"summary":{"channel_ids":["C456","C789"]}}
      2. GET /admin/tenants/{id}/config
      3. Assert response is {"summary":{"target_channel":"C123","channel_ids":["C456","C789"]}}
      4. Save to .sisyphus/evidence/task-9-merge.log
    Expected Result: Both fields present (deep merge)
    Failure Indicators: target_channel missing (shallow merge)
    Evidence: .sisyphus/evidence/task-9-merge.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-9-merge.log`

  **Commit**: YES
  - Message: `feat(gateway): add /admin/tenants/:id/config GET and PATCH endpoints`
  - Files: `src/gateway/routes/admin-tenant-config.ts`, `src/gateway/server.ts`, `tests/gateway/routes/admin-tenant-config.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 10. **Update seed.ts: Platform tenant + DozalDevs + VLRE**

  **What to do**:
  - Update `prisma/seed.ts` to:
    1. Upsert "Platform" tenant with id `00000000-0000-0000-0000-000000000001`, slug `platform`. (Already inserted by Migration A; this is a safety re-upsert.)
    2. Upsert "DozalDevs" tenant with auto-generated stable UUID (use a fixed UUID for reproducibility, e.g., `00000000-0000-0000-0000-000000000002`), slug `dozaldevs`. Set `config.summary = { channel_ids: [], target_channel: null }`.
    3. Upsert "VLRE" tenant with another stable UUID (`00000000-0000-0000-0000-000000000003`), slug `vlre`. Same shape.
    4. Re-seed `daily-summarizer` archetype scoped to Platform tenant (existing seed) — leave as-is.
    5. Add a console log at end: `Tenants seeded: Platform, DozalDevs, VLRE. Run /slack/install?tenant=<id> to attach Slack workspaces (or use scripts/setup-two-tenants.ts).`
  - Run `pnpm prisma db seed` and verify all three tenants exist.
  - Update README's Quick Start section to mention `pnpm prisma db seed` creates 3 tenants by default.

  **Must NOT do**:
  - Do NOT seed any TenantSecrets — Slack tokens come from OAuth flow (DozalDevs) or migration script (VLRE legacy install), never from seed.
  - Do NOT delete or modify existing archetype seed for `daily-summarizer`.
  - Do NOT seed any tenant beyond Platform + DozalDevs + VLRE.
  - Do NOT use random UUIDs for DozalDevs/VLRE — use stable UUIDs so seed is idempotent across machines.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial seed addition following existing upsert pattern.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with T6-T9)
  - **Blocks**: T6 (T6 must run AFTER seed so backfill data exists), T17
  - **Blocked By**: T1, T3, T4

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — existing upsert pattern for archetype + departments

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` runs without error.
  - [ ] `psql $DATABASE_URL -c "SELECT slug FROM tenants ORDER BY slug;"` returns: `dozaldevs`, `platform`, `vlre`.
  - [ ] Pre-existing tests in `tests/inngest/lifecycle.test.ts` etc. still pass.

  **QA Scenarios**:

  ```
  Scenario: Seed creates 3 tenants idempotently
    Tool: Bash
    Preconditions: Migration A applied
    Steps:
      1. Run: pnpm prisma db seed 2>&1 | tee .sisyphus/evidence/task-10-seed.log
      2. Run: pnpm prisma db seed 2>&1 | tee -a .sisyphus/evidence/task-10-seed.log (idempotency check)
      3. Run: psql $DATABASE_URL -c "SELECT slug, name FROM tenants ORDER BY slug;" > .sisyphus/evidence/task-10-tenants.txt
      4. Assert file contains exactly 3 rows: dozaldevs, platform, vlre
    Expected Result: Idempotent seed; exactly 3 tenants
    Failure Indicators: Duplicates created, missing tenants, error on second run
    Evidence: .sisyphus/evidence/task-10-seed.log, .sisyphus/evidence/task-10-tenants.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-10-seed.log`
  - [ ] `.sisyphus/evidence/task-10-tenants.txt`

  **Commit**: YES
  - Message: `feat(db): seed Platform tenant plus DozalDevs and VLRE tenants`
  - Files: `prisma/seed.ts`, `README.md`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 11. **Slack OAuth install endpoint (/slack/install)**

  **What to do**:
  - Create `src/gateway/routes/slack-oauth.ts` exporting `createSlackOAuthRouter(deps: { tenantRepo, secretRepo, logger })` (callback handler comes in T12, install handler here).
  - `GET /slack/install?tenant=<tenantId>`:
    1. Validate `tenantId` query param via `TenantIdParamSchema`.
    2. `tenantRepo.findById(tenantId)` → `404` if missing.
    3. Generate signed `state` payload: `{ tenant_id, nonce: crypto.randomBytes(16).toString('hex') }` HMAC-signed with `ENCRYPTION_KEY` (or dedicated `STATE_SIGNING_KEY` — reuse encryption key since both are server secrets).
    4. Build Slack OAuth URL: `https://slack.com/oauth/v2/authorize?client_id={SLACK_CLIENT_ID}&scope=channels:history,chat:write,chat:write.public&redirect_uri={PUBLIC_HOST}/slack/oauth_callback&state={signed_state}`.
    5. Return `302` redirect (or HTML page with the link if browser-friendly, but redirect is simpler).
  - Add `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_BASE_URL` to `.env.example`.
  - Tests: missing tenant_id → 400; non-existent tenant → 404; valid → 302 with state in URL; state is signed (cannot be forged).

  **Must NOT do**:
  - Do NOT include the tenant_id in plaintext query string of redirect URL — Slack passes `state` back, which we verify in T12.
  - Do NOT use a static state string — must be HMAC-signed.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: OAuth state signing requires correct HMAC implementation; security-sensitive.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 (with T13, T14, T15, T16; T12 sequenced after T11)
  - **Blocks**: T12
  - **Blocked By**: T3, T5, T6

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-tenants.ts` — route factory pattern
  - Slack docs: `https://api.slack.com/authentication/oauth-v2#asking` — OAuth v2 flow, state parameter usage
  - Node `crypto.createHmac("sha256", key).update(payload).digest("hex")` — signing pattern

  **Acceptance Criteria**:
  - [ ] `GET /slack/install?tenant=<id>` returns 302 with valid Slack OAuth URL.
  - [ ] State is HMAC-signed and includes tenant_id + nonce.
  - [ ] Tests pass.

  **QA Scenarios**:

  ```
  Scenario: Install redirect with signed state
    Tool: Bash (curl)
    Preconditions: Server running, DozalDevs tenant exists (id 00000000-0000-0000-0000-000000000002)
    Steps:
      1. curl -i "http://localhost:3000/slack/install?tenant=00000000-0000-0000-0000-000000000002" 2>&1 | tee .sisyphus/evidence/task-11-redirect.log
      2. Assert response is HTTP 302
      3. Assert Location header contains "slack.com/oauth/v2/authorize"
      4. Assert Location contains a state parameter with structure: <base64-payload>.<hex-signature>
    Expected Result: Valid redirect with signed state
    Failure Indicators: 200 instead of 302, missing state, unsigned state
    Evidence: .sisyphus/evidence/task-11-redirect.log

  Scenario: Reject unknown tenant
    Tool: Bash (curl)
    Steps:
      1. curl -i "http://localhost:3000/slack/install?tenant=99999999-9999-9999-9999-999999999999"
      2. Assert 404
    Evidence: .sisyphus/evidence/task-11-404.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-11-redirect.log`
  - [ ] `.sisyphus/evidence/task-11-404.log`

  **Commit**: YES
  - Message: `feat(gateway): add Slack OAuth install endpoint with signed state`
  - Files: `src/gateway/routes/slack-oauth.ts`, `src/gateway/server.ts`, `.env.example`, `tests/gateway/routes/slack-oauth-install.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 12. **Slack OAuth callback endpoint (/slack/oauth_callback) — atomic**

  **What to do**:
  - Add to `src/gateway/routes/slack-oauth.ts` the `GET /slack/oauth_callback` handler:
    1. Receive `code` and `state` from Slack query params.
    2. Verify HMAC signature on `state`; reject `400` if invalid.
    3. Decode state → extract `tenant_id`, `nonce`.
    4. Verify nonce hasn't been used (optional: Redis/in-memory replay protection — for this scope, skip with TODO comment).
    5. POST to `https://slack.com/api/oauth.v2.access` with `client_id`, `client_secret`, `code`, `redirect_uri` to exchange code for access token.
    6. Slack response includes `access_token`, `team.id`, `team.name`, `bot_user_id`, etc.
    7. **In a single Prisma transaction**:
       - Check if any tenant already has `slack_team_id == response.team.id`. If yes AND tenant_id mismatches state → return `409 { error: "Slack workspace already attached to a different tenant" }`.
       - Update tenant: set `slack_team_id = response.team.id`.
       - Upsert TenantSecret: `key = "slack_bot_token"`, encrypt `access_token`.
       - Optional: store `key = "slack_bot_user_id"` (not encrypted-required, but use same machinery for consistency).
    8. Return success page (HTML) with: "Connected to {team.name}. You can close this tab."
  - Tests: invalid state → 400; valid code exchange (mock Slack) → tenant updated, secret stored encrypted; duplicate team_id → 409.

  **Must NOT do**:
  - Do NOT log the `access_token` (must NOT appear in any log line).
  - Do NOT skip the transaction — partial state (token without team_id update) creates orphaned secrets.
  - Do NOT trust the `state` parameter without HMAC verification.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Atomic transaction + cryptographic state verification + 3rd-party API integration; high blast radius for bugs.

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequenced after T11 (same file).
  - **Parallel Group**: Wave 3 (sequenced after T11)
  - **Blocks**: T17
  - **Blocked By**: T3, T4, T11

  **References**:

  **Pattern References**:
  - Slack docs: `https://api.slack.com/methods/oauth.v2.access` — request format, response shape
  - `src/gateway/routes/slack-oauth.ts` (T11) — same file, install handler

  **Acceptance Criteria**:
  - [ ] Callback handler implemented in same `slack-oauth.ts`.
  - [ ] Transaction wraps tenant update + secret upsert.
  - [ ] Duplicate team_id returns 409.
  - [ ] Mocked tests pass (using `nock` or `vi.fn()` to stub Slack API).
  - [ ] No access_token in logs.

  **QA Scenarios**:

  ```
  Scenario: Successful OAuth flow (mocked Slack)
    Tool: Bash (vitest)
    Preconditions: Mock Slack oauth.v2.access to return {ok:true, access_token:"xoxb-mocked", team:{id:"T123",name:"Test Workspace"}}
    Steps:
      1. Call install endpoint to get signed state
      2. Call callback with code=mock_code, state=<signed>
      3. Assert tenant.slack_team_id == "T123"
      4. Assert tenant_secrets row exists for slack_bot_token, ciphertext != "xoxb-mocked"
      5. Save evidence
    Expected Result: Atomic update completes
    Failure Indicators: Partial state (token without team_id), plaintext stored
    Evidence: .sisyphus/evidence/task-12-oauth-success.log

  Scenario: Duplicate Slack workspace rejected
    Tool: Bash (vitest)
    Preconditions: Tenant A already attached to team T123
    Steps:
      1. Trigger OAuth flow for Tenant B with same team_id T123
      2. Assert 409 with message about workspace already attached
    Evidence: .sisyphus/evidence/task-12-duplicate-409.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-12-oauth-success.log`
  - [ ] `.sisyphus/evidence/task-12-duplicate-409.log`

  **Commit**: YES
  - Message: `feat(gateway): add Slack OAuth callback with atomic token storage`
  - Files: `src/gateway/routes/slack-oauth.ts`, `tests/gateway/routes/slack-oauth-callback.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 13. **Slack Bolt InstallationStore implementation**

  **What to do**:
  - Create `src/gateway/slack/installation-store.ts` exporting a class `TenantInstallationStore implements InstallationStore` (interface from `@slack/bolt` or `@slack/oauth`).
  - Required methods:
    - `storeInstallation(installation)` — invoked by Bolt's built-in OAuth flow (we won't use Bolt's flow since T12 handles it; this method can be a no-op or call into our T4 secretRepo for symmetry).
    - `fetchInstallation(query: { teamId, enterpriseId, isEnterpriseInstall })` — looks up tenant by `query.teamId` via `tenantRepo.findBySlackTeamId()`, then loads `slack_bot_token` from secretRepo, returns Bolt-compatible installation object: `{ team: { id }, bot: { token, userId } }`.
    - `deleteInstallation(query)` — set `tenant.slack_team_id = null`, delete `slack_bot_token` secret. Used when user uninstalls bot.
  - If teamId not found in any tenant → throw `Error("No installation for team")` so Bolt rejects gracefully.
  - Tests: fetchInstallation returns correct token for known team_id; throws for unknown; deleteInstallation removes data.

  **Must NOT do**:
  - Do NOT log installation objects — they contain bot tokens.
  - Do NOT cache installations across requests (always fresh lookup; tokens may rotate).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Adapter pattern around 3rd-party interface with strict contract.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 (with T11, T15, T16; sequenced before T14)
  - **Blocks**: T14
  - **Blocked By**: T4

  **References**:

  **Pattern References**:
  - Slack Bolt docs: `https://slack.dev/bolt-js/concepts#authenticating-oauth` — InstallationStore interface
  - `node_modules/@slack/oauth/dist/installation-stores/index.d.ts` — exact TypeScript interface
  - `src/lib/slack-client.ts` — existing per-token client factory

  **Acceptance Criteria**:
  - [ ] Class implements full InstallationStore interface (no `as any` cast).
  - [ ] `fetchInstallation` returns valid Bolt-compatible object.
  - [ ] Tests cover all 3 methods + unknown team error path.

  **QA Scenarios**:

  ```
  Scenario: Fetch returns correct token per team_id
    Tool: Bash (vitest)
    Preconditions: Tenant A has slack_team_id="T_A" + bot_token; Tenant B has "T_B" + different bot_token
    Steps:
      1. store.fetchInstallation({teamId:"T_A"}) → assert bot.token === Tenant A's decrypted token
      2. store.fetchInstallation({teamId:"T_B"}) → assert bot.token === Tenant B's decrypted token
      3. store.fetchInstallation({teamId:"T_UNKNOWN"}) → assert throws
    Expected Result: Per-team isolation
    Failure Indicators: Wrong token returned, no error on unknown
    Evidence: .sisyphus/evidence/task-13-fetch.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-13-fetch.log`

  **Commit**: YES
  - Message: `feat(gateway): add Slack Bolt InstallationStore backed by tenant_secrets`
  - Files: `src/gateway/slack/installation-store.ts`, `tests/gateway/slack/installation-store.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 14. **Slack Bolt App reconfig (server.ts) — per-workspace authorize**

  **What to do**:
  - Refactor `src/gateway/server.ts:46-85` Slack Bolt initialization:
    - Remove `token: process.env.SLACK_BOT_TOKEN` (the global bot token).
    - Provide `installationStore: new TenantInstallationStore(...)` from T13.
    - Provide `authorize` callback or use Bolt's `installerOptions` so it pulls token via installationStore on each event.
    - Keep `signingSecret: process.env.SLACK_SIGNING_SECRET` (signing secret is app-level, NOT per-tenant).
    - In `slack/handlers.ts` for approve/reject button handlers: extract `team.id` from the payload (`body.team.id`); use Bolt's `client.chat.update()` which now resolves token via installationStore based on team_id.
  - Update existing tests in `tests/gateway/server.test.ts` (or wherever Slack Bolt setup is tested) to mock InstallationStore.
  - If `SLACK_BOT_TOKEN` env var is referenced anywhere else in code (besides server.ts and lifecycle.ts), audit and remove.

  **Must NOT do**:
  - Do NOT keep the global `SLACK_BOT_TOKEN` in server.ts startup; it should NO longer be a required env var (just legacy ignored).
  - Do NOT modify `src/lib/slack-client.ts` factory — it correctly takes botToken as constructor arg already.
  - Do NOT remove signing secret check (still required for HMAC verification).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Refactor with cross-cutting impact on Slack handlers; must trace all token usages.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 (with T11, T15, T16; sequenced after T13)
  - **Blocks**: T18 (integration tests need this wired)
  - **Blocked By**: T13

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts:46-85` — current Slack Bolt setup to refactor
  - `src/gateway/slack/handlers.ts` — button handlers
  - Slack Bolt docs: `https://slack.dev/bolt-js/concepts#authenticating-oauth` — multi-team setup

  **Acceptance Criteria**:
  - [ ] Server boots with NO SLACK_BOT_TOKEN env var set.
  - [ ] `grep -rn "process.env.SLACK_BOT_TOKEN" src/ --include="*.ts"` returns at most 1 line (in `lifecycle.ts` for engineering, which is out of scope).
  - [ ] Existing Slack handler tests still pass (with mock InstallationStore).
  - [ ] Approve/reject button click in tenant A workspace responds via tenant A's bot token (verified in T18 integration test).

  **QA Scenarios**:

  ```
  Scenario: Server boots without global SLACK_BOT_TOKEN
    Tool: Bash
    Preconditions: T13 + T14 applied
    Steps:
      1. Unset SLACK_BOT_TOKEN; ensure SLACK_SIGNING_SECRET, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, ENCRYPTION_KEY are set
      2. Start server: node dist/gateway/server.js & echo $! > .sisyphus/evidence/task-14-pid.txt
      3. Wait 3s, curl http://localhost:3000/health
      4. Assert 200 response
      5. kill $(cat .sisyphus/evidence/task-14-pid.txt)
    Expected Result: Server starts and responds; no fatal error about missing SLACK_BOT_TOKEN
    Failure Indicators: Boot crashes, /health returns 500
    Evidence: .sisyphus/evidence/task-14-boot.log

  Scenario: Codebase audit for global token references
    Tool: Bash (grep)
    Steps:
      1. Run: grep -rn "process.env.SLACK_BOT_TOKEN" src/ --include="*.ts" > .sisyphus/evidence/task-14-grep.log
      2. Assert at most 1 occurrence (legacy lifecycle.ts allowed if unrelated to summarizer)
    Evidence: .sisyphus/evidence/task-14-grep.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-14-boot.log`
  - [ ] `.sisyphus/evidence/task-14-grep.log`

  **Commit**: YES
  - Message: `refactor(gateway): wire Slack Bolt to per-workspace InstallationStore`
  - Files: `src/gateway/server.ts`, `src/gateway/slack/handlers.ts`, `tests/gateway/server.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 15. **employee-lifecycle.ts: tenant-scoped env injection**

  **What to do**:
  - Create `src/gateway/services/tenant-env-loader.ts` exporting `loadTenantEnv(tenantId: string, deps: { tenantRepo, secretRepo }): Promise<Record<string, string>>`:
    1. Fetch tenant via `tenantRepo.findById(tenantId)`.
    2. Fetch ALL secrets for tenant via `secretRepo.getMany(tenantId, await secretRepo.listKeys(tenantId).then(rows => rows.map(r => r.key)))`.
    3. Build env object:
       - **Always include platform-shared vars**: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`, `INNGEST_*` (whitelist from `process.env`).
       - **Include decrypted tenant secrets** keyed by uppercased key name: e.g., `slack_bot_token` → `SLACK_BOT_TOKEN`.
       - **Include tenant.config flattened**: `config.summary.channel_ids` → `DAILY_SUMMARY_CHANNELS` (comma-joined), `config.summary.target_channel` → `SUMMARY_TARGET_CHANNEL`.
    4. Return the merged env map.
  - Refactor `src/inngest/employee-lifecycle.ts:68-92`: replace the broad `Object.entries(process.env).filter(...)` spread with `await loadTenantEnv(tenantId, { tenantRepo, secretRepo })`. The result is the env object passed to Fly.io machine `config.env`.
  - Add tests for `tenant-env-loader.ts`: secrets are decrypted, config is flattened correctly, missing tenant throws, missing secret keys do NOT throw (just absent from result).
  - Update `tests/inngest/employee-lifecycle.test.ts` to mock the loader.

  **Must NOT do**:
  - Do NOT spread arbitrary `process.env` keys — explicit whitelist only.
  - Do NOT log the resulting env map (contains secrets).
  - Do NOT keep the broad `process.env` filter as a fallback — fully replace it.
  - Do NOT modify the engineering lifecycle (`engineering/task-lifecycle`) — only the generic `employee/task-lifecycle`.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This is the runtime choke-point for tenant isolation; bug here = silent cross-tenant leak.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 (with T11, T13, T14, T16)
  - **Blocks**: T16, T17
  - **Blocked By**: T3, T4

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:68-92` — current process.env spread to replace
  - `src/workers/tools/param-resolver.ts` — how `$VAR` substitution works downstream (verifies our env keys reach the worker correctly)
  - `src/lib/fly-client.ts` — how `config.env` is passed to Fly.io machine create

  **WHY Each Reference Matters**:
  - The param resolver substitutes `$DAILY_SUMMARY_CHANNELS` into tool calls — our loader must produce this exact env var name.

  **Acceptance Criteria**:
  - [ ] `src/gateway/services/tenant-env-loader.ts` exists with whitelist-only behavior.
  - [ ] `employee-lifecycle.ts` uses the loader; no more broad `process.env` spread.
  - [ ] Tests cover: secrets decrypted, config flattened, multi-tenant produces different env maps.
  - [ ] Existing `employee-lifecycle.test.ts` tests pass.

  **QA Scenarios**:

  ```
  Scenario: Tenant A and Tenant B produce distinct env maps
    Tool: Bash (vitest)
    Preconditions: 2 tenants seeded with different secrets + config
    Steps:
      1. envA = await loadTenantEnv(tenantA_id, deps)
      2. envB = await loadTenantEnv(tenantB_id, deps)
      3. Assert envA.SLACK_BOT_TOKEN !== envB.SLACK_BOT_TOKEN
      4. Assert envA.DAILY_SUMMARY_CHANNELS !== envB.DAILY_SUMMARY_CHANNELS
      5. Assert both contain the same DATABASE_URL (platform-shared)
    Expected Result: Tenant-scoped values isolated; platform values shared
    Failure Indicators: Cross-tenant value leak
    Evidence: .sisyphus/evidence/task-15-isolation.log

  Scenario: Whitelist enforced (no random env var leak)
    Tool: Bash (vitest)
    Steps:
      1. Set process.env.SECRET_PLATFORM_KEY="should-not-leak"
      2. env = await loadTenantEnv(tenantA_id, deps)
      3. Assert "SECRET_PLATFORM_KEY" NOT in Object.keys(env)
    Expected Result: Only whitelisted keys present
    Failure Indicators: Arbitrary process.env key present
    Evidence: .sisyphus/evidence/task-15-whitelist.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-15-isolation.log`
  - [ ] `.sisyphus/evidence/task-15-whitelist.log`

  **Commit**: YES
  - Message: `refactor(inngest): inject tenant-scoped env into worker machines`
  - Files: `src/gateway/services/tenant-env-loader.ts`, `src/inngest/employee-lifecycle.ts`, `tests/gateway/services/tenant-env-loader.test.ts`, `tests/inngest/employee-lifecycle.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 16. **Verify slack tools + param resolver work with tenant-injected env**

  **What to do**:
  - Audit `src/workers/tools/slack-read-channels.ts` and `src/workers/tools/slack-post-message.ts` — confirm they read `SLACK_BOT_TOKEN` from `process.env` (which is now tenant-injected per T15).
  - Audit `src/workers/tools/param-resolver.ts` — confirm `$DAILY_SUMMARY_CHANNELS` and `$SUMMARY_TARGET_CHANNEL` substitution still works with the new env source.
  - Run a smoke test by exercising the generic harness against a fake tenant env — confirm tools receive the right values.
  - This is mostly a verification task; if any code change is needed (e.g., a tool was hardcoding to a global env name that doesn't match), fix here.

  **Must NOT do**:
  - Do NOT refactor the tools beyond minimum needed for compatibility with tenant env injection.
  - Do NOT change the param resolver's `$VAR` syntax.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Audit + small fix if needed; minimal logic.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 (with T11, T13, T14, T15)
  - **Blocks**: T17
  - **Blocked By**: T15

  **References**:

  **Pattern References**:
  - `src/workers/tools/slack-read-channels.ts`
  - `src/workers/tools/slack-post-message.ts`
  - `src/workers/tools/param-resolver.ts`
  - `src/workers/tools/registry.ts`

  **Acceptance Criteria**:
  - [ ] Slack tools correctly read `SLACK_BOT_TOKEN` from injected env (no hardcoding).
  - [ ] Param resolver substitutes `$DAILY_SUMMARY_CHANNELS` and `$SUMMARY_TARGET_CHANNEL` correctly.
  - [ ] Smoke test exits 0.

  **QA Scenarios**:

  ```
  Scenario: Tools resolve env vars from injected map
    Tool: Bash (node)
    Preconditions: Test env injected into a child process simulating worker
    Steps:
      1. Write smoke test that sets SLACK_BOT_TOKEN, DAILY_SUMMARY_CHANNELS, SUMMARY_TARGET_CHANNEL on env
      2. Invoke each Slack tool's main entrypoint with mocked Slack API
      3. Assert tools call Slack API with the correct token + channel IDs
    Expected Result: Tool param resolution unchanged
    Failure Indicators: Tool reads wrong env var name
    Evidence: .sisyphus/evidence/task-16-smoke.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-16-smoke.log`

  **Commit**: YES (only if a fix was needed; otherwise skip)
  - Message: `chore(workers): verify slack tools work with tenant-injected env`
  - Files: any modified tool files; otherwise no commit
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 17. **scripts/setup-two-tenants.ts — provisioning script for DozalDevs + VLRE**

  **What to do**:
  - Create `scripts/setup-two-tenants.ts` (run via `pnpm tsx`). This script provisions the two REAL tenants the user operates (DozalDevs and VLRE) for end-to-end multi-tenancy validation.
  - Script flow:
    1. **Read env**: `ADMIN_API_KEY`, `BASE_URL` (default `http://localhost:3000`), and detect legacy `SLACK_BOT_TOKEN` from `process.env`.
    2. **Idempotent tenant creation** (skip if exists):
       - DozalDevs: `POST /admin/tenants` with `{ id: "00000000-0000-0000-0000-000000000002", name: "DozalDevs", slug: "dozaldevs" }` (or check via `GET /admin/tenants?slug=dozaldevs` first).
       - VLRE: `POST /admin/tenants` with `{ id: "00000000-0000-0000-0000-000000000003", name: "VLRE", slug: "vlre" }`.
       - Note: tenants may already be seeded by T10 (`prisma/seed.ts`) — script must detect and continue gracefully.
    3. **VLRE legacy Slack token migration** (one-shot):
       - If `process.env.SLACK_BOT_TOKEN` is set AND VLRE has no `slack_bot_token` secret yet:
         - Print: `"Migrating legacy SLACK_BOT_TOKEN env var into VLRE tenant_secrets..."`.
         - Call `POST /admin/tenants/<VLRE_ID>/secrets` with `{ key: "slack_bot_token", value: process.env.SLACK_BOT_TOKEN }`.
         - Prompt user for VLRE's `slack_team_id` (since legacy token doesn't go through OAuth callback): `"Enter VLRE Slack team ID (find via Slack admin → Workspace Settings, format T0XXXXX): "`.
         - Call `PATCH /admin/tenants/<VLRE_ID>` with `{ slack_team_id: <input> }`.
         - Print: `"VLRE migration complete. You may now remove SLACK_BOT_TOKEN from .env."`.
       - If VLRE already has `slack_bot_token` secret → skip migration step (idempotent).
    4. **DozalDevs OAuth install prompt**:
       - Print install link: `"To install the Slack bot in DozalDevs workspace, visit: http://localhost:3000/slack/install?tenant=00000000-0000-0000-0000-000000000002"`.
       - Print: `"You will be redirected to Slack to grant scopes, then back to a confirmation page."`.
       - **Pause with prompt**: `"After installing the bot in DozalDevs workspace, press Enter to continue..."` (use `readline` for blocking input).
    5. **Per-tenant channel configuration**:
       - For each tenant (DozalDevs first, then VLRE):
         - Prompt: `"Enter source channel IDs for <TENANT_NAME> (comma-separated, e.g., C0123,C0456): "`.
         - Prompt: `"Enter target channel ID for <TENANT_NAME> digest posting: "`.
         - Call `PATCH /admin/tenants/<ID>/config` with `{ summary: { channel_ids: [...], target_channel: "..." } }`.
    6. **Verification step**:
       - For each tenant: `GET /admin/tenants/<ID>` → assert `slack_team_id` is set (proves OAuth or legacy migration completed).
       - For each tenant: `GET /admin/tenants/<ID>/secrets` → assert `slack_bot_token` key listed (without value — listing endpoint returns metadata only per T8).
       - For each tenant: `GET /admin/tenants/<ID>/config` → assert `summary.channel_ids` is a non-empty array.
    7. **Summary output**: print table with `tenant_id | name | slug | slack_team_id | secret_keys | channel_ids` for both tenants. Print `"Setup complete. Run: pnpm verify:multi-tenancy to confirm end-to-end."`.
  - Add `"setup:two-tenants": "tsx scripts/setup-two-tenants.ts"` to `package.json`.
  - Update `.env.example` to add a comment near `SLACK_BOT_TOKEN`: `# DEPRECATED: migrated per-tenant via scripts/setup-two-tenants.ts. Safe to remove after VLRE migration.`

  **Must NOT do**:
  - Do NOT skip the OAuth pause for DozalDevs — script cannot complete OAuth automatically. User must manually click the install link in a browser.
  - Do NOT hardcode channel IDs — must prompt user (different per workspace).
  - Do NOT print bot tokens, secret values, or `slack_team_id` values to console output more than once (and never with secret labels).
  - Do NOT delete `process.env.SLACK_BOT_TOKEN` from `.env` automatically — only print instructions for the user to do so manually.
  - Do NOT proceed with channel config prompts if OAuth/legacy migration step did not complete (verify `slack_team_id` is set first).
  - Do NOT use the names "Acme Corp" or "Globex Inc" anywhere — these are NOT the tenants we're building for.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step provisioning script with conditional branching (legacy vs OAuth path), interactive prompts, idempotency checks, and HTTP orchestration against admin API.
  - **Skills**: `[]`
    - No specialized skill required.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4 (with T18, T19, T20)
  - **Blocks**: T19 (docs reference this script), T20 (verify script depends on this provisioning being done first in real run)
  - **Blocked By**: T7 (admin tenants API), T8 (admin tenant secrets API), T9 (admin tenant config API), T10 (seed with DozalDevs + VLRE), T12 (OAuth callback for DozalDevs), T15 (loadTenantEnv consumed downstream), T16 (Slack tools verified tenant-aware), T21 (jira tenant-aware), T22 (engineering lifecycle tenant env)

  **References**:

  **Pattern References**:
  - `scripts/trigger-task.ts` — existing tsx script with curl orchestration, env reads, structured logging
  - `scripts/setup.ts` — idempotent setup pattern (existence checks before mutation)
  - `scripts/register-project.ts` — interactive prompt pattern (readline)

  **API/Type References**:
  - T7 endpoints: `POST /admin/tenants`, `GET /admin/tenants?slug=`, `PATCH /admin/tenants/:id`
  - T8 endpoints: `POST /admin/tenants/:id/secrets`, `GET /admin/tenants/:id/secrets` (metadata-only listing)
  - T9 endpoints: `PATCH /admin/tenants/:id/config`, `GET /admin/tenants/:id/config`
  - T10 seeded tenant IDs: DozalDevs `00000000-0000-0000-0000-000000000002`, VLRE `00000000-0000-0000-0000-000000000003`

  **Test References**:
  - N/A — script is operational, not unit-tested. QA scenarios cover behavior.

  **External References**:
  - Slack workspace ID lookup: https://www.workspaceupdates.slack.com/2018/04/02/finding-your-team-id (T-prefixed string)

  **WHY Each Reference Matters**:
  - `trigger-task.ts` and `register-project.ts` together cover the full pattern surface (curl + readline) needed here.
  - Stable tenant UUIDs from T10 mean the script can hardcode them in the migration logic (no slug-to-UUID lookup needed).
  - Listing endpoint MUST be metadata-only (no decrypted secret values returned) per T8 — script must assume this when verifying.

  **Acceptance Criteria**:
  - [ ] Script exists at `scripts/setup-two-tenants.ts`.
  - [ ] `pnpm setup:two-tenants` invocable from package.json.
  - [ ] Script is idempotent: running twice does not duplicate tenants, secrets, or config rows.
  - [ ] Script handles three distinct flows: (a) fresh install of both tenants, (b) VLRE legacy migration only (DozalDevs already done), (c) re-run after full setup (no-op except success summary).
  - [ ] Script never prints secret values to stdout.
  - [ ] Final summary lists both DozalDevs + VLRE with verification ✓ markers.

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Idempotent re-run does not duplicate tenants or secrets
    Tool: Bash + psql
    Preconditions: DB seeded with Platform + DozalDevs + VLRE (from T10); both tenants have OAuth + secrets + config completed.
    Steps:
      1. Snapshot baseline counts: psql $DATABASE_URL -c "SELECT (SELECT count(*) FROM tenants), (SELECT count(*) FROM tenant_secrets), (SELECT count(*) FROM tenants WHERE slack_team_id IS NOT NULL)" > .sisyphus/evidence/task-17-baseline.log
      2. Run: pnpm setup:two-tenants </dev/null 2>&1 | tee .sisyphus/evidence/task-17-rerun.log (stdin closed → script must not block on prompts when nothing needs input)
      3. Snapshot post counts (same query) > .sisyphus/evidence/task-17-after.log
      4. diff .sisyphus/evidence/task-17-baseline.log .sisyphus/evidence/task-17-after.log
      5. Assert diff is empty (no rows added).
      6. Assert script exit code = 0.
    Expected Result: Counts identical, exit 0, log indicates "all tenants already configured".
    Failure Indicators: Duplicate rows, non-zero exit, prompt blocking on stdin.
    Evidence: .sisyphus/evidence/task-17-baseline.log, .sisyphus/evidence/task-17-rerun.log, .sisyphus/evidence/task-17-after.log

  Scenario: VLRE legacy SLACK_BOT_TOKEN is migrated into tenant_secrets
    Tool: Bash + psql
    Preconditions:
      - DB has Platform + DozalDevs + VLRE seeded; VLRE has NO `slack_bot_token` in tenant_secrets.
      - process.env.SLACK_BOT_TOKEN=`xoxb-vlre-legacy-test`
      - User input pre-fed: VLRE team ID `T0VLRE001`, channel IDs for both, target channel for both.
    Steps:
      1. Run: printf "T0VLRE001\nC0DOZAL_SRC\nC0DOZAL_TGT\nC0VLRE_SRC\nC0VLRE_TGT\n" | pnpm setup:two-tenants 2>&1 | tee .sisyphus/evidence/task-17-vlre-migration.log
      2. psql $DATABASE_URL -c "SELECT key FROM tenant_secrets WHERE tenant_id='00000000-0000-0000-0000-000000000003'" | tee -a .sisyphus/evidence/task-17-vlre-migration.log
      3. Assert `slack_bot_token` row exists for VLRE.
      4. psql $DATABASE_URL -c "SELECT slack_team_id FROM tenants WHERE id='00000000-0000-0000-0000-000000000003'"
      5. Assert slack_team_id = `T0VLRE001`.
      6. grep "xoxb-vlre-legacy-test" .sisyphus/evidence/task-17-vlre-migration.log
      7. Assert grep returns no matches (token never logged).
    Expected Result: Token migrated, slack_team_id set, no token leak in logs.
    Failure Indicators: tenant_secrets row missing, slack_team_id null, token visible in logs.
    Evidence: .sisyphus/evidence/task-17-vlre-migration.log

  Scenario: Script aborts gracefully if DozalDevs OAuth not completed before channel prompts
    Tool: Bash
    Preconditions: DozalDevs tenant exists but slack_team_id IS NULL (user did not complete OAuth).
    Steps:
      1. Run: printf "\n" | pnpm setup:two-tenants 2>&1 | tee .sisyphus/evidence/task-17-no-oauth.log (Enter pressed at OAuth pause without actually doing OAuth)
      2. Assert script detects DozalDevs slack_team_id is still null.
      3. Assert exit code != 0 OR script prints clear warning and offers retry.
    Expected Result: Script does not silently proceed to channel config with broken OAuth state.
    Failure Indicators: Script proceeds to PATCH config calls anyway, leaves tenant in inconsistent state.
    Evidence: .sisyphus/evidence/task-17-no-oauth.log

  Scenario: Final summary shows both tenants fully configured
    Tool: Bash (output inspection)
    Preconditions: Full setup completed for both tenants.
    Steps:
      1. Run: pnpm setup:two-tenants 2>&1 | tail -30 | tee .sisyphus/evidence/task-17-summary.log
      2. Assert output contains "DozalDevs" with ✓ for slack_team_id, secrets, channels.
      3. Assert output contains "VLRE" with ✓ for slack_team_id, secrets, channels.
      4. Assert output contains the next-step hint: "pnpm verify:multi-tenancy".
    Expected Result: Both tenants reported as fully configured.
    Failure Indicators: Either tenant has missing ✓; next-step hint absent.
    Evidence: .sisyphus/evidence/task-17-summary.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-17-baseline.log`
  - [ ] `.sisyphus/evidence/task-17-rerun.log`
  - [ ] `.sisyphus/evidence/task-17-after.log`
  - [ ] `.sisyphus/evidence/task-17-vlre-migration.log`
  - [ ] `.sisyphus/evidence/task-17-no-oauth.log`
  - [ ] `.sisyphus/evidence/task-17-summary.log`

  **Commit**: YES
  - Message: `feat(scripts): add setup-two-tenants provisioning script for DozalDevs + VLRE`
  - Files: `scripts/setup-two-tenants.ts`, `package.json`, `.env.example`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 18. **Integration tests — multi-tenancy isolation + encryption**

  **What to do**:
  - Create `tests/integration/multi-tenancy.test.ts`:
    1. **Tenant isolation**: Create 2 tenants. Trigger `daily-summarizer` for tenant A. Assert tenant B's tasks table has no rows from this trigger.
    2. **Cross-tenant API rejection**: Create task under tenant A. `GET /admin/tenants/<B>/tasks/<A_task_id>` returns 404.
    3. **Encryption at rest**: Set a secret with known plaintext. Read raw DB row. Assert ciphertext != plaintext.
    4. **Roundtrip**: Set + get returns plaintext.
    5. **OAuth callback atomicity**: Mock Slack API; trigger OAuth flow; assert tenant.slack_team_id and tenant_secret created together (or neither on failure).
    6. **InstallationStore lookup**: Two tenants with different slack_team_ids; assert `fetchInstallation` returns correct token per team_id.
    7. **Tenant env loader**: Two tenants with different SLACK_BOT_TOKEN secrets; assert `loadTenantEnv` returns the correct token per tenant_id.
    8. **Soft-delete behavior**: Soft-delete tenant; assert `findById()` returns null but `?include_deleted=true` returns it.
    9. **Hard-delete blocked**: Tenant with active task; hard-delete → 409.
  - Use `prismock` or real DB depending on existing test infra.

  **Must NOT do**:
  - Do NOT mock the encryption utility — it must be exercised end-to-end.
  - Do NOT depend on real Slack workspaces — mock all Slack API calls.
  - Do NOT skip the cross-tenant rejection test (the most critical security guarantee).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration test breadth + multi-component coordination.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4 (with T17, T19, T20)
  - **Blocks**: F1
  - **Blocked By**: T17 (and all upstream)

  **References**:

  **Pattern References**:
  - `tests/integration/` — existing integration test patterns
  - `tests/inngest/lifecycle.test.ts` — existing employee lifecycle tests

  **Acceptance Criteria**:
  - [ ] All 9 integration tests pass.
  - [ ] `pnpm test tests/integration/multi-tenancy.test.ts -- --run` exits 0.

  **QA Scenarios**:

  ```
  Scenario: Cross-tenant isolation enforced
    Tool: Bash (vitest)
    Steps:
      1. Run: pnpm test tests/integration/multi-tenancy.test.ts -- --run 2>&1 | tee .sisyphus/evidence/task-18-tests.log
      2. Assert all 9 tests pass
    Expected Result: 100% pass
    Failure Indicators: Any test fails (especially cross-tenant rejection)
    Evidence: .sisyphus/evidence/task-18-tests.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-18-tests.log`

  **Commit**: YES
  - Message: `test(integration): add multi-tenancy isolation and encryption tests`
  - Files: `tests/integration/multi-tenancy.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 19. **Documentation — multi-tenancy admin guide**

  **What to do**:
  - Run `date "+%Y-%m-%d-%H%M"` to get timestamp; create `docs/<timestamp>-multi-tenancy-guide.md`.
  - Sections:
    1. **Overview** — what multi-tenancy means in this platform; data isolation model.
    2. **Architecture** — Tenant + TenantSecret tables; encryption model; Slack OAuth flow.
    3. **Setup** — prerequisites (Slack app creation, ENCRYPTION_KEY generation, Cloudflare Tunnel).
    4. **Creating a Tenant** — `POST /admin/tenants` curl example.
    5. **Installing Slack** — visit `/slack/install?tenant=<id>`; OAuth flow; what happens server-side.
    6. **Setting Config** — `PATCH /admin/tenants/:id/config` with channel IDs.
    7. **Triggering an Employee** — `POST /admin/tenants/:id/employees/daily-summarizer/trigger`.
    8. **Verification** — how to confirm 2 tenants run in isolation.
    9. **Mermaid diagram** — multi-tenancy data flow (load skill `v-mermaid` for color palette + numbered steps).
    10. **Troubleshooting** — bot uninstalled, encryption key rotation (deferred), OAuth state errors.
  - Add an entry in main `README.md` "Documentation" table linking to this guide.
  - Add link in AGENTS.md "Reference Documents" table.

  **Must NOT do**:
  - Do NOT skip the timestamp prefix on the filename (project convention).
  - Do NOT include real bot tokens or live tenant IDs in examples — use placeholders.
  - Do NOT promise features that are out of scope (RLS, billing, signup UI).

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Skills: `v-mermaid` (for the architecture diagram)
    - Reason: Documentation focus with one structured diagram.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4 (with T17, T18, T20)
  - **Blocks**: F1
  - **Blocked By**: T17

  **References**:

  **Pattern References**:
  - `docs/2026-04-16-0310-manual-employee-trigger.md` — existing admin API doc style
  - `docs/2026-04-14-0104-full-system-vision.md` — vision doc for context links
  - `~/.config/opencode/2026-03-26-1613-mermaid-guide.md` — diagram conventions

  **Acceptance Criteria**:
  - [ ] File exists with timestamp prefix.
  - [ ] All 10 sections present.
  - [ ] Mermaid diagram uses standard color palette (load `v-mermaid` skill).
  - [ ] README + AGENTS.md updated with cross-link.

  **QA Scenarios**:

  ```
  Scenario: Documentation completeness
    Tool: Bash (grep)
    Steps:
      1. ls docs/*multi-tenancy*.md → assert exactly 1 file matches
      2. grep "## Setup" docs/*multi-tenancy*.md → assert present
      3. grep "## Mermaid" or graph TD/LR docs/*multi-tenancy*.md → assert mermaid block present
      4. grep "multi-tenancy-guide" README.md → assert link present
    Expected Result: All sections + cross-links present
    Evidence: .sisyphus/evidence/task-19-doc-audit.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-19-doc-audit.log`

  **Commit**: YES
  - Message: `docs: add multi-tenancy admin guide`
  - Files: `docs/<timestamp>-multi-tenancy-guide.md`, `README.md`, `AGENTS.md`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 20. **scripts/verify-multi-tenancy.ts — end-to-end runner**

  **What to do**:
  - Create `scripts/verify-multi-tenancy.ts` (`pnpm tsx`):
    - Programmatic checklist runner that verifies the multi-tenancy installation:
    1. **Schema check**: Connect to DB; assert `tenants` + `tenant_secrets` tables exist; assert FK constraints on `tasks.tenant_id`.
    2. **Tenant existence**: Assert Platform + DozalDevs + VLRE tenants exist by slug.
    3. **Encryption sanity**: Set a probe secret on Platform tenant; assert raw DB ciphertext != plaintext; assert get returns correct plaintext; clean up probe.
    4. **Cross-tenant API isolation**: Create probe task on DozalDevs via direct DB; `GET /admin/tenants/<vlre_id>/tasks/<dozaldevs_task_id>` → assert 404; clean up.
    5. **Tenant env loader**: For each of DozalDevs + VLRE, call `loadTenantEnv()`; assert `SLACK_BOT_TOKEN` differs (or both absent if OAuth not yet completed — print a warning).
    6. **InstallationStore**: For each tenant with `slack_team_id` set, `store.fetchInstallation({teamId})` succeeds.
    7. Print colored summary: `[PASS]`/`[FAIL]` per check; exit 1 on any fail.
  - Add `pnpm verify:multi-tenancy` to `package.json`.

  **Must NOT do**:
  - Do NOT make this an interactive script — must run unattended.
  - Do NOT leave probe data behind (clean up).

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Verification logic must be precise; false-pass is catastrophic.

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Parallel Group**: Wave 4 (with T17, T18, T19)
  - **Blocks**: F1
  - **Blocked By**: T17

  **References**:

  **Pattern References**:
  - `scripts/verify-e2e.ts` — existing 12-point verification pattern
  - `scripts/setup-two-tenants.ts` (T17) — admin API curl helpers

  **Acceptance Criteria**:
  - [ ] Script exists; `pnpm verify:multi-tenancy` invocable.
  - [ ] Returns exit 0 when all checks pass.
  - [ ] Returns exit 1 with clear message on any failure.
  - [ ] Cleans up all probe data.

  **QA Scenarios**:

  ```
  Scenario: Verification runs and passes against fully provisioned platform
    Tool: Bash
    Preconditions: Setup script + OAuth completed for both tenants
    Steps:
      1. Run: pnpm verify:multi-tenancy 2>&1 | tee .sisyphus/evidence/task-20-verify.log
      2. Assert exit 0
      3. Assert log contains "[PASS]" for all 6 checks
      4. Assert no probe data remains: psql ... | grep "probe_" → empty
    Expected Result: All checks pass, clean state
    Failure Indicators: Any check fails, probe data left behind
    Evidence: .sisyphus/evidence/task-20-verify.log

  Scenario: Verification correctly fails when tenant missing
    Tool: Bash
    Preconditions: Soft-delete dozaldevs tenant (deleted_at SET) so existence check fails
    Steps:
      1. Run: pnpm verify:multi-tenancy
      2. Assert exit 1
      3. Assert log identifies "Tenant existence" check failure for dozaldevs
    Expected Result: Failure correctly attributed
    Evidence: .sisyphus/evidence/task-20-verify-fail.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-20-verify.log`
  - [ ] `.sisyphus/evidence/task-20-verify-fail.log`

  **Commit**: YES
  - Message: `feat(scripts): add verify-multi-tenancy end-to-end runner`
  - Files: `scripts/verify-multi-tenancy.ts`, `package.json`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

- [x] 21. **Tenant-aware Jira webhook handler**

  **What to do**:
  - Refactor `src/gateway/routes/jira.ts` so HMAC verification uses the **per-tenant** `JIRA_WEBHOOK_SECRET` instead of the platform-wide `process.env.JIRA_WEBHOOK_SECRET`.
  - Resolution flow on incoming webhook:
    1. Parse the raw body (must keep raw buffer available for HMAC — verify Express `express.json({ verify: ... })` already captures it; if not, add `req.rawBody` capture middleware specifically for `/webhooks/jira`).
    2. Extract `issue.fields.project.key` from the parsed payload (Jira webhook standard shape).
    3. Look up the project: `prisma.project.findFirst({ where: { jira_project_key: projectKey } })` → returns `{ tenant_id, ... }`.
    4. If no project found → return `404 { error: "Unknown Jira project" }` and log warning (do NOT 401 — this is an unknown project, not auth failure).
    5. Call `await secretRepo.get(project.tenant_id, "jira_webhook_secret")` (T4 method).
    6. **Grace-period fallback**: If `null`, fall back to `process.env.JIRA_WEBHOOK_SECRET`. Emit a `logger.warn` with `{ tenant_id, project_key, fallback: "platform_env" }` so operators can monitor migration progress.
    7. Compute `hmacSha256(rawBody, secret)` and constant-time compare against `req.headers["x-hub-signature"]` (or `x-jira-signature` — match existing header name).
    8. On mismatch → `401 { error: "Invalid webhook signature" }`.
    9. On match → continue existing flow, passing `tenant_id` into the task creation (`prisma.task.create({ data: { tenant_id: project.tenant_id, ... } })`).
  - Add structured logging at each branch (resolved-tenant, fallback-used, signature-pass, signature-fail) with no secret material in logs.
  - Update existing tests in `tests/gateway/routes/jira.test.ts` (or create if absent) to cover new flow — see QA scenarios below.

  **Must NOT do**:
  - Do NOT modify `orchestrate.mts` or any worker code — only the webhook handler changes.
  - Do NOT remove the `process.env.JIRA_WEBHOOK_SECRET` fallback — it is the migration grace period for tenants without a secret yet.
  - Do NOT change the Jira webhook signing scheme (HMAC-SHA256, constant-time compare) — only the secret source changes.
  - Do NOT log the secret value, the HMAC, or any portion of `rawBody` containing PII.
  - Do NOT introduce a new HTTP header (e.g., `X-Tenant-ID`) — tenant must be derived from payload, never trusted from request headers.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Auth-critical refactor with security implications (HMAC, constant-time compare, fallback behavior); changes a load-bearing webhook entry point; requires understanding of Express middleware ordering for raw body capture.
  - **Skills**: `[]`
    - No specialized skill required; agent should rely on existing codebase patterns and Node.js `crypto` standard library.
  - **Skills Evaluated but Omitted**:
    - `playwright`: not needed — webhook is server-to-server, tested via `supertest` not browser.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with other Wave 3 tasks T11-T16, T22)
  - **Parallel Group**: Wave 3
  - **Blocks**: T17 (setup-two-tenants must seed `jira_webhook_secret` per tenant if testing engineering employee), T18 (integration tests must cover this handler)
  - **Blocked By**: T3 (TenantRepository), T4 (TenantSecretRepository) — must exist before this can call `secretRepo.get()`

  **References**:

  **Pattern References** (existing code to follow):
  - `src/gateway/routes/jira.ts` (entire file) — current handler with global `process.env.JIRA_WEBHOOK_SECRET` usage; refactor target.
  - `src/gateway/routes/admin-projects.ts` — reference for how `prisma.project` queries are structured in this codebase.
  - `src/gateway/server.ts` — confirm `express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })` is already in place; if not, add it scoped to `/webhooks/jira` only.

  **API/Type References**:
  - `prisma/schema.prisma` model `Project` — confirm field name is `jira_project_key` (snake_case) and that it has a `tenant_id` foreign key column (added by T6).
  - Jira webhook payload reference: `issue.fields.project.key` (e.g., `"MYPROJ"`).

  **Test References**:
  - `tests/gateway/routes/admin-projects.test.ts` — for `supertest` + Express harness patterns used in this codebase.
  - Look for any existing Jira webhook test in `tests/gateway/` — if one exists, follow its mocking pattern for `prisma.project` and `secretRepo`.

  **External References**:
  - Node.js docs: `crypto.timingSafeEqual()` — required for HMAC compare to avoid timing attacks.
  - Atlassian Jira webhook payload reference: https://developer.atlassian.com/cloud/jira/platform/webhooks/

  **WHY Each Reference Matters**:
  - The existing `jira.ts` is the refactor target — agent must read and preserve all non-auth logic (rate limiting, payload validation, task creation).
  - `admin-projects.ts` shows the exact Prisma usage style (camelCase model, snake_case columns) — must match.
  - `crypto.timingSafeEqual()` is mandatory for HMAC compare; using `===` introduces timing-attack vulnerability (Momus would reject).

  **Acceptance Criteria**:

  **Tests-after (per Verification Strategy):**
  - [ ] `tests/gateway/routes/jira.test.ts` exists or is updated; covers: (a) tenant resolved from project key + tenant secret used for HMAC, (b) tenant resolved + secret missing + platform fallback used + warn logged, (c) project not found → 404, (d) signature mismatch → 401, (e) signature match with tenant secret → 200 + task created with correct `tenant_id`.
  - [ ] `pnpm test -- --run tests/gateway/routes/jira.test.ts` → PASS, ≥5 tests, 0 failures.
  - [ ] `pnpm build` → no TypeScript errors introduced (existing pre-existing errors in `lifecycle.ts` etc. remain; do not touch).
  - [ ] `pnpm lint` → no new errors introduced in `src/gateway/routes/jira.ts`.

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Webhook signed with tenant secret is accepted and task is created with correct tenant_id
    Tool: Bash (curl + psql)
    Preconditions:
      - Local stack running (pnpm dev:start)
      - Tenant "DozalDevs" seeded (id 00000000-0000-0000-0000-000000000002) with project `DOZAL` registered
      - TenantSecret seeded: key=`jira_webhook_secret`, value=`tenant-test-secret-1`
      - Empty tasks table (or note baseline count)
    Steps:
      1. Build payload: PAYLOAD='{"webhookEvent":"jira:issue_created","issue":{"key":"DOZAL-1","fields":{"project":{"key":"DOZAL"},"summary":"Test","description":"Test"}}}'
      2. Compute SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "tenant-test-secret-1" -binary | base64)
      3. curl -X POST http://localhost:3000/webhooks/jira -H "Content-Type: application/json" -H "x-hub-signature: sha256=$SIG" --data "$PAYLOAD" -w "\nHTTP_STATUS:%{http_code}\n" | tee .sisyphus/evidence/task-21-tenant-secret.log
      4. Assert response status 200 (or 202).
      5. psql $DATABASE_URL -c "SELECT id, tenant_id FROM tasks WHERE external_id='DOZAL-1' ORDER BY created_at DESC LIMIT 1" | tee -a .sisyphus/evidence/task-21-tenant-secret.log
      6. Assert tenant_id = `00000000-0000-0000-0000-000000000002`.
    Expected Result: 200 + task row exists with DozalDevs tenant_id.
    Failure Indicators: 401 (signature failed → tenant secret not consulted), task missing, task with wrong tenant_id, task with NULL tenant_id.
    Evidence: .sisyphus/evidence/task-21-tenant-secret.log

  Scenario: Webhook signed with platform secret is accepted via grace-period fallback when tenant has no secret set
    Tool: Bash (curl)
    Preconditions:
      - Tenant "VLRE" (00000000-0000-0000-0000-000000000003) registered with project `VLRE` but NO `jira_webhook_secret` in TenantSecret
      - process.env.JIRA_WEBHOOK_SECRET=`platform-fallback-secret`
      - Gateway logs being captured
    Steps:
      1. PAYLOAD='{"webhookEvent":"jira:issue_created","issue":{"key":"VLRE-1","fields":{"project":{"key":"VLRE"},"summary":"Test"}}}'
      2. SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "platform-fallback-secret" -binary | base64)
      3. curl -X POST http://localhost:3000/webhooks/jira -H "x-hub-signature: sha256=$SIG" -H "Content-Type: application/json" --data "$PAYLOAD" -w "\nHTTP_STATUS:%{http_code}\n" | tee .sisyphus/evidence/task-21-fallback.log
      4. Assert status 200.
      5. grep "fallback" /tmp/ai-dev.log | tail -5 | tee -a .sisyphus/evidence/task-21-fallback.log
      6. Assert log line contains `tenant_id=00000000-0000-0000-0000-000000000003` and `fallback=platform_env`.
    Expected Result: 200 + warn log emitted with tenant_id + fallback flag.
    Failure Indicators: 401 (fallback not used), no warn log emitted.
    Evidence: .sisyphus/evidence/task-21-fallback.log

  Scenario: Webhook with mismatched signature is rejected with 401
    Tool: Bash (curl)
    Preconditions: Tenant DozalDevs has tenant secret `tenant-test-secret-1`.
    Steps:
      1. PAYLOAD='{"webhookEvent":"jira:issue_created","issue":{"fields":{"project":{"key":"DOZAL"}}}}'
      2. curl -X POST http://localhost:3000/webhooks/jira -H "x-hub-signature: sha256=WRONGSIG" -H "Content-Type: application/json" --data "$PAYLOAD" -w "\nHTTP_STATUS:%{http_code}\n" -o .sisyphus/evidence/task-21-bad-sig.log
      3. Assert status 401.
      4. Assert response body `{"error":"Invalid webhook signature"}`.
      5. psql $DATABASE_URL -c "SELECT count(*) FROM tasks WHERE created_at > NOW() - INTERVAL '1 minute'" — assert no new rows.
    Expected Result: 401 + no task created.
    Failure Indicators: 200 status, task created from invalid signature.
    Evidence: .sisyphus/evidence/task-21-bad-sig.log

  Scenario: Webhook for unknown Jira project returns 404 (not 401, not 500)
    Tool: Bash (curl)
    Preconditions: No project exists with key `NOSUCH`.
    Steps:
      1. PAYLOAD='{"webhookEvent":"jira:issue_created","issue":{"fields":{"project":{"key":"NOSUCH"}}}}'
      2. SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "anything" -binary | base64)
      3. curl -X POST http://localhost:3000/webhooks/jira -H "x-hub-signature: sha256=$SIG" -H "Content-Type: application/json" --data "$PAYLOAD" -w "\nHTTP_STATUS:%{http_code}\n" -o .sisyphus/evidence/task-21-unknown-project.log
      4. Assert status 404.
      5. Assert response body contains `"Unknown Jira project"`.
    Expected Result: 404 + descriptive error.
    Failure Indicators: 500 (uncaught exception), 401 (wrong code), 200 (task created).
    Evidence: .sisyphus/evidence/task-21-unknown-project.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-21-tenant-secret.log`
  - [ ] `.sisyphus/evidence/task-21-fallback.log`
  - [ ] `.sisyphus/evidence/task-21-bad-sig.log`
  - [ ] `.sisyphus/evidence/task-21-unknown-project.log`

  **Commit**: YES
  - Message: `feat(gateway): make Jira webhook handler tenant-aware`
  - Files: `src/gateway/routes/jira.ts`, `tests/gateway/routes/jira.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run tests/gateway/routes/jira.test.ts`

- [x] 22. **Engineering lifecycle: inject tenant-scoped env into worker**

  **What to do**:
  - Refactor `src/inngest/lifecycle.ts` (the **engineering** lifecycle, NOT `employee-lifecycle.ts`) to load tenant-scoped environment variables before dispatching the Fly.io machine.
  - Replace any direct `process.env.GITHUB_TOKEN` or `process.env.OPENROUTER_API_KEY` usage in machine env construction with a call to `loadTenantEnv()` (the helper from T15).
  - Concrete change pattern:

    ```ts
    // Before (current):
    const machineEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      TASK_ID: task.id,
      // ...
    };

    // After:
    const tenantEnv = await loadTenantEnv(task.tenant_id, {
      tenantRepo,
      secretRepo,
      keys: ['GITHUB_TOKEN', 'OPENROUTER_API_KEY'], // tenant-scoped keys to load
      platformKeys: ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'], // copied from process.env
    });
    const machineEnv = {
      ...tenantEnv,
      TASK_ID: task.id,
      // ... other task-specific overrides
    };
    ```

  - `loadTenantEnv()` (from T15) handles tenant lookup, secret decryption, and platform-env fallback per key. This task only changes the call site.
  - Pass `task.tenant_id` (must exist on the task row from T6 FK enforcement) — if `null` or undefined, throw a hard error: `new Error("Cannot dispatch engineering worker: task.tenant_id is required")`. This is intentional — every task post-T6 has tenant_id.
  - Do NOT touch the pre-existing TypeScript errors in this file (per AGENTS.md ignore list). Add only the tenant-env injection lines and necessary imports. If your change reveals a NEW type error caused by your edit, fix it — but do not fix unrelated pre-existing errors.

  **Must NOT do**:
  - Do NOT modify `src/workers/orchestrate.mts` or any other worker container code — the worker reads its env from the machine, so it sees the right values automatically once the machine env is correct.
  - Do NOT modify Fly.io machine creation API call shape (`flyClient.createMachine(...)`) beyond the `env` field.
  - Do NOT remove the platform `.env` fallback inside `loadTenantEnv()` — grace period for tenants without secrets set.
  - Do NOT add a `tenant_id` field to the worker's CLI args — env injection is the channel; CLI args are for task-instance data only.
  - Do NOT fix unrelated pre-existing TypeScript errors in `lifecycle.ts` (per AGENTS.md, `lifecycle.ts` is on the ignore list).
  - Do NOT log decrypted secret values at any point (audit your `logger.info` / `logger.debug` calls).

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Touches a critical orchestration path (engineering employee dispatch); requires understanding of how Fly.io machine env is consumed by `orchestrate.mts`; one wrong env key name silently breaks worker authentication.
  - **Skills**: `[]`
    - No skill required; agent should grep for `flyClient.createMachine` and `process.env.GITHUB_TOKEN` to find call sites.
  - **Skills Evaluated but Omitted**:
    - `playwright`: irrelevant (no UI).
    - `git-master`: not needed (single-file refactor).

  **Parallelization**:
  - **Can Run In Parallel**: YES (with other Wave 3 tasks T11-T16, T21)
  - **Parallel Group**: Wave 3
  - **Blocks**: T17 (setup-two-tenants must seed `GITHUB_TOKEN` + `OPENROUTER_API_KEY` per tenant if engineering employee will be tested), T18 (integration test must cover this dispatch path)
  - **Blocked By**: T3 (TenantRepository), T4 (TenantSecretRepository), T15 (loadTenantEnv helper), T6 (task.tenant_id FK enforced)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts` (modified by T15) — read this AFTER T15 is done; it shows the `loadTenantEnv()` call pattern to mirror here.
  - `src/inngest/lifecycle.ts` (current) — the file to modify. Locate the `flyClient.createMachine(...)` call and the env object passed to it.
  - `src/lib/fly-client.ts` — reference for `createMachine()` signature and how `env` is forwarded.

  **API/Type References**:
  - `src/gateway/services/tenant-env-loader.ts` (created by T15) — exports `loadTenantEnv(tenantId, options)`. Confirm signature matches the call you write.
  - `prisma/schema.prisma` — confirm `Task.tenant_id` is non-null after T6 migration.

  **Test References**:
  - `tests/inngest/lifecycle.test.ts` — extend with a tenant-env injection test. (This file has pre-existing errors per AGENTS.md — only add NEW test cases; do not touch existing failing assertions.)
  - The T15 test file is the closest pattern.

  **External References**:
  - Fly.io machine API docs: env is a flat string-to-string map passed at machine create time.

  **WHY Each Reference Matters**:
  - `employee-lifecycle.ts` post-T15 is the canonical pattern for `loadTenantEnv()` usage — copying the exact shape avoids drift between summarizer and engineering lifecycles.
  - `lifecycle.ts` ignore-list status means agent must surgically edit ONLY the env construction; touching anything else risks regressing pre-existing tolerated errors.
  - Confirming `Task.tenant_id` is non-null prevents the agent from writing defensive null checks that would hide a schema bug.

  **Acceptance Criteria**:

  **Tests-after**:
  - [ ] `tests/inngest/lifecycle.test.ts` extended with new `describe("tenant env injection", ...)` block (pre-existing tests untouched).
  - [ ] Test asserts: given `task.tenant_id` = DozalDevs ID, `flyClient.createMachine` is called with `env.GITHUB_TOKEN` = decrypted DozalDevs `github_token` secret.
  - [ ] Test asserts: given DozalDevs has no `github_token` secret, `env.GITHUB_TOKEN` falls back to `process.env.GITHUB_TOKEN`.
  - [ ] Test asserts: given `task.tenant_id` is null/undefined, dispatch throws with message containing "tenant_id is required".
  - [ ] `pnpm test -- --run tests/inngest/lifecycle.test.ts` → new tests PASS (pre-existing failing tests still fail per AGENTS.md ignore list — that is fine).
  - [ ] `pnpm build` → no NEW TypeScript errors introduced.

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Engineering task for DozalDevs uses DozalDevs's GITHUB_TOKEN
    Tool: Bash (psql + log inspection — no real Fly machine spawned; assert via mocked flyClient capture)
    Preconditions:
      - Tenant DozalDevs (00000000-0000-0000-0000-000000000002) has TenantSecret github_token=`ghp_dozaldevs_test`
      - Project `DOZAL` registered with tenant_id=DozalDevs
      - process.env.GITHUB_TOKEN=`ghp_platform_default`
      - flyClient mocked to capture `createMachine` calls (test mode flag or env stub)
    Steps:
      1. Trigger: pnpm trigger-task -- --tenant-id 00000000-0000-0000-0000-000000000002 --project-key DOZAL --capture-fly-env .sisyphus/evidence/task-22-dozaldevs-env.json
      2. Assert script writes captured env JSON to evidence path.
      3. cat .sisyphus/evidence/task-22-dozaldevs-env.json | jq '.GITHUB_TOKEN'
      4. Assert value === "ghp_dozaldevs_test" (NOT "ghp_platform_default").
      5. cat .sisyphus/evidence/task-22-dozaldevs-env.json | jq '.OPENROUTER_API_KEY' — assert tenant value if seeded, else platform fallback.
    Expected Result: Captured env contains tenant-scoped GITHUB_TOKEN.
    Failure Indicators: env.GITHUB_TOKEN = platform value (tenant secret ignored), env.GITHUB_TOKEN missing.
    Evidence: .sisyphus/evidence/task-22-dozaldevs-env.json

  Scenario: Engineering task with no tenant secret falls back to platform GITHUB_TOKEN
    Tool: Bash (psql + flyClient mock capture)
    Preconditions:
      - Tenant VLRE (00000000-0000-0000-0000-000000000003) has NO `github_token` TenantSecret row
      - process.env.GITHUB_TOKEN=`ghp_platform_default`
      - Project `VLRE` registered with tenant_id=VLRE
    Steps:
      1. pnpm trigger-task -- --tenant-id 00000000-0000-0000-0000-000000000003 --project-key VLRE --capture-fly-env .sisyphus/evidence/task-22-vlre-env.json
      2. cat .sisyphus/evidence/task-22-vlre-env.json | jq '.GITHUB_TOKEN'
      3. Assert value === "ghp_platform_default".
      4. grep "fallback=platform_env" /tmp/ai-dev.log | tail -5
      5. Assert at least one log line emitted for tenant_id=VLRE during this dispatch.
    Expected Result: Platform fallback used + warn log emitted.
    Failure Indicators: env.GITHUB_TOKEN missing, no warn log.
    Evidence: .sisyphus/evidence/task-22-vlre-env.json, .sisyphus/evidence/task-22-vlre-fallback.log

  Scenario: Engineering dispatch with null tenant_id throws hard error (defense-in-depth)
    Tool: Bash (Vitest unit test or trigger script with --inject-null-tenant flag)
    Preconditions: Test harness can construct a task object with tenant_id=null (bypass T6 FK check via direct Inngest event injection in test mode).
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle.test.ts -t "throws on null tenant_id"
      2. Assert test passes — error message contains "tenant_id is required".
      3. Capture test output to .sisyphus/evidence/task-22-null-tenant.log.
    Expected Result: Hard error thrown, dispatch aborted, no Fly call made.
    Failure Indicators: Dispatch proceeds with platform-only env (silent contamination risk).
    Evidence: .sisyphus/evidence/task-22-null-tenant.log

  Scenario: No decrypted secret value appears in any log output during dispatch
    Tool: Bash (grep)
    Preconditions: After running the DozalDevs scenario above, gateway logs at /tmp/ai-dev.log contain dispatch traces.
    Steps:
      1. grep -c "ghp_dozaldevs_test" /tmp/ai-dev.log
      2. Assert count === 0.
      3. grep -c "ghp_platform_default" /tmp/ai-dev.log
      4. Assert count === 0.
      5. Save: grep -c "ghp_" /tmp/ai-dev.log > .sisyphus/evidence/task-22-no-secret-leak.log
    Expected Result: Zero secret values in logs.
    Failure Indicators: Any non-zero count of `ghp_` strings.
    Evidence: .sisyphus/evidence/task-22-no-secret-leak.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-22-dozaldevs-env.json`
  - [ ] `.sisyphus/evidence/task-22-vlre-env.json`
  - [ ] `.sisyphus/evidence/task-22-vlre-fallback.log`
  - [ ] `.sisyphus/evidence/task-22-null-tenant.log`
  - [ ] `.sisyphus/evidence/task-22-no-secret-leak.log`

  **Commit**: YES
  - Message: `refactor(inngest): inject tenant-scoped env into engineering worker`
  - Files: `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run tests/inngest/lifecycle.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback → fix → re-run → present again → wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read this plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found (e.g., `grep "X-Tenant-Key" src/` must be empty). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` (tsc --noEmit) + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Check for NEW pre-existing LSP errors beyond documented ones (`lifecycle.ts`, `redispatch.ts`, `seed.ts`, `employee-lifecycle.ts`, `lifecycle.test.ts`).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA (2-Org Proof)** — `unspecified-high` (+ `playwright` skill for Slack screenshots)
      Follow `docs/multi-tenancy-guide.md` to execute the full 2-org proof against the user's REAL Slack workspaces (DozalDevs + VLRE):
  1. Start from clean DB state, run migrations + seed
  2. Run `pnpm setup:two-tenants` to provision DozalDevs + VLRE (T17 script)
  3. For VLRE: legacy `SLACK_BOT_TOKEN` env var migrated into `tenant_secrets.slack_bot_token` for tenant_id=00000000-0000-0000-0000-000000000003 (verified via psql)
  4. For DozalDevs: complete OAuth install via `http://localhost:3000/slack/install?tenant=00000000-0000-0000-0000-000000000002` in browser, callback writes encrypted token + slack_team_id
  5. Configure source + target channels for each tenant via admin API
  6. Trigger `daily-summarizer` for BOTH tenants simultaneously (`POST /admin/tenants/<id>/employees/daily-summarizer/trigger` for each)
  7. Capture Playwright screenshots showing the digest message posted in each workspace's target channel — workspace name + digest content visible
  8. Verify cross-tenant API rejection: `GET /admin/tenants/<DozalDevs>/tasks/<VLRE_task_id>` → 404
  9. Inspect DB: confirm `tenant_secrets.ciphertext` values are actually encrypted (`SELECT ciphertext FROM tenant_secrets` shows binary, not `xoxb-...`)
  10. Save evidence to `.sisyphus/evidence/final-qa/` (screenshots, psql output, curl responses)
      Output: `Scenarios [N/N pass] | Integration [N/N] | Encryption Verified [YES/NO] | Slack Workspaces [DozalDevs ✓ / VLRE ✓] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: search for `RLS`, `X-Tenant-Key`, user auth patterns, tenant_id on executions/deliverables/etc. **CRITICAL — verify NO hard-delete of tenants anywhere**: `grep -rn "prisma\.tenant\.delete\|DELETE FROM tenants\|hardDelete" src/ --include="*.ts" scripts/ --include="*.ts"` MUST return empty. Verify Jira flow untouched (`git diff src/gateway/routes/jira.ts` should be empty). Detect cross-task contamination (Task N touching Task M's files). Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | Scope Creep [CLEAN/N forbidden patterns] | Hard-Delete Audit [CLEAN/N occurrences] | VERDICT`

---

## Commit Strategy

- **T1**: `feat(db): add Tenant and TenantSecret models` — schema.prisma + migration A, `pnpm prisma generate && pnpm prisma migrate dev`
- **T2**: `feat(lib): add AES-256-GCM encryption utility` — encryption.ts + tests, `pnpm test src/lib/encryption.test.ts -- --run`
- **T3**: `feat(gateway): add tenant repository service` — tenant-repository.ts + tests
- **T4**: `feat(gateway): add tenant secret repository with encryption` — tenant-secret-repository.ts + tests
- **T5**: `feat(gateway): add zod schemas for tenant management` — schemas.ts additions + tests
- **T6**: `feat(db): enforce foreign key constraints on tenant_id columns` — migration B, `pnpm prisma migrate dev`
- **T7**: `feat(gateway): add /admin/tenants CRUD routes` — admin-tenants.ts + tests
- **T8**: `feat(gateway): add /admin/tenants/:id/secrets CRUD routes` — admin-tenant-secrets.ts + tests
- **T9**: `feat(gateway): add /admin/tenants/:id/config endpoints` — admin-tenant-config.ts + tests
- **T10**: `feat(db): seed Platform tenant + DozalDevs + VLRE tenants` — seed.ts update
- **T11**: `feat(gateway): add Slack OAuth install endpoint` — slack-oauth.ts (install handler) + tests
- **T12**: `feat(gateway): add Slack OAuth callback with encrypted token storage` — slack-oauth.ts (callback handler) + tests
- **T13**: `feat(gateway): add Slack Bolt InstallationStore backed by tenant_secrets` — installation-store.ts + tests
- **T14**: `refactor(gateway): wire Slack Bolt to per-workspace InstallationStore` — server.ts refactor + tests
- **T15**: `refactor(inngest): inject tenant-scoped env into worker machines` — employee-lifecycle.ts + tenant-env-loader.ts + tests
- **T16**: `chore(workers): verify slack tools work with tenant-injected env` — minor adjustments + tests
- **T17**: `feat(scripts): add setup-two-tenants provisioning script for DozalDevs + VLRE` — scripts/setup-two-tenants.ts, package.json, .env.example
- **T18**: `test(integration): add multi-tenancy isolation and encryption tests` — tests/integration/multi-tenancy.test.ts
- **T19**: `docs: add multi-tenancy admin guide` — docs/YYYY-MM-DD-HHMM-multi-tenancy-guide.md
- **T20**: `feat(scripts): add verify-multi-tenancy end-to-end runner` — scripts/verify-multi-tenancy.ts
- **T21**: `feat(gateway): make Jira webhook handler tenant-aware` — src/gateway/routes/jira.ts + tests
- **T22**: `refactor(inngest): inject tenant-scoped env into engineering worker` — src/inngest/lifecycle.ts + tests

Pre-commit hook check: all commits MUST pass `pnpm build && pnpm lint && pnpm test -- --run` (no `--no-verify` per AGENTS.md).

---

## Success Criteria

### Verification Commands

```bash
# Schema integrity
pnpm prisma migrate status                                          # Expected: all migrations applied
pnpm prisma validate                                                 # Expected: schema valid

# Build + test baseline
pnpm build                                                           # Expected: 0 new errors
pnpm lint                                                            # Expected: clean
pnpm test -- --run                                                   # Expected: 925+ passing, 0 new failures

# Encryption utility
node -e 'import("./dist/lib/encryption.js").then(m => { const enc = m.encrypt("hello"); console.log("roundtrip:", m.decrypt(enc) === "hello") })'  # Expected: roundtrip: true

# Tenant admin API (DozalDevs + VLRE are seeded by T10; this verifies the create endpoint with a throwaway tenant)
curl -X POST http://localhost:3000/admin/tenants \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Throwaway Tenant","slug":"throwaway"}'
# Expected: 201, returns { id, slug, install_link }

curl -X GET http://localhost:3000/admin/tenants \
  -H "X-Admin-Key: $ADMIN_API_KEY"
# Expected: 200, returns array including Platform + DozalDevs + VLRE (after seed)

# Tenant secret storage (encryption proof) — using DozalDevs tenant ID
DOZALDEVS=00000000-0000-0000-0000-000000000002
curl -X POST "http://localhost:3000/admin/tenants/$DOZALDEVS/secrets" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key":"slack_bot_token","value":"xoxb-test"}'
# Expected: 201, returns { key: "slack_bot_token", is_set: true } (NO plaintext in response)

psql $DATABASE_URL -c "SELECT key, ciphertext FROM tenant_secrets WHERE tenant_id='$DOZALDEVS' AND key='slack_bot_token' LIMIT 1;"
# Expected: ciphertext is NOT 'xoxb-test' (proof of encryption at rest)

# Cross-tenant isolation — querying VLRE's task under DozalDevs scope must 404
VLRE=00000000-0000-0000-0000-000000000003
curl -X GET "http://localhost:3000/admin/tenants/$DOZALDEVS/tasks/{VLRE_TASK_ID}" \
  -H "X-Admin-Key: $ADMIN_API_KEY"
# Expected: 404 (VLRE's task not visible under DozalDevs scope)

# Soft-delete behavior — tenant remains in DB but disappears from default list
curl -X DELETE "http://localhost:3000/admin/tenants/{THROWAWAY_ID}" \
  -H "X-Admin-Key: $ADMIN_API_KEY"
# Expected: 204; tenant.deleted_at set, slug suffixed with timestamp for re-use
psql $DATABASE_URL -c "SELECT id, deleted_at FROM tenants WHERE id='{THROWAWAY_ID}'"
# Expected: row exists, deleted_at IS NOT NULL (proof of soft-delete, NOT hard-delete)

# Restore endpoint — undoes soft-delete
curl -X POST "http://localhost:3000/admin/tenants/{THROWAWAY_ID}/restore" \
  -H "X-Admin-Key: $ADMIN_API_KEY"
# Expected: 200; tenant.deleted_at set back to NULL

# End-to-end 2-org proof
pnpm setup:two-tenants                                               # Expected: DozalDevs + VLRE provisioned
pnpm verify:multi-tenancy                                            # Expected: all checks pass, summary printed
```

### Final Checklist

- [ ] All "Must Have" items delivered (audit via F1)
- [ ] All "Must NOT Have" items absent (audit via F4) — INCLUDING zero hard-delete code paths for tenants
- [ ] All 22 tasks complete with QA evidence in `.sisyphus/evidence/`
- [ ] All 887 existing tests still pass + new tests for encryption, repos, routes, OAuth, tenant-aware Jira webhook, tenant-scoped engineering env
- [ ] `docs/YYYY-MM-DD-HHMM-multi-tenancy-guide.md` exists and is accurate
- [ ] DozalDevs + VLRE 2-org Slack proof captured with screenshots in `.sisyphus/evidence/final-qa/`
- [ ] VLRE legacy `SLACK_BOT_TOKEN` migrated into `tenant_secrets` (verified via psql query — env var no longer required for VLRE summarizer to run)
- [ ] DozalDevs OAuth-installed Slack bot successfully posts a digest to its target channel
- [ ] User has explicitly approved F1-F4 review results

---

## Prerequisites for Execution

Before running `/start-work`, ensure:

1. **Slack app created** — Create a single Slack app at https://api.slack.com/apps with:
   - OAuth scopes: `channels:history`, `chat:write`, `chat:write.public`
   - Redirect URL: `https://{public-host}/slack/oauth_callback` (use Cloudflare Tunnel for local dev)
   - Event subscriptions enabled for interactive buttons
   - Note: `CLIENT_ID`, `CLIENT_SECRET`, `SIGNING_SECRET` — add to `.env`

2. **Two real Slack workspaces** — DozalDevs + VLRE:
   - VLRE workspace: already connected via legacy `SLACK_BOT_TOKEN` env var. T17 will migrate this token into `tenant_secrets` and prompt for VLRE's Slack team ID.
   - DozalDevs workspace: requires running the OAuth install flow via `http://localhost:3000/slack/install?tenant=00000000-0000-0000-0000-000000000002` during T17 execution.
   - User must have admin access to both workspaces to install the bot.

3. **Cloudflare Tunnel running** — `cloudflared tunnel --url http://localhost:3000` for OAuth callback in local dev

4. **ENCRYPTION_KEY generated** — `openssl rand -hex 32` → paste into `.env` as `ENCRYPTION_KEY=<hex>`

5. **DB backup** — Before first migration: `pg_dump $DATABASE_URL > backup-pre-multitenancy.sql`
