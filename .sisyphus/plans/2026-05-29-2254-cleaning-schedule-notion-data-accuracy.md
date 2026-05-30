# Cleaning Schedule — Notion Data Accuracy & Business Rules

## TL;DR

> **Quick Summary**: Replace the 2 old Notion data sources (Cleaning Zones + Trash Schedule) with 3 new, more complete pages (Directorio Operativo, Manual de Personal, Reporte Financiero). Update execution_steps to follow real business rules (Golden Rule, trash overhead, team assignments by ZIP). Fix mock fixtures to match real Notion data. Re-trigger and verify no more fabricated "Loft" designations.
>
> **Deliverables**:
>
> - Updated `execution_steps` and `identity` in `prisma/seed.ts` referencing 3 new Notion page IDs
> - 3 new mock fixture files matching real Notion API data
> - Old fixtures deleted
> - Live DB updated
> - Verified Slack output with correct service types, costs, and team assignments
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1/T2 → T3 → T4 → T5 → T6

---

## Context

### Original Request

The user reported that Austin properties (3412 Sand Dunes Ave, 3420 Hovenweep Ave) were being labeled as "Loft (60 min)" in the cleaning schedule output. Investigation revealed the AI employee's real Notion API call returned no service type data from the Cleaning Zones page, so the AI fell back to mock fixtures containing fabricated data. The user then provided 3 new Notion pages that collectively contain all the data the employee needs.

### Investigation Findings

- **Real Notion API works** (200 OK, valid token) — the Cleaning Zones page just doesn't have service types or costs
- **The only property with "Loft" is 407 S Gevers St** (San Antonio) per the Reporte Financiero
- **3 new Notion pages** provided by user contain a strict superset of the old 2 pages:
  - Directorio Operativo: properties by ZIP, unit types, per-property trash details
  - Manual de Personal: team assignments, Golden Rule, trash overhead rules
  - Reporte Financiero: service types with exact costs and durations per property
- **Mock mode does NOT recurse** into `has_children` blocks — fixtures must flatten all nested content into top-level blocks

### Metis Review

**Identified Gaps** (addressed):

- Fixtures must be created from real API output, not fabricated — confirmed all 3 pages return 200 OK
- `default.json` is a stale duplicate — will be deleted
- Both `create` and `update` blocks in seed.ts must stay in sync
- Model override to `deepseek/deepseek-v4-flash` recommended for verification

---

## Work Objectives

### Core Objective

Switch the cleaning-schedule AI employee from 2 old Notion pages to 3 new, comprehensive pages and update the business logic to follow real assignment rules.

### Concrete Deliverables

- `prisma/seed.ts` — `execution_steps` and `identity` updated in BOTH create (L3519-3643) and update (L3644-3766) blocks
- `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json` — new fixture
- `src/worker-tools/notion/fixtures/get-page/manual-personal.json` — new fixture
- `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json` — new fixture
- Old fixtures deleted: `cleaning-zones.json`, `trash-schedule.json`, `default.json`
- Live DB row `00000000-0000-0000-0000-000000000019` updated via psql
- `docs/employees/cleaning-schedule.md` updated with new page IDs

### Definition of Done

- [ ] AI employee reads 3 new Notion pages (not old ones)
- [ ] Output uses correct service types from Reporte Financiero (no fabricated "Loft" for Austin)
- [ ] Golden Rule applied when applicable
- [ ] Costs match Reporte Financiero data
- [ ] Team assignments follow Manual de Personal rules

### Must Have

- All 3 new Notion page IDs in execution_steps
- Business rules from Manual de Personal (Golden Rule, trash overhead, team assignment by ZIP)
- Cost/duration lookup from Reporte Financiero
- Real API data in mock fixtures (flattened for mock mode compatibility)

### Must NOT Have (Guardrails)

- No fabricated/guessed service type data — all must come from Reporte Financiero
- No changes to `src/inngest/`, `src/gateway/`, or any shared platform files
- No new shell tools
- No unit tests (skip — 63 pre-existing failures)
- No `NOTION_MOCK=true` fallback logic in execution_steps — the AI must NEVER use mock mode as a workaround
- No `pnpm prisma db seed` — direct psql UPDATE only (protect learned rules)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: None (skip — pre-existing failures)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — parallel):
├── Task 1: Create 3 new mock fixtures from real Notion API data [quick]
└── Task 2: Update execution_steps + identity in prisma/seed.ts [deep]

Wave 2 (After Wave 1):
└── Task 3: Back up DB + apply SQL UPDATE [quick]

Wave 3 (After Wave 2):
└── Task 4: Override model + trigger + verify output [deep]

Wave 4 (After Wave 3 — parallel):
├── Task 5: Update docs/employees/cleaning-schedule.md [quick]
└── Task 6: Commit all changes + Telegram notification [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1+T2 → T3 → T4 → T5+T6 → F1-F4 → user okay
Max Concurrent: 2 (Wave 1, Wave 4)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| T1   | —          | T3     |
| T2   | —          | T3     |
| T3   | T1, T2     | T4     |
| T4   | T3         | T5, T6 |
| T5   | T4         | F1-F4  |
| T6   | T4, T5     | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 2 — T1 → `quick`, T2 → `deep`
- **Wave 2**: 1 — T3 → `quick`
- **Wave 3**: 1 — T4 → `deep`
- **Wave 4**: 2 — T5 → `quick`, T6 → `quick`
- **FINAL**: 4 — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Create 3 new mock fixture files from real Notion API data

  **What to do**:
  - For each of the 3 new Notion pages, fetch the real content via the decrypted `notion_access_token`:
    - `370d540b4380809a8ea0c11074f92abb` → Directorio Operativo de Propiedades
    - `370d540b438080969a72c16c20defc70` → Manual de Personal y Reglas de Asignación
    - `370d540b438080ca8676e61856488960` → Reporte Financiero y Tarifas Base
  - To fetch: decrypt the token from `tenant_secrets` (tenant `00000000-0000-0000-0000-000000000003`, key `notion_access_token`) using `decrypt()` from `src/lib/encryption.ts`, then call `https://api.notion.com/v1/blocks/{pageId}/children?page_size=100` with `Authorization: Bearer {token}` and `Notion-Version: 2022-06-28`
  - **CRITICAL**: The real API response recurses into child blocks, but mock mode does NOT. You must call the API recursively (follow `has_children: true` blocks up to depth 3) and then FLATTEN all blocks into a single top-level `results` array in each fixture
  - Create each fixture at `src/worker-tools/notion/fixtures/get-page/`:
    - `directorio-operativo.json` — property directory with ZIP codes, unit types, trash details
    - `manual-personal.json` — team directory, assignment rules
    - `reporte-financiero.json` — service types with costs and durations per property
  - Each fixture must follow the exact JSON structure of the existing fixtures:
    ```json
    {
      "object": "list",
      "results": [
        {
          "object": "block",
          "id": "<real-block-id>",
          "type": "paragraph",
          "has_children": false,
          "paragraph": { "rich_text": [{ "plain_text": "..." }] }
        }
      ],
      "has_more": false,
      "next_cursor": null
    }
    ```
  - Delete old fixture files: `cleaning-zones.json`, `trash-schedule.json`, `default.json`
  - Verify each new fixture works in mock mode:
    ```bash
    NOTION_MOCK=true npx tsx src/worker-tools/notion/get-page.ts --page-id 370d540b4380809a8ea0c11074f92abb --fixture directorio-operativo
    ```

  **Must NOT do**:
  - Do NOT fabricate or guess any data — every block must come from the real API response
  - Do NOT leave `has_children: true` on any block in the fixture (mock mode ignores children)
  - Do NOT keep old fixtures around "just in case"

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward file creation from API data — no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/notion/fixtures/get-page/cleaning-zones.json` — existing fixture JSON structure (copy this format exactly)
  - `src/worker-tools/notion/get-page.ts:139-165` — mock mode code that reads fixtures (only processes top-level `results`, no recursion)

  **API/Type References**:
  - `src/lib/encryption.ts:27-35` — `decrypt()` function signature: takes `{ ciphertext, iv, auth_tag }`, returns plaintext string
  - `src/worker-tools/notion/auth.ts:6-18` — shows how token is used: `Authorization: Bearer ${token}`

  **WHY Each Reference Matters**:
  - `cleaning-zones.json` — copy the exact JSON shape so mock mode parses it correctly
  - `get-page.ts:139-165` — understand that mock mode only reads `results[].type[].rich_text[].plain_text` at top level

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — all 3 fixtures return valid content in mock mode
    Tool: Bash
    Preconditions: New fixture files exist at src/worker-tools/notion/fixtures/get-page/
    Steps:
      1. Run: NOTION_MOCK=true npx tsx src/worker-tools/notion/get-page.ts --page-id 370d540b4380809a8ea0c11074f92abb --fixture directorio-operativo
      2. Parse output JSON — verify success: true, blockCount > 30
      3. Verify content contains "ZIP CODE: 78744" and "3401 Breckenridge Dr"
      4. Run: NOTION_MOCK=true npx tsx src/worker-tools/notion/get-page.ts --page-id 370d540b438080969a72c16c20defc70 --fixture manual-personal
      5. Parse output JSON — verify success: true, blockCount > 10
      6. Verify content contains "Regla de Oro" and "Yessica"
      7. Run: NOTION_MOCK=true npx tsx src/worker-tools/notion/get-page.ts --page-id 370d540b438080ca8676e61856488960 --fixture reporte-financiero
      8. Parse output JSON — verify success: true, blockCount > 15
      9. Verify content contains "407 S Gevers St" and "Loft ($60" and "3412 Sand Dunes Ave" and "Home ($135"
    Expected Result: All 3 fixtures parse successfully with expected content
    Failure Indicators: success: false, blockCount: 0, or missing expected text
    Evidence: .sisyphus/evidence/task-1-fixtures-mock-mode.txt

  Scenario: Old fixtures deleted
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: ls src/worker-tools/notion/fixtures/get-page/
      2. Verify ONLY these files exist: directorio-operativo.json, manual-personal.json, reporte-financiero.json
      3. Verify cleaning-zones.json, trash-schedule.json, default.json do NOT exist
    Expected Result: Only 3 new fixture files present
    Evidence: .sisyphus/evidence/task-1-old-fixtures-deleted.txt
  ```

  **Commit**: YES (groups with T2)
  - Message: `fix(cleaning-schedule): switch to 3 new Notion pages with real business rules and costs`
  - Files: `src/worker-tools/notion/fixtures/get-page/*.json`
  - Pre-commit: `pnpm build`

- [ ] 2. Update execution_steps and identity in prisma/seed.ts

  **What to do**:
  - Edit `prisma/seed.ts` — the cleaning-schedule archetype is at lines 3518-3767
  - **CRITICAL**: Edit BOTH the `create` block (L3519-3643) AND the `update` block (L3644-3766) — they MUST be identical
  - Update `identity` (L3524 and L3648) to reference the 3 new Notion documents instead of "cleaning zone assignments and trash schedule"
  - Rewrite `execution_steps` (L3525-3609 and L3649-3733) with the following changes:

  **STEP 2 — Replace old Notion page references with 3 new pages**:
  - Remove old page IDs: `36fd540b4380809ca373ca83e90216a3` (trash), `36fd540b438080b2be9cf4b4218d657b` (zones)
  - Add 3 new pages:
    - `370d540b4380809a8ea0c11074f92abb` → `--fixture directorio-operativo` (property directory: addresses, ZIP codes, unit types, per-property trash schedule)
    - `370d540b438080969a72c16c20defc70` → `--fixture manual-personal` (team directory, assignment rules)
    - `370d540b438080ca8676e61856488960` → `--fixture reporte-financiero` (service types, costs, durations per property)
  - Update the parse instructions to describe what to extract from each page

  **STEP 3 — Rewrite assignment logic with real business rules from Manual de Personal**:

  The following rules MUST be encoded verbatim in the execution_steps:
  1. **Golden Rule (Regla de Oro)**: If the day's itinerary includes a "HOME" listing AND multiple "Rooms" listings for THE SAME ADDRESS, IGNORE the Rooms' times and payments entirely. Assign ONLY the Home cleaning. Example: if 3401 Breckenridge Dr has checkouts for HOME and Room-1, Room-2, Room-3 → treat it as ONE Home cleaning ($120, 100 min), not Home + 3 Rooms.

  2. **Team Assignment by ZIP Code** (from Manual de Personal):
     - ZIPs 78744 + 78640 (Austin/Kyle): Yessica = primary (Mon-Fri 10AM-5PM, Sat 11AM-3PM). Diana = exclusive for 271 Gina Dr daily + backup for rest of 78744/78640 (except Sundays). Berenice/Angela/Susana = backup weekends or if Yessica exceeds 6.5 hrs/day.
     - ZIPs 78203 + 78109 (San Antonio/Converse): Zenaida = primary (every day). Abi/Rocio = Mon-Fri. Norma = weekends + backup.
     - ZIP 80421 (Bailey, CO): Mary or Carrie.

  3. **Trash Overhead Rules** (from Manual de Personal):
     - Trash rules ONLY apply to ZIPs 78744 and 78640
     - Mon-Fri: add 45 minutes extra to the day's total time for trash duties
     - Exception: if the ONLY property to clean that day is 271 Gina Dr, do NOT add the 45 minutes
     - If the target date IS a collection day for a property, add task: "Confirmar recolección y Guardar botes"

  4. **Cost/Duration Lookup** (from Reporte Financiero) — the AI must look up each property's service type, cost, and duration from the Reporte Financiero page. NEVER guess or fabricate. If a property is not found in the Reporte Financiero, note it as "Tarifa no encontrada" in the output.

  5. **Equitable Distribution**: If multiple cleaners are active in the same ZIP on the same day, balance the workload (hours) fairly across them.

  **STEP 4 — Update output format**:
  - Keep the existing format structure (already correct from previous plan)
  - Add: if trash overhead applies (45 min), show it in the per-cleaner summary as extra time
  - Add: if collection day, show "🗑️ Confirmar recolección y Guardar botes" under the relevant property

  **Must NOT do**:
  - Do NOT change tool_registry, input_schema, risk_model, or any other archetype fields
  - Do NOT add `NOTION_MOCK=true` as a fallback in execution_steps
  - Do NOT reference old page IDs anywhere
  - Do NOT hardcode property-specific costs in execution_steps — the AI must read them from the Reporte Financiero page at runtime

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex rewrite of business logic in execution_steps — must faithfully encode all rules from Manual de Personal without losing existing format/output structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3518-3643` — current `create` block for cleaning-schedule archetype (the template to modify)
  - `prisma/seed.ts:3644-3766` — current `update` block (MUST stay identical to create block)

  **API/Type References**:
  - `prisma/seed.ts:3628-3637` — `input_schema` definition (do NOT change — already correct)

  **External References**:
  - Real Notion page content (fetched during investigation — use these as the authoritative source):
    - **Directorio Operativo** (57 blocks): Properties by ZIP with unit types and trash schedules. Key format: `📍 ZIP CODE: 78744 (Austin, TX)` → property addresses → `🏠 Unidades: Home | Rooms 1-3` → `🗑️ Basura: Martes (Sacar Lunes)`
    - **Manual de Personal** (22 blocks): Team directory with availability + 4 business rules (Golden Rule, trash overhead, equitable distribution, reminder scheduling)
    - **Reporte Financiero** (23 blocks): Per-property pricing. Key format: `3412 Sand Dunes Ave: Home ($135 - 250 min) | Rooms 1-4 ($30 c/u - 25 min)`. The ONLY "Loft" is `407 S Gevers St: Loft ($60 - 60 min)`

  **WHY Each Reference Matters**:
  - `seed.ts:3518-3643` — this is the exact code to modify; executor must understand the full template structure
  - `seed.ts:3644-3766` — MUST be kept in sync with create block; executor must edit BOTH
  - Notion page content — the authoritative source for all business rules and pricing data

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create and update blocks are identical
    Tool: Bash
    Preconditions: seed.ts has been edited
    Steps:
      1. Extract execution_steps from create block and save to /tmp/create-steps.txt
      2. Extract execution_steps from update block and save to /tmp/update-steps.txt
      3. Run: diff /tmp/create-steps.txt /tmp/update-steps.txt
    Expected Result: No differences (empty diff output)
    Failure Indicators: Any diff output means blocks are out of sync
    Evidence: .sisyphus/evidence/task-2-blocks-sync.txt

  Scenario: New page IDs present, old ones removed
    Tool: Bash
    Preconditions: seed.ts has been edited
    Steps:
      1. grep -c "370d540b4380809a8ea0c11074f92abb" prisma/seed.ts → expect 2 (create + update)
      2. grep -c "370d540b438080969a72c16c20defc70" prisma/seed.ts → expect 2
      3. grep -c "370d540b438080ca8676e61856488960" prisma/seed.ts → expect 2
      4. grep -c "36fd540b4380809ca373ca83e90216a3" prisma/seed.ts → expect 0 (old trash page gone)
      5. grep -c "36fd540b438080b2be9cf4b4218d657b" prisma/seed.ts → expect 0 (old zones page gone)
    Expected Result: 2,2,2,0,0
    Evidence: .sisyphus/evidence/task-2-page-ids.txt

  Scenario: Golden Rule is encoded
    Tool: Bash
    Preconditions: seed.ts has been edited
    Steps:
      1. grep -i "regla de oro\|golden rule\|ignore.*room\|IGNORA.*Rooms" prisma/seed.ts
    Expected Result: At least 1 match — the Golden Rule must be explicitly stated
    Evidence: .sisyphus/evidence/task-2-golden-rule.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run: pnpm build
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES (groups with T1)
  - Message: `fix(cleaning-schedule): switch to 3 new Notion pages with real business rules and costs`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [ ] 3. Back up archetype DB row and apply SQL UPDATE

  **What to do**:
  - Back up the current archetype row:
    ```bash
    PGPASSWORD=postgres pg_dump -h localhost -p 54322 -U postgres -d ai_employee \
      -t archetypes --data-only --inserts \
      --where="id = '00000000-0000-0000-0000-000000000019'" \
      > /tmp/cleaning-schedule-archetype-backup-v2.sql
    ```
  - Read the updated `execution_steps` and `identity` from `prisma/seed.ts` (from Task 2's output)
  - Apply via psql UPDATE (escape single quotes by doubling them):
    ```sql
    UPDATE archetypes
    SET execution_steps = '<new execution_steps from seed.ts>',
        identity = '<new identity from seed.ts>',
        updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000019';
    ```
  - Verify the update applied correctly

  **Must NOT do**:
  - Do NOT run `pnpm prisma db seed` — it would overwrite learned rules and other tenant data
  - Do NOT modify any field other than `execution_steps`, `identity`, and `updated_at`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple DB backup + UPDATE command
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `/tmp/cleaning-schedule-archetype-backup.sql` — previous backup from earlier session (813 lines) — same backup pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DB has new page IDs
    Tool: Bash
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" | grep -c "370d540b"
      2. Expected: 3 (all 3 new page IDs)
      3. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" | grep -c "36fd540b"
      4. Expected: 0 (no old page IDs)
    Expected Result: 3 new IDs, 0 old IDs
    Evidence: .sisyphus/evidence/task-3-db-update.txt

  Scenario: Backup file exists
    Tool: Bash
    Steps:
      1. Run: wc -l /tmp/cleaning-schedule-archetype-backup-v2.sql
    Expected Result: File exists with > 0 lines
    Evidence: .sisyphus/evidence/task-3-backup.txt
  ```

  **Commit**: NO (DB-only change, no code)

- [ ] 4. Override model, trigger employee, and verify output

  **What to do**:
  - Override the model to `deepseek/deepseek-v4-flash` for reliable tool calling:
    ```sql
    UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash'
    WHERE id = '00000000-0000-0000-0000-000000000019';
    ```
  - Trigger the employee for a date that has checkouts. Use 2026-05-30 (known to have 5 checkouts across Austin and San Antonio):
    ```bash
    source .env
    curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
      -d '{"inputs":{"date":"2026-05-30"}}' | jq '{task_id: .task_id}'
    ```
  - Wait for task to reach Done (poll every 30s, timeout 5 min)
  - Check the Slack message in channel C0B71QSMZKQ for:
    1. **No "Loft" for Austin properties** — 3412 Sand Dunes Ave and 3420 Hovenweep Ave must show "Home", NOT "Loft"
    2. **Correct costs** — costs must match Reporte Financiero (e.g., 3412 Sand Dunes = $135/250min, 3420 Hovenweep = $120/100min)
    3. **Correct team assignments** — Austin properties assigned to Yessica (primary for 78744), San Antonio properties assigned to Zenaida (primary for 78203)
    4. **219 Paul St** shows as Home ($120 - 90 min), NOT Loft
    5. **Golden Rule** — if any address has both Home + Room checkouts, only the Home should appear
    6. **Trash overhead** — if it's a weekday (Fri May 30), check if 45-min overhead is reflected
    7. **Format** — organized by cleaner, real addresses, Spanish date, summary section with costs
  - After verification, restore original model:
    ```sql
    UPDATE archetypes SET model = 'minimax/minimax-m2.7'
    WHERE id = '00000000-0000-0000-0000-000000000019';
    ```

  **Must NOT do**:
  - Do NOT accept "Done" task status as sufficient verification — must inspect actual Slack message content
  - Do NOT leave the model overridden after testing

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires triggering a real task, waiting for completion, and detailed output verification against multiple criteria
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/task-3-slack-message.txt` — Slack output from previous verification run (from format improvement plan) — compare against this to verify improvements
  - `.sisyphus/evidence/task-3-format-checks.txt` — previous format criteria results

  **External References**:
  - Reporte Financiero costs (ground truth for verification):
    - 3401 Breckenridge Dr: Home $120/100min
    - 3412 Sand Dunes Ave: Home $135/250min | Rooms 1-4 $30 c/u/25min
    - 3420 Hovenweep Ave: Home $120/100min | Rooms 1-3 $30 c/u/25min
    - 219 Paul St: Home $120/90min
    - 407 S Gevers St: Bundle $165/120min | Home $130/90min | Loft $60/60min (ONLY loft property)
    - 6930 Heron Flats: Home $125/90min

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Task reaches Done
    Tool: Bash
    Steps:
      1. Trigger task with date 2026-05-30
      2. Poll status every 30s for up to 5 minutes
      3. Check: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
    Expected Result: "Done"
    Failure Indicators: "Failed", "Cancelled", or timeout
    Evidence: .sisyphus/evidence/task-4-task-status.txt

  Scenario: No "Loft" for Austin properties in Slack output
    Tool: Bash
    Preconditions: Task reached Done
    Steps:
      1. Read the Slack message from channel C0B71QSMZKQ (use Slack API or harness log)
      2. Check: "Sand Dunes" line does NOT contain "Loft"
      3. Check: "Hovenweep" line does NOT contain "Loft"
      4. Check: "Sand Dunes" line DOES contain "Home"
      5. Check: "Hovenweep" line DOES contain "Home"
    Expected Result: Austin properties show "Home", never "Loft"
    Evidence: .sisyphus/evidence/task-4-no-loft-austin.txt

  Scenario: Costs match Reporte Financiero
    Tool: Bash
    Steps:
      1. Read Slack message content
      2. Verify 3412 Sand Dunes shows $135 (not $60 or any other amount)
      3. Verify 3420 Hovenweep shows $120
      4. Verify 219 Paul St shows $120
      5. Verify summary totals are mathematically correct
    Expected Result: All costs match Reporte Financiero
    Evidence: .sisyphus/evidence/task-4-costs-verified.txt

  Scenario: Correct team assignments
    Tool: Bash
    Steps:
      1. Read Slack message
      2. Verify Austin properties (Sand Dunes, Hovenweep) are under Yessica (or Diana/backup if Saturday)
      3. Verify San Antonio property (219 Paul St) is under Zenaida
    Expected Result: Team assignments follow Manual de Personal rules
    Evidence: .sisyphus/evidence/task-4-team-assignments.txt

  Scenario: Model restored after test
    Tool: Bash
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
    Expected Result: "minimax/minimax-m2.7"
    Evidence: .sisyphus/evidence/task-4-model-restored.txt
  ```

  **Commit**: NO (verification only, no code changes)

- [ ] 5. Update docs/employees/cleaning-schedule.md

  **What to do**:
  - Update `docs/employees/cleaning-schedule.md` with:
    - Replace old Notion page IDs with 3 new ones
    - Update fixture names (directorio-operativo, manual-personal, reporte-financiero)
    - Add note about business rules from Manual de Personal (Golden Rule, trash overhead)
    - Update any references to "cleaning zones" or "trash schedule" pages

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 6)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:
  - `docs/employees/cleaning-schedule.md` — current docs file to update

  **Acceptance Criteria**:

  ```
  Scenario: Docs reference new page IDs
    Tool: Bash
    Steps:
      1. grep -c "370d540b" docs/employees/cleaning-schedule.md → expect >= 3
      2. grep -c "36fd540b" docs/employees/cleaning-schedule.md → expect 0
    Expected Result: New IDs present, old IDs gone
    Evidence: .sisyphus/evidence/task-5-docs-updated.txt
  ```

  **Commit**: YES (groups with T6)

- [ ] 6. Commit all changes and send Telegram notification

  **What to do**:
  - Stage all changed files: `prisma/seed.ts`, `src/worker-tools/notion/fixtures/get-page/*.json`, `docs/employees/cleaning-schedule.md`
  - Also stage deleted files: `cleaning-zones.json`, `trash-schedule.json`, `default.json`
  - Commit: `fix(cleaning-schedule): switch to 3 new Notion pages with real business rules and costs`
  - Do NOT use `--no-verify`
  - Send Telegram notification:
    ```bash
    npx tsx scripts/telegram-notify.ts "✅ Cleaning schedule data accuracy plan complete — 3 new Notion pages wired, business rules updated, mock fixtures fixed, output verified."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 5)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4, 5

  **Acceptance Criteria**:

  ```
  Scenario: Commit exists with correct message
    Tool: Bash
    Steps:
      1. Run: git log -1 --oneline
    Expected Result: Contains "fix(cleaning-schedule): switch to 3 new Notion pages"
    Evidence: .sisyphus/evidence/task-6-commit.txt
  ```

  **Commit**: YES (this IS the commit task)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build`. Review all changed files for issues. Verify fixture JSON is valid. Verify seed.ts create/update blocks are in sync. Check no old page IDs remain in codebase.
      Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Verify mock mode works for all 3 new fixtures. Check the Slack message from the verification run (T4) for correct service types, costs, team assignments, and Golden Rule compliance. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Single commit** after all tasks: `fix(cleaning-schedule): switch to 3 new Notion pages with real business rules and costs`
  - Files: `prisma/seed.ts`, `src/worker-tools/notion/fixtures/get-page/*.json`, `docs/employees/cleaning-schedule.md`
  - Pre-commit: `pnpm build`

---

## Success Criteria

### Verification Commands

```bash
# All 3 new page IDs in execution_steps
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" \
  | grep -c "370d540b"
# Expected: 3

# No old page IDs remain
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" \
  | grep -c "36fd540b"
# Expected: 0

# New fixtures exist
ls src/worker-tools/notion/fixtures/get-page/
# Expected: directorio-operativo.json, manual-personal.json, reporte-financiero.json

# Old fixtures gone
ls src/worker-tools/notion/fixtures/get-page/cleaning-zones.json 2>/dev/null && echo "FAIL" || echo "PASS"
# Expected: PASS
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `pnpm build` passes
- [ ] Slack output verified with correct data
