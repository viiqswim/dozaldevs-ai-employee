# Learnings

## [2026-06-10] Plan: platform-owner-section

### Key Discoveries

- Dashboard NEVER calls `GET /me` today — `globalRole` is completely absent from all client state
- `AuthContext` only holds raw Supabase session (no globalRole)
- `ProtectedRoute` is auth-only (session check, no role check)
- Sidebar `NAV_ITEMS` is flat, unconditional — all items render for everyone
- `GET /me` returns `{ id, email, name, globalRole, status }` where `globalRole ∈ {PLATFORM_OWNER, ADMIN, EDITOR, USER, VIEWER, SERVICE}`
- `GET /admin/tenants` exists, gated MANAGE_TENANTS (PLATFORM_OWNER only), returns `{ tenants }`, supports `?include_deleted=true`
- `POST /admin/tenants` (create) exists at admin-tenants.ts:27-61
- `gateway.ts` has NO `getMe()` or `listAllTenants()` — both must be added
- Backend gating already complete for all owner routes — client gating is UX only
- New Tenant Management route: `/dashboard/admin/tenants` (avoids collision with `/dashboard/tenants`)

### Patterns to Follow

- `use-tenant.ts:35-110` — canonical "fetch-after-session" pattern for `/me` fetch
- `ModelCatalogPage.tsx` — canonical table + URL-state + create-dialog pattern
- `ProtectedRoute.tsx:5-21` — exact pattern to mirror for `PlatformOwnerRoute`
- `scripts/seed-platform-owner.ts` — pattern for creating Supabase Auth user + app users row

### Conventions

- SearchableSelect for ALL dropdowns (never Radix Select for user-facing lists)
- Card shells: `rounded-lg border bg-card px-5 py-4`
- URL-encoded state: `useSearchParams` + copy-prev params
- End-user language: "Organization" not "Tenant", "Employee setup" not "Archetype"
- `sendError`/`sendSuccess` for all gateway responses

### Test Identities

- Owner: `victor@dozaldevs.com` / `Test1234!` (PLATFORM_OWNER)
- Non-owner: seeded USER-role account (Task 8 creates this)

### [Task 1 done] getMe() + AuthContext globalRole

- Added `MeResponse` type (`{ id, email, name, globalRole: string, status }`; id/email/name nullable for SERVICE_TOKEN) + `getMe()` to `gateway.ts`
- Extended `AuthContext`: `globalRole: string | null`, `roleLoading: boolean`, `isPlatformOwner` (derived `=== 'PLATFORM_OWNER'`)
- Used SEPARATE `[session]` effect (mirrors use-tenant.ts:61-84) — NOT folded into the session effect; cleaner cancellation + reset-on-logout
- `roleLoading` starts `false`, flips true→false around fetch; resets to false + globalRole=null when `!session`
- Existing `session`/`user`/`loading`/`signOut` shape unchanged (additive only)
- `pnpm dashboard:build` exit 0

### [Task 8 done] Non-Owner Test User

- Non-owner test user: `testuser@dozaldevs.com` / `Test1234!` (global role: USER)
- App User ID: `880a2c79-788c-4252-80d1-22e21175151f`
- Supabase ID: `9a8954cd-c316-46a9-a0ef-6a8b87264b55`
- Tenant memberships: DozalDevs(MEMBER), VLRE(MEMBER)
- Script: `scripts/seed-nonowner-user.ts` (idempotent, mirrors seed-platform-owner.ts pattern)
- Auth endpoint: `http://localhost:54331/auth/v1/token?grant_type=password` (Kong on 54331, NOT 54321)
- `GET /me` confirmed returns `globalRole: "USER"`
- Evidence: `.sisyphus/evidence/owner-section/task-8-nonowner-user.txt` + `task-8-nonowner-me.json`

### [Task 2 done] PlatformOwnerRoute guard

- Created `dashboard/src/components/PlatformOwnerRoute.tsx` — 3-state role guard mirroring `ProtectedRoute.tsx`
- States: `roleLoading` → "Loading…" spinner (same markup as ProtectedRoute); `isPlatformOwner` → `<Outlet/>`; else → `<AccessDeniedPage/>`
- KEY: it's a route guard (renders `<Outlet/>`, no `children` prop) vs ProtectedRoute which is a wrapper (`{children}`) — App.tsx Task 7 will use it as a layout route element
- Only consumes `roleLoading` + `isPlatformOwner` from `useAuth()` — no session/auth logic (ProtectedRoute wrapper handles auth upstream)
- Non-owners get in-app 403 (`<AccessDeniedPage/>`), NOT a redirect — preserves URL, renders inside Layout shell (per plan decision)
- `tsc -b` exit 0 (run via `pnpm exec tsc`; bare `tsc`/`tsc -b` hits asdf "No version set" 126 — always use `pnpm exec` or `pnpm dashboard:build`)
- BUILD GOTCHA: zsh uses `$pipestatus` array not `${PIPESTATUS[@]}`; piping build output yields empty `PIPESTATUS` — verify exit separately with `pnpm exec tsc -b; echo $?`

## Task 2 — Sidebar split (NAV_ITEMS → WORKSPACE + PLATFORM_ADMIN)

### Approach
- Split flat `NAV_ITEMS` into `WORKSPACE_NAV_ITEMS` (6 items) and `PLATFORM_ADMIN_NAV_ITEMS` (5 items)
- Extracted `renderNavItem` helper inside component to share rendering logic across both groups
- `useAuth()` provides `isPlatformOwner` and `roleLoading`; Platform Admin group only renders when `!roleLoading && isPlatformOwner`
- Added `Shield` icon (lucide-react) for Tenant Management (`/dashboard/admin/tenants`)
- Used `overflow-y-auto` on `<nav>` so both groups are scrollable if sidebar height is tight

### ?tenant= threading
- No change needed — `TenantUrlSync` in `Layout.tsx` handles injecting `?tenant=` on every navigation automatically. NavLinks use plain `/dashboard/*` paths.

### healthDot
- Preserved as-is — `renderNavItem` passes `healthDot` through; dotColor/dotTitle computed from `preflightStatus` same as before.

### Build
- `pnpm dashboard:build` exits 0. Chunk-size warning is pre-existing, not a regression.

### [Task 5 done] TenantManagementPage.tsx

- File: `dashboard/src/pages/TenantManagementPage.tsx`
- Follows `ModelCatalogPage.tsx` structure exactly (useCallback load, setLoading/setLoadError, useSearchParams URL state)
- `?deleted=true` URL toggle re-triggers `useCallback` via the `showDeleted` dep — no manual refetch needed
- 409 detection: checks for `'409'`, `'conflict'`, `'already'` in error message (gateway error format)
- Slug field strips invalid chars inline via `onChange` (only `[a-z0-9-]` allowed)
- Enter key submits form in both name/slug inputs
- `StatusBadge` uses `default` variant for active, `secondary` for everything else
- `pnpm dashboard:build` exit 0 (tsc -b clean + vite build clean)

### [Task 7 done] Wire owner routes under PlatformOwnerRoute in App.tsx

- Added imports: `PlatformOwnerRoute` (from `./components/PlatformOwnerRoute`), `TenantManagementPage` (from `./pages/TenantManagementPage`)
- Nested a layout route `<Route element={<PlatformOwnerRoute />}>` INSIDE the existing `ProtectedRoute > Layout` group — so Layout shell (sidebar/header) always renders, and the 403 (`AccessDeniedPage` via PlatformOwnerRoute's non-owner branch) shows within the shell
- Gated EXACTLY 6 routes: `/dashboard/preflight`, `/dashboard/tools`, `/dashboard/tools/:service/:toolName`, `/dashboard/models`, `/dashboard/settings`, `/dashboard/admin/tenants` (new → TenantManagementPage)
- Workspace routes left UNGATED: tasks, employees(+new/edit/trigger/detail), `/dashboard/tenants` (TenantOverview — UNCHANGED), integrations, rules, members
- KEY: `/dashboard/tenants` (TenantOverview, workspace) vs `/dashboard/admin/tenants` (TenantManagementPage, owner-only) — distinct paths, no collision
- `pnpm dashboard:build` exit 0 (tsc -b clean + vite build clean; chunk-size warning pre-existing)
- LSP diagnostics tool unusable in this repo (asdf "No version set for typescript-language-server", code 126) — rely on `tsc -b` via `pnpm dashboard:build` for type verification

### [Task 9 done] Vitest unit tests for owner gating

- 3 new test files under `dashboard/src/tests/`:
  - `platform-owner-route.test.tsx` — 3 branches (roleLoading→"Loading…" spinner, owner→Outlet children, non-owner→AccessDeniedPage). Uses `MemoryRouter`+`Routes`+nested `Route element={<PlatformOwnerRoute/>}` to exercise the `<Outlet/>` (it's a layout route, NOT a children-wrapper).
  - `sidebar-grouping.test.tsx` — Platform Admin group present when `isPlatformOwner` true+!roleLoading; absent for non-owner; absent while roleLoading; Members ALWAYS present (Workspace group). Needs `MemoryRouter` (NavLink) + a full `PreflightStatus` prop object.
  - `auth-context-role.test.tsx` — mocks `@/lib/supabase` (getSession/onAuthStateChange) + `@/lib/gateway` getMe; renders `AuthProvider`+probe; asserts globalRole/isPlatformOwner for PLATFORM_OWNER, USER, and getMe-rejects fallback (null/false).
- KEY MOCK PATTERN: `vi.hoisted()` holder object + factory references it. `vi.mock` factories are hoisted above imports, so a plain top-level `let` CANNOT be referenced inside the factory — `vi.hoisted` is the canonical fix. Mutate `holder.current` per-test in `beforeEach`/test body.
- AuthContext test MUST mock `@/lib/supabase` — importing the real one calls `createClient()` at module load (`export const supabase = createSupabaseClient()`), and the real `getSession()` would never resolve a session in jsdom, so the role-fetch effect never fires.
- `supabase.auth.onAuthStateChange` mock MUST return `{ data: { subscription: { unsubscribe } } }` — AuthProvider's cleanup calls `subscription.unsubscribe()`; omitting it throws on unmount.
- Async assertions use `waitFor()` — the getMe fetch resolves in a `[session]` effect after initial render, so role text isn't synchronous.
- VERIFY: `cd dashboard && npx vitest run` → 9 files / 41 tests pass (was 6 files before). New tests: 10 passing. `pnpm exec tsc -b` exit 0.
- LSP diagnostics STILL unusable (asdf "No version set for typescript-language-server", code 126) — confirmed again; `tsc -b` is the only typecheck path.
- Evidence: `.sisyphus/evidence/owner-section/task-9-vitest.log`
