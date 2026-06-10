# Learnings — prod-migration-drift-fix

## [2026-06-10] Plan initialized

### Key Facts (from investigation)

- Root cause: 4 Prisma migrations missing from prod `_prisma_migrations`
- Critical fix: `20260607084955_add_deleted_at_to_active_tables` — adds `deleted_at` to 6 tables
- Prod service: `srv-d8f1b2gg4nts738dj7jg` on Render
- Prod DB: Supabase Cloud — IPv6-only direct host `db.gjqrysxpvktmibpkwrvy.supabase.co:5432`
- Session pooler (IPv4, safe for migrations): `aws-1-us-west-2.pooler.supabase.com:5432`
- NEVER use port 6543 (transaction pooler) for migrations
- Preferred execution: Render shell (where IPv6 resolves natively)
- Connection recipe: pull DATABASE_URL from Render API, replace :6543→:5432, strip ?pgbouncer=true

### 4 Missing Migrations (in order)

1. `202606070845100_add_fk_indexes` — CREATE INDEX IF NOT EXISTS ×5 (safe/idempotent)
2. `20260607084955_add_deleted_at_to_active_tables` — ADD COLUMN IF NOT EXISTS deleted_at ×6 (THE FIX)
3. `20260607095800_add_status_check_constraints` — DROP+ADD CHECK constraints (risky if bad data)
4. `202606080425250_drop_dead_tables` — DROP TABLE ×5 NO IF EXISTS (destructive)

### Execution Order

1 → 2 → 5 → (handle Task-5 findings) → 3+6 (single migrate deploy) → 4 → 7 → 8 → 9

## Task 2 — Prod DB backup (2026-06-10-1355)

- **Prod server is PostgreSQL 17.6**. Local default `pg_dump` is 15.10 (Homebrew) — too old; pg_dump refuses newer-major-version servers. Use `/opt/homebrew/opt/postgresql@17/bin/pg_dump` (17.7). Same major (17) => works.
- Connection: derive live from Render env-var DATABASE_URL, `sed -E 's/:6543/:5432/; s/[?&]pgbouncer=true//'`. Session pooler host `aws-1-us-west-2.pooler.supabase.com:5432`, user `postgres.gjqrysxpvktmibpkwrvy`, db `postgres`. Never store the password.
- Full dump: `--format=plain`, no workaround flags needed. 81.3 MB / 24,684 lines / ~40s / exit 0 / clean stderr. Footer "PostgreSQL database dump complete" confirms integrity.
- All 5 dead tables (audit_log, clarifications, cross_dept_triggers, reviews, validation_runs) EXIST and are EMPTY (0 rows). Phase B drop loses no row data. Full dump also captures their CREATE TABLE DDL for structure recovery.
- Baseline counts: tasks=2390, employee_rules=72, task_metrics=616.
- Backup dir: `database-backups/2026-06-10-1355/`. Manifest + evidence at `.sisyphus/evidence/task-2-backup-manifest.txt`. Password-leak grep against actual pw = clean.

## Phase B Pre-Flight Results (2026-06-10)

### tasks.status values in prod
7 distinct values found: Cancelled, Done, Executing, Failed, Ready, Reviewing, Submitting
All 7 are within the allowed 13-state set. ✅

### executions.status values in prod
3 distinct values found: completed, failed, running
All 3 are within the allowed 4-state set. ✅

### Dead table existence (to_regclass)
All 5 tables confirmed present: audit_log, clarifications, cross_dept_triggers, reviews, validation_runs ✅
Migration #4 DROP TABLE (no IF EXISTS) will apply cleanly.

### Failed/rolled-back migrations
Count = 0 ✅

### OVERALL VERDICT: PASS — safe to proceed with `pnpm prisma migrate deploy`
Evidence: .sisyphus/evidence/task-5-status-values.txt and task-5-dead-tables.txt

## Task 4 — Endpoint + Log Verification (2026-06-10 ~19:14Z)

### Result: PASS — incident resolved
- **Endpoint 1** `GET /admin/tenants/...004/tasks?order=desc` → HTTP **200**, JSON array (1 elem), `deleted_at:null` present, no INTERNAL_ERROR. Re-hit ×5 → all 200.
- **Endpoint 2** `GET /admin/tenants/...003/employee-rules?limit=50` → HTTP **200**, JSON array (50 elems), `deleted_at:null` present, no INTERNAL_ERROR. Re-hit ×5 → all 200.
- Presence of `deleted_at` in the live response bodies is direct proof the migrated schema is what the running Prisma client sees → the Render service already restarted/picked up the migration (no manual restart needed).

### Fresh 2-min window log check: CLEAN
- Window: 19:10:21Z → 19:14:10Z (~3m49s, satisfies ≥2 min). Drove traffic through both read paths during the window.
- Server-side `startTime=<window>` query on `level=error` logs → **0 error logs total**, 0 P2022, 0 deleted_at.
- All historical P2022 errors stopped at **19:04:12Z** (6 min before window). Oldest 13:08:32Z. 100 P2022 in the most-recent-200 error page, all pre-window.

### CRITICAL GOTCHA — grep false-negative on log verification
- The plan/task's suggested grep `grep -c "deleted_at does not exist"` returns **0 even when errors exist**, because Prisma's real error text is:
  `` The column `tasks.deleted_at` does not exist in the current database. ``
  There is a **backtick** between `deleted_at` and `does` (it's `` `tasks.deleted_at` does not ``, NOT `deleted_at does`). A naive substring grep silently misses every occurrence → FALSE CLEAN.
- **Correct verification approach**: rely on a server-side `startTime` filter to bound the window (the count of errors in-window is the real gate), AND/OR use a backtick-aware pattern like `grep -E 'deleted_at\` does not exist'`. Do not trust the bare-substring grep.
- Affected routes when broken: `admin-reads.js` (tasks:75, employee_rules:185, task_metrics:238) and `admin-brain-preview.js:70`. Columns hit: tasks.deleted_at, task_metrics.deleted_at, employee_rules.deleted_at.

### Render logs API shape (confirmed)
- `GET /v1/logs?ownerId=tea-...&resource=srv-...&level=error&limit=200&startTime=<ISO8601>`
- Returns `{ hasMore, logs:[{id,labels:[{name,value}],message}], nextEndTime, nextStartTime }`. The app log line is JSON inside `.logs[].message` (pino: `{level,time,pid,component,err:{...}}`). `startTime` is honored server-side and is the reliable way to bound a fresh window.

### Evidence
- `.sisyphus/evidence/task-4-endpoints-200.txt`
- `.sisyphus/evidence/task-4-logs-clean.txt`

## Task 7 — Phase B Consistency Verification (2026-06-10 14:17 CDT)

### Result: PASS — production system fully consistent after all 4 migrations

All 7 verification checks passed on session pooler port 5432 (no pgbouncer):

1. **deleted_at columns** — 6/6 present: employee_rules, executions, feedback_events, pending_approvals, task_metrics, tasks ✅
2. **CHECK constraints** — both present: executions_status_check, tasks_status_check ✅
3. **Dead tables gone** — all 5 to_regclass = NULL: audit_log, clarifications, cross_dept_triggers, reviews, validation_runs ✅
4. **4 migrations in history** — all present, finished=t, rolled_back_at=NULL:
   - 202606070845100_add_fk_indexes
   - 20260607084955_add_deleted_at_to_active_tables
   - 20260607095800_add_status_check_constraints
   - 202606080425250_drop_dead_tables ✅
5. **Failed/rolled-back globally** — count = 0 ✅
6. **Incident endpoint #1** (tenant ...004 tasks?order=desc) → HTTP 200 ✅
7. **Incident endpoint #2** (tenant ...003 employee-rules?limit=50) → HTTP 200 ✅

### Notes
- Both incident endpoints still 200 — Phase A guarantee holds, no regression from the destructive drop-dead-tables migration.
- to_regclass NULL is the correct "table does not exist" signal; wrapped with COALESCE(...::text,'NULL') for clean evidence output.
- Evidence: `.sisyphus/evidence/task-7-phaseb-consistency.txt`
