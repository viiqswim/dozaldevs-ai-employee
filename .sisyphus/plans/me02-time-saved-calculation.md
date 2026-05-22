# ME-02: Time Saved Calculation

## TL;DR

> **Quick Summary**: Add per-archetype "estimated manual minutes" via Claude Haiku estimation, snapshot the value into a `task_metrics` table on task completion, and surface aggregated time-saved stats in the dashboard (employee detail + task feed header).
>
> **Deliverables**:
>
> - Prisma migration: `estimated_manual_minutes` + `estimated_manual_minutes_override` on `archetypes`, new `task_metrics` table
> - `TimeEstimator` service calling Claude Haiku to estimate manual minutes from archetype context
> - Archetype create/update routes trigger estimation (only on content field changes)
> - `ArchetypeGenerator` includes estimate in generated output
> - Lifecycle snapshots effective estimate into `task_metrics` on task completion
> - Dashboard: PM override field in CompactSettingsGrid, per-employee StatCard, tenant-wide banner in TaskFeed
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (migration) → Task 2 (service) → Tasks 3–5 (routes + lifecycle) → Tasks 6–9 (dashboard + tests)

---

## Context

### Original Request

ME-02 from the Phase 1 Story Map: Calculate time saved by AI employees. Originally spec'd as per-property/per-employee/per-period with configurable defaults. Simplified to: one-time Haiku estimate per archetype, snapshotted on each task completion for historical accuracy.

### Interview Summary

**Key Discussions**:

- Haiku estimates once per archetype (not per task execution) — called on create/update of content fields
- Two-field approach: `estimated_manual_minutes` (Haiku-set) + `estimated_manual_minutes_override` (PM-set)
- Effective estimate = override if set, else Haiku default
- `task_metrics` table snapshots the effective estimate when a task reaches Done — preserves historical accuracy if estimates change
- Display in employee detail (per-employee total) and task feed header (tenant-wide total)

**Research Findings**:

- `ArchetypeGenerator` (`src/gateway/services/archetype-generator.ts`) is the pattern to follow for Haiku calls — uses `callLLM` with `'anthropic/claude-haiku-4-5'`, `taskType: 'review'`
- `CompactSettingsGrid.tsx` is where PM-editable archetype settings live — natural home for override field
- `StatCard` is a file-local component in `TaskDetail.tsx` — needs extraction to shared component
- Lifecycle has multiple paths to Done — all need the metrics snapshot step
- PostgREST is the data fetch layer for the dashboard; gateway API for writes

### Metis Review

**Identified Gaps** (addressed):

- Sync vs async Haiku call → Synchronous (fast ~500ms, only on content field changes)
- One field vs two → Two fields for clean audit trail and "reset to AI estimate" capability
- `taskType` for estimation → Use `'review'` (closest semantic fit, negligible cost impact)
- Re-estimate trigger scope → Only when `instructions`, `role_name`, `system_prompt`, or `deliverable_type` change
- Haiku failure handling → Silent failure (set null, log warning, never fail archetype save)
- Override persistence on re-estimate → Two-field approach solves this — Haiku overwrites its field, PM override stays untouched
- PM validation bounds → Min 1, max 1440 (24 hours)

---

## Work Objectives

### Core Objective

Enable the platform to track and display how much time AI employees save PMs, using Claude Haiku to estimate manual task duration and snapshotting that value on each task completion for historical accuracy.

### Concrete Deliverables

- `prisma/migrations/*/migration.sql` — adds two columns to `archetypes` + new `task_metrics` table
- `src/gateway/services/time-estimator.ts` — `TimeEstimator` service
- `src/gateway/services/__tests__/time-estimator.test.ts` — unit tests
- Modified `src/gateway/routes/admin-archetypes.ts` — estimation on create/update
- Modified `src/gateway/services/archetype-generator.ts` — includes estimate in output
- Modified `src/inngest/employee-lifecycle.ts` — snapshots metric on Done
- `dashboard/src/components/ui/stat-card.tsx` — extracted shared StatCard
- Modified `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx` — PM override field
- Modified `dashboard/src/panels/employees/sections/ActivitySection.tsx` — per-employee time saved
- Modified `dashboard/src/panels/tasks/TaskFeed.tsx` — tenant-wide time saved banner
- Modified `dashboard/src/lib/types.ts` — updated Archetype type

### Definition of Done

- [ ] `pnpm test -- --run` passes (1490+ tests, 0 failures)
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] Creating an archetype via API returns `estimated_manual_minutes` as an integer (or null on Haiku failure)
- [ ] Updating archetype `instructions` triggers re-estimation; updating `notification_channel` does not
- [ ] PM can override via dashboard; override persists across re-estimations
- [ ] Completed tasks create `task_metrics` records with snapshotted `minutes_saved`
- [ ] Employee detail shows per-employee "X hours saved" stat
- [ ] Task feed shows tenant-wide "Total time saved" banner

### Must Have

- Two separate fields: `estimated_manual_minutes` (Haiku) and `estimated_manual_minutes_override` (PM)
- `task_metrics` table with snapshotted `minutes_saved` per completed task
- Silent Haiku failure (null, never crash archetype save)
- Re-estimation only on content field changes
- PM override validation: min 1, max 1440

### Must NOT Have (Guardrails)

- Charts, trend lines, or time-series displays — StatCard only
- Per-property aggregation — tenant-wide and per-employee only
- Separate analytics/metrics dashboard page
- Changes to `callLLM`'s `taskType` union — use `'review'`
- Haiku prompt with confidence scores, ranges, or explanations — return integer only
- Seed data updates — existing archetypes get null, backfill via API/dashboard
- Any touching of deprecated files (`src/inngest/lifecycle.ts`, `src/workers/generic-harness.mts`, etc.)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **Library/Module**: Use Bash (bun/node REPL) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Prisma migration (new columns + task_metrics table) [quick]
├── Task 2: TimeEstimator service + unit tests [deep]
└── Task 3: Extract StatCard to shared component [quick]

Wave 2 (After Wave 1 — integration, MAX PARALLEL):
├── Task 4: Archetype routes integration (create + PATCH + re-estimation logic) [unspecified-high]
├── Task 5: ArchetypeGenerator integration [quick]
├── Task 6: Lifecycle metrics snapshot on Done [deep]
├── Task 7: Dashboard types + PM override in CompactSettingsGrid [visual-engineering]
└── Task 8: Dashboard time-saved displays (employee detail + task feed header) [visual-engineering]

Wave 3 (After Wave 2 — integration tests):
├── Task 9: Integration tests (route + lifecycle) [unspecified-high]
└── Task 10: AGENTS.md + docs update + Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On    | Blocks           | Wave |
| ---- | ------------- | ---------------- | ---- |
| 1    | —             | 4, 5, 6, 7, 8, 9 | 1    |
| 2    | —             | 4, 5, 9          | 1    |
| 3    | —             | 8                | 1    |
| 4    | 1, 2          | 9                | 2    |
| 5    | 1, 2          | 9                | 2    |
| 6    | 1             | 9                | 2    |
| 7    | 1             | 9                | 2    |
| 8    | 1, 3          | 9                | 2    |
| 9    | 4, 5, 6, 7, 8 | 10               | 3    |
| 10   | 9             | F1–F4            | 3    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `deep`, T3 `quick`
- **Wave 2**: 5 tasks — T4 `unspecified-high`, T5 `quick`, T6 `deep`, T7 `visual-engineering`, T8 `visual-engineering`
- **Wave 3**: 2 tasks — T9 `unspecified-high`, T10 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Prisma Migration — Add estimation columns + task_metrics table

  **What to do**:
  - Add two new nullable columns to `archetypes` table:
    - `estimated_manual_minutes Int?` — Haiku-generated estimate
    - `estimated_manual_minutes_override Int?` — PM override value
  - Create new `task_metrics` table:

    ```
    TaskMetric {
      id            String   @id @default(uuid()) @db.Uuid
      task_id       String   @db.Uuid
      archetype_id  String   @db.Uuid
      tenant_id     String   @db.Uuid
      minutes_saved Int      // snapshotted effective estimate at time of task completion
      created_at    DateTime @default(now())
    }
    ```

    - Add `@@map("task_metrics")`, add FK relations to Task and Archetype
    - Add index on `(tenant_id, archetype_id)` for aggregation queries
    - Add index on `(task_id)` unique constraint (one metric per task)

  - Run `pnpm prisma migrate dev --name add_time_estimation_and_task_metrics`
  - Run `pnpm prisma generate` to update client

  **Must NOT do**:
  - Do not update seed data with hardcoded estimates
  - Do not add any columns to the `tasks` table

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single migration file + schema update, straightforward
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Not creating an archetype, just modifying the schema

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 8, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:183-225` — Current Archetype model — add new fields after `deleted_at` (line 211), before relations block (line 213)
  - `prisma/schema.prisma:20-55` — Task model — reference for FK pattern to task_metrics
  - `prisma/migrations/` — Existing migration files — follow naming convention

  **API/Type References**:
  - `prisma/schema.prisma:183-225` — Archetype model — exact location for new columns
  - `prisma/schema.prisma:107-130` — FeedbackEvent model — example of a table with tenant_id + archetype_id FKs and @@map

  **WHY Each Reference Matters**:
  - The Archetype model shows exactly where to insert the new columns and the relation block pattern
  - FeedbackEvent shows the correct FK and @@map pattern for tenant-scoped tables

  **Acceptance Criteria**:
  - [ ] `pnpm prisma migrate dev` succeeds without errors
  - [ ] `pnpm prisma generate` succeeds
  - [ ] `pnpm build` succeeds
  - [ ] `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetypes"` shows `estimated_manual_minutes` and `estimated_manual_minutes_override` columns
  - [ ] `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d task_metrics"` shows all expected columns

  **QA Scenarios**:

  ```
  Scenario: Migration creates expected columns on archetypes
    Tool: Bash (psql)
    Preconditions: Migration has been run
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetypes"
      2. Assert output contains "estimated_manual_minutes" with type "integer"
      3. Assert output contains "estimated_manual_minutes_override" with type "integer"
    Expected Result: Both columns present, both nullable
    Failure Indicators: Column not found in output
    Evidence: .sisyphus/evidence/task-1-archetypes-columns.txt

  Scenario: Migration creates task_metrics table with correct schema
    Tool: Bash (psql)
    Preconditions: Migration has been run
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d task_metrics"
      2. Assert columns: id (uuid), task_id (uuid), archetype_id (uuid), tenant_id (uuid), minutes_saved (integer), created_at (timestamp)
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\di" | grep task_metrics
      4. Assert unique index on task_id exists
    Expected Result: Table exists with all columns and correct types, unique index on task_id
    Failure Indicators: Table not found, missing columns, missing index
    Evidence: .sisyphus/evidence/task-1-task-metrics-schema.txt

  Scenario: Existing data is unaffected (null defaults)
    Tool: Bash (psql)
    Preconditions: Migration has been run, existing archetypes exist
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, estimated_manual_minutes, estimated_manual_minutes_override FROM archetypes LIMIT 5;"
      2. Assert all existing rows have NULL for both new columns
    Expected Result: All existing archetypes have null estimates
    Failure Indicators: Non-null values on existing rows
    Evidence: .sisyphus/evidence/task-1-existing-data-null.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add estimated_manual_minutes and task_metrics table`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
  - Pre-commit: `pnpm build`

- [x] 2. TimeEstimator Service + Unit Tests

  **What to do**:
  - Create `src/gateway/services/time-estimator.ts`:
    - Export class `TimeEstimator` with constructor accepting `callLLMFn: typeof callLLM`
    - Method: `async estimate(archetype: { role_name: string | null; instructions: string | null; system_prompt: string | null; deliverable_type: string | null; agents_md: string | null }): Promise<number | null>`
    - Prompt: minimal, deterministic — instruct Haiku to return ONLY a single integer (minutes) representing how long a human would take to manually perform this task once
    - Include in prompt: role_name, instructions, deliverable_type. Exclude: agents_md (too long, internal)
    - Parse response: extract first integer from response string. If no valid integer found, return null.
    - Wrap entire call in try/catch — on ANY error (timeout, 429, circuit breaker, parse failure), log warning and return null
    - Use `callLLM({ model: 'anthropic/claude-haiku-4-5', taskType: 'review', temperature: 0, maxTokens: 50, messages: [...] })`
  - Export helper: `shouldReEstimate(changedFields: string[]): boolean` — returns true if any of `['instructions', 'role_name', 'system_prompt', 'deliverable_type']` are in the changed fields array
  - Export helper: `getEffectiveEstimate(archetype: { estimated_manual_minutes: number | null; estimated_manual_minutes_override: number | null }): number | null` — returns override if set, else Haiku default
  - Create `src/gateway/services/__tests__/time-estimator.test.ts`:
    - Test: mock `callLLM` returning `"15"` → service returns `15`
    - Test: mock `callLLM` returning `"About 15-20 minutes"` → service extracts `15`
    - Test: mock `callLLM` returning `"I cannot estimate"` → service returns `null`
    - Test: mock `callLLM` throwing error → service returns `null`
    - Test: `shouldReEstimate(['instructions'])` → `true`
    - Test: `shouldReEstimate(['notification_channel'])` → `false`
    - Test: `shouldReEstimate(['instructions', 'notification_channel'])` → `true`
    - Test: `getEffectiveEstimate({ estimated_manual_minutes: 10, estimated_manual_minutes_override: 25 })` → `25`
    - Test: `getEffectiveEstimate({ estimated_manual_minutes: 10, estimated_manual_minutes_override: null })` → `10`
    - Test: `getEffectiveEstimate({ estimated_manual_minutes: null, estimated_manual_minutes_override: null })` → `null`

  **Must NOT do**:
  - Do not add a new `taskType` to `callLLM` — use `'review'`
  - Do not include confidence scores, reasoning, or ranges in the prompt
  - Do not let Haiku failure propagate — always catch and return null

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Service with LLM integration, parsing logic, multiple helper functions, and comprehensive unit tests
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: This is a gateway service, not a shell tool

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts:255-306` — `ArchetypeGenerator.generate()` — follow this exact pattern for constructor injection of `callLLM`, model selection, error handling, and `stripFences` for response cleaning
  - `src/gateway/services/__tests__/archetype-generator.test.ts` — test pattern for mocking `callLLM`

  **API/Type References**:
  - `src/lib/call-llm.ts` — `callLLM` function signature, `CallLLMOptions` and `CallLLMResult` types
  - `prisma/schema.prisma:183-225` — Archetype model fields that will be passed to the estimator

  **External References**:
  - AGENTS.md § "Approved LLM Models" — confirms `anthropic/claude-haiku-4-5` for verification/judge calls

  **WHY Each Reference Matters**:
  - `ArchetypeGenerator` is the gold standard for how to call Haiku in this codebase — same constructor injection pattern, same error handling, same `taskType: 'review'`
  - `call-llm.ts` defines the exact interface and cost circuit breaker behavior

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run src/gateway/services/__tests__/time-estimator.test.ts` → all tests pass
  - [ ] `TimeEstimator.estimate()` returns integer on valid response, null on invalid/error
  - [ ] `shouldReEstimate()` correctly identifies content fields vs non-content fields
  - [ ] `getEffectiveEstimate()` correctly applies override precedence

  **QA Scenarios**:

  ```
  Scenario: Unit tests all pass
    Tool: Bash
    Preconditions: Service and test files exist
    Steps:
      1. Run: pnpm test -- --run src/gateway/services/__tests__/time-estimator.test.ts
      2. Assert exit code 0
      3. Assert output contains "10 passed" (or equivalent count for all test cases)
    Expected Result: All 10 unit tests pass
    Failure Indicators: Any test failure, non-zero exit code
    Evidence: .sisyphus/evidence/task-2-unit-tests.txt

  Scenario: Haiku prompt is minimal (no verbose explanation requests)
    Tool: Bash (grep)
    Preconditions: time-estimator.ts exists
    Steps:
      1. Read src/gateway/services/time-estimator.ts
      2. Find the prompt string sent to Haiku
      3. Assert prompt does NOT contain words like "explain", "reasoning", "confidence", "range"
      4. Assert prompt instructs Haiku to return only a single integer
    Expected Result: Prompt is minimal, asks for integer only
    Failure Indicators: Verbose prompt requesting explanation or confidence
    Evidence: .sisyphus/evidence/task-2-prompt-check.txt
  ```

  **Commit**: YES
  - Message: `feat(services): add TimeEstimator service for Haiku time estimation`
  - Files: `src/gateway/services/time-estimator.ts`, `src/gateway/services/__tests__/time-estimator.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Extract StatCard to Shared Dashboard Component

  **What to do**:
  - Extract the `StatCard` component from `dashboard/src/panels/tasks/TaskDetail.tsx` into `dashboard/src/components/ui/stat-card.tsx`
  - Props: `{ label: string; value: string | number; icon?: ReactNode; className?: string }`
  - Update `TaskDetail.tsx` to import from the new shared location
  - Ensure the existing Execution Metrics section in TaskDetail still renders identically

  **Must NOT do**:
  - Do not change the visual design of the existing StatCard
  - Do not add new features (charts, icons) — just extract

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple extract-and-import refactor, one source → one shared component
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/TaskDetail.tsx:177-184` — Current inline StatCard component — extract this exact component
  - `dashboard/src/components/ui/searchable-select.tsx` — Example of a shared UI component in the `components/ui/` directory — follow same file structure and export pattern

  **WHY Each Reference Matters**:
  - TaskDetail contains the component to extract — need the exact implementation
  - searchable-select shows the canonical structure for shared UI components in this project

  **Acceptance Criteria**:
  - [ ] `dashboard/src/components/ui/stat-card.tsx` exists with exported `StatCard` component
  - [ ] `TaskDetail.tsx` imports `StatCard` from `@/components/ui/stat-card`
  - [ ] `pnpm build` succeeds
  - [ ] TaskDetail Execution Metrics section renders identically (visual regression check)

  **QA Scenarios**:

  ```
  Scenario: StatCard renders correctly in TaskDetail
    Tool: Playwright
    Preconditions: Dashboard dev server running at localhost:7701, at least one completed task exists
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks
      2. Click first task row to open TaskDetail
      3. Scroll to "Execution Metrics" section
      4. Assert element with text "Tokens" exists (first StatCard)
      5. Assert element with text "Cost" exists (second StatCard)
      6. Take screenshot of the Execution Metrics section
    Expected Result: StatCards render with label + value format, same as before extraction
    Failure Indicators: Missing StatCards, blank values, broken layout
    Evidence: .sisyphus/evidence/task-3-statcard-render.png
  ```

  **Commit**: YES
  - Message: `refactor(dashboard): extract StatCard to shared component`
  - Files: `dashboard/src/components/ui/stat-card.tsx`, `dashboard/src/panels/tasks/TaskDetail.tsx`
  - Pre-commit: `pnpm build`

- [x] 4. Integrate Time Estimation into Archetype Create/Update Routes

  **What to do**:
  - In `src/gateway/routes/admin-archetypes.ts`:
    - Import `TimeEstimator` from `../services/time-estimator.js` and `callLLM` from `../../lib/call-llm.js`
    - Instantiate `const estimator = new TimeEstimator(callLLM)` at router creation
    - **POST (create) handler**: After `prisma.archetype.create()`, call `estimator.estimate()` with the archetype data. If result is not null, update the archetype with `estimated_manual_minutes`. Return the updated archetype. The estimate call is best-effort — if it fails, the archetype is still created with null.
    - **PATCH (update) handler**: Import `shouldReEstimate`. Check if any content field changed by comparing `bodyResult.data` keys against the re-estimation trigger list. If yes, call `estimator.estimate()` and update `estimated_manual_minutes` (do NOT touch `estimated_manual_minutes_override`). Include estimate in the response.
  - Add `estimated_manual_minutes_override` to `PatchArchetypeBodySchema`:
    - `estimated_manual_minutes_override: z.number().int().min(1).max(1440).nullable().optional()`
  - Handle the override in the PATCH handler — pass it through to Prisma update like other fields
  - Update existing tests in `src/gateway/routes/__tests__/admin-archetypes.test.ts` if they break due to schema changes
  - Add new test cases for estimation behavior

  **Must NOT do**:
  - Do not make Haiku failure crash the create/update — wrap in try/catch
  - Do not re-estimate when only non-content fields change (notification_channel, concurrency_limit, etc.)
  - Do not touch the override value when Haiku re-estimates

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Modifies critical admin routes with careful error handling, conditional logic, and test updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-archetypes.ts:161-219` — POST create handler — add estimation call after `prisma.archetype.create()` (line 186-206)
  - `src/gateway/routes/admin-archetypes.ts:267-356` — PATCH update handler — add conditional re-estimation after `prisma.archetype.update()` (line 321-348)
  - `src/gateway/routes/admin-archetypes.ts:43-75` — `PatchArchetypeBodySchema` — add `estimated_manual_minutes_override` field here
  - `src/gateway/routes/admin-archetypes.ts:77-108` — `CreateArchetypeBodySchema` — do NOT add estimate field here (Haiku generates it)

  **API/Type References**:
  - `src/gateway/services/time-estimator.ts` — `TimeEstimator`, `shouldReEstimate`, `getEffectiveEstimate` (created in Task 2)
  - `src/lib/call-llm.ts` — `callLLM` import for constructor injection

  **Test References**:
  - `src/gateway/routes/__tests__/admin-archetypes.test.ts` — Existing create/update tests — update if schema changes break them
  - `src/gateway/routes/__tests__/admin-archetypes-create.test.ts` — Create-specific tests

  **WHY Each Reference Matters**:
  - The create handler is where the initial Haiku estimation fires — need exact line numbers to know where to add the call
  - The PATCH handler needs conditional re-estimation logic — must understand the existing update flow
  - The Zod schemas need the new override field for PM input

  **Acceptance Criteria**:
  - [ ] POST create returns archetype with `estimated_manual_minutes` populated (integer or null)
  - [ ] PATCH with `instructions` change triggers re-estimation
  - [ ] PATCH with only `notification_channel` change does NOT trigger re-estimation
  - [ ] PATCH with `estimated_manual_minutes_override: 25` persists the override
  - [ ] PATCH with `estimated_manual_minutes_override: null` clears the override
  - [ ] PATCH with `estimated_manual_minutes_override: 0` returns 400 validation error
  - [ ] Haiku failure during create still creates the archetype (null estimate)
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: Create archetype returns Haiku estimate
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700, ADMIN_API_KEY set
    Steps:
      1. Run: curl -s -X POST http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/archetypes -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"role_name":"test-time-est","model":"minimax/minimax-m2.7","runtime":"opencode","instructions":"Read all Slack channels and compile a daily digest summary of key conversations.","agents_md":"You are a summarizer.","notification_channel":"C123"}'
      2. Parse response JSON
      3. Assert response.estimated_manual_minutes is an integer > 0 OR null (Haiku failure is acceptable)
      4. Assert response.estimated_manual_minutes_override is null
    Expected Result: Archetype created with estimated_manual_minutes populated
    Failure Indicators: 500 error, archetype not created, field missing from response
    Evidence: .sisyphus/evidence/task-4-create-with-estimate.json

  Scenario: PATCH with instructions triggers re-estimation
    Tool: Bash (curl)
    Preconditions: Archetype from previous scenario exists
    Steps:
      1. Run: curl -s -X PATCH http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/archetypes/$ARCHETYPE_ID -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"instructions":"Completely new instructions: monitor Jira tickets and create weekly reports."}'
      2. Assert response.estimated_manual_minutes is an integer (may differ from original)
    Expected Result: Re-estimation occurred, new value returned
    Failure Indicators: Same value as before (unlikely with different instructions), 500 error
    Evidence: .sisyphus/evidence/task-4-patch-reestimate.json

  Scenario: PATCH with non-content field does NOT trigger re-estimation
    Tool: Bash (curl)
    Preconditions: Archetype exists with known estimated_manual_minutes value
    Steps:
      1. Note current estimated_manual_minutes value
      2. Run: curl -s -X PATCH ... -d '{"notification_channel":"C456"}'
      3. Assert response.estimated_manual_minutes equals the previous value (unchanged)
    Expected Result: Estimate unchanged when only notification_channel changes
    Failure Indicators: Different estimate value
    Evidence: .sisyphus/evidence/task-4-patch-no-reestimate.json

  Scenario: PM override validation rejects 0
    Tool: Bash (curl)
    Preconditions: Archetype exists
    Steps:
      1. Run: curl -s -X PATCH ... -d '{"estimated_manual_minutes_override":0}'
      2. Assert HTTP 400 response
      3. Assert response contains "INVALID_REQUEST" error
    Expected Result: 400 validation error
    Failure Indicators: 200 success, override set to 0
    Evidence: .sisyphus/evidence/task-4-override-validation.json
  ```

  **Commit**: YES
  - Message: `feat(routes): integrate time estimation into archetype create/update`
  - Files: `src/gateway/routes/admin-archetypes.ts`, `src/gateway/routes/__tests__/admin-archetypes.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. ArchetypeGenerator Integration — Include Estimate in Generated Output

  **What to do**:
  - In `src/gateway/services/archetype-generator.ts`:
    - Add `estimated_manual_minutes: number | null` to `GenerateArchetypeResponse` interface
    - In the `generate()` method: after `postProcess()` and model recommendation, call `TimeEstimator.estimate()` with the generated archetype data. Set `result.estimated_manual_minutes`.
    - In the `refine()` method: same — call estimator after processing. The estimate may change if instructions change.
    - The `ArchetypeGenerator` constructor already accepts `callLLMFn` — create the `TimeEstimator` instance internally using the same `callLLMFn`
  - Update `src/gateway/services/__tests__/archetype-generator.test.ts`:
    - Update existing tests to account for the new field in the response
    - Add test: generated archetype includes `estimated_manual_minutes`
    - Add test: Haiku failure for estimation doesn't fail the overall generate

  **Must NOT do**:
  - Do not add a second Haiku call in the prompt — the estimation is a separate call, not part of the generation prompt
  - Do not block archetype generation if estimation fails

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small addition to existing class — add one field to interface, two lines to each method, update tests
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts:11-44` — `GenerateArchetypeResponse` interface — add `estimated_manual_minutes` field
  - `src/gateway/services/archetype-generator.ts:258-306` — `generate()` method — add estimation call after line 285 (after `postProcess`)
  - `src/gateway/services/archetype-generator.ts:308-368` — `refine()` method — add estimation call after line 347 (after `postProcess`)

  **API/Type References**:
  - `src/gateway/services/time-estimator.ts` — `TimeEstimator` class (created in Task 2)

  **Test References**:
  - `src/gateway/services/__tests__/archetype-generator.test.ts` — Existing tests — update to expect new field

  **WHY Each Reference Matters**:
  - The generate/refine methods are the exact insertion points for the estimation call
  - The response interface determines what the dashboard receives

  **Acceptance Criteria**:
  - [ ] `GenerateArchetypeResponse` includes `estimated_manual_minutes: number | null`
  - [ ] `generate()` returns an archetype with `estimated_manual_minutes` populated
  - [ ] `refine()` returns an archetype with `estimated_manual_minutes` populated
  - [ ] Estimation failure doesn't fail the overall generate/refine
  - [ ] `pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Generate includes estimated_manual_minutes
    Tool: Bash
    Preconditions: Tests updated
    Steps:
      1. Run: pnpm test -- --run src/gateway/services/__tests__/archetype-generator.test.ts
      2. Assert all tests pass
      3. Verify test output includes test for estimated_manual_minutes
    Expected Result: All tests pass including new estimation tests
    Failure Indicators: Test failure, missing field in response
    Evidence: .sisyphus/evidence/task-5-generator-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(generator): include estimated_manual_minutes in ArchetypeGenerator output`
  - Files: `src/gateway/services/archetype-generator.ts`, `src/gateway/services/__tests__/archetype-generator.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Lifecycle Metrics Snapshot on Task Completion

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, add a new step `step.run('record-time-saved-metric', ...)` that runs AFTER `status = 'Done'` is patched, in ALL paths that transition to Done:
    - **Path A — no approval** (line 767, `complete` step): After `patchTask(...Done...)`, insert the metric recording
    - **Path B — approved delivery** (inside `handle-approval-result`, after delivery succeeds and status = Done): Insert the metric recording
    - **Path C — no-action auto-complete** (line 1049, `complete-no-action-timeout`): Insert the metric recording
    - **Path D — override dismissed** (line 1092, `complete-override-dismissed`): Insert the metric recording
  - The metric recording step:
    1. Fetch the archetype's `estimated_manual_minutes` and `estimated_manual_minutes_override` from PostgREST: `GET /rest/v1/archetypes?id=eq.{archetypeId}&select=estimated_manual_minutes,estimated_manual_minutes_override`
    2. Compute effective estimate: override ?? haiku_default. If both null, skip recording (no estimate available).
    3. Insert into `task_metrics` via PostgREST: `POST /rest/v1/task_metrics` with `{ task_id, archetype_id, tenant_id, minutes_saved: effectiveEstimate }`
    4. Wrap in try/catch — metric recording failure is non-fatal, log warning and continue
  - **CRITICAL**: This must be a separate `step.run()` so Inngest can retry it independently. Do NOT inline it in the existing completion steps.
  - To avoid duplicating code across 4 paths, extract a helper function: `async function recordTimeSavedMetric(supabaseUrl, headers, taskId, archetypeId, tenantId): Promise<void>`

  **Must NOT do**:
  - Do not block the Done transition if metric recording fails
  - Do not modify the existing completion step logic — add the new step AFTER each completion step
  - Do not compute metrics for Failed or Cancelled tasks

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying the lifecycle is high-risk — 4 different completion paths, must not break existing flow, requires careful error handling
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: Understanding all lifecycle states and transitions is critical for inserting the metric step correctly

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:767-830` — `complete` step (no-approval path) — add `record-time-saved-metric` step after this
  - `src/inngest/employee-lifecycle.ts:1049-1060` — `complete-no-action-timeout` step — add metric step after
  - `src/inngest/employee-lifecycle.ts:1092-1100` — `complete-override-dismissed` step — add metric step after
  - `src/inngest/employee-lifecycle.ts:2530-2540` — End of `handle-approval-result` (approval path Done) — add metric step after
  - `src/inngest/employee-lifecycle.ts:40-55` — `patchTask` helper — follow same PostgREST pattern for the new helper
  - `src/inngest/employee-lifecycle.ts:57-75` — `logStatusTransition` helper — follow same error handling pattern

  **API/Type References**:
  - PostgREST insert: `POST /rest/v1/task_metrics` with JSON body, `Prefer: return=minimal` header
  - PostgREST select: `GET /rest/v1/archetypes?id=eq.{id}&select=estimated_manual_minutes,estimated_manual_minutes_override`

  **WHY Each Reference Matters**:
  - Each completion path is a separate insertion point — missing ANY path means some tasks won't get metrics
  - The PostgREST pattern (patchTask, logStatusTransition) shows exactly how to make REST calls from within the lifecycle

  **Acceptance Criteria**:
  - [ ] All 4 Done paths include a `record-time-saved-metric` step
  - [ ] Helper function `recordTimeSavedMetric` is extracted and shared across paths
  - [ ] Metric recording failure does not crash the lifecycle (try/catch, non-fatal logging)
  - [ ] Tasks with null archetype estimates skip metric recording gracefully
  - [ ] `pnpm build` succeeds (TypeScript compiles)

  **QA Scenarios**:

  ```
  Scenario: Task completion creates task_metrics record (no-approval path)
    Tool: Bash (curl + psql)
    Preconditions: Gateway + Inngest running, archetype with estimated_manual_minutes exists
    Steps:
      1. Trigger a task for an archetype with approval_required=false
      2. Wait for task to reach Done status
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT * FROM task_metrics WHERE task_id = '<task_id>';"
      4. Assert one row exists with minutes_saved matching the archetype's effective estimate
    Expected Result: task_metrics row created with correct minutes_saved
    Failure Indicators: No row found, incorrect minutes_saved value
    Evidence: .sisyphus/evidence/task-6-metric-created.txt

  Scenario: Null estimate archetype skips metric recording
    Tool: Bash (psql)
    Preconditions: Archetype with null estimated_manual_minutes, completed task
    Steps:
      1. Query: psql ... -c "SELECT count(*) FROM task_metrics WHERE archetype_id = '<null-estimate-archetype-id>';"
      2. Assert count = 0
    Expected Result: No metric recorded for null-estimate archetypes
    Failure Indicators: Row exists with minutes_saved = 0 or null
    Evidence: .sisyphus/evidence/task-6-null-estimate-skip.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): snapshot time-saved metric on task completion`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Dashboard: Types + PM Override in CompactSettingsGrid

  **What to do**:
  - In `dashboard/src/lib/types.ts`:
    - Add to `Archetype` interface: `estimated_manual_minutes: number | null;` and `estimated_manual_minutes_override: number | null;`
  - In `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx`:
    - Add state: `const [manualMinutesOverride, setManualMinutesOverride] = useState(archetype.estimated_manual_minutes_override ?? null)`
    - Add reset in useEffect when not editing (like other fields)
    - In editing mode: render a number input field labeled "Time Estimate (minutes)" with:
      - Placeholder showing Haiku's estimate: `placeholder={archetype.estimated_manual_minutes ? \`AI estimate: ${archetype.estimated_manual_minutes} min\` : 'Not estimated'}`
      - Value: `manualMinutesOverride ?? ''`
      - Min: 1, Max: 1440
      - Helper text: "How long this task takes a human (minutes). Leave empty to use AI estimate."
    - In view mode: display the effective estimate — override if set, else Haiku default, else "Not estimated"
    - In `handleSave()`: include `estimated_manual_minutes_override` in the changes object if it differs from archetype's current value. Send null to clear override.
  - Follow the existing field pattern (approval, timeout, channel, concurrency) for consistency

  **Must NOT do**:
  - Do not add a slider, dropdown, or presets — simple number input only
  - Do not allow the PM to edit `estimated_manual_minutes` directly (that's Haiku's field)
  - Do not add a "Re-estimate" button (re-estimation happens automatically on instruction changes)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI work with form field interaction, state management, and visual layout
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx:34-41` — Existing state declarations — add `manualMinutesOverride` state following same pattern
  - `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx:64-71` — Reset useEffect — add override reset
  - `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx:79-111` — `handleSave()` — add override to changes object
  - `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx:136-272` — JSX render — add new field row following existing grid pattern

  **API/Type References**:
  - `dashboard/src/lib/types.ts:78-111` — `Archetype` interface — add two new fields
  - `dashboard/src/lib/gateway.ts` — `patchArchetype()` function — already handles arbitrary fields

  **WHY Each Reference Matters**:
  - CompactSettingsGrid is the exact component to modify — following its existing state/save/render pattern ensures consistency
  - The Archetype type must be updated for TypeScript to accept the new fields

  **Acceptance Criteria**:
  - [ ] `Archetype` type includes both new fields
  - [ ] CompactSettingsGrid shows "Time Estimate" field in edit mode with number input
  - [ ] View mode shows effective estimate or "Not estimated"
  - [ ] Save persists the override via PATCH
  - [ ] Clearing the input and saving sends `null` (clears override)
  - [ ] `pnpm build` succeeds

  **QA Scenarios**:

  ```
  Scenario: PM override field visible in edit mode
    Tool: Playwright
    Preconditions: Dashboard dev server at localhost:7701, navigate to an employee detail
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/<employee-id>
      2. Find and click the "Edit" button in the Settings section
      3. Assert a field labeled "Time Estimate (minutes)" exists
      4. Assert the field is a number input
      5. Assert placeholder shows AI estimate or "Not estimated"
      6. Take screenshot
    Expected Result: Number input visible with correct placeholder
    Failure Indicators: Field missing, wrong input type, no placeholder
    Evidence: .sisyphus/evidence/task-7-override-edit-mode.png

  Scenario: PM can save override value
    Tool: Playwright
    Preconditions: Dashboard in edit mode on employee settings
    Steps:
      1. Clear the Time Estimate field
      2. Type "25" into the field
      3. Click "Save" button
      4. Wait for toast "Settings saved"
      5. Assert the field now shows "25" in view mode
    Expected Result: Override saved and displayed
    Failure Indicators: Save fails, value not persisted, toast shows error
    Evidence: .sisyphus/evidence/task-7-override-save.png
  ```

  **Commit**: YES (groups with Task 8)
  - Message: `feat(dashboard): add PM override for time estimate + time-saved displays`
  - Files: `dashboard/src/lib/types.ts`, `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx`
  - Pre-commit: `pnpm build`

- [x] 8. Dashboard: Time-Saved Displays (Employee Detail + Task Feed Header)

  **What to do**:
  - **Employee Detail — Per-Employee Time Saved**:
    - In `dashboard/src/panels/employees/sections/ActivitySection.tsx`:
      - Fetch `task_metrics` via PostgREST: `postgrestFetch('task_metrics', { select: 'minutes_saved', archetype_id: 'eq.<id>', tenant_id: 'eq.<tenantId>' })`
      - Sum `minutes_saved` from all records
      - Display a `StatCard` (imported from `@/components/ui/stat-card`) above the recent tasks list
      - Format: auto-format minutes into human-readable form (e.g., "2h 30m" for 150 minutes, "45 min" for 45 minutes)
      - If no metrics exist or sum is 0, show "No time saved yet"
  - **Task Feed Header — Tenant-Wide Time Saved**:
    - In `dashboard/src/panels/tasks/TaskFeed.tsx`:
      - Add a stats banner above the filter controls
      - Fetch all `task_metrics` for the tenant: `postgrestFetch('task_metrics', { select: 'minutes_saved', tenant_id: 'eq.<tenantId>' })`
      - Sum and display in a `StatCard` with label "Total Time Saved"
      - Format same as above
      - Add a second stat: "Tasks Completed" showing the count of metrics records
      - Wrap stats in a `flex gap-4` row above the existing filter controls
  - Create a shared utility function `formatMinutesSaved(totalMinutes: number): string` in `dashboard/src/lib/utils.ts`:
    - < 60: `"${minutes} min"`
    - > = 60: `"${hours}h ${remainingMin}m"` (omit minutes part if 0)
    - 0 or null: `"—"`

  **Must NOT do**:
  - Do not add charts, trend lines, or breakdowns
  - Do not create a new gateway endpoint — compute client-side from PostgREST
  - Do not add time saved to individual task rows in the table

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI work with data fetching, formatting, and layout
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/sections/ActivitySection.tsx` — Where per-employee stat goes — add StatCard above the existing task list
  - `dashboard/src/panels/tasks/TaskFeed.tsx:50-60` — TaskFeed component start — add stats banner before filter controls
  - `dashboard/src/lib/postgrest.ts` — `postgrestFetch()` for data fetching pattern
  - `dashboard/src/lib/utils.ts` — Existing `formatDuration()` — add `formatMinutesSaved()` nearby

  **API/Type References**:
  - PostgREST: `GET /rest/v1/task_metrics?select=minutes_saved&tenant_id=eq.<id>` — for tenant-wide sum
  - PostgREST: `GET /rest/v1/task_metrics?select=minutes_saved&archetype_id=eq.<id>&tenant_id=eq.<id>` — for per-employee sum
  - `dashboard/src/components/ui/stat-card.tsx` — Shared StatCard component (created in Task 3)

  **WHY Each Reference Matters**:
  - ActivitySection and TaskFeed are the exact insertion points for the new displays
  - PostgREST fetch pattern must be followed for consistency
  - StatCard was extracted in Task 3 specifically for reuse here

  **Acceptance Criteria**:
  - [ ] Employee detail shows "Time Saved: X hours Y min" stat above recent tasks
  - [ ] Task feed shows "Total Time Saved" and "Tasks Completed" stats in header
  - [ ] `formatMinutesSaved()` correctly formats all ranges (< 60, >= 60, 0)
  - [ ] Empty state shows "No time saved yet" or "—"
  - [ ] `pnpm build` succeeds

  **QA Scenarios**:

  ```
  Scenario: Employee detail shows per-employee time saved
    Tool: Playwright
    Preconditions: Dashboard dev server at localhost:7701, at least one employee with completed tasks and task_metrics records
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/<employee-id>
      2. Scroll to the Activity section
      3. Assert a StatCard with label containing "Time Saved" exists
      4. Assert the value is a formatted time string (e.g., "2h 30m" or "45 min")
      5. Take screenshot
    Expected Result: Time saved stat visible with formatted value
    Failure Indicators: Missing stat, "NaN", blank value, "undefined"
    Evidence: .sisyphus/evidence/task-8-employee-time-saved.png

  Scenario: Task feed shows tenant-wide time saved
    Tool: Playwright
    Preconditions: Dashboard dev server at localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks
      2. Assert a stats banner exists above the filter controls
      3. Assert "Total Time Saved" stat is visible
      4. Assert "Tasks Completed" stat is visible
      5. Take screenshot
    Expected Result: Both stats visible in header banner
    Failure Indicators: Missing banner, missing stats, layout broken
    Evidence: .sisyphus/evidence/task-8-taskfeed-banner.png

  Scenario: Empty state when no metrics exist
    Tool: Playwright
    Preconditions: Dashboard with a tenant that has no completed tasks
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks
      2. Assert time saved shows "—" or "No time saved yet"
    Expected Result: Graceful empty state, no errors
    Failure Indicators: "NaN", "undefined", console errors
    Evidence: .sisyphus/evidence/task-8-empty-state.png
  ```

  **Commit**: YES (groups with Task 7)
  - Message: `feat(dashboard): add PM override for time estimate + time-saved displays`
  - Files: `dashboard/src/panels/employees/sections/ActivitySection.tsx`, `dashboard/src/panels/tasks/TaskFeed.tsx`, `dashboard/src/lib/utils.ts`
  - Pre-commit: `pnpm build`

- [x] 9. Integration Tests — Full Flow Verification

  **What to do**:
  - Create `src/gateway/routes/__tests__/time-estimation-integration.test.ts`:
    - Test: Create archetype → verify `estimated_manual_minutes` is set
    - Test: PATCH archetype with `instructions` change → verify `estimated_manual_minutes` is updated
    - Test: PATCH archetype with `notification_channel` only → verify `estimated_manual_minutes` is unchanged
    - Test: PATCH archetype with `estimated_manual_minutes_override: 25` → verify override persists
    - Test: PATCH with `estimated_manual_minutes_override: null` → verify override cleared
    - Test: PATCH with `estimated_manual_minutes_override: 0` → verify 400 error
    - Test: PATCH with `estimated_manual_minutes_override: 1441` → verify 400 error
  - Add lifecycle metrics test in `tests/inngest/` or inline in the integration test file:
    - Test: Mock the lifecycle's `record-time-saved-metric` step — verify it calls PostgREST insert with correct `minutes_saved`
    - Test: Verify metric uses override when set, else Haiku default
  - Run full test suite: `pnpm test -- --run` to verify no regressions

  **Must NOT do**:
  - Do not test Haiku's actual output quality (non-deterministic) — only test that the service correctly parses and stores the response
  - Do not test dashboard rendering in this task (covered by Task 7/8 QA scenarios)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration tests spanning route + service + schema, requires understanding of the full flow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after all Wave 2 tasks)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 4, 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - `src/gateway/routes/__tests__/admin-archetypes.test.ts` — Existing archetype route tests — follow same test setup, mocking, and assertion patterns
  - `src/gateway/routes/__tests__/admin-archetypes-create.test.ts` — Create-specific test patterns

  **API/Type References**:
  - `src/gateway/services/time-estimator.ts` — Service to mock in route tests
  - `src/gateway/routes/admin-archetypes.ts` — Routes under test

  **WHY Each Reference Matters**:
  - Existing test files show exactly how to set up Prisma mocks, Express request/response simulation, and assertion patterns

  **Acceptance Criteria**:
  - [ ] All new integration tests pass
  - [ ] `pnpm test -- --run` shows 0 failures across entire suite
  - [ ] Tests cover: create estimation, PATCH re-estimation, no-reestimate for non-content fields, override CRUD, validation errors

  **QA Scenarios**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All previous tasks completed
    Steps:
      1. Run: pnpm test -- --run 2>&1
      2. Assert exit code 0
      3. Assert output shows 0 failures
      4. Assert total passed count is >= 1490 (original) + new tests
    Expected Result: All tests pass, no regressions
    Failure Indicators: Non-zero exit code, any test failure
    Evidence: .sisyphus/evidence/task-9-full-test-suite.txt
  ```

  **Commit**: YES
  - Message: `test(integration): add integration tests for time estimation flow`
  - Files: `src/gateway/routes/__tests__/time-estimation-integration.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 10. Documentation Update + Telegram Notification

  **What to do**:
  - Update `AGENTS.md`:
    - Add `task_metrics` table description in the Database section or nearby schema references
    - Mention `TimeEstimator` service in the relevant section
    - Note that `estimated_manual_minutes` and `estimated_manual_minutes_override` are new archetype fields
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ ME-02 Time Saved Calculation complete — All tasks done. Come back to review results."`

  **Must NOT do**:
  - Do not create new documentation files — just update AGENTS.md
  - Do not update README.md unless a new npm script was added (none were)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation update + one shell command
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 9)
  - **Blocks**: F1–F4
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Database" section — add task_metrics table reference
  - `AGENTS.md` § "Key Conventions" section — add note about time estimation

  **Acceptance Criteria**:
  - [ ] AGENTS.md mentions `task_metrics` table, `estimated_manual_minutes`, `estimated_manual_minutes_override`
  - [ ] Telegram notification sent successfully

  **QA Scenarios**:

  ```
  Scenario: AGENTS.md contains new schema references
    Tool: Bash (grep)
    Preconditions: AGENTS.md updated
    Steps:
      1. grep "task_metrics" AGENTS.md
      2. grep "estimated_manual_minutes" AGENTS.md
      3. Assert both return matches
    Expected Result: Both terms found in AGENTS.md
    Failure Indicators: grep returns no matches
    Evidence: .sisyphus/evidence/task-10-docs-updated.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md with task_metrics table and time estimation`
  - Files: `AGENTS.md`
  - Pre-commit: —

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`
      **VERDICT: APPROVE** — Must Have 15/15, Must NOT Have 6/6

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`
      **VERDICT: APPROVE** — Build PASS, Lint PASS, 1685 tests pass, 2 minor non-blocking findings

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: null estimates, zero tasks, Haiku failure. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`
      **VERDICT: APPROVE** — Scenarios 13/13 pass, Integration 16/16, Edge Cases 3 tested

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`
      **VERDICT: APPROVE** — 9/10 compliant (T2 minor notepad commit, non-blocking)

---

## Commit Strategy

| Commit | Message                                                                          | Files                                                                | Pre-commit           |
| ------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------- |
| 1      | `feat(schema): add estimated_manual_minutes and task_metrics table`              | migration.sql, schema.prisma                                         | `pnpm build`         |
| 2      | `feat(services): add TimeEstimator service for Haiku time estimation`            | time-estimator.ts, time-estimator.test.ts                            | `pnpm test -- --run` |
| 3      | `refactor(dashboard): extract StatCard to shared component`                      | stat-card.tsx, TaskDetail.tsx                                        | `pnpm build`         |
| 4      | `feat(routes): integrate time estimation into archetype create/update`           | admin-archetypes.ts, admin-archetypes.test.ts                        | `pnpm test -- --run` |
| 5      | `feat(generator): include estimated_manual_minutes in ArchetypeGenerator output` | archetype-generator.ts, archetype-generator.test.ts                  | `pnpm test -- --run` |
| 6      | `feat(lifecycle): snapshot time-saved metric on task completion`                 | employee-lifecycle.ts                                                | `pnpm test -- --run` |
| 7      | `feat(dashboard): add PM override for time estimate + time-saved displays`       | CompactSettingsGrid.tsx, ActivitySection.tsx, TaskFeed.tsx, types.ts | `pnpm build`         |
| 8      | `test(integration): add integration tests for time estimation flow`              | \*.test.ts                                                           | `pnpm test -- --run` |
| 9      | `docs: update AGENTS.md with task_metrics table and time estimation`             | AGENTS.md                                                            | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run          # Expected: 1490+ passing, 0 failures
pnpm build                  # Expected: clean exit
pnpm lint                   # Expected: clean exit

# Create archetype and verify estimate
curl -s -X POST http://localhost:7700/admin/tenants/$TENANT/archetypes \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"role_name":"test-time-est","model":"minimax/minimax-m2.7","runtime":"opencode","instructions":"Read Slack channels and post a daily summary.","agents_md":"You are a summarizer.","notification_channel":"C123"}' \
  | jq '.estimated_manual_minutes'
# Expected: integer > 0

# Verify task_metrics after a completed task
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT * FROM task_metrics LIMIT 5;"
# Expected: rows with minutes_saved > 0 for Done tasks
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] AGENTS.md updated with task_metrics table and TimeEstimator service
