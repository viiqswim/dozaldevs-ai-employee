# Phase 3 Inngest Core — Decisions

## Session: ses_2d248ef86ffemm3WZrKAHBmS19 (2026-03-28)

### D1: Prisma injection pattern

Factory function: `createLifecycleFunction(inngest: Inngest, prisma: PrismaClient)`
Rationale: Matches `buildApp(options)` DI pattern from Phase 2 for testability

### D2: Optimistic locking method

Use `prisma.task.updateMany()` (not `prisma.task.update()`)
Rationale: `update()` throws on not-found; `updateMany()` returns count so we can detect lock failure

### D3: Lock failure error type

Throw `NonRetriableError` (from `inngest`) not regular `Error`
Rationale: Regular Error causes Inngest to retry the step, which would re-run even though lock failed

### D4: Step 2 — Fly.io dispatch

PLACEHOLDER only: `return { id: 'placeholder-machine-id' }`
With comment: `// TODO Phase 5: Replace with real Fly.io machine dispatch via flyApi.createMachine()`

### D5: Slack notifications

Stub with `console.warn('[SLACK STUB] ...')`
With comment: `// TODO Phase 7: Replace with real Slack client`

### D6: CEL expression for waitForEvent

To be confirmed by Task 1 research — likely: `if: \`async.data.taskId == '${taskId}'\``

### D7: test framework

To be confirmed by Task 1 — either `@inngest/test` or `vi.fn()` mocks (Phase 2 pattern)

### D6: CEL expression for waitForEvent (CONFIRMED)

Use: `if: \`async.data.taskId == '${taskId}'\``
Rationale: `async` is the official CEL variable for the incoming event in Inngest v4. Dot-notation accesses the data payload. Confirmed via official Inngest docs.

### D7: Test framework (CONFIRMED)

Use: `@inngest/test` with Vitest
Rationale: `@inngest/test@1.0.0` is fully compatible with Vitest (tested and verified). Already installed in devDependencies. Provides `InngestTestEngine` for lifecycle function testing.
