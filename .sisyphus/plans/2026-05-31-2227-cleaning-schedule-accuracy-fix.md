# Cleaning Schedule Data Accuracy Fix

## TL;DR

> **Quick Summary**: Fix 4 bugs in the cleaning-schedule employee's `execution_steps` that cause it to include false-positive properties (CLOSED/CANCELLED leads counted as checkouts) and miss room identifiers. API-verified: exactly 6 properties check out June 1, 2026 — the last run incorrectly showed 12.
>
> **Deliverables**:
>
> - Fixed `execution_steps` in DB (archetype `00000000-0000-0000-0000-000000000019`)
> - Updated `prisma/seed.ts` to persist the fix
> - Verified output: exactly 6 entries, all assigned to Yessica (Austin, weekday)
>
> **Estimated Effort**: Short (2-3 iterations max)
> **Parallel Execution**: NO — sequential (each task depends on the previous)
> **Critical Path**: Fix seed.ts → Update DB → Trigger → Verify → Commit

---

## Context

### Original Request

User identified that the cleaning-schedule employee produced 12 output entries when only 6 were correct. The user was frustrated that work was declared "complete" when the output had obvious data errors (wrong properties, wrong cities, missing room IDs).

### Interview Summary

**Key Discussions**:

- User confirmed "Keep Unit B" in addresses (meaningful to cleaners)
- User confirmed Hostfully is the #1 source of truth for addresses
- User confirmed skip unit tests
- User wants iteration until output is correct — no premature "done" declarations

**Research Findings (API-Verified)**:

- Scanned ALL 45 VLRE properties via Hostfully API
- Exactly 6 properties have June 1, 2026 checkouts (all BOOKING type, non-cancelled)
- 3505 Banton Rd ZIP is 78722 (Austin), NOT 78640 (Kyle)
- 271-GIN-3 checkOut is June 3, NOT June 1 (earlier assumption was wrong)
- 5 false positives were CLOSED INQUIRYs, CANCELLED bookings, or fabricated

### Metis Review

**Identified Gaps** (addressed):

- Docker rebuild NOT needed for DB-only changes — removed from plan
- Shell tool doesn't filter by type/status — filtering is client-side in the model's logic, which is correct since the fix IS in execution_steps text
- Must persist changes in seed.ts, not just DB UPDATE
- Max 3 iteration attempts before escalating with diagnostics
- Verify exactly one active cleaning-schedule archetype exists before updating

---

## Work Objectives

### Core Objective

Fix the 4 identified bugs in `execution_steps` so the cleaning-schedule employee produces data-accurate output matching API-verified ground truth.

### Concrete Deliverables

- `prisma/seed.ts` updated with fixed `execution_steps` for archetype `00000000-0000-0000-0000-000000000019`
- DB updated with same fixed text
- Slack output showing exactly 6 entries, all correct

### Definition of Done

- [ ] Trigger cleaning-schedule employee for June 1, 2026
- [ ] Output contains exactly 6 property entries (not more, not less)
- [ ] All 6 entries match the ground truth table below
- [ ] No CLOSED/CANCELLED/INQUIRY leads appear in output
- [ ] Room identifiers shown for all entries
- [ ] All entries assigned to Yessica (Monday = weekday, all properties in Austin)

### Ground Truth — June 1, 2026 Checkouts (API-Verified)

| #   | Listing Name   | Hostfully Address      | ZIP   | City   | Room ID      | Cleaner |
| --- | -------------- | ---------------------- | ----- | ------ | ------------ | ------- |
| 1   | 3505-BAN-1     | 3505 Banton Rd, Unit B | 78722 | Austin | Habitación 1 | Yessica |
| 2   | 3505-BAN-2     | 3505 Banton Rd, Unit B | 78722 | Austin | Habitación 2 | Yessica |
| 3   | 3505-BAN-3     | 3505 Banton Rd, Unit B | 78722 | Austin | Habitación 3 | Yessica |
| 4   | 4403B-HAY-HOME | 4403 Hayride Lane      | 78744 | Austin | Unidad B     | Yessica |
| 5   | 4405A-HAY-HOME | 4405 - A Hayride lane  | 78744 | Austin | Unidad A     | Yessica |
| 6   | 7213-NUT-4     | 7213 Nutria Run        | 78744 | Austin | Habitación 4 | Yessica |

### Known False Positives (MUST NOT appear in output)

- 5306A-KIN-Home / 5306 King Charles Drive (only CLOSED INQUIRYs/CANCELLED bookings with June 1 checkOut)
- 4403S-HAY-HOME / 4403 Hayride Ln (no June 1 checkout — closest is checkIn May 31)
- 7213-NUT-2 / 7213 Nutria Run Habitación 2 (checkOut is May 31, not June 1)
- 7213-NUT-3 / 7213 Nutria Run Habitación 3 (checkOut is May 31, not June 1)
- 7213-NUT-HOME / 7213 Nutria Run Casa (no non-BLOCK leads at all)
- 271-GIN-3 / 271 Gina Dr (checkOut is June 3, not June 1)

### Must Have

- Exactly 6 entries in output
- Each entry has a room/unit identifier
- All entries assigned to Yessica
- Addresses match Hostfully source data

### Must NOT Have (Guardrails)

- CLOSED or CANCELLED leads counted as valid checkouts
- INQUIRY-type leads counted as valid checkouts
- Properties with only checkIn (not checkOut) on target date
- The "single unit = no room ID" suppression rule
- Any modifications to files under `src/worker-tools/`
- Any modifications to archetype fields other than `execution_steps`
- Dollar amounts, lock codes, property codes in output
- More than one Slack message posted

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
- **Output verification**: Grep harness logs for output content, compare against ground truth

---

## Execution Strategy

### Sequential Execution (No Parallelism)

Each task depends on the previous — this is an iterative fix-and-verify loop.

```
Task 1: Fix execution_steps in seed.ts + update DB
  ↓
Task 2: Trigger employee and verify output
  ↓ (if wrong → loop back to Task 1 with diagnostics, max 3 times)
Task 3: Commit changes
  ↓
Task 4: Send Telegram notification
```

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep` (execution_steps rewrite requires careful text editing)
- **Wave 2**: T2 → `deep` (trigger + verify + iterate)
- **Wave 3**: T3 → `quick` (git commit)
- **Wave 4**: T4 → `quick` (telegram notification)

---

## TODOs

- [ ] 1. Fix execution_steps — Apply 4 Bug Fixes and Update DB

  **What to do**:

  First, verify there is exactly one active cleaning-schedule archetype:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "SELECT id, role_name, status FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
  ```

  Expected: one row with status `active`.

  Then read the current `execution_steps` to confirm the 4 bugs are present. Apply these 4 fixes to the execution_steps text:

  **Fix 1 — Filter to BOOKING type only (CRITICAL)**:
  In step 1D where the CLEANING LIST is built, change the filter criteria. Currently the instruction says:

  ```
  TEST: checkOut.substring(0, 10) === targetDate ?
  → YES and status is NOT cancelled → ADD to CLEANING LIST
  ```

  Replace with a stricter test:

  ```
  TEST — ALL THREE conditions must be true to ADD to CLEANING LIST:
  1. checkOut.substring(0, 10) === targetDate
  2. type === "BOOKING" (SKIP any lead where type is INQUIRY, BOOKING_REQUEST, or BLOCK)
  3. status is one of: BOOKED, BOOKED_BY_AGENT, BOOKED_BY_CUSTOMER, BOOKED_EXTERNALLY, STAY
     (SKIP any lead with status: CANCELLED, CANCELLED_BY_TRAVELER, CANCELLED_BY_OWNER, CLOSED, or any other status)

  If ANY of the three conditions fails → SKIP (do NOT add to CLEANING LIST).
  ```

  **Fix 2 — Remove "single unit = no room ID" rule**:
  Find and DELETE these two lines from the ROOM/UNIT IDENTIFICATION section:

  ```
  - If only ONE unit is checking out at an address, do NOT append a room identifier — just show the address
  - If MULTIPLE units are checking out at the same address, each gets its own line with its identifier
  ```

  Replace with:

  ```
  - ALWAYS show the room/unit identifier derived from the listing name, regardless of how many units are checking out
  - Each property in the CLEANING LIST gets its own line with its identifier
  ```

  **Fix 3 — Add 78722 to ZIP-TO-CITY OVERRIDE table**:
  Add this line to the ZIP-TO-CITY OVERRIDE section:

  ```
  - 78722 → Austin, TX
  ```

  **Fix 4 — Strengthen the self-check step (1E)**:
  Replace the current 1E self-check with:

  ```
  1E. Self-check (MANDATORY — do NOT skip):
     For EACH entry in the CLEANING LIST, verify ALL of the following:
     a. checkOut date starts with targetDate (e.g., "2026-06-01")
     b. type is "BOOKING" (not INQUIRY, BLOCK, or BOOKING_REQUEST)
     c. status is BOOKED, STAY, BOOKED_BY_AGENT, BOOKED_BY_CUSTOMER, or BOOKED_EXTERNALLY

     If ANY entry fails ANY check → REMOVE it from the CLEANING LIST now.

     State aloud: "CLEANING LIST after self-check: [N] properties" and list each one with its type, status, and checkOut.
  ```

  After applying all 4 fixes, update `prisma/seed.ts` (the `execution_steps` field for the cleaning-schedule archetype, around lines 3525-3707 for CREATE and 3747-3929 for UPDATE). Both the CREATE and UPDATE blocks must have the same text.

  Then update the DB directly (since we're not reseeding):

  ```bash
  # Write the updated execution_steps to a temp file, then use psql with dollar-quoting
  node -e "
  const steps = \`<the full fixed execution_steps text>\`;
  const sql = \`UPDATE archetypes SET execution_steps = \\\$\\\$\${steps}\\\$\\\$, updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000019';\`;
  require('fs').writeFileSync('/tmp/update-execution-steps.sql', sql);
  "
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -f /tmp/update-execution-steps.sql
  ```

  Verify the update:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -t -c "SELECT length(execution_steps) FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
  ```

  **Must NOT do**:
  - Do NOT modify any files under `src/worker-tools/`
  - Do NOT change any archetype field other than `execution_steps`
  - Do NOT run `pnpm prisma db seed` (overwrites all archetypes)
  - Do NOT add address normalization logic (use Hostfully addresses as-is)
  - Do NOT change delivery_steps, delivery_instructions, identity, or model

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful text editing of a large execution_steps string with precise changes to 4 specific sections, plus syncing seed.ts CREATE and UPDATE blocks
  - **Skills**: []
    - No skills needed — this is a text editing task on a known file

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — must complete before Task 2
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3525-3707` — CREATE block with current execution_steps for cleaning-schedule
  - `prisma/seed.ts:3747-3929` — UPDATE block (must match CREATE block)

  **API/Type References**:
  - `src/worker-tools/hostfully/get-reservations.ts:23-37` — RawLead type showing `type`, `status`, `checkOutLocalDateTime` fields
  - `src/worker-tools/hostfully/get-reservations.ts:196-222` — CONFIRMED_STATUSES and CANCELLED_STATUSES sets (reference for valid status values)

  **Acceptance Criteria**:
  - [ ] `prisma/seed.ts` updated with all 4 fixes in both CREATE and UPDATE blocks
  - [ ] DB updated with fixed execution_steps
  - [ ] Verify DB update: `SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019'` contains:
    - `type === "BOOKING"` (Fix 1)
    - No "If only ONE unit is checking out" text (Fix 2)
    - `78722 → Austin` (Fix 3)
    - `type is "BOOKING" (not INQUIRY, BLOCK, or BOOKING_REQUEST)` in self-check (Fix 4)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify execution_steps contains all 4 fixes
    Tool: Bash (psql)
    Preconditions: DB is running on localhost:54322
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';" > /tmp/execution_steps_check.txt
      2. grep 'type === "BOOKING"' /tmp/execution_steps_check.txt (Fix 1)
      3. grep -c 'only ONE unit is checking out' /tmp/execution_steps_check.txt (Fix 2 — must be 0)
      4. grep '78722' /tmp/execution_steps_check.txt (Fix 3)
      5. grep 'not INQUIRY, BLOCK' /tmp/execution_steps_check.txt (Fix 4)
    Expected Result: Steps 2, 4, 5 return matches. Step 3 returns 0.
    Failure Indicators: Any grep fails to match (or step 3 returns >0)
    Evidence: .sisyphus/evidence/task-1-execution-steps-verification.txt

  Scenario: Verify seed.ts matches DB
    Tool: Bash (grep)
    Preconditions: prisma/seed.ts has been updated
    Steps:
      1. grep 'type === "BOOKING"' prisma/seed.ts (both CREATE and UPDATE blocks)
      2. grep -c 'only ONE unit is checking out' prisma/seed.ts (must be 0)
    Expected Result: Step 1 returns matches. Step 2 returns 0.
    Evidence: .sisyphus/evidence/task-1-seed-verification.txt
  ```

  **Commit**: NO (commit after verification in Task 3)

- [ ] 2. Trigger Employee and Verify Output Against Ground Truth

  **What to do**:

  This is an iterative task — trigger the employee, check the output, and if wrong, diagnose and fix. Max 3 iterations before escalating with full diagnostics.

  **Step A — Trigger the employee:**

  ```bash
  source .env
  curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
    -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
    -d '{"inputs":{"date":"2026-06-01"}}' | jq '{task_id: .task_id}'
  ```

  Save the task_id. NO Docker rebuild needed — execution_steps is read from DB at runtime.

  **Step B — Wait for completion:**
  Poll task status every 30 seconds:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -t -c "SELECT status FROM tasks WHERE id = '<task_id>';"
  ```

  Wait until status is `Done` or `Failed`. If `Failed`, read harness logs for the error.

  **Step C — Read the output:**
  The employee posts to Slack channel `C0B71QSMZKQ`. Read the output from the harness log:

  ```bash
  # Find the Slack message content in the harness log
  grep -A 100 "post-message" /tmp/employee-<prefix>.log | head -120
  ```

  Or read the Slack channel directly:

  ```bash
  source .env
  # Get latest messages from the cleaning schedule channel
  curl -s "https://slack.com/api/conversations.history" \
    -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
    -d "channel=C0B71QSMZKQ&limit=3" | jq '.messages[0].text'
  ```

  **Step D — Verify against ground truth:**

  Check each of these 6 conditions (ALL must pass):

  | #   | Check                   | Expected                                      |
  | --- | ----------------------- | --------------------------------------------- |
  | 1   | Total entry count       | Exactly 6                                     |
  | 2   | 3505 Banton entries     | 3 entries (Habitación 1, 2, 3) — city: Austin |
  | 3   | 4403 Hayride entry      | 1 entry — Unidad B                            |
  | 4   | 4405 Hayride entry      | 1 entry — Unidad A                            |
  | 5   | 7213 Nutria entry       | 1 entry — Habitación 4                        |
  | 6   | All assigned to Yessica | YES (Monday = weekday, all Austin)            |

  Also verify NEGATIVE checks (none of these should appear):
  - King Charles / 5306
  - Hayride Unidad C / 4403S
  - Nutria Habitación 2 / 7213-NUT-2
  - Nutria Habitación 3 / 7213-NUT-3
  - Nutria Casa / 7213-NUT-HOME
  - 271 Gina Dr

  **Step E — If verification fails:**
  Log exactly:
  1. Actual entry count (vs expected 6)
  2. Which false positives appeared (list them)
  3. Which expected properties were missing
  4. The specific execution_steps text that caused the error (read from harness log)

  Then go back to Task 1 and fix the execution_steps. Repeat max 3 times.

  **Step F — If verification passes:**
  Save evidence and proceed to Task 3.

  **Must NOT do**:
  - Do NOT declare success if entry count ≠ 6 (even if "close")
  - Do NOT modify shell tool code to fix issues
  - Do NOT post additional Slack messages to check output — read from logs or Slack API
  - Do NOT exceed 3 iterations without escalating with full diagnostics

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires iterative debugging, API verification, reading harness logs, and potentially re-fixing execution_steps
  - **Skills**: [`hostfully-api`]
    - `hostfully-api`: Needed to understand the Hostfully data model and verify checkout data if false positives reappear

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — depends on Task 1
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `/tmp/employee-f682de37.log` — Previous run's harness log (8118 lines) showing the wrong output for comparison
  - `src/workers/opencode-harness.mts` — How the harness reads execution_steps and runs the employee

  **API/Type References**:
  - `src/worker-tools/hostfully/get-reservations.ts` — The tool the employee calls, returns type/status/checkOut fields
  - `src/worker-tools/hostfully/get-property.ts:17-30` — formatAddress function that produces the address string

  **External References**:
  - Slack API: `https://api.slack.com/methods/conversations.history` — to read the posted output

  **Ground Truth (CRITICAL — the executor MUST have this)**:
  The following 6 properties are the ONLY valid June 1 checkouts. This was verified by scanning all 45 VLRE properties via the Hostfully API on May 31, 2026:
  1. `3505-BAN-1` (uid: `8daa2e85-8818-4055-9047-bd712c987026`) — Madison Seaberry, checkOut 2026-06-01T11:00:00, type=BOOKING, status=BOOKED
  2. `3505-BAN-2` (uid: `15347f7f-0022-4368-adb0-045bb80b9277`) — Malik Hall, checkOut 2026-06-01T11:00:00, type=BOOKING, status=BOOKED
  3. `3505-BAN-3` (uid: `bc30706d-3ea0-4d78-a6bd-68cdba655a76`) — Matthew Arce, checkOut 2026-06-01T11:00:00, type=BOOKING, status=BOOKED
  4. `4403B-HAY-HOME` (uid: `7b398b3c-7d6c-499c-b51d-0cb6e862ff1c`) — Matty Proctor, checkOut 2026-06-01T11:00:00, type=BOOKING, status=BOOKED
  5. `4405A-HAY-HOME` (uid: `5e5042d3-52a4-485a-b89e-680877bd26f5`) — Teresa Kimble, checkOut 2026-06-01T11:00:00, type=BOOKING, status=BOOKED
  6. `7213-NUT-4` (uid: `14f5b23d-8614-4595-a20c-2c783dc408bb`) — Hassan Sharif Qaisieh, checkOut 2026-06-01T11:00:00, type=BOOKING, status=BOOKED

  **Acceptance Criteria**:
  - [ ] Task reaches `Done` status
  - [ ] Output contains exactly 6 property entries
  - [ ] All 6 ground truth properties present with correct room identifiers
  - [ ] None of the 6 known false positives appear
  - [ ] All entries assigned to Yessica
  - [ ] 3505 Banton Rd shows Austin (not Kyle)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Happy path — correct 6-property output
    Tool: Bash (curl + psql + grep)
    Preconditions: Task 1 completed, services running (gateway on 7700, Inngest on 8288)
    Steps:
      1. Trigger: curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"inputs":{"date":"2026-06-01"}}'
      2. Wait for Done: poll status every 30s until Done or Failed
      3. Read output from Slack API: curl -s "https://slack.com/api/conversations.history" -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" -d "channel=C0B71QSMZKQ&limit=3"
      4. Count property entries in output (grep for bullet points with addresses)
      5. Check each of the 6 ground truth properties is present
      6. Check none of the 6 false positives appear
    Expected Result: 6 entries, all correct, no false positives
    Failure Indicators: Count ≠ 6, false positive present, wrong cleaner, wrong city
    Evidence: .sisyphus/evidence/task-2-output-verification.txt

  Scenario: Negative check — false positives excluded
    Tool: Bash (grep)
    Preconditions: Output captured from happy path scenario
    Steps:
      1. Search output for "King Charles" — must NOT appear
      2. Search output for "Unidad C" — must NOT appear
      3. Search output for "Habitación 2" — must NOT appear (only Hab 1, 3, 4 are valid)
      4. Search output for "Habitación 3" at Nutria Run — must NOT appear (Hab 3 at Banton is valid)
      5. Search output for "Casa" — must NOT appear
      6. Search output for "271 Gina" or "Gina Dr" — must NOT appear
    Expected Result: None of the false positive patterns found in output
    Failure Indicators: Any grep returns a match
    Evidence: .sisyphus/evidence/task-2-negative-check.txt
  ```

  **Commit**: NO (commit in Task 3)

- [ ] 3. Commit Changes

  **What to do**:
  After Task 2 passes verification, commit the seed.ts changes.

  ```bash
  git add prisma/seed.ts
  git commit -m "fix(cleaning-schedule): filter BOOKING-only leads and always show room identifiers
  ```

Fixes 4 bugs in execution_steps that caused false-positive properties:

- Require type=BOOKING (exclude INQUIRY/BLOCK/BOOKING_REQUEST)
- Require active status (exclude CLOSED/CANCELLED)
- Always show room/unit identifier (remove single-unit suppression)
- Add ZIP 78722 to Austin override"

  ```

  **Must NOT do**:
  - Do NOT use `--no-verify`
  - Do NOT add Co-authored-by lines
  - Do NOT reference AI tools in commit message

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple git commit of one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `prisma/seed.ts` — the only file to commit

  **Acceptance Criteria**:
  - [ ] `git status` shows clean working tree after commit
  - [ ] Commit message matches the format above

  **QA Scenarios (MANDATORY)**:
  ```

  Scenario: Verify clean commit
  Tool: Bash (git)
  Steps: 1. git log -1 --oneline (verify commit message) 2. git status (verify clean working tree)
  Expected Result: Commit present, no uncommitted changes
  Evidence: .sisyphus/evidence/task-3-commit.txt

  ```

  **Commit**: YES
  - Message: `fix(cleaning-schedule): filter BOOKING-only leads and always show room identifiers`
  - Files: `prisma/seed.ts`

  ```

- [ ] 4. Send Telegram Notification

  **What to do**:

  ```bash
  tsx scripts/telegram-notify.ts "✅ Cleaning schedule accuracy fix complete — output verified: 6 properties, all correct."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None
  - **Blocked By**: Task 3

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Notification sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "✅ Cleaning schedule accuracy fix complete — output verified: 6 properties, all correct."
    Expected Result: Exit code 0, notification delivered
    Evidence: .sisyphus/evidence/task-4-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> Not needed — Task 2 IS the verification. The employee output is directly verified against API ground truth.
> If Task 2 passes (6 correct entries), the work is done.

---

## Commit Strategy

- **After Task 2 passes**: `fix(cleaning-schedule): filter BOOKING-only leads and always show room identifiers` — `prisma/seed.ts`

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

# Count entries (must be 6)
grep -c "Habitación\|Unidad\|Casa" /tmp/employee-<prefix>.log
# Expected: 6

# Verify no false positives
grep -i "King Charles\|NUT-2\|NUT-3\|NUT-HOME\|Nutria Run.*Habitación 2\|Nutria Run.*Habitación 3\|Nutria Run.*Casa\|4403S\|Hayride.*Unidad C\|271 Gina" /tmp/employee-<prefix>.log
# Expected: No matches in output section
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Output matches ground truth table (6 entries, correct addresses, correct cleaner, correct room IDs)
