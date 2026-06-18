# Organization Delete & Hard-Delete (Platform Owner)

## TL;DR

> **Quick Summary**: Give the platform owner the ability to permanently hard-delete an organization (tenant) and ALL its associated records, alongside the existing recoverable soft-delete — which we extend to truly stop the org by cascade-suspending its employees and force-cancelling in-flight tasks. Every action is audited.
>
> **Deliverables**:
>
> - New `audit_log` table + `AuditLogRepository` (no tenant FK — survives a hard purge)
> - Extended soft-delete: cascade-suspends archetypes + force-cancels active tasks, writes audit row, seed-tenant guard
> - New platform-owner-only hard-delete endpoint: `DELETE /admin/tenants/:tenantId/hard` — DB-only physical purge (two-phase, idempotent, Prisma-direct, schema-drift self-audit, type-to-confirm, blocks if active tasks)
> - `TenantRepository.hardDelete()` (the codebase's single sanctioned physical DELETE)
> - Restore writes audit row + re-activates archetypes it previously suspended
> - Dashboard UI: per-row Delete / Restore / Hard-Delete actions on the platform-owner Tenant Management page, with reuse + type-to-confirm dialogs
> - Real browser E2E covering soft-delete → restore → type-to-confirm hard-delete, verified via psql
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (audit table migration) → Task 4 (TenantRepository purge logic) → Task 8 (hard-delete route) → Task 12 (dashboard hard-delete UI) → Final Wave

---

## Context

### Original Request

"As the platform owner, I should have the ability to do a soft delete or a hard delete on an organization and all of its associated records. Look into every nook and cranny so we can make this happen. Maybe make a distinction between 'delete' and 'inactivate'."

### Interview Summary

**Key Discussions**:

- **Two operations** (confirmed): Soft delete (recoverable) + Hard delete (permanent purge). "Inactivate" = synonym for soft delete, NOT a separate reversible-pause concept.
- **Existing soft-delete** (`DELETE /admin/tenants/:tenantId`, gated `requireTenantRole(OWNER)`): kept as-is auth gate, but EXTENDED to cascade-suspend archetypes + force-cancel active tasks so the org truly stops. Existing restore endpoint stays.
- **Hard delete**: NEW endpoint, platform-owner ONLY (`requirePermission(MANAGE_TENANTS)`), DB-rows-only purge (no external API cleanup).
- **Active tasks**: soft-delete force-cancels (recoverable); hard-delete BLOCKS with 409 if any non-terminal task exists (avoids orphaned Inngest/Fly orchestration entirely).
- **Guardrail**: hard delete requires type-to-confirm (exact org slug), validated server-side.
- **Seed-tenant protection**: 403 on both soft & hard delete for DozalDevs (`00000000-0000-0000-0000-000000000002`) and VLRE (`00000000-0000-0000-0000-000000000003`).
- **Audit**: NEW dedicated `audit_log` table (no tenant FK so it survives a purge).

**Research Findings**:

- Soft-delete infra partially exists: `TenantRepository.softDelete()/restore()`, `DELETE` + `POST /restore` routes, dashboard `TenantManagementPage` with a "Show deleted" toggle.
- `TenantRepository` has NO `hardDelete()`. `prisma.delete()` is treated as a bug everywhere else — this is the codebase's first sanctioned physical delete.
- Tenant→Tenant Cascade FKs: `tenant_secrets`, `feedback_events`, `employee_rules` (auto-purged when the Tenant row is deleted).
- FK-LESS tables (manual `deleteMany` by `tenant_id` required): `composio_connections`, `task_composio_calls`, `archetype_generation_calls`.
- `system_events` has `onDelete: Restrict` → must be purged before the Tenant row.
- Tenant has a partial unique index on `slug WHERE deleted_at IS NULL` → slug reusable after delete; restore can 409 on slug collision (already handled in repo).
- Auth: `PLATFORM_OWNER` (global role) or `SERVICE_TOKEN` are the only holders of `PERMISSIONS.MANAGE_TENANTS`.
- Dashboard conventions: `gatewayFetch()` client, `DeleteEmployeeDialog` confirm pattern, "Organization" language, SearchableSelect, URL-encoded `?tenant=` state.

### Metis Review

**Identified Gaps** (addressed):

- `system_events` is a tool-error table (no actor/action, Restrict FK) → resolved: dedicated `audit_log` table.
- Force-cancelling a task row does NOT stop Inngest/Fly orchestration → resolved: hard delete BLOCKS on active tasks, so it only ever runs against a quiescent org.
- Physical DELETE breaks the soft-delete invariant → isolated in `TenantRepository.hardDelete()` with code comment + AGENTS.md sanctioned-exception entry.
- Mega-transaction timeout risk → two-phase purge with idempotency markers.
- RLS silent-filter risk → Prisma-direct connection only; schema-drift self-audit assertion.
- FK delete order must be re-derived from `prisma/schema.prisma` (my interview figures were illustrative, not exact).
- Restore-after-cascade-suspend → restore re-activates only the archetypes soft-delete suspended (tracked by `deleted_at` timestamp equality).

---

## Work Objectives

### Core Objective

Let the platform owner permanently purge an organization and all its records, and make the existing recoverable soft-delete actually stop the org — both fully audited, both guarded against accidents.

### Concrete Deliverables

- `prisma/schema.prisma`: new `AuditLog` model + migration
- `src/repositories/audit-log-repository.ts`: new `AuditLogRepository`
- `src/repositories/tenant-repository.ts`: extended `softDelete()`, extended `restore()`, new `hardDelete()`
- `src/gateway/routes/admin-tenants.ts`: extended `DELETE` handler, new `DELETE /:tenantId/hard` handler, audit on restore
- `src/gateway/validation/schemas.ts`: `HardDeleteTenantBodySchema` (confirm_slug)
- `dashboard/src/lib/types.ts`: `AdminTenant.deleted_at`
- `dashboard/src/lib/gateway.ts`: `hardDeleteTenant()` (+ confirm soft/restore wiring)
- `dashboard/src/pages/TenantManagementPage.tsx`: per-row Delete / Restore / Hard-Delete actions
- `dashboard/src/panels/tenants/components/`: confirm dialogs (soft-delete reuse, hard-delete type-to-confirm)
- `AGENTS.md`: sanctioned physical-delete exception entry; new endpoint + model documented
- E2E validation

### Definition of Done

- [ ] `psql` shows ZERO rows for a purged tenant_id across every tenant-scoped table
- [ ] Soft-delete of an org sets `deleted_at`, suspends its archetypes, cancels its active tasks; restore reverses it
- [ ] Hard delete is blocked (409) when active tasks exist, blocked (403) for seed tenants, blocked (400) on wrong confirm_slug
- [ ] Every soft-delete / hard-delete / restore writes exactly one `audit_log` row
- [ ] `pnpm build` + `pnpm test:unit` + `pnpm lint` pass
- [ ] Real browser E2E passes (soft-delete → restore → hard-delete with type-to-confirm)

### Must Have

- Platform-owner-only gate on hard delete (`requirePermission(MANAGE_TENANTS)`)
- Server-side type-to-confirm (`confirm_slug` must equal `tenant.slug`)
- Seed-tenant 403 guard on both soft and hard delete
- Self-lockout block (cannot delete your only org)
- Two-phase, idempotent, Prisma-direct purge
- Schema-drift self-audit before purge
- Dedicated `audit_log` table with no tenant FK
- Hard delete blocks (409) when any non-terminal task exists

### Must NOT Have (Guardrails)

- NO external API cleanup: no Slack `auth.revoke`, no Composio entity delete, no GitHub uninstall, no Supabase Auth user ban/delete
- NO Inngest run cancellation or Fly container teardown (avoided by blocking on active tasks)
- NO separate reversible "pause/inactivate" concept distinct from soft-delete
- NO bulk multi-org delete; NO auto-purge of aged soft-deletes; NO slug reservation/blocklist
- NO use of PostgREST for the purge (Prisma-direct only)
- NO generalizing hard-delete into a reusable cross-entity framework
- NO refactoring the existing `pendingApproval.deleteMany` quirk "while we're here"
- NO physical DELETE anywhere except `TenantRepository.hardDelete()`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest — `pnpm test:unit`)
- **Automated tests**: Tests-after (unit tests for repository logic + guards added alongside implementation tasks)
- **Framework**: Vitest
- **Migration**: Prisma migrate (local Docker Postgres `ai_employee`)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/API**: `curl` against `localhost:7700` with `Authorization: Bearer $SERVICE_TOKEN` (super-admin) or a PLATFORM_OWNER JWT; assert status + body.
- **DB state**: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "..."` for row counts.
- **Frontend/UI**: Playwright against `localhost:7700/dashboard/` (per AGENTS.md — never `:7701`, never headless-only for WebGL pages; this is the dashboard so standard Playwright is fine).
- **Unit logic**: `pnpm test:unit` for repository/guard units.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — foundations):
├── Task 1: audit_log model + migration + AuditLogRepository [deep]
├── Task 2: HardDeleteTenantBodySchema + validation [quick]
├── Task 3: Re-derive exact FK delete order from schema (research artifact) [deep]
└── Task 5: AdminTenant.deleted_at type + gateway client fns [quick]

Wave 2 (After Wave 1 — core logic + UI scaffolding):
├── Task 4: TenantRepository.hardDelete() + two-phase purge + schema-drift assert (depends: 1,3) [ultrabrain]
├── Task 6: Extend softDelete() cascade-suspend + force-cancel + audit (depends: 1) [deep]
├── Task 7: Extend restore() re-activate suspended archetypes + audit (depends: 1,6) [deep]
└── Task 11: Confirm dialogs (soft-delete reuse + hard-delete type-to-confirm) (depends: 5) [visual-engineering]

Wave 3 (After Wave 2 — wiring):
├── Task 8: Hard-delete route + all server guards (depends: 2,4) [deep]
├── Task 9: Wire audit + seed-guard into existing soft-delete & restore routes (depends: 6,7) [unspecified-high]
├── Task 10: AGENTS.md + README sanctioned-exception + endpoint/model docs (depends: 4,8) [writing]
└── Task 12: TenantManagementPage per-row actions + dialog wiring (depends: 8,11) [visual-engineering]

Wave FINAL (after ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real browser + DB E2E (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
-> Task N: Notify completion (Telegram)

Critical Path: Task 1 → Task 4 → Task 8 → Task 12 → F1-F4 → user okay
Max Concurrent: 4 (Waves 1 & 2)
```

### Dependency Matrix

- **1** (audit table): deps none → blocks 4, 6, 7, 9
- **2** (schema): deps none → blocks 8
- **3** (FK order): deps none → blocks 4
- **5** (FE types/client): deps none → blocks 11, 12
- **4** (hardDelete repo): deps 1, 3 → blocks 8, 10
- **6** (softDelete ext): deps 1 → blocks 7, 9
- **7** (restore ext): deps 1, 6 → blocks 9
- **11** (dialogs): deps 5 → blocks 12
- **8** (hard route): deps 2, 4 → blocks 10, 12
- **9** (wire soft/restore routes): deps 6, 7 → blocks F-wave
- **10** (docs): deps 4, 8 → blocks F-wave
- **12** (FE page): deps 8, 11 → blocks F-wave

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep`, T2 → `quick`, T3 → `deep`, T5 → `quick`
- **Wave 2**: T4 → `ultrabrain`, T6 → `deep`, T7 → `deep`, T11 → `visual-engineering`
- **Wave 3**: T8 → `deep`, T9 → `unspecified-high`, T10 → `writing`, T12 → `visual-engineering`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Every task has Recommended Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Add `audit_log` table, migration, and `AuditLogRepository`

  **What to do**:
  - Add an `AuditLog` model to `prisma/schema.prisma`: `id` (uuid pk), `actor_user_id` (String? @db.Uuid — nullable for SERVICE_TOKEN callers), `tenant_id` (String @db.Uuid, **NO relation/FK to Tenant** so rows survive a purge), `tenant_slug` (String — denormalized snapshot), `action` (String — values `soft_delete` | `hard_delete` | `restore`), `created_at` (DateTime @default(now())). `@@map("audit_log")`. Add index on `tenant_id`.
  - Run `pnpm prisma migrate dev --name add_audit_log` (local). Reload PostgREST schema cache afterward (per `prisma` skill: `NOTIFY pgrst, 'reload schema'`).
  - Create `src/repositories/audit-log-repository.ts` mirroring the constructor-injected-PrismaClient style of `src/repositories/tenant-repository.ts`. Method: `async record(input: { actor_user_id: string | null; tenant_id: string; tenant_slug: string; action: 'soft_delete' | 'hard_delete' | 'restore' }): Promise<void>`.
  - Add a unit test in `tests/unit/` for `record()`.

  **Must NOT do**:
  - Do NOT add a Prisma relation/FK from `AuditLog` to `Tenant` (it must survive hard delete).
  - Do NOT reuse `system_events` for audit.

  **Recommended Agent Profile**:
  - **Category**: `deep` — schema change + migration + repo + PostgREST cache reload have ordering subtleties.
  - **Skills**: [`prisma`, `data-access-conventions`]
    - `prisma`: migration workflow, schema-cache reload, soft-delete conventions.
    - `data-access-conventions`: repository-layer rules, PrismaClient injection.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 4, 6, 7, 9 · Blocked By: None

  **References**:
  - `src/repositories/tenant-repository.ts` — constructor + method style to mirror exactly (PrismaClient injection, async methods returning typed results).
  - `prisma/schema.prisma:342` (`model SystemEvent`) — example of a tenant-scoped model and its `@@map`; note its `onDelete: Restrict` (what we are deliberately NOT doing for audit_log).
  - `prisma` skill — `pnpm prisma migrate dev` + schema-cache reload requirement.
  - WHY: audit_log must outlive the tenant; the no-FK design is the whole point — copy the repo style but break the FK convention intentionally.

  **Acceptance Criteria**:
  - [ ] `pnpm prisma migrate dev` succeeds; migration file present under `prisma/migrations/`.
  - [ ] `pnpm test:unit` includes a passing AuditLogRepository test.

  **QA Scenarios**:

  ```
  Scenario: audit_log row persists after its tenant is hard-deleted
    Tool: Bash (psql)
    Preconditions: migration applied; a throwaway tenant row exists with id T and slug S
    Steps:
      1. INSERT an audit_log row via AuditLogRepository.record() (or psql) for tenant T, action 'hard_delete'.
      2. DELETE the tenant row T directly: psql -c "DELETE FROM tenants WHERE id='T';"
      3. SELECT count(*) FROM audit_log WHERE tenant_id='T';
    Expected Result: count = 1 (audit row survives because there is no FK).
    Failure Indicators: FK violation on step 2, or count = 0.
    Evidence: .sisyphus/evidence/task-1-audit-survives-purge.txt

  Scenario: audit_log has no FK constraint to tenants
    Tool: Bash (psql)
    Steps:
      1. psql -c "SELECT conname FROM pg_constraint WHERE conrelid='audit_log'::regclass AND contype='f';"
    Expected Result: no foreign-key constraint referencing tenants.
    Evidence: .sisyphus/evidence/task-1-no-fk.txt
  ```

  **Commit**: YES (groups with 2) — `feat(db): add audit_log table and hard-delete validation schema` — Files: `prisma/schema.prisma`, `prisma/migrations/**`, `src/repositories/audit-log-repository.ts`, `tests/unit/**` — Pre-commit: `pnpm test:unit`

- [ ] 2. Add `HardDeleteTenantBodySchema` validation

  **What to do**:
  - In `src/gateway/validation/schemas.ts`, add `HardDeleteTenantBodySchema = z.object({ confirm_slug: z.string().min(1) })`.
  - Confirm `TenantIdParamSchema` already exists and uses `UUID_REGEX` (not `z.string().uuid()`); if a new param schema is needed for the `/hard` route, reuse `TenantIdParamSchema`.

  **Must NOT do**:
  - Do NOT use `z.string().uuid()` for tenant id params (Zod v4 RFC-4122 quirk — use `UUID_REGEX`).

  **Recommended Agent Profile**:
  - **Category**: `quick` — single small schema addition.
  - **Skills**: [`api-design`]
    - `api-design`: Zod validation conventions, `UUID_REGEX` rule.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 8 · Blocked By: None

  **References**:
  - `src/gateway/validation/schemas.ts` — `TenantIdParamSchema`, `UpdateTenantBodySchema`, the `UUID_REGEX` constant. Mirror their style.
  - WHY: the confirm_slug is the server-side type-to-confirm gate (Metis G5); it must exist as a schema so the route validates it before any purge logic.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes with the new export.

  **QA Scenarios**:

  ```
  Scenario: schema rejects empty confirm_slug
    Tool: Bash (node/tsx REPL or unit test)
    Steps:
      1. Import HardDeleteTenantBodySchema, call .safeParse({ confirm_slug: '' }).
    Expected Result: success === false.
    Evidence: .sisyphus/evidence/task-2-empty-slug-rejected.txt

  Scenario: schema accepts a non-empty slug
    Tool: Bash (node/tsx REPL or unit test)
    Steps:
      1. .safeParse({ confirm_slug: 'acme-test' }).
    Expected Result: success === true, data.confirm_slug === 'acme-test'.
    Evidence: .sisyphus/evidence/task-2-valid-slug.txt
  ```

  **Commit**: YES (groups with 1)

- [ ] 3. Re-derive the exact FK delete order from the live schema (research artifact for Task 4)

  **What to do**:
  - Read `prisma/schema.prisma` in full. For EVERY model, record: does it have `tenant_id`? Does it relate (directly or transitively) to Tenant? What is its `onDelete` (Cascade / Restrict / NoAction-default)? Which tables have NO FK to tenant but carry a `tenant_id` column (`composio_connections`, `task_composio_calls`, `archetype_generation_calls`)?
  - Produce a precise leaf-first deletion order as a markdown note saved to `.sisyphus/evidence/task-3-fk-delete-order.md` (this is the authoritative input to Task 4). Mark which children are auto-removed by Tenant→Tenant Cascade (`tenant_secrets`, `feedback_events`, `employee_rules`) vs which require explicit deletes.
  - Cross-check by querying the live DB: `psql -c "SELECT conrelid::regclass AS child, confrelid::regclass AS parent, confdeltype FROM pg_constraint WHERE contype='f';"` and reconcile with the schema.

  **Must NOT do**:
  - Do NOT write any deletion code in this task — it produces the ordered list only.

  **Recommended Agent Profile**:
  - **Category**: `deep` — exhaustive, correctness-critical mapping; an error here orphans data.
  - **Skills**: [`prisma`]
    - `prisma`: schema reading, FK/onDelete semantics.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 4 · Blocked By: None

  **References**:
  - `prisma/schema.prisma` — source of truth for all models and `onDelete`.
  - `prisma/schema.prisma:342` (`model SystemEvent`) — `onDelete: Restrict` example that MUST be purged before the Tenant row.
  - WHY: Task 4's purge is only safe if the order respects every Restrict FK and explicitly handles the three FK-less tables; this artifact prevents cryptic P2003 errors and silent orphans.

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-3-fk-delete-order.md` exists with: full model→tenant_id→onDelete table, the explicit leaf-first order, the auto-cascade list, and the three FK-less tables.

  **QA Scenarios**:

  ```
  Scenario: live FK graph matches the derived order
    Tool: Bash (psql)
    Steps:
      1. psql -c "SELECT conrelid::regclass AS child, confrelid::regclass AS parent, confdeltype FROM pg_constraint WHERE contype='f' AND confrelid='tenants'::regclass;"
      2. Compare every direct child of tenants and its confdeltype (a=NoAction, c=Cascade, r=Restrict) against the derived note.
    Expected Result: every direct tenant child in the DB appears in the note with matching delete behavior.
    Evidence: .sisyphus/evidence/task-3-fk-graph.txt
  ```

  **Commit**: NO (research artifact; folded into Task 4 commit)

- [ ] 4. Implement `TenantRepository.hardDelete()` — two-phase, idempotent, Prisma-direct purge with schema-drift assertion

  **What to do**:
  - Add `async hardDelete(id: string): Promise<void>` to `src/repositories/tenant-repository.ts`. This is the codebase's ONLY sanctioned physical `prisma.*.delete()/deleteMany()`. Add a prominent code comment: `// SANCTIONED EXCEPTION to the soft-delete-only rule — see AGENTS.md. Physical purge of an entire tenant.`
  - **Schema-drift assertion (G2)** FIRST: query `information_schema.columns` for every table that has a `tenant_id` column; compare the set against the hardcoded purge list derived in Task 3. If a table with `tenant_id` is NOT handled, throw a clear error (`Error('Schema drift: unhandled tenant-scoped table(s): ...')`). This prevents a future migration from silently orphaning rows.
  - **Phase 1 (outside transaction, idempotent)**: explicit `deleteMany({ where: { tenant_id: id } })` for the three FK-less tables (`composio_connections`, `task_composio_calls`, `archetype_generation_calls`). These have no FK so order doesn't matter; doing them first means a Phase-2 rollback never orphans them.
  - **Phase 2 (single `$transaction`)**: leaf-first `deleteMany` per the Task-3 order — children before parents, respecting every Restrict FK (`system_events`, `task_status_log`, `deliverables`, `executions`, `task_metrics`, `pending_approvals`, `tasks`, `risk_models`, `agent_versions`, archetype-scoped `knowledge_bases`, `archetype_edit_history`, `archetypes`, `projects`, `departments`, `knowledge_base_entries`, `property_locks`, `tenant_memberships`, `tenant_invitations`, `tenant_integrations`), then finally `prisma.tenant.delete({ where: { id } })`. Tenant→Tenant Cascade FKs (`tenant_secrets`, `feedback_events`, `employee_rules`) are removed automatically by the final tenant delete — but include them explicitly in the transaction before the tenant delete for deterministic ordering and to avoid surprises.
  - **Prisma-direct ONLY (G1)**: use the injected `PrismaClient`. Do NOT route any part through PostgREST/`makePostgrestHeaders` (RLS silent-filter risk).
  - **Idempotency (G4)**: rely on `deleteMany` returning count 0 (not error) on already-gone rows so a retry after partial failure completes cleanly. Optionally short-circuit if the tenant row is already gone.
  - Add unit tests for: schema-drift throw path (mock an unhandled table), and correct delete ordering (mock prisma, assert call order children-before-parents).

  **Must NOT do**:
  - Do NOT make ANY external API call (no Slack/Composio/GitHub/Supabase).
  - Do NOT cancel Inngest runs or destroy Fly containers (the route blocks on active tasks, so the org is quiescent).
  - Do NOT use PostgREST anywhere in this path.
  - Do NOT generalize into a reusable purge framework — tenant-specific only.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — correctness-critical, irreversible, FK-ordered transaction with drift-guard; the single highest-risk task.
  - **Skills**: [`prisma`, `data-access-conventions`, `security`]
    - `prisma`: transaction + delete semantics, Prisma-direct vs PostgREST.
    - `data-access-conventions`: repository layer, Prisma-direct rule, no-PostgREST-for-this.
    - `security`: tenant isolation boundary awareness for a destructive cross-tenant op.

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 8, 10 · Blocked By: 1, 3

  **References**:
  - `.sisyphus/evidence/task-3-fk-delete-order.md` — authoritative deletion order (produced by Task 3).
  - `src/repositories/tenant-repository.ts:66-97` — existing `softDelete()`/`restore()` style to extend; mirror error handling and the existing-row checks.
  - `src/gateway/services/archetype-repository.ts:13-55` — `$transaction` + bulk-operation pattern to mirror for Phase 2.
  - `prisma/schema.prisma:342` (`system_events`, Restrict) and `:357` (`tenant_secrets`, Cascade) — concrete FK behaviors driving the order.
  - WHY: every reader in this codebase assumes soft-delete; this method must be airtight and isolated so it never corrupts data and is never reused by generic code.

  **Acceptance Criteria**:
  - [ ] `pnpm test:unit` includes passing tests for the drift-throw path and delete ordering.
  - [ ] Code comment marking the sanctioned exception is present.

  **QA Scenarios**:

  ```
  Scenario: purge removes all rows for a tenant across every tenant-scoped table
    Tool: Bash (psql + a tsx harness calling hardDelete)
    Preconditions: seed a throwaway tenant T (slug 'acme-test') with at least one row in tasks, executions, task_status_log, deliverables, archetypes, knowledge_base_entries, tenant_memberships, composio_connections, task_composio_calls, archetype_generation_calls, tenant_secrets. NO non-terminal tasks.
    Steps:
      1. Call TenantRepository.hardDelete('T') via a tsx script.
      2. For each tenant-scoped table, psql -c "SELECT count(*) FROM <table> WHERE tenant_id='T';"
      3. psql -c "SELECT count(*) FROM tenants WHERE id='T';"
    Expected Result: every count = 0 (including the three FK-less tables and the tenant row).
    Failure Indicators: any non-zero count; any P2003 FK error.
    Evidence: .sisyphus/evidence/task-4-zero-rows.txt

  Scenario: schema-drift assertion fails fast on an unhandled tenant-scoped table
    Tool: Bash (unit test)
    Steps:
      1. Mock information_schema to include a fake table 'orphan_widgets' with tenant_id not in the purge list.
      2. Call hardDelete.
    Expected Result: throws Error containing 'Schema drift' and 'orphan_widgets'; NO deletes executed.
    Evidence: .sisyphus/evidence/task-4-drift-guard.txt

  Scenario: idempotent re-run after the tenant is already gone
    Tool: Bash (tsx + psql)
    Steps:
      1. hardDelete('T') (succeeds). 2. Call hardDelete('T') again.
    Expected Result: second call completes without throwing (deleteMany count 0 / short-circuit), no error.
    Evidence: .sisyphus/evidence/task-4-idempotent.txt
  ```

  **Commit**: YES — `feat(tenants): add sanctioned two-phase hard-delete to TenantRepository` — Files: `src/repositories/tenant-repository.ts`, `tests/unit/**` — Pre-commit: `pnpm test:unit`

- [ ] 5. Add `AdminTenant.deleted_at` type + dashboard gateway client functions

  **What to do**:
  - In `dashboard/src/lib/types.ts`, add `deleted_at: string | null` to the `AdminTenant` type.
  - In `dashboard/src/lib/gateway.ts`, add (mirroring the existing `createTenant`/`listAllTenants` style with `gatewayFetch`):
    - `deleteTenant(tenantId: string): Promise<{ id: string; deleted_at: string }>` → `DELETE /admin/tenants/${tenantId}`
    - `restoreTenant(tenantId: string): Promise<AdminTenant>` → `POST /admin/tenants/${tenantId}/restore`
    - `hardDeleteTenant(tenantId: string, confirmSlug: string): Promise<void>` → `DELETE /admin/tenants/${tenantId}/hard` with body `{ confirm_slug: confirmSlug }`
  - Ensure `listAllTenants` returns `deleted_at` (backend already supports `include_deleted`).

  **Must NOT do**:
  - Do NOT call the gateway directly with `fetch` — use `gatewayFetch`.

  **Recommended Agent Profile**:
  - **Category**: `quick` — type + three thin client functions.
  - **Skills**: [`react-dashboard`]
    - `react-dashboard`: dashboard conventions and API-client pattern.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 11, 12 · Blocked By: None

  **References**:
  - `dashboard/src/lib/gateway.ts` — `gatewayFetch`, existing `createTenant`/`listAllTenants` to mirror exactly (auth header, error handling).
  - `dashboard/src/lib/types.ts` — `AdminTenant` type to extend.
  - WHY: the UI needs `deleted_at` to render the Deleted badge + Restore button, and typed client fns to call the three endpoints.

  **Acceptance Criteria**:
  - [ ] `pnpm dashboard:build` (or `pnpm build`) compiles with the new type + functions.

  **QA Scenarios**:

  ```
  Scenario: dashboard typechecks/builds with the new client surface
    Tool: Bash
    Steps:
      1. Run the dashboard build (pnpm dashboard:build).
    Expected Result: build succeeds; deleteTenant/restoreTenant/hardDeleteTenant + AdminTenant.deleted_at resolve.
    Evidence: .sisyphus/evidence/task-5-dashboard-build.txt
  ```

  **Commit**: YES (groups with 11, 12) — `feat(dashboard): org delete/restore/hard-delete actions`

- [ ] 6. Extend `TenantRepository.softDelete()` — cascade-suspend archetypes + force-cancel active tasks

  **What to do**:
  - Wrap `softDelete(id)` body in a `$transaction` (mirror `ArchetypeRepository.softDelete()`).
  - Keep existing idempotent behavior (already-deleted → return existing).
  - **Force-cancel active tasks (G10)**: optimistic `tasks.updateMany({ where: { tenant_id: id, status: { notIn: ['Done','Failed','Cancelled'] } }, data: { status: 'Cancelled' } })`. For consistency with the archetype precedent, also write `task_status_log` entries for cancelled tasks and `pendingApproval.deleteMany({ where: { task_id: { in: cancelledIds } } })`.
  - **Cascade-suspend archetypes**: soft-delete all the tenant's archetypes — set `deleted_at = <same timestamp as tenant>` and `status = 'inactive'`. Use a single shared `const now = new Date()` for both the tenant and its archetypes so restore can match them precisely.
  - Set `Tenant.deleted_at = now` (keep existing). Return the updated tenant.
  - Add unit tests: active tasks get Cancelled; archetypes get `deleted_at`+`inactive`; idempotency preserved.

  **Must NOT do**:
  - Do NOT cancel Inngest runs / destroy Fly containers (out of scope; soft-delete is recoverable and the worker will read `Cancelled` and exit).
  - Do NOT change the existing route's auth gate here (route stays `requireTenantRole(OWNER)`; audit + seed guard are wired in Task 9).
  - Do NOT refactor the inherited `pendingApproval.deleteMany` quirk.

  **Recommended Agent Profile**:
  - **Category**: `deep` — transactional multi-table state change with restore symmetry.
  - **Skills**: [`prisma`, `data-access-conventions`]
    - `prisma`: `$transaction`, updateMany semantics.
    - `data-access-conventions`: repository layer rules.

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 7, 9 · Blocked By: 1

  **References**:
  - `src/gateway/services/archetype-repository.ts:13-55` — exact force-cancel + status-log + pendingApproval pattern to mirror.
  - `src/repositories/tenant-repository.ts:66-78` — existing `softDelete` to extend.
  - `src/lib/task-status.ts` — `TERMINAL_STATUSES` (`Done`,`Failed`,`Cancelled`).
  - WHY: today's soft-delete only sets the tenant flag; the org's employees keep running. The shared timestamp is what makes restore reversible precisely.

  **Acceptance Criteria**:
  - [ ] `pnpm test:unit` covers task-cancel, archetype-suspend, idempotency.

  **QA Scenarios**:

  ```
  Scenario: soft-delete stops the org (tasks cancelled, archetypes suspended)
    Tool: Bash (psql + tsx or curl the existing DELETE route)
    Preconditions: throwaway tenant T with one Executing task and one active archetype.
    Steps:
      1. Call softDelete('T') (or curl DELETE /admin/tenants/T as OWNER).
      2. psql: SELECT status FROM tasks WHERE tenant_id='T'; → Cancelled
      3. psql: SELECT deleted_at, status FROM archetypes WHERE tenant_id='T'; → deleted_at set, status='inactive'
      4. psql: SELECT deleted_at FROM tenants WHERE id='T'; → set, equals archetype deleted_at
    Expected Result: all assertions hold; tenant + archetype deleted_at timestamps match.
    Evidence: .sisyphus/evidence/task-6-soft-delete-cascade.txt

  Scenario: soft-delete is idempotent
    Tool: Bash (tsx)
    Steps: 1. softDelete('T'). 2. softDelete('T') again.
    Expected Result: second call returns existing tenant, no error, no duplicate state changes.
    Evidence: .sisyphus/evidence/task-6-idempotent.txt
  ```

  **Commit**: YES (groups with 7) — `feat(tenants): cascade-suspend on soft-delete and reactivate on restore`

- [ ] 7. Extend `TenantRepository.restore()` — reactivate the archetypes soft-delete suspended

  **What to do**:
  - Keep the existing slug-collision guard (returns/throws a clean conflict if the slug was reclaimed while deleted).
  - Read the tenant's `deleted_at` before clearing it. In a `$transaction`: clear `Tenant.deleted_at = null`, then reactivate ONLY the archetypes whose `deleted_at` equals the tenant's `deleted_at` (i.e., the ones THIS soft-delete suspended) — set their `deleted_at = null` and `status = 'active'`. Archetypes deleted independently earlier (different timestamp) stay deleted.
  - Add unit tests: only matching-timestamp archetypes reactivate; slug-collision still raises conflict.

  **Must NOT do**:
  - Do NOT un-cancel previously cancelled tasks (cancelled tasks are terminal; restore does not resurrect task execution — document this in the method comment).
  - Do NOT reactivate archetypes that were deleted before the tenant soft-delete.

  **Recommended Agent Profile**:
  - **Category**: `deep` — timestamp-matching reactivation logic with edge cases.
  - **Skills**: [`prisma`, `data-access-conventions`]

  **Parallelization**: Can Run In Parallel: NO (after 6) · Wave 2 · Blocks: 9 · Blocked By: 1, 6

  **References**:
  - `src/repositories/tenant-repository.ts:80-97` — existing `restore()` + slug-collision guard.
  - Task 6 implementation — the shared timestamp is the join key for reactivation.
  - WHY: without timestamp-scoped reactivation, restore would resurrect archetypes the owner had intentionally deleted earlier, or leave the org's employees dead after a restore.

  **Acceptance Criteria**:
  - [ ] `pnpm test:unit` covers timestamp-scoped reactivation + slug-collision conflict.

  **QA Scenarios**:

  ```
  Scenario: restore reactivates only the archetypes this soft-delete suspended
    Tool: Bash (psql + tsx)
    Preconditions: tenant T with archetype A (deleted independently yesterday) and archetype B (active). Soft-delete T (suspends B with timestamp ts).
    Steps:
      1. restore('T').
      2. psql: SELECT id, deleted_at, status FROM archetypes WHERE tenant_id='T';
    Expected Result: B → deleted_at NULL, status 'active'; A → still deleted (untouched); tenant deleted_at NULL.
    Evidence: .sisyphus/evidence/task-7-restore-scoped.txt

  Scenario: restore fails cleanly when slug was reclaimed
    Tool: Bash (curl)
    Preconditions: soft-delete tenant slug 'acme-test', then create a new tenant with slug 'acme-test'.
    Steps:
      1. curl POST /admin/tenants/<oldId>/restore.
    Expected Result: 409 CONFLICT with a clear message; old tenant stays deleted.
    Evidence: .sisyphus/evidence/task-7-restore-conflict.txt
  ```

  **Commit**: YES (groups with 6)

- [ ] 8. Add the platform-owner hard-delete route with all server guards

  **What to do**:
  - In `src/gateway/routes/admin-tenants.ts`, add `DELETE /admin/tenants/:tenantId/hard` gated by `authMiddleware, requireAuth, requirePermission(PERMISSIONS.MANAGE_TENANTS)` (PLATFORM_OWNER or SERVICE_TOKEN only).
  - Validate params with `TenantIdParamSchema.safeParse(req.params)` and body with `HardDeleteTenantBodySchema.safeParse(req.body)`.
  - Guard order (all via `sendError` with appropriate codes):
    1. **Seed-tenant guard (G6)**: if `tenantId` ∈ `{00000000-0000-0000-0000-000000000002, 00000000-0000-0000-0000-000000000003}` → 403. Define `PROTECTED_TENANT_IDS` as a module constant.
    2. **Existence**: tenant not found → 404.
    3. **Type-to-confirm (G5)**: `body.confirm_slug !== tenant.slug` → 400 with a clear message.
    4. **Self-lockout (G7)**: if the requesting user is a real user (not SERVICE_TOKEN) and their ONLY non-deleted `tenant_memberships` row is this tenant → 4xx with "cannot delete your only organization".
    5. **Active-task block (409)**: if any task for this tenant has `status NOT IN ('Done','Failed','Cancelled')` → 409 with the active count. (This is what makes orchestration teardown unnecessary.)
  - On all guards passing: call `TenantRepository.hardDelete(tenantId)`, then write an `audit_log` row via `AuditLogRepository.record({ actor_user_id: req.auth?.userId ?? null, tenant_id, tenant_slug, action: 'hard_delete' })` (write audit AFTER purge succeeds; audit_log has no tenant FK so it persists). Respond `sendSuccess(res, 200, { id: tenantId, purged: true })`.

  **Must NOT do**:
  - Do NOT gate with `requireTenantRole(OWNER)` (that allows tenant owners — wrong).
  - Do NOT put raw Prisma in the route — all DB work via repositories.
  - Do NOT skip any guard; order matters (seed → exist → confirm → lockout → active-task).

  **Recommended Agent Profile**:
  - **Category**: `deep` — multi-guard destructive endpoint with precise ordering and auth.
  - **Skills**: [`api-design`, `security`, `data-access-conventions`]
    - `api-design`: route structure, `sendError`/`sendSuccess`, `UUID_REGEX`, ERROR_CODES.
    - `security`: `requirePermission(MANAGE_TENANTS)` gating, platform-owner vs tenant-owner.
    - `data-access-conventions`: repository-only DB access.

  **Parallelization**: Can Run In Parallel: NO (after 4) · Wave 3 · Blocks: 10, 12 · Blocked By: 2, 4

  **References**:
  - `src/gateway/routes/admin-tenants.ts:31,67,143` — existing `MANAGE_TENANTS` gating on POST/GET (mirror), and the existing `DELETE` soft-delete handler shape.
  - `src/gateway/middleware/authz.ts:80-83` — `requirePermission` PLATFORM_OWNER bypass.
  - `src/lib/auth/permissions.ts:11,41` — `PERMISSIONS.MANAGE_TENANTS`.
  - `src/gateway/lib/http-response.ts` — `sendError`/`sendSuccess`.
  - `src/lib/task-status.ts` — terminal statuses for the active-task check.
  - WHY: this endpoint is the only door to an irreversible operation; the layered guards are the only safety net (no undo).

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes; route registered.
  - [ ] Unit/integration coverage for each guard branch (403 seed, 404, 400 confirm, lockout, 409 active).

  **QA Scenarios**:

  ```
  Scenario: happy path — quiescent non-seed org is purged
    Tool: Bash (curl + psql)
    Preconditions: throwaway tenant T slug 'acme-test', NO non-terminal tasks.
    Steps:
      1. curl -X DELETE -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" -d '{"confirm_slug":"acme-test"}' localhost:7700/admin/tenants/T/hard
      2. psql: SELECT count(*) FROM tenants WHERE id='T'; → 0
      3. psql: SELECT count(*) FROM audit_log WHERE tenant_id='T' AND action='hard_delete'; → 1
    Expected Result: 200; tenant gone; one hard_delete audit row.
    Evidence: .sisyphus/evidence/task-8-hard-delete-happy.txt

  Scenario: seed tenant is protected
    Tool: Bash (curl)
    Steps:
      1. curl -X DELETE -H "Authorization: Bearer $SERVICE_TOKEN" -d '{"confirm_slug":"dozaldevs"}' localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/hard
    Expected Result: 403; tenant still exists (psql count = 1).
    Evidence: .sisyphus/evidence/task-8-seed-403.txt

  Scenario: wrong confirm_slug is rejected
    Tool: Bash (curl)
    Steps: 1. curl ...T/hard -d '{"confirm_slug":"wrong"}'
    Expected Result: 400; tenant untouched.
    Evidence: .sisyphus/evidence/task-8-confirm-400.txt

  Scenario: active task blocks hard delete
    Tool: Bash (curl + psql)
    Preconditions: tenant T with one Executing task.
    Steps: 1. curl ...T/hard -d '{"confirm_slug":"acme-test"}'
    Expected Result: 409 with active count; tenant + task untouched.
    Evidence: .sisyphus/evidence/task-8-active-409.txt
  ```

  **Commit**: YES (groups with 9) — `feat(api): platform-owner hard-delete endpoint with guards and audit`

- [ ] 9. Wire audit + seed-guard into the existing soft-delete and restore routes

  **What to do**:
  - In the existing `DELETE /admin/tenants/:tenantId` handler: add the same `PROTECTED_TENANT_IDS` seed-guard (403) BEFORE calling `softDelete`. After a successful soft-delete, write an `audit_log` row (`action: 'soft_delete'`, actor from `req.auth?.userId ?? null`, tenant_slug from the tenant).
  - In the existing `POST /admin/tenants/:tenantId/restore` handler: after a successful restore, write an `audit_log` row (`action: 'restore'`).
  - Reuse a small shared helper for `PROTECTED_TENANT_IDS` (define once, import in both the hard-delete and soft-delete handlers — do not duplicate the set).

  **Must NOT do**:
  - Do NOT change the soft-delete route's auth gate (stays `requireTenantRole(OWNER)` per decision).
  - Do NOT add the active-task 409 block to soft-delete (soft-delete force-cancels instead — that logic lives in Task 6).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — touches existing handlers carefully without regressions.
  - **Skills**: [`api-design`, `data-access-conventions`]

  **Parallelization**: Can Run In Parallel: NO (after 6,7) · Wave 3 · Blocks: F-wave · Blocked By: 6, 7

  **References**:
  - `src/gateway/routes/admin-tenants.ts:143` (soft-delete) and the restore handler below it.
  - Task 8 — the `PROTECTED_TENANT_IDS` constant + `AuditLogRepository.record` call to reuse.
  - WHY: soft-delete and restore must also be audited and seed-guarded for full accountability and accident-prevention parity with hard delete.

  **Acceptance Criteria**:
  - [ ] Soft-delete of a seed tenant → 403.
  - [ ] Soft-delete and restore each write exactly one audit row.

  **QA Scenarios**:

  ```
  Scenario: soft-delete and restore are audited
    Tool: Bash (curl + psql)
    Preconditions: throwaway tenant T (OWNER membership for the caller).
    Steps:
      1. curl -X DELETE .../admin/tenants/T  (as OWNER)
      2. curl -X POST .../admin/tenants/T/restore
      3. psql: SELECT action FROM audit_log WHERE tenant_id='T' ORDER BY created_at;
    Expected Result: rows ['soft_delete','restore'].
    Evidence: .sisyphus/evidence/task-9-audit-soft-restore.txt

  Scenario: seed tenant cannot be soft-deleted
    Tool: Bash (curl)
    Steps: 1. curl -X DELETE .../admin/tenants/00000000-0000-0000-0000-000000000003
    Expected Result: 403; tenant intact.
    Evidence: .sisyphus/evidence/task-9-seed-soft-403.txt
  ```

  **Commit**: YES (groups with 8)

- [ ] 10. Document the sanctioned physical-delete exception + new endpoint/model

  **What to do**:
  - In `AGENTS.md`: under the soft-delete-only convention, add a "Sanctioned exception" note stating that `TenantRepository.hardDelete()` is the ONE allowed physical delete (platform-owner org purge), so future linters/reviewers don't "fix" it. Add the new `DELETE /admin/tenants/:tenantId/hard` endpoint and the `audit_log` model to the appropriate AGENTS.md sections (new Prisma model, new gateway route).
  - In `README.md`: add the `DELETE /admin/tenants/:tenantId/hard` row to the admin API endpoint table.
  - Follow AGENTS.md "Documentation Durability" rule — describe the invariant, don't add volatile counts.

  **Must NOT do**:
  - Do NOT create a new standalone doc file unless necessary; update existing AGENTS.md/README.md.

  **Recommended Agent Profile**:
  - **Category**: `writing` — documentation accuracy and convention compliance.
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: Can Run In Parallel: NO (after 4,8) · Wave 3 · Blocks: F-wave · Blocked By: 4, 8

  **References**:
  - `AGENTS.md` — "Soft deletes only — never hard delete" convention; "Documentation Freshness" + "Durability" rules; Skills/route/model sections.
  - `README.md` — admin API endpoint table.
  - WHY: the physical delete is a deliberate, isolated exception; documenting it prevents accidental removal and keeps the endpoint catalog current.

  **Acceptance Criteria**:
  - [ ] AGENTS.md contains the sanctioned-exception note naming `TenantRepository.hardDelete()`.
  - [ ] README.md admin endpoint table includes the `/hard` route.

  **QA Scenarios**:

  ```
  Scenario: docs reference the new endpoint and exception
    Tool: Bash (grep)
    Steps:
      1. grep -n "hardDelete" AGENTS.md ; grep -n "tenants/:tenantId/hard" README.md
    Expected Result: both matches present.
    Evidence: .sisyphus/evidence/task-10-docs.txt
  ```

  **Commit**: YES — `docs: document org hard-delete sanctioned exception and endpoint`

- [ ] 11. Build the confirmation dialogs (soft-delete reuse + hard-delete type-to-confirm)

  **What to do**:
  - Create `dashboard/src/panels/tenants/components/DeleteOrgDialog.tsx` — copy the `DeleteEmployeeDialog` shape (Dialog/DialogContent/DialogFooter, `variant="destructive"`, loading state, `toast`, `onClose`+`refresh`). Copy = "Delete organization "{name}"? You can restore it later." Calls `deleteTenant`.
  - Create `dashboard/src/panels/tenants/components/HardDeleteOrgDialog.tsx` — destructive dialog requiring the user to type the org's exact slug into a text input; the confirm button is disabled until `typed === org.slug`. Copy warns it is permanent and irreversible. Calls `hardDeleteTenant(id, typedSlug)`. Surface backend errors (409 active tasks, 403 seed, 400 mismatch) via `toast.error` with the server message.
  - Use non-technical "Organization" language throughout.

  **Must NOT do**:
  - Do NOT invent a new dropdown — N/A here, but follow card/dialog conventions.
  - Do NOT allow hard-delete confirm enabled before exact slug match.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — UI components + UX of a destructive confirm.
  - **Skills**: [`react-dashboard`, `web-design-guidelines`]
    - `react-dashboard`: dialog/card conventions, non-technical language.
    - `web-design-guidelines`: accessible destructive-action UX.

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 12 · Blocked By: 5

  **References**:
  - `dashboard/src/panels/employees/components/DeleteEmployeeDialog.tsx` — canonical destructive dialog to copy.
  - `dashboard/src/components/ui/dialog.tsx` — Dialog primitives.
  - Task 5 — `deleteTenant`/`hardDeleteTenant` client fns.
  - WHY: type-to-confirm is the UI half of guardrail G5; reuse keeps it consistent with existing destructive flows.

  **Acceptance Criteria**:
  - [ ] Dashboard builds; both dialogs render; hard-delete confirm disabled until slug matches.

  **QA Scenarios**:

  ```
  Scenario: hard-delete confirm enables only on exact slug match
    Tool: Playwright (localhost:7700/dashboard/)
    Steps:
      1. Open HardDeleteOrgDialog for org slug 'acme-test'.
      2. Type 'acme' → assert confirm button [disabled].
      3. Type 'acme-test' → assert confirm button enabled.
    Expected Result: button toggles exactly on full match.
    Evidence: .sisyphus/evidence/task-11-type-to-confirm.png

  Scenario: soft-delete dialog confirms and shows success toast
    Tool: Playwright
    Steps: 1. Open DeleteOrgDialog. 2. Click Delete. 3. Wait for success toast.
    Expected Result: toast "Organization ... deleted" (or similar); list refreshes.
    Evidence: .sisyphus/evidence/task-11-soft-delete-dialog.png
  ```

  **Commit**: YES (groups with 5, 12)

- [ ] 12. Add per-row Delete / Restore / Hard-Delete actions to TenantManagementPage

  **What to do**:
  - In `dashboard/src/pages/TenantManagementPage.tsx`, add a per-row action control (kebab/menu or buttons) in the table:
    - Active org: "Delete" (opens `DeleteOrgDialog`) and "Hard delete" (opens `HardDeleteOrgDialog`).
    - Deleted org (when `deleted_at` set, shown via the existing "Show deleted" toggle): a "Deleted" badge + "Restore" action (calls `restoreTenant`) and still "Hard delete".
  - Wire dialog open/close state; on success, call the page's existing refresh/`listAllTenants`.
  - This page is already behind `PlatformOwnerRoute`, so platform-owner gating is inherent in the UI; the backend enforces it regardless.
  - Use "Organization" language.

  **Must NOT do**:
  - Do NOT expose these actions on the per-tenant `TenantOverview` page (out of scope — platform-owner page only).
  - Do NOT bypass the dialogs (no one-click destructive actions).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — table actions + state wiring.
  - **Skills**: [`react-dashboard`, `web-design-guidelines`]

  **Parallelization**: Can Run In Parallel: NO (after 8,11) · Wave 3 · Blocks: F-wave · Blocked By: 8, 11

  **References**:
  - `dashboard/src/pages/TenantManagementPage.tsx` — existing table + "Show deleted" toggle + `listAllTenants`.
  - `dashboard/src/panels/employees/components/` — kebab/action-menu precedent if present.
  - Task 11 dialogs; Task 5 client fns.
  - WHY: this is the operator's entry point; the deleted-row Restore + Hard-delete completes the lifecycle UI.

  **Acceptance Criteria**:
  - [ ] Dashboard builds; active rows show Delete + Hard delete; deleted rows show Deleted badge + Restore + Hard delete.

  **QA Scenarios**:

  ```
  Scenario: full lifecycle from the platform-owner page
    Tool: Playwright (localhost:7700/dashboard/) + psql
    Preconditions: throwaway org 'acme-test' exists; logged in as PLATFORM_OWNER.
    Steps:
      1. On TenantManagementPage, click Delete on 'acme-test' row → confirm → row shows Deleted badge (toggle Show deleted).
      2. psql: SELECT deleted_at FROM tenants WHERE slug='acme-test'; → set.
      3. Click Restore → row returns to active.
      4. Click Hard delete → type 'acme-test' → confirm.
      5. psql: SELECT count(*) FROM tenants WHERE slug='acme-test'; → 0.
    Expected Result: each step reflects in UI and DB; final state fully purged.
    Evidence: .sisyphus/evidence/task-12-lifecycle.png

  Scenario: hard-delete surfaces a 409 when org has active tasks
    Tool: Playwright + (trigger a task first)
    Steps: 1. With an Executing task on the org, attempt Hard delete + type-to-confirm.
    Expected Result: error toast with active-task message; org NOT purged (psql count = 1).
    Evidence: .sisyphus/evidence/task-12-active-409-ui.png
  ```

  **Commit**: YES (groups with 5, 11)

- [ ] 13. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review. (`tsx scripts/telegram-notify.ts "..."`)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> Never mark F1-F4 checked before the user's okay. Rejection -> fix -> re-run -> present again -> wait.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read this plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run psql). For each "Must NOT Have": grep the codebase for forbidden patterns (Slack auth.revoke, Composio delete, PostgREST in purge path, any `prisma.*.delete(` outside `TenantRepository.hardDelete`) — reject with file:line if found. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, commented-out code, unused imports, AI slop (over-abstraction, generic names). Confirm the purge uses Prisma-direct (no `makePostgrestHeaders`), repository layer (no raw Prisma in routes), `sendError`/`sendSuccess`, `UUID_REGEX`.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Browser + DB E2E** — `unspecified-high` (+ `playwright` skill)
      Start from clean state (`pnpm dev` running, Docker image built). Execute EVERY QA scenario across all tasks against a throwaway test org. Full browser flow on `localhost:7700/dashboard/`: create a test org → soft-delete it (verify archetypes suspended, tasks cancelled, audit row) → restore it (verify reactivated, audit row) → hard-delete with type-to-confirm (verify 0 rows everywhere via psql, audit row). Verify seed-tenant 403, active-task 409, wrong-confirm-slug 400, self-lockout block. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | DB-zero-rows [PASS/FAIL] | Guards [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — everything specified built, nothing beyond spec. Confirm "Must NOT do" compliance (no external cleanup, no orchestration teardown, no reusable framework, physical DELETE only in `hardDelete()`). Detect cross-task contamination and unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

---

## Commit Strategy

- Group 1 (Task 1, 2): `feat(db): add audit_log table and hard-delete validation schema`
- Group 2 (Task 3): no commit (research artifact folded into Task 4)
- Group 3 (Task 4): `feat(tenants): add sanctioned two-phase hard-delete to TenantRepository`
- Group 4 (Task 6, 7): `feat(tenants): cascade-suspend on soft-delete and reactivate on restore`
- Group 5 (Task 5, 11, 12): `feat(dashboard): org delete/restore/hard-delete actions`
- Group 6 (Task 8, 9): `feat(api): platform-owner hard-delete endpoint with guards and audit`
- Group 7 (Task 10): `docs: document org hard-delete sanctioned exception and endpoint`

Pre-commit: `pnpm lint && pnpm test:unit && pnpm build`

---

## Success Criteria

### Verification Commands

```bash
# Purge leaves zero rows for the tenant across all tenant-scoped tables
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*) FROM tasks WHERE tenant_id='<id>';"  # Expected: 0
# Hard delete blocked for seed tenant
curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $SERVICE_TOKEN" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/hard" -H "Content-Type: application/json" -d '{"confirm_slug":"dozaldevs"}'  # Expected: 403
# Audit rows exist
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT action, count(*) FROM audit_log GROUP BY action;"  # Expected: soft_delete/hard_delete/restore rows
pnpm build && pnpm lint && pnpm test:unit  # Expected: all pass
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Real browser E2E passed and evidence captured
