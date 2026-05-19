# Learnings — employee-overview-and-drafts

## [2026-05-18] Session Start

### Key Architecture Facts

- Generation uses `anthropic/claude-haiku-4-5` (NOT minimax) — temperature 0.3, maxTokens 4000 (→ 6000 after T3)
- `instructions` is both: harness execution prompt AND display text. Do NOT change its semantics.
- `agents_md` is the employee brain — 50-200 lines. Lives separately from `instructions`.
- Dashboard fetches archetypes via PostgREST directly (not gateway) — `postgrestFetch('archetypes', {...})`
- PATCH endpoint currently missing: `agents_md`, `delivery_instructions`, `trigger_sources`, `tool_registry`
- No `status` or draft concept exists anywhere today — clean slate

### Database

- Connection: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- PostgREST: `http://localhost:54331/rest/v1/`
- Pattern: `status String @default("active")` — NOT enums

### Dashboard

- React Router v6, BrowserRouter, flat routes in App.tsx
- Dashboard is static build — ALWAYS run `cd dashboard && pnpm build` after any frontend change
- Gateway serves dashboard at `http://localhost:7700/dashboard`
- Admin key for testing: check `.env` for `ADMIN_API_KEY`
- VLRE tenant: `00000000-0000-0000-0000-000000000003`

### Production Safety

- `create-task-and-dispatch.ts` archetype lookups have NO status filter → draft could be triggered accidentally
- Fix: add `&status=eq.active` to every PostgREST archetype query in `src/inngest/`

### Unique Constraint Plan

- Current: `@@unique([tenant_id, role_name])` on Archetype model
- Plan: Remove it, add partial unique index via raw SQL: `WHERE status = 'active'`
- This allows drafts to have any role_name (including duplicates)
- Finalize conflict check must happen at PATCH time (409 if role_name taken by active archetype)

## [T5] Dashboard Types Updated

- Added `ArchetypeOverview` named interface (role, trigger, workflow[], tools_used, output, approval)
- `Archetype`: added `status: string`, `overview: ArchetypeOverview | null`, `parent_draft_id: string | null`
- `GenerateArchetypeResponse`: added `overview: ArchetypeOverview` (non-nullable — backend always returns it)
- `CreateArchetypePayload`: added `status?: string`, `overview?: ArchetypeOverview | null`, `parent_draft_id?: string | null`
- `ArchetypeOverview` placed before `Archetype` interface (line ~53) so it's in scope
- `tsc --noEmit` exits 0 — no type errors

## Task 1: Prisma Migration — status/overview/parent_draft_id on archetypes

**Migration file**: `prisma/migrations/20260518225228_add_status_overview_to_archetypes/migration.sql`

**Gotchas encountered**:
1. **Migration checksum drift**: The previous migration `20260513064913_add_pre_check_adapter_worker_env_rename_fields` had a checksum mismatch between the file and `_prisma_migrations` table. Fixed by computing `sha256sum` of the file and updating the DB row directly: `UPDATE _prisma_migrations SET checksum = '<hash>' WHERE migration_name = '...'`.
2. **Partial index not in Prisma-generated SQL**: `prisma migrate dev` generates SQL from schema diff — it cannot express partial indexes. Workflow: run `migrate dev` first (gets the column additions + unique drop), then manually edit the migration SQL to append the `CREATE UNIQUE INDEX ... WHERE status = 'active'` line, then apply the index directly via psql, then update the checksum in `_prisma_migrations` to match the edited file.
3. **`@@unique` removal**: Removing `@@unique([tenant_id, role_name])` from schema causes Prisma to emit `DROP INDEX "archetypes_tenant_id_role_name_key"` — confirmed in generated SQL.

**QA results**: All 5 checks passed — 3 columns present, partial index exists, existing rows have `status='active'`, draft+active same role_name both insert, second active same role_name fails with unique violation.

## [T3] Overview Field Added to archetype-generator.ts

- `overview` added to `GenerateArchetypeResponse` interface with 6 keys: role, trigger, workflow (string[]), tools_used, output, approval
- `SYSTEM_PROMPT` JSON Shape updated to include `overview` example + human-readable guidance note
- `REFINE_SYSTEM_PROMPT` updated to require `overview` regeneration on every refinement
- `maxTokens` bumped 4000 → 6000 in both `generate()` and `refine()`
- `postProcess()` validates overview exists and is an object; falls back to empty-string defaults if missing
- QA confirmed: `POST /archetypes/generate` returns `overview` with all 6 keys, `workflow` is array with 5 items, `instructions`/`agents_md`/`role_name` all present (no regression)
- Evidence saved: `.sisyphus/evidence/task-3-overview-generation.json`

## [2026-05-18] Task 4 — Safety Filters Applied

### Files Modified (commit 939682e)

1. `src/inngest/lib/create-task-and-dispatch.ts` line 35
   - Added `&status=eq.active` to PostgREST archetype lookup by role_name

2. `src/inngest/triggers/guest-message-poll.ts` line 57
   - Added `&status=eq.active` to PostgREST guest-messaging archetype discovery

3. `src/gateway/services/interaction-classifier.ts` lines 54, 66
   - Added `&status=eq.active` to both notification_channel lookup and tenant fallback

4. `src/gateway/services/employee-dispatcher.ts` line 31
   - Changed `findUnique({ where: { tenant_id_role_name: ... } })` → `findFirst({ where: { tenant_id, role_name, status: 'active' } })`
   - The `tenant_id_role_name` compound unique key was removed from schema in a prior task

5. `src/gateway/routes/hostfully.ts` line 66
   - Same findUnique → findFirst fix with status: 'active' filter

### QA Results
- Draft archetype trigger → 404 NOT_FOUND ✅
- Active archetype dry run → 200 valid ✅
- Build: clean (0 errors after `pnpm prisma generate`) ✅

### Key Learnings
- `employee-dispatcher.ts` and `hostfully.ts` used Prisma (not PostgREST) — needed `findFirst` not `findUnique`
- `tenant_id_role_name` compound unique index was already removed from schema — `findUnique` with it was a pre-existing build error
- `pnpm prisma generate` was needed to pick up the `status` field in Prisma client types
- LSP shows stale errors after `prisma generate` — trust `pnpm build` output instead

## [2026-05-18] Task 2 — PATCH Endpoint Expansion

### Implementation Notes
- `TriggerSourceSchema` must be declared BEFORE `PatchArchetypeBodySchema` (moved it up)
- `import type { Prisma }` must become `import { Prisma }` to use `Prisma.JsonNull` as a value
- JSON nullable fields (`trigger_sources`, `tool_registry`, `overview`) need `Prisma.JsonNull` when setting to null — cannot pass raw `null` to Prisma for nullable JSON columns
- `status` field IS in `ArchetypeWhereInput` (confirmed from generated types) — LSP stale cache showed false error
- 409 conflict check: use `findFirst` with `NOT: { id: archetypeId }` to exclude self
- `delivery_instructions` is a plain string field (not JSON) — no special handling needed, just pass through in `...rest`
- `parent_draft_id` is a plain string field — also passes through in `...rest`

### QA Confirmed Working
- agents_md, delivery_instructions, trigger_sources, tool_registry, status, overview, parent_draft_id all PATCH correctly
- 409 returned when activating archetype with role_name already taken by active archetype in same tenant

## [2026-05-18] Task 6 — CreateArchetypeBodySchema Extended

### Changes
- Added `status: z.enum(['active', 'draft']).default('active')` to `CreateArchetypeBodySchema`
- Added `overview: z.any().nullable().optional().default(null)` to `CreateArchetypeBodySchema`
- Added `parent_draft_id: z.string().uuid().nullable().optional().default(null)` to `CreateArchetypeBodySchema`
- Destructured `overview` from bodyResult.data in create() handler
- `overview` uses `Prisma.JsonNull` pattern (same as trigger_sources/tool_registry)
- `status` and `parent_draft_id` pass through `...rest` (plain string fields — no special handling)

### Key Patterns
- Only `['active', 'draft']` allowed on creation (NOT 'superseded')
- `overview` defaults to `null` → stored as `Prisma.JsonNull` in DB
- `status` defaults to `'active'` → backward compatible (existing callers unaffected)
- LSP shows stale errors after schema changes — always trust `pnpm build` output

### QA
- POST with status="draft" → 201, response.status === "draft" ✅
- POST without status → 201, response.status === "active" ✅
- overview stored as JSON object ✅
- pnpm build: exit 0 ✅

## [2026-05-18] Tasks T8 + T9

### T8 — EmployeeList draft badge + filter

- `postgrestFetch` takes `Record<string, string>` — PostgREST filter syntax goes directly as the value: `status: 'neq.superseded'`
- Sort order change: `'status.asc,role_name.asc'` puts active (a) before draft (d) alphabetically
- Draft rows: Badge component with `variant="outline"` + gray color classes matches the existing muted-gray badge pattern from AGENTS.md
- Buttons hidden for drafts by wrapping in `{!isDraft && <div ...>}` — cleaner than disabling
- `isGuestMessaging` hardcode preserved exactly as-is inside the `!isDraft` block (it only applies to active archetypes anyway)

### T9 — EmployeeOverview component

- New file at `dashboard/src/components/EmployeeOverview.tsx`
- `SectionLabel` + `SectionContent` sub-components keep JSX flat without needing inline style repetition
- Approval icon logic: `overview.approval.toLowerCase().includes('required')` → Check (amber) else Minus (muted)
- `lucide-react` v1.16.0 available in dashboard — `Check` and `Minus` icons imported directly
- Null guard returns `<p className="text-sm text-muted-foreground">Overview not available</p>` as specified
- `workflow` rendered as `<ol className="list-decimal ...">` with numbered items
- Build: `pnpm build` exits 0, no TypeScript errors

## [2026-05-18] Task 7 — Auto-Save Draft on Generation + Redirect

### State Machine Change
- Removed: `preview`, `creating`, `success` phases
- Added: `saving` phase — `{ phase: 'saving'; config: GenerateArchetypeResponse }`
- Final: `idle | generating | saving | error`

### handleSaveDraft Pattern
- Called directly from `handleGenerate` after `generateArchetype` resolves (no intermediate preview)
- Sets `saving` state first (spinner shows "Saving draft…")
- POSTs to `createArchetype()` with `status: 'draft'`, `overview` from config, `parent_draft_id: null`
- `notification_channel` from local state (user-controlled input on idle page) — NOT part of `GenerateArchetypeResponse`
- On success: `navigate('/dashboard/employees/${archetype.id}/edit')`
- On error: sets `error` phase with message (no retry special-casing)

### Removals
- `handleRefine`, `handleCreate` functions — moved to edit page (T11/T13)
- `refinementCount`, `refinementInput`, `originalDescription`, `nameError` state — gone
- `CreateEmployeePreview`, `CreateEmployeeNextSteps` imports — gone (files untouched)
- `refineArchetype` import from gateway — gone
- `Archetype` type import — gone (inferred from createArchetype return)
- `SLUG_REGEX`, `isValidSlug` — gone (API validates)

### Notification Channel Placement
- Moved to `idle` phase below textarea, above char counter
- Label: "Slack Channel (optional)" — Input placeholder "#channel-name"

### Build
- `cd dashboard && pnpm build` exits 0 ✅
- Commit: fe9528d

## T14 — Unit Tests for Draft Flow (2026-05-19)

### archetype-generator.test.ts patterns
- `postProcess()` is private but testable via `generate()` — inject mock LLM, check result shape
- `makeValidJsonContent()` helper omits fields set as `undefined` via JSON.stringify — useful for testing fallback paths
- overview fallback triggers when `!result.overview || typeof result.overview !== 'object'` — covers both missing and wrong-type cases
- All 13 tests pass in ~3ms (pure unit tests, no DB or HTTP)

### admin-archetypes.test.ts patterns (new file, co-located in src/gateway/routes/__tests__/)
- PATCH conflict test requires `findFirst` mocked with `.mockResolvedValueOnce()` twice:
  1. First call returns the existing archetype (passes NOT_FOUND guard)
  2. Second call returns the conflict (triggers 409)
- PATCH 409 error message is `{ error: 'role_name already taken by an active employee' }` (not `ROLE_NAME_TAKEN`)
- POST 409 error message is `{ error: 'ROLE_NAME_TAKEN' }` (Prisma P2002)
- Prisma mock pattern: pass `{ prisma: { archetype: { create, findFirst, update } } as never }` to route factory
- All 6 new tests pass in ~38ms

### vitest.config.ts includes both paths
- `tests/**/*.test.ts` (integration tests with real DB)
- `src/**/__tests__/**/*.test.ts` (co-located unit tests, Prisma mocked)
