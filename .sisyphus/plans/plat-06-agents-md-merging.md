# PLAT-06: AGENTS.md Merging — Concatenate Three Levels

## TL;DR

> **Quick Summary**: Change `resolveAgentsMd()` from first-non-null fallback to concatenation of all three levels (Platform + Tenant + Archetype), ensuring platform security policies are never silently dropped when an archetype or tenant sets custom instructions.
>
> **Deliverables**:
>
> - Refactored `resolveAgentsMd()` with concatenation logic
> - Updated harness call site (always writes concatenated content)
> - Rewritten unit tests (9 existing → new concatenation assertions)
> - New edge case tests (empty string, whitespace-only, all-three-present)
> - Build/lint/test verification passing
> - Story-map document updated with PLAT-06 checkboxes checked
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → F1-F4

---

## Context

### Original Request

Implement PLAT-06 from the Phase 1 story map: change `resolveAgentsMd()` from first-non-null fallback to concatenation of three levels. Test thoroughly via automated tests and API endpoint verification. Update story-map document to mark PLAT-06 as complete.

### Interview Summary

**Key Discussions**:

- Dependencies PLAT-02 (static platform AGENTS.md) and PLAT-04 (schema + resolver wiring) are both fully implemented
- Current implementation: 21-line pure function, single call site in harness
- Current bug: when resolver returns non-null, it completely overwrites the static platform AGENTS.md, losing platform security policies
- No size constraints in the opencode-harness path (the 8000 char limit is deprecated engineering harness only)

**Research Findings**:

- `src/workers/lib/agents-md-resolver.mts` — 21-line pure function, first-non-null fallback
- `src/workers/opencode-harness.mts` line 387 — only call site, writes to `/app/AGENTS.md` via `writeFile`
- `src/workers/config/agents.md` — 83-line static platform policy file, copied to `/app/AGENTS.md` in Dockerfile
- `tests/workers/lib/agents-md-resolver.test.ts` — 9 unit tests asserting fallback semantics
- `tests/workers/config/agents-md-content.test.ts` — 10 content-policy tests (unaffected)
- `tests/gateway/migration-agents-md.test.ts` — schema/seed tests (unaffected)

### Metis Review

**Identified Gaps** (addressed):

- **TOCTOU risk**: Harness reads `/app/AGENTS.md` (the file it's about to overwrite). On retry, could read previously-concatenated content. **Resolution**: Documented as known limitation — fixing requires Dockerfile change, out of scope for PLAT-06. The harness should read from a separate source (e.g., `/app/agents-platform.md`) in a future story.
- **Separator format**: Must lock down exact separator string before implementation. **Resolution**: `\n\n` (double newline) between section header and content, `\n\n` between sections. No `---` separators.
- **Empty string vs null behavior**: `""` and whitespace-only `"   \n  "` must be treated same as null (section omitted). **Resolution**: Explicit in acceptance criteria and tests.
- **Return type change breaks null-check**: Harness has `if (agentsMdContent && ...)` guard that becomes dead code. **Resolution**: Task explicitly removes the conditional, always writes.
- **`pnpm build` verification**: TypeScript compilation must pass, not just tests. **Resolution**: Added as acceptance criterion.
- **Duplicate header conflict**: Archetype content could contain `# Platform Policy` header. **Resolution**: Documented as known limitation — not worth guarding in PLAT-06 scope.

---

## Work Objectives

### Core Objective

Ensure platform-wide security policies are never silently dropped when an archetype or tenant sets custom AGENTS.md instructions, by concatenating all three levels instead of using a first-non-null fallback.

### Concrete Deliverables

- Modified `src/workers/lib/agents-md-resolver.mts` — concatenation logic
- Modified `src/workers/opencode-harness.mts` — updated call site (read platform file, pass to resolver, always write)
- Rewritten `tests/workers/lib/agents-md-resolver.test.ts` — comprehensive concatenation tests
- Updated `docs/2026-04-21-2202-phase1-story-map.md` — PLAT-06 checkboxes checked

### Definition of Done

- [ ] `pnpm test -- --run` exits 0
- [ ] `pnpm build` exits 0
- [ ] `pnpm lint` exits 0
- [ ] All 6 PLAT-06 acceptance criteria from story-map are satisfied

### Must Have

- Platform content always appears first in concatenated output
- Section headers: `# Platform Policy`, `# Tenant Conventions`, `# Employee Instructions`
- Null, empty string `""`, and whitespace-only `"   \n  "` levels are omitted (no empty headers)
- Platform level is always included (function always returns non-empty string)
- Existing archetypes continue working (their `agents_md` becomes third section, not only content)
- Pure function — no file I/O inside `resolveAgentsMd()`

### Must NOT Have (Guardrails)

- **DO NOT** add size/truncation logic to the concatenation path
- **DO NOT** modify `tests/gateway/migration-agents-md.test.ts` or `tests/workers/config/agents-md-content.test.ts`
- **DO NOT** add file I/O to `resolveAgentsMd()` — the harness owns all I/O
- **DO NOT** leave the old null-check branch as dead code in the harness
- **DO NOT** modify the Dockerfile or the static file path
- **DO NOT** modify `src/workers/config/agents.md` (the static platform content)
- **DO NOT** change the Prisma schema or seed data
- **DO NOT** touch deprecated engineering harness files (`orchestrate.mts`, `agents-md-reader.mts`, `long-running.ts`)
- **DO NOT** add excessive JSDoc comments or over-abstract the concatenation logic
- **DO NOT** fix pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (TDD — write tests first, then implement)
- **Framework**: vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (`pnpm test -- --run`) — run tests, assert pass counts
- **Build**: Use Bash (`pnpm build`) — assert exit code 0
- **Lint**: Use Bash (`pnpm lint`) — assert exit code 0

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — TDD: write tests first):
├── Task 1: Rewrite unit tests for concatenation semantics [quick]
└── Task 2: Read current source files for reference (no-op — merged into Task 1)

Wave 2 (Implementation — make tests pass):
├── Task 3: Refactor resolveAgentsMd() to concatenation (depends: 1) [quick]
└── Task 4: Update harness call site (depends: 3) [quick]

Wave 3 (Verification + Docs):
├── Task 5: Full build/test/lint verification (depends: 3, 4) [quick]
└── Task 6: Update story-map document (depends: 5) [quick]

Wave 4 (Notification):
└── Task 7: Send Telegram notification (depends: 6) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 3      | 1     |
| 3     | 1          | 4, 5   | 2     |
| 4     | 3          | 5      | 2     |
| 5     | 3, 4       | 6      | 3     |
| 6     | 5          | 7      | 3     |
| 7     | 6          | F1-F4  | 4     |
| F1-F4 | 7          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **2 tasks** — T3 → `quick`, T4 → `quick`
- **Wave 3**: **2 tasks** — T5 → `quick`, T6 → `quick`
- **Wave 4**: **1 task** — T7 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Rewrite unit tests for concatenation semantics (TDD — RED phase)

  **What to do**:
  - Read the current test file `tests/workers/lib/agents-md-resolver.test.ts` to understand existing 9 test cases
  - Read `src/workers/lib/agents-md-resolver.mts` to understand current function signature
  - Rewrite ALL tests to assert concatenation semantics instead of fallback semantics
  - The new function signature will be: `resolveAgentsMd(platformContent: string, tenantConfig: Record<string, unknown> | null, archetype: { agents_md?: string | null } | null): string`
  - Note: argument order changes — `platformContent` is first (required), `archetype` moves to third position
  - New tests must cover:
    1. **All three levels present**: Output contains `# Platform Policy\n\n{platform}`, then `\n\n# Tenant Conventions\n\n{tenant}`, then `\n\n# Employee Instructions\n\n{archetype}` — in that exact order
    2. **Platform only** (tenant null, archetype null): Output is `# Platform Policy\n\n{platform}` — no other headers
    3. **Platform + tenant** (archetype null): Output has Platform and Tenant sections, no Employee Instructions header
    4. **Platform + archetype** (tenant null): Output has Platform and Employee Instructions sections, no Tenant Conventions header
    5. **Empty string tenant** (`""`): Treated as null — Tenant Conventions section omitted
    6. **Whitespace-only tenant** (`"   \n  "`): Treated as null — section omitted
    7. **Empty string archetype** (`{ agents_md: "" }`): Treated as null — section omitted
    8. **Whitespace-only archetype** (`{ agents_md: "   " }`): Treated as null — section omitted
    9. **Null archetype object**: `archetype` parameter is `null` — only Platform section
    10. **Null tenantConfig**: `tenantConfig` parameter is `null` — only Platform section
    11. **Platform content always appears first**: When all three present, assert order via indexOf comparisons
    12. **Snapshot test**: Given fixed inputs for all three levels, assert exact byte-for-byte output matches snapshot
    13. **Archetype with custom agents_md still includes platform security policy**: Pass real-ish platform content, verify it appears in output alongside archetype content
  - After writing tests, run them — they MUST FAIL (RED phase of TDD). The current `resolveAgentsMd()` has a different signature, so TypeScript compilation of tests may fail, which counts as RED.

  **Must NOT do**:
  - Do NOT modify the implementation file `src/workers/lib/agents-md-resolver.mts` in this task
  - Do NOT modify `tests/gateway/migration-agents-md.test.ts` or `tests/workers/config/agents-md-content.test.ts`
  - Do NOT add excessive comments or JSDoc to the test file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single test file rewrite, clear spec, no ambiguity
  - **Skills**: `[]`
    - No special skills needed — standard Vitest test writing

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `tests/workers/lib/agents-md-resolver.test.ts` — Current 9-test structure. Replace ALL test cases, but follow the same describe/it pattern and import style.
  - `tests/workers/config/agents-md-content.test.ts` — Example of content assertion tests in the same module area. DO NOT MODIFY this file — reference only.

  **API/Type References** (contracts to implement against):
  - `src/workers/lib/agents-md-resolver.mts` — Current function signature (will change). Read this to understand what you're testing against.

  **External References**:
  - None needed — standard Vitest assertions

  **WHY Each Reference Matters**:
  - `agents-md-resolver.test.ts`: The file being rewritten. Must understand current test organization to replace it correctly.
  - `agents-md-content.test.ts`: Shows the team's test style for this module area. Follow the same patterns.
  - `agents-md-resolver.mts`: The function under test. Need to understand current signature to write tests for the NEW signature.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tests are written and fail against current implementation (RED)
    Tool: Bash
    Preconditions: No changes to src/workers/lib/agents-md-resolver.mts
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts 2>&1
      2. Check exit code is non-zero (tests fail)
      3. Verify output contains test failure messages (TypeScript errors or assertion failures)
    Expected Result: Exit code 1+ — tests fail because current function has wrong signature/behavior
    Failure Indicators: Exit code 0 (tests pass — means tests aren't actually testing new behavior)
    Evidence: .sisyphus/evidence/task-1-red-phase.txt

  Scenario: Test file has at least 13 test cases
    Tool: Bash
    Preconditions: Test file rewritten
    Steps:
      1. Run: grep -c "it(" tests/workers/lib/agents-md-resolver.test.ts
      2. Assert count >= 13
    Expected Result: At least 13 test cases covering all specified scenarios
    Failure Indicators: Fewer than 13 it() blocks
    Evidence: .sisyphus/evidence/task-1-test-count.txt
  ```

  **Commit**: NO (groups with Task 3)

- [x] 3. Refactor resolveAgentsMd() to concatenation (TDD — GREEN phase)

  **What to do**:
  - Modify `src/workers/lib/agents-md-resolver.mts` to implement concatenation logic
  - New function signature: `resolveAgentsMd(platformContent: string, tenantConfig: Record<string, unknown> | null, archetype: { agents_md?: string | null } | null): string`
  - Implementation logic:
    1. Start with `sections` array
    2. Always add Platform section: `# Platform Policy\n\n${platformContent}`
    3. Extract `tenantDefault` from `tenantConfig?.default_agents_md` — if string and non-empty after trim, add: `# Tenant Conventions\n\n${tenantDefault}`
    4. Extract `archetypeMd` from `archetype?.agents_md` — if non-null and non-empty after trim, add: `# Employee Instructions\n\n${archetypeMd}`
    5. Return `sections.join('\n\n')`
  - The function MUST remain a pure function — NO file I/O, NO side effects
  - Update the JSDoc comment to describe concatenation behavior (replace fallback description)
  - Run `pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts` — all tests from Task 1 MUST PASS (GREEN)

  **Must NOT do**:
  - Do NOT add size/truncation logic
  - Do NOT add file reading inside the function
  - Do NOT use `---` separators between sections (only `\n\n`)
  - Do NOT add a header when content is null/empty/whitespace-only
  - Do NOT over-abstract — this should be ~15-25 lines, not a class hierarchy

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, ~20 lines of implementation, clear spec from tests
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `src/workers/lib/agents-md-resolver.mts` — The file being modified. Read current implementation, understand the module format (.mts), export shape.

  **API/Type References**:
  - `tests/workers/lib/agents-md-resolver.test.ts` — The tests from Task 1 define the exact expected behavior. Read them to understand what your implementation must satisfy.

  **WHY Each Reference Matters**:
  - `agents-md-resolver.mts`: The file you're editing. Must preserve module format, export name, .mts extension.
  - `agents-md-resolver.test.ts`: The TDD tests you must make pass. They ARE the spec.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All unit tests pass (GREEN)
    Tool: Bash
    Preconditions: Task 1 tests written, resolveAgentsMd() refactored
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts 2>&1
      2. Assert exit code is 0
      3. Assert output shows all tests passing (0 failures)
    Expected Result: Exit code 0 — all 13+ tests pass
    Failure Indicators: Any test failure or TypeScript compilation error
    Evidence: .sisyphus/evidence/task-3-green-phase.txt

  Scenario: Function remains a pure function (no imports of fs/path)
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Run: grep -E "import.*from.*['\"]node:" src/workers/lib/agents-md-resolver.mts
      2. Assert no matches (exit code 1 from grep = no matches = good)
    Expected Result: No node: imports found — function is pure
    Failure Indicators: Any line containing node: imports
    Evidence: .sisyphus/evidence/task-3-pure-function-check.txt

  Scenario: Function signature matches spec
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Run: grep "export function resolveAgentsMd" src/workers/lib/agents-md-resolver.mts
      2. Assert output contains "platformContent: string"
      3. Assert output contains ": string {" (return type is string, not string | null)
    Expected Result: Signature matches: (platformContent: string, tenantConfig: ..., archetype: ...): string
    Failure Indicators: Old signature (no platformContent param) or nullable return type
    Evidence: .sisyphus/evidence/task-3-signature-check.txt
  ```

  **Commit**: YES
  - Message: `feat(workers): change resolveAgentsMd from fallback to concatenation`
  - Files: `src/workers/lib/agents-md-resolver.mts`, `tests/workers/lib/agents-md-resolver.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts`

- [x] 4. Update harness call site to pass platform content and always write

  **What to do**:
  - Modify `src/workers/opencode-harness.mts` at the `resolveAgentsMd()` call site (around line 387)
  - Before calling `resolveAgentsMd()`, read the static platform AGENTS.md content:
    ```ts
    const { readFile } = await import('node:fs/promises');
    const platformContent = await readFile('/app/AGENTS.md', 'utf8');
    ```
  - Update the call to pass the new argument order: `resolveAgentsMd(platformContent, tenantConfig, archetype)`
  - **Remove the null-check conditional entirely**. The old code:
    ```ts
    if (agentsMdContent && agentsMdContent.trim().length > 0) {
      await writeFile('/app/AGENTS.md', agentsMdContent, 'utf8');
    } else {
      log.info('Using static platform AGENTS.md...');
    }
    ```
    Becomes:
    ```ts
    const agentsMdContent = resolveAgentsMd(platformContent, tenantConfig, archetype);
    await writeFile('/app/AGENTS.md', agentsMdContent, 'utf8');
    log.info('Wrote concatenated AGENTS.md (%d levels)', ...);
    ```
  - Update the log message to indicate concatenation rather than "from archetype" vs "from tenant default"
  - The `try/catch` wrapper around this block should remain for error resilience
  - Verify the import statement at the top of the file for `resolveAgentsMd` doesn't need path changes (it shouldn't — same file)

  **Must NOT do**:
  - Do NOT leave the old `if/else` conditional as dead code
  - Do NOT add size/truncation logic
  - Do NOT modify any other part of the harness beyond the AGENTS.md resolution block (~lines 382-400)
  - Do NOT change the Dockerfile
  - Do NOT remove the existing `try/catch` error handling around this block

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single call site update, ~10 lines changed, clear spec
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 3 for new function signature)
  - **Parallel Group**: Wave 2 (after Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References** (CRITICAL):

  **Pattern References**:
  - `src/workers/opencode-harness.mts:382-400` — The exact block being modified. Read the full try/catch context around the resolveAgentsMd call. Understand the existing error handling pattern.
  - `src/workers/opencode-harness.mts:1-10` — Import statements at top. Check how `resolveAgentsMd` is imported, ensure import still works after signature change.

  **API/Type References**:
  - `src/workers/lib/agents-md-resolver.mts` — The new function signature from Task 3. The call site must match the new parameter order: `(platformContent, tenantConfig, archetype)`.

  **WHY Each Reference Matters**:
  - `opencode-harness.mts:382-400`: The code being modified. Must understand the surrounding context (what's before/after) to make a clean edit.
  - `opencode-harness.mts:1-10`: Import line for `resolveAgentsMd` — must verify it doesn't break.
  - `agents-md-resolver.mts`: The new signature you're calling — argument order matters.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness compiles with new call site
    Tool: Bash
    Preconditions: Tasks 1 and 3 complete
    Steps:
      1. Run: pnpm build 2>&1
      2. Assert exit code is 0
      3. Verify no TypeScript errors referencing opencode-harness.mts
    Expected Result: Exit code 0 — TypeScript compilation succeeds
    Failure Indicators: Type errors about resolveAgentsMd arguments
    Evidence: .sisyphus/evidence/task-4-build-check.txt

  Scenario: Old null-check conditional is removed
    Tool: Bash
    Preconditions: Harness updated
    Steps:
      1. Run: grep -n "Using static platform AGENTS.md" src/workers/opencode-harness.mts
      2. Assert no matches (old log message removed)
      3. Run: grep -n "resolveAgentsMd" src/workers/opencode-harness.mts
      4. Verify the call passes three arguments
    Expected Result: Old conditional gone, new 3-arg call present
    Failure Indicators: Old log message still present, or 2-arg call
    Evidence: .sisyphus/evidence/task-4-dead-code-check.txt

  Scenario: All existing tests still pass
    Tool: Bash
    Preconditions: Harness updated
    Steps:
      1. Run: pnpm test -- --run 2>&1
      2. Assert exit code is 0
    Expected Result: Full test suite passes
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-4-full-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(workers): update harness to pass platform content to resolver`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 5. Full build/test/lint verification

  **What to do**:
  - Run the complete verification suite to confirm nothing is broken:
    1. `pnpm build` — TypeScript compilation
    2. `pnpm lint` — Linting
    3. `pnpm test -- --run` — Full test suite
  - Capture output from all three commands
  - If any command fails, diagnose and fix (within scope — do NOT fix pre-existing failures listed in AGENTS.md)
  - Confirm the specific resolver tests pass: `pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts`
  - Confirm the content policy tests still pass (untouched): `pnpm test -- --run tests/workers/config/agents-md-content.test.ts`
  - Confirm the migration tests still pass (untouched): `pnpm test -- --run tests/gateway/migration-agents-md.test.ts`
  - Use `lsp_find_references` on `resolveAgentsMd` to confirm exactly one call site exists (in the harness) — ensuring no other code was broken by the signature change

  **Must NOT do**:
  - Do NOT fix pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`)
  - Do NOT modify any source files unless a test failure is caused by Tasks 1-4

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification-only task, no implementation
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 3, 4)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `src/workers/lib/agents-md-resolver.mts` — Use `lsp_find_references` on `resolveAgentsMd` export to verify single call site
  - `tests/workers/lib/agents-md-resolver.test.ts` — Resolver unit tests
  - `tests/workers/config/agents-md-content.test.ts` — Content policy tests (must still pass)
  - `tests/gateway/migration-agents-md.test.ts` — Migration tests (must still pass)

  **WHY Each Reference Matters**:
  - Need to verify three test files pass (resolver, content, migration) as proof that changes didn't break adjacent tests
  - `lsp_find_references` confirms no hidden call sites were missed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build passes
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1
      2. Assert exit code is 0
    Expected Result: TypeScript compilation succeeds
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: Full lint passes
    Tool: Bash
    Steps:
      1. Run: pnpm lint 2>&1
      2. Assert exit code is 0
    Expected Result: No lint errors
    Evidence: .sisyphus/evidence/task-5-lint.txt

  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1
      2. Assert exit code is 0
      3. Verify output does NOT contain failures related to agents-md
    Expected Result: All tests pass (pre-existing failures excluded)
    Evidence: .sisyphus/evidence/task-5-tests.txt

  Scenario: Adjacent test files still pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/workers/config/agents-md-content.test.ts 2>&1
      2. Assert exit code 0
      3. Run: pnpm test -- --run tests/gateway/migration-agents-md.test.ts 2>&1
      4. Assert exit code 0
    Expected Result: Both adjacent test files pass unchanged
    Evidence: .sisyphus/evidence/task-5-adjacent-tests.txt

  Scenario: Single call site confirmed via lsp_find_references
    Tool: LSP
    Steps:
      1. Use lsp_find_references on resolveAgentsMd export in src/workers/lib/agents-md-resolver.mts
      2. Count non-test references (exclude tests/)
      3. Assert exactly 1 non-test reference (in opencode-harness.mts)
    Expected Result: Exactly 1 production call site
    Evidence: .sisyphus/evidence/task-5-call-site-audit.txt
  ```

  **Commit**: NO (verification only)

- [x] 6. Update story-map document — mark PLAT-06 as complete

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the PLAT-06 section
  - Change all 6 acceptance criteria checkboxes from `[ ]` to `[x]`:
    1. `[x]` `resolveAgentsMd()` concatenates all three levels with section headers
    2. `[x]` If tenant or archetype level is null, that section is omitted
    3. `[x]` Platform level is always included
    4. `[x]` Existing archetypes continue working
    5. `[x]` Test: archetype with custom `agents_md` still includes platform security policy
    6. `[x]` `pnpm test -- --run` passes
  - Do NOT modify any other section of the story-map document

  **Must NOT do**:
  - Do NOT modify any other story's checkboxes
  - Do NOT change prose or table content — only checkbox state
  - Do NOT reformat the document

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 6 checkbox edits, trivial
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 5 verification passing)
  - **Parallel Group**: Wave 3 (after Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:
  - `docs/2026-04-21-2202-phase1-story-map.md` — The story-map document. Find the PLAT-06 section, locate the 6 `- [ ]` acceptance criteria lines under it.

  **WHY**: User explicitly requested marking PLAT-06 items as complete after implementation and verification.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 6 PLAT-06 checkboxes are checked
    Tool: Bash
    Steps:
      1. Extract PLAT-06 section from docs/2026-04-21-2202-phase1-story-map.md
      2. Count lines matching "- [x]" in the acceptance criteria block
      3. Assert count is 6
      4. Count lines matching "- [ ]" in the acceptance criteria block
      5. Assert count is 0
    Expected Result: All 6 acceptance criteria checked, 0 unchecked
    Failure Indicators: Any unchecked checkbox in PLAT-06 section
    Evidence: .sisyphus/evidence/task-6-story-map-check.txt
  ```

  **Commit**: YES
  - Message: `docs: mark PLAT-06 acceptance criteria complete in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

- [x] 7. Send Telegram notification — plan complete

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "✅ PLAT-06 (AGENTS.md Merging) complete — All tasks done. resolveAgentsMd() now concatenates Platform + Tenant + Archetype levels. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References**:
  - `scripts/telegram-notify.ts` — The notification script

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent successfully
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ PLAT-06 (AGENTS.md Merging) complete — All tasks done. Come back to review results."
      2. Assert exit code is 0
    Expected Result: Notification sent
    Evidence: .sisyphus/evidence/task-7-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (resolver + harness working together). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                         | Files                                                                                    | Pre-commit                                                        |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1+3  | `feat(workers): change resolveAgentsMd from fallback to concatenation` | `src/workers/lib/agents-md-resolver.mts`, `tests/workers/lib/agents-md-resolver.test.ts` | `pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts` |
| 4    | `feat(workers): update harness to pass platform content to resolver`   | `src/workers/opencode-harness.mts`                                                       | `pnpm build`                                                      |
| 6    | `docs: mark PLAT-06 acceptance criteria complete in story map`         | `docs/2026-04-21-2202-phase1-story-map.md`                                               | —                                                                 |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                    # Expected: all tests pass, 0 failures
pnpm build                            # Expected: exit code 0
pnpm lint                             # Expected: exit code 0
pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts  # Expected: all concatenation tests pass
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] `resolveAgentsMd()` concatenates all three levels with section headers
- [ ] Null/empty/whitespace levels are omitted
- [ ] Platform level always included
- [ ] Harness always writes (no null-check conditional)
- [ ] Story-map PLAT-06 checkboxes checked
