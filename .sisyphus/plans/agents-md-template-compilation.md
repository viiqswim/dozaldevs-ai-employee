# AGENTS.md Template Compilation Migration

## TL;DR

> **Quick Summary**: Migrate the platform from brittle 7-layer AGENTS.md concatenation to a template-compiled approach that produces a single, LLM-optimized document — validated at 100% pass rate across 140+ stress test runs.
>
> **Deliverables**:
>
> - New DB schema: `identity`, `execution_steps`, `delivery_steps`, `temperature` on archetypes; `compiled_agents_md` on tasks
> - Template compiler replacing 7-layer resolver
> - Simplified harness (single compile for both phases)
> - Updated dashboard (new form fields, live preview, compiled viewer)
> - All 6 archetypes migrated to new structure
> - Dead code removed (~400 lines across 3 files)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 (schema) → Task 3 (compiler) → Task 5 (harness) → Task 9 (migration) → Task 13 (stress test) → F1-F4

---

## Context

### Original Request

Migrate the AI Employee platform's AGENTS.md assembly from a 7-layer concatenation approach to a template-compiled approach, validated by a 100% pass rate experimental employee. The proven structure: identity → CRITICAL directive → org context → XML-tagged execution steps → XML-tagged delivery steps → learned rules → knowledge base → platform rules.

### Interview Summary

**Key Discussions**:

- Current 7-layer assembly produces 200+ line documents with instructions scattered across 3 injection points (AGENTS.md, prompt, recovery nudge)
- Experimental `daily-real-estate-inspiration-2-copy` with 41-line single file achieved 100% pass rate across 140+ tasks
- Template compilation approach: author in layers (platform/tenant/employee), compile to single LLM-optimized document
- The execution and delivery prompts become platform constants: `"Follow the instructions in <execution-instructions> within the AGENTS.md file"` and `"Follow the instructions in <delivery-instructions> within the AGENTS.md file"`
- These prompts are stored in DB for engineering override but hidden from end-user UI
- User requested renaming `instructions` → `execution_instructions`

**Research Findings**:

- Key success factors: single file, numbered steps, XML tag isolation with IMPORTANT/STOP directives, CRITICAL bash-tool directive at top, inline tool commands
- `admin-brain-preview.ts` (388 lines) directly imports `resolveAgentsMd`, `generatePlatformProcedures`, `generateToolReference` — must be updated
- `ArchetypeGenerator` service (451 lines) generates `system_prompt` and `agents_md` — both fields being removed — must be updated
- Temperature hardcoded at 1.5 in `opencode-harness.mts` line 264 via `opencode.json` — conflicts with new DB field
- 10 dashboard files reference old field names

### Metis Review

**Identified Gaps** (addressed):

- `admin-brain-preview.ts` blast radius — included as Task 7
- `ArchetypeGenerator` service generates removed fields — included as Task 8
- Temperature conflict (DB field vs hardcoded `opencode.json`) — resolved in Task 5 (harness reads DB field)
- Two-phase column strategy (add first, drop later) — adopted as Wave 1 vs Wave 4

---

## Work Objectives

### Core Objective

Replace the 7-layer AGENTS.md concatenation with a template compiler that produces the proven LLM-optimized document structure, achieving 100% task pass rate as a platform standard.

### Concrete Deliverables

- Prisma migration adding `identity`, `execution_steps`, `delivery_steps`, `temperature` to archetypes
- Prisma migration adding `compiled_agents_md` to tasks
- Prisma migration renaming `instructions` → `execution_instructions`
- New `compileAgentsMd()` function replacing `resolveAgentsMd()`
- Simplified `opencode-harness.mts` with single compilation path
- Updated `admin-brain-preview.ts` using new compiler
- Updated `ArchetypeGenerator` producing new field structure
- Updated dashboard form, preview panel, and task detail view
- All 6 archetypes migrated to new schema
- 20-run stress test at 100% pass rate

### Definition of Done

- [ ] `pnpm build` passes with zero errors
- [ ] `pnpm test -- --run` passes (existing test count maintained)
- [ ] 20-run stress test of `daily-real-estate-inspiration-2-copy` at ≥95% pass rate
- [ ] All 6 archetypes have `identity`, `execution_steps`, `delivery_steps` populated
- [ ] Old fields (`system_prompt`, `agents_md`) columns dropped
- [ ] `instructions` renamed to `execution_instructions` in schema and all code references

### Must Have

- Template compiler that produces the proven structure (identity → CRITICAL → org context → XML-tagged phases → rules → KB → platform rules)
- XML tag isolation with IMPORTANT/STOP directives added by compiler, not user
- CRITICAL bash-tool directive always at top of compiled output
- Single compiled AGENTS.md used for BOTH execution and delivery phases (no re-assembly)
- Per-archetype temperature field (default 1.0)
- Compiled AGENTS.md snapshot on each task for debugging
- Recovery nudge aligned with compiled AGENTS.md structure

### Must NOT Have (Guardrails)

- No hardcoded temperature in harness — must read from archetype DB field
- No platform-injected submit-output instructions outside the employee's steps — submit-output commands must be inline in `execution_steps` and `delivery_steps`
- No generic "Available Tools" auto-generated section — tools are inline in steps
- No separate AGENTS.md assembly for delivery phase — same compiled doc, different prompt pointer
- No `system_prompt` or `agents_md` fields in new code — these columns get dropped
- No user-facing exposure of `execution_instructions` or `delivery_instructions` (the prompt constants) in dashboard

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (update existing tests to match new field names)
- **Framework**: vitest (via `pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Compiler**: Use Bash (bun/node REPL) — import, call functions, compare output
- **API**: Use Bash (curl) — send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot
- **Integration**: Use Bash — trigger employee, poll status, verify in DB

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — schema + compiler):
├── Task 1: Prisma schema migration (add new columns) [quick]
├── Task 2: Prisma schema migration (tasks.compiled_agents_md) [quick]
├── Task 3: Template compiler (replace agents-md-resolver) [deep]
└── Task 4: Data migration script for 6 archetypes [unspecified-high]

Wave 2 (Backend integration — harness + APIs):
├── Task 5: Harness rewrite (single compile, both phases) [deep]
├── Task 6: Recovery nudge alignment [quick]
├── Task 7: Brain-preview route rewrite [unspecified-high]
├── Task 8: ArchetypeGenerator update [unspecified-high]
└── Task 9: Run data migration + verify [quick]

Wave 3 (Dashboard + cleanup):
├── Task 10: Dashboard archetype form (new fields) [visual-engineering]
├── Task 11: Dashboard compiled preview + task viewer [visual-engineering]
├── Task 12: Dead code removal + column drops [unspecified-high]
└── Task 13: Clear failure_reason on retry success [quick]

Wave 4 (Verification):
├── Task 14: Build + test suite pass [quick]
├── Task 15: Stress test (20 runs, concurrency 5) [deep]
├── Task 16: AGENTS.md + docs update [writing]
└── Task 17: Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks  |
| ---- | ---------- | ------- |
| 1    | —          | 4, 5, 9 |
| 2    | —          | 5       |
| 3    | —          | 5, 7, 8 |
| 4    | 1          | 9       |
| 5    | 1, 2, 3    | 14, 15  |
| 6    | 5          | 14      |
| 7    | 3          | 14      |
| 8    | 3          | 14      |
| 9    | 4, 5       | 15      |
| 10   | 1          | 14      |
| 11   | 1, 2       | 14      |
| 12   | 5, 7, 8    | 14      |
| 13   | 5          | 14      |
| 14   | 5-13       | 15      |
| 15   | 9, 14      | F1-F4   |
| 16   | 5          | F1      |
| 17   | 15         | —       |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `quick`, T3 → `deep`, T4 → `unspecified-high`
- **Wave 2**: **5 tasks** — T5 → `deep`, T6 → `quick`, T7 → `unspecified-high`, T8 → `unspecified-high`, T9 → `quick`
- **Wave 3**: **4 tasks** — T10 → `visual-engineering`, T11 → `visual-engineering`, T12 → `unspecified-high`, T13 → `quick`
- **Wave 4**: **4 tasks** — T14 → `quick`, T15 → `deep`, T16 → `writing`, T17 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

### Wave 1 — Foundation (schema + compiler)

- [x] 1. Prisma schema migration: add new archetype columns

  **What to do**:
  - Create a Prisma migration that adds these columns to the `archetypes` table:
    - `identity` (`String? @db.Text`) — who the employee is (name, personality, org context)
    - `execution_steps` (`String? @db.Text`) — numbered execution steps (raw, no XML tags)
    - `delivery_steps` (`String? @db.Text`) — numbered delivery steps (raw, no XML tags)
    - `temperature` (`Float? @default(1.0)`) — per-archetype LLM temperature
  - Rename `instructions` → `execution_instructions` (`String? @db.Text`) — the platform constant prompt
  - DO NOT drop `system_prompt` or `agents_md` yet — those stay for backward compatibility until Wave 3
  - Run `pnpm prisma migrate dev --name add-template-compilation-fields` to generate and apply the migration
  - Verify the migration runs cleanly on the local DB

  **Must NOT do**:
  - Do not drop any existing columns in this migration
  - Do not modify any data — this is schema-only
  - Do not change any code files — just Prisma schema and migration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file schema change + migration command, straightforward
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Domain overlap is config/seed, not schema migrations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 4, 5, 9, 10, 11
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:184-229` — Current Archetype model definition. Add new fields after line 214 (`estimated_manual_minutes_override`)

  **API/Type References**:
  - `dashboard/src/lib/types.ts:78-113` — Dashboard Archetype interface. Will need updating in Task 10 to add new fields

  **External References**:
  - Prisma docs: `https://www.prisma.io/docs/concepts/components/prisma-schema/data-model` — Column types and @db modifiers

  **WHY Each Reference Matters**:
  - The schema.prisma file shows exactly where to add fields and what naming conventions are used (snake_case, `@db.Text` for long strings)
  - The dashboard types show what downstream consumers expect

  **Acceptance Criteria**:
  - [ ] `prisma/schema.prisma` contains `identity`, `execution_steps`, `delivery_steps`, `temperature` on the Archetype model
  - [ ] `instructions` field is renamed to `execution_instructions` in schema
  - [ ] Migration file exists in `prisma/migrations/` with the correct SQL
  - [ ] `pnpm prisma migrate dev` completes without errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration applies cleanly
    Tool: Bash
    Preconditions: Local DB is running (`docker ps | grep shared-postgres`)
    Steps:
      1. Run: `pnpm prisma migrate dev --name add-template-compilation-fields`
      2. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetypes" | grep -E "identity|execution_steps|delivery_steps|temperature|execution_instructions"`
      3. Assert: All 5 columns appear in the output
      4. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetypes" | grep -E "^\ instructions\ "`
      5. Assert: No rows returned (old `instructions` column renamed)
    Expected Result: 5 new/renamed columns visible, old `instructions` name gone
    Failure Indicators: psql shows missing columns or migration errors
    Evidence: .sisyphus/evidence/task-1-migration-columns.txt

  Scenario: Existing data is preserved
    Tool: Bash
    Preconditions: Archetypes exist in DB before migration
    Steps:
      1. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, execution_instructions FROM archetypes LIMIT 3"`
      2. Assert: Rows returned with existing instruction content (renamed from `instructions`)
    Expected Result: Data preserved after rename, not null
    Failure Indicators: NULL values where data previously existed
    Evidence: .sisyphus/evidence/task-1-data-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add identity, execution_steps, delivery_steps, temperature to archetypes; rename instructions`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `pnpm prisma validate`

- [x] 2. Prisma schema migration: add compiled_agents_md to tasks

  **What to do**:
  - Create a Prisma migration that adds `compiled_agents_md` (`String? @db.Text`) to the `tasks` table
  - This field stores the exact compiled AGENTS.md document used for each task run (debugging snapshot)
  - Run `pnpm prisma migrate dev --name add-compiled-agents-md-to-tasks`
  - Verify migration applies cleanly

  **Must NOT do**:
  - Do not modify any other table
  - Do not add any code that writes to this field yet (that's Task 5)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single column addition, trivial migration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 11
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:20-59` — Current Task model definition. Add field after `failure_code` (line 41)

  **WHY Each Reference Matters**:
  - Shows the Task model structure and where to place the new field logically

  **Acceptance Criteria**:
  - [ ] `prisma/schema.prisma` Task model contains `compiled_agents_md String? @db.Text`
  - [ ] Migration file exists and applies cleanly

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Column exists on tasks table
    Tool: Bash
    Preconditions: Migration has been applied
    Steps:
      1. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d tasks" | grep compiled_agents_md`
      2. Assert: Column appears as type `text`
    Expected Result: `compiled_agents_md | text |` in output
    Failure Indicators: No output from grep
    Evidence: .sisyphus/evidence/task-2-column-exists.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add compiled_agents_md snapshot to tasks table`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `pnpm prisma validate`

- [x] 3. Template compiler: replace agents-md-resolver with compileAgentsMd

  **What to do**:
  - Create a NEW file `src/workers/lib/agents-md-compiler.mts` with a `compileAgentsMd()` function
  - The compiler takes structured inputs and produces a single LLM-optimized AGENTS.md document
  - Function signature:
    ```typescript
    interface CompileAgentsMdInput {
      identity: string; // Who the employee is + org context
      executionSteps: string; // Numbered execution steps (raw, no XML)
      deliverySteps: string; // Numbered delivery steps (raw, no XML)
      employeeRules?: string; // Learned behavioral rules (may be empty)
      employeeKnowledge?: string; // Knowledge base content (may be empty)
    }
    export function compileAgentsMd(input: CompileAgentsMdInput): string;
    ```
  - Output structure must match the proven format from `2026-05-27-2128-compiled-agents-md.md`:
    1. Identity block (from `identity` field)
    2. CRITICAL bash-tool directive (hardcoded by compiler — always present)
    3. `<execution-instructions>` XML tag with IMPORTANT/STOP directives wrapping `executionSteps`
    4. `<delivery-instructions>` XML tag with IMPORTANT/STOP directives wrapping `deliverySteps`
    5. Learned rules section (if non-empty) with `# Behavioral Rules (Learned)` header
    6. Knowledge base section (if non-empty) with `# Knowledge Base` header
    7. Platform rules (hardcoded 4-bullet list from `src/workers/config/agents.md`)
  - The compiler adds ALL structural elements (XML tags, IMPORTANT directives, STOP markers, CRITICAL directive). The user-authored `executionSteps` and `deliverySteps` are just raw numbered steps.
  - Write unit tests in `src/workers/lib/__tests__/agents-md-compiler.test.ts`:
    - Test with all fields populated
    - Test with empty employeeRules and employeeKnowledge (sections omitted)
    - Test that XML tags and STOP markers are present
    - Test that CRITICAL bash directive is always included
  - The platform rules text should be read from `src/workers/config/agents.md` at import time (not hardcoded in the compiler)

  **Must NOT do**:
  - Do not modify `agents-md-resolver.mts` yet — it stays until Task 12
  - Do not include any "Available Tools" section or auto-generated tool reference — tools are inline in the steps
  - Do not include any "How to Complete Your Work" section — submit-output is inline in the steps

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core architecture piece — must precisely match the proven format, needs careful testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 7, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/experimental/daily-real-estate-inspiration-2-copy/2026-05-27-2128-compiled-agents-md.md` — THE PROVEN FORMAT. This is the exact output the compiler must produce. Study every line: identity block, CRITICAL directive, XML tags with IMPORTANT/STOP, platform rules at bottom.
  - `src/workers/lib/agents-md-resolver.mts:1-45` — OLD approach being replaced. Understand its concatenation strategy to ensure the new compiler covers all inputs but in the new structure.
  - `src/workers/config/agents.md` — Platform rules content. Read this file at module load and include verbatim in compiled output under `## Platform Rules`.

  **Test References**:
  - Look at existing test patterns in `src/workers/lib/__tests__/` for file naming and assertion style

  **External References**:
  - No external libraries needed — pure string template compilation

  **WHY Each Reference Matters**:
  - The compiled-agents-md proof-of-concept is the ground truth for output format — match it exactly
  - The old resolver shows what inputs exist (tenant config, archetype, rules, knowledge) so nothing is lost
  - The platform config/agents.md is the static content that always goes at the bottom

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/agents-md-compiler.mts` exists with `compileAgentsMd()` export
  - [ ] Output matches the structure in `2026-05-27-2128-compiled-agents-md.md`
  - [ ] Unit tests pass: `pnpm test -- --run src/workers/lib/__tests__/agents-md-compiler.test.ts`
  - [ ] CRITICAL bash directive appears before execution-instructions
  - [ ] XML tags `<execution-instructions>` and `<delivery-instructions>` wrap steps with IMPORTANT/STOP

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Compiler produces correct output with all fields
    Tool: Bash
    Preconditions: File compiled and tests exist
    Steps:
      1. Run: `pnpm test -- --run src/workers/lib/__tests__/agents-md-compiler.test.ts`
      2. Assert: All tests pass (0 failures)
      3. Verify test output includes assertions for: XML tags, STOP markers, CRITICAL directive, platform rules
    Expected Result: All tests pass, output structure matches proven format
    Failure Indicators: Any test failure or missing structural element
    Evidence: .sisyphus/evidence/task-3-compiler-tests.txt

  Scenario: Compiler omits empty sections
    Tool: Bash
    Preconditions: Unit tests include empty-input scenario
    Steps:
      1. Verify test case exists that calls compileAgentsMd with empty employeeRules and employeeKnowledge
      2. Assert: Output does NOT contain "Behavioral Rules" or "Knowledge Base" headers
    Expected Result: Clean output without empty sections
    Failure Indicators: Empty section headers present in output
    Evidence: .sisyphus/evidence/task-3-empty-sections.txt
  ```

  **Commit**: YES
  - Message: `feat(compiler): add template-based compileAgentsMd replacing 7-layer concatenation`
  - Files: `src/workers/lib/agents-md-compiler.mts`, `src/workers/lib/__tests__/agents-md-compiler.test.ts`
  - Pre-commit: `pnpm test -- --run src/workers/lib/__tests__/agents-md-compiler.test.ts`

- [x] 4. Data migration script for 6 archetypes

  **What to do**:
  - Create `scripts/migrate-archetypes-to-template.ts` — a tsx script that:
    1. Connects to DB via Prisma
    2. Reads all 6 archetypes: `guest-messaging`, `daily-summarizer`, `daily-real-estate-inspiration-2`, `daily-real-estate-inspiration-2-copy`, `code-rotation`, `schedule-generator-thornton`
    3. For each archetype, extracts from the EXISTING fields (`system_prompt`, `agents_md`, `delivery_instructions`) and populates the NEW fields (`identity`, `execution_steps`, `delivery_steps`)
    4. Sets `temperature` to `1.0` for all (default), except `daily-real-estate-inspiration-2-copy` which gets `1.5` (its proven value)
    5. The mapping logic:
       - `identity`: Extract from `agents_md` — the first paragraph/section that describes who the employee is + any org context from tenant `default_agents_md`
       - `execution_steps`: Extract numbered steps from `agents_md` or `instructions` — just the raw step content, no XML tags
       - `delivery_steps`: Extract from `delivery_instructions` — just the raw step content, no XML tags
    6. Script must be **idempotent** — safe to run multiple times (skip if new fields already populated)
    7. Script must print a before/after summary for each archetype
    8. Add `--dry-run` flag that shows what would change without writing
  - **CRITICAL**: This requires human judgment for each archetype. The script should do its best to extract, but also write the raw source content to `scripts/migration-output/` for manual review before committing the writes.
  - This script is NOT run in this task — it's prepared here and run in Task 9 after the harness is ready

  **Must NOT do**:
  - Do not run the script in this task — just create it
  - Do not modify any archetype data yet
  - Do not try to auto-extract perfectly — include raw dumps for human review

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires reading 6 different archetypes from DB and writing careful extraction logic
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Provides archetype schema field definitions and seed data patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1 (needs new columns to exist in schema)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — How existing seed scripts connect to DB and write archetypes
  - `src/workers/experimental/daily-real-estate-inspiration-2-copy/2026-05-27-2128-compiled-agents-md.md` — Example of what the extracted content should look like for one archetype (the inspiration bot)

  **API/Type References**:
  - `prisma/schema.prisma:184-229` — Archetype model fields (both old and new)

  **WHY Each Reference Matters**:
  - seed.ts shows DB connection and write patterns used in scripts
  - The compiled-agents-md shows the target format for one archetype

  **Acceptance Criteria**:
  - [ ] `scripts/migrate-archetypes-to-template.ts` exists and compiles (`npx tsx --help` shows no errors)
  - [ ] Script has `--dry-run` flag
  - [ ] Script is idempotent (running twice doesn't double-write)
  - [ ] Script handles all 6 archetypes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dry run shows planned changes without writing
    Tool: Bash
    Preconditions: Task 1 migration has been applied
    Steps:
      1. Run: `npx tsx scripts/migrate-archetypes-to-template.ts --dry-run`
      2. Assert: Output shows 6 archetypes with planned field values
      3. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name, identity FROM archetypes WHERE identity IS NOT NULL"`
      4. Assert: 0 rows (dry run didn't write)
    Expected Result: Preview of changes with no DB writes
    Failure Indicators: Rows written during dry run, or script crashes
    Evidence: .sisyphus/evidence/task-4-dry-run.txt

  Scenario: Script compiles without errors
    Tool: Bash
    Preconditions: TypeScript file exists
    Steps:
      1. Run: `npx tsx --eval "import './scripts/migrate-archetypes-to-template.ts'" 2>&1 | head -5`
      2. Assert: No compilation errors (may fail at runtime without DB — that's OK)
    Expected Result: Clean compilation
    Failure Indicators: TypeScript compilation errors
    Evidence: .sisyphus/evidence/task-4-compiles.txt
  ```

  **Commit**: YES
  - Message: `feat(migration): add archetype data migration script for template compilation`
  - Files: `scripts/migrate-archetypes-to-template.ts`
  - Pre-commit: `npx tsc --noEmit scripts/migrate-archetypes-to-template.ts` (or equivalent check)

---

### Wave 2 — Backend Integration (harness + APIs)

- [x] 5. Harness rewrite: use template compiler for both execution and delivery

  **What to do**:
  - Rewrite `src/workers/opencode-harness.mts` to use `compileAgentsMd()` from Task 3 instead of the old `resolveAgentsMd()` + `generatePlatformProcedures()` + `generateToolReference()`
  - **Execution phase** (lines ~870-936): Replace the entire AGENTS.md resolution block:
    - Read archetype's new fields: `identity`, `execution_steps`, `delivery_steps`
    - Fetch `employeeRules` and `employeeKnowledge` as before
    - Call `compileAgentsMd({ identity, executionSteps, deliverySteps, employeeRules, employeeKnowledge })`
    - Write the result to `/app/AGENTS.md`
    - Save the compiled content to `tasks.compiled_agents_md` via PostgREST PATCH
  - **Delivery phase** (lines ~649-730): Replace the delivery AGENTS.md resolution block:
    - Use the SAME compiled AGENTS.md (read from `tasks.compiled_agents_md` or re-compile)
    - The delivery prompt already points to `<delivery-instructions>` — same file, different tag
  - **Temperature** (line ~264): Replace hardcoded `1.5` with archetype's `temperature` field:
    ```typescript
    const temp = (archetype as any).temperature ?? 1.0;
    agent: {
      build: {
        temperature: temp;
      }
    }
    ```
  - **Remove experimental bypass**: Delete the `EXPERIMENTAL_EMPLOYEE_SLUG` constant and both conditional blocks (~lines 649-703 execution, 905-911 delivery). All employees now use the new compiler path.
  - **Remove old imports**: Remove imports of `resolveAgentsMd`, `generatePlatformProcedures`, `generateToolReference`
  - **Keep** `assembleTaskPrompt` — it still handles date injection and task ID
  - **Update execution prompt**: Change the resolved instructions to use the platform constant: `"Follow the instructions in <execution-instructions> within the AGENTS.md file"`
  - **Update delivery prompt**: The delivery prompt should be: `"Follow the instructions in <delivery-instructions> within the AGENTS.md file\n\n--- APPROVED CONTENT ---\n{deliverableContent}\n--- END APPROVED CONTENT ---\n\nTask ID: {TASK_ID}"`
  - **Rename all code references** from `archetype.instructions` to `archetype.execution_instructions`

  **Must NOT do**:
  - Do not remove `prompt-assembler.mts` — it's still used for date injection
  - Do not hardcode any temperature value — must come from DB
  - Do not create separate AGENTS.md for delivery — same compiled doc, different prompt pointer
  - Do not include platform procedures or tool reference generation — those are now inline in steps

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core harness rewrite touching ~200 lines, needs careful surgery to avoid breaking the lifecycle
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential dependency on Wave 1)
  - **Blocks**: Tasks 6, 9, 12, 13, 14, 15
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:250-274` — Current temperature config (line 264: `temperature: 1.5`). Replace with DB field read
  - `src/workers/opencode-harness.mts:640-730` — Delivery phase AGENTS.md resolution. Replace with compiler call
  - `src/workers/opencode-harness.mts:870-936` — Execution phase AGENTS.md resolution. Replace with compiler call
  - `src/workers/opencode-harness.mts:489-523` — Recovery nudge block. Keep but align message with new structure (Task 6)
  - `src/workers/opencode-harness.mts:938-948` — `assembleTaskPrompt` call. Update `instructions` param to use new constant prompt

  **API/Type References**:
  - `src/workers/lib/agents-md-compiler.mts` — The new compiler function (from Task 3)
  - `src/workers/lib/prompt-assembler.mts:16-43` — `assembleTaskPrompt()` — still used, but `instructions` param changes to the constant execution prompt

  **WHY Each Reference Matters**:
  - Each harness line range is a specific surgery site — agent must know exactly where to cut and what to replace
  - The compiler is the new single source of truth for AGENTS.md content
  - The prompt assembler is kept for date/time injection but its input changes

  **Acceptance Criteria**:
  - [ ] `opencode-harness.mts` imports `compileAgentsMd` instead of old resolver/procedures/tool-ref
  - [ ] Temperature reads from `archetype.temperature` (no hardcoded value)
  - [ ] `EXPERIMENTAL_EMPLOYEE_SLUG` and both conditional blocks are deleted
  - [ ] Compiled AGENTS.md saved to `tasks.compiled_agents_md` via PostgREST
  - [ ] Same compiled doc used for both execution and delivery phases
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness compiles and builds without errors
    Tool: Bash
    Preconditions: Tasks 1-3 completed (schema + compiler exist)
    Steps:
      1. Run: `pnpm build 2>&1 | tail -20`
      2. Assert: Exit code 0, no TypeScript errors
      3. Run: `grep -c "resolveAgentsMd\|generatePlatformProcedures\|generateToolReference" src/workers/opencode-harness.mts`
      4. Assert: 0 (no old imports remaining)
      5. Run: `grep -c "EXPERIMENTAL_EMPLOYEE_SLUG" src/workers/opencode-harness.mts`
      6. Assert: 0 (experimental bypass removed)
    Expected Result: Clean build, no old references
    Failure Indicators: Build errors or old imports still present
    Evidence: .sisyphus/evidence/task-5-build-clean.txt

  Scenario: Temperature is not hardcoded
    Tool: Bash
    Preconditions: Harness rewrite complete
    Steps:
      1. Run: `grep "temperature: 1.5" src/workers/opencode-harness.mts`
      2. Assert: No matches (hardcoded 1.5 is gone)
      3. Run: `grep "temperature" src/workers/opencode-harness.mts | head -5`
      4. Assert: Shows dynamic read from archetype field
    Expected Result: Temperature is read from DB, not hardcoded
    Failure Indicators: Literal `1.5` found in harness
    Evidence: .sisyphus/evidence/task-5-temperature-dynamic.txt
  ```

  **Commit**: YES
  - Message: `refactor(harness): use template compiler for both execution and delivery; dynamic temperature`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 6. Recovery nudge alignment

  **What to do**:
  - Update the recovery nudge message in `src/workers/opencode-harness.mts` (lines ~489-523) to reference the new AGENTS.md structure
  - Current nudge says: `"You may still have remaining delivery steps to complete..."`
  - New nudge should say: `"Your session went idle without completing submit-output. Re-read the <execution-instructions> in AGENTS.md and complete all remaining steps. The final step MUST be:\n{submitOutputCmd}"`
  - This aligns the nudge with the XML-tagged structure the employee already sees

  **Must NOT do**:
  - Do not change the nudge logic (when it fires, timeouts) — only the message text
  - Do not remove the recovery nudge mechanism

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single string replacement in one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 5)
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9)
  - **Blocks**: Task 14
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:489-523` — Recovery nudge block. Line 504 has the message to update.

  **WHY Each Reference Matters**:
  - Exact line with the string to change

  **Acceptance Criteria**:
  - [ ] Nudge message references `<execution-instructions>` and AGENTS.md
  - [ ] No mention of "delivery steps" in the nudge (confusing during execution phase)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Nudge message updated
    Tool: Bash
    Preconditions: Task 5 harness rewrite done
    Steps:
      1. Run: `grep "execution-instructions" src/workers/opencode-harness.mts`
      2. Assert: At least one match in the nudge message area
      3. Run: `grep "remaining delivery steps" src/workers/opencode-harness.mts`
      4. Assert: 0 matches (old text removed)
    Expected Result: New nudge text references XML tag structure
    Failure Indicators: Old nudge text still present
    Evidence: .sisyphus/evidence/task-6-nudge-updated.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `refactor(harness): align recovery nudge with compiled AGENTS.md structure`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 7. Brain-preview route rewrite

  **What to do**:
  - Rewrite `src/gateway/routes/admin-brain-preview.ts` to use the new `compileAgentsMd()` compiler
  - Current state: imports `resolveAgentsMd`, `generatePlatformProcedures`, `generateToolReference` and produces a preview of the assembled AGENTS.md
  - New state: import `compileAgentsMd` and produce a preview using the new fields (`identity`, `execution_steps`, `delivery_steps`)
  - The preview response should include:
    - `compiled_agents_md`: The full compiled output (what the employee sees)
    - `execution_prompt`: The constant platform prompt for execution phase
    - `delivery_prompt`: The constant platform prompt for delivery phase
    - `archetype_fields`: The raw field values from DB for inspection
  - Remove imports of `resolveAgentsMd`, `generatePlatformProcedures`, `generateToolReference`
  - Remove references to `system_prompt` and `agents_md` fields (use new fields)
  - Update all references from `archetype.instructions` to `archetype.execution_instructions`
  - Keep the env manifest preview functionality — it's unrelated to AGENTS.md

  **Must NOT do**:
  - Do not remove the entire route — it's used by the dashboard's brain preview panel
  - Do not change the route path (`/admin/tenants/:tenantId/archetypes/:archetypeId/brain-preview`)
  - Do not remove env manifest logic — only AGENTS.md-related code changes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 388-line file requiring careful refactoring of imports and response structure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8, 9)
  - **Blocks**: Tasks 12, 14
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-brain-preview.ts:1-16` — Current imports. Remove lines 11-14 (old resolver/procedures/tool-ref imports), add compiler import
  - `src/gateway/routes/admin-brain-preview.ts:34-46` — `getPlatformAgentsMd()` helper. Can be removed — compiler reads platform rules internally

  **API/Type References**:
  - `src/workers/lib/agents-md-compiler.mts` — New compiler to import

  **WHY Each Reference Matters**:
  - The import block shows exactly what to replace
  - The helper function may no longer be needed if compiler handles platform rules internally

  **Acceptance Criteria**:
  - [ ] Route returns `compiled_agents_md` in response
  - [ ] No imports of old resolver/procedures/tool-ref
  - [ ] `pnpm build` passes
  - [ ] Existing route path unchanged

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Brain preview returns compiled output
    Tool: Bash
    Preconditions: Gateway is running, at least one archetype has new fields populated
    Steps:
      1. Run: `source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/ad5f02f0-f38d-4e00-abd0-4973cd93a7eb/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.compiled_agents_md' | head -5`
      2. Assert: Response contains compiled AGENTS.md content (not null)
      3. Assert: Content includes `<execution-instructions>` tag
    Expected Result: Preview API returns the compiled document
    Failure Indicators: null response, 500 error, or old format returned
    Evidence: .sisyphus/evidence/task-7-brain-preview.txt

  Scenario: No old imports remain
    Tool: Bash
    Steps:
      1. Run: `grep -c "resolveAgentsMd\|generatePlatformProcedures\|generateToolReference" src/gateway/routes/admin-brain-preview.ts`
      2. Assert: 0
    Expected Result: Clean of old imports
    Failure Indicators: Any matches found
    Evidence: .sisyphus/evidence/task-7-no-old-imports.txt
  ```

  **Commit**: YES
  - Message: `refactor(brain-preview): use template compiler for AGENTS.md preview`
  - Files: `src/gateway/routes/admin-brain-preview.ts`
  - Pre-commit: `pnpm build`

- [x] 8. ArchetypeGenerator update

  **What to do**:
  - Update `src/gateway/services/archetype-generator.ts` to produce new field structure
  - Current state: generates `system_prompt` and `agents_md` fields (both being deprecated)
  - New state: generate `identity`, `execution_steps`, and `delivery_steps` fields instead
  - The generator uses an LLM call (Haiku) to auto-generate archetype content from user input. Update the LLM prompt to ask for the new field structure:
    - `identity`: A paragraph describing who the employee is, their personality, and org context
    - `execution_steps`: Numbered steps for the execution phase (raw, no XML tags — the compiler adds those)
    - `delivery_steps`: Numbered steps for the delivery phase (raw, no XML tags)
  - Update the JSON parsing to extract new fields from LLM response
  - Update any TypeScript types/interfaces for the generator's output
  - Also update `src/gateway/services/time-estimator.ts` to reference `execution_steps` instead of `instructions` if it reads archetype fields

  **Must NOT do**:
  - Do not generate `system_prompt` or `agents_md` fields
  - Do not include XML tags or IMPORTANT/STOP directives in the generated content — the compiler adds those

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 451-line service with LLM prompt engineering and JSON parsing
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Provides archetype field definitions and patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 9)
  - **Blocks**: Tasks 12, 14
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts` — Full file. Find where `system_prompt` and `agents_md` are generated and replace with new field generation
  - `src/gateway/services/time-estimator.ts` — May reference `instructions` field — rename to `execution_instructions`

  **API/Type References**:
  - `prisma/schema.prisma:184-229` — New archetype field names

  **WHY Each Reference Matters**:
  - Generator is the creation path for new archetypes — must produce the right fields
  - Time estimator may break if it reads old field names

  **Acceptance Criteria**:
  - [ ] Generator produces `identity`, `execution_steps`, `delivery_steps` (not `system_prompt`, `agents_md`)
  - [ ] LLM prompt asks for new field structure
  - [ ] `pnpm build` passes
  - [ ] Time estimator references updated if needed

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Generator output shape correct
    Tool: Bash
    Steps:
      1. Run: `grep -c "system_prompt\|agents_md" src/gateway/services/archetype-generator.ts`
      2. Assert: 0 or only in comments (not in active generation code)
      3. Run: `grep -c "identity\|execution_steps\|delivery_steps" src/gateway/services/archetype-generator.ts`
      4. Assert: Multiple matches (new fields are generated)
    Expected Result: New fields generated, old fields gone
    Failure Indicators: Old field names in active code
    Evidence: .sisyphus/evidence/task-8-generator-fields.txt

  Scenario: Build passes with updated generator
    Tool: Bash
    Steps:
      1. Run: `pnpm build 2>&1 | tail -10`
      2. Assert: Exit code 0
    Expected Result: Clean build
    Failure Indicators: Type errors from field renames
    Evidence: .sisyphus/evidence/task-8-build.txt
  ```

  **Commit**: YES
  - Message: `refactor(generator): produce identity, execution_steps, delivery_steps instead of system_prompt and agents_md`
  - Files: `src/gateway/services/archetype-generator.ts`, `src/gateway/services/time-estimator.ts`
  - Pre-commit: `pnpm build`

- [x] 9. Run data migration + verify

  **What to do**:
  - Run the migration script from Task 4: `npx tsx scripts/migrate-archetypes-to-template.ts`
  - **CRITICAL**: Back up the database FIRST following the mandatory backup protocol in AGENTS.md
  - Review the dry-run output, then run for real
  - Verify all 6 archetypes have populated `identity`, `execution_steps`, `delivery_steps` fields
  - Verify `temperature` is set (1.0 default, 1.5 for inspiration-2-copy)
  - Trigger `daily-real-estate-inspiration-2-copy` once to verify end-to-end with the new harness + compiled AGENTS.md:
    ```bash
    source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2-copy/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq '.task_id'
    ```
  - Wait for task to reach Done, then verify:
    - `compiled_agents_md` is populated on the task row
    - The compiled content matches expected structure (identity → CRITICAL → XML tags → platform rules)
    - Slack message was posted to #victor-tests

  **Must NOT do**:
  - Do not skip the database backup
  - Do not modify the migration script — if issues found, fix in a separate commit

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running an existing script + verification queries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Tasks 4 and 5)
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - AGENTS.md "Database Backup" section — Mandatory backup protocol before any data modification
  - `scripts/migrate-archetypes-to-template.ts` — The migration script from Task 4

  **WHY Each Reference Matters**:
  - Backup protocol is mandatory per AGENTS.md — violating it risks losing learned rules and production data

  **Acceptance Criteria**:
  - [ ] Database backup created in `database-backups/` before migration
  - [ ] All 6 archetypes have non-null `identity`, `execution_steps`, `delivery_steps`
  - [ ] `daily-real-estate-inspiration-2-copy` task reaches Done status
  - [ ] `compiled_agents_md` field populated on the task row
  - [ ] Slack message posted to #victor-tests

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration populates all archetypes
    Tool: Bash
    Preconditions: Backup taken, Tasks 1-5 complete
    Steps:
      1. Run backup: Follow AGENTS.md backup protocol
      2. Run: `npx tsx scripts/migrate-archetypes-to-template.ts --dry-run`
      3. Review output, then run: `npx tsx scripts/migrate-archetypes-to-template.ts`
      4. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name, length(identity) as id_len, length(execution_steps) as exec_len, length(delivery_steps) as del_len, temperature FROM archetypes WHERE deleted_at IS NULL"`
      5. Assert: All 6 rows show non-zero lengths for identity and execution_steps
    Expected Result: All archetypes migrated with populated fields
    Failure Indicators: NULL or zero-length fields
    Evidence: .sisyphus/evidence/task-9-migration-verify.txt

  Scenario: End-to-end task with new compiled AGENTS.md
    Tool: Bash
    Preconditions: Migration done, services running
    Steps:
      1. Trigger: `source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2-copy/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id'`
      2. Wait 120s, then check: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status, length(compiled_agents_md) as cmd_len FROM tasks WHERE id = '<TASK_ID>'"`
      3. Assert: status = 'Done', cmd_len > 0
    Expected Result: Task completes with compiled_agents_md populated
    Failure Indicators: Status not Done, or compiled_agents_md is NULL
    Evidence: .sisyphus/evidence/task-9-e2e-verify.txt
  ```

  **Commit**: NO (data-only change, no code)

---

### Wave 3 — Dashboard + Cleanup

- [x] 10. Dashboard archetype form: new fields

  **What to do**:
  - Update the dashboard's archetype editor to use new fields (`identity`, `execution_steps`, `delivery_steps`, `temperature`) instead of old fields (`system_prompt`, `agents_md`, `instructions`)
  - Files to update:
    - `dashboard/src/lib/types.ts` — Add `identity`, `execution_steps`, `delivery_steps`, `temperature` to `Archetype` interface. Rename `instructions` → `execution_instructions`. Keep `system_prompt` and `agents_md` as optional deprecated fields for now.
    - `dashboard/src/lib/gateway.ts` — Update any PostgREST select queries to include new fields
    - `dashboard/src/panels/employees/sections/PersonalitySection.tsx` — Currently edits `system_prompt`. Replace with `identity` field editor.
    - `dashboard/src/panels/employees/sections/AssignmentSection.tsx` — Currently may reference `instructions`. Update to `execution_instructions` display (read-only since it's a platform constant) or remove if not user-facing.
    - `dashboard/src/panels/employees/sections/DeliveryInstructionsSection.tsx` — Keep as-is for `delivery_instructions` display (platform constant, read-only)
    - `dashboard/src/panels/employees/EmployeeDetail.tsx` — Update field references
    - `dashboard/src/panels/employees/DebugTab.tsx` — Update to show new fields in raw debug view
  - Add new form sections:
    - **Identity** (textarea) — maps to `identity` field
    - **Execution Steps** (textarea with monospace font) — maps to `execution_steps` field
    - **Delivery Steps** (textarea with monospace font) — maps to `delivery_steps` field
    - **Temperature** (number input, 0.0-2.0, step 0.1) — maps to `temperature` field
  - The `execution_instructions` and `delivery_instructions` fields (platform constants) should be shown as read-only expandable sections in the debug tab, NOT in the main form
  - Remove `system_prompt` and `agents_md` from the main edit form (move to debug tab as deprecated read-only)

  **Must NOT do**:
  - Do not expose `execution_instructions` or `delivery_instructions` (platform constants) as editable fields in the main UI
  - Do not delete old fields from the types yet — keep as optional for backward compat
  - Do not break existing dashboard functionality — changes should be additive then swap

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI component changes, form layout, textarea styling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13)
  - **Blocks**: Task 14
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/types.ts:78-113` — Current Archetype interface. Add new fields, rename `instructions`
  - `dashboard/src/panels/employees/sections/PersonalitySection.tsx` — Current `system_prompt` editor. Replace with `identity`
  - `dashboard/src/panels/employees/sections/AssignmentSection.tsx` — May reference `instructions`
  - `dashboard/src/panels/employees/EmployeeDetail.tsx` — Tab layout and field passing
  - `dashboard/src/panels/employees/DebugTab.tsx` — Raw field debug view

  **API/Type References**:
  - `dashboard/src/lib/gateway.ts` — PostgREST query builder. Must select new column names

  **WHY Each Reference Matters**:
  - Types file is the source of truth for what the dashboard expects from the API
  - Each section component handles one aspect of the archetype form
  - Gateway.ts constructs the PostgREST queries — must include new field names

  **Acceptance Criteria**:
  - [ ] Dashboard shows `identity`, `execution_steps`, `delivery_steps`, `temperature` in archetype editor
  - [ ] Old fields (`system_prompt`, `agents_md`) moved to debug tab as read-only
  - [ ] `pnpm dashboard:build` passes
  - [ ] Form saves new field values correctly

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New fields visible in archetype editor
    Tool: Playwright
    Preconditions: Dashboard dev server running at localhost:7701, services running
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees
      2. Select tenant VLRE from dropdown
      3. Click on "daily-real-estate-inspiration-2-copy" employee
      4. Assert: "Identity" textarea is visible with content
      5. Assert: "Execution Steps" textarea is visible with numbered steps
      6. Assert: "Delivery Steps" textarea is visible with numbered steps
      7. Assert: "Temperature" number input is visible with value 1.5
      8. Screenshot the form
    Expected Result: All 4 new fields visible and populated
    Failure Indicators: Missing fields, empty values, or old fields still in main form
    Evidence: .sisyphus/evidence/task-10-form-fields.png

  Scenario: Dashboard builds without errors
    Tool: Bash
    Steps:
      1. Run: `pnpm dashboard:build 2>&1 | tail -10`
      2. Assert: Exit code 0
    Expected Result: Clean dashboard build
    Failure Indicators: TypeScript or build errors
    Evidence: .sisyphus/evidence/task-10-dashboard-build.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): archetype form with identity, execution_steps, delivery_steps, temperature`
  - Files: `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts`, `dashboard/src/panels/employees/**`
  - Pre-commit: `pnpm dashboard:build`

- [x] 11. Dashboard compiled preview + task viewer

  **What to do**:
  - Add a "Compiled AGENTS.md" preview panel to the archetype detail view:
    - Calls the brain-preview API (updated in Task 7) to get the compiled output
    - Shows the full compiled document in a read-only code/markdown viewer
    - This replaces the old "Brain Preview" panel content
  - Add a "Compiled AGENTS.md" viewer to the task detail view:
    - Reads `compiled_agents_md` from the task row
    - Shows the exact AGENTS.md document that was used for that specific task run
    - Helps with debugging — see exactly what the employee saw
  - Update `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx` — currently shows old brain preview format. Update to show compiled output.
  - Update task detail types to include `compiled_agents_md` field

  **Must NOT do**:
  - Do not make the compiled preview editable — it's a read-only computed output
  - Do not remove existing non-AGENTS.md preview functionality (env manifest, etc.)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard panel/viewer component creation, code display styling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 12, 13)
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx` — Current brain preview panel. Update to show compiled output
  - `dashboard/src/lib/types.ts:18-46` — Task interface. Add `compiled_agents_md` field

  **WHY Each Reference Matters**:
  - ProfilePreviewSection is the existing preview component — update rather than replace
  - Task type needs the new field for the viewer

  **Acceptance Criteria**:
  - [ ] Archetype detail shows compiled AGENTS.md preview
  - [ ] Task detail shows compiled AGENTS.md for that run
  - [ ] `pnpm dashboard:build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Compiled preview visible on archetype detail
    Tool: Playwright
    Preconditions: Dashboard and gateway running, archetype has new fields populated
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees
      2. Select VLRE tenant, click daily-real-estate-inspiration-2-copy
      3. Navigate to the preview/brain tab
      4. Assert: Compiled AGENTS.md content is displayed
      5. Assert: Content contains `<execution-instructions>` tag
      6. Screenshot
    Expected Result: Full compiled document visible in preview panel
    Failure Indicators: Empty panel, old format shown, or error displayed
    Evidence: .sisyphus/evidence/task-11-compiled-preview.png

  Scenario: Task detail shows compiled AGENTS.md
    Tool: Playwright
    Preconditions: At least one task exists with compiled_agents_md populated (from Task 9)
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks?tenant=00000000-0000-0000-0000-000000000003
      2. Click on a recent Done task
      3. Find the compiled AGENTS.md viewer section
      4. Assert: Content is non-empty and contains XML tags
      5. Screenshot
    Expected Result: Task-specific compiled document visible
    Failure Indicators: Missing section, empty content, or "null" displayed
    Evidence: .sisyphus/evidence/task-11-task-viewer.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): compiled AGENTS.md preview and task detail viewer`
  - Files: `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx`, `dashboard/src/lib/types.ts`, task detail files
  - Pre-commit: `pnpm dashboard:build`

- [x] 12. Dead code removal + column drops

  **What to do**:
  - **Delete files**:
    - `src/workers/lib/platform-procedures.mts` (62 lines) — now inline in execution_steps
    - `src/workers/lib/tool-reference-generator.mts` (86 lines) — now inline in execution_steps
  - **Gut old function**: Rewrite `src/workers/lib/agents-md-resolver.mts` to just re-export from the new compiler for any remaining references, or delete entirely if no imports remain
  - **Remove all imports** of deleted files across the codebase:
    - `src/workers/opencode-harness.mts` — should already be clean from Task 5
    - `src/gateway/routes/admin-brain-preview.ts` — should already be clean from Task 7
    - Search for any other imports
  - **Prisma column drops**: Create a migration to drop deprecated columns:
    - Drop `system_prompt` from archetypes
    - Drop `agents_md` from archetypes
    - Run `pnpm prisma migrate dev --name drop-deprecated-archetype-fields`
  - **Update dashboard types**: Remove `system_prompt` and `agents_md` from the `Archetype` interface in `dashboard/src/lib/types.ts`
  - **Search and fix**: `grep -r "system_prompt\|\.agents_md" src/ dashboard/` to find any remaining references

  **Must NOT do**:
  - Do not drop `execution_instructions` or `delivery_instructions` — those are the platform constant prompts, still in use
  - Do not delete `prompt-assembler.mts` — still used by harness

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-file cleanup across worker, gateway, and dashboard with a schema migration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 13)
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 5, 7, 8

  **References**:

  **Pattern References**:
  - `src/workers/lib/platform-procedures.mts` — DELETE this file (62 lines)
  - `src/workers/lib/tool-reference-generator.mts` — DELETE this file (86 lines)
  - `src/workers/lib/agents-md-resolver.mts` — DELETE or gut this file (45 lines)

  **WHY Each Reference Matters**:
  - These are the exact files to delete — no ambiguity

  **Acceptance Criteria**:
  - [ ] `platform-procedures.mts` deleted
  - [ ] `tool-reference-generator.mts` deleted
  - [ ] `agents-md-resolver.mts` deleted or gutted
  - [ ] `system_prompt` and `agents_md` columns dropped from DB
  - [ ] `pnpm build` passes
  - [ ] `grep -r "system_prompt" src/ dashboard/` returns 0 active code references

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Deleted files don't exist and no dangling imports
    Tool: Bash
    Steps:
      1. Run: `ls src/workers/lib/platform-procedures.mts src/workers/lib/tool-reference-generator.mts 2>&1`
      2. Assert: Both files not found
      3. Run: `grep -r "platform-procedures\|tool-reference-generator\|agents-md-resolver" src/ dashboard/ --include="*.ts" --include="*.mts" --include="*.tsx" | grep -v "node_modules" | grep -v ".test."`
      4. Assert: 0 import references
    Expected Result: Clean removal with no dangling imports
    Failure Indicators: Files still exist or imports remain
    Evidence: .sisyphus/evidence/task-12-dead-code.txt

  Scenario: Columns dropped from DB
    Tool: Bash
    Steps:
      1. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetypes" | grep -E "system_prompt|agents_md"`
      2. Assert: 0 matches (columns gone)
    Expected Result: Deprecated columns no longer in schema
    Failure Indicators: Columns still present
    Evidence: .sisyphus/evidence/task-12-columns-dropped.txt
  ```

  **Commit**: YES
  - Message: `refactor(cleanup): remove platform-procedures, tool-reference-generator, and deprecated archetype columns`
  - Files: Deleted files, `prisma/schema.prisma`, migration, `dashboard/src/lib/types.ts`
  - Pre-commit: `pnpm build`

- [x] 13. Clear failure_reason on retry success

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find where tasks are retried and transition from Failed back to a running state
  - When a task retries successfully (transitions to Done), clear the `failure_reason` and `failure_code` fields
  - This fixes the issue where stale failure data persists in DB even after a successful retry
  - Use PostgREST PATCH: `{ failure_reason: null, failure_code: null }` when status transitions to Done after having been Failed

  **Must NOT do**:
  - Do not change the retry logic itself — only clear the stale fields
  - Do not clear fields during active retries (only when final status is Done)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small targeted fix in one file
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: Provides lifecycle state machine knowledge for finding the right transition point

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12)
  - **Blocks**: Task 14
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts` — Search for where status transitions to `Done` (the `mark-done` or equivalent step). Add `failure_reason: null, failure_code: null` to the PATCH.

  **WHY Each Reference Matters**:
  - The lifecycle file is where all state transitions happen — the fix goes exactly where status becomes Done

  **Acceptance Criteria**:
  - [ ] When a task reaches Done after being Failed, `failure_reason` and `failure_code` are null
  - [ ] `pnpm build` passes
  - [ ] Existing lifecycle tests still pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stale failure fields cleared on Done
    Tool: Bash
    Preconditions: Services running
    Steps:
      1. Find a task that was previously Failed but retried to Done (from stress test data): `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, status, failure_reason, failure_code FROM tasks WHERE status = 'Done' AND failure_reason IS NOT NULL LIMIT 1"`
      2. If such a task exists, this proves the issue is real. After fix + new task run, verify:
      3. Trigger a new task, wait for Done
      4. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT failure_reason, failure_code FROM tasks WHERE id = '<TASK_ID>'"`
      5. Assert: Both fields are NULL
    Expected Result: No stale failure data on Done tasks
    Failure Indicators: Non-null failure_reason on a Done task
    Evidence: .sisyphus/evidence/task-13-failure-cleared.txt
  ```

  **Commit**: YES
  - Message: `fix(lifecycle): clear failure_reason and failure_code when task retries to Done`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

### Wave 4 — Verification

- [x] 14. Build + test suite pass

  **What to do**:
  - Run `pnpm build` and fix any TypeScript errors
  - Run `pnpm test -- --run` and fix any test failures caused by the migration
  - Common expected failures:
    - Tests referencing `instructions` field → rename to `execution_instructions`
    - Tests importing `resolveAgentsMd`, `generatePlatformProcedures`, `generateToolReference` → update imports
    - Tests referencing `system_prompt` or `agents_md` fields → update to new fields
    - Snapshot tests with old field names → update snapshots
  - Fix ALL failures. Do not skip or mark as pre-existing unless they were already listed in AGENTS.md "Pre-existing Test Failures"

  **Must NOT do**:
  - Do not skip tests with `.skip` — fix them
  - Do not change pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Build/test fix-up, likely small adjustments across files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after all Wave 1-3 tasks)
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 5-13

  **References**:

  **Pattern References**:
  - AGENTS.md "Pre-existing Test Failures" — Two known failures to ignore

  **Acceptance Criteria**:
  - [ ] `pnpm build` exits 0
  - [ ] `pnpm test -- --run` passes (same counts as before, minus the 2 pre-existing)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build and test pass
    Tool: Bash
    Steps:
      1. Run: `pnpm build 2>&1 | tail -5`
      2. Assert: Exit code 0
      3. Run: `pnpm test -- --run 2>&1 | tail -20`
      4. Assert: 0 failures (expect same pass/skip counts as baseline)
    Expected Result: Clean build and test suite
    Failure Indicators: Any non-zero exit code
    Evidence: .sisyphus/evidence/task-14-build-test.txt
  ```

  **Commit**: YES (if fixes were needed)
  - Message: `fix(tests): update test suite for template compilation field renames`
  - Files: Affected test files
  - Pre-commit: `pnpm test -- --run`

- [x] 15. Stress test: 20 runs, concurrency 5

  **What to do**:
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Run stress test: `npx tsx scripts/stress-test.ts --count 20 --concurrency 5`
  - Target: ≥95% pass rate (18/20 minimum)
  - If failures occur:
    1. Check if they're transient (task eventually reached Done after polling gap)
    2. Check `compiled_agents_md` on failed tasks for structural issues
    3. Check logs for tag bleed, narration-only, or missing submit-output patterns
    4. Fix root causes and re-run if needed
  - Save stress test results JSON to `.sisyphus/evidence/task-15-stress-test.json`

  **Must NOT do**:
  - Do not skip this test — it's the primary validation of the entire migration
  - Do not accept < 95% without root cause analysis

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: May require debugging failures, root cause analysis, and potential fixes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Tasks 9 and 14)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 9, 14

  **References**:

  **Pattern References**:
  - `scripts/stress-test.ts` — The stress test harness
  - Previous stress test results in handoff context — Compare against Stress #6 (20/20 with compiled format)

  **Acceptance Criteria**:
  - [x] 20-run stress test completes
  - [x] ≥95% pass rate (18+ out of 20)
  - [x] Results JSON saved to evidence directory

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stress test passes at ≥95%
    Tool: Bash (tmux for long-running)
    Preconditions: Docker image rebuilt, services running
    Steps:
      1. Run: `docker build -t ai-employee-worker:latest .`
      2. Run in tmux: `npx tsx scripts/stress-test.ts --count 20 --concurrency 5 2>&1 | tee /tmp/stress-test-final.log`
      3. Wait for completion (check log for final summary)
      4. Assert: Pass rate ≥ 95%
      5. Copy results: `cp /tmp/stress-test-*.json .sisyphus/evidence/task-15-stress-test.json`
    Expected Result: ≥18/20 tasks pass
    Failure Indicators: Pass rate < 95% or stress test crashes
    Evidence: .sisyphus/evidence/task-15-stress-test.json
  ```

  **Commit**: NO (evidence only)

- [x] 16. AGENTS.md + docs update

  **What to do**:
  - Update `AGENTS.md` to reflect the template compilation architecture:
    - Replace references to 7-layer assembly with template compiler
    - Update "OpenCode Worker" section to describe the new compilation flow
    - Document new archetype fields: `identity`, `execution_steps`, `delivery_steps`, `temperature`
    - Document the field rename: `instructions` → `execution_instructions`
    - Remove references to `system_prompt` and `agents_md` fields (dropped)
    - Remove references to `platform-procedures.mts` and `tool-reference-generator.mts` (deleted)
    - Add `agents-md-compiler.mts` to the project structure description
    - Update the "Adding a New Employee" section with new field names
  - Update `README.md` if any npm scripts, architecture descriptions, or infrastructure notes changed
  - Per AGENTS.md "Documentation Freshness": this is MANDATORY when adding/removing/renaming components

  **Must NOT do**:
  - Do not bloat AGENTS.md — keep it concise per the existing convention
  - Do not duplicate information from the architecture docs

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation update requiring precise technical writing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 14)
  - **Blocks**: F1
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Full file. Multiple sections need updating (see "What to do" for specific sections)
  - `README.md` — Check if any changes affect documented workflows

  **WHY Each Reference Matters**:
  - AGENTS.md is injected into every LLM call — stale references cause agent confusion

  **Acceptance Criteria**:
  - [x] AGENTS.md has no references to `system_prompt` field, `agents_md` field, `platform-procedures.mts`, or `tool-reference-generator.mts`
  - [x] New fields documented in archetype section
  - [x] `agents-md-compiler.mts` mentioned in project structure

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No stale references in AGENTS.md
    Tool: Bash
    Steps:
      1. Run: `grep -c "platform-procedures\|tool-reference-generator" AGENTS.md`
      2. Assert: 0
      3. Run: `grep -c "system_prompt" AGENTS.md`
      4. Assert: 0 (or only in context of "dropped" / historical reference)
      5. Run: `grep -c "identity\|execution_steps\|delivery_steps\|temperature" AGENTS.md`
      6. Assert: > 0 (new fields documented)
    Expected Result: Docs reflect current architecture
    Failure Indicators: Stale references or missing new field documentation
    Evidence: .sisyphus/evidence/task-16-docs-check.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md and README for template compilation architecture`
  - Files: `AGENTS.md`, `README.md`
  - Pre-commit: None

- [x] 17. Telegram notification

  **What to do**:
  - Send Telegram notification that the plan is complete:
    ```bash
    npx tsx scripts/telegram-notify.ts "✅ agents-md-template-compilation complete — All tasks done. Come back to review results."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Final (after Task 15)
  - **Blocks**: None
  - **Blocked By**: Task 15

  **References**: None needed

  **Acceptance Criteria**:
  - [x] Telegram notification sent successfully

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Notification sent
    Tool: Bash
    Steps:
      1. Run: `npx tsx scripts/telegram-notify.ts "✅ agents-md-template-compilation complete — All tasks done. Come back to review results."`
      2. Assert: Exit code 0
    Expected Result: Telegram message delivered
    Failure Indicators: Non-zero exit code or error output
    Evidence: .sisyphus/evidence/task-17-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify no hardcoded temperature in harness. Verify `resolveAgentsMd` has zero imports remaining.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Trigger `daily-real-estate-inspiration-2-copy` via curl. Verify task reaches Done. Check `compiled_agents_md` field is populated in DB. Open dashboard, navigate to archetype editor — verify new fields visible, old fields gone. Open task detail — verify compiled AGENTS.md viewer works. Run brain-preview API — verify new structure returned.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                                                           | Key Files                                     |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1    | `feat(schema): add identity, execution_steps, delivery_steps, temperature to archetypes` | `prisma/schema.prisma`, migration files       |
| 1    | `feat(schema): add compiled_agents_md to tasks`                                          | `prisma/schema.prisma`, migration files       |
| 1    | `feat(compiler): add template-based compileAgentsMd`                                     | `src/workers/lib/agents-md-compiler.mts`      |
| 1    | `feat(migration): add archetype data migration script`                                   | `scripts/migrate-archetypes.ts`               |
| 2    | `refactor(harness): use template compiler for both execution and delivery`               | `src/workers/opencode-harness.mts`            |
| 2    | `refactor(brain-preview): use template compiler`                                         | `src/gateway/routes/admin-brain-preview.ts`   |
| 2    | `refactor(generator): produce new archetype field structure`                             | `src/gateway/services/archetype-generator.ts` |
| 3    | `feat(dashboard): archetype form with identity, steps, and live preview`                 | `dashboard/src/panels/employees/**`           |
| 3    | `feat(dashboard): compiled AGENTS.md viewer on task detail`                              | `dashboard/src/panels/tasks/**`               |
| 3    | `refactor(cleanup): remove platform-procedures, tool-reference-generator, old fields`    | multiple files                                |
| 4    | `docs: update AGENTS.md for template compilation architecture`                           | `AGENTS.md`                                   |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: 0 errors
pnpm test -- --run            # Expected: all pass
npx tsx scripts/stress-test.ts --count 20 --concurrency 5  # Expected: ≥95% pass rate
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Stress test ≥95%
- [ ] All 6 archetypes migrated
- [ ] Old columns dropped
- [ ] Dashboard shows new fields
- [ ] Task detail shows compiled AGENTS.md
