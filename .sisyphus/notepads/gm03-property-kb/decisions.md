# Decisions — gm03-property-kb

## [2026-04-24] Design Decisions (finalized before execution)

- **Table name**: `knowledge_base_entries` (generic, not `property_knowledge_bases`)
- **Schema approach**: `entity_type`/`entity_id` columns (industry-agnostic, supports property/restaurant/clinic)
- **Scope values**: `'common'` (tenant-wide) | `'entity'` (per-entity, NOT `'property'`)
- **No --query parameter**: Tool returns ALL content; LLM decides what's relevant. Add when pgvector is implemented (Phase 2+).
- **No keyword filtering**: Pure data fetcher. No section parsing, no regex, no TF-IDF.
- **Seed size**: Exactly 1 entity row + 1 common row for VLRE. GM-08 handles remaining 15 properties.
- **pgvector**: Explicitly out of scope for Release 1.0
- **Fallback property**: If Hostfully API unavailable, use `3505-ban.md` as representative property
