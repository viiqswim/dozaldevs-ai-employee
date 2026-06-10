# Decisions

## [2026-06-10] Plan: platform-owner-section

### Architectural Decisions

- globalRole sourced EXCLUSIVELY from `GET /me`, never from JWT `app_metadata`
- 3-state loading guard: loading→spinner; owner→children; non-owner→AccessDeniedPage
- Non-owner direct URL access → in-app 403 page (NOT redirect+toast)
- 403 page renders INSIDE Layout shell (sidebar/header visible) so user can navigate away
- New Tenant Management route: `/dashboard/admin/tenants` (not `/dashboard/tenants` which is TenantOverview)
- Tools MOVED into Platform Admin group
- Members STAYS in Workspace (tenant-scoped, uses tenantRole)
- TenantOverview NOT touched (phantom task — already per-org settings view)
- Header org-switcher NOT touched (keeps using `/me/tenants`)

### Owner Section Items (EXACTLY 5)

1. AI Models (`/dashboard/models`)
2. Platform Settings (`/dashboard/settings`)
3. Preflight (`/dashboard/preflight`)
4. Tools (`/dashboard/tools`)
5. Tenant Management (`/dashboard/admin/tenants`) — NEW

### Wave Execution Order

- Wave 1: Tasks 1, 3, 4, 8 (parallel, no deps)
- Wave 2: Tasks 2, 5, 6 (parallel, after Wave 1)
- Wave 3: Tasks 7, 9 (parallel, after Wave 2)
- Final: F1, F2, F3, F4 (parallel, after Wave 3)
