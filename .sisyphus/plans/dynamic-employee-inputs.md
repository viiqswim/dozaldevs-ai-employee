# Dynamic Employee Inputs — Full Pipeline

## TL;DR

> **Quick Summary**: Add a dynamic input system to AI employees so non-technical users can declare what information each employee needs (dates, URLs, names), distinguish between "set once" config values and "per-run" runtime inputs, and provide those values through a clean UI — eliminating vague instructions like "ask the user which date" and hiding technical internals like `/tmp/summary.txt`.
>
> **Deliverables**:
>
> - New `input_schema` JSON column on archetypes with Prisma migration
> - Backend: trigger endpoint accepts inputs body with validation, template `{{var}}` substitution in harness, `worker_env` wired into lifecycle
> - Frontend: Input schema card editor in Config tab, dedicated trigger page with dynamic form, creation flow shows auto-detected inputs
> - Generator improvement: LLM auto-detects inputs from description, keeps technical internals out of user-facing instructions
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves + final verification
> **Critical Path**: T1 (migration) → T6 (trigger endpoint) → T8 (template substitution) → T12 (trigger page) → F1-F4

---

## Context

### Original Request

User created a "hostfully-daily-checkin-scheduler" AI employee and noticed the generated instructions contain: (1) runtime inputs the employee can't collect ("ask the user which date"), (2) vague external references ("the Notion database" without specifying which page), (3) technical implementation details users shouldn't see ("/tmp/summary.txt in JSON format"). Wants a dynamic system where each employee declares its inputs and users provide them through the UI.

### Interview Summary

**Key Discussions**:

- **Scope**: Full pipeline — schema definition, UI, trigger form, template injection, generator improvements
- **Generator approach**: Smarter LLM generator keeps internals out of instructions (not separate views)
- **Webhook scope**: Manual triggers only — webhook employees keep their existing payload mechanism
- **Auto-detection**: LLM auto-detects input_schema from user's natural description during creation
- **Trigger UX**: Dedicated trigger page (`/dashboard/employees/:id/trigger`), not modal
- **Input editor**: Lightweight card list in Config tab, click to expand/edit
- **"Set once" behavior**: Invisible on trigger page, only editable in Config tab
- **Input types v1**: text, long_text, date, number, url, select (6 types)
- **Test strategy**: Tests after implementation

**Research Findings**:

- `worker_env` column exists in DB (migration `20260513064913`) but is **never consumed** by lifecycle or harness — dead column, needs wiring
- `raw_event` on tasks carries per-trigger data for webhooks — runtime inputs should nest under `raw_event.inputs` to avoid collision with existing keys
- No `{{var}}` template substitution exists anywhere — must be built from scratch in the harness
- Admin trigger endpoint accepts zero body payload — needs to be extended
- Archetype generator (`archetype-generator.ts`) uses Claude Haiku 4.5 with structured output — extending to produce `input_schema` is feasible
- `PatchArchetypeBodySchema` doesn't include `worker_env` or `input_schema` — PATCH calls for these fields silently fail today
- Dashboard is React SPA with no form library (plain useState) — dynamic form must be built manually
- Frontend has existing `Card` component pattern in `dashboard/src/components/ui/card.tsx`

### Metis Review

**Identified Gaps** (addressed):

- **raw_event key collision**: Runtime inputs nested under `raw_event.inputs` key, not flattened into top-level raw_event — avoids breaking Hostfully/webhook flows
- **`{{` in existing instructions**: Audit task added (T5) to check all active archetypes before implementing substitution
- **PatchArchetypeBodySchema missing fields**: Explicitly included in T3 as a required backend change
- **Missing required input at trigger time**: API returns 422 with field-level errors — validation happens at the API level, not in the lifecycle
- **Template substitution scope**: Applied to `instructions` AND `agents_md` (both user-authored), NOT to `system_prompt` (platform-level)
- **worker_env wiring**: Separate from input_schema — `worker_env` stores static env vars injected as-is, `input_schema` stores input declarations with metadata
- **LLM-generated input_schema non-determinism**: Treated as suggestion, always editable by user before activation

---

## Work Objectives

### Core Objective

Enable each AI employee to declare a dynamic set of typed inputs — distinguishing "set once" configuration from "ask every time" runtime values — with a clean non-technical UI for defining, configuring, and providing those inputs across the creation, editing, and triggering flows.

### Concrete Deliverables

- Prisma migration adding `input_schema` JSON column to archetypes table
- Extended admin trigger API endpoint accepting `{ inputs: Record<string, string> }` body with validation
- Template `{{var_name}}` substitution in opencode-harness.mts for instructions and agents_md
- `worker_env` wired into lifecycle env-var injection (both Docker and Fly modes)
- Archetype generator LLM prompt updated to auto-detect inputs and keep internals out of instructions
- React `InputSchemaEditor` component (card-list pattern)
- "Inputs" section in EmployeeDetail Config tab
- Dedicated `/dashboard/employees/:archetypeId/trigger` page with dynamic form
- EditEmployeePage shows auto-detected inputs from generator

### Definition of Done

- [ ] Employee with `input_schema` shows input cards in Config tab
- [ ] Trigger page renders dynamic form from `every_run` inputs only
- [ ] Triggering with inputs → task `raw_event.inputs` populated → harness substitutes `{{var}}` in instructions
- [ ] `worker_env` values injected as env vars in worker container
- [ ] Generator produces `input_schema` from natural description
- [ ] Missing required inputs at trigger time → 422 error with field-level details
- [ ] Existing employees without `input_schema` work identically (zero regression)
- [ ] `pnpm test -- --run` passes with no new failures

### Must Have

- Dynamic, schema-driven input system (not hardcoded per-employee)
- Non-technical UX — no JSON editing, no file paths, no technical jargon
- Clear separation: "set once" config (Config tab) vs "ask every time" runtime (trigger page)
- Backward compatibility — employees without input_schema must work identically
- Template substitution for `{{var}}` in instructions and agents_md
- 422 validation when required inputs missing at trigger time

### Must NOT Have (Guardrails)

- NO changes to webhook trigger flows — manual triggers only
- NO new npm packages in the dashboard — use existing component library
- NO auto-activation of employees based on LLM-generated input_schema — always require user review
- NO modification of `raw_event` extraction logic for existing hardcoded keys (property_uid, lead_uid, thread_uid, message_uid, direction)
- NO breaking change to zero-body trigger calls for employees without input_schema
- NO template substitution on `system_prompt` — platform-level field, not user-authored
- NO models other than `anthropic/claude-haiku-4-5` for the generator
- NO models other than `minimax/minimax-m2.7` for employee execution
- NO tab proliferation — inputs live in Config tab, not a new tab

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after (not TDD)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **DB**: Use Bash (psql) — Query column existence, data integrity

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — types, schema, audit — all parallel):
├── Task 1: Prisma migration for input_schema column [quick]
├── Task 2: Backend Zod schema + InputSchemaItem type [quick]
├── Task 3: Update CRUD endpoint schemas (Create + Patch) [quick]
├── Task 4: Frontend TypeScript types [quick]
└── Task 5: Audit existing archetypes for {{ syntax [quick]

Wave 2 (Backend Core — after Wave 1, all parallel):
├── Task 6: Extend trigger endpoint with inputs body + validation [unspecified-high]
├── Task 7: Wire worker_env into lifecycle env-var injection [quick]
├── Task 8: Template {{var}} substitution in harness [deep]
└── Task 9: Update archetype generator (input_schema + internals cleanup) [deep]

Wave 3 (Frontend Core — after Wave 1, parallel with Wave 2):
├── Task 10: InputSchemaEditor component [visual-engineering]
├── Task 11: Inputs section in Config tab [visual-engineering]
├── Task 12: Dedicated trigger page with dynamic form [visual-engineering]
└── Task 13: Creation flow: show detected inputs in EditEmployeePage [visual-engineering]

Wave 4 (Tests + Integration — after Waves 2 & 3):
├── Task 14: Backend tests (trigger, substitution, generator) [unspecified-high]
├── Task 15: Frontend Playwright tests [unspecified-high]
└── Task 16: Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

**Critical Path**: T1 → T6 → T8 → T12 → T14 → F1-F4 → user okay
**Parallel Speedup**: ~65% faster than sequential
**Max Concurrent**: 5 (Waves 1 & 3)

### Dependency Matrix

| Task | Depends On     | Blocks             |
| ---- | -------------- | ------------------ |
| T1   | —              | T2, T3, T6, T7, T8 |
| T2   | —              | T3, T6, T9         |
| T3   | T1, T2         | T6, T9             |
| T4   | —              | T10, T11, T12, T13 |
| T5   | —              | T8                 |
| T6   | T1, T2, T3     | T12, T14           |
| T7   | T1             | T14                |
| T8   | T1, T5         | T14                |
| T9   | T2             | T13, T14           |
| T10  | T4             | T11, T13           |
| T11  | T4, T10        | T15                |
| T12  | T4, T6         | T15                |
| T13  | T4, T9, T10    | T15                |
| T14  | T6, T7, T8, T9 | FINAL              |
| T15  | T11, T12, T13  | FINAL              |
| T16  | T14, T15       | —                  |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1-T5 → `quick`
- **Wave 2**: **4** — T6 → `unspecified-high`, T7 → `quick`, T8 → `deep`, T9 → `deep`
- **Wave 3**: **4** — T10-T13 → `visual-engineering`
- **Wave 4**: **3** — T14-T15 → `unspecified-high`, T16 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

### Wave 1 — Foundation

- [x] 1. Prisma migration: add `input_schema` column to archetypes

  **What to do**:
  - Add `input_schema Json?` column to the `Archetype` model in `prisma/schema.prisma` (after `worker_env`, ~line 212)
  - Run `npx prisma migrate dev --name add_input_schema_to_archetypes` to generate the migration
  - Verify migration applies cleanly against `ai_employee` database

  **Must NOT do**:
  - Do NOT repurpose or rename `worker_env` — it stays separate
  - Do NOT add default values or constraints — nullable JSON is correct
  - Do NOT modify any other model

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: T2, T3, T6, T7, T8
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma:179-219` — Archetype model, add column after `worker_env` at ~line 212
  - `prisma/migrations/` — existing migrations for naming convention reference
  - `prisma/migrations/20260513064913_add_worker_env_to_archetypes/` — most recent migration, follow same pattern

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Migration applies and column exists
    Tool: Bash (psql)
    Preconditions: Database running at localhost:54322
    Steps:
      1. Run: npx prisma migrate deploy
      2. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='archetypes' AND column_name='input_schema';"
    Expected Result: 1 row returned, data_type is 'jsonb'
    Failure Indicators: 0 rows returned, or migration fails
    Evidence: .sisyphus/evidence/task-1-migration-column.txt

  Scenario: Existing archetypes unaffected
    Tool: Bash (psql)
    Preconditions: Migration applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, input_schema FROM archetypes LIMIT 5;"
    Expected Result: All existing rows have input_schema = NULL
    Failure Indicators: Any row has non-null input_schema, or query fails
    Evidence: .sisyphus/evidence/task-1-existing-archetypes.txt
  ```

  **Commit**: YES (groups with T2, T3)
  - Message: `feat(db): add input_schema column to archetypes`
  - Files: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_add_input_schema_to_archetypes/`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 2. Backend: InputSchemaItem type and Zod validation schema

  **What to do**:
  - Create a shared `InputSchemaItem` Zod schema in `src/gateway/validation/schemas.ts` defining the shape:
    ```typescript
    const InputSchemaItemSchema = z.object({
      key: z.string().regex(/^[a-z][a-z0-9_]*$/), // snake_case identifier
      label: z.string().min(1).max(100), // human-friendly display name
      type: z.enum(['text', 'long_text', 'date', 'number', 'url', 'select']),
      frequency: z.enum(['once', 'every_run']),
      required: z.boolean(),
      description: z.string().max(500).optional(), // help text
      options: z.array(z.string()).optional(), // for 'select' type only
      default_value: z.string().optional(),
    });
    const InputSchemaSchema = z.array(InputSchemaItemSchema);
    ```
  - Export both `InputSchemaItemSchema` and `InputSchemaSchema`
  - Add validation: when `type === 'select'`, `options` must be present and non-empty

  **Must NOT do**:
  - Do NOT put this in a new file — add to existing `schemas.ts`
  - Do NOT add fields beyond what's specified (no `validation_rules`, no `placeholder`, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: T3, T6, T9
  - **Blocked By**: None

  **References**:
  - `src/gateway/validation/schemas.ts` — existing Zod schemas (TriggerEmployeeParamsSchema, etc.)
  - Pattern: follow existing schema naming convention (`XyzSchema`)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Schema validates correct input
    Tool: Bash (node REPL)
    Preconditions: None
    Steps:
      1. Import the schema and parse a valid input_schema array:
         [{"key":"report_date","label":"Report Date","type":"date","frequency":"every_run","required":true}]
      2. Assert: parse succeeds with no errors
    Expected Result: Parsed object matches input
    Failure Indicators: Zod throws ZodError
    Evidence: .sisyphus/evidence/task-2-valid-parse.txt

  Scenario: Schema rejects invalid key format
    Tool: Bash (node REPL)
    Preconditions: None
    Steps:
      1. Parse with key: "Report Date" (spaces, capitals)
    Expected Result: ZodError on key field (regex mismatch)
    Failure Indicators: Parse succeeds for invalid key
    Evidence: .sisyphus/evidence/task-2-invalid-key.txt

  Scenario: Schema rejects select without options
    Tool: Bash (node REPL)
    Preconditions: None
    Steps:
      1. Parse with type: "select" and no options field
    Expected Result: ZodError (options required for select type)
    Failure Indicators: Parse succeeds without options
    Evidence: .sisyphus/evidence/task-2-select-no-options.txt
  ```

  **Commit**: YES (groups with T1, T3)
  - Message: `feat(api): add InputSchemaItem Zod schema`
  - Files: `src/gateway/validation/schemas.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 3. Backend: Update archetype CRUD schemas to include input_schema and worker_env

  **What to do**:
  - In `src/gateway/routes/admin-archetypes.ts`, add `input_schema` (using `InputSchemaSchema` from T2) and `worker_env` to both:
    - `CreateArchetypeBodySchema` — as optional fields
    - `PatchArchetypeBodySchema` — as optional fields
  - Verify the route handlers pass these fields through to Prisma create/update calls
  - Test that PATCH with `input_schema` actually persists to the database

  **Must NOT do**:
  - Do NOT change any existing field validations
  - Do NOT add `input_schema` to the response transformation (it should already come through from Prisma)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T1 and T2)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: T6, T9
  - **Blocked By**: T1 (migration), T2 (Zod schema)

  **References**:
  - `src/gateway/routes/admin-archetypes.ts:37-98` — `CreateArchetypeBodySchema` and `PatchArchetypeBodySchema` Zod definitions
  - `src/gateway/routes/admin-archetypes.ts` — route handlers that call `prisma.archetype.create()` / `prisma.archetype.update()`
  - `src/gateway/validation/schemas.ts` — where `InputSchemaSchema` lives (from T2)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: PATCH archetype saves input_schema
    Tool: Bash (curl)
    Preconditions: Active archetype exists in database
    Steps:
      1. curl -s -X PATCH -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/<archetype_id>" \
           -d '{"input_schema":[{"key":"report_date","label":"Report Date","type":"date","frequency":"every_run","required":true}]}'
      2. Verify response status is 200
      3. Query DB: psql ... -c "SELECT input_schema FROM archetypes WHERE id='<archetype_id>';"
    Expected Result: input_schema column contains the array with report_date entry
    Failure Indicators: 400 status, or DB shows NULL for input_schema
    Evidence: .sisyphus/evidence/task-3-patch-input-schema.txt

  Scenario: PATCH with invalid input_schema rejected
    Tool: Bash (curl)
    Preconditions: Active archetype exists
    Steps:
      1. curl with input_schema containing invalid type: "checkbox"
    Expected Result: 400 status with Zod validation error
    Failure Indicators: 200 status (invalid data accepted)
    Evidence: .sisyphus/evidence/task-3-invalid-schema-rejected.txt
  ```

  **Commit**: YES (groups with T1, T2)
  - Message: `feat(api): add input_schema and worker_env to archetype CRUD schemas`
  - Files: `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 4. Frontend: InputSchemaItem TypeScript types

  **What to do**:
  - Add `InputSchemaItem` interface to `dashboard/src/lib/types.ts`:
    ```typescript
    export interface InputSchemaItem {
      key: string;
      label: string;
      type: 'text' | 'long_text' | 'date' | 'number' | 'url' | 'select';
      frequency: 'once' | 'every_run';
      required: boolean;
      description?: string;
      options?: string[];
      default_value?: string;
    }
    ```
  - Add `input_schema: InputSchemaItem[] | null` to the existing `Archetype` interface
  - Update `GenerateArchetypeResponse` type (if it exists in the frontend) to include `input_schema`
  - Update the `triggerEmployee()` function in `dashboard/src/lib/gateway.ts` to accept an optional `inputs?: Record<string, string>` parameter and pass it as JSON request body

  **Must NOT do**:
  - Do NOT create new files — add to existing `types.ts` and `gateway.ts`
  - Do NOT change the `triggerEmployee()` behavior when `inputs` is undefined — backward compatible

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: T10, T11, T12, T13
  - **Blocked By**: None

  **References**:
  - `dashboard/src/lib/types.ts` — existing `Archetype` interface (add `input_schema` field)
  - `dashboard/src/lib/gateway.ts` — `triggerEmployee()` function (add optional `inputs` param)
  - Use `lsp_find_references` on `triggerEmployee` to verify all call sites before modifying signature

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: TypeScript compiles with new types
    Tool: Bash
    Preconditions: Dashboard code exists
    Steps:
      1. Run: cd dashboard && npx tsc --noEmit
    Expected Result: No type errors
    Failure Indicators: Type errors in types.ts or gateway.ts
    Evidence: .sisyphus/evidence/task-4-tsc-check.txt
  ```

  **Commit**: NO (groups with T10-T13 frontend commit)

---

- [x] 5. Audit: check existing archetype instructions for `{{` template syntax

  **What to do**:
  - Query all active archetypes: `SELECT id, role_name, instructions, agents_md FROM archetypes WHERE status = 'active';`
  - Search each `instructions` and `agents_md` field for `{{` occurrences
  - Document findings: which archetypes (if any) contain `{{` and in what context
  - If `{{` is found: document the specific string and recommend whether `{{` is safe to use as delimiter or if an alternative (e.g., `{{{var}}}`) is needed
  - If no `{{` found: confirm `{{var}}` is safe to use as the template delimiter

  **Must NOT do**:
  - Do NOT change any archetype data — this is read-only audit
  - Do NOT block on this if no `{{` found — just confirm safety and move on

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: T8
  - **Blocked By**: None

  **References**:
  - Database: `postgresql://postgres:postgres@localhost:54322/ai_employee`
  - Table: `archetypes` — columns `instructions`, `agents_md`, `status`

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Audit completes with documented findings
    Tool: Bash (psql)
    Preconditions: Database accessible
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, role_name FROM archetypes WHERE status='active' AND (instructions LIKE '%{{%' OR agents_md LIKE '%{{%');"
      2. Document count of matching rows
    Expected Result: Either 0 rows (safe to use {{var}}) or N rows with specific context documented
    Failure Indicators: Query fails
    Evidence: .sisyphus/evidence/task-5-template-audit.txt
  ```

  **Commit**: NO (audit only, no code changes)

---

### Wave 2 — Backend Core

- [x] 6. Backend: Extend trigger endpoint to accept inputs body with validation

  **What to do**:
  - In `src/gateway/routes/admin-employee-trigger.ts`, add a request body schema:
    ```typescript
    const TriggerBodySchema = z
      .object({
        inputs: z.record(z.string(), z.string()).optional(),
      })
      .optional();
    ```
  - Parse `req.body` against this schema
  - Before dispatching: if the archetype has `input_schema` with required `every_run` inputs, validate that all required keys are present in `inputs` — return 422 with field-level errors if missing
  - In `employee-dispatcher.ts` (or wherever the task is created): store the inputs in `raw_event` as a nested key: `{ inputs: { key: value } }` — NOT flattened into top-level raw_event
  - In `employee-lifecycle.ts`: extend the env-var extraction logic (after the existing hardcoded keys at ~line 404) to read `raw_event.inputs` and inject each key-value pair as an env var with a `INPUT_` prefix (e.g., `INPUT_REPORT_DATE=2026-05-18`)
  - Ensure zero-body trigger calls still work identically for employees without input_schema

  **Must NOT do**:
  - Do NOT modify the existing `property_uid`, `lead_uid`, `thread_uid`, `message_uid`, `direction` extraction logic
  - Do NOT flatten inputs into top-level raw_event (collision risk with webhook payloads)
  - Do NOT change behavior for employees without input_schema

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9)
  - **Blocks**: T12, T14
  - **Blocked By**: T1, T2, T3

  **References**:
  - `src/gateway/routes/admin-employee-trigger.ts` — current trigger endpoint (no body handling)
  - `src/gateway/services/employee-dispatcher.ts` — `dispatchEmployee()` creates task with no raw_event for manual triggers
  - `src/inngest/employee-lifecycle.ts:398-404` — existing `raw_event` → env var extraction (hardcoded 5 keys)
  - `src/inngest/employee-lifecycle.ts:494-554` — where env vars are injected into Docker/Fly container
  - `src/gateway/validation/schemas.ts` — `InputSchemaSchema` from T2 (for validation lookup)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Trigger with inputs creates task with raw_event.inputs
    Tool: Bash (curl + psql)
    Preconditions: Archetype with input_schema exists (from T3 QA), services running
    Steps:
      1. curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/<slug>/trigger" \
           -d '{"inputs":{"report_date":"2026-05-18"}}'
      2. Capture task_id from response
      3. psql ... -c "SELECT raw_event FROM tasks WHERE id='<task_id>';"
    Expected Result: 202 status, raw_event contains {"inputs":{"report_date":"2026-05-18"}}
    Failure Indicators: 400/500 status, or raw_event is null, or inputs are flattened
    Evidence: .sisyphus/evidence/task-6-trigger-with-inputs.txt

  Scenario: Trigger rejects missing required input
    Tool: Bash (curl)
    Preconditions: Archetype with required every_run input "report_date" exists
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/<slug>/trigger" \
           -d '{}'
    Expected Result: 422 status, body contains error mentioning "report_date" as missing
    Failure Indicators: 202 status (task created without required input)
    Evidence: .sisyphus/evidence/task-6-missing-required-input.txt

  Scenario: Zero-body trigger still works for employee without input_schema
    Tool: Bash (curl)
    Preconditions: Archetype without input_schema (e.g., daily-summarizer)
    Steps:
      1. curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
           "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-summarizer/trigger"
    Expected Result: 202 status, task created successfully
    Failure Indicators: 400/422 status
    Evidence: .sisyphus/evidence/task-6-zero-body-backward-compat.txt
  ```

  **Commit**: YES (groups with T7)
  - Message: `feat(api): accept inputs on trigger endpoint and wire into raw_event`
  - Files: `src/gateway/routes/admin-employee-trigger.ts`, `src/gateway/services/employee-dispatcher.ts`, `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 7. Backend: Wire worker_env into lifecycle env-var injection

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, in the `executing` step where `localWorkerEnv` is built (~line 494-524):
    - Read `archetype.worker_env` (a `Record<string, string>` JSON object)
    - Spread it into the env dict, BEFORE `rawEventEnv` (so runtime values can override static config)
  - Do the same for the Fly.io code path (`flyWorkerEnv`)
  - Pattern: follow the existing `rawEventEnv` spread pattern

  **Must NOT do**:
  - Do NOT add any new Prisma queries — the archetype is already fetched at the start of the lifecycle
  - Do NOT change the order of existing env var merges beyond inserting worker_env before rawEventEnv

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9)
  - **Blocks**: T14
  - **Blocked By**: T1

  **References**:
  - `src/inngest/employee-lifecycle.ts:494-554` — where `localWorkerEnv` and Fly env vars are built
  - `src/inngest/employee-lifecycle.ts:398-404` — `rawEventEnv` extraction pattern to follow
  - `src/inngest/employee-lifecycle.ts:148` — where archetype is fetched (already includes all columns)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: worker_env values reach container as env vars
    Tool: Bash (curl + psql)
    Preconditions: Set worker_env on an archetype: {"NOTION_DB_ID":"abc123","CUSTOM_VAR":"hello"}
    Steps:
      1. PATCH archetype with worker_env: curl -s -X PATCH ... -d '{"worker_env":{"NOTION_DB_ID":"abc123"}}'
      2. Trigger the employee
      3. Check task execution — in the lifecycle step output or container logs, verify NOTION_DB_ID env var is present
    Expected Result: Container receives NOTION_DB_ID=abc123 as environment variable
    Failure Indicators: Env var missing in container
    Evidence: .sisyphus/evidence/task-7-worker-env-injection.txt
  ```

  **Commit**: YES (groups with T6)
  - Message: `feat(lifecycle): wire worker_env into container env-var injection`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 8. Backend: Template `{{var}}` substitution in harness

  **What to do**:
  - In `src/workers/opencode-harness.mts`, BEFORE building `fullPrompt` at line 275:
    - Create a `substituteTemplateVars(text: string, vars: Record<string, string>): string` function
    - Collect substitution values from two sources:
      1. `process.env` keys starting with `INPUT_` (from runtime inputs via T6)
      2. All env vars from `worker_env` (already injected via T7)
    - Replace `{{key}}` patterns in the text with corresponding values
    - If a `{{key}}` has no matching value, leave it unreplaced and log a warning (do NOT throw)
  - Apply substitution to BOTH `instructions` and `agents_md` before they are used
  - Do NOT apply to `system_prompt`
  - **CRITICAL**: First check findings from T5 (audit). If `{{` was found in existing archetypes, use a non-conflicting delimiter as documented in T5's findings

  **Must NOT do**:
  - Do NOT throw on unresolved `{{var}}` — log warning and leave as-is
  - Do NOT apply substitution to `system_prompt`
  - Do NOT use a regex that could match partial patterns (e.g., `{notavar}` should NOT match)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9)
  - **Blocks**: T14
  - **Blocked By**: T1, T5 (audit results determine delimiter safety)

  **References**:
  - `src/workers/opencode-harness.mts:275` — where `fullPrompt` is built (`${instructions}\n\nTask ID: ${TASK_ID}`)
  - `src/workers/opencode-harness.mts:660-662` — where `instructions` is read from archetype
  - `src/workers/opencode-harness.mts:742-750` — where `agents_md` is assembled via `resolveAgentsMd()`
  - `.sisyphus/evidence/task-5-template-audit.txt` — audit results from T5 (check before choosing delimiter)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Template variables substituted in instructions
    Tool: Bash (unit test or manual verification)
    Preconditions: Archetype instructions contain "Generate report for {{report_date}}"
    Steps:
      1. Set INPUT_REPORT_DATE=2026-05-18 in environment
      2. Run harness (or unit test the substituteTemplateVars function)
      3. Verify instructions output is "Generate report for 2026-05-18"
    Expected Result: {{report_date}} replaced with env var value
    Failure Indicators: {{report_date}} still present in output
    Evidence: .sisyphus/evidence/task-8-template-substitution.txt

  Scenario: Unresolved template variable left as-is with warning
    Tool: Bash
    Preconditions: Instructions contain "Check {{unknown_var}}"
    Steps:
      1. Run substitution with no matching env var
      2. Check output text and logs
    Expected Result: Text still contains "{{unknown_var}}", warning logged
    Failure Indicators: Error thrown, or text is corrupted
    Evidence: .sisyphus/evidence/task-8-unresolved-var.txt
  ```

  **Commit**: YES
  - Message: `feat(worker): add template {{var}} substitution for instructions and agents_md`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 9. Backend: Update archetype generator to produce input_schema and keep internals out

  **What to do**:
  - In `src/gateway/services/archetype-generator.ts`:
    - Add `input_schema` to the `GenerateArchetypeResponse` TypeScript interface (lines 6-37)
    - Update the `SYSTEM_PROMPT` (lines 42-127) to instruct the LLM to:
      1. Detect runtime inputs ("ask the user for X", "provide the Y") → `frequency: 'every_run'`
      2. Detect static config ("from the Notion database", "API endpoint at") → `frequency: 'once'`
      3. Use `{{key}}` template syntax in `instructions` for all detected inputs
      4. Keep technical implementation details (file paths, JSON format, output contracts) in `agents_md`, NOT in `instructions`
      5. Make `instructions` human-readable: focused on what the employee does, not how it does it internally
    - Update the structured output schema passed to the LLM to include `input_schema` field
  - Treat LLM-generated input_schema as a suggestion — user will edit in the UI before activation

  **Must NOT do**:
  - Do NOT change the model — must remain `anthropic/claude-haiku-4-5`
  - Do NOT change the refine flow logic — only change the prompt and response schema
  - Do NOT auto-activate employees based on generated input_schema

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: T13, T14
  - **Blocked By**: T2 (needs InputSchemaItem type definition)

  **References**:
  - `src/gateway/services/archetype-generator.ts:6-37` — `GenerateArchetypeResponse` interface
  - `src/gateway/services/archetype-generator.ts:42-127` — `SYSTEM_PROMPT` for LLM generation
  - `src/gateway/services/archetype-generator.ts` — structured output parsing logic
  - `src/gateway/routes/admin-archetype-generate.ts` — route that calls the generator

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Generator produces input_schema from description
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/generate" \
           -d '{"description":"An employee that checks Hostfully bookings for a given date and creates cleaning schedules based on property locations from our Notion workspace."}'
      2. Parse response JSON
    Expected Result: Response contains input_schema with at least: a date input (frequency: every_run) and a Notion-related input (frequency: once). Instructions use {{var}} syntax. Instructions do NOT contain "/tmp/summary.txt" or "JSON format".
    Failure Indicators: No input_schema in response, or instructions still contain file paths/technical details
    Evidence: .sisyphus/evidence/task-9-generator-input-schema.txt

  Scenario: Generator keeps instructions clean of internals
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Same curl as above
      2. Check that instructions field does NOT contain: "/tmp/", "summary.txt", "JSON format", "approval-message.json"
      3. Check that agents_md field DOES contain output contract details
    Expected Result: Technical details in agents_md, not instructions
    Failure Indicators: File paths or format details in instructions
    Evidence: .sisyphus/evidence/task-9-generator-clean-instructions.txt
  ```

  **Commit**: YES
  - Message: `feat(generator): auto-detect input_schema and separate internals from instructions`
  - Files: `src/gateway/services/archetype-generator.ts`
  - Pre-commit: `pnpm test -- --run`

---

### Wave 3 — Frontend Core

- [x] 10. Frontend: InputSchemaEditor component

  **What to do**:
  - Create `dashboard/src/components/InputSchemaEditor.tsx` — a reusable component for viewing and editing an `InputSchemaItem[]`
  - **Card list pattern** (collapsed by default):
    - Each input renders as a compact card showing: icon by type, label, type badge, frequency badge ("Every run" / "Set once"), required indicator
    - Click card → expands inline to show edit form: label (text input), key (auto-generated from label, editable), type (dropdown), frequency (toggle/radio), required (checkbox), description (textarea), default_value (text input), options (comma-separated for select type)
    - "Add Input" button at the bottom — adds new empty card in expanded state
    - Delete button (trash icon) on each card header
  - Props: `value: InputSchemaItem[]`, `onChange: (schema: InputSchemaItem[]) => void`, `readOnly?: boolean`
  - Use existing UI components: `Card`, `CardHeader`, `CardContent` from `dashboard/src/components/ui/card.tsx`, `Button`, `Input`, `Label`, `Badge`
  - Inline validation: key must be snake_case, label required, select type requires at least one option
  - When `readOnly` is true: show cards without edit affordances (for Brain Preview and read-only views)

  **Must NOT do**:
  - Do NOT add new npm packages — use existing component library only
  - Do NOT implement drag-and-drop reordering — simple list is sufficient for v1
  - Do NOT add complex validation rules — keep it to the basics listed above
  - Do NOT create sub-components in separate files — keep it in one file for v1

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13)
  - **Blocks**: T11, T13
  - **Blocked By**: T4 (frontend types)

  **References**:
  - `dashboard/src/components/ui/card.tsx` — Card, CardHeader, CardContent components to use
  - `dashboard/src/components/ui/button.tsx` — Button component
  - `dashboard/src/components/ui/input.tsx` — Input component
  - `dashboard/src/components/ui/badge.tsx` — Badge component (if exists, check)
  - `dashboard/src/lib/types.ts` — `InputSchemaItem` interface (from T4)
  - `dashboard/src/components/MarkdownEditorField.tsx` — example of a complex editor component in the dashboard

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Card list renders with existing inputs
    Tool: Playwright
    Preconditions: Component rendered with 2 InputSchemaItems
    Steps:
      1. Navigate to a page rendering InputSchemaEditor with test data
      2. Assert: 2 card elements visible with labels "Report Date" and "Notion Page URL"
      3. Assert: type badges show "date" and "url"
      4. Assert: frequency badges show "Every run" and "Set once"
    Expected Result: Both cards rendered with correct metadata
    Failure Indicators: Cards missing or metadata incorrect
    Evidence: .sisyphus/evidence/task-10-card-list-render.png

  Scenario: Expand card and edit input
    Tool: Playwright
    Preconditions: Component with 1 InputSchemaItem rendered
    Steps:
      1. Click on the card
      2. Assert: edit form expands showing label input, type dropdown, frequency toggle
      3. Change label to "Updated Label"
      4. Assert: onChange callback fired with updated schema
    Expected Result: Card expands, edit works, onChange reflects changes
    Failure Indicators: Card doesn't expand, or edits don't propagate
    Evidence: .sisyphus/evidence/task-10-expand-edit.png

  Scenario: Add new input
    Tool: Playwright
    Preconditions: Component rendered (empty or with existing inputs)
    Steps:
      1. Click "Add Input" button
      2. Assert: new card appears in expanded state with empty fields
      3. Fill in label: "Guest Name", type: "text", frequency: "every_run"
      4. Assert: onChange fired with new item added to array
    Expected Result: New input added and reflected in state
    Failure Indicators: Button doesn't work, or new item not in onChange payload
    Evidence: .sisyphus/evidence/task-10-add-input.png
  ```

  **Commit**: NO (groups with T11-T13 frontend commit)

---

- [x] 11. Frontend: Add "Inputs" section to Config tab

  **What to do**:
  - In `dashboard/src/panels/employees/EmployeeDetail.tsx`, Config tab panel:
    - Add an "Inputs" section between the scalar config fields (role_name, model, etc.) and the markdown editors (instructions, system_prompt)
    - **Read mode**: Render `InputSchemaEditor` with `readOnly={true}` showing the archetype's `input_schema`
    - **Edit mode**: Render `InputSchemaEditor` with `readOnly={false}`, wire `onChange` to local state
    - If `input_schema` is null/empty: show a subtle empty state: "No inputs configured. This employee runs without any user-provided data."
    - In edit mode empty state: show "Add Input" button to start defining inputs
    - Save via the existing Save button (batch save with other Config changes) — include `input_schema` in the PATCH payload
  - Also display "set once" input values in Config tab:
    - Below each `frequency: 'once'` input card, show a value field where the admin can enter the static config value
    - Store these values in `worker_env` on the archetype (key → value mapping, using the input's `key` as the env var name)
    - On Save, PATCH both `input_schema` and `worker_env` together

  **Must NOT do**:
  - Do NOT create a new tab — keep in Config tab
  - Do NOT add auto-save on blur — use explicit Save button like other fields
  - Do NOT show worker_env as raw JSON — only show value fields for "set once" inputs

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T10)
  - **Parallel Group**: Wave 3 (with Tasks 10, 12, 13)
  - **Blocks**: T15
  - **Blocked By**: T4 (types), T10 (InputSchemaEditor component)

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx` — Config tab, read/edit mode toggle
  - `dashboard/src/components/InputSchemaEditor.tsx` — from T10
  - `dashboard/src/lib/gateway.ts` — `patchArchetype()` function for saving
  - `dashboard/src/lib/types.ts` — Archetype interface with `input_schema` and `worker_env`

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Config tab shows Inputs section with cards
    Tool: Playwright
    Preconditions: Archetype has input_schema with 2 items (set via API in T3)
    Steps:
      1. Navigate to http://localhost:5173/dashboard/employees/<archetypeId>?tab=config&tenant=<tenantId>
      2. Assert: "Inputs" heading visible between scalar fields and instructions
      3. Assert: 2 input cards rendered with correct labels and badges
    Expected Result: Inputs section visible with correct data
    Failure Indicators: Section missing, or cards not rendered
    Evidence: .sisyphus/evidence/task-11-config-inputs-section.png

  Scenario: Edit mode allows modifying inputs
    Tool: Playwright
    Preconditions: Same archetype
    Steps:
      1. Click "Edit" button to enter edit mode
      2. Assert: InputSchemaEditor is editable (cards clickable, "Add Input" visible)
      3. Click a card, change its label
      4. Click "Save"
      5. Reload page, verify change persisted
    Expected Result: Changes saved via PATCH and visible on reload
    Failure Indicators: Save fails, or changes lost on reload
    Evidence: .sisyphus/evidence/task-11-edit-inputs.png

  Scenario: "Set once" input shows value field in edit mode
    Tool: Playwright
    Preconditions: Archetype has input with frequency: "once"
    Steps:
      1. Enter edit mode
      2. Assert: below the "set once" card, a value input field is visible
      3. Enter a value (e.g., Notion URL)
      4. Save
      5. Verify worker_env was patched with the key-value pair
    Expected Result: Value saved in worker_env
    Failure Indicators: No value field shown, or worker_env not updated
    Evidence: .sisyphus/evidence/task-11-set-once-value.png

  Scenario: Empty state when no inputs configured
    Tool: Playwright
    Preconditions: Archetype with null input_schema
    Steps:
      1. Navigate to Config tab
      2. Assert: "No inputs configured" message visible
    Expected Result: Empty state message shown
    Failure Indicators: Error or blank section
    Evidence: .sisyphus/evidence/task-11-empty-state.png
  ```

  **Commit**: NO (groups with T10, T12, T13 frontend commit)

---

- [x] 12. Frontend: Dedicated trigger page with dynamic form

  **What to do**:
  - Add route `/dashboard/employees/:archetypeId/trigger` to `dashboard/src/App.tsx`
  - Create `dashboard/src/panels/employees/TriggerEmployeePage.tsx`:
    - Fetch archetype data (including `input_schema`) on mount
    - Filter to only `frequency: 'every_run'` inputs
    - Render a clean form with appropriate field types:
      - `text` → single-line text input
      - `long_text` → multi-line textarea
      - `date` → date picker input (type="date")
      - `number` → number input
      - `url` → URL input with basic validation
      - `select` → dropdown/select from `options` array
    - Show label, description (as help text), and required indicator for each field
    - Pre-fill `default_value` if present
    - "Run Employee" button at the bottom — calls `triggerEmployee()` with the collected inputs
    - On success: show success toast/message with task_id, link to task detail page
    - On 422 error: show field-level validation errors inline
    - If no `every_run` inputs exist: show "No inputs required — this employee is ready to run" with a simple "Run" button
  - Update the "Trigger" button in `EmployeeDetail.tsx` header:
    - If archetype has `every_run` inputs in `input_schema`: navigate to trigger page
    - If no `every_run` inputs (or no input_schema): keep current behavior (trigger immediately)
  - Page header: employee name + "Run [Employee Name]" title
  - Back link: "← Back to [Employee Name]"

  **Must NOT do**:
  - Do NOT replace or remove `TriggerPanel.tsx` — it serves a different UX
  - Do NOT show `frequency: 'once'` inputs on this page
  - Do NOT add new npm packages for form handling

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 13)
  - **Blocks**: T15
  - **Blocked By**: T4 (types), T6 (trigger endpoint accepts inputs)

  **References**:
  - `dashboard/src/App.tsx` — route definitions (add new route)
  - `dashboard/src/panels/employees/EmployeeDetail.tsx` — "Trigger" button in header (modify behavior)
  - `dashboard/src/lib/gateway.ts` — `triggerEmployee()` function (extended in T4)
  - `dashboard/src/lib/types.ts` — `InputSchemaItem`, `Archetype` interfaces
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx` — example of a page with form + submit pattern

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Trigger page renders dynamic form
    Tool: Playwright
    Preconditions: Archetype with input_schema containing every_run date and text inputs
    Steps:
      1. Navigate to http://localhost:5173/dashboard/employees/<archetypeId>/trigger?tenant=<tenantId>
      2. Assert: page title contains employee name
      3. Assert: date input field visible with correct label
      4. Assert: text input field visible with correct label
      5. Assert: "Run Employee" button visible
    Expected Result: Dynamic form rendered from input_schema
    Failure Indicators: 404, blank page, or missing form fields
    Evidence: .sisyphus/evidence/task-12-trigger-page-form.png

  Scenario: Submit form triggers employee with inputs
    Tool: Playwright
    Preconditions: Same setup, trigger endpoint from T6 working
    Steps:
      1. Fill date field with "2026-05-18"
      2. Fill text field with "Test value"
      3. Click "Run Employee"
      4. Assert: success message appears with task_id
    Expected Result: Employee triggered, task created with inputs
    Failure Indicators: Error message, or no task created
    Evidence: .sisyphus/evidence/task-12-trigger-submit.png

  Scenario: Missing required field shows validation error
    Tool: Playwright
    Preconditions: Archetype with required every_run input
    Steps:
      1. Leave required field empty
      2. Click "Run Employee"
      3. Assert: validation error message shown near the empty field
    Expected Result: Field-level error prevents submission
    Failure Indicators: Form submits without required field
    Evidence: .sisyphus/evidence/task-12-validation-error.png

  Scenario: No every_run inputs shows simple run button
    Tool: Playwright
    Preconditions: Archetype with only frequency: "once" inputs (or no input_schema)
    Steps:
      1. Navigate to trigger page
      2. Assert: "No inputs required" message visible
      3. Assert: simple "Run" button visible
      4. Click "Run"
      5. Assert: employee triggered successfully
    Expected Result: Clean empty state with working run button
    Failure Indicators: Error or missing button
    Evidence: .sisyphus/evidence/task-12-no-inputs-run.png

  Scenario: Trigger button in EmployeeDetail navigates to trigger page
    Tool: Playwright
    Preconditions: Archetype with every_run inputs
    Steps:
      1. Navigate to employee detail page
      2. Click "Trigger" button in header
      3. Assert: navigated to /dashboard/employees/<id>/trigger
    Expected Result: Navigation to trigger page
    Failure Indicators: Immediate trigger without navigation, or 404
    Evidence: .sisyphus/evidence/task-12-trigger-button-navigation.png
  ```

  **Commit**: NO (groups with T10, T11, T13 frontend commit)

---

- [x] 13. Frontend: Show detected inputs in creation flow (EditEmployeePage)

  **What to do**:
  - In `dashboard/src/panels/employees/EditEmployeePage.tsx`:
    - After the LLM generates the archetype (including `input_schema` from T9), display the detected inputs prominently — NOT buried in Advanced Configuration
    - Add a section titled "Detected Inputs" between the main config fields and the Advanced section:
      - Render `InputSchemaEditor` with the generated `input_schema`
      - Allow editing (add/remove/modify inputs) before the employee is activated
      - If no inputs were detected: show "No inputs detected. You can add them manually if needed." with an "Add Input" button
    - When saving the draft or activating the employee, include `input_schema` in the PATCH/POST payload
    - In the refine flow: when the user refines the description and regenerates, update the `input_schema` section with the new generation (don't lose manual edits — show a warning: "Regenerating will replace the current inputs. Continue?")

  **Must NOT do**:
  - Do NOT add a new wizard step — integrate into the existing page layout
  - Do NOT auto-activate based on LLM-detected inputs — user must review
  - Do NOT hide inputs behind the Advanced Configuration `<details>` — make them visible by default

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12)
  - **Blocks**: T15
  - **Blocked By**: T4 (types), T9 (generator produces input_schema), T10 (InputSchemaEditor component)

  **References**:
  - `dashboard/src/panels/employees/EditEmployeePage.tsx` — draft editor page, refine flow
  - `dashboard/src/components/InputSchemaEditor.tsx` — from T10
  - `dashboard/src/lib/types.ts` — `GenerateArchetypeResponse`, `InputSchemaItem`
  - `dashboard/src/lib/gateway.ts` — `generateArchetype()`, `patchArchetype()` functions

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Detected inputs shown after generation
    Tool: Playwright
    Preconditions: None (start from creation page)
    Steps:
      1. Navigate to http://localhost:5173/dashboard/employees/new?tenant=<tenantId>
      2. Type description: "An employee that checks bookings for a given date and uses property locations from Notion"
      3. Click "Generate"
      4. Wait for generation to complete and redirect to edit page
      5. Assert: "Detected Inputs" section visible (NOT inside Advanced Configuration)
      6. Assert: at least 1 input card rendered (e.g., date input)
    Expected Result: Generated inputs displayed prominently for user review
    Failure Indicators: No inputs section, or section hidden in Advanced
    Evidence: .sisyphus/evidence/task-13-detected-inputs.png

  Scenario: User can edit detected inputs before activation
    Tool: Playwright
    Preconditions: On edit page after generation
    Steps:
      1. Click on a detected input card to expand
      2. Change the label
      3. Click "Add Input" to add a new one
      4. Click "Create Employee" (activate)
      5. Navigate to the active employee's Config tab
      6. Assert: modified input_schema persisted correctly
    Expected Result: Edited inputs saved with the activated employee
    Failure Indicators: Changes lost on activation, or original values persisted
    Evidence: .sisyphus/evidence/task-13-edit-before-activate.png
  ```

  **Commit**: YES (groups with T10, T11, T12)
  - Message: `feat(dashboard): add input schema editor, trigger page, and creation flow inputs`
  - Files: `dashboard/src/**`
  - Pre-commit: N/A (frontend)

---

### Wave 4 — Tests & Completion

- [x] 14. Backend: Tests for trigger validation, template substitution, and generator

  **What to do**:
  - Add test file `src/__tests__/input-schema-pipeline.test.ts` with tests for:
    1. **InputSchemaItem Zod validation**: valid schemas parse, invalid types rejected, select without options rejected, snake_case key enforcement
    2. **Trigger endpoint validation**: required inputs present → 200, missing required → 422 with field errors, no input_schema employee → 202 with empty body
    3. **Template substitution**: `{{var}}` replaced with value, unresolved vars left as-is, empty string values handled, multiple vars in same string
    4. **Generator response**: mock LLM response with input_schema → parsed correctly (if generator has testable pure functions)
  - Use Vitest patterns from existing test files
  - Run `pnpm test -- --run` to verify all pass with no regressions

  **Must NOT do**:
  - Do NOT mock Prisma if not needed — test the Zod schemas directly
  - Do NOT test the full lifecycle end-to-end — focus on unit-level validation and substitution logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 15, 16)
  - **Blocks**: FINAL
  - **Blocked By**: T6, T7, T8, T9

  **References**:
  - `src/__tests__/` — existing test files for patterns and conventions
  - `src/gateway/validation/schemas.ts` — InputSchemaSchema (from T2)
  - `src/workers/opencode-harness.mts` — substituteTemplateVars function (from T8)

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: All Wave 2 tasks complete
    Steps:
      1. Run: pnpm test -- --run
      2. Check output for test counts
    Expected Result: 515+ passing (original count + new tests), 0 failures in new test file
    Failure Indicators: New test failures, or existing tests broken
    Evidence: .sisyphus/evidence/task-14-test-results.txt
  ```

  **Commit**: YES
  - Message: `test: add tests for dynamic employee inputs pipeline`
  - Files: `src/__tests__/input-schema-pipeline.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 15. Frontend: Playwright integration tests

  **What to do**:
  - Create Playwright test covering the full user journey:
    1. Navigate to Create Employee page → enter description → Generate → verify detected inputs shown
    2. Edit detected inputs → activate employee
    3. Navigate to Config tab → verify Inputs section shows cards
    4. Enter edit mode → modify an input → save → verify persistence
    5. Navigate to trigger page → fill in runtime inputs → submit → verify task created
  - Also test edge cases:
    - Employee with no input_schema → Config tab shows empty state
    - Trigger page with no every_run inputs → shows "No inputs required" + simple Run button
  - Run against dashboard dev server (`http://localhost:5173`)

  **Must NOT do**:
  - Do NOT test backend API directly — that's T14's job
  - Do NOT test every field type exhaustively — focus on the journey

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 16)
  - **Blocks**: FINAL
  - **Blocked By**: T11, T12, T13

  **References**:
  - `dashboard/` — dashboard source
  - Playwright MCP tools — browser_navigate, browser_snapshot, browser_click, etc.
  - QA scenarios from T10, T11, T12, T13 — use as test script reference

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: Full journey test passes
    Tool: Playwright
    Preconditions: Gateway + dashboard dev server running
    Steps:
      1. Execute the full journey described above
      2. Capture screenshots at each step
    Expected Result: All assertions pass, screenshots captured
    Failure Indicators: Any assertion failure
    Evidence: .sisyphus/evidence/task-15-e2e-journey.png
  ```

  **Commit**: NO (test execution only, no committed test files for Playwright — it's manual QA via agent)

---

- [x] 16. Notify completion via Telegram

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "📋 Dynamic Employee Inputs — All tasks complete. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: T14, T15

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [6/6] | Must NOT Have [8/8] | Tasks [15/16] | VERDICT: APPROVE` (T16 Telegram sent by Atlas; build clean confirmed)

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` (if applicable) + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build PASS | Lint PASS | Tests 30/30 pass | Files 14 clean | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (create employee with description → generator produces input_schema → edit inputs in Config tab → trigger with runtime inputs → verify substitution in task). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios covered by T15 Playwright QA (28 screenshots) | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [14/14 compliant] | Contamination [CLEAN] | Unaccounted [1 minor non-blocking] | VERDICT: APPROVE`

---

## Commit Strategy

| After   | Message                                                                 | Files                                                                                           | Pre-commit           |
| ------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------- |
| T1      | `feat(db): add input_schema column to archetypes`                       | `prisma/schema.prisma`, migration file                                                          | `pnpm test -- --run` |
| T3      | `feat(api): add input_schema and worker_env to archetype CRUD schemas`  | `src/gateway/routes/admin-archetypes.ts`, validation files                                      | `pnpm test -- --run` |
| T6+T7   | `feat(api): accept inputs on trigger endpoint and wire worker_env`      | `src/gateway/routes/admin-employee-trigger.ts`, `src/inngest/employee-lifecycle.ts`, dispatcher | `pnpm test -- --run` |
| T8      | `feat(worker): add template substitution for {{var}} in instructions`   | `src/workers/opencode-harness.mts`                                                              | `pnpm test -- --run` |
| T9      | `feat(generator): auto-detect input_schema and separate internals`      | `src/gateway/services/archetype-generator.ts`                                                   | `pnpm test -- --run` |
| T10-T13 | `feat(dashboard): input schema editor, trigger page, and creation flow` | `dashboard/src/**`                                                                              | N/A                  |
| T14-T15 | `test: add tests for dynamic employee inputs pipeline`                  | test files                                                                                      | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# Migration applied
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='archetypes' AND column_name='input_schema';"
# Expected: 1 row

# Trigger with inputs works
curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT/employees/test-slug/trigger" \
  -d '{"inputs":{"report_date":"2026-05-18"}}'
# Expected: 202

# Missing required input rejected
curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT/employees/test-slug/trigger" -d '{}'
# Expected: 422

# Tests pass
pnpm test -- --run
# Expected: 515+ passing, 0 new failures
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Existing employees without input_schema work identically
- [ ] Generator produces input_schema from natural description
- [ ] Template substitution replaces {{var}} in instructions and agents_md
- [ ] worker_env values reach worker container as env vars
- [ ] Trigger page renders dynamic form for every_run inputs only
- [ ] Config tab shows input cards with edit capability
