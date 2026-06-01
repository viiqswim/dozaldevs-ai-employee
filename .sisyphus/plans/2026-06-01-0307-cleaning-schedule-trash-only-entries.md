# Cleaning Schedule: Trash-Only Entries for Properties Without Checkouts

## TL;DR

> **Quick Summary**: Modify the cleaning-schedule employee's `execution_steps` so it generates a separate 🗑️ Basura section for ALL properties whose trash take-out day matches the target date — even those with no checkout. Currently only checkout properties get trash lines.
>
> **Deliverables**:
>
> - Updated `execution_steps` in `prisma/seed.ts` (both create + update blocks)
> - DB updated with new archetype configuration
> - Verified Slack output includes trash-only entries
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — sequential (3 tasks + final verification)
> **Critical Path**: Task 1 (execution_steps) → Task 2 (DB update) → Task 3 (E2E verify) → F1-F4

---

## Context

### Original Request

Operations team reports that the cleaning team must be instructed to take out trash at ALL properties on their trash day — not just properties with cleaning assignments. Currently the employee only generates trash lines for properties that have a checkout on the target date, ignoring all other properties.

### Interview Summary

**Key Discussions**:

- Separate 🗑️ Basura section below the cleaning section (not mixed in)
- Same zone-to-cleaner assignment rules (ZIP-based from Manual de Personal)
- 15 minutes per trash-only property visit
- Include trash-only properties in Resumen with time estimates
- Day matching: targetDate's Spanish weekday only (Monday→Lunes, match "Sacar Lunes"). Sunday trash does NOT appear on Monday.
- Show ALL matching trash properties regardless of whether the assigned cleaner has cleaning tasks
- Keep 45-min travel overhead for zones 78744/78640 when cleaner has ZERO cleaning tasks
- Dual-day strings ("Sacar Lunes y Miércoles") — split on " y ", match each independently
- No double-counting: properties with checkouts excluded from Basura section

**Research Findings**:

- Directorio Operativo Notion page already has complete trash schedules for all 16 properties
- Employee already fetches this page in Step 4B — no new tools needed
- Two hard-skip properties: 5306 King Charles Dr (owners handle), 219 Paul St (bin always on street)
- Step 4G travel overhead logic exists but was dead code — now activatable
- Both `create` and `update` blocks in seed.ts must be updated (lines ~3525 and ~3731)

### Metis Review

**Identified Gaps** (all addressed):

- Dual-day trash parsing: execution_steps will include explicit split-on-" y " instruction
- "Sacar Domingo" ambiguity: resolved — match targetDate's weekday only, Sunday trash ≠ Monday
- Trash-only cleaners: resolved — show all matching properties regardless of cleaner's cleaning load
- Model override for E2E: included in verification task
- Double-counting guard: explicit deduplication rule in execution_steps
- Both seed.ts blocks: called out in task 1

---

## Work Objectives

### Core Objective

Add a 🗑️ Basura section to the cleaning-schedule employee's Slack output that lists ALL properties whose trash take-out day matches the target date, excluding properties that already appear in the cleaning section (which get inline trash lines via Step 4F).

### Concrete Deliverables

- Modified `execution_steps` field in archetype `00000000-0000-0000-0000-000000000019`
- DB updated via Node.js script (not full reseed)
- Verified Slack output with trash-only entries

### Definition of Done

- [ ] Employee output for Monday June 1 includes 🗑️ Basura section with 4 properties under Yessica + 2 under Zenaida
- [ ] Resumen shows 12 propiedades · 2 personas / Yessica: 10 propiedades — 340 min / Zenaida: 2 propiedades — 30 min
- [ ] No double-counting between cleaning and Basura sections
- [ ] Task reaches Done status

### Must Have

- Separate 🗑️ Basura section after the cleaning section
- All properties with matching trash day included (not just checkout properties)
- Zone-based cleaner assignment for trash-only properties
- 15 min per trash-only property in Resumen totals
- Dual-day string parsing ("Sacar Lunes y Miércoles" → check each day independently)
- Hard-skip 5306 King Charles Dr and 219 Paul St
- Deduplication: checkout properties excluded from Basura section
- 45-min travel overhead for zones 78744/78640 when cleaner has ZERO cleaning tasks
- calculate.ts used for all arithmetic

### Must NOT Have (Guardrails)

- NO changes to `directorio-operativo.json` fixture (data is already complete)
- NO changes to `get-page.ts`, `calculate.ts`, `get-checkouts.ts`, or any shell tool
- NO changes to Step 4F (inline trash for checkout properties)
- NO new Notion page fetches (Directorio already fetched in Step 4B)
- NO changes to `delivery_steps`, `delivery_instructions`, or `tool_registry`
- NO "Sacar Domingo" properties appearing on Monday (match targetDate weekday only)
- NO Docker rebuild (execution_steps is a DB field, tools are bind-mounted)
- NO full reseed — use targeted Node.js + psql update (same pattern as previous plan)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (user decision — skip unit tests)
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Trigger employee, verify DB status
- **Slack**: Use Bash (curl Slack API) — Read thread replies, verify message content

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — all depend on previous):
├── Task 1: Update execution_steps in seed.ts [deep]
├── Task 2: Apply DB update + verify [quick]
└── Task 3: E2E verification — trigger employee, verify Slack output [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
└── Task N: Notify completion via Telegram

Critical Path: Task 1 → Task 2 → Task 3 → F1-F4 → user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks |
| ----- | ---------- | ------ |
| 1     | —          | 2, 3   |
| 2     | 1          | 3      |
| 3     | 2          | F1-F4  |
| F1-F4 | 3          | N      |
| N     | F1-F4      | —      |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `quick`, T3 → `deep`
- **FINAL**: 4+1 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`, N → `quick`

---

## TODOs

- [x] 1. Update execution_steps to add trash-only Basura section

  **What to do**:
  - Modify the `execution_steps` field for archetype `00000000-0000-0000-0000-000000000019` in `prisma/seed.ts`
  - **CRITICAL**: Both the `create` block (~line 3525) AND the `update` block (~line 3731) contain identical `execution_steps`. BOTH must be modified identically.
  - Add a new step **Step 4H** between Step 4F (trash duties for checkout properties) and Step 4G (travel overhead)
  - Also modify **Step 5** (message format) to include the 🗑️ Basura section
  - Also modify the **TOTAL CALCULATION** and **RESUMEN** sections to include trash-only properties

  **New Step 4H — Trash-only properties (properties without checkouts)**:
  The logic must be:
  1. From the Directorio Operativo (already fetched in Step 4B), scan ALL properties — not just checkout properties
  2. Determine targetDate's Spanish weekday (e.g., Monday → "Lunes")
  3. For each property in the Directorio, read its trash entry (3rd block in the property's 3-block group)
  4. Parse the "Sacar [TakeOutDay]" value. For dual-day strings like "Sacar Lunes y Miércoles", split on " y " and check EACH day independently
  5. If ANY parsed take-out day matches targetDate's Spanish weekday → this property needs trash taken out
  6. EXCLUDE properties that already appear in the checkout list from Step 2 (they already get inline trash lines via Step 4F)
  7. EXCLUDE hard-skip properties: `5306 King Charles Dr` (owners handle) and `219 Paul St` (bin always on street)
  8. Assign each remaining property to its cleaner using the same ZIP-zone-to-cleaner rules from Step 4D (Manual de Personal)
  9. Each trash-only property = 15 minutes

  **Known trash-only properties for June 1 (Monday/Lunes) — ground truth**:
  Properties with "Sacar Lunes" (or dual-day containing "Lunes") and NO checkout on June 1:
  - 3401 Breckenridge Dr (ZIP 78744) → "Basura: Martes (Sacar Lunes)" → match → Yessica
  - 3412 Sand Dunes Ave (ZIP 78744) → "Basura: Martes (Sacar Lunes)" → match → Yessica
  - 3420 Hovenweep Ave (ZIP 78744) → "Basura: Martes (Sacar Lunes)" → match → Yessica
  - 6002 Palm Circle (ZIP 78744) → "Basura: Martes (Sacar Lunes)" → match → Yessica
  - 407 S Gevers St (ZIP 78203) → "Basura: Martes y Jueves (Sacar Lunes y Miércoles)" → split: "Lunes", "Miércoles" → "Lunes" matches → Zenaida
  - 6930 Heron Flats (ZIP 78109) → "Basura: Martes y Viernes (Sacar Lunes y Jueves)" → split: "Lunes", "Jueves" → "Lunes" matches → Zenaida

  **Zone assignments** (confirmed by user):
  - ZIP 78744 (Austin) → Yessica
  - ZIP 78203 (San Antonio) → Zenaida
  - ZIP 78109 (Converse) → Zenaida

  **Modify Step 5 — Message format**:
  After the cleaning section (🧹 Limpieza) and its `---` separator, add:

  ```
  🗑️ *Basura — [DayOfWeek] [Day] de [Month]*

  👤 *[CleanerName]*
    • [Address] — Sacar basura (15 min)

  [If another cleaner has trash-only properties:]
  👤 *[CleanerName2]*
    • [Address] — Sacar basura (15 min)
  ```

  If there are ZERO trash-only properties (all trash properties are already in the checkout list), omit the entire 🗑️ Basura section.

  **Modify TOTAL CALCULATION**:
  - The total expression must include BOTH cleaning minutes AND trash-only minutes
  - Example for June 1 Yessica: `"25+25+25+90+90+25+15+15+15+15"` → 340 min (280 cleaning + 60 trash)
  - Example for June 1 Zenaida: `"15+15"` → 30 min (trash only)
  - If multiple cleaners: calculate per-cleaner totals separately
  - Always use `tsx /tools/platform/calculate.ts --expression "<expr>"`

  **Modify RESUMEN**:
  - Count ALL properties: cleaning + trash-only
  - Count ALL unique cleaners
  - Per-cleaner line: include both cleaning and trash property counts and total minutes
  - Example for June 1: `12 propiedades · 2 personas` / `Yessica: 10 propiedades — 340 min` / `Zenaida: 2 propiedades — 30 min`
  - If multiple cleaners: each gets their own line

  **Modify Step 4G — Travel overhead**:
  - Clarify that the 45-min overhead applies when a cleaner has ZERO cleaning tasks but HAS trash-only tasks in zones 78744/78640
  - This means: if Yessica has cleaning tasks AND trash-only tasks, no travel overhead (she's already traveling for cleanings)
  - If Yessica has ONLY trash-only tasks and zero cleanings, add 45 min travel overhead

  **Must NOT do**:
  - Do NOT modify Step 4F (inline trash for checkout properties)
  - Do NOT change `tool_registry`, `model`, `delivery_steps`, or any other archetype field
  - Do NOT modify any shell tool source code
  - Do NOT modify fixture files
  - Do NOT touch the `create` block without also updating the `update` block identically

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying a complex multi-step execution_steps prompt requires careful reasoning about step ordering, deduplication logic, and format consistency
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Only covers archetype schema fields, not execution_steps prompt engineering
    - `adding-shell-tools`: No shell tools are being added

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 1, first)
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `prisma/seed.ts:3525-3692` — Current execution_steps (create block) — the full prompt being modified
  - `prisma/seed.ts:3731-3898` — Current execution_steps (update block) — must be kept identical to create block
  - `prisma/seed.ts:3607-3630` — Step 4F (inline trash for checkout properties) — do NOT modify, but understand the pattern
  - `prisma/seed.ts:3631-3632` — Step 4G (travel overhead) — needs clarification, not removal
  - `prisma/seed.ts:3634-3691` — Step 5 (message format + Resumen) — needs Basura section added

  **Data References**:
  - `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json` — Complete trash schedules for all 16 properties. Search for "Basura" and "Sacar" entries.
  - Two hard-skip properties documented in the fixture: `5306 King Charles Dr` (note: "Propietarios se encargan"), `219 Paul St` (note: "Bote siempre en la calle")

  **External References**:
  - None needed — all data is in the codebase

  **WHY Each Reference Matters**:
  - Lines 3525-3692: This IS the prompt being modified — read it fully to understand current structure before making changes
  - Lines 3731-3898: The update block MUST stay identical — after editing the create block, copy the exact same text to the update block
  - directorio-operativo.json: Contains the ground-truth trash data the LLM will parse at runtime

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify both seed.ts blocks are identical
    Tool: Bash (diff)
    Preconditions: seed.ts has been modified
    Steps:
      1. Extract execution_steps from create block (lines around 3525-3692)
      2. Extract execution_steps from update block (lines around 3731-3898)
      3. Diff the two — must be identical
    Expected Result: diff returns empty (no differences)
    Failure Indicators: Any line difference between the two blocks
    Evidence: .sisyphus/evidence/task-1-seed-blocks-diff.txt

  Scenario: Verify Step 4H is present and correctly structured
    Tool: Bash (grep)
    Preconditions: seed.ts has been modified
    Steps:
      1. grep for "Step 4H" or "STEP 4H" in prisma/seed.ts
      2. grep for "Sacar Lunes y" to verify dual-day parsing instruction exists
      3. grep for "King Charles" and "Paul St" to verify skip rules
      4. grep for "15 min" or "15 minutes" to verify trash time
    Expected Result: All greps find matches in the execution_steps
    Failure Indicators: Any grep returns empty
    Evidence: .sisyphus/evidence/task-1-step-4h-verification.txt

  Scenario: Verify Basura section format in Step 5
    Tool: Bash (grep)
    Preconditions: seed.ts has been modified
    Steps:
      1. grep for "🗑️ *Basura" in prisma/seed.ts
      2. grep for "Sacar basura (15 min)" in prisma/seed.ts
    Expected Result: Both patterns found in execution_steps
    Failure Indicators: Missing Basura format template
    Evidence: .sisyphus/evidence/task-1-basura-format.txt
  ```

  **Commit**: YES
  - Message: `feat(cleaning-schedule): add trash-only entries for non-checkout properties`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Apply DB update and verify archetype configuration

  **What to do**:
  - Apply the updated execution_steps to the database using the same Node.js + psql pattern from the previous plan (NOT a full reseed)
  - Write a temp Node.js script that reads the execution_steps from seed.ts and updates the archetype row via psql with dollar-quoted SQL
  - Verify the update was applied correctly by reading the archetype from the DB

  **Update pattern** (from previous plan — proven to work):

  ```bash
  # 1. Create a temp script that extracts execution_steps and generates SQL
  # 2. Run: node /tmp/update-archetype.js > /tmp/update-execution-steps.sql
  # 3. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -f /tmp/update-execution-steps.sql
  # 4. Verify: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT length(execution_steps) FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
  ```

  **Must NOT do**:
  - Do NOT run `pnpm prisma db seed` (full reseed wipes data)
  - Do NOT modify any field other than `execution_steps`
  - Do NOT change the model (keep `xiaomi/mimo-v2.5-pro`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple scripted DB update using a proven pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 1, second)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `.sisyphus/notepads/2026-05-31-2330-cleaning-schedule-full-accuracy-fix/learnings.md` — Documents the DB update pattern used successfully in the previous plan
  - `prisma/seed.ts` — Source of truth for the execution_steps content

  **WHY Each Reference Matters**:
  - The learnings file documents exactly how to extract and apply archetype changes without a full reseed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify execution_steps updated in DB
    Tool: Bash (psql)
    Preconditions: DB update script has been run
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" -t | grep "Step 4H"
      2. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" -t | grep "Basura"
    Expected Result: Both greps find matches — Step 4H and Basura section present in DB
    Failure Indicators: Either grep returns empty
    Evidence: .sisyphus/evidence/task-2-db-verification.txt

  Scenario: Verify model unchanged
    Tool: Bash (psql)
    Preconditions: DB update has been run
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" -t
    Expected Result: xiaomi/mimo-v2.5-pro (unchanged)
    Failure Indicators: Different model value
    Evidence: .sisyphus/evidence/task-2-model-check.txt
  ```

  **Commit**: NO (DB state only, no file changes beyond task 1)

- [x] 3. E2E Verification — trigger employee and verify Slack output

  **What to do**:
  - Override model to `deepseek/deepseek-v4-flash` for reliable tool calling during E2E
  - Trigger the cleaning-schedule employee with `INPUT_DATE=2026-06-01`
  - Wait for task to reach `Done` status
  - Read the Slack thread reply and verify the output contains BOTH the cleaning section AND the 🗑️ Basura section
  - Verify Resumen totals are correct
  - Restore model to `xiaomi/mimo-v2.5-pro` after verification

  **Step-by-step**:
  1. Override model: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE id = '00000000-0000-0000-0000-000000000019';"`
  2. Trigger: `source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"date":"2026-06-01"}' | jq '{task_id: .task_id}'`
  3. Poll for completion (every 30s): `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '$TASK_ID';" -t`
  4. Get Slack thread: Read the notification ts from task metadata, fetch thread replies via Slack API
  5. Verify output contains ALL required elements (see acceptance criteria below)
  6. Restore model: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "UPDATE archetypes SET model = 'xiaomi/mimo-v2.5-pro' WHERE id = '00000000-0000-0000-0000-000000000019';"`

  **If output is wrong**: Do NOT just re-trigger. Read the harness log (`grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30`) to understand what the model did wrong. Fix the execution_steps in seed.ts, re-apply DB update, and re-trigger. Iterate until correct.

  **Must NOT do**:
  - Do NOT leave model overridden to deepseek after verification — always restore
  - Do NOT call post-message.ts manually to fake the output
  - Do NOT modify shell tools to work around model behavior issues

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: E2E verification with potential iteration requires careful debugging and re-triggering
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: Needed if task gets stuck — covers all 13 lifecycle states, container logs, and DB queries

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 1, third)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `docs/employees/cleaning-schedule.md` — Trigger command, Slack channel, gotchas
  - `docs/guides/2026-05-31-2352-cleaning-schedule-verification.md` — Troubleshooting guide from previous plan
  - `.sisyphus/plans/2026-05-31-2330-cleaning-schedule-full-accuracy-fix.md` — Previous plan's E2E verification pattern (Task 8)

  **WHY Each Reference Matters**:
  - cleaning-schedule.md: Has the exact trigger curl command and channel ID
  - verification guide: Documents common failure modes and how to debug them
  - previous plan: Shows the exact E2E verification pattern that worked

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Happy path — full output with cleaning + trash sections (June 1, Monday)
    Tool: Bash (curl Slack API + psql)
    Preconditions: Employee triggered with INPUT_DATE=2026-06-01, task reached Done
    Steps:
      1. Get task's notification ts: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n'
      2. Fetch thread replies: source .env && curl -s "https://slack.com/api/conversations.replies" -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" -d "channel=C0B71QSMZKQ&ts=$NOTIFY_TS&limit=20" | jq '.messages[].text'
      3. Verify cleaning section present: output contains "🧹 *Limpieza — Lunes 1 de Junio*"
      4. Verify 6 cleaning entries: "3505 Banton Rd, Unit B — Habitación 1", "Habitación 2", "Habitación 3", "4403 Hayride Lane — Unidad B", "4405 Hayride Lane — Unidad A", "7213 Nutria Run — Habitación 4"
      5. Verify Basura section present: output contains "🗑️ *Basura"
      6. Verify Yessica's 4 trash entries: "3401 Breckenridge Dr — Sacar basura (15 min)", "3412 Sand Dunes Ave — Sacar basura (15 min)", "3420 Hovenweep Ave — Sacar basura (15 min)", "6002 Palm Circle — Sacar basura (15 min)"
      7. Verify Zenaida's 2 trash entries: "407 S Gevers St — Sacar basura (15 min)", "6930 Heron Flats — Sacar basura (15 min)"
      8. Verify Resumen: "12 propiedades" and "2 personas" and Yessica "340 min" and Zenaida "30 min"
      9. Verify no double-counting: Banton, Hayride, Nutria do NOT appear in Basura section
    Expected Result: All 9 checks pass — cleaning + trash + Resumen all correct
    Failure Indicators: Missing Basura section, wrong property count, wrong total minutes, double-counted properties, missing Zenaida section
    Evidence: .sisyphus/evidence/task-3-e2e-slack-output.txt

  Scenario: Verify task status is Done
    Tool: Bash (psql)
    Preconditions: Employee triggered
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '$TASK_ID';" -t
    Expected Result: Done
    Failure Indicators: Failed, Executing (stuck), or any other non-Done status
    Evidence: .sisyphus/evidence/task-3-task-status.txt

  Scenario: Verify model restored after test
    Tool: Bash (psql)
    Preconditions: E2E verification complete
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" -t
    Expected Result: xiaomi/mimo-v2.5-pro
    Failure Indicators: Still showing deepseek/deepseek-v4-flash
    Evidence: .sisyphus/evidence/task-3-model-restored.txt
  ```

  **Commit**: NO (verification only, no file changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read execution_steps in DB, check Slack output). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify seed.ts both blocks (create + update) are identical.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Trigger employee with `INPUT_DATE=2026-06-01`. Verify Slack output contains: 6 cleaning entries + 6 trash-only entries (4 Yessica + 2 Zenaida) + Resumen showing 12 propiedades · 2 personas / Yessica 340 min / Zenaida 30 min. Check no double-counting. Save evidence.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

- [x] N. **Notify completion** — Send Telegram: `tsx scripts/telegram-notify.ts "✅ cleaning-schedule-trash-only-entries complete — All tasks done. Come back to review results."`

---

## Commit Strategy

| After Task | Commit Message                                                                | Files            |
| ---------- | ----------------------------------------------------------------------------- | ---------------- |
| 2          | `feat(cleaning-schedule): add trash-only entries for non-checkout properties` | `prisma/seed.ts` |

---

## Success Criteria

### Verification Commands

```bash
# Verify task reached Done
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Done

# Verify Slack output contains Basura section
source .env
CHANNEL=C0B71QSMZKQ
# (check thread reply for 🗑️ Basura heading)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Slack output matches expected format
- [ ] Resumen totals correct (Yessica 340 min, Zenaida 30 min for June 1)
- [ ] No double-counting
- [ ] Task reaches Done
