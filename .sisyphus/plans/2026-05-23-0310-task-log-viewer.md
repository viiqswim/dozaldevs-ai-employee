# Task Log Viewer — Copyable Command + Live SSE Log Viewer

## TL;DR

> **Quick Summary**: Add a live log viewer to the dashboard task detail page that streams Docker container logs via SSE, plus a copyable `docker logs` command for terminal use.
>
> **Deliverables**:
>
> - SSE gateway endpoint: `GET /admin/tenants/:tenantId/tasks/:id/logs`
> - Dashboard component: `ExecutionLogViewer.tsx` with terminal-style dark log viewer
> - Copyable Docker command on task detail page
> - `useExecutionLogs` hook using `EventSource`
> - Tests for the SSE endpoint
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5

---

## Context

### Original Request

User triggered `real-estate-motivation-bot-2` three times after switching to `openai/gpt-oss-120b`. Two of three tasks showed "✅ Task complete" with no thread reply. During investigation, user wanted to see live container logs to understand what happened — but no log viewer exists in the dashboard and the container name isn't surfaced anywhere.

### Interview Summary

**Key Discussions**:

- **Scope**: Local Docker mode only — no Fly.io log support
- **Visibility**: Active (Executing) + historical (Done/Failed) log viewing
- **Streaming**: SSE (Server-Sent Events) for real-time tail -f experience
- **Tests**: Tests after implementation

**Research Findings**:

- Log files already captured by lifecycle at `/tmp/employee-{taskId.slice(0,8)}.log` via `docker logs -f`
- Container name pattern: `employee-{taskId.slice(0,8)}` — deterministic from task ID
- No SSE patterns exist in the gateway — greenfield
- TaskDetail page has 8 card sections; log viewer fits between Execution Metrics (#4) and Deliverable (#5)
- `?transcript=1` URL param toggle pattern already exists — reuse as `?logs=1`
- `admin-tasks.ts` already wired in `server.ts` line 179 — no server.ts changes needed
- `requireAdminKey` is per-route (not global) — must explicitly add to new route

### Metis Review

**Identified Gaps** (addressed):

- Security: `requireAdminKey` must be on the SSE route — log files contain full OpenCode output including tool calls
- Connection leak: `req.on('close', cleanup)` mandatory to prevent orphaned file tails
- File existence: Must check `fs.existsSync()` BEFORE setting SSE headers — cannot send 404 after SSE headers are flushed
- Delivery logs: Out of scope — execution log only (delivery log is tiny)
- Docker command audience: Show to all users with "Local development only" label — dashboard has no env var access
- CORS: Already handled globally (`cors({ origin: true })` at server.ts:74)
- `X-Accel-Buffering: no` header: Add proactively for nginx compatibility

---

## Work Objectives

### Core Objective

Give developers a way to view live and historical Docker container logs for any task, both from the dashboard and the terminal.

### Concrete Deliverables

- SSE endpoint at `GET /admin/tenants/:tenantId/tasks/:id/logs` in `admin-tasks.ts`
- `ExecutionLogViewer.tsx` component in `dashboard/src/panels/tasks/`
- `useExecutionLogs.ts` hook in `dashboard/src/hooks/` using `EventSource`
- Copyable Docker command element in `TaskDetail.tsx`
- Tests for the SSE endpoint in `tests/gateway/routes/admin-tasks-logs.test.ts`
- Updated AGENTS.md (new admin API endpoint)

### Definition of Done

- [ ] `curl -N -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/.../tasks/{id}/logs"` streams log lines as SSE events
- [ ] Dashboard task detail page shows "View Logs" button that opens a terminal-style log viewer
- [ ] Copyable Docker command shown for tasks with executions
- [ ] `?logs=1` URL param toggles log viewer (matches `?transcript=1` pattern)
- [ ] `pnpm build` succeeds with 0 TypeScript errors
- [ ] `pnpm test -- --run` passes (no regressions)

### Must Have

- SSE endpoint with `requireAdminKey` authentication
- `fs.existsSync()` check before SSE headers — return 404 JSON if log file missing
- `req.on('close', cleanup)` to destroy read stream on client disconnect
- `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no` headers
- `res.writableEnded` check before each `res.write()` call
- `?logs=1` URL param toggle (matching `?transcript=1` pattern exactly)
- Copyable command only when `execution` exists and task is NOT auto-pass
- Card shell: `rounded-lg border bg-card` with consistent padding
- `GetTaskParamsSchema` for param validation on SSE route
- Log viewer between Execution Metrics and Deliverable sections in TaskDetail

### Must NOT Have (Guardrails)

- No Fly.io log support — local Docker mode only
- No delivery log (`employee-delivery-*`) — execution log only
- No changes to `server.ts` — route added inside existing `adminTasksRoutes()` factory
- No `usePoll` for log streaming — use `EventSource` (SSE-native) with `useEffect` cleanup
- No `z.string().uuid()` — use `GetTaskParamsSchema` which uses loose `UUID_REGEX`
- No new copy-to-clipboard utility — check if one exists first, use native `navigator.clipboard.writeText()` if not
- No log search/filter functionality
- No log persistence beyond `/tmp/`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after (add tests for SSE endpoint after implementation)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — send requests, assert status + headers + response body
- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — backend + foundation, PARALLEL):
├── Task 1: SSE endpoint in admin-tasks.ts [unspecified-high]
└── Task 2: Copyable Docker command in TaskDetail.tsx [quick]

Wave 2 (After Task 1 — frontend log viewer):
├── Task 3: useExecutionLogs hook + ExecutionLogViewer component [visual-engineering]
└── Task 4: Tests for SSE endpoint [quick]

Wave 3 (After Wave 2 — docs):
└── Task 5: Update AGENTS.md + README.md [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 5 → F1-F4 → user okay
Parallel Speedup: ~35% faster than sequential
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 3, 4   | 1    |
| 2    | —          | 5      | 1    |
| 3    | 1          | 5      | 2    |
| 4    | 1          | 5      | 2    |
| 5    | 2, 3, 4    | —      | 3    |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `unspecified-high`, T2 → `quick`
- **Wave 2**: **2 tasks** — T3 → `visual-engineering`, T4 → `quick`
- **Wave 3**: **1 task** — T5 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. SSE Endpoint for Streaming Task Logs

  **What to do**:

  Add a new route inside the existing `adminTasksRoutes()` factory in `src/gateway/routes/admin-tasks.ts`:

  **Route**: `GET /admin/tenants/:tenantId/tasks/:id/logs`

  **Implementation steps**:
  1. Add `import { createReadStream, existsSync } from 'fs';` and `import { createInterface } from 'readline';` at top of file
  2. Add new `router.get('/admin/tenants/:tenantId/tasks/:id/logs', requireAdminKey, async (req, res) => { ... })` BEFORE the `return router` line
  3. Validate params with `GetTaskParamsSchema.safeParse(req.params)` — return 400 on failure
  4. Verify task exists in DB (same Prisma query pattern as existing route) — return 404 if not found
  5. Construct log file path: `const logPath = /tmp/employee-${taskId.slice(0, 8)}.log`
  6. Check `existsSync(logPath)` — if false, return `res.status(404).json({ error: 'LOG_NOT_FOUND', message: 'No log file found for this task. The worker may not have started yet.' })`
  7. Set SSE headers:
     ```
     res.setHeader('Content-Type', 'text/event-stream');
     res.setHeader('Cache-Control', 'no-cache');
     res.setHeader('Connection', 'keep-alive');
     res.setHeader('X-Accel-Buffering', 'no');
     res.flushHeaders();
     ```
  8. Check task status to decide streaming mode:
     - If task status is terminal (`Done`, `Failed`, `Cancelled`, `Stale`): read the full file, send each line as `data: {JSON}\n\n`, then send `event: done\ndata: {}\n\n` and call `res.end()`
     - If task status is active (`Executing`, `Delivering`, etc.): read existing content, then use `fs.watchFile` or poll the file every 1s for new content. Send new lines as they appear.
  9. Register `req.on('close', () => { ... })` — clean up: stop file watching, destroy any read streams
  10. Guard every `res.write()` with `if (!res.writableEnded)` check

  **SSE event format**:

  ```
  data: {"line":"<log line content>","timestamp":"<ISO if parseable>"}\n\n
  ```

  For stream completion:

  ```
  event: done\ndata: {"reason":"complete"}\n\n
  ```

  **Must NOT do**:
  - Do not create a new route file — add inside existing `adminTasksRoutes()` factory
  - Do not modify `server.ts`
  - Do not read delivery logs (`employee-delivery-*`)
  - Do not use `z.string().uuid()` — use `GetTaskParamsSchema`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Backend SSE implementation with file streaming, cleanup patterns, and error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-tasks.ts:17-54` — existing route structure, Prisma query, error shapes, `requireAdminKey` usage
  - `src/gateway/routes/admin-tools.ts:21-23` — filesystem-reading per-request pattern
  - `src/inngest/employee-lifecycle.ts:145-146` — where log files are created (`docker logs -f ${containerId} > ${logFile} 2>&1`)
  - `src/inngest/employee-lifecycle.ts:602` — container name pattern: `employee-${taskId.slice(0, 8)}`

  **API/Type References**:
  - `src/gateway/validation/schemas.ts:189` — `GetTaskParamsSchema` (validates `tenantId` + `id`)
  - `src/gateway/middleware/admin-auth.ts` — `requireAdminKey` middleware

  **WHY Each Reference Matters**:
  - `admin-tasks.ts` shows the exact factory pattern, Prisma query shape, and error format to replicate
  - `admin-tools.ts` proves filesystem reads are acceptable in route handlers
  - Lifecycle code shows exactly where and how log files are created — the path pattern is the source of truth

  **Acceptance Criteria**:
  - [ ] Route exists at `GET /admin/tenants/:tenantId/tasks/:id/logs`
  - [ ] `requireAdminKey` middleware is applied
  - [ ] Returns 404 JSON when log file doesn't exist
  - [ ] Returns 401 without auth header
  - [ ] Returns SSE stream with correct headers for tasks with log files
  - [ ] Stream closes after file is fully read for terminal tasks
  - [ ] `req.on('close', cleanup)` registered

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SSE stream for completed task
    Tool: Bash (curl)
    Preconditions: A task in Done status with log file at /tmp/employee-{id.slice(0,8)}.log
    Steps:
      1. `source .env`
      2. Create a test log file: `echo -e "line1\nline2\nline3" > /tmp/employee-testtest.log`
      3. Find a Done task: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id FROM tasks WHERE status = 'Done' AND id LIKE 'testtest%' LIMIT 1;"`
      4. If no matching task, use any Done task and create `/tmp/employee-{its_id_prefix}.log`
      5. `curl -N -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/{task_id}/logs" -m 5 2>/dev/null`
      6. Assert response starts with `data:` lines
      7. Assert headers include `content-type: text/event-stream`
    Expected Result: SSE stream with data lines, connection closes after file fully read
    Evidence: .sisyphus/evidence/task-1-sse-stream.txt

  Scenario: 404 when no log file
    Tool: Bash (curl)
    Preconditions: A task with no corresponding log file in /tmp/
    Steps:
      1. `source .env`
      2. `curl -s -w "\n%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/00000000-0000-0000-0000-000000000099/logs"`
      3. Assert HTTP status is 404
      4. Assert response body contains `"error"`
    Expected Result: 404 JSON response with error message
    Evidence: .sisyphus/evidence/task-1-404.txt

  Scenario: 401 without auth
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. `curl -s -o /dev/null -w "%{http_code}" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/00000000-0000-0000-0000-000000000099/logs"`
      2. Assert HTTP status is 401
    Expected Result: 401 response
    Evidence: .sisyphus/evidence/task-1-401.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add SSE endpoint for streaming task execution logs`
  - Files: `src/gateway/routes/admin-tasks.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Copyable Docker Command on Task Detail Page

  **What to do**:

  Add a small section to `dashboard/src/panels/tasks/TaskDetail.tsx` that shows a copyable terminal command for viewing container logs.

  **Implementation steps**:
  1. After the Execution Metrics section (around line 429), add a small inline element (NOT a full card section — just a subtle row)
  2. Show only when `execution` exists AND task is NOT auto-pass (`isAutoPass` is already computed in the component)
  3. Display: a monospace code snippet with the command `docker logs -f employee-{taskId.slice(0, 8)}`
  4. Add a copy button that uses `navigator.clipboard.writeText()` — show a brief "Copied!" toast via `sonner` (already imported)
  5. Add a small muted label: "Local development only"
  6. Also show the log file path: `tail -f /tmp/employee-{taskId.slice(0, 8)}.log`

  **Visual style**:
  - Small, not a full card — perhaps a `text-xs text-muted-foreground` row with a `bg-muted rounded px-3 py-2 font-mono` code block
  - Copy button: small icon button (use `Copy` or `Clipboard` from lucide-react)
  - Place between Execution Metrics and the future log viewer section

  **Must NOT do**:
  - Do not show for auto-pass tasks (no container was launched)
  - Do not create a new utility for clipboard — use native `navigator.clipboard.writeText()`
  - Do not show when `execution` is null

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple UI addition, ~20 lines of JSX
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/TaskDetail.tsx:401-429` — Execution Metrics section (insert after this)
  - `dashboard/src/panels/tasks/TaskDetail.tsx:530-544` — "View Transcript" button pattern (similar toggle UI)

  **External References**:
  - `lucide-react` — `Copy`, `Check` icons for copy button state

  **WHY Each Reference Matters**:
  - Execution Metrics section shows the exact insertion point and the `execution` / `isAutoPass` guards already in scope
  - Transcript button shows the `variant="outline" size="sm"` styling convention

  **Acceptance Criteria**:
  - [ ] Copyable command visible when execution exists and not auto-pass
  - [ ] Hidden when execution is null or auto-pass
  - [ ] Copy button copies command to clipboard
  - [ ] Toast confirms copy action
  - [ ] Command contains correct task ID prefix (first 8 chars)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Copyable command visible for completed task
    Tool: Playwright
    Preconditions: A Done task with an execution record, dev server at localhost:7701
    Steps:
      1. Navigate to `http://localhost:7701/dashboard/tasks/{task_id}?tenant=00000000-0000-0000-0000-000000000003`
      2. Wait for page to load (status badge visible)
      3. Assert an element containing `docker logs -f employee-{taskId.slice(0,8)}` is visible
      4. Assert an element containing `tail -f /tmp/employee-{taskId.slice(0,8)}.log` is visible
    Expected Result: Both commands visible with correct task ID prefix
    Evidence: .sisyphus/evidence/task-2-command-visible.png

  Scenario: Command hidden for auto-pass task
    Tool: Playwright
    Preconditions: A Done task that was auto-passed (no execution), dev server at localhost:7701
    Steps:
      1. Navigate to task detail page for an auto-pass task
      2. Assert no element containing `docker logs -f` is visible
    Expected Result: Command not rendered
    Evidence: .sisyphus/evidence/task-2-command-hidden.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add copyable Docker command to task detail page`
  - Files: `dashboard/src/panels/tasks/TaskDetail.tsx`
  - Pre-commit: `pnpm build`

- [x] 3. Live Execution Log Viewer Component + Hook

  **What to do**:

  Create a `useExecutionLogs` hook that connects to the SSE endpoint via `EventSource`, and an `ExecutionLogViewer` component that renders log lines in a terminal-style dark box.

  **Step 1 — Create `dashboard/src/hooks/use-execution-logs.ts`**:
  - Accept `taskId: string`, `tenantId: string`, `enabled: boolean` as params
  - When `enabled` is true, create an `EventSource` connection to `http://localhost:7700/admin/tenants/${tenantId}/tasks/${taskId}/logs`
  - **CRITICAL**: The `EventSource` API does not support custom headers. The gateway's `requireAdminKey` uses `X-Admin-Key` header. Solutions (pick the simplest that works):
    - Option A: Add `?key=${adminApiKey}` query param support to the SSE route (alongside header auth)
    - Option B: Use `fetch` with `ReadableStream` instead of `EventSource` — this supports custom headers
    - Option C: Use a library like `eventsource-polyfill` that supports headers
    - **Recommended**: Option B — use `fetch` with `ReadableStream` and manually parse SSE lines. This avoids adding query-param auth or new dependencies.
  - Accumulate log lines in a `useState<string[]>([])` array
  - Parse `data: {"line":"..."}` events and append to the array
  - On `event: done`, set a `completed: boolean` state to true
  - On error, set `error: string | null` state
  - Return `{ lines: string[], loading: boolean, error: string | null, completed: boolean }`
  - **Cleanup**: Close the fetch connection / abort controller on unmount or when `enabled` changes to false
  - Check how the dashboard gets the admin API key — look at `dashboard/src/lib/gateway.ts` for the existing pattern

  **Step 2 — Create `dashboard/src/panels/tasks/ExecutionLogViewer.tsx`**:
  - Accept `taskId: string`, `tenantId: string` as props
  - Call `useExecutionLogs(taskId, tenantId, true)`
  - Render a terminal-style dark box:
    - `bg-zinc-900 text-zinc-100 rounded-lg p-4 font-mono text-xs overflow-auto max-h-96`
    - Each log line as a `<div>` with `whitespace-pre-wrap`
    - Auto-scroll to bottom when new lines arrive (use a `useEffect` with a ref on the scroll container)
    - Show a subtle "Streaming..." indicator when not `completed` (small pulsing dot)
    - Show "Log complete" when `completed` is true
  - If `loading` and no lines yet, show a centered spinner or "Loading logs..."
  - If `error`, show error message in a muted red text

  **Step 3 — Integrate into `TaskDetail.tsx`**:
  - Add `?logs=1` URL param toggle — follow the `?transcript` pattern exactly:
    - Read: `searchParams.has('logs')`
    - Write: `next.set('logs', '1')` / `next.delete('logs')`, always `{ replace: true }`
  - Add a "View Logs" / "Hide Logs" toggle button (same style as "View Transcript" button)
  - When `?logs=1`, render `<ExecutionLogViewer>` inside a card shell (`rounded-lg border bg-card px-5 py-4`)
  - Section title: "Execution Log"
  - Place between the copyable Docker command (Task 2) and the Deliverable section
  - Only show button when `execution` exists and not auto-pass

  **Must NOT do**:
  - Do not use `usePoll` — use `fetch` with `ReadableStream` or `EventSource`
  - Do not add new npm dependencies — use native browser APIs
  - Do not implement log search/filter

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend component with styling, auto-scroll, streaming state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (needs SSE endpoint to connect to)

  **References**:

  **Pattern References**:
  - `dashboard/src/hooks/use-execution-transcript.ts` — one-shot fetch hook pattern (similar structure)
  - `dashboard/src/panels/tasks/TaskDetail.tsx:520-585` — "View Transcript" toggle pattern (button, URL param, lazy render)
  - `dashboard/src/lib/gateway.ts` — how admin API key and base URL are accessed from the dashboard

  **API/Type References**:
  - SSE endpoint (Task 1): `GET /admin/tenants/:tenantId/tasks/:id/logs` — event format: `data: {"line":"..."}\n\n`

  **WHY Each Reference Matters**:
  - `use-execution-transcript.ts` shows the fetch pattern and how to get the gateway URL
  - TaskDetail transcript toggle is the exact UI pattern to replicate for `?logs=1`
  - `gateway.ts` shows how the admin API key is passed — critical for the fetch headers

  **Acceptance Criteria**:
  - [ ] `useExecutionLogs` hook connects to SSE endpoint and accumulates lines
  - [ ] Hook cleans up connection on unmount / disable
  - [ ] `ExecutionLogViewer` renders dark terminal-style box with log lines
  - [ ] Auto-scrolls to bottom when new lines arrive
  - [ ] Shows "Streaming..." indicator during active tasks
  - [ ] Shows "Log complete" for finished streams
  - [ ] "View Logs" button toggles `?logs=1` URL param
  - [ ] Direct navigation to `?logs=1` auto-loads the log viewer

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: View logs for a completed task
    Tool: Playwright
    Preconditions: Done task with log file, dev server at localhost:7701
    Steps:
      1. Navigate to `http://localhost:7701/dashboard/tasks/{task_id}?tenant=00000000-0000-0000-0000-000000000003`
      2. Wait for page load
      3. Assert "View Logs" button is visible
      4. Click "View Logs" button
      5. Assert URL now contains `?logs=1` (check `page.url()`)
      6. Wait for log viewer to appear (selector: element with `bg-zinc-900` or similar dark bg class)
      7. Assert log content area contains at least 1 non-empty line
      8. Screenshot the log viewer
    Expected Result: Dark terminal box with log lines visible
    Evidence: .sisyphus/evidence/task-3-log-viewer.png

  Scenario: Direct URL navigation with ?logs=1
    Tool: Playwright
    Preconditions: Done task with log file
    Steps:
      1. Navigate directly to `http://localhost:7701/dashboard/tasks/{task_id}?tenant=00000000-0000-0000-0000-000000000003&logs=1`
      2. Assert log viewer is visible WITHOUT clicking any button
      3. Assert content has log lines
    Expected Result: Log viewer auto-loads from URL param
    Evidence: .sisyphus/evidence/task-3-url-driven.png

  Scenario: Hide logs
    Tool: Playwright
    Preconditions: Log viewer is open (?logs=1)
    Steps:
      1. Navigate to task detail with `?logs=1`
      2. Assert log viewer is visible
      3. Click "Hide Logs" button
      4. Assert URL no longer contains `logs=`
      5. Assert log viewer is no longer in DOM
    Expected Result: Log viewer hidden, URL clean
    Evidence: .sisyphus/evidence/task-3-hide-logs.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add live execution log viewer with SSE streaming`
  - Files: `dashboard/src/hooks/use-execution-logs.ts`, `dashboard/src/panels/tasks/ExecutionLogViewer.tsx`, `dashboard/src/panels/tasks/TaskDetail.tsx`
  - Pre-commit: `pnpm build`

- [x] 4. Tests for SSE Endpoint

  **What to do**:

  Create `tests/gateway/routes/admin-tasks-logs.test.ts` with tests for the SSE endpoint.

  **Test cases**:
  1. **Returns 401 without auth** — GET without `X-Admin-Key` → 401
  2. **Returns 400 for invalid UUID** — GET with malformed task ID → 400
  3. **Returns 404 for non-existent task** — GET for UUID not in DB → 404
  4. **Returns 404 when log file doesn't exist** — GET for valid task but no `/tmp/` log file → 404 with `LOG_NOT_FOUND`
  5. **Streams log content for task with log file** — Create a temp log file at the expected path, GET the SSE endpoint, assert `Content-Type: text/event-stream`, assert response includes `data:` lines with log content
  6. **Sends done event for terminal task** — Task in `Done` status with log file → assert response includes `event: done`

  **Test patterns**:
  - Follow `tests/gateway/routes/admin-model-catalog.test.ts` for setup (mock Prisma, supertest, auth header)
  - Use `fs.writeFileSync` in `beforeEach` to create temp log files, `fs.unlinkSync` in `afterEach` to clean up
  - For SSE response parsing: read the full response body as text and split on `\n\n` to get events

  **Must NOT do**:
  - Do not test the dashboard component (frontend tests are covered by QA scenarios)
  - Do not test with real Docker containers — mock the filesystem

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward test file following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (tests need the endpoint to exist)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/__tests__/admin-model-catalog.test.ts` — test structure, mock setup, supertest patterns
  - `tests/gateway/routes/admin-tasks.test.ts` — if exists, the direct sibling test file pattern

  **Acceptance Criteria**:
  - [ ] Test file created at `tests/gateway/routes/admin-tasks-logs.test.ts`
  - [ ] All 6 test cases pass
  - [ ] `pnpm test -- --run tests/gateway/routes/admin-tasks-logs.test.ts` → 0 failures

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. `pnpm test -- --run tests/gateway/routes/admin-tasks-logs.test.ts 2>&1 | grep -E "(✓|✗|Tests|passed|failed)"`
      2. Assert 0 failures, 6+ tests passing
    Expected Result: All tests green
    Evidence: .sisyphus/evidence/task-4-tests.txt
  ```

  **Commit**: YES
  - Message: `test(api): add tests for SSE task log streaming endpoint`
  - Files: `tests/gateway/routes/admin-tasks-logs.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/routes/admin-tasks-logs.test.ts`

- [x] 5. Update AGENTS.md + README.md

  **What to do**:

  Update documentation to reflect the new endpoint.

  **AGENTS.md changes**:
  - In the **Admin API** section, add a new row to the endpoint table:
    `GET /admin/tenants/:tenantId/tasks/:id/logs` — stream task execution logs (SSE, local Docker mode only)
  - Add a note in the **OpenCode Worker** section mentioning that log files are at `/tmp/employee-{taskId.slice(0,8)}.log`

  **README.md changes**:
  - In the admin API endpoint table, add the same new row

  **Must NOT do**:
  - Do not add Fly.io log documentation
  - Do not change any other sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small doc updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Admin API section (existing endpoint table format)
  - `README.md` — admin API endpoint table

  **Acceptance Criteria**:
  - [ ] AGENTS.md Admin API table includes new `/logs` endpoint
  - [ ] README.md admin API table includes new `/logs` endpoint
  - [ ] No other sections modified

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Documentation includes new endpoint
    Tool: Bash (grep)
    Steps:
      1. `grep -c "tasks/:id/logs" AGENTS.md` — assert ≥ 1
      2. `grep -c "tasks/:id/logs" README.md` — assert ≥ 1
    Expected Result: Both files mention the new endpoint
    Evidence: .sisyphus/evidence/task-5-docs.txt
  ```

  **Commit**: YES
  - Message: `docs: add task logs SSE endpoint to AGENTS.md and README.md`
  - Files: `AGENTS.md`, `README.md`
  - Pre-commit: N/A

- [x] 6. Notify completion

  Send Telegram notification:

  ```bash
  npx tsx scripts/telegram-notify.ts "✅ task-log-viewer complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build && pnpm lint && pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check SSE endpoint has `requireAdminKey`. Check `req.on('close', cleanup)` exists. Check `res.writableEnded` guard exists.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Security [PASS/FAIL] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `dev-browser` skill)
      Trigger `real-estate-motivation-bot-2` via curl. Wait for Done. (1) curl the SSE endpoint — verify `text/event-stream` headers, data lines received, stream closes. (2) curl without auth — verify 401. (3) curl for non-existent task — verify 404. (4) Open dashboard task detail in Playwright, click "View Logs", verify log content appears, verify URL has `?logs=1`. (5) Verify copyable Docker command is present and contains correct task ID prefix.
      Output: `API [N/N pass] | Dashboard [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Specifically verify: server.ts was NOT modified, no delivery log support added, no usePoll for log streaming. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1**: `feat(api): add SSE endpoint for streaming task execution logs` — `src/gateway/routes/admin-tasks.ts`
- **Task 2**: `feat(dashboard): add copyable Docker command to task detail page` — `dashboard/src/panels/tasks/TaskDetail.tsx`
- **Task 3**: `feat(dashboard): add live execution log viewer with SSE streaming` — `dashboard/src/hooks/use-execution-logs.ts`, `dashboard/src/panels/tasks/ExecutionLogViewer.tsx`, `dashboard/src/panels/tasks/TaskDetail.tsx`
- **Task 4**: `test(api): add tests for SSE task log streaming endpoint` — `tests/gateway/routes/admin-tasks-logs.test.ts`
- **Task 5**: `docs: add task logs endpoint to AGENTS.md and README.md` — `AGENTS.md`, `README.md`

---

## Success Criteria

### Verification Commands

```bash
# SSE endpoint works
source .env
curl -N -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/<task_id>/logs" \
  -m 5 2>/dev/null | head -5
# Expected: data: lines with log content

# Auth required
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/<task_id>/logs"
# Expected: 401

# 404 for missing log
curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/00000000-0000-0000-0000-000000000000/logs"
# Expected: 404

# Tests pass
pnpm test -- --run
# Expected: all passing, 0 failures

# Build clean
pnpm build
# Expected: exit 0
```

### Final Checklist

- [ ] SSE endpoint streams log content with correct headers
- [ ] 401 without auth, 404 without log file
- [ ] Dashboard shows "View Logs" button on task detail page
- [ ] Log viewer displays terminal-style log content
- [ ] `?logs=1` URL param toggles log viewer
- [ ] Copyable Docker command shown for tasks with executions
- [ ] All tests pass
- [ ] AGENTS.md updated with new endpoint
