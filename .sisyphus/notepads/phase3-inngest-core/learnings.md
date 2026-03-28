# Phase 3 Inngest Core — Learnings

## Session: ses_2d248ef86ffemm3WZrKAHBmS19 (2026-03-28)

### Key Facts from Plan Research

- Inngest SDK v4.1.0 installed
- `step.waitForEvent()` returns `null` on timeout (does NOT throw)
- `NonRetriableError` from `inngest` prevents Inngest from retrying a step
- Prisma's `updateMany()` returns `{ count: N }` — use for optimistic locking
- `scope: 'fn'` is valid in v4 for per-function concurrency
- `inngest_send_failure` checkpoint ALREADY DONE in Phase 2 (jira.ts:97-115) — verification only
- `src/inngest/` directory is empty (just .gitkeep) — ready for new files
- `serve.ts` has `functions: []` placeholder — just needs function imports added
- ALL DB ops use Prisma, NOT Supabase JS client (§10 pseudo-code uses supabase.from() but we use prisma)
- `actor: 'lifecycle_fn'` on ALL status log entries — CHECK constraint enforces this

### Codebase Patterns

- Factory pattern: `buildApp(options)` in server.ts → mirror with `createLifecycleFunction(inngest, prisma)`
- `task_status_log` entries written via `prisma.taskStatusLog.create()` inside same tx
- `cleanupTestData()` from tests/setup.ts MUST be in afterEach
- Test mock: `inngestMock` in tests/setup.ts for Inngest dependency injection
- Prisma singleton: `getPrisma()` from tests/setup.ts

### Status Transition Table (from plan)

| Transition                    | from_status                     | to_status     | actor        |
| ----------------------------- | ------------------------------- | ------------- | ------------ |
| Step 1: Ready → Executing     | Ready                           | Executing     | lifecycle_fn |
| Finalize timeout, re-dispatch | Executing                       | Ready         | lifecycle_fn |
| Finalize timeout, exhausted   | Executing                       | AwaitingInput | lifecycle_fn |
| Finalize success              | (no write — machine wrote Done) | —             | —            |

## Session: Task 3 — lifecycle.ts implementation (2026-03-28)

### Inngest v4 API Changes
- `createFunction` in v4 takes 2 args, NOT 3: `createFunction(options, handler)`
- Trigger moved INSIDE options: `triggers: [{ event: 'foo.bar' }]` (not separate 2nd arg)
- Returns `InngestFunction.Any` — must be imported as `import type { InngestFunction } from 'inngest'`
- TS2742 portability error: factory functions wrapping `createFunction` MUST have explicit return type `InngestFunction.Any` otherwise TypeScript can't name the inferred type

### Evidence
- Build output: `.sisyphus/evidence/task-3-lifecycle-build.txt` (gitignored, local only)
- Commit: `feat(inngest): implement engineering task lifecycle function with optimistic locking`

## Task 3 Learnings (2026-03-28)

### CRITICAL: Inngest v4 createFunction API
Architecture §10 pseudo-code uses 3-arg form: `createFunction({id}, {event}, handler)`
**Actual Inngest v4 API uses 2-arg form**: `createFunction({id, triggers: [{event: '...'}]}, handler)`

All future Inngest functions (T4 redispatch) MUST use:
```typescript
inngest.createFunction(
  { id: '...', triggers: [{ event: '...' }], /* other options */ },
  async ({ event, step }) => { ... }
)
```

### InngestFunction.Any return type
Must import `type { InngestFunction } from 'inngest'` and annotate factory return as `InngestFunction.Any`
to avoid TS2742 portability errors.

### unused variable in finalize
`machine` variable (from placeholder Step 2) would be flagged as unused in Step 4.
Use `void machine;` to suppress the warning until Phase 5 wires real Fly.io dispatch.

### Pre-existing lint warning (NOT from T3)
`tests/gateway/schemas.test.ts:10` has unused import `parseJiraIssueDeletion` — pre-existing from Phase 2.
