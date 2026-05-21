# Employee Information Architecture: Prompt vs AGENTS.md Cleanup

## TL;DR

> **Quick Summary**: Clarify the boundary between what goes in the AI employee's prompt vs its AGENTS.md file. The prompt becomes pure task logic ("today's assignment"). Everything else — identity, tools, platform procedures — goes into AGENTS.md and is auto-injected.
>
> **Deliverables**:
>
> - Harness auto-injects platform procedures (submit-output rules) into AGENTS.md
> - Harness auto-generates tool reference from `tool_registry` into AGENTS.md
> - Motivation bot archetype cleaned up as the proof-of-concept
> - AGENTS.md rules added for non-technical language and concise responses
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 6 → F1–F4

---

## Context

### Original Request

Victor reviewed the AI employee configuration and found it confusing — even as the builder. The information defining "who an employee is" is scattered across 5+ fields with no clear mental model for what goes where.

### Interview Summary

**Key Discussions**:

- Victor thinks about "what the employee DOES" first — task logic is the natural entry point
- Both the concepts and the UI are unclear — the field separation feels arbitrary
- Platform boilerplate (submit-output, classification rules) is copy-pasted into every employee's instructions
- Tools are defined in both `agents_md` (human-readable) and `tool_registry` (JSON) — redundant

**Decisions Made**:

1. **Prompt = pure task logic only** — "select a quote, personalize it, post to Slack"
2. **AGENTS.md = everything else** — identity, tools, platform procedures, learned rules, knowledge base
3. **Platform mechanics → auto-injected into AGENTS.md** by harness (not user-written)
4. **Tool reference → auto-generated from `tool_registry`** and injected into AGENTS.md
5. **`agents_md` field = identity/personality only** — no tools, no boilerplate
6. **Non-technical language** — user-facing labels must use plain language ("Organization" not "Tenant")
7. **Concise responses** — add rule to project AGENTS.md

### Metis Review

**Identified Gaps** (addressed):

- **Template variable regression**: Platform mechanics blocks use `$NOTIFY_MSG_TS` in some employees. Not an issue for motivation bot (no template vars). Future employees will need `substituteTemplateVars()` applied to auto-generated sections too — documented as a known limitation, not in scope.
- **Tool reference needs descriptions**: `tool_registry` only stores paths. Solution: parse tool file headers at runtime (same approach as `GET /admin/tools` endpoint).
- **Scope lock**: Only motivation bot gets updated. Other archetypes (guest-messaging, summarizers, code-rotation) are read-only in this plan.

---

## Work Objectives

### Core Objective

Establish a clear, maintainable boundary: prompt = task logic, AGENTS.md = everything else. Prove it works with the motivation bot.

### Concrete Deliverables

- Modified `agents-md-resolver.mts` with two new section types
- Modified `opencode-harness.mts` to generate and inject platform procedures + tool reference
- Tool description parser utility
- Cleaned-up motivation bot archetype (instructions + agents_md)
- Updated project AGENTS.md with two new rules
- Unit tests for new generation logic

### Definition of Done

- [ ] Motivation bot triggered successfully with clean instructions (no platform boilerplate)
- [ ] AGENTS.md on worker contains auto-generated "Platform Procedures" section
- [ ] AGENTS.md on worker contains auto-generated "Available Tools" section
- [ ] `pnpm test -- --run` passes with no regressions
- [ ] `pnpm build` succeeds

### Must Have

- Platform procedures auto-injected based on `risk_model.approval_required`
- Tool reference auto-generated from `tool_registry.tools` array
- Motivation bot instructions contain ONLY task logic
- Motivation bot agents_md contains ONLY identity/personality

### Must NOT Have (Guardrails)

- Do NOT modify guest-messaging, summarizer, or code-rotation archetypes
- Do NOT modify the seed file (`prisma/seed.ts`) — this plan only touches the motivation bot in the DB
- Do NOT change the prompt assembly to add anything beyond `{instructions}\n\nTask ID: {TASK_ID}`
- Do NOT add employee-specific language to shared files (harness, resolver)
- Do NOT build overview auto-generation (separate plan)
- Do NOT build dashboard UI changes

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Module**: Use Bash (bun/node REPL or direct execution) — import, call functions, compare output
- **Integration**: Use Bash (curl + Docker) — trigger task, check DB state

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, all parallel):
├── Task 1: Platform procedures generator + resolver integration [deep]
├── Task 2: Tool reference generator + resolver integration [deep]
├── Task 3: Add AGENTS.md rules (non-technical language, concise) [quick]

Wave 2 (After Wave 1 — apply + verify):
├── Task 4: Wire generators into harness (depends: 1, 2) [unspecified-high]
├── Task 5: Clean up motivation bot archetype data (depends: 4) [quick]

Wave 3 (After Wave 2 — end-to-end):
├── Task 6: Trigger motivation bot and verify (depends: 5) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 4      |
| 2    | —          | 4      |
| 3    | —          | —      |
| 4    | 1, 2       | 5      |
| 5    | 4          | 6      |
| 6    | 5          | F1–F4  |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `deep`, T3 → `quick`
- **Wave 2**: 2 tasks — T4 → `unspecified-high`, T5 → `quick`
- **Wave 3**: 1 task — T6 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Platform Procedures Generator + Resolver Integration

  **What to do**:
  - Create `src/workers/lib/platform-procedures.mts` — a function that generates the "Platform Procedures" text block based on archetype config
  - Input: `{ approvalRequired: boolean }` (from `risk_model.approval_required`)
  - Output: a markdown string with submit-output instructions and classification rules
  - When `approvalRequired: true`: include NEEDS_APPROVAL as default, NO_ACTION_NEEDED as alternative, confidence guidance
  - When `approvalRequired: false`: include NO_ACTION_NEEDED as the only option, explicitly say "do NOT write /tmp/approval-message.json"
  - Both variants include the exact `tsx /tools/platform/submit-output.ts` syntax and the "mandatory — task will fail" warning
  - Update `agents-md-resolver.mts` to accept this as a new section type, inserted between "Employee Identity" and "Available Tools"
  - Write unit tests covering both approval variants

  **Must NOT do**:
  - Do NOT put employee-specific language in the generated text
  - Do NOT include template variables ($NOTIFY_MSG_TS etc.) — only static content for now

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding the existing resolver pattern and generating correct platform-specific text
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/agents-md-resolver.mts` — The full resolver (38 lines). Understand how sections are assembled and the exact section ordering.
  - `src/workers/opencode-harness.mts:806-824` — How `platformRuntimeSections` are currently built (security boundary, env manifest, legacy system_prompt). The new section will be added the same way.

  **API/Type References**:
  - `prisma/schema.prisma:190` — `risk_model Json?` field. At runtime it's `{ approval_required: boolean, timeout_hours: number }`.

  **Content References** (existing boilerplate to extract from):
  - `prisma/seed.ts:232-242` — DozalDevs summarizer FINAL STEP boilerplate (approval_required: true variant)
  - `prisma/seed.ts:296-308` — Guest messaging FINAL STEP boilerplate (approval_required: true, with metadata fields)
  - DB query `SELECT instructions FROM archetypes WHERE id = 'e4dd9e63-91ac-490b-ba4f-10246be6fa76'` — Motivation bot boilerplate (approval_required: false variant)

  **Test References**:
  - No existing resolver test file found. Create `src/workers/lib/__tests__/agents-md-resolver.test.mts` following the Vitest patterns in other test files in the project.

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/platform-procedures.mts` exists and exports `generatePlatformProcedures()`
  - [ ] Function returns correct text for `approvalRequired: true`
  - [ ] Function returns correct text for `approvalRequired: false`
  - [ ] `agents-md-resolver.mts` updated to accept and render the new section
  - [ ] `pnpm test -- --run` passes
  - [ ] `pnpm build` succeeds

  **QA Scenarios**:

  ```
  Scenario: Generate procedures for approval-required employee
    Tool: Bash
    Preconditions: Module compiled successfully
    Steps:
      1. Import generatePlatformProcedures from the new module
      2. Call with { approvalRequired: true }
      3. Assert output contains "NEEDS_APPROVAL"
      4. Assert output contains "tsx /tools/platform/submit-output.ts"
      5. Assert output contains "mandatory" warning
      6. Assert output does NOT contain "NO_ACTION_NEEDED" as the only option
    Expected Result: Markdown text with approval-required variant
    Evidence: .sisyphus/evidence/task-1-approval-required.txt

  Scenario: Generate procedures for no-approval employee
    Tool: Bash
    Preconditions: Module compiled successfully
    Steps:
      1. Call with { approvalRequired: false }
      2. Assert output contains "NO_ACTION_NEEDED"
      3. Assert output contains "do NOT write /tmp/approval-message.json"
      4. Assert output does NOT contain "NEEDS_APPROVAL" as default
    Expected Result: Markdown text with no-approval variant
    Evidence: .sisyphus/evidence/task-1-no-approval.txt
  ```

  **Commit**: YES
  - Message: `feat(worker): add platform procedures generator for AGENTS.md`
  - Files: `src/workers/lib/platform-procedures.mts`, `src/workers/lib/agents-md-resolver.mts`, test files
  - Pre-commit: `pnpm test -- --run`

- [ ] 2. Tool Reference Generator + Resolver Integration

  **What to do**:
  - Create `src/workers/lib/tool-reference-generator.mts` — a function that generates the "Available Tools" text block from `tool_registry.tools`
  - Input: `string[]` (array of tool paths like `["/tools/slack/post-message.ts"]`)
  - For each tool path, read the tool source file and extract the description from the file's JSDoc header or first comment block
  - Use the same parsing approach as `src/gateway/services/tool-metadata.ts` (the admin tools endpoint) — reference that code for the pattern
  - Output: a markdown string listing each tool with its path and description
  - Include "Load the `tool-usage-reference` skill for exact CLI syntax and flags." at the end
  - If a tool file can't be read (missing, no description), use the filename as a fallback description
  - The tool paths in `tool_registry` use `/tools/` prefix (container paths). In local dev, these map to `src/worker-tools/`
  - Update `agents-md-resolver.mts` to accept this as a new section, inserted after "Platform Procedures"
  - Write unit tests with mock tool files

  **Must NOT do**:
  - Do NOT hardcode tool descriptions — always parse from source files
  - Do NOT fail if a tool file is missing — use graceful fallback

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires parsing tool file headers and understanding the existing admin tools metadata pattern
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Understand tool file structure and header conventions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/services/tool-parser.ts` — The admin tools endpoint's metadata parser. This already extracts descriptions, flags, env vars from tool source files. Reuse or adapt this parsing logic.
  - `src/workers/lib/agents-md-resolver.mts` — Resolver section assembly pattern.

  **Content References**:
  - `src/worker-tools/slack/post-message.ts` — Example tool file with header comments. Shows the format to parse.
  - `src/worker-tools/platform/submit-output.ts` — Another tool file header example.

  **API/Type References**:
  - `prisma/schema.prisma:189` — `tool_registry Json?` field. At runtime: `{ tools: string[] }` where each string is a path like `/tools/slack/post-message.ts`.

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/tool-reference-generator.mts` exists and exports `generateToolReference()`
  - [ ] Function produces readable tool list from array of paths
  - [ ] Graceful fallback when tool file is missing or has no description
  - [ ] Includes "Load the tool-usage-reference skill" note
  - [ ] `pnpm test -- --run` passes
  - [ ] `pnpm build` succeeds

  **QA Scenarios**:

  ```
  Scenario: Generate reference for motivation bot tools
    Tool: Bash
    Preconditions: Tool source files exist at expected paths
    Steps:
      1. Import generateToolReference
      2. Call with ["/tools/slack/post-message.ts"] and base path "src/worker-tools"
      3. Assert output contains "post-message" tool entry with a description
      4. Assert output contains "tool-usage-reference" skill mention
    Expected Result: Markdown list with tool name, path, and parsed description
    Evidence: .sisyphus/evidence/task-2-tool-reference.txt

  Scenario: Handle missing tool file gracefully
    Tool: Bash
    Preconditions: None
    Steps:
      1. Call with ["/tools/nonexistent/fake-tool.ts"]
      2. Assert function does NOT throw
      3. Assert output contains fallback entry (filename as description)
    Expected Result: Fallback entry without crash
    Evidence: .sisyphus/evidence/task-2-missing-tool.txt
  ```

  **Commit**: YES
  - Message: `feat(worker): add tool reference generator for AGENTS.md`
  - Files: `src/workers/lib/tool-reference-generator.mts`, test files
  - Pre-commit: `pnpm test -- --run`

- [ ] 3. Add AGENTS.md Rules (Non-Technical Language + Concise Responses)

  **What to do**:
  - Add two rules to the project `AGENTS.md` under the existing "Key Conventions" section. These rules are for **AI development agents** (like OpenCode, Sisyphus, Prometheus) that help engineers build and maintain this platform. They guide how those agents write code, UI copy, and error messages:
    1. **Non-technical language**: "The end users of the AI Employee platform are non-technical (property managers, small business owners). When writing user-facing labels, UI copy, error messages, Slack notifications, or dashboard text, always use plain language. Examples: 'Organization' not 'Tenant', 'Employee setup' not 'Archetype configuration', 'Approval needed' not 'risk_model.approval_required is true'."
    2. **Concise responses**: "AI employee outputs (Slack messages, summaries, guest replies) should be concise and to-the-point. Avoid verbose explanations unless the user explicitly asks for more detail."

  **Must NOT do**:
  - Do NOT rewrite existing AGENTS.md content — only append new rules

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple text addition to one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `AGENTS.md` — "Key Conventions" section (around line 130+). Follow the existing bullet-point format with bold rule name and dash-separated explanation.

  **Acceptance Criteria**:
  - [ ] AGENTS.md contains non-technical language rule
  - [ ] AGENTS.md contains concise responses rule
  - [ ] No existing content was modified or removed

  **QA Scenarios**:

  ```
  Scenario: Verify rules were added correctly
    Tool: Bash (grep)
    Preconditions: AGENTS.md updated
    Steps:
      1. grep for "non-technical" in AGENTS.md
      2. grep for "concise" in AGENTS.md
      3. Run pnpm build to verify no breakage
    Expected Result: Both rules present, build passes
    Evidence: .sisyphus/evidence/task-3-agents-md-rules.txt
  ```

  **Commit**: YES
  - Message: `docs: add non-technical language and concise response rules to AGENTS.md`
  - Files: `AGENTS.md`
  - Pre-commit: `pnpm build`

- [x] 4. Wire Generators Into Harness

  **What to do**:
  - In `src/workers/opencode-harness.mts`, import and call the two new generators from Tasks 1 and 2
  - **Platform procedures**: Call `generatePlatformProcedures()` with `risk_model.approval_required` from the archetype. Add the result to `platformRuntimeSections` array (before it's passed to `resolveAgentsMd`)
  - **Tool reference**: Call `generateToolReference()` with `tool_registry.tools` from the archetype. Add the result to `platformRuntimeSections` array
  - The `resolveAgentsMd` function already accepts `platformRuntimeSections: string[]` — no resolver changes needed here
  - Ensure the ordering in the sections array matches: security → env manifest → legacy system_prompt → platform procedures → tool reference
  - Add the `submit-output.ts` tool to the tool reference automatically (it's always available, even if not in `tool_registry`)

  **Must NOT do**:
  - Do NOT modify the prompt assembly — it stays as `{resolvedInstructions}\n\nTask ID: {TASK_ID}`
  - Do NOT add employee-specific logic (no "if motivation bot then..." branches)
  - Do NOT modify the delivery phase code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful integration with existing harness code without breaking it
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:806-824` — Current `platformRuntimeSections` construction. Add the new sections in the same pattern.
  - `src/workers/opencode-harness.mts:826-850` — How the resolver is called with the sections.

  **API/Type References**:
  - `src/workers/opencode-harness.mts:29-40` — `ArchetypeRow` interface. Note: `risk_model` is not in this interface yet — it's available on the task's archetype join but needs to be fetched. Check if the `select=*,archetypes(*)` query already returns it.

  **Acceptance Criteria**:
  - [ ] Harness generates platform procedures section from risk_model
  - [ ] Harness generates tool reference section from tool_registry
  - [ ] Both sections appear in the AGENTS.md written to `/app/AGENTS.md`
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: Verify harness builds AGENTS.md with new sections
    Tool: Bash
    Preconditions: pnpm build succeeds
    Steps:
      1. Read the harness source code
      2. Verify generatePlatformProcedures is imported and called
      3. Verify generateToolReference is imported and called
      4. Verify both results are pushed to platformRuntimeSections
      5. Run pnpm test -- --run
    Expected Result: Clean build, all tests pass
    Evidence: .sisyphus/evidence/task-4-harness-wiring.txt
  ```

  **Commit**: YES
  - Message: `feat(worker): wire platform procedures and tool reference into harness`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Clean Up Motivation Bot Archetype Data

  **What to do**:
  - Update the motivation bot archetype in the database (ID: `e4dd9e63-91ac-490b-ba4f-10246be6fa76`)
  - **Clean instructions** — remove all platform boilerplate, keep only task logic:

    ```
    Select an inspirational quote relevant to real estate investment, property renovation, or short-term rental business success.

    Personalize the quote with context about entrepreneurship, resilience, or growth in the real estate space.

    Compose an encouraging message that ties the quote to the team's current efforts.

    Post the motivational message to the team Slack channel.
    ```

  - **Clean agents_md** — remove tool reference, keep only identity:
    ```
    You are a motivational content creator for a real estate investment and short-term rental business team. Your messages should resonate with property owners, investors, and renovation professionals — covering themes like market resilience, property value creation, tenant satisfaction, and scaling operations.
    ```
  - Create a simple SQL migration script at `scripts/update-motivation-bot.sql` for reproducibility
  - Execute the update via psql

  **Must NOT do**:
  - Do NOT modify any other archetype
  - Do NOT modify the seed file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple DB update with known values
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:

  **Content References**:
  - DB: `SELECT instructions, agents_md FROM archetypes WHERE id = 'e4dd9e63-91ac-490b-ba4f-10246be6fa76'` — Current values to replace.

  **Acceptance Criteria**:
  - [ ] Motivation bot instructions contain ONLY the 4-line task logic (no submit-output, no classification rules)
  - [ ] Motivation bot agents_md contains ONLY the identity paragraph (no "TOOLS RELEVANT" section)
  - [ ] SQL script saved for reproducibility
  - [ ] No other archetypes were modified

  **QA Scenarios**:

  ```
  Scenario: Verify archetype was cleaned up
    Tool: Bash (psql)
    Preconditions: DB update executed
    Steps:
      1. Query: SELECT instructions FROM archetypes WHERE id = 'e4dd9e63-91ac-490b-ba4f-10246be6fa76'
      2. Assert instructions does NOT contain "submit-output"
      3. Assert instructions does NOT contain "CLASSIFICATION"
      4. Assert instructions does NOT contain "MANDATORY"
      5. Query: SELECT agents_md FROM archetypes WHERE id = 'e4dd9e63-91ac-490b-ba4f-10246be6fa76'
      6. Assert agents_md does NOT contain "TOOLS RELEVANT"
      7. Assert agents_md does NOT contain "tsx /tools/"
    Expected Result: Both fields contain only clean content
    Evidence: .sisyphus/evidence/task-5-archetype-cleanup.txt

  Scenario: Verify other archetypes untouched
    Tool: Bash (psql)
    Preconditions: DB update executed
    Steps:
      1. Query: SELECT id, instructions FROM archetypes WHERE id != 'e4dd9e63-91ac-490b-ba4f-10246be6fa76'
      2. Assert all other archetypes still contain their original instructions (spot-check submit-output presence)
    Expected Result: Other archetypes unchanged
    Evidence: .sisyphus/evidence/task-5-other-archetypes-intact.txt
  ```

  **Commit**: YES
  - Message: `chore: clean up motivation bot archetype (pure task logic)`
  - Files: `scripts/update-motivation-bot.sql`
  - Pre-commit: none

- [x] 6. End-to-End Verification: Trigger Motivation Bot

  **What to do**:
  - Build Docker image: `docker build -t ai-employee-worker:latest .`
  - Ensure services are running (`pnpm dev` or equivalent)
  - Trigger the motivation bot via admin API:
    ```bash
    curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot/trigger" \
      -H "Content-Type: application/json" -d '{}'
    ```
  - Monitor task progression: Received → Ready → Executing → Submitting → Done
  - Verify the AGENTS.md written inside the container contains:
    - "Platform Procedures" section with NO_ACTION_NEEDED rules (since approval_required: false)
    - "Available Tools" section listing `post-message.ts`
    - "Employee Identity" section with the personality text (no tools)
  - Verify the prompt sent to OpenCode is clean (just task logic + Task ID)
  - Verify task reaches Done status

  **Must NOT do**:
  - Do NOT trigger any other employee
  - Do NOT modify code during this task — only verify

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires Docker build, service orchestration, and careful log analysis
  - **Skills**: [`e2e-testing`]
    - `e2e-testing`: E2E verification patterns and state checking

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: F1–F4
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `docs/employees/` — Employee trigger documentation pattern
  - `AGENTS.md` — Admin API trigger endpoint documentation

  **Acceptance Criteria**:
  - [ ] Docker image built successfully
  - [ ] Task created and reaches Executing status
  - [ ] Task reaches Done (or Submitting if approval-required)
  - [ ] Container logs show AGENTS.md written with new sections
  - [ ] No errors in harness logs

  **QA Scenarios**:

  ```
  Scenario: Motivation bot completes with new architecture
    Tool: Bash (curl + psql)
    Preconditions: Docker image rebuilt, services running
    Steps:
      1. Trigger via admin API, capture task_id from response
      2. Poll task status every 15s: SELECT status FROM tasks WHERE id = '<task_id>'
      3. Wait for status to reach 'Done' (timeout: 5 minutes)
      4. Query task_status_log: SELECT * FROM task_status_log WHERE task_id = '<task_id>' ORDER BY created_at
      5. Verify transitions include Executing → Submitting → Done
      6. Check gateway/harness logs for "Wrote concatenated AGENTS.md" message
    Expected Result: Task completes successfully through full lifecycle
    Failure Indicators: Task stuck at Executing, status = Failed, harness crash logs
    Evidence: .sisyphus/evidence/task-6-e2e-trigger.txt

  Scenario: Verify AGENTS.md content in container logs
    Tool: Bash (grep logs)
    Preconditions: Task triggered and completed
    Steps:
      1. Search harness logs for AGENTS.md content indicators
      2. Verify "Platform Procedures" or "submit-output" appears in the written AGENTS.md
      3. Verify "Available Tools" or tool listing appears
    Expected Result: Both auto-generated sections present in written AGENTS.md
    Evidence: .sisyphus/evidence/task-6-agents-md-content.txt
  ```

  **Commit**: NO (verification only)

- [x] 7. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Build Docker image. Trigger the motivation bot via admin API. Verify: task reaches Submitting/Done, AGENTS.md on worker contains "Platform Procedures" and "Available Tools" sections, instructions prompt is clean (no boilerplate). Save evidence.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify nothing beyond spec was built. Check that guest-messaging, summarizer, and code-rotation archetypes were NOT modified. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message                                                                    | Files                                                                                      |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1          | `feat(worker): add platform procedures generator for AGENTS.md`            | `src/workers/lib/platform-procedures.mts`, `src/workers/lib/agents-md-resolver.mts`, tests |
| 2          | `feat(worker): add tool reference generator for AGENTS.md`                 | `src/workers/lib/tool-reference-generator.mts`, tests                                      |
| 3          | `docs: add non-technical language and concise response rules to AGENTS.md` | `AGENTS.md`                                                                                |
| 4          | `feat(worker): wire platform procedures and tool reference into harness`   | `src/workers/opencode-harness.mts`                                                         |
| 5          | `chore: clean up motivation bot archetype (pure task logic)`               | DB update script                                                                           |
| 6          | `test: verify motivation bot with new info architecture`                   | evidence files                                                                             |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run           # Expected: all pass, no regressions
pnpm build                   # Expected: clean build
pnpm lint                    # Expected: no errors
```

### Final Checklist

- [ ] Motivation bot prompt contains ONLY task logic
- [ ] AGENTS.md has auto-generated "Platform Procedures" section
- [ ] AGENTS.md has auto-generated "Available Tools" section
- [ ] No other archetypes were modified
- [ ] All tests pass
- [ ] Docker image builds successfully
