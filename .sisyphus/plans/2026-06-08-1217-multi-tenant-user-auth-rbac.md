# Multi-Tenant User Authentication, Roles & Permissions

## TL;DR

> **Quick Summary**: Add real per-user authentication (Supabase Auth: email/password + Google + Supabase-managed invitations), a two-tier role model (global `Role` + per-tenant `TenantRole`), and a static permission map to the multi-tenant ai-employee platform. The Express gateway is the single authorization boundary — it verifies the Supabase JWT (identity only) and derives tenant memberships + roles from Postgres on every request, giving immediate effect to role changes and deactivation. The legacy `ADMIN_API_KEY` is fully removed (humans use Supabase JWTs, machines use a new `SERVICE_TOKEN`). The platform runs against **two environments**: existing **LOCAL** self-hosted Supabase (HS256) AND a real **CLOUD** Supabase project (`gjqrysxpvktmibpkwrvy`, us-west-2) using the **new opaque key model** (publishable/secret; legacy anon/service_role are deprecated and unused) with **ES256/JWKS** tokens. **User lifecycle (invite + deactivate) is managed via the Supabase Admin API.** Every wave ends with a **real end-to-end checkpoint** (Playwright browser journeys + `curl` API journeys), run against both environments.
>
> **Deliverables**:
>
> - Prisma models: `User` (bridges `supabaseId` → `auth.users`), `TenantMembership`, `TenantInvitation` (tenant+role intent store), enums `Role` + `TenantRole` (+ migration, soft-delete)
> - **New key model + dual-env config**: env-driven LOCAL vs CLOUD profile (`SUPABASE_URL`/publishable/secret/JWKS/`DATABASE_URL`); value-only change (keep env var names); atomic-profile startup assertion
> - **CLOUD provisioning**: run Prisma migrations against cloud Postgres (session pooler for migrate, txn pooler for runtime), reload cloud Data API schema, seed 2 tenants + bootstrap owner, configure cloud Auth providers + redirect allow-list (localhost + cloud)
> - Local Supabase Auth (email/password + Google) on the **active** compose file (`docker/supabase-services.yml`) with corrected `GOTRUE_SITE_URL`
> - Gateway auth middleware (dual-accept during migration): **env-aware JWT verify** (`jose` — JWKS/ES256 for cloud, HS256 for local) + `SERVICE_TOKEN` + legacy admin key; `ensureUserExists` upsert; DB-derived authz helpers `requireAuth`/`requireTenantRole`/`requirePermission`; immediate deactivation/role-change enforcement
> - Static `ROLE_PERMISSIONS` map (no permissions table)
> - **Supabase-managed lifecycle**: invite via `auth.admin.inviteUserByEmail` (app `TenantInvitation` stores tenant+role; membership materialized in a Serializable txn on accept); deactivate writes app `users.status='disabled'` (immediate) **and** Supabase ban (token-refresh backstop)
> - Gateway endpoints: `/me`, `/me/tenants`, member list/role-change/remove, invite/accept/decline/revoke, and gateway read endpoints replacing the dashboard's direct PostgREST reads (fixes opaque-key-in-Bearer breakage)
> - `SERVICE_TOKEN` wired into all machine callers; **full removal of `ADMIN_API_KEY`** (grep = 0 in active code)
> - Bootstrap: idempotent `scripts/seed-platform-owner.ts` + SQL break-glass; owner owns the 2 seeded tenants (both envs)
> - Dashboard: login/signup/forgot pages, Supabase auth context/session, protected routes, JWT-based gateway calls, membership-driven tenant switcher, member/invite management UI
> - **Per-wave dual-env E2E** (Playwright + curl) with evidence under `.sisyphus/evidence/{local,cloud}/`
> - Minimal RLS backstop (local + cloud); docs + `.env`/`.env.example` updates
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 6 waves (Wave 0 spike → Wave 5 dashboard) each ending in a dual-env E2E checkpoint + Final Verification Wave
> **Critical Path**: T0d (dual-env/key spike) → T1 (schema) → T2 (migration) → TC (cloud provision) → T9 (JWT middleware dual-accept) → T11 (authz helpers) → T16 (apply authz) → T20 (migrate callers) → T24 (remove admin key) → T27 (dashboard auth context) → Final Verification (both envs)
>
> **Environment scope note**: CLOUD verification covers **auth + dashboard + API** (login, users, roles, invite-create, deactivate, tenant switch). The **AI-worker task lifecycle** (worker container → Data API → task `Done`) is verified **LOCAL only** in this plan; worker-against-cloud is a deferred production step. Cloud **invite email delivery** is deferred to a later Resend/SMTP step — on cloud we assert the invite is _created_ (account `invited` + `TenantInvitation` row), not email delivery; full invite→accept email E2E runs on LOCAL (Mailpit).

---

## Context

### Original Request

> "Investigate the best way to add users, user authentication, user permissions, and user roles by utilizing my existing configuration plus Supabase. Use the nexus-stack repo (`/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack`) as a reference. Recommendations welcome. Each tenant/organization can have one or more users."

### Interview Summary

**Key Decisions (confirmed with user)**:

- **Authz enforcement**: App-layer in the Express gateway (Prisma) is the real boundary; RLS is a minimal defense-in-depth backstop only.
- **Role model**: Two-tier — global `Role` (PLATFORM_OWNER/ADMIN/EDITOR/USER/VIEWER) on `User` + per-tenant `TenantRole` (OWNER/ADMIN/MEMBER/VIEWER) on `TenantMembership`. PLATFORM_OWNER = cross-tenant superadmin.
- **Auth methods**: Email/password + Google OAuth + app-level invitations.
- **Admin key**: REMOVE `ADMIN_API_KEY` entirely. Humans → Supabase JWT. Machines → new dedicated `SERVICE_TOKEN` bearer.
- **Dashboard**: Full login + auth context + protected routes + JWT-based calls + membership-driven tenant switcher + member/invite management UI.
- **Multi-tenancy**: A user can belong to many tenants.
- **Permissions**: Static `ROLE_PERMISSIONS` map in code (no permissions table for v1).
- **Read path (D-A) = Gateway-mediated**: Dashboard reads route through the gateway (with the user JWT), not direct PostgREST.
- **Authz source of truth (D-B/D-C/D-D) = Database, per request; JWT carries identity only; NO custom access token hook**. Role changes & deactivation take effect immediately.
- **Bootstrap**: Idempotent `scripts/seed-platform-owner.ts` + SQL break-glass; owner owns the 2 seeded tenants.

**Expansion Decisions (2026-06-08, second interview round)**:

- **Supabase-managed lifecycle**: invitations and deactivation go through the **Supabase Admin API** (not an app-only token table / status flag). The app keeps `TenantInvitation` (tenant+role intent) and `users.status` (immediate-lockout enforcement); Supabase ban is the token-refresh backstop.
- **New key model**: legacy **anon** + **service_role** keys are deprecated and must NOT be used. Use **publishable** (browser) + **secret** (server/worker). Keep env var _names_ (`SUPABASE_ANON_KEY` holds the publishable value, `SUPABASE_SECRET_KEY` the secret) — change values only.
- **Dual environment**: build/verify on existing **LOCAL** self-hosted Supabase AND on a real **CLOUD** project (`gjqrysxpvktmibpkwrvy`, us-west-2). Cloud hosts Supabase Auth + the app database (schema + seed + bootstrap), so production deploy is high-confidence.
- **Crypto path**: verifier supports **both** — JWKS/ES256 for cloud, HS256 shared-secret for local; leave local as-is.
- **Cloud verification depth**: **auth + dashboard + API** on cloud; the worker/task-lifecycle data path is verified **local only** this plan.
- **Cloud invite email**: **deferred** (built-in is 2/hr on all plans, team-only delivery, not for production — verified). Full invite→accept email E2E on local (Mailpit); on cloud assert invite _created_, not delivered. Resend/SMTP is a later production step.
- **Worker secret exposure on cloud**: accepted, no constraints (worker-against-cloud is deferred anyway). Non-blocking advice: rotate the chat-shared secret + DB password later; delete the mistakenly-created duplicate project `hyixisrzstvzoitycfpw`.
- **Real E2E along the way**: every wave ends with a real-user E2E checkpoint (Playwright browser + curl API), run against both envs, evidence captured.

### Second Metis Review (expansion — verified against the live codebase)

- The repo is **already partly wired** for the new key model: `docker/kong-entrypoint.sh` translates `apikey: sb_secret_*`/`sb_publishable_*` → JWTs and passes real user-session Bearer JWTs through unchanged — but it's **dormant** (empty values; local runs HS256). Reuse, don't reinvent.
- **Two Kong files** exist: `docker/volumes/api/kong.yml` (4 keys) vs `docker/kong.yml` (2 keys). The Wave-0 spike must confirm which the active `supabase-services.yml` mounts before editing.
- The **worker data path is already env-driven** (`src/workers/lib/postgrest-client.ts` reads `SUPABASE_URL` + `SUPABASE_SECRET_KEY`; injected via `machine-provisioner.ts` + `tenant-env-loader.ts` whitelist). No code change to point at cloud — env values only. Do NOT convert its `process.env` to `requireEnv` (AGENTS.md forbids).
- The **dual-env switch is one bridge**: `src/gateway/server.ts` serves `VITE_POSTGREST_URL` + key to the browser from `process.env`. Set env per-profile and browser/worker/gateway all follow.
- **Browser PostgREST breaks under opaque keys**: `dashboard/src/lib/postgrest.ts` sends the key in `Authorization: Bearer` too, and `Bearer sb_publishable_*` is rejected. The gateway-mediated reads (T17/T22) fix this; any residual direct call (`preflight-services.ts`) must send `apikey` only.
- **Supabase ban ≠ immediate**: a banned user keeps a valid JWT for ~1h; ban only blocks refresh. The app `users.status` per-request check (T9/T12) is the immediate-lockout mechanism — deactivate writes both.
- `src/lib/interaction-classifier.ts` (~lines 87-88) sends `apikey: ANON` + `Bearer: SECRET` — under opaque keys on cloud, `Bearer sb_secret_*` is rejected. Brought **in scope** to fix (send secret as `apikey`, drop Bearer).

**Research Findings (from explore + librarian agents)**:

- Supabase Auth (GoTrue `v2.186.0`) is **already running** in self-hosted Docker; `auth.users` exists (empty); `GOTRUE_JWT_SECRET == PGRST_JWT_SECRET` (PostgREST already trusts GoTrue JWTs). It is dormant but fully wired.
- nexus-stack is Next.js + NestJS + tRPC; its **data model** (two-enum roles, `supabaseId` bridge, `ensureUserExists`, membership composite PK, invitation token table) is the primary reference. Its **app-layer-only authz** (no RLS on app tables) maps cleanly onto our gateway-as-boundary design.
- Prisma connects via the direct/service-role connection and **BYPASSES RLS** — so RLS can never protect gateway/worker paths. This is the architectural pivot that makes app-layer authz mandatory.

### Metis Review (gaps addressed — verified against the live codebase)

- **Active compose file is `docker/supabase-services.yml`, NOT `docker/docker-compose.yml`** (a template). All Supabase config edits target the active file; verified via `docker inspect`.
- `GOTRUE_SITE_URL` is wrong (`localhost:3000`); must point at the dashboard. Google redirect must be `http://localhost:54331/auth/v1/callback` (Kong port).
- Existing RLS = `anon` SELECT-only on 27 tables; **zero `authenticated` policies**. Because reads move behind the gateway (path B), we do NOT author full `authenticated` policies — avoids the "blank dashboard" failure.
- **Admin-key blast radius**: `requireAdminKey` on 18 route files (~70 endpoints); senders = dashboard `gateway.ts:54`, `gateway.ts:322`, `use-execution-logs.ts:49` (raw fetch — easy to miss) + 7 scripts. **Safe / untouched**: `/internal/tasks/*` (X-Task-ID), webhooks (HMAC/Bolt), OAuth callbacks, worker PostgREST (service key).
- **Bootstrap problem is real**: 2 seeded tenants, zero users, `Tenant` has no `owner_id`.
- `TenantSecretRepository.delete()` is a hard delete — the one soft-delete exception; do NOT copy it for memberships/invitations.
- **Dual-accept migration window** is mandatory: never remove the admin key before the replacement is proven across all endpoints, the dashboard, scripts, and cron.

---

## Work Objectives

### Core Objective

Give the platform real, per-user multi-tenant authentication and authorization: each tenant has one or more users with explicit roles; the Express gateway enforces tenant + role on every request from the database; humans authenticate via Supabase Auth and machines via a dedicated service token; the legacy shared admin key is removed entirely.

### Concrete Deliverables

- Prisma models `User`, `TenantMembership`, `TenantInvitation` + enums `Role`, `TenantRole` + migration (soft-delete, indexes).
- Supabase Auth enabled (email/password + Google) on `docker/supabase-services.yml` with correct URLs.
- Gateway auth middleware (JWT verify + SERVICE_TOKEN + dual-accept admin key), `ensureUserExists`, authz helpers, immediate deactivation/role enforcement.
- Static `ROLE_PERMISSIONS` map + role × endpoint matrix applied to all ~70 admin endpoints.
- Gateway endpoints: `/me`, `/me/tenants`, member/invite CRUD, and dashboard read endpoints.
- `SERVICE_TOKEN` wired into all machine callers; `ADMIN_API_KEY` fully removed.
- `scripts/seed-platform-owner.ts` + SQL break-glass; existing tenants get an owner.
- Dashboard login, auth context, protected routes, tenant switcher, member/invite UI.
- Minimal RLS backstop; docs + env updates.

### Definition of Done

- [ ] A user can sign up / log in (email/password and Google) and receive a Supabase JWT.
- [ ] The gateway accepts the JWT, identifies the user, derives tenant+role from the DB, and authorizes/denies correctly (own tenant 200, other tenant 403, no token 401, wrong role 403).
- [ ] Deactivating a user or changing their role takes effect on the **next request** (no token-lifetime delay).
- [ ] `SERVICE_TOKEN` authenticates all machine callers; `grep -rn "X-Admin-Key\|ADMIN_API_KEY" src dashboard scripts docs .env.example` (excluding `scripts/archive/`) returns **zero** matches; gateway boots with `ADMIN_API_KEY` unset.
- [ ] Bootstrap script yields exactly one PLATFORM_OWNER (idempotent) who owns the 2 seeded tenants.
- [ ] Dashboard requires login, lists tenants from `/me/tenants`, switches tenants securely, and supports inviting/managing members.
- [ ] Invitation lifecycle works (create → email to Mailpit → accept in Serializable txn → membership row) with expiry/revoke/decline.
- [ ] `pnpm test`, `pnpm lint`, `pnpm build` pass; Final Verification Wave (incl. real-browser login E2E + RLS-via-PostgREST curl) passes; user approves.

### Must Have

- JWT = identity only; **DB is the authoritative authz source on every request**.
- **Env-aware JWT verification**: JWKS/ES256 for cloud, HS256 shared-secret for local; reject cross-issuer mismatch.
- **New key model**: publishable (browser) + secret (server/worker); legacy anon/service_role unused. Keep env var names, change values.
- **Both environments work**: LOCAL self-hosted + CLOUD (`gjqrysxpvktmibpkwrvy`) for auth + dashboard + API. Atomic-profile env (no mixing local URL with cloud key) enforced by a startup assertion.
- **Supabase-managed lifecycle**: invite via Admin API (`inviteUserByEmail`); deactivate via Admin ban **and** app `users.status` (the latter gives immediate lockout). `TenantInvitation` stores tenant+role; membership materialized in a Serializable txn on accept.
- Dual-accept migration window; admin-key removal only as a final, separately-verified step.
- Bootstrap PLATFORM_OWNER created and verified BEFORE admin-key removal (on both envs).
- Soft-delete on `User`, `TenantMembership`, `TenantInvitation`.
- Server re-checks tenant membership every request; never trust the client's `?tenant=` selection.
- Prevent removal/demotion of the last OWNER of a tenant and the last PLATFORM_OWNER.
- Edit the **active** compose file `docker/supabase-services.yml` (verified via `docker inspect`); confirm the mounted Kong file before key-model edits.
- **Every wave ends with a real dual-env E2E checkpoint** (Playwright + curl), evidence under `.sisyphus/evidence/{local,cloud}/`.
- Cloud Prisma: migrate via `DATABASE_URL_DIRECT` (session pooler, IPv4); runtime via txn pooler `6543 ?pgbouncer=true`; reload cloud Data API schema after migrate.

### Must NOT Have (Guardrails)

- **NO** custom access token hook (JWT stays identity-only).
- **NO** permissions DB table (static `ROLE_PERMISSIONS` map only).
- **NO** `authenticated`-role RLS policies on the 14 tenant tables, on **either** env (gateway is the boundary; RLS = minimal anon-deny backstop only).
- **NO** renaming env vars (`SUPABASE_ANON_KEY`/`SUPABASE_SECRET_KEY` keep their names; only values change to `sb_publishable_*`/`sb_secret_*`).
- **NO** worker PostgREST **code** changes (it is already env-driven — change values, not code); do NOT convert its `process.env` to `requireEnv`.
- **NO** worker-against-cloud verification this plan (worker/task lifecycle is verified LOCAL only; cloud worker path is deferred to production).
- **NO** historical data migration to cloud (cloud gets schema migrate + seed 2 tenants + bootstrap owner only).
- **NO** production deployment pipeline (cloud is a verification target, not a prod cutover).
- **NO** custom SMTP/Resend setup this plan (cloud invite email deferred; assert invite _created_ on cloud, not delivered).
- **NO** global Prisma tenant-scoping middleware refactor (keep manual `tenant_id` injection; add authz in front).
- **NO** changes to webhooks, `/internal/tasks/*`, or OAuth callbacks (verified independent of the admin key).
- **NO** migrating `scripts/archive/*`.
- **NO** SSO/SAML, MFA, password-policy config, email-template theming, audit-log UI, or per-resource ACLs.
- **NO** editing `docker/docker-compose.yml` for Supabase config (inert template); **NO** editing `docker/kong.yml` if `docker/volumes/api/kong.yml` is the mounted one.
- **NOTE — now IN scope**: fix `interaction-classifier.ts` to send the secret as `apikey` (not Bearer) so it survives the new key model on cloud (previously excluded).

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No "user manually tests/confirms".

### Test Decision

- **Infrastructure exists**: YES (Vitest — `pnpm test` / `pnpm test:unit` / `pnpm test:integration`).
- **Automated tests**: **TDD where it fits** (pure logic: `ROLE_PERMISSIONS`/`hasPermission`, JWT verification, `ensureUserExists`, invitation state machine, last-owner guards) + **tests-after** for wiring/routes.
- **Framework**: `vitest` (unit in `tests/unit/`, DB-backed in `tests/integration/`).
- **If TDD**: RED (failing test) → GREEN (minimal impl) → REFACTOR for the logic-heavy tasks noted above.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/{local,cloud}/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI** (dashboard): Playwright via CDP against **real Chrome** at `http://localhost:7700/dashboard/` (not headless).
- **API/Backend** (gateway): `curl` — assert HTTP status + JSON fields.
- **DB** (new tables / writes): `psql` AND PostgREST `curl` (local `:54331`; cloud `https://gjqrysxpvktmibpkwrvy.supabase.co/rest/v1`) — PostgREST ≠ psql per AGENTS.md.
- **Auth** (Supabase): `curl` Auth via Kong (local `http://localhost:54331/auth/v1/...`; cloud `https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/...`); decode JWT to assert `alg` (HS256 local / ES256 cloud) + claims.
- **Logic/Module**: `vitest` run + `bun`/`node` REPL where useful.

### Dual-Environment E2E Policy (MANDATORY)

- **Every wave ends with an E2E checkpoint task** (`TnE2E`) that runs the real user/API journeys enabled so far, against **BOTH** environments where applicable, saving evidence to `.sisyphus/evidence/local/...` and `.sisyphus/evidence/cloud/...`.
- **Playwright real-user journeys**: sign up → log in → tenant switch → invite (local: full accept via Mailpit; cloud: assert invite created) → change role → deactivate → confirm next-request lockout → log out. Concrete selectors + concrete data (`owner@test.com`, `invitee@example.com`, `Test1234!`).
- **curl API journeys**: authz matrix (own 200 / other 403 / none 401 / wrong-role 403), Supabase Admin invite + ban, JWKS/HS256 verify, `/me`, `/me/tenants`, member/invite endpoints, key-model wire check (`apikey: publishable` accepted, `Authorization: Bearer publishable` rejected).
- **Env profiles**: an "all-local" and an "all-cloud" env set, switched atomically (startup assertion guards against mixing). Cloud scope = auth + dashboard + API (NOT the worker/task lifecycle).

### Test Employee for lifecycle smoke checks (LOCAL only)

`real-estate-motivation-bot-2` (VLRE tenant `00000000-0000-0000-0000-000000000003`, `approval_required: false`) — confirms machine-trigger paths still fire after the `SERVICE_TOKEN` migration. Worker/task lifecycle is verified **local only**; not run against cloud this plan.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 — Spikes + matrix (start immediately):
├── T0a: Verify active Supabase config + local JWT trust (spike) [quick]
├── T0b: Author role × endpoint authz matrix for ~70 endpoints [unspecified-high]
├── T0c: Oracle consult — SERVICE_TOKEN + auth-resolution order [oracle]
└── T0d: Dual-env + new-key-model spike (Kong file, cloud JWKS/alg, cloud Prisma conn) [deep]
   └── T0E2E: Wave-0 checkpoint — local+cloud connectivity/key-matrix curls [quick]

Wave 1 — Data + Infra + Cloud provisioning (after T0):
├── T1: Prisma models + enums [deep]
├── T2: Migration + LOCAL PostgREST schema reload + verify [deep]
├── TC: CLOUD provision — migrate(direct pooler)+reload+seed+providers+redirects [deep]
├── T3: Enable LOCAL Supabase Auth (email/pw + Google) on active compose file [deep]
├── T3b: Dual-env config layer + atomic-profile startup assertion (new key model) [deep]
├── T4: SERVICE_TOKEN concept + env + config constant [quick]
├── T5: Shared TypeScript types [quick]
├── T6: Static ROLE_PERMISSIONS map + hasPermission (TDD) [quick]
├── T7: Minimal RLS backstop policies (local + cloud) [quick]
└── T1E2E: Wave-1 checkpoint — signup+login issue JWT on BOTH envs; tables visible [unspecified-high]

Wave 2 — Gateway Authz (after Wave 1):
├── T8: jose env-aware JWT verify util — JWKS(cloud)+HS256(local) (TDD) [deep]
├── T9: Auth middleware — dual-accept [deep]
├── T10: ensureUserExists upsert (TDD) [deep]
├── T11: Authz helpers requireAuth/requireTenantRole/requirePermission [deep]
├── T12: Deactivation (Supabase ban + app status) immediate enforcement [deep]
├── T13: /me + /me/tenants endpoints [unspecified-high]
├── T14: Member endpoints + last-owner guard (TDD) [deep]
├── T15: Supabase-managed invitation endpoints Serializable (TDD) [deep]
└── T2E2E: Wave-2 checkpoint — authz matrix + invite-create + deactivate-lockout curls, both envs [unspecified-high]

Wave 3 — Apply authz + gateway read endpoints (after Wave 2):
├── T16: Apply authz matrix to all admin route files [unspecified-high]
├── T17: Gateway read endpoints replacing dashboard PostgREST reads [unspecified-high]
├── T18: User repository + soft-delete [quick]
├── T19: Bootstrap seed-platform-owner script + SQL break-glass (TDD) [deep]
├── T19b: Fix interaction-classifier.ts for opaque keys (apikey not Bearer) [quick]
└── T3E2E: Wave-3 checkpoint — role-gated endpoints + gateway reads scoped, both envs [unspecified-high]

Wave 4 — Migrate callers OFF admin key, then REMOVE it (after Wave 3):
├── T20: Migrate machine scripts to SERVICE_TOKEN [unspecified-high]
├── T21: Migrate cron/scheduled-trigger path to SERVICE_TOKEN [deep]
├── T22: Migrate dashboard API client to JWT (opaque-key-safe) [visual-engineering]
├── T23: Verify EVERY endpoint works without admin key (dual-accept on) [unspecified-high]
├── T24: REMOVE admin key — middleware, requireEnv, refs, .env [deep]
└── T4E2E: Wave-4 checkpoint — full API journey w/o admin key, both envs [unspecified-high]

Wave 5 — Dashboard UX (after Wave 4):
├── T25: Supabase browser client + login/signup/forgot-password [visual-engineering]
├── T26: Google OAuth callback handling [visual-engineering]
├── T27: Auth context/session + protected routes + logout [visual-engineering]
├── T28: Membership-driven tenant switcher [visual-engineering]
├── T29: Member + invitation management UI [visual-engineering]
└── T5E2E: Wave-5 checkpoint — full Playwright user journey, both envs [unspecified-high]

Wave FINAL — 6 reviews → full dual-env E2E → user okay:
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Full real-user journey E2E on BOTH envs (Playwright + curl) (unspecified-high)
├── F4: Scope fidelity check (deep)
├── F5: Docs + AGENTS.md/README + cloud-deploy guide freshness (writing)
└── F6: tmux cleanup + Telegram completion notify (quick)
-> Present results -> Get explicit user okay

Critical Path: T0d → T1 → T2 → TC → T9 → T11 → T16 → T20 → T24 → T27 → F1-F4 → user okay
Max Concurrent: 9 (Wave 1)
```

### Dependency Matrix (abbreviated — full matrix lives in each task's Parallelization block)

- **T0a-c**: deps none → unblock Wave 1
- **T1**: T0 → blocks T2, T5, T10, T14, T15, T18, T19
- **T2**: T1 → blocks T7, T13, T17, T19
- **T9**: T4, T5, T8 → blocks T11, T12, T16, T23
- **T11**: T6, T9, T10 → blocks T13, T14, T15, T16
- **T16**: T0b, T11 → blocks T23
- **T19**: T1, T2, T10 → blocks T24
- **T23**: T16, T17, T20, T21, T22 → blocks T24
- **T24**: T23, T19 → blocks Wave 5 verification
- **T27**: T25, T26, T13, T22 → blocks T28, T29

### Agent Dispatch Summary

- **Wave 0**: 5 — T0a → `quick`, T0b → `unspecified-high`, T0c → `oracle`, T0d → `deep`, T0E2E → `quick`
- **Wave 1**: 10 — T1/T2/TC/T3/T3b → `deep`, T4/T5/T6/T7 → `quick`, T1E2E → `unspecified-high`
- **Wave 2**: 9 — T8/T9/T10/T11/T12/T14/T15 → `deep`, T13/T2E2E → `unspecified-high`
- **Wave 3**: 6 — T16/T17/T3E2E → `unspecified-high`, T18/T19b → `quick`, T19 → `deep`
- **Wave 4**: 6 — T20/T23/T4E2E → `unspecified-high`, T21/T24 → `deep`, T22 → `visual-engineering`
- **Wave 5**: 6 — T25/T26/T27/T28/T29 → `visual-engineering`, T5E2E → `unspecified-high`
- **FINAL**: 6 — F1 → `oracle`, F2/F3 → `unspecified-high`, F4 → `deep`, F5 → `writing`, F6 → `quick`

> Each `TnE2E` checkpoint uses the `e2e-testing` skill + Playwright (CDP, real Chrome) and runs against both env profiles.

---

## TODOs

> Implementation + Test = ONE task. Every task has: Agent Profile + Parallelization + References + Acceptance Criteria + QA Scenarios.

### Wave 0 — Spike & Authorization Matrix

- [x] 0a. Verify active Supabase config and JWT trust (spike)

  **What to do**:
  - Confirm which compose file is actually running for the `auth` service: `docker ps --filter name=auth` then `docker inspect <auth-container> | jq '.[0].Config.Env'`. Confirm config originates from `docker/supabase-services.yml`, NOT `docker/docker-compose.yml`.
  - Confirm `GOTRUE_JWT_SECRET` and `PGRST_JWT_SECRET` resolve to the same value (so PostgREST trusts GoTrue JWTs).
  - Issue a real signup via Kong and decode the JWT to confirm it contains `sub`, `role:"authenticated"`, `aud`, and NO custom membership claims (baseline for identity-only design).
  - Record the exact JWT algorithm (expect HS256 / shared secret on self-hosted) for the gateway verifier.
  - Write findings to `.sisyphus/notepads/auth-spike.md`.

  **Must NOT do**: Change any config (read-only spike). Do not enable the access token hook.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: bounded read-only investigation.
  - **Skills**: [`debugging-lifecycle`] — container/log inspection patterns.
  - **Skills Evaluated but Omitted**: `creating-archetypes` (no archetype work).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 0 (with 0b, 0c)
  - **Blocks**: T3, T8. **Blocked By**: None.

  **References**:
  - Pattern: `docker/supabase-services.yml` — the ACTIVE compose file (Metis-verified). Inspect the `auth` service env.
  - Pattern: `docker/docker-compose.yml:235-237` — commented-out hook config (INERT template; do not edit).
  - External: GoTrue — `http://localhost:54331/auth/v1/signup` (Kong-fronted Auth).
  - WHY: The plan assumes identity-only JWTs verified with the shared secret; this spike de-risks T3/T8.

  **Acceptance Criteria**:
  - [ ] `.sisyphus/notepads/auth-spike.md` records: active compose file, JWT alg, shared-secret confirmation, decoded baseline JWT claims.

  **QA Scenarios**:

  ```
  Scenario: Signup issues a decodable identity JWT
    Tool: Bash (curl + jq + base64)
    Preconditions: Stack running (pnpm dev); Mailpit reachable.
    Steps:
      1. curl -s -X POST "http://localhost:54331/auth/v1/signup" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"email":"spike@test.com","password":"Test1234!"}'
      2. Extract .access_token; base64-decode the payload segment.
      3. Assert payload has sub (uuid), role=="authenticated", aud=="authenticated".
    Expected Result: JSON with access_token; decoded payload shows identity claims, NO membership claims.
    Failure Indicators: 4xx from signup, missing access_token, or unexpected custom claims present.
    Evidence: .sisyphus/evidence/task-0a-jwt-decode.txt

  Scenario: Active auth container env comes from supabase-services.yml
    Tool: Bash (docker inspect + jq)
    Preconditions: auth container running.
    Steps:
      1. docker ps --filter name=auth --format '{{.Names}}'
      2. docker inspect <name> | jq '.[0].Config.Env' > evidence
      3. Assert GOTRUE_* vars present and GOTRUE_SITE_URL value captured.
    Expected Result: Env dump captured; confirms which file is live.
    Evidence: .sisyphus/evidence/task-0a-auth-env.json
  ```

  **Commit**: NO (groups with Wave 0 commit)

- [x] 0b. Author role × endpoint authorization matrix

  **What to do**:
  - Enumerate every admin/gateway endpoint currently protected by `requireAdminKey` (Metis: 18 route files, ~70 endpoints across `src/gateway/routes/`).
  - For each endpoint, assign the minimum authorization: which `TenantRole` (OWNER/ADMIN/MEMBER/VIEWER) and/or global `Role` (PLATFORM_OWNER) is required, or `SERVICE_TOKEN`-only (machine), or public.
  - Capture cross-cutting rules: PLATFORM_OWNER bypasses tenant-membership checks; tenant-scoped routes require membership in the path `:tenantId`; destructive tenant ops (delete tenant) require OWNER; member/invite management requires ADMIN+; employee trigger requires MEMBER+ (default — flag for confirmation).
  - Write the matrix to `.sisyphus/notepads/authz-matrix.md` as a table: `route file | method+path | required role | notes`.

  **Must NOT do**: Implement any middleware here (matrix only). Do not invent a permissions DB table.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: careful enumeration + judgment across ~70 endpoints.
  - **Skills**: [] — pure analysis/authoring.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 0 (with 0a, 0c)
  - **Blocks**: T16. **Blocked By**: None.

  **References**:
  - Pattern: `src/gateway/routes/` — all 18 route files applying `requireAdminKey`.
  - Pattern: `src/gateway/middleware/admin-auth.ts` — current single check.
  - Pattern: nexus-stack `packages/trpc/src/permissions.ts` — `ROLE_PERMISSIONS` shape to mirror.
  - WHY: This matrix is the spec T16 implements against; without it, applying authz is guesswork.

  **Acceptance Criteria**:
  - [ ] `.sisyphus/notepads/authz-matrix.md` covers every `requireAdminKey` endpoint with an explicit required role.
  - [ ] Cross-cutting rules (PLATFORM_OWNER bypass, membership requirement, last-owner protection note) documented.

  **QA Scenarios**:

  ```
  Scenario: Matrix coverage equals admin-protected endpoints
    Tool: Bash (grep + count comparison)
    Preconditions: Matrix file written.
    Steps:
      1. grep -rln "requireAdminKey" src/gateway/routes | wc -l  (route file count)
      2. Assert every route file appears in the matrix.
    Expected Result: Every requireAdminKey route file represented; no endpoint left unassigned.
    Failure Indicators: A route file with requireAdminKey missing from the matrix.
    Evidence: .sisyphus/evidence/task-0b-matrix-coverage.txt
  ```

  **Commit**: NO (groups with Wave 0 commit)

- [x] 0c. Oracle consult — SERVICE_TOKEN design & auth-resolution order

  **What to do**:
  - Consult `oracle` to validate: (a) `SERVICE_TOKEN` design (single shared machine token vs per-caller; storage; rotation; never exposed to the browser or `/api/config.js`); (b) the gateway auth-resolution order (SERVICE_TOKEN → Supabase JWT → dual-accept admin key during migration); (c) immediate-deactivation enforcement approach (DB `User.status`/`deleted_at` checked per request); (d) any security pitfalls in the identity-only-JWT + DB-authoritative design.
  - Record conclusions to `.sisyphus/notepads/auth-oracle.md`.

  **Must NOT do**: Implement anything. Do not reintroduce the hook or a permissions table.

  **Recommended Agent Profile**:
  - **Category**: (subagent) `oracle` — Reason: high-stakes security/architecture validation before build.
  - **Skills**: [] — consultation.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 0 (with 0a, 0b)
  - **Blocks**: T4, T9, T12. **Blocked By**: None.

  **References**:
  - Pattern: `.sisyphus/drafts/user-auth-rbac.md` — locked decisions to validate.
  - Pattern: `src/lib/config.ts` — where the new SERVICE_TOKEN constant will live.
  - WHY: SERVICE_TOKEN is a god-credential; getting its scope/rotation and the resolution order right prevents a security regression during admin-key removal.

  **Acceptance Criteria**:
  - [ ] `.sisyphus/notepads/auth-oracle.md` records Oracle's verdict on SERVICE_TOKEN design, resolution order, and deactivation enforcement.

  **QA Scenarios**:

  ```
  Scenario: Oracle guidance captured and actionable
    Tool: Bash (test -s)
    Preconditions: Oracle consult complete.
    Steps:
      1. test -s .sisyphus/notepads/auth-oracle.md && echo OK
      2. Assert file contains sections for SERVICE_TOKEN, resolution-order, deactivation.
    Expected Result: Non-empty notepad with the three decision areas resolved.
    Evidence: .sisyphus/evidence/task-0c-oracle-notes.txt
  ```

  **Commit**: YES (Wave 0) — `chore(auth): add authz matrix and supabase config spike notes`
  - Files: `.sisyphus/notepads/*.md`
  - Pre-commit: `pnpm lint` (no code changed)

### Wave 1 — Data & Infrastructure

- [x] 1. Prisma models + enums (User, TenantMembership, TenantInvitation)

  **What to do**:
  - Add to `prisma/schema.prisma`:
    - `enum Role { PLATFORM_OWNER ADMIN EDITOR USER VIEWER }`
    - `enum TenantRole { OWNER ADMIN MEMBER VIEWER }`
    - `model User { id @id uuid; supabaseId String? @unique @db.Uuid; email String @unique; name String?; role Role @default(USER); status String @default("active"); current_tenant_id String? @db.Uuid; created_at; updated_at; deleted_at DateTime?; memberships TenantMembership[]; invitationsSent TenantInvitation[] @relation("InvitationInviter"); @@index([deleted_at]); @@map("users") }`
    - `model TenantMembership { tenant_id @db.Uuid; user_id @db.Uuid; role TenantRole @default(MEMBER); joined_at DateTime @default(now()); deleted_at DateTime?; tenant Tenant @relation(...); user User @relation(...); @@id([tenant_id, user_id]); @@index([user_id]); @@map("tenant_memberships") }`
    - `model TenantInvitation { id @id uuid; tenant_id @db.Uuid; email String; role TenantRole @default(MEMBER); token String @unique; status String @default("pending"); expires_at DateTime; accepted_at DateTime?; declined_at DateTime?; revoked_at DateTime?; inviter_id String? @db.Uuid; created_at; tenant Tenant @relation(...); inviter User? @relation("InvitationInviter", onDelete: SetNull); @@index([token]); @@index([email]); @@index([tenant_id, email]); @@map("tenant_invitations") }`
  - Add back-relations to `model Tenant`: `users TenantMembership[]`, `invitations TenantInvitation[]`.
  - Soft-delete on User, TenantMembership, TenantInvitation (DO NOT copy `TenantSecretRepository`'s hard delete).

  **Must NOT do**: No permissions table. No `owner_id` column on Tenant (ownership via membership role OWNER). No hard deletes.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: schema correctness with relations/indexes is load-bearing.
  - **Skills**: [`prisma`] — schema/migration conventions + soft-delete rule.

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation) — **Parallel Group**: Sequential start of Wave 1
  - **Blocks**: T2, T5, T10, T14, T15, T18, T19. **Blocked By**: T0.

  **References**:
  - Pattern: `prisma/schema.prisma:293-367` — existing `Tenant`, `TenantSecret`, `TenantIntegration` (UUID PK, `@@map`, soft-delete `deleted_at`).
  - Pattern: nexus-stack `packages/database/prisma/schema/core.prisma` — `User.supabaseId @unique`, `OrganizationMember` composite PK, `OrganizationInvitation` columns (mirror, Organization→Tenant).
  - Anti-pattern: `src/repositories/tenant-secret-repository.ts:66` — hard delete; do NOT replicate.
  - WHY: This is the exact reference schema; mirroring it (with this repo's snake_case + UUID conventions) gives a proven model.

  **Acceptance Criteria**:
  - [ ] `pnpm prisma validate` → success.
  - [ ] `pnpm prisma format` is idempotent.

  **QA Scenarios**:

  ```
  Scenario: Schema validates with new models and enums
    Tool: Bash (prisma)
    Preconditions: schema edited.
    Steps:
      1. pnpm prisma validate
      2. grep -E "model (User|TenantMembership|TenantInvitation)|enum (Role|TenantRole)" prisma/schema.prisma
    Expected Result: validate passes; all 3 models + 2 enums present.
    Failure Indicators: validation error; missing relation back-references on Tenant.
    Evidence: .sisyphus/evidence/task-1-prisma-validate.txt

  Scenario: Soft-delete columns present, no hard-delete introduced
    Tool: Bash (grep)
    Steps: 1. grep -c "deleted_at" prisma/schema.prisma (>= existing + 3)
    Expected Result: deleted_at present on all three new models.
    Evidence: .sisyphus/evidence/task-1-softdelete.txt
  ```

  **Commit**: NO (groups with Wave 1)

- [x] 2. Migration + PostgREST schema reload + verify

  **What to do**:
  - Generate and apply: `pnpm prisma migrate dev --name add_user_auth_rbac` (creates `users`, `tenant_memberships`, `tenant_invitations`).
  - Reload PostgREST schema cache: `psql ... -c "NOTIFY pgrst, 'reload schema';"`.
  - Verify the new tables via PostgREST curl (PostgREST ≠ psql per AGENTS.md).

  **Must NOT do**: Seed data (bootstrap is T19). Add RLS (T7).

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: migration + PostgREST cache reload has a known footgun (PGRST205).
  - **Skills**: [`prisma`, `debugging-lifecycle`] — migration + DB/PostgREST verification.

  **Parallelization**:
  - **Can Run In Parallel**: NO — Sequential after T1.
  - **Blocks**: T7, T13, T17, T18, T19. **Blocked By**: T1.

  **References**:
  - Pattern: `prisma/migrations/` — existing migration style.
  - Pattern: AGENTS.md "PostgREST ≠ psql" + "NOTIFY pgrst, 'reload schema'".
  - WHY: Worker/lifecycle code reads via PostgREST; without reload the new tables 404 (PGRST205).

  **Acceptance Criteria**:
  - [ ] Migration applied; three tables exist in `ai_employee`.
  - [ ] PostgREST returns `[]` (not a schema-cache error) for each new table.

  **QA Scenarios**:

  ```
  Scenario: New tables visible via PostgREST after reload
    Tool: Bash (psql + curl)
    Steps:
      1. psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"
      2. source .env; for t in users tenant_memberships tenant_invitations; do curl -s "http://localhost:54331/rest/v1/$t?limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"; done
    Expected Result: each returns [] (or rows), NOT PGRST205.
    Failure Indicators: PGRST205 "Could not find the table in the schema cache".
    Evidence: .sisyphus/evidence/task-2-postgrest-tables.txt

  Scenario: Tables exist in psql
    Tool: Bash (psql)
    Steps: 1. psql ... -c "\dt public.users public.tenant_memberships public.tenant_invitations"
    Expected Result: all three listed.
    Evidence: .sisyphus/evidence/task-2-psql-tables.txt
  ```

  **Commit**: NO (groups with Wave 1)

- [x] 3. Enable Supabase Auth (email/password + Google) on the ACTIVE compose file

  **What to do**:
  - Edit `docker/supabase-services.yml` (ACTIVE file — verified in T0a) `auth` service env:
    - Correct `GOTRUE_SITE_URL` to `http://localhost:7700/dashboard/`.
    - Add `GOTRUE_URI_ALLOW_LIST` including the dashboard callback.
    - Enable Google: `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true`, `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`, `GOTRUE_EXTERNAL_GOOGLE_SECRET`, `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=http://localhost:54331/auth/v1/callback`.
    - Keep email/password enabled; leave Mailpit SMTP for dev.
  - Add corresponding vars to `docker/.env` and `docker/.env.example` (placeholders for Google creds).
  - Restart auth; verify env via `docker inspect`.

  **Must NOT do**: Edit `docker/docker-compose.yml` (inert template). Enable the custom access token hook.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: self-hosted OAuth config has multiple must-agree values (Metis R8).
  - **Skills**: [`debugging-lifecycle`] — container env verification.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1.
  - **Blocks**: T25, T26. **Blocked By**: T0a.

  **References**:
  - Pattern: `docker/supabase-services.yml` (auth service) — ACTIVE file (T0a-verified).
  - Pattern: `docker/.env.example` — env documentation conventions.
  - External: self-hosted Google redirect = `http://localhost:54331/auth/v1/callback` (Kong); `GOTRUE_SITE_URL` → dashboard.
  - WHY: Metis verified `GOTRUE_SITE_URL=localhost:3000` (wrong) and Google vars absent — OAuth breaks until all three places agree.

  **Acceptance Criteria**:
  - [ ] `docker inspect` shows corrected `GOTRUE_SITE_URL` and Google vars.
  - [ ] Email/password signup still returns a JWT (regression).

  **QA Scenarios**:

  ```
  Scenario: Auth container reflects corrected config
    Tool: Bash (docker inspect + jq)
    Steps: 1. docker inspect <auth> | jq -r '.[0].Config.Env[]' | grep -E "GOTRUE_SITE_URL|GOOGLE"
    Expected Result: GOTRUE_SITE_URL == http://localhost:7700/dashboard/ ; GOOGLE_ENABLED true.
    Failure Indicators: stale localhost:3000; missing Google vars.
    Evidence: .sisyphus/evidence/task-3-auth-env.txt

  Scenario: Google authorize endpoint redirects (config wired)
    Tool: Bash (curl -I)
    Steps: 1. curl -sI "http://localhost:54331/auth/v1/authorize?provider=google" | head -n1
    Expected Result: 302/303 redirect — proves provider enabled (full login in Wave 5).
    Failure Indicators: 400 "provider not enabled".
    Evidence: .sisyphus/evidence/task-3-google-authorize.txt
  ```

  **Commit**: NO (groups with Wave 1)

- [x] 4. SERVICE_TOKEN concept + env + config constant

  **What to do**:
  - Add `SERVICE_TOKEN` to `.env`/`.env.example` (Platform Core section; machine-only; never in browser/`/api/config.js`). Generate a strong value.
  - Add a named constant accessor in `src/lib/config.ts` read via the existing config pattern; document as machine-to-machine auth.
  - Document rotation guidance (per Oracle T0c) in a code comment + the auth guide.

  **Must NOT do**: Wire it into middleware (T9) or callers (Wave 4) yet. Expose it via any browser-served endpoint.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: small config addition.
  - **Skills**: [`security`] — secret handling + requireEnv rules.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1.
  - **Blocks**: T9, T20, T21. **Blocked By**: T0c.

  **References**:
  - Pattern: `src/lib/config.ts` — env-as-named-constants convention.
  - Pattern: `.env.example` section ordering (AGENTS.md "Environment File Conventions").
  - WHY: Centralizing the token lets T9 and all caller migrations import one source.

  **Acceptance Criteria**:
  - [ ] `SERVICE_TOKEN` in both `.env` and `.env.example` with a description.
  - [ ] `src/lib/config.ts` exports the constant; `pnpm build` passes.

  **QA Scenarios**:

  ```
  Scenario: SERVICE_TOKEN config wired and not browser-exposed
    Tool: Bash (grep + build)
    Steps:
      1. grep -n "SERVICE_TOKEN" .env.example src/lib/config.ts
      2. grep -rn "SERVICE_TOKEN" src/gateway/routes/*config* dashboard/ || echo "not browser-exposed OK"
      3. pnpm build
    Expected Result: present in config+env; absent from browser-served paths; build passes.
    Failure Indicators: token referenced in /api/config.js or dashboard bundle.
    Evidence: .sisyphus/evidence/task-4-service-token.txt
  ```

  **Commit**: NO (groups with Wave 1)

- [x] 5. Shared TypeScript types (roles, permissions, claims, DTOs)

  **What to do**:
  - Add `src/lib/auth/types.ts`: `Role`, `TenantRole` (mirror Prisma enums), `Permission` union, `AuthenticatedUser` (id, supabaseId, email, globalRole, status), `TenantContext` (tenantId, tenantRole), `SupabaseJwtClaims` (sub, email, role, aud, exp — identity only), and Express request-augmentation types (`req.auth`).
  - Export from a barrel for gateway + dashboard reuse.

  **Must NOT do**: Include membership claims in `SupabaseJwtClaims` (identity-only).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: type definitions.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1.
  - **Blocks**: T8, T9, T11. **Blocked By**: T1 (enum names).

  **References**:
  - Pattern: `src/lib/` shared types conventions.
  - Pattern: nexus-stack `packages/trpc/src/context.ts` — `{ user, organizationId, orgRole }` → mirror as `{ user, tenantId, tenantRole }`.
  - WHY: Shared type surface keeps middleware/helpers/routes consistent, prevents `as any`.

  **Acceptance Criteria**:
  - [ ] Types compile (`pnpm build`); `SupabaseJwtClaims` has no membership fields.

  **QA Scenarios**:

  ```
  Scenario: Auth types compile and are identity-only
    Tool: Bash (build + grep)
    Steps: 1. pnpm build  2. grep -A12 "SupabaseJwtClaims" src/lib/auth/types.ts
    Expected Result: build passes; claims type has sub/email/role/aud/exp only, no tenant/membership.
    Evidence: .sisyphus/evidence/task-5-types.txt
  ```

  **Commit**: NO (groups with Wave 1)

- [x] 6. Static ROLE_PERMISSIONS map + hasPermission (TDD)

  **What to do**:
  - RED: `tests/unit/auth/permissions.test.ts` asserting the matrix (PLATFORM_OWNER has all; tenant OWNER manages members/invite; ADMIN invites; MEMBER triggers employees [per matrix]; VIEWER read-only) and `hasPermission` truth table.
  - GREEN: `src/lib/auth/permissions.ts` with `PERMISSIONS`, `ROLE_PERMISSIONS` (global Role → Set<Permission>), `TENANT_ROLE_PERMISSIONS` (TenantRole → Set<Permission>), `hasPermission`/`hasTenantPermission`.
  - REFACTOR.

  **Must NOT do**: DB permissions table. Dynamic/endpoint-permission table.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: pure logic; TDD-ideal.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1.
  - **Blocks**: T11. **Blocked By**: T5 (types).

  **References**:
  - Pattern: nexus-stack `packages/trpc/src/permissions.ts` — `ROLE_PERMISSIONS` Set map + `hasPermission`.
  - Pattern: `.sisyphus/notepads/authz-matrix.md` (T0b) — which roles get which permissions.
  - WHY: Static map is the locked permission model.

  **Acceptance Criteria**:
  - [ ] `pnpm test tests/unit/auth/permissions.test.ts` → PASS.

  **QA Scenarios**:

  ```
  Scenario: Permission matrix behaves per spec
    Tool: Bash (vitest)
    Steps: 1. pnpm test -- --run tests/unit/auth/permissions.test.ts
    Expected Result: all assertions pass (PLATFORM_OWNER=all, VIEWER read-only, etc.).
    Failure Indicators: any failing permission assertion.
    Evidence: .sisyphus/evidence/task-6-permissions-test.txt

  Scenario: No permissions table introduced
    Tool: Bash (grep)
    Steps: 1. grep -ri "role_permissions\|model Permission" prisma/schema.prisma || echo "none OK"
    Expected Result: no DB permission model.
    Evidence: .sisyphus/evidence/task-6-no-perm-table.txt
  ```

  **Commit**: NO (groups with Wave 1)

- [x] 7. Minimal RLS backstop policies

  **What to do**:
  - Add a SQL migration (or `supabase/`-style policy file per repo conventions) keeping `users`, `tenant_memberships`, `tenant_invitations`, `tenant_secrets` LOCKED from the `anon` role (no SELECT). Defense-in-depth only — app reads go through the gateway (path B), so do NOT author `authenticated` per-table policies for the 14 tenant tables.
  - Reload PostgREST; verify anon is denied on `users`.

  **Must NOT do**: Author `authenticated` RLS on the 14 tenant tables. Enable RLS that breaks the gateway's service-role/Prisma path (it bypasses RLS anyway).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: a couple of policy statements + verification.
  - **Skills**: [`security`] — RLS/tenant isolation.

  **Parallelization**:
  - **Can Run In Parallel**: NO (after migration) — Sequential after T2.
  - **Blocks**: None (backstop). **Blocked By**: T2.

  **References**:
  - Pattern: existing anon SELECT-only RLS on 27 tables + `tenant_secrets` already locked from anon — extend posture to the 3 new sensitive tables.
  - Pattern: AGENTS.md PostgREST verification (curl, not psql).
  - WHY: New identity tables must never be anon-readable.

  **Acceptance Criteria**:
  - [ ] anon curl to the 4 sensitive tables → denied/empty.

  **QA Scenarios**:

  ```
  Scenario: Sensitive tables locked from anon
    Tool: Bash (curl)
    Steps:
      1. source .env; for t in users tenant_memberships tenant_invitations tenant_secrets; do curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:54331/rest/v1/$t?limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"; done
    Expected Result: 401/empty for all (no readable rows via anon).
    Failure Indicators: anon returns identity rows.
    Evidence: .sisyphus/evidence/task-7-rls-anon.txt
  ```

  **Commit**: YES (Wave 1) — `feat(auth): add user/membership/invitation models, enums, supabase auth config`
  - Files: `prisma/schema.prisma`, `prisma/migrations/**`, `docker/supabase-services.yml`, `docker/.env.example`, `.env.example`, `src/lib/config.ts`, `src/lib/auth/**`, `tests/unit/auth/**`
  - Pre-commit: `pnpm prisma validate && pnpm test -- --run tests/unit/auth && pnpm build`

### Wave 2 — Gateway Authorization

- [x] 8. JWT verification utility with `jose` (TDD)

  **What to do**:
  - RED: `tests/unit/auth/verify-jwt.test.ts` — valid → claims; expired → throws; wrong-signature → throws; missing `sub` → throws.
  - GREEN: `src/lib/auth/verify-jwt.ts` — verify a Supabase HS256 JWT using `JWT_SECRET` (per T0a) via `jose.jwtVerify`; return typed `SupabaseJwtClaims`. Structure so a JWKS/asymmetric path can be added later without changing callers.
  - Add `jose` dependency if absent.

  **Must NOT do**: Fetch membership here (identity only). Call the DB.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: security-critical crypto verification.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2.
  - **Blocks**: T9. **Blocked By**: T5.

  **References**:
  - Pattern: librarian finding — `jose` `jwtVerify(token, secret)` for HS256 self-hosted; JWKS path for later.
  - Pattern: `src/lib/` util/test conventions.
  - WHY: `JWT_SECRET` is already shared with PostgREST; verifying with it is the minimal correct approach.

  **Acceptance Criteria**:
  - [ ] `pnpm test tests/unit/auth/verify-jwt.test.ts` → PASS (valid/expired/tampered/missing-sub).

  **QA Scenarios**:

  ```
  Scenario: Verifier accepts real GoTrue token, rejects tampered
    Tool: Bash (curl + node harness)
    Steps:
      1. Get a real access_token via /auth/v1/token?grant_type=password.
      2. Feed to a node harness importing verify-jwt → prints claims.sub.
      3. Flip one char in the signature → expect throw.
    Expected Result: real token verifies; tampered throws.
    Evidence: .sisyphus/evidence/task-8-verify-jwt.txt

  Scenario: Unit suite green
    Tool: Bash (vitest)
    Steps: 1. pnpm test -- --run tests/unit/auth/verify-jwt.test.ts
    Expected Result: all pass.
    Evidence: .sisyphus/evidence/task-8-unit.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 9. Auth middleware — dual-accept (JWT | SERVICE_TOKEN | admin key)

  **What to do**:
  - Create `src/gateway/middleware/auth.ts` with the resolution order (from T0c):
    1. `Authorization: Bearer <SERVICE_TOKEN>` (timing-safe) → `req.auth = { kind:'service' }`.
    2. `Authorization: Bearer <supabase jwt>` → verify (T8) → `ensureUserExists` (T10) → load global role + status from DB → `req.auth = { kind:'user', user }`. If `status != active` or `deleted_at` → 401/403.
    3. **Dual-accept (migration only)**: `X-Admin-Key` matching `ADMIN_API_KEY` → `req.auth = { kind:'admin-legacy' }`. Clearly marked temporary.
    4. Else 401.
  - Keep `src/gateway/middleware/admin-auth.ts` importable until T24; new routes use `requireAuth`.

  **Must NOT do**: Enforce tenant/role here (T11). Remove the admin-key path (dual-accept).

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: central security chokepoint.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: NO — Sequential after T8/T10.
  - **Blocks**: T11, T12, T16, T23. **Blocked By**: T4, T5, T8, T10, T0c.

  **References**:
  - Pattern: `src/gateway/middleware/admin-auth.ts` — timing-safe compare + Express middleware shape.
  - Pattern: nexus-stack `apps/api/src/trpc/trpc.context.ts` — extract Bearer → verify → ensureUserExists → context.
  - Pattern: `.sisyphus/notepads/auth-oracle.md` (T0c).
  - WHY: Dual-accept is the Metis-mandated safe migration; this is where all three credentials converge.

  **Acceptance Criteria**:
  - [ ] Valid JWT → `req.auth.user`; deactivated → 403; valid SERVICE_TOKEN → service; valid admin key → legacy; none → 401.

  **QA Scenarios**:

  ```
  Scenario: Three credential types resolve correctly
    Tool: Bash (curl)
    Steps:
      1. curl with Bearer <jwt> → 200, identity resolved.
      2. curl with Bearer <SERVICE_TOKEN> → 200 (service).
      3. curl with X-Admin-Key <key> → 200 (legacy).
      4. curl with no auth → 401.
    Expected Result: 200/200/200/401.
    Evidence: .sisyphus/evidence/task-9-dual-accept.txt

  Scenario: Deactivated user rejected immediately
    Tool: Bash (psql + curl)
    Steps:
      1. psql: UPDATE users SET status='disabled' WHERE email='owner@test.com';
      2. curl a protected route with that user's still-valid JWT.
    Expected Result: 403 on the next request (no token-lifetime delay).
    Evidence: .sisyphus/evidence/task-9-deactivation.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 10. ensureUserExists upsert (TDD, race-safe)

  **What to do**:
  - RED: `tests/integration/auth/ensure-user-exists.test.ts` — first call creates a `users` row keyed on `supabaseId`; second is idempotent; concurrent calls don't duplicate.
  - GREEN: `src/gateway/services/ensure-user-exists.ts` — Prisma `upsert` on `supabaseId`, syncing email/name; returns `AuthenticatedUser`. Uses upsert (not check-then-insert).

  **Must NOT do**: Auto-create tenants/memberships. Hard-delete.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: idempotency/race-safety correctness.
  - **Skills**: [`data-access-conventions`] — repository/PostgREST-vs-Prisma boundaries.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2.
  - **Blocks**: T9, T11. **Blocked By**: T1.

  **References**:
  - Pattern: nexus-stack `apps/api/src/users/users.service.ts` `ensureUserExists()` — upsert on `supabaseId`.
  - Pattern: `src/repositories/*` Prisma usage.
  - WHY: This is the auth.users↔users sync (no DB trigger) — the proven nexus pattern.

  **Acceptance Criteria**:
  - [ ] `pnpm test:integration ensure-user-exists` → PASS (create + idempotent + no duplicates).

  **QA Scenarios**:

  ```
  Scenario: Upsert is idempotent and race-safe
    Tool: Bash (vitest integration)
    Preconditions: pnpm test:db:setup done.
    Steps: 1. pnpm test:integration -- ensure-user-exists
    Expected Result: row created once; repeated/concurrent calls keep a single row.
    Evidence: .sisyphus/evidence/task-10-ensure-user.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 11. Authz helpers: requireAuth / requireTenantRole / requirePermission

  **What to do**:
  - `src/gateway/middleware/authz.ts`:
    - `requireAuth` — asserts `req.auth` present (else 401).
    - `requireTenantRole(...roles)` — resolves `:tenantId` from params, looks up the user's `TenantMembership` from the DB (PLATFORM_OWNER & service auth bypass), asserts membership role ∈ roles (else 403). Re-checked every request; never trusts client tenant selection.
    - `requirePermission(permission)` — uses `hasPermission` (T6) against the user's global/tenant role (else 403).
  - Attach resolved `{ tenantId, tenantRole }` to `req.auth`.

  **Must NOT do**: Read membership from JWT claims (DB-authoritative). Let `?tenant=` influence authorization.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: core authorization logic.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: NO — Sequential after T9/T10.
  - **Blocks**: T13, T14, T15, T16. **Blocked By**: T6, T9, T10.

  **References**:
  - Pattern: nexus-stack `packages/trpc/src/trpc.ts` — `requireOrgRole`, `requirePermission`, PLATFORM_OWNER bypass.
  - Pattern: `.sisyphus/notepads/authz-matrix.md` (T0b).
  - WHY: DB-per-request membership resolution delivers immediate role-change/deactivation effect.

  **Acceptance Criteria**:
  - [ ] own-tenant role passes; non-member 403; PLATFORM_OWNER bypass passes; stale `?tenant=` cannot escalate.

  **QA Scenarios**:

  ```
  Scenario: Tenant role enforced from DB, not client input
    Tool: Bash (curl)
    Preconditions: user is MEMBER of tenant A, not a member of B.
    Steps:
      1. curl OWNER-only route on A with MEMBER jwt → 403.
      2. curl any tenant-scoped route on B with that jwt → 403.
      3. Repeat (2) adding ?tenant=A to a /tenants/B/ path → still 403.
    Expected Result: 403/403/403 — client cannot escalate via params.
    Evidence: .sisyphus/evidence/task-11-authz.txt

  Scenario: PLATFORM_OWNER cross-tenant access
    Tool: Bash (curl)
    Steps: 1. curl tenant A and B routes with PLATFORM_OWNER jwt.
    Expected Result: both 200.
    Evidence: .sisyphus/evidence/task-11-platform-owner.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 12. Immediate deactivation + role-change enforcement

  **What to do**:
  - Ensure the per-request DB lookup (T9/T11) reads current `User.status`/`deleted_at` and current `TenantMembership.role` (no caching outliving a request, or short TTL with explicit invalidation on member/role mutations).
  - Deactivated user → 403 with a clear message; demoted user immediately loses elevated routes.
  - Integration test proving immediacy.

  **Must NOT do**: Rely on JWT claims for status/role. Add a token deny-list (unnecessary).

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: subtle correctness around caching/immediacy.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: NO — after T11.
  - **Blocks**: F3 (deactivation E2E). **Blocked By**: T9, T11, T0c.

  **References**:
  - Pattern: `.sisyphus/notepads/auth-oracle.md` (T0c) — deactivation strategy.
  - WHY: This is the user's explicit requirement (immediate effect on role/deactivation change).

  **Acceptance Criteria**:
  - [ ] Integration test: change role/status in DB → next request reflects it (no restart/re-login).

  **QA Scenarios**:

  ```
  Scenario: Role demotion takes effect on next request
    Tool: Bash (curl + psql)
    Steps:
      1. As OWNER of A, curl an OWNER-only route → 200.
      2. psql: UPDATE tenant_memberships SET role='MEMBER' WHERE user_id=.. AND tenant_id=..;
      3. Re-curl same route with the SAME jwt → 403.
    Expected Result: 200 then 403, no re-login.
    Evidence: .sisyphus/evidence/task-12-immediate-demote.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 13. /me and /me/tenants endpoints

  **What to do**:
  - `GET /me` → `{ id, email, name, globalRole, status, currentTenantId }`.
  - `GET /me/tenants` → `{ tenantId, name, slug, tenantRole }[]` from the user's memberships (PLATFORM_OWNER → all). Replaces the dashboard's hardcoded `TENANTS` map.
  - Use `sendSuccess`/`sendError`.

  **Must NOT do**: Return tenants the user isn't a member of (unless PLATFORM_OWNER).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: simple routes but security-relevant filtering.
  - **Skills**: [`api-design`] — sendError/sendSuccess + route conventions.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2.
  - **Blocks**: T28. **Blocked By**: T2, T11.

  **References**:
  - Pattern: `src/gateway/routes/` + `sendSuccess`/`sendError` (`src/gateway/lib/http-response.ts`).
  - Pattern: nexus-stack `/me/tenants`-equivalent membership listing.
  - WHY: The membership-driven list is the contract the dashboard switcher consumes.

  **Acceptance Criteria**:
  - [ ] `/me` returns the caller; `/me/tenants` returns only the caller's memberships (all for PLATFORM_OWNER).

  **QA Scenarios**:

  ```
  Scenario: /me/tenants is membership-scoped
    Tool: Bash (curl)
    Steps:
      1. curl /me/tenants with member-of-A jwt → contains A, excludes B.
      2. curl /me/tenants with PLATFORM_OWNER jwt → contains A and B.
    Expected Result: correct scoping per role.
    Evidence: .sisyphus/evidence/task-13-me-tenants.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 14. Member endpoints (list / role-change / remove) + last-owner guard (TDD)

  **What to do**:
  - RED: tests for last-OWNER protection (cannot remove/demote the final OWNER) and ADMIN+-only management.
  - GREEN: `GET /admin/tenants/:tenantId/members`, `PATCH .../members/:userId` (role change), `DELETE .../members/:userId` (soft remove). Guard with `requireTenantRole('OWNER','ADMIN')` (+ PLATFORM_OWNER). Enforce last-OWNER guard. Soft-delete membership rows.

  **Must NOT do**: Hard delete. Allow demoting/removing the last OWNER. Let non-admins manage members.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: invariant (last-owner) + authz.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2.
  - **Blocks**: T29. **Blocked By**: T1, T11.

  **References**:
  - Pattern: nexus-stack `organization.service.ts` `removeMember`/`updateMemberRole`/`assertAdminOrOwner`.
  - WHY: Mirrors proven member-management with the critical last-owner lockout guard (Metis EC7).

  **Acceptance Criteria**:
  - [ ] Tests pass; last-OWNER removal/demotion rejected; non-admin 403.

  **QA Scenarios**:

  ```
  Scenario: Cannot remove the last OWNER
    Tool: Bash (curl)
    Steps: 1. DELETE /admin/tenants/A/members/<ownerUserId> with OWNER jwt → 409/422.
    Expected Result: rejected with a clear error; OWNER still present.
    Evidence: .sisyphus/evidence/task-14-last-owner.txt

  Scenario: Non-admin cannot manage members
    Tool: Bash (curl)
    Steps: 1. PATCH members with MEMBER jwt → 403.
    Expected Result: 403.
    Evidence: .sisyphus/evidence/task-14-nonadmin.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 15. Invitation endpoints (create / accept / decline / revoke) — Serializable (TDD)

  **What to do**:
  - RED: tests for the state machine — pending→accepted (membership created), pending→declined, pending→revoked, expired (7-day) accept rejected, double-accept rejected, inviting an existing member rejected.
  - GREEN: `POST /admin/tenants/:tenantId/invitations` (ADMIN+; 32-byte hex token; 7-day `expires_at`; email via Mailpit), `POST /invitations/accept` (Serializable txn; creates membership with invited role), `POST .../decline`, `POST .../revoke`. Soft state via status columns.

  **Must NOT do**: Hard delete invitations. Accept after expiry/revoke. Duplicate membership for existing member.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: transactional state machine with race protection.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2.
  - **Blocks**: T29. **Blocked By**: T1, T11.

  **References**:
  - Pattern: nexus-stack `organization.service.ts` invite/accept (Serializable txn; `randomBytes(32).toString('hex')`; 7-day expiry; states accepted/declined/revoked).
  - Pattern: Mailpit dev SMTP (`shared-mailpit`, UI `:54325`).
  - WHY: Mirrors the proven invitation flow with exact race/expiry guards (Metis EC5/EC6).

  **Acceptance Criteria**:
  - [ ] Tests pass; accept creates a membership; expired/revoked/double-accept rejected; existing-member invite rejected.

  **QA Scenarios**:

  ```
  Scenario: Invite → accept creates membership
    Tool: Bash (curl + psql + Mailpit API)
    Steps:
      1. POST invitation (ADMIN jwt) → 201; row in tenant_invitations (pending).
      2. Fetch email from Mailpit (http://localhost:54325) → extract token.
      3. POST /invitations/accept with token as a new user → 200; tenant_memberships row created.
    Expected Result: membership exists; invitation status=accepted.
    Evidence: .sisyphus/evidence/task-15-invite-accept.txt

  Scenario: Expired/revoked invite cannot be accepted
    Tool: Bash (curl + psql)
    Steps:
      1. psql: UPDATE tenant_invitations SET expires_at=now()-interval '1 day' WHERE token=..;
      2. POST accept → 410/422.
    Expected Result: rejected; no membership created.
    Evidence: .sisyphus/evidence/task-15-invite-expired.txt
  ```

  **Commit**: YES (Wave 2) — `feat(auth): add gateway jwt verification, authz helpers, member/invite endpoints`
  - Files: `src/lib/auth/**`, `src/gateway/middleware/auth.ts`, `src/gateway/middleware/authz.ts`, `src/gateway/services/ensure-user-exists.ts`, `src/gateway/routes/**` (me, members, invitations), `tests/**`
  - Pre-commit: `pnpm test -- --run && pnpm build`

### Wave 3 — Apply Authorization & Gateway Read Endpoints

- [x] 16. Apply authz matrix to all admin route files

  **What to do**:
  - For each of the 18 admin route files, replace `requireAdminKey` with `requireAuth` + the appropriate `requireTenantRole(...)` / `requirePermission(...)` per `.sisyphus/notepads/authz-matrix.md` (T0b). Keep dual-accept active (the new `requireAuth` still honors admin key via T9 until T24).
  - Machine-only endpoints (per matrix) gated to `service`/PLATFORM_OWNER.

  **Must NOT do**: Touch webhooks, `/internal/tasks/*`, OAuth callbacks, or worker PostgREST. Change route behavior beyond auth.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: broad, mechanical-but-careful application across ~70 endpoints.
  - **Skills**: [`api-design`] — route/middleware conventions + admin endpoint catalog.

  **Parallelization**:
  - **Can Run In Parallel**: NO (broad) — Sequential in Wave 3.
  - **Blocks**: T23. **Blocked By**: T0b, T11.

  **References**:
  - Pattern: `.sisyphus/notepads/authz-matrix.md` (T0b) — per-endpoint roles.
  - Pattern: `src/gateway/routes/` (18 files using `requireAdminKey`).
  - WHY: Converts the platform from single-key to role-based per the agreed matrix.

  **Acceptance Criteria**:
  - [ ] Every admin route file uses the new authz guards; `pnpm build` + `pnpm test` pass.
  - [ ] Webhooks/internal/OAuth/worker-PostgREST untouched (diff confirms).

  **QA Scenarios**:

  ```
  Scenario: Role-gated endpoint enforces the matrix
    Tool: Bash (curl)
    Steps:
      1. DELETE tenant route → MEMBER jwt 403, OWNER jwt 200.
      2. A read route → VIEWER jwt 200.
    Expected Result: matches authz-matrix.md.
    Evidence: .sisyphus/evidence/task-16-matrix-enforced.txt

  Scenario: Protected surfaces untouched
    Tool: Bash (git diff)
    Steps: 1. git diff --name-only | grep -E "webhooks|internal|oauth|postgrest-client" || echo "untouched OK"
    Expected Result: no protected files changed.
    Evidence: .sisyphus/evidence/task-16-untouched.txt
  ```

  **Commit**: NO (groups with Wave 3)

- [x] 17. Gateway read endpoints replacing dashboard PostgREST reads

  **What to do**:
  - Inventory the dashboard's direct PostgREST reads (Metis: `dashboard/src/lib/postgrest.ts` callers, ~8 read sites). For each, add a tenant-scoped gateway read endpoint returning the same shape (tasks list, task detail, KB entries, rules, etc.), guarded by `requireAuth` + tenant membership.
  - Keep response shapes compatible to minimize dashboard churn (T22 swaps the client).

  **Must NOT do**: Author `authenticated` RLS to keep PostgREST reads (we are moving reads to the gateway — path B). Expand scope to write endpoints already covered.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: several endpoints mirroring existing reads.
  - **Skills**: [`api-design`, `data-access-conventions`] — route shapes + repository/PostgREST boundaries.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 3.
  - **Blocks**: T22. **Blocked By**: T2, T11.

  **References**:
  - Pattern: `dashboard/src/lib/postgrest.ts` + its callers — exact read shapes to replicate.
  - Pattern: `src/repositories/*` + `sendSuccess` for gateway reads.
  - WHY: Path B requires the gateway to serve what the dashboard previously read from PostgREST, so RLS stays a minimal backstop and the gateway is the single boundary.

  **Acceptance Criteria**:
  - [ ] Each replaced read has a gateway endpoint returning a membership-scoped, shape-compatible response.

  **QA Scenarios**:

  ```
  Scenario: Gateway read returns only the caller's tenant data
    Tool: Bash (curl)
    Steps:
      1. curl gateway tasks-read for tenant A with member-of-A jwt → rows for A only.
      2. Same endpoint for tenant B with that jwt → 403.
    Expected Result: scoped data; cross-tenant denied.
    Evidence: .sisyphus/evidence/task-17-gateway-reads.txt
  ```

  **Commit**: NO (groups with Wave 3)

- [x] 18. User repository + soft-delete

  **What to do**:
  - `src/repositories/user-repository.ts` — find by id/email/supabaseId, list (tenant-scoped via membership), update, `softDelete` (`deleted_at`), restore. Filter `deleted_at IS NULL` by default.

  **Must NOT do**: Hard delete (do NOT copy `TenantSecretRepository.delete()`).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: standard repository following existing patterns.
  - **Skills**: [`data-access-conventions`] — repository pattern + soft-delete.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 3.
  - **Blocks**: None. **Blocked By**: T1, T2.

  **References**:
  - Pattern: `src/repositories/tenant-repository.ts` — CRUD + soft-delete/restore shape.
  - Anti-pattern: `src/repositories/tenant-secret-repository.ts:66` hard delete.
  - WHY: Consistent data-access layer; soft-delete per AGENTS.md.

  **Acceptance Criteria**:
  - [ ] Repo compiles; soft-deleted users excluded from default queries.

  **QA Scenarios**:

  ```
  Scenario: Soft-deleted user is hidden by default
    Tool: Bash (vitest integration or psql + node harness)
    Steps: 1. Create user, softDelete, list → excluded; restore → included.
    Expected Result: correct soft-delete filtering.
    Evidence: .sisyphus/evidence/task-18-user-repo.txt
  ```

  **Commit**: NO (groups with Wave 3)

- [x] 19. Bootstrap seed-platform-owner script + SQL break-glass (TDD)

  **What to do**:
  - RED: `tests/integration/auth/seed-platform-owner.test.ts` — running the seed yields exactly one PLATFORM_OWNER; re-running stays exactly one (idempotent).
  - GREEN: `scripts/seed-platform-owner.ts` — read `BOOTSTRAP_OWNER_EMAIL` from env; create the Supabase auth user if absent (admin API via service key) or look it up; upsert the `users` row with `role=PLATFORM_OWNER`; create OWNER `TenantMembership` rows for the two seeded tenants (`...0002`, `...0003`).
  - Document a raw-SQL break-glass (promote a user to PLATFORM_OWNER) in the auth guide + script header.
  - Add a `pnpm` script alias.

  **Must NOT do**: Hardcode a password in the repo. Create more than one PLATFORM_OWNER. Run automatically in prod without env present.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: bootstrap correctness + idempotency gate the admin-key removal.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 3.
  - **Blocks**: T24 (must exist before admin-key removal). **Blocked By**: T1, T2, T10.

  **References**:
  - Pattern: `scripts/*` (tsx scripts) + `prisma/seed.ts` (seeded tenant IDs `...0002`, `...0003`).
  - Pattern: nexus-stack `supabase/seed.sql` — seeding auth.users + app users in sync.
  - External: Supabase admin `auth.admin.createUser` via service key.
  - WHY: Without a bootstrap owner, removing the admin key locks everyone out (Metis R4).

  **Acceptance Criteria**:
  - [ ] Idempotent: after 1 or N runs, `SELECT count(*) FROM users WHERE role='PLATFORM_OWNER'` = 1.
  - [ ] Owner has OWNER membership in both seeded tenants.

  **QA Scenarios**:

  ```
  Scenario: Bootstrap is idempotent and attaches owner to seeded tenants
    Tool: Bash (script + psql)
    Steps:
      1. BOOTSTRAP_OWNER_EMAIL=owner@test.com pnpm seed-platform-owner (twice).
      2. psql: SELECT count(*) FROM users WHERE role='PLATFORM_OWNER'; → 1
      3. psql: SELECT count(*) FROM tenant_memberships WHERE role='OWNER' AND user_id=(SELECT id FROM users WHERE email='owner@test.com'); → 2
    Expected Result: exactly one PLATFORM_OWNER; OWNER of both seeded tenants.
    Evidence: .sisyphus/evidence/task-19-bootstrap.txt
  ```

  **Commit**: YES (Wave 3) — `feat(auth): apply role-based authz, gateway read endpoints, bootstrap owner`
  - Files: `src/gateway/routes/**`, `src/repositories/user-repository.ts`, `scripts/seed-platform-owner.ts`, `package.json`, `tests/**`
  - Pre-commit: `pnpm test -- --run && pnpm build`

### Wave 4 — Migrate Machine Callers, Then Remove the Admin Key

- [x] 20. Migrate machine scripts to SERVICE_TOKEN

  **What to do**:
  - Update the 7 ACTIVE scripts that send `X-Admin-Key` (Metis: stress-test, dev-e2e, register-project, preflight-guest-messaging, verify-multi-tenancy, + others identified) to send `Authorization: Bearer $SERVICE_TOKEN`. Read the token via the config constant (T4).
  - `trigger-task.ts` / `verify-e2e.ts` already don't use the key — leave them.

  **Must NOT do**: Touch `scripts/archive/*`. Leave any active script on the admin key.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: several scripts, verify each still works.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 4.
  - **Blocks**: T23, T24. **Blocked By**: T4.

  **References**:
  - Pattern: existing `X-Admin-Key` usage in `scripts/*` (Metis enumerated 7 active senders).
  - WHY: Machines can't log in; SERVICE_TOKEN is their replacement credential.

  **Acceptance Criteria**:
  - [ ] No active script references `X-Admin-Key`/`ADMIN_API_KEY`; at least one script runs green with SERVICE_TOKEN.

  **QA Scenarios**:

  ```
  Scenario: A migrated script runs with SERVICE_TOKEN only
    Tool: Bash
    Steps: 1. unset ADMIN_API_KEY; ensure SERVICE_TOKEN set; run a quick script (e.g. verify-multi-tenancy or stress-test --count 1).
    Expected Result: succeeds using the bearer token; no admin-key reference.
    Evidence: .sisyphus/evidence/task-20-scripts.txt
  ```

  **Commit**: NO (groups with Wave 4)

- [x] 21. Migrate cron / scheduled-trigger path to SERVICE_TOKEN

  **What to do**:
  - Identify the scheduled/cron trigger path (cron-job.org → `POST /admin/tenants/:tenantId/employees/:slug/trigger`). Update it to authenticate with `SERVICE_TOKEN` (and document the header change for the external cron config).
  - Verify a real trigger still fires end-to-end using the test employee.

  **Must NOT do**: Break the trigger endpoint for the dashboard's authenticated users (it should accept user JWT with sufficient role OR SERVICE_TOKEN).

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: silent failure risk if triggers stop firing (Metis EC13).
  - **Skills**: [`debugging-lifecycle`, `e2e-testing`] — trigger + lifecycle verification.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 4.
  - **Blocks**: T23, T24. **Blocked By**: T4, T16.

  **References**:
  - Pattern: AGENTS.md trigger curl + `real-estate-motivation-bot-2` (VLRE `...0003`, `approval_required:false`).
  - WHY: Cron is a machine caller; if not migrated, scheduled employees silently stop.

  **Acceptance Criteria**:
  - [ ] Trigger via SERVICE_TOKEN creates a task that reaches `Done`.

  **QA Scenarios**:

  ```
  Scenario: SERVICE_TOKEN trigger reaches Done
    Tool: Bash (curl + psql)
    Steps:
      1. curl -X POST .../employees/real-estate-motivation-bot-2/trigger -H "Authorization: Bearer $SERVICE_TOKEN" -d '{}'
      2. Wait ~60s; psql: SELECT status FROM tasks WHERE id='<task_id>';
    Expected Result: 202 then status=Done.
    Evidence: .sisyphus/evidence/task-21-cron-trigger.txt
  ```

  **Commit**: NO (groups with Wave 4)

- [x] 22. Migrate dashboard API client to JWT

  **What to do**:
  - Replace admin-key injection with the user's Supabase JWT in: `dashboard/src/lib/gateway.ts:54`, `dashboard/src/lib/gateway.ts:322`, and the raw fetch in `dashboard/src/hooks/use-execution-logs.ts:49` (Metis-flagged — bypasses `gatewayFetch`).
  - Point dashboard data reads at the new gateway read endpoints (T17) instead of PostgREST (`dashboard/src/lib/postgrest.ts`).
  - Remove the `ApiKeyPrompt` admin-key flow (replaced by login in Wave 5).

  **Must NOT do**: Leave `use-execution-logs.ts:49` on the admin key. Keep any admin-key localStorage path.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: dashboard/React code.
  - **Skills**: [`react-dashboard`] — dashboard conventions.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 4.
  - **Blocks**: T23, T24, T27. **Blocked By**: T17.

  **References**:
  - Pattern: `dashboard/src/lib/gateway.ts` (`gatewayFetch`, key injection at :54/:322), `dashboard/src/hooks/use-execution-logs.ts:49`, `dashboard/src/lib/postgrest.ts`, `dashboard/src/components/ApiKeyPrompt.tsx`.
  - WHY: The dashboard is the largest admin-key consumer; all three send-sites must move to JWT.

  **Acceptance Criteria**:
  - [ ] No dashboard code sends `X-Admin-Key`; data reads hit gateway endpoints; `pnpm dashboard:build` passes.

  **QA Scenarios**:

  ```
  Scenario: Dashboard sends JWT, not admin key
    Tool: Bash (grep + build)
    Steps:
      1. grep -rn "X-Admin-Key\|admin_api_key" dashboard/src || echo "clean OK"
      2. pnpm dashboard:build
    Expected Result: zero admin-key references; build succeeds.
    Evidence: .sisyphus/evidence/task-22-dashboard-jwt.txt
  ```

  **Commit**: NO (groups with Wave 4)

- [x] 23. Verify EVERY endpoint works without the admin key (dual-accept still ON)

  **What to do**:
  - With dual-accept still enabled, run a full sweep: authenticate as appropriate principals (user JWT / SERVICE_TOKEN) and confirm every admin endpoint + dashboard flow + migrated scripts + cron works WITHOUT supplying the admin key.
  - Produce a checklist of all ~70 endpoints with pass/fail. Any failure must be fixed before T24.

  **Must NOT do**: Remove the admin key (T24). Skip any endpoint group.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: broad verification sweep.
  - **Skills**: [`e2e-testing`] .

  **Parallelization**:
  - **Can Run In Parallel**: NO (gate) — Sequential after T16-T22.
  - **Blocks**: T24. **Blocked By**: T16, T17, T20, T21, T22.

  **References**:
  - Pattern: `.sisyphus/notepads/authz-matrix.md` (endpoint inventory).
  - WHY: The Metis-mandated proof that the replacement fully works before the key is removed (prevents R3 lockout).

  **Acceptance Criteria**:
  - [ ] Every endpoint group passes using JWT/SERVICE_TOKEN with NO admin key present.

  **QA Scenarios**:

  ```
  Scenario: Full sweep passes without admin key
    Tool: Bash (curl loop)
    Steps:
      1. For each route group, curl with the correct principal and NO X-Admin-Key.
      2. Record status codes into a checklist file.
    Expected Result: all expected 200/403/401 per matrix; zero unexpected 401s from missing admin key.
    Evidence: .sisyphus/evidence/task-23-sweep.txt
  ```

  **Commit**: NO (groups with Wave 4)

- [x] 24. REMOVE the admin key (middleware branch, requireEnv, all references, env)

  **What to do**:
  - Delete the dual-accept admin-key branch from `src/gateway/middleware/auth.ts`; delete `src/gateway/middleware/admin-auth.ts`.
  - Remove `requireEnv('ADMIN_API_KEY')` / any startup requirement; remove `ADMIN_API_KEY` from `.env`, `.env.example`, config, and all docs.
  - Purge all references: `grep -rn "X-Admin-Key\|ADMIN_API_KEY"` (excluding `scripts/archive/`) must be zero in active code.
  - Confirm the gateway boots with `ADMIN_API_KEY` unset.

  **Must NOT do**: Remove `SERVICE_TOKEN`. Touch `/internal`/webhooks/OAuth auth.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: final high-blast-radius removal; must be complete and verified.
  - **Skills**: [] .

  **Parallelization**:
  - **Can Run In Parallel**: NO (final) — Sequential after T23.
  - **Blocks**: Wave 5 verification. **Blocked By**: T23, T19 (bootstrap owner must exist).

  **References**:
  - Pattern: `src/gateway/middleware/admin-auth.ts` (to delete), all 18 route imports, `.env.example` Platform Core section.
  - WHY: Completes the user's "remove the admin key entirely" requirement, safely gated behind T23 + bootstrap.

  **Acceptance Criteria**:
  - [ ] `grep -rn "X-Admin-Key\|ADMIN_API_KEY" src dashboard scripts docs .env.example --exclude-dir=archive` → 0.
  - [ ] Gateway boots with `ADMIN_API_KEY` unset; `pnpm build`/`pnpm test` pass.

  **QA Scenarios**:

  ```
  Scenario: Admin key fully removed; gateway boots without it
    Tool: Bash (grep + boot)
    Steps:
      1. grep -rn "X-Admin-Key\|ADMIN_API_KEY" src dashboard scripts docs .env.example --exclude-dir=archive | wc -l → 0
      2. Start gateway with ADMIN_API_KEY unset → /health 200.
      3. curl an admin endpoint with X-Admin-Key (old key) → 401 (no longer accepted).
    Expected Result: zero references; boots clean; old key rejected.
    Failure Indicators: any reference remains; boot fails on missing env; old key still works.
    Evidence: .sisyphus/evidence/task-24-key-removed.txt
  ```

  **Commit**: YES (Wave 4) — `refactor(auth): migrate machine callers to SERVICE_TOKEN and remove ADMIN_API_KEY`
  - Files: `scripts/**` (active), `src/gateway/middleware/**`, `src/gateway/routes/**`, `dashboard/src/**`, `.env.example`, `src/lib/config.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build && pnpm dashboard:build`

### Wave 5 — Dashboard UX

- [x] 25. Supabase browser client + login/signup/forgot-password pages

  **What to do**:
  - Add `@supabase/supabase-js` browser client in `dashboard/src/lib/supabase.ts` using `SUPABASE_URL` (Kong `:54331`) + anon key (served pre-login via existing `/api/config.js`).
  - Build `/dashboard/login`, `/dashboard/signup`, `/dashboard/forgot-password` pages: email/password via `supabase.auth.signInWithPassword`/`signUp`/`resetPasswordForEmail`; Google button via `supabase.auth.signInWithOAuth({ provider:'google' })`.
  - Friendly, human copy; cards per dashboard UI conventions.

  **Must NOT do**: Use the admin key. Hardcode credentials. Introduce a second UI kit.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: auth UI/UX.
  - **Skills**: [`react-dashboard`] — dashboard component/card conventions.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 5.
  - **Blocks**: T27. **Blocked By**: T3.

  **References**:
  - Pattern: nexus-stack `apps/web/src/app/sign-in/page.tsx`, `sign-up`, `forgot-password` (flows to mirror, minus Next-specifics).
  - Pattern: `dashboard/src/` component/card conventions; `/api/config.js` for anon key.
  - WHY: These are the entry points; mirroring nexus's proven flows reduces risk.

  **Acceptance Criteria**:
  - [ ] Login/signup/forgot pages render; email/password login obtains a session; Google button initiates OAuth.

  **QA Scenarios**:

  ```
  Scenario: Email/password login obtains a session (real browser)
    Tool: Playwright via CDP (real Chrome) at localhost:7700/dashboard/login
    Preconditions: bootstrap owner exists (owner@test.com / Test1234!).
    Steps:
      1. Navigate to /dashboard/login.
      2. Fill input[type=email]="owner@test.com", input[type=password]="Test1234!".
      3. Click button:has-text("Sign in"). Wait for redirect.
      4. Assert session token present; no console errors.
    Expected Result: authenticated, redirected into the dashboard.
    Failure Indicators: stays on login; console error; no token.
    Evidence: .sisyphus/evidence/task-25-login.png
  ```

  **Commit**: NO (groups with Wave 5)

- [x] 26. Google OAuth callback handling in dashboard

  **What to do**:
  - Handle the OAuth return at the dashboard callback route: exchange code/verify session via `supabase.auth`, then route into the app. Ensure the redirect target matches `GOTRUE_SITE_URL` (T3).
  - First Google login triggers `ensureUserExists` on the first authenticated gateway call; a user with no memberships sees an empty-state "no tenants yet — ask for an invite" view (Metis EC9).

  **Must NOT do**: Assume a membership exists for brand-new OAuth users.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: OAuth return UX.
  - **Skills**: [`react-dashboard`] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 5.
  - **Blocks**: T27. **Blocked By**: T3, T25.

  **References**:
  - Pattern: nexus-stack `apps/web/src/app/auth/callback/route.ts` (exchangeCodeForSession) — adapt to Vite SPA.
  - WHY: Self-hosted OAuth needs the callback + correct redirect to complete.

  **Acceptance Criteria**:
  - [ ] OAuth callback establishes a session; new OAuth user with no memberships sees the empty-state.

  **QA Scenarios**:

  ```
  Scenario: Google callback config wired (redirect chain reachable)
    Tool: Bash (curl -I) + Playwright (provider page reached)
    Steps:
      1. curl -sI "http://localhost:54331/auth/v1/authorize?provider=google&redirect_to=http://localhost:7700/dashboard/" | head -n1 → 302.
      2. (Playwright) Click "Continue with Google" → reaches Google consent page (full sign-in needs a real Google account; document if creds absent).
    Expected Result: redirect chain reaches Google; callback handler present in code.
    Evidence: .sisyphus/evidence/task-26-google-callback.txt
  ```

  **Commit**: NO (groups with Wave 5)

- [x] 27. Auth context/session + protected routes + logout

  **What to do**:
  - Add a Supabase auth context/provider in the dashboard that tracks `user`/`session` via `onAuthStateChange`, exposes `useAuth()`, and attaches the JWT to all `gatewayFetch` calls.
  - Add route protection: unauthenticated users redirected to `/dashboard/login`; authenticated users gated into the app. Add logout (`supabase.auth.signOut`).

  **Must NOT do**: Keep any `ApiKeyPrompt` path. Use `getSession()` as the auth source without `getUser()` validation for sensitive gates.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: app-wide auth context/routing.
  - **Skills**: [`react-dashboard`] .

  **Parallelization**:
  - **Can Run In Parallel**: NO — Sequential after T25/T26.
  - **Blocks**: T28, T29. **Blocked By**: T13, T22, T25, T26.

  **References**:
  - Pattern: nexus-stack `packages/auth/src/providers/supabase-provider.tsx` + `apps/web/src/middleware.ts` route protection (adapt to React Router).
  - Pattern: `dashboard/src/App.tsx` routing (currently unguarded).
  - WHY: Central context + protected routes turns the open dashboard into an authenticated app.

  **Acceptance Criteria**:
  - [ ] Unauthenticated `/dashboard/*` → redirect to login; authenticated → app; logout clears session.

  **QA Scenarios**:

  ```
  Scenario: Unauthenticated access is redirected; logout works
    Tool: Playwright via CDP
    Steps:
      1. With no session, navigate /dashboard/tasks → redirected to /dashboard/login.
      2. Log in → reach /dashboard/tasks.
      3. Click logout → redirected to login; revisiting /dashboard/tasks redirects again.
    Expected Result: gate + logout behave correctly.
    Evidence: .sisyphus/evidence/task-27-protected-routes.png
  ```

  **Commit**: NO (groups with Wave 5)

- [x] 28. Membership-driven tenant switcher

  **What to do**:
  - Replace the hardcoded `TENANTS` map (`dashboard/src/lib/constants.ts:29-32`) and `DEFAULT_TENANT_ID` with a tenant switcher populated from `GET /me/tenants` (T13).
  - Use `SearchableSelect` (per AGENTS.md). Persist the selected tenant in the URL (`?tenant=`) AND validate server-side on every request (client selection is a hint only). Switching to a non-member tenant is impossible (not listed; server denies).

  **Must NOT do**: Trust the client's tenant selection for authorization. Keep the hardcoded map. Use Radix `<Select>` for the option list.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: dashboard component + URL state.
  - **Skills**: [`react-dashboard`] — SearchableSelect + URL-encoded state.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 5 (after T27).
  - **Blocks**: None. **Blocked By**: T13, T27.

  **References**:
  - Pattern: `dashboard/src/hooks/use-tenant.ts`, `dashboard/src/lib/constants.ts:29-32` (hardcoded map to remove).
  - Pattern: `dashboard/src/components/ui/searchable-select.tsx` (mandated); URL-encoded state convention (AGENTS.md).
  - WHY: Membership-driven switching is the requested UX and closes the "trust client tenant" hole.

  **Acceptance Criteria**:
  - [ ] Switcher lists only `/me/tenants` results; selection is URL-encoded; non-member tenant not selectable and server-denied.

  **QA Scenarios**:

  ```
  Scenario: Switcher is membership-driven and URL-encoded
    Tool: Playwright via CDP
    Preconditions: owner@test.com is OWNER of both seeded tenants.
    Steps:
      1. Log in; open tenant switcher → shows DozalDevs + VLRE (from /me/tenants), not a hardcoded map.
      2. Select VLRE → URL contains ?tenant=<vlre-id>; data refreshes to VLRE.
      3. Manually set ?tenant=<random-uuid> → app shows no access / falls back (server denies).
    Expected Result: only memberships listed; URL reflects selection; bogus tenant denied.
    Evidence: .sisyphus/evidence/task-28-switcher.png
  ```

  **Commit**: NO (groups with Wave 5)

- [x] 29. Member + invitation management UI

  **What to do**:
  - Add a tenant "Members" view: list members (from a gateway endpoint), change role, remove member (calls T14; last-owner guard surfaces a friendly error), and an "Invite" action (calls T15) showing pending invitations with revoke. Show invite emails landing in Mailpit for dev.
  - Gate the UI to ADMIN+/OWNER (hide actions for MEMBER/VIEWER).

  **Must NOT do**: Expose management actions to non-admins. Hard delete.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: CRUD management UI.
  - **Skills**: [`react-dashboard`] — cards, SearchableSelect, conventions.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 5 (after T27).
  - **Blocks**: None. **Blocked By**: T14, T15, T27.

  **References**:
  - Pattern: dashboard card/section conventions; `SearchableSelect` for role pickers; member/invite endpoints (T14/T15).
  - WHY: Completes the user's "member/invitation management UI" requirement.

  **Acceptance Criteria**:
  - [ ] ADMIN+ can invite/list/revoke/change-role/remove; MEMBER/VIEWER see read-only; last-owner removal shows a friendly error.

  **QA Scenarios**:

  ```
  Scenario: Invite from UI creates an invitation row + email
    Tool: Playwright via CDP + psql + Mailpit
    Steps:
      1. As OWNER, open Members → Invite → enter invitee@test.com, role MEMBER → submit.
      2. psql: SELECT status FROM tenant_invitations WHERE email='invitee@test.com'; → pending.
      3. Mailpit (http://localhost:54325) shows the invite email.
    Expected Result: pending invitation row + email present.
    Evidence: .sisyphus/evidence/task-29-invite-ui.png

  Scenario: Non-admin sees read-only members view
    Tool: Playwright via CDP
    Steps: 1. Log in as a MEMBER; open Members → no Invite/Remove/Role controls.
    Expected Result: management actions hidden/disabled.
    Evidence: .sisyphus/evidence/task-29-nonadmin-ui.png
  ```

  **Commit**: YES (Wave 5) — `feat(dashboard): add supabase login, auth context, tenant switcher, member management`
  - Files: `dashboard/src/lib/supabase.ts`, `dashboard/src/**` (login/signup/forgot/callback/context/protected-routes/switcher/members)
  - Pre-commit: `pnpm dashboard:build`

---

## ADDED TASKS (Expansion: new key model, dual-env, Supabase-managed lifecycle, per-wave E2E)

> These tasks are inserted into the waves shown in the Execution Strategy. Existing tasks T1–T29/F1–F6 above remain; the additions below carry the dual-env, new-key-model, and Supabase-lifecycle requirements, plus a per-wave E2E checkpoint. Where an added task **amends** an existing one (T8, T12, T15), the amendment is stated explicitly.

### Wave 0 additions

- [x] 0d. Dual-env + new-key-model spike (Kong file, cloud JWKS/alg, cloud Prisma connection)

  **What to do**:
  - Confirm which Kong file the **active** `docker/supabase-services.yml` mounts (`docker/volumes/api/kong.yml` 4-key vs `docker/kong.yml` 2-key). Record the answer; all later key-model edits target the mounted file.
  - Inspect `docker/kong-entrypoint.sh` to confirm the dormant opaque-key→JWT translation and the user-session Bearer pass-through; note what env values activate it.
  - Against the CLOUD project (`https://gjqrysxpvktmibpkwrvy.supabase.co`): `curl` the JWKS endpoint `/auth/v1/.well-known/jwks.json` → confirm reachable + capture `kid`/`alg` (expect ES256). Do a cloud signup and decode the JWT header → confirm `alg=ES256`.
  - Validate cloud Prisma connectivity: confirm `migrate`-capable connection (session pooler `5432`, IPv4) and runtime pooler (`6543 ?pgbouncer=true`) using the provided connection strings (password from `.env`). Confirm the runner reaches the chosen host.
  - Confirm `apikey: sb_publishable_*` works against the cloud Data API and `Authorization: Bearer sb_publishable_*` is rejected (documents the opaque-key contract).
  - Write findings to `.sisyphus/notepads/dual-env-spike.md`.

  **Must NOT do**: Run cloud migrations here (TC does that). Change any code. Commit secrets.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: de-risks the largest unknowns (crypto path, cloud conn, mounted Kong file) before any build.
  - **Skills**: [`debugging-lifecycle`] — container/env inspection.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 0 (with 0a, 0b, 0c).
  - **Blocks**: T3b (config layer), T8 (verifier), TC (cloud provision). **Blocked By**: None.

  **References**:
  - Pattern: `docker/kong-entrypoint.sh:5-26` — opaque-key translation + Bearer pass-through (Metis-verified).
  - Pattern: `docker/volumes/api/kong.yml` (4-key) vs `docker/kong.yml` (2-key) — confirm mounted.
  - Pattern: `docker/.env.example:30-34,178-179` — dormant PUBLISHABLE/SECRET/JWT_KEYS/JWT_JWKS slots.
  - External: cloud JWKS `https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/.well-known/jwks.json`.
  - WHY: Q1 (dual verifier) + cloud provisioning depend on these exact facts; guessing risks a broken verifier or failed migrations.

  **Acceptance Criteria**:
  - [ ] `.sisyphus/notepads/dual-env-spike.md` records: mounted Kong file, cloud `alg`+`kid`+JWKS URL, working migrate vs runtime connection strings, publishable-key wire results.

  **QA Scenarios**:

  ```
  Scenario: Cloud issues ES256 + JWKS reachable
    Tool: Bash (curl + base64)
    Steps:
      1. curl -s "https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/.well-known/jwks.json" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" | jq '.keys[0].kid,.keys[0].alg'
      2. Cloud signup; decode JWT header → assert alg=="ES256".
    Expected Result: JWKS returns a key; token header alg=ES256.
    Failure Indicators: JWKS 404/empty; alg=HS256 (means asymmetric not enabled).
    Evidence: .sisyphus/evidence/cloud/task-0d-jwks.txt

  Scenario: Opaque key contract (publishable)
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" ".../rest/v1/<any>?limit=1" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" → 200
      2. curl -s -o /dev/null -w "%{http_code}" ".../rest/v1/<any>?limit=1" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" → 401
    Expected Result: apikey accepted; Bearer-publishable rejected.
    Evidence: .sisyphus/evidence/cloud/task-0d-keymatrix.txt

  Scenario: Cloud Prisma connectivity
    Tool: Bash (psql or prisma db execute)
    Steps: 1. Connect via session pooler (5432) → SELECT 1; 2. Connect via txn pooler (6543) → SELECT 1.
    Expected Result: both succeed from the runner.
    Evidence: .sisyphus/evidence/cloud/task-0d-prisma-conn.txt
  ```

  **Commit**: NO (groups with Wave 0 — amends the Wave-0 commit to include `dual-env-spike.md`)

- [x] 0E2E. Wave-0 checkpoint — local + cloud connectivity & key matrix

  **What to do**:
  - Consolidate the Wave-0 wire checks into a repeatable evidence set for BOTH envs: auth signup reachable, JWKS (cloud) / HS256 secret (local) present, publishable-as-apikey accepted, Bearer-publishable rejected.
  - Save to `.sisyphus/evidence/local/wave0/` and `.sisyphus/evidence/cloud/wave0/`.

  **Must NOT do**: Build app features (none exist yet). Depend on app tables (not migrated yet).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: scripted curl checks.
  - **Skills**: [`e2e-testing`] .

  **Parallelization**:
  - **Can Run In Parallel**: NO (closes Wave 0) — **Blocked By**: T0a, T0d.
  - **Blocks**: Wave 1 start (confirms both envs reachable).

  **References**:
  - Pattern: `.sisyphus/notepads/dual-env-spike.md` (T0d) + `.sisyphus/notepads/auth-spike.md` (T0a).
  - WHY: Establishes the both-envs baseline every later checkpoint builds on.

  **Acceptance Criteria**:
  - [ ] Evidence captured for both envs: auth reachable + key matrix correct.

  **QA Scenarios**:

  ```
  Scenario: Both environments reachable with correct key behavior
    Tool: Bash (curl loop over both base URLs)
    Steps: 1. For LOCAL (:54331) and CLOUD (gjqrysxpvktmibpkwrvy): hit /auth/v1/health (or signup) + the key matrix.
    Expected Result: both envs respond; key matrix correct on both.
    Evidence: .sisyphus/evidence/{local,cloud}/wave0/checkpoint.txt
  ```

  **Commit**: YES (Wave 0) — amends `chore(auth): add authz matrix and supabase config spike notes` to include dual-env spike + checkpoint evidence notes.

### Wave 1 additions

- [x] C. CLOUD provision — migrate, schema reload, seed, providers, redirects

  **What to do**:
  - Using an **all-cloud env profile**, run `pnpm prisma migrate deploy` against the cloud DB via `DATABASE_URL_DIRECT` (session pooler, IPv4, `5432`). Confirm all tables (existing + the 3 new) are created.
  - Reload the cloud Data API schema (Supabase dashboard "Reload schema" or SQL editor `NOTIFY pgrst, 'reload schema';`). Verify the 3 new tables return `[]` (not PGRST205) via the cloud Data API.
  - Seed the 2 tenants (`...0002`, `...0003`) on cloud (reuse `prisma/seed.ts` tenant rows only — NO historical task/feedback/rules backfill).
  - In the cloud Supabase dashboard: enable email/password + Google providers; set the redirect allow-list to include BOTH localhost dashboard origins AND the cloud callback (`https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/callback`).
  - Record cloud setup steps in the cloud-deploy guide (F5 will finalize).

  **Must NOT do**: Backfill historical data. Run the worker against cloud (deferred). Enable `authenticated` RLS on tenant tables. Hardcode the secret/password in any committed file.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: cloud migration footguns (pooler/port/IPv6) + provider/redirect config.
  - **Skills**: [`prisma`] — migrate workflow.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (independent of local schema once T1 defines models).
  - **Blocks**: T1E2E (cloud login), all cloud E2E. **Blocked By**: T1 (models), T0d (verified conn strings).

  **References**:
  - Pattern: `prisma/seed.ts` — the 2 tenant rows (`...0002`, `...0003`).
  - Pattern: `.sisyphus/notepads/dual-env-spike.md` (T0d) — confirmed connection strings.
  - External: cloud project `gjqrysxpvktmibpkwrvy` dashboard (providers + redirects).
  - WHY: Cloud must hold the schema + tenants + providers for any cloud auth/dashboard/API E2E to run.

  **Acceptance Criteria**:
  - [ ] Cloud DB has all tables; the 3 new tables return `[]` via cloud Data API (not PGRST205).
  - [ ] 2 tenants seeded on cloud; email/password + Google enabled; redirect allow-list includes localhost + cloud.

  **QA Scenarios**:

  ```
  Scenario: Cloud migrate + schema reload + tenants seeded
    Tool: Bash (prisma + curl + psql-to-cloud)
    Steps:
      1. DATABASE_URL_DIRECT=<session pooler> pnpm prisma migrate deploy
      2. Reload schema; curl "https://gjqrysxpvktmibpkwrvy.supabase.co/rest/v1/tenant_memberships?limit=1" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" → [] (not PGRST205)
      3. curl ".../rest/v1/tenants?select=id" -H "apikey: $SUPABASE_SECRET_KEY" → 2 rows
    Expected Result: migrate succeeds; new tables visible; 2 tenants present.
    Failure Indicators: PGRST205; prepared-statement error (wrong pooler); 0 tenants.
    Evidence: .sisyphus/evidence/cloud/task-C-provision.txt
  ```

  **Commit**: NO (groups with Wave 1)

- [x] 3b. Dual-env config layer + atomic-profile startup assertion

  **What to do**:
  - Add an env profile concept (LOCAL vs CLOUD) driven entirely by env values: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (holds publishable value), `SUPABASE_SECRET_KEY` (secret), `SUPABASE_JWKS_URL` (derived `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), `DATABASE_URL` / `DATABASE_URL_DIRECT`. Keep var NAMES; change VALUES.
  - Add a startup assertion (in `src/lib/config.ts` / gateway boot) that the env set is atomic: a cloud `SUPABASE_URL` (https `*.supabase.co`) must pair with `sb_*` keys; a localhost URL must pair with the local keys. Fail fast on a mixed profile.
  - Document both profiles in `.env.example` (cloud values as placeholders; secrets only in `.env`).

  **Must NOT do**: Rename env vars. Put secrets in any committed file or in `/api/config.js`.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: prevents the silent wrong-DB corruption (Metis R-E6).
  - **Skills**: [`security`, `data-access-conventions`] — env/secret handling + data-access boundaries.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1.
  - **Blocks**: T8 (verifier reads JWKS/secret per profile), all dual-env E2E. **Blocked By**: T0d.

  **References**:
  - Pattern: `src/lib/config.ts` (named env constants) + `src/gateway/server.ts:295-305` (`/api/config.js` browser bridge).
  - Pattern: `src/repositories/tenant-env-loader.ts` (worker env whitelist — already includes the keys).
  - WHY: One config bridge flips browser+gateway+worker between envs; the assertion stops a local-URL+cloud-key mix from corrupting the wrong DB.

  **Acceptance Criteria**:
  - [ ] Switching the env profile flips `/api/config.js` output; mixed profile fails startup with a clear error.

  **QA Scenarios**:

  ```
  Scenario: Atomic-profile assertion rejects a mixed env
    Tool: Bash (boot with bad env)
    Steps: 1. Set SUPABASE_URL=localhost + SUPABASE_SECRET_KEY=sb_secret_* (cloud) → start gateway.
    Expected Result: startup fails fast with a clear "mixed Supabase profile" error.
    Failure Indicators: gateway boots and serves requests against a mismatched DB.
    Evidence: .sisyphus/evidence/local/task-3b-atomic-profile.txt

  Scenario: /api/config.js reflects the active profile
    Tool: Bash (curl)
    Steps: 1. With cloud profile, curl http://localhost:7700/api/config.js → contains cloud SUPABASE_URL + publishable key (NOT secret).
    Expected Result: correct per-profile values; secret never present.
    Evidence: .sisyphus/evidence/cloud/task-3b-config-js.txt
  ```

  **Commit**: NO (groups with Wave 1)

- [x] 1E2E. Wave-1 checkpoint — signup+login issue a JWT on BOTH envs; tables visible

  **What to do**:
  - On LOCAL and CLOUD: perform a real signup + password login via Auth; assert a JWT is returned and decodes with the expected `alg` (HS256 local / ES256 cloud). Assert the 3 new tables are queryable via each env's Data API.
  - Save evidence to `.sisyphus/evidence/{local,cloud}/wave1/`.

  **Must NOT do**: Exercise gateway authz (not built until Wave 2).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: cross-env verification.
  - **Skills**: [`e2e-testing`] .

  **Parallelization**:
  - **Can Run In Parallel**: NO (closes Wave 1) — **Blocked By**: T2, TC, T3, T3b.
  - **Blocks**: Wave 2 start.

  **References**:
  - Pattern: T0d/T0a spike notes; cloud project + local Kong base URLs.
  - WHY: Confirms identity issuance + schema on both envs before authz is layered on.

  **Acceptance Criteria**:
  - [ ] Login returns a decodable JWT (correct `alg`) on both envs; 3 new tables visible on both.

  **QA Scenarios**:

  ```
  Scenario: Login issues correct-alg JWT on both envs
    Tool: Bash (curl + decode)
    Steps: 1. LOCAL password-grant → decode alg=HS256. 2. CLOUD password-grant → decode alg=ES256.
    Expected Result: both return tokens with the expected algorithm.
    Evidence: .sisyphus/evidence/{local,cloud}/wave1/login.txt
  ```

  **Commit**: YES (Wave 1) — amends the Wave-1 commit to add `T3b` config + cloud provisioning notes.

### Wave 2 amendments + checkpoint

- [x] 8★ (AMENDS T8). Make the JWT verifier env-aware (JWKS/ES256 + HS256)
  - **Amendment**: T8 above ("verify HS256 shared secret") is REPLACED by an env-aware verifier: `jose.createRemoteJWKSet(SUPABASE_JWKS_URL)` for cloud (ES256), `jose.createSecretKey(JWT_SECRET)` for local (HS256), selected by the active profile / token issuer. Reject cross-issuer tokens. Tests cover both algorithms.
  - **References**: `.sisyphus/notepads/dual-env-spike.md` (cloud `kid`/`alg`); librarian `jose` JWKS pattern.
  - **QA**: verify a real LOCAL (HS256) token AND a real CLOUD (ES256) token; assert a cloud token is rejected by the local-only path and vice-versa.
  - Evidence: `.sisyphus/evidence/{local,cloud}/task-8-verify.txt`

- [x] 12★ (AMENDS T12). Deactivation = Supabase ban + app `users.status`
  - **Amendment**: deactivation calls the Supabase Admin API ban (`auth.admin.updateUserById` with `ban_duration`) **and** sets app `users.status='disabled'`. The per-request DB check (T9/T11) enforces immediate lockout (Supabase ban only blocks token refresh, ~1h). E2E must assert next-request 403 with the **same still-valid JWT**.
  - **References**: librarian Supabase Admin ban semantics; T9/T11 per-request check.
  - **QA**: 200 → ban+status → 403 on next request (same token), on BOTH envs.
  - Evidence: `.sisyphus/evidence/{local,cloud}/task-12-deactivate.txt`

- [x] 15★ (AMENDS T15). Invitations via Supabase Admin API (+ app tenant/role intent)
  - **Amendment**: invite EMAIL + account creation use `supabase.auth.admin.inviteUserByEmail(email, { data, redirectTo })` (secret key, server-side). The app `TenantInvitation` row still stores `{tenant_id, role, status, expires_at}` as the tenant/role intent. On acceptance (magic-link callback / first authenticated request), materialize `tenant_memberships` in a Serializable txn. LOCAL uses Mailpit (full accept E2E); CLOUD asserts the account is created in `invited` state + the `TenantInvitation` row exists (email delivery deferred — built-in 2/hr team-only).
  - **References**: librarian `inviteUserByEmail` semantics + rate-limit facts; nexus invite→membership-attach step.
  - **QA**: LOCAL invite→Mailpit→accept→membership row; CLOUD invite→assert `auth.users` invited + `TenantInvitation` row (no email dependency).
  - Evidence: `.sisyphus/evidence/{local,cloud}/task-15-invite.txt`

- [x] 2E2E. Wave-2 checkpoint — authz matrix + invite-create + deactivate-lockout (both envs)

  **What to do**:
  - Run the API journey via `curl` on BOTH envs: authz matrix (own 200 / other 403 / none 401 / wrong-role 403); Supabase-managed invite (local full accept; cloud create-only); deactivate → next-request 403 with a still-valid token; `/me` + `/me/tenants` scoping.
  - Evidence to `.sisyphus/evidence/{local,cloud}/wave2/`.

  **Must NOT do**: Drive the dashboard UI (not built until Wave 5). Run the worker against cloud.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: broad cross-env API verification.
  - **Skills**: [`e2e-testing`] .

  **Parallelization**:
  - **Can Run In Parallel**: NO (closes Wave 2) — **Blocked By**: T9, T11, T12★, T13, T14, T15★.
  - **Blocks**: Wave 3 start.

  **References**: `.sisyphus/notepads/authz-matrix.md`; the amended tasks above.
  **WHY**: Proves the core auth + lifecycle behavior on both envs before applying authz platform-wide.

  **Acceptance Criteria**:
  - [ ] Authz matrix, invite-create, and deactivate-lockout all pass on both envs.

  **QA Scenarios**:

  ```
  Scenario: Deactivate locks out on next request (both envs)
    Tool: Bash (curl + admin ban + psql)
    Steps: 1. member 200; 2. deactivate (ban + status=disabled); 3. same JWT → 403.
    Expected Result: 200 → 403 immediately, local AND cloud.
    Evidence: .sisyphus/evidence/{local,cloud}/wave2/deactivate.txt
  ```

  **Commit**: YES (Wave 2) — amends the Wave-2 commit to include the env-aware verifier + Supabase-managed lifecycle.

### Wave 3 addition + checkpoint

- [x] 19b. Fix `interaction-classifier.ts` for the opaque key model

  **What to do**:
  - Update `src/lib/interaction-classifier.ts` (the `apikey: ANON` + `Authorization: Bearer SECRET` call at ~lines 87-88) to send the secret as `apikey` only (drop the `Bearer sb_secret_*`, which the new model rejects). Keep behavior identical otherwise.

  **Must NOT do**: Refactor unrelated logic. Touch other classifier behavior.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: a one-call header fix.
  - **Skills**: [`data-access-conventions`] .

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 3.
  - **Blocks**: clean cloud run. **Blocked By**: T0d (key contract confirmed).

  **References**:
  - Pattern: `src/lib/interaction-classifier.ts:87-88` (Metis-flagged mixed keys).
  - WHY: Under opaque keys on cloud, `Bearer sb_secret_*` is rejected — this call would break; previously out-of-scope, now required for cloud.

  **Acceptance Criteria**:
  - [ ] The classifier call uses `apikey` only; works against both envs.

  **QA Scenarios**:

  ```
  Scenario: Classifier call succeeds under opaque keys
    Tool: Bash (trigger the classifier path + check logs)
    Steps: 1. Exercise an interaction that hits the classifier on the cloud profile.
    Expected Result: no 401 from the Data API; classification proceeds.
    Evidence: .sisyphus/evidence/cloud/task-19b-classifier.txt
  ```

  **Commit**: NO (groups with Wave 3)

- [x] 3E2E. Wave-3 checkpoint — role-gated endpoints + gateway reads scoped (both envs)

  **What to do**:
  - On BOTH envs: confirm role-gated admin endpoints enforce the matrix; the new gateway read endpoints return only the caller's tenant data; bootstrap owner exists and owns both tenants.
  - Evidence to `.sisyphus/evidence/{local,cloud}/wave3/`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`. **Skills**: [`e2e-testing`].

  **Parallelization**: NO (closes Wave 3) — **Blocked By**: T16, T17, T19, T19b. **Blocks**: Wave 4.

  **References**: `.sisyphus/notepads/authz-matrix.md`; T17 read endpoints.
  **Acceptance Criteria**:
  - [ ] Role gates + scoped reads pass on both envs; bootstrap owner verified on both.

  **QA Scenarios**:

  ```
  Scenario: Gateway reads are tenant-scoped (both envs)
    Tool: Bash (curl)
    Steps: 1. member-of-A reads A → rows; reads B → 403.
    Expected Result: scoped on both envs.
    Evidence: .sisyphus/evidence/{local,cloud}/wave3/reads.txt
  ```

  **Commit**: NO (groups with Wave 3)

### Wave 4 checkpoint

- [x] 4E2E. Wave-4 checkpoint — full API journey WITHOUT admin key (both envs)

  **What to do**:
  - On BOTH envs, re-run the full API journey using only JWT / SERVICE_TOKEN (no admin key present): authz matrix, invite-create, deactivate-lockout, `/me`, member/invite endpoints. Confirm `grep`-zero admin-key references in active code.
  - Evidence to `.sisyphus/evidence/{local,cloud}/wave4/`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`. **Skills**: [`e2e-testing`].

  **Parallelization**: NO (closes Wave 4) — **Blocked By**: T23, T24. **Blocks**: Wave 5.

  **References**: T23 sweep checklist; T24 removal.
  **Acceptance Criteria**:
  - [ ] Full journey passes with no admin key on both envs; grep-zero confirmed.

  **QA Scenarios**:

  ```
  Scenario: Everything works post-admin-key-removal (both envs)
    Tool: Bash (curl loop, ADMIN_API_KEY unset)
    Steps: 1. Run journey on local; 2. run on cloud; 3. grep admin-key refs → 0.
    Expected Result: all green; zero references.
    Evidence: .sisyphus/evidence/{local,cloud}/wave4/journey.txt
  ```

  **Commit**: NO (groups with Wave 4)

### Wave 5 checkpoint

- [x] 5E2E. Wave-5 checkpoint — full Playwright user journey (both envs)

  **What to do**:
  - Playwright via CDP (real Chrome) on BOTH env profiles: open `/dashboard/` unauthenticated → redirected to login; log in (email/password); tenant switcher shows membership tenants; on LOCAL run full invite→accept (Mailpit) + change role + deactivate→confirm the deactivated user is locked out on next action + log out; on CLOUD run login + switch + invite-create + role change + logout (skip email-delivery accept). Capture screenshots per step.
  - Evidence to `.sisyphus/evidence/{local,cloud}/wave5/`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: real browser journey.
  - **Skills**: [`e2e-testing`] (+ Playwright via CDP).

  **Parallelization**: NO (closes Wave 5) — **Blocked By**: T25, T26, T27, T28, T29. **Blocks**: Final Wave.

  **References**: AGENTS.md real-browser E2E (CDP, real Chrome, `localhost:7700/dashboard/`).
  **Acceptance Criteria**:
  - [ ] Full browser journey passes on local; auth+dashboard+invite-create journey passes on cloud; screenshots captured.

  **QA Scenarios**:

  ```
  Scenario: Real user journey in a real browser (both envs)
    Tool: Playwright via CDP
    Steps: 1. local: signup/login/switch/invite/accept/role/deactivate/logout. 2. cloud: login/switch/invite-create/role/logout.
    Expected Result: each step asserts visible UI; screenshots saved.
    Evidence: .sisyphus/evidence/{local,cloud}/wave5/*.png
  ```

  **Commit**: YES (Wave 5) — amends the Wave-5 commit to include the dual-env journey evidence.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 6 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for the user's explicit approval before marking work complete.**
> **Never mark F1-F6 checked before the user's okay.** Rejection or feedback → fix → re-run → present again → wait.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search the codebase for the forbidden pattern (custom access token hook, permissions table, `authenticated` RLS on tenant tables, global Prisma tenant middleware, touched webhooks/internal/OAuth, archive scripts) — reject with file:line if found. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` (tsc) + `pnpm lint` + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log`, commented-out code, unused imports, AI slop (excessive comments, over-abstraction, generic names). Confirm `requireEnv`/`optionalEnv` usage in any new worker-tool/env reads; `sendError`/`sendSuccess` in new gateway routes.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Full real-user journey E2E on BOTH envs** — `unspecified-high` (+ Playwright via CDP)
      Start from clean state. Run the COMPLETE journey on **LOCAL and CLOUD** profiles: real-browser login (email/pw AND Google) at `localhost:7700/dashboard/`; unauthenticated redirect to login; membership-driven tenant switcher; deactivation → next-request lockout with a still-valid token; role-change immediate effect; full authz-matrix curls (own 200 / other 403 / none 401 / wrong-role 403); SERVICE_TOKEN curls; key-model wire check (`apikey: publishable` accepted, `Bearer publishable` rejected); `grep`-zero admin-key check; bootstrap idempotency (both envs); invitation lifecycle — LOCAL full accept via Mailpit, CLOUD invite-create assertion; RLS-via-PostgREST curl (anon denied on `users`/`tenant_secrets`) on both envs. Worker/task-lifecycle smoke is LOCAL only. Save to `.sisyphus/evidence/final-qa/{local,cloud}/`.
      Output: `Local [N/N] | Cloud [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything specified built, nothing beyond spec. Confirm "Must NOT do" compliance per task. Detect cross-task contamination and unaccounted changes (especially that webhooks/`/internal`/OAuth/worker-PostgREST are untouched).
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

- [x] F5. **Docs Freshness** — `writing`
      Per AGENTS.md Documentation Freshness: update AGENTS.md (new auth model, new key model publishable/secret, SERVICE_TOKEN, removed ADMIN_API_KEY, new models, new endpoints, dual-env profiles), README.md (new scripts, new admin/auth endpoints, env changes), and create `docs/guides/{ts}-user-auth-rbac.md` + a cloud-setup section (provider/redirect config, pooler/port for migrate vs runtime, the deferred Resend/SMTP step, the deferred worker-against-cloud step). Verify `.env`/`.env.example` in sync per the env conventions (both env profiles documented; secrets only in `.env`). Confirm zero stale references to `ADMIN_API_KEY` in docs. Note the recommended secret/DB-password rotation + duplicate-project deletion.
      Output: `Docs updated [list] | Env in sync [Y/N] | VERDICT`

- [x] F6. **Cleanup + Notify** — `quick`
      Kill all `ai-*` tmux sessions created during execution. Run `git status --short` and confirm clean per AGENTS.md Git Cleanup. Send Telegram: `tsx scripts/telegram-notify.ts "✅ Multi-tenant user auth & RBAC complete — all tasks done. Come back to review."`
      Output: `tmux [clean] | git [clean] | Telegram [sent]`

---

## Commit Strategy

> Commit per logical group at wave boundaries. Conventional commits. Never `--no-verify`. No AI/Co-authored-by lines.

- Wave 0: `chore(auth): add authz matrix, supabase config + dual-env/key-model spike notes`
- Wave 1: `feat(auth): add user/membership/invitation models, dual-env config, cloud provisioning`
- Wave 2: `feat(auth): add env-aware jwt verify, authz helpers, supabase-managed lifecycle endpoints`
- Wave 3: `feat(auth): apply role-based authz, gateway read endpoints, bootstrap owner, opaque-key classifier fix`
- Wave 4: `refactor(auth): migrate machine callers to SERVICE_TOKEN and remove ADMIN_API_KEY`
- Wave 5: `feat(dashboard): add supabase login, auth context, tenant switcher, member management`
- Final: `docs(auth): document user auth & rbac, new key model, dual-env + cloud setup`

---

## Success Criteria

### Verification Commands

```bash
# Auth: signup yields a JWT — LOCAL (HS256)
curl -s -X POST "http://localhost:54331/auth/v1/signup" -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{"email":"owner@test.com","password":"Test1234!"}' | jq '.access_token != null'  # Expected: true

# Auth: signup yields a JWT — CLOUD (ES256)
curl -s -X POST "https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/signup" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" -d '{"email":"owner@test.com","password":"Test1234!"}' | jq '.access_token != null'  # Expected: true

# New-key contract: Bearer-publishable rejected, apikey-publishable accepted (cloud)
curl -s -o /dev/null -w "%{http_code}\n" "https://gjqrysxpvktmibpkwrvy.supabase.co/rest/v1/tenants?limit=1" -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"  # Expected: 401

# Admin key fully removed (active code)
grep -rn "X-Admin-Key\|ADMIN_API_KEY" src dashboard scripts docs .env.example --exclude-dir=archive | wc -l  # Expected: 0

# Bootstrap idempotency (local)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -tc "SELECT count(*) FROM users WHERE role='PLATFORM_OWNER';"  # Expected: 1

# Build/lint/test
pnpm build && pnpm lint && pnpm test  # Expected: pass
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All task QA scenarios pass with evidence (both env folders where applicable)
- [x] Real-browser login E2E passes on LOCAL and CLOUD
- [x] Per-wave E2E checkpoints all passed
- [x] User approves Final Verification Wave
