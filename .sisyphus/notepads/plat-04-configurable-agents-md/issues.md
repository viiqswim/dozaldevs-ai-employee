# Issues — plat-04-configurable-agents-md

## Critical Guardrails (from Metis review)

- NEVER import `opencode-harness.mts` in tests — module-level IIFE crashes test runner
- NEVER overwrite `/app/AGENTS.md` with null/empty — guard with `content && content.trim().length > 0`
- NEVER modify `tests/workers/config/agents-md-content.test.ts`
- Treat empty string `agents_md = ""` same as null — fall through to next level
- Handle `task.tenant_id === null` — skip tenant query, proceed to static fallback
- Handle PostgREST returning null for tenant — fall through, don't crash

## Pre-existing Test Failures (expected, do NOT fix)

- `container-boot.test.ts` — requires Docker socket
- `inngest-serve.test.ts` — function count mismatch

## Out of Scope

- NO Dockerfile changes
- NO Admin API endpoint for agents_md
- NO content validation
- NO caching of tenant config query
