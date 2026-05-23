# Learnings — task-log-viewer

## [2026-05-23] Plan Start

### Key Architecture Facts

- Log files: `/tmp/employee-{taskId.slice(0,8)}.log` — created by lifecycle via `docker logs -f ${containerId}`
- Container name pattern: `employee-{taskId.slice(0,8)}` — deterministic from task ID
- No SSE patterns exist in gateway — greenfield implementation
- `EventSource` API does NOT support custom headers → use `fetch` + `ReadableStream` in dashboard hook
- `requireAdminKey` is per-route (NOT global) — must explicitly add to SSE route
- CORS already handled globally at server.ts:74 — no action needed

### Gateway Pattern (admin-tasks.ts)

- Routes defined inside `adminTasksRoutes()` factory that returns a Router
- Factory pattern: add new route inside the existing factory BEFORE `return router`
- Param validation: `GetTaskParamsSchema.safeParse(req.params)` — uses loose UUID_REGEX (NOT z.string().uuid())
- Error shapes: `{ error: 'ERROR_CODE', message: 'human message' }`

### Dashboard Pattern (TaskDetail.tsx)

- `?transcript=1` URL param toggle pattern: `searchParams.has('transcript')` / `next.set/delete('transcript')` with `{ replace: true }`
- Reuse `?logs=1` with same pattern
- `execution` + `isAutoPass` already computed in component scope — use for guards
- Execution Metrics section ends around line 429 — insert Docker command after that
- "View Transcript" button at lines 530-544 — reuse `variant="outline" size="sm"` style

### SSE Implementation Rules

- Check `existsSync(logPath)` BEFORE setting SSE headers — cannot send 404 after headers flush
- SSE headers: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive, X-Accel-Buffering: no
- Guard every `res.write()` with `if (!res.writableEnded)` check
- Register `req.on('close', cleanup)` ALWAYS — prevents connection leaks
- Terminal task: read full file → send all lines → send `event: done` → close
- Active task: read existing content → poll file every 1s for new lines

### Dashboard Hook (use-execution-logs.ts)

- Use `fetch` with `ReadableStream` — NOT `EventSource` (no header support)
- Admin API key from `dashboard/src/lib/gateway.ts` — check that file for the pattern
- Use AbortController for cleanup on unmount
- State: `{ lines: string[], loading: boolean, error: string | null, completed: boolean }`

## [2026-05-23] Task 1: SSE Endpoint Complete

- Route pattern used: added inside `adminTasksRoutes()` factory before `return router`, same pattern as existing GET /tasks/:id route
- Terminal task handling: readline createInterface over createReadStream, sends all lines then `event: done`, calls cleanup()
- Active task polling: reads initial content via readNewLines(), then watchFile() at 1000ms interval tracking lastPos; handles zero-byte initial file too
- Cleanup pattern: `cleaned` flag prevents double-execution; unwatchFile always called; req.on('close') registered unconditionally
- CRITICAL gotcha: existsSync check MUST happen BEFORE res.setHeader/flushHeaders — confirmed via Scenario 2
- Build: `pnpm build` exits 0 with no new errors (pre-existing errors in admin-model-catalog.ts/seed.ts/ModelCatalogPage.tsx are unrelated)
- tsx watch auto-reloaded gateway — no manual restart needed for QA scenarios
- Evidence saved to .sisyphus/evidence/ (gitignored — local only)

## [2026-05-23] Task 3: Log Viewer Complete

- Hook: uses fetch + ReadableStream, AbortController cleanup
- Component: dark terminal box (bg-zinc-900), auto-scroll via bottomRef
- Integration: ?logs=1 toggle, shows between Container Commands and Deliverable
- processChunk pattern: recursive async, splits on \n\n
- QA via NODE_PATH=/Users/victordozal/.asdf/installs/nodejs/20.19.0/lib/node_modules node script.js
- All scenarios pass: View Logs button, URL param toggle, terminal renders log lines, Hide Logs removes param

## [2026-05-23] Task 4: Tests Complete

- Supertest SSE: use .buffer(true) + .parse() for streaming response; body goes to res.body (string)
- Log file path: /tmp/employee-{TASK_ID.slice(0,8)}.log
- afterEach cleanup: existsSync + unlinkSync
- collectSse() helper wraps buffer+parse pattern for reuse across tests
- Only test terminal tasks (Done/Failed/Cancelled) in SSE tests — active tasks use watchFile which keeps connection open
- 7 tests, all pass; full suite 1690/27 no regressions

## [2026-05-23] Task 2: Copyable Command Complete

- Insertion point: after Execution Metrics closing div (line 467 in final file), before showDeliverable block
- CommandRow helper: added before TaskDetail function (line 186) alongside other helpers (Skeleton, RawEventViewer, etc.)
- Guard: {execution && !isAutoPass} — hides section for auto-pass tasks (no container launched)
- Imports added: Copy, Check from lucide-react (joined existing ArrowLeft, AlertTriangle, etc.)
- toast.success and useState already imported — no new deps needed
- pnpm build exit 0 confirmed TypeScript clean
- Commit: a516058 feat(dashboard): add copyable Docker command to task detail page
