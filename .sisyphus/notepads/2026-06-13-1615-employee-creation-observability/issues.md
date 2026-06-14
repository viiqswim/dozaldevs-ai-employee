# Issues — employee-creation-observability

## [2026-06-13] Known Gaps Being Fixed

- GAP-1 (CRIT): No persistence of LLM generation calls — archetype-generator.ts:300-329
- GAP-2 (CRIT): No audit trail for wizard creation — admin-archetypes.ts:196
- GAP-3 (HIGH): Model recommendation decision not persisted — archetype-generator.ts:331-363
- GAP-4 (HIGH): No success log on create/patch — admin-archetypes.ts:235,412
- GAP-5 (HIGH): Direct PATCH bypasses edit history — admin-archetypes.ts:363
- GAP-6 (MED): No record a generation attempt happened on failure — admin-archetype-generate.ts:113-123
- GAP-7 (MED): No record a propose-edit attempt happened — admin-archetype-propose-edit.ts:409-418
- GAP-8 (MED): Time estimation LLM call untracked — time-estimator.ts:35-43
- GAP-9 (LOW): History row client-driven not server-driven (PATCH + separate POST)
- GAP-10 (LOW): callLLM logs requested model not actual model — call-llm.ts:243
