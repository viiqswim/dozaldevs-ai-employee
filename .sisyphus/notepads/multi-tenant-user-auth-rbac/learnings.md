# Learnings — multi-tenant-user-auth-rbac

## [2026-06-09] Plan initialized

- Active compose file: `docker/supabase-services.yml` (NOT `docker/docker-compose.yml`)
- Auth container confirmed running: `ai-employee-auth`
- Cloud project: `gjqrysxpvktmibpkwrvy` (us-west-2)
- Publishable key: `sb_publishable_tsF3KzF5nUBhtC5nwhl17w_W0ooWpW2`
- Keep env var NAMES same (`SUPABASE_ANON_KEY` = publishable value, `SUPABASE_SECRET_KEY` = secret)
- Worker data path already env-driven — no code changes needed, just env values
- `TenantSecretRepository.delete()` is a hard delete — do NOT copy for memberships/invitations
- Supabase ban ≠ immediate lockout; app `users.status` per-request check is the immediate mechanism
- `src/lib/interaction-classifier.ts:87-88` sends `apikey: ANON` + `Bearer: SECRET` — must fix for opaque keys

## [2026-06-09] T0b — Authz matrix authored

- `requireAdminKey` protects **56 endpoints across 18 route files** (74 grep hits = 18 imports + 56 guards).
- **5 GLOBAL (non-tenant-scoped) endpoint groups** → assigned `PLATFORM_OWNER`: `POST /admin/tenants`, `GET /admin/tenants`, all `/admin/model-catalog*`, all `/admin/platform-settings*`, all `/admin/tools*`. These have no `:tenantId` so membership checks don't apply — superadmin only.
- **Secrets + integration link/disconnect → OWNER** (not ADMIN): `tenant-secrets` GET/PUT/DELETE, `github/link-installation`, `integrations/github` DELETE, `integrations/google` DELETE. Rationale: they read/write `tenant_secrets` (credentials).
- **Read endpoints elevated to ADMIN** (not VIEWER) when they leak credentials/structure: `brain-preview` (exposes secret KEY inventory + env manifest), `slack/channels`, `github/repos`, `github/available-installations` (exercise live integration tokens).
- **`employees/:slug/trigger` = MEMBER** but FLAGGED — triggering has cost + external side-effects; PM may want ADMIN. Default MEMBER per plan.
- Non-mutating POSTs (`recommend-model`, `generate`, `compile-preview`) gated at ADMIN as part of authoring workflow, not because they mutate.
- `admin-projects.ts` is deprecated (engineering employee) but still live under `requireAdminKey` — included for completeness.
- No `requireAdminKey` route is SERVICE_TOKEN or PUBLIC. Service routes (`/tasks/:taskId/{github,google}-token`) and OAuth/webhook/health routes don't use the middleware → out of scope.
- Matrix file: `.sisyphus/notepads/multi-tenant-user-auth-rbac/authz-matrix.md`; coverage evidence: `.sisyphus/evidence/local/task-0b-matrix-coverage.txt`.

## [2026-06-09] T0E2E Wave-0 Checkpoint Results

- LOCAL gateway: ✅ 200 OK (`{"status":"ok"}`)
- LOCAL PostgREST: ✅ 200 OK (anon key accepted)
- LOCAL Auth: ✅ 200 OK (`{"status":"ok"}`)
- LOCAL JWT alg: ✅ HS256 (confirmed — signup returns `has_access_token: true, alg: "HS256"`)
- LOCAL Admin key: ✅ 200 OK (dual-accept baseline confirmed)
- CLOUD Auth health (with publishable apikey): ✅ 200 OK (`GoTrue v2.189.0`)
- CLOUD JWKS alg: ✅ ES256 (kid: `1df77847-802f-46b6-92a9-5f9ed42a5e21`)
- CLOUD publishable key (apikey to `/rest/v1/tenants`): ✅ 200 OK — data returned
- CLOUD publishable key (apikey to `/rest/v1/` root): ❌ 401 — root requires secret key (expected, management endpoint)
- CLOUD publishable key (Bearer): ✅ 401 — correctly rejected (opaque key model confirmed)
- CLOUD auth signup: ✅ Functional (rate-limited on repeated calls, email domain validation active)

### Key Findings

1. **Cloud REST root (`/rest/v1/`) requires secret key** — this is expected Supabase behavior; the root is a management endpoint. Data table endpoints (`/rest/v1/tenants`) accept the publishable key fine.
2. **Cloud auth health requires apikey header** — unlike local Kong which has `/auth/v1/health` as an open route, Supabase Cloud requires `apikey` for health too.
3. **JWKS endpoint is open** — no apikey needed for `/.well-known/jwks.json` on cloud.
4. **Cloud signup email validation** — cloud project has email domain restrictions (rejects `@test.com`, `@example.com`; rate-limits `@gmail.com`). For E2E cloud auth tests, use the Supabase dashboard to create test users directly.
5. **Dual-accept baseline confirmed** — local admin key still returns 200 (no regression from Wave 0 spike work).

### Evidence Files

- `.sisyphus/evidence/local/task-0e2e-local-connectivity.txt`
- `.sisyphus/evidence/cloud/task-0e2e-cloud-connectivity.txt`

## [2026-06-09] T1 Prisma Models

- Added enums: Role (PLATFORM_OWNER/ADMIN/EDITOR/USER/VIEWER), TenantRole (OWNER/ADMIN/MEMBER/VIEWER)
- Added models: User, TenantMembership, TenantInvitation
- All three models have deleted_at for soft-delete
- TenantMembership uses composite PK [tenant_id, user_id]
- TenantInvitation.token is @unique for secure lookup
- Back-relations added to Tenant model (memberships, invitations)
- schema.prisma timestamps use @db.Timestamptz(6) on new models (consistent with FeedbackEvent/EmployeeRule patterns)
- pnpm prisma validate passes before and after pnpm prisma format (idempotent)
- Evidence: .sisyphus/evidence/local/task-1-prisma-validate.txt

## [2026-06-09] T2 Migration Applied

- Migration name: `20260609000000_add_user_auth_rbac`
- Tables created: `users`, `tenant_memberships`, `tenant_invitations`
- Enums created: `Role` (PLATFORM_OWNER, ADMIN, EDITOR, USER, VIEWER), `TenantRole` (OWNER, ADMIN, MEMBER, VIEWER)
- PostgREST schema reloaded via `NOTIFY pgrst, 'reload schema'`
- All three tables accessible via PostgREST (returns `[]` not PGRST205)

### DB Baseline Issue (IMPORTANT for future tasks)

- `_prisma_migrations` table did NOT exist — DB was set up outside Prisma
- `prisma migrate dev` fails due to RLS on `_prisma_migrations` (shadow DB can't read its own tracking table)
- Workaround: manually created `_prisma_migrations`, inserted 58 baseline records, created migration file manually, applied via psql, registered in tracking table
- `prisma migrate deploy` (not `migrate dev`) is the correct command for this repo going forward
- Evidence: `.sisyphus/evidence/local/task-2-psql-tables.txt`, `.sisyphus/evidence/local/task-2-postgrest-tables.txt`

## [2026-06-09] T3 Supabase Auth Config

- GOTRUE_SITE_URL corrected to http://localhost:7700/dashboard/ (was http://localhost:3000)
- GOTRUE_URI_ALLOW_LIST set to http://localhost:7700/dashboard/\*\*,http://localhost:7700/dashboard/auth/callback
- Google OAuth vars added to compose file (env-driven, disabled by default)
- Google redirect URI: http://localhost:54331/auth/v1/callback (Kong port)
- Email/password signup still works after recreate — returns JWT ✓
- Google authorize returns 400 when GOTRUE_EXTERNAL_GOOGLE_ENABLED=false (expected)
- CRITICAL: `docker compose restart` does NOT re-read env vars — must use `up -d --force-recreate auth`

## [2026-06-09] T4 SERVICE_TOKEN

- Added SERVICE_TOKEN to .env, .env.example, src/lib/config.ts
- Uses lazy getter pattern `(): string => requireEnv('SERVICE_TOKEN')` (throws at call time if missing, not at import time)
- NOT exposed to browser or /api/config.js
- Auth resolution order: SERVICE_TOKEN → Supabase JWT → legacy ADMIN_API_KEY (per Oracle T0c)
- Header: Authorization: Bearer <token> (distinguish from JWTs by structure — JWTs have 3 dot-separated segments)
- .env.example section: Platform Core (after ADMIN_API_KEY)
- config.ts pattern: lazy getter (same as ADMIN_API_KEY, ENCRYPTION_KEY) — not eager like INNGEST_EVENT_KEY

## [2026-06-09] T7 RLS Backstop

- RLS enabled on: users, tenant_memberships, tenant_invitations
- anon role: no SELECT policy = returns [] (empty) for all three tables
- service_role: full access via explicit policy (Prisma/gateway uses service_role)
- RLS is defense-in-depth only — gateway (Prisma) is the real auth boundary
- No authenticated-role policies added (gateway is the boundary, not RLS)

## [2026-06-09] T6 ROLE_PERMISSIONS

- PERMISSIONS const: 16 named permissions (3 platform-level + 13 tenant-level)
- ROLE_PERMISSIONS: global Role → Set<Permission> (5 roles: PLATFORM_OWNER, ADMIN, EDITOR, USER, VIEWER)
- TENANT_ROLE_PERMISSIONS: TenantRole → Set<Permission> (4 roles: OWNER, ADMIN, MEMBER, VIEWER)
- PLATFORM_OWNER has all permissions (Object.values(PERMISSIONS) spread into Set)
- VIEWER has read-only (READ_TENANT, READ_TASKS) — no write permissions
- USER can trigger employees (READ_TENANT, TRIGGER_EMPLOYEE, READ_TASKS)
- EDITOR can manage archetypes/rules/KB but cannot trigger employees
- ADMIN can manage archetypes/rules/KB/locks/projects + invite, but not manage tenants
- TenantRole OWNER has all tenant permissions including DELETE_TENANT, MANAGE_SECRETS, MANAGE_INTEGRATIONS, MANAGE_MEMBERS
- TenantRole ADMIN can invite but not delete tenant or manage secrets/integrations
- TenantRole MEMBER can trigger employees (READ_TENANT, TRIGGER_EMPLOYEE, READ_TASKS)
- TenantRole VIEWER read-only (READ_TENANT, READ_TASKS)
- Files: src/lib/auth/permissions.ts, src/lib/auth/index.ts (barrel), tests/unit/auth/permissions.test.ts
- 17 tests pass, all green

## [2026-06-09] T5 Auth Types

- Created src/lib/auth/types.ts with: SupabaseJwtClaims, AuthenticatedUser, TenantContext
- Express request augmentation: req.auth, req.tenantContext, req.isServiceToken
- SupabaseJwtClaims is identity-only (no tenant/membership fields)
- Re-exports Role and TenantRole from @prisma/client
- Barrel: src/lib/auth/index.ts (already existed, exports types.ts + permissions.ts)
- NOTE: src/lib/auth/ already had index.ts and permissions.ts from a prior task
- Prisma client must be generated (pnpm prisma generate) for Role/TenantRole to be available
- LSP may show stale errors on @prisma/client imports — pnpm build (tsc) is the ground truth

## [2026-06-09] Task C — Cloud DB Provision

- Migration `20260609000000_add_user_auth_rbac` applied to cloud DB via Supabase SQL Editor (browser)
- Direct psql/prisma connections to cloud pooler fail: `FATAL: (ENOTFOUND) tenant/user postgres.gjqrysxpvktmibpkwrvy not found`
  - Affects all pooler regions (us-west-2, us-east-1, eu-west-1) on both port 5432 and 6543
  - Root cause: `db.gjqrysxpvktmibpkwrvy.supabase.co` is IPv6-only (no A record); Supavisor doesn't route to this tenant
  - Workaround: Use Supabase dashboard SQL Editor (authenticated browser session already available via victordozal@)
- Tables `users`, `tenant_memberships`, `tenant_invitations` verified returning `[]` via cloud Data API
- Tenants seeded: DozalDevs (`00000000-0000-0000-0000-000000000002`), VLRE (`00000000-0000-0000-0000-000000000003`)
  - A third tenant Snobahn (`00000000-0000-0000-0000-000000000004`) was already seeded in cloud — left as-is
- Auth providers: Email ✅ (already enabled), Google ✅ (enabled with GOOGLE_CLIENT_ID/SECRET from .env)
- Redirect allow-list: Site URL = `http://localhost:7700/dashboard/` (was `localhost:3000`); 3 redirect URLs added
- Evidence: `.sisyphus/evidence/cloud/task-C-provision.txt`

## [2026-06-09] T3b — Dual-env config layer

- `detectEnvProfile()` and `assertEnvProfile()` added to `src/lib/config.ts`
- `SUPABASE_JWKS_URL` lazy getter added: `() => \`\${SUPABASE_URL()}/auth/v1/.well-known/jwks.json\``
- `assertEnvProfile()` called as first line of `buildApp()` in `src/gateway/server.ts` (before `validateEncryptionKey()`)
- Detection heuristic: eyJ prefix = LOCAL (HS256 JWT), sb\_ prefix = CLOUD (opaque publishable key)
- `.env.example` Supabase section now shows both LOCAL and CLOUD profile examples with placeholders
- Build passes zero errors; 1612 tests pass, 9 skipped

## [2026-06-09] T1E2E Wave-1 Checkpoint Results

- LOCAL signup + login: ✅ both return JWT; header decodes to `{"alg":"HS256","typ":"JWT"}`
- LOCAL tables via PostgREST (anon key): ✅ `users`, `tenant_memberships`, `tenant_invitations` all return `[]` (no PGRST205)
- CLOUD admin-create + login: ✅ JWT header decodes to `{"alg":"ES256","kid":"1df77847-802f-46b6-92a9-5f9ed42a5e21","typ":"JWT"}`
- CLOUD tables via Data API (secret key): ✅ all three return `[]`

### Key Findings / Reusable Wisdom

1. **`python3` is BLOCKED by asdf** in this repo (no version set in `.tool-versions` → "No version is set for command python3"). For JWT header decoding, use `echo "$JWT" | cut -d. -f1 | base64 -d` instead of python3. Base64 std-decode works fine for JWT headers (URL-safe alphabet only differs for `-`/`_`; headers rarely contain them).
2. **LOCAL mailer autoconfirm = true** confirmed again — signup returns `email_confirmed_at` immediately, login works without any email step.
3. **CLOUD signup email validation** rejects `@example.com`; Admin API (`POST /auth/v1/admin/users` with `email_confirm:true`, secret key as both apikey + Bearer) is the reliable path — worked first try.
4. **CLOUD login uses publishable key as apikey** (`sb_publishable_...`), Data API reads use secret key (`sb_secret_...`) as both apikey + Bearer. Both confirmed working.
5. **alg split confirmed end-to-end**: LOCAL=HS256 (symmetric shared secret), CLOUD=ES256 (asymmetric ECC, kid `1df77847-802f-46b6-92a9-5f9ed42a5e21`). This is the dual-env JWT verification contract for T3b's `SUPABASE_JWKS_URL` work.

### Evidence Files

- `.sisyphus/evidence/local/wave1/jwt-and-tables.txt`
- `.sisyphus/evidence/cloud/wave1/jwt-and-tables.txt`

## [2026-06-09] T8 — verify-jwt

- `jose` v6.2.3 installed as production dependency
- `verifySupabaseJwt(token)` in `src/lib/auth/verify-jwt.ts`:
  - LOCAL path: `jwtVerify(token, TextEncoder.encode(secret), { algorithms: ['HS256'] })` — secret from `GOTRUE_JWT_SECRET` env var (fallback: local dev default)
  - CLOUD path: `jwtVerify(token, createRemoteJWKSet(new URL(SUPABASE_JWKS_URL())), { algorithms: ['ES256'] })`
  - Post-verify: throws `'JWT missing sub claim'` if `payload.sub` is falsy
- Unit test pattern: `vi.mock('../../../src/lib/config.js', async (importOriginal) => ...)` spreads the real module then overrides `detectEnvProfile` — the hoisted import of `verifySupabaseJwt` must come AFTER the mock declaration
- 4 tests all green; build zero errors
- Evidence: `.sisyphus/evidence/local/task-8-verify-jwt.txt`

## T10 — ensureUserExists upsert (2026-06-09)

- Prisma User model uses `supabase_id` (snake_case, no @map) — upsert key is `{ supabase_id: claims.sub }`
- Return type maps `supabase_id → supabaseId` and `role → globalRole` to match `AuthenticatedUser`
- `supabase_id` is nullable (`String?`) but `@unique`; Prisma upsert works correctly with nullable unique fields
- Concurrent calls with same `supabase_id` are handled atomically by PostgreSQL's ON CONFLICT via Prisma upsert
- After T1 schema migration adds User model, `pnpm prisma generate` must be re-run; the pnpm symlink
  `.prisma/client` must exist inside `@prisma/client` for TypeScript LSP to see new types
  (tsc/build resolves correctly via the pnpm virtual store even without the symlink)
- Integration test pattern: `afterEach` cleans test rows by `supabase_id`; `afterAll` disconnects Prisma
- Evidence: `.sisyphus/evidence/local/task-10-ensure-user.txt`

## [2026-06-09] T9 — auth middleware

- Created `src/gateway/middleware/auth.ts` exporting `authMiddleware` (async Express middleware)
- Resolution order: SERVICE_TOKEN → Supabase JWT → legacy X-Admin-Key
- SERVICE_TOKEN path: `try { SERVICE_TOKEN() } catch { '' }` — graceful when env var not set (avoids throwing at middleware load)
- JWT path: `verifySupabaseJwt()` + `ensureUserExists()` → `user.status !== 'active'` → 403; success → `req.auth = user`
- Legacy admin key path: `req.isServiceToken = true` (service-level), marked "remove in T24"
- `sendError` signature: `sendError(res, status, code, message?, extra?)` — code is machine-readable string, not numeric
- `AuthenticatedUser` has NO `deleted_at` field — only `status: string` is the deactivation mechanism
- Flaky test: `admin-tenant-secrets.test.ts > DELETE 404 when tenant not found` gets `socket hang up` intermittently when run in parallel with the full suite; passes in isolation and on re-run. Pre-existing race condition unrelated to T9.
- `pnpm build` zero errors; `pnpm test:unit` 1616 passed, 9 skipped (confirmed clean)

## [2026-06-09] T11 — authz middleware

- Created `src/gateway/middleware/authz.ts` with `requireAuth`, `requireTenantRole`, `requirePermission`
- `requireAuth` is a plain middleware (not a factory); `requireTenantRole` and `requirePermission` are factories returning `RequestHandler`
- Prisma client instantiated at module level (`new PrismaClient()`) matching the pattern used in `ensure-user-exists.ts` and other gateway services — no shared singleton
- `req.params['tenantId']` with bracket notation + `as string` cast needed to avoid `string | string[]` type error in Express params
- Role ordering: OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1); `requireTenantRole(ADMIN)` means ADMIN or higher (OWNER satisfies it)
- Vitest hoisting: `vi.mock` factories are hoisted before module-level `const` declarations; use `vi.hoisted(() => ({ fn: vi.fn() }))` to define mock state shared across the module and the mock factory
- `getMockedFindFirst()` anti-pattern creates a new PrismaClient instance (different from the one in the SUT); use a hoisted shared `mockFindFirst` fn instead
- `admin-github.test.ts` has a flaky test ("returns 401 when X-Admin-Key header is missing") that intermittently fails but is NOT caused by authz changes — confirmed by stash test
- Build: `pnpm build` is ground truth; LSP errors on `@prisma/client` exports (Role, TenantRole) are stale and can be ignored

## [2026-06-09] T12★ — deactivation enforcement

- `ensure-user-exists.ts` upsert does NOT reset `status` on update — only `email` is updated; safe to add `deleted_at` check after upsert
- `authMiddleware` catch block at line 53 catches any throw from `ensureUserExists` and returns 401 `INVALID_TOKEN` — correct channel for soft-deleted user responses (don't reveal user exists)
- Integration test uses `vi.mock` for `verifySupabaseJwt` + direct `authMiddleware` call (no HTTP) — clean way to test DB-level immediacy without Supabase Auth running
- Supabase Admin API ban endpoint: `PUT /auth/v1/admin/users/:supabase_id` — guard `user.supabase_id` nullability before calling
- `req.params['userId'] as string` needed (vs destructuring) due to TS type resolution issue in multi-middleware Express routes
- `users.status='disabled'` check (in `auth.ts`) is the primary immediate lockout; Supabase ban is belt-and-suspenders for token refresh blocking

## [2026-06-09] T13 — /me endpoints

- Created `src/gateway/routes/me.ts` exporting `meRoutes(opts)` factory with `prisma?` DI option (matches `adminTasksRoutes` pattern); registered in `server.ts` as `app.use(meRoutes({ prisma }))` right after `adminUsersRoutes()`
- `GET /me`: service token → synthetic `{ id:null, email:null, name:null, globalRole:'SERVICE', status:'active' }`; user → `{ id, email, name, globalRole, status }` from `req.auth`
- `GET /me/tenants`: PLATFORM_OWNER → all `tenant.findMany({ where:{ deleted_at:null } })` mapped with `tenantRole:'OWNER'`; regular user → `tenantMembership.findMany({ where:{ user_id, deleted_at:null }, include:{ tenant } })`, then JS-filter `m.tenant.deleted_at === null` (defends against soft-deleted tenant with live membership row)
- Both routes use real `authMiddleware` + real `requireAuth` chain; `requireAuth` is the genuine 401 source (pure guard, no DB)
- Test strategy: `vi.mock` the `authMiddleware` module to set `req.auth`/`req.isServiceToken` from a module-level `currentAuth` var; use real `requireAuth`; inject mock prisma via `meRoutes({ prisma })`. Top-level `await import()` of the SUT AFTER the `vi.mock` declaration (mock is hoisted, dynamic import resolves after).
- 9 tests cover: /me user, /me service, /me 401, /me/tenants regular-user (+ asserts findMany where-clause), soft-deleted-tenant filter, PLATFORM_OWNER all-tenants (+ asserts membership query NOT called), /me/tenants service→[], /me/tenants 401, 500 on prisma throw
- Comments: removed all explanatory comments per hook + codebase style (`admin-tasks.ts` has none); code is self-documenting via guard clauses + route paths
- LSP showed stale `@prisma/client` Role/tenantMembership errors (same as T5/T11); `pnpm build` exits 0 = ground truth. `pnpm test:unit` 1643 passed, 9 skipped, 0 failures

## [2026-06-09] T14 — member endpoints

- `TenantMembership` schema field is `joined_at` (not `created_at`) — critical for `orderBy` and response mapping
- Pre-existing LSP false-positives: `TenantRole` and `Role` from `@prisma/client` show as missing exports across the entire codebase; this is a stale LSP index, not a real error — `pnpm build` (tsc) succeeds cleanly
- `prisma.tenantMembership` also shows as non-existent on LSP; used `as unknown as PrismaWithMembership` type alias to work around while keeping type safety in tests via mock
- Last-owner guard requires two queries: `count` (OWNER slots) + `findFirst` (target membership role) — must be atomic enough for test mocking
- `requireTenantRole(TenantRole.ADMIN, TenantRole.OWNER)` passes if user rank >= min(ADMIN, OWNER) = ADMIN rank (3); MEMBER (2) and VIEWER (1) are blocked
- Route param extraction pattern: `req.params['tenantId'] as string` (not destructuring) — avoids `string | string[]` TypeScript error
- `sendSuccess(res, 204)` (no body arg) triggers `res.status(204).end()` — correct for DELETE no-content
- Test mock for `requireTenantRole` needs to replicate rank logic since it's a higher-order function returning an async middleware; the module-level `tenantMembershipForAuthz` state variable pattern (same as `currentAuth` in `me.test.ts`) keeps tests clean

## [2026-06-09] T15★ — invitation endpoints

- `TenantInvitation` has no `deleted_at` field — queries don't filter by it (unlike most other tables)
- Status timestamps `accepted_at`, `declined_at`, `revoked_at` exist on `TenantInvitation` and should be updated alongside `status`
- Supabase Admin API invite: `POST /auth/v1/admin/users` with `{ email, email_confirm: false, invite: true }` — 422 means user already in auth, treat as success
- Accept endpoint uses `prisma.$transaction(..., { isolationLevel: 'Serializable' })` for race-safety; tx callback receives a typed tx object
- The `PrismaWithInvitation` type pattern (cast via `prisma as unknown as`) is needed because `User` and `TenantInvitation` models are recently added and LSP may lag behind actual Prisma client generation
- Run `pnpm prisma generate` after any schema changes — the LSP will show stale errors until regenerated
- Accept/decline endpoints require no auth (user may not be authenticated when clicking the magic link)
- `vi.stubGlobal('fetch', mockFetch)` at module level works for mocking global `fetch` in Vitest; reset via `mockFetch.mockReset()` in `beforeEach`
- Test structure: share mock factory with optional overrides; override `transaction` entirely for accept endpoint tests

## [2026-06-09] T2E2E Wave-2 Checkpoint Results

### LOCAL (HS256, gateway local profile) — ALL PASS

- Authz matrix (GET /admin/tenants/:id/members): own-OWNER 200 / non-member 403 / unauth 401 / wrong-role VIEWER 403 "Insufficient role" / cross-tenant 403 / garbage Bearer 401. All correct.
- Deactivate lockout: 200 active → PATCH deactivate (SERVICE_TOKEN) 200 → DB status='disabled' → SAME JWT 403 ACCOUNT_DISABLED on /me AND tenant endpoint (immediate).
- /me + /me/tenants: owner /me 200; /me/tenants owner=[DozalDevs/OWNER] (exactly 1); nonmember=[]; unauth 401; SERVICE synthetic {globalRole:SERVICE} + /me/tenants [].
- Invite full flow: POST invitations (owner JWT) 201 → auth.users provisioned → /invitations/accept 200 → invitation status='accepted'+accepted_at → tenant_memberships row (MEMBER) created → /me/tenants confirms → re-accept 410 ALREADY_USED (idempotent).

### CLOUD (ES256, gateway CLOUD Supabase profile + LOCAL DB for Prisma state) — ALL PASS

- Authz matrix (real cloud ES256 JWTs): own-OWNER 200 / non-member 403 / unauth 401 / wrong-role VIEWER 403 / cross-tenant 403 / LOCAL-HS256-token-vs-cloud-gateway 401 (alg enforcement) / garbage 401.
- Deactivate lockout: cloud ES256 viewer 200 → deactivate 200 (real cloud Auth admin PUT landed — cloud updated_at advanced) → status='disabled' → SAME ES256 JWT 403 ACCOUNT_DISABLED.
- /me + /me/tenants (cloud ES256): owner /me 200; /me/tenants=[DozalDevs/OWNER]; nonmember []; unauth 401; SERVICE synthetic.
- Invite create-only: POST invitations (cloud owner ES256 JWT) 201; (2A) real cloud auth.users invited state confirmed (invitee exists, confirmed_at=null, sub e5d42c08...); (2B) TenantInvitation row INSERT+SELECT in REAL cloud DB via Data API (201 + readable 200).

### Key Findings / Reusable Wisdom

1. **Kong port is 54331, NOT 54321** in this local setup (task instructions said 54321, which returns 000). `docker port ai-employee-kong` → 8000→54331. Auth=http://localhost:54331/auth/v1, REST=http://localhost:54331/rest/v1. AGENTS.md README port table also lists Kong=54321 — but the running container maps to 54331. The PostgREST/Pooler row (54331) is the one actually serving Kong here.
2. **ENDPOINT CONTRACT**: GET /admin/tenants/:tenantId uses LEGACY requireAdminKey (X-Admin-Key), NOT the JWT RBAC chain — a JWT 401s there. The correct JWT-protected tenant-scoped test endpoint is **GET /admin/tenants/:tenantId/members** (authMiddleware → requireAuth → requireTenantRole(ADMIN,OWNER)). Dual-accept confirmed: members=JWT, tenants=admin-key.
3. **Local GOTRUE_JWT_SECRET matches gateway fallback** exactly (`super-secret-jwt-token-with-at-least-32-characters-long`) — confirmed via `docker exec ai-employee-auth env | grep JWT`. So local HS256 JWTs verify without setting GOTRUE_JWT_SECRET in .env.
4. **Gateway startup requires platform_settings table** — validateRequiredPlatformSettings() aborts startup (P2021) if missing. This local DB lacked it; applied migration table + seeded 9 settings via psql (NOT migrate dev). Also lacked tenants — seeded DozalDevs(...0002)+VLRE(...0003).
5. **Cloud DB is Prisma-unreachable** (confirmed again): pooler `FATAL (ENOTFOUND) tenant/user postgres.gjqrysxpvktmibpkwrvy not found`; direct host IPv6 `No route to host`. Strategy for cloud gateway authz E2E: run gateway with CLOUD SUPABASE auth profile (real ES256 JWKS) + DATABASE_URL=LOCAL for Prisma state, keyed by cloud `sub`. Inline env vars OVERRIDE `--env-file=.env` in `tsx --env-file`.
6. **Cloud Data API insert needs explicit `id`** — tenant_invitations.id has NO DB default (Prisma generates UUID client-side). POST via Data API without id → 23502 not-null violation. Supply crypto.randomUUID().
7. **deactivate-user.ts ban_duration:'none' is a NO-OP** (not an actual ban) — the immediate lockout is purely the app `users.status='disabled'` per-request check. The cloud Auth admin PUT still fires (proven by cloud auth updated_at advancing).
8. **Gateway launch in tmux**: `tsx` not on PATH in tmux zsh (asdf shim issue) — use `./node_modules/.bin/tsx`. Disable Slack via empty SLACK_SIGNING_SECRET/APP_TOKEN/CLIENT_ID/CLIENT_SECRET to avoid Bolt OAuth init crash + Socket Mode lock contention.
9. **ensureUserExists pattern**: hitting /me with a fresh Supabase JWT auto-creates the app `users` row (upsert by supabase_id=sub). Must do this BEFORE seeding tenant_memberships (FK to users.id).

### Evidence Files

- .sisyphus/evidence/local/wave2/{SUMMARY,authz-matrix,deactivate,me-endpoints,invite-accept}.txt
- .sisyphus/evidence/cloud/wave2/{authz-matrix,deactivate,me-endpoints,invite-create}.txt

## T16 Completion — 2026-06-09

### All 18 route files updated

All `requireAdminKey` replaced with `authMiddleware + requireAuth + requireTenantRole/requirePermission` per the authz matrix.

### Additional test files discovered

Beyond the 6 test files in `tests/unit/gateway/routes/`, there are 3 more in `src/gateway/routes/__tests__/` that also needed mock blocks:

- `src/gateway/routes/__tests__/admin-archetypes-create.test.ts`
- `src/gateway/routes/__tests__/admin-model-catalog.test.ts`
- `src/gateway/routes/__tests__/admin-slack-channels.test.ts`

These use relative mock paths (`../../../gateway/middleware/auth.js`) vs the `tests/unit/` files which use (`../../../../src/gateway/middleware/auth.js`).

### Mock path convention

- `tests/unit/gateway/routes/*.test.ts` → `../../../../src/gateway/middleware/auth.js`
- `src/gateway/routes/__tests__/*.test.ts` → `../../../gateway/middleware/auth.js`

### Final verification

- `pnpm build` → exit 0
- `pnpm test:unit` → 144 files, 1689 passing, 0 failures
- `git diff --name-only` → 18 route files + 9 test files (all in scope)

## [2026-06-09] T19b — interaction-classifier.ts PostgREST header fix

- `getPostgrestHeaders()` in `src/lib/interaction-classifier.ts` was using `apikey: SUPABASE_ANON_KEY()` + `Authorization: Bearer SUPABASE_SECRET_KEY()`.
- Under the new Supabase opaque key model, `sb_secret_*` keys are NOT JWTs — they cannot be used as Bearer tokens. Supabase Cloud rejects `Authorization: Bearer sb_secret_*`.
- Fix: use `apikey: SUPABASE_SECRET_KEY()` only (no Authorization header). This is the correct server-side PostgREST pattern.
- Also removed the now-unused `SUPABASE_ANON_KEY` import from the file.
- Pre-existing test failure: `socket-mode-lock.test.ts` (1 test) fails due to a race condition — confirmed pre-existing before this change, not a regression.

## UserRepository (T11)

- Created `src/repositories/user-repository.ts` following `TenantRepository` pattern exactly
- `list(tenantId, opts?)` uses `memberships: { some: { tenant_id, deleted_at: null } }` to scope users to a tenant via the join table
- `restore()` does NOT check for email collisions (unlike `TenantRepository.restore()` which checks slug collisions) — email uniqueness is enforced by DB constraint
- LSP errors on `prisma.user` and `User` type are stale (Prisma client not regenerated in LSP context) — `pnpm build` is ground truth and exits 0
- `softDelete()` is idempotent: returns existing record if already deleted
- No `create()` method — users are created via `ensureUserExists` (Supabase auth flow)

## [2026-06-09] T21 — gateway read endpoints (admin-reads.ts)

- Created `src/gateway/routes/admin-reads.ts` — 11 tenant-scoped GET endpoints replacing the dashboard's direct PostgREST reads (which break under opaque `sb_publishable_*` keys via `Bearer`).
- **CRITICAL registration order**: `adminReadsRoutes` MUST be registered BEFORE `adminTasksRoutes` in `server.ts`. Both define `GET /admin/tenants/:tenantId/tasks/:id`. Express matches first-registered; the richer detail handler in admin-reads (with embeds) must win. The SSE `/tasks/:id/logs` route has a different segment count → still resolves to `adminTasksRoutes`. Param name differs (`:taskId` here vs `:id` in admin-tasks) but Express matches on path SHAPE not param name, so the shadow is real and order is the only guard.
- **PostgREST embed key vs Prisma relation name**: dashboard reads `task.archetypes` (object) + `task.executions` (array). PostgREST embeds a to-one relation under the TABLE name (`archetypes`, plural); Prisma exposes it under the SINGULAR relation name (`archetype`). Must remap `archetype` → `archetypes` in the response. Used `Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>` for the remap fn param type — a bare generic `<T extends {archetype:unknown}>` does NOT infer through `Array.map` and fails tsc.
- **Tables without tenant_id** — scope via relation traversal in the `where`:
  - `deliverables`: no `tenant_id` AND no `task_id`. Scope via `execution: { task: { tenant_id } }`. Dashboard queries by `external_ref=eq.${taskId}` (external_ref holds the task id), so `?task_id=` maps to `external_ref`, NOT `task_id`.
  - `executions`: no `tenant_id`. Scope via `task: { tenant_id }`. Heavy `session_transcript` field gated behind `?id=` (single-execution transcript view) to match dashboard's lean list select.
  - `task_status_log`: no `tenant_id`. Scope via `task: { id, tenant_id }`.
- **PostgREST query param → Prisma mapping**: dashboard sends `order: 'created_at.asc'` / `.desc`; parse the `.asc`/`.desc` suffix. `limit: 'none'` means no take (omit). Numeric limit → `take`.
- Prisma `Decimal` (estimated_cost_usd) serializes to a JSON string — matches PostgREST numeric-as-string output, so dashboard `parseFloat(String(...))` keeps working.
- All guards: `[authMiddleware, requireAuth, requireTenantRole(TenantRole.VIEWER)]` spread as a shared array — VIEWER is the read minimum; PLATFORM_OWNER + SERVICE_TOKEN bypass membership in the middleware.
- Applied `deleted_at: null` on every model that HAS the column (Task, Archetype, EmployeeRule, FeedbackEvent, TaskMetric, PendingApproval, TenantIntegration, Execution). `Deliverable` and `TaskStatusLog` have NO `deleted_at` column — do NOT add the filter there (tsc rejects it).
- **Stale Prisma client again**: after creating the file, LSP showed `deleted_at does not exist in type XWhereInput` + `TenantRole has no exported member` for ALL models. `pnpm prisma generate` + `pnpm build` (exit 0) is ground truth — every one was a stale-client false positive. The schema has all these fields.
- LSP tool (`typescript-language-server`) is unavailable in this shell via asdf (`No version is set`). Use `pnpm build` for diagnostics.
- Pre-existing flaky test confirmed again: `socket-mode-lock.test.ts > blocked-live` fails in full-suite parallel run (PID race), passes in isolation. NOT a regression. Full suite: 1688 passed / 1 flaky; isolated re-run: 1689 passed, 9 skipped, 0 failures.

## [2026-06-09] T3E2E Wave-3 Checkpoint Results

Verified (1) role-gated admin endpoints enforce the authz matrix and (2) the new
gateway read endpoints (T17/T21: GET /admin/tenants/:id/tasks and /archetypes)
return ONLY the caller's tenant data — on BOTH local (HS256) and cloud (ES256).

### LOCAL (HS256) — ALL PASS (12 status tests + 3 row-scoping asserts)

- Role-gate (GET /members): OWNER 200 / VIEWER 403 "Insufficient role" / no-auth 401.
- Reads (GET /tasks,/archetypes): OWNER own-tenant 200 (exactly the seeded row) /
  cross-tenant 403 "Access denied" (both tasks AND archetypes) / VIEWER own-tenant
  200 (VIEWER is read minimum) / nonmember 403 / SERVICE_TOKEN 200 (bypasses membership).
- Row-scoping asserts: every 200 read returned rows=1, own tenant_id present, foreign
  tenant_id ABSENT. SERVICE→tasks(B) returned ONLY tenant-B row. Airtight isolation.

### CLOUD (ES256, gateway CLOUD Supabase profile + LOCAL DB for Prisma state) — ALL PASS

- Same 12+3 matrix with REAL cloud ES256 JWTs (kid 1df77847-...). All identical verdicts.
- alg enforcement reconfirmed: a LOCAL HS256 token presented to the CLOUD-profile
  gateway → 401 INVALID_TOKEN. This is the functional proof the CLOUD profile is active.

### Key Findings / Reusable Wisdom

1. **AUTHZ FIRES BEFORE THE QUERY (proven).** On the first local read run the in-tenant
   reads 500'd (DB drift, below) BUT the role-gate, cross-tenant, and nonmember DENIALS
   still returned 403/401 correctly. requireTenantRole rejects non-members before any
   Prisma call; the tenant_id WHERE clause only matters for members who pass the gate.
   So cross-tenant isolation has TWO independent layers: (a) membership gate → 403 for
   non-members, (b) `where:{tenant_id}` → row scoping for members.

2. **LOCAL DB SCHEMA DRIFT — recorded-but-unexecuted migrations (T2 baseline issue, now
   bites read endpoints).** `prisma migrate status` said "up to date" and all 59 rows
   were in \_prisma_migrations, yet columns `tasks.deleted_at` (+ executions,
   pending_approvals, employee_rules, feedback_events, task_metrics) and
   `archetypes.platform_rules_override` were PHYSICALLY MISSING. admin-reads.ts filters
   `deleted_at: null` on every model → Prisma P2022 → HTTP 500. The migrations were
   manually inserted into \_prisma_migrations as the T2 baseline without their DDL ever
   running against this local DB. FIX (idempotent psql, NO source change — same pattern
   Wave-2 used for platform_settings): apply the two migrations' `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS` from prisma/migrations/20260607084955_add_deleted_at_to_active_tables
   and 20260602101613_add_platform_rules_override, then `NOTIFY pgrst,'reload schema'`.
   After that all reads 200. **For future waves touching admin-reads endpoints, verify
   these columns exist FIRST** (they're absent on a T2-style baselined local DB).

3. **Prisma P2022 is a per-query check, NOT cached at connect** — after the psql ALTER,
   reads succeeded immediately with NO gateway restart needed.

4. **Read-scoping needs SEED DATA to be meaningful.** An empty DB returns 200 [] which
   does NOT prove scoping. Seeded 1 task + 1 archetype per tenant with distinguishable
   ids/role_names (A: cccccccc/wave3-dozaldevs-archetype; B: dddddddd/wave3-vlre-archetype),
   then asserted rows=1 AND foreign-tenant-id-count=0. NOTE: both `tasks` and `archetypes`
   require explicit `updated_at` on INSERT (no DB default; created_at has CURRENT_TIMESTAMP
   but updated_at does not).

5. **Re-enable Wave-2-disabled users before reuse.** Wave-2's deactivate test left BOTH
   viewer users (test.local + dozaldevs.io) with status='disabled' → they'd 403
   ACCOUNT_DISABLED. `UPDATE users SET status='active' WHERE email IN (...) AND
status='disabled'`. Reusing Wave-2 users (already have memberships) avoids the
   /me-then-seed-membership dance entirely.

6. **Passwords weren't recorded in Wave-2 evidence** — reset to a known value via the
   Admin API PUT /auth/v1/admin/users/:supabase*id {"password":...} (works for both
   LOCAL Kong:54331 and CLOUD), then login via /auth/v1/token?grant_type=password.
   LOCAL uses SUPABASE_ANON_KEY as apikey; CLOUD uses sb_publishable*... as apikey.

7. **The endpoint role floors**: /members = requireTenantRole(ADMIN,OWNER) → VIEWER
   blocked; /tasks,/archetypes,/employee-rules = requireTenantRole(VIEWER) → VIEWER
   allowed. Confirmed both floors behave correctly.

8. **Stale LSP TenantRole false-positive persists** (documented T5/T11/T14/T21): editing
   ANY file triggers "Module @prisma/client has no exported member 'TenantRole'" across
   admin-\*.ts. The gateway runs fine via tsx — these are not real errors. No source files
   were changed in this checkpoint.

### Evidence Files

- .sisyphus/evidence/local/wave3/{SUMMARY,wave3-tests}.txt
- .sisyphus/evidence/cloud/wave3/{SUMMARY,wave3-tests}.txt

## [2026-06-09] T (seed-platform-owner script)

- Script exports `seedPlatformOwner()` function for testability; main entrypoint guarded by `fileURLToPath(import.meta.url) === process.argv[1]`
- Supabase Auth admin create: `POST /auth/v1/admin/users` with `{ email, password, email_confirm: true }` + `apikey` + `Authorization: Bearer` both set to SUPABASE_SECRET_KEY
- On 422 (user already exists): fall back to `GET /auth/v1/admin/users?email=<encoded>&per_page=100` and find exact email match in `response.users[]`
- Prisma upsert for User: `where: { supabase_id }`, `create: { supabase_id, email, role: 'PLATFORM_OWNER' }`, `update: { email, role: 'PLATFORM_OWNER' }`
- Prisma upsert for TenantMembership: `where: { tenant_id_user_id: { tenant_id, user_id } }`, `update: { role: 'OWNER', deleted_at: null }` (un-soft-deletes if previously deleted)
- Stale Prisma LSP client causes `Property 'user'/'tenantMembership' does not exist on PrismaClient` — worked around with `as unknown as PrismaWithUserModels` type alias; `pnpm build` exits 0 confirming it's a false positive
- Integration test uses `describe.runIf(hasRealSupabaseKey)` where `hasRealSupabaseKey = realSecretKey.startsWith('eyJ')` — skips gracefully when no real auth service key is present in .env
- Integration test OVERRIDES `process.env.SUPABASE_SECRET_KEY` with the real key from `.env` because vitest config sets it to the fake `test-supabase-service-role-key` placeholder
- Cleanup in `afterAll`: raw SQL `DELETE FROM tenant_memberships WHERE user_id = ...` then `DELETE FROM users WHERE id = ...` — NOT deleting Supabase Auth user (no cleanup API in test context)
- Password handling: generated `randomBytes(16).toString('hex')` inline when not provided; in `isMain` block, generated password is printed once and set on `process.env` before calling function so function uses it
- `.env` loading in `isMain` block uses regex `/^([A-Z_][A-Z0-9_]*)=(.*)$/` to parse; silently catches ENOENT (shell env already set)
- `pnpm build` exits 0; `pnpm test:unit` 144 files, 1689 passed, 9 skipped, 0 failures (no regressions)

## [2026-06-09-1229] T (migrate scripts X-Admin-Key → Authorization: Bearer SERVICE_TOKEN)

- Migrated 5 scripts that sent `X-Admin-Key` HTTP headers + updated 1 user-facing log hint. All in `scripts/` (archive/ untouched).
- **HTTP header pattern**: `'X-Admin-Key': KEY` → `Authorization: \`Bearer ${TOKEN}\``. Object-shorthand key `Authorization` (no quotes) is valid JS; template literal interpolates the token.
- **Lazy-getter discipline**: every script reads `process.env.SERVICE_TOKEN` (or its local `getEnv('SERVICE_TOKEN')`) AT CALL TIME, never cached at module load — matches `src/lib/config.ts` `SERVICE_TOKEN` getter. dev-e2e + verify-multi-tenancy read `process.env.SERVICE_TOKEN ?? ''` inline at the fetch site; stress-test/preflight/register-project use their own `.env`-parsing `getEnv()` helper at main()-time.
- **Files changed**:
  - `dev-e2e.ts` — REQUIRED_VARS `ADMIN_API_KEY`→`SERVICE_TOKEN`; trigger fetch header; status-curl log hint.
  - `stress-test.ts` — module const `ADMIN_API_KEY`→`SERVICE_TOKEN` (via `getEnv`); 2 fetch headers (triggerTask + dry_run validate); the missing-key guard message.
  - `verify-multi-tenancy.ts` — local `SERVICE_TOKEN` const; 3 fetch headers (create probe task + 2 cross-tenant GETs).
  - `preflight-guest-messaging.ts` — `getEnv('SERVICE_TOKEN')`; REQUIRED_VARS swap (count stays 11); secrets-GET header; PUT auto-fix header; the curl hint in the not-stored fail message.
  - `register-project.ts` — `serviceToken` var + guard; POST header; 401 message; 2 help/docstring blocks; the "(all require ... header)" footer.
  - `dev.ts` — line 928 log hint only (per scope). **LEFT line 335 `ADMIN_API_KEY` in REQUIRED_VARS env-presence check** — not an HTTP call; still valid during dual-accept window.
- **setup.ts**: NO change — lines 370-386 are pure `ADMIN_API_KEY` auto-generation (no HTTP headers). Kept per task instruction (T24 removes it later).
- **Verification**: `grep -rn "X-Admin-Key" scripts/ --include="*.ts" | grep -v archive | wc -l` = **0**. Remaining `ADMIN_API_KEY` greps are only dev.ts:335 (env check) + setup.ts auto-gen (both intentional, in-scope-excluded).
- **LSP-during-parallel-edits gotcha**: firing multiple Edit calls in one batch on the SAME file produces transient "Cannot find name 'ADMIN_API_KEY'" diagnostics for not-yet-edited occurrences — these resolve once all edits land. The asdf `typescript-language-server` is unavailable in this shell (documented prior), so `pnpm build` (tsc) is ground truth.
- **Pre-existing errors in verify-multi-tenancy.ts** (confirmed via `git stash` + tsc): module-not-found for `../src/gateway/services/{tenant-repository,tenant-secret-repository,tenant-env-loader}.js` (lines 3/4/6) + `TenantInstallationStore` "Expected 3 arguments, got 2" (line 210). NOT caused by this migration — present with changes stashed. tsconfig.build.json excludes scripts/ so `pnpm build` stays exit 0.
- `pnpm build` exits 0; `pnpm test:unit` 144 files, 1689 passed, 9 skipped, 0 failures (no regressions).

## [2026-06-09] T17 Dashboard migration — gateway read endpoints + JWT auth

- Migrated all dashboard components from `postgrestFetch` (direct PostgREST) + `X-Admin-Key` to `gatewayFetch` (gateway read endpoints) + `Authorization: Bearer <supabase_access_token>`.
- **Files migrated**: `TaskFeed.tsx`, `RulesPanel.tsx`, `RulesTab.tsx`, `FeedbackEventsTab.tsx`, `IntegrationsPage.tsx`, `TenantOverview.tsx`, `TriggerPanel.tsx` (plus previously migrated: `gateway.ts`, `use-execution-logs.ts`, `ApiKeyPrompt.tsx`, `App.tsx`, `use-execution.ts`, `use-deliverable.ts`, `use-execution-transcript.ts`, `use-feedback-events.ts`, `useTaskData.ts`, `use-wizard-data.ts`, `EmployeeDetail.tsx`, `EmployeeList.tsx`, `TrainingTab.tsx`, `TriggerEmployeePage.tsx`).
- **`postgrestFetch` only remains in `postgrest.ts`** (the library file itself) — no component imports it anymore.
- **Zero `X-Admin-Key` / `adminApiKey` / `getAdminApiKey` references** remain in `dashboard/src/`.
- **`ApiKeyPrompt.tsx` is now a no-op stub** returning `null`.
- **`getAccessToken()`** reads `localStorage.getItem('supabase_access_token')` — returns null if not set; `gatewayFetch` sends no auth header in that case (gateway returns 401, UI handles it).

### Key migration patterns

- **Array endpoints**: `gatewayFetch<T[]>('/admin/tenants/${tenantId}/archetypes')` — returns array directly (no PostgREST envelope).
- **Single-object endpoints**: `gatewayFetch<Tenant>('/admin/tenants/${tenantId}')` — returns single object, NOT array. Old pattern `postgrestFetch(...).then(arr => arr[0])` becomes just `gatewayFetch<Tenant>(...)`.
- **`usePoll` type inference**: `usePoll(fetchFn)` infers `T` from the return type of `fetchFn`. Changing `fetchFn` to return `Promise<T[]>` vs `Promise<T>` changes the `data` type accordingly — no explicit generic needed on `usePoll`.
- **Multi-archetype filter (RulesTab, FeedbackEventsTab)**: `buildArchetypeFilter(selectedIdsKey)` produced PostgREST `in.(id1,id2)` syntax — gateway only supports single `?archetype_id=`. Strategy: fetch ALL tenant rules/events (no archetype filter in URL), then filter client-side by `selectedIds.has(r.archetype_id)`. Efficient for small rule sets; acceptable tradeoff.
- **TaskFeed stats consolidation**: eliminated `fetchTenantCosts` and `fetchDoneTasks` (separate PostgREST queries). The main tasks query already includes `executions` embed — compute `totalCostUsd` and `tasksCompleted` from `rawTasks` client-side. `fetchTenantMetrics` migrated to `/task-metrics` endpoint; date/employee filtering done client-side via `useMemo`.
- **IntegrationsPage tenant fetch**: `postgrestFetch<Tenant>('tenants', ...).then(arr => arr[0])` → `gatewayFetch<Tenant>('/admin/tenants/${tenantId}')` (single object). Removed `const tenant = tenants?.[0] ?? null` pattern.
- **TenantOverview same pattern**: `data: tenants` + `const tenant = tenants?.[0] ?? null` → `data: tenant` directly.

### Verification results

- `grep -rn "X-Admin-Key|adminApiKey|getAdminApiKey" dashboard/src` → **0 matches**
- `grep -rn "postgrestFetch|scopeByTenant" dashboard/src` → **1 match** (only `postgrest.ts` itself)
- `pnpm dashboard:build` → **exit 0** (vite build, 2198 modules, 442ms)
- `pnpm build` → **exit 0** (gateway tsc)
- `pnpm test:unit` → **144 files, 1689 passed, 9 skipped, 0 failures**

---

## T21: SERVICE_TOKEN trigger verification (2026-06-09)

### Auth chain works end-to-end

- `Authorization: Bearer $SERVICE_TOKEN` → `authMiddleware` sets `req.isServiceToken = true`
- `requireAuth` passes immediately when `isServiceToken = true` (no user lookup)
- `requireTenantRole(MEMBER)` passes immediately when `isServiceToken = true` (no DB membership lookup)
- Missing auth → 401. Wrong token → 401. Valid SERVICE_TOKEN → 202.

### Trigger route confirmed (T16 guards in place)

`POST /admin/tenants/:tenantId/employees/:slug/trigger` uses:
```
authMiddleware → requireAuth → requireTenantRole(TenantRole.MEMBER)
```

### Live trigger result

- Employee: `wave3-vlre-archetype` (VLRE tenant, runtime=opencode)
- task_id: `56716455-2285-4619-9a14-d390a281fc04`
- Lifecycle: Received → Triaging → AwaitingInput → Ready → **Executing** ✅
- Failed at Executing (harness) — expected, archetype has no identity/execution_steps
- The auth + trigger + lifecycle are correct

### Runtime null = 501 NOT_IMPLEMENTED

Wave3 archetypes were created with no runtime set. Must patch `runtime = 'opencode'` in DB before triggering. The error is post-auth — 501 means auth already passed.

### External cron callers must use Bearer token

- cron-job.org and other external callers: `Authorization: Bearer $SERVICE_TOKEN`
- `X-Admin-Key` is dual-accept during migration window only — deprecated, remove after T24

### Docs updated

`docs/guides/2026-04-16-0310-manual-employee-trigger.md` updated:
- All curl examples use `Authorization: Bearer $SERVICE_TOKEN`
- Legacy `X-Admin-Key` examples labeled deprecated
- Port corrected from 3000 → 7700
- HTTP response codes table updated (added 403)
- How it works section updated with full auth chain description

## [2026-06-09] T23 — Endpoint sweep without admin key

### Results
- **69/69 endpoint checks PASS, 0 FAIL** using PLATFORM_OWNER JWT (HS256) + SERVICE_TOKEN, NO X-Admin-Key.
- Covered every admin route across all 22 live admin-*.ts files + me.ts + public /invitations/*.
- Zero 401s from missing admin key → T16 migration confirmed complete; no route still relies on requireAdminKey alone.

### Method (key insight for T24 and future sweeps)
- **Auth middleware runs BEFORE body/param validation and BEFORE any DB call** (authMiddleware → requireAuth → requireTenantRole/requirePermission). So ANY non-401 response proves the auth chain passed. **401 is the ONLY fail signal.**
- 400 (invalid body/id) and 404 (not found) are EXPECTED passes — handler reached validation/DB stage.
- All mutating verbs (POST/PATCH/PUT/DELETE) used empty/invalid bodies or fake UUID `99999999-...` → **nothing mutated, sweep is fully read-safe.**
- 3 integrity checks added to evidence: (1) harness sends zero X-Admin-Key, (2) negative control — all 10 sampled endpoints return 401 with NO auth (proves they actually enforce auth), (3) dual-accept still ON (X-Admin-Key → 200).

### Setup gotchas
- **owner@test.com did NOT exist** on this DB — had to create it: `POST localhost:54331/auth/v1/admin/users {email,password:Test1234!,email_confirm:true}` (apikey+Bearer = SUPABASE_SECRET_KEY), then run `scripts/seed-platform-owner.ts` with `BOOTSTRAP_OWNER_EMAIL=owner@test.com BOOTSTRAP_OWNER_PASSWORD=Test1234!` to set role=PLATFORM_OWNER + OWNER memberships in both tenants. Verified via `/me` → globalRole=PLATFORM_OWNER.
- **bash 3.2 (macOS) + `set -u`**: empty array expansion `"${arr[@]}"` throws "unbound variable". Guard with `if [ "${#arr[@]}" -gt 0 ]; then args+=("${arr[@]}"); fi`.

### Failures found and fixed
- **NO auth failures** (the actual T23 deliverable — every endpoint authed without admin key).
- **DB DRIFT FIXED (pre-existing, not auth-related)**: GET/DELETE/PATCH `/admin/model-catalog*` initially 500'd — Prisma P2022 `column model_catalog.strengths does not exist`. Columns `strengths`+`weaknesses` are in schema.prisma (ModelCatalog) but missing from this T2-baselined local DB (same drift class as Wave-3 deleted_at/platform_rules_override). Fix (NO source change, idempotent): `ALTER TABLE model_catalog ADD COLUMN IF NOT EXISTS strengths TEXT; ADD COLUMN IF NOT EXISTS weaknesses TEXT; NOTIFY pgrst,'reload schema';`. P2022 is per-query → no gateway restart needed. Endpoints now 200/404. **For future waves touching model-catalog endpoints on a baselined local DB, verify these two columns exist first.**

### Evidence
- `.sisyphus/evidence/local/task-23-sweep.txt` (147 lines: full 69-row checklist + 3 integrity checks + findings)
- Reusable harness: `scripts/t23-sweep.sh` (reads `/tmp/t23-tokens.env`)

## [2026-06-09] T24 — ADMIN_API_KEY fully removed

- Deleted: src/gateway/middleware/admin-auth.ts (already deleted in working tree — confirmed via `git status`)
- Removed dual-accept X-Admin-Key branch from auth.ts (already done in working tree)
- Removed ADMIN_API_KEY getter from config.ts (already done)
- Removed ADMIN_API_KEY from .env + moved to DEPRECATED comment in .env.example (already done, with note "Removed in T24")
- Removed auto-generation from setup.ts (already done)
- Removed from dev.ts REQUIRED_VARS (already done)
- Removed stale 'ADMIN_API_KEY' string from LAZY_VARS cleanup array in tests/unit/lib/config.test.ts (T24 fix)
- Final grep (src dashboard scripts docs .env.example --exclude-dir=archive, filtered by # / DEPRECATED): 0 active references
- pnpm build: EXIT 0
- pnpm test:unit: 144 files, 1686 tests passed, 9 skipped, 0 failures
- Gateway boots without ADMIN_API_KEY — /health → {"status":"ok"}
- X-Admin-Key → 401 (rejected — auth.ts only accepts Authorization: Bearer)
- Note: tests/unit/gateway/routes/* still mock authMiddleware using X-Admin-Key pattern internally — those are self-contained unit test mocks and pass as-is; they test route handler logic, not the auth middleware
