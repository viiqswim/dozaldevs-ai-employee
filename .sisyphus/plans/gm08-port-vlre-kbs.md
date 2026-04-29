# GM-08: Port All VLRE Property Knowledge Bases

## TL;DR

> **Quick Summary**: Migrate 16 property KB markdown files + common policies from the standalone VLRE MVP repo into the platform's `knowledge_base_entries` table, with Hostfully property UID resolution, a standalone migration script, Prisma seed upserts, and thorough verification.
>
> **Deliverables**:
>
> - `scripts/resolve-hostfully-uids.ts` — fetches Hostfully API, matches properties by address, outputs `scripts/vlre-uid-mapping.json`
> - `scripts/migrate-vlre-kb.ts` — reads standalone MVP files + mapping, upserts into platform via Admin API
> - Updated `prisma/seed.ts` — 15 new property entries + updated common KB content
> - Updated `tests/gateway/seed-property-kb.test.ts` — count + spot-checks
> - New `tests/scripts/migrate-vlre-kb.test.ts` — migration script unit tests
> - Updated `docs/2026-04-21-2202-phase1-story-map.md` — GM-08 checkboxes marked complete
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 2 → [human review] → Task 3 → Tasks 4+5 (parallel) → Task 6 → Task 7 → Task 8 → F1-F4

---

## Context

### Original Request

Implement GM-08 from the Phase 1 story map: migrate all 16 VLRE per-property knowledge bases and the common policies document from the standalone MVP into the platform's KB storage. Verify thoroughly via automated tests and API endpoints. Mark story map items as complete.

### Interview Summary

**Key Discussions**:

- **Hostfully UID resolution**: Standalone MVP uses property codes (e.g., `3505-ban`); platform uses Hostfully UIDs as `entity_id`. User chose: build a Hostfully API lookup script to resolve UIDs by matching addresses.
- **Migration approach**: User chose both — standalone migration script for production + Prisma seed upserts for dev resilience.
- **Common KB**: User chose to replace existing seed content with the full standalone MVP `common.md` (more comprehensive).
- **Multi-unit properties**: 3505-BAN covers 4 Hostfully listings (home + 3 rooms), 7213-NUT covers 5 listings. Decision: each property file maps to its **parent/home property UID only** — same pattern as the existing seed (3505-BAN → single UID `c960c8d2...`). Sub-unit UIDs are not mapped. Total stays at 16 property entries.

**Research Findings**:

- GM-07 is complete — CRUD API, schema, PostgREST grants, shell tool all in place
- Standalone MVP at `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/`
- `property-map.json` has 16 entries with codes, names, addresses — no Hostfully UIDs
- Only 1 UID known: 3505-BAN = `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
- `get-properties.ts` worker tool exists with pagination — can be adapted for the resolve script
- Hostfully credentials are tenant secrets, not in `.env` — resolve script will accept CLI args
- Seed currently has 4 VLRE KB entries (IDs `000100`-`000103`); test asserts count=4
- `search.ts` lowercases `entity_id` before querying — all UIDs must be stored lowercase

### Metis Review

**Identified Gaps** (addressed):

- **Credential injection**: `resolve-hostfully-uids.ts` accepts `--api-key` and `--agency-uid` as CLI args (no `.env` pollution)
- **Multi-unit strategy**: Parent UID only per property file — matches existing seed pattern. Total = 16 property entries, not 25+
- **Address matching confidence**: Resolve script produces `scripts/vlre-uid-mapping.json` as intermediate artifact for human review before migration runs
- **3505-BAN dedup**: Seed keeps existing ID `000101`; migration script upserts by `entity_id` unique constraint, not by deterministic UUID
- **Common KB delta**: Must diff current seed content vs standalone MVP `common.md` — update only if different
- **Test fixture preservation**: `test-property-alpha` and `test-property-beta` (IDs `000102`/`000103`) must survive
- **Character count guard**: Migration script logs warning + skips files > 100,000 chars
- **Entity ID case**: All UIDs `.toLowerCase()` before insert

---

## Work Objectives

### Core Objective

Migrate all 16 VLRE property knowledge bases and the common policies document from the standalone MVP into the platform's `knowledge_base_entries` table, making them queryable by Hostfully property ID and resilient to DB resets via seed.

### Concrete Deliverables

- `scripts/resolve-hostfully-uids.ts` — UID resolution script
- `scripts/vlre-uid-mapping.json` — code-to-UID mapping (committed to repo)
- `scripts/migrate-vlre-kb.ts` — idempotent migration script
- Updated `prisma/seed.ts` with all 16 properties + updated common KB
- Updated seed verification test
- New migration script tests
- GM-08 checkboxes marked in story map

### Definition of Done

- [ ] `GET /admin/tenants/.../kb/entries?entity_type=property` returns 16+ entries (16 real + 2 test)
- [ ] 3 WiFi spot-checks pass via search tool
- [ ] `pnpm test -- --run` passes with no new failures
- [ ] Migration script runs twice with identical row count (idempotent)
- [ ] All 5 GM-08 acceptance criteria checkboxes marked in story map

### Must Have

- All 16 VLRE property KB files migrated with correct Hostfully UIDs
- Common KB updated with full standalone MVP content
- Idempotent migration (safe to re-run)
- Seed resilience (survives `prisma db seed`)
- Automated test verification
- Story map update

### Must NOT Have (Guardrails)

- **No modifications** to `src/inngest/`, `src/gateway/`, `src/workers/`, or `src/worker-tools/` — data migration + scripts + tests only
- **No new Prisma migrations** — `knowledge_base_entries` table already exists
- **No schema changes** to Admin API, shell tool, or DB
- **No DozalDevs tenant changes** — VLRE only
- **No multi-unit KB splitting** — one file = one KB entry = parent property UID
- **No live Hostfully API calls** in automated tests — use fixtures/mocks
- **No KB management UI** — scripts only
- **No archetype instruction changes** — search tool already handles any property UID dynamically
- **No content quality validation** — migrate files as-is
- **No excessive comments or JSDoc** — follow existing script patterns

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after)
- **Framework**: vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Scripts**: Use Bash — run script, validate output JSON/exit code
- **API**: Use Bash (curl) — send requests, assert status + response fields
- **Seed**: Use Bash — run `pnpm prisma db seed`, query DB, assert counts

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential due to credential dependency):
├── Task 1: Build UID resolution script [quick]
├── Task 2: Run UID resolution + human review gate [quick]

Wave 2 (Core migration + seed — can be parallel):
├── Task 3: Build migration script [unspecified-high]
├── Task 4: Update prisma/seed.ts with all properties [unspecified-high]
├── Task 5: Update seed verification test [quick]

Wave 3 (Verification):
├── Task 6: Run migration + API verification [unspecified-high]
├── Task 7: WiFi spot-check verification [quick]

Wave 4 (Wrap-up):
├── Task 8: Idempotency + regression test [quick]
├── Task 9: Mark GM-08 story map checkboxes [quick]
├── Task 10: Send Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks  | Wave  |
| ----- | ---------- | ------- | ----- |
| 1     | —          | 2       | 1     |
| 2     | 1          | 3, 4, 5 | 1     |
| 3     | 2          | 6       | 2     |
| 4     | 2          | 5, 6, 8 | 2     |
| 5     | 2, 4       | 8       | 2     |
| 6     | 3, 4       | 7, 8    | 3     |
| 7     | 6          | 8       | 3     |
| 8     | 4, 5, 6, 7 | 9       | 4     |
| 9     | 8          | F1-F4   | 4     |
| 10    | 9          | —       | 4     |
| F1-F4 | 9          | —       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 3 tasks — T3 → `unspecified-high`, T4 → `unspecified-high`, T5 → `quick`
- **Wave 3**: 2 tasks — T6 → `unspecified-high`, T7 → `quick`
- **Wave 4**: 3 tasks — T8 → `quick`, T9 → `quick`, T10 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Build Hostfully UID Resolution Script

  **What to do**:
  - Create `scripts/resolve-hostfully-uids.ts` that:
    1. Accepts CLI args: `--api-key <key>`, `--agency-uid <uid>`, `--output <path>` (default: `scripts/vlre-uid-mapping.json`), `--dry-run` (print to stdout, don't write file)
    2. Reads `property-map.json` from the standalone MVP at `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/property-map.json`
    3. Calls Hostfully API `GET /api/v3.2/properties?agencyUid=<uid>` with cursor-based pagination (follow pattern from `src/worker-tools/hostfully/get-properties.ts`)
    4. For each of the 16 entries in `property-map.json`, matches by **address** against the Hostfully API results. Use normalized string comparison: lowercase, trim whitespace, strip trailing commas. Match by street address prefix (e.g., `"3505 Banton"` matches `"3505 Banton Rd, Austin, TX 78722"`). For multi-unit properties, take the first match (parent/home listing).
    5. Outputs a JSON file with structure: `{ "mappings": [ { "code": "3505-ban", "address": "...", "hostfullyUid": "c960c8d2-...", "confidence": "exact|fuzzy|manual" } ], "unmatched": [ { "code": "...", "address": "..." } ] }`
    6. All Hostfully UIDs must be `.toLowerCase()` before writing
    7. Exit code 0 if all 16 matched, exit code 1 if any unmatched (but still writes the file with partial results + unmatched list)
    8. Logs summary to stderr: `Matched: 15/16, Unmatched: 1 (see "unmatched" in output)`
  - The script must NOT read from `.env` or Prisma or tenant secrets — it takes credentials as CLI args only

  **Must NOT do**:
  - Do not modify any source code files
  - Do not hardcode Hostfully API keys in the script
  - Do not call Hostfully API in tests — use mocked responses

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file script creation following existing patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — straightforward TypeScript script

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-properties.ts:48-108` — Hostfully API call pattern: auth header (`X-HOSTFULLY-APIKEY`), cursor pagination, property response shape with `uid`, `name`, `address.city`, `address.state`
  - `src/worker-tools/hostfully/get-property.ts:17-29` — Address formatting function showing Hostfully address structure: `{ address, city, state, zipCode, countryCode }`

  **Data References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/property-map.json` — Source of 16 property codes + addresses to match against

  **API References**:
  - Hostfully API base URL: `https://api.hostfully.com/api/v3.2`
  - Auth: `X-HOSTFULLY-APIKEY: <api-key>` header
  - Endpoint: `GET /properties?agencyUid=<uid>` with cursor pagination via `_paging._nextCursor`

  **WHY Each Reference Matters**:
  - `get-properties.ts` — Copy exact pagination loop, response parsing, and error handling patterns. DO NOT reinvent.
  - `property-map.json` — Each entry has `code`, `names[]`, `address`, `kbFile`. Use `address` for matching, `code` as the key in the mapping output.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Script shows help when --help is passed
    Tool: Bash
    Preconditions: Script file exists at scripts/resolve-hostfully-uids.ts
    Steps:
      1. Run: tsx scripts/resolve-hostfully-uids.ts --help
      2. Assert stdout contains "--api-key" and "--agency-uid" and "--output"
    Expected Result: Help text printed, exit code 0
    Evidence: .sisyphus/evidence/task-1-help-output.txt

  Scenario: Script fails gracefully when API key missing
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: tsx scripts/resolve-hostfully-uids.ts (no args)
      2. Assert stderr contains "api-key" or "required"
      3. Assert exit code is non-zero
    Expected Result: Error message about missing credentials, exit code 1
    Evidence: .sisyphus/evidence/task-1-missing-args-error.txt

  Scenario: Script compiles without errors
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: npx tsc --noEmit scripts/resolve-hostfully-uids.ts --skipLibCheck --esModuleInterop --module nodenext --moduleResolution nodenext --target es2022
      2. Assert exit code 0
    Expected Result: No TypeScript compilation errors
    Evidence: .sisyphus/evidence/task-1-tsc-check.txt
  ```

  **Commit**: YES (group with Task 2)
  - Message: `feat(scripts): add Hostfully UID resolution script for VLRE properties`
  - Files: `scripts/resolve-hostfully-uids.ts`
  - Pre-commit: TypeScript compile check

- [x] 2. Run UID Resolution and Generate Mapping File

  **What to do**:
  - Run the resolve script with real Hostfully API credentials (user will provide or they exist as tenant secrets):
    ```bash
    tsx scripts/resolve-hostfully-uids.ts \
      --api-key "$HOSTFULLY_API_KEY" \
      --agency-uid "$HOSTFULLY_AGENCY_UID" \
      --output scripts/vlre-uid-mapping.json
    ```
  - Review the output file to verify all 16 properties matched
  - If any unmatched: check the `"unmatched"` array, try to manually resolve by searching Hostfully API response for similar addresses
  - Verify known mapping: `3505-ban` should map to `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` (case-insensitive)
  - Commit the `scripts/vlre-uid-mapping.json` mapping file to the repo (it's an auditable artifact)
  - **HUMAN REVIEW GATE**: After generating the mapping, present the results to the user for review before proceeding to Task 3+. Show each code→UID mapping and confidence level. If all 16 are "exact" match, proceed. If any are "fuzzy" or "manual", get explicit user approval.

  **Must NOT do**:
  - Do not proceed to migration (Task 3+) without verifying the mapping is correct
  - Do not modify the resolve script — only run it

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Script execution + verification, no coding
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: Task 1

  **References**:

  **Data References**:
  - `scripts/resolve-hostfully-uids.ts` — Script created in Task 1
  - Output: `scripts/vlre-uid-mapping.json` — Will be consumed by Tasks 3 and 4

  **WHY Each Reference Matters**:
  - The mapping file is the single most failure-prone artifact — a bad mapping silently inserts wrong UIDs. Must be human-verified.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mapping file contains all 16 properties
    Tool: Bash
    Preconditions: scripts/vlre-uid-mapping.json exists after running resolve script
    Steps:
      1. Run: cat scripts/vlre-uid-mapping.json | jq '.mappings | length'
      2. Assert output is 16
      3. Run: cat scripts/vlre-uid-mapping.json | jq '.unmatched | length'
      4. Assert output is 0
    Expected Result: 16 matched, 0 unmatched
    Evidence: .sisyphus/evidence/task-2-mapping-count.txt

  Scenario: Known UID mapping is correct (3505-BAN)
    Tool: Bash
    Preconditions: scripts/vlre-uid-mapping.json exists
    Steps:
      1. Run: cat scripts/vlre-uid-mapping.json | jq -r '.mappings[] | select(.code == "3505-ban") | .hostfullyUid'
      2. Assert output equals "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
    Expected Result: UID matches the known value
    Evidence: .sisyphus/evidence/task-2-known-uid-check.txt

  Scenario: All UIDs are lowercase
    Tool: Bash
    Preconditions: scripts/vlre-uid-mapping.json exists
    Steps:
      1. Run: cat scripts/vlre-uid-mapping.json | jq -r '.mappings[].hostfullyUid' | grep '[A-Z]' | wc -l
      2. Assert output is 0 (no uppercase characters)
    Expected Result: All UIDs are lowercase
    Evidence: .sisyphus/evidence/task-2-lowercase-check.txt
  ```

  **Commit**: YES (combined with Task 1)
  - Message: `feat(scripts): add Hostfully UID resolution script for VLRE properties`
  - Files: `scripts/resolve-hostfully-uids.ts`, `scripts/vlre-uid-mapping.json`
  - Pre-commit: `tsc --noEmit`

- [x] 3. Build VLRE KB Migration Script

  **What to do**:
  - Create `scripts/migrate-vlre-kb.ts` that:
    1. Accepts CLI args: `--api-url <url>` (default: `http://localhost:7700`), `--admin-key <key>`, `--mapping <path>` (default: `scripts/vlre-uid-mapping.json`), `--kb-dir <path>` (default: `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base`), `--dry-run` (log actions without calling API), `--help`
    2. Reads `vlre-uid-mapping.json` and validates all 16 entries have `hostfullyUid` populated
    3. For each property in the mapping: reads the corresponding `.md` file from `--kb-dir/properties/<code>.md`, validates content length ≤ 100,000 chars (log warning + skip if exceeded)
    4. Reads `common.md` from `--kb-dir/common.md`
    5. For the common KB: calls `GET /admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries?entity_type=&entity_id=` (scope=common filter), then either creates or updates via the Admin API
    6. For each property KB: calls `GET /admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries?entity_type=property&entity_id=<uid>` to check if exists, then either `POST` (create) or `PATCH` (update) — this is the idempotency mechanism
    7. All `entity_id` values must be `.toLowerCase()` before any API call
    8. Tenant ID is hardcoded to VLRE: `00000000-0000-0000-0000-000000000003`
    9. Logs each operation to stderr: `[CREATE] 3505-ban → c960c8d2... (467 lines, 12345 chars)` or `[UPDATE] 3505-ban → c960c8d2... (content changed)` or `[SKIP] 3505-ban → c960c8d2... (content unchanged)`
    10. Exits with summary: `Migrated: 16/16 properties + 1 common | Created: 5 | Updated: 11 | Skipped: 1 | Errors: 0`
    11. Exit code 0 if all succeeded, 1 if any errors
  - Create `tests/scripts/migrate-vlre-kb.test.ts` with unit tests:
    - Mock the Admin API (fetch or http server)
    - Test: dry-run mode doesn't call API
    - Test: creates new entry when GET returns empty
    - Test: updates entry when GET returns existing with different content
    - Test: skips entry when GET returns existing with same content
    - Test: handles content > 100,000 chars gracefully (skip + warning)
    - Test: handles API error gracefully (logs error, continues to next property)
    - Test: all UIDs are lowercased in API calls

  **Must NOT do**:
  - Do not use Prisma directly — use Admin API (HTTP) for portability
  - Do not hardcode API keys in the script
  - Do not modify any source code in `src/`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-concern script (file I/O, HTTP, validation, error handling) with comprehensive test suite
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 2 (needs mapping file)

  **References**:

  **Pattern References**:
  - `scripts/trigger-task.ts` — Example of a scripts/ file using CLI args and HTTP calls in this project (shows code style, error handling patterns)
  - `src/gateway/routes/admin-kb.ts` — Admin API route structure: POST creates, GET lists with query params, PATCH updates. Shows response shapes.

  **API References**:
  - `POST /admin/tenants/:tenantId/kb/entries` — body: `{ entity_type?: string, entity_id?: string, content: string }`. Scope auto-derived: if entity_id present → `entity`. 201 on create, 409 on duplicate.
  - `GET /admin/tenants/:tenantId/kb/entries?entity_type=property&entity_id=<uid>` — returns `{ entries: [...] }`. Filter by entity_type and entity_id.
  - `PATCH /admin/tenants/:tenantId/kb/entries/:entryId` — body: `{ content: string }`. Only content is mutable.
  - All require `X-Admin-Key` header.

  **Data References**:
  - `scripts/vlre-uid-mapping.json` — Mapping file from Task 2
  - `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/properties/*.md` — Source KB files (16 files)
  - `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/common.md` — Source common KB

  **Test References**:
  - `tests/worker-tools/knowledge_base/search.test.ts` — Example of testing a script that calls HTTP APIs with mocked servers (shows vitest patterns for HTTP mocking)

  **WHY Each Reference Matters**:
  - `admin-kb.ts` — Must understand exact request/response shapes to build correct HTTP calls
  - `search.test.ts` — Copy the HTTP mocking pattern for testing the migration script without hitting real API

  **Acceptance Criteria**:
  - [ ] `tests/scripts/migrate-vlre-kb.test.ts` passes: `pnpm test -- --run tests/scripts/migrate-vlre-kb.test.ts`
  - [ ] Script compiles: `npx tsc --noEmit scripts/migrate-vlre-kb.ts --skipLibCheck --esModuleInterop --module nodenext --moduleResolution nodenext --target es2022`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Help text shows usage
    Tool: Bash
    Preconditions: scripts/migrate-vlre-kb.ts exists
    Steps:
      1. Run: tsx scripts/migrate-vlre-kb.ts --help
      2. Assert stdout contains "--api-url", "--admin-key", "--mapping", "--kb-dir", "--dry-run"
    Expected Result: Help text with all CLI options
    Evidence: .sisyphus/evidence/task-3-help-output.txt

  Scenario: Dry-run mode logs actions without API calls
    Tool: Bash
    Preconditions: scripts/vlre-uid-mapping.json exists with valid mappings
    Steps:
      1. Run: tsx scripts/migrate-vlre-kb.ts --admin-key test --dry-run 2>&1
      2. Assert stderr contains "[DRY-RUN]" for each property
      3. Assert no HTTP calls were made (no connection errors even without running gateway)
    Expected Result: All 16 properties + common logged as dry-run, exit code 0
    Evidence: .sisyphus/evidence/task-3-dry-run.txt

  Scenario: Unit tests pass
    Tool: Bash
    Preconditions: Test file exists
    Steps:
      1. Run: pnpm test -- --run tests/scripts/migrate-vlre-kb.test.ts
      2. Assert all tests pass
    Expected Result: 7+ tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-3-unit-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(scripts): add VLRE KB migration script`
  - Files: `scripts/migrate-vlre-kb.ts`, `tests/scripts/migrate-vlre-kb.test.ts`
  - Pre-commit: `pnpm test -- --run tests/scripts/migrate-vlre-kb.test.ts`

- [x] 4. Update Prisma Seed with All 16 VLRE Property KBs

  **What to do**:
  - Update `prisma/seed.ts`:
    1. Read `scripts/vlre-uid-mapping.json` to get the code→UID mapping for all 16 properties
    2. Replace the `VLRE_COMMON_KB_CONTENT` constant (currently at line 459) with the full content of `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/common.md` — copy the entire markdown content as a template literal
    3. Replace the `VLRE_PROPERTY_3505_BAN_KB_CONTENT` constant (currently at line 658) with the full content of the corresponding standalone MVP file (`/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/properties/3505-ban.md`) to ensure parity
    4. Add 15 new `VLRE_PROPERTY_*_KB_CONTENT` constants, one for each remaining property file. Read content from the standalone MVP files.
    5. Add 15 new `prisma.knowledgeBaseEntry.upsert()` calls after the existing 3505-BAN entry, following the same pattern:
       - Deterministic UUIDs: `00000000-0000-0000-0000-000000000104` through `00000000-0000-0000-0000-000000000118`
       - `tenant_id`: `00000000-0000-0000-0000-000000000003` (VLRE)
       - `entity_type`: `'property'`
       - `entity_id`: Hostfully UID from mapping file (lowercase)
       - `scope`: `'entity'`
       - `content`: The property-specific markdown content
    6. Keep `test-property-alpha` (ID `000102`) and `test-property-beta` (ID `000103`) unchanged
    7. Keep the existing 3505-BAN entry at ID `000101` but update its content to match the standalone MVP file exactly
  - **CRITICAL**: The seed file will grow significantly with 16 large markdown constants. This is expected and matches the existing pattern (the seed already has large inline content constants).
  - **IMPORTANT**: Due to how large the seed file will become with all 16 property content constants inlined, consider extracting the KB content constants into a separate file `prisma/seed-kb-content.ts` that exports them, then importing in `seed.ts`. This keeps `seed.ts` readable. Follow whatever pattern seems cleanest.

  **Must NOT do**:
  - Do not remove or modify `test-property-alpha` or `test-property-beta` entries
  - Do not change the UUID of the existing 3505-BAN entry (`000101`)
  - Do not change the UUID of the common KB entry (`000100`)
  - Do not touch DozalDevs tenant seed data

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Large file modifications with 16 property content constants, careful UUID sequencing, and content parity verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Tasks 5, 6, 8
  - **Blocked By**: Task 2 (needs mapping file for UIDs)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:1284-1360` — Existing KB seed pattern: deterministic UUIDs, upsert with `where: { id }`, `update: { content }`, `create: { id, tenant_id, entity_type, entity_id, scope, content }`
  - `prisma/seed.ts:459-657` — Existing `VLRE_COMMON_KB_CONTENT` constant structure (large template literal with markdown)
  - `prisma/seed.ts:658-840` — Existing `VLRE_PROPERTY_3505_BAN_KB_CONTENT` constant structure

  **Data References**:
  - `scripts/vlre-uid-mapping.json` — code→UID mapping (from Task 2)
  - `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/common.md` — Full common KB content to replace current seed constant
  - `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/properties/*.md` — 16 property files to inline as content constants

  **WHY Each Reference Matters**:
  - Existing seed pattern at lines 1284-1360 — MUST follow identical upsert structure to maintain consistency
  - Property-map.json + uid-mapping.json together provide the complete code→file→UID mapping chain

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` runs successfully
  - [ ] All 19 KB entries exist after seed (1 common + 16 properties + 2 test)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs successfully
    Tool: Bash
    Preconditions: Database is running, migrations applied
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert exit code 0
      3. Assert stdout contains 19 "KnowledgeBaseEntry upserted" lines (or similar count)
    Expected Result: Seed completes without errors
    Evidence: .sisyphus/evidence/task-4-seed-run.txt

  Scenario: All 19 KB entries exist after seed
    Tool: Bash
    Preconditions: Seed has been run
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*) FROM knowledge_base_entries WHERE tenant_id = '00000000-0000-0000-0000-000000000003'::uuid"
      2. Assert count = 19
    Expected Result: 19 rows for VLRE tenant
    Evidence: .sisyphus/evidence/task-4-row-count.txt

  Scenario: Test fixture rows preserved
    Tool: Bash
    Preconditions: Seed has been run
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT entity_id FROM knowledge_base_entries WHERE id IN ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000103'::uuid)"
      2. Assert results include "test-property-alpha" and "test-property-beta"
    Expected Result: Both test fixtures exist with correct entity_ids
    Evidence: .sisyphus/evidence/task-4-fixtures-preserved.txt
  ```

  **Commit**: YES (group with Task 5)
  - Message: `feat(seed): add all 16 VLRE property KBs to seed`
  - Files: `prisma/seed.ts` (or `prisma/seed.ts` + `prisma/seed-kb-content.ts` if extracted)
  - Pre-commit: `pnpm prisma db seed`

- [x] 5. Update Seed Verification Test

  **What to do**:
  - Update `tests/gateway/seed-property-kb.test.ts`:
    1. Change the count assertion from `4` to `19` (1 common + 16 real properties + 2 test fixtures)
    2. Update the `deterministic UUIDs match expected values` test to check for 19 rows instead of 4
    3. Add spot-check assertions for 3 representative new properties (pick 3 from different address ranges):
       - Verify `scope` is `'entity'`
       - Verify `entity_type` is `'property'`
       - Verify `entity_id` matches the Hostfully UID from the mapping
       - Verify `content` contains a known string from the source file (e.g., a street address or WiFi password)
    4. Keep all existing test assertions — only extend, don't rewrite
    5. Add a new test: "common KB contains full standalone MVP content" — verify content contains key strings from the standalone `common.md` that weren't in the old seed (e.g., "Service Directory" or another section unique to the full file)

  **Must NOT do**:
  - Do not rewrite the entire test file — only update count assertions and add new test cases
  - Do not add tests that call live Hostfully API

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small test file update — count changes + a few new assertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (but should be in same wave as Task 4 since it depends on seed content)
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 8
  - **Blocked By**: Task 2 (needs UID mapping for assertion values), Task 4 (needs seed to be updated)

  **References**:

  **Pattern References**:
  - `tests/gateway/seed-property-kb.test.ts` — Existing test file to extend (the entire file at 90 lines). Follow exact assertion patterns used for 3505-BAN spot-check.

  **Data References**:
  - `scripts/vlre-uid-mapping.json` — Use 3 UID values from this file for spot-check assertions
  - Source property files — Pick 3 properties and note a unique identifying string in each (for content assertion)

  **WHY Each Reference Matters**:
  - Must follow the exact Prisma raw query pattern used in existing tests (e.g., `$queryRaw` with template literals)

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/seed-property-kb.test.ts` passes after seed update

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed verification tests pass
    Tool: Bash
    Preconditions: Seed has been run (Task 4), test DB setup (`pnpm test:db:setup`)
    Steps:
      1. Run: pnpm test -- --run tests/gateway/seed-property-kb.test.ts
      2. Assert all tests pass (expect 7+ tests)
    Expected Result: All assertions pass including new count and spot-checks
    Evidence: .sisyphus/evidence/task-5-seed-tests.txt

  Scenario: Spot-check property content is correct
    Tool: Bash
    Preconditions: Seed has been run
    Steps:
      1. Pick one of the spot-check properties (e.g., 4403-hay)
      2. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT content FROM knowledge_base_entries WHERE entity_type = 'property' AND entity_id = '<hostfully-uid-for-4403-hay>'"
      3. Assert content contains "4403 Hayride" (street address from source file)
    Expected Result: Content matches source file
    Evidence: .sisyphus/evidence/task-5-content-spot-check.txt
  ```

  **Commit**: YES (group with Task 4)
  - Message: `feat(seed): add all 16 VLRE property KBs to seed`
  - Files: `tests/gateway/seed-property-kb.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/seed-property-kb.test.ts`

- [x] 6. Run Migration Against Local DB and Verify via Admin API

  **What to do**:
  - Ensure local services are running (`pnpm dev:start`)
  - Run the migration script against local DB:
    ```bash
    tsx scripts/migrate-vlre-kb.ts \
      --api-url http://localhost:7700 \
      --admin-key $ADMIN_API_KEY \
      --mapping scripts/vlre-uid-mapping.json \
      --kb-dir /Users/victordozal/repos/real-estate/vlre-employee/knowledge-base
    ```
  - Verify via Admin API:
    1. `GET /admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries` — assert 19 total entries
    2. `GET /admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries?entity_type=property` — assert 18 entries (16 real + 2 test)
    3. For each of the 16 real properties: verify `entity_id` matches the UID from the mapping, `scope` is `'entity'`, content is non-empty
    4. Verify common KB entry: `scope` is `'common'`, content contains key sections from standalone `common.md`

  **Must NOT do**:
  - Do not modify any source code — only run scripts and verify

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple verification steps requiring API calls and data validation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Tasks 3, 4

  **References**:

  **API References**:
  - `GET /admin/tenants/:tenantId/kb/entries` — returns `{ entries: [...] }`, auth via `X-Admin-Key` header
  - `GET /admin/tenants/:tenantId/kb/entries?entity_type=property` — filter by entity type

  **WHY Each Reference Matters**:
  - Admin API is the primary verification interface — proves data landed correctly

  **Acceptance Criteria**:
  - [ ] Migration script exits 0
  - [ ] Admin API returns 19 total entries for VLRE tenant
  - [ ] All 16 real property entries have correct entity_id, scope, and non-empty content

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration script completes successfully
    Tool: Bash
    Preconditions: Local gateway running on port 7700, mapping file exists
    Steps:
      1. Run: tsx scripts/migrate-vlre-kb.ts --api-url http://localhost:7700 --admin-key $ADMIN_API_KEY
      2. Assert exit code 0
      3. Assert stderr summary shows "Errors: 0"
    Expected Result: All properties migrated, zero errors
    Evidence: .sisyphus/evidence/task-6-migration-output.txt

  Scenario: Admin API returns correct total count
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries" | jq '.entries | length'
      2. Assert output is 19
    Expected Result: 19 total KB entries
    Evidence: .sisyphus/evidence/task-6-total-count.txt

  Scenario: Property entries have correct metadata
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries?entity_type=property" | jq '.entries | length'
      2. Assert output is 18 (16 real + 2 test)
      3. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries?entity_type=property" | jq '[.entries[] | select(.entity_id | test("test-property-")) | .entity_id] | sort'
      4. Assert output includes "test-property-alpha" and "test-property-beta"
    Expected Result: 18 property entries including both test fixtures
    Evidence: .sisyphus/evidence/task-6-property-entries.txt

  Scenario: Common KB updated with full content
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries" | jq -r '[.entries[] | select(.scope == "common")] | .[0].content' | head -5
      2. Assert output contains "VL Real Estate" or similar header from common.md
    Expected Result: Common KB has full standalone MVP content
    Evidence: .sisyphus/evidence/task-6-common-kb.txt
  ```

  **Commit**: NO (verification only, no file changes)

- [x] 7. WiFi Spot-Check Verification (3 Properties)

  **What to do**:
  - Spot-check 3 different properties via the search shell tool to verify WiFi password correctness
  - Use the shell tool the same way the worker would (PostgREST query, not Admin API):
    ```bash
    SUPABASE_URL="http://localhost:54321" \
    SUPABASE_SECRET_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    TENANT_ID="00000000-0000-0000-0000-000000000003" \
    tsx src/worker-tools/knowledge_base/search.ts \
      --entity-type property \
      --entity-id <hostfully-uid>
    ```
  - Check 3 properties:
    1. **3505-BAN** (already-seeded property, verify content updated) — known WiFi appears in the KB content
    2. **Pick a property from a different city** (e.g., one of the San Antonio properties: 407-GEV or 219-PAU) — verify WiFi/address info
    3. **Pick a property from a third location** (e.g., 1602-BLU in Bailey, CO or one of the Hayride properties) — verify WiFi/address info
  - For each property: verify the response JSON has `entityFound: true`, `commonFound: true`, and `content` contains the property-specific WiFi info (check against the source `.md` file)

  **Must NOT do**:
  - Do not modify any files — verification only
  - Do not use the Admin API for this — use the PostgREST-based search tool (simulates real worker behavior)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Script execution + output verification, no coding
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:

  **Tool References**:
  - `src/worker-tools/knowledge_base/search.ts` — The shell tool to invoke. Uses PostgREST to query `knowledge_base_entries`. Accepts `--entity-type`, `--entity-id`, optionally `--tenant-id`. Output JSON: `{ content, entityFound, commonFound, entityType, entityId }`

  **Data References**:
  - `scripts/vlre-uid-mapping.json` — Get UIDs for the 3 spot-check properties
  - Source property files — Read WiFi passwords from the `.md` files to know what to assert

  **WHY Each Reference Matters**:
  - This verifies the full query path: PostgREST → DB → merged content — same path a real guest messaging worker would use

  **Acceptance Criteria**:
  - [ ] 3 properties return `entityFound: true`, `commonFound: true`
  - [ ] Content contains correct WiFi info for each property

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 3505-BAN WiFi spot-check
    Tool: Bash
    Preconditions: Migration complete, PostgREST running on port 54321
    Steps:
      1. Run: SUPABASE_URL="http://localhost:54321" SUPABASE_SECRET_KEY="$SUPABASE_SERVICE_ROLE_KEY" TENANT_ID="00000000-0000-0000-0000-000000000003" tsx src/worker-tools/knowledge_base/search.ts --entity-type property --entity-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2
      2. Parse JSON output
      3. Assert entityFound == true
      4. Assert commonFound == true
      5. Assert content contains "3505 Banton" (address from source file)
    Expected Result: Property-specific content returned with common content merged
    Evidence: .sisyphus/evidence/task-7-spot-check-3505-ban.json

  Scenario: Second property spot-check (San Antonio property)
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. Get UID for 407-gev (or 219-pau) from scripts/vlre-uid-mapping.json
      2. Run search tool with that UID
      3. Assert entityFound == true
      4. Assert content contains the property address (e.g., "407 S Gevers" or "219 Paul")
    Expected Result: Correct property content returned
    Evidence: .sisyphus/evidence/task-7-spot-check-second.json

  Scenario: Third property spot-check (different city/state)
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. Get UID for 1602-blu (Bailey, CO) from scripts/vlre-uid-mapping.json
      2. Run search tool with that UID
      3. Assert entityFound == true
      4. Assert content contains "1602 Bluebird" or "Bailey"
    Expected Result: Correct property content returned
    Evidence: .sisyphus/evidence/task-7-spot-check-third.json
  ```

  **Commit**: NO (verification only)

- [x] 8. Idempotency and Regression Verification

  **What to do**:
  - Run the migration script a **second time** and verify row count is unchanged:
    ```bash
    tsx scripts/migrate-vlre-kb.ts --api-url http://localhost:7700 --admin-key $ADMIN_API_KEY
    ```
  - Verify the summary shows operations as `[SKIP]` or `[UPDATE]` with "content unchanged" — no new creates
  - Verify total count via Admin API is still 19
  - Run the full test suite to catch any regressions:
    ```bash
    pnpm test -- --run
    ```
  - Verify test-property-alpha and test-property-beta still exist:
    ```bash
    curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries/00000000-0000-0000-0000-000000000102" \
      | jq '.entity_id'
    # Expected: "test-property-alpha"
    ```
  - Run seed verification test specifically:
    ```bash
    pnpm test -- --run tests/gateway/seed-property-kb.test.ts
    ```

  **Must NOT do**:
  - Do not modify any files — verification only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Script execution + verification commands, no coding
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Wave 3)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:

  **Why This Task Exists**:
  - GM-08 acceptance criterion #5: "Migration is idempotent (safe to re-run)"
  - Proves no duplicate rows are created on re-run
  - Full test suite run catches any regressions from seed changes

  **Acceptance Criteria**:
  - [ ] Second migration run: 0 new creates, exit code 0
  - [ ] Row count unchanged at 19
  - [ ] `pnpm test -- --run` passes with no new failures
  - [ ] Test fixtures survive

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Second migration run is idempotent
    Tool: Bash
    Preconditions: Migration already ran once successfully (Task 6)
    Steps:
      1. Run: tsx scripts/migrate-vlre-kb.ts --api-url http://localhost:7700 --admin-key $ADMIN_API_KEY 2>&1
      2. Assert exit code 0
      3. Assert stderr does NOT contain "[CREATE]" (nothing new created)
      4. Assert stderr contains "[SKIP]" or "[UPDATE]" for all entries
    Expected Result: All operations are skip/update, none are create
    Evidence: .sisyphus/evidence/task-8-idempotent-run.txt

  Scenario: Row count unchanged after second run
    Tool: Bash
    Preconditions: Second migration run complete
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries" | jq '.entries | length'
      2. Assert output is 19
    Expected Result: Same count as after first run
    Evidence: .sisyphus/evidence/task-8-count-unchanged.txt

  Scenario: Full test suite passes
    Tool: Bash (tmux — may take > 30s)
    Preconditions: All code changes committed
    Steps:
      1. Run in tmux: pnpm test -- --run 2>&1 | tee /tmp/gm08-tests.log
      2. Wait for completion
      3. Assert no new test failures vs baseline
    Expected Result: All tests pass (known pre-existing failures excluded)
    Evidence: .sisyphus/evidence/task-8-full-test-suite.txt

  Scenario: Test fixtures intact
    Tool: Bash
    Preconditions: Migration and seed both run
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries/00000000-0000-0000-0000-000000000102" | jq '.entity_id'
      2. Assert output is "test-property-alpha"
      3. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries/00000000-0000-0000-0000-000000000103" | jq '.entity_id'
      4. Assert output is "test-property-beta"
    Expected Result: Both test fixture entries exist with correct entity_ids
    Evidence: .sisyphus/evidence/task-8-fixtures-intact.txt
  ```

  **Commit**: NO (verification only)

- [x] 9. Mark GM-08 Story Map Checkboxes Complete

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`:
    1. Find the GM-08 acceptance criteria section (around lines 730-736)
    2. Change all 5 `[ ]` checkboxes to `[x]`:
       - `[x]` All 16 VLRE property KBs migrated into platform storage
       - `[x]` Common policies document migrated as tenant-wide KB
       - `[x]` Each KB is queryable by the Hostfully property ID
       - `[x]` Spot-check 3 properties: query the KB tool for "WiFi password" and confirm the correct property-specific answer is returned
       - `[x]` Migration is idempotent (safe to re-run)

  **Must NOT do**:
  - Do not modify any other stories in the story map
  - Do not change GM-08's metadata (complexity, dependencies, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial file edit — 5 checkbox toggles
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 8)
  - **Blocks**: Task 10, F1-F4
  - **Blocked By**: Task 8

  **References**:

  **File References**:
  - `docs/2026-04-21-2202-phase1-story-map.md` — Story map document containing GM-08 acceptance criteria checkboxes

  **Acceptance Criteria**:
  - [ ] All 5 GM-08 checkboxes changed from `[ ]` to `[x]` in the story map

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 5 GM-08 checkboxes marked complete
    Tool: Bash (grep)
    Preconditions: Story map file edited
    Steps:
      1. Run: grep -A 10 "GM-08.*Acceptance Criteria" docs/2026-04-21-2202-phase1-story-map.md | grep -c "\[x\]"
      2. Assert count is 5
      3. Run: grep -A 10 "GM-08.*Acceptance Criteria" docs/2026-04-21-2202-phase1-story-map.md | grep -c "\[ \]"
      4. Assert count is 0
    Expected Result: 5 checked, 0 unchecked
    Evidence: .sisyphus/evidence/task-9-checkboxes.txt
  ```

  **Commit**: YES
  - Message: `docs(story-map): mark GM-08 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: none

- [x] 10. Send Telegram Completion Notification

  **What to do**:
  - Send Telegram notification that GM-08 plan execution is complete:
    ```bash
    tsx scripts/telegram-notify.ts "✅ GM-08 Port All VLRE Property KBs — complete. All 16 property KBs migrated, 3 WiFi spot-checks passed, migration idempotent. Come back to review results."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 9)
  - **Blocks**: None
  - **Blocked By**: Task 9

  **References**:
  - `scripts/telegram-notify.ts` — Telegram notification script (AGENTS.md mandate)

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ GM-08 Port All VLRE Property KBs — complete."
      2. Assert exit code 0
    Expected Result: Notification delivered
    Evidence: .sisyphus/evidence/task-10-telegram.txt
  ```

  **Commit**: NO (notification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (migration → API → search tool chain). Test edge cases: empty state, re-run idempotency. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                  | Files                                                                 | Pre-commit           |
| ------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------- |
| 1      | `feat(scripts): add Hostfully UID resolution script for VLRE properties` | `scripts/resolve-hostfully-uids.ts`, `scripts/vlre-uid-mapping.json`  | `tsc --noEmit`       |
| 2      | `feat(scripts): add VLRE KB migration script`                            | `scripts/migrate-vlre-kb.ts`, `tests/scripts/migrate-vlre-kb.test.ts` | `pnpm test -- --run` |
| 3      | `feat(seed): add all 16 VLRE property KBs to seed`                       | `prisma/seed.ts`, `tests/gateway/seed-property-kb.test.ts`            | `pnpm test -- --run` |
| 4      | `docs(story-map): mark GM-08 acceptance criteria complete`               | `docs/2026-04-21-2202-phase1-story-map.md`                            | —                    |

---

## Success Criteria

### Verification Commands

```bash
# Row count — 18 total (1 common + 16 properties + 2 test fixtures... wait, test fixtures are entity scope too)
# Actually: 1 common + 16 real properties + 2 test properties = 19 total, 18 entity-scope
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries" \
  | jq '.entries | length'
# Expected: 19

# Property count only
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries?entity_type=property" \
  | jq '.entries | length'
# Expected: 18 (16 real + 2 test)

# Idempotency
tsx scripts/migrate-vlre-kb.ts --api-url http://localhost:7700 --admin-key $ADMIN_API_KEY
tsx scripts/migrate-vlre-kb.ts --api-url http://localhost:7700 --admin-key $ADMIN_API_KEY
# Row count unchanged

# Tests
pnpm test -- --run
# Expected: all pass, no new failures

# Seed resilience
pnpm prisma db seed
pnpm test -- --run tests/gateway/seed-property-kb.test.ts
# Expected: pass
```

### Final Checklist

- [ ] All 16 VLRE property KBs in platform storage
- [ ] Common KB updated with full standalone MVP content
- [ ] Each KB queryable by Hostfully property ID
- [ ] 3 WiFi spot-checks pass
- [ ] Migration idempotent
- [ ] Seed survives DB reset
- [ ] Test fixtures (`test-property-alpha`, `test-property-beta`) intact
- [ ] All tests pass
- [ ] GM-08 story map checkboxes marked
