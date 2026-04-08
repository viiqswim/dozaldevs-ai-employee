# Issues — dynamic-project-registration

## [2026-04-08] Session Start

### Critical Gotchas (from Metis review)

1. entrypoint.sh step 6 fetches TASK row only, not PROJECT row — cannot access tooling_config in bash. RESOLUTION: move install to orchestrate.mts
2. parseRepoOwnerAndName lives in src/workers/ — cross-boundary import. RESOLUTION: extract to src/lib/repo-url.ts
3. cleanupTestData() does not delete projects — test isolation trap. RESOLUTION: extend in T5
4. crypto.timingSafeEqual THROWS on unequal buffer lengths. RESOLUTION: length-check first in T4
5. ADMIN_API_KEY missing = startup should fail-fast. RESOLUTION: mirror JIRA_WEBHOOK_SECRET pattern in T13

### Watch Out

- Do NOT delete seed project (id: 00000000-0000-0000-0000-000000000003) in cleanupTestData
- Do NOT add install to validation-pipeline.ts STAGE_ORDER — it's a pre-validation step, not a validation stage
- Do NOT call processenv.ADMIN_API_KEY on every request — cache at module load
- Do NOT log the actual ADMIN_API_KEY value anywhere
- Do NOT expose Prisma error internals in HTTP responses
- PATCH tooling_config is REPLACE not deep-merge — document in code comment
