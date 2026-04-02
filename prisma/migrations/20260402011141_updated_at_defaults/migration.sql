-- Add DB-side defaults for updated_at columns
-- Prisma @updatedAt is application-layer only; PostgREST direct inserts
-- fail with 23502 (not_null_violation) without a DB-side default.

ALTER TABLE "tasks"       ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "executions"  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "projects"    ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
