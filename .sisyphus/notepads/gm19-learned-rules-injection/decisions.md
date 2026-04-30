# Decisions — gm19-learned-rules-injection

## [2026-04-30] Architectural decisions

### Injection approach: lifecycle env var

- LEARNED_RULES_CONTEXT follows FEEDBACK_CONTEXT pattern exactly
- Lifecycle queries PostgREST → assembles string → injects as env var
- Harness reads env var → appends to systemPrompt after feedbackContext
- Rationale: lifecycle changes don't require Docker image rebuild

### Token budget: character-based

- MAX_LEARNED_RULES_CHARS = 8000 (~2000 tokens at 4 chars/token)
- No tokenizer library
- Truncate at COMPLETE rule boundaries (never split mid-text)
- Header overhead not counted in budget

### Ranking: code-side sorting

- PostgREST query returns all confirmed rules for tenant
- Sort in code: archetype-scoped (entity_type='archetype' && entity_id===archetypeId) first, then tenant-wide (scope='common')
- Within each tier: PostgREST confirmed_at DESC order preserved

### Property-scoped rules: DEFERRED

- No propertyId in dispatch context
- Implement archetype + tenant-wide only for GM-19

### Synthesis: LLM proposes, humans confirm

- New step in feedback-summarizer (NOT a new Inngest function)
- Only runs when ≥2 confirmed rules for archetype
- Stores with source='weekly_synthesis', status='proposed'
- Reuses existing rule_confirm/rule_reject/rule_rephrase action_ids

### Feedback-summarizer scoping bug: TODO comment only

- Pre-existing bug: feedback query has no tenant_id or archetype_id filter
- DO NOT FIX — add TODO comment: "// TODO(GM-19): feedback query lacks tenant_id filter"
- Must add tenant_id+notification_channel to archetype select (required for synthesis)
