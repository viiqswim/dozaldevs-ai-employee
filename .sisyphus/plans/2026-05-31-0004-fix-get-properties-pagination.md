# Fix get-properties.ts Pagination Bug

## TL;DR

> **Quick Summary**: Fix a one-character pagination bug in `get-properties.ts` that causes the cleaning-schedule employee to see only 20 of 45 properties (page 1 only), then verify the employee produces a complete cleaning schedule for May 31, 2026 with all 8 expected checkouts.
>
> **Deliverables**:
>
> - Fixed `src/worker-tools/hostfully/get-properties.ts` (line 79: `cursor=` → `_cursor=`)
> - Verified cleaning-schedule employee output with all 8 May 31 checkouts in Slack
> - Updated `prisma/seed.ts` if execution_steps needed further tuning
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — sequential (fix → smoke test → trigger → verify)
> **Critical Path**: Task 1 → Task 2 → Task 3 → (conditional) Task 4

---

## Context

### Original Request

The cleaning-schedule AI employee was producing incorrect output — only showing 1 of 8 May 31 checkouts the user sees in the Hostfully dashboard. After 7 employee iterations and 11 instruction fixes, Run 7 produced correct output for the one visible property (HOV-3), but the other 7 checkouts were invisible due to a pagination bug.

### Investigation Summary

**Root cause**: `src/worker-tools/hostfully/get-properties.ts` line 79 uses `cursor=` as the pagination query parameter, but the Hostfully API requires `_cursor=` (with underscore prefix). This causes the API to ignore the cursor and return page 1 again. The tool's dedup logic detects repeated UIDs and stops — so it only ever returns 20 of 45 properties. 7 of the 8 May 31 checkouts are on pages 2 and 3, invisible to the employee.

**Audit**: `get-reservations.ts` (line 169) and `get-messages.ts` (line 315) already use `_cursor=` correctly. Only `get-properties.ts` has the bug.

### Metis Review

**Identified Gaps** (addressed):

- Docker rebuild concern: Confirmed bind-mount in local Docker mode — NO rebuild needed. Fix takes effect on next task run.
- Model check: Plan includes pre-trigger DB query to verify model is `deepseek/deepseek-v4-flash`.
- Execution_steps adequacy: Deferred — only modify if post-fix run still fails. The 11 prior iterations may already handle checkout-date filtering correctly.

---

## Work Objectives

### Core Objective

Fix the pagination bug so the employee can see all 45 properties, enabling it to find all 8 May 31 checkouts and produce a correct cleaning schedule.

### Concrete Deliverables

- `src/worker-tools/hostfully/get-properties.ts` with `_cursor=` on line 79
- Slack message in `#ops-cleaning-schedule` (C0B71QSMZKQ) containing all 8 expected checkouts

### Definition of Done

- [ ] `get-properties.ts` smoke test returns 45 properties (not 20)
- [ ] Employee task reaches `Done` status
- [ ] Slack output lists all 8 checkout properties for May 31

### Must Have

- Fix `cursor=` → `_cursor=` on line 79
- Pre-trigger model verification (must be `deepseek/deepseek-v4-flash`)
- Slack output verification via API (not manual check)

### Must NOT Have (Guardrails)

- Do NOT touch `get-reservations.ts` or `get-messages.ts` — already correct
- Do NOT rebuild Docker image — bind-mount makes fix live immediately
- Do NOT modify `execution_steps` preemptively — only if post-fix run still fails
- Do NOT update mock fixtures
- Do NOT add unit tests (user decision: skip)
- Do NOT change the loop termination logic (lines 95–104) — it is correct

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None (user decision: skip — 63 pre-existing failures)
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run tool directly, compare output count
- **API/Backend**: Use Bash (curl) — trigger employee, check Slack output via API
- **DB verification**: Use Bash (psql) — check task status, model config

---

## Execution Strategy

### Sequential Execution (3–4 tasks)

```
Task 1: Fix pagination bug + smoke test [quick]
   ↓
Task 2: Verify model + trigger employee + wait for Done [quick]
   ↓
Task 3: Verify Slack output contains all 8 checkouts [quick]
   ↓
(Conditional) Task 4: Tune execution_steps if output still incomplete [deep]
   ↓
Task 5: Commit all changes [quick]
   ↓
Task 6: Notify completion via Telegram [quick]

Critical Path: Task 1 → Task 2 → Task 3 → Task 5 → Task 6
Conditional: Task 4 only if Task 3 fails (output incomplete)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 2      |
| 2    | 1          | 3      |
| 3    | 2          | 4 or 5 |
| 4    | 3 (fail)   | 5      |
| 5    | 3 or 4     | 6      |
| 6    | 5          | —      |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 1 task — T2 → `quick`
- **Wave 3**: 1 task — T3 → `quick`
- **Wave 4** (conditional): 1 task — T4 → `deep`
- **Wave 5**: 2 tasks — T5 → `quick`, T6 → `quick`

---

## TODOs

- [x] 1. Fix pagination cursor parameter in get-properties.ts

  **What to do**:
  - Open `src/worker-tools/hostfully/get-properties.ts`
  - On line 79, change `&cursor=` to `&_cursor=` (add underscore prefix)
  - The exact change: `cursor=${encodeURIComponent(cursor)}` → `_cursor=${encodeURIComponent(cursor)}`
  - Smoke test the fix by running the tool directly with the real Hostfully API

  **Must NOT do**:
  - Do NOT change any other line in the file
  - Do NOT touch `get-reservations.ts` or `get-messages.ts`
  - Do NOT modify the loop termination logic (lines 95–104)
  - Do NOT rebuild Docker image

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-character change in one file with a clear smoke test
  - **Skills**: []
    - No skills needed for a one-line fix

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 1
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-reservations.ts:169` — Correct `_cursor=` usage pattern (this file already does it right)
  - `src/worker-tools/hostfully/get-messages.ts:315` — Another correct `_cursor=` usage

  **API/Type References**:
  - `src/worker-tools/hostfully/get-properties.ts:77-104` — The pagination loop with the bug at line 79

  **WHY Each Reference Matters**:
  - `get-reservations.ts:169` — Shows the exact correct pattern: `&_cursor=${encodeURIComponent(cursor)}`. Copy this pattern.
  - `get-properties.ts:77-104` — The full loop context. Line 79 is the bug. Lines 95–104 are the dedup/break logic — leave untouched.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Smoke test — tool returns all 45 properties after fix
    Tool: Bash
    Preconditions: Hostfully API credentials available (API key: Y6EQ7KgSwoOGCokD, Agency UID: 942d08d9-82bb-4fd3-9091-ca0c6b50b578)
    Steps:
      1. Run: HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD HOSTFULLY_AGENCY_UID=942d08d9-82bb-4fd3-9091-ca0c6b50b578 tsx src/worker-tools/hostfully/get-properties.ts 2>/dev/null | jq 'length'
      2. Assert output is exactly `45`
      3. Run the same command piping to `jq '.[].name'` and verify properties from all 3 pages appear:
         - Page 1 property: `1602-BLU-HOME`
         - Page 2 property: `6002-PAL-HOME`
         - Page 3 property: `8039-CHE-HOME`
    Expected Result: Tool returns 45 properties. Properties from pages 1, 2, and 3 are all present.
    Failure Indicators: Count is 20 (bug not fixed), count is 0 (API error), missing page 2/3 properties
    Evidence: .sisyphus/evidence/task-1-properties-count.txt

  Scenario: Pre-fix baseline (run BEFORE applying the fix)
    Tool: Bash
    Preconditions: File still has `cursor=` (not `_cursor=`)
    Steps:
      1. Run: HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD HOSTFULLY_AGENCY_UID=942d08d9-82bb-4fd3-9091-ca0c6b50b578 tsx src/worker-tools/hostfully/get-properties.ts 2>/dev/null | jq 'length'
      2. Assert output is exactly `20` (confirms bug is present before fix)
    Expected Result: 20 properties (only page 1)
    Failure Indicators: If already 45, the bug was already fixed
    Evidence: .sisyphus/evidence/task-1-properties-baseline.txt
  ```

  **Commit**: YES
  - Message: `fix(hostfully): correct pagination cursor param in get-properties`
  - Files: `src/worker-tools/hostfully/get-properties.ts`
  - Pre-commit: N/A (no tests)

- [ ] 2. Verify model configuration and trigger cleaning-schedule employee

  **What to do**:
  - Query the database to verify the cleaning-schedule archetype uses `deepseek/deepseek-v4-flash`
  - If the model is NOT `deepseek/deepseek-v4-flash`, update it via psql
  - Trigger the cleaning-schedule employee for May 31, 2026 via admin API
  - Poll task status until it reaches `Done` (or `Failed`)
  - If task fails, capture container logs for diagnosis

  **Must NOT do**:
  - Do NOT modify any source files
  - Do NOT rebuild Docker image
  - Do NOT change execution_steps at this stage

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: DB query + API trigger + polling — no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 2
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - AGENTS.md § "Recommended Test Employee" — Trigger pattern with curl
  - AGENTS.md § "Task Debugging Quick Reference" — Status polling pattern

  **API/Type References**:
  - Archetype ID: `00000000-0000-0000-0000-000000000019`
  - Tenant ID: `00000000-0000-0000-0000-000000000003` (VLRE)
  - Slack channel: `C0B71QSMZKQ`
  - Trigger endpoint: `POST /admin/tenants/:tenantId/employees/cleaning-schedule/trigger`

  **WHY Each Reference Matters**:
  - The archetype ID is needed for the model verification query
  - The trigger endpoint and payload format (`{"inputs":{"date":"2026-05-31"}}`) are needed to start the employee
  - The task debugging patterns show how to poll status and capture logs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Model is deepseek/deepseek-v4-flash
    Tool: Bash (psql)
    Preconditions: Database accessible at localhost:54322
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000019';"
      2. Assert output contains `deepseek/deepseek-v4-flash`
      3. If NOT, run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash', updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000019';"
    Expected Result: Model is `deepseek/deepseek-v4-flash`
    Evidence: .sisyphus/evidence/task-2-model-check.txt

  Scenario: Trigger employee and reach Done
    Tool: Bash (curl + psql)
    Preconditions: Gateway running at localhost:7700, ADMIN_API_KEY set in .env
    Steps:
      1. Source .env: source /Users/victordozal/repos/dozal-devs/ai-employee/.env
      2. Trigger: curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"inputs": {"date": "2026-05-31"}}' | jq '{task_id: .task_id}'
      3. Capture TASK_ID from response
      4. Poll every 30 seconds: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
      5. Wait until status is `Done` or `Failed` (timeout: 10 minutes)
      6. If `Failed`: capture logs via `grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30`
    Expected Result: Task status reaches `Done` within 10 minutes
    Failure Indicators: Status `Failed`, task stuck in `Executing` for >10 min, container not found
    Evidence: .sisyphus/evidence/task-2-trigger-result.txt
  ```

  **Commit**: NO

- [ ] 3. Verify Slack output contains all 8 expected checkouts

  **What to do**:
  - Use the Slack API to fetch the employee's output message from channel C0B71QSMZKQ
  - Check that the message text contains all 8 expected checkout property names
  - If all 8 are present, the fix is complete — proceed to commit
  - If some are missing, document which ones and proceed to Task 4

  **Must NOT do**:
  - Do NOT manually check Slack UI — use the API
  - Do NOT modify any files at this stage

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single API call + text assertion
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 3
  - **Blocks**: Task 4 (conditional) or Task 5
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - AGENTS.md § "Task Debugging Quick Reference" — Slack thread verification pattern with `conversations.replies`

  **API/Type References**:
  - Slack channel: `C0B71QSMZKQ`
  - Env var for token: `VLRE_SLACK_BOT_TOKEN`
  - Task metadata field: `metadata->>'notify_slack_ts'` — the timestamp of the notification message

  **WHY Each Reference Matters**:
  - The Slack API pattern from AGENTS.md shows exactly how to fetch thread replies and extract message text
  - The `notify_slack_ts` is needed to find the correct thread

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Slack output contains all 8 expected checkout properties
    Tool: Bash (curl + psql)
    Preconditions: Task from Task 2 reached `Done`, VLRE_SLACK_BOT_TOKEN set in .env
    Steps:
      1. Source .env
      2. Get notify_slack_ts: NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';")
      3. Fetch thread replies: curl -s "https://slack.com/api/conversations.replies" -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" -d "channel=C0B71QSMZKQ&ts=$NOTIFY_TS&limit=20" | jq -r '.messages[] | .text'
      4. Assert ALL 8 of these property names appear in the output text:
         - 3420-HOV-3
         - 4403S-HAY-HOME
         - 7213-NUT-3
         - 5306A-KIN-Home (or 5306A-KIN)
         - 7213-NUT-5
         - 7213-NUT-2
         - 4403A-HAY-HOME
         - 6002-PAL-HOME
      5. Save full Slack output text to evidence file
    Expected Result: All 8 property names appear in at least one message in the thread
    Failure Indicators: Fewer than 8 properties listed, wrong property names, empty thread, API error
    Evidence: .sisyphus/evidence/task-3-slack-output.txt

  Scenario: No hallucinated properties in output
    Tool: Bash
    Preconditions: Slack output captured from happy path scenario
    Steps:
      1. Review the Slack output for property names NOT in the expected list
      2. Specifically check for known prior hallucinations: 3412-SAN-HOME, 271-GIN-HOME, 219-PAU-HOME, HOV-Casa, HOV-Hab1/2/3
      3. Any extra property listed that is NOT checking out on May 31 is a failure
    Expected Result: Only the 8 expected checkout properties appear (plus any same-day check-ins noted separately for billing)
    Failure Indicators: Prior hallucinated properties reappear, properties from page 1 that don't have May 31 checkouts are listed
    Evidence: .sisyphus/evidence/task-3-hallucination-check.txt
  ```

  **Commit**: NO

- [x] 4. (CONDITIONAL) Tune execution_steps if output is incomplete

  **What to do**:
  - **ONLY execute this task if Task 3 failed** (output missing some of the 8 checkouts or containing hallucinated data)
  - Diagnose why the output is wrong:
    - Read current `execution_steps` from DB
    - Check container logs for the failed run
    - Identify if the issue is: (a) checkout-vs-checkin date filtering, (b) missing zone/cleaner assignments for new properties, (c) missing rate lookup for new properties, (d) other
  - Apply targeted execution_steps fix to the DB
  - Re-trigger the employee and verify again (repeat Task 2 + Task 3 flow)
  - Once output is correct, sync the DB version back to `prisma/seed.ts`

  **Must NOT do**:
  - Do NOT rewrite execution_steps from scratch — make targeted fixes only
  - Do NOT change the one-line fix from Task 1
  - Do NOT add mock fixtures

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires reading logs, understanding employee behavior, iterating on instructions
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers archetype fields including `execution_steps`, how to update them, and best practices

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 4 (conditional)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3 (only if Task 3 fails)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3525-3665` — Current execution_steps CREATE block
  - `prisma/seed.ts:3700-3840` — Current execution_steps UPDATE block

  **API/Type References**:
  - Archetype ID: `00000000-0000-0000-0000-000000000019`

  **External References**:
  - `src/worker-tools/notion/fixtures/get-page/reporte-financiero.json` — Cleaning rates per property
  - `src/worker-tools/notion/fixtures/get-page/directorio-operativo.json` — Property directory with zones
  - `src/worker-tools/notion/fixtures/get-page/manual-personal.json` — Team/cleaner assignments

  **WHY Each Reference Matters**:
  - The seed.ts blocks show the current execution_steps content and where to sync changes
  - The Notion fixtures contain the ground-truth rates and zone assignments the employee should reference
  - The archetype ID is needed for DB updates

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Re-triggered employee produces correct output after execution_steps fix
    Tool: Bash (curl + psql)
    Preconditions: execution_steps updated in DB, previous task failure diagnosed
    Steps:
      1. Trigger employee again with same payload: {"inputs": {"date": "2026-05-31"}}
      2. Wait for Done status
      3. Fetch Slack output via conversations.replies
      4. Assert all 8 expected property names appear
      5. Assert no hallucinated properties
    Expected Result: All 8 checkouts listed correctly with proper cleaners and rates
    Failure Indicators: Still missing properties, wrong rates, wrong cleaner assignments
    Evidence: .sisyphus/evidence/task-4-retry-output.txt

  Scenario: Seed.ts synced with DB version
    Tool: Bash (diff)
    Preconditions: execution_steps correct in DB, seed.ts still has old version
    Steps:
      1. Extract execution_steps from DB to /tmp/steps-db.txt
      2. Extract execution_steps from seed.ts to /tmp/steps-seed.txt
      3. Diff the two — they must match
    Expected Result: DB and seed.ts execution_steps are identical
    Failure Indicators: Content differs between DB and seed.ts
    Evidence: .sisyphus/evidence/task-4-seed-sync.txt
  ```

  **Commit**: YES
  - Message: `fix(cleaning-schedule): update execution_steps for full property coverage`
  - Files: `prisma/seed.ts`
  - Pre-commit: N/A

- [ ] 5. Commit all changes

  **What to do**:
  - Stage and commit the `get-properties.ts` fix (if not already committed in Task 1)
  - If Task 4 was executed, commit the `prisma/seed.ts` changes
  - Ensure git status is clean

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 5
  - **Blocks**: Task 6
  - **Blocked By**: Task 3 or Task 4

  **Commit**: YES (this IS the commit task)
  - Message 1: `fix(hostfully): correct pagination cursor param in get-properties`
  - Files 1: `src/worker-tools/hostfully/get-properties.ts`
  - Message 2 (conditional): `fix(cleaning-schedule): update execution_steps for full property coverage`
  - Files 2: `prisma/seed.ts`

- [ ] 6. Notify completion via Telegram

  **What to do**:
  - Send Telegram notification that the pagination fix is complete and the cleaning schedule is verified
  - Command: `tsx scripts/telegram-notify.ts "✅ Cleaning schedule pagination fix complete — all 8 May 31 checkouts verified in Slack output."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 5
  - **Blocks**: None
  - **Blocked By**: Task 5

  **Commit**: NO

---

## Final Verification Wave

> This plan's tasks ARE the verification (fix + trigger + verify output). No separate review wave needed — the acceptance criteria in Task 3 directly verify correctness. Task 5 (commit) serves as the final step.

---

## Commit Strategy

- **1**: `fix(hostfully): correct pagination cursor param in get-properties` — `src/worker-tools/hostfully/get-properties.ts`
- **2** (conditional): `fix(cleaning-schedule): update execution_steps for full property coverage` — `prisma/seed.ts` + DB update

---

## Success Criteria

### Verification Commands

```bash
# Tool returns all 45 properties
source .env && HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD HOSTFULLY_AGENCY_UID=942d08d9-82bb-4fd3-9091-ca0c6b50b578 tsx src/worker-tools/hostfully/get-properties.ts 2>/dev/null | jq 'length'
# Expected: 45

# Task reached Done
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT status FROM tasks WHERE id = '<TASK_ID>';"
# Expected: Done

# Slack output contains all 8 checkout properties
# (verified via curl to Slack conversations.replies API)
```

### Final Checklist

- [ ] `get-properties.ts` returns 45 properties (not 20)
- [ ] Employee task reaches Done
- [ ] Slack output lists: 3420-HOV-3, 4403S-HAY-HOME, 7213-NUT-3, 5306A-KIN-Home, 7213-NUT-5, 7213-NUT-2, 4403A-HAY-HOME, 6002-PAL-HOME
- [ ] All changes committed
