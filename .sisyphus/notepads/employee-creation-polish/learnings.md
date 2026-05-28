# Learnings — employee-creation-polish

## [2026-05-28] Session Start

### Key Architecture Facts

- `CreateEmployeePage.tsx` (389 lines) is the target file — wizard steps: describe → generating → edit → previewing → preview → saving → error
- `CollapsibleSection` component at `dashboard/src/panels/employees/components/CollapsibleSection.tsx` — ready to use, props: title, subtitle, defaultOpen, children, actions, badge, id
- `InputSchemaSection.tsx` at `dashboard/src/panels/employees/sections/InputSchemaSection.tsx` — calls `patchArchetype()` (requires archetypeId), CANNOT be reused in creation flow directly
- The generator's `postProcess()` maps `execution_steps → instructions` — LOAD-BEARING, do NOT touch
- `CreateArchetypeBodySchema` field `notification_channel` is `z.string().min(1).max(50)` but wizard passes `null` — live bug

### Field Separation (the working model)

- `identity` = WHO (persona, no procedures) → goes to AGENTS.md section 1
- `execution_steps` = WHAT TO DO → goes to `<execution-instructions>` XML block in AGENTS.md
- `delivery_steps` = HOW TO DELIVER → goes to `<delivery-instructions>` XML block in AGENTS.md
- `execution_instructions` = the PROMPT (platform-generated, never exposed to PMs)
- `delivery_instructions` = LEGACY FALLBACK for delivery_steps

### UI Conventions

- All sections use `rounded-lg border bg-card px-5 py-4` card shell
- CollapsibleSection already applies this styling
- SearchableSelect for all dropdowns (not Radix Select)
- End-user language: "Creativity" not "Temperature", "Approval required" not technical field names
- Non-technical users: property managers, small business owners

### What Wave 1 Must NOT Change

- `WizardStep` type union
- `editedFields` state shape
- describe, preview, save steps logic
- postProcess() in archetype-generator.ts
- `InputSchemaSection.tsx`, `EmployeeDetail.tsx`, `EditEmployeePage.tsx`

## [2026-05-28] T8 — CollapsibleSection Grouping

### Changes Made

- Imported `CollapsibleSection` from `@/panels/employees/components/CollapsibleSection`
- Edit step now has 3 sections: **Core** (defaultOpen=true), **Delivery** (defaultOpen=true), **Settings** (defaultOpen=false)
- Core: Employee Name, Identity, Execution Steps
- Delivery: Delivery Steps, Requires Approval checkbox
- Settings: Trigger selector, Slack Channel picker
- Slack channel picker removed from describe step; Generate button disabled condition simplified to just `description.length < 10 || description.length > 2000`
- Navigation buttons (Back/Preview) remain outside all CollapsibleSection wrappers

### Gotchas

- Playwright ref selectors (ref=eXX) don't work with `browser_click` — use `getByRole` or `browser_run_code_unsafe` with `page.getByRole('button', { name: '...' }).click()`
- LSP unavailable in this environment (typescript-language-server needs nodejs version set) — rely on `pnpm build` for TypeScript verification
- CollapsibleSection's `defaultOpen=false` means inner text not visible in page snapshot but IS in DOM — click the title button to expand
- Build output: `tsc -p tsconfig.build.json` EXIT_CODE:0 — confirmed clean
