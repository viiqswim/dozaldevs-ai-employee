# Brain Preview Tab — UX Enhancements

## TL;DR

> **Quick Summary**: Improve the Brain Preview tab with 4 UX enhancements: shareable tab URLs, Raw/Rendered toggle on AGENTS.md, sticky section navigation with phase grouping, and consistent collapsibility across all sections.
>
> **Deliverables**:
>
> - Outer tabs sync to `?tab=` URL query param for shareable deep links
> - AGENTS.md section gets Raw/Rendered markdown toggle (matching prompt sections)
> - Sticky horizontal section nav at top of Brain Preview with scroll-to-anchor
> - All content sections are collapsible via `<details>/<summary>`, with visual phase dividers (Execution Phase / Delivery Phase)
>
> **Estimated Effort**: Short (4-6 tasks, ~2 hours execution)
> **Parallel Execution**: YES — 2 waves + build/QA
> **Critical Path**: T1 (parallel with T2) → T3 → T4 → T5 (build+QA) → T6 (notify) → F1-F4

---

## Context

### Original Request

User noticed 4 UX issues with the Brain Preview tab:

1. AGENTS.md section only shows raw `<pre>` text — no rendered markdown view like the prompt sections have
2. Clicking "Brain Preview" tab doesn't update the URL — can't share a direct link to the tab
3. The page is hard to navigate — 6 sections stacked vertically, hard to differentiate Execution vs Delivery phases
4. Inconsistent collapsibility — only Delivery Prompt collapses, other sections are always expanded

### Interview Summary

**Key Discussions**:

- User agreed with sticky horizontal section nav (vs vertical sidebar or sub-tabs)
- User agreed with phase grouping: Execution Phase vs Delivery Phase dividers
- User agreed with `?tab=` URL sync via `useSearchParams`
- User agreed with consistent collapsibility using `<details>/<summary>`

**Research Findings**:

- `useSearchParams` from react-router-dom is already used in `Layout.tsx` — established pattern
- `MarkdownPreview` component already exists (16 lines, GFM table support) — reusable for AGENTS.md
- `PromptSection` is a file-local component in `BrainPreviewTab.tsx` — NOT exported, pattern must be replicated inline
- Outer `<Tabs>` in `EmployeeDetail.tsx` uses `defaultValue="config"` (uncontrolled) — must convert to controlled for URL sync
- `BrainPreviewTab.tsx` is 434 lines, 6 Card sections

### Metis Review

**Identified Gaps** (addressed):

- `PromptSection` is file-local, not importable — plan uses inline pattern replication, not import
- Outer Tabs are uncontrolled — plan explicitly calls out conversion to controlled component
- Delivery Prompt defaults collapsed — plan specifies default open/closed for each section
- AGENTS.md has 4 sub-tabs — plan specifies one shared Raw/Rendered state across all sub-tabs
- URL sync on mount — plan specifies lazy write (only on user tab click, not on mount)

---

## Work Objectives

### Core Objective

Make the Brain Preview tab more navigable, shareable, and consistent in its UI patterns.

### Concrete Deliverables

- `EmployeeDetail.tsx`: Controlled tabs synced to `?tab=config|tasks|rules|brain` query param
- `BrainPreviewTab.tsx`: Raw/Rendered toggle on AGENTS.md card, sticky section nav, phase dividers, collapsible sections

### Definition of Done

- [ ] `?tab=brain` in URL selects Brain Preview tab on page load
- [ ] AGENTS.md section has Raw/Rendered toggle defaulting to Raw (matching existing Execution Prompt behavior)
- [ ] Sticky horizontal nav visible at all scroll positions within Brain Preview
- [ ] All 6 content sections are collapsible via `<details>/<summary>`
- [ ] Visual dividers separate Execution Phase from Delivery Phase
- [ ] Dashboard builds: `cd dashboard && pnpm build` → exit 0

### Must Have

- URL-synced tabs with fallback to `config` for invalid `?tab=` values
- Raw/Rendered toggle on AGENTS.md card header (one shared state for all sub-tabs)
- Sticky section nav that highlights active section on scroll
- All sections collapsible, Execution Prompt defaults open, others default closed
- Phase dividers: "Execution Phase" header above first section, "Delivery Phase" header above Delivery Prompt

### Must NOT Have (Guardrails)

- No new npm dependencies
- No backend/API changes — all changes are frontend only
- No modifications to `MarkdownPreview` component
- No syncing AGENTS.md sub-tabs (Full/Platform/Tenant/Employee) to URL — only outer tabs sync
- No localStorage for collapsed state or tab preference
- No `useSearchParams` write on initial mount — only on user click
- Do NOT export or move `PromptSection` — keep it file-local
- Do NOT use `{ replace: false }` with setSearchParams — always use `{ replace: true }` to avoid polluting browser history

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: NO (dashboard has no test framework)
- **Automated tests**: None
- **Framework**: N/A
- **QA method**: Playwright browser automation against running dashboard

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent changes to different files):
├── Task 1: URL sync for outer tabs [quick] — EmployeeDetail.tsx only
└── Task 2: Raw/Rendered toggle on AGENTS.md [quick] — BrainPreviewTab.tsx only

Wave 2 (After Wave 1 — structural changes to BrainPreviewTab.tsx):
├── Task 3: Phase grouping + consistent collapsibility [visual-engineering] — BrainPreviewTab.tsx
└── Task 4: Sticky section nav with scroll-to-anchor [visual-engineering] — BrainPreviewTab.tsx
    (T3 before T4 — T4 needs section IDs established by T3)

Wave 3 (After Wave 2 — verification):
├── Task 5: Dashboard build + Playwright visual QA [unspecified-high]
└── Task 6: Telegram notification [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan Compliance Audit [oracle]
├── F2: Code Quality Review [unspecified-high]
├── F3: Real Manual QA [unspecified-high]
└── F4: Scope Fidelity Check [oracle]
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| T1   | —          | T5     |
| T2   | —          | T3     |
| T3   | T2         | T4     |
| T4   | T3         | T5     |
| T5   | T1, T4     | T6     |
| T6   | T5         | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 `quick`, T2 `quick`
- **Wave 2**: 2 tasks — T3 `visual-engineering`, T4 `visual-engineering`
- **Wave 3**: 2 tasks — T5 `unspecified-high`, T6 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `oracle`

---

## TODOs

- [x] 1. URL sync for outer tabs

  **What to do**:
  - Convert `<Tabs defaultValue="config">` to controlled: `<Tabs value={activeTab} onValueChange={handleTabChange}>`
  - Add `useSearchParams` import from `react-router-dom`
  - Read `?tab=` param on mount: `const [searchParams, setSearchParams] = useSearchParams()`
  - Derive active tab: `const tab = searchParams.get('tab')` — validate against `['config', 'tasks', 'rules', 'brain']`, default to `'config'`
  - On tab change: `setSearchParams((prev) => { prev.set('tab', newTab); return prev; }, { replace: true })`
  - Do NOT write `?tab=config` on initial mount — only write when user explicitly clicks a tab
  - Preserve existing `?tenant=` param when setting `?tab=` (useSearchParams handles this automatically with the `prev` pattern above)

  **Must NOT do**:
  - Do NOT use `{ replace: false }` — always `{ replace: true }` to avoid polluting browser history
  - Do NOT sync any other state to URL (only the outer tab)
  - Do NOT touch BrainPreviewTab.tsx

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:683-706` — Current uncontrolled Tabs block to convert
  - `dashboard/src/components/layout/Layout.tsx:2,14-15` — Existing `useSearchParams` usage pattern in the codebase
  - `dashboard/src/hooks/use-tenant.ts:18` — Shows `window.location.search` pattern for reading params

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Direct link to Brain Preview tab
    Tool: Playwright
    Preconditions: Gateway running at localhost:7700, dashboard built
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/00000000-0000-0000-0000-000000000015?tenant=00000000-0000-0000-0000-000000000003&tab=brain
      2. Assert tab with name "Brain Preview" has aria-selected="true"
      3. Assert tab with name "Config" has aria-selected="false"
    Expected Result: Brain Preview tab is active on page load
    Evidence: .sisyphus/evidence/task-1-direct-link.png

  Scenario: Tab click updates URL
    Tool: Playwright
    Preconditions: On employee detail page
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/00000000-0000-0000-0000-000000000015?tenant=00000000-0000-0000-0000-000000000003
      2. Click tab "Brain Preview"
      3. Assert page URL contains "tab=brain"
      4. Assert URL still contains "tenant=00000000-0000-0000-0000-000000000003" (tenant param preserved)
    Expected Result: URL updates with tab= param while preserving existing params
    Evidence: .sisyphus/evidence/task-1-tab-click-url.png

  Scenario: Invalid tab param falls back to Config
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/00000000-0000-0000-0000-000000000015?tenant=00000000-0000-0000-0000-000000000003&tab=nonexistent
      2. Assert tab "Config" has aria-selected="true"
    Expected Result: Unknown tab value gracefully falls back to Config
    Evidence: .sisyphus/evidence/task-1-invalid-fallback.png
  ```

  **Commit**: YES — group 1
  - Message: `feat(dashboard): sync employee detail tabs to URL query param`
  - Files: `dashboard/src/panels/employees/EmployeeDetail.tsx`
  - Pre-commit: `cd dashboard && pnpm build`

- [x] 2. Raw/Rendered toggle on AGENTS.md section

  **What to do**:
  - Add `agentsMdRaw` boolean state (default `true` — raw, matching Execution Prompt default behavior)
  - Add toggle button to AGENTS.md `<CardHeader>` — same pattern as PromptSection: `<Button variant="outline" size="sm" onClick={() => setAgentsMdRaw(r => !r)}>{agentsMdRaw ? 'Rendered' : 'Raw'}</Button>`
  - In each `<TabsContent>` for AGENTS.md sub-tabs (Full, Platform, Tenant, Employee):
    - If `agentsMdRaw`: show existing `<pre>` block (current behavior)
    - If `!agentsMdRaw`: show `<MarkdownPreview content={...} />` (rendered markdown)
  - One shared `agentsMdRaw` state for all 4 sub-tabs — NOT 4 independent states
  - Preserve the "Not configured for this employee" message for empty layers

  **Must NOT do**:
  - Do NOT export or move `PromptSection` — keep it file-local
  - Do NOT modify `MarkdownPreview` component
  - Do NOT touch EmployeeDetail.tsx

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:68-93` — `PromptSection` component showing the Raw/Rendered toggle pattern to replicate
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:121-122` — `executionRaw`/`deliveryRaw` state declarations to follow
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:217-276` — Current AGENTS.md Card section to modify
  - `dashboard/src/components/MarkdownPreview.tsx` — The `MarkdownPreview` component to use for rendered view

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Toggle AGENTS.md to rendered markdown
    Tool: Playwright
    Preconditions: On Brain Preview tab
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/00000000-0000-0000-0000-000000000015?tenant=00000000-0000-0000-0000-000000000003&tab=brain
      2. Scroll to AGENTS.md section
      3. Assert button text is "Rendered" (default is raw)
      4. Click "Rendered" button
      5. Assert `.prose` element is visible within AGENTS.md card (markdown rendered)
      6. Assert `<pre>` is NOT visible within AGENTS.md card content (raw hidden)
    Expected Result: AGENTS.md content renders as formatted markdown with tables
    Evidence: .sisyphus/evidence/task-2-agents-md-rendered.png

  Scenario: Toggle back to raw
    Tool: Playwright
    Steps:
      1. Click "Raw" button (which appeared after toggling to Rendered)
      2. Assert `<pre>` is visible within AGENTS.md card content
    Expected Result: Content returns to monospace raw text
    Evidence: .sisyphus/evidence/task-2-agents-md-raw.png

  Scenario: Sub-tab switch preserves toggle state
    Tool: Playwright
    Steps:
      1. Toggle to "Rendered" mode
      2. Click "Platform" sub-tab
      3. Assert `.prose` element is visible (rendered mode persists across sub-tabs)
    Expected Result: Raw/Rendered toggle is shared across all sub-tabs
    Evidence: .sisyphus/evidence/task-2-subtab-toggle.png
  ```

  **Commit**: NO — groups with Task 3 and 4
  - Pre-commit: `cd dashboard && pnpm build`

- [x] 3. Phase grouping dividers + consistent collapsibility

  **What to do**:
  - Add phase divider headers above the section groups. Two phases:
    - **Execution Phase**: Execution Prompt, AGENTS.md, Environment Variables, Available Tools & Skills, Runtime Config & Output Contract
    - **Delivery Phase**: Delivery Prompt
  - Phase dividers should be simple styled text: `<div className="flex items-center gap-3 pt-6 pb-2"><div className="h-px flex-1 bg-border" /><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Execution Phase</span><div className="h-px flex-1 bg-border" /></div>` (horizontal line with centered label)
  - Wrap EVERY content section in `<details>` / `<summary>`:
    - Execution Prompt: `<details open>` (expanded by default — primary content)
    - AGENTS.md: `<details>` (collapsed by default)
    - Environment Variables: `<details>` (collapsed by default)
    - Available Tools & Skills: `<details>` (collapsed by default)
    - Runtime Config: `<details>` (collapsed by default)
    - Delivery Prompt: already uses `<details>` (collapsed by default) — preserve as-is
  - Each `<summary>` should contain the CardTitle text and any badges, styled consistently
  - Add `id` attributes to each section's outer element for scroll anchoring (needed by Task 4):
    - `id="brain-execution-prompt"`, `id="brain-delivery-prompt"`, `id="brain-agents-md"`, `id="brain-env-vars"`, `id="brain-tools"`, `id="brain-runtime"`
  - Move the Delivery Phase section (Delivery Prompt) AFTER the Runtime Config section — currently it sits between Execution Prompt and AGENTS.md, which breaks the phase grouping

  **Must NOT do**:
  - Do NOT remove the existing Raw/Rendered toggle on Execution Prompt or Delivery Prompt
  - Do NOT change the AGENTS.md sub-tab structure (Full/Platform/Tenant/Employee)
  - Do NOT add localStorage for collapsed state — all collapses are session-only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential: T3 before T4)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:178-432` — Current 6-section layout to restructure
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:188-215` — Existing Delivery Prompt `<details>/<summary>` pattern to replicate
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx:60-93` — `PromptSection` component — needs `<details>` wrapper added around Card

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Phase dividers visible
    Tool: Playwright
    Preconditions: On Brain Preview tab
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/00000000-0000-0000-0000-000000000015?tenant=00000000-0000-0000-0000-000000000003&tab=brain
      2. Assert text "Execution Phase" is visible on page
      3. Assert text "Delivery Phase" is visible on page
      4. Assert "Delivery Phase" appears AFTER "Runtime Config" section in DOM order
    Expected Result: Two phase dividers visible with correct section grouping
    Evidence: .sisyphus/evidence/task-3-phase-dividers.png

  Scenario: Sections are collapsible
    Tool: Playwright
    Steps:
      1. Assert element with id="brain-execution-prompt" is visible (defaults open)
      2. Assert element with id="brain-agents-md" content is NOT visible (defaults collapsed)
      3. Click the summary element for AGENTS.md section
      4. Assert AGENTS.md content becomes visible (expanded)
      5. Click the summary element again
      6. Assert AGENTS.md content is hidden again (collapsed)
    Expected Result: Sections toggle between expanded and collapsed states
    Evidence: .sisyphus/evidence/task-3-collapsible.png

  Scenario: Section IDs present for anchoring
    Tool: Playwright
    Steps:
      1. Assert document.getElementById('brain-execution-prompt') exists
      2. Assert document.getElementById('brain-agents-md') exists
      3. Assert document.getElementById('brain-env-vars') exists
      4. Assert document.getElementById('brain-tools') exists
      5. Assert document.getElementById('brain-runtime') exists
      6. Assert document.getElementById('brain-delivery-prompt') exists
    Expected Result: All 6 section IDs are present in the DOM
    Evidence: .sisyphus/evidence/task-3-section-ids.png
  ```

  **Commit**: NO — groups with Task 2 and 4
  - Pre-commit: `cd dashboard && pnpm build`

- [x] 4. Sticky section nav with scroll-to-anchor

  **What to do**:
  - Add a horizontal "pill" nav bar at the TOP of the `BrainPreviewTab` component's rendered output (before the first phase divider)
  - The nav should contain 6 buttons/links, one per section: `Execution Prompt`, `AGENTS.md`, `Env Vars`, `Tools`, `Runtime`, `Delivery Prompt`
  - Visually separate them by phase: group the first 5 (Execution) together, then a subtle divider, then `Delivery Prompt`
  - Style as a horizontal row of small pill buttons, matching the existing `TabsList` aesthetic (rounded-lg bg-muted)
  - On click: scroll to the section via `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })` — also auto-expand the `<details>` if collapsed (set `open` attribute)
  - Active section highlighting via `IntersectionObserver`:
    - Observe all 6 section ID elements
    - Highlight the nav item for whichever section is currently most visible
    - Use `threshold: 0.1` and track which entries are intersecting
  - Make the nav sticky: `className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b py-2 -mx-1 px-1"` (sticks to top of scroll container)
  - Ensure the nav does NOT interfere with the outer page header/sidebar — it should be sticky within the Brain Preview tab content area, not the entire page

  **Must NOT do**:
  - Do NOT add any npm dependencies (IntersectionObserver is native browser API)
  - Do NOT make the nav vertical/sidebar — horizontal pill bar only
  - Do NOT sync active section to URL — only outer tabs sync to URL

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential: after T3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx` — Section IDs added by Task 3: `brain-execution-prompt`, `brain-agents-md`, `brain-env-vars`, `brain-tools`, `brain-runtime`, `brain-delivery-prompt`
  - `dashboard/src/components/ui/tabs.tsx` — Existing `TabsList`/`TabsTrigger` styling to reference for consistent pill button look

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sticky nav is visible and stays on scroll
    Tool: Playwright
    Preconditions: On Brain Preview tab
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/00000000-0000-0000-0000-000000000015?tenant=00000000-0000-0000-0000-000000000003&tab=brain
      2. Assert an element containing text "Execution Prompt" AND "AGENTS.md" AND "Env Vars" exists in the nav
      3. Scroll to bottom of page: window.scrollTo(0, document.body.scrollHeight)
      4. Assert the nav element's getBoundingClientRect().top >= 0 (still in viewport)
    Expected Result: Nav bar stays visible at all scroll positions
    Evidence: .sisyphus/evidence/task-4-sticky-nav.png

  Scenario: Nav click scrolls to section and expands it
    Tool: Playwright
    Steps:
      1. Click the "AGENTS.md" nav item
      2. Wait 500ms for smooth scroll
      3. Assert element with id="brain-agents-md" is in viewport (getBoundingClientRect().top < window.innerHeight)
      4. Assert the AGENTS.md section is expanded (details[open] or content visible)
    Expected Result: Page scrolls to section and auto-expands if collapsed
    Evidence: .sisyphus/evidence/task-4-nav-scroll.png

  Scenario: Active section highlights on scroll
    Tool: Playwright
    Steps:
      1. Scroll to make the Environment Variables section visible
      2. Wait 300ms for IntersectionObserver callback
      3. Assert the "Env Vars" nav item has active styling (e.g., data-active="true" or active CSS class)
    Expected Result: Nav highlights the section currently in view
    Evidence: .sisyphus/evidence/task-4-active-highlight.png
  ```

  **Commit**: YES — group 2
  - Message: `feat(dashboard): add Raw/Rendered toggle to AGENTS.md, phase dividers, collapsible sections, and sticky section nav`
  - Files: `dashboard/src/panels/employees/BrainPreviewTab.tsx`
  - Pre-commit: `cd dashboard && pnpm build`

- [x] 5. Dashboard build + Playwright visual QA

  **What to do**:
  - Run `cd dashboard && pnpm build` — assert exit 0
  - Run `pnpm build` (gateway) — assert exit 0
  - Open Playwright, navigate to `http://localhost:7700/dashboard/employees/00000000-0000-0000-0000-000000000015?tenant=00000000-0000-0000-0000-000000000003&tab=brain`
  - Execute ALL QA scenarios from Tasks 1-4
  - Take screenshot of full Brain Preview page
  - Test URL sharing: copy URL with `?tab=brain`, open in new tab, verify Brain Preview loads
  - Test edge case: navigate to `?tab=invalid` — verify fallback to Config

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 4

  **Commit**: NO

- [x] 6. Notify completion — `npx tsx scripts/telegram-notify.ts "✅ brain-preview-ux complete — UX enhancements done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Blocked By**: Task 5

  **Commit**: NO

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `cd dashboard && pnpm build`. Review changed files for `as any`, empty catches, console.log, AI slop.
      Output: `Build [PASS/FAIL] | Code Quality [CLEAN/ISSUES] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Navigate to employee detail page, test all 4 features: URL sync (direct link, tab click, invalid param), AGENTS.md toggle, sticky nav (scroll + click), collapsibility (expand/collapse each section).
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `oracle`
      Verify each task diff matches its spec. Flag unaccounted changes. Only `EmployeeDetail.tsx` and `BrainPreviewTab.tsx` should be modified.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/ISSUES] | VERDICT`

---

## Commit Strategy

| #   | Message                                                                                                                       | Files                 | Pre-commit                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------- |
| 1   | `feat(dashboard): sync employee detail tabs to URL query param`                                                               | `EmployeeDetail.tsx`  | `cd dashboard && pnpm build` |
| 2   | `feat(dashboard): add Raw/Rendered toggle to AGENTS.md section, phase dividers, collapsible sections, and sticky section nav` | `BrainPreviewTab.tsx` | `cd dashboard && pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
cd dashboard && pnpm build  # Expected: exit 0, 2140+ modules
```

### Final Checklist

- [ ] `?tab=brain` URL loads Brain Preview tab directly
- [ ] Invalid `?tab=xyz` falls back to Config
- [ ] AGENTS.md toggle switches between raw and rendered markdown
- [ ] Sticky nav visible at all scroll positions
- [ ] All 6 sections collapsible
- [ ] "Execution Phase" / "Delivery Phase" dividers visible
- [ ] Dashboard builds with zero TypeScript errors
