# Playwright Authenticated Session — Dashboard Wizard

Reusable authenticated Playwright session against the local dashboard
(`http://localhost:7700/dashboard/`). Confirmed reaching the employee-creation
wizard for the **VLRE** tenant without being redirected to login.

## Auth approach used

The dashboard authenticates via **Supabase email/password** (`signInWithPassword`).
There are **no auth cookies** — the session lives entirely in **`localStorage`**
on the `http://localhost:7700` origin. This means Playwright `storageState` fully
captures the session.

Approach (deterministic, reproducible):

1. **Seed a known PLATFORM_OWNER** with a password we control (idempotent script):

   ```bash
   BOOTSTRAP_OWNER_EMAIL=playwright-auth@test.local \
   BOOTSTRAP_OWNER_PASSWORD='Playwright-E2E-2026!' \
   pnpm exec tsx scripts/seed-platform-owner.ts
   ```

   - `scripts/seed-platform-owner.ts` creates the user in Supabase Auth
     (`email_confirm: true`), upserts the app `users` row with
     `role = PLATFORM_OWNER`, and creates `OWNER` memberships in **both** seeded
     tenants (DozalDevs + VLRE).
   - **PLATFORM_OWNER bypasses all tenant membership checks** in
     `requireTenantRole` / `requirePermission`, so this single user can reach the
     VLRE wizard (tenant `00000000-0000-0000-0000-000000000003`) directly.
   - **Why a fresh email:** the seed script does NOT reset the password for an
     existing Supabase user (the 422-already-exists path only looks up the id). A
     new email guarantees our known password is actually set. Existing DB users
     (`victor@dozaldevs.com`, `owner@test.com`) have unknown passwords — do not
     rely on them.

2. **Log in through the real login form** (drives the actual `supabase-js` flow so
   every localStorage key the app expects gets written):
   - Navigate to `http://localhost:7700/dashboard/` → if unauthenticated it
     redirects to `/dashboard/login`.
   - Fill `getByRole('textbox', { name: 'Email' })` and
     `getByRole('textbox', { name: 'Password' })`, click
     `getByRole('button', { name: 'Sign in' })`.
   - On success it redirects to `/dashboard/?tenant=00000000-0000-0000-0000-000000000002`.

3. **Save storage state** for reuse:
   ```js
   await page.context().storageState({ path: '.sisyphus/artifacts/playwright-storage-state.json' });
   ```

### Reusing the session in a future Playwright run

Create the context with the saved state — no re-login needed:

```js
const context = await browser.newContext({
  storageState: '.sisyphus/artifacts/playwright-storage-state.json',
});
const page = await context.newPage();
await page.goto(
  'http://localhost:7700/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003',
);
// lands on the wizard directly, authenticated as PLATFORM_OWNER
```

> Note: the Playwright **MCP** browser used for this task does not accept a
> `storageState` option at navigate time — it persists its own browser profile
> across calls, so within one MCP session you stay logged in automatically. The
> saved JSON is for **scripted** `chromium.launch()` / `newContext()` runs and as
> a portable record of the session.

## Storage state path

`.sisyphus/artifacts/playwright-storage-state.json`

Captured localStorage keys on `http://localhost:7700`:
| Key | Purpose |
| --- | --- |
| `sb-localhost-auth-token` | supabase-js full session object (access + refresh token) — the one that actually rehydrates the session on load |
| `supabase_access_token` | raw JWT the app's gateway client (`getMe`, admin calls) reads for the `Authorization: Bearer` header |
| `selected_tenant_id` | last-selected org (URL `?tenant=` is the source of truth, but this seeds the switcher) |

**Reusability proven:** the saved `supabase_access_token` authenticates against the
gateway:

```
GET /me  →  email: playwright-auth@test.local | globalRole: PLATFORM_OWNER | status: active
```

## Selector for the description textarea

The wizard's first step is `describe` (see
`dashboard/src/panels/employees/CreateEmployeePage.tsx`). The description input is
the **only `<textarea>` on the page in this step**.

| Strategy                             | Selector                                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recommended (role + placeholder)** | `page.getByRole('textbox', { name: /reads our #support Slack channel/ })`                                                                          |
| Placeholder (exact-ish)              | `page.getByPlaceholder(/An employee that reads our #support/)`                                                                                     |
| Raw CSS                              | `main textarea` (single textarea in the `describe` step)                                                                                           |
| Full placeholder text                | `"e.g., An employee that reads our #support Slack channel every morning and sends a summary of unresolved customer issues to #support-summary..."` |

Constraints (enforced in the component):

- `maxLength={2000}` on the textarea.
- **Generate** button is `disabled` when `description.length < 10 || description.length > 2000`
  → valid range is **10–2000 chars**.
- Char counter renders as `{length}/2000` (starts at `0/2000`).

The **Generate** button: `page.getByRole('button', { name: 'Generate' })`.

## Which wizard step has the description input

Step **`describe`** (the initial step). `WizardStep` type:
`'describe' | 'edit' | 'previewing' | 'preview' | 'saving' | 'error'`.

- The same `description` state var is reused as the chat reply box once a
  conversation starts (`inChatMode`), but on first load it is the standalone
  description textarea + Generate button.
- After clicking Generate, the flow either asks a clarifying question (chat mode,
  same input box, **Send** button) or jumps to the `edit` step. **Do not click
  Generate for this auth task** — submitting a description is out of scope (Wave 2).

## Dashboard conventions (confirmed)

- **SearchableSelect, not native `<select>`** — every dropdown (org switcher,
  status/employee filters, Slack-channel pickers in the edit step) is the
  combobox from `dashboard/src/components/ui/searchable-select.tsx`. In snapshots
  they appear as a `button` showing the current value (e.g. `button "VLRE"`,
  `button "All Statuses"`) that opens a searchable list — never an HTML
  `<select>`/`<option>`. Drive them by clicking the button, then typing to filter
  and clicking the option.
- **URL-encoded navigation** — tenant selection and all navigable state are in the
  URL via `useSearchParams`. The wizard is tenant-scoped purely through
  `?tenant=<uuid>`; switching orgs updates `?tenant=` while preserving other
  params. The screenshot confirms the header switched to **VLRE** when navigating
  to `?tenant=00000000-0000-0000-0000-000000000003`.

## Gotchas

- **No CDP/WaterRipple issue here.** The Three.js/WebGL `connectOverCDP` workaround
  from the global AGENTS notes applies to the `dozaldevs-public` marketing site,
  **not** this dashboard. The standard Playwright MCP browser renders this
  dashboard fine (headless OK).
- **`tsx` is not on PATH** — use `pnpm exec tsx ...` (bare `tsx` → "command not found").
- **Seed script won't reset an existing user's password.** If you reseed with an
  email that already exists in Supabase Auth, your `BOOTSTRAP_OWNER_PASSWORD` is
  ignored (422 path only resolves the id). Use a fresh email or reset the password
  via the Supabase admin API.
- **Two console errors on the dashboard are pre-existing background noise** (SSE /
  preflight polling), not auth failures — login still succeeds.
- **localStorage, not cookies** — if you ever inject the session manually instead
  of logging in, you must set `sb-localhost-auth-token` (the supabase-js session
  blob), not just `supabase_access_token`; the access-token-only key won't rehydrate
  the `supabase.auth` session on reload.
- **Token expiry** — the access token is a short-lived JWT (`GOTRUE_JWT_EXP=3600`,
  1h). The saved `sb-localhost-auth-token` includes the refresh token, so
  supabase-js auto-refreshes on load; for long-lived scripted reuse, re-run the
  login if `/me` starts returning 401.

## Credentials (local-only test user)

- Email: `playwright-auth@test.local`
- Password: `Playwright-E2E-2026!`
- Role: `PLATFORM_OWNER` (OWNER membership in DozalDevs + VLRE)
- Supabase id: `183ec8f1-b3eb-488d-b404-9275c5c9c3b7`
- App user id: `5cfc2009-ccf2-4808-be11-709163d056e2`

(Local dev throwaway account on the local Supabase stack — safe to record here;
not a production credential.)
