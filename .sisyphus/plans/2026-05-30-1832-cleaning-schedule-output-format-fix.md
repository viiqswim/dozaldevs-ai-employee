# Cleaning Schedule Output Format Fix

## TL;DR

> **Quick Summary**: Fix the cleaning-schedule employee's `execution_steps` to remove CHECK-IN/CHECK-OUT labels and add room/unit identification for multi-room properties. Then iteratively trigger, review, and refine until the Slack output for May 31st looks correct.
>
> **Deliverables**:
>
> - Updated `execution_steps` in `prisma/seed.ts` (both create and update blocks)
> - Live DB archetype updated via SQL
> - Verified Slack output for May 31, 2026 — confirmed correct, readable, and professional
>
> **Estimated Effort**: Medium (iterative loop may require multiple runs)
> **Parallel Execution**: NO — sequential (3 dependent tasks)
> **Critical Path**: T1 (edit seed.ts) → T2 (update DB) → T3 (iterative trigger + review + fix loop until output is correct)

---

## Context

### Original Request

After the initial cleaning-schedule plan (10/10 tasks complete, all 4 final reviewers APPROVED), the user identified two output quality issues:

1. The Slack schedule includes "CHECK-IN" and "CHECK-OUT" labels which are unnecessary — the cleaning team only needs to know the service type (Habitación vs Casa Completa)
2. Multi-room properties (e.g., 3420 Hovenweep Ave with 3 rooms) are listed as identical repeated lines without specifying WHICH room to clean

### Interview Summary

**Key Discussions**:

- User confirmed "Option B": each room listed on a separate line with its room identifier
- User explicitly said CHECK-IN/CHECK-OUT labels are NOT needed: "The only thing the cleaning team needs to know is what they need to be preparing the property for"
- User said doom loop prevention is NOT needed (one-off test artifact with deepseek model)

**Research Findings**:

- Both CREATE and UPDATE blocks in `prisma/seed.ts` are identical (lines ~3530-3640 and ~3685-3795)
- The output format in STEP 4 currently includes `| CHECK-IN` / `| CHECK-OUT` labels and `[checkout/check-in] [Hora]` references
- No instruction exists for room/unit identification in multi-room properties
- Hostfully property listings use suffixes like `-1`, `-2`, `-HOME` to identify units
- Archetype ID: `00000000-0000-0000-0000-000000000019`, VLRE tenant

### Metis Review

**Identified Gaps** (addressed):

- Room identifier source: resolved — Hostfully listing name suffixes (`-1`, `-2`) already fetched by existing tools; Directorio Operativo maps these to rooms
- Single-room properties: resolved — only show room ID when multiple rooms exist for same address
- CREATE vs UPDATE block sync: verified — both blocks are currently identical
- Acceptance criteria: incorporated into plan as QA scenarios
- Edge case for null room identifiers: addressed with fallback instruction in the prompt

---

## Work Objectives

### Core Objective

Update the cleaning-schedule employee's output format to show room-specific lines (when applicable) without CHECK-IN/CHECK-OUT labels.

### Concrete Deliverables

- `prisma/seed.ts` — updated `execution_steps` in both create and update blocks for archetype `00000000-0000-0000-0000-000000000019`
- Live DB archetype row — updated via SQL UPDATE
- Slack message — verified output from real employee run

### Definition of Done

- [ ] No "CHECK-IN" or "CHECK-OUT" text in `execution_steps` output format section
- [ ] Room/unit identification instruction present in `execution_steps`
- [ ] Live DB matches seed.ts
- [ ] Employee produces Slack output without CHECK-IN/CHECK-OUT labels
- [ ] Multi-room properties show separate lines with room identifiers

### Must Have

- Remove `| CHECK-IN` and `| CHECK-OUT` labels from output template
- Remove `[checkout/check-in] [Hora]` references from property line format
- Add instruction to list each room separately with identifier for multi-room properties
- Single-room properties show just the address (no "Room 1")
- Both CREATE and UPDATE blocks in seed.ts updated identically
- Live DB archetype updated to match

### Must NOT Have (Guardrails)

- MUST NOT change any section of `execution_steps` other than STEP 4 output format and a brief room identification note in STEP 1
- MUST NOT touch `delivery_steps`, `identity`, `model`, `risk_model`, or any other archetype field
- MUST NOT change any other archetype in `prisma/seed.ts`
- MUST NOT add doom loop prevention logic
- MUST NOT rewrite or "improve" other parts of the prompt
- MUST NOT add new shell tool calls or dependencies
- MUST NOT override the production model (`minimax/minimax-m2.7`) for testing
- MUST NOT create a DB backup before the UPDATE (user explicitly said no backup needed for this fix)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — user explicitly said skip tests (63 pre-existing failures)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB verification**: Use Bash (psql) — query archetype, assert content
- **Text verification**: Use Bash (grep) — search seed.ts for forbidden/required patterns

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — each depends on prior):
├── Task 1: Edit execution_steps in prisma/seed.ts [quick]
├── Task 2: Update live DB archetype (depends: T1) [quick]
└── Task 3: Trigger employee + verify output + commit (depends: T2) [quick]

Critical Path: T1 → T2 → T3
Parallel Speedup: N/A — strictly sequential
Max Concurrent: 1
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | T2, T3 | 1    |
| T2   | T1         | T3     | 1    |
| T3   | T2         | —      | 1    |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `deep`

---

## TODOs

- [x] 1. Edit execution_steps in prisma/seed.ts

  **What to do**:
  - Open `prisma/seed.ts` and locate the cleaning-schedule archetype's `execution_steps` field
  - There are TWO identical blocks (create ~line 3530 and update ~line 3685) — BOTH must be edited identically
  - Make these specific changes to STEP 4 (Build the schedule message) and STEP 1:

  **Change A — STEP 1: Add room/unit identification instruction**
  After the existing `- Use get-property.ts to get property details...` line (around line 3539 in create block, ~3694 in update block), add:

  ```
  - ROOM/UNIT IDENTIFICATION: When a property has multiple units (e.g., Hostfully listings ending in -1, -2, -HOME, -LOFT), each unit that has a checkout must be listed as a SEPARATE line in the schedule with its room identifier. Derive room names from the Hostfully listing name suffix (e.g., "271-GIN-1" → "Habitación 1", "271-GIN-2" → "Habitación 2", "271-GIN-HOME" → "Casa"). If the property has only ONE unit checking out, do NOT append a room identifier — just show the address.
  ```

  **Change B — STEP 4: Remove CHECK-IN/CHECK-OUT labels and update output format**
  Replace the current STEP 4 content (from `STEP 4 — Build the schedule message:` through the `RULES:` section before STEP 5) with the updated version below. The key changes are:
  1. Remove all `| CHECK-IN` and `| CHECK-OUT` label references
  2. Remove `[checkout/check-in] [Hora]` from property line format
  3. Remove `AND whether it is CHECK-IN or CHECK-OUT` from the instruction
  4. Update the output format template to show: `• [Dirección] — [Habitación/Room ID if multi-unit], [Ciudad] — [Hora] — [TipoServicio] ([Duración])`
  5. For multi-room properties, each room is a separate line with its identifier
  6. For single-unit properties, just show the address without room identifier

  The updated STEP 4 should be:

  ```
  STEP 4 — Build the schedule message:
  - Format as Slack mrkdwn text (NO Block Kit JSON, NO interactive buttons)
  - ORGANIZE BY ASSIGNED CLEANER — one section per cleaner
  - Use REAL STREET ADDRESSES (from get-property.ts), NEVER property codes
  - For each property line: show address, city, checkout time, service type (what to prepare), and duration
  - MULTI-UNIT PROPERTIES: If a property has multiple rooms/units checking out, list EACH room on its own line with its room identifier (e.g., "Habitación 1", "Habitación 2"). The cleaning team must know WHICH specific room to clean.
  - SINGLE-UNIT PROPERTIES: Just show the address — do NOT add a room identifier
  - Do NOT include "CHECK-IN" or "CHECK-OUT" labels — the cleaning team only needs to know the service type (what to prepare the property for)
  - Only show 🗑️ trash line for properties that HAVE trash duty — do NOT show "sin basura" or any negative indicator
  - Do NOT show property codes or lock/door access codes
  - Add a summary section at the bottom with per-cleaner totals (properties, total minutes, total cost) and grand total
  - Date and day names in Spanish

  EXACT OUTPUT FORMAT:

  🧹 *Limpieza — [DíaDeLaSemana] [Día] de [Mes]*

  👤 *[Nombre del Limpiador]*
    • [Dirección], [Ciudad] — [Hora] — [TipoServicio] ([Duración])
    • [Dirección] — [Habitación N], [Ciudad] — [Hora] — [TipoServicio] ([Duración])
    • [Dirección] — [Habitación N], [Ciudad] — [Hora] — [TipoServicio] ([Duración])
      🗑️ Sacar basura ([TipoBasura])

  👤 *[Nombre del Limpiador]*
    • [Dirección], [Ciudad] — [Hora] — [TipoServicio] ([Duración])

  ---
  📊 *Resumen*
  [N] propiedades · [N] personas
  [Limpiador1]: [N] propiedades — [TotalMin] min — $[Costo]
  [Limpiador2]: [N] propiedades — [TotalMin] min — $[Costo]
  *Total: $[GranTotal]*

  RULES:
  - 🗑️ trash line appears ONLY on properties with trash duty — indented under the property line
  - Properties under each cleaner ordered by geographic proximity (closest addresses first)
  - Multi-unit properties: each room/unit is its own line with identifier (Habitación 1, Habitación 2, Casa, Loft, etc.)
  - Single-unit properties: just show address, no room identifier
  - If zero checkouts: post "No hay checkouts para [date]. No se requiere limpieza." and submit as NO_ACTION_NEEDED
  ```

  **CRITICAL**: Make IDENTICAL changes to BOTH the create block (~lines 3530-3640) and the update block (~lines 3685-3795). Verify by comparing both blocks after editing.

  **Must NOT do**:
  - Do NOT change STEP 1 beyond adding the room/unit identification instruction
  - Do NOT change STEP 2, STEP 3, or STEP 5
  - Do NOT change CHECK-IN BILLING RULE section (the billing logic stays — only the OUTPUT labels are removed)
  - Do NOT touch `identity`, `delivery_steps`, `model`, or any other field
  - Do NOT edit any other archetype in seed.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, targeted text replacement in two mirrored blocks
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Not needed — we're editing an existing archetype's execution_steps text, not creating a new one

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (first task)
  - **Blocks**: T2, T3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3530-3640` — CREATE block execution_steps for cleaning-schedule archetype (STEP 1 through STEP 5 + IMPORTANT NOTES)
  - `prisma/seed.ts:3685-3795` — UPDATE block execution_steps for cleaning-schedule archetype (identical content, must stay in sync)

  **WHY Each Reference Matters**:
  - Lines 3530-3640 and 3685-3795 are the ONLY two places to edit. The agent must read both, edit both identically, and verify they match after editing.
  - STEP 4 (output format) is lines ~3591-3625 in CREATE and ~3746-3780 in UPDATE — this is where CHECK-IN/CHECK-OUT labels live
  - STEP 1 room identification instruction goes after line ~3539 in CREATE and ~3694 in UPDATE

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CHECK-IN/CHECK-OUT labels removed from output format
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. Run: grep -n "CHECK-IN\|CHECK-OUT" prisma/seed.ts
      2. Verify that NO matches appear in the STEP 4 output format section or the EXACT OUTPUT FORMAT template
      3. Note: matches in STEP 1's CHECK-IN BILLING RULE section are EXPECTED and correct (billing logic stays)
    Expected Result: Zero matches in STEP 4 / output format sections; matches only in CHECK-IN BILLING RULE section of STEP 1
    Failure Indicators: Any line in STEP 4 or output template containing "CHECK-IN" or "CHECK-OUT"
    Evidence: .sisyphus/evidence/task-1-no-checkin-labels.txt

  Scenario: Room identification instruction present
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. Run: grep -n "ROOM/UNIT IDENTIFICATION\|Habitación N\|Multi-unit\|multi-unit" prisma/seed.ts
      2. Verify matches appear in BOTH create block AND update block
    Expected Result: At least 2 matches (one per block) for room identification instructions
    Failure Indicators: Instruction present in only one block, or absent entirely
    Evidence: .sisyphus/evidence/task-1-room-id-instruction.txt

  Scenario: CREATE and UPDATE blocks are identical
    Tool: Bash
    Preconditions: Both blocks edited
    Steps:
      1. Extract execution_steps text from CREATE block and UPDATE block
      2. Diff the two extractions
    Expected Result: Zero differences
    Failure Indicators: Any diff output
    Evidence: .sisyphus/evidence/task-1-blocks-match.txt
  ```

  **Commit**: NO (commit in T3 after verification)

- [x] 2. Update live DB archetype via SQL

  **What to do**:
  - Read the updated `execution_steps` text from `prisma/seed.ts` (the CREATE block)
  - Apply it to the live DB using dollar-quoted SQL:
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "UPDATE archetypes SET execution_steps = \$EXEC_TAG\$<execution_steps content>\$EXEC_TAG\$, updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000019';"
    ```
  - Verify the update was applied with a SELECT query

  **Must NOT do**:
  - Do NOT update any field other than `execution_steps` and `updated_at`
  - Do NOT update any other archetype row
  - Do NOT create a backup (user explicitly said no backup needed)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL UPDATE, straightforward DB operation
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (second task)
  - **Blocks**: T3
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3530-3640` — Source of truth for the updated execution_steps text to apply to DB

  **WHY Each Reference Matters**:
  - The agent must read the updated seed.ts to get the exact text to apply via SQL UPDATE

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Live DB has no CHECK-IN/CHECK-OUT in output format
    Tool: Bash (psql)
    Preconditions: SQL UPDATE applied
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" | grep -c "| CHECK-IN\|| CHECK-OUT"
      2. Expected: 0
    Expected Result: Zero matches for CHECK-IN/CHECK-OUT output labels
    Failure Indicators: Count > 0
    Evidence: .sisyphus/evidence/task-2-db-no-labels.txt

  Scenario: Room identification instruction in live DB
    Tool: Bash (psql)
    Preconditions: SQL UPDATE applied
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" | grep -c "ROOM/UNIT IDENTIFICATION"
      2. Expected: 1
    Expected Result: Instruction present in live DB
    Failure Indicators: Count = 0
    Evidence: .sisyphus/evidence/task-2-db-room-instruction.txt
  ```

  **Commit**: NO (commit in T3)

- [x] 3. Iterative trigger, review, and refine loop (target date: May 31, 2026)

  **What to do**:

  This task is an **iterative loop**. Trigger the employee, analyze the Slack output, and if anything looks wrong — fix the `execution_steps` (in BOTH seed.ts blocks AND the live DB) and re-trigger. Repeat until the output is correct, clear, and professional.

  **ITERATION LOOP:**

  ```
  while (output not satisfactory):
    1. Trigger the employee for May 31, 2026
    2. Wait for task to reach Done
    3. Fetch the Slack message from channel C0B71QSMZKQ
    4. Analyze the output against the quality checklist below
    5. If ALL checks pass → commit and exit loop
    6. If ANY check fails → identify the root cause in execution_steps,
       fix it in BOTH seed.ts blocks AND live DB, then go to step 1
  ```

  **Step 1 — Trigger for May 31st:**

  ```bash
  source .env
  curl -s -X POST \
    "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"prompt": "Generate the cleaning schedule for Saturday May 31, 2026. Use May 31, 2026 as the target date for all reservation lookups (checkouts and check-ins)."}' \
    | jq '{task_id: .task_id, status_url: .status_url}'
  ```

  **Step 2 — Wait for completion:**
  Poll every 30s: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '<TASK_ID>';"`
  Expect Done within 2-5 minutes. If Failed, check container logs for root cause.

  **Step 3 — Fetch the Slack message:**

  ```bash
  source .env
  # Get the notify_slack_ts from task metadata
  NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '<TASK_ID>';" | tr -d ' \n')
  # Fetch the thread
  curl -s "https://slack.com/api/conversations.replies" \
    -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
    -d "channel=C0B71QSMZKQ&ts=$NOTIFY_TS&limit=20" | jq '.messages[] | .text'
  ```

  **Step 4 — Quality checklist (ALL must pass):**

  **Hard requirements (binary pass/fail):**
  - [ ] No "CHECK-IN" or "CHECK-OUT" text anywhere in the schedule
  - [ ] Service types present (Habitación / Casa Completa or equivalent)
  - [ ] Only ONE schedule message posted (no doom loop)
  - [ ] Date is Saturday May 31 (Sábado 31 de Mayo)
  - [ ] Real street addresses used (not property codes)
  - [ ] No lock codes or door codes visible
  - [ ] Summary section present with per-cleaner totals and grand total

  **Readability & clarity (judgment call):**
  - [ ] Schedule is well-organized by cleaner — each person has a clear section
  - [ ] Property lines are easy to scan — address, time, service type, duration all readable at a glance
  - [ ] Multi-room properties (if any for May 31st) show separate lines with room identifiers (e.g., "Habitación 1", "Habitación 2") — NOT the same address repeated without differentiation
  - [ ] Single-unit properties do NOT show unnecessary room identifiers
  - [ ] No duplicate or redundant information
  - [ ] Costs look reasonable (not $0, not wildly inflated)
  - [ ] Team assignments make geographic sense (no cross-city assignments)
  - [ ] The schedule would make sense to a non-technical cleaning team member reading it on their phone
  - [ ] Trash duties (if any) are clearly marked with 🗑️ under the relevant property
  - [ ] Overall the message looks professional, clean, and actionable

  **Step 5 — If issues found, fix and re-trigger:**
  - Identify which part of `execution_steps` caused the issue
  - Edit `prisma/seed.ts` — BOTH create and update blocks — to fix the prompt
  - Apply the same fix to the live DB via SQL UPDATE (same dollar-quoting pattern from T2)
  - Re-trigger the employee (go back to Step 1)
  - Document each iteration: what was wrong, what was changed, what improved

  **Step 6 — When output passes all checks:**
  - Commit `prisma/seed.ts`:
    ```bash
    git add prisma/seed.ts
    git commit -m "fix(cleaning-schedule): remove check-in/out labels and add room identification to output format"
    ```
  - Send Telegram notification:
    ```bash
    tsx scripts/telegram-notify.ts "✅ cleaning-schedule output format fix complete — schedule for May 31 verified. Come back to review."
    ```

  **Must NOT do**:
  - Do NOT override the model — use production model `minimax/minimax-m2.7` as-is
  - Do NOT commit until the output passes ALL quality checks
  - Do NOT give up after one failed iteration — keep fixing and re-triggering
  - Do NOT change anything outside `execution_steps` in seed.ts (no identity, delivery_steps, model, etc.)
  - Do NOT change any other archetype

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Iterative loop requiring judgment calls on output quality, potential multi-round fixes to execution_steps, and waiting for employee runs. Needs autonomy to decide when output is "good enough" vs needs another iteration.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (third task)
  - **Blocks**: None
  - **Blocked By**: T2

  **References**:

  **Pattern References**:
  - AGENTS.md § Admin API — trigger endpoint: `POST /admin/tenants/:tenantId/employees/:slug/trigger`
  - AGENTS.md § Task Debugging Quick Reference — how to check task status and Slack output
  - `prisma/seed.ts:3530-3640` — CREATE block execution_steps (will need to edit if fixing prompt issues)
  - `prisma/seed.ts:3685-3795` — UPDATE block execution_steps (must stay in sync with CREATE block)

  **WHY Each Reference Matters**:
  - The agent needs the trigger endpoint, status polling queries, and Slack API patterns to run the loop
  - If prompt fixes are needed, the agent must know exactly where both execution_steps blocks are and keep them in sync

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Employee reaches Done for May 31st schedule
    Tool: Bash (psql)
    Preconditions: Task triggered with May 31st prompt
    Steps:
      1. Poll task status every 30s
      2. Wait for status = 'Done'
    Expected Result: Status = 'Done' within 10 minutes
    Failure Indicators: Status = 'Failed' or stuck in 'Executing' > 10 min
    Evidence: .sisyphus/evidence/task-3-task-status.txt

  Scenario: Slack output passes all quality checks
    Tool: Bash (curl Slack API)
    Preconditions: Task reached Done
    Steps:
      1. Fetch schedule message from Slack channel C0B71QSMZKQ
      2. Verify: no "CHECK-IN"/"CHECK-OUT" text
      3. Verify: date shows Sábado 31 de Mayo (or equivalent Spanish)
      4. Verify: organized by cleaner with clear sections
      5. Verify: addresses are real (not property codes)
      6. Verify: summary section with totals present
      7. Verify: only 1 schedule message (no doom loop)
      8. Judge: readability, clarity, professionalism
    Expected Result: All hard requirements pass AND readability is good
    Failure Indicators: Any hard requirement fails OR output is confusing/unreadable
    Evidence: .sisyphus/evidence/task-3-slack-output-final.txt

  Scenario: Iteration log (if multiple attempts)
    Tool: Bash
    Preconditions: At least one re-trigger occurred
    Steps:
      1. Document each iteration: attempt number, what was wrong, what was changed
    Expected Result: Clear log showing convergence toward correct output
    Evidence: .sisyphus/evidence/task-3-iteration-log.txt

  Scenario: Commit created after quality approval
    Tool: Bash (git)
    Preconditions: Output passed all quality checks
    Steps:
      1. git add prisma/seed.ts
      2. git commit -m "fix(cleaning-schedule): remove check-in/out labels and add room identification to output format"
      3. git status — verify clean
    Expected Result: Clean commit with only prisma/seed.ts
    Failure Indicators: Commit fails or includes unexpected files
    Evidence: .sisyphus/evidence/task-3-commit.txt

  Scenario: Telegram notification sent
    Tool: Bash (tsx)
    Preconditions: Commit done
    Steps:
      1. tsx scripts/telegram-notify.ts "✅ cleaning-schedule output format fix complete — schedule for May 31 verified. Come back to review."
    Expected Result: Notification sent
    Evidence: .sisyphus/evidence/task-3-telegram.txt
  ```

  **Commit**: YES (only after output passes all quality checks)
  - Message: `fix(cleaning-schedule): remove check-in/out labels and add room identification to output format`
  - Files: `prisma/seed.ts`
  - Pre-commit: N/A (tests skipped per user instruction)

---

## Final Verification Wave

> Not applicable for this micro-fix. T3 includes inline verification (trigger + inspect output). The fix is too small for 4 parallel reviewers.

---

## Commit Strategy

- **T3**: `fix(cleaning-schedule): remove check-in/out labels and add room identification to output format` — `prisma/seed.ts`

---

## Success Criteria

### Verification Commands

```bash
# No CHECK-IN/CHECK-OUT labels in output format
grep -c "CHECK-IN\|CHECK-OUT" prisma/seed.ts  # Expected: 0 in output format sections

# Room identification instruction present
grep -c "room\|habitación\|Room\|Habitación" prisma/seed.ts  # Expected: matches in cleaning-schedule section

# Live DB matches
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" \
  | grep -c "CHECK-IN\|CHECK-OUT"  # Expected: 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Employee produces correct Slack output
