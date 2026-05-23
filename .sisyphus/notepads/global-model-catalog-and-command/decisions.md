# Decisions

## Architecture
- Fully global catalog — no per-tenant overrides
- Clean URL: /admin/model-catalog (no :tenantId)
- recommend-model URL stays, only DB query changes
- Deduplication SQL runs BEFORE dropping tenant_id column

## Confirmed Constraints
- matcher.ts: ZERO changes (already tenant-agnostic)
- Workers/PostgREST: ZERO impact (never query model_catalog)
- DB backup MANDATORY before migration (AGENTS.md)
- Cross-tenant isolation test: explicitly DELETE (not update)
