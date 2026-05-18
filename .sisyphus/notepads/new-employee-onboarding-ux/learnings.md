# Learnings — new-employee-onboarding-ux

## 2026-05-18 Session Start

### Codebase Conventions

- Dashboard: React 19 + Vite + Tailwind v4 + Radix UI SPA at `/dashboard/*`
- All new gateway routes must be registered in `src/gateway/server.ts`
- `requireAdminKey` middleware applied to all admin routes
- Frontend type `Archetype` is at `dashboard/src/lib/types.ts:53-75`
- All admin API calls use `gatewayFetch` helper in `dashboard/src/lib/gateway.ts`
- Slack bot token: read via `TenantSecretRepository.get(tenantId, 'SLACK_BOT_TOKEN')`
- LLM calls: `callLLM({ model: 'anthropic/claude-haiku-4-5', taskType: 'review', ... })`
- JSON fence stripping: `rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()`

### Key Architecture Points

- `agents_md` is the real employee brain (200-400 lines markdown), NOT `system_prompt` (empty in all real archetypes)
- `model` ALWAYS hardcoded to `minimax/minimax-m2.7` - never LLM-chosen
- `runtime` ALWAYS `opencode`
- role_name: URL-safe slug `^[a-z0-9]+(-[a-z0-9]+)*$`
- Prisma P2002 on [tenant_id, role_name] unique → return 409 ROLE_NAME_TAKEN
- Generation endpoint = no DB write; Creation endpoint = DB write (two separate endpoints)
- Max refinement iterations: 3
- Max description length: 2000 chars

### Critical Guardrails

- NO changes to EmployeeDetail.tsx
- NO visual cron builder (plain text input only)
- NO interactive tool chips (read-only display)
- NO changes to existing PatchArchetypeBodySchema

## Task 3 — POST /admin/tenants/:tenantId/archetypes/generate

### Pattern Used

- `ArchetypeGenerator` class with constructor-injected `callLLMFn` (mirrors `InteractionClassifier`)
- `generate()` makes single LLM call with `anthropic/claude-haiku-4-5` + `taskType: 'review'` + `temperature: 0.3` + `maxTokens: 4000`
- `refine()` passes current config JSON + refinement instruction to same LLM pattern
- Fence stripping: `rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()`
- Post-process ALWAYS overwrites `model = 'minimax/minimax-m2.7'`, `runtime = 'opencode'`, `system_prompt = ''`
- Route registered BEFORE `adminArchetypesRoutes` so "generate" is not matched as an archetypeId
- `callLLM` imported at top level in server.ts and passed as dep injection to route factory
- `GENERATION_FAILED` error → 422 response

### Evidence

- 200: `task-3-generate-success.json` — real LLM response with hardcoded `model: "minimax/minimax-m2.7"`
- 401: `task-3-no-auth.txt` — missing X-Admin-Key returns `{"error":"Unauthorized"}`

## Task 2 — POST /admin/tenants/:tenantId/archetypes

### Pattern Used

- `CreateArchetypeBodySchema` defined separately from `PatchArchetypeBodySchema` (PATCH unchanged)
- Prisma P2002 duck-typed via `isPrismaError(err) && err.code === 'P2002'` — no `@prisma/client/runtime/library` import needed
- `trigger_sources` and `tool_registry` are Json fields — spread-conditional pattern: `...(field !== null && { field: field as Prisma.InputJsonValue })`
- `risk_model` always sent (has default), so always cast unconditionally
- server.ts already had `app.use(adminArchetypesRoutes({ prisma }))` — no changes needed there; POST route added inside the same function

### Evidence

- 201: valid create (real DB row)
- 409: duplicate `role_name` triggers P2002 on `@@unique([tenant_id, role_name])`
- 400: `role_name` fails `/^[a-z0-9]+(-[a-z0-9]+)*$/` regex
- 401: missing X-Admin-Key header
