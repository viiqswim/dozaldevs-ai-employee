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
