# Code-Rotation Damage Recovery — Restore Guest Door Codes

## TL;DR

> **Quick Summary**: A rogue code-rotation AI employee changed door codes for VLRE Hostfully properties. Guests at active properties have codes that no longer match the locks. This plan discovers all affected properties, identifies which have active reservations (checked in or starting today), extracts the correct codes from guest message threads, and restores them in both Hostfully and Sifely locks.
>
> **Deliverables**:
>
> - All active-guest properties restored with correct door codes in both Hostfully and Sifely
> - `/tmp/recovery-log.json` with per-property audit trail
> - Slack summary posted to `C0960S2Q8RL` with recovery results
>
> **Estimated Effort**: Medium (1-2 hours autonomous execution)
> **Parallel Execution**: YES — 5 waves (with user checkpoint after discovery)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (STOP for user) → Task 6 → Task 7

---

## Context

### Original Request

A rogue AI code-rotation employee changed door codes for ALL VLRE Hostfully properties. Guests are currently staying at 15+ properties with old codes that no longer work. Need to restore old codes urgently so guests can access their properties.

### Interview Summary

**Key Discussions**:

- Recovery priority: Restore OLD codes (not communicate new codes to guests)
- Execution mode: Fully autonomous AI agent
- Tooling: ai-employee shell tools only (vlre-hub service not available)
- Only care about reservations active today or starting today — nothing else
- User does not know the rogue task ID or timestamp — must discover from DB

**Research Findings**:

- Hostfully agency has many properties (dynamically discovered via `get-properties.ts`), each with 1+ Sifely locks
- Front door locks are SHARED across room listings (e.g., lock `4831824` has 4 room passcodes)
- Passcode naming convention: `permanent-visitor-home`, `permanent-visitor-room-N`, `permanent-visitor-bundle`
- `deliverables.content` in DB contains JSON output from each code-rotation run: `{rotated, failed, properties:[{propertyId, newCode, status}]}`
- `diagnose-access.ts` cross-references Hostfully door_code vs Sifely passcodes
- `hostfully-door-code.ts` reads the current door_code (read-only)
- `update-door-code.ts` returns `previousCode` in output
- get-reservations.ts filters by check-IN date only — need wide window + client-side filter for active guests
- No application-level backup of pre-rotation codes outside the DB

### Metis Review

**Identified Gaps** (addressed):

- Source of truth for old codes — guest message threads are the primary source; DB prior-task codes are supplementary audit data
- Shared lock deduplication — plan deduplicates by lock_id before Sifely updates
- Atomic Hostfully+Sifely updates — plan treats both as a pair, reverts on partial failure
- Checkpoint/resume — plan checkpoints to `/tmp/recovery-state.json` after each property
- Scoped to active-today reservations only — no other properties processed
- Env var extraction — plan specifies admin API trigger path (lifecycle injects tenant secrets)
- Post-rogue-run manual interventions — plan checks for host messages after rogue timestamp before restoring

---

## Work Objectives

### Core Objective

Restore pre-rotation door codes for all VLRE properties affected by the rogue code-rotation run, prioritizing properties with active guests.

### Concrete Deliverables

- All active-guest properties restored with correct codes in both Hostfully and Sifely
- Recovery audit log at `/tmp/recovery-log.json`
- Recovery state checkpoint at `/tmp/recovery-state.json`
- Discovery report presented to user at checkpoint (Task 5) for review before restoration
- Final verification report presented to user in conversation (Task 7)

### Definition of Done

- [ ] Every property in the rogue task's `deliverables.content` has an entry in `/tmp/recovery-log.json`
- [ ] All active-guest properties show `status: "success"` in recovery log
- [ ] `diagnose-access.ts` confirms Hostfully + Sifely codes match for restored properties
- [ ] Final report presented to user in conversation

### Must Have

- Restore pre-rotation codes for properties with reservations active today or starting today
- Per-property audit logging (old code, new code, Hostfully result, Sifely result)
- Checkpoint/resume capability (recovery-state.json)
- Guest message threads as primary source of truth for correct codes
- Shared lock deduplication (update each physical lock exactly once per code)
- Report presented to user after discovery phase — user decides whether to proceed with restoration

### Must NOT Have (Guardrails)

- **MUST NOT** trigger a new code-rotation employee run
- **MUST NOT** use `generate-code.ts` — this is a restore, not a rotation
- **MUST NOT** delete any Sifely passcode without a confirmed replacement active
- **MUST NOT** leave a property in a split state (Hostfully updated but Sifely not, or vice versa)
- **MUST NOT** process properties without active-today reservations — they are out of scope
- **MUST NOT** enter an infinite verify-fix loop — verify once per property, log result, move on
- **MUST NOT** assume the "old code" from a prior DB task matches what the guest was told — verify against message thread for active guests when possible
- **MUST NOT** override a code if a PM has already manually sent a new code to a guest after the rogue run
- **MUST NOT** process all 38 properties blindly — scope to properties listed in the rogue task's `deliverables.content`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: N/A — this is an operational recovery, not a code change
- **Automated tests**: None — operational task
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios using Bash (curl, jq, tsx).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB queries**: Use `curl` against PostgREST (`$SUPABASE_URL`) with `$SUPABASE_SECRET_KEY`
- **Hostfully**: Use `tsx` shell tools (`hostfully-door-code.ts`, `diagnose-access.ts`)
- **Sifely**: Use `tsx` shell tools (`sifely-client.ts --action list-passcodes`)
- **Slack**: Use `tsx` shell tool (`post-message.ts`)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — discovery & audit):
├── Task 1: Query DB for rogue task + prior tasks [deep]
├── Task 2: Enumerate ALL properties + identify active-today reservations [deep]
└── Task 3: Read current Hostfully door codes for active-today properties [deep]

Wave 2 (After Wave 1 — code determination):
└── Task 4: Extract correct codes from guest message threads [deep]

*** CHECKPOINT: Task 5 presents report to user. Plan STOPS here until user reviews. ***

Wave 3 (After user review — restoration):
└── Task 5: Present discovery report to user and STOP [quick]

Wave 4 (After user approves — restoration):
└── Task 6: Restore codes for active-today properties [deep]

Wave 5 (After restoration — verification):
└── Task 7: Verify restoration and report results to user [deep]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Recovery verification (unspecified-high)
└── Task F3: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 4      | 1    |
| 2    | —          | 3, 4   | 1    |
| 3    | 2          | 4      | 1    |
| 4    | 1, 2, 3    | 5      | 2    |
| 5    | 4          | 6      | 3    |
| 6    | 5 (user)   | 7      | 4    |
| 7    | 6          | —      | 5    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `deep`, T3 → `deep`
- **Wave 2**: 1 task — T4 → `deep`
- **Wave 3**: 1 task — T5 → `quick` (STOP — user checkpoint)
- **Wave 4**: 1 task — T6 → `deep` (after user approval)
- **Wave 5**: 1 task — T7 → `deep`
- **FINAL**: 3 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `deep`

---

## TODOs

- [ ] 1. Query DB for rogue code-rotation task and all prior runs

  **What to do**:
  - Query the `tasks` table via PostgREST for ALL code-rotation tasks: `GET $SUPABASE_URL/tasks?archetype_id=eq.00000000-0000-0000-0000-000000000016&tenant_id=eq.00000000-0000-0000-0000-000000000003&order=created_at.desc`
  - Use `apikey` header with `$SUPABASE_SECRET_KEY` (this is the service role key, gives full access)
  - For each task found, also query `deliverables`: `GET $SUPABASE_URL/deliverables?select=content,metadata,created_at,status&execution_id=eq.<execution_id>&order=created_at.desc`
  - First, get the execution_id: `GET $SUPABASE_URL/executions?task_id=eq.<task_id>&order=created_at.desc&limit=1`
  - Identify: (a) the MOST RECENT task = the rogue task, (b) the SECOND MOST RECENT task = the source of old/correct codes
  - Parse `deliverables.content` (it's a text field containing JSON) — extract `{rotated, failed, properties:[{propertyId, newCode, status}]}`
  - Save to `/tmp/rogue-task-audit.json`: `{rogueTask: {id, createdAt, properties: [{propertyId, newCode}]}, priorTask: {id, createdAt, properties: [{propertyId, newCode}]} | null}`
  - If NO prior task exists, record `priorTask: null` — Task 4 will fall back to message thread extraction
  - Log the rogue task's timestamp — this is critical for Task 4 to filter out post-rogue manual interventions

  **Must NOT do**:
  - Do NOT modify any tasks in the DB
  - Do NOT trigger any new code-rotation runs
  - Do NOT assume deliverables.content is well-formed — wrap JSON.parse in try/catch

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful DB querying, JSON parsing, conditional logic, and output structuring
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant — this is pure DB querying via curl

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/lib/postgrest-client.ts` — PostgREST query patterns, auth headers
  - `src/inngest/employee-lifecycle.ts` — how deliverables are created (search for `deliverables` insert)

  **API/Type References**:
  - PostgREST URL: `$SUPABASE_URL` (e.g., `http://localhost:54331`)
  - Auth header: `apikey: $SUPABASE_SECRET_KEY` and `Authorization: Bearer $SUPABASE_SECRET_KEY`
  - Tables: `tasks` (id, archetype_id, tenant_id, status, created_at), `executions` (id, task_id), `deliverables` (execution_id, content, status)

  **External References**:
  - PostgREST filtering docs: `https://postgrest.org/en/stable/references/api/tables_views.html`

  **WHY Each Reference Matters**:
  - `postgrest-client.ts` — shows the exact header format needed for PostgREST queries (apikey + Authorization)
  - `employee-lifecycle.ts` — shows how deliverables.content is populated from `/tmp/summary.txt` output

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rogue task identified with deliverables
    Tool: Bash (curl + jq)
    Preconditions: PostgREST running at $SUPABASE_URL, $SUPABASE_SECRET_KEY set
    Steps:
      1. curl "$SUPABASE_URL/tasks?archetype_id=eq.00000000-0000-0000-0000-000000000016&order=created_at.desc&limit=5" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0].id'
      2. Verify the response is a non-empty array with at least 1 task
      3. cat /tmp/rogue-task-audit.json | jq '.rogueTask.id' — must be a valid UUID
      4. cat /tmp/rogue-task-audit.json | jq '.rogueTask.properties | length' — must be > 0
    Expected Result: /tmp/rogue-task-audit.json exists with rogueTask containing properties array, each with propertyId and newCode
    Failure Indicators: Empty tasks array (no code-rotation tasks exist), null deliverables.content, JSON parse error
    Evidence: .sisyphus/evidence/task-1-rogue-task-audit.json

  Scenario: No prior task exists (edge case)
    Tool: Bash (jq)
    Preconditions: /tmp/rogue-task-audit.json exists
    Steps:
      1. cat /tmp/rogue-task-audit.json | jq '.priorTask'
      2. If null, confirm this is logged as a warning — Task 4 will need fallback strategy
    Expected Result: Either a valid priorTask object with properties, or null (handled gracefully)
    Evidence: .sisyphus/evidence/task-1-prior-task-check.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-rogue-task-audit.json` — copy of `/tmp/rogue-task-audit.json`
  - [ ] `.sisyphus/evidence/task-1-prior-task-check.txt` — confirmation of prior task presence/absence

  **Commit**: NO

- [ ] 2. Enumerate ALL Hostfully properties and identify active-today reservations

  **What to do**:
  - Run `tsx src/worker-tools/hostfully/get-properties.ts` to list ALL properties in the Hostfully agency (requires `HOSTFULLY_API_KEY` and `HOSTFULLY_AGENCY_UID` env vars). Do NOT assume a fixed count — there are more than 38.
  - **Env vars**: Since this plan runs as a fully autonomous agent via the lifecycle, env vars (`HOSTFULLY_API_KEY`, `HOSTFULLY_AGENCY_UID`, `SIFELY_USERNAME`, `SIFELY_PASSWORD`, `SIFELY_CLIENT_ID`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TENANT_ID`) will be injected by the lifecycle from tenant_secrets. The agent can use them directly.
  - For EACH property, run `tsx src/worker-tools/hostfully/get-reservations.ts --property-id <uid> --status confirmed --from 2026-04-13 --to 2026-05-13`
  - Client-side filter results: keep ONLY reservations where the stay is **active today** — meaning `checkIn <= "2026-05-13" AND checkOut >= "2026-05-13"`. This captures both guests currently checked in and guests checking in today.
  - Discard all properties with no active-today reservation — they are out of scope for this recovery.
  - Save to `/tmp/active-today-properties.json`: array of `{propertyId, propertyName, reservations: [{guestName, leadUid, checkIn, checkOut, status, channel}]}`
  - Also save `/tmp/all-properties.json` with the full property list for reference

  **Must NOT do**:
  - Do NOT create or modify any reservations
  - Do NOT send any messages to guests
  - Do NOT include properties without active-today reservations in the output

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must iterate over all properties dynamically, handle API pagination, and apply date filtering
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-properties.ts` — CLI for listing ALL agency properties
  - `src/worker-tools/hostfully/get-reservations.ts` — CLI for per-property reservations with date/status filters

  **API/Type References**:
  - Properties output: `[{uid, name, city, state, bedrooms, maxGuests, isActive}]`
  - Reservations output: `[{uid, propertyUid, guestName, checkIn, checkOut, channel, numberOfGuests, status}]`
  - `--status confirmed` maps to: `BOOKED`, `BOOKED_BY_AGENT`, `BOOKED_BY_CUSTOMER`, `BOOKED_EXTERNALLY`, `STAY`

  **WHY Each Reference Matters**:
  - `get-properties.ts` — discovers ALL properties dynamically (count is not hardcoded)
  - `get-reservations.ts` — `--from`/`--to` filter on check-IN date only, so we use a 30-day lookback and client-side filter for active-today

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Active-today properties identified
    Tool: Bash (jq)
    Preconditions: /tmp/active-today-properties.json exists
    Steps:
      1. cat /tmp/active-today-properties.json | jq 'length' — must be > 0
      2. cat /tmp/active-today-properties.json | jq '.[].reservations[] | select(.checkIn > "2026-05-13" or .checkOut < "2026-05-13")' — must be empty (all reservations are active today)
      3. cat /tmp/all-properties.json | jq 'length' — total property count for reference
    Expected Result: Only properties with active-today reservations are included. Every reservation has checkIn <= today AND checkOut >= today.
    Failure Indicators: Empty array (no active properties), properties with future-only reservations included
    Evidence: .sisyphus/evidence/task-2-active-today-properties.json
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-active-today-properties.json` — copy of `/tmp/active-today-properties.json`

  **Commit**: NO

- [ ] 3. Read current Hostfully door codes for active-today properties

  **What to do**:
  - Load `/tmp/active-today-properties.json` from Task 2
  - For EACH active-today property only, run `tsx src/worker-tools/locks/hostfully-door-code.ts --property-id <propertyUid>`
  - Collect results into `/tmp/current-door-codes.json`: array of `{propertyId, propertyName, currentDoorCode: string | null}`
  - Add a 500ms delay between API calls to avoid rate limiting
  - Log any properties where `doorCode` is null

  **Must NOT do**:
  - Do NOT modify any Hostfully data — this is read-only
  - Do NOT use `update-door-code.ts` in this task
  - Do NOT query properties that are not in `/tmp/active-today-properties.json`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must iterate over active properties with rate limiting and handle null cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/worker-tools/locks/hostfully-door-code.ts` — read-only door code fetcher

  **WHY Each Reference Matters**:
  - `hostfully-door-code.ts` — reads `door_code` from Hostfully custom data field (the value the rogue run set)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Door codes captured for active-today properties
    Tool: Bash (jq)
    Preconditions: /tmp/current-door-codes.json and /tmp/active-today-properties.json exist
    Steps:
      1. cat /tmp/current-door-codes.json | jq 'length' — must match active-today count
      2. cat /tmp/current-door-codes.json | jq '[.[] | select(.currentDoorCode != null)] | length' — most should have a code
      3. cat /tmp/current-door-codes.json | jq '[.[] | select(.currentDoorCode == null)]' — log any nulls
    Expected Result: One entry per active-today property with currentDoorCode
    Failure Indicators: Count mismatch with active-today list, API errors, all nulls
    Evidence: .sisyphus/evidence/task-3-current-door-codes.json
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-current-door-codes.json` — copy of `/tmp/current-door-codes.json`

  **Commit**: NO

- [ ] 4. Extract correct (pre-rotation) codes from guest message threads

  **What to do**:
  - Load `/tmp/rogue-task-audit.json` (from Task 1), `/tmp/active-today-properties.json` (from Task 2), `/tmp/current-door-codes.json` (from Task 3)
  - **Guest message threads are the PRIMARY source of truth for the correct codes.**
  - For each active-today property:
    - Get the active reservation's `leadUid` from `/tmp/active-today-properties.json`
    - Run `tsx src/worker-tools/hostfully/get-messages.ts --lead-id <leadUid>`
    - Search message bodies for 4-6 digit numeric codes (regex: `\b\d{4,6}\b`)
    - Look for the MOST RECENT message from the host (`senderType=AGENCY`) that contains a code — this is the check-in instructions with the door code the guest was given
    - If no code found in messages, flag this property as `needsManualReview: true`
  - **CROSS-REFERENCE with DB audit** (supplementary, not primary):
    - If a prior code-rotation task exists in `/tmp/rogue-task-audit.json` (`priorTask !== null`), compare the prior task's `newCode` for each property against the code found in messages
    - If they match, high confidence. If they differ, trust the message thread (that's what the guest has)
    - If no code was found in messages but a prior task code exists, use the prior task code as a fallback and flag `codeSource: "prior-task-fallback"`
  - **POST-ROGUE INTERVENTION CHECK**:
    - For each property, check if any host message was sent AFTER the rogue task's timestamp (`rogueTask.createdAt`)
    - If a post-rogue host message contains a numeric code, this property was likely manually fixed — flag as `manuallyFixed: true, skipRestore: true`
  - Save final output to `/tmp/code-restoration-plan.json`: array of `{propertyId, propertyName, currentCode (rogue), targetCode (to restore), codeSource: "message-thread"|"prior-task-fallback"|"unknown", skipRestore: boolean, needsManualReview: boolean, manuallyFixed: boolean, reservations: [{guestName, leadUid}], messageExcerpt: string (the relevant message snippet for user review)}`
  - Properties with `skipRestore: true` or `needsManualReview: true` are excluded from automated restoration

  **Must NOT do**:
  - Do NOT modify any property codes — this task is analysis only
  - Do NOT send any messages to guests
  - Do NOT scan more than 20 messages per lead (avoid infinite scrolling)
  - Do NOT use codes found in GUEST messages (only HOST/AGENCY messages)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Message parsing, cross-referencing multiple data sources, safety checks for manual interventions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — must complete before Task 5)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts` — CLI for fetching message threads per lead
  - Output format: `[{leadUid, threadUid, propertyUid, guestName, channel, messages: [{body, senderType, sentAt}]}]`

  **WHY Each Reference Matters**:
  - `get-messages.ts` — the PRIMARY source of truth for door codes. Messages from `senderType: "AGENCY"` contain the check-in instructions with the actual door code the guest was given.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Restoration plan generated from message threads
    Tool: Bash (jq)
    Preconditions: /tmp/code-restoration-plan.json exists
    Steps:
      1. cat /tmp/code-restoration-plan.json | jq 'length' — must match active-today property count
      2. cat /tmp/code-restoration-plan.json | jq '[.[] | select(.targetCode != null and .skipRestore == false)] | length' — count of properties to restore
      3. cat /tmp/code-restoration-plan.json | jq '[.[] | select(.codeSource == "message-thread")] | length' — most should come from messages
      4. cat /tmp/code-restoration-plan.json | jq '[.[] | select(.needsManualReview == true)]' — log properties where no code was found
    Expected Result: Every active-today property has an entry. Most have a targetCode from message threads. Properties without codes are flagged for manual review.
    Failure Indicators: All targetCodes null, no message-thread sources
    Evidence: .sisyphus/evidence/task-4-restoration-plan.json
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-4-restoration-plan.json` — copy of `/tmp/code-restoration-plan.json`

  **Commit**: NO

- [ ] 5. Present discovery report to user and STOP

  **What to do**:
  - Load `/tmp/code-restoration-plan.json` (from Task 4), `/tmp/active-today-properties.json` (from Task 2), `/tmp/current-door-codes.json` (from Task 3), `/tmp/rogue-task-audit.json` (from Task 1)
  - **Generate a clear report** for the user covering:
    1. **Rogue task info**: Task ID, when it ran, how many properties it changed
    2. **Active-today properties found**: Count and list with guest names, check-in/check-out dates
    3. **Per-property comparison table**:
       | Property | Guest | Check-in | Check-out | Code Sent to Guest | Current Hostfully Code | Match? |
       |----------|-------|----------|-----------|-------------------|----------------------|--------|
    4. **Properties needing manual review**: Where no code was found in messages
    5. **Properties already manually fixed**: Where a PM sent a new code post-rogue
    6. **Recommended actions**: Which properties need restoration and with what code
  - Save report to `/tmp/discovery-report.txt`
  - **Present the report to the user in the conversation and STOP execution.**
  - **Do NOT proceed to Task 6 until the user explicitly approves.**

  **Must NOT do**:
  - Do NOT restore any codes — this is a report only
  - Do NOT post to Slack or send Telegram
  - Do NOT proceed to Task 6 automatically

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Data aggregation and formatting only — no API calls
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (checkpoint)
  - **Blocks**: Task 6 (blocked until user approves)
  - **Blocked By**: Task 4

  **References**:
  - All `/tmp/*.json` files from Tasks 1-4

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Discovery report presented to user
    Tool: Bash (cat)
    Preconditions: /tmp/discovery-report.txt exists
    Steps:
      1. cat /tmp/discovery-report.txt — should contain per-property comparison table
      2. Verify it includes all active-today properties
      3. Verify code-sent-to-guest column is populated for most properties
    Expected Result: Clear, readable report presented to user in conversation. Plan execution paused.
    Failure Indicators: Empty report, missing properties, report not shown to user
    Evidence: .sisyphus/evidence/task-5-discovery-report.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-5-discovery-report.txt` — copy of `/tmp/discovery-report.txt`

  **Commit**: NO

- [ ] 6. Restore codes for active-today properties

  **What to do**:
  - **ONLY proceed after user has reviewed Task 5 report and explicitly approved.**
  - Load `/tmp/code-restoration-plan.json` (from Task 4)
  - Load the property-to-lock mapping from the `property_locks` table via PostgREST: `GET $SUPABASE_URL/property_locks?tenant_id=eq.00000000-0000-0000-0000-000000000003`
  - Also reference `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/data/properties.json` for the complete lock mapping (lock IDs, lock names)
  - Filter to properties where `skipRestore === false` and `targetCode !== null`
  - **DEDUPLICATION**: Build a lock-level plan before executing. Multiple properties may share the same front door lock (e.g., rooms 271-GIN-1 through 271-GIN-4 share lock `4831824`). For shared locks:
    - Each room has its OWN passcode on the shared lock (e.g., `permanent-visitor-room-1`, `permanent-visitor-room-2`)
    - Each room's passcode should be restored to THAT ROOM's target code (not all rooms get the same code)
    - List passcodes on the lock ONCE, then update each named passcode individually
  - **FOR EACH PROPERTY**:
    1. **Read current state**: Run `tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id <lockId>` for each lock associated with this property
    2. **Find the target passcode**: Match by `keyboardPwdName` — look for `permanent-visitor-home`, `permanent-visitor-room-N`, or `permanent-visitor-bundle` depending on property type
    3. **Update Hostfully FIRST**: Run `tsx src/worker-tools/locks/update-door-code.ts --property-id <propertyId> --code <targetCode>`
    4. **Verify Hostfully**: Run `tsx src/worker-tools/locks/hostfully-door-code.ts --property-id <propertyId>` — confirm door code matches target
    5. **Update Sifely**: Run `tsx src/worker-tools/locks/sifely-client.ts --action update-passcode --lock-id <lockId> --passcode-id <keyboardPwdId> --code <targetCode>` for EACH lock on this property
    6. **Verify Sifely**: Run `tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id <lockId>` — confirm the named passcode has the target code
    7. **ROLLBACK on failure**: If Sifely update fails after Hostfully was updated, revert Hostfully to the rogue code: `tsx src/worker-tools/locks/update-door-code.ts --property-id <propertyId> --code <rogueCode>` — do NOT leave split state
    8. **Checkpoint**: Append result to `/tmp/recovery-state.json` and `/tmp/recovery-log.json`
  - Add 1-second delay between properties to avoid API rate limiting
  - `/tmp/recovery-log.json` entry per property: `{propertyId, propertyName, targetCode, previousCode, hostfullyResult: "success"|"failed", sifelyResults: [{lockId, lockName, result: "success"|"failed"|"passcode-not-found"}], overallStatus: "success"|"failed"|"partial", timestamp}`

  **Must NOT do**:
  - Do NOT use `generate-code.ts` — only restore known codes
  - Do NOT delete any passcodes
  - Do NOT create new passcodes — only update existing ones
  - Do NOT leave any property in a split state (Hostfully ≠ Sifely)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-step per-property workflow with rollback logic, shared lock deduplication, API rate limiting, and checkpoint/resume
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run sequentially — shared lock safety)
  - **Parallel Group**: Wave 4 (after user approval of Task 5 report)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5 (user approval)

  **References**:

  **Pattern References**:
  - `src/worker-tools/locks/sifely-client.ts` — CLI for list-passcodes and update-passcode
  - `src/worker-tools/locks/update-door-code.ts` — CLI for updating Hostfully door_code (returns previousCode)
  - `src/worker-tools/locks/hostfully-door-code.ts` — CLI for reading current door_code
  - `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/data/properties.json` — complete lock mapping

  **API/Type References**:
  - Sifely list-passcodes output: `[{keyboardPwdId, lockId, keyboardPwd, keyboardPwdName, keyboardPwdType, startDate, endDate, status}]`
  - `keyboardPwdType === 2` = PERMANENT passcode (the only type to touch)
  - Passcode naming: `permanent-visitor-home`, `permanent-visitor-room-N`, `permanent-visitor-bundle`
  - `property_locks` table: `{property_external_id, lock_external_id, lock_name, property_type, property_name, passcode_name}`

  **WHY Each Reference Matters**:
  - `sifely-client.ts` — `--action update-passcode --lock-id <id> --passcode-id <id> --code <digits>` is the exact command to restore a passcode
  - `update-door-code.ts` — returns `{previousCode, newCode}` so we can verify the update and use previousCode for rollback
  - `properties.json` — maps property UIDs to exact lock IDs and lock names, essential for finding the right lock for each property

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Property successfully restored
    Tool: Bash (tsx + jq)
    Preconditions: At least one property processed
    Steps:
      1. Pick first property from /tmp/recovery-log.json
      2. tsx src/worker-tools/locks/hostfully-door-code.ts --property-id <propertyId> — doorCode should equal targetCode
      3. tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id <lockId> | jq '.[] | select(.keyboardPwdName == "permanent-visitor-home")' — keyboardPwd should equal targetCode
      4. cat /tmp/recovery-log.json | jq '.[] | select(.propertyId == "<propertyId>") | .overallStatus' — should be "success"
    Expected Result: Hostfully and Sifely both show the target (pre-rotation) code. Recovery log shows success.
    Failure Indicators: Codes don't match, split state detected, recovery log shows "failed"
    Evidence: .sisyphus/evidence/task-6-property-restore.json

  Scenario: No split states
    Tool: Bash (jq)
    Preconditions: /tmp/recovery-log.json exists
    Steps:
      1. cat /tmp/recovery-log.json | jq '[.[] | select(.overallStatus == "partial")]' — should be empty
    Expected Result: No properties in partial/split state
    Evidence: .sisyphus/evidence/task-6-no-split-states.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-6-property-restore.json` — sample verification
  - [ ] `.sisyphus/evidence/task-6-no-split-states.txt` — confirmation no split states
  - [ ] `.sisyphus/evidence/task-6-recovery-log.json` — copy of `/tmp/recovery-log.json`

  **Commit**: NO

- [ ] 7. Verify restoration and report results to user

  **What to do**:
  - Load `/tmp/recovery-log.json` (from Task 6)
  - **Verification pass**: For each property marked `overallStatus: "success"`:
    - Run `tsx src/worker-tools/locks/hostfully-door-code.ts --property-id <propertyId>` + `tsx src/worker-tools/locks/sifely-client.ts --action list-passcodes --lock-id <lockId>` and compare
    - Confirm Hostfully door_code matches the target code AND Sifely passcode matches
    - If mismatch detected: log as `verificationFailed` but do NOT re-attempt restoration (no fix loop)
  - **Generate final report** — save to `/tmp/summary.txt` and present to user HERE in the conversation:

    ```
    ## Code Rotation Recovery Report — 2026-05-13

    **Total properties processed**: N
    **Successful restorations**: N
    **Failed restorations**: N
    **Skipped (manually fixed)**: N
    **Needs manual review**: N
    **Verification passed**: N/N

    ### Per-property results:
    | Property | Guest | Restored Code | Hostfully | Sifely | Status |
    |----------|-------|---------------|-----------|--------|--------|
    | [name]   | [guest] | [code]      | ✓         | ✓      | ✓      |
    ```

  - **Report to user in this conversation only** — no Slack, no Telegram

  **Must NOT do**:
  - Do NOT re-attempt restoration for verification failures
  - Do NOT enter a verify-fix loop
  - Do NOT post to Slack
  - Do NOT send Telegram notifications

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must run verification across all properties, generate formatted report
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `src/worker-tools/locks/hostfully-door-code.ts` — read current Hostfully door_code
  - `src/worker-tools/locks/sifely-client.ts` — list current Sifely passcodes

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Final report generated and presented
    Tool: Bash (cat)
    Preconditions: /tmp/summary.txt exists
    Steps:
      1. cat /tmp/summary.txt — should contain "Code Rotation Recovery Report"
      2. Verify it includes per-property results table
      3. Verify report was presented to user in conversation
    Expected Result: Human-readable report with per-property verification status
    Failure Indicators: Empty report, missing properties
    Evidence: .sisyphus/evidence/task-7-summary.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-7-summary.txt` — copy of `/tmp/summary.txt`

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation evidence exists (recovery-log.json entries, diagnose-access.ts outputs). For each "Must NOT Have": search logs and state for forbidden patterns (generate-code.ts calls, split states, non-active properties processed before active ones). Check evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Recovery Verification** — `unspecified-high`
      Run `hostfully-door-code.ts` + `sifely-client.ts --action list-passcodes` on a random sample of 5 active-today properties. Verify Hostfully door_code matches Sifely passcode for each. Check `/tmp/recovery-log.json` has entries for ALL active-today properties. Verify `/tmp/summary.txt` exists with complete results.
      Output: `Sample check [N/5 match] | Log completeness [N/N] | Summary exists [YES/NO] | VERDICT`

- [ ] F3. **Scope Fidelity Check** — `deep`
      Verify: only properties from the rogue task's `deliverables.content` were touched. No new code-rotation tasks were triggered. No passcodes were deleted. No `generate-code.ts` calls were made. No properties left in split state (Hostfully ≠ Sifely).
      Output: `Properties touched [N/N correct] | No rogue triggers [YES/NO] | No deletions [YES/NO] | No split states [YES/NO] | VERDICT`

---

## Commit Strategy

No commits — this is an operational recovery plan, not a code change. All outputs are runtime artifacts (`/tmp/` files) and Slack messages.

---

## Success Criteria

### Verification Commands

```bash
# Check recovery log completeness
node -e "const log=require('/tmp/recovery-log.json'); const s=log.filter(p=>p.overallStatus==='success').length; const f=log.filter(p=>p.overallStatus==='failed').length; const k=log.filter(p=>p.overallStatus==='skipped').length; console.log('Success:', s, 'Failed:', f, 'Skipped:', k, 'Total:', log.length)"

# Spot-check a random active-today property
tsx src/worker-tools/locks/hostfully-door-code.ts --property-id <PROPERTY_ID>
```

### Final Checklist

- [ ] All active-today properties restored (status: success in recovery log)
- [ ] No properties in split state (Hostfully ≠ Sifely)
- [ ] Recovery log has entry for every active-today property
- [ ] Final report presented to user in conversation
