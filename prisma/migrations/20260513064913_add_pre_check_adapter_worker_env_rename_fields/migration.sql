-- AlterTable: archetypes — add new columns
ALTER TABLE "archetypes" ADD COLUMN "pre_check_adapter" TEXT;
ALTER TABLE "archetypes" ADD COLUMN "worker_env" JSONB;

-- AlterTable: pending_approvals — rename columns to employee-agnostic names
ALTER TABLE "pending_approvals" RENAME COLUMN "guest_name" TO "recipient_name";
ALTER TABLE "pending_approvals" RENAME COLUMN "property_name" TO "context_label";
