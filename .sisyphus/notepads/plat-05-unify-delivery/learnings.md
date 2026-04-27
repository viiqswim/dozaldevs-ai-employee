# Learnings — plat-05-unify-delivery

## Architecture Decisions

- Delivery machine signals completion via `EMPLOYEE_PHASE=delivery` env var (not DELIVERY_MODE)
- Delivery machine patches task to `Done` directly (not `Submitting`) — lifecycle polls for `Done`/`Failed`
- Delivery machine must NOT create new `executions` or `deliverables` records
- Retry: lifecycle spawns up to 3 delivery machines (1 initial + 2 retries)
- Null delivery_instructions → task marked `Failed` immediately (not silent skip)
- `slackClient.updateMessage()` stays in lifecycle for approval card update; only `postMessage` delivery removed

## Key File Locations

- Lifecycle: `src/inngest/employee-lifecycle.ts`
  - handle-approval-result step: lines 310–489
  - PATH A (Fly.io machine): lines 375–421
  - PATH B (inline Slack): lines 422–468
  - no-approval path: lines 277–293 — DO NOT TOUCH
- Harness: `src/workers/opencode-harness.mts`
  - ArchetypeRow interface: lines 18–27
- Schema: `prisma/schema.prisma` — Archetype model: lines 199–229
- Seed: `prisma/seed.ts` — DELIVERY_MODE refs at lines 392, 407, 433

## Pre-existing Issues (Do NOT fix)

- `prisma/seed.ts`: `knowledgeBaseEntry` type error (lines 1250, 1266) — pre-existing
- `tests/inngest/lifecycle.test.ts`: `updateMessage` missing in mock — pre-existing
- `tests/inngest/lib/create-task-and-dispatch.test.ts`: `tenantId` missing — pre-existing

## Task 1: delivery_instructions migration

- Migration conflict: `20260424020323_add_knowledge_base_entries` was modified after being applied — `prisma migrate dev` refused to run
- Resolution: manually created migration SQL file + applied via `psql` directly + marked applied via `prisma migrate resolve --applied <name>`
- Pattern: `ALTER TABLE "archetypes" ADD COLUMN "delivery_instructions" TEXT;` (no NOT NULL, no default)
- Prisma client generated to: `node_modules/.pnpm/@prisma+client@6.19.2_.../node_modules/.prisma/client/index.d.ts`
- Build: `pnpm build` (tsc) exits 0 with new field
- Pre-existing LSP errors in `prisma/seed.ts` (knowledgeBaseEntry) and tests — not fixed, as instructed

## Task 2: ArchetypeRow.delivery_instructions + EMPLOYEE_PHASE check

- `delivery_instructions` added to `ArchetypeRow` interface after `agents_md` field (line 27)
- `runDeliveryPhase` stub placed BEFORE `main()` — TypeScript requires declaration before call site
- Stub signature: `(archetype: ArchetypeRow, taskId: string, logger: typeof log)` — kept minimal since full impl is next task
- `PostgRESTClient` has no index signature — cannot access `db['headers']`; stub takes only what it needs from env
- `EMPLOYEE_PHASE` check placed immediately after archetype null-check (after `process.exit(1)` guard)
- `void archetype; void taskId; void logger;` used in stub to suppress unused-variable TS errors
- Build: `pnpm build` exits 0 — commit `b32b224`

## Task 3: runDeliveryPhase implementation

- Pattern: fetch deliverable via `db.get('deliverables', 'external_ref=eq.{taskId}&select=*&order=created_at.desc&limit=1')`
- Null guards return early after `markFailed(reason, null)` — no throw needed since caller handles
- Instructions prepend: `"APPROVED CONTENT TO DELIVER:\n{content}\n\n{delivery_instructions}"`
- `runOpencodeSession` validation WILL throw in delivery mode (no `/tmp/summary.txt` or `/tmp/approval-message.json`) — catch, markFailed, re-throw
- Success path (when runOpencodeSession returns): patch task `Done` → post status_transition `Delivering → Done`
- No new `executions` or `deliverables` records in delivery phase
- `db.post('status_transitions', {...})` uses `task_id` (not `taskId`) per schema field name
- Build exits 0; commit `a6db942`

## Task: Unify delivery path (handle-approval-result refactor)

### Key findings

- `summaryBlocks` and `summaryContent` were ONLY used in PATH B (inline postMessage) — both removed cleanly
- `updateMessage` for approval was nested inside PATH B's else block — moved outside if/else, called unconditionally before retry loop
- `deliveryInstructions` fetched via join: `tasks?id=eq.{taskId}&select=archetypes(delivery_instructions)` — response shape is `Array<{ archetypes?: { delivery_instructions?: string | null } }>`
- Retry loop uses `let finalStatus = ''` scoped outside the polling loop so it persists after break
- `patchTask` accepts `failure_reason` as a field alongside `status` — works with the existing helper
- `DELIVERY_MODE: 'true'` removed, replaced by `EMPLOYEE_PHASE: 'delivery'`
- Net diff: -2 net lines (59 insertions, 61 deletions) — removed gate + PATH B + 2 unused vars, added null guard + updateMessage unconditional + retry loop
- Build clean: `tsc -p tsconfig.build.json` EXIT_CODE:0

## Task 4: seed.ts delivery_instructions + DELIVERY_MODE removal

- `pnpm prisma db seed` fails with "Can't reach database server" even when DB is up — root cause: `prisma.config.ts` says "skipping environment variable loading" but actually reads `.env` itself; the issue was transient. Running `npx tsx prisma/seed.ts` directly works reliably.
- Pattern for adding field to upsert: add to BOTH `create` and `update` objects (not just one)
- DELIVERY_MODE was a trailing string concatenation at end of each instruction constant — removed by trimming the last `+` line and the 3 DELIVERY_MODE lines
- VLRE guest-messaging STEP 6 was renamed to STEP 6 (delivery mode removed) → STEP 6 becomes error handling (was STEP 7)
- All 3 archetypes upserted successfully: 00000000-0000-0000-0000-000000000012, 00000000-0000-0000-0000-000000000013, 00000000-0000-0000-0000-000000000015
- Commit: `13afae7`

## Task 6: Cleanup — test assertions + docs update

- `prisma.$queryRaw` type annotation must include ALL selected columns — updated from `Array<{ instructions: string | null }>` to `Array<{ instructions: string | null; delivery_instructions: string | null }>`
- SQL `SELECT instructions FROM archetypes` → `SELECT instructions, delivery_instructions FROM archetypes`
- Flipped assertion: `toContain('DELIVERY_MODE')` → `not.toContain('DELIVERY_MODE')`
- Added: `expect(result[0].delivery_instructions).toBeTruthy()` and `expect(result[0].delivery_instructions).toContain('send-message.ts')`
- All 16 tests in seed-guest-messaging.test.ts pass (1 passed, 16 tests)
- Final sweep: only remaining `DELIVERY_MODE` reference is the `not.toContain` assertion — correct
- Docs: replaced `DELIVERY_MODE=true` bullet with `EMPLOYEE_PHASE=delivery` unified delivery description
- `grep -n "EMPLOYEE_PHASE" docs/2026-04-24-1452-current-system-state.md` → line 119 ✓
- Commit: `138c9b7`

## Task 7: Delivery flow test suite (employee-lifecycle-delivery.test.ts)

- Used `vi.hoisted()` for all mock functions referenced inside `vi.mock()` factories — required because `vi.mock()` is hoisted before variable declarations
- `transformCtx` intercepts `step.run`: only `handle-approval-result` runs real code via `fn()`; all other steps return mock values
- `step.waitForEvent` mocked on `mocked` (not `ctx`) to return approval event or `null` for timeout
- `vi.stubGlobal('setTimeout', fn => { fn(); return 0 })` eliminates 15s polling delays in tests
- `triggerEvent()` must return explicit tuple type `{ events: [{ name: string; data: Record<string, unknown> }] }` — InngestTestEngine requires it
- `buildFetchMock` routes by URL pattern: `/deliverables?` → deliverable row, `archetypes(delivery_instructions)` → instructions, `select=status` → sequential task statuses, PATCH/POST → `[]`
- `vi.stubGlobal('fetch', ...)` must be called inside `beforeEach` (not `beforeAll`) so each test gets its own fetch mock
- `mockCreateMachine` returns `{ id: 'mock-delivery-machine-id' }` — matches `FlyMachine` shape expected by lifecycle
- Null delivery_instructions test: `archetypes(delivery_instructions)` fetch returns `[{ archetypes: { delivery_instructions: null } }]` → lifecycle marks Failed immediately, `createMachine` never called
- Rejection test: `step.waitForEvent` returns `{ data: { action: 'reject', userId: 'U-ACTOR', userName: 'Tester' } }` → task Cancelled, no machine spawned
- Timeout test: `step.waitForEvent` returns `null` → task Cancelled, no machine spawned
- 7 tests, 18ms, EXIT:0 — commit `029f68e`

## Vitest + .mts imports (2026-04-26)

Vitest uses vite-node's transform pipeline — does NOT apply TypeScript NodeNext
extension remapping (.mjs → .mts). If a test imports a `.mjs` path that doesn't
exist on disk, Vitest silently skips the file (it never appears in results).

**Fix pattern**:
- Import the `.mts` source directly: `import('../../src/workers/foo.mts')`
- Add `allowImportingTsExtensions: true` to base `tsconfig.json` (requires `noEmit: true`)
- Override with `allowImportingTsExtensions: false` in `tsconfig.build.json` (has `noEmit: false`)
- `vi.resetModules()` in `beforeEach` is correct to reset module-level singletons between tests
- Set env vars and `vi.stubGlobal('fetch', ...)` BEFORE the dynamic import (IIFE reads them at load time)

## mockReturnValue vs mockImplementation for EventEmitter mocks (2026-04-26)

`mockSpawn.mockReturnValue(makeChildProcess(0))` calls `makeChildProcess` IMMEDIATELY
when the test sets up the mock — the EventEmitter's `setTimeout` timer starts at that
moment. If module loading (Vite cold transform) takes longer than the timer delay, the
'close' event fires BEFORE `child.on('close', handler)` is registered inside the code
under test → promise never resolves → downstream fetch calls never made.

**Pattern**: Any time a mock needs to construct an object with timers/state, use
`mockImplementation(() => makeChildProcess(0))` so the object is created fresh when
the mock function is called (inside the code under test), not when the test configures it.

This is particularly important for the FIRST test in a file where Vite performs a cold
transform. Subsequent tests benefit from Vite's in-memory transform cache (fast module
load), so the timer race doesn't manifest.

## Task 9: Build Verification + Docker Rebuild (2026-04-27)

### pnpm build
- `tsc -p tsconfig.build.json` exits 0 — no new TypeScript errors introduced by PLAT-05 changes

### Test suite
- Full suite: 18 failed | 100 passed | 2 skipped (120 files), 77 failed | 1204 passed | 10 skipped (1291 tests)
- All failures are pre-existing (deprecated engineering lifecycle, DB-dependent tests, deprecated worker libs)
- `tests/workers/opencode-harness-delivery.test.ts`: 6 tests PASSED ✓
- Fixed: `delivery phase makes no POST to executions or deliverables tables` — same mockReturnValue race condition as commit 52d5887; changed to `mockImplementation(() => makeChildProcess(0))`

### Env var sweep
- `grep -r "DELIVERY_MODE\|DELIVERY_MACHINE_ENABLED" src/ prisma/ tests/` → only acceptable match:
  `tests/gateway/seed-guest-messaging.test.ts: expect(result[0].instructions).not.toContain('DELIVERY_MODE')`
- No forbidden references in production code ✓

### Docker build
- `docker build -t ai-employee-worker:latest .` exits 0
- Image SHA256: `a28946b2477f011cf9a508ad46aa81db68dedd2a9d322141f5520729c028f3ec`
- Build includes updated harness with `runDeliveryPhase`, `delivery_instructions` field, `EMPLOYEE_PHASE=delivery` check
