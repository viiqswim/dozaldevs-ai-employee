# Learnings

## [2026-06-12] Session Start

- Plan: shared-slack-workspace-multi-tenant (17 tasks, 0 done)
- No migration needed — DB already supports multiple tenants per workspace
- Bot token is workspace-scoped (same xoxb- for all tenants on same Slack app)
- `findManyByExternalId` already exists in tenant-integration-repository.ts
- GitHub fan-out pattern at src/gateway/routes/github.ts:70-101 is the template
- Dashboard disconnect at admin-integrations.ts:22-50 is ALREADY single-tenant safe
- The 409 check is at slack-oauth.ts:119-123 — currently UNTESTED
- Cross-tenant resolver MUST NOT use "oldest archetype" fallback (data-leak guard)
- Ambiguous mentions → disambiguation card with buttons, NOT decline
- Only zero-employee workspaces get "no employees available" message

## [2026-06-12] Task 5 — Remove OAuth 409 cross-tenant conflict (DONE)

- `DUPLICATE_TEAM` was NEVER thrown anywhere — the catch branch in slack-oauth.ts was dead code serving only the conflict path. Removed both the 409 check AND the catch branch.
- Removed the now-unused `integrationRepo.findByExternalId('slack', teamId)` call; `integrationRepo.upsert` (line ~120) still used so repo construction stays.
- `secretRepo.set` mock in tests MUST resolve `{ key, updated_at }` — `TenantSecretRepository.set` reads `record.key`/`record.updated_at`; returning undefined → 500 (masked the real RED).
- Callback test pattern: inject `tenantIntegration: { findFirst, upsert }` into the prisma mock (repos built inside `slackOAuthRoutes`). Mock `global.fetch` with a real `Response` for `oauth.v2.access`. Build state via `signState(JSON.stringify({tenant_id, nonce}), ENC_KEY)`.
- Cross-tenant attach now returns 200 + upserts a NEW integration row for tenant B (upsert keyed on (tenant_id, provider)). DB has no unique constraint on (provider, external_id), so multiple tenants share a team_id by design.
- Evidence: .sisyphus/evidence/task-5-oauth-second-tenant.txt. NOT committed (grouped with Task 4).

## [2026-06-12] Task 7 — fetchInstallation iterates tenants for live token (DONE)

- `fetchInstallation` now uses `integrationRepo.findManyByExternalId('slack', teamId)` (returns array ordered created_at asc) and iterates, returning the first non-null `secretRepo.get(tenant_id, 'slack_bot_token')`. Early-`break` on first live token.
- Error message changed from `No bot token found for team: ${teamId}` (colon) to `No bot token found for team ${teamId}` (no colon) to match the plan's exact assertion. The "No installation for team:" message (zero rows) keeps its colon.
- Test helper `makeStore` needed `findManyByExternalId` added to the integrationRepo mock; default `vi.fn().mockResolvedValue([])`. `deleteInstallation` tests still mock `findByExternalId` (that method unchanged).
- LSP unavailable in this env (typescript-language-server version not set in .tool-versions) — used `pnpm exec tsc --noEmit | grep installation-store` as the type-check fallback. Clean.
- `event-handlers.test.ts` (tokens_revoked fan-out) was ALREADY modified+failing on the branch before this task (116 insertions, prior uncommitted work). Confirmed via `git stash` that failures predate my change. Did NOT touch it — out of scope.
- Vitest path filter quirk: `pnpm test:unit -- installation-store` runs the WHOLE suite (substring match across all files); use `pnpm exec vitest run <full-path>` to scope to one file.

## [2026-06-12] Task 8 — app_uninstalled / tokens_revoked fan-out (DONE)

- Registered explicit boltApp.event('app_uninstalled') and boltApp.event('tokens_revoked') in event-handlers.ts
- Both handlers extract body.team_id (not event.team_id — these events don't embed team in the inner event object)
- shared revokeWorkspace(teamId, trigger) helper: findManyByExternalId('slack', teamId) → fan-out per-tenant with continue-on-error
- Repos (integrationRepo, secretRepo) created once at top of registerEventHandlers, shared across all handlers — removed inline `new TenantIntegrationRepository(prisma)` from app_mention
- deleteInstallation in installation-store.ts left untouched (dead code in production Socket Mode path)
- Dashboard disconnect (admin-integrations.ts) confirmed single-tenant safe by 4 regression tests
- Evidence: .sisyphus/evidence/task-8-single-disconnect.txt
- Test mock needs tenantIntegration.findMany, tenantIntegration.update, tenantSecret.findUnique, tenantSecret.delete
- EventHandler type in test must accept body?: unknown to pass body to revoke handlers

## [2026-06-12] Task 9 — app_mention cross-tenant routing + disambiguation (DONE)

- app_mention now calls `integrationRepo.findManyByExternalId('slack', mention.team)` to get ALL tenants on the workspace, then `resolveEmployeesAcrossTenants(channel, tenantIds)` to get candidates
- Single candidate → direct `interaction.received` with that tenantId; no LLM call needed
- Multiple candidates → `routeToEmployee(text, archetypes, callLLM)` (exported from slack-trigger-handler.ts); confident result → route; null → disambiguation card
- Disambiguation card: `TRIGGER_DISAMBIGUATE` action buttons (max 5), value shape identical to TRIGGER_CONFIRM `{archetypeId, tenantId, userId, channelId, threadTs, text}`
- TRIGGER_DISAMBIGUATE handler registered in trigger-handlers.ts — same dispatch logic as TRIGGER_CONFIRM but without input extraction (simple path only)
- No-team fallback: `tenantId: null` forwarded to Inngest (legacy path, backward compat)
- Zero candidates → "no employees" message via `updateOrPost` helper (updates ack if available, else posts)
- `routeToEmployee` exported from slack-trigger-handler.ts; dead single-element `route-employee` step simplified to `return resolution.archetype ?? null`
- `resolveArchetypeFromChannel` import removed from event-handlers.ts (no longer used there)
- `updateOrPost` helper uses typed `SlackChatClient` interface instead of `any` to satisfy ESLint
- handlers-mention-dedup.test.ts needed: `vi.hoisted` for `mockResolveEmployeesAcrossTenants` + `mockRouteToEmployee`, `mockPrismaForDedup` with `findMany`, `makeClient()` helper, `client` arg in all handler calls, and `beforeEach` re-initialization after `vi.clearAllMocks()`
- `vi.clearAllMocks()` clears `mockResolvedValue` implementations — always re-set in `beforeEach` for any mock that must return a specific value
- admin-integrations.test.ts: regression test proving DELETE for tenant A only soft-deletes tenant A's integration row (by ID), never touches tenant B
