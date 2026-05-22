# Issues — model-selection-engine

## Known Risks

### CRITICAL: postProcess() model override

- `src/gateway/services/archetype-generator.ts` ~line 215 has `result.model = 'minimax/minimax-m2.7'`
- This silently overwrites any model the engine recommends
- Task 10 MUST be done BEFORE Task 9 (or concurrently at minimum)

### z.enum validation gate

- `src/gateway/routes/admin-archetypes.ts` ~line 78 has z.enum restricting model to 2 values
- Task 11 MUST expand this or new catalog models will be rejected

### Route registration location

- Route files in src/gateway/routes/ are NOT in an index.ts
- Must find the correct registration point (likely src/gateway/index.ts or src/gateway/server.ts)

### Seed data requires real benchmarks

- Task 5 agent must actually look up Artificial Analysis and OpenRouter model pages
- DO NOT let agent use fake/placeholder benchmark numbers

## Pre-existing Test Failures (DO NOT FIX)

- `container-boot.test.ts` — requires Docker socket, skips
- `inngest-serve.test.ts` — function count hardcoded, do not fix
