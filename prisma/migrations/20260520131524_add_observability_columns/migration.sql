-- AlterTable
ALTER TABLE "executions" ADD COLUMN     "session_transcript" JSONB;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "failure_code" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3);
