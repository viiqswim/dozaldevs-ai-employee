# GM-03: Single-Property Knowledge Base

## TL;DR

> **Quick Summary**: Add a database-backed, industry-agnostic knowledge base (`knowledge_base_entries` with `entity_type`/`entity_id`) for per-entity and per-tenant-common information, plus a shell tool (`kb/search.ts`) for the OpenCode employee to retrieve all KB content for a given entity. Seed one VLRE property's KB from the standalone MVP.
>
> **Deliverables**:
>
> - New `knowledge_base_entries` table (Prisma migration) — generic schema supporting any industry vertical
> - Shell tool: `src/worker-tools/kb/search.ts` — fetches all content for an entity, no keyword filtering (LLM interprets)
> - Seed data: 1 common KB row + 1 property-specific KB row for VLRE
> - Archetype `tool_registry` updated with `/tools/kb/search.ts`
> - Archetype `instructions` updated to reference new tool interface
> - Vitest tests for shell tool, seed verification, and schema assertion
> - GM-03 acceptance criteria marked `[x]` in story-map document
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 4 waves + final verification
> **Critical Path**: Task 1 (migration) → Task 3 (seed) → Task 5/6 (tests) → Task 7 (full suite + E2E) → F1-F4

---

## Context

### Original Request

Implement GM-03 (Single-Property Knowledge Base) from the Phase 1 story map (`docs/2026-04-21-2202-phase1-story-map.md`). Build property-specific and common KB storage, a shell tool for querying it, seed one VLRE property, test thoroughly with automated tests and API endpoint verification, and mark the story-map acceptance criteria as complete.

### Interview Summary

**Key Discussions**:

- GM-01 (archetype) and GM-02 (system prompt) are already complete — all dependencies met
- The existing `knowledge_bases` table is designed for the feedback pipeline (pgvector fields `chunk_count`, `last_indexed`) — not suitable for property KB
- The standalone MVP at `/Users/victordozal/repos/real-estate/vlre-employee` has 16 property KB markdown files + `common.md` with keyword-based section search
- The guest-messaging archetype instructions already reference `tsx /tools/kb/search.ts` with a "skip if not available" fallback

**Research Findings**:

- `knowledge_bases` table: 8 columns, `source_config` (JSONB) used for feedback themes only. No `property_uid`, `content`, or `scope` columns. Extending it would pollute the feedback pipeline read path and require a discriminator.
- Standalone MVP KB: common.md (~200 lines) has policies, Q&A scenarios, service directory, escalation triggers. Property files (~200-450 lines each) have WiFi, access codes, parking, amenities, house rules, fees. Standalone MVP uses keyword-based section search — we intentionally omit this; the tool returns all content and the LLM interprets.
- Shell tool pattern: self-contained TS, manual arg parsing, stdout=JSON, stderr=errors, PostgREST for DB access, --help flag. Reference implementation: `src/worker-tools/platform/report-issue.ts`.
- VLRE test property UID `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` available for seeding. Property-to-UID mapping needs to be resolved at implementation time (call `get-property.ts` once or match against `property-map.json`).
- The `tool_registry` array in the archetype seed does NOT include `/tools/kb/search.ts` yet — instructions reference it, but registry doesn't list it.

### Metis Review

**Identified Gaps (addressed)**:

- Schema test (`schema.test.ts`) hardcodes table count — must verify current count and update. May already be stale due to `system_events` table addition.
- `tool_registry` must be updated (separate from instructions text) to register the new tool.
- Seed must use deterministic UUIDs for idempotent upsert (e.g., `00000000-0000-0000-0000-000000000100` for common, `00000000-0000-0000-0000-000000000101` for property).
- Table name should be generic (`knowledge_base_entries` with `entity_type`/`entity_id`) to support future industry verticals — user confirmed this.
- Tool should NOT have a `--query` parameter — it would confuse the AI employee into thinking results are filtered when they're not. Add it later when it does something (pgvector). Tool returns all content and lets the LLM interpret.
- PostgREST query for combined common + entity rows needs testing — may need to fall back to two separate queries.
- Entity ID lowercase normalization before querying.
- CHECK constraint on `scope` column for data integrity.
- Edge cases: no entity row → return common only; no common row → return entity only; both missing → exit 0 with empty content.

---

## Work Objectives

### Core Objective

Build a database-backed, tenant-isolated, industry-agnostic knowledge base that stores per-entity and common KB content, retrievable by the OpenCode employee via a shell tool that returns all content for LLM interpretation.

### Concrete Deliverables

- `prisma/schema.prisma`: New `KnowledgeBaseEntry` model
- `prisma/migrations/{timestamp}_add_knowledge_base_entries/`: Migration SQL
- `src/worker-tools/kb/search.ts`: Shell tool (full content retrieval — no keyword filtering, LLM interprets)
- `prisma/seed.ts`: KB seed data (1 common + 1 entity row for VLRE) + `tool_registry` update + `instructions` update
- `tests/worker-tools/kb/search.test.ts`: Shell tool tests (8+ test cases)
- `tests/gateway/seed-property-kb.test.ts` (or extend `seed-guest-messaging.test.ts`): Seed verification tests
- `tests/gateway/schema.test.ts`: Updated table count assertion
- `docs/2026-04-21-2202-phase1-story-map.md`: GM-03 acceptance criteria marked `[x]`

### Definition of Done

- [ ] `pnpm prisma db seed` completes without error and creates 2 KB rows for VLRE
- [ ] `npx tsx src/worker-tools/kb/search.ts --entity-type property --entity-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"` returns JSON with full KB content
- [ ] `pnpm test -- --run` passes with zero new failures
- [ ] `pnpm build` exits 0
- [ ] All 6 GM-03 acceptance criteria in the story map are marked `[x]`

### Must Have

- New `knowledge_base_entries` table with tenant isolation (`tenant_id` FK) and generic entity model (`entity_type`/`entity_id`)
- Two-tier KB: `scope='common'` (tenant-wide, `entity_type`/`entity_id` null) + `scope='entity'` (per-entity)
- Shell tool: `tsx /tools/kb/search.ts --entity-type property --entity-id "<uid>"` — returns ALL content (entity-specific + common), no filtering
- Archetype `instructions` updated to reference the new tool interface (replacing the old `--property-id --query` placeholder)
- Seed data: one VLRE property KB + common.md content from standalone MVP
- `/tools/kb/search.ts` registered in `guest-messaging` archetype `tool_registry`

### Must NOT Have (Guardrails)

- **Do NOT extend the existing `knowledge_bases` table** — it's for the feedback pipeline
- **Do NOT seed more than 1 entity + 1 common row** — GM-08 handles the remaining 15 properties
- **Do NOT add a `--query` parameter** — it would confuse the AI employee into thinking the tool filters results. The tool returns all content; the LLM interprets it. Add `--query` later when pgvector or real filtering is implemented.
- **Do NOT implement keyword filtering, fuzzy matching, stemming, TF-IDF, or pgvector search** — the tool is a pure data fetcher, not a search engine
- **Do NOT import from `src/`** in the shell tool — tools are self-contained for Docker
- **Do NOT use external npm packages** (no minimist, yargs, commander) in the tool
- **Do NOT add columns beyond**: `id`, `tenant_id`, `entity_type`, `entity_id`, `scope`, `content`, `created_at`, `updated_at`
- **Do NOT add a `property_aliases` table** — that's GM-07 scope
- **Do NOT add `--list-entities` or `--all` flags** — that's GM-07 scope
- **Do NOT mark any story-map criteria other than GM-03's 6 items**
- **Do NOT write tests that require live Hostfully API or live PostgREST** — use mocks

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (`pnpm test -- --run`)
- **Test patterns to follow**:
  - Shell tool tests: `tests/worker-tools/platform/report-issue.test.ts` (local `http.Server` mock, `capturedRequests`, `beforeEach` reset)
  - Seed tests: `tests/gateway/seed-guest-messaging.test.ts` (`prisma.$queryRaw`, field assertions)
  - Schema tests: `tests/gateway/schema.test.ts` (table count assertion)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run the tool with various args, assert stdout JSON and exit codes
- **Seed**: Use Bash — run `pnpm prisma db seed`, then query PostgREST to verify rows
- **Tests**: Use Bash — `pnpm test -- --run`, capture output, assert pass count

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: Prisma schema + migration [quick]
├── Task 2: Identify VLRE test property KB mapping + prepare content [quick]

Wave 2 (Core implementation — after Wave 1, MAX PARALLEL):
├── Task 3: Seed KB data + update archetype tool_registry (depends: 1, 2) [quick]
├── Task 4: KB search shell tool (depends: 1) [unspecified-high]

Wave 3 (Tests — after Wave 2, MAX PARALLEL):
├── Task 5: Shell tool tests (depends: 4) [unspecified-high]
├── Task 6: Seed + schema verification tests (depends: 1, 3) [quick]

Wave 4 (Verification — after Wave 3):
├── Task 7: Full test suite + E2E verification (depends: all) [unspecified-high]

Wave FINAL (Review — after Wave 4):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Post-FINAL:
├── Task 8: Mark GM-03 in story-map + notify (depends: user okay) [quick]

Critical Path: Task 1 → Task 3 → Task 6 → Task 7 → F1-F4 → user okay → Task 8
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Waves 1, 2, 3)
```

### Dependency Matrix

| Task  | Depends On        | Blocks     | Wave  |
| ----- | ----------------- | ---------- | ----- |
| 1     | —                 | 2, 3, 4, 6 | 1     |
| 2     | —                 | 3          | 1     |
| 3     | 1, 2              | 6          | 2     |
| 4     | 1                 | 5          | 2     |
| 5     | 4                 | 7          | 3     |
| 6     | 1, 3              | 7          | 3     |
| 7     | 5, 6              | F1-F4      | 4     |
| F1-F4 | 7                 | 8          | FINAL |
| 8     | F1-F4 + user okay | —          | Post  |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **2** — T3 → `quick`, T4 → `unspecified-high`
- **Wave 3**: **2** — T5 → `unspecified-high`, T6 → `quick`
- **Wave 4**: **1** — T7 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`
- **Post**: **1** — T8 → `quick`

---

## TODOs

- [x] 1. Prisma Schema + Migration for `knowledge_base_entries`

  **What to do**:
  - Add a new `KnowledgeBaseEntry` model to `prisma/schema.prisma` with these columns:
    - `id` — UUID, primary key, default `uuid()`
    - `tenant_id` — UUID, required, FK → `tenants.id` (ON DELETE RESTRICT)
    - `entity_type` — String (text), nullable (null for common/tenant-wide entries; e.g., `'property'`, `'restaurant'`, `'clinic'`)
    - `entity_id` — String (text), nullable (null for common entries; e.g., Hostfully property UID)
    - `scope` — String (text), required (values: `common` or `entity`)
    - `content` — String (text), required (full markdown content)
    - `created_at` — DateTime, default `now()`
    - `updated_at` — DateTime, `@updatedAt`
  - Add a composite index on `(tenant_id, entity_type, entity_id)` for efficient queries
  - Add a unique constraint on `(tenant_id, entity_type, entity_id, scope)` — prevents duplicate entries for the same entity/scope combo. For common entries, `entity_type` and `entity_id` will be null, so only one common row per tenant is enforced.
  - Run `npx prisma migrate dev --name add_knowledge_base_entries` to generate the migration SQL
  - Verify the generated migration SQL includes a CHECK constraint on `scope`: `CHECK (scope IN ('common', 'entity'))`. If Prisma doesn't generate this, add it manually to the migration SQL.
  - Run `npx prisma generate` to update the Prisma client

  **Must NOT do**:
  - Do NOT modify the existing `knowledge_bases` table or model
  - Do NOT add columns beyond the 8 specified above
  - Do NOT add `last_indexed`, `chunk_count`, or `source_config` — those are feedback pipeline columns

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file Prisma schema change + migration generation. Straightforward and well-defined.
  - **Skills**: []
    - No special skills needed — standard Prisma workflow.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `prisma/schema.prisma:231-246` — Existing `KnowledgeBase` model for structural reference (FK patterns, @db.Uuid, @updatedAt). Do NOT duplicate its columns — this is a different table.
  - `prisma/schema.prisma:1-20` — Generator and datasource config, enum patterns
  - `prisma/migrations/20260422224712_add_system_events/migration.sql` — Most recent migration. Follow the same SQL style (CREATE TABLE, ALTER TABLE for FKs, CHECK constraints).

  **API/Type References** (contracts to implement against):
  - `prisma/schema.prisma:50-60` — `Tenant` model showing the `id` field that `tenant_id` FK references

  **External References**:
  - Prisma docs: `https://www.prisma.io/docs/concepts/components/prisma-schema/data-model` — Model definition syntax

  **WHY Each Reference Matters**:
  - The KnowledgeBase model shows the exact FK pattern and column type annotations used in this project
  - The system_events migration is the most recent migration and shows the SQL conventions for CHECK constraints and FKs
  - The Tenant model is where the FK points

  **Acceptance Criteria**:
  - [ ] `KnowledgeBaseEntry` model exists in `prisma/schema.prisma` with all 8 columns
  - [ ] Migration file generated at `prisma/migrations/{timestamp}_add_knowledge_base_entries/migration.sql`
  - [ ] `npx prisma migrate dev` completes without error
  - [ ] `npx prisma generate` completes without error
  - [ ] `pnpm build` exits 0

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Migration creates the table correctly
    Tool: Bash
    Preconditions: Local database running (pnpm docker:start or equivalent), latest migrations applied
    Steps:
      1. Run: npx prisma migrate dev --name add_knowledge_base_entries
      2. Run: npx prisma db execute --stdin <<< "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'knowledge_base_entries' ORDER BY ordinal_position"
      3. Assert output contains: id (uuid, NO), tenant_id (uuid, NO), entity_type (text, YES), entity_id (text, YES), scope (text, NO), content (text, NO), created_at (timestamp, NO), updated_at (timestamp, NO)
    Expected Result: 8 columns with correct types and nullability
    Failure Indicators: Missing columns, wrong types, or migration error
    Evidence: .sisyphus/evidence/task-1-migration-columns.txt

  Scenario: CHECK constraint on scope column
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run: npx prisma db execute --stdin <<< "INSERT INTO knowledge_base_entries (id, tenant_id, scope, content, updated_at) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'invalid_scope', 'test', now())"
      2. Assert: command fails with a CHECK constraint violation error
    Expected Result: INSERT rejected — scope must be 'common' or 'entity'
    Failure Indicators: INSERT succeeds with invalid scope value
    Evidence: .sisyphus/evidence/task-1-check-constraint.txt

  Scenario: Build still passes after schema change
    Tool: Bash
    Preconditions: prisma generate completed
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: TypeScript compilation succeeds
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-migration-columns.txt — Column listing from information_schema
  - [ ] task-1-check-constraint.txt — CHECK constraint violation output
  - [ ] task-1-build.txt — pnpm build output

  **Commit**: YES
  - Message: `feat(kb): add knowledge_base_entries table`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/`
  - Pre-commit: `pnpm build`

---

- [x] 2. Identify VLRE Test Property KB Mapping + Prepare Content

  **What to do**:
  - Determine which of the 16 standalone MVP KB files (`/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/properties/*.md`) corresponds to the VLRE test property UID `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
  - Strategy: Run `npx tsx src/worker-tools/hostfully/get-property.ts --property-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"` to get the property name/address, then match it against the `property-map.json` entries at `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/property-map.json`
  - **Required**: VLRE's Hostfully API key must be set in `tenant_secrets` for this to work. If not available, fall back: read all 16 file names in `property-map.json`, check AGENTS.md's Hostfully Testing section for address hints, and pick the most likely match. If no match is determinable, use `3505-ban.md` as a representative property (it's a clean, complete example).
  - Read the identified property file and `common.md` from the standalone MVP
  - Prepare both as string constants that will be used in seed.ts (Task 3)
  - **Output**: A clear record of: (a) which file was selected, (b) the Hostfully property UID it maps to, (c) confirmation the content is suitable for seeding

  **Must NOT do**:
  - Do NOT port more than 1 property file — GM-08 handles the remaining 15
  - Do NOT modify any files in the standalone MVP repo
  - Do NOT create a migration script — this is just content identification

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read-only investigation — run one shell tool, read files, match content. No code changes.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-property.ts` — Run this tool with `--property-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` to get the property name and address. Requires `HOSTFULLY_API_KEY` env var.

  **API/Type References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/property-map.json` — Maps property codes to names, addresses, and KB file paths. Use this to match the get-property.ts output.
  - `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/common.md` — The tenant-wide common KB that will be seeded as the `scope='common'` row.
  - `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/properties/*.md` — The 16 property KB files. One will be selected for seeding.

  **External References**:
  - AGENTS.md Hostfully Testing section — Lists `Property UID: c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` as the VLRE test property

  **WHY Each Reference Matters**:
  - get-property.ts provides the authoritative name/address for the UID
  - property-map.json is the lookup table from the MVP
  - common.md is always needed regardless of which property is selected

  **Acceptance Criteria**:
  - [ ] Property-to-UID mapping identified and documented
  - [ ] Property KB file content read and ready for seeding (saved in evidence or noted for Task 3)
  - [ ] Common.md content read and ready for seeding
  - [ ] If Hostfully API unavailable, fallback property documented with rationale

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Identify property via Hostfully API
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY available in env or tenant_secrets
    Steps:
      1. Run: HOSTFULLY_API_KEY=$KEY npx tsx src/worker-tools/hostfully/get-property.ts --property-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
      2. Extract property name and address from JSON output
      3. Read /Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/property-map.json
      4. Match name or address against property-map.json entries
      5. Read the matched property file from properties/*.md
    Expected Result: A specific property code (e.g., "3505-ban") matched to UID, file content captured
    Failure Indicators: get-property.ts fails (API key missing), no match in property-map.json
    Evidence: .sisyphus/evidence/task-2-property-mapping.json

  Scenario: Fallback if API unavailable
    Tool: Bash
    Preconditions: No Hostfully API access
    Steps:
      1. Read /Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/properties/3505-ban.md
      2. Read /Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/common.md
      3. Document: using 3505-ban.md as representative fallback
    Expected Result: Both files read successfully, content suitable for seeding
    Evidence: .sisyphus/evidence/task-2-fallback-content.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-property-mapping.json — Mapping result (property code, UID, matched file)
  - [ ] task-2-fallback-content.txt — If fallback was used, document rationale

  **Commit**: NO (groups with Task 3)

- [x] 3. Seed KB Data + Update Archetype Tool Registry

  **What to do**:
  - In `prisma/seed.ts`, add KB seed data using the Prisma client (not raw SQL):
    - Common KB row: `id: '00000000-0000-0000-0000-000000000100'`, `tenant_id: VLRE_TENANT_ID`, `entity_type: null`, `entity_id: null`, `scope: 'common'`, `content: <common.md content from Task 2>`
    - Entity KB row: `id: '00000000-0000-0000-0000-000000000101'`, `tenant_id: VLRE_TENANT_ID`, `entity_type: 'property'`, `entity_id: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2'`, `scope: 'entity'`, `content: <property file content from Task 2>`
  - Use `prisma.knowledgeBaseEntry.upsert()` with the deterministic UUIDs for idempotent seed
  - Add the KB content as string constants near the top of seed.ts (or in a separate constants section) — follow the pattern used for `GUEST_MESSAGING_SYSTEM_PROMPT` and `VLRE_GUEST_MESSAGING_INSTRUCTIONS`
  - Update the `vlreGuestMessaging` archetype upsert's `tool_registry` array to include `/tools/kb/search.ts`
  - Update the `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant to replace the old KB tool reference (`tsx /tools/kb/search.ts --property-id "<property-id>" --query "<topic>"`) with the new interface: `tsx /tools/kb/search.ts --entity-type property --entity-id "<property-id>"`. Also remove the "skip if not available" fallback — the tool now exists.
  - Verify the KB tool is listed alongside existing tools: `/tools/hostfully/get-property.ts`, `/tools/hostfully/get-reservations.ts`, etc.
  - Run `pnpm prisma db seed` and verify both KB rows are created
  - **CRITICAL**: The KB content strings will be large (200-450 lines of markdown). Store them as template literal constants. Do NOT fetch from external files at seed time.

  **Must NOT do**:
  - Do NOT seed more than 2 KB rows (1 common + 1 property)
  - Do NOT fetch content from Hostfully API at seed time
  - Do NOT modify the common.md or property file content beyond necessary escaping
  - Do NOT add KB rows for DozalDevs tenant — only VLRE

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Editing seed.ts to add constants + upsert calls + tool_registry update. Pattern is well-established.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (migration must exist), Task 2 (content must be identified)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:37-242` — `GUEST_MESSAGING_SYSTEM_PROMPT` constant. Follow this pattern for `VLRE_COMMON_KB_CONTENT` and `VLRE_PROPERTY_KB_CONTENT` — store as template literal constants.
  - `prisma/seed.ts:411-440` — `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant. Shows how large text constants are structured in seed.ts.
  - `prisma/seed.ts:500-550` (approximate) — The `vlreGuestMessaging` archetype `upsert` call. Add `/tools/kb/search.ts` to the `tool_registry` array here. Find the exact line by searching for `tool_registry` in the guest-messaging upsert.
  - `prisma/seed.ts` — Search for existing `upsert()` calls to follow the idempotent seed pattern with deterministic UUIDs.

  **API/Type References**:
  - Task 2 output — The property KB content and common.md content to embed as constants

  **WHY Each Reference Matters**:
  - GUEST_MESSAGING_SYSTEM_PROMPT shows how to structure large string constants in seed.ts
  - The archetype upsert shows exactly where tool_registry is defined and how to add an entry
  - Existing upsert patterns ensure the seed is idempotent

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` completes without error
  - [ ] PostgREST query returns 2 rows: `curl "$SUPABASE_URL/rest/v1/knowledge_base_entries?tenant_id=eq.00000000-0000-0000-0000-000000000003&select=id,scope,entity_type,entity_id" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"`
  - [ ] Common row: `scope='common'`, `entity_type` is null, `entity_id` is null, `content` is non-empty
  - [ ] Entity row: `scope='entity'`, `entity_type='property'`, `entity_id='c960c8d2-9a51-49d8-bb48-355a7bfbe7e2'`, `content` is non-empty
  - [ ] `tool_registry` for guest-messaging archetype includes `/tools/kb/search.ts`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Seed creates KB rows
    Tool: Bash
    Preconditions: Migration from Task 1 applied, database running
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exit code 0
      3. Run: npx prisma db execute --stdin <<< "SELECT id, scope, entity_type, entity_id, length(content) as content_length FROM knowledge_base_entries WHERE tenant_id = '00000000-0000-0000-0000-000000000003' ORDER BY scope"
      4. Assert: 2 rows returned — one with scope='common', entity_type=NULL, entity_id=NULL; one with scope='entity', entity_type='property', entity_id='c960c8d2-9a51-49d8-bb48-355a7bfbe7e2'
      5. Assert: content_length > 100 for both rows (non-trivial content)
    Expected Result: 2 KB rows with correct metadata and substantive content
    Failure Indicators: Seed error, wrong row count, empty content
    Evidence: .sisyphus/evidence/task-3-seed-rows.txt

  Scenario: Seed is idempotent
    Tool: Bash
    Preconditions: Seed already run once
    Steps:
      1. Run: pnpm prisma db seed (second time)
      2. Assert: exit code 0
      3. Run: npx prisma db execute --stdin <<< "SELECT count(*) FROM knowledge_base_entries WHERE tenant_id = '00000000-0000-0000-0000-000000000003'"
      4. Assert: count = 2 (not 4 — no duplicates)
    Expected Result: Idempotent — same 2 rows, no duplicates
    Failure Indicators: Duplicate rows, unique constraint violation
    Evidence: .sisyphus/evidence/task-3-seed-idempotent.txt

  Scenario: Tool registry updated
    Tool: Bash
    Preconditions: Seed run successfully
    Steps:
      1. Run: npx prisma db execute --stdin <<< "SELECT tool_registry FROM archetypes WHERE slug = 'guest-messaging' AND tenant_id = '00000000-0000-0000-0000-000000000003'"
      2. Assert: output contains '/tools/kb/search.ts'
    Expected Result: KB tool registered in archetype
    Failure Indicators: tool_registry doesn't contain the KB tool path
    Evidence: .sisyphus/evidence/task-3-tool-registry.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-seed-rows.txt — Query results showing 2 KB rows
  - [ ] task-3-seed-idempotent.txt — Second seed run showing no duplicates
  - [ ] task-3-tool-registry.txt — tool_registry containing kb/search.ts

  **Commit**: YES (groups with Task 4)
  - Message: `feat(kb): add search shell tool and seed KB data`
  - Files: `prisma/seed.ts`, `src/worker-tools/kb/search.ts`
  - Pre-commit: `pnpm build`

---

- [x] 4. KB Search Shell Tool (`src/worker-tools/kb/search.ts`)

  **What to do**:
  - Create `src/worker-tools/kb/search.ts` following the exact shell tool pattern from `report-issue.ts`
  - **CLI interface**:

    ```
    tsx /tools/kb/search.ts --entity-type "<type>" --entity-id "<id>" [--tenant-id "<uuid>"]
    ```

    - `--entity-type` — Required. The type of entity (e.g., `property`, `restaurant`, `clinic`). Used to query the correct KB rows.
    - `--entity-id` — Required. The entity's external identifier (e.g., Hostfully property UID). Will be normalized to lowercase before querying.
    - `--tenant-id` — Optional. Falls back to `TENANT_ID` env var. Required for tenant isolation.
    - `--help` — Print usage text, env var requirements, output format description, and exit 0.

  - **NO `--query` parameter** — the tool returns ALL content for the entity + common. The LLM interprets the content and finds what's relevant. Adding a query parameter would mislead the AI employee into thinking results are filtered.
  - **Required env vars**: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TENANT_ID` (fallback for `--tenant-id`)
  - **Fetch logic** (simple — no parsing, no filtering):
    1. Fetch rows from PostgREST: `GET /rest/v1/knowledge_base_entries?tenant_id=eq.{tenantId}&or=(scope.eq.common,and(scope.eq.entity,entity_type.eq.{entityType},entity_id.eq.{entityId}))&select=scope,content`
    2. If the PostgREST `or` filter doesn't work (syntax issue), fall back to two separate queries: one for `scope=eq.common&tenant_id=eq.X` and one for `scope=eq.entity&tenant_id=eq.X&entity_type=eq.Y&entity_id=eq.Z`
    3. Concatenate content: entity-specific content first, then common content, separated by a clear markdown divider (`\n\n---\n\n# Common Policies\n\n`)
  - **JSON output schema** (stdout):
    ```json
    {
      "content": "## WiFi\nNetwork: GuestNetwork\n...\n\n---\n\n# Common Policies\n\n## General Policies\nCheck-in: 3pm\n...",
      "entityFound": true,
      "commonFound": true,
      "entityType": "property",
      "entityId": "c960c8d2-..."
    }
    ```
  - **Edge case handling**:
    - No entity-specific row found → return common content only, `entityFound: false`
    - No common row found → return entity content only, `commonFound: false`
    - Both missing → `{ "content": "", "entityFound": false, "commonFound": false }`, exit 0
    - PostgREST error → stderr error message, exit 1
    - Missing required env vars → stderr error message listing the missing var, exit 1
    - Missing `--entity-type` or `--entity-id` → stderr error message, exit 1
  - **Documentation comments**: Include a JSDoc block at the top explaining: purpose, when to call, env var requirements, output format, and the concatenation behavior (entity-first, then common)
  - **`--help` output**: Must document `--entity-type`, `--entity-id`, `--tenant-id`, all required env vars, and the JSON output shape

  **Must NOT do**:
  - Do NOT import from `src/` — tool must be self-contained
  - Do NOT use external npm packages (no minimist, yargs)
  - Do NOT add a `--query` parameter — this would confuse the AI employee
  - Do NOT implement keyword filtering, section parsing, or any search logic — just fetch and concatenate
  - Do NOT add `--list-entities`, `--all`, or any extra flags
  - Do NOT cache results — fresh query every invocation
  - Do NOT truncate or limit output size

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simplified to a pure data fetcher — PostgREST GET + concatenate content. No parsing or filtering logic. Straightforward.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (needs to know the exact table name and column names)

  **References**:

  **Pattern References** (CRITICAL — follow these exactly):
  - `src/worker-tools/platform/report-issue.ts` — **Primary pattern reference**. Follow the exact structure: `parseArgs()` function (manual argv loop), `main()` async function, env var validation, PostgREST fetch with headers, stdout JSON, stderr errors, top-level `.catch()`. Copy the arg parsing pattern verbatim.
  - `src/worker-tools/hostfully/get-property.ts` — Secondary reference for the PostgREST read pattern (GET with query params). The KB tool reads data (GET), unlike report-issue which writes (POST). get-property.ts shows the GET + response parsing pattern.
  - `src/worker-tools/hostfully/get-messages.ts` — Shows the `--help` flag implementation pattern and how to document output format.

  **API/Type References**:
  - PostgREST filter syntax: `?tenant_id=eq.{id}&or=(scope.eq.common,and(scope.eq.entity,entity_type.eq.{type},entity_id.eq.{id}))` — this is the combined query. If syntax issues, fall back to two separate queries.
  - The `knowledge_base_entries` table (created in Task 1): `scope` (common/entity), `entity_type` (text), `entity_id` (text), `content` (text)

  **Test References**:
  - `tests/worker-tools/platform/report-issue.test.ts` — Test structure reference.

  **External References**:
  - PostgREST docs: `https://postgrest.org/en/stable/references/api/resource_embedding.html` — Complex filter syntax

  **WHY Each Reference Matters**:
  - report-issue.ts is the canonical shell tool pattern — copy its structure exactly
  - get-property.ts shows how to do GET requests to PostgREST and parse JSON responses
  - get-messages.ts shows the `--help` implementation pattern

  **Acceptance Criteria**:
  - [ ] `src/worker-tools/kb/search.ts` exists
  - [ ] `npx tsx src/worker-tools/kb/search.ts --help` exits 0, output documents all flags and env vars
  - [ ] Tool accepts `--entity-type`, `--entity-id`, `--tenant-id`, `--help` (NO `--query`)
  - [ ] Output is valid JSON with `content` (string), `entityFound` (bool), `commonFound` (bool)
  - [ ] Entity-specific content appears before common content in the `content` string
  - [ ] Missing entity row → returns common content only with `entityFound: false`
  - [ ] Missing env vars → exit 1 with descriptive stderr
  - [ ] `pnpm build` exits 0

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Help flag shows usage
    Tool: Bash
    Preconditions: Tool file exists
    Steps:
      1. Run: npx tsx src/worker-tools/kb/search.ts --help
      2. Assert: exit code 0
      3. Assert: stdout contains "--entity-type", "--entity-id", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "TENANT_ID"
      4. Assert: stdout does NOT contain "--query"
    Expected Result: Complete usage documentation, no query parameter
    Failure Indicators: Non-zero exit, missing flags, or --query present
    Evidence: .sisyphus/evidence/task-4-help.txt

  Scenario: Missing SUPABASE_URL exits with error
    Tool: Bash
    Preconditions: SUPABASE_URL not set
    Steps:
      1. Run: SUPABASE_SECRET_KEY=test TENANT_ID=test npx tsx src/worker-tools/kb/search.ts --entity-type property --entity-id "test"
      2. Assert: exit code 1
      3. Assert: stderr contains "SUPABASE_URL"
    Expected Result: Clear error about missing env var
    Evidence: .sisyphus/evidence/task-4-missing-env.txt

  Scenario: Missing --entity-type exits with error
    Tool: Bash
    Preconditions: All env vars set
    Steps:
      1. Run: SUPABASE_URL=http://mock SUPABASE_SECRET_KEY=test TENANT_ID=test npx tsx src/worker-tools/kb/search.ts --entity-id "test"
      2. Assert: exit code 1
      3. Assert: stderr contains "--entity-type"
    Expected Result: Clear error about missing required arg
    Evidence: .sisyphus/evidence/task-4-missing-arg.txt

  Scenario: Successful fetch returns full content
    Tool: Bash
    Preconditions: Mock PostgREST returns 2 rows (entity + common)
    Steps:
      1. Start a local mock HTTP server returning [{scope: "entity", content: "## WiFi\nNetwork: TestNet\nPassword: abc123\n\n## Parking\nFree street parking"}, {scope: "common", content: "## General Policies\nCheck-in: 3pm\nCheck-out: 11am"}]
      2. Run: SUPABASE_URL=http://localhost:MOCK_PORT SUPABASE_SECRET_KEY=test TENANT_ID=test-tenant npx tsx src/worker-tools/kb/search.ts --entity-type property --entity-id "test-prop"
      3. Parse stdout JSON
      4. Assert: content string contains "WiFi" AND "General Policies" (both entity + common)
      5. Assert: entityFound === true, commonFound === true
    Expected Result: JSON output with full concatenated content from both sources
    Evidence: .sisyphus/evidence/task-4-full-content.json

  Scenario: Entity not found returns common only
    Tool: Bash
    Preconditions: Mock PostgREST returns only common row
    Steps:
      1. Mock returns [{scope: "common", content: "## General Policies\nCheck-in: 3pm"}]
      2. Run tool with --entity-type property --entity-id "nonexistent"
      3. Assert: entityFound === false, commonFound === true
      4. Assert: content contains "General Policies" but not any entity-specific content
    Expected Result: Common content only, entityFound false
    Evidence: .sisyphus/evidence/task-4-common-only.json
  ```

  **Evidence to Capture:**
  - [ ] task-4-help.txt — --help output (no --query present)
  - [ ] task-4-missing-env.txt — Missing env var error
  - [ ] task-4-missing-arg.txt — Missing arg error
  - [ ] task-4-full-content.json — Full content fetch result
  - [ ] task-4-common-only.json — Common-only fallback result

  **Commit**: YES (groups with Task 3)
  - Message: `feat(kb): add search shell tool and seed KB data`
  - Files: `src/worker-tools/kb/search.ts`, `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Shell Tool Tests (`tests/worker-tools/kb/search.test.ts`)

  **What to do**:
  - Create `tests/worker-tools/kb/search.test.ts` following the exact pattern from `tests/worker-tools/platform/report-issue.test.ts`
  - **Test infrastructure**: Local `http.Server` mock that captures requests and returns configurable responses. `beforeEach` resets captured state. `afterAll` closes the server.
  - **Test invocation**: Use `execFile('npx', ['tsx', SCRIPT_PATH, ...args], { env: { ...baseEnv, SUPABASE_URL: mockUrl } })` to run the tool in a subprocess.
  - **Test cases to implement** (minimum 10):
    1. `--help` flag → exit 0, stdout contains usage documentation (mentions `--entity-type`, `--entity-id`)
    2. Missing `SUPABASE_URL` → exit 1, stderr mentions `SUPABASE_URL`
    3. Missing `SUPABASE_SECRET_KEY` → exit 1, stderr mentions `SUPABASE_SECRET_KEY`
    4. Missing `TENANT_ID` (and no `--tenant-id`) → exit 1, stderr mentions `TENANT_ID`
    5. Missing `--entity-type` → exit 1, stderr mentions `--entity-type`
    6. Missing `--entity-id` → exit 1, stderr mentions `--entity-id`
    7. Successful fetch with both entity and common rows → exit 0, JSON has `content` string containing both entity-specific and common content, `entityFound: true`, `commonFound: true`, `entityType: "property"`, `entityId: "<uid>"`
    8. Entity not found (only common row returned) → exit 0, `entityFound: false`, `commonFound: true`, `content` contains only common content
    9. Common not found (only entity row returned) → exit 0, `entityFound: true`, `commonFound: false`, `content` contains only entity content
    10. Both rows missing (empty PostgREST response) → exit 0, `content: ""`, `entityFound: false`, `commonFound: false`
    11. PostgREST returns 500 → exit 1, stderr contains error message
    12. Cross-tenant isolation → mock captures request URLs — verify the tool passes `tenant_id=eq.{TENANT_ID}` in the PostgREST query params
  - **Mock server setup**:
    - Return configurable responses based on the test case
    - Capture request URLs so tests can assert on PostgREST query params (especially `tenant_id` filter)
    - Support returning empty arrays, single rows, and error responses

  **Must NOT do**:
  - Do NOT test against live PostgREST — mock only
  - Do NOT test the LLM's use of KB results — only test the tool's I/O contract
  - Do NOT add tests for GM-07 features (multi-property routing, property aliases)
  - Do NOT test with actual VLRE KB content — use minimal test fixtures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 12 test cases with mock server setup. Follows existing pattern but needs careful implementation of all edge cases.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 4 (shell tool must exist)

  **References**:

  **Pattern References** (CRITICAL — copy structure exactly):
  - `tests/worker-tools/platform/report-issue.test.ts` — **Primary pattern reference**. Copy the exact test structure: local `http.Server` mock, `capturedRequests` array, `beforeEach` reset, `execFile` subprocess invocation with env vars, stdout/stderr parsing. This is the canonical shell tool test pattern.
  - `tests/worker-tools/hostfully/get-property.test.ts` — Secondary reference. Shows how GET-based tools are tested (vs POST in report-issue). The KB search tool does GET.

  **API/Type References**:
  - `src/worker-tools/kb/search.ts` (Task 4) — The tool being tested. Test its complete CLI interface.

  **WHY Each Reference Matters**:
  - report-issue.test.ts is THE pattern to follow — it uses the exact test infrastructure (mock server, execFile, env vars) that this test file needs
  - get-property.test.ts shows GET-specific testing patterns

  **Acceptance Criteria**:
  - [ ] `tests/worker-tools/kb/search.test.ts` exists with 10+ test cases
  - [ ] All test cases use local `http.Server` mock (no live PostgREST)
  - [ ] `pnpm test tests/worker-tools/kb/search.test.ts -- --run` passes
  - [ ] Tests cover: help, missing env vars, missing args (`--entity-type`, `--entity-id`), successful full-content fetch, entity-only, common-only, both-missing, PostgREST error, cross-tenant isolation
  - [ ] Tests assert on both stdout content (JSON with `content`, `entityFound`, `commonFound`, `entityType`, `entityId`) and exit codes
  - [ ] No test references `--query` or `--property-id` — those parameters do not exist

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All shell tool tests pass
    Tool: Bash
    Preconditions: search.ts and search.test.ts both exist
    Steps:
      1. Run: pnpm test tests/worker-tools/kb/search.test.ts -- --run
      2. Assert: exit code 0
      3. Assert: output shows 8+ tests passing, 0 failures
    Expected Result: All test cases pass
    Failure Indicators: Any test failure, non-zero exit code
    Evidence: .sisyphus/evidence/task-5-test-results.txt

  Scenario: Tests don't use live services
    Tool: Bash (grep)
    Preconditions: Test file exists
    Steps:
      1. Search test file for any reference to "localhost:54321" or "localhost:54331" (real PostgREST/Kong)
      2. Assert: no matches found — all URLs should be the mock server
    Expected Result: No live service references
    Failure Indicators: Any URL pointing to real PostgREST
    Evidence: .sisyphus/evidence/task-5-no-live-services.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-test-results.txt — Test run output showing all passing
  - [ ] task-5-no-live-services.txt — Grep confirming no live service URLs

  **Commit**: YES (groups with Task 6)
  - Message: `test(kb): add shell tool and seed verification tests`
  - Files: `tests/worker-tools/kb/search.test.ts`, `tests/gateway/seed-property-kb.test.ts` (or `seed-guest-messaging.test.ts`), `tests/gateway/schema.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 6. Seed + Schema Verification Tests

  **What to do**:
  - **Schema test update** (`tests/gateway/schema.test.ts`):
    - First, determine the actual current table count. Run: `npx prisma db execute --stdin <<< "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name != '_prisma_migrations'"`. The `system_events` table was added in migration `20260422224712` — the assertion may already be stale.
    - Update the table count assertion to include `knowledge_base_entries` (current count + 1).
  - **Seed verification tests** (create `tests/gateway/seed-property-kb.test.ts` OR extend `tests/gateway/seed-guest-messaging.test.ts`):
    - Test 1: Verify 2 KB rows exist in `knowledge_base_entries` for VLRE tenant (`tenant_id = '00000000-0000-0000-0000-000000000003'`)
    - Test 2: Common row has `scope = 'common'`, `entity_type IS NULL`, `entity_id IS NULL`, `content` is non-empty and contains expected content (e.g., "General Policies")
    - Test 3: Entity row has `scope = 'entity'`, `entity_type = 'property'`, `entity_id = 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2'`, `content` is non-empty and contains property-specific content (e.g., "WiFi")
    - Test 4: `tool_registry` for guest-messaging archetype includes `/tools/kb/search.ts`
    - Test 5: No KB rows exist for DozalDevs tenant (tenant isolation)
    - Test 6: Deterministic UUIDs match expected values (`00000000-0000-0000-0000-000000000100` for common, `00000000-0000-0000-0000-000000000101` for entity)
  - Use `prisma.$queryRaw` for direct DB queries (same pattern as existing seed tests)
  - Run `pnpm prisma db seed` before tests if needed (or ensure test suite handles it)

  **Must NOT do**:
  - Do NOT create tests for multi-property KB scenarios (that's GM-07)
  - Do NOT hardcode the table count without verifying the actual current value first

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small test files following established patterns. The schema test is a single number change; seed tests are straightforward DB assertions.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (migration must exist), Task 3 (seed data must exist)

  **References**:

  **Pattern References**:
  - `tests/gateway/seed-guest-messaging.test.ts` — **Primary pattern reference** for seed verification tests. Uses `prisma.$queryRaw`, checks specific field values, verifies `tool_registry` contents. Follow this exact structure.
  - `tests/gateway/schema.test.ts` — The file to update with the new table count. Read it first to understand the assertion pattern and current value.

  **API/Type References**:
  - `prisma/seed.ts` — The seed file being tested. Reference the deterministic UUIDs and expected values.

  **WHY Each Reference Matters**:
  - seed-guest-messaging.test.ts is THE pattern for seed verification — copy its test structure, assertions, and Prisma query patterns
  - schema.test.ts needs its count updated — verify current value before changing

  **Acceptance Criteria**:
  - [ ] Schema test updated with correct table count (current + 1)
  - [ ] Seed verification tests exist with 6+ test cases
  - [ ] `pnpm test tests/gateway/schema.test.ts -- --run` passes
  - [ ] `pnpm test tests/gateway/seed-property-kb.test.ts -- --run` passes (or the extended seed-guest-messaging test)
  - [ ] Tests verify tenant isolation (no KB rows for wrong tenant)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Schema test passes with updated count
    Tool: Bash
    Preconditions: Migration applied, schema test updated
    Steps:
      1. Run: pnpm test tests/gateway/schema.test.ts -- --run
      2. Assert: exit code 0, all tests pass
    Expected Result: Schema test passes with new table count
    Failure Indicators: Test failure on table count assertion
    Evidence: .sisyphus/evidence/task-6-schema-test.txt

  Scenario: Seed verification tests pass
    Tool: Bash
    Preconditions: Seed run, test file exists
    Steps:
      1. Run: pnpm test tests/gateway/seed-property-kb.test.ts -- --run
      2. Assert: exit code 0, 6+ tests pass
    Expected Result: All seed assertions verified
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-6-seed-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-schema-test.txt — Schema test output
  - [ ] task-6-seed-tests.txt — Seed verification test output

  **Commit**: YES (groups with Task 5)
  - Message: `test(kb): add shell tool and seed verification tests`
  - Files: `tests/worker-tools/kb/search.test.ts`, `tests/gateway/seed-property-kb.test.ts`, `tests/gateway/schema.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Full Test Suite + E2E Verification

  **What to do**:
  - Run the complete test suite: `pnpm test -- --run` and ensure zero new failures
  - Pre-existing failures that are OK: `container-boot.test.ts`, `inngest-serve.test.ts` (see AGENTS.md)
  - Run `pnpm build` to verify TypeScript compilation
  - Run `pnpm lint` if configured
  - **E2E verification** (requires local services running):
    1. Start services: ensure Docker/PostgREST is running
    2. Apply migration: `npx prisma migrate dev`
    3. Run seed: `pnpm prisma db seed`
    4. Run the KB search tool against the real seeded database:
       ```bash
       SUPABASE_URL=http://localhost:54321 SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY TENANT_ID=00000000-0000-0000-0000-000000000003 \
       npx tsx src/worker-tools/kb/search.ts --entity-type property --entity-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
       ```
    5. Verify JSON output: `content` string contains both property-specific content (WiFi, check-in, parking) AND common content (cancellation policy, quiet hours, pet policy), `entityFound: true`, `commonFound: true`, `entityType: "property"`, `entityId: "c960c8d2-..."`
    6. Run with a non-existent entity ID to verify common-only fallback:
       ```bash
       SUPABASE_URL=http://localhost:54321 SUPABASE_SECRET_KEY=$SUPABASE_SECRET_KEY TENANT_ID=00000000-0000-0000-0000-000000000003 \
       npx tsx src/worker-tools/kb/search.ts --entity-type property --entity-id "nonexistent-uid"
       ```
    7. Verify fallback: `entityFound: false`, `commonFound: true`, `content` contains common policies only
    8. Verify PostgREST direct query for tenant isolation:
       ```bash
       curl -s "$SUPABASE_URL/rest/v1/knowledge_base_entries?tenant_id=eq.00000000-0000-0000-0000-000000000002&select=count" \
       -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" -H "Prefer: count=exact"
       ```
       Should return count=0 (DozalDevs has no KB rows)

  **Must NOT do**:
  - Do NOT skip any test files — run the full suite
  - Do NOT fix pre-existing test failures (container-boot, inngest-serve)
  - Do NOT modify code to make tests pass — if something fails, it's a bug from earlier tasks

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full suite verification with multiple E2E steps. Needs careful environment setup and result validation.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Tasks 5, 6 (all tests must exist first)

  **References**:

  **Pattern References**:
  - `scripts/verify-e2e.ts` — E2E verification script pattern. Shows how to run multiple checks against live services.

  **API/Type References**:
  - AGENTS.md "Commands" section — `pnpm test -- --run`, `pnpm build`, `pnpm lint`
  - AGENTS.md "Pre-existing Test Failures" — Which failures are expected

  **WHY Each Reference Matters**:
  - verify-e2e.ts shows the E2E verification pattern in this codebase
  - AGENTS.md documents expected failures to distinguish from regressions

  **Acceptance Criteria**:
  - [ ] `pnpm build` exits 0
  - [ ] `pnpm test -- --run` — zero new failures (only pre-existing ones)
  - [ ] E2E: KB search tool returns full content (property-specific + common) for seeded property, `entityFound: true`, `commonFound: true`
  - [ ] E2E: Non-existent entity returns common content only, `entityFound: false`, `commonFound: true`
  - [ ] E2E: DozalDevs tenant has 0 KB rows in `knowledge_base_entries` (tenant isolation)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All code changes from Tasks 1-6 complete
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
      3. Run: pnpm test -- --run
      4. Count passing/failing tests
      5. Assert: only container-boot.test.ts and inngest-serve.test.ts failures (pre-existing)
    Expected Result: Build succeeds, test suite passes with only known pre-existing failures
    Failure Indicators: New test failures, build errors
    Evidence: .sisyphus/evidence/task-7-test-suite.txt

  Scenario: E2E - Full content returned for seeded property
    Tool: Bash
    Preconditions: Services running, migration applied, seed run
    Steps:
      1. Set env: SUPABASE_URL=http://localhost:54321, SUPABASE_SECRET_KEY from .env, TENANT_ID=00000000-0000-0000-0000-000000000003
      2. Run: npx tsx src/worker-tools/kb/search.ts --entity-type property --entity-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
      3. Parse JSON output
      4. Assert: content string contains property-specific text (e.g., "WiFi")
      5. Assert: content string contains common text (e.g., "General Policies" or "cancellation")
      6. Assert: entityFound === true, commonFound === true
      7. Assert: entityType === "property", entityId === "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
    Expected Result: Full concatenated content from both entity and common KB rows
    Failure Indicators: Empty content, entityFound/commonFound false, exit code 1
    Evidence: .sisyphus/evidence/task-7-e2e-full-content.json

  Scenario: E2E - Common-only fallback for unknown entity
    Tool: Bash
    Preconditions: Same setup
    Steps:
      1. Run: npx tsx src/worker-tools/kb/search.ts --entity-type property --entity-id "nonexistent-uid"
      2. Parse JSON output
      3. Assert: entityFound === false, commonFound === true
      4. Assert: content string contains common policy content but NOT property-specific content
    Expected Result: Common content returned as fallback when entity not found
    Evidence: .sisyphus/evidence/task-7-e2e-common-fallback.json

  Scenario: E2E - Tenant isolation
    Tool: Bash
    Preconditions: Same setup
    Steps:
      1. Run: curl -s "http://localhost:54321/rest/v1/knowledge_base_entries?tenant_id=eq.00000000-0000-0000-0000-000000000002&select=count" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact"
      2. Assert: count = 0 (no DozalDevs KB rows)
      3. Run: curl -s "http://localhost:54321/rest/v1/knowledge_base_entries?tenant_id=eq.00000000-0000-0000-0000-000000000003&select=count" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact"
      4. Assert: count = 2 (VLRE has common + entity)
    Expected Result: Strict tenant isolation — only VLRE has KB data
    Evidence: .sisyphus/evidence/task-7-e2e-tenant-isolation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-test-suite.txt — Full test suite output
  - [ ] task-7-e2e-full-content.json — Full content fetch E2E result (entity + common)
  - [ ] task-7-e2e-common-fallback.json — Common-only fallback E2E result
  - [ ] task-7-e2e-tenant-isolation.txt — Tenant isolation verification

  **Commit**: NO (verification only — no file changes)

---

- [x] 8. Mark GM-03 Acceptance Criteria in Story Map + Notify

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - In the GM-03 section (around lines 456-463), change all 6 acceptance criteria from `- [ ]` to `- [x]`:
    ```
    - [x] KB content stored in a queryable format per tenant, per property (DB table or shell tool that reads from storage)
    - [x] Common policies (cancellation, quiet hours, pet policy) stored once per tenant, applied to all properties
    - [x] Property-specific KB (WiFi, parking, check-in code, amenity locations) stored per property
    - [x] Shell tool or mechanism for the OpenCode employee to query KB content: `tsx /tools/kb/search.ts --entity-type property --entity-id "<id>"`
    - [x] Seed one VLRE property's KB (port one file from standalone MVP's `knowledge-base/properties/`)
    - [x] KB content is tenant-isolated - one tenant's KB is never accessible to another tenant's employees
    ```
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ GM-03 (Single-Property Knowledge Base) complete — all tasks done, come back to review results."`

  **Must NOT do**:
  - Do NOT mark any other story criteria (GM-04, GM-07, etc.)
  - Do NOT modify any other part of the story-map document

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple text substitution in a markdown file + one notification command.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Post-FINAL, after user okay)
  - **Blocks**: None
  - **Blocked By**: F1-F4 (all verification must pass) + user explicit okay

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:456-463` — The exact lines to edit. Change `- [ ]` to `- [x]` for all 6 GM-03 criteria.
  - AGENTS.md "Prometheus Planning — Telegram Notifications" section — Notification pattern and script path.

  **WHY Each Reference Matters**:
  - The story-map document is where acceptance criteria live — exact line numbers prevent editing the wrong criteria
  - The Telegram notification is required by AGENTS.md rules

  **Acceptance Criteria**:
  - [ ] All 6 GM-03 criteria in story-map changed from `- [ ]` to `- [x]`
  - [ ] No other story criteria modified
  - [ ] Telegram notification sent successfully

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Story-map updated correctly
    Tool: Bash (grep)
    Preconditions: Story-map edited
    Steps:
      1. Search story-map for GM-03 section
      2. Count lines matching "- [x]" in the GM-03 acceptance criteria block
      3. Assert: 6 lines with [x]
      4. Count lines matching "- [ ]" in the GM-03 acceptance criteria block
      5. Assert: 0 lines with [ ] (all checked)
    Expected Result: All 6 criteria marked complete
    Failure Indicators: Unchecked criteria, wrong section edited
    Evidence: .sisyphus/evidence/task-8-story-map.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ GM-03 (Single-Property Knowledge Base) complete — all tasks done, come back to review results."
      2. Assert: exit code 0
    Expected Result: Notification delivered
    Evidence: .sisyphus/evidence/task-8-telegram.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-story-map.txt — Story-map GM-03 section showing all [x]
  - [ ] task-8-telegram.txt — Telegram notification confirmation

  **Commit**: YES
  - Message: `docs(story-map): mark GM-03 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (check file, query DB, run tool). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify shell tool follows the exact pattern from `report-issue.ts` (manual arg parsing, no external deps, stdout JSON, stderr errors).
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state (`pnpm prisma db seed`). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: seed → tool → verify output. Test edge cases: missing entity, non-existent entity type, cross-tenant query, both rows missing. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no extra columns, no `--query` parameter, no keyword filtering, no fuzzy search, no extra flags, no imports from src/, only GM-03 criteria marked. Detect cross-task contamination and unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task(s) | Commit Message                                             | Files                                                                                                  | Pre-commit Check     |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------- |
| 1             | `feat(kb): add knowledge_base_entries table`               | `prisma/schema.prisma`, `prisma/migrations/*/`                                                         | `pnpm build`         |
| 3, 4          | `feat(kb): add search shell tool and seed KB data`         | `src/worker-tools/kb/search.ts`, `prisma/seed.ts`                                                      | `pnpm build`         |
| 5, 6          | `test(kb): add shell tool and seed verification tests`     | `tests/worker-tools/kb/search.test.ts`, `tests/gateway/seed-*.test.ts`, `tests/gateway/schema.test.ts` | `pnpm test -- --run` |
| 7             | `chore(kb): verify full test suite and E2E`                | (no file changes — verification only)                                                                  | `pnpm test -- --run` |
| 8             | `docs(story-map): mark GM-03 acceptance criteria complete` | `docs/2026-04-21-2202-phase1-story-map.md`                                                             | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exit 0
pnpm test -- --run            # Expected: all pass (except pre-existing failures)
pnpm prisma db seed           # Expected: exit 0, no errors
npx tsx src/worker-tools/kb/search.ts --help  # Expected: exit 0, usage text
npx tsx src/worker-tools/kb/search.ts --entity-type property --entity-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"  # Expected: JSON with full KB content (requires env vars and seeded DB)
```

### Final Checklist

- [ ] All 6 "Must Have" items present
- [ ] All 11 "Must NOT Have" items absent
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] Build succeeds (`pnpm build`)
- [ ] GM-03 story-map criteria marked `[x]`
- [ ] Telegram notification sent
