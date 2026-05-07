# Fix get-messages.ts Missing Property/Reservation Data

## TL;DR

> **Quick Summary**: `get-messages.ts` fetches lead data from the Hostfully API (which includes `propertyUid`, `checkInLocalDateTime`, `checkOutLocalDateTime`, `status`) but drops all of it when building the output. The AI model can't look up property details or reservation dates because the output doesn't include the property_uid needed for subsequent API calls.
>
> **Deliverables**:
>
> - Enriched `get-messages.ts` output with `propertyUid`, `checkIn`, `checkOut`, `leadStatus`
> - Updated mock fixture, tests, and AGENTS.md
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (3 small changes + verify)
> **Critical Path**: Fix source → Update fixture → Update tests → Build + test

---

## Context

### Original Request

The guest-messaging AI employee produced a broken response for Olivia's "Do you have a pool?" message: `Property: Unknown (property lookup failed)`, `Check-in: N/A`, `Check-out: N/A`, `Booking Channel: Unknown`. Despite having access to `$PROPERTY_UID` env var and `get-property.ts` / `get-reservations.ts` tools, the model couldn't gather property context.

### Root Cause

The archetype instructions (Step 2) say: "**Use the property_id from the message output**" to call `get-property.ts` and `get-reservations.ts`. But `get-messages.ts` output (`ThreadSummary`) only contains:

```json
{ "reservationId": "uuid", "guestName": "Olivia", "channel": "AIRBNB", "unresponded": true, "messages": [...] }
```

There is **no `propertyUid`** in the output. The Hostfully API response for the lead DOES contain `propertyUid`, `checkInLocalDateTime`, `checkOutLocalDateTime` — but `get-messages.ts` discards them when building `ThreadSummary`.

The model (minimax-m2.7) isn't smart enough to fall back to the `$PROPERTY_UID` env var when the instructions explicitly say "from the message output."

### Secondary Issue

Even if the model had the property_uid, `get-reservations.ts` defaults to `checkInFrom=today`, so CLOSED leads (past check-out) wouldn't appear. Including check-in/check-out directly in the get-messages output eliminates this dependency.

---

## Work Objectives

### Core Objective

Enrich `get-messages.ts` output to include `propertyUid`, `checkIn`, `checkOut`, and `leadStatus` from the lead data that's already being fetched from the Hostfully API.

### Concrete Deliverables

- `src/worker-tools/hostfully/get-messages.ts` — expanded `RawLead` type, expanded `ThreadSummary` type and output
- `src/worker-tools/hostfully/fixtures/get-messages/default.json` — updated mock fixture
- `tests/worker-tools/hostfully/get-messages-lead-id.test.ts` — updated assertions for new fields
- `tests/worker-tools/hostfully/get-messages.test.ts` — updated assertions for new fields
- `AGENTS.md` — updated output shape documentation

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run tests/worker-tools/hostfully/get-messages` — all tests pass
- [ ] `pnpm test -- --run tests/worker-tools/hostfully/get-messages-lead-id` — all tests pass

### Must Have

- `propertyUid` field in ThreadSummary output (both `--lead-id` and `--property-id` paths)
- `checkIn` field in ThreadSummary (from `lead.checkInLocalDateTime`)
- `checkOut` field in ThreadSummary (from `lead.checkOutLocalDateTime`)
- `leadStatus` field in ThreadSummary (from `lead.status`)
- Updated mock fixture with new fields
- Updated tests asserting new fields exist
- Updated AGENTS.md output shape documentation

### Must NOT Have (Guardrails)

- Do NOT change the archetype instructions in the DB — that requires a separate seed migration
- Do NOT rename existing fields (`reservationId`, `guestName`, `channel`, `unresponded`, `messages`)
- Do NOT modify `get-property.ts`, `get-reservations.ts`, or any other tool
- Do NOT modify the lifecycle (`employee-lifecycle.ts`) or harness
- Do NOT modify `src/gateway/routes/hostfully.ts`
- Do NOT add unnecessary comments or JSDoc beyond what exists

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — update existing tests)
- **Framework**: vitest

### QA Policy

Every task includes agent-executed QA scenarios.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — all changes are interdependent):
├── Task 1: Expand get-messages.ts types and output [quick]
├── Task 2: Update mock fixture default.json [quick]
├── Task 3: Update test assertions [quick]
├── Task 4: Update AGENTS.md output docs [quick]
└── Task 5: Build + test verification [quick]

Wave FINAL (After ALL tasks):
└── Commit all changes

Critical Path: Task 1 → Task 2 → Task 3 → Task 5
```

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1-T4 → `quick`, T5 → `quick`

---

## TODOs

- [x] 1. Expand get-messages.ts types and output

  **What to do**:

  **File**: `src/worker-tools/hostfully/get-messages.ts`
  1. Add `checkInLocalDateTime` and `checkOutLocalDateTime` to the `RawLead` type (lines 30-40):

     ```typescript
     type RawLead = {
       uid: string;
       propertyUid?: string;
       type?: string;
       status?: string;
       channel?: string;
       checkInLocalDateTime?: string | null;
       checkOutLocalDateTime?: string | null;
       guestInformation?: {
         firstName?: string | null;
         lastName?: string | null;
       };
     };
     ```

  2. Add `propertyUid`, `checkIn`, `checkOut`, `leadStatus` to the `ThreadSummary` type (lines 64-70):

     ```typescript
     type ThreadSummary = {
       reservationId: string;
       propertyUid: string | null;
       guestName: string | null;
       channel: string | null;
       checkIn: string | null;
       checkOut: string | null;
       leadStatus: string | null;
       unresponded: boolean;
       messages: MessageSummary[];
     };
     ```

  3. Update the **single-lead path** (`--lead-id`, around line 242-248) to include new fields:

     ```typescript
     threads.push({
       reservationId: lead.uid,
       propertyUid: lead.propertyUid ?? null,
       guestName: formatGuestName(lead.guestInformation),
       channel: lead.channel ?? null,
       checkIn: lead.checkInLocalDateTime ?? null,
       checkOut: lead.checkOutLocalDateTime ?? null,
       leadStatus: lead.status ?? null,
       unresponded,
       messages,
     });
     ```

  4. Update the **multi-lead path** (`--property-id` / agency-wide, around line 336-342) identically:

     ```typescript
     threads.push({
       reservationId: lead.uid,
       propertyUid: lead.propertyUid ?? null,
       guestName: formatGuestName(lead.guestInformation),
       channel: lead.channel ?? null,
       checkIn: lead.checkInLocalDateTime ?? null,
       checkOut: lead.checkOutLocalDateTime ?? null,
       leadStatus: lead.status ?? null,
       unresponded,
       messages,
     });
     ```

  5. Update the help text output shape (around line 134-147) to include the new fields in the JSON example.

  **Must NOT do**:
  - Do NOT rename `reservationId` to `leadUid` — keep backward compat
  - Do NOT change message-level types or filtering logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, sequential
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts:30-40` — `RawLead` type to expand
  - `src/worker-tools/hostfully/get-messages.ts:64-70` — `ThreadSummary` type to expand
  - `src/worker-tools/hostfully/get-messages.ts:242-248` — Single-lead path output construction
  - `src/worker-tools/hostfully/get-messages.ts:336-342` — Multi-lead path output construction
  - `src/worker-tools/hostfully/get-messages.ts:134-147` — Help text output shape to update

  **API/Type References**:
  - `src/worker-tools/hostfully/get-reservations.ts:23-37` — `RawLead` type in get-reservations.ts already includes `checkInLocalDateTime`/`checkOutLocalDateTime` — follow same field names

  **WHY Each Reference Matters**:
  - The RawLead type in get-reservations.ts proves the Hostfully API sends these fields — we just need to parse them in get-messages.ts too

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build passes with expanded types
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Verify exit code is 0
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-1-build-check.txt
  ```

  **Commit**: YES (groups with 2, 3, 4)
  - Message: `fix(hostfully): include propertyUid, checkIn/checkOut, leadStatus in get-messages output`
  - Files: `src/worker-tools/hostfully/get-messages.ts`

---

- [x] 2. Update mock fixture default.json

  **What to do**:

  **File**: `src/worker-tools/hostfully/fixtures/get-messages/default.json`

  Update the fixture to include the new fields. Current content:

  ```json
  [
    {
      "reservationId": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
      "guestName": "Test Guest",
      "channel": "AIRBNB",
      "unresponded": true,
      "messages": [...]
    }
  ]
  ```

  Add the new fields:

  ```json
  [
    {
      "reservationId": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
      "propertyUid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2",
      "guestName": "Test Guest",
      "channel": "AIRBNB",
      "checkIn": "2026-05-01T15:00:00",
      "checkOut": "2026-05-05T11:00:00",
      "leadStatus": "BOOKED",
      "unresponded": true,
      "messages": [...]
    }
  ]
  ```

  **Must NOT do**:
  - Do NOT change existing field values (reservationId, guestName, channel, messages)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1

  **References**:
  - `src/worker-tools/hostfully/fixtures/get-messages/default.json` — current fixture to update

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Fixture is valid JSON with new fields
    Tool: Bash
    Steps:
      1. Run: node -e "const d=require('./src/worker-tools/hostfully/fixtures/get-messages/default.json'); console.log('propertyUid:', d[0].propertyUid); console.log('checkIn:', d[0].checkIn); console.log('checkOut:', d[0].checkOut); console.log('leadStatus:', d[0].leadStatus)"
      2. Verify all four fields are non-null
    Expected Result: All four new fields printed with values
    Evidence: .sisyphus/evidence/task-2-fixture-check.txt
  ```

  **Commit**: YES (groups with 1, 3, 4)

---

- [x] 3. Update test assertions for new fields

  **What to do**:

  **File 1**: `tests/worker-tools/hostfully/get-messages-lead-id.test.ts`
  1. Add `checkInLocalDateTime` and `checkOutLocalDateTime` to the test mock lead objects (`LEAD_WITH_MESSAGES` at line 24, `LEAD_NO_MESSAGES` at line 33, `LEAD_RESPONDED` at line 42):

     ```typescript
     const LEAD_WITH_MESSAGES = {
       uid: 'lead-abc',
       propertyUid: 'prop-1',
       type: 'BOOKING',
       status: 'BOOKED',
       channel: 'AIRBNB',
       checkInLocalDateTime: '2026-04-25T15:00:00',
       checkOutLocalDateTime: '2026-04-28T11:00:00',
       guestInformation: { firstName: 'Maria', lastName: 'Garcia' },
     };
     ```

     Same pattern for `LEAD_NO_MESSAGES` and `LEAD_RESPONDED`. The `lead-limit-test` mock (line 134-141) should also include these fields.

  2. Update the "output shape has all required ThreadSummary fields" test (line 212-225) to assert new fields:
     ```typescript
     expect(thread).toHaveProperty('propertyUid', 'prop-1');
     expect(thread).toHaveProperty('checkIn', '2026-04-25T15:00:00');
     expect(thread).toHaveProperty('checkOut', '2026-04-28T11:00:00');
     expect(thread).toHaveProperty('leadStatus', 'BOOKED');
     ```

  **File 2**: `tests/worker-tools/hostfully/get-messages.test.ts`
  1. Add `checkInLocalDateTime` and `checkOutLocalDateTime` to the `VALID_LEADS` mock data (line 24-49). Each lead already has `propertyUid` and `status`.

  2. Find tests that assert ThreadSummary shape and add assertions for new fields.

  **Must NOT do**:
  - Do NOT delete or rename existing test cases
  - Do NOT change the mock server endpoint logic (just add fields to mock responses)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1

  **References**:
  - `tests/worker-tools/hostfully/get-messages-lead-id.test.ts:24-49` — Mock lead data to expand
  - `tests/worker-tools/hostfully/get-messages-lead-id.test.ts:212-225` — Shape assertion test to update
  - `tests/worker-tools/hostfully/get-messages.test.ts:24-49` — Mock lead data to expand

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: All get-messages tests pass with new fields
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/hostfully/get-messages-lead-id.test.ts
      2. Run: pnpm test -- --run tests/worker-tools/hostfully/get-messages.test.ts
      3. Run: pnpm test -- --run tests/worker-tools/hostfully/get-messages-sender.test.ts
    Expected Result: All tests pass (0 failures)
    Evidence: .sisyphus/evidence/task-3-test-results.txt
  ```

  **Commit**: YES (groups with 1, 2, 4)

---

- [x] 4. Update AGENTS.md output documentation

  **What to do**:

  **File**: `AGENTS.md`

  Find the Shell tools section for Hostfully, specifically the `get-messages.ts` documentation. Search for the output shape description and add the new fields. The AGENTS.md currently lists `get-messages.ts` usage and may reference its output shape.

  Also update any documentation about the `ThreadSummary` shape if it appears.

  **Must NOT do**:
  - Do NOT change any sections unrelated to get-messages.ts output

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 3)
  - **Blocked By**: Task 1

  **References**:
  - `AGENTS.md` — search for `get-messages` or `ThreadSummary` or `reservationId`

  **Acceptance Criteria**:

  ```
  Scenario: AGENTS.md mentions new fields
    Tool: Bash
    Steps:
      1. Run: grep -c "propertyUid" AGENTS.md
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-4-agents-md-check.txt
  ```

  **Commit**: YES (groups with 1, 2, 3)

---

- [x] 5. Build + test full verification

  **What to do**:

  Run the full build and all related tests to verify no regressions.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: Tasks 1-4

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Full build passes
    Tool: Bash
    Steps:
      1. Run: pnpm build
    Expected Result: Exit code 0, no TypeScript errors
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: All Hostfully get-messages tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/hostfully/
    Expected Result: All tests pass (0 failures across all 3 test files)
    Evidence: .sisyphus/evidence/task-5-tests.txt
  ```

  **Commit**: YES
  - Message: `fix(hostfully): include propertyUid, checkIn/checkOut, leadStatus in get-messages output`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `src/worker-tools/hostfully/fixtures/get-messages/default.json`, `tests/worker-tools/hostfully/get-messages-lead-id.test.ts`, `tests/worker-tools/hostfully/get-messages.test.ts`, `AGENTS.md`
  - Pre-commit: `pnpm build && pnpm test -- --run tests/worker-tools/hostfully/`

---

## Final Verification Wave

> After all tasks — verify everything works together.

- [x] F1. **Build + full test suite** — Run `pnpm build` and `pnpm test -- --run tests/worker-tools/hostfully/` — ALL must pass.

---

## Commit Strategy

- **Single commit**: `fix(hostfully): include propertyUid, checkIn/checkOut, leadStatus in get-messages output` — all 5 files in one commit

---

## Success Criteria

### Verification Commands

```bash
pnpm build                                                          # Expected: exit 0
pnpm test -- --run tests/worker-tools/hostfully/get-messages        # Expected: all pass
pnpm test -- --run tests/worker-tools/hostfully/get-messages-lead-id # Expected: all pass
```

### Final Checklist

- [ ] `propertyUid` present in ThreadSummary output (both code paths)
- [ ] `checkIn` / `checkOut` present in ThreadSummary output
- [ ] `leadStatus` present in ThreadSummary output
- [ ] Mock fixture updated with new fields
- [ ] Tests assert new fields exist
- [ ] AGENTS.md updated
- [ ] All tests pass
- [ ] Build passes
