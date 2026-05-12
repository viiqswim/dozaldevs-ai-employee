# Fix Guest Name Source — Unwrap Hostfully Lead API Response

## TL;DR

> **Quick Summary**: The Hostfully `GET /leads/{uid}` API returns a wrapped response `{ "lead": { ... } }` but both `get-messages.ts` and `hostfully-enrichment.ts` cast it directly to `RawLead` without unwrapping. This makes `guestInformation` undefined, so the model falls back to the Airbnb anonymized display name ("c.e. Wilson") instead of the real name ("Olivia"). Fix: unwrap the response using the same `rawJson.lead ?? rawJson` pattern already used for properties.
>
> **Deliverables**:
>
> - Fixed `get-messages.ts` with lead response unwrapping (single-lead path only)
> - Fixed `hostfully-enrichment.ts` with lead response unwrapping
> - New test cases covering the wrapped response format in both test files
> - E2E verification showing "Olivia" in Slack approval card
>
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → F1–F4 → user okay

---

## Context

### Original Request

User discovered during E2E testing that the Slack approval card shows "c.e. Wilson" instead of "Olivia" for a test Airbnb guest. After extensive API research (REST endpoints, GraphQL introspection, live curl tests), the root cause was identified: the Hostfully API wraps single-lead responses in `{ "lead": {...} }` but the code casts the wrapper directly to the lead type.

### Interview Summary

**Key Discussions**:

- Previous plan `fix-guest-message-scoping` is fully committed (3 commits, all 11 tasks done)
- User asked for thorough Hostfully API research before committing to a fix — we tested REST (messages, threads, leads, guests) and GraphQL (introspection, schema, live queries)
- `senderDetails.senderName` does NOT exist on the v3.2 API — the original plan approach was invalid
- Root cause confirmed via live `node -e` test: `Top-level keys: [ 'lead' ]` — response is wrapped
- After unwrapping: `Lead firstName: Olivia`, confirming the data is correct in Hostfully

**Research Findings**:

- Hostfully v3.2 wraps single-resource responses: `{ "lead": {...} }`, `{ "property": {...} }`
- `hostfully-enrichment.ts` already handles property unwrapping (lines 74-78: `propertyJson.property ?? propertyJson`) but NOT lead unwrapping
- The list endpoint (`GET /leads?...`) returns `{ "leads": [...] }` and is already handled correctly
- GraphQL returns the same data; no advantage over REST for this use case
- DB evidence: `pending_approvals.guest_name = "c.e. Wilson"`, `deliverables.metadata.guest_name = "c.e. Wilson"` — both from the model's output which received `guestName: null` from `get-messages.ts`

### Metis Review

**Identified Gaps** (addressed):

- Existing test mocks serve unwrapped responses — they'll still pass after the fix (backward-compatible via `?? rawJson` fallback), but NEW wrapped-response test cases are mandatory for regression coverage
- `get-reservations.ts` only uses the list endpoint — confirmed not affected
- Multi-lead path in `get-messages.ts` (line 310+) uses the list endpoint — also not affected
- Two separate deployment paths: `get-messages.ts` requires Docker rebuild; `hostfully-enrichment.ts` takes effect on gateway auto-restart
- Type cast must use a wrapper type or inline `as { lead?: RawLead }` — not just `as RawLead`

---

## Work Objectives

### Core Objective

Unwrap the Hostfully `GET /leads/{uid}` API response in both `get-messages.ts` (worker tool) and `hostfully-enrichment.ts` (lifecycle enrichment) so that `guestInformation.firstName` is correctly extracted instead of being `undefined`.

### Concrete Deliverables

- `src/worker-tools/hostfully/get-messages.ts` — line 247: unwrap lead response
- `src/lib/hostfully-enrichment.ts` — line 56: unwrap lead response
- `tests/worker-tools/hostfully/get-messages-lead-id.test.ts` — 1 new test case for wrapped response
- `tests/lib/hostfully-enrichment.test.ts` — 1 new test case for wrapped response
- E2E evidence showing "Olivia" in Slack approval card and `pending_approvals.guest_name`

### Definition of Done

- [ ] `pnpm test -- --run` passes with no new failures
- [ ] Slack approval card shows "Olivia" (not "c.e.") after E2E test
- [ ] `pending_approvals.guest_name` = "Olivia" in DB for the E2E test task
- [ ] Docker image rebuilt and verified

### Must Have

- Response unwrapping in `get-messages.ts` line 247: `const rawJson = await leadRes.json() as { lead?: RawLead }; const lead = rawJson.lead ?? (rawJson as RawLead);`
- Response unwrapping in `hostfully-enrichment.ts` line 56: same pattern with `RawLeadResponse`
- New test case in `get-messages-lead-id.test.ts` mocking wrapped `{ lead: {...} }` response, asserting correct `guestName`
- New test case in `hostfully-enrichment.test.ts` mocking wrapped `{ lead: {...} }` response, asserting correct `guestName`
- Docker image rebuild after `get-messages.ts` change

### Must NOT Have (Guardrails)

- **Do NOT** add new CLI flags to `get-messages.ts`
- **Do NOT** change the `ThreadSummary` type shape — `guestName: string | null` stays as-is
- **Do NOT** modify `formatGuestName()` — it works correctly once given the right input
- **Do NOT** touch `employee-lifecycle.ts` or `guest-message-poll.ts`
- **Do NOT** touch `get-reservations.ts` — it uses the list endpoint only, not affected
- **Do NOT** modify the multi-lead path in `get-messages.ts` (lines 310+) — it uses the list endpoint which is already correctly handled
- **Do NOT** modify the output JSON shape of `get-messages.ts`
- **Do NOT** use any model other than `minimax/minimax-m2.7` or `anthropic/claude-haiku-4-5`
- **Do NOT** break existing tests — the `?? rawJson` fallback ensures backward compatibility

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — adding new test cases to existing files)
- **Framework**: vitest (via `pnpm test`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run the tool directly, parse JSON output, assert fields
- **Tests**: Use Bash — `pnpm test -- --run <path>` and assert exit 0
- **E2E/UI**: Use Playwright — navigate to Slack, find approval card, assert guest name text
- **DB verification**: Use Bash — psql query against `pending_approvals` table

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — code fixes + tests, ALL parallel):
├── Task 1: Fix get-messages.ts — unwrap lead response + add wrapped-response test [quick]
├── Task 2: Fix hostfully-enrichment.ts — unwrap lead response + add wrapped-response test [quick]
└── Task 3: Commit all changes [quick]

Note: Task 1 and Task 2 touch completely independent files — fully parallel.
Task 3 depends on Tasks 1 and 2 completing.

Wave 2 (After Wave 1 — build + E2E):
├── Task 4: Run full test suite + rebuild Docker image [quick]
└── Task 5: E2E Scenario A — verify "Olivia" in Slack approval card + DB [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 5 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential (Wave 1 tasks run in parallel)
Max Concurrent: 4 (F1+F2+F3+F4)
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 3, 4   | 1     |
| 2     | —          | 3, 4   | 1     |
| 3     | 1, 2       | 4      | 1     |
| 4     | 3          | 5      | 2     |
| 5     | 4          | F1–F4  | 2     |
| F1–F4 | 5          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick` (parallel with T2), T2 → `quick` (parallel with T1), T3 → `quick` (after T1+T2)
- **Wave 2**: **2 tasks** — T4 → `quick`, T5 → `deep`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix `get-messages.ts` — Unwrap lead API response + add wrapped-response test

  **What to do**:
  - In `src/worker-tools/hostfully/get-messages.ts`, at line 247, change:
    ```typescript
    const lead = (await leadRes.json()) as RawLead;
    ```
    to:
    ```typescript
    const leadJson = (await leadRes.json()) as { lead?: RawLead };
    const lead = leadJson.lead ?? (leadJson as unknown as RawLead);
    ```
  - This follows the exact same pattern already used for properties in `hostfully-enrichment.ts` lines 74-78: `const property = propertyJson.property ?? propertyJson;`
  - ONLY the single-lead path (line 247) needs this fix. The multi-lead path (line 310+) uses the list endpoint which returns `{ leads: [...] }` and is already correctly handled at line 323 via `json.leads ?? []`.
  - Add a new test case to `tests/worker-tools/hostfully/get-messages-lead-id.test.ts` that mocks the lead API returning the **wrapped** format: `{ lead: { uid: 'lead-abc', guestInformation: { firstName: 'Maria', lastName: 'Garcia' }, propertyUid: 'prop-xyz' } }`. Assert that the output `guestName` equals `'Maria Garcia'`. Follow the existing test pattern in the file — add a new `it()` block in the appropriate `describe` block.

  **Must NOT do**:
  - Do NOT modify `formatGuestName()` — it works correctly once given the right input
  - Do NOT change the `ThreadSummary` type — `guestName: string | null` stays as-is
  - Do NOT modify the multi-lead path (lines 310+) — it uses the list endpoint
  - Do NOT add CLI flags or change the output JSON shape
  - Do NOT modify existing tests — only ADD a new test case

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-line code fix plus one new test case — straightforward, bounded scope
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/hostfully-enrichment.ts:74-78` — EXISTING unwrap pattern for properties: `const property = propertyJson.property ?? propertyJson;` — follow this exact pattern for leads
  - `src/worker-tools/hostfully/get-messages.ts:247` — The bug: `const lead = (await leadRes.json()) as RawLead;` — this casts the wrapper `{ lead: {...} }` directly to `RawLead`
  - `src/worker-tools/hostfully/get-messages.ts:114-122` — `formatGuestName()` function — DO NOT MODIFY
  - `src/worker-tools/hostfully/get-messages.ts:288` — Where `formatGuestName(lead.guestInformation)` is called — this will work correctly once `lead` is properly unwrapped

  **Test References**:
  - `tests/worker-tools/hostfully/get-messages-lead-id.test.ts` — Existing test file with mock HTTP server pattern. Current mocks serve UNWRAPPED lead responses (e.g. `{ uid: 'lead-abc', guestInformation: {...} }`). Your new test must mock the WRAPPED format: `{ lead: { uid: 'lead-abc', guestInformation: {...} } }`. The existing tests will still pass because the `?? rawJson` fallback handles the unwrapped case.

  **API/Type References**:
  - Live API confirmed: `GET /api/v3.2/leads/29a64abd...` returns `{ "lead": { "uid": "29a64abd...", "guestInformation": { "firstName": "Olivia", "lastName": "" }, "propertyUid": "562695df...", "channel": "AIRBNB", ... } }` — the response is wrapped in a `lead` key

  **WHY Each Reference Matters**:
  - `hostfully-enrichment.ts:74-78`: This is the canonical pattern to follow — it already solves the identical problem for properties
  - `get-messages.ts:247`: This IS the bug — the line you must change
  - `get-messages.ts:288`: This is where `guestInformation` is read — it returns `undefined` today because `lead` is actually the wrapper object

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify unwrap pattern applied at line 247
    Tool: Bash (grep)
    Steps:
      1. grep -n "leadJson.lead" src/worker-tools/hostfully/get-messages.ts
      2. Assert: at least one line shows the unwrap pattern
      3. grep -n "as RawLead" src/worker-tools/hostfully/get-messages.ts
      4. Assert: the old direct cast `(await leadRes.json()) as RawLead` is gone
    Expected Result: Unwrap pattern applied, old direct cast removed
    Evidence: .sisyphus/evidence/task-1-unwrap-pattern.txt

  Scenario: Verify multi-lead path is NOT modified
    Tool: Bash (git diff)
    Steps:
      1. git diff src/worker-tools/hostfully/get-messages.ts
      2. Assert: diff does NOT touch lines 310-400 (multi-lead path)
      3. Assert: diff only touches the single-lead path area (around line 247)
    Expected Result: Multi-lead path unchanged
    Evidence: .sisyphus/evidence/task-1-multi-lead-unchanged.txt

  Scenario: New wrapped-response test passes
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/worker-tools/hostfully/get-messages-lead-id.test.ts
      2. Assert exit code 0
      3. Assert output mentions the new wrapped-response test case
    Expected Result: All tests pass including the new one
    Evidence: .sisyphus/evidence/task-1-tests-pass.txt

  Scenario: Existing tests still pass (backward compatibility)
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/worker-tools/hostfully/get-messages-lead-id.test.ts
      2. Assert: all previously-passing tests still pass
    Expected Result: No regressions — the ?? fallback handles unwrapped mocks
    Evidence: .sisyphus/evidence/task-1-backward-compat.txt
  ```

  **Commit**: YES (groups with Task 2 in a single commit)
  - Message: `fix(guest-messaging): unwrap Hostfully lead API response to get correct guest name`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `tests/worker-tools/hostfully/get-messages-lead-id.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Fix `hostfully-enrichment.ts` — Unwrap lead API response + add wrapped-response test

  **What to do**:
  - In `src/lib/hostfully-enrichment.ts`, at line 56, change:
    ```typescript
    const lead = (await res.json()) as RawLeadResponse;
    ```
    to:
    ```typescript
    const leadJson = (await res.json()) as { lead?: RawLeadResponse };
    const lead = leadJson.lead ?? (leadJson as unknown as RawLeadResponse);
    ```
  - This is the IDENTICAL pattern already used in the same file for properties (lines 74-78): `const property = propertyJson.property ?? propertyJson;`
  - After this fix, `lead.guestInformation.firstName` will correctly return "Olivia" instead of `undefined`
  - The lifecycle `notify-received` Slack message will also show the correct guest name
  - Add a new test case to `tests/lib/hostfully-enrichment.test.ts` that mocks the lead API returning the **wrapped** format: `{ lead: { uid: 'x', guestInformation: { firstName: 'Jane', lastName: 'Smith' }, propertyUid: 'prop-1', channel: 'AIRBNB', checkInLocalDateTime: '2026-06-01T15:00:00', checkOutLocalDateTime: '2026-06-03T11:00:00' } }`. Assert that the returned `guestName` equals `'Jane Smith'` and that `checkIn`, `checkOut`, and `bookingChannel` are also correctly extracted (not null). This verifies the ENTIRE lead object is unwrapped, not just `guestInformation`.

  **Must NOT do**:
  - Do NOT touch `employee-lifecycle.ts` — this fix is in the shared library, not the lifecycle
  - Do NOT modify existing tests — only ADD a new test case
  - Do NOT change the `LeadEnrichment` return type or the `RawLeadResponse` type definition
  - Do NOT modify the property unwrapping logic (lines 74-78) — it already works correctly

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-line code fix plus one new test case — straightforward, mirrors Task 1
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/hostfully-enrichment.ts:74-78` — EXISTING unwrap pattern for properties IN THE SAME FILE: `const property = propertyJson.property ?? propertyJson;` — apply the identical pattern for leads at line 56
  - `src/lib/hostfully-enrichment.ts:56` — The bug: `const lead = (await res.json()) as RawLeadResponse;` — casts the wrapper directly
  - `src/lib/hostfully-enrichment.ts:58-60` — Where `guestInformation.firstName/lastName` is accessed — returns empty strings today because `lead` is actually the wrapper object

  **Test References**:
  - `tests/lib/hostfully-enrichment.test.ts` — Existing test file. Current mocks serve UNWRAPPED lead responses. Your new test must mock the WRAPPED format. The existing tests will still pass due to the `?? rawJson` fallback.

  **API/Type References**:
  - `src/lib/hostfully-enrichment.ts:1-11` — `RawLeadResponse` type definition — check that it covers `checkInLocalDateTime`, `checkOutLocalDateTime`, `channel`, `propertyUid` in addition to `guestInformation`

  **WHY Each Reference Matters**:
  - `hostfully-enrichment.ts:74-78`: You're adding the exact same unwrap pattern 20 lines above in the same file — maximum consistency
  - `hostfully-enrichment.ts:56`: This IS the bug — the line you must change
  - `hostfully-enrichment.ts:58-60`: This is where `guestInformation` is read — currently gets `undefined` because `lead` is the wrapper

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify unwrap pattern applied at line 56
    Tool: Bash (grep)
    Steps:
      1. grep -n "leadJson.lead" src/lib/hostfully-enrichment.ts
      2. Assert: at least one line shows the unwrap pattern
    Expected Result: Unwrap pattern applied
    Evidence: .sisyphus/evidence/task-2-unwrap-pattern.txt

  Scenario: Verify property unwrap is NOT modified
    Tool: Bash (git diff)
    Steps:
      1. git diff src/lib/hostfully-enrichment.ts
      2. Assert: diff does NOT touch lines 74-78 (property unwrap)
    Expected Result: Property unwrap unchanged
    Evidence: .sisyphus/evidence/task-2-property-unchanged.txt

  Scenario: New wrapped-response test passes with all fields
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/lib/hostfully-enrichment.test.ts
      2. Assert exit code 0
      3. Assert output mentions the new wrapped-response test case
    Expected Result: All tests pass including the new one, guestName + checkIn + checkOut + bookingChannel all correct
    Evidence: .sisyphus/evidence/task-2-tests-pass.txt

  Scenario: Existing tests still pass (backward compatibility)
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/lib/hostfully-enrichment.test.ts
      2. Assert: all previously-passing tests still pass
    Expected Result: No regressions
    Evidence: .sisyphus/evidence/task-2-backward-compat.txt
  ```

  **Commit**: YES (groups with Task 1 in a single commit)
  - Message: `fix(guest-messaging): unwrap Hostfully lead API response to get correct guest name`
  - Files: `src/lib/hostfully-enrichment.ts`, `tests/lib/hostfully-enrichment.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Commit all changes

  **What to do**:
  - Stage all changed files from Tasks 1 and 2
  - Run `pnpm test -- --run` as pre-commit verification
  - Create a single commit with message: `fix(guest-messaging): unwrap Hostfully lead API response to get correct guest name`
  - Files to include: `src/worker-tools/hostfully/get-messages.ts`, `src/lib/hostfully-enrichment.ts`, `tests/worker-tools/hostfully/get-messages-lead-id.test.ts`, `tests/lib/hostfully-enrichment.test.ts`

  **Must NOT do**:
  - Do NOT include any files not listed above
  - Do NOT use `--no-verify` flag

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single git commit — no code changes, just staging and committing
  - **Skills**: `["git-master"]`
    - `git-master`: Proper commit workflow

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 — sequential after Tasks 1 and 2
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Commit created with correct message and files
    Tool: Bash
    Steps:
      1. git log -1 --format="%s"
      2. Assert: message is "fix(guest-messaging): unwrap Hostfully lead API response to get correct guest name"
      3. git diff --name-only HEAD~1
      4. Assert: exactly 4 files changed (the two source files and two test files)
    Expected Result: Clean single commit with all changes
    Evidence: .sisyphus/evidence/task-3-commit.txt
  ```

  **Commit**: YES (this IS the commit task)
  - Message: `fix(guest-messaging): unwrap Hostfully lead API response to get correct guest name`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `src/lib/hostfully-enrichment.ts`, `tests/worker-tools/hostfully/get-messages-lead-id.test.ts`, `tests/lib/hostfully-enrichment.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Run full test suite + rebuild Docker image

  **What to do**:
  - Run `pnpm test -- --run` and verify all tests pass (no new failures vs baseline)
  - Run `docker build -t ai-employee-worker:latest .` to rebuild the Docker image with the updated `get-messages.ts`
  - Verify the build succeeds
  - Note: `hostfully-enrichment.ts` is in `src/lib/` (gateway code) — it takes effect on gateway auto-restart via `tsx watch`. No Docker rebuild needed for that file. But the Docker rebuild IS needed for `get-messages.ts` (worker tool baked into the image).

  **Must NOT do**:
  - Do NOT re-seed the database — archetype instructions are unchanged
  - Do NOT modify any source files — this is a verification + build step only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running commands only — no code changes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 — sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - AGENTS.md — "CRITICAL — Rebuild after every worker change" section

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. pnpm test -- --run
      2. Assert exit code 0
      3. Verify no new test failures (known pre-existing failures: container-boot.test.ts skips, inngest-serve.test.ts count mismatch)
    Expected Result: All tests pass (excluding known pre-existing failures)
    Evidence: .sisyphus/evidence/task-4-full-tests.txt

  Scenario: Docker image builds successfully
    Tool: Bash
    Steps:
      1. docker build -t ai-employee-worker:latest .
      2. Assert exit code 0
      3. Verify image exists: docker images ai-employee-worker:latest
    Expected Result: Docker image built successfully with timestamp updated
    Evidence: .sisyphus/evidence/task-4-docker-build.txt
  ```

  **Commit**: NO (build step only)

- [x] 5. E2E Scenario A — Verify "Olivia" in Slack approval card + DB

  **What to do**:
  - Ensure local services are running (`pnpm dev` or equivalent)
  - Send a new message from Olivia's test Airbnb account: navigate to `https://www.airbnb.com/guest/messages/2525238359`, type a message with unique suffix `[name-fix-test-{epoch}]`, send it
  - Wait for the webhook to fire and the task to reach `Reviewing` state
  - Navigate to Slack `#cs-guest-communication` (`https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`)
  - Find the approval card for the new task (click "View thread" or "1 reply" to see it)
  - Verify the card shows "Olivia" as the guest name (not "c.e." or "c.e. Wilson")
  - Capture screenshot evidence of the Slack approval card
  - Query DB to verify: `psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "SELECT guest_name FROM pending_approvals WHERE task_id = '<task_id>'"` — must return `'Olivia'`
  - Follow full Scenario A from `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`

  **Must NOT do**:
  - Do NOT approve the message (leave in Reviewing state for verification, or approve only if E2E guide requires it)
  - Do NOT modify any code — this is verification only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: E2E verification with browser automation, multi-step with timing dependencies
  - **Skills**: `["dev-browser"]`
    - `dev-browser`: Required for Playwright browser automation to interact with Airbnb and Slack

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 — sequential after Task 4
  - **Blocks**: F1–F4
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Full Scenario A steps
  - AGENTS.md § "E2E Testing with Playwright Browser" — Airbnb and Slack browser testing setup
  - AGENTS.md § "Hostfully Testing" — Test lead/thread/property UIDs

  **External References**:
  - Airbnb thread: `https://www.airbnb.com/guest/messages/2525238359`
  - Slack channel: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Slack approval card shows "Olivia" as guest name
    Tool: Playwright (dev-browser skill)
    Preconditions: Local services running (gateway, Inngest, Docker), Docker image rebuilt with fix
    Steps:
      1. Navigate to https://www.airbnb.com/guest/messages/2525238359
      2. Type message: "Testing guest name fix [name-fix-test-{epoch}]"
      3. Send the message
      4. Wait up to 120s for task to appear in Slack
      5. Navigate to https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S
      6. Find the newest approval card (click "View thread" or "1 reply")
      7. Assert: card contains text "Olivia" in the guest name field
      8. Assert: card does NOT contain text "c.e." in the guest name field
      9. Take screenshot of the approval card
    Expected Result: Guest name shows "Olivia", not "c.e."
    Failure Indicators: Card shows "c.e." or "c.e. Wilson" or null/empty guest name
    Evidence: .sisyphus/evidence/task-5-slack-approval-card.png

  Scenario: DB confirms correct guest name
    Tool: Bash (psql)
    Preconditions: Task has reached Reviewing state
    Steps:
      1. Get the task ID from the Slack card's context block (bottom of the card)
      2. psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -t -A -c "SELECT guest_name FROM pending_approvals WHERE task_id = '<task_id>'"
      3. Assert: result is exactly "Olivia" (not "c.e. Wilson", not null, not empty)
    Expected Result: pending_approvals.guest_name = "Olivia"
    Failure Indicators: guest_name is "c.e. Wilson" or null or empty
    Evidence: .sisyphus/evidence/task-5-db-guest-name.txt

  Scenario: Deliverable metadata also has correct guest name
    Tool: Bash (psql)
    Steps:
      1. psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -t -A -c "SELECT d.metadata->>'guest_name' FROM deliverables d JOIN executions e ON d.execution_id = e.id WHERE e.task_id = '<task_id>'"
      2. Assert: result is "Olivia"
    Expected Result: deliverables.metadata.guest_name = "Olivia"
    Evidence: .sisyphus/evidence/task-5-deliverable-metadata.txt
  ```

  **Commit**: NO (verification only)

- [x] 6. Notify completion

  Send Telegram notification: plan `fix-guest-name-source` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ fix-guest-name-source complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log/diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                              | Files                                                                                                                                                                                  | Pre-commit           |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1      | `fix(guest-messaging): unwrap Hostfully lead API response to get correct guest name` | `src/worker-tools/hostfully/get-messages.ts`, `src/lib/hostfully-enrichment.ts`, `tests/worker-tools/hostfully/get-messages-lead-id.test.ts`, `tests/lib/hostfully-enrichment.test.ts` | `pnpm test -- --run` |

---

## Known Remaining Gaps (Out of Scope)

- **`get-reservations.ts`** uses the same `RawLead` type but only fetches via the list endpoint (`GET /leads?...`) which returns `{ "leads": [...] }` — already handled correctly. Not affected by the single-lead wrapping bug.
- **Multi-lead path in `get-messages.ts`** (lines 310+) also uses the list endpoint — not affected.

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run  # Expected: all tests pass, 0 failures
psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "SELECT guest_name FROM pending_approvals WHERE task_id = '<e2e-task-id>'"  # Expected: Olivia
```

### Final Checklist

- [ ] Lead response unwrapped in `get-messages.ts` (line 247)
- [ ] Lead response unwrapped in `hostfully-enrichment.ts` (line 56)
- [ ] New wrapped-response test case in `get-messages-lead-id.test.ts`
- [ ] New wrapped-response test case in `hostfully-enrichment.test.ts`
- [ ] Existing tests still pass (backward-compatible via `?? rawJson` fallback)
- [ ] `formatGuestName()` unchanged
- [ ] Multi-lead path unchanged
- [ ] All tests pass
- [ ] Slack approval card shows "Olivia" in E2E
- [ ] `pending_approvals.guest_name` = "Olivia" in DB
- [ ] Docker image rebuilt

## Telegram Notification

After all tasks complete and final verification passes, send:

```bash
tsx scripts/telegram-notify.ts "✅ fix-guest-name-source complete — All tasks done. Come back to review results."
```
