ALTER TABLE "validation_runs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "deliverables" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "task_status_log" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
