# Learnings — gm03-property-kb

## Project Conventions

- Shell tools: self-contained TS, manual arg parsing via argv loop, stdout=JSON, stderr=errors, PostgREST for DB
- Primary shell tool pattern: `src/worker-tools/platform/report-issue.ts`
- GET-based shell tool pattern: `src/worker-tools/hostfully/get-property.ts`
- Seed pattern: prisma.model.upsert() with deterministic UUIDs, large string constants as template literals
- Test pattern for shell tools: `tests/worker-tools/platform/report-issue.test.ts` (local http.Server mock, capturedRequests, execFile)
- Seed test pattern: `tests/gateway/seed-guest-messaging.test.ts` (prisma.$queryRaw)

## Key UUIDs

- VLRE Tenant: `00000000-0000-0000-0000-000000000003`
- DozalDevs Tenant: `00000000-0000-0000-0000-000000000002`
- Common KB row (deterministic): `00000000-0000-0000-0000-000000000100`
- Entity KB row (deterministic): `00000000-0000-0000-0000-000000000101`
- VLRE test property UID: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
- Guest-messaging archetype (VLRE): `00000000-0000-0000-0000-000000000015`

## Schema

- Table name: `knowledge_base_entries` (NOT `knowledge_bases` — that's the feedback pipeline table)
- Model name: `KnowledgeBaseEntry`
- Columns: id, tenant_id, entity_type (nullable), entity_id (nullable), scope ('common'|'entity'), content, created_at, updated_at
- CHECK constraint on scope: `CHECK (scope IN ('common', 'entity'))`

## Tool Interface

- CLI: `tsx /tools/kb/search.ts --entity-type <type> --entity-id <id> [--tenant-id <uuid>]`
- NO --query parameter — tool returns all content, LLM interprets
- Output: `{ content: string, entityFound: bool, commonFound: bool, entityType: string, entityId: string }`
- Entity content first, then common content, separated by: `\n\n---\n\n# Common Policies\n\n`

## Standalone MVP Location

- Common KB: `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/common.md`
- Property files: `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/properties/*.md`
- Property map: `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/property-map.json`

## Task 2 — Property UID Mapping (2026-04-23)

### Selected Property File

- **File**: `properties/3505-ban.md`
- **Address**: 3505 Banton Rd, Unit B, Austin, TX 78722
- **Hostfully UID**: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` (from AGENTS.md Hostfully Testing section)

### Match Rationale

- `HOSTFULLY_API_KEY` was NOT present in `.env` — API call not possible
- Fallback used: AGENTS.md explicitly documents this UID as the VLRE test property
- Task instructions confirm `3505-ban.md` as the designated fallback for this UID
- Evidence saved to: `.sisyphus/evidence/task-2-fallback-content.txt`

### 3505-ban.md Key Searchable Keywords (for Task 6 test assertions)

- **WiFi**: Network = `"Advani"`, Password = `"pakistan123"` → search for `"Advani"` or `"pakistan123"`
- **Access**: `"door code"` and `"keys are hidden in secret spot"`
- **Parking**: `"Free Parking (On premises)"` and `"Free Parking (On street)"`
- **House Rules**: `"Quiet time between 10 pm to 7 a.m."`, `"No pets"`, `"No children"`, `"Late checkouts will incur a fee of $50"`
- **Cancellation**: `"Strict"` — `"50% refund for cancellations made at least 7 days before check-in"`
- **Fees**: `"Cleaning Fee": $150`, `"Security Deposit": $300`
- **Check-in**: `"4:00 PM"` | **Check-out**: `"11:00 AM"`

### common.md Key Searchable Keywords (for Task 6 test assertions)

- **General Policies section**: `"General Policies"` heading present
- **Quiet Hours**: `"10:00 PM – 8:00 AM"`
- **Smoking**: `"Strictly prohibited inside all properties"`
- **Pets policy**: `"cannot allow pets or emotional support animals"`
- **Refund scenario**: `"strict policy"` / `"cancel within the next few minutes"`
- **Classification Rules**: `"AUTO_RESPOND"`, `"NEEDS_APPROVAL"`, `"ESCALATE"`
- **Escalation triggers**: `"can't get in"`, `"locked out"`, `"smell gas"`, `"flood"`
- **Service Directory**: `"Service Directory"` heading with Austin/San Antonio vendors

### Suitability Confirmation

- `3505-ban.md`: 467 lines, rich property-specific content (WiFi, access codes, parking, amenities, house rules, fees, cancellation) — **SUITABLE for seeding**
- `common.md`: 198 lines, shared policies, 10 guest scenarios, property quick reference table, service directory, classification rules — **SUITABLE for seeding**
- Both files are plain markdown, safe to embed as template literal constants in `prisma/seed.ts`

## Task 4 — KB Search Tool (2026-04-23)

- File: `src/worker-tools/kb/search.ts`
- Pattern: identical to `report-issue.ts` (JSDoc block, parseArgs manual loop, main(), main().catch)
- CLI: `--entity-type` (required), `--entity-id` (required, normalized to lowercase), `--tenant-id` (optional, falls back to `TENANT_ID` env)
- NO `--query` parameter — returns all content
- Fetch strategy: combined PostgREST `or` filter first; if non-2xx, falls back to two separate queries
- `or` filter URL format: `?or=(scope.eq.common,and(scope.eq.entity,entity_type.eq.{type},entity_id.eq.{id}))`
- Output: `{ content, entityFound, commonFound, entityType, entityId }` — entity content first, common appended with `\n\n---\n\n# Common Policies\n\n` separator
- Both rows missing → empty content string, both flags false, exit 0
- Evidence: `.sisyphus/evidence/task-4-help.txt`, `task-4-missing-env.txt`, `task-4-missing-arg.txt`, `task-4-build.txt`
- Build: `pnpm build` exits 0 with zero TypeScript errors
- `void usedFallback` pattern avoided — simply removed the unused tracking variable

## Task 3 — Seed KB Entries (2026-04-23)

### What Was Done

- Added `VLRE_COMMON_KB_CONTENT` and `VLRE_PROPERTY_3505_BAN_KB_CONTENT` as template literal constants in `prisma/seed.ts`
- Added 2 `prisma.knowledgeBaseEntry.upsert()` calls with deterministic UUIDs `000...100` and `000...101`
- Added `/tools/kb/search.ts` to `tool_registry` in the VLRE guest-messaging archetype (both create and update blocks)
- Updated `VLRE_GUEST_MESSAGING_INSTRUCTIONS` Step 2 KB line from `--property-id ... --query ...` to `--entity-type property --entity-id "<property-id>"`

### Verification Results

- `pnpm prisma db seed` exits 0 — PASS
- 2 rows in `knowledge_base_entries` for VLRE tenant: content_length 11554 (common) and 12729 (entity) — PASS
- Idempotent: second seed run still 2 rows — PASS
- `/tools/kb/search.ts` present in `tool_registry` — PASS

### Gotchas

- LSP server showed stale errors for `prisma.knowledgeBaseEntry` — the generated types ARE correct (confirmed by grep in index.d.ts), LSP just hadn't refreshed. Seed ran successfully.
- `npx prisma db execute --stdin` requires `--url` or `--schema` flag — use `psql` directly instead for ad-hoc queries.
- Evidence saved to `.sisyphus/evidence/task-3-*.txt`

## Task 6 — Schema Test + Seed Verification Tests (2026-04-23)

### Schema Test Update

- File: `tests/schema.test.ts` (NOT `tests/gateway/schema.test.ts`)
- Actual table count: **21** (was 19)
- Added tables: `knowledge_base_entries`, `system_events`
- Test description updated: "all 21 application tables exist in public schema"
- `npx prisma db execute --stdin` requires `--url` or `--schema` — use `psql` directly for ad-hoc queries

### Seed Verification Tests

- File: `tests/gateway/seed-property-kb.test.ts`
- Pattern: `getPrisma()` from `../setup.js`, `afterAll(disconnectPrisma)`, `prisma.$queryRaw` with tagged template literals
- **Gotcha**: `archetypes` table has NO `slug` column — use `role_name` instead
- All 6 tests pass: count, common row schema, entity row schema, tool_registry, tenant isolation, UUID determinism
- Evidence: `.sisyphus/evidence/task-6-schema-test.txt`, `task-6-seed-kb-test.txt`

## Task 5 — KB Search Test (2026-04-23)

### What Was Done

- Created `tests/worker-tools/kb/search.test.ts` with 12 test cases
- Pattern: identical to `report-issue.test.ts` (local `http.Server`, `capturedRequests`, `mockResponse`, `beforeEach` reset, `execFile`)
- Mock server: single handler returning `mockResponse` for ALL URLs (no URL routing needed — one status/body per test)
- `baseEnv()`: `{ SUPABASE_URL: mock, SUPABASE_SECRET_KEY: 'test-secret', TENANT_ID: VLRE_UUID }`
- Missing-env tests: `{ ...baseEnv(), TARGET_VAR: '' }` pattern — empty string is falsy, same effect as omit

### Test Cases Summary

1. `--help` → exit 0, stdout has `--entity-type`, `--entity-id`, `SUPABASE_URL`, NOT `--query`
2. `SUPABASE_URL: ''` → exit 1, stderr contains `SUPABASE_URL`
3. `SUPABASE_SECRET_KEY: ''` → exit 1, stderr contains `SUPABASE_SECRET_KEY`
4. `TENANT_ID: ''`, no `--tenant-id` → exit 1, stderr contains `tenant`
5. No `--entity-type` → exit 1, stderr contains `--entity-type`
6. No `--entity-id` → exit 1, stderr contains `--entity-id`
7. Both rows → exit 0, entity before common, both flags true, entityType/entityId correct
8. Only common → exit 0, `entityFound=false`, `commonFound=true`
9. Only entity → exit 0, `entityFound=true`, `commonFound=false`, no `---` separator
10. Empty array → exit 0, `content=''`, both flags false
11. Status 500 → exit 1 (combined fails → fallback fires → both fallbacks fail → exit 1), stderr has `Error:`
12. `--tenant-id my-tenant-uuid` → exit 0, first captured URL contains `tenant_id=eq.my-tenant-uuid`

### Key Gotchas

- Test 11: mock returns 500 for ALL requests with no URL discrimination → tool hits combined(500) → fallback common(500) → exit 1
- `--entity-id` is lowercased by the tool → test 7 asserts `entityId === 'test-prop-123'` (already lowercase input, so passes)
- Evidence: `.sisyphus/evidence/task-5-test-results.txt`, `task-5-no-live-services.txt`
- All 12 tests pass in 6.82s total

## Task 1 — Migration (2026-04-24)

### Migration Details

- **Migration timestamp**: `20260424020323`
- **Migration name**: `add_knowledge_base_entries`
- **Migration file**: `prisma/migrations/20260424020323_add_knowledge_base_entries/migration.sql`

### Gotchas

- Prisma does NOT auto-generate CHECK constraints — must add manually to migration SQL AND apply to live DB separately
- After `prisma migrate dev` runs, the migration is already applied to DB; adding CHECK to SQL file alone is not enough
- Must run `psql ... ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` manually to apply to live DB
- The `@@unique` with nullable columns (`entity_type`, `entity_id`) works in Postgres — NULLs are treated as distinct values in unique indexes

### Verification

- 8 columns confirmed: id, tenant_id, entity_type (nullable), entity_id (nullable), scope (NOT NULL), content (NOT NULL), created_at, updated_at
- CHECK constraint confirmed working: INSERT with `invalid_scope` raises `violates check constraint "knowledge_base_entries_scope_check"`
- `pnpm build` exits 0
- `npx prisma generate` exits 0
