-- AlterTable
ALTER TABLE "archetypes" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "feedback" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "knowledge_bases" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- CHECK constraint on tasks.status (§13 — all valid status values)
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'Received', 'Triaging', 'AwaitingInput', 'Ready', 'Executing',
    'Validating', 'Submitting', 'Reviewing', 'Approved', 'Delivering',
    'Done', 'Cancelled', 'Stale'
  ));

-- CHECK constraint on task_status_log.actor (§13 + 'machine' for Phase 6 compat)
ALTER TABLE task_status_log ADD CONSTRAINT task_status_log_actor_check
  CHECK (actor IN ('gateway', 'lifecycle_fn', 'watchdog', 'machine', 'manual'));
