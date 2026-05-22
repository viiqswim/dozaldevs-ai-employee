-- AlterTable
ALTER TABLE "archetypes" ADD COLUMN     "estimated_manual_minutes" INTEGER,
ADD COLUMN     "estimated_manual_minutes_override" INTEGER;

-- CreateTable
CREATE TABLE "task_metrics" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "archetype_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "minutes_saved" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_metrics_task_id_key" ON "task_metrics"("task_id");

-- CreateIndex
CREATE INDEX "task_metrics_tenant_id_archetype_id_idx" ON "task_metrics"("tenant_id", "archetype_id");

-- AddForeignKey
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_metrics" ADD CONSTRAINT "task_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
