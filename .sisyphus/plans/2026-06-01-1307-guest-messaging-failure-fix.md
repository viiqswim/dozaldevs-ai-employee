# Fix Guest-Messaging AI Employee Failures

## TL;DR

> **Quick Summary**: Fix the guest-messaging AI employee which is failing ~88% of the time because deepseek/deepseek-v4-flash stops after writing the draft reply (step 6) and never calls post-guest-approval.ts (step 7). Three compounding code issues plus an intermittent env var injection problem.
>
> **Deliverables**:
>
> - Fixed `agents-md-compiler.mts` — deduplicated STOP directives
> - Fixed `opencode-harness.mts` — recovery nudge references actual final step per archetype
> - Updated guest-messaging `execution_steps` — explicit numbered steps with step 6→7 bridge
> - Diagnosed and fixed intermittent env var injection issue
> - Unit tests for compiler and nudge changes
> - E2E validation via real guest-messaging task
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (diagnose) → Task 2 (execution_steps) → Task 6 (E2E)

---

## Context

### Original Request

The guest-messaging AI employee has been failing consistently — 14 out of 16 tasks failed today with the error: `[opencode-harness] submit-output still not found after recovery nudge — task failed`. The user noticed this pattern in the Slack channel where the employee posts results.

### Interview Summary

**Key Discussions**:

- All failures occurred with `deepseek/deepseek-v4-flash` — the user switched to `xiaomi/mimo-v2.5-pro` AFTER seeing failures, and mimo actually works for this employee (2/2 tasks reached Reviewing)
- The model correctly executes steps 1–6 (data gathering + draft writing) but stops before the final tool call
- The user wants all three code issues fixed plus the env var investigation
- Tests after implementation, plus E2E validation via real task trigger

**Research Findings**:

- Task `c78804ac` log confirms: deepseek called 6 bash tools correctly, wrote draft to `/tmp/draft.txt`, then returned text-only response and went idle
- Recovery nudge fired but model just rewrote the draft and stopped again
- Task `737a58bd` log confirms: mimo-v2.5-pro completed all steps including `post-guest-approval.ts` → Reviewing
- Task `973a74ed` log confirms: `env | grep` returned nothing — env vars not present
- The `agents-md-compiler.mts` wraps `execution_steps` with STOP directives — archetype may also contain its own

### Metis Review

**Identified Gaps** (addressed):

- The "4 STOPs" claim needs validation against actual `compiled_agents_md` — may be 2, not 4. Added diagnostic task.
- Recovery nudge missing `--draft` flag creates silent data loss — deliverable reaches Done but delivery sends empty message. Added explicit acceptance criteria.
- Env vars missing likely NOT a code injection bug — could be Hostfully sending incomplete webhooks. Added `raw_event` DB check before any fix.
- DB archetype is source of truth, not seed file — plan must update DB directly.
- Nudge fix must be employee-agnostic (shared infrastructure convention) — extract final step from archetype execution_steps generically.
- Regression risk on other employees from compiler change — added smoke test on `real-estate-motivation-bot-2`.

---

## Work Objectives

### Core Objective

Fix the guest-messaging AI employee so it reliably completes all execution steps and produces a valid deliverable with draft content, regardless of which model is assigned.

### Concrete Deliverables

- `src/workers/lib/agents-md-compiler.mts` — no duplicate STOP directives in compiled output
- `src/workers/opencode-harness.mts` — recovery nudge uses archetype's actual final step
- Guest-messaging archetype `execution_steps` updated in DB — explicit numbered steps with DO NOT STOP bridge
- Env var injection diagnosed and fixed (or fail-fast added)
- Unit tests for compiler and nudge changes
- E2E task reaching `Reviewing` with non-empty draft in deliverable metadata

### Definition of Done

- [ ] `pnpm test -- --run` passes (including new tests)
- [ ] Guest-messaging task triggered via real Hostfully webhook reaches `Reviewing`
- [ ] Deliverable metadata contains non-empty `draft`, `thread_uid`, `guest_name`
- [ ] `real-estate-motivation-bot-2` smoke test reaches `Done` (no regression)

### Must Have

- Recovery nudge is goal-oriented ("re-read your instructions, keep going until `/tmp/summary.txt` exists"), not tool-specific
- Execution steps explicitly numbered 1–7 with step 6→7 bridge
- No duplicate STOP directives in compiled AGENTS.md
- DB archetype updated (not just seed file)

### Must NOT Have (Guardrails)

- Do NOT change `checkOutputFiles()` logic or nudge timing/retry count in the harness
- Do NOT modify `post-guest-approval.ts` tool itself
- Do NOT add retry logic to the harness
- Do NOT make `lead_uid`/`property_uid` required in Zod schema until root cause confirmed from DB
- Do NOT hardcode guest-messaging-specific logic in shared infrastructure files
- Do NOT update seed file as the ONLY fix — the live DB archetype MUST also be updated
- Do NOT add `MESSAGE_UID` to delivery container env (out of scope)
- Do NOT restructure the compiler template beyond STOP deduplication

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Code changes**: Use Bash — run `pnpm test`, `pnpm lint`, `pnpm build`
- **DB changes**: Use Bash (psql) — verify archetype data
- **E2E**: Use Bash (curl) — trigger task, poll status, verify deliverable
- **Logs**: Use Bash (grep) — verify harness behavior in log files

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — diagnosis + independent fixes):
├── Task 1: Diagnose root causes from DB [quick]
├── Task 2: Fix execution_steps in DB archetype [quick]
├── Task 3: Fix STOP directive deduplication in compiler [unspecified-high]
└── Task 4: Fix recovery nudge in harness [unspecified-high]

Wave 2 (After Wave 1 — tests + env var fix):
├── Task 5: Unit tests for compiler and nudge changes [quick]
├── Task 6: Diagnose and fix env var injection issue [deep]
└── Task 7: Regression smoke test on real-estate-motivation-bot-2 [quick]

Wave 3 (After Wave 2 — E2E validation):
└── Task 8: Full E2E guest-messaging validation [deep]

Wave FINAL (After ALL tasks — reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On                | Blocks     |
| ----- | ------------------------- | ---------- |
| 1     | —                         | 2, 3, 4, 6 |
| 2     | 1 (STOP count, raw_event) | 8          |
| 3     | 1 (STOP count)            | 5, 7       |
| 4     | 1 (diagnostic data)       | 5, 8       |
| 5     | 3, 4                      | 8          |
| 6     | 1 (raw_event check)       | 8          |
| 7     | 3                         | 8          |
| 8     | 2, 4, 5, 6, 7             | F1-F4      |
| F1-F4 | 8                         | —          |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`, T4 → `unspecified-high`
- **Wave 2**: **3** — T5 → `quick`, T6 → `deep`, T7 → `quick`
- **Wave 3**: **1** — T8 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Diagnose root causes from DB before writing any fix

  **What to do**:
  - Query `compiled_agents_md` for a failed task to count actual STOP directives (may be 2, not 4):
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -t -A -c "SELECT compiled_agents_md FROM tasks WHERE id = 'c78804ac-fc8d-4ff7-a02d-08a8495a2472';" \
      | grep -ci "STOP"
    ```
  - Query `raw_event` for the env-var-missing task to determine if the webhook payload was incomplete:
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT raw_event->>'lead_uid', raw_event->>'thread_uid', raw_event->>'property_uid' FROM tasks WHERE id = '973a74ed-639d-4bd0-9d66-c8c9e5b9b178';"
    ```
  - Query current `execution_steps` from the live DB archetype (not seed):
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -t -A -c "SELECT execution_steps FROM archetypes WHERE id = '94b1e64c-2c2a-4391-a6e3-f3ef61044cb5';"
    ```
  - Compare a successful mimo task's `compiled_agents_md` vs a failed deepseek task's — note any differences
  - Save all diagnostic output to `.sisyphus/evidence/task-1-diagnosis.md`

  **Must NOT do**:
  - Do NOT modify any data — this is read-only diagnosis
  - Do NOT assume the STOP count before verifying

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (no dependencies)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 2, 3, 4, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/agents-md-compiler.mts` — the compiler that produces the compiled AGENTS.md. Look at where `EXEC_IMPORTANT` and `STOP_DIRECTIVE` constants are used.
  - `src/workers/opencode-harness.mts:504` — the recovery nudge message that references `submitOutputCmd`

  **API/Type References**:
  - DB table `tasks` — `compiled_agents_md` column stores the full compiled AGENTS.md for each task
  - DB table `tasks` — `raw_event` column stores the original webhook payload as JSONB

  **WHY Each Reference Matters**:
  - `compiled_agents_md` is exactly what the model saw — it's the ground truth for STOP directive count
  - `raw_event` reveals whether the webhook had the env vars or not — determines if the fix is in code or in webhook handling

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify STOP directive count in compiled AGENTS.md
    Tool: Bash (psql)
    Preconditions: Task c78804ac exists in DB
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT compiled_agents_md FROM tasks WHERE id = 'c78804ac-fc8d-4ff7-a02d-08a8495a2472';" > /tmp/compiled-gm.txt
      2. Run: grep -ci "STOP" /tmp/compiled-gm.txt
      3. Run: grep -ni "STOP" /tmp/compiled-gm.txt (to see exact lines)
    Expected Result: A concrete number (likely 2 or 4) with exact line numbers
    Failure Indicators: Task ID not found in DB, or compiled_agents_md is NULL
    Evidence: .sisyphus/evidence/task-1-stop-count.txt

  Scenario: Verify raw_event for env-var-missing task
    Tool: Bash (psql)
    Preconditions: Task 973a74ed exists in DB
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT raw_event FROM tasks WHERE id = '973a74ed-639d-4bd0-9d66-c8c9e5b9b178';"
      2. Check if lead_uid, thread_uid, property_uid are present in raw_event
    Expected Result: Either fields present (code injection bug) or fields absent (webhook payload bug)
    Failure Indicators: raw_event is NULL entirely
    Evidence: .sisyphus/evidence/task-1-raw-event.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-stop-count.txt — STOP directive count and line numbers
  - [ ] task-1-raw-event.txt — raw_event contents for env-var-missing task
  - [ ] task-1-diagnosis.md — full diagnostic summary

  **Commit**: NO

- [x] 2. Fix execution_steps in DB archetype — add explicit numbered steps with step 6→7 bridge

  **What to do**:
  - Read the current `execution_steps` from Task 1's diagnosis output
  - Rewrite to have explicitly numbered steps 1–7, where:
    - Steps 1–5: data gathering (get-messages, get-property, get-reservations, KB search, optional sifely)
    - Step 6: Write draft reply to `/tmp/draft.txt` via cat heredoc
    - **Step 6.5 (NEW — the bridge)**: Explicit instruction: `**MANDATORY — DO NOT STOP HERE. You MUST proceed to Step 7 immediately. Writing the draft is NOT the final step.**`
    - Step 7: Call `tsx /tools/slack/post-guest-approval.ts` with all required flags including `--draft-response "$(cat /tmp/draft.txt)"`
  - Update the live DB archetype via `UPDATE archetypes SET execution_steps = '...' WHERE id = '94b1e64c-2c2a-4391-a6e3-f3ef61044cb5';`
  - Also update the seed file if one exists for this archetype (secondary — DB is primary)
  - The STOP directive in execution_steps should ONLY appear AFTER step 7, not anywhere before

  **Must NOT do**:
  - Do NOT change classification rules or metadata schema within execution_steps
  - Do NOT rewrite the entire execution_steps — only add numbering and the bridge
  - Do NOT change the tool commands themselves (flags, paths)
  - Do NOT remove the FINAL STEP block — just ensure it comes after step 7

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: needed to understand archetype schema fields and how execution_steps are structured

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 1 (with Tasks 3, 4) — can start after Task 1 produces diagnostic output
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/workers/lib/agents-md-compiler.mts` — how execution_steps are injected into the compiled AGENTS.md template. The compiler wraps execution_steps inside `<execution-instructions>` tags with its own STOP directives.
  - `docs/employees/guest-messaging.md` — operational details for the guest-messaging employee, including archetype IDs and gotchas

  **API/Type References**:
  - DB table `archetypes` — `execution_steps` column (text field, markdown format)
  - `prisma/schema.prisma` — archetype model definition

  **External References**:
  - Task 1 diagnostic output at `.sisyphus/evidence/task-1-diagnosis.md` — the current execution_steps text

  **WHY Each Reference Matters**:
  - The compiler adds its own STOP wrapper, so the execution_steps should NOT contain redundant STOPs — but the bridge between steps 6 and 7 must be explicit
  - The guest-messaging docs have the archetype ID and any known gotchas

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify execution_steps updated in DB
    Tool: Bash (psql)
    Preconditions: Archetype 94b1e64c exists in DB
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT execution_steps FROM archetypes WHERE id = '94b1e64c-2c2a-4391-a6e3-f3ef61044cb5';"
      2. Verify steps are numbered 1–7
      3. Verify "DO NOT STOP" bridge exists between steps 6 and 7
      4. Verify STOP directive only appears after step 7
      5. Run: echo "$RESULT" | grep -c "STOP" — should be exactly 1 (after step 7 only)
    Expected Result: Numbered steps 1–7, bridge between 6→7, single STOP after step 7
    Failure Indicators: Steps not numbered, bridge missing, multiple STOPs, or archetype not found
    Evidence: .sisyphus/evidence/task-2-execution-steps.txt

  Scenario: Verify no STOP before step 7
    Tool: Bash (psql + grep)
    Preconditions: Task 2 execution_steps update applied
    Steps:
      1. Extract execution_steps to file
      2. Find line number of "Step 7" or "post-guest-approval"
      3. Find all STOP occurrences and their line numbers
      4. Assert all STOP lines are AFTER the step 7 line
    Expected Result: Zero STOP directives before step 7
    Failure Indicators: Any STOP found before the post-guest-approval step
    Evidence: .sisyphus/evidence/task-2-stop-position.txt
  ```

  **Commit**: YES
  - Message: `fix(guest-messaging): add explicit numbered steps with step 6→7 bridge in execution_steps`
  - Files: DB update (psql command), optionally `prisma/seed.ts` if guest-messaging seed exists
  - Pre-commit: N/A (DB change)

- [x] 3. Fix STOP directive deduplication in agents-md-compiler

  **What to do**:
  - Read `src/workers/lib/agents-md-compiler.mts` to find where `EXEC_IMPORTANT` and `STOP_DIRECTIVE` constants inject STOP text
  - Use Task 1's diagnostic output to confirm actual STOP count in compiled output
  - Modify the compiler so that:
    - If the archetype's `execution_steps` already ends with a STOP-like directive (case-insensitive match for "STOP", "Do nothing else", "Your job is done"), the compiler does NOT add its own `STOP_DIRECTIVE`
    - OR: Change the compiler's STOP to be less aggressive — e.g., "After completing ALL steps above, stop." instead of "STOP. Do nothing else."
  - Use `lsp_find_references` on `compileAgentsMd` to verify all callers before changing output format
  - Ensure the fix is employee-agnostic — works for all archetypes, not just guest-messaging

  **Must NOT do**:
  - Do NOT restructure the compiler template beyond STOP deduplication
  - Do NOT rename XML tags (`<execution-instructions>`, `<delivery-instructions>`)
  - Do NOT change how `execution_steps` or `delivery_steps` content is injected
  - Do NOT add guest-messaging-specific logic to the compiler

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 1 (with Tasks 2, 4)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/workers/lib/agents-md-compiler.mts` — the entire file. Focus on `EXEC_IMPORTANT`, `STOP_DIRECTIVE` constants and the template string that assembles the compiled output.
  - `src/workers/config/agents.md` — the platform base config that is also included in the compiled output

  **API/Type References**:
  - `compileAgentsMd()` function signature — understand inputs (archetype fields, learned rules, KB entries) and output (string)

  **Test References**:
  - Look for existing tests: `grep -r "compileAgentsMd\|agents-md-compiler" src/ --include="*.test.*"` — if tests exist, follow their patterns

  **WHY Each Reference Matters**:
  - The compiler is the single source of truth for AGENTS.md structure — any change here affects every employee
  - `lsp_find_references` on `compileAgentsMd` reveals all callers that depend on the output format

  **Acceptance Criteria**:
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Compiled AGENTS.md has no duplicate STOPs
    Tool: Bash (node/tsx)
    Preconditions: Compiler change applied
    Steps:
      1. Write a small script that imports compileAgentsMd and calls it with a mock archetype whose execution_steps ends with "STOP. Do nothing else."
      2. Count STOP occurrences in the output
      3. Assert count is ≤ 2 (one from EXEC_IMPORTANT, one from execution_steps — NOT doubled)
    Expected Result: ≤ 2 STOP directives in output
    Failure Indicators: 4+ STOP directives, or compilation error
    Evidence: .sisyphus/evidence/task-3-stop-dedup.txt

  Scenario: Compiled AGENTS.md for archetype WITHOUT STOP in execution_steps still has a STOP
    Tool: Bash (node/tsx)
    Preconditions: Compiler change applied
    Steps:
      1. Call compileAgentsMd with a mock archetype whose execution_steps does NOT end with STOP
      2. Verify the compiler's own STOP directive is present (safety net)
    Expected Result: At least 1 STOP directive from compiler wrapper
    Failure Indicators: Zero STOP directives — model would never stop
    Evidence: .sisyphus/evidence/task-3-stop-safety.txt
  ```

  **Commit**: YES
  - Message: `fix(compiler): deduplicate STOP directives in compiled AGENTS.md`
  - Files: `src/workers/lib/agents-md-compiler.mts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Fix recovery nudge to be goal-oriented instead of tool-specific

  **What to do**:
  - Read `src/workers/opencode-harness.mts` around line 504 where the nudge message is constructed
  - Currently the nudge hardcodes: `"The final step MUST be:\n${submitOutputCmd}"` where `submitOutputCmd` is always `submit-output.ts`
  - This is wrong for guest-messaging (whose final step is `post-guest-approval.ts`) and is brittle for any future employee
  - **Replace the tool-specific nudge with a goal-oriented nudge** that tells the model:
    - Your session went idle without producing the required output
    - Re-read your `<execution-instructions>` in AGENTS.md
    - Complete ALL remaining steps you haven't done yet
    - You are not done until `/tmp/summary.txt` exists
  - The nudge should NOT reference any specific tool — the model already has its full instructions in context and knows what to do. It just needs to be told "you're not finished yet, keep going."
  - The success condition (`/tmp/summary.txt` must exist) is universal across all employees — that's the only concrete thing the nudge needs to mention
  - Remove the `submitOutputCmd` reference from the nudge message entirely

  **Why this approach**:
  - No parsing of execution_steps (brittle, depends on formatting)
  - No per-employee logic (violates shared infrastructure convention)
  - No fallback path needed (one message works for everyone)
  - The model is smart — it just needs to know it's not done, not be told exactly which command to run

  **Must NOT do**:
  - Do NOT parse or scan `execution_steps` to extract a final step — that's brittle
  - Do NOT reference any specific tool name in the nudge message
  - Do NOT change nudge timing (`timeoutMs: 5 * 60 * 1000`)
  - Do NOT change nudge retry count (currently 1 nudge attempt)
  - Do NOT change `checkOutputFiles()` logic
  - Do NOT add employee-specific branching in the harness
  - Do NOT change `minElapsedMs` values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 5, 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:489-523` — the full recovery nudge flow: detection, message construction, monitor, failure check
  - `src/workers/opencode-harness.mts:504` — the specific line with the nudge message template

  **API/Type References**:
  - `submitOutputCmd` variable — currently referenced in the nudge message; should be REMOVED from the nudge (still used elsewhere in the harness, don't delete the variable itself)

  **WHY Each Reference Matters**:
  - Line 504 is the exact code to change — the nudge message template
  - Understanding the full nudge flow (489-523) ensures we only change the message, not the detection/monitor logic

  **Acceptance Criteria**:
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Nudge message is goal-oriented, not tool-specific
    Tool: Bash (grep on source code)
    Preconditions: Nudge fix applied
    Steps:
      1. Read the nudge message construction in opencode-harness.mts
      2. Verify the nudge message does NOT contain "submit-output" or any specific tool path
      3. Verify the nudge message references /tmp/summary.txt as the success condition
      4. Verify the nudge message tells the model to re-read its execution-instructions
      5. Verify no employee-specific branching (no "guest-messaging" string in the code)
    Expected Result: Generic, goal-oriented nudge that works for any employee
    Failure Indicators: Any tool name hardcoded in the nudge, or employee-specific branching
    Evidence: .sisyphus/evidence/task-4-nudge-fix.txt

  Scenario: Nudge message does not parse or scan execution_steps
    Tool: Bash (grep on source code)
    Preconditions: Nudge fix applied
    Steps:
      1. Search the nudge message construction for any reference to archetype.execution_steps
      2. Search for any regex or string matching on execution_steps content
      3. Assert neither exists — the nudge should not try to extract tool names
    Expected Result: Zero references to execution_steps parsing in the nudge logic
    Failure Indicators: Any regex, indexOf, match, or split on execution_steps
    Evidence: .sisyphus/evidence/task-4-no-parsing.txt
  ```

  **Commit**: YES
  - Message: `fix(harness): replace tool-specific recovery nudge with goal-oriented message`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Unit tests for compiler STOP dedup and nudge message

  **What to do**:
  - Add unit tests for the `compileAgentsMd` STOP deduplication logic:
    - Test: archetype with STOP in execution_steps → compiled output has ≤ 2 STOPs
    - Test: archetype WITHOUT STOP in execution_steps → compiled output has compiler's STOP
    - Test: archetype with delivery_steps containing STOP → no cross-contamination
  - Add unit tests for the recovery nudge message:
    - Test: nudge message does NOT contain any specific tool name (no "submit-output", no "post-guest-approval")
    - Test: nudge message references `/tmp/summary.txt` as the success condition
    - Test: nudge message tells the model to re-read `<execution-instructions>`
  - Follow existing test patterns in the codebase

  **Must NOT do**:
  - Do NOT add integration tests that require Docker or external services
  - Do NOT mock at too high a level — test the actual functions

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 3 and 4)
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - Search for existing test files: `grep -r "compileAgentsMd\|agents-md-compiler\|opencode-harness" src/ --include="*.test.*"` — follow existing patterns
  - `src/workers/lib/agents-md-compiler.mts` — the function under test
  - `src/workers/opencode-harness.mts` — the nudge message construction under test

  **Test References**:
  - Look for existing Vitest patterns: `ls src/**/*.test.ts` — follow conventions for imports, mocking, describe/it structure

  **WHY Each Reference Matters**:
  - Existing test patterns determine the test file location and style conventions
  - The two functions under test need to be importable — check for default vs named exports

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run` passes with new tests included
  - [ ] At least 3 test cases for compiler STOP dedup
  - [ ] At least 3 test cases for nudge message

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: Test files created
    Steps:
      1. Run: pnpm test -- --run
      2. Verify zero test failures
      3. Verify new test file appears in output
    Expected Result: All tests pass, including new ones
    Failure Indicators: Test failures, import errors, or new tests not discovered
    Evidence: .sisyphus/evidence/task-5-test-results.txt

  Scenario: Tests catch regression if STOP dedup is reverted
    Tool: Bash (code review)
    Preconditions: Tests written
    Steps:
      1. Verify at least one test would FAIL if the STOP dedup logic were removed
      2. This ensures the tests actually guard against regression
    Expected Result: Tests are meaningful, not just "does it compile"
    Failure Indicators: All tests pass even with the fix reverted
    Evidence: .sisyphus/evidence/task-5-regression-guard.txt
  ```

  **Commit**: YES
  - Message: `test(harness): add unit tests for compiler STOP dedup and nudge message`
  - Files: new test file(s)
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Diagnose and fix env var injection issue

  **What to do**:
  - Use Task 1's diagnostic output (`raw_event` for task `973a74ed`) to determine root cause:
    - **If `raw_event` has `lead_uid`/`thread_uid`/`property_uid`**: The bug is in the injection code — the harness or lifecycle is not passing them to the container env. Read `src/inngest/employee-lifecycle.ts` to find where task metadata becomes container env vars. Fix the injection.
    - **If `raw_event` is missing those fields**: The bug is upstream — the Hostfully webhook sent an incomplete payload. Add a fail-fast validation in the lifecycle that checks for required fields BEFORE spawning the container, and transitions to `Failed` with a clear error message instead of silently proceeding.
    - **If `raw_event` is NULL**: The task was triggered via admin API without a payload. Add validation in the trigger endpoint.
  - Read `src/inngest/employee-lifecycle.ts` — find the step that extracts task metadata and passes it as env vars to the container
  - Read `src/workers/opencode-harness.mts` — find where env vars are read from `process.env` and used
  - Check the Zod schema for the webhook route — `lead_uid` and `property_uid` are `.optional()` per Metis. If they're required for guest-messaging, add validation.

  **Must NOT do**:
  - Do NOT make `lead_uid`/`property_uid` required in the Zod schema UNTIL root cause is confirmed (some webhooks legitimately omit them)
  - Do NOT change the Hostfully webhook handler route structure
  - Do NOT modify how other employees handle env vars

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: needed to understand the full lifecycle state machine, env var injection pipeline, and how task metadata flows from webhook to container

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts` — the lifecycle function. Find the step that builds the container env vars from task metadata/raw_event.
  - `src/workers/opencode-harness.mts` — where `process.env.LEAD_UID` etc. are read
  - `src/gateway/routes/` — the Hostfully webhook route handler that creates the task with raw_event

  **API/Type References**:
  - `src/gateway/validation/schemas.ts` — Zod schemas for webhook payloads, including optional fields
  - DB table `tasks` — `raw_event` (JSONB), `metadata` (JSONB) columns

  **External References**:
  - `docs/employees/guest-messaging.md` — guest-messaging operational details, including env var requirements
  - Task 1 diagnostic output at `.sisyphus/evidence/task-1-raw-event.txt`

  **WHY Each Reference Matters**:
  - The lifecycle is where task metadata becomes container env vars — the injection point
  - The harness reads them — if they're missing, the agent can't proceed
  - The webhook route is where raw_event is first captured — if incomplete, everything downstream fails

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tasks with complete webhook payloads have env vars
    Tool: Bash (psql)
    Preconditions: Fix applied
    Steps:
      1. Trigger a guest-messaging task with a complete Hostfully webhook payload (all UIDs present)
      2. Check container env vars or task logs for LEAD_UID, THREAD_UID, PROPERTY_UID
    Expected Result: All env vars present and correct
    Failure Indicators: Any env var missing despite being in raw_event
    Evidence: .sisyphus/evidence/task-6-env-vars-present.txt

  Scenario: Tasks with incomplete webhook payloads fail fast
    Tool: Bash (curl + psql)
    Preconditions: Fix applied
    Steps:
      1. Trigger a guest-messaging task with a webhook payload missing lead_uid
      2. Check task status — should be Failed (not Executing with empty env)
      3. Verify error message explains what's missing
    Expected Result: Task fails fast with clear error, not silently proceeds
    Failure Indicators: Task reaches Executing without required env vars
    Evidence: .sisyphus/evidence/task-6-fail-fast.txt
  ```

  **Commit**: YES
  - Message: `fix(lifecycle): handle missing env vars in guest-messaging trigger`
  - Files: depends on diagnosis — likely `src/inngest/employee-lifecycle.ts` or webhook route
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Regression smoke test on real-estate-motivation-bot-2

  **What to do**:
  - After Task 3 (compiler change) is complete, verify no regression on other employees
  - Trigger `real-estate-motivation-bot-2` (simplest employee, `approval_required: false`):
    ```bash
    source .env
    curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq '.task_id'
    ```
  - Wait ~60s, then verify task reached `Done`
  - Check the compiled AGENTS.md for the triggered task — verify STOP directives are correct (not duplicated, not missing)

  **Must NOT do**:
  - Do NOT trigger guest-messaging here (that's Task 8)
  - Do NOT modify any code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 3)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - AGENTS.md "Recommended Test Employee" section — `real-estate-motivation-bot-2` details

  **WHY Each Reference Matters**:
  - This is the standard smoke test employee — simplest path, no approval needed, completes in ~1 minute

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Motivation bot reaches Done after compiler change
    Tool: Bash (curl + psql)
    Preconditions: Task 3 (compiler change) committed, services running
    Steps:
      1. Run: source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id'
      2. Wait 90 seconds
      3. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '<task_id>';"
      4. Assert status = 'Done'
    Expected Result: Task reaches Done within 90 seconds
    Failure Indicators: Task stuck in Executing or reaches Failed
    Evidence: .sisyphus/evidence/task-7-regression-test.txt

  Scenario: Compiled AGENTS.md for motivation bot has correct STOP count
    Tool: Bash (psql)
    Preconditions: Motivation bot task completed
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT compiled_agents_md FROM tasks WHERE id = '<task_id>';" | grep -ci "STOP"
      2. Assert STOP count is ≤ 2
    Expected Result: ≤ 2 STOP directives
    Failure Indicators: 4+ STOP directives (duplication not fixed)
    Evidence: .sisyphus/evidence/task-7-stop-count.txt
  ```

  **Commit**: NO (validation only)

- [x] 8. Full E2E guest-messaging validation

  **What to do**:
  - After ALL code/DB fixes are applied and regression test passes, trigger a real guest-messaging task
  - Trigger via Hostfully webhook (preferred) or admin API with proper payload:
    ```bash
    source .env
    curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{}' | jq '{task_id: .task_id}'
    ```
  - Wait for task to complete (up to 5 minutes)
  - Verify task reaches `Reviewing` (not `Failed`)
  - Verify deliverable has non-empty `draft` content
  - Check container log for all 7 steps executing
  - If a real Hostfully webhook is available, use it instead of admin API trigger (tests env var injection path)

  **Must NOT do**:
  - Do NOT approve the task in Slack (just verify it reaches Reviewing)
  - Do NOT modify any code during this validation

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`debugging-lifecycle`, `e2e-testing`]
    - `debugging-lifecycle`: needed to verify task state transitions and diagnose if it fails
    - `e2e-testing`: needed for E2E test methodology and verification checklist

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all previous tasks)
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2, 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `docs/employees/guest-messaging.md` — trigger methods, test resources, Hostfully test data
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — full E2E test methodology

  **WHY Each Reference Matters**:
  - Guest-messaging docs have the exact webhook payload format and test UUIDs
  - E2E test guide has the verification checklist and acceptance criteria methodology

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Guest-messaging task reaches Reviewing with valid deliverable
    Tool: Bash (curl + psql)
    Preconditions: All code/DB fixes applied, services running, Docker image rebuilt
    Steps:
      1. Trigger guest-messaging task via admin API or Hostfully webhook
      2. Wait up to 5 minutes, polling every 30s: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '<task_id>';"
      3. Assert status = 'Reviewing'
      4. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT task_id, length(content) > 0 as has_content FROM pending_approvals WHERE task_id = '<task_id>';"
      5. Assert has_content = true
    Expected Result: Task at Reviewing with non-empty approval content
    Failure Indicators: Task at Failed, or pending_approvals row missing/empty
    Evidence: .sisyphus/evidence/task-8-e2e-result.txt

  Scenario: Container log shows all 7 steps executing
    Tool: Bash (grep on log file)
    Preconditions: Task triggered and completed
    Steps:
      1. Run: grep "get-messages\|get-property\|get-reservations\|knowledge_base\|draft.txt\|post-guest-approval\|submit-output" /tmp/employee-${TASK_ID:0:8}.log
      2. Verify at least 5 of the 7 step tool names appear in the log
      3. Verify post-guest-approval.ts appears (the previously failing step)
    Expected Result: post-guest-approval.ts called successfully
    Failure Indicators: post-guest-approval.ts not in logs, or only steps 1-6 present
    Evidence: .sisyphus/evidence/task-8-step-trace.txt

  Scenario: No recovery nudge needed (model completes on first try)
    Tool: Bash (grep on log file)
    Preconditions: Task triggered and completed
    Steps:
      1. Run: grep -c "recovery nudge" /tmp/employee-${TASK_ID:0:8}.log
      2. Assert count = 0 (model should complete all steps without needing a nudge)
    Expected Result: Zero nudge triggers — model completes cleanly
    Failure Indicators: Recovery nudge triggered (means model still stops early, but now recovers)
    Evidence: .sisyphus/evidence/task-8-no-nudge.txt
  ```

  **Commit**: NO (validation only)

- [x] 9. Notify completion

  Send Telegram: `tsx scripts/telegram-notify.ts "✅ guest-messaging-failure-fix complete — All tasks done. Come back to review results."`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, query DB). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Trigger a guest-messaging task via Hostfully webhook. Verify all 7 steps execute. Verify deliverable has non-empty draft. Verify `real-estate-motivation-bot-2` still works. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1**: No commit (diagnostic only)
- **Task 2**: `fix(guest-messaging): add explicit numbered steps with step 6→7 bridge` — DB update via psql
- **Task 3**: `fix(compiler): deduplicate STOP directives in compiled AGENTS.md` — `src/workers/lib/agents-md-compiler.mts`
- **Task 4**: `fix(harness): replace tool-specific recovery nudge with goal-oriented message` — `src/workers/opencode-harness.mts`
- **Task 5**: `test(harness): add unit tests for compiler STOP dedup and nudge message` — test files
- **Task 6**: `fix(lifecycle): handle missing env vars in guest-messaging trigger` — depends on diagnosis
- **Task 7**: No commit (validation only)
- **Task 8**: No commit (E2E validation only)

---

## Success Criteria

### Verification Commands

```bash
# Build succeeds
pnpm build

# Tests pass
pnpm test -- --run

# Guest-messaging task reaches Reviewing with valid deliverable
TASK_ID=<triggered_task>
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Reviewing

# Deliverable has non-empty draft
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT length(metadata->>'draft') > 0 as has_draft FROM pending_approvals WHERE task_id = '$TASK_ID';"
# Expected: true

# Motivation bot still works (no regression)
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT status FROM tasks WHERE id = '<motivation_task_id>';"
# Expected: Done
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Guest-messaging task reaches Reviewing
- [ ] Deliverable has non-empty draft content
- [ ] No regression on other employees
