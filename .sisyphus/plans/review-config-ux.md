# Review Configuration Page — UX Overhaul

## TL;DR

> **Quick Summary**: Restructure the "Review Configuration" employee creation page from a flat blob of text into visually grouped Card-based sections with clear hierarchy, making each configuration area scannable and distinct.
>
> **Deliverables**:
>
> - `CreateEmployeePreview.tsx` rewritten with Card-based section grouping (6 Cards)
> - `CreateEmployeePage.tsx` action bar visually separated from form content
> - Full-page Playwright screenshots as before/after evidence
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → F1–F4

---

## Context

### Original Request

The "Review Configuration" page at `/dashboard/employees/new` has terrible UX. All sections blend together into an undifferentiated blob of text. Users can't tell where one configuration section ends and another begins. There's no visual hierarchy — eyes have nowhere to land.

### Interview Summary

**Key Discussions**:

- **Scope**: Preview form only — not the idle/textarea state, generating spinner, success screen, or error state
- **Visual approach**: Cards per section using the existing shadcn/ui `Card` component (already in the codebase at `dashboard/src/components/ui/card.tsx` but unused on this page)

**Issues Identified (7)**:

1. Zero visual grouping — all sections are flat `<div>` inside `space-y-4`
2. "What it Does" (instructions) dominates ~40% of visible page with no containment
3. Labels (`text-xs font-medium uppercase text-muted-foreground`) are tiny and invisible
4. No logical section grouping — related fields (approval + channel) not visually connected
5. Approval toggle floats without visual context or boundary
6. Tools badges lack a containing visual frame
7. Action buttons (Back + Create) blend into the form content

### Metis Review

**Identified Gaps** (addressed):

- **Action bar is in parent `CreateEmployeePage.tsx`** (lines 210–227), not preview component — plan includes parent fix
- **Card default padding `p-6 pt-0` would double spacing** — directive: use `CardContent className="p-4"` consistently
- **Custom approval toggle is `<button role="switch">`** — must NOT be replaced with shadcn Switch (behavior change)
- **Tools card is conditional** — must stay conditional; no empty Card shell when no tools
- **Advanced section has `border-t pt-3`** — replace with Card wrapper; Card provides its own visual boundary
- **Instructions can be arbitrary length** — add `max-h-64 overflow-y-auto` to contain it

---

## Work Objectives

### Core Objective

Transform the flat, undifferentiated Review Configuration form into a Card-based layout with 6 visually distinct sections, so users can immediately see where each configuration area begins and ends.

### Concrete Deliverables

- `dashboard/src/panels/employees/CreateEmployeePreview.tsx` — restructured JSX with Card wrappers
- `dashboard/src/panels/employees/CreateEmployeePage.tsx` — action bar visual separation
- `.sisyphus/evidence/task-*` — Playwright screenshot evidence

### Definition of Done

- [ ] Page renders with 5+ visually distinct Card sections (Tools card conditional)
- [ ] Each Card has a visible title header
- [ ] Instructions section is height-capped and scrollable
- [ ] Action buttons are visually separated from form content
- [ ] No logic, state, props, or event handler changes — JSX restructuring only
- [ ] Dashboard builds without errors (`pnpm build` in `dashboard/`)

### Must Have

- Card wrappers around each logical section (Identity, Behavior, Trigger, Settings, Tools, Advanced)
- Section titles promoted from tiny uppercase labels to CardTitle elements
- Instructions section height-capped with scroll overflow
- Visual separator before action buttons
- Consistent `CardContent` padding (`p-4`)

### Must NOT Have (Guardrails)

- **No logic changes** — do not modify any `onConfigChange` calls, state variables, event handlers, or conditional rendering logic
- **No shared component modifications** — do not edit `card.tsx`, `badge.tsx`, `separator.tsx`, `MarkdownPreview.tsx`, or any component under `dashboard/src/components/`
- **No toggle replacement** — keep the custom `<button role="switch">` for approval; do NOT replace with shadcn Switch
- **No responsive grid** — keep single-column layout; do NOT add `grid-cols-2` or similar
- **No new dependencies** — only use existing components from `dashboard/src/components/ui/`
- **No scope expansion** — do NOT touch the idle state, generating spinner, success state, or error state in `CreateEmployeePage.tsx`
- **No `className` changes on existing inputs** — do not modify `className` on existing `<Input>`, `<Select>`, `<Badge>`, or `<MarkdownPreview>` elements (wrapper additions are fine)
- **No JSDoc or comments** — do not add documentation to the component

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest in dashboard)
- **Automated tests**: NO — this is a CSS/layout-only refactor; unit tests would be testing JSX structure which is brittle and low-value
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios using Playwright connected to the dashboard dev server.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate to page, interact with form, assert DOM structure, take screenshots
- **Build verification**: Use Bash — `pnpm build` in `dashboard/`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — both files independent):
├── Task 1: Restructure CreateEmployeePreview.tsx with Card wrappers [visual-engineering]
├── Task 2: Fix action bar separation in CreateEmployeePage.tsx [quick]

Wave 2 (After Wave 1 — verification):
├── Task 3: Build verification + Playwright visual QA [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks   | Wave  |
| ----- | ---------- | -------- | ----- |
| 1     | —          | 3, F1–F4 | 1     |
| 2     | —          | 3, F1–F4 | 1     |
| 3     | 1, 2       | F1–F4    | 2     |
| F1–F4 | 3          | —        | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `visual-engineering`, T2 → `quick`
- **Wave 2**: 1 task — T3 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Restructure CreateEmployeePreview.tsx with Card-based section grouping

  **What to do**:
  1. Add Card imports: `import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';`
  2. Wrap each logical section of the form in a Card component. The 6 Card sections are:

  **Card A — "Employee Name"** (currently lines 69–93):

  ```
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium">Employee Name</CardTitle>
    </CardHeader>
    <CardContent className="p-4 pt-0">
      {/* existing Input + slug validation + error exactly as-is */}
    </CardContent>
  </Card>
  ```

  - Remove the existing `<label>` for "Employee Name" — the CardTitle replaces it
  - Keep ALL existing JSX inside CardContent unchanged (Input, validation icon, error message)

  **Card B — "What it Does"** (currently lines 95–102):

  ```
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium">What it Does</CardTitle>
    </CardHeader>
    <CardContent className="p-4 pt-0 max-h-64 overflow-y-auto">
      <MarkdownPreview content={normalizeInstructions(config.instructions)} />
    </CardContent>
  </Card>
  ```

  - Remove the existing `<label>` — CardTitle replaces it
  - **CRITICAL**: Add `max-h-64 overflow-y-auto` to `CardContent` className to prevent this section from dominating the page. The instructions can be arbitrarily long; without this cap, they push everything else below the fold.
  - Remove the wrapping `<div className="mt-1">` — CardContent provides the spacing

  **Card C — "Trigger"** (currently lines 104–264):

  ```
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium">Trigger</CardTitle>
    </CardHeader>
    <CardContent className="p-4 pt-0">
      {/* 3-button type selector (manual/scheduled/webhook) */}
      {/* All 3 conditional sub-panels (manual API hint, scheduled cron/tz, webhook event_type) */}
    </CardContent>
  </Card>
  ```

  - Remove the existing `<label>` for "Trigger" — CardTitle replaces it
  - Move ALL content (the button group + all 3 conditional panels) into CardContent as-is
  - Do NOT change any of the trigger type switching logic or conditional rendering

  **Card D — "Settings"** (merges: Require Approval lines 266–300, Notification Channel lines 302–340, Max Concurrent Tasks lines 378–395):

  ```
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium">Settings</CardTitle>
    </CardHeader>
    <CardContent className="p-4 pt-0 space-y-4">
      {/* Require Approval toggle row — exactly as-is */}
      {/* Notification Channel select/input — exactly as-is */}
      {/* Max Concurrent Tasks input — exactly as-is */}
    </CardContent>
  </Card>
  ```

  - This card **merges 3 sections** that were previously separate: approval toggle, notification channel, and max concurrent tasks
  - Move the Max Concurrent Tasks section (currently after Tools) into this card, BEFORE the Tools card
  - Remove all 3 existing `<label>` elements for these fields — BUT add smaller sub-labels inside CardContent:
    - For Approval: keep the existing label/description text as-is within the flex row, but change from uppercase `text-xs font-medium uppercase tracking-wide text-muted-foreground` to `text-sm font-medium text-foreground` so it reads as a regular field label, not a section header
    - For Notification Channel and Max Concurrent Tasks: same treatment — promote from tiny uppercase to normal `text-sm font-medium`
  - Do NOT change the approval toggle component (`<button role="switch">`) — keep it exactly as-is
  - Add `space-y-4` to CardContent for spacing between the 3 sub-sections

  **Card E — "Tools"** (currently lines 342–376, CONDITIONAL):

  ```
  {config.tool_registry?.tools && config.tool_registry.tools.length > 0 && (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Tools</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {/* Service-grouped badge list — exactly as-is */}
        {/* Italic helper text — exactly as-is */}
      </CardContent>
    </Card>
  )}
  ```

  - **CRITICAL**: Keep the entire Card conditional — wrap the `<Card>` inside the existing `{config.tool_registry?.tools && ...}` guard
  - Remove the existing `<label>` — CardTitle replaces it
  - Keep the Badge rendering and service grouping logic unchanged

  **Card F — "Advanced"** (currently lines 397–439):

  ```
  <Card>
    <CardContent className="p-4">
      <button type="button" onClick={...} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <span>{advancedOpen ? '▼' : '▶'}</span>
        <span>Advanced</span>
      </button>
      {advancedOpen && (
        <div className="mt-3 space-y-4">
          {/* All 3 MarkdownEditorField instances — exactly as-is */}
        </div>
      )}
    </CardContent>
  </Card>
  ```

  - Replace the `border-t pt-3` wrapper div with a Card — the Card border provides visual separation
  - No CardHeader/CardTitle — the collapsible button IS the title
  - Promote the toggle button text from `text-xs` to `text-sm` for consistency
  - Keep all MarkdownEditorField instances and their conditional rendering unchanged
  3. Update the outer wrapper: change `<div className="space-y-4">` to `<div className="space-y-5">` for slightly more breathing room between Cards (Cards have their own padding, so `space-y-4` would feel cramped)

  **Must NOT do**:
  - Do NOT change any `onConfigChange`, `onChange`, `onClick`, or other event handlers
  - Do NOT change any conditional rendering logic (`config.trigger_sources?.type`, `config.risk_model.approval_required`, etc.)
  - Do NOT modify `className` on existing `<Input>`, `<Select>`, `<Badge>`, or `<MarkdownPreview>` elements
  - Do NOT edit any shared component files (card.tsx, badge.tsx, etc.)
  - Do NOT add responsive grid layouts
  - Do NOT replace the custom approval `<button role="switch">` with a shadcn Switch
  - Do NOT add JSDoc comments

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is a pure UI/UX restructuring task — wrapping existing JSX in Card components for visual hierarchy
  - **Skills**: []
    - No specialized skills needed — standard React/Tailwind/shadcn
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not a slash command skill — it's a prompt directive already embedded in visual-engineering category

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, F1–F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `dashboard/src/components/ui/card.tsx` — Full Card component API: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. Note `CardContent` defaults to `p-6 pt-0` — override with `className="p-4 pt-0"`.
  - `dashboard/src/panels/employees/EmployeeList.tsx` — How Badge is used with variant="outline" for tool-like chips (line 236–247). Shows the pattern of adding custom color classes to Badge.

  **API/Type References** (contracts to preserve):
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:16-23` — `CreateEmployeePreviewProps` interface — MUST NOT change this contract
  - `dashboard/src/lib/types.ts` — `GenerateArchetypeResponse` type — the config shape that drives all conditional rendering

  **File References** (what to modify):
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx` — THE file to restructure (442 lines currently). The entire return statement (lines 68–440) needs Card wrappers added around the 6 logical sections.

  **WHY Each Reference Matters**:
  - `card.tsx`: You need to know the exact component API and default classNames to use Cards correctly and override padding
  - `EmployeeList.tsx`: Shows how Badge with custom styling is used elsewhere — helps maintain visual consistency if the agent considers enhancing the Tools section badges
  - Props interface: The agent must NOT accidentally change the component signature while restructuring JSX
  - `GenerateArchetypeResponse`: Understanding the config shape is critical for knowing which fields are conditional (trigger_sources, tool_registry, delivery_instructions)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cards visible on Review Configuration page
    Tool: Playwright
    Preconditions: Dashboard dev server running at localhost:5173. Navigate to `/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
    Steps:
      1. Type "An employee that reads Slack channels daily and posts summaries" into the description textarea
      2. Click the "Generate" button
      3. Wait for the preview form to appear (wait for text "Employee Name" to appear, timeout 30s)
      4. Query DOM: `document.querySelectorAll('[data-slot="card"]')` — count Card elements
      5. For each Card, verify it contains a title element with text matching one of: "Employee Name", "What it Does", "Trigger", "Settings", "Advanced" (Tools is conditional)
    Expected Result: At least 5 Card elements present. Each has a recognizable title.
    Failure Indicators: Fewer than 5 Cards. Missing titles. Cards not visually distinct.
    Evidence: .sisyphus/evidence/task-1-cards-visible.png

  Scenario: Instructions section is height-capped and scrollable
    Tool: Playwright
    Preconditions: Same as above — on the preview form
    Steps:
      1. Find the Card containing "What it Does" title
      2. Locate the CardContent element inside it
      3. Assert: the CardContent element has CSS `max-height` set (not `none`) AND `overflow-y` is `auto` or `scroll`
      4. Check that the Card's rendered height is less than 300px even if instructions text is long
    Expected Result: CardContent has overflow containment. Long instructions don't push the page.
    Failure Indicators: No max-height set. Instructions overflow their Card. Card height exceeds 300px.
    Evidence: .sisyphus/evidence/task-1-instructions-contained.png

  Scenario: Trigger type switching still works within Card
    Tool: Playwright
    Preconditions: On the preview form
    Steps:
      1. Click "Scheduled" trigger button
      2. Assert: cron expression input appears with value containing "*"
      3. Assert: timezone select appears with "UTC" selected
      4. Click "Manual" trigger button
      5. Assert: API endpoint code block appears with text containing "POST /admin"
      6. Click "Webhook" trigger button
      7. Assert: event type input appears
    Expected Result: All 3 trigger types render their sub-panels correctly within the Trigger Card
    Failure Indicators: Sub-panels don't appear. Trigger type buttons don't respond. Layout breaks.
    Evidence: .sisyphus/evidence/task-1-trigger-switching.png

  Scenario: Approval toggle and notification channel work in Settings Card
    Tool: Playwright
    Preconditions: On the preview form
    Steps:
      1. Find the `<button role="switch">` element
      2. Assert: it is inside a Card element (ancestor check)
      3. Click the toggle
      4. Assert: toggle state changes (aria-checked attribute flips)
      5. Find the notification channel input/select
      6. Assert: it is inside the same Card as the toggle
    Expected Result: Toggle is interactive. Both fields are grouped in one Card.
    Failure Indicators: Toggle not inside Card. Click doesn't change state. Fields in separate Cards.
    Evidence: .sisyphus/evidence/task-1-settings-card.png
  ```

  **Evidence to Capture:**
  - [ ] `task-1-cards-visible.png` — Full page screenshot showing all Cards
  - [ ] `task-1-instructions-contained.png` — Close-up of the "What it Does" Card
  - [ ] `task-1-trigger-switching.png` — Screenshot after each trigger type switch
  - [ ] `task-1-settings-card.png` — Settings Card with toggle + channel

  **Commit**: YES (groups with Task 2)
  - Message: `style(dashboard): restructure employee preview with Card-based section grouping`
  - Files: `dashboard/src/panels/employees/CreateEmployeePreview.tsx`
  - Pre-commit: `cd dashboard && pnpm build`

- [x] 2. Fix action bar separation in CreateEmployeePage.tsx

  **What to do**:
  1. In `CreateEmployeePage.tsx`, locate the action bar div at lines 210–227:
     ```tsx
     <div className="flex justify-end gap-2 pt-2">
     ```
  2. Add a `Separator` component above the action bar for visual separation:
     ```tsx
     import { Separator } from '@/components/ui/separator';
     ```
     Then before the action bar div:
     ```tsx
     <Separator className="my-4" />
     <div className="flex justify-end gap-2">
     ```
  3. Remove the `pt-2` from the action bar div — the Separator + `my-4` margin provides the spacing
  4. Alternatively (simpler): change `pt-2` to `border-t pt-4` on the action bar div — this avoids adding a new import. **Choose whichever approach feels cleaner; both achieve the goal.**

  **Must NOT do**:
  - Do NOT modify any other phase's JSX (idle, generating, success, error)
  - Do NOT change the Button components (variant, size, onClick, disabled logic)
  - Do NOT change the `handleCreate` or other handler functions
  - Do NOT modify the refinement input section (lines 175–208)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line CSS change or small import + JSX addition — trivial task
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed for a CSS spacing fix

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3, F1–F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `dashboard/src/components/ui/separator.tsx` — Separator component (Radix-based). Renders as `<SeparatorPrimitive.Root>` with `bg-border` and `h-[1px] w-full` for horizontal.
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:397` — Shows existing `border-t pt-3` pattern as reference for visual separator within the same page

  **File References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:210-227` — THE lines to modify. The `<div className="flex justify-end gap-2 pt-2">` that wraps the Back and Create Employee buttons.

  **WHY Each Reference Matters**:
  - `separator.tsx`: If the agent chooses the Separator approach, they need to know the import path and that it's horizontal by default
  - Line 397 pattern: Shows the project already uses `border-t` as a visual separator — the agent can match this existing convention

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Action bar has visible separation from form content
    Tool: Playwright
    Preconditions: On the Review Configuration preview form
    Steps:
      1. Scroll to the bottom of the form
      2. Locate the "Back" and "Create Employee" buttons
      3. Assert: there is either a `<hr>` element (Separator) or the button container div has `border-t` class
      4. Assert: the visual gap between the last form Card and the buttons is at least 16px (measured via bounding box comparison)
    Expected Result: Visible horizontal line or border separates form content from action buttons.
    Failure Indicators: No visible separator. Buttons visually blend into the form. Gap less than 16px.
    Evidence: .sisyphus/evidence/task-2-action-bar-separation.png
  ```

  **Evidence to Capture:**
  - [ ] `task-2-action-bar-separation.png` — Bottom of form showing separator + action buttons

  **Commit**: YES (groups with Task 1)
  - Message: `style(dashboard): restructure employee preview with Card-based section grouping`
  - Files: `dashboard/src/panels/employees/CreateEmployeePage.tsx`
  - Pre-commit: `cd dashboard && pnpm build`

- [x] 3. Build verification + Playwright visual QA

  **What to do**:
  1. Run `pnpm build` in the `dashboard/` directory — verify zero TypeScript errors and successful build
  2. Start the dashboard dev server if not running: `pnpm dev` in `dashboard/`
  3. Use Playwright to navigate to the full create employee flow and run comprehensive visual QA
  4. Capture before/after evidence

  **Must NOT do**:
  - Do NOT modify any source files during this task
  - This is a verification-only task

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Needs both build verification (Bash) and Playwright browser automation — multi-step QA
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `e2e-testing`: Not relevant — that skill is for the AI employee platform E2E, not dashboard visual QA

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1–F4
  - **Blocked By**: Tasks 1, 2

  **References**:

  **File References**:
  - `dashboard/package.json:8` — `"build": "tsc -b && vite build"` — the build command to verify
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx` — Modified file to verify
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx` — Modified file to verify

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard builds successfully after changes
    Tool: Bash
    Preconditions: Tasks 1 and 2 completed
    Steps:
      1. Run: cd dashboard && pnpm build
      2. Assert: exit code 0
      3. Assert: no TypeScript errors in output
    Expected Result: Clean build with zero errors
    Failure Indicators: Non-zero exit code. TypeScript errors. Missing imports.
    Evidence: .sisyphus/evidence/task-3-build-output.txt

  Scenario: Full create employee flow renders correctly
    Tool: Playwright
    Preconditions: Dashboard dev server running at localhost:5173
    Steps:
      1. Navigate to `http://localhost:5173/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
      2. Assert: page loads with "Create New Employee" heading
      3. Type "An employee that monitors our support Slack channel daily and creates a digest summary of all messages, categorized by topic and priority" into the textarea
      4. Click "Generate"
      5. Wait for preview to load (wait for text "Employee Name", timeout 30s)
      6. Take full-page screenshot
      7. Assert: at least 5 `[data-slot="card"]` elements present
      8. Assert: Card titles include "Employee Name", "What it Does", "Trigger", "Settings", "Advanced"
      9. Click "Scheduled" trigger type button
      10. Assert: cron input appears inside the Trigger Card
      11. Click "Manual" trigger type button
      12. Assert: API endpoint hint appears
      13. Click the Advanced toggle
      14. Assert: markdown editors appear
      15. Take another full-page screenshot
    Expected Result: All 5+ Cards visible. All interactions work. No layout breaks.
    Failure Indicators: Missing Cards. Broken interactions. Overlapping elements. Build errors.
    Evidence: .sisyphus/evidence/task-3-full-flow-preview.png, .sisyphus/evidence/task-3-full-flow-advanced-open.png

  Scenario: Responsive — page doesn't break at narrow widths
    Tool: Playwright
    Preconditions: On the preview form
    Steps:
      1. Resize browser to 768px width
      2. Take screenshot
      3. Assert: no horizontal scrollbar on the main content area
      4. Assert: all Cards are visible and stack vertically
      5. Resize back to 1280px width
    Expected Result: Single-column Card layout adapts cleanly to narrower viewport.
    Failure Indicators: Horizontal overflow. Cards extending beyond viewport. Text truncation.
    Evidence: .sisyphus/evidence/task-3-narrow-viewport.png
  ```

  **Evidence to Capture:**
  - [ ] `task-3-build-output.txt` — Build command output
  - [ ] `task-3-full-flow-preview.png` — Full page after generation
  - [ ] `task-3-full-flow-advanced-open.png` — Full page with Advanced expanded
  - [ ] `task-3-narrow-viewport.png` — Narrow viewport screenshot

  **Commit**: NO (verification only)

- [x] 4. Notify completion

  Send Telegram notification: plan complete, all tasks done, come back to review.

  ```bash
  tsx scripts/telegram-notify.ts "Style: Review Configuration page UX overhaul complete. All Card sections implemented and verified. Come back to review results."
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read the file, check for Card imports, CardTitle elements). For each "Must NOT Have": search codebase for forbidden patterns (Switch import, grid-cols, changes to shared components). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` in `dashboard/`. Review `CreateEmployeePreview.tsx` and `CreateEmployeePage.tsx` for: TypeScript errors, unused imports, `as any`, empty catches, console.log in prod, commented-out code. Check AI slop: excessive comments, over-abstraction, generic variable names.
      Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
      Start dashboard dev server. Navigate to `/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`. Type a description, click Generate, wait for preview. Execute every QA scenario from every task — follow exact steps, capture evidence. Test trigger type switching (manual/scheduled/webhook). Test approval toggle. Test Advanced collapse/expand. Save screenshots to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff` on modified files). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no logic changes, no shared component modifications, no Switch replacement, no grid layouts, no new deps. Flag any changes to files NOT listed in the plan.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Message                                                                           | Files                                                 | Pre-commit                   |
| ---- | --------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| 1    | `style(dashboard): restructure employee preview with Card-based section grouping` | `CreateEmployeePreview.tsx`, `CreateEmployeePage.tsx` | `pnpm build` in `dashboard/` |

---

## Success Criteria

### Verification Commands

```bash
cd dashboard && pnpm build  # Expected: successful build, exit 0
```

### Final Checklist

- [ ] 6 Card-based sections visible on Review Configuration page (5 always + 1 conditional Tools)
- [ ] Each section has a clear title header
- [ ] Instructions section contained within scrollable max-height
- [ ] Action buttons visually separated from form content
- [ ] All interactive elements still functional (inputs, toggles, selects, trigger type buttons)
- [ ] No logic or behavior changes — purely visual restructuring
- [ ] Build passes
