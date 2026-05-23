# Learnings — log-viewer-v2

## [2026-05-23] Plan Start — Inherited from V1 (task-log-viewer)

### Key Architecture Facts (carried from V1)

- Log files: `/tmp/employee-{taskId.slice(0,8)}.log` — pino structured JSON, every line is valid JSON
- SSE endpoint: `GET /admin/tenants/:tenantId/tasks/:id/logs` — already implemented in V1, DO NOT change
- Dashboard hook: `dashboard/src/hooks/use-execution-logs.ts` — uses fetch + ReadableStream (NOT EventSource)
- Admin API key: `getAdminApiKey()` from `dashboard/src/lib/gateway.ts` returns `localStorage.getItem('admin_api_key')`
- `GATEWAY_URL` from `dashboard/src/lib/constants.ts`
- Pre-existing build errors in `admin-model-catalog.ts`, `seed.ts`, `ModelCatalogPage.tsx` — IGNORE, not regressions

### Log Format Facts

- Every line: `{"level":30,"time":"2026-05-23T08:51:27.580Z","pid":1,"hostname":"...","component":"...","msg":"..."}`
- Only 3 log levels: 30=INFO, 40=WARN, 50=ERROR
- `component` field ALWAYS present — no fallback needed
- LLM error lines can be ~65,000 chars — MUST truncate at 500 chars display

### Noise Filter Criteria (PRECISE)

- SIGNAL (isSignal=true): component === 'opencode-harness' OR component === 'session-manager' OR component === 'postgrest-client' OR level >= 40 OR (component === 'opencode-server' AND msg matches /service=(llm|session\.prompt|session\.processor|bash-tool)/)
- NOISE (isSignal=false): component === 'opencode-server' with service=(bus|config|file|plugin|storage|lsp|format|file.watcher|project|db|permission|server)

### Dashboard Patterns

- All routes inside `<Route element={<Layout>}>` in App.tsx — sidebar always visible
- React Router v6: `useParams()`, `useSearchParams()`, `<Link to="...">`, `<Route path="..." element={<.../>} />`
- TaskDetail.tsx uses `execution && !isAutoPass` guard for container-specific sections
- `showLogs` state at line 226: `searchParams.has('logs')` — will be REMOVED in T3
- Inline log viewer block at lines 484-519 — will be REPLACED with a Link in T3
- shadcn/ui components available: Input, Button, etc. from `@/components/ui/`
- Pages pattern: see `dashboard/src/pages/ModelCatalogPage.tsx` for full-page component
- Card shell: `rounded-lg border bg-card px-5 py-4` — mandatory for sections

### Test Baseline

- `pnpm test -- --run` → 1690 passing, 27 skipped (pre-existing), 0 failures expected
- Test DB: `ai_employee_test`

## [2026-05-23] Task 1: Log Parser Complete

- Created `dashboard/src/lib/log-parser.ts` — pure TS, no deps, no React
- `parseLine()`: JSON.parse → fallback on error returns `{ isSignal: true }` with raw as message
- Timestamp format: `HH:MM:SS.mmm` using UTC methods + padStart (h/m/s → 2 chars, ms → 3 chars)
- Level mapping: pino numeric (30=info, 40=warn, 50=error), default info
- Component shortening via lookup map; `isSignal` check uses **original** component before shortening
- `isSignal` true for: opencode-harness, session-manager, postgrest-client, level>=40, or opencode-server with service=(llm|session.prompt|session.processor|bash-tool) in msg
- `truncateMessage()` returns `{ text, truncated }` — clean API for UI display
- `pnpm build` exits 0 — pre-existing errors in admin-model-catalog.ts, seed.ts, ModelCatalogPage.tsx are unrelated and were ignored per task instructions

## [2026-05-23] Task 3: TaskDetail inline viewer replaced

- Removed: `import { ExecutionLogViewer } from './ExecutionLogViewer'`
- Removed: `const showLogs = searchParams.has('logs')` (line 226)
- Removed: entire "Execution Log" card block (was lines 484-519) — toggle buttons + inline `<ExecutionLogViewer>`
- Added: `Link` to react-router-dom imports; `Terminal` to lucide-react imports
- Added: `<Link to="/dashboard/tasks/${taskId}/logs?tenant=${tenantId}">` with Terminal icon inside Container Commands card
- Container Commands content (docker/tail commands) unchanged
- `?transcript=1` logic untouched
- `pnpm build` exits 0 — commit: `refactor(dashboard): replace inline log viewer with link to full-page route`

## [2026-05-23] Task 2: useExecutionLogs refactored

- [entries: ParsedLogEntry[], rawLines: string[] returned, SSE logic unchanged, build passes]

## [2026-05-23] Task 4: TaskLogsPage created

- Layout: `h-[calc(100vh-56px)]` flex col — header + toolbar are `shrink-0`, log area is `flex-1 overflow-y-auto`, stats bar is `shrink-0`
- `useTenant()` always returns a string `tenantId` (never null) — no nullish coalescing needed but harmless
- Route added to App.tsx: `/dashboard/tasks/:taskId/logs` → `<TaskLogsPage />`
- Auto-scroll: detects scroll-up via `scrollHeight - scrollTop - clientHeight < 40` threshold
- `handleCopy` uses `void` to silence unhandled promise in onClick
- LSP unavailable for dashboard subdir (`asdf` nodejs not set) — build used instead
- `pnpm build` exits 0 — pre-existing errors in admin-model-catalog.ts, seed.ts, ModelCatalogPage.tsx, ExecutionLogViewer.tsx ignored per instructions
- Commit: c993561 `feat(dashboard): add full-page log viewer with filtering, search, and color coding`

## [2026-05-23] Task 6: Log parser tests created

- File: `dashboard/src/lib/__tests__/log-parser.test.ts`
- 10 tests, all passing (verified via `cd dashboard && pnpm test -- --run`)
- Dashboard tests run separately from root — root vitest config (`src/**/__tests__/`) does NOT include `dashboard/src/`
- Dashboard has its own vitest config at `dashboard/vite.config.ts` with `environment: 'jsdom'`
- Root `pnpm test -- --run` still passes: 1690 tests, 27 skipped, 0 failures (no regressions)
- Gotcha: passing a file path to root `pnpm test` doesn't filter to that file — root vitest ignores dashboard paths
- Commit: 43da198 `test(dashboard): add unit tests for log parser`

## [2026-05-23] Task 7: ExecutionLogViewer deleted

- File deleted: `dashboard/src/panels/tasks/ExecutionLogViewer.tsx`
- No remaining references found (only the file itself had the symbol)
- `pnpm build` exits 0 (backend tsc only — no dashboard TS errors)
- Committed: `chore(dashboard): delete old ExecutionLogViewer component` (14ff2e8)

## [2026-05-23] Task 8: AGENTS.md updated

- Added task logs route note after the "For any UI inspection..." paragraph in the Dashboard URLs section (line ~238)
- Text added: `**Task execution logs**: /dashboard/tasks/:taskId/logs?tenant=:tenantId — full-page formatted log viewer (noise-filtered, searchable, color-coded). Only available when a log file exists at /tmp/employee-{taskId.slice(0,8)}.log (local Docker mode).`
- `grep -c "tasks/:taskId/logs" AGENTS.md` → 1 ✓
- Committed: 99663e4 `docs: document task logs full-page route in AGENTS.md`
