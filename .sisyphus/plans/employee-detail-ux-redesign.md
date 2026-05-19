# Employee Detail Page UX Redesign — Human-First for Non-Technical Users

## TL;DR

> **Quick Summary**: Redesign all 4 tabs of the employee detail dashboard page for non-technical users (property managers). Replace developer jargon with human-friendly language, separate user settings from platform internals, add interactive rule management with full backend CRUD, and enrich the activity feed with metadata cards.
>
> **Deliverables**:
>
> - Settings tab (Config→Settings): overview header, user-facing section, collapsed technical details, approval toggle
> - Activity tab (Recent Tasks→Activity): metadata cards with trigger source, expandable status timeline
> - Training tab (Rules→Training): full CRUD — approve/reject, edit, add, delete rules with new backend API
> - Knowledge tab (Brain Preview→Knowledge): human/technical split
> - URL backward-compat for renamed tab params
> - New gateway routes for employee rule mutations
> - Missing shadcn/ui components (switch, accordion, tooltip)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 3 → Task 10 → Task 11 → F1–F4

---

## Context

### Original Request

Redesign the employee detail page (`/dashboard/employees/:id`) across all 4 tabs. Current page is developer-centric — technical jargon labels, raw JSON, no hierarchy, read-only Rules tab. Target: non-technical property managers who need intuitive AI employee management.

### Interview Summary

- Developer fields (model, runtime, vm_size, deliverable_type): read-only in collapsed "Technical Details"
- Brain Preview: keep ALL info but split into human-readable and technical debug sections
- Rules: full interactive CRUD including new backend API
- Recent Tasks: metadata cards (no summary field in DB), with expandable status timeline
- Edit mode: full-page toggle; developer fields stay read-only in edit mode
- Tabs renamed: Config→Settings, Recent Tasks→Activity, Rules→Training, Brain Preview→Knowledge
- Test strategy: Playwright QA only

### Research Findings

- `archetype.overview` field exists and is seeded with human-readable data but shown nowhere on the detail page
- `risk_model` is just `{ approval_required: boolean, timeout_hours?: number }` — toggle + number replaces raw JSON
- `StatusTimeline.tsx` already exists in TaskDetail — reuse in Activity cards (expand-on-click, lazy fetch)
- `BrainPreviewTab.tsx` already renders "Human Configuration" and "Auto-Injected by Platform" (lines 244-355)
- No gateway routes for `employee_rules` mutations — backend CRUD must be built
- Tasks table has no `summary` field — use `source_system`, status, `failure_reason` for card metadata
- Missing shadcn components: switch, accordion, tooltip
- `isGuestMessaging` hardcode (line 656) violates shared-file rule — replace with data-driven check
- URL params (`?tab=brain`, `?tab=tasks`, etc.) will break on rename — backward-compat mapping needed

---

## Work Objectives

### Must Have

- Tab renaming with URL backward-compat
- Developer fields in collapsed read-only section
- Risk model as toggle + number input (no raw JSON)
- `overview` surfaced in Settings tab
- Rule CRUD gateway API + frontend
- Metadata cards with trigger source in Activity tab
- Expandable status timeline reusing `StatusTimeline.tsx`
- Human/technical split in Knowledge tab

### Must NOT Have (Guardrails)

- No changes to `src/inngest/`
- No changes to `src/workers/`
- No changes to `prisma/schema.prisma`
- No changes to `dashboard/src/panels/tasks/`
- No changes to `EmployeeList.tsx`
- No changes to `CreateEmployeePage.tsx` or `EditEmployeePage.tsx`
- No employee-specific language in shared files
- No `as any` or `@ts-ignore`
- No `postgrestFetch` for write operations

---

## Execution Strategy

```
Wave 1 (Foundation):
├── Task 1: Foundation — shadcn components, tab rename, hardcode fix [quick]
├── Task 2: Settings view mode — overview, user section, collapsed tech [visual-engineering]
├── Task 5: Backend — gateway rule CRUD route [unspecified-high]

Wave 2 (Core UI):
├── Task 3: Settings — risk model toggle, tooltips [visual-engineering] (dep: 1)
├── Task 4: Settings edit mode — protect dev fields, structured risk model [visual-engineering] (dep: 2)
├── Task 6: Frontend rule API functions [quick] (dep: 5)
├── Task 7: Activity tab — metadata cards + timeline [visual-engineering] (dep: 1)

Wave 3 (Complex tabs):
├── Task 8: Training tab — interactive rule CRUD UI [visual-engineering] (dep: 6, 2)
├── Task 9: Knowledge tab — human/technical split [visual-engineering] (dep: 1)

Wave 4 (Polish):
├── Task 10: Cross-tab polish — empty states, skeletons, errors [visual-engineering] (dep: 7,8,9)
├── Task 11: Telegram notification [quick] (dep: 10)

Wave FINAL: F1 oracle, F2 unspecified-high, F3 unspecified-high, F4 deep
```

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 3, 7, 9 | 1    |
| 2    | —          | 4, 8    | 1    |
| 5    | —          | 6       | 1    |
| 3    | 1          | 10      | 2    |
| 4    | 2          | 10      | 2    |
| 6    | 5          | 8       | 2    |
| 7    | 1          | 10      | 2    |
| 8    | 6, 2       | 10      | 3    |
| 9    | 1          | 10      | 3    |
| 10   | 7, 8, 9    | 11      | 4    |
| 11   | 10         | F1-F4   | 4    |

---

## TODOs

- [x] 1. Foundation — Add Missing UI Components, Tab Rename with Backward-Compat, Remove Hardcode

  **What to do**:
  - Add 3 shadcn/ui components to `dashboard/src/components/ui/`: `switch.tsx` (Radix Switch), `accordion.tsx` (Radix Accordion), `tooltip.tsx` (Radix Tooltip). Follow existing pattern in `dialog.tsx`/`select.tsx` — thin Radix wrappers with Tailwind and `cn()`.
  - Update `VALID_TABS` (line 526 in EmployeeDetail.tsx): rename `config→settings`, `tasks→activity`, `rules→training`, `brain→knowledge`. Add backward-compat mapping so old param values resolve to new ones. Update all TabsTrigger/TabsContent values.
  - Replace `isGuestMessaging` hardcode (line 656): use `archetype.deliverable_type === 'hostfully_message'` instead of `archetype.role_name === 'guest-messaging'`.

  **Must NOT do**: No backend changes. No tab content restructuring. No non-Radix-pattern components.

  **Recommended Agent Profile**: **Category**: `quick` | **Skills**: []

  **Parallelization**: Wave 1 (with 2, 5) | Blocks: 3, 7, 9 | Blocked By: None

  **References**:
  - `dashboard/src/components/ui/dialog.tsx` — Radix wrapper pattern (forwardRef, cn(), sub-components)
  - `dashboard/src/components/ui/select.tsx` — Another Radix wrapper example
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:526` — VALID_TABS constant
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:534-547` — Tab param handling and handleTabChange
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:656` — isGuestMessaging hardcode
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:701-707` — TabsList/TabsTrigger elements
  - Radix Switch: https://www.radix-ui.com/primitives/docs/components/switch
  - Radix Accordion: https://www.radix-ui.com/primitives/docs/components/accordion
  - Radix Tooltip: https://www.radix-ui.com/primitives/docs/components/tooltip

  **QA Scenarios:**

  ```
  Scenario: Old tab params backward-compat
    Tool: Playwright (localhost:7701)
    Steps:
      1. Navigate ?tab=brain → Assert: "Knowledge" tab active (data-state="active")
      2. Navigate ?tab=config → Assert: "Settings" active
      3. Navigate ?tab=tasks → Assert: "Activity" active
      4. Navigate ?tab=rules → Assert: "Training" active
    Evidence: .sisyphus/evidence/task-1-backward-compat.png

  Scenario: New tab names visible, old names gone
    Tool: Playwright
    Steps: Assert tabs "Settings", "Activity", "Training", "Knowledge" exist; "Config", "Recent Tasks", "Rules", "Brain Preview" do NOT
    Evidence: .sisyphus/evidence/task-1-new-names.png

  Scenario: Fire Webhook data-driven (not hardcoded)
    Tool: Playwright
    Steps: guest-messaging detail → "Fire Webhook" visible; code-rotation detail → NOT visible
    Evidence: .sisyphus/evidence/task-1-webhook.png

  Scenario: Build succeeds with new components
    Tool: Bash
    Steps: pnpm build → 0 errors
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: `feat(dashboard): add foundation components and tab rename with backward-compat` | Pre-commit: `pnpm lint && pnpm build`

- [x] 2. Settings Tab — Restructure View Mode (Overview Header, User Section, Collapsed Technical Details)

  **What to do**:
  - Restructure ConfigTab view mode (the `if (!editMode)` block, ~line 336):
  - **Section 1 — Overview** (top): Render `archetype.overview` field (`{role, trigger, workflow[], tools_used, output, approval}`). Display as a descriptive summary card with human-readable text. If `overview` is null, use `instructions` text as fallback. Show role description + trigger description.
  - **Section 2 — Behavior & Settings** (user-facing): Instructions (labeled "Task Instructions"), Approval badge, Notification Channel (labeled "Slack Channel"), Concurrency Limit (labeled "Simultaneous Tasks"), Timeout from risk_model.timeout_hours (shown as "Maximum Duration: X hours").
  - **Section 3 — Technical Details** (Accordion, collapsed by default): Model, Runtime, VM Size, Deliverable Type, System Prompt, Risk Model JSON. All read-only. Label it "Technical Details" with a chevron.

  **Must NOT do**: No edit mode changes (Task 4). No data fetching changes. No employee-specific language. No new Archetype type fields.

  **Recommended Agent Profile**: **Category**: `visual-engineering` | **Skills**: []

  **Parallelization**: Wave 1 (with 1, 5) | Blocks: 4, 8 | Blocked By: None

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:336-418` — Current view mode layout to restructure
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:79-89` — FieldLabel/FieldValue helper components
  - `dashboard/src/lib/types.ts` — Archetype type (check `overview` field definition)
  - `dashboard/src/components/ui/accordion.tsx` — From Task 1 (dependency note: this file created in T1 but T2 runs in parallel — accordion usage in T2 can be added via a small follow-up if T1 isn't done yet; alternatively implement the collapsed section with a simple details/summary HTML element as fallback)

  **QA Scenarios:**

  ```
  Scenario: Overview section renders with data
    Tool: Playwright
    Steps:
      1. guest-messaging Settings tab → Assert: overview content visible (role/trigger text)
      2. Assert: overview section is visually at top above other fields
    Evidence: .sisyphus/evidence/task-2-overview.png

  Scenario: Technical Details collapsed by default
    Tool: Playwright
    Steps:
      1. code-rotation Settings tab
      2. Assert: "minimax/minimax-m2.7" NOT visible on screen
      3. Assert: "opencode" NOT visible
      4. Click "Technical Details" → Assert: now visible
    Evidence: .sisyphus/evidence/task-2-collapsed.png

  Scenario: Human-readable approval and timeout
    Tool: Playwright
    Steps:
      1. guest-messaging Settings → Assert: "Required" badge + "24 hours" text
      2. code-rotation Settings → Assert: "Auto" badge + "2 hours" text
      3. Assert: no raw JSON (no curly braces, no "timeout_hours" key) in user-facing section
    Evidence: .sisyphus/evidence/task-2-approval.png
  ```

  **Commit**: groups with Tasks 3, 4 — `feat(dashboard): redesign Settings tab for non-technical users`

- [x] 3. Settings Tab — Risk Model Toggle, Field Tooltips

  **What to do**:
  - Enhance Behavior & Settings section from Task 2:
  - **Approval display**: Show a disabled `Switch` (from Task 1) reflecting `risk_model.approval_required`. Disabled in view mode (Task 4 makes it interactive in edit).
  - **Timeout display**: Show `risk_model.timeout_hours` as "Maximum Duration: X hours" with a `Tooltip` explaining "If the employee takes longer than this, the task will be marked as timed out."
  - **Add Tooltips** to fields needing explanation:
    - "Simultaneous Tasks" (concurrency_limit) → "How many tasks this employee can work on at the same time"
    - "Slack Channel" (notification_channel) → "The Slack channel where this employee sends notifications and approval requests"
    - "Task Instructions" (instructions) → "The main instruction given to the employee each time it runs"

  **Must NOT do**: Switch non-interactive in view mode. No edit mode changes. No jargon in tooltips.

  **Recommended Agent Profile**: **Category**: `visual-engineering` | **Skills**: []

  **Parallelization**: Wave 2 (with 4, 6, 7) | Blocks: 10 | Blocked By: 1

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:379-391` — Current approval badge code to replace
  - `dashboard/src/components/ui/switch.tsx` — From Task 1
  - `dashboard/src/components/ui/tooltip.tsx` — From Task 1

  **QA Scenarios:**

  ```
  Scenario: Tooltips show on hover
    Tool: Playwright
    Steps: guest-messaging Settings → hover info icon for "Simultaneous Tasks" → Assert: tooltip with "same time"
    Evidence: .sisyphus/evidence/task-3-tooltips.png

  Scenario: Approval shown as switch, timeout as duration
    Tool: Playwright
    Steps: guest-messaging → switch element in "on" state, "24 hours" visible; no "timeout_hours" text
    Evidence: .sisyphus/evidence/task-3-risk-model.png
  ```

  **Commit**: groups with Tasks 2, 4

- [x] 4. Settings Tab — Edit Mode Redesign (Protect Developer Fields, Structured Risk Model)

  **What to do**:
  - Restructure edit mode (the `else` block ~line 422):
  - **Remove from EditValues** (line 51): `model`, `runtime`, `vm_size`, `deliverable_type`. Keep: `role_name`, `instructions`, `system_prompt`, `notification_channel`, `concurrency_limit`.
  - **Remove from PatchData** (line 36): `model`, `runtime` (prevent backend mutation of these fields).
  - **Replace `risk_model_json`** in EditValues with `approval_required: boolean` + `timeout_hours: number`. Use Switch for approval toggle, number Input for timeout. Reconstruct `risk_model` object in `handleSave`.
  - **Editable form fields**: Role Name (text input), Task Instructions (MarkdownEditorField), Approval Required (Switch), Maximum Duration (number input, hours), Slack Channel (text input), Simultaneous Tasks (number input). System Prompt in collapsible "Advanced" section.
  - **Save/Cancel buttons at both top AND bottom** of form (long form needs bottom buttons too).
  - Update `handleSave` to construct `risk_model: { approval_required, timeout_hours }` from structured fields.

  **Must NOT do**: No developer field inputs in edit form. No `patchArchetype` gateway function changes. Must not break existing save.

  **Recommended Agent Profile**: **Category**: `visual-engineering` | **Skills**: []

  **Parallelization**: Wave 2 (with 3, 6, 7) | Blocks: 10 | Blocked By: 2

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:36-49` — PatchData type to modify
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:51-62` — EditValues interface to modify
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:274-327` — handleSave to update
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:422-523` — Edit mode JSX to restructure
  - `dashboard/src/lib/gateway.ts` — patchArchetype (reference only — do not change)

  **QA Scenarios:**

  ```
  Scenario: Developer fields absent from edit form
    Tool: Playwright
    Steps:
      1. guest-messaging Settings → Click Edit
      2. Assert: no input with value "minimax/minimax-m2.7"
      3. Assert: no input with value "opencode"
      4. Assert: no "VM Size" or "Deliverable Type" labels
      5. Assert: approval switch and timeout number input exist
    Evidence: .sisyphus/evidence/task-4-edit-fields.png

  Scenario: Structured risk model saves correctly
    Tool: Playwright + curl
    Steps:
      1. code-rotation Settings → Edit → toggle approval ON, set timeout to 4 → Save
      2. Assert: success toast
      3. curl GET archetype from PostgREST → Assert: risk_model has approval_required:true, timeout_hours:4
      4. Revert (set back to original)
    Evidence: .sisyphus/evidence/task-4-risk-save.png

  Scenario: Basic field save still works
    Tool: Playwright
    Steps: Any employee → Edit → change "Simultaneous Tasks" value → Save → refresh → Assert: new value persists
    Evidence: .sisyphus/evidence/task-4-basic-save.png
  ```

  **Commit**: groups with Tasks 2, 3

- [x] 5. Backend — Gateway Route for Employee Rule CRUD

  **What to do**:
  - Create `src/gateway/routes/admin-rules.ts`:
    - `POST /admin/tenants/:tenantId/employees/:archetypeId/rules` — create rule (`status='confirmed'`, set `confirmed_at=new Date()`)
    - `PATCH /admin/tenants/:tenantId/employees/:archetypeId/rules/:ruleId` — update `status` and/or `rule_text`
    - `DELETE /admin/tenants/:tenantId/employees/:archetypeId/rules/:ruleId` — soft-delete (set `deleted_at`) or hard delete
  - All routes require `requireAdminKey` middleware. All tenant-scoped (verify archetypeId belongs to tenantId).
  - Add Zod schemas in `src/gateway/validation/schemas.ts`:
    - `CreateRuleBodySchema: z.object({ rule_text: z.string().min(1).max(5000) })`
    - `UpdateRuleBodySchema: z.object({ status: z.enum(['confirmed', 'rejected']).optional(), rule_text: z.string().min(1).max(5000).optional() })`
  - Use Prisma for DB operations. Follow the pattern from `admin-trigger.ts` / `admin-tasks.ts`.
  - Register the new router in the Express app entry (check how other admin routes are registered).
  - Check `prisma/schema.prisma` for `employee_rules` fields before writing (especially: does `deleted_at` exist? If not, use hard delete with `prisma.employeeRules.delete()`).

  **Must NOT do**: No `prisma/schema.prisma` migrations. No Inngest changes. No rule-extractor/synthesizer modifications.

  **Recommended Agent Profile**: **Category**: `unspecified-high` | **Skills**: []

  **Parallelization**: Wave 1 (with 1, 2) | Blocks: 6 | Blocked By: None

  **References**:
  - `src/gateway/routes/admin-trigger.ts` — Pattern for admin-key auth + tenant-scoped route
  - `src/gateway/routes/admin-tasks.ts` — CRUD operations pattern
  - `src/gateway/middleware/admin-auth.ts` — `requireAdminKey` middleware
  - `prisma/schema.prisma` — `employee_rules` model (check fields: id, archetype_id, tenant_id, rule_text, status, confirmed_at, created_at; check if deleted_at exists)
  - `src/gateway/validation/schemas.ts` — Existing Zod schema patterns

  **QA Scenarios:**

  ```
  Scenario: Create rule via API
    Tool: curl
    Steps:
      POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/00000000-0000-0000-0000-000000000015/rules
      -H "X-Admin-Key: $ADMIN_API_KEY" -d '{"rule_text":"Always greet guests by name"}'
      Assert: 201, response has id + status="confirmed"
    Evidence: .sisyphus/evidence/task-5-create.txt

  Scenario: Update rule status
    Tool: curl
    Steps: Fetch awaiting_input rule ID → PATCH with {"status":"confirmed"} → Assert: 200
    Evidence: .sisyphus/evidence/task-5-update.txt

  Scenario: Delete rule
    Tool: curl
    Steps: Create test rule → DELETE → Assert: 200/204 → verify rule gone
    Evidence: .sisyphus/evidence/task-5-delete.txt

  Scenario: Auth rejected without admin key
    Tool: curl
    Steps: POST without X-Admin-Key → Assert: 401/403
    Evidence: .sisyphus/evidence/task-5-auth.txt
  ```

  **Commit**: groups with Task 6 — `feat(gateway): add employee rule CRUD API and frontend integration`
  **Pre-commit**: `pnpm lint && pnpm build && pnpm test -- --run`

- [x] 6. Frontend Rule API — Gateway Functions for Rule CRUD

  **What to do**:
  - Add to `dashboard/src/lib/gateway.ts`:
    - `createRule(tenantId: string, archetypeId: string, ruleText: string): Promise<EmployeeRule>`
    - `updateRule(tenantId: string, archetypeId: string, ruleId: string, data: { status?: 'confirmed'|'rejected', rule_text?: string }): Promise<EmployeeRule>`
    - `deleteRule(tenantId: string, archetypeId: string, ruleId: string): Promise<void>`
  - Follow existing `gatewayFetch` pattern from `triggerEmployee` / `patchArchetype` (headers, error handling, admin key injection).
  - Add proper TypeScript return types. Import `EmployeeRule` from `@/lib/types`.

  **Must NOT do**: No PostgREST for writes. No code duplication.

  **Recommended Agent Profile**: **Category**: `quick` | **Skills**: []

  **Parallelization**: Wave 2 (with 3, 4, 7) | Blocks: 8 | Blocked By: 5

  **References**:
  - `dashboard/src/lib/gateway.ts` — `triggerEmployee`, `patchArchetype` patterns to follow
  - `dashboard/src/lib/types.ts` — `EmployeeRule` type
  - `dashboard/src/lib/constants.ts` — `GATEWAY_URL`

  **QA Scenarios:**

  ```
  Scenario: Functions compile and export
    Tool: Bash
    Steps: pnpm build → success; grep dashboard/src/lib/gateway.ts for createRule/updateRule/deleteRule → present
    Evidence: .sisyphus/evidence/task-6-functions.txt
  ```

  **Commit**: groups with Task 5

- [x] 7. Activity Tab — Rich Metadata Cards with Trigger Source and Expandable Timeline

  **What to do**:
  - Replace `RecentTasksSection` bare table with card layout:
  - Each task **card** shows: StatusBadge, trigger source indicator (derive from `source_system`: `'hostfully'`→webhook icon, `'manual'`→hand/cursor icon, `null`→clock icon for scheduled), relative creation time, duration (for terminal tasks).
  - **Expandable**: clicking a card expands it to show the `StatusTimeline` component (import from `dashboard/src/panels/tasks/StatusTimeline.tsx`). Fetch `task_status_log` for that specific task on expand only (lazy, not on page load).
  - For **failed tasks**: show `failure_reason` as a red text line on the card.
  - Cards still navigate to task detail on click (existing behavior) — use a small "View details →" link to differentiate from expand click.
  - **Empty state**: "No activity yet. This employee hasn't run any tasks."
  - Keep limit at 10 tasks, add "View all tasks →" link to the main Tasks page if there are exactly 10.

  **Must NOT do**: No task summary text (doesn't exist in DB). No task detail page changes. No new task DB fields.

  **Recommended Agent Profile**: **Category**: `visual-engineering` | **Skills**: []

  **Parallelization**: Wave 2 (with 3, 4, 6) | Blocks: 10 | Blocked By: 1

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:165-248` — Current RecentTasksSection to replace
  - `dashboard/src/panels/tasks/StatusTimeline.tsx` — Existing component to import
  - `dashboard/src/panels/tasks/TaskDetail.tsx` — How StatusTimeline is fetched + rendered (look for task_status_log fetch pattern)
  - `dashboard/src/lib/types.ts` — Task type (check: `source_system`, `failure_reason`, `triage_result` fields)
  - `dashboard/src/lib/postgrest.ts` — postgrestFetch pattern for fetching task_status_log on expand

  **QA Scenarios:**

  ```
  Scenario: Activity tab shows metadata cards (not bare table)
    Tool: Playwright
    Steps:
      1. guest-messaging Activity tab → Assert: card layout visible (not table rows)
      2. Assert: trigger source indicator visible on cards
      3. Assert: status badge + duration on each card
    Evidence: .sisyphus/evidence/task-7-cards.png

  Scenario: Expandable status timeline
    Tool: Playwright
    Steps:
      1. Click a task card to expand → Assert: status timeline appears with state transitions
      2. Click again → Assert: timeline collapses
    Evidence: .sisyphus/evidence/task-7-timeline.png

  Scenario: Empty state for employee with no tasks
    Tool: Playwright
    Steps: Navigate to employee with 0 tasks Activity tab → Assert: "No activity" message
    Evidence: .sisyphus/evidence/task-7-empty.png
  ```

  **Commit**: `feat(dashboard): redesign Activity tab with metadata cards and status timeline`
  **Pre-commit**: `pnpm lint && pnpm build`

- [x] 8. Training Tab — Interactive Rule Management UI (New Component)

  **What to do**:
  - Create `dashboard/src/panels/employees/TrainingTab.tsx`:
  - **Rule cards**: Each rule shows status label (human-friendly: `confirmed`→"Active", `awaiting_input`→"Needs Review", `rejected`→"Rejected"), rule text, creation date.
  - **Action buttons per rule**:
    - "Needs Review" rules: **Approve** button (calls `updateRule({status:'confirmed'})`), **Reject** button (calls `updateRule({status:'rejected'})`).
    - "Active" rules: **Edit** (inline text edit, save button), **Delete** (confirmation dialog, calls `deleteRule`).
    - "Rejected" rules: Read-only, no actions.
  - **Add Rule button** at top: inline form or dialog with a textarea, calls `createRule`. New rules appear with "Active" status.
  - **Optimistic UI**: Update local state immediately on approve/reject/delete, revert on API error.
  - **Empty state**: "No training rules yet. As this employee works and you provide feedback in Slack, it will learn rules automatically. You can also add rules manually above."
  - Import and render in EmployeeDetail.tsx `<TabsContent value="training">`.
  - Remove old `RulesSection` component (or keep but no longer render it).

  **Must NOT do**: No backend changes (Task 5 handles that). No PostgREST writes. No Inngest pipeline changes.

  **Recommended Agent Profile**: **Category**: `visual-engineering` | **Skills**: []

  **Parallelization**: Wave 3 (with 9) | Blocks: 10 | Blocked By: 6, 2

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:95-163` — Current RulesSection to supersede
  - `dashboard/src/lib/gateway.ts` — createRule, updateRule, deleteRule from Task 6
  - `dashboard/src/lib/types.ts` — EmployeeRule type
  - `dashboard/src/components/ui/dialog.tsx` — For confirmation/add dialogs
  - `dashboard/src/components/ui/badge.tsx` — For status badges
  - `dashboard/src/hooks/use-poll.ts` — usePoll hook for fetching rules
  - `dashboard/src/lib/postgrest.ts` — fetchRules (reads from employee_rules table)

  **QA Scenarios:**

  ```
  Scenario: Rules render with human-friendly labels
    Tool: Playwright
    Steps:
      1. guest-messaging Training tab → Assert: rule cards visible
      2. Assert: "Active" label present (not "confirmed")
      3. Assert: "Needs Review" present (not "awaiting_input")
      4. Assert: raw status codes "awaiting_input", "confirmed" NOT visible anywhere
    Evidence: .sisyphus/evidence/task-8-labels.png

  Scenario: Add new rule manually
    Tool: Playwright
    Steps:
      1. Training tab → Click "Add Rule" → Type "Always be polite" → Submit
      2. Assert: new rule card appears with "Active" status
    Evidence: .sisyphus/evidence/task-8-add.png

  Scenario: Approve a pending rule
    Tool: Playwright
    Steps:
      1. Find a "Needs Review" rule → Click Approve
      2. Assert: rule status changes to "Active"
    Evidence: .sisyphus/evidence/task-8-approve.png

  Scenario: Delete rule with confirmation
    Tool: Playwright
    Steps:
      1. Find Active rule → Click Delete → Assert: confirmation dialog
      2. Confirm → Assert: rule removed from list
    Evidence: .sisyphus/evidence/task-8-delete.png

  Scenario: Empty state for code-rotation (no rules)
    Tool: Playwright
    Steps: code-rotation Training tab → Assert: empty state message visible
    Evidence: .sisyphus/evidence/task-8-empty.png
  ```

  **Commit**: `feat(dashboard): add interactive Training tab with rule management`
  **Pre-commit**: `pnpm lint && pnpm build`

- [x] 9. Knowledge Tab — Restructure into Human and Technical Sections

  **What to do**:
  - In `dashboard/src/panels/employees/BrainPreviewTab.tsx`, reorganize into 3 clear sections:
  - **Section 1 — "What This Employee Knows"** (always visible, prominent): Brief intro text, then Task Trigger (instructions), Employee Manual (system_prompt), After-Approval Action (delivery_instructions). These already exist in the "Human Configuration" section (lines 244–355) — just rename the section header and add intro text.
  - **Section 2 — "Platform Configuration"** (collapsed by default using Accordion): Security Preamble, Output Contract, Environment Variables description. These are the "Auto-Injected by Platform" items.
  - **Section 3 — "Raw Debug Data"** (collapsed by default): The existing expandable sections: Task Prompt, AGENTS.md, Environment Variables (raw), Available Tools & Skills, Runtime Config & Output Contract, Delivery Prompt. Add a label: "For technical debugging only."
  - Add intro text at the top of the tab: "This shows what your employee knows and how it behaves. What you see here is assembled automatically each time the employee runs."

  **Must NOT do**: No data changes. No new API calls. Do not remove any existing debug data — only reorganize.

  **Recommended Agent Profile**: **Category**: `visual-engineering` | **Skills**: []

  **Parallelization**: Wave 3 (with 8) | Blocks: 10 | Blocked By: 1

  **References**:
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx` — Full file (check current line count)
  - `dashboard/src/panels/employees/BrainPreviewTab.tsx` lines 244-355 — "Human Configuration" already done
  - `dashboard/src/components/ui/accordion.tsx` — From Task 1

  **QA Scenarios:**

  ```
  Scenario: Human section prominent, debug sections collapsed
    Tool: Playwright
    Steps:
      1. guest-messaging Knowledge tab
      2. Assert: "What This Employee Knows" (or similar) heading visible
      3. Assert: Task instructions text visible in that section
      4. Assert: AGENTS.md raw content NOT visible (should be in collapsed section)
    Evidence: .sisyphus/evidence/task-9-sections.png

  Scenario: Debug data still accessible when expanded
    Tool: Playwright
    Steps:
      1. Expand "Raw Debug Data" section → Assert: AGENTS.md content now visible
    Evidence: .sisyphus/evidence/task-9-debug.png

  Scenario: Knowledge tab renders for all 3 employees without error
    Tool: Playwright
    Steps: guest-messaging, code-rotation, daily-summarizer Knowledge tabs → Assert: no console errors, content renders
    Evidence: .sisyphus/evidence/task-9-all-employees.png
  ```

  **Commit**: `feat(dashboard): redesign Knowledge tab with human/technical split`
  **Pre-commit**: `pnpm lint && pnpm build`

- [x] 10. Cross-Tab Polish — Empty States, Loading Skeletons, Error Handling Consistency

  **What to do**:
  - Audit all 4 tabs across all 3 active employees (guest-messaging, code-rotation, daily-summarizer):
  - **Empty states**: Every tab needs a friendly explanatory empty state (not just "No data"):
    - Activity: "No activity yet. This employee hasn't run any tasks." (already in Task 7)
    - Training: "No training rules yet..." (already in Task 8)
    - Settings: graceful handling if overview is null (fallback to instructions text)
    - Knowledge: graceful null handling for delivery_instructions
  - **Loading skeletons**: Confirm all tabs show animated skeleton loaders during data fetch — add any that are missing.
  - **API error handling**: Each tab must show a clear error message if its data fetch fails (not a blank screen or console error).
  - **Zero console errors**: Navigate all 3 employees × 4 tabs, capture console output, assert 0 errors.

  **Must NOT do**: No new features. Polish only.

  **Recommended Agent Profile**: **Category**: `visual-engineering` | **Skills**: []

  **Parallelization**: Wave 4 (with 11) | Blocks: 11 | Blocked By: 7, 8, 9

  **QA Scenarios:**

  ```
  Scenario: Zero console errors across all employees and tabs
    Tool: Playwright
    Steps: Navigate each of 3 employees × 4 tabs (12 navigations total) → capture console logs → Assert: 0 errors
    Evidence: .sisyphus/evidence/task-10-console-clean.txt

  Scenario: Friendly empty states present
    Tool: Playwright
    Steps: code-rotation Training tab → Assert: empty state text visible; employee with no tasks Activity → Assert: "No activity"
    Evidence: .sisyphus/evidence/task-10-empty-states.png
  ```

  **Commit**: `feat(dashboard): polish cross-tab empty states, skeletons, and error handling`
  **Pre-commit**: `pnpm lint && pnpm build`

- [x] 11. Notify Completion via Telegram

  **What to do**:
  - Run: `npx tsx scripts/telegram-notify.ts "✅ employee-detail-ux-redesign complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**: **Category**: `quick` | **Skills**: []

  **Parallelization**: Wave 4 | Blocked By: 10

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE before plan is considered complete.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read plan end-to-end. For each "Must Have": verify exists (read files, navigate pages, run commands). For each "Must NOT Have": search for forbidden patterns. Check evidence files.
      Output: `Must Have [8/8] | Must NOT Have [7/7] | Tasks [11/11] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review all changed dashboard files for: `as any`, `@ts-ignore`, empty catches, console.log in prod, unused imports, AI slop. Verify no employee-specific language in shared EmployeeDetail.tsx.
      Output: `Build [PASS] | Lint [PASS] | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Navigate all 3 active employees (guest-messaging, code-rotation, daily-summarizer) × all 4 tabs. Verify: Settings shows overview + collapsed tech details, Activity shows cards with trigger source, Training shows rules for guest-messaging and empty state for code-rotation, Knowledge shows human/technical split. Test URL backward-compat (old ?tab= params). Test edit mode save. Evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Employees [3/3] | Tabs [12/12] | URL compat [4/4] | Edit save [PASS] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
      Read each task spec vs actual code diff. Verify: no changes to inngest/, workers/, prisma/schema, task detail pages, employee list, create page. Verify all 11 tasks delivered exactly what they specified — no more, no less.
      Output: `Tasks [10/11 compliant] | Scope violations [CLEAN] | VERDICT: APPROVE`

---

## Commit Strategy

| After Task(s) | Commit Message                                                                   | Pre-commit                                      |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1             | `feat(dashboard): add foundation components and tab rename with backward-compat` | `pnpm lint && pnpm build`                       |
| 2, 3, 4       | `feat(dashboard): redesign Settings tab for non-technical users`                 | `pnpm lint && pnpm build`                       |
| 5, 6          | `feat(gateway): add employee rule CRUD API and frontend integration`             | `pnpm lint && pnpm build && pnpm test -- --run` |
| 7             | `feat(dashboard): redesign Activity tab with metadata cards and status timeline` | `pnpm lint && pnpm build`                       |
| 8             | `feat(dashboard): add interactive Training tab with rule management`             | `pnpm lint && pnpm build`                       |
| 9             | `feat(dashboard): redesign Knowledge tab with human/technical split`             | `pnpm lint && pnpm build`                       |
| 10            | `feat(dashboard): polish cross-tab empty states, skeletons, and error handling`  | `pnpm lint && pnpm build`                       |

---

## Success Criteria

```bash
pnpm lint          # Expected: 0 errors
pnpm build         # Expected: success
pnpm test -- --run # Expected: 515+ passing (no regressions)
```
