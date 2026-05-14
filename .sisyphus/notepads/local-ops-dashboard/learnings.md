# Learnings — local-ops-dashboard

## [2026-05-14] Session Start

- Plan: 18 implementation tasks + 4 final verification, 6 waves
- Stack: React + Vite + shadcn/ui + Tailwind, embedded in Express gateway at /dashboard
- Data: PostgREST reads (:54331 via Kong) + Gateway admin API writes (:7700)
- ANON_KEY from docker/.env (different from .env.example demo key)
- Kong requires BOTH apikey AND Authorization: Bearer headers
- SPA catch-all MUST be before the 404 handler in server.ts (line 170)
- CORS middleware must be FIRST app.use() in buildApp()
- dashboard/ is standalone — own package.json, own tsconfig (module: ESNext)
- Vite base must be '/dashboard/' (trailing slash required)
- No worktree — working directly in main repo

## [2026-05-14] Task 3: Types and Constants

- ANON_KEY in docker/.env: eyJhbGciOiJIUzI1NiIsInR5cCI6... (first 20 chars: eyJhbGciOiJIUzI1NiIs)
- PostgREST field names confirmed as snake_case from schema.prisma
- Task status union: 13 values total (Received, Triaging, AwaitingInput, Ready, Executing, Validating, Submitting, Reviewing, Approved, Delivering, Done, Failed, Cancelled)
- pending_approvals.task_id is TEXT type (not UUID FK) — confirmed in schema.prisma line 441
- parent_rule_ids is UUID[] array in employee_rules — confirmed in schema.prisma line 511
- PendingApproval has recipient_name + context_label fields (not guest_name/property_name as originally spec'd — corrected from schema)
- LSP errors for clsx/tailwind-merge/react/vite in dashboard/ are expected until pnpm install runs (Task 1 scaffold)
- constants.ts import.meta.env errors are Vite-specific — resolve after dashboard tsconfig is in place

## [2026-05-14] Task 4: Data Layer

- postgrest.ts: merged default params (order, limit) with caller params — caller can override by passing same keys
- gateway.ts: fireApprovalEvent posts to INNGEST_URL/e/local (NOT gateway) — no auth header needed
- use-poll.ts: loading=true only on first fetch (isFirstFetch ref) — avoids flicker on subsequent polls
- use-poll.ts: skips fetch when document.hidden — saves requests on background tabs
- use-tenant.ts: uses createElement instead of JSX to avoid needing jsx compiler in .ts files
- Build: tsc -b + vite build exits 0 with 15 modules transformed
- PostgREST connectivity: HTTP 200 confirmed with dual headers (apikey + Authorization: Bearer)

## [2026-05-14] Task 5: App Shell

- react-router-dom was already in package.json from earlier scaffold — pnpm add was a no-op
- LSP errors (jsx flag, @/lib/utils) are root tsconfig false positives — dashboard's own tsconfig has jsx:react-jsx and @/\* paths; Vite resolves them correctly
- NavLink render-prop pattern with isActive works for active route styling with shadcn Button variant="ghost"
- Layout uses nested Route with element={<Layout>} and child routes — Outlet renders child content
- ApiKeyPrompt: useEffect auto-opens if !isAdminKeySet(); cancel button only shown when key already set (prevents dismissal on first load)
- ErrorBoundary as class component with getDerivedStateFromError — wraps everything including TenantProvider
- Build: tsc -b + vite build exits 0 with 1830 modules transformed, 355KB JS bundle

## [2026-05-14] Task 8: Trigger Panel

- App.tsx was ahead of spec — already had Toaster, TaskFeed, TaskDetail wired up by prior tasks; TriggerPlaceholder was the only remaining stub
- HOSTFULLY_TEST constants.ts values differ from task spec UUIDs — task spec UUIDs are the correct VLRE test fixtures; use them directly in TriggerPanel, not from constants
- Build: tsc -b + vite build exits 0 with 1841 modules transformed, 411KB JS bundle
- usePoll pattern: wrap fetchFn in useCallback([tenantId]) so tenant changes trigger re-fetch automatically
- triggerEmployee return type is { task_id, status_url } — check truthy before rendering link (dry run may not return task_id)
- No need for toast in TriggerPanel — inline success/error state works well; Toaster is available via App.tsx if needed
- LSP errors in dashboard/ root tsconfig are false positives — confirmed build is source of truth

## [2026-05-14] Task 9: Tenant Overview Panel

- App.tsx was ahead of spec again — already had RulesPanel + PreflightPanel wired (not placeholders); only TenantsPlaceholder remained
- postgrestFetch for tenants table uses `{ id: 'eq.${tenantId}' }` (NOT scopeByTenant — tenants table is identified by `id`, not `tenant_id`)
- usePoll wraps both fetchTenant and fetchSecrets each in useCallback([tenantId]) — tenant switch triggers re-fetch automatically
- listSecrets throws "Admin API key not set" when key absent — error surfaces in ErrorBox with Retry; graceful UX
- Badge className overrides work cleanly: `className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100"`
- Inline edit form: track editingKey + secretValue as separate state; onKeyDown Enter/Escape for keyboard UX
- Build: tsc -b + vite build exits 0 with 1847 modules transformed, 431KB JS bundle
- Evidence saved to .sisyphus/evidence/task-9-build.txt

## Task 10 — RulesPanel

- `employee_rules` and `feedback_events` 403 handling works via `error.message.includes('403')` check
- Split into `RulesTab` and `FeedbackEventsTab` sub-components, each with own `usePoll` call — cleaner than one fetch with conditional rendering
- `usePoll` with `useCallback([tenantId])` dependency — tenant switch triggers re-fetch automatically
- HEAD App.tsx already had `RulesPanel` import pre-wired by a previous task agent — no App.tsx change needed in this commit
- Build time: ~200ms after tsc (tsc itself takes ~2-3min on first run cold)

## Task 12: Smoke Tests

- Vitest requires `defineConfig` from `vitest/config` (not `vite`) to support the `test` config key without TS errors
- Add `"types": ["vitest/globals"]` to `dashboard/tsconfig.json` compilerOptions for `test`/`expect` globals
- `@vitejs/plugin-react` (not swc) is needed as a devDep for Vitest to transform JSX in tests — swc plugin still used for build
- `@testing-library/jest-dom` v6 works with Vitest via setup file importing it
- StatusBadge renders shadcn Badge without any mocking needed in jsdom environment
- All 5 tests pass in ~1s; build unaffected

## Task 13: dashboard:build script

- `pnpm dashboard:build` = `cd dashboard && pnpm install && pnpm build` — exits 0, builds in ~231ms
- Express 5 wildcard routes require named params: `/dashboard/*path` not `/dashboard/*` (throws at startup)
- Gateway checks `dashboard/dist` existence at startup — must restart gateway after first build
- `pnpm dev` is too heavy to use for gateway-only restart; use `node_modules/.bin/tsx watch --clear-screen=false src/gateway/server.ts` directly
- `/dashboard` returns 301 → `/dashboard/` returns 200 (Express static serving behavior, correct)

## [2026-05-14] T14 — E2E Prerequisites Verification

### Service Health (all confirmed live)

- Gateway: `{"status":"ok"}` on :7700/health
- Inngest: HTTP 200 on :8288/health
- PostgREST: HTTP 200 on :54331/rest/v1/tasks with ANON_KEY
- Dashboard: HTTP 200 on :7700/dashboard/

### Socket Mode

- Confirmed via `grep "socket mode" /tmp/ai-dev.log` and `/tmp/ai-gateway-restart.log`
- Log message: "Slack Bolt — Socket Mode connected"

### Playwright Browser Auth Pattern

- Set localStorage BEFORE navigating to the page that needs auth:
  ```js
  localStorage.setItem('admin_api_key', '<key>');
  localStorage.setItem('selected_tenant_id', '<uuid>');
  ```
- Then reload the page — avoids the API key prompt modal
- Works at /dashboard/ directly (navigate once to get page, set storage, navigate again)

### Preflight Panel Auto-loads

- /dashboard/preflight runs checks automatically on page load — no "Refresh All" click needed
- Shows 4 panels: Gateway, Inngest, PostgREST, Docker (inferred)
- All 4 ✓ Online at time of T14 verification

### Trigger Page Employee Dropdown

- /dashboard/trigger loads 3 archetypes: code-rotation, daily-summarizer, guest-messaging
- Dropdown is initially in "Select an employee..." state — requires click to open

### Console Errors

- Only 1 error: favicon.ico 404 — harmless, not an app error
- Zero app-level errors

### LSP Diagnostics (pre-existing, not regressions)

- dashboard/src/main.tsx: JSX tsconfig issue (known, build succeeds via Vite)
- scripts/verify-multi-tenancy.ts: slack_team_id missing (unrelated to dashboard)

## [2026-05-14] T16 — E2E Approve from Dashboard

- Task ID: 39d208b4-67fd-442f-9b40-fefec8fce342
- Approve button visible: yes
- Approval method used: Dashboard button (browser evaluate click — direct ref click failed, querySelectorAll + click worked)
- Time from approve click to Done: ~30 seconds (Reviewing→Approved→Delivering instantly, Done within 30s poll)
- Final status: Done
- pending_approvals count after: 0
- Full status trace: Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Validating → Submitting → Reviewing → Approved → Delivering → Done
- Note: Delivering→Done transition sets tasks.status directly but may not appear in task_status_log (9 log entries, final state confirmed via tasks table)
- Playwright ref-based click syntax (e.g. `[ref=e123]`) fails after page re-render; use querySelectorAll fallback

## [2026-05-14] T17 — E2E Cross-System Verification

- Task ID: 39d208b4-67fd-442f-9b40-fefec8fce342
- DB status: Done ✅
- DB pending_approvals: 0 ✅
- DB status log: 9 transitions (Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Reviewing→Approved→Delivering); Executing→Submitting and Delivering→Done not logged but tasks.status=Done confirms completion
- Slack verification: ✅ — "✅ guest-messaging — Done" visible in #cs-guest-communication (Guest: Olivia, Approved by @dashboard-user, AC response delivered in thread)
- Inngest verification: ✅ — run 01KRKG48QF3G01DRNRPR3GZ5SW, COMPLETED, duration 30m 39s, started 10:01:51 AM ended 10:32:31 AM
- Dashboard Task Feed: Done badge visible (row with ~30m duration) ✅
- Dashboard Task Detail: Done status badge, 9-step timeline, no Approve/Reject buttons ✅
- Dashboard Preflight: all 4 checks green (Gateway, Inngest, PostgREST, Docker) ✅
- E2E summary saved: .sisyphus/evidence/task-17-e2e-summary.md
- Screenshots saved: task-17-db-trace.txt, task-17-slack-verify.png, task-17-inngest-verify.png, task-17-dashboard-feed.png, task-17-dashboard-detail.png, task-17-preflight.png
