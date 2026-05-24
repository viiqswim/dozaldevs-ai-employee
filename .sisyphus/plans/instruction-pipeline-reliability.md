# Instruction Pipeline Reliability for Cheap Models

## TL;DR

> **Quick Summary**: Fix the platform instruction pipeline so AI employees work reliably with cheap models (openai/gpt-oss-120b). The model completes its primary task but fails to call submit-output.ts because the critical instruction is buried in 9,250 chars of developer-focused policy. Three fixes: slim Platform Policy, consolidate submit-output instructions, and add a runtime closing reminder.
>
> **Deliverables**:
>
> - Slimmed `src/workers/config/agents.md` (~2,000 chars, down from 9,250)
> - Consolidated submit-output instructions (single source of truth in platform-procedures.mts)
> - Runtime closing section in assembled AGENTS.md via new `closingSections` parameter in `resolveAgentsMd()`
> - Updated tests for all changed files
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves + final verification
> **Critical Path**: Task 1 (slim agents.md) + Task 2 (consolidate + closing section) → Task 3 (E2E verification) → F1-F4

---

## Context

### Original Request

The `daily-real-estate-inspiration-2` employee (created AFTER the archetype generator fix) still fails 3 out of 4 times with "Model did not produce content." The model successfully posts to Slack but never calls `submit-output.ts`. Investigation revealed the problem is NOT in the generated `agents_md` (which is now clean) but in the platform instruction pipeline itself — too much noise drowning out the critical submit-output instruction.

### Interview Summary

**Key Discussions**:

- Generator fix is verified working — new employees get clean agents_md without CLASSIFICATION RULES or TOOLS AVAILABLE sections
- The real problem: 9,250 chars of developer-focused Platform Policy (source access, patching, smoke tests, issue reporting) that a simple Slack-posting bot never needs
- Submit-output instructions appear in 3 places with different classification values — confusing for cheap models
- Employee WORKFLOW ends at "Post the message to Slack" — no final step about calling submit-output

**Research Findings**:

- `src/workers/config/agents.md`: 180 lines, 9 sections — only §5 (platform off-limits), §6 (DB access), §9 (tool discovery) are essential
- `platform-procedures.mts`: Already the correct, conditional source of truth for classification guidance
- `resolveAgentsMd()`: Pure concatenation of 6 layers — can be extended with `closingSections` parameter for a 7th layer
- Total instruction volume: ~11,700 chars for a "post an inspirational quote" task — only 10% is about the actual job

### Metis Review

**Identified Gaps** (addressed):

- Keep §5 and §6 as safety rails for all employees (prevent DB access and platform code modification)
- Fix 3 placement: `platformRuntimeSections` appears as section 2, NOT at the end — need new `closingSections` parameter for true last-position placement
- Duplicate submit-output risk: after Fix 2, instruction appears in platform-procedures (section 2) and closing section (section 7) — intentional dual placement (guidance + final reminder)
- Regression risk for other employees: plan includes pre/post verification of `real-estate-motivation-bot-2`

---

## Work Objectives

### Core Objective

Reduce the platform instruction pipeline's signal-to-noise ratio so that cheap models (quality_index 33) reliably call `submit-output.ts` after completing their primary task. The submit-output instruction must be impossible to miss.

### Concrete Deliverables

- Rewritten `src/workers/config/agents.md` — ~2,000 chars with only §5, §6, §9
- Updated `platform-procedures.mts` — absorb error handling guidance from old §8
- New `closingSections` parameter in `resolveAgentsMd()` — appended after layer 6
- Harness update — pass closing instruction via `closingSections`
- Updated tests for agents-md-resolver, platform-procedures, and harness

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 failures
- [ ] `pnpm build` succeeds
- [ ] `daily-real-estate-inspiration-2` triggered 4 times → at least 3/4 reach `Done` status (improvement from 1/4 baseline)
- [ ] `real-estate-motivation-bot-2` still reaches `Done` after changes (no regression)
- [ ] Assembled AGENTS.md is ≤4,000 chars total (down from ~11,200)
- [ ] Submit-output instruction appears in exactly 2 places: platform-procedures (section 2) and closing section (last)

### Must Have

- Platform Policy slimmed to §5, §6, §9 only
- Submit-output instructions removed from agents.md §7 and §8
- Platform-procedures.mts absorbs error handling guidance (condensed)
- `resolveAgentsMd()` accepts `closingSections` parameter, appends after layer 6
- Harness passes a closing reminder via `closingSections`
- All existing tests updated, new tests for closingSections behavior

### Must NOT Have (Guardrails)

- DO NOT touch `agents-md-resolver.mts` beyond adding the `closingSections` parameter — keep pure concatenation role
- DO NOT touch the archetype generator (`archetype-generator.ts`) — already fixed
- DO NOT touch `submit-output.ts` or `output-schema.mts`
- DO NOT modify any archetype records in the database
- DO NOT remove submit-output instructions from `platform-procedures.mts` — it is the source of truth
- DO NOT add employee-specific language to shared files (agents.md, harness, resolver)
- DO NOT change the `instructions` field assembly in the harness — the task prompt stays as-is
- DO NOT remove §5 (Platform Code Off-Limits) or §6 (DB Access Only Via Tools) from agents.md — these are safety rails

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — updating existing test files)
- **Framework**: Vitest (`pnpm test`)
- **Approach**: Update existing tests, add new tests for closingSections behavior

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: Use Bash (`pnpm test -- --run`) — run tests, assert pass count
- **Build verification**: Use Bash (`pnpm build`) — confirm no regressions
- **E2E verification**: Trigger `daily-real-estate-inspiration-2` and verify `Done` status via psql

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 2 parallel tasks):
├── Task 1: Slim Platform Policy (agents.md rewrite) [quick]
├── Task 2: Consolidate submit-output + add closingSections to resolver + harness [deep]

Wave 2 (After Wave 1 — E2E verification):
├── Task 3: Docker rebuild + E2E trigger verification [unspecified-high]

Wave 3 (After Wave 2 — notification):
├── Task 4: Notify completion via Telegram [quick]

Wave FINAL (After Wave 2 — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks    |
| ----- | ---------- | --------- |
| 1     | None       | 3         |
| 2     | None       | 3         |
| 3     | 1, 2       | F1-F4, 4  |
| 4     | 3          | —         |
| F1-F4 | 3          | User okay |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `quick` (file rewrite), T2 → `deep` (resolver + harness + platform-procedures + tests)
- **Wave 2**: **1 task** — T3 → `unspecified-high` (Docker rebuild + E2E triggers)
- **Wave 3**: **1 task** — T4 → `quick` (Telegram notification)
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Slim Platform Policy (agents.md rewrite)

  **What to do**:
  1. Rewrite `src/workers/config/agents.md` to keep ONLY these sections:
     - §5 (Platform Code Is Off-Limits) — verbatim, no changes
     - §6 (Database Access Only Via Tools) — verbatim, no changes
     - §9 (Tool Discovery) — verbatim, no changes
  2. Remove all other sections:
     - §1 (Source Access Permission) — REMOVE entirely
     - §2 (Patch Permission) — REMOVE entirely
     - §3 (Smoke Test After Any Patch) — REMOVE entirely
     - §4 (Mandatory Issue Reporting) — REMOVE entirely
     - §7 (Output Format) — REMOVE entirely (moved to platform-procedures.mts)
     - §8 (Error Handling) — REMOVE entirely (moved to platform-procedures.mts)
     - The Summary section at the bottom — REMOVE entirely (redundant)
  3. Update the file header to be concise:

     ```
     # AI Employee Worker — Agent Policy

     You are an AI agent running inside a Docker container as part of the AI Employee Platform. These rules are non-negotiable.

     ---
     ```

  4. Renumber surviving sections to §1, §2, §3 (from §5, §6, §9)
  5. Verify the final file is ≤2,500 chars

  **Must NOT do**:
  - DO NOT modify the content of §5 (Platform Code Is Off-Limits) — keep verbatim
  - DO NOT modify the content of §6 (Database Access Only Via Tools) — keep verbatim
  - DO NOT modify the content of §9 (Tool Discovery) — keep verbatim
  - DO NOT add any new content — only remove

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file rewrite — removing sections from a markdown file
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3 (E2E verification)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/config/agents.md:47-56` — §5 (Platform Code Is Off-Limits) — KEEP verbatim
  - `src/workers/config/agents.md:59-73` — §6 (Database Access Only Via Tools) — KEEP verbatim
  - `src/workers/config/agents.md:156-166` — §9 (Tool Discovery) — KEEP verbatim

  **WHY Each Reference Matters**:
  - §5: Safety rail preventing agents from modifying platform code (/app/dist/, node_modules)
  - §6: Safety rail preventing direct DB access — all data goes through tools
  - §9: Tells agent to load `tool-usage-reference` skill for CLI syntax

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Slimmed agents.md contains only §5, §6, §9
    Tool: Bash
    Steps:
      1. Run: wc -c src/workers/config/agents.md
      2. Assert: char count ≤ 2500
      3. Run: grep -c "Platform Code Is Off-Limits" src/workers/config/agents.md
      4. Assert: count = 1
      5. Run: grep -c "Database Access Only Via Tools" src/workers/config/agents.md
      6. Assert: count = 1
      7. Run: grep -c "Tool Discovery" src/workers/config/agents.md
      8. Assert: count = 1
    Expected Result: File contains exactly 3 sections, ≤2,500 chars
    Evidence: .sisyphus/evidence/task-1-agents-md-size.txt

  Scenario: Removed sections are not present
    Tool: Bash
    Steps:
      1. Run: grep -c "Patch Permission" src/workers/config/agents.md
      2. Assert: count = 0
      3. Run: grep -c "Smoke Test" src/workers/config/agents.md
      4. Assert: count = 0
      5. Run: grep -c "Issue Reporting" src/workers/config/agents.md
      6. Assert: count = 0
      7. Run: grep -c "Output Format" src/workers/config/agents.md
      8. Assert: count = 0
      9. Run: grep -c "Error Handling" src/workers/config/agents.md
      10. Assert: count = 0
    Expected Result: None of the removed sections are present
    Evidence: .sisyphus/evidence/task-1-removed-sections.txt
  ```

  **Commit**: YES
  - Message: `refactor(worker): slim platform policy to essential safety rails and tool discovery`
  - Files: `src/workers/config/agents.md`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Consolidate submit-output instructions + add closingSections to resolver + update harness

  **What to do**:

  **Part A — Update `platform-procedures.mts` to include error handling guidance:**
  1. In both the `approvalRequired: true` and `approvalRequired: false` branches, add a condensed error handling paragraph after the REQUIRED final step:
     ```
     If any error occurs and you cannot complete your primary task, you MUST still call submit-output. Use classification "NEEDS_APPROVAL" and describe the error in the summary. Never end the session without calling submit-output — absence is a hard failure.
     ```
  2. This absorbs the guidance from the removed §8 of agents.md into the single source of truth

  **Part B — Add `closingSections` parameter to `resolveAgentsMd()`:**
  1. Add an optional parameter `closingSections?: string[]` to the `resolveAgentsMd()` function signature
  2. After the existing layer 6 (`# Employee Knowledge`), append any closingSections:
     ```typescript
     if (closingSections && closingSections.length > 0) {
       sections.push(`# Final Reminders\n\n${closingSections.join('\n\n')}`);
     }
     ```
  3. This becomes the 7th and final section in the assembled AGENTS.md

  **Part C — Update harness to pass closing section:**
  1. In `src/workers/opencode-harness.mts`, before the `resolveAgentsMd()` call (around line 851), build a closing reminder:
     ```typescript
     const closingSections = [
       '## CRITICAL — Submit Output Before Session Ends\n\nYour task is NOT complete until you call `submit-output`. After finishing your primary work, run:\n\ntsx /tools/platform/submit-output.ts --summary "<what you did>" --classification "NO_ACTION_NEEDED"\n\nIf you skip this step, your task will be marked as Failed even if you completed the work successfully.',
     ];
     ```
  2. NOTE: The closing section must be approval-aware. If `approvalRequired` is true, the classification should say `"NEEDS_APPROVAL"` instead:
     ```typescript
     const closingClassification = approvalRequired ? 'NEEDS_APPROVAL' : 'NO_ACTION_NEEDED';
     const closingSections = [
       `## CRITICAL — Submit Output Before Session Ends\n\nYour task is NOT complete until you call \`submit-output\`. After finishing your primary work, run:\n\ntsx /tools/platform/submit-output.ts --summary "<what you did>" --classification "${closingClassification}"\n\nIf you skip this step, your task will be marked as Failed even if you completed the work successfully.`,
     ];
     ```
  3. Pass `closingSections` to `resolveAgentsMd()`:
     ```typescript
     const agentsMdContent = resolveAgentsMd(
       platformContent,
       tenantConfig,
       archetype,
       employeeRules,
       employeeKnowledge,
       platformRuntimeSections,
       closingSections, // NEW — appended as final section
     );
     ```

  **Part D — Update tests:**
  1. Update `agents-md-resolver` tests (find test file via `grep -r "resolveAgentsMd" tests/`):
     - Add test: `closingSections are appended after employee knowledge`
     - Add test: `closingSections are omitted when not provided`
     - Add test: `closingSections appear as # Final Reminders section`
  2. Update `platform-procedures` tests (if any exist):
     - Verify error handling paragraph is present in both branches
  3. If harness tests reference the `resolveAgentsMd()` call signature, update them

  **Must NOT do**:
  - DO NOT remove submit-output instructions from `platform-procedures.mts` — it stays as the source of truth
  - DO NOT touch `agents-md-resolver.mts` beyond adding the `closingSections` parameter
  - DO NOT touch `archetype-generator.ts`
  - DO NOT add employee-specific language to the closing section

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Coordinated changes across 3-4 files (resolver, harness, platform-procedures, tests) with careful attention to approval-conditional logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not adding shell tools

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3 (E2E verification)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/lib/agents-md-resolver.mts:10-37` — Full `resolveAgentsMd()` function — add `closingSections` parameter after `platformRuntimeSections`, append as section 7 after employee knowledge
  - `src/workers/lib/platform-procedures.mts:9-37` — Full `generatePlatformProcedures()` — add error handling paragraph to both branches
  - `src/workers/opencode-harness.mts:830-858` — The section where `platformRuntimeSections` and `resolveAgentsMd()` are built/called — add `closingSections` array and pass to resolver
  - `src/workers/opencode-harness.mts:831-832` — Where `approvalRequired` is extracted — reuse this for conditional closing section classification

  **API/Type References**:
  - `src/workers/lib/agents-md-resolver.mts:10` — Current signature: `resolveAgentsMd(platformContent, tenantConfig, archetype, employeeRules?, employeeKnowledge?, platformRuntimeSections?)` — add `closingSections?` as 7th parameter

  **Test References**:
  - Search for existing resolver tests: `grep -r "resolveAgentsMd" tests/` — follow existing test patterns
  - Search for platform-procedures tests: `grep -r "generatePlatformProcedures" tests/` — follow existing patterns

  **WHY Each Reference Matters**:
  - `agents-md-resolver.mts`: The function being extended — must understand current signature and section ordering
  - `platform-procedures.mts`: Absorbing error handling from removed agents.md §8 — must match existing style
  - `opencode-harness.mts:830-858`: Where the closing section gets built and passed — must understand `approvalRequired` extraction
  - Test files: Must follow existing patterns for test consistency

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: resolveAgentsMd with closingSections appends as final section
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run -t "closingSections"
      2. Assert: tests pass
    Expected Result: closingSections content appears after Employee Knowledge in assembled output
    Evidence: .sisyphus/evidence/task-2-resolver-tests.txt

  Scenario: platform-procedures includes error handling guidance
    Tool: Bash
    Steps:
      1. Run: grep -c "MUST still call submit-output" src/workers/lib/platform-procedures.mts
      2. Assert: count >= 2 (once per branch)
    Expected Result: Both approval branches include error handling paragraph
    Evidence: .sisyphus/evidence/task-2-procedures-check.txt

  Scenario: Harness passes closingSections to resolveAgentsMd
    Tool: Bash
    Steps:
      1. Run: grep -c "closingSections" src/workers/opencode-harness.mts
      2. Assert: count >= 2 (declaration + usage)
    Expected Result: Harness builds and passes closingSections array
    Evidence: .sisyphus/evidence/task-2-harness-check.txt

  Scenario: Full test suite passes
    Tool: Bash (tmux for long-running)
    Steps:
      1. Launch: pnpm test -- --run in tmux session
      2. Wait for completion
      3. Assert: 0 failures
    Expected Result: No regressions from resolver, harness, or platform-procedures changes
    Evidence: .sisyphus/evidence/task-2-full-suite.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: TypeScript compiles with new parameter
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES
  - Message: `fix(worker): consolidate submit-output instructions and add closing reminder section`
  - Files: `src/workers/lib/agents-md-resolver.mts`, `src/workers/lib/platform-procedures.mts`, `src/workers/opencode-harness.mts`, test files
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Docker rebuild + E2E trigger verification

  **What to do**:
  1. Rebuild the Docker image to include the updated agents.md:
     ```bash
     docker build -t ai-employee-worker:latest .
     ```
  2. Verify `pnpm dev` is running (gateway + Inngest + all services)
  3. Trigger `real-estate-motivation-bot-2` once (baseline regression check):
     ```bash
     source .env
     TASK_ID=$(curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id')
     echo "Regression check task: $TASK_ID"
     ```
  4. Wait ~120s, verify it reaches `Done`:
     ```bash
     psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
     ```
  5. Trigger `daily-real-estate-inspiration-2` 4 times with 120s gaps:
     ```bash
     for i in 1 2 3 4; do
       TASK_ID=$(curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id')
       echo "Run $i: $TASK_ID"
       sleep 120
       psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, status FROM tasks WHERE id = '$TASK_ID';"
     done
     ```
  6. Count successes — expect at least 3/4 `Done`
  7. Document all task IDs and their final statuses

  **Must NOT do**:
  - DO NOT modify any source code in this task — this is verification only
  - DO NOT skip the regression check on `real-estate-motivation-bot-2`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Long-running Docker build + multiple sequential E2E triggers with wait times
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1-F4, Task 4
  - **Blocked By**: Tasks 1 and 2

  **References**:
  - AGENTS.md § "Recommended Test Employee: `real-estate-motivation-bot-2`" — simplest employee, approval_required: false, ~1 min to complete
  - AGENTS.md § "CRITICAL — Rebuild after every worker change" — changes to `src/workers/` require Docker image rebuild

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds successfully
    Tool: Bash (tmux)
    Steps:
      1. Run: docker build -t ai-employee-worker:latest .
      2. Assert: exit code 0
    Expected Result: Image builds with updated agents.md and harness changes
    Evidence: .sisyphus/evidence/task-3-docker-build.txt

  Scenario: real-estate-motivation-bot-2 reaches Done (no regression)
    Tool: Bash
    Steps:
      1. Trigger via curl
      2. Wait 120s
      3. Query: SELECT status FROM tasks WHERE id = '<task_id>'
      4. Assert: status = 'Done'
    Expected Result: Simplest employee still works after platform changes
    Failure Indicators: Status = 'Failed' — regression introduced
    Evidence: .sisyphus/evidence/task-3-regression-check.txt

  Scenario: daily-real-estate-inspiration-2 succeeds at least 3/4 times
    Tool: Bash
    Steps:
      1. Trigger 4 times with 120s gaps
      2. Query final status for each
      3. Assert: at least 3 out of 4 have status = 'Done'
    Expected Result: Improvement from 1/4 baseline to ≥3/4
    Failure Indicators: 2 or fewer reach Done — fix insufficient
    Evidence: .sisyphus/evidence/task-3-e2e-results.txt
  ```

  **Commit**: NO (verification only)

- [ ] 4. Notify completion

  **What to do**:
  Send Telegram notification:

  ```bash
  npx tsx scripts/telegram-notify.ts "✅ instruction-pipeline-reliability complete — All tasks done. Come back to review results."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Blocked By**: Task 3

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": verify no forbidden changes. Check evidence files in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Verify the slimmed agents.md retains §5 and §6 safety rails.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY QA scenario from Tasks 1-3. Verify agents.md is ≤2,500 chars. Verify submit-output appears in exactly 2 places in the assembled AGENTS.md. Trigger `daily-real-estate-inspiration-2` and `real-estate-motivation-bot-2` — both must succeed.
      Output: `Scenarios [N/N pass] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 match. Check "Must NOT do" compliance: confirm NO changes to archetype-generator.ts, submit-output.ts, output-schema.mts. Confirm agents.md still contains §5 and §6. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

- [ ] F5. **Notify completion** — Send Telegram: `npx tsx scripts/telegram-notify.ts "✅ instruction-pipeline-reliability complete — All tasks done. Come back to review results."`

---

## Commit Strategy

| Task | Commit Message                                                                         | Files                                                                                                                               | Pre-commit           |
| ---- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1    | `refactor(worker): slim platform policy to essential safety rails and tool discovery`  | `src/workers/config/agents.md`                                                                                                      | `pnpm test -- --run` |
| 2    | `fix(worker): consolidate submit-output instructions and add closing reminder section` | `src/workers/lib/agents-md-resolver.mts`, `src/workers/lib/platform-procedures.mts`, `src/workers/opencode-harness.mts`, test files | `pnpm test -- --run` |
| 3    | No commit — E2E verification only                                                      | —                                                                                                                                   | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                    # Expected: all pass, 0 failed
pnpm build                            # Expected: exit 0
wc -c src/workers/config/agents.md    # Expected: ≤2500
# Trigger daily-real-estate-inspiration-2 4x, expect ≥3/4 Done
# Trigger real-estate-motivation-bot-2 1x, expect Done (no regression)
```

### Final Checklist

- [ ] Platform Policy (agents.md) slimmed to §5, §6, §9 only
- [ ] agents.md is ≤2,500 chars
- [ ] Submit-output instructions removed from agents.md §7 and §8
- [ ] platform-procedures.mts includes condensed error handling guidance
- [ ] `resolveAgentsMd()` accepts and appends `closingSections` parameter
- [ ] Harness passes closing reminder via `closingSections`
- [ ] `daily-real-estate-inspiration-2` succeeds ≥3/4 times
- [ ] `real-estate-motivation-bot-2` still succeeds (no regression)
- [ ] All tests pass, build succeeds
