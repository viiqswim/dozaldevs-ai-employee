# Learnings — production-auth-orgs-deployment

## [2026-06-09] Session Start

### Dockerfile.gateway structure

- Builder stage: `FROM node:22-alpine AS builder` → `RUN corepack enable pnpm` (line 4) → `RUN apk add --no-cache openssl` (line 6)
- Fix location: `ENV HUSKY=0` must go AFTER line 4 (`RUN corepack enable pnpm`) and BEFORE line 18 (`RUN pnpm install`)
- The prune step is at line 34: `RUN pnpm prune --prod` — this is what triggers husky
- Runner stage starts at line 67 — do NOT add HUSKY=0 there

### Cloud facts

- Render service ID: `srv-d8f1b2gg4nts738dj7jg`
- Live URL: `https://ai-employees-laaa.onrender.com`
- Cloud Supabase ref: `gjqrysxpvktmibpkwrvy` (us-west-2)
- Tenant IDs: DozalDevs `00000000-0000-0000-0000-000000000002`, VLRE `00000000-0000-0000-0000-000000000003`

### JWT profile detection (CRITICAL)

- `SUPABASE_ANON_KEY` must be `sb_publishable_*` AND `SUPABASE_URL` must be `https://...supabase.co`
- Mixing LOCAL and CLOUD values causes fatal crash at boot
- `detectEnvProfile()` in `src/lib/config.ts`

### Env PUT safety

- Render PUT /env-vars REPLACES ALL env vars — any missing key is deleted
- Always GET + save before PUT, re-GET after to verify
- Known existing keys to preserve: ENCRYPTION_KEY, SERVICE_TOKEN, FLY_API_TOKEN, FLY_WORKER_APP, FLY_WORKER_IMAGE, SLACK_APP_TOKEN, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_REDIRECT_BASE_URL, OPENROUTER_API_KEY, OPENCODE_GO_API_KEY, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY, GATEWAY_PUBLIC_URL, WEBHOOK_PUBLIC_URL, WORKER_RUNTIME, NODE_ENV, DATABASE_URL, DATABASE_URL_DIRECT, COST_LIMIT_USD_PER_DEPT_PER_DAY
- REMOVE: ADMIN_API_KEY (removed from code in T24)

### Migration

- File: `prisma/migrations/20260609000000_add_user_auth_rbac/migration.sql`
- NOT idempotent — no IF NOT EXISTS on CREATE TYPE/TABLE/POLICY
- Recovery if partial: DROP TABLE IF EXISTS tenant_invitations, tenant_memberships, users CASCADE; DROP TYPE IF EXISTS "TenantRole", "Role" CASCADE; then re-run
- After migration: NOTIFY pgrst, 'reload schema'; to reload PostgREST cache

### Owner seed

- Script: `scripts/seed-platform-owner.ts`
- Auth API works from anywhere over HTTPS
- Prisma step needs cloud DB reach (may need SQL fallback)
- SQL fallback written in plan A10

## [2026-06-10] A2 — Deploy push and diagnosis

### Branch protection on main
- GitHub repo has a branch protection rule: changes must go through a pull request
- `git push origin main` was rejected: "Changes must be made through a pull request"
- Solution: Create branch `fix/husky-docker-prune`, push it, create PR (#10), merge it
- The `gh pr merge` command was silent (no output) but the merge succeeded — verify with `gh pr view 10 --json state`

### A1 fix result: Build NOW succeeds
- Previous 2 deploys: `build_failed` (Docker build crashed due to husky running on `pnpm prune --prod`)
- Current deploy (merge commit `3c0d9906`): `build_succeeded` then `update_failed` — **completely different failure**
- The HUSKY=0 fix is confirmed working — build no longer fails

### update_failed = runtime crash (nonZeroExit: 1)
- `update_failed` is distinct from `build_failed`:
  - `build_failed`: Docker image couldn't be built
  - `update_failed`: Docker image built fine, but container crashed on startup
- `nonZeroExit: 1` = Node.js process threw and exited at startup
- Most likely cause: `requireEnv()` called on a missing env var at gateway boot

### Missing env vars on Render (verified via GET /env-vars)
Current Render env vars MISSING that were added by user-auth-orgs (PR #9):
1. `SERVICE_TOKEN` — required for auth middleware (Bearer token auth)
2. `SUPABASE_URL` — required for detectEnvProfile() in src/lib/config.ts
3. `SUPABASE_ANON_KEY` — required for detectEnvProfile() (determines LOCAL vs CLOUD profile)
4. `SUPABASE_SECRET_KEY` — required for admin Auth API calls (invitations)

Additionally missing (email features in PR #9):
- `RESEND_API_KEY` (optional, used for production email — falls back to Mailpit if absent)
- `DASHBOARD_BASE_URL` (has default: http://localhost:7700, but prod should be set to the Render URL)

### Stale env var to REMOVE from Render
- `ADMIN_API_KEY` — removed from code in T24, still present on Render (harmless but stale)
- `COST_LIMIT_USD_PER_DEPT_PER_DAY` — moved to platform_settings table (stale)

### Render API quirk: update_failed polling
- Polling loop only checked for `live`, `build_failed`, `canceled`
- `update_failed` is also a terminal state that should break the loop
- Add it to the break condition in future poll scripts

## A7: Render env PUT — 2026-06-10

### Process that worked
1. GET with `?limit=100` → save as before-state (23 keys found)
2. Build merged array with jq: extract `{key, value}` pairs, filter stale, append new
3. PUT with `@$MERGED_FILE` (file reference avoids shell quoting issues for long arrays)
4. Re-GET → verify using `jq -r '.[] | .envVar.key'` (NOT `jq -r '[.[] | .envVar.key]'` — the array form produces JSON with brackets/commas that breaks `comm` comparisons)

### jq gotcha
`jq -r '[.[] | .envVar.key]'` outputs a JSON array (with `[`, `"`, `,` characters).  
`jq -r '.[] | .envVar.key'` outputs one key per line — correct for `grep -qxF` and `comm` comparisons.

### Evidence files
- `.sisyphus/evidence/deploy-A7-env-before.json` — rollback artifact (23 keys)
- `.sisyphus/evidence/deploy-A7-env-after.json` — verified state (25 keys)
- `.sisyphus/evidence/deploy-A7-diff.txt` — human-readable diff report
- `.sisyphus/evidence/deploy-A7-env-merged.json` — the payload sent to Render PUT

### Result
- 3 stale vars removed: ADMIN_API_KEY, COST_LIMIT_USD_PER_DEPT_PER_DAY, GATEWAY_URL
- 5 new vars added: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY, SERVICE_TOKEN, INNGEST_DEV
- All 20 prior secrets preserved (including ENCRYPTION_KEY — critical)

## A8 — Deploy + Health + Config Verification (2026-06-10)

- **Deploy triggered successfully**: `dep-d8kfa68jo6nc73fg4el0` → `live` in ~36s (very fast build)
- **jq parse error on multi-line variable**: When env vars contain `\n` or control chars, jq fails on the response. Workaround: use `| cat` to see raw response first, then parse manually.
- **`/health` returns `{"status":"ok"}` on 200** — confirms CLOUD profile boot succeeded
- **`/api/config.js` confirms**: `VITE_POSTGREST_URL` and `VITE_SUPABASE_ANON_KEY=sb_publishable_*` are populated correctly
- **Gateway boots with CLOUD profile** when `SUPABASE_ANON_KEY=sb_publishable_*` and `SUPABASE_URL=https://*.supabase.co` are set

## F3 — Live Production QA (2026-06-10, final wave)

### Real-browser login verified end-to-end
- Started from existing Snobahn session → clicked "Sign out" to force clean state → /dashboard/login
- Login form fields: textbox "Email" + textbox "Password" + button "Sign in" (also a "Continue with Google" option)
- Login as victor@dozaldevs.com / Test1234! succeeds → redirects to /dashboard/?tenant=...0004 (Snobahn default tenant)

### Asserting /me from the browser session (the reliable pattern)
- The Supabase access_token lives in localStorage under a key containing `auth-token` (JSON value with `.access_token`)
- From the logged-in page, run a Playwright evaluate that pulls that token and does `fetch('/me', {headers:{Authorization:'Bearer '+token}})`
- /me returned 200: globalRole=PLATFORM_OWNER, status=active, id=c8756182-9d33-431f-89a0-89efd23c789f
- This is the proper way to assert role — "dashboard loads" alone is insufficient

### Members page works for BOTH tenants (no 403)
- API: GET /admin/tenants/{id}/members → 200 for VLRE (...0003) and DozalDevs (...0002); victor is OWNER in both (joined 2026-06-10T05:37)
- UI route: /dashboard/members?tenant={id} — renders "Organization Members" + members table; org switcher reflects the tenant
- DozalDevs members page also shows a Pending Invitations table with wave2-cloud-invitee@dozaldevs.io (Member, expires Jun 16, 2026)

### Note: tasks endpoint 500 on Snobahn tenant
- On the default dashboard landing (tenant ...0004 = Snobahn), the tasks panel showed "Gateway error 500 on /admin/tenants/...0004/tasks". Not in F3 scope (auth/members all green), but worth flagging — Snobahn tenant tasks query is erroring in prod.

### Verdict
- Login [PASS] | Members [2/2] | Invite E2E [N/A — Phase B/Resend DNS pending] | VERDICT: APPROVE

## [2026-06-10] B3 — Invite E2E (FULL LIFECYCLE PASS)

### Result: APPROVE — full invite→email→accept→membership lifecycle verified in production

### IDs captured
- Invitation id: `5f7a6665-f98b-4a59-a742-2579054e52e3` (VLRE tenant ...0003, role MEMBER)
- Invitation token: fetched from PostgREST (POST response does NOT return the token — see gotcha below)
- New app user id: `3e647ba2-eeb1-4527-ac0c-abfc9d88d8f1` (supabase_id `fe06afd4-af0b-4088-8da8-54e0fca55956`)
- Resend message id (proof of accepted send): `a0f9b33e-2604-4130-a80c-ac2d9fa1c0e5` → `last_event: delivered`

### GOTCHA 1 — POST /admin/.../invitations does NOT return the token
- Response shape is `{id, email, role, status, expiresAt}` only (admin-invitations.ts:269-275). No `token` field.
- The token is emailed to the user. For E2E you must read it from PostgREST:
  `GET /rest/v1/tenant_invitations?email=eq.<urlenc>&status=eq.pending&select=token` (use SUPABASE_SECRET_KEY)
- The plan's Step 4 assumed `token` was in the POST response — it is not. Update future runs accordingly.

### GOTCHA 2 (REAL BUG, robustness) — /invitations/accept returned a transient 500 (raw HTML) from the browser
- The AcceptInvitePage submit does set-password → signInWithPassword → acceptInvitation in one handler (AcceptInvitePage.tsx:50-57).
- The browser's accept POST hit HTTP 500 with a raw Express HTML body ("<pre>Internal Server Error</pre>"), NOT the JSON sendError shape. This means the error escaped the handler's try/catch.
- The accept route uses `$transaction(..., { isolationLevel: 'Serializable' })` (admin-invitations.ts:292,366). A Serializable serialization-failure (P2034/40001) thrown by Prisma surfaces as a non-Error-with-code and falls through to the 500 path — but Prisma's connection-pool/serialization error can also bypass the JSON handler entirely under load, yielding Express's default HTML 500.
- A plain `curl` retry of the SAME token immediately succeeded with 200 `{"message":"Invitation accepted"}`. So the path is correct; the failure was transient.
- DB state after the browser 500: invitation still `pending` (tx rolled back cleanly — good), app `users` row already created by ensureUserExists during the authed call, NO membership. After the curl retry: invitation `accepted`, membership MEMBER created. No partial/corrupt state — the Serializable tx is atomic.
- RECOMMENDATION (not in B3 scope, do not fix here): the frontend `acceptInvitation` should retry on 500/40001, or the handler should catch Prisma serialization errors and return a 409/retryable JSON instead of leaking HTML 500. File as a follow-up.

### Verified end-to-end (all green)
- Resend: message to victor+test@dozaldevs.com, subject "You've been invited to join VLRE", last_event=delivered (independent of "email sent")
- Invitation status → `accepted`, accepted_at 2026-06-10T13:07:12Z
- tenant_memberships: new user `3e647ba2` in VLRE ...0003, role=MEMBER, deleted_at=null, joined_at 2026-06-10T13:07:12Z
- Browser /me proof: signed-in as victor+test@dozaldevs.com, /me 200 (USER/active), /me/tenants shows VLRE tenantRole=MEMBER
- Negative test: bogus token → 404 NOT_FOUND (clean JSON, not 500); missing token → 400 MISSING_TOKEN

### Note on EMAIL_FROM
- Confirmed `DozalDevs <noreply@dozaldevs.com>` apex domain is live and delivering in prod (both test sends delivered).

### Evidence: .sisyphus/evidence/deploy-B3-invite-e2e/
- invite-create.json, resend.json, accept.png, membership.txt, negative.txt — verified no secrets leaked into any file.
