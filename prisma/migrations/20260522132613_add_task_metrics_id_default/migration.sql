-- Add DB-level default for task_metrics.id so PostgREST inserts work without Prisma Client
ALTER TABLE "task_metrics" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
NOTIFY pgrst, 'reload schema';
