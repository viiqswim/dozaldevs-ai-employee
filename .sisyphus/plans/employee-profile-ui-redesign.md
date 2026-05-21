# Employee Profile UI Redesign

## TL;DR

> **Quick Summary**: Replace the confusing 4-tab employee detail page with a single scrollable "Employee Profile" — plain language labels, inline editing, read-only auto-generated sections, and a full assembled-text preview. Apply the same layout to create and draft flows.
>
> **Deliverables**:
>
> - Unified `EmployeeProfileLayout` component used by all 3 employee pages
> - 6 profile sections: Assignment, Personality, Tools, Settings, Preview, Activity+Training
> - Inline editing with section-level save for Assignment and Personality
> - Full assembled-text preview with collapsible AGENTS.md blocks
> - Plain language labels throughout
> - Technical fields hidden in Advanced accordion (accessible, not deleted)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 6 → Task 7 → F1–F4

---

## Context

### Original Request

Victor completed the employee info architecture plan (prompt = task logic, AGENTS.md = identity + auto-injected sections). Now the dashboard UI needs to reflect this clean mental model. The current page has too many fields, technical labels, and no clear hierarchy — a property manager can't tell what the employee will actually see.

### Interview Summary

**Key Discussions**:

- **Audience**: Non-technical (property managers, property owners, other industries)
- **Problems**: Can't tell what employee sees; too many fields; not organized hierarchically
- **Actions needed**: View, Edit, and Verify before triggering
- **Page structure**: Single scrollable page (no tabs)
- **Editing**: Inline — click [Edit], editor appears in-place, Save/Cancel per section
- **Preview**: Full assembled text with collapsible blocks per AGENTS.md section
- **Activity & Training**: Collapsible sections on the same page
- **Scope**: All employee pages (detail, create, draft edit)

**Decisions Made**:

1. Section-level save model — each section has its own Save/Cancel buttons
2. Existing routes stay functional — old `/edit` URL redirects to profile in edit mode
3. Draft employees open in edit mode by default
4. Technical fields (model, runtime, VM) hidden in collapsed "Advanced" section — NOT deleted
5. Create flow keeps AI generation step, then shows profile in draft mode
6. Mobile/responsive is NOT in scope (follow-up plan)
7. No new npm dependencies unless justified
8. No backend/API changes

### Metis Review

**Identified Gaps** (addressed):

- **Save model undefined**: Resolved → section-level save (each section independently saves its field)
- **URL structure unclear**: Resolved → `/employees/:id` stays, `/employees/:id/edit` redirects to same page with edit mode param
- **Active employee editability**: Resolved → `instructions` and `agents_md` editable for active employees, plus settings. Technical fields read-only.
- **Technical fields inaccessible**: Resolved → hidden in collapsed "Advanced" section at bottom
- **Empty states undefined**: Resolved → each section has explicit empty state in task specs
- **Activity/Training embedding scope**: Resolved → Activity shows last 5 tasks with "View all" link, Training shows rules inline
- **Brain preview API dependency**: Validated → existing `/admin/brain-preview` returns structured sections, reuse as-is

---

## Work Objectives

### Core Objective

Replace the 4-tab employee detail page with a single scrollable "Employee Profile" that non-technical users can understand, edit, and verify — using the same layout for active, draft, and create flows.

### Concrete Deliverables

- `EmployeeProfileLayout` shared layout component
- `InlineEditableMarkdown` reusable wrapper (view → edit transition)
- `AssignmentSection`, `PersonalitySection` (editable content sections)
- `ToolsSection` (read-only tool cards), `CompactSettingsGrid` (settings)
- `ProfilePreviewSection` (brain-preview → collapsible blocks)
- Rewired `EmployeeDetail.tsx`, `EditEmployeePage.tsx`, `CreateEmployeePage.tsx`
- Route cleanup and deprecated component removal

### Definition of Done

- [ ] Employee detail page renders as single scrollable profile with all 6 sections
- [ ] Assignment and Personality editable inline with Save/Cancel
- [ ] Preview section shows full assembled AGENTS.md in collapsible blocks
- [ ] Create and draft flows use same layout
- [ ] `pnpm dashboard:build` succeeds (Vite build, no TS errors)
- [ ] Playwright screenshots confirm layout at http://localhost:7701/dashboard/

### Must Have

- Plain language labels on all user-facing sections
- Inline editing for Assignment and Personality with section-level save
- Read-only Tools section auto-generated from tool_registry
- Full assembled-text preview with collapsible blocks
- Settings as compact grid (approval, channel, duration, concurrency)
- Advanced/Technical section (collapsed) preserving access to model, runtime, VM, system_prompt
- Activity section showing recent tasks
- Training section showing learned rules
- All 3 flows (detail, create, draft) sharing the unified layout

### Must NOT Have (Guardrails)

- Do NOT modify any file outside `dashboard/src/`
- Do NOT add new API endpoints or modify existing ones (`/admin/brain-preview` stays as-is)
- Do NOT add new npm dependencies without explicit justification (use existing Radix primitives)
- Do NOT delete technical fields — hide them in Advanced accordion
- Do NOT use `<Select>` from Radix — use `SearchableSelect` for all new dropdowns
- Do NOT scatter mode-specific logic (`if (mode === 'edit')`) throughout — use props-driven composition
- Do NOT break existing URL routes — redirect old paths if needed
- Do NOT include mobile/responsive work (separate plan)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vite build, Playwright available)
- **Automated tests**: NO (dashboard has no unit test framework — QA via Playwright screenshots + build)
- **Framework**: Vite build (`pnpm dashboard:build`) + Playwright browser automation

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **UI Components**: Use Playwright — navigate to page, verify sections render, test interactions, screenshot
- **Build**: Use Bash — `pnpm dashboard:build` exits 0

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — shared components, all parallel):
├── Task 1: Profile types, labels, constants + CollapsibleSection + InlineEditableMarkdown [visual-engineering]
├── Task 2: AssignmentSection + PersonalitySection (view + inline edit) [visual-engineering]
├── Task 3: ToolsSection (read-only cards) + CompactSettingsGrid [visual-engineering]

Wave 2 (After Wave 1 — layout assembly + preview):
├── Task 4: ProfilePreviewSection — brain-preview API → collapsible blocks (depends: 1) [visual-engineering]
├── Task 5: EmployeeProfileLayout — assembles all sections + Advanced accordion (depends: 1, 2, 3) [visual-engineering]
├── Task 6: Rewire EmployeeDetail.tsx — replace 4-tab with profile layout (depends: 5) [visual-engineering]

Wave 3 (After Wave 2 — other pages + polish):
├── Task 7: Rewire EditEmployeePage + CreateEmployeePage (depends: 5, 6) [visual-engineering]
├── Task 8: Embed Activity + Training sections into profile (depends: 6) [visual-engineering]
├── Task 9: Route cleanup + remove deprecated components + empty/error states (depends: 6, 7, 8) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright skill)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
-> Task 10: Notify completion (quick)
```

### Dependency Matrix

| Task | Depends On | Blocks  |
| ---- | ---------- | ------- |
| 1    | —          | 4, 5    |
| 2    | —          | 5       |
| 3    | —          | 5       |
| 4    | 1          | 5       |
| 5    | 1, 2, 3, 4 | 6       |
| 6    | 5          | 7, 8, 9 |
| 7    | 5, 6       | 9       |
| 8    | 6          | 9       |
| 9    | 6, 7, 8    | F1–F4   |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `visual-engineering`, T2 → `visual-engineering`, T3 → `visual-engineering`
- **Wave 2**: 3 tasks — T4 → `visual-engineering`, T5 → `visual-engineering`, T6 → `visual-engineering`
- **Wave 3**: 3 tasks — T7 → `visual-engineering`, T8 → `visual-engineering`, T9 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Profile types, labels, constants + CollapsibleSection + InlineEditableMarkdown

  **What to do**:
  - Create `dashboard/src/lib/profile-constants.ts`:
    - Export `ProfileMode` type: `'view' | 'edit' | 'create'`
    - Export `SECTION_LABELS` object mapping technical fields to plain-language labels and subtitles (use the Label Mapping table at the bottom of this plan)
    - Export `SECTION_ORDER` array defining vertical section order: `['assignment', 'personality', 'tools', 'settings', 'preview', 'activity', 'training']`
    - Export helper `getSectionLabel(sectionId: string): { label: string; subtitle: string }` that returns from `SECTION_LABELS`
  - Create `dashboard/src/panels/employees/components/CollapsibleSection.tsx`:
    - Props: `title: string`, `subtitle?: string`, `defaultOpen?: boolean`, `children: ReactNode`, `actions?: ReactNode` (for Edit buttons), `badge?: ReactNode` (for counts like "3 rules")
    - Use Radix `Accordion` (single, collapsible) internally — match existing dashboard accordion patterns from `EmployeeDetail.tsx:514-560`
    - Animated chevron indicator (rotate on expand)
    - Section header has `title` in semibold, `subtitle` in muted-foreground beneath it, `actions` slot right-aligned, `badge` next to title
  - Create `dashboard/src/panels/employees/components/InlineEditableMarkdown.tsx`:
    - Props: `value: string`, `onChange: (v: string) => void`, `onSave: () => Promise<void>`, `onCancel: () => void`, `label: string`, `subtitle?: string`, `editing: boolean`, `saving?: boolean`, `error?: string | null`, `emptyText?: string`, `minHeight?: number`
    - **View mode** (`editing=false`): render `MarkdownPreview` with the value. Show `emptyText` in muted-foreground italic when value is empty/null. No Edit button here — parent controls the `editing` state.
    - **Edit mode** (`editing=true`): render `MarkdownEditorField` (import from `@/components/MarkdownEditorField`) with Save/Cancel buttons below. Save button shows "Saving..." when `saving=true`. Error message below buttons when `error` is set.
    - Smooth transition between modes (no layout shift — preserve container height)
  - Ensure all new files have proper TypeScript types, no `any`, and export correctly

  **Must NOT do**:
  - Do NOT create any page-level components — only shared primitives
  - Do NOT import from files that don't exist yet (T2-T9 components)
  - Do NOT add new npm dependencies — use existing Radix Accordion, existing MarkdownEditorField, existing MarkdownPreview

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: These are UI building blocks — visual components with props-driven rendering
  - **Skills**: []
    - No domain-specific skills needed — standard React component work
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — design is fully specified in the plan

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:514-560` — Existing Accordion usage pattern for collapsible sections (Technical Details accordion). Copy the AccordionItem/Trigger/Content structure.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:91-115` — `FieldLabel`, `FieldValue`, `LabelWithTooltip` helper components. Similar small helper pattern to follow for shared components.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:565-575` — `SaveCancelBar` pattern for Save/Cancel buttons in edit mode. Replicate this pattern inside InlineEditableMarkdown.
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:76-119` — `PromptSection` component with `<details>` element for collapsible content. Alternative pattern reference — but prefer Radix Accordion for consistency.

  **API/Type References** (contracts to implement against):
  - `dashboard/src/lib/types.ts:76-109` — `Archetype` interface. The `SECTION_LABELS` keys map to these field names.

  **Component References** (existing components to reuse):
  - `dashboard/src/components/MarkdownEditorField.tsx` — Import and use directly inside `InlineEditableMarkdown` for edit mode. Do NOT re-implement — just wrap it.
  - `dashboard/src/components/MarkdownPreview.tsx` — Import and use for view mode rendering.
  - `dashboard/src/components/ui/searchable-select.tsx` — Reference only for this task (used in T3). Confirms the component exists.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CollapsibleSection renders and toggles
    Tool: Bash
    Preconditions: All files created, dashboard builds
    Steps:
      1. Run `pnpm dashboard:build` from repo root
      2. Verify exit code is 0
      3. Grep the built output for "CollapsibleSection" to confirm it's included in the bundle
    Expected Result: Build succeeds with 0 errors. CollapsibleSection is tree-shaken in if imported.
    Failure Indicators: TypeScript errors, missing imports, build exit code != 0
    Evidence: .sisyphus/evidence/task-1-build-check.txt

  Scenario: TypeScript types are correct and exports work
    Tool: Bash
    Preconditions: Files created
    Steps:
      1. Run `npx tsc --noEmit --project dashboard/tsconfig.json` (or equivalent via `pnpm dashboard:build`)
      2. Verify no type errors in the new files
    Expected Result: Zero TypeScript errors in new files
    Failure Indicators: Type errors referencing profile-constants.ts, CollapsibleSection.tsx, or InlineEditableMarkdown.tsx
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: profile-constants exports are complete
    Tool: Bash
    Preconditions: profile-constants.ts created
    Steps:
      1. Grep `dashboard/src/lib/profile-constants.ts` for exports: `ProfileMode`, `SECTION_LABELS`, `SECTION_ORDER`, `getSectionLabel`
      2. Verify all 4 are present
      3. Verify SECTION_LABELS covers all fields from the Label Mapping table at the bottom of this plan (instructions, agents_md, tool_registry.tools, risk_model.approval_required, notification_channel, risk_model.timeout_hours, concurrency_limit, model, runtime, vm_size, system_prompt, deliverable_type)
    Expected Result: All 4 exports present, all 12 fields mapped
    Failure Indicators: Missing exports or unmapped fields
    Evidence: .sisyphus/evidence/task-1-constants-check.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add profile types, labels, and shared section components`
  - Files: `dashboard/src/lib/profile-constants.ts`, `dashboard/src/panels/employees/components/CollapsibleSection.tsx`, `dashboard/src/panels/employees/components/InlineEditableMarkdown.tsx`
  - Pre-commit: `pnpm dashboard:build`

- [x] 2. AssignmentSection + PersonalitySection (view + inline edit)

  **What to do**:
  - Create `dashboard/src/panels/employees/sections/AssignmentSection.tsx`:
    - Props: `archetype: Archetype`, `mode: ProfileMode`, `onSaved: () => void`, `tenantId: string`
    - Section header: title = "The Assignment", subtitle = "What this employee does each time they're triggered"
    - **View mode**: Wrap `InlineEditableMarkdown` with `editing=false`. Show an [Edit] button in the section header `actions` slot (only when `mode !== 'create'` — create mode is always editing).
    - **Edit mode**: `InlineEditableMarkdown` with `editing=true`. On save, call `patchArchetype(tenantId, archetype.id, { instructions: newValue })`. Show toast on success ("Assignment saved"), error on failure.
    - Empty state: "No assignment configured yet. Click Edit to add one." in muted-foreground italic
    - Use `CollapsibleSection` as the wrapper with `defaultOpen={true}`
  - Create `dashboard/src/panels/employees/sections/PersonalitySection.tsx`:
    - Props: same as AssignmentSection
    - Section header: title = "Personality", subtitle = "How this employee approaches their work"
    - Same view/edit pattern as AssignmentSection but saves `agents_md` field instead of `instructions`
    - Empty state: "No personality configured yet. Click Edit to add one."
    - Use `CollapsibleSection` as the wrapper with `defaultOpen={true}`
  - Both sections manage their own `editing` state internally (toggled by Edit button click)
  - Both sections call `patchArchetype` from `@/lib/gateway` for save — the same function already used in `EmployeeDetail.tsx:380-388`
  - Both show `toast.success()` / `toast.error()` using `sonner` — same pattern as `EmployeeDetail.tsx:382-386`

  **Must NOT do**:
  - Do NOT create the layout component — just the individual sections
  - Do NOT modify `EmployeeDetail.tsx` yet — that's Task 6
  - Do NOT add delete/create functionality — edit and view only
  - Do NOT duplicate the markdown editor — use `InlineEditableMarkdown` from Task 1

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI sections with inline editing — visual component work with state management
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Design fully specified, not needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately — but will import from Task 1's components. If running truly parallel, may need to create stub imports or run after T1 completes in practice)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:278-390` — `ConfigTab` component: the full edit-mode pattern with `patchArchetype`, save/cancel, error handling, toast notifications. This is THE reference for how to save archetype fields.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:336-390` — `handleSave` function: shows how to diff changes, call `patchArchetype`, and handle success/error. Copy this pattern for section-level save.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:500-508` — How `instructions` is currently displayed in view mode with `MarkdownPreview`. Replace this with `InlineEditableMarkdown`.

  **API/Type References** (contracts to implement against):
  - `dashboard/src/lib/types.ts:76-109` — `Archetype` interface: `instructions: string | null` (line 91), `agents_md: string | null` (line 93)
  - `dashboard/src/lib/gateway.ts` — `patchArchetype(tenantId, archetypeId, changes)` function. Already handles PATCH to gateway API.

  **Component References** (from Task 1 — will exist by Wave 1 completion):
  - `dashboard/src/panels/employees/components/InlineEditableMarkdown.tsx` — The wrapper to use for both sections
  - `dashboard/src/panels/employees/components/CollapsibleSection.tsx` — The section wrapper
  - `dashboard/src/lib/profile-constants.ts` — Import `ProfileMode` type and `getSectionLabel`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds with both new sections
    Tool: Bash
    Preconditions: Task 1 components exist, both section files created
    Steps:
      1. Run `pnpm dashboard:build`
      2. Verify exit code 0
    Expected Result: Clean build, no TypeScript errors
    Failure Indicators: Import errors for Task 1 components, type mismatches
    Evidence: .sisyphus/evidence/task-2-build-check.txt

  Scenario: AssignmentSection handles empty instructions
    Tool: Bash
    Preconditions: Files created
    Steps:
      1. Grep AssignmentSection.tsx for the empty state text "No assignment configured"
      2. Verify the component handles `archetype.instructions === null` case
    Expected Result: Empty state text present in component
    Failure Indicators: Missing null/empty check, no empty state UI
    Evidence: .sisyphus/evidence/task-2-empty-state-check.txt

  Scenario: Section-level save calls patchArchetype correctly
    Tool: Bash
    Preconditions: Files created
    Steps:
      1. Grep AssignmentSection.tsx for `patchArchetype` import and usage
      2. Verify it passes `{ instructions: ... }` (not the full archetype)
      3. Grep PersonalitySection.tsx for `patchArchetype` import and usage
      4. Verify it passes `{ agents_md: ... }`
    Expected Result: Both sections use patchArchetype with the correct single-field payload
    Failure Indicators: Missing patchArchetype call, wrong field name, full-object save
    Evidence: .sisyphus/evidence/task-2-save-pattern-check.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add Assignment and Personality inline-editable sections`
  - Files: `dashboard/src/panels/employees/sections/AssignmentSection.tsx`, `dashboard/src/panels/employees/sections/PersonalitySection.tsx`
  - Pre-commit: `pnpm dashboard:build`

- [x] 3. ToolsSection (read-only cards) + CompactSettingsGrid

  **What to do**:
  - Create `dashboard/src/panels/employees/sections/ToolsSection.tsx`:
    - Props: `archetype: Archetype`, `tenantId: string`
    - Title: "Tools", subtitle: "What this employee can use"
    - Fetch tool details from brain-preview API: call `fetchBrainPreview(tenantId, archetype.id)` from `@/lib/gateway` — same call as `BrainPreviewTab.tsx:158`. Extract `data.tools` and `data.skills` arrays.
    - **Tool cards**: For each tool, render a card showing: tool name (bold), service name (badge), description. Group by service (same grouping as `BrainPreviewTab.tsx:214-218`).
    - **Skills section**: Below tools, show "On-demand Skills" with name + description per skill (if any exist).
    - Empty state: "No tools configured for this employee."
    - Loading state: skeleton cards (3 placeholder cards with pulse animation)
    - Error state: "Could not load tools." in muted-foreground
    - This section is ALWAYS read-only — no edit mode
    - Wrap in `CollapsibleSection` with `defaultOpen={true}`
  - Create `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx`:
    - Props: `archetype: Archetype`, `mode: ProfileMode`, `onSaved: () => void`, `tenantId: string`
    - Title: "Settings", subtitle: "How this employee operates"
    - 2x2 grid layout showing:
      - **Requires approval**: Switch (view: disabled switch + "Approval Required"/"Auto-Approved" badge, edit: enabled switch). Copy badge styling from `EmployeeDetail.tsx:449-469`.
      - **Slack channel**: Text display in view mode (`#channel-name` resolved from `fetchSlackChannels`), `SearchableSelect` in edit mode. Copy the channel loading/resolution pattern from `EmployeeDetail.tsx:294-313` and `EmployeeDetail.tsx:628-655`.
      - **Maximum duration**: Text display ("X hours") in view, number input in edit
      - **Simultaneous tasks**: Text display in view, number input in edit
    - [Edit] button in section header (view mode) → switches all 4 fields to edit mode
    - Save/Cancel bar at bottom of section when editing
    - On save: call `patchArchetype` with only changed fields (diff like `EmployeeDetail.tsx:340-378`)
    - Wrap in `CollapsibleSection` with `defaultOpen={true}`

  **Must NOT do**:
  - Do NOT make tools editable — always read-only
  - Do NOT add tool management (add/remove tools) — out of scope
  - Do NOT use `<Select>` from Radix — use `SearchableSelect` for Slack channel dropdown
  - Do NOT duplicate the slack channel fetch — create a shared hook or inline it like ConfigTab does

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Two UI sections — one data-fetching read-only, one with edit mode grid layout
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Design fully specified

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately — imports CollapsibleSection from T1 but can stub if truly parallel)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:143-172` — Brain preview API call pattern. Copy this `useEffect` + `fetchBrainPreview` + loading/error state pattern for ToolsSection.
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:214-218` — Tool grouping by service. Copy this `reduce` pattern.
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:593-643` — Tool and skill rendering. Simplify this into card-based layout.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:441-509` — Settings grid in view mode. This is the current "Behavior & Settings" section — replicate this grid but in a more compact 2x2 layout.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:294-313` — Slack channel fetch pattern with `fetchSlackChannels`, loading state, error handling.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:628-655` — Slack channel `SearchableSelect` in edit mode. Copy this exact pattern.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:449-469` — Approval badge styling (amber for required, green for auto-approved). Copy these exact class strings.

  **API/Type References**:
  - `dashboard/src/lib/types.ts:244-282` — `BrainPreviewResponse` interface: `tools` array (line 258), `skills` array (line 259)
  - `dashboard/src/lib/types.ts:76-109` — `Archetype`: `risk_model` (line 83), `notification_channel` (line 85), `concurrency_limit` (line 84)
  - `dashboard/src/lib/gateway.ts` — `fetchBrainPreview(tenantId, archetypeId)`, `fetchSlackChannels(tenantId)`, `patchArchetype(tenantId, archetypeId, changes)`

  **Component References**:
  - `dashboard/src/components/ui/searchable-select.tsx` — MUST use for Slack channel dropdown
  - `dashboard/src/components/ui/button.tsx`, `badge.tsx`, `input.tsx`, `separator.tsx` — Existing UI primitives
  - `dashboard/src/panels/employees/components/CollapsibleSection.tsx` — From Task 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds with both new sections
    Tool: Bash
    Preconditions: Task 1 components exist, both section files created
    Steps:
      1. Run `pnpm dashboard:build`
      2. Verify exit code 0
    Expected Result: Clean build, no TypeScript errors
    Failure Indicators: Import errors, type mismatches with BrainPreviewResponse
    Evidence: .sisyphus/evidence/task-3-build-check.txt

  Scenario: ToolsSection uses fetchBrainPreview correctly
    Tool: Bash
    Preconditions: ToolsSection.tsx created
    Steps:
      1. Grep ToolsSection.tsx for `fetchBrainPreview` import
      2. Verify it extracts `data.tools` and `data.skills`
      3. Verify it has loading, error, and empty states
    Expected Result: Correct API usage with all 3 states handled
    Failure Indicators: Missing API call, missing state handling
    Evidence: .sisyphus/evidence/task-3-tools-api-check.txt

  Scenario: CompactSettingsGrid uses SearchableSelect for channel
    Tool: Bash
    Preconditions: CompactSettingsGrid.tsx created
    Steps:
      1. Grep CompactSettingsGrid.tsx for `SearchableSelect` import
      2. Verify it does NOT import `Select` from `@/components/ui/select`
      3. Verify it imports `fetchSlackChannels` from `@/lib/gateway`
    Expected Result: Uses SearchableSelect (not Select), fetches slack channels
    Failure Indicators: Uses wrong Select component, missing channel fetch
    Evidence: .sisyphus/evidence/task-3-settings-select-check.txt

  Scenario: Settings save uses field-level diff
    Tool: Bash
    Preconditions: CompactSettingsGrid.tsx created
    Steps:
      1. Grep CompactSettingsGrid.tsx for `patchArchetype` usage
      2. Verify changes object is built by comparing current vs edited values (not sending all fields)
    Expected Result: Only changed fields are sent to patchArchetype
    Failure Indicators: Sends entire archetype, no diff logic
    Evidence: .sisyphus/evidence/task-3-save-diff-check.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add Tools and Settings profile sections`
  - Files: `dashboard/src/panels/employees/sections/ToolsSection.tsx`, `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx`
  - Pre-commit: `pnpm dashboard:build`

- [x] 4. ProfilePreviewSection — brain-preview API → collapsible blocks

  **What to do**:
  - Create `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx`:
    - Props: `archetype: Archetype`, `tenantId: string`
    - Title: "What your employee receives", subtitle: "This is the complete set of instructions and context assembled automatically each time this employee runs"
    - Call `fetchBrainPreview(tenantId, archetype.id)` — same pattern as ToolsSection and existing `BrainPreviewTab.tsx`
    - Render the preview as a list of **collapsible blocks** (use `CollapsibleSection` from T1 for each), in this order:
      1. **"Task prompt"** — `data.execution_prompt` rendered via `MarkdownPreview`. Badge: char count. Default: expanded.
      2. **"Platform policy"** — `data.autoInjectedSections.securityPreamble`. Badge: "Auto-generated". Default: collapsed.
      3. **"How to complete work"** — `data.autoInjectedSections.outputContract`. Badge: "Auto-generated". Default: collapsed.
      4. **"Available tools"** — `data.agents_md.layers.platform` (the platform layer includes tool reference). Badge: tool count from `data.tools.length`. Default: collapsed.
      5. **"Employee personality"** — `data.agents_md.layers.employee` (the agents_md content). Badge: "Editable" if content exists. Default: collapsed.
      6. **"Organization conventions"** — `data.agents_md.layers.tenant`. Badge: "Auto-generated". Default: collapsed. Show "No organization conventions configured" if null.
      7. **"Learned rules"** — `data.agents_md.layers.rules`. Badge: rule count from `data.employee_rules.length`. Default: collapsed. Show "No rules learned yet" if null.
      8. **"Knowledge base"** — `data.agents_md.layers.knowledge`. Badge: entry count from `data.employee_knowledge.length`. Default: collapsed. Show "No knowledge base entries" if null.
    - Each block shows content as rendered markdown (via `MarkdownPreview`). NO raw/rendered toggle — keep it simple for non-technical users. (The raw debug view stays in BrainPreviewTab for developers if they navigate there directly.)
    - **Loading state**: skeleton with 8 collapsible placeholder blocks (pulse animation)
    - **Error state**: "Could not load preview. Please try again." with Retry button
    - Wrap the entire section in a `CollapsibleSection` with `defaultOpen={false}` (user opens when they want to verify)

  **Must NOT do**:
  - Do NOT add raw/rendered toggle — this is the user-friendly preview, not the debug view
  - Do NOT show environment variables, runtime config, or output contract details — those are developer concerns
  - Do NOT make any preview content editable — edit happens in Assignment/Personality sections
  - Do NOT duplicate the `fetchBrainPreview` call if ToolsSection already fetched it — BUT for simplicity and section independence, each section can make its own call (the API is fast and cached). If you want to optimize, you can lift the fetch to the parent layout later (out of scope for this task).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Data-fetching UI section with multiple collapsible blocks and markdown rendering
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Design fully specified in plan

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, can run alongside T5 prep work, but T5 depends on T4's output)
  - **Parallel Group**: Wave 2 (starts after Wave 1 completes)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (needs CollapsibleSection)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:143-172` — Brain preview fetch pattern. Copy this exact useEffect + state pattern.
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:76-119` — `PromptSection` component with collapsible content. This is the pattern being replaced — use `CollapsibleSection` from T1 instead, but reference the content rendering.
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:227-289` — "What This Employee Knows" section with humanFields. Reference for how the existing preview structures content, but the new version uses a different layout.
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:401-537` — AGENTS.md section with layers. The `data.agents_md.layers` structure is used here. Copy the null-check patterns for each layer.

  **API/Type References**:
  - `dashboard/src/lib/types.ts:244-282` — `BrainPreviewResponse`: `execution_prompt` (line 245), `agents_md.layers` (lines 248-256), `autoInjectedSections` (lines 277-281), `employee_rules` (line 270), `employee_knowledge` (line 271), `tools` (line 258)
  - `dashboard/src/lib/gateway.ts` — `fetchBrainPreview(tenantId, archetypeId)`

  **Component References**:
  - `dashboard/src/panels/employees/components/CollapsibleSection.tsx` — From Task 1. Use for each block.
  - `dashboard/src/components/MarkdownPreview.tsx` — Render each block's content
  - `dashboard/src/components/ui/badge.tsx` — For char count, "Auto-generated", "Editable" badges

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds
    Tool: Bash
    Preconditions: Task 1 CollapsibleSection exists, ProfilePreviewSection created
    Steps:
      1. Run `pnpm dashboard:build`
      2. Verify exit code 0
    Expected Result: Clean build
    Failure Indicators: Import errors for CollapsibleSection or MarkdownPreview
    Evidence: .sisyphus/evidence/task-4-build-check.txt

  Scenario: All 8 preview blocks are present
    Tool: Bash
    Preconditions: ProfilePreviewSection.tsx created
    Steps:
      1. Grep ProfilePreviewSection.tsx for each block title: "Task prompt", "Platform policy", "How to complete work", "Available tools", "Employee personality", "Organization conventions", "Learned rules", "Knowledge base"
      2. Verify all 8 titles appear in the file
    Expected Result: All 8 block titles found
    Failure Indicators: Missing blocks, wrong titles
    Evidence: .sisyphus/evidence/task-4-blocks-check.txt

  Scenario: No raw/rendered toggle exists
    Tool: Bash
    Preconditions: ProfilePreviewSection.tsx created
    Steps:
      1. Grep ProfilePreviewSection.tsx for "Raw" or "Rendered" or "rawState" or "onToggleRaw"
      2. Verify NONE of these patterns exist
    Expected Result: Zero matches — no debug toggle in user-facing preview
    Failure Indicators: Any raw/rendered toggle present
    Evidence: .sisyphus/evidence/task-4-no-raw-toggle-check.txt

  Scenario: Null layers show appropriate empty states
    Tool: Bash
    Preconditions: ProfilePreviewSection.tsx created
    Steps:
      1. Grep ProfilePreviewSection.tsx for "No organization conventions", "No rules learned", "No knowledge base"
      2. Verify all 3 empty state messages exist
    Expected Result: All null-layer empty states present
    Failure Indicators: Missing null checks or empty state messages
    Evidence: .sisyphus/evidence/task-4-empty-states-check.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add profile preview section with collapsible AGENTS.md blocks`
  - Files: `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx`
  - Pre-commit: `pnpm dashboard:build`

- [x] 5. EmployeeProfileLayout — assembles all sections + Advanced accordion

  **What to do**:
  - Create `dashboard/src/panels/employees/EmployeeProfileLayout.tsx`:
    - Props: `archetype: Archetype`, `mode: ProfileMode`, `tenantId: string`, `onSaved: () => void`, `showActivity?: boolean`, `showTraining?: boolean`
    - This is the **main layout component** that assembles all sections into the single scrollable page
    - Renders sections in order (vertical stack with `space-y-8` gaps):
      1. `AssignmentSection` (from T2) — always shown
      2. `PersonalitySection` (from T2) — always shown
      3. `ToolsSection` (from T3) — always shown
      4. `CompactSettingsGrid` (from T3) — always shown
      5. `ProfilePreviewSection` (from T4) — always shown, default collapsed
      6. Activity section slot — only when `showActivity={true}` (controlled by parent)
      7. Training section slot — only when `showTraining={true}` (controlled by parent)
      8. **Advanced section** — collapsed Accordion at the bottom with: Model, Runtime, VM Size, Deliverable Type, System Prompt. All read-only in view mode. Use existing accordion pattern from `EmployeeDetail.tsx:514-560`.
    - Activity and Training are rendered as `children` slots OR direct imports:
      - Activity: Import existing `ActivitySection` from `EmployeeDetail.tsx` (it's already a standalone function component at lines 129-276). Wrap in `CollapsibleSection` with title "Recent Activity", subtitle "Last tasks run by this employee", `defaultOpen={false}`.
      - Training: Import existing `TrainingTab` from `./TrainingTab`. Wrap in `CollapsibleSection` with title "Training", subtitle "Rules this employee has learned from your feedback", `defaultOpen={false}`.
    - Advanced section title: "Advanced / Technical", subtitle: "For developers only — most users can ignore this"
    - Advanced section shows: model (label: "AI Model"), runtime (label: "Runtime"), vm_size (label: "Machine size"), deliverable_type (label: "Output type"), system_prompt (label: "System prompt (legacy)" — rendered via `MarkdownPreview`)
    - Mode logic: `mode` prop flows to AssignmentSection, PersonalitySection, CompactSettingsGrid. ToolsSection and ProfilePreviewSection are always read-only. Advanced section is always read-only.

  **Must NOT do**:
  - Do NOT add page-level chrome (header, back button, trigger button) — that stays in the parent page component (EmployeeDetail)
  - Do NOT manage archetype fetching — parent passes `archetype` prop
  - Do NOT add routing logic — layout is route-agnostic
  - Do NOT make Advanced fields editable — they are developer-only display fields
  - Do NOT create new Activity or Training components — reuse the existing ones from `EmployeeDetail.tsx` and `TrainingTab.tsx`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Layout assembly component that composes multiple UI sections
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T1, T2, T3, T4)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3, 4 (needs all section components)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:129-276` — `ActivitySection` component. Import and reuse this directly — it's already a self-contained component that fetches its own data. Move it to its own file if needed for clean imports, or import from EmployeeDetail.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:514-560` — Advanced/Technical accordion pattern. Copy this structure for the Advanced section.
  - `dashboard/src/panels/employees/TrainingTab.tsx` — Import and wrap in CollapsibleSection. No changes needed to TrainingTab itself.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:278-721` — `ConfigTab` component. This is what the layout REPLACES — reference it to make sure all functionality is preserved.

  **Component References** (from earlier tasks):
  - `dashboard/src/panels/employees/sections/AssignmentSection.tsx` — From T2
  - `dashboard/src/panels/employees/sections/PersonalitySection.tsx` — From T2
  - `dashboard/src/panels/employees/sections/ToolsSection.tsx` — From T3
  - `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx` — From T3
  - `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx` — From T4
  - `dashboard/src/panels/employees/components/CollapsibleSection.tsx` — From T1
  - `dashboard/src/lib/profile-constants.ts` — `ProfileMode` type from T1

  **API/Type References**:
  - `dashboard/src/lib/types.ts:76-109` — `Archetype` interface
  - `dashboard/src/lib/profile-constants.ts` — `ProfileMode`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds with layout assembling all sections
    Tool: Bash
    Preconditions: All T1-T4 components exist, EmployeeProfileLayout created
    Steps:
      1. Run `pnpm dashboard:build`
      2. Verify exit code 0
    Expected Result: Clean build with all imports resolved
    Failure Indicators: Missing imports from T1-T4 components
    Evidence: .sisyphus/evidence/task-5-build-check.txt

  Scenario: Layout imports all required sections
    Tool: Bash
    Preconditions: EmployeeProfileLayout.tsx created
    Steps:
      1. Grep EmployeeProfileLayout.tsx for imports: AssignmentSection, PersonalitySection, ToolsSection, CompactSettingsGrid, ProfilePreviewSection
      2. Verify all 5 section imports are present
      3. Grep for TrainingTab import
      4. Grep for ActivitySection import or inline definition
    Expected Result: All section imports present
    Failure Indicators: Missing section imports
    Evidence: .sisyphus/evidence/task-5-imports-check.txt

  Scenario: Advanced section contains all technical fields
    Tool: Bash
    Preconditions: EmployeeProfileLayout.tsx created
    Steps:
      1. Grep EmployeeProfileLayout.tsx for: "AI Model", "Runtime", "Machine size", "Output type", "System prompt"
      2. Verify all 5 labels appear
      3. Verify they are inside an Accordion component
    Expected Result: All 5 technical field labels present inside Accordion
    Failure Indicators: Missing labels, not inside Accordion
    Evidence: .sisyphus/evidence/task-5-advanced-check.txt

  Scenario: Mode prop flows to editable sections
    Tool: Bash
    Preconditions: EmployeeProfileLayout.tsx created
    Steps:
      1. Grep for `mode={mode}` or `mode=` being passed to AssignmentSection, PersonalitySection, CompactSettingsGrid
      2. Verify mode is NOT passed to ToolsSection or ProfilePreviewSection (they are always read-only)
    Expected Result: Mode prop passed to 3 editable sections, not to 2 read-only sections
    Failure Indicators: Mode passed to read-only sections, or missing from editable sections
    Evidence: .sisyphus/evidence/task-5-mode-flow-check.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add EmployeeProfileLayout assembling all sections`
  - Files: `dashboard/src/panels/employees/EmployeeProfileLayout.tsx`
  - Pre-commit: `pnpm dashboard:build`

- [x] 6. Rewire EmployeeDetail.tsx — replace 4-tab with profile layout

  **What to do**:
  - **Major rewrite** of `dashboard/src/panels/employees/EmployeeDetail.tsx`:
    - **Remove** the 4-tab `Tabs` component (`TabsList`, `TabsTrigger`, `TabsContent` for settings/activity/training/knowledge)
    - **Remove** the inline `ConfigTab` component (lines 278-721) — its functionality is now in the profile sections
    - **Keep** the page header: back link, employee name, Trigger/Dry Run/Fire Webhook/Delete buttons. This stays exactly as-is (lines 911-964).
    - **Keep** the `ActivitySection` component if it's still defined here (or move it to its own file if T5 needs to import it). If moved, update the import.
    - **Replace** the tabs area with: `<EmployeeProfileLayout archetype={archetype} mode="view" tenantId={tenantId} onSaved={refresh} showActivity={true} showTraining={true} />`
    - **Handle draft mode**: If `archetype.status === 'draft'`, pass `mode="edit"` instead of `mode="view"` (drafts default to edit mode, per interview decision)
    - **Handle tab param compat**: The old `?tab=settings|activity|training|knowledge` URL params should still work — if `tab` param is present, scroll to the corresponding section. Use `document.getElementById(sectionId)?.scrollIntoView()` with smooth scrolling. Map: `settings` → scroll to Assignment, `activity` → scroll to Activity section, `training` → scroll to Training section, `knowledge` → scroll to Preview section.
    - **Remove** imports that are no longer needed: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `MarkdownEditorField`, `MarkdownPreview`, `InputSchemaEditor`, `Switch`, `SearchableSelect`, `Tooltip*`, `Separator` (if unused), `VALID_TABS`, `TAB_COMPAT_MAP`, `ConfigTab`, `EditValues`, `PatchData`, `archetypeToEditValues`, `FieldLabel`, `FieldValue`, `LabelWithTooltip`
    - **Keep** the delete dialog exactly as-is
    - **Keep** all trigger-related functions (`handleTrigger`, `handleDryRun`, `handleFireWebhook`, `handleDelete`)
    - **Keep** the loading and error states for archetype fetch
    - **Add** import for `EmployeeProfileLayout` from `./EmployeeProfileLayout`
    - The file should shrink significantly (from ~1016 lines to ~200-300 lines)

  **Must NOT do**:
  - Do NOT change the page URL or route — `/dashboard/employees/:archetypeId` stays
  - Do NOT remove the delete dialog, trigger buttons, or page header
  - Do NOT modify the archetype fetch logic (`fetchArchetype`, `usePoll`)
  - Do NOT break the webhook test button for guest-messaging employees

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Major UI rewrite — replacing a complex tabbed layout with a single scrollable page
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T5)
  - **Blocks**: Tasks 7, 8, 9
  - **Blocked By**: Task 5 (needs EmployeeProfileLayout)

  **References**:

  **Pattern References** (existing code — what to preserve vs. remove):
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:732-1016` — The main `EmployeeDetail` export. Keep the header (lines 911-964), delete dialog (lines 991-1013), loading state (lines 846-879), error state (lines 882-898), not-found state (lines 901-906). Remove tabs (lines 966-989).
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:47-67` — `WEBHOOK_FIXTURES`, `PatchData` — keep WEBHOOK_FIXTURES, remove PatchData (moved to sections).
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:69-89` — `EditValues`, `archetypeToEditValues` — remove (moved to individual sections).
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:91-127` — Helper components `FieldLabel`, `FieldValue`, `LabelWithTooltip`, `TriggerSourceIcon`, `triggerLabel` — keep `TriggerSourceIcon` and `triggerLabel` if used in Activity. Remove the rest if unused.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:129-276` — `ActivitySection` — keep if still needed here, or move to separate file and re-export.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:278-721` — `ConfigTab` — DELETE entirely. Replaced by profile sections.

  **Component References**:
  - `dashboard/src/panels/employees/EmployeeProfileLayout.tsx` — From T5. The replacement for the entire tab area.
  - `dashboard/src/lib/profile-constants.ts` — `ProfileMode` for draft detection

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after rewrite
    Tool: Bash
    Preconditions: T5 EmployeeProfileLayout exists, EmployeeDetail.tsx rewritten
    Steps:
      1. Run `pnpm dashboard:build`
      2. Verify exit code 0
    Expected Result: Clean build
    Failure Indicators: Missing imports, unused import warnings, type errors
    Evidence: .sisyphus/evidence/task-6-build-check.txt

  Scenario: Tabs are completely removed
    Tool: Bash
    Preconditions: EmployeeDetail.tsx rewritten
    Steps:
      1. Grep EmployeeDetail.tsx for "TabsList" and "TabsTrigger"
      2. Verify ZERO matches
      3. Grep for "ConfigTab"
      4. Verify ZERO matches
    Expected Result: No tab components or ConfigTab remain
    Failure Indicators: Any tab-related code still present
    Evidence: .sisyphus/evidence/task-6-tabs-removed-check.txt

  Scenario: Employee detail page renders profile layout
    Tool: Playwright
    Preconditions: Dev server running at http://localhost:7701, at least one employee exists
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees (or a known employee detail page)
      2. Click on the first employee in the list
      3. Verify page does NOT have tab navigation (no "Settings", "Activity", "Training", "Knowledge" tabs)
      4. Verify page has section headings: "The Assignment", "Personality", "Tools", "Settings"
      5. Take screenshot of the full page
    Expected Result: Profile layout renders with section headings, no tabs visible
    Failure Indicators: Tab navigation still visible, missing section headings
    Evidence: .sisyphus/evidence/task-6-profile-layout-screenshot.png

  Scenario: Page header and action buttons preserved
    Tool: Playwright
    Preconditions: Dev server running, navigated to employee detail page
    Steps:
      1. Verify "← Employees" back link exists
      2. Verify "Trigger" button exists
      3. Verify "Dry Run" button exists
      4. Verify "Delete" button exists
    Expected Result: All header elements present and functional
    Failure Indicators: Missing buttons or back link
    Evidence: .sisyphus/evidence/task-6-header-preserved-screenshot.png

  Scenario: Draft employee opens in edit mode
    Tool: Playwright
    Preconditions: Dev server running, a draft employee exists (status='draft')
    Steps:
      1. Navigate to a draft employee detail page
      2. Verify Assignment section shows editor (MarkdownEditorField) instead of read-only preview
      3. Verify Save/Cancel buttons are visible
    Expected Result: Draft employee shows sections in edit mode by default
    Failure Indicators: Draft shows read-only view, no edit controls visible
    Evidence: .sisyphus/evidence/task-6-draft-edit-mode-screenshot.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): replace 4-tab employee detail with profile layout`
  - Files: `dashboard/src/panels/employees/EmployeeDetail.tsx`
  - Pre-commit: `pnpm dashboard:build`

- [x] 7. Rewire EditEmployeePage + CreateEmployeePage

  **What to do**:
  - **Rewrite** `dashboard/src/panels/employees/EditEmployeePage.tsx`:
    - Currently this is a separate page that renders a full form for draft employees only
    - **Replace** the form content with `<EmployeeProfileLayout archetype={archetype} mode="edit" tenantId={tenantId} onSaved={refresh} showActivity={false} showTraining={false} />`
    - Keep the page-level chrome: header with back link, "Finalize" button (or equivalent publish/activate button)
    - The page now uses the same layout as the detail page but in `mode="edit"` — all editable sections start in edit mode
    - If the current EditEmployeePage has a "Save & Finalize" or "Publish" action, preserve that. It should call the appropriate API to change `status` from `draft` to `active`.
    - **Consider simplification**: If Task 6 already handles draft mode (draft employees show `mode="edit"` on the detail page), then this separate page may become unnecessary. In that case, make this route redirect to `/dashboard/employees/:archetypeId` and the detail page handles everything. Update the route in `App.tsx`.
  - **Rewrite** `dashboard/src/panels/employees/CreateEmployeePage.tsx`:
    - Currently this page does: (1) user enters natural language description → (2) AI generates archetype → (3) shows preview/next steps
    - **Keep step 1** (the natural language input and generation) exactly as-is
    - **Replace step 3**: After AI generation creates a draft archetype, navigate to the employee detail page at `/dashboard/employees/:newArchetypeId` — the detail page will show it in edit mode because `status='draft'`
    - Remove `CreateEmployeePreview.tsx` and `CreateEmployeeNextSteps.tsx` if they're only used by the old post-generation flow and are now unnecessary
    - The create flow becomes: Enter description → AI generates → Navigate to profile (draft mode)

  **Must NOT do**:
  - Do NOT change the AI generation logic (the `POST /admin/generate-employee` call)
  - Do NOT modify the natural language input step
  - Do NOT remove the Finalize/Publish action — it must remain accessible
  - Do NOT break the create → draft → finalize flow

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Page rewiring with navigation and existing API integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run alongside T8)
  - **Parallel Group**: Wave 3 (with Tasks 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 5, 6 (needs EmployeeProfileLayout and rewired EmployeeDetail)

  **References**:

  **Pattern References** (existing code to rewrite):
  - `dashboard/src/panels/employees/EditEmployeePage.tsx` — The entire file needs rewriting. Read it first to understand what functionality to preserve (especially the Finalize action).
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx` — Read to understand the AI generation flow. Keep step 1, replace step 3.
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx` — May be deprecated. Check if it's used elsewhere.
  - `dashboard/src/panels/employees/CreateEmployeeNextSteps.tsx` — May be deprecated. Check if it's used elsewhere.

  **Component References**:
  - `dashboard/src/panels/employees/EmployeeProfileLayout.tsx` — From T5
  - `dashboard/src/App.tsx` — Route definitions. Update if routes change.

  **API/Type References**:
  - `dashboard/src/lib/gateway.ts` — `patchArchetype` for finalize (status change), generation API calls

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after rewiring both pages
    Tool: Bash
    Preconditions: T5-T6 complete, both pages rewritten
    Steps:
      1. Run `pnpm dashboard:build`
      2. Verify exit code 0
    Expected Result: Clean build
    Failure Indicators: Missing imports, removed components still referenced
    Evidence: .sisyphus/evidence/task-7-build-check.txt

  Scenario: Create flow navigates to profile after generation
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees
      2. Click "New Employee" button (or equivalent create action)
      3. Verify the natural language input form appears
      4. Verify after creation the URL changes to `/dashboard/employees/:id` (not a separate preview page)
    Expected Result: Create flow reaches the profile page in draft/edit mode
    Failure Indicators: Old preview/next-steps page still shows, navigation doesn't happen
    Evidence: .sisyphus/evidence/task-7-create-flow-screenshot.png

  Scenario: EditEmployeePage route works (redirect or render)
    Tool: Playwright
    Preconditions: Dev server running, a draft employee exists
    Steps:
      1. Navigate directly to http://localhost:7701/dashboard/employees/:id/edit
      2. Verify it either renders the profile in edit mode OR redirects to /dashboard/employees/:id
      3. Verify editable sections are in edit mode
    Expected Result: Old edit URL still works and shows editable content
    Failure Indicators: 404 error, blank page, read-only mode
    Evidence: .sisyphus/evidence/task-7-edit-route-screenshot.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): rewire create and draft pages to use profile layout`
  - Files: `dashboard/src/panels/employees/EditEmployeePage.tsx`, `dashboard/src/panels/employees/CreateEmployeePage.tsx`, `dashboard/src/App.tsx` (if routes change)
  - Pre-commit: `pnpm dashboard:build`

- [x] 8. Embed Activity + Training sections into profile

  **What to do**:
  - Ensure Activity and Training sections render correctly within the profile layout. This task handles the integration, styling, and any extraction needed:
  - **Extract `ActivitySection`** from `EmployeeDetail.tsx` into its own file `dashboard/src/panels/employees/sections/ActivitySection.tsx` if it wasn't already moved during T6. The function component at `EmployeeDetail.tsx:129-276` is self-contained — just move it and update imports.
  - **Wrap `ActivitySection`** in `CollapsibleSection` with:
    - Title: "Recent Activity"
    - Subtitle: "Last tasks run by this employee"
    - `defaultOpen={false}`
    - Badge: task count (e.g., "5 tasks" if 5 tasks returned)
  - **Wrap `TrainingTab`** in `CollapsibleSection` with:
    - Title: "Training"
    - Subtitle: "Rules this employee has learned from your feedback"
    - `defaultOpen={false}`
    - Badge: rule count (e.g., "3 rules" if 3 rules exist)
  - Ensure the `EmployeeProfileLayout` passes correct props to both sections
  - **Activity empty state**: Already handled in existing `ActivitySection` ("No activity yet. This employee hasn't run any tasks.") — verify it looks good in the collapsed section context
  - **Training empty state**: Already handled in existing `TrainingTab` — verify it looks good
  - **Limit Activity to last 5 tasks** (per interview decision): Modify the `ActivitySection` fetch to use `limit: '5'` instead of `limit: '10'`. Add a "View all tasks →" link when there are exactly 5 results.

  **Must NOT do**:
  - Do NOT rewrite ActivitySection or TrainingTab internals — just extract, wrap, and integrate
  - Do NOT change the StatusTimeline or StatusBadge components
  - Do NOT add new task management features (delete, retry, etc.)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Component extraction and integration into profile layout
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (alongside T7)
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 6 (needs rewired EmployeeDetail)

  **References**:

  **Pattern References** (existing code to extract):
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:129-276` — `ActivitySection` component to extract. Fully self-contained — uses `postgrestFetch`, `usePoll`, `StatusBadge`, `StatusTimeline`.
  - `dashboard/src/panels/employees/TrainingTab.tsx` — Existing training component. Import and wrap, no changes to internals.

  **Component References**:
  - `dashboard/src/panels/employees/components/CollapsibleSection.tsx` — From T1. Wrap both sections.
  - `dashboard/src/panels/employees/EmployeeProfileLayout.tsx` — From T5. Update to render wrapped Activity and Training.
  - `dashboard/src/panels/tasks/StatusBadge.tsx` — Used by ActivitySection, already imported
  - `dashboard/src/panels/tasks/StatusTimeline.tsx` — Used by ActivitySection, already imported

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds
    Tool: Bash
    Preconditions: T6 complete, Activity extracted, Training wrapped
    Steps:
      1. Run `pnpm dashboard:build`
      2. Verify exit code 0
    Expected Result: Clean build
    Failure Indicators: Import errors after extraction
    Evidence: .sisyphus/evidence/task-8-build-check.txt

  Scenario: Activity section renders on profile page
    Tool: Playwright
    Preconditions: Dev server running, employee with tasks exists
    Steps:
      1. Navigate to employee detail page
      2. Find "Recent Activity" section heading
      3. Click to expand the section
      4. Verify task cards appear (StatusBadge, relative time, "View details" link)
      5. Take screenshot
    Expected Result: Activity section expands and shows task cards
    Failure Indicators: Section missing, no tasks shown, broken layout
    Evidence: .sisyphus/evidence/task-8-activity-screenshot.png

  Scenario: Training section renders on profile page
    Tool: Playwright
    Preconditions: Dev server running, employee with learned rules exists
    Steps:
      1. Navigate to employee detail page
      2. Find "Training" section heading
      3. Click to expand the section
      4. Verify rules are displayed
      5. Take screenshot
    Expected Result: Training section expands and shows learned rules
    Failure Indicators: Section missing, no rules shown
    Evidence: .sisyphus/evidence/task-8-training-screenshot.png

  Scenario: Activity shows max 5 tasks with "View all" link
    Tool: Bash
    Preconditions: ActivitySection extracted
    Steps:
      1. Grep the ActivitySection file for `limit:` parameter
      2. Verify it's set to `'5'`
      3. Grep for "View all" link
    Expected Result: Limit is 5, "View all" link present
    Failure Indicators: Limit still 10, missing "View all" link
    Evidence: .sisyphus/evidence/task-8-limit-check.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): embed Activity and Training sections in profile`
  - Files: `dashboard/src/panels/employees/sections/ActivitySection.tsx` (extracted), `dashboard/src/panels/employees/EmployeeProfileLayout.tsx` (updated)
  - Pre-commit: `pnpm dashboard:build`

- [x] 9. Route cleanup + remove deprecated components + empty/error states

  **What to do**:
  - **Route cleanup in `dashboard/src/App.tsx`**:
    - Verify `/dashboard/employees/:archetypeId` route points to `EmployeeDetail`
    - If `/dashboard/employees/:archetypeId/edit` is a separate route, redirect it to `/dashboard/employees/:archetypeId` (detail page handles edit mode for drafts)
    - Remove any routes pointing to deprecated pages (`CreateEmployeePreview`, `CreateEmployeeNextSteps`) if they have their own routes
    - Verify all employee-related routes still work
  - **Remove deprecated components** (only if they are NOT imported anywhere else):
    - Check if `CreateEmployeePreview.tsx` is still imported — if not, delete it
    - Check if `CreateEmployeeNextSteps.tsx` is still imported — if not, delete it
    - Check if `EmployeeOverview.tsx` is still imported — if the overview card was replaced by the profile header, delete it
    - For each file: grep the ENTIRE `dashboard/src/` directory for imports before deleting
  - **Empty/error states audit** — verify each section has proper empty states:
    - AssignmentSection: "No assignment configured yet"
    - PersonalitySection: "No personality configured yet"
    - ToolsSection: "No tools configured for this employee"
    - CompactSettingsGrid: Always has values (defaults exist)
    - ProfilePreviewSection: Loading skeleton → error retry → content
    - ActivitySection: "No activity yet. This employee hasn't run any tasks."
    - TrainingTab: Has its own empty state
    - Advanced: Always has values (model, runtime have defaults)
  - **Final build verification**: `pnpm dashboard:build` must succeed
  - **Import cleanup**: Remove any unused imports across all modified files. Run the build — any unused import warnings should be fixed.

  **Must NOT do**:
  - Do NOT delete files that are still imported somewhere — grep first
  - Do NOT modify files outside `dashboard/src/`
  - Do NOT change any business logic — only cleanup

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Cleanup task — deleting unused files, fixing routes, removing dead imports
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after T7, T8)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 6, 7, 8

  **References**:

  **Files to audit**:
  - `dashboard/src/App.tsx` — Route definitions
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx` — Candidate for deletion
  - `dashboard/src/panels/employees/CreateEmployeeNextSteps.tsx` — Candidate for deletion
  - `dashboard/src/components/EmployeeOverview.tsx` — Candidate for deletion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after cleanup
    Tool: Bash
    Preconditions: T6-T8 complete, cleanup done
    Steps:
      1. Run `pnpm dashboard:build`
      2. Verify exit code 0
      3. Verify no TypeScript errors
    Expected Result: Clean build, zero errors
    Failure Indicators: Missing files that were still imported, broken routes
    Evidence: .sisyphus/evidence/task-9-build-check.txt

  Scenario: No deleted file is still imported
    Tool: Bash
    Preconditions: Files deleted
    Steps:
      1. For each deleted file, grep `dashboard/src/` for its component name
      2. Verify zero import references remain
    Expected Result: Zero references to deleted components
    Failure Indicators: Import statements referencing deleted files
    Evidence: .sisyphus/evidence/task-9-no-dangling-imports.txt

  Scenario: All employee routes work
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees — verify list renders
      2. Click on an employee — verify profile page renders at /dashboard/employees/:id
      3. Navigate to http://localhost:7701/dashboard/employees/:id/edit — verify it redirects or renders correctly
      4. Navigate to create employee page — verify it renders
    Expected Result: All 4 routes work without errors
    Failure Indicators: 404, blank page, JS errors in console
    Evidence: .sisyphus/evidence/task-9-routes-screenshot.png

  Scenario: Empty states are present in all sections
    Tool: Bash
    Preconditions: All section files finalized
    Steps:
      1. Grep across all section files for empty state texts:
         "No assignment configured", "No personality configured", "No tools configured",
         "No activity yet", "No rules learned", "No knowledge base"
      2. Verify at least 5 of 6 empty state messages are present across the section files
    Expected Result: Empty states present in all applicable sections
    Failure Indicators: Missing empty state for any section
    Evidence: .sisyphus/evidence/task-9-empty-states-check.txt
  ```

  **Commit**: YES
  - Message: `chore(dashboard): clean up deprecated tab components and routes`
  - Files: Deleted files + `dashboard/src/App.tsx` + any import cleanup in modified files
  - Pre-commit: `pnpm dashboard:build`

- [x] 10. Notify completion — Send Telegram notification

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ employee-profile-ui-redesign complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1-F4 (runs after final verification wave)

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, take screenshot). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm dashboard:build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start dev server if not running. Navigate to employee detail page. Verify: all 6 sections render, inline edit works on Assignment and Personality, Preview section expands with collapsible blocks, Settings grid shows correct values, Tools section shows registered tools. Navigate to create and draft flows — verify same layout. Take screenshots of every state.
      Output: `Scenarios [N/N pass] | Screenshots [N captured] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify only `dashboard/src/` files were changed. No API endpoints modified. No new npm dependencies added without justification. Check that old routes still work (redirect or render). Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message                                                                          | Files                                        |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| 1          | `feat(dashboard): add profile types, labels, and shared section components`      | new component files                          |
| 2          | `feat(dashboard): add Assignment and Personality inline-editable sections`       | new component files                          |
| 3          | `feat(dashboard): add Tools and Settings profile sections`                       | new component files                          |
| 4          | `feat(dashboard): add profile preview section with collapsible AGENTS.md blocks` | new component file                           |
| 5          | `feat(dashboard): add EmployeeProfileLayout assembling all sections`             | new layout component                         |
| 6          | `feat(dashboard): replace 4-tab employee detail with profile layout`             | EmployeeDetail.tsx + routing                 |
| 7          | `feat(dashboard): rewire create and draft pages to use profile layout`           | EditEmployeePage.tsx, CreateEmployeePage.tsx |
| 8          | `feat(dashboard): embed Activity and Training sections in profile`               | profile layout updates                       |
| 9          | `chore(dashboard): clean up deprecated tab components and routes`                | removed/updated files                        |

---

## Success Criteria

### Verification Commands

```bash
pnpm dashboard:build   # Expected: clean build, exit 0
```

### Final Checklist

- [ ] Employee detail page renders as single scrollable profile
- [ ] Plain language labels on all sections
- [ ] Assignment + Personality editable inline
- [ ] Tools section shows registered tools (read-only)
- [ ] Settings in compact grid
- [ ] Preview shows full assembled AGENTS.md in collapsible blocks
- [ ] Activity shows recent tasks
- [ ] Training shows learned rules
- [ ] Create and draft flows use same layout
- [ ] Technical fields accessible in Advanced accordion
- [ ] `pnpm dashboard:build` succeeds
- [ ] Old `/employees/:id/edit` route still works

## Plain Language Label Mapping

| Technical Field                | Section        | Label                    | Subtitle                                              |
| ------------------------------ | -------------- | ------------------------ | ----------------------------------------------------- |
| `instructions`                 | The Assignment | "The Assignment"         | "What this employee does each time they're triggered" |
| `agents_md`                    | Personality    | "Personality"            | "How this employee approaches their work"             |
| `tool_registry.tools`          | Tools          | "Tools"                  | "What this employee can use"                          |
| `risk_model.approval_required` | Settings       | "Requires approval"      | —                                                     |
| `notification_channel`         | Settings       | "Slack channel"          | —                                                     |
| `risk_model.timeout_hours`     | Settings       | "Maximum duration"       | —                                                     |
| `concurrency_limit`            | Settings       | "Simultaneous tasks"     | —                                                     |
| `model`                        | Advanced       | "AI Model"               | —                                                     |
| `runtime`                      | Advanced       | "Runtime"                | —                                                     |
| `vm_size`                      | Advanced       | "Machine size"           | —                                                     |
| `system_prompt`                | Advanced       | "System prompt (legacy)" | —                                                     |
| `deliverable_type`             | Advanced       | "Output type"            | —                                                     |
