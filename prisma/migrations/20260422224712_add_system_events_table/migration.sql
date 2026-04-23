-- CreateTable
CREATE TABLE "system_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "issue_description" TEXT NOT NULL,
    "patch_applied" BOOLEAN NOT NULL DEFAULT false,
    "patch_diff" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "system_events" ADD CONSTRAINT "system_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
