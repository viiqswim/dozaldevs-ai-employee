# Issues — integrations-tabbed-redesign

## [2026-06-12] Pre-existing LSP errors (NOT regressions — do not fix)

These errors exist in the codebase before any changes:

- `vitest.config.ts:32` — coverage property type error
- `scripts/check-token-masking.mts:22` — user_id vs userIds
- `tests/unit/gateway/routes/jira-oauth.test.ts:4` — missing module
- `src/worker-tools/notion/get-page.ts` — missing notion-types.js / auth.js
- `src/worker-tools/notion/append-blocks.ts` — missing auth.js / notion-types.js

## [2026-06-12] Latent Bug (to fix in Task 1/3)

`ConnectedAppsZone.tsx` receives `toolkits={catalogItems}` and does `toolkits.filter(t => t.connected)`.
Connected apps beyond catalog page 1 silently disappear.
Fix: source connected apps from `connections` poll + `connectedCustomApps`, NOT from `catalogItems`.
