# Issues — gm03-property-kb

## [2026-04-24] Pre-execution known gotchas

- PostgREST `or` filter syntax may be tricky: `?tenant_id=eq.X&or=(scope.eq.common,and(scope.eq.entity,entity_type.eq.Y,entity_id.eq.Z))`. If syntax fails, fall back to TWO separate queries.
- `tests/gateway/schema.test.ts` hardcodes table count — must check actual DB count BEFORE updating (system_events table was recently added, count may already be stale)
- Entity ID must be normalized to lowercase before querying PostgREST
- Prisma may NOT generate CHECK constraint for `scope` — must verify migration SQL and add manually if missing
- The existing `knowledge_bases` table is for feedback pipeline (pgvector) — do NOT touch it
- `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant references old tool format `--property-id --query` — must update to `--entity-type --entity-id` and remove "skip if not available" fallback
- Hostfully API key must be available for Task 2 property identification — fallback is `3505-ban.md`
- PostgREST URL: `http://localhost:54321` (Kong) — NOT `localhost:54322` (direct Postgres)
- SUPABASE_SECRET_KEY is the service role key (available in .env)
