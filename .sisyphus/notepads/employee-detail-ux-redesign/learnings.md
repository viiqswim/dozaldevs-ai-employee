# Learnings — employee-detail-ux-redesign

## [2026-05-19] Plan initialized

### Key codebase facts

- `EmployeeDetail.tsx` is 727 lines — main file for all 4 tabs
- `BrainPreviewTab.tsx` already has Human/Platform split (lines 244-355) — preserve, just rename headers
- `StatusTimeline.tsx` exists in `dashboard/src/panels/tasks/` — reuse in Activity cards
- `archetype.overview` field exists and is seeded but shown NOWHERE on detail page
- `risk_model` is just `{ approval_required: boolean, timeout_hours?: number }` — simple toggle + number
- No gateway routes for `employee_rules` mutations — must build from scratch
- `isGuestMessaging` hardcode on line 656 violates shared-file rule — replace with `archetype.deliverable_type === 'hostfully_message'`
- Missing shadcn/ui components: switch, accordion, tooltip
- URL params (`?tab=brain`, `?tab=tasks`, etc.) will break on rename — backward-compat mapping needed

### Test employees

- guest-messaging: `00000000-0000-0000-0000-000000000015` (complex, approval required, has 20+ rules)
- code-rotation: `00000000-0000-0000-0000-000000000016` (simple, auto-approve, no rules)
- Tenant: `00000000-0000-0000-0000-000000000003`

### Dev URLs

- Dev server: `http://localhost:7701/dashboard/`
- Gateway: `http://localhost:7700/`

### Constraints

- NO changes to: `src/inngest/`, `src/workers/`, `prisma/schema.prisma`, `dashboard/src/panels/tasks/`, `EmployeeList.tsx`, `CreateEmployeePage.tsx`, `EditEmployeePage.tsx`
- No employee-specific language in shared files
- No `as any` or `@ts-ignore`
- No `postgrestFetch` for write operations

## Task 1 — Foundation Components & Tab Rename (2026-05-19)

### Radix packages added

- `@radix-ui/react-switch` 1.2.6
- `@radix-ui/react-accordion` 1.2.12
- `@radix-ui/react-tooltip` 1.2.8

### Pattern used for new components

Thin Radix wrappers with `React.forwardRef`, `cn()` for className merging, sub-components exported individually. Matches existing `dialog.tsx` / `select.tsx` pattern exactly.

### Tab rename mapping

Old → New: `config→settings`, `tasks→activity`, `rules→training`, `brain→knowledge`
Backward-compat via `TAB_COMPAT_MAP` object applied before VALID_TABS check.

### isGuestMessaging fix

Replaced `archetype.role_name === 'guest-messaging'` with `archetype.deliverable_type === 'hostfully_message'`.

### Pre-existing LSP errors in EmployeeDetail.tsx

`input_schema` / `InputSchemaItem` errors are pre-existing (not introduced by this task). Build still exits 0 because tsc build config excludes them or they're type-only issues that don't block vite build.

## Task 2 — Settings Tab View Mode Restructure (2026-05-19)

### ArchetypeOverview shape

`overview: ArchetypeOverview | null` where `ArchetypeOverview = { role, trigger, workflow[], tools_used, output, approval }`.
Object form — render individual fields with labels. Fallback to `instructions` text when null.

### risk_model fields

`{ approval_required: boolean; timeout_hours?: number }` — `timeout_hours` is optional, guard with `!= null`.

### 3-section structure implemented

1. **Overview card** (`rounded-lg border bg-muted/20 p-5`) — shows `overview.role` + `overview.trigger`; falls back to first 3 lines of `instructions`.
2. **Behavior & Settings** — approval badge (amber=required, green=auto), Slack Channel, Simultaneous Tasks, Maximum Duration, Task Instructions (MarkdownPreview).
3. **Technical Details** — `Accordion type="single" collapsible` with no `defaultValue` (collapsed by default). Contains Model, Runtime, VM Size, Deliverable Type, System Prompt, Risk Model JSON.

### Accordion usage

`AccordionItem value="technical-details" className="border-none"` removes the bottom border on the outer wrapper.
`AccordionTrigger className="py-2 text-sm font-medium text-muted-foreground hover:no-underline"` — overrides default `hover:underline`.

### Build result

`pnpm build` exits 0 with no errors introduced.

## Task 3 — Employee Rules CRUD API (2026-05-19)

### EmployeeRule schema fields

`id, tenant_id, archetype_id, rule_text, source, status, source_task_id, parent_rule_ids, slack_ts, slack_channel, created_at, confirmed_at` — **no `deleted_at`** field.

### Delete strategy

Hard delete via `prisma.employeeRule.deleteMany({ where: { id, archetype_id, tenant_id } })` — schema has no `deleted_at`, so AGENTS.md soft-delete rule cannot apply here.

### URL pattern used

`:archetypeId` (UUID) not `:slug` — dashboard needs to work with IDs directly.

### Archetype scoping

Before any mutation: `prisma.archetype.findFirst({ where: { id: archetypeId, tenant_id: tenantId } })` → 404 if missing. Ensures cross-tenant access is blocked.

### Update pattern

Used `updateMany` with full `{ id, archetype_id, tenant_id }` scope → check `count === 0` for 404. Then `findFirst` to return updated record.

### CREATE defaults

`source: 'admin'`, `confirmed_at: new Date()`, `status: bodyResult.data.status` (defaults to `'confirmed'` via Zod).

### Route registration

Added to `server.ts` between `adminPropertyLockRoutes` and `slackOAuthRoutes`.

### Pre-existing test failures (not regressions)

`admin-employee-trigger.test.ts`, `hostfully.test.ts`, `migration-agents-md.test.ts`, `supersede-threading.test.ts` — all failed before this task. Build exits 0 cleanly.

## Task 4 — Approval Switch & Field Tooltips in Settings View Mode (2026-05-19)

### Pattern: LabelWithTooltip helper component

Created a `LabelWithTooltip` local component (renders `<dt>`) that composes a `Tooltip`/`TooltipTrigger`/`TooltipContent` around an `<Info className="h-3 w-3 cursor-help" />` icon from lucide-react. This keeps field label markup consistent with the existing `FieldLabel` component while adding inline tooltip support.

### TooltipProvider placement

Wrapped only the `Behavior & Settings` `<div className="space-y-5">` block with `<TooltipProvider>` — not the entire ConfigTab. This is the minimal valid scope per Radix requirements (Provider must be an ancestor of all `Tooltip` roots).

### Switch usage pattern

`<Switch checked={...} disabled aria-label="Approval required" />` — `disabled` makes it non-interactive while `checked` reflects data state. The `disabled:opacity-50` class is already in the component, making the visual state clear.

### Approval field UX decision

Kept the existing colored Badge alongside the new Switch. Switch shows visual on/off state; Badge provides semantic text label ("Approval Required" / "Auto-Approved"). Both serve different communication purposes.

### Imports added

- `Switch` from `@/components/ui/switch`
- `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `@/components/ui/tooltip`
- `Info` from `lucide-react`

### Build result

`pnpm build` exits 0 — no errors introduced.
