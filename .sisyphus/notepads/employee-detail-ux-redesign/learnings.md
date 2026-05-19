## Task 5 — Settings Edit Mode Redesign (2026-05-19)

### Interface/type changes

- `PatchData`: Removed `model` and `runtime` from `Pick<Archetype, ...>` — these are developer-managed fields that should not be mutable from the dashboard.
- `EditValues`: Stripped to user-editable fields only: `role_name`, `instructions`, `system_prompt`, `notification_channel`, `concurrency_limit`, `approval_required: boolean`, `timeout_hours: number`.
- `archetypeToEditValues`: Reads structured `risk_model` directly: `a.risk_model?.approval_required ?? false` and `a.risk_model?.timeout_hours ?? 0`.
- `risk_model` type in `types.ts` is `{ approval_required: boolean; timeout_hours?: number } | null` — no casting needed, TypeScript resolves optional chaining cleanly.

### handleSave pattern for structured risk_model

Compare existing values against edits; only include `risk_model` patch when either field changed:

```ts
const existingApproval = archetype.risk_model?.approval_required ?? false;
const existingTimeout = archetype.risk_model?.timeout_hours ?? 0;
if (
  editValues.approval_required !== existingApproval ||
  editValues.timeout_hours !== existingTimeout
) {
  changes.risk_model = {
    approval_required: editValues.approval_required,
    timeout_hours: editValues.timeout_hours,
  };
}
```

This is cleaner than JSON.stringify comparison and type-safe.

### set() function widened to boolean

Changed signature from `(value: string | number)` to `(value: string | number | boolean)` — necessary to use `set('approval_required')` as the `onCheckedChange` handler for Switch, which passes `checked: boolean`.

### Switch in edit mode (interactive, not disabled)

```tsx
<Switch
  checked={editValues.approval_required}
  onCheckedChange={(checked) => set('approval_required')(checked)}
  aria-label="Approval required"
/>
```

`disabled` is NOT set — switch is fully interactive in edit mode.

### Dual Save/Cancel pattern

Used a `SaveCancelBar` inner component (defined inside `ConfigTab` above the `return`) to avoid repeating the JSX. Renders at top and bottom of the form.

### Collapsible Advanced section in edit mode

System Prompt moved into `<Accordion type="single" collapsible>` with `value="advanced"`. Collapsed by default (no `defaultValue`). Same pattern as Technical Details in view mode.

### textareaClass removed

The raw `risk_model_json` textarea is gone; `textareaClass` string constant was removed since nothing references it.

### Edit form field order

Role Name → Task Instructions (MarkdownEditorField) → 2-col grid (Approval Required, Max Duration, Slack Channel, Simultaneous Tasks) → Inputs section → Advanced accordion (System Prompt) → Save/Cancel at bottom.

### Build result

`pnpm build` exits 0 — no errors introduced by this task.

## Task: Rule CRUD gateway functions (gateway.ts)

- `EmployeeRule` type is in `types.ts` with fields: id, tenant_id, archetype_id, rule_text, source, status ('proposed'|'confirmed'|'awaiting_input'), source_task_id, parent_rule_ids, slack_ts, slack_channel, confirmed_at, created_at
- `gatewayFetch<T>` handles GET/POST/PATCH automatically (returns `response.json()`)
- For DELETE (204 no-body), must use raw `fetch` directly — `gatewayFetch` calls `response.json()` which fails on empty body
- Routes: POST/PATCH/DELETE `/admin/tenants/:tenantId/employees/:archetypeId/rules[/:ruleId]`
- Build passes clean after adding all 3 functions

## Task: Activity Tab — Card-based layout with expandable StatusTimeline (2026-05-19)

### Trigger source derivation from `task.source_system`
- `'hostfully'` → Webhook icon + "webhook" label
- `'manual'` → MousePointer icon + "manual" label
- `null/undefined` → Clock icon + "scheduled" label
- Field exists on `Task` type in `types.ts` as `source_system: string | null`

### Lazy fetch pattern for task_status_log on expand
- Track expanded task ID in state: `expandedTaskId: string | null`
- Track fetched logs per task: `timelineLogs: Record<string, TaskStatusLog[]>`
- Track loading per task: `timelineLoading: Record<string, boolean>`
- Guard: `if (timelineLogs[taskId] !== undefined) return;` — prevents re-fetch (empty array `[]` is truthy so this also prevents re-fetching after a failed fetch)
- Table name: `task_status_log` (confirmed from TaskDetail.tsx)
- Fetch params: `task_id: eq.${taskId}`, `order: created_at.asc`, `limit: 100`

### Empty catch block lint rule
- ESLint in this project flags `catch (_err)` as unused-vars
- Use bare `catch {}` (TypeScript 4+ optional binding) — no variable needed

### Table imports removed
- `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `@/components/ui/table` are only used in `RecentTasksSection` — safe to remove when replacing with cards

### cn import
- Was not imported in EmployeeDetail.tsx before — needed to add alongside `formatRelativeTime, formatDuration` from `@/lib/utils`

### ChevronRight rotation trick
- Use `cn('transition-transform', isExpanded && 'rotate-90')` — avoids importing ChevronDown separately
- One icon, two states via CSS transform

### Build result
- `pnpm build` (backend tsc) exits 0
- `pnpm dashboard:build` (vite + tsc) exits 0

## Task 7 — TrainingTab interactive rule management (2026-05-19)

### EmployeeRule status union extended
- Added `'rejected'` to `EmployeeRule['status']` in `types.ts` — backend accepts it via `updateRule`, but it was missing from the frontend type.
- This caused cascading `Record<EmployeeRule['status'], string>` errors in `RulesPanel.tsx` and `EmployeeDetail.tsx` (old RulesSection) — both fixed by adding the `rejected` entry.

### No Textarea component — use raw `<textarea>` with Tailwind
- `dashboard/src/components/ui/textarea.tsx` does not exist.
- Use `<textarea className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />` to match Input component styling.

### Optimistic UI pattern with mutatingRef
- `usePoll` fires every N seconds; naive `useEffect([fetchedRules])` to sync display state would overwrite optimistic updates mid-mutation.
- Pattern: `mutatingRef = useRef(false)` guards the sync `useEffect`.
- Mutation flow: set `mutatingRef.current = true` → optimistic `setLocalRules` → `await apiCall()` → `refresh()` → `mutatingRef.current = false`.
- On error: `setLocalRules(null)` (falls back to `fetchedRules` = unchanged server data) + `mutatingRef.current = false`.
- `displayRules = localRules ?? fetchedRules ?? []` — localRules is null when not mutating.

### Status display mapping
- `confirmed` → "Active" (green badge) — Edit + Delete buttons
- `awaiting_input` | `proposed` → "Needs Review" (blue/yellow badge) — Approve + Reject buttons  
- `rejected` → "Rejected" (red badge) — read-only, no action buttons

### Build result
- `pnpm build` (backend tsc) exits 0
- `pnpm dashboard:build` (vite + tsc) exits 0

## Task 8 — Knowledge Tab 3-Section Restructure (BrainPreviewTab.tsx) (2026-05-19)

### Section structure
- Section 1 "What This Employee Knows": always visible, intro text paragraph + Card with Task Trigger / Employee Manual / After-Approval Action
- Section 2 "Platform Configuration": `Accordion type="single" collapsible` (no defaultValue = collapsed). Single AccordionItem wrapping Security Preamble, Output Contract, Env Variables description.
- Section 3 "Raw Debug Data": `Accordion type="single" collapsible` with two-line AccordionTrigger (title + "For technical debugging only" subtitle). Contains Execution Phase + Delivery Phase sub-headers and all existing expandable Cards (PromptSection, AGENTS.md, Env Vars, Tools, Runtime, Delivery Prompt).

### Sticky nav removed
The sticky section nav (SECTION_NAV, handleNavClick, IntersectionObserver) was removed. It linked to IDs inside the debug sections — unusable when those sections are behind a collapsed accordion. All the IDs on Cards were kept (brain-execution-prompt, brain-agents-md, etc.) in case they're referenced externally.

### AccordionItem border style
Used `className="border rounded-lg px-4"` on AccordionItem to get a contained card-like appearance instead of the default bottom-only border from the base component.

### Two-line AccordionTrigger pattern
```tsx
<AccordionTrigger className="text-sm font-medium hover:no-underline">
  <div className="flex flex-col items-start gap-0.5">
    <span>Execution &amp; delivery internals</span>
    <span className="text-xs text-muted-foreground font-normal">
      For technical debugging only
    </span>
  </div>
</AccordionTrigger>
```
`hover:no-underline` prevents the default underline on the entire trigger block.

### Build result
- `pnpm build` (backend tsc) exits 0
- `pnpm dashboard:build` (vite + tsc) exits 0
