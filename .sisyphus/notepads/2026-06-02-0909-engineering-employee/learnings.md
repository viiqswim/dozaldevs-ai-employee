# Learnings

<!-- Append findings here — never overwrite. Format: ## [TIMESTAMP] Task: {task-id} -->

## [2026-06-02] Task: T1

**OAuth state utility extraction — `src/gateway/lib/oauth-state.ts`**

- All 3 OAuth route files (`slack-oauth.ts`, `jira-oauth.ts`, `notion-oauth.ts`) had byte-for-byte identical `signState`/`verifyState` implementations. Extraction was a pure DRY lift with zero behavior change.
- `crypto` import kept in all 3 route files — still needed for `crypto.randomBytes(16)` nonce generation.
- `src/gateway/lib/` directory created new (did not previously exist). Pattern established for gateway-internal shared utilities.
- Tests placed at `src/gateway/__tests__/oauth-state.test.ts` (7 tests, all pass in ~1ms). Pre-existing failures in `get-properties.test.ts` and `notion/get-page.test.ts` are unrelated infrastructure tests.
- Build: exit 0. New tests: 7 pass. Zero regressions.
- T4 (GitHub OAuth route) can now import from `../lib/oauth-state.js` directly.
