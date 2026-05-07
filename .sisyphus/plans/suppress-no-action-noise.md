# Suppress NO_ACTION_NEEDED Slack Noise

## TL;DR

> **Quick Summary**: Eliminate noisy, context-free "No action needed" Slack messages by short-circuiting host-sent message webhooks before worker spin-up, completely removing the `unresponded-message-monitor` cron employee, and enriching the remaining NO_ACTION_NEEDED override cards with useful context (employee name, guest name, property, message snippet).
>
> **Deliverables**:
>
> - Lifecycle pre-check step that skips host-sent messages (Received → Done, no Slack, no worker)
> - Full removal of `unresponded-message-monitor` archetype, trigger code, test file, prompts, and historical data
> - Fix `parseClassifyResponse` early-exit path to preserve actual reasoning text
> - Enriched NO_ACTION_NEEDED override cards showing employee name, guest name, property, message snippet
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 7 → Task 8 → F1-F4

---

## Context

### Original Request

User reported frequent noisy Slack messages: "No action needed — AI decided to skip this task. Reasoning: Early exit — no messages to process" with zero context about what they relate to. Investigation revealed three distinct NO_ACTION_NEEDED scenarios generating this noise.

### Interview Summary

**Key Discussions**:

- Three sources of noise identified: (1) host-sent message webhooks hitting the full lifecycle pipeline, (2) LLM-classified no-action with context being discarded, (3) unresponded-message-monitor cron firing 48x/day as no-ops
- User wants host-sent messages to produce zero Slack output — no "Task received", no override card, nothing
- User wants the unresponded-message-monitor removed entirely (not just stopped)
- User wants remaining NO_ACTION_NEEDED cards enriched with employee name, guest name, property, message snippet
- Pre-check location: Inngest lifecycle step (user chose over gateway handler)
- Task row still gets created for audit trail but transitions Received → Done immediately

**Research Findings**:

- `parseClassifyResponse` line 28-38 has an early-exit path that discards the actual reason text (e.g. "Thread already responded to. Last message is from host.") and replaces it with hardcoded "Early exit — no messages to process"
- The Hostfully API provides `senderType` field on messages ("GUEST" or "AGENCY") — the pre-check can call the messages API endpoint directly to determine if last message is from host
- `raw_event` on the task record already contains `lead_uid` and `thread_uid` which can be used to query Hostfully API in the pre-check
- Hostfully API credentials are tenant secrets, available via `loadTenantEnv()` — the pre-check needs to load them
- The existing `get-messages.ts` shell tool already implements the "check last message sender" logic — the lifecycle pre-check needs a similar lightweight check

### Self-Conducted Gap Analysis (Metis unavailable — descendant limit)

**Identified Gaps** (addressed in plan):

- Pre-check API failure fallback: Default to proceeding normally (safe fallback) — addressed in Task 1
- Pre-check placement: Must go BEFORE `notify-received` step to avoid "Task received" noise — addressed in Task 1
- Historical data cleanup order: Must respect FK constraints (deliverables → tasks) — addressed in Task 3
- Edge case: Tasks stuck in Submitting for monitor archetype (waiting for override events) — addressed in Task 3
- Hostfully API rate limiting during webhook bursts: Pre-check uses single lightweight API call — minimal risk
- Monitor archetype may have `learned_rules` or `feedback` data — addressed in Task 3
- `classify-message.ts` early-exit discards reason text — addressed in Task 2

---

## Work Objectives

### Core Objective

Eliminate all three sources of noisy, context-free "No action needed" Slack messages so the notification channel only shows messages that require human attention or provide useful context.

### Concrete Deliverables

- New `pre-check-host-message` step in `src/inngest/employee-lifecycle.ts` that short-circuits before `notify-received`
- Updated `src/lib/classify-message.ts` early-exit path that preserves actual reason text
- Enriched override card builder in `src/inngest/employee-lifecycle.ts` with employee name, guest name, property, message snippet
- Removed files: `src/inngest/triggers/monitor-trigger.ts`, `prisma/prompts/unresponded-message-monitor.ts`, `tests/inngest/triggers/monitor-trigger.test.ts`
- Updated `src/gateway/inngest/serve.ts` (monitor registration removed)
- Updated `prisma/seed.ts` (archetype 0016 removed)
- DB cleanup script for historical monitor tasks/deliverables

### Definition of Done

- [ ] Host-sent messages produce zero Slack notifications and zero worker spin-ups
- [ ] No `unresponded-message-monitor` code exists in codebase
- [ ] No historical tasks/deliverables for archetype 0016 remain in DB
- [ ] LLM-classified NO_ACTION_NEEDED cards show employee name, guest name, property, message snippet
- [ ] Early-exit NO_ACTION_NEEDED cards show the actual reason text from the worker (not hardcoded "Early exit")
- [ ] `pnpm test -- --run` passes (minus known pre-existing failures)
- [ ] `pnpm build` succeeds

### Must Have

- Pre-check BEFORE `notify-received` step — no "Task received" message for host-sent messages
- Task row still created for audit trail (Received → Done, no worker)
- Safe fallback: if Hostfully API fails during pre-check, proceed normally (don't break the pipeline)
- Override card shows: employee name, guest name, property name, original message snippet
- Full monitor removal: code + seed + historical data

### Must NOT Have (Guardrails)

- Do NOT modify `createTaskAndDispatch` — shared infrastructure
- Do NOT modify the Hostfully webhook route handler (`src/gateway/routes/hostfully.ts`) — user explicitly chose lifecycle approach
- Do NOT modify the LLM classification logic or system prompt
- Do NOT modify `get-messages.ts` shell tool
- Do NOT add any new cron triggers for guest messaging
- Do NOT use employee-specific language in shared files (per AGENTS.md convention) — the pre-check must be generic/archetype-driven
- Do NOT add excessive error handling or over-abstract the pre-check (AI slop pattern)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after) — add unit tests for the pre-check utility and updated classify-message
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests to Inngest/gateway, assert status + DB state
- **Library/Module**: Use Bash (vitest) — Run targeted test files, assert pass/fail

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent foundation work):
├── Task 1: Hostfully pre-check utility function [deep]
├── Task 2: Fix parseClassifyResponse early-exit path [quick]
├── Task 3: Remove unresponded-message-monitor (code + seed + data) [unspecified-high]

Wave 2 (After Wave 1 — integration into lifecycle):
├── Task 4: Add pre-check lifecycle step (depends: 1) [deep]
├── Task 5: Enrich override card with context fields (depends: 2) [unspecified-high]
├── Task 6: Update AGENTS.md to remove monitor references (depends: 3) [quick]

Wave 3 (After Wave 2 — tests + verification):
├── Task 7: Add tests for pre-check + updated classify-message (depends: 1, 2, 4) [unspecified-high]
├── Task 8: Build + full test suite verification (depends: all) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 4, 7   | 1    |
| 2    | —          | 5, 7   | 1    |
| 3    | —          | 6      | 1    |
| 4    | 1          | 7, 8   | 2    |
| 5    | 2          | 8      | 2    |
| 6    | 3          | 8      | 2    |
| 7    | 1, 2, 4    | 8      | 3    |
| 8    | all        | F1-F4  | 3    |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `deep`, T2 → `quick`, T3 → `unspecified-high`
- **Wave 2**: **3 tasks** — T4 → `deep`, T5 → `unspecified-high`, T6 → `quick`
- **Wave 3**: **2 tasks** — T7 → `unspecified-high`, T8 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Create Hostfully pre-check utility function

  **What to do**:
  - Create a new file `src/lib/hostfully-precheck.ts` with a pure utility function `checkLastMessageSender()`
  - The function takes: `leadUid: string`, `apiKey: string`, `apiBaseUrl?: string`
  - It calls `GET {apiBaseUrl}/messages?leadUid={leadUid}&_limit=5` with the `X-HOSTFULLY-APIKEY` header
  - Parses the response envelope `{ messages: [...] }`, sorts by `createdUtcDateTime`, checks the last message's `senderType`
  - Returns `{ lastSenderIsHost: boolean, error?: string }` — if `senderType === 'AGENCY'` on the last message, `lastSenderIsHost = true`
  - On ANY error (network failure, parse error, missing API key, empty messages array), return `{ lastSenderIsHost: false }` — safe fallback means "proceed normally"
  - Do NOT import or depend on any Inngest/Prisma code — this is a pure HTTP utility
  - Keep it minimal: ~40-60 lines. No classes, no abstractions, just one exported async function
  - Use the same `RawMessage` type shape from `src/worker-tools/hostfully/get-messages.ts` (lines 46-56) for the API response, but define it locally (don't import from worker-tools — different runtime context)

  **Must NOT do**:
  - Do NOT use employee-specific language in the function name or comments (it's in shared `src/lib/`)
  - Do NOT add retry logic — single attempt with safe fallback is sufficient
  - Do NOT add logging — the caller (lifecycle step) will log
  - Do NOT import from `src/worker-tools/` — different runtime context

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding of Hostfully API contract, error handling edge cases, and integration context
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4, Task 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/worker-tools/hostfully/get-messages.ts:46-56` — `RawMessage` type definition showing exact Hostfully API response shape (`uid`, `content`, `senderType`, `createdUtcDateTime`)
  - `src/worker-tools/hostfully/get-messages.ts:200-202` — API headers pattern: `{ 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json' }`
  - `src/worker-tools/hostfully/get-messages.ts:221-231` — Message envelope parsing: response is `{ messages?: RawMessage[] }`, sort by `createdUtcDateTime`, check last `senderType`

  **API/Type References** (contracts to implement against):
  - `src/worker-tools/hostfully/get-messages.ts:17-18` — Sender detection logic: `senderType` is "GUEST" (inbound) or "AGENCY" (outbound/host). No server-side "unresponded" filter.
  - `src/worker-tools/hostfully/get-messages.ts:25-28` — Confirmed live API envelope: `{ messages: [...], _metadata: {...}, _paging: { _nextCursor: "..." } }`

  **External References**:
  - Hostfully API base URL: `https://api.hostfully.com/api/v3.2` (default, from `get-messages.ts:200`)

  **WHY Each Reference Matters**:
  - The `RawMessage` type and API headers show the exact contract to call — copy the shape, not the import
  - The sender detection logic shows exactly how to determine "host sent last message" — `senderType === 'AGENCY'` means host
  - The envelope parsing shows the nesting: `response.messages` is the array, not the response itself

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Utility returns lastSenderIsHost=true when last message is from AGENCY
    Tool: Bash (vitest)
    Preconditions: File `src/lib/hostfully-precheck.ts` exists and exports `checkLastMessageSender`
    Steps:
      1. Create an inline test that mocks `fetch` to return `{ messages: [{ uid: "1", senderType: "GUEST", createdUtcDateTime: "2026-01-01T00:00:00Z" }, { uid: "2", senderType: "AGENCY", createdUtcDateTime: "2026-01-01T01:00:00Z" }] }`
      2. Call `checkLastMessageSender("lead-123", "fake-key")`
      3. Assert result is `{ lastSenderIsHost: true }`
    Expected Result: Function correctly identifies AGENCY as host sender
    Failure Indicators: `lastSenderIsHost` is `false` when last message is AGENCY
    Evidence: .sisyphus/evidence/task-1-host-sender-detected.txt

  Scenario: Utility returns lastSenderIsHost=false on API failure (safe fallback)
    Tool: Bash (vitest)
    Preconditions: File exists
    Steps:
      1. Mock `fetch` to throw a network error
      2. Call `checkLastMessageSender("lead-123", "fake-key")`
      3. Assert result is `{ lastSenderIsHost: false }`
    Expected Result: Function falls back to "proceed normally" on error
    Failure Indicators: Function throws an error instead of returning safe fallback
    Evidence: .sisyphus/evidence/task-1-api-failure-fallback.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `fix(lifecycle): add Hostfully pre-check utility and preserve early-exit reasoning`
  - Files: `src/lib/hostfully-precheck.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Fix parseClassifyResponse early-exit path to preserve actual reasoning

  **What to do**:
  - In `src/lib/classify-message.ts`, modify the early-exit path (lines 28-38) that matches `responseText.trim().startsWith('NO_ACTION_NEEDED:')`
  - Currently: hardcodes `reasoning: 'Early exit — no messages to process'` regardless of what the worker wrote
  - Fix: Extract the actual text after the `NO_ACTION_NEEDED:` prefix and use it as the `reasoning` field
  - Example: input `"NO_ACTION_NEEDED: Thread already responded to. Last message is from host."` → `reasoning: "Thread already responded to. Last message is from host."`
  - Also set `summary` to the full `responseText.trim()` (already correct)
  - The change is ~2 lines: replace the hardcoded string with `responseText.trim().replace(/^NO_ACTION_NEEDED:\s*/, '')` or similar

  **Must NOT do**:
  - Do NOT change the JSON parsing path (lines 41-105) — that works correctly
  - Do NOT change the `ClassifyResult` interface
  - Do NOT add new fields to the early-exit return

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 2-line change, obvious fix
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 5, Task 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/classify-message.ts:28-38` — The exact early-exit code block to modify. Line 37 has the hardcoded reasoning string to replace.

  **WHY Each Reference Matters**:
  - This IS the code to change — read it, understand the current hardcoded string, replace with extracted text

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Early-exit preserves actual reason text
    Tool: Bash (node REPL or vitest)
    Preconditions: `src/lib/classify-message.ts` has been modified
    Steps:
      1. Import `parseClassifyResponse` from the module
      2. Call `parseClassifyResponse("NO_ACTION_NEEDED: Thread already responded to. Last message is from host.")`
      3. Assert `result.reasoning === "Thread already responded to. Last message is from host."`
      4. Assert `result.classification === "NO_ACTION_NEEDED"`
    Expected Result: Reasoning contains the actual text after the prefix, not the hardcoded string
    Failure Indicators: `result.reasoning` still equals "Early exit — no messages to process"
    Evidence: .sisyphus/evidence/task-2-early-exit-reasoning.txt

  Scenario: Early-exit still works for bare prefix
    Tool: Bash (node REPL or vitest)
    Preconditions: Module modified
    Steps:
      1. Call `parseClassifyResponse("NO_ACTION_NEEDED:")`
      2. Assert `result.classification === "NO_ACTION_NEEDED"`
      3. Assert `result.reasoning` is empty string or a sensible default (not undefined/null)
    Expected Result: Edge case of no text after prefix doesn't crash
    Failure Indicators: Function throws or returns undefined reasoning
    Evidence: .sisyphus/evidence/task-2-bare-prefix-edge-case.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `fix(lifecycle): add Hostfully pre-check utility and preserve early-exit reasoning`
  - Files: `src/lib/classify-message.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Remove unresponded-message-monitor employee entirely

  **What to do**:
  - **Delete files**:
    - `src/inngest/triggers/monitor-trigger.ts` — the cron trigger function
    - `prisma/prompts/unresponded-message-monitor.ts` — the system prompt / instructions
    - `tests/inngest/triggers/monitor-trigger.test.ts` — the test file
  - **Update `src/gateway/inngest/serve.ts`**:
    - Remove the import: `import { createMonitorTrigger } from '../../inngest/triggers/monitor-trigger.js';` (line 12)
    - Remove the function creation: `const monitorTriggerFn = createMonitorTrigger(inngest);` (line 36)
    - Remove from the functions array: `monitorTriggerFn,` (line 50)
  - **Update `prisma/seed.ts`**:
    - Remove the import of `UNRESPONDED_MONITOR_SYSTEM_PROMPT` and `VLRE_UNRESPONDED_MONITOR_INSTRUCTIONS` from `./prompts/unresponded-message-monitor.js` (line 9)
    - Remove the entire `vlreUnrespondedMonitor` upsert block (lines ~3348-3389+)
    - Remove any `console.log` referencing the upserted monitor archetype
  - **Historical data cleanup** — Create and run a SQL cleanup script:
    - First, handle any tasks stuck in non-terminal states for archetype 0016: `UPDATE tasks SET status = 'Cancelled', updated_at = NOW() WHERE archetype_id = '00000000-0000-0000-0000-000000000016' AND status NOT IN ('Done', 'Failed', 'Cancelled');`
    - Delete deliverables: `DELETE FROM deliverables WHERE external_ref IN (SELECT id::text FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016');`
    - Delete task status logs: `DELETE FROM task_status_log WHERE task_id IN (SELECT id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016');`
    - Delete tasks: `DELETE FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016';`
    - Delete any learned_rules for the archetype: `DELETE FROM learned_rules WHERE archetype_id = '00000000-0000-0000-0000-000000000016';`
    - Delete any feedback for those tasks: `DELETE FROM feedback WHERE task_id IN (SELECT id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016');` (run BEFORE deleting tasks)
    - Delete any knowledge_bases entries: `DELETE FROM knowledge_bases WHERE archetype_id = '00000000-0000-0000-0000-000000000016';`
    - Delete the archetype itself: `DELETE FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000016';`
    - **Order matters** for FK constraints: feedback → deliverables → task_status_log → pending_approvals → tasks → learned_rules → knowledge_bases → archetypes
    - Save the script as `scripts/cleanup-monitor-archetype.sql` and execute via `psql`
    - After execution, verify: `SELECT COUNT(*) FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016';` → 0
    - After execution, verify: `SELECT COUNT(*) FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000016';` → 0

  **Must NOT do**:
  - Do NOT modify `createTaskAndDispatch` — it's shared infrastructure
  - Do NOT modify any other trigger files
  - Do NOT leave any dangling imports or references to the monitor

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-file deletion, seed modification, SQL data cleanup — requires careful FK ordering
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts:12,36,50` — The three lines to remove (import, creation, array entry)
  - `prisma/seed.ts:9` — The import to remove
  - `prisma/seed.ts:3348-3389` — The entire upsert block to remove

  **API/Type References**:
  - `src/inngest/triggers/monitor-trigger.ts` (full file, 55 lines) — The file to delete, read to confirm it's self-contained
  - `prisma/prompts/unresponded-message-monitor.ts` — The prompts file to delete
  - `tests/inngest/triggers/monitor-trigger.test.ts` — The test file to delete

  **WHY Each Reference Matters**:
  - serve.ts references show exactly which lines to remove to deregister the function
  - seed.ts references show the upsert block boundaries for clean removal
  - The trigger, prompts, and test files confirm there are no other dependents

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No monitor code remains in codebase
    Tool: Bash (grep)
    Preconditions: All files deleted/updated
    Steps:
      1. Run `grep -r "unresponded-message-monitor" src/ prisma/ tests/ --include="*.ts" -l`
      2. Assert zero files returned
      3. Run `grep -r "createMonitorTrigger" src/ tests/ --include="*.ts" -l`
      4. Assert zero files returned
    Expected Result: No references to the monitor exist in source, seed, or test files
    Failure Indicators: Any file still references the monitor
    Evidence: .sisyphus/evidence/task-3-no-monitor-references.txt

  Scenario: Build succeeds after removal
    Tool: Bash
    Preconditions: All files deleted/updated
    Steps:
      1. Run `pnpm build`
      2. Assert exit code 0
    Expected Result: TypeScript compiles cleanly with no missing import errors
    Failure Indicators: Compile error referencing deleted monitor module
    Evidence: .sisyphus/evidence/task-3-build-after-removal.txt

  Scenario: Historical data cleaned from DB
    Tool: Bash (psql)
    Preconditions: Cleanup script executed
    Steps:
      1. Run `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT COUNT(*) FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016';"`
      2. Assert count = 0
      3. Run `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT COUNT(*) FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000016';"`
      4. Assert count = 0
    Expected Result: All monitor data purged from database
    Failure Indicators: Any count > 0
    Evidence: .sisyphus/evidence/task-3-db-cleanup-verified.txt
  ```

  **Commit**: YES
  - Message: `chore(cleanup): remove unresponded-message-monitor employee entirely`
  - Files: (deleted) `src/inngest/triggers/monitor-trigger.ts`, `prisma/prompts/unresponded-message-monitor.ts`, `tests/inngest/triggers/monitor-trigger.test.ts`; (modified) `src/gateway/inngest/serve.ts`, `prisma/seed.ts`; (new) `scripts/cleanup-monitor-archetype.sql`
  - Pre-commit: `pnpm build`

- [x] 4. Add pre-check lifecycle step before notify-received

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, add a new step `pre-check-skip-host-message` AFTER the `load-task` step (line 128) and BEFORE the `triaging` step (line 141)
  - The step should:
    1. Check if the archetype's `role_name` has a pre-check configured. For now, only `guest-messaging` triggers the pre-check. Use a simple condition: `if (archetype.role_name === 'guest-messaging')` — this is NOT employee-specific language in the sense banned by AGENTS.md, because it's reading the archetype config value, not hardcoding behavior into shared logic. The archetype name IS the config.
    2. Extract `lead_uid` from `taskData.raw_event`
    3. If `lead_uid` exists, load tenant secrets via `loadTenantEnv()` to get `HOSTFULLY_API_KEY`
    4. Call `checkLastMessageSender(leadUid, apiKey)` from `src/lib/hostfully-precheck.ts`
    5. If `lastSenderIsHost === true`:
       - Patch task status to `Done` via `patchTask()`
       - Log status transition: `Received → Done`
       - Log: `'Pre-check: last message from host — skipping (no worker, no notification)'`
       - Return early from the function (no further lifecycle steps)
    6. If `lastSenderIsHost === false` or no `lead_uid` or API error: continue normally (do nothing, fall through to triaging)
  - Import `checkLastMessageSender` from `../lib/hostfully-precheck.js`
  - The step must be BEFORE `notify-received` — this is the critical requirement. No Slack message, no worker, no machine provisioning.
  - The task row remains in DB with status `Done` — audit trail preserved.

  **Must NOT do**:
  - Do NOT add a new Slack notification for skipped tasks — the whole point is ZERO Slack output
  - Do NOT delete the task row — keep for audit trail
  - Do NOT add excessive logging — one log line is enough
  - Do NOT make the pre-check block other archetypes — the condition check ensures only `guest-messaging` runs it

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying the lifecycle function requires understanding the step ordering, Inngest step semantics, and early return behavior
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 7, Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:120-128` — `load-task` step that provides `taskData` and `archetype` — the pre-check goes immediately after this
  - `src/inngest/employee-lifecycle.ts:141-145` — `triaging` step — the pre-check must be BEFORE this
  - `src/inngest/employee-lifecycle.ts:148-187` — `notify-received` step — the pre-check must be BEFORE this (this is what we're preventing from firing)
  - `src/inngest/employee-lifecycle.ts:229-234` — How `raw_event` fields are extracted (property_uid, lead_uid, etc.) — same pattern for the pre-check
  - `src/inngest/employee-lifecycle.ts:25-40` — `patchTask` helper — use this to set status to Done
  - `src/inngest/employee-lifecycle.ts:42-64` — `logStatusTransition` helper — use this for the Received → Done transition

  **API/Type References**:
  - `src/lib/hostfully-precheck.ts` (created in Task 1) — The `checkLastMessageSender` function to call
  - `src/inngest/employee-lifecycle.ts:130-137` — How `archetype` and `tenantId` are extracted from `taskData`

  **WHY Each Reference Matters**:
  - Lines 120-128 and 141-145 show the exact insertion point — between load-task and triaging
  - Lines 229-234 show how to extract raw_event fields safely
  - Lines 25-64 show the helper functions available for status updates
  - Lines 148-187 is what we're PREVENTING from running — understanding its behavior confirms we need to be before it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Host-sent message webhook produces zero Slack notifications
    Tool: Bash (curl + psql)
    Preconditions: Services running (`pnpm dev`), Hostfully API accessible, a thread exists where the last message is from the host (senderType=AGENCY)
    Steps:
      1. Note the current count of Slack messages in the notification channel
      2. Send a webhook: `curl -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"precheck-test-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'`
      3. Wait 10 seconds for lifecycle to process
      4. Query DB: `SELECT status FROM tasks WHERE external_id = 'hostfully-msg-precheck-test-001';`
      5. Assert status = 'Done'
      6. Confirm no new Slack messages were posted (check gateway logs for absence of "notify-received" and "post-override-card" for this task)
    Expected Result: Task goes Received → Done with no Slack output, no worker provisioned
    Failure Indicators: Task status is not Done, or "Task received" Slack message appears, or a worker machine was created
    Evidence: .sisyphus/evidence/task-4-host-message-skipped.txt

  Scenario: Guest-sent message still proceeds normally through lifecycle
    Tool: Bash (curl + psql)
    Preconditions: Services running, a thread exists where last message is from guest (senderType=GUEST)
    Steps:
      1. Send a webhook with a thread that has an unresponded guest message
      2. Wait 15 seconds
      3. Query DB: `SELECT status FROM tasks WHERE external_id = 'hostfully-msg-precheck-test-002';`
      4. Assert status is NOT 'Done' immediately — should be in Executing/Submitting/Reviewing
    Expected Result: Guest messages proceed through normal lifecycle (pre-check doesn't block them)
    Failure Indicators: Task immediately goes to Done despite guest having sent the last message
    Evidence: .sisyphus/evidence/task-4-guest-message-proceeds.txt

  Scenario: Pre-check API failure falls through to normal lifecycle
    Tool: Bash (curl + psql)
    Preconditions: Services running, Hostfully API key is invalid or network is unreachable
    Steps:
      1. Temporarily set an invalid HOSTFULLY_API_KEY in tenant_secrets
      2. Send a webhook
      3. Wait 15 seconds
      4. Assert task proceeds past pre-check (status > Received)
    Expected Result: API failure doesn't block the pipeline — task proceeds normally
    Failure Indicators: Task stuck in Received or errors out
    Evidence: .sisyphus/evidence/task-4-precheck-api-failure-fallthrough.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(lifecycle): pre-check host messages and enrich NO_ACTION_NEEDED cards`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Enrich NO_ACTION_NEEDED override cards with context fields

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, modify the `post-override-card` step (lines 578-669) to include richer context
  - Currently the card shows: `🤖 *No action needed* — AI decided to skip this task.\n\n*Reasoning:* ${reasoning}` plus optional `displayContext` fields
  - Add the following context to the card blocks when available:
    1. **Employee name**: Use `archetype.role_name` (already available in scope as the `archetype` variable) — add it to the section text: `_Employee: ${roleName}_`
    2. **Guest name + Property + Message snippet**: These come from `classificationCheck.displayContext` when the LLM provides them. The JSON path in `parseClassifyResponse` already synthesizes `displayContext` from `guestName`, `propertyName`, etc. (lines 71-82 of classify-message.ts). After Task 2's fix, the early-exit path will also have useful reasoning text.
  - The enrichment approach:
    - Add `roleName` (from `archetype.role_name`, already in scope at line 163) to the section text, e.g.: `🤖 *No action needed* — AI decided to skip this task.\n_Employee: ${roleName}_\n\n*Reasoning:* ${reasoning}`
    - The `displayContext` fields (Guest, Property, Check-in, etc.) are already rendered as context block elements (lines 602-605). This works for LLM-classified responses. No change needed for those.
    - For the early-exit path (after Task 2 fix): The reasoning will now contain the actual text like "Thread already responded to. Last message is from host." — this alone is a significant improvement over the hardcoded string.
  - Also check: if `taskData.raw_event` contains `property_uid`, `lead_uid`, or `thread_uid`, add those as small context elements at the bottom of the card so the user can trace back to the source. Add them as a context block: `Property: ${property_uid} | Lead: ${lead_uid}` (only if they exist).

  **Must NOT do**:
  - Do NOT make external API calls in the override card builder — use only data already available in memory (taskData, archetype, classificationCheck)
  - Do NOT change the card layout dramatically — keep the existing structure, just add fields
  - Do NOT add the context fields if they're empty/undefined (check before adding)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding Slack Block Kit structure, the data flow from classify-message through to the card builder, and careful handling of optional fields
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:578-669` — The entire `post-override-card` step — this is the code to modify
  - `src/inngest/employee-lifecycle.ts:599-605` — How `displayContext` is already used to build context fields
  - `src/inngest/employee-lifecycle.ts:607-618` — Existing block structure: section → context → divider → actions → task ID context
  - `src/inngest/employee-lifecycle.ts:163` — Where `roleName` is extracted: `const roleName = (archetype.role_name as string) ?? 'unknown';`
  - `src/inngest/employee-lifecycle.ts:229-234` — Where `rawEvent` fields are extracted (property_uid, lead_uid, etc.)

  **API/Type References**:
  - `src/lib/classify-message.ts:10` — `displayContext?: Record<string, string>` — optional field on ClassifyResult
  - `src/lib/classify-message.ts:71-82` — How displayContext is synthesized from individual fields (guestName, propertyName, etc.)

  **WHY Each Reference Matters**:
  - Lines 578-669 are the exact code to modify — understand the current block structure before adding
  - Line 163 shows roleName is already available — no new data loading needed
  - Lines 229-234 show raw_event extraction pattern — use same approach for property_uid/lead_uid in the card

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Override card shows employee name
    Tool: Bash (code review)
    Preconditions: Modified post-override-card step
    Steps:
      1. Read `src/inngest/employee-lifecycle.ts` and find the post-override-card step
      2. Verify the section text includes `_Employee: ${roleName}_` or equivalent
      3. Verify `roleName` is in scope (it's defined at line 163, but check it's accessible within the post-override-card step — it may need to be passed or re-derived from `archetype`)
    Expected Result: Employee name appears in the card text
    Failure Indicators: roleName not accessible in scope, or not included in the blocks
    Evidence: .sisyphus/evidence/task-5-employee-name-in-card.txt

  Scenario: Override card shows raw_event trace info when available
    Tool: Bash (code review)
    Preconditions: Modified post-override-card step
    Steps:
      1. Check that the card builder reads `taskData.raw_event` for property_uid, lead_uid
      2. Verify these are added as context elements only when present (not empty strings)
      3. Verify the context block format: `Property: c960c8d2... | Lead: 37f5f58f...`
    Expected Result: Trace info appears in card when raw_event has these fields
    Failure Indicators: raw_event fields not checked, or always rendered even when empty
    Evidence: .sisyphus/evidence/task-5-trace-info-in-card.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(lifecycle): pre-check host messages and enrich NO_ACTION_NEEDED cards`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Update AGENTS.md to remove monitor references

  **What to do**:
  - In `AGENTS.md`, find and remove all references to:
    - `trigger/unresponded-message-monitor` in the Inngest functions list
    - `unresponded-message-monitor` cron description (`*/30 * * * *`, `src/inngest/triggers/monitor-trigger.ts`)
    - Any mention of the monitor archetype ID `00000000-0000-0000-0000-000000000016`
  - Specifically:
    - In the "Inngest functions" bullet list, remove the entry for `trigger/unresponded-message-monitor`
    - The Deprecated Components table does NOT include the monitor (it was active), so no change needed there
  - Also add a brief note about the pre-check behavior in the Guest-Messaging Employee section:
    - Under the inbound flow, note that host-sent messages are short-circuited in the lifecycle (Received → Done, no worker)

  **Must NOT do**:
  - Do NOT rewrite large sections of AGENTS.md — minimal, surgical updates only
  - Do NOT add new sections — just update existing content

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple text edits in a markdown file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Search for `unresponded-message-monitor`, `monitor-trigger`, and `000000000016` to find all references

  **WHY Each Reference Matters**:
  - AGENTS.md is loaded into every LLM call — stale references waste tokens and cause confusion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No monitor references remain in AGENTS.md
    Tool: Bash (grep)
    Preconditions: AGENTS.md updated
    Steps:
      1. Run `grep -c "unresponded-message-monitor" AGENTS.md`
      2. Assert count = 0
      3. Run `grep -c "monitor-trigger" AGENTS.md`
      4. Assert count = 0
      5. Run `grep -c "000000000016" AGENTS.md`
      6. Assert count = 0
    Expected Result: All monitor references removed
    Failure Indicators: Any count > 0
    Evidence: .sisyphus/evidence/task-6-agents-md-clean.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md to remove monitor references`
  - Files: `AGENTS.md`
  - Pre-commit: N/A (markdown only)

- [x] 7. Add tests for pre-check utility and updated classify-message

  **What to do**:
  - **New test file**: `tests/lib/hostfully-precheck.test.ts`
    - Test `checkLastMessageSender` with mocked `fetch`:
      - Last message `senderType: 'AGENCY'` → `lastSenderIsHost: true`
      - Last message `senderType: 'GUEST'` → `lastSenderIsHost: false`
      - Empty messages array → `lastSenderIsHost: false`
      - Network error → `lastSenderIsHost: false` (safe fallback)
      - Malformed JSON → `lastSenderIsHost: false`
      - Missing API key (empty string) → still attempts call, falls back on failure
    - Mock `globalThis.fetch` using `vi.fn()` — return appropriate Response objects
  - **Update existing test file**: `tests/lib/classify-message.test.ts` (if it exists, otherwise create it)
    - Add test for the early-exit path:
      - Input: `"NO_ACTION_NEEDED: Thread already responded to. Last message is from host."` → reasoning should be `"Thread already responded to. Last message is from host."`
      - Input: `"NO_ACTION_NEEDED:"` → reasoning should be empty string or sensible default
      - Input: `"NO_ACTION_NEEDED: "` (with trailing space) → reasoning should be empty string
    - Ensure existing JSON-path tests still pass (don't break them)

  **Must NOT do**:
  - Do NOT import from `src/worker-tools/` in tests
  - Do NOT make real HTTP calls — mock everything
  - Do NOT test the lifecycle integration here — that's covered by QA scenarios in Task 4

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, thorough edge case coverage, mock setup
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 1, 2, 4 being complete)
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2, 4

  **References**:

  **Pattern References**:
  - `tests/inngest/triggers/monitor-trigger.test.ts` — Example of how Inngest-related tests mock dependencies (read before deleting in Task 3 — use as pattern reference)
  - `tests/lib/classify-message.test.ts` — May or may not exist; if it does, follow its pattern

  **Test References**:
  - `src/lib/hostfully-precheck.ts` (created in Task 1) — The module under test
  - `src/lib/classify-message.ts` (modified in Task 2) — The module under test

  **WHY Each Reference Matters**:
  - Existing test patterns show how the project mocks `fetch` and structures assertions
  - The modules under test define the exact API to test against

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash (vitest)
    Preconditions: Test files created
    Steps:
      1. Run `pnpm test -- --run tests/lib/hostfully-precheck.test.ts`
      2. Assert all tests pass (expect 5-6 test cases)
      3. Run `pnpm test -- --run tests/lib/classify-message.test.ts`
      4. Assert all tests pass (expect 3+ test cases for early-exit, plus any existing tests)
    Expected Result: All tests green
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-tests-pass.txt

  Scenario: No existing tests broken
    Tool: Bash (vitest)
    Preconditions: All code changes from previous tasks applied
    Steps:
      1. Run `pnpm test -- --run`
      2. Assert no new test failures compared to baseline (known pre-existing failures: container-boot.test.ts, inngest-serve.test.ts)
    Expected Result: Same or fewer test failures than baseline
    Failure Indicators: New test failures not present before this plan
    Evidence: .sisyphus/evidence/task-7-no-regressions.txt
  ```

  **Commit**: YES
  - Message: `test: add tests for pre-check utility and updated classify-message`
  - Files: `tests/lib/hostfully-precheck.test.ts`, `tests/lib/classify-message.test.ts`
  - Pre-commit: `pnpm test -- --run tests/lib/hostfully-precheck.test.ts tests/lib/classify-message.test.ts`

- [x] 8. Build + full test suite verification

  **What to do**:
  - Run full verification suite to confirm nothing is broken:
    1. `pnpm build` — TypeScript compiles cleanly
    2. `pnpm lint` — No new lint errors
    3. `pnpm test -- --run` — All tests pass (minus known pre-existing failures: `container-boot.test.ts`, `inngest-serve.test.ts`)
  - If any failures: diagnose and fix. Common issues:
    - Missing import after file deletion → fix the dangling import
    - Test count mismatch in `inngest-serve.test.ts` → this is a known pre-existing failure, ignore it. However, if the function count changed because we removed the monitor, the test might actually need updating (from N to N-1 functions). Check if this test asserts function count — if so, update it.
    - Type errors from the new pre-check → fix in the source file
  - After all green: confirm with a final `git status` to see all changed files

  **Must NOT do**:
  - Do NOT skip test failures — investigate each one
  - Do NOT use `--no-verify` on any commits

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running commands and reading output — no complex code changes expected
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (final verification — depends on everything)
  - **Parallel Group**: Wave 3 (sequential after Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: All previous tasks

  **References**:

  **Pattern References**:
  - `AGENTS.md` — "Pre-existing Test Failures" section lists known failures to ignore

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build + test suite passes
    Tool: Bash
    Preconditions: All tasks 1-7 complete
    Steps:
      1. Run `pnpm build` — assert exit code 0
      2. Run `pnpm lint` — assert exit code 0 or only pre-existing warnings
      3. Run `pnpm test -- --run` — assert pass count ≥ 510 (baseline ~515, minus deleted monitor tests)
    Expected Result: Clean build, clean lint, tests pass
    Failure Indicators: Build failure, new lint errors, new test failures
    Evidence: .sisyphus/evidence/task-8-full-verification.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Tasks | Message                                                                             | Files                                                                                                                                                                                                                        |
| ------ | ----- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | 1, 2  | `fix(lifecycle): add Hostfully pre-check utility and preserve early-exit reasoning` | `src/lib/hostfully-precheck.ts`, `src/lib/classify-message.ts`                                                                                                                                                               |
| 2      | 3     | `chore(cleanup): remove unresponded-message-monitor employee entirely`              | `src/inngest/triggers/monitor-trigger.ts` (deleted), `prisma/prompts/unresponded-message-monitor.ts` (deleted), `tests/inngest/triggers/monitor-trigger.test.ts` (deleted), `src/gateway/inngest/serve.ts`, `prisma/seed.ts` |
| 3      | 4, 5  | `feat(lifecycle): pre-check host messages and enrich NO_ACTION_NEEDED cards`        | `src/inngest/employee-lifecycle.ts`                                                                                                                                                                                          |
| 4      | 6     | `docs: update AGENTS.md to remove monitor references`                               | `AGENTS.md`                                                                                                                                                                                                                  |
| 5      | 7     | `test: add tests for pre-check utility and updated classify-message`                | `tests/lib/hostfully-precheck.test.ts`, `tests/lib/classify-message.test.ts`                                                                                                                                                 |
| 6      | 8     | N/A — verification only, no commit                                                  |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: clean build, no errors
pnpm test -- --run            # Expected: all pass (minus known pre-existing failures)
pnpm lint                     # Expected: no new lint errors
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
- [x] No monitor code remains in codebase
- [x] Host-sent messages produce zero Slack messages
- [x] NO_ACTION_NEEDED cards show useful context

---

## Telegram Notification

- [x] **9. Notify completion** — Send Telegram notification: plan `suppress-no-action-noise` complete, all tasks done, come back to review results.
