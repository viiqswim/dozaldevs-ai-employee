# Composio Integrations Marketplace Redesign

## TL;DR

> **Quick Summary**: Redesign the standalone Composio page (`ComposioConnections.tsx`) into a Zapier/Make.com-style browsable app marketplace — backed by a new cursor-paginated catalog endpoint — while leaving every other custom integration untouched.
>
> **Deliverables**:
>
> - New read-only catalog endpoint `GET /admin/tenants/:tenantId/composio/toolkits` (cursor-paginated, in-memory cached, cross-references provisioned auth configs for a `connectable` flag)
> - `listComposioToolkits()` gateway client function
> - Full marketplace redesign: 3 zones (Connected / Available now / Browse all infinite-scroll), `IntegrationCard`, search + category chips, disconnect `Dialog`, skeleton/empty/error states, a11y, lazy logos
> - Denylist removal (`COMPOSIO_DENIED_TOOLKITS` deleted from route + env + docs — allow all apps)
> - Backend integration test + component tests + agent-executed Playwright QA
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (types) → Task 2 (catalog endpoint) → Task 4 (gateway client) → Task 7 (page assembly) → Task 11 (infinite scroll) → Final QA Wave → user okay

---

## Context

### Original Request

"Create a nicer integrations page. Think about what's offered by Zapier, Make.com, and similar. Change just the Composio one, not the custom integrations we have. Find a UI/UX best-practices skill first."

### Interview Summary

**Key Discussions / Decisions**:

- Vision: browsable marketplace (searchable grid w/ logos + categories), not a curated short list.
- Scope: Composio-only. Custom integrations (Slack, Hostfully, GitHub, Google, Jira) frozen.
- Placement: standalone page at `/dashboard/integrations/composio`.
- Visual ambition: best-in-class / full polish.
- Catalog coverage: show all apps via infinite scroll; only provisioned apps get a live Connect button; everything else "Not yet available"/"Request".
- Denylist: remove entirely — allow all apps.
- Tests: full (backend integration + component + Playwright).

**Research Findings**:

- Catalog feasible via `composio.toolkits.get({ limit, sortBy, managedBy, cursor })` — cursor-paginated (~1000 apps total).
- "Connectable now" must cross-reference `composio.authConfigs.list()` (ENABLED) — the connect route fails with `TOOLKIT_NOT_CONFIGURED` otherwise. Today ≈ Notion + Gmail.
- Reuse: `ModelCatalogPage.tsx` (page structure), `IntegrationsPage.tsx` (emerald connected badge), `PreflightPanel.tsx` (card grid), `usePoll` (fetching), `Card`/`Badge`/`Button`/`Input`/`SearchableSelect`/`Dialog`/`ErrorBox`/`StatCard`.
- UX patterns from Zapier/Make/Linear/Vercel/Slack/Notion/Segment cataloged (2-section layout, card anatomy, button states, search+chips, empty states, disconnect confirm modal, non-technical microcopy).

### Metis Review

**Identified Gaps** (addressed):

- SDK method is `toolkits.get()` not `.list()`; params are camelCase (`sortBy`/`managedBy`); response is camelCase (`meta.logo`, `meta.categories` is `{slug,name}[]`, `composioManagedAuthSchemes`, `noAuth`). Type ref: `node_modules/@composio/core/dist/composio-DRl6WCI9.d.mts`.
- Catalog is cursor-paginated → infinite-scroll endpoint (user decision).
- `connectable` must come from `authConfigs.list()`, not catalog flags (user decision).
- Denylist removal is the single sanctioned edit to `composio-oauth.ts` (user decision).
- Catalog endpoint is global (tenant-agnostic data) but mounted tenant-scoped for auth consistency.
- Edge cases adopted: fetch failure, 429, missing logo, dedup connected, perf with 1000 lazy `<img>`, empty search, popup blocked, dark-mode logo contrast, tenant switch.

---

## Work Objectives

### Core Objective

Transform the Composio page into a polished, browsable app marketplace (3 zones: Connected / Available now / Browse all) backed by a real cursor-paginated catalog endpoint, with full a11y and verification — touching nothing outside the Composio surface (except the sanctioned denylist removal).

### Concrete Deliverables

- `src/gateway/routes/composio-catalog.ts` (or extend `composio-admin.ts`) — `GET /admin/tenants/:tenantId/composio/toolkits`.
- In-memory catalog cache module.
- `dashboard/src/lib/gateway.ts` — `listComposioToolkits()`.
- `dashboard/src/lib/types.ts` — `ComposioToolkit` type.
- `dashboard/src/pages/ComposioConnections.tsx` — rebuilt 3-zone marketplace.
- `dashboard/src/pages/composio/IntegrationCard.tsx` (+ supporting subcomponents).
- Denylist removed from `src/gateway/routes/composio-oauth.ts`, `.env`, `.env.example`, AGENTS.md, README.md.
- `tests/integration/composio-catalog.test.ts`, dashboard component tests.

### Definition of Done

- [ ] `pnpm build` (TS) passes — no wrong SDK field names.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test:unit` + new integration test pass.
- [ ] Page at `http://localhost:7700/dashboard/integrations/composio?tenant=00000000-0000-0000-0000-000000000003` renders the 3-zone marketplace with rendered logos and >50 browseable cards.
- [ ] Final Verification Wave (F1–F4) all APPROVE, then explicit user okay.

### Must Have

- New cursor-paginated catalog endpoint with in-memory cache + `connectable` flag from `authConfigs.list()`.
- 3-zone layout; infinite scroll on Browse-all.
- `SearchableSelect` for any dropdown; `Dialog` disconnect modal; URL-encoded search/category preserving `?tenant=`.
- Lazy logos + letter-avatar fallback; a11y (aria-labels, focus-visible, aria-live).
- Denylist fully removed.
- Non-technical microcopy throughout.

### Must NOT Have (Guardrails)

- NO changes to Slack/Hostfully/GitHub/Google/Jira integrations (code or visuals).
- NO changes to `IntegrationsPage.tsx` beyond leaving the existing Composio "Manage" link intact.
- NO changes to the OAuth connect/callback logic EXCEPT removing the denylist check.
- NO DB schema change; NO wiring of the `task_composio_calls`/usage table.
- NO category taxonomy/management system (derive chips from `meta.categories` as-is).
- NO bulk-connect, favorites, recently-used.
- NO new state/data library (react-query, zustand) — use existing `usePoll`.
- NO generic cross-provider catalog abstraction — Composio-specific only.
- NO Radix `Select` for user-facing dropdowns.
- NO `composio.toolkits.list()` (does not exist) and NO snake_case SDK params/fields.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest; `tests/integration/`, dashboard component tests).
- **Automated tests**: YES (tests-after) — backend integration + component tests.
- **Framework**: vitest. Backend integration test mocks the Composio SDK.
- **Playwright QA**: MANDATORY against the live dashboard at port 7700.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence → `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Frontend/UI**: Playwright (playwright skill) — navigate, interact, assert DOM, screenshot.
- **API/Backend**: Bash (curl) + vitest integration test with mocked SDK.

### Build / Verify Loop

- `pnpm dev` serves dashboard at `http://localhost:7700/dashboard/` (HMR via Vite proxy). **Use 7700, never 7701.**
- Gateway route changes picked up by `tsx watch` — confirm live via `curl localhost:7700/health`.
- Production-mode check (if needed): `pnpm dashboard:build` to refresh `dashboard/dist/`.
- No Docker rebuild (touches `src/gateway/` + `dashboard/` only).
- If Prisma LSP errors surface (`ComposioConnection` missing): run `pnpm prisma generate`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — contracts & primitives):
├── Task 1: ComposioToolkit type + SDK contract constants [quick]
├── Task 2: Catalog endpoint (cursor-paginated, cache, connectable flag) [deep]
├── Task 3: Remove denylist (route + env + docs) [quick]
└── Task 5: IntegrationCard component (logo/fallback/state buttons) [visual-engineering]

Wave 2 (After Wave 1 — client + page sections):
├── Task 4: gateway.ts listComposioToolkits client fn (depends: 1, 2) [quick]
├── Task 6: Connected-apps zone + disconnect Dialog (depends: 5) [visual-engineering]
├── Task 8: Search bar + category chips + URL state (depends: 5) [visual-engineering]
└── Task 9: Empty/loading/error/popup-blocked states (depends: 5) [visual-engineering]

Wave 3 (After Wave 2 — assembly & polish):
├── Task 7: Page assembly — 3-zone layout wiring (depends: 4, 6, 8, 9) [visual-engineering]
├── Task 10: Available-now zone + connectable dedup logic (depends: 4, 7) [deep]
├── Task 11: Browse-all infinite scroll + lazy logos + perf (depends: 4, 7) [visual-engineering]
└── Task 12: a11y pass + non-technical copy + dark-mode logo contrast (depends: 7) [visual-engineering]

Wave 4 (After Wave 3 — tests):
├── Task 13: Backend integration test (mock SDK) [unspecified-high]
└── Task 14: Component tests (search/filter/dedup/states) [unspecified-high]

Wave FINAL (after ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — Playwright (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: 1 → 2 → 4 → 7 → 11 → F1-F4 → user okay
```

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `deep`, T3 → `quick`, T5 → `visual-engineering`
- **Wave 2**: T4 → `quick`, T6/T8/T9 → `visual-engineering`
- **Wave 3**: T7/T11/T12 → `visual-engineering`, T10 → `deep`
- **Wave 4**: T13/T14 → `unspecified-high`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`+`playwright`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. EVERY task has Recommended Agent Profile + Parallelization + QA Scenarios.

- [x] 1. ComposioToolkit type + SDK contract constants

  **What to do**:
  - Add a `ComposioToolkit` interface to `dashboard/src/lib/types.ts` matching the API response the new endpoint will return: `{ slug: string; name: string; logo: string | null; description: string | null; categories: { slug: string; name: string }[]; toolsCount: number | null; connectable: boolean; connected: boolean }`.
  - Add a `ComposioToolkitsPage` type for the paginated response: `{ items: ComposioToolkit[]; nextCursor: string | null }`.
  - In the backend, define a small constant/comment block documenting the verified SDK contract (method `composio.toolkits.get`, camelCase params `{ limit, sortBy, managedBy, category, cursor }`, camelCase response fields `meta.logo/meta.description/meta.categories[{slug,name}]/meta.toolsCount`, `composioManagedAuthSchemes`, `noAuth`).

  **Must NOT do**: Do NOT use `toolkits.list()` or snake_case fields. Do NOT add fields the UI won't use (no `triggersCount`, `authSchemes` unless needed for the connectable flag).

  **Recommended Agent Profile**:
  - **Category**: `quick` — small, isolated type + constant additions.
  - **Skills**: [] — no domain skill needed; types only.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 1.
  - **Blocks**: Task 4 (gateway client), Task 2 (endpoint shape).
  - **Blocked By**: None.

  **References**:
  - `dashboard/src/lib/types.ts:410-413` — existing `ComposioConnection` interface; add the new types nearby in the same style.
  - `node_modules/@composio/core/dist/composio-DRl6WCI9.d.mts` (~:704-799) — authoritative response shape (camelCase). Extract field names from here, do not guess.
  - Why: the type is the contract every other task builds against; getting camelCase right here prevents downstream `pnpm build` failures.

  **Acceptance Criteria**:
  - [ ] `dashboard/src/lib/types.ts` exports `ComposioToolkit` and `ComposioToolkitsPage`.
  - [ ] `pnpm build` passes (types compile).

  **QA Scenarios**:

  ```
  Scenario: Types compile and match SDK camelCase contract
    Tool: Bash
    Steps:
      1. Run `pnpm build` (or `tsc --noEmit`).
      2. Grep the new types for any snake_case field (tools_count, auth_schemes) — must be none.
    Expected Result: Build passes; grep returns zero snake_case matches in the new types.
    Evidence: .sisyphus/evidence/task-1-types-build.txt
  ```

  **Commit**: groups with feat(composio catalog endpoint).

- [x] 2. Catalog endpoint — cursor-paginated, cached, connectable flag

  **What to do**:
  - Add `GET /admin/tenants/:tenantId/composio/toolkits` (new file `src/gateway/routes/composio-catalog.ts`, or extend `composio-admin.ts`). Auth: `authMiddleware` + `requireAuth` + `requireTenantRole(MEMBER)` (read).
  - Accept query params: `cursor?` (string), `search?` (string), `category?` (string), `limit?` (default 24).
  - Call `composio.toolkits.get({ limit, sortBy: 'usage', managedBy: 'all', cursor, category })`. Pass `search` through if the SDK supports it; otherwise filter server-side on name/description for the current page.
  - Cross-reference connectable: fetch `composio.authConfigs.list()` (status ENABLED), build a `Set<toolkitSlug>`; mark each toolkit `connectable = slugSet.has(toolkit.slug)`. Cache the authConfigs set in-memory (~1h) — do NOT call it per request.
  - Cross-reference connected: fetch active connections for the tenant (reuse `ComposioConnectionRepository.getActiveConnections`); mark `connected` per slug.
  - Map SDK item → `ComposioToolkit` (camelCase → API shape). Return `{ items, nextCursor }` via `sendSuccess`.
  - In-memory cache keyed by `cursor+search+category` (~1h TTL). On Composio 429 or error, serve last-good cached page if present, else `sendError(502, ...)`.

  **Must NOT do**: Do NOT loop all pages server-side (infinite scroll is client-driven). Do NOT make the catalog data tenant-filtered (catalog is global; only `connectable`/`connected` are tenant/project-derived). Do NOT touch connect/callback handlers.

  **Recommended Agent Profile**:
  - **Category**: `deep` — SDK integration, caching, two cross-reference merges, error/429 handling.
  - **Skills**: [`api-design`, `data-access-conventions`] — sendError/sendSuccess, tenant-scoped route conventions, repository access, makePostgrestHeaders.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 1 (independent of UI tasks).
  - **Blocks**: Task 4, Task 10.
  - **Blocked By**: Task 1 (response type) — can start scaffolding immediately, finalize mapping once Task 1 lands.

  **References**:
  - `src/gateway/routes/composio-admin.ts` — existing list-connections/disconnect/usage routes; mirror the structure, auth middleware, and `sendSuccess` usage. Add the new route here or in a sibling file registered the same way.
  - `src/gateway/routes/composio-oauth.ts:62-83` — how the real client is constructed (`new Composio({ apiKey })`) and how `authConfigs.list()` + `toolkit.slug` matching already works; reuse the same connectable logic for consistency.
  - `src/repositories/composio-connection-repository.ts` — `getActiveConnections(tenantId)` for the `connected` flag.
  - `src/lib/config.ts:104` — `COMPOSIO_API_KEY()` accessor.
  - `node_modules/@composio/core/dist/composio-DRl6WCI9.d.mts` (~:537-555 params, :704-799 response) — exact method + field names.
  - `.opencode/skills/api-design` — `sendError`/`sendSuccess`, `ERROR_CODES`, UUID_REGEX param validation, tenant-scoped route registration.
  - Why: this endpoint is the spine of the marketplace; the connectable cross-ref is the non-obvious correctness requirement Metis flagged.

  **Acceptance Criteria**:
  - [ ] `curl` the endpoint returns `{ items: [...], nextCursor }` with camelCase-mapped fields.
  - [ ] Each item has a boolean `connectable` and `connected`.
  - [ ] Second identical request within TTL does not re-invoke the SDK (verified in the integration test, Task 13).

  **QA Scenarios**:

  ```
  Scenario: Endpoint returns a paginated catalog page with connectable flags
    Tool: Bash (curl)
    Preconditions: gateway live (curl localhost:7700/health), SERVICE_TOKEN set.
    Steps:
      1. curl -H "Authorization: Bearer $SERVICE_TOKEN" "localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/composio/toolkits?limit=24"
      2. Parse JSON: assert items.length > 0, each item has slug/name/connectable/connected, and nextCursor is string|null.
      3. Assert notion item exists and connectable=true (auth config provisioned).
    Expected Result: 200 with well-formed paginated page; notion connectable.
    Evidence: .sisyphus/evidence/task-2-catalog-curl.json

  Scenario: SDK failure returns structured error, not a 500 crash
    Tool: Bash + vitest (covered in Task 13 with mocked SDK throwing)
    Steps:
      1. In the integration test, mock toolkits.get to reject.
      2. Assert response status 502 and body has a structured error code (sendError), not an unhandled 500.
    Expected Result: 502 structured error.
    Evidence: .sisyphus/evidence/task-2-error-path.txt
  ```

  **Commit**: groups with feat(composio catalog endpoint).

- [x] 3. Remove toolkit denylist (allow all apps)

  **What to do**:
  - Remove the `COMPOSIO_DENIED_TOOLKITS` array and its check from `src/gateway/routes/composio-oauth.ts` (the connect handler). Any toolkit may now be connected.
  - Remove `COMPOSIO_DENIED_TOOLKITS` from `.env` and `.env.example` (Composio section).
  - Update docs that reference the denylist: AGENTS.md (Composio env var section + Composio tool description) and README.md (Composio env section). State that all apps are allowed.
  - Leave the rest of the connect/callback logic (dynamic authConfig lookup, `allowMultiple`, `callbackUrl`) exactly as-is.

  **Must NOT do**: Do NOT alter the OAuth link/callback flow logic. Do NOT remove the `TOOLKIT_NOT_CONFIGURED` guard (that's correct behavior). Do NOT touch any other env var.

  **Recommended Agent Profile**:
  - **Category**: `quick` — deletion + doc sync.
  - **Skills**: [`security`] — touching an auth/connect route and removing a guardrail; ensure no other isolation boundary is affected and env-var rules (both files) are followed.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 1.
  - **Blocks**: None (UI shows all apps regardless; this unblocks actual connection of non-denied apps).
  - **Blocked By**: None.

  **References**:
  - `src/gateway/routes/composio-oauth.ts:13-23` (denylist array) and `:55-60` (the `COMPOSIO_DENIED_TOOLKITS.includes(...)` check) — remove both.
  - `.env.example` Composio section + `.env` Composio section — remove `COMPOSIO_DENIED_TOOLKITS`.
  - AGENTS.md — Composio rows in the env-vars and shell-tools sections mention the denylist; README.md Composio env section likewise. Update both.
  - `.opencode/skills/security` — env-var both-files rule, guardrail-removal awareness.
  - Why: user explicitly chose to allow all apps; this is the one sanctioned edit to the OAuth route, and the env/doc sync is mandatory per repo rules.

  **Acceptance Criteria**:
  - [ ] `grep -r COMPOSIO_DENIED_TOOLKITS src/ .env .env.example` returns zero matches.
  - [ ] AGENTS.md + README no longer describe a denylist.
  - [ ] `pnpm build` passes.

  **QA Scenarios**:

  ```
  Scenario: Denylist fully removed across code, env, and docs
    Tool: Bash
    Steps:
      1. grep -rn "COMPOSIO_DENIED_TOOLKITS" src/ .env .env.example AGENTS.md README.md
      2. Assert zero matches.
      3. Run pnpm build — passes (no dangling reference).
    Expected Result: No matches anywhere; build green.
    Evidence: .sisyphus/evidence/task-3-denylist-removed.txt

  Scenario: A previously-denied toolkit is no longer rejected at connect time
    Tool: Bash (curl) — only meaningful if an auth config exists; otherwise expect TOOLKIT_NOT_CONFIGURED, NOT TOOLKIT_DENIED
    Steps:
      1. curl the connect endpoint with toolkit=github.
      2. Assert the error (if any) is TOOLKIT_NOT_CONFIGURED, never TOOLKIT_DENIED.
    Expected Result: No TOOLKIT_DENIED response path remains.
    Evidence: .sisyphus/evidence/task-3-no-denied.txt
  ```

  **Commit**: `feat(composio): remove toolkit denylist, allow all apps`.

- [x] 4. gateway.ts `listComposioToolkits` client function

  **What to do**:
  - Add `listComposioToolkits(tenantId: string, opts?: { cursor?: string; search?: string; category?: string; limit?: number }): Promise<ComposioToolkitsPage>` to `dashboard/src/lib/gateway.ts`.
  - Build the query string (cursor/search/category/limit), call `GET /admin/tenants/${tenantId}/composio/toolkits`, return the parsed `{ items, nextCursor }`.
  - Follow the exact fetch/error pattern of the existing Composio functions in the same file.

  **Must NOT do**: Do NOT add a `listComposioUsage` function (usage table is empty/deferred). Do NOT introduce a new fetch wrapper.

  **Recommended Agent Profile**:
  - **Category**: `quick` — one client function mirroring existing ones.
  - **Skills**: [] — follows established gateway.ts pattern.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 2 (after types + endpoint shape exist).
  - **Blocks**: Task 7, Task 10, Task 11.
  - **Blocked By**: Task 1 (types), Task 2 (endpoint).

  **References**:
  - `dashboard/src/lib/gateway.ts:554-581` — `listComposioConnections`, `getComposioConnectUrl`, `disconnectComposioApp`; copy the request/error style and place the new fn adjacent.
  - `dashboard/src/lib/types.ts` — `ComposioToolkitsPage` from Task 1.
  - Why: this is the single data source the page sections consume; matching the existing pattern keeps error handling consistent with `usePoll`.

  **Acceptance Criteria**:
  - [ ] `listComposioToolkits` exported with correct signature.
  - [ ] Returns `{ items, nextCursor }` typed as `ComposioToolkitsPage`.
  - [ ] `pnpm build` passes.

  **QA Scenarios**:

  ```
  Scenario: Client function fetches a catalog page
    Tool: Bash (component test harness in Task 14 exercises it) + build check
    Steps:
      1. pnpm build passes with the new function typed against ComposioToolkitsPage.
      2. Task 14 component test mocks fetch and asserts listComposioToolkits parses items + nextCursor.
    Expected Result: Typed function compiles and parses the paginated shape.
    Evidence: .sisyphus/evidence/task-4-client-build.txt
  ```

  **Commit**: groups with feat(composio catalog endpoint).

- [x] 5. `IntegrationCard` component (logo, fallback, state buttons)

  **What to do**:
  - Create `dashboard/src/pages/composio/IntegrationCard.tsx` rendering a single app tile: 48×48 logo in a rounded-lg neutral tile (light bg for dark-mode contrast), name (`font-medium text-sm`), optional "Official"/vendor line (`text-xs text-muted-foreground`), one-line action-oriented description (`line-clamp-2`), a category `Badge variant="secondary"`, and a right-aligned action button reflecting state.
  - Button states: `connected` → emerald "✓ Connected" badge + ghost "Disconnect"; `connectable && !connected` → outline "Connect {Name}" (Title Case, specific label); `!connectable` → disabled "Not yet available" (with tooltip "Coming soon — ask to enable this app") OR a "Request" affordance.
  - Logo: `<img width={48} height={48} loading="lazy" alt={`${name} logo`} />`; on error/missing, render a letter-avatar fallback (first char of name on a colored tile).
  - Card shell: `rounded-lg border bg-card px-5 py-4 flex flex-col gap-3` with `hover:` elevation/border feedback and `focus-within` ring. Props: `toolkit: ComposioToolkit`, `onConnect`, `onDisconnect`.

  **Must NOT do**: Do NOT embed data fetching in the card. Do NOT use Radix `Select`. Do NOT hardcode app names/logos.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — presentational component with multiple visual states + a11y.
  - **Skills**: [`react-dashboard`, `web-design-guidelines`] — card shell rule, non-technical copy; a11y (img alt/dimensions, aria-label on icon buttons, focus-visible, hover states).

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 1 (pure presentational, depends only on the type).
  - **Blocks**: Tasks 6, 8, 9, 10, 11.
  - **Blocked By**: Task 1 (type) — can stub the prop type meanwhile.

  **References**:
  - `dashboard/src/panels/integrations/IntegrationsPage.tsx` — emerald connected badge (`border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100`) and the row layout to adapt into a card.
  - `dashboard/src/panels/preflight/PreflightPanel.tsx` — `<Card>` grid tile pattern.
  - `dashboard/src/components/ui/{card,badge,button,tooltip}.tsx` — primitives + variants.
  - `.opencode/skills/react-dashboard` (card shell, non-technical copy) and `web-design-guidelines` (img dimensions/alt/lazy, aria-label, focus-visible, hover, Title Case labels).
  - Why: this is the atomic unit reused across all three zones; getting states + a11y right here propagates everywhere.

  **Acceptance Criteria**:
  - [ ] Renders all three button states correctly from props.
  - [ ] Logo has width/height/alt/lazy; missing logo → letter-avatar fallback.
  - [ ] Icon-only controls (if any) have `aria-label`; card is keyboard-focusable with visible ring.

  **QA Scenarios**:

  ```
  Scenario: Card renders correct state per toolkit (component test in Task 14)
    Tool: vitest component test
    Steps:
      1. Render with connected=true → assert "✓ Connected" + Disconnect present.
      2. Render with connectable=true, connected=false → assert "Connect {Name}" button.
      3. Render with connectable=false → assert disabled "Not yet available".
      4. Render with logo="" → assert letter-avatar fallback (no broken <img>).
    Expected Result: All four variants render the correct affordance.
    Evidence: .sisyphus/evidence/task-5-card-states.txt

  Scenario: Card a11y — logo + focus (Playwright in final QA)
    Tool: Playwright
    Steps:
      1. On the live page, assert a card logo <img> has width/height attrs and alt text.
      2. Tab to a card's action button → assert visible focus-visible ring.
    Expected Result: Dimensions+alt present; focus ring visible.
    Evidence: .sisyphus/evidence/task-5-card-a11y.png
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 6. Connected-apps zone + disconnect Dialog

  **What to do**:
  - Build the "Your connected apps" zone (top of the page) inside a `rounded-lg border bg-card px-5 py-4` section: a small grid of `IntegrationCard`s for active connections (from `listComposioConnections`), each showing the emerald Connected badge + Disconnect.
  - Replace the current `window.confirm` disconnect with a `Dialog` modal. Copy (non-technical): title "Disconnect {AppName}?", body "This will stop {AppName} from working with your account. Your existing data won't be deleted.", actions [Cancel] [Disconnect] (destructive). On confirm → `disconnectComposioApp` → success toast → refresh; Cancel → close, no network call.
  - Show a count, e.g. `StatCard`/heading "Connected apps · {N}".

  **Must NOT do**: Do NOT use `window.confirm`. Do NOT show disconnected/expired apps here (only active).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — section + modal interaction.
  - **Skills**: [`react-dashboard`, `web-design-guidelines`] — card shell, dialog a11y (focus trap, overscroll-contain), non-technical copy.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 2.
  - **Blocks**: Task 7 (assembly).
  - **Blocked By**: Task 5 (card).

  **References**:
  - `dashboard/src/pages/ComposioConnections.tsx:82-126 (current disconnect/connection rendering)` — existing handlers/state to migrate; replace `window.confirm` (line ~85).
  - `dashboard/src/components/ui/dialog.tsx` — Dialog/DialogContent/Header/Footer/Title/Description.
  - `dashboard/src/components/ui/stat-card.tsx` — count tile.
  - `web-design-guidelines` — destructive action needs confirmation; modal `overscroll-behavior: contain`; aria-live on success toast.
  - Why: disconnect is the only destructive flow; the modal is both a UX upgrade and a guidelines requirement.

  **Acceptance Criteria**:
  - [ ] Connected zone lists only active connections as cards.
  - [ ] Disconnect opens a `Dialog` (role="dialog"), not `window.confirm`.
  - [ ] Cancel closes with no network request; Confirm disconnects + toasts + refreshes.

  **QA Scenarios**:

  ```
  Scenario: Disconnect uses a Dialog with working cancel (Playwright)
    Tool: Playwright
    Preconditions: tenant 00000000-0000-0000-0000-000000000003 has notion connected.
    Steps:
      1. Navigate to the page; locate the connected Notion card.
      2. Click "Disconnect" → assert a dialog (role="dialog") appears with the non-technical copy.
      3. Click "Cancel" → assert dialog closes AND no DELETE request was made (network log).
    Expected Result: Dialog appears; cancel makes no network call.
    Evidence: .sisyphus/evidence/task-6-disconnect-dialog.png

  Scenario: Empty connected zone
    Tool: Playwright (or component test with zero connections)
    Steps:
      1. With no active connections, assert the connected zone shows a friendly empty hint, not a blank box.
    Expected Result: Non-technical empty message rendered.
    Evidence: .sisyphus/evidence/task-6-connected-empty.png
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 7. Page assembly — 3-zone layout wiring

  **What to do**:
  - Rebuild `dashboard/src/pages/ComposioConnections.tsx` as the marketplace shell following `ModelCatalogPage` structure: page wrapper `p-6 max-w-5xl space-y-6`; header card (title "Connected Apps" / non-technical subtitle); then the three zones in order — (1) Connected (Task 6), (2) "Available to connect now" (Task 10), (3) "Browse all apps" with search/chips toolbar (Task 8) + infinite-scroll grid (Task 11).
  - Wire data: `usePoll` for connections; `listComposioToolkits` for catalog (first page on mount). Pass shared handlers (connect → `getComposioConnectUrl` + `window.open` + popup-blocked handling from Task 9; disconnect via Task 6 dialog).
  - Dedup: compute connected slug set; exclude connected apps from available/browse grids.

  **Must NOT do**: Do NOT touch `IntegrationsPage.tsx` or its route. Do NOT introduce tabs (single scrolling page with 3 zones). Do NOT add a new data library.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — composition + state wiring of the zones.
  - **Skills**: [`react-dashboard`, `web-design-guidelines`] — card shells, URL state, non-technical copy.

  **Parallelization**:
  - **Can Run In Parallel**: NO until its deps land — Wave 3 anchor.
  - **Blocks**: Tasks 10, 11, 12 (they slot into this shell).
  - **Blocked By**: Tasks 4, 6, 8, 9.

  **References**:
  - `dashboard/src/pages/ModelCatalogPage.tsx` — header card + toolbar card + content card structure, loading/error/empty patterns. PRIMARY structural template.
  - `dashboard/src/pages/ComposioConnections.tsx` — current file to replace; preserve the `tenantId` plumbing and `usePoll(fetchConnections)` usage.
  - `dashboard/src/lib/gateway.ts` — `listComposioToolkits` (Task 4), `getComposioConnectUrl`, `disconnectComposioApp`, `listComposioConnections`.
  - Why: this is the integration point; getting zone order + dedup right is what makes the page feel like a real marketplace.

  **Acceptance Criteria**:
  - [ ] Page renders three labeled zones in order; connected apps not duplicated in available/browse.
  - [ ] `?tenant=` preserved; route unchanged.
  - [ ] `pnpm build` + page loads at 7700 without console errors.

  **QA Scenarios**:

  ```
  Scenario: Three-zone marketplace renders (Playwright)
    Tool: Playwright
    Steps:
      1. Navigate to /dashboard/integrations/composio?tenant=00000000-0000-0000-0000-000000000003.
      2. Assert headings "Connected", "Available to connect now", "Browse all apps" all present.
      3. Assert a connected app (notion) appears ONLY in the connected zone (not in browse grid).
    Expected Result: 3 zones present; no duplicate of connected app.
    Evidence: .sisyphus/evidence/task-7-three-zones.png
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 8. Search bar + category chips + URL state

  **What to do**:
  - Build the Browse-all toolbar: a search `Input` with leading `Search` icon (ModelCatalogPage pattern: `relative` + `absolute left-2.5` icon + `pl-8`), placeholder "Search apps…" (ends with ellipsis), `spellCheck={false}`, `aria-label`.
  - Render category chips derived dynamically from the catalog's `meta.categories` (dedup across loaded items); an "All" chip resets. Chips are buttons with `aria-pressed`.
  - Encode `search` and `category` in the URL via `useSearchParams`, preserving existing params (esp. `?tenant=`) using the `prev.set(...)` pattern; use `{ replace: true }` for frequent updates. On change, refetch catalog first page with the new query (debounce search input).

  **Must NOT do**: Do NOT use Radix `Select` (if a dropdown is used for category instead of chips, use `SearchableSelect`). Do NOT clobber existing query params. Do NOT hardcode a category taxonomy.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — interactive toolbar + URL sync.
  - **Skills**: [`react-dashboard`, `web-design-guidelines`] — URL-encoded state rule (preserve params), input a11y, placeholder ellipsis.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 2.
  - **Blocks**: Task 7 (toolbar slots into shell), Task 11 (filtered fetch).
  - **Blocked By**: Task 5 (card, for visual context) — toolbar itself is independent.

  **References**:
  - `dashboard/src/pages/ModelCatalogPage.tsx` — search input + filter toolbar (`relative flex-1`, `Search` icon at `left-2.5`, `pl-8`).
  - `dashboard/src/components/layout/Layout.tsx` (`TenantUrlSync`) and `.opencode/skills/react-dashboard` §2 — canonical preserve-params `useSearchParams` pattern.
  - `dashboard/src/components/ui/searchable-select.tsx` — if category becomes a dropdown.
  - `web-design-guidelines` — placeholder ends with "…", `spellCheck={false}`, input needs label/aria-label, URL reflects filters.
  - Why: shareable/refresh-safe filter state is a hard repo rule and a guidelines requirement.

  **Acceptance Criteria**:
  - [ ] Typing in search updates `?search=` (debounced) and filters results; clearing restores.
  - [ ] Selecting a category updates `?category=` and filters; "All" resets.
  - [ ] `?tenant=` and other params are preserved across all toolbar interactions.

  **QA Scenarios**:

  ```
  Scenario: Search + category reflect in URL and survive refresh (Playwright)
    Tool: Playwright
    Steps:
      1. Type "noti" in search → assert grid shrinks AND URL contains search=noti AND tenant= still present.
      2. Click a category chip → assert URL contains category=... AND tenant= preserved.
      3. Reload the page → assert search/category filters persist from the URL.
      4. Clear search → assert grid restores and search param removed.
    Expected Result: Filters are URL-driven and refresh-safe; tenant preserved.
    Evidence: .sisyphus/evidence/task-8-url-filters.png
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 9. Empty / loading / error / popup-blocked states

  **What to do**:
  - Skeleton grid while the catalog/connections load (reuse the muted `animate-pulse` skeleton pattern).
  - Catalog fetch failure → `ErrorBox` with Retry (re-invokes `listComposioToolkits`).
  - Empty search/filter results → dedicated empty state: "No apps match '{query}'." with a clear-filters action.
  - First-run empty connected zone → friendly "Connect the tools you already use." hint.
  - Connect popup blocked: when `window.open` returns `null`, toast "Allow pop-ups for this site, then try again." (non-technical).

  **Must NOT do**: Do NOT render a blank grid for empty/error. Do NOT surface raw API error codes to users.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — state components + copy.
  - **Skills**: [`react-dashboard`, `web-design-guidelines`] — empty-state handling, aria-live for async messages, non-technical copy.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 2.
  - **Blocks**: Task 7.
  - **Blocked By**: Task 5.

  **References**:
  - `dashboard/src/components/ui/error-box.tsx` — error state with Retry.
  - `dashboard/src/panels/integrations/IntegrationsPage.tsx` — `animate-pulse` skeleton inline pattern.
  - `dashboard/src/pages/ModelCatalogPage.tsx` — empty-state layout (`flex flex-col items-center justify-center py-16`).
  - `dashboard/src/pages/ComposioConnections.tsx` — existing connect handler / `pendingMessage` banner to evolve into popup-blocked handling.
  - `web-design-guidelines` — handle empty states, aria-live polite, plain-language errors.
  - Why: best-in-class polish is mostly in the states; these are explicit Metis edge cases.

  **Acceptance Criteria**:
  - [ ] Loading shows skeletons; error shows `ErrorBox` + Retry; empty search shows the "no match" state.
  - [ ] Popup-blocked path shows a non-technical toast.

  **QA Scenarios**:

  ```
  Scenario: Empty search result state (Playwright)
    Tool: Playwright
    Steps:
      1. Type a nonsense query "zzzzzqqqq" → assert the "No apps match" empty state renders (not a blank grid).
      2. Click clear-filters → assert grid restores.
    Expected Result: Dedicated empty state shown and recoverable.
    Evidence: .sisyphus/evidence/task-9-empty-search.png

  Scenario: Catalog error → ErrorBox with retry
    Tool: Playwright (intercept/abort the toolkits request) OR component test
    Steps:
      1. Force the catalog request to fail.
      2. Assert ErrorBox with a Retry button appears; click Retry re-requests.
    Expected Result: Error state with working retry; no blank page.
    Evidence: .sisyphus/evidence/task-9-error-state.png
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 10. "Available to connect now" zone + connectable/dedup logic

  **What to do**:
  - Build the middle zone: a grid of `IntegrationCard`s for catalog apps where `connectable === true && connected === false` (today ≈ Gmail; Notion appears in Connected). Each card shows a live "Connect {Name}" button.
  - Connect handler: `getComposioConnectUrl(tenantId, slug)` → `window.open(url, '_blank', 'noopener,noreferrer')` (popup-blocked handling from Task 9) → show the "complete in new tab" inline hint → on return/poll, refresh connections so the app moves to the Connected zone.
  - Dedup: exclude any slug already in the connected set. If zero connectable apps, show a short hint ("More apps are coming soon — browse the full list below.").

  **Must NOT do**: Do NOT light up Connect for non-connectable apps (those belong in Browse-all as "Not yet available"). Do NOT block on the popup; keep it async.

  **Recommended Agent Profile**:
  - **Category**: `deep` — connectable filtering, dedup, connect/refresh flow correctness.
  - **Skills**: [`react-dashboard`] — card shell, non-technical copy.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 3 (alongside 11/12) once shell exists.
  - **Blocks**: None.
  - **Blocked By**: Tasks 4, 7.

  **References**:
  - `dashboard/src/pages/ComposioConnections.tsx (current handleConnect)` — existing connect flow (`getComposioConnectUrl` + `window.open` + pending banner) to reuse.
  - `dashboard/src/lib/gateway.ts:listComposioConnections` — to refresh after connect.
  - Task 2 endpoint — supplies `connectable`/`connected` flags.
  - Why: this zone is the "happy path" for non-technical users; correctness of the connectable flag + dedup is what avoids dead-end buttons (Metis Q2).

  **Acceptance Criteria**:
  - [ ] Only `connectable && !connected` apps appear here with a live Connect button.
  - [ ] After a successful connect, the app moves to the Connected zone on refresh.
  - [ ] No app appears in both Connected and Available.

  **QA Scenarios**:

  ```
  Scenario: Available zone shows only connectable, non-connected apps (Playwright)
    Tool: Playwright
    Steps:
      1. Load the page; assert the "Available to connect now" zone contains apps with a live "Connect …" button.
      2. Assert notion (already connected) is NOT in this zone.
      3. Assert a non-connectable app (e.g. some catalog app) is NOT here (it's in Browse-all as "Not yet available").
    Expected Result: Zone correctly filtered + deduped.
    Evidence: .sisyphus/evidence/task-10-available-zone.png
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 11. "Browse all apps" infinite scroll + lazy logos + perf

  **What to do**:
  - Build the Browse-all grid (`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`) rendering all catalog apps (minus connected), each `IntegrationCard` reflecting its state (Connect / Not yet available).
  - Infinite scroll: when the user nears the bottom (IntersectionObserver sentinel), fetch the next page via `listComposioToolkits({ cursor: nextCursor, search, category })` and append; stop when `nextCursor` is null. Show a small "Loading more…" spinner row.
  - Perf: every logo `loading="lazy"`; apply `content-visibility: auto` (or windowing) to cards so 1000+ items don't tank rendering. Respect `prefers-reduced-motion` for any hover/scroll animation.

  **Must NOT do**: Do NOT load all pages eagerly. Do NOT render 1000 eager `<img>` (lazy is mandatory). Do NOT use `transition: all`.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — infinite scroll + perf-conscious grid.
  - **Skills**: [`react-dashboard`, `web-design-guidelines`] — large-list virtualization/content-visibility, lazy images, reduced-motion.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 3.
  - **Blocks**: None.
  - **Blocked By**: Tasks 4, 7.

  **References**:
  - `dashboard/src/panels/preflight/PreflightPanel.tsx` — base card-grid (`grid grid-cols-1 gap-4 sm:grid-cols-2`); extend to `lg:grid-cols-3`.
  - Task 4 `listComposioToolkits` (cursor param) — pagination source.
  - `web-design-guidelines` — large lists (>50) virtualize / `content-visibility: auto`; images `loading="lazy"`; honor `prefers-reduced-motion`; animate transform/opacity only.
  - Why: this is the real perf cliff (1000 cards × 1 logo each); lazy + content-visibility are the mitigations Metis flagged.

  **Acceptance Criteria**:
  - [ ] Scrolling near the bottom loads the next page and appends; stops at `nextCursor === null`.
  - [ ] All logos use `loading="lazy"`; long list stays responsive (content-visibility/windowing applied).
  - [ ] No `transition: all`; animations honor reduced-motion.

  **QA Scenarios**:

  ```
  Scenario: Infinite scroll loads more pages (Playwright)
    Tool: Playwright
    Steps:
      1. Load the page; record initial Browse-all card count.
      2. Scroll to the bottom; wait for "Loading more…" then new cards.
      3. Assert card count increased after scroll.
    Expected Result: More cards load on scroll (cursor pagination works).
    Evidence: .sisyphus/evidence/task-11-infinite-scroll.png

  Scenario: Logos lazy-load and render (Playwright)
    Tool: Playwright
    Steps:
      1. Assert browse cards' logo <img> have loading="lazy".
      2. Assert at least one visible logo has naturalWidth>0 (CDN renders under CSP).
    Expected Result: Lazy attribute present; logos actually render.
    Evidence: .sisyphus/evidence/task-11-lazy-logos.png
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 12. a11y pass + non-technical copy + dark-mode logo contrast

  **What to do**:
  - Sweep the whole page for Web Interface Guidelines compliance: icon-only buttons get `aria-label`; decorative icons `aria-hidden`; the connect-status region uses `aria-live="polite"`; loading text ends with "…"; buttons use Title Case + specific labels ("Connect Notion", not "Connect"); active voice.
  - Ensure focus-visible rings on all interactive elements; hover states present; no `outline-none` without replacement.
  - Dark-mode logo contrast: logo tile uses a light/neutral background in both themes so dark-on-transparent logos remain visible.
  - Final copy pass: every user-facing string is non-technical ("connected app" not "integration", "Sign in to {App}" not "OAuth", "connection needs refreshing" not "token expired").

  **Must NOT do**: Do NOT introduce ARIA where semantic HTML suffices. Do NOT leave any "Tenant"/"Archetype"/raw-field copy.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — a11y + copy polish across the page.
  - **Skills**: [`web-design-guidelines`, `react-dashboard`] — the full guidelines checklist + non-technical copy rule.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 3 (final polish over assembled page).
  - **Blocks**: None.
  - **Blocked By**: Task 7 (needs assembled page).

  **References**:
  - The fetched Vercel Web Interface Guidelines (accessibility, focus, typography, content/copy, dark mode sections).
  - `.opencode/skills/react-dashboard` §4 — non-technical language table.
  - `dashboard/src/index.css` — oklch theme tokens for the logo tile background in both themes.
  - Why: best-in-class polish + accessibility is an explicit user goal and a guidelines gate.

  **Acceptance Criteria**:
  - [ ] No icon-only button without `aria-label`; status updates announced via `aria-live`.
  - [ ] Visible focus rings everywhere; logos visible in dark mode.
  - [ ] Zero technical terms in user-facing copy.

  **QA Scenarios**:

  ```
  Scenario: Keyboard a11y + dark-mode logos (Playwright)
    Tool: Playwright
    Steps:
      1. Tab through the page; assert each interactive element shows a visible focus ring.
      2. Toggle dark mode; assert logo images remain visible against the tile background (screenshot + naturalWidth>0).
      3. Assert icon-only buttons expose an accessible name (aria-label).
    Expected Result: Focus visible; logos legible in dark mode; buttons named.
    Evidence: .sisyphus/evidence/task-12-a11y-darkmode.png

  Scenario: Non-technical copy audit
    Tool: Bash (grep the page source)
    Steps:
      1. grep the page/components for "Tenant", "Archetype", "OAuth", "token", "integration" in user-facing strings.
      2. Assert none appear in rendered copy (identifiers in code are fine).
    Expected Result: No technical jargon in visible strings.
    Evidence: .sisyphus/evidence/task-12-copy-audit.txt
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 13. Backend integration test (mock SDK)

  **What to do**:
  - Create `tests/integration/composio-catalog.test.ts` mocking `@composio/core` (`toolkits.get`, `authConfigs.list`) — mirror the mocking style in the existing `tests/integration/composio-oauth.test.ts`.
  - Assert: (a) endpoint maps a 3-item fixture (one with `composioManagedAuthSchemes`, one `noAuth`, one neither) and flags `connectable` correctly — but ALSO that `connectable` is driven by the `authConfigs.list()` ENABLED set, not the catalog flags (provide an authConfigs fixture so exactly the intended slugs are connectable); (b) `connected` flag set for a slug present in the tenant's active connections; (c) pagination — `nextCursor` is passed through and a second-page fetch with a cursor returns the next fixture page; (d) cache — a second identical request within TTL does NOT re-invoke the `toolkits.get` mock; (e) SDK rejection → endpoint returns a structured 502 (`sendError`), not an unhandled 500.

  **Must NOT do**: Do NOT hit the real Composio API. Do NOT assert exact catalog size (mocked).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — thorough test authoring with SDK mocking + cache assertions.
  - **Skills**: [`api-design`] — route response shape conventions for assertions.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 4.
  - **Blocks**: None.
  - **Blocked By**: Task 2 (endpoint).

  **References**:
  - `tests/integration/composio-oauth.test.ts` — the mocking + supertest harness pattern (vi.fn mocks for the Composio client, `makeApp` factory, SERVICE_TOKEN auth).
  - `src/gateway/routes/composio-catalog.ts` (Task 2) — the unit under test.
  - `vitest.integration.config.ts` — the config these run under (`npx vitest run --config vitest.integration.config.ts`).
  - Why: this locks the riskiest backend behaviors (connectable source-of-truth, pagination, caching, error path) that Metis flagged.

  **Acceptance Criteria**:
  - [ ] All five assertion groups pass.
  - [ ] `npx vitest run --config vitest.integration.config.ts tests/integration/composio-catalog.test.ts` is green.

  **QA Scenarios**:

  ```
  Scenario: Catalog endpoint behaviors verified with mocked SDK
    Tool: Bash (vitest)
    Steps:
      1. Run the new integration test file.
      2. Assert all tests pass (connectable from authConfigs, connected flag, pagination passthrough, cache hit, 502 on SDK failure).
    Expected Result: All tests green.
    Evidence: .sisyphus/evidence/task-13-integration-test.txt
  ```

  **Commit**: groups with feat(composio catalog endpoint).

- [x] 14. Component tests (search / filter / dedup / states)

  **What to do**:
  - Add dashboard component tests (same runner/location as existing dashboard tests) for the marketplace:
    - `IntegrationCard` renders the three button states + letter-avatar fallback for missing logo.
    - Search input filters rendered cards by name (type "noti" → Notion-ish only); clearing restores.
    - Category chip filters the grid; "All" resets.
    - Connected-vs-available separation: a connected slug renders only in the connected zone (dedup), available shows "Connect", non-connectable shows "Not yet available".
    - Empty search result renders the empty state, not a blank grid.
    - `listComposioToolkits` parses `{ items, nextCursor }` (mock fetch).

  **Must NOT do**: Do NOT do full E2E here (that's the Playwright wave). Do NOT depend on a live backend (mock the gateway calls).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — multiple component tests with mocked data.
  - **Skills**: [`react-dashboard`] — component conventions for accurate selectors/assertions.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 4.
  - **Blocks**: None.
  - **Blocked By**: Tasks 5–11 (components exist).

  **References**:
  - Existing dashboard test files (find via the dashboard test script in `package.json` / `dashboard/`) — match their render/mocking style (e.g. testing-library + vitest).
  - `dashboard/src/pages/composio/IntegrationCard.tsx` and `ComposioConnections.tsx` — units under test.
  - Why: component tests give fast regression coverage on the filtering/dedup logic that's easy to break.

  **Acceptance Criteria**:
  - [ ] All listed component tests pass under the dashboard test runner.

  **QA Scenarios**:

  ```
  Scenario: Marketplace component logic verified
    Tool: Bash (dashboard test runner)
    Steps:
      1. Run the dashboard component tests.
      2. Assert card states, search filter, category filter, dedup, and empty-state tests pass.
    Expected Result: All component tests green.
    Evidence: .sisyphus/evidence/task-14-component-tests.txt
  ```

  **Commit**: groups with feat(composio marketplace redesign).

- [x] 15. Update documentation (AGENTS.md + README) for marketplace + denylist removal

  **What to do**:
  - Update AGENTS.md: Composio shell-tool/env rows and any denylist mention → reflect denylist removal + the new read-only catalog endpoint `GET /admin/tenants/:tenantId/composio/toolkits`.
  - Update README.md admin-endpoint table: add the new `/composio/toolkits` row; remove/adjust the `COMPOSIO_DENIED_TOOLKITS` env description.
  - Keep additions durable (describe patterns, not volatile counts).

  **Must NOT do**: Do NOT document the deferred usage table as wired. Do NOT add volatile tallies.

  **Recommended Agent Profile**:
  - **Category**: `writing` — documentation sync.
  - **Skills**: [] — follows repo doc-freshness rules.

  **Parallelization**:
  - **Can Run In Parallel**: YES — Wave 4.
  - **Blocks**: None.
  - **Blocked By**: Tasks 2, 3.

  **References**:
  - AGENTS.md Composio rows (env vars, shell tools, conventions) + the Documentation Freshness section.
  - README.md admin API endpoint table (Composio rows) + Composio env section.
  - Why: repo mandates doc updates in the same change when endpoints/env vars change.

  **Acceptance Criteria**:
  - [ ] AGENTS.md + README reflect the new endpoint and denylist removal; no stale `COMPOSIO_DENIED_TOOLKITS` references remain.

  **QA Scenarios**:

  ```
  Scenario: Docs updated, no stale references
    Tool: Bash
    Steps:
      1. grep AGENTS.md README.md for COMPOSIO_DENIED_TOOLKITS → zero matches.
      2. grep README.md for "/composio/toolkits" → present in the endpoint table.
    Expected Result: Stale refs gone; new endpoint documented.
    Evidence: .sisyphus/evidence/task-15-docs.txt
  ```

  **Commit**: `docs: update Composio integration docs for marketplace + denylist removal`.

- [x] 16. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.
      Run: `tsx scripts/telegram-notify.ts "✅ Composio marketplace redesign complete — all tasks done & verified. Come back to review."` (only after F1–F4 APPROVE and user okay).

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Never mark F1–F4 checked before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl `/composio/toolkits`, run page). For each "Must NOT Have": grep the codebase for forbidden patterns (`toolkits.list(`, snake_case SDK fields, Radix `Select` import in the page, edits to other integration files, `COMPOSIO_DENIED_TOOLKITS`) — reject with file:line if found. Verify other integration files are unchanged (`git diff --stat` shows only Composio + sanctioned files). Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit` + new integration test. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, commented-out code, unused imports, AI slop (over-abstraction, generic names). Confirm camelCase SDK usage.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA — Playwright** — `unspecified-high` (+ `playwright` skill)
      From clean state, execute EVERY task's QA scenario at `http://localhost:7700/dashboard/integrations/composio?tenant=00000000-0000-0000-0000-000000000003`. Assert: ≥1 logo `<img>` with `naturalWidth>0`; >50 browseable cards; search "noti" shrinks grid then clears restores; category chip updates URL + filters + survives refresh; `?tenant=` preserved across navigation; Disconnect opens a Dialog (role="dialog", not `window.confirm`) with working Cancel (no network call); infinite scroll loads more on scroll; keyboard Tab shows focus ring; logos visible in dark mode; empty-search shows empty state. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 (nothing missing, nothing beyond spec). Confirm "Must NOT do" compliance. `git diff --name-only` must show ONLY: `composio-catalog.ts`/`composio-admin.ts`, catalog cache module, `composio-oauth.ts` (denylist only), `dashboard/.../ComposioConnections.tsx`, new `composio/` components, `gateway.ts`, `types.ts`, `.env`/`.env.example`, AGENTS.md, README.md, the two test files. ANY other file = contamination → flag.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Group commits by concern (do NOT commit until the user explicitly asks, per repo rules):

- `feat(composio): add cursor-paginated toolkit catalog endpoint` — Tasks 1,2,4 + test 13
- `feat(composio): remove toolkit denylist, allow all apps` — Task 3
- `feat(composio): redesign integrations page as browsable marketplace` — Tasks 5–12 + test 14
- `docs: update Composio integration docs for marketplace + denylist removal` — doc updates

---

## Success Criteria

### Verification Commands

```bash
curl localhost:7700/health                                   # gateway live
curl -H "Authorization: Bearer $SERVICE_TOKEN" \
  "localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/composio/toolkits?limit=24"  # returns {items:[...], nextCursor}
pnpm build && pnpm lint                                        # green
pnpm test:unit                                                # green
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent (denylist removed; other integrations untouched; no `.list()`/snake_case)
- [x] All tests pass; Playwright QA evidence captured
- [x] AGENTS.md + README updated (denylist removal, new endpoint, marketplace page)
- [x] Telegram completion notification sent
