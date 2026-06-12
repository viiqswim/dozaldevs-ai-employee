# Integrations Page — Tabbed Redesign

## TL;DR

> **Quick Summary**: Restructure the `/dashboard/integrations` page from three stacked sections into a clean two-tab experience (**Connected apps** | **Browse apps**), with a smart default tab, a full search+category toolbar on both tabs, connectable apps globally pinned to the top of Browse, and tab count badges — while fixing a latent pagination bug in the connected view. Frontend-only; no backend or data-model changes.
>
> **Deliverables**:
>
> - `ComposioConnections.tsx` refactored into a Radix `Tabs` layout with URL-encoded `?tab=` state
> - "Connected apps" tab sourced from the authoritative `connections` poll + custom-app secret status (fixes pagination bug)
> - Full search + category toolbar on BOTH tabs (Browse catalog-wide; Connected filtered over connected apps)
> - Smart default tab (returning → Connected, new → Browse) with no URL pollution / no flicker
> - Connectable apps globally pinned to top of Browse (keeps `connectable:true, limit:200` fetch)
> - Tab count badges ("Connected apps (3)")
> - Updated/extended Vitest page-level tests + live Playwright E2E verification
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (state/data scaffolding) → Task 2 (tab shell) → Tasks 3-6 (tab content) → Task 7 (tests) → Final Verification Wave

---

## Context

### Original Request

The `/dashboard/integrations` page currently shows three stacked card sections: "Connected applications", "Available to connect now", and "Browse all apps". The user wants a better UX — separating connected apps and browse into tabs, with search, and surfacing apps that are connectable-now alongside the broader catalog. The user explicitly asked to be challenged on the best UX, not just agreed with. A side request: add the same search/category navigation to the Connected tab too.

### Interview Summary

**Key Decisions** (confirmed via Q&A):

- **Two tabs**: "Connected apps" | "Browse apps", URL-encoded `?tab=connected` / `?tab=browse`.
- **Smart default tab**: returning users (≥1 connection) → Connected; new users (zero connections) → Browse. Default is implicit (no `?tab` key written to URL).
- **Custom-credential apps** (Hostfully, Sifely, GitHub, Slack) mix uniformly into the same tabs/grid as Composio catalog apps — no separate "Platform integrations" section.
- **"Available to connect now" standalone section eliminated** — its concept survives as: connectable apps globally pinned to the TOP of the Browse grid, with per-card badge ("Connect" vs disabled "Not yet available").
- **Connectable sort scope: GLOBAL** — ALL connectable apps pinned at the very top of Browse regardless of pagination depth (keep the `connectable:true, limit:200` fetch).
- **Connected tab gets a FULL toolbar** (search + category chips) like Browse — per user's explicit choice. Categories on Connected derive client-side from the connected apps' own categories.
- **Tab count badges**: show counts, e.g. "Connected apps (3)".
- **Fix latent bug**: source the Connected view from the `connections` poll + custom-secret status, NOT from the paginated `catalogItems` (current code drops connected-app cards that live beyond catalog page 1).

**Research Findings** (librarian — integration-marketplace UX consensus):

- Separate Connected tab favored for non-technical, management-oriented users (HubSpot, Vercel, Stripe).
- Search should be always-visible, plain-language placeholder ("Search apps…"), category labels by use-case not technology.
- Coming-soon/unavailable apps shown in-grid with a badge — never hidden.
- Empty state: single CTA (Hick's Law).
- Card status = color + text (accessible), CTA verbs Connect / Manage / Coming Soon.

### Metis Review

**Gaps addressed**:

- **Latent bug** (`ConnectedAppsZone.tsx` sources connected cards from paginated `catalogItems`): Connected tab will source from `connections` poll + secret status instead. → Task 1 + Task 3.
- **Smart-default flicker / URL pollution**: gate default on data-loaded, apply only when `?tab` absent, never write default to URL. → Task 2.
- **IntersectionObserver fires on wrong tab**: guard `loadMore` so infinite scroll no-ops when Browse inactive. → Task 4.
- **URL-state style inconsistency** (`(prev) =>` updater vs `new URLSearchParams` copy): standardize on one style file-wide. → Task 1.
- **Test harness drift** (`MarketplaceZones` hand-rolls page logic): add real page-level tab tests. → Task 7.
- **Global connectable sort requires keeping limit-200 fetch** and client-filtering it by the active search query. → Task 4.

---

## Work Objectives

### Core Objective

Transform the integrations page into a two-tab (Connected | Browse) interface that is cleaner and clearer for non-technical users, while fixing the connected-view pagination bug — with zero backend changes.

### Concrete Deliverables

- `dashboard/src/pages/ComposioConnections.tsx` — tabbed orchestration
- `dashboard/src/pages/composio/SearchToolbar.tsx` — reused on both tabs (unchanged unless a named defect requires it)
- New tab-content sub-components only if extraction reduces duplication (Connected grid, Browse grid) — otherwise inline
- `dashboard/src/tests/composio-marketplace.test.tsx` — extended with page-level tab tests

### Definition of Done

- [ ] Two tabs render with count badges; `?tab=` reflects active tab (default omitted)
- [ ] Smart default works with no flicker and no URL pollution
- [ ] Connected tab sources from `connections` poll + secrets (pagination bug fixed)
- [ ] Both tabs have working search + category filtering
- [ ] Connectable apps globally pinned to top of Browse
- [ ] `pnpm lint` clean, dashboard `tsc` build clean, `pnpm test -- --run` green
- [ ] All Playwright QA scenarios pass with evidence captured

### Must Have

- Radix `Tabs` primitive (`components/ui/tabs.tsx`) — not a hand-rolled tab strip
- URL-state pattern consistent with `RulesPanel.tsx` (read `?tab` with `?? default`; copy params; default deletes key; `{ replace: true }`)
- Connected tab sourced from `connections` poll + custom-secret status
- `loadMore` guarded to not fire while Browse tab inactive
- Plain-language, non-technical end-user copy
- Preserve `/dashboard/integrations/composio` → `/dashboard/integrations` redirect

### Must NOT Have (Guardrails)

- NO backend / gateway / data-model changes (no edits to `listComposioToolkits`, routes, Prisma)
- NO re-implementation of card badge states — they already exist in `IntegrationCard.tsx`
- NO new state-management library, NO generic "TabbedPage" abstraction, NO new shared hook unless ≥2 call sites need it (inline the tab logic)
- NO category chips that filter nothing — Connected categories must derive from actual connected apps
- NO change to `CustomCredentialCard.tsx` internals, disconnect logic, or OAuth flows
- NO removal of the `/dashboard/integrations/composio` redirect
- NO technical jargon in user-facing copy ("Connected apps" / "Browse apps", not "OAuth integrations")
- NO touching the legacy `dashboard/src/panels/integrations/IntegrationsPage.tsx` (separate page)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest + React Testing Library; `composio-marketplace.test.tsx` present)
- **Automated tests**: YES (tests-after) — extend existing test file with page-level tab tests
- **Framework**: Vitest
- **Live E2E**: Playwright via CDP against `http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003` (VLRE — has real connections)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.{png|txt}`.

- **Frontend/UI**: Playwright (CDP to real Chrome — repo convention; headless breaks WebGL-free here but CDP is the standard) — navigate, assert DOM/`data-state`, screenshot, capture network.
- **Component logic**: Vitest page-level render with mocked gateway fns.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
└── Task 1: Data-source + URL-state scaffolding in ComposioConnections.tsx [unspecified-high]

Wave 2 (Tab shell + content — after Task 1):
├── Task 2: Tab shell, smart default, count badges (depends: 1) [visual-engineering]
├── Task 3: Connected tab content + toolbar + bug fix (depends: 1) [visual-engineering]
└── Task 4: Browse tab content + global connectable pin + scroll guard (depends: 1) [visual-engineering]

Wave 3 (Polish + tests — after Wave 2):
├── Task 5: Empty states + loading skeletons per tab (depends: 2,3,4) [visual-engineering]
└── Task 6: Connected-tab category derivation + responsive/mobile (depends: 3) [visual-engineering]

Wave 4 (Tests — after Wave 3):
└── Task 7: Extend Vitest page-level tab tests (depends: 2,3,4,5,6) [unspecified-high]

Wave FINAL (after ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + lint + build + unit tests (unspecified-high)
├── F3: Live Playwright QA — all scenarios (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
-> Present results -> user okay

Critical Path: Task 1 → Task 2 → Task 5 → Task 7 → F1-F4
```

### Dependency Matrix

- **1**: deps none — blocks 2,3,4
- **2**: deps 1 — blocks 5,7
- **3**: deps 1 — blocks 5,6,7
- **4**: deps 1 — blocks 5,7
- **5**: deps 2,3,4 — blocks 7
- **6**: deps 3 — blocks 7
- **7**: deps 2,3,4,5,6 — blocks Final Wave

### Agent Dispatch Summary

- **Wave 1**: T1 → `unspecified-high`
- **Wave 2**: T2, T3, T4 → `visual-engineering`
- **Wave 3**: T5, T6 → `visual-engineering`
- **Wave 4**: T7 → `unspecified-high`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+playwright), F4 → `deep`

---

## TODOs

- [x] 1. Data-source + URL-state scaffolding

  **What to do**:
  - In `ComposioConnections.tsx`, add the `?tab` URL param read alongside the existing `?search` / `?category`: `const tab = searchParams.get('tab') ?? <smartDefault>` (smart default resolved in Task 2; for now expose a derived `activeTab`).
  - Standardize the URL-update style across the file. The file currently mixes the `(prev) => {...}` updater form (`updateSearch`/`updateCategory`, lines 157-177). Choose the `new URLSearchParams(searchParams)` copy style from `RulesPanel.tsx:34-44` and refactor `updateSearch`/`updateCategory` plus the new `updateTab` to all use it consistently. Default value deletes the key; always `{ replace: true }`.
  - Introduce an authoritative "connected apps" data structure NOT derived from `catalogItems`. Build it from: (a) the `connections` poll (Composio connected toolkits) joined to their toolkit metadata, and (b) the connected custom apps (`connectedCustomApps`). For Composio connected toolkits whose metadata is not in `catalogItems`, fall back to a minimal display object from the connection record (slug → name/logo best-effort) so the card still renders. This fixes the latent bug where connected apps beyond catalog page 1 vanish.
  - Keep the existing `connectableItems` fetch (`connectable:true, limit:200`, lines 91-95) — it is required for global connectable pinning in Browse (Task 4).
  - Expose derived values cleanly for Tasks 2-4: `connectedComposioApps`, `connectedCustomApps`, `connectedCount`, `availableItems` (connectable, not connected), `browseItems`.

  **Must NOT do**:
  - Do not change `listComposioToolkits` or any gateway function.
  - Do not add a new shared hook or context — inline derivations in the component.
  - Do not alter `IntegrationCard` / `CustomCredentialCard` props.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — careful state/data-flow refactor with race-condition awareness; not primarily visual.
  - **Skills**: [`react-dashboard`] — enforces SearchableSelect, URL-encoded state, card-shell, non-technical copy conventions.
  - **Omitted**: `vercel-react-best-practices` (no perf bottleneck here; standard React).

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation)
  - **Parallel Group**: Wave 1 (sequential)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:
  - `dashboard/src/pages/ComposioConnections.tsx:30-201` — current state, derivations (`connectedSlugs`, `availableItems`, `browseItems`), `updateSearch`/`updateCategory`. This is the file being refactored.
  - `dashboard/src/panels/rules/RulesPanel.tsx:34-44` — canonical URL-state pattern to adopt: `new URLSearchParams(searchParams)` copy, default deletes key, `{ replace: true }`.
  - `dashboard/src/pages/composio/ConnectedAppsZone.tsx:53` — the latent bug source: `toolkits.filter((t) => t.connected)` over paginated `catalogItems`. The new connected data structure replaces this.
  - `dashboard/src/lib/types.ts:410-430` — `ComposioToolkit`, `ComposioConnection`, `ComposioToolkitsPage` shapes.
  - WHY: Task 1 establishes the single source of truth that Tasks 2-4 consume; getting the connected-data source right here is what fixes the pagination bug everywhere downstream.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` (tsc) clean after refactor
  - [ ] `pnpm test -- --run` still green (no regressions to existing component tests)
  - [ ] Connected-apps derivation references `connections` (poll) + `connectedCustomApps`, NOT `catalogItems.filter(t => t.connected)` — verify by reading the diff

  **QA Scenarios**:

  ```
  Scenario: Build + existing tests survive the scaffolding refactor
    Tool: Bash
    Steps:
      1. Run: pnpm --filter ./dashboard exec tsc --noEmit (or pnpm dashboard:build)
      2. Run: pnpm test -- --run composio-marketplace
      3. Assert both exit 0
    Expected Result: tsc clean; composio-marketplace.test.tsx passes
    Evidence: .sisyphus/evidence/task-1-build-tests.txt
  ```

  **Commit**: groups with Wave 1 — `refactor(dashboard): scaffold tabbed state + connected-apps data source for integrations page`

- [x] 2. Tab shell, smart default, count badges

  **What to do**:
  - Wrap the page body in Radix `Tabs` (`@/components/ui/tabs`): `<Tabs value={activeTab} onValueChange={updateTab}>` with a `TabsList` containing two `TabsTrigger`s: "Connected apps" and "Browse apps". Keep the existing "Integrations" header card above the tabs.
  - Add count badges to the triggers: `Connected apps ({connectedCount})` and optionally `Browse apps` (no count, or total). Use the count-pill style from `ConnectedAppsZone.tsx:60-69` or a `Badge`.
  - Implement smart default: when `?tab` is ABSENT, default to `connected` if `connectedCount > 0` else `browse`. Gate this on data being loaded: `connectionsLoading === false` AND secrets resolved. Until loaded, render a neutral loading state (do NOT guess a tab and snap). Critically: do NOT write the resolved default into the URL (implicit default — URL stays clean).
  - `updateTab(value)`: if value === smart-default-equivalent, delete the `?tab` key; else set it. `{ replace: true }`. Preserve existing `?search` / `?category` / `?tenant` params.
  - Map tab values: `connected` and `browse`.

  **Must NOT do**:
  - Do not hand-roll a tab strip — use Radix `Tabs`.
  - Do not write the default tab to the URL.
  - Do not `forceMount` the Browse `TabsContent` (prevents the scroll-guard issue in Task 4).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — UI composition with Radix primitives + careful async-default UX.
  - **Skills**: [`react-dashboard`] — tab + URL-state conventions, card-shell, non-technical copy.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: Task 1

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:241-277` — `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` usage with `useSearchParams`-driven `value`/`onValueChange`.
  - `dashboard/src/panels/rules/RulesPanel.tsx:34-44,98-109` — default-deletes-key URL pattern + simplest two-tab example.
  - `dashboard/src/components/ui/tabs.tsx` — the primitive.
  - `dashboard/src/pages/composio/ConnectedAppsZone.tsx:60-69` — count-pill style for badges.
  - `dashboard/src/pages/ComposioConnections.tsx:33-50,139-155` — `connectionsLoading`, `existingSecretKeys`/secrets resolution, `connectedCount` inputs for smart default.
  - WHY: Smart default must wait on three async sources (connections, secrets, catalog) without flicker or URL pollution — the EmployeeDetail + RulesPanel patterns show the exact wiring.

  **Acceptance Criteria**:
  - [ ] Two tabs render with count badge on Connected
  - [ ] `?tab=browse` appears when Browse selected; `?tab` absent when on the smart-default tab
  - [ ] No `?tab` key is written on initial load (implicit default)

  **QA Scenarios**:

  ```
  Scenario: Tab switch syncs URL; default stays implicit
    Tool: Playwright (CDP)
    Preconditions: Chrome via CDP; gateway live; VLRE tenant (has connections)
    Steps:
      1. Navigate to http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for network idle
      3. Assert two tab triggers exist with text "Connected apps" and "Browse apps"
      4. Assert new URL(page.url()).searchParams.has('tab') === false  (implicit default, no pollution)
      5. Click "Browse apps"; assert URL searchParams.get('tab') === 'browse'
      6. Click "Connected apps"; assert searchParams.has('tab') === false (default deletes key)
    Expected Result: All assertions pass
    Failure Indicators: ?tab written on load; tab key persists on default
    Evidence: .sisyphus/evidence/task-2-tab-url-sync.png

  Scenario: Smart default — returning user lands on Connected
    Tool: Playwright (CDP)
    Preconditions: VLRE tenant has >=1 connection
    Steps:
      1. Navigate with NO ?tab param; wait for network idle
      2. Assert the "Connected apps" trigger has attribute data-state="active"
    Expected Result: Connected tab active by default for a tenant with connections
    Evidence: .sisyphus/evidence/task-2-smart-default-connected.png
  ```

  **Commit**: groups with Wave 2 — `feat(dashboard): split integrations into Connected and Browse tabs with smart default`

- [x] 3. Connected tab content + toolbar + bug fix

  **What to do**:
  - Render the "Connected apps" `TabsContent`: a card-shell containing the connected grid built from Task 1's authoritative connected data source (`connectedComposioApps` via `connections` poll + `connectedCustomApps`) — NOT `catalogItems`. This is the latent-bug fix.
  - Compose the grid from existing components: `IntegrationCard` for Composio connected apps (connected state → "Disconnect"/"Manage"), and `CustomCredentialCard` (with `isConnected={true}`) for connected custom apps. Reuse the `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` layout.
  - Add a FULL toolbar (search + category chips) to the Connected tab using the existing `SearchToolbar` component. The search filters the connected list by name/slug; categories are derived client-side from the connected apps' own `categories` (see Task 6 for derivation). Use separate URL params to avoid colliding with Browse: e.g. `?csearch=` / `?ccategory=` (Connected) vs `?search=` / `?category=` (Browse) — OR reset shared params on tab switch. Choose `csearch`/`ccategory` to keep both tabs independently shareable.
  - Lift the disconnect-confirmation dialog handling so it works from the Connected grid (currently inside `ConnectedAppsZone`). Reuse `handleDisconnect` (`ComposioConnections.tsx:189-201`) which already refreshes connections + connectable + catalog.
  - Decide the fate of `ConnectedAppsZone.tsx`: either (a) refactor it to accept the new connected data source + toolbar and keep using it, or (b) inline its grid into the Connected `TabsContent` and retire it. Prefer (a) if it stays cohesive; either way the connected data must come from the poll.

  **Must NOT do**:
  - Do not source connected cards from `catalogItems`.
  - Do not modify `CustomCredentialCard` internals or `handleDisconnect` logic.
  - Do not add category chips that filter nothing — categories must come from real connected-app categories.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`react-dashboard`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Task 1

  **References**:
  - `dashboard/src/pages/composio/ConnectedAppsZone.tsx` — current connected-section component (header, count pill, grid, disconnect dialog). Refactor or retire.
  - `dashboard/src/pages/composio/SearchToolbar.tsx` — reusable search+chips toolbar; props `search`/`category`/`categories`/`onSearchChange`/`onCategoryChange`.
  - `dashboard/src/pages/composio/IntegrationCard.tsx:80-145` — connected/disconnect action area (already implemented; reuse, do not rebuild).
  - `dashboard/src/pages/composio/CustomCredentialCard.tsx` — connected custom-app card (`isConnected` prop).
  - `dashboard/src/pages/ComposioConnections.tsx:189-201,212-228` — `handleDisconnect` + current `ConnectedAppsZone` wiring.
  - WHY: The Connected tab is where the bug fix lands and where the user's "full toolbar on Connected" request is honored; all building blocks already exist and must be recomposed, not rewritten.

  **Acceptance Criteria**:
  - [ ] Connected grid renders from `connections` poll + custom-secret status
  - [ ] Search filters the connected list; categories reflect connected apps only
  - [ ] Disconnect from Connected moves the app out of Connected (and into Browse)

  **QA Scenarios**:

  ```
  Scenario: Connected tab lists connected apps and filters them
    Tool: Playwright (CDP)
    Preconditions: VLRE tenant with >=1 Composio connection (and/or custom app)
    Steps:
      1. Navigate to .../integrations?tenant=00000000-0000-0000-0000-000000000003 (Connected default)
      2. Assert at least one connected card is visible
      3. Type a connected app's name into the Connected search box (aria-label "Search apps")
      4. Assert only matching connected card(s) remain; assert URL has csearch=<query>
      5. Clear search; assert full connected list returns
    Expected Result: Connected list filters correctly; URL reflects csearch
    Evidence: .sisyphus/evidence/task-3-connected-filter.png

  Scenario: Disconnect moves app from Connected to Browse (integration)
    Tool: Playwright (CDP)
    Preconditions: A disconnectable Composio app is connected
    Steps:
      1. On Connected tab, click Disconnect on an app; confirm the dialog
      2. Wait for refresh; assert the app's card disappears from Connected
      3. Switch to Browse; assert the same app now appears with a "Connect" button
    Expected Result: App transitions Connected -> Browse
    Evidence: .sisyphus/evidence/task-3-disconnect-transition.png
  ```

  **Commit**: groups with Wave 2 — `fix(dashboard): source connected apps from connections poll and add toolbar to Connected tab`

- [x] 4. Browse tab content + global connectable pin + scroll guard

  **What to do**:
  - Render the "Browse apps" `TabsContent`: the existing `SearchToolbar` (Browse `?search`/`?category`) + the unified catalog grid + infinite-scroll sentinel + `MarketplaceStates` (skeleton/error/empty).
  - Global connectable pinning: render `availableItems` (all connectable, not-connected apps from the limit-200 fetch) FIRST, then the paginated `browseItems` with connectables de-duplicated out (so a connectable app never appears twice). Mix the connected custom apps' available counterparts in too (available custom apps render via `CustomCredentialCard isConnected={false}` at the top alongside connectables, matching current lines 238-256).
  - Apply the active Browse `search`/`category` query to the pinned connectable block as well (client-side filter the limit-200 set by name/slug + category) so search filters everything uniformly. (The limit-200 fetch is currently unfiltered — `ComposioConnections.tsx:91`.)
  - Scroll guard: ensure `loadMore` / the IntersectionObserver only fires when the Browse tab is active. Either conditionally mount the Browse `TabsContent` (Radix unmounts inactive content by default — do NOT `forceMount`), or guard `loadMore` with `if (activeTab !== 'browse') return;`. Verify the sentinel is not in the DOM while on Connected.

  **Must NOT do**:
  - Do not show an app in both the pinned block and the paginated stream (dedupe).
  - Do not `forceMount` Browse content.
  - Do not change pagination page size or the gateway call signature.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`react-dashboard`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: Task 1

  **References**:
  - `dashboard/src/pages/ComposioConnections.tsx:62-137,230-306` — `loadCatalog`, infinite-scroll IntersectionObserver, `availableItems`/`browseItems` derivations, current Available + Browse sections.
  - `dashboard/src/pages/composio/SearchToolbar.tsx` — Browse toolbar (already used).
  - `dashboard/src/pages/composio/MarketplaceStates.tsx` — `SkeletonGrid`, `EmptySearchState`, `CatalogErrorState`.
  - `dashboard/src/pages/composio/IntegrationCard.tsx` — card with connectable ("Connect") vs non-connectable ("Not yet available") states already implemented.
  - WHY: Browse keeps all existing fetch/scroll machinery; the change is ordering (global pin + dedupe) + filtering the pinned set + guarding scroll against the inactive tab.

  **Acceptance Criteria**:
  - [ ] Connectable apps appear at the top of Browse; non-connectable ("Not yet available") appear after
  - [ ] No app appears twice (pinned + paginated dedupe)
  - [ ] Browse search filters both the pinned block and the catalog
  - [ ] Infinite scroll does not fire while Connected tab is active

  **QA Scenarios**:

  ```
  Scenario: Connectables pinned to top of Browse
    Tool: Playwright (CDP)
    Steps:
      1. Navigate and switch to Browse tab
      2. Query all cards; find index of last enabled "Connect" button and index of first disabled "Not yet available" button
      3. Assert lastConnectIndex < firstNotAvailableIndex (connectables precede unavailable)
    Expected Result: Connectable block precedes the non-connectable catalog
    Evidence: .sisyphus/evidence/task-4-browse-sort.png

  Scenario: Infinite scroll does NOT fire on Connected tab
    Tool: Playwright (CDP)
    Steps:
      1. On Connected tab, record baseline network requests
      2. Scroll to bottom of page
      3. Capture network; filter /composio/toolkits?cursor=
      4. Assert zero new cursor-paginated requests fired
    Expected Result: No loadMore while Browse inactive
    Evidence: .sisyphus/evidence/task-4-scroll-guard.txt

  Scenario: Browse search filters pinned connectables too
    Tool: Playwright (CDP)
    Steps:
      1. On Browse, type a query matching a connectable app (e.g. "notion") into search
      2. Assert URL has search=notion
      3. Assert pinned connectable block only shows matching apps (non-matching connectables hidden)
    Expected Result: Search filters pinned block + catalog uniformly
    Evidence: .sisyphus/evidence/task-4-browse-search-filter.png
  ```

  **Commit**: groups with Wave 2 — `feat(dashboard): unify Browse catalog with globally pinned connectable apps`

- [ ] 5. Empty states + per-tab loading skeletons

  **What to do**:
  - Connected tab empty state (zero connections): a card-shell with plain-language copy and a SINGLE CTA button "Browse apps" that switches to the Browse tab (Hick's Law — one action). Copy example: heading "You haven't connected any apps yet", one sentence on value ("Connect the tools you already use so your AI employees can work with them."), then the button. Reuse the existing empty copy concept from `ConnectedAppsZone.tsx` if present, upgraded to a button that calls `updateTab('browse')`.
  - Browse tab states: keep existing `SkeletonGrid` (loading), `CatalogErrorState` (error + retry), `EmptySearchState` (no search results). Ensure they render inside the Browse `TabsContent`.
  - Per-tab loading skeletons without layout shift: Connected shows a connected-style skeleton while `connectionsLoading`; Browse shows `SkeletonGrid` while catalog loads. Avoid a flash of empty state before data resolves (tie to the loading gates from Task 2).

  **Must NOT do**:
  - Do not add multiple CTAs to the Connected empty state.
  - Do not use technical jargon in empty-state copy.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`react-dashboard`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (integrates Tasks 2-4 output)
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3, 4

  **References**:
  - `dashboard/src/pages/composio/MarketplaceStates.tsx` — `SkeletonGrid`, `EmptySearchState`, `CatalogErrorState`.
  - `dashboard/src/pages/composio/ConnectedAppsZone.tsx` — current empty/loading handling for connected.
  - `dashboard/src/pages/ComposioConnections.tsx:145,270-304` — `isZone1Loading`, Browse state branching.
  - WHY: Empty/loading states are the polish that makes the smart-default + tab UX feel intentional rather than janky; the components exist and just need correct per-tab placement.

  **Acceptance Criteria**:
  - [ ] Connected empty state shows one "Browse apps" CTA that switches tabs
  - [ ] Browse loading shows `SkeletonGrid`; error shows retry; empty-search shows clear
  - [ ] No flash of empty state before data resolves

  **QA Scenarios**:

  ```
  Scenario: Deep-link to ?tab=connected with zero connections shows empty state (edge)
    Tool: Playwright (CDP) OR Vitest page-level (if no zero-connection tenant live)
    Steps:
      1. Render page with connections=[] and secrets=[] (mock) OR navigate a zero-connection tenant with &tab=connected
      2. Assert Connected tab is active AND empty-state heading visible (NOT a blank panel, NOT auto-redirect to Browse)
      3. Assert exactly one CTA button labeled "Browse apps"
      4. Click it; assert active tab becomes Browse
    Expected Result: Graceful empty state with single working CTA
    Evidence: .sisyphus/evidence/task-5-empty-connected.png
  ```

  **Commit**: groups with Wave 3 — `feat(dashboard): add per-tab empty states and loading skeletons for integrations`

- [ ] 6. Connected-tab category derivation + responsive/mobile

  **What to do**:
  - Derive Connected-tab categories client-side from the connected apps' own `categories` (union of `categories` across `connectedComposioApps`; custom apps may have a synthetic category like "Platform" or none). Feed this into the Connected `SearchToolbar` `categories` prop so chips reflect only what's actually connected. If a tenant has 0-1 categories, render no chips (or just "All") — avoid meaningless single-chip filters.
  - Responsive/mobile: verify the two-tab `TabsList` renders cleanly at 375px (both triggers visible, tappable, not clipped). Ensure the card grid collapses to `grid-cols-1` on mobile (existing `sm:grid-cols-2 lg:grid-cols-3` handles this — confirm). Ensure the toolbar (search + chips) wraps gracefully on narrow widths.

  **Must NOT do**:
  - Do not hardcode a category list — derive from connected apps.
  - Do not introduce a mobile-only component; use responsive Tailwind classes already in the codebase.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`react-dashboard`, `web-design-guidelines`] — `web-design-guidelines` for responsive/accessibility review of the tab strip and touch targets.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 7
  - **Blocked By**: Task 3

  **References**:
  - `dashboard/src/pages/ComposioConnections.tsx:75-81` — existing category extraction pattern (catMap from item.categories) to mirror for connected apps.
  - `dashboard/src/pages/composio/SearchToolbar.tsx:43-57` — category chip rendering; passing a derived `categories` list.
  - `dashboard/src/lib/types.ts` — `ComposioToolkit.categories: {slug,name}[]`.
  - WHY: Honors the user's "categories on Connected" request meaningfully (only real categories) and ensures the new tab strip is mobile-safe for non-technical users on phones.

  **Acceptance Criteria**:
  - [ ] Connected category chips derive from connected apps only
  - [ ] Tabs + grid + toolbar render cleanly at 375px

  **QA Scenarios**:

  ```
  Scenario: Mobile layout — tabs and grid at 375px
    Tool: Playwright (CDP)
    Steps:
      1. browser_resize to 375x812
      2. Navigate to integrations page
      3. Assert both "Connected apps" and "Browse apps" triggers are visible and not clipped (boundingBox within viewport width)
      4. Assert card grid uses a single column (one card per row)
    Expected Result: Clean responsive layout; no overflow
    Evidence: .sisyphus/evidence/task-6-mobile.png

  Scenario: Connected categories reflect connected apps only
    Tool: Vitest page-level OR Playwright
    Steps:
      1. With connected apps spanning categories X and Y (and NOT Z), render Connected tab
      2. Assert chips show X and Y; assert no chip for an unconnected category Z
    Expected Result: Category chips derived from actual connected apps
    Evidence: .sisyphus/evidence/task-6-connected-categories.txt
  ```

  **Commit**: groups with Wave 3 — `feat(dashboard): derive Connected-tab categories and ensure responsive tab layout`

- [x] 7. Extend Vitest page-level tab tests

  **What to do**:
  - Extend `dashboard/src/tests/composio-marketplace.test.tsx` (or add a sibling test file) with PAGE-LEVEL tests that render the real `ComposioConnections` with mocked gateway functions (`listComposioConnections`, `listComposioToolkits`, `listSecrets`, `getComposioConnectUrl`, `disconnectComposioApp`).
  - Cover: (a) smart default — connections present → Connected active; connections empty → Browse active; (b) tab switch updates `?tab` and default deletes the key; (c) Connected tab renders from the connections mock even when `catalogItems` is empty (pagination-bug regression guard — mock `connections=[notion]`, `catalog=[]`, assert Notion in Connected); (d) connectables pinned to top of Browse; (e) Connected empty state shows single "Browse apps" CTA; (f) Connected search/category filters connected list.
  - Treat the existing `MarketplaceZones` hand-rolled harness as legacy — do not rely on it for the new page-level assertions; render the actual page component.

  **Must NOT do**:
  - Do not delete existing passing component tests.
  - Do not test implementation details that would break on harmless refactors (assert visible behavior/DOM, not internal state).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — test authoring with mocking; correctness-focused.
  - **Skills**: [`react-dashboard`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (validates all prior tasks)
  - **Parallel Group**: Wave 4
  - **Blocks**: Final Wave
  - **Blocked By**: Tasks 2, 3, 4, 5, 6

  **References**:
  - `dashboard/src/tests/composio-marketplace.test.tsx` — existing component tests + `MarketplaceZones` harness (lines ~216-244) to learn the mocking setup.
  - `dashboard/src/pages/ComposioConnections.tsx` — the component under test.
  - `dashboard/src/lib/gateway.ts:583-631` — gateway functions to mock.
  - WHY: Metis flagged that current tests never render the real page or exercise tabs — the new logic (smart default, bug fix, pinning) is otherwise untested.

  **Acceptance Criteria**:
  - [ ] New page-level tests cover smart default (both directions), tab URL sync, bug-fix regression guard, connectable pinning, empty-state CTA, Connected filtering
  - [ ] `pnpm test -- --run` green (old + new)

  **QA Scenarios**:

  ```
  Scenario: Full unit suite passes with new page-level tests
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit 0 and composio-marketplace (+ new) tests pass
    Expected Result: All unit tests green
    Evidence: .sisyphus/evidence/task-7-unit-suite.txt
  ```

  **Commit**: groups with Wave 4 — `test(dashboard): add page-level tab tests for integrations redesign`

- [ ] 8. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists in `ComposioConnections.tsx` (read file). For each "Must NOT Have": grep the diff for forbidden patterns (backend edits, new hooks/abstractions, removed redirect, jargon copy) — reject with file:line if found. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality + Build** — `unspecified-high`
      Run `pnpm lint`, dashboard `tsc` (via `pnpm build` or `pnpm dashboard:build`), and `pnpm test -- --run`. Review changed files for: `as any`, dead code, leftover console.log, duplicated grid markup, over-abstraction. Confirm URL-state style is consistent file-wide.
      Output: `Lint [PASS/FAIL] | Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Live Playwright QA** — `unspecified-high` (+ `playwright` skill)
      Connect via CDP to real Chrome. Execute EVERY QA scenario from Tasks 2-6 against `localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003`. Capture all evidence to `.sisyphus/evidence/final-qa/`. Test cross-tab integration: connect a custom app from Browse → assert it moves to Connected; disconnect from Connected → assert it returns to Browse.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — everything specified was built, nothing beyond spec. Confirm only `ComposioConnections.tsx`, `composio/` sub-components, and the test file changed. Flag any backend/gateway/data-model edits or contamination of unrelated files.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- One commit per wave (or per logically-complete task group). Conventional commits, e.g.:
  - `refactor(dashboard): scaffold tabbed state + data sourcing for integrations page`
  - `feat(dashboard): split integrations into Connected and Browse tabs with smart default`
  - `feat(dashboard): add search+category toolbar and count badges to integration tabs`
  - `fix(dashboard): source connected apps from connections poll to fix pagination bug`
  - `test(dashboard): add page-level tab tests for integrations redesign`
- Pre-commit: `pnpm lint` + `pnpm test -- --run` (husky runs automatically; never `--no-verify`).

## Success Criteria

### Verification Commands

```bash
pnpm lint                 # Expected: clean
pnpm test -- --run        # Expected: all pass, 0 failures (composio-marketplace.test.tsx green)
pnpm dashboard:build      # Expected: tsc + vite build clean
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Two tabs with counts, URL-synced, smart default, no flicker
- [ ] Connected sourced from poll (bug fixed); both tabs filterable; connectables pinned global
- [ ] All Playwright scenarios pass with evidence
- [ ] Telegram completion notification sent
