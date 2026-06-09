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
