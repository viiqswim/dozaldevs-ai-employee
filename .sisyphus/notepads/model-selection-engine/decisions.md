# Decisions — model-selection-engine

## Confirmed by User

- Execution model only (verification model claude-haiku-4-5 stays hardcoded)
- Model catalog: manually curated, NO auto-refresh from OpenRouter
- Tier classification: computed from raw metrics at runtime (NOT stored in DB)
- Recommendation: top-3 (recommended + cheaper + premium)
- 3 plain-language user questions during creation
- Profile labels (Free Agent, Budget Workhorse, etc.): DEFERRED to Phase 2
- Cost tracking: ALREADY WORKS for any model — NO changes to call-llm.ts
- Task 10 (cost tracking update) from original plan: REMOVED — unnecessary

## Architecture Decisions

- `model_catalog` table: tenant-scoped (`@@unique([tenant_id, model_id])`)
- Soft delete only: set `deleted_at`, never hard delete
- Tier computation: pure functions (no DB queries)
- Profiler: pure heuristic functions (no LLM calls)
- Matcher: receives catalog data as parameter (no DB queries in matcher)
- Scoring weights: quality 35%, cost 25%, speed 15%, toolReliability 25%
- Cost estimate defaults: 2000 input tokens, 1000 output tokens per task

## Scoring Constants (from interview)

- Cost tier: free($0) / budget(<$0.50/M avg) / standard(<$3/M) / premium(≥$3/M)
- Quality tier: basic(<40) / capable(40-60) / advanced(60-80) / frontier(≥80)
- Speed: slow(<15 tok/s) / moderate(15-40) / fast(>40 AND latency<3s)
- Tool reliability: unreliable(>5%) / usable(2-5%) / reliable(1-2%) / rock_solid(<1%)
