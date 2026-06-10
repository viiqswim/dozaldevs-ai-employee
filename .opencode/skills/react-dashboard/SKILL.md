---
name: react-dashboard
description: 'Use when modifying the dashboard UI under dashboard/src/. Covers the three mandatory conventions this repo enforces: SearchableSelect for all dropdowns, URL-encoded state for all navigation, and card shells for visual sections — plus the non-technical end-user language rule.'
---

# React Dashboard Conventions

You already know React, TypeScript, Tailwind, and React Router. This skill encodes only the
**four non-obvious, repo-enforced rules** that a strong generic model will otherwise violate.
Each one has been flagged in code review or a maintainability audit. Treat them as hard gates,
not suggestions.

Dashboard lives at `dashboard/src/`. Router: `react-router-dom` (v6). Styling: Tailwind +
shadcn-style primitives in `dashboard/src/components/ui/`.

---

## 1. Every dropdown uses `SearchableSelect` — never Radix `<Select>`

Any user-facing dropdown / option list **MUST** use `<SearchableSelect>` from
`dashboard/src/components/ui/searchable-select.tsx`. It is a single-select combobox with a
built-in search input (scroll _and_ type-to-filter). It matches the hand-rolled dropdown style
used across the dashboard (`RulesPanel`, `Header`).

**Forbidden:** importing `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` from
`@/components/ui/select` for any user-facing list. That Radix primitive file still exists in the
tree (`dashboard/src/components/ui/select.tsx`) purely as a leftover — it is a trap. If you reach
for it, you are writing a regression. (Audit ID: **DASH-2**.)

```tsx
import { SearchableSelect } from '@/components/ui/searchable-select';

<SearchableSelect
  options={items.map((i) => ({ value: i.id, label: i.name }))}
  value={selectedId}
  onValueChange={setSelectedId}
  placeholder="Select organization"
  searchPlaceholder="Search organizations..."
  className="w-36"
/>;
```

Props (full type lives in the source file — read it, don't re-derive): `options: {value, label}[]`,
`value: string`, `onValueChange: (v: string) => void`, plus optional `placeholder`,
`searchPlaceholder`, `className`, `disabled`. **Always read
`dashboard/src/components/ui/searchable-select.tsx` before use** rather than guessing the API.

**Reference (correct usage):** `dashboard/src/components/layout/Header.tsx` — the tenant/org
switcher. Copy that pattern.

**Only exception:** a genuinely programmatic / non-interactive select where search is meaningless
— e.g. a 2-option toggle. A binary toggle is the _only_ defensible reason to skip
`SearchableSelect`. Anything with more than a handful of options, or any list a user scans by
name, must be searchable.

---

## 2. All navigable state is URL-encoded via `useSearchParams`

Every tab, filter, sub-navigation item, selected entity, or open modal that a user can _navigate
to_ **MUST** reflect its state in the URL so the exact view is shareable and survives a refresh.

- Selected tab → `?tab=activity`
- Active filter → `?status=done`
- Selected employee → `/employees/:id`

**Never** hold that kind of state in component-local `useState` alone. If a user might bookmark,
share, or return to a view after refresh, it belongs in the URL.

Use `useSearchParams` from `react-router-dom`. **When updating, preserve existing params** — copy
the current `URLSearchParams`, set only the key you're changing, return it. The functional-updater
form does this cleanly:

```tsx
import { useSearchParams } from 'react-router-dom';

const [searchParams, setSearchParams] = useSearchParams();
const tab = searchParams.get('tab') ?? 'overview';

function selectTab(next: string) {
  setSearchParams(
    (prev) => {
      prev.set('tab', next); // mutate the copy, keep ?tenant=, ?status=, etc.
      return prev;
    },
    { replace: true }, // replace — don't spam browser history on every toggle
  );
}
```

**Anti-pattern (clobbers other params):**

```tsx
setSearchParams({ tab: next }); // WRONG — wipes ?tenant= and every other existing param
```

**Reference (canonical preserve-params pattern):** `dashboard/src/components/layout/Layout.tsx`
(`TenantUrlSync`) keeps `?tenant=` in the URL across every route change. Established consumers:
`EmployeeList`, `EmployeeDetail`, `TaskFeed`, `TaskDetail`, `RulesPanel`, `ToolList`,
`TriggerPanel`, `PlatformSettingsPage`. Follow whichever is closest to your panel.

Use `{ replace: true }` for state that toggles frequently (tabs, filters) to avoid polluting
history; omit it when the navigation is a real, back-button-worthy step.

---

## 3. Every section is wrapped in a card shell

Every panel, section, or grouping of related content **MUST** sit inside a card shell so the UI
stays readable and sections don't bleed together. The exact card classes are:

```
rounded-lg border bg-card   (shell)
px-5 py-4                    (padding)
```

**For collapsible content, use `CollapsibleSection`** from
`dashboard/src/panels/employees/components/CollapsibleSection.tsx` — it already applies
`rounded-lg border bg-card px-5 py-4` plus a title, optional subtitle/badge/actions, and an
`id` (for deep-linking). Don't re-implement collapse logic.

```tsx
import { CollapsibleSection } from '@/panels/employees/components/CollapsibleSection';

<CollapsibleSection title="Delivery steps" subtitle="What happens after approval">
  {/* content */}
</CollapsibleSection>;
```

**For non-collapsible groups, apply the classes directly to the wrapper `<div>`:**

```tsx
<div className="rounded-lg border bg-card px-5 py-4">
  <h2 className="text-sm font-medium">Section title</h2>
  {/* content */}
</div>
```

**Never render a wall of content** with no card boundaries. If you find yourself stacking headings
and rows directly in a panel root with no `rounded-lg border bg-card` wrapper, that is the bug
this rule exists to prevent.

---

## 4. End-user language is non-technical

The end users of this platform are **non-technical** — property managers and small-business
owners, not developers. Every user-facing string (labels, buttons, placeholders, empty states,
toasts, error messages) **MUST** use plain language. Internal/technical terms leak constantly;
catch them.

| Don't write (technical)                | Write instead (plain)     |
| -------------------------------------- | ------------------------- |
| Tenant                                 | Organization              |
| Archetype configuration / Archetype    | Employee setup / Employee |
| `risk_model.approval_required` is true | Approval needed           |
| Dispatch task                          | Start                     |
| Execution / Validating / Submitting    | Working on it             |

This applies to **UI copy only**, not code identifiers. Variables, props, types, and DB columns
keep their real names (`tenantId`, `archetype_id`) — only the _strings a user reads_ must be
plain. The org switcher already does this right: `placeholder="Select organization"` in
`Header.tsx`, even though the underlying variable is `tenantId`.

**Live trap to fix on sight:** the sidebar nav still labels the org list `"Tenants"`
(`dashboard/src/components/layout/Sidebar.tsx`). If you touch that file, rename the label to
`"Organizations"` — the route can stay `/dashboard/tenants`, only the visible text changes.

---

## Pre-commit checklist (run before declaring any dashboard change done)

- [ ] No new import of `@/components/ui/select` — every dropdown is `SearchableSelect`.
- [ ] Every tab/filter/selection a user can land on is in the URL via `useSearchParams`, and
      updates preserve existing params (`prev.set(...)`, not `setSearchParams({ ... })`).
- [ ] Every new section is inside `CollapsibleSection` or a `rounded-lg border bg-card px-5 py-4`
      wrapper — no bare walls of content.
- [ ] Every user-facing string is plain English (no "Tenant", "Archetype", raw field names,
      lifecycle state codes).
- [ ] `pnpm dashboard:build` succeeds and no TypeScript / ESLint errors on changed files.
