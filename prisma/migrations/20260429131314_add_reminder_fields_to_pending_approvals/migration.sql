-- AlterTable
ALTER TABLE "pending_approvals" ADD COLUMN     "guest_name" TEXT,
ADD COLUMN     "property_name" TEXT,
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3),
ADD COLUMN     "urgency" BOOLEAN NOT NULL DEFAULT false;
