# Decisions — creation-never-blocks-tool-resolver

## [2026-06-15] Initial Decisions (confirmed with user)

1. Keep `tool_registry.tools` as REAL tool paths (capability sandboxing stays real + exact)
2. Resolver scope = "normalize + drop unknowns, never block" — deterministic ONLY, no fuzzy
3. Frontend never surfaces a raw technical error
4. Fix BOTH CREATE (converse-create) AND EDIT (propose-edit)
5. Include pre-enforcement validation gate on `enforce_tool_registry` false→true flip
6. Resolver lives in `src/gateway/lib/archetype-edit-helpers.ts` or sibling `tool-resolver.ts`
7. Do NOT put resolver in `postProcess()` — too high blast radius
