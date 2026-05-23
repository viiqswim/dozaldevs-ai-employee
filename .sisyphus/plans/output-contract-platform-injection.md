# Output Contract: Platform-Level Injection

## TL;DR

> **Quick Summary**: Fix the archetype generator so it stops teaching AI employees to write directly to `/tmp/summary.txt` and `/tmp/approval-message.json`. The output contract is a platform concern — `platform-procedures.mts` already injects correct instructions at runtime, but the generator's SYSTEM_PROMPT conflicts with it by embedding direct file write examples in `agents_md`. Remove the conflicting instructions from the generator, update the test fixture, add tests, and update the creating-archetypes skill.
>
> **Deliverables**:
>
> - Updated `SYSTEM_PROMPT` in `archetype-generator.ts` — no more direct file write examples in `agents_md`
> - Updated test fixture `makeValidJsonContent()` — uses `submit-output.ts` instead of direct writes
> - New tests verifying the generator's prompt teaches the correct pattern
> - Updated `creating-archetypes` SKILL.md — documents `submit-output.ts` as the mandatory tool
>
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 3 → F1-F4

---

## Context

### Original Request

A newly created AI employee (via the dashboard UI) had a system prompt instructing the LLM to write directly to `/tmp/summary.txt` and `/tmp/approval-message.json` instead of using the platform tool `submit-output.ts`. The user identified this as an architectural problem: the output contract is a platform concern that every employee shares, so it should be injected at the platform level — not embedded in individual archetype configs.

### Interview Summary

**Key Discussions**:

- The output contract instructions are duplicated across archetype `agents_md` fields — fragile, inconsistent, error-prone
- `platform-procedures.mts` already correctly injects `submit-output.ts` usage at runtime, but archetype `agents_md` conflicts with it
- The archetype was created through the dashboard UI (LLM-generated via `archetype-generator.ts`)
- Fix should be forward-only — no DB migration for existing archetypes
- Tests should be added for the generator

**Research Findings**:

- `archetype-generator.ts` SYSTEM_PROMPT lines 95-128: explicitly teaches direct file writes in the `agents_md` example
- Line 138: JSON shape description references `/tmp/summary.txt and /tmp/approval-message.json paths`
- Ironic contradiction: line 88 says "DO NOT include file paths like `/tmp/summary.txt`" — but only for `instructions`, while the `agents_md` example explicitly teaches them
- Hand-authored archetypes in `prisma/seed.ts` correctly use `submit-output.ts`
- `creating-archetypes` skill's Output Contract section doesn't mention `submit-output.ts` at all
- Test fixture `makeValidJsonContent()` also contains the bad pattern (misleading for future developers)

### Metis Review

**Identified Gaps** (addressed):

- Line 100 (required sections list) must also be updated — not just the example: INCLUDED in Task 1
- `overview.output` field may also contain technical file paths: INCLUDED as a minor check in Task 1
- `REFINE_SYSTEM_PROMPT` does NOT have the bad pattern (only uses `INJECTION_BOUNDARY`): CONFIRMED out of scope
- Test fixture `makeValidJsonContent()` teaches the wrong pattern to future devs: INCLUDED in Task 2

---

## Work Objectives

### Core Objective

Remove the output contract instructions from the archetype generator's LLM prompt so that `platform-procedures.mts` (which already correctly injects `submit-output.ts` usage) is the single source of truth for how employees write their output.

### Concrete Deliverables

- `src/gateway/services/archetype-generator.ts` — updated SYSTEM_PROMPT (3 locations: lines 95-100, 111-128, 138)
- `src/gateway/services/__tests__/archetype-generator.test.ts` — updated fixture + 2-3 new tests
- `.opencode/skills/creating-archetypes/SKILL.md` — updated Output Contract section

### Definition of Done

- [ ] `pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts` → all tests pass (existing + new)
- [ ] `SYSTEM_PROMPT` agents_md example contains zero output contract references (no file paths, no submit-output.ts, no OUTPUT FORMAT)
- [ ] `SYSTEM_PROMPT` contains an explicit rule forbidding output instructions in `agents_md`
- [ ] `creating-archetypes` skill mentions `submit-output.ts` in the Output Contract section

### Must Have

- Generator's `agents_md` example contains ZERO output contract references — no file paths, no submit-output.ts, no OUTPUT FORMAT section
- Explicit rule in SYSTEM_PROMPT forbidding output instructions in `agents_md` (same as the existing rule for `instructions`)
- Line 100 required sections list reduced to 4 items: Opening sentence, WORKFLOW, CLASSIFICATION RULES, TOOLS AVAILABLE
- Line 138 JSON shape description updated (no more file path references, explicit note that platform handles output)
- Test fixture updated to contain no output contract references
- New tests that inspect the SYSTEM_PROMPT content for absence of output instructions
- Skill documentation updated

### Must NOT Have (Guardrails)

- Do NOT add runtime validation to `postProcess()` that rejects `agents_md` containing `/tmp/summary.txt` — the fallback is legitimate
- Do NOT touch `src/workers/config/agents.md` — its fallback instruction is correct
- Do NOT touch `src/workers/lib/platform-procedures.mts` — it already works correctly
- Do NOT modify `REFINE_SYSTEM_PROMPT` — it doesn't have the bad pattern
- Do NOT add DB migrations or scripts to fix existing archetypes (forward-only fix)
- Do NOT modify `prisma/seed.ts` — hand-authored archetypes already use `submit-output.ts`
- Do NOT add ANY output contract references to the `agents_md` example — not direct file writes, not `submit-output.ts`, not OUTPUT FORMAT, nothing. The platform handles this entirely via `platform-procedures.mts` at runtime

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after (add new tests for prompt content)
- **Framework**: vitest

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Tests**: Use Bash (`pnpm test -- --run`) — run test suite, assert pass/fail counts
- **Code verification**: Use Grep — search for patterns that should/shouldn't exist

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Fix SYSTEM_PROMPT in archetype-generator.ts [quick]
├── Task 2: Update test fixture + add new tests [quick]
└── Task 3: Update creating-archetypes skill [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks |
| ----- | ---------- | ------ |
| 1     | —          | F1-F4  |
| 2     | —          | F1-F4  |
| 3     | —          | F1-F4  |
| F1-F4 | 1, 2, 3    | —      |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix SYSTEM_PROMPT in archetype-generator.ts — remove ALL output contract instructions from agents_md

  **What to do**:
  - In `src/gateway/services/archetype-generator.ts`, update the `SYSTEM_PROMPT` constant at four locations:
    1. **Lines 87-93** (DO NOT include rules): Extend the existing "DO NOT include in instructions" rule to ALSO cover `agents_md`. Add an explicit rule: "DO NOT include output/reporting instructions in agents_md — no file paths, no output format details, no references to submit-output.ts or /tmp/ files. The platform injects output instructions at runtime automatically."
    2. **Lines 95-100** (required sections list): REMOVE item 4 entirely (`"OUTPUT FORMAT section — what to write to /tmp/summary.txt"`). The required sections should only be: (1) Opening sentence, (2) WORKFLOW, (3) CLASSIFICATION RULES, (4) TOOLS AVAILABLE. The output contract is a platform concern — the employee's personality should not mention it at all.
    3. **Lines 103-128** (example `agents_md` structure): Remove ALL output-related content:
       - Remove line 111: `N. Write your results to /tmp/summary.txt in JSON format.`
       - Remove lines 118-123: The entire `OUTPUT FORMAT:` block
       - Remove line 122-123: The `approval-message.json` reference
       - The WORKFLOW should end with the employee's last JOB step (not an output step)
       - The example should only have: WORKFLOW (job steps only), CLASSIFICATION RULES, TOOLS AVAILABLE
    4. **Line 138** (JSON shape description): Change `"agents_md": "50-200 lines of structured markdown with WORKFLOW, CLASSIFICATION RULES, OUTPUT FORMAT (including /tmp/summary.txt and /tmp/approval-message.json paths), TOOLS sections"` to `"agents_md": "50-200 lines of structured markdown with WORKFLOW, CLASSIFICATION RULES, TOOLS sections. Do NOT include output format or file path instructions — the platform handles output automatically."`
  - The replacement example `agents_md` should show ONLY:
    - WORKFLOW with job-specific steps (NO output/reporting step at the end)
    - CLASSIFICATION RULES section (unchanged — keep as-is)
    - TOOLS AVAILABLE section (unchanged — keep as-is)
    - NO output-related sections of any kind
  - Do NOT change `REFINE_SYSTEM_PROMPT` — it doesn't have the bad pattern
  - Verify `overview.output` in the example doesn't reference technical file paths or internal tools

  **Must NOT do**:
  - Do NOT add runtime validation to `postProcess()`
  - Do NOT touch `REFINE_SYSTEM_PROMPT`
  - Do NOT touch `platform-procedures.mts`
  - Do NOT add ANY output contract references to the agents_md example — not direct file writes, not submit-output.ts, nothing. The platform handles this entirely.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit with clear before/after — straightforward string replacements in a prompt template
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Not needed — we're not creating an archetype, we're fixing the generator prompt

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts:51-184` — The full `SYSTEM_PROMPT` constant. Lines 95-100 (required sections list), 103-128 (example `agents_md`), 138 (JSON shape description) are the three locations to fix.
  - `src/gateway/services/archetype-generator.ts:186-202` — `REFINE_SYSTEM_PROMPT` — DO NOT TOUCH. Read it to confirm it doesn't have the bad pattern (it doesn't — it only uses `INJECTION_BOUNDARY`).

  **API/Type References**:
  - `src/worker-tools/platform/submit-output.ts` — The platform tool CLI: `tsx /tools/platform/submit-output.ts --summary "..." --classification "NEEDS_APPROVAL|NO_ACTION_NEEDED"`. This is what the example should reference as the final step.

  **External References**:
  - `src/workers/lib/platform-procedures.mts` — The runtime injection that already correctly teaches `submit-output.ts`. Read this to understand what gets injected so you don't duplicate or conflict with it. The example `agents_md` should simply say "call submit-output.ts" without specifying format details (the runtime injection handles that).

  **WHY Each Reference Matters**:
  - `archetype-generator.ts:51-184`: This IS the file being edited — you need to understand the full prompt structure to make surgical edits
  - `submit-output.ts`: You need to know the exact CLI syntax to write a correct reference in the example
  - `platform-procedures.mts`: You need to know what the runtime already injects so you don't create conflicting instructions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SYSTEM_PROMPT agents_md example contains zero output contract references
    Tool: Bash (grep)
    Preconditions: Task 1 edits applied to archetype-generator.ts
    Steps:
      1. Run: grep -n 'Write to /tmp/summary.txt' src/gateway/services/archetype-generator.ts
      2. Run: grep -n 'Write.*approval-message.json' src/gateway/services/archetype-generator.ts
      3. Run: grep -n '/tmp/summary.txt and /tmp/approval-message.json' src/gateway/services/archetype-generator.ts
      4. Run: grep -n 'OUTPUT FORMAT' src/gateway/services/archetype-generator.ts
    Expected Result: All four grep commands return empty (exit code 1 — no matches)
    Failure Indicators: Any grep returns a match
    Evidence: .sisyphus/evidence/task-1-no-output-contract.txt

  Scenario: SYSTEM_PROMPT explicitly forbids output instructions in agents_md
    Tool: Bash (grep)
    Preconditions: Task 1 edits applied
    Steps:
      1. Run: grep -c 'DO NOT include output' src/gateway/services/archetype-generator.ts
         OR: grep -c 'platform.*handles.*output' src/gateway/services/archetype-generator.ts
    Expected Result: Count >= 1 (an explicit rule exists telling the LLM not to include output instructions)
    Failure Indicators: Count is 0 — no rule preventing output instructions in agents_md
    Evidence: .sisyphus/evidence/task-1-has-exclusion-rule.txt

  Scenario: SYSTEM_PROMPT still has all required sections (no structural breakage)
    Tool: Bash (grep)
    Preconditions: Task 1 edits applied
    Steps:
      1. Run: grep -c 'WORKFLOW' src/gateway/services/archetype-generator.ts → >= 1
      2. Run: grep -c 'CLASSIFICATION RULES' src/gateway/services/archetype-generator.ts → >= 1
      3. Run: grep -c 'TOOLS AVAILABLE' src/gateway/services/archetype-generator.ts → >= 1
    Expected Result: All three sections still present
    Failure Indicators: Any section missing
    Evidence: .sisyphus/evidence/task-1-sections-intact.txt

  Scenario: Existing tests still pass (no regression)
    Tool: Bash
    Preconditions: Task 1 edits applied
    Steps:
      1. Run: pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts
    Expected Result: All existing tests pass (12 tests, 0 failures)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-1-tests-pass.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-no-output-contract.txt
  - [ ] task-1-has-exclusion-rule.txt
  - [ ] task-1-sections-intact.txt
  - [ ] task-1-tests-pass.txt

  **Commit**: YES (groups with Task 2)
  - Message: `fix(archetype-generator): replace direct file write instructions with submit-output.ts reference`
  - Files: `src/gateway/services/archetype-generator.ts`, `src/gateway/services/__tests__/archetype-generator.test.ts`
  - Pre-commit: `pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts`

- [x] 2. Update test fixture and add new tests for prompt content

  **What to do**:
  - In `src/gateway/services/__tests__/archetype-generator.test.ts`:
    1. **Update `makeValidJsonContent()` fixture** (lines 18-50):
       - Change `instructions` (line 24): Replace `'Step 3: write to /tmp/summary.txt'` with a plain job step like `'Step 3: compose the final digest message.'`
       - Change `agents_md` (lines 25-41): Remove ALL output contract lines:
         - Remove line 31: `'N. Write results to /tmp/summary.txt'`
         - Remove lines 36-37: `'OUTPUT FORMAT:'` and `'Write to /tmp/summary.txt: { "classification": "..." }'`
         - The fixture's `agents_md` should only contain: WORKFLOW (job steps), CLASSIFICATION RULES, TOOLS AVAILABLE — no output instructions
    2. **Add new test: SYSTEM_PROMPT does not teach output contract in agents_md example**:
       - Call `gen.generate('A daily Slack digest bot')` with the mock
       - Inspect `mockCallLLM.mock.calls[0][0].messages[0].content` (the system message)
       - Assert it does NOT match `/N\.\s+Write.*\/tmp\/summary\.txt/`
       - Assert it does NOT match `/OUTPUT FORMAT/`
       - Assert it does NOT contain `'/tmp/summary.txt and /tmp/approval-message.json paths'`
    3. **Add new test: SYSTEM_PROMPT explicitly forbids output instructions in agents_md**:
       - Same setup — inspect the system message
       - Assert it contains a rule that tells the LLM NOT to include output/reporting instructions in agents_md (e.g. matches something like "DO NOT include output" or "platform handles output")
  - Ensure all existing tests still pass after fixture changes

  **Must NOT do**:
  - Do NOT change the test structure or mocking approach — only update fixture data and add new assertions
  - Do NOT test what the LLM returns (it's mocked) — test what the generator SENDS to the LLM

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test file edits with clear assertions — straightforward additions to an existing test suite
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/gateway/services/__tests__/archetype-generator.test.ts:1-223` — The full test file. Lines 18-50 (`makeValidJsonContent`) are the fixture to update. Lines 52-136 are existing `generate()` tests. Lines 188-222 are existing `refine()` tests.
  - `src/gateway/services/archetype-generator.ts:266-275` — The `generate()` method showing how `callLLMFn` is invoked with `SYSTEM_PROMPT` as `messages[0].content`. This tells you the mock call structure: `mockCallLLM.mock.calls[0][0].messages[0].content` gets the system prompt.

  **Test References**:
  - `src/gateway/services/__tests__/archetype-generator.test.ts:54-59` — Example of how existing tests use `makeCallLLMResult(makeValidJsonContent(...))` — follow this exact pattern for new tests
  - `src/gateway/services/__tests__/archetype-generator.test.ts:189-203` — Example of how `refine()` tests inspect `mockCallLLM` calls — use the same `mock.calls` approach for the new prompt content tests

  **WHY Each Reference Matters**:
  - The test file is what you're editing — understand its full structure before making changes
  - The `generate()` method call structure tells you exactly how to access the system prompt in mock calls

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass including new ones
    Tool: Bash
    Preconditions: Test file updated with fixture changes and new tests
    Steps:
      1. Run: pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts
    Expected Result: All tests pass (existing 12 + 2 new = ~14 tests, 0 failures)
    Failure Indicators: Any test failure or test count lower than 14
    Evidence: .sisyphus/evidence/task-2-all-tests-pass.txt

  Scenario: Fixture contains zero output contract references
    Tool: Bash (grep)
    Preconditions: Test file updated
    Steps:
      1. Run: grep -n 'Write to /tmp/summary.txt' src/gateway/services/__tests__/archetype-generator.test.ts
      2. Run: grep -n 'Write results to /tmp/summary.txt' src/gateway/services/__tests__/archetype-generator.test.ts
      3. Run: grep -n 'OUTPUT FORMAT' src/gateway/services/__tests__/archetype-generator.test.ts
      4. Run: grep -n 'write to /tmp/summary' src/gateway/services/__tests__/archetype-generator.test.ts
    Expected Result: All grep commands return empty (no output contract references in fixture)
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-2-fixture-clean.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-all-tests-pass.txt
  - [ ] task-2-fixture-clean.txt

  **Commit**: YES (groups with Task 1)
  - Message: `fix(archetype-generator): replace direct file write instructions with submit-output.ts reference`
  - Files: `src/gateway/services/archetype-generator.ts`, `src/gateway/services/__tests__/archetype-generator.test.ts`
  - Pre-commit: `pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts`

- [x] 3. Update creating-archetypes skill — Output Contract section

  **What to do**:
  - In `.opencode/skills/creating-archetypes/SKILL.md`, update the Output Contract section (lines 215-227):
    1. **Replace the current section** which only mentions raw file paths with a section that:
       - States `submit-output.ts` is the mandatory tool for writing the output contract
       - Shows the exact CLI: `tsx /tools/platform/submit-output.ts --summary "..." --classification "NEEDS_APPROVAL|NO_ACTION_NEEDED"`
       - Explains that the platform injects output instructions at runtime via `platform-procedures.mts` — archetypes should NOT include output format details in `agents_md`
       - Notes that `/tmp/approval-message.json` is auto-managed by the harness (agents don't write it)
       - Keeps the note that absence of both files = task `Failed`
    2. **Add a clear rule**: "Do NOT include OUTPUT FORMAT instructions in `agents_md`. The platform injects these at runtime. The `agents_md` should only reference `submit-output.ts` as a final workflow step."
  - Do NOT say "never write `/tmp/summary.txt` directly" — the fallback is legitimate. Say "do not include output contract instructions in `agents_md`"

  **Must NOT do**:
  - Do NOT contradict `src/workers/config/agents.md` which documents the fallback path
  - Do NOT touch any other section of the skill file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single section update in a markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `.opencode/skills/creating-archetypes/SKILL.md:215-227` — Current Output Contract section that needs updating. Currently only mentions raw file paths, no `submit-output.ts` reference.

  **API/Type References**:
  - `src/worker-tools/platform/submit-output.ts` — The tool's CLI interface. Required flags: `--summary`, `--classification`. Optional: `--draft`, `--confidence`, `--reasoning`, `--urgency`, `--metadata`.
  - `src/workers/lib/platform-procedures.mts` — The runtime injection that teaches `submit-output.ts` to every worker. Read this to understand what the platform already provides so the skill doesn't duplicate it.

  **WHY Each Reference Matters**:
  - The skill section is what you're replacing — read the current version to understand what context to preserve
  - `submit-output.ts` CLI interface tells you the exact syntax to document
  - `platform-procedures.mts` tells you what the platform already injects so you can explain that archetypes don't need to duplicate it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill mentions submit-output.ts in Output Contract section
    Tool: Bash (grep)
    Preconditions: Skill file updated
    Steps:
      1. Run: grep -c 'submit-output.ts' .opencode/skills/creating-archetypes/SKILL.md
    Expected Result: Count >= 1
    Failure Indicators: Count is 0
    Evidence: .sisyphus/evidence/task-3-skill-has-tool-ref.txt

  Scenario: Skill does not teach direct file writes as primary pattern
    Tool: Bash (grep)
    Preconditions: Skill file updated
    Steps:
      1. Run: grep -n 'Write to /tmp/summary.txt' .opencode/skills/creating-archetypes/SKILL.md
    Expected Result: No matches (the skill should not show the direct write pattern)
    Failure Indicators: Match found
    Evidence: .sisyphus/evidence/task-3-no-direct-writes.txt

  Scenario: Skill mentions platform-procedures.mts runtime injection
    Tool: Bash (grep)
    Preconditions: Skill file updated
    Steps:
      1. Run: grep -c 'platform-procedures' .opencode/skills/creating-archetypes/SKILL.md
    Expected Result: Count >= 1 (explains that the platform handles output injection)
    Failure Indicators: Count is 0
    Evidence: .sisyphus/evidence/task-3-mentions-runtime-injection.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-skill-has-tool-ref.txt
  - [ ] task-3-no-direct-writes.txt
  - [ ] task-3-mentions-runtime-injection.txt

  **Commit**: YES
  - Message: `docs(skills): update creating-archetypes output contract to reference submit-output.ts`
  - Files: `.opencode/skills/creating-archetypes/SKILL.md`
  - Pre-commit: none (markdown only)

- [x] 4. Notify completion

  Send Telegram: `tsx scripts/telegram-notify.ts "✅ output-contract-platform-injection complete — All tasks done. Come back to review results."`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `fix(archetype-generator): replace direct file write instructions with submit-output.ts reference` — `src/gateway/services/archetype-generator.ts`, `src/gateway/services/__tests__/archetype-generator.test.ts`
- **2**: `docs(skills): update creating-archetypes output contract to reference submit-output.ts` — `.opencode/skills/creating-archetypes/SKILL.md`

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts  # Expected: all tests pass (existing + new)
grep -c 'Write to /tmp/summary.txt' src/gateway/services/archetype-generator.ts  # Expected: 0
grep -c 'OUTPUT FORMAT' src/gateway/services/archetype-generator.ts  # Expected: 0
grep -c 'submit-output.ts' .opencode/skills/creating-archetypes/SKILL.md  # Expected: >= 1
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] AGENTS.md updated if needed (likely no changes needed — submit-output.ts already documented there)
