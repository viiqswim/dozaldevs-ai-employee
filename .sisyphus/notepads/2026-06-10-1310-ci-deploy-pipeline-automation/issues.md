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
