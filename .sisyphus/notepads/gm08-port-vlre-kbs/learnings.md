# Learnings — gm08-port-vlre-kbs

## 2026-04-28 Session Start

### Key Facts

- Standalone MVP: `/Users/victordozal/repos/real-estate/vlre-employee/knowledge-base/`
- 16 property files in `properties/` + `common.md`
- Platform target: `knowledge_base_entries` table (NOT the legacy `knowledge_bases` table)
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- Known UID: 3505-BAN = `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` (already seeded at ID 000101)
- Admin API port: 7700 (local gateway)
- PostgREST port: 54321 (for search tool)
- DB port: 54322

### Seed State (before this plan)

- ID 000100: common KB (scope=common)
- ID 000101: 3505-BAN property (scope=entity, entity_id=c960c8d2...)
- ID 000102: test-property-alpha (DO NOT DELETE)
- ID 000103: test-property-beta (DO NOT DELETE)
- Seed test asserts count=4 (needs updating to 19 after Task 4)

### Hostfully Credentials

- NOT in .env — stored as encrypted tenant secrets in DB
- ENCRYPTION_KEY is available in .env
- Retrieve via: query tenant_secrets table, decrypt with src/lib/encryption.ts
- Or pass as CLI args: `--api-key <key> --agency-uid <uid>`
- Hostfully API base: `https://api.hostfully.com/api/v3.2`
- Auth header: `X-HOSTFULLY-APIKEY: <key>`

### scripts/ Style

- TypeScript, run via npx tsx
- Uses process.argv for CLI args (no libraries like commander/yargs — see trigger-task.ts)
- Uses $.verbose = false for zx if needed, or raw fetch()
- stdout for output, stderr for logging/errors
- Exit code 0 = success, 1 = error

### Existing Hostfully API Pattern (get-properties.ts)

- Cursor pagination: `_paging._nextCursor`
- Response shape: `{ properties: [...], _paging: { _nextCursor?: string } }`
- Property has: `uid`, `name`, `address.address`, `address.city`, `address.state`, `address.zipCode`

## 2026-04-29 Task-8 Idempotency & Regression Verification

### Migration Script Idempotency (Second Run)
- Second run: Created: 0, Updated: 0, Skipped: 6, Errors: 1 (common scope 500 — pre-existing)
- Exit code: 0
- No [CREATE] lines in output — fully idempotent

### Row Count
- After second run: 10 rows (unchanged)
- Alpha fixture (000102): intact, entity_id=test-property-alpha
- Beta fixture (000103): intact, entity_id=test-property-beta

### Full Test Suite Results
- Test Files: 12 failed | 113 passed | 3 skipped (128 total)
- Tests: 57 failed | 1358 passed | 14 skipped (1429 total)
- ALL 12 failing test files had 0 diff vs HEAD — none modified by task-8
- Failing files: admin-kb-crud, inngest-serve, jira-webhook-with-new-project, employee-dispatcher, tenant-repository, installation-store, task-creation, lifecycle, between-wave-push, branch-manager, fallback-pr, opencode-server
- Conclusion: NO new regressions from task-8

### admin-kb-crud.test.ts Failures (2 tests)
- "duplicate entity entry → 409 CONFLICT" — pre-existing from GM-07 commit 7ea91a9
- "list with ?entity_type=property&entity_id=<seeded-id> → 200, returns exactly 1 entry" — pre-existing
- These tests were added in GM-07 and were already failing before task-8

### Evidence Files
- .sisyphus/evidence/task-8-idempotent-run.txt
- .sisyphus/evidence/task-8-count-unchanged.txt
- .sisyphus/evidence/task-8-fixtures-intact.txt
- .sisyphus/evidence/task-8-seed-tests.txt
- .sisyphus/evidence/task-8-full-test-suite.txt
