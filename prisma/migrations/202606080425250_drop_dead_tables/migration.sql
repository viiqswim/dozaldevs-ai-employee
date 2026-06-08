-- DropForeignKey
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_agent_version_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_task_id_fkey";

-- DropForeignKey
ALTER TABLE "clarifications" DROP CONSTRAINT "clarifications_task_id_fkey";

-- DropForeignKey
ALTER TABLE "cross_dept_triggers" DROP CONSTRAINT "cross_dept_triggers_source_task_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_agent_version_id_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_deliverable_id_fkey";

-- DropForeignKey
ALTER TABLE "validation_runs" DROP CONSTRAINT "validation_runs_execution_id_fkey";

-- DropTable
DROP TABLE "audit_log";

-- DropTable
DROP TABLE "clarifications";

-- DropTable
DROP TABLE "cross_dept_triggers";

-- DropTable
DROP TABLE "reviews";

-- DropTable
DROP TABLE "validation_runs";
