# Learnings

## 2026-05-19 Session Start

### Key Patterns

- Tenant soft-delete pattern in `src/gateway/services/tenant-repository.ts` is the exact model to follow
- Routes registered via `app.use(adminArchetypesRoutes({ prisma }))` in `src/gateway/server.ts:178`
- PostgREST URL: `http://localhost:54331` (not 54322 which is postgres direct)
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- Dashboard dev URL: `http://localhost:7701`
- Gateway URL: `http://localhost:7700`

### Migration Context

- Latest migration: `20260519020226_add_input_schema_to_archetypes`
- No `deleted_at` on archetypes — only on `Tenant` (line 373) and `TenantIntegration` (line 401)
- Use `npx prisma migrate dev --name add_deleted_at_to_archetypes`

### Test DB

- `ai_employee_test` — separate DB for tests (safety guard: globalSetup throws if DATABASE_URL doesn't contain `ai_employee_test`)
- Pre-existing failures to ignore: `container-boot.test.ts`, `inngest-serve.test.ts`

### UI Component Inventory

- No `Checkbox` component exists — need to add it
- No `AlertDialog` — use existing `Dialog` from `dashboard/src/components/ui/dialog.tsx`
- All shadcn/ui components use `forwardRef` + `cn` utility pattern

### Active-Task Guard

- Block deletion if ANY task has status NOT IN ('Done', 'Failed', 'Cancelled')
- Terminal statuses: `Done`, `Failed`, `Cancelled`

## Task 4 — Types & Gateway Client (2026-05-19)

### Patterns Used

- `Archetype` interface in `dashboard/src/lib/types.ts` — added `deleted_at: string | null` after `updated_at` (line 104), following the `Tenant` interface pattern
- `deleteArchetype` and `restoreArchetype` added to `dashboard/src/lib/gateway.ts` after `createArchetype` (before `createRule`)
- Both new functions use `gatewayFetch` helper — same pattern as all other gateway functions
- `deleteArchetype` returns `{ id: string; deleted_at: string }` (soft-delete response shape)
- `restoreArchetype` returns `Archetype` (full object after restore)
- TypeScript compile (`npx tsc --noEmit`) passes clean — 0 errors

## Task 5 — Gateway DELETE & Restore Routes (2026-05-19)

### Route Implementation

- Added `DELETE /admin/tenants/:tenantId/archetypes/:archetypeId` and `POST .../restore` to `src/gateway/routes/admin-archetypes.ts`
- Imported `ArchetypeRepository` and `ActiveTasksError` from `../services/archetype-repository.js` (note: `.js` extension required)
- Instantiated `const repo = new ArchetypeRepository(prisma)` inside the route factory function
- Both routes reuse `ArchetypeParamSchema` (already defined in the file)
- `ArchetypeRepository.softDelete` error message is `'Archetype not found'` — use `.includes('not found')` not strict equality
- `ArchetypeRepository.restore` collision error: `'role_name already taken by an active employee'` — use `.includes('role_name')`

### PostgREST URL Gotcha

- PostgREST at `http://localhost:54331` is actually Kong — needs `/rest/v1/` prefix AND apikey header
- Correct: `curl -H "apikey: $SUPABASE_SECRET_KEY" http://localhost:54331/rest/v1/archetypes?...`

### LSP False Positive

- LSP shows `deleted_at` missing on Archetype type — stale cache. Actual Prisma client has it. `pnpm build` passes clean.

### Evidence

- DELETE happy path: `.sisyphus/evidence/task-5-delete-happy.txt` → 200 `{ id, deleted_at }`
- Restore happy path: `.sisyphus/evidence/task-5-restore-happy.txt` → 200 full archetype (deleted_at: null)

## Task 6 — PostgREST Query Sites (2026-05-19)

### Pattern Applied

- Added `deleted_at: 'is.null'` to all 7 archetype PostgREST query sites in `dashboard/src/panels/`
- Pattern: add alongside existing params — same flat object, same key-value style as `status: 'neq.superseded'`
- `TenantOverview.tsx` had NO existing filters — expanded single-line call to multi-line object for readability
- `EditEmployeePage.tsx` uses `id: eq.${archetypeId}` (single-record fetch) — still needs `deleted_at: 'is.null'` to prevent loading deleted archetypes
- TypeScript compile (`npx tsc --noEmit`) passes clean — 0 errors
- Evidence: `.sisyphus/evidence/task-6-query-sites.txt` — 7 matches confirmed
- NOTE: Task 9 will make `EmployeeList.tsx` conditional (toggle "Show deleted") — for now always filters

## Task 7 — Delete Button + Dialog (2026-05-19)

### Patterns Used

- Delete button shows for ALL archetypes (active and draft) — restructured Actions column to always render a `<div>` with stopPropagation, conditionally rendering trigger/dryrun buttons inside `{!isDraft && <></>}` and always rendering Delete outside
- Dialog pattern: use `deletingId: string | null` state — `null` = closed, an ID = open for that archetype
- `deleteArchetype` called from `handleDelete` which wraps loading state, toast.success, setDeletingId(null), and refresh()
- EmployeeDetail uses `deleteDialogOpen: boolean` + navigate back to employees list on success
- Import Dialog from `@/components/ui/dialog` — exports: Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
- TypeScript compile (`npx tsc --noEmit`) clean — 0 errors
- Evidence: `.sisyphus/evidence/task-7-delete-dialog.png` — dialog with "Delete code-rotation?" title confirmed

### Gotchas

- `archetypes.find(a => a.id === deletingId)?.role_name` can be undefined if dialog is open/closing — guarded with `?.`
- HTML entities for quotes: use `&ldquo;` and `&rdquo;` to avoid lint warnings on smart quotes in JSX

## Task 8 — Bulk Delete (2026-05-19)

### Patterns Used

- `selected: Set<string>` state for multi-select — `new Set(filteredArchetypes.map(a => a.id))` for select-all
- `allSelected` derived bool: `filteredArchetypes.length > 0 && selected.size === filteredArchetypes.length`
- `useEffect(() => setSelected(new Set()), [statusFilter, search])` — auto-clear on filter change
- `SkeletonRow` updated from 7 to 8 cells to match new checkbox column
- Checkbox column as `<TableHead className="w-10">` with `aria-label="Select all"` on header checkbox
- Row checkbox cell uses `onClick={(e) => e.stopPropagation()}` to prevent row navigation click
- `handleBulkDelete` loops sequentially, catches per-item errors with toast.error, continues on failure
- Both dialogs (single and bulk) can coexist — separate state (`deletingId` vs `bulkDeleteOpen`)
- `.sisyphus/evidence/` is gitignored — screenshot saved locally but not staged
- `tsc --noEmit` inside `dashboard/` directory exits 0 with no errors
