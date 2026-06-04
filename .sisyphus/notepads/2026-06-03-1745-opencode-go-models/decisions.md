# Decisions

## [2026-06-03] User-confirmed decisions

- Two separate TEXT columns: `strengths` and `weaknesses` (not a single JSONB or `notes` reuse)
- Add to both seed file AND POST via admin API (dual-path for permanence + immediacy)
- Scrape OpenRouter API for pricing/metadata; fall back to researched data for brand-new models
- `is_free: false` for all Go models (reflects OpenRouter per-token pricing, not Go subscription)
- M2.7 already in catalog: update in-place, preserve existing `notes` value
- Do NOT change model selection engine logic — strengths/weaknesses are informational only
- Dashboard: show strengths/weaknesses in edit dialog only (NOT as table columns)
