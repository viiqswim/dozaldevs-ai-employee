# Decisions — employee-creation-observability

## [2026-06-13] Architecture Decisions

- Table name: `archetype_generation_calls` (creation-scoped, NOT generic gateway_llm_calls)
- Repository: `src/repositories/ArchetypeGenerationCallRepository.ts`
- Skill path: `.opencode/skills/employee-creation-debugging/SKILL.md` (dev skill, NOT Docker)
- One combined skill (not split local/production) — confirmed user decision
- Server-driven history: wizard create writes kind:'create', PATCH writes status flips
- AssistantTab client recordEditHistory call REMOVED (server is single writer)
- No new public read endpoint for trace table (debugging via psql/PostgREST + skill)
- Prompt size cap: 256KB hard limit + truncated boolean flag
