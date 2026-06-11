# Issues — CI Deploy Pipeline Automation

## [2026-06-10] Session Start

### Pre-existing LSP error (NOT in scope)

- `vitest.config.ts:25` — `coverage` property type error
- Pre-existing, unrelated to this plan — DO NOT fix

### Pre-existing test skips (NOT in scope)

- 9 `it.skip` tests in guest-delivery, installation-store, tenant-env-loader files
- DO NOT touch these

### GitHub Actions secrets: total_count = 0

- All 4 secrets missing: PROD_DATABASE_URL_DIRECT, FLY_API_TOKEN, RENDER_DEPLOY_HOOK_URL, RENDER_API_KEY
- Task 10 is human-assisted (user must provide values)

## [2026-06-11] OPEN: worker-tools test exclusion is technical debt

- `tests/unit/inngest/supersede-threading.test.ts` and `src/worker-tools/notion/__tests__/write-tools.test.ts` are excluded from the unit vitest run via `configDefaults.exclude` spread in `vitest.config.ts`
- 4 integration worker-tool CLI tests also excluded from `vitest.integration.config.ts` (same root cause): `report-issue.test.ts`, `submit-output.test.ts`, `add-comment.test.ts`, `send-message.test.ts`
- Root cause: `src/worker-tools/` is a standalone sub-package (nested `package.json`, NOT a pnpm workspace member) → SSR-externalized on Linux CI → `.js` import specifiers not rewritten to `.ts`
- These tests pass on macOS locally; they fail ONLY on Linux CI
- FOLLOW-UP REQUIRED: fix the Linux resolution properly (workspace member, separate vitest project, or convert `.js` specifiers) and re-include all excluded worker-tool tests
