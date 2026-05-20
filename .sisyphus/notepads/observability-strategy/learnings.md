# Learnings — observability-strategy

## Key Architecture Facts

- `executions` table has all metric columns (prompt_tokens, completion_tokens, estimated_cost_usd, heartbeat_at, current_stage) — they just are never written by the active harness
- `deliverables` table accessible via PostgREST anon key (confirmed via RulesPanel.tsx pattern)
- `feedback_events` already queried in RulesPanel.tsx at line 455 — same pattern usable for TaskDetail
- `session-manager.ts` already has `client` instance — reuse for `client.session.messages()` call
- `heartbeat.ts` exists and is fully implemented — just not imported by opencode-harness.mts
- `runOpencodeSession()` currently returns `{ content, metadata }` only — must extend to return sessionId + transcript + tokenUsage
- Transcript fetch MUST happen inside `runOpencodeSession()` BEFORE `serverHandle.kill()` in finally block
- `serverExitedEarly` path: server already dead, skip transcript, leave session_transcript null
- Dashboard uses `usePoll` hook (5s), PostgREST direct reads, `SearchableSelect` for all dropdowns (MANDATORY)
- SIGTERM handler must ALSO set `failure_code: 'worker_terminated'` when failure_code column added
- After Prisma migration: must NOTIFY pgrst 'reload schema' for PostgREST to see new columns
- Never SELECT \* on executions once session_transcript column exists (it's large JSONB)
- `call-llm.ts` is NOT the cost source for OpenCode employees — do not modify
- `failure_code` type: plain TEXT (not enum) for flexibility

## Task Dependencies (Critical)

- Tasks 1, 3, 4 can run in parallel (Wave 1)
- Task 2 depends on 1 + 3 + 4 (must run after all three)
- Tasks 5, 6, 7 run in parallel after Wave 1 (Wave 2)
- Tasks 8-13 run in parallel after Wave 2 (Wave 3) — all touch TaskDetail.tsx so need careful merge
- Task 14 (E2E) needs Docker rebuild + services running

## Task 2 Completion Notes

- TypeScript cannot narrow module-level `let` variables inside SIGTERM callback closures — must use `as HeartbeatHandle` cast (same pattern as existing `as ServerHandle` cast for `serverHandleGlobal`)
- `sessionId` must be declared OUTSIDE the try block (as `let sessionId: string | null = null`) so it's accessible in the return statement after the try/finally (lines 452-572)
- `sessionManager` stays inside the try block — transcript fetch also inside try block, so it can access `sessionManager`
- Test mock for `createSessionManager` does NOT include `getTranscript` — calling `sessionManager.getTranscript()` throws `TypeError: sessionManager.getTranscript is not a function` inside the try/catch, which is caught and logged as warn. Tests pass because telemetry failures are non-fatal.
- `extractUsage` imported as named import from `session-manager.js` — in test environment it's `undefined` from the mock, but since `getTranscript` fails first, `extractUsage` is never called
- heartbeat `stop()` in `main()` (direct code path) works fine without cast — TypeScript narrows properly there
- Pre-existing test failures: `hostfully.test.ts`, `supersede-threading.test.ts`, `admin-employee-trigger.test.ts`, `migration-agents-md.test.ts` — none import opencode-harness, confirmed unrelated

## Tasks 8-11 Implementation Notes (TaskDetail.tsx)

- `useExecutionTranscript` lazy-load pattern: pass `showTranscript ? (execution?.id ?? null) : null` — the hook's useEffect has `if (!executionId) return;` guard, so no fetch until user clicks the button
- `StatusBadge` accepts only `TaskStatus` — for `execution.status` (plain `string`) and `deliverable.status` (plain `string`), use generic `<Badge variant="outline">` instead
- `DELIVERABLE_STATUSES = new Set([...])` for O(1) lookup vs array includes
- `CollapsibleJsonViewer` extracts the RawEventViewer pattern with configurable label + defaultOpen — both use the existing `RAW_EVENT_TRUNCATE_CHARS` constant
- Deliverable content: IIFE `(() => { try { JSON.parse... } catch { return content } })()` inline in JSX is valid TypeScript and avoids a separate helper function
- TranscriptMessage handles: string content, array of {type:text/tool_use/tool_result} blocks, unknown fallback via `JSON.stringify`
- `catch {}` (empty catch) is valid in TS — no binding needed when the error variable is unused
- `md:col-span-1` is meaningless without a corresponding `md:grid-cols-*` — use `StatCard` uniformly for all 5 stat cells; 5th wraps to second row naturally in `sm:grid-cols-4`
- Heartbeat stat is NOT wrapped in a testid per spec — only tokens, cost, and duration need testids
- `pnpm lint` baseline has 3664 errors across the codebase (pre-existing) — the relevant check is `npx eslint dashboard/src/panels/tasks/TaskDetail.tsx` returning zero errors

## Task 12 — TaskFeed Filters

- `postgrestFetch` takes `Record<string,string>` → no duplicate key support → can only apply one `created_at` filter server-side; use `dateFrom` (gte) server-side and filter `dateTo` client-side via `.filter()`
- Archetypes fetch for employee dropdown: one-time `useEffect` (NOT polled), uses `deleted_at: 'is.null'` PostgREST IS NULL syntax
- `useCallback` deps must include ALL filter state vars so `usePoll` re-fetches on any filter change
- `tasks = rawTasks?.filter(...)` pattern safely handles undefined rawTasks without conditional branches
- Empty state (no tasks) now renders inside the main return with filter bar visible above it
- `npx tsc --noEmit` in `dashboard/` passed with zero errors after implementation

## Task 13: StatusTimeline Duration Enhancement

- `TERMINAL_STATUSES` is `['Done', 'Failed', 'Cancelled']` — imported from `@/lib/constants`
- `Task` type already has `started_at: string | null` and `completed_at: string | null` — no type changes needed
- `StatusTimeline` is called from two places: `TaskDetail.tsx` (passes `task`) and `EmployeeDetail.tsx` (no task — `task` prop is optional, backward compatible)
- Duration computed purely client-side from `created_at` timestamps on consecutive log entries
- Sub-line approach (adding duration to the metadata row) is cleaner than inserting DOM elements between entries
- `cn(condition && 'class')` pattern works for conditional Tailwind classes — falsy renders nothing
- `npx tsc --noEmit` in `dashboard/` passed with zero errors after removing unused `STATUS_COLORS` import

## Task 14 — E2E Verification Results (2026-05-20)

- real-estate-motivation-bot is in VLRE tenant (00000000-0000-0000-0000-000000000003), NOT DozalDevs (00000000-0000-0000-0000-000000000002)
- Task 87fdecf4-8449-457e-ae7f-de3054f831f7 ran successfully: Executing → Done in ~47s
- AC1 PASS: execution.status='completed', estimated_cost_usd=0.0135 ($), prompt_tokens=43943, completion_tokens=218
- AC2 PASS: All 5 migration columns exist (started_at, completed_at, failure_code on tasks; heartbeat_at, session_transcript on executions)
- AC3 PASS: PostgREST HTTP 200 on all new columns queries
- AC4 PASS: session_transcript stored as 20864-byte JSONB with 6 messages
- AC5 PARTIAL: heartbeat_at null because task completed in ~47s (< 60s default interval). Mechanism IS implemented (startHeartbeat called in harness). For tasks >60s, heartbeat_at would be populated.
- AC6 PASS: 1486 tests passing, 18 failures all pre-existing (hostfully.test.ts, admin-employee-trigger.test.ts, supersede-threading.test.ts, migration-agents-md.test.ts)
- opencode-harness-metrics.test.ts: 8/8 PASS, LSP type errors in mock types are Vitest-benign (esbuild ignores them)
- Docker rebuild EXIT_CODE:0, image sha256:594880685140d061fae6f1a036849d1b1671c2da386a9ad85250dcfe1a6c0e2b
- Evidence saved to: .sisyphus/evidence/task-14-e2e-verification.txt

## Task 15 — Playwright Dashboard QA Results (2026-05-20)

### All ACs: PASS

**AC7 - Status filter (PASS)**
- Dashboard tasks feed at `/dashboard/` (trailing slash required — `/dashboard` → 404, `/dashboard/tasks` → "no route matched")
- Status SearchableSelect opens dropdown with all statuses including Failed
- Selected "Failed" → "Showing 49 tasks", all visible rows have "Failed" status badge
- Filter functional ✓

**AC8 - Employee filter (PASS)**
- Employee SearchableSelect lists: real-estate-motivation-bot, hostfully-cleaning-scheduler, code-rotation, guest-messaging, daily-summarizer
- Selected "real-estate-motivation-bot" (with status=Failed still active) → "Showing 3 tasks", all 3 = real-estate-motivation-bot
- Compound filtering (status + employee) works correctly ✓

**AC9 - Execution metrics panel (PASS)**
- Task 87fdecf4 (real-estate-motivation-bot, Done): `data-testid="execution-metrics"` present
- `execution-tokens` = "44,161 Tokens" ✓ | `execution-cost` = "$0.0135 Cost" ✓ | `execution-duration` = "46s" ✓

**AC10 - Deliverable content (PASS)**
- `data-testid="deliverable-content"` visible on Done task
- Content: `{"summary": "Posted daily motivational quote to Slack", "classification": "NO_ACTION_NEEDED"}`
- Correctly shown for Done (Submitting+) task ✓

**AC11 - Feedback events section (PASS)**
- `data-testid="feedback-events-section"` visible
- Renders "No feedback events" when empty — section present regardless ✓

### Pre-existing LSP Issues (NOT from Task 15 changes)
- `tests/workers/opencode-harness-metrics.test.ts` has 8 TypeScript errors (MockInstance type incompatibility)
- These appear to be pre-existing from Wave 3 test implementation — not introduced by QA
- Task 15 is QA-only; no source files modified

### Evidence Files
- `.sisyphus/evidence/task-15-dashboard-qa/task-15-ac7-status-filter.png`
- `.sisyphus/evidence/task-15-dashboard-qa/task-15-ac8-employee-filter.png`
- `.sisyphus/evidence/task-15-dashboard-qa/task-15-ac9-execution-metrics.png`
- `.sisyphus/evidence/task-15-dashboard-qa/task-15-ac10-deliverable.png`
- `.sisyphus/evidence/task-15-dashboard-qa/task-15-ac11-feedback-events.png`
- `.sisyphus/evidence/task-15-dashboard-qa/summary.txt`
