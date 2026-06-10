# Production Dashboard 500s — Migration Drift Remediation

## TL;DR

> **Quick Summary**: Production dashboard pages return HTTP 500 because 4 Prisma migrations were never applied to the production Supabase database. The critical one (`add_deleted_at_to_active_tables`) means the gateway queries a `deleted_at` column that doesn't exist, crashing `/tasks`, `/employee-rules`, and `/task-metrics`. The fix is to safely apply the missing migrations to production after backups and pre-flight guards.
>
> **Deliverables**:
>
> - Production DB backup (full + targeted dead-table dump) before any DDL
> - **Phase A (urgent)**: `deleted_at` columns applied to 6 tables → 500s stop
> - **Phase B (gated, requires user go-ahead)**: FK indexes + status CHECK constraints + dead-table drops, each behind a passing pre-flight guard
> - Verified-green dashboard endpoints (HTTP 200, zero `P2022` in logs over 2+ minutes of polling)
> - `_prisma_migrations` history reconciled (all intended migrations recorded, none rolled back)
> - Docs updated (production debugging guide gets the new failure mode + the IPv6-direct-host gotcha)
>
> **Estimated Effort**: Short (the work is verification-heavy DDL, not code)
> **Parallel Execution**: NO — production DB change; strictly sequential and gated by design
> **Critical Path**: Pre-flight verify → Backup → Phase A apply → Phase A verify → (user gate) → Phase B pre-flight → Phase B apply → Phase B verify → Docs → Notify

---

## Context

### Original Request

User reported production dashboard errors. Two failing requests captured from the browser network tab:

- `GET https://ai-employees-laaa.onrender.com/admin/tenants/00000000-0000-0000-0000-000000000004/tasks?order=desc` → `500 {"error":"INTERNAL_ERROR"}`
- `GET https://ai-employees-laaa.onrender.com/admin/tenants/00000000-0000-0000-0000-000000000003/employee-rules?archetype_id=...&limit=50` → `500 {"error":"INTERNAL_ERROR"}`

Caller authenticated with a valid Supabase ES256 JWT (`victor@dozaldevs.com`). Auth is NOT the problem.

### Investigation Summary (root cause is PROVEN, not hypothesized)

**Render production logs** (service `srv-d8f1b2gg4nts738dj7jg`, component `admin-reads`) show the real error masked behind `INTERNAL_ERROR`:

```
PrismaClientKnownRequestError (P2022):
  The column `tasks.deleted_at` does not exist in the current database.
  The column `task_metrics.deleted_at` does not exist in the current database.
  at async file:///app/dist/gateway/routes/admin-reads.js:75:27   (tasks)
  at async file:///app/dist/gateway/routes/admin-reads.js:238:29  (task_metrics)
```

The dashboard tasks page polls `tasks` + `task_metrics` (and the employee detail page polls `employee_rules`) every ~5s, which is why the logs are flooded.

**Direct production DB query** (via the IPv4 session pooler `aws-1-us-west-2.pooler.supabase.com:5432`) confirms 8 tables are missing `deleted_at`:
`tasks`, `task_metrics`, `employee_rules`, `feedback_events`, `knowledge_base_entries`, `pending_approvals`, `tenant_invitations`, `tenant_secrets`. Tables WITH `deleted_at`: `archetypes`, `platform_settings`, `tenant_memberships`, `tenants`, `users`.

**Migration history diff** — prod `_prisma_migrations` has 55 rows (0 failed, 0 rolled-back); local has 59 migration directories. EXACTLY 4 migrations are recorded locally but absent from prod:

1. `202606070845100_add_fk_indexes`
2. `20260607084955_add_deleted_at_to_active_tables` ← **fixes the 500s**
3. `20260607095800_add_status_check_constraints`
4. `202606080425250_drop_dead_tables`

The June-9 `add_user_auth_rbac` migration IS applied even though it sorts after the four missing ones → an out-of-order / partial `prisma migrate deploy` happened in production. Prisma applies any unrecorded migration regardless of timestamp ordering relative to already-applied ones; it does NOT re-apply June-9.

### Migration risk classification (each file read in full)

| Migration                                        | Operation                                                                                                                                                                                 | Risk                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `202606070845100_add_fk_indexes`                 | `CREATE INDEX IF NOT EXISTS` ×5                                                                                                                                                           | **Safe / idempotent**                                                                 |
| `20260607084955_add_deleted_at_to_active_tables` | `ADD COLUMN IF NOT EXISTS deleted_at` on `tasks, executions, pending_approvals, employee_rules, feedback_events, task_metrics`                                                            | **Safe / idempotent. THE FIX.**                                                       |
| `20260607095800_add_status_check_constraints`    | `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT CHECK` on `tasks.status` (13 states; drops legacy `Stale`/`AwaitingApproval`) and `executions.status` (pending/running/completed/failed) | **⚠️ ADD fails if any prod row holds a disallowed value. Not idempotent on the ADD.** |
| `202606080425250_drop_dead_tables`               | `DROP CONSTRAINT` ×7 + `DROP TABLE` ×5 (`audit_log, clarifications, cross_dept_triggers, reviews, validation_runs`) — **no `IF EXISTS`**                                                  | **⚠️ DESTRUCTIVE + errors if any already absent.**                                    |

### Discrepancy reconciliation (Metis flagged; RESOLVED, benign)

- `tenant_invitations` legitimately has **no** `deleted_at` by design (AGENTS.md: "No `deleted_at` — status transitions are the lifecycle"). Its absence is correct.
- `tenant_secrets` and `knowledge_base_entries` have `deleted_at` in `schema.prisma` but **no migration ever adds it** — a pre-existing, separate schema-vs-migration drift, NOT caused by the 4 missing migrations and NOT a cause of today's 500s (no polled endpoint queries those columns). Captured as out-of-scope follow-up below, not part of this fix.
- Today's 500s are caused ONLY by `tasks`, `task_metrics`, `employee_rules` — all fixed by migration #2.

### Connection topology (Metis flagged; RESOLVED with hard evidence)

- Render's `DATABASE_URL_DIRECT` = `db.gjqrysxpvktmibpkwrvy.supabase.co:5432` → the **IPv6-only direct host**, not routable from a typical local machine (this is the "no route to host" the investigator hit). It resolves fine from inside Render.
- Session pooler `aws-1-us-west-2.pooler.supabase.com:5432` is **IPv4 and reachable** (verified: a `psql` query through it returned `connected via 5432|55`). Session-mode pooling supports prepared statements → safe for `prisma migrate deploy`.
- Port **6543** is the transaction pooler — must NOT be used for migrations (prepared-statement + `search_path` issues; requires `?pgbouncer=true` for Prisma).

### Confirmed Decisions (user-approved)

- **Scope: Phase A + Phase B (full sync).** Apply ALL 4 missing migrations this run, including the destructive `drop_dead_tables` and the status CHECK constraints — but Phase B still runs ONLY after its pre-flight guard (Task 5) passes and the backup (Task 2) exists. The user gate after Task 4 is now a "proceed" checkpoint (scope is approved), not a go/no-go on whether Phase B happens.
- **Execution path: Render shell.** Apply migrations from a Render shell/one-off on service `srv-d8f1b2gg4nts738dj7jg`, where the IPv6 `DATABASE_URL_DIRECT` host resolves natively, using `pnpm prisma migrate deploy`. The local session-pooler :5432 path is the documented fallback only if a Render shell is unavailable. All read/verify `psql` queries still use the :5432 session pooler from the executor's environment.
- **Plan review: none (start work now).** No Momus high-accuracy loop requested.

> **Important consequence of "full sync via Render shell":** Because `pnpm prisma migrate deploy` applies ALL pending migrations in order (#1→#2→#3→#4) atomically per-migration, the safe ordering is: (1) Task 2 backup, (2) Task 5 pre-flight guard FIRST (run it before the deploy, since deploy will reach the destructive #4), then (3) a single `migrate deploy` from the Render shell that applies all four. The plan's task order accommodates this — see the Execution Strategy note below.

### Metis Review — gaps addressed

- Pre-flight guards added for the constraint + drop migrations (data-violation + table-existence checks).
- Mandatory full backup + targeted dead-table dump before any DDL.
- Phase split: urgent safe fix isolated from destructive operations.
- `_prisma_migrations` failed/rolled-back check before any deploy.
- "Apply only deleted_at" path uses raw SQL + `migrate resolve --applied` to keep history consistent without triggering the destructive migrations.
- Execution path resolved (Render shell preferred; local-via-session-pooler fallback).

---

## Work Objectives

### Core Objective

Restore the production dashboard by safely applying the missing `deleted_at` columns to production, then (only with explicit go-ahead) reconcile the remaining 3 drifted migrations — without data loss and without leaving the Prisma migration history inconsistent.

### Concrete Deliverables

- Production backup artifacts (full SQL dump + per-dead-table data dump) with confirmed row counts
- `deleted_at` column present on `tasks, executions, pending_approvals, employee_rules, feedback_events, task_metrics` in production
- `/admin/tenants/:id/tasks`, `/admin/tenants/:id/employee-rules`, and the task-metrics read returning HTTP 200 in production
- `_prisma_migrations` reflecting the applied migration(s) with `finished_at` set and `rolled_back_at NULL`
- (Phase B, gated) FK indexes created, status CHECK constraints present, 5 dead tables dropped
- Updated `docs/guides/2026-06-01-2246-production-debugging-guide.md` with this failure mode + the IPv6-direct-host gotcha

### Definition of Done

- [ ] `curl -o /dev/null -w "%{http_code}"` on both failing endpoints returns `200`
- [ ] Render logs show zero `P2022` / `deleted_at does not exist` over a ≥2-minute window (≥24 poll cycles)
- [ ] `information_schema.columns` confirms `deleted_at` on all 6 target tables
- [ ] `_prisma_migrations` has zero rows with `finished_at IS NULL OR rolled_back_at IS NOT NULL`

### Must Have

- A verified production backup BEFORE any DDL (AGENTS.md mandatory backup rule)
- The `deleted_at` fix applied through a connection that supports prepared statements (Render shell, or session pooler :5432) — never the :6543 transaction pooler
- Pre-flight data/existence guards passing before the constraint and drop migrations
- Migration history kept consistent (no raw SQL without a matching `migrate resolve`)

### Must NOT Have (Guardrails)

- **No DDL before a confirmed backup exists.** Every schema-changing step is blocked until the backup task reports success with row counts.
- **No use of the :6543 transaction pooler for migrations or DDL.** Use Render shell or the :5432 session pooler only.
- **No bundling of `drop_dead_tables` into the urgent fix.** Phase A must not depend on Phase B, and the destructive drop must never run to fix the 500s.
- **No `prisma migrate deploy` run while any `_prisma_migrations` row is failed/rolled-back.** Resolve first.
- **No raw `deleted_at` SQL applied without immediately recording it via `prisma migrate resolve --applied`.**
- **No editing of `prisma/migrations/*` SQL files.** They are an applied, immutable history; the fix is deployment + reconciliation, not rewriting migrations. (Exception: if Phase B drop must be made idempotent, do it via a NEW migration, never by editing an existing one — and only with user approval.)
- **No code changes to `src/gateway/routes/admin-reads.ts`.** The code is correct; the database is behind. (A separate, optional hardening item is listed but is not required to fix the incident.)
- **No touching the pre-existing `tenant_secrets`/`knowledge_base_entries` deleted_at drift** in this plan — it is unrelated to the incident and out of scope.
- **No local `pnpm prisma migrate dev`, `db push`, or `migrate reset` against production** — these can drop/alter unexpectedly. Only `migrate deploy` / `migrate resolve` / explicit reviewed SQL.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed via `psql`, `curl`, and the Render logs API. No "user manually checks the dashboard" criteria.

### Test Decision

- **Infrastructure exists**: YES (Vitest) — but this is a production DB/ops fix, not application code. No unit tests are added or required; the change is in the database, not the codebase.
- **Automated tests**: None (correct for a migration-deployment task).
- **Agent-Executed QA**: ALWAYS — every task verifies via `psql` queries against prod (session pooler :5432), `curl` against the live gateway, and the Render logs API.

### QA Policy

Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.txt`. Connection strings are read from Render env vars at runtime and never written to evidence files (mask passwords).

- **DB state**: `psql` against `aws-1-us-west-2.pooler.supabase.com:5432` (session pooler; strip any `?pgbouncer=true`).
- **Live endpoints**: `curl` against `https://ai-employees-laaa.onrender.com` with a valid `Authorization: Bearer` (SERVICE_TOKEN from `.env`).
- **Logs**: Render logs API `GET /v1/logs?ownerId=tea-d1uscc3uibrs738pu040&resource=$RENDER_SERVICE_ID&level=error`.

### Reference connection recipe (used by multiple tasks)

```bash
set -a; source .env 2>/dev/null; set +a
# Session pooler (IPv4, prepared-statement safe) — for psql reads/verifies:
PROD_5432=$(curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars?limit=100" \
  | jq -r '.[].envVar | select(.key=="DATABASE_URL") | .value' \
  | sed -E 's/:6543/:5432/; s/[?&]pgbouncer=true//')
```

---

## Execution Strategy

### Why sequential (no parallel waves)

This is an irreversible production database mutation. Parallelism would create race conditions on schema state and defeat the gating that makes destructive steps safe. Tasks run strictly in order; each is a gate for the next.

> **User chose full-sync (all 4 migrations) via a single Render-shell `migrate deploy`.** Because `migrate deploy` will reach the destructive `drop_dead_tables` and the CHECK-constraint migration, the pre-flight guard (Task 5) MUST run BEFORE the deploy. The task numbering below keeps a logical phase split for verification clarity, but the EXECUTION ORDER is: Task 1 → Task 2 (backup) → Task 5 (pre-flight guard, run early) → Task 3+6 (single `migrate deploy` applies all 4) → Task 4 + Task 7 (verify). Follow the "Recommended execution order" line, not just the numeric order.

```
Phase 0 — Diagnosis lock-in (read-only)
└── Task 1: Confirm exact pending-migration set + zero failed/rolled-back rows

Phase 0.5 — Backup (mandatory before ANY DDL)
└── Task 2: Full pg_dump of prod + targeted dump of 5 dead tables; confirm row counts

Phase 0.75 — Pre-flight guard (read-only; MUST pass before the deploy)
└── Task 5: status values in-set + dead-table existence known + 0 failed migrations

Apply (single Render-shell migrate deploy applies all 4 in order #1→#2→#3→#4)
├── Task 3: (deleted_at portion) + Task 6: (indexes, constraints, drops)
│           — in full-sync mode these collapse into ONE `pnpm prisma migrate deploy` from the Render shell
└── (if a dead table is absent or a status value violates: handle per Task 5 decision BEFORE deploy)

Verify
├── Task 4: columns present, endpoints 200, logs clean
└── Task 7: constraints present, dead tables gone, history consistent (all 4 recorded)

Closeout
├── Task 8: Update production debugging guide (failure mode + IPv6-direct-host gotcha)
└── Task 9: Notify completion (Telegram)

Recommended execution order: 1 → 2 → 5 → (handle any Task-5 findings) → 3+6 (one migrate deploy) → 4 → 7 → 8 → 9
Critical Path: 1 → 2 → 5 → deploy → 4 → 7 → 8 → 9
```

Phase 0 — Diagnosis lock-in (read-only)
└── Task 1: Confirm exact pending-migration set + zero failed/rolled-back rows

Phase 0.5 — Backup (mandatory before ANY DDL)
└── Task 2: Full pg_dump of prod + targeted dump of 5 dead tables; confirm row counts

Phase A — URGENT safe fix (stops the 500s)
├── Task 3: Apply deleted_at migration to prod (Render shell `migrate deploy`, OR raw SQL + `migrate resolve`)
└── Task 4: Verify Phase A — columns present, endpoints 200, logs clean

> > > USER GATE: proceed to Phase B? (Phase A alone resolves the incident) <<<

Phase B — GATED reconciliation (only on go-ahead)
├── Task 5: Pre-flight guard — status values + dead-table existence (read-only, BLOCKS Task 6)
├── Task 6: Apply remaining 3 migrations (indexes, constraints, drops) — only if Task 5 passed
└── Task 7: Verify Phase B — constraints present, dead tables gone, history consistent

Phase C — Closeout
├── Task 8: Update production debugging guide (failure mode + IPv6-direct-host gotcha)
└── Task 9: Notify completion (Telegram)

Critical Path: 1 → 2 → 3 → 4 → (gate) → 5 → 6 → 7 → 8 → 9

```

### Dependency Matrix

- **Task 1**: depends on — none · blocks — 2
- **Task 2**: depends on — 1 · blocks — 3 (HARD: no DDL before backup)
- **Task 3**: depends on — 2 · blocks — 4
- **Task 4**: depends on — 3 · blocks — user gate
- **Task 5**: depends on — user go-ahead for Phase B · blocks — 6 (HARD: drop/constraint only if pre-flight passes)
- **Task 6**: depends on — 5 (must PASS) · blocks — 7
- **Task 7**: depends on — 6 · blocks — 8
- **Task 8**: depends on — 4 (Phase A) and 7 if Phase B ran · blocks — 9
- **Task 9**: depends on — 8 · blocks — none

### Agent Dispatch Summary

- Task 1 → `quick` (read-only psql diff)
- Task 2 → `unspecified-high` (production backup; careful execution + verification)
- Task 3 → `deep` (production DDL via correct connection path; history reconciliation logic)
- Task 4 → `unspecified-high` (multi-surface verification: DB + curl + logs)
- Task 5 → `deep` (data-violation analysis; correct interpretation of guard results)
- Task 6 → `deep` (destructive production DDL; idempotency handling)
- Task 7 → `unspecified-high` (verification)
- Task 8 → `writing` (docs update)
- Task 9 → `quick` (Telegram notify)

---

## TODOs

> Each task is agent-executable end-to-end. Connection strings are pulled from Render env vars at runtime (never hardcoded). Passwords are masked in all evidence.

- [x] 1. Lock in the exact pending-migration set (read-only)

  **What to do**:
  - Pull `DATABASE_URL` from Render env vars; derive the session-pooler :5432 string (replace `:6543`→`:5432`, strip `?pgbouncer=true`).
  - Diff local `prisma/migrations/` directories against prod `_prisma_migrations.migration_name`. Confirm EXACTLY these 4 are pending: `202606070845100_add_fk_indexes`, `20260607084955_add_deleted_at_to_active_tables`, `20260607095800_add_status_check_constraints`, `202606080425250_drop_dead_tables`.
  - Assert prod has zero rows with `finished_at IS NULL OR rolled_back_at IS NOT NULL` (a failed/rolled-back row would block `migrate deploy` and require `migrate resolve` first).
  - Re-confirm `deleted_at` is currently absent on `tasks`, `task_metrics`, `employee_rules`, `feedback_events`, `pending_approvals`, `executions`.

  **Must NOT do**:
  - No writes. No DDL. Read-only verification only.
  - Do not connect via :6543.

  **Recommended Agent Profile**:
  - **Category**: `quick` — read-only psql diff, no judgment-heavy logic.
  - **Skills**: [`production-ops`]
    - `production-ops`: Render API command patterns, service ID, env-var listing quirk (`?limit=100`), and the 5432-vs-6543 pooler distinction.
  - **Skills Evaluated but Omitted**:
    - `prisma`: schema/migration authoring not needed here — this is a read-only state check.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (gate for Task 2)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.opencode/skills/production-ops/SKILL.md` — Render env-var list command (`?limit=100` required) and the rule that :6543 needs `?pgbouncer=true` while :5432 is the migration/direct path.

  **External References**:
  - Prisma `migrate deploy` docs — applies any migration not present in `_prisma_migrations`, in lexical filename order; aborts if a recorded migration is in a failed state.

  **WHY Each Reference Matters**:
  - The pooler distinction determines which connection string is even usable; the failed-row check determines whether `migrate deploy` can run at all in later tasks.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

```

Scenario: Pending set is exactly the 4 expected migrations and no failed rows exist
Tool: Bash (psql via session pooler :5432)
Preconditions: .env has RENDER_API_KEY, RENDER_SERVICE_ID; jq + psql installed
Steps: 1. Derive PROD_5432 from Render DATABASE_URL (=> :5432, strip pgbouncer). 2. Run: comm -23 <(ls -1 prisma/migrations | grep -v migration_lock | sort) \
 <(psql "$PROD_5432" -t -A -c "SELECT migration_name FROM _prisma_migrations;" | sort)
      3. Run: psql "$PROD_5432" -t -A -c "SELECT count(\*) FROM \_prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;" 4. Run: psql "$PROD_5432" -t -A -c "SELECT table_name FROM information_schema.columns WHERE column_name='deleted_at' AND table_name IN ('tasks','task_metrics','employee_rules','feedback_events','pending_approvals','executions') ORDER BY 1;"
Expected Result: step 2 prints exactly the 4 named migrations; step 3 prints 0; step 4 prints 0 rows (columns absent).
Failure Indicators: step 2 shows additional/fewer migrations (scope changed — STOP and re-plan); step 3 > 0 (a migration is in a failed state — must `migrate resolve` before any deploy); step 4 already lists tables (columns somehow exist — 500 cause may differ, re-investigate).
Evidence: .sisyphus/evidence/task-1-pending-migrations.txt (mask password in any echoed URL)

```

**Commit**: NO

- [x] 2. Back up production before any DDL (MANDATORY)

**What to do**:
- Per AGENTS.md mandatory backup rule, create a timestamped backup dir under `database-backups/<YYYY-MM-DD-HHMM>/`.
- Full logical dump of prod via `pg_dump` (use the session pooler :5432; if `pg_dump` server-version mismatch errors occur, prefer running the dump from a Render shell where the bundled client matches, or use `--no-comments`/version-tolerant flags — document whichever path is used).
- Targeted data dump (`--data-only --inserts`) of the 5 dead tables that Phase B would drop: `audit_log`, `clarifications`, `cross_dept_triggers`, `reviews`, `validation_runs` — so the destructive Phase B is restorable. For any dead table that does not exist in prod, record "absent" (do not fail).
- Record row counts for the dead tables and for `tasks`, `employee_rules`, `task_metrics` so post-change counts can be compared.

**Must NOT do**:
- Do not proceed to Task 3 until the dump files exist and row counts are recorded.
- Do not write DB passwords into the backup directory or evidence.

**Recommended Agent Profile**:
- **Category**: `unspecified-high` — careful production backup with verification, some judgment on pg_dump version handling.
- **Skills**: [`production-ops`, `prisma`]
  - `production-ops`: Render shell access + DB connection topology.
  - `prisma`: the AGENTS.md backup recipe (`pg_dump` per-table `--data-only --inserts`, container caveats) — the prisma skill and AGENTS.md describe the exact backup commands.
- **Skills Evaluated but Omitted**:
  - `security`: no secret rotation here; just avoid writing secrets to disk (covered by the guardrail).

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 3 (HARD gate — no DDL before backup)
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `AGENTS.md` § "Database Backup (MANDATORY before any reseed or wipe)" — the exact `pg_dump` full + per-table recipe and the restore commands. Note that recipe targets the local `shared-postgres` container; for prod, point `pg_dump` at the prod connection (session pooler or Render shell) instead.
- `.opencode/skills/production-ops/SKILL.md` — prod connection details.

**WHY Each Reference Matters**:
- The backup is the ONLY rollback for the destructive Phase B drop; it must capture the 5 dead tables' data before they can be dropped.

**Acceptance Criteria**:

**QA Scenarios (MANDATORY)**:

```

Scenario: Full dump + dead-table dumps created with recorded row counts
Tool: Bash (pg*dump + psql)
Preconditions: Task 1 passed; backup dir creatable; prod reachable
Steps: 1. TS=$(date "+%Y-%m-%d-%H%M"); mkdir -p "database-backups/$TS" 2. Produce full-dump.sql (document the exact command + connection path used). 3. For each dead table, attempt `--data-only --inserts` dump; if table absent, write "<table>: absent" to a manifest. 4. Record counts: psql "$PROD_5432" -c "SELECT 'tasks',count(*) FROM tasks UNION ALL SELECT 'employee*rules',count(*) FROM employee_rules UNION ALL SELECT 'task_metrics',count(\*) FROM task_metrics;"
Expected Result: full-dump.sql exists and is non-empty (>0 bytes); a manifest lists each of the 5 dead tables as either dumped (with row count) or absent; baseline counts recorded.
Failure Indicators: empty dump file; pg_dump auth/version error with no fallback documented; missing manifest.
Evidence: .sisyphus/evidence/task-2-backup-manifest.txt (paths + row counts; NO passwords)

Scenario: Restore command is documented and points at the new backup
Tool: Bash (write-up only — do NOT execute a restore)
Steps: 1. Write the exact restore command for full-dump.sql and for each dead-table dump into the manifest.
Expected Result: manifest contains copy-pasteable restore commands referencing the timestamped path.
Evidence: appended to .sisyphus/evidence/task-2-backup-manifest.txt

```

**Commit**: NO (backups are gitignored per AGENTS.md)

- [x] 3. Apply the `deleted_at` migration to production (Phase A — the fix)

**What to do**:
- Choose ONE execution path and document which was used:
  - **Preferred — Render shell**: open a shell/one-off on service `srv-d8f1b2gg4nts738dj7jg` (where `DATABASE_URL_DIRECT` / IPv6 direct host resolves) and run `pnpm prisma migrate deploy`. ⚠️ NOTE: plain `migrate deploy` applies ALL 4 pending migrations in order, including the destructive `drop_dead_tables`. Therefore Phase A must NOT use plain `migrate deploy` unless Phase B pre-flights (Task 5) have already passed. For an isolated Phase A fix, use the raw-SQL path below.
  - **Isolated Phase A (recommended to stop the bleeding without touching destructive migrations)**: apply only migration #2's SQL via `psql` (session pooler :5432) — it is `ADD COLUMN IF NOT EXISTS deleted_at` on the 6 tables — then immediately record it as applied: `prisma migrate resolve --applied 20260607084955_add_deleted_at_to_active_tables` (run with a DB URL Prisma accepts; document it). Also resolve `202606070845100_add_fk_indexes` similarly ONLY if you also apply its safe `CREATE INDEX IF NOT EXISTS` SQL; otherwise leave indexes pending for Phase B.
- The raw SQL to apply (exactly migration #2): `ALTER TABLE "tasks"/"executions"/"pending_approvals"/"employee_rules"/"feedback_events"/"task_metrics" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);`
- Pair every raw-SQL application with a matching `migrate resolve --applied` so `_prisma_migrations` stays truthful.

**Must NOT do**:
- Do NOT run plain `migrate deploy` in Phase A (it would also run constraints + the destructive drops). Only the deleted_at (and optionally the safe indexes) migration in this phase.
- Do NOT apply raw SQL without the matching `migrate resolve --applied`.
- Do NOT use the :6543 transaction pooler.

**Recommended Agent Profile**:
- **Category**: `deep` — must reason correctly about migrate-deploy-applies-all vs isolated raw-SQL + resolve, and pick the safe path; production DDL.
- **Skills**: [`prisma`, `production-ops`]
  - `prisma`: `migrate deploy` vs `migrate resolve --applied` semantics, schema-cache reload, the PostgREST-vs-psql distinction.
  - `production-ops`: Render shell access + correct connection string.
- **Skills Evaluated but Omitted**:
  - `data-access-conventions`: no app code touched.

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 4
- **Blocked By**: Task 2 (backup must exist)

**References**:

**Pattern References**:
- `prisma/migrations/20260607084955_add_deleted_at_to_active_tables/migration.sql` — the exact, idempotent SQL to apply (6 × `ADD COLUMN IF NOT EXISTS`).
- `prisma/migrations/202606070845100_add_fk_indexes/migration.sql` — the safe index SQL, if applied alongside.
- `.opencode/skills/prisma/SKILL.md` — `migrate resolve` usage + PostgREST schema-cache reload note (PostgREST may need a reload to see new columns; the gateway uses Prisma directly so it picks up columns immediately, but note this if any PostgREST path is involved).

**WHY Each Reference Matters**:
- Applying the file's exact SQL guarantees parity with what `migrate deploy` would do; `migrate resolve` keeps history consistent so future deploys behave.

**Acceptance Criteria**:

**QA Scenarios (MANDATORY)**:

```

Scenario: deleted_at columns now exist on all 6 target tables
Tool: Bash (psql via :5432)
Preconditions: Task 2 backup confirmed
Steps: 1. Apply migration #2 SQL via chosen path. 2. psql "$PROD_5432" -t -A -c "SELECT table_name FROM information_schema.columns WHERE column_name='deleted_at' AND table_name IN ('tasks','task_metrics','employee_rules','feedback_events','pending_approvals','executions') ORDER BY 1;"
Expected Result: exactly 6 rows: employee_rules, executions, feedback_events, pending_approvals, task_metrics, tasks.
Failure Indicators: fewer than 6 rows; any ALTER error.
Evidence: .sisyphus/evidence/task-3-columns-added.txt

Scenario: Migration history records the applied migration (no orphaned raw SQL)
Tool: Bash (psql via :5432)
Steps: 1. After `migrate resolve --applied`, query: psql "$PROD_5432" -t -A -c "SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at FROM \_prisma_migrations WHERE migration_name='20260607084955_add_deleted_at_to_active_tables';"
Expected Result: one row, finished=t, rolled_back_at NULL.
Failure Indicators: no row (raw SQL applied without resolve — history now inconsistent); rolled_back_at set.
Evidence: .sisyphus/evidence/task-3-history-recorded.txt

```

**Commit**: NO

- [x] 4. Verify Phase A resolved the incident (DB + live endpoints + logs)

**What to do**:
- Confirm the live dashboard endpoints now return 200, not 500.
- Confirm Render error logs are free of `P2022` / `deleted_at does not exist` over a window that covers multiple dashboard poll cycles (≥2 minutes, ~24 cycles at 5s).
- Confirm response bodies are well-formed JSON (not `INTERNAL_ERROR`).
- Use the exact tenant IDs from the incident: `00000000-0000-0000-0000-000000000004` (tasks) and `00000000-0000-0000-0000-000000000003` (employee-rules). Also re-test with the SERVICE_TOKEN (the JWT in the report is expired/short-lived).

**Must NOT do**:
- Do not mark resolved on "columns exist" alone — the endpoint 200 + log-silence checks are the real gates.

**Recommended Agent Profile**:
- **Category**: `unspecified-high` — multi-surface verification (DB + HTTP + logs), interpret log windows correctly.
- **Skills**: [`production-ops`]
  - `production-ops`: Render logs API (`/v1/logs?ownerId=...&resource=...&level=error`) and live URL.
- **Skills Evaluated but Omitted**:
  - `feature-verification`: app-feature verification matrix not applicable to a DB-column fix; the bespoke checks here are sufficient.

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: user gate for Phase B
- **Blocked By**: Task 3

**References**:

**Pattern References**:
- `.opencode/skills/production-ops/SKILL.md` — logs API form and the live URL `https://ai-employees-laaa.onrender.com`.
- `src/gateway/routes/admin-reads.ts` — confirms the endpoints and that they `sendError(500,'INTERNAL_ERROR')` on Prisma failure (so 200 == the query now succeeds).

**WHY Each Reference Matters**:
- The handler masks the real error; the only client-visible signal of success is the 200 + clean logs, so both must be checked.

**Acceptance Criteria**:

**QA Scenarios (MANDATORY)**:

```

Scenario: Both incident endpoints return 200 with well-formed bodies
Tool: Bash (curl)
Preconditions: Task 3 applied; SERVICE_TOKEN in .env
Steps: 1. curl -s -o /tmp/t.json -w "%{http_code}" -H "Authorization: Bearer $SERVICE_TOKEN" "https://ai-employees-laaa.onrender.com/admin/tenants/00000000-0000-0000-0000-000000000004/tasks?order=desc" 2. curl -s -o /tmp/r.json -w "%{http_code}" -H "Authorization: Bearer $SERVICE_TOKEN" "https://ai-employees-laaa.onrender.com/admin/tenants/00000000-0000-0000-0000-000000000003/employee-rules?limit=50" 3. jq 'if type=="array" then length else . end' /tmp/t.json; jq 'if type=="array" then length else . end' /tmp/r.json
Expected Result: both status codes are 200; both bodies are JSON arrays (length ≥ 0); neither contains "INTERNAL_ERROR".
Failure Indicators: 500; body == {"error":"INTERNAL_ERROR"}; 401/403 (token issue — retry with correct SERVICE_TOKEN, not a regression).
Evidence: .sisyphus/evidence/task-4-endpoints-200.txt

Scenario: No P2022 deleted_at errors in a fresh 2-minute log window
Tool: Bash (Render logs API)
Steps: 1. Note current time. Wait ≥120s while the dashboard (or a curl loop) hits the endpoints. 2. curl -s -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/logs?ownerId=tea-d1uscc3uibrs738pu040&resource=$RENDER_SERVICE_ID&limit=200&level=error" | jq -r '.logs[]?.message' | grep -c "deleted_at does not exist"
Expected Result: count is 0 for the new window (older entries before the fix may remain and are fine — compare timestamps).
Failure Indicators: count > 0 with timestamps AFTER the fix was applied.
Evidence: .sisyphus/evidence/task-4-logs-clean.txt

```

**Commit**: NO

  > **Checkpoint after Task 4** — In full-sync mode (user-approved), Phase B is in scope and already applied via the same `migrate deploy`; this checkpoint is a confirmation point that Phase A guarantees hold before final Phase B verification (Task 7). It is no longer a go/no-go on whether Phase B runs.

- [x] 5. Phase B pre-flight guard (read-only — BLOCKS the destructive apply)

**What to do** (only after user approves Phase B):
- Constraint safety: list distinct values in prod so the CHECK constraints won't fail on apply.
  - `SELECT DISTINCT status FROM tasks;` → assert every value ∈ {Received, Triaging, AwaitingInput, Ready, Executing, Validating, Submitting, Reviewing, Approved, Delivering, Done, Failed, Cancelled}. Flag any legacy `Stale`/`AwaitingApproval` or other.
  - `SELECT DISTINCT status FROM executions;` → assert ⊆ {pending, running, completed, failed}.
- Drop safety: for each of the 5 dead tables, `SELECT to_regclass('public.<t>')` and row count. Record which exist (and whether they hold data — the backup from Task 2 must cover any with data).
- Decide handling: if any dead table is ALREADY absent, plain migration #4 will ERROR (no `IF EXISTS`). In that case the correct remediation is a NEW idempotent migration OR `migrate resolve --applied` for #4 combined with manual reconciliation — document the chosen approach for Task 6 (do NOT edit the existing migration file).
- Re-confirm `_prisma_migrations` still has 0 failed/rolled-back rows.

**Must NOT do**:
- No DDL in this task — read-only analysis that gates Task 6.
- Do not proceed to Task 6 if any constraint-violating row exists or if dead-table existence doesn't match a clean apply, until a documented handling decision is in place.

**Recommended Agent Profile**:
- **Category**: `deep` — must correctly interpret data-violation and idempotency edge cases and decide Task 6's approach.
- **Skills**: [`prisma`, `production-ops`]
  - `prisma`: migration idempotency / `migrate resolve` reasoning.
  - `production-ops`: prod connection.

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential (Phase B)
- **Blocks**: Task 6 (HARD — destructive apply only if this passes)
- **Blocked By**: User go-ahead for Phase B

**References**:

**Pattern References**:
- `prisma/migrations/20260607095800_add_status_check_constraints/migration.sql` — the exact allowed status sets to validate against.
- `prisma/migrations/202606080425250_drop_dead_tables/migration.sql` — the 5 tables + 7 FKs dropped with NO `IF EXISTS` (the idempotency hazard).

**WHY Each Reference Matters**:
- The constraint allow-lists define exactly what "no violating rows" means; the drop file's lack of `IF EXISTS` is the specific reason a pre-flight existence check is mandatory.

**Acceptance Criteria**:

**QA Scenarios (MANDATORY)**:

```

Scenario: No status values would violate the new CHECK constraints
Tool: Bash (psql via :5432)
Steps: 1. psql "$PROD_5432" -t -A -c "SELECT DISTINCT status FROM tasks;" and "... FROM executions;"
Expected Result: every tasks.status ∈ the 13-state set; every executions.status ∈ {pending,running,completed,failed}.
Failure Indicators: any value outside the sets (e.g. Stale, AwaitingApproval) — Task 6 must NOT run the constraint migration until those rows are remediated (decision required).
Evidence: .sisyphus/evidence/task-5-status-values.txt

Scenario: Dead-table existence is known and matches a safe apply plan
Tool: Bash (psql via :5432)
Steps: 1. For t in audit_log clarifications cross_dept_triggers reviews validation_runs: psql "$PROD_5432" -t -A -c "SELECT '$t', to_regclass('public.$t'), (SELECT count(*) FROM \"$t\");" (guard count if absent).
Expected Result: a clear table of exists/absent + row count for each; any present table with data is covered by the Task 2 backup.
Failure Indicators: a table is absent (plain migration #4 would error → documented handling needed) OR a present table has data NOT in the backup.
Evidence: .sisyphus/evidence/task-5-dead-tables.txt

```

**Commit**: NO

- [x] 6. Apply remaining migrations (indexes + constraints + drops) — Phase B

**What to do** (only if Task 5 passed):
- Apply migration #1 (`add_fk_indexes`) if not already applied in Task 3 — safe `CREATE INDEX IF NOT EXISTS`.
- Apply migration #3 (`add_status_check_constraints`) — only after Task 5 confirmed zero violating rows.
- Apply migration #4 (`drop_dead_tables`) using the handling decided in Task 5:
  - If all 5 tables exist: the migration applies cleanly.
  - If any are absent: apply the equivalent drops with `IF EXISTS` guards manually and `migrate resolve --applied 202606080425250_drop_dead_tables`, OR author a new corrective migration — per the Task 5 decision. Never edit the existing migration file.
- Preferred mechanism: from a Render shell, `pnpm prisma migrate deploy` (now safe because all pre-flights passed and #2 is already recorded). Otherwise apply each migration's SQL via :5432 and `migrate resolve --applied` for each.
- Ensure each applied migration is recorded in `_prisma_migrations`.

**Must NOT do**:
- Do not run if Task 5 reported violating status rows or an unhandled dead-table mismatch.
- Do not use :6543. Do not edit existing migration SQL files.

**Recommended Agent Profile**:
- **Category**: `deep` — destructive production DDL with conditional idempotency handling.
- **Skills**: [`prisma`, `production-ops`]
  - `prisma`: deploy/resolve semantics, authoring a corrective migration if needed.
  - `production-ops`: Render shell.

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 7
- **Blocked By**: Task 5 (must PASS)

**References**:

**Pattern References**:
- All three migration files (`202606070845100_add_fk_indexes`, `20260607095800_add_status_check_constraints`, `202606080425250_drop_dead_tables`) — exact SQL.
- `.opencode/skills/prisma/SKILL.md` — `migrate resolve --applied`, authoring corrective migrations.

**WHY Each Reference Matters**:
- The exact SQL must match the recorded history; `migrate resolve` is the only safe way to record a manually-applied or corrected migration.

**Acceptance Criteria**:

**QA Scenarios (MANDATORY)**:

```

Scenario: Constraints present and dead tables gone
Tool: Bash (psql via :5432)
Steps: 1. psql "$PROD_5432" -t -A -c "SELECT conname FROM pg_constraint WHERE conname IN ('tasks_status_check','executions_status_check') ORDER BY 1;"
      2. For each dead table: psql "$PROD_5432" -t -A -c "SELECT to_regclass('public.<t>');"
Expected Result: step 1 returns both constraint names; step 2 returns NULL for all 5 tables.
Failure Indicators: a constraint missing (apply failed); a dead table still present (drop failed); any error during apply.
Evidence: .sisyphus/evidence/task-6-phaseb-applied.txt

Scenario: Migration history now records all four migrations cleanly
Tool: Bash (psql via :5432)
Steps: 1. psql "$PROD_5432" -t -A -c "SELECT migration_name FROM _prisma_migrations WHERE migration_name IN ('202606070845100_add_fk_indexes','20260607084955_add_deleted_at_to_active_tables','20260607095800_add_status_check_constraints','202606080425250_drop_dead_tables') ORDER BY 1;"
      2. psql "$PROD_5432" -t -A -c "SELECT count(\*) FROM \_prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;"
Expected Result: step 1 lists all 4; step 2 returns 0.
Failure Indicators: a migration missing from history (orphaned apply); step 2 > 0.
Evidence: .sisyphus/evidence/task-6-history-complete.txt

```

**Commit**: NO

- [x] 7. Verify Phase B left the system consistent

**What to do** (only if Phase B ran):
- Re-confirm all Phase A guarantees still hold (deleted_at columns present, endpoints 200, logs clean).
- Confirm both CHECK constraints exist and all 5 dead tables are gone.
- Confirm `_prisma_migrations` lists all 4 previously-missing migrations with `finished_at` set and `rolled_back_at NULL`, and the global failed/rolled-back count is 0.
- Smoke-test that normal app operations still function (e.g., the tasks endpoint still returns 200 and the gateway didn't start erroring on the new constraints) by re-hitting the endpoints.

**Must NOT do**:
- Do not skip the re-check of Phase A guarantees — Phase B DDL (constraints) could theoretically interact with inserts.

**Recommended Agent Profile**:
- **Category**: `unspecified-high` — comprehensive post-DDL verification.
- **Skills**: [`production-ops`]
  - `production-ops`: logs API + live URL + prod connection.

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 8
- **Blocked By**: Task 6

**References**:
- Same migration files + `production-ops` skill as Task 6.

**WHY Each Reference Matters**:
- Confirms the destructive phase didn't regress the already-fixed incident.

**Acceptance Criteria**:

**QA Scenarios (MANDATORY)**:

```

Scenario: Full post-Phase-B consistency check
Tool: Bash (psql + curl + Render logs)
Steps: 1. Re-run Task 4's endpoint + log checks. 2. Re-run Task 6's constraint + dead-table + history checks.
Expected Result: endpoints 200; logs clean; both constraints present; 5 dead tables NULL; 4 migrations recorded; failed/rolled-back count 0.
Failure Indicators: any regression from Phase A; any missing constraint/migration; any dead table still present.
Evidence: .sisyphus/evidence/task-7-phaseb-consistency.txt

```

**Commit**: NO

- [x] 8. Document the failure mode and the connection gotcha

**What to do**:
- Update `docs/guides/2026-06-01-2246-production-debugging-guide.md` with:
  - The migration-drift 500 failure mode: symptom (`INTERNAL_ERROR` on dashboard reads), root cause (unapplied `add_deleted_at_to_active_tables`), and the diagnostic queries (migration-set diff, `information_schema.columns` check, Render `P2022` log grep).
  - The connection-topology gotcha: `DATABASE_URL_DIRECT` points at the IPv6-only `db.<ref>.supabase.co:5432` (not routable without IPv6); use the IPv4 session pooler `aws-1-us-west-2.pooler.supabase.com:5432` for local psql/migrations; never :6543 for migrations.
  - A short "how to verify a prod migration is applied" recipe.
- Per AGENTS.md Documentation Freshness/Discrepancy rules: if the guide currently states anything contradicting the verified topology (e.g., calls :5432 a "direct connection" when Render's direct URL is IPv6-only), correct it in the same edit.

**Must NOT do**:
- Do not create a new doc — update the existing production debugging guide (the canonical place per AGENTS.md production debugging rule).
- Do not include real passwords/tokens in examples (use placeholders / env-var reads).

**Recommended Agent Profile**:
- **Category**: `writing` — documentation update.
- **Skills**: [`production-ops`]
  - `production-ops`: ensures the documented commands match the canonical Render/DB recipes.
- **Skills Evaluated but Omitted**:
  - `writing-guidelines`: internal ops guide, not user-facing prose; house style of the existing guide is the reference.

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 9
- **Blocked By**: Task 4 (Phase A) and Task 7 if Phase B ran

**References**:

**Pattern References**:
- `docs/guides/2026-06-01-2246-production-debugging-guide.md` — the file to update; match its existing section structure and tone.
- `AGENTS.md` § "Documentation Freshness" + "Production debugging rule" — mandates updating this guide after resolving a prod issue.

**WHY Each Reference Matters**:
- AGENTS.md explicitly requires this guide to be updated with new failure modes/commands discovered during production debugging.

**Acceptance Criteria**:

**QA Scenarios (MANDATORY)**:

```

Scenario: Guide contains the new failure mode and correct topology
Tool: Bash (grep)
Steps: 1. grep -i "deleted_at\|P2022\|migration drift" docs/guides/2026-06-01-2246-production-debugging-guide.md 2. grep -i "pooler.supabase.com:5432\|IPv6\|6543" docs/guides/2026-06-01-2246-production-debugging-guide.md
Expected Result: step 1 matches the new failure-mode section; step 2 matches the documented topology/gotcha.
Failure Indicators: no matches (content not added).
Evidence: .sisyphus/evidence/task-8-docs-updated.txt

Scenario: Docs commit succeeds with hooks
Tool: Bash (git)
Steps: 1. git add docs/guides/2026-06-01-2246-production-debugging-guide.md .sisyphus/plans/2026-06-10-1338-prod-migration-drift-fix.md 2. git commit -m "docs(production): document migration-drift 500 failure mode and IPv6 direct-host gotcha"
Expected Result: commit succeeds; pre-commit hooks pass (no --no-verify).
Failure Indicators: hook failure (fix root cause, re-commit).
Evidence: .sisyphus/evidence/task-8-commit.txt

```

**Commit**: YES
- Message: `docs(production): document migration-drift 500 failure mode and IPv6 direct-host gotcha`
- Files: `docs/guides/2026-06-01-2246-production-debugging-guide.md`, `.sisyphus/plans/2026-06-10-1338-prod-migration-drift-fix.md`
- Pre-commit: standard hooks (never `--no-verify`)

- [x] 9. Notify completion

**What to do**:
- Send a Telegram notification summarizing the outcome: incident resolved (Phase A applied), whether Phase B ran or was deferred, and that the user should review.
- `tsx scripts/telegram-notify.ts "✅ prod-migration-drift-fix complete — dashboard 500s resolved (deleted_at applied). Phase B: <ran & verified | deferred>. Come back to review results."`

**Must NOT do**:
- Do not send before Task 8 completes.

**Recommended Agent Profile**:
- **Category**: `quick` — single script invocation.
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential (final)
- **Blocks**: None
- **Blocked By**: Task 8

**References**:
- `scripts/telegram-notify.ts` — the notification script (AGENTS.md Prometheus Telegram rule).

**WHY Each Reference Matters**:
- AGENTS.md mandates a Telegram completion notification as the final plan action.

**Acceptance Criteria**:

**QA Scenarios (MANDATORY)**:

```

Scenario: Telegram completion message sent
Tool: Bash
Steps: 1. tsx scripts/telegram-notify.ts "✅ prod-migration-drift-fix complete — dashboard 500s resolved. Phase B: <state>. Come back to review."
Expected Result: script exits 0; message delivered.
Failure Indicators: non-zero exit; missing TELEGRAM_BOT_TOKEN/CHAT_ID (note and continue — not a blocker for the fix itself).
Evidence: .sisyphus/evidence/task-9-notify.txt

````

**Commit**: NO

---

## Final Verification Wave

> Single reviewer (this is an ops fix, not a multi-file code change). The review confirms the incident is actually resolved in production and nothing was left in an inconsistent state. Present results to the user and get explicit "okay" before declaring done. Do NOT auto-proceed.

- [x] F1. **Production resolution audit** — `oracle`
    Independently verify the incident is closed and the system is consistent. Run, against prod (session pooler :5432) and the live gateway:
- `SELECT table_name FROM information_schema.columns WHERE column_name='deleted_at' AND table_name IN ('tasks','task_metrics','employee_rules','feedback_events','pending_approvals','executions') ORDER BY 1;` → EXPECT exactly those 6.
- `curl -s -o /dev/null -w "%{http_code}"` on `/admin/tenants/<prod-tenant>/tasks?order=desc` and `/admin/tenants/<prod-tenant>/employee-rules?limit=50` with a valid Bearer → EXPECT `200` for both.
- Pull Render error logs for a fresh 2-minute window → assert zero `P2022` / `deleted_at does not exist`.
- `SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;` → EXPECT `0`.
- If Phase B ran: assert the 2 CHECK constraints exist and `to_regclass` is NULL for all 5 dead tables. If Phase B did NOT run: assert that is an intentional, user-approved state (the 3 migrations remain genuinely pending).
- Verify the backup artifact from Task 2 exists with the recorded row counts.
  Output: `Columns [6/6] | Endpoints [2/2 200] | Logs [clean/dirty] | History [consistent] | Phase B [ran&verified / intentionally-skipped] | VERDICT: APPROVE/REJECT`

-> Present F1 results to user -> get explicit "okay" before marking the plan complete. Rejection -> fix -> re-run F1 -> present again.

---

## Commit Strategy

This plan changes production database state and (in Phase C) one docs file. The only git-committable artifact is the docs update plus the plan/evidence.

- **Docs + plan commit** (after Task 8): `docs(production): document migration-drift 500 failure mode and IPv6 direct-host gotcha`
- Files: `docs/guides/2026-06-01-2246-production-debugging-guide.md`, `.sisyphus/plans/2026-06-10-1338-prod-migration-drift-fix.md`
- Pre-commit: hooks run normally (no `--no-verify`).
- DB changes are not git artifacts; their record of truth is `_prisma_migrations` + the backup files + task evidence.

---

## Success Criteria

### Verification Commands

```bash
set -a; source .env 2>/dev/null; set +a
PROD_5432=$(curl -s -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars?limit=100" | jq -r '.[].envVar|select(.key=="DATABASE_URL")|.value' | sed -E 's/:6543/:5432/; s/[?&]pgbouncer=true//')

# 1. deleted_at present on all 6 tables → expect 6 rows
psql "$PROD_5432" -t -A -c "SELECT table_name FROM information_schema.columns WHERE column_name='deleted_at' AND table_name IN ('tasks','task_metrics','employee_rules','feedback_events','pending_approvals','executions') ORDER BY 1;"

# 2. Live endpoints → expect 200, 200
TENANT="<PROD_TENANT_ID>"   # decision: confirm correct prod tenant id
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $SERVICE_TOKEN" "https://ai-employees-laaa.onrender.com/admin/tenants/$TENANT/tasks?order=desc"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $SERVICE_TOKEN" "https://ai-employees-laaa.onrender.com/admin/tenants/$TENANT/employee-rules?limit=50"

# 3. No failed/rolled-back migrations → expect 0
psql "$PROD_5432" -t -A -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;"
````

### Final Checklist

- [ ] Backup exists with confirmed row counts (Task 2)
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (no 6543 DDL, no pre-backup DDL, no history-orphaning raw SQL)
- [ ] Both endpoints return 200; Render logs P2022-free for ≥2 min
- [ ] Migration history consistent
- [ ] Phase B either completed-and-verified, or intentionally deferred with user sign-off
