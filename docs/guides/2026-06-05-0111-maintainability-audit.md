# Maintainability Audit — AI Employee Platform

> **Status**: IN PROGRESS (live document — updated as findings are discovered)
> **Date**: 2026-06-05
> **Scope**: Comprehensive — all 8 dimensions across `src/`, `dashboard/`, `scripts/`, `worker-tools/`
> **Purpose**: Identify maintainability opportunities before onboarding coworkers & before the codebase becomes hard to refactor.

## How to Read This Document

Findings are tagged with severity and effort:

- **Severity**: 🔴 High (active maintainability risk / blocks onboarding) · 🟡 Medium (friction, should fix) · 🟢 Low (polish/nitpick)
- **Effort**: ⏱️ S (<2h) · ⏱️ M (half-day) · ⏱️ L (multi-day)
- Each finding has a stable ID like `[ARCH-1]` for cross-referencing in the remediation plan.

---

## Codebase Snapshot (Quantitative Baseline)

| Metric | Value | Notes |
|---|---|---|
| Real source files (`src/`) | 234 `.ts`/`.mts` (excl. node_modules/dist) | |
| Real source lines (`src/`) | ~42,300 | |
| Dashboard files | 83 `.ts`/`.tsx` | |
| Test files (total) | ~165 (in `tests/` + co-located `__tests__/`) | Coverage is **healthier** than it first appears |
| `as any` (non-test) | 10 | Mostly legit Slack Bolt `ack` workaround |
| `@ts-ignore` / `@ts-expect-error` | 0 | Excellent |
| `: any` annotations (non-test) | 17 | |
| `eslint-disable` (real source) | 23 | Low — not a concern |
| `TODO`/`FIXME`/`HACK`/`XXX` | 2 | Very low |
| `console.log` in `src/` (non-test) | 20 | Should use `pino` logger |

**Per-directory size:**

| Directory | Files | Lines |
|---|---|---|
| `src/gateway` | 58 | 10,549 |
| `src/worker-tools` | 61 | 9,637 |
| `src/workers` | 41 | 7,033 |
| `src/inngest` | 16 | 6,470 |
| `src/lib` | 32 | 3,466 |

**Headline takeaway**: Type safety and test coverage are in good shape. The dominant maintainability risks are (1) **a handful of giant files**, (2) **a large deprecated-code footprint (~6,300 lines)** still in the tree, and (3) architectural concerns to be confirmed by deep-dive.

---

## Largest Files (Decomposition Candidates)

| File | Lines | Status |
|---|---|---|
| `src/inngest/employee-lifecycle.ts` | 3,082 | ACTIVE — top priority |
| `src/gateway/slack/handlers.ts` | 1,869 | ACTIVE — top priority |
| `src/workers/opencode-harness.mts` | 1,162 | ACTIVE — top priority |
| `src/workers/orchestrate.mts` | 1,126 | DEPRECATED |
| `dashboard/src/pages/ModelCatalogPage.tsx` | 921 | ACTIVE |
| `dashboard/src/panels/tasks/TaskDetail.tsx` | 870 | ACTIVE |
| `scripts/dev.ts` | 858 | ACTIVE (dev tooling) |
| `dashboard/src/panels/rules/RulesPanel.tsx` | 852 | ACTIVE |
| `src/lib/slack-blocks.ts` | 725 | ACTIVE |
| `scripts/trigger-task.ts` | 704 | ACTIVE (dev tooling) |
| `src/gateway/services/archetype-generator.ts` | 697 | ACTIVE |
| `dashboard/src/panels/employees/EmployeeDetail.tsx` | 648 | ACTIVE |

---

# FINDINGS BY DIMENSION

## 1. Architecture & Module Boundaries

### [ARCH-1] 🔴 Dual data-access pattern: raw PostgREST `fetch` vs Prisma in the same process — ⏱️ L
`src/gateway/slack/handlers.ts` defines its OWN PostgREST client (raw `fetch`, untyped responses cast as `Array<{...}>`) and uses it in 10+ places, while the rest of the gateway uses Prisma. The `trigger_confirm` handler creates tasks via PostgREST `fetch` (handlers.ts:1647–1678) while `employee-dispatcher.ts` creates the SAME tasks via Prisma — two code paths that can silently diverge. The inngest lifecycle ALSO does raw PostgREST (it has to, for Inngest step isolation), and the worker harness has its own `postgrest-client.ts`. **No shared, typed data-access layer.** This is the single biggest architectural risk for onboarding. **Fix**: inject `prisma` into `registerSlackHandlers`; replace fetch calls. Longer-term: a shared typed PostgREST helper for the contexts that genuinely need it (inngest steps, worker).

### [ARCH-2] 🔴 Three independent task-creation paths with no shared abstraction — ⏱️ M
(1) `employee-dispatcher.ts` (Prisma), (2) `gateway/services/task-creation.ts` (Jira-specific, misleadingly generic name), (3) `slack/handlers.ts` trigger_confirm (raw PostgREST, ~200 inlined lines). A new coworker adding a trigger source won't know which to use or copy. **Fix**: consolidate into `dispatchEmployee()` as the single entry; have Slack/Jira paths call it. Rename `task-creation.ts` → `jira-task-creation.ts`.

### [ARCH-3] 🔴 `TERMINAL_STATUSES` defined 4 times with DIFFERENT members — latent bug — ⏱️ S
- `handlers.ts:57` → `{Done, Cancelled, Failed, Delivering}`
- `handlers.ts:155` → `[Done, Failed, Cancelled]` (no Delivering)
- `admin-tasks.ts:123` → `{Done, Failed, Cancelled, Stale}`
- `task-creation.ts:115` → `{Done, Cancelled}` (no Failed!)

The same status is "terminal" in one context and not in another — a real correctness hazard. **Fix**: single exported `TERMINAL_STATUSES: Set<string>` in `src/lib/task-status.ts`; import everywhere.

### [ARCH-4] 🟡 `loadTenantEnv` + `new PrismaClient()` boilerplate repeated 19× in employee-lifecycle.ts — ⏱️ M
18 distinct variable names (`prismaForNotify`, `prismaForFail`, …) for the identical 5-line "load Slack token for this tenant" operation. **Fix**: extract `loadTenantSlackToken(tenantId, channel)` → reduces ~90 lines to 18 one-liners. (Forced by Inngest step isolation, but still extractable to a shared helper.)

### [ARCH-5] 🟡 30 route files each instantiate their own `pino` logger — ⏱️ S
Every route does `const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })` at module scope — 30 independent instances, each reading `LOG_LEVEL` at import time. A shared `createLogger(name)` factory already exists in `src/lib/logger.ts` and is used by `handlers.ts`. **Fix**: mechanical replace across 30 files.

### [ARCH-6] 🟡 Inconsistent error-response shapes; no shared `sendError` helper — ⏱️ S
Three coexisting shapes: `{error}`, `{error, message}`, `{error, issues}`. Callers must guess. **Fix**: `sendError(res, status, code, message?, extra?)` in `src/gateway/lib/http-response.ts`, adopt across routes.

### [ARCH-9] 🔴 Missing DB indexes on hot-path FK columns — ⏱️ S
`prisma/schema.prisma` — no explicit `@@index` on FK columns hit on every lifecycle step / admin query: `tasks.archetype_id`, `tasks.tenant_id`, `executions.task_id`, `task_status_log.task_id`, `deliverables.execution_id`, `validation_runs.execution_id`. Postgres does NOT auto-index plain FKs (only `@id`/`@@unique`). These are full-table scans at scale. **Fix**: add `@@index` for each (one migration).

### [ARCH-10] 🔴 Soft-delete rule violated — 6 active tables lack `deleted_at` — ⏱️ M
AGENTS.md: "No record may be permanently deleted." But `Task`, `Execution`, `PendingApproval`, `EmployeeRule`, `FeedbackEvent`, `TaskMetric` (all active-path) have no `deleted_at` column. Only 5 of 27 models have it. **Fix**: add `deleted_at DateTime?` migration for the 6 active tables first.

### [ARCH-11] 🔴 No central config module — 289 scattered `process.env` reads — ⏱️ M
Codebase-wide there are **289** direct `process.env.X` accesses across 20+ files (top: `employee-lifecycle.ts` 29, `opencode-harness.mts` 20, `server.ts` 15). No typed config layer, no boot-time validation of required vars (missing `SUPABASE_URL` → runtime `TypeError` deep in a handler, not a startup error). `platform_settings` covers DB-backed settings but not env. **Fix**: `src/lib/config.ts` with `requireEnv()` typed exports + startup validation. This is the single highest-leverage refactor for testability and onboarding.

### [ARCH-12] 🟡 No shared HTTP-client base — 429/retry logic duplicated across 4 lib clients — ⏱️ M
`slack-client.ts`, `github-client.ts`, `jira-client.ts`, `telegram-client.ts` each reinvent fetch + `RateLimitExceededError` + `withRetry`. `fly-client.ts` already has the right pattern (`makeRequestWithRetry<T>`). Slack's `Retry-After` parsing block is copy-pasted between `postMessage`/`updateMessage`. **Fix**: `createHttpClient(baseUrl, headers)` factory in `src/lib/http-client.ts`; thin per-service wrappers. The worker-tools subsystem has a PARALLEL version of this problem (Hostfully client setup duplicated in 8 tools — see TOOLS-1).

### [ARCH-13] 🟡 `slack-blocks.ts` (725) is a grab-bag coupled to Hostfully — ⏱️ M
Mixes generic lifecycle blocks (all employees) with guest-messaging-specific blocks, and imports `buildHostfullyLink` + hardcodes "🔗 View in Hostfully" in 5 places — a shared file carrying a Hostfully dependency for every employee. **Fix**: split into `slack-blocks-lifecycle.ts` + `slack-blocks-guest-messaging.ts`; replace hardcoded link with generic `contextUrl`/`contextLabel` params.

### [ARCH-14] 🟡 Deprecated engineering models pollute the active Prisma schema — ⏱️ M
~8 models (`ValidationRun`, `CrossDeptTrigger`, `AgentVersion`, `Clarification`, `Review`, `AuditLog`, `RiskModel`, `Department`) belong only to the deprecated engineering lifecycle (~200 schema lines no active path writes). `AgentVersion` still has live FKs so needs a migration to drop. **Fix**: mark with `// DEPRECATED` block now; plan a cleanup migration.

### [ARCH-15] 🟡 `worker-tools/` package boundary crossed by a `.js` file — ⏱️ S
`notion/update-block.ts` and `append-blocks.ts` import `../../lib/notion-types.js` which resolves OUTSIDE the worker-tools package (into `src/lib/`), and it's a plain `.js` (no types). Tools shouldn't import from the gateway/inngest layer. **Fix**: move `NOTION_API_VERSION` into `worker-tools/notion/lib/constants.ts` (TS).

### [ARCH-8] 🟡 Employee-specific language leaking into shared files (AGENTS.md violation) — ⏱️ M
The codebase's own rule ("never use 'guest'/'summary'/'Hostfully' in shared files") is violated in several shared files. Confirmed instances:
- `slack/handlers.ts` — "guest" appears ~25× (`GUEST_APPROVE/EDIT/REJECT`, `GUEST_BUTTON_BLOCKS`, log strings). The GUEST_* approval handlers are functionally identical to the generic APPROVE/REJECT — they should be unified.
- `inngest/employee-lifecycle.ts` — `guest_name` metadata key, `SUMMARY_TARGET_CHANNEL` env fallback, a comment naming guest-messaging (lines 1893, 1942, 1988, 2105, 2124).
- `inngest/lib/reminder-blocks.ts:3,29` — `guestName`/`propertyName` fields.
- `workers/lib/approval-card-poster.mts:93` + `lib/slack-action-ids.ts` — `GUEST_EDIT` action ID.
- `gateway/services/tenant-env-loader.ts:63–75` — `summary` config key.
- `gateway/services/archetype-generator.ts` — `hostfully_message` hardcoded in the LLM prompt's deliverable_type list.
**Fix**: rename to generic terms (`recipient_name`, `EDIT_AND_SEND`, `notification`); unify GUEST_* handlers with generic ones.

<!-- ARCH findings appended here -->

## 2. Large-File Decomposition

### [SIZE-1] 🔴 `employee-lifecycle.ts` is a 3,082-line single file — ⏱️ L
The universal lifecycle is the heart of the platform and the file every employee depends on. At 3,082 lines it is the single largest active file and the hardest to onboard onto, review, or modify safely. AGENTS.md explicitly calls out many distinct step concerns (notify-received, handle-approval-result, mark-failed, delivery dispatch, supersede, etc.) — strong candidate for extraction into per-concern step modules.
- _Detail TBD by inngest deep-dive._

### [SIZE-2] 🔴 `slack/handlers.ts` is 1,869 lines — ⏱️ L
Contains 7 of the 23 real-source `eslint-disable` directives and 7 of the 10 `as any` casts (all `(ack as any)`). Handles many distinct Slack interaction types in one file.
- _Detail TBD by gateway deep-dive._

### [SIZE-3] 🔴 `opencode-harness.mts` is 1,162 lines — ⏱️ L
Core worker entrypoint for ALL employees. `main()` (455 lines) and `runOpencodeSession()` (344 lines) together are 69% of the file. **Concrete decomposition** (from workers deep-dive):
- **CRITICAL bug-magnet**: `checkOutputFiles` (~70 lines) is **copy-pasted verbatim TWICE** (lines 442–511 and 625–698). A fix in one won't propagate. Extract to one module-scope function FIRST.
- Split `main()` → `runDeliveryPhase()` + `runExecutionPhase()` (gated by `isDeliveryPhase`, ~200 lines each, independent).
- Split `runOpencodeSession()` → `resolveModelProvider()`, server/session mgmt, `readOutputContract()`.
- Extract `updateSlackNotificationToFailed()` from `markFailed()` (only place in active code using raw Slack fetch instead of `WebClient`).
- Dead code: `opencodeRunPid` (declared, never assigned — unreachable SIGTERM branch); `escalate()` in heartbeat.ts (57 lines, never called); `sendFixPrompt()` in session-manager.ts (never called) — all leftovers from the deprecated orchestrator.

### [SIZE-4] 🔴 `employee-lifecycle.ts` decomposition — concrete module layout (from inngest deep-dive)
The worst offender is the `handle-approval-result` step: a **978-line `step.run` callback** (lines 2069–3047) with approve/reject/supersede/expiry branches inline. Other oversized steps: `executing` (252), `run-delivery-no-approval` (219), `check-supersede` (174), `track-pending-approval` (144), `notify-received` (141). Proposed layout:
```
src/inngest/
├── employee-lifecycle.ts        # thin orchestrator (~200 lines)
└── lifecycle/
    ├── db-helpers.ts            # patchTask, logStatusTransition, recordWorkMetric (called 48×)
    ├── tenant-env.ts            # loadTenantSlackToken (kills the 19× boilerplate — ARCH-4)
    ├── machine-runner.ts        # run/stop Docker, destroyWorkerMachine (6× dup), env-manifest merge (2× dup)
    └── steps/ {notify, execute, delivery, approval, supersede, classification, override}.ts
```
Key duplications to collapse: delivery retry loop copy-pasted verbatim (lines 1098–1245 ≈ 2453–2598); machine-cleanup block repeated 6×; PLATFORM_ENV_MANIFEST merge 2×.
**Migration discipline** (per agent): extract `db-helpers` + `tenant-env` first (zero behavior change), one extraction per PR with before/after line counts + an E2E trigger (`real-estate-motivation-bot-2` for no-approval path).

### [SIZE-5] 🔴 `slack/handlers.ts` decomposition — 7 responsibilities, clear seams (from gateway deep-dive)
Split `registerSlackHandlers` into: `slack/handlers/{approval,rule,trigger,event}-handlers.ts` + `slack/supabase-client.ts` (4 fetch helpers) + `slack/block-kit.ts` + `slack/pending-state.ts`. Start with `rule-handlers.ts` (lines 1138–1499, zero deps on approval state). Also: `new PrismaClient()` is created **per-request inside the `app_mention` handler** (line 377) — inject the singleton instead.

### [SIZE-6] 🟡 `archetype-generator.ts` (697) embeds 3 large prompt strings (~250 lines) inline — ⏱️ S
`SYSTEM_PROMPT_PRE` (~168), `SYSTEM_PROMPT_POST` (~58), `REFINE_SYSTEM_PROMPT` (~25) are inline constants — not testable, not diffable as prose. `generate()` and `refine()` also duplicate ~30 lines of model-recommendation + time-estimation post-processing. **Fix**: move prompts to `services/prompts/`; extract `applyModelAndEstimate()`.

<!-- additional SIZE findings appended here -->

## 3. Code Smells & AI Slop

### [SMELL-1] 🟢 Only 2 stray `console.*` in core `src/` — ⏱️ S (DOWNGRADED)
Initial count of 20 was a false positive. Real production stray logging in core `src/`: `src/lib/telegram-client.ts:82` and `src/gateway/services/tool-parser.ts:92` (both `console.warn`). Plus `worker-tools/hostfully/register-webhook.ts` (20× `console.log` — but it's a dev utility, lower risk). Use `pino` / `process.stdout.write` respectively.

### [SMELL-2] 🔴 ACTIVE BUG: 3 shell tools missing `unescapeShellArg` on free-text args — ⏱️ S
AGENTS.md mandates wrapping every free-text CLI arg with `unescapeShellArg` (LLMs emit literal `\n`). These tools DON'T, so multi-line LLM text arrives corrupted:
- `platform/report-issue.ts:44,47` — `--description`, `--patch-diff`
- `google/create-event.ts:30` — `--summary` (event title)
- `google/update-event.ts:32` — `--summary`
**Fix**: wrap each `args[++i]` with `unescapeShellArg()`. This is a real data-corruption bug, not style.

### [SMELL-3] 🔴 ACTIVE BUG: shell-injection + event-loop spin-wait in `rotate-property-code.ts` — ⏱️ S
`sifely/rotate-property-code.ts`:
- Lines 254/290/311/346/367 build shell commands via string interpolation into `execSync` (`...--lock-id ${lockId}`) — shell-injection vector if a value contains metacharacters. **Fix**: `execFileSync` with an args array.
- Lines 77–79: a 3-second **busy spin-wait** (`while (Date.now() - start < 3000) {}`) blocks the Node event loop. **Fix**: `await new Promise(r => setTimeout(r, 3000))`.

### [SMELL-4] 🔴 ACTIVE BUG: cost circuit breaker silently broken for 12/14 models — ⏱️ S
`src/lib/call-llm.ts:33–36` — `PRICING_PER_1M_TOKENS` only has entries for `minimax-m2.7` and `deepseek-v4-flash`. The other 12 catalog models fall through to `estimatedCostUsd = 0`, writing $0 cost rows to `executions`. The $50/day circuit breaker reads those rows — so it **never fires** for most models even as real OpenRouter spend accumulates. **Fix**: read `input_cost_per_million`/`output_cost_per_million` from the `model_catalog` table (data already exists there).

### [SMELL-5] 🟡 BUG: cost limit parsed with `parseInt` (truncates decimals) — ⏱️ S
`call-llm.ts:88` — `parseInt(costLimitStr, 10)` turns a `"50.5"` limit into `50`. **Fix**: `parseFloat` + `isNaN` guard.

### [SMELL-6] 🟡 `slack-blocks.ts`: status-classification logic copy-pasted — ⏱️ S
`buildNotifyStateBlocks` (69–132) and `buildNotifyBlocks` (472–522) independently re-implement the same `isProcessing/isReviewing/isDone/isFailed` classification + identical context strings. **Fix**: extract `classifyStatus(state)`.

### [SMELL-7] 🟡 VLRE business logic hardcoded in a "generic" tool — ⏱️ M
`hostfully/get-checkouts.ts:38–98` hardcodes `ZIP_CITY` map, `CONFIRMED_STATUSES`, room-naming conventions — VLRE-tenant-specific data baked into a generic tool. Breaks multi-tenancy if reused. **Fix**: move to config/injectable args; at minimum document the assumption.

### [SMELL-8] 🟢 Dead variables/functions in active worker files — ⏱️ S
`opencode-harness.mts:71` `opencodeRunPid` (declared, never assigned → unreachable SIGTERM branch); `heartbeat.ts:80–137` `escalate()` (never called, references an env var not in `.env.example`); `session-manager.ts:348–386` `sendFixPrompt()` (never called) — all orchestrator-era leftovers. Delete.

## 3b. Worker-Tools Consistency & Duplication (coworkers will extend this most)

### [TOOLS-1] 🔴 Hostfully HTTP client + cursor-pagination duplicated across 8 / 4 tools — ⏱️ M
No shared Hostfully client — every tool re-creates `{ 'X-HOSTFULLY-APIKEY', baseUrl, headers }` (8 tools) and the `for(;;){ fetch→dedup→cursor→break }` pagination loop (4 tools, ~25 lines each). Other services DO have shared clients (`sifely/lib/api.ts`, `jira/auth.ts`, `notion/auth.ts`, `google/google-fetch.ts`) — Hostfully is the gap. **Fix**: `hostfully/lib/client.ts` (`resolveHostfullyClient()`) + `hostfully/lib/paginate.ts` (`paginateCursor<T>()`). Also extract duplicated `formatGuestName()` and the PostgREST `queryPropertyLocks()` (dup'd between diagnose-access + rotate-property-code).

### [TOOLS-2] 🟡 Env-var validation + arg-parsing boilerplate repeated ~40× / ~1,000 lines — ⏱️ M
The `const x = process.env[...]; if (!x) { stderr; exit(1) }` block appears ~40×; the hand-rolled `parseArgs` for-loop ~1,000 lines total across 50 tools. A `requireEnv()` helper already exists in `google/google-fetch.ts` — promote to `worker-tools/lib/require-env.ts`. Add a minimal `getArg(args, '--flag')` helper. **This is the area coworkers extend most — shared helpers here prevent drift.**

### [TOOLS-3] 🟡 Tool structure conventions drift (--help, mock mode, `node:` prefix) — ⏱️ S
`--help` handled 3 different ways; mock mode exists for hostfully/jira/notion but not sifely/slack/google with no documented rule; `node:` import prefix inconsistent. **Fix**: codify the canonical structure in the `adding-shell-tools` skill (the doc coworkers will follow when adding tools).

## 4. Test Coverage Gaps

### [TEST-1] 🟡 `src/inngest` & `src/workers` covered by top-level `tests/`, not co-located — ⏱️ S (REFRAMED)
The raw "0 co-located tests" was misleading: `tests/inngest/` (~30 files) and `tests/workers/` cover these. Real coverage is healthy (~165 test files total). **Gap**: no coverage *measurement* (see TEST-3), so we can't confirm the giant files (`employee-lifecycle.ts`, `handlers.ts`, `opencode-harness.mts`) have meaningful branch coverage.

### [TEST-2] 🟡 Dashboard has 4 tests but they never run in CI — ⏱️ S
See BUILD-4. Dashboard tests run only under `dashboard/vite.config.ts` (jsdom), which CI never invokes.

### [TEST-3] 🟡 No coverage tooling at all — ⏱️ S
See BUILD-5. With ~165 tests this is a cheap, high-value add to (a) reveal which giant files are exercised and (b) gate regressions as the team grows.

## 5b. Dashboard Findings

### [DASH-1] 🔴 5 god-components (600–920 lines) mixing fetch + state + render + sub-components — ⏱️ L
`TaskDetail.tsx` (870: 6 data fetches + 5 inline sub-components + 3 handlers + dialogs), `RulesPanel.tsx` (852: 2 full tab components + 2 custom dropdowns in one file), `EmployeeDetail.tsx` (648: 14 useState across 4 domains), `EmployeeList.tsx` (614: 6 handlers + 2 dialogs), `CreateEmployeePage.tsx` (612: 3 useEffect fetches + 7-step wizard). **Fix**: extract custom hooks (`useTaskData`, `useEmployeeActions`, `useWizardData`) + pull sub-components into files. One component per PR. Positive: navigatable URL-state and `usePoll`/`gatewayFetch` data layer are consistently followed.

### [DASH-2] 🟡 AGENTS.md UI-convention violations — ⏱️ S
- Radix `<Select>` instead of mandated `<SearchableSelect>`: `components/layout/Header.tsx:10,69` (tenant switcher), `components/InputSchemaEditor.tsx:13`.
- Technical terms in end-user copy: "Select tenant" (Header:71), "No archetypes found for this tenant" (RulesPanel:828), "employee archetype...admin API" (TriggerPanel:173), "...for this tenant" (CreateEmployeePage:540, CompactSettingsGrid:243).
**Fix**: swap to `SearchableSelect`; rewrite strings to "organization"/"employee".

### [DASH-3] 🟡 Dashboard duplication — shared components/constants to extract — ⏱️ S
- `WEBHOOK_FIXTURES` const duplicated verbatim (`EmployeeList.tsx:33`, `EmployeeDetail.tsx:38`).
- `computeCostTierLabel()` duplicated (`ModelCatalogPage.tsx:34`, `EmployeeDetail.tsx:28`).
- Delete-employee dialog duplicated (`EmployeeList.tsx:558` ≈ `EmployeeDetail.tsx:623`).
- Inline error block (`border-destructive bg-destructive/10`) repeated 8+ times → extract `<ErrorBox>`.
- Raw `<textarea>` long Tailwind string repeated 6+ times → extract `<Textarea>`.
- `deleteRule` (`lib/gateway.ts:282`) bypasses the shared `gatewayFetch` wrapper (auth-header drift risk).
**Fix**: `lib/constants.ts`, `lib/utils.ts`, shared `DeleteEmployeeDialog`/`ErrorBox`/`Textarea`/`FormField`.

### [DASH-4] 🟢 `CompactSettingsGrid` 7-useState cluster → `useReducer`; minor unsafe casts in TaskDetail — ⏱️ S
7 related useState that reset/save together (lines 35, 74, 142) → `useReducer`. Unsafe casts `raw_event?.inputs as Record<string,string>` (TaskDetail:404) and transcript `msg as Record<string,unknown>` (804) → add type guards. (Dashboard `.tsx` has zero `any` otherwise — type safety is good.)

<!-- SMELL findings appended here -->

## 5. Type Safety

### [TYPE-1] 🟡 ESLint `no-explicit-any` and `no-unused-vars` are `warn`, not `error` — ⏱️ S
`eslint.config.mjs` sets both to `'warn'`. Warnings don't fail `pnpm lint` or CI, so `any` and unused vars can accumulate silently once more contributors join. Consider escalating to `error` (with targeted disables) before the team grows.

### [TYPE-2] 🟢 10 `as any` casts, concentrated in Slack Bolt `ack` — ⏱️ S
7 of 10 are `(ack as any)({...})` in `slack/handlers.ts:424,502,…` — a known Bolt typing limitation. **Fix**: one typed `ackWithResponse(ack, payload)` helper isolates the cast. Remaining: `disk-check.ts` (deprecated, will be deleted), 2 in a migration script (BUILD-6). Overall type safety is a STRENGTH (0 `@ts-ignore`, 0 `any` in lib/ or dashboard `.tsx`).

### [TYPE-3] 🟡 `Task.status`/`Execution.status` are untyped `String` in the schema — ⏱️ S
No DB-level CHECK constraint on lifecycle states; a typo like `"Recieved"` persists silently. `task_status_log` already has the CHECK pattern (schema:159) — apply the same to `tasks.status`/`executions.status`.

### [TYPE-4] 🟢 `slack-blocks.ts` returns `unknown[]` everywhere except one function — ⏱️ S
Only `buildNotifyBlocks` returns the typed `KnownBlock[]`; the other 8 builders return `unknown[]`, losing type safety at call sites. **Fix**: type all builders as `KnownBlock[]`.

<!-- TYPE findings appended here -->

## 6. Naming & Convention Consistency

### [NAMING-1] 🟡 Misleading generic names hide specific scope — ⏱️ S
- `gateway/services/task-creation.ts` is Jira-only but reads as THE canonical task-creation module (there are 3 task-creation paths — ARCH-2). Rename → `jira-task-creation.ts`.
- `lib/tunnel-client.ts` (27 lines) makes no HTTP calls — it's a `process.env.TUNNEL_URL` accessor. Rename → `tunnel-config.ts` or inline.
- `env-manifest-builder.mts` lives under `src/workers/` but is consumed by the gateway (brain-preview), not the harness — move to `src/lib/` or `src/gateway/`.

### [NAMING-2] 🟢 File naming is consistent (kebab-case) — no action — ⏱️ —
0 camelCase source filenames found. Good baseline for newcomers.

### [NAMING-3] 🟡 `eslint-disable` directives (23 in real source) — mostly fine, a few worth revisiting — ⏱️ S
Concentrated in `slack/handlers.ts` (7) and deprecated `wave-executor.ts` (6, will be deleted). Worth a pass once handlers.ts is split (SIZE-5) to see which disables become unnecessary.

<!-- NAMING findings appended here -->

## 7. Documentation & Onboarding

### [DOC-1] 🟡 AGENTS.md is enormous and injected into every LLM call — ⏱️ M
AGENTS.md is the de-facto onboarding doc but is very large and mixes agent-runtime instructions with human onboarding info. The file itself warns "every token here costs tokens on every turn." For coworkers, the critical onboarding facts (active vs deprecated code, the 3 task-creation paths, the data-access patterns, how to add a tool/employee) are buried among runtime directives. **Fix**: a short human-facing `CONTRIBUTING.md` / onboarding doc that links into AGENTS.md sections, OR split agent-runtime vs human-onboarding content.

### [DOC-2] 🟡 Active-vs-deprecated is undiscoverable without reading AGENTS.md + knip.json — ⏱️ S
A newcomer opening `src/workers/lib/` sees ~40 files with no signal that ~30 are dead. The deprecation knowledge lives only in prose + the knip ignore list. **Fix**: deleting the dead code (BUILD-1) largely solves this; until then, a `DEPRECATED.md` index or top-of-file banners help. (Note: prompt strings and business constants embedded in code — archetype-generator prompts, get-checkouts ZIP map — are also "hidden knowledge" newcomers won't find.)

<!-- DOC findings appended here -->

## 8. Dependency & Build Hygiene

### [BUILD-1] 🔴 ~6,300+ lines of deprecated code in the tree — exact deletion list confirmed — ⏱️ M
The workers deep-dive produced a **verified, file-by-file active/deprecated inventory**. Safe to delete in ONE PR (~4,764 lines in `src/workers/` alone):
- `src/workers/orchestrate.mts` (1,126), `src/workers/entrypoint.sh` (332), `src/workers/config/long-running.ts` (124)
- 25 `src/workers/lib/*` files (wave-executor, pr-manager, plan-judge, plan-parser, plan-sync, planning-orchestrator, fix-loop, fallback-pr, branch-manager, cache-validator, ci-classifier, completion(-detector), continuation-dispatcher, cost-breaker, cost-tracker-v2, disk-check, install-runner, project-config, prompt-builder, task-context, token-tracker, validation-pipeline, between-wave-push, agents-md-reader) — ~3,182 lines
- `src/workers/experimental/` (3 scratch markdown files)
Plus the deprecated inngest files: `lifecycle.ts` (633), `redispatch.ts` (101), `watchdog.ts` (209) — **⚠️ NOTE: AGENTS.md says watchdog is "still registered, do not modify"** — verify it can actually be removed before deleting (it may still be wired into the Inngest serve registration). This is the one deprecated file that needs a deeper check.
After deletion, remove the ~27 corresponding entries from `knip.json` ignore.
This dead code is ~15% of the codebase; new coworkers cannot distinguish active from dead without reading AGENTS.md + knip.json. Git history preserves everything.

### [BUILD-7] 🟡 `knip.json` ignore list has false positives — masks future dead code — ⏱️ S
`resource-caps.ts` and `heartbeat.ts` are in the knip `ignore` list but are **actively imported** by `opencode-harness.mts` (lines 17, 6). Being in the ignore list means knip won't trace their imports — a false negative that could hide future dead-code accumulation. **Fix**: remove these two from the ignore list (they should be tracked). `env-manifest-builder.mts` is consumed by the gateway (brain-preview), not the harness — consider moving it to `src/lib/` or `src/gateway/`.

### [BUILD-3] 🔴 CI test gate likely broken — no Postgres service in the `test` job — ⏱️ S
`.github/workflows/deploy.yml` runs `pnpm test -- --run` in the `test` job, and both `deploy-gateway` and `deploy-worker` declare `needs: test`. But `pnpm test` triggers `tests/helpers/global-setup.ts`, which runs `prisma migrate deploy` + `db:seed` via `psql`/`execSync` against **`localhost:54322`** — and the CI job has **no Postgres service container** configured. This means the test suite either fails (blocking all deploys) or the failure is somehow swallowed (deploys proceed untested). Either way the safety gate is not doing what it appears to. **Fix**: add a `postgres` service container to the `test` job (or a Supabase setup step) and verify the gate actually runs the suite green.

### [BUILD-4] 🟡 Dashboard tests never run in CI (and not in root `pnpm test`) — ⏱️ S
The root `vitest.config.ts` only includes `tests/**` and `src/**/__tests__/**`. The 4 dashboard tests (`dashboard/src/tests/*`, `dashboard/src/lib/__tests__/*`) run under the dashboard's OWN vite config (`dashboard/vite.config.ts` has a `test` block with jsdom). But CI never runs `cd dashboard && pnpm test` — only `pnpm build` + root `pnpm test` + `pnpm lint`. So dashboard tests are effectively dead weight in CI. **Fix**: add a dashboard test step to CI, or fold dashboard tests into a workspace-level test run.

### [BUILD-5] 🟡 No code-coverage tooling configured — ⏱️ S
No `coverage` config in `vitest.config.ts`, no `@vitest/coverage-*` dep, no coverage in CI. With ~165 test files this is a missed opportunity to (a) see which of the giant files are actually exercised and (b) prevent coverage regressions as the team grows. **Fix**: add `@vitest/coverage-v8` + a `test:coverage` script + optional CI threshold.

### [BUILD-6] 🟢 ~5 one-time migration/setup scripts linger in `scripts/` — ⏱️ S
`migrate-archetypes-to-template.ts`, `migrate-feedback-data.ts`, `migrate-vlre-kb.ts`, `resolve-hostfully-uids.ts`, `setup-two-tenants.ts` look like already-executed one-shots. `migrate-archetypes-to-template.ts` even uses `(prisma.archetype as any)` (2 of the 10 `as any`), implying it predates current schema. Newcomers can't tell these from live tooling. **Fix**: move executed one-shots to `scripts/archive/` or delete (git history preserves them).

### [BUILD-2] 🟢 `worker-tools/` is a separate package (own `package.json` + 34MB node_modules) — ⏱️ S
Intentional (deps installed at `/tools/` in Docker). Correctly gitignored. Document this boundary clearly for newcomers — it's surprising to find a nested package. Verify it's part of the pnpm workspace or intentionally standalone.

<!-- BUILD findings appended here -->

---

## Open Questions / To Verify
- Which `src/inngest` and `src/workers` files are genuinely untested vs covered by top-level `tests/`?
- Is deprecated code safe to delete, or must it stay registered (AGENTS.md says watchdog "still registered, do not modify")?
- Dashboard architecture: state management, data-fetching patterns, component duplication.
- Cross-cutting: error handling consistency, env-var access patterns, PostgREST client usage.
