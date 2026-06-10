# Platform Owner Dashboard Section

## TL;DR

> **Quick Summary**: Add a PLATFORM_OWNER-only "Platform Admin" group to the dashboard sidebar, gated client-side by a new `globalRole` fetched from `GET /me`. Group existing owner pages (AI Models, Platform Settings, Preflight, Tools) under it, add a new cross-tenant Tenant Management admin page, and show an in-app 403 page for non-owners hitting owner routes directly.
>
> **Deliverables**:
>
> - Client-side `globalRole` fetch (`GET /me`) stored in `AuthContext`
> - `PlatformOwnerRoute` guard + in-app `AccessDenied` (403) page
> - Sidebar split into "Workspace" + "Platform Admin" groups, owner group filtered by role
> - New Tenant Management page (all orgs, status, created date, soft-deleted view, create-org)
> - Vitest unit tests + Playwright E2E (owner sees section; seeded non-owner does not)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (globalRole in AuthContext) → Task 2 (PlatformOwnerRoute) → Task 6 (sidebar grouping) → Task 9 (E2E)

---

## Context

### Original Request

Create a separate dashboard section containing pages only a PLATFORM_OWNER can access (named candidates: Platform Settings, Pre-flight checks, AI Models). Identify what else belongs there and design the UX so the dashboard doesn't sprawl.

### Interview Summary

**Key Decisions**:

- UX model: Option A — single sidebar with a labeled "Platform Admin" group below the workspace items, visible ONLY to PLATFORM_OWNER.
- Owner section (5 items): AI Models, Platform Settings, Preflight, Tools, and a NEW Tenant Management page.
- Tenant Management: build a REAL admin page (all orgs, status, created date, soft-deleted via `?include_deleted=true`, create-new-org) — not a redundant list.
- TenantOverview "split": DROPPED — confirmed phantom (TenantOverview is already a per-org settings view with no org list to strip).
- Tools: MOVED into owner section.
- Non-owner hitting an owner route directly: show an in-app 403 "Access denied" page.
- Preflight: client-side gate only (no new server permission).
- Members page: STAYS in workspace nav (uses tenantRole, not globalRole).
- Test strategy: Vitest unit tests alongside implementation + Playwright E2E with a real seeded non-owner user.

**Research Findings**:

- Backend gating already complete: `/admin/platform-settings`, `/admin/model-catalog`, `/admin/tenants`, `/admin/tools` all require PLATFORM_OWNER server-side via `requirePermission`. Server is the real security boundary; client gating is UX.
- The dashboard NEVER calls `GET /me` today — `globalRole` is absent from all client state. This is the core gap.
- `ProtectedRoute` is auth-only (session check, no role). Sidebar (`NAV_ITEMS`) renders all items unconditionally. Only `MembersPage` has any role-aware UI, and it uses tenantRole.
- `GET /me` returns `{ id, email, name, globalRole, status }` where `globalRole ∈ {PLATFORM_OWNER, ADMIN, EDITOR, USER, VIEWER, SERVICE}`.
- `GET /admin/tenants` exists (`admin-tenants.ts:63-78`), gated `MANAGE_TENANTS`, returns `{ tenants }`, supports `?include_deleted=true`. `POST /admin/tenants` (create) exists at line 27-61.
- `gateway.ts` has NO `getMe()` or `listAllTenants()` client method — both must be added.
- Dashboard test infra: Vitest 4 + @testing-library, existing tests under `dashboard/src/tests/`.

### Metis Review

**Identified Gaps** (addressed):

- "Full split of TenantOverview" was a phantom — TenantOverview has no org list. → Task dropped entirely.
- Owner already sees all orgs via Header switcher (`/me/tenants`). → New Tenant Management page justified ONLY by admin value (status, created date, soft-deleted, create) — designed accordingly.
- `globalRole` must come exclusively from `GET /me`, never JWT `app_metadata`.
- Loading state needs a 3-state guard (loading / owner / non-owner) so owner nav or 403 never flashes before role resolves.

---

## Work Objectives

### Core Objective

Group all PLATFORM_OWNER-only pages into a visually distinct, client-gated "Platform Admin" sidebar section, so non-owners never see them and owners get a clean, scalable admin area.

### Concrete Deliverables

- `globalRole` available in `AuthContext` (sourced from `GET /me`)
- `PlatformOwnerRoute` guard component
- `AccessDenied` (403) page component
- Sidebar with "Workspace" + "Platform Admin" groups, owner group rendered only for owners
- New Tenant Management page + `listAllTenants()` / `createTenant()` client methods
- Vitest unit tests for the gating logic
- Playwright E2E proving owner-sees / non-owner-doesn't-see + 403 behavior
- A seeded non-owner test user

### Definition of Done

- [ ] As PLATFORM_OWNER, the sidebar shows a "Platform Admin" group containing AI Models, Platform Settings, Preflight, Tools, Tenant Management
- [ ] As a non-owner, the "Platform Admin" group is ABSENT and direct navigation to any owner route renders the 403 page
- [ ] No owner nav or 403 flashes during `/me` load (3-state guard)
- [ ] Tenant Management lists all orgs with status + created date, supports show-deleted toggle and create-org
- [ ] `pnpm --filter dashboard test` (or dashboard `vitest`) passes including new tests
- [ ] `pnpm dashboard:build` succeeds (typecheck clean)

### Must Have

- Client `globalRole` sourced exclusively from `GET /me`
- 3-state loading guard before any role-based render
- In-app 403 page for non-owners on owner routes (not a redirect)
- Sidebar section grouping with owner-only filtering
- All existing owner pages reachable under the new group with unchanged functionality

### Must NOT Have (Guardrails)

- NO changes to server-side permission enforcement (`requirePermission`, `authz.ts`, `permissions.ts`) — backend gating is already correct and is the real security boundary
- NO sourcing of role from JWT `app_metadata` — only `GET /me`
- NO refactor/split of `TenantOverview` — it has no org list; leave it exactly as-is
- NO moving the Members page into the owner section — it is tenant-scoped (tenantRole)
- NO new server permission for Preflight — client gate only
- NO scope creep into new platform-admin pages beyond the 5 listed (no cost dashboards, audit logs, global user management in THIS plan)
- NO change to the Header org-switcher behavior (it keeps using `/me/tenants`)
- NO breaking the existing `?tenant=` URL-state threading

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest 4 + @testing-library in `dashboard/`)
- **Automated tests**: Tests alongside implementation (not strict TDD)
- **Framework**: Vitest (`dashboard/package.json` → `"test": "vitest"`)
- Unit-test the high-value gating logic: `PlatformOwnerRoute` (owner vs non-owner vs loading), sidebar owner-item filtering, `globalRole` fetch/store.

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/owner-section/task-{N}-{slug}.{ext}`.

- **Frontend/UI**: Playwright (playwright skill) — navigate `localhost:7700/dashboard/`, assert nav presence/absence, assert 403 render, screenshot
- **Unit logic**: Bash — run `vitest` on the changed test files, capture pass/fail
- **Build**: Bash — `pnpm dashboard:build` exit 0

### Test identities

- Owner: `victor@dozaldevs.com` / `Test1234!` (PLATFORM_OWNER)
- Non-owner: a SEEDED test user with global role USER (see Task 8). Credentials documented in the evidence dir, NOT committed.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: globalRole in AuthContext (fetch GET /me) [unspecified-high]
├── Task 3: AccessDenied (403) page component [quick]
├── Task 4: listAllTenants() + createTenant() client methods in gateway.ts [quick]
└── Task 8: Seed a non-owner test user (script/doc) [quick]

Wave 2 (Build on foundation — MAX PARALLEL):
├── Task 2: PlatformOwnerRoute guard (depends 1, 3) [unspecified-high]
├── Task 5: Tenant Management page (depends 4) [visual-engineering]
└── Task 6: Sidebar section grouping + owner filtering (depends 1) [visual-engineering]

Wave 3 (Integration + routing + tests):
├── Task 7: Wire owner routes in App.tsx under PlatformOwnerRoute (depends 2, 5, 6) [unspecified-high]
└── Task 9: Unit tests for gating logic (depends 2, 6) [unspecified-high]

Wave FINAL (after ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — Playwright owner + non-owner (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 7 → Task 9 → F1-F4 → user okay
```

### Dependency Matrix

- **1**: deps none → blocks 2, 6, 9
- **3**: deps none → blocks 2
- **4**: deps none → blocks 5
- **8**: deps none → blocks F3 (E2E non-owner)
- **2**: deps 1, 3 → blocks 7, 9
- **5**: deps 4 → blocks 7
- **6**: deps 1 → blocks 7, 9
- **7**: deps 2, 5, 6 → blocks F-wave
- **9**: deps 2, 6 → blocks F-wave

### Agent Dispatch Summary

- **Wave 1**: T1 → `unspecified-high`, T3 → `quick`, T4 → `quick`, T8 → `quick`
- **Wave 2**: T2 → `unspecified-high`, T5 → `visual-engineering`, T6 → `visual-engineering`
- **Wave 3**: T7 → `unspecified-high`, T9 → `unspecified-high`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE task. EVERY task has Agent QA Scenarios.

- [x] 1. Fetch and expose `globalRole` in AuthContext

  **What to do**:
  - Add a `getMe()` method to `dashboard/src/lib/gateway.ts` that calls `GET /me` via `gatewayFetch` and returns `{ id, email, name, globalRole, status }`. Add a TS type for the response.
  - In `dashboard/src/contexts/AuthContext.tsx`: after a session is established (in the same effect that handles `getSession()` / `onAuthStateChange`), call `getMe()` and store `globalRole` in context state.
  - Extend the context value with `globalRole: string | null` and a `roleLoading: boolean` (true until `/me` resolves) — this enables the 3-state guard downstream.
  - On sign-out / session loss, reset `globalRole` to `null` (cache invalidation).
  - Add a derived `isPlatformOwner` boolean (`globalRole === 'PLATFORM_OWNER'`) to the context value for convenience.

  **Must NOT do**:
  - Do NOT read role from the Supabase JWT `app_metadata` — source ONLY from `GET /me`.
  - Do NOT change the existing `session`/`user`/`signOut` shape (additive only).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — React context wiring with async fetch + lifecycle correctness
  - **Skills**: [`react-dashboard`] — dashboard conventions
    - `react-dashboard`: AuthContext/hook patterns, gatewayFetch usage

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 4, 8)
  - **Blocks**: 2, 6, 9
  - **Blocked By**: None

  **References**:
  - `dashboard/src/contexts/AuthContext.tsx:14-54` — existing context shape (session, user, loading, signOut); extend here
  - `dashboard/src/hooks/use-tenant.ts:35-110` — pattern for fetching `/me/tenants` after session; mirror this for `/me`
  - `dashboard/src/lib/gateway.ts:56-521` — `gatewayFetch` + existing client methods; add `getMe()` here
  - `src/gateway/routes/me.ts:26-46` — `GET /me` returns `{ id, email, name, globalRole, status }`
  - WHY: `use-tenant.ts` is the canonical "fetch-after-session" pattern; copy its effect structure so role loading behaves consistently with tenant loading.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` exit 0
  - [ ] `AuthContext` value includes `globalRole`, `roleLoading`, `isPlatformOwner`

  **QA Scenarios**:

  ```
  Scenario: Owner session populates globalRole
    Tool: Playwright
    Preconditions: dev stack up (localhost:7700), logged out
    Steps:
      1. Navigate to /dashboard/login, sign in victor@dozaldevs.com / Test1234!
      2. In console: evaluate window fetch of /me with the stored access_token
      3. Assert response globalRole === "PLATFORM_OWNER"
    Expected Result: /me returns globalRole PLATFORM_OWNER; context exposes it
    Evidence: .sisyphus/evidence/owner-section/task-1-me-owner.json

  Scenario: Sign-out clears role
    Tool: Playwright
    Preconditions: logged in as owner
    Steps:
      1. Click sign out
      2. Assert redirect to /dashboard/login and no residual role state (re-login fetches fresh)
    Expected Result: globalRole reset to null on sign-out
    Evidence: .sisyphus/evidence/owner-section/task-1-signout.png
  ```

  **Commit**: groups with Task overall — `feat(dashboard): fetch and expose globalRole from /me in AuthContext`

- [x] 3. AccessDenied (403) page component

  **What to do**:
  - Create `dashboard/src/pages/AccessDeniedPage.tsx` — a card-shell page ("rounded-lg border bg-card", "px-5 py-4") stating access is restricted to platform owners, with a link/button back to `/dashboard`.
  - Use plain, non-technical end-user language ("You don't have access to this area").

  **Must NOT do**:
  - Do NOT add any role logic here — it's a dumb presentational page; the guard (Task 2) decides when to render it.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single presentational component
  - **Skills**: [`react-dashboard`]
    - `react-dashboard`: card-shell convention, end-user language

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 2
  - **Blocked By**: None

  **References**:
  - `dashboard/src/pages/LoginPage.tsx` — standalone page styling reference
  - WHY: match existing standalone-page look; reuse card-shell classes per repo convention.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` exit 0
  - [ ] Component renders a message + a working link to `/dashboard`

  **QA Scenarios**:

  ```
  Scenario: AccessDenied renders with back link
    Tool: Playwright (after Task 7 wires it) OR a vitest render
    Preconditions: component exists
    Steps:
      1. Render the component
      2. Assert it contains access-restricted copy and a link to /dashboard
    Expected Result: message + back link present
    Evidence: .sisyphus/evidence/owner-section/task-3-403.png
  ```

  **Commit**: groups with Task 2 — `feat(dashboard): add PlatformOwnerRoute guard and AccessDenied page`

- [x] 4. Client methods: listAllTenants() + createTenant()

  **What to do**:
  - Add `listAllTenants(includeDeleted?: boolean)` to `dashboard/src/lib/gateway.ts` calling `GET /admin/tenants` (append `?include_deleted=true` when requested). Return the `{ tenants }` payload typed.
  - Add `createTenant({ name, slug, config? })` calling `POST /admin/tenants`.
  - Add TS types for the tenant admin row (id, slug, name, status, created_at) in `dashboard/src/lib/types.ts`.

  **Must NOT do**:
  - Do NOT touch the existing `/me/tenants` path used by the Header switcher.

  **Recommended Agent Profile**:
  - **Category**: `quick` — two typed fetch wrappers
  - **Skills**: [`react-dashboard`, `api-design`]
    - `react-dashboard`: gatewayFetch conventions
    - `api-design`: response envelope shape (sendSuccess)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 5
  - **Blocked By**: None

  **References**:
  - `src/gateway/routes/admin-tenants.ts:27-78` — `POST /admin/tenants` (create, returns id/slug/name/status/created_at) and `GET /admin/tenants` (list, returns `{ tenants }`, `?include_deleted=true`)
  - `dashboard/src/lib/gateway.ts:56-521` — existing client methods to mirror
  - `dashboard/src/lib/types.ts` — add tenant admin row type
  - WHY: the new Tenant Management page (Task 5) consumes these; the server contract is fixed, so types must match exactly.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` exit 0
  - [ ] `listAllTenants()` and `createTenant()` exported and typed

  **QA Scenarios**:

  ```
  Scenario: listAllTenants returns all orgs as owner
    Tool: Bash (curl, mirrors the client call)
    Preconditions: dev stack up; SERVICE_TOKEN available
    Steps:
      1. curl GET /admin/tenants with Bearer SERVICE_TOKEN
      2. Assert HTTP 200 and body has tenants[] with id, slug, name, status
    Expected Result: 200 + non-empty tenants array
    Evidence: .sisyphus/evidence/owner-section/task-4-list-tenants.json

  Scenario: include_deleted toggle
    Tool: Bash (curl)
    Steps:
      1. curl GET /admin/tenants?include_deleted=true
      2. Assert 200 (superset of default list)
    Expected Result: 200, includes soft-deleted rows if any
    Evidence: .sisyphus/evidence/owner-section/task-4-list-deleted.json
  ```

  **Commit**: groups with Task 5 — `feat(dashboard): add Tenant Management admin page + client methods`

- [x] 8. Seed a non-owner test user

  **What to do**:
  - Provide a repeatable way to create a NON-owner test user (global role USER) for E2E negative testing. Prefer a small `tsx` script under `scripts/` OR documented steps using the existing invitation/seed flow + a direct `users.role` set.
  - The user must authenticate via the real `/me` path (real login), NOT a mock.
  - Document the credentials in `.sisyphus/evidence/owner-section/task-8-nonowner-user.txt` (gitignored evidence dir) — do NOT commit credentials to source.

  **Must NOT do**:
  - Do NOT commit any password/secret into the repo.
  - Do NOT grant this user PLATFORM_OWNER or any tenant OWNER/ADMIN role that would mask the negative test.

  **Recommended Agent Profile**:
  - **Category**: `quick` — small seed script/doc
  - **Skills**: [`security`, `prisma`]
    - `security`: Supabase Auth user creation, no-secrets-in-repo rule
    - `prisma`: users table, role enum, soft-delete

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: F3 (E2E non-owner)
  - **Blocked By**: None

  **References**:
  - `scripts/seed-platform-owner.ts` — pattern for creating a Supabase Auth user + app `users` row (adapt to role USER)
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` — invitation flow + role model
  - `src/gateway/services/ensure-user-exists.ts` — how `users.role` maps to globalRole
  - WHY: the negative E2E must exercise the real role path; a real USER-role account is required.

  **Acceptance Criteria**:
  - [ ] A USER-role account exists and can log into the dashboard
  - [ ] `GET /me` for that account returns `globalRole: "USER"`
  - [ ] Credentials recorded in evidence dir, not in source

  **QA Scenarios**:

  ```
  Scenario: Non-owner /me returns USER
    Tool: Bash (curl) or Playwright login
    Preconditions: user seeded
    Steps:
      1. Authenticate as the seeded user; call /me
      2. Assert globalRole === "USER" (not PLATFORM_OWNER)
    Expected Result: globalRole USER
    Evidence: .sisyphus/evidence/owner-section/task-8-nonowner-me.json
  ```

  **Commit**: operational — no app commit (evidence only)

- [x] 2. PlatformOwnerRoute guard component

  **What to do**:
  - Create `dashboard/src/components/PlatformOwnerRoute.tsx`, modeled on `ProtectedRoute.tsx`.
  - Read `globalRole`, `roleLoading` (and `session`) from `AuthContext` (Task 1).
  - 3-state behavior: (a) `roleLoading` true → render a neutral loading state (spinner/skeleton), NOT the children and NOT the 403; (b) resolved + `isPlatformOwner` → render children (`<Outlet/>` or `children`); (c) resolved + not owner → render the `AccessDeniedPage` (Task 3).
  - Compose INSIDE the existing auth gate: it assumes a session already exists (still handle the no-session case by deferring to `ProtectedRoute` upstream).

  **Must NOT do**:
  - Do NOT redirect non-owners — render the in-app 403 page (per decision).
  - Do NOT flash children or 403 while `roleLoading` is true.
  - Do NOT duplicate auth/session logic — rely on the existing `ProtectedRoute` wrapper for authentication.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — guard correctness + the tri-state is the crux of the feature
  - **Skills**: [`react-dashboard`]
    - `react-dashboard`: route guard patterns, context consumption

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 5, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: 7, 9
  - **Blocked By**: 1, 3

  **References**:
  - `dashboard/src/components/ProtectedRoute.tsx:5-21` — exact pattern to mirror (uses `useAuth()`, `<Navigate>`); adapt to role + 403 instead of redirect
  - `dashboard/src/contexts/AuthContext.tsx` — consume `globalRole`/`roleLoading`/`isPlatformOwner` from Task 1
  - `dashboard/src/pages/AccessDeniedPage.tsx` — render this when not owner (Task 3)
  - WHY: ProtectedRoute is the established guard shape; staying parallel to it keeps the codebase consistent and review-friendly.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` exit 0
  - [ ] Three branches implemented: loading → spinner; owner → children; non-owner → 403
  - [ ] No render of children/403 during loading

  **QA Scenarios**:

  ```
  Scenario: Owner passes guard
    Tool: Playwright (post Task 7 wiring)
    Steps:
      1. As owner, navigate to /dashboard/settings
      2. Assert the Platform Settings content renders (not 403)
    Expected Result: children render
    Evidence: .sisyphus/evidence/owner-section/task-2-owner-pass.png

  Scenario: Non-owner sees 403, no flash
    Tool: Playwright
    Steps:
      1. As seeded non-owner, navigate directly to /dashboard/models
      2. Observe initial paint (loading), then assert AccessDenied renders
      3. Assert the Models content never appeared (no flash)
    Expected Result: 403 page; no protected content flash
    Evidence: .sisyphus/evidence/owner-section/task-2-nonowner-403.png
  ```

  **Commit**: `feat(dashboard): add PlatformOwnerRoute guard and AccessDenied page` (with Task 3)

- [x] 5. Tenant Management admin page

  **What to do**:
  - Create `dashboard/src/pages/TenantManagementPage.tsx` (owner-only). Use `listAllTenants()` (Task 4) to render a card-shell table of all orgs: name, slug, status, created date.
  - Add a "show deleted" toggle that re-fetches with `include_deleted=true`. Reflect toggle state in the URL (`?deleted=true`) per the URL-state convention.
  - Add a "Create organization" action (dialog or inline) calling `createTenant()`. Use plain end-user language ("Organization", not "Tenant"). Use `SearchableSelect` for any dropdowns.
  - Empty/loading/error states handled.

  **Must NOT do**:
  - Do NOT duplicate the Header switcher's purpose — this is an ADMIN view (status, created date, deleted, create), not a switcher.
  - Do NOT add per-org secret/integration editing here (that lives in TenantOverview — leave it there).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — table UI, dialog, URL state, conventions
  - **Skills**: [`react-dashboard`]
    - `react-dashboard`: card shells, SearchableSelect, URL-encoded state, end-user language

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 2, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: 7
  - **Blocked By**: 4

  **References**:
  - `dashboard/src/pages/ModelCatalogPage.tsx` + `pages/model-catalog-params.ts` — canonical table + URL-state + create-dialog pattern to follow closely
  - `dashboard/src/pages/PlatformSettingsPage.tsx` — card-shell table + inline edit reference
  - `dashboard/src/lib/gateway.ts` — `listAllTenants()`/`createTenant()` from Task 4
  - WHY: ModelCatalogPage is the closest existing analog (owner-only global CRUD table with URL state) — copying its structure guarantees convention compliance.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` exit 0
  - [ ] Lists all orgs (name, slug, status, created date)
  - [ ] Show-deleted toggle reflected in `?deleted=` and re-fetches
  - [ ] Create-organization action works (creates + refreshes list)

  **QA Scenarios**:

  ```
  Scenario: List + show-deleted + create
    Tool: Playwright
    Preconditions: logged in as owner; page wired (Task 7)
    Steps:
      1. Navigate to the Tenant Management route
      2. Assert a table with >=1 org row showing name + status + created date
      3. Toggle "show deleted" → assert URL gains ?deleted=true and list re-fetches
      4. Click Create organization → fill name+slug → submit → assert new row appears
    Expected Result: list renders; toggle works; create adds a row
    Evidence: .sisyphus/evidence/owner-section/task-5-tenant-mgmt.png

  Scenario: Create validation (duplicate slug)
    Tool: Playwright
    Steps:
      1. Attempt to create an org with an existing slug
      2. Assert a friendly error is shown (409 surfaced as readable message)
    Expected Result: graceful error, no crash
    Evidence: .sisyphus/evidence/owner-section/task-5-dup-slug.png
  ```

  **Commit**: `feat(dashboard): add Tenant Management admin page + client methods` (with Task 4)

- [x] 6. Sidebar section grouping + owner filtering

  **What to do**:
  - Refactor `dashboard/src/components/layout/Sidebar.tsx`: split the flat `NAV_ITEMS` into two groups — "Workspace" (Tasks, Employees, Rules, Integrations, Members, Organizations, Tools→moving out) and "Platform Admin" (AI Models, Platform Settings, Preflight, Tools, Tenant Management).
  - Add a `platformOwnerOnly?: boolean` concept (or two arrays). Render the "Platform Admin" group with a section label/divider ONLY when `isPlatformOwner` (from AuthContext) is true.
  - During `roleLoading`, do NOT render the Platform Admin group (avoid flash) — show only Workspace until role resolves.
  - Move Tools and (new) Tenant Management into the Platform Admin group. Keep Organizations (TenantOverview) in Workspace.
  - Preserve the existing `healthDot` behavior on Preflight.

  **Must NOT do**:
  - Do NOT move Members into Platform Admin (tenant-scoped — stays in Workspace).
  - Do NOT remove or alter `?tenant=` threading or the `healthDot`/preflight status wiring.
  - Do NOT touch TenantOverview.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — sidebar IA, grouping, conditional render
  - **Skills**: [`react-dashboard`]
    - `react-dashboard`: sidebar/NAV_ITEMS structure, card/section styling

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 2, 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: 7, 9
  - **Blocked By**: 1

  **References**:
  - `dashboard/src/components/layout/Sidebar.tsx:17-35` — `NavItem` interface + `NAV_ITEMS` array (the thing being grouped); `healthDot` usage
  - `dashboard/src/components/layout/Layout.tsx:12-44` — how Sidebar is rendered + `preflightStatus` prop; you'll add role/isPlatformOwner access here or via hook
  - `dashboard/src/contexts/AuthContext.tsx` — `isPlatformOwner`/`roleLoading` from Task 1
  - WHY: NAV_ITEMS is the single source of truth for nav; grouping it here is the entire UX deliverable.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` exit 0
  - [ ] Two labeled groups render for owners; only Workspace for non-owners
  - [ ] Platform Admin group hidden during `roleLoading`
  - [ ] Tools + Tenant Management appear under Platform Admin; Members stays under Workspace

  **QA Scenarios**:

  ```
  Scenario: Owner sees both groups
    Tool: Playwright
    Steps:
      1. Log in as owner
      2. Assert sidebar shows a "Platform Admin" label with AI Models, Platform Settings, Preflight, Tools, Tenant Management
      3. Assert "Members" is under Workspace, NOT Platform Admin
    Expected Result: correct grouping
    Evidence: .sisyphus/evidence/owner-section/task-6-owner-sidebar.png

  Scenario: Non-owner sees only Workspace
    Tool: Playwright
    Steps:
      1. Log in as seeded non-owner
      2. Assert NO "Platform Admin" group and none of its 5 items appear in the sidebar
    Expected Result: Platform Admin group absent
    Evidence: .sisyphus/evidence/owner-section/task-6-nonowner-sidebar.png
  ```

  **Commit**: `feat(dashboard): group sidebar into Workspace and Platform Admin sections`

- [x] 7. Wire owner routes under PlatformOwnerRoute in App.tsx

  **What to do**:
  - In `dashboard/src/App.tsx`, wrap the owner-only routes (`/dashboard/models`, `/dashboard/settings`, `/dashboard/preflight`, `/dashboard/tools`, `/dashboard/tools/:service/:toolName`, and the NEW Tenant Management route) in `<PlatformOwnerRoute>` — nested INSIDE the existing `ProtectedRoute > Layout` so the shell still renders and only access to these routes is role-gated.
  - Add the new route for `TenantManagementPage` (e.g. `/dashboard/admin/tenants` — pick a path that doesn't collide with the existing `/dashboard/tenants` TenantOverview).
  - Ensure the 403 page renders WITHIN the Layout shell (sidebar/header visible) so the user can navigate away.

  **Must NOT do**:
  - Do NOT change the route path of the existing `/dashboard/tenants` (TenantOverview) — the new admin page gets a DIFFERENT path.
  - Do NOT gate workspace routes (Tasks, Employees, Rules, Integrations, Members, Organizations) — they stay open to authenticated users.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — routing composition + guard nesting correctness
  - **Skills**: [`react-dashboard`]
    - `react-dashboard`: App.tsx route structure, nested routes

  **Parallelization**:
  - **Can Run In Parallel**: NO (integration point)
  - **Parallel Group**: Wave 3
  - **Blocks**: F-wave
  - **Blocked By**: 2, 5, 6

  **References**:
  - `dashboard/src/App.tsx:72-109` — all route defs; `ProtectedRoute` wrapper at ~80-83; add `PlatformOwnerRoute` nesting + the new route here
  - `dashboard/src/components/PlatformOwnerRoute.tsx` — guard from Task 2
  - `dashboard/src/pages/TenantManagementPage.tsx` — new page from Task 5
  - WHY: App.tsx is the single routing table; the guard must wrap only owner routes while keeping the Layout shell so the 403 is navigable.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` exit 0
  - [ ] All 5 owner routes wrapped in `PlatformOwnerRoute`; new Tenant Management route added
  - [ ] Workspace routes remain ungated
  - [ ] 403 renders inside Layout (sidebar/header still visible)

  **QA Scenarios**:

  ```
  Scenario: End-to-end owner routing
    Tool: Playwright
    Steps:
      1. As owner, visit each of: /dashboard/models, /dashboard/settings, /dashboard/preflight, /dashboard/tools, and the new Tenant Management route
      2. Assert each renders its real content
    Expected Result: all 5 load for owner
    Evidence: .sisyphus/evidence/owner-section/task-7-owner-routes.png

  Scenario: End-to-end non-owner blocking
    Tool: Playwright
    Steps:
      1. As seeded non-owner, visit each owner route directly by URL
      2. Assert each shows the 403 page WITH sidebar/header still visible
      3. Assert workspace routes (e.g. /dashboard/tasks) still load normally
    Expected Result: owner routes 403; workspace routes open
    Evidence: .sisyphus/evidence/owner-section/task-7-nonowner-routes.png
  ```

  **Commit**: `feat(dashboard): gate owner routes under PlatformOwnerRoute`

- [x] 9. Unit tests for platform-owner gating

  **What to do**:
  - Add Vitest + @testing-library tests under `dashboard/src/tests/` (or co-located `__tests__`) covering:
    - `PlatformOwnerRoute`: renders loading state when `roleLoading`; renders children when owner; renders AccessDenied when non-owner.
    - Sidebar grouping: Platform Admin group present when `isPlatformOwner`, absent otherwise; Members always under Workspace.
    - `globalRole` wiring: AuthContext exposes `globalRole`/`isPlatformOwner` derived correctly (mock `getMe`).
  - Mock `getMe()` / AuthContext value as needed (component-level tests, NOT a real network call).

  **Must NOT do**:
  - Do NOT write trivial `expect(true).toBe(true)` tests — assert real rendered output / branch behavior.
  - Do NOT require a live backend — mock the context/fetch.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — meaningful component tests with context mocking
  - **Skills**: [`react-dashboard`]
    - `react-dashboard`: existing test patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 7, but both are Wave 3; can run alongside)
  - **Parallel Group**: Wave 3
  - **Blocks**: F-wave
  - **Blocked By**: 2, 6

  **References**:
  - `dashboard/src/tests/approval-section.test.tsx`, `dashboard/src/tests/wizard-edit-step.test.tsx` — existing component-test patterns (render + assert + mock)
  - `dashboard/src/tests/smoke.test.tsx` — minimal render harness reference
  - `dashboard/package.json` — `"test": "vitest"`
  - WHY: matching the existing test style keeps the suite consistent and ensures the runner/config already supports these tests.

  **Acceptance Criteria**:
  - [ ] `cd dashboard && npx vitest run` passes including the new tests
  - [ ] Tests cover all 3 PlatformOwnerRoute branches + sidebar owner/non-owner grouping

  **QA Scenarios**:

  ```
  Scenario: Gating unit tests pass
    Tool: Bash
    Steps:
      1. cd dashboard && npx vitest run
      2. Assert exit 0 and the new test files report passing assertions for loading/owner/non-owner
    Expected Result: all tests green
    Evidence: .sisyphus/evidence/owner-section/task-9-vitest.log

  Scenario: Non-owner branch asserted
    Tool: Bash (vitest output inspection)
    Steps:
      1. Confirm a test renders PlatformOwnerRoute with a non-owner context and asserts AccessDenied is shown
    Expected Result: that specific test passes
    Evidence: .sisyphus/evidence/owner-section/task-9-nonowner-test.txt
  ```

  **Commit**: `test(dashboard): unit tests for platform-owner gating`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before declaring done. Never mark F1–F4 checked before user approval.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read this plan end-to-end. For each "Must Have": verify implemented (read the file, run the dashboard). For each "Must NOT Have": grep the diff for violations (no `authz.ts`/`permissions.ts` edits, no JWT `app_metadata` role read, no TenantOverview refactor, no Members move, no Preflight server gate). Confirm evidence files exist in `.sisyphus/evidence/owner-section/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm dashboard:build` + dashboard `vitest`. Review changed files for: `as any`/`@ts-ignore`, console.log, dead code, generic names, AI slop. Verify the 3-state loading guard exists and role checks read only from `AuthContext.globalRole`. Confirm SearchableSelect/card-shell/URL-state conventions where applicable.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      From clean browser state: (1) log in as owner → assert "Platform Admin" group shows all 5 items, each route loads. (2) log in as seeded non-owner → assert group ABSENT and each owner route renders the 403 page. (3) Verify no owner-nav/403 flash during load. (4) Tenant Management: list, show-deleted toggle, create-org. Save evidence to `.sisyphus/evidence/owner-section/final-qa/`.
      Output: `Owner sees [5/5] | Non-owner blocked [5/5] | No flash [PASS] | TenantMgmt [PASS] | VERDICT`

- [ ] F4. **Scope & State Fidelity** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 (nothing missing, nothing beyond spec). Confirm TenantOverview untouched, Members untouched, server middleware untouched, Header switcher untouched. Flag any unaccounted change.
      Output: `Tasks [N/N compliant] | Untouched-guarantees [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

-> Present consolidated F1–F4 results -> Get explicit user "okay" -> Done.

## Commit Strategy

- **Task 1**: `feat(dashboard): fetch and expose globalRole from /me in AuthContext` — `dashboard/src/contexts/AuthContext.tsx`, `dashboard/src/lib/gateway.ts`
- **Task 2+3**: `feat(dashboard): add PlatformOwnerRoute guard and AccessDenied page`
- **Task 4+5**: `feat(dashboard): add Tenant Management admin page + client methods`
- **Task 6**: `feat(dashboard): group sidebar into Workspace and Platform Admin sections`
- **Task 7**: `feat(dashboard): gate owner routes under PlatformOwnerRoute`
- **Task 9**: `test(dashboard): unit tests for platform-owner gating`
- **Task 8**: operational (seed script/doc) — evidence only, no app commit
- Pre-commit: `pnpm dashboard:build` clean for each

## Success Criteria

### Verification Commands

```bash
# Build + typecheck
pnpm dashboard:build   # exit 0

# Unit tests
cd dashboard && npx vitest run   # all pass incl. new gating tests

# Manual (agent via Playwright): owner sees group, non-owner gets 403
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Owner sees Platform Admin group (5 items); non-owner does not + 403 on direct nav
- [ ] No flash during /me load
- [ ] Tenant Management admin page works (list, show-deleted, create)
- [ ] Tests pass; build clean; F1–F4 APPROVE; user okay received
- [ ] **N. Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.
