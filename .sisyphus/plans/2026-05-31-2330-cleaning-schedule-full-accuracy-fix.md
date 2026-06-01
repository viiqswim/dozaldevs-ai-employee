# Cleaning Schedule — Full Accuracy Fix

## TL;DR

> **Quick Summary**: Fix 6 bugs in the cleaning-schedule employee's `execution_steps`, add address normalization rules, correct Banton Rd zone in two Notion pages, fix stale documentation, and create a troubleshooting verification guide. API-verified: exactly 6 properties check out June 1, 2026 — the last run incorrectly showed 12.
>
> **Deliverables**:
>
> - Fixed `execution_steps` with all 6 bug fixes + address normalization + Reporte Financiero time lookups
> - Banton Rd moved from Kyle to Austin zone in Directorio Operativo AND Reporte Financiero (real Notion pages + fixtures)
> - Updated `docs/employees/cleaning-schedule.md` (3 errors fixed)
> - New troubleshooting guide: `docs/guides/YYYY-MM-DD-HHMM-cleaning-schedule-verification.md`
> - Verified Slack output matching confirmed expected schedule
>
> **Estimated Effort**: Medium (8 tasks across 3 waves)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (execution_steps) → Task 5 (trigger + verify) → Task 7 (commit)

---

## Context

### Original Request

User identified that the cleaning-schedule employee produced 12 output entries when only 6 were correct. After deep investigation (scanning all 45 VLRE properties via Hostfully API), we found 6 root cause bugs plus incorrect Notion documentation and missing address normalization. User also requested a troubleshooting guide documenting the verification process.

### Interview Summary

**Key Discussions**:

- Hostfully is #1 source of truth for property details (addresses, ZIP codes, checkout dates)
- Notion Directorio Operativo is source of truth for operational zone assignments (but had a data error: Banton under Kyle)
- User confirmed "Keep Unit B" in Banton addresses (physical sub-address, meaningful to cleaners)
- User confirmed all 6 June 1 checkouts go to Yessica (Monday = weekday, all Austin)
- User corrected: Banton rooms are ~25 min each (from Reporte Financiero), not 60 min
- User corrected: "4405 - A Hayride lane" must be normalized to "4405 Hayride Lane — Unidad A"
- Skip unit tests (user decision)
- Max 3 iteration attempts before escalating with diagnostics

**Research Findings (API-Verified)**:

- Scanned ALL 45 VLRE properties via Hostfully API on May 31, 2026
- Exactly 6 properties have June 1 checkouts (all type=BOOKING, active status, checkOut starting with 2026-06-01)
- 3505 Banton Rd ZIP is 78722 (Austin), NOT 78640 (Kyle)
- 271-GIN-3 checkOut is June 3, NOT June 1
- 5 false positives were CLOSED INQUIRYs, CANCELLED bookings, wrong dates, or fabricated
- Reporte Financiero has per-property cleaning times (Banton rooms: 25 min, Hayride units: 90 min, Nutria rooms: 25 min)

### Metis Review

**Identified Gaps** (addressed):

- `update-block.ts` hardcodes `paragraph` type at line 72 — cannot update `bulleted_list_item` blocks. Notion fix must use curl to archive old blocks, then `append-blocks.ts` for new ones.
- Reporte Financiero ALSO has Banton under Kyle (not just Directorio) — both pages need fixing.
- Reporte Financiero is not referenced in current execution_steps at all — adding time lookups is a NEW step.
- `docs/employees/cleaning-schedule.md` line 56 says "checking in" when it should say "checking out."

---

## Work Objectives

### Core Objective

Fix all data accuracy issues in the cleaning-schedule employee so its output exactly matches the API-verified ground truth, and correct all documentation that contains wrong information.

### Concrete Deliverables

- `prisma/seed.ts` — updated execution_steps for archetype `00000000-0000-0000-0000-000000000019`
- DB — updated with same fixed execution_steps text
- Notion Directorio Operativo page — Banton moved from Kyle to Austin section
- Notion Reporte Financiero page — Banton moved from Kyle to Austin section
- `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json` — fixture updated to match
- `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json` — fixture updated to match
- `docs/employees/cleaning-schedule.md` — 3 errors corrected
- New guide: `docs/guides/YYYY-MM-DD-HHMM-cleaning-schedule-verification.md`
- Slack output: exactly 6 correct entries matching expected schedule

### User-Confirmed Expected Output (DEFINITIVE)

```
🧹 *Limpieza — Lunes 1 de Junio*

👤 *Yessica*
  • 3505 Banton Rd, Unit B — Habitación 1 — 11:00 — Limpieza (25 min)
  • 3505 Banton Rd, Unit B — Habitación 2 — 11:00 — Limpieza (25 min)
  • 3505 Banton Rd, Unit B — Habitación 3 — 11:00 — Limpieza (25 min)
  • 4403 Hayride Lane — Unidad B — 11:00 — Limpieza (90 min)
  • 4405 Hayride Lane — Unidad A — 11:00 — Limpieza (90 min)
  • 7213 Nutria Run — Habitación 4 — 11:00 — Limpieza (25 min)

---
📊 *Resumen*
6 propiedades · 1 persona
Yessica: 6 propiedades — 280 min
```

### Ground Truth — June 1, 2026 Checkouts (API-Verified)

| #   | Listing        | Hostfully Address      | ZIP   | Room ID      | Time   | Cleaner |
| --- | -------------- | ---------------------- | ----- | ------------ | ------ | ------- |
| 1   | 3505-BAN-1     | 3505 Banton Rd, Unit B | 78722 | Habitación 1 | 25 min | Yessica |
| 2   | 3505-BAN-2     | 3505 Banton Rd, Unit B | 78722 | Habitación 2 | 25 min | Yessica |
| 3   | 3505-BAN-3     | 3505 Banton Rd, Unit B | 78722 | Habitación 3 | 25 min | Yessica |
| 4   | 4403B-HAY-HOME | 4403 Hayride Lane      | 78744 | Unidad B     | 90 min | Yessica |
| 5   | 4405A-HAY-HOME | 4405 Hayride Lane (\*) | 78744 | Unidad A     | 90 min | Yessica |
| 6   | 7213-NUT-4     | 7213 Nutria Run        | 78744 | Habitación 4 | 25 min | Yessica |

(\*) Hostfully stores "4405 - A Hayride lane" — must be normalized to "4405 Hayride Lane" in display.

### Known False Positives (MUST NOT appear in output)

- 5306A-KIN-Home / 5306 King Charles Drive (only CLOSED INQUIRYs/CANCELLED bookings)
- 4403S-HAY-HOME / 4403 Hayride Ln (no June 1 checkout — checkIn May 31)
- 7213-NUT-2 / 7213 Nutria Run Habitación 2 (checkOut is May 31, not June 1)
- 7213-NUT-3 / 7213 Nutria Run Habitación 3 (checkOut is May 31, not June 1)
- 7213-NUT-HOME / 7213 Nutria Run Casa (no non-BLOCK leads at all)
- 271-GIN-3 / 271 Gina Dr (checkOut is June 3, not June 1)

### Must Have

- Exactly 6 entries in output
- Each entry has a room/unit identifier
- All entries assigned to Yessica
- Cleaning times from Reporte Financiero (25 min for rooms, 90 min for Hayride units)
- Address for 4405 displayed as "4405 Hayride Lane" (not "4405 - A Hayride lane")
- Banton in Austin zone in all Notion pages and fixtures

### Must NOT Have (Guardrails)

- CLOSED or CANCELLED leads counted as valid checkouts
- INQUIRY-type or BOOKING_REQUEST-type leads counted as valid checkouts
- Properties with only checkIn (not checkOut) on target date
- The "single unit = no room ID" suppression rule
- Hardcoded 60-minute cleaning time default
- Raw Hostfully addresses with embedded unit designators displayed as-is
- Any modifications to source code in `src/worker-tools/` (tool logic)
- Any modifications to archetype fields other than `execution_steps`
- Dollar amounts, lock codes, property codes in output
- Banton Rd listed under Kyle in any Notion page or fixture

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (user decision — skip tests)
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — trigger employee, check DB status, read output
- **Notion API**: Use Bash (curl) — verify block content after updates
- **Fixtures**: Use Bash (grep) — verify block placement in JSON files

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Fix execution_steps in seed.ts + update DB [deep]
├── Task 2: Fix Notion pages via API (Directorio + Reporte) [unspecified-high]
├── Task 3: Update fixture JSON files to match Notion fixes [quick]
├── Task 4: Fix docs/employees/cleaning-schedule.md [quick]

Wave 2 (After Wave 1 — verify + document):
├── Task 5: Trigger employee and verify output (depends: 1, 2) [deep]
├── Task 6: Create troubleshooting verification guide (depends: none*) [writing]

Wave 3 (After Wave 2 — commit + notify):
├── Task 7: Commit all changes (depends: 5, 6) [quick]
└── Task 8: Send Telegram notification (depends: 7) [quick]

Critical Path: Task 1 → Task 5 → Task 7 → Task 8
Parallel Speedup: Wave 1 runs 4 tasks simultaneously
Max Concurrent: 4 (Wave 1)
```

\*Task 6 has no code dependency but is sequenced in Wave 2 because the guide documents the process that Wave 1 fixes. It can run parallel with Task 5.

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | None       | 5      |
| 2    | None       | 5      |
| 3    | None       | 7      |
| 4    | None       | 7      |
| 5    | 1, 2       | 7      |
| 6    | None       | 7      |
| 7    | 5, 6, 3, 4 | 8      |
| 8    | 7          | None   |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `deep`, T2 → `unspecified-high`, T3 → `quick`, T4 → `quick`
- **Wave 2**: 2 tasks — T5 → `deep`, T6 → `writing`
- **Wave 3**: 2 tasks — T7 → `quick`, T8 → `quick`

---

## TODOs

- [x] 1. Fix execution_steps — Apply 6 Bug Fixes + Address Normalization + Reporte Time Lookups

  **What to do**:

  First, verify there is exactly one active cleaning-schedule archetype:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "SELECT id, role_name, status FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
  ```

  Expected: one row with status `active`.

  Then read the current `execution_steps` from the DB to understand the full text before editing. Apply ALL of the following fixes:

  **Fix 1 — Filter to BOOKING type only (CRITICAL)**:
  In the step where the CLEANING LIST is built, change the filter criteria. Currently the instruction only checks checkOut date and "not cancelled" status. Replace with a stricter three-condition test:

  ```
  TEST — ALL THREE conditions must be true to ADD to CLEANING LIST:
  1. checkOut.substring(0, 10) === targetDate
  2. type === "BOOKING" (SKIP any lead where type is INQUIRY, BOOKING_REQUEST, or BLOCK)
  3. status is one of: BOOKED, BOOKED_BY_AGENT, BOOKED_BY_CUSTOMER, BOOKED_EXTERNALLY, STAY
     (SKIP any lead with status: CANCELLED, CANCELLED_BY_TRAVELER, CANCELLED_BY_OWNER, CLOSED, or any other status)

  If ANY of the three conditions fails → SKIP (do NOT add to CLEANING LIST).
  ```

  **Fix 2 — Remove "single unit = no room ID" rule**:
  Find and DELETE lines like:

  ```
  - If only ONE unit is checking out at an address, do NOT append a room identifier
  ```

  Replace with:

  ```
  - ALWAYS show the room/unit identifier derived from the listing name, regardless of how many units are checking out
  ```

  **Fix 3 — Add 78722 to ZIP-TO-CITY OVERRIDE table**:

  ```
  - 78722 → Austin, TX
  ```

  **Fix 4 — Strengthen the self-check step**:
  Replace the current self-check with:

  ```
  Self-check (MANDATORY — do NOT skip):
     For EACH entry in the CLEANING LIST, verify ALL of the following:
     a. checkOut date starts with targetDate (e.g., "2026-06-01")
     b. type is "BOOKING" (not INQUIRY, BLOCK, or BOOKING_REQUEST)
     c. status is BOOKED, STAY, BOOKED_BY_AGENT, BOOKED_BY_CUSTOMER, or BOOKED_EXTERNALLY

     If ANY entry fails ANY check → REMOVE it from the CLEANING LIST now.

     State aloud: "CLEANING LIST after self-check: [N] properties" and list each one with its type, status, and checkOut.
  ```

  **Fix 5 — Add Reporte Financiero time lookups (NEW STEP)**:
  The current execution_steps do NOT reference the Reporte Financiero page. Add a new step that:
  1. Fetches the Reporte Financiero Notion page (page ID: `370d540b438080ca8676e61856488960`, fixture name: `reporte-financiero`)
  2. For each property in the CLEANING LIST, looks up the cleaning time from the Reporte:
     - Match by street address (e.g., "3505 Banton Rd" → find in Reporte)
     - Determine if it's a Home, Room, Unidad, Bundle, etc. based on the listing name suffix
     - Use the matching time from the Reporte (e.g., "Rooms 1-3 ($30 c/u - 25 min)" → 25 min per room)
  3. If a property is not found in the Reporte, default to 60 min and log a warning.

  Remove any hardcoded "60 min" default for cleaning time. The model must always try to look up the correct time from the Reporte first.

  **Fix 6 — Address normalization rules (NEW)**:
  Add these rules to the address formatting section:

  ```
  ADDRESS NORMALIZATION (apply BEFORE displaying any address):
  1. When a Hostfully address contains an embedded unit designator (patterns like "ADDR - X" where X is a letter),
     strip the unit part from the address. Example: "4405 - A Hayride lane" → "4405 Hayride Lane"
     The unit identifier (e.g., "Unidad A") comes from the listing name, NOT the address.
  2. Normalize street type capitalization to Title Case: "lane" → "Lane", "rd" → "Rd", "dr" → "Dr"
  3. Keep "Unit B" in addresses where it appears (e.g., "3505 Banton Rd, Unit B") — this is a physical sub-address.
  4. When multiple Hostfully listings share the same physical address but have different address strings
     (e.g., "4403 Hayride Lane" vs "4403 Hayride Ln"), use the FIRST variant encountered for all entries at that address.
  ```

  After applying ALL fixes, update `prisma/seed.ts`:
  - The `execution_steps` field for the cleaning-schedule archetype appears in TWO places (CREATE block around lines 3525-3707 and UPDATE block around lines 3747-3929). BOTH must have identical text.

  Then update the DB directly:

  ```bash
  node -e "
  const steps = \`<the full fixed execution_steps text>\`;
  const sql = \`UPDATE archetypes SET execution_steps = \\\$body\\\$\${steps}\\\$body\\\$, updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000019';\`;
  require('fs').writeFileSync('/tmp/update-execution-steps.sql', sql);
  "
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -f /tmp/update-execution-steps.sql
  ```

  **Must NOT do**:
  - Do NOT modify any files under `src/worker-tools/` (tool source code)
  - Do NOT change any archetype field other than `execution_steps`
  - Do NOT run `pnpm prisma db seed` (overwrites all archetypes)
  - Do NOT change delivery_steps, delivery_instructions, identity, or model

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful text editing of a large execution_steps string with precise changes across 6+ sections, plus adding a completely new step for Reporte lookups, plus syncing seed.ts CREATE and UPDATE blocks
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3525-3707` — CREATE block with current execution_steps
  - `prisma/seed.ts:3747-3929` — UPDATE block (must match CREATE block)

  **API/Type References**:
  - `src/worker-tools/hostfully/get-reservations.ts:23-37` — RawLead type showing `type`, `status`, `checkOutLocalDateTime` fields
  - `src/worker-tools/hostfully/get-reservations.ts:196-222` — CONFIRMED_STATUSES and CANCELLED_STATUSES sets
  - `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json` — cleaning times per property type (source of truth for times)

  **Key Data Points** (the executor MUST have these):
  - Reporte Financiero page ID: `370d540b438080ca8676e61856488960` (fixture: `reporte-financiero`)
  - Banton rooms: 25 min each ($30 c/u)
  - Hayride units: 90 min each ($80 c/u)
  - Nutria rooms 1-4: 25 min each ($30 c/u)
  - Hostfully address for 4405A: "4405 - A Hayride lane" → must normalize to "4405 Hayride Lane"

  **Acceptance Criteria**:
  - [ ] `prisma/seed.ts` updated with all 6 fixes + address normalization in both CREATE and UPDATE blocks
  - [ ] DB updated with fixed execution_steps
  - [ ] execution_steps references Reporte Financiero page for cleaning times
  - [ ] execution_steps contains address normalization rules
  - [ ] Verify: `SELECT execution_steps FROM archetypes WHERE id = '...'` contains:
    - `type === "BOOKING"` (Fix 1)
    - No "If only ONE unit" text (Fix 2)
    - `78722 → Austin` (Fix 3)
    - `not INQUIRY, BLOCK, or BOOKING_REQUEST` in self-check (Fix 4)
    - Reference to Reporte Financiero page ID (Fix 5)
    - `ADDRESS NORMALIZATION` section (Fix 6)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify execution_steps contains all fixes
    Tool: Bash (psql + grep)
    Preconditions: DB is running on localhost:54322
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" > /tmp/execution_steps_check.txt
      2. grep 'type === "BOOKING"' /tmp/execution_steps_check.txt (Fix 1)
      3. grep -c 'only ONE unit' /tmp/execution_steps_check.txt (Fix 2 — must be 0)
      4. grep '78722' /tmp/execution_steps_check.txt (Fix 3)
      5. grep 'not INQUIRY, BLOCK' /tmp/execution_steps_check.txt (Fix 4)
      6. grep '370d540b438080ca8676e61856488960' /tmp/execution_steps_check.txt (Fix 5 — Reporte page ID)
      7. grep 'ADDRESS NORMALIZATION' /tmp/execution_steps_check.txt (Fix 6)
    Expected Result: Steps 2, 4, 5, 6, 7 return matches. Step 3 returns 0.
    Evidence: .sisyphus/evidence/task-1-execution-steps-verification.txt

  Scenario: Verify seed.ts CREATE and UPDATE blocks match
    Tool: Bash (grep + diff)
    Steps:
      1. Extract execution_steps text from CREATE block in seed.ts
      2. Extract execution_steps text from UPDATE block in seed.ts
      3. Diff the two — must be identical
    Expected Result: No differences between CREATE and UPDATE blocks
    Evidence: .sisyphus/evidence/task-1-seed-sync-verification.txt
  ```

  **Commit**: NO (commit after verification in Task 7)

- [x] 2. Fix Notion Pages — Move Banton Rd from Kyle to Austin (Directorio + Reporte)

  **What to do**:

  Two real Notion pages have Banton Rd incorrectly listed under "78640 (Kyle)" when it should be under "78744 (Austin)". Fix both using the Notion API.

  **CRITICAL**: `update-block.ts` hardcodes `paragraph` type at line 72 — it CANNOT update `bulleted_list_item` blocks. Use **curl** to archive old blocks, then **`append-blocks.ts`** to add new blocks.

  **Step A — Get the Notion access token**:

  ```bash
  # Decrypt from tenant_secrets
  source .env
  NOTION_TOKEN=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "
    SELECT value FROM tenant_secrets
    WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
    AND key = 'notion_access_token';
  " | tr -d ' \n')
  # The value is encrypted — decrypt using the encryption module:
  node -e "
  const { decrypt } = require('./src/lib/encryption.js');
  const encrypted = JSON.parse('$NOTION_TOKEN');
  console.log(decrypt(encrypted));
  " 2>/dev/null || tsx -e "
  import { decrypt } from './src/lib/encryption.js';
  const raw = process.argv[1];
  const encrypted = JSON.parse(raw);
  console.log(decrypt(encrypted));
  " "$NOTION_TOKEN"
  ```

  Alternatively, if the token is available as an env var from a previous run, use that directly. Set `NOTION_ACCESS_TOKEN` env var.

  **Step B — Archive Banton blocks in Directorio Operativo (Kyle section)**:
  Archive these 3 blocks (all under the "78640 (Kyle)" heading):
  - `370d540b-4380-80db-9342-d112505a2fe0` — "3505 Banton Rd" (address)
  - `370d540b-4380-806d-aaae-c68d9f50a91d` — "🏠 Unidades: Home | Rooms 1-3" (units)
  - `370d540b-4380-8014-bf13-fa620abf67f0` — "🗑️ Basura: Viernes (Sacar Jueves)" (trash)

  ```bash
  for BLOCK_ID in "370d540b-4380-80db-9342-d112505a2fe0" "370d540b-4380-806d-aaae-c68d9f50a91d" "370d540b-4380-8014-bf13-fa620abf67f0"; do
    curl -s -X DELETE "https://api.notion.com/v1/blocks/$BLOCK_ID" \
      -H "Authorization: Bearer $NOTION_ACCESS_TOKEN" \
      -H "Notion-Version: 2022-06-28"
    echo "Archived: $BLOCK_ID"
  done
  ```

  **Step C — Append Banton blocks to Austin section in Directorio**:
  The Austin section heading block ID is `370d540b-4380-804d-bdad-fff18e9540fd` (the "📍 ZIP CODE: 78744 (Austin, TX)" heading). Append AFTER the last existing property in that section. Use `append-blocks.ts`:

  ```bash
  export NOTION_ACCESS_TOKEN="$NOTION_ACCESS_TOKEN"
  # Append Banton address
  tsx src/worker-tools/notion/append-blocks.ts \
    --page-id "370d540b4380809a8ea0c11074f92abb" \
    --content "3505 Banton Rd" \
    --type bulleted_list_item
  # Append units
  tsx src/worker-tools/notion/append-blocks.ts \
    --page-id "370d540b4380809a8ea0c11074f92abb" \
    --content "🏠 Unidades: Home | Rooms 1-3" \
    --type bulleted_list_item
  # Append trash schedule
  tsx src/worker-tools/notion/append-blocks.ts \
    --page-id "370d540b4380809a8ea0c11074f92abb" \
    --content "🗑️ Basura: Viernes (Sacar Jueves) - General/Reciclaje" \
    --type bulleted_list_item
  ```

  NOTE: `append-blocks.ts` appends to the END of a page, not after a specific block. The blocks will appear at the bottom of the Directorio page. This is acceptable — the user can manually reposition them in Notion later. Alternatively, use the Notion API `PATCH /v1/blocks/{parent_block_id}/children` with an `after` parameter to place them after a specific sibling block.

  **Step D — Archive Banton block in Reporte Financiero (Kyle section)**:
  Archive this 1 block:
  - `370d540b-4380-80b7-a36f-ed935c39b0c3` — "3505 Banton Rd: Home ($180 - 150 min) | Rooms 1-3 ($30 c/u - 25 min)"

  ```bash
  curl -s -X DELETE "https://api.notion.com/v1/blocks/370d540b-4380-80b7-a36f-ed935c39b0c3" \
    -H "Authorization: Bearer $NOTION_ACCESS_TOKEN" \
    -H "Notion-Version: 2022-06-28"
  ```

  **Step E — Append Banton to Austin section in Reporte Financiero**:

  ```bash
  tsx src/worker-tools/notion/append-blocks.ts \
    --page-id "370d540b438080ca8676e61856488960" \
    --content "3505 Banton Rd: Home (\$180 - 150 min) | Rooms 1-3 (\$30 c/u - 25 min)" \
    --type bulleted_list_item
  ```

  **Must NOT do**:
  - Do NOT modify `update-block.ts` source code
  - Do NOT delete blocks that are NOT related to Banton Rd
  - Do NOT change any content text (pricing, times) — only move blocks between sections

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires Notion API calls, token decryption, and careful block management across two pages
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/notion/append-blocks.ts:1-60` — CLI syntax: `--page-id`, `--content`, `--type bulleted_list_item`
  - `src/worker-tools/notion/update-block.ts:70-80` — hardcoded `paragraph` type (line 72) — why we can't use this tool

  **Block ID References** (from fixture files):
  - Directorio Austin heading: `370d540b-4380-804d-bdad-fff18e9540fd`
  - Directorio Banton address: `370d540b-4380-80db-9342-d112505a2fe0`
  - Directorio Banton units: `370d540b-4380-806d-aaae-c68d9f50a91d`
  - Directorio Banton trash: `370d540b-4380-8014-bf13-fa620abf67f0`
  - Reporte Kyle heading: block at line 384 of fixture
  - Reporte Banton entry: `370d540b-4380-80b7-a36f-ed935c39b0c3`
  - Directorio page ID: `370d540b4380809a8ea0c11074f92abb`
  - Reporte page ID: `370d540b438080ca8676e61856488960`

  **Acceptance Criteria**:
  - [ ] Banton blocks archived from Kyle section in both Notion pages
  - [ ] Banton blocks appended to Austin section in both Notion pages
  - [ ] Verify via Notion API that Banton no longer appears under Kyle

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify Banton moved in Directorio Operativo
    Tool: Bash (curl)
    Steps:
      1. Fetch Directorio page children: curl "https://api.notion.com/v1/blocks/370d540b4380809a8ea0c11074f92abb/children?page_size=100" with auth headers
      2. Search response for "3505 Banton" — should exist (appended to Austin section)
      3. Verify old block IDs (370d540b-4380-80db...) are NOT in the response (archived)
    Expected Result: Banton exists in page but old Kyle-section block IDs are gone
    Evidence: .sisyphus/evidence/task-2-directorio-verification.json

  Scenario: Verify Banton moved in Reporte Financiero
    Tool: Bash (curl)
    Steps:
      1. Fetch Reporte page children with auth headers
      2. Search for "3505 Banton" — should exist under Austin section
      3. Verify old block ID (370d540b-4380-80b7...) is gone
    Expected Result: Banton entry exists in Reporte under Austin
    Evidence: .sisyphus/evidence/task-2-reporte-verification.json
  ```

  **Commit**: NO (commit in Task 7)

- [x] 3. Update Fixture Files — Move Banton from Kyle to Austin in Both JSON Fixtures

  **What to do**:

  Update both Notion fixture files to match the real Notion page changes from Task 2. The fixtures are used in mock/test mode.

  **File 1: `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json`**

  Move these 3 JSON block objects from the "78640 (Kyle)" section to the "78744 (Austin)" section:
  - Block at line ~890 (id: `370d540b-4380-80db...`) — "3505 Banton Rd"
  - Block at line ~915 (id: `370d540b-4380-806d...`) — "🏠 Unidades: Home | Rooms 1-3"
  - Block at line ~938 (id: `370d540b-4380-8014...`) — "🗑️ Basura: Viernes (Sacar Jueves)"

  Cut these 3 block objects and paste them after the last property entry in the 78744 (Austin) section (before the "📍 ZIP CODE: 78640" heading at line ~790).

  **File 2: `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json`**

  Move this 1 JSON block object from the "78640 (Kyle)" section to the "78744 (Austin)" section:
  - Block at line ~432 (id: `370d540b-4380-80b7...`) — "3505 Banton Rd: Home ($180 - 150 min) | Rooms 1-3 ($30 c/u - 25 min)"

  Cut this block object and paste it after the last property entry in the Austin (78744) section (before the "📍 ZIP 78640 (Kyle)" heading at line ~384).

  **Must NOT do**:
  - Do NOT change any block content (pricing, times, addresses) — only move blocks between sections
  - Do NOT change block IDs
  - Do NOT break JSON syntax (validate with `node -e "JSON.parse(require('fs').readFileSync('path'))"`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: JSON block relocation in two fixture files — straightforward cut-paste
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json:790-960` — Kyle section with Banton blocks
  - `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json:384-470` — Kyle section with Banton block

  **Acceptance Criteria**:
  - [ ] directorio-operativo.json: "3505 Banton Rd" block is in the 78744 (Austin) section, NOT the 78640 (Kyle) section
  - [ ] reporte-financiero.json: "3505 Banton Rd" block is in the Austin section, NOT the Kyle section
  - [ ] Both files are valid JSON: `node -e "JSON.parse(require('fs').readFileSync('path'))"` exits 0

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify fixture JSON validity and Banton placement
    Tool: Bash (node + grep)
    Steps:
      1. Validate directorio JSON: node -e "JSON.parse(require('fs').readFileSync('src/worker-tools/notion/fixtures/get-page/directorio-operativo.json'))"
      2. Validate reporte JSON: node -e "JSON.parse(require('fs').readFileSync('src/worker-tools/notion/fixtures/get-page/reporte-financiero.json'))"
      3. grep -n "3505 Banton" directorio-operativo.json — line number must be BEFORE the 78640 heading line
      4. grep -n "3505 Banton" reporte-financiero.json — line number must be BEFORE the 78640 heading line
    Expected Result: Both JSON files valid, Banton appears before Kyle section in both
    Evidence: .sisyphus/evidence/task-3-fixture-verification.txt
  ```

  **Commit**: NO (commit in Task 7)

- [x] 4. Fix docs/employees/cleaning-schedule.md — Correct 3 Errors

  **What to do**:

  Fix these 3 errors in `docs/employees/cleaning-schedule.md`:

  **Error 1 — Line 56: "checking in" → "checking out"**:
  Current: `1. Fetches reservations from Hostfully for all VLRE properties checking in on that date`
  Fixed: `1. Fetches reservations from Hostfully for all VLRE properties checking out on that date`

  **Error 2 — Line 115: Diana's role is wrong**:
  Current: `- ZIPs 78744 / 78640 (Austin/Kyle): Yessica (primary), Diana (backup)`
  Fixed: `- ZIPs 78744 / 78722 / 78640 (Austin/Kyle): Yessica (weekday primary for Austin), Diana (primary for ALL Kyle properties every day, backup for Austin)`

  **Error 3 — Missing 78722 in ZIP list**:
  The Business Rules section doesn't mention 78722 at all. Add it alongside 78744 as Austin.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3 simple text edits in one markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `docs/employees/cleaning-schedule.md:56` — "checking in" error
  - `docs/employees/cleaning-schedule.md:115` — Diana role error
  - `src/worker-tools/notion/fixtures/get-page/manual-personal.json:100-115` — actual Diana role from Notion

  **Acceptance Criteria**:
  - [ ] Line 56 says "checking out" not "checking in"
  - [ ] Line 115 mentions 78722 and correctly describes Diana as primary for Kyle
  - [ ] No other content accidentally changed

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify doc corrections
    Tool: Bash (grep)
    Steps:
      1. grep "checking out" docs/employees/cleaning-schedule.md — must match
      2. grep -c "checking in on that date" docs/employees/cleaning-schedule.md — must be 0
      3. grep "78722" docs/employees/cleaning-schedule.md — must match
      4. grep "primary for ALL Kyle" docs/employees/cleaning-schedule.md — must match
    Expected Result: All greps pass
    Evidence: .sisyphus/evidence/task-4-doc-verification.txt
  ```

  **Commit**: NO (commit in Task 7)

- [x] 5. Trigger Employee and Verify Output Against Confirmed Expected Schedule

  **What to do**:

  This is an iterative task — trigger the employee, check the output, compare to user-confirmed expected output. Max 3 iterations before escalating with full diagnostics.

  **Step A — Trigger the employee:**

  ```bash
  source .env
  curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
    -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
    -d '{"inputs":{"date":"2026-06-01"}}' | jq '{task_id: .task_id}'
  ```

  Save the task_id. NO Docker rebuild needed.

  **Step B — Wait for completion:**
  Poll every 30 seconds:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -t -c "SELECT status FROM tasks WHERE id = '<task_id>';"
  ```

  **Step C — Read the output from Slack:**

  ```bash
  source .env
  curl -s "https://slack.com/api/conversations.history" \
    -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
    -d "channel=C0B71QSMZKQ&limit=3" | jq '.messages[0].text'
  ```

  **Step D — Verify against user-confirmed expected output:**

  ALL of these checks must pass:

  | #   | Check                   | Expected                                                                                   |
  | --- | ----------------------- | ------------------------------------------------------------------------------------------ |
  | 1   | Total entry count       | Exactly 6                                                                                  |
  | 2   | 3505 Banton entries     | 3 entries: Habitación 1, 2, 3 — each 25 min                                                |
  | 3   | 4403 Hayride entry      | 1 entry: Unidad B — 90 min                                                                 |
  | 4   | 4405 Hayride entry      | 1 entry: Unidad A — 90 min — address shows "4405 Hayride Lane" NOT "4405 - A Hayride lane" |
  | 5   | 7213 Nutria entry       | 1 entry: Habitación 4 — 25 min                                                             |
  | 6   | All assigned to Yessica | YES                                                                                        |
  | 7   | Total time in Resumen   | 280 min                                                                                    |

  NEGATIVE checks (none of these should appear):
  - King Charles / 5306
  - Hayride Unidad C / 4403S
  - Nutria Habitación 2 / NUT-2
  - Nutria Habitación 3 / NUT-3
  - Nutria Casa / NUT-HOME
  - 271 Gina Dr
  - "60 min" for any Banton room or Nutria room
  - "4405 - A" in any address

  **Step E — If verification fails:**
  Log exactly which checks failed, what the actual output was, and what execution_steps text caused the error. Go back to Task 1 logic and fix. Max 3 iterations.

  **Must NOT do**:
  - Do NOT declare success if ANY check fails
  - Do NOT modify shell tool source code to fix issues
  - Do NOT exceed 3 iterations without escalating

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires iterative debugging, API verification, reading harness logs, and potentially re-fixing execution_steps
  - **Skills**: [`hostfully-api`]
    - `hostfully-api`: Needed to verify checkout data if false positives reappear

  **Parallelization**:
  - **Can Run In Parallel**: NO (must wait for Wave 1)
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `/tmp/employee-f682de37.log` — Previous run's harness log showing wrong output for comparison
  - `src/workers/opencode-harness.mts` — How the harness reads execution_steps
  - `src/worker-tools/hostfully/get-reservations.ts` — Tool the employee calls
  - `src/worker-tools/hostfully/get-property.ts:17-30` — formatAddress function

  **Ground Truth (CRITICAL — the executor MUST compare against this)**:

  ```
  🧹 *Limpieza — Lunes 1 de Junio*

  👤 *Yessica*
    • 3505 Banton Rd, Unit B — Habitación 1 — 11:00 — Limpieza (25 min)
    • 3505 Banton Rd, Unit B — Habitación 2 — 11:00 — Limpieza (25 min)
    • 3505 Banton Rd, Unit B — Habitación 3 — 11:00 — Limpieza (25 min)
    • 4403 Hayride Lane — Unidad B — 11:00 — Limpieza (90 min)
    • 4405 Hayride Lane — Unidad A — 11:00 — Limpieza (90 min)
    • 7213 Nutria Run — Habitación 4 — 11:00 — Limpieza (25 min)

  ---
  📊 *Resumen*
  6 propiedades · 1 persona
  Yessica: 6 propiedades — 280 min
  ```

  **Acceptance Criteria**:
  - [ ] Task reaches `Done` status
  - [ ] Output contains exactly 6 property entries
  - [ ] All 6 entries match ground truth (correct address, room ID, time)
  - [ ] "4405 Hayride Lane" (not "4405 - A Hayride lane")
  - [ ] Times: 25 min for rooms, 90 min for Hayride units
  - [ ] Total: 280 min
  - [ ] None of the false positives appear
  - [ ] All assigned to Yessica

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Happy path — correct 6-property output with correct times
    Tool: Bash (curl + psql)
    Preconditions: Tasks 1 and 2 completed, services running
    Steps:
      1. Trigger employee for June 1
      2. Wait for Done status
      3. Read Slack output
      4. Count entries (must be 6)
      5. Verify each entry's address, room ID, and time
      6. Verify total is 280 min
      7. Verify "4405 Hayride Lane" (not "4405 - A")
    Expected Result: Perfect match to ground truth
    Evidence: .sisyphus/evidence/task-5-output-verification.txt

  Scenario: Negative check — false positives excluded
    Tool: Bash (grep)
    Steps:
      1. Search output for "King Charles" — must NOT appear
      2. Search output for "Unidad C" — must NOT appear
      3. Search output for "Casa" — must NOT appear
      4. Search output for "4405 - A" — must NOT appear
      5. Search output for "60 min" alongside Banton or Nutria — must NOT appear
    Expected Result: No false positive patterns found
    Evidence: .sisyphus/evidence/task-5-negative-check.txt
  ```

  **Commit**: NO (commit in Task 7)

- [x] 6. Create Troubleshooting Verification Guide

  **What to do**:

  Create a new guide at `docs/guides/YYYY-MM-DD-HHMM-cleaning-schedule-verification.md` (run `date "+%Y-%m-%d-%H%M"` for the timestamp) documenting the full process for verifying cleaning schedule accuracy. This guide is for future troubleshooting — when the AI employee produces wrong output, anyone (human or AI agent) can follow these steps to identify what went wrong.

  The guide should document:

  **Section 1: Prerequisites**
  - Hostfully API credentials (how to get them from tenant_secrets)
  - Notion page IDs for the 3 cleaning pages
  - Slack channel ID for ops-cleaning-schedule
  - Admin API key for triggering

  **Section 2: Step-by-Step Verification Process**

  Step 1 — Get all VLRE properties from Hostfully:

  ```bash
  curl -s "https://api.hostfully.com/api/v3.2/properties?agencyUid=<AGENCY_UID>&limit=100" \
    -H "X-HOSTFULLY-APIKEY: <API_KEY>" -H "Accept: application/json"
  ```

  Note: paginated — use `offset` parameter for 100+ properties.

  Step 2 — For each property, get reservations:

  ```bash
  curl -s "https://api.hostfully.com/api/v3.2/leads?propertyUid=<PROPERTY_UID>&checkInFrom=<DATE_MINUS_14>&checkInTo=<DATE_PLUS_1>" \
    -H "X-HOSTFULLY-APIKEY: <API_KEY>" -H "Accept: application/json"
  ```

  Note: `--from/--to` filter by CHECK-IN date, not checkout. Use wide range.

  Step 3 — Filter for valid checkouts on target date:
  - `checkOut` starts with target date (e.g., `"2026-06-01"`)
  - `type === "BOOKING"` (exclude INQUIRY, BOOKING_REQUEST, BLOCK)
  - `status` is active (BOOKED, STAY, BOOKED_BY_AGENT, BOOKED_BY_CUSTOMER, BOOKED_EXTERNALLY)
  - Exclude: CANCELLED, CANCELLED_BY_TRAVELER, CANCELLED_BY_OWNER, CLOSED

  Step 4 — Cross-reference with Notion Directorio Operativo:
  - Fetch page via Notion API or `get-page.ts`
  - Verify property is listed under the CORRECT ZIP zone
  - Note trash schedule for the property

  Step 5 — Look up cleaning times from Reporte Financiero:
  - Fetch page via Notion API or `get-page.ts`
  - Find the property entry
  - Determine: Home, Room, Unidad, Bundle?
  - Get the correct time per unit type

  Step 6 — Determine cleaner assignment:
  - Fetch Manual de Personal page
  - Check day of week (weekday vs weekend)
  - Apply zone rules: Diana = all Kyle, Yessica = Austin weekdays, etc.
  - Check total time against 7-hour limit

  Step 7 — Compare against actual employee output:
  - Read from Slack channel C0B71QSMZKQ
  - Verify entry count, addresses, times, cleaner assignments
  - Check for false positives

  **Section 3: Common Failure Modes**
  - INQUIRY/BOOKING_REQUEST counted as valid (type filter missing)
  - CLOSED leads counted as valid (status filter incomplete)
  - checkIn confused with checkOut (Hostfully API quirk)
  - Wrong ZIP zone in Directorio Operativo (data error)
  - Hardcoded cleaning times instead of Reporte lookup
  - Raw Hostfully addresses with embedded unit designators
  - "Single unit = no room ID" suppression hiding identifiers

  **Section 4: Quick Reference**
  - Hostfully API base: `https://api.hostfully.com/api/v3.2/`
  - Agency UID: `942d08d9-82bb-4fd3-9091-ca0c6b50b578` (VLRE)
  - Directorio page ID: `370d540b4380809a8ea0c11074f92abb`
  - Manual de Personal page ID: `370d540b438080969a72c16c20defc70`
  - Reporte Financiero page ID: `370d540b438080ca8676e61856488960`
  - Slack channel: `C0B71QSMZKQ`
  - Archetype ID: `00000000-0000-0000-0000-000000000019`
  - Tenant: `00000000-0000-0000-0000-000000000003` (VLRE)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical documentation with step-by-step instructions, curl examples, and troubleshooting guidance
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2, parallel with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: None (uses knowledge from the planning session, not task outputs)

  **References**:
  - `docs/employees/cleaning-schedule.md` — existing employee doc (link from new guide)
  - `src/worker-tools/hostfully/get-reservations.ts:23-37` — RawLead type for field reference
  - `src/worker-tools/notion/fixtures/get-page/` — all 3 fixture files for structure reference

  **Acceptance Criteria**:
  - [ ] Guide created at `docs/guides/YYYY-MM-DD-HHMM-cleaning-schedule-verification.md`
  - [ ] Contains all 4 sections (Prerequisites, Verification Process, Common Failure Modes, Quick Reference)
  - [ ] All API endpoint URLs are correct
  - [ ] All page IDs and UIDs are correct
  - [ ] Curl examples are copy-pasteable (with placeholder variables)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify guide completeness
    Tool: Bash (grep)
    Steps:
      1. grep "942d08d9" the guide file — Agency UID present
      2. grep "370d540b4380809a8ea0c11074f92abb" the guide file — Directorio page ID present
      3. grep "BOOKING" the guide file — type filter documented
      4. grep "CLOSED" the guide file — status filter documented
      5. grep "Common Failure Modes" the guide file — section exists
    Expected Result: All greps match
    Evidence: .sisyphus/evidence/task-6-guide-verification.txt
  ```

  **Commit**: NO (commit in Task 7)

- [ ] 7. Commit All Changes

  **What to do**:
  After Task 5 passes verification, commit ALL modified and new files:

  ```bash
  git add prisma/seed.ts \
    src/worker-tools/notion/fixtures/get-page/directorio-operativo.json \
    src/worker-tools/notion/fixtures/get-page/reporte-financiero.json \
    docs/employees/cleaning-schedule.md \
    docs/guides/*cleaning-schedule-verification*.md
  git commit -m "fix(cleaning-schedule): fix 6 data accuracy bugs, normalize addresses, correct Notion zones

  - Require type=BOOKING and active status (exclude INQUIRY/CLOSED/CANCELLED)
  - Always show room/unit identifier (remove single-unit suppression)
  - Add Reporte Financiero lookup for per-property cleaning times
  - Add address normalization rules (strip embedded unit designators)
  - Add ZIP 78722 to Austin override
  - Move Banton Rd from Kyle to Austin in Directorio and Reporte fixtures
  - Fix docs: checking-in→checking-out, Diana role, add 78722
  - Add cleaning schedule verification troubleshooting guide"
  ```

  **Must NOT do**:
  - Do NOT use `--no-verify`
  - Do NOT add `Co-authored-by` lines
  - Do NOT reference AI tools in commit message

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 3, 4, 5, 6

  **Acceptance Criteria**:
  - [ ] `git status` shows clean working tree after commit
  - [ ] Commit message present and correct

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify clean commit
    Tool: Bash (git)
    Steps:
      1. git log -1 --oneline
      2. git status
    Expected Result: Commit present, no uncommitted changes
    Evidence: .sisyphus/evidence/task-7-commit.txt
  ```

  **Commit**: YES
  - Message: `fix(cleaning-schedule): fix 6 data accuracy bugs, normalize addresses, correct Notion zones`
  - Files: `prisma/seed.ts`, both fixture JSON files, `docs/employees/cleaning-schedule.md`, new verification guide
  - Pre-commit: N/A (no tests)

- [ ] 8. Send Telegram Notification

  **What to do**:

  ```bash
  tsx scripts/telegram-notify.ts "✅ Cleaning schedule full accuracy fix complete — output verified: 6 properties, correct times (280 min), normalized addresses, Notion zones fixed."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None
  - **Blocked By**: Task 7

  **Acceptance Criteria**:
  - [ ] Telegram notification sent (exit code 0)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Notification sent
    Tool: Bash
    Steps:
      1. Run tsx scripts/telegram-notify.ts with message
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-8-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> Not needed as a separate wave — Task 5 IS the verification. The employee output is directly verified against API ground truth and user-confirmed expected schedule.
> If Task 5 passes (6 correct entries with correct times and addresses), the work is done.

---

## Commit Strategy

- **After Task 5 passes**: Single commit with all changes:
  - `prisma/seed.ts`
  - `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json`
  - `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json`
  - `docs/employees/cleaning-schedule.md`
  - `docs/guides/YYYY-MM-DD-HHMM-cleaning-schedule-verification.md`

---

## Success Criteria

### Verification Commands

```bash
# Trigger
source .env
curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"inputs":{"date":"2026-06-01"}}'
# Expected: 202 + task_id

# Wait for Done
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '<task_id>';"
# Expected: Done

# Verify entry count in Slack output
source .env
curl -s "https://slack.com/api/conversations.history" \
  -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
  -d "channel=C0B71QSMZKQ&limit=3" | jq '.messages[0].text'
# Expected: 6 bullet-point entries, all Yessica, correct times
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Output matches user-confirmed expected schedule (6 entries, correct times, normalized addresses)
- [ ] Banton under Austin in both Notion pages
- [ ] docs/employees/cleaning-schedule.md errors fixed
- [ ] Troubleshooting guide created
