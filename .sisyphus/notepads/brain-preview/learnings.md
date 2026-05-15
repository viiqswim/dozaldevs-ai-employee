# Brain Preview — Learnings

## 2026-05-15 Session: Planning

### Architecture Decisions
- Backend endpoint assembles all data server-side (not client-side) for accuracy
- Reuses actual `resolveAgentsMd()` from `src/workers/lib/agents-md-resolver.mts`
- Reuses actual `loadTenantEnv()` from `src/gateway/services/tenant-env-loader.ts`
- All env var VALUES redacted to [SET]/[NOT SET] at the endpoint level

### Key File Locations
- Platform AGENTS.md static file: `src/workers/config/agents.md`
- resolveAgentsMd: `src/workers/lib/agents-md-resolver.mts:7-22`
- loadTenantEnv: `src/gateway/services/tenant-env-loader.ts:18-65`
- Admin route pattern: `src/gateway/routes/admin-archetypes.ts`
- Test pattern: `tests/gateway/admin-archetypes.test.ts`
- Dashboard tab pattern: `dashboard/src/panels/employees/EmployeeDetail.tsx`
- Dashboard UI pattern: `dashboard/src/panels/tools/ToolDetail.tsx`
- Existing markdown renderer: `dashboard/src/components/MarkdownPreview.tsx`
- Route registration: `src/gateway/server.ts` ~line 172
- MarkdownEditorField: `dashboard/src/components/MarkdownEditorField.tsx`

### Test Architecture
- Uses TestApp.inject() from tests/setup.ts
- Mock Prisma client (no real DB)
- Pattern file: tests/gateway/admin-archetypes.test.ts

### Env Var Sources (6 categories)
1. platform — PLATFORM_ENV_WHITELIST from tenant-env-loader.ts
2. tenant_secret — decrypted from tenant_secrets table
3. tenant_config — derived from tenants.config JSON
4. lifecycle — TASK_ID, TENANT_ID, NOTIFY_MSG_TS, etc.
5. raw_event — PROPERTY_UID, LEAD_UID, THREAD_UID, etc. (conditional)
6. harness — OPENROUTER_MODEL, OPENCODE_PROVIDER_ID, OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS

### Archetype IDs for Testing
- Tenant: 00000000-0000-0000-0000-000000000003 (VLRE)
- Archetype: 00000000-0000-0000-0000-000000000015

### Approved Models (per AGENTS.md)
- Primary: minimax/minimax-m2.7
- Verification: anthropic/claude-haiku-4-5
- DO NOT use claude-sonnet or any other model in code/seed data

## 2026-05-15 Session: AGENTS.md Raw/Rendered Toggle

### Pattern Applied
- Added `const [agentsMdRaw, setAgentsMdRaw] = useState(true)` — defaults to `true` (raw) since AGENTS.md is long
- Toggle button placed in `<CardHeader>` using flex row: `<div className="flex items-center justify-between gap-2">`
- Button text: "Rendered" when raw=true, "Raw" when raw=false (matches PromptSection pattern)
- ONE shared state across all 4 sub-tabs (Full/Platform/Tenant/Employee) — not 4 independent states
- "Not configured for this employee" message preserved for null/empty layers
- `MarkdownPreview` and `Button` were already imported — no new imports needed

### Key Difference from executionRaw/deliveryRaw
- `agentsMdRaw` defaults to `true` (raw) vs `false` for execution/delivery prompts
- Rationale: AGENTS.md is typically very long; raw view is more useful for scanning

### Build Verification
- `cd dashboard && pnpm build` → exit 0, no TypeScript errors

## 2026-05-15 Session: URL-synced Tabs (Wave 1)

### Pattern: Controlled Tabs with URL sync
- `useSearchParams` from `react-router-dom` is the established pattern (Layout.tsx uses it)
- `VALID_TABS` const array defined outside component to avoid re-creation
- `tabParam` derived from `searchParams.get('tab')` — null if absent → falls back to `'config'`
- `handleTabChange` uses callback form `(prev) => { prev.set(...); return prev; }` with `{ replace: true }` to preserve existing params (e.g. `?tenant=`)
- No `useEffect` needed — `onValueChange` only fires on user interaction, never on mount
- `VALID_TABS.includes(tabParam as (typeof VALID_TABS)[number])` is the TypeScript-safe way to check membership in a `as const` tuple

### Files Modified
- `dashboard/src/panels/employees/EmployeeDetail.tsx` — added `useSearchParams` import, `VALID_TABS`, `activeTab`, `handleTabChange`; changed `<Tabs defaultValue="config">` to `<Tabs value={activeTab} onValueChange={handleTabChange}>`

### Build Result
- `pnpm build` in `dashboard/` exits 0 — no TypeScript or Vite errors

## 2026-05-15 Session: Phase Dividers + Collapsible Sections (T3)

### Structural Changes Applied
- `CardHeader` removed from imports — no longer needed after switching all section headers to `<summary>` elements
- `PromptSection` gained `id?: string` and `defaultOpen?: boolean` props
- `PromptSection` now manages its own `isOpen` state (via `useState(defaultOpen ?? false)`)
- Raw/Rendered button moved from `CardHeader` into `CardContent` (inside the details body) to avoid button-in-summary toggle conflicts

### Controlled `<details>` Pattern for Default-Open Sections
- Problem: `<details open={true}>` is controlled — parent re-renders reset it to open even after user closes it
- Solution: manage `isOpen` state inside PromptSection; use `onClick` on `<summary>` with `e.preventDefault()` to block browser default toggle, then `setIsOpen(o => !o)` to manually control state
- This makes Execution Prompt truly "open by default, user-toggleable, immune to parent re-renders"

### Uncontrolled `<details>` Pattern for Default-Closed Sections
- All other sections (AGENTS.md, Env Vars, Tools, Runtime, Delivery Prompt): render `<details>` without `open` prop
- React doesn't touch the `open` attribute → browser manages toggle state
- On parent re-render (e.g. clicking Raw/Rendered), `<details>` stays in whatever open/closed state the user left it ✓

### Section Order (T3 final)
1. Execution Phase divider
2. Execution Prompt (id="brain-execution-prompt", defaultOpen)
3. AGENTS.md (id="brain-agents-md")
4. Environment Variables (id="brain-env-vars")
5. Available Tools & Skills (id="brain-tools")
6. Runtime Config (id="brain-runtime")
7. Delivery Phase divider
8. Delivery Prompt (id="brain-delivery-prompt")

### Phase Divider Markup
```tsx
<div className="flex items-center gap-3 pt-6 pb-2">
  <div className="h-px flex-1 bg-border" />
  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    Execution Phase
  </span>
  <div className="h-px flex-1 bg-border" />
</div>
```

### AGENTS.md Raw/Rendered Button Position
- Moved from `CardHeader` to `CardContent` (first element inside, above Tabs)
- Pattern: `<div className="mb-3 flex justify-end"><Button ...></div>` then `<Tabs ...>`

### Build Result
- `pnpm build` in `dashboard/` exits 0 — no TypeScript or Vite errors

## 2026-05-15 Session: Sticky Pill Nav Bar (T4)

### Pattern Applied
- `SECTION_NAV` constant defined as `as const` outside component — TypeScript infers literal `phase` types
- `activeSection` state initialized to `'brain-execution-prompt'` (first section)
- `handleNavClick` uses `summary.click()` to trigger React-controlled `<details>` in PromptSection, then `setTimeout(50ms)` before `scrollIntoView` to let expansion animate before scroll
- IntersectionObserver `useEffect` depends on `[data]` — ensures elements exist in DOM after data loads; threshold 0.1
- Active item picks the first (topmost by `boundingClientRect.top`) of all intersecting entries
- Observer cleanup via `return () => observer.disconnect()` on unmount or data change

### Nav Markup Pattern
- `<nav className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b py-2 -mx-1 px-1">`
- Execution pills rendered first via `.filter(item => item.phase === 'execution')`
- Subtle divider: `<div className="w-px h-4 bg-border mx-1 shrink-0" />`
- Delivery pills follow
- Active pill: `bg-primary text-primary-foreground`; inactive: `hover:bg-muted text-muted-foreground`
- `data-active="true"` attribute on active item for testability
- `overflow-x-auto` on the flex row handles narrow viewports

### Build Result
- `cd dashboard && pnpm build` → exit 0, no TypeScript errors
