# Cleaning Schedule — Corrected Business Rules & Data Accuracy

## TL;DR

> **Quick Summary**: Replace fabricated mock fixtures with real Notion data, rewrite the cleaning-schedule employee's instructions to use the corrected Check-In Billing Rule (billing based on check-ins, not check-outs), correct 45-min travel overhead (trash-only days), and add CHECK-IN/CHECK-OUT context to output.
>
> **Deliverables**:
>
> - 3 new mock fixture files matching corrected Notion documents
> - Rewritten `execution_steps` and `identity` in prisma/seed.ts with correct business rules
> - Live DB updated via SQL UPDATE
> - Verified Slack output with correct service types, costs, and team assignments
> - Updated docs/employees/cleaning-schedule.md
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: T1/T2 → T3 → T4 → T5 → T6

---

## Context

### Original Request

Fix data accuracy issues in the cleaning-schedule AI employee. The employee was producing wrong output — calling Austin properties "Loft" ($60/60min) when they're actually Homes ($120-$160, 90-185min). Root cause: the employee read fabricated mock fixture data instead of real Notion documents.

### Interview Summary

**Key Discussions** (extensive — 9 rounds of corrections):

- **Check-In Billing Rule**: Replaces the old "Golden Rule." Cost is ALWAYS based on what's checking IN, not what's checking out. If Home checks out and Rooms check in → pay Room rates. If checkout with no check-in → prepare as rooms.
- **45-min travel overhead**: Only for trash-only days (no cleanings), not an adder on every weekday. 271 Gina is NOT an exception. Represents round-trip travel time.
- **Notion document errors**: Found and fixed 9 errors directly in Notion via API (5 in Reporte Financiero, 4 in Manual de Personal including the Golden Rule rewrite).
- **Route priority**: 3420 Hovenweep gets first slot when it has a checkout (10AM checkout priority).
- **Trash skip**: 5306 King Charles (owners handle) and 219 Paul St (bin always on street).
- **Backup threshold**: 7 hours (420 min), not 6.5.
- **Bundle**: Multiple units rented together as one booking. Match Hostfully listing type.
- **Output format**: Must clearly show CHECK-IN vs CHECK-OUT for each listing.

**Research Findings**:

- All 3 Notion pages fetched and verified after corrections
- `get-page.ts` mock mode does NOT recurse into `has_children` blocks — fixtures must flatten nested content
- `default.json` is a stale duplicate — needs deletion
- Fixture block IDs can be fabricated (mock mode only reads `rich_text[].plain_text`)
- The employee only fetches checkouts currently; but the reservation data already contains check-in dates — no new Hostfully query needed, just a reinterpretation of existing data

### Metis Review

**Identified Gaps** (addressed):

- Check-In Billing Rule doesn't require separate Hostfully query — resolved: same data, different interpretation
- `default.json` deletion could break mock mode if `--fixture` is omitted — resolved: ensure all execution_steps calls have explicit `--fixture`
- `approval_required: false` means wrong output goes directly to Slack — resolved: add cleanup step in verification
- Docs OAuth instructions say "BOTH" instead of "all three" — resolved: added to docs update task
- Test date may not have checkouts — resolved: pre-check before triggering

---

## Work Objectives

### Core Objective

Make the cleaning-schedule AI employee read correct data from 3 Notion documents and apply accurate business rules (Check-In Billing, team assignment, trash handling, route priority) to produce a correct daily cleaning schedule.

### Concrete Deliverables

- `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json` — new fixture
- `src/worker-tools/notion/fixtures/get-page/manual-personal.json` — new fixture
- `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json` — new fixture
- `prisma/seed.ts` — updated `execution_steps` and `identity` for cleaning-schedule archetype
- `docs/employees/cleaning-schedule.md` — updated with new page IDs and rules
- Old fixtures deleted: `cleaning-zones.json`, `trash-schedule.json`, `default.json`

### Definition of Done

- [ ] Triggered employee produces Slack message with correct service types (no "Loft" for Austin properties)
- [ ] Slack message shows CHECK-IN/CHECK-OUT context per listing
- [ ] Costs match Reporte Financiero (e.g., Sand Dunes Home = $135/180min, not $60/60min)
- [ ] Team assignments match Manual de Personal ZIP rules
- [ ] No trash reminders for King Charles or Paul St

### Must Have

- Check-In Billing Rule encoded in execution_steps
- All 3 new Notion page IDs in execution_steps
- Correct fixture names with `--fixture` on every `get-page.ts` call
- CHECK-IN/CHECK-OUT labels in output
- Route priority for 3420 Hovenweep

### Must NOT Have (Guardrails)

- MUST NOT change `risk_model`, `tool_registry`, `input_schema`, `delivery_steps`, or `delivery_instructions`
- MUST NOT add new shell tools
- MUST NOT run `pnpm prisma db seed` — direct SQL UPDATE only
- MUST NOT hardcode costs in execution_steps — all costs come from Reporte Financiero at runtime
- MUST NOT use `--fixture default` anywhere — `default.json` is being deleted
- MUST NOT leave the model overridden after testing — restore to `minimax/minimax-m2.7`
- MUST NOT change STEP 1's checkout-fetching logic beyond adding check-in interpretation
- MUST NOT use `--no-verify` when committing

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (user decision — 63 pre-existing failures, skip for now)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/DB**: Use Bash (psql, curl) — query DB, assert field values
- **Slack output**: Use Bash (curl Slack API) — verify message content
- **File changes**: Use Bash (grep, diff) — verify content correctness

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — fixtures + seed.ts in parallel):
├── Task 1: Create 3 new mock fixtures + delete old ones [quick]
└── Task 2: Rewrite execution_steps + identity in seed.ts [deep]

Wave 2 (After Wave 1 — apply to DB):
└── Task 3: Back up DB + apply SQL UPDATE [quick]

Wave 3 (After Wave 2 — verify):
└── Task 4: Override model + trigger + verify Slack output [deep]

Wave 4 (After Wave 3 — docs + commit):
├── Task 5: Update docs/employees/cleaning-schedule.md [quick]
└── Task 6: Commit all changes + Telegram notification [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [deep]
→ Present results → Get explicit user okay

Critical Path: T1/T2 → T3 → T4 → T5/T6 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Wave 1)
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

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `deep`
- **Wave 2**: 1 task — T3 → `quick`
- **Wave 3**: 1 task — T4 → `deep`
- **Wave 4**: 2 tasks — T5 → `quick`, T6 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create 3 new mock fixture files + delete old ones

  **What to do**:
  - Create `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json` with flattened content from the real Directorio Operativo Notion page (`370d540b4380809a8ea0c11074f92abb`). The fixture must include ALL nested children (unit types and trash schedules) as top-level blocks, since `get-page.ts` mock mode does NOT recurse into `has_children` blocks.
  - Create `src/worker-tools/notion/fixtures/get-page/manual-personal.json` with flattened content from Manual de Personal (`370d540b438080969a72c16c20defc70`). Include all children of the "Tiempos Extra por Traslado" and "Reglas de Basura" numbered list items as top-level blocks.
  - Create `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json` with content from Reporte Financiero (`370d540b438080ca8676e61856488960`). This page has no nested children — direct copy of block structure.
  - Delete old fixtures: `cleaning-zones.json`, `trash-schedule.json`, `default.json`
  - Block IDs in fixtures may be fabricated (same pattern as existing fixtures) — only the `rich_text[].plain_text` content must match the real Notion pages exactly.
  - **IMPORTANT**: The Notion documents were corrected during the interview. The CURRENT content is correct. Fetch the real pages via the Notion API to get the current content, don't copy from any cached version.

  **How to fetch real content**: Decrypt the Notion token from tenant_secrets:

  ```sql
  SELECT ciphertext, iv, auth_tag FROM tenant_secrets
  WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND key = 'notion_access_token';
  ```

  Decrypt using ENCRYPTION_KEY from `.env` with AES-256-GCM (see `src/lib/encryption.ts:27-35`). Then call:

  ```bash
  curl -s "https://api.notion.com/v1/blocks/<page_id>/children?page_size=100" \
    -H "Authorization: Bearer <token>" -H "Notion-Version: 2022-06-28"
  ```

  For blocks with `has_children: true`, fetch their children and include them as top-level blocks in the fixture.

  **Must NOT do**:
  - Do NOT copy content from the old fixtures — they contain fabricated data
  - Do NOT leave `default.json` — it's a stale duplicate

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `src/worker-tools/notion/get-page.ts:89-165` — mock mode logic: reads `fixtures/get-page/<fixture>.json`, only processes top-level `results` array (does NOT recurse into children)
  - `src/worker-tools/notion/fixtures/get-page/cleaning-zones.json` — existing fixture format to follow (block structure with fabricated IDs)
  - `src/lib/encryption.ts:27-35` — `decrypt()` function for Notion token
  - Notion page IDs: `370d540b4380809a8ea0c11074f92abb` (Directorio), `370d540b438080969a72c16c20defc70` (Manual), `370d540b438080ca8676e61856488960` (Reporte)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 3 new fixtures exist with correct content
    Tool: Bash
    Steps:
      1. ls src/worker-tools/notion/fixtures/get-page/
      2. Assert: directorio-operativo.json, manual-personal.json, reporte-financiero.json exist
      3. Assert: cleaning-zones.json, trash-schedule.json, default.json do NOT exist
      4. node -e "const f=require('./src/worker-tools/notion/fixtures/get-page/reporte-financiero.json'); const texts=f.results.map(b=>b[b.type]?.rich_text?.map(r=>r.plain_text).join('')).filter(Boolean); console.log(texts.join('\n'))"
      5. Assert output contains "3412 Sand Dunes Ave: Home ($135 - 180 min)" (not 250 min)
      6. Assert output contains "4403 Hayride Ln: Unidades A, B y C ($80 c/u - 90 min)" (not 100 min)
      7. Assert output contains "271 Gina Dr: Home ($160 - 185 min)"
      8. Assert output contains "Room 5 ($40 - 40 min)" (not $39)
    Expected Result: All 3 fixtures exist, old ones deleted, content matches corrected Notion data
    Evidence: .sisyphus/evidence/task-1-fixtures-verified.txt

  Scenario: Manual de Personal fixture has flattened children
    Tool: Bash
    Steps:
      1. node -e "const f=require('./src/worker-tools/notion/fixtures/get-page/manual-personal.json'); const texts=f.results.map(b=>b[b.type]?.rich_text?.map(r=>r.plain_text).join('')).filter(Boolean); console.log(texts.join('\n'))"
      2. Assert output contains "Regla de Cobro (Check-In)" (new billing rule, not old Golden Rule)
      3. Assert output contains "Si no hay check-ins ni limpiezas programadas" (corrected 45-min rule)
      4. Assert output does NOT contain "Excepción" or "271 Gina Dr, NO añadas" (deleted exception)
      5. Assert output contains "7 horas diarias" (not 6.5)
    Expected Result: Manual fixture has all corrected rules flattened as top-level blocks
    Evidence: .sisyphus/evidence/task-1-manual-fixture-verified.txt

  Scenario: Directorio Operativo fixture has flattened property details
    Tool: Bash
    Steps:
      1. node -e "const f=require('./src/worker-tools/notion/fixtures/get-page/directorio-operativo.json'); const texts=f.results.map(b=>b[b.type]?.rich_text?.map(r=>r.plain_text).join('')).filter(Boolean); console.log(texts.join('\n'))"
      2. Assert output contains "Unidades: Home | Rooms 1-4" (Sand Dunes children flattened)
      3. Assert output contains "Basura: Martes" (trash schedule children flattened)
      4. Assert output contains "Check-out: 10:00 AM (Prioridad de Ruta)" (Hovenweep priority)
    Expected Result: All property children (unit types, trash schedules) are top-level blocks
    Evidence: .sisyphus/evidence/task-1-directorio-fixture-verified.txt
  ```

  **Commit**: YES (groups with T2, T5 in single commit after T5)
  - Message: `fix(cleaning-schedule): replace mock fixtures and correct business rules`
  - Files: `src/worker-tools/notion/fixtures/get-page/*.json`

- [x] 2. Rewrite execution_steps + identity in prisma/seed.ts

  **What to do**:
  - Update the `execution_steps` field for the cleaning-schedule archetype in `prisma/seed.ts` (lines ~3530-3610 in both the create and update blocks).
  - Update the `identity` field (lines ~3518-3528) to reflect the corrected rules.
  - The new execution_steps must reference the 3 new Notion page IDs and fixture names.
  - Encode the following corrected business rules:

  **CHECK-IN BILLING RULE** (replaces old "Golden Rule"):

  ```
  The cost and cleaning time are ALWAYS determined by what's CHECKING IN, not what's checking out:
  - If Home checks out + Rooms check in → charge Room rates (e.g., $30/25min per room)
  - If Rooms check out + Home checks in → charge Home rate (e.g., $135/180min)
  - If Rooms check out + Rooms check in → charge Room rates
  - If checkout with NO check-in that day → still prepare, charge as Rooms (not Home)
  - Home + Loft (407 S Gevers) are SEPARATE physical units — always charge both individually
  - Bundle = multiple units rented together (Hostfully listing type) — use Bundle rate
  ```

  **STEP 1 — Fetch reservations**:
  The employee currently fetches checkouts only. The reservation data from Hostfully already includes both `check_in_date` and `check_out_date` for each reservation. The execution_steps should instruct the AI to:
  1. Find properties with CHECKOUTS on the target date (who needs cleaning)
  2. For each property with a checkout, ALSO check if there are CHECK-INS on the same date
  3. Use the check-in unit type to determine billing rate (per the Check-In Billing Rule above)

  **STEP 2 — Read Notion documents**:
  Replace old page IDs with new ones:
  - `370d540b4380809a8ea0c11074f92abb` (Directorio Operativo) → `--fixture directorio-operativo`
  - `370d540b438080969a72c16c20defc70` (Manual de Personal) → `--fixture manual-personal`
  - `370d540b438080ca8676e61856488960` (Reporte Financiero) → `--fixture reporte-financiero`

  **Every `get-page.ts` call MUST have `--fixture <name>`** — `default.json` is being deleted.

  **ADDITIONAL RULES to encode** (not in old execution_steps):
  - **Route priority**: If 3420 Hovenweep Ave has a checkout, it goes FIRST in the Austin section (10AM checkout priority)
  - **Trash skip**: Skip trash tasks for 5306 King Charles Dr (owners handle) and 219 Paul St (bin always on street)
  - **Backup threshold**: 7 hours (420 min), not 6.5
  - **45-min travel**: Only for ZIPs 78744/78640, only when NO cleanings scheduled (trash-only day). 45 min = round-trip travel from cleaner's home. 271 Gina is NOT an exception.
  - **Trash reminders**: 1 day before for 78744/78640; 2 days + 1 day before for 78203/78109
  - **Output context**: Each property line must show CHECK-IN or CHECK-OUT label
  - **Inactive**: 4402 McKinney Falls is not active; skip if encountered

  **Must NOT do**:
  - Do NOT change `risk_model`, `tool_registry`, `input_schema`, `delivery_steps`, `delivery_instructions`
  - Do NOT hardcode property costs — the AI reads them from Reporte Financiero at runtime
  - Do NOT use `--fixture default`
  - Do NOT omit `--fixture` from any `get-page.ts` call

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: covers all archetype schema fields, seed data patterns, and the execution_steps format

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `prisma/seed.ts:3518-3767` — current cleaning-schedule archetype (both create and update blocks). The `execution_steps` and `identity` fields are what need changing.
  - `prisma/seed.ts:3530-3610` — current execution_steps with old page IDs and old Golden Rule
  - `prisma/seed.ts:3623` — `approval_required: false` (don't change)
  - `src/worker-tools/notion/get-page.ts:89-165` — mock mode, `--fixture` flag usage
  - Previous execution_steps format: follow the STEP 1 / STEP 2 / STEP 3 pattern used in the existing archetype
  - Draft file `.sisyphus/drafts/cleaning-schedule-data-accuracy-v2.md` — contains all confirmed rules with user's exact quotes

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: execution_steps uses correct page IDs and fixture names
    Tool: Bash
    Steps:
      1. grep "370d540b4380809a8ea0c11074f92abb" prisma/seed.ts
      2. Assert: at least 2 matches (create + update blocks) — Directorio Operativo
      3. grep "370d540b438080969a72c16c20defc70" prisma/seed.ts
      4. Assert: at least 2 matches — Manual de Personal
      5. grep "370d540b438080ca8676e61856488960" prisma/seed.ts
      6. Assert: at least 2 matches — Reporte Financiero
      7. grep "get-page.ts" prisma/seed.ts | grep -v "\-\-fixture"
      8. Assert: 0 lines (every get-page.ts call has --fixture)
    Expected Result: All 3 new page IDs present, all get-page calls have --fixture
    Evidence: .sisyphus/evidence/task-2-page-ids-verified.txt

  Scenario: Old Golden Rule replaced with Check-In Billing Rule
    Tool: Bash
    Steps:
      1. grep -i "golden rule\|regla de oro\|IGNORA los tiempos" prisma/seed.ts
      2. Assert: 0 matches (old rule removed)
      3. grep -i "check-in\|CHECK.IN\|checking in" prisma/seed.ts
      4. Assert: at least 2 matches (new billing rule in both create + update blocks)
    Expected Result: Old rule gone, new Check-In Billing Rule present
    Evidence: .sisyphus/evidence/task-2-billing-rule-verified.txt

  Scenario: No forbidden fields changed
    Tool: Bash
    Steps:
      1. Read the `risk_model`, `tool_registry`, `input_schema`, `delivery_steps`, `delivery_instructions` sections
      2. Compare against current values (use git diff after editing)
      3. Assert: these fields are UNCHANGED
    Expected Result: Only execution_steps and identity fields changed
    Evidence: .sisyphus/evidence/task-2-scope-verified.txt

  Scenario: All additional rules present
    Tool: Bash
    Steps:
      1. grep -i "hovenweep\|10:00\|prioridad" prisma/seed.ts → at least 2 matches (route priority)
      2. grep -i "king charles\|paul st\|skip.*trash\|omitir.*basura" prisma/seed.ts → at least 2 matches (trash skip)
      3. grep -i "7 hora\|420 min\|seven hour" prisma/seed.ts → at least 2 matches (backup threshold)
      4. grep -i "45 minuto\|traslado\|trash.only\|basura.*sin.*limpieza" prisma/seed.ts → at least 2 matches (travel overhead)
    Expected Result: All rules present in execution_steps
    Evidence: .sisyphus/evidence/task-2-rules-verified.txt
  ```

  **Commit**: YES (groups with T1, T5)
  - Message: `fix(cleaning-schedule): replace mock fixtures and correct business rules`
  - Files: `prisma/seed.ts`

- [x] 3. Back up DB + apply SQL UPDATE

  **What to do**:
  - Back up the current archetype row: `PGPASSWORD=postgres pg_dump -h localhost -p 54322 -U postgres -d ai_employee -t archetypes --data-only --inserts --column-inserts -c "WHERE id = '00000000-0000-0000-0000-000000000019'" > /tmp/cleaning-schedule-archetype-backup-v2.sql`
  - Extract the new `execution_steps` and `identity` values from the updated `prisma/seed.ts`
  - Apply via direct SQL UPDATE (NOT `pnpm prisma db seed`):
    ```sql
    UPDATE archetypes SET
      execution_steps = '<new value>',
      identity = '<new value>',
      updated_at = NOW()
    WHERE id = '00000000-0000-0000-0000-000000000019';
    ```
  - Verify the update took effect

  **Must NOT do**:
  - Do NOT run `pnpm prisma db seed` — it would reset other data
  - Do NOT change any other archetype fields

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `prisma/seed.ts` — source of truth for the new field values (after Task 2 completes)
  - Previous backup at `/tmp/cleaning-schedule-archetype-backup.sql` (813 lines, from earlier session)
  - AGENTS.md "Database Backup" section — backup protocol

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DB has updated execution_steps with new page IDs
    Tool: Bash
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" > /tmp/cs-exec-steps-check.txt
      2. grep "370d540b4380809a8ea0c11074f92abb" /tmp/cs-exec-steps-check.txt
      3. Assert: match found (Directorio Operativo page ID)
      4. grep -i "check-in\|CHECK.IN" /tmp/cs-exec-steps-check.txt
      5. Assert: match found (Check-In Billing Rule)
      6. grep "36fd540b" /tmp/cs-exec-steps-check.txt
      7. Assert: 0 matches (old page IDs removed)
    Expected Result: DB has new page IDs and corrected rules
    Evidence: .sisyphus/evidence/task-3-db-verified.txt

  Scenario: Backup file exists and is non-empty
    Tool: Bash
    Steps:
      1. wc -l /tmp/cleaning-schedule-archetype-backup-v2.sql
      2. Assert: file exists and has >10 lines
    Expected Result: Backup created before UPDATE
    Evidence: .sisyphus/evidence/task-3-backup-verified.txt
  ```

  **Commit**: NO (DB change only, no files)

- [x] 4. Override model + trigger + verify Slack output

  **What to do**:
  - Override the model to `deepseek/deepseek-v4-flash` for testing (minimax/minimax-m2.7 may not call tools reliably):
    ```sql
    UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash'
    WHERE id = '00000000-0000-0000-0000-000000000019';
    ```
  - **Pre-check**: Before triggering, verify there are real checkouts on the target date. Query Hostfully or use `?dry_run=true`:
    ```bash
    source .env
    curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger?dry_run=true" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
    ```
    If no checkouts, try a different date via the input_schema.
  - Trigger the employee:
    ```bash
    curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq '{task_id, status_url}'
    ```
  - Wait for task to reach `Done` (poll every 30s, max 5 min)
  - Fetch the Slack message and verify content
  - **Restore model after testing**:
    ```sql
    UPDATE archetypes SET model = 'minimax/minimax-m2.7'
    WHERE id = '00000000-0000-0000-0000-000000000019';
    ```
  - If Slack output is wrong: note the issues, do NOT leave a wrong schedule visible without posting a follow-up correction in the thread

  **Must NOT do**:
  - Do NOT leave the model overridden — restore to `minimax/minimax-m2.7` after testing
  - Do NOT skip the pre-check for checkouts

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: covers task status checking, container logs, stuck-state diagnostics

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 5, Task 6
  - **Blocked By**: Task 3

  **References**:
  - AGENTS.md "Task Debugging Quick Reference" — task state queries, container logs
  - AGENTS.md "Recommended Test Employee" section — trigger pattern
  - Slack channel: `C0B71QSMZKQ` (cleaning-schedule channel)
  - VLRE tenant: `00000000-0000-0000-0000-000000000003`
  - Archetype ID: `00000000-0000-0000-0000-000000000019`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Task reaches Done status
    Tool: Bash
    Steps:
      1. Store TASK_ID from trigger response
      2. Poll: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
      3. Wait until status = 'Done' (max 5 min, poll every 30s)
    Expected Result: Task completes successfully
    Evidence: .sisyphus/evidence/task-4-task-done.txt

  Scenario: Slack message has correct service types (no Loft for Austin)
    Tool: Bash
    Steps:
      1. Fetch Slack message from channel C0B71QSMZKQ (latest message)
      2. For any Austin property (ZIP 78744): assert does NOT contain "Loft" as service type
      3. Assert service types match Reporte Financiero (Home, Rooms, Bundle as appropriate)
      4. If 3412 Sand Dunes is present: assert "180 min" or "3 horas" (not 250 min)
    Expected Result: Correct service types — no fabricated "Loft" for Austin properties
    Failure Indicators: "Loft" appearing for any Austin property, or "250 min" for Sand Dunes
    Evidence: .sisyphus/evidence/task-4-service-types.txt

  Scenario: Output shows CHECK-IN/CHECK-OUT context
    Tool: Bash
    Steps:
      1. Read the Slack message content
      2. Assert: each property line includes a check-in or check-out indicator
      3. Indicators can be: "CHECK-IN", "CHECK-OUT", "check-in", "check-out", "entrada", "salida", or similar
    Expected Result: Every listing shows whether it's a check-in or check-out
    Evidence: .sisyphus/evidence/task-4-checkin-context.txt

  Scenario: Correct team assignments by ZIP
    Tool: Bash
    Steps:
      1. Read the Slack message content
      2. If Austin/Kyle properties (78744/78640): assert assigned to Yessica (primary) or Diana/backup
      3. If San Antonio/Converse properties (78203/78109): assert assigned to Zenaida (primary) or backup
    Expected Result: Team assignments match Manual de Personal ZIP rules
    Evidence: .sisyphus/evidence/task-4-team-assignments.txt

  Scenario: No trash tasks for King Charles or Paul St
    Tool: Bash
    Steps:
      1. Read the Slack message content
      2. If 5306 King Charles appears: assert no trash-related content
      3. If 219 Paul St appears: assert no "Sacar basura" or "trash" content
    Expected Result: Trash skipped for these two properties
    Evidence: .sisyphus/evidence/task-4-trash-skip.txt

  Scenario: Model restored after testing
    Tool: Bash
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
      2. Assert: result = 'minimax/minimax-m2.7'
    Expected Result: Model restored to default
    Evidence: .sisyphus/evidence/task-4-model-restored.txt
  ```

  **Commit**: NO (runtime verification only)

- [x] 5. Update docs/employees/cleaning-schedule.md

  **What to do**:
  - Replace old Notion page IDs with new ones in the Notion Pages table:
    - Remove: `36fd540b4380809ca373ca83e90216a3` (trash schedule), `36fd540b438080b2be9cf4b4218d657b` (cleaning zones)
    - Add: `370d540b4380809a8ea0c11074f92abb` (Directorio Operativo), `370d540b438080969a72c16c20defc70` (Manual de Personal), `370d540b438080ca8676e61856488960` (Reporte Financiero)
  - Update the Notion OAuth setup instructions: change "select BOTH cleaning pages" to "select all three cleaning pages (Directorio Operativo, Manual de Personal, Reporte Financiero)"
  - Add a "Business Rules" section documenting the key rules:
    - Check-In Billing Rule (replaces Golden Rule)
    - 45-min travel overhead (trash-only days)
    - Team assignment by ZIP
    - Route priority for Hovenweep
    - Trash skip for King Charles and Paul St

  **Must NOT do**:
  - Do NOT change unrelated sections of the docs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 6)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:
  - `docs/employees/cleaning-schedule.md` — current docs with old page IDs at lines 29-32
  - `.sisyphus/drafts/cleaning-schedule-data-accuracy-v2.md` — complete list of confirmed rules

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docs have correct page IDs
    Tool: Bash
    Steps:
      1. grep "36fd540b" docs/employees/cleaning-schedule.md
      2. Assert: 0 matches (old page IDs removed)
      3. grep "370d540b" docs/employees/cleaning-schedule.md
      4. Assert: 3 matches (3 new page IDs)
    Expected Result: Old IDs removed, all 3 new IDs present
    Evidence: .sisyphus/evidence/task-5-docs-page-ids.txt

  Scenario: OAuth instructions updated
    Tool: Bash
    Steps:
      1. grep -i "both.*page\|select both\|BOTH.*cleaning" docs/employees/cleaning-schedule.md
      2. Assert: 0 matches (no "BOTH" references)
      3. grep -i "three\|tres\|3.*page\|all three" docs/employees/cleaning-schedule.md
      4. Assert: at least 1 match (says "all three" now)
    Expected Result: OAuth instructions say "all three" not "both"
    Evidence: .sisyphus/evidence/task-5-docs-oauth.txt
  ```

  **Commit**: YES (groups with T1, T2)
  - Message: `fix(cleaning-schedule): replace mock fixtures and correct business rules`
  - Files: `docs/employees/cleaning-schedule.md`

- [x] 6. Commit all changes + Telegram notification

  **What to do**:
  - Stage all changed files:
    - `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json` (new)
    - `src/worker-tools/notion/fixtures/get-page/manual-personal.json` (new)
    - `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json` (new)
    - `src/worker-tools/notion/fixtures/get-page/cleaning-zones.json` (deleted)
    - `src/worker-tools/notion/fixtures/get-page/trash-schedule.json` (deleted)
    - `src/worker-tools/notion/fixtures/get-page/default.json` (deleted)
    - `prisma/seed.ts` (modified)
    - `docs/employees/cleaning-schedule.md` (modified)
  - Commit with message: `fix(cleaning-schedule): replace mock fixtures and correct business rules`
  - Do NOT use `--no-verify`
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ Cleaning schedule data accuracy plan complete — corrected business rules, fixed Notion docs, verified Slack output."`

  **Must NOT do**:
  - Do NOT use `--no-verify`
  - Do NOT add `Co-authored-by` lines
  - Do NOT reference AI tools in commit message

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 5)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 5

  **References**:
  - AGENTS.md "Git Commit Rules" section
  - `scripts/telegram-notify.ts` — notification script

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Clean commit with all files
    Tool: Bash
    Steps:
      1. git log -1 --format="%s"
      2. Assert: message = "fix(cleaning-schedule): replace mock fixtures and correct business rules"
      3. git diff HEAD~1 --name-only
      4. Assert: includes all 8 files (3 new fixtures, 3 deleted fixtures, seed.ts, cleaning-schedule.md)
      5. git log -1 --format="%b" | grep -i "co-authored\|claude\|ai\|opencode"
      6. Assert: 0 matches
    Expected Result: Clean commit with correct message and all files
    Evidence: .sisyphus/evidence/task-6-commit-verified.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "✅ Cleaning schedule data accuracy plan complete — corrected business rules, fixed Notion docs, verified Slack output."
      2. Assert: exit code 0
    Expected Result: Notification delivered
    Evidence: .sisyphus/evidence/task-6-telegram-sent.txt
  ```

  **Commit**: This IS the commit task

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` (check for type errors in changed files). Review seed.ts changes for: hardcoded costs (forbidden), missing `--fixture` flags, stale page IDs. Check fixture JSON is valid. Verify no `default.json` references remain.
      Output: `Build [PASS/FAIL] | Fixtures [N valid] | Seed.ts [CLEAN/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Verify the Slack message posted by T4. Check: no "Loft" for Austin properties, correct costs match Reporte Financiero, correct team assignments by ZIP, CHECK-IN/CHECK-OUT context visible, no trash for King Charles/Paul St. If 3420 Hovenweep has a checkout, verify it appears first in Austin section.
      Output: `Billing Rule [PASS/FAIL] | Costs [N/N correct] | Teams [PASS/FAIL] | Context [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Verify only `execution_steps` and `identity` changed in seed.ts (not `risk_model`, `tool_registry`, `input_schema`, `delivery_steps`, `delivery_instructions`). Verify model was restored to `minimax/minimax-m2.7` after testing. Verify old fixtures deleted, new fixtures created. Verify docs updated with all 3 new page IDs.
      Output: `Scope [CLEAN/N issues] | Model [restored/not restored] | Files [N/N correct] | VERDICT`

---

## Commit Strategy

- **Single commit after T5**: `fix(cleaning-schedule): replace mock fixtures and correct business rules`
  - Files: `src/worker-tools/notion/fixtures/get-page/*.json`, `prisma/seed.ts`, `docs/employees/cleaning-schedule.md`
  - Pre-commit: `grep "get-page.ts" prisma/seed.ts | grep -v "\-\-fixture"` → expect 0 lines

---

## Success Criteria

### Verification Commands

```bash
# No stale fixtures
ls src/worker-tools/notion/fixtures/get-page/
# Expected: directorio-operativo.json, manual-personal.json, reporte-financiero.json (NO cleaning-zones.json, trash-schedule.json, default.json)

# No --fixture-less get-page.ts calls in seed.ts
grep "get-page.ts" prisma/seed.ts | grep -v "\-\-fixture"
# Expected: 0 lines

# Docs reference all 3 new pages
grep -c "370d540b" docs/employees/cleaning-schedule.md
# Expected: 3 (one per new page ID)

# Model restored after testing
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
# Expected: minimax/minimax-m2.7
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Slack output verified with correct data
- [ ] Model restored to minimax/minimax-m2.7
- [ ] All old fixtures deleted
- [ ] Docs updated with 3 new page IDs
