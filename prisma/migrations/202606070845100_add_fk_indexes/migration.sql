-- Add indexes on hot-path foreign-key columns for query performance
-- ARCH-9: tasks.archetype_id, tasks.tenant_id, executions.task_id,
--         task_status_log.task_id, deliverables.execution_id

CREATE INDEX IF NOT EXISTS "tasks_archetype_id_idx" ON "tasks"("archetype_id");
CREATE INDEX IF NOT EXISTS "tasks_tenant_id_idx" ON "tasks"("tenant_id");
CREATE INDEX IF NOT EXISTS "executions_task_id_idx" ON "executions"("task_id");
CREATE INDEX IF NOT EXISTS "task_status_log_task_id_idx" ON "task_status_log"("task_id");
CREATE INDEX IF NOT EXISTS "deliverables_execution_id_idx" ON "deliverables"("execution_id");
