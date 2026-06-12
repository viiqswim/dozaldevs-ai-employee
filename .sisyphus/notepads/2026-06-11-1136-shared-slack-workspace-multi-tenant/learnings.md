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

## [2026-06-12] Task 10 — Documentation updates (DONE)

- Updated `docs/guides/2026-05-14-0040-slack-tenant-integration.md`: added "Workspace-to-Tenant Relationship (many:1)" section at the top explaining the routing flow (findManyByExternalId → resolveEmployeesAcrossTenants → single/LLM/disambiguation/no-employees). Added note that connecting a second tenant to the same workspace is just running the install flow again.
- Updated `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md`: replaced "routes by team_id to the right tenant" with "looks up all tenants connected to that workspace, then resolves which employee owns the channel across all of them".
- Updated `AGENTS.md` Slack @mention triggering bullet: replaced old single-tenant framing with full many:1 routing description (findManyByExternalId → resolveEmployeesAcrossTenants → single/LLM/disambiguation/zero-employees). Added TRIGGER_DISAMBIGUATE to action IDs list.
- Updated `AGENTS.md` Tenants section: added "Multiple tenants can share a Slack workspace (many:1)" paragraph with routing summary and pointer to the guide.
- No snapshot files touched. No volatile facts introduced.

## [2026-06-12] Task 11 — Live E2E Results

### Pre-flight (PASS)
- "1 logical gateway" = count NODE leaf running server.ts, NOT the 3-process tsx-watch chain. `ps aux | grep server.ts` shows 3 (npm exec wrapper -> tsx cli watch -> node leaf); only the node leaf (PID 97978) is the server. Authoritative check: `lsof -nP -iTCP:7700 -sTCP:LISTEN` => exactly one PID.
- Stale /tmp/ai-dev.log referenced an OLD dead gateway (PID 82726, exited 22:17 "WS closed cleanly"). The live gateway writes to /tmp/ai-gateway.log and runs in tmux `ai-gateway`. Always reconcile which log the LIVE pid writes to before trusting log tails.
- python3 has no version set in this repo (.tool-versions) — `python3 -c` fails. Use `jq` or `node -e` for JSON parsing in bash, never python3.

### Browser approach
- CDP port 9222 was NOT available (user's Chrome runs without --remote-debugging-port; do NOT kill it). The Playwright MCP browser already had an authenticated VLRE Slack session — used it as the live equivalent (real Slack web -> real Socket Mode -> live gateway).
- Slack compose is a rich contenteditable with mention chips. Playwright `fill()` WIPES it / bypasses autocomplete. MUST use: click -> `pressSequentially('@REMI')` -> wait -> `keyboard.press('Enter')` to accept the mention suggestion -> `pressSequentially(' rest of text')` -> `press('Enter')` to send. Verify innerText before sending.

### Happy path / single-candidate (PASS)
- Channel C0B71QSMZKQ (#ops-cleaning-schedule) has exactly 1 employee (cleaning-schedule, archetype ...019) — exercises the single-candidate branch.
- Log proof of NEW code: "Interaction event sent from mention (single candidate)" tenantId=...003.
- cleaning-schedule has a REQUIRED `date` input — include a checkout date in the @mention so pre-extract pulls it (`extractedInputs={"date":"2026-06-13"}`) and it dispatches cleanly instead of diverting to input-collection.
- Task 0d71781d-cef5-4683-89b3-3e32f6be4ab4 reached Done in ~2min. approval_required=false short-circuit: Received->Triaging->AwaitingInput->Ready->Executing->Submitting->Validating->Submitting->Done (no Reviewing).

### Ambiguity / disambiguation path (FAIL — BLOCKING BUG)
- BUG: event-handlers.ts lines 309-314 give EVERY disambiguation button the SAME action_id ('trigger_disambiguate'). Slack Block Kit REQUIRES unique action_id per message. With 2+ candidates the card is rejected with `invalid_blocks`:
    [ERROR] `action_id` "trigger_disambiguate" already exists [json-pointer:/blocks/1/elements/1/action_id]
- The disambiguation card therefore NEVER posts. User is stuck at the "On it — one moment…" ack with no buttons. Path cannot reach Done. This is the core multi-tenant feature (pick among candidates) — it is 100% broken.
- MISLEADING LOG: "Disambiguation card posted" (info) is emitted UNCONDITIONALLY after the try/catch, even when chat.update threw invalid_blocks. The real failure is the level-40 WARN "Failed to post disambiguation card" immediately before it. Don't trust the info log.
- Routing logic itself is CORRECT: resolveEmployeesAcrossTenants returned candidateCount=3, routeToEmployee fell back to null on the vague message (only role_name is passed to the LLM, no identity), correctly reaching the disambiguation branch.
- Reproduced 3 ways: (1) live gateway invalid_blocks log on a real @mention, (2) empty Slack thread (only ack, no card), (3) direct chat.postMessage repro returning the exact "action_id already exists" validation messages.
- FIX (for a future task, NOT done here): unique action_id per button (suffix index/archetypeId) + register the Bolt handler with a RegExp matcher (e.g. /^trigger_disambiguate/) so all unique ids route to one handler; and move the success log INSIDE the try after the API call succeeds.

### Environment limitation (documented, not a defect)
- True "two tenants sharing one workspace" is NOT seeded locally: DozalDevs=T0601SMSVEU, VLRE=T06KFDGLHS6 (distinct team_ids; 0 rows share a team_id). The multi-candidate code is identical for one-tenant-3-employees vs many-tenants, so C0960S2Q8RL (3 VLRE employees) exercises the same branch — and that branch is where the bug lives.
- Dev/prod shared SLACK_APP_TOKEN round-robin drops ~50% of app_mention events locally (AGENTS.md known issue). First 2 disambiguation @mentions were dropped (posted to Slack but no gateway app_mention log); the 3rd landed. Just retry — it is not a feature defect. Re-confirm single :7700 listener before each retry to rule out local split-brain.

### Evidence files written
- .sisyphus/evidence/task-11-preflight.txt
- .sisyphus/evidence/task-11-live-happy.txt
- .sisyphus/evidence/task-11-live-disambiguation.txt (documents the blocking bug)

## [2026-06-12] T11 Bug Fix — Disambiguation card unique action_ids
- Fixed: each button now gets action_id `trigger_disambiguate_${index}` (unique per message)
- Fixed: handler now uses regex /^trigger_disambiguate/ to match all variants
- Fixed: "Disambiguation card posted" log moved inside try block (only fires on success)
- Test updated: event-handlers.test.ts:406-407 asserted the OLD buggy contract (all buttons
  share 'trigger_disambiguate'). Updated to assert 'trigger_disambiguate_0'/'_1' plus a
  uniqueness check (new Set(actionIds).size === actionIds.length) so the bug can't regress.
- Verification: all 7 slack test files pass (69 passed, 1 pre-existing skip). tsc --noEmit
  CLEAN on both changed handler files + the test file. Remaining tsc errors are pre-existing
  and dashboard/scripts-only (not from this change).
- SLACK_ACTION_ID import in trigger-handlers.ts stays — still used by TRIGGER_CONFIRM and
  TRIGGER_CANCEL (only TRIGGER_DISAMBIGUATE switched to the regex matcher).
- Bolt detail: boltApp.action() accepts a RegExp constraint; all unique suffixed action_ids
  (trigger_disambiguate_0..N) route to the single handler via /^trigger_disambiguate/.

## [2026-06-12] T11 Re-run — Disambiguation E2E after bug fix (PASS)
- Fix commit d440047e verified LIVE end-to-end. The disambiguation path that failed last run
  with invalid_blocks now works completely.
- Gateway log contrast (same channel C0960S2Q8RL, same vague-message scenario):
    22:46 pre-fix (PID 97978): WARN "Failed to post disambiguation card" + invalid_blocks
                               (`action_id "trigger_disambiguate" already exists`)
    22:57 post-fix (PID 30418): clean "Disambiguation card posted" candidateCount=3, NO error.
- Slack API confirmed the card now has 3 UNIQUE action_ids: trigger_disambiguate_0 (Code Rotation),
  _1 (Daily Real Estate Inspiration 2 Copy), _2 (Real Estate Motivation Bot 2).
- Browser: card visibly rendered with 3 buttons; clicked "Real Estate Motivation Bot 2".
- Regex handler /^trigger_disambiguate/ matched the suffixed action_id and dispatched to the
  CHOSEN employee: "trigger_disambiguate action received" + "Task dispatched from Slack disambiguation".
- Task 3ecc8913-ccdd-4cf1-89cd-bf77be011d14 -> archetype 561439b9 (real-estate-motivation-bot-2,
  the picked one) -> reached Done in ~4min. Full trace: Received->Triaging->AwaitingInput->Ready->
  Executing->Submitting->Validating->Submitting->Delivering->Done. Delivered "Task complete" to channel.
- The success log moved inside the try block is confirmed: it only fires on a real successful post
  (no false "posted" log when the API would have errored).
- Env note unchanged: no two tenants share a team_id locally, but the 3-employee single-tenant
  channel exercises the identical multi-candidate branch the fix targets. No round-robin drop this run.
- Evidence: .sisyphus/evidence/task-11-live-disambiguation.txt (overwrote the prior FAIL writeup with the PASS result).
