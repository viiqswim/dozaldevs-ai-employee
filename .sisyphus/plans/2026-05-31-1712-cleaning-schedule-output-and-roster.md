# Cleaning Schedule: Output Format Fix & Team Roster Update

## TL;DR

> **Quick Summary**: Fix three issues in the cleaning-schedule AI employee: (1) remove costs from cleaner section (keep in summary only), (2) distinguish multi-unit properties by showing "Unidad A/B/C" instead of duplicate "Casa" entries, (3) update the full cleaner team roster to remove departed staff and restructure zone assignments. Verify on June 1, 2026 against 7 expected checkouts.
>
> **Deliverables**:
>
> - Updated `execution_steps` in DB archetype + `prisma/seed.ts` (output format, unit ID, team roster)
> - Updated Notion fixture `src/worker-tools/notion/fixtures/get-page/manual-personal.json`
> - Verified Slack output for June 1 with correct format, units, and cleaner assignments
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — sequential (update → trigger → verify → iterate)
> **Critical Path**: Task 1 → Task 2 → (conditional) Task 3 → Task 4 → Task 5

---

## Context

### Original Request

User identified three issues in the cleaning-schedule employee output from Run 11 (May 31):

1. Costs (`$120`, `$30`, etc.) appear in each property line — the cleaning team shouldn't see costs. The cleaner section should be copy-paste ready. Costs belong in the summary section only.
2. Multi-unit properties like 4403 Hayride Ln showed two identical lines ("Casa") with no way to distinguish which unit (A vs S). The Hostfully listing names contain the unit letter (4403A-HAY-HOME, 4403S-HAY-HOME) but the model was reading the "-HOME" suffix and outputting "Casa" for both.
3. Angela is no longer with the company. The full team roster needs updating per the ops team.

### Interview Summary

**Key Discussions**:

- Costs: Keep in `📊 Resumen` summary section, remove from per-property cleaner lines
- Unit format confirmed: `4403 Hayride Ln, Austin — 11:00 — Unidad A (90 min)`
- Full team roster changes provided directly by ops team
- Test date: June 1, 2026 (Monday) — 7 expected checkouts provided by user from Hostfully

**Research Findings**:

- Angela referenced in: Notion fixture `manual-personal.json` (line 169), execution_steps in seed.ts (6 references across 2 blocks)
- Diana's old role: "EXCLUSIVE to 271 Gina Dr ONLY" — now changes to "main for all Kyle properties"
- Abi, Rocio, Norma also being removed from San Antonio/Converse zone
- The live Notion page (Manual de Personal) is read by the employee at runtime — needs human update separately

### Metis Review

**Identified Gaps** (addressed):

- Mary/Carrie rotation needs a stateless mechanism → use day-of-month parity (even=Mary, odd=Carrie)
- Diana's Austin backup role needs a max-hours cap → user confirmed "max 7 hours if needed"
- Live Notion page needs manual update by ops team → noted as out of scope, flagged to user
- Saturday Yessica constraint (11AM-3PM) → encode as hard rule in execution_steps

---

## Work Objectives

### Core Objective

Update the cleaning-schedule employee's output format, unit identification logic, and team roster so it produces a correct, copy-paste-ready cleaning schedule with accurate cleaner assignments.

### Concrete Deliverables

- `prisma/seed.ts` — updated execution_steps in both CREATE and UPDATE blocks
- DB archetype `00000000-0000-0000-0000-000000000019` — updated execution_steps
- `src/worker-tools/notion/fixtures/get-page/manual-personal.json` — updated team roster
- Slack message in channel `C0B71QSMZKQ` for June 1 with correct format

### Definition of Done

- [ ] Slack output for June 1 contains all 7 expected checkouts
- [ ] No costs (`$XX`) in cleaner property lines — only in summary
- [ ] Multi-unit properties show distinct identifiers (Unidad A, Unidad B, etc.)
- [ ] Correct cleaner assignments per updated roster (Yessica for Austin weekday, Diana for Kyle)
- [ ] Angela, Abi, Rocio, Norma do NOT appear anywhere in the output

### Must Have

- Costs removed from cleaner section, present in summary only
- Letter-prefix units (4403A, 4403B, 5306A) shown as "Unidad [letter]"
- Full team roster rewrite matching ops team input
- Diana as main for Kyle (no longer exclusive to 271 Gina Dr)
- Zenaida as sole cleaner for San Antonio/Converse

### Must NOT Have (Guardrails)

- Do NOT change the Reporte Financiero fixture or rates logic
- Do NOT change the Hostfully shell tools (get-properties, get-reservations)
- Do NOT change the delivery mechanism or lifecycle behavior
- Do NOT update the live Notion page (human-managed, out of scope)
- Do NOT add new zip codes or properties
- Do NOT change the HARD RATE RULE for 7213 Nutria Run
- Do NOT change the CHECK-IN BILLING RULE logic
- Do NOT change the SIBLING UNITS AUDIT or ATOMIC SINGLE POST rules

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None (user decision: skip — pre-existing failures)
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — trigger employee, check Slack output via API
- **DB verification**: Use Bash (psql) — check task status, execution_steps content

---

## Execution Strategy

### Sequential Execution (4–5 tasks)

```
Task 1: Update execution_steps + Notion fixture [deep]
   ↓
Task 2: Trigger June 1 + verify output [quick]
   ↓
(Conditional) Task 3: Fix issues if output is wrong [deep]
   ↓
Task 4: Commit all changes [quick]
   ↓
Task 5: Notify completion via Telegram [quick]

Critical Path: Task 1 → Task 2 → Task 4 → Task 5
Conditional: Task 3 only if Task 2 fails (output incorrect)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 2      |
| 2    | 1          | 3 or 4 |
| 3    | 2 (fail)   | 4      |
| 4    | 2 or 3     | 5      |
| 5    | 4          | —      |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `deep`
- **Wave 2**: 1 task — T2 → `quick`
- **Wave 3** (conditional): 1 task — T3 → `deep`
- **Wave 4**: 2 tasks — T4 → `quick`, T5 → `quick`

---

## TODOs

- [x] 1. Update execution_steps (output format, unit identification, team roster) + Notion fixture

  **What to do**:

  Three changes to execution_steps (in DB archetype + prisma/seed.ts) and one fixture update:

  **Change A — Remove costs from cleaner section output format:**
  - In the EXACT OUTPUT FORMAT section, change the per-property line template from:
    `• [Dirección], [Ciudad] — [Hora] — [TipoServicio] ([Duración])`
    to confirm it does NOT include `$[Costo]` in each line (it currently doesn't have it in the template, but the actual output does because of how the model formats it).
  - Add an explicit rule: "COST DISPLAY RULE: NEVER show dollar amounts ($XX) in the per-property lines under each cleaner. Costs appear ONLY in the 📊 Resumen section. The cleaner section must be ready for copy-paste to the cleaning team."
  - In the Resumen template, KEEP the per-cleaner cost totals: `[Limpiador]: [N] propiedades — [TotalMin] min — $[Costo]`

  **Change B — Fix unit identification for letter-prefix addresses:**
  - In the ROOM/UNIT IDENTIFICATION section, ADD a new rule for letter-prefix addresses:
    ```
    LETTER-PREFIX UNITS: If the Hostfully listing name starts with an address number that includes a letter (e.g., 4403A-HAY-HOME, 4403B-HAY-HOME, 4403S-HAY-HOME, 4405A-HAY-HOME, 5306A-KIN-Home), that letter is the UNIT IDENTIFIER. Show as "Unidad [letter]" regardless of the -HOME suffix.
    Examples:
    - 4403A-HAY-HOME → "4403 Hayride Ln — Unidad A"
    - 4403B-HAY-HOME → "4403 Hayride Ln — Unidad B"
    - 4403S-HAY-HOME → "4403 Hayride Ln — Unidad S"
    - 5306A-KIN-Home → "5306 King Charles Dr — Unidad A"
    DO NOT show these as "Casa" — "Casa" is only for -HOME listings where the address number has NO letter (e.g., 3420-HOV-HOME → Casa, 6002-PAL-HOME → Casa).
    ```

  **Change C — Rewrite TEAM ASSIGNMENT BY ZIP section:**
  Replace the entire `TEAM ASSIGNMENT BY ZIP (from Manual de Personal):` block and the `SUNDAY RULE:` with:

  ```
  TEAM ASSIGNMENT BY ZIP (from Manual de Personal):
  - ZIP 78640 (Kyle): Diana (primary — all week, all days including weekends). Susana (backup — all week). NO ONE ELSE services Kyle.
  - ZIP 78744 (Austin) — Weekdays (Mon-Fri): Yessica (primary, 7 hours/day, 10AM-5PM). Diana/Berenice/Susana (backups, max 7 hours each if needed).
  - ZIP 78744 (Austin) — Weekends (Sat-Sun): Diana/Berenice/Susana are the PRIMARY cleaners (rotate among them to distribute work fairly). Yessica is BACKUP on weekends. On Saturdays, Yessica works 11AM-3PM only.
  - ZIP 78203 / ZIP 78109 (San Antonio / Converse): Zenaida is the ONLY cleaner. She is both primary and backup. No other cleaners are available for this zone.
  - ZIP 80421 (Bailey, CO): Mary and Carrie — rotate equally. Use day-of-month: if the day number is even, assign to Mary; if odd, assign to Carrie. If both are needed on the same day, split evenly.
  ```

  Also update the BACKUP THRESHOLD rule to reference the correct backup list:
  `- BACKUP THRESHOLD: If Yessica's total work exceeds 7 hours (420 min), route remaining Austin properties to Diana/Berenice/Susana`
  And remove any reference to Angela, Abi, Rocio, or Norma from the entire execution_steps.

  **Change D — Update Notion fixture manual-personal.json:**
  - Replace `"Berenice / Angela / Susana: Equipos de backup..."` with `"Berenice / Susana: Equipos de backup para fines de semana en Austin, o si Yessica excede sus 7 horas diarias. (Susana requiere anticipación). Susana también es backup para Kyle (78640)."` — removing Angela.
  - Update Diana's entry: change from "Exclusiva para la propiedad 271 Gina Dr" to "Equipo principal para todas las propiedades en Kyle (78640), todos los días. También es backup en Austin (78744)."
  - In the San Antonio section, replace `"Abi y Rocio: Lunes a Viernes."` and `"Norma: Fines de semana y backup."` entries — REMOVE both, leaving only Zenaida.
  - In the Bailey CO section, add availability note: `"Mary o Carrie (rotar equitativamente por día)"`.

  **Apply to DB + seed.ts:**
  - Update DB: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "UPDATE archetypes SET execution_steps = '...', updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000019';"`
  - Update prisma/seed.ts: both CREATE block (~line 3556) and UPDATE block (~line 3739)
  - The execution_steps content in DB and seed.ts MUST be identical

  **Must NOT do**:
  - Do NOT change the HARD RATE RULE for 7213 Nutria Run
  - Do NOT change the CHECK-IN BILLING RULE logic (only the team assignments)
  - Do NOT change the SIBLING UNITS AUDIT or ATOMIC SINGLE POST rules
  - Do NOT change the Reporte Financiero fixture
  - Do NOT change Hostfully shell tools
  - Do NOT remove the `ROUTE PRIORITY` rule for 3420 Hovenweep Ave

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple coordinated changes across execution_steps (3 distinct modifications) + fixture update + DB sync + seed.ts sync. Requires careful text manipulation.
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers archetype fields including execution_steps and update patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 1
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3556-3660` — Current execution_steps CREATE block (full content)
  - `prisma/seed.ts:3739-3850` — Current execution_steps UPDATE block (must match CREATE)
  - `src/worker-tools/notion/fixtures/get-page/manual-personal.json:158-183` — Current team assignments section (Austin backup list with Angela)

  **API/Type References**:
  - Archetype ID: `00000000-0000-0000-0000-000000000019`
  - DB connection: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee`

  **WHY Each Reference Matters**:
  - `seed.ts:3556-3660` — Contains the execution_steps text to modify. Has TWO blocks (CREATE and UPDATE) that MUST stay in sync.
  - `manual-personal.json:158-183` — The fixture block that needs Angela removed and Diana's role changed. The model reads this at runtime.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: execution_steps updated correctly in DB
    Tool: Bash (psql)
    Preconditions: DB accessible at localhost:54322
    Steps:
      1. Extract execution_steps: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
      2. Assert "Angela" does NOT appear anywhere
      3. Assert "Abi" and "Rocio" and "Norma" do NOT appear anywhere
      4. Assert "Diana (primary — all week" appears in ZIP 78640 section
      5. Assert "COST DISPLAY RULE" or equivalent cost-prohibition text appears
      6. Assert "LETTER-PREFIX UNITS" or "Unidad [letter]" rule appears
      7. Assert "Zenaida is the ONLY cleaner" appears for San Antonio/Converse
    Expected Result: All assertions pass
    Evidence: .sisyphus/evidence/task-1-execution-steps-check.txt

  Scenario: seed.ts matches DB
    Tool: Bash (diff)
    Steps:
      1. Extract execution_steps from DB to /tmp/steps-db.txt
      2. Extract execution_steps from seed.ts CREATE block
      3. Compare — they must match
    Expected Result: DB and seed.ts CREATE block are identical
    Evidence: .sisyphus/evidence/task-1-seed-sync.txt

  Scenario: Notion fixture updated correctly
    Tool: Read
    Steps:
      1. Read manual-personal.json
      2. Assert "Angela" does NOT appear
      3. Assert "Abi" and "Rocio" and "Norma" do NOT appear
      4. Assert Diana entry says "principal para todas las propiedades en Kyle" or similar
    Expected Result: Fixture reflects new team roster
    Evidence: .sisyphus/evidence/task-1-fixture-check.txt
  ```

  **Commit**: NO (commit happens in Task 4)

- [x] 2. Trigger June 1 cleaning schedule and verify output

  **What to do**:
  - Trigger the cleaning-schedule employee for June 1, 2026
  - Wait for completion (status `Done` or `Failed` — `Failed` is acceptable due to pre-existing `delivery_instructions=NULL`)
  - Verify Slack output against ALL 7 expected checkouts with correct format

  **Expected June 1 output (7 checkouts, Monday = weekday):**

  Cleaner assignments (Monday = weekday):
  - Austin (78744) → Yessica (primary weekday):
    - 4403B-HAY-HOME → "4403 Hayride Ln — Unidad B (90 min)"
    - 4405A-HAY-HOME → "4405 Hayride Ln — Unidad A (90 min)"
    - 7213-NUT-4 → "7213 Nutria Run — Habitación 4 (25 min)"
  - Kyle (78640) → Diana (primary all week):
    - 271-GIN-3 → "271 Gina Dr — Habitación 3 (25 min)"
    - 3505-BAN-1 → "3505 Banton Rd — Habitación 1 (25 min)"
    - 3505-BAN-2 → "3505 Banton Rd — Habitación 2 (25 min)"
    - 3505-BAN-3 → "3505 Banton Rd — Habitación 3 (25 min)"

  **Verification checklist:**
  - [ ] All 7 checkouts present
  - [ ] NO costs ($XX) in property lines under cleaners
  - [ ] Costs present in Resumen section
  - [ ] 4403B shows "Unidad B" (NOT "Casa")
  - [ ] 4405A shows "Unidad A" (NOT "Casa")
  - [ ] NUT-4 shows "Habitación 4"
  - [ ] GIN-3 shows "Habitación 3"
  - [ ] BAN-1/2/3 show "Habitación 1/2/3"
  - [ ] Yessica assigned Austin properties
  - [ ] Diana assigned Kyle properties
  - [ ] Angela, Abi, Rocio, Norma do NOT appear
  - [ ] Single Slack message (no double-posting)

  **Must NOT do**:
  - Do NOT modify any source files
  - Do NOT rebuild Docker image

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: API trigger + polling + Slack verification — no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 2
  - **Blocks**: Task 3 (conditional) or Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - AGENTS.md § "Task Debugging Quick Reference" — Status polling and Slack verification patterns

  **API/Type References**:
  - Tenant ID: `00000000-0000-0000-0000-000000000003` (VLRE)
  - Slack channel: `C0B71QSMZKQ`
  - Trigger endpoint: `POST /admin/tenants/:tenantId/employees/cleaning-schedule/trigger`
  - Trigger payload: `{"inputs": {"date": "2026-06-01"}}`

  **WHY Each Reference Matters**:
  - The trigger endpoint and payload format are needed to start the employee for the correct date
  - The Slack verification pattern shows how to fetch and parse thread replies

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Slack output contains all 7 June 1 checkouts with correct format
    Tool: Bash (curl + psql)
    Preconditions: Task triggered and completed, VLRE_SLACK_BOT_TOKEN set in .env
    Steps:
      1. Source .env
      2. Trigger employee: curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"inputs": {"date": "2026-06-01"}}' | jq '{task_id: .task_id}'
      3. Poll status every 30s until Done or Failed (timeout 15 min)
      4. Fetch Slack output via conversations.replies
      5. Assert ALL 7 property names appear:
         - 4403 Hayride (Unidad B) — NOT "Casa"
         - 4405 Hayride (Unidad A) — NOT "Casa"
         - 7213 Nutria (Habitación 4)
         - 271 Gina (Habitación 3)
         - 3505 Banton (Habitación 1)
         - 3505 Banton (Habitación 2)
         - 3505 Banton (Habitación 3)
      6. Assert NO dollar signs ($) in cleaner property lines (only in Resumen)
      7. Assert "Angela" does NOT appear
      8. Assert Yessica assigned to Austin properties, Diana to Kyle
    Expected Result: All 7 checkouts present with correct format, no costs in cleaner lines, correct assignments
    Failure Indicators: Missing checkouts, costs in cleaner lines, "Casa" for HAY units, wrong cleaner assignments
    Evidence: .sisyphus/evidence/task-2-june1-output.txt

  Scenario: No hallucinated or duplicate properties
    Tool: Bash
    Steps:
      1. Review Slack output for properties NOT in the expected 7
      2. Check for duplicate identical lines (the original bug)
    Expected Result: Only expected 7 checkouts (plus any legitimate additional ones)
    Evidence: .sisyphus/evidence/task-2-hallucination-check.txt
  ```

  **Commit**: NO

- [ ] 3. (CONDITIONAL) Fix issues if output is incorrect

  **What to do**:
  - **ONLY execute if Task 2 failed** (output missing checkouts, wrong format, wrong assignments)
  - Diagnose the specific issue from the Slack output
  - Apply targeted execution_steps fix to DB
  - Re-trigger and verify again
  - Sync DB version back to prisma/seed.ts
  - Iterate until output is correct

  **Must NOT do**:
  - Do NOT rewrite execution_steps from scratch — targeted fixes only
  - Do NOT change the HARD RATE RULE, SIBLING UNITS AUDIT, or ATOMIC SINGLE POST rules

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires reading logs, diagnosing model behavior, iterating on instructions
  - **Skills**: [`creating-archetypes`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 3 (conditional)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2 (only if Task 2 fails)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3556-3660` — execution_steps CREATE block
  - `prisma/seed.ts:3739-3850` — execution_steps UPDATE block
  - `.sisyphus/notepads/fix-get-properties-pagination/issues.md` — Previous iteration patterns and learnings

  **WHY Each Reference Matters**:
  - Previous issues.md shows the iteration pattern: diagnose → fix → re-trigger → verify
  - seed.ts blocks are where fixes get synced after DB updates

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Re-triggered employee produces correct output
    Tool: Bash (curl + psql)
    Steps:
      1. Trigger employee again with {"inputs": {"date": "2026-06-01"}}
      2. Wait for completion
      3. Fetch Slack output
      4. Assert all 7 checkouts present with correct format
      5. Assert seed.ts synced with DB
    Expected Result: Correct output after fix
    Evidence: .sisyphus/evidence/task-3-retry-output.txt
  ```

  **Commit**: NO (commit happens in Task 4)

- [ ] 4. Commit all changes

  **What to do**:
  - Stage `prisma/seed.ts` and `src/worker-tools/notion/fixtures/get-page/manual-personal.json`
  - Commit with message: `fix(cleaning-schedule): update output format, unit identification, and team roster`
  - Verify clean git status

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 5
  - **Blocked By**: Task 2 or Task 3

  **Commit**: YES
  - Message: `fix(cleaning-schedule): update output format, unit identification, and team roster`
  - Files: `prisma/seed.ts`, `src/worker-tools/notion/fixtures/get-page/manual-personal.json`

- [ ] 5. Notify completion via Telegram

  **What to do**:
  - Send: `npx tsx scripts/telegram-notify.ts "✅ Cleaning schedule output format + team roster update complete — June 1 schedule verified. Come back to review."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 4

  **Commit**: NO

---

## Final Verification Wave

> This plan's tasks ARE the verification (update → trigger → verify output). No separate review wave needed — the acceptance criteria in Task 2 directly verify correctness against the user's provided Hostfully checkout list.

---

## Commit Strategy

- **1**: `fix(cleaning-schedule): update output format, unit identification, and team roster` — `prisma/seed.ts`, `src/worker-tools/notion/fixtures/get-page/manual-personal.json`

---

## Success Criteria

### Verification Commands

```bash
# Trigger employee for June 1
source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"inputs": {"date": "2026-06-01"}}' | jq '{task_id: .task_id}'

# Verify Slack output
NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '<TASK_ID>';")
curl -s "https://slack.com/api/conversations.replies" -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" -d "channel=C0B71QSMZKQ&ts=$NOTIFY_TS&limit=20" | jq -r '.messages[] | .text'
```

### Final Checklist

- [ ] All 7 June 1 checkouts present in Slack output
- [ ] No costs in cleaner section (only in summary)
- [ ] Multi-unit properties distinguished (Unidad A/B, Habitación N)
- [ ] Correct cleaners assigned (Yessica for Austin, Diana for Kyle)
- [ ] Angela, Abi, Rocio, Norma absent from output
- [ ] Single Slack message (no double-posting)
- [ ] All changes committed
