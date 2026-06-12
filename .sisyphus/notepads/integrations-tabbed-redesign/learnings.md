# Learnings — integrations-tabbed-redesign

## [2026-06-12] Session Start

### ComposioConnections.tsx current state (309 lines)

- URL state: `search` and `category` via `useSearchParams`
- URL update style: `(prev) => { prev.set/delete; return prev }` updater form — MUST be refactored to `new URLSearchParams(searchParams)` copy style (RulesPanel pattern)
- `connections` poll via `usePoll(fetchConnections)` — authoritative source for connected Composio apps
- `connectableItems` fetched separately: `listComposioToolkits(tenantId, { connectable: true, limit: 200 })` — KEEP THIS
- `catalogItems` = paginated 24/page with IntersectionObserver infinite scroll
- `connectedSlugs` derived from `connections` poll (correct)
- `availableItems` = connectableItems filtered by NOT in connectedSlugs
- `browseItems` = catalogItems filtered by NOT in connectedSlugs
- `connectedCustomApps` / `availableCustomApps` derived from `CUSTOM_CREDENTIAL_APPS` + `existingSecretKeys`
- **LATENT BUG**: `ConnectedAppsZone` receives `toolkits={catalogItems}` and internally does `toolkits.filter(t => t.connected)` — connected apps beyond page 1 vanish

### Key files

- Main: `dashboard/src/pages/ComposioConnections.tsx`
- Sub-components: `dashboard/src/pages/composio/`
  - `ConnectedAppsZone.tsx` — currently receives catalogItems (bug source)
  - `IntegrationCard.tsx` — card with connected/connectable/unavailable states
  - `CustomCredentialCard.tsx` — credential-form and oauth-redirect custom apps
  - `SearchToolbar.tsx` — search input + category chips
  - `MarketplaceStates.tsx` — SkeletonGrid, EmptySearchState, CatalogErrorState
- Tabs primitive: `dashboard/src/components/ui/tabs.tsx`
- URL pattern reference: `dashboard/src/panels/rules/RulesPanel.tsx:34-44`
- Multi-tab reference: `dashboard/src/panels/employees/EmployeeDetail.tsx:241-277`

### URL-state conventions (from RulesPanel.tsx)

- Copy style: `const p = new URLSearchParams(searchParams); p.set/delete; setSearchParams(p, { replace: true })`
- Default value deletes the key (no pollution)
- Always `{ replace: true }`

### Tab URL params

- `?tab=connected` / `?tab=browse`
- Smart default: `connected` if connectedCount > 0, else `browse` — NEVER written to URL
- Connected tab: `?csearch=` / `?ccategory=`
- Browse tab: `?search=` / `?category=`

### CUSTOM_CREDENTIAL_APPS

- 4 apps: hostfully, sifely (credential-form), github, slack (oauth-redirect)
- Connection status derived from `existingSecretKeys` Set
- Must mix into both tabs uniformly

### Test file

- `dashboard/src/tests/composio-marketplace.test.tsx` — component-level only currently

## [2026-06-12] Task 1 complete — data/URL-state scaffold

### What was done (ComposioConnections.tsx only, pure data refactor, zero JSX changes)

- `updateSearch` / `updateCategory` converted from `(prev) => {...}` updater form to
  `const next = new URLSearchParams(searchParams); ...; setSearchParams(next, { replace: true })` copy style.
- Added `updateTab(value)` — same copy style; empty/null deletes `tab` key, else sets it. Smart-default logic deferred to Task 2.
- Added `activeTab = searchParams.get('tab') ?? null` (raw expose; default resolution comes later).
- Added `connectedComposioApps: ComposioToolkit[]` — built from `connections` poll, joined to metadata via
  `connectableItems.find(...) ?? catalogItems.find(...) ?? minimal-fallback`. Fixes the latent pagination bug
  (ConnectedAppsZone previously filtered `catalogItems` page-1-only).
- Added `connectedCount = connectedComposioApps.length + connectedCustomApps.length`.
- `connectedComposioApps`, `connectedCount`, `activeTab`, `updateTab` are currently unused-but-exposed —
  fine because dashboard tsconfig does NOT set `noUnusedLocals` (only `strict`), so build stays green.

### Fallback object shape gotcha

- `ComposioToolkit` requires `description: string | null` and `toolsCount: number | null` (NOT optional).
  The minimal fallback object must include both (`description: null, toolsCount: null`) or tsc fails.
  Task spec's example omitted them — added to satisfy the type.

### Verification commands & quirks

- Build: run from `dashboard/` via `pnpm build` (= `tsc -b && vite build`). Exit 0, no `error TS`.
- Test: `composio-marketplace.test.tsx` lives in the DASHBOARD vitest scope, NOT root.
  Root `vitest.config.ts` only includes `tests/unit/**` — running `pnpm test -- --run composio-marketplace`
  from repo root runs the BACKEND suite (and `--run` filter does not pass through cleanly in watch mode).
  Correct command: `cd dashboard && pnpm exec vitest run composio-marketplace` → 15 passed (15), exit 0.
- LSP diagnostics unavailable locally (asdf: "No version set for typescript-language-server"). Build is the gate.
- Evidence: `.sisyphus/evidence/task-1-build-tests.txt` (BUILD_EXIT_CODE:0, TEST_EXIT_CODE:0).

## [2026-06-12] Task 3 complete — Connected tab content refactor

### What was done

**ConnectedAppsZone.tsx** (115 → ~130 lines):

- Props interface changed: removed `connections: ComposioConnection[]` and `toolkits: ComposioToolkit[]`, added `connectedApps: ComposioToolkit[]` (direct list)
- Removed internal bug: `const connectedToolkits = toolkits.filter((t) => t.connected)` — was only page-1 of catalog
- Added `SearchToolbar` above the connected grid (renders with chips when categories provided)
- Added toolbar props: `search`, `category`, `categories`, `onSearchChange`, `onCategoryChange`
- `pendingToolkit` lookup now uses `connectedApps.find(...)` instead of `toolkits.find(...)`
- Badge count now uses `connectedApps.length` instead of `connections.length`

**ComposioConnections.tsx** (364 → ~390 lines):

- Added `connectedSearch` / `connectedCategory` from `csearch` / `ccategory` URL params
- Added `updateConnectedSearch` / `updateConnectedCategory` (same copy-style as other updaters)
- Added `filteredConnectedApps`: filters `connectedComposioApps` by csearch + ccategory
- Updated `ConnectedAppsZone` call: uses `connectedApps={filteredConnectedApps}` and passes toolbar props; `categories={[]}` intentional placeholder (Task 6 will derive from connected apps)

**composio-marketplace.test.tsx** (15 tests):

- Updated `MarketplaceZones` helper: derives `connectedApps` locally before passing to `ConnectedAppsZone`
- All 15 tests still pass — no regressions

### Test file gotcha

When changing a component's props interface, the test file must be updated too — tsc -b catches this
because the test file is in the same tsconfig scope as the dashboard source.

## [2026-06-12] Task 2 complete — Radix Tabs shell

### What was done (ComposioConnections.tsx only)

- Added `Tabs, TabsList, TabsTrigger, TabsContent` import from `@/components/ui/tabs`.
- Replaced simple `activeTab = searchParams.get('tab') ?? null` with smart-default logic:
  `const smartDefault = !connectionsLoading && connectedCount > 0 ? 'connected' : 'browse'`
  `const activeTab = searchParams.get('tab') ?? smartDefault`
- Replaced naive `updateTab` (just set/delete) with smart version: deletes `?tab` when value
  equals `currentSmartDefault` (no URL pollution on default), sets otherwise.
- Added loading gate: when `connectionsLoading && !searchParams.has('tab')`, renders `<SkeletonGrid count={3} />` instead of tabs to prevent flicker/snap.
- Wrapped all content below header card in `<Tabs value={activeTab} onValueChange={updateTab}>`.
- ConnectedAppsZone → `TabsContent value="connected"`.
- Available + Browse sections → `TabsContent value="browse"` (wrapped in `<div className="space-y-6">`).
- Count badge on Connected trigger uses same pill pattern as ConnectedAppsZone header:
  `ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 bg-primary/10 text-xs font-medium text-primary`
- ConnectedAppsZone call updated to use correct props (`connectedApps` not `connections`/`toolkits`);
  added separate `csearch`/`ccategory` URL params and `filteredConnectedApps` to avoid collision
  with Browse tab's `search`/`category` params.

### Verification

- `pnpm dashboard:build` → exit 0, `tsc -b && vite build` clean.
- `cd dashboard && pnpm exec vitest run composio-marketplace` → 15 passed (15), exit 0.
- Evidence: `.sisyphus/evidence/task-2-build-tests.txt`.

## [2026-06-12] Task 4 complete — Browse tab data/logic refinements

### What was done (ComposioConnections.tsx only)

**Structural prerequisite — activeTab must precede loadMore useCallback**

- `activeTab` (derived from `searchParams.get('tab') ?? smartDefault`) needed to be in the
  `loadMore` deps array. But it was computed at line 190, after `loadMore` at line 112.
- In JavaScript, referencing a `const` in a deps array `[activeTab, ...]` before it's declared
  triggers TDZ. Fixed by moving the entire block that computes `connectedSlugs`,
  `connectedComposioApps`, `isCustomAppConnected`, `connectedCustomApps`, `connectedCount`,
  `smartDefault`, `activeTab` to BEFORE the `loadMore` `useCallback`.

**filteredAvailableItems** — client-side filter on `availableItems` by Browse `search`/`category`:

```typescript
const filteredAvailableItems = availableItems.filter((t) => {
  const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug...;
  const matchesCategory = !category || t.categories.some((c) => c.slug === category);
  return matchesSearch && matchesCategory;
});
```

**browseItems deduplication** — now excludes items already in `availableItems` via `availableSlugs`:

```typescript
const availableSlugs = new Set(availableItems.map((t) => t.slug.toLowerCase()));
const browseItems = catalogItems.filter(
  (t) => !connectedSlugs.has(t.slug.toLowerCase()) && !availableSlugs.has(t.slug.toLowerCase()),
);
```

**loadMore guard** — added `activeTab !== 'browse'` early return + `activeTab` to deps:

```typescript
const loadMore = useCallback(() => {
  if (activeTab !== 'browse') return;
  ...
}, [activeTab, nextCursor, loadingMore, tenantId, search, category]);
```

**Browse JSX restructured**:

- "Available to connect now" section now shows ONLY `availableCustomApps` (custom credential cards);
  hidden entirely when `availableCustomApps.length === 0` (no "more apps coming soon" fallback)
- Browse grid shows `filteredAvailableItems` pinned first, then `browseItems` — no item appears twice
- Empty-state conditions use BOTH `filteredAvailableItems.length === 0 && browseItems.length === 0`

### Verification

- `pnpm dashboard:build` → exit 0 (tsc clean + vite build 450ms)
- `cd dashboard && pnpm exec vitest run composio-marketplace` → 15 passed (15), exit 0
- Evidence: `.sisyphus/evidence/task-4-build-tests.txt`

## Task 5 — Empty States & Loading Skeletons (2026-06-12)

### ConnectedAppsZone empty state pattern

- Added `onBrowse?: () => void` prop to `ConnectedAppsZoneProps`
- Empty state triggers when `connectedApps.length === 0 && customConnectedCount === 0` AND not loading
- Uses `<Button>` from `@/components/ui/button` (already imported for the Dialog footer)
- `onBrowse` is optional — if not provided, the Button is not rendered (`{onBrowse && <Button ...>}`)

### Loading gate (no flash)

- Top-level loading gate: `connectionsLoading && !searchParams.has('tab')` → `SkeletonGrid count={3}`
- This means: when user has explicitly set `?tab=connected`, the skeleton is skipped (correct — show tabs immediately)
- ConnectedAppsZone's own `isLoading` = `connectionsLoading || (catalogLoading && catalogItems.length === 0)` → internal skeleton (2 pulse cards)

### Browse tab states (already correct — no changes needed)

- `catalogLoading` → `SkeletonGrid count={6}`
- `catalogError` → `CatalogErrorState`
- `filteredAvailableItems.length === 0 && browseItems.length === 0 && search` → `EmptySearchState`
- All inside `TabsContent value="browse"`

### File was externally modified between reads

- ComposioConnections.tsx was modified by another process between first read and edit attempt
- Categories for Connected tab now computed as `connectedCategories` (only shown when ≥2 categories)
- Must always re-read before editing in multi-agent sessions

---

## Task 6 — Connected category derivation + mobile layout (2026-06-12)

### Category derivation pattern

Mirror the `loadCatalog` catMap pattern for `connectedComposioApps`:

```typescript
const connectedCategoryMap = new Map<string, string>();
for (const app of connectedComposioApps) {
  for (const c of app.categories) connectedCategoryMap.set(c.slug, c.name);
}
const connectedCategories =
  connectedCategoryMap.size >= 2
    ? Array.from(connectedCategoryMap.entries()).map(([slug, name]) => ({ slug, name }))
    : [];
```

The `>= 2` guard avoids surfacing a trivial single-chip filter.

### Mobile layout: TabsList overflow

The dashboard sidebar is `w-56` (224px) fixed — no mobile collapse. At 375px, the content area is only ~151px. Two tab triggers ("Connected apps 7" = ~158px, "Browse apps" = ~109px) total ~267px and overflow the viewport with default `inline-flex` TabsList.

**Fix**: Add `className="w-full flex-wrap h-auto gap-y-1"` to the TabsList call site.

- `w-full` makes the container fill the content area
- `flex-wrap` allows triggers to wrap to a second row on narrow screens
- `h-auto` overrides the default `h-9` fixed height
- On desktop, all triggers fit on one row so appearance is unchanged

### Mobile bounding boxes after fix

- Connected apps: x=220, y=354, right=379 (row 1)
- Browse apps: x=245, y=386, right=354 (row 2, well within 375px)

---

## Task 7 — Page-level tab tests for ComposioConnections (2026-06-12)

### What was done (test file ONLY — zero production changes)

- Extended `dashboard/src/tests/composio-marketplace.test.tsx` (348 → 521 lines) with a new
  `describe('ComposioConnections — page-level tab tests')` block covering 6 scenarios (A–F).
- 15 pre-existing + 6 new = **21 passed, exit 0**. `pnpm build` (tsc -b) exit 0.

### CRITICAL mocking insight — do NOT vi.mock('../lib/gateway')

- `gatewayFetch` (gateway.ts:75) routes EVERY gateway call through global `fetch`
  (`listComposioConnections`, `listComposioToolkits`, `listSecrets`, `getComposioConnectUrl`;
  `disconnectComposioApp` calls `fetch` directly too).
- Therefore **stub global `fetch`** to control all gateway responses. This is the same pattern
  the pre-existing line-285 `listComposioToolkits` tests already use.
- Adding `vi.mock('../lib/gateway')` at module level would BREAK those line-285 tests (they assert
  on the real impl building the URL + calling fetch). Avoided entirely.

### Hook mocking

- `vi.mock('../hooks/use-poll')` (auto-mock) + `vi.mocked(usePoll).mockReturnValue({ data, error: null, loading: false, refresh: vi.fn() } as ReturnType<typeof usePoll>)`.
  Mocking usePoll wholesale means `listComposioConnections` is never invoked — set connections directly.
  NOTE: `UsePollResult` includes `error` — must include it in the return object or the cast complains.
- `vi.mock('../hooks/use-tenant', () => ({ useTenant: vi.fn().mockReturnValue({ tenantId, tenants }) }))`.
- Both `vi.mock` calls are hoisted file-wide but SAFE: only the page-level block renders
  ComposioConnections (the sole caller of usePoll/useTenant). Existing tests render leaf components only.

### Two listComposioToolkits calls — route by query param

- Component calls `listComposioToolkits(t, { connectable: true, limit: 200 })` AND the paged catalog
  `listComposioToolkits(t, { limit: 24, ... })`. A `routeToolkits({connectable, catalog})` helper
  branches `mockFetch.mockImplementation` on `url.includes('connectable=true')` to feed each independently.
- Scenario C (pagination-bug guard): connections poll = [notion], connectable fetch = [Notion meta],
  catalog fetch = [] → "Notion" still renders in Connected (proves it's sourced from poll+connectable,
  not the paged catalog).

### Assertions

- Tab active state: `screen.getByRole('tab', { name: /connected apps/i })` →
  `.toHaveAttribute('data-state', 'active' | 'inactive')` (Radix Tabs sets data-state).
- URL-driven tab/search: `MemoryRouter initialEntries={['/integrations?tab=connected&csearch=notion']}`
  — never mock react-router-dom.
- `IntersectionObserver` must be stubbed via `vi.stubGlobal` (jsdom lacks it) or the infinite-scroll
  effect throws on mount.
- Wrap initial-render assertions in `waitFor(...)` — connectable/catalog fetches resolve async.

### Verification

- `cd dashboard && pnpm exec vitest run composio-marketplace` → 21 passed, TEST_EXIT_CODE:0
- `cd dashboard && pnpm build` → built in ~441ms, BUILD_EXIT_CODE:0 (tsc gates test file via include:["src"])
- Local LSP (typescript-language-server) unavailable via asdf — `tsc -b` is the type gate.
- Evidence: `.sisyphus/evidence/task-7-unit-suite.txt`
