# Learnings

## 2026-05-23 Session Start
- Plan: global-model-catalog-and-command
- Goal: make model_catalog tenant-free, move routes to /admin/model-catalog, create slash command

## Task 1 Complete — DB Backup + Migration + Seed Update
- Backup: `database-backups/2026-05-22-1954/` (full-dump.sql + model_catalog.sql)
- Migration file: `prisma/migrations/2026052219555900_make_model_catalog_global/migration.sql`
- Deduplication SQL added manually at top of migration (ctid-based DELETE)
- `prisma migrate dev` fails in non-interactive env — used `prisma migrate deploy` instead
- Rows after migration: 8 unique (was 13 with 6 tenant-scoped seed rows; rest were admin-added test models)
- `tenant_id` column dropped; unique constraint `model_catalog_model_id_key` on `model_id` alone
- No FK constraint to `tenants` table
- Seed upsert key changed from `tenant_id_model_id` compound to `model_id` alone
- Seed is idempotent: running `pnpm prisma db seed` a second time kept count at 8 (not 11)
- Prisma client regenerated via `pnpm prisma generate` after migration
