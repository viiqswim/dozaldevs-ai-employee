# Learnings — Composio Marketplace Redesign

## [2026-06-11] Session Start

### SDK Contract (CRITICAL — verified against @composio/core@0.10.0)

- Method: `composio.toolkits.get({...})` — `.list()` does NOT exist
- Params (camelCase): `{ limit, sortBy: 'usage', managedBy: 'all', category?, cursor? }`
- Response (camelCase per item): `{ slug, name, isLocalToolkit, meta: { logo?, description?, categories?: {slug,name}[], toolsCount?, triggersCount? }, authSchemes?, composioManagedAuthSchemes?, noAuth? }`
- Type ref: `node_modules/@composio/core/dist/composio-DRl6WCI9.d.mts` (~:2484-2507 method, :537-555 params, :704-799 response)
- Catalog is cursor-paginated (not all 1000 in one call)

### Connectable Flag Rule

- "Connectable" must be cross-referenced from `composio.authConfigs.list()` (status ENABLED), NOT from `composioManagedAuthSchemes`
- The connect route fails with `TOOLKIT_NOT_CONFIGURED` for non-provisioned apps
- Today ≈ Notion + Gmail are connectable

### Existing Backend (do not modify OAuth logic)

- `src/gateway/routes/composio-oauth.ts` — connect + callback routes (already fixed in prior session)
- `src/gateway/routes/composio-admin.ts` — list connections, disconnect, usage endpoints
- `src/repositories/composio-connection-repository.ts` — `getActiveConnections(tenantId)`, `upsertConnection`
- `COMPOSIO_API_KEY=ak_b6ci2Ba-Oz60ZZn4qQ6I` in `.env`

### UI Component Inventory

- `dashboard/src/components/ui/` — Card, Badge, Button, Input, SearchableSelect, Dialog, ErrorBox, StatCard, Tooltip, Tabs, etc.
- `cn()` from `@/lib/utils` (clsx + tailwind-merge)
- Icons: `lucide-react`; Toast: `sonner`
- Tailwind v4 (no config file; oklch tokens in index.css)
- Visual refs: `ModelCatalogPage.tsx` (structure), `IntegrationsPage.tsx` (emerald connected badge), `PreflightPanel.tsx` (card grid)

### Pre-existing LSP Errors (UNRELATED — do not fix)

- `src/repositories/composio-connection-repository.ts` — `ComposioConnection` Prisma type missing
- `src/gateway/routes/composio-admin.ts` — `taskComposioCall` missing on Prisma client
- `vitest.config.ts` — `coverage` key type error

## [2026-06-11] Integration Test — composio-catalog.test.ts

### Test harness pattern (mirrors composio-oauth.test.ts)
- supertest + bare `express()` app mounting only `composioCatalogRoutes(...)` — no full `buildApp()`
- SERVICE_TOKEN bypass: set `process.env.SERVICE_TOKEN` in beforeEach, send `Authorization: Bearer <token>`. No Supabase JWT needed.
- `composio` is injectable via route opts (`{ composio, prisma }`) — pass a `{ toolkits:{get}, authConfigs:{list} }` mock with `as never`.

### Cache isolation gotcha (the key design decision)
- `composio-catalog.ts` holds module-level `pageCache` (Map) + `connectableCache` that persist across requests AND across tests.
- Solution: `vi.resetModules()` in beforeEach + **dynamic** `await import('.../composio-catalog.js')` inside the app factory. Each test gets fresh caches. A static top-level import would leak cache state between tests — do NOT "simplify" it.

### Repository mocking
- The route constructs `new ComposioConnectionRepository(prisma)` internally — no injection seam for it (only `composio` is injectable).
- Mock via `vi.mock('../../src/repositories/composio-connection-repository.js', ...)` with a `vi.hoisted()` mock fn so each test controls `getActiveConnections`. Pass `prisma: {} as unknown as PrismaClient` since it's never touched.

### Error path
- SDK rejection (no cached fallback) → `sendError(res, 502, 'EXTERNAL_SERVICE_ERROR', ...)`. The route logs `logger.error` before returning — the error log line in test output is expected, not a failure.
- Group 5 asserts the raw SDK error message does NOT leak into the response body.

### Run command
- `npx vitest run --config vitest.integration.config.ts tests/integration/composio-catalog.test.ts` → 6 passed
- ESLint clean (exit 0). LSP/typescript-language-server was unavailable locally (`.tool-versions` nodejs not set) — used eslint + vitest as the diagnostics substitute.

## [2026-06-11] Dashboard Component Tests — composio-marketplace.test.tsx

### Test harness facts (dashboard/)
- `@testing-library/user-event` is NOT installed — use `fireEvent` from `@testing-library/react` instead.
- `vitest.config.ts` has `globals: true`, so `describe/test/expect/vi/beforeEach/afterEach` are ambient — no imports needed.
- Setup file `src/tests/setup.ts` only imports `@testing-library/jest-dom` → matchers like `toBeInTheDocument`, `toBeDisabled`, `toHaveAttribute` are available.
- `@/` alias resolves to `dashboard/src/`; relative `../` imports also work (mirror approval-section.test.tsx).
- LSP `typescript-language-server` is unavailable locally (no nodejs in `.tool-versions`) — vitest run is the type-check substitute.

### Component-under-test gotchas
- IntegrationCard "Connect" button label is `Connect {toolkit.name}` (e.g. "Connect Notion"), not bare "Connect". Match with `/connect notion/i`.
- Letter-avatar fallback fires when `!toolkit.logo` (null OR empty string). It has `aria-hidden="true"` but the letter `<span>` text is still queryable via `getByText('N')`. No `<img>` is rendered → assert `queryByRole('img')` is null.
- When logo is set, `<img alt="{name} logo">` → `getByRole('img')` + `alt` assertion works.
- "Not yet available" button is `disabled` and wrapped in a Radix Tooltip span; `getByRole('button', { name: /not yet available/i })` still finds it.

### Page-logic isolation pattern (avoids mounting full ComposioConnections page)
- ComposioConnections uses usePoll + useSearchParams + IntersectionObserver — too heavy to mount cleanly.
- Instead, replicate the exact derivation inline in tiny test harness components:
  - dedup: `connectedSlugs = new Set(connections.map(c => c.toolkit.toLowerCase()))`; `availableItems = catalog.filter(t => t.connectable && !connectedSlugs.has(t.slug.toLowerCase()))`.
  - ConnectedAppsZone filters `toolkits.filter(t => t.connected)` internally — pass full catalog + connections.
- Test search/category filters directly against `SearchToolbar` (pure, prop-driven) — it fires `onSearchChange`/`onCategoryChange`, chips use `aria-pressed`.
- EmptySearchState is a pure component in MarketplaceStates.tsx: renders `No apps match "{query}"` + "Clear search" button.

### listComposioToolkits unit test
- Mock global fetch via `vi.stubGlobal('fetch', mockFetch)` in beforeEach + `vi.unstubAllGlobals()` in afterEach.
- Return `{ ok: true, json: async () => page } as Response`.
- gateway.ts builds URL `/admin/tenants/{id}/composio/toolkits?search=&category=&limit=` — assert via `mockFetch.mock.calls[0][0]`.

### Result: 15 tests, all green. `npx vitest run src/tests/composio-marketplace.test.tsx` (run from dashboard/).
