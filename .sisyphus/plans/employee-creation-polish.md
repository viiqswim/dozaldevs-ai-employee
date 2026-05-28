# Polish Employee Creation Flow

## TL;DR

> **Quick Summary**: Polish the existing Describe → Generate → Review → Deploy wizard in the dashboard to surface missing fields (input schema, model, overview, temperature), improve field descriptions, organize the edit step into collapsible sections, tune the AI generator's system prompt, and fix the notification_channel null bug.
>
> **Deliverables**:
>
> - Enhanced `CreateEmployeePage.tsx` with collapsible sections, new fields, and improved descriptions
> - Local-state `InputSchemaEditor` component for the creation flow
> - Read-only overview display card
> - Model recommendation summary card
> - Temperature slider with non-technical label
> - Improved AI generator `SYSTEM_PROMPT` in `archetype-generator.ts`
> - `notification_channel` bug fix
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (restructure) → Tasks 2-7 (new features) → Tasks 8-9 (generator + integration) → Final Verification

---

## Context

### Original Request

The user has a proven working model for AI employees with 100% success rate using a cheap model. They want to codify this pattern into the creation process so future employees are created following the same structure. The runtime pipeline (AGENTS.md compilation, prompt assembly, XML-tagged phases) is solid — the gap is in the creation UX.

### Interview Summary

**Key Discussions**:

- The Describe → Generate → Edit → Preview → Save flow already exists and works
- The biggest pain point is field confusion — unclear what goes in `identity` vs `execution_steps` vs `execution_instructions`
- `execution_instructions` (the prompt) is platform plumbing — PMs should never see it
- `delivery_steps` vs `delivery_instructions`: PM only edits delivery_steps; delivery_instructions is a legacy fallback
- No templates/examples needed — the AI generator should produce good enough output
- Overview is read-only display only (structured JSON, not editable)
- Input schema editing should reuse existing component patterns (but needs local-state wrapper)
- Model recommendation auto-applied and shown as summary card (no wizard step)

**Research Findings**:

- `CreateEmployeePage.tsx` (389 lines) has a clean wizard state machine with steps: describe → generating → edit → previewing → preview → saving → error
- The AI generator's `SYSTEM_PROMPT` already understands the field separation correctly
- `CollapsibleSection` component already exists and is ready to use
- `InputSchemaSection.tsx` exists but calls `patchArchetype()` (needs archetype ID) — cannot reuse directly for creation flow
- `ModelQuestionsStep.tsx` and `ModelRecommendationStep.tsx` exist but won't be used (auto-select instead)
- The `postProcess()` function maps `execution_steps → instructions` — this is load-bearing and must not be touched

### Metis Review

**Identified Gaps** (addressed):

- Overview editing scope unclear → Locked to read-only display card
- InputSchemaSection requires archetype ID → Will build local-state wrapper
- `notification_channel || null` is a live bug → Included as explicit fix task
- Temperature label is technical → Will use "Creativity" with non-technical description
- SYSTEM_PROMPT tuning is open-ended → Will define specific enumerable changes

---

## Work Objectives

### Core Objective

Polish the dashboard employee creation wizard to surface all relevant fields, improve descriptions, and organize the edit step — so PMs can confidently create employees that follow the proven working model.

### Concrete Deliverables

- Enhanced `CreateEmployeePage.tsx` with collapsible sections and all fields
- New `InputSchemaEditor.tsx` component (local-state, for creation flow)
- Improved field descriptions throughout the edit step
- Read-only overview card, model summary card, temperature slider
- Improved `SYSTEM_PROMPT` in `archetype-generator.ts`
- `notification_channel` bug fix

### Definition of Done

- [ ] `pnpm build` passes with zero errors
- [ ] `pnpm lint` passes
- [ ] Full creation flow works end-to-end: describe → generate → edit (all fields) → preview → save → verify DB row

### Must Have

- Collapsible sections in the edit step (Core, Delivery, Settings)
- Input schema editing with local state (no API calls during creation)
- Model recommendation summary displayed after generation
- Temperature control with non-technical label
- Read-only overview display
- Improved field descriptions for all edit step fields
- Generator SYSTEM_PROMPT improvements
- notification_channel bug fix

### Must NOT Have (Guardrails)

- DO NOT touch `postProcess()` `execution_steps → instructions` mapping in archetype-generator.ts
- DO NOT change `CreateArchetypeBodySchema` field names in admin-archetypes.ts
- DO NOT add new wizard steps (no `WizardStep` union changes)
- DO NOT expose `execution_instructions` or `delivery_instructions` as editable fields
- DO NOT modify `EmployeeDetail.tsx`, `EditEmployeePage.tsx`, or `InputSchemaSection.tsx`
- DO NOT use `ModelQuestionsStep` as a blocking wizard step
- DO NOT build array editing UI for the `workflow[]` field in overview
- DO NOT add explanatory tooltips beyond one-line descriptions
- DO NOT rewrite labels/descriptions outside `CreateEmployeePage.tsx` and its new components
- No DB schema changes (field renames)
- No automated tests — agent QA scenarios only

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None (user explicit waiver)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — restructure + extract):
├── Task 1: Restructure edit step into collapsible sections [visual-engineering]
├── Task 2: Build local-state InputSchemaEditor component [visual-engineering]
├── Task 3: Fix notification_channel null bug [quick]

Wave 2 (New features — MAX PARALLEL, all depend on Task 1):
├── Task 4: Add model recommendation summary card (depends: 1) [visual-engineering]
├── Task 5: Add temperature control (depends: 1) [quick]
├── Task 6: Add read-only overview card (depends: 1) [visual-engineering]
├── Task 7: Improve field descriptions (depends: 1) [quick]

Wave 3 (Integration + generator):
├── Task 8: Tune AI generator SYSTEM_PROMPT [unspecified-high]
├── Task 9: Integrate InputSchemaEditor + wire all new fields to save (depends: 1, 2, 4, 5, 6, 7) [visual-engineering]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 9 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

| Task | Depends On       | Blocks        | Wave |
| ---- | ---------------- | ------------- | ---- |
| 1    | —                | 4, 5, 6, 7, 9 | 1    |
| 2    | —                | 9             | 1    |
| 3    | —                | —             | 1    |
| 4    | 1                | 9             | 2    |
| 5    | 1                | 9             | 2    |
| 6    | 1                | 9             | 2    |
| 7    | 1                | 9             | 2    |
| 8    | —                | —             | 3    |
| 9    | 1, 2, 4, 5, 6, 7 | F1-F4         | 3    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `visual-engineering`, T2 → `visual-engineering`, T3 → `quick`
- **Wave 2**: 4 tasks — T4 → `visual-engineering`, T5 → `quick`, T6 → `visual-engineering`, T7 → `quick`
- **Wave 3**: 2 tasks — T8 → `unspecified-high`, T9 → `visual-engineering`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Restructure edit step into collapsible sections

  **What to do**:
  - Refactor the `step === 'edit'` block in `CreateEmployeePage.tsx` to wrap existing fields into three `CollapsibleSection` groups:
    - **Core** (default open): Employee Name (`role_name`), Identity, Execution Steps
    - **Delivery** (default open): Delivery Steps, Requires Approval toggle
    - **Settings** (default closed): Trigger type selector
  - Import `CollapsibleSection` from `@/panels/employees/components/CollapsibleSection`
  - Move the Slack Channel selector from the `describe` step into the **Settings** collapsible section in the `edit` step. This consolidates all configuration into one place. Update the `describe` step to remove the channel picker and the validation that requires `notificationChannel` to be set before generating.
  - Keep the same `editedFields` state shape — no state changes, just visual reorganization
  - Ensure the `← Back to Describe` and `Preview AGENTS.md →` buttons remain at the bottom, outside the collapsible sections

  **Must NOT do**:
  - Do NOT change the `WizardStep` type union
  - Do NOT modify field names or state management
  - Do NOT touch the describe, preview, or save steps
  - Do NOT reorder fields within a section beyond what's specified

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI restructuring with component composition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/components/CollapsibleSection.tsx` — The collapsible section component. Props: `title`, `subtitle`, `defaultOpen`, `children`, `actions`, `badge`, `id`. Uses `rounded-lg border bg-card` card shell.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx` — Shows how `CollapsibleSection` is used in the existing employee detail page (see the Profile tab sections)

  **Implementation References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:244-339` — The current `step === 'edit'` block that needs restructuring. Contains: role_name input, identity textarea, execution_steps textarea, delivery_steps textarea, approval checkbox, trigger selector, navigation buttons.
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:174-232` — The current `step === 'describe'` block with the Slack channel picker that should move to the edit step's Settings section.

  **WHY Each Reference Matters**:
  - `CollapsibleSection.tsx` — Exact component to use. Copy the import and usage pattern from EmployeeDetail.tsx.
  - `CreateEmployeePage.tsx:244-339` — This is the exact code to restructure. Every field here needs to move into a CollapsibleSection wrapper.
  - `CreateEmployeePage.tsx:174-232` — The Slack channel picker + its state (`slackChannels`, `slackLoading`, `slackError`, `notificationChannel`) need to move from here to the Settings section. The generate button validation must be updated to not require channel selection.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Edit step shows three collapsible sections
    Tool: Playwright
    Preconditions: Dev server running at localhost:7701, navigate to /dashboard/employees/new
    Steps:
      1. Enter description "An employee that monitors Slack daily and posts a summary" in the textarea
      2. Click "Generate" button (no channel selection required now)
      3. Wait for edit step to load
      4. Assert: CollapsibleSection with title "Core" is visible and expanded (defaultOpen)
      5. Assert: CollapsibleSection with title "Delivery" is visible and expanded
      6. Assert: CollapsibleSection with title "Settings" is visible and collapsed
      7. Click on "Settings" section header to expand it
      8. Assert: Trigger type selector is visible inside Settings
      9. Assert: Slack channel selector is visible inside Settings
      10. Assert: "← Back to Describe" and "Preview AGENTS.md →" buttons are at the bottom
    Expected Result: Three collapsible sections render correctly with fields in the right groups
    Failure Indicators: Fields not wrapped in CollapsibleSection, wrong sections expanded/collapsed
    Evidence: .sisyphus/evidence/task-1-collapsible-sections.png

  Scenario: Describe step no longer has Slack channel picker
    Tool: Playwright
    Preconditions: Dev server running, navigate to /dashboard/employees/new
    Steps:
      1. Assert: No Slack channel selector visible in the describe step
      2. Assert: Generate button is enabled when description has 10+ characters (no channel required)
    Expected Result: Describe step only has description textarea and Generate button
    Failure Indicators: Channel picker still in describe step, Generate button requires channel
    Evidence: .sisyphus/evidence/task-1-describe-step-clean.png
  ```

  **Evidence to Capture:**
  - [ ] task-1-collapsible-sections.png — Screenshot of edit step with all three sections
  - [ ] task-1-describe-step-clean.png — Screenshot of simplified describe step

  **Commit**: YES
  - Message: `refactor(dashboard): restructure employee creation edit step into collapsible sections`
  - Files: `dashboard/src/panels/employees/CreateEmployeePage.tsx`
  - Pre-commit: `pnpm build`

- [x] 2. Build local-state InputSchemaEditor component

  **What to do**:
  - Create `dashboard/src/panels/employees/components/InputSchemaEditor.tsx`
  - This is a **local-state version** of `InputSchemaSection` that works without an archetype ID. Instead of calling `patchArchetype()`, it manages state locally and exposes changes via a callback prop.
  - Props: `items: InputSchemaItem[]`, `instructions: string`, `onChange: (items: InputSchemaItem[]) => void`
  - Reuse the visual patterns from `InputSchemaSection.tsx`: `InlineForm` layout, `ItemRow` layout, type/frequency labels, validation logic. Copy the inner component patterns — do NOT import from InputSchemaSection (it's tightly coupled to API calls).
  - Support: add, edit, delete items — all local state, no API calls
  - Include the same validation: key regex, required label, select type requires options
  - Omit: the delete confirmation dialog with "scrub instructions" checkbox (that's an API-dependent feature). Simple inline delete is fine for creation flow.

  **Must NOT do**:
  - Do NOT modify the existing `InputSchemaSection.tsx`
  - Do NOT import from or depend on `InputSchemaSection.tsx`
  - Do NOT make any API calls from this component
  - Do NOT add features beyond what InputSchemaSection already has (no new field types, etc.)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with form handling and state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/sections/InputSchemaSection.tsx:112-296` — The `InlineForm` component. Copy the visual structure (label, type selector, frequency selector, required checkbox, description, options for select type, default value, save/cancel buttons).
  - `dashboard/src/panels/employees/sections/InputSchemaSection.tsx:305-343` — The `ItemRow` component. Copy the visual structure (label, type badge, frequency badge, required indicator, edit/delete buttons).
  - `dashboard/src/panels/employees/sections/InputSchemaSection.tsx:37-103` — Validation logic (`KEY_REGEX`, `deriveKey`, `validate`), `FormState` interface, `DEFAULT_FORM`, `itemToForm` helper — all reusable as-is.

  **Type References**:
  - `dashboard/src/lib/types.ts:InputSchemaItem` — The type definition for input schema items. Props: `key`, `label`, `type`, `frequency`, `required`, `description?`, `options?`, `default_value?`

  **WHY Each Reference Matters**:
  - `InputSchemaSection.tsx:112-296` — The exact form UI to replicate. The visual design and UX patterns should match exactly.
  - `InputSchemaSection.tsx:305-343` — The item display row to replicate. Same badges, same edit/delete actions.
  - `InputSchemaSection.tsx:37-103` — Validation + helper functions. Copy these verbatim — they have no API dependencies.
  - `types.ts:InputSchemaItem` — The type both components use for items. Ensures compatibility.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Add an input schema item
    Tool: Playwright
    Preconditions: InputSchemaEditor rendered with empty items array
    Steps:
      1. Click "Add input" button
      2. Fill label: "Report Date"
      3. Select type: "Date"
      4. Select frequency: "Every run"
      5. Check "Required field" checkbox
      6. Fill description: "The date to generate the report for"
      7. Click "Save" button
      8. Assert: ItemRow appears with label "Report Date", badge "Date", badge "Every run", "Required" indicator
    Expected Result: Item is added to the local list and displayed
    Failure Indicators: Item not appearing, validation errors, save button not working
    Evidence: .sisyphus/evidence/task-2-add-item.png

  Scenario: Delete an input schema item
    Tool: Playwright
    Preconditions: InputSchemaEditor rendered with one item
    Steps:
      1. Click the trash icon on the item row
      2. Assert: Item disappears from the list
      3. Assert: "No trigger inputs" placeholder OR "Add input" button is visible
    Expected Result: Item is removed from the local list
    Failure Indicators: Item still visible, error thrown
    Evidence: .sisyphus/evidence/task-2-delete-item.png

  Scenario: Validation prevents invalid items
    Tool: Playwright
    Preconditions: InputSchemaEditor rendered, click "Add input"
    Steps:
      1. Leave label empty, click "Save"
      2. Assert: Error text "Label is required" appears
      3. Fill label: "My Input"
      4. Select type: "Dropdown"
      5. Leave options empty, click "Save"
      6. Assert: Error text about options appears
    Expected Result: Validation messages shown for required fields
    Failure Indicators: No validation, items saved with missing data
    Evidence: .sisyphus/evidence/task-2-validation-errors.png
  ```

  **Evidence to Capture:**
  - [ ] task-2-add-item.png
  - [ ] task-2-delete-item.png
  - [ ] task-2-validation-errors.png

  **Commit**: YES
  - Message: `feat(dashboard): add local-state InputSchemaEditor for employee creation flow`
  - Files: `dashboard/src/panels/employees/components/InputSchemaEditor.tsx`
  - Pre-commit: `pnpm build`

- [x] 3. Fix notification_channel null bug

  **What to do**:
  - The `CreateArchetypeBodySchema` in `admin-archetypes.ts` requires `notification_channel` as `z.string().min(1).max(50)`, but `CreateEmployeePage.tsx` passes `notification_channel: notificationChannel || null` which sends `null` if the user clears the field.
  - Fix approach: Make `notification_channel` optional in the API schema — change to `z.string().min(1).max(50).optional().or(z.literal(''))` or `.nullable()`. The field is semantically optional (fallback to tenant default channel).
  - Also update `PatchArchetypeBodySchema` if it has the same issue.
  - Verify the lifecycle handles null/undefined `notification_channel` correctly (it should fall back to `tenant.config.notification_channel`).

  **Must NOT do**:
  - Do NOT change the field name
  - Do NOT add new required fields
  - Do NOT modify the employee creation UI for this task (that's Task 1's territory)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file Zod schema fix
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Implementation References**:
  - `src/gateway/routes/admin-archetypes.ts` — Contains `CreateArchetypeBodySchema` with the `notification_channel` field. Find the Zod schema and make the field optional/nullable.
  - `src/gateway/routes/admin-archetypes.ts` — Also contains `PatchArchetypeBodySchema` — check if same issue.

  **Behavior References**:
  - `src/inngest/employee-lifecycle.ts` — The lifecycle reads `archetype.notification_channel` and falls back to tenant config. Verify it handles null gracefully (search for `notification_channel`).

  **WHY Each Reference Matters**:
  - `admin-archetypes.ts` — This is the exact file to modify. The Zod schema validation is the root cause of the bug.
  - `employee-lifecycle.ts` — Verifying the downstream consumer handles null correctly ensures the fix doesn't create a different bug.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Create archetype without notification_channel
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. source .env
      2. curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"role_name":"test-no-channel","model":"minimax/minimax-m2.7","runtime":"opencode","instructions":"Test employee","risk_model":{"approval_required":false,"timeout_hours":24}}'
      3. Assert: HTTP 201 (not 400)
      4. Assert: Response contains archetype ID
    Expected Result: Archetype created successfully without notification_channel
    Failure Indicators: HTTP 400 with Zod validation error about notification_channel
    Evidence: .sisyphus/evidence/task-3-no-channel-create.txt

  Scenario: Create archetype with notification_channel still works
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. source .env
      2. curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"role_name":"test-with-channel","model":"minimax/minimax-m2.7","runtime":"opencode","instructions":"Test employee","notification_channel":"C12345","risk_model":{"approval_required":false,"timeout_hours":24}}'
      3. Assert: HTTP 201
      4. Assert: Response archetype has notification_channel = "C12345"
    Expected Result: Archetype created with notification_channel value preserved
    Failure Indicators: HTTP 400 or notification_channel not saved
    Evidence: .sisyphus/evidence/task-3-with-channel-create.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-no-channel-create.txt
  - [ ] task-3-with-channel-create.txt

  **Commit**: YES
  - Message: `fix(api): make notification_channel optional in archetype creation schema`
  - Files: `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Add model recommendation summary card to edit step

  **What to do**:
  - In the edit step of `CreateEmployeePage.tsx`, add a read-only summary card at the top of the **Settings** collapsible section (inside the section added in Task 1) showing the model that was recommended after generation.
  - The `config` state already contains `modelRecommendation?: ModelRecommendation` from the `generateArchetype()` response. Display:
    - Model name (from `config.model`)
    - One-line reason why it was selected (from `modelRecommendation.recommended.reason` if available)
    - A small badge or indicator if cheaper/premium alternatives exist
  - The card is **read-only** — no model picker, no dropdown, no change button
  - Style: `rounded-md border bg-muted/10 px-3 py-2` — consistent with existing edit step cards
  - If `modelRecommendation` is null/undefined (recommendation engine failed), show the model name with a fallback label like "Default model"

  **Must NOT do**:
  - Do NOT add a model picker or dropdown selector
  - Do NOT wire `ModelQuestionsStep.tsx` or `ModelRecommendationStep.tsx` into the wizard
  - Do NOT add a "Change model" button or any interactive model selection
  - Do NOT modify `archetype-generator.ts`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI card component with data display
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Type References**:
  - `dashboard/src/lib/types.ts:GenerateArchetypeResponse` — Contains `modelRecommendation?: ModelRecommendation`. The `ModelRecommendation` type has `recommended: { modelId, provider, modelName, reason, scores }`, `cheaperAlternative?`, `premiumAlternative?`.
  - `dashboard/src/lib/types.ts:ModelRecommendation` — Full type with `recommended`, `cheaperAlternative`, `premiumAlternative` fields.

  **Pattern References**:
  - `dashboard/src/panels/employees/components/ModelRecommendationStep.tsx` — Shows how model recommendation data is displayed (card layout, reason text, score display). Copy the visual style but make it read-only and inline (not a full wizard step).

  **Implementation References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:35` — `config` state variable that holds `GenerateArchetypeResponse` including `modelRecommendation`.

  **WHY Each Reference Matters**:
  - `types.ts:ModelRecommendation` — Need to know the exact data shape to display. The `reason` field is the one-liner to show.
  - `ModelRecommendationStep.tsx` — Visual reference for how model info is displayed. Adapt to a smaller inline card.
  - `CreateEmployeePage.tsx:35` — Where to read the model data from. `config.model` is the selected model ID, `config.modelRecommendation` has the details.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Model recommendation card displays after generation
    Tool: Playwright
    Preconditions: Dev server running, navigate to /dashboard/employees/new
    Steps:
      1. Enter description "An employee that reads Slack channels and posts a daily digest"
      2. Click "Generate"
      3. Wait for edit step to load
      4. Expand "Settings" section
      5. Assert: A card with model name text is visible (e.g. contains "minimax" or another model ID)
      6. Assert: Card is not interactive (no click handlers, no dropdowns)
    Expected Result: Read-only model summary card visible in Settings section
    Failure Indicators: No model card, card is interactive, crash on null modelRecommendation
    Evidence: .sisyphus/evidence/task-4-model-card.png
  ```

  **Evidence to Capture:**
  - [ ] task-4-model-card.png

  **Commit**: YES (groups with Tasks 5, 6, 7)
  - Message: `feat(dashboard): add model summary, temperature, overview, and field descriptions to creation wizard`
  - Files: `dashboard/src/panels/employees/CreateEmployeePage.tsx`
  - Pre-commit: `pnpm build`

- [x] 5. Add temperature control to edit step

  **What to do**:
  - Add a temperature slider + numeric input to the **Settings** collapsible section in `CreateEmployeePage.tsx` (added in Task 1)
  - Add `temperature` to the `editedFields` state (default: `1.0`)
  - When `config` is set from generation, initialize `temperature` from `config.temperature ?? 1.0` (though the generator doesn't currently return temperature, so default is fine)
  - Label: "Creativity" (NOT "Temperature" — end-user language convention)
  - Description: "Higher values produce more varied responses. Lower values are more focused and predictable."
  - UI: A range slider from 0 to 2 with 0.1 step, showing the numeric value. Use a native `<input type="range">` styled with Tailwind.
  - Show markers or labels at key points: 0 (Focused), 1.0 (Balanced), 2.0 (Creative)

  **Must NOT do**:
  - Do NOT add explanatory tooltips or help modals beyond the one-line description
  - Do NOT use the word "Temperature" in user-facing labels
  - Do NOT change the API schema's temperature range (already 0-2)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single input control with simple state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/sections/TemperatureSection.tsx` — The existing temperature display in the employee detail page. Shows how temperature is presented and the slider pattern used. Adapt for the creation flow.

  **Schema References**:
  - `src/gateway/routes/admin-archetypes.ts:CreateArchetypeBodySchema` — `temperature` field: `z.number().min(0).max(2).optional()`. Default 1.0.

  **Implementation References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:36-43` — `editedFields` state. Add `temperature: number` to this object.

  **WHY Each Reference Matters**:
  - `TemperatureSection.tsx` — The existing temperature UI component. May be able to reuse the slider pattern directly.
  - `CreateArchetypeBodySchema` — Confirms the API accepts temperature as optional, range 0-2.
  - `CreateEmployeePage.tsx:36-43` — Where to add the new state field.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Temperature slider renders and adjusts value
    Tool: Playwright
    Preconditions: Edit step loaded after generation
    Steps:
      1. Expand "Settings" section
      2. Assert: Slider labeled "Creativity" is visible
      3. Assert: Description text about "varied responses" is visible
      4. Assert: Current value shows "1.0" (default)
      5. Adjust slider to approximately 0.3
      6. Assert: Displayed value updates to reflect the change
    Expected Result: Slider works, value updates, label is "Creativity" not "Temperature"
    Failure Indicators: Label says "Temperature", slider not functional, value not updating
    Evidence: .sisyphus/evidence/task-5-temperature-slider.png
  ```

  **Evidence to Capture:**
  - [ ] task-5-temperature-slider.png

  **Commit**: YES (groups with Tasks 4, 6, 7)
  - Message: (same as Task 4 group commit)

- [x] 6. Add read-only overview card to edit step

  **What to do**:
  - Add a read-only overview card inside the **Core** collapsible section in `CreateEmployeePage.tsx` (below the existing fields)
  - The `config` state already contains `overview: { role, trigger, workflow[], tools_used, output, approval }` from the generation response
  - Display as a formatted card with labeled fields:
    - **Role**: `overview.role`
    - **Trigger**: `overview.trigger`
    - **Workflow**: `overview.workflow.join(' → ')` (array displayed as flow)
    - **Tools**: `overview.tools_used`
    - **Output**: `overview.output`
    - **Approval**: `overview.approval`
  - Style: `rounded-md border bg-muted/10 px-4 py-3` with `text-sm` for values, `text-xs font-medium text-muted-foreground` for labels
  - The card is **read-only** — no editing capability
  - If `overview` is null/undefined, hide the card entirely (don't show an empty shell)

  **Must NOT do**:
  - Do NOT make any overview field editable
  - Do NOT build array editing UI for `workflow[]`
  - Do NOT add an "Edit overview" button or modal
  - Do NOT add overview fields to `editedFields` state

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Read-only card with structured data display
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Type References**:
  - `dashboard/src/lib/types.ts:GenerateArchetypeResponse` — `overview: { role: string, trigger: string, workflow: string[], tools_used: string, output: string, approval: string }`

  **Pattern References**:
  - `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx` — Shows how the overview is displayed in the employee detail page. Use the same visual structure.

  **Implementation References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:35` — `config` state that holds the overview data.

  **WHY Each Reference Matters**:
  - `types.ts:GenerateArchetypeResponse` — The exact shape of the overview data to display.
  - `ProfilePreviewSection.tsx` — Existing overview display pattern. Match the visual style.
  - `CreateEmployeePage.tsx:35` — Where to read overview from: `config?.overview`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Overview card displays AI-generated overview
    Tool: Playwright
    Preconditions: Edit step loaded after generation
    Steps:
      1. Inside "Core" section, scroll to find the overview card
      2. Assert: Card contains labeled fields: "Role", "Trigger", "Workflow", "Tools", "Output", "Approval"
      3. Assert: Values are non-empty text (from AI generation)
      4. Assert: Workflow shows steps separated by " → " arrows
      5. Assert: No edit buttons, no textareas, no interactive elements on the card
    Expected Result: Read-only overview card displays structured data from generation
    Failure Indicators: Card not visible, fields empty, card is editable
    Evidence: .sisyphus/evidence/task-6-overview-card.png

  Scenario: Overview card hidden when overview is null
    Tool: Playwright
    Preconditions: Edit step loaded, config.overview is null (simulate by intercepting network response or testing error recovery)
    Steps:
      1. Assert: No overview card visible in Core section
      2. Assert: Other fields (Identity, Execution Steps) still render correctly
    Expected Result: No empty shell or crash when overview is null
    Failure Indicators: Empty card shell visible, React error
    Evidence: .sisyphus/evidence/task-6-overview-null.png
  ```

  **Evidence to Capture:**
  - [ ] task-6-overview-card.png
  - [ ] task-6-overview-null.png

  **Commit**: YES (groups with Tasks 4, 5, 7)
  - Message: (same as Task 4 group commit)

- [x] 7. Improve field descriptions for all edit step fields

  **What to do**:
  - Update the `<p className="text-xs text-muted-foreground">` description text for EVERY field in the edit step of `CreateEmployeePage.tsx`
  - New descriptions should be clear, non-technical, and explain what the field does in the context of the employee's runtime behavior:
    - **Employee Name**: "A unique identifier for this employee (lowercase, hyphens only). Used in URLs and API calls." (keep existing, it's fine)
    - **Identity**: "Describe who this employee is — their personality, background, and expertise. This shapes how they think and communicate. Don't include step-by-step instructions here."
    - **Execution Steps**: "The numbered steps this employee follows when doing their job. Be specific — these go directly into the employee's instruction manual."
    - **Delivery Steps**: "How this employee delivers their completed work (e.g., posting to Slack, sending a message). Only needed when approval is required — leave empty for auto-complete employees."
    - **Requires Approval**: "When enabled, a team member must review and approve the employee's work before it's delivered."
    - **Trigger**: "How this employee gets started — manually by a team member, on a schedule, or when something happens (webhook)."
    - **Slack Channel**: "The Slack channel where this employee operates. All notifications, approvals, and deliveries go here."
    - **Creativity** (temperature): Already handled in Task 5

  **Must NOT do**:
  - Do NOT change field labels (only descriptions)
  - Do NOT add tooltip icons or help modals
  - Do NOT change descriptions outside `CreateEmployeePage.tsx`
  - Do NOT use technical jargon (no "AGENTS.md", "XML tags", "archetype", "execution_instructions")

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text-only changes, no logic modifications
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Implementation References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:265-266` — Identity description: currently "Who is this employee? Their role, personality, and purpose."
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:276-277` — Execution Steps description: currently "Step-by-step instructions for what this employee does."
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:289-290` — Delivery Steps description: currently "(Optional) How this employee delivers its results."

  **Convention References**:
  - AGENTS.md "Key Conventions" section — "End-user language is non-technical". End users are property managers and small business owners.

  **WHY Each Reference Matters**:
  - `CreateEmployeePage.tsx` lines — Exact locations of descriptions to update.
  - AGENTS.md convention — Enforces non-technical language requirement for all descriptions.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Field descriptions are updated and non-technical
    Tool: Playwright
    Preconditions: Edit step loaded after generation
    Steps:
      1. Assert: Identity description contains "personality" and "Don't include step-by-step"
      2. Assert: Execution Steps description contains "instruction manual"
      3. Assert: Delivery Steps description contains "approval is required" and "auto-complete"
      4. Assert: No description contains technical terms: "AGENTS.md", "XML", "archetype", "execution_instructions"
    Expected Result: All descriptions are clear, helpful, and non-technical
    Failure Indicators: Old descriptions still present, technical jargon found
    Evidence: .sisyphus/evidence/task-7-field-descriptions.png
  ```

  **Evidence to Capture:**
  - [ ] task-7-field-descriptions.png

  **Commit**: YES (groups with Tasks 4, 5, 6)
  - Message: (same as Task 4 group commit)

- [x] 8. Tune AI generator SYSTEM_PROMPT

  **What to do**:
  - Improve the `SYSTEM_PROMPT` constant in `src/gateway/services/archetype-generator.ts` with the following specific, enumerable changes:

  **Change 1 — Strengthen identity guidance**:
  Add to the `identity` rule: "The identity MUST include: (a) the employee's name/title, (b) which organization they work for, (c) their area of expertise, (d) their communication style. Example: 'You are Alex, the Operations Coordinator at Acme Properties. You specialize in daily operations reporting and communicate in a concise, professional tone.'"

  **Change 2 — Add execution_steps quality requirements**:
  Add after the existing execution_steps rules: "Each step MUST be a concrete action, not a vague instruction. Bad: '1. Analyze the data.' Good: '1. Read all messages in the #support Slack channel from the last 24 hours using the Slack read-channel tool.' Steps must reference specific tools from tool_registry by name when applicable."

  **Change 3 — Strengthen delivery_steps guidance**:
  Replace the current delivery_steps rule with: "`delivery_steps` is a numbered list of steps describing how approved content is delivered to its final destination. MUST include: (a) read the approved content from `<approved-content>`, (b) the specific delivery action (e.g., 'Post to Slack using post-message tool'), (c) submit output confirming delivery. Set to null ONLY if approval_required is false AND no delivery action is needed."

  **Change 4 — Add explicit separation warning**:
  Add a new rule: "SEPARATION OF CONCERNS (CRITICAL): `identity` = WHO (persona, no actions). `execution_steps` = WHAT TO DO (actions during work). `delivery_steps` = HOW TO DELIVER (actions after approval). Never put procedural steps in `identity`. Never put persona description in `execution_steps`."

  **Change 5 — Improve `delivery_instructions` guidance**:
  Replace the current delivery_instructions note with: "`delivery_instructions` is a LEGACY FIELD — set it to the same value as `delivery_steps` for backwards compatibility. If `delivery_steps` is null, `delivery_instructions` must also be null."
  - Also apply the same 5 changes to `REFINE_SYSTEM_PROMPT` where applicable (changes 1, 2, 3, 4 apply; change 5 is already implied)

  **Must NOT do**:
  - Do NOT touch `postProcess()` — especially the `execution_steps → instructions` mapping
  - Do NOT change the JSON shape specification
  - Do NOT change the model used for generation (`anthropic/claude-haiku-4-5`)
  - Do NOT add iterative tuning loops or A/B testing
  - Do NOT remove existing rules — only add/strengthen

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt engineering requires careful wording to maintain JSON output quality
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 9)
  - **Blocks**: None
  - **Blocked By**: None (independent of UI tasks)

  **References**:

  **Implementation References**:
  - `src/gateway/services/archetype-generator.ts:52-150` — The `SYSTEM_PROMPT` constant. This is the exact text to modify with changes 1-5.
  - `src/gateway/services/archetype-generator.ts:152-168` — The `REFINE_SYSTEM_PROMPT` constant. Apply changes 1-4 here.
  - `src/gateway/services/archetype-generator.ts:244-291` — `postProcess()` function. DO NOT TOUCH this function. Read it to understand the `instructions = execution_steps` mapping.

  **Working Model References**:
  - `prisma/seed.ts` — Contains the 5 seeded archetypes that represent the "proven model". Read the `identity`, `execution_steps` (via `instructions` field), and `delivery_steps`/`delivery_instructions` for guest-messaging and daily-summarizer to understand what "good" looks like.

  **WHY Each Reference Matters**:
  - `archetype-generator.ts:52-150` — The exact text to edit. Every change must be inserted at a specific location in this prompt.
  - `archetype-generator.ts:152-168` — The refinement prompt also needs these improvements.
  - `postProcess()` — Must understand what NOT to touch. The `instructions = execution_steps` line is load-bearing.
  - `prisma/seed.ts` — The patterns here represent what the generator should produce. Reading the working examples informs whether the changes are correct.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Generator produces well-structured output with improved prompt
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. source .env
      2. curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/generate" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"description":"An employee that monitors our Slack #support channel every morning and posts a summary of unresolved tickets to the #ops-team channel"}' | jq .
      3. Assert: `identity` contains a name/title, organization reference, expertise area, and communication style
      4. Assert: `execution_steps` has 3+ numbered steps, each referencing specific actions (not vague like "analyze")
      5. Assert: `identity` does NOT contain numbered procedural steps
      6. Assert: `execution_steps` does NOT contain persona/personality descriptions
      7. Assert: `delivery_steps` references `<approved-content>` and a specific delivery action
    Expected Result: Generated archetype follows the separation of concerns and has concrete, actionable steps
    Failure Indicators: Identity contains procedures, execution_steps are vague, delivery_steps is null when it shouldn't be
    Evidence: .sisyphus/evidence/task-8-generator-output.json

  Scenario: Generator handles edge case — no-approval employee
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. source .env
      2. curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/generate" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"description":"An employee that automatically rotates door lock codes every week without needing approval"}' | jq .
      3. Assert: `risk_model.approval_required` is false
      4. Assert: `delivery_steps` is null
      5. Assert: `delivery_instructions` is null
    Expected Result: No-approval employee correctly has null delivery fields
    Failure Indicators: delivery_steps populated when approval is false
    Evidence: .sisyphus/evidence/task-8-no-approval-output.json
  ```

  **Evidence to Capture:**
  - [ ] task-8-generator-output.json
  - [ ] task-8-no-approval-output.json

  **Commit**: YES
  - Message: `feat(generator): tune archetype generator SYSTEM_PROMPT for proven employee patterns`
  - Files: `src/gateway/services/archetype-generator.ts`
  - Pre-commit: `pnpm build`

- [x] 9. Integrate all new fields into save flow and wire state

  **What to do**:
  - This is the integration task that connects all new UI elements (from Tasks 2, 4, 5, 6) into the `CreateEmployeePage.tsx` state management and save flow.

  **State changes**:
  - Add to `editedFields`: `temperature: number` (default `1.0`)
  - Add new state: `inputSchemaItems: InputSchemaItem[]` (default `[]`)
  - When `config` is set from generation (in `handleGenerate`), initialize:
    - `temperature` from `config.temperature ?? 1.0` (note: generator doesn't return temperature, so this is for future-proofing)
    - `inputSchemaItems` from `config.input_schema ?? []`

  **Integration**:
  - Import `InputSchemaEditor` from Task 2 and render it inside the **Core** collapsible section (below Execution Steps)
  - Pass `items={inputSchemaItems}`, `instructions={editedFields.execution_steps}`, `onChange={setInputSchemaItems}`
  - The overview card (Task 6) reads from `config?.overview` — no state changes needed (read-only)
  - The model card (Task 4) reads from `config?.model` and `config?.modelRecommendation` — no state changes needed (read-only)

  **Save flow changes** (in `handleSaveDraft`):
  - Pass `temperature: editedFields.temperature` to `createArchetype()`
  - Pass `input_schema: inputSchemaItems.length > 0 ? inputSchemaItems : undefined` to `createArchetype()`
  - Pass `overview: config?.overview ?? undefined` to `createArchetype()`
  - Verify the `createArchetype()` gateway function in `dashboard/src/lib/gateway.ts` accepts these new fields. If not, extend the request body.

  **Must NOT do**:
  - Do NOT modify the wizard step flow (no new steps)
  - Do NOT modify the preview step or AGENTS.md compilation
  - Do NOT add server-side validation changes (Task 3 handles the API)
  - Do NOT modify `InputSchemaEditor.tsx` (Task 2's output)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex state management and component integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — after Tasks 1, 2, 4, 5, 6, 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 4, 5, 6, 7

  **References**:

  **Implementation References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:36-43` — `editedFields` state object. Add `temperature`.
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:68-91` — `handleGenerate()` function. Initialize new state from `config`.
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:109-141` — `handleSaveDraft()` function. Pass new fields to `createArchetype()`.
  - `dashboard/src/lib/gateway.ts` — The `createArchetype()` function. Check if it passes all body fields to the API. If it filters fields, add the new ones.

  **Component References**:
  - `dashboard/src/panels/employees/components/InputSchemaEditor.tsx` — The component from Task 2. Props: `items`, `instructions`, `onChange`.

  **API References**:
  - `src/gateway/routes/admin-archetypes.ts:CreateArchetypeBodySchema` — The Zod schema. `temperature` is already optional. `input_schema` is `z.any().optional()`. `overview` is `z.any().optional()`. All fields are accepted.

  **WHY Each Reference Matters**:
  - `CreateEmployeePage.tsx:36-43` — Where to add `temperature` to state.
  - `handleGenerate()` — Where to initialize `inputSchemaItems` and `temperature` from AI response.
  - `handleSaveDraft()` — Where to thread new fields through to the API call.
  - `gateway.ts` — May need to update the `createArchetype()` function's request body construction.
  - `CreateArchetypeBodySchema` — Confirms the API already accepts all new fields.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full creation flow with all new fields saves correctly
    Tool: Playwright + Bash (curl)
    Preconditions: Dev server running, gateway running
    Steps:
      1. Navigate to /dashboard/employees/new
      2. Enter description: "An employee that monitors our Slack #support channel every morning and posts a summary of unresolved tickets to #ops-team"
      3. Click "Generate", wait for edit step
      4. In Core section: verify Identity, Execution Steps, Input Schema editor, Overview card are visible
      5. In Input Schema editor: verify AI-detected inputs are shown (if any), add one: label="Report Date", type="Date", frequency="Every run", required=true
      6. In Delivery section: verify Delivery Steps textarea, Approval toggle
      7. In Settings section: adjust Creativity slider to 0.5, verify model card is displayed, select a Slack channel
      8. Click "Preview AGENTS.md →", verify preview renders
      9. Click "Save as Draft", wait for redirect
      10. Extract archetype ID from the redirect URL
      11. curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.<ARCHETYPE_ID>&select=temperature,input_schema,overview,model,identity,role_name" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
      12. Assert: temperature = 0.5
      13. Assert: input_schema is a JSON array containing the "Report Date" item
      14. Assert: overview is a non-null JSON object with role, trigger, workflow keys
      15. Assert: model is a non-null string
      16. Assert: identity is a non-empty string
    Expected Result: All new fields are correctly persisted to the database
    Failure Indicators: Missing fields in DB, null values for fields that should be set, 400/500 error on save
    Evidence: .sisyphus/evidence/task-9-full-flow.png, .sisyphus/evidence/task-9-db-verify.json

  Scenario: Creation flow works with no input schema items
    Tool: Playwright + Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. Navigate to /dashboard/employees/new
      2. Enter description: "A simple employee that posts a motivational quote to Slack every morning"
      3. Click "Generate", wait for edit step
      4. Verify: Input Schema editor shows no items (or AI-detected items if any)
      5. Do NOT add any items
      6. Click "Preview AGENTS.md →", then "Save as Draft"
      7. Extract archetype ID, verify in DB
      8. Assert: input_schema is null or empty array (not an error)
    Expected Result: Employee saves correctly with no input schema
    Failure Indicators: API error, crash on empty array, input_schema field causing validation failure
    Evidence: .sisyphus/evidence/task-9-no-inputs.json
  ```

  **Evidence to Capture:**
  - [ ] task-9-full-flow.png
  - [ ] task-9-db-verify.json
  - [ ] task-9-no-inputs.json

  **Commit**: YES
  - Message: `feat(dashboard): wire all new fields into employee creation save flow`
  - Files: `dashboard/src/panels/employees/CreateEmployeePage.tsx`, `dashboard/src/lib/gateway.ts` (if modified)
  - Pre-commit: `pnpm build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (full creation flow with all new fields). Test edge cases: empty description, missing channel, generation failure. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [x] 10. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

---

## Commit Strategy

| After Task(s) | Commit Message                                                                                         | Files                                             |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 1             | `refactor(dashboard): restructure employee creation edit step into collapsible sections`               | `CreateEmployeePage.tsx`                          |
| 2             | `feat(dashboard): add local-state InputSchemaEditor for employee creation flow`                        | `InputSchemaEditor.tsx`                           |
| 3             | `fix(api): enforce notification_channel selection in employee creation`                                | `CreateEmployeePage.tsx` or `admin-archetypes.ts` |
| 4, 5, 6, 7    | `feat(dashboard): add model summary, temperature, overview, and field descriptions to creation wizard` | `CreateEmployeePage.tsx` + new section components |
| 8             | `feat(generator): tune archetype generator SYSTEM_PROMPT for proven employee patterns`                 | `archetype-generator.ts`                          |
| 9             | `feat(dashboard): wire all new fields into employee creation save flow`                                | `CreateEmployeePage.tsx`, `gateway.ts`            |

---

## Success Criteria

### Verification Commands

```bash
pnpm build    # Expected: zero errors
pnpm lint     # Expected: zero errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Full creation flow works: describe → generate → edit (all fields) → preview → save
- [ ] Saved archetype has correct values for all fields in DB
- [ ] Collapsible sections render correctly
- [ ] Input schema is editable and persisted
- [ ] Model recommendation displays after generation
- [ ] Temperature slider works and value is saved
- [ ] Overview displays as read-only card
- [ ] Field descriptions are clear and non-technical
- [ ] notification_channel bug is fixed
