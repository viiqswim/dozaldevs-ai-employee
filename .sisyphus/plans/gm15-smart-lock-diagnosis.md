# GM-15: Smart Lock Diagnosis

## TL;DR

> **Quick Summary**: Add a `diagnose-access.ts` shell tool that cross-references Hostfully door codes against Sifely smart lock passcodes and access logs, giving the guest-messaging employee specific diagnostic data instead of generic responses when guests report lock issues.
>
> **Deliverables**:
>
> - Prisma `PropertyLock` table + migration for property-to-lock mappings
> - Admin API CRUD endpoints for managing property-lock mappings (tenant-scoped)
> - Sifely API client shell tool (`src/worker-tools/locks/sifely-client.ts`)
> - Diagnosis orchestrator shell tool (`src/worker-tools/locks/diagnose-access.ts`)
> - Enhanced Slack approval card with lock diagnosis section
> - Updated guest-messaging archetype instructions
> - VLRE seed data (property-lock mappings + Sifely credentials)
> - Unit + integration tests for all new code
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (migration) → T3 (admin API) → T6 (seed) → T8 (diagnosis tool) → T10 (approval card) → T11 (archetype instructions) → T13 (integration test)

---

## Context

### Original Request

Implement GM-15: Smart Lock Diagnosis from the Phase 1 story map. When a guest messages "the door code doesn't work," the AI employee should automatically cross-reference the Hostfully door code against the Sifely smart lock's actual passcode and recent access records, producing a specific diagnosis instead of a generic response.

### Interview Summary

**Key Discussions**:

- **Property-to-lock mapping**: User chose platform-owned DB table over calling vlre-hub. New `PropertyLock` Prisma model with tenant scoping.
- **Door code retrieval**: Diagnosis tool fetches Hostfully door code directly via custom data API. No changes to existing `get-property.ts`.
- **Sifely client complexity**: Port the standalone MVP (282 lines, native fetch, no circuit breaker). Read-only diagnosis doesn't need mutation support or gateway queue.
- **Test strategy**: Tests after implementation — unit tests for Sifely client + diagnosis logic, integration test with real VLRE Sifely API.

**Research Findings**:

- Sifely API uses TTLock under the hood — HTTP 200 on auth failure (must check `body.code`), list success omits `code` field, all endpoints use POST with query-string params
- Hostfully door code lives in `/api/v3.2/custom-data?propertyUid=` — separate from standard property API
- Standalone MVP at `vlre-employee/skills/sifely-client/sifely-client.ts` is a clean, self-contained 282-line client with auth, token caching, passcode listing, access record retrieval
- Diagnosis logic at `vlre-employee/skills/lock-diagnosis/diagnosis.ts` handles multi-lock properties, graceful degradation on per-lock failures, mismatch detection on permanent passcodes only
- `loadTenantEnv()` auto-injects ALL `tenant_secrets` as uppercase env vars — zero code changes needed for credential injection

### Metis Review

**Identified Gaps** (addressed):

- **Sifely token cache is in-memory** — each shell tool invocation creates a new process, so 2h cache is useless. Accepted for MVP (read-only, low frequency). Every diagnosis call will re-authenticate.
- **Multi-lock per property** — properties can have multiple locks (front door, back door). The `property_locks` table allows multiple rows per `(tenant_id, property_external_id)` — no unique constraint on that pair.
- **Missing env var for diagnosis tool** — `diagnose-access.ts` needs `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TENANT_ID` to query `property_locks` via PostgREST. These are already injected by the harness.
- **Authorization header format** — standalone MVP uses `Authorization: {token}` (no Bearer prefix); vlre-hub uses Bearer. Research docs confirm Bearer is correct. Will use `Authorization: Bearer {token}`.
- **Lock provider abstraction** — `lock_provider` field is a simple string (not enum), defaulting to `'sifely'`. The diagnosis tool checks this field to select the API client. Only Sifely is implemented now.
- **Archetype instructions update** — goes in `prisma/seed.ts` (idempotent, re-runnable). The guest-messaging archetype instructions are already defined there.

### Post-Metis Research: Shared Locks & Passcode Naming (CRITICAL)

**Discovery**: Multiple properties share the same physical lock (e.g., front door of a 4-room house). Each property gets its own **named** passcode on the lock. The `keyboardPwdName` field is the ONLY way to identify which property a passcode belongs to.

**Naming convention** (from `vlre-hub/apps/api/src/code-rotation/utils/passcode-naming.util.ts`):

- `HOME` → `permanent-visitor-home`
- `ROOM` (room N) → `permanent-visitor-room-N` (room number extracted from last segment of property name)
- `BUNDLE` / `MULTI_HOME` → `permanent-visitor-bundle`
- Custom override: `Property.passcodeName` field (takes precedence when set)

**Impact**: The `PropertyLock` table needs `property_type`, `property_name`, and `passcode_name` fields so the diagnosis tool can derive the expected passcode name and filter correctly. Without this, the tool would match against wrong property's passcode on shared locks.

**Source data**: All 36 VLRE properties with actual Sifely lock IDs are in `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/data/properties.json`

---

## Work Objectives

### Core Objective

Give the guest-messaging AI employee the ability to diagnose lock access issues by cross-referencing Hostfully door codes against Sifely smart lock passcodes and recent access records, and surface the diagnosis in the Slack approval card for PM visibility.

### Concrete Deliverables

- `prisma/migrations/XXXXXX_add_property_locks/migration.sql` — new `property_locks` table
- `prisma/schema.prisma` — `PropertyLock` model
- `src/gateway/routes/admin-property-locks.ts` — CRUD admin routes
- `src/gateway/validation/schemas.ts` — Zod schemas for property-lock endpoints
- `src/worker-tools/locks/sifely-client.ts` — Sifely API client (auth, listPasscodes, listAccessRecords)
- `src/worker-tools/locks/diagnose-access.ts` — diagnosis orchestrator shell tool with passcode name resolution for shared locks
- `src/worker-tools/slack/post-guest-approval.ts` — enhanced with `--diagnosis` flag
- `Dockerfile` — COPY lines for `/tools/locks/`
- `prisma/seed.ts` — VLRE property-lock mappings + archetype instructions update
- `.env.example` — new Sifely-related env vars documented
- `tests/worker-tools/locks/sifely-client.test.ts` — unit tests
- `tests/worker-tools/locks/diagnose-access.test.ts` — unit tests
- `tests/gateway/routes/admin-property-locks.test.ts` — route handler tests
- `tests/gateway/admin-property-locks-integration.test.ts` — integration test against real DB

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` has no new test failures
- [ ] `tsx src/worker-tools/locks/diagnose-access.ts --help` prints usage
- [ ] Admin API CRUD for property-lock mappings works (curl verification)
- [ ] Diagnosis tool produces correct JSON output with mock Sifely data
- [ ] `post-guest-approval.ts --dry-run --diagnosis '{...}'` renders diagnosis block in Slack card
- [ ] Story map GM-15 acceptance criteria all checked

### Must Have

- `PropertyLock` table with `tenant_id`, `property_external_id`, `lock_external_id`, `lock_name`, `lock_provider`, `lock_role`, `property_type`, `property_name`, `passcode_name` (optional override), `lock_metadata`
- Sifely API client with auth (login endpoint, token caching within session), passcode listing, access record retrieval
- Diagnosis tool that: fetches Hostfully door code via custom data API, queries property_locks via PostgREST, calls Sifely for each lock, produces structured JSON diagnosis
- Slack approval card enhancement showing diagnosis result
- Updated archetype instructions telling the employee when/how to use the diagnosis tool
- Unit tests for Sifely client and diagnosis tool
- VLRE seed data for property-lock mappings

### Must NOT Have (Guardrails)

- ❌ Passcode mutations (create/update/delete) — diagnosis is read-only
- ❌ Gateway queue / mutex logic — no mutations means no serialization needed
- ❌ Circuit breaker / caching layer — overkill for a shell tool invoked per-request
- ❌ August / Yale lock provider implementations — only the `lock_provider` field exists for future use
- ❌ Changes to `src/worker-tools/hostfully/get-property.ts` — diagnosis tool fetches door code directly
- ❌ Changes to `src/gateway/services/tenant-env-loader.ts` — auto-injection already works
- ❌ vlre-hub as a runtime dependency — platform-owned DB table instead
- ❌ `console.log` for machine-readable output — use `process.stdout.write(JSON.stringify(...) + '\n')`
- ❌ `z.string().uuid()` for route params — use `uuidField()` from `schemas.ts`
- ❌ Logging of Sifely passwords or passcode values — only log lockId, lockName, and match/mismatch status

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (existing)
- **Pattern**: Follow `tests/worker-tools/hostfully/get-reservations.test.ts` — in-process mock HTTP server + `execFile('npx', ['tsx', SCRIPT_PATH])` + env var injection

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run tool with args, parse JSON stdout, assert fields
- **Admin API**: Use Bash (curl) — send requests, assert status + response fields
- **Slack card**: Use `--dry-run` flag — verify Block Kit JSON structure
- **DB changes**: Use Bash — run `pnpm prisma migrate status`, query via PostgREST

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: Prisma migration + PropertyLock model [quick]
├── Task 2: Zod schemas for property-lock endpoints [quick]
├── Task 4: Sifely API client shell tool [deep]
└── Task 5: Hostfully custom data helper (door code fetch) [quick]

Wave 2 (After Wave 1 — routes + tools):
├── Task 3: Admin API CRUD routes for property-locks (depends: 1, 2) [unspecified-high]
├── Task 7: Dockerfile COPY lines for /tools/locks/ (depends: 4) [quick]
├── Task 8: Diagnosis orchestrator shell tool (depends: 1, 4, 5) [deep]
└── Task 9: Unit tests for Sifely client (depends: 4) [unspecified-high]

Wave 3 (After Wave 2 — integration + enhancements):
├── Task 6: Seed data — VLRE property-lock mappings (depends: 3) [quick]
├── Task 10: Slack approval card --diagnosis flag (depends: 8) [quick]
├── Task 11: Archetype instructions update (depends: 8) [quick]
├── Task 12: Unit tests for diagnosis tool (depends: 8) [unspecified-high]
└── Task 14: Admin API route tests (depends: 3) [unspecified-high]

Wave 4 (After Wave 3 — final verification):
├── Task 13: Integration test with real DB (depends: 6, 8) [unspecified-high]
├── Task 15: Build + full test suite verification (depends: all) [quick]
└── Task 16: Story map update + Telegram notification (depends: 15) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T3 → T6 → T8 → T10 → T13 → T15 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks         | Wave |
| ---- | ---------- | -------------- | ---- |
| 1    | —          | 3, 8, 6        | 1    |
| 2    | —          | 3              | 1    |
| 4    | —          | 7, 8, 9        | 1    |
| 5    | —          | 8              | 1    |
| 3    | 1, 2       | 6, 14          | 2    |
| 7    | 4          | —              | 2    |
| 8    | 1, 4, 5    | 10, 11, 12, 13 | 2    |
| 9    | 4          | —              | 2    |
| 6    | 3          | 13             | 3    |
| 10   | 8          | —              | 3    |
| 11   | 8          | —              | 3    |
| 12   | 8          | —              | 3    |
| 14   | 3          | —              | 3    |
| 13   | 6, 8       | 15             | 4    |
| 15   | all        | 16             | 4    |
| 16   | 15         | —              | 4    |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 → `quick`, T2 → `quick`, T4 → `deep`, T5 → `quick`
- **Wave 2**: **4** — T3 → `unspecified-high`, T7 → `quick`, T8 → `deep`, T9 → `unspecified-high`
- **Wave 3**: **5** — T6 → `quick`, T10 → `quick`, T11 → `quick`, T12 → `unspecified-high`, T14 → `unspecified-high`
- **Wave 4**: **3** — T13 → `unspecified-high`, T15 → `quick`, T16 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma Migration — PropertyLock Model

  **What to do**:
  - Add `PropertyLock` model to `prisma/schema.prisma` after the `PendingApproval` model (around line 469)
  - Fields: `id` (UUID, default uuid), `tenant_id` (UUID, FK to Tenant), `property_external_id` (String — Hostfully property UID), `lock_external_id` (String — Sifely numeric lockId stored as string), `lock_name` (String — e.g. "219-PAU-HOME-FRONT-DOOR"), `lock_provider` (String, default `'sifely'`), `lock_role` (String?, optional — e.g. `FRONT_DOOR`, `BACK_DOOR`, `ROOM_DOOR`, `COMMON_AREA`), `property_type` (String — `HOME`, `ROOM`, `MULTI_HOME`, or `BUNDLE`), `property_name` (String — e.g. "271-GIN-1", used to derive room number for passcode name resolution), `passcode_name` (String?, optional — custom override for the expected passcode name on this lock, defaults to convention: HOME→`permanent-visitor-home`, ROOM-N→`permanent-visitor-room-N`, BUNDLE→`permanent-visitor-bundle`), `lock_metadata` (Json?, optional), `created_at` (DateTime), `updated_at` (DateTime)
  - Add `@@map("property_locks")` table mapping
  - Add `@@index([tenant_id, property_external_id])` for efficient lookup by property
  - Do NOT add `@@unique([tenant_id, property_external_id])` — a property can have multiple locks
  - Add relation to Tenant: `tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Restrict)`
  - Add `propertyLocks PropertyLock[]` to the `Tenant` model's relations
  - Run `pnpm prisma migrate dev --name add_property_locks` to generate the migration

  **Must NOT do**:
  - Do NOT add a unique constraint on `(tenant_id, property_external_id)` — multi-lock per property is required
  - Do NOT use enum for `lock_provider` — keep it as a plain String

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4, 5)
  - **Blocks**: Tasks 3, 6, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:451-469` — `PendingApproval` model: shows the standard Prisma model pattern with tenant relation, `@@map`, timestamps. Add `PropertyLock` after this model.
  - `prisma/schema.prisma:377-401` — `Tenant` model: add `propertyLocks PropertyLock[]` relation here alongside existing relations like `pendingApprovals`

  **Type References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/lock-types.ts:1-8` — `PropertyLock` interface from standalone MVP: `{ lockId, sifelyLockId, lockName, lockRole }`. Map these to Prisma fields: `lock_external_id` = sifelyLockId, `lock_name` = lockName, `lock_role` = lockRole. Additionally, add `property_type`, `property_name`, and `passcode_name` fields (not in MVP type, but needed for shared-lock passcode name resolution).
  - `/Users/victordozal/repos/real-estate/vlre-hub/packages/database/prisma/schema/property.prisma` — vlre-hub's three-table schema (Property, Lock, PropertyLock junction) shows the full data model. The ai-employee platform flattens this into a single `PropertyLock` table with denormalized fields.

  **External References**:
  - None — standard Prisma migration

  **WHY Each Reference Matters**:
  - `PendingApproval` model is the most recent addition — copy its exact Prisma style (field ordering, decorator pattern, relation format)
  - `Tenant` model's relation list must be updated to include `PropertyLock[]` for Prisma to compile

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration creates property_locks table
    Tool: Bash
    Preconditions: Database is running at localhost:54322
    Steps:
      1. Run `pnpm prisma migrate dev --name add_property_locks`
      2. Run `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d property_locks"`
      3. Assert columns exist: id, tenant_id, property_external_id, lock_external_id, lock_name, lock_provider, lock_role, lock_metadata, created_at, updated_at
    Expected Result: Exit 0, table exists with all columns
    Failure Indicators: Migration error, missing columns, wrong types
    Evidence: .sisyphus/evidence/task-1-migration-applied.txt

  Scenario: Prisma client generates without errors
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run `pnpm prisma generate`
      2. Run `pnpm build`
    Expected Result: Exit 0 on both commands
    Failure Indicators: TypeScript errors referencing PropertyLock, missing relation errors
    Evidence: .sisyphus/evidence/task-1-build-passes.txt

  Scenario: Multiple locks per property allowed
    Tool: Bash
    Preconditions: Migration applied, database running
    Steps:
      1. Insert two rows with same tenant_id + property_external_id but different lock_external_id using psql
      2. Assert both rows exist without unique violation
    Expected Result: Both rows inserted successfully
    Failure Indicators: Unique constraint violation error
    Evidence: .sisyphus/evidence/task-1-multi-lock.txt
  ```

  **Commit**: YES (group 1)
  - Message: `feat(prisma): add PropertyLock model for property-to-lock mappings`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
  - Pre-commit: `pnpm build`

- [x] 2. Zod Validation Schemas for Property-Lock Endpoints

  **What to do**:
  - Add to `src/gateway/validation/schemas.ts` (append at end, before any closing exports):
    - `CreatePropertyLockSchema`: Zod object with `property_external_id` (string, min 1), `lock_external_id` (string, min 1), `lock_name` (string, min 1), `lock_provider` (string, default `'sifely'`), `lock_role` (string, optional), `property_type` (string, min 1 — `HOME`, `ROOM`, `MULTI_HOME`, or `BUNDLE`), `property_name` (string, min 1 — e.g. "271-GIN-1"), `passcode_name` (string, optional — custom override), `lock_metadata` (zod record/any, optional)
    - `UpdatePropertyLockSchema`: Zod object with all fields from Create but all optional (`.partial()`)
    - `TenantPropertyLockParamSchema`: extends `TenantIdParamSchema` with `lockId` using `uuidField()`
    - Export types: `CreatePropertyLock`, `UpdatePropertyLock`
    - Export a `parseCreatePropertyLock()` helper function following the pattern of `parseHostfullyWebhook()` (Zod safeParse + error message extraction)

  **Must NOT do**:
  - Do NOT use `z.string().uuid()` for params — use `uuidField()` from the same file
  - Do NOT add enum validation for `lock_provider` — keep it as a free string

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 4, 5)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/validation/schemas.ts:322-341` — `HostfullyWebhookPayloadSchema` + `parseHostfullyWebhook()`: exact pattern to follow for new schemas and parse helpers
  - `src/gateway/validation/schemas.ts:1-30` — imports and `uuidField()` helper function: use this for UUID params, NOT `z.string().uuid()`
  - `src/gateway/validation/schemas.ts:83-100` — `CreateProjectSchema` and `TenantProjectParamSchema`: similar CRUD schema structure to replicate

  **WHY Each Reference Matters**:
  - The `parseHostfullyWebhook()` function shows the exact safeParse + error extraction pattern — copy this for `parseCreatePropertyLock()`
  - `uuidField()` at line ~10 returns a loose UUID regex matcher that accepts all UUID formats, unlike `z.string().uuid()` which enforces RFC 4122 strictly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build passes with new schemas
    Tool: Bash
    Preconditions: Schema file updated
    Steps:
      1. Run `pnpm build`
      2. Assert exit 0
    Expected Result: No TypeScript errors
    Failure Indicators: Type errors in schemas.ts
    Evidence: .sisyphus/evidence/task-2-build-passes.txt

  Scenario: CreatePropertyLockSchema validates correctly
    Tool: Bash
    Preconditions: Schema file updated
    Steps:
      1. Run: `node -e "const s = require('./dist/gateway/validation/schemas.js'); console.log(JSON.stringify(s.CreatePropertyLockSchema.safeParse({property_external_id:'abc',lock_external_id:'123',lock_name:'Front Door'}).success))"`
      2. Assert output is `true`
      3. Run: `node -e "const s = require('./dist/gateway/validation/schemas.js'); console.log(JSON.stringify(s.CreatePropertyLockSchema.safeParse({}).success))"`
      4. Assert output is `false`
    Expected Result: Valid payload passes, empty payload fails
    Failure Indicators: Schema accepts empty payload or rejects valid payload
    Evidence: .sisyphus/evidence/task-2-schema-validation.txt
  ```

  **Commit**: NO (groups with commit 2)

- [x] 4. Sifely API Client Shell Tool

  **What to do**:
  - Create `src/worker-tools/locks/sifely-client.ts` — a standalone shell tool (NOT a library import) that wraps the Sifely TTLock API
  - Port from `/Users/victordozal/repos/real-estate/vlre-employee/skills/sifely-client/sifely-client.ts` (282 lines) — adapt to shell tool conventions
  - **Authentication**: POST `/system/smart/login` with query params `client_id`, `username`, `password`, `date` (epoch ms). Required headers: `Content-Type: application/json;charset=UTF-8`, `Origin: https://manager.sifely.com`, `Referer: https://manager.sifely.com/`, `isToken: false`. Response: `{ code: 200, data: { token } }` on success. Use `Authorization: Bearer {token}` for subsequent calls.
  - **CRITICAL API QUIRK**: Sifely returns HTTP 200 on auth failure. Must check `response.code !== 200` in the body, NOT HTTP status code. For list endpoints, success omits `code` field entirely — if `code` is present, it's an error.
  - **Commands** (via `--action` flag):
    - `--action list-passcodes --lock-id <id>`: GET `/v3/lock/listKeyboardPwd?lockId=&pageNo=1&pageSize=100&date=`
    - `--action list-access-records --lock-id <id> --start-date <ms> --end-date <ms>`: GET `/v3/lockRecord/list?lockId=&startDate=&endDate=&pageNo=1&pageSize=20&date=`
  - **Env vars required**: `SIFELY_CLIENT_ID` (default: `VLRE`), `SIFELY_USERNAME`, `SIFELY_PASSWORD`. Optional: `SIFELY_BASE_URL` (default: `https://app-smart-server.sifely.com`)
  - **Output**: JSON to stdout — passcodes as `LockPasscode[]` or access records as `AccessRecord[]`
  - **Error handling**: Auth failure → stderr + exit 1. API error → stderr with error code + exit 1.
  - **Add `--help` flag** with usage information
  - **Token is session-scoped** — authenticate once per invocation, reuse for all calls in that session. No persistent cache.

  **Must NOT do**:
  - Do NOT add passcode mutation methods (create/update/delete)
  - Do NOT add circuit breaker or caching
  - Do NOT add gateway queue / mutex
  - Do NOT log `SIFELY_PASSWORD` or passcode values — only log lockId and action
  - Do NOT use `console.log` — use `process.stdout.write` for output, `process.stderr.write` for errors

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 5)
  - **Blocks**: Tasks 7, 8, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/sifely-client/sifely-client.ts` — **PRIMARY SOURCE**: 282-line Sifely client to port. Contains exact auth flow, token caching, API quirk handling, passcode/access record methods. Copy the core logic, wrap in shell tool arg parsing.
  - `src/worker-tools/hostfully/get-reservations.ts` — Shell tool pattern: manual arg parsing, env var validation, JSON stdout output, error exit codes
  - `src/worker-tools/hostfully/get-property.ts:1-151` — Another shell tool reference: shows parallel fetch pattern, error handling, output shape

  **Type References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/lock-types.ts:10-29` — `LockPasscode` and `AccessRecord` interfaces: define inline in the shell tool (no shared types file needed for shell tools)

  **External References**:
  - Sifely API base URL: `https://app-smart-server.sifely.com`
  - Auth endpoint: `POST /system/smart/login` (query params, NOT JSON body)
  - Passcode list: `GET /v3/lock/listKeyboardPwd` — response: `{ list: LockPasscode[] }` (no `code` field on success)
  - Access records: `GET /v3/lockRecord/list` — response: `{ list: AccessRecord[] }` (same pattern)
  - **CRITICAL**: `/v3/gateway/list` does NOT exist — do NOT implement it

  **WHY Each Reference Matters**:
  - The standalone MVP client has already solved all Sifely API quirks (HTTP 200 auth failure, missing code field on success, token format). Port this exactly rather than reimplementing from docs.
  - Shell tool pattern (get-reservations.ts) shows exactly how to structure arg parsing, env var validation, and output — match this style.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tool prints help text
    Tool: Bash
    Preconditions: File exists at src/worker-tools/locks/sifely-client.ts
    Steps:
      1. Run `tsx src/worker-tools/locks/sifely-client.ts --help`
      2. Assert exit code 0
      3. Assert stdout contains "Usage:" and "--action" and "--lock-id"
    Expected Result: Help text printed, exit 0
    Failure Indicators: Exit 1, no output, missing flags in help
    Evidence: .sisyphus/evidence/task-4-help.txt

  Scenario: Missing env var exits with error
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run `SIFELY_USERNAME="" tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id 12345`
      2. Assert exit code 1
      3. Assert stderr contains "SIFELY_USERNAME"
    Expected Result: Exit 1 with clear error message
    Failure Indicators: Exit 0, silent failure, wrong env var name in error
    Evidence: .sisyphus/evidence/task-4-missing-env.txt

  Scenario: Missing --action flag exits with error
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run `SIFELY_CLIENT_ID=x SIFELY_USERNAME=x SIFELY_PASSWORD=x tsx src/worker-tools/locks/sifely-client.ts --lock-id 12345`
      2. Assert exit code 1
      3. Assert stderr contains "--action"
    Expected Result: Exit 1 with error about missing action
    Failure Indicators: Exit 0, unrelated error
    Evidence: .sisyphus/evidence/task-4-missing-action.txt
  ```

  **Commit**: YES (group 3)
  - Message: `feat(worker-tools): add Sifely API client and lock diagnosis shell tools`
  - Files: `src/worker-tools/locks/sifely-client.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Hostfully Custom Data Helper — Door Code Fetch

  **What to do**:
  - Create `src/worker-tools/locks/hostfully-door-code.ts` — a small shell tool that fetches the door code from Hostfully's custom data API
  - **Endpoint**: `GET /api/v3.2/custom-data?propertyUid={uid}` with header `X-Api-Key: {HOSTFULLY_API_KEY}`
  - **Response parsing**: Returns array of `{ customDataField: { uid, name }, text }`. Find entry where `customDataField.name === "door_code"`. Return the `text` value.
  - **CLI interface**: `tsx /tools/locks/hostfully-door-code.ts --property-id <hostfully-property-uid>`
  - **Output**: `{ "doorCode": "1234" }` on success, `{ "doorCode": null }` if no door_code field found
  - **Env vars**: `HOSTFULLY_API_KEY` (required), `HOSTFULLY_API_URL` (optional, default: `https://api.hostfully.com`)
  - **Error handling**: Missing env var → exit 1. API error → exit 1. No door_code field → exit 0 with `{ "doorCode": null }` (not an error)
  - **Add `--help` flag**

  **Must NOT do**:
  - Do NOT modify `src/worker-tools/hostfully/get-property.ts`
  - Do NOT use `console.log`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-property.ts:1-151` — Hostfully API call pattern: uses `HOSTFULLY_API_KEY` header, `HOSTFULLY_API_URL` base URL, error handling, JSON output
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/hostfully-client/client.ts:342` — `getDoorCode()` method: shows exact endpoint, header, and response parsing for custom data

  **WHY Each Reference Matters**:
  - `get-property.ts` shows the exact Hostfully auth header pattern (`X-Api-Key`) and base URL env var
  - `getDoorCode()` in the standalone MVP shows the exact field name to search for (`door_code`) and how to parse the custom data response

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tool prints help text
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run `tsx src/worker-tools/locks/hostfully-door-code.ts --help`
      2. Assert exit 0 and stdout contains "Usage:"
    Expected Result: Help text printed
    Evidence: .sisyphus/evidence/task-5-help.txt

  Scenario: Missing HOSTFULLY_API_KEY exits with error
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. Run `HOSTFULLY_API_KEY="" tsx src/worker-tools/locks/hostfully-door-code.ts --property-id test`
      2. Assert exit 1, stderr contains "HOSTFULLY_API_KEY"
    Expected Result: Clear error about missing env var
    Evidence: .sisyphus/evidence/task-5-missing-env.txt
  ```

  **Commit**: YES (group 3)
  - Message: `feat(worker-tools): add Sifely API client and lock diagnosis shell tools`
  - Files: `src/worker-tools/locks/hostfully-door-code.ts`

- [x] 3. Admin API CRUD Routes for Property-Lock Mappings

  **What to do**:
  - Create `src/gateway/routes/admin-property-locks.ts` following the exact structure of `src/gateway/routes/admin-projects.ts`
  - **Routes** (all behind `requireAdminKey` middleware):
    - `POST /admin/tenants/:tenantId/property-locks` — create a property-lock mapping. Validate body with `CreatePropertyLockSchema`. Return 201 + created record.
    - `GET /admin/tenants/:tenantId/property-locks` — list all mappings for tenant. Optional query param `?property_id=<id>` to filter by property_external_id. Return 200 + `{ propertyLocks: [...] }`.
    - `GET /admin/tenants/:tenantId/property-locks/:lockId` — get single mapping. Return 200 or 404.
    - `PATCH /admin/tenants/:tenantId/property-locks/:lockId` — update mapping. Validate body with `UpdatePropertyLockSchema`. Return 200 + updated record.
    - `DELETE /admin/tenants/:tenantId/property-locks/:lockId` — delete mapping. Return 204.
  - All routes tenant-scoped: every Prisma query includes `tenant_id` filter from URL param
  - Register routes in `src/gateway/server.ts` `buildApp()`: import `adminPropertyLockRoutes` and add `app.use(adminPropertyLockRoutes())` alongside existing route registrations (around line 156)
  - Error handling: 400 for validation errors, 404 for not found, 409 for conflicts (if any)

  **Must NOT do**:
  - Do NOT use `z.string().uuid()` — use `uuidField()` from schemas
  - Do NOT add routes that bypass `requireAdminKey`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9)
  - **Blocks**: Tasks 6, 14
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-projects.ts:1-179` — **PRIMARY PATTERN**: exact structure to follow for CRUD admin routes — Router setup, Prisma usage, error handling, validation, response shapes
  - `src/gateway/server.ts:150-165` — Route registration pattern: how routes are imported and mounted with `app.use()`
  - `src/gateway/middleware/admin-auth.ts` — `requireAdminKey` middleware: use on all routes

  **Type References**:
  - `src/gateway/validation/schemas.ts` — `CreatePropertyLockSchema`, `TenantPropertyLockParamSchema` (created in Task 2)

  **WHY Each Reference Matters**:
  - `admin-projects.ts` is the exact pattern to follow — same CRUD structure, same Prisma patterns, same error handling. Copy the structure, change the model/schema names.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create a property-lock mapping
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700, migration applied
    Steps:
      1. curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/property-locks" -d '{"property_external_id":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2","lock_external_id":"12345","lock_name":"Front Door","lock_provider":"sifely"}'
      2. Assert HTTP 201
      3. Assert response JSON has fields: id, tenant_id, property_external_id, lock_external_id, lock_name, lock_provider
    Expected Result: 201 with created record
    Failure Indicators: 400, 500, missing fields in response
    Evidence: .sisyphus/evidence/task-3-create.txt

  Scenario: List mappings for tenant
    Tool: Bash (curl)
    Preconditions: At least one mapping exists
    Steps:
      1. curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/property-locks"
      2. Assert HTTP 200
      3. Assert response has `propertyLocks` array with at least 1 entry
    Expected Result: 200 with list of mappings
    Evidence: .sisyphus/evidence/task-3-list.txt

  Scenario: List mappings filtered by property_id
    Tool: Bash (curl)
    Preconditions: Mapping exists for property c960c8d2...
    Steps:
      1. curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/property-locks?property_id=c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
      2. Assert all results have matching property_external_id
    Expected Result: Filtered results
    Evidence: .sisyphus/evidence/task-3-filter.txt

  Scenario: Delete a mapping
    Tool: Bash (curl)
    Preconditions: Mapping exists with known ID
    Steps:
      1. Get the mapping ID from the list response
      2. curl -s -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/property-locks/{id}"
      3. Assert HTTP 204
    Expected Result: 204 No Content
    Evidence: .sisyphus/evidence/task-3-delete.txt

  Scenario: Reject request without admin key
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/property-locks"
      2. Assert HTTP 401
    Expected Result: 401 Unauthorized
    Evidence: .sisyphus/evidence/task-3-no-auth.txt
  ```

  **Commit**: YES (group 2)
  - Message: `feat(gateway): add admin CRUD routes for property-lock mappings`
  - Files: `src/gateway/routes/admin-property-locks.ts`, `src/gateway/validation/schemas.ts`, `src/gateway/server.ts`
  - Pre-commit: `pnpm build`

- [x] 7. Dockerfile — COPY Lock Tools into Image

  **What to do**:
  - Add lines to `Dockerfile` after the knowledge_base section (after line 92):
    ```dockerfile
    RUN mkdir -p /tools/locks
    COPY --from=builder /build/src/worker-tools/locks/sifely-client.ts /tools/locks/sifely-client.ts
    COPY --from=builder /build/src/worker-tools/locks/hostfully-door-code.ts /tools/locks/hostfully-door-code.ts
    COPY --from=builder /build/src/worker-tools/locks/diagnose-access.ts /tools/locks/diagnose-access.ts
    ```
  - No `npm install` needed — all lock tools use native `fetch()` only
  - Note: `diagnose-access.ts` doesn't exist yet (Task 8) — add the COPY line now and it will work once the file is created

  **Must NOT do**:
  - Do NOT add npm install for locks tools — no external deps needed
  - Do NOT copy `register-webhook.ts`-style setup scripts — only runtime tools go in the image

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 8, 9)
  - **Blocks**: None (Docker image rebuild is a final step, not a blocker)
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `Dockerfile:79-92` — Existing tool COPY pattern: `mkdir -p /tools/{service}` + `COPY --from=builder /build/src/worker-tools/{service}/*.ts /tools/{service}/*.ts`. Follow this exactly.

  **WHY Each Reference Matters**:
  - The Dockerfile uses explicit per-file COPY (no globs). Each new .ts file needs its own COPY line.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dockerfile has correct COPY lines
    Tool: Bash
    Steps:
      1. grep -n "tools/locks" Dockerfile
      2. Assert mkdir, sifely-client.ts COPY, hostfully-door-code.ts COPY, diagnose-access.ts COPY all present
    Expected Result: 4 lines found (mkdir + 3 COPY)
    Evidence: .sisyphus/evidence/task-7-dockerfile-lines.txt
  ```

  **Commit**: YES (group 3)
  - Message: `feat(worker-tools): add Sifely API client and lock diagnosis shell tools`
  - Files: `Dockerfile`

- [x] 8. Diagnosis Orchestrator Shell Tool

  **What to do**:
  - Create `src/worker-tools/locks/diagnose-access.ts` — the main diagnosis tool that orchestrates everything
  - **CLI interface**: `tsx /tools/locks/diagnose-access.ts --property-id <hostfully-property-uid>`
  - **Orchestration flow**:
    1. Validate env vars: `HOSTFULLY_API_KEY`, `SIFELY_CLIENT_ID`, `SIFELY_USERNAME`, `SIFELY_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TENANT_ID`
    2. Fetch Hostfully door code — call Hostfully custom data API directly (`GET /api/v3.2/custom-data?propertyUid=`). If no door code found, return `{ diagnosis: "NO_DOOR_CODE", ... }` and exit 0.
    3. Query `property_locks` table via PostgREST — `GET {SUPABASE_URL}/rest/v1/property_locks?tenant_id=eq.{TENANT_ID}&property_external_id=eq.{propertyId}` with `apikey` + `Authorization: Bearer` headers. If no mappings found, return `{ diagnosis: "NO_LOCK_MAPPING", ... }` and exit 0.
    4. Authenticate with Sifely — POST `/system/smart/login` (same auth logic as `sifely-client.ts`)
    5. For each lock: fetch passcodes + access records (last 2 hours) in parallel using `Promise.all`. Sifely failure for one lock is non-fatal — continue with others.
    6. **CRITICAL — Passcode name resolution on shared locks**: A single Sifely lock can serve multiple properties (e.g., a front door shared by 4 rooms). Each property has its own named passcode on the lock. The diagnosis tool must:
       - Derive the expected passcode name from the `property_locks` row: if `passcode_name` is set, use it; otherwise derive from `property_type` + `property_name`:
         - `HOME` → `permanent-visitor-home`
         - `ROOM` → extract room number from last segment of `property_name` (e.g. "271-GIN-1" → 1) → `permanent-visitor-room-1`
         - `BUNDLE` or `MULTI_HOME` → `permanent-visitor-bundle`
       - Filter permanent passcodes (type=2) to only those whose `keyboardPwdName` matches the expected name
       - Compare the **filtered** passcode's code against the Hostfully door code
       - If NO passcode with the expected name exists, flag as `PASSCODE_NOT_FOUND` (different from mismatch)
    7. Output JSON diagnosis to stdout

  - **Output JSON shape** (the `LockDiagnosis` type):
    ```json
    {
      "propertyId": "c960c8d2-...",
      "hostfullyDoorCode": "1234",
      "expectedPasscodeName": "permanent-visitor-home",
      "locks": [
        {
          "lockId": "67890",
          "lockName": "219-PAU-HOME-FRONT-DOOR",
          "lockRole": "FRONT_DOOR",
          "expectedPasscodeName": "permanent-visitor-home",
          "matchedPasscode": { "keyboardPwdId": 1, "keyboardPwd": "1234", "keyboardPwdType": 2, "keyboardPwdName": "permanent-visitor-home" },
          "allPermanentPasscodes": [{ "keyboardPwdId": 1, "keyboardPwd": "1234", "keyboardPwdType": 2, "keyboardPwdName": "permanent-visitor-home" }],
          "matchesHostfully": true,
          "passcodeFound": true,
          "accessRecords": [{ "recordId": 1, "recordType": 4, "success": 1, "keyboardPwd": "1234", "lockDate": 1714500000000 }]
        }
      ],
      "hasMismatch": false,
      "diagnosisSummary": "✅ All lock codes match the door code (1234)\n  ✅ Front Door: 1 successful entry(ies)"
    }
          ],
          "matchesHostfully": true,
          "accessRecords": [
            {
              "recordId": 1,
              "recordType": 4,
              "success": 1,
              "keyboardPwd": "1234",
              "lockDate": 1714500000000
            }
          ]
        }
      ],
      "hasMismatch": false,
      "diagnosisSummary": "✅ All lock codes match the door code (1234)\n  ✅ Front Door: 1 successful entry(ies)"
    }
    ```
  - **Note**: Do NOT import from `sifely-client.ts` or `hostfully-door-code.ts`. This is a self-contained shell tool. Inline the Sifely auth + API calls and Hostfully door code fetch. Shell tools are standalone scripts — no inter-tool imports in the worker container.
  - **Add `--help` flag**

  **Must NOT do**:
  - Do NOT import from other shell tools — inline all logic
  - Do NOT add passcode mutation logic
  - Do NOT log passcode values or Sifely password
  - Do NOT use `console.log` — use `process.stdout.write` + `process.stderr.write`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 7, 9)
  - **Blocks**: Tasks 10, 11, 12, 13
  - **Blocked By**: Tasks 1, 4, 5

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/lock-diagnosis/diagnosis.ts:1-118` — **PRIMARY SOURCE**: Full diagnosis logic to port — Hostfully door code fetch, lock iteration, passcode comparison, access record summary, mismatch detection. Port the `diagnoseLockAccess()` function's logic into the shell tool's `main()`.
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/sifely-client/sifely-client.ts` — Sifely auth flow and API calls: inline the `login()`, `listPasscodes()`, and `listAccessRecords()` methods
  - `src/worker-tools/platform/report-issue.ts` — PostgREST query pattern: shows how to query Supabase tables from a shell tool using `fetch()` with `apikey` + `Authorization` headers
  - `src/worker-tools/knowledge_base/search.ts` — Another PostgREST query example: `SUPABASE_URL` + `SUPABASE_SECRET_KEY` env var usage

  **Type References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/lock-types.ts:31-41` — `LockDiagnosis` interface: the output shape base (extend with `expectedPasscodeName`, `passcodeFound`, `matchedPasscode` fields)

  **External References**:
  - `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/code-rotation/utils/passcode-naming.util.ts` — `getPasscodeName()` function: the naming convention to implement inline. HOME→`permanent-visitor-home`, ROOM-N→`permanent-visitor-room-N`, BUNDLE→`permanent-visitor-bundle`
  - `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/code-rotation/passcode-resolution.service.ts` — `getExpectedPasscodeName()` and the dual-lookup logic (custom name OR convention name): shows how to resolve which passcode belongs to a property on a shared lock
  - `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/data/properties.json` — All 36 VLRE properties with Hostfully UIDs, types, lock assignments, Sifely lock IDs

  **WHY Each Reference Matters**:
  - `diagnosis.ts` has the proven diagnosis algorithm — but it does NOT filter by passcode name (it checks ALL permanent passcodes). The ai-employee version MUST add passcode name filtering to handle shared locks correctly.
  - `passcode-naming.util.ts` defines the exact naming convention — inline this logic (it's a simple function)
  - `passcode-resolution.service.ts` shows the dual-lookup pattern: check `passcode_name` (custom override) first, then fall back to convention name derived from `property_type`
  - `report-issue.ts` shows exactly how PostgREST queries work from shell tools (headers, URL construction, response parsing)
  - `LockDiagnosis` type defines the output contract — the AI employee parses this to craft its response

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tool prints help text
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/locks/diagnose-access.ts --help`
      2. Assert exit 0, stdout contains "Usage:" and "--property-id"
    Expected Result: Help text printed
    Evidence: .sisyphus/evidence/task-8-help.txt

  Scenario: Missing env vars exit with clear error
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/locks/diagnose-access.ts --property-id test` (no env vars)
      2. Assert exit 1, stderr lists missing env vars
    Expected Result: Exit 1 with env var validation error
    Evidence: .sisyphus/evidence/task-8-missing-env.txt

  Scenario: No lock mapping returns NO_LOCK_MAPPING diagnosis
    Tool: Bash
    Preconditions: DB running, no property_locks rows for "nonexistent-property"
    Steps:
      1. Run with all env vars set, --property-id "nonexistent-property"
      2. Assert exit 0
      3. Parse JSON stdout — assert field `locks` is empty array, `diagnosisSummary` contains "No locks found" or similar
    Expected Result: Exit 0 with empty locks, graceful message
    Evidence: .sisyphus/evidence/task-8-no-mapping.txt
  ```

  **Commit**: YES (group 3)
  - Message: `feat(worker-tools): add Sifely API client and lock diagnosis shell tools`
  - Files: `src/worker-tools/locks/diagnose-access.ts`

- [x] 9. Unit Tests — Sifely API Client

  **What to do**:
  - Create `tests/worker-tools/locks/sifely-client.test.ts`
  - Follow the test pattern from `tests/worker-tools/hostfully/get-reservations.test.ts`:
    - Start an in-process mock HTTP server (`http.createServer`) that simulates Sifely API responses
    - Run the tool via `execFile('npx', ['tsx', SCRIPT_PATH, ...args])` with env vars pointing to mock server
    - Parse stdout JSON and assert structure/values
  - **Test cases** (minimum):
    1. `--help` flag: exit 0, stdout contains usage
    2. `--action list-passcodes --lock-id 12345`: mock returns passcodes → assert correct JSON output with `keyboardPwdId`, `keyboardPwd`, `keyboardPwdType` fields
    3. `--action list-access-records --lock-id 12345 --start-date X --end-date Y`: mock returns records → assert correct JSON
    4. Missing `SIFELY_USERNAME` env var: exit 1, stderr mentions env var
    5. Missing `--action` flag: exit 1, stderr mentions flag
    6. Sifely auth failure (HTTP 200, body `{ code: -3, msg: "token expired" }`): exit 1, stderr contains auth error
    7. Sifely API error on list (body `{ code: -2012, msg: "gateway offline" }`): exit 1, stderr contains error
  - **Mock server patterns**:
    - Login endpoint: return `{ code: 200, data: { token: "mock-token" } }` on success
    - List endpoint: return `{ list: [...] }` (no `code` field) on success
    - Error endpoint: return `{ code: -2012, msg: "gateway offline" }` for error cases

  **Must NOT do**:
  - Do NOT use real Sifely API credentials in unit tests
  - Do NOT use jest — use Vitest (existing framework)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 7, 8)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `tests/worker-tools/hostfully/get-reservations.test.ts` — **PRIMARY PATTERN**: exact test structure to follow — mock HTTP server, execFile, env vars, stdout parsing, exit code assertions

  **WHY Each Reference Matters**:
  - This test file is the canonical pattern for shell tool testing in this codebase — copy its structure exactly (server setup, execFile wrapper, env var injection, cleanup)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All Sifely client tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/worker-tools/locks/sifely-client.test.ts`
      2. Assert exit 0
      3. Assert 7+ tests pass
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-9-tests-pass.txt
  ```

  **Commit**: YES (group 6)
  - Message: `test(locks): add tests for Sifely client, diagnosis tool, and admin routes`
  - Files: `tests/worker-tools/locks/sifely-client.test.ts`
  - Pre-commit: `pnpm test -- --run tests/worker-tools/locks/sifely-client.test.ts`

- [x] 6. Seed Data — VLRE Property-Lock Mappings + Sifely Credentials

  **What to do**:
  - Add VLRE property-lock mapping seed data to `prisma/seed.ts`
  - Use the Prisma `upsert` pattern (matching on `tenant_id` + `property_external_id` + `lock_external_id`)
  - **VLRE property-lock mappings**: Seed ALL 36 VLRE properties with their actual Sifely lock IDs. The complete mapping data is in `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/data/properties.json` — this is the authoritative source. Key data points for the test property (`c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`) and all other properties are listed below. Use `createMany` or individual `upsert` calls.
  - **CRITICAL**: Each row must include `property_type` (HOME/ROOM/MULTI_HOME/BUNDLE), `property_name` (e.g. "271-GIN-1"), and `lock_role` (derived from lock name: contains "FRONT-DOOR" → FRONT_DOOR, "BACK-DOOR" → BACK_DOOR, "-ROOM-" → ROOM_DOOR, else COMMON_AREA). Optional `passcode_name` can be null (convention is used).
  - **Reference data file**: `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/data/properties.json` — read this file to get all property names, Hostfully UIDs, types, and lock assignments with Sifely lock IDs
  - **Key test mappings** (subset — full list is in properties.json):
    - `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` (test property from AGENTS.md) — look up in properties.json
    - `3fa27670-f4f6-443b-a412-6078d4f5517e` (219-PAU-HOME) → locks: 5280922 (FRONT_DOOR), 5197968 (BACK_DOOR)
    - `039bfa35-70d4-4c9b-89a3-4f36fe7f1441` (271-GIN-1, ROOM) → locks: 4831824 (FRONT_DOOR, shared), 5002738 (ROOM_DOOR)
    - `40b69579-efba-47b5-b566-1c96f0f85ac7` (3401-BRE-1, ROOM) → locks: 5447540 (FRONT_DOOR, shared), 4302846 (BACK_DOOR, shared), 4318724 (ROOM_DOOR)
  - **Sifely credentials**: Do NOT seed actual credentials. Instead, add a comment block in `seed.ts` documenting the required `tenant_secrets` keys and a `scripts/` section in the plan summary showing how to store them via admin API:
    ```bash
    # Store Sifely credentials for VLRE tenant
    curl -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/sifely_client_id" \
      -d '{"value":"VLRE"}'
    curl -X PUT ... /secrets/sifely_username -d '{"value":"<email>"}'
    curl -X PUT ... /secrets/sifely_password -d '{"value":"<password>"}'
    ```
  - Update `.env.example` with documentation comments for Sifely-related env vars (these are stored in tenant_secrets, not .env, but document them for reference):
    ```
    # Sifely Smart Lock API (stored in tenant_secrets, injected automatically)
    # SIFELY_CLIENT_ID=VLRE
    # SIFELY_USERNAME=admin@vlrealestate.co
    # SIFELY_PASSWORD=<md5-hash-of-password>
    # SIFELY_BASE_URL=https://app-smart-server.sifely.com
    ```

  **Must NOT do**:
  - Do NOT hardcode real Sifely credentials in seed.ts
  - Do NOT use sequential numeric IDs — use UUIDs matching the existing pattern

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12, 14)
  - **Blocks**: Task 13
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:95-135` — VLRE tenant seeding with upsert pattern: shows how to upsert records with hardcoded UUIDs
  - `prisma/seed.ts:320-350` — Knowledge base entry seeding: shows the upsert pattern for tenant-scoped records

  **WHY Each Reference Matters**:
  - The seed file uses `upsert` with hardcoded UUIDs so it's idempotent — follow this exact pattern for property-lock mappings

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs without errors
    Tool: Bash
    Steps:
      1. Run `pnpm prisma db seed`
      2. Assert exit 0
      3. Query: psql ... -c "SELECT count(*) FROM property_locks WHERE tenant_id = '00000000-0000-0000-0000-000000000003'"
      4. Assert count >= 1
    Expected Result: Seed creates property-lock mappings
    Evidence: .sisyphus/evidence/task-6-seed.txt

  Scenario: Seed is idempotent
    Tool: Bash
    Steps:
      1. Run `pnpm prisma db seed` twice
      2. Assert exit 0 both times
      3. Assert same count both times (no duplicates)
    Expected Result: No duplicate rows created
    Evidence: .sisyphus/evidence/task-6-idempotent.txt
  ```

  **Commit**: YES (group 5)
  - Message: `chore(seed): add VLRE property-lock mappings and update archetype instructions`
  - Files: `prisma/seed.ts`, `.env.example`

- [x] 10. Slack Approval Card — Add Diagnosis Section

  **What to do**:
  - Modify `src/worker-tools/slack/post-guest-approval.ts`:
    - Add `diagnosis` (string, optional) to `GuestApprovalParams` interface
    - Add `--diagnosis` flag to `parseArgs()` function (string value — JSON string)
    - In `buildGuestApprovalBlocks()`, if `params.diagnosis` is provided:
      - Parse the JSON string
      - Add a new section block BEFORE the "Original Message" section with header "🔒 Lock Diagnosis" containing the `diagnosisSummary` field
      - If `hasMismatch` is true, add `:warning: CODE MISMATCH` as a prominent prefix
      - Keep diagnosis display concise — just the summary text, not the full lock details
    - The `--diagnosis` flag is optional — existing calls without it continue to work unchanged

  **Must NOT do**:
  - Do NOT make `--diagnosis` required — it's optional for non-lock-related messages
  - Do NOT change the existing block structure or button actions
  - Do NOT break the `--dry-run` mode — diagnosis section must appear in dry-run output too

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 11, 12, 14)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-guest-approval.ts:120-218` — `buildGuestApprovalBlocks()`: the function to modify. Add the diagnosis section block after the `conversationSummary` block (line 153-161) and before "Original Message" (line 163).
  - `src/worker-tools/slack/post-guest-approval.ts:48-84` — `parseArgs()`: add `--diagnosis` flag here, same pattern as `--conversation-summary`

  **WHY Each Reference Matters**:
  - The exact insertion point matters: diagnosis should appear between conversation summary and original message for visual flow in Slack

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dry-run with diagnosis flag shows diagnosis block
    Tool: Bash
    Steps:
      1. Run: tsx src/worker-tools/slack/post-guest-approval.ts --channel C123 --task-id uuid --guest-name "Test Guest" --property-name "Beach House" --check-in 2026-06-01 --check-out 2026-06-05 --booking-channel Airbnb --original-message "I cant get in" --draft-response "Your code is 1234" --confidence 0.95 --category ACCESS_ISSUE --lead-uid l1 --thread-uid t1 --message-uid m1 --diagnosis '{"hasMismatch":false,"diagnosisSummary":"All codes match (1234)"}' --dry-run
      2. Parse stdout JSON
      3. Assert `blocks` array contains a section with text containing "Lock Diagnosis"
      4. Assert `blocks` array contains text "All codes match (1234)"
    Expected Result: Diagnosis block appears in dry-run output
    Evidence: .sisyphus/evidence/task-10-diagnosis-block.txt

  Scenario: Dry-run without diagnosis flag works unchanged
    Tool: Bash
    Steps:
      1. Run same command without --diagnosis flag
      2. Assert blocks do NOT contain "Lock Diagnosis"
    Expected Result: No diagnosis block when flag absent
    Evidence: .sisyphus/evidence/task-10-no-diagnosis.txt

  Scenario: Mismatch diagnosis shows warning
    Tool: Bash
    Steps:
      1. Run with --diagnosis '{"hasMismatch":true,"diagnosisSummary":"⚠️ CODE MISMATCH..."}'
      2. Assert blocks contain "MISMATCH" text
    Expected Result: Warning displayed prominently
    Evidence: .sisyphus/evidence/task-10-mismatch.txt
  ```

  **Commit**: YES (group 4)
  - Message: `feat(worker-tools): add lock diagnosis to Slack approval card`
  - Files: `src/worker-tools/slack/post-guest-approval.ts`
  - Pre-commit: `pnpm build`

- [x] 11. Update Guest-Messaging Archetype Instructions

  **What to do**:
  - Modify `prisma/seed.ts` — update the guest-messaging archetype's `instructions` field for VLRE (archetype ID `00000000-0000-0000-0000-000000000013`)
  - Add a new section to the instructions text that tells the AI employee:
    - **WHEN** the guest message is about door/lock/access issues (category contains "access", "door", "lock", "code", "can't get in", "doesn't work")
    - **THEN** run the diagnosis tool BEFORE drafting a response:
      ```
      tsx /tools/locks/diagnose-access.ts --property-id "<hostfully-property-uid>"
      ```
    - Parse the JSON output and use it to craft a specific response:
      - If `hasMismatch: true` → inform PM about the mismatch in your response
      - If `hasMismatch: false` → reassure with "the code matches what's programmed on the lock" and suggest troubleshooting (try last 4 digits, check battery, etc.)
      - Include the `diagnosisSummary` in the draft response for context
    - **ALWAYS** pass the diagnosis JSON to the approval card: add `--diagnosis '<json>'` flag when calling `post-guest-approval.ts`
  - Also add a documentation section about the diagnosis tool's CLI usage and expected output shape

  **Must NOT do**:
  - Do NOT modify the system_prompt (persona) — only modify `instructions`
  - Do NOT change the archetype for DozalDevs — only VLRE

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 10, 12, 14)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — VLRE archetype upsert (archetype ID `00000000-0000-0000-0000-000000000013`): the `instructions` field to modify
  - `prisma/prompts/guest-messaging.ts:216` — Existing instruction about door codes: "ALWAYS include the door code in your response when it's an access-related question" — integrate with new diagnosis instructions

  **WHY Each Reference Matters**:
  - The existing instruction about door codes must be enhanced (not duplicated) with the diagnosis tool workflow

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Instructions contain diagnosis tool reference
    Tool: Bash
    Steps:
      1. Run `pnpm prisma db seed`
      2. Query: psql ... -c "SELECT instructions FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000013'" | grep "diagnose-access"
      3. Assert "diagnose-access" appears in instructions
    Expected Result: Diagnosis tool referenced in instructions
    Evidence: .sisyphus/evidence/task-11-instructions.txt

  Scenario: Instructions include both diagnosis and approval card --diagnosis flag
    Tool: Bash
    Steps:
      1. Query instructions text
      2. Assert contains "--diagnosis" (the approval card flag)
      3. Assert contains "diagnose-access" (the tool name)
    Expected Result: Both references present
    Evidence: .sisyphus/evidence/task-11-both-refs.txt
  ```

  **Commit**: YES (group 5)
  - Message: `chore(seed): add VLRE property-lock mappings and update archetype instructions`
  - Files: `prisma/seed.ts`

- [x] 12. Unit Tests — Diagnosis Tool

  **What to do**:
  - Create `tests/worker-tools/locks/diagnose-access.test.ts`
  - Follow the same mock HTTP server + `execFile` pattern as Task 9
  - Need TWO mock servers: one for Hostfully API (custom data), one for Sifely API (login + passcodes + access records). Also need to mock PostgREST for `property_locks` query.
  - **Test cases** (minimum):
    1. `--help` flag: exit 0, stdout contains usage
    2. Missing `--property-id`: exit 1
    3. Missing env vars: exit 1, lists missing vars
    4. No lock mapping in DB (PostgREST returns empty array): exit 0, JSON output has empty `locks` array and appropriate summary
    5. No door code in Hostfully (custom data returns empty or no "door_code" field): exit 0, JSON mentions no door code
    6. Happy path — matching codes: mock Hostfully returns door code "1234", mock PostgREST returns one lock mapping (property_type=HOME), mock Sifely returns permanent passcode with name "permanent-visitor-home" and code "1234" → `hasMismatch: false`, `diagnosisSummary` contains "match"
    7. Mismatch — different codes: mock Hostfully returns "1234", mock Sifely returns permanent passcode "permanent-visitor-home" with code "5678" → `hasMismatch: true`, summary mentions mismatch
    8. Shared lock — correct name matching: mock PostgREST returns lock mapping (property_type=ROOM, property_name="271-GIN-1"), mock Sifely returns 3 passcodes: "permanent-visitor-room-1" (code "1234"), "permanent-visitor-room-2" (code "5678"), "permanent-visitor-home" (code "9999"). Hostfully door code is "1234" → tool matches ONLY against "permanent-visitor-room-1" → `matchesHostfully: true`
    9. Passcode not found: mock Sifely returns passcodes but none named "permanent-visitor-home" → `passcodeFound: false` on that lock
    10. Sifely auth failure: mock login returns `{ code: -3 }` → exit 1
    11. Sifely per-lock failure (non-fatal): one lock's passcode fetch fails → other locks still diagnosed

  **Must NOT do**:
  - Do NOT use real API credentials
  - Do NOT import directly from the shell tool — test via `execFile`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 10, 11, 14)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `tests/worker-tools/locks/sifely-client.test.ts` — Sifely mock server setup (created in Task 9): reuse the mock response patterns
  - `tests/worker-tools/hostfully/get-reservations.test.ts` — Shell tool test pattern: mock server setup, execFile wrapper, env var injection

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All diagnosis tool tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/worker-tools/locks/diagnose-access.test.ts`
      2. Assert exit 0, 11+ tests pass
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-12-tests-pass.txt
  ```

  **Commit**: YES (group 6)
  - Message: `test(locks): add tests for Sifely client, diagnosis tool, and admin routes`
  - Files: `tests/worker-tools/locks/diagnose-access.test.ts`

- [x] 14. Admin API Route Tests

  **What to do**:
  - Create `tests/gateway/routes/admin-property-locks.test.ts` — unit tests for the route handlers
  - Create `tests/gateway/admin-property-locks-integration.test.ts` — integration test against the real test database
  - **Unit test cases** (using supertest + mock Prisma or in-memory):
    1. POST creates a property-lock mapping (201)
    2. POST with missing required fields returns 400
    3. POST without admin key returns 401
    4. GET lists all mappings for a tenant (200)
    5. GET with `?property_id=` filter returns filtered results
    6. GET single mapping by ID (200)
    7. GET non-existent mapping returns 404
    8. PATCH updates a mapping (200)
    9. DELETE removes a mapping (204)
  - **Integration test** (against real test DB — same pattern as `tests/gateway/hostfully-webhook.test.ts`):
    1. Create mapping via POST
    2. List mappings via GET — verify it appears
    3. Update mapping via PATCH — verify changes
    4. Delete mapping via DELETE — verify it's gone

  **Must NOT do**:
  - Do NOT skip tenant scoping tests — every test must verify tenant isolation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 10, 11, 12)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `tests/gateway/routes/hostfully.test.ts` — Unit test pattern for route handlers
  - `tests/gateway/hostfully-webhook.test.ts` — Integration test against real test DB

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All admin route tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/routes/admin-property-locks.test.ts`
      2. Run `pnpm test -- --run tests/gateway/admin-property-locks-integration.test.ts`
      3. Assert both exit 0
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-14-tests-pass.txt
  ```

  **Commit**: YES (group 6)
  - Message: `test(locks): add tests for Sifely client, diagnosis tool, and admin routes`
  - Files: `tests/gateway/routes/admin-property-locks.test.ts`, `tests/gateway/admin-property-locks-integration.test.ts`

- [x] 13. Integration Test — Diagnosis Tool with Real Test DB

  **What to do**:
  - Create `tests/worker-tools/locks/diagnose-access-integration.test.ts`
  - This test uses the real test database (`ai_employee_test`) to verify the full diagnosis flow:
    1. Insert a `property_locks` row directly via Prisma (test DB)
    2. Start mock HTTP servers for Hostfully custom data API and Sifely API
    3. Run `diagnose-access.ts` via `execFile` with env vars pointing to mock APIs + real test DB PostgREST
    4. Assert the tool reads the lock mapping from DB, calls mock APIs, and produces correct diagnosis JSON
  - **Test cases**:
    1. Full happy path: DB has lock mapping → Hostfully returns door code → Sifely returns matching passcode → output has `hasMismatch: false`
    2. Mismatch path: DB has lock mapping → codes don't match → output has `hasMismatch: true`
    3. No mapping: DB has no row for the property → output has empty locks array
  - **Setup/teardown**: Insert test rows in beforeEach, clean up in afterEach

  **Must NOT do**:
  - Do NOT use real Sifely credentials — mock the Sifely API
  - Do NOT use the dev database — use the test database only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 15, 16)
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 6, 8

  **References**:

  **Pattern References**:
  - `tests/gateway/hostfully-webhook.test.ts` — Integration test pattern: real test DB, Prisma setup/teardown, full request flow
  - `vitest.config.ts` — Test DB configuration: `DATABASE_URL` override, global setup

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Integration tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/worker-tools/locks/diagnose-access-integration.test.ts`
      2. Assert exit 0, 3+ tests pass
    Expected Result: All integration tests pass
    Evidence: .sisyphus/evidence/task-13-integration-pass.txt
  ```

  **Commit**: YES (group 6)
  - Message: `test(locks): add tests for Sifely client, diagnosis tool, and admin routes`
  - Files: `tests/worker-tools/locks/diagnose-access-integration.test.ts`

- [x] 15. Build + Full Test Suite Verification

  **What to do**:
  - Run `pnpm build` and assert exit 0
  - Run `pnpm test -- --run` and verify:
    - No new test failures (pre-existing failures in `container-boot.test.ts`, `inngest-serve.test.ts`, `lifecycle.test.ts`, `opencode-server.test.ts` are expected)
    - All new test files pass: `sifely-client.test.ts`, `diagnose-access.test.ts`, `diagnose-access-integration.test.ts`, `admin-property-locks.test.ts`, `admin-property-locks-integration.test.ts`
  - Run `pnpm lint` if available

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after T13)
  - **Blocks**: Task 16
  - **Blocked By**: All previous tasks

  **References**: None needed — standard verification

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run `pnpm build`
      2. Assert exit 0
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-15-build.txt

  Scenario: Test suite passes
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run`
      2. Count pass/fail
      3. Assert no new failures beyond pre-existing ones
    Expected Result: 530+ tests pass, no new failures
    Evidence: .sisyphus/evidence/task-15-tests.txt
  ```

  **Commit**: NO

- [x] 16. Story Map Update + Telegram Notification

  **What to do**:
  - Update `docs/planning/2026-04-21-2202-phase1-story-map.md` — mark all GM-15 acceptance criteria as `[x]`
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "📋 Plan gm15-smart-lock-diagnosis complete — All tasks done. Come back to review results."`
  - Commit the story map update

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after T15)
  - **Blocks**: None
  - **Blocked By**: Task 15

  **References**:

  **Pattern References**:
  - `docs/planning/2026-04-21-2202-phase1-story-map.md:967-988` — GM-15 section with acceptance criteria checkboxes to mark

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Story map updated
    Tool: Bash
    Steps:
      1. grep -c "\[x\]" in the GM-15 section of the story map
      2. Assert all 8 criteria are checked
    Expected Result: All GM-15 items marked [x]
    Evidence: .sisyphus/evidence/task-16-story-map.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run tsx scripts/telegram-notify.ts "..."
      2. Assert exit 0
    Expected Result: Notification sent
    Evidence: .sisyphus/evidence/task-16-telegram.txt
  ```

  **Commit**: YES (group 7)
  - Message: `docs(planning): mark GM-15 complete in story map`
  - Files: `docs/planning/2026-04-21-2202-phase1-story-map.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify Sifely client does NOT log passcode values or passwords.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (diagnosis tool → approval card → archetype instructions). Test edge cases: no mapping, no door code, Sifely auth failure. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no mutations, no circuit breaker, no get-property.ts changes, no console.log, no z.string().uuid(). Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Type                 | Scope                                                             | Files                                                                                                                                               | Pre-commit           |
| ------ | -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1      | `feat(prisma)`       | add PropertyLock model for property-to-lock mappings              | `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`                                                                                         | `pnpm build`         |
| 2      | `feat(gateway)`      | add admin CRUD routes for property-lock mappings                  | `src/gateway/routes/admin-property-locks.ts`, `src/gateway/validation/schemas.ts`, `src/gateway/server.ts`                                          | `pnpm build`         |
| 3      | `feat(worker-tools)` | add Sifely API client and lock diagnosis shell tools              | `src/worker-tools/locks/sifely-client.ts`, `src/worker-tools/locks/diagnose-access.ts`, `Dockerfile`                                                | `pnpm build`         |
| 4      | `feat(worker-tools)` | add lock diagnosis to Slack approval card                         | `src/worker-tools/slack/post-guest-approval.ts`                                                                                                     | `pnpm build`         |
| 5      | `chore(seed)`        | add VLRE property-lock mappings and update archetype instructions | `prisma/seed.ts`, `.env.example`                                                                                                                    | `pnpm build`         |
| 6      | `test(locks)`        | add tests for Sifely client, diagnosis tool, and admin routes     | `tests/worker-tools/locks/*.test.ts`, `tests/gateway/routes/admin-property-locks.test.ts`, `tests/gateway/admin-property-locks-integration.test.ts` | `pnpm test -- --run` |
| 7      | `docs(planning)`     | mark GM-15 complete in story map                                  | `docs/planning/2026-04-21-2202-phase1-story-map.md`                                                                                                 | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                                    # Expected: exit 0
pnpm test -- --run                            # Expected: 530+ pass, no new failures
tsx src/worker-tools/locks/diagnose-access.ts --help  # Expected: usage text, exit 0
tsx src/worker-tools/locks/sifely-client.ts --help     # Expected: usage text, exit 0

# Admin API CRUD
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/property-locks" \
  -d '{"property_external_id":"test","lock_external_id":"12345","lock_name":"Test Lock","lock_provider":"sifely"}'
# Expected: 201

# Diagnosis tool (with mock/real Sifely)
HOSTFULLY_API_KEY=... SIFELY_CLIENT_ID=... SIFELY_USERNAME=... SIFELY_PASSWORD=... \
SUPABASE_URL=http://localhost:54321 SUPABASE_SECRET_KEY=... TENANT_ID=00000000-0000-0000-0000-000000000003 \
  tsx src/worker-tools/locks/diagnose-access.ts --property-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
# Expected: JSON diagnosis with hostfullyDoorCode, locks, hasMismatch, diagnosisSummary
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Story map GM-15 criteria all checked
- [ ] Docker image rebuilt with lock tools
