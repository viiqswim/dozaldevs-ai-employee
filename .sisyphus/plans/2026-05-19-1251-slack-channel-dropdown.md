# Slack Channel Dynamic Dropdown

## TL;DR

> **Quick Summary**: Replace the plain text `<Input>` for Slack Channel on three dashboard pages with a dynamic `<Select>` dropdown that fetches available channels from the tenant's Slack workspace. The entire backend + client stack already exists — this is pure frontend wiring.
>
> **Deliverables**:
>
> - Dynamic Slack channel dropdown on `CreateEmployeePage.tsx`
> - Dynamic Slack channel dropdown on `EditEmployeePage.tsx` (auto-saves on selection)
> - Dynamic Slack channel dropdown on `EmployeeDetail.tsx` (edit panel + resolved read-only display)
> - Loading skeleton while channels fetch, fallback `<Input>` when Slack not configured
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 1 wave (all files independent)
> **Critical Path**: Task 1 → F1-F4 → user okay

---

## Context

### Original Request

User navigated to the Create Employee page and noticed the Slack Channel input doesn't offer any suggestions or dropdown options, despite the tenant having Slack connected since May 12, 2026. Requested a dynamic dropdown showing available Slack channels.

### Interview Summary

**Key Discussions**:

- The backend endpoint `GET /admin/tenants/:tenantId/slack/channels` already exists and is tested
- The dashboard client `fetchSlackChannels(tenantId)` already exists in `gateway.ts`
- `CreateEmployeePreview.tsx` already has the full dropdown pattern — this is the reference implementation
- Three pages still use a plain `<Input>`: CreateEmployeePage, EditEmployeePage, EmployeeDetail
- Store channel IDs (`C0123456789`) not `#channel-name` — more robust, backward-compatible

**Research Findings**:

- Backend returns `{ channels: [{id, name, is_private}] }` with public + private channels, excludes archived, limit 200
- When Slack not configured: returns `{ channels: [], error: 'SLACK_NOT_CONFIGURED' }` — triggers Input fallback
- `CreateEmployeePreview.tsx` uses `value={ch.id}` for storage and `#{ch.name}` for display
- Radix UI `<Select>` component already exists in `dashboard/src/components/ui/select.tsx`

### Metis Review

**Identified Gaps** (addressed):

- `EditEmployeePage` uses `onBlur` to save, but `<Select>` doesn't fire `onBlur` — save via `onValueChange` instead
- `EmployeeDetail.tsx` line 446 shows raw `notification_channel` in read-only view — will show IDs instead of names. Resolved: use loaded channels to display `#name`, fall back to raw value
- Backward-compat: existing employees with legacy `#channel-name` won't pre-select in dropdown — Select shows placeholder. Acceptable: user re-selects to naturally migrate to channel ID. Noted in plan.
- Scope creep locked down: no refresh button, no search/filter, no private channel icons, no shared component extraction

---

## Work Objectives

### Core Objective

Wire the existing `fetchSlackChannels` API + Radix `<Select>` component into the three dashboard pages that still use plain `<Input>` for the Slack Channel field.

### Concrete Deliverables

- `CreateEmployeePage.tsx`: `<Select>` dropdown with `fetchSlackChannels`, loading skeleton, `<Input>` fallback
- `EditEmployeePage.tsx`: Same dropdown + auto-save on `onValueChange` (replaces `onBlur` save for this field)
- `EmployeeDetail.tsx`: Same dropdown in edit panel + resolved `#channel-name` display in read-only view

### Definition of Done

- [ ] All three pages show a `<Select>` dropdown when Slack channels load successfully
- [ ] All three pages show a plain `<Input>` fallback when Slack is not configured
- [ ] All three pages show a loading skeleton while channels are fetching
- [ ] Selecting a channel stores the channel **ID** (e.g. `C0123456789`), not `#name`
- [ ] `EditEmployeePage` auto-saves on channel selection (no separate save button)
- [ ] `EmployeeDetail` read-only view shows `#channel-name`, not raw channel ID

### Must Have

- Dynamic `<Select>` dropdown fetching channels via `fetchSlackChannels(tenantId)` on all three pages
- Loading skeleton (`h-9 w-full animate-pulse rounded-md bg-muted`) while channels load
- `<Input>` fallback when `slackChannels.length === 0`
- Channel ID stored as the value (not `#name`)
- `EditEmployeePage` saves immediately on `onValueChange`
- `EmployeeDetail` read-only view resolves channel ID to `#name` using loaded channels
- Follow the exact pattern from `CreateEmployeePreview.tsx` lines 42-66 and 309-343

### Must NOT Have (Guardrails)

- Do NOT modify `CreateEmployeePreview.tsx` — it already has the correct implementation
- Do NOT extract a shared `SlackChannelSelect` component — inline the pattern per page
- Do NOT add search/filter to the dropdown (Radix Select doesn't support it natively)
- Do NOT add a refresh button to reload channels
- Do NOT show private channels differently (no lock icons for `is_private`)
- Do NOT change the Generate button disable condition logic — only the input widget changes
- Do NOT validate channel ID format — trust the Slack API response
- Do NOT modify the backend endpoint or `fetchSlackChannels` client function
- Do NOT add excessive comments explaining the change

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None — purely UI wiring of existing components. Backend endpoint already tested in `admin-slack-channels.test.ts`.
- **Framework**: Vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Add Slack channel dropdown to CreateEmployeePage [quick]
├── Task 2: Add Slack channel dropdown to EditEmployeePage [quick]
└── Task 3: Add Slack channel dropdown to EmployeeDetail (edit + read-only) [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | F1-F4  |
| 2    | —          | F1-F4  |
| 3    | —          | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add Slack channel dropdown to CreateEmployeePage

  **What to do**:
  - Add `useState` for `slackChannels: SlackChannel[]` (init `[]`) and `slackLoading: boolean` (init `true`)
  - Add `useEffect` that calls `fetchSlackChannels(tenantId)`, sets channels on success, sets `slackLoading = false`. Include a `cancelled` flag for cleanup (same pattern as `CreateEmployeePreview.tsx` lines 42-66)
  - Import `fetchSlackChannels` from `@/lib/gateway`, `SlackChannel` from `@/lib/types`, and `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` from `@/components/ui/select`
  - Replace the Slack Channel `<Input>` (around lines 96-107) with:
    - Loading state: `<div className="h-9 w-full animate-pulse rounded-md bg-muted" />`
    - Channels loaded: `<Select value={notificationChannel} onValueChange={setNotificationChannel}>` with `<SelectItem key={ch.id} value={ch.id}>#{ch.name}</SelectItem>` for each channel
    - No channels / Slack not configured: keep the current `<Input>` as fallback
  - The `Generate` button disabled condition (`!notificationChannel.trim()`) remains unchanged — works identically with Select values

  **Must NOT do**:
  - Do NOT modify `CreateEmployeePreview.tsx`
  - Do NOT extract a shared component
  - Do NOT change the Generate button disable logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Copy a well-documented pattern from CreateEmployeePreview.tsx into one file — mechanical
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — no design work, copying an existing pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (THE reference implementation — follow exactly):
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:42-66` — useEffect + fetchSlackChannels + cancelled flag + error handling. Copy this exactly.
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:309-343` — Select/Input rendering pattern with loading skeleton. Copy this structure.

  **Target File**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:96-107` — Current `<Input>` for Slack Channel to replace
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:108-113` — Generate button disabled condition (do NOT change, just verify it works)

  **API/Type References**:
  - `dashboard/src/lib/gateway.ts:273-289` — `fetchSlackChannels(tenantId)` function signature and return type
  - `dashboard/src/lib/types.ts:251` — `SlackChannel { id, name, is_private }`
  - `dashboard/src/components/ui/select.tsx` — Select, SelectTrigger, SelectValue, SelectContent, SelectItem

  **WHY Each Reference Matters**:
  - `CreateEmployeePreview.tsx:42-66`: This is the canonical pattern — useEffect with cancelled flag, error handling, loading state. Do not reinvent.
  - `CreateEmployeePreview.tsx:309-343`: This is the rendering pattern — loading skeleton → Select → Input fallback. Copy the structure.
  - `CreateEmployeePage.tsx:96-107`: This is the exact location to modify — the current Input element.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dropdown loads and shows Slack channels on /new page
    Tool: Playwright
    Preconditions: Dashboard running at http://localhost:7701, gateway at http://localhost:7700, tenant 00000000-0000-0000-0000-000000000003 has Slack connected
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for loading skeleton to disappear (wait for `.animate-pulse` to be gone, max 10s)
      3. Assert a Select trigger element is visible in the Slack Channel section (look for `[role="combobox"]` or SelectTrigger near the "Slack Channel" label)
      4. Click the Select trigger to open the dropdown
      5. Assert at least one channel option is visible (text matching `#` prefix)
      6. Select the first channel option
      7. Assert the Select trigger now shows the selected channel name (e.g. `#general`)
    Expected Result: Dropdown renders with channel list, selection updates the trigger display
    Failure Indicators: Plain Input still shown, no channels in dropdown, dropdown doesn't open
    Evidence: .sisyphus/evidence/task-1-create-page-dropdown.png

  Scenario: Generate button disabled until channel selected
    Tool: Playwright
    Preconditions: Same as above
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for channels to load (skeleton gone)
      3. Type "A test employee that monitors channels daily" in the description textarea
      4. Assert Generate button is disabled (no channel selected yet)
      5. Open the Slack Channel Select and pick a channel
      6. Assert Generate button is now enabled
    Expected Result: Generate button blocked without channel, enabled after selection
    Failure Indicators: Button enabled without channel selection
    Evidence: .sisyphus/evidence/task-1-create-page-disabled.png
  ```

  **Evidence to Capture:**
  - [ ] task-1-create-page-dropdown.png — screenshot showing Select dropdown with channel options
  - [ ] task-1-create-page-disabled.png — screenshot showing disabled Generate until channel selected

  **Commit**: YES
  - Message: `feat(dashboard): add Slack channel dropdown to CreateEmployeePage`
  - Files: `dashboard/src/panels/employees/CreateEmployeePage.tsx`
  - Pre-commit: `pnpm lint`

- [x] 2. Add Slack channel dropdown to EditEmployeePage (auto-save on selection)

  **What to do**:
  - Add `useState` for `slackChannels: SlackChannel[]` (init `[]`) and `slackLoading: boolean` (init `true`)
  - Add `useEffect` that calls `fetchSlackChannels(tenantId)`, sets channels on success, sets `slackLoading = false`. Include cancelled flag for cleanup.
  - Import `fetchSlackChannels` from `@/lib/gateway`, `SlackChannel` from `@/lib/types`, and Select components from `@/components/ui/select`
  - Replace the Slack Channel `<Input>` (around lines 244-266) with the same Select/Input/Loading pattern from Task 1
  - **CRITICAL — Save pattern change**: The current `<Input>` uses `onBlur` to trigger `patch()`. The `<Select>` must save on `onValueChange` instead:
    ```tsx
    onValueChange={(value) => {
      setEditState(prev => ({
        ...prev,
        archetype: { ...prev.archetype, notification_channel: value }
      }));
      patch({ notification_channel: value || null });
    }}
    ```
  - The `<Select>` `value` prop should be `archetype.notification_channel ?? ''`
  - **Backward-compat note**: If an existing employee has a legacy `#channel-name` value (not a channel ID), the Select won't pre-select it. The Select will show the placeholder. When the user selects a channel, it naturally migrates to the ID. This is expected behavior — do NOT add special handling.
  - The "Create Employee" button disabled condition (`!archetype.notification_channel?.trim()`) remains unchanged

  **Must NOT do**:
  - Do NOT add a separate save button — save on `onValueChange`
  - Do NOT change the surrounding save architecture or `onBlur` for other fields
  - Do NOT extract a shared component

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Same pattern as Task 1 with one adaptation (onValueChange → patch). Mechanical.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:42-66` — useEffect + fetchSlackChannels pattern (copy exactly)
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:309-343` — Select rendering pattern (adapt for onValueChange save)

  **Target File**:
  - `dashboard/src/panels/employees/EditEmployeePage.tsx:244-266` — Current `<Input>` for notification_channel to replace
  - `dashboard/src/panels/employees/EditEmployeePage.tsx:403-412` — "Create Employee" button disabled condition (do NOT change)

  **API/Type References**:
  - `dashboard/src/lib/gateway.ts:273-289` — `fetchSlackChannels(tenantId)`
  - `dashboard/src/lib/types.ts:251` — `SlackChannel { id, name, is_private }`

  **WHY Each Reference Matters**:
  - `EditEmployeePage.tsx:244-266`: The exact Input to replace. Note the `onBlur` → `patch()` pattern that must become `onValueChange` → `patch()`.
  - `CreateEmployeePreview.tsx`: Reference pattern — but adapt the save trigger from state-only to state + patch.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dropdown loads on /edit page and auto-saves on selection
    Tool: Playwright
    Preconditions: Dashboard running, gateway running, a draft employee exists (e.g. d998d547-ca06-4734-bc1a-9fd39dbcd073 for tenant 00000000-0000-0000-0000-000000000003)
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/d998d547-ca06-4734-bc1a-9fd39dbcd073/edit?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for channels to load (skeleton gone, max 10s)
      3. Assert a Select trigger is visible in the Slack Channel section
      4. Click the Select trigger and pick a channel
      5. Wait 2 seconds for the PATCH to complete
      6. Reload the page
      7. Assert the Select trigger shows the channel that was just selected (persisted)
    Expected Result: Channel selection triggers auto-save, value persists across reload
    Failure Indicators: Select not rendered, value not persisted after reload, PATCH not fired
    Evidence: .sisyphus/evidence/task-2-edit-page-autosave.png

  Scenario: Create Employee button disabled without channel on /edit page
    Tool: Playwright
    Preconditions: Same as above
    Steps:
      1. Navigate to the edit page
      2. Wait for channels to load
      3. If a channel is currently selected, note it
      4. Assert "Create Employee" button state is consistent with channel presence
    Expected Result: Button disabled when no channel set, enabled when channel is set
    Failure Indicators: Button enabled without a channel
    Evidence: .sisyphus/evidence/task-2-edit-page-disabled.png
  ```

  **Evidence to Capture:**
  - [ ] task-2-edit-page-autosave.png — screenshot showing channel persisted after selection
  - [ ] task-2-edit-page-disabled.png — screenshot showing button state relative to channel

  **Commit**: YES
  - Message: `feat(dashboard): add Slack channel dropdown to EditEmployeePage`
  - Files: `dashboard/src/panels/employees/EditEmployeePage.tsx`
  - Pre-commit: `pnpm lint`

- [x] 3. Add Slack channel dropdown to EmployeeDetail (edit panel + read-only display)

  **What to do**:
  - Add `useState` for `slackChannels: SlackChannel[]` (init `[]`) and `slackLoading: boolean` (init `true`)
  - Add `useEffect` that calls `fetchSlackChannels(tenantId)`, sets channels on success, sets `slackLoading = false`. Include cancelled flag for cleanup.
  - Import `fetchSlackChannels` from `@/lib/gateway`, `SlackChannel` from `@/lib/types`, and Select components from `@/components/ui/select`
  - **Edit panel** (around line 594): Replace the `<Input>` for `notification_channel` with the same Select/Input/Loading pattern. Use `onValueChange` to call the existing `set('notification_channel')` helper (or however editValues are updated in this component). The value saves when the user clicks the existing Save button.
  - **Read-only display** (around line 446): Currently renders `{archetype.notification_channel ?? '—'}` directly. Add a helper that resolves the stored channel ID to `#channel-name`:
    ```tsx
    const resolveChannelName = (channelId: string | null) => {
      if (!channelId) return '—';
      const found = slackChannels.find((ch) => ch.id === channelId);
      return found ? `#${found.name}` : channelId; // fall back to raw value if not found
    };
    ```
    Replace the raw display with `{resolveChannelName(archetype.notification_channel)}`.
  - This ensures the read-only view shows `#general` instead of `C0123456789` after channels load. Before channels load (or if the value is a legacy `#name`), it shows the raw value — acceptable fallback.

  **Must NOT do**:
  - Do NOT extract a shared component
  - Do NOT add a separate save mechanism — use the existing Save button flow
  - Do NOT add channel name resolution to `CreateEmployeePage` or `EditEmployeePage` (not needed there — those pages always show the Select, not a read-only value)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Same Select pattern + a small display helper. Slightly more than Tasks 1-2 but still mechanical.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:42-66` — useEffect + fetchSlackChannels pattern
  - `dashboard/src/panels/employees/CreateEmployeePreview.tsx:309-343` — Select rendering pattern

  **Target File**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:594-598` — Current `<Input>` for notification_channel in edit panel
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:446` — Read-only display: `{archetype.notification_channel ?? '—'}` to enhance

  **API/Type References**:
  - `dashboard/src/lib/gateway.ts:273-289` — `fetchSlackChannels(tenantId)`
  - `dashboard/src/lib/types.ts:251` — `SlackChannel { id, name, is_private }`

  **WHY Each Reference Matters**:
  - `EmployeeDetail.tsx:594`: The Input to replace with Select in the edit panel
  - `EmployeeDetail.tsx:446`: The read-only display that will show raw channel IDs — needs the `resolveChannelName` helper
  - `CreateEmployeePreview.tsx`: Reference pattern for the Select implementation

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: EmployeeDetail edit panel shows Select dropdown
    Tool: Playwright
    Preconditions: Dashboard running, an active employee exists that can be viewed in the detail panel
    Steps:
      1. Navigate to the employees list and click on an employee to open the detail panel
      2. Enter edit mode (click Edit or equivalent)
      3. Wait for channels to load (skeleton gone)
      4. Assert a Select trigger is visible for the Slack Channel field
      5. Open the Select and verify channel options are listed
    Expected Result: Select dropdown with channel options in the edit panel
    Failure Indicators: Plain Input still shown, no channels
    Evidence: .sisyphus/evidence/task-3-detail-edit-dropdown.png

  Scenario: EmployeeDetail read-only view shows #channel-name (not raw ID)
    Tool: Playwright
    Preconditions: Dashboard running, an employee with a channel ID stored (from previous task)
    Steps:
      1. Navigate to the employee detail page (read-only view)
      2. Wait for channels to load
      3. Find the notification_channel display in the detail panel
      4. Assert the text shows `#channel-name` format (e.g. `#general`) not a raw ID (`C0123456789`)
    Expected Result: Read-only display shows human-readable `#channel-name`
    Failure Indicators: Raw channel ID displayed, or `—` shown for a valid channel
    Evidence: .sisyphus/evidence/task-3-detail-readonly-display.png
  ```

  **Evidence to Capture:**
  - [ ] task-3-detail-edit-dropdown.png — screenshot showing Select in edit panel
  - [ ] task-3-detail-readonly-display.png — screenshot showing resolved `#channel-name` in read-only view

  **Commit**: YES
  - Message: `feat(dashboard): add Slack channel dropdown to EmployeeDetail`
  - Files: `dashboard/src/panels/employees/EmployeeDetail.tsx`
  - Pre-commit: `pnpm lint`

- [x] 4. Notify completion

  Send Telegram notification: `npx tsx scripts/telegram-notify.ts "slack-channel-dropdown complete — all tasks done. Come back to review results."`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, assert DOM via Playwright). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (all three pages consistent). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                             | Files                    | Pre-commit  |
| ------ | ------------------------------------------------------------------- | ------------------------ | ----------- |
| 1      | `feat(dashboard): add Slack channel dropdown to CreateEmployeePage` | `CreateEmployeePage.tsx` | `pnpm lint` |
| 2      | `feat(dashboard): add Slack channel dropdown to EditEmployeePage`   | `EditEmployeePage.tsx`   | `pnpm lint` |
| 3      | `feat(dashboard): add Slack channel dropdown to EmployeeDetail`     | `EmployeeDetail.tsx`     | `pnpm lint` |

---

## Success Criteria

### Verification Commands

```bash
# Build passes
pnpm build

# Lint passes
pnpm lint
```

### Final Checklist

- [ ] All three pages show Select dropdown when Slack channels load
- [ ] All three pages show Input fallback when Slack not configured
- [ ] Channel IDs stored (not `#name`)
- [ ] Edit page auto-saves on selection
- [ ] EmployeeDetail read-only view shows `#channel-name`
- [ ] `CreateEmployeePreview.tsx` unchanged
- [ ] No shared `SlackChannelSelect` component created
- [ ] No backend changes
