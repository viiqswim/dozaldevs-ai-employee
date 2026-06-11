# Decisions — Composio Marketplace Redesign

## [2026-06-11] Architecture Decisions

### Catalog Endpoint

- New file: `src/gateway/routes/composio-catalog.ts`
- Route: `GET /admin/tenants/:tenantId/composio/toolkits`
- Auth: `authMiddleware` + `requireAuth` + `requireTenantRole(MEMBER)`
- In-memory cache (~1h TTL) keyed by cursor+search+category
- `connectable` from `authConfigs.list()` ENABLED set (cached separately)
- `connected` from `ComposioConnectionRepository.getActiveConnections(tenantId)`

### Frontend Architecture

- 3-zone single scrolling page (no tabs)
- Zone 1: Connected apps (top)
- Zone 2: Available to connect now (connectable && !connected)
- Zone 3: Browse all apps (infinite scroll, all minus connected)
- URL state: `?search=`, `?category=`, `?tenant=` preserved

### Denylist Removal

- Remove `COMPOSIO_DENIED_TOOLKITS` from composio-oauth.ts, .env, .env.example, AGENTS.md, README.md
- All apps allowed; only `TOOLKIT_NOT_CONFIGURED` guard remains (correct behavior)

### Pre-existing Prisma LSP Errors

- `composioConnection` and `taskComposioCall` missing from Prisma client — pre-existing, NOT our bug
- `pnpm prisma generate` may resolve but is NOT required for this plan
- These errors exist in composio-admin.ts and composio-connection-repository.ts — do not fix
