-- CreateTable
CREATE TABLE "pending_approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "thread_uid" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "slack_ts" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_approvals_tenant_id_idx" ON "pending_approvals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_approvals_tenant_id_thread_uid_key" ON "pending_approvals"("tenant_id", "thread_uid");

-- AddForeignKey
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grant PostgREST roles access to the new table
GRANT SELECT, INSERT, UPDATE, DELETE ON "pending_approvals" TO anon, authenticated;
