# Employee Creation Flow Redesign

## TL;DR

> **Quick Summary**: Redesign the `/dashboard/employees/new` wizard to align with the template compilation architecture — users edit identity, execution_steps, and delivery_steps as separate fields, preview the compiled AGENTS.md, and save as a draft. Model selection is removed from creation (deferred to detail page).
>
> **Deliverables**:
>
> - New 5-step creation wizard: Describe → Generate → Edit Fields → Preview AGENTS.md → Save
> - New stateless compile-preview API endpoint
> - Backend schema fix (CreateArchetypeBodySchema + frontend types)
> - Model selection removed from wizard
> - 20x stress test of daily-real-estate-inspiration-2-copy employee (stability gate)
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (schema fix) → T4 (wizard rebuild) → T5 (preview step) → T6 (integration) → T7 (stress test 20x) → F1-F4

---

## Context

### Original Request

Redesign the employee creation experience at `/dashboard/employees/new` to take into account the new template compilation architecture (identity, execution_steps, delivery_steps fields) and show the compiled AGENTS.md preview during creation.

### Interview Summary

**Key Discussions**:

- Wizard flow: Describe → Generate → Edit 3 Fields + Key Settings → Preview AGENTS.md → Save Draft
- Model selection removed from creation (default `minimax/minimax-m2.7`, user picks model from detail page)
- Edit step: Identity, Execution Steps, Delivery Steps textareas + employee name, approval toggle, trigger type
- Preview step: Read-only rendered markdown of compiled AGENTS.md (API-based compilation)
- No AI refinement in v1
- No unit tests (user has explicitly waived)

**Research Findings**:

- Generator already produces `identity`, `execution_steps`, `delivery_steps` correctly
- `CreateArchetypeBodySchema` missing new fields (same bug fixed for PATCH)
- Frontend types (`CreateArchetypePayload`, `GenerateArchetypeResponse`) also need updating
- `instructions` field must remain (= copy of execution_steps) for backward compat
- Compiler is server-side only (needs platform rules from `config/agents.md`)
- Wizard cannot reuse detail page section components (they require an existing archetypeId for PATCH calls)

### Metis Review

**Identified Gaps** (addressed):

- Preview endpoint: new stateless POST endpoint (no archetype ID needed)
- Frontend types are also missing new fields — both layers need fixing
- `instructions` field backward compat — generator already handles via postProcess()
- Detail page sections cannot be reused in wizard — need inline form components
- `notification_channel` is required at creation — stays on Describe step

---

## Work Objectives

### Core Objective

Rebuild the employee creation wizard to let users see and edit the three core content fields (identity, execution_steps, delivery_steps) and preview the compiled AGENTS.md before saving.

### Concrete Deliverables

- `src/gateway/routes/admin-archetypes.ts` — `CreateArchetypeBodySchema` updated with new fields
- `src/gateway/routes/admin-brain-preview.ts` — new `POST .../compile-preview` endpoint
- `dashboard/src/lib/types.ts` — `GenerateArchetypeResponse` and `CreateArchetypePayload` updated
- `dashboard/src/lib/gateway.ts` — new `compilePreview()` fetch function
- `dashboard/src/panels/employees/CreateEmployeePage.tsx` — fully rewritten 5-step wizard

### Definition of Done

- [ ] User can create a new employee through the 5-step wizard
- [ ] Edit step shows identity, execution_steps, delivery_steps as editable textareas
- [ ] Edit step shows employee name, approval toggle, trigger type as settings
- [ ] Preview step shows the compiled AGENTS.md as rendered markdown
- [ ] Save creates a draft archetype with all fields persisted to DB
- [ ] No model selection step in the wizard
- [ ] `pnpm build` exits 0

### Must Have

- All 5 wizard steps functional and navigable
- identity, execution_steps, delivery_steps persisted to DB on save
- instructions field auto-populated from execution_steps (backward compat)
- Compiled AGENTS.md preview via API call
- Slack channel picker on the Describe step
- 20/20 stress test passes for daily-real-estate-inspiration-2-copy (platform stability gate)

### Must NOT Have (Guardrails)

- No AI "refine" chat feature
- No model questions/recommendation step in the wizard
- No live preview during editing (preview is a separate step)
- No client-side compilation (compiler stays server-side)
- No unit tests (user has waived)
- Do NOT delete ModelQuestionsStep.tsx or ModelRecommendationStep.tsx (may be reused on detail page later)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None (user has explicitly waived unit tests)
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — send requests, assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all independent):
├── T1: Backend schema fix (CreateArchetypeBodySchema) [quick]
├── T2: New compile-preview API endpoint [quick]
├── T3: Frontend types + gateway function updates [quick]

Wave 2 (Wizard rebuild — depends on Wave 1):
├── T4: Wizard steps 1-3: Describe + Generate + Edit Fields [visual-engineering]
├── T5: Wizard steps 4-5: Preview AGENTS.md + Save Draft [visual-engineering]

Wave 3 (Integration + Stability):
├── T6: End-to-end integration wiring + build verification [deep]
├── T7: Stress test — run daily-real-estate-inspiration-2-copy 20x [deep]
├── T8: Notify completion via Telegram [quick]

Wave FINAL (4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
├── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On     | Blocks     |
| ---- | -------------- | ---------- |
| T1   | —              | T4, T5, T6 |
| T2   | —              | T5, T6     |
| T3   | —              | T4, T5     |
| T4   | T1, T3         | T6         |
| T5   | T1, T2, T3, T4 | T6         |
| T6   | T4, T5         | T7         |
| T7   | T6             | T8, F1-F4  |
| T8   | T7             | —          |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 2 tasks — T4 `visual-engineering`, T5 `visual-engineering`
- **Wave 3**: 3 tasks — T6 `deep`, T7 `deep`, T8 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Add identity, execution_steps, delivery_steps, temperature to CreateArchetypeBodySchema

  **What to do**:
  - Open `src/gateway/routes/admin-archetypes.ts` and find `CreateArchetypeBodySchema` (line 81)
  - Add 4 new fields to the schema, matching the same definitions used in `PatchArchetypeBodySchema`:
    - `identity: z.string().max(10000).optional().default('')`
    - `execution_steps: z.string().max(10000).optional().default('')`
    - `delivery_steps: z.string().max(10000).nullable().optional().default(null)`
    - `temperature: z.number().min(0).max(2).optional().default(1.0)`
  - Verify the POST handler at line ~155 passes the new fields through to `prisma.archetype.create()`. The handler uses `const body = bodyResult.data;` and spreads fields — confirm `identity`, `execution_steps`, `delivery_steps`, `temperature` are included in the `data` object passed to Prisma.
  - If the handler uses explicit field picking (not a spread), add the 4 new fields to the pick list.
  - Run `pnpm build` to verify no TypeScript errors.

  **Must NOT do**:
  - Do NOT remove or modify `instructions` field (backward compat)
  - Do NOT change `PatchArchetypeBodySchema` (already fixed)
  - Do NOT modify any other route files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file schema change, well-defined Zod pattern to copy from PatchArchetypeBodySchema
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not relevant — this is a gateway route change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/gateway/routes/admin-archetypes.ts:22-78` — `PatchArchetypeBodySchema` already has `identity`, `execution_steps`, `delivery_steps`, `temperature` with identical Zod definitions. Copy these field definitions exactly.

  **API/Type References** (contracts to implement against):
  - `prisma/schema.prisma` — `Archetype` model has `identity`, `execution_steps`, `delivery_steps`, `temperature` columns (added in template compilation migration)

  **WHY Each Reference Matters**:
  - `PatchArchetypeBodySchema` is the gold standard — it was already fixed in commit `d90db7e`. The Create schema needs the exact same fields with the same validation rules.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create archetype with new fields via curl
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700, ADMIN_API_KEY set
    Steps:
      1. source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"role_name":"test-schema-fix","model":"minimax/minimax-m2.7","runtime":"opencode","instructions":"test","identity":"Test Identity","execution_steps":"1. Do something","delivery_steps":"1. Deliver it","temperature":0.7,"notification_channel":"C1234","risk_model":{"approval_required":false,"timeout_hours":2}}'
      2. Capture response, parse with jq
      3. Assert response contains "id" field (201 status)
      4. Query DB: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT identity, execution_steps, delivery_steps, temperature FROM archetypes WHERE role_name='test-schema-fix' ORDER BY created_at DESC LIMIT 1;"
      5. Assert: identity = 'Test Identity', execution_steps = '1. Do something', delivery_steps = '1. Deliver it', temperature = 0.7
    Expected Result: Archetype created with all 4 new fields persisted correctly
    Failure Indicators: 400 error mentioning unrecognized keys, or DB shows empty/null for new fields
    Evidence: .sisyphus/evidence/task-1-create-with-new-fields.json

  Scenario: Create archetype WITHOUT new fields (backward compat)
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"role_name":"test-schema-compat","model":"minimax/minimax-m2.7","runtime":"opencode","instructions":"test","notification_channel":"C1234","risk_model":{"approval_required":false,"timeout_hours":2}}'
      2. Assert 201 — new fields default to empty/null/1.0
    Expected Result: Archetype created with defaults (identity='', execution_steps='', delivery_steps=null, temperature=1.0)
    Failure Indicators: 400 error or missing required field error
    Evidence: .sisyphus/evidence/task-1-backward-compat.json
  ```

  **Cleanup**: Delete both test archetypes after verification:

  ```bash
  source .env && curl -s -X DELETE "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/<id1>" -H "X-Admin-Key: $ADMIN_API_KEY"
  curl -s -X DELETE "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/<id2>" -H "X-Admin-Key: $ADMIN_API_KEY"
  ```

  **Commit**: YES
  - Message: `fix(gateway): add identity, execution_steps, delivery_steps, temperature to CreateArchetypeBodySchema`
  - Files: `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Add stateless compile-preview API endpoint

  **What to do**:
  - Open `src/gateway/routes/admin-brain-preview.ts`
  - Add a new POST route: `POST /admin/tenants/:tenantId/archetypes/compile-preview`
  - This endpoint does NOT require an archetype ID — it takes raw fields and returns the compiled AGENTS.md
  - Request body schema (new Zod schema `CompilePreviewBodySchema`):
    ```
    identity: z.string().max(10000).default('')
    execution_steps: z.string().max(10000).default('')
    delivery_steps: z.string().max(10000).nullable().default(null)
    ```
  - Handler implementation:
    1. Validate `tenantId` param with `TenantIdParamSchema`
    2. Validate body with `CompilePreviewBodySchema`
    3. Call `compileAgentsMd({ identity, executionSteps: execution_steps, deliverySteps: delivery_steps ?? '', employeeRules: '', employeeKnowledge: '' })`
    4. Return `{ compiled_agents_md: result }`
  - The endpoint MUST be behind `requireAdminKey` middleware
  - Register the route INSIDE the existing `adminBrainPreviewRoutes` function (same router)

  **Must NOT do**:
  - Do NOT fetch archetype from DB (stateless — no archetype ID needed)
  - Do NOT include employee rules or knowledge base (those don't exist yet during creation)
  - Do NOT add env vars, tools, or skills to the response (only compiled_agents_md needed for preview)
  - Do NOT create a new route file — add to the existing `admin-brain-preview.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding a single POST route to an existing route file. Pattern is clear from the existing GET route in the same file.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/gateway/routes/admin-brain-preview.ts:37-326` — The existing GET route shows the full pattern: param validation, Prisma lookup, calling `compileAgentsMd()`, and returning JSON. The new POST route is a simplified version (no DB lookup, no env vars, no tools).
  - `src/gateway/routes/admin-brain-preview.ts:10` — Import of `compileAgentsMd` already exists in this file.
  - `src/gateway/routes/admin-brain-preview.ts:6` — Import of `requireAdminKey` already exists.

  **API/Type References** (contracts to implement against):
  - `src/workers/lib/agents-md-compiler.mts:11-17` — `CompileAgentsMdInput` interface: `{ identity: string, executionSteps: string, deliverySteps: string, employeeRules?: string, employeeKnowledge?: string }`
  - `src/workers/lib/agents-md-compiler.mts:30-72` — `compileAgentsMd()` function signature and behavior

  **WHY Each Reference Matters**:
  - The existing GET route in the same file is the closest pattern — same middleware, same imports, same response structure
  - The compiler function is already imported — just call it with the request body fields

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Compile preview with valid fields
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700
    Steps:
      1. source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/compile-preview" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"identity":"You are a helpful assistant.","execution_steps":"1. Read messages\n2. Summarize","delivery_steps":"1. Post to Slack"}'
      2. Parse response with jq '.compiled_agents_md'
      3. Assert: response contains "You are a helpful assistant."
      4. Assert: response contains "<execution-instructions>"
      5. Assert: response contains "1. Read messages"
      6. Assert: response contains "<delivery-instructions>"
      7. Assert: response contains "Platform Rules"
    Expected Result: compiled_agents_md string containing identity, execution/delivery instructions wrapped in XML tags, and platform rules appended
    Failure Indicators: 404 (route not registered), 500 (compiler error), missing sections in output
    Evidence: .sisyphus/evidence/task-2-compile-preview-happy.json

  Scenario: Compile preview with empty/missing fields
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/compile-preview" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{}'
      2. Assert: 200 status (all fields have defaults)
      3. Assert: response contains compiled_agents_md with platform rules at minimum
    Expected Result: Endpoint accepts empty body gracefully with defaults
    Failure Indicators: 400 validation error on empty body
    Evidence: .sisyphus/evidence/task-2-compile-preview-defaults.json

  Scenario: Compile preview without admin key
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/compile-preview" \
           -H "Content-Type: application/json" -d '{"identity":"test"}'
      2. Assert: 401 or 403 status
    Expected Result: Rejected without admin key
    Failure Indicators: 200 (auth bypass)
    Evidence: .sisyphus/evidence/task-2-compile-preview-no-auth.json
  ```

  **Commit**: YES
  - Message: `feat(gateway): add compile-preview endpoint for stateless AGENTS.md preview`
  - Files: `src/gateway/routes/admin-brain-preview.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Update frontend types and add compilePreview gateway function

  **What to do**:
  - **Part A — Update `GenerateArchetypeResponse` type** in `dashboard/src/lib/types.ts` (line 300):
    - Add 3 new fields to the interface:
      - `identity: string;`
      - `execution_steps: string;`
      - `delivery_steps: string | null;`
    - These match what the generator already returns (the backend `archetype-generator.ts` already produces these fields)

  - **Part B — Update `CreateArchetypePayload` type** in `dashboard/src/lib/types.ts` (line 328):
    - `CreateArchetypePayload` is derived from `GenerateArchetypeResponse` via `Omit<...>` — adding fields to `GenerateArchetypeResponse` automatically includes them in `CreateArchetypePayload`. Verify this is sufficient. If `CreateArchetypePayload` manually lists fields, add the new ones.

  - **Part C — Add `compilePreview()` function** in `dashboard/src/lib/gateway.ts`:
    - Add a new export function:
      ```typescript
      export async function compilePreview(
        tenantId: string,
        fields: { identity: string; execution_steps: string; delivery_steps: string | null },
      ): Promise<{ compiled_agents_md: string }> {
        return gatewayFetch<{ compiled_agents_md: string }>(
          `/admin/tenants/${tenantId}/archetypes/compile-preview`,
          { method: 'POST', body: JSON.stringify(fields) },
        );
      }
      ```
    - Place it near the existing `fetchBrainPreview` function (line ~169) for logical grouping

  - Run `pnpm build` to verify no TypeScript errors in the dashboard

  **Must NOT do**:
  - Do NOT modify `BrainPreviewResponse` type (that's for the existing GET endpoint)
  - Do NOT remove `instructions` from `GenerateArchetypeResponse` (backward compat)
  - Do NOT modify `patchArchetype` or other existing gateway functions
  - Do NOT add `temperature` to `GenerateArchetypeResponse` — the generator doesn't return it; temperature uses the archetype default (1.0)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two files, small additions — adding interface fields and a one-liner fetch function
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/lib/gateway.ts:169-183` — `fetchBrainPreview()` function shows the exact pattern for calling a brain preview endpoint with `gatewayFetch<T>()`
  - `dashboard/src/lib/gateway.ts:185-193` — `generateArchetype()` function shows POST pattern with JSON body
  - `dashboard/src/lib/types.ts:300-326` — Current `GenerateArchetypeResponse` interface (add fields here)
  - `dashboard/src/lib/types.ts:328-335` — Current `CreateArchetypePayload` type (verify it inherits new fields)

  **API/Type References** (contracts to implement against):
  - `src/gateway/services/archetype-generator.ts:12-47` — `GenerateArchetypeResponse` on the backend already includes `identity`, `execution_steps`, `delivery_steps`. The frontend type must match.

  **WHY Each Reference Matters**:
  - `fetchBrainPreview` is the closest existing gateway function pattern — same domain (brain/AGENTS.md), same return shape
  - The backend generator already returns these fields — the frontend type just needs to catch up

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation succeeds with new types
    Tool: Bash
    Preconditions: None
    Steps:
      1. cd dashboard && npx tsc --noEmit
      2. Assert: exit code 0
    Expected Result: No TypeScript errors
    Failure Indicators: Type errors mentioning GenerateArchetypeResponse or CreateArchetypePayload
    Evidence: .sisyphus/evidence/task-3-tsc-check.txt

  Scenario: Verify compilePreview function exists and has correct signature
    Tool: Bash
    Preconditions: Task 2 complete (endpoint exists)
    Steps:
      1. grep -n "compilePreview" dashboard/src/lib/gateway.ts
      2. Assert: function is exported, takes tenantId and fields parameters
      3. Assert: returns Promise<{ compiled_agents_md: string }>
    Expected Result: Function exists with correct signature
    Failure Indicators: Function not found or wrong return type
    Evidence: .sisyphus/evidence/task-3-function-exists.txt
  ```

  **Commit**: YES
  - Message: `fix(dashboard): update frontend types and add compilePreview gateway function`
  - Files: `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Rebuild creation wizard — Steps 1-3: Describe, Generate, Edit Fields

  **What to do**:
  Rewrite `dashboard/src/panels/employees/CreateEmployeePage.tsx` to implement the first 3 steps of the new 5-step wizard. The file is 277 lines today and will be fully rewritten.

  **Step 1 — Define new PageState type** (replaces the existing one at line 18-30):

  ```
  type WizardStep = 'describe' | 'generating' | 'edit' | 'previewing' | 'preview' | 'saving' | 'error';
  ```

  State includes: `step: WizardStep`, `description: string`, `notificationChannel: string`, `config: GenerateArchetypeResponse | null`, `editedFields: { identity, execution_steps, delivery_steps, role_name, approval_required, trigger_type }`, `compiledPreview: string | null`, `error: string | null`.

  **Step 2 — Describe step** (step === 'describe'):
  - Keep the existing description textarea and Slack channel picker — same UI pattern as today (lines 160-218)
  - Keep the character counter (description.length/2000)
  - "Generate" button disabled until description >= 10 chars AND notificationChannel is set
  - On "Generate" click → set step to 'generating', call `generateArchetype(tenantId, description)`
  - On success → populate `config` and `editedFields` from the response, set step to 'edit'
  - On error → set step to 'error' with message

  **Step 3 — Generating step** (step === 'generating'):
  - Spinner with "Analyzing your description…" text (same as today, lines 221-228)

  **Step 4 — Edit Fields step** (step === 'edit'):
  - This is the NEW core step. Layout:
    - **Section header**: "Review & Edit" with subtitle "Edit the generated configuration before saving"
    - **Employee Name**: text input, pre-filled from `config.role_name`, stored in `editedFields.role_name`
    - **Identity**: textarea (min-h-[200px]), pre-filled from `config.identity`, label "Identity — Who is this employee?"
    - **Execution Steps**: textarea (min-h-[200px]), pre-filled from `config.execution_steps`, label "Execution Steps — What does this employee do?"
    - **Delivery Steps**: textarea (min-h-[150px]), pre-filled from `config.delivery_steps ?? ''`, label "Delivery Steps — How are results delivered?" with "(optional)" badge
    - **Key Settings row** (horizontal flex):
      - Approval toggle: checkbox/switch, pre-filled from `config.risk_model.approval_required`
      - Trigger type: dropdown with options "Manual", "Scheduled", "Webhook", pre-filled from `config.trigger_sources.type`
    - **Navigation buttons**: "← Back to Describe" (goes to 'describe', preserves description) and "Preview AGENTS.md →" (goes to 'previewing', calls compile-preview API)
  - All fields are locally managed React state (`editedFields`), no API calls on change
  - Use the same textarea styling as the Describe step: `w-full rounded-md border border-input bg-background px-3 py-2 text-sm...`

  **Step 5 — Wire up state transitions**:
  - describe → generating: on "Generate" click
  - generating → edit: on successful generation
  - generating → error: on failure
  - edit → describe: "Back" button (preserve description text)
  - edit → previewing: "Preview" button (wire up in Task 5)
  - error → describe: "Try Again" button

  **UI guidelines**:
  - Max width: `max-w-2xl mx-auto p-6` (same as today)
  - Use `rounded-lg border bg-card` card wrapper for the edit step sections
  - Section labels: `text-sm font-medium` with `text-xs text-muted-foreground` descriptions
  - Use existing dashboard components: `Button`, `Input`, `SearchableSelect` (for Slack channels)
  - Use a simple `<select>` for trigger type (only 3 options, not worth SearchableSelect)
  - For approval toggle, use a simple checkbox with label

  **Must NOT do**:
  - Do NOT implement the Preview or Save steps (Task 5)
  - Do NOT import or render `ModelQuestionsStep` or `ModelRecommendationStep`
  - Do NOT add AI refinement features
  - Do NOT use `MarkdownEditorField` for the textareas (those are plain text, not markdown editors)
  - Do NOT make API calls from the Edit step (all state is local)
  - Do NOT delete `ModelQuestionsStep.tsx` or `ModelRecommendationStep.tsx` files

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Full UI rewrite with multiple form fields, layout, state management, and navigation flow
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — T4 before T5)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Tasks 1, 3 (needs updated types for GenerateArchetypeResponse with new fields)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:1-277` — Current wizard to rewrite. Keep the Describe step UI pattern (textarea + Slack picker), spinner pattern, error pattern. Replace everything after generation with the new Edit step.
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:160-218` — Describe step layout to preserve (textarea + SearchableSelect + character counter + Generate button)
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:221-228` — Spinner pattern to reuse for generating step
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:262-274` — Error pattern to reuse

  **API/Type References** (contracts to implement against):
  - `dashboard/src/lib/types.ts:300-326` — `GenerateArchetypeResponse` type (with new fields from Task 3)
  - `dashboard/src/lib/gateway.ts:185-193` — `generateArchetype()` function (unchanged)
  - `dashboard/src/lib/gateway.ts:310-326` — `fetchSlackChannels()` function (unchanged)

  **Component References**:
  - `dashboard/src/components/ui/searchable-select.tsx` — SearchableSelect for Slack channel picker
  - `dashboard/src/components/ui/button.tsx` — Button component
  - `dashboard/src/components/ui/input.tsx` — Input component

  **WHY Each Reference Matters**:
  - Current CreateEmployeePage has working Describe step UI that should be preserved/adapted
  - `GenerateArchetypeResponse` (updated in Task 3) is the source of pre-filled values for the Edit step
  - SearchableSelect is required by AGENTS.md convention for dropdown selectors

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Navigate to creation page, see Describe step
    Tool: Playwright
    Preconditions: Dashboard dev server at localhost:7701, pnpm dev running
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003
      2. Assert: page title contains "Create New Employee"
      3. Assert: textarea with placeholder containing "Describe what" is visible
      4. Assert: Slack channel picker is visible (SearchableSelect or Input)
      5. Assert: "Generate" button is visible but disabled (no text entered)
      6. Screenshot the page
    Expected Result: Describe step renders correctly with all expected elements
    Failure Indicators: Blank page, React error overlay, missing elements
    Evidence: .sisyphus/evidence/task-4-describe-step.png

  Scenario: Enter description and generate config, land on Edit step
    Tool: Playwright
    Preconditions: Gateway running, AI generation endpoint available
    Steps:
      1. Navigate to creation page
      2. Type "An employee that monitors the #general channel and posts daily summaries" into the description textarea
      3. Select or type a Slack channel (e.g. type "C1234" if no channels loaded)
      4. Assert: "Generate" button becomes enabled
      5. Click "Generate"
      6. Wait for spinner to disappear (up to 30s — LLM generation)
      7. Assert: Edit step is shown — look for "Identity" label and textarea
      8. Assert: "Execution Steps" textarea is visible and pre-filled
      9. Assert: "Delivery Steps" textarea is visible
      10. Assert: Employee name input is visible and pre-filled with a kebab-case slug
      11. Assert: Approval toggle (checkbox) is visible
      12. Assert: "Preview AGENTS.md" button is visible
      13. Screenshot the edit step
    Expected Result: All 3 core textareas pre-filled from generation, key settings visible
    Failure Indicators: Stuck on spinner, fields empty, missing textareas
    Evidence: .sisyphus/evidence/task-4-edit-step.png

  Scenario: Edit fields and verify local state
    Tool: Playwright
    Preconditions: On Edit step (after generation)
    Steps:
      1. Clear the Identity textarea and type "You are a test employee."
      2. Assert: Identity textarea now contains "You are a test employee."
      3. Modify the employee name to "test-employee-modified"
      4. Assert: name input shows "test-employee-modified"
      5. Click "← Back" to return to Describe step
      6. Assert: description textarea still has the original description text
    Expected Result: Local state management works — edits are preserved, back navigation works
    Failure Indicators: State lost on edit, back button doesn't work, description cleared
    Evidence: .sisyphus/evidence/task-4-edit-state.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): rebuild creation wizard steps 1-3 (describe, generate, edit fields)`
  - Files: `dashboard/src/panels/employees/CreateEmployeePage.tsx`
  - Pre-commit: `pnpm build`

- [x] 5. Add wizard steps 4-5: Preview AGENTS.md and Save Draft

  **What to do**:
  Continue building `CreateEmployeePage.tsx` by adding the Preview and Save steps.

  **Step 1 — "Previewing" loading state** (step === 'previewing'):
  - When user clicks "Preview AGENTS.md →" on the Edit step:
    1. Set step to 'previewing'
    2. Call `compilePreview(tenantId, { identity: editedFields.identity, execution_steps: editedFields.execution_steps, delivery_steps: editedFields.delivery_steps || null })`
    3. On success → store `compiledPreview` string, set step to 'preview'
    4. On error → set step to 'error'
  - Show spinner with "Compiling AGENTS.md preview…"

  **Step 2 — Preview step** (step === 'preview'):
  - **Header**: "Preview AGENTS.md" with subtitle "This is what your employee will see as its instruction manual"
  - **Rendered markdown**: Use `<MarkdownPreview content={compiledPreview} />` from `@/components/MarkdownPreview`
    - Wrap in a card container: `rounded-lg border bg-card p-4 overflow-auto max-h-[600px]`
  - **Navigation buttons**:
    - "← Back to Edit" → set step to 'edit' (preserves all edited fields)
    - "Save as Draft" → trigger save flow
  - No view toggle (rendered only, no source mode). Keep it simple for creation.

  **Step 3 — Save flow** (step === 'saving'):
  - Show spinner with "Saving draft…"
  - Build the `CreateArchetypePayload` from edited state:
    ```typescript
    const payload: CreateArchetypePayload = {
      role_name: editedFields.role_name,
      model: 'minimax/minimax-m2.7', // hardcoded default
      runtime: 'opencode',
      instructions: editedFields.execution_steps, // backward compat
      identity: editedFields.identity,
      execution_steps: editedFields.execution_steps,
      delivery_steps: editedFields.delivery_steps || null,
      delivery_instructions: config.delivery_instructions,
      deliverable_type: config.deliverable_type,
      risk_model: {
        approval_required: editedFields.approval_required,
        timeout_hours: config.risk_model.timeout_hours,
      },
      trigger_sources: buildTriggerSources(editedFields.trigger_type),
      tool_registry: config.tool_registry,
      concurrency_limit: config.concurrency_limit,
      notification_channel: notificationChannel || null,
      status: 'draft',
      overview: config.overview,
      parent_draft_id: null,
    };
    ```
  - `buildTriggerSources(type)`: helper that returns `{ type: 'manual' }`, `{ type: 'scheduled', cron: '0 8 * * 1-5' }`, or `{ type: 'webhook' }` based on selection
  - Call `createArchetype(tenantId, payload)`
  - On success → `navigate(`/dashboard/employees/${archetype.id}`)`
  - On error → set step to 'error'

  **Step 4 — Add MarkdownPreview import**:
  - `import { MarkdownPreview } from '@/components/MarkdownPreview';`
  - `import { compilePreview, generateArchetype, createArchetype, fetchSlackChannels } from '@/lib/gateway';`
  - Remove unused imports: `recommendModel`, `ModelRecommendation`, `ModelQuestionAnswers`, `ModelQuestionsStep`, `ModelRecommendationStep`

  **Must NOT do**:
  - Do NOT add a "Rendered/Source" toggle (keep preview simple — rendered only)
  - Do NOT add model selection logic
  - Do NOT include employee rules or knowledge in the preview (they don't exist yet)
  - Do NOT delete `ModelQuestionsStep.tsx` or `ModelRecommendationStep.tsx` files (they may be reused)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI work with markdown rendering, state transitions, and save flow
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — after T4)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3, 4 (needs compile-preview endpoint from T2, updated types from T3, wizard foundation from T4)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/components/MarkdownPreview.tsx:1-14` — MarkdownPreview component using ReactMarkdown + remarkGfm. Just pass `content={compiledPreview}` and it renders markdown.
  - `dashboard/src/panels/employees/DebugTab.tsx:44-57` — ContentView showing how MarkdownPreview is used with a card wrapper and max-height
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:64-83` — Current `handleSaveDraft` function — shows the save pattern with `createArchetype()` call and navigation

  **API/Type References** (contracts to implement against):
  - `dashboard/src/lib/gateway.ts` — `compilePreview()` function added in Task 3
  - `dashboard/src/lib/gateway.ts:211-219` — `createArchetype()` function
  - `dashboard/src/lib/types.ts:328-335` — `CreateArchetypePayload` type (updated in Task 3)

  **WHY Each Reference Matters**:
  - `MarkdownPreview` is the same component used in DebugTab — ensures visual consistency between preview during creation and the debug view
  - Current `handleSaveDraft` shows the exact save-and-navigate pattern to replicate

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Click Preview and see compiled AGENTS.md
    Tool: Playwright
    Preconditions: On Edit step with fields filled, gateway running (compile-preview endpoint from T2)
    Steps:
      1. From the Edit step, click "Preview AGENTS.md →"
      2. Wait for spinner to disappear (compile-preview API call, < 2s)
      3. Assert: Preview step is shown with rendered markdown
      4. Assert: content contains the identity text from the Edit step
      5. Assert: content contains "<execution-instructions>" heading or section
      6. Assert: content contains "Platform Rules" section
      7. Assert: "Save as Draft" button is visible
      8. Assert: "← Back to Edit" button is visible
      9. Screenshot the preview
    Expected Result: Compiled AGENTS.md preview renders correctly with all sections
    Failure Indicators: Spinner stuck, preview empty, missing sections, API error
    Evidence: .sisyphus/evidence/task-5-preview-step.png

  Scenario: Save draft and navigate to detail page
    Tool: Playwright
    Preconditions: On Preview step, gateway running with CreateArchetypeBodySchema fix (T1)
    Steps:
      1. From the Preview step, click "Save as Draft"
      2. Wait for navigation (up to 5s)
      3. Assert: URL changed to /dashboard/employees/<uuid> pattern
      4. Assert: page shows the employee detail page
      5. Assert: no error overlay or failed save
    Expected Result: Draft archetype created, user navigated to detail page
    Failure Indicators: Error message, stuck on saving spinner, 400/500 from gateway
    Evidence: .sisyphus/evidence/task-5-save-draft.png

  Scenario: Back navigation from Preview preserves edits
    Tool: Playwright
    Preconditions: On Preview step
    Steps:
      1. Click "← Back to Edit"
      2. Assert: Edit step is shown
      3. Assert: Identity textarea still contains previously edited text
      4. Assert: Execution Steps textarea still contains previously edited text
      5. Assert: Employee name still shows previously edited value
    Expected Result: All edited fields preserved after back navigation
    Failure Indicators: Fields reset to original generated values
    Evidence: .sisyphus/evidence/task-5-back-preserves-edits.png

  Scenario: Error during save shows error state
    Tool: Playwright
    Preconditions: On Preview step, simulate error (e.g. invalid API key)
    Steps:
      1. Clear admin API key from localStorage
      2. Click "Save as Draft"
      3. Assert: Error message appears
      4. Assert: "Try Again" button visible
      5. Click "Try Again"
      6. Assert: Returns to Describe step
    Expected Result: Error handled gracefully with retry option
    Failure Indicators: Unhandled exception, blank page, no retry option
    Evidence: .sisyphus/evidence/task-5-save-error.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add AGENTS.md preview and save draft steps to creation wizard`
  - Files: `dashboard/src/panels/employees/CreateEmployeePage.tsx`
  - Pre-commit: `pnpm build`

- [x] 6. End-to-end integration wiring and build verification

  **What to do**:
  This task ensures all pieces from T1-T5 work together as a complete flow. It's primarily verification and bug-fixing, not new feature work.
  - **Verify build**: Run `pnpm build` from the project root. Fix any TypeScript errors.
  - **Verify compile-preview route registration**: Check that `admin-brain-preview.ts` routes are registered in the gateway entry point. The existing `adminBrainPreviewRoutes()` is already registered — the new POST route was added to the same router in T2, so no new registration needed. Confirm by checking `src/gateway/routes/index.ts` or wherever routes are mounted.
  - **Verify `instructions` backward compat**: When saving a draft, the payload sends `instructions: editedFields.execution_steps`. Confirm the backend receives and stores it.
  - **Verify full flow end-to-end**: Walk through the entire wizard in a browser:
    1. Navigate to `/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
    2. Enter description, select Slack channel, click Generate
    3. Wait for generation, verify Edit step shows pre-filled fields
    4. Edit identity text, click "Preview AGENTS.md"
    5. Verify preview shows the edited identity text in the compiled output
    6. Click "Save as Draft"
    7. Verify navigation to detail page
    8. Verify on detail page: identity, execution_steps, delivery_steps fields are populated
  - **Fix any integration issues** discovered during the walkthrough
  - **Final build verification**: `pnpm build` exits 0

  **Must NOT do**:
  - Do NOT add new features
  - Do NOT modify the wizard flow or add new steps
  - Do NOT fix pre-existing test failures

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full stack integration — needs to trace data flow from frontend through gateway to database and back, fix any mismatches
  - **Skills**: [`playwright`]
    - `playwright`: Needed for browser-based end-to-end walkthrough and verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after all Wave 2 tasks)
  - **Blocks**: F1-F4, T7
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - All files from T1-T5 — this task reads across all of them to verify integration

  **API/Type References**:
  - `src/gateway/routes/admin-archetypes.ts` — CreateArchetypeBodySchema (from T1)
  - `src/gateway/routes/admin-brain-preview.ts` — compile-preview endpoint (from T2)
  - `dashboard/src/lib/types.ts` — GenerateArchetypeResponse, CreateArchetypePayload (from T3)
  - `dashboard/src/lib/gateway.ts` — compilePreview(), createArchetype() functions (from T3)
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx` — full wizard (from T4+T5)

  **WHY Each Reference Matters**:
  - This is the integration task — it verifies the contract between all prior tasks is correctly implemented

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full creation flow end-to-end
    Tool: Playwright
    Preconditions: All services running (pnpm dev), Docker healthy
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003
      2. Type description: "An employee that monitors Slack channels and sends daily summaries"
      3. Enter or select a Slack channel
      4. Click "Generate"
      5. Wait for Edit step to appear (up to 30s)
      6. Verify: Identity textarea is pre-filled
      7. Verify: Execution Steps textarea is pre-filled
      8. Edit the Identity field: prepend "INTEGRATION TEST - "
      9. Click "Preview AGENTS.md →"
      10. Wait for preview to render
      11. Verify: preview contains "INTEGRATION TEST - " in the output
      12. Verify: preview contains "<execution-instructions>" section
      13. Verify: preview contains "Platform Rules" section
      14. Click "Save as Draft"
      15. Wait for navigation to detail page
      16. Capture the new archetype ID from the URL
      17. Verify detail page loads without errors
      18. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT identity, execution_steps, delivery_steps, instructions FROM archetypes WHERE id='<captured-id>';"
      19. Verify: identity starts with "INTEGRATION TEST - "
      20. Verify: execution_steps is non-empty
      21. Verify: instructions = execution_steps (backward compat)
    Expected Result: Complete flow works — generation, editing, preview, save, and DB persistence all correct
    Failure Indicators: Any step fails, data mismatch between frontend and DB, missing fields
    Evidence: .sisyphus/evidence/task-6-e2e-full-flow.png

  Scenario: Build verification
    Tool: Bash
    Preconditions: All code changes from T1-T5 committed
    Steps:
      1. pnpm build
      2. Assert: exit code 0
    Expected Result: Clean build with zero errors
    Failure Indicators: TypeScript errors, missing imports
    Evidence: .sisyphus/evidence/task-6-build-pass.txt
  ```

  **Cleanup**: Delete the integration test archetype after verification:

  ```bash
  source .env && curl -s -X DELETE "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/<id>" -H "X-Admin-Key: $ADMIN_API_KEY"
  ```

  **Commit**: YES (only if bug fixes were needed)
  - Message: `fix(dashboard): resolve integration issues in employee creation flow`
  - Files: any files that needed fixes
  - Pre-commit: `pnpm build`

- [x] 7. Stress test: run daily-real-estate-inspiration-2-copy 20 times

  **What to do**:
  Run the existing `daily-real-estate-inspiration-2-copy` employee 20 consecutive times using the stress-test script to verify platform stability after all code changes. If any runs fail, diagnose and fix the root cause before proceeding.
  - **Step 1 — Ensure services are running**: Confirm gateway (`curl localhost:7700/health`), Inngest (`curl localhost:8288/health`), and Docker worker image is built (`docker images ai-employee-worker:latest`)
  - **Step 2 — Run the stress test**:
    ```bash
    pnpm stress-test --count 20 --concurrency 1 --employee daily-real-estate-inspiration-2-copy --timeout 300
    ```
    This runs in a long-running tmux session (takes ~20-60 minutes depending on task duration). Monitor via the log file.
  - **Step 3 — Evaluate results**:
    - Read the JSON output file at the path printed by the script
    - Success criteria: **20/20 tasks reach `Done` status** with 0 failures
    - Check for anomalies: tag bleed, retries, missing Slack posts
    - Review p50/p90/p99 timing for sanity (no extreme outliers)
  - **Step 4 — If any failures occur**:
    - Examine the failed task IDs in the stress test output
    - Query DB for task status and error info: `SELECT id, status, error FROM tasks WHERE id = '<failed_task_id>'`
    - Check gateway logs for errors during that task
    - Diagnose root cause — if it's related to our code changes (CreateArchetypeBodySchema, compile-preview endpoint, etc.), fix and re-run
    - If it's a pre-existing/transient issue (LLM timeout, Docker flakiness), document but don't block
    - Re-run the stress test after any fix to confirm 20/20

  **Must NOT do**:
  - Do NOT modify the stress-test script itself
  - Do NOT count pre-existing transient failures (LLM provider downtime, Docker cold start) as blockers — document them
  - Do NOT skip the re-run if a fix was applied

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Long-running test requiring monitoring, result analysis, potential debugging across multiple layers (gateway, lifecycle, worker, DB)
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after T6, before T8)
  - **Blocks**: Tasks 8, F1-F4
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `scripts/stress-test.ts` — Stress test script. Defaults: `--employee daily-real-estate-inspiration-2-copy`, `--tenant 00000000-0000-0000-0000-000000000003` (VLRE). Outputs JSON report to `/tmp/stress-test-<timestamp>.json`.

  **Employee Details**:
  - Archetype ID: `ad5f02f0-f38d-4e00-abd0-4973cd93a7eb`
  - Tenant: VLRE (`00000000-0000-0000-0000-000000000003`)
  - Model: `deepseek/deepseek-v4-flash`
  - `approval_required: false` → goes straight to Done (no Slack approval card needed)
  - Notification channel: `C0960S2Q8RL`

  **WHY Each Reference Matters**:
  - The stress-test script already defaults to this exact employee — just pass `--count 20`
  - `approval_required: false` means each run should complete autonomously without human intervention

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 20/20 stress test passes
    Tool: Bash (tmux for long-running, then read output)
    Preconditions: All services running, Docker image built, code changes from T1-T6 deployed
    Steps:
      1. Launch: pnpm stress-test --count 20 --concurrency 1 --employee daily-real-estate-inspiration-2-copy --timeout 300
      2. Monitor progress (poll log file every 60s)
      3. Wait for completion (EXIT_CODE in log)
      4. Read the JSON output file
      5. Assert: "successCount" === 20
      6. Assert: "failureCount" === 0
      7. Assert: no anomalies flagged (tag bleed, retries)
      8. Save the full JSON report as evidence
    Expected Result: 20 out of 20 tasks complete with Done status, zero failures
    Failure Indicators: Any task with status !== 'Done', failureCount > 0, anomaly flags
    Evidence: .sisyphus/evidence/task-7-stress-test-report.json

  Scenario: If failures occur — diagnose and re-run
    Tool: Bash
    Preconditions: First stress test had failures
    Steps:
      1. Extract failed task IDs from the report
      2. For each failed task: psql query for status, error, task_status_log
      3. Check gateway logs for errors during that task's execution window
      4. Identify root cause — categorize as "our change" vs "transient/pre-existing"
      5. If our change: fix, commit, re-run stress test
      6. If transient: document in evidence file, run replacement tasks to reach 20 successes
    Expected Result: Root cause identified, fixed if applicable, 20 clean passes achieved
    Failure Indicators: Unable to diagnose, same failure repeats after fix
    Evidence: .sisyphus/evidence/task-7-stress-test-diagnosis.md
  ```

  **Commit**: YES (only if bug fixes were needed)
  - Message: `fix: resolve issues found during stress test`
  - Files: whatever files needed fixing
  - Pre-commit: `pnpm build`

- [x] 8. Notify completion via Telegram

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "📋 Employee creation redesign complete — all tasks done, 20/20 stress test passed. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after T7)
  - **Blocks**: None
  - **Blocked By**: Task 7

  **References**: None needed.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID set in .env
    Steps:
      1. tsx scripts/telegram-notify.ts "📋 Employee creation redesign complete — all tasks done, 20/20 stress test passed. Come back to review results."
      2. Assert: exit code 0
    Expected Result: Message delivered to Telegram
    Failure Indicators: Non-zero exit code, error message
    Evidence: .sisyphus/evidence/task-8-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Navigate to `/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`. Complete the full creation wizard: enter description, wait for generation, edit fields, preview AGENTS.md, save draft. Verify the new employee appears in the list. Open the detail page and confirm all fields are persisted. Check edge cases: empty description, very long text, missing Slack channel.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                                          | Files                                                        |
| ---- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| T1   | `fix(gateway): add identity, execution_steps, delivery_steps, temperature to CreateArchetypeBodySchema` | `src/gateway/routes/admin-archetypes.ts`                     |
| T2   | `feat(gateway): add compile-preview endpoint for AGENTS.md preview`                                     | `src/gateway/routes/admin-brain-preview.ts`                  |
| T3   | `fix(dashboard): update frontend types for new archetype fields`                                        | `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts` |
| T4   | `feat(dashboard): rebuild creation wizard steps 1-3 (describe, generate, edit)`                         | `dashboard/src/panels/employees/CreateEmployeePage.tsx`      |
| T5   | `feat(dashboard): add AGENTS.md preview step to creation wizard`                                        | `dashboard/src/panels/employees/CreateEmployeePage.tsx`      |
| T6   | `feat(dashboard): wire end-to-end creation flow with all new fields`                                    | multiple files                                               |
| T7   | (no commit unless bug fixes needed)                                                                     | stress test only                                             |

---

## Success Criteria

### Verification Commands

```bash
pnpm build  # Expected: exit 0
curl -s -X POST http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/compile-preview \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identity":"Test identity","execution_steps":"1. Step one","delivery_steps":"1. Deliver"}' \
  | jq '.compiled_agents_md | length'  # Expected: > 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build passes
- [ ] Full wizard flow works end-to-end (Playwright verified)
- [ ] Stress test: 20/20 runs of daily-real-estate-inspiration-2-copy complete with Done status
