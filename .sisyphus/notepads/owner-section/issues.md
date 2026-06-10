
## F3 Manual QA — Test fixture discrepancy (2026-06-10)

- Prereq stated `victor@dozaldevs.com` = PLATFORM_OWNER, but DB had it as `USER`. Both test users were `USER`.
- Fix applied: `UPDATE users SET role='PLATFORM_OWNER' WHERE email='victor@dozaldevs.com';`
- Safe because `ensureUserExists()` only sets `role:'USER'` on `create` (upsert), never on `update` — role survives login.
- localStorage held `adminApiKey`/`admin_api_key` (SERVICE_TOKEN-level) — MUST clear these when testing non-owner RBAC, or 403 gating is bypassed. Also clear `supabase_access_token` + `sb-localhost-auth-token` for logout.
- Sign-out button is icon-only (no accessible text "Sign out" matchable easily mid-test) — clearing localStorage auth keys + nav to /login is the reliable logout path.

## F3 Manual QA — Results: ALL PASS
- Owner sidebar: "Platform Admin" group with 5 items (AI Models, Platform Settings, Preflight, Tools, Tenant Management). Members correctly in Workspace group, NOT Platform Admin.
- Owner routes 5/5 load real content, 0 leaks.
- Non-owner 5/5 routes → "Access restricted" 403, Layout shell intact, workspace routes (/tasks) still work.
- No-flash: 15ms polling showed EMPTY(45ms)→403(179ms), zero owner-content frames.
- Tenant Mgmt: columns Name/Slug/Status/Created, "Show deleted" toggle adds ?deleted=true AND preserves ?tenant=.
