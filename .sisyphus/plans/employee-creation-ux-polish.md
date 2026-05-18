# Employee Creation UX Polish

## TL;DR

> **Quick Summary**: Six targeted improvements to the new-employee creation page and shared markdown editor — fix a Slack secret key mismatch, upgrade field rendering, redesign tools display, add fullscreen expand to the markdown editor, and remove the vestigial system_prompt field.
>
> **Deliverables**:
>
> - Case-insensitive secret key lookups in `TenantSecretRepository`
> - "What it does" renders markdown instead of plain text
> - Tools section shows individual tool names (no duplicates) with "has access to all" note
> - `MarkdownEditorField` gains expand-to-fullscreen toggle (propagates to all 4 usages)
> - Trigger Instructions uses `MarkdownEditorField` instead of plain `<Input>`
> - System Prompt field removed from creation UI
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (backend) → Task 6 (Playwright QA)

---

## Context

### Original Request

User feedback after testing the new-employee creation page identified six UX issues ranging from a backend bug (Slack "not configured" false positive) to field rendering improvements and a shared component enhancement.

### Interview Summary

**Key Discussions**:

- Case sensitivity: User wants `TenantSecretRepository.get()` to be case-insensitive, not a one-off fix
- Tools: Show granular tool names, not duplicate service badges. Add note that employee has access to all tools
- Markdown editor: Add expand/fullscreen toggle to the shared `MarkdownEditorField` component so all usages benefit
- System prompt: Confirmed vestigial — remove from creation UI only (keep in EmployeeDetail for edge cases)

**Research Findings**:

- `system_prompt` is `String?` (nullable) in Prisma schema — safe to omit
- Zero existing uppercase keys in `tenant_secrets` table — no data migration needed
- OAuth writes `slack_bot_token` (lowercase), channels endpoint reads `SLACK_BOT_TOKEN` (uppercase) = confirmed bug
- `MarkdownEditorField` used in 4 places: CreateEmployeePreview (2x), EmployeeDetail (2x)
- `MarkdownPreview` component already exists for read-only markdown rendering

### Metis Review

**Identified Gaps** (addressed):

- Must fix `set()`, `get()`, `delete()`, `getMany()` — not just `get()` — all must lowercase keys
- Must not change `MarkdownEditorField` props interface in a breaking way — expand toggle always shown
- Tool descriptions: defer fetching from `/admin/tools` — only show the tool filename for now, no separate API call
- Expand UX: defined as portal overlay (z-50, Escape to close, 80vh height)

---

## Work Objectives

### Core Objective

Fix six UX issues in the employee creation flow: a backend secret key bug, four field rendering improvements, and a shared component enhancement.

### Concrete Deliverables

- `src/gateway/services/tenant-secret-repository.ts` — case-insensitive key handling
- `src/gateway/services/__tests__/tenant-secret-repository.test.ts` — new test file
- `dashboard/src/components/MarkdownEditorField.tsx` — expand/fullscreen toggle
- `dashboard/src/panels/employees/CreateEmployeePreview.tsx` — items 1, 3, 5, 6

### Definition of Done

- [ ] `pnpm build` passes (gateway + dashboard)
- [ ] `pnpm test -- --run` passes with new tests
- [ ] Slack channels endpoint returns actual channels (not `SLACK_NOT_CONFIGURED`) for VLRE tenant
- [ ] No duplicate tool badges in creation preview
- [ ] Markdown editor expand button visible and functional

### Must Have

- Case-insensitive secret key lookups across all 4 repository methods
- "What it does" renders markdown via `<MarkdownPreview>`
- Individual tool names (not service-level duplicates) in tools display
- Expand/fullscreen toggle on `MarkdownEditorField` that works at all 4 usage sites
- Trigger Instructions uses `MarkdownEditorField` in Advanced section
- System Prompt field absent from creation form

### Must NOT Have (Guardrails)

- No new API endpoints or backend routes
- No data migration for existing secret keys (confirmed: zero uppercase rows exist)
- No changes to `MarkdownPreview` component (read-only, untouched)
- No breaking changes to `MarkdownEditorField` props interface
- No tool picker / add-tool UI (tool_registry is LLM-generated, read-only display)
- No removal of `system_prompt` from backend schema or EmployeeDetail page
- No fetching tool descriptions from `/admin/tools` — just show the tool filename
- No changes to deprecated components

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend**: Use Bash (curl) — send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent tasks):
├── Task 1: Case-insensitive secret keys + test [quick]
├── Task 2: MarkdownEditorField expand toggle [visual-engineering]
└── Task 3: CreateEmployeePreview field fixes (items 1, 3, 5, 6) [visual-engineering]

Wave 2 (After Wave 1 — dashboard rebuild + integration):
└── Task 4: Dashboard rebuild + backend verification [quick]

Wave 3 (After Wave 2 — browser QA):
└── Task 5: Playwright browser QA — all 6 items [unspecified-high]

Wave FINAL (After ALL tasks — reviews, then user okay):
├── Task F1: Plan Compliance Audit (oracle)
├── Task F2: Code Quality Review (unspecified-high)
├── Task F3: Real Manual QA (unspecified-high + playwright skill)
└── Task F4: Scope Fidelity Check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 4      |
| 2    | —          | 3, 4   |
| 3    | 2          | 4      |
| 4    | 1, 2, 3    | 5      |
| 5    | 4          | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `visual-engineering`, T3 → `visual-engineering`
- **Wave 2**: 1 task — T4 → `quick`
- **Wave 3**: 1 task — T5 → `unspecified-high` + `playwright` skill
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` + `playwright`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Case-insensitive secret key lookups + unit test

  **What to do**:
  - In `src/gateway/services/tenant-secret-repository.ts`, lowercase the `key` parameter in all 4 methods:
    - `get(tenantId, key)` → `key = key.toLowerCase()` as first line
    - `set(tenantId, key, plaintext)` → `key = key.toLowerCase()` as first line
    - `delete(tenantId, key)` → `key = key.toLowerCase()` as first line
    - `getMany(tenantId, keys)` → `keys = keys.map(k => k.toLowerCase())` as first line
  - Fix `src/gateway/routes/admin-slack-channels.ts` line 30: change `'SLACK_BOT_TOKEN'` → `'slack_bot_token'` (to match convention, even though it would now work either way)
  - Create `src/gateway/services/__tests__/tenant-secret-repository.test.ts`:
    - Test: `set("SLACK_BOT_TOKEN", value)` → `get("slack_bot_token")` returns value
    - Test: `set("slack_bot_token", value)` → `get("SLACK_BOT_TOKEN")` returns value
    - Test: `set("Mixed_Case_Key", value)` → `get("mixed_case_key")` returns value
    - Test: `delete("SLACK_BOT_TOKEN")` after `set("slack_bot_token", value)` → `get("slack_bot_token")` returns null
    - Test: `getMany(id, ["SLACK_BOT_TOKEN", "OTHER_KEY"])` with lowercase-stored keys → returns both
    - Use Prisma mock or test DB (follow existing test patterns in `src/gateway/services/__tests__/`)

  **Must NOT do**:
  - Do NOT add a data migration — confirmed zero uppercase rows exist
  - Do NOT change the method signatures or return types
  - Do NOT touch `listKeys()` — it returns stored keys as-is (no normalization needed)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/gateway/services/tenant-secret-repository.ts` — the 4 methods to modify (lines 13, 33, 50, 61)
  - `src/gateway/routes/admin-slack-channels.ts:30` — the uppercase `SLACK_BOT_TOKEN` to fix
  - `src/gateway/slack/installation-store.ts:28` — the lowercase `slack_bot_token` that OAuth writes (reference only, do not modify)
  - `src/gateway/routes/slack-oauth.ts:140` — confirms OAuth writes lowercase (reference only)
  - `src/gateway/services/__tests__/archetype-generator.test.ts` — follow this test pattern for vitest setup

  **Acceptance Criteria**:
  - [ ] All 4 methods lowercase the key parameter
  - [ ] `admin-slack-channels.ts` uses `'slack_bot_token'` (lowercase)
  - [ ] Unit tests pass: `pnpm test -- --run src/gateway/services/__tests__/tenant-secret-repository.test.ts`
  - [ ] Full test suite passes: `pnpm test -- --run`

  **QA Scenarios**:

  ```
  Scenario: Case-insensitive get after lowercase set
    Tool: Bash (vitest)
    Steps:
      1. Run `pnpm test -- --run src/gateway/services/__tests__/tenant-secret-repository.test.ts`
      2. Assert all tests pass (0 failures)
    Expected Result: All 5+ tests pass
    Evidence: .sisyphus/evidence/task-1-secret-tests.txt

  Scenario: Slack channels no longer returns SLACK_NOT_CONFIGURED
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700, VLRE tenant has slack_bot_token set
    Steps:
      1. curl -s -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/slack/channels
      2. Assert response does NOT contain "SLACK_NOT_CONFIGURED"
      3. Assert response contains "channels" array
    Expected Result: JSON with `channels` array (may be empty if token expired, but NOT the error string)
    Evidence: .sisyphus/evidence/task-1-slack-channels.txt
  ```

  **Commit**: YES
  - Message: `fix(api): make tenant secret key lookups case-insensitive`
  - Files: `src/gateway/services/tenant-secret-repository.ts`, `src/gateway/routes/admin-slack-channels.ts`, `src/gateway/services/__tests__/tenant-secret-repository.test.ts`

- [x] 2. MarkdownEditorField — add expand/fullscreen toggle

  **What to do**:
  - Modify `dashboard/src/components/MarkdownEditorField.tsx` to add an expand/fullscreen toggle:
    - Add a new state: `const [expanded, setExpanded] = useState(false)`
    - Add an expand button (⛶ or ↗ icon) in the header bar next to "Editor" / "Preview" labels
    - When expanded:
      - Render the editor+preview inside a React portal (`createPortal` to `document.body`)
      - Portal content: fixed overlay (`position: fixed; inset: 0; z-index: 50`) with a semi-transparent backdrop
      - Inside overlay: white container with same editor/preview layout but using ~90vw width and ~85vh height
      - Header: label text on left, "✕ Close" button on right
      - Side-by-side layout (editor | preview) at full width — each panel gets ~45vw
    - When collapsed: render exactly as before (no visual change to existing behavior)
    - Escape key closes expanded view: `useEffect` with `keydown` listener when expanded
    - Content is shared state — edits in expanded mode persist when collapsed (same `value`/`onChange` props)
  - Do NOT change the component's props interface — no new required props
  - The expand button is always visible (no opt-in prop needed)

  **Must NOT do**:
  - Do NOT add any new props to `MarkdownEditorFieldProps` — keep the existing interface
  - Do NOT change the collapsed layout at all — must be pixel-identical to before
  - Do NOT add expand to `MarkdownPreview` (read-only component)
  - Do NOT add word counts, syntax highlighting toggles, or other editor features

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None

  **References**:
  - `dashboard/src/components/MarkdownEditorField.tsx` — the file to modify (66 lines currently)
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:383-388` — usage with `minHeight={300}` (agents_md)
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:403-410` — usage with `minHeight={200}` (delivery_instructions)
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:498-509` — usage with `minHeight={400}` and `minHeight={250}`
  - React `createPortal` docs: render overlay to document.body to escape parent layout constraints

  **Acceptance Criteria**:
  - [ ] Expand button visible in the MarkdownEditorField header bar
  - [ ] Clicking expand opens a fixed overlay with editor+preview at ~90vw/85vh
  - [ ] Escape key closes the overlay
  - [ ] Close button (✕) in overlay header closes it
  - [ ] Text edited in expanded mode persists after closing
  - [ ] Collapsed mode is visually unchanged from before
  - [ ] `cd dashboard && pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: Expand toggle opens fullscreen overlay
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003
      2. Type description (50+ chars), click Generate, wait for preview
      3. Click "Advanced" toggle to expand
      4. Locate the expand button on the "Employee Brain (agents_md)" editor
      5. Click the expand button
      6. Assert a fixed overlay element is visible (position: fixed, z-index >= 50)
      7. Assert editor and preview panels are visible inside the overlay
      8. Take screenshot
    Expected Result: Full-viewport overlay with side-by-side editor and preview
    Evidence: .sisyphus/evidence/task-2-expand-open.png

  Scenario: Escape closes expanded overlay
    Tool: Playwright
    Steps:
      1. From expanded state (above)
      2. Press Escape key
      3. Assert overlay is no longer visible
      4. Assert the collapsed editor is back in its normal position
    Expected Result: Overlay dismissed, editor returns to inline state
    Evidence: .sisyphus/evidence/task-2-expand-close.png

  Scenario: Content persists across expand/collapse
    Tool: Playwright
    Steps:
      1. In the collapsed agents_md editor, note the current text content
      2. Click expand
      3. Type " — EXTRA TEXT" at the end of the content in the expanded editor
      4. Press Escape to collapse
      5. Assert the collapsed editor now contains the added text
    Expected Result: Text typed in expanded mode is preserved after collapse
    Evidence: .sisyphus/evidence/task-2-content-persist.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add expand/fullscreen toggle to MarkdownEditorField`
  - Files: `dashboard/src/components/MarkdownEditorField.tsx`

- [x] 3. CreateEmployeePreview field fixes (items 1, 3, 5, 6)

  **What to do**:

  **Item 1 — "What it does" renders markdown**:
  - At line 92, replace `<p className="mt-1 text-sm text-muted-foreground">{config.instructions}</p>` with `<MarkdownPreview content={config.instructions} />` (add wrapper `<div className="mt-1">` if needed for spacing)
  - Add import: `import { MarkdownPreview } from '../../components/MarkdownPreview'`

  **Item 3 — Tools section redesign**:
  - Replace lines 328-346 (the tools display block) with:
    - Group tools by service (segment[2] from `/tools/{service}/{tool}.ts`)
    - For each tool, extract the filename: last path segment, strip `.ts` extension
    - Display as a structured list: service name as a subheading, individual tool names below
    - Example: tool path `/tools/sifely/create-passcode.ts` → service "Sifely", tool "create-passcode"
    - After the tool list, add a note: `<p className="text-xs text-muted-foreground italic">These are recommended tools. The employee has access to all available tools.</p>`
    - Use `Badge variant="outline"` for each tool name, visually grouped under service labels

  **Item 5 — Trigger Instructions → MarkdownEditorField**:
  - Replace lines 390-400 (the Trigger Instructions `<div>` with `<Input>`) with:
    ```tsx
    <MarkdownEditorField
      label="Trigger Instructions"
      value={config.instructions}
      onChange={(val) => onConfigChange({ ...config, instructions: val })}
      minHeight={200}
    />
    ```
  - Remove the outer `<div>`, `<label>`, and `<Input>` — `MarkdownEditorField` provides its own label

  **Item 6 — Remove System Prompt from creation**:
  - Delete lines 413-423 entirely (the System Prompt `<div>` with `<label>` and `<Input>`)
  - Ensure no dangling references to `config.system_prompt` remain in this file
  - The backend `archetype-generator.ts` already sets `system_prompt: ''` — safe to omit from UI

  **Must NOT do**:
  - Do NOT modify `MarkdownPreview` component
  - Do NOT modify `MarkdownEditorField` component (that's Task 2)
  - Do NOT add a tool picker or add-tool button
  - Do NOT remove `system_prompt` from EmployeeDetail page
  - Do NOT fetch tool descriptions from `/admin/tools` API

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1) — but depends on Task 2
  - **Parallel Group**: Wave 1 (starts after Task 2 completes, or in Wave 1 if Task 2 is fast)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2 (needs expand toggle in MarkdownEditorField for Item 5)

  **References**:
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx` — the file to modify (429 lines)
    - Line 92: `<p>` tag to replace with `<MarkdownPreview>` (Item 1)
    - Lines 328-346: tools display block to redesign (Item 3)
    - Lines 390-400: Trigger Instructions `<Input>` to swap for `<MarkdownEditorField>` (Item 5)
    - Lines 413-423: System Prompt block to delete (Item 6)
  - `dashboard/src/components/MarkdownPreview.tsx` — existing read-only markdown renderer (16 lines, already exported)
  - `dashboard/src/components/MarkdownEditorField.tsx` — the editor component (will have expand toggle after Task 2)
  - Tool path format from `src/gateway/services/archetype-generator.ts:145` — paths look like `/tools/sifely/create-passcode.ts`

  **Acceptance Criteria**:
  - [ ] "What it does" section renders markdown (code blocks, lists, bold) instead of plain text
  - [ ] Tools section shows individual tool names (e.g. "create-passcode", "list-locks") not duplicate "Sifely" badges
  - [ ] Tools are visually grouped by service
  - [ ] "These are recommended tools..." note is visible below tools
  - [ ] Trigger Instructions uses `MarkdownEditorField` with expand toggle (not plain `<Input>`)
  - [ ] System Prompt field is completely absent from the creation form
  - [ ] `cd dashboard && pnpm build` passes

  **QA Scenarios**:

  ```
  Scenario: "What it does" renders markdown
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003
      2. Enter description (50+ chars), click Generate, wait for preview
      3. Locate the "What it does" section
      4. Assert the content is rendered inside HTML elements like <p>, <code>, <ul>, <ol>, <strong> (not a single plain <p> tag)
      5. Take screenshot
    Expected Result: Markdown formatting visible (bold, code, lists if present)
    Evidence: .sisyphus/evidence/task-3-markdown-render.png

  Scenario: Tools show granular names without duplicates
    Tool: Playwright
    Steps:
      1. From the generated preview (above)
      2. Locate the "Tools" section
      3. Count Badge elements — assert no two badges have the same text
      4. Assert at least one badge contains a tool-level name (e.g. "create-passcode" or "list-locks", not just "Sifely")
      5. Assert the "recommended tools" note text is visible
      6. Take screenshot
    Expected Result: Individual tool names displayed, no duplicates, note visible
    Evidence: .sisyphus/evidence/task-3-tools-display.png

  Scenario: Trigger Instructions uses MarkdownEditorField
    Tool: Playwright
    Steps:
      1. Click "Advanced" toggle to expand
      2. Locate the "Trigger Instructions" section
      3. Assert it contains a textarea (MarkdownEditorField), NOT a plain <input> element
      4. Assert an expand button is visible on the Trigger Instructions editor
      5. Take screenshot
    Expected Result: MarkdownEditorField with expand toggle visible
    Evidence: .sisyphus/evidence/task-3-trigger-instructions.png

  Scenario: System Prompt field is absent
    Tool: Playwright
    Steps:
      1. In the Advanced section (already open)
      2. Search for any element with text "System Prompt" (case-insensitive)
      3. Assert no such element exists
    Expected Result: Zero elements matching "System Prompt" text
    Evidence: .sisyphus/evidence/task-3-no-system-prompt.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): improve field rendering in employee creation preview`
  - Files: `dashboard/src/panels/employees/CreateEmployeePreview.tsx`

- [x] 4. Dashboard rebuild + backend integration verification

  **What to do**:
  - Run `cd dashboard && pnpm build` — rebuild the dashboard static assets served by the gateway
  - Run `pnpm build` — verify full gateway TypeScript compilation
  - Run `pnpm test -- --run` — full test suite (must pass including new tenant-secret-repository tests)
  - Verify Slack channels endpoint: `curl -s -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/slack/channels` — assert response does NOT contain "SLACK_NOT_CONFIGURED"
  - If any build or test failure, fix and re-run

  **Must NOT do**:
  - Do NOT skip tests or use `--no-verify`
  - Do NOT modify source files — only build and verify

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `dashboard/package.json` — build script
  - `package.json` — root build and test scripts
  - `.env` — `ADMIN_API_KEY` for curl verification

  **Acceptance Criteria**:
  - [ ] `cd dashboard && pnpm build` exits 0
  - [ ] `pnpm build` exits 0
  - [ ] `pnpm test -- --run` passes (all tests, including new ones from Task 1)
  - [ ] Slack channels curl returns JSON with `channels` key (not error string)

  **QA Scenarios**:

  ```
  Scenario: Full build passes
    Tool: Bash
    Steps:
      1. Run `cd dashboard && pnpm build 2>&1`
      2. Assert exit code 0
      3. Run `pnpm build 2>&1` (root)
      4. Assert exit code 0
    Expected Result: Both builds succeed
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: Test suite passes
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run 2>&1`
      2. Assert output contains "Tests  ..." with 0 failures
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-4-tests.txt

  Scenario: Slack channels endpoint works for VLRE
    Tool: Bash (curl)
    Steps:
      1. Run `curl -s -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/slack/channels`
      2. Assert response does NOT contain "SLACK_NOT_CONFIGURED"
      3. Assert response is valid JSON containing "channels" key
    Expected Result: JSON response with channels array
    Evidence: .sisyphus/evidence/task-4-slack-channels.txt
  ```

  **Commit**: NO (build artifacts only — no source changes)

- [x] 5. Playwright browser QA — all 6 items end-to-end

  **What to do**:
  - This is a pure verification task. No code changes — only browser testing.
  - Open the dashboard in Playwright, navigate to the employee creation page, generate a config, and verify all 6 fixes are working as a real user would experience them.
  - Capture evidence screenshots for each verification.
  - If any check fails, report exactly what failed and which task needs a fix.

  **Must NOT do**:
  - Do NOT modify any source files
  - Do NOT skip any of the 6 verifications

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **References**:
  - Dashboard URL: `http://localhost:7700/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx` — the preview component
  - `dashboard/src/components/MarkdownEditorField.tsx` — expand toggle component

  **Acceptance Criteria**:
  - [ ] All 6 items verified via Playwright
  - [ ] Screenshots captured for each item
  - [ ] Zero failures

  **QA Scenarios**:

  ```
  Scenario: Full employee creation flow — all 6 items
    Tool: Playwright
    Preconditions: Gateway running at localhost:7700, dashboard built
    Steps:
      1. Navigate to http://localhost:7700/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003
      2. Enter a description of 50+ characters in the description field
      3. Click the "Generate" button
      4. Wait for the preview form to appear (wait for heading "Employee Brain" or "What it does")

      Item 1 — Markdown rendering:
      5. Locate "What it does" section
      6. Assert content is NOT inside a single plain <p> tag
      7. Assert content contains formatted HTML elements (any of: <strong>, <em>, <code>, <ul>, <ol>, <li>)
      8. Screenshot → .sisyphus/evidence/task-5-item1-markdown.png

      Item 2 — Slack channel:
      9. Locate the "Notification Channel" section
      10. Assert it does NOT show text "Slack not configured"
      11. Assert a <select> or dropdown element with channel options is visible (or at minimum, no error state)
      12. Screenshot → .sisyphus/evidence/task-5-item2-slack.png

      Item 3 — Tools display:
      13. Locate the "Tools" section
      14. Collect all Badge text values
      15. Assert no two badges have identical text (no duplicates)
      16. Assert at least one badge contains a hyphenated tool name (e.g. "create-passcode", not "Sifely")
      17. Assert "recommended tools" note text is visible
      18. Screenshot → .sisyphus/evidence/task-5-item3-tools.png

      Item 4 — Markdown editor expand:
      19. Click "Advanced" toggle
      20. Locate the "Employee Brain" MarkdownEditorField
      21. Find and click the expand button (⛶ or ↗ icon)
      22. Assert a fixed overlay is visible (z-index >= 50, position: fixed)
      23. Assert editor textarea and preview panel are both visible in the overlay
      24. Press Escape
      25. Assert overlay is closed
      26. Screenshot (before closing) → .sisyphus/evidence/task-5-item4-expand.png

      Item 5 — Trigger Instructions:
      27. In the Advanced section, locate "Trigger Instructions"
      28. Assert it uses a textarea element (MarkdownEditorField), NOT a plain <input>
      29. Assert an expand button is visible on it
      30. Screenshot → .sisyphus/evidence/task-5-item5-trigger.png

      Item 6 — No System Prompt:
      31. In the Advanced section, search for text "System Prompt"
      32. Assert zero elements with that text exist
      33. Screenshot → .sisyphus/evidence/task-5-item6-no-sysprompt.png

    Expected Result: All 6 items pass verification
    Failure Indicators: Any assertion failure → report which item number failed and what was observed
    Evidence: 6 screenshots as listed above

  Scenario: Expand toggle works on Trigger Instructions editor too
    Tool: Playwright
    Steps:
      1. In the Advanced section (already open)
      2. Find the expand button on the Trigger Instructions editor
      3. Click it
      4. Assert overlay opens with Trigger Instructions content
      5. Press Escape
      6. Assert overlay closes
    Expected Result: Expand works on all MarkdownEditorField instances
    Evidence: .sisyphus/evidence/task-5-trigger-expand.png
  ```

  **Commit**: NO (verification only — no source changes)

- [x] 6. Notify completion via Telegram

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "✅ employee-creation-ux-polish complete — All 6 UX items fixed. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1-F4 (runs after Final Wave)
  - **Blocks**: None

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/employee-creation-ux-polish.md` end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/6] | Must NOT Have [N/8] | Tasks [N/6] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build && pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
      Start from clean state. Execute EVERY QA scenario from Tasks 1-5. Test cross-task integration: generate employee, verify all 6 items work together in one flow. Test edge cases: empty description, very long markdown content, expand/collapse rapid toggling. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff` from before plan started). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/6 compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit | Message                                                                 | Files                                                                                                                                                               |
| ---- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | YES    | `fix(api): make tenant secret key lookups case-insensitive`             | `src/gateway/services/tenant-secret-repository.ts`, `src/gateway/routes/admin-slack-channels.ts`, `src/gateway/services/__tests__/tenant-secret-repository.test.ts` |
| 2    | YES    | `feat(dashboard): add expand/fullscreen toggle to MarkdownEditorField`  | `dashboard/src/components/MarkdownEditorField.tsx`                                                                                                                  |
| 3    | YES    | `feat(dashboard): improve field rendering in employee creation preview` | `dashboard/src/panels/employees/CreateEmployeePreview.tsx`                                                                                                          |
| 4    | NO     | Build verification only                                                 | —                                                                                                                                                                   |
| 5    | NO     | Browser QA only                                                         | —                                                                                                                                                                   |
| 6    | NO     | Notification only                                                       | —                                                                                                                                                                   |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exit 0
cd dashboard && pnpm build    # Expected: exit 0
pnpm test -- --run            # Expected: all pass (including new secret key tests)
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/slack/channels
# Expected: JSON with "channels" array, NOT "SLACK_NOT_CONFIGURED"
```

### Final Checklist

- [ ] All "Must Have" present (6 items)
- [ ] All "Must NOT Have" absent (8 guardrails)
- [ ] All tests pass
- [ ] All 6 Playwright screenshots captured
- [ ] Telegram notification sent
