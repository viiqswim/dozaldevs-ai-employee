# Learnings — gm15-smart-lock-diagnosis

## [2026-05-01] Initial Setup

### Sifely API Quirks (CRITICAL)

- HTTP 200 on auth failure — must check `body.code`, NOT HTTP status
- List success omits `code` field entirely — presence of `code` = error
- Auth header: `Authorization: Bearer {token}` (NOT raw token)
- Required login headers: `Origin: https://manager.sifely.com`, `Referer: https://manager.sifely.com/`, `isToken: false`
- All endpoints use POST with query-string params (not JSON body)
- `/v3/gateway/list` does NOT exist — use `listByLock` + `detail`
- Token is session-scoped — authenticate once per tool invocation, no persistent cache

### Shared Locks & Passcode Naming Convention (CRITICAL)

- Multiple VLRE properties share the same physical Sifely lock
- `keyboardPwdName` is the ONLY way to identify which property a passcode belongs to
- Naming convention:
  - `HOME` → `permanent-visitor-home`
  - `ROOM` (room N, from last segment of property name e.g. "271-GIN-1" → 1) → `permanent-visitor-room-N`
  - `BUNDLE` / `MULTI_HOME` → `permanent-visitor-bundle`
  - Custom override: `passcode_name` field in PropertyLock takes precedence

### Architecture Decisions

- Platform-owned `PropertyLock` DB table (NOT calling vlre-hub directly)
- `diagnose-access.ts` is self-contained — inlines all Sifely auth, Hostfully door code fetch, PostgREST query. NO imports from other shell tools.
- `loadTenantEnv()` auto-injects ALL `tenant_secrets` as uppercase env vars — zero code changes needed
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TENANT_ID` already injected by harness

### Key IDs

- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- VLRE guest-messaging archetype ID: `00000000-0000-0000-0000-000000000013`
- Sifely base URL: `https://app-smart-server.sifely.com`
- Test property UID: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`

### Shell Tool Conventions

- Use `process.stdout.write(JSON.stringify(...) + '\n')` NOT `console.log`
- Use `process.stderr.write(...)` for errors
- Exit 1 on error, exit 0 on success (even if no data found)
- Add `--help` flag to every tool
- Do NOT import from other shell tools — inline all logic in diagnose-access.ts

### Forbidden Patterns

- `z.string().uuid()` for route params — use `uuidField()` from schemas.ts
- `console.log` in shell tools
- Logging Sifely passwords or passcode values
- Passcode mutations (read-only diagnosis only)

## Task 4 — sifely-client.ts shell tool (2026-05-01)

- Shell tool lives at `src/worker-tools/locks/sifely-client.ts`
- Auth uses `Authorization: Bearer {token}` — NOT raw token (task spec overrides primary source which used raw token)
- Primary source `vlre-employee/skills/sifely-client/sifely-client.ts` used `{ Authorization: token }` but task spec explicitly requires Bearer prefix
- Arg parsing follows get-reservations.ts pattern: manual loop, no commander/yargs
- `process.stdout.write(JSON.stringify(...) + '\n')` for output, `process.stderr.write(...)` for errors
- Types defined inline (LockPasscode, AccessRecord) — no import from shared types
- QA verified: --help exits 0 with Usage text, missing SIFELY_USERNAME exits 1 with env var name in stderr, missing --action exits 1 with flag name in stderr
- `pnpm build` exits 0

## Task 8 — diagnose-access.ts orchestrator (2026-05-01)

- Shell tool at `src/worker-tools/locks/diagnose-access.ts` — 660 lines, self-contained
- `property_locks.lock_external_id` is the Sifely lock ID (NOT `sifely_lock_id`)
- Passcode name derivation inlined from `passcode-naming.util.ts` + plan docs
- Three early-exit paths: (1) no door code → exit 0 empty locks, (2) no mappings → exit 0 empty locks, (3) Sifely auth failure → exit 1
- `Promise.all` for parallel lock fetching; Sifely failure per-lock is non-fatal (marks error field)
- `hasMismatch = any lock with !passcodeFound || !matchesHostfully`
- Mock server approach (node:http) used for no-mapping QA since Docker not running
- `pnpm build` exits 0 — TypeScript clean
- Evidence files: task-8-help.txt, task-8-missing-env.txt, task-8-no-mapping.txt

## Task 10 — --diagnosis flag in post-guest-approval.ts

- Added optional `diagnosis?: string` to `GuestApprovalParams` interface
- Parsed as JSON in `buildGuestApprovalBlocks()` — `{ hasMismatch: boolean, diagnosisSummary: string }`
- Diagnosis block inserted BETWEEN conversation summary and original message
- `hasMismatch: true` → prefix with `:warning: CODE MISMATCH — `
- `hasMismatch: false` → just show `diagnosisSummary` text
- `--dry-run` mode correctly shows/hides diagnosis block based on flag presence
- `pnpm build` exits 0 with no TypeScript errors
- Evidence saved to `.sisyphus/evidence/task-10-*.txt`

## Task 6: Property-Lock Seed Data (2026-05-01)

- `prisma.propertyLock` is the correct Prisma client accessor (camelCase of `PropertyLock` model)
- After adding a new Prisma model, must run `pnpm prisma generate` before the client type is available
- LSP may show stale errors even after generate — runtime works fine (seed exit 0 is the truth)
- The test property `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` from AGENTS.md is NOT in properties.json — it's a Hostfully testing UID; seeded it with 3401-BRE-HOME locks as a reasonable mapping
- 46 lock records seeded across 10 properties; DB count = 47 (1 pre-existing from earlier task)
- Idempotency confirmed: second seed run leaves count at 47

## Task 13 — diagnose-access integration test (2026-05-01)

- File: `tests/worker-tools/locks/diagnose-access-integration.test.ts`
- Single mock server handles all endpoints: `/api/v3.2/custom-data`, `/rest/v1/property_locks`, `/system/smart/login`, `/v3/lock/listKeyboardPwd`, `/v3/lockRecord/list`
- Mutable `postgrestData` map updated per-test to simulate different DB states without changing the mock server
- PostgREST IS NOT running in test env — Prisma inserts data, then the mock server's PostgREST handler returns that same data so the tool can find it
- Use clearly test-specific property IDs (`integ-test-property-*`) to avoid conflicts with seeded data
- `pnpm prisma generate` required before test (LSP shows stale `propertyLock` errors but runtime works fine)
- `npx vitest run <filepath>` (not `pnpm test -- --run`) correctly filters to single file
- All 3 tests pass in ~1.3s total, build exits 0
- Key: `beforeEach` cleans up + resets `postgrestData`; `afterEach` deletes Prisma rows; each test inserts its own row
