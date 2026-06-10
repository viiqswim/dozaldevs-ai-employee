# Decisions — multi-tenant-user-auth-rbac

## [2026-06-09] Architecture decisions (from planning phase)

- JWT = identity only; DB is authoritative authz source on every request
- Two-tier roles: global `Role` (PLATFORM_OWNER/ADMIN/EDITOR/USER/VIEWER) + per-tenant `TenantRole` (OWNER/ADMIN/MEMBER/VIEWER)
- Env-aware JWT verification: JWKS/ES256 for cloud, HS256 shared-secret for local
- New key model: publishable (browser) + secret (server/worker); legacy anon/service_role unused
- Dual-accept migration window mandatory before admin key removal
- Bootstrap PLATFORM_OWNER created and verified BEFORE admin-key removal (on both envs)
- Soft-delete on User, TenantMembership, TenantInvitation
- Static ROLE_PERMISSIONS map in code (no permissions DB table)
- Dashboard reads route through gateway (not direct PostgREST)
- Cloud invite email deferred — assert invite created, not delivered
