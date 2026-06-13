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

## [2026-06-13] T2 — archetype_edit_history table

### Migration approach (shadow DB workaround)

`pnpm prisma migrate dev` fails with P3006 (shadow DB `_prisma_migrations` missing). This is a known issue with this project's Docker Compose setup. Workaround:
1. Write migration SQL manually to `prisma/migrations/<timestamp>_<name>/migration.sql`
2. Apply directly: `psql ... -f prisma/migrations/.../migration.sql`
3. Record in `_prisma_migrations`: `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, ...) VALUES (...)`
4. Verify: `pnpm prisma migrate status` → "Database schema is up to date!"

### PostgREST endpoint

PostgREST is behind Kong at port 54331. The correct path is `/rest/v1/<table>` (not `/<table>` directly). `curl http://localhost:54331/rest/v1/archetype_edit_history?limit=1` returns `[]` after schema reload.

### Schema conventions observed

- `TaskComposioCall` (audit table) uses `String` (no `@db.Uuid`) for IDs — but `ArchetypeEditHistory` uses `@db.Uuid` to match `Archetype` model convention
- Relation back-reference on `Archetype` model: add `archetypeEditHistory ArchetypeEditHistory[]`
- `actor_user_id` is nullable (`String? @db.Uuid`) — SERVICE_TOKEN calls have no user
- `deleted_at DateTime?` — soft-delete column, nullable
- Indexes: `@@index([archetype_id, created_at])` + `@@index([tenant_id])`

## [2026-06-13] T4 — useUnsavedChangesGuard hook

### Hook location
`dashboard/src/hooks/use-unsaved-changes-guard.ts` — follows existing hook naming convention (kebab-case, `use-` prefix).

### react-router-dom v7 useBlocker API
`useBlocker(shouldBlock: boolean)` returns `{ state: 'unblocked' | 'blocked' | 'proceeding', proceed(), reset() }`.
When `blocker.state === 'blocked'`, call `blocker.proceed()` or `blocker.reset()` in a `useEffect`.

### Testing useBlocker in jsdom
Mock `react-router-dom` entirely: `vi.mock('react-router-dom', () => ({ useBlocker: vi.fn(() => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() })) }))`.
No MemoryRouter wrapper needed — the mock bypasses the Router context requirement.

### Spying on window.addEventListener in vitest/jsdom
Use `vi.spyOn(window, 'addEventListener')` in `beforeEach` + `vi.restoreAllMocks()` in `afterEach`.
Access calls via `(window.addEventListener as ReturnType<typeof vi.fn>).mock.calls`.
Avoid destructuring in `.find()` callbacks — TypeScript infers `any` from the overloaded signature.

### beforeunload guard pattern
`e.preventDefault()` + `e.returnValue = message` — both required for cross-browser compat.
Listener registered only when `active=true`; cleanup runs on `active→false` or unmount.

## T5: propose-edit endpoint (2026-06-13)

### Route: POST /admin/tenants/:tenantId/archetypes/:archetypeId/propose-edit

**Pattern followed**: mirrors `admin-archetype-generate.ts` for composio context fetching (ComposioConnectionRepository.getActiveConnections + getConnectableToolkits with warn-and-continue on failure).

**Allowlist enforcement**: `applyAllowlist()` strips down `GenerateArchetypeResponse` to only: `identity`, `execution_steps`, `delivery_steps`, `overview`, `risk_model.approval_required`, `tool_registry.tools`, `trigger_sources`, `input_schema`. Keys like `model`, `temperature`, `role_name`, `concurrency_limit`, `vm_size`, `estimated_manual_minutes`, `timeout_hours` never appear in the proposal.

**Tool validation**: Available set = `Set(ALL_TOOL_DESCRIPTORS.map(toolInvocationPath))` UNION `connectedToolkits` (Composio toolkit names). Unknown tools get rejected with 422 + `errors` array.

**TriggerSourceSchema**: duplicated locally in the new route file (not exported from admin-archetypes.ts). Validated only when trigger_sources actually changed (deepEqual check).

**Empty-field guard**: only fires when baseline field is non-empty AND proposal would make it empty. Does NOT apply to risk_model, tools, trigger, or input_schema.

**Approval warning**: computed after all validation passes — `currentApprovalRequired && !proposedApprovalRequired`.

**changed_fields** computation:
- Prose fields: `{ before, after }` when `!deepEqual(baseline[field], stripped[field])`
- `approval_required`: `{ from, to }` boolean
- `tool_registry`: expressed as `tool_delta` ref (not raw value diff)
- `trigger_sources`: expressed as `trigger_change` ref
- `input_schema`: expressed as `input_change` ref

**Error handling**: 422 `PROPOSAL_INVALID` with `errors: [{ field, reason }]` array for all validation failures collected before returning. Generator errors with `GENERATION_FAILED` message → 422. Other errors → 500.

**Unit test mocking pattern**: mock `ArchetypeGenerator` at module level with `vi.fn()`, control `mockRefine` per-test. `ComposioConnectionRepository` mocked to return `[]` by default (no connected toolkits). Auth middleware bypassed entirely.

## [2026-06-13] T6 — Edit-History Record + List Endpoints

### Pattern: new tenant-scoped admin route
- File: `src/gateway/routes/admin-archetype-edit-history.ts` — factory `adminArchetypeEditHistoryRoutes({ prisma })`.
- Registered in `src/gateway/server.ts`: import after `admin-archetype-propose-edit`, `app.use(...)` after `adminArchetypesRoutes`.
- Guard chain copied verbatim from `admin-archetypes.ts`: `authMiddleware, requireAuth, requireTenantRole(TenantRole.ADMIN)`.
- Param schema: `TenantIdParamSchema.extend({ archetypeId: uuidField() })` — reuse `uuidField()` (NOT `z.string().uuid()`).

### actor_user_id resolution (the crux)
- `const actorUserId = req.auth?.id ?? null;`
- SERVICE_TOKEN callers: `authMiddleware` sets `req.isServiceToken = true` and leaves `req.auth` undefined → null actor. Verified by unit test.
- JWT callers: `req.auth.id` is the app `users.id` (not supabaseId).

### Prisma model access after T2 schema add
- Model `ArchetypeEditHistory` → client accessor `prisma.archetypeEditHistory` (camelCase).
- **GOTCHA**: After a schema change in a sibling task, the editor/LSP TypeScript cache is stale and reports `Property 'archetypeEditHistory' does not exist on PrismaClient`. Fix: `pnpm prisma generate`. The OpenCode LSP diagnostic stays stale even after generate, but `pnpm build` (tsc) is authoritative and passes — trust the build, not the inline LSP hint.
- JSONB columns (`before_json`, `after_json`, `changed_fields`) take `as Prisma.InputJsonValue`. Body Zod types: objects → `z.record(z.string(), z.unknown())`, changed_fields → `z.array(z.string())`.

### Query limit pattern
- `?limit=N` via `z.coerce.number().int().min(1).max(50).optional()` (Express delivers query as strings → `coerce`). Default 50, hard cap 50, `take: limit`.

### Test mocking — configurable auth state
- To test both SERVICE_TOKEN and JWT in one file: hoist a mutable `let authState` and have the mocked `authMiddleware` do `Object.assign(req, authState)`. Reset in `beforeEach`. Mock `prisma` as `{ archetype: { findFirst }, archetypeEditHistory: { create, findMany } }`.
- Result: 11/11 tests pass; full unit suite 1870 passed | 9 skipped; lint + build clean.

## [2026-06-13] T7 — Edit-History Revert Endpoint

### Route: POST /admin/tenants/:tenantId/archetypes/:archetypeId/edit-history/:historyId/revert
- Added to existing T6 file `admin-archetype-edit-history.ts` (factory already registered in server.ts — no server.ts change needed).
- Param schema: `EditHistoryParamSchema.extend({ historyId: uuidField() })` → `RevertParamSchema`.

### Revert semantics (the crux)
- `before_json` of the NEW revert row = snapshot of CURRENT archetype (state BEFORE the revert).
- `after_json` of the NEW revert row = the restored values (extracted from target row's `before_json`).
- `changed_fields` = allowlisted keys where `!deepEqual(currentSnapshot[k], restored[k])` (JSON.stringify compare, same as propose-edit).
- Target history row is NEVER touched (append-only) — verified by asserting `update`/`delete` mocks not called.
- `request_text = "Revert to change from <target.created_at ISO>"`.

### Allowlist extraction helpers (two pure functions)
- `extractAllowlistedFields(source)` — picks identity, execution_steps, delivery_steps, overview,
  risk_model→{approval_required}, tool_registry→{tools}, trigger_sources, input_schema. Used for BOTH
  current-snapshot and target-restore so the diff compares like-for-like.
- `buildRevertUpdateData(restored, currentRiskModel)` — maps to prisma update data with JSON-null handling.
  **risk_model merge**: restored `approval_required` is spread onto CURRENT risk_model so operational
  `timeout_hours` is preserved (only approval_required is in the allowlist).
- Disallowed fields (model, temperature, role_name, vm_size, concurrency_limit) are structurally impossible
  to restore because the extract helper never copies them — even when target.before_json contains them.

### Stale Prisma LSP cache (same gotcha as T6)
- OpenCode LSP reports `Property 'archetypeEditHistory' does not exist on PrismaClient` on every edit.
- This is the stale client cache. `pnpm prisma generate` + `pnpm build` (tsc) is authoritative and passes.
- Trust the build, not the inline LSP hint.

### Comment hook
- Kept ONE security-boundary comment (the revert allowlist / forbidden-fields list) — Priority 3 (security-related).
- Removed the second docstring on buildRevertUpdateData as non-essential.

### Results
- 8 new revert tests (happy path + snapshot/changed_fields + actor JWT/SERVICE_TOKEN + 3 negative: cross-tenant 404, archetype 404, bad UUID 400).
- File total: 19/19 pass. Full suite: 162 files, 1878 passed, 9 skipped. Lint clean. Build clean.
