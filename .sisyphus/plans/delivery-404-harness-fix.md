# Fix Guest-Messaging Delivery 404 — Harness JSON Pre-Parse

## TL;DR

> **Quick Summary**: The delivery-phase LLM used the Task ID as the Hostfully `--lead-id` (causing a 404) because the prompt contained multiple UUIDs and relied on the model to parse raw JSON. Fix by programmatically extracting `leadUid`/`threadUid`/`draftResponse` from the deliverable JSON in TypeScript before constructing the delivery prompt — eliminating UUID ambiguity.
>
> **Deliverables**:
>
> - Harness pre-parse logic in `opencode-harness.mts` (role-name gated)
> - Updated `delivery_instructions` in seed (no longer requires model JSON parsing)
> - Corrected `deliverable_type` for guest-messaging archetype
> - New unit tests for the pre-parse path
> - 14 orphaned containers cleaned up + gateway restarted
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (diagnostic) → T3 (harness fix) → T5 (tests) → T7 (E2E)

---

## Context

### Original Request

User sent a test message via Airbnb → arrived in Hostfully → Inngest task launched → approval card appeared on Slack → user clicked "Approve" → reply never appeared in Hostfully. The delivery container's `send-message.ts` call returned a 404 from Hostfully API because the `--lead-id` parameter was the task ID (`f2c8430a-...`), not the actual Hostfully lead UID.

### Interview Summary

**Key Discussions**:

- Root cause traced: delivery model received raw JSON + appended `Task ID:` and picked the wrong UUID
- Additionally, `runOpencodeSession()` injects a second `Task ID:` line — double UUID pollution (out of scope to fix, but explains why model got confused)
- User chose **Direction A**: Harden the harness by parsing JSON in TypeScript, not relying on the LLM

**Research Findings**:

- `send-message.ts` calls `POST /api/v3.2/messages` with `{ leadUid: leadId }` — wrong UID → 404
- Harness delivery phase (line 375-402) builds prompt: `{delivery_instructions}\n\n--- DELIVERABLE CONTENT ---\n{raw JSON}\n--- END DELIVERABLE CONTENT ---\n\nTask ID: {taskId}`
- Execution-phase model writes `/tmp/summary.txt` with JSON containing `leadUid`, `threadUid`, `draftResponse` etc. (seed.ts line 335-337)
- Three archetypes have `delivery_instructions`: two summarizers (use deliverable as plain text) and guest-messaging (requires JSON parsing) — harness fix MUST be gated

### Metis Review

**Identified Gaps** (addressed):

- Double `Task ID:` injection in `runOpencodeSession` — excluded from scope, separate ticket
- `deliverable_type: 'slack_message'` on guest-messaging is semantically wrong — included as seed fix
- Diagnostic must run first to confirm `leadUid` IS present in stored JSON — gated as T1
- Optional `threadUid` handling — must omit `--thread-id` if null, not pass `--thread-id "null"`
- New unit test needed for the pre-parse path — included as T5
- Docker rebuild mandatory before E2E — included as T6

---

## Work Objectives

### Core Objective

Eliminate LLM UUID parsing from the guest-messaging delivery flow by programmatically extracting Hostfully IDs from the deliverable JSON in the harness, so the model receives an explicit command to execute rather than raw JSON to parse.

### Concrete Deliverables

- Modified `src/workers/opencode-harness.mts` with role-name-gated JSON pre-parse block
- Updated `prisma/seed.ts` with new `delivery_instructions` and corrected `deliverable_type`
- New unit test cases in `tests/workers/opencode-harness-delivery.test.ts`
- 14 orphaned Docker containers removed
- Gateway restarted with lifecycle fix from commit `28e7fd1`

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 failures
- [ ] Docker image rebuilt and E2E delivery succeeds with correct `--lead-id`
- [ ] No orphaned `employee-delivery-*` containers remain
- [ ] Gateway running with latest lifecycle code

### Must Have

- JSON pre-parse gated on `archetype.role_name === 'guest-messaging'` — NOT a generic try-parse
- Fallback to current behavior (raw deliverable passthrough) if JSON parse fails or fields missing
- `threadUid` omitted from command when null/absent (not passed as `"null"`)
- Docker rebuild after harness changes, seed applied after seed changes

### Must NOT Have (Guardrails)

- Do NOT modify `src/worker-tools/hostfully/send-message.ts` — the CLI tool is correct
- Do NOT change delivery prompt structure for `daily-summarizer` archetypes — gated by `role_name`
- Do NOT fix the double `Task ID:` injection in `runOpencodeSession` — separate ticket
- Do NOT add retry logic to `send-message.ts` or any new features
- Do NOT change execution-phase `instructions` unless diagnostic (T1) reveals `leadUid` is absent from stored JSON
- Do NOT use `deliverable_type` for gating — use `role_name` (more explicit, won't break if type is corrected)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after) — add new unit test for pre-parse path
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Harness code**: Use Bash (lsp_diagnostics + pnpm test) — type-check and run unit tests
- **Seed changes**: Use Bash (prisma seed) — verify seed applies without errors
- **Docker**: Use Bash (docker build + docker inspect) — verify image freshness
- **E2E**: Use Bash (curl + docker logs) — trigger webhook, verify delivery logs

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — diagnostic + cleanup):
├── Task 1: Diagnostic — query deliverables table for failed task [quick]
├── Task 2: Container cleanup + gateway restart [quick]

Wave 2 (After Wave 1 — core code changes, parallel):
├── Task 3: Harness fix — add role-name-gated JSON pre-parse (depends: T1) [deep]
├── Task 4: Seed update — delivery_instructions + deliverable_type (depends: T1) [quick]

Wave 3 (After Wave 2 — test + build, parallel):
├── Task 5: Unit tests + full test suite (depends: T3, T4) [unspecified-high]
├── Task 6: Docker rebuild + seed apply (depends: T3, T4) [quick]

Wave 4 (After Wave 3 — E2E):
├── Task 7: E2E verification (depends: T5, T6) [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T3 → T5 → T7 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 2 (Waves 1-3)
```

### Dependency Matrix

| Task | Blocked By | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | T3, T4 | 1    |
| T2   | —          | T7     | 1    |
| T3   | T1         | T5, T6 | 2    |
| T4   | T1         | T5, T6 | 2    |
| T5   | T3, T4     | T7     | 3    |
| T6   | T3, T4     | T7     | 3    |
| T7   | T5, T6     | F1-F4  | 4    |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 2 tasks — T3 → `deep`, T4 → `quick`
- **Wave 3**: 2 tasks — T5 → `unspecified-high`, T6 → `quick`
- **Wave 4**: 1 task — T7 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Diagnostic — Query Deliverables Table for Failed Task

  **What to do**:
  - Query PostgREST `deliverables` table for `external_ref=eq.f2c8430a-3a0d-4c8e-ae47-5f3d24819de7`
  - Extract and inspect `content` field — parse as JSON and check for `leadUid`, `threadUid`, `draftResponse`
  - Document findings: is `leadUid` present? What value does it have? Is it the correct Hostfully UID or the task ID?
  - **CRITICAL BRANCHING POINT**: If `leadUid` is ABSENT from the stored JSON, the execution-phase instructions also need fixing (expand scope of T4 to include execution instructions). If `leadUid` IS present and correct, the bug is purely in the delivery prompt construction.
  - Save diagnostic output as evidence

  **Must NOT do**:
  - Do not modify any data
  - Do not change any code — this is read-only investigation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single curl command + JSON inspection, no code changes
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — this is a simple data query

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:375-402` — Delivery phase fetches `deliverables` with `external_ref=eq.${TASK_ID}` and reads `content`

  **API/Type References**:
  - PostgREST URL: `http://localhost:54331/rest/v1/deliverables?external_ref=eq.f2c8430a-3a0d-4c8e-ae47-5f3d24819de7&select=content`
  - Auth header: `Authorization: Bearer <SUPABASE_SECRET_KEY from .env>` and `apikey: <same key>`

  **WHY Each Reference Matters**:
  - The harness line 388 shows `deliverableContent = deliverable.content as string` — we need to see what this string actually contains for the failed task
  - The PostgREST URL uses the same Kong port (54331) that the harness uses

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Query deliverables for failed task and verify JSON structure
    Tool: Bash (curl + jq)
    Preconditions: PostgREST running at localhost:54331, SUPABASE_SECRET_KEY loaded from .env
    Steps:
      1. source .env && curl -s "http://localhost:54331/rest/v1/deliverables?external_ref=eq.f2c8430a-3a0d-4c8e-ae47-5f3d24819de7&select=content" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
      2. Parse the response array — extract first element's `content` field
      3. Parse content as JSON (it should be a string containing JSON)
      4. Check for presence of: leadUid, threadUid, draftResponse
      5. Verify leadUid value is NOT "f2c8430a-3a0d-4c8e-ae47-5f3d24819de7" (that's the task ID)
    Expected Result: JSON response with content field containing structured data. leadUid field is present.
    Failure Indicators: Empty response (no deliverable row), content is not JSON, leadUid absent or equals task ID
    Evidence: .sisyphus/evidence/task-1-diagnostic-deliverable-content.json
  ```

  **Evidence to Capture:**
  - [ ] Full deliverable content JSON saved to evidence file
  - [ ] Analysis note: leadUid present? Correct value? Branch decision documented.

  **Commit**: NO (read-only task)

- [x] 2. Container Cleanup + Gateway Restart

  **What to do**:
  - List all orphaned `employee-delivery-*` containers: `docker ps -a --filter name=employee-delivery`
  - Stop and remove them all: `docker rm -f $(docker ps -a --filter name=employee-delivery -q)`
  - Verify cleanup: `docker ps -a --filter name=employee-delivery --format '{{.Names}}'` should be empty
  - Restart the gateway process to pick up lifecycle fix from commit `28e7fd1`:
    - Check how gateway is currently running (`pgrep -f gateway` or check tmux sessions)
    - Kill the existing gateway process
    - Restart it (method depends on how it's running — likely `pnpm dev` in a tmux session)
  - Verify gateway is running with the new code

  **Must NOT do**:
  - Do not stop non-delivery containers (filter strictly on `employee-delivery` prefix)
  - Do not modify any code files
  - Do not stop Docker Compose services (PostgreSQL, Kong, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Docker commands + process restart, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 7 (E2E needs clean environment)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1267` — Container naming: `employee-delivery-${taskId.slice(0, 8)}`
  - `scripts/dev.ts` — How gateway is started in dev mode

  **WHY Each Reference Matters**:
  - Container naming pattern confirms the `--filter name=employee-delivery` prefix will catch all orphans
  - `dev.ts` shows how the gateway process is managed (needed for restart procedure)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Clean up orphaned delivery containers
    Tool: Bash (docker)
    Preconditions: 14 orphaned employee-delivery-* containers running
    Steps:
      1. docker ps -a --filter name=employee-delivery --format '{{.Names}}' | wc -l (count before)
      2. docker rm -f $(docker ps -a --filter name=employee-delivery -q)
      3. docker ps -a --filter name=employee-delivery --format '{{.Names}}' | wc -l
    Expected Result: Step 3 returns 0 containers
    Failure Indicators: Any employee-delivery-* container still exists after rm
    Evidence: .sisyphus/evidence/task-2-container-cleanup.txt

  Scenario: Gateway restart with latest code
    Tool: Bash (process management)
    Preconditions: Gateway running with pre-fix code
    Steps:
      1. Check current gateway PID and start time
      2. Kill and restart gateway (method depends on runtime: tmux, pnpm dev, etc.)
      3. Wait 10s for startup
      4. curl http://localhost:7700/health — should return 200
      5. Verify gateway PID is different from step 1 (confirms restart)
    Expected Result: Gateway healthy at :7700 with new PID
    Failure Indicators: /health returns non-200, same PID as before restart
    Evidence: .sisyphus/evidence/task-2-gateway-restart.txt
  ```

  **Commit**: NO (operational task, no code changes)

- [x] 3. Harness Fix — Add Role-Name-Gated JSON Pre-Parse for Delivery

  **What to do**:
  - In `src/workers/opencode-harness.mts`, modify the delivery phase block (lines 375-402)
  - After line 388 (`const deliverableContent = ...`), add a new block that:
    1. Checks if `archetype.role_name === 'guest-messaging'` (explicit gate — NOT a generic try-parse)
    2. If gated: try to parse `deliverableContent` as JSON
    3. Extract `leadUid`, `threadUid`, `draftResponse` from the parsed object
    4. Validate: `leadUid` must be a non-empty string, `draftResponse` must be a non-empty string
    5. `threadUid` is optional — may be null/undefined/empty
    6. If extraction succeeds: build a structured delivery prompt that gives the model the EXACT command to run:

       ```
       {deliveryInstructions}

       The deliverable has been pre-parsed. Execute this exact command to deliver the response:

       tsx /tools/hostfully/send-message.ts --lead-id "{leadUid}" --thread-id "{threadUid}" --message "{draftResponse}"

       (Note: if --thread-id is absent above, omit it from the command)

       After delivery, write results to /tmp/summary.txt as JSON with "delivered": true and the send-message.ts output.

       Task ID: {TASK_ID}
       ```

    7. If `threadUid` is null/empty: construct the command WITHOUT `--thread-id` flag entirely
    8. If JSON parse fails or required fields missing: log a warning and fall back to current behavior (raw `deliverableContent` passthrough with the existing prompt construction at line 402)

  - Ensure the `else` branch (non-guest-messaging archetypes, or failed parse) uses the EXISTING prompt construction logic at line 402 unchanged

  **Must NOT do**:
  - Do NOT apply this pre-parse to any archetype other than `guest-messaging`
  - Do NOT modify `runOpencodeSession()` — the double Task ID injection is out of scope
  - Do NOT modify `send-message.ts`
  - Do NOT change how the harness handles the summarizer delivery path
  - Do NOT add any new npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying shared infrastructure code (harness) requires careful understanding of all code paths and blast radius
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no browser testing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 1 (diagnostic result may expand scope)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:375-402` — Current delivery phase block. Line 388 fetches content, line 402 builds prompt. The new pre-parse block goes BETWEEN these two lines.
  - `src/workers/opencode-harness.mts:28-29` — Archetype type includes `role_name` and `delivery_instructions`
  - `src/workers/opencode-harness.mts:168` — `runOpencodeSession` appends another `Task ID:` line (context for why double injection exists; do NOT modify)

  **API/Type References**:
  - `prisma/seed.ts:335-337` — The JSON structure written by execution model: includes `leadUid`, `threadUid`, `draftResponse`, `guestName`, `propertyName`, etc.

  **Test References**:
  - `tests/workers/opencode-harness-delivery.test.ts` — Existing delivery tests. The new code must not break these.

  **WHY Each Reference Matters**:
  - Line 375-402 is the exact insertion point — read the full block to understand pre/post context
  - The archetype type at line 28-29 confirms `role_name` is available on the archetype object
  - Seed line 335-337 documents what fields the execution model writes — these are what we extract

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness pre-parses guest-messaging deliverable JSON correctly
    Tool: Bash (lsp_diagnostics + grep)
    Preconditions: Harness file modified with new pre-parse block
    Steps:
      1. Run lsp_diagnostics on src/workers/opencode-harness.mts — assert 0 errors
      2. Search for `role_name === 'guest-messaging'` in the file — assert found
      3. Search for `leadUid` extraction — assert found in delivery phase block
      4. Verify the fallback path exists: search for a warning log on JSON parse failure
      5. Verify threadUid omission: search for conditional logic that omits --thread-id when threadUid is falsy
    Expected Result: TypeScript compiles clean, all patterns present
    Failure Indicators: TS errors, missing gate check, missing fallback
    Evidence: .sisyphus/evidence/task-3-harness-diagnostics.txt

  Scenario: Harness does NOT affect summarizer delivery path
    Tool: Bash (grep)
    Preconditions: Harness file modified
    Steps:
      1. Search for all references to `role_name` in the delivery phase block
      2. Verify the gate is `=== 'guest-messaging'` (not a generic check)
      3. Verify the else/fallback branch preserves the original line 402 prompt construction
    Expected Result: Gate is role-specific, fallback preserves original behavior
    Failure Indicators: Generic try-parse without role gate, missing fallback
    Evidence: .sisyphus/evidence/task-3-summarizer-safety.txt
  ```

  **Commit**: YES (groups with T4)
  - Message: `fix(delivery): parse deliverable JSON in harness instead of relying on LLM`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Seed Update — Delivery Instructions + Deliverable Type

  **What to do**:
  - In `prisma/seed.ts`, update the guest-messaging archetype (ID `00000000-0000-0000-0000-000000000015`):
    1. **Update `delivery_instructions`** (both `create` and `update` blocks, lines 3321-3322 and 3351-3352):
       - Change FROM: `'You will receive the approved deliverable content below as JSON. Parse it to extract the leadUid, threadUid (if present), and draftResponse fields. Send the approved response to the guest via Hostfully: tsx /tools/hostfully/send-message.ts --lead-id "<leadUid>" --thread-id "<threadUid, if present>" --message "<draftResponse>". After delivery, write your results to /tmp/summary.txt as JSON with a "delivered" boolean and the send-message.ts output.'`
       - Change TO: `'The harness has pre-parsed the deliverable JSON and constructed the exact send-message.ts command above. Execute that command exactly as shown — do not modify the --lead-id, --thread-id, or --message values. After delivery, write your results to /tmp/summary.txt as JSON with a "delivered" boolean and the send-message.ts output.'`
    2. **Correct `deliverable_type`** (both `create` and `update` blocks):
       - Change FROM: `deliverable_type: 'slack_message'`
       - Change TO: `deliverable_type: 'hostfully_message'`
  - **If T1 diagnostic revealed `leadUid` is ABSENT from stored JSON**: also update the execution-phase instructions (`VLRE_GUEST_MESSAGING_INSTRUCTIONS`, around line 335-337) to be more explicit about including `leadUid` in the JSON written to `/tmp/summary.txt`. If T1 confirmed `leadUid` IS present, do NOT modify execution instructions.

  **Must NOT do**:
  - Do NOT change `delivery_instructions` for `daily-summarizer` archetypes (IDs 000012, 000013)
  - Do NOT change the `VLRE_GUEST_MESSAGING_INSTRUCTIONS` unless T1 diagnostic confirms leadUid is absent
  - Do NOT change any other archetype fields (model, system_prompt, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Focused text replacements in seed file — two string changes + one field rename
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 1 (diagnostic may expand scope)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3321-3322` — Current `delivery_instructions` (create block) for guest-messaging
  - `prisma/seed.ts:3351-3352` — Current `delivery_instructions` (update block) for guest-messaging
  - `prisma/seed.ts:3332` — Current `deliverable_type: 'slack_message'` (update block)
  - `prisma/seed.ts:335-337` — Execution instructions telling model what to write in `/tmp/summary.txt`

  **WHY Each Reference Matters**:
  - Lines 3321-3322 and 3351-3352 are the exact strings to replace — both `create` and `update` blocks must match
  - Line 3332 shows the incorrect `deliverable_type` to correct
  - Lines 335-337 show what the model is told to write — only modify if T1 says leadUid is missing

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed file has updated delivery_instructions for guest-messaging
    Tool: Bash (grep)
    Preconditions: seed.ts modified
    Steps:
      1. grep -c "Parse it to extract the leadUid" prisma/seed.ts — should return 0 (old text removed)
      2. grep -c "pre-parsed the deliverable JSON" prisma/seed.ts — should return 2 (create + update blocks)
      3. grep -c "deliverable_type: 'hostfully_message'" prisma/seed.ts — should return >= 1
      4. grep -c "deliverable_type: 'slack_message'" prisma/seed.ts — verify guest-messaging no longer uses 'slack_message' (summarizers still do, so count may be > 0)
    Expected Result: Old delivery instructions gone, new ones present in both blocks, deliverable_type corrected
    Failure Indicators: Old text still present, new text missing, deliverable_type unchanged
    Evidence: .sisyphus/evidence/task-4-seed-verification.txt

  Scenario: Summarizer delivery_instructions are unchanged
    Tool: Bash (grep)
    Preconditions: seed.ts modified
    Steps:
      1. Search for daily-summarizer delivery_instructions (should still contain "Post the approved summary to the publish channel")
      2. Count occurrences — should be same as before (4 for DozalDevs create+update + VLRE create+update)
    Expected Result: Summarizer instructions unchanged
    Failure Indicators: Summarizer delivery_instructions text differs from original
    Evidence: .sisyphus/evidence/task-4-summarizer-unchanged.txt
  ```

  **Commit**: YES (groups with T3)
  - Message: `fix(delivery): parse deliverable JSON in harness instead of relying on LLM`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Unit Tests + Full Test Suite Verification

  **What to do**:
  - Add new test cases to `tests/workers/opencode-harness-delivery.test.ts`:
    1. **Happy path**: Mock a guest-messaging archetype with `role_name: 'guest-messaging'` and deliverable content containing valid JSON with `leadUid`, `threadUid`, `draftResponse`. Verify the constructed delivery prompt contains the pre-parsed command with correct `--lead-id` value (the leadUid, NOT the task ID).
    2. **Optional threadUid**: Same as above but `threadUid` is null. Verify the delivery prompt does NOT contain `--thread-id`.
    3. **Fallback — non-JSON content**: Mock a guest-messaging archetype but deliverable content is a plain string (not JSON). Verify fallback to raw passthrough (original prompt format with `--- DELIVERABLE CONTENT ---`).
    4. **Fallback — missing fields**: Mock with JSON content missing `leadUid`. Verify fallback to raw passthrough.
    5. **Non-guest-messaging archetype**: Mock a `daily-summarizer` archetype. Verify the pre-parse block is NOT triggered — prompt uses raw passthrough.
  - Run the full test suite: `pnpm test -- --run`
  - Verify 0 failures across ALL test files, especially:
    - `tests/workers/opencode-harness-delivery.test.ts`
    - `tests/inngest/employee-lifecycle-delivery.test.ts`
    - `tests/inngest/lifecycle-guest-delivery.test.ts`

  **Must NOT do**:
  - Do NOT modify any test files other than `tests/workers/opencode-harness-delivery.test.ts`
  - Do NOT skip or disable any existing tests
  - Do NOT add tests that require real Hostfully API calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Writing 5 test cases + running full suite requires understanding the existing test patterns and mock setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `tests/workers/opencode-harness-delivery.test.ts` — Existing test structure, mock patterns, how archetype/deliverable are mocked. Follow the existing `describe`/`it` structure.

  **Test References**:
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — Must pass (regression check)
  - `tests/inngest/lifecycle-guest-delivery.test.ts` — Must pass (regression check)

  **WHY Each Reference Matters**:
  - The existing delivery test file shows the mock setup pattern — `db.get` mocks for deliverables, archetype shape, etc. New tests must follow the same pattern for consistency.
  - The lifecycle delivery tests verify the broader delivery flow isn't broken by harness changes.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New unit tests pass
    Tool: Bash (pnpm test)
    Preconditions: T3 harness fix and T4 seed update applied
    Steps:
      1. pnpm test -- --run tests/workers/opencode-harness-delivery.test.ts
      2. Assert 0 failures, verify new test names appear in output
    Expected Result: All tests pass including the 5 new ones
    Failure Indicators: Any test failure, new tests not found
    Evidence: .sisyphus/evidence/task-5-unit-tests.txt

  Scenario: Full test suite passes (no regressions)
    Tool: Bash (pnpm test)
    Preconditions: All code changes applied
    Steps:
      1. pnpm test -- --run 2>&1 | tail -20
      2. Assert 0 failures in final summary line
      3. Specifically verify: opencode-harness-delivery, employee-lifecycle-delivery, lifecycle-guest-delivery all show PASS
    Expected Result: 0 failures across entire suite
    Failure Indicators: Any test failure (other than known pre-existing: container-boot, inngest-serve)
    Evidence: .sisyphus/evidence/task-5-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(delivery): add unit tests for JSON pre-parse delivery path`
  - Files: `tests/workers/opencode-harness-delivery.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Docker Rebuild + Seed Apply

  **What to do**:
  - Rebuild the Docker worker image to include the harness fix:
    ```bash
    docker build -t ai-employee-worker:latest .
    ```
  - Verify the image is fresh:
    ```bash
    docker inspect ai-employee-worker:latest --format '{{.Created}}'
    ```
    Timestamp must be after the T3 commit.
  - Apply the updated seed to the database:
    ```bash
    pnpm prisma db seed
    ```
  - Verify the seed applied correctly by querying the archetype:
    ```bash
    curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=delivery_instructions,deliverable_type" \
      -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
    ```
    Verify `delivery_instructions` contains "pre-parsed" and `deliverable_type` is `hostfully_message`.

  **Must NOT do**:
  - Do NOT run `prisma migrate` — only seed, no schema changes
  - Do NOT push the Docker image to any registry
  - Do NOT modify any files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two commands (docker build + prisma seed) with verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `Dockerfile` — Build context for the worker image
  - `prisma/seed.ts` — Seed script that upserts archetypes

  **WHY Each Reference Matters**:
  - Dockerfile determines what gets baked into the image — harness changes in `src/workers/` must be compiled and included
  - Seed script upserts archetype rows — the updated delivery_instructions must be applied to the DB

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image rebuilt with fresh code
    Tool: Bash (docker)
    Preconditions: T3 harness fix committed
    Steps:
      1. docker build -t ai-employee-worker:latest .
      2. docker inspect ai-employee-worker:latest --format '{{.Created}}'
      3. Verify timestamp is within last 10 minutes
    Expected Result: Image built successfully, timestamp is recent
    Failure Indicators: Build failure, stale timestamp
    Evidence: .sisyphus/evidence/task-6-docker-build.txt

  Scenario: Seed applied with updated delivery_instructions
    Tool: Bash (prisma + curl)
    Preconditions: T4 seed changes committed
    Steps:
      1. pnpm prisma db seed
      2. source .env && curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=delivery_instructions,deliverable_type" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
      3. Verify delivery_instructions contains "pre-parsed"
      4. Verify deliverable_type is "hostfully_message"
    Expected Result: Archetype row updated with new instructions and correct type
    Failure Indicators: Seed error, old delivery_instructions still present, deliverable_type unchanged
    Evidence: .sisyphus/evidence/task-6-seed-apply.txt
  ```

  **Commit**: NO (build + apply, no code changes)

- [x] 7. E2E Verification — Trigger Webhook, Approve, Verify Delivery

  **What to do**:
  - Trigger a new guest-messaging task via webhook:
    ```bash
    curl -X POST http://localhost:7700/webhooks/hostfully \
      -H "Content-Type: application/json" \
      -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"fix-verify-'$(date +%s)'","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
    ```
  - Monitor the task through the lifecycle: Received → Ready → Executing → Submitting → Reviewing
  - When the approval card appears on Slack, approve it (or use the manual approval fallback curl)
  - Monitor the delivery container logs:
    ```bash
    docker logs employee-delivery-<task-prefix> 2>&1 | grep "send-message.ts"
    ```
  - **CRITICAL CHECK**: Verify `--lead-id` in the logs is the Hostfully lead UID (something like `37f5f58f-...`), NOT the task ID
  - If `HOSTFULLY_MOCK=true` is set in the environment: delivery will succeed with mock data. Verify mock response is `{"sent":true}`.
  - If using real Hostfully: verify the message appears in Hostfully inbox.
  - Check task reaches `Done` status (not `Failed`)
  - Clean up the delivery container after verification

  **Must NOT do**:
  - Do NOT modify any code
  - Do NOT skip the `--lead-id` log verification — this is the core acceptance criteria

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-step E2E verification requiring monitoring, approval, log inspection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Tasks 5, 6

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Hostfully Testing" — Test UIDs: thread `2f18249a-...`, lead `37f5f58f-...`, property `c960c8d2-...`
  - `AGENTS.md` § "Manual approval fallback" — curl command for manual approval
  - `src/inngest/employee-lifecycle.ts:1267` — Container naming: `employee-delivery-${taskId.slice(0, 8)}`

  **WHY Each Reference Matters**:
  - Test UIDs must match real Hostfully data for the webhook to succeed
  - Manual approval curl is the fallback if Slack buttons don't work
  - Container naming pattern tells us which container to check logs on

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Delivery container uses correct Hostfully lead-id
    Tool: Bash (curl + docker logs)
    Preconditions: Docker image rebuilt (T6), seed applied (T6), gateway restarted (T2)
    Steps:
      1. Trigger webhook with unique message_uid
      2. Capture task_id from response
      3. Poll task status until Reviewing: curl "http://localhost:54331/rest/v1/tasks?id=eq.<task_id>&select=status" every 15s
      4. Approve the task (Slack button or manual curl fallback)
      5. Wait for delivery container to appear: docker ps --filter name=employee-delivery-<task_id_prefix>
      6. Wait 60-90s for delivery to complete
      7. Check logs: docker logs employee-delivery-<prefix> 2>&1 | grep "send-message.ts"
      8. Verify --lead-id value is NOT the task ID
      9. Check task status reaches Done (or verify mock delivery succeeded)
    Expected Result: --lead-id matches Hostfully lead UID, task reaches Done
    Failure Indicators: --lead-id is the task ID, task reaches Failed, 404 error in logs
    Evidence: .sisyphus/evidence/task-7-e2e-delivery-logs.txt

  Scenario: Delivery fails gracefully on invalid JSON (negative test)
    Tool: Bash (manual DB modification + trigger)
    Preconditions: E2E infrastructure ready
    Steps:
      1. Note: This scenario verifies the fallback path. If possible, manually update a deliverable's content to be a non-JSON string and trigger delivery.
      2. Verify the delivery container falls back to raw passthrough (not crash)
      3. Check container logs for the warning about JSON parse failure
    Expected Result: Graceful fallback, warning log emitted, no crash
    Failure Indicators: Container crashes, unhandled exception, no warning log
    Evidence: .sisyphus/evidence/task-7-e2e-fallback.txt
  ```

  **Evidence to Capture:**
  - [ ] Delivery container logs showing correct --lead-id
  - [ ] Task status showing Done
  - [ ] Screenshot or log of the approved Slack message

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + lsp_diagnostics on changed files. Review `src/workers/opencode-harness.mts` and `prisma/seed.ts` changes for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Verify the pre-parse logic handles edge cases (null threadUid, empty draftResponse, non-JSON content).
      Output: `Tests [N pass/N fail] | Diagnostics [CLEAN/N issues] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Verify delivery container logs show correct `--lead-id`. Test with `HOSTFULLY_MOCK=true` for delivery phase. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no changes to `send-message.ts`, no changes to summarizer delivery instructions, no changes to `runOpencodeSession`. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [x] 8. **Notify completion** — Send Telegram notification: plan `delivery-404-harness-fix` complete, all tasks done, come back to review results.
  ```bash
  tsx scripts/telegram-notify.ts "✅ delivery-404-harness-fix complete — All tasks done. Come back to review results."
  ```

---

## Commit Strategy

| Group | Message                                                                      | Files                                                | Pre-commit           |
| ----- | ---------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------- |
| T3+T4 | `fix(delivery): parse deliverable JSON in harness instead of relying on LLM` | `src/workers/opencode-harness.mts`, `prisma/seed.ts` | `pnpm test -- --run` |
| T5    | `test(delivery): add unit tests for JSON pre-parse delivery path`            | `tests/workers/opencode-harness-delivery.test.ts`    | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                    # Expected: all pass, 0 failures
docker ps -a --filter name=employee-delivery --format '{{.Names}}'  # Expected: empty
docker inspect ai-employee-worker:latest --format '{{.Created}}'    # Expected: recent timestamp
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Delivery container logs show correct Hostfully lead UID, not task ID
- [ ] No orphaned containers remain
