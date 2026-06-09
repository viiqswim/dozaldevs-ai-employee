---
name: prisma
description: 'Use when changing the Prisma schema, writing migrations, editing seed data, or querying the database. Covers the repository-layer access rule, the schema-cache reload requirement, soft-delete enforcement, the ai_employee database name, and PostgREST-vs-psql verification.'
---

# Prisma + PostgREST Safety — ai-employee

This skill covers only the repo-specific, non-obvious rules. Skip generic Prisma tutorials — this is what's different here.

---

## DB Connection

| Setting        | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| Database name  | `ai_employee` — NOT `postgres` (the CLI default)             |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:54322/ai_employee` |
| PostgREST      | `http://localhost:54331` (workers + lifecycle write here)    |
| Direct URL     | `DATABASE_URL_DIRECT` (port 5432 — migrations only)          |

**Why this matters**: `supabase start` hardcodes `postgres`. This project uses Docker Compose with `POSTGRES_DB=ai_employee` so PostgREST, Prisma, and workers all target the same database.

---

## PostgREST vs `psql` — CRITICAL

`psql` connects directly to PostgreSQL. It is NOT what the Inngest lifecycle or worker containers use. Worker containers call PostgREST (`src/workers/lib/postgrest-client.ts`) — a REST layer on top of Postgres.

**After every migration that adds a new table, you MUST reload the PostgREST schema cache:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"
```

Without this, PostgREST returns `PGRST205 "Could not find the table in the schema cache"` and workers cannot write to or read from the new table — even if `psql` queries succeed.

**Then verify via PostgREST directly (not just psql):**

```bash
source .env
curl -s "http://localhost:54331/rest/v1/<new_table>?limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# Expected: [] — empty array. NEVER a PGRST205 or 401 error.
```

Zero rows is acceptable on an empty table. A PGRST205 error means the cache reload was missed.

---

## Repository Layer — MANDATORY ACCESS PATTERN

All gateway routes (`src/gateway/routes/`) and Inngest functions (`src/inngest/`) **MUST** go through a repository class in `src/repositories/`. Never write raw `prisma.model.findFirst()` inline in a route handler or lifecycle function.

**Six repository modules** — use the matching one:

| Module                        | Owns                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `task-repository.ts`          | Task lookups by ID, `thread_ts`, approval TS                          |
| `employee-rule-repository.ts` | Rule CRUD: get, countConfirmed, patch confirm/reject/archive/rephrase |
| `tenant-repository.ts`        | Tenant lookups                                                        |
| `tenant-secret-repository.ts` | Tenant secret reads/writes                                            |
| `tenant-env-loader.ts`        | Assembles the per-task env-var manifest                               |
| `notification-channel.ts`     | Resolves Slack notification channel for a task                        |

**`TaskRepository` is read-only.** Tasks are created and mutated exclusively by the Inngest lifecycle (`src/inngest/employee-lifecycle.ts`). `TaskRepository` has zero write methods — do not add any.

**Worker containers MUST NOT import any repository.** Workers have no Prisma client — they use `src/workers/lib/postgrest-client.ts` for all DB reads/writes via PostgREST.

---

## Soft Delete — NEVER USE `.delete()`

Permanent deletion is forbidden. Every delete operation MUST use `.update({ deleted_at: new Date() })`.

```typescript
// ✅ CORRECT — soft delete
await prisma.someModel.update({
  where: { id },
  data: { deleted_at: new Date() },
});

// ❌ FORBIDDEN — hard delete
await prisma.someModel.delete({ where: { id } });
await prisma.someModel.deleteMany({ where: { tenant_id: id } });
```

**All reads must filter out soft-deleted rows** (unless the caller is an admin restore path):

```typescript
// ✅ Always include this filter for user-facing queries
where: { id, deleted_at: null }
```

**Known gap — [ARCH-10]**: Not every table has `deleted_at` wired yet. Tables confirmed to have the column: `tasks`, `executions`, `archetypes`, `tenants`, `tenant_integrations`, `tenant_secrets`. Tables that still lack it: `PendingApproval`, `EmployeeRule`, `FeedbackEvent`, `TaskMetric`. Do not assume soft-delete is universally enforced — check the schema before adding a `deleted_at: null` filter to avoid a runtime error.

---

## Schema Changes (Migrations)

**The full checklist after any `prisma migrate dev` or `prisma migrate deploy`:**

1. Run the migration: `pnpm prisma migrate dev --name <descriptive-name>`
2. Reload PostgREST schema cache: `psql ... -c "NOTIFY pgrst, 'reload schema';"`
3. Verify table visible via PostgREST curl (see above)
4. If the new table needs PostgREST row-level security policies, add them in the migration SQL
5. Update `src/workers/lib/postgrest-types.ts` if workers need typed access to the new table (8 snake_case row interfaces live there)

**Do NOT use `DATABASE_URL` (6543 pooler) for migrations** — use `DATABASE_URL_DIRECT` (5432). The pooler may reject DDL statements.

---

## Seed Pattern — Idempotent Upserts

`prisma/seed.ts` must be safe to re-run any number of times. Use `upsert`, never `create`:

```typescript
// ✅ Idempotent — safe to re-run
await prisma.tenant.upsert({
  where: { id: KNOWN_UUID },
  create: { id: KNOWN_UUID, name: 'Acme', slug: 'acme', status: 'active' },
  update: { name: 'Acme', status: 'active' },
});

// ❌ Fails on second run with unique-constraint error
await prisma.tenant.create({ data: { id: KNOWN_UUID, name: 'Acme', slug: 'acme' } });
```

After any seed edit: `pnpm prisma db seed` (idempotent, does not wipe data).

**Before re-seeding or running `pnpm setup` on a live DB**: dump the database first. Seeding silently overwrites archetype rows. See the Database Backup section in AGENTS.md for the full backup commands.

---

## Common Mistakes

| Don't                                                  | Do Instead                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Write raw `prisma.task.findFirst()` in a route handler | Use `TaskRepository.findById()` from `src/repositories/`                   |
| Verify a new table with only `psql`                    | Also `curl` PostgREST to confirm the schema cache is refreshed             |
| Skip `NOTIFY pgrst, 'reload schema'` after migration   | Always notify — workers will see PGRST205 otherwise                        |
| Use `.delete()` or `.deleteMany()`                     | Use `.update({ deleted_at: new Date() })`                                  |
| Assume `deleted_at` filter is safe on every table      | Check schema — some tables don't have the column yet (see [ARCH-10] above) |
| Use `create` in seed files                             | Use `upsert` with a stable `where` clause                                  |
| Import repositories in worker container code           | Workers use `src/workers/lib/postgrest-client.ts` only                     |
| Use `DATABASE_URL` (pooler port 6543) for migrations   | Use `DATABASE_URL_DIRECT` (port 5432)                                      |
| Add write methods to `TaskRepository`                  | Tasks are mutated only by the Inngest lifecycle — repository is read-only  |

---

## Cross-References

- `src/repositories/` — all 6 repository modules (read the headers for ownership context)
- `src/workers/lib/postgrest-client.ts` — PostgREST client used by worker containers
- `src/workers/lib/postgrest-types.ts` — 8 typed row interfaces for PostgREST reads/writes
- `prisma/schema.prisma` — single source of truth for table structure
- `prisma/seed.ts` — canonical upsert pattern reference
- `data-access-conventions` skill — full data-access convention set (repository contracts, PostgREST write patterns, multi-tenancy invariants)
