# Learnings — Conversational Employee Editing

## [2026-06-13] Session Start

### Key Architecture Facts (verified in planning phase)

- `ArchetypeGenerator.refine()` at `src/gateway/services/archetype-generator.ts:398` — 4-param signature: `refine(previousConfig, refinementInstruction, catalog?, composioContext?)`
- `REFINE_SYSTEM_PROMPT_PRE`/`_POST` (no single constant anymore — Composio block injected between them)
- PATCH route: `PATCH /admin/tenants/:tenantId/archetypes/:archetypeId` in `src/gateway/routes/admin-archetypes.ts`
- `PatchArchetypeBodySchema` is MISSING `identity` — must add it (T1)
- `patchArchetype` client at `dashboard/src/lib/gateway.ts:138` — already sends `identity` but gateway drops it
- Harness compiles from `identity`, `execution_steps`, `delivery_steps` (NOT `execution_instructions`)
- `execution_instructions` is a SEPARATE platform-constant prompt — do NOT touch

### Field Allowlist (CRITICAL — enforce both server + client)

Allowed: `identity`, `execution_steps`, `delivery_steps`, `overview`, `risk_model.approval_required`, `tool_registry.tools`, `trigger_sources`, `input_schema`
FORBIDDEN: `model`, `temperature`, `role_name`, `vm_size`, `concurrency_limit`

### DB

- DB: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- PostgREST: `http://localhost:54331`
- Gateway: `http://localhost:7700`
- Dashboard: `http://localhost:7700/dashboard`

### Dashboard Stack

- React 19, Vite 8, Tailwind 4, Radix/shadcn, react-router-dom 7
- react-markdown 10 + remark-gfm 4 already installed
- sonner 2 (toasts), lucide-react
- NO diff lib yet → add `react-diff-viewer-continued`

### Conventions

- Card shell: `rounded-lg border bg-card px-5 py-4`
- All dropdowns: `SearchableSelect`
- URL-encoded tab state: `?tab=assistant`
- `sendError`/`sendSuccess` for ALL gateway responses
- Soft-delete only (never hard delete)
- `requireTenantRole(TenantRole.ADMIN)` for all new endpoints
- `actor_user_id = req.auth?.id ?? null` (nullable for SERVICE_TOKEN)

## [2026-06-13] T1 — identity PATCH fix

### PATCH handler field flow (verified by reading admin-archetypes.ts lines 330-389)

The PATCH handler destructures these fields explicitly from `bodyResult.data`:
- `risk_model`, `trigger_sources`, `tool_registry`, `overview`, `status`, `input_schema`, `worker_env`, `instructions`

Everything else goes into `...rest` and is spread directly into `prisma.archetype.update({ data: { ...rest, ... } })`.

**Conclusion**: `identity` does NOT need special handling — it flows through `...rest` automatically once added to `PatchArchetypeBodySchema`. No changes to the handler body were needed.

### Fix applied
- Added `identity: z.string().max(10000).nullable().optional()` to `PatchArchetypeBodySchema` (line 63, between `delivery_steps` and `execution_steps`)
- 4 unit tests added in `tests/unit/gateway/routes/admin-archetypes-patch-identity.test.ts`
- All tests pass, lint clean, build clean
