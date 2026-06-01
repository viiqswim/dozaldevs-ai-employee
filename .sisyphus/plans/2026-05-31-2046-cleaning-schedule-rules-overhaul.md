# Cleaning Schedule — Full Rules Overhaul

## TL;DR

> **Quick Summary**: Rewrite the cleaning-schedule employee's `execution_steps` to remove all billing/cost logic, remove the hardcoded team roster (Notion is single source of truth), add a robust NEGATIVE CHECK for checkout filtering, add ZIP-to-city override, and fix the same-day turnover display format. Also update the Notion `manual-personal.json` fixture to remove billing rules.
>
> **Deliverables**:
>
> - Rewritten `execution_steps` in `prisma/seed.ts` (both CREATE and UPDATE blocks)
> - Updated `identity` field (remove financial references)
> - Updated `manual-personal.json` fixture (remove billing rules)
> - Updated DB via seed script
> - Verified schedule output on a test run
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → F1-F4 → user okay

---

## Context

### Original Request

The user discovered three issues with the cleaning-schedule employee output: (1) costs appearing in the cleaner section, (2) duplicate unit names for multi-unit properties, (3) outdated team roster. After three test runs revealed deeper systemic problems (wrong date usage, extra non-checkout properties, Yessica skipped), the scope pivoted to a **complete execution_steps rewrite** based on a comprehensive rules analysis.

### Interview Summary

**Key Discussions**:

- **Billing/costs**: Remove ALL cost/billing logic — no Reporte Financiero, no rates, no `$` in output
- **Team roster**: Notion Manual de Personal is the single source of truth — remove hardcoded roster from execution_steps
- **Sibling Units Audit**: Remove — `get-properties` already returns all 45 listings, model checks each
- **Same-day turnover display**: Show BOTH outgoing type AND what we're preparing for
- **Checkout filtering**: Add explicit NEGATIVE CHECK to prevent active reservations from being included
- **ZIP override**: Add ZIP-to-city override table (78640→Kyle, 78744→Austin, etc.)

**Research Findings**:

- STR industry standard is checkout-based scheduling (Turno, Guesty, Breezeway patterns)
- `get-property.ts` DOES return ZIP code (line 19: `zipCode?: string`) — ZIP override table is viable
- `get-reservations.ts` `--from/--to` filters by CHECK-IN date, not checkout — broad range required
- Three test runs revealed: wrong date bug (fixed), extra checkouts (active reservations), Yessica skipped (weekend vs weekday confusion)

### Metis Review

**Identified Gaps** (all resolved):

- `get-property.ts` ZIP code: confirmed available — ZIP-to-city override works
- `manual-personal.json` billing rules: "Regla de Cobro" block at lines 286-308 must be removed
- Diana weekend role: no conflict — fixture says "todos los días de la semana"
- June 1 is Sunday: will test on a weekday (June 2) or let user pick date
- Hardcoded roster removal risk: mitigated by keeping fixture well-structured
- Live Notion page update: ops team responsibility — out of scope for this plan
- Model choice: note recommendation for `deepseek/deepseek-v4-flash` but don't change without user approval

---

## Work Objectives

### Core Objective

Produce a cleaning-schedule AI employee that generates correct, copy-paste-ready Slack cleaning schedules with ONLY actual checkout properties, correct cleaner assignments per Notion roster, no cost/billing information, and proper unit identifiers and city names.

### Concrete Deliverables

- Rewritten `execution_steps` in `prisma/seed.ts` lines 3525-3706 (CREATE) and 3746-3927 (UPDATE)
- Updated `identity` field (remove "Notion financial report" and billing references)
- Updated `manual-personal.json` fixture (remove "Regla de Cobro" billing rule)
- DB updated via seed or direct SQL
- Verified Slack output from a test trigger

### Definition of Done

- [ ] `execution_steps` contains NO references to: Reporte Financiero, costs, rates, `$`, billing, "Golden Rule", HARD RATE RULE
- [ ] `execution_steps` contains ZIP-to-city override table
- [ ] `execution_steps` contains explicit NEGATIVE CHECK for checkout filtering
- [ ] `execution_steps` does NOT contain hardcoded team roster (references Notion instead)
- [ ] `manual-personal.json` does NOT contain "Regla de Cobro" block
- [ ] Test trigger produces a schedule with ONLY actual checkout properties
- [ ] Resumen section shows property count + minutes only (no dollar amounts)

### Must Have

- Explicit `printenv INPUT_DATE` instruction (prevents wrong-date bug)
- NEGATIVE CHECK section explaining what does NOT need cleaning
- ZIP-to-city override table (78640→Kyle, 78744→Austin, 78203→San Antonio, 78109→Converse, 80421→Bailey)
- Room/unit identification rules (letter-prefix → Unidad, -HOME → Casa, -1/-2 → Habitación)
- One-shot Slack post + submit-output pattern (no revisions)
- Self-check step where model states list A aloud

### Must NOT Have (Guardrails)

- No dollar amounts anywhere in execution_steps or output format
- No Reporte Financiero Notion page read
- No CHECK-IN BILLING RULE or "Golden Rule" logic
- No HARD RATE RULE for Nutria Run
- No SIBLING UNITS AUDIT (redundant — all properties already checked)
- No hardcoded team roster in execution_steps (Notion is source of truth)
- No "CHECK-IN" or "CHECK-OUT" labels in cleaner-facing output
- No property codes or lock/door codes in output
- No `$` symbol in per-property lines OR Resumen

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None — user decided to skip unit tests
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB verification**: Use Bash (psql) — query DB, assert field values
- **Fixture verification**: Use Bash (grep/jq) — search for forbidden strings
- **E2E verification**: Use Bash (curl + psql + docker logs) — trigger task, monitor, verify Slack output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — code changes, MAX PARALLEL):
├── Task 1: Rewrite execution_steps + identity in seed.ts [deep]
├── Task 2: Update manual-personal.json fixture (remove billing rules) [quick]

Wave 2 (After Wave 1 — DB update + verification):
├── Task 3: Update DB with new execution_steps [quick]
├── Task 4: Trigger test run and verify output [deep]

Wave 3 (After Wave 2 — commit + notify):
├── Task 5: Commit all changes [quick]
├── Task 6: Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 3, 4   | 1     |
| 2     | —          | 3, 4   | 1     |
| 3     | 1, 2       | 4      | 2     |
| 4     | 3          | 5      | 2     |
| 5     | 4          | 6      | 3     |
| 6     | 5          | F1-F4  | 3     |
| F1-F4 | 6          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `deep`, T2 → `quick`
- **Wave 2**: 2 tasks — T3 → `quick`, T4 → `deep`
- **Wave 3**: 2 tasks — T5 → `quick`, T6 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Rewrite execution_steps and identity in seed.ts

  **What to do**:
  - Open `prisma/seed.ts` and locate the cleaning-schedule archetype (id: `00000000-0000-0000-0000-000000000019`)
  - **CRITICAL**: There are TWO identical blocks — CREATE (starts ~line 3525) and UPDATE (starts ~line 3746). BOTH must be rewritten with IDENTICAL content.
  - Replace the `identity` field (both CREATE and UPDATE) to remove references to "Notion financial report" and "CHECK-IN and CHECK-OUT context". New identity:
    ```
    You are a Cleaning Schedule Coordinator for VLRE vacation rental properties. Your job is to generate a daily cleaning schedule by cross-referencing Hostfully reservation data (checkouts), Notion property directory, and Notion staff manual. You read Notion content in Spanish. Your output goes directly to the cleaning team — organize by person, use real addresses, and keep it scannable on a phone screen. Geographic efficiency matters: never send a cleaner across cities.
    ```
  - Replace the entire `execution_steps` template literal with the approved rules from `.sisyphus/drafts/2026-05-31-1952-cleaning-schedule-rules-overhaul.md`. The new execution_steps has 5 steps:
    - STEP 1: Read target date (`printenv INPUT_DATE`), fetch all properties, fetch reservations per property, build CLEANING LIST with checkout date filter + NEGATIVE CHECK + self-check
    - STEP 2: Get property details via `get-property.ts`, apply ZIP-to-city override table (78640→Kyle, 78744→Austin, 78203→San Antonio, 78109→Converse, 80421→Bailey), derive room/unit IDs from listing name suffixes
    - STEP 3: Read Notion pages (Manual de Personal + Directorio Operativo — NO Reporte Financiero), assign cleaners per Notion rules, route priority, trash duties, travel overhead
    - STEP 4: Build Slack message — organized by cleaner, real addresses, no costs, Resumen with count+minutes only (no `$`)
    - STEP 5: One-shot post to Slack + submit-output (atomic, irreversible)
    - IMPORTANT NOTES section at the end
  - REMOVED from execution_steps (verify these are NOT present):
    - CHECK-IN BILLING RULE and all 8+ sub-rules
    - HARD RATE RULE for Nutria Run
    - SIBLING UNITS AUDIT section
    - COST DISPLAY RULE
    - List B (CHECK-INS)
    - Reporte Financiero read command (`tsx /tools/notion/get-page.ts --page-id 370d540b438080ca8676e61856488960 --fixture reporte-financiero`)
    - Any `$` symbol in output format
    - Hardcoded TEAM ASSIGNMENT BY ZIP section (now reads from Notion)
    - "Golden Rule" references
  - ADDED to execution_steps (verify these ARE present):
    - `printenv INPUT_DATE` instruction
    - NEGATIVE CHECK section (active reservations, spanning reservations, check-in-only)
    - ZIP-TO-CITY OVERRIDE table
    - Reference to Notion Manual de Personal as source of truth for team assignments
    - Resumen format: `[Cleaner]: [N] propiedades — [TotalMin] min` (no `$`)
  - Remove `/tools/notion/get-page.ts` for Reporte Financiero from the flow (but keep it in `tool_registry` — removing from registry requires schema changes)
  - After editing, verify CREATE and UPDATE blocks are character-for-character identical by comparing them

  **Must NOT do**:
  - Do NOT change `tool_registry`, `trigger_sources`, `risk_model`, `notification_channel`, or any non-content archetype fields
  - Do NOT modify any other archetype in seed.ts
  - Do NOT add unit tests
  - Do NOT hardcode a team roster in execution_steps — reference Notion instead
  - Do NOT include any `$` symbol in the output format template

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This is the core task — rewriting a 180-line template literal with precise content requirements, multiple forbidden patterns, and dual-block synchronization. Requires careful attention to detail and cross-referencing the approved draft.
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers archetype schema fields, seed data patterns, and the execution_steps/identity structure
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not modifying any shell tools
    - `hostfully-api`: Not changing API integration code

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `prisma/seed.ts:3520-3706` — Current CREATE block for cleaning-schedule archetype. This is the block to replace. Note: the execution_steps starts at line 3525 and ends at line 3706 with the closing backtick.
  - `prisma/seed.ts:3741-3927` — Current UPDATE block. Must be character-identical to CREATE block after edit.

  **Content References** (source of truth for new content):
  - `.sisyphus/drafts/2026-05-31-1952-cleaning-schedule-rules-overhaul.md` — The APPROVED rules overhaul. Contains the exact execution_steps text to use, section by section (STEP 1 through STEP 5 + IMPORTANT NOTES). Copy the content from the code blocks in this draft.

  **API/Type References**:
  - `src/worker-tools/hostfully/get-property.ts:17-30` — `formatAddress` shows ZIP code IS returned (line 19: `zipCode?: string`). The ZIP-to-city override table in execution_steps is based on this.
  - `src/worker-tools/hostfully/get-reservations.ts` — `--from/--to` filters by CHECK-IN date. Execution_steps must instruct broad date range.

  **WHY Each Reference Matters**:
  - seed.ts CREATE/UPDATE blocks: You need to find the exact boundaries to replace — the execution_steps starts after `execution_steps: \`` and ends at the closing backtick before `model:`
  - Draft file: Contains the pre-approved text — do NOT freelance new rules, use what's in the draft
  - get-property.ts: Confirms ZIP is available, validating the ZIP override table design

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify no cost/billing references in execution_steps
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. grep -in 'Reporte Financiero\|Golden Rule\|HARD RATE\|CHECK-IN BILLING\|COST DISPLAY\|\\$[0-9]' prisma/seed.ts | grep -i cleaning
      2. Count matches
    Expected Result: 0 matches — no cost/billing references in cleaning-schedule sections
    Failure Indicators: Any match containing dollar signs, rate rules, or financial report references
    Evidence: .sisyphus/evidence/task-1-no-costs.txt

  Scenario: Verify CREATE and UPDATE blocks are identical
    Tool: Bash (diff)
    Preconditions: seed.ts has been edited
    Steps:
      1. Extract execution_steps from CREATE block and save to /tmp/create-steps.txt
      2. Extract execution_steps from UPDATE block and save to /tmp/update-steps.txt
      3. diff /tmp/create-steps.txt /tmp/update-steps.txt
    Expected Result: No diff output — blocks are identical
    Failure Indicators: Any diff output showing differences between CREATE and UPDATE
    Evidence: .sisyphus/evidence/task-1-blocks-match.txt

  Scenario: Verify required patterns present in execution_steps
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. grep -c 'printenv INPUT_DATE' prisma/seed.ts (expect >= 2, one per block)
      2. grep -c 'NEGATIVE CHECK' prisma/seed.ts (expect >= 2)
      3. grep -c '78640.*Kyle' prisma/seed.ts (expect >= 2)
      4. grep -c 'ZIP-TO-CITY OVERRIDE' prisma/seed.ts (expect >= 2)
      5. grep -c 'Manual de Personal' prisma/seed.ts (expect >= 2)
    Expected Result: All counts >= 2 (present in both CREATE and UPDATE blocks)
    Failure Indicators: Any count < 2
    Evidence: .sisyphus/evidence/task-1-required-patterns.txt

  Scenario: Verify identity field updated (no financial references)
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. grep -A1 "id: '00000000-0000-0000-0000-000000000019'" prisma/seed.ts | head -5
      2. grep -c 'financial report' prisma/seed.ts (in cleaning-schedule context)
    Expected Result: identity does NOT mention "financial report" or "check-ins and check-outs"
    Failure Indicators: "financial report" or "CHECK-IN and CHECK-OUT context" found in identity
    Evidence: .sisyphus/evidence/task-1-identity-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-no-costs.txt — grep output confirming no cost references
  - [ ] task-1-blocks-match.txt — diff output confirming CREATE=UPDATE
  - [ ] task-1-required-patterns.txt — grep counts for required patterns
  - [ ] task-1-identity-check.txt — identity field verification

  **Commit**: NO (groups with Task 5)

- [x] 2. Update manual-personal.json fixture — remove billing rules

  **What to do**:
  - Open `src/worker-tools/notion/fixtures/get-page/manual-personal.json`
  - Remove the "Regla de Cobro (Check-In)" numbered list item block (the block at id `370d540b-4380-8048-b1a9-efd21cd734f4`, lines ~286-308 in the current file)
  - This is the block with `numbered_list_item` type containing text starting with "Regla de Cobro (Check-In): El costo y tiempo de limpieza..."
  - Keep ALL other blocks: team directory, travel overhead, equitable distribution, trash rules
  - Verify the resulting JSON is valid (no trailing commas, correct array structure)

  **Must NOT do**:
  - Do NOT remove the "Tiempos Extra por Traslado" rule (travel overhead — still needed)
  - Do NOT remove the "Distribución Equitativa" rule (still needed)
  - Do NOT remove the "Reglas de Basura" section (still needed)
  - Do NOT modify team roster entries (Yessica, Diana, Berenice/Susana, Zenaida, Mary/Carrie)
  - Do NOT change any block IDs or structure outside the billing rule block

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single JSON file, single block removal. Clear target (one numbered_list_item block).
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `hostfully-api`: Not relevant — this is a Notion fixture, not Hostfully

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/notion/fixtures/get-page/manual-personal.json:286-308` — The "Regla de Cobro" block to remove. It's a `numbered_list_item` with id `370d540b-4380-8048-b1a9-efd21cd734f4`.

  **WHY Each Reference Matters**:
  - The specific block ID and line range tell you exactly which JSON object to remove from the `results` array

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify billing rule removed from fixture
    Tool: Bash (grep + jq)
    Preconditions: manual-personal.json has been edited
    Steps:
      1. grep -c 'Regla de Cobro' src/worker-tools/notion/fixtures/get-page/manual-personal.json
      2. grep -c 'costo y tiempo de limpieza' src/worker-tools/notion/fixtures/get-page/manual-personal.json
    Expected Result: Both counts = 0
    Failure Indicators: Any count > 0
    Evidence: .sisyphus/evidence/task-2-billing-removed.txt

  Scenario: Verify JSON is valid after edit
    Tool: Bash (jq)
    Preconditions: manual-personal.json has been edited
    Steps:
      1. cat src/worker-tools/notion/fixtures/get-page/manual-personal.json | jq . > /dev/null
      2. Echo exit code
    Expected Result: Exit code 0 (valid JSON)
    Failure Indicators: jq parse error
    Evidence: .sisyphus/evidence/task-2-json-valid.txt

  Scenario: Verify other rules preserved
    Tool: Bash (grep)
    Preconditions: manual-personal.json has been edited
    Steps:
      1. grep -c 'Tiempos Extra por Traslado' src/worker-tools/notion/fixtures/get-page/manual-personal.json (expect 1)
      2. grep -c 'Distribución Equitativa' src/worker-tools/notion/fixtures/get-page/manual-personal.json (expect 1)
      3. grep -c 'Reglas de Basura' src/worker-tools/notion/fixtures/get-page/manual-personal.json (expect 1)
      4. grep -c 'Yessica' src/worker-tools/notion/fixtures/get-page/manual-personal.json (expect >= 1)
      5. grep -c 'Diana' src/worker-tools/notion/fixtures/get-page/manual-personal.json (expect >= 1)
    Expected Result: All counts >= 1 — other rules and team roster preserved
    Failure Indicators: Any count = 0
    Evidence: .sisyphus/evidence/task-2-rules-preserved.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-billing-removed.txt
  - [ ] task-2-json-valid.txt
  - [ ] task-2-rules-preserved.txt

  **Commit**: NO (groups with Task 5)

- [x] 3. Update DB with new execution_steps

  **What to do**:
  - Run `pnpm prisma db seed` to apply the updated seed data to the database
  - OR use a targeted SQL UPDATE if seed would overwrite other archetype data — check with the user or use the seed approach since it's the standard path
  - After update, verify the DB contains the new execution_steps by querying:
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT length(execution_steps), execution_steps LIKE '%NEGATIVE CHECK%' as has_negative_check, execution_steps LIKE '%Reporte Financiero%' as has_financial FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
    ```
  - NOTE: Before running seed, take a DB backup per AGENTS.md Database Backup protocol

  **Must NOT do**:
  - Do NOT skip the DB backup before seeding
  - Do NOT modify any archetype other than cleaning-schedule
  - Do NOT use `docker compose down -v` or any destructive DB operation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution (seed) + verification query. Straightforward DB operation.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Database Backup" — Mandatory backup protocol before any seed operation
  - `prisma/seed.ts` — The file that was just modified in Tasks 1-2

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify DB execution_steps updated correctly
    Tool: Bash (psql)
    Preconditions: Seed has been run
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps LIKE '%NEGATIVE CHECK%' FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
      2. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps LIKE '%Reporte Financiero%' FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
      3. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps LIKE '%ZIP-TO-CITY OVERRIDE%' FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
    Expected Result: (1) true, (2) false, (3) true
    Failure Indicators: (1) false or (2) true — means old execution_steps still in DB
    Evidence: .sisyphus/evidence/task-3-db-verification.txt

  Scenario: Verify identity field updated in DB
    Tool: Bash (psql)
    Preconditions: Seed has been run
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT identity FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
    Expected Result: identity does NOT contain "financial report"
    Failure Indicators: "financial report" found in identity
    Evidence: .sisyphus/evidence/task-3-identity-db.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-db-verification.txt
  - [ ] task-3-identity-db.txt

  **Commit**: NO (groups with Task 5)

- [ ] 4. Trigger test run and verify output

  **What to do**:
  - Ensure `pnpm dev` is running (gateway + Inngest)
  - Ensure the Docker worker image is rebuilt: `docker build -t ai-employee-worker:latest .`
  - Trigger the cleaning-schedule employee for a test date. Use a DATE that the user can verify against known checkouts. Ask the user what date to use, or default to tomorrow's date:
    ```bash
    source .env
    curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"inputs":{"date":"<TARGET_DATE>"}}' | jq '{task_id: .task_id}'
    ```
  - Monitor task execution:
    ```bash
    TASK_ID=<task_id>
    # Poll status every 30s
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
    ```
  - Once task reaches `Done` or `Failed`, retrieve the Slack output:
    ```bash
    # Get the Slack message
    source .env
    CHANNEL=C0B71QSMZKQ
    NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')
    curl -s "https://slack.com/api/conversations.replies" \
      -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
      -d "channel=$CHANNEL&ts=$NOTIFY_TS&limit=20" \
      | jq '[.messages[] | {ts: .ts, text: (.text | .[0:2000])}]'
    ```
  - Verify the output:
    - No `$` symbols anywhere
    - No "Reporte Financiero" references
    - Correct date in header (matches INPUT_DATE, not today)
    - ONLY actual checkout properties (no active reservations)
    - Resumen shows count + minutes only
    - Correct unit identifiers (Unidad A/B, Habitación N, Casa)

  **Must NOT do**:
  - Do NOT trigger without first rebuilding the Docker image
  - Do NOT use a date that's in the past (API may not return reservations)
  - Do NOT post to Slack manually — let the employee do it

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: E2E verification requiring multiple tools (curl, psql, docker, Slack API), long-running task monitoring, and detailed output analysis.
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: Useful for task state diagnostics if the task gets stuck

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — after Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Task Debugging Quick Reference" — Commands for monitoring task state
  - `AGENTS.md` § "Long-Running Commands" — Use tmux for Docker build and trigger
  - `.sisyphus/evidence/task-3-retry-output.txt` — Previous test run output (Run 2) for comparison

  **External References**:
  - Slack API `conversations.replies`: Used to retrieve the posted schedule message

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify schedule output has no cost references
    Tool: Bash (curl + grep)
    Preconditions: Task has completed and Slack message is posted
    Steps:
      1. Retrieve Slack message via conversations.replies API
      2. grep -c '\\$' in the message text
      3. grep -ic 'reporte financiero' in the message text
    Expected Result: Both counts = 0
    Failure Indicators: Any dollar sign or financial report reference in output
    Evidence: .sisyphus/evidence/task-4-no-costs-output.txt

  Scenario: Verify correct date in schedule header
    Tool: Bash (curl + grep)
    Preconditions: Task has completed
    Steps:
      1. Retrieve Slack message
      2. Check that the date in "Limpieza — [DíaDeLaSemana] [Día] de [Mes]" matches the INPUT_DATE
    Expected Result: Date matches INPUT_DATE, NOT today's date
    Failure Indicators: Date in header differs from INPUT_DATE
    Evidence: .sisyphus/evidence/task-4-correct-date.txt

  Scenario: Verify Resumen format (no costs)
    Tool: Bash (curl + grep)
    Preconditions: Task has completed
    Steps:
      1. Retrieve Slack message
      2. Find the "Resumen" section
      3. Verify format is "[Cleaner]: [N] propiedades — [N] min" with NO dollar amounts
    Expected Result: Resumen has property counts and minutes only, zero dollar signs
    Failure Indicators: Dollar signs in Resumen section
    Evidence: .sisyphus/evidence/task-4-resumen-format.txt

  Scenario: Verify task reaches terminal state
    Tool: Bash (psql)
    Preconditions: Task has been triggered
    Steps:
      1. Poll task status every 30s for up to 10 minutes
      2. Check final status
    Expected Result: Task status = "Done" (or "Failed" with delivery_instructions=NULL which is acceptable)
    Failure Indicators: Task stuck in Executing for > 10 minutes
    Evidence: .sisyphus/evidence/task-4-task-status.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-no-costs-output.txt — Slack message text with cost grep
  - [ ] task-4-correct-date.txt — Date verification
  - [ ] task-4-resumen-format.txt — Resumen section analysis
  - [ ] task-4-task-status.txt — Task lifecycle trace

  **Commit**: NO (groups with Task 5)

- [x] 5. Commit all changes

  **What to do**:
  - Stage all modified files:
    - `prisma/seed.ts`
    - `src/worker-tools/notion/fixtures/get-page/manual-personal.json`
  - Create a single commit:
    ```
    fix(cleaning-schedule): rewrite execution_steps — remove billing, use Notion roster, add checkout filter
    ```
  - Verify `git status` is clean after commit (no orphaned files)

  **Must NOT do**:
  - Do NOT use `--no-verify`
  - Do NOT add `Co-authored-by` lines
  - Do NOT reference AI tools in the commit message
  - Do NOT commit evidence files or plan files in this commit

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single git commit operation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **References**:
  - `AGENTS.md` § "Git Commit Rules" — No `--no-verify`, no `Co-authored-by`, no AI references

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify commit created successfully
    Tool: Bash (git)
    Steps:
      1. git log -1 --oneline
      2. Verify message matches expected pattern
      3. git status --short (should be empty or only untracked plan files)
    Expected Result: Commit exists with correct message, working tree clean
    Evidence: .sisyphus/evidence/task-5-commit.txt
  ```

  **Commit**: YES
  - Message: `fix(cleaning-schedule): rewrite execution_steps — remove billing, use Notion roster, add checkout filter`
  - Files: `prisma/seed.ts`, `src/worker-tools/notion/fixtures/get-page/manual-personal.json`

- [x] 6. Send Telegram notification

  **What to do**:
  - Send completion notification:
    ```bash
    tsx scripts/telegram-notify.ts "✅ cleaning-schedule-rules-overhaul complete — All tasks done. Come back to review results."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify Telegram notification sent
    Tool: Bash (tsx)
    Steps:
      1. Run tsx scripts/telegram-notify.ts "✅ cleaning-schedule-rules-overhaul complete — All tasks done. Come back to review results."
      2. Check exit code
    Expected Result: Exit code 0, notification sent
    Evidence: .sisyphus/evidence/task-6-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for patterns). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` and `pnpm lint`. Review seed.ts changes for: template literal escaping issues, mismatched CREATE/UPDATE blocks, correct line references. Check that `manual-personal.json` is valid JSON. Verify no AI slop (excessive comments, over-abstraction).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | JSON [VALID/INVALID] | Blocks Match [YES/NO] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Verify the Slack output from the test trigger (Task 4). Check: no `$` symbols anywhere, no "Reporte Financiero" references, correct unit identifiers, correct city names per ZIP, correct cleaner assignments per Notion fixture, Resumen shows only count + minutes. Save screenshots/output to `.sisyphus/evidence/final-qa/`.
      Output: `Output Format [PASS/FAIL] | No Costs [PASS/FAIL] | Cleaner Assignment [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", verify actual changes match spec. Verify CREATE and UPDATE blocks are identical in seed.ts. Verify `manual-personal.json` has no billing rules. Verify DB `execution_steps` matches seed.ts. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | CREATE=UPDATE [YES/NO] | DB=Seed [YES/NO] | VERDICT`

---

## Commit Strategy

- **1**: `fix(cleaning-schedule): rewrite execution_steps — remove billing, use Notion roster, add checkout filter` — `prisma/seed.ts`, `src/worker-tools/notion/fixtures/get-page/manual-personal.json`

---

## Success Criteria

### Verification Commands

```bash
# Verify no cost references in execution_steps
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" \
  | grep -ic '\$\|reporte financiero\|golden rule\|hard rate'
# Expected: 0

# Verify fixture has no billing rules
grep -ic 'Regla de Cobro' src/worker-tools/notion/fixtures/get-page/manual-personal.json
# Expected: 0

# Verify execution_steps has ZIP override
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" \
  | grep -c '78640'
# Expected: >= 1
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Test trigger produces correct schedule
- [ ] CREATE and UPDATE blocks identical in seed.ts
- [ ] DB matches seed.ts
- [ ] Fixture is valid JSON with no billing rules
