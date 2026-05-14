# Local Operations Dashboard

## TL;DR

> **Quick Summary**: Build a React SPA embedded in the Express gateway at `/dashboard` that replaces 5+ separate dev tools (curl, Inngest dashboard, Supabase Studio, Slack, Docker logs) with one browser tab for triggering employees, monitoring tasks, managing tenants, and approving deliverables locally.
>
> **Deliverables**:
>
> - `dashboard/` directory at repo root with a React + Vite + shadcn/ui + Tailwind app
> - Express gateway changes: CORS middleware + static file serving + SPA catch-all
> - 5 functional panels: Task Feed, Trigger, Tenant Overview, Rules & Feedback, Preflight
> - Light smoke tests (≤5 tests)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Scaffold → PostgREST client → Task Feed → Integration QA

---

## Context

### Original Request

Build a quick web UI to interact with the ai-employee system locally — easier/faster testing without fancy requirements.

### Interview Summary

**Key Discussions**:

- All pain points equally bad: triggering, monitoring, debugging, managing config
- Embedded in gateway at `/dashboard` (zero extra processes)
- Auto-poll every few seconds (not real-time SSE/WS)
- All 5 panels: Task Feed, Trigger, Tenant Overview, Rules & Feedback, Preflight
- PostgREST reads + Gateway admin API writes (no new backend endpoints)
- shadcn/ui + Tailwind for fast, polished UI components
- Light smoke tests only

**Research Findings**:

- 30 admin API routes already exist — full interaction surface covered
- PostgREST at :54331 (via Kong) exposes all tables with JOIN support
- Kong requires `apikey` + `Authorization: Bearer` headers with ANON_KEY
- No CORS middleware on Express gateway currently — must add
- `/dashboard` namespace is clean — no existing route conflicts
- Inngest event injection at `:8288/e/local` enables local approve/reject without Slack
- `task_status_log` provides full audit timeline (from_status → to_status + actor + timestamp)

### Metis Review

**Identified Gaps** (addressed):

- ADMIN_API_KEY browser delivery → Prompt on first load + localStorage
- CORS on Express gateway → Add `cors` middleware as first `app.use()`
- Separate tsconfig needed → `dashboard/tsconfig.json` with `module: ESNext`
- SPA catch-all placement → Before existing 404 handler in server.ts
- PostgREST ANON_KEY → Hardcoded constant (local dev tool, key is in docker/.env)
- Zombie tasks (Reviewing + no pending_approvals) → Show "Approval unavailable" state
- Tenant scoping → Every PostgREST query must include `tenant_id=eq.` filter
- `feedback_events`/`employee_rules` table access → Include GRANT verification step

---

## Work Objectives

### Core Objective

Replace the fragmented local dev workflow (curl + Inngest dashboard + Supabase Studio + Slack + psql) with a single browser tab at `http://localhost:7700/dashboard` that covers triggering, monitoring, approving, and configuring AI employees.

### Concrete Deliverables

- `dashboard/` directory: complete React SPA with 5 panels
- `src/gateway/server.ts`: CORS middleware + static serving + SPA catch-all (3 additions)
- `dashboard/package.json`: standalone package for the frontend
- Working URL: `http://localhost:7700/dashboard`

### Definition of Done

- [ ] `curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/dashboard` → 200
- [ ] All 5 panels render without JS errors
- [ ] Can trigger a task and see it appear in the Task Feed
- [ ] Can approve a task from the dashboard (no Slack needed)
- [ ] Preflight panel shows green for all services when running
- [ ] ≤5 smoke tests pass

### Must Have

- Task Feed with status badges, auto-polling, and click-to-detail
- Task Detail with status timeline and inline approve/reject buttons
- Trigger Panel that fires any employee with one click
- Tenant selector dropdown (default: VLRE)
- Secrets panel showing is_set status with write-only setter form
- Preflight health checks (Gateway, Inngest, PostgREST)
- CORS on Express gateway for browser access to admin API
- SPA routing (deep links don't 404)
- ADMIN_API_KEY prompt on first load with localStorage persistence

### Must NOT Have (Guardrails)

- No WebSockets, SSE, or EventSource — polling only
- No new Express route handlers beyond static serving + SPA catch-all
- No modifications to `src/inngest/`, `src/workers/`, or `src/worker-tools/`
- No modifications to `tsconfig.json` or `tsconfig.build.json` (server configs)
- No `SERVICE_ROLE_KEY` in browser — ANON_KEY only
- No Tenant CRUD UI — Tenant Overview is read-only + secrets management
- No Knowledge Base panel (out of scope)
- No mobile responsive layout — desktop-only
- No more than one top-level React error boundary
- No more than 5 smoke tests total
- No auth UI beyond a simple API key prompt modal
- No Docker/production deployment changes (local dev only)
- Do NOT install more than 10 shadcn/ui components total

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: NO (new frontend project)
- **Automated tests**: Tests-after (smoke tests after implementation)
- **Framework**: Vitest + React Testing Library (in `dashboard/`)
- **Coverage scope**: 3-5 smoke tests only — component renders without crashing

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Infrastructure**: Use Bash — Verify files exist, builds succeed, processes respond

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all parallel, no dependencies):
├── Task 1: Vite + React + Tailwind + shadcn/ui scaffold [quick]
├── Task 2: Express CORS + static serving + SPA catch-all [quick]
├── Task 3: TypeScript types & constants [quick]
└── Task 4: PostgREST client + Gateway API client + usePoll hook [quick]

Wave 2 (Core panels — after Wave 1):
├── Task 5: App shell (layout, sidebar nav, tenant selector, routing) [visual-engineering]
├── Task 6: Task Feed panel (list + auto-poll) [visual-engineering]
├── Task 7: Task Detail panel (timeline + approve/reject) [visual-engineering]
└── Task 8: Trigger Panel [visual-engineering]

Wave 3 (Secondary panels — after Wave 2):
├── Task 9: Tenant Overview panel [visual-engineering]
├── Task 10: Rules & Feedback panel [visual-engineering]
└── Task 11: Preflight Check panel [visual-engineering]

Wave 4 (QA — after all panels):
├── Task 12: Smoke tests [quick]
└── Task 13: Build script + dashboard:build npm script [quick]

Wave E2E (Scenario A happy path — sequential, real user simulation):
├── Task 14: E2E Prerequisites — services, build, dashboard readiness [unspecified-high]
├── Task 15: E2E Step 1-2 — Trigger guest-messaging + monitor in Dashboard [unspecified-high]
├── Task 16: E2E Steps 3-5 — Wait for Reviewing + approve from Dashboard [unspecified-high]
├── Task 17: E2E Steps 6-7 — Cross-system verification (DB, Slack, Inngest, Dashboard) [unspecified-high]
└── Task 18: Notify completion [quick]

Wave FINAL (after ALL tasks including E2E):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 6 → Task 7 → Task 12 → Task 14 → Task 15 → Task 16 → Task 17 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential (Waves 1-3 have 4/4/3 parallel tasks)
Max Concurrent: 4 (Wave 1 and Wave 2)
```

### Dependency Matrix

| Task  | Depends On         | Blocks                    | Wave  |
| ----- | ------------------ | ------------------------- | ----- |
| 1     | —                  | 5, 6, 7, 8, 9, 10, 11, 12 | 1     |
| 2     | —                  | 5, 6, 7, 8, 9, 10, 11, 13 | 1     |
| 3     | —                  | 4, 5, 6, 7, 8, 9, 10, 11  | 1     |
| 4     | 3                  | 6, 7, 8, 9, 10, 11        | 1     |
| 5     | 1, 2               | 6, 7, 8, 9, 10, 11        | 2     |
| 6     | 4, 5               | 12                        | 2     |
| 7     | 4, 5, 6            | 12                        | 2     |
| 8     | 4, 5               | 12                        | 2     |
| 9     | 4, 5               | 12                        | 3     |
| 10    | 4, 5               | 12                        | 3     |
| 11    | 4, 5               | 12                        | 3     |
| 12    | 6, 7, 8, 9, 10, 11 | 14                        | 4     |
| 13    | 1, 2               | 14                        | 4     |
| 14    | 12, 13             | 15                        | E2E   |
| 15    | 14                 | 16                        | E2E   |
| 16    | 15                 | 17                        | E2E   |
| 17    | 16                 | 18                        | E2E   |
| 18    | 17                 | —                         | E2E   |
| F1-F4 | ALL (1-18)         | —                         | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **4 tasks** — T5 → `visual-engineering`, T6 → `visual-engineering`, T7 → `visual-engineering`, T8 → `visual-engineering`
- **Wave 3**: **3 tasks** — T9 → `visual-engineering`, T10 → `visual-engineering`, T11 → `visual-engineering`
- **Wave 4**: **2 tasks** — T12 → `quick`, T13 → `quick`
- **Wave E2E**: **5 tasks** (sequential) — T14 → `unspecified-high`, T15 → `unspecified-high`, T16 → `unspecified-high`, T17 → `unspecified-high`, T18 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Scaffold Vite + React + Tailwind + shadcn/ui project

  **What to do**:
  - Create `dashboard/` directory at repo root with its own `package.json`
  - Initialize Vite with React + TypeScript template
  - Configure Tailwind CSS (v4 or latest stable — check what version works with shadcn/ui)
  - Initialize shadcn/ui with the following components only (max 10 total): `button`, `badge`, `card`, `table`, `input`, `select`, `dialog`, `tabs`, `toast/sonner`, `separator`
  - Create `dashboard/tsconfig.json` with `module: ESNext`, `target: ESNext`, `jsx: react-jsx` — this is separate from the root `tsconfig.json`
  - Create `dashboard/vite.config.ts` with `base: '/dashboard/'` and `outDir: 'dist'`
  - Create `dashboard/.env` with `VITE_POSTGREST_URL=http://localhost:54331/rest/v1` and `VITE_SUPABASE_ANON_KEY=<value from docker/.env ANON_KEY>` and `VITE_GATEWAY_URL=http://localhost:7700` and `VITE_INNGEST_URL=http://localhost:8288`
  - Add `dashboard/.env.example` with the same keys but placeholder values + instructions to copy from docker/.env
  - Verify: `cd dashboard && pnpm install && pnpm build` succeeds with a blank "Hello Dashboard" page

  **Must NOT do**:
  - Do NOT modify the root `tsconfig.json` or `tsconfig.build.json`
  - Do NOT install more than 10 shadcn/ui components
  - Do NOT add `dashboard/` to root workspace config — keep it standalone with its own `package.json`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Scaffold/boilerplate task with well-defined steps, no complex logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed for scaffolding — no design decisions yet

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6, 7, 8, 9, 10, 11, 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docker/.env` (line with `ANON_KEY=`) — the SUPABASE_ANON_KEY value to put in `dashboard/.env`
  - `docker/.env.example` (line with `ANON_KEY=`) — the example ANON_KEY for `dashboard/.env.example`

  **External References**:
  - shadcn/ui docs: `https://ui.shadcn.com/docs/installation/vite` — Vite installation guide
  - Vite config `base` option: `https://vite.dev/config/shared-options.html#base`

  **WHY Each Reference Matters**:
  - `docker/.env` ANON_KEY — the dashboard needs this exact key to authenticate PostgREST calls; if the values don't match, every data fetch returns 401
  - shadcn/ui Vite guide — shadcn/ui has specific Vite setup requirements (path aliases, tailwind config); following the official guide prevents "module not found" errors

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard project builds successfully
    Tool: Bash
    Preconditions: Node ≥20, pnpm installed
    Steps:
      1. cd dashboard && pnpm install
      2. pnpm build
      3. ls dist/index.html
    Expected Result: Build exits 0, dist/index.html exists
    Failure Indicators: tsc errors, missing module errors, Vite config errors
    Evidence: .sisyphus/evidence/task-1-build-success.txt

  Scenario: Tailwind + shadcn/ui components are usable
    Tool: Bash
    Preconditions: dashboard/ built
    Steps:
      1. grep -r "tailwindcss" dashboard/package.json — confirms Tailwind installed
      2. ls dashboard/src/components/ui/button.tsx — confirms shadcn Button exists
      3. pnpm build — confirms components compile
    Expected Result: All checks pass, no errors
    Failure Indicators: Missing component files, Tailwind not configured
    Evidence: .sisyphus/evidence/task-1-shadcn-verify.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): scaffold Vite + React + Tailwind + shadcn/ui project`
  - Files: `dashboard/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 2. Express CORS middleware + static file serving + SPA catch-all

  **What to do**:
  - Install `cors` and `@types/cors` in the root project (NOT in dashboard/)
  - Add `cors()` middleware to `server.ts` as the FIRST `app.use()` call inside `buildApp()`, before `express.json()` and all route registrations. Configure to allow `http://localhost:7700` and `http://localhost:5173` (Vite dev) origins in development. Use `cors({ origin: true, credentials: true })` for simplicity in local dev.
  - Add `express.static()` middleware to serve `path.resolve(process.cwd(), 'dashboard/dist')` at the `/dashboard` path — insert this BEFORE the 404 handler (line 170 of server.ts)
  - Add an SPA catch-all route: `app.get('/dashboard/*', (req, res) => res.sendFile(path.resolve(process.cwd(), 'dashboard/dist/index.html')))` — insert this AFTER the static middleware but BEFORE the 404 handler
  - Add `import cors from 'cors'` and `import path from 'path'` to imports
  - The `express.static` should have a guard: if `dashboard/dist` doesn't exist, log a warning but don't crash (dashboard is optional — gateway should work without it)

  **Must NOT do**:
  - Do NOT modify any route handler logic in existing admin API routes
  - Do NOT modify `tsconfig.json` or `tsconfig.build.json`
  - Do NOT add dashboard-specific business logic to the gateway
  - Do NOT touch any file outside `src/gateway/server.ts` and `package.json` for this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 2 file changes (server.ts + package.json), well-defined insertion points
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 13
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts:42-175` — the `buildApp()` function where CORS and static serving must be added
  - `src/gateway/server.ts:170-172` — the 404 handler that the SPA catch-all must be inserted BEFORE

  **External References**:
  - `cors` npm package: `https://www.npmjs.com/package/cors` — Express CORS middleware

  **WHY Each Reference Matters**:
  - `server.ts:170-172` — the exact insertion point is critical; SPA catch-all AFTER this line means every `/dashboard/*` request returns 404 instead of the React app
  - The 404 handler is `app.use((_req, res) => res.status(404).json({ error: 'Not Found' }))` — the SPA catch-all and static middleware must both be registered before this

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CORS headers present on admin API
    Tool: Bash (curl)
    Preconditions: Gateway running on :7700
    Steps:
      1. curl -s -I -H "Origin: http://localhost:5173" http://localhost:7700/health
      2. Check response headers for Access-Control-Allow-Origin
    Expected Result: Header `access-control-allow-origin` is present in response
    Failure Indicators: No CORS header in response, or 500 error
    Evidence: .sisyphus/evidence/task-2-cors-headers.txt

  Scenario: Dashboard static files served (after Task 1 builds)
    Tool: Bash (curl)
    Preconditions: Gateway running, dashboard/dist/ exists from Task 1 build
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/dashboard
      2. curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/dashboard/index.html
    Expected Result: Both return HTTP 200
    Failure Indicators: 404 (static middleware not mounted) or 500 (path error)
    Evidence: .sisyphus/evidence/task-2-static-serving.txt

  Scenario: SPA catch-all returns index.html for deep links
    Tool: Bash (curl)
    Preconditions: Gateway running, dashboard/dist/ exists
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/dashboard/tasks/fake-uuid
      2. curl -s http://localhost:7700/dashboard/tasks/fake-uuid | grep -c "<html"
    Expected Result: HTTP 200, response contains "<html" (it's index.html, not JSON 404)
    Failure Indicators: 404 JSON response means catch-all is after the 404 handler
    Evidence: .sisyphus/evidence/task-2-spa-catchall.txt

  Scenario: Existing routes unaffected
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/health → 200
      2. curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/api/inngest → should still work
      3. curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/nonexistent → 404 (JSON)
    Expected Result: Health returns 200, nonexistent returns 404 JSON (not index.html)
    Failure Indicators: SPA catch-all is too greedy and intercepts non-dashboard routes
    Evidence: .sisyphus/evidence/task-2-existing-routes.txt
  ```

  **Commit**: YES
  - Message: `feat(gateway): add CORS + dashboard static serving + SPA catch-all`
  - Files: `src/gateway/server.ts`, `package.json`
  - Pre-commit: `pnpm build`

- [ ] 3. TypeScript types & shared constants

  **What to do**:
  - Create `dashboard/src/lib/types.ts` with TypeScript interfaces matching the Prisma models that the UI needs:
    - `Task` — id, tenant_id, archetype_id, external_id, source_system, status, failure_reason, raw_event, created_at, updated_at
    - `TaskStatus` — union type of all 12 status strings: `'Received' | 'Triaging' | 'AwaitingInput' | 'Ready' | 'Executing' | 'Validating' | 'Submitting' | 'Reviewing' | 'Approved' | 'Delivering' | 'Done' | 'Failed' | 'Cancelled'`
    - `TaskStatusLog` — id, task_id, from_status, to_status, actor, created_at
    - `Archetype` — id, tenant_id, role_name, model, runtime, deliverable_type, risk_model, concurrency_limit, notification_channel, vm_size, enrichment_adapter, created_at
    - `Tenant` — id, name, slug, status, config (as Record<string, unknown>), deleted_at, created_at
    - `PendingApproval` — id, tenant_id, thread_uid, task_id, slack_ts, channel_id, guest_name, property_name, urgency, created_at
    - `EmployeeRule` — id, tenant_id, archetype_id, rule_text, source, status, source_task_id, parent_rule_ids, confirmed_at, created_at
    - `FeedbackEvent` — id, tenant_id, archetype_id, task_id, event_type, actor_id, correction_content, original_content, created_at
    - `TenantSecret` — key, is_set (from the admin API list response)
  - Create `dashboard/src/lib/constants.ts` with:
    - `POSTGREST_URL` — read from `import.meta.env.VITE_POSTGREST_URL` with fallback `'http://localhost:54331/rest/v1'`
    - `SUPABASE_ANON_KEY` — read from `import.meta.env.VITE_SUPABASE_ANON_KEY` with fallback to the demo key from `docker/.env.example`
    - `GATEWAY_URL` — read from `import.meta.env.VITE_GATEWAY_URL` with fallback `'http://localhost:7700'`
    - `INNGEST_URL` — read from `import.meta.env.VITE_INNGEST_URL` with fallback `'http://localhost:8288'`
    - `POLL_INTERVAL_MS = 5000`
    - `DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000003'` (VLRE)
    - `TENANTS` — a static map of known tenant IDs to names: `{ '00000000-0000-0000-0000-000000000002': 'DozalDevs', '00000000-0000-0000-0000-000000000003': 'VLRE' }`
    - `STATUS_COLORS` — map of TaskStatus to tailwind color classes for badges (green for Done, red for Failed, yellow for Reviewing, blue for Executing, gray for others)
    - `TERMINAL_STATUSES = ['Done', 'Failed', 'Cancelled'] as const`
  - Create `dashboard/src/lib/utils.ts` — re-export shadcn's `cn` utility + add `formatRelativeTime(date: string): string` helper

  **Must NOT do**:
  - Do NOT import from any server-side code (no `../../../src/` imports)
  - Do NOT use Prisma types directly — define standalone interfaces

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions and constants — no logic, no side effects
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 4, 5, 6, 7, 8, 9, 10, 11
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` — source of truth for all field names and types; the Task, Archetype, Tenant models
  - `src/inngest/employee-lifecycle.ts` — source of truth for all task status string values used at runtime
  - `docker/.env.example` line `ANON_KEY=` — the fallback ANON_KEY constant value
  - `docker/.env` line `ANON_KEY=` — the actual ANON_KEY (may differ from .env.example)

  **WHY Each Reference Matters**:
  - `prisma/schema.prisma` — field names must match exactly or PostgREST queries return wrong data; e.g. `archetype_id` not `archetypeId` (PostgREST uses snake_case)
  - `employee-lifecycle.ts` — status strings are not a Prisma enum; they're plain strings used in code; the union type must match exactly what the lifecycle writes

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Types and constants compile without errors
    Tool: Bash
    Preconditions: Task 1 scaffold complete
    Steps:
      1. cd dashboard && pnpm build
      2. Check for zero TypeScript errors in types.ts and constants.ts
    Expected Result: Build succeeds, no type errors
    Failure Indicators: tsc errors on import resolution or type definitions
    Evidence: .sisyphus/evidence/task-3-types-compile.txt

  Scenario: Constants match actual infrastructure
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read ANON_KEY from docker/.env
      2. Read ANON_KEY fallback from dashboard/src/lib/constants.ts
      3. Verify the fallback value in constants.ts matches docker/.env.example
    Expected Result: The fallback ANON_KEY in constants.ts matches the value in docker/.env.example
    Failure Indicators: Mismatched keys → 401 on PostgREST calls
    Evidence: .sisyphus/evidence/task-3-constants-verify.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(dashboard): add data layer (types, constants, API clients, hooks)`
  - Files: `dashboard/src/lib/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 4. PostgREST client + Gateway API client + usePoll hook

  **What to do**:
  - Create `dashboard/src/lib/postgrest.ts` — a thin fetch wrapper for PostgREST:
    - `postgrestFetch<T>(table: string, params?: Record<string, string>): Promise<T[]>` — builds URL from `POSTGREST_URL`, adds `apikey` and `Authorization: Bearer` headers with `SUPABASE_ANON_KEY`, appends query params, returns parsed JSON
    - Always include `order=created_at.desc` by default (overridable)
    - Always include `limit=100` by default (overridable)
    - Helper: `scopeByTenant(tenantId: string): Record<string, string>` returns `{ tenant_id: 'eq.' + tenantId }`
    - Support PostgREST embedded joins: `select` param can include `*,archetypes(role_name,model)`
  - Create `dashboard/src/lib/gateway.ts` — a thin fetch wrapper for the Gateway admin API:
    - `gatewayFetch<T>(path: string, options?: RequestInit): Promise<T>` — builds URL from `GATEWAY_URL`, adds `X-Admin-Key` header from `getAdminApiKey()`, returns parsed JSON
    - `getAdminApiKey(): string | null` — reads from `localStorage.getItem('admin_api_key')`
    - `setAdminApiKey(key: string): void` — writes to `localStorage.setItem('admin_api_key', key)`
    - `isAdminKeySet(): boolean` — checks localStorage
    - `triggerEmployee(tenantId: string, slug: string, dryRun?: boolean): Promise<{ task_id: string; status_url: string }>` — POST to `/admin/tenants/:id/employees/:slug/trigger`
    - `getTaskStatus(tenantId: string, taskId: string): Promise<Task>` — GET `/admin/tenants/:id/tasks/:id`
    - `listSecrets(tenantId: string): Promise<TenantSecret[]>` — GET `/admin/tenants/:id/secrets`
    - `setSecret(tenantId: string, key: string, value: string): Promise<void>` — PUT `/admin/tenants/:id/secrets/:key`
    - `fireApprovalEvent(taskId: string, action: 'approve' | 'reject', userId?: string, userName?: string): Promise<void>` — POST to `INNGEST_URL/e/local` with `{ name: 'employee/approval.received', data: { taskId, action, userId: userId ?? 'dashboard-user', userName: userName ?? 'Dashboard' } }`
  - Create `dashboard/src/hooks/use-poll.ts` — a custom React hook:
    - `usePoll<T>(fetchFn: () => Promise<T>, intervalMs: number = POLL_INTERVAL_MS): { data: T | null, error: Error | null, loading: boolean, refresh: () => void }`
    - Uses `useEffect` with `setInterval` for auto-polling
    - Stops polling when component unmounts (cleanup)
    - Exposes `refresh()` for manual trigger
    - Does NOT poll when the browser tab is hidden (`document.hidden` check)
  - Create `dashboard/src/hooks/use-tenant.ts` — tenant context:
    - `TenantProvider` React context that wraps the app
    - `useTenant()` returns `{ tenantId, setTenantId, tenantName }`
    - Persists selected tenant in `localStorage`
    - Default: `DEFAULT_TENANT_ID` (VLRE)

  **Must NOT do**:
  - Do NOT use `SERVICE_ROLE_KEY` — ANON_KEY only for PostgREST
  - Do NOT add error retry logic beyond what fetch provides natively
  - Do NOT add request caching or deduplication

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Utility code — fetch wrappers, a hook, and a context provider; no visual elements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2 — but AFTER Task 3 for types)
  - **Parallel Group**: Wave 1 (starts after Task 3 types are available)
  - **Blocks**: Tasks 6, 7, 8, 9, 10, 11
  - **Blocked By**: Task 3 (needs types and constants)

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/types.ts` (Task 3) — the TypeScript types that the fetch functions return
  - `dashboard/src/lib/constants.ts` (Task 3) — POSTGREST_URL, GATEWAY_URL, INNGEST_URL, SUPABASE_ANON_KEY, POLL_INTERVAL_MS, DEFAULT_TENANT_ID
  - AGENTS.md section "Manual approval fallback" — exact JSON payload shape for `POST http://localhost:8288/e/local` approval events

  **API/Type References**:
  - PostgREST query syntax: `?table_name=eq.value&select=*,related_table(field)&order=created_at.desc&limit=100`
  - Gateway admin API requires `X-Admin-Key` header
  - Kong PostgREST requires both `apikey: <ANON_KEY>` AND `Authorization: Bearer <ANON_KEY>` headers

  **WHY Each Reference Matters**:
  - AGENTS.md approval fallback — the exact event name and data shape must match `employee/approval.received` with `{ taskId, action, userId, userName }` or the lifecycle will not process it
  - Kong auth — missing either header (apikey OR Authorization) returns 401; both are required

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: PostgREST client fetches tasks
    Tool: Bash
    Preconditions: Services running (PostgREST at :54331), dashboard built
    Steps:
      1. cd dashboard && node -e "
         const { postgrestFetch } = require('./dist/lib/postgrest');
         postgrestFetch('tasks', { limit: '1' }).then(d => console.log(JSON.stringify(d))).catch(e => console.error(e.message));
         "
         (or verify at build time that the module compiles + test with curl equivalent)
      2. curl -s -H 'apikey: <ANON_KEY>' -H 'Authorization: Bearer <ANON_KEY>' 'http://localhost:54331/rest/v1/tasks?limit=1' — verify same shape as types.ts Task interface
    Expected Result: Returns array of Task objects (possibly empty) with correct field names
    Failure Indicators: 401 (wrong key), 400 (bad query), field name mismatch
    Evidence: .sisyphus/evidence/task-4-postgrest-client.txt

  Scenario: Gateway client handles missing admin key gracefully
    Tool: Bash
    Preconditions: dashboard built
    Steps:
      1. Verify gatewayFetch throws or returns error when no admin key is set (localStorage empty)
      2. Verify isAdminKeySet() returns false initially
    Expected Result: Graceful error handling, not uncaught exception
    Failure Indicators: Uncaught TypeError, undefined header values
    Evidence: .sisyphus/evidence/task-4-gateway-no-key.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(dashboard): add data layer (types, constants, API clients, hooks)`
  - Files: `dashboard/src/lib/*`, `dashboard/src/hooks/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 5. App shell — layout, sidebar navigation, tenant selector, routing, API key prompt

  **What to do**:
  - Create `dashboard/src/App.tsx` — the root component with:
    - `TenantProvider` wrapping the entire app
    - React Router (install `react-router-dom`) with routes: `/dashboard` (Task Feed), `/dashboard/trigger` (Trigger), `/dashboard/tenants` (Tenant Overview), `/dashboard/rules` (Rules & Feedback), `/dashboard/preflight` (Preflight)
    - Top-level `ErrorBoundary` component (single one — catches render errors, shows "Something went wrong" with a retry button)
  - Create `dashboard/src/components/layout/Sidebar.tsx` — left sidebar with:
    - Navigation links using shadcn `Button` variant="ghost" for each panel
    - Active route highlighting
    - Icons (use Lucide icons — already included with shadcn/ui): `ListTodo` (Tasks), `Zap` (Trigger), `Building2` (Tenants), `BookOpen` (Rules), `HeartPulse` (Preflight)
  - Create `dashboard/src/components/layout/Header.tsx` — top bar with:
    - "AI Employee Dashboard" title (left)
    - Tenant selector dropdown (right) — using shadcn `Select` with the two known tenants from `TENANTS` constant
    - Small settings icon/button to re-enter API key
  - Create `dashboard/src/components/layout/Layout.tsx` — combines Sidebar + Header + `<Outlet />` for route content
  - Create `dashboard/src/components/ApiKeyPrompt.tsx` — a shadcn `Dialog` that:
    - Shows on first load when `isAdminKeySet()` returns false
    - Has an `Input` for the API key with a "Save" button
    - Calls `setAdminApiKey(key)` on save
    - Shows a note: "Find this in your .env file as ADMIN_API_KEY"
    - Can be re-opened from Header settings button to change the key
  - Wire up `main.tsx` to render `<App />`

  **Must NOT do**:
  - Do NOT add any data-fetching logic — this is layout only
  - Do NOT add more than one ErrorBoundary
  - Do NOT add a login/auth system beyond the API key prompt

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Layout, navigation, routing — visual structural work with UX considerations
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Layout composition, navigation patterns, responsive-within-desktop considerations

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs scaffold + gateway changes)
  - **Parallel Group**: Wave 2 (first task in wave — other Wave 2 tasks can start after this)
  - **Blocks**: Tasks 6, 7, 8, 9, 10, 11
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/constants.ts` (Task 3) — `TENANTS` map for the tenant selector dropdown
  - `dashboard/src/lib/gateway.ts` (Task 4) — `isAdminKeySet()`, `setAdminApiKey()`, `getAdminApiKey()` for API key prompt
  - `dashboard/src/components/ui/` — shadcn components installed in Task 1

  **External References**:
  - React Router docs: `https://reactrouter.com/` — `BrowserRouter`, `Routes`, `Route`, `Outlet`, `NavLink`
  - Lucide React icons: `https://lucide.dev/guide/packages/lucide-react` — icon components

  **WHY Each Reference Matters**:
  - `constants.ts TENANTS` — the tenant selector must show the same names as the constant map; mismatch means wrong tenant IDs sent to PostgREST
  - `gateway.ts` API key functions — the prompt must use the EXACT same localStorage key that gatewayFetch reads from

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: App shell renders with sidebar navigation
    Tool: Playwright
    Preconditions: Gateway running with dashboard served at /dashboard
    Steps:
      1. Navigate to http://localhost:7700/dashboard
      2. Assert sidebar exists with 5 navigation links
      3. Assert header shows "AI Employee Dashboard" text
      4. Assert tenant selector dropdown is visible
    Expected Result: Layout renders fully, no JS console errors
    Failure Indicators: Blank page, routing errors, missing sidebar
    Evidence: .sisyphus/evidence/task-5-shell-render.png

  Scenario: API key prompt shows on first load
    Tool: Playwright
    Preconditions: Clear localStorage (fresh state)
    Steps:
      1. Navigate to http://localhost:7700/dashboard (with cleared storage)
      2. Assert dialog with "API Key" text is visible
      3. Type "test-key-123" into input
      4. Click "Save" button
      5. Assert dialog closes
      6. Reload page
      7. Assert dialog does NOT appear again (key persisted)
    Expected Result: Key prompt shows once, persists across reloads
    Failure Indicators: Dialog doesn't appear, or appears every time
    Evidence: .sisyphus/evidence/task-5-api-key-prompt.png

  Scenario: Navigation between panels works
    Tool: Playwright
    Preconditions: Dashboard loaded with API key set
    Steps:
      1. Click "Trigger" in sidebar
      2. Assert URL is /dashboard/trigger
      3. Click "Tenants" in sidebar
      4. Assert URL is /dashboard/tenants
      5. Click "Tasks" (or logo/home)
      6. Assert URL is /dashboard
    Expected Result: URL changes, content area updates (even if panels are empty placeholders)
    Failure Indicators: Full page reload, 404, blank content area
    Evidence: .sisyphus/evidence/task-5-navigation.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add app shell with layout, navigation, tenant selector`
  - Files: `dashboard/src/App.tsx`, `dashboard/src/main.tsx`, `dashboard/src/components/layout/*`, `dashboard/src/components/ApiKeyPrompt.tsx`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 6. Task Feed panel — task list with status badges and auto-polling

  **What to do**:
  - Create `dashboard/src/panels/tasks/TaskFeed.tsx` — the main task list component:
    - Uses `usePoll` hook to fetch tasks from PostgREST: `postgrestFetch<Task>('tasks', { ...scopeByTenant(tenantId), select: '*,archetypes(role_name,model)', order: 'created_at.desc', limit: '50' })`
    - Renders a shadcn `Table` with columns: Status (badge), Employee (archetype role_name), Source, Created (relative time), Duration (if terminal: updated_at - created_at)
    - Status badges use `STATUS_COLORS` from constants for color coding
    - Each row is clickable → navigates to Task Detail (Task 7) or opens a detail slide-out
    - Empty state: show "No tasks found" message with a link to the Trigger panel
    - Loading state: skeleton rows
    - Error state: show error message with retry button
  - Create `dashboard/src/panels/tasks/StatusBadge.tsx` — reusable status badge component using shadcn `Badge` with color from `STATUS_COLORS`
  - Register route at `/dashboard` (home/default route) in App.tsx

  **Must NOT do**:
  - Do NOT add filtering or search — just the raw list
  - Do NOT add pagination — limit=50 is sufficient for local dev
  - Do NOT add column sorting — keep it simple, newest first

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Data table rendering with status badges, polling integration — visual data display
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Table layout, badge design, empty/loading/error state UX

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8 after shell is ready)
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Task 7 (detail panel needs list context), Task 12
  - **Blocked By**: Tasks 4 (data layer), 5 (shell)

  **References**:

  **Pattern References**:
  - `dashboard/src/hooks/use-poll.ts` (Task 4) — the polling hook to use for auto-refresh
  - `dashboard/src/lib/postgrest.ts` (Task 4) — `postgrestFetch`, `scopeByTenant` for data fetching
  - `dashboard/src/lib/constants.ts` (Task 3) — `STATUS_COLORS`, `POLL_INTERVAL_MS`, `TERMINAL_STATUSES`
  - `dashboard/src/lib/types.ts` (Task 3) — `Task`, `TaskStatus` types
  - `dashboard/src/hooks/use-tenant.ts` (Task 4) — `useTenant()` for current tenant context

  **API/Type References**:
  - PostgREST embedded join: `?select=*,archetypes(role_name,model)` — joins the archetypes table to get the employee type name alongside each task

  **WHY Each Reference Matters**:
  - PostgREST join — without `archetypes(role_name)`, each task only has `archetype_id` (a UUID); the join adds the human-readable employee type name for display
  - `scopeByTenant` — every PostgREST call MUST include `tenant_id=eq.<uuid>` or it returns data from ALL tenants

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Task feed displays existing tasks
    Tool: Playwright
    Preconditions: Gateway + PostgREST running, at least 1 task exists in DB for VLRE tenant
    Steps:
      1. Navigate to http://localhost:7700/dashboard
      2. Wait up to 10s for table to populate
      3. Assert at least one row in the table
      4. Assert each row has a status badge element
      5. Assert each row has an employee type name (not a UUID)
    Expected Result: Table shows tasks with colored status badges and human-readable employee names
    Failure Indicators: Empty table when tasks exist, UUIDs shown instead of names, 401 errors in console
    Evidence: .sisyphus/evidence/task-6-task-feed.png

  Scenario: Task feed auto-refreshes
    Tool: Playwright
    Preconditions: Dashboard loaded
    Steps:
      1. Navigate to http://localhost:7700/dashboard
      2. Note the current task count
      3. Trigger a new task via curl (admin API) in background
      4. Wait 10s (2 poll cycles)
      5. Assert task count increased by 1
    Expected Result: New task appears without manual refresh
    Failure Indicators: Task count unchanged after 10s
    Evidence: .sisyphus/evidence/task-6-auto-refresh.png

  Scenario: Empty state renders when no tasks
    Tool: Playwright
    Preconditions: Dashboard loaded, tenant with no tasks selected (or use a filter that returns empty)
    Steps:
      1. Switch to DozalDevs tenant (if it has no tasks)
      2. Assert "No tasks" or empty state message is visible
    Expected Result: Friendly empty state message, not a blank table or error
    Failure Indicators: Blank table with headers only, or JS error
    Evidence: .sisyphus/evidence/task-6-empty-state.png
  ```

  **Commit**: YES (groups with Task 7)
  - Message: `feat(dashboard): add Task Feed and Task Detail panels`
  - Files: `dashboard/src/panels/tasks/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 7. Task Detail panel — status timeline + approve/reject + raw event viewer

  **What to do**:
  - Create `dashboard/src/panels/tasks/TaskDetail.tsx` — a detail view/slide-out/page for a single task:
    - Route: `/dashboard/tasks/:taskId` OR rendered as a sheet/drawer from the Task Feed (implementer's choice — both are acceptable)
    - Fetches task data from PostgREST: `postgrestFetch<Task>('tasks', { id: 'eq.' + taskId, select: '*,archetypes(role_name,model)' })` — auto-polls
    - Fetches timeline: `postgrestFetch<TaskStatusLog>('task_status_log', { task_id: 'eq.' + taskId, order: 'created_at.asc' })` — auto-polls
    - Fetches pending approval (if status is `Reviewing`): `postgrestFetch<PendingApproval>('pending_approvals', { task_id: 'eq.' + taskId })`
  - Create `dashboard/src/panels/tasks/StatusTimeline.tsx` — renders `task_status_log` entries as a vertical timeline:
    - Each entry shows: `from_status → to_status`, actor, relative timestamp
    - Use colored dots/icons per status (green for Done, red for Failed, etc.)
    - If the timeline is empty or has gaps, show the current `task.status` as the latest known state
  - Add **Approve / Reject buttons** to TaskDetail:
    - Only show when `task.status === 'Reviewing'`
    - If a `pending_approvals` row exists: show buttons
    - If NO `pending_approvals` row but status is Reviewing: show "Approval card unavailable (zombie task)" warning instead of buttons
    - Approve calls `fireApprovalEvent(taskId, 'approve')`
    - Reject calls `fireApprovalEvent(taskId, 'reject')`
    - Show a loading state while the event is being sent
    - After success: show a toast "Approval sent — status will update on next poll"
  - Add **Raw Event viewer** — collapsible section showing `task.raw_event` as formatted JSON (use `<pre>` with `JSON.stringify(raw_event, null, 2)`)
    - Truncate display to 2000 chars with "Show full" toggle for large payloads
  - Show `failure_reason` prominently (red text) when task status is `Failed`

  **Must NOT do**:
  - Do NOT add retry/redispatch buttons
  - Do NOT add log streaming or Docker log fetching
  - Do NOT add task editing capabilities

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex visual component with timeline, conditional buttons, JSON viewer — significant UI/UX work
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Timeline visualization, conditional action UX, JSON rendering

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 8 — but will integrate with Task 6's click handler)
  - **Parallel Group**: Wave 2 (with Tasks 6, 8)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5, 6 (needs task list for navigation context)

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/gateway.ts` (Task 4) — `fireApprovalEvent()` function for approve/reject
  - `dashboard/src/lib/types.ts` (Task 3) — `TaskStatusLog`, `PendingApproval` types
  - `dashboard/src/panels/tasks/StatusBadge.tsx` (Task 6) — reuse for status display
  - AGENTS.md section "Manual approval fallback" — the exact event payload: `{ name: 'employee/approval.received', data: { taskId, action, userId, userName } }`

  **WHY Each Reference Matters**:
  - `fireApprovalEvent` — must POST to `INNGEST_URL/e/local` (not the gateway); the Inngest dev server handles event ingestion directly
  - AGENTS.md approval payload — the event name must be exactly `employee/approval.received` with those exact data field names or the lifecycle won't process it
  - Zombie task handling — AGENTS.md documents that the watchdog cron catches tasks stuck in Reviewing with no `pending_approvals` row after 30 min; the UI must handle this case gracefully

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Task detail shows status timeline
    Tool: Playwright
    Preconditions: At least 1 task exists with status_log entries
    Steps:
      1. Navigate to http://localhost:7700/dashboard
      2. Click on a task row
      3. Assert timeline component is visible
      4. Assert at least one timeline entry with from_status → to_status text
      5. Assert task status badge is shown
    Expected Result: Timeline renders with at least one state transition
    Failure Indicators: Empty timeline, wrong task data, PostgREST 401
    Evidence: .sisyphus/evidence/task-7-timeline.png

  Scenario: Approve button fires event for task in Reviewing state
    Tool: Bash (curl) + Playwright
    Preconditions: A task in Reviewing state exists (create one or use existing)
    Steps:
      1. Navigate to task detail for a Reviewing task
      2. Assert "Approve" and "Reject" buttons are visible
      3. Click "Approve"
      4. Assert loading state appears briefly
      5. Assert toast/notification "Approval sent" appears
      6. curl -s http://localhost:8288/v1/events — check for employee/approval.received event
    Expected Result: Event sent to Inngest, toast shown
    Failure Indicators: Inngest not running (network error), button does nothing
    Evidence: .sisyphus/evidence/task-7-approve-button.png

  Scenario: Raw event viewer handles large payloads
    Tool: Playwright
    Preconditions: A task with raw_event data exists
    Steps:
      1. Navigate to task detail
      2. Find and click "Raw Event" or expand section
      3. Assert JSON is formatted (contains line breaks and indentation)
      4. If payload > 2000 chars, assert "Show full" toggle is present
    Expected Result: JSON renders formatted, doesn't break layout
    Failure Indicators: Unformatted JSON blob, layout overflow, page crash on large payload
    Evidence: .sisyphus/evidence/task-7-raw-event.png
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `feat(dashboard): add Task Feed and Task Detail panels`
  - Files: `dashboard/src/panels/tasks/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 8. Trigger Panel — employee selector + fire button + dry run

  **What to do**:
  - Create `dashboard/src/panels/trigger/TriggerPanel.tsx`:
    - Fetches archetypes for the current tenant from PostgREST: `postgrestFetch<Archetype>('archetypes', { ...scopeByTenant(tenantId), select: 'id,role_name,model,runtime,deliverable_type,risk_model,concurrency_limit' })`
    - Renders a dropdown (shadcn `Select`) of available employees by `role_name`
    - "Dry Run" toggle (shadcn checkbox or switch)
    - "Trigger" button — calls `triggerEmployee(tenantId, selectedSlug, dryRun)`
    - Result section:
      - On success: shows `task_id` (clickable link to Task Detail) and `status_url`
      - On dry run: shows `{ valid, would_fire, archetype_id }`
      - On error: shows error message
    - Pre-filled webhook section (for guest-messaging only):
      - When `guest-messaging` is selected, show a secondary section with pre-filled Hostfully webhook fields (agency_uid, thread_uid, lead_uid, property_uid from AGENTS.md test resources)
      - "Fire Webhook" button — POST to `/webhooks/hostfully` with the pre-filled payload
      - Auto-generates unique `message_uid` using `test-msg-${Date.now()}`
  - Register route at `/dashboard/trigger` in App.tsx

  **Must NOT do**:
  - Do NOT add webhook payload editors for Jira (deprecated) or GitHub (stub)
  - Do NOT add scheduling or recurring trigger features
  - Do NOT add custom payload editors beyond the pre-filled guest-messaging webhook

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form UI with dynamic dropdown, conditional sections, result display — visual interaction work
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Form design, conditional rendering, feedback UX

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/gateway.ts` (Task 4) — `triggerEmployee()` function
  - `dashboard/src/lib/types.ts` (Task 3) — `Archetype` type
  - AGENTS.md section "Hostfully Testing" — test thread_uid: `2f18249a-9523-4acd-a512-20ff06d5c3fa`, lead_uid: `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`, property_uid: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`, agency_uid: `942d08d9-82bb-4fd3-9091-ca0c6b50b578`
  - AGENTS.md section "Simulate a webhook locally" — exact curl payload shape for the Hostfully webhook

  **WHY Each Reference Matters**:
  - AGENTS.md test resources — these exact UUIDs are the designated test fixtures; using different UUIDs will either 404 or trigger unintended actions against real data
  - `triggerEmployee` — this calls `POST /admin/tenants/:id/employees/:slug/trigger` which requires the admin API key

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Trigger panel lists available employees
    Tool: Playwright
    Preconditions: Dashboard loaded, VLRE tenant selected
    Steps:
      1. Navigate to http://localhost:7700/dashboard/trigger
      2. Click employee selector dropdown
      3. Assert dropdown contains "daily-summarizer", "guest-messaging", "code-rotation"
    Expected Result: All 3 VLRE archetypes appear in dropdown
    Failure Indicators: Empty dropdown (PostgREST 401), missing archetypes
    Evidence: .sisyphus/evidence/task-8-trigger-list.png

  Scenario: Dry run validates without creating task
    Tool: Playwright
    Preconditions: Dashboard loaded, API key set
    Steps:
      1. Navigate to /dashboard/trigger
      2. Select "daily-summarizer"
      3. Enable "Dry Run" toggle
      4. Click "Trigger"
      5. Assert result shows { valid: true, would_fire: true }
      6. Assert NO new task was created (check task feed count unchanged)
    Expected Result: Dry run response shown, no task created
    Failure Indicators: Real task created, error response
    Evidence: .sisyphus/evidence/task-8-dry-run.png

  Scenario: Real trigger creates a task
    Tool: Playwright
    Preconditions: Dashboard loaded, API key set, services running
    Steps:
      1. Navigate to /dashboard/trigger
      2. Select "daily-summarizer"
      3. Ensure Dry Run is OFF
      4. Click "Trigger"
      5. Assert result shows a task_id UUID
      6. Click the task_id link
      7. Assert navigated to task detail page for that ID
    Expected Result: Task created, ID shown, navigable to detail
    Failure Indicators: 401 (bad key), 404 (wrong tenant), network error
    Evidence: .sisyphus/evidence/task-8-real-trigger.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add Trigger panel`
  - Files: `dashboard/src/panels/trigger/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 9. Tenant Overview panel — config viewer + secrets manager + OAuth status

  **What to do**:
  - Create `dashboard/src/panels/tenants/TenantOverview.tsx`:
    - Fetches tenant data from PostgREST: `postgrestFetch<Tenant>('tenants', { id: 'eq.' + tenantId })` — single row
    - Fetches archetypes from PostgREST: `postgrestFetch<Archetype>('archetypes', { ...scopeByTenant(tenantId) })`
    - Fetches secrets from Gateway API: `listSecrets(tenantId)` — uses admin API key
    - Fetches integrations from PostgREST: `postgrestFetch('tenant_integrations', { ...scopeByTenant(tenantId) })` — for Slack OAuth status
    - Organized in shadcn `Tabs`: "Config", "Secrets", "Archetypes", "Integrations"
  - **Config tab**: Render `tenant.config` as a formatted JSON tree (read-only). Use `<pre>` with syntax highlighting or just formatted JSON.
  - **Secrets tab**:
    - List of secret keys with `is_set` status (green check / red X badge)
    - For each key: a "Set" button that opens a shadcn `Dialog` with an `Input` field for the secret value
    - Calls `setSecret(tenantId, key, value)` on submit
    - Show common keys as suggestions if not yet set: `slack_bot_token`, `hostfully_api_key`, `hostfully_agency_uid`
  - **Archetypes tab**: Table of archetypes for this tenant showing: role_name, model, runtime, approval_required (from risk_model), concurrency_limit, notification_channel
  - **Integrations tab**: List `tenant_integrations` rows showing: provider (e.g. "slack"), external_id (team ID), connected_at — if no rows, show "No Slack connection — run OAuth flow" with a link to `/slack/install?tenant=<tenantId>`
  - Register route at `/dashboard/tenants` in App.tsx

  **Must NOT do**:
  - Do NOT add tenant CRUD (create/edit/delete) — read-only for tenant data
  - Do NOT show secret VALUES — only key names and is_set status
  - Do NOT add config editing (PATCH endpoint exists but out of scope for V1)
  - Do NOT add archetype editing

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Multi-tab information display with mixed data sources — visual layout work
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Tab design, information density, secret input UX

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/gateway.ts` (Task 4) — `listSecrets()`, `setSecret()` for secrets management
  - `dashboard/src/lib/types.ts` (Task 3) — `Tenant`, `Archetype`, `TenantSecret` types
  - AGENTS.md section "Slack OAuth — Per-Tenant Installation" — install URLs per tenant

  **WHY Each Reference Matters**:
  - `listSecrets` returns `{ secrets: [{ key, is_set }] }` — the UI must destructure this correctly; secret values are NEVER returned
  - OAuth install URLs — the link in the Integrations tab must point to `http://localhost:7700/slack/install?tenant=<tenantId>` to initiate the OAuth flow in a new tab

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tenant overview displays config and secrets
    Tool: Playwright
    Preconditions: Dashboard loaded, VLRE tenant selected
    Steps:
      1. Navigate to http://localhost:7700/dashboard/tenants
      2. Assert Config tab is visible with formatted JSON
      3. Click "Secrets" tab
      4. Assert at least one secret key is listed (e.g. "slack_bot_token")
      5. Assert each secret shows a green/red is_set indicator
    Expected Result: Tenant data renders across all tabs
    Failure Indicators: Empty tabs, 401 on secrets (missing admin key), no config data
    Evidence: .sisyphus/evidence/task-9-tenant-overview.png

  Scenario: Secret setter dialog works
    Tool: Playwright
    Preconditions: Dashboard loaded, API key set
    Steps:
      1. Navigate to /dashboard/tenants → Secrets tab
      2. Click "Set" button next to any secret
      3. Assert dialog opens with input field
      4. Type "test-value-123"
      5. Click "Save"
      6. Assert dialog closes
      7. Assert the is_set indicator for that key shows green
    Expected Result: Secret set via admin API, indicator updated
    Failure Indicators: Dialog doesn't open, 401 on PUT, indicator unchanged
    Evidence: .sisyphus/evidence/task-9-secret-setter.png
  ```

  **Commit**: YES (groups with Tasks 10, 11)
  - Message: `feat(dashboard): add Tenant Overview, Rules & Feedback, Preflight panels`
  - Files: `dashboard/src/panels/tenants/*`, `dashboard/src/panels/rules/*`, `dashboard/src/panels/preflight/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 10. Rules & Feedback panel — per-archetype rules + feedback events feed

  **What to do**:
  - Create `dashboard/src/panels/rules/RulesPanel.tsx`:
    - Fetches archetypes for tenant from PostgREST (for the archetype selector)
    - Archetype selector dropdown (shadcn `Select`) — defaults to first archetype
    - Two sections in shadcn `Tabs`: "Rules" and "Feedback Events"
  - **Rules tab**:
    - Fetches `employee_rules` from PostgREST: `postgrestFetch<EmployeeRule>('employee_rules', { ...scopeByTenant(tenantId), archetype_id: 'eq.' + selectedArchetypeId, order: 'created_at.desc' })`
    - Auto-polls with `usePoll`
    - Renders a list of rules, each showing:
      - Status badge: `proposed` (yellow), `confirmed` (green), `awaiting_input` (orange)
      - `rule_text` (the actual rule content)
      - `source` (e.g. "rule_extractor", "synthesizer")
      - `confirmed_at` or `created_at` relative timestamp
      - If synthesized (has `parent_rule_ids`): show "Synthesized from N rules" label
    - If 403 from PostgREST: show a helpful message "employee_rules table may need ANON access — run: `GRANT SELECT ON employee_rules TO anon;`"
  - **Feedback Events tab**:
    - Fetches `feedback_events` from PostgREST: `postgrestFetch<FeedbackEvent>('feedback_events', { ...scopeByTenant(tenantId), archetype_id: 'eq.' + selectedArchetypeId, order: 'created_at.desc', limit: '30' })`
    - Auto-polls with `usePoll`
    - Renders a feed/timeline of events, each showing:
      - `event_type` badge: `teaching` (blue), `feedback` (gray), `rejection_reason` (red), `edit_diff` (orange)
      - `correction_content` or `original_content` (whichever is present)
      - `actor_id` (Slack user ID)
      - Relative timestamp
    - If 403: same GRANT hint as Rules tab
  - Register route at `/dashboard/rules` in App.tsx

  **Must NOT do**:
  - Do NOT add rule editing or confirmation actions (those go through Slack)
  - Do NOT add feedback event creation
  - Do NOT add rule deletion or archival

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Two data feeds with badges, filters, and conditional rendering — visual list work
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Feed/list UX, badge design, error state handling

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 11)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/types.ts` (Task 3) — `EmployeeRule`, `FeedbackEvent` types
  - `dashboard/src/panels/tasks/StatusBadge.tsx` (Task 6) — reuse badge pattern for rule/event status
  - `prisma/schema.prisma` model `EmployeeRule` — field names: `rule_text`, `source`, `status`, `parent_rule_ids`, `confirmed_at`
  - `prisma/schema.prisma` model `FeedbackEvent` — field names: `event_type`, `correction_content`, `original_content`, `actor_id`

  **WHY Each Reference Matters**:
  - `employee_rules` and `feedback_events` tables may not have ANON SELECT access by default — the 403 error handling is critical for first-run experience
  - `parent_rule_ids` is a PostgreSQL UUID[] array — PostgREST returns it as a JSON array of strings

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rules list renders for selected archetype
    Tool: Playwright
    Preconditions: Dashboard loaded, at least 1 employee_rule exists in DB
    Steps:
      1. Navigate to http://localhost:7700/dashboard/rules
      2. Select "guest-messaging" from archetype dropdown
      3. Assert at least one rule is shown with status badge and rule_text
    Expected Result: Rules display with status badges (proposed/confirmed)
    Failure Indicators: Empty list when rules exist, 403 error (need GRANT), wrong archetype filter
    Evidence: .sisyphus/evidence/task-10-rules-list.png

  Scenario: 403 error shows helpful GRANT message
    Tool: Playwright
    Preconditions: employee_rules table has no ANON SELECT grant (or simulate 403)
    Steps:
      1. Navigate to /dashboard/rules
      2. If 403 occurs, assert message contains "GRANT SELECT"
    Expected Result: Helpful error message instead of generic failure
    Failure Indicators: Generic "Error" with no recovery guidance
    Evidence: .sisyphus/evidence/task-10-grant-hint.png
  ```

  **Commit**: YES (groups with Tasks 9, 11)
  - Message: `feat(dashboard): add Tenant Overview, Rules & Feedback, Preflight panels`
  - Files: `dashboard/src/panels/rules/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 11. Preflight Check panel — health diagnostics

  **What to do**:
  - Create `dashboard/src/panels/preflight/PreflightPanel.tsx`:
    - Runs a set of health checks on demand (button click) — NOT auto-polling (these are active probes)
    - Each check has: name, status (pass/fail/running), description, error message if failed
    - Checks to implement:
      1. **Gateway**: `fetch(GATEWAY_URL + '/health')` → expect 200 with `{ status: 'ok' }`
      2. **PostgREST**: `postgrestFetch('tasks', { limit: '1' })` → expect array response (not 401/403)
      3. **Inngest Dev Server**: `fetch(INNGEST_URL + '/health')` → expect 200 (Inngest dev server exposes /health)
      4. **Slack OAuth (VLRE)**: `postgrestFetch('tenant_integrations', { ...scopeByTenant(tenantId), provider: 'eq.slack' })` → expect at least 1 row
      5. **Secrets Set**: `listSecrets(tenantId)` → check that `slack_bot_token` and key secrets show `is_set: true`
      6. **Docker**: Optional — try `fetch(GATEWAY_URL + '/health')` and if the gateway is up, Docker is running (indirect check)
    - Visual display: List of checks with green ✓ / red ✗ / spinner icons
    - "Run All Checks" button at the top
    - Show timestamp of last check run
  - Register route at `/dashboard/preflight` in App.tsx

  **Must NOT do**:
  - Do NOT auto-run checks on page load (they're active probes that generate network requests)
  - Do NOT add Docker container management (start/stop)
  - Do NOT add service restart capabilities

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Health check UI with async status indicators and progressive rendering
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Status indicator UX, async state management

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/postgrest.ts` (Task 4) — for PostgREST health check
  - `dashboard/src/lib/gateway.ts` (Task 4) — for gateway health check and `listSecrets`
  - `dashboard/src/lib/constants.ts` (Task 3) — `GATEWAY_URL`, `INNGEST_URL`, `POSTGREST_URL`
  - `scripts/preflight-guest-messaging.ts` — the existing 12-check preflight script; use as reference for what checks matter most

  **WHY Each Reference Matters**:
  - `preflight-guest-messaging.ts` — this script already defines the most important health checks; the dashboard version should cover the same ground but with a visual UI instead of terminal output

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Preflight checks all pass when services are running
    Tool: Playwright
    Preconditions: Gateway, PostgREST, Inngest all running
    Steps:
      1. Navigate to http://localhost:7700/dashboard/preflight
      2. Click "Run All Checks"
      3. Wait for all checks to complete (spinners stop)
      4. Assert Gateway check shows green pass
      5. Assert PostgREST check shows green pass
      6. Assert Inngest check shows green pass
    Expected Result: All service checks show green
    Failure Indicators: False failures when services are running, checks never complete
    Evidence: .sisyphus/evidence/task-11-preflight-pass.png

  Scenario: Preflight shows failure when a service is down
    Tool: Playwright
    Preconditions: Inngest dev server intentionally stopped (or use a wrong port)
    Steps:
      1. Navigate to /dashboard/preflight
      2. Click "Run All Checks"
      3. Assert Inngest check shows red fail with error message
      4. Assert other checks still show their actual status (not all failed)
    Expected Result: Individual check failure doesn't cascade; each check is independent
    Failure Indicators: All checks fail when only one service is down
    Evidence: .sisyphus/evidence/task-11-preflight-fail.png
  ```

  **Commit**: YES (groups with Tasks 9, 10)
  - Message: `feat(dashboard): add Tenant Overview, Rules & Feedback, Preflight panels`
  - Files: `dashboard/src/panels/preflight/*`
  - Pre-commit: `cd dashboard && pnpm build`

- [ ] 12. Smoke tests

  **What to do**:
  - Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as dev dependencies in `dashboard/`
  - Configure Vitest in `dashboard/vite.config.ts` — add `test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' }`
  - Create `dashboard/src/test-setup.ts` — import `@testing-library/jest-dom`
  - Write exactly 4 smoke tests (max 5):
    1. `dashboard/src/__tests__/StatusBadge.test.tsx` — renders with each terminal status (Done, Failed, Cancelled) and shows correct text
    2. `dashboard/src/__tests__/TaskFeed.test.tsx` — renders loading state initially, then shows "No tasks" when fetch returns empty array (mock PostgREST)
    3. `dashboard/src/__tests__/TriggerPanel.test.tsx` — renders employee selector dropdown, "Trigger" button, and "Dry Run" toggle
    4. `dashboard/src/__tests__/PreflightPanel.test.tsx` — renders "Run All Checks" button and check list
  - Add `"test": "vitest"` to `dashboard/package.json` scripts
  - Add `pnpm --filter dashboard test --run` as a verification command

  **Must NOT do**:
  - Do NOT write more than 5 test files
  - Do NOT write integration tests that require running services
  - Do NOT mock complex API interactions — keep tests as simple render checks

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple render smoke tests — no complex logic, just verify components mount
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs all panels complete)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7, 8, 9, 10, 11

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/StatusBadge.tsx` (Task 6) — component to test
  - `dashboard/src/panels/tasks/TaskFeed.tsx` (Task 6) — component to test
  - `dashboard/src/panels/trigger/TriggerPanel.tsx` (Task 8) — component to test
  - `dashboard/src/panels/preflight/PreflightPanel.tsx` (Task 11) — component to test

  **External References**:
  - Vitest + React Testing Library setup: `https://vitest.dev/guide/` — Vitest configuration
  - React Testing Library: `https://testing-library.com/docs/react-testing-library/intro/` — render + screen queries

  **WHY Each Reference Matters**:
  - Each panel component must be importable without side effects (no auto-fetching at module level) for tests to work in jsdom without real services

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All smoke tests pass
    Tool: Bash
    Preconditions: All panels implemented (Tasks 6-11 complete)
    Steps:
      1. cd dashboard && pnpm test --run
      2. Check exit code is 0
      3. Check output shows 4 test files, all passing
    Expected Result: 4 test files, all tests pass, exit code 0
    Failure Indicators: Import errors (component has side effects), missing test deps
    Evidence: .sisyphus/evidence/task-12-smoke-tests.txt
  ```

  **Commit**: YES
  - Message: `test(dashboard): add smoke tests`
  - Files: `dashboard/src/__tests__/*`, `dashboard/src/test-setup.ts`, `dashboard/vite.config.ts`, `dashboard/package.json`
  - Pre-commit: `cd dashboard && pnpm test --run`

- [ ] 13. Build script + npm script integration

  **What to do**:
  - Add npm scripts to root `package.json`:
    - `"dashboard:build": "cd dashboard && pnpm build"` — builds the dashboard SPA
    - `"dashboard:dev": "cd dashboard && pnpm dev"` — runs Vite dev server for hot reload (optional, for active UI development)
    - `"dashboard:test": "cd dashboard && pnpm test --run"` — runs dashboard smoke tests
  - Update `dashboard/vite.config.ts` to ensure `outDir` is `dist` and `base` is `/dashboard/`
  - Verify the build output matches what Express static serving expects (from Task 2):
    - `dashboard/dist/index.html` must exist after build
    - `dashboard/dist/assets/` must contain JS and CSS bundles
  - Add `dashboard/dist/` to root `.gitignore` (build artifacts should not be committed)
  - Create a brief `dashboard/README.md` with:
    - How to install: `cd dashboard && pnpm install`
    - How to build: `pnpm dashboard:build` (from root)
    - How to develop: `pnpm dashboard:dev` (Vite dev server with HMR)
    - How to access: `http://localhost:7700/dashboard` (after build + gateway running)
    - Note about the API key prompt on first load

  **Must NOT do**:
  - Do NOT modify the root `build` script — dashboard build is separate
  - Do NOT modify the Dockerfile — dashboard is local dev only
  - Do NOT add dashboard build to the `pnpm dev` startup sequence (it's optional)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config files and npm script additions — no logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 12)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `package.json` (root) — existing npm scripts to follow naming convention
  - `src/gateway/server.ts` (Task 2) — the `express.static()` path that must match Vite's output directory
  - `.gitignore` (root) — existing patterns to follow for build artifact exclusion

  **WHY Each Reference Matters**:
  - The `express.static` path in server.ts resolves to `dashboard/dist/` relative to `process.cwd()` — the Vite `outDir` MUST produce files there or the dashboard returns 404

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build produces expected output
    Tool: Bash
    Preconditions: All dashboard code complete
    Steps:
      1. pnpm dashboard:build
      2. ls dashboard/dist/index.html
      3. ls dashboard/dist/assets/ — check for .js and .css files
    Expected Result: Build succeeds, index.html + assets exist
    Failure Indicators: Missing files, wrong outDir path
    Evidence: .sisyphus/evidence/task-13-build-output.txt

  Scenario: Dashboard accessible after build + gateway start
    Tool: Bash (curl)
    Preconditions: Dashboard built, gateway running
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/dashboard
      2. curl -s http://localhost:7700/dashboard | grep -c "<html"
    Expected Result: 200, response contains HTML
    Failure Indicators: 404 (path mismatch), empty response
    Evidence: .sisyphus/evidence/task-13-served.txt
  ```

  **Commit**: YES
  - Message: `chore(dashboard): add build script + npm script integration`
  - Files: `package.json`, `dashboard/vite.config.ts`, `.gitignore`, `dashboard/README.md`
  - Pre-commit: `pnpm dashboard:build`

- [ ] 14. E2E Prerequisites — Start services, build dashboard, verify readiness

  **What to do**:
  This task sets up the complete environment for the E2E test. The executing agent must:
  - Verify all services are running (gateway :7700, Inngest :8288, PostgREST :54331)
  - Build the dashboard: `pnpm dashboard:build`
  - Verify dashboard is accessible: `curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/dashboard` → 200
  - Open the dashboard in Playwright browser: navigate to `http://localhost:7700/dashboard`
  - Complete the API key prompt: read `ADMIN_API_KEY` from `.env`, enter it into the prompt dialog, click Save
  - Verify the Task Feed loads (table visible, no JS errors)
  - Verify the Preflight panel shows all green: navigate to `/dashboard/preflight`, click "Run All Checks", confirm Gateway/PostgREST/Inngest all pass
  - Save screenshots as evidence at each step
  - Record the initial task count in the Task Feed (needed for later comparison)

  **Must NOT do**:
  - Do NOT start services (assume `pnpm dev` is already running — if not, error out clearly)
  - Do NOT modify any code — this is a testing-only task

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step E2E verification requiring Playwright browser interaction, service health checks, and evidence capture — needs the full tool suite
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Browser automation, DOM interaction patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential E2E flow)
  - **Parallel Group**: Wave E2E (sequential with Tasks 15, 16, 17)
  - **Blocks**: Tasks 15, 16, 17
  - **Blocked By**: Tasks 12, 13

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` "Prerequisites" section — health check commands
  - `.env` file — contains `ADMIN_API_KEY` value to enter into dashboard prompt

  **WHY Each Reference Matters**:
  - The E2E test guide prerequisites define the exact health checks that must pass before any scenario can run
  - The API key from `.env` is needed to unlock dashboard write operations (trigger, secrets, approvals)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard fully operational
    Tool: Playwright + Bash
    Preconditions: pnpm dev running
    Steps:
      1. curl -s http://localhost:7700/health → {"status":"ok"}
      2. curl -s http://localhost:8288/health → 200
      3. curl -s -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" http://localhost:54331/rest/v1/tasks?limit=1 → 200
      4. Navigate Playwright to http://localhost:7700/dashboard
      5. Assert no dialog OR complete API key prompt if shown
      6. Assert Task Feed table is visible (selector: table or [data-testid="task-feed"])
      7. Navigate to /dashboard/preflight, click "Run All Checks"
      8. Assert all checks show pass/green indicators
      9. Take screenshot
    Expected Result: All services healthy, dashboard loads, preflight passes
    Failure Indicators: Any service returns non-200, dashboard shows blank/error, preflight shows red
    Evidence: .sisyphus/evidence/task-14-e2e-prerequisites.png
  ```

  **Commit**: NO

- [ ] 15. E2E Scenario A Step 1 — Trigger guest-messaging from Dashboard + Send Airbnb message

  **What to do**:
  This task performs Scenario A Steps 1-2: trigger a guest-messaging task and confirm it appears in the Dashboard Task Feed. The executing agent must:

  **Part A — Send a guest message on Airbnb (following Scenario A Step 1):**
  - Open a new Playwright browser tab
  - Navigate to `https://www.airbnb.com/guest/messages/2530903609` (the test Airbnb thread)
  - Note: the agent may need to handle Airbnb login if not already authenticated. If login is required and credentials are unavailable, SKIP Part A and use Part B only (webhook trigger from dashboard).
  - Click the compose textbox: `textbox "Write a message..."`
  - Type: `Is there air conditioning? [e2e-test-{unix_epoch}]` (generate epoch with `Date.now()`)
  - Click the Send button
  - Wait 5-10 seconds for the Hostfully webhook to propagate

  **Part B — Alternatively, trigger via Dashboard Trigger Panel (if Airbnb login unavailable):**
  - Navigate to `http://localhost:7700/dashboard/trigger`
  - Select "guest-messaging" from the employee dropdown
  - The pre-filled Hostfully webhook section should appear with test thread/lead UIDs
  - Click "Fire Webhook" button
  - Assert the response shows success (200)

  **Part C — Monitor task creation in Dashboard Task Feed:**
  - Navigate to `http://localhost:7700/dashboard` (Task Feed)
  - Wait up to 30 seconds for a new task to appear (auto-poll should pick it up)
  - Assert a new row appears with employee type "guest-messaging" and status badge
  - Record the task ID from the new row
  - Assert status transitions in real-time: watch for status to change from `Received` → `Ready` → `Executing` (may need to wait 15-30s for worker to start)

  **Part D — Verify in DB (cross-system check):**
  - Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, status, raw_event->>'thread_uid' FROM tasks WHERE source_system IN ('hostfully', 'manual') ORDER BY created_at DESC LIMIT 1;"`
  - Assert status is `Received`, `Ready`, or `Executing`
  - Record the task ID for subsequent steps

  **Part E — Check gateway logs:**
  - Run: `tail -30 /tmp/ai-dev.log | grep -E "hostfully|NEW_INBOX_MESSAGE|task.*created|dispatched"`
  - Assert relevant log lines about task creation/dispatch exist

  **Evidence to capture:**
  - Screenshot of Airbnb message sent (or dashboard trigger response)
  - Screenshot of Task Feed showing the new task
  - Terminal output of DB query and log check
  - Save all to `.sisyphus/evidence/task-15-*`

  **Must NOT do**:
  - Do NOT manually create tasks in the DB
  - Do NOT skip the dashboard verification — the point is testing the dashboard shows real-time updates

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex multi-system E2E test — Playwright browser, Airbnb interaction, dashboard monitoring, DB verification, log checking
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Browser automation across multiple tabs/sites

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential E2E flow)
  - **Parallel Group**: Wave E2E (after Task 14)
  - **Blocks**: Task 16
  - **Blocked By**: Task 14

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` Steps 1-2 — exact Airbnb interaction sequence
  - AGENTS.md "Hostfully Testing" — test thread_uid: `dc2c8f5e-b83d-4078-b709-cc03bf47dd4a`, lead_uid: `f83d431f-0985-457b-a535-60c2991b7c83`, property_uid: `51ec272e-8819-4c8e-b8a3-9a2286b3ed65`, agency_uid: `942d08d9-82bb-4fd3-9091-ca0c6b50b578`
  - AGENTS.md "E2E Testing with Playwright Browser" — Airbnb guest thread URL, compose bar interaction

  **WHY Each Reference Matters**:
  - The E2E test guide defines the exact Airbnb URL and interaction pattern that triggers the real webhook flow through Hostfully
  - The Hostfully test UIDs must match exactly — using wrong UIDs would trigger the webhook but the model won't find messages to respond to
  - The dashboard's Task Feed auto-poll (5s interval) means the new task should appear within 10s of creation

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Task triggered and visible in Dashboard within 30s
    Tool: Playwright + Bash
    Preconditions: Task 14 complete, dashboard loaded
    Steps:
      1. Either send Airbnb message OR fire webhook from Dashboard trigger panel
      2. Navigate to /dashboard (Task Feed)
      3. Wait up to 30s, polling visually for a new row with "guest-messaging" badge
      4. Assert new row appears with status badge showing Received/Ready/Executing
      5. Record the task ID
      6. psql: SELECT id, status FROM tasks ORDER BY created_at DESC LIMIT 1 → matches what dashboard shows
      7. tail -30 /tmp/ai-dev.log | grep "dispatched" → event logged
    Expected Result: Task appears in both Dashboard UI and DB within 30s of trigger
    Failure Indicators: No new row in Task Feed after 30s, mismatch between dashboard and DB status
    Evidence: .sisyphus/evidence/task-15-trigger-and-monitor.png, .sisyphus/evidence/task-15-db-verify.txt, .sisyphus/evidence/task-15-logs.txt

  Scenario: Dashboard shows real-time status transitions
    Tool: Playwright
    Preconditions: Task exists and is progressing
    Steps:
      1. Click on the new task row in Task Feed
      2. Observe Task Detail panel/page
      3. Wait up to 60s, watching status badge change
      4. Assert status changes at least once (e.g. Received → Executing)
      5. Assert timeline section shows at least 2 entries after 60s
    Expected Result: Dashboard reflects status changes in real-time (within poll interval)
    Failure Indicators: Status badge never changes, timeline stays empty
    Evidence: .sisyphus/evidence/task-15-status-transitions.png
  ```

  **Commit**: NO

- [ ] 16. E2E Scenario A Steps 3-5 — Wait for Reviewing state + Approve from Dashboard

  **What to do**:
  This task performs Scenario A Steps 3-5: wait for the task to reach `Reviewing`, approve it from the Dashboard (NOT Slack), and verify it progresses to `Done`. The executing agent must:

  **Part A — Wait for task to reach Reviewing (may take 1-3 minutes):**
  - Stay on the Task Detail page in Playwright (from Task 15)
  - Poll every 10-15 seconds by observing the status badge and timeline
  - Wait up to 5 minutes for status to show "Reviewing" (worker needs to execute, draft a reply, post approval card)
  - If task goes to `Done` quickly (pre-check fired — last message was from host), document this and note: "Pre-check auto-completed — no approval needed. This is expected if the last Hostfully message is from the host."
  - If task reaches `Reviewing`, proceed to Part B

  **Part B — Verify Dashboard shows approval-ready state:**
  - In Task Detail, assert "Approve" and "Reject" buttons are visible
  - Assert the status badge shows "Reviewing" (yellow/amber)
  - Assert the timeline shows entries up to `Submitting → Reviewing`
  - Take screenshot of the approval-ready state

  **Part C — Cross-check with DB:**
  - Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT t.id, t.status, pa.guest_name, pa.property_name FROM tasks t LEFT JOIN pending_approvals pa ON pa.task_id = t.id::text WHERE t.status = 'Reviewing' ORDER BY t.created_at DESC LIMIT 1;"`
  - Assert status = `Reviewing` and `pending_approvals` row exists with guest_name populated
  - Record the task ID for final verification

  **Part D — Approve from Dashboard:**
  - In the Dashboard Task Detail, click the "Approve" button
  - Assert loading/processing state appears (button disabled or spinner)
  - Assert success toast appears ("Approval sent" or similar)
  - Wait up to 30s for status to change from `Reviewing`

  **Part E — Verify post-approval state in Dashboard:**
  - Watch the Task Detail status badge — it should transition through: `Reviewing → Approved → Delivering → Done`
  - The timeline should update with new entries showing the approval and delivery
  - Assert final status badge shows "Done" (green)
  - Take screenshot of the completed task with full timeline

  **Part F — Cross-check approval event in Inngest:**
  - Run: `curl -s "http://localhost:8288/v1/events?name=employee%2Fapproval.received" | python3 -c "import sys,json; events=json.load(sys.stdin); print(json.dumps(events[-1] if events else {}, indent=2))" 2>/dev/null || echo "Inngest events API not available"`
  - If available, assert the latest event has `data.action = "approve"` and matches the task ID
  - Note: The Inngest dev server events API may not be available in all versions — this is a best-effort check

  **Evidence to capture:**
  - Screenshot of Reviewing state with Approve/Reject buttons visible
  - Screenshot of Done state with full timeline
  - DB query output showing Reviewing → Done transition
  - Inngest event verification (if available)
  - Save all to `.sisyphus/evidence/task-16-*`

  **Must NOT do**:
  - Do NOT approve via Slack — the whole point is testing the Dashboard approval path
  - Do NOT use the manual curl fallback to Inngest — use the Dashboard button
  - Do NOT modify any DB state manually

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Timing-sensitive E2E flow requiring patient waiting, precise button clicks, multi-system verification
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Browser automation, waiting strategies, state observation

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential E2E flow)
  - **Parallel Group**: Wave E2E (after Task 15)
  - **Blocks**: Task 17
  - **Blocked By**: Task 15

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` Steps 3-5 — approval card verification, clicking Approve, post-approval state checks
  - `dashboard/src/panels/tasks/TaskDetail.tsx` (Task 7) — the Approve button implementation and fireApprovalEvent call
  - AGENTS.md "Manual approval fallback" — the event payload shape: `{ name: 'employee/approval.received', data: { taskId, action: 'approve', userId, userName } }`

  **WHY Each Reference Matters**:
  - The test guide defines the exact expected state machine trace: `NULL→Received → Ready → Executing → Submitting → Reviewing → Approved → Delivering → Done`
  - The Dashboard's approve button must produce the exact same Inngest event that the Slack button would — if the payload shape is wrong, the lifecycle ignores it
  - If `pending_approvals` row doesn't exist when status is Reviewing, the Dashboard should show "Approval unavailable" (zombie task handling from Task 7)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard approval triggers full lifecycle completion
    Tool: Playwright + Bash
    Preconditions: Task from Task 15 is in Reviewing state
    Steps:
      1. Verify Dashboard Task Detail shows "Approve" button
      2. Click "Approve"
      3. Assert toast/notification confirms approval sent
      4. Wait up to 60s for status to change to "Done"
      5. Assert final status badge is "Done" (green)
      6. Assert timeline shows at least: Reviewing→Approved, Approved→Delivering, Delivering→Done
      7. psql: SELECT from_status, to_status FROM task_status_log WHERE task_id='<id>' ORDER BY created_at
         → Expected: NULL→Received, Received→Ready, Ready→Executing, Executing→Submitting, Submitting→Reviewing, Reviewing→Approved, Approved→Delivering, Delivering→Done
      8. psql: SELECT COUNT(*) FROM pending_approvals WHERE task_id='<id>'::text → Expected: 0
    Expected Result: Full lifecycle completes via Dashboard approval, DB confirms clean state
    Failure Indicators: Status stuck at Reviewing (event not received), pending_approvals not cleaned up, timeline incomplete
    Evidence: .sisyphus/evidence/task-16-approve-flow.png, .sisyphus/evidence/task-16-done-state.png, .sisyphus/evidence/task-16-db-trace.txt

  Scenario: Pre-check auto-complete path (alternate outcome)
    Tool: Playwright + Bash
    Preconditions: Task triggered but last Hostfully message is from host
    Steps:
      1. If task goes to Done in <30s without reaching Reviewing:
      2. Assert Dashboard shows "Done" status badge
      3. Assert timeline shows abbreviated trace (Received→Done or similar)
      4. Document: "Pre-check auto-completed — no approval needed"
    Expected Result: Dashboard correctly displays auto-completed task
    Failure Indicators: Dashboard shows stale status, timeline is empty for a Done task
    Evidence: .sisyphus/evidence/task-16-precheck-path.png
  ```

  **Commit**: NO

- [ ] 17. E2E Scenario A Steps 6-7 — Full cross-system verification + Slack + Delivery

  **What to do**:
  This is the final verification step of the E2E flow. The executing agent must verify the complete system state across all subsystems to confirm the Dashboard-driven approval produced the same outcome as a Slack-driven approval would.

  **Part A — Verify delivery to guest (Scenario A Step 7):**
  - If Part A of Task 15 sent a real Airbnb message:
    - Navigate Playwright to `https://www.airbnb.com/guest/messages/2530903609`
    - Look for a new reply from "Leo" (the host) that matches the draft_response
    - Take screenshot of the delivered reply
  - If webhook was used instead (no real Airbnb message): skip delivery verification and note "Webhook-only trigger — no Airbnb delivery to verify"

  **Part B — Verify Slack notification messages updated:**
  - Navigate Playwright to `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S` (VLRE `#cs-guest-communication`)
  - Look for the most recent "Papi chulo" message related to this task
  - Verify the top-level notify message shows terminal state (✅ Done with guest name)
  - Verify the threaded approval card updated to show "Approved by" state
  - Take screenshot of the Slack thread showing the complete flow

  **Part C — Verify full DB state (comprehensive):**
  - Task status: `SELECT id, status, metadata->>'guest_name', metadata->>'draft_response' FROM tasks WHERE id='<task_id>';` → status=Done, metadata populated
  - Status log trace: `SELECT from_status, to_status, actor, created_at FROM task_status_log WHERE task_id='<task_id>' ORDER BY created_at;` → full trace from NULL→Received to Delivering→Done
  - Pending approvals cleaned: `SELECT COUNT(*) FROM pending_approvals WHERE task_id='<task_id>';` → 0
  - Execution record: `SELECT current_stage, fix_iterations FROM executions WHERE task_id='<task_id>';` → should exist with completion data

  **Part D — Verify Inngest run completed:**
  - Open Playwright to `http://localhost:8288` (Inngest dashboard)
  - Navigate to the `employee/universal-lifecycle` function
  - Find the most recent completed run (by timestamp)
  - Verify it shows green/completed status (not failed/retrying)
  - Take screenshot of the Inngest run overview

  **Part E — Verify Dashboard reflects final state correctly:**
  - Navigate back to `http://localhost:7700/dashboard` (Task Feed)
  - Locate the task from this E2E run
  - Assert it shows "Done" badge (green) in the feed
  - Click into task detail
  - Assert timeline is complete with all transitions
  - Assert no stale "Approve"/"Reject" buttons are visible (task is terminal)
  - Navigate to `/dashboard/tenants` → verify the tenant overview still loads correctly
  - Navigate to `/dashboard/preflight` → verify all checks still pass (system healthy after E2E run)

  **Part F — Document E2E results:**
  - Create a summary of all steps that passed/failed
  - Record: task_id, total E2E duration (from trigger to Done), number of state transitions, whether delivery was verified
  - Save summary to `.sisyphus/evidence/task-17-e2e-summary.md`

  **Must NOT do**:
  - Do NOT fix any issues found — only document them
  - Do NOT skip any verification step (mark as "unable to verify" with reason if blocked)
  - Do NOT consider the E2E passed if the dashboard shows stale/incorrect data vs DB truth

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-system verification requiring Playwright across 4 different web apps (Dashboard, Airbnb, Slack, Inngest), plus DB queries and log analysis
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Multi-site browser automation, DOM assertion patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential E2E flow)
  - **Parallel Group**: Wave E2E (after Task 16)
  - **Blocks**: Task 18
  - **Blocked By**: Task 16

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` Steps 6-7 — Slack message verification, Airbnb delivery check, DB state checks
  - AGENTS.md "E2E Testing with Playwright Browser" — Slack workspace URL: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`, Airbnb thread URL
  - AGENTS.md "Verified E2E flow — Scenario A" — the 12-step flow table showing exactly what to verify at each point

  **WHY Each Reference Matters**:
  - The test guide defines the exact expected state for every subsystem at flow completion — the Dashboard must show the same truth as the DB
  - The Slack channel `C0AMGJQN05S` is where approval cards and terminal state messages are posted — verifying Slack confirms the lifecycle ran the same delivery path regardless of approval source (Dashboard vs Slack button)
  - The Inngest dashboard is the definitive source of truth for whether the function run completed without errors

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Complete cross-system state consistency
    Tool: Playwright + Bash
    Preconditions: Task approved and completed (Task 16)
    Steps:
      1. psql: full task_status_log trace → 8 transitions ending at Delivering→Done
      2. psql: pending_approvals count = 0
      3. psql: tasks.status = 'Done', metadata populated
      4. Playwright → Slack channel: terminal message shows ✅ Done
      5. Playwright → Inngest dashboard: function run shows completed (green)
      6. Playwright → Dashboard Task Feed: task shows Done badge
      7. Playwright → Dashboard Task Detail: timeline complete, no action buttons visible
      8. Playwright → Dashboard Preflight: all checks still green
    Expected Result: All 8 checks pass — complete system consistency
    Failure Indicators: Dashboard shows different status than DB, Slack message not updated, Inngest run shows failed steps, stale approve buttons on Done task
    Evidence: .sisyphus/evidence/task-17-cross-system.png, .sisyphus/evidence/task-17-slack-verify.png, .sisyphus/evidence/task-17-inngest-verify.png, .sisyphus/evidence/task-17-db-trace.txt, .sisyphus/evidence/task-17-e2e-summary.md

  Scenario: Dashboard as complete workflow replacement validated
    Tool: Playwright
    Preconditions: All above checks pass
    Steps:
      1. Document: "The dashboard successfully replaces the old workflow"
      2. List operations performed exclusively through dashboard: trigger, monitor, approve
      3. List operations that still required external tools: Airbnb message (trigger source), Slack verification (cross-check only)
      4. Confirm: NO curl commands were needed for the core trigger→monitor→approve→verify workflow
    Expected Result: Dashboard demonstrated as a functional replacement for curl + Slack for local testing
    Failure Indicators: Any step in the trigger→approve flow required falling back to curl/psql
    Evidence: .sisyphus/evidence/task-17-e2e-summary.md
  ```

  **Commit**: NO

- [ ] 18. Notify completion

  **What to do**:
  - Send Telegram notification: plan `local-ops-dashboard` complete, all tasks done including E2E validation, come back to review results.
  - Run: `tsx scripts/telegram-notify.ts "✅ local-ops-dashboard complete — All tasks done including E2E validation. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 17)
  - **Blocks**: None
  - **Blocked By**: Task 17

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "✅ local-ops-dashboard complete — All tasks done including E2E validation. Come back to review results."
    Expected Result: Exit code 0, notification delivered
    Evidence: .sisyphus/evidence/task-18-notify.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (navigate to `/dashboard`, check each panel loads, verify approve/reject fires event, verify trigger creates task). For each "Must NOT Have": search codebase for forbidden patterns (WebSocket, SERVICE_ROLE_KEY in dashboard/, modifications to src/inngest/). Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm --filter dashboard build` (no errors). Check for: `as any`, empty catches, console.log in production components, unused imports, hardcoded secrets beyond ANON_KEY. Check shadcn/ui component count ≤10. Verify no modifications to `tsconfig.json` or `tsconfig.build.json`.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state (services running). Navigate to `http://localhost:7700/dashboard`. Execute: (1) verify all 5 panels load, (2) trigger daily-summarizer for VLRE, see task appear in feed, (3) navigate to Task Detail for any task, verify timeline renders, (4) check Preflight panel shows green for all services, (5) verify tenant selector switches context. Save screenshots to `.sisyphus/evidence/final-qa/`.
      Output: `Panels [5/5] | Trigger [PASS/FAIL] | Detail [PASS/FAIL] | Preflight [PASS/FAIL] | Tenant Switch [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual implementation. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag: any new Express routes beyond static+catch-all, any WebSocket code, any modifications to inngest/workers/worker-tools directories, any shadcn components beyond 10. Detect unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit # | Message                                                                    | Files                                                        | Verify                                |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------- |
| 1        | `feat(dashboard): scaffold Vite + React + Tailwind + shadcn/ui project`    | `dashboard/*`                                                | `pnpm --filter dashboard build`       |
| 2        | `feat(gateway): add CORS + dashboard static serving + SPA catch-all`       | `src/gateway/server.ts`, `package.json`                      | `curl localhost:7700/dashboard` → 200 |
| 3        | `feat(dashboard): add data layer (PostgREST client, API client, hooks)`    | `dashboard/src/lib/*`                                        | `pnpm --filter dashboard build`       |
| 4        | `feat(dashboard): add app shell with layout, navigation, tenant selector`  | `dashboard/src/components/layout/*`, `dashboard/src/App.tsx` | build passes                          |
| 5        | `feat(dashboard): add Task Feed and Task Detail panels`                    | `dashboard/src/panels/tasks/*`                               | build passes                          |
| 6        | `feat(dashboard): add Trigger panel`                                       | `dashboard/src/panels/trigger/*`                             | build passes                          |
| 7        | `feat(dashboard): add Tenant Overview, Rules & Feedback, Preflight panels` | `dashboard/src/panels/*`                                     | build passes                          |
| 8        | `test(dashboard): add smoke tests`                                         | `dashboard/src/__tests__/*`                                  | `pnpm --filter dashboard test`        |
| 9        | `chore(dashboard): add build script + npm script integration`              | `package.json`, `dashboard/vite.config.ts`                   | `pnpm dashboard:build`                |

---

## Success Criteria

### Verification Commands

```bash
# Dashboard serves
curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/dashboard
# Expected: 200

# SPA routing works (deep link)
curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/dashboard/tasks/fake-id
# Expected: 200

# CORS present on admin API
curl -s -I -H "Origin: http://localhost:7700" http://localhost:7700/health | grep -i "access-control"
# Expected: access-control-allow-origin header present

# PostgREST reachable with ANON_KEY
curl -s -o /dev/null -w "%{http_code}" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" "http://localhost:54331/rest/v1/tasks?limit=1"
# Expected: 200

# Dashboard build succeeds
cd dashboard && pnpm build
# Expected: exit 0, no errors

# Smoke tests pass
cd dashboard && pnpm test --run
# Expected: 3-5 tests pass
```

### Final Checklist

- [ ] All "Must Have" present (Task Feed, Trigger, Tenant Overview, Rules, Preflight, CORS, SPA routing, API key prompt)
- [ ] All "Must NOT Have" absent (no WS/SSE, no new routes, no inngest/worker changes, no SERVICE_ROLE_KEY)
- [ ] All smoke tests pass
- [ ] Dashboard loads in browser at http://localhost:7700/dashboard
- [ ] E2E Scenario A completed: trigger → monitor → approve → verify, all done through the Dashboard
- [ ] Cross-system consistency verified: Dashboard status matches DB, Inngest, and Slack
