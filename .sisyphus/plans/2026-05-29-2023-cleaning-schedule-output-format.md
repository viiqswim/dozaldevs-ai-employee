# Cleaning Schedule Output Format Improvements

## TL;DR

> **Quick Summary**: Rewrite the cleaning-schedule employee's `execution_steps` to produce clean, person-grouped, geography-aware Slack schedules instead of the current cluttered property-centric format.
>
> **Deliverables**:
>
> - Updated `execution_steps` and `identity` in `prisma/seed.ts`
> - Fixed `input_schema` format (flat object → `InputSchemaItem[]` array)
> - Live DB updated with all changes
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (each task depends on prior)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request

The cleaning-schedule AI employee produces a Slack message that is cluttered, property-centric, and shows unnecessary information. User gave 5 specific improvement points plus a geographic optimization requirement.

### Interview Summary

**Key Discussions**:

- Output must be grouped by cleaner, not by property
- Use real street addresses, never property codes (e.g., "219-PAU-HOME")
- No lock/door codes — cleaners already have access
- Never show "UNASSIGNED" — the schedule IS the assignment
- Only show trash when there IS trash duty — never "sin basura"
- Show service type + duration per property
- Show cleaning cost per cleaner in a summary section (internal payment tracking)
- CRITICAL: Geographic proximity must drive assignments — never send a cleaner across cities (Austin ↔ San Antonio = 80+ miles)

**Research Findings**:

- Notion zones are already geographic (Zone 1: Austin/Kyle, Zone 2: San Antonio/Converse, Zone 3: Bailey CO)
- Notion zones page has service type, duration, and cost per property (e.g., "Home (90 min - $125)")
- Current `execution_steps` explicitly instruct the employee to show codes, flag UNASSIGNED, and organize by property — all must be rewritten
- `input_schema` bug: seed stores flat object but dashboard expects `InputSchemaItem[]` array — seed must be fixed to prevent reintroduction on future reseeds (dashboard already works)

### Metis Review

**Identified Gaps** (addressed):

- Unassigned behavior: resolved — always assign via geographic zone matching
- Cost visibility: resolved — summary section only, not per-property
- Trash day lookup: resolved — use checkout date's day of week
- DB safety: included backup step before SQL UPDATE
- Address fallback: included — use Hostfully property name if get-property.ts returns no address
- `input_schema` field mapping: `scope` → `frequency`, `type: "string"` → `type: "date"`, add `key` and `label` fields

---

## Work Objectives

### Core Objective

Replace the cleaning-schedule employee's formatting rules so the Slack output is cleaner-grouped, geography-aware, and free of unnecessary information.

### Concrete Deliverables

- Updated `execution_steps` field in `prisma/seed.ts` (both `create` and `update` blocks)
- Updated `identity` field in `prisma/seed.ts` (both blocks)
- Fixed `input_schema` in `prisma/seed.ts` (both blocks) — flat object → `InputSchemaItem[]` array
- Live DB archetype row updated via SQL

### Definition of Done

- [ ] Trigger the employee → Slack message is grouped by cleaner name
- [ ] Slack message contains zero property codes (no "XXX-YYY-HOME" patterns)
- [ ] Slack message contains zero lock codes
- [ ] Slack message contains zero "UNASSIGNED" labels
- [ ] Slack message contains zero "sin basura" or negative trash indicators
- [ ] No cleaner is assigned to properties in multiple different cities
- [ ] Seed file `input_schema` is in correct array format (prevents regression on future reseed)

### Must Have

- Geographic assignment logic in execution_steps (city → zone → cleaner)
- Person-grouped output format
- Real street addresses from get-property.ts
- Service type + duration per property
- Cost summary section per cleaner
- Trash indicator only when applicable
- Fixed `input_schema` as `InputSchemaItem[]` array

### Must NOT Have (Guardrails)

- Do NOT change `tool_registry`, `model`, `risk_model`, `delivery_steps`, `delivery_instructions`, or any other archetype field
- Do NOT modify any file in `src/workers/`, `src/inngest/`, `src/gateway/`, `src/worker-tools/`, or `dashboard/`
- Do NOT add new shell tools
- Do NOT change the Slack channel or notification channel
- Do NOT change `approval_required` (stays `false`)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — user explicitly said to skip unit tests (63 baseline failures)
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-*.{ext}`.

---

## Execution Strategy

### Sequential Execution (4 tasks)

```
Task 1: Update prisma/seed.ts [quick]
  ↓
Task 2: Backup archetype + apply SQL to live DB [quick]
  ↓
Task 3: Trigger employee + verify output format [deep]
  ↓
Task 4: Notify completion [quick]
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2, 3   | 1    |
| 2    | 1          | 3      | 2    |
| 3    | 2          | 4      | 3    |
| 4    | 3          | —      | 4    |

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`
- **Wave 2**: T2 → `quick`
- **Wave 3**: T3 → `deep`
- **Wave 4**: T4 → `quick`

---

## TODOs

- [x] 1. Update prisma/seed.ts — execution_steps, identity, and input_schema

  **What to do**:
  - Open `prisma/seed.ts` and find the cleaning-schedule archetype upsert (search for `role_name: 'cleaning-schedule'` — appears around lines 3518-3683)
  - There are TWO blocks that need identical changes: the `create` block (~line 3519) and the `update` block (~line 3602). Both MUST be updated identically.
  - Replace the `identity` field (in BOTH blocks) with this exact string:

    ```
    You are a Cleaning Schedule Coordinator for VLRE vacation rental properties. Your job is to generate a daily cleaning schedule by cross-referencing Hostfully checkout data, Notion cleaning zone assignments, and the Notion trash schedule. You read Notion content in Spanish. Your output goes directly to the cleaning team — organize by person, use real addresses, and keep it scannable on a phone screen. Geographic efficiency matters: never send a cleaner across cities.
    ```

  - Replace the `execution_steps` field (in BOTH blocks) with this exact string:

    ```
    You are a Cleaning Schedule Coordinator for VLRE properties. Your job is to create a daily cleaning schedule.

    INPUTS:
    - date: The target checkout date provided in inputs (format: YYYY-MM-DD)

    STEP 1 — Get Hostfully checkouts for the target date:
    - Use get-properties.ts to list all VLRE properties
    - Use get-reservations.ts to fetch reservations for each property
    - IMPORTANT: The --from/--to flags filter by CHECK-IN date, NOT checkout date
    - You must fetch a broad date range and filter client-side for reservations where checkout_date matches the target date
    - Run: tsx /tools/hostfully/get-reservations.ts --from <30-days-before-target> --to <target-date> --property-id <id>
    - You must loop through ALL properties to find checkouts on the target date
    - Use get-property.ts to get property details (full street address, city, ZIP code, checkOutTime) for each property with a checkout
    - If get-property.ts does not return an address for a property, use the Hostfully property name as fallback

    STEP 2 — Read Notion pages (content is in Spanish — parse accordingly):
    - Trash schedule page: tsx /tools/notion/get-page.ts --page-id 36fd540b4380809ca373ca83e90216a3 --fixture trash-schedule
    - Cleaning zones page: tsx /tools/notion/get-page.ts --page-id 36fd540b438080b2be9cf4b4218d657b --fixture cleaning-zones
    - Parse the Spanish content to extract:
      - From trash schedule: which properties need trash/recycling on the target day of week
      - From cleaning zones: zone geographic areas (city/region), cleaner names, availability (days/hours), service types with duration and cost, and which properties are in each zone

    STEP 3 — Assign cleaners using GEOGRAPHIC PROXIMITY (EVERY property MUST be assigned):
    - For each property with a checkout on the target date:
      - Get the property's full address, city, and ZIP code from get-property.ts
      - Find which zone covers the property's city/area (from cleaning zones page — zones are geographic, e.g., "ZONA 1: AUSTIN / KYLE", "ZONA 2: SAN ANTONIO / CONVERSE", "ZONA 3: BAILEY, COLORADO")
      - Assign the zone's primary cleaner if available that day of week
      - If the primary cleaner is NOT available that day, assign the zone's backup cleaner
      - If the property is not in any zone's explicit city list, assign to the nearest zone based on geographic proximity (same metro area, similar ZIP code prefix)
    - GEOGRAPHIC RULES (CRITICAL — NEVER VIOLATE):
      - NEVER assign a cleaner to a property outside their zone's geographic area (e.g., never send an Austin cleaner to San Antonio — they are 80+ miles apart)
      - Within the same city, group nearby properties together for the same cleaner (use ZIP code proximity and street address closeness)
      - Order each cleaner's properties by geographic proximity so they can clean efficiently in sequence (minimize driving between jobs)
    - EVERY property MUST have an assigned cleaner. NEVER show "UNASSIGNED" or "⚠️". This schedule IS the assignment.
    - Check trash schedule: note which properties need trash/recycling pickup on the target day of week
    - Match property codes between systems: Hostfully name "271-GIN-HOME" → Notion code "271-GIN" (strip suffixes like -HOME, -1, -2, etc. and use prefix match)

    STEP 4 — Build the schedule message:
    - Format as Slack mrkdwn text (NO Block Kit JSON, NO interactive buttons)
    - ORGANIZE BY ASSIGNED CLEANER — one section per cleaner with all their properties grouped together
    - Use REAL STREET ADDRESSES (from get-property.ts), NEVER property codes
    - For each property: show address with city, checkout time, service type with duration
    - Only show trash information for properties that HAVE trash duty that day — do NOT list "sin basura" or any negative indicator
    - Do NOT show property codes (e.g., "219-PAU-HOME") anywhere in the message
    - Do NOT show lock/door access codes
    - Add a summary section at the bottom with per-cleaner totals (number of properties, total minutes, total cleaning cost) and a grand total
    - Date and day names in Spanish

    EXACT OUTPUT FORMAT — follow this structure:

    🧹 *Limpieza — [DíaDeLaSemana] [Día] de [Mes]*

    👤 *[Nombre del Limpiador]*
      • [Dirección], [Ciudad] — checkout [Hora] — [TipoServicio] ([Duración])
      • [Dirección], [Ciudad] — checkout [Hora] — [TipoServicio] ([Duración])
        🗑️ Sacar basura ([TipoBasura])

    👤 *[Nombre del Limpiador]*
      • [Dirección], [Ciudad] — checkout [Hora] — [TipoServicio] ([Duración])

    ---
    📊 *Resumen*
    [N] propiedades · [N] personas
    [Limpiador1]: [N] propiedades — [TotalMin] min — $[Costo]
    [Limpiador2]: [N] propiedades — [TotalMin] min — $[Costo]
    *Total: $[GranTotal]*

    RULES:
    - 🗑️ trash line appears ONLY on properties with trash duty — indented under the property line
    - Properties under each cleaner ordered by geographic proximity (closest addresses first)
    - If zero checkouts: post "No hay checkouts para [date]. No se requiere limpieza." and submit as NO_ACTION_NEEDED

    STEP 5 — Post to Slack and submit:
    - Post the schedule to channel C0B71QSMZKQ using: tsx /tools/slack/post-message.ts --channel C0B71QSMZKQ --text "<schedule>"
    - Submit output: tsx /tools/platform/submit-output.ts --summary "<brief summary>" --classification NO_ACTION_NEEDED
    - If no checkouts: tsx /tools/platform/submit-output.ts --summary "No checkouts on <date>" --classification NO_ACTION_NEEDED

    IMPORTANT NOTES:
    - All Notion content is in Spanish — parse Spanish day names (LUNES=Monday, MARTES=Tuesday, MIÉRCOLES=Wednesday, JUEVES=Thursday, VIERNES=Friday, SÁBADO=Saturday, DOMINGO=Sunday)
    - Property code matching: Hostfully "271-GIN-HOME" → Notion "271-GIN" (prefix match, strip -HOME/-1/-2 etc.)
    - NEVER leave any property unassigned — always make a geographic best-effort assignment
    - NEVER show property codes or lock/door codes in the output
    - NEVER show "sin basura", "no trash", or any negative trash indicator
    - NEVER assign a cleaner to a property in a different city/metro area than their zone
    - Never send multiple Slack messages — one message to one channel only
    ```

  - Replace the `input_schema` field (in BOTH blocks) from the current flat object format:

    ```typescript
    input_schema: {
      date: {
        type: 'string',
        description: 'Target checkout date (YYYY-MM-DD format)',
        required: true,
        scope: 'every_run',
      },
    },
    ```

    to the correct `InputSchemaItem[]` array format:

    ```typescript
    input_schema: [
      {
        key: 'date',
        label: 'Checkout Date',
        type: 'date',
        frequency: 'every_run',
        required: true,
        description: 'Target checkout date (e.g. 2026-05-30)',
      },
    ],
    ```

  - Do NOT change any other fields (`model`, `tool_registry`, `risk_model`, `delivery_steps`, `delivery_instructions`, `notification_channel`, `status`, `temperature`, `concurrency_limit`, `trigger_sources`, `deliverable_type`, `runtime`, `tenant_id`, `department_id`)

  **Must NOT do**:
  - Do not modify any files outside `prisma/seed.ts`
  - Do not change any archetype field other than `identity`, `execution_steps`, and `input_schema`
  - Do not run `prisma db seed` (that would reseed the entire DB)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit with well-defined string replacements
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Not creating a new archetype, just updating text fields

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3518-3601` — The `create` block for cleaning-schedule archetype (identity at ~3523, execution_steps at ~3525, input_schema at ~3588)
  - `prisma/seed.ts:3602-3682` — The `update` block (identity at ~3605, execution_steps at ~3607, input_schema at ~3670)

  **API/Type References**:
  - `dashboard/src/lib/types.ts:68-77` — `InputSchemaItem` interface defining the required array format
  - `src/gateway/validation/schemas.ts:352-375` — Zod schema for `input_schema` validation (defines `type` enum values including `'date'`, `frequency` enum including `'every_run'`)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed file has correct execution_steps in both blocks
    Tool: Bash (grep)
    Steps:
      1. grep -c "ORGANIZE BY ASSIGNED CLEANER" prisma/seed.ts
      2. grep -c "NEVER assign a cleaner to a property outside their zone" prisma/seed.ts
      3. grep -c "NEVER show property codes" prisma/seed.ts
    Expected Result: Each grep returns "2" (once in create block, once in update block)
    Evidence: .sisyphus/evidence/task-1-seed-execution-steps.txt

  Scenario: Seed file has correct input_schema array format in both blocks
    Tool: Bash (grep)
    Steps:
      1. grep -c "key: 'date'" prisma/seed.ts — should find 2 occurrences
      2. grep -c "frequency: 'every_run'" prisma/seed.ts — should find 2 occurrences
      3. grep -c "type: 'date'" prisma/seed.ts — should find 2+ occurrences (also used elsewhere)
      4. Verify the old format is gone: grep -c "scope: 'every_run'" prisma/seed.ts — should return "0"
    Expected Result: key/frequency each return 2; scope returns 0
    Evidence: .sisyphus/evidence/task-1-seed-input-schema.txt

  Scenario: Seed file has updated identity mentioning cleaning team
    Tool: Bash (grep)
    Steps:
      1. grep -c "organize by person" prisma/seed.ts — should return 2
      2. grep -c "never send a cleaner across cities" prisma/seed.ts — should return 2
    Expected Result: Both return 2
    Evidence: .sisyphus/evidence/task-1-seed-identity.txt
  ```

  **Commit**: YES
  - Message: `fix(cleaning-schedule): improve output format and fix input_schema`
  - Files: `prisma/seed.ts`

---

- [x] 2. Backup archetype and apply changes to live DB

  **What to do**:
  - Back up the current archetype row before making changes:
    ```bash
    PGPASSWORD=postgres pg_dump -h localhost -p 54322 -U postgres -d ai_employee \
      -t archetypes --data-only --inserts \
      --where="id = '00000000-0000-0000-0000-000000000019'" \
      > /tmp/cleaning-schedule-archetype-backup.sql
    ```
  - Read the NEW `execution_steps` and `identity` values from the just-committed `prisma/seed.ts` file
  - Apply SQL UPDATE to the live DB with the new `execution_steps`, `identity`, and `input_schema`:
    ```sql
    UPDATE archetypes
    SET
      identity = '<new identity string from seed.ts>',
      execution_steps = '<new execution_steps string from seed.ts>',
      input_schema = '[{"key":"date","label":"Checkout Date","type":"date","frequency":"every_run","required":true,"description":"Target checkout date (e.g. 2026-05-30)"}]'::jsonb
    WHERE id = '00000000-0000-0000-0000-000000000019';
    ```
  - IMPORTANT: The `execution_steps` and `identity` values must be copied EXACTLY from the seed file committed in Task 1. Do NOT retype them — read from the file to avoid drift.

  **Must NOT do**:
  - Do not run `prisma db seed` (would reseed entire DB)
  - Do not change any field other than `identity`, `execution_steps`, `input_schema`
  - Do not modify any source code files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: SQL backup + update, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3518-3682` — Source of truth for the new field values (committed in Task 1)
  - `AGENTS.md` § Database Backup — Backup procedure and conventions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Backup file exists and contains the old archetype
    Tool: Bash
    Steps:
      1. ls -la /tmp/cleaning-schedule-archetype-backup.sql
      2. grep -c "00000000-0000-0000-0000-000000000019" /tmp/cleaning-schedule-archetype-backup.sql
    Expected Result: File exists and contains the archetype ID
    Evidence: .sisyphus/evidence/task-2-backup-verified.txt

  Scenario: DB has updated execution_steps
    Tool: Bash (psql)
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" | grep -c "ORGANIZE BY ASSIGNED CLEANER"
    Expected Result: Returns "1"
    Evidence: .sisyphus/evidence/task-2-db-execution-steps.txt

  Scenario: DB has updated identity
    Tool: Bash (psql)
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT identity FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" | grep -c "organize by person"
    Expected Result: Returns "1"
    Evidence: .sisyphus/evidence/task-2-db-identity.txt

  Scenario: DB has correct input_schema array format
    Tool: Bash (psql)
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT jsonb_typeof(input_schema) FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
    Expected Result: Returns "array" (not "object")
    Evidence: .sisyphus/evidence/task-2-db-input-schema.txt

  ```

  **Commit**: NO (no source code changes)

---

- [x] 3. Trigger employee and verify output format

  **What to do**:
  - Ensure services are running: `curl -s http://localhost:7700/health`
  - Ensure model is set to a reliable model for testing:
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
    ```
    If not `deepseek/deepseek-v4-flash`, update it:
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE id = '00000000-0000-0000-0000-000000000019';"
    ```
  - Trigger the employee with a date that has real VLRE checkouts:
    ```bash
    source .env
    curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"inputs":{"date":"2026-05-30"}}' | jq '{task_id: .task_id}'
    ```
  - Monitor task until completion (poll every 30s):
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
    ```
  - Once task reaches `Done`, retrieve the Slack message from channel `C0B71QSMZKQ` and verify format
  - If the task fails or output doesn't meet criteria, check the harness log: `grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30`

  **Must NOT do**:
  - Do not modify any source code
  - Do not change the archetype fields (already applied in Task 2)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires triggering an E2E task, monitoring completion, retrieving Slack messages, and verifying multiple format criteria
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `docs/employees/cleaning-schedule.md:16-22` — Trigger command
  - `docs/employees/cleaning-schedule.md:79-98` — E2E testing procedure
  - `AGENTS.md` § Task Debugging Quick Reference — How to check task status and container logs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Task reaches Done
    Tool: Bash (psql)
    Steps:
      1. Trigger the employee with date 2026-05-30
      2. Poll task status every 30s for up to 5 minutes
      3. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
    Expected Result: status = "Done"
    Failure Indicators: status = "Failed" or still "Executing" after 5 min
    Evidence: .sisyphus/evidence/task-3-task-status.txt

  Scenario: Slack message is grouped by cleaner name (not by property)
    Tool: Bash (curl — Slack API)
    Steps:
      1. Retrieve the posted message from channel C0B71QSMZKQ using Slack API
      2. Verify message contains "👤 *" pattern (person headers)
      3. Verify message does NOT have numbered property list (1., 2., 3. pattern)
    Expected Result: Message has person-grouped sections with 👤 headers
    Evidence: .sisyphus/evidence/task-3-person-grouped.txt

  Scenario: No property codes in output
    Tool: Bash (grep)
    Steps:
      1. Extract Slack message text
      2. Check for property code pattern: grep -cE '[0-9]+-[A-Z]+-[A-Z]+' — should return 0
      3. Check for "UNASSIGNED" — should return 0
    Expected Result: Zero matches for property codes and UNASSIGNED
    Evidence: .sisyphus/evidence/task-3-no-codes.txt

  Scenario: No lock codes, no "sin basura"
    Tool: Bash (grep)
    Steps:
      1. Extract Slack message text
      2. grep -ic "código" — should return 0 (no door code references)
      3. grep -ic "sin basura" — should return 0
    Expected Result: Zero matches
    Evidence: .sisyphus/evidence/task-3-no-noise.txt

  Scenario: Message has cost summary section
    Tool: Bash (grep)
    Steps:
      1. Extract Slack message text
      2. grep -c "Resumen" — should return 1
      3. grep -c "Total:" — should return 1
      4. grep -cE '\$[0-9]+' — should return 1+ (dollar amounts in summary)
    Expected Result: Summary section present with cost totals
    Evidence: .sisyphus/evidence/task-3-cost-summary.txt

  Scenario: No cleaner assigned to properties in multiple cities
    Tool: Bash (manual inspection)
    Steps:
      1. Extract Slack message text
      2. For each 👤 section, verify all property addresses are in the same city/metro area
      3. Specifically: no section should contain both "Austin" and "San Antonio"
    Expected Result: Each cleaner's properties are all in the same geographic area
    Evidence: .sisyphus/evidence/task-3-geographic-check.txt
  ```

  **Commit**: NO (no source code changes)

---

- [x] 4. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ cleaning-schedule-output-format complete — Output now grouped by cleaner with geographic assignment. Come back to review."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: Task 3

  **Acceptance Criteria**:

  ```
  Scenario: Telegram sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "✅ cleaning-schedule-output-format complete — Output now grouped by cleaner with geographic assignment. Come back to review."
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-4-telegram.txt
  ```

  **Commit**: NO

---

## Commit Strategy

| Task | Message                                                              | Files            |
| ---- | -------------------------------------------------------------------- | ---------------- |
| 1    | `fix(cleaning-schedule): improve output format and fix input_schema` | `prisma/seed.ts` |

---

## Success Criteria

### Verification Commands

```bash
# Task reached Done
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Done

# input_schema is array type
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT jsonb_typeof(input_schema) FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
# Expected: array

# execution_steps contains new format rules
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" | grep -c "ORGANIZE BY ASSIGNED CLEANER"
# Expected: 1
```

### Final Checklist

- [ ] Slack message grouped by cleaner name
- [ ] Real addresses, no property codes
- [ ] No lock codes, no "UNASSIGNED", no "sin basura"
- [ ] Geographic proximity respected (no cross-city assignments)
- [ ] Cost summary per cleaner at bottom
- [ ] Seed file input_schema in correct array format
- [ ] Task reaches Done
