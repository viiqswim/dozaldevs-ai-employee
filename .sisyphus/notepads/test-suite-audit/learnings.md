# Learnings — test-suite-audit

## 2026-05-20 Init

### Test Infrastructure

- Framework: Vitest (NOT jest/bun)
- Config: `vitest.config.ts` — pool=forks, singleFork=true, testTimeout=30000ms
- Test DB: `postgresql://postgres:postgres@localhost:54322/ai_employee_test`
- Run: `pnpm test -- --run` (single pass, no watch)
- Per-file: `pnpm test -- --run path/to/file.test.ts`

### Known Pre-existing Skips (DO NOT FIX)

- `tests/workers/container-boot.test.ts` — 4 tests skip via `describe.skipIf(!INTEGRATION_AVAILABLE)` — requires Docker socket
- `tests/gateway/inngest-serve.test.ts` — 1 test has `it.skip` for stale function count (expects 2, actual is 9)
- `tests/inngest/integration.test.ts` — 4/5 tests skip via `describe.skipIf(!INTEGRATION)` — needs `OPENCODE_TEST_URL`
- `tests/workers/integration.test.ts` — 6/7 tests skip via `describe.skipIf(!INTEGRATION)` — needs `OPENCODE_TEST_URL`

### Active workers/lib tests (KEEP THESE — do NOT delete)

- `tests/workers/lib/opencode-server.test.ts`
- `tests/workers/lib/postgrest-client.test.ts`
- `tests/workers/lib/output-schema.test.ts`
- `tests/workers/lib/approval-card-poster.test.ts`
- `tests/workers/lib/agents-md-resolver.test.ts`

### Failing Tests Root Causes

1. `hostfully.test.ts` + `supersede-threading.test.ts`: mock uses `archetype.findUnique`, prod uses `archetype.findFirst` → update mock method name only
2. `admin-employee-trigger.test.ts`: `makeApp()` passes `prisma: {} as never` but route now calls `prisma.archetype.findFirst` → add mock for `archetype.findFirst`
3. `migration-agents-md.test.ts`: static `agents.md` updated (sections 7-9 removed), DB not reseeded → update test assertions (do NOT reseed DB)
4. `github-stub.test.ts`: `inject()` with no body/Content-Type returns 404 → add headers or fix assertion

### Commit Convention

- Group 1: `chore(tests): remove deprecated engineering worker test files`
- Group 2: `fix(tests): update stale mocks to match production code`
- Group 3: `chore(tests): simplify vitest config after deprecated file removal`
- Group 4: `fix(tests): resolve silently-skipped tests`
- Group 5: `chore(tests): merge duplicate tenant-secret-repository tests`
- Group 6: `docs: update expected test count in AGENTS.md`
