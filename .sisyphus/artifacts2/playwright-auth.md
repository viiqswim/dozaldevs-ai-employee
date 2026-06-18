# Playwright Dashboard Auth — Task 7

**Date:** 2026-06-17
**Goal:** Establish an authenticated Playwright session against the dashboard and confirm the
employee-creation wizard is reachable (no description submitted).

## Result: PASS

- Authenticated as a `PLATFORM_OWNER` and reached the wizard description box.
- NOT redirected to login at the wizard URL.
- Screenshot: `.sisyphus/evidence2/task-7-wizard-auth.png` (957×541 PNG).
- Reusable browser session: `.sisyphus/artifacts2/playwright-storage-state.json`.

---

## How auth was established

The dashboard requires a Supabase JWT (email/password). The login flow calls
`supabase.auth.signInWithPassword` (`dashboard/src/pages/LoginPage.tsx`) and persists the token to
`localStorage['supabase_access_token']` plus the supabase-js session key `sb-localhost-auth-token`
(`dashboard/src/contexts/AuthContext.tsx`).

### Credentials used

A purpose-built seeded user already exists — `playwright-auth@test.local`, role `PLATFORM_OWNER`
(supabase_id `183ec8f1-b3eb-488d-b404-9275c5c9c3b7`). It had no recorded password, so I reset it
via the Supabase admin API (service-role key from `.env` → `SUPABASE_SECRET_KEY`):

```bash
# Auth server is on port 54331 (NOT 54321 — see gotcha below)
curl -X PUT "http://localhost:54331/auth/v1/admin/users/183ec8f1-b3eb-488d-b404-9275c5c9c3b7" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -d '{"password":"PlaywrightAuth123!","email_confirm":true}'
```

- **Email:** `playwright-auth@test.local`
- **Password:** `PlaywrightAuth123!`
- **Role:** `PLATFORM_OWNER` (OWNER membership in both DozalDevs + VLRE tenants)

### Method

Drove the real login form with Playwright (fill email + password → click "Sign in") rather than
injecting a token. This lets supabase-js write its own session correctly. After submit, the app
redirected to `http://localhost:7700/dashboard/?tenant=00000000-0000-0000-0000-000000000002`
(authenticated home), confirming the session took.

A direct password-grant token can also be obtained for API use:

```bash
curl -X POST "http://localhost:54331/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" -H "apikey: $SUPABASE_ANON_KEY" \
  -d '{"email":"playwright-auth@test.local","password":"PlaywrightAuth123!"}'
# -> { access_token (628 chars, HS256), refresh_token, expires_in: 3600 }
```

### Session details (live in browser)

| Field                                | Value                                                              |
| ------------------------------------ | ------------------------------------------------------------------ |
| localStorage `supabase_access_token` | present, 628 chars, HS256 (`eyJhbGciOiJIUzI1...`)                  |
| supabase-js key                      | `sb-localhost-auth-token`                                          |
| session user                         | `playwright-auth@test.local`                                       |
| `expires_at`                         | 1781721001 → 2026-06-17T18:30:01Z (1h TTL; refresh_token present)  |
| `selected_tenant_id`                 | `00000000-0000-0000-0000-000000000002` (DozalDevs — last selected) |

Re-use: load `playwright-storage-state.json` and write each `localStorage` entry on origin
`http://localhost:7700` before navigating. Token TTL is 1h; if expired, re-run the password grant
or re-drive the login form.

---

## Wizard accessibility — CONFIRMED

- **URL:** `http://localhost:7700/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
- URL stayed on the wizard after navigation — **no redirect to `/dashboard/login`**.
- Page heading: **"Create New Employee"**.
- **Description textarea IS visible** — placeholder:
  _"e.g., An employee that reads our #support Slack channel every morning and sends a summary of
  unresolved customer issues to #support-summary..."_
- Character counter **"0/2000"** and a **disabled "Generate"** button below the textarea
  (Generate enables once text is entered).
- Helper copy: _"Describe what you want your AI employee to do. Be specific about its tasks,
  schedule, and any tools it should use."_

> No description was submitted and no employee was created (per task scope — that is Wave 3).

---

## UI conventions observed

### 1. SearchableSelect (org/tenant switcher)

The header org switcher (button labeled "VLRE") is a `SearchableSelect`. Clicking it opens a
combobox with an active **"Search organizations…"** text input plus a scrollable, type-to-filter
option list: DozalDevs, VLRE, Snobahn, DozalDevs - Leo, DozalDevs - 2026-06-16-0031. This matches
the `react-dashboard` skill's rule #1 (every dropdown uses `SearchableSelect`, never Radix
`<Select>`) and the canonical reference `dashboard/src/components/layout/Header.tsx`.

### 2. URL-encoded navigation (`useSearchParams`)

Navigable state is URL-encoded. The selected org is carried as `?tenant=<uuid>` across routes
(react-dashboard skill rule #2; `TenantUrlSync` in `Layout.tsx`). The wizard correctly honored the
`?tenant=00000000-0000-0000-0000-000000000003` (VLRE) param from the URL even though
`localStorage.selected_tenant_id` was DozalDevs — i.e. the URL param wins for the active view,
exactly as the convention intends (shareable/refresh-safe).

### 3. Plain-language end-user copy (rule #4)

Sidebar nav labels the org list **"Organizations"** (→ `/dashboard/tenants`), not "Tenants" — the
live trap noted in the react-dashboard skill is **already fixed** here. The org switcher placeholder
is "Search organizations…". (One internal-leaning label remains in the Platform Admin section:
"Tenant Management" → `/dashboard/admin/tenants` — out of scope for this task, noted only.)

### 4. Card shell

The wizard description block and the login card both use the `rounded-lg border bg-card px-5 py-4`
shell (react-dashboard skill rule #3).

---

## Gotchas discovered

- **Supabase Auth/PostgREST port is 54331, not 54321.** The task instructions and some env docs
  reference `:54321` (that's Kong/API gateway), but the GoTrue auth server and PostgREST answer on
  **`:54331`** locally (`SUPABASE_URL="http://localhost:54331"` in `.env`). `:54321` returned empty
  on `/auth/v1/health`; `:54331` returned the GoTrue health payload. Use **54331** for all
  local auth token calls.
- **users table column is `role`, not `global_role`.** The `users` table uses a `role` enum
  (`PLATFORM_OWNER` | `USER`). The task's sample query referenced a non-existent `global_role`
  column. (The `/me` API exposes it as `globalRole` in camelCase, but the DB column is `role`.)
- **No WebGL issue on this dashboard.** The headless-Playwright WebGL caveat applies to the
  separate dozaldevs-public marketing site (Three.js water ripple), not this React dashboard —
  headless Playwright rendered the dashboard login + wizard fine.
