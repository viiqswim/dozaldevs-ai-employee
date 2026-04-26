## Task 2: Seed and Trigger Tests

### Test patterns used
- `getPrisma()` from `../setup.js` for seed verification tests (shared instance, disconnected in top-level `afterAll`)
- Direct `new PrismaClient()` for integration tests (separate instance, disconnected in own `afterAll`)
- `$queryRaw<Array<T>>` with `::uuid` cast for UUID comparisons
- `makeInngestSpy()` returning `{ send: vi.fn().mockResolvedValue({ ids: ['mock-event-id'] }) }`
- `InngestLike` imported from `../../src/gateway/server.js` (re-exported from `./types.js`)

### Test file location
`tests/gateway/seed-guest-messaging.test.ts` — 16 tests, all green

### vitest run command
- Targeted: `pnpm vitest run tests/gateway/seed-guest-messaging.test.ts` (not `pnpm test -- --run`)
- `pnpm test -- --run <file>` runs the FULL suite (the `-- --run` pattern passes args to vitest child, not vitest itself)
- Full suite has 20 pre-existing failures — none caused by new test file

### tool_registry tools for guest-messaging
```
/tools/hostfully/get-property.ts
/tools/hostfully/get-reservations.ts
/tools/hostfully/get-messages.ts
/tools/hostfully/send-message.ts
/tools/slack/post-message.ts
/tools/slack/read-channels.ts
/tools/platform/report-issue.ts
```

### API dry-run behavior
Gateway health OK (HTTP 200) but dry-run endpoint returned 500 — runtime connection issue in live gateway process, not test regression. Integration tests cover the logic directly.
