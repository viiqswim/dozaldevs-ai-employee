# Fix Archetype Generator Conflicting Instructions

## TL;DR

> **Quick Summary**: Fix the archetype generator's `SYSTEM_PROMPT` to stop producing `agents_md` content (classification rules, tool listings) that conflicts with what the platform auto-injects at runtime, causing cheap models to fail.
>
> **Deliverables**:
>
> - Updated `SYSTEM_PROMPT` and `REFINE_SYSTEM_PROMPT` with forbidden-section rules
> - Post-processing sanitizer in `postProcess()` to strip conflicting sections from generated `agents_md`
> - Updated test fixture and new test assertions verifying no forbidden content
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → F1-F4 → User okay

---

## Context

### Original Request

The `daily-real-estate-inspiration-3` employee (created via the web UI dashboard) fails with "Model did not produce content" because it never calls `submit-output.ts`. Investigation revealed the generated `agents_md` contains classification rules (with invalid value `APPROVED`) and fake tool listings that contradict what the platform auto-injects at runtime via `platform-procedures.mts` and `tool-reference-generator.mts`.

### Interview Summary

**Key Discussions**:

- The root cause is in `src/gateway/services/archetype-generator.ts` — the `SYSTEM_PROMPT` instructs the LLM to generate `agents_md` with "CLASSIFICATION RULES" and "TOOLS AVAILABLE" sections that the platform already handles
- `agents-md-resolver.mts` does zero deduplication — pure string concatenation of 6 layers
- `submit-output.ts` only accepts `NEEDS_APPROVAL` and `NO_ACTION_NEEDED` — `APPROVED` is NOT valid at the tool level (exits 1), even though `output-schema.mts` has it as lifecycle-internal
- User wants a platform fix, not per-employee data fix
- User confirmed: tests + post-processing sanitization safety net

**Research Findings**:

- `SYSTEM_PROMPT` lines 96-122 require 4 agents_md sections: Opening sentence, WORKFLOW, CLASSIFICATION RULES, TOOLS AVAILABLE — last two conflict with runtime injection
- `platform-procedures.mts`: For `approval_required: false`, injects "Use `NO_ACTION_NEEDED` — Do NOT use NEEDS_APPROVAL"
- `tool-reference-generator.mts`: Parses actual source files into real tool paths, always includes submit-output
- Runtime tool section header is `## Available Tools`; generator uses `TOOLS AVAILABLE TO YOU:` — different strings, sanitizer must catch both variants
- Runtime procedures header is `## How to Complete Your Work`; generator uses `CLASSIFICATION RULES:` — different strings but same semantic conflict
- `refine()` passes previous config as JSON in user message — if prior `agents_md` has forbidden sections, LLM will preserve them unless explicitly told not to

### Metis Review

**Identified Gaps** (addressed):

- Sanitizer regex must handle both bare-text (`CLASSIFICATION RULES:`) and markdown heading (`## Classification Rules`) variants
- Sanitizer must match standalone section headers only, not inline mentions within WORKFLOW steps
- `REFINE_SYSTEM_PROMPT` needs explicit rule to remove forbidden sections from input `agents_md`, not just "preserve all fields"
- Test fixture `makeValidJsonContent()` includes forbidden sections — must be updated alongside new assertions
- Need preservation test: confirm WORKFLOW section survives sanitization
- Edge case: if agents_md becomes empty/near-empty after sanitization, should warn (but not throw — the LLM will retry)

---

## Work Objectives

### Core Objective

Eliminate conflicting instructions from generated `agents_md` so that any model — including cheap ones (quality_index 33) — receives unambiguous instructions about classification and tools from exactly one source: the platform's runtime injection.

### Concrete Deliverables

- Updated `SYSTEM_PROMPT` constant (remove CLASSIFICATION RULES and TOOLS AVAILABLE from required sections, add DO NOT INCLUDE rules)
- Updated `REFINE_SYSTEM_PROMPT` constant (add DO NOT INCLUDE rules + instruction to strip legacy forbidden sections from input)
- New `sanitizeAgentsMd()` function called from `postProcess()` (strip forbidden sections via regex)
- Updated test fixture (`makeValidJsonContent()`) without forbidden sections
- 5+ new test assertions verifying no forbidden content and correct preservation

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 failures (existing 1490 + new tests passing, 27 skipped)
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] Generated `agents_md` from `SYSTEM_PROMPT` never contains CLASSIFICATION RULES, TOOLS AVAILABLE, or APPROVED as classification value
- [ ] WORKFLOW section is preserved in generated `agents_md`
- [ ] `postProcess()` strips forbidden sections from any `agents_md` that contains them

### Must Have

- SYSTEM_PROMPT no longer instructs LLM to generate CLASSIFICATION RULES or TOOLS AVAILABLE sections
- SYSTEM_PROMPT explicitly forbids these sections with "DO NOT include" rules
- `APPROVED` removed from any classification guidance in the prompt
- Post-processing sanitizer strips forbidden sections as safety net
- REFINE_SYSTEM_PROMPT includes same restrictions + instruction to strip legacy content
- Updated test fixture without forbidden sections
- Tests asserting absence of forbidden content

### Must NOT Have (Guardrails)

- DO NOT touch `src/workers/lib/agents-md-resolver.mts` — pure concatenation is out of scope
- DO NOT touch `src/workers/lib/platform-procedures.mts` — correct as-is
- DO NOT touch `src/workers/lib/tool-reference-generator.mts` — correct as-is
- DO NOT touch `src/workers/lib/output-schema.mts` — `APPROVED` in schema is lifecycle-internal and correct
- DO NOT touch `src/worker-tools/platform/submit-output.ts` — correct as-is
- DO NOT migrate or patch existing archetype records in the database
- DO NOT add deduplication logic to the resolver (wrong layer for this fix)
- DO NOT sanitize the `overview` field — it contains human-readable metadata, not agent instructions
- DO NOT add tests that require triggering a real employee task — this is unit-level
- DO NOT add input validation to the archetype save endpoint — different ticket

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — updating existing test file)
- **Framework**: Vitest (`pnpm test`)
- **Approach**: Update existing fixture, add new assertions in existing test file

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: Use Bash (`pnpm test -- --run`) — run tests, assert pass count
- **Build verification**: Use Bash (`pnpm build && pnpm lint`) — confirm no regressions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — prompt + sanitizer + tests):
├── Task 1: Fix SYSTEM_PROMPT + REFINE_SYSTEM_PROMPT + sanitizer + tests [deep]

Wave FINAL (After Task 1 — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks    |
| ----- | ---------- | --------- |
| 1     | None       | F1-F4     |
| F1-F4 | 1          | User okay |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `deep` (prompt engineering + regex sanitizer + tests in single file scope)
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix SYSTEM_PROMPT, REFINE_SYSTEM_PROMPT, add sanitizer, update tests

  **What to do**:

  **Part A — Fix `SYSTEM_PROMPT` (lines 96-122 of `archetype-generator.ts`):**
  1. In the `## agents_md Structure` section (line 96), change the required sections list from 4 items to 2:
     - KEEP item 1: "Opening sentence"
     - KEEP item 2: "WORKFLOW section"
     - REMOVE item 3: "CLASSIFICATION RULES section" (line 100)
     - REMOVE item 4: "TOOLS AVAILABLE section" (line 101)
  2. After the kept items, add an explicit "DO NOT include" block with equal visual weight:
     ```
     CRITICAL — Do NOT include these sections in agents_md (the platform injects them automatically at runtime):
     - Do NOT include a CLASSIFICATION RULES section. The platform injects correct classification guidance based on the archetype's approval settings.
     - Do NOT include a TOOLS AVAILABLE section. The platform auto-generates a real tool listing from the tool_registry at runtime.
     - Do NOT mention APPROVED as a classification value — only NEEDS_APPROVAL and NO_ACTION_NEEDED are valid.
     - Do NOT include submit-output instructions, /tmp/ file paths, or output format details.
     ```
  3. Update the example `agents_md` structure (lines 106-122):
     - KEEP: Opening sentence, WORKFLOW section
     - REMOVE: The `CLASSIFICATION RULES:` block (lines 114-117)
     - REMOVE: The `TOOLS AVAILABLE TO YOU:` block (lines 119-121)
  4. In the `## JSON Shape` section (line 132), update the `agents_md` description to remove mentions of CLASSIFICATION RULES and TOOLS sections.

  **Part B — Fix `REFINE_SYSTEM_PROMPT` (line 180):**
  1. Add a new rule after "Preserve all fields that are not affected" (line 188):
     ```
     - If the input agents_md contains CLASSIFICATION RULES, TOOLS AVAILABLE, or output format sections, REMOVE them during refinement — these are injected by the platform at runtime and must not be in agents_md.
     - Do NOT add CLASSIFICATION RULES, TOOLS AVAILABLE, or APPROVED classification references to agents_md.
     ```

  **Part C — Add `sanitizeAgentsMd()` function:**
  1. Add a new function `sanitizeAgentsMd(agentsMd: string): string` before `postProcess()`:
     - Strip sections starting with `CLASSIFICATION RULES` (case-insensitive, with or without `##` prefix, with or without colon)
       - Match pattern: standalone line starting with optional `##` + `classification rules` (case-insensitive)
       - Strip from the matched line to (but not including) the next section header (line starting with `##`, or all-caps word followed by colon on its own line, or end of string)
     - Strip sections starting with `TOOLS AVAILABLE` (case-insensitive, with or without `##` prefix, with or without trailing `TO YOU`)
       - Same boundary logic as above
     - Strip any standalone line containing `Write APPROVED` or `Use APPROVED` or `classification.*APPROVED` (case-insensitive) — catches stray classification guidance
     - Trim excess blank lines (collapse 3+ consecutive newlines to 2)
     - If result is empty or only whitespace after sanitization, log a warning but return the original `agents_md` unsanitized (better to have conflicting content than empty content)
  2. Call `sanitizeAgentsMd()` from `postProcess()` after line 228 (after the Slack channel input filter):
     ```typescript
     if (typeof result.agents_md === 'string') {
       result.agents_md = sanitizeAgentsMd(result.agents_md);
     }
     ```

  **Part D — Update test fixture and add new tests:**
  1. Update `makeValidJsonContent()` (lines 26-39) — remove `CLASSIFICATION RULES:` and `TOOLS AVAILABLE TO YOU:` blocks from the `agents_md` array. Keep only Opening sentence, blank line, WORKFLOW section.
     New fixture `agents_md`:
     ```
     'You are a daily digest bot.',
     '',
     'WORKFLOW:',
     '1. Fetch data.',
     '2. Summarize.',
     '3. Compose the final digest message.',
     ```
  2. Add new test in `describe('SYSTEM_PROMPT content')`:
     ```
     it('SYSTEM_PROMPT does not instruct LLM to generate CLASSIFICATION RULES section', ...)
     ```
     Assert: `systemMessage.content` does NOT match `/include.*CLASSIFICATION RULES/i` as a required section (but MAY mention it in a "DO NOT include" context).
     More precise: assert it contains a phrase like "Do NOT include" near "CLASSIFICATION RULES".
  3. Add new test in `describe('SYSTEM_PROMPT content')`:
     ```
     it('SYSTEM_PROMPT does not instruct LLM to generate TOOLS AVAILABLE section', ...)
     ```
     Same pattern as above.
  4. Add new test in `describe('SYSTEM_PROMPT content')`:
     ```
     it('SYSTEM_PROMPT does not mention APPROVED as a valid agent-facing classification', ...)
     ```
     Assert: the agents_md example in `SYSTEM_PROMPT` does NOT contain `APPROVED` as a classification option. The "DO NOT" block may mention it as forbidden, which is fine.
  5. Add new `describe('sanitizeAgentsMd')` block:
     ```
     it('strips CLASSIFICATION RULES section from agents_md', ...)
     ```
     Input: `agents_md` with WORKFLOW + CLASSIFICATION RULES sections. Assert: output contains WORKFLOW, does NOT contain CLASSIFICATION RULES.
     ```
     it('strips TOOLS AVAILABLE TO YOU section from agents_md', ...)
     ```
     Input: `agents_md` with WORKFLOW + TOOLS AVAILABLE section. Assert: output contains WORKFLOW, does NOT contain TOOLS AVAILABLE.
     ```
     it('strips ## heading variant of forbidden sections', ...)
     ```
     Input: `agents_md` with `## Classification Rules` and `## Available Tools` as markdown headings. Assert: both stripped, WORKFLOW preserved.
     ```
     it('preserves WORKFLOW section after sanitization', ...)
     ```
     Input: `agents_md` with all 4 sections. Assert: WORKFLOW and opening sentence survive.
     ```
     it('returns original agents_md if sanitization would produce empty string', ...)
     ```
     Input: `agents_md` that is ONLY classification rules and tools. Assert: returns original (non-empty).
  6. Run `pnpm test -- --run` — confirm all existing + new tests pass.

  **Must NOT do**:
  - DO NOT touch any file outside `src/gateway/services/archetype-generator.ts` and its test file
  - DO NOT modify `agents-md-resolver.mts`, `platform-procedures.mts`, `tool-reference-generator.mts`, `output-schema.mts`
  - DO NOT sanitize the `overview` field
  - DO NOT add tests that trigger real employee tasks
  - DO NOT use overly aggressive regex that strips inline mentions of "classification" or "tools" within WORKFLOW steps — only match standalone section headers

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful prompt engineering, regex design for section stripping with edge cases, and coordination between prompt changes and test updates in a single coherent change
  - **Skills**: []
    - No skills needed — this is pure TypeScript/prompt engineering in a well-understood file
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not adding shell tools
    - `creating-archetypes`: Not creating an archetype — fixing the generator that creates them

  **Parallelization**:
  - **Can Run In Parallel**: NO (single task, wave 1 only)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: F1-F4 (Final Verification Wave)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/gateway/services/archetype-generator.ts:213-249` — `postProcess()` function — follow this pattern for adding the sanitizer call. Note the Slack channel input stripping at lines 220-228 as a model for regex-based content filtering in post-processing.
  - `src/gateway/services/archetype-generator.ts:51-178` — `SYSTEM_PROMPT` constant — the full prompt to modify. Lines 96-122 are the agents_md structure section with the 4 required sections (remove items 3 and 4, add DO NOT rules).
  - `src/gateway/services/archetype-generator.ts:180-196` — `REFINE_SYSTEM_PROMPT` constant — add the same DO NOT rules here, plus the instruction to strip legacy forbidden sections from input agents_md.
  - `src/gateway/services/__tests__/archetype-generator.test.ts:18-48` — `makeValidJsonContent()` fixture — update lines 34-38 to remove CLASSIFICATION RULES and TOOLS AVAILABLE. Keep lines 28-33 (opening sentence + WORKFLOW).
  - `src/gateway/services/__tests__/archetype-generator.test.ts:222-254` — existing `describe('SYSTEM_PROMPT content')` block — add new tests here.

  **API/Type References** (contracts to implement against):
  - `src/worker-tools/platform/submit-output.ts:30` — `VALID_CLASSIFICATIONS = ['NEEDS_APPROVAL', 'NO_ACTION_NEEDED']` — these are the ONLY two valid agent-facing values. `APPROVED` is NOT valid here (causes `process.exit(1)`).
  - `src/workers/lib/output-schema.mts:15` — `z.enum(['APPROVED', 'NEEDS_APPROVAL', 'NO_ACTION_NEEDED'])` — `APPROVED` exists in schema but is lifecycle-internal. Do NOT remove it from schema. Just ensure the generator never tells agents to use it.

  **Runtime Injection References** (what the platform already handles — DO NOT duplicate):
  - `src/workers/lib/platform-procedures.mts:9-37` — `generatePlatformProcedures()` — injects "## How to Complete Your Work" section with correct classification guidance. For `approval_required: false`: "Use NO_ACTION_NEEDED — Do NOT use NEEDS_APPROVAL." For `approval_required: true`: "Use NEEDS_APPROVAL (default), or NO_ACTION_NEEDED if nothing to do."
  - `src/workers/lib/tool-reference-generator.mts:39-86` — `generateToolReference()` — injects "## Available Tools" section with real tool paths parsed from source. Always includes `submit-output`. The generator's `TOOLS AVAILABLE TO YOU` section is a redundant, fake version of this.
  - `src/workers/lib/agents-md-resolver.mts` — Pure concatenation of 6 layers with ZERO deduplication. This is WHY duplicate sections cause conflicts — both copies appear in the final AGENTS.md.

  **WHY Each Reference Matters**:
  - `archetype-generator.ts:51-178` — This IS the file being modified. The SYSTEM_PROMPT is the root cause of conflicting content generation.
  - `archetype-generator.ts:213-249` — The `postProcess()` function already does content filtering (Slack channels). The sanitizer follows the same pattern.
  - `submit-output.ts:30` — Proves `APPROVED` is not a valid agent-facing classification. The sanitizer must strip any mention of it as a classification option.
  - `platform-procedures.mts` — Shows exactly what the platform already injects. The generator must never duplicate these sections. Read this to understand the "## How to Complete Your Work" header and classification guidance format.
  - `tool-reference-generator.mts` — Shows the "## Available Tools" header and format. The generator must never create a competing tool listing.
  - `agents-md-resolver.mts` — Explains why duplication causes conflicts (no dedup). You do NOT modify this file — just understand that duplicate sections will both appear.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Unit tests pass with updated fixture and new assertions
    Tool: Bash
    Preconditions: All code changes applied to archetype-generator.ts and its test file
    Steps:
      1. Run: pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts
      2. Assert: exit code 0
      3. Assert: output contains "Tests  X passed" where X >= 15 (current 12 + at least 3 new)
      4. Assert: output contains "0 failed"
    Expected Result: All tests pass, including new assertions for forbidden content
    Failure Indicators: Any test failure, especially in new sanitizer or SYSTEM_PROMPT tests
    Evidence: .sisyphus/evidence/task-1-unit-tests.txt

  Scenario: Full test suite passes (no regressions)
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert: output shows passing count >= 1490 (may increase with new tests)
      3. Assert: output shows "27 skipped"
      4. Assert: output shows "0 failed"
    Expected Result: No regressions in any test file
    Failure Indicators: Any failure outside archetype-generator.test.ts
    Evidence: .sisyphus/evidence/task-1-full-suite.txt

  Scenario: Build and lint pass
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
      3. Run: pnpm lint
      4. Assert: exit code 0
    Expected Result: TypeScript compiles, no lint errors
    Failure Indicators: Type errors from new function, lint warnings
    Evidence: .sisyphus/evidence/task-1-build-lint.txt

  Scenario: SYSTEM_PROMPT contains DO NOT rules for forbidden sections
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -c "Do NOT include" src/gateway/services/archetype-generator.ts
      2. Assert: count >= 2 (at least one for CLASSIFICATION RULES, one for TOOLS AVAILABLE)
      3. Run: grep -c "CLASSIFICATION RULES" src/gateway/services/archetype-generator.ts
      4. Verify: occurrences are in "DO NOT" context, not in "MUST include" context
    Expected Result: Prompt explicitly forbids the two sections
    Failure Indicators: CLASSIFICATION RULES still listed as a required section
    Evidence: .sisyphus/evidence/task-1-prompt-check.txt

  Scenario: Sanitizer strips forbidden sections from agents_md with CLASSIFICATION RULES
    Tool: Bash (pnpm test -- focused on sanitizer test)
    Preconditions: sanitizeAgentsMd function and its tests exist
    Steps:
      1. Run: pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts -t "strips CLASSIFICATION RULES"
      2. Assert: test passes
    Expected Result: Sanitizer correctly strips CLASSIFICATION RULES section while preserving WORKFLOW
    Failure Indicators: Test failure, or WORKFLOW content also stripped (over-aggressive regex)
    Evidence: .sisyphus/evidence/task-1-sanitizer-classification.txt

  Scenario: Sanitizer strips forbidden sections from agents_md with TOOLS AVAILABLE
    Tool: Bash (pnpm test -- focused on sanitizer test)
    Preconditions: sanitizeAgentsMd function and its tests exist
    Steps:
      1. Run: pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts -t "strips TOOLS AVAILABLE"
      2. Assert: test passes
    Expected Result: Sanitizer correctly strips TOOLS AVAILABLE section while preserving WORKFLOW
    Failure Indicators: Test failure, or WORKFLOW content also stripped
    Evidence: .sisyphus/evidence/task-1-sanitizer-tools.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-unit-tests.txt — focused test run output
  - [ ] task-1-full-suite.txt — full test suite output (tail)
  - [ ] task-1-build-lint.txt — build + lint output
  - [ ] task-1-prompt-check.txt — grep verification of DO NOT rules
  - [ ] task-1-sanitizer-classification.txt — sanitizer test for classification rules
  - [ ] task-1-sanitizer-tools.txt — sanitizer test for tools section

  **Commit**: YES
  - Message: `fix(archetype-generator): remove conflicting classification and tool sections from generated agents_md`
  - Files: `src/gateway/services/archetype-generator.ts`, `src/gateway/services/__tests__/archetype-generator.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for DO NOT rules, check sanitizer function exists). For each "Must NOT Have": search codebase for forbidden changes (grep for modifications to agents-md-resolver.mts, platform-procedures.mts, tool-reference-generator.mts, output-schema.mts). Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review `src/gateway/services/archetype-generator.ts` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check sanitizer regex for correctness (does it handle edge cases? Is it too aggressive?). Verify the prompt changes are clear and unambiguous.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from Task 1 — follow exact steps, capture evidence. Verify sanitizer handles all variants: bare-text headers, markdown heading variants, inline mentions (should NOT be stripped). Test edge case: agents_md that becomes empty after sanitization returns original.
      Output: `Scenarios [N/N pass] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For Task 1: read "What to do", read actual diff (git diff). Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance: confirm NO changes to agents-md-resolver.mts, platform-procedures.mts, tool-reference-generator.mts, output-schema.mts, submit-output.ts. Flag any unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

- [x] F5. **Notify completion** — Send Telegram: `tsx scripts/telegram-notify.ts "✅ archetype-generator-conflicts complete — All tasks done. Come back to review results."`

---

## Commit Strategy

| Task | Commit Message                                                                                           | Files                                                                                                       | Pre-commit           |
| ---- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| 1    | `fix(archetype-generator): remove conflicting classification and tool sections from generated agents_md` | `src/gateway/services/archetype-generator.ts`, `src/gateway/services/__tests__/archetype-generator.test.ts` | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                    # Expected: >= 1495 passing, 27 skipped, 0 failed
pnpm build                            # Expected: exit 0
pnpm lint                             # Expected: exit 0
grep -c "Do NOT include" src/gateway/services/archetype-generator.ts  # Expected: >= 2
grep "CLASSIFICATION RULES" src/gateway/services/archetype-generator.ts  # Expected: only in DO NOT context
```

### Final Checklist

- [ ] SYSTEM_PROMPT no longer requires CLASSIFICATION RULES section in agents_md
- [ ] SYSTEM_PROMPT no longer requires TOOLS AVAILABLE section in agents_md
- [ ] SYSTEM_PROMPT explicitly forbids both sections with DO NOT rules
- [ ] SYSTEM_PROMPT does not mention APPROVED as a valid classification for agents
- [ ] REFINE_SYSTEM_PROMPT includes same DO NOT rules + strip-legacy instruction
- [ ] `sanitizeAgentsMd()` function exists and strips forbidden sections
- [ ] `postProcess()` calls `sanitizeAgentsMd()` on agents_md
- [ ] Test fixture updated — no CLASSIFICATION RULES or TOOLS AVAILABLE in mock agents_md
- [ ] New tests assert absence of forbidden content in SYSTEM_PROMPT
- [ ] New tests verify sanitizer strips forbidden sections
- [ ] New tests verify WORKFLOW section is preserved after sanitization
- [ ] All tests pass, build succeeds, lint passes
